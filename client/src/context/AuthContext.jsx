import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../utils/api.js';
import { sessionStorage } from '../utils/storage.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [family, setFamily] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    if (!sessionStorage.getAccess() && !sessionStorage.getRefresh()) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      setFamily(data.family);
    } catch {
      sessionStorage.clear();
      setUser(null);
      setFamily(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    const expire = () => {
      setUser(null);
      setFamily(null);
    };
    window.addEventListener('moneymate:session-expired', expire);
    return () => window.removeEventListener('moneymate:session-expired', expire);
  }, [loadProfile]);

  const login = useCallback(async (credentials) => {
    const { data } = await api.post('/auth/login', credentials);
    sessionStorage.set(data);
    setUser(data.user);
    setFamily(data.family);
    return data;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = sessionStorage.getRefresh();
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch {
      // Local logout still succeeds if the server is unavailable.
    }
    sessionStorage.clear();
    setUser(null);
    setFamily(null);
  }, []);

  const value = useMemo(
    () => ({ user, family, loading, login, logout, refreshProfile: loadProfile, setFamily, setUser }),
    [user, family, loading, login, logout, loadProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

