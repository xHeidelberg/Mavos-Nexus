import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { flushQueue, queueSize } from '../lib/offlineQueue';
import { Button, cx } from './ui';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', roles: ['admin', 'staff'] },
  { to: '/pos', label: 'Point of sale', roles: ['admin', 'staff', 'sales'] },
  { to: '/sales', label: 'Sales history', roles: ['admin', 'staff', 'sales'] },
  { to: '/stock', label: 'Stock', roles: ['admin', 'staff', 'sales'] },
  { to: '/transfers', label: 'Transfers', roles: ['admin', 'staff'] },
  { to: '/products', label: 'Products', roles: ['admin'] },
  { to: '/expenses', label: 'Expenses', roles: ['admin', 'staff'] },
  { to: '/users', label: 'Users', roles: ['admin'] },
  { to: '/setup', label: 'Setup', roles: ['admin'] },
  { to: '/audit', label: 'Audit log', roles: ['admin'] },
  { to: '/account', label: 'My account', roles: ['admin', 'staff', 'sales'] },
];

function NetStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [count, setCount] = useState(queueSize());
  const [busy, setBusy] = useState(false);

  const sync = async () => {
    if (!navigator.onLine || !queueSize()) return;
    setBusy(true);
    try { await flushQueue(); } catch { /* stays queued */ } finally { setBusy(false); }
  };

  useEffect(() => {
    const on = () => { setOnline(true); sync(); };
    const off = () => setOnline(false);
    const q = () => setCount(queueSize());
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('mavos-queue', q);
    const t = setInterval(sync, 30000);
    sync();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('mavos-queue', q); clearInterval(t); };
  }, []);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold', online ? 'bg-ledger-soft text-ledger-dark' : 'bg-caution-soft text-caution')}>
        <span className={cx('size-2 rounded-full', online ? 'bg-ledger' : 'bg-caution')} />
        {online ? 'Online' : 'Offline'}
      </span>
      {count > 0 && (
        <Button size="sm" variant="secondary" onClick={sync} disabled={!online || busy}>
          {busy ? 'Sending…' : `${count} sale${count > 1 ? 's' : ''} waiting to send`}
        </Button>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => n.roles.includes(user.role));

  const links = (
    <nav className="flex flex-col gap-0.5 p-3">
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} onClick={() => setOpen(false)}
          className={({ isActive }) => cx('rounded-md px-3 py-2 text-[15px] font-medium', isActive ? 'bg-ledger text-white' : 'text-ink hover:bg-line/60')}>
          {n.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white lg:flex">
        <div className="px-5 pb-2 pt-5">
          <p className="font-display text-xl font-bold text-ledger">Mavos Nexus</p>
          <p className="text-sm text-muted">{user.branch?.name || 'All branches'}</p>
        </div>
        <div className="flex-1 overflow-y-auto">{links}</div>
        <div className="border-t border-line p-4 text-sm">
          <p className="font-semibold">{user.full_name}</p>
          <p className="mb-2 capitalize text-muted">{user.role}</p>
          <Button size="sm" variant="secondary" onClick={async () => { await logout(); nav('/login'); }}>Sign out</Button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-ink/40" />
          <aside className="relative h-full w-64 overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5"><p className="font-display text-xl font-bold text-ledger">Mavos Nexus</p><p className="text-sm text-muted">{user.branch?.name || 'All branches'}</p></div>
            {links}
            <div className="p-4"><Button size="sm" variant="secondary" onClick={async () => { await logout(); nav('/login'); }}>Sign out</Button></div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-2.5">
          <button className="rounded-md border border-line px-3 py-1.5 text-sm font-semibold lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">Menu</button>
          <span className="hidden text-sm text-muted lg:block">{user.full_name} · {user.role}</span>
          <NetStatus />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
