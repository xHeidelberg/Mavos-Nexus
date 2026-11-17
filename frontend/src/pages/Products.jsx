import { useState } from 'react';
import { Badge, Button, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Textarea, Th, useSubmit } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { peso } from '../lib/format';

const blankVariant = () => ({ id: null, sku: '', barcode: '', label: '', attributes: {}, cost_price: '', base_price: '', selling_price: '', low_stock_threshold: 5, is_active: true });

export default function Products() {
  const { data, loading, error, reload } = useAsync(() => api.get('/products'), []);
  const cats = useAsync(() => api.get('/categories'), []);
  const [editing, setEditing] = useState(null); // product | 'new'
  const [q, setQ] = useState('');
  const list = (data || []).filter((p) => !q || `${p.name} ${p.brand || ''} ${p.variants.map((v) => v.sku).join(' ')}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title="Products" sub="The category decides whether an item expires or comes in sizes and colors."
        actions={<Button onClick={() => setEditing('new')} disabled={!cats.data?.length}>New product</Button>} />
      {cats.data && !cats.data.length && <p className="mb-3 rounded-md bg-caution-soft px-3 py-2 text-sm text-caution">Add a category first in Setup → Categories.</p>}
      <Input className="mb-3 max-w-sm" placeholder="Search name, brand or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorNote error={error} className="mb-3" />
      {loading ? <Spinner /> : !list.length ? <Empty title="No products yet" hint="Create your first product, then receive stock for it." /> : (
        <Table>
          <thead><tr><Th>Product</Th><Th>Category</Th><Th>Variants</Th><Th className="text-right">Price</Th><Th>Rules</Th><Th /></tr></thead>
          <tbody>{list.map((p) => {
            const prices = p.variants.map((v) => v.selling_price);
            const lo = Math.min(...prices); const hi = Math.max(...prices);
            return (
              <tr key={p.id}>
                <Td className="font-semibold">{p.name}{p.brand && <span className="block text-xs font-normal text-muted">{p.brand}</span>}</Td>
                <Td>{p.category?.name}</Td>
                <Td>{p.variants.length === 1 && !p.variants[0].label ? p.variants[0].sku : `${p.variants.length} variants`}</Td>
                <Td className="text-right">{lo === hi ? peso(lo) : `${peso(lo)} – ${peso(hi)}`}</Td>
                <Td>{p.tracks_expiry_effective ? <Badge tone="warn">Expires{p.shelf_life_months_effective ? ` · ${p.shelf_life_months_effective} mo` : ''}</Badge> : <Badge>No expiry</Badge>}</Td>
                <Td><Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button></Td>
              </tr>
            );
          })}</tbody>
        </Table>
      )}
      {editing && <ProductForm product={editing === 'new' ? null : editing} categories={cats.data || []} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function ProductForm({ product, categories, onClose, onDone }) {
  const [f, setF] = useState(() => product ? {
    category_id: String(product.category_id), name: product.name, brand: product.brand || '', description: product.description || '',
    expiry_rule: product.tracks_expiry === null ? '' : product.tracks_expiry ? 'yes' : 'no', shelf_life_months: product.shelf_life_months || '',
  } : { category_id: String(categories[0]?.id || ''), name: '', brand: '', description: '', expiry_rule: '', shelf_life_months: '' });
  const [variants, setVariants] = useState(() => product ? product.variants.map((v) => ({ ...blankVariant(), ...v, barcode: v.barcode || '', label: v.label || '', attributes: v.attributes || {} })) : [blankVariant()]);
  const cat = categories.find((c) => String(c.id) === f.category_id);
  const options = cat?.has_variants ? cat.variant_options || [] : [];
  const setV = (n, patch) => setVariants(variants.map((v, k) => (k === n ? { ...v, ...patch } : v)));

  const { busy, error, submit } = useSubmit(async () => {
    const body = {
      category_id: Number(f.category_id), name: f.name, brand: f.brand || null, description: f.description || null,
      tracks_expiry: f.expiry_rule === '' ? null : f.expiry_rule === 'yes',
      shelf_life_months: f.shelf_life_months ? Number(f.shelf_life_months) : null,
      variants: variants.map((v) => ({
        ...(v.id ? { id: v.id } : {}), sku: v.sku, barcode: v.barcode || null, label: v.label || null,
        attributes: Object.keys(v.attributes || {}).length ? v.attributes : null,
        cost_price: Number(v.cost_price), base_price: Number(v.base_price), selling_price: Number(v.selling_price),
        low_stock_threshold: Number(v.low_stock_threshold) || 0, is_active: v.is_active,
      })),
    };
    if (product) await api.patch(`/products/${product.id}`, body); else await api.post('/products', body);
    onDone();
  }, 'Product saved', { title: product ? 'Save changes to this product?' : 'Add this product?', message: product ? `${f.name} will be updated, including its variants and prices.` : `${f.name} will be added with ${variants.length} variant${variants.length > 1 ? 's' : ''}.`, confirmLabel: product ? 'Save changes' : 'Add product' });
  const valid = f.name.trim() && f.category_id && variants.every((v) => v.sku.trim() && v.cost_price !== '' && v.base_price !== '' && v.selling_price !== '' && Number(v.base_price) <= Number(v.selling_price));

  return (
    <Modal title={product ? 'Edit product' : 'New product'} onClose={onClose} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category" hint={cat ? [cat.tracks_expiry ? `Expires${cat.default_shelf_life_months ? ` after ${cat.default_shelf_life_months} months` : ''}` : 'Does not expire', cat.has_variants ? `Variants: ${(cat.variant_options || []).join(', ') || 'yes'}` : 'No variants'].join(' · ') : ''}>
            <Select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Product name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Brand (optional)"><Input value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} /></Field>
          <Field label="Expiry for this product" hint="Only change this if it differs from the category.">
            <Select value={f.expiry_rule} onChange={(e) => setF({ ...f, expiry_rule: e.target.value })}><option value="">Follow category</option><option value="yes">Expires</option><option value="no">Never expires</option></Select></Field>
          {f.expiry_rule === 'yes' && <Field label="Shelf life (months)"><Input type="number" min={1} value={f.shelf_life_months} onChange={(e) => setF({ ...f, shelf_life_months: e.target.value })} /></Field>}
        </div>
        <Field label="Description (optional)"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>

        <div>
          <p className="mb-2 font-semibold">{cat?.has_variants ? 'Variants' : 'Pricing and SKU'}</p>
          <div className="space-y-3">
            {variants.map((v, n) => (
              <div key={n} className="rounded-md border border-line p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="SKU"><Input value={v.sku} onChange={(e) => setV(n, { sku: e.target.value })} /></Field>
                  <Field label="Barcode (optional)"><Input value={v.barcode} onChange={(e) => setV(n, { barcode: e.target.value })} /></Field>
                  {options.length > 0 ? options.map((o) => (
                    <Field key={o} label={o.charAt(0).toUpperCase() + o.slice(1)}><Input value={v.attributes?.[o] || ''} onChange={(e) => setV(n, { attributes: { ...v.attributes, [o]: e.target.value } })} /></Field>
                  )) : <Field label="Label (optional)" hint="e.g. 30ml Mango"><Input value={v.label} onChange={(e) => setV(n, { label: e.target.value })} /></Field>}
                  <Field label="Cost (puhunan)"><Input type="number" step="0.01" min={0} value={v.cost_price} onChange={(e) => setV(n, { cost_price: e.target.value })} /></Field>
                  <Field label="Lowest selling price"><Input type="number" step="0.01" min={0} value={v.base_price} onChange={(e) => setV(n, { base_price: e.target.value })} /></Field>
                  <Field label="List price"><Input type="number" step="0.01" min={0} value={v.selling_price} onChange={(e) => setV(n, { selling_price: e.target.value })} /></Field>
                  <Field label="Low-stock alert at"><Input type="number" min={0} value={v.low_stock_threshold} onChange={(e) => setV(n, { low_stock_threshold: e.target.value })} /></Field>
                </div>
                {Number(v.base_price) > Number(v.selling_price) && <p className="mt-2 text-sm text-danger">The lowest price can’t be above the list price.</p>}
                <div className="mt-2 flex justify-between text-sm">
                  {v.id ? <label className="flex items-center gap-2"><input type="checkbox" checked={v.is_active} onChange={(e) => setV(n, { is_active: e.target.checked })} /> Active</label> : <span />}
                  {!v.id && variants.length > 1 && <button type="button" className="font-semibold text-danger" onClick={() => setVariants(variants.filter((_, k) => k !== n))}>Remove</button>}
                </div>
              </div>
            ))}
          </div>
          {cat?.has_variants && <Button size="sm" variant="secondary" className="mt-2" onClick={() => setVariants([...variants, { ...blankVariant(), cost_price: variants.at(-1)?.cost_price ?? '', base_price: variants.at(-1)?.base_price ?? '', selling_price: variants.at(-1)?.selling_price ?? '' }])}>Add variant</Button>}
        </div>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !valid}>{busy ? 'Saving…' : 'Save product'}</Button></div>
      </form>
    </Modal>
  );
}
