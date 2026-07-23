import { pool, redisClient } from '../models/database.js';
import { ADMIN_PASSWORD } from '../config/index.js';
import { getOnlineUser, removeOnlineUser, getAllOnlineUsers } from '../utils/session.js';
import fs from 'fs';
import path from 'path';

async function authenticateAdmin(req, res, next) {
  const adminPassword = req.headers['x-admin-password'] || req.body.adminPassword;

  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ status: 'error', message: '管理员密码未配置' });
  }

  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ status: 'error', message: '管理员认证失败' });
  }

  next();
}

export async function initAdminRoutes() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS scr_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        action VARCHAR(100) NOT NULL,
        target_type VARCHAR(50),
        target_id INT,
        details TEXT,
        ip_address VARCHAR(50),
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_action (action),
        INDEX idx_audit_user (user_id),
        INDEX idx_audit_timestamp (timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ 审计日志表初始化完成');
  } catch (err) {
    console.error('❌ 审计日志表初始化失败:', err.message);
  }
}

export async function logAudit(action, targetType = null, targetId = null, details = null, userId = null, ipAddress = null) {
  try {
    await pool.execute(
      'INSERT INTO scr_audit_logs (user_id, action, target_type, target_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, action, targetType, targetId, details ? JSON.stringify(details) : null, ipAddress]
    );
  } catch (err) {
    console.error('❌ 记录审计日志失败:', err.message);
  }
}

export function setupRoutes(app, io) {
  app.get('/api/sessions', authenticateAdmin, async (req, res) => {
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

  app.get('/api/admin/dashboard', authenticateAdmin, async (req, res) => {
    try {
      const [userCountResult] = await pool.execute('SELECT COUNT(*) as count FROM scr_users');
      const userCount = userCountResult[0].count;

      const onlineUsers = await getAllOnlineUsers();
      const onlineCount = onlineUsers.length;

      const [groupCountResult] = await pool.execute('SELECT COUNT(*) as count FROM scr_groups WHERE deleted_at IS NULL');
      const groupCount = groupCountResult[0].count;

      const [messageCountResult] = await pool.execute('SELECT COUNT(*) as count FROM scr_messages');
      const messageCount = messageCountResult[0].count;

      const [bannedCountResult] = await pool.execute('SELECT COUNT(*) as count FROM scr_banned_ips');
      const bannedCount = bannedCountResult[0].count;

      const [fileCountResult] = await pool.execute("SELECT COUNT(*) as count FROM scr_messages WHERE message_type = 2");
      const fileCount = fileCountResult[0].count;

      const [recentActivities] = await pool.execute(`
        SELECT 
          'login' as type, 
          lip.timestamp, 
          u.username, 
          u.nickname,
          lip.ip_address as ip
        FROM scr_ip_logs lip
        LEFT JOIN scr_users u ON lip.user_id = u.id
        WHERE lip.action = 'login'
        UNION ALL
        SELECT 
          'register' as type, 
          lip.timestamp, 
          u.username, 
          u.nickname,
          lip.ip_address as ip
        FROM scr_ip_logs lip
        LEFT JOIN scr_users u ON lip.user_id = u.id
        WHERE lip.action = 'register'
        ORDER BY timestamp DESC
        LIMIT 20
      `);

      res.json({
        status: 'success',
        stats: {
          totalUsers: userCount,
          onlineUsers: onlineCount,
          totalGroups: groupCount,
          totalMessages: messageCount,
          bannedCount: bannedCount,
          fileCount: fileCount
        },
        recentActivities: recentActivities
      });
    } catch (err) {
      console.error('获取仪表盘统计失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取仪表盘统计失败' });
    }
  });

  app.get('/api/admin/audit-logs', authenticateAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;
      const action = req.query.action;
      const userId = req.query.userId;

      let query = `
        SELECT al.*, u.username, u.nickname
        FROM scr_audit_logs al
        LEFT JOIN scr_users u ON al.user_id = u.id
        WHERE 1=1
      `;
      const params = [];

      if (action) {
        query += ' AND al.action = ?';
        params.push(action);
      }

      if (userId) {
        query += ' AND al.user_id = ?';
        params.push(userId);
      }

      query += ' ORDER BY al.timestamp DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [logs] = await pool.query(query, params);

      const [countResult] = await pool.query('SELECT COUNT(*) as total FROM scr_audit_logs');
      const total = countResult[0].total;

      res.json({
        status: 'success',
        logs: logs.map(log => ({
          ...log,
          details: log.details ? JSON.parse(log.details) : null
        })),
        pagination: {
          page: page,
          limit: limit,
          total: total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (err) {
      console.error('获取审计日志失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取审计日志失败' });
    }
  });

  app.get('/api/admin/audit-actions', authenticateAdmin, async (req, res) => {
    try {
      const [actions] = await pool.execute('SELECT DISTINCT action FROM scr_audit_logs ORDER BY action');
      res.json({
        status: 'success',
        actions: actions.map(a => a.action)
      });
    } catch (err) {
      console.error('获取审计操作类型失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取审计操作类型失败' });
    }
  });

  app.post('/api/admin/ban-ip', authenticateAdmin, async (req, res) => {
    try {
      const { ipAddress, userId, reason, expiresAt } = req.body;
      const clientIP = req.clientIP || req.connection.remoteAddress;

      if (!ipAddress && !userId) {
        return res.status(400).json({ status: 'error', message: '请提供 ipAddress 或 userId 至少一个参数' });
      }

      let expiresDate = null;
      if (expiresAt) {
        expiresDate = new Date(expiresAt);
        if (isNaN(expiresDate.getTime())) {
          return res.status(400).json({ status: 'error', message: '解封时间格式错误' });
        }
      }

      const banData = {
        reason: reason || '违反使用规则',
        expires_at: expiresDate
      };

      if (ipAddress) {
        await pool.execute(
          'INSERT INTO scr_banned_ips (ip_address, user_id, reason, expires_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason), expires_at = VALUES(expires_at)',
          [ipAddress, userId || null, reason || '违反使用规则', expiresDate]
        );

        await redisClient.hSet('scr:banned_ips', ipAddress, JSON.stringify(banData));

        io.to(`ip_${ipAddress}`).emit('ip-banned', {
          ipAddress: ipAddress,
          userId: userId,
          reason: reason || '违反使用规则',
          expiresAt: expiresDate
        });

        const socketsInRoom = await io.in(`ip_${ipAddress}`).fetchSockets();
        for (const socket of socketsInRoom) {
          const user = await getOnlineUser(socket.id);
          if (user) {
            await removeOnlineUser(socket.id);
            await redisClient.sRem('scr:authenticated_users', String(user.id));

            try {
              await pool.execute(
                'UPDATE scr_users SET last_online = NOW() WHERE id = ?',
                [user.id]
              );
            } catch (_) {
              // ignore
            }
          }
        }

        io.to(`ip_${ipAddress}`).disconnectSockets(true);

        const allOnlineUsers = await getAllOnlineUsers();
        const onlineUsersArray = allOnlineUsers.map(u => ({
          id: u.id,
          nickname: u.nickname,
          avatarUrl: u.avatarUrl,
          isOnline: true
        }));

        const onlineUserIds = new Set(onlineUsersArray.map(u => u.id));

        const [offlineUsersData] = await pool.execute(`
          SELECT id, nickname, last_online, avatar_url as avatarUrl
          FROM scr_users
          WHERE last_online IS NOT NULL
          AND last_online >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          ORDER BY last_online DESC
        `);

        const offlineUsersArray = offlineUsersData
          .filter(u => !onlineUserIds.has(u.id))
          .map(u => ({
            id: u.id,
            nickname: u.nickname,
            avatarUrl: u.avatarUrl,
            isOnline: false,
            lastOnline: u.last_online
          }));

        io.to('authenticated_users').emit('users-list', {
          online: onlineUsersArray,
          offline: offlineUsersArray
        });
      }

      if (userId) {
        const userIdStr = String(userId);

        if (!ipAddress) {
          await pool.execute(
            'INSERT INTO scr_banned_ips (ip_address, user_id, reason, expires_at) VALUES (?, ?, ?, ?)',
            [null, userId, reason || '违反使用规则', expiresDate]
          );
        }

        await redisClient.hSet('scr:banned_users', userIdStr, JSON.stringify(banData));

        io.to(`user_${userId}`).emit('user-banned', {
          ipAddress: ipAddress,
          userId: userId,
          reason: reason || '违反使用规则',
          expiresAt: expiresDate
        });

        const userSocketsInRoom = await io.in(`user_${userId}`).fetchSockets();
        for (const socket of userSocketsInRoom) {
          const user = await getOnlineUser(socket.id);
          if (user) {
            await removeOnlineUser(socket.id);
            await redisClient.sRem('scr:authenticated_users', String(user.id));

            try {
              await pool.execute(
                'UPDATE scr_users SET last_online = NOW() WHERE id = ?',
                [user.id]
              );
            } catch (_) {
              // ignore
            }
          }
        }

        io.to(`user_${userId}`).disconnectSockets(true);

        if (!ipAddress) {
          const allOnlineUsers = await getAllOnlineUsers();
          const onlineUsersArray = allOnlineUsers.map(u => ({
            id: u.id,
            nickname: u.nickname,
            avatarUrl: u.avatarUrl,
            isOnline: true
          }));

          const onlineUserIds = new Set(onlineUsersArray.map(u => u.id));

          const [offlineUsersData] = await pool.execute(`
            SELECT id, nickname, last_online, avatar_url as avatarUrl
            FROM scr_users
            WHERE last_online IS NOT NULL
            AND last_online >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            ORDER BY last_online DESC
          `);

          const offlineUsersArray = offlineUsersData
            .filter(u => !onlineUserIds.has(u.id))
            .map(u => ({
              id: u.id,
              nickname: u.nickname,
              avatarUrl: u.avatarUrl,
              isOnline: false,
              lastOnline: u.last_online
            }));

          io.to('authenticated_users').emit('users-list', {
            online: onlineUsersArray,
            offline: offlineUsersArray
          });
        }
      }

      await logAudit('ban', ipAddress ? 'ip' : 'user', ipAddress || userId, {
        ipAddress,
        userId,
        reason,
        expiresAt
      }, null, clientIP);

      const bannedTarget = ipAddress ? `IP ${ipAddress}` : `用户 ${userId}`;
      res.json({
        status: 'success',
        message: `${bannedTarget} 已被封禁`,
        bannedAt: new Date().toISOString(),
        expiresAt: expiresDate ? expiresDate.toISOString() : null
      });
    } catch (err) {
      console.error('封禁IP失败:', err.message);
      res.status(500).json({ status: 'error', message: '封禁IP失败' });
    }
  });

  app.post('/api/admin/unban-ip', authenticateAdmin, async (req, res) => {
    try {
      const { ipAddress, userId } = req.body;
      const clientIP = req.clientIP || req.connection.remoteAddress;

      if (!ipAddress && !userId) {
        return res.status(400).json({ status: 'error', message: '请提供 ipAddress 或 userId 至少一个参数' });
      }

      if (ipAddress && userId) {
        // 同时提供 IP 和用户ID 时，只删除同时匹配的记录
        await pool.execute(
          'DELETE FROM scr_banned_ips WHERE ip_address = ? AND user_id = ?',
          [ipAddress, userId]
        );

        await redisClient.hDel('scr:banned_ips', ipAddress);
        await redisClient.hDel('scr:banned_users', String(userId));
      } else {
        if (ipAddress) {
          await pool.execute(
            'DELETE FROM scr_banned_ips WHERE ip_address = ?',
            [ipAddress]
          );

          await redisClient.hDel('scr:banned_ips', ipAddress);
        }

        if (userId) {
          await pool.execute(
            'DELETE FROM scr_banned_ips WHERE user_id = ?',
            [userId]
          );

          await redisClient.hDel('scr:banned_users', String(userId));
        }
      }

      await logAudit('unban', ipAddress ? 'ip' : 'user', ipAddress || userId, {
        ipAddress,
        userId
      }, null, clientIP);

      const unbannedTarget = ipAddress ? `IP ${ipAddress}` : `用户 ${userId}`;
      res.json({
        status: 'success',
        message: `${unbannedTarget} 已解封`
      });
    } catch (err) {
      console.error('解封IP失败:', err.message);
      res.status(500).json({ status: 'error', message: '解封IP失败' });
    }
  });

  app.get('/api/admin/banned-ips', authenticateAdmin, async (req, res) => {
    try {
      const [bannedIps] = await pool.execute(`
        SELECT b.*, u.username, u.nickname,
          CASE WHEN b.expires_at IS NULL THEN '永久'
               WHEN b.expires_at > NOW() THEN CONCAT('剩余 ', TIMESTAMPDIFF(HOUR, NOW(), b.expires_at), ' 小时')
               ELSE '已过期'
          END as status
        FROM scr_banned_ips b
        LEFT JOIN scr_users u ON b.user_id = u.id
        ORDER BY b.banned_at DESC
      `);

      res.json({
        status: 'success',
        bannedList: bannedIps,
        count: bannedIps.length
      });
    } catch (err) {
      console.error('获取封禁IP列表失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取封禁IP列表失败' });
    }
  });

  app.get('/api/admin/login-ips', authenticateAdmin, async (req, res) => {
    try {
      const [loginIps] = await pool.execute(`
        SELECT lip.*, u.username, u.nickname
        FROM scr_ip_logs lip
        LEFT JOIN scr_users u ON lip.user_id = u.id
        ORDER BY lip.timestamp DESC
        LIMIT 5000
      `);

      res.json({
        status: 'success',
        loginIPs: loginIps,
        totalLogs: loginIps.length
      });
    } catch (err) {
      console.error('获取IP操作日志失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取IP操作日志失败' });
    }
  });

  app.get('/api/admin/api-logs', authenticateAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 3000;
      const offset = (page - 1) * limit;

      const [logs] = await pool.query(`
        SELECT al.*, u.username, u.nickname
        FROM scr_api_logs al
        LEFT JOIN scr_users u ON al.user_id = u.id
        ORDER BY al.timestamp DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      const [countResult] = await pool.query(
        'SELECT COUNT(*) as total FROM scr_api_logs'
      );
      const total = countResult[0].total;

      res.json({
        status: 'success',
        apiLogs: logs,
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

  app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;
      const search = req.query.search;

      let query = `
        SELECT u.*, 
          (SELECT COUNT(*) FROM scr_messages WHERE user_id = u.id) as message_count,
          (SELECT COUNT(*) FROM scr_group_members WHERE user_id = u.id) as group_count
        FROM scr_users u
        WHERE u.deleted_at IS NULL
      `;
      const params = [];

      if (search) {
        query += ' AND (u.username LIKE ? OR u.nickname LIKE ? OR u.email LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [users] = await pool.query(query, params);

      const countQuery = `SELECT COUNT(*) as total FROM scr_users u WHERE u.deleted_at IS NULL`;
      const countParams = [];
      if (search) {
        const countQueryWithSearch = `${countQuery} AND (u.username LIKE ? OR u.nickname LIKE ? OR u.email LIKE ?)`;
        const [countResult] = await pool.query(countQueryWithSearch, [`%${search}%`, `%${search}%`, `%${search}%`]);
        res.locals.total = countResult[0].total;
      } else {
        const [countResult] = await pool.query(countQuery);
        res.locals.total = countResult[0].total;
      }

      const total = res.locals.total;

      const onlineUsers = await getAllOnlineUsers();
      const onlineUserIds = new Set(onlineUsers.map(u => u.id));

      const usersWithOnline = users.map(user => ({
        ...user,
        isOnline: onlineUserIds.has(user.id)
      }));

      res.json({
        status: 'success',
        users: usersWithOnline,
        pagination: {
          page: page,
          limit: limit,
          total: total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (err) {
      console.error('获取用户列表失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取用户列表失败' });
    }
  });

  app.get('/api/admin/users/:id', authenticateAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);

      const [users] = await pool.execute(`
        SELECT u.*,
          (SELECT COUNT(*) FROM scr_messages WHERE user_id = u.id) as message_count,
          (SELECT COUNT(*) FROM scr_group_members WHERE user_id = u.id) as group_count
        FROM scr_users u
        WHERE u.id = ? AND u.deleted_at IS NULL
      `, [userId]);

      if (users.length === 0) {
        return res.status(404).json({ status: 'error', message: '用户不存在' });
      }

      const user = users[0];
      const onlineUsers = await getAllOnlineUsers();
      const onlineUserIds = new Set(onlineUsers.map(u => u.id));

      const [recentMessages] = await pool.execute(`
        SELECT m.*, g.name as group_name
        FROM scr_messages m
        LEFT JOIN scr_groups g ON m.group_id = g.id
        WHERE m.user_id = ?
        ORDER BY m.created_at DESC
        LIMIT 20
      `, [userId]);

      const [groupMemberships] = await pool.execute(`
        SELECT gm.*, g.name as group_name, g.avatar_url as group_avatar
        FROM scr_group_members gm
        JOIN scr_groups g ON gm.group_id = g.id
        WHERE gm.user_id = ? AND g.deleted_at IS NULL
        ORDER BY gm.joined_at DESC
      `, [userId]);

      const [loginLogs] = await pool.execute(`
        SELECT * FROM scr_ip_logs
        WHERE user_id = ?
        ORDER BY timestamp DESC
        LIMIT 10
      `, [userId]);

      res.json({
        status: 'success',
        user: {
          ...user,
          isOnline: onlineUserIds.has(user.id)
        },
        recentMessages: recentMessages,
        groupMemberships: groupMemberships,
        loginLogs: loginLogs
      });
    } catch (err) {
      console.error('获取用户详情失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取用户详情失败' });
    }
  });

  app.post('/api/admin/kick-user', authenticateAdmin, async (req, res) => {
    try {
      const { userId, reason } = req.body;
      const clientIP = req.clientIP || req.connection.remoteAddress;

      if (!userId) {
        return res.status(400).json({ status: 'error', message: '请提供 userId 参数' });
      }

      const [userResult] = await pool.execute('SELECT username, nickname FROM scr_users WHERE id = ?', [userId]);
      if (userResult.length === 0) {
        return res.status(404).json({ status: 'error', message: '用户不存在' });
      }

      const user = userResult[0];

      io.to(`user_${userId}`).emit('user-kicked', {
        userId: userId,
        reason: reason || '您已被管理员踢下线'
      });

      const userSocketsInRoom = await io.in(`user_${userId}`).fetchSockets();
      for (const socket of userSocketsInRoom) {
        const onlineUser = await getOnlineUser(socket.id);
        if (onlineUser) {
          await removeOnlineUser(socket.id);
          await redisClient.sRem('scr:authenticated_users', String(onlineUser.id));

          try {
            await pool.execute(
              'UPDATE scr_users SET last_online = NOW() WHERE id = ?',
              [onlineUser.id]
            );
          } catch (_) {
            // ignore
          }
        }
      }

      io.to(`user_${userId}`).disconnectSockets(true);

      const allOnlineUsers = await getAllOnlineUsers();
      const onlineUsersArray = allOnlineUsers.map(u => ({
        id: u.id,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        isOnline: true
      }));

      const onlineUserIds = new Set(onlineUsersArray.map(u => u.id));

      const [offlineUsersData] = await pool.execute(`
        SELECT id, nickname, last_online, avatar_url as avatarUrl
        FROM scr_users
        WHERE last_online IS NOT NULL
        AND last_online >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY last_online DESC
      `);

      const offlineUsersArray = offlineUsersData
        .filter(u => !onlineUserIds.has(u.id))
        .map(u => ({
          id: u.id,
          nickname: u.nickname,
          avatarUrl: u.avatarUrl,
          isOnline: false,
          lastOnline: u.last_online
        }));

      io.to('authenticated_users').emit('users-list', {
        online: onlineUsersArray,
        offline: offlineUsersArray
      });

      await logAudit('kick_user', 'user', userId, {
        userId,
        username: user.username,
        nickname: user.nickname,
        reason
      }, null, clientIP);

      res.json({
        status: 'success',
        message: `用户 ${user.nickname} 已被踢下线`,
        kickedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('踢用户下线失败:', err.message);
      res.status(500).json({ status: 'error', message: '踢用户下线失败' });
    }
  });

  app.get('/api/admin/online-sessions', authenticateAdmin, async (req, res) => {
    try {
      const onlineUsers = await getAllOnlineUsers();

      const sessions = await Promise.all(onlineUsers.map(async (user) => {
        const [userData] = await pool.execute(
          'SELECT username, nickname, avatar_url as avatarUrl FROM scr_users WHERE id = ?',
          [user.id]
        );
        
        const [sessionData] = await pool.execute(`
          SELECT s.* 
          FROM scr_sessions s 
          WHERE s.user_id = ? 
          ORDER BY s.last_active DESC 
          LIMIT 1
        `, [user.id]);

        return {
          userId: user.id,
          ...userData[0],
          socketId: user.socketId,
          connectedAt: user.connectedAt,
          lastActive: sessionData[0]?.last_active
        };
      }));

      res.json({
        status: 'success',
        sessions: sessions,
        count: sessions.length
      });
    } catch (err) {
      console.error('获取在线会话列表失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取在线会话列表失败' });
    }
  });

  app.get('/api/admin/messages', authenticateAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;
      const messageType = req.query.type;
      const searchKeyword = req.query.search;
      const groupId = req.query.groupId;
      const userId = req.query.userId;
      const startTime = req.query.startTime;
      const endTime = req.query.endTime;

      let query = `
        SELECT m.id, m.user_id as userId, u.nickname, u.avatar_url as avatarUrl,
               m.content, m.is_encrypted as isEncrypted, m.encrypted_content as encryptedContent,
               m.message_type as messageType, m.group_id as groupId, m.timestamp,
               NULL as receiverId, NULL as receiverNickname, 'public_or_group' as source
        FROM scr_messages m
        JOIN scr_users u ON m.user_id = u.id
        WHERE 1=1
      `;
      const params = [];

      if (messageType === 'public') {
        query += ' AND m.group_id IS NULL';
      } else if (messageType === 'group') {
        query += ' AND m.group_id IS NOT NULL';
        if (groupId) {
          query += ' AND m.group_id = ?';
          params.push(parseInt(groupId));
        }
      }

      if (userId) {
        query += ' AND m.user_id = ?';
        params.push(parseInt(userId));
      }

      if (searchKeyword) {
        query += " AND (u.nickname LIKE ? OR m.content LIKE ?)";
        params.push(`%${searchKeyword}%`, `%${searchKeyword}%`);
      }

      if (startTime) {
        query += ' AND m.timestamp >= ?';
        params.push(startTime);
      }

      if (endTime) {
        query += ' AND m.timestamp <= ?';
        params.push(endTime);
      }

      query += ' ORDER BY m.timestamp DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [publicMessages] = await pool.query(query, params);

      let countQuery = 'SELECT COUNT(*) as total FROM scr_messages m WHERE 1=1';
      const countParams = [];
      
      if (messageType === 'public') {
        countQuery += ' AND m.group_id IS NULL';
      } else if (messageType === 'group') {
        countQuery += ' AND m.group_id IS NOT NULL';
      }
      
      if (groupId) {
        countQuery += ' AND m.group_id = ?';
        countParams.push(parseInt(groupId));
      }
      
      if (userId) {
        countQuery += ' AND m.user_id = ?';
        countParams.push(parseInt(userId));
      }
      const [countResult] = await pool.query(countQuery, countParams);

      const processedMessages = publicMessages.map(msg => ({
        id: msg.id,
        userId: msg.userId,
        nickname: msg.nickname,
        avatarUrl: msg.avatarUrl,
        content: msg.isEncrypted ? '[加密消息]' : msg.content,
        isEncrypted: Boolean(msg.isEncrypted),
        messageType: msg.messageType,
        groupId: msg.groupId,
        timestamp: msg.timestamp,
        source: msg.source
      }));

      res.json({
        status: 'success',
        messages: processedMessages,
        pagination: {
          page: page,
          limit: limit,
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limit)
        }
      });
    } catch (err) {
      console.error('获取消息列表失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取消息列表失败' });
    }
  });

  app.get('/api/admin/private-messages', authenticateAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;
      const searchKeyword = req.query.search;
      const userId = req.query.userId;
      const startTime = req.query.startTime;
      const endTime = req.query.endTime;

      let query = `
        SELECT p.id, p.sender_id as senderId, p.receiver_id as receiverId,
               p.content, p.is_encrypted as isEncrypted, p.message_type as messageType,
               p.timestamp, u1.nickname as senderNickname, u1.avatar_url as senderAvatarUrl,
               u2.nickname as receiverNickname, u2.avatar_url as receiverAvatarUrl,
               'private' as source
        FROM scr_private_messages p
        JOIN scr_users u1 ON p.sender_id = u1.id
        JOIN scr_users u2 ON p.receiver_id = u2.id
        WHERE 1=1
      `;
      const params = [];

      if (userId) {
        query += ' AND (p.sender_id = ? OR p.receiver_id = ?)';
        params.push(parseInt(userId), parseInt(userId));
      }

      if (searchKeyword) {
        query += " AND (u1.nickname LIKE ? OR u2.nickname LIKE ?)";
        params.push(`%${searchKeyword}%`, `%${searchKeyword}%`);
      }

      if (startTime) {
        query += ' AND p.timestamp >= ?';
        params.push(startTime);
      }

      if (endTime) {
        query += ' AND p.timestamp <= ?';
        params.push(endTime);
      }

      query += ' ORDER BY p.timestamp DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [privateMessages] = await pool.query(query, params);

      let countQuery = 'SELECT COUNT(*) as total FROM scr_private_messages p WHERE 1=1';
      const countParams = [];
      
      if (userId) {
        countQuery += ' AND (p.sender_id = ? OR p.receiver_id = ?)';
        countParams.push(parseInt(userId), parseInt(userId));
      }
      const [countResult] = await pool.query(countQuery, countParams);

      const processedMessages = privateMessages.map(msg => ({
        id: msg.id,
        senderId: msg.senderId,
        receiverId: msg.receiverId,
        senderNickname: msg.senderNickname,
        senderAvatarUrl: msg.senderAvatarUrl,
        receiverNickname: msg.receiverNickname,
        receiverAvatarUrl: msg.receiverAvatarUrl,
        content: msg.isEncrypted ? '[加密消息]' : msg.content,
        isEncrypted: Boolean(msg.isEncrypted),
        messageType: msg.messageType,
        timestamp: msg.timestamp,
        source: msg.source
      }));

      res.json({
        status: 'success',
        messages: processedMessages,
        pagination: {
          page: page,
          limit: limit,
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limit)
        }
      });
    } catch (err) {
      console.error('获取私聊消息失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取私聊消息失败' });
    }
  });

  app.delete('/api/admin/message/:id', authenticateAdmin, async (req, res) => {
    try {
      const messageId = parseInt(req.params.id);
      const clientIP = req.clientIP || req.connection.remoteAddress;

      if (!messageId || isNaN(messageId)) {
        return res.status(400).json({ status: 'error', message: '消息ID无效' });
      }

      const [publicMsg] = await pool.execute(
        'SELECT * FROM scr_messages WHERE id = ?',
        [messageId]
      );

      let deletedFrom = 'public_or_group';
      let affectedRows = 0;

      if (publicMsg.length > 0) {
        const [result] = await pool.execute(
          'DELETE FROM scr_messages WHERE id = ?',
          [messageId]
        );
        affectedRows = result.affectedRows;
      } else {
        const [privateMsg] = await pool.execute(
          'SELECT * FROM scr_private_messages WHERE id = ?',
          [messageId]
        );

        if (privateMsg.length > 0) {
          const [result] = await pool.execute(
            'DELETE FROM scr_private_messages WHERE id = ?',
            [messageId]
          );
          affectedRows = result.affectedRows;
          deletedFrom = 'private';
        }
      }

      if (affectedRows === 0) {
        return res.status(404).json({ status: 'error', message: '消息不存在' });
      }

      await logAudit('delete_message', deletedFrom, messageId, {
        messageId,
        source: deletedFrom
      }, null, clientIP);

      res.json({
        status: 'success',
        message: '消息已删除',
        messageId: messageId
      });
    } catch (err) {
      console.error('删除消息失败:', err.message);
      res.status(500).json({ status: 'error', message: '删除消息失败' });
    }
  });

  app.get('/api/admin/groups', authenticateAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;
      const searchKeyword = req.query.search;

      let query = `
        SELECT g.id, g.name, g.description, g.creator_id as creatorId, 
               g.avatar_url as avatarUrl, g.created_at as createdAt, g.deleted_at as deletedAt,
               u.nickname as creatorNickname, u.avatar_url as creatorAvatarUrl
        FROM scr_groups g
        LEFT JOIN scr_users u ON g.creator_id = u.id
        WHERE g.deleted_at IS NULL
      `;
      const params = [];

      if (searchKeyword) {
        query += " AND (g.name LIKE ? OR g.description LIKE ?)";
        params.push(`%${searchKeyword}%`, `%${searchKeyword}%`);
      }

      query += ' ORDER BY g.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [groups] = await pool.query(query, params);

      let countQuery = 'SELECT COUNT(*) as total FROM scr_groups WHERE deleted_at IS NULL';
      const countParams = [];
      
      if (searchKeyword) {
        countQuery += ' AND (name LIKE ? OR description LIKE ?)';
        countParams.push(`%${searchKeyword}%`, `%${searchKeyword}%`);
      }
      const [countResult] = await pool.query(countQuery, countParams);

      const processedGroups = groups.map(group => ({
        id: group.id,
        name: group.name,
        description: group.description,
        creatorId: group.creatorId,
        creatorNickname: group.creatorNickname,
        creatorAvatarUrl: group.creatorAvatarUrl,
        avatarUrl: group.avatarUrl,
        createdAt: group.createdAt
      }));

      res.json({
        status: 'success',
        groups: processedGroups,
        pagination: {
          page: page,
          limit: limit,
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limit)
        }
      });
    } catch (err) {
      console.error('获取群组列表失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取群组列表失败' });
    }
  });

  app.get('/api/admin/group/:groupId', authenticateAdmin, async (req, res) => {
    try {
      const groupId = parseInt(req.params.groupId);

      if (!groupId || isNaN(groupId)) {
        return res.status(400).json({ status: 'error', message: '群组ID无效' });
      }

      const [group] = await pool.execute(`
        SELECT g.id, g.name, g.description, g.creator_id as creatorId, 
               g.avatar_url as avatarUrl, g.created_at as createdAt,
               u.nickname as creatorNickname, u.avatar_url as creatorAvatarUrl
        FROM scr_groups g
        LEFT JOIN scr_users u ON g.creator_id = u.id
        WHERE g.id = ? AND g.deleted_at IS NULL
      `, [groupId]);

      if (group.length === 0) {
        return res.status(404).json({ status: 'error', message: '群组不存在' });
      }

      const [members] = await pool.execute(`
        SELECT u.id, u.nickname, u.avatar_url as avatarUrl, 
               gm.is_admin, gm.is_muted, gm.group_nickname as groupNickname,
               gm.joined_at as joinedAt
        FROM scr_group_members gm
        JOIN scr_users u ON gm.user_id = u.id
        WHERE gm.group_id = ? AND gm.deleted_at IS NULL
        ORDER BY gm.is_admin DESC, gm.joined_at DESC
      `, [groupId]);

      const [messageCount] = await pool.execute(
        'SELECT COUNT(*) as count FROM scr_messages WHERE group_id = ?',
        [groupId]
      );

      const processedGroup = {
        id: group[0].id,
        name: group[0].name,
        description: group[0].description,
        creatorId: group[0].creatorId,
        creatorNickname: group[0].creatorNickname,
        creatorAvatarUrl: group[0].creatorAvatarUrl,
        avatarUrl: group[0].avatarUrl,
        createdAt: group[0].createdAt,
        memberCount: members.length,
        messageCount: messageCount[0].count,
        members: members.map(member => ({
          id: member.id,
          nickname: member.nickname,
          avatarUrl: member.avatarUrl,
          isAdmin: Boolean(member.is_admin),
          isMuted: member.is_muted ? true : false,
          groupNickname: member.groupNickname,
          joinedAt: member.joinedAt
        }))
      };

      res.json({
        status: 'success',
        group: processedGroup
      });
    } catch (err) {
      console.error('获取群组详情失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取群组详情失败' });
    }
  });

  app.post('/api/admin/group/:groupId/mute-member', authenticateAdmin, async (req, res) => {
    try {
      const groupId = parseInt(req.params.groupId);
      const { memberId, duration } = req.body;
      const clientIP = req.clientIP || req.connection.remoteAddress;

      if (!groupId || isNaN(groupId) || !memberId || isNaN(memberId)) {
        return res.status(400).json({ status: 'error', message: '参数错误' });
      }

      const [member] = await pool.execute(
        'SELECT u.id, u.nickname FROM scr_group_members gm JOIN scr_users u ON gm.user_id = u.id WHERE gm.group_id = ? AND gm.user_id = ? AND gm.deleted_at IS NULL',
        [groupId, memberId]
      );

      if (member.length === 0) {
        return res.status(404).json({ status: 'error', message: '成员不在群组中' });
      }

      let mutedValue = null;
      if (duration !== undefined && duration !== null) {
        if (duration === 0) {
          mutedValue = '9999-12-31 23:59:59';
        } else {
          const mutedUntilDate = new Date(Date.now() + duration * 60 * 1000);
          mutedValue = mutedUntilDate.toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }).replace(/(\d{4})\/(\d{2})\/(\d{2})/, '$1-$2-$3');
        }
      }

      await pool.execute(
        'UPDATE scr_group_members SET is_muted = ? WHERE group_id = ? AND user_id = ?',
        [mutedValue, groupId, memberId]
      );

      await logAudit('mute_member', 'group_member', memberId, {
        groupId,
        memberId,
        duration,
        memberNickname: member[0].nickname
      }, null, clientIP);

      res.json({
        status: 'success',
        message: duration ? '成员已被禁言' : '成员已解除禁言',
        groupId,
        memberId,
        duration
      });
    } catch (err) {
      console.error('禁言成员失败:', err.message);
      res.status(500).json({ status: 'error', message: '禁言成员失败' });
    }
  });

  app.post('/api/admin/group/:groupId/kick-member', authenticateAdmin, async (req, res) => {
    try {
      const groupId = parseInt(req.params.groupId);
      const { memberId } = req.body;
      const clientIP = req.clientIP || req.connection.remoteAddress;

      if (!groupId || isNaN(groupId) || !memberId || isNaN(memberId)) {
        return res.status(400).json({ status: 'error', message: '参数错误' });
      }

      const [member] = await pool.execute(
        'SELECT u.id, u.nickname FROM scr_group_members gm JOIN scr_users u ON gm.user_id = u.id WHERE gm.group_id = ? AND gm.user_id = ? AND gm.deleted_at IS NULL',
        [groupId, memberId]
      );

      if (member.length === 0) {
        return res.status(404).json({ status: 'error', message: '成员不在群组中' });
      }

      const deletedAt = new Date(Date.now() + 1000);
      await pool.execute(
        'UPDATE scr_group_members SET deleted_at = ? WHERE group_id = ? AND user_id = ?',
        [deletedAt, groupId, memberId]
      );

      await logAudit('kick_member', 'group_member', memberId, {
        groupId,
        memberId,
        memberNickname: member[0].nickname
      }, null, clientIP);

      res.json({
        status: 'success',
        message: '成员已被踢出群组',
        groupId,
        memberId
      });
    } catch (err) {
      console.error('踢出成员失败:', err.message);
      res.status(500).json({ status: 'error', message: '踢出成员失败' });
    }
  });

  app.post('/api/admin/group/:groupId/dissolve', authenticateAdmin, async (req, res) => {
    try {
      const groupId = parseInt(req.params.groupId);
      const clientIP = req.clientIP || req.connection.remoteAddress;

      if (!groupId || isNaN(groupId)) {
        return res.status(400).json({ status: 'error', message: '群组ID无效' });
      }

      const [group] = await pool.execute(
        'SELECT name, avatar_url FROM scr_groups WHERE id = ? AND deleted_at IS NULL',
        [groupId]
      );

      if (group.length === 0) {
        return res.status(404).json({ status: 'error', message: '群组不存在' });
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        await connection.execute(
          'UPDATE scr_groups SET deleted_at = NOW() WHERE id = ?',
          [groupId]
        );

        await connection.execute(
          'UPDATE scr_group_members SET deleted_at = NOW() WHERE group_id = ?',
          [groupId]
        );

        await connection.commit();
        connection.release();

        if (group[0].avatar_url && group[0].avatar_url !== '/avatars/default.png') {
          try {
            const avatarPathWithoutVersion = group[0].avatar_url.split('?')[0];
            const fullAvatarPath = path.join(__dirname, '..', '..', 'public', avatarPathWithoutVersion);
            if (fs.existsSync(fullAvatarPath)) {
              fs.unlinkSync(fullAvatarPath);
            }
          } catch (deleteError) {
            console.error('删除群头像文件失败', deleteError.message);
          }
        }

        await logAudit('dissolve_group', 'group', groupId, {
          groupId,
          groupName: group[0].name
        }, null, clientIP);

        res.json({
          status: 'success',
          message: '群组已解散',
          groupId,
          groupName: group[0].name
        });
      } catch (transactionErr) {
        await connection.rollback();
        connection.release();
        throw transactionErr;
      }
    } catch (err) {
      console.error('解散群组失败:', err.message);
      res.status(500).json({ status: 'error', message: '解散群组失败' });
    }
  });

  app.get('/api/admin/files', authenticateAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      const query = `
        SELECT m.id, m.user_id as userId, m.content, m.timestamp,
               u.nickname, u.avatar_url as avatarUrl
        FROM scr_messages m
        JOIN scr_users u ON m.user_id = u.id
        WHERE m.message_type = 2
        ORDER BY m.timestamp DESC
        LIMIT ? OFFSET ?
      `;

      const [files] = await pool.query(query, [limit, offset]);

      const [countResult] = await pool.execute(
        'SELECT COUNT(*) as total FROM scr_messages WHERE message_type = 2'
      );

      const processedFiles = files.map(file => {
        let parsedContent = { url: '', filename: 'unknown' };
        try {
          parsedContent = JSON.parse(file.content);
        } catch (e) {
        }
        return {
          id: file.id,
          userId: file.userId,
          nickname: file.nickname,
          avatarUrl: file.avatarUrl,
          fileUrl: parsedContent.url || '',
          filename: parsedContent.filename || 'unknown',
          timestamp: file.timestamp
        };
      });

      res.json({
        status: 'success',
        files: processedFiles,
        pagination: {
          page: page,
          limit: limit,
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limit)
        }
      });
    } catch (err) {
      console.error('获取文件列表失败:', err.message);
      res.status(500).json({ status: 'error', message: '获取文件列表失败' });
    }
  });

  app.delete('/api/admin/file/:messageId', authenticateAdmin, async (req, res) => {
    try {
      const messageId = parseInt(req.params.messageId);
      const clientIP = req.clientIP || req.connection.remoteAddress;

      if (!messageId || isNaN(messageId)) {
        return res.status(400).json({ status: 'error', message: '消息ID无效' });
      }

      const [fileMsg] = await pool.execute(
        'SELECT content FROM scr_messages WHERE id = ? AND message_type = 2',
        [messageId]
      );

      if (fileMsg.length === 0) {
        return res.status(404).json({ status: 'error', message: '文件不存在' });
      }

      let parsedContent = { url: '' };
      try {
        parsedContent = JSON.parse(fileMsg[0].content);
      } catch (e) {
      }

      if (parsedContent.url) {
        const filePath = path.join(__dirname, '..', '..', 'public', parsedContent.url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      await pool.execute(
        'DELETE FROM scr_messages WHERE id = ?',
        [messageId]
      );

      await logAudit('delete_file', 'file', messageId, {
        messageId,
        filename: parsedContent.filename || 'unknown'
      }, null, clientIP);

      res.json({
        status: 'success',
        message: '文件已删除',
        messageId
      });
    } catch (err) {
      console.error('删除文件失败:', err.message);
      res.status(500).json({ status: 'error', message: '删除文件失败' });
    }
  });
}