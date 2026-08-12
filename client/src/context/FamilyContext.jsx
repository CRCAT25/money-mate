import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import api, { errorMessage } from '../utils/api.js';
import { sessionStorage } from '../utils/storage.js';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';

const FamilyContext = createContext(null);

export function FamilyProvider({ children }) {
  const { user } = useAuth();
  const { notify } = useToast();
  const { pathname } = useLocation();
  const [familyDetails, setFamilyDetails] = useState(null);
  const [categories, setCategories] = useState([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const syncState = useRef(null);
  const syncRequest = useRef(null);
  const pendingLocalTransactions = useRef(0);
  const pageCache = useRef(new Map());
  const pageRequests = useRef(new Map());
  const cacheGeneration = useRef(0);

  const clearPageCache = useCallback(() => {
    cacheGeneration.current += 1;
    pageCache.current.clear();
    pageRequests.current.clear();
  }, []);

  const reloadBaseData = useCallback(async () => {
    if (!user) return;
    const [familyResponse, categoriesResponse] = await Promise.all([
      api.get('/family'),
      api.get('/categories'),
    ]);
    setFamilyDetails(familyResponse.data);
    setCategories(categoriesResponse.data);
    clearPageCache();
    if (familyResponse.data.revisions) syncState.current = familyResponse.data.revisions;
    setLoading(false);
  }, [user, clearPageCache]);

  const checkForChanges = useCallback(async () => {
    if (!user) return;
    if (syncRequest.current) return syncRequest.current;

    const request = api.get('/family/sync').then(async ({ data }) => {
      const previous = syncState.current;
      syncState.current = data;
      if (!previous) return;

      const baseChanged = data.baseRevision !== previous.baseRevision;
      const transactionDelta = Math.max(0, data.transactionsRevision - previous.transactionsRevision);
      const localTransactions = Math.min(transactionDelta, pendingLocalTransactions.current);
      pendingLocalTransactions.current -= localTransactions;
      const transactionsChanged = transactionDelta > localTransactions;
      if (baseChanged || transactionsChanged) clearPageCache();
      if (baseChanged) await reloadBaseData();
      if (baseChanged || transactionsChanged) setRevision((value) => value + 1);
    }).finally(() => {
      syncRequest.current = null;
    });
    syncRequest.current = request;
    return request;
  }, [user, reloadBaseData, clearPageCache]);

  useEffect(() => {
    if (!user) {
      setFamilyDetails(null);
      setCategories([]);
      syncState.current = null;
      pendingLocalTransactions.current = 0;
      clearPageCache();
      setLoading(false);
      return;
    }
    setLoading(true);
    reloadBaseData().catch((error) => {
      setLoading(false);
      notify(errorMessage(error), 'error');
    });
  }, [user, reloadBaseData, notify, clearPageCache]);

  useEffect(() => {
    if (!user || !syncState.current) return;
    checkForChanges().catch(() => {});
  }, [pathname, user, checkForChanges]);

  useEffect(() => {
    if (!user) return undefined;
    let timeout;
    const handleApiActivity = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        if (syncState.current) checkForChanges().catch(() => {});
      }, 120);
    };
    window.addEventListener('moneymate:api-activity', handleApiActivity);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('moneymate:api-activity', handleApiActivity);
    };
  }, [user, checkForChanges]);

  useEffect(() => {
    if (!user) return undefined;
    const socketUrl = import.meta.env.VITE_SOCKET_URL
      || (window.location.hostname === 'localhost' ? 'http://localhost:4000' : null);
    const syncChanged = () => checkForChanges().catch(() => {});
    if (socketUrl) {
      const socket = io(socketUrl, { auth: { token: sessionStorage.getAccess() } });
      socket.on('transactions:changed', syncChanged);
      socket.on('categories:changed', syncChanged);
      socket.on('budgets:changed', syncChanged);
      socket.on('family:changed', syncChanged);
      return () => socket.disconnect();
    }

    return undefined;
  }, [user, checkForChanges]);

  const getCache = useCallback((key) => pageCache.current.get(key), []);
  const setCache = useCallback((key, value) => pageCache.current.set(key, value), []);
  const loadCache = useCallback((key, loader) => {
    const cached = pageCache.current.get(key);
    if (cached?.revision === revision) return Promise.resolve(cached);

    const requestKey = `${revision}:${key}`;
    const pending = pageRequests.current.get(requestKey);
    if (pending) return pending;

    const generation = cacheGeneration.current;
    const request = Promise.resolve()
      .then(loader)
      .then((value) => {
        const entry = { ...value, revision };
        if (cacheGeneration.current === generation) pageCache.current.set(key, entry);
        return entry;
      })
      .finally(() => {
        if (pageRequests.current.get(requestKey) === request) pageRequests.current.delete(requestKey);
      });
    pageRequests.current.set(requestKey, request);
    return request;
  }, [revision]);
  const touch = useCallback(() => {
    pendingLocalTransactions.current += 1;
    clearPageCache();
    setRevision((value) => value + 1);
  }, [clearPageCache]);
  const value = useMemo(
    () => ({ familyDetails, categories, revision, loading, reloadBaseData, touch, getCache, setCache, loadCache }),
    [familyDetails, categories, revision, loading, reloadBaseData, touch, getCache, setCache, loadCache],
  );
  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}

export const useFamilyData = () => useContext(FamilyContext);
