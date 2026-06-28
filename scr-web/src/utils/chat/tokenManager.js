import { refreshToken as originalRefreshToken } from './ui.js';

// Token 刷新状态
let isRefreshing = false;
let refreshPromise = null;
let refreshResetTimer = null;

/**
 * 刷新 Token（防并发：多个调用共享同一个刷新 Promise）
 * 刷新完成后延迟重置，确保并发 401 能复用同一个结果而非再次刷新
 * @returns {Promise<boolean>} 是否刷新成功
 */
export async function refreshTokenWithQueue() {
  if (refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;

  refreshPromise = (async () => {
    try {
      const refreshSuccess = await originalRefreshToken();
      return refreshSuccess;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      // 延迟重置 refreshPromise，让并发 401 有机会复用结果
      if (refreshResetTimer) clearTimeout(refreshResetTimer);
      refreshResetTimer = setTimeout(() => {
        refreshPromise = null;
        refreshResetTimer = null;
      }, 500);
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
