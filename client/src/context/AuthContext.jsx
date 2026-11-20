/**
 * context/AuthContext.jsx - Global "who is logged in?" state using React Context.
 *
 * AUTH FLOW (frontend side):
 *   - On start-up we call GET /api/auth/me. The session token itself lives in an
 *     HttpOnly cookie that JavaScript can never read (protects against XSS theft).
 *   - login()/register() POST the form; the server sets the cookie and returns the user,
 *     which we store in context so every component re-renders with the new user.
 *   - logout() asks the server to delete the session, then clears the user.
 * Any component can read it with:  const { user, login, logout } = useAuth();
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user: me } = await api.get('/api/auth/me');
      setUser(me);
      return me;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (credentials) => {
    const res = await api.post('/api/auth/login', credentials);
    setUser(res.user);
    return res;
  }, []);

  const register = useCallback(async (data) => {
    const res = await api.post('/api/auth/register', data);
    setUser(res.user);
    return res;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/api/auth/logout'); } catch { /* already logged out */ }
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout, refresh, setUser }), [user, loading, login, register, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export const homeFor = (user) => (user?.role === 'admin' ? '/admin' : '/dashboard');
