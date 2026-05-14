import { pool } from '../models/database.js';

export function setupRoutes(app, io) {
  app.get('/api/sessions', async (req, res) => {
    try {
      const [sessions] = await pool.execute(`
        SELECT s.*, u.username, u.nickname
        FROM scr_sessions s
        JOIN scr_users u ON s.user_id = u.id
        ORDER BY s.last_active DESC
        LIMIT 100
      `);

      res.json({
        status: 'success',
        sessions: sessions,
        count: sessions.length
      });
    } catch (err) {
      console.error('获取会话列表失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取会话列表失败' });
    }
  });

  app.post('/api/admin/ban-ip', async (req, res) => {
    try {
      const { ip, reason, duration } = req.body;

      if (!ip) {
        return res.status(400).json({ status: 'error', message: 'IP地址不能为空' });
      }

      const expiresAt = duration ? new Date(Date.now() + duration * 60 * 60 * 1000) : null;

      await pool.execute(
        'INSERT INTO scr_banned_ips (ip, reason, created_by, expires_at) VALUES (?, ?, ?, ?)',
        [ip, reason || '', req.userId || null, expiresAt]
      );

      res.json({
        status: 'success',
        message: `IP ${ip} 已被封禁`,
        bannedIp: ip,
        expiresAt: expiresAt
      });
    } catch (err) {
      console.error('封禁IP失败:', err.message);
      res.status(500).json({ status: 'error', message: '封禁IP失败' });
    }
  });

  app.post('/api/admin/unban-ip', async (req, res) => {
    try {
      const { ip } = req.body;

      if (!ip) {
        return res.status(400).json({ status: 'error', message: 'IP地址不能为空' });
      }

      await pool.execute(
        'DELETE FROM scr_banned_ips WHERE ip = ?',
        [ip]
      );

      res.json({
        status: 'success',
        message: `IP ${ip} 已解封`,
        unbannedIp: ip
      });
    } catch (err) {
      console.error('解封IP失败:', err.message);
      res.status(500).json({ status: 'error', message: '解封IP失败' });
    }
  });

  app.get('/api/admin/banned-ips', async (req, res) => {
    try {
      const [bannedIps] = await pool.execute(`
        SELECT *, 
          CASE WHEN expires_at IS NULL THEN '永久'
               WHEN expires_at > NOW() THEN CONCAT('剩余 ', TIMESTAMPDIFF(HOUR, NOW(), expires_at), ' 小时')
               ELSE '已过期'
          END as status
        FROM scr_banned_ips
        ORDER BY created_at DESC
      `);

      res.json({
        status: 'success',
        bannedIps: bannedIps,
        count: bannedIps.length
      });
    } catch (err) {
      console.error('获取封禁IP列表失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取封禁IP列表失败' });
    }
  });

  app.get('/api/admin/login-ips', async (req, res) => {
    try {
      const [loginIps] = await pool.execute(`
        SELECT lip.*, u.username, u.nickname
        FROM scr_login_ips lip
        JOIN scr_users u ON lip.user_id = u.id
        ORDER BY lip.last_login DESC
        LIMIT 100
      `);

      res.json({
        status: 'success',
        loginIps: loginIps,
        count: loginIps.length
      });
    } catch (err) {
      console.error('获取登录IP记录失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取登录IP记录失败' });
    }
  });

  app.get('/api/admin/api-logs', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      const [logs] = await pool.execute(`
        SELECT *
        FROM scr_api_logs
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      const [countResult] = await pool.execute(
        'SELECT COUNT(*) as total FROM scr_api_logs'
      );
      const total = countResult[0].total;

      res.json({
        status: 'success',
        logs: logs,
        pagination: {
          page: page,
          limit: limit,
          total: total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (err) {
      console.error('获取API日志失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取API日志失败' });
    }
  });
}
