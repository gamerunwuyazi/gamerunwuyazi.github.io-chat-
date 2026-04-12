import { marked } from 'marked';
import { io } from 'socket.io-client';
import toast from "../toast.js";
import { refreshTokenWithQueue, isTokenRefreshing, addHttpRequestToQueue } from './tokenManager.js';

export { marked, io, toast };

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://back.hs.airoe.cn';

// 保存原始的 fetch
const originalFetch = window.fetch;
export { originalFetch };

// 更新请求头中的 token
function updateRequestToken(options) {
  const newOptions = { ...options };
  const newToken = localStorage.getItem('currentSessionToken');
  
  if (newToken && newOptions.headers) {
    if (typeof newOptions.headers === 'object' && !Array.isArray(newOptions.headers)) {
      newOptions.headers = {
        ...newOptions.headers,
        'Authorization': `Bearer ${newToken}`,
        'session-token': newToken
      };
    }
  }
  
  return newOptions;
}

// fetch 拦截器 - 猴子补丁
window.fetch = async function(url, options = {}) {
  // 如果正在刷新 Token，加入队列
  if (isTokenRefreshing()) {
    return new Promise((resolve, reject) => {
      addHttpRequestToQueue(url, options, resolve, reject);
    });
  }

  // 保存原始请求配置
  const originalUrl = url;
  const originalOptions = { ...options };

  try {
    // 发送原始请求
    const response = await originalFetch(url, options);

    // 检查是否是会话过期（状态码 401）
    if (response.status === 401) {
      // 尝试解析响应
      try {
        await response.clone().json();
      } catch {
        // 如果无法解析 JSON，忽略
      }

      // 创建一个 Promise，把当前请求加入队列
      const resultPromise = new Promise((resolve, reject) => {
        addHttpRequestToQueue(originalUrl, originalOptions, resolve, reject);
      });

      // 刷新 Token - refreshTokenWithQueue 内部已经有防重复机制
      // 即使多个请求同时到达这里，refreshTokenWithQueue 也只会执行一次刷新
      refreshTokenWithQueue(originalFetch).catch(() => {
        // 刷新失败时，队列会被处理
      });

      return resultPromise;
    }

    return response;
  } catch (error) {
    throw error;
  }
};

export const MODAL_MAP = {
  'groupInfo': 'groupInfoModal',
  'sendGroupCard': 'sendGroupCardModal',
  'createGroup': 'createGroupModal',
  'addGroupMember': 'addGroupMemberModal',
  'userProfile': 'userProfileModal',
  'userSearch': 'userSearchModal',
  'imagePreview': 'imagePreviewModal',
  'avatarPreview': 'avatarPreviewModal'
};

export function getModalId(modalName) {
  return MODAL_MAP[modalName] || null;
}

export function getModalNameFromId(modalId) {
  const reverseMap = Object.fromEntries(
    Object.entries(MODAL_MAP).map(([name, id]) => [id, name])
  );
  return reverseMap[modalId] || null;
}
