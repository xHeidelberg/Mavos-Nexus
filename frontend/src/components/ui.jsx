import { useEffect, useState } from 'react';

export const cx = (...a) => a.filter(Boolean).join(' ');

const BTN = {
  primary: 'bg-ledger text-white hover:bg-ledger-dark',
  secondary: 'bg-white text-ink border border-line hover:bg-paper',
  danger: 'bg-danger text-white hover:opacity-90',
  ghost: 'text-ink hover:bg-line/60',
};
const SIZE = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-[15px]', lg: 'h-12 px-5 text-base' };

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...p }) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ledger',
        BTN[variant], SIZE[size], className,
      )}
      {...p}
    />
  );
}

export const inputCls =
  'h-10 w-full rounded-md border border-line bg-white px-3 text-base outline-none placeholder:text-muted/70 focus:border-ledger focus:ring-2 focus:ring-ledger/20 disabled:bg-paper';
export const Input = ({ className, ...p }) => <input className={cx(inputCls, className)} {...p} />;
export const Select = ({ className, children, ...p }) => <select className={cx(inputCls, 'pr-8', className)} {...p}>{children}</select>;
export const Textarea = ({ className, ...p }) => <textarea className={cx(inputCls, 'h-auto py-2', className)} {...p} />;

export function Field({ label, hint, className, children }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={cx('flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:rounded-xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-2xl leading-none text-muted hover:bg-paper">×</button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

const TONES = {
  neutral: 'bg-line/60 text-ink',
  good: 'bg-ledger-soft text-ledger-dark',
  warn: 'bg-caution-soft text-caution',
  bad: 'bg-danger-soft text-danger',
};
export const Badge = ({ tone = 'neutral', children }) => (
  <span className={cx('inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold', TONES[tone])}>{children}</span>
);

export const Spinner = ({ label = 'Loading' }) => (
  <div className="flex items-center gap-2 py-8 text-muted" role="status">
    <span className="size-4 animate-spin rounded-full border-2 border-line border-t-ledger" />
    <span className="text-sm">{label}…</span>
  </div>
);

export const ErrorNote = ({ error, className }) =>
  error ? <p role="alert" className={cx('rounded-md bg-danger-soft px-3 py-2 text-sm text-danger', className)}>{error.message || String(error)}</p> : null;

export const Empty = ({ title, hint, action }) => (
  <div className="rounded-lg border border-dashed border-line bg-white px-6 py-10 text-center">
    <p className="font-semibold">{title}</p>
    {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Card = ({ className, children }) => <section className={cx('rounded-lg border border-line bg-white', className)}>{children}</section>;

export function PageHeader({ title, sub, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold', value === t.id ? 'border-ledger text-ledger' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const Table = ({ children }) => (
  <div className="overflow-x-auto rounded-lg border border-line bg-white">
    <table className="w-full text-left text-sm">{children}</table>
  </div>
);
export const Th = ({ className, ...p }) => <th className={cx('border-b border-line bg-paper px-3 py-2 font-semibold text-muted', className)} {...p} />;
export const Td = ({ className, ...p }) => <td className={cx('border-b border-line/70 px-3 py-2.5 align-middle', className)} {...p} />;

export const Stat = ({ label, value, tone }) => (
  <div className="rounded-lg border border-line bg-white p-4">
    <p className="text-sm text-muted">{label}</p>
    <p className={cx('mt-1 font-display text-2xl font-bold', tone === 'good' && 'text-ledger', tone === 'bad' && 'text-danger')}>{value}</p>
  </div>
);

/** Approver username + 4-digit PIN, used by void, exchange and stock adjustment. */
export function ApproverFields({ value, onChange }) {
  return (
    <fieldset className="rounded-md border border-line bg-paper p-3">
      <legend className="px-1 text-sm font-semibold">Approval needed</legend>
      <p className="mb-2 text-xs text-muted">A Staff or Admin must enter their username and personal 4-digit PIN.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Approver username"><Input value={value.approver_username} autoComplete="off" onChange={(e) => onChange({ ...value, approver_username: e.target.value })} /></Field>
        <Field label="PIN"><Input type="password" inputMode="numeric" maxLength={4} autoComplete="off" value={value.approver_pin}
          onChange={(e) => onChange({ ...value, approver_pin: e.target.value.replace(/\D/g, '') })} /></Field>
      </div>
    </fieldset>
  );
}
export const emptyApproval = { approver_username: '', approver_pin: '' };

/** Small helper for forms: tracks busy + error around an async submit. */
export function useSubmit(fn) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (...args) => {
    setBusy(true); setError(null);
    try { return await fn(...args); } catch (e) { setError(e); return undefined; } finally { setBusy(false); }
  };
  return { busy, error, submit, setError };
}
