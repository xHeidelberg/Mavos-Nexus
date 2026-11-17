import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { Badge, Button, ErrorNote, Field, Input, Modal, Select, Spinner, cx } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { dateTime, peso, uuid } from '../lib/format';
import { cacheProducts, cachedProducts, enqueue } from '../lib/offlineQueue';
import { confirm } from '../lib/toast';

const REPLACE_KEY = 'mavos_replace_sale';

export default function Pos() {
  const nav = useNavigate();
  const [products, setProducts] = useState(cachedProducts() || []);
  const [loading, setLoading] = useState(!cachedProducts());
  const [stale, setStale] = useState(false);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [cart, setCart] = useState([]);
  const [payment, setPayment] = useState('cash');
  const [tendered, setTendered] = useState('');
  const [gcashRef, setGcashRef] = useState('');
  const [customer, setCustomer] = useState(null);
  const [replace, setReplace] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [showCustomer, setShowCustomer] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [bump, setBump] = useState(0);
  const searchRef = useRef(null);

  const load = async () => {
    try {
      const [p, c] = await Promise.all([api.get('/products'), api.get('/categories')]);
      setProducts(p); setCategories(c); cacheProducts(p); setStale(false);
    } catch (e) {
      if (e.isNetwork && cachedProducts()) setStale(true); else setError(e);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = useMemo(() => products.flatMap((p) => p.variants.map((v) => ({ ...v, product: p }))), [products]);

  // Corrected re-entry of a voided sale (set by Sales history).
  useEffect(() => {
    if (!items.length) return;
    const raw = sessionStorage.getItem(REPLACE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(REPLACE_KEY);
    const r = JSON.parse(raw);
    setReplace(r);
    setCart(r.items.map((i) => {
      const v = items.find((x) => x.id === i.variant_id);
      return v ? { variant: v, qty: i.qty, price: Math.min(Math.max(i.unit_price, v.base_price), v.selling_price) } : null;
    }).filter(Boolean));
  }, [items]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((v) =>
      (!cat || String(v.product.category_id) === cat) &&
      (!s || `${v.product.name} ${v.label || ''} ${v.sku} ${v.product.brand || ''}`.toLowerCase().includes(s) || v.barcode === q.trim()));
  }, [items, q, cat]);

  const add = (v) => { setBump((n) => n + 1); addLine(v); };
  const addLine = (v) => setCart((c) => {
    const i = c.findIndex((l) => l.variant.id === v.id);
    if (i >= 0) return c.map((l, n) => (n === i ? { ...l, qty: l.qty + 1 } : l));
    return [...c, { variant: v, qty: 1, price: v.selling_price }];
  });
  const setLine = (id, patch) => setCart((c) => c.map((l) => (l.variant.id === id ? { ...l, ...patch } : l)));
  const remove = (id) => setCart((c) => c.filter((l) => l.variant.id !== id));

  // Scanner-friendly: Enter on an exact barcode/SKU adds that item.
  const onSearchKey = (e) => {
    if (e.key !== 'Enter') return;
    const code = q.trim();
    const hit = items.find((v) => v.barcode === code || v.sku.toLowerCase() === code.toLowerCase());
    if (hit) { add(hit); setQ(''); }
  };

  const subtotal = cart.reduce((s, l) => s + l.variant.selling_price * l.qty, 0);
  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const discount = subtotal - total;
  const tenderedNum = tendered === '' ? total : Number(tendered);
  const change = payment === 'cash' ? tenderedNum - total : 0;
  const priceBad = cart.some((l) => l.price < l.variant.base_price - 0.001 || l.price > l.variant.selling_price + 0.001 || !(l.qty > 0));
  const overStock = cart.some((l) => l.qty > l.variant.on_hand);
  const canPay = cart.length && !priceBad && (payment === 'cash' ? tenderedNum >= total : gcashRef.trim().length >= 4);

  const reset = () => { setCart([]); setTendered(''); setGcashRef(''); setCustomer(null); setReplace(null); setError(null); setCartOpen(false); };

  const complete = async () => {
    const ok = await confirm({
      title: 'Complete this sale?',
      message: `${cart.reduce((s, l) => s + l.qty, 0)} item(s) · ${peso(total)} · ${payment === 'cash' ? `change ${peso(Math.max(change, 0))}` : 'paid by GCash'}`,
      confirmLabel: 'Complete sale',
    });
    if (!ok) return;
    setBusy(true); setError(null);
    const payload = {
      client_uuid: uuid(),
      device_created_at: new Date().toISOString(),
      device_info: navigator.userAgent.slice(0, 120),
      payment_method: payment,
      ...(payment === 'gcash' ? { gcash_ref: gcashRef.trim() } : { amount_tendered: tenderedNum }),
      ...(customer ? { customer_id: customer.id } : {}),
      ...(replace ? { replaces_sale_id: replace.sale_id } : {}),
      items: cart.map((l) => ({ variant_id: l.variant.id, qty: l.qty, unit_price: l.price })),
    };
    const lines = cart.map((l) => ({ name: `${l.variant.product.name}${l.variant.label ? ` (${l.variant.label})` : ''}`, qty: l.qty, price: l.price }));
    try {
      const sale = await api.post('/sales', payload);
      setReceipt({ sale, lines, pending: false });
      reset(); load();
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) {
        // No internet: keep the sale on this device and send it when we are back online.
        enqueue(payload, { total, lines: lines.length });
        setReceipt({ pending: true, lines, total, payment, change, at: payload.device_created_at });
        reset();
      } else setError(e);
    } finally { setBusy(false); }
  };

  if (loading) return <Spinner label="Loading products" />;

  const ticket = (
    <div className="flex h-full flex-col rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="text-lg font-semibold">Current sale</h2>
        {cart.length > 0 && <button className="text-sm font-semibold text-danger" onClick={reset}>Clear</button>}
      </div>
      {replace && (
        <p className="mx-4 mt-2 rounded-md bg-caution-soft px-3 py-2 text-sm text-caution">
          Correcting voided sale <b>{replace.receipt_no}</b>. The new sale will be linked to it.
          <button className="ml-2 underline" onClick={reset}>Cancel</button>
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {cart.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Tap an item to add it to the sale.</p>
        ) : cart.map((l) => (
          <div key={l.variant.id} className="rule py-3 first:border-t-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{l.variant.product.name}</p>
                {l.variant.label && <p className="text-sm text-muted">{l.variant.label}</p>}
              </div>
              <button onClick={() => remove(l.variant.id)} className="text-sm text-muted hover:text-danger" aria-label="Remove item">Remove</button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex items-center rounded-md border border-line">
                <button className="h-9 w-9 text-lg" onClick={() => setLine(l.variant.id, { qty: Math.max(1, l.qty - 1) })} aria-label="Less">−</button>
                <input aria-label="Quantity" className="h-9 w-12 border-x border-line text-center outline-none" inputMode="numeric" value={l.qty}
                  onChange={(e) => setLine(l.variant.id, { qty: Math.max(0, parseInt(e.target.value || '0', 10)) })} />
                <button className="h-9 w-9 text-lg" onClick={() => setLine(l.variant.id, { qty: l.qty + 1 })} aria-label="More">+</button>
              </div>
              <span className="text-muted">×</span>
              <input aria-label="Price" type="number" step="0.01" value={l.price}
                onChange={(e) => setLine(l.variant.id, { price: Number(e.target.value) })}
                className={cx('h-9 w-24 rounded-md border px-2 outline-none focus:ring-2 focus:ring-ledger/20', l.price < l.variant.base_price || l.price > l.variant.selling_price ? 'border-danger' : 'border-line')} />
              <span className="ml-auto font-semibold">{peso(l.price * l.qty)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              List {peso(l.variant.selling_price)} · lowest {peso(l.variant.base_price)}
              {l.qty > l.variant.on_hand && <span className="ml-2 font-semibold text-caution">Only {l.variant.on_hand} in stock</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="rule space-y-3 px-4 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Customer</span>
          {customer ? <span className="font-semibold">{customer.name} <button className="ml-1 text-muted underline" onClick={() => setCustomer(null)}>remove</button></span>
            : <button className="font-semibold text-ledger underline" onClick={() => setShowCustomer(true)}>Add customer for loyalty</button>}
        </div>
        {discount > 0.001 && <div className="flex justify-between text-sm"><span className="text-muted">Discount</span><span>−{peso(discount)}</span></div>}
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">Total</span>
          <span className="font-display text-3xl font-bold">{peso(total)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Payment method">
          {['cash', 'gcash'].map((m) => (
            <button key={m} onClick={() => setPayment(m)} aria-pressed={payment === m}
              className={cx('h-11 rounded-md border font-semibold', payment === m ? 'border-ledger bg-ledger-soft text-ledger-dark' : 'border-line bg-surface')}>
              {m === 'cash' ? 'Cash' : 'GCash'}
            </button>
          ))}
        </div>

        {payment === 'cash' ? (
          <div>
            <Field label="Cash received">
              <Input type="number" inputMode="decimal" placeholder={String(total || '')} value={tendered} onChange={(e) => setTendered(e.target.value)} />
            </Field>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button className="rounded border border-line px-2.5 py-1 text-sm" onClick={() => setTendered(String(total))}>Exact</button>
              {[100, 500, 1000].filter((n) => n >= total).slice(0, 3).map((n) => (
                <button key={n} className="rounded border border-line px-2.5 py-1 text-sm" onClick={() => setTendered(String(n))}>{peso(n)}</button>
              ))}
            </div>
            <p className={cx('mt-2 text-sm font-semibold', change < 0 ? 'text-danger' : 'text-ledger')}>
              {change < 0 ? `Short by ${peso(-change)}` : `Change ${peso(change)}`}
            </p>
          </div>
        ) : (
          <Field label="GCash reference number" hint="Type it from the customer’s receipt screen.">
            <Input inputMode="numeric" value={gcashRef} onChange={(e) => setGcashRef(e.target.value)} />
          </Field>
        )}

        <ErrorNote error={error} />
        {overStock && <p className="text-xs text-caution">Some items are above the stock we show. The sale may be rejected.</p>}
        <Button size="lg" className="w-full" disabled={!canPay || busy} onClick={complete}>{busy ? 'Saving…' : `Complete sale · ${peso(total)}`}</Button>
      </div>
    </div>
  );

  return (
    <div className="grid h-full gap-4 lg:grid-cols-[1fr_380px]">
      <div className="flex min-h-0 flex-col">
        {stale && <p className="mb-3 rounded-md bg-caution-soft px-3 py-2 text-sm text-caution">You’re offline. Showing the last saved products; stock counts may be out of date. Sales will be sent when you’re back online.</p>}
        <div className="mb-3 flex flex-wrap gap-2">
          <Input ref={searchRef} className="min-w-48 flex-1" placeholder="Search or scan a barcode  (press / to focus)" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} />
          <Select className="w-44" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2.5 overflow-y-auto pb-28 pt-1 md:grid-cols-3 md:pb-24 lg:grid-cols-2 lg:pb-1 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.length === 0 && <p className="col-span-full py-10 text-center text-sm text-muted">No items match. Try another name or SKU.</p>}
          {visible.map((v) => {
            const inCart = cart.find((l) => l.variant.id === v.id)?.qty || 0;
            const hue = (v.product.category_id * 67) % 360;
            return (
              <button key={v.id} onClick={() => add(v)} disabled={v.on_hand <= 0 && !stale}
                className={cx('relative flex flex-col rounded-xl border bg-surface p-3 text-left transition-all hover:shadow-sm active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
                  inCart ? 'border-ledger ring-2 ring-ledger/20' : 'border-line hover:border-ledger')}>
                {inCart > 0 && <span key={inCart} className="animate-bump absolute -right-1.5 -top-1.5 grid min-w-6 place-items-center rounded-full bg-ledger px-1.5 py-0.5 text-xs font-bold text-on-ledger shadow">{inCart}</span>}
                <span style={{ background: `hsl(${hue} 55% 50% / .16)` }} className="mb-2 grid size-9 place-items-center rounded-lg text-sm font-bold">{v.product.name.slice(0, 1).toUpperCase()}</span>
                <p className="font-semibold leading-snug">{v.product.name}</p>
                <p className="min-h-5 text-sm text-muted">{v.label || v.product.brand || ' '}</p>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-1">
                  <span className="font-display text-lg font-bold">{peso(v.selling_price)}</span>
                  {v.on_hand <= 0 ? <Badge tone="bad">Out of stock</Badge>
                    : v.on_hand <= v.low_stock_threshold ? <Badge tone="warn">{v.on_hand} left</Badge>
                      : <span className="text-xs text-muted">{v.on_hand} in stock</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="hidden min-h-0 lg:block">{ticket}</div>

      {/* Phone / small tablet: floating bar opens the ticket */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface/95 p-3 backdrop-blur md:bottom-0 md:left-[72px] lg:hidden">
        <Button size="lg" className="w-full" onClick={() => setCartOpen(true)}>
          <Icon name="cart" />{cart.length ? <><span key={bump} className="animate-bump inline-block">{cart.reduce((s, l) => s + l.qty, 0)} items</span><span>· {peso(total)}</span></> : 'Current sale (empty)'}
        </Button>
      </div>
      {cartOpen && <Modal title="Current sale" onClose={() => setCartOpen(false)}><div className="-mx-5 -my-4">{ticket}</div></Modal>}

      {showCustomer && <CustomerPicker onClose={() => setShowCustomer(false)} onPick={(c) => { setCustomer(c); setShowCustomer(false); }} />}
      {receipt && <Receipt r={receipt} onClose={() => setReceipt(null)} onSales={() => nav('/sales')} />}
    </div>
  );
}

function CustomerPicker({ onClose, onPick }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name: '', contact_number: '' });
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (q.trim().length < 2) { setList([]); return undefined; }
    const t = setTimeout(() => api.get('/customers', { q }).then(setList).catch(setErr), 250);
    return () => clearTimeout(t);
  }, [q]);
  const create = async () => {
    setErr(null);
    if (!(await confirm({ title: 'Add this customer?', message: `${form.name}${form.contact_number ? ` · ${form.contact_number}` : ''} will be saved so they can earn loyalty points.`, confirmLabel: 'Add customer' }))) return;
    try { onPick(await api.post('/customers', { name: form.name, contact_number: form.contact_number || undefined })); } catch (e) { setErr(e); }
  };
  return (
    <Modal title="Customer" onClose={onClose}>
      <Field label="Find by name or phone number"><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      <ul className="mt-2 divide-y divide-line rounded-md border border-line">
        {list.map((c) => (
          <li key={c.id}><button className="flex w-full justify-between px-3 py-2 text-left hover:bg-paper" onClick={() => onPick(c)}>
            <span>{c.name} <span className="text-muted">{c.contact_number}</span></span><Badge tone="good">{c.loyalty_points} pts</Badge>
          </button></li>
        ))}
        {q.trim().length >= 2 && list.length === 0 && <li className="px-3 py-2 text-sm text-muted">No match. Add them below.</li>}
      </ul>
      <div className="rule mt-4 pt-4">
        <p className="mb-2 text-sm font-semibold">New customer</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Phone number"><Input inputMode="tel" value={form.contact_number} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} /></Field>
        </div>
        <ErrorNote error={err} className="mt-3" />
        <Button className="mt-3" disabled={!form.name.trim()} onClick={create}>Save and use</Button>
      </div>
    </Modal>
  );
}

function Receipt({ r, onClose, onSales }) {
  const sale = r.sale;
  const lines = sale ? sale.items.map((i) => ({ name: `${i.variant?.product?.name ?? ''}${i.variant?.label ? ` (${i.variant.label})` : ''}`, qty: i.qty, price: i.unit_price })) : r.lines;
  const total = sale ? sale.total : r.total;
  return (
    <Modal title={r.pending ? 'Saved on this device' : 'Sale complete'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={() => window.print()}>Print receipt</Button><Button variant="secondary" onClick={onSales}>Sales history</Button><Button onClick={onClose}>New sale</Button></>}>
      {r.pending && <p className="mb-3 rounded-md bg-caution-soft px-3 py-2 text-sm text-caution">No internet. This sale is saved here and will be sent automatically when you’re back online. The official receipt number is assigned then.</p>}
      <div id="receipt" className="mx-auto max-w-xs text-sm">
        <p className="text-center font-display text-lg font-bold">Mavos</p>
        <p className="text-center text-muted">{sale ? sale.branch?.name : ''}</p>
        <p className="mt-1 text-center font-semibold">{sale ? sale.receipt_no : 'Receipt number pending'}</p>
        <p className="text-center text-muted">{dateTime(sale ? sale.sold_at : r.at)}</p>
        <div className="rule my-3" />
        {lines.map((l, i) => (
          <div key={i} className="flex justify-between gap-2 py-0.5"><span>{l.qty} × {l.name}</span><span>{peso(l.qty * l.price)}</span></div>
        ))}
        <div className="rule my-3" />
        <div className="flex justify-between text-base font-bold"><span>Total</span><span>{peso(total)}</span></div>
        <p className="mt-1 text-muted">Paid by {(sale ? sale.payment_method : r.payment) === 'gcash' ? `GCash${sale?.gcash_ref ? ` · ${sale.gcash_ref}` : ''}` : 'cash'}</p>
        {(sale ? sale.change_given : r.change) > 0 && <p className="text-muted">Change {peso(sale ? sale.change_given : r.change)}</p>}
        <p className="mt-3 text-center text-muted">Thank you!</p>
      </div>
    </Modal>
  );
}
