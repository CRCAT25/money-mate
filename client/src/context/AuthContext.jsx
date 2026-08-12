import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { setApiSpace } from '../utils/api.js';
import { sessionStorage, spaceStorage } from '../utils/storage.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [family, setFamily] = useState(null);
  const [spaces, setSpaces] = useState([]);
  const [activeSpaceId, setActiveSpaceIdState] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    if (!sessionStorage.getAccess() && !sessionStorage.getRefresh()) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      setSpaces(data.spaces || []);
      const selectedId = spaceStorage.get(data.user.id);
      const nextSpace = data.spaces?.find((space) => space.id === selectedId)
        || data.spaces?.find((space) => space.id === data.defaultSpaceId)
        || data.spaces?.[0]
        || null;
      setActiveSpaceIdState(nextSpace?.id || null);
      setApiSpace(nextSpace?.id);
      setFamily(nextSpace);
    } catch {
      sessionStorage.clear();
      setUser(null);
      setFamily(null);
      setSpaces([]);
      setActiveSpaceIdState(null);
      setApiSpace(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    const expire = () => {
      setUser(null);
      setFamily(null);
      setSpaces([]);
      setActiveSpaceIdState(null);
      setApiSpace(null);
    };
    window.addEventListener('moneymate:session-expired', expire);
    return () => window.removeEventListener('moneymate:session-expired', expire);
  }, [loadProfile]);

  const login = useCallback(async (credentials) => {
    const { data } = await api.post('/auth/login', credentials);
    sessionStorage.set(data);
    setUser(data.user);
    setSpaces(data.spaces || []);
    const selectedId = spaceStorage.get(data.user.id);
    const nextSpace = data.spaces?.find((space) => space.id === selectedId)
      || data.spaces?.find((space) => space.id === data.defaultSpaceId)
      || data.spaces?.[0]
      || null;
    setActiveSpaceIdState(nextSpace?.id || null);
    setApiSpace(nextSpace?.id);
    setFamily(nextSpace);
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
    setSpaces([]);
    setActiveSpaceIdState(null);
    setApiSpace(null);
  }, []);

  const selectSpace = useCallback((spaceId) => {
    const nextSpace = spaces.find((space) => space.id === spaceId);
    if (!nextSpace || !user) return;
    spaceStorage.set(user.id, nextSpace.id);
    setApiSpace(nextSpace.id);
    setActiveSpaceIdState(nextSpace.id);
    setFamily(nextSpace);
  }, [spaces, user]);

  const value = useMemo(
    () => ({ user, family, spaces, activeSpaceId, loading, login, logout, refreshProfile: loadProfile, selectSpace, setFamily, setUser }),
    [user, family, spaces, activeSpaceId, loading, login, logout, loadProfile, selectSpace],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
