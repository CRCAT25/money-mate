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

  const reloadBaseData = useCallback(async () => {
    if (!user) return;
    const [familyResponse, categoriesResponse] = await Promise.all([
      api.get('/family'),
      api.get('/categories'),
    ]);
    setFamilyDetails(familyResponse.data);
    setCategories(categoriesResponse.data);
    if (familyResponse.data.revisions) syncState.current = familyResponse.data.revisions;
    setLoading(false);
  }, [user]);

  const checkForChanges = useCallback(async () => {
    if (!user) return;
    if (syncRequest.current) return syncRequest.current;

    const request = api.get('/family/sync').then(async ({ data }) => {
      const previous = syncState.current;
      syncState.current = data;
      if (!previous) return;

      const baseChanged = data.baseRevision !== previous.baseRevision;
      const transactionsChanged = data.transactionsRevision !== previous.transactionsRevision;
      if (baseChanged) await reloadBaseData();
      if (baseChanged || transactionsChanged) setRevision((value) => value + 1);
    }).finally(() => {
      syncRequest.current = null;
    });
    syncRequest.current = request;
    return request;
  }, [user, reloadBaseData]);

  useEffect(() => {
    if (!user) {
      setFamilyDetails(null);
      setCategories([]);
      syncState.current = null;
      setLoading(false);
      return;
    }
    setLoading(true);
    reloadBaseData().catch((error) => {
      setLoading(false);
      notify(errorMessage(error), 'error');
    });
  }, [user, pathname, reloadBaseData, notify]);

  useEffect(() => {
    if (!user) return undefined;
    const socketUrl = import.meta.env.VITE_SOCKET_URL
      || (window.location.hostname === 'localhost' ? 'http://localhost:4000' : null);
    const syncChanged = () => checkForChanges().catch(() => {});
    if (socketUrl) {
      const socket = io(socketUrl, { auth: { token: sessionStorage.getAccess() } });
      socket.on('transactions:changed', syncChanged);
      socket.on('categories:changed', syncChanged);
      socket.on('family:changed', syncChanged);
      return () => socket.disconnect();
    }

    return undefined;
  }, [user, checkForChanges]);

  // Local mutations already know the data changed; update dependent pages without
  // an extra sync request, while socket events still use revision checks.
  const touch = useCallback(() => setRevision((value) => value + 1), []);
  const value = useMemo(
    () => ({ familyDetails, categories, revision, loading, reloadBaseData, touch }),
    [familyDetails, categories, revision, loading, reloadBaseData, touch],
  );
  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}

export const useFamilyData = () => useContext(FamilyContext);
