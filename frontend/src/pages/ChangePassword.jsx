import { useNavigate } from 'react-router-dom';
import PasswordForm from '../components/PasswordForm';
import { useAuth } from '../lib/auth';

export default function ChangePassword() {
  const { passwordChanged } = useAuth();
  const nav = useNavigate();
  return (
    <div className="grid min-h-full place-items-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        <p className="mb-5 mt-1 text-sm text-muted">You signed in with a temporary password. Set your own to continue.</p>
        <PasswordForm onDone={() => { passwordChanged(); setTimeout(() => nav('/', { replace: true }), 600); }} />
      </div>
    </div>
  );
}
