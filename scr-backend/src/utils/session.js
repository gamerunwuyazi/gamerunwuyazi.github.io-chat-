import { pool, redisClient } from '../models/database.js';
import { sessionConfig } from '../config/index.js';
import { generateSessionToken } from './helpers.js';

let io = null;

export function setSocketIO(socketIo) {
  io = socketIo;
}

export async function setUserSession(userId, session, expires, refreshExpires) {
  const tokenKey = `scr:token:${userId}`;

  await redisClient.set(tokenKey, session.token);
  await redisClient.expire(tokenKey, Math.ceil((expires - Date.now()) / 1000));
}

export async function getUserSession(userId) {
  const tokenKey = `scr:token:${userId}`;

  const token = await redisClient.get(tokenKey);

  const [rows] = await pool.execute(
    'SELECT refresh_token, refresh_expires FROM scr_sessions WHERE user_id = ?',
    [userId]
  );
  const refreshToken = rows.length > 0 ? rows[0].refresh_token : null;

  if (!token && !refreshToken) {
    return null;
  }

  return { token, refreshToken };
}

export async function saveSessionToDatabase(userId, refreshToken, refreshExpires) {
  await pool.execute(
    `INSERT INTO scr_sessions (user_id, refresh_token, refresh_expires, last_active, created_at)
     VALUES (?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       refresh_token = VALUES(refresh_token),
       refresh_expires = VALUES(refresh_expires),
       last_active = VALUES(last_active)`,
    [userId, refreshToken, new Date(refreshExpires)]
  );
}

export async function createUserSession(userId) {
  const token = generateSessionToken();
  const refreshToken = generateSessionToken();

  const expires = Date.now() + (sessionConfig.expireMinutes * 60 * 1000);
  const refreshExpires = Date.now() + (sessionConfig.refreshExpireDays * 24 * 60 * 60 * 1000);

  const session = { token, refreshToken };

  if (io) {
    const existingSession = await getUserSession(parseInt(userId));
    if (existingSession) {
      io.to(`user_${userId}`).emit('account-logged-in-elsewhere', {
        message: '您的账号在其他设备上登录，请重新登录',
        timestamp: new Date().toISOString()
      });
      io.to(`user_${userId}`).disconnectSockets(true);
    }
  }

  await setUserSession(parseInt(userId), session, expires, refreshExpires);
  await saveSessionToDatabase(parseInt(userId), refreshToken, refreshExpires);

  return { token, refreshToken, expiresIn: 20 * 60 };
}

export async function updateOnlineUserByUserId(userId, updates) {
  try {
    const users = await redisClient.hGetAll('scr:online_users');
    for (const socketId in users) {
      try {
        const userData = JSON.parse(users[socketId]);
        if (userData && userData.id && String(userData.id) === String(userId)) {
          const updatedUser = { ...userData, ...updates };
          await redisClient.hSet('scr:online_users', socketId, JSON.stringify(updatedUser));
        }
      } catch (parseErr) {
        console.error(`❌ 解析在线用户数据失败(socketId: ${socketId}):`, parseErr.message);
        await redisClient.hDel('scr:online_users', String(socketId));
      }
    }
  } catch (err) {
    console.error('按用户ID更新在线用户失败:', err.message);
  }
}

export async function getOnlineUser(socketId) {
  try {
    const userData = await redisClient.hGet('scr:online_users', String(socketId));
    return userData ? JSON.parse(userData) : null;
  } catch (err) {
    console.error('获取在线用户失败:', err.message);
    return null;
  }
}

export async function removeOnlineUser(socketId) {
  try {
    await redisClient.hDel('scr:online_users', String(socketId));
  } catch (err) {
    console.error('移除在线用户失败:', err.message);
  }
}

export async function getAllOnlineUsers() {
  try {
    const users = await redisClient.hGetAll('scr:online_users');
    const result = [];
    for (const socketId in users) {
      try {
        const userData = JSON.parse(users[socketId]);
        if (userData && userData.id) {
          result.push({ socketId, ...userData });
        }
      } catch (parseErr) {
        console.error('解析在线用户数据失败:', parseErr.message);
        await redisClient.hDel('scr:online_users', String(socketId));
      }
    }
    return result;
  } catch (err) {
    console.error('获取所有在线用户失败:', err.message);
    return [];
  }
}

let ipLogWritesSinceCleanup = 0;

export async function logIPAction(userId, ip, action) {
  try {
    await pool.execute(
      'INSERT INTO scr_ip_logs (user_id, ip_address, action) VALUES (?, ?, ?)',
      [userId, ip, action]
    );

    ipLogWritesSinceCleanup += 1;
    if (ipLogWritesSinceCleanup >= 100) {
      ipLogWritesSinceCleanup = 0;
      void trimIPLogs();
    }
  } catch (err) {
    console.error('记录IP日志失败:', err.message);
  }
}

const IP_LOG_KEEP = 8000;

export async function trimIPLogs() {
  try {
    const [countResult] = await pool.execute('SELECT COUNT(*) as cnt FROM scr_ip_logs');
    const currentCount = countResult[0].cnt;
    if (currentCount > IP_LOG_KEEP) {
      const toDelete = currentCount - IP_LOG_KEEP;
      await pool.query(
        'DELETE FROM scr_ip_logs ORDER BY timestamp ASC LIMIT ?',
        [toDelete]
      );
    }
  } catch (err) {
    console.error('清理IP日志失败:', err.message);
  }
}
