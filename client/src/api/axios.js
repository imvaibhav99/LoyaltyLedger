import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let queue = [];

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const isAuthPath = original?.url?.startsWith('/auth/login') || original?.url?.startsWith('/auth/signup') || original?.url?.startsWith('/auth/refresh');
    if (err.response?.status !== 401 || original._retry || isAuthPath) {
      return Promise.reject(err);
    }
    original._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    isRefreshing = true;
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) throw new Error('No refresh token');
      const { data } = await axios.post('/api/auth/refresh', { refreshToken });
      const { accessToken, refreshToken: newRefresh } = data.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', newRefresh);
      queue.forEach((p) => p.resolve(accessToken));
      queue = [];
      original.headers.Authorization = `Bearer ${accessToken}`;
      return api(original);
    } catch (refreshErr) {
      queue.forEach((p) => p.reject(refreshErr));
      queue = [];
      localStorage.clear();
      window.location.href = '/login';
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

export const apiMessage = (err) =>
  err?.response?.data?.message || err?.message || 'Something went wrong';

export default api;
