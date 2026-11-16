import { useState } from 'react';
import PasswordForm from '../components/PasswordForm';
import { Button, Card, ErrorNote, Field, Input, PageHeader, useSubmit } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

function PinForm() {
  const { user, refresh } = useAuth();
  const [f, setF] = useState({ password: '', pin: '' });
  const [ok, setOk] = useState(false);
  const { busy, error, submit } = useSubmit(async () => {
    await api.post('/auth/pin', f);
    setOk(true); setF({ password: '', pin: '' }); refresh();
  }, 'PIN saved', { title: 'Save this PIN?', message: 'You’ll need it to approve voids, exchanges and stock adjustments.', confirmLabel: 'Save PIN' });
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
      <p className="text-sm text-muted">{user.has_pin ? 'You have a PIN. Enter a new one to replace it.' : 'You don’t have a PIN yet. You need one to approve voids, exchanges and stock adjustments.'}</p>
      <Field label="Your password"><Input type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      <Field label="New 4-digit PIN" hint="Three wrong tries lock the PIN for 15 minutes."><Input type="password" inputMode="numeric" maxLength={4} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} /></Field>
      <ErrorNote error={error} />
      <Button type="submit" disabled={busy || f.pin.length !== 4 || !f.password}>{busy ? 'Saving…' : 'Save PIN'}</Button>
    </form>
  );
}

export default function Account() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="My account" sub={`${user.full_name} · ${user.username} · ${user.role}`} />
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="p-5"><h2 className="mb-3 text-lg font-semibold">Change password</h2><PasswordForm /></Card>
        {user.role !== 'sales' && <Card className="p-5"><h2 className="mb-3 text-lg font-semibold">Approval PIN</h2><PinForm /></Card>}
      </div>
    </div>
  );
}
