import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { Badge, Empty, ErrorNote, Input, Segmented, Select, Spinner, cx } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

const SORTS = [{ value: 'recent', label: 'Recent' }, { value: 'name', label: 'Name' }, { value: 'branch', label: 'Branch' }];
const keyOf = (t) => `${t.type}:${t.id}`;

function when(ts) {
  if (!ts) return '';
  const d = new Date(ts.replace(' ', 'T'));
  const same = d.toDateString() === new Date().toDateString();
  return same ? d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}
const pingUnread = () => window.dispatchEvent(new Event('mavos-unread-refresh'));

export default function Messages() {
  const [qInput, setQInput] = useState('');
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('');
  const [sort, setSort] = useState('recent');
  const [active, setActive] = useState(null); // { type, id, name }

  useEffect(() => { const t = setTimeout(() => setSearch(qInput.trim()), 250); return () => clearTimeout(t); }, [qInput]);

  const { data: branches } = useAsync(() => api.get('/branches'), []);
  const contacts = useAsync(() => api.get('/messages/contacts', { search, branch_id: branch, sort }), [search, branch, sort], { pollMs: 12000 });
  const found = useAsync(() => (search.length >= 2 ? api.get('/messages/search', { q: search }) : Promise.resolve([])), [search]);

  const people = contacts.data?.people || [];
  const rooms = contacts.data?.branches || [];
  // When sorting by branch, show a heading for each branch.
  const grouped = useMemo(() => {
    if (sort !== 'branch') return [{ heading: null, items: people }];
    const m = new Map();
    people.forEach((p) => { const k = p.branch_name || 'No branch'; m.set(k, [...(m.get(k) || []), p]); });
    return [...m].map(([heading, items]) => ({ heading, items }));
  }, [people, sort]);

  const Row = ({ t, title, sub, preview, at, unread }) => {
    const on = active && keyOf(active) === keyOf(t);
    return (
      <button onClick={() => setActive(t)} className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', on ? 'bg-ledger-soft' : 'hover:bg-paper')}>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-line/70 font-display font-bold">{title.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2"><b className="truncate">{title}</b><span className="shrink-0 text-xs text-muted">{when(at)}</span></span>
          <span className="flex items-center justify-between gap-2">
            <span className={cx('truncate text-sm', unread ? 'font-semibold' : 'text-muted')}>{preview || sub}</span>
            {unread > 0 && <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-ledger px-1.5 text-xs font-bold text-on-ledger">{unread}</span>}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="grid h-full min-h-[28rem] gap-4 lg:grid-cols-[360px_1fr]">
      {/* People and rooms */}
      <section className={cx('flex min-h-0 flex-col rounded-xl border border-line bg-surface', active && 'hidden lg:flex')}>
        <div className="space-y-2 border-b border-line p-3">
          <h1 className="text-xl font-bold">Messages</h1>
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search people, branches or messages" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Filter by branch" className="min-w-0 flex-1"><option value="">All branches</option>{(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
            <Segmented label="Sort by" options={SORTS} value={sort} onChange={setSort} className="w-full sm:w-auto" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <ErrorNote error={contacts.error} className="m-1" />
          {contacts.loading && !contacts.data ? <Spinner /> : (
            <>
              {rooms.length > 0 && <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Branch rooms</p>}
              {rooms.map((b) => <Row key={`b${b.id}`} t={{ type: 'branch', id: b.id, name: `${b.name} team` }} title={`${b.name} team`} sub="Everyone in this branch" preview={b.last_message} at={b.last_at} unread={b.unread} />)}

              <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">People</p>
              {people.length === 0 && <p className="px-3 py-4 text-sm text-muted">No one matches. Try another name or branch.</p>}
              {grouped.map((g) => (
                <div key={g.heading || 'all'}>
                  {g.heading && <p className="sticky top-0 bg-surface/95 px-3 py-1 text-xs font-semibold text-ledger">{g.heading}</p>}
                  {g.items.map((p) => <Row key={p.id} t={{ type: 'direct', id: p.id, name: p.full_name }} title={p.full_name} sub={`${p.role === 'admin' ? 'Admin' : p.role === 'staff' ? 'Staff' : 'Sales'}${p.branch_name ? ` · ${p.branch_name}` : ''}`} preview={p.last_message} at={p.last_at} unread={p.unread} />)}
                </div>
              ))}

              {search.length >= 2 && (found.data?.length || 0) > 0 && (
                <>
                  <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">Messages matching “{search}”</p>
                  {found.data.map((m) => (
                    <button key={m.id} onClick={() => setActive({ type: m.type, id: m.type === 'direct' ? m.user_id : m.branch_id, name: m.label })}
                      className="block w-full rounded-xl px-3 py-2 text-left hover:bg-paper">
                      <span className="flex justify-between gap-2 text-xs text-muted"><b className="text-ink">{m.label}</b><span>{when(String(m.created_at).replace('T', ' ').slice(0, 19))}</span></span>
                      <span className="line-clamp-2 text-sm">{m.sender_name}: {m.body}</span>
                    </button>))}
                </>
              )}
            </>
          )}
        </div>
      </section>

      {/* Conversation */}
      <section className={cx('min-h-0 rounded-xl border border-line bg-surface', !active && 'hidden lg:block')}>
        {active ? <Thread key={keyOf(active)} target={active} onBack={() => setActive(null)} onSent={contacts.reload} />
          : <div className="grid h-full place-items-center p-6"><Empty title="Pick someone to message" hint="Choose a person or a branch room on the left. Admins can reach everyone; everyone else can reach admins and their own branch." /></div>}
      </section>
    </div>
  );
}

function Thread({ target, onBack, onSent }) {
  const { user } = useAuth();
  const params = target.type === 'direct' ? { type: 'direct', user_id: target.id } : { type: 'branch', branch_id: target.id };
  const thread = useAsync(() => api.get('/messages/thread', params), [target.type, target.id], { pollMs: 4000 });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);
  const endRef = useRef(null);
  const messages = thread.data?.messages || [];

  useEffect(() => { pingUnread(); }, [thread.data]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  // Chat messages are sent straight away (no confirmation dialog): confirming every message would make chat unusable.
  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setErr(null);
    try { await api.post('/messages/send', { ...params, body }); setText(''); await thread.reload(); onSent?.(); pingUnread(); }
    catch (e) { setErr(e); } finally { setSending(false); }
  };

  let lastDay = '';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <button onClick={onBack} aria-label="Back" className="grid size-9 place-items-center rounded-lg hover:bg-paper lg:hidden"><Icon name="back" /></button>
        <span className="grid size-9 place-items-center rounded-full bg-line/70 font-display font-bold">{(thread.data?.title || target.name).slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0"><p className="truncate font-semibold">{thread.data?.title || target.name}</p><p className="text-xs text-muted">{target.type === 'branch' ? 'Branch room' : 'Direct message'}</p></div>
      </header>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-paper/60 p-3">
        {thread.loading && !thread.data && <Spinner />}
        <ErrorNote error={thread.error} />
        {thread.data && messages.length === 0 && <p className="py-10 text-center text-sm text-muted">No messages yet. Say hello.</p>}
        {messages.map((m) => {
          const mine = m.sender_id === user.id;
          const day = new Date(m.created_at).toDateString();
          const head = day !== lastDay ? new Date(m.created_at).toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' }) : null;
          lastDay = day;
          return (
            <div key={m.id}>
              {head && <p className="my-2 text-center text-xs text-muted">{head}</p>}
              <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cx('max-w-[82%] rounded-2xl px-3.5 py-2 text-[15px]', mine ? 'rounded-br-md bg-ledger text-on-ledger' : 'rounded-bl-md border border-line bg-surface')}>
                  {!mine && target.type === 'branch' && <p className="mb-0.5 text-xs font-semibold text-ledger">{m.sender_name}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cx('mt-0.5 text-right text-[11px]', mine ? 'text-on-ledger/70' : 'text-muted')}>{new Date(m.created_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line p-3">
        <ErrorNote error={err} className="mb-2" />
        <div className="flex items-end gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000} placeholder="Write a message…" aria-label="Message"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-ledger focus:ring-4 focus:ring-ledger/15" />
          <button onClick={send} disabled={!text.trim() || sending} aria-label="Send"
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-ledger text-on-ledger transition-all hover:bg-ledger-dark active:scale-95 disabled:opacity-50"><Icon name="send" /></button>
        </div>
        <p className="mt-1 hidden text-xs text-muted sm:block">Enter to send · Shift+Enter for a new line</p>
      </div>
    </div>
  );
}
