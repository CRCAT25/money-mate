import axios from 'axios';
import { sessionStorage } from './storage.js';

let activeSpaceId;

export function setApiSpace(spaceId) {
  activeSpaceId = spaceId || null;
}

const api = axios.create({
  // Production serves the API through the same Vercel domain; never ship a local API URL.
  baseURL: import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:4000/api'),
  timeout: 12000,
});

api.interceptors.request.use((request) => {
  const token = sessionStorage.getAccess();
  if (token) request.headers.Authorization = `Bearer ${token}`;
  if (activeSpaceId) request.headers['X-MoneyMate-Space-Id'] = activeSpaceId;
  return request;
});

const inFlightGetRequests = new Map();

function getRequestKey(url, config = {}) {
  const space = activeSpaceId || '';
  const params = config.params ? JSON.stringify(config.params) : '';
  return `${space}:${url}:${params}`;
}

const originalGet = api.get.bind(api);

api.get = function deduplicatedGet(url, config) {
  if (config?.skipDeduplication) {
    return originalGet(url, config);
  }

  const key = getRequestKey(url, config);
  const pending = inFlightGetRequests.get(key);
  if (pending) {
    return pending;
  }

  const request = originalGet(url, config).finally(() => {
    if (inFlightGetRequests.get(key) === request) {
      inFlightGetRequests.delete(key);
    }
  });

  inFlightGetRequests.set(key, request);
  return request;
};

let refreshPromise;

function announceApiActivity(config) {
  const method = (config?.method || 'get').toLowerCase();
  if (method === 'get') return;
  const url = config?.url || '';
  if (url.includes('/sync') || url.includes('/spaces/') || url.includes('/auth/')) return;
  window.dispatchEvent(new Event('moneymate:api-activity'));
}

api.interceptors.response.use(
  (response) => {
    announceApiActivity(response.config);
    return response;
  },
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original?._retry || original?.url?.includes('/auth/refresh')) {
      throw error;
    }
    const refreshToken = sessionStorage.getRefresh();
    if (!refreshToken) throw error;

    // If another concurrent request already refreshed the access token, retry immediately
    const currentAccess = sessionStorage.getAccess();
    const sentAccess = original.headers?.Authorization?.replace(/^Bearer\s+/i, '');
    if (currentAccess && sentAccess && currentAccess !== sentAccess) {
      original._retry = true;
      original.headers.Authorization = `Bearer ${currentAccess}`;
      return api(original);
    }

    original._retry = true;
    refreshPromise ||= axios
      .post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken })
      .then(({ data }) => {
        sessionStorage.set(data);
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });

    try {
      const token = await refreshPromise;
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshError) {
      // Only clear credentials if the refresh token was explicitly rejected by the server (401 or 403).
      // If refresh failed due to network loss, cold-start timeout, etc., keep tokens intact so the user isn't logged out.
      if (refreshError.response?.status === 401 || refreshError.response?.status === 403) {
        sessionStorage.clear();
        window.dispatchEvent(new Event('moneymate:session-expired'));
      }
      throw refreshError;
    }
  },
);

export function errorMessage(error) {
  if (error.code === 'ECONNABORTED' || !error.response) return 'Không thể kết nối máy chủ. Hãy kiểm tra mạng và thử lại.';
  return error.response?.data?.message || 'Có lỗi xảy ra. Vui lòng thử lại.';
}

export default api;
