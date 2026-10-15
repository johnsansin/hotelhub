'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

const ROLE_HOME = {
  superadmin: '/superadmin',
  admin: '/dashboard',
  manager: '/dashboard',
  receptionist: '/dashboard/frontdesk',
  housekeeper: '/dashboard/housekeeping',
  accountant: '/dashboard/accounts',
  storekeeper: '/dashboard/inventory',
  restaurant: '/dashboard/restaurant',
  staff: '/dashboard',
};

export function homeFor(role) {
  return ROLE_HOME[role] || '/dashboard';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setUser(data.user);
      setModules(data.modules || []);
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    setUser(data.user);
    await refresh();
    return data.user;
  }, [refresh]);

  const register = useCallback(async (payload) => {
    const data = await api.post('/auth/register', payload);
    setUser(data.user);
    await refresh();
    return data.user;
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, modules, loading, login, register, logout, refresh, isSuper: user?.role === 'superadmin' }),
    [user, modules, loading, login, register, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
