import { useState } from 'react';
import { api } from '../lib/api';
import { Button, ErrorNote, Field, Input, useSubmit } from './ui';

export default function PasswordForm({ onDone }) {
  const [f, setF] = useState({ current_password: '', new_password: '', confirm: '' });
  const [ok, setOk] = useState(false);
  const mismatch = f.confirm && f.new_password !== f.confirm;
  const { busy, error, submit } = useSubmit(async () => {
    await api.post('/auth/change-password', { current_password: f.current_password, new_password: f.new_password });
    setOk(true);
    setF({ current_password: '', new_password: '', confirm: '' });
    onDone?.();
  }, 'Password changed', { title: 'Change your password?', message: 'You’ll use the new password the next time you sign in.', confirmLabel: 'Change password' });
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
      <Field label="Current password" hint="After a reset, this is the temporary password you were given."><Input type="password" autoComplete="current-password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} /></Field>
      <Field label="New password" hint="At least 8 characters."><Input type="password" autoComplete="new-password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} /></Field>
      <Field label="Repeat new password"><Input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
      {mismatch && <p className="text-sm text-danger">The two passwords don’t match.</p>}
      <ErrorNote error={error} />
      <Button type="submit" disabled={busy || mismatch || f.new_password.length < 8 || !f.current_password}>{busy ? 'Saving…' : 'Change password'}</Button>
    </form>
  );
}
