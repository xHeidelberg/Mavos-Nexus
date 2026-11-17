import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button, ErrorNote, Field, Input, useSubmit } from '../components/ui';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  const { busy, error, submit } = useSubmit(async () => {
    const r = await login(f.username.trim(), f.password);
    nav(r.must_change_password ? '/change-password' : '/', { replace: true });
  }, null, false);

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="grid min-h-full place-items-center p-4">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm">
        <h1 className="font-display text-3xl font-bold text-ledger">Mavos Nexus</h1>
        <p className="mb-5 mt-1 text-sm text-muted">Sign in to your branch account.</p>
        <div className="space-y-4">
          <Field label="Username">
            <Input autoFocus autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
          </Field>

          <Field label="Password">
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={f.password}
                onChange={(e) => setF({ ...f, password: e.target.value })}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-ledger focus:outline-none"
                tabIndex={-1}
              >
                {showPassword ? (
                  // Eye Slash (Hide)
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  // Eye (Show)
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </Field>

          <ErrorNote error={error} />

          <Button type="submit" size="lg" className="w-full" disabled={busy || !f.username || !f.password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted">Forgot your password? Ask an admin to reset it.</p>
      </form>
    </div>
  );
}