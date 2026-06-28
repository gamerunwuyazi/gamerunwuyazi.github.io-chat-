import request from '@/utils/request.js';

/**
 * 获取离线消息
 */
export function getOfflineMessages(publicAndGroupMinId, privateMinId) {
  return request.get('/api/offline-messages', {
    params: { publicAndGroupMinId, privateMinId }
  });
}

/**
 * 删除已删除的会话
 */
export function deleteDeletedSession(type, id) {
  return request.post('/api/delete-deleted-session', { type, id });
}