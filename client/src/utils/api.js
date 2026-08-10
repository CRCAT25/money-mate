import axios from 'axios';
import { sessionStorage } from './storage.js';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000/api' : '/api'),
  timeout: 12000,
});

api.interceptors.request.use((request) => {
  const token = sessionStorage.getAccess();
  if (token) request.headers.Authorization = `Bearer ${token}`;
  return request;
});

let refreshPromise;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original?._retry || original?.url?.includes('/auth/refresh')) {
      throw error;
    }
    const refreshToken = sessionStorage.getRefresh();
    if (!refreshToken) throw error;

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
      sessionStorage.clear();
      window.dispatchEvent(new Event('moneymate:session-expired'));
      throw refreshError;
    }
  },
);

export function errorMessage(error) {
  if (error.code === 'ECONNABORTED' || !error.response) return 'Không thể kết nối máy chủ. Hãy kiểm tra mạng và thử lại.';
  return error.response?.data?.message || 'Có lỗi xảy ra. Vui lòng thử lại.';
}

export default api;
