import { useState } from 'react';
import { Button, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, useSubmit } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateOnly, peso, today } from '../lib/format';

export default function Expenses() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useAsync(() => api.get('/expenses'), []);
  const total = (data || []).reduce((s, e) => s + e.amount, 0);
  return (
    <div>
      <PageHeader title="Expenses" sub="Expenses are subtracted from sales and cost to get your tubo." actions={<Button onClick={() => setOpen(true)}>Add expense</Button>} />
      <ErrorNote error={error} className="mb-3" />
      {loading ? <Spinner /> : !data?.length ? <Empty title="No expenses recorded" hint="Add rent, utilities, salaries, transport, anything you spend to run the shop." /> : (
        <>
          <Table><thead><tr><Th>Date</Th><Th>Branch</Th><Th>Category</Th><Th>Details</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>{data.map((e) => <tr key={e.id}><Td>{dateOnly(e.expense_date)}</Td><Td>{e.branch?.name}</Td><Td className="font-semibold">{e.category}</Td><Td className="text-muted">{e.description}</Td><Td className="text-right">{peso(e.amount)}</Td></tr>)}</tbody></Table>
          <p className="mt-2 text-right text-sm font-semibold">Total shown: {peso(total)}</p>
        </>
      )}
      {open && <ExpenseForm admin={user.role === 'admin'} onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload(); }} />}
    </div>
  );
}

function ExpenseForm({ admin, onClose, onDone }) {
  const { data: branches } = useAsync(() => (admin ? api.get('/branches') : Promise.resolve([])), []);
  const [f, setF] = useState({ category: '', description: '', amount: '', expense_date: today(), branch_id: '' });
  const { busy, error, submit } = useSubmit(async () => {
    await api.post('/expenses', { category: f.category, description: f.description || undefined, amount: Number(f.amount), expense_date: f.expense_date, ...(admin && f.branch_id ? { branch_id: Number(f.branch_id) } : {}) });
    onDone();
  }, 'Expense added', { title: 'Add this expense?', message: `${peso(f.amount || 0)} for ${f.category || 'this expense'} will be subtracted from your tubo.`, confirmLabel: 'Add expense' });
  return (
    <Modal title="Add expense" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Category" hint="For example rent, electricity, salary, transport."><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount"><Input type="number" step="0.01" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Date"><Input type="date" value={f.expense_date} onChange={(e) => setF({ ...f, expense_date: e.target.value })} /></Field>
        </div>
        {admin && <Field label="Branch"><Select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}><option value="">My branch</option>{(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>}
        <Field label="Details (optional)"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !f.category.trim() || !(Number(f.amount) > 0)}>{busy ? 'Saving…' : 'Save expense'}</Button></div>
      </form>
    </Modal>
  );
}
