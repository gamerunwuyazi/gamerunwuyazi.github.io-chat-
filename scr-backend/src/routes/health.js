import { pool, redisClient } from '../models/database.js';
import { getClientIP, isIPBanned } from '../middleware/auth.js';

export function setupRoutes(app, io) {
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'success',
      message: 'Server is running',
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/check-status', async (req, res) => {
    try {
      const clientIP = getClientIP(req);
      let userId = req.query.userId || req.headers['user-id'];

      const sessionToken = req.headers['session-token'] || req.query.sessionToken;

      if (sessionToken) {
        try {
          const tokenKey = `scr:token:${userId}`;
          const storedToken = await redisClient.get(tokenKey);
          if (storedToken === sessionToken) {
            // userId already set from headers/query
          } else {
            // Try to find userId by scanning sessions
            const keys = await redisClient.keys('scr:token:*');
            for (const key of keys) {
              const uid = key.replace('scr:token:', '');
              const token = await redisClient.get(key);
              if (token === sessionToken) {
                userId = uid;
                break;
              }
            }
          }
        } catch (err) {
          console.error('查找会话失败:', err.message);
        }
      }

      const ipStatus = await isIPBanned(clientIP);

      let userExists = true;
      if (userId) {
        try {
          const [users] = await pool.execute(
            'SELECT id FROM scr_users WHERE id = ?',
            [userId]
          );
          userExists = users.length > 0;
        } catch (userErr) {
          userExists = true;
        }
      }

      let message = '状态正常';
      if (ipStatus.isBanned) {
        message = 'IP地址已被封禁';
        if (ipStatus.reason) {
          message += `，原因：${ipStatus.reason}`;
        }
      }

      res.json({
        status: 'success',
        ipAddress: clientIP,
        isBanned: ipStatus.isBanned,
        reason: ipStatus.reason,
        userExists: userExists,
        remainingTime: ipStatus.remainingTime,
        message: message
      });
    } catch (error) {
      res.json({
        status: 'success',
        isBanned: false,
        reason: null,
        userExists: true,
        remainingTime: null,
        message: '状态检查服务暂时不可用，将继续操作'
      });
    }
  });

  app.get('/api/session-check', async (req, res) => {
    const userId = req.userId;

    if (!userId) {
      return res.json({
        status: 'success',
        authenticated: false,
        message: 'No active session'
      });
    }

    res.json({
      status: 'success',
      authenticated: true,
      userId: userId,
      timestamp: new Date().toISOString()
    });
  });
}
