const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

let token = localStorage.getItem('mavos_token');
let handlers = { authLost: () => {}, passwordRequired: () => {} };

export const setToken = (t) => {
  token = t;
  if (t) localStorage.setItem('mavos_token', t);
  else localStorage.removeItem('mavos_token');
};
export const setHandlers = (h) => { handlers = { ...handlers, ...h }; };

export class ApiError extends Error {
  constructor(message, status, details, isNetwork = false) {
    super(message);
    this.status = status;
    this.details = details;
    this.isNetwork = isNetwork;
  }
}

function qs(query) {
  const p = new URLSearchParams();
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== false) p.append(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request(method, path, { body, query, raw } = {}) {
  let res;
  try {
    res = await fetch(BASE + path + qs(query), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your internet connection.', 0, null, true);
  }
  if (res.ok && raw) return res;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) handlers.authLost();
    if (res.status === 403 && data?.details?.code === 'PASSWORD_CHANGE_REQUIRED') handlers.passwordRequired();
    const validation = data?.errors ? Object.values(data.errors)[0]?.[0] : null;
    throw new ApiError(data?.error || validation || data?.message || 'Something went wrong', res.status, data?.details ?? data?.errors);
  }
  return data;
}

export const api = {
  get: (p, query) => request('GET', p, { query }),
  post: (p, body) => request('POST', p, { body: body ?? {} }),
  patch: (p, body) => request('PATCH', p, { body: body ?? {} }),
  put: (p, body) => request('PUT', p, { body: body ?? {} }),
  delete: (p) => request('DELETE', p),
  async download(p, query, filename) {
    const res = await request('GET', p, { query, raw: true });
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
