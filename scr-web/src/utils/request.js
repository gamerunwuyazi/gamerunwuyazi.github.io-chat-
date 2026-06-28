import axios from 'axios';
import { SERVER_URL } from './chat/config.js';
import { useBaseStore } from '@/stores/index.js';
import { refreshTokenWithQueue } from './chat/tokenManager.js';
import { logout } from './chat/ui.js';

// 创建 axios 实例
const request = axios.create({
  baseURL: SERVER_URL,
  timeout: 30000
});

// 请求拦截器 - 自动补全认证头
request.interceptors.request.use(
  config => {
    const baseStore = useBaseStore();
    if (baseStore) {
      const headers = config.headers || {};
      headers['user-id'] = baseStore.currentUser?.id || '';
      headers['session-token'] = baseStore.currentSessionToken || '';
      config.headers = headers;
    }
    return config;
  }, error => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理 401 自动刷新 Token
request.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // 所有 401 请求都走同一个 refreshPromise，防止并发刷新
      const refreshSuccess = await refreshTokenWithQueue();

      if (refreshSuccess) {
        const baseStore = useBaseStore();
        originalRequest.headers['session-token'] = baseStore.currentSessionToken;
        return request(originalRequest);
      } else {
        logout();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default request;
