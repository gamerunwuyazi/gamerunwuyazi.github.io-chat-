import crypto from 'crypto';
import { pool, redisClient } from '../models/database.js';
import { sessionConfig } from '../config/index.js';

let io = null;

export function setSocketIO(socketIO) {
  io = socketIO;
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export async function setUserSession(userId, session, expires, refreshExpires) {
  const tokenKey = `scr:token:${userId}`;
  const refreshTokenKey = `scr:refreshToken:${userId}`;

  await redisClient.set(tokenKey, session.token);
  await redisClient.expire(tokenKey, Math.ceil((expires - Date.now()) / 1000));

  await redisClient.set(refreshTokenKey, session.refreshToken);
  await redisClient.expire(refreshTokenKey, Math.ceil((refreshExpires - Date.now()) / 1000));
}

export async function getUserSession(userId) {
  const tokenKey = `scr:token:${userId}`;
  const refreshTokenKey = `scr:refreshToken:${userId}`;

  const token = await redisClient.get(tokenKey);
  const refreshToken = await redisClient.get(refreshTokenKey);

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

export async function updateOnlineUserByUserId(userId, socketId, nickname, avatarUrl) {
  const userData = {
    id: parseInt(userId),
    socketId,
    nickname,
    avatarUrl,
    lastSeen: new Date().toISOString()
  };

  await redisClient.hSet('scr:online_users', String(userId), JSON.stringify(userData));
}

export async function logIPAction(userId, ip, action) {
  try {
    await pool.execute(
      'INSERT INTO scr_ip_logs (user_id, ip_address, action) VALUES (?, ?, ?)',
      [userId, ip, action]
    );
    await pool.execute(
      'DELETE FROM scr_ip_logs WHERE id NOT IN (SELECT id FROM (SELECT id FROM scr_ip_logs ORDER BY timestamp DESC LIMIT 6000) AS tmp)'
    );
  } catch (err) {
    console.error('记录IP日志失败:', err.message);
  }
}
