import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import api, { errorMessage } from '../utils/api.js';
import { sessionStorage } from '../utils/storage.js';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';

const FamilyContext = createContext(null);

export function FamilyProvider({ children }) {
  const { user, family: activeSpace, activeSpaceId } = useAuth();
  const { notify } = useToast();
  const { pathname } = useLocation();
  const [familyDetails, setFamilyDetails] = useState(null);
  const [categories, setCategories] = useState([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const revisionRef = useRef(0);
  const syncState = useRef(null);
  const syncRequest = useRef(null);
  const pendingLocalTransactions = useRef(0);
  const pendingLocalBaseChanges = useRef(0);
  const pageCache = useRef(new Map());
  const pageRequests = useRef(new Map());
  const cacheGeneration = useRef(0);

  const clearPageCache = useCallback(() => {
    cacheGeneration.current += 1;
    pageCache.current.clear();
    pageRequests.current.clear();
  }, []);

  const invalidatePageCache = useCallback(() => {
    cacheGeneration.current += 1;
    pageRequests.current.clear();
  }, []);

  const bumpRevision = useCallback(() => {
    revisionRef.current += 1;
    setRevision(revisionRef.current);
    return revisionRef.current;
  }, []);

  const reloadBaseData = useCallback(async () => {
    if (!user || !activeSpaceId) return;
    const requestedSpaceId = activeSpaceId;
    const [familyResponse, categoriesResponse] = await Promise.all([
      api.get(`/spaces/${requestedSpaceId}`),
      api.get('/categories'),
    ]);
    if (requestedSpaceId !== activeSpaceId) return;
    setFamilyDetails(familyResponse.data);
    setCategories(categoriesResponse.data);
    clearPageCache();
    if (familyResponse.data.revisions) syncState.current = familyResponse.data.revisions;
    setLoading(false);
  }, [user, activeSpaceId, clearPageCache]);

  const checkForChanges = useCallback(async () => {
    if (!user) return;
    if (syncRequest.current) return syncRequest.current;

    const request = api.get(`/spaces/${activeSpaceId}`).then(async ({ data }) => {
      data = data.revisions;
      const previous = syncState.current;
      syncState.current = data;
      if (!previous) return;

      const baseDelta = Math.max(0, data.baseRevision - previous.baseRevision);
      const localBaseChanges = Math.min(baseDelta, pendingLocalBaseChanges.current);
      pendingLocalBaseChanges.current -= localBaseChanges;
      const baseChanged = baseDelta > localBaseChanges;
      const transactionDelta = Math.max(0, data.transactionsRevision - previous.transactionsRevision);
      const localTransactions = Math.min(transactionDelta, pendingLocalTransactions.current);
      pendingLocalTransactions.current -= localTransactions;
      const transactionsChanged = transactionDelta > localTransactions;
      if (transactionsChanged && !baseChanged) invalidatePageCache();
      if (baseChanged) await reloadBaseData();
      if (baseChanged || transactionsChanged) bumpRevision();
    }).finally(() => {
      syncRequest.current = null;
    });
    syncRequest.current = request;
    return request;
  }, [user, activeSpaceId, reloadBaseData, invalidatePageCache, bumpRevision]);

  useEffect(() => {
    if (!user || !activeSpaceId) {
      setFamilyDetails(null);
      setCategories([]);
      syncState.current = null;
      pendingLocalTransactions.current = 0;
      pendingLocalBaseChanges.current = 0;
      clearPageCache();
      setLoading(false);
      return;
    }
    setLoading(true);
    setFamilyDetails(null);
    setCategories([]);
    syncState.current = null;
    pendingLocalTransactions.current = 0;
    pendingLocalBaseChanges.current = 0;
    clearPageCache();
    reloadBaseData().catch((error) => {
      setLoading(false);
      notify(errorMessage(error), 'error');
    });
  }, [user, activeSpaceId, reloadBaseData, notify, clearPageCache]);

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
    const syncChanged = (payload) => {
      if (!payload?.spaceId || payload.spaceId === activeSpaceId) checkForChanges().catch(() => {});
    };
    if (socketUrl) {
      const socket = io(socketUrl, { auth: { token: sessionStorage.getAccess() } });
      socket.on('transactions:changed', syncChanged);
      socket.on('categories:changed', syncChanged);
      socket.on('budgets:changed', syncChanged);
      socket.on('family:changed', syncChanged);
      socket.on('space:changed', syncChanged);
      return () => socket.disconnect();
    }

    return undefined;
  }, [user, activeSpaceId, checkForChanges]);

  useEffect(() => {
    if (!user) return undefined;
    const handlePush = (event) => {
      const payload = event.detail;
      notify(payload.body || 'Gia đình vừa có khoản chi mới.');
      if (payload?.spaceId !== activeSpaceId) return;
      checkForChanges().catch(() => {});
    };
    window.addEventListener('moneymate:push', handlePush);
    return () => window.removeEventListener('moneymate:push', handlePush);
  }, [user, activeSpaceId, checkForChanges, notify]);

  const scopedKey = useCallback((key) => `${activeSpaceId}:${key}`, [activeSpaceId]);
  const getCache = useCallback((key) => pageCache.current.get(scopedKey(key)), [scopedKey]);
  const setCache = useCallback((key, value) => {
    const entry = { ...value, revision: revisionRef.current };
    pageCache.current.set(scopedKey(key), entry);
    return entry;
  }, [scopedKey]);
  const loadCache = useCallback((key, loader) => {
    const keyForSpace = scopedKey(key);
    const currentRevision = revisionRef.current;
    const cached = pageCache.current.get(keyForSpace);
    if (cached?.revision === currentRevision) return Promise.resolve(cached);

    const requestKey = `${currentRevision}:${keyForSpace}`;
    const pending = pageRequests.current.get(requestKey);
    if (pending) return pending;

    const generation = cacheGeneration.current;
    const request = Promise.resolve()
      .then(loader)
      .then((value) => {
        const entry = { ...value, revision: currentRevision };
        if (cacheGeneration.current === generation) pageCache.current.set(keyForSpace, entry);
        return entry;
      })
      .finally(() => {
        if (pageRequests.current.get(requestKey) === request) pageRequests.current.delete(requestKey);
      });
    pageRequests.current.set(requestKey, request);
    return request;
  }, [revision, scopedKey]);

  const loadFund = useCallback((month) => {
    if (activeSpace?.type !== 'family') return Promise.resolve(null);
    const requestedMonth = /^\d{4}-\d{2}$/.test(month || '') ? month : new Date().toISOString().slice(0, 7);
    return loadCache(`fund:${requestedMonth}`, async () => {
      const { data } = await api.get('/fund', { params: { month: requestedMonth } });
      return { data };
    });
  }, [activeSpace?.type, loadCache]);

  const prefetchPages = useCallback((months) => {
    const requestedMonths = [...new Set((Array.isArray(months) ? months : [months]).filter((month) => /^\d{4}-\d{2}$/.test(month)))];
    const requests = requestedMonths.flatMap((month) => {
      const homeRequest = loadCache(`home:${month}`, async () => {
        const [summaryResponse, transactionResponse, fundEntry] = await Promise.all([
          api.get('/reports/summary', { params: { month } }),
          api.get('/transactions', { params: { month, limit: 200 } }),
          loadFund(month),
        ]);
        return { summary: summaryResponse.data, transactions: transactionResponse.data, fund: fundEntry?.data || null };
      });
      const plansRequest = loadCache(`plans:${month}`, async () => {
        const { data } = await api.get('/budgets', { params: { month } });
        return { data };
      });
      const reportsRequest = loadCache(`reports:${month}::`, async () => {
        const [homeData, trendResponse] = await Promise.all([
          homeRequest,
          api.get('/reports/trend', { params: { endMonth: month, months: 6 } }),
        ]);
        return {
          data: {
            summary: homeData.summary,
            trend: trendResponse.data,
            transactions: homeData.transactions,
          },
        };
      });
      return [homeRequest, plansRequest, reportsRequest];
    });
    return Promise.allSettled(requests);
  }, [loadCache, loadFund]);

  const touch = useCallback((kind = 'transactions') => {
    if (kind === 'base') pendingLocalBaseChanges.current += 1;
    else pendingLocalTransactions.current += 1;
    invalidatePageCache();
    return bumpRevision();
  }, [invalidatePageCache, bumpRevision]);
  const value = useMemo(
    () => ({ familyDetails, categories, revision, loading, reloadBaseData, touch, getCache, setCache, loadCache, loadFund, prefetchPages, activeSpace, isPersonal: activeSpace?.type === 'personal' }),
    [familyDetails, categories, revision, loading, reloadBaseData, touch, getCache, setCache, loadCache, loadFund, prefetchPages, activeSpace],
  );
  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}

export const useFamilyData = () => useContext(FamilyContext);
