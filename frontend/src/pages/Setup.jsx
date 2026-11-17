import { useState } from 'react';
import { Badge, Button, ErrorNote, Field, Input, Modal, PageHeader, Spinner, Table, Tabs, Td, Th, useSubmit } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';

export default function Setup() {
  const [tab, setTab] = useState('branches');
  return (
    <div>
      <PageHeader title="Setup" sub="Branches, product categories, suppliers and alert settings." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'branches', label: 'Branches' }, { id: 'categories', label: 'Categories' }, { id: 'suppliers', label: 'Suppliers' }, { id: 'settings', label: 'Alerts and loyalty' }]} />
      {tab === 'branches' && <Branches />}
      {tab === 'categories' && <Categories />}
      {tab === 'suppliers' && <Suppliers />}
      {tab === 'settings' && <Settings />}
    </div>
  );
}

function Branches() {
  const { data, loading, error, reload } = useAsync(() => api.get('/branches'), []);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: '', name: '', address: '' });
  const { busy, error: err, submit } = useSubmit(async () => { await api.post('/branches', f); setOpen(false); setF({ code: '', name: '', address: '' }); reload(); }, 'Branch added', { title: 'Add this branch?', message: `${f.name} (${f.code}) will be added.`, confirmLabel: 'Add branch' });
  return (
    <>
      <div className="mb-3"><Button onClick={() => setOpen(true)}>Add branch</Button></div>
      <ErrorNote error={error} className="mb-3" />
      {loading ? <Spinner /> : <Table><thead><tr><Th>Code</Th><Th>Name</Th><Th>Address</Th><Th>Status</Th></tr></thead>
        <tbody>{data.map((b) => <tr key={b.id}><Td className="font-semibold">{b.code}</Td><Td>{b.name} {b.is_main && <Badge tone="good">Main inventory</Badge>}</Td><Td className="text-muted">{b.address}</Td><Td>{b.is_active ? 'Active' : 'Closed'}</Td></tr>)}</tbody></Table>}
      {open && (
        <Modal title="Add branch" onClose={() => setOpen(false)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <Field label="Branch name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Short code" hint="Used at the start of receipt numbers, e.g. ANT-00000001."><Input maxLength={10} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Address (optional)"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <ErrorNote error={err} />
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || !f.name.trim() || f.code.length < 2}>{busy ? 'Saving…' : 'Save branch'}</Button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

function Categories() {
  const { data, loading, error, reload } = useAsync(() => api.get('/categories'), []);
  const [edit, setEdit] = useState(null);
  return (
    <>
      <p className="mb-3 max-w-2xl text-sm text-muted">A category tells the system how to treat its items: whether they expire (like vapes) and whether they come in sizes or colors (like apparel).</p>
      <div className="mb-3"><Button onClick={() => setEdit('new')}>Add category</Button></div>
      <ErrorNote error={error} className="mb-3" />
      {loading ? <Spinner /> : <Table><thead><tr><Th>Name</Th><Th>Expiry</Th><Th>Variants</Th><Th /></tr></thead>
        <tbody>{data.map((c) => <tr key={c.id}><Td className="font-semibold">{c.name}</Td>
          <Td>{c.tracks_expiry ? `Expires${c.default_shelf_life_months ? ` after ${c.default_shelf_life_months} months` : ''}` : 'No expiry'}</Td>
          <Td>{c.has_variants ? (c.variant_options || []).join(', ') || 'Yes' : 'No'}</Td><Td><Button size="sm" variant="ghost" onClick={() => setEdit(c)}>Edit</Button></Td></tr>)}</tbody></Table>}
      {edit && <CategoryForm cat={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function CategoryForm({ cat, onClose, onDone }) {
  const [f, setF] = useState(cat ? { name: cat.name, tracks_expiry: cat.tracks_expiry, months: cat.default_shelf_life_months || '', has_variants: cat.has_variants, options: (cat.variant_options || []).join(', ') }
    : { name: '', tracks_expiry: false, months: '', has_variants: false, options: '' });
  const { busy, error, submit } = useSubmit(async () => {
    const body = { name: f.name, tracks_expiry: f.tracks_expiry, default_shelf_life_months: f.tracks_expiry && f.months ? Number(f.months) : null,
      has_variants: f.has_variants, variant_options: f.has_variants ? f.options.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : null };
    if (cat) await api.patch(`/categories/${cat.id}`, body); else await api.post('/categories', body);
    onDone();
  }, 'Category saved', { title: cat ? 'Save changes to this category?' : 'Add this category?', message: cat ? 'This changes how its products are treated.' : `${f.name} will be added.`, confirmLabel: 'Save category' });
  return (
    <Modal title={cat ? 'Edit category' : 'Add category'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Category name" hint="For example Vape, Apparel, Accessories."><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.tracks_expiry} onChange={(e) => setF({ ...f, tracks_expiry: e.target.checked })} /> Items in this category expire</label>
        {f.tracks_expiry && <Field label="Usual shelf life (months)" hint="Used to fill in the expiry date when receiving stock."><Input type="number" min={1} value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })} /></Field>}
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.has_variants} onChange={(e) => setF({ ...f, has_variants: e.target.checked })} /> Items come in variants (size, color…)</label>
        {f.has_variants && <Field label="Variant options" hint="Separate with commas, e.g. size, color."><Input value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} /></Field>}
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !f.name.trim()}>{busy ? 'Saving…' : 'Save category'}</Button></div>
      </form>
    </Modal>
  );
}

function Suppliers() {
  const { data, loading, error, reload } = useAsync(() => api.get('/suppliers'), []);
  const [open, setOpen] = useState(false);
  const blank = { name: '', contact_person: '', contact_number: '', address: '' };
  const [f, setF] = useState(blank);
  const { busy, error: err, submit } = useSubmit(async () => { await api.post('/suppliers', f); setOpen(false); setF(blank); reload(); }, 'Supplier added', { title: 'Add this supplier?', message: `${f.name} will be added.`, confirmLabel: 'Add supplier' });
  return (
    <>
      <div className="mb-3"><Button onClick={() => setOpen(true)}>Add supplier</Button></div>
      <ErrorNote error={error} className="mb-3" />
      {loading ? <Spinner /> : <Table><thead><tr><Th>Supplier</Th><Th>Contact person</Th><Th>Phone</Th><Th>Address</Th></tr></thead>
        <tbody>{data.map((s) => <tr key={s.id}><Td className="font-semibold">{s.name}</Td><Td>{s.contact_person}</Td><Td>{s.contact_number}</Td><Td className="text-muted">{s.address}</Td></tr>)}</tbody></Table>}
      {open && (
        <Modal title="Add supplier" onClose={() => setOpen(false)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <Field label="Supplier name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Contact person"><Input value={f.contact_person} onChange={(e) => setF({ ...f, contact_person: e.target.value })} /></Field><Field label="Phone number"><Input value={f.contact_number} onChange={(e) => setF({ ...f, contact_number: e.target.value })} /></Field></div>
            <Field label="Address"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <ErrorNote error={err} />
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || !f.name.trim()}>{busy ? 'Saving…' : 'Save supplier'}</Button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

function Settings() {
  const { data, loading, error, reload } = useAsync(() => api.get('/settings'), []);
  const [vals, setVals] = useState(null);
  const [ok, setOk] = useState(false);
  const v = vals || { expiry_alert_days: data?.expiry_alert_days ?? 90, loyalty_peso_per_point: data?.loyalty_peso_per_point ?? 100 };
  const { busy, error: err, submit } = useSubmit(async () => {
    await api.put('/settings/expiry_alert_days', { value: Number(v.expiry_alert_days) });
    await api.put('/settings/loyalty_peso_per_point', { value: Number(v.loyalty_peso_per_point) });
    setOk(true); reload();
  }, 'Settings saved', { title: 'Save these settings?', message: 'Alerts and loyalty points will use the new numbers right away.', confirmLabel: 'Save settings' });
  if (loading) return <Spinner />;
  return (
    <form className="max-w-md space-y-4" onSubmit={(e) => { e.preventDefault(); setOk(false); submit(); }}>
      <ErrorNote error={error} />
      <Field label="Warn about expiring items this many days ahead"><Input type="number" min={1} value={v.expiry_alert_days} onChange={(e) => setVals({ ...v, expiry_alert_days: e.target.value })} /></Field>
      <Field label="Customers earn 1 loyalty point for every (₱)" hint="Example: 100 means ₱100 spent = 1 point."><Input type="number" min={1} value={v.loyalty_peso_per_point} onChange={(e) => setVals({ ...v, loyalty_peso_per_point: e.target.value })} /></Field>
      <ErrorNote error={err} />
      {ok && <p className="rounded-md bg-ledger-soft px-3 py-2 text-sm text-ledger-dark">Settings saved.</p>}
      <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button>
    </form>
  );
}
