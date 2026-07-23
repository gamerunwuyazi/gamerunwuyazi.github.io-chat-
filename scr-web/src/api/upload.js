import request from '@/utils/request.js';

/**
 * 上传用户头像
 */
export function uploadAvatar(formData) {
  return request.post('/api/upload-avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
}