// Offline POS queue. Sales made without internet are kept here, then sent to /sales/sync.
// Every sale has a client_uuid, so re-sending is always safe (the server ignores duplicates).
import { api } from './api';

const KEY = 'mavos_sale_queue';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const write = (q) => { localStorage.setItem(KEY, JSON.stringify(q)); window.dispatchEvent(new Event('mavos-queue')); };

export const getQueue = () => read();
export const queueSize = () => read().length;

export function enqueue(payload, summary) {
  write([...read(), { payload, summary, queued_at: new Date().toISOString() }]);
}

let flushing = false;
export async function flushQueue() {
  if (flushing) return { synced: 0, rejected: 0 };
  const queue = read();
  if (!queue.length) return { synced: 0, rejected: 0 };
  flushing = true;
  try {
    const { results } = await api.post('/sales/sync', { sales: queue.map((q) => q.payload) });
    const status = new Map(results.map((r) => [r.client_uuid, r]));
    const remaining = [];
    let synced = 0;
    for (const item of queue) {
      const r = status.get(item.payload.client_uuid);
      if (r && (r.status === 'created' || r.status === 'duplicate')) synced++;
      else remaining.push({ ...item, error: r?.error || 'Not processed' });
    }
    write(remaining);
    return { synced, rejected: remaining.length };
  } finally {
    flushing = false;
  }
}

export function discard(clientUuid) {
  write(read().filter((q) => q.payload.client_uuid !== clientUuid));
}

// Last known product list so the POS can still open without internet.
export const cacheProducts = (p) => { try { localStorage.setItem('mavos_products_cache', JSON.stringify(p)); } catch { /* full */ } };
export const cachedProducts = () => { try { return JSON.parse(localStorage.getItem('mavos_products_cache')); } catch { return null; } };
