import { register, login, refreshToken, getSelfInfo, getUserById, updateNickname, updateSignature, updateGender, changePassword, uploadAvatar } from '../services/userService.js';
import { pool } from '../models/database.js';
import { validateUsername } from '../utils/validators.js';
import { avatarUpload } from '../middleware/upload.js';

export function setupRoutes(app, io) {
  app.post('/api/register', (req, res) => {
    register(req, res);
  });

  app.post('/api/login', (req, res) => {
    login(req, res);
  });

  app.post('/api/refresh-token', (req, res) => {
    refreshToken(req, res);
  });

  app.get('/api/self', (req, res) => {
    getSelfInfo(req, res);
  });

  app.get('/api/user/:id', (req, res) => {
    getUserById(req, res);
  });

  // 用户名重复检查API
  app.get('/api/check-username', async (req, res) => {
    try {
      const { username } = req.query;

      if (!username || typeof username !== 'string') {
        return res.status(400).json({ status: 'error', message: '用户名不能为空' });
      }

      if (!validateUsername(username)) {
        return res.status(400).json({ status: 'error', message: '用户名非法' });
      }

      const trimmedUsername = username.trim();

      if (!trimmedUsername) {
        return res.status(400).json({ status: 'error', message: '用户名不能为空' });
      }

      const [existingUsers] = await pool.execute(
        'SELECT id FROM scr_users WHERE username = ?',
        [trimmedUsername]
      );

      res.json({
        status: 'success',
        isAvailable: existingUsers.length === 0,
        username: trimmedUsername
      });
    } catch (err) {
      console.error('❌ 检查用户名失败:', err.message);
      res.status(500).json({ status: 'error', message: '检查用户名失败' });
    }
  });

  app.post('/api/update-nickname', (req, res) => {
    updateNickname(req, res);
  });

  app.post('/api/update-signature', (req, res) => {
    updateSignature(req, res);
  });

  app.post('/api/update-gender', (req, res) => {
    updateGender(req, res);
  });

  app.post('/api/user/change-password', (req, res) => {
    changePassword(req, res);
  });

  // 用户头像上传接口 - 使用avatarUpload中间件处理文件
  app.post('/api/upload-avatar', avatarUpload.single('avatar'), (req, res) => {
    uploadAvatar(req, res);
  });
}
