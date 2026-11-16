import { useMemo, useState } from 'react';
import { ApproverFields, Badge, Button, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table, Tabs, Td, Th, emptyApproval, useSubmit } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateOnly, dateTime } from '../lib/format';

export default function Stock() {
  const { user } = useAuth();
  const manager = user.role !== 'sales';
  const [tab, setTab] = useState('on_hand');
  const [branchId, setBranchId] = useState('');
  const [q, setQ] = useState('');
  const [receive, setReceive] = useState(false);
  const [adjust, setAdjust] = useState(null);
  const { data: branches } = useAsync(() => (user.role === 'admin' ? api.get('/branches') : Promise.resolve([])), []);
  const bq = { branch_id: branchId };
  const stock = useAsync(() => api.get('/stock', bq), [branchId]);
  const low = useAsync(() => api.get('/stock/low', bq), [branchId]);
  const expiring = useAsync(() => (manager ? api.get('/stock/expiring', bq) : Promise.resolve(null)), [branchId]);
  const moves = useAsync(() => (manager && tab === 'moves' ? api.get('/stock/movements', bq) : Promise.resolve(null)), [branchId, tab]);

  const reloadAll = () => { stock.reload(); low.reload(); expiring.reload(); };
  const rows = useMemo(() => (stock.data?.items || []).filter((r) => !q || `${r.product} ${r.label || ''} ${r.sku}`.toLowerCase().includes(q.toLowerCase())), [stock.data, q]);

  const tabs = [{ id: 'on_hand', label: 'On hand' }, { id: 'low', label: `Low stock${low.data?.length ? ` (${low.data.length})` : ''}` },
    ...(manager ? [{ id: 'expiring', label: `Expiring${expiring.data?.items?.length ? ` (${expiring.data.items.length})` : ''}` }, { id: 'moves', label: 'Movements' }] : [])];

  return (
    <div>
      <PageHeader title="Stock" sub="Each branch has its own count. Items that expire are sold earliest-expiry first."
        actions={<>
          {user.role === 'admin' && (
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} aria-label="Branch" className="w-52">
              <option value="">Main inventory</option>
              {(branches || []).filter((b) => !b.is_main).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )}
          {manager && <Button onClick={() => setReceive(true)}>Receive stock</Button>}
        </>} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <ErrorNote error={stock.error} className="mb-3" />

      {tab === 'on_hand' && (stock.loading ? <Spinner /> : (
        <>
          <Input className="mb-3 max-w-sm" placeholder="Search item or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
          {rows.length === 0 ? <Empty title="No items yet" hint="Add products first, then receive stock." /> : (
            <Table>
              <thead><tr><Th>Item</Th><Th>SKU</Th><Th>Category</Th><Th className="text-right">On hand</Th><Th>Batches</Th>{manager && <Th />}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.variant_id}>
                  <Td className="font-semibold">{r.product}{r.label ? ` (${r.label})` : ''}</Td><Td>{r.sku}</Td><Td>{r.category}</Td>
                  <Td className="text-right font-semibold">{r.on_hand <= r.low_stock_threshold ? <Badge tone={r.on_hand <= 0 ? 'bad' : 'warn'}>{r.on_hand}</Badge> : r.on_hand}</Td>
                  <Td className="text-muted">{r.batches.map((b) => `${b.batch_no}: ${b.quantity}${b.expiry_date ? ` (exp ${dateOnly(b.expiry_date)})` : ''}`).join(' · ') || '—'}</Td>
                  {manager && <Td><Button size="sm" variant="ghost" disabled={!r.batches.length} onClick={() => setAdjust(r)}>Adjust</Button></Td>}
                </tr>
              ))}</tbody>
            </Table>
          )}
        </>
      ))}

      {tab === 'low' && (low.loading ? <Spinner /> : !low.data?.length ? <Empty title="Nothing is running low" /> : (
        <Table><thead><tr><Th>Item</Th><Th>SKU</Th><Th className="text-right">On hand</Th><Th className="text-right">Alert at</Th></tr></thead>
          <tbody>{low.data.map((r) => <tr key={r.variant_id}><Td className="font-semibold">{r.product_name}{r.label ? ` (${r.label})` : ''}</Td><Td>{r.sku}</Td><Td className="text-right"><Badge tone={r.on_hand <= 0 ? 'bad' : 'warn'}>{r.on_hand}</Badge></Td><Td className="text-right">{r.low_stock_threshold}</Td></tr>)}</tbody></Table>
      ))}

      {tab === 'expiring' && (expiring.loading ? <Spinner /> : !expiring.data?.items?.length ? <Empty title={`Nothing expires in the next ${expiring.data?.within_days ?? 90} days`} /> : (
        <Table><thead><tr><Th>Item</Th><Th>Branch</Th><Th>Batch</Th><Th>Expires</Th><Th className="text-right">Days left</Th><Th className="text-right">Qty</Th></tr></thead>
          <tbody>{expiring.data.items.map((r, i) => (
            <tr key={i}><Td className="font-semibold">{r.product}{r.label ? ` (${r.label})` : ''}</Td><Td>{r.branch}</Td><Td>{r.batch_no}</Td><Td>{dateOnly(r.expiry_date)}</Td>
              <Td className="text-right"><Badge tone={r.days_left < 0 ? 'bad' : r.days_left < 30 ? 'warn' : 'neutral'}>{r.days_left < 0 ? 'Expired' : r.days_left}</Badge></Td><Td className="text-right">{r.quantity}</Td></tr>))}</tbody></Table>
      ))}

      {tab === 'moves' && (moves.loading ? <Spinner /> : !moves.data?.length ? <Empty title="No stock movements yet" /> : (
        <Table><thead><tr><Th>When</Th><Th>Item</Th><Th>Type</Th><Th className="text-right">Change</Th><Th>By</Th><Th>Note</Th></tr></thead>
          <tbody>{moves.data.map((m) => <tr key={m.id}><Td>{dateTime(m.created_at)}</Td><Td>{m.product}{m.label ? ` (${m.label})` : ''}</Td><Td>{m.movement_type.replace(/_/g, ' ')}</Td>
            <Td className={`text-right font-semibold ${m.qty_change < 0 ? 'text-danger' : 'text-ledger'}`}>{m.qty_change > 0 ? `+${m.qty_change}` : m.qty_change}</Td><Td>{m.username}</Td><Td className="text-muted">{m.note}</Td></tr>)}</tbody></Table>
      ))}

      {receive && <ReceiveForm branchId={branchId} onClose={() => setReceive(false)} onDone={() => { setReceive(false); reloadAll(); }} />}
      {adjust && <AdjustForm row={adjust} branchId={branchId} onClose={() => setAdjust(null)} onDone={() => { setAdjust(null); reloadAll(); }} />}
    </div>
  );
}

function ReceiveForm({ branchId, onClose, onDone }) {
  const { user } = useAuth();
  const { data: products } = useAsync(() => api.get('/products'), []);
  const { data: suppliers } = useAsync(() => api.get('/suppliers'), []);
  const variants = useMemo(() => (products || []).flatMap((p) => p.variants.map((v) => ({ ...v, product: p }))), [products]);
  const [f, setF] = useState({ variant_id: '', supplier_id: '', qty: '', batch_no: '', expiry_date: '' });
  const v = variants.find((x) => x.id === Number(f.variant_id));
  const tracks = v?.product.tracks_expiry_effective;
  const months = v?.product.shelf_life_months_effective;
  const { busy, error, submit } = useSubmit(async () => {
    await api.post('/stock/receive', {
      variant_id: Number(f.variant_id), qty: Number(f.qty),
      ...(f.supplier_id ? { supplier_id: Number(f.supplier_id) } : {}), ...(f.batch_no ? { batch_no: f.batch_no } : {}),
      ...(tracks && f.expiry_date ? { expiry_date: f.expiry_date } : {}),
      ...(user.role === 'admin' && branchId ? { branch_id: Number(branchId) } : {}),
    });
    onDone();
  }, 'Stock received', { title: 'Receive this stock?', message: 'It will be added to the branch’s stock count.', confirmLabel: 'Receive stock' });
  return (
    <Modal title="Receive stock" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Item"><Select value={f.variant_id} onChange={(e) => setF({ ...f, variant_id: e.target.value })}>
          <option value="">Choose item…</option>{variants.map((x) => <option key={x.id} value={x.id}>{x.product.name}{x.label ? ` (${x.label})` : ''} · {x.sku}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity"><Input type="number" min={1} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
          <Field label="Supplier (optional)"><Select value={f.supplier_id} onChange={(e) => setF({ ...f, supplier_id: e.target.value })}><option value="">None</option>{(suppliers || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        </div>
        <Field label="Batch number (optional)" hint="Leave empty to generate one."><Input value={f.batch_no} onChange={(e) => setF({ ...f, batch_no: e.target.value })} /></Field>
        {tracks && (
          <Field label="Expiry date" hint={months ? `Leave empty to use ${months} months from today.` : 'Required for this item.'}>
            <Input type="date" value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} /></Field>
        )}
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !f.variant_id || !(Number(f.qty) > 0)}>{busy ? 'Saving…' : 'Receive stock'}</Button></div>
      </form>
    </Modal>
  );
}

function AdjustForm({ row, branchId, onClose, onDone }) {
  const { user } = useAuth();
  const [f, setF] = useState({ batch_id: String(row.batches[0].batch_id), qty_change: '', reason: '' });
  const [ap, setAp] = useState(emptyApproval);
  const { busy, error, submit } = useSubmit(async () => {
    await api.post('/stock/adjustments', { variant_id: row.variant_id, batch_id: Number(f.batch_id), qty_change: Number(f.qty_change), reason: f.reason, ...ap,
      ...(user.role === 'admin' && branchId ? { branch_id: Number(branchId) } : {}) });
    onDone();
  }, 'Adjustment saved', { title: 'Save this stock adjustment?', message: 'This changes the stock count and is recorded under the approver’s name.', confirmLabel: 'Save adjustment', danger: true });
  return (
    <Modal title={`Adjust ${row.product}${row.label ? ` (${row.label})` : ''}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Batch"><Select value={f.batch_id} onChange={(e) => setF({ ...f, batch_id: e.target.value })}>
          {row.batches.map((b) => <option key={b.batch_id} value={b.batch_id}>{b.batch_no} · {b.quantity} on hand{b.expiry_date ? ` · exp ${dateOnly(b.expiry_date)}` : ''}</option>)}</Select></Field>
        <Field label="Change in quantity" hint="Use a minus for damaged or lost items, e.g. -2."><Input type="number" value={f.qty_change} onChange={(e) => setF({ ...f, qty_change: e.target.value })} /></Field>
        <Field label="Reason"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <ApproverFields value={ap} onChange={setAp} />
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !Number(f.qty_change) || f.reason.trim().length < 3 || ap.approver_pin.length !== 4 || !ap.approver_username}>{busy ? 'Saving…' : 'Save adjustment'}</Button></div>
      </form>
    </Modal>
  );
}
