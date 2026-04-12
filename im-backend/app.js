const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2/promise');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const crypto = require('crypto');
const schedule = require('node-schedule');
const dotenv = require('dotenv');
const redis = require('redis');

// 创建 Redis 客户端（本地无密码）
const redisClient = redis.createClient({
  host: 'localhost',
  port: 6379
});

// Redis 连接事件处理
redisClient.on('error', (err) => {
  console.error('❌ Redis 连接错误:', err.message);
});

// 连接 Redis
(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error('❌ Redis 连接失败:', err.message);
  }
})();

// 检测并加载环境变量配置
let envPath;
if (fs.existsSync(path.join(__dirname, '.env.local'))) {
  envPath = path.join(__dirname, '.env.local');
} else if (fs.existsSync(path.join(__dirname, '.env'))) {
  envPath = path.join(__dirname, '.env');
}

if (envPath) {
  dotenv.config({ path: envPath });
  console.log('✅ 已加载环境变量配置文件');
} else {
  console.log('');
  console.log('⚠️  未检测到 .env 或 .env.local 配置文件！');
  console.log('⚠️  请修改 .env.example 为 .env.local 并填写配置信息');
  console.log('');
  console.log('需要配置以下环境变量:');
  console.log('  - DB_HOST: MySQL数据库地址');
  console.log('  - DB_USER: MySQL用户名');
  console.log('  - DB_PASSWORD: MySQL密码');
  console.log('  - DB_NAME: 数据库名称');
  console.log('  - ADMIN_PASSWORD: 管理员密码');
  console.log('');
  process.exit(1);
}

// 从环境变量读取配置，如果没有则使用默认值（或空值导致启动失败）
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// 获取所有群组 ID 列表
async function getAllGroupIds() {
  try {
    const [groups] = await pool.execute('SELECT id FROM chat_groups WHERE deleted_at IS NULL');
    return groups.map(g => g.id);
  } catch (err) {
    console.error('获取群组列表失败:', err.message);
    return [];
  }
}

// 速率限制配置
const RATE_LIMIT_CONFIG = {
  SHORT_WINDOW_MS: 10 * 1000, // 10 秒
  SHORT_LIMIT: 10,            // 10 条消息
  LONG_WINDOW_MS: 60 * 1000,  // 1 分钟
  LONG_LIMIT: 40              // 40 条消息
};

// 速率限制检查（使用 Redis）
async function checkRateLimit(userId) {
  const now = Date.now();
  const shortWindowKey = `scr:rate_limit:${userId}:short`;
  const longWindowKey = `scr:rate_limit:${userId}:long`;
  
  try {
    // 获取短期窗口记录
    const shortRecords = await redisClient.lRange(shortWindowKey, 0, -1);
    const shortTimestamps = shortRecords.map(Number).filter(ts => now - ts < RATE_LIMIT_CONFIG.SHORT_WINDOW_MS);
    
    // 获取长期窗口记录
    const longRecords = await redisClient.lRange(longWindowKey, 0, -1);
    const longTimestamps = longRecords.map(Number).filter(ts => now - ts < RATE_LIMIT_CONFIG.LONG_WINDOW_MS);
    
    // 检查是否超出限制
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
    
    // 记录当前请求（需要转换为字符串）
    await redisClient.rPush(shortWindowKey, String(now));
    await redisClient.rPush(longWindowKey, String(now));
    
    // 设置过期时间
    await redisClient.expire(shortWindowKey, Math.ceil(RATE_LIMIT_CONFIG.SHORT_WINDOW_MS / 1000));
    await redisClient.expire(longWindowKey, Math.ceil(RATE_LIMIT_CONFIG.LONG_WINDOW_MS / 1000));
    
    return { allowed: true };
  } catch (err) {
    console.error('检查速率限制失败:', err.message);
    return { allowed: true }; // Redis 失败时允许通过
  }
}

const app = express();
const server = http.createServer(app);

// 配置 Socket.IO - 修复CORS配置
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
    transports: ['websocket', 'polling']
  },
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  upgradeTimeout: 30000
});

// 配置 CORS 选项
const corsOptions = {
  origin: function (origin, callback) {
    callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "user-id", "session-token"]
};

// 应用 CORS 中间件
app.use(cors(corsOptions));

// 添加安全头中间件
app.use((req, res, next) => {
  // 基础安全头
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=0; includeSubDomains');

  // 防止MIME类型混淆攻击
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 禁止客户端缓存敏感页面
  if (req.path.includes('/admin') || req.path.includes('/private')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  // 内容安全策略 (CSP)
  res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://cdn.socket.io https://cdn.jsdelivr.net; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob: http: https:; " +
      "connect-src 'self' ws: wss: http: https:; " +
      "font-src 'self'; " +
      "object-src 'none'; " +
      "media-src 'self'; " +
      "frame-src 'none';"
  );

  next();
});

// 创建连接池
const pool = mysql.createPool(dbConfig);

// 中间件
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// 获取真实IP地址
function getClientIP(req) {
  // 处理x-forwarded-for头，获取真实客户端IP
  // x-forwarded-for格式：client, proxy1, proxy2
  if (req.headers['x-forwarded-for']) {
    // 解析x-forwarded-for头，获取第一个IP地址
    const forwardedFor = req.headers['x-forwarded-for'].trim();
    const ips = forwardedFor.split(',');
    // 取第一个IP地址，并去除空格
    const clientIP = ips[0].trim();
    return clientIP;
  }
  
  // 直接从连接获取IP
  return req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      (req.connection.socket ? req.connection.socket.remoteAddress : null);
}

// IP封禁验证中间件（同时检查IP和用户ID）
async function validateIP(req, res, next) {
  try {
    let clientIP = getClientIP(req);
    
    // 处理IPv6地址，转换为IPv4格式
    if (clientIP === '::1') {
      clientIP = '127.0.0.1';
    } else if (clientIP && clientIP.startsWith('::ffff:')) {
      // 处理IPv6格式的IPv4地址，例如::ffff:192.168.1.1
      clientIP = clientIP.slice(7);
    }
    
    // console.log(`🔍 [API] IP验证开始: ${clientIP}, 路径: ${req.path}, 方法: ${req.method}`);
    
    if (!clientIP) {
      return res.status(403).json({ status: 'error', message: '访问被拒绝' });
    }

    // 检查IP是否被封禁
    const ipBanResult = await isIPBanned(clientIP);
    if (ipBanResult.isBanned) {
      const banInfo = {
        reason: ipBanResult.reason,
        banUntil: ipBanResult.remainingTime ? new Date(Date.now() + ipBanResult.remainingTime.totalSeconds * 1000) : null
      };
      
      // console.log(`🚫 [API] IP被封禁: ${clientIP}, 路径: ${req.path}, 原因: ${banInfo.reason}, 过期时间: ${banInfo.banUntil ? new Date(banInfo.banUntil).toISOString() : '永久'}`);
      
      return res.status(403).json({ 
        status: 'error', 
        message: '您的IP地址已被封禁',
        banInfo: banInfo
      });
    }

    // console.log(`✅ [API] IP验证通过: ${clientIP}, 路径: ${req.path}`);
    req.clientIP = clientIP;
    next();
  } catch (err) {
    let clientIP = getClientIP(req);
    // 处理IPv6地址，转换为IPv4格式
    if (clientIP === '::1') {
      clientIP = '127.0.0.1';
    } else if (clientIP && clientIP.startsWith('::ffff:')) {
      clientIP = clientIP.slice(7);
    }
    console.error(`❌ [API] IP验证错误: ${clientIP}, 路径: ${req.path}, 错误: ${err.message}`);
    res.status(500).json({ status: 'error', message: '服务器错误' });
  }
}

// 不需要验证的路径 - 格式: {请求方法: 路径数组}
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

// 组合验证中间件：IP验证 + 会话验证 + 用户ID封禁检查
async function validateIPAndSession(req, res, next) {
  try {
    // 检查是否是排除路径
    let isExcluded = false;
    
    // 先检查通用路径（所有方法都适用）
    if (excludedPaths['*']) {
      isExcluded = excludedPaths['*'].some(path => {
        if (path.endsWith('/')) {
          return req.path.startsWith(path);
        }
        return req.path === path || req.path.startsWith(path + '/');
      });
    }
    
    // 如果不是通用排除路径，检查特定方法的路径
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
    
    // console.log(`🔐 [API] 组合验证开始: 路径: ${req.path}, 方法: ${req.method}`);
    
    // 先进行IP验证
    let clientIP = getClientIP(req);
    
    // 处理IPv6地址，转换为IPv4格式
    if (clientIP === '::1') {
      clientIP = '127.0.0.1';
    } else if (clientIP && clientIP.startsWith('::ffff:')) {
      // 处理IPv6格式的IPv4地址，例如::ffff:192.168.1.1
      clientIP = clientIP.slice(7);
    }
    
    // console.log(`🔍 [API] IP验证开始: ${clientIP}`);
    
    if (!clientIP) {
      return res.status(403).json({ status: 'error', message: '访问被拒绝' });
    }

    // 检查IP是否被封禁
    const ipBanResult = await isIPBanned(clientIP);
    if (ipBanResult.isBanned) {
      const banInfo = {
        reason: ipBanResult.reason,
        banUntil: ipBanResult.remainingTime ? new Date(Date.now() + ipBanResult.remainingTime.totalSeconds * 1000) : null
      };
      
      // console.log(`🚫 [API] IP被封禁: ${clientIP}, 路径: ${req.path}, 原因: ${banInfo.reason}, 过期时间: ${banInfo.banUntil ? new Date(banInfo.banUntil).toISOString() : '永久'}`);
      
      return res.status(403).json({ 
        status: 'error', 
        message: '您的IP地址已被封禁',
        banInfo: banInfo
      });
    }

    // console.log(`✅ [API] IP验证通过: ${clientIP}`);
    req.clientIP = clientIP;

    // 然后进行会话验证
    const userId = req.headers['user-id'] || req.query.userId;
    const sessionToken = req.headers['session-token'] || req.query.sessionToken;

    // console.log(`🔐 [API] 会话验证开始: userId=${userId || 'undefined'}`);

    if (!userId || !sessionToken) {
      // console.error(`❌ [API] 会话验证失败: 缺少必要参数, userId=${userId || 'undefined'}, sessionToken=${sessionToken ? 'present' : 'missing'}`);
      return res.status(401).json({ status: 'error', message: '未授权访问' });
    }

    if (!(await validateUserSession(userId, sessionToken))) {
      // console.error(`❌ [API] 会话验证失败: token不匹配或会话不存在, userId=${userId}`);
      return res.status(401).json({ status: 'error', message: '会话无效' });
    }

    // 检查用户ID是否被封禁
    const userBanResult = await isUserBanned(userId);
    if (userBanResult.isBanned) {
      const banInfo = {
        reason: userBanResult.reason,
        banUntil: userBanResult.remainingTime ? new Date(Date.now() + userBanResult.remainingTime.totalSeconds * 1000) : null
      };
      
      // console.log(`🚫 [API] 用户ID被封禁: ${userId}, 路径: ${req.path}, 原因: ${banInfo.reason}, 过期时间: ${banInfo.banUntil ? new Date(banInfo.banUntil).toISOString() : '永久'}`);
      
      return res.status(403).json({ 
        status: 'error', 
        message: '您的账号已被封禁',
        banInfo: banInfo
      });
    }

    // console.log(`✅ [API] 会话验证通过: userId=${userId}`);
    req.userId = userId;
    req.sessionToken = sessionToken;

    // console.log(`✅ [API] 组合验证通过: ${clientIP}, userId=${userId}, 路径: ${req.path}`);
    next();
  } catch (err) {
    let clientIP = getClientIP(req);
    // 处理IPv6地址，转换为IPv4格式
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

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'public', 'uploads');
const avatarDir = path.join(__dirname, 'public', 'avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

// 头像存储配置
// 用户头像存储配置
const avatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, avatarDir);
  },
  filename: function (req, file, cb) {
    const userId = req.headers['user-id'] || req.userId;


    if (!userId || userId === 'undefined') {
      return cb(new Error('用户ID不能为空'), false);
    }

    // 确保文件扩展名在Linux系统中安全处理
    const ext = path.extname(file.originalname).replace(/[/\x00]/g, '_');
    const filename = `avatar_${userId}${ext}`;

    cb(null, filename);
  }
});

// 群组头像存储配置
const groupAvatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, avatarDir);
  },
  filename: function (req, file, cb) {
    // 从URL参数获取群组ID
    const groupId = req.params.groupId;

    // 确保文件扩展名在Linux系统中安全处理
    const ext = path.extname(file.originalname).replace(/[/\x00]/g, '_');
    const filename = `group_avatar_${groupId}${ext}`;

    cb(null, filename);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 2 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const prohibitedExts = ['.php', '.php3', '.php4', '.php5', '.phtml', '.phar'];
    
    if (prohibitedExts.includes(ext)) {
      cb(null, false);
    } else if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'), false);
    }
  }
});

// 群组头像上传配置
const groupAvatarUpload = multer({
  storage: groupAvatarStorage,
  limits: {
    fileSize: 2 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const prohibitedExts = ['.php', '.php3', '.php4', '.php5', '.phtml', '.phar'];
    
    if (prohibitedExts.includes(ext)) {
      cb(null, false);
    } else if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'), false);
    }
  }
});

// 聊天图片存储配置 - 修复中文文件名乱码
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const uniqueSuffix = timestamp + '-' + Math.round(Math.random() * 1E9);
    // 处理原始文件名，确保正确解码UTF-8编码
    let originalName = file.originalname;
    // 尝试解码URL编码的中文字符
    try {
      originalName = decodeURIComponent(escape(originalName));
    } catch (e) {
      // 如果解码失败，保留原始名称
    }
    // 生成安全的ASCII文件名用于存储
    const ext = path.extname(originalName);
    const safeFilename = uniqueSuffix + ext;
    cb(null, safeFilename);
  }
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 15 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const prohibitedExts = ['.php', '.php3', '.php4', '.php5', '.phtml', '.phar'];
    
    if (prohibitedExts.includes(ext)) {
      cb(null, false);
    } else {
      cb(null, true);
    }
  }
});

// 检查请求限制的中间件 - 修改：限制总请求次数
async function checkFileRequestLimit(req, res, next) {
  try {
    const userId = req.userId;
    const now = new Date();
    const oneHourAgo = new Date(now - 60 * 60 * 1000); // 1小时前
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000); // 1天前
    
    // 统计1小时内的总请求次数（所有用户）
    const [hourlyResults] = await pool.execute(
      'SELECT COUNT(*) as count FROM chat_file_request_logs WHERE request_time > ?',
      [oneHourAgo]
    );
    
    // 统计1天内的总请求次数（所有用户）
    const [dailyResults] = await pool.execute(
      'SELECT COUNT(*) as count FROM chat_file_request_logs WHERE request_time > ?',
      [oneDayAgo]
    );
    
    const hourlyCount = hourlyResults[0].count;
    const dailyCount = dailyResults[0].count;
    
    // 检查是否超过限制（增加总限制数量）
    if (hourlyCount >= 100) { // 改为总限制每小时100次
      return res.status(429).json({ 
        status: 'error', 
        message: '服务器文件上传过于频繁，请稍后再试' 
      });
    }
    
    if (dailyCount >= 500) { // 改为总限制每天500次
      return res.status(429).json({ 
        status: 'error', 
        message: '服务器今日上传次数已达上限，请明天再试' 
      });
    }
    
    // 记录本次请求
    await pool.execute(
      'INSERT INTO chat_file_request_logs (user_id, request_time, ip_address) VALUES (?, ?, ?)',
      [userId, now, req.ip]
    );
    // 清理旧记录，保持最多1000条
    await pool.execute(
      'DELETE FROM chat_file_request_logs WHERE id NOT IN (SELECT id FROM (SELECT id FROM chat_file_request_logs ORDER BY request_time DESC LIMIT 1000) AS tmp)'
    );
    
    next();
  } catch (err) {
    console.error('检查请求限制失败:', err.message);
    next(); // 出错时允许请求通过，避免影响正常使用
  }
}

// 用户会话管理（使用 Redis）
// 会话存储在 Redis
// Token: scr:token:{userId} - 过期时间 20 分钟
// Refresh Token: scr:refreshToken:{userId} - 过期时间 30 天

// 获取用户会话（从 Redis）
async function getUserSession(userId) {
  try {
    const tokenKey = `scr:token:${userId}`;
    const refreshTokenKey = `scr:refreshToken:${userId}`;
    
    const [tokenData, refreshTokenData] = await Promise.all([
      redisClient.get(tokenKey),
      redisClient.get(refreshTokenKey)
    ]);
    
    if (!tokenData && !refreshTokenData) {
      return null;
    }
    
    return {
      token: tokenData || null,
      refreshToken: refreshTokenData || null
    };
  } catch (err) {
    console.error('获取会话失败:', err.message);
    return null;
  }
}

// 设置用户会话（到 Redis）
// tokenExpires: Token 过期时间（毫秒时间戳）
// refreshExpires: Refresh Token 过期时间（毫秒时间戳）
async function setUserSession(userId, session, tokenExpires, refreshExpires) {
  try {
    const tokenKey = `scr:token:${userId}`;
    const refreshTokenKey = `scr:refreshToken:${userId}`;
    
    // 存储 Token，设置过期时间
    if (session.token) {
      await redisClient.set(tokenKey, session.token);
      if (tokenExpires) {
        const tokenTTL = Math.max(1, Math.floor((tokenExpires - Date.now()) / 1000));
        await redisClient.expire(tokenKey, tokenTTL);
      }
    }
    
    // 存储 Refresh Token，设置过期时间
    if (session.refreshToken) {
      await redisClient.set(refreshTokenKey, session.refreshToken);
      if (refreshExpires) {
        const refreshTTL = Math.max(1, Math.floor((refreshExpires - Date.now()) / 1000));
        await redisClient.expire(refreshTokenKey, refreshTTL);
      }
    }
  } catch (err) {
    console.error('设置会话失败:', err.message);
  }
}

// 删除用户会话（从 Redis）
async function deleteUserSession(userId) {
  try {
    const tokenKey = `scr:token:${userId}`;
    const refreshTokenKey = `scr:refreshToken:${userId}`;
    await Promise.all([
      redisClient.del(tokenKey),
      redisClient.del(refreshTokenKey)
    ]);
  } catch (err) {
    console.error('删除会话失败:', err.message);
  }
}

// 获取所有会话（从 Redis）- 只获取 refreshToken 键
async function getAllSessions() {
  try {
    const keys = await redisClient.keys('scr:refreshToken:*');
    const sessions = [];
    for (const key of keys) {
      const userId = key.replace('scr:refreshToken:', '');
      const refreshToken = await redisClient.get(key);
      if (refreshToken) {
        sessions.push({ userId: parseInt(userId), refreshToken });
      }
    }
    return sessions;
  } catch (err) {
    console.error('获取所有会话失败:', err.message);
    return [];
  }
}

// 获取会话数量（从 Redis）
async function getSessionCount() {
  try {
    const keys = await redisClient.keys('scr:refreshToken:*');
    return keys.length;
  } catch (err) {
    console.error('获取会话数量失败:', err.message);
    return 0;
  }
}

// Cloudflare Turnstile 配置
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';

// 验证 Cloudflare Turnstile Token
async function verifyTurnstileToken(token, clientIP) {
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `secret=${encodeURIComponent(TURNSTILE_SECRET_KEY)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(clientIP)}`
    });

    const data = await response.json();
    return { success: data.success === true, message: null };
  } catch (error) {
    return { success: false, message: '网络不佳，请稍后再试' };
  }
}

// 生成会话令牌
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 验证用户会话（Token）
async function validateUserSession(userId, token) {
    if (!userId || !token) {
        return false;
    }
    
    try {
        const userIdNum = parseInt(userId);
        const session = await getUserSession(userIdNum);
        
        if (!session || !session.token) {
            return false;
        }
        
        if (session.token !== token) {
            return false;
        }
        
        // Token 存在且匹配，Redis key 的 TTL 会自动处理过期
        return true;
    } catch (error) {
        console.error('会话验证异常:', error);
        return false;
    }
}

// 创建用户会话 - Token 20分钟过期，Refresh Token 30天过期
async function createUserSession(userId) {
    const token = generateSessionToken();
    const refreshToken = generateSessionToken();
    
    // Token 20分钟过期
    const expires = Date.now() + (20 * 60 * 1000);
    // Refresh Token 30天过期
    const refreshExpires = Date.now() + (30 * 24 * 60 * 60 * 1000);
    
    const session = {
        token,
        refreshToken
    };
    
    // 检查是否已有该用户的会话（顶号检测）
    const existingSession = await getUserSession(parseInt(userId));
    if (existingSession) {
        // 向该用户的房间广播顶号通知
        io.to(`user_${userId}`).emit('account-logged-in-elsewhere', {
            message: '您的账号在其他设备上登录，请重新登录',
            timestamp: new Date().toISOString()
        });
        
        // 断开该用户的所有连接
        io.to(`user_${userId}`).disconnectSockets(true);
    }
    
    await setUserSession(parseInt(userId), session, expires, refreshExpires);
    
    // 保存会话到数据库（只存 refresh_token）
    await saveSessionToDatabase(parseInt(userId), refreshToken, refreshExpires);
    
    return { token, refreshToken };
}

// 清除过期的 refreshToken（从数据库）
async function cleanupExpiredSessions() {
    try {
        // 删除数据库中过期的 refresh_token
        const [result] = await pool.execute(
            'DELETE FROM chat_sessions WHERE refresh_expires < NOW()'
        );
        
        if (result.affectedRows > 0) {
            console.log(`🧹 已清理 ${result.affectedRows} 个过期的会话`);
        }
    } catch (err) {
        console.error('清理过期会话失败:', err.message);
    }
}

// SQL注入检测正则表达式
const sqlInjectionPattern = /(^'|'$|^"|"$|;|--|\/\*|\*\/|\b(or|and|union|select|insert|update|delete|drop|create|alter|exec|execute|xp_)|\b(1=1|0=0)\b|\bwhere\b|\bfrom\b|\bjoin\b|\bcase\b|\bwhen\b|\bthen\b|\belse\b|\bend\b)/i;

function validateUsername(username) {
  try {
    if (!username || typeof username !== 'string') return false;
    // 检查SQL注入
    if (sqlInjectionPattern.test(username)) return false;
    // 只进行非空检查，不再限制字符类型和长度
    return username.trim().length > 0;
  } catch (error) {
    console.error('用户名验证出错:', error.message);
    return false;
  }
}

function validatePassword(password) {
  try {
    if (!password || typeof password !== 'string') return false;
    // 检查SQL注入
    if (sqlInjectionPattern.test(password)) return false;
    // 只进行非空检查，不再限制长度
    return password.trim().length > 0;
  } catch (error) {
    console.error('密码验证出错:', error.message);
    return false;
  }
}

function validateNickname(nickname) {
  try {
    if (!nickname || typeof nickname !== 'string') return false;
    // 检查SQL注入
    if (sqlInjectionPattern.test(nickname)) return false;
    // 只进行非空检查，不再限制长度
    return nickname.trim().length > 0;
  } catch (error) {
    console.error('昵称验证出错:', error.message);
    return false;
  }
}

function validateMessageContent(content) {
  // 要求内容是有效的字符串类型，长度至少为1，且不超过10000字符
  if (typeof content === 'string' && content.trim().length > 0 && content.length <= 10000) {
    // 直接使用原始内容，不进行HTML转义
    // 前端将负责安全的解析和渲染
    return true;
  }
  // 不允许空消息
  return false;
}

// API请求日志记录中间件
app.use(async (req, res, next) => {
  res.on('finish', async () => {
    // 排除不需要记录的路径 - 格式: {请求方法: 路径数组}
    const excludedPaths = {
      '*': ['/health'],
      'GET': ['/avatars', '/uploads']
    };
    
    let isExcluded = false;
    
    // 先检查通用路径（所有方法都适用）
    if (excludedPaths['*']) {
      isExcluded = excludedPaths['*'].some(path => req.path.startsWith(path));
    }
    
    // 如果不是通用排除路径，检查特定方法的路径
    if (!isExcluded && excludedPaths[req.method]) {
      isExcluded = excludedPaths[req.method].some(path => req.path.startsWith(path));
    }
    
    if (isExcluded) {
      return;
    }
    
    try {
      // 尝试从请求头获取用户ID
      let userId = req.headers['user-id'] || req.query.userId;
      
      await pool.execute(
        'INSERT INTO chat_api_logs (user_id, ip_address, api_path, request_method) VALUES (?, ?, ?, ?)',
        [userId, getClientIP(req), req.path, req.method]
      );
      // 清理旧记录，保持最多3000条
      await pool.execute(
        'DELETE FROM chat_api_logs WHERE id NOT IN (SELECT id FROM (SELECT id FROM chat_api_logs ORDER BY timestamp DESC LIMIT 3000) AS tmp)'
      );
    } catch (logErr) {
      // 记录API日志失败，不影响主要功能
    }
  });
  
  next();
});

// 全局验证中间件（排除不需要验证的路径）
app.use(validateIPAndSession);

// 健康检查端点
app.get('/api/health', async (req, res) => {
  const sessionCount = await getSessionCount();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeSessions: sessionCount,
    message: '会话20分钟过期模式'
  });
});

// IP和用户状态检查接口
app.get('/api/check-status', async (req, res) => {
  try {
    // 获取客户端IP地址
    const clientIP = getClientIP(req);
    let userId = req.query.userId || req.headers['user-id'];
    
    // 从请求头中获取会话令牌
    const sessionToken = req.headers['session-token'] || req.query.sessionToken;
    
    // 如果有会话令牌，根据存储的用户令牌找出对应的用户ID
    if (sessionToken) {
      // 遍历所有会话，查找对应的用户ID
      const allSessions = await getAllSessions();
      for (const session of allSessions) {
        if (session.token === sessionToken) {
          userId = session.userId.toString();
          break;
        }
      }
    }
    
    // 检查IP是否被封禁
    const ipStatus = await isIPBanned(clientIP);
    
    // 检查用户是否存在（如果提供了用户ID）
    let userExists = true;
    if (userId) {
      try {
        const [users] = await pool.execute(
          'SELECT id FROM chat_users WHERE id = ?',
          [userId]
        );
        userExists = users.length > 0;
      } catch (userErr) {
      // 检查用户存在性失败，默认为存在以避免不必要的拒绝
      userExists = true;
    }
    }
    
    // 构建返回消息
    let message = '状态正常';
    if (ipStatus.isBanned) {
      message = 'IP地址已被封禁';
      if (ipStatus.reason) {
        message += `，原因：${ipStatus.reason}`;
      }
    }
    
    // 返回状态信息
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
    // 状态检查失败，返回默认允许的状态，避免影响用户使用
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

// 会话状态检查端点
app.get('/api/session-check', async (req, res) => {
  const userId = req.headers['user-id'] || req.query.userId;
  const sessionToken = req.headers['session-token'] || req.query.sessionToken;

  const isValid = await validateUserSession(userId, sessionToken);

  res.json({
    status: 'success',
    valid: isValid,
    userId: userId,
    message: isValid ? '会话有效（20分钟过期）' : '会话无效'
  });
});

// 用户名重复检查API
app.get('/api/check-username', async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ status: 'error', message: '用户名不能为空' });
    }
    
    // 检查用户名是否包含SQL注入
    if (!validateUsername(username)) {
      return res.status(400).json({ status: 'error', message: '用户名非法' });
    }
    
    const trimmedUsername = username.trim();
    
    if (!trimmedUsername) {
      return res.status(400).json({ status: 'error', message: '用户名不能为空' });
    }
    
    // 使用参数化查询预防SQL注入
    const [existingUsers] = await pool.execute(
        'SELECT id FROM chat_users WHERE username = ?',
        [trimmedUsername]
    );
    
    res.json({
      status: 'success',
      isAvailable: existingUsers.length === 0,
      username: trimmedUsername
    });
  } catch (err) {
    console.error('检查用户名失败:', err.message);
    res.status(500).json({ status: 'error', message: '检查用户名失败' });
  }
});

// 获取所有会话信息（调试用，需要密码验证）
app.get('/api/sessions', async (req, res) => {
  try {
    const { password } = req.query;
    
    // 密码验证
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ status: 'error', message: '密码错误，访问被拒绝' });
    }
    
    const allSessions = await getAllSessions();
    const sessionsArray = allSessions.map(session => ({
      userId: session.userId,
      token: session.token.substring(0, 10) + '...',
      createdAt: new Date(session.createdAt).toISOString(),
      lastActive: new Date(session.lastActive).toISOString(),
      expires: new Date(session.expires).toISOString()
    }));

    res.json({
      status: 'success',
      totalSessions: sessionsArray.length,
      sessions: sessionsArray
    });
  } catch (err) {
    console.error('获取会话信息失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取会话信息失败' });
  }
});

// 获取所有用户的登录IP（管理员接口，需要密码验证）
app.get('/api/admin/login-ips', async (req, res) => {
  try {
    const { password } = req.query;
    
    // 密码验证
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ status: 'error', message: '密码错误，访问被拒绝' });
    }
    
    // 查询所有登录相关的IP记录
    const [logs] = await pool.execute(
      'SELECT id, user_id, ip_address, action, timestamp FROM chat_ip_logs WHERE action IN (?, ?, ?, ?, ?) ORDER BY timestamp DESC',
      ['login', 'login_success', 'login_failed', 'check_status', 'register']
    );
    
    res.json({
      status: 'success',
      totalLogs: logs.length,
      loginIPs: logs,
      message: '获取所有登录IP成功'
    });
  } catch (err) {
    console.error('获取登录IP失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取登录IP失败' });
  }
});

// 获取接口日志（管理员接口，需要密码验证）
app.get('/api/admin/api-logs', async (req, res) => {
  try {
    const { password } = req.query;
    
    // 密码验证
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ status: 'error', message: '密码错误，访问被拒绝' });
    }
    
    // 查询所有API日志记录
    const [logs] = await pool.execute(
      'SELECT id, user_id, ip_address, api_path, request_method, timestamp FROM chat_api_logs ORDER BY timestamp DESC LIMIT 3000'
    );
    
    res.json({
      status: 'success',
      totalLogs: logs.length,
      apiLogs: logs,
      message: '获取接口日志成功'
    });
  } catch (err) {
    console.error('获取接口日志失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取接口日志失败' });
  }
});

// 管理员封禁接口（支持IP或用户ID）
app.post('/api/admin/ban-ip', async (req, res) => {
  try {
    const { password, ipAddress, userId, reason, expiresAt } = req.body;
    
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ status: 'error', message: '密码错误，访问被拒绝' });
    }
    
    if (!ipAddress && !userId) {
      return res.status(400).json({ status: 'error', message: '必须提供IP地址或用户ID参数' });
    }
    if (!reason) {
      return res.status(400).json({ status: 'error', message: '缺少封禁原因参数' });
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
    
    // 优先处理IP封禁
    if (ipAddress) {
      await pool.execute(
        'INSERT INTO chat_banned_ips (ip_address, user_id, reason, expires_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason), expires_at = VALUES(expires_at)',
        [ipAddress, userId || null, reason, expiresDate]
      );
      
      await redisClient.hSet('scr:banned_ips', ipAddress, JSON.stringify(banData));
      
      // 向该 IP 房间广播封禁事件
      io.to(`ip_${ipAddress}`).emit('ip-banned', {
        ipAddress: ipAddress,
        userId: userId,
        reason: reason || '违反使用规则',
        expiresAt: expiresDate
      });

      // 在断开连接前，先从在线用户列表中移除该 IP 下的所有用户
      const socketsInRoom = await io.in(`ip_${ipAddress}`).fetchSockets();
      for (const socket of socketsInRoom) {
        const user = await getOnlineUser(socket.id);
        if (user) {
          await removeOnlineUser(socket.id);
          await removeAuthenticatedUser(user.id);
          
          try {
            await pool.execute(
              'UPDATE chat_users SET last_online = NOW() WHERE id = ?',
              [user.id]
            );
          } catch (err) {
            // ignore error
          }
        }
      }

      // 断开该 IP 下的所有连接
      io.to(`ip_${ipAddress}`).disconnectSockets(true);
      
      // 广播更新后的用户列表
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
        FROM chat_users 
        WHERE last_online IS NOT NULL 
        AND last_online >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY last_online DESC
      `);

      const offlineUsersArray = offlineUsersData
        .filter(user => !onlineUserIds.has(user.id))
        .map(user => ({
          id: user.id,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          isOnline: false,
          lastOnline: user.last_online
        }));

      // 只向已认证用户广播用户列表
      io.to('authenticated_users').emit('users-list', {
        online: onlineUsersArray,
        offline: offlineUsersArray
      });
    }
    
    // 再处理用户ID封禁（如果提供了）
    if (userId) {
      const userIdStr = String(userId);
      // 如果只提供了userId，没有ipAddress
      if (!ipAddress) {
        await pool.execute(
          'INSERT INTO chat_banned_ips (ip_address, user_id, reason, expires_at) VALUES (?, ?, ?, ?)',
          [null, userId, reason, expiresDate]
        );
      }
      
      await redisClient.hSet('scr:banned_users', userIdStr, JSON.stringify(banData));
      
      // 向该用户的房间广播封禁事件
      io.to(`user_${userId}`).emit('user-banned', {
        ipAddress: ipAddress,
        userId: userId,
        reason: reason || '违反使用规则',
        expiresAt: expiresDate
      });

      // 断开该用户的所有连接
      const userSocketsInRoom = await io.in(`user_${userId}`).fetchSockets();
      for (const socket of userSocketsInRoom) {
        const user = await getOnlineUser(socket.id);
        if (user) {
          await removeOnlineUser(socket.id);
          await removeAuthenticatedUser(user.id, socket);
          
          try {
            await pool.execute(
              'UPDATE chat_users SET last_online = NOW() WHERE id = ?',
              [user.id]
            );
          } catch (err) {
            // ignore error
          }
        }
      }

      io.to(`user_${userId}`).disconnectSockets(true);
      
      // 如果只封禁用户ID，还需要广播更新后的用户列表
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
          FROM chat_users 
          WHERE last_online IS NOT NULL 
          AND last_online >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          ORDER BY last_online DESC
        `);

        const offlineUsersArray = offlineUsersData
          .filter(user => !onlineUserIds.has(user.id))
          .map(user => ({
            id: user.id,
            nickname: user.nickname,
            avatarUrl: user.avatarUrl,
            isOnline: false,
            lastOnline: user.last_online
          }));

        // 只向已认证用户广播用户列表
        io.to('authenticated_users').emit('users-list', {
          online: onlineUsersArray,
          offline: offlineUsersArray
        });
      }
    }
    
    res.json({
      status: 'success',
      message: '封禁成功',
      data: { ipAddress, userId, reason, expiresAt: expiresDate }
    });
  } catch (err) {
    console.error('封禁失败:', err.message);
    res.status(500).json({ status: 'error', message: '封禁失败' });
  }
});

// 管理员解封接口（支持IP或用户ID）
app.post('/api/admin/unban-ip', async (req, res) => {
  try {
    const { password, ipAddress, userId } = req.body;
    
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ status: 'error', message: '密码错误，访问被拒绝' });
    }
    
    if (!ipAddress && !userId) {
      return res.status(400).json({ status: 'error', message: '必须提供IP地址或用户ID参数' });
    }
    
    // 解封IP
    if (ipAddress) {
      await pool.execute(
        'DELETE FROM chat_banned_ips WHERE ip_address = ?',
        [ipAddress]
      );
      
      await redisClient.hDel('scr:banned_ips', ipAddress);
    }
    
    // 解封用户ID
    if (userId) {
      await pool.execute(
        'DELETE FROM chat_banned_ips WHERE user_id = ?',
        [userId]
      );
      
      await redisClient.hDel('scr:banned_users', String(userId));
    }
    
    res.json({
      status: 'success',
      message: '解封成功',
      data: { ipAddress, userId }
    });
  } catch (err) {
    console.error('解封失败:', err.message);
    res.status(500).json({ status: 'error', message: '解封失败' });
  }
});

// 获取已封禁列表
app.get('/api/admin/banned-ips', async (req, res) => {
  try {
    const { password } = req.query;
    
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ status: 'error', message: '密码错误，访问被拒绝' });
    }
    
    const [bannedList] = await pool.execute(
      'SELECT id, ip_address, user_id, reason, expires_at, banned_at FROM chat_banned_ips ORDER BY banned_at DESC'
    );
    
    res.json({
      status: 'success',
      bannedList: bannedList,
      message: '获取已封禁列表成功'
    });
  } catch (err) {
    console.error('获取已封禁列表失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取已封禁列表失败' });
  }
});

// 获取用户好友列表
app.get('/api/user/friends', async (req, res) => {
  try {
    const userId = parseInt(req.userId);
    
    // 查询用户的好友列表，按 ID 排序，只返回未删除的好友
    const [friends] = await pool.execute(`
      SELECT cu.id, cu.nickname, cu.username, cu.gender, cu.avatar_url
      FROM chat_friends cf 
      JOIN chat_users cu ON cf.friend_id = cu.id 
      WHERE cf.user_id = ? AND cf.deleted_at IS NULL
      ORDER BY cf.id DESC
    `, [userId]);
    
    res.json({
      status: 'success',
      friends: friends,
      message: '获取好友列表成功'
    });
  } catch (err) {
    console.error('获取好友列表失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取好友列表失败' });
  }
});

// 添加好友
app.post('/api/user/add-friend', async (req, res) => {
  try {
    const userId = parseInt(req.userId);
    const { friendId } = req.body;
    
    if (!friendId || isNaN(friendId)) {
      return res.status(400).json({ status: 'error', message: '好友ID无效' });
    }
    
    const friendIdNum = parseInt(friendId);
    
    // 检查是否是添加自己为好友
    if (userId === friendIdNum) {
      return res.status(400).json({ status: 'error', message: '不能添加自己为好友' });
    }
    
    // 检查好友是否存在
    const [users] = await pool.execute('SELECT id FROM chat_users WHERE id = ?', [friendIdNum]);
    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: '用户不存在' });
    }
    
    // 检查是否已经是好友（包括已删除的记录）
    const [existing] = await pool.execute(
      'SELECT id, deleted_at FROM chat_friends WHERE user_id = ? AND friend_id = ?',
      [userId, friendIdNum]
    );
    
    if (existing.length > 0 && existing[0].deleted_at === null) {
      return res.status(400).json({ status: 'error', message: '已经是好友了' });
    }
    
    if (existing.length > 0 && existing[0].deleted_at !== null) {
      // 恢复已删除的好友关系
      await pool.execute('UPDATE chat_friends SET deleted_at = NULL WHERE user_id = ? AND friend_id = ?', [userId, friendIdNum]);
      await pool.execute('UPDATE chat_friends SET deleted_at = NULL WHERE user_id = ? AND friend_id = ?', [friendIdNum, userId]);
    } else {
      // 添加双向好友关系
      await pool.execute('INSERT INTO chat_friends (user_id, friend_id) VALUES (?, ?)', [userId, friendIdNum]);
      await pool.execute('INSERT INTO chat_friends (user_id, friend_id) VALUES (?, ?)', [friendIdNum, userId]);
    }
    
    // 获取双方用户信息
    const [userInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
      [userId]
    );
    const [friendInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
      [friendIdNum]
    );
    
    // 向操作方插入100类型系统消息：你们已成为好友
    const now = new Date();
    const addedContent = '你们已成为好友';
    
    // 只给添加好友的人插入消息
    const [insertResult] = await pool.execute(
      'INSERT INTO chat_private_messages (sender_id, receiver_id, content, message_type, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [userId, friendIdNum, addedContent, 100]
    );
    
    // 构建并发送100类型消息给添加好友的人
    const type100Message1 = {
      id: insertResult.insertId,
      senderId: userId,
      receiverId: friendIdNum,
      senderNickname: userInfo[0]?.nickname || '',
      senderAvatarUrl: userInfo[0]?.avatar_url || '',
      content: addedContent,
      at_userid: null,
      messageType: 100,
      isRead: 1,
      timestamp: now.getTime(),
      timestampISO: now.toISOString()
    };
    
    // 构建并发送100类型消息给被添加的人（使用同一个消息ID）
    const type100Message2 = {
      id: insertResult.insertId,
      senderId: userId,
      receiverId: friendIdNum,
      senderNickname: userInfo[0]?.nickname || '',
      senderAvatarUrl: userInfo[0]?.avatar_url || '',
      content: addedContent,
      at_userid: null,
      messageType: 100,
      isRead: 0,
      timestamp: now.getTime(),
      timestampISO: now.toISOString()
    };
    
    // 向双方发送100类型消息
    io.to(`user_${userId}`).emit('private-message-received', type100Message1);
    io.to(`user_${friendIdNum}`).emit('private-message-received', type100Message2);
    
    // 向被添加好友的用户发送 WebSocket 事件
    io.to(`user_${friendIdNum}`).emit('friend-added', {
      friendId: userId,
      timestamp: Date.now()
    });
    io.to(`user_${friendIdNum}`).emit('friend-list-updated', {
      message: '好友列表已更新',
      timestamp: Date.now()
    });
    
    // 也给添加好友的人发送事件
    io.to(`user_${userId}`).emit('friend-added', {
      friendId: friendIdNum,
      timestamp: Date.now()
    });
    
    res.json({ status: 'success', message: '添加好友成功' });
  } catch (err) {
    console.error('添加好友失败:', err.message);
    res.status(500).json({ status: 'error', message: '添加好友失败' });
  }
});

// 删除好友
app.post('/api/user/remove-friend', async (req, res) => {
  try {
    const userId = parseInt(req.userId);
    const { friendId } = req.body;

    if (!friendId || isNaN(friendId)) {
      return res.status(400).json({ status: 'error', message: '好友ID无效' });
    }

    const friendIdNum = parseInt(friendId);

    // 软删除双向好友关系，设置 deleted_at 为当前时间
    const now = new Date();
    await pool.execute('UPDATE chat_friends SET deleted_at = ? WHERE user_id = ? AND friend_id = ?', [now, userId, friendIdNum]);
    await pool.execute('UPDATE chat_friends SET deleted_at = ? WHERE user_id = ? AND friend_id = ?', [now, friendIdNum, userId]);

    // 获取双方用户信息
    const [userInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
      [userId]
    );
    const [friendInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
      [friendIdNum]
    );
    
    // 向操作方插入100类型系统消息：你们的好友关系已解除
    const deletedContent = '你们的好友关系已解除';
    
    // 只给删除好友的人插入消息
    const [insertResult] = await pool.execute(
      'INSERT INTO chat_private_messages (sender_id, receiver_id, content, message_type, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [userId, friendIdNum, deletedContent, 100]
    );
    
    // 构建并发送100类型消息给删除好友的人
    const type100Message1 = {
      id: insertResult.insertId,
      senderId: userId,
      receiverId: friendIdNum,
      senderNickname: userInfo[0]?.nickname || '',
      senderAvatarUrl: userInfo[0]?.avatar_url || '',
      content: deletedContent,
      at_userid: null,
      messageType: 100,
      isRead: 1,
      timestamp: now.getTime(),
      timestampISO: now.toISOString()
    };
    
    // 构建并发送100类型消息给被删除的人（使用同一个消息ID）
    const type100Message2 = {
      id: insertResult.insertId,
      senderId: userId,
      receiverId: friendIdNum,
      senderNickname: userInfo[0]?.nickname || '',
      senderAvatarUrl: userInfo[0]?.avatar_url || '',
      content: deletedContent,
      at_userid: null,
      messageType: 100,
      isRead: 0,
      timestamp: now.getTime(),
      timestampISO: now.toISOString()
    };
    
    // 向双方发送100类型消息
    io.to(`user_${userId}`).emit('private-message-received', type100Message1);
    io.to(`user_${friendIdNum}`).emit('private-message-received', type100Message2);

    // 构建好友删除事件数据
    const friendDeletedEventForUser = {
      friendId: friendIdNum,
      nickname: friendInfo[0]?.nickname || '',
      avatarUrl: friendInfo[0]?.avatar_url || '',
      timestamp: now.getTime()
    };
    const friendDeletedEventForFriend = {
      friendId: userId,
      nickname: userInfo[0]?.nickname || '',
      avatarUrl: userInfo[0]?.avatar_url || '',
      timestamp: now.getTime()
    };

    // 向双方发送 friend-deleted 事件
    io.to(`user_${userId}`).emit('friend-deleted', friendDeletedEventForUser);
    io.to(`user_${friendIdNum}`).emit('friend-deleted', friendDeletedEventForFriend);

    // 通知被删除的好友刷新好友列表
    io.to(`user_${friendIdNum}`).emit('friend-removed', { friendId: userId });
    
    // 也通知删除好友的人
    io.to(`user_${userId}`).emit('friend-removed', { friendId: friendIdNum });

    res.json({ status: 'success', message: '删除好友成功' });
  } catch (err) {
    console.error('删除好友失败:', err.message);
    res.status(500).json({ status: 'error', message: '删除好友失败' });
  }
});

// 搜索用户
app.get('/api/user/search', async (req, res) => {
  try {
    const { keyword } = req.query;
    
    if (!keyword || keyword.trim().length === 0) {
      return res.status(400).json({ status: 'error', message: '搜索关键词不能为空' });
    }
    
    // 对特殊字符进行转义，防止SQL注入和LIKE通配符问题
    // 先转义反斜杠，再转义百分号
    let escapedKeyword = keyword.trim();
    escapedKeyword = escapedKeyword.replace(/\\/g, '\\\\');  // 转义反斜杠
    escapedKeyword = escapedKeyword.replace(/%/g, '\\%');   // 转义百分号
    
    const searchKeyword = `%${escapedKeyword}%`;
    
    // 搜索用户
    const [users] = await pool.execute(`
      SELECT id, nickname, username, gender, avatar_url 
      FROM chat_users 
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
});

// 初始化数据库
async function initializeDatabase() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        nickname VARCHAR(255) NOT NULL,
        gender TINYINT DEFAULT 0 COMMENT '性别：0=保密，1=男，2=女',
        signature VARCHAR(500) DEFAULT NULL COMMENT '用户个性签名',
        avatar_url VARCHAR(500) DEFAULT NULL,
        last_online TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX username_index (username),
        INDEX last_online_index (last_online)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_file_request_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        request_time DATETIME NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        FOREIGN KEY (user_id) REFERENCES chat_users(id) ON DELETE CASCADE,
        INDEX idx_chat_file_requests_user_time (user_id, request_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        refresh_token VARCHAR(255) NOT NULL,
        refresh_expires DATETIME NOT NULL,
        last_active DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES chat_users(id) ON DELETE CASCADE,
        INDEX idx_chat_sessions_refresh_token (refresh_token),
        INDEX idx_chat_sessions_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_api_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT DEFAULT NULL COMMENT '用户ID，验证后记录',
        ip_address VARCHAR(45) NOT NULL COMMENT '客户端IP',
        api_path VARCHAR(255) NOT NULL COMMENT 'API接口路径',
        request_method VARCHAR(10) NOT NULL COMMENT '请求方法',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX ip_index (ip_address),
        INDEX api_path_index (api_path),
        INDEX user_id_index (user_id),
        INDEX timestamp_index (timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        creator_id INT NOT NULL,
        avatar_url VARCHAR(500) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        INDEX creator_id_index (creator_id),
        FOREIGN KEY (creator_id) REFERENCES chat_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);



    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_friends (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        friend_id INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        FOREIGN KEY (user_id) REFERENCES chat_users(id) ON DELETE CASCADE,
        FOREIGN KEY (friend_id) REFERENCES chat_users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_friendship (user_id, friend_id),
        INDEX idx_friends_user_id (user_id),
        INDEX idx_friends_friend_id (friend_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_private_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender_id INT NOT NULL,
        receiver_id INT NOT NULL,
        content TEXT,
        at_userid TEXT,
        message_type INT NOT NULL DEFAULT '0' COMMENT '0代表文字，1代表图片，2代表文件，4代表引用消息',
        is_read TINYINT NOT NULL DEFAULT 0 COMMENT '0代表未读，1代表已读',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES chat_users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES chat_users(id) ON DELETE CASCADE,
        INDEX idx_private_messages_sender_receiver (sender_id, receiver_id),
        INDEX idx_private_messages_receiver_sender (receiver_id, sender_id),
        INDEX idx_private_messages_timestamp (timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        content TEXT,
        at_userid TEXT,
        message_type INT NOT NULL DEFAULT '0' COMMENT '0代表文字，1代表图片，2代表文件，4代表引用消息',
        group_id INT DEFAULT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX user_id_index (user_id),
        INDEX group_id_index (group_id),
        INDEX timestamp_index (timestamp),
        FOREIGN KEY (user_id) REFERENCES chat_users(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_group_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        group_id INT NOT NULL,
        user_id INT NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL DEFAULT NULL,
        INDEX group_id_index (group_id),
        INDEX user_id_index (user_id),
        FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES chat_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_ip_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT DEFAULT NULL,
        ip_address VARCHAR(45) NOT NULL,
        action VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX ip_index (ip_address),
        INDEX action_index (action)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_banned_ips (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip_address VARCHAR(45) DEFAULT NULL,
        user_id INT DEFAULT NULL,
        reason VARCHAR(255) DEFAULT NULL,
        banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL DEFAULT NULL,
        INDEX ip_index (ip_address),
        INDEX user_id_index (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  } catch (err) {
    console.error('初始化数据库失败:', err.message);
  }
}

// 从数据库加载会话到Redis（只加载 refreshToken）- 使用 Pipeline 优化
async function loadSessionsFromDatabase() {
  try {
    // const startTime = Date.now();
    
    // 查询所有有效的会话（refresh_token未过期）
    const [sessions] = await pool.execute(`
      SELECT user_id, refresh_token, refresh_expires 
      FROM chat_sessions 
      WHERE refresh_expires > NOW()
    `);
    
    if (sessions.length === 0) {
      return;
    }
    
    // 使用 Pipeline 批量写入 Redis（减少网络往返）
    const pipeline = redisClient.multi();
    
    for (const session of sessions) {
      const userId = parseInt(session.user_id);
      const refreshToken = session.refresh_token;
      const refreshExpires = new Date(session.refresh_expires).getTime();
      
      // 计算 TTL（剩余秒数）
      const ttlSeconds = Math.max(1, Math.floor((refreshExpires - Date.now()) / 1000));
      
      // 添加到 Pipeline
      const refreshTokenKey = `scr:refreshToken:${userId}`;
      pipeline.set(refreshTokenKey, refreshToken);
      pipeline.expire(refreshTokenKey, ttlSeconds);
    }
    
    // 执行 Pipeline（一次网络往返）
    await pipeline.exec();
    
    // const elapsed = Date.now() - startTime;
    // console.log(`✅ 已从数据库加载 ${sessions.length} 个 refreshToken 到 Redis，耗时 ${elapsed}ms`);
  } catch (err) {
    console.error('❌ 从数据库加载会话失败:', err.message);
  }
}

// 保存会话到数据库（只存储 refresh_token）
async function saveSessionToDatabase(userId, refreshToken, refreshExpires) {
  try {
    const now = new Date();
    const refreshExpiresDate = new Date(refreshExpires);
    
    // 插入或更新会话
    await pool.execute(`
      INSERT INTO chat_sessions (user_id, refresh_token, refresh_expires, last_active) 
      VALUES (?, ?, ?, ?) 
      ON DUPLICATE KEY UPDATE 
        refresh_token = VALUES(refresh_token),
        refresh_expires = VALUES(refresh_expires),
        last_active = VALUES(last_active)
    `, [userId, refreshToken, refreshExpiresDate, now]);
  } catch (err) {
    console.error(`❌ 保存会话到数据库失败 - 用户ID: ${userId}, 错误:`, err.message);
  }
}

// 同步数据库封禁记录到Redis - 使用 Pipeline 优化
async function syncBannedIPsToRedis() {
  try {
    // const startTime = Date.now();
    
    // 获取所有有效的封禁记录
    const [bannedRecords] = await pool.execute(
      'SELECT ip_address, user_id, reason, expires_at FROM chat_banned_ips WHERE expires_at IS NULL OR expires_at > NOW()'
    );
    
    // 清空Redis中的封禁集合
    await redisClient.del('scr:banned_ips');
    await redisClient.del('scr:banned_users');
    
    if (bannedRecords.length === 0) {
      return;
    }
    
    // 使用 Pipeline 批量写入 Redis（减少网络往返）
    const pipeline = redisClient.multi();
    
    for (const ban of bannedRecords) {
      const banData = {
        reason: ban.reason || '违反使用规则',
        expires_at: ban.expires_at
      };
      
      if (ban.ip_address) {
        pipeline.hSet('scr:banned_ips', ban.ip_address, JSON.stringify(banData));
      }
      
      if (ban.user_id) {
        pipeline.hSet('scr:banned_users', ban.user_id, JSON.stringify(banData));
      }
    }
    
    // 执行 Pipeline（一次网络往返）
    await pipeline.exec();
    
    // const elapsed = Date.now() - startTime;
    // console.log(`✅ 已同步 ${bannedRecords.length} 条封禁记录到Redis，耗时 ${elapsed}ms`);
  } catch (err) {
    console.error('同步封禁记录到Redis失败:', err.message);
  }
}

// 检查IP是否被封禁并返回详细信息，同时清理过期封禁记录
async function isIPBanned(ip) {
  try {
    // 首先从Redis检查封禁状态
    const banDataStr = await redisClient.hGet('scr:banned_ips', ip);
    
    if (banDataStr) {
      const banData = JSON.parse(banDataStr);
      
      // 检查是否已过期
      if (banData.expires_at) {
        const expireDate = new Date(banData.expires_at);
        const now = new Date();
        
        if (expireDate <= now) {
          // 已过期，从Redis删除
          await redisClient.hDel('scr:banned_ips', ip);
          // 同时从数据库删除
          await pool.execute(
            'DELETE FROM chat_banned_ips WHERE ip_address = ? AND expires_at IS NOT NULL AND expires_at <= NOW()',
            [ip]
          );
          return { isBanned: false, reason: null, remainingTime: null };
        }
        
        // 计算剩余时间
        const diff = expireDate - now;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        return {
          isBanned: true,
          reason: banData.reason || '违反使用规则',
          remainingTime: { days, hours, minutes, totalSeconds: Math.floor(diff / 1000) }
        };
      }
      
      // 永久封禁
      return {
        isBanned: true,
        reason: banData.reason || '违反使用规则',
        remainingTime: null
      };
    }
    
    // Redis中没有，返回未封禁
    return { isBanned: false, reason: null, remainingTime: null };
  } catch (err) {
    console.error('检查IP封禁失败:', err.message);
    return { isBanned: false, reason: null, remainingTime: null };
  }
}

// 检查用户ID是否被封禁并返回详细信息，同时清理过期封禁记录
async function isUserBanned(userId) {
  try {
    const userIdStr = String(userId);
    // 首先从Redis检查封禁状态
    const banDataStr = await redisClient.hGet('scr:banned_users', userIdStr);
    
    if (banDataStr) {
      const banData = JSON.parse(banDataStr);
      
      // 检查是否已过期
      if (banData.expires_at) {
        const expireDate = new Date(banData.expires_at);
        const now = new Date();
        
        if (expireDate <= now) {
          // 已过期，从Redis删除
          await redisClient.hDel('scr:banned_users', userIdStr);
          // 同时从数据库删除
          await pool.execute(
            'DELETE FROM chat_banned_ips WHERE user_id = ? AND expires_at IS NOT NULL AND expires_at <= NOW()',
            [userId]
          );
          return { isBanned: false, reason: null, remainingTime: null };
        }
        
        // 计算剩余时间
        const diff = expireDate - now;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        return {
          isBanned: true,
          reason: banData.reason || '违反使用规则',
          remainingTime: { days, hours, minutes, totalSeconds: Math.floor(diff / 1000) }
        };
      }
      
      // 永久封禁
      return {
        isBanned: true,
        reason: banData.reason || '违反使用规则',
        remainingTime: null
      };
    }
    
    // Redis中没有，返回未封禁
    return { isBanned: false, reason: null, remainingTime: null };
  } catch (err) {
    console.error('检查用户封禁失败:', err.message);
    return { isBanned: false, reason: null, remainingTime: null };
  }
}

// 登录接口速率限制 - 1分钟最多15次，1小时最多45次
async function checkLoginRateLimit(ip) {
  try {
    const minuteKey = `scr:rate_limit:login:minute:${ip}`;
    const hourKey = `scr:rate_limit:login:hour:${ip}`;
    
    const minuteCount = await redisClient.incr(minuteKey);
    const hourCount = await redisClient.incr(hourKey);
    
    if (minuteCount === 1) {
      await redisClient.expire(minuteKey, 60); // 1分钟过期
    }
    if (hourCount === 1) {
      await redisClient.expire(hourKey, 3600); // 1小时过期
    }
    
    const minuteTtl = await redisClient.ttl(minuteKey);
    const hourTtl = await redisClient.ttl(hourKey);
    
    // 先检查分钟限制
    if (minuteCount > 15) {
      return {
        allowed: false,
        limitType: 'minute',
        count: minuteCount,
        waitSeconds: minuteTtl > 0 ? minuteTtl : 60
      };
    }
    
    // 再检查小时限制
    if (hourCount > 45) {
      return {
        allowed: false,
        limitType: 'hour',
        count: hourCount,
        waitSeconds: hourTtl > 0 ? hourTtl : 3600
      };
    }
    
    return {
      allowed: true,
      limitType: null,
      minuteCount,
      hourCount,
      waitSeconds: 0
    };
  } catch (err) {
    console.error('登录速率限制检查失败:', err.message);
    return { allowed: true, limitType: null, count: 0, waitSeconds: 0 };
  }
}

// 注册接口速率限制 - 1小时2次，24小时5次，1个月20次
async function checkRegisterRateLimit(ip) {
  try {
    const now = new Date();
    const hourKey = `scr:rate_limit:register:hour:${ip}`;
    const dayKey = `scr:rate_limit:register:day:${ip}`;
    const monthKey = `scr:rate_limit:register:month:${ip}`;
    
    const hourCount = await redisClient.incr(hourKey);
    const dayCount = await redisClient.incr(dayKey);
    const monthCount = await redisClient.incr(monthKey);
    
    if (hourCount === 1) {
      await redisClient.expire(hourKey, 3600); // 1小时
    }
    if (dayCount === 1) {
      await redisClient.expire(dayKey, 86400); // 24小时
    }
    if (monthCount === 1) {
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
      const ttl = Math.ceil((monthEnd - now) / 1000);
      await redisClient.expire(monthKey, ttl); // 本月剩余时间
    }
    
    let allowed = true;
    let limitType = '';
    let waitSeconds = 0;
    
    if (hourCount > 2) {
      allowed = false;
      limitType = 'hour';
      waitSeconds = await redisClient.ttl(hourKey);
    } else if (dayCount > 5) {
      allowed = false;
      limitType = 'day';
      waitSeconds = await redisClient.ttl(dayKey);
    } else if (monthCount > 20) {
      allowed = false;
      limitType = 'month';
      waitSeconds = await redisClient.ttl(monthKey);
    }
    
    return {
      allowed,
      limitType,
      hourCount,
      dayCount,
      monthCount,
      waitSeconds: waitSeconds > 0 ? waitSeconds : 0
    };
  } catch (err) {
    console.error('注册速率限制检查失败:', err.message);
    return { allowed: true, limitType: '', hourCount: 0, dayCount: 0, monthCount: 0, waitSeconds: 0 };
  }
}

async function getGlobalMessages(limit = 50, olderThan = null) {
  try {
    let query = `
      SELECT m.id, m.user_id as userId, u.nickname, u.avatar_url as avatarUrl, 
             m.content, m.at_userid, m.message_type as messageType, m.group_id as groupId, m.timestamp
      FROM chat_messages m 
      JOIN chat_users u ON m.user_id = u.id 
      WHERE m.group_id IS NULL 
    `;
    
    const params = [];
    
    // 确保limit是有效整数
    let safeLimit = 20;
    try {
      safeLimit = parseInt(limit);
      if (isNaN(safeLimit) || safeLimit <= 0) {
        safeLimit = 20;
      }
    } catch (e) {
      safeLimit = 20;
    }
    
    // 改进olderThan检查逻辑
    const isOlderThanValid = olderThan !== null && olderThan !== undefined && olderThan !== '' && olderThan !== 0 && String(olderThan).trim() !== '';
    
    if (isOlderThanValid) {
      let safeOlderThan = 0;
      try {
        safeOlderThan = parseInt(olderThan);
        if (!isNaN(safeOlderThan)) {
          query += ` AND m.id < ? `;
          params.push(safeOlderThan);
        }
      } catch (e) {
        // 忽略无效的olderThan参数
      }
    }
    
    // 使用timestamp进行排序
    query += ` ORDER BY m.timestamp DESC, m.id DESC LIMIT ?`;
    params.push(safeLimit);
    
    const [messages] = await pool.query(query, params);

    const processedMessages = messages.map(msg => {
      let atUserIds = null;
      if (msg.at_userid) {
        try {
          atUserIds = JSON.parse(msg.at_userid);
        } catch (e) {
          atUserIds = msg.at_userid;
        }
      }
      const baseMessage = {
        id: msg.id,
        userId: msg.userId,
        nickname: msg.nickname,
        avatarUrl: msg.avatarUrl,
        content: msg.content,
        at_userid: atUserIds,
        messageType: msg.messageType,
        groupId: msg.groupId !== null && msg.groupId !== undefined ? parseInt(msg.groupId) : null,
        timestamp: msg.timestamp
      };
      
      // 处理图片消息：从content字段解析图片URL
      if (msg.messageType === 1 && msg.content) {
        try {
          const contentData = JSON.parse(msg.content);
          if (contentData.url) {
            baseMessage.imageUrl = contentData.url;
          }
        } catch (error) {
          console.error(`❌ 解析图片消息失败: 消息ID=${msg.id}, 错误=${error.message}`);
        }
      }
      
      return baseMessage;
    });

    // 只有当调用者明确需要更新缓存时，才更新缓存
    // 对于user-joined事件，我们不需要更新缓存，因为它会覆盖之前添加的图片消息
    // 所以这里不再总是更新缓存
    
    return processedMessages.reverse();
  } catch (err) {
    console.error('获取全局消息失败:', err.message);
    return [];
  }
}

async function getGroupMessages(groupId, limit = 50, olderThan = null) {
  try {
    // 确保groupId是有效整数
    let safeGroupId = 0;
    try {
      safeGroupId = parseInt(groupId);
      if (isNaN(safeGroupId)) {
        return [];
      }
    } catch (e) {
      return [];
    }
    
    // 确保limit是有效整数，并且转换为MySQL预期的类型
    let safeLimit = 20;
    try {
      safeLimit = parseInt(limit);
      if (isNaN(safeLimit) || safeLimit <= 0) {
        safeLimit = 20;
      }
    } catch (e) {
      safeLimit = 20;
    }
    
    let query = `
      SELECT m.id, m.user_id as userId, u.nickname, u.avatar_url as avatarUrl, 
             m.content, m.at_userid, m.message_type as messageType, m.timestamp
      FROM chat_messages m 
      JOIN chat_users u ON m.user_id = u.id 
      WHERE m.group_id = ? 
    `;
    
    const params = [safeGroupId];
    
    const isOlderThanValid = olderThan !== null && olderThan !== undefined && olderThan !== '' && olderThan !== 0 && String(olderThan).trim() !== '';
    
    if (isOlderThanValid) {
      let safeOlderThan = 0;
      try {
        safeOlderThan = parseInt(olderThan);
        if (!isNaN(safeOlderThan)) {
          query += ` AND m.id < ? `;
          params.push(safeOlderThan);
        }
      } catch (e) {
        // 忽略无效的olderThan参数
      }
    }
    
    // 使用timestamp进行排序
    query += ` ORDER BY m.timestamp DESC, m.id DESC LIMIT ?`;
    params.push(safeLimit);
    
    const [messages] = await pool.query(query, params);

    const processedMessages = messages.map(msg => {
      let atUserIds = null;
      if (msg.at_userid) {
        try {
          atUserIds = JSON.parse(msg.at_userid);
        } catch (e) {
          atUserIds = msg.at_userid;
        }
      }
      const baseMessage = {
        id: msg.id,
        userId: msg.userId,
        nickname: msg.nickname,
        avatarUrl: msg.avatarUrl,
        content: msg.content,
        at_userid: atUserIds,
        messageType: msg.messageType,
        groupId: safeGroupId,
        timestamp: msg.timestamp
      };
      
      // 处理图片消息：从content字段解析图片URL
      if (msg.messageType === 1 && msg.content) {
        try {
          const contentData = JSON.parse(msg.content);
          if (contentData.url) {
            baseMessage.imageUrl = contentData.url;
          }
        } catch (error) {
          console.error(`解析群组图片消息失败: 消息ID=${msg.id}, 群组ID=${safeGroupId}, 错误=${error.message}`);
        }
      }
      
      return baseMessage;
    });
    
    return processedMessages.reverse();
  } catch (err) {
    console.error('获取群组消息失败:', err.message);
    return [];
  }
}

// 检查头像存储空间
function checkAvatarStorage() {
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

// 记录IP日志
async function logIPAction(userId, ip, action) {
  try {
    await pool.execute(
        'INSERT INTO chat_ip_logs (user_id, ip_address, action) VALUES (?, ?, ?)',
        [userId, ip, action]
    );
    // 清理旧记录，保持最多6000条
    await pool.execute(
        'DELETE FROM chat_ip_logs WHERE id NOT IN (SELECT id FROM (SELECT id FROM chat_ip_logs ORDER BY timestamp DESC LIMIT 6000) AS tmp)'
    );
    // console.log(`IP日志: ${ip} - ${action} - 用户: ${userId || '未登录'}`);
  } catch (err) {
    console.error('记录IP日志失败:', err.message);
  }
}

// 用户注册接口
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, nickname, gender, turnstileToken } = req.body;
    const clientIP = getClientIP(req);

    console.log('注册请求 IP:', clientIP);

    // 检查注册速率限制
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

    // 验证性别参数
    const genderNum = parseInt(gender);
    if (isNaN(genderNum) || genderNum < 0 || genderNum > 2) {
      return res.status(400).json({ status: 'error', message: '性别参数非法' });
    }

    // 验证 Turnstile Token
    const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIP);
    if (!turnstileResult.success) {
      return res.status(400).json({ status: 'error', message: turnstileResult.message || '人机验证失败，请重试' });
    }

    if (!validateUsername(username) && !validatePassword(password) && !validateNickname(nickname)) {
      return res.status(400).json({ status: 'error', message: '用户名、密码或昵称非法' });
    }

    const [existingUsers] = await pool.execute(
        'SELECT id FROM chat_users WHERE username = ?',
        [username]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ status: 'error', message: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
        'INSERT INTO chat_users (username, password, nickname, gender, last_online) VALUES (?, ?, ?, ?, NOW())',
        [username, hashedPassword, nickname, genderNum]
    );

    await logIPAction(result.insertId, clientIP, 'register');

    // 生成一个用于自动登录的临时 token，有效期 5 分钟
    const autoLoginToken = `${result.insertId}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    // 将 token 存储到 Redis，键名使用 userId
    const tokenData = {
      token: autoLoginToken,
      expire: Date.now() + 5 * 60 * 1000  // 5 分钟过期
    };
    
    // 使用 Redis 存储自动登录 token，键名为 scr:auto_login_token:{userId}
    await redisClient.set(`scr:auto_login_token:${result.insertId}`, JSON.stringify(tokenData), {
      EX: 300  // 5 分钟过期
    });

    res.json({
      status: 'success',
      message: '注册成功',
      userId: result.insertId,
      autoLoginToken: autoLoginToken  // 返回自动登录 token
    });
  } catch (err) {
    console.error('注册失败:', err.message);
    res.status(500).json({ status: 'error', message: '注册失败' });
  }
});

// 更新个性签名接口
app.post('/api/update-signature', async (req, res) => {
  try {
    const userId = req.headers['user-id'];
    const { signature } = req.body;

    if (!userId) {
      return res.status(400).json({ status: 'error', message: '用户 ID 不能为空' });
    }

    // 验证个性签名长度
    const cleanSignature = signature ? signature.substring(0, 500) : null;

    // 更新用户个性签名
    await pool.execute(
      'UPDATE chat_users SET signature = ? WHERE id = ?',
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
});

// 更新性别接口
app.post('/api/update-gender', async (req, res) => {
  try {
    const userId = req.headers['user-id'];
    const { gender } = req.body;

    if (!userId) {
      return res.status(400).json({ status: 'error', message: '用户 ID 不能为空' });
    }

    // 验证性别参数
    const genderNum = parseInt(gender);
    if (isNaN(genderNum) || genderNum < 0 || genderNum > 2) {
      return res.status(400).json({ status: 'error', message: '性别参数非法' });
    }

    // 更新用户性别
    await pool.execute(
      'UPDATE chat_users SET gender = ? WHERE id = ?',
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
});

// 修改密码 API
app.post('/api/user/change-password', async (req, res) => {
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

    // 验证 Turnstile Token
    const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIP);
    if (!turnstileResult.success) {
      return res.status(400).json({ status: 'error', message: turnstileResult.message || '人机验证失败，请重试' });
    }

    const [users] = await pool.execute(
      'SELECT id, password FROM chat_users WHERE id = ?',
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
      'UPDATE chat_users SET password = ? WHERE id = ?',
      [hashedNewPassword, userId]
    );

    res.json({ status: 'success', message: '密码修改成功' });
  } catch (err) {
    console.error('修改密码失败:', err.message);
    res.status(500).json({ status: 'error', message: '修改密码失败' });
  }
});

// 修改昵称API
app.post('/api/user/update-nickname', async (req, res) => {
  try {
    const userId = req.userId;
    const { newNickname } = req.body;

    if (!validateNickname(newNickname)) {
      return res.status(400).json({ status: 'error', message: '昵称不能为空' });
    }

    await pool.execute(
      'UPDATE chat_users SET nickname = ? WHERE id = ?',
      [newNickname, userId]
    );

    // 获取用户信息
    const [users] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: '用户不存在' });
    }

    const user = users[0];

    // 插入102消息到主消息表
    const [nicknameUpdateResult] = await pool.execute(
      'INSERT INTO chat_messages (user_id, content, message_type, timestamp) VALUES (?, ?, ?, NOW())',
      [userId, JSON.stringify({ type: 'nickname', nickname: newNickname }), 102]
    );

    // 更新在线用户列表中的昵称
    await updateOnlineUserByUserId(userId, { nickname: newNickname });

    // 构造102消息
    const now = new Date();
    const timestampMs = now.getTime();
    const type102Message = {
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

    // 只向已认证用户广播102消息事件
    io.to('authenticated_users').emit('message-received', type102Message);

    res.json({ status: 'success', message: '昵称修改成功', nickname: newNickname });
  } catch (err) {
    console.error('修改昵称失败:', err.message);
    res.status(500).json({ status: 'error', message: '修改昵称失败' });
  }
});

// 获取当前登录用户完整信息API
app.get('/api/self', async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ status: 'error', message: '未登录' });
    }

    const [users] = await pool.execute(
      'SELECT id, username, nickname, gender, signature, avatar_url, last_online, created_at FROM chat_users WHERE id = ?',
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
        last_online: user.last_online,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('获取当前用户信息失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取当前用户信息失败' });
  }
});

// 用户登录接口
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, turnstileToken, autoLoginToken } = req.body;
    const clientIP = getClientIP(req);

    console.log('登录请求 IP:', clientIP);

    // 检查登录速率限制
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

    // 检查 IP 是否被封禁，并获取封禁详情
    const banInfo = await isIPBanned(clientIP);
    if (banInfo.isBanned) {
      let message = '您的 IP 已被封禁';
      
      // 如果有封禁原因，添加到错误消息中
      if (banInfo.reason) {
        message += `，原因：${banInfo.reason}`;
      }
      
      // 如果有剩余封禁时间，添加到错误消息中
      if (banInfo.remainingTime) {
        const { days, hours, minutes } = banInfo.remainingTime;
        message += `，还剩 ${days}天${hours}小时${minutes}分钟解封`;
      }
      
      return res.status(403).json({ 
        status: 'error', 
        message: message,
        isBanned: true,
        reason: banInfo.reason,
        remainingTime: banInfo.remainingTime
      });
    }

    // 检查是否使用自动登录 token
    if (autoLoginToken) {
      // 从 token 中提取 userId（格式：{userId}_{timestamp}_{random}）
      const tokenParts = autoLoginToken.split('_');
      if (tokenParts.length < 3) {
        return res.status(400).json({ status: 'error', message: '自动登录 token 格式无效' });
      }
      
      const userId = tokenParts[0];
      
      // 从 Redis 获取自动登录 token
      const tokenDataStr = await redisClient.get(`scr:auto_login_token:${userId}`);
      
      if (!tokenDataStr) {
        return res.status(400).json({ status: 'error', message: '自动登录 token 无效或已过期' });
      }
      
      const tokenData = JSON.parse(tokenDataStr);
      
      // 验证 token 是否匹配
      if (tokenData.token !== autoLoginToken) {
        return res.status(400).json({ status: 'error', message: '自动登录 token 不匹配' });
      }
      
      // 检查 token 是否过期
      if (Date.now() > tokenData.expire) {
        await redisClient.del(`scr:auto_login_token:${userId}`);
        return res.status(400).json({ status: 'error', message: '自动登录 token 已过期，请使用验证码登录' });
      }
      
      // token 有效，获取用户信息
      const [users] = await pool.execute(
        'SELECT id, username, nickname, gender, avatar_url FROM chat_users WHERE id = ?',
        [userId]
      );
      
      if (users.length === 0) {
        await redisClient.del(`scr:auto_login_token:${userId}`);
        return res.status(404).json({ status: 'error', message: '用户不存在' });
      }
      
      const user = users[0];
      
      // 检查用户是否被封禁
      const userBanInfo = await isUserBanned(user.id);
      if (userBanInfo.isBanned) {
        let message = '您的账号已被封禁';
        
        // 如果有封禁原因，添加到错误消息中
        if (userBanInfo.reason) {
          message += `，原因：${userBanInfo.reason}`;
        }
        
        // 如果有剩余封禁时间，添加到错误消息中
        if (userBanInfo.remainingTime) {
          const { days, hours, minutes } = userBanInfo.remainingTime;
          message += `，还剩 ${days}天${hours}小时${minutes}分钟解封`;
        }
        
        return res.status(403).json({ 
          status: 'error', 
          message: message,
          isBanned: true,
          reason: userBanInfo.reason,
          remainingTime: userBanInfo.remainingTime
        });
      }
      
      // 更新用户在线时间
      await pool.execute(
        'UPDATE chat_users SET last_online = NOW() WHERE id = ?',
        [user.id]
      );
      
      // 创建会话
      const { token: sessionToken, refreshToken } = await createUserSession(user.id);
      
      // 删除已使用的 token（只能用一次）
      await redisClient.del(`scr:auto_login_token:${userId}`);
      
      await logIPAction(user.id, clientIP, 'login_auto_success');
      
      res.json({
        status: 'success',
        message: '自动登录成功',
        userId: user.id,
        nickname: user.nickname,
        gender: user.gender,
        avatarUrl: user.avatar_url,
        sessionToken: sessionToken,
        refreshToken: refreshToken,
        autoLogin: true  // 标记是自动登录
      });
      
      return;
    }

    // 普通登录流程（需要 Turnstile 验证）
    if (!username || !password || !turnstileToken) {
      return res.status(400).json({ status: 'error', message: '请填写所有字段并完成人机验证' });
    }

    // 验证 Turnstile Token
    const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIP);
    if (!turnstileResult.success) {
      return res.status(400).json({ status: 'error', message: turnstileResult.message || '人机验证失败，请重试' });
    }

    if (!validateUsername(username)) {
      return res.status(400).json({ status: 'error', message: '用户名或密码非法' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ status: 'error', message: '用户名或密码非法' });
    }

    const [users] = await pool.execute(
        'SELECT id, username, password, nickname, gender, avatar_url FROM chat_users WHERE username = ?',
        [username]
    );

    if (users.length === 0) {
      await logIPAction(null, clientIP, 'login_failed');
      
      return res.status(400).json({ 
        status: 'error', 
        message: '用户名或密码错误'
      });
    }

    const user = users[0];

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      await logIPAction(null, clientIP, 'login_failed');
      
      return res.status(400).json({ 
        status: 'error', 
        message: '用户名或密码错误'
      });
    }

    // 检查用户是否被封禁
    const userBanInfo = await isUserBanned(user.id);
    if (userBanInfo.isBanned) {
      let message = '您的账号已被封禁';
      
      // 如果有封禁原因，添加到错误消息中
      if (userBanInfo.reason) {
        message += `，原因：${userBanInfo.reason}`;
      }
      
      // 如果有剩余封禁时间，添加到错误消息中
      if (userBanInfo.remainingTime) {
        const { days, hours, minutes } = userBanInfo.remainingTime;
        message += `，还剩 ${days}天${hours}小时${minutes}分钟解封`;
      }
      
      return res.status(403).json({ 
        status: 'error', 
        message: message,
        isBanned: true,
        reason: userBanInfo.reason,
        remainingTime: userBanInfo.remainingTime
      });
    }

    await pool.execute(
        'UPDATE chat_users SET last_online = NOW() WHERE id = ?',
        [user.id]
    );

    const { token: sessionToken, refreshToken } = await createUserSession(user.id);

    await logIPAction(user.id, clientIP, 'login_success');

    res.json({
      status: 'success',
      message: '登录成功',
      userId: user.id,
      nickname: user.nickname,
      gender: user.gender,
      avatarUrl: user.avatar_url,
      sessionToken: sessionToken,
      refreshToken: refreshToken
    });
  } catch (err) {
    console.error('登录失败:', err.message);
    res.status(500).json({ status: 'error', message: '登录失败' });
  }
});

// 刷新 Token 接口
app.post('/api/refresh-token', async (req, res) => {
  try {
    const { userId, refreshToken } = req.body;
    
    if (!userId || !refreshToken) {
      return res.status(400).json({ status: 'error', message: '缺少必要参数' });
    }
    
    // 从 Redis 获取 refreshToken
    const session = await getUserSession(parseInt(userId));
    
    // 如果 Redis 中没有 refreshToken，直接返回错误
    if (!session || !session.refreshToken) {
      return res.status(401).json({ status: 'error', message: '会话已过期，请重新登录' });
    }
    
    // 验证 refreshToken
    if (session.refreshToken !== refreshToken) {
      return res.status(401).json({ status: 'error', message: 'Refresh Token 无效' });
    }
    
    // 生成新的 Token 和 Refresh Token
    const newToken = generateSessionToken();
    const newRefreshToken = generateSessionToken();
    const newExpires = Date.now() + (20 * 60 * 1000);
    const newRefreshExpires = Date.now() + (30 * 24 * 60 * 60 * 1000);
    
    // 更新 Redis 中的会话
    const newSession = {
      token: newToken,
      refreshToken: newRefreshToken
    };
    await setUserSession(parseInt(userId), newSession, newExpires, newRefreshExpires);
    
    // 更新数据库中的 refresh_token
    await pool.execute(
      'UPDATE chat_sessions SET refresh_token = ?, refresh_expires = ?, last_active = ? WHERE user_id = ?',
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
});

// 验证会话中间件
async function validateSession(req, res, next) {
  try {
    const userId = req.headers['user-id'] || req.query.userId;
    const sessionToken = req.headers['session-token'] || req.query.sessionToken;

    // console.log('验证会话请求:', {
    //   userId,
    //   sessionToken: sessionToken ? `${sessionToken.substring(0, 10)}...` : 'undefined',
    //   path: req.path,
    //   method: req.method
    // });

    if (!userId || !sessionToken) {
      // console.error('会话验证失败: 缺少必要参数');
      return res.status(401).json({ status: 'error', message: '未授权访问' });
    }

    if (!(await validateUserSession(userId, sessionToken))) {
      return res.status(401).json({ status: 'error', message: '会话无效' });
    }

    req.userId = userId;
    req.sessionToken = sessionToken;

    next();
  } catch (err) {
    // console.error('会话验证失败:', err.message);
    res.status(500).json({ status: 'error', message: '服务器错误' });
  }
}

// 获取群组信息接口
app.get('/api/group/:id', async (req, res) => {
  try {
    const groupId = req.params.id;

    const [groups] = await pool.execute(
        'SELECT id, name, description, creator_id, avatar_url, created_at FROM chat_groups WHERE id = ? AND deleted_at IS NULL',
        [groupId]
    );

    if (groups.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }

    res.json({
      status: 'success',
      group: groups[0]
    });
  } catch (err) {
    console.error('获取群组信息失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取群组信息失败' });
  }
});

// 获取用户信息接口
app.get('/api/user/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    const [users] = await pool.execute(
        'SELECT id, username, nickname, gender, signature, avatar_url FROM chat_users WHERE id = ?',
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
});

// 群头像上传接口
app.post('/api/upload-group-avatar/:groupId', groupAvatarUpload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      const ext = req.body.filename ? path.extname(req.body.filename).toLowerCase() : '';
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
    const groupId = req.params.groupId;

    if (!userId || !groupId) {
      return res.status(400).json({ status: 'error', message: '用户ID和群组ID不能为空' });
    }

    // 检查用户是否是群组的创建者（群主）
    const [groups] = await pool.execute(
        'SELECT id, name, creator_id FROM chat_groups WHERE id = ? AND creator_id = ? AND deleted_at IS NULL',
        [groupId, userId]
    );

    if (groups.length === 0) {
      return res.status(403).json({ status: 'error', message: '只有群主可以修改群头像' });
    }

    const group = groups[0];
    const avatarPath = `/avatars/${req.file.filename}`;
    
    // 清理该群组的旧头像文件
    // 搜索所有 group_avatar_${groupId}.* 文件
    const groupAvatarFiles = fs.readdirSync(avatarDir).filter(file => {
      return file.startsWith(`group_avatar_${groupId}.`);
    });

    // 如果头像文件数量大于1，删除除当前头像外的其他文件
    if (groupAvatarFiles.length > 1) {
      const currentAvatarFilename = req.file.filename;
      for (const file of groupAvatarFiles) {
        if (file !== currentAvatarFilename) {
          try {
            const filePath = path.join(avatarDir, file);
            fs.unlinkSync(filePath);
          } catch (deleteError) {
            console.error(`删除旧群头像文件 ${file} 失败:`, deleteError.message);
          }
        }
      }
    }
    
    // 生成带时间戳的头像 URL，确保客户端获取最新资源
    const timestamp = Date.now();
    const avatarUrlWithVersion = `${avatarPath}?v=${timestamp}`;

    // 更新群组头像 URL
    await pool.execute(
        'UPDATE chat_groups SET avatar_url = ? WHERE id = ? AND deleted_at IS NULL',
        [avatarUrlWithVersion, groupId]
    );

    // 广播群头像更新事件给所有群组成员（使用群组房间）
    io.to(`group_${groupId}`).emit('group-avatar-updated', {
      groupId: groupId,
      avatarUrl: avatarUrlWithVersion
    });

    res.json({
      status: 'success',
      message: '群头像上传成功',
      groupId: group.id,
      groupName: group.name,
      avatarUrl: avatarUrlWithVersion
    });
  } catch (err) {
    console.error('上传群头像失败:', err.message);
    res.status(500).json({ status: 'error', message: '上传群头像失败' });
  }
});

// 上传头像接口 - 注意：头像上传不限制次数
app.post('/api/upload-avatar', avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      const ext = req.body.filename ? path.extname(req.body.filename).toLowerCase() : '';
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

    // console.log('头像上传 - 使用的userId:', userId);

    if (!userId) {
      return res.status(400).json({ status: 'error', message: '用户ID不能为空' });
    }

    // 查询用户当前头像URL，用于删除旧头像
    const [users] = await pool.execute(
        'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
        [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: '用户不存在' });
    }

    const user = users[0];
    const avatarUrl = `/avatars/${req.file.filename}`;

    // 清理该用户的旧头像文件
    // 搜索所有 avatar_${userId}.* 文件
    const avatarFiles = fs.readdirSync(avatarDir).filter(file => {
      return file.startsWith(`avatar_${userId}.`);
    });

    // 如果头像文件数量大于1，删除除当前头像外的其他文件
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

    // 生成带时间戳的头像 URL，确保客户端获取最新资源
    const timestamp = Date.now();
    const avatarUrlWithVersion = `${avatarUrl}?v=${timestamp}`;

    await pool.execute(
        'UPDATE chat_users SET avatar_url = ? WHERE id = ?',
        [avatarUrlWithVersion, userId]
    );

    // 插入102消息到主消息表
    const [avatarUpdateResult] = await pool.execute(
      'INSERT INTO chat_messages (user_id, content, message_type, timestamp) VALUES (?, ?, ?, NOW())',
      [userId, JSON.stringify({ type: 'avatar', avatarUrl: avatarUrlWithVersion }), 102]
    );

    // 更新在线用户列表中的头像
    await updateOnlineUserByUserId(userId, { avatarUrl: avatarUrlWithVersion });

    // 构造102消息
    const now = new Date();
    const timestampMs = now.getTime();
    const type102Message = {
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

    // 只向已认证用户广播102消息事件
    io.to('authenticated_users').emit('message-received', type102Message);

    res.json({
      status: 'success',
      avatarUrl: avatarUrlWithVersion,
      storageInfo: storageStatus
    });
  } catch (err) {
    console.error('头像上传失败:', err.message);
    res.status(500).json({ status: 'error', message: '头像上传失败' });
  }
});

// 获取头像存储状态接口
app.get('/api/avatar-storage', async (req, res) => {
  try {
    const storageStatus = checkAvatarStorage();
    res.json({
      status: 'success',
      storageInfo: storageStatus
    });
  } catch (err) {
    console.error('获取存储状态失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取存储状态失败' });
  }
});

// 获取离线消息接口
app.get('/api/offline-messages', async (req, res) => {
  try {
    const userId = req.userId;
    const publicAndGroupMinId = req.query.publicAndGroupMinId ? parseInt(req.query.publicAndGroupMinId) : 0;
    const privateMinId = req.query.privateMinId ? parseInt(req.query.privateMinId) : 0;
    
    // 计算3个月前的时间
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    // 1. 获取公共聊天消息（group_id 为 NULL）
    const [publicMessages] = await pool.execute(`
      SELECT 
        m.id, 
        m.user_id as userId, 
        u.nickname, 
        u.avatar_url as avatarUrl, 
        m.content, 
        m.at_userid as atUserid,
        m.message_type as messageType, 
        m.timestamp,
        'public' as type
      FROM chat_messages m 
      JOIN chat_users u ON m.user_id = u.id 
      WHERE m.group_id IS NULL 
        AND m.timestamp >= ?
        AND m.id > ?
      ORDER BY m.timestamp DESC, m.id DESC
      LIMIT 2500
    `, [threeMonthsAgo, publicAndGroupMinId]);
    
    // 2. 获取用户所在群组的消息（包括已解散的群组）
    const [allMemberRecords] = await pool.execute(`
      SELECT group_id, joined_at, deleted_at FROM chat_group_members WHERE user_id = ?
    `, [userId]);
    
    // 按群组ID分组
    const groupRecordsMap = new Map();
    for (const record of allMemberRecords) {
      const groupId = record.group_id;
      if (!groupRecordsMap.has(groupId)) {
        groupRecordsMap.set(groupId, []);
      }
      groupRecordsMap.get(groupId).push(record);
    }
    
    let groupMessages = [];
    if (groupRecordsMap.size > 0) {
      // 为每个群组分别查询消息，根据所有加入记录返回对应消息
      for (const [groupId, records] of groupRecordsMap) {
        // 构建时间范围条件：所有 joined_at <= timestamp <= deleted_at（或未设置）
        const timeConditions = [];
        const params = [groupId, threeMonthsAgo, publicAndGroupMinId];
        
        for (const record of records) {
          if (record.deleted_at) {
            timeConditions.push(`(m.timestamp >= ? AND m.timestamp <= ?)`);
            params.push(record.joined_at, record.deleted_at);
          } else {
            timeConditions.push(`m.timestamp >= ?`);
            params.push(record.joined_at);
          }
        }
        
        const timeCondition = timeConditions.join(' OR ');
        
        const [groupMsgs] = await pool.execute(`
          SELECT 
            m.id, 
            m.user_id as userId, 
            u.nickname, 
            u.avatar_url as avatarUrl, 
            m.content, 
            m.at_userid as atUserid,
            m.message_type as messageType, 
            m.timestamp,
            'group' as type,
            m.group_id as groupId,
            g.name as groupName,
            g.deleted_at as groupDeletedAt
          FROM chat_messages m 
          JOIN chat_users u ON m.user_id = u.id 
          JOIN chat_groups g ON m.group_id = g.id
          WHERE m.group_id = ?
            AND m.timestamp >= ?
            AND m.id > ?
            AND (${timeCondition})
          ORDER BY m.timestamp DESC, m.id DESC
          LIMIT 8000
        `, params);
        
        groupMessages = groupMessages.concat(groupMsgs);
      }
      
      // 合并后按时间戳排序
      groupMessages.sort((a, b) => {
        if (b.timestamp !== a.timestamp) {
          return new Date(b.timestamp) - new Date(a.timestamp);
        }
        return b.id - a.id;
      });
      
      // 限制总数
      if (groupMessages.length > 8000) {
        groupMessages = groupMessages.slice(0, 8000);
      }
    }
    
    // 3. 获取私信消息（用户作为发送者或接收者）
    const [privateMessages] = await pool.execute(`
      SELECT 
        pm.id, 
        pm.sender_id as senderId, 
        u.nickname, 
        u.avatar_url as avatarUrl, 
        pm.content, 
        pm.at_userid as atUserid,
        pm.message_type as messageType, 
        pm.timestamp,
        'private' as type,
        pm.receiver_id as receiverId,
        pm.is_read as isRead
      FROM chat_private_messages pm 
      JOIN chat_users u ON pm.sender_id = u.id 
      WHERE (pm.sender_id = ? OR pm.receiver_id = ?)
        AND pm.timestamp >= ?
        AND pm.id > ?
      ORDER BY pm.timestamp DESC, pm.id DESC
      LIMIT 5000
    `, [userId, userId, threeMonthsAgo, privateMinId]);
    
    // 直接返回数据库字段名，不做额外处理
    res.json({
      status: 'success',
      publicMessages: publicMessages.reverse(),
      groupMessages: groupMessages.reverse(),
      privateMessages: privateMessages.reverse()
    });
  } catch (err) {
    console.error('获取离线消息失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取离线消息失败' });
  }
});

// 创建群组接口
app.post('/api/create-group', async (req, res) => {
  try {
    const { userId, groupName, description, memberIds } = req.body;

    if (!userId || !groupName || !memberIds || !Array.isArray(memberIds)) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }

    const sessionUserId = req.userId;
    if (parseInt(userId) !== parseInt(sessionUserId)) {
      return res.status(403).json({ status: 'error', message: '无权操作此用户' });
    }

    // 群组名称验证
    if (!groupName || typeof groupName !== 'string' || groupName.trim().length === 0) {
      return res.status(400).json({ status: 'error', message: '群组名称不能为空' });
    }

    // 检查群组名称是否包含SQL注入
    if (sqlInjectionPattern.test(groupName)) {
      return res.status(400).json({ status: 'error', message: '群组名称非法' });
    }

    // 检查描述是否包含SQL注入（如果提供了描述）
    if (description && typeof description === 'string' && sqlInjectionPattern.test(description)) {
      return res.status(400).json({ status: 'error', message: '群组描述非法' });
    }

    // 移除3人限制，改为1人
    const allMemberIds = [...new Set([parseInt(userId), ...memberIds.map(id => parseInt(id))])];
    
    // 获取创建者的所有好友ID
    const [friendIds] = await pool.execute(
      'SELECT friend_id FROM chat_friends WHERE user_id = ? AND deleted_at IS NULL',
      [parseInt(userId)]
    );
    const friends = friendIds.map(row => row.friend_id);
    
    // 验证所有添加的成员都是创建者的好友
    const nonFriendMembers = allMemberIds.filter(memberId => memberId !== parseInt(userId) && !friends.includes(memberId));
    if (nonFriendMembers.length > 0) {
      return res.status(400).json({ status: 'error', message: '只能添加好友到群组' });
    }
    
    // 验证所有成员都存在
    const placeholders = allMemberIds.map(() => '?').join(',');
    const [members] = await pool.execute(
        `SELECT id FROM chat_users WHERE id IN (${placeholders})`,
        allMemberIds
    );
    
    if (members.length !== allMemberIds.length) {
      return res.status(400).json({ status: 'error', message: '部分成员不存在' });
    }

    const [groupResult] = await pool.execute(
        'INSERT INTO chat_groups (name, description, creator_id) VALUES (?, ?, ?)',
        [groupName, description || '', userId]
    );

    const groupId = groupResult.insertId;

    const memberValues = allMemberIds.map(memberId => [groupId, memberId]);
    await pool.query(
        'INSERT INTO chat_group_members (group_id, user_id) VALUES ?',
        [memberValues]
    );

    const [groups] = await pool.execute(`
      SELECT g.*, u.nickname as creator_name 
      FROM chat_groups g 
      JOIN chat_users u ON g.creator_id = u.id 
      WHERE g.id = ? AND g.deleted_at IS NULL
    `, [groupId]);

    const [groupMembers] = await pool.execute(`
      SELECT u.id, u.nickname, u.avatar_url 
      FROM chat_group_members gm 
      JOIN chat_users u ON gm.user_id = u.id 
      WHERE gm.group_id = ? AND gm.deleted_at IS NULL
    `, [groupId]);

    // 让所有在线成员加入群组房间
    for (const member of groupMembers) {
      const allOnlineUsers = await getAllOnlineUsers();
      for (const onlineUser of allOnlineUsers) {
        if (String(onlineUser.id) === String(member.id)) {
          const memberSocket = io.sockets.sockets.get(onlineUser.socketId);
          if (memberSocket) {
            memberSocket.join(`group_${groupId}`);
            // console.log(`✅ 成员 ${member.id} 加入新群组房间: group_${groupId}`);
          }
        }
      }
    }
    
    // 获取创建者信息
    const [creatorInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
      [userId]
    );

    // 先广播类型100的系统消息：XXX创建了群组
    const now = new Date();
    let createContent = `${creatorInfo[0]?.nickname || '用户'}创建了群组`;
    
    // 如果有同时加入的成员，添加到消息中
    const otherMemberIds = allMemberIds.filter(id => id !== parseInt(userId));
    if (otherMemberIds.length > 0) {
      const [otherMembersInfo] = await pool.execute(
        `SELECT u.id, u.nickname FROM chat_users u WHERE u.id IN (${otherMemberIds.map(() => '?').join(',')})`,
        otherMemberIds
      );
      const otherMemberNames = otherMembersInfo.map(m => m.nickname || '用户').join('、');
      createContent += `，同时加入群组的有：${otherMemberNames}`;
    }
    
    const [insertResult] = await pool.execute(
      'INSERT INTO chat_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [userId, createContent, 100, groupId]
    );

    // 构建100类型消息对象
    const type100Message = {
      id: insertResult.insertId,
      userId: userId,
      nickname: creatorInfo[0]?.nickname || '',
      avatarUrl: creatorInfo[0]?.avatar_url || '',
      content: createContent,
      at_userid: null,
      messageType: 100,
      groupId: groupId,
      timestamp: now.getTime(),
      timestampISO: now.toISOString()
    };

    // 向所有群组成员发送100类型消息（先广播）
    io.to(`group_${groupId}`).emit('message-received', type100Message);
      
    // 向所有群组成员广播群组创建事件（使用群组房间）
    io.to(`group_${groupId}`).emit('group-created', {
      groupId: groupId,
      groupName: groupName,
      creatorId: userId,
      members: groupMembers
    });

    res.json({
      status: 'success',
      message: '群组创建成功',
      group: groups[0],
      members: groupMembers,
      createMessage: type100Message
    });
  } catch (err) {
    console.error('创建群组失败:', err.message);
    res.status(500).json({ status: 'error', message: '创建群组失败' });
  }
});

// 获取用户群组列表接口
app.get('/api/user-groups/:userId', async (req, res) => {
  try {
    // 添加详细的日志记录
    // console.log('🚀 收到获取用户群组列表请求');
    // console.log('请求参数 userId:', req.params.userId);
    // console.log('会话用户ID:', req.userId);
    // console.log('请求头:', req.headers);

    const userId = req.params.userId;

    const sessionUserId = req.userId;
    if (parseInt(userId) !== parseInt(sessionUserId)) {
      console.error('❌ 权限错误: 尝试访问其他用户的群组列表');
      return res.status(403).json({ status: 'error', message: '无权访问此用户信息' });
    }

    // console.log('🔍 正在查询用户', userId, '的群组');
    const [groups] = await pool.execute(`
      SELECT g.*
      FROM chat_groups g 
      JOIN chat_group_members gm ON g.id = gm.group_id 
      WHERE gm.user_id = ? AND g.deleted_at IS NULL AND gm.deleted_at IS NULL
      ORDER BY g.id DESC
    `, [userId]);

    // console.log('✅ 查询结果: 找到', groups.length, '个群组');

    // 构建响应数据
    const responseData = {
      status: 'success',
      groups: groups,
      timestamp: new Date().toISOString()
    };
    
    res.json(responseData);
  } catch (err) {
    console.error('❌ 获取群组列表失败:', err.message);
    console.error('错误详情:', err);
    res.status(500).json({ status: 'error', message: '获取群组列表失败', error: err.message });
  }
});

// 获取可添加到群组的成员列表接口
app.get('/api/available-group-members/:groupId', async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.userId; // 从validateSession中间件获取

    // 首先检查请求者是否为群主
    const [group] = await pool.execute(
      'SELECT creator_id FROM chat_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ success: false, message: '群组不存在' });
    }

    if (parseInt(group[0].creator_id) !== parseInt(userId)) {
      return res.status(403).json({ success: false, message: '只有群主可以查看可添加成员' });
    }

    // 查询不在该群组中的创建者的好友
    const [availableMembers] = await pool.execute(`
      SELECT u.id, u.nickname, u.avatar_url 
      FROM chat_users u 
      JOIN chat_friends f ON u.id = f.friend_id
      WHERE f.user_id = ? AND f.deleted_at IS NULL AND u.id NOT IN (
        SELECT user_id FROM chat_group_members WHERE group_id = ? AND deleted_at IS NULL
      ) AND u.id != ?
    `, [userId, groupId, userId]);

    res.json({
      status: 'success',
      members: availableMembers.map(member => ({
        id: member.id,
        nickname: member.nickname,
        avatarUrl: member.avatar_url
      }))
    });
  } catch (err) {
    console.error('获取可添加成员失败:', err.message);
    res.status(500).json({ success: false, message: '获取可添加成员失败' });
  }
});

// 获取群组信息接口（用于检查群主身份）
app.get('/api/group-info/:groupId', async (req, res) => {
  try {
    const groupId = req.params.groupId;

    const [group] = await pool.execute(
      'SELECT id, name, description, creator_id, created_at, avatar_url, deleted_at FROM chat_groups WHERE id = ?',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }

    res.json({
      status: 'success',
      group: group[0]
    });
  } catch (err) {
    console.error('获取群组信息失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取群组信息失败' });
  }
});

// 获取群组成员接口
app.get('/api/group-members/:groupId', async (req, res) => {
  try {
    const groupId = req.params.groupId;

    const [members] = await pool.execute(`
      SELECT u.id, u.nickname, u.avatar_url as avatarUrl 
      FROM chat_group_members gm 
      JOIN chat_users u ON gm.user_id = u.id 
      WHERE gm.group_id = ? AND gm.deleted_at IS NULL
    `, [groupId]);

    res.json({
      status: 'success',
      members: members
    });
  } catch (err) {
    console.error('获取群组成员失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取群组成员失败' });
  }
});

// 踢出群组成员接口
app.post('/api/remove-group-member', async (req, res) => {
  try {
    const { groupId, memberId } = req.body;
    const userId = req.userId; // 从validateSession中间件获取

    // 验证参数
    if (!groupId || !memberId) {
      return res.status(400).json({ success: false, message: '参数错误' });
    }

    // 检查请求者是否为群主
    const [group] = await pool.execute(
      'SELECT creator_id, name FROM chat_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ success: false, message: '群组不存在' });
    }

    if (parseInt(group[0].creator_id) !== parseInt(userId)) {
      return res.status(403).json({ success: false, message: '只有群主可以踢出成员' });
    }

    // 检查成员是否在群组中
    const [member] = await pool.execute(
      'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
      [groupId, memberId]
    );

    if (!member || member.length === 0) {
      return res.status(404).json({ success: false, message: '该成员不在群组中' });
    }

    // 不能踢出自己（群主自己）
    if (parseInt(memberId) === parseInt(userId)) {
      return res.status(400).json({ success: false, message: '不能踢出自己' });
    }

    // 获取被踢出的成员信息
    const [memberInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
      [memberId]
    );

    // 获取群主信息
    const [creatorInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
      [userId]
    );

    // 先广播类型100的系统消息：XXX被踢出了群组
    const now = new Date();
    const kickedContent = `${memberInfo[0]?.nickname || '用户'}被移出了群组`;
    const [insertResult] = await pool.execute(
      'INSERT INTO chat_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [userId, kickedContent, 100, groupId]
    );

    // 构建100类型消息对象
    const type100Message = {
      id: insertResult.insertId,
      userId: userId,
      nickname: creatorInfo[0]?.nickname || '',
      avatarUrl: creatorInfo[0]?.avatar_url || '',
      content: kickedContent,
      at_userid: null,
      messageType: 100,
      groupId: groupId,
      timestamp: now.getTime(),
      timestampISO: now.toISOString()
    };

    // 向所有群组成员发送100类型消息（先广播）
    io.to(`group_${groupId}`).emit('message-received', type100Message);
    
    // 同时也向被踢出的成员的用户房间发送，确保他们能收到
    io.to(`user_${memberId}`).emit('message-received', type100Message);

    // 执行踢出操作 - 逻辑删除，只记录deleted_at（加1秒）
    const deletedAt = new Date(Date.now() + 1000);
    await pool.execute(
      'UPDATE chat_group_members SET deleted_at = ? WHERE group_id = ? AND user_id = ?',
      [deletedAt, groupId, memberId]
    );

    // 向所有群组成员广播成员被踢出事件
    io.to(`group_${groupId}`).emit('member-removed', { groupId, memberId });
    
    // 也通知被踢出的成员
    io.to(`user_${memberId}`).emit('member-removed', { groupId, memberId });
    
    res.json({ success: true, message: '成员已成功踢出' });
  } catch (err) {
    console.error('踢出成员失败:', err.message);
    res.status(500).json({ success: false, message: '踢出成员失败' });
  }
});

// 群主拉取成员接口
app.post('/api/add-group-members', async (req, res) => {
  try {
    const { groupId, memberIds, userId: requestUserId } = req.body;
    const userId = req.userId;
    
    // 验证请求中的用户ID是否与会话用户ID一致
    if (requestUserId && String(requestUserId) !== String(userId)) {
      return res.status(403).json({ status: 'error', message: '无效的用户ID' });
    }

    if (!groupId || !memberIds || !Array.isArray(memberIds)) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }

    // 检查用户是否是群主
    const [group] = await pool.execute(
      'SELECT creator_id, name, avatar_url FROM chat_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }

    if (parseInt(group[0].creator_id) !== parseInt(userId)) {
      return res.status(403).json({ status: 'error', message: '只有群主可以拉取成员' });
    }

    // 检查成员是否存在
    const cleanMemberIds = [...new Set(memberIds.map(id => parseInt(id)))];
    const placeholders = cleanMemberIds.map(() => '?').join(',');
    const [users] = await pool.execute(
      `SELECT id FROM chat_users WHERE id IN (${placeholders})`,
      cleanMemberIds
    );

    if (users.length !== cleanMemberIds.length) {
      return res.status(400).json({ status: 'error', message: '部分用户不存在' });
    }
    
    // 获取群主的所有好友ID
    const [friendIds] = await pool.execute(
      'SELECT friend_id FROM chat_friends WHERE user_id = ? AND deleted_at IS NULL',
      [parseInt(userId)]
    );
    const friends = friendIds.map(row => row.friend_id);
    
    // 验证所有要添加的成员都是群主的好友
    const nonFriendMembers = cleanMemberIds.filter(memberId => !friends.includes(memberId));
    if (nonFriendMembers.length > 0) {
      return res.status(400).json({ status: 'error', message: '只能添加好友到群组' });
    }

    // 检查用户是否已经在群组中
    const [existingMembers] = await pool.execute(
      `SELECT user_id FROM chat_group_members WHERE group_id = ? AND user_id IN (${placeholders}) AND deleted_at IS NULL`,
      [groupId].concat(cleanMemberIds)
    );

    const existingUserIds = new Set(existingMembers.map(m => m.user_id));
    const newMemberIds = cleanMemberIds.filter(id => !existingUserIds.has(id));

    if (newMemberIds.length === 0) {
      return res.status(400).json({ status: 'error', message: '所选用户已在群组中' });
    }

    // 获取新成员信息
    const [newMembersInfo] = await pool.execute(
      `SELECT u.id, u.nickname, u.avatar_url as avatarUrl 
      FROM chat_users u 
      WHERE u.id IN (${newMemberIds.map(() => '?').join(',')})`,
      newMemberIds
    );

    // 获取群主信息
    const [creatorInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
      [userId]
    );

    // 添加新成员，总是创建新记录
    for (const memberId of newMemberIds) {
      await pool.execute(
        'INSERT INTO chat_group_members (group_id, user_id, joined_at) VALUES (?, ?, NOW())',
        [groupId, memberId]
      );
    }

    // 获取更新后的群组成员列表
    const [updatedMembers] = await pool.execute(
      `SELECT u.id, u.nickname, u.avatar_url as avatarUrl 
      FROM chat_group_members gm 
      JOIN chat_users u ON gm.user_id = u.id 
      WHERE gm.group_id = ?`,
      [groupId]
    );

    // 让所有在线的新成员加入群组房间
    const allOnlineUsers = await getAllOnlineUsers();
    for (const memberId of newMemberIds) {
      for (const onlineUser of allOnlineUsers) {
        if (String(onlineUser.id) === String(memberId)) {
          const memberSocket = io.sockets.sockets.get(onlineUser.socketId);
          if (memberSocket) {
            memberSocket.join(`group_${groupId}`);
            // console.log(`✅ 新成员 ${memberId} 加入群组房间: group_${groupId}`);
          }
        }
      }
    }

    // 插入类型100的系统消息：XXX邀请XXX加入了群组
    const now = new Date();
    const newMemberNames = newMembersInfo.map(m => m.nickname || '用户').join('、');
    const inviterName = creatorInfo[0]?.nickname || '用户';
    const addedContent = `${inviterName}邀请${newMemberNames}加入了群组`;
    const [insertResult] = await pool.execute(
      'INSERT INTO chat_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [userId, addedContent, 100, groupId]
    );

    // 构建100类型消息对象
    const type100Message = {
      id: insertResult.insertId,
      userId: userId,
      nickname: creatorInfo[0]?.nickname || '',
      avatarUrl: creatorInfo[0]?.avatar_url || '',
      content: addedContent,
      at_userid: null,
      messageType: 100,
      groupId: groupId,
      timestamp: now.getTime(),
      timestampISO: now.toISOString()
    };

    // 向所有群组成员发送100类型消息（新成员已经加入房间了）
    io.to(`group_${groupId}`).emit('message-received', type100Message);
    
    // 同时也向新成员的用户房间发送，确保他们能收到
    for (const memberId of newMemberIds) {
      io.to(`user_${memberId}`).emit('message-received', type100Message);
      // 向新成员单独发送被添加到群组的事件，包含群组信息
      io.to(`user_${memberId}`).emit('added-to-group', {
        groupId: groupId,
        groupName: group[0].name,
        groupAvatarUrl: group[0].avatar_url || ''
      });
    }

    // 获取群组所有成员，向他们广播成员添加事件
    const [allMembers] = await pool.execute(
      'SELECT user_id FROM chat_group_members WHERE group_id = ? AND deleted_at IS NULL',
      [groupId]
    );
    
    // 向所有群组成员广播成员添加事件（使用群组房间）
    io.to(`group_${groupId}`).emit('members-added', {
      groupId: groupId,
      newMembers: newMembersInfo,
      allMembers: updatedMembers
    });

    res.json({
      status: 'success',
      message: '成员添加成功',
      addedCount: newMemberIds.length,
      members: updatedMembers
    });
  } catch (err) {
    console.error('添加群组成员失败:', err.message);
    res.status(500).json({ status: 'error', message: '添加群组成员失败' });
  }
});

// 删除获取群组消息接口（已废弃，使用离线消息接口）

// 生成群组邀请Token
app.post('/api/generate-group-token', async (req, res) => {
  try {
    const { groupId } = req.body;
    const userId = req.userId;
    
    if (!groupId) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }
    
    // 检查用户是否为群组成员
    const [member] = await pool.execute(
      'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
      [groupId, userId]
    );
    
    if (!member || member.length === 0) {
      return res.status(403).json({ status: 'error', message: '只有群组成员可以生成邀请Token' });
    }
    
    // 生成唯一Token
    const token = crypto.randomBytes(16).toString('hex');
    // 设置Token有效期为7天（秒）
    const expiresInSeconds = 7 * 24 * 60 * 60;
    const expires = new Date(Date.now() + expiresInSeconds * 1000);
    
    // 存储Token到Redis
    const redisKey = `group_invite_token:${token}`;
    await redisClient.setEx(redisKey, expiresInSeconds, JSON.stringify({
      groupId: groupId,
      createdBy: userId
    }));
    
    res.json({ status: 'success', token, expires });
  } catch (err) {
    console.error('生成群组邀请Token失败:', err.message);
    res.status(500).json({ status: 'error', message: '生成邀请Token失败' });
  }
});

// 验证群组邀请Token
app.get('/api/validate-group-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // 从Redis读取Token
    const redisKey = `group_invite_token:${token}`;
    const tokenData = await redisClient.get(redisKey);
    
    if (!tokenData) {
      return res.status(400).json({ status: 'error', message: '无效或过期的邀请Token' });
    }
    
    const { groupId } = JSON.parse(tokenData);
    
    // 获取群组信息
    const [groups] = await pool.execute(
      'SELECT id, name, description FROM chat_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );
    
    if (!groups || groups.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }
    
    res.json({ status: 'success', group: groups[0] });
  } catch (err) {
    console.error('验证群组邀请Token失败:', err.message);
    res.status(500).json({ status: 'error', message: '验证邀请Token失败' });
  }
});

// 使用Token加入群组
app.post('/api/join-group-with-token', async (req, res) => {
  try {
    const { token, isFromGroupCard } = req.body;
    const userId = req.userId;
    
    if (!token) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }
    
    // 从Redis读取Token
    const redisKey = `group_invite_token:${token}`;
    const tokenData = await redisClient.get(redisKey);
    
    if (!tokenData) {
      return res.status(400).json({ status: 'error', message: '无效或过期的邀请Token' });
    }
    
    const { groupId } = JSON.parse(tokenData);
    
    // 获取群组信息
    const [group] = await pool.execute(
      'SELECT id, name, avatar_url FROM chat_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );
    
    if (!group || group.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }
    
    // 检查用户是否已经是群组成员
    const [members] = await pool.execute(
      'SELECT id, deleted_at FROM chat_group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );
    
    if (members && members.length > 0) {
      if (members[0].deleted_at === null) {
        return res.status(400).json({ status: 'error', message: '你已经是该群组成员' });
      }
    }
    
    // 获取用户信息
    const [userInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
      [userId]
    );
    
    // 执行加入操作，总是创建新记录
    await pool.execute(
      'INSERT INTO chat_group_members (group_id, user_id, joined_at) VALUES (?, ?, NOW())',
      [groupId, userId]
    );
    
    // 让用户加入群组房间
    const allOnlineUsers = await getAllOnlineUsers();
    for (const onlineUser of allOnlineUsers) {
      if (String(onlineUser.id) === String(userId)) {
        const userSocket = io.sockets.sockets.get(onlineUser.socketId);
        if (userSocket) {
          userSocket.join(`group_${groupId}`);
        }
      }
    }
    
    // 插入类型100的系统消息
    const now = new Date();
    let joinContent;
    if (isFromGroupCard) {
      joinContent = `${userInfo[0]?.nickname || '用户'}通过群名片加入了群组`;
    } else {
      joinContent = `${userInfo[0]?.nickname || '用户'}加入了群组`;
    }
    const [insertResult] = await pool.execute(
      'INSERT INTO chat_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [userId, joinContent, 100, groupId]
    );

    // 构建100类型消息对象
    const type100Message = {
      id: insertResult.insertId,
      userId: userId,
      nickname: userInfo[0]?.nickname || '',
      avatarUrl: userInfo[0]?.avatar_url || '',
      content: joinContent,
      at_userid: null,
      messageType: 100,
      groupId: groupId,
      timestamp: now.getTime(),
      timestampISO: now.toISOString()
    };

    // 向所有群组成员发送100类型消息（用户已经加入房间了）
    io.to(`group_${groupId}`).emit('message-received', type100Message);
    
    // 同时也向新成员的用户房间发送，确保他们能收到
    io.to(`user_${userId}`).emit('message-received', type100Message);
    
    // 向新成员单独发送被添加到群组的事件，包含群组信息
    io.to(`user_${userId}`).emit('added-to-group', {
      groupId: groupId,
      groupName: group[0].name,
      groupAvatarUrl: group[0].avatar_url || ''
    });
    
    // 发送群组加入通知
    io.to(`group_${groupId}`).emit('member-joined', { groupId, userId });
    
    res.json({ status: 'success', message: '成功加入群组' });
  } catch (err) {
    console.error('使用Token加入群组失败:', err.message);
    res.status(500).json({ status: 'error', message: '加入群组失败' });
  }
});

// 用户退出群组接口
app.post('/api/leave-group', async (req, res) => {
  try {
    const { groupId } = req.body;
    const userId = req.userId;

    // 验证参数
    if (!groupId) {
      return res.status(400).json({ success: false, message: '参数错误' });
    }

    // 检查群组是否存在
    const [group] = await pool.execute(
      'SELECT id, name, creator_id FROM chat_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ success: false, message: '群组不存在' });
    }

    // 检查成员是否在群组中
    const [member] = await pool.execute(
      'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
      [groupId, userId]
    );

    if (!member || member.length === 0) {
      return res.status(404).json({ success: false, message: '你不在该群组中' });
    }

    // 不能退出自己是群主的群组
    if (parseInt(group[0].creator_id) === parseInt(userId)) {
      return res.status(400).json({ success: false, message: '群主不能退出群组，请先转让群主或解散群组' });
    }

    // 获取用户信息
    const [userInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
      [userId]
    );

    // 先广播类型100的系统消息：XXX退出了群组
    const now = new Date();
    const leaveContent = `${userInfo[0]?.nickname || '用户'}退出了群组`;
    const [insertResult] = await pool.execute(
      'INSERT INTO chat_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [userId, leaveContent, 100, groupId]
    );

    // 构建100类型消息对象
    const type100Message = {
      id: insertResult.insertId,
      userId: userId,
      nickname: userInfo[0]?.nickname || '',
      avatarUrl: userInfo[0]?.avatar_url || '',
      content: leaveContent,
      at_userid: null,
      messageType: 100,
      groupId: groupId,
      timestamp: now.getTime(),
      timestampISO: now.toISOString()
    };

    // 向所有群组成员发送100类型消息（先广播）
    io.to(`group_${groupId}`).emit('message-received', type100Message);
    
    // 同时也向退出的成员的用户房间发送，确保他们能收到
    io.to(`user_${userId}`).emit('message-received', type100Message);

    // 执行退出操作 - 逻辑删除，只记录deleted_at（加1秒）
    const deletedAt = new Date(Date.now() + 1000);
    await pool.execute(
      'UPDATE chat_group_members SET deleted_at = ? WHERE group_id = ? AND user_id = ?',
      [deletedAt, groupId, userId]
    );

    // 向所有群组成员广播成员退出事件
    io.to(`group_${groupId}`).emit('member-removed', { groupId, memberId: userId });
    
    // 也通知退出的成员
    io.to(`user_${userId}`).emit('member-removed', { groupId, memberId: userId });
    
    res.json({ success: true, message: '成功退出群组' });
  } catch (err) {
    console.error('退出群组失败:', err.message);
    res.status(500).json({ success: false, message: '退出群组失败' });
  }
});

// 文件上传接口 - 修改：支持'file'和'image'字段名
app.post('/api/upload', checkFileRequestLimit, upload.fields([{ name: 'file' }, { name: 'image' }]), async (req, res) => {
  try {
    let uploadedFile;
    if (req.files && req.files.file && req.files.file.length > 0) {
      uploadedFile = req.files.file[0];
    } else if (req.files && req.files.image && req.files.image.length > 0) {
      uploadedFile = req.files.image[0];
    }
    
    if (!uploadedFile) {
      const filename = req.body.filename || '';
      const ext = path.extname(filename).toLowerCase();
      const prohibitedExts = ['.php', '.php3', '.php4', '.php5', '.phtml', '.phar'];
      if (prohibitedExts.includes(ext)) {
        return res.status(400).json({ status: 'error', message: '禁止上传PHP文件' });
      }
      return res.status(400).json({ status: 'error', message: '没有上传文件' });
    }

    const { userId, groupId, fileType, privateChat, at_userid } = req.body;

    const sessionUserId = req.userId;
    if (parseInt(userId) !== parseInt(sessionUserId)) {
      return res.status(403).json({ status: 'error', message: '无权操作此用户' });
    }

    const [users] = await pool.execute(
        'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
        [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: '用户不存在' });
    }

    const user = users[0];
    const fileUrl = `/uploads/${uploadedFile.filename}`;
    // 获取原始文件名，确保正确解码UTF-8编码
    let originalFilename = uploadedFile.originalname;
    try {
      originalFilename = decodeURIComponent(escape(originalFilename));
    } catch (e) {
      // 如果解码失败，保留原始名称
    }
    
    // 如果是私信聊天，直接返回文件URL，不创建聊天消息
    if (privateChat === 'true' || privateChat === true) {
      return res.json({
        status: 'success',
        message: '文件上传成功',
        url: fileUrl,
        filename: originalFilename
      });
    }
    
    // 判断是否为图片文件
    const isImage = uploadedFile.mimetype.startsWith('image/') || fileType === 'image';
    
    // 根据文件类型生成相应的JSON内容和消息类型
    let content, messageType, insertQuery, insertParams, newMessage;
    // 转换groupId为安全整数类型
    const safeGroupId = groupId ? parseInt(groupId) : null;
    if (isImage) {
      // 图片上传 - 使用JSON格式存储在content字段中，消息类型为1
      // 读取前端传递的图片宽高参数
      const imageWidth = req.body.width ? parseInt(req.body.width) : undefined;
      const imageHeight = req.body.height ? parseInt(req.body.height) : undefined;
      
      // 创建图片内容对象，包含url和宽高参数
      const imageContent = { url: fileUrl };
      if (imageWidth && imageHeight) {
        imageContent.width = imageWidth;
        imageContent.height = imageHeight;
      }
      
      content = JSON.stringify(imageContent);
      messageType = 1;
      
      insertQuery = 'INSERT INTO chat_messages (user_id, content, at_userid, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, ?, NOW())';
      insertParams = [userId, content, at_userid ? JSON.stringify(at_userid) : null, messageType, safeGroupId || null];
      
      newMessage = {
        id: null, // 稍后设置
        userId,
        nickname: user.nickname,
        avatarUrl: user.avatar_url,
        content: content,
        at_userid: at_userid,
        messageType: messageType,
        groupId: safeGroupId || null,
        timestamp: null, // 稍后设置
        timestampISO: null, // 稍后设置
        imageUrl: fileUrl, // 直接设置imageUrl字段，方便前端使用
        width: imageWidth, // 添加宽高字段
        height: imageHeight
      };
    } else {
      // 文件上传 - 使用JSON格式存储在content字段中，消息类型为2
      content = JSON.stringify({ url: fileUrl, filename: originalFilename });
      messageType = 2;
      
      insertQuery = 'INSERT INTO chat_messages (user_id, content, at_userid, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, ?, NOW())';
      insertParams = [userId, content, at_userid ? JSON.stringify(at_userid) : null, messageType, safeGroupId || null];
      
      newMessage = {
        id: null, // 稍后设置
        userId,
        nickname: user.nickname,
        avatarUrl: user.avatar_url,
        content: content,
        at_userid: at_userid,
        messageType: messageType,
        groupId: safeGroupId || null,
        timestamp: null, // 稍后设置
        timestampISO: null // 稍后设置
      };
    }

    // 插入消息到数据库
    const [result] = await pool.execute(insertQuery, insertParams);

    // 获取当前精确时间戳（保持与普通消息一致的格式）
    const now = new Date();
    const timestamp = now.toISOString(); // ISO格式时间戳
    const timestampMs = now.getTime(); // 毫秒级时间戳

    // 设置消息ID和时间戳
    newMessage.id = result.insertId;
    newMessage.timestamp = timestampMs;
    newMessage.timestampISO = timestamp;

    if (safeGroupId) {
      io.to(`group_${safeGroupId}`).emit('message-received', newMessage);
      
  } else {
      // 只发送给已认证的用户（发送过 user-joined 事件的用户）
      const allOnlineUsers = await getAllOnlineUsers();
      for (const onlineUser of allOnlineUsers) {
        if (await isAuthenticatedUser(onlineUser.id)) {
          const socket = io.sockets.sockets.get(onlineUser.socketId);
          if (socket) {
            socket.emit('message-received', newMessage);
          }
        }
      }
    }

    // 根据文件类型返回正确的URL
    if (isImage) {
      res.json({ status: 'success', imageUrl: fileUrl });
    } else {
      res.json({ status: 'success', fileUrl: fileUrl, filename: originalFilename });
    }
  } catch (err) {
    console.error('文件上传失败:', err.message);
    res.status(500).json({ status: 'error', message: '文件上传失败' });
  }
});

// 静态文件服务
app.use('/uploads', express.static(uploadDir));
app.use('/avatars', (req, res, next) => {
  res.set('Cache-Control', 'public, max-age=31536000');
  express.static(avatarDir)(req, res, next);
});

// 在线用户管理（使用 Redis）
// 存储在 Redis key: scr:online_users (Hash: socketId -> userData)

// 添加在线用户
async function addOnlineUser(socketId, userData) {
  try {
    await redisClient.hSet('scr:online_users', socketId, JSON.stringify(userData));
  } catch (err) {
    console.error('添加在线用户失败:', err.message);
  }
}

// 移除在线用户
async function removeOnlineUser(socketId) {
  try {
    await redisClient.hDel('scr:online_users', socketId);
  } catch (err) {
    console.error('移除在线用户失败:', err.message);
  }
}

// 获取在线用户
async function getOnlineUser(socketId) {
  try {
    const userData = await redisClient.hGet('scr:online_users', socketId);
    return userData ? JSON.parse(userData) : null;
  } catch (err) {
    console.error('获取在线用户失败:', err.message);
    return null;
  }
}

// 获取所有在线用户
async function getAllOnlineUsers() {
  try {
    const users = await redisClient.hGetAll('scr:online_users');
    const result = [];
    for (const socketId in users) {
      result.push({ socketId, ...JSON.parse(users[socketId]) });
    }
    return result;
  } catch (err) {
    console.error('获取所有在线用户失败:', err.message);
    return [];
  }
}

// 获取在线用户数量
async function getOnlineUserCount() {
  try {
    return await redisClient.hLen('scr:online_users');
  } catch (err) {
    console.error('获取在线用户数量失败:', err.message);
    return 0;
  }
}

// 更新在线用户数据
async function updateOnlineUser(socketId, updates) {
  try {
    const userData = await getOnlineUser(socketId);
    if (userData) {
      const updatedUser = { ...userData, ...updates };
      await redisClient.hSet('scr:online_users', socketId, JSON.stringify(updatedUser));
      return updatedUser;
    }
    return null;
  } catch (err) {
    console.error('更新在线用户失败:', err.message);
    return null;
  }
}

// 按用户ID更新所有在线用户数据
async function updateOnlineUserByUserId(userId, updates) {
  try {
    const users = await redisClient.hGetAll('scr:online_users');
    for (const socketId in users) {
      const userData = JSON.parse(users[socketId]);
      if (String(userData.id) === String(userId)) {
        const updatedUser = { ...userData, ...updates };
        await redisClient.hSet('scr:online_users', socketId, JSON.stringify(updatedUser));
      }
    }
  } catch (err) {
    console.error('按用户ID更新在线用户失败:', err.message);
  }
}

// 检查用户是否在线
async function isUserOnline(socketId) {
  try {
    return await redisClient.hExists('scr:online_users', socketId);
  } catch (err) {
    console.error('检查用户是否在线失败:', err.message);
    return false;
  }
}

// 已认证用户管理（使用 socket.io 原生房间）
// 房间名：authenticated_users

// 添加已认证用户到房间
async function addAuthenticatedUser(userId, socket) {
  try {
    // 添加到 Redis Set（保留用于兼容性检查）
    await redisClient.sAdd('scr:authenticated_users', String(userId));
    // 添加到 socket.io 房间
    if (socket) {
      socket.join('authenticated_users');
    }
  } catch (err) {
    console.error('添加已认证用户失败:', err.message);
  }
}

// 从房间移除已认证用户
async function removeAuthenticatedUser(userId, socket) {
  try {
    // 从 Redis Set 移除
    await redisClient.sRem('scr:authenticated_users', String(userId));
    // 从 socket.io 房间移除
    if (socket) {
      socket.leave('authenticated_users');
    }
  } catch (err) {
    console.error('移除已认证用户失败:', err.message);
  }
}

// 检查用户是否已认证
async function isAuthenticatedUser(userId) {
  try {
    return await redisClient.sIsMember('scr:authenticated_users', String(userId));
  } catch (err) {
    console.error('检查已认证用户失败:', err.message);
    return false;
  }
}

// Socket.IO 连接处理 - 修改：移除会话过期检查
// Socket.IO IP封禁验证函数
async function validateSocketIP(socket, next) {
  try {
    // 首先尝试从x-forwarded-for头获取真实IP
    let clientIP = socket.handshake.address;
    
    // 处理代理情况，获取真实IP
    if (socket.handshake.headers && socket.handshake.headers['x-forwarded-for']) {
      const forwardedFor = socket.handshake.headers['x-forwarded-for'].trim();
      const ips = forwardedFor.split(',');
      // 取第一个IP地址，并去除空格
      clientIP = ips[0].trim();
    }
    
    // 处理IPv6地址，转换为IPv4格式（如果是localhost的话）
    if (clientIP === '::1') {
      clientIP = '127.0.0.1';
    } else if (clientIP && clientIP.startsWith('::ffff:')) {
      // 处理IPv6格式的IPv4地址，例如::ffff:192.168.1.1
      clientIP = clientIP.slice(7);
    }
    
    // console.log(`🔍 [Socket.IO] IP验证开始: ${clientIP}`);
    
    // 检查IP是否被封禁，使用isIPBanned函数检查，该函数会考虑封禁过期时间
    const banInfo = await isIPBanned(clientIP);
    
    if (banInfo.isBanned) {
      // 构建封禁消息
      let message = '您的IP已被封禁，无法访问';
      if (banInfo.reason) {
        message += `，原因：${banInfo.reason}`;
      }
      
      // console.log(`🚫 [Socket.IO] IP被封禁: ${clientIP}, 原因: ${banInfo.reason}, 剩余封禁时间: ${banInfo.remainingTime ? JSON.stringify(banInfo.remainingTime) : '永久'}`);
      // 发送详细的封禁信息，包括剩余封禁时间和封禁原因
      socket.emit('account-banned', {
        message: message,
        ipAddress: clientIP,
        isBanned: true,
        reason: banInfo.reason,
        remainingTime: banInfo.remainingTime,
        status: 'error'
      });
      socket.disconnect();
      return false;
    }
    
    // console.log(`✅ [Socket.IO] IP验证通过: ${clientIP}`);
    return true;
  } catch (error) {
    // 确保clientIP在错误处理中也能正确获取
    let clientIP = socket.handshake.address;
    if (socket.handshake.headers && socket.handshake.headers['x-forwarded-for']) {
      const forwardedFor = socket.handshake.headers['x-forwarded-for'].trim();
      const ips = forwardedFor.split(',');
      clientIP = ips[0].trim();
    }
    // console.error('❌ [Socket.IO] IP验证错误:', clientIP, error.message);
    socket.emit('error', { message: '服务器错误' });
    socket.disconnect();
    return false;
  }
}

// 强制断开用户连接并清理
async function forceDisconnectUser(socket, reason = 'session-expired', originalEventName = null, originalEventData = null) {
  // 如果是 session-expired，只发送事件，不做其他清理操作
  if (reason === 'session-expired') {
    // 发送事件，带上原始事件信息
    if (originalEventName && originalEventData) {
      socket.emit(reason, {
        originalEventName: originalEventName,
        originalEventData: originalEventData
      });
    } else {
      socket.emit(reason);
    }
  } else {
    // 其他原因（如 account-logged-in-elsewhere）继续断开连接
    // 从在线用户列表中移除
    const user = await getOnlineUser(socket.id);
    if (user) {
      await removeOnlineUser(socket.id);
      await removeAuthenticatedUser(user.id);
      
      // 更新用户最后在线时间
      try {
        await pool.execute(
          'UPDATE chat_users SET last_online = NOW() WHERE id = ?',
          [user.id]
        );
      } catch (err) {
        console.error('更新用户最后上线时间失败:', err.message);
      }
      
      // 广播更新后的用户列表
      const onlineUsersList = await getAllOnlineUsers();
      const onlineUsersArray = onlineUsersList.map(u => ({
        id: u.id,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        isOnline: true
      }));

      const onlineUserIds = new Set(onlineUsersArray.map(u => u.id));
      
      const [offlineUsersData] = await pool.execute(`
        SELECT id, nickname, last_online, avatar_url as avatarUrl 
        FROM chat_users 
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

      // 只向已认证用户广播用户列表
      io.to('authenticated_users').emit('users-list', {
        online: onlineUsersArray,
        offline: offlineUsersArray
      });
    }
    
    // 发送事件并断开连接
    socket.emit(reason);
    socket.disconnect(true);
  }
}

// Socket.IO会话验证中间件（包含IP验证）
async function validateSocketPacket(socket, [eventName, ...args]) {
  // 首先验证IP
  const ipValid = await validateSocketIP(socket);
  if (!ipValid) {
    throw new Error('IP验证失败');
  }
  
  // 不需要验证的事件列表
  const excludedEvents = ['disconnect', 'error'];
  if (excludedEvents.includes(eventName)) {
    return true;
  }
  
  const data = args[0] || {};
  const userData = data;
  
  // 检查用户ID是否被封禁
  if (userData.userId) {
    const userBanInfo = await isUserBanned(String(userData.userId));
    if (userBanInfo.isBanned) {
      let message = '您的账号已被封禁，无法访问';
      if (userBanInfo.reason) {
        message += `，原因：${userBanInfo.reason}`;
      }
      
      socket.emit('account-banned', {
        message: message,
        userId: userData.userId,
        isBanned: true,
        reason: userBanInfo.reason,
        remainingTime: userBanInfo.remainingTime,
        status: 'error'
      });
      socket.disconnect();
      throw new Error('账号被封禁');
    }
  }
  
  // user-joined 事件可以跳过认证列表检查
  const skipAuthCheck = eventName === 'user-joined';
  
  // 检查用户是否在Redis已认证列表中（除非跳过检查）
  if (!skipAuthCheck && userData.userId) {
    const isAuth = await isAuthenticatedUser(parseInt(userData.userId));
    if (!isAuth) {
      await forceDisconnectUser(socket, 'session-expired', eventName, data);
      throw new Error('会话过期');
    }
  }
  
  // 然后验证会话（如果有用户数据）
  if (userData.userId || userData.sessionToken) {
    if (!userData.userId || !userData.sessionToken) {
      await forceDisconnectUser(socket, 'session-expired', eventName, data);
      throw new Error('会话无效');
    }

    const session = await getUserSession(parseInt(userData.userId));
    if (!session || session.token !== userData.sessionToken) {
      await forceDisconnectUser(socket, 'session-expired', eventName, data);
      throw new Error('会话无效');
    }
  }
  
  // 验证通过
  return true;
}

io.on('connection', (socket) => {
  // 为每个连接的 socket 设置数据包验证中间件
  socket.use(async (packet, next) => {
    try {
      await validateSocketPacket(socket, packet);
      next();
    } catch (err) {
      next(err);
    }
  });



  // 用户加入聊天室
  socket.on('user-joined', async (userData) => {
      try {
        // 确保用户 ID 是数字类型，防止 SQL 注入
        const userId = parseInt(userData.userId);
        if (isNaN(userId)) {
          console.error('❌ 无效的用户 ID:', userData.userId);
          await forceDisconnectUser(socket, 'session-expired');
          return;
        }
        
        // 加入用户自己的房间，用于接收私人和群组通知
        socket.join(`user_${userId}`);
        
        // 加入用户的所有群组房间
        try {
          const [userGroups] = await pool.execute(
            'SELECT group_id FROM chat_group_members WHERE user_id = ? AND deleted_at IS NULL',
            [userId]
          );
          
          for (const group of userGroups) {
            socket.join(`group_${group.group_id}`);
            // console.log(`✅ 用户 ${userId} 加入群组房间: group_${group.group_id}`);
          }
        } catch (err) {
          console.error('❌ 获取用户群组列表失败:', err.message);
        }
        
        // 获取客户端IP并加入IP房间，用于接收IP封禁通知
        let clientIP = socket.handshake.headers['x-forwarded-for'];
        if (!clientIP) {
          clientIP = socket.handshake.headers['x-real-ip'];
        }
        if (!clientIP) {
          clientIP = socket.handshake.address || socket.conn.remoteAddress;
        }
        // 取第一个IP（如果有多个）
        if (clientIP && clientIP.includes(',')) {
          clientIP = clientIP.split(',')[0].trim();
        }
        // 处理IPv6格式
        let processedIP = clientIP;
        if (processedIP === '::1') {
          processedIP = '127.0.0.1';
        } else if (processedIP && processedIP.startsWith('::ffff:')) {
          processedIP = processedIP.slice(7);
        }
        if (processedIP) {
          socket.join(`ip_${processedIP}`);
        }
        
        // 从数据库中获取真实的用户信息
        const [users] = await pool.execute(
            'SELECT nickname, avatar_url as avatarUrl, gender FROM chat_users WHERE id = ?',
            [userId]
        );
        
        if (users.length === 0) {
          console.error('❌ 用户不存在:', userId);
          socket.emit('error', { message: '用户不存在' });
          socket.emit('session-expired');
          socket.disconnect(true);
          return;
        }
        
        const user = users[0];
        const { nickname, avatarUrl, gender } = user;
    
        // 检查用户是否已经在线，如果在线则移除旧连接
        const allOnlineUsers = await getAllOnlineUsers();
        let isExistingUser = false;
        for (const onlineUser of allOnlineUsers) {
          if (String(onlineUser.id) === String(userId)) {
            await removeOnlineUser(onlineUser.socketId);
            isExistingUser = true;
            break;
          }
        }
    
        // 存储用户信息（使用数据库中的真实信息）
        await addOnlineUser(socket.id, {
          id: userId,
          nickname: nickname,
          socketId: socket.id,
          avatarUrl: avatarUrl,
          gender: gender,
          sessionToken: userData.sessionToken
        });
    
        // 将用户添加到已认证集合和房间，只有发送过 user-joined 的用户才能收到主聊天室消息
        await addAuthenticatedUser(userId, socket);
    
        // 更新用户最后在线时间
        await pool.execute(
            'UPDATE chat_users SET last_online = NOW() WHERE id = ?',
            [userId]
        );

        // 记录用户加入事件到chat_ip_logs
        try {
          // 从nginx代理头获取真实客户端IP
          let clientIP = socket.handshake.headers['x-forwarded-for'];
          if (!clientIP) {
            clientIP = socket.handshake.headers['x-real-ip'];
          }
          if (!clientIP) {
            clientIP = socket.handshake.address || 'unknown';
          }
          // 取第一个IP（如果有多个）
          if (clientIP && clientIP.includes(',')) {
            clientIP = clientIP.split(',')[0].trim();
          }
          await pool.execute(
            'INSERT INTO chat_ip_logs (user_id, ip_address, action) VALUES (?, ?, ?)',
            [userId, clientIP, 'check_status']
          );
          // 清理旧记录，保持最多6000条
          await pool.execute(
            'DELETE FROM chat_ip_logs WHERE id NOT IN (SELECT id FROM (SELECT id FROM chat_ip_logs ORDER BY timestamp DESC LIMIT 6000) AS tmp)'
          );
        } catch (logErr) {
          // 记录失败不影响主要功能
        }

        // 广播更新后的用户列表
        const onlineUsersList = await getAllOnlineUsers();
        const onlineUsersArray = onlineUsersList.map(user => ({
          id: user.id,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          isOnline: true
        }));

        const onlineUserIds = new Set(onlineUsersArray.map(u => u.id));
        
        const [offlineUsersData] = await pool.execute(`
          SELECT id, nickname, last_online, avatar_url as avatarUrl 
          FROM chat_users 
          WHERE last_online IS NOT NULL 
          AND last_online >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          ORDER BY last_online DESC
        `);

        const offlineUsersArray = offlineUsersData
          .filter(user => !onlineUserIds.has(user.id))
          .map(user => ({
            id: user.id,
            nickname: user.nickname,
            avatarUrl: user.avatarUrl,
            isOnline: false,
            lastOnline: user.last_online
          }));

        // 只向已认证用户广播用户列表
        io.to('authenticated_users').emit('users-list', {
          online: onlineUsersArray,
          offline: offlineUsersArray
        });

        // 发送加入确认事件
        socket.emit('user-joined-confirmed', {
          success: true,
          userId: userId
        });
    
      } catch (err) {
        console.error('❌ 处理用户加入时出错:', err.message);
        socket.emit('error', { message: '加入聊天室失败' });
      }
    });



  // 发送消息
  socket.on('send-message', async (messageData) => {
      try {
        const { userId, content, groupId, sessionToken, at_userid } = messageData;
    
        // console.log('💬 发送消息请求:', {
        //   userId: userId,
        //   groupId: groupId,
        //   contentLength: content ? content.length : 0
        // });
    
        // 速率限制检查
        const rateLimitResult = await checkRateLimit(userId);
        if (!rateLimitResult.allowed) {
          // 通过 message-sent 事件返回速率限制错误
          socket.emit('message-sent', { 
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: `发送消息过于频繁，请${rateLimitResult.retryAfter}秒后再试`,
              retryAfter: rateLimitResult.retryAfter
            }
          });
          return;
        }
    
        // 验证消息内容...
        if (!validateMessageContent(content)) {
          console.error('❌ 消息内容格式错误或超过 10000 字符限制');
          socket.emit('error', { message: '消息内容格式错误或超过 10000 字符限制' });
          return;
        }
    
        // 如果是群组消息，验证用户是否在群组中
        if (groupId) {
          // 先检查群组是否存在，并获取群主信息和删除状态
          const [groupCheck] = await pool.execute(
            'SELECT id, creator_id, deleted_at FROM chat_groups WHERE id = ?',
            [parseInt(groupId)]
          );
          
          if (groupCheck.length === 0) {
            socket.emit('message-sent', { 
              success: false,
              error: {
                code: 'GROUP_NOT_FOUND',
                message: '群组不存在'
              }
            });
            return;
          }
          
          const groupInfo = groupCheck[0];
          
          // 检查群组是否已被删除
          if (groupInfo.deleted_at !== null) {
            socket.emit('message-sent', { 
              success: false,
              error: {
                code: 'GROUP_DELETED',
                message: '该群组已被解散，无法发送消息'
              }
            });
            return;
          }
          
          const [memberCheck] = await pool.execute(
            'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
            [parseInt(groupId), parseInt(userId)]
          );
          
          if (memberCheck.length === 0) {
            socket.emit('message-sent', { 
              success: false,
              error: {
                code: 'NOT_IN_GROUP',
                message: '您不在该群组中，无法发送消息'
              }
            });
            return;
          }
          
          // 检查是否包含 @全体成员 (-1)，只有群主才能发送
          if (at_userid && Array.isArray(at_userid)) {
            const hasAllMemberAt = at_userid.some(id => String(id) === '-1');
            if (hasAllMemberAt) {
              const isOwner = String(groupInfo.creator_id) === String(userId);
              if (!isOwner) {
                socket.emit('message-sent', { 
                  success: false,
                  error: {
                    code: 'NOT_GROUP_OWNER',
                    message: '只有群主才能@全体成员'
                  }
                });
                return;
              }
            }
          }
        }
    
        // 获取用户信息...
        const [users] = await pool.execute(
            'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
            [userId]
        );
    
        if (users.length === 0) {
          console.error('❌ 用户不存在:', userId);
          socket.emit('error', { message: '用户不存在' });
          return;
        }
    
        const user = users[0];
    
        // 不进行严格转义，保持原始内容格式，让前端处理安全的解析和链接显示
        const cleanContent = content;

        // 获取当前精确时间戳（毫秒级和ISO格式）
        const now = new Date();
        const timestamp = now.toISOString(); // 重新添加ISO格式时间戳，用于前端显示
        const timestampMs = now.getTime();

        // 插入消息到数据库（使用MySQL的NOW()函数而不是JavaScript生成的ISO格式时间）
        // 使用前端发送的消息类型，默认为文字消息类型
        const messageType = messageData.message_type || messageData.messageType || 0;
        
        const messageContent = cleanContent;
        
        const [result] = await pool.execute(
            'INSERT INTO chat_messages (user_id, content, at_userid, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, ?, NOW())',
            [userId, messageContent, at_userid ? JSON.stringify(at_userid) : null, messageType, groupId || null]
        );
        
        // 广播消息 - 使用已经过HTML转义的内容
        const newMessage = {
          id: result.insertId,
          userId,
          nickname: user.nickname,
          avatarUrl: user.avatar_url,
          content: messageContent,
          at_userid: at_userid,
          messageType: messageType,
          groupId: groupId ? parseInt(groupId) : null,
          timestamp: timestampMs,
          timestampISO: timestamp
        };
    
        // console.log('📢 准备广播消息:', {
        //   messageId: newMessage.id,
        //   groupId: newMessage.groupId,
        //   hasGroup: !!groupId
        // });
    
        // 处理图片消息：从content字段解析图片URL
        if (messageType === 1 && cleanContent) {
          try {
            const contentData = JSON.parse(cleanContent);
            if (contentData.url) {
              newMessage.imageUrl = contentData.url;
            }
          } catch (error) {
            console.error(`❌ 解析图片消息失败: 消息ID=${result.insertId}, 错误=${error.message}`);
          }
        }
        
        if (groupId) {
          // 确保groupId是字符串类型，避免Map键类型不一致
          const groupIdStr = String(groupId);
          
          // 群组消息：使用 socket.to() 广播给群组房间，避开发送者
          try {
            socket.to(`group_${groupId}`).emit('message-received', newMessage);
          } catch (directSendErr) {
            console.error('发送群组消息失败:', directSendErr.message);
          }
          

          
        } else {
          // 全局消息：发送给所有用户（避开发送者）
          // 遍历所有在线用户，跳过发送者
          const allOnlineUsers = await getAllOnlineUsers();
          for (const onlineUser of allOnlineUsers) {
            // 跳过消息发送者
            if (String(onlineUser.id) === String(userId)) {
              continue;
            }
            const socket = io.sockets.sockets.get(onlineUser.socketId);
            if (socket) {
              socket.emit('message-received', newMessage);
            }
          }

        }
    
        // 确认消息已发送，只给发送者发送确认事件
        socket.emit('message-sent', { messageId: result.insertId, message: newMessage });
    
      } catch (err) {
        console.error('❌ 保存消息失败:', err.message);
        socket.emit('error', { message: '发送消息失败' });
      }
    });

  // 发送私信
  socket.on('send-private-message', async (messageData) => {
    try {
      const { userId, content, receiverId, sessionToken, at_userid } = messageData;

      // 速率限制检查
      const rateLimitResult = await checkRateLimit(userId);
      if (!rateLimitResult.allowed) {
        // 通过 private-message-sent 事件返回速率限制错误
        socket.emit('private-message-sent', { 
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `发送消息过于频繁，请${rateLimitResult.retryAfter}秒后再试`,
            retryAfter: rateLimitResult.retryAfter
          }
        });
        return;
      }

      // 验证消息内容
      if (!validateMessageContent(content)) {
        console.error('❌ 消息内容格式错误或超过 10000 字符限制');
        socket.emit('error', { message: '消息内容格式错误或超过 10000 字符限制' });
        return;
      }

      // 获取用户信息
      const [users] = await pool.execute(
          'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
          [userId]
      );

      if (users.length === 0) {
        console.error('❌ 用户不存在:', userId);
        socket.emit('error', { message: '用户不存在' });
        return;
      }

      const user = users[0];

      // 验证对方是否是自己的好友，并检查是否已删除
      const [friendCheck] = await pool.query(
        'SELECT id, deleted_at FROM chat_friends WHERE user_id = ? AND friend_id = ?',
        [parseInt(userId), parseInt(receiverId)]
      );
      
      if (friendCheck.length === 0) {
        socket.emit('private-message-sent', { 
          success: false,
          error: {
            code: 'NOT_FRIEND',
            message: '对方不是您的好友，无法发送消息'
          }
        });
        return;
      }
      
      // 检查好友关系是否已被删除
      if (friendCheck[0].deleted_at !== null) {
        socket.emit('private-message-sent', { 
          success: false,
          error: {
            code: 'FRIEND_DELETED',
            message: '该好友关系已被删除，无法发送消息'
          }
        });
        return;
      }

      // 不进行严格转义，保持原始内容格式，让前端处理安全的解析和链接显示
      const cleanContent = content;

      // 获取当前精确时间戳（毫秒级和ISO格式）
      const now = new Date();
      const timestamp = now.toISOString(); // 重新添加ISO格式时间戳，用于前端显示
      const timestampMs = now.getTime();

      // 插入私信到数据库
      const messageType = messageData.message_type || messageData.messageType || 0;
      
      const messageContent = cleanContent;
      
      const [result] = await pool.execute(
          'INSERT INTO chat_private_messages (sender_id, receiver_id, content, at_userid, message_type, is_read, timestamp) VALUES (?, ?, ?, ?, ?, 0, NOW())',
          [userId, receiverId, messageContent, at_userid ? JSON.stringify(at_userid) : null, messageType]
      );

      // 构建私信消息对象
      const newMessage = {
        id: result.insertId,
        senderId: userId,
        receiverId: receiverId,
        senderNickname: user.nickname,
        senderAvatarUrl: user.avatar_url,
        content: messageContent,
        at_userid: at_userid,
        messageType: messageType,
        isRead: 0,
        timestamp: timestampMs,
        timestampISO: timestamp
      };

      // 处理图片消息：从content字段解析图片URL
      if (messageType === 1 && cleanContent) {
        try {
          const contentData = JSON.parse(cleanContent);
          if (contentData.url) {
            newMessage.imageUrl = contentData.url;
          }
        } catch (error) {
          console.error(`❌ 解析图片消息失败: 消息ID=${result.insertId}, 错误=${error.message}`);
        }
      }

      // 发送私信给接收者
      io.to(`user_${parseInt(receiverId)}`).emit('private-message-received', newMessage);

      // 确认私信已发送，只给发送者发送确认事件（不再发送 private-message-received 给发送者）
      socket.emit('private-message-sent', { messageId: result.insertId, message: newMessage });

    } catch (err) {
      console.error('❌ 保存私信失败:', err.message);
      socket.emit('error', { message: '发送私信失败' });
    }
  });
  
  // 撤回私信消息
  socket.on('delete-private-message', async (data) => {
    try {
      const { userId, messageId, sessionToken } = data;
      
      // 速率限制检查
      const rateLimitResult = await checkRateLimit(userId);
      if (!rateLimitResult.allowed) {
        socket.emit('error', { 
          message: `操作过于频繁，请${rateLimitResult.retryAfter}秒后再试`
        });
        return;
      }
      
      // 获取消息详情
      const [messages] = await pool.execute(
        'SELECT id, sender_id, receiver_id, content, message_type FROM chat_private_messages WHERE id = ?',
        [messageId]
      );
      
      if (messages.length === 0) {
        // console.error('❌ 消息不存在:', messageId);
        socket.emit('error', { message: '消息不存在' });
        return;
      }
      
      const message = messages[0];
      const numericUserId = parseInt(userId);
      
      // 检查是否是消息发送者
      if (numericUserId !== message.sender_id) {
        console.error('❌ 只有消息发送者才能撤回消息:', { userId: numericUserId, senderId: message.sender_id });
        socket.emit('error', { message: '只有消息发送者才能撤回消息' });
        return;
      }
      
      // 处理文件删除 - 根据message_type和JSON内容判断
      let contentData = null;
      try {
        if (message.content && (message.message_type === 1 || message.message_type === 2)) {
          contentData = JSON.parse(message.content);
        }
      } catch (jsonError) {
        console.error('❌ 解析消息内容失败:', jsonError.message);
      }
      
      if (contentData && contentData.url) {
        // 有文件需要删除
        const fileUrl = contentData.url;
        const filePath = path.join(__dirname, 'public', fileUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          // console.log('🗑️ 删除文件:', fileUrl);
        }
      }
      
      // 将messageId转换为数字类型
      const numericMessageId = parseInt(messageId);
      
      // 检查对方是否在线
      const allOnlineUsers = await getAllOnlineUsers();
      const receiverIsOnline = allOnlineUsers.some(u => u.id === message.receiver_id);
      
      let type101Message;
      
      if (receiverIsOnline) {
        // 对方在线，不保存到数据库，只发送101消息
        type101Message = {
          id: Date.now(),
          senderId: numericUserId,
          receiverId: message.receiver_id,
          content: String(numericMessageId),
          messageType: 101,
          timestamp: Date.now(),
          timestampISO: new Date().toISOString()
        };
      } else {
        // 对方不在线，保存到数据库
        const [insertResult] = await pool.execute(
          'INSERT INTO chat_private_messages (sender_id, receiver_id, content, message_type, timestamp) VALUES (?, ?, ?, ?, NOW())',
          [numericUserId, message.receiver_id, String(numericMessageId), 101]
        );
        
        type101Message = {
          id: insertResult.insertId,
          senderId: numericUserId,
          receiverId: message.receiver_id,
          content: String(numericMessageId),
          messageType: 101,
          timestamp: Date.now(),
          timestampISO: new Date().toISOString()
        };
      }
      
      // 删除原数据库记录
      await pool.execute('DELETE FROM chat_private_messages WHERE id = ?', [messageId]);
      
      // 发送类型101消息给发送者和接收者
      io.to(`user_${numericUserId}`).emit('private-message-received', type101Message);
      io.to(`user_${message.receiver_id}`).emit('private-message-received', type101Message);
      
      // console.log('📤 私信消息已撤回:', { messageId: numericMessageId, senderId: message.sender_id, receiverId: message.receiver_id });
      
    } catch (err) {
      console.error('❌ 撤回私信失败:', err.message);
      console.error('❌ 错误详情:', err);
      socket.emit('error', { message: '撤回私信失败', error: err.message });
    }
  });

  // 消息已读事件（支持私信和群组）
  socket.on('message-read', async (data) => {
    try {
      if (!data) {
        return;
      }
      
      const { type, userId, friendId, groupId } = data;
      
      // 验证必需参数
      if (!type || !userId) {
        return;
      }
      
      // 速率限制检查
      const rateLimitResult = await checkRateLimit(userId);
      if (!rateLimitResult.allowed) {
        socket.emit('error', { 
          message: `操作过于频繁，请${rateLimitResult.retryAfter}秒后再试`
        });
        return;
      }
      
      const numericUserId = parseInt(userId);
      if (isNaN(numericUserId)) {
        return;
      }
      
      if (type === 'private') {
        if (!friendId) {
          return;
        }
        
        const numericFriendId = parseInt(friendId);
        if (isNaN(numericFriendId)) {
          return;
        }
        
        // 处理私信已读
        // 更新数据库中对方发给自己的未读消息为已读
        await pool.execute(
          'UPDATE chat_private_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
          [numericFriendId, numericUserId]
        );
        
        // 发送已读事件给对方
        io.to(`user_${numericFriendId}`).emit('private-message-read', {
          fromUserId: numericUserId,
          friendId: numericFriendId
        });
        
        // 检查对方是否在线
        const allOnlineUsers = await getAllOnlineUsers();
        const friendIsOnline = allOnlineUsers.some(u => u.id === numericFriendId);
        
        if (!friendIsOnline) {
          // 对方不在线，保存已读回执消息（103）到数据库
          
          // 获取刚才已读的最后一条消息的id作为内容
          const [readMessages] = await pool.execute(
            'SELECT id FROM chat_private_messages WHERE sender_id = ? AND receiver_id = ? AND is_read = 1 ORDER BY id DESC LIMIT 1',
            [numericFriendId, numericUserId]
          );
          
          let lastReadMessageId = 0;
          if (readMessages.length > 0) {
            lastReadMessageId = readMessages[0].id;
          }
          
          // 保存已读回执消息（103）到数据库
          const [insertResult] = await pool.execute(
            'INSERT INTO chat_private_messages (sender_id, receiver_id, content, message_type, timestamp, is_read) VALUES (?, ?, ?, ?, NOW(), 1)',
            [numericUserId, numericFriendId, String(lastReadMessageId), 103]
          );
          
          // 发送类型103消息给对方（虽然不在线，但可能重连后会收到历史消息）
          const type103Message = {
            id: insertResult.insertId,
            senderId: numericUserId,
            receiverId: numericFriendId,
            content: String(lastReadMessageId),
            messageType: 103,
            timestamp: Date.now(),
            timestampISO: new Date().toISOString()
          };
          
          io.to(`user_${numericFriendId}`).emit('private-message-received', type103Message);
        }
        
      } else if (type === 'group') {
        if (!groupId) {
          return;
        }
        
        // 处理群组已读（预留，后续实现）
        const numericGroupId = parseInt(groupId);
        if (isNaN(numericGroupId)) {
          return;
        }
      } else {
        return;
      }
      
    } catch (err) {
      console.error('❌ 处理消息已读事件失败:', err.message);
      console.error('❌ 错误详情:', err);
    }
  });


  // 统一加载消息事件（支持全局、群组、私信）
  socket.on('load-messages', async (data) => {
    try {
      const { type, userId, sessionToken, limit = 20, olderThan, groupId, friendId, loadMore = false } = data;
      
      let messages = [];
      const numericUserId = parseInt(userId);
      let responseData = { type, messages: [], loadMore: loadMore };
      
      if (type === 'global') {
        // 加载全局聊天室消息 - 完全复刻 chat-history 事件
        if (olderThan) {
          messages = await getGlobalMessages(limit, olderThan);
        } else {
          // 直接从数据库获取最新消息
          messages = await getGlobalMessages(limit);
        }
        
        // 收集群组最后消息时间（从消息表中动态获取）
        const groupLastMessageTimes = {};
        const [groupMessages] = await pool.execute(
          'SELECT group_id, MAX(timestamp) as last_time FROM chat_messages WHERE group_id IS NOT NULL GROUP BY group_id'
        );
        groupMessages.forEach(msg => {
          if (msg.last_time) {
            groupLastMessageTimes[msg.group_id] = msg.last_time;
          }
        });
        
        // 收集私信最后消息时间
        const privateLastMessageTimes = {};
        const [privateMessages] = await pool.execute(
          'SELECT sender_id, receiver_id, MAX(timestamp) as last_time FROM chat_private_messages WHERE sender_id = ? OR receiver_id = ? GROUP BY sender_id, receiver_id',
          [numericUserId, numericUserId]
        );
        privateMessages.forEach(msg => {
          const otherUserId = String(msg.sender_id) === String(numericUserId) ? msg.receiver_id : msg.sender_id;
          if (!privateLastMessageTimes[otherUserId] || new Date(msg.last_time) > new Date(privateLastMessageTimes[otherUserId])) {
            privateLastMessageTimes[otherUserId] = msg.last_time;
          }
        });
        
        responseData.messages = messages;
        responseData.groupLastMessageTimes = groupLastMessageTimes;
        responseData.privateLastMessageTimes = privateLastMessageTimes;
        socket.emit('messages-loaded', responseData);
      } else if (type === 'group') {
        // 加载群组消息 - 完全复刻 group-chat-history 事件
        const numericGroupId = parseInt(groupId);
        
        // 验证用户是否在群组中
        const [memberCheck] = await pool.query(
          'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
          [numericGroupId, numericUserId]
        );
        
        if (memberCheck.length === 0) {
          socket.emit('error', { message: '您不在该群组中，无法查看聊天记录' });
          return;
        }
        
        // 获取群组消息
        if (loadMore && olderThan) {
          messages = await getGroupMessages(numericGroupId, limit, olderThan);
        } else {
          // 直接从数据库获取最新消息
          messages = await getGroupMessages(numericGroupId, limit);
        }
        
        responseData.messages = messages;
        responseData.groupId = numericGroupId;
        socket.emit('messages-loaded', responseData);
      } else if (type === 'private') {
        // 加载私信消息 - 完全复刻 private-chat-history 事件
        const numericFriendId = parseInt(friendId);
        
        // 验证对方是否是自己的好友
        const [friendCheck] = await pool.query(
          'SELECT id FROM chat_friends WHERE user_id = ? AND friend_id = ? AND deleted_at IS NULL',
          [numericUserId, numericFriendId]
        );
        
        if (friendCheck.length === 0) {
          socket.emit('error', { message: '对方不是您的好友，无法查看聊天记录' });
          return;
        }
        
        let query = `
          SELECT p.id, p.sender_id as senderId, p.receiver_id as receiverId, 
                 p.content, p.at_userid, p.message_type as messageType, p.is_read as isRead, p.timestamp,
                 u1.nickname as senderNickname, u1.avatar_url as senderAvatarUrl,
                 u2.nickname as receiverNickname, u2.avatar_url as receiverAvatarUrl
          FROM chat_private_messages p
          JOIN chat_users u1 ON p.sender_id = u1.id
          JOIN chat_users u2 ON p.receiver_id = u2.id
          WHERE ((p.sender_id = ? AND p.receiver_id = ?) OR (p.sender_id = ? AND p.receiver_id = ?))
        `;
        
        const params = [numericUserId, numericFriendId, numericFriendId, numericUserId];
        
        if (loadMore) {
          const olderThanNum = parseInt(olderThan);
          if (!isNaN(olderThanNum)) {
            query += ` AND p.id < ? `;
            params.push(olderThanNum);
          }
        }
        
        const safeLimit = parseInt(limit);
        const finalLimit = isNaN(safeLimit) ? 20 : safeLimit;
        query += ` ORDER BY p.timestamp DESC, p.id DESC LIMIT ?`;
        params.push(finalLimit);
        
        const [results] = await pool.query(query, params);
        
        messages = results.map(msg => {
          let atUserIds = null;
          if (msg.at_userid) {
            try {
              atUserIds = JSON.parse(msg.at_userid);
            } catch (e) {
              atUserIds = msg.at_userid;
            }
          }
          const message = {
            id: msg.id,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            senderNickname: msg.senderNickname,
            senderAvatarUrl: msg.senderAvatarUrl,
            receiverNickname: msg.receiverNickname,
            receiverAvatarUrl: msg.receiverAvatarUrl,
            content: msg.content,
            at_userid: atUserIds,
            messageType: msg.messageType,
            isRead: msg.isRead || 0,
            timestamp: new Date(msg.timestamp).getTime(),
            timestampISO: new Date(msg.timestamp).toISOString()
          };
          
          if (msg.messageType === 1 && msg.content) {
            try {
              const contentData = JSON.parse(msg.content);
              if (contentData.url) {
                message.imageUrl = contentData.url;
              }
            } catch (error) {
              console.error(`解析图片消息失败: 消息ID=${msg.id}, 错误=${error.message}`);
            }
          }
          
          return message;
        });
        
        responseData.messages = messages.reverse();
        responseData.friendId = numericFriendId;
        socket.emit('messages-loaded', responseData);
      } else {
        socket.emit('error', { message: '无效的消息类型' });
      }
    } catch (err) {
      console.error('❌ 加载消息失败:', err.message);
      socket.emit('error', { message: '加载消息失败', error: err.message });
    }
  });

  // 删除消息
  socket.on('delete-message', async (data) => {
    try {
      const { messageId, userId, sessionToken } = data;

      // console.log('🗑️ 删除消息请求:', { messageId, userId });

      // 先获取消息信息，检查是否有图片和权限
      const [messages] = await pool.execute(
          'SELECT content, message_type, user_id, group_id FROM chat_messages WHERE id = ?',
          [messageId]
      );

      if (messages.length === 0) {
        // console.error('❌ 消息不存在:', messageId);
        socket.emit('error', { message: '消息不存在' });
        return;
      }

      const message = messages[0];

      // 检查权限：只能删除自己的消息
      if (parseInt(message.user_id) !== parseInt(userId)) {
        console.error('❌ 权限不足，只能删除自己的消息:', { messageUserId: message.user_id, requestUserId: userId });
        socket.emit('error', { message: '只能删除自己的消息' });
        return;
      }
      
      // 如果是群组消息，验证用户是否在群组中
      if (message.group_id) {
        const [memberCheck] = await pool.execute(
          'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
          [parseInt(message.group_id), parseInt(userId)]
        );
        
        if (memberCheck.length === 0) {
          console.error('❌ 用户不在群组中，无法删除消息:', { userId, groupId: message.group_id });
          socket.emit('error', { message: '您不在该群组中，无法删除消息' });
          return;
        }
      }

      // 处理文件删除 - 根据message_type和JSON内容判断
      let contentData = null;
      try {
        if (message.content && (message.message_type === 1 || message.message_type === 2)) {
          contentData = JSON.parse(message.content);
        }
      } catch (jsonError) {
        console.error('❌ 解析消息内容失败:', jsonError.message);
      }
      
      if (contentData && contentData.url) {
        // 有文件需要删除
        const fileUrl = contentData.url;
        const filePath = path.join(__dirname, 'public', fileUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          // console.log('🗑️ 删除文件:', fileUrl);
        }
      }

      // 将messageId转换为数字类型，确保与缓存中的msg.id类型匹配
      const numericMessageId = parseInt(messageId);
      
      // 将类型101消息保存到数据库
      let insertResult;
      if (message.group_id) {
        // 群组消息：保存到 chat_messages 表
        [insertResult] = await pool.execute(
          'INSERT INTO chat_messages (user_id, group_id, content, message_type, timestamp) VALUES (?, ?, ?, ?, NOW())',
          [parseInt(userId), parseInt(message.group_id), String(numericMessageId), 101]
        );
      } else {
        // 公共消息：保存到 chat_messages 表
        [insertResult] = await pool.execute(
          'INSERT INTO chat_messages (user_id, content, message_type, timestamp) VALUES (?, ?, ?, NOW())',
          [parseInt(userId), String(numericMessageId), 101]
        );
      }
      
      // 发送类型101消息，内容为被撤回消息的ID，并保存到数据库
      const type101Message = {
        id: insertResult.insertId,
        userId: parseInt(userId),
        nickname: '',
        avatarUrl: '',
        content: String(numericMessageId),
        messageType: 101,
        groupId: message.group_id ? parseInt(message.group_id) : null,
        timestamp: Date.now(),
        timestampISO: new Date().toISOString()
      };
      
      // 删除原数据库记录
      await pool.execute('DELETE FROM chat_messages WHERE id = ?', [messageId]);
      
      // 广播类型101消息
      if (message.group_id) {
        // 群组消息：向群组成员广播
        const [groupMembers] = await pool.execute(
          'SELECT user_id FROM chat_group_members WHERE group_id = ? AND deleted_at IS NULL',
          [message.group_id]
        );
        for (const member of groupMembers) {
          io.to(`user_${member.user_id}`).emit('message-received', type101Message);
        }
      } else {
        // 公共消息：全局广播
        io.emit('message-received', type101Message);
      }
      
    } catch (err) {
      console.error('删除消息失败:', err.message);
      socket.emit('error', { message: '删除消息失败' });
    }
  });

  // 获取在线用户列表
  socket.on('get-users', async () => {
    try {
      const ipValid = await validateSocketIP(socket);
      if (!ipValid) {
        return;
      }
      
      const allOnlineUsers = await getAllOnlineUsers();
      const onlineUsersArray = allOnlineUsers.map(user => ({
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        isOnline: true
      }));

      const onlineUserIds = new Set(onlineUsersArray.map(u => u.id));
      
      const [offlineUsersData] = await pool.execute(`
        SELECT id, nickname, last_online, avatar_url as avatarUrl 
        FROM chat_users 
        WHERE last_online IS NOT NULL 
        AND last_online >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY last_online DESC
      `);

      const offlineUsersArray = offlineUsersData
        .filter(user => !onlineUserIds.has(user.id))
        .map(user => ({
          id: user.id,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          isOnline: false,
          lastOnline: user.last_online
        }));

      socket.emit('users-list', {
        online: onlineUsersArray,
        offline: offlineUsersArray
      });
    } catch (err) {
      console.error('获取用户列表失败:', err.message);
    }
  });

  // 用户断开连接
  socket.on('disconnect', async (reason) => {
    // 从已认证用户集合和房间中移除
    const user = await getOnlineUser(socket.id);
    if (user) {
      await removeAuthenticatedUser(user.id, socket);
    }

    // 从在线用户列表中移除
    if (user) {
      await removeOnlineUser(socket.id);

      // 更新用户最后上线时间（即下线时间）
      try {
        await pool.execute(
          'UPDATE chat_users SET last_online = NOW() WHERE id = ?',
          [user.id]
        );
      } catch (err) {
        console.error('更新用户最后上线时间失败:', err.message);
      }

      // 广播更新后的用户列表
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
        FROM chat_users 
        WHERE last_online IS NOT NULL 
        AND last_online >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY last_online DESC
      `);

      const offlineUsersArray = offlineUsersData
        .filter(user => !onlineUserIds.has(user.id))
        .map(user => ({
          id: user.id,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          isOnline: false,
          lastOnline: user.last_online
        }));

      // 只向已认证用户广播用户列表
      io.to('authenticated_users').emit('users-list', {
        online: onlineUsersArray,
        offline: offlineUsersArray
      });
    }
  });

  // 连接错误处理
  socket.on('error', (error) => {
  });
});

// 删除撤回群组中所有消息接口（已废弃）

// 解散群组
app.post('/api/dissolve-group', async (req, res) => {
  try {
    const { groupId, userId: requestUserId } = req.body;
    const userId = req.userId; // 从validateSession中间件获取
    
    // 验证请求中的用户ID是否与会话用户ID一致
    if (requestUserId && String(requestUserId) !== String(userId)) {
      return res.status(403).json({ status: 'error', message: '无效的用户ID' });
    }
    
    // 验证请求参数
    if (!groupId) {
      return res.status(400).json({ status: 'error', message: '缺少必要参数' });
    }
    
    // 检查用户是否是群主
    const [groupResults] = await pool.execute(
      'SELECT creator_id, name, avatar_url FROM chat_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );
    
    if (groupResults.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }
    
    const group = groupResults[0];
    const groupAvatarUrl = group.avatar_url;
    
    if (parseInt(group.creator_id) !== parseInt(userId)) {
      return res.status(403).json({ status: 'error', message: '只有群主可以解散群组' });
    }
    
    // 获取连接并开始事务
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // 获取群组所有成员
      const [members] = await connection.execute(
        'SELECT user_id FROM chat_group_members WHERE group_id = ?',
        [groupId]
      );
      
      // 设置群组为已删除（标记 deleted_at）
      await connection.execute(
        'UPDATE chat_groups SET deleted_at = NOW() WHERE id = ?',
        [groupId]
      );
      
      // 保留成员记录，添加 deleted_at 标记
      await connection.execute(
        'UPDATE chat_group_members SET deleted_at = NOW() WHERE group_id = ?',
        [groupId]
      );
      
      // 提交事务
      await connection.commit();
      connection.release();
      
      // 删除群头像文件（如果有且不是默认头像）
      if (groupAvatarUrl && groupAvatarUrl !== '/avatars/default.png') {
        try {
          // 去掉 URL 中的 ?v= 参数，并构建正确的文件路径
          const avatarPathWithoutVersion = groupAvatarUrl.split('?')[0];
          const fullAvatarPath = path.join(__dirname, 'public', avatarPathWithoutVersion);
          if (fs.existsSync(fullAvatarPath)) {
            fs.unlinkSync(fullAvatarPath);
          }
        } catch (deleteError) {
          console.error('删除群头像文件失败:', deleteError.message);
        }
      }
      
      // 获取当前时间
      const now = new Date();
      
      // 获取群主信息
      const [creatorInfo] = await pool.execute(
        'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
        [userId]
      );
      
      // 只添加一条群组解散消息，发送人是群主
      const dissolvedContent = JSON.stringify({
        groupName: group.name,
        content: '群组已解散'
      });
      const [insertResult] = await pool.execute(
        'INSERT INTO chat_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
        [userId, dissolvedContent, 100, groupId]
      );
      
      // 构建100类型消息对象
      const type100Message = {
        id: insertResult.insertId,
        userId: userId,
        nickname: creatorInfo[0]?.nickname || '',
        avatarUrl: creatorInfo[0]?.avatar_url || '',
        content: dissolvedContent,
        at_userid: null,
        messageType: 100,
        groupId: groupId,
        timestamp: now.getTime(),
        timestampISO: now.toISOString()
      };
      
      // 向所有群组成员发送100类型消息
      for (const member of members) {
        io.to(`user_${member.user_id}`).emit('message-received', type100Message);
      }
      
      // 构建群组解散事件数据
      const groupDissolvedEvent = {
        groupId: groupId,
        groupName: group.name,
        groupAvatarUrl: group.avatar_url,
        timestamp: now.getTime()
      };
      
      // 向所有群组成员发送解散事件
      for (const member of members) {
        io.to(`user_${member.user_id}`).emit('group-dissolved', groupDissolvedEvent);
      }
      
      // 清除群组消息缓存
      await redisClient.del(`scr:message:group:${groupId}`);
      
      res.json({ status: 'success', message: '群组已成功解散' });
    } catch (transactionError) {
      // 回滚事务
      await connection.rollback();
      connection.release();
      throw transactionError;
    }
  } catch (error) {
    console.error('❌ 解散群组失败:', error);
    res.status(500).json({ status: 'error', message: '服务器错误，请重试' });
  }
});

// 修改群组名接口
app.post('/api/update-group-name', async (req, res) => {
  try {
    const { groupId, newGroupName } = req.body;
    const userId = req.userId; // 从validateSession中间件获取

    // 验证参数
    if (!groupId || !newGroupName) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }

    if (!validateNickname(newGroupName)) {
      return res.status(400).json({ status: 'error', message: '群组名称格式错误' });
    }

    // 检查用户是否是群主
    const [group] = await pool.execute(
      'SELECT creator_id FROM chat_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }

    if (parseInt(group[0].creator_id) !== parseInt(userId)) {
      return res.status(403).json({ status: 'error', message: '只有群主可以修改群组名称' });
    }

    // 更新群组名称
    await pool.execute(
      'UPDATE chat_groups SET name = ? WHERE id = ? AND deleted_at IS NULL',
      [newGroupName, groupId]
    );

    // console.log(`📝 群组 ${groupId} 的名称已更新为: ${newGroupName}`);

    // 向所有群组成员广播群组名称更新事件（使用群组房间）
    io.to(`group_${groupId}`).emit('group-name-updated', {
      groupId: groupId,
      newGroupName: newGroupName
    });

    res.json({ status: 'success', message: '群组名称已更新', newGroupName: newGroupName });
  } catch (err) {
    console.error('修改群组名称失败:', err.message);
    res.status(500).json({ status: 'error', message: '服务器错误，请重试' });
  }
});

// 修改群组公告接口
app.post('/api/update-group-description', async (req, res) => {
  try {
    const { groupId, newDescription } = req.body;
    const userId = req.userId; // 从validateSession中间件获取

    // 验证参数
    if (!groupId) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }

    // 检查用户是否是群主
    const [group] = await pool.execute(
      'SELECT creator_id FROM chat_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }

    if (parseInt(group[0].creator_id) !== parseInt(userId)) {
      return res.status(403).json({ status: 'error', message: '只有群主可以修改群组公告' });
    }

    // 更新群组描述
    await pool.execute(
      'UPDATE chat_groups SET description = ? WHERE id = ? AND deleted_at IS NULL',
      [newDescription, groupId]
    );

    // console.log(`📝 群组 ${groupId} 的公告已更新为: ${newDescription}`);

    // 向所有群组成员广播群组公告更新事件（使用群组房间）
    io.to(`group_${groupId}`).emit('group-description-updated', {
      groupId: groupId,
      newDescription: newDescription
    });

    res.json({ status: 'success', message: '群组公告已更新', newDescription: newDescription });
  } catch (err) {
    console.error('修改群组公告失败:', err.message);
    res.status(500).json({ status: 'error', message: '服务器错误，请重试' });
  }
});

// 用户退出群组API
app.post('/api/leave-group', async (req, res) => {
  try {
    const { groupId } = req.body;
    const userId = req.userId; // 从validateSession中间件获取
    
    // 验证请求参数
    if (!groupId) {
      return res.status(400).json({ status: 'error', message: '缺少必要参数' });
    }
    
    // 检查用户是否在群组中
    const [memberResults] = await pool.execute(
      'SELECT * FROM chat_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
      [groupId, userId]
    );
    
    if (memberResults.length === 0) {
      return res.status(404).json({ status: 'error', message: '你不在该群组中' });
    }
    
    // 检查用户是否是群主
    const [groupResults] = await pool.execute(
      'SELECT creator_id FROM chat_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );
    
    if (groupResults.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }
    
    const group = groupResults[0];
    if (parseInt(group.creator_id) === parseInt(userId)) {
      return res.status(403).json({ status: 'error', message: '群主不能退出群组，请先解散群组或转让群主' });
    }
    
    // 获取连接并开始事务
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // 删除用户与群组的关联
      await connection.execute(
        'DELETE FROM chat_group_members WHERE group_id = ? AND user_id = ?',
        [groupId, userId]
      );
      
      // 提交事务
      await connection.commit();
      connection.release();
      
      // console.log(`👤 用户 ${userId} 已退出群组 ${groupId}`);
      
      // 获取群组所有成员，向他们广播成员退出事件
      const [allMembers] = await pool.execute(
        'SELECT user_id FROM chat_group_members WHERE group_id = ?',
        [groupId]
      );
      
      for (const member of allMembers) {
        io.to(`user_${member.user_id}`).emit('member-left-group', { groupId, userId });
      }
      
      // 也通知退出的用户
      io.to(`user_${userId}`).emit('member-left-group', { groupId, userId });
      
      res.json({ status: 'success', message: '已成功退出群组' });
    } catch (transactionError) {
      // 回滚事务
      await connection.rollback();
      connection.release();
      throw transactionError;
    }
  } catch (error) {
    console.error('❌ 退出群组失败:', error);
    res.status(500).json({ status: 'error', message: '服务器错误，请重试' });
  }
});

// 处理 POST 请求
app.post('/api/send-message', async (req, res) => {
  try {
    const { content, groupId, at_userid } = req.body;
    const userId = req.userId; // 从 validateSession 中间件获取

    // console.log('💬 HTTP 发送消息请求:', {
    //   userId: userId,
    //   groupId: groupId,
    //   contentLength: content ? content.length : 0
    // });

    // 速率限制检查
    const rateLimitResult = await checkRateLimit(userId);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({ 
        status: 'error', 
        message: `发送消息过于频繁，请${rateLimitResult.retryAfter}秒后再试`,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: rateLimitResult.retryAfter
      });
    }

    // 验证消息内容
    if (!validateMessageContent(content)) {
      console.error('❌ 消息内容格式错误或超过 10000 字符限制');
      return res.status(400).json({ status: 'error', message: '消息内容格式错误或超过 10000 字符限制' });
    }

    // 获取用户信息
    const [users] = await pool.execute(
        'SELECT id, nickname, avatar_url FROM chat_users WHERE id = ?',
        [userId]
    );

    if (users.length === 0) {
      console.error('❌ 用户不存在:', userId);
      return res.status(404).json({ status: 'error', message: '用户不存在' });
    }

    const user = users[0];

    // 插入消息到数据库
    const [result] = await pool.execute(
        'INSERT INTO chat_messages (user_id, content, at_userid, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
        [userId, content, at_userid ? JSON.stringify(at_userid) : null, groupId || null]
    );

    // 创建消息对象
    const newMessage = {
      id: result.insertId,
      userId,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      content: content,
      at_userid: at_userid,
      groupId: groupId || null,
      timestamp: new Date()
    };

    // 广播消息
    if (groupId) {
      io.to(`group_${groupId}`).emit('message-received', newMessage);
      
    } else {
      // 只发送给已认证的用户（发送过 user-joined 事件的用户）
      const allOnlineUsers = await getAllOnlineUsers();
      for (const onlineUser of allOnlineUsers) {
        if (await isAuthenticatedUser(onlineUser.id)) {
          const socket = io.sockets.sockets.get(onlineUser.socketId);
          if (socket) {
            socket.emit('message-received', newMessage);
          }
        }
      }
    }

    res.json({
      status: 'success',
      messageId: result.insertId,
      message: '消息发送成功'
    });

  } catch (err) {
    console.error('❌ HTTP保存消息失败:', err.message);
    res.status(500).json({ status: 'error', message: '发送消息失败' });
  }
});

// 启动服务器
const PORT = process.env.PORT || 15825;

async function startServer() {
  try {
    // 每天凌晨2点执行清理任务
    schedule.scheduleJob('0 0 2 * * *', async () => {
      await cleanExpiredFiles();
      await cleanupExpiredSessions();
    });

    console.log(`
__  ___/__(_)______ ______________  /____     _________  /_______ __  /_   __________________________ ___ 
_____ \\__  /__  __ \`__ \\__  __ \\_  /_  _ \\    _  ___/_  __ \\  __ \`/  __/   __  ___/  __ \\  __ \\_  __ \`__ \\
____/ /_  / _  / / / / /_  /_/ /  / /  __/    / /__ _  / / / /_/ // /_     _  /   / /_/ / /_/ /  / / / / /
/____/ /_/  /_/ /_/ /_/_  .___//_/  \\___/     \\___/ /_/ /_/\\__,_/ \\__/     /_/    \\____/\\____//_/ /_/ /_/ 
                      /_/                                                                                 
    `);

    console.log('⏰ 已设置定时任务：每天凌晨2点清理过期文件和过期会话');
    
    // 服务器启动时立即执行一次清理
    cleanExpiredFiles();
    cleanupExpiredSessions();

    await initializeDatabase();
    await loadSessionsFromDatabase();
    await syncBannedIPsToRedis();
    
    // 服务器启动时清空在线用户列表
    await redisClient.del('scr:online_users');
    await redisClient.del('scr:authenticated_users');
    


    server.listen(PORT, '0.0.0.0', () => {
      console.log('🚀 服务器启动成功!');
      console.log(`📍 服务器运行在端口 ${PORT}`);
      console.log(`🔍 健康检查地址: http://localhost:${PORT}/health`);
      console.log(`🔐 会话检查地址: http://localhost:${PORT}/session-check`);
      console.log(`📊 会话调试地址: http://localhost:${PORT}/sessions`);
      console.log('🌐 允许所有来源访问');
      console.log('💡 会话模式: 20分钟过期');

      // 检查头像存储状态
      const storageStatus = checkAvatarStorage();
      console.log(`💾 ${storageStatus.message}`);

      console.log('\n📋 服务器配置信息:');
      console.log(`   - Ping超时: ${io.engine.opts.pingTimeout}ms`);
      console.log(`   - Ping间隔: ${io.engine.opts.pingInterval}ms`);
      console.log(`   - 连接超时: ${io.engine.opts.connectTimeout}ms`);
      console.log(`   - 升级超时: ${io.engine.opts.upgradeTimeout}ms`);
      console.log(`   - 传输方式: ${io.engine.opts.transports.join(', ')}`);
      console.log(`   - 会话模式: 20分钟过期`);

      console.log(`---------------------------------------------------------`);
    });
  } catch (err) {
    console.error('💥 启动服务器失败:', err.message);
    process.exit(1);
  }
}

// 优雅关闭处理
process.on('SIGINT', async () => {
  console.log('\n🛑 收到关闭信号，正在优雅关闭服务器...');
  const onlineCount = await getOnlineUserCount();
  console.log(`📊 关闭前在线用户数: ${onlineCount}`);
  const sessionCount = await getSessionCount();
  console.log(`💾 活动会话数: ${sessionCount}`);

  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  console.error('💥 未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 未处理的Promise拒绝:', reason);
});

// 全局错误处理中间件
app.use((err, req, res, next) => {
  // 特殊处理Multer错误，尤其是文件大小限制错误
  if (err instanceof multer.MulterError) {
    let errorMessage = '文件上传错误';
    
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        errorMessage = '文件大小超过限制，最大支持5MB';
        // 静默处理，不输出错误信息
        break;
      case 'LIMIT_FILE_COUNT':
        errorMessage = '文件数量超过限制';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        errorMessage = `不支持的文件字段: ${err.field}`;
        break;
      case 'FILE_TYPE_NOT_ALLOWED':
        errorMessage = '不支持的文件类型';
        break;
      default:
        errorMessage = '文件上传格式错误';
    }
    
    return res.status(400).json({
      status: 'error',
      message: errorMessage
    });
  }
  
  // 非Multer错误，正常记录日志
  console.error('全局错误捕获:', err.message);
  console.error('错误堆栈:', err.stack);
  
  // 确保返回JSON格式的错误响应
  res.status(500).json({
    status: 'error',
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 清理过期文件的函数
async function cleanExpiredFiles() {
  try {
    // console.log('🔄 开始清理过期文件...');
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7天前的时间戳
    
    // 清理聊天图片和文件
    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      let deletedFileCount = 0;
      
      for (const file of files) {
        const filePath = path.join(uploadDir, file);
        try {
          // 获取文件的系统更改时间（mtime）
          const stats = fs.statSync(filePath);
          const fileMtime = stats.mtime.getTime();
          
          if (fileMtime < sevenDaysAgo) {
            fs.unlinkSync(filePath);
            deletedFileCount++;
          }
        } catch (err) {
          // 跳过无法访问的文件
          console.warn(`⚠️ 无法处理文件 ${file}: ${err.message}`);
        }
      }
      console.log(`✅ 清理了 ${deletedFileCount} 个过期文件`);
    }
    
    // 记录清理操作
    // console.log('✅ 过期文件清理完成');
  } catch (err) {
    console.error('❌ 清理过期文件失败:', err.message);
  }
}

startServer();