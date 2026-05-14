import { marked } from 'marked';
import { io } from 'socket.io-client';

import toast from "../toast.js";

import { refreshTokenWithQueue, isTokenRefreshing, addHttpRequestToQueue } from './tokenManager.js';

export { marked, io, toast };

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://back.hs.airoe.cn';

// 保存原始的 fetch
const originalFetch = window.fetch;
export { originalFetch };

// fetch 拦截器 - 猴子补丁
window['fetch'] = async function(url, options = {}) {
  // 如果正在刷新 Token，加入队列
  if (isTokenRefreshing()) {
    return new Promise((resolve, reject) => {
      addHttpRequestToQueue(url, options, resolve, reject);
    });
  }

  // 保存原始请求配置
  const originalUrl = url;
  const originalOptions = { ...options };
  // 发送原始请求
  const response = await originalFetch(url, options);

  // 检查是否是会话过期（状态码 401）
  if (response.status === 401) {
    const resultPromise = new Promise((resolve, reject) => {
      addHttpRequestToQueue(originalUrl, originalOptions, resolve, reject);
    });

    refreshTokenWithQueue(originalFetch);

    return resultPromise;
  }

  return response;
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
