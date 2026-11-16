import { useState } from 'react';
import { Badge, Button, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, useSubmit } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateTime } from '../lib/format';
import { confirm, toast } from '../lib/toast';

export default function Users() {
  const { user: me } = useAuth();
  const { data, loading, error, reload } = useAsync(() => api.get('/users'), []);
  const { data: branches } = useAsync(() => api.get('/branches'), []);
  const [editing, setEditing] = useState(null);
  const [secret, setSecret] = useState(null); // { who, password }
  const [actErr, setActErr] = useState(null);

  const reset = async (u) => {
    if (!(await confirm({ title: 'Reset password?', message: `${u.full_name} will get a temporary password and must choose a new one at next sign-in.`, confirmLabel: 'Reset password', danger: true }))) return;
    try { const r = await api.post(`/users/${u.id}/reset-password`); setSecret({ who: u.full_name, password: r.temporary_password }); reload(); } catch (e) { setActErr(e); }
  };
  const toggle = async (u) => {
    const off = u.is_active;
    if (!(await confirm({ title: off ? 'Disable this user?' : 'Enable this user?', message: off ? `${u.full_name} won’t be able to sign in until you enable them again.` : `${u.full_name} will be able to sign in again.`, confirmLabel: off ? 'Disable' : 'Enable', danger: off }))) return;
    try { await api.patch(`/users/${u.id}`, { is_active: !u.is_active }); toast.success(u.is_active ? 'User disabled' : 'User enabled'); reload(); } catch (e) { setActErr(e); } };
  const branchName = (id) => branches?.find((b) => b.id === id)?.name || '—';
  const name = (id) => data?.find((u) => u.id === id)?.full_name || '—';

  return (
    <div>
      <PageHeader title="Users" sub="Admins manage everything. Staff run a branch. Sales ring up sales." actions={<Button onClick={() => setEditing('new')}>New user</Button>} />
      <ErrorNote error={error || actErr} className="mb-3" />
      {loading ? <Spinner /> : (
        <Table><thead><tr><Th>Name</Th><Th>Username</Th><Th>Role</Th><Th>Branch</Th><Th>Supervisor</Th><Th>PIN</Th><Th>Last sign-in</Th><Th /></tr></thead>
          <tbody>{data.map((u) => (
            <tr key={u.id} className={u.is_active ? '' : 'opacity-50'}>
              <Td className="font-semibold">{u.full_name} {u.id === me.id && <Badge tone="good">You</Badge>}</Td><Td>{u.username}</Td><Td className="capitalize">{u.role}</Td><Td>{u.role === 'admin' ? 'All' : branchName(u.branch_id)}</Td>
              <Td>{u.supervisor_id ? name(u.supervisor_id) : '—'}</Td>
              <Td>{u.role === 'sales' ? '—' : u.has_pin ? <Badge tone="good">Set</Badge> : <Badge tone="warn">Not set</Badge>}</Td>
              <Td>{u.last_login_at ? dateTime(u.last_login_at) : 'Never'}</Td>
              <Td><span className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing(u)}>Edit</Button>{u.id !== me.id && <Button size="sm" variant="ghost" onClick={() => reset(u)}>Reset password</Button>}{u.id !== me.id && <Button size="sm" variant="ghost" onClick={() => toggle(u)}>{u.is_active ? 'Disable' : 'Enable'}</Button>}</span></Td>
            </tr>))}</tbody></Table>
      )}
      {editing && <UserForm user={editing === 'new' ? null : editing} users={data || []} branches={branches || []} onClose={() => setEditing(null)}
        onDone={(r) => { setEditing(null); reload(); if (r?.temporary_password) setSecret({ who: r.user.full_name, password: r.temporary_password }); }} />}
      {secret && (
        <Modal title="Temporary password" onClose={() => setSecret(null)} footer={<Button onClick={() => setSecret(null)}>Done</Button>}>
          <p className="text-sm">Give this to <b>{secret.who}</b>. It is shown only once, and they must change it when they sign in.</p>
          <p className="my-4 select-all rounded-md bg-paper px-4 py-3 text-center font-display text-2xl font-bold tracking-wide">{secret.password}</p>
        </Modal>
      )}
    </div>
  );
}

function UserForm({ user, users, branches, onClose, onDone }) {
  const { user: me } = useAuth();
  const isSelf = !!user && user.id === me.id;
  const [f, setF] = useState(user ? { username: user.username, full_name: user.full_name, role: user.role, branch_id: user.branch_id ? String(user.branch_id) : '', supervisor_id: user.supervisor_id ? String(user.supervisor_id) : '' }
    : { username: '', full_name: '', role: 'sales', branch_id: '', supervisor_id: '' });
  const staffHere = users.filter((u) => u.role === 'staff' && String(u.branch_id) === f.branch_id && u.is_active);
  const { busy, error, submit } = useSubmit(async () => {
    const body = { ...f, branch_id: f.role === 'admin' ? null : Number(f.branch_id) || null, supervisor_id: f.role === 'sales' && f.supervisor_id ? Number(f.supervisor_id) : null };
    onDone(user ? await api.patch(`/users/${user.id}`, body) : await api.post('/users', body));
  }, 'User saved', { title: user ? 'Save changes to this user?' : 'Create this user?', message: user ? `${f.full_name} will be updated.` : `${f.full_name} will be added as ${f.role}. A temporary password is created for them.`, confirmLabel: user ? 'Save changes' : 'Create user' });
  return (
    <Modal title={user ? 'Edit user' : 'New user'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Full name"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Username"><Input value={f.username} autoComplete="off" onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role" hint={isSelf ? 'You can’t change your own role.' : undefined}><Select disabled={isSelf} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="sales">Sales</option><option value="staff">Staff</option><option value="admin">Admin</option></Select></Field>
          {f.role !== 'admin' && <Field label="Branch"><Select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value, supervisor_id: '' })}><option value="">Choose…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>}
        </div>
        {f.role === 'sales' && <Field label="Supervised by" hint="This Staff member can see this person’s sales."><Select value={f.supervisor_id} onChange={(e) => setF({ ...f, supervisor_id: e.target.value })}><option value="">Nobody</option>{staffHere.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select></Field>}
        {!user && <p className="text-sm text-muted">A temporary password is created for them and shown once after saving.</p>}
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !f.username.trim() || !f.full_name.trim() || (f.role !== 'admin' && !f.branch_id)}>{busy ? 'Saving…' : 'Save user'}</Button></div>
      </form>
    </Modal>
  );
}
