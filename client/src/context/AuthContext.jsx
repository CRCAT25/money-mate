import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { setApiSpace } from '../utils/api.js';
import { disablePushNotifications } from '../utils/pushNotifications.js';
import { sessionStorage, spaceStorage, userStorage } from '../utils/storage.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(() => {
    const hasTokens = Boolean(sessionStorage.getAccess() || sessionStorage.getRefresh());
    return hasTokens ? userStorage.get() : null;
  });
  const [spaces, setSpaces] = useState(() => {
    const hasTokens = Boolean(sessionStorage.getAccess() || sessionStorage.getRefresh());
    return hasTokens ? userStorage.getSpaces() : [];
  });
  const [activeSpaceId, setActiveSpaceIdState] = useState(() => {
    const hasTokens = Boolean(sessionStorage.getAccess() || sessionStorage.getRefresh());
    if (!hasTokens) return null;
    const cachedUser = userStorage.get();
    const cachedSpaces = userStorage.getSpaces();
    if (!cachedUser) return null;
    const selectedId = spaceStorage.get(cachedUser.id);
    const space = cachedSpaces.find((s) => s.id === selectedId) || cachedSpaces[0];
    return space?.id || null;
  });
  const [family, setFamily] = useState(() => {
    const hasTokens = Boolean(sessionStorage.getAccess() || sessionStorage.getRefresh());
    if (!hasTokens) return null;
    const cachedUser = userStorage.get();
    const cachedSpaces = userStorage.getSpaces();
    if (!cachedUser) return null;
    const selectedId = spaceStorage.get(cachedUser.id);
    const space = cachedSpaces.find((s) => s.id === selectedId) || cachedSpaces[0];
    if (space?.id) {
      setApiSpace(space.id);
    }
    return space || null;
  });
  const [loading, setLoading] = useState(() => {
    const hasTokens = Boolean(sessionStorage.getAccess() || sessionStorage.getRefresh());
    if (!hasTokens) return false;
    return !userStorage.get();
  });

  const setUser = useCallback((nextUser) => {
    setUserState((prev) => {
      const resolved = typeof nextUser === 'function' ? nextUser(prev) : nextUser;
      userStorage.set(resolved);
      return resolved;
    });
  }, []);

  const loadProfile = useCallback(async () => {
    if (!sessionStorage.getAccess() && !sessionStorage.getRefresh()) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      setSpaces(data.spaces || []);
      userStorage.setSpaces(data.spaces || []);
      const requestedSpaceId = consumeNotificationSpace();
      const selectedId = requestedSpaceId || spaceStorage.get(data.user.id);
      const nextSpace = data.spaces?.find((space) => space.id === selectedId)
        || data.spaces?.find((space) => space.id === data.defaultSpaceId)
        || data.spaces?.[0]
        || null;
      setActiveSpaceIdState(nextSpace?.id || null);
      if (nextSpace) spaceStorage.set(data.user.id, nextSpace.id);
      setApiSpace(nextSpace?.id);
      setFamily(nextSpace);
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        sessionStorage.clear();
        setUserState(null);
        setFamily(null);
        setSpaces([]);
        setActiveSpaceIdState(null);
        setApiSpace(null);
      }
    } finally {
      setLoading(false);
    }
  }, [setUser]);

  useEffect(() => {
    loadProfile();
    const expire = () => {
      void disablePushNotifications({ notifyServer: false });
      sessionStorage.clear();
      setUserState(null);
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
    userStorage.setSpaces(data.spaces || []);
    const requestedSpaceId = consumeNotificationSpace();
    const selectedId = requestedSpaceId || spaceStorage.get(data.user.id);
    const nextSpace = data.spaces?.find((space) => space.id === selectedId)
      || data.spaces?.find((space) => space.id === data.defaultSpaceId)
      || data.spaces?.[0]
      || null;
    setActiveSpaceIdState(nextSpace?.id || null);
    if (nextSpace) spaceStorage.set(data.user.id, nextSpace.id);
    setApiSpace(nextSpace?.id);
    setFamily(nextSpace);
    return data;
  }, [setUser]);

  const logout = useCallback(async () => {
    const refreshToken = sessionStorage.getRefresh();
    try {
      await disablePushNotifications();
    } catch {
      // Logging out must still work if notification cleanup is unavailable.
    }
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch {
      // Local logout still succeeds if the server is unavailable.
    }
    sessionStorage.clear();
    setUserState(null);
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
    [user, family, spaces, activeSpaceId, loading, login, logout, loadProfile, selectSpace, setUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

function consumeNotificationSpace() {
  const url = new URL(window.location.href);
  const spaceId = url.searchParams.get('spaceId');
  if (!spaceId) return null;
  url.searchParams.delete('spaceId');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return spaceId;
}
