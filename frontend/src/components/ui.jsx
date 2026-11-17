import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { confirm, toast } from '../lib/toast';

export const cx = (...a) => a.filter(Boolean).join(' ');

const BTN = {
  primary: 'bg-ledger text-on-ledger hover:bg-ledger-dark shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-paper',
  danger: 'bg-danger text-on-danger hover:opacity-90',
  ghost: 'text-ink hover:bg-line/60',
};
const SIZE = { sm: 'h-9 px-3 text-sm sm:h-8', md: 'h-11 px-4 text-[15px] sm:h-10', lg: 'h-12 px-5 text-base' };

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...p }) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-lg font-semibold transition-all',
        'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ledger',
        BTN[variant], SIZE[size], className,
      )}
      {...p}
    />
  );
}

export const inputCls =
  'h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink outline-none transition-shadow sm:h-10 placeholder:text-muted/70 focus:border-ledger focus:ring-4 focus:ring-ledger/15 disabled:bg-paper';
export const Input = forwardRef(function Input({ className, ...p }, ref) { return <input ref={ref} className={cx(inputCls, className)} {...p} />; });
export const Select = ({ className, children, ...p }) => <select className={cx(inputCls, 'pr-8', className)} {...p}>{children}</select>;
export const Textarea = ({ className, ...p }) => <textarea className={cx(inputCls, 'h-auto py-2 sm:h-auto', className)} {...p} />;

export function Field({ label, hint, className, children }) {
  return (
    <label className={cx('block min-w-0', className)}>
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Pill-style single choice, e.g. period or payment method. */
export function Segmented({ options, value, onChange, label, className }) {
  return (
    <div role="group" aria-label={label} className={cx('inline-flex rounded-lg border border-line bg-paper p-0.5', className)}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={cx('h-10 flex-1 rounded-md px-3 text-sm font-semibold transition-colors sm:h-9',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const modalStack = [];
export function Modal({ title, onClose, children, wide, footer }) {
  const ref = useRef(null);
  const token = useRef({});
  useEffect(() => {
    modalStack.push(token.current);
    const onKey = (e) => e.key === 'Escape' && modalStack[modalStack.length - 1] === token.current && onClose?.();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      const i = modalStack.indexOf(token.current);
      if (i >= 0) modalStack.splice(i, 1);
    };
  }, [onClose]);
  return (
    <div className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={cx('animate-sheet flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-surface shadow-pop outline-none sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 sm:border-b sm:border-line sm:pb-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-muted hover:bg-paper hover:text-ink"><Icon name="x" /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 py-3">{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        {!footer && <div className="safe-bottom" />}
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
  <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', TONES[tone])}>{children}</span>
);

/** Loading placeholder that looks like the content that is coming. */
export const Spinner = ({ label = 'Loading' }) => (
  <div role="status" aria-label={label} className="space-y-3 py-2">
    <div className="skeleton h-8 w-1/3 rounded-lg" />
    {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-12 rounded-lg" style={{ opacity: 1 - i * 0.18 }} />)}
  </div>
);

export const ErrorNote = ({ error, className }) =>
  error ? (
    <p role="alert" className={cx('flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger', className)}>
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" /><span>{error.message || String(error)}</span>
    </p>
  ) : null;

export const Empty = ({ title, hint, action }) => (
  <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
    <p className="font-semibold">{title}</p>
    {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Card = ({ className, children }) => <section className={cx('rounded-xl border border-line bg-surface', className)}>{children}</section>;

export function PageHeader({ title, sub, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold sm:text-[1.7rem]">{title}</h1>
        {sub && <p className="mt-0.5 max-w-2xl text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('relative whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition-colors', value === t.id ? 'text-ledger' : 'text-muted hover:text-ink')}>
          {t.label}
          {value === t.id && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-ledger" />}
        </button>
      ))}
    </div>
  );
}

/** On phones every row becomes a stacked card; the header text is copied onto each cell as its label. */
export function Table({ children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    const heads = [...t.querySelectorAll('thead th')].map((h) => h.textContent.trim());
    t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => {
      if (heads[i]) td.setAttribute('data-label', heads[i]); else td.removeAttribute('data-label');
    }));
  });
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table ref={ref} className="rtable w-full text-left text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ className, ...p }) => <th className={cx('border-b border-line bg-paper/70 px-3 py-2.5 font-semibold text-muted', className)} {...p} />;
export const Td = ({ className, ...p }) => <td className={cx('border-b border-line/70 px-3 py-3 align-middle', className)} {...p} />;

export const Stat = ({ label, value, tone, hint }) => (
  <div className="rounded-xl border border-line bg-surface p-4">
    <p className="text-sm text-muted">{label}</p>
    <p className={cx('mt-1 font-display text-2xl font-bold sm:text-[1.7rem]', tone === 'good' && 'text-ledger', tone === 'bad' && 'text-danger')}>{value}</p>
    {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
  </div>
);

/** Approver username + 4-digit PIN, used by void, exchange and stock adjustment. */
export function ApproverFields({ value, onChange }) {
  return (
    <fieldset className="rounded-lg border border-line bg-paper p-3">
      <legend className="px-1 text-sm font-semibold">Approval needed</legend>
      <p className="mb-2 text-xs text-muted">A Staff or Admin must enter their username and personal 4-digit PIN.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Approver username"><Input value={value.approver_username} autoComplete="off" autoCapitalize="none" onChange={(e) => onChange({ ...value, approver_username: e.target.value })} /></Field>
        <Field label="PIN"><Input type="password" inputMode="numeric" maxLength={4} autoComplete="off" value={value.approver_pin}
          onChange={(e) => onChange({ ...value, approver_pin: e.target.value.replace(/\D/g, '') })} /></Field>
      </div>
    </fieldset>
  );
}
export const emptyApproval = { approver_username: '', approver_pin: '' };

/**
 * Wraps a create / update / delete. It always asks "are you sure?" first, then runs, then shows a toast.
 *   success: toast text (null = none)    confirmOpts: object | string (message) | false (no dialog, e.g. sign-in)
 */
export function useSubmit(fn, success = 'Done', confirmOpts) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (...args) => {
    if (confirmOpts !== false) {
      const base = { title: 'Save this?', message: 'Please confirm you want to save this.', confirmLabel: 'Save' };
      const ask = typeof confirmOpts === 'string' ? { ...base, message: confirmOpts } : { ...base, ...(confirmOpts || {}) };
      if (!(await confirm(ask))) return undefined;
    }
    setBusy(true); setError(null);
    try {
      const r = await fn(...args);
      if (success) toast.success(success);
      return r;
    } catch (e) { setError(e); return undefined; } finally { setBusy(false); }
  };
  return { busy, error, submit, setError };
}
