import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { pool, redisClient } from '../models/database.js';
import { checkRegisterRateLimit, checkLoginRateLimit } from '../utils/rateLimiters.js';
import { verifyTurnstileToken } from '../utils/turnstile.js';
import { validateUsername, validatePassword, validateNickname } from '../utils/validators.js';
import { getClientIP, generateSessionToken } from '../utils/helpers.js';
import { filterMessageFields } from '../utils/messageFilters.js';
import { sessionConfig } from '../config/index.js';
import {
  setSocketIO as setSessionSocketIO,
  createUserSession,
  getUserSession,
  setUserSession,
  updateOnlineUserByUserId,
  logIPAction
} from '../utils/session.js';
import { isIPBanned } from '../middleware/auth.js';

let io;

export function initUserService(dependencies) {
  ({ io } = dependencies);
  if (io) setSessionSocketIO(io);
}

const avatarDir = path.join(process.cwd(), 'public', 'avatars');

export async function register(req, res) {
  try {
    const { username, password, nickname, gender, turnstileToken } = req.body;
    const clientIP = getClientIP(req);

    const registerRateLimit = await checkRegisterRateLimit(clientIP);
    if (!registerRateLimit.allowed) {
      let message = '注册请求过于频繁';
      if (registerRateLimit.limitType === 'hour') {
        message = `1小时内最多注册2次，请${registerRateLimit.waitSeconds}秒后再试`;
      } else if (registerRateLimit.limitType === 'day') {
        message = `24小时内最多注册5次，请${registerRateLimit.waitSeconds}秒后再试`;
      } else if (registerRateLimit.limitType === 'month') {
        message = `1个月内最多注册20次，请${registerRateLimit.waitSeconds}秒后再试`;
      }
      return res.status(429).json({
        status: 'error',
        message: message
      });
    }

    const banInfo = await isIPBanned(clientIP);
    if (banInfo.isBanned) {
      return res.status(403).json({ status: 'error', message: '您的 IP 已被封禁', isBanned: true, remainingTime: banInfo.remainingTime });
    }

    if (!username || !password || !nickname || !turnstileToken) {
      return res.status(400).json({ status: 'error', message: '请填写所有字段并完成人机验证' });
    }

    const genderNum = parseInt(gender);
    if (isNaN(genderNum) || genderNum < 0 || genderNum > 2) {
      return res.status(400).json({ status: 'error', message: '性别参数非法' });
    }

    const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIP);
    if (!turnstileResult.success) {
      return res.status(400).json({ status: 'error', message: turnstileResult.message || '人机验证失败，请重试' });
    }

    if (!validateUsername(username) && !validatePassword(password) && !validateNickname(nickname)) {
      return res.status(400).json({ status: 'error', message: '用户名、密码或昵称非法' });
    }

    const [existingUsers] = await pool.execute(
        'SELECT id FROM scr_users WHERE username = ?',
        [username]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ status: 'error', message: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
        'INSERT INTO scr_users (username, password, nickname, gender, last_online) VALUES (?, ?, ?, ?, NOW())',
        [username, hashedPassword, nickname, genderNum]
    );

    await logIPAction(result.insertId, clientIP, 'register');

    const autoLoginToken = `${result.insertId}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

    const tokenData = {
      token: autoLoginToken,
      expire: Date.now() + 5 * 60 * 1000
    };

    await redisClient.set(`scr:auto_login_token:${result.insertId}`, JSON.stringify(tokenData), {
      EX: 300
    });

    res.json({
      status: 'success',
      message: '注册成功',
      userId: result.insertId,
      autoLoginToken: autoLoginToken
    });
  } catch (err) {
    console.error('注册失败:', err.message);
    res.status(500).json({ status: 'error', message: '注册失败' });
  }
}

export async function login(req, res) {
  try {
    const { username, password, turnstileToken, autoLoginToken } = req.body;
    const clientIP = getClientIP(req);

    const loginRateLimit = await checkLoginRateLimit(clientIP);
    if (!loginRateLimit.allowed) {
      let message = '登录请求过于频繁';
      if (loginRateLimit.limitType === 'minute') {
        message = `登录请求过于频繁，请${loginRateLimit.waitSeconds}秒后再试`;
      } else if (loginRateLimit.limitType === 'hour') {
        message = `1小时内登录请求次数已达上限，请${loginRateLimit.waitSeconds}秒后再试`;
      }
      return res.status(429).json({
        status: 'error',
        message: message
      });
    }

    const banInfo = await isIPBanned(clientIP);
    if (banInfo.isBanned) {
      let message = '您的 IP 已被封禁';

      if (banInfo.reason) {
        message += `，原因：${banInfo.reason}`;
      }

      if (banInfo.remainingTime) {
        const { days, hours, minutes } = banInfo.remainingTime;
        message += `，还剩 ${days}天${hours}小时${minutes}分钟解封`;
      }

      return res.status(429).json({
        status: 'error',
        message: message,
        isBanned: true,
        reason: banInfo.reason,
        remainingTime: banInfo.remainingTime
      });
    }

    if (autoLoginToken) {
      const tokenParts = autoLoginToken.split('_');
      if (tokenParts.length < 3) {
        return res.status(400).json({ status: 'error', message: '自动登录 token 格式无效' });
      }

      const userId = tokenParts[0];

      const tokenDataStr = await redisClient.get(`scr:auto_login_token:${userId}`);

      if (!tokenDataStr) {
        return res.status(400).json({ status: 'error', message: '自动登录 token 无效或已过期' });
      }

      const tokenData = JSON.parse(tokenDataStr);

      if (tokenData.token !== autoLoginToken) {
        return res.status(400).json({ status: 'error', message: '自动登录 token 不匹配' });
      }

      if (Date.now() > tokenData.expire) {
        await redisClient.del(`scr:auto_login_token:${userId}`);
        return res.status(400).json({ status: 'error', message: '自动登录 token 已过期，请使用验证码登录' });
      }

      const [users] = await pool.execute(
        'SELECT id, username, nickname, gender, avatar_url FROM scr_users WHERE id = ?',
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({ status: 'error', message: '用户不存在' });
      }

      const user = users[0];
      const session = await createUserSession(userId);

      await redisClient.del(`scr:auto_login_token:${userId}`);

      await logIPAction(userId, clientIP, 'auto-login');

      res.json({
        status: 'success',
        message: '自动登录成功',
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          gender: user.gender,
          avatar_url: user.avatar_url
        },
        ...session
      });
      return;
    }

    if (!username || !password || !turnstileToken) {
      return res.status(400).json({ status: 'error', message: '请填写用户名、密码并完成人机验证' });
    }

    const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIP);
    if (!turnstileResult.success) {
      return res.status(400).json({ status: 'error', message: turnstileResult.message || '人机验证失败，请重试' });
    }

    const [users] = await pool.execute(
        'SELECT id, username, password, nickname, gender, avatar_url FROM scr_users WHERE username = ?',
        [username]
    );

    if (users.length === 0) {
      return res.status(401).json({ status: 'error', message: '用户名或密码错误' });
    }

    const user = users[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ status: 'error', message: '用户名或密码错误' });
    }

    const session = await createUserSession(user.id);

    await logIPAction(user.id, clientIP, 'login');

    res.json({
      status: 'success',
      message: '登录成功',
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        gender: user.gender,
        avatar_url: user.avatar_url
      },
      ...session
    });
  } catch (err) {
    console.error('登录失败:', err.message);
    res.status(500).json({ status: 'error', message: '登录失败' });
  }
}

export async function refreshToken(req, res) {
  try {
    const { userId, refreshToken } = req.body;

    if (!userId || !refreshToken) {
      return res.status(400).json({ status: 'error', message: '缺少必要参数' });
    }

    const session = await getUserSession(parseInt(userId));

    if (!session || !session.refreshToken) {
      return res.status(401).json({ status: 'error', message: '会话已过期，请重新登录' });
    }

    if (session.refreshToken !== refreshToken) {
      return res.status(401).json({ status: 'error', message: 'Refresh Token 无效' });
    }

    const newToken = generateSessionToken();
    const newRefreshToken = generateSessionToken();
    const newExpires = Date.now() + (sessionConfig.expireMinutes * 60 * 1000);
    const newRefreshExpires = Date.now() + (sessionConfig.refreshExpireDays * 24 * 60 * 60 * 1000);

    const newSession = {
      token: newToken,
      refreshToken: newRefreshToken
    };
    await setUserSession(parseInt(userId), newSession, newExpires, newRefreshExpires);

    await pool.execute(
      'UPDATE scr_sessions SET refresh_token = ?, refresh_expires = ?, last_active = ? WHERE user_id = ?',
      [newRefreshToken, new Date(newRefreshExpires), new Date(), parseInt(userId)]
    );

    res.json({
      status: 'success',
      message: 'Token 刷新成功',
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (err) {
    console.error('刷新 Token 失败:', err.message);
    res.status(500).json({ status: 'error', message: '刷新 Token 失败' });
  }
}

export async function updateNickname(req, res) {
  try {
    const userId = req.userId;
    const { newNickname } = req.body;

    if (!validateNickname(newNickname)) {
      return res.status(400).json({ status: 'error', message: '昵称不能为空' });
    }

    await pool.execute(
      'UPDATE scr_users SET nickname = ? WHERE id = ?',
      [newNickname, userId]
    );

    const [users] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: '用户不存在' });
    }

    const user = users[0];

    const [nicknameUpdateResult] = await pool.execute(
      'INSERT INTO scr_messages (user_id, content, message_type, timestamp) VALUES (?, ?, ?, NOW())',
      [userId, JSON.stringify({ type: 'nickname', nickname: newNickname }), 102]
    );

    await updateOnlineUserByUserId(userId, { nickname: newNickname });

    const now = new Date();
    const timestampMs = now.getTime();
    const rawType102Message = {
      id: nicknameUpdateResult.insertId,
      userId: userId,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      content: JSON.stringify({ type: 'nickname', nickname: newNickname }),
      messageType: 102,
      groupId: null,
      timestamp: timestampMs,
      timestampISO: now.toISOString()
    };

    const type102Message = filterMessageFields(rawType102Message, 'public');

    io.to('authenticated_users').emit('message-received', type102Message);

    res.json({ status: 'success', message: '昵称修改成功', nickname: newNickname });
  } catch (err) {
    console.error('修改昵称失败:', err.message);
    res.status(500).json({ status: 'error', message: '修改昵称失败' });
  }
}

export async function updateSignature(req, res) {
  try {
    const userId = req.headers['user-id'];
    const { signature } = req.body;

    if (!userId) {
      return res.status(400).json({ status: 'error', message: '用户 ID 不能为空' });
    }

    const cleanSignature = signature ? signature.substring(0, 500) : null;

    await pool.execute(
      'UPDATE scr_users SET signature = ? WHERE id = ?',
      [cleanSignature, userId]
    );

    res.json({
      status: 'success',
      message: '个性签名更新成功'
    });
  } catch (err) {
    console.error('更新个性签名失败:', err.message);
    res.status(500).json({ status: 'error', message: '更新个性签名失败' });
  }
}

export async function updateGender(req, res) {
  try {
    const userId = req.headers['user-id'];
    const { gender } = req.body;

    if (!userId) {
      return res.status(400).json({ status: 'error', message: '用户 ID 不能为空' });
    }

    const genderNum = parseInt(gender);
    if (isNaN(genderNum) || genderNum < 0 || genderNum > 2) {
      return res.status(400).json({ status: 'error', message: '性别参数非法' });
    }

    await pool.execute(
      'UPDATE scr_users SET gender = ? WHERE id = ?',
      [genderNum, userId]
    );

    res.json({
      status: 'success',
      message: '性别更新成功'
    });
  } catch (err) {
    console.error('更新性别失败:', err.message);
    res.status(500).json({ status: 'error', message: '更新性别失败' });
  }
}

export async function changePassword(req, res) {
  try {
    const userId = req.userId;
    const clientIP = getClientIP(req);
    const { oldPassword, newPassword, turnstileToken } = req.body;

    if (!oldPassword || !newPassword || !turnstileToken) {
      return res.status(400).json({ status: 'error', message: '缺少必要参数' });
    }

    if (!validatePassword(newPassword)) {
      return res.status(400).json({ status: 'error', message: '新密码格式错误' });
    }

    const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIP);
    if (!turnstileResult.success) {
      return res.status(400).json({ status: 'error', message: turnstileResult.message || '人机验证失败，请重试' });
    }

    const [users] = await pool.execute(
      'SELECT id, password FROM scr_users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: '用户不存在' });
    }

    const user = users[0];
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ status: 'error', message: '原密码错误' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await pool.execute(
      'UPDATE scr_users SET password = ? WHERE id = ?',
      [hashedNewPassword, userId]
    );

    res.json({ status: 'success', message: '密码修改成功' });
  } catch (err) {
    console.error('修改密码失败:', err.message);
    res.status(500).json({ status: 'error', message: '修改密码失败' });
  }
}

export async function uploadAvatar(req, res) {
  try {
    if (!req.file) {
      const ext = req.body?.filename ? path.extname(req.body.filename).toLowerCase() : '';
      const prohibitedExts = ['.php', '.php3', '.php4', '.php5', '.phtml', '.phar'];
      if (prohibitedExts.includes(ext)) {
        return res.status(400).json({ status: 'error', message: '禁止上传PHP文件' });
      }
      return res.status(400).json({ status: 'error', message: '没有上传文件' });
    }

    const storageStatus = checkAvatarStorage();
    if (storageStatus.full) {
      return res.status(400).json({ status: 'error', message: storageStatus.message });
    }

    const userId = req.userId;

    if (!userId) {
      return res.status(400).json({ status: 'error', message: '用户ID不能为空' });
    }

    const [users] = await pool.execute(
        'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
        [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: '用户不存在' });
    }

    const user = users[0];

    if (!req.file?.filename) {
      console.error('❌ 头像上传失败：文件对象缺少filename字段');
      return res.status(500).json({ status: 'error', message: '文件处理失败' });
    }
    
    const avatarUrl = `/avatars/${req.file.filename}`;

    const avatarFiles = fs.readdirSync(avatarDir).filter(file => {
      return file.startsWith(`avatar_${userId}.`);
    });

    if (avatarFiles.length > 1) {
      const currentAvatarFilename = req.file.filename;
      for (const file of avatarFiles) {
        if (file !== currentAvatarFilename) {
          try {
            const filePath = path.join(avatarDir, file);
            fs.unlinkSync(filePath);
          } catch (deleteError) {
            console.error(`删除旧头像文件 ${file} 失败:`, deleteError.message);
          }
        }
      }
    }

    const timestamp = Date.now();
    const avatarUrlWithVersion = `${avatarUrl}?v=${timestamp}`;

    await pool.execute(
        'UPDATE scr_users SET avatar_url = ? WHERE id = ?',
        [avatarUrlWithVersion, userId]
    );

    const [avatarUpdateResult] = await pool.execute(
      'INSERT INTO scr_messages (user_id, content, message_type, timestamp) VALUES (?, ?, ?, NOW())',
      [userId, JSON.stringify({ type: 'avatar', avatarUrl: avatarUrlWithVersion }), 102]
    );

    await updateOnlineUserByUserId(userId, { avatarUrl: avatarUrlWithVersion });

    const now = new Date();
    const timestampMs = now.getTime();
    const rawType102Message = {
      id: avatarUpdateResult.insertId,
      userId: userId,
      nickname: user.nickname,
      avatarUrl: avatarUrlWithVersion,
      content: JSON.stringify({ type: 'avatar', avatarUrl: avatarUrlWithVersion }),
      messageType: 102,
      groupId: null,
      timestamp: timestampMs,
      timestampISO: now.toISOString()
    };

    const type102Message = filterMessageFields(rawType102Message, 'public');

    io.to('authenticated_users').emit('message-received', type102Message);

    res.json({
      status: 'success',
      avatarUrl: avatarUrlWithVersion,
      message: '头像上传成功'
    });
  } catch (err) {
    console.error('头像上传失败:', err.message);
    res.status(500).json({ status: 'error', message: '头像上传失败' });
  }
}

export async function getSelfInfo(req, res) {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ status: 'error', message: '未登录' });
    }

    const [users] = await pool.execute(
      'SELECT id, username, nickname, gender, signature, avatar_url, friend_verification, last_online, created_at FROM scr_users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: '用户不存在' });
    }

    const user = users[0];

    res.json({
      status: 'success',
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        gender: user.gender,
        signature: user.signature,
        avatar_url: user.avatar_url,
        friend_verification: user.friend_verification,
        last_online: user.last_online,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('获取当前用户信息失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取当前用户信息失败' });
  }
}

export async function getUserById(req, res) {
  try {
    const userId = req.params.id;

    const [users] = await pool.execute(
        'SELECT id, username, nickname, gender, signature, avatar_url FROM scr_users WHERE id = ?',
        [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: '用户不存在' });
    }

    res.json({
      status: 'success',
      user: users[0]
    });
  } catch (err) {
    console.error('获取用户信息失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取用户信息失败' });
  }
}

export async function searchUsers(req, res) {
  try {
    const { keyword } = req.query;

    if (!keyword || keyword.trim().length === 0) {
      return res.status(400).json({ status: 'error', message: '搜索关键词不能为空' });
    }

    let escapedKeyword = keyword.trim();
    escapedKeyword = escapedKeyword.replace(/\\/g, '\\\\');
    escapedKeyword = escapedKeyword.replace(/%/g, '\\%');

    const searchKeyword = `%${escapedKeyword}%`;

    const [users] = await pool.execute(`
      SELECT id, nickname, username, gender, avatar_url
      FROM scr_users
      WHERE username LIKE ? OR nickname LIKE ?
      LIMIT 20
    `, [searchKeyword, searchKeyword]);

    res.json({
      status: 'success',
      users: users,
      message: '搜索用户成功'
    });
  } catch (err) {
    console.error('搜索用户失败:', err.message);
    res.status(500).json({ status: 'error', message: '搜索用户失败' });
  }
}

export function checkAvatarStorage() {
  let totalSize = 0;

  if (fs.existsSync(avatarDir)) {
    const files = fs.readdirSync(avatarDir);
    for (const file of files) {
      const filePath = path.join(avatarDir, file);
      try {
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      } catch (err) {
        console.error('获取文件状态失败:', filePath, err.message);
      }
    }
  }

  const sizeInMB = totalSize / (1024 * 1024);

  if (sizeInMB >= 5000) {
    return {
      full: true,
      size: sizeInMB,
      sizeInGB: (sizeInMB / 1024).toFixed(2),
      message: `服务器头像存储已满（超过5GB，当前使用: ${(sizeInMB / 1024).toFixed(2)}GB/5GB）`
    };
  }

  return {
    full: false,
    size: sizeInMB,
    sizeInGB: (sizeInMB / 1024).toFixed(2),
    message: `当前头像存储使用: ${sizeInMB.toFixed(2)}MB (${(sizeInMB / 1024).toFixed(2)}GB/5GB)`
  };
}
