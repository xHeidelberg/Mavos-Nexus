import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button, ErrorNote, Field, Input, useSubmit } from '../components/ui';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ username: '', password: '' });
  const { busy, error, submit } = useSubmit(async () => {
    const r = await login(f.username.trim(), f.password);
    nav(r.must_change_password ? '/change-password' : '/', { replace: true });
  });
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="grid min-h-full place-items-center p-4">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="w-full max-w-sm rounded-xl border border-line bg-white p-6 shadow-sm">
        <h1 className="font-display text-3xl font-bold text-ledger">Mavos Nexus</h1>
        <p className="mb-5 mt-1 text-sm text-muted">Sign in to your branch account.</p>
        <div className="space-y-4">
          <Field label="Username"><Input autoFocus autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
          <Field label="Password"><Input type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <ErrorNote error={error} />
          <Button type="submit" size="lg" className="w-full" disabled={busy || !f.username || !f.password}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </div>
        <p className="mt-4 text-xs text-muted">Forgot your password? Ask an admin to reset it.</p>
      </form>
    </div>
  );
}
