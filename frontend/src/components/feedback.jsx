import { useEffect, useState } from 'react';
import Icon from './Icon';
import { Button, Modal, cx } from './ui';
import { listen } from '../lib/toast';

const TONE = {
  success: 'border-ledger/40 bg-ledger-soft text-ledger-dark',
  error: 'border-danger/40 bg-danger-soft text-danger',
  info: 'border-line bg-surface text-ink',
};

/** Mount once. Renders toasts and the confirm dialog. */
export default function FeedbackHost() {
  const [toasts, setToasts] = useState([]);
  const [ask, setAsk] = useState(null);

  useEffect(() => listen('toast', (t) => {
    setToasts((l) => [...l.slice(-3), t]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== t.id)), 3800);
  }), []);
  useEffect(() => listen('confirm', setAsk), []);

  const close = (v) => { ask?.resolve(v); setAsk(null); };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-3 safe-top sm:items-end" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={cx('animate-toast pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-pop', TONE[t.type])}>
            <Icon name={t.type === 'error' ? 'alert' : t.type === 'success' ? 'check' : 'info'} className="size-4 shrink-0" />
            {t.message}
          </div>
        ))}
      </div>
      {ask && (
        <Modal title={ask.title || 'Are you sure?'} onClose={() => close(false)}
          footer={<><Button variant="secondary" onClick={() => close(false)}>Cancel</Button>
            <Button autoFocus variant={ask.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{ask.confirmLabel || 'Confirm'}</Button></>}>
          <p className="text-sm text-muted">{ask.message}</p>
        </Modal>
      )}
    </>
  );
}
