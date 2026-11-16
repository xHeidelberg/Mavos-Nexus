import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { flushQueue, queueSize } from '../lib/offlineQueue';
import { useTheme } from '../lib/theme';
import Icon from './Icon';
import { Modal, cx } from './ui';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'staff'], main: true },
  { to: '/pos', label: 'Point of sale', short: 'Sell', icon: 'pos', roles: ['admin', 'staff', 'sales'], main: true },
  { to: '/sales', label: 'Sales history', short: 'Sales', icon: 'sales', roles: ['admin', 'staff', 'sales'], main: true },
  { to: '/stock', label: 'Stock', icon: 'stock', roles: ['admin', 'staff', 'sales'], main: true },
  { to: '/messages', label: 'Messages', short: 'Chat', icon: 'message', roles: ['admin', 'staff', 'sales'], main: true },
  { to: '/transfers', label: 'Transfers', icon: 'transfers', roles: ['admin', 'staff'] },
  { to: '/products', label: 'Products', icon: 'products', roles: ['admin'] },
  { to: '/payroll', label: 'Payroll', icon: 'payroll', roles: ['admin'] },
  { to: '/expenses', label: 'Expenses', icon: 'expenses', roles: ['admin', 'staff'] },
  { to: '/users', label: 'Users', icon: 'users', roles: ['admin'] },
  { to: '/setup', label: 'Setup', icon: 'setup', roles: ['admin'] },
  { to: '/audit', label: 'Audit log', icon: 'audit', roles: ['admin'] },
  { to: '/account', label: 'My account', icon: 'account', roles: ['admin', 'staff', 'sales'] },
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
      {count > 0 && (
        <button onClick={sync} disabled={!online || busy}
          className="rounded-full bg-caution-soft px-3 py-1 text-xs font-semibold text-caution disabled:opacity-70">
          {busy ? 'Sending…' : `${count} waiting to send`}
        </button>
      )}
      <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', online ? 'bg-ledger-soft text-ledger-dark' : 'bg-caution-soft text-caution')}>
        <span className={cx('size-2 rounded-full', online ? 'bg-ledger' : 'animate-pulse bg-caution')} />
        {online ? 'Online' : 'Offline'}
      </span>
    </div>
  );
}

function useUnread() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => api.get('/messages/unread').then((r) => alive && setN(r.unread)).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    window.addEventListener('mavos-unread-refresh', load);
    return () => { alive = false; clearInterval(t); window.removeEventListener('mavos-unread-refresh', load); };
  }, []);
  return n;
}

function Dot({ n }) {
  return n > 0 ? <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-on-danger">{n > 9 ? '9+' : n}</span> : null;
}

function ThemeButton({ className }) {
  const [theme, toggle] = useTheme();
  return (
    <button onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title="Light / dark"
      className={cx('grid size-9 place-items-center rounded-lg text-muted hover:bg-line/60 hover:text-ink', className)}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [more, setMore] = useState(false);
  const unread = useUnread();
  useEffect(() => setMore(false), [loc.pathname]);
  useEffect(() => {
    const heartbeat = () => {
      if (document.visibilityState === 'visible') api.post('/messages/presence').catch(() => {});
    };
    heartbeat();
    const interval = setInterval(heartbeat, 30000);
    document.addEventListener('visibilitychange', heartbeat);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', heartbeat);
    };
  }, []);

  const items = NAV.filter((n) => n.roles.includes(user.role));
  const tabs = items.filter((n) => n.main);
  const rest = items.filter((n) => !n.main);
  const signOut = async () => { await logout(); nav('/login'); };

  return (
    <div className="flex h-full">
      {/* Tablet: icon rail. Desktop: full sidebar. Phone: hidden (bottom tabs instead). */}
      <aside className="hidden w-[72px] shrink-0 flex-col border-r border-line bg-surface md:flex lg:w-64">
        <div className="flex h-16 items-center justify-center gap-3 px-4 lg:justify-start">
          <img src="/icon.svg" alt="" className="size-9 rounded-lg" />
          <div className="hidden min-w-0 lg:block">
            <p className="font-display text-lg font-bold leading-tight">Mavos Nexus</p>
            <p className="truncate text-xs text-muted">{user.branch?.name || 'All branches'}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} title={n.label}
              className={({ isActive }) => cx('group flex h-11 items-center justify-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors lg:justify-start',
                isActive ? 'bg-ledger text-on-ledger shadow-sm' : 'text-ink/80 hover:bg-line/60 hover:text-ink')}>
              <span className="relative"><Icon name={n.icon} className="size-5 shrink-0" />{n.to === '/messages' && <Dot n={unread} />}</span>
              <span className="hidden lg:inline">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-line p-3">
          <div className="hidden px-1 lg:block"><p className="truncate text-sm font-semibold">{user.full_name}</p><p className="text-xs capitalize text-muted">{user.role}</p></div>
          <div className="flex flex-col items-center gap-1 lg:flex-row lg:justify-between">
            <ThemeButton />
            <button onClick={signOut} title="Sign out" className="flex h-9 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted hover:bg-line/60 hover:text-ink">
              <Icon name="logout" /><span className="hidden lg:inline">Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="safe-top flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <img src="/icon.svg" alt="" className="size-7 rounded-md" />
            <div className="min-w-0"><p className="truncate text-sm font-bold leading-tight">Mavos Nexus</p><p className="truncate text-xs leading-tight text-muted">{user.branch?.name || 'All branches'}</p></div>
          </div>
          <span className="hidden text-sm text-muted md:block">{user.full_name} · <span className="capitalize">{user.role}</span></span>
          <NetStatus />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 sm:p-6 sm:pb-24 md:pb-6"><Outlet /></main>
      </div>

      {/* Phone: bottom tab bar */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 backdrop-blur md:hidden" aria-label="Main">
        {tabs.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => cx('flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-ledger' : 'text-muted')}>
            {({ isActive }) => (<>
              <span className={cx('relative grid h-7 w-12 place-items-center rounded-full transition-colors', isActive && 'bg-ledger-soft')}><Icon name={n.icon} className="size-[22px]" />{n.to === '/messages' && <Dot n={unread} />}</span>
              {n.short || n.label}
            </>)}
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} className="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted" aria-label="More">
          <span className="grid h-7 w-12 place-items-center rounded-full"><Icon name="more" className="size-[22px]" strokeWidth={3} /></span>More
        </button>
      </nav>

      {more && (
        <Modal title="Menu" onClose={() => setMore(false)}>
          <div className="mb-4 flex items-center justify-between rounded-xl bg-paper p-3">
            <div><p className="font-semibold">{user.full_name}</p><p className="text-sm capitalize text-muted">{user.role} · {user.branch?.name || 'All branches'}</p></div>
            <ThemeButton className="border border-line bg-surface" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {rest.map((n) => (
              <NavLink key={n.to} to={n.to} className="flex flex-col items-center gap-1.5 rounded-xl border border-line p-3 text-center text-xs font-semibold active:bg-paper">
                <Icon name={n.icon} className="size-6 text-ledger" />{n.label}
              </NavLink>
            ))}
          </div>
          <button onClick={signOut} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line font-semibold text-danger"><Icon name="logout" />Sign out</button>
        </Modal>
      )}
    </div>
  );
}
