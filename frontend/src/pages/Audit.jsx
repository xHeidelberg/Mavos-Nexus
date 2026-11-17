import { useState } from 'react';
import { Button, Empty, ErrorNote, Field, Input, Modal, PageHeader, Spinner, Table, Td, Th } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';

export default function Audit() {
  const [f, setF] = useState({ action: '', entity: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const { data, loading, error } = useAsync(() => api.get('/audit', { ...f, page, per_page: 50 }), [f.action, f.entity, page]);
  return (
    <div>
      <PageHeader title="Audit log" sub="Who did what, and when. Voids, adjustments, price changes, password resets and more." />
      <div className="mb-4 flex flex-wrap gap-3">
        <Field label="Action"><Input placeholder="e.g. SALE_VOID" value={f.action} onChange={(e) => { setF({ ...f, action: e.target.value.toUpperCase() }); setPage(1); }} /></Field>
        <Field label="Record type"><Input placeholder="e.g. sale, user" value={f.entity} onChange={(e) => { setF({ ...f, entity: e.target.value.toLowerCase() }); setPage(1); }} /></Field>
      </div>
      <ErrorNote error={error} className="mb-3" />
      {loading ? <Spinner /> : !data?.data?.length ? <Empty title="No matching entries" /> : (
        <>
          <Table><thead><tr><Th>When</Th><Th>User</Th><Th>Action</Th><Th>Record</Th><Th /></tr></thead>
            <tbody>{data.data.map((a) => (
              <tr key={a.id}><Td>{dateTime(a.created_at)}</Td><Td>{a.user?.username || '—'}</Td><Td className="font-semibold">{a.action}</Td><Td>{a.entity ? `${a.entity} ${a.entity_id ?? ''}` : ''}</Td>
                <Td>{(a.old_data || a.new_data) && <Button size="sm" variant="ghost" onClick={() => setOpen(a)}>Details</Button>}</Td></tr>))}</tbody></Table>
          <div className="mt-3 flex items-center justify-between text-sm"><span className="text-muted">Page {data.current_page} of {data.last_page}</span>
            <span className="flex gap-2"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page >= data.last_page} onClick={() => setPage(page + 1)}>Next</Button></span></div>
        </>
      )}
      {open && (
        <Modal title={`${open.action} · ${dateTime(open.created_at)}`} onClose={() => setOpen(null)} wide>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><p className="mb-1 text-sm font-semibold">Before</p><pre className="max-h-80 overflow-auto rounded-md bg-paper p-3 text-xs">{JSON.stringify(open.old_data, null, 2) || '—'}</pre></div>
            <div><p className="mb-1 text-sm font-semibold">After</p><pre className="max-h-80 overflow-auto rounded-md bg-paper p-3 text-xs">{JSON.stringify(open.new_data, null, 2) || '—'}</pre></div>
          </div>
          <p className="mt-3 text-xs text-muted">From {open.ip || 'unknown IP'}</p>
        </Modal>
      )}
    </div>
  );
}
