import axios, { type InternalAxiosRequestConfig } from 'axios';
import { getServerBaseUrl } from '@/lib/serverUrl';
import { getAccessToken, getRefreshToken, setTokens } from '@/lib/authStore';

const api = axios.create({
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

let refreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const baseURL = await getServerBaseUrl();
    if (!config.baseURL) config.baseURL = baseURL;
    const token = await getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (err) => Promise.reject(err)
);

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status !== 401 || original._retry) {
      return Promise.reject(err);
    }
    if (refreshing) {
      return new Promise((resolve) => {
        addRefreshSubscriber((token: string) => {
          original.headers.Authorization = `Bearer ${token}`;
          resolve(api(original));
        });
      });
    }
    original._retry = true;
    refreshing = true;
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return Promise.reject(err);
      const baseURL = await getServerBaseUrl();
      const { data } = await axios.post(
        `${baseURL}/api/mobile/auth/refresh`,
        { refreshToken },
        { timeout: 15000 }
      );
      const { accessToken: newAccess, refreshToken: newRefresh } = data;
      if (newAccess && newRefresh) {
        await setTokens(newAccess, newRefresh);
        onRefreshed(newAccess);
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      }
    } catch (_) {
      // refresh failed; let caller handle (e.g. redirect to login)
    } finally {
      refreshing = false;
    }
    return Promise.reject(err);
  }
);

export default api;
