import { uploadFile, getAvatarStorage } from '../services/fileService.js';
import { upload, checkFileRequestLimit } from '../middleware/upload.js';

export function setupRoutes(app, io) {
  // 文件/图片上传接口 - 支持file和image字段名
  app.post('/api/upload', checkFileRequestLimit, upload.fields([{ name: 'file' }, { name: 'image' }]), (req, res) => {
    uploadFile(req, res);
  });

  app.get('/api/avatar-storage', (req, res) => {
    getAvatarStorage(req, res);
  });
}
