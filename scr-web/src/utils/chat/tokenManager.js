import { refreshToken as originalRefreshToken } from './ui.js';

// Token 刷新状态
let isRefreshing = false;
let refreshPromise = null;

// HTTP 请求队列
let httpRequestQueue = [];

/**
 * 添加 HTTP 请求到队列
 * @param {string} url - 请求 URL
 * @param {object} options - 请求选项
 * @param {Function} resolve - 成功回调
 * @param {Function} reject - 失败回调
 */
export function addHttpRequestToQueue(url, options, resolve, reject) {
  httpRequestQueue.push({ url, options, resolve, reject });
}

/**
 * 更新请求头中的 token
 * @param {object} options - 请求选项
 * @returns {object} 更新后的请求选项
 */
function updateRequestToken(options) {
  const newOptions = { ...options };
  const newToken = localStorage.getItem('currentSessionToken');
  
  if (newToken && newOptions.headers) {
    if (typeof newOptions.headers === 'object' && !Array.isArray(newOptions.headers)) {
      newOptions.headers = {
        ...newOptions.headers,
        'session-token': newToken
      };
    }
  }
  
  return newOptions;
}

/**
 * 刷新 Token（带队列管理）
 * @param {Function} [originalFetchFn] - 原始 fetch 函数
 * @returns {Promise<boolean>} 是否刷新成功
 */
export async function refreshTokenWithQueue(originalFetchFn = null) {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;

  refreshPromise = (async () => {
    try {
      await originalRefreshToken();
      
      while (httpRequestQueue.length > 0) {
        const savedHttpQueue = [...httpRequestQueue];
        httpRequestQueue = [];

        for (const { url, options, resolve, reject } of savedHttpQueue) {
          try {
            const newOptions = updateRequestToken(options);
            const result = await originalFetchFn(url, newOptions);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }
      }
      
      return true;
    } catch (error) {
      while (httpRequestQueue.length > 0) {
        const { reject } = httpRequestQueue.shift();
        reject(new Error('Token 刷新失败'));
      }
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * 检查是否正在刷新 Token
 * @returns {boolean}
 */
export function isTokenRefreshing() {
  return isRefreshing;
}
