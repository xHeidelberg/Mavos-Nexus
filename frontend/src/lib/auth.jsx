import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setHandlers, setToken } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (localStorage.getItem('mavos_token') ? read('mavos_user') : null));
  const [mustChange, setMustChange] = useState(() => localStorage.getItem('mavos_must_change') === '1');

  const persist = (u, mc) => {
    setUser(u);
    setMustChange(mc);
    if (u) localStorage.setItem('mavos_user', JSON.stringify(u)); else localStorage.removeItem('mavos_user');
    localStorage.setItem('mavos_must_change', mc ? '1' : '0');
  };

  const logout = useCallback(() => {
    setToken(null);
    persist(null, false);
  }, []);

  useEffect(() => {
    setHandlers({
      authLost: logout,
      passwordRequired: () => persist(read('mavos_user'), true),
    });
  }, [logout]);

  // Refresh the profile (branch name, PIN flag, etc.) when the app opens.
  useEffect(() => {
    if (!localStorage.getItem('mavos_token')) return;
    api.get('/auth/me').then((r) => persist(r.user, localStorage.getItem('mavos_must_change') === '1')).catch(() => {});
  }, []);

  const login = async (username, password) => {
    const r = await api.post('/auth/login', { username, password });
    setToken(r.token);
    let u = r.user;
    try { u = (await api.get('/auth/me')).user; } catch { /* keep the basic profile */ }
    persist(u, r.must_change_password);
    return r;
  };

  const passwordChanged = () => persist(user, false);
  const refresh = async () => { const r = await api.get('/auth/me'); persist(r.user, mustChange); };
  const signOut = async () => { try { await api.post('/auth/logout'); } catch { /* ignore */ } logout(); };

  const value = useMemo(() => ({ user, mustChange, login, logout: signOut, passwordChanged, refresh }), [user, mustChange]); // eslint-disable-line
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
