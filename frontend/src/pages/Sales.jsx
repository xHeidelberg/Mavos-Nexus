import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApproverFields, Badge, Button, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, emptyApproval, useSubmit } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateTime, peso } from '../lib/format';

const REPLACE_KEY = 'mavos_replace_sale';

export default function Sales() {
  const { user } = useAuth();
  const [f, setF] = useState({ from: '', to: '', status: '', needs_review: false });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const query = { ...f, page, to: f.to ? new Date(new Date(f.to).getTime() + 86400000).toLocaleDateString('en-CA') : '' };
  const { data, loading, error, reload } = useAsync(() => api.get('/sales', { ...query, needs_review: f.needs_review ? 'true' : '' }), [JSON.stringify(query)]);
  const [exportErr, setExportErr] = useState(null);

  const exportCsv = () => api.download('/sales/export', { ...query, page: '', needs_review: f.needs_review ? 'true' : '' }, 'sales.csv').catch(setExportErr);
  const set = (patch) => { setF({ ...f, ...patch }); setPage(1); };

  return (
    <div>
      <PageHeader title="Sales history"
        sub={user.role === 'sales' ? 'Your sales from the last month.' : user.role === 'staff' ? 'Your sales and your team’s.' : 'All branches.'}
        actions={<Button variant="secondary" onClick={exportCsv}>Export CSV</Button>} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From"><Input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></Field>
        <Field label="To"><Input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></Field>
        <Field label="Status"><Select value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">All</option><option value="completed">Completed</option><option value="voided">Voided</option></Select></Field>
        {user.role !== 'sales' && (
          <label className="flex h-10 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.needs_review} onChange={(e) => set({ needs_review: e.target.checked })} /> Needs review only</label>
        )}
      </div>
      <ErrorNote error={error || exportErr} className="mb-3" />
      {loading ? <Spinner /> : !data?.data?.length ? <Empty title="No sales found" hint="Change the dates or filters, or make a sale in Point of sale." /> : (
        <>
          <Table>
            <thead><tr><Th>Receipt</Th><Th>Date</Th><Th>Branch</Th><Th>Cashier</Th><Th>Payment</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></thead>
            <tbody>
              {data.data.map((s) => (
                <tr key={s.id} className="cursor-pointer hover:bg-paper" onClick={() => setOpenId(s.id)}>
                  <Td className="font-semibold">{s.receipt_no}</Td><Td>{dateTime(s.sold_at)}</Td><Td>{s.branch?.name}</Td><Td>{s.cashier?.full_name}</Td>
                  <Td className="capitalize">{s.payment_method}</Td><Td className="text-right font-semibold">{peso(s.total)}</Td>
                  <Td>
                    <span className="flex gap-1">
                      {s.status === 'voided' ? <Badge tone="bad">Voided</Badge> : <Badge tone="good">Completed</Badge>}
                      {s.needs_review && <Badge tone="warn">Review</Badge>}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted">Page {data.current_page} of {data.last_page}</span>
            <span className="flex gap-2"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page >= data.last_page} onClick={() => setPage(page + 1)}>Next</Button></span>
          </div>
        </>
      )}
      {openId && <SaleDetail id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  );
}

function SaleDetail({ id, onClose, onChanged }) {
  const nav = useNavigate();
  const { data: sale, loading, error, reload } = useAsync(() => api.get(`/sales/${id}`), [id]);
  const [mode, setMode] = useState(null); // 'void' | 'exchange'

  const done = () => { setMode(null); reload(); onChanged(); };
  const reenter = () => {
    sessionStorage.setItem(REPLACE_KEY, JSON.stringify({
      sale_id: sale.id, receipt_no: sale.receipt_no,
      items: sale.items.map((i) => ({ variant_id: i.variant_id, qty: i.qty, unit_price: i.unit_price })),
    }));
    nav('/pos');
  };

  return (
    <Modal title={sale ? `Sale ${sale.receipt_no}` : 'Sale'} onClose={onClose} wide>
      {loading && <Spinner />}
      <ErrorNote error={error} />
      {sale && !mode && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {sale.status === 'voided' ? <Badge tone="bad">Voided</Badge> : <Badge tone="good">Completed</Badge>}
            {sale.needs_review && <Badge tone="warn">Needs review: {sale.review_reason}</Badge>}
            {sale.is_offline_sync && <Badge>Sent from offline queue</Badge>}
            <span className="text-muted">{dateTime(sale.sold_at)} · {sale.branch?.name} · {sale.cashier?.full_name}</span>
          </div>
          <Table>
            <thead><tr><Th>Item</Th><Th className="text-right">Qty</Th><Th className="text-right">Price</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>{sale.items.map((i) => (
              <tr key={i.id}><Td>{i.variant?.product?.name}{i.variant?.label ? ` (${i.variant.label})` : ''}</Td><Td className="text-right">{i.qty}</Td><Td className="text-right">{peso(i.unit_price)}</Td><Td className="text-right">{peso(i.line_total)}</Td></tr>
            ))}</tbody>
          </Table>
          <div className="ml-auto max-w-xs space-y-1 text-sm">
            {sale.discount_total > 0 && <div className="flex justify-between"><span className="text-muted">Discount</span><span>−{peso(sale.discount_total)}</span></div>}
            <div className="flex justify-between text-base font-bold"><span>Total</span><span>{peso(sale.total)}</span></div>
            <div className="flex justify-between text-muted"><span className="capitalize">{sale.payment_method}{sale.gcash_ref ? ` · ${sale.gcash_ref}` : ''}</span><span>{sale.customer?.name || ''}</span></div>
          </div>
          {sale.replaces && <p className="text-sm text-muted">This sale corrects voided sale #{sale.replaces.sale_id}.</p>}
          {sale.void && (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              Voided: {sale.void.reason}. Approved by {sale.void.approver?.username}.
              {sale.void.replacement_sale_id ? ` Corrected by sale #${sale.void.replacement_sale_id}.` : ''}
            </p>
          )}
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {sale.status === 'completed' && <Button variant="secondary" onClick={() => setMode('exchange')}>Exchange items</Button>}
            {sale.status === 'completed' && <Button variant="danger" onClick={() => setMode('void')}>Void sale</Button>}
            {sale.status === 'voided' && !sale.void?.replacement_sale_id && <Button onClick={reenter}>Re-enter corrected sale</Button>}
            <p className="basis-full text-xs text-muted">There are no refunds. A customer can exchange items for the same value or higher.</p>
          </div>
        </div>
      )}
      {sale && mode === 'void' && <VoidForm sale={sale} onCancel={() => setMode(null)} onDone={done} />}
      {sale && mode === 'exchange' && <ExchangeForm sale={sale} onCancel={() => setMode(null)} onDone={done} />}
    </Modal>
  );
}

function VoidForm({ sale, onCancel, onDone }) {
  const [reason, setReason] = useState('');
  const [ap, setAp] = useState(emptyApproval);
  const { busy, error, submit } = useSubmit(async () => { await api.post(`/sales/${sale.id}/void`, { reason, ...ap }); onDone(); }, 'Sale voided', { title: 'Void this sale?', message: `Sale ${sale.receipt_no} (${peso(sale.total)}) will be voided and its items returned to stock.`, confirmLabel: 'Void sale', danger: true });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <p className="text-sm">Voiding returns the items to stock. Total {peso(sale.total)}.</p>
      <Field label="Reason for voiding"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <ApproverFields value={ap} onChange={setAp} />
      <ErrorNote error={error} />
      <div className="flex gap-2"><Button variant="secondary" onClick={onCancel}>Back</Button>
        <Button variant="danger" type="submit" disabled={busy || reason.trim().length < 3 || ap.approver_pin.length !== 4 || !ap.approver_username}>{busy ? 'Voiding…' : 'Void sale'}</Button></div>
    </form>
  );
}

function ExchangeForm({ sale, onCancel, onDone }) {
  const { data: products } = useAsync(() => api.get('/products'), []);
  const variants = useMemo(() => (products || []).flatMap((p) => p.variants.map((v) => ({ ...v, product: p }))), [products]);
  const [ret, setRet] = useState({});            // sale_item_id -> qty
  const [given, setGiven] = useState([{ variant_id: '', qty: 1, unit_price: '' }]);
  const [pay, setPay] = useState({ payment_method: 'cash', gcash_ref: '' });
  const [ap, setAp] = useState(emptyApproval);

  const returnedValue = sale.items.reduce((s, i) => s + (ret[i.id] || 0) * i.unit_price, 0);
  const givenLines = given.map((g) => { const v = variants.find((x) => x.id === Number(g.variant_id)); return { ...g, v, price: g.unit_price === '' ? v?.selling_price : Number(g.unit_price) }; });
  const givenValue = givenLines.reduce((s, g) => s + (g.v ? g.price * g.qty : 0), 0);
  const diff = givenValue - returnedValue;
  const anyReturned = Object.values(ret).some((q) => q > 0);
  const anyGiven = givenLines.some((g) => g.v && g.qty > 0);
  const priceBad = givenLines.some((g) => g.v && (g.price < g.v.base_price || g.price > g.v.selling_price));

  const { busy, error, submit } = useSubmit(async () => {
    await api.post(`/sales/${sale.id}/exchange`, {
      returned: Object.entries(ret).filter(([, q]) => q > 0).map(([sale_item_id, qty]) => ({ sale_item_id: Number(sale_item_id), qty })),
      given: givenLines.filter((g) => g.v).map((g) => ({ variant_id: g.v.id, qty: Number(g.qty), unit_price: g.price })),
      ...(diff > 0 ? { payment_method: pay.payment_method, ...(pay.payment_method === 'gcash' ? { gcash_ref: pay.gcash_ref } : {}) } : {}),
      ...ap,
    });
    onDone();
  }, 'Exchange completed', { title: 'Complete this exchange?', message: 'Stock is updated and the customer pays any difference. There are no refunds.', confirmLabel: 'Complete exchange' });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div>
        <p className="mb-2 text-sm font-semibold">Items coming back</p>
        {sale.items.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm">
            <span>{i.variant?.product?.name}{i.variant?.label ? ` (${i.variant.label})` : ''} · {peso(i.unit_price)} each · bought {i.qty}</span>
            <Input type="number" min={0} max={i.qty} className="w-20" value={ret[i.id] ?? 0} onChange={(e) => setRet({ ...ret, [i.id]: Math.min(i.qty, Math.max(0, Number(e.target.value))) })} aria-label="Quantity returned" />
          </div>
        ))}
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Items going out</p>
        {given.map((g, n) => (
          <div key={n} className="mb-2 grid grid-cols-[1fr_70px_100px] gap-2">
            <Select value={g.variant_id} onChange={(e) => { const v = variants.find((x) => x.id === Number(e.target.value)); setGiven(given.map((x, k) => (k === n ? { ...x, variant_id: e.target.value, unit_price: v ? v.selling_price : '' } : x))); }} aria-label="Replacement item">
              <option value="">Choose item…</option>
              {variants.filter((v) => v.on_hand > 0).map((v) => <option key={v.id} value={v.id}>{v.product.name}{v.label ? ` (${v.label})` : ''} · {peso(v.selling_price)}</option>)}
            </Select>
            <Input type="number" min={1} value={g.qty} onChange={(e) => setGiven(given.map((x, k) => (k === n ? { ...x, qty: Number(e.target.value) } : x)))} aria-label="Quantity" />
            <Input type="number" step="0.01" value={g.unit_price} onChange={(e) => setGiven(given.map((x, k) => (k === n ? { ...x, unit_price: e.target.value } : x)))} aria-label="Price" />
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => setGiven([...given, { variant_id: '', qty: 1, unit_price: '' }])}>Add another item</Button>
        {priceBad && <p className="mt-2 text-sm text-danger">A price is below the lowest allowed or above the list price.</p>}
      </div>
      <div className="rounded-md bg-paper p-3 text-sm">
        <div className="flex justify-between"><span>Value coming back</span><b>{peso(returnedValue)}</b></div>
        <div className="flex justify-between"><span>Value going out</span><b>{peso(givenValue)}</b></div>
        <div className={`mt-1 flex justify-between text-base font-bold ${diff < 0 ? 'text-danger' : ''}`}>
          <span>{diff < 0 ? 'Not allowed: replacement is worth less' : diff > 0 ? 'Customer pays' : 'Even exchange'}</span>
          <span>{diff < 0 ? peso(-diff) : peso(diff)}</span>
        </div>
      </div>
      {diff > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid by"><Select value={pay.payment_method} onChange={(e) => setPay({ ...pay, payment_method: e.target.value })}><option value="cash">Cash</option><option value="gcash">GCash</option></Select></Field>
          {pay.payment_method === 'gcash' && <Field label="GCash reference"><Input value={pay.gcash_ref} onChange={(e) => setPay({ ...pay, gcash_ref: e.target.value })} /></Field>}
        </div>
      )}
      <ApproverFields value={ap} onChange={setAp} />
      <ErrorNote error={error} />
      <div className="flex gap-2"><Button variant="secondary" onClick={onCancel}>Back</Button>
        <Button type="submit" disabled={busy || !anyReturned || !anyGiven || diff < 0 || priceBad || ap.approver_pin.length !== 4 || !ap.approver_username || (diff > 0 && pay.payment_method === 'gcash' && pay.gcash_ref.trim().length < 4)}>{busy ? 'Saving…' : 'Complete exchange'}</Button></div>
    </form>
  );
}
