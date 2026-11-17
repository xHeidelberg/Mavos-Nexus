import { useMemo, useState } from 'react';
import { Badge, Button, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, useSubmit } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateTime } from '../lib/format';
import { confirm } from '../lib/toast';

const TONE = { in_transit: 'warn', received: 'good', cancelled: 'bad' };
const LABEL = { in_transit: 'On the way', received: 'Received', cancelled: 'Cancelled' };

export default function Transfers() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(() => api.get('/stock/transfers'), []);
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState(null);
  const [actErr, setActErr] = useState(null);

  const cancel = async (t) => {
    if (!(await confirm({ title: 'Cancel this transfer?', message: `${t.transfer_no} will be cancelled and the stock goes back to ${t.from_name}.`, confirmLabel: 'Cancel transfer', danger: true }))) return;
    try { await api.post(`/stock/transfers/${t.id}/cancel`); reload(); } catch (e) { setActErr(e); }
  };

  return (
    <div>
      <PageHeader title="Transfers" sub="Stock leaves the sender right away and is added to the branch only after they confirm what arrived."
        actions={user.role === 'admin' && <Button onClick={() => setCreating(true)}>New transfer</Button>} />
      <ErrorNote error={error || actErr} className="mb-3" />
      {loading ? <Spinner /> : !data?.length ? <Empty title="No transfers yet" hint={user.role === 'admin' ? 'Create one to send stock from the main inventory to a branch.' : 'Transfers sent to your branch will show up here.'} /> : (
        <div className="space-y-3">
          {data.map((t) => (
            <div key={t.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{t.transfer_no} <Badge tone={TONE[t.status]}>{LABEL[t.status]}</Badge> {t.has_discrepancy && <Badge tone="warn">Quantities differ</Badge>}</p>
                  <p className="text-sm text-muted">{t.from_name} → {t.to_name} · {dateTime(t.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  {t.status === 'in_transit' && (user.role === 'admin' || user.branch_id === t.to_branch_id) && <Button size="sm" onClick={() => setReceiving(t)}>Confirm received</Button>}
                  {t.status === 'in_transit' && user.role === 'admin' && <Button size="sm" variant="secondary" onClick={() => cancel(t)}>Cancel</Button>}
                </div>
              </div>
              <ul className="mt-3 divide-y divide-line text-sm">
                {t.items.map((i) => (
                  <li key={i.id} className="flex justify-between py-1.5"><span>{i.product}{i.label ? ` (${i.label})` : ''} <span className="text-muted">· batch {i.batch_no}</span></span>
                    <span>{i.received_qty != null && i.received_qty !== i.qty ? <b className="text-caution">{i.received_qty} of {i.qty}</b> : i.qty}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {creating && <CreateTransfer onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      {receiving && <ReceiveTransfer t={receiving} onClose={() => setReceiving(null)} onDone={() => { setReceiving(null); reload(); }} />}
    </div>
  );
}

function CreateTransfer({ onClose, onDone }) {
  const { data: branches } = useAsync(() => api.get('/branches'), []);
  const { data: products } = useAsync(() => api.get('/products'), []); // admin: main inventory counts
  const variants = useMemo(() => (products || []).flatMap((p) => p.variants.map((v) => ({ ...v, product: p }))), [products]);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState([{ variant_id: '', qty: 1 }]);
  const { busy, error, submit } = useSubmit(async () => {
    await api.post('/stock/transfers', { to_branch_id: Number(to), note: note || undefined, items: rows.filter((r) => r.variant_id).map((r) => ({ variant_id: Number(r.variant_id), qty: Number(r.qty) })) });
    onDone();
  }, 'Transfer sent', { title: 'Send this stock?', message: 'The stock leaves the main inventory now and reaches the branch once they confirm.', confirmLabel: 'Send stock' });
  return (
    <Modal title="New transfer from main inventory" onClose={onClose} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Send to"><Select value={to} onChange={(e) => setTo(e.target.value)}><option value="">Choose branch…</option>{(branches || []).filter((b) => !b.is_main && b.is_active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        {rows.map((r, n) => (
          <div key={n} className="grid grid-cols-[1fr_90px] gap-2">
            <Select value={r.variant_id} onChange={(e) => setRows(rows.map((x, k) => (k === n ? { ...x, variant_id: e.target.value } : x)))} aria-label="Item">
              <option value="">Choose item…</option>{variants.filter((v) => v.on_hand > 0).map((v) => <option key={v.id} value={v.id}>{v.product.name}{v.label ? ` (${v.label})` : ''} · {v.on_hand} in main</option>)}</Select>
            <Input type="number" min={1} value={r.qty} onChange={(e) => setRows(rows.map((x, k) => (k === n ? { ...x, qty: e.target.value } : x)))} aria-label="Quantity" />
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => setRows([...rows, { variant_id: '', qty: 1 }])}>Add another item</Button>
        <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !to || !rows.some((r) => r.variant_id && Number(r.qty) > 0)}>{busy ? 'Sending…' : 'Send stock'}</Button></div>
      </form>
    </Modal>
  );
}

function ReceiveTransfer({ t, onClose, onDone }) {
  const [qty, setQty] = useState(Object.fromEntries(t.items.map((i) => [i.id, i.qty])));
  const { busy, error, submit } = useSubmit(async () => {
    await api.post(`/stock/transfers/${t.id}/receive`, { items: t.items.map((i) => ({ item_id: i.id, received_qty: Number(qty[i.id]) })) });
    onDone();
  }, 'Transfer confirmed', { title: 'Confirm what arrived?', message: 'The counts you entered are added to this branch’s stock. Differences are flagged to the admin.', confirmLabel: 'Confirm received' });
  return (
    <Modal title={`Confirm ${t.transfer_no}`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">Count what actually arrived. If a number is lower than what was sent, the transfer is flagged for the admin.</p>
      {t.items.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm">
          <span>{i.product}{i.label ? ` (${i.label})` : ''}<span className="block text-muted">Sent {i.qty}</span></span>
          <Input type="number" min={0} max={i.qty} className="w-24" value={qty[i.id]} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} aria-label="Received quantity" />
        </div>
      ))}
      <ErrorNote error={error} className="mt-3" />
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Confirm received'}</Button></div>
    </Modal>
  );
}
