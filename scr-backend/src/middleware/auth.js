import { pool, redisClient, safeRedisExecute } from '../models/database.js';
import { rateLimitConfig } from '../config/index.js';

const RATE_LIMIT_CONFIG = {
  SHORT_WINDOW_MS: rateLimitConfig.shortWindowMs,
  SHORT_LIMIT: rateLimitConfig.shortLimit,
  LONG_WINDOW_MS: rateLimitConfig.longWindowMs,
  LONG_LIMIT: rateLimitConfig.longLimit
};

async function checkRateLimit(userId) {
  const now = Date.now();
  const shortWindowKey = `scr:rate_limit:${userId}:short`;
  const longWindowKey = `scr:rate_limit:${userId}:long`;

  return safeRedisExecute(async (client) => {
    const shortRecords = await client.lRange(shortWindowKey, 0, -1);
    const shortTimestamps = shortRecords.map(Number).filter(ts => now - ts < RATE_LIMIT_CONFIG.SHORT_WINDOW_MS);

    const longRecords = await client.lRange(longWindowKey, 0, -1);
    const longTimestamps = longRecords.map(Number).filter(ts => now - ts < RATE_LIMIT_CONFIG.LONG_WINDOW_MS);

    if (shortTimestamps.length >= RATE_LIMIT_CONFIG.SHORT_LIMIT) {
      const oldestShort = shortTimestamps[0];
      return {
        allowed: false,
        retryAfter: Math.ceil((oldestShort + RATE_LIMIT_CONFIG.SHORT_WINDOW_MS - now) / 1000)
      };
    }

    if (longTimestamps.length >= RATE_LIMIT_CONFIG.LONG_LIMIT) {
      const oldestLong = longTimestamps[0];
      return {
        allowed: false,
        retryAfter: Math.ceil((oldestLong + RATE_LIMIT_CONFIG.LONG_WINDOW_MS - now) / 1000)
      };
    }

    await client.rPush(shortWindowKey, String(now));
    await client.rPush(longWindowKey, String(now));

    await client.expire(shortWindowKey, Math.ceil(RATE_LIMIT_CONFIG.SHORT_WINDOW_MS / 1000));
    await client.expire(longWindowKey, Math.ceil(RATE_LIMIT_CONFIG.LONG_WINDOW_MS / 1000));

    return { allowed: true };
  }, { allowed: true });
}

function getClientIP(req) {
  if (req.headers['x-forwarded-for']) {
    const forwardedFor = req.headers['x-forwarded-for'].trim();
    const ips = forwardedFor.split(',');
    const clientIP = ips[0].trim();
    return clientIP;
  }

  return req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      (req.connection.socket ? req.connection.socket.remoteAddress : null);
}

async function isIPBanned(ip) {
  return safeRedisExecute(async (client) => {
    const banDataStr = await client.hGet('scr:banned_ips', ip);

    if (banDataStr) {
      const banData = JSON.parse(banDataStr);

      if (banData.expires_at) {
        const expireDate = new Date(banData.expires_at);
        const now = new Date();

        if (expireDate <= now) {
          await client.hDel('scr:banned_ips', ip);
          await pool.execute(
            'DELETE FROM scr_banned_ips WHERE ip_address = ? AND expires_at IS NOT NULL AND expires_at <= NOW()',
            [ip]
          );
          return { isBanned: false, reason: null, remainingTime: null };
        }

        const diff = expireDate - now;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        return {
          isBanned: true,
          reason: banData.reason || '未知原因',
          remainingTime: { totalSeconds: Math.ceil(diff / 1000), days, hours, minutes }
        };
      }

      return { isBanned: true, reason: banData.reason || '永久封禁', remainingTime: null };
    }

    return { isBanned: false, reason: null, remainingTime: null };
  }, { isBanned: false, reason: null, remainingTime: null });
}

async function isUserBanned(userId) {
  return safeRedisExecute(async (client) => {
    const userIdStr = String(userId);
    const banDataStr = await client.hGet('scr:banned_users', userIdStr);

    if (banDataStr) {
      const banData = JSON.parse(banDataStr);

      if (banData.expires_at) {
        const expireDate = new Date(banData.expires_at);
        const now = new Date();

        if (expireDate <= now) {
          await client.hDel('scr:banned_users', userIdStr);
          await pool.execute(
            'DELETE FROM scr_banned_ips WHERE user_id = ? AND expires_at IS NOT NULL AND expires_at <= NOW()',
            [userId]
          );
          return { isBanned: false, reason: null, remainingTime: null };
        }

        const diff = expireDate - now;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        return {
          isBanned: true,
          reason: banData.reason || '未知原因',
          remainingTime: { totalSeconds: Math.ceil(diff / 1000), days, hours, minutes }
        };
      }

      return { isBanned: true, reason: banData.reason || '永久封禁', remainingTime: null };
    }

    return { isBanned: false, reason: null, remainingTime: null };
  }, { isBanned: false, reason: null, remainingTime: null });
}

async function validateUserSession(userId, token) {
  if (!userId || !token) {
    return false;
  }

  return safeRedisExecute(async (client) => {
    const userIdNum = parseInt(userId);
    const tokenKey = `scr:token:${userIdNum}`;
    const sessionToken = await client.get(tokenKey);

    if (!sessionToken) {
      return false;
    }

    if (sessionToken !== token) {
      return false;
    }

    return true;
  }, false);
}

async function getUserSession(userId) {
  return safeRedisExecute(async (client) => {
    const tokenKey = `scr:token:${userId}`;
    const refreshTokenKey = `scr:refreshToken:${userId}`;

    const [tokenData, refreshTokenData] = await Promise.all([
      client.get(tokenKey),
      client.get(refreshTokenKey)
    ]);

    if (!tokenData && !refreshTokenData) {
      return null;
    }

    return {
      token: tokenData || null,
      refreshToken: refreshTokenData || null
    };
  }, null);
}

async function validateIP(req, res, next) {
  try {
    let clientIP = getClientIP(req);

    if (clientIP === '::1') {
      clientIP = '127.0.0.1';
    } else if (clientIP && clientIP.startsWith('::ffff:')) {
      clientIP = clientIP.slice(7);
    }

    if (!clientIP) {
      return res.status(403).json({ status: 'error', message: '访问被拒绝' });
    }

    const ipBanResult = await isIPBanned(clientIP);
    if (ipBanResult.isBanned) {
      const banInfo = {
        reason: ipBanResult.reason,
        banUntil: ipBanResult.remainingTime ? new Date(Date.now() + ipBanResult.remainingTime.totalSeconds * 1000) : null
      };

      return res.status(403).json({
        status: 'error',
        message: '您的IP地址已被封禁',
        banInfo: banInfo
      });
    }

    req.clientIP = clientIP;
    next();
  } catch (err) {
    let clientIP = getClientIP(req);
    if (clientIP === '::1') {
      clientIP = '127.0.0.1';
    } else if (clientIP && clientIP.startsWith('::ffff:')) {
      clientIP = clientIP.slice(7);
    }
    console.error(`❌ [API] IP验证错误: ${clientIP}, 路径: ${req.path}, 错误: ${err.message}`);
    res.status(500).json({ status: 'error', message: '服务器错误' });
  }
}

const excludedPaths = {
  '*': [
    '/api/health',
    '/api/check-status',
    '/api/session-check',
    '/api/sessions',
    '/api/admin/login-ips',
    '/api/admin/api-logs',
    '/api/admin/ban-ip',
    '/api/admin/unban-ip',
    '/api/admin/banned-ips',
    '/api/register',
    '/api/login',
    '/api/refresh-token',
    '/api/check-username'
  ],
  'GET': [
    '/avatars',
    '/uploads'
  ]
};

async function validateIPAndSession(req, res, next) {
  try {
    let isExcluded = false;

    if (excludedPaths['*']) {
      isExcluded = excludedPaths['*'].some(path => {
        if (path.endsWith('/')) {
          return req.path.startsWith(path);
        }
        return req.path === path || req.path.startsWith(path + '/');
      });
    }

    if (!isExcluded && excludedPaths[req.method]) {
      isExcluded = excludedPaths[req.method].some(path => {
        if (path.endsWith('/')) {
          return req.path.startsWith(path);
        }
        return req.path === path || req.path.startsWith(path + '/');
      });
    }

    if (isExcluded) {
      return next();
    }

    let clientIP = getClientIP(req);

    if (clientIP === '::1') {
      clientIP = '127.0.0.1';
    } else if (clientIP && clientIP.startsWith('::ffff:')) {
      clientIP = clientIP.slice(7);
    }

    if (!clientIP) {
      return res.status(403).json({ status: 'error', message: '访问被拒绝' });
    }

    const ipBanResult = await isIPBanned(clientIP);
    if (ipBanResult.isBanned) {
      const banInfo = {
        reason: ipBanResult.reason,
        banUntil: ipBanResult.remainingTime ? new Date(Date.now() + ipBanResult.remainingTime.totalSeconds * 1000) : null
      };

      return res.status(403).json({
        status: 'error',
        message: '您的IP地址已被封禁',
        banInfo: banInfo
      });
    }

    req.clientIP = clientIP;

    const userId = req.headers['user-id'] || req.query.userId;
    const sessionToken = req.headers['session-token'] || req.query.sessionToken;

    if (!userId || !sessionToken) {
      return res.status(401).json({ status: 'error', message: '未授权访问' });
    }

    if (!(await validateUserSession(userId, sessionToken))) {
      return res.status(401).json({ status: 'error', message: '会话无效' });
    }

    const userBanResult = await isUserBanned(userId);
    if (userBanResult.isBanned) {
      const banInfo = {
        reason: userBanResult.reason,
        banUntil: userBanResult.remainingTime ? new Date(Date.now() + userBanResult.remainingTime.totalSeconds * 1000) : null
      };

      return res.status(403).json({
        status: 'error',
        message: '您的账号已被封禁',
        banInfo: banInfo
      });
    }

    req.userId = userId;
    req.sessionToken = sessionToken;

    next();
  } catch (err) {
    let clientIP = getClientIP(req);
    if (clientIP === '::1') {
      clientIP = '127.0.0.1';
    } else if (clientIP && clientIP.startsWith('::ffff:')) {
      clientIP = clientIP.slice(7);
    }
    const userId = req.headers['user-id'] || req.query.userId;
    console.error(`❌ [API] 组合验证错误: ${clientIP}, userId=${userId || 'undefined'}, 路径: ${req.path}, 错误: ${err.message}`);
    res.status(500).json({ status: 'error', message: '服务器错误' });
  }
}

export {
  checkRateLimit,
  getClientIP,
  isIPBanned,
  isUserBanned,
  validateUserSession,
  getUserSession,
  validateIP,
  validateIPAndSession,
  excludedPaths
};
