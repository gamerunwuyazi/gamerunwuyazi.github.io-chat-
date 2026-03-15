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

// 消息缓存（使用 Redis）
// 全局消息存储在 Redis key: scr:message:global (list)
// 群组消息存储在 Redis key: scr:message:group:{groupId} (list)

// 获取全局消息（从 Redis）
async function getGlobalMessagesFromCache(limit = 50) {
  try {
    const messages = await redisClient.lRange('scr:message:global', 0, limit - 1);
    return messages.map(msg => JSON.parse(msg));
  } catch (err) {
    console.error('获取全局消息失败:', err.message);
    return [];
  }
}

// 添加全局消息到 Redis（使用 pipeline 确保原子性）
async function addGlobalMessageToCache(message) {
  try {
    // 使用 pipeline 确保原子性
    const pipeline = redisClient.multi();
    pipeline.lPush('scr:message:global', JSON.stringify(message));
    pipeline.lTrim('scr:message:global', 0, 199);
    await pipeline.exec();
  } catch (err) {
    console.error('添加全局消息失败:', err.message);
  }
}

// 清空并重新设置全局消息缓存
async function setGlobalMessagesCache(messages) {
  try {
    await redisClient.del('scr:message:global');
    if (messages && messages.length > 0) {
      // getGlobalMessages 返回的消息是按 timestamp DESC 排序的，最新的在前面
      // 使用 lPush 依次添加，这样最后添加的最旧消息会在列表头部（索引0）
      // 而最新的消息会在列表尾部，然后 lTrim(0, 199) 保留最新的200条
      for (let i = messages.length - 1; i >= 0; i--) {
        await redisClient.lPush('scr:message:global', JSON.stringify(messages[i]));
      }
      await redisClient.lTrim('scr:message:global', 0, 199);
    }
  } catch (err) {
    console.error('设置全局消息缓存失败:', err.message);
  }
}

// 获取群组消息（从 Redis）
async function getGroupMessagesFromCache(groupId, limit = 50) {
  try {
    const key = `scr:message:group:${groupId}`;
    const messages = await redisClient.lRange(key, 0, limit - 1);
    return messages.map(msg => JSON.parse(msg));
  } catch (err) {
    console.error('获取群组消息失败:', err.message);
    return [];
  }
}

// 添加群组消息到 Redis（使用 pipeline 确保原子性）
async function addGroupMessageToCache(groupId, message) {
  try {
    const key = `scr:message:group:${groupId}`;
    // 使用 pipeline 确保原子性
    const pipeline = redisClient.multi();
    pipeline.lPush(key, JSON.stringify(message));
    pipeline.lTrim(key, 0, 49);
    pipeline.expire(key, 86400 * 7); // 7 天过期
    await pipeline.exec();
  } catch (err) {
    console.error('添加群组消息失败:', err.message);
  }
}

// 清空并重新设置群组消息缓存
async function setGroupMessagesCache(groupId, messages) {
  try {
    const key = `scr:message:group:${groupId}`;
    await redisClient.del(key);
    if (messages && messages.length > 0) {
      // getGroupMessages 返回的消息是按 timestamp DESC 排序的，最新的在前面
      // 使用 lPush 依次添加，这样最后添加的最旧消息会在列表头部（索引0）
      // 而最新的消息会在列表尾部，然后 lTrim(0, 49) 保留最新的50条
      for (let i = messages.length - 1; i >= 0; i--) {
        await redisClient.lPush(key, JSON.stringify(messages[i]));
      }
      await redisClient.lTrim(key, 0, 49);
      await redisClient.expire(key, 86400 * 7); // 7 天过期
    }
  } catch (err) {
    console.error('设置群组消息缓存失败:', err.message);
  }
}

// 更新全局消息缓存中指定用户的头像和昵称
async function updateGlobalMessageCacheUserInfo(userId, updates) {
  try {
    const messages = await redisClient.lRange('scr:message:global', 0, -1);
    if (messages.length === 0) return;
    
    let hasChanges = false;
    const updatedMessages = messages.map(msg => {
      const message = JSON.parse(msg);
      if (String(message.userId) === String(userId)) {
        if (updates.nickname !== undefined) {
          message.nickname = updates.nickname;
          hasChanges = true;
        }
        if (updates.avatarUrl !== undefined) {
          message.avatarUrl = updates.avatarUrl;
          hasChanges = true;
        }
      }
      return message;
    });
    
    if (hasChanges) {
      await redisClient.del('scr:message:global');
      for (let i = updatedMessages.length - 1; i >= 0; i--) {
        await redisClient.lPush('scr:message:global', JSON.stringify(updatedMessages[i]));
      }
      await redisClient.lTrim('scr:message:global', 0, 199);
    }
  } catch (err) {
    console.error('更新全局消息缓存用户信息失败:', err.message);
  }
}

// 更新群组消息缓存中指定用户的头像和昵称
async function updateGroupMessageCacheUserInfo(groupId, userId, updates) {
  try {
    const key = `scr:message:group:${groupId}`;
    const messages = await redisClient.lRange(key, 0, -1);
    if (messages.length === 0) return;
    
    let hasChanges = false;
    const updatedMessages = messages.map(msg => {
      const message = JSON.parse(msg);
      if (String(message.userId) === String(userId)) {
        if (updates.nickname !== undefined) {
          message.nickname = updates.nickname;
          hasChanges = true;
        }
        if (updates.avatarUrl !== undefined) {
          message.avatarUrl = updates.avatarUrl;
          hasChanges = true;
        }
      }
      return message;
    });
    
    if (hasChanges) {
      await redisClient.del(key);
      for (let i = updatedMessages.length - 1; i >= 0; i--) {
        await redisClient.lPush(key, JSON.stringify(updatedMessages[i]));
      }
      await redisClient.lTrim(key, 0, 49);
    }
  } catch (err) {
    console.error('更新群组消息缓存用户信息失败:', err.message);
  }
}

// 更新群组消息缓存中群组的信息（如头像）
async function updateGroupMessageCacheGroupInfo(groupId, updates) {
  try {
    const key = `scr:message:group:${groupId}`;
    const messages = await redisClient.lRange(key, 0, -1);
    if (messages.length === 0) return;
    
    let hasChanges = false;
    const updatedMessages = messages.map(msg => {
      const message = JSON.parse(msg);
      let changed = false;
      
      // 更新群名片中的群组信息
      if (message.group_card && String(message.group_card.group_id) === String(groupId)) {
        if (updates.avatarUrl !== undefined) {
          message.group_card.avatar_url = updates.avatarUrl;
          message.group_card.avatarUrl = updates.avatarUrl;
          changed = true;
        }
        if (updates.groupName !== undefined) {
          message.group_card.group_name = updates.groupName;
          changed = true;
        }
        if (updates.groupDescription !== undefined) {
          message.group_card.group_description = updates.groupDescription;
          changed = true;
        }
      }
      
      // 更新引用消息中的群名片信息
      if (message.quoted_message && message.quoted_message.group_card && 
          String(message.quoted_message.group_card.group_id) === String(groupId)) {
        if (updates.avatarUrl !== undefined) {
          message.quoted_message.group_card.avatar_url = updates.avatarUrl;
          message.quoted_message.group_card.avatarUrl = updates.avatarUrl;
          changed = true;
        }
        if (updates.groupName !== undefined) {
          message.quoted_message.group_card.group_name = updates.groupName;
          changed = true;
        }
      }
      
      if (changed) {
        hasChanges = true;
      }
      return JSON.stringify(message);
    });
    
    if (hasChanges) {
      await redisClient.del(key);
      for (let i = updatedMessages.length - 1; i >= 0; i--) {
        await redisClient.lPush(key, updatedMessages[i]);
      }
      await redisClient.lTrim(key, 0, 199);
    }
  } catch (err) {
    console.error('更新群组消息缓存群组信息失败:', err.message);
  }
}

// 获取所有群组 ID 列表
async function getAllGroupIds() {
  try {
    const [groups] = await pool.execute('SELECT id FROM chat_groups');
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// IP封禁验证中间件
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
      console.error('❌ [API] IP验证失败: 无法获取客户端IP');
      return res.status(403).json({ status: 'error', message: '访问被拒绝' });
    }

    // 检查IP是否被封禁
    const [bannedIPs] = await pool.execute(
      'SELECT id, reason, expires_at FROM chat_banned_ips WHERE ip_address = ? AND (expires_at IS NULL OR expires_at > NOW())',
      [clientIP]
    );

    if (bannedIPs.length > 0) {
      const bannedIP = bannedIPs[0];
      const banInfo = {
        reason: bannedIP.reason || '违反使用规则',
        banUntil: bannedIP.expires_at
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

// 组合验证中间件：IP验证 + 会话验证
async function validateIPAndSession(req, res, next) {
  try {
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
      console.error('❌ [API] IP验证失败: 无法获取客户端IP');
      return res.status(403).json({ status: 'error', message: '访问被拒绝' });
    }

    // 检查IP是否被封禁
    const [bannedIPs] = await pool.execute(
      'SELECT id, reason, expires_at FROM chat_banned_ips WHERE ip_address = ? AND (expires_at IS NULL OR expires_at > NOW())',
      [clientIP]
    );

    if (bannedIPs.length > 0) {
      const bannedIP = bannedIPs[0];
      const banInfo = {
        reason: bannedIP.reason || '违反使用规则',
        banUntil: bannedIP.expires_at
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
    fileSize: 5 * 1024 * 1024
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

// HTML字符转义函数
function escapeHtml(text) {
  if (text === null || text === undefined || typeof text !== 'string') return text;
  return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
}

// 输入验证和清理函数 - 转义所有HTML特殊字符
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;

  // 转义所有HTML特殊字符
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// SQL注入检测正则表达式
const sqlInjectionPattern = /(^'|'$|^"|"$|;|--|\/\*|\*\/|\b(or|and|union|select|insert|update|delete|drop|create|alter|exec|execute|xp_)|\b(1=1|0=0)\b|\bwhere\b|\bfrom\b|\bjoin\b|\bcase\b|\bwhen\b|\bthen\b|\belse\b|\bend\b)/i;

function validateUsername(username) {
  try {
    if (!username || typeof username !== 'string') return false;
    // 检查SQL注入
    if (sqlInjectionPattern.test(username)) return false;
    // 只进行非空检查，不再限制字符类型和长度
    const sanitized = sanitizeInput(username.trim());
    return sanitized.length > 0;
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
    const sanitized = sanitizeInput(nickname.trim());
    return sanitized.length > 0;
  } catch (error) {
    console.error('昵称验证出错:', error.message);
    return false;
  }
}

function validateMessageContent(content) {
  // 对于普通消息，要求内容是有效的字符串类型，且长度不超过10000字符
  if (content && typeof content === 'string') {
    // 直接使用原始内容，不进行HTML转义
    // 前端将负责安全的解析和渲染
    // 限制消息长度为10000字符
    if (content.length > 10000) {
      return false;
    }
    return true;
  }
  // 允许空内容的消息（用于图片消息）
  return ip;
}

// API请求日志记录中间件
app.use(async (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', async () => {
    // 排除不需要记录的路径
    const excludedPaths = ['/health', '/avatars', '/uploads', '/uploads/avatars', '/uploads/group-avatars'];
    const isExcluded = excludedPaths.some(path => req.path.startsWith(path));
    
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
    } catch (logErr) {
      // 记录API日志失败，不影响主要功能
    }
  });
  
  next();
});

// 健康检查端点
app.get('/health', async (req, res) => {
  const sessionCount = await getSessionCount();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeSessions: sessionCount,
    message: '会话永不过期模式'
  });
});

// IP和用户状态检查接口
app.get('/check-status', async (req, res) => {
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

// 临时测试端点：获取头像数据格式
/*
app.get('/test-avatar-data', async (req, res) => {
  try {
    // 查询用户数据
    const usersResult = await pool.query(`
      SELECT id, nickname, avatar_url FROM chat_users LIMIT 3;
    `);
    const users = usersResult[0];
    
    // 查询群组数据
    const groupsResult = await pool.query(`
      SELECT g.id, g.name, u.id as member_id, u.nickname, u.avatar_url 
      FROM chat_groups g 
      JOIN chat_group_members gm ON g.id = gm.group_id 
      JOIN chat_users u ON gm.user_id = u.id 
      LIMIT 1;
    `);
    const groupResults = groupsResult[0];
    
    // 处理群组数据格式
    const groupsMap = new Map();
    groupResults.forEach(row => {
      if (!groupsMap.has(row.id)) {
        groupsMap.set(row.id, {
          id: row.id,
          name: row.name,
          members: []
        });
      }
      groupsMap.get(row.id).members.push({
        id: row.member_id,
        nickname: row.nickname,
        avatar_url: row.avatar_url
      });
    });
    
    res.json({
      status: 'ok',
      users: users,
      groups: Array.from(groupsMap.values()),
      isMockData: false
    });
  } catch (error) {
    console.error('查询数据失败:', error);
    // 返回模拟数据，确保测试始终能获取到数据
    res.json({
      status: 'ok',
      users: [
        { id: 1, nickname: '测试用户1', avatar_url: '/avatars/avatar_1.png' },
        { id: 2, nickname: '测试用户2', avatar_url: null },
        { id: 3, nickname: '测试用户3', avatar_url: '/avatars/default_avatar.png' }
      ],
      groups: [
        {
          id: 1,
          name: '测试群组',
          members: [
            { id: 1, nickname: '群成员1', avatar_url: '/avatars/avatar_1.png' },
            { id: 2, nickname: '群成员2', avatar_url: null }
          ]
        }
      ],
      isMockData: true,
      error: error?.message
    });
  }
});
*/

// 会话状态检查端点
app.get('/session-check', async (req, res) => {
  const userId = req.headers['user-id'] || req.query.userId;
  const sessionToken = req.headers['session-token'] || req.query.sessionToken;

  const isValid = await validateUserSession(userId, sessionToken);

  res.json({
    status: 'success',
    valid: isValid,
    userId: userId,
    message: isValid ? '会话有效（永不过期）' : '会话无效'
  });
});

// 用户名重复检查API
app.get('/check-username', async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ status: 'error', message: '用户名不能为空' });
    }
    
    // 检查用户名是否包含SQL注入
    if (!validateUsername(username)) {
      return res.status(400).json({ status: 'error', message: '用户名非法' });
    }
    
    const cleanUsername = sanitizeInput(username.trim());
    
    if (!cleanUsername) {
      return res.status(400).json({ status: 'error', message: '用户名不能为空' });
    }
    
    // 使用参数化查询预防SQL注入
    const [existingUsers] = await pool.execute(
        'SELECT id FROM chat_users WHERE username = ?',
        [cleanUsername]
    );
    
    res.json({
      status: 'success',
      isAvailable: existingUsers.length === 0,
      username: cleanUsername
    });
  } catch (err) {
    console.error('检查用户名失败:', err.message);
    res.status(500).json({ status: 'error', message: '检查用户名失败' });
  }
});

// 获取所有会话信息（调试用，需要密码验证）
app.get('/sessions', async (req, res) => {
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
app.get('/admin/login-ips', async (req, res) => {
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
app.get('/admin/api-logs', async (req, res) => {
  try {
    const { password } = req.query;
    
    // 密码验证
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ status: 'error', message: '密码错误，访问被拒绝' });
    }
    
    // 查询所有API日志记录
    const [logs] = await pool.execute(
      'SELECT id, user_id, ip_address, api_path, request_method, timestamp FROM chat_api_logs ORDER BY timestamp DESC LIMIT 1000'
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

// 管理员封禁IP接口
app.post('/admin/ban-ip', async (req, res) => {
  try {
    const { password, ipAddress, reason, expiresAt } = req.body;
    
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ status: 'error', message: '密码错误，访问被拒绝' });
    }
    
    if (!ipAddress) {
      return res.status(400).json({ status: 'error', message: '缺少IP地址参数' });
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
    
    await pool.execute(
      'INSERT INTO chat_banned_ips (ip_address, reason, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason), expires_at = VALUES(expires_at)',
      [ipAddress, reason, expiresDate]
    );
    
    const banData = {
      reason: reason || '违反使用规则',
      expires_at: expiresDate
    };
    await redisClient.hSet('scr:banned_ips', ipAddress, JSON.stringify(banData));
    
    // 向该 IP 房间广播封禁事件
    // 发送封禁通知
    io.to(`ip_${ipAddress}`).emit('ip-banned', {
      ipAddress: ipAddress,
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
        
        // 更新用户最后在线时间
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
    
    res.json({
      status: 'success',
      message: '封禁IP成功',
      data: { ipAddress, reason, expiresAt: expiresDate }
    });
  } catch (err) {
    console.error('封禁IP失败:', err.message);
    res.status(500).json({ status: 'error', message: '封禁IP失败' });
  }
});

// 管理员解封IP接口
app.post('/admin/unban-ip', async (req, res) => {
  try {
    const { password, ipAddress } = req.body;
    
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ status: 'error', message: '密码错误，访问被拒绝' });
    }
    
    if (!ipAddress) {
      return res.status(400).json({ status: 'error', message: '缺少IP地址参数' });
    }
    
    await pool.execute(
      'DELETE FROM chat_banned_ips WHERE ip_address = ?',
      [ipAddress]
    );
    
    await redisClient.hDel('scr:banned_ips', ipAddress);
    
    res.json({
      status: 'success',
      message: '解封IP成功'
    });
  } catch (err) {
    console.error('解封IP失败:', err.message);
    res.status(500).json({ status: 'error', message: '解封IP失败' });
  }
});

// 获取已封禁IP列表
app.get('/admin/banned-ips', async (req, res) => {
  try {
    const { password } = req.query;
    
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ status: 'error', message: '密码错误，访问被拒绝' });
    }
    
    const [bannedIps] = await pool.execute(
      'SELECT id, ip_address, reason, expires_at, banned_at FROM chat_banned_ips ORDER BY banned_at DESC'
    );
    
    res.json({
      status: 'success',
      bannedIps: bannedIps,
      message: '获取已封禁IP列表成功'
    });
  } catch (err) {
    console.error('获取已封禁IP列表失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取已封禁IP列表失败' });
  }
});

// 获取用户好友列表
app.get('/user/friends', validateIPAndSession, async (req, res) => {
  try {
    const userId = parseInt(req.userId);
    
    // 查询用户的好友列表，按 ID 排序
    const [friends] = await pool.execute(`
      SELECT cu.id, cu.nickname, cu.username, cu.gender, cu.avatar_url
      FROM chat_friends cf 
      JOIN chat_users cu ON cf.friend_id = cu.id 
      WHERE cf.user_id = ?
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
app.post('/user/add-friend', validateIPAndSession, async (req, res) => {
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
    
    // 检查是否已经是好友
    const [existing] = await pool.execute(
      'SELECT id FROM chat_friends WHERE user_id = ? AND friend_id = ?',
      [userId, friendIdNum]
    );
    if (existing.length > 0) {
      return res.status(400).json({ status: 'error', message: '已经是好友了' });
    }
    
    // 添加双向好友关系
    await pool.execute('INSERT INTO chat_friends (user_id, friend_id) VALUES (?, ?)', [userId, friendIdNum]);
    await pool.execute('INSERT INTO chat_friends (user_id, friend_id) VALUES (?, ?)', [friendIdNum, userId]);
    
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
app.post('/user/remove-friend', validateIPAndSession, async (req, res) => {
  try {
    const userId = parseInt(req.userId);
    const { friendId } = req.body;

    if (!friendId || isNaN(friendId)) {
      return res.status(400).json({ status: 'error', message: '好友ID无效' });
    }

    const friendIdNum = parseInt(friendId);

    // 删除双向好友关系
    await pool.execute('DELETE FROM chat_friends WHERE user_id = ? AND friend_id = ?', [userId, friendIdNum]);
    await pool.execute('DELETE FROM chat_friends WHERE user_id = ? AND friend_id = ?', [friendIdNum, userId]);

    // 删除私信消息
    await pool.execute('DELETE FROM chat_private_messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)',
        [userId, friendIdNum, friendIdNum, userId]);

    // 删除双方的该私信未读记录 - 修正JSON路径
    await pool.execute('UPDATE chat_users SET unread_private_messages = JSON_REMOVE(unread_private_messages, ?) WHERE id = ?',
        [`$."${friendIdNum}"`, userId]);  // 添加双引号
    await pool.execute('UPDATE chat_users SET unread_private_messages = JSON_REMOVE(unread_private_messages, ?) WHERE id = ?',
        [`$."${userId}"`, friendIdNum]);  // 添加双引号

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
app.get('/user/search', validateIPAndSession, async (req, res) => {
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

app.get('/refresh-messages', validateIPAndSession, async (req, res) => {
  try {
    const { groupId, lastUpdate } = req.query;
    
    let messages;
    if (groupId) {
      messages = await getGroupMessages(groupId);
    } else {
      messages = await getGlobalMessages();
    }
    
    res.json({
      status: 'success',
      messages: messages,
      hasNewMessages: messages.length > 0 && lastUpdate && messages[0].timestamp > parseInt(lastUpdate)
    });
  } catch (err) {
    console.error('刷新消息失败:', err.message);
    res.status(500).json({ status: 'error', message: '刷新消息失败' });
  }
});

// 初始化数据库
async function initializeDatabase() {
  try {
    const createUsersTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        nickname VARCHAR(255) NOT NULL,
        avatar_url VARCHAR(500) DEFAULT NULL,
        last_online TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX username_index (username),
        INDEX last_online_index (last_online)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    const createMessagesTableQuery = `
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        content TEXT,
        message_type INT NOT NULL DEFAULT '0' COMMENT '0代表文字，1代表图片，2代表文件，4代表引用消息',
        group_id INT DEFAULT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX user_id_index (user_id),
        INDEX group_id_index (group_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    const createGroupsTableQuery = `
      CREATE TABLE IF NOT EXISTS groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        creator_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX creator_id_index (creator_id),
        FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    const createGroupMembersTableQuery = `
      CREATE TABLE IF NOT EXISTS group_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        group_id INT NOT NULL,
        user_id INT NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX group_id_index (group_id),
        INDEX user_id_index (user_id),
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_member (group_id, user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    const createIPLogsTableQuery = `
      CREATE TABLE IF NOT EXISTS chat_ip_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT DEFAULT NULL,
        ip_address VARCHAR(45) NOT NULL,
        action VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX ip_index (ip_address),
        INDEX action_index (action)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    const createAPILogsTableQuery = `
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
    `;

    const createBannedIPsTableQuery = `
      CREATE TABLE IF NOT EXISTS chat_banned_ips (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip_address VARCHAR(45) NOT NULL UNIQUE,
        reason VARCHAR(255) DEFAULT NULL,
        banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL DEFAULT NULL,
        INDEX ip_index (ip_address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    
    const createFileRequestLogsTableQuery = `
      CREATE TABLE IF NOT EXISTS chat_file_request_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        request_time DATETIME NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        FOREIGN KEY (user_id) REFERENCES chat_users(id) ON DELETE CASCADE,
        INDEX idx_file_requests_user_time (user_id, request_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    // 注意：如果需要重新创建表，需要将表名改为chat_开头
    // await pool.execute(createUsersTableQuery);
    // await pool.execute(createMessagesTableQuery);
    // await pool.execute(createGroupsTableQuery);
    // await pool.execute(createGroupMembersTableQuery);
    // await pool.execute(createIPLogsTableQuery);
    // await pool.execute(createBannedIPsTableQuery);
    
    // 创建用户表（使用chat_前缀）
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
        unread_group_messages JSON COMMENT '存储用户群组的未读消息，格式为{群组 ID: 未读数量}',
        unread_private_messages JSON COMMENT '存储用户私信的未读消息，格式为{用户 ID: 未读数量}',
        INDEX username_index (username),
        INDEX last_online_index (last_online)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    // 初始化现有用户的未读消息字段（如果为空）
    await pool.execute(`
      UPDATE chat_users 
      SET 
        unread_group_messages = IFNULL(unread_group_messages, '{}'),
        unread_private_messages = IFNULL(unread_private_messages, '{}') 
      WHERE 1
    `);
    
    // 创建文件请求日志表（使用chat_前缀）
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_file_request_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        request_time DATETIME NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        FOREIGN KEY (user_id) REFERENCES chat_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    // 创建索引以提高查询性能
    try {
      await pool.execute('CREATE INDEX idx_chat_file_requests_user_time ON chat_file_request_logs(user_id, request_time);');
    } catch (err) {
      // 索引已存在时忽略错误
      if (!err.message.includes('Duplicate key')) {
        console.error('创建索引失败:', err.message);
      }
    }
    
    // 创建会话存储表（只存储 refresh_token）
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
      
      // 创建API请求日志表
      await pool.execute(createAPILogsTableQuery);
      
      // 创建群组表（使用chat_前缀）
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS chat_groups (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          creator_id INT NOT NULL,
          avatar_url VARCHAR(500) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX creator_id_index (creator_id),
          FOREIGN KEY (creator_id) REFERENCES chat_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      
      // 创建群组加入Token表
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS chat_group_invite_tokens (
          id INT AUTO_INCREMENT PRIMARY KEY,
          group_id INT NOT NULL,
          token VARCHAR(255) NOT NULL UNIQUE,
          expires DATETIME NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_by INT NOT NULL,
          FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES chat_users(id) ON DELETE CASCADE,
          INDEX idx_chat_group_invite_tokens_token (token),
          INDEX idx_chat_group_invite_tokens_group_id (group_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      
      // 创建好友关系表
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS chat_friends (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          friend_id INT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES chat_users(id) ON DELETE CASCADE,
          FOREIGN KEY (friend_id) REFERENCES chat_users(id) ON DELETE CASCADE,
          UNIQUE KEY unique_friendship (user_id, friend_id),
          INDEX idx_friends_user_id (user_id),
          INDEX idx_friends_friend_id (friend_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      
      // 创建私信消息表
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS chat_private_messages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sender_id INT NOT NULL,
          receiver_id INT NOT NULL,
          content TEXT,
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

      // 创建群组消息表
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          content TEXT,
          message_type INT NOT NULL DEFAULT '0' COMMENT '0代表文字，1代表图片，2代表文件，4代表引用消息',
          group_id INT DEFAULT NULL,
          image_url VARCHAR(500) DEFAULT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX user_id_index (user_id),
          INDEX group_id_index (group_id),
          INDEX timestamp_index (timestamp),
          FOREIGN KEY (user_id) REFERENCES chat_users(id) ON DELETE CASCADE,
          FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 创建群组成员表
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS chat_group_members (
          id INT AUTO_INCREMENT PRIMARY KEY,
          group_id INT NOT NULL,
          user_id INT NOT NULL,
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX group_id_index (group_id),
          INDEX user_id_index (user_id),
          UNIQUE KEY unique_member (group_id, user_id),
          FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES chat_users(id) ON DELETE CASCADE
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

// 同步数据库封禁IP记录到Redis - 使用 Pipeline 优化
async function syncBannedIPsToRedis() {
  try {
    // const startTime = Date.now();
    
    // 获取所有有效的封禁IP记录
    const [bannedIPs] = await pool.execute(
      'SELECT ip_address, reason, expires_at FROM chat_banned_ips WHERE expires_at IS NULL OR expires_at > NOW()'
    );
    
    // 清空Redis中的封禁IP集合
    await redisClient.del('scr:banned_ips');
    
    if (bannedIPs.length === 0) {
      return;
    }
    
    // 使用 Pipeline 批量写入 Redis（减少网络往返）
    const pipeline = redisClient.multi();
    
    for (const ban of bannedIPs) {
      const banData = {
        reason: ban.reason || '违反使用规则',
        expires_at: ban.expires_at
      };
      pipeline.hSet('scr:banned_ips', ban.ip_address, JSON.stringify(banData));
    }
    
    // 执行 Pipeline（一次网络往返）
    await pipeline.exec();
    
    // const elapsed = Date.now() - startTime;
    // console.log(`✅ 已同步 ${bannedIPs.length} 条封禁IP记录到Redis，耗时 ${elapsed}ms`);
  } catch (err) {
    console.error('同步封禁IP到Redis失败:', err.message);
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
             m.content, m.message_type as messageType, m.group_id as groupId, m.timestamp
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
      const baseMessage = {
        ...msg,
        groupId: msg.groupId !== null && msg.groupId !== undefined ? parseInt(msg.groupId) : null
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
    
    return processedMessages;
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
             m.content, m.message_type as messageType, m.timestamp
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
      const baseMessage = {
        ...msg,
        groupId: safeGroupId
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
    
    return processedMessages;
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
    // console.log(`IP日志: ${ip} - ${action} - 用户: ${userId || '未登录'}`);
  } catch (err) {
    console.error('记录IP日志失败:', err.message);
  }
}

// 用户注册接口
app.post('/register', async (req, res) => {
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

    if (!validateUsername(username)) {
      return res.status(400).json({ status: 'error', message: '用户名或密码非法' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ status: 'error', message: '用户名或密码非法' });
    }

    if (!validateNickname(nickname)) {
      return res.status(400).json({ status: 'error', message: '用户名或密码非法' });
    }

    const cleanUsername = sanitizeInput(username);
    const cleanNickname = sanitizeInput(nickname);

    const [existingUsers] = await pool.execute(
        'SELECT id FROM chat_users WHERE username = ?',
        [cleanUsername]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ status: 'error', message: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
        'INSERT INTO chat_users (username, password, nickname, gender, last_online) VALUES (?, ?, ?, ?, NOW())',
        [cleanUsername, hashedPassword, cleanNickname, genderNum]
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
app.post('/update-signature', validateIPAndSession, async (req, res) => {
  try {
    const userId = req.headers['user-id'];
    const { signature } = req.body;

    if (!userId) {
      return res.status(400).json({ status: 'error', message: '用户 ID 不能为空' });
    }

    // 验证个性签名长度
    const cleanSignature = signature ? sanitizeInput(signature).substring(0, 500) : null;

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
app.post('/update-gender', validateIPAndSession, async (req, res) => {
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
app.post('/user/change-password', validateIPAndSession, async (req, res) => {
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
app.post('/user/update-nickname', validateIPAndSession, async (req, res) => {
  try {
    const userId = req.userId;
    const { newNickname } = req.body;

    if (!validateNickname(newNickname)) {
      return res.status(400).json({ status: 'error', message: '昵称不能为空' });
    }

    const cleanNickname = sanitizeInput(newNickname);

    await pool.execute(
      'UPDATE chat_users SET nickname = ? WHERE id = ?',
      [cleanNickname, userId]
    );

    // 更新全局消息缓存中该用户的昵称
    await updateGlobalMessageCacheUserInfo(userId, { nickname: cleanNickname });

    // 获取用户所在的群组，更新群组消息缓存
    const [ memberships ] = await pool.execute(
      'SELECT group_id FROM chat_group_members WHERE user_id = ?',
      [userId]
    );
    for (const membership of memberships) {
      await updateGroupMessageCacheUserInfo(membership.group_id, userId, { nickname: cleanNickname });
    }

    // 更新在线用户列表中的昵称
    await updateOnlineUserByUserId(userId, { nickname: cleanNickname });

    // 广播昵称更新事件
    io.emit('nickname-updated', {
      userId: userId,
      nickname: cleanNickname
    });

    res.json({ status: 'success', message: '昵称修改成功', nickname: cleanNickname });
  } catch (err) {
    console.error('修改昵称失败:', err.message);
    res.status(500).json({ status: 'error', message: '修改昵称失败' });
  }
});

// 用户登录接口
app.post('/login', async (req, res) => {
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

    const cleanUsername = sanitizeInput(username);

    const [users] = await pool.execute(
        'SELECT id, username, password, nickname, gender, avatar_url FROM chat_users WHERE username = ?',
        [cleanUsername]
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
app.post('/refresh-token', async (req, res) => {
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
app.get('/group/:id', validateIPAndSession, async (req, res) => {
  try {
    const groupId = req.params.id;

    const [groups] = await pool.execute(
        'SELECT id, name, description, creator_id, avatar_url, created_at FROM chat_groups WHERE id = ?',
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
app.get('/user/:id', validateIPAndSession, async (req, res) => {
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
app.post('/upload-group-avatar/:groupId', validateIPAndSession, groupAvatarUpload.single('avatar'), async (req, res, next) => {
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
        'SELECT id, name, creator_id FROM chat_groups WHERE id = ? AND creator_id = ?',
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
        'UPDATE chat_groups SET avatar_url = ? WHERE id = ?',
        [avatarUrlWithVersion, groupId]
    );

    // 更新群组消息缓存中该群组的头像
    await updateGroupMessageCacheGroupInfo(groupId, { avatarUrl: avatarUrlWithVersion });

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
app.post('/upload-avatar', validateIPAndSession, avatarUpload.single('avatar'), async (req, res, next) => {
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

    // 更新全局消息缓存中该用户的头像
    await updateGlobalMessageCacheUserInfo(userId, { avatarUrl: avatarUrlWithVersion });

    // 获取用户所在的群组，更新群组消息缓存
    const [ memberships ] = await pool.execute(
      'SELECT group_id FROM chat_group_members WHERE user_id = ?',
      [userId]
    );
    for (const membership of memberships) {
      await updateGroupMessageCacheUserInfo(membership.group_id, userId, { avatarUrl: avatarUrlWithVersion });
    }

    // 更新在线用户列表中的头像
    await updateOnlineUserByUserId(userId, { avatarUrl: avatarUrlWithVersion });

    // 广播头像更新事件
    io.emit('avatar-updated', {
      userId: userId,
      avatarUrl: avatarUrlWithVersion
    });

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
app.get('/avatar-storage', validateIPAndSession, async (req, res) => {
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

// 获取用户未读消息统计
app.get('/unread-messages', validateIPAndSession, async (req, res) => {
  try {
    const userId = req.userId;
    
    // 查询用户的未读消息
    const [users] = await pool.execute(
      'SELECT unread_group_messages FROM chat_users WHERE id = ?',
      [parseInt(userId)]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: '用户不存在' });
    }
    
    const unreadMessages = users[0].unread_group_messages || {};
    
    // 统计总未读消息数量
    let totalUnread = 0;
    for (const groupId in unreadMessages) {
      if (unreadMessages.hasOwnProperty(groupId)) {
        totalUnread += parseInt(unreadMessages[groupId]) || 0;
      }
    }
    
    res.json({
      status: 'success',
      unreadMessages: unreadMessages,
      totalUnread: totalUnread
    });
  } catch (err) {
    console.error('获取未读消息失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取未读消息失败' });
  }
});

// 创建群组接口
app.post('/create-group', validateIPAndSession, async (req, res) => {
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

    const cleanGroupName = sanitizeInput(groupName);
    const cleanDescription = description ? sanitizeInput(description) : '';

    // 移除3人限制，改为1人
    const allMemberIds = [...new Set([parseInt(userId), ...memberIds.map(id => parseInt(id))])];
    
    // 获取创建者的所有好友ID
    const [friendIds] = await pool.execute(
      'SELECT friend_id FROM chat_friends WHERE user_id = ?',
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
        [cleanGroupName, cleanDescription, userId]
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
      WHERE g.id = ?
    `, [groupId]);

    const [groupMembers] = await pool.execute(`
      SELECT u.id, u.nickname, u.avatar_url 
      FROM chat_group_members gm 
      JOIN chat_users u ON gm.user_id = u.id 
      WHERE gm.group_id = ?
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
      
    // 向所有群组成员广播群组创建事件（使用群组房间）
    io.to(`group_${groupId}`).emit('group-created', {
      groupId: groupId,
      groupName: cleanGroupName,
      creatorId: userId,
      members: groupMembers
    });

    res.json({
      status: 'success',
      message: '群组创建成功',
      group: groups[0],
      members: groupMembers
    });
  } catch (err) {
    console.error('创建群组失败:', err.message);
    res.status(500).json({ status: 'error', message: '创建群组失败' });
  }
});

// 获取用户群组列表接口
app.get('/user-groups/:userId', validateIPAndSession, async (req, res) => {
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
      WHERE gm.user_id = ?
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
app.get('/available-group-members/:groupId', validateIPAndSession, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.userId; // 从validateSession中间件获取

    // 首先检查请求者是否为群主
    const [group] = await pool.execute(
      'SELECT creator_id FROM chat_groups WHERE id = ?',
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
      WHERE f.user_id = ? AND u.id NOT IN (
        SELECT user_id FROM chat_group_members WHERE group_id = ?
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
app.get('/group-info/:groupId', validateIPAndSession, async (req, res) => {
  try {
    const groupId = req.params.groupId;

    const [group] = await pool.execute(
      'SELECT id, name, description, creator_id, created_at, avatar_url FROM chat_groups WHERE id = ?',
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
app.get('/group-members/:groupId', validateIPAndSession, async (req, res) => {
  try {
    const groupId = req.params.groupId;

    const [members] = await pool.execute(`
      SELECT u.id, u.nickname, u.avatar_url as avatarUrl 
      FROM chat_group_members gm 
      JOIN chat_users u ON gm.user_id = u.id 
      WHERE gm.group_id = ?
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
app.post('/remove-group-member', validateIPAndSession, async (req, res) => {
  try {
    const { groupId, memberId } = req.body;
    const userId = req.userId; // 从validateSession中间件获取

    // 验证参数
    if (!groupId || !memberId) {
      return res.status(400).json({ success: false, message: '参数错误' });
    }

    // 检查请求者是否为群主
    const [group] = await pool.execute(
      'SELECT creator_id FROM chat_groups WHERE id = ?',
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
      'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ?',
      [groupId, memberId]
    );

    if (!member || member.length === 0) {
      return res.status(404).json({ success: false, message: '该成员不在群组中' });
    }

    // 不能踢出自己（群主自己）
    if (parseInt(memberId) === parseInt(userId)) {
      return res.status(400).json({ success: false, message: '不能踢出自己' });
    }

    // 执行踢出操作
    await pool.execute(
      'DELETE FROM chat_group_members WHERE group_id = ? AND user_id = ?',
      [groupId, memberId]
    );

    // 获取群组所有成员，向他们广播成员移除事件
    const [allMembers] = await pool.execute(
      'SELECT user_id FROM chat_group_members WHERE group_id = ?',
      [groupId]
    );
    
    // 向所有群组成员广播成员被踢出事件（使用群组房间）
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
app.post('/add-group-members', validateIPAndSession, async (req, res) => {
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
      'SELECT creator_id FROM chat_groups WHERE id = ?',
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
      'SELECT friend_id FROM chat_friends WHERE user_id = ?',
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
      `SELECT user_id FROM chat_group_members WHERE group_id = ? AND user_id IN (${placeholders})`,
      [groupId].concat(cleanMemberIds)
    );

    const existingUserIds = new Set(existingMembers.map(m => m.user_id));
    const newMemberIds = cleanMemberIds.filter(id => !existingUserIds.has(id));

    if (newMemberIds.length === 0) {
      return res.status(400).json({ status: 'error', message: '所选用户已在群组中' });
    }

    // 添加新成员
    const memberValues = newMemberIds.map(memberId => [groupId, memberId]);
    await pool.query(
      'INSERT INTO chat_group_members (group_id, user_id) VALUES ?',
      [memberValues]
    );

    // 获取更新后的群组成员列表
    const [updatedMembers] = await pool.execute(
      `SELECT u.id, u.nickname, u.avatar_url as avatarUrl 
      FROM chat_group_members gm 
      JOIN chat_users u ON gm.user_id = u.id 
      WHERE gm.group_id = ?`,
      [groupId]
    );

    // 通知所有群成员有新成员加入
    const [newMembersInfo] = await pool.execute(
      `SELECT u.id, u.nickname, u.avatar_url as avatarUrl 
      FROM chat_users u 
      WHERE u.id IN (${newMemberIds.map(() => '?').join(',')})`,
      newMemberIds
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

    // 获取群组所有成员，向他们广播成员添加事件
    const [allMembers] = await pool.execute(
      'SELECT user_id FROM chat_group_members WHERE group_id = ?',
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

// 获取群组消息接口
app.get('/group-messages/:groupId', validateIPAndSession, async (req, res) => {
  try {
    const groupId = req.params.groupId;

    const [messages] = await pool.execute(`
      SELECT m.id, m.user_id as userId, u.nickname, u.avatar_url as avatarUrl, 
             m.content, m.image_url as imageUrl, m.message_type as messageType, m.timestamp 
      FROM chat_messages m 
      JOIN chat_users u ON m.user_id = u.id 
      WHERE m.group_id = ? 
      ORDER BY m.timestamp DESC LIMIT 200
    `, [groupId]);

    // 不再在后端对消息内容进行marked解析，直接返回原始内容
    // 前端将负责使用safeMarkdownParse函数进行安全的解析和渲染

    res.json({
      status: 'success',
      messages: messages.reverse()
    });
  } catch (err) {
    console.error('获取群组消息失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取群组消息失败' });
  }
});

// 生成群组邀请Token
app.post('/generate-group-token', validateIPAndSession, async (req, res) => {
  try {
    const { groupId } = req.body;
    const userId = req.userId;
    
    if (!groupId) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }
    
    // 检查用户是否为群组成员
    const [member] = await pool.execute(
      'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );
    
    if (!member || member.length === 0) {
      return res.status(403).json({ status: 'error', message: '只有群组成员可以生成邀请Token' });
    }
    
    // 生成唯一Token
    const token = crypto.randomBytes(16).toString('hex');
    // 设置Token有效期为7天
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    // 存储Token
    await pool.execute(
      'INSERT INTO chat_group_invite_tokens (group_id, token, expires, created_by) VALUES (?, ?, ?, ?)',
      [groupId, token, expires, userId]
    );
    
    res.json({ status: 'success', token, expires });
  } catch (err) {
    console.error('生成群组邀请Token失败:', err.message);
    res.status(500).json({ status: 'error', message: '生成邀请Token失败' });
  }
});

// 验证群组邀请Token
app.get('/validate-group-token/:token', validateIPAndSession, async (req, res) => {
  try {
    const { token } = req.params;
    
    const [tokens] = await pool.execute(
      'SELECT group_id FROM chat_group_invite_tokens WHERE token = ? AND expires > NOW()',
      [token]
    );
    
    if (!tokens || tokens.length === 0) {
      return res.status(400).json({ status: 'error', message: '无效或过期的邀请Token' });
    }
    
    const groupId = tokens[0].group_id;
    
    // 获取群组信息
    const [groups] = await pool.execute(
      'SELECT id, name, description FROM chat_groups WHERE id = ?',
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
app.post('/join-group-with-token', validateIPAndSession, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.userId;
    
    if (!token) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }
    
    // 验证Token
    const [tokens] = await pool.execute(
      'SELECT group_id FROM chat_group_invite_tokens WHERE token = ? AND expires > NOW()',
      [token]
    );
    
    if (!tokens || tokens.length === 0) {
      return res.status(400).json({ status: 'error', message: '无效或过期的邀请Token' });
    }
    
    const groupId = tokens[0].group_id;
    
    // 检查用户是否已经是群组成员
    const [members] = await pool.execute(
      'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );
    
    if (members && members.length > 0) {
      return res.status(400).json({ status: 'error', message: '你已经是该群组成员' });
    }
    
    // 加入群组
    await pool.execute(
      'INSERT INTO chat_group_members (group_id, user_id, joined_at) VALUES (?, ?, NOW())',
      [groupId, userId]
    );
    
    // 发送群组加入通知
    io.to(`group_${groupId}`).emit('member-joined', { groupId, userId });
    
    res.json({ status: 'success', message: '成功加入群组' });
  } catch (err) {
    console.error('使用Token加入群组失败:', err.message);
    res.status(500).json({ status: 'error', message: '加入群组失败' });
  }
});

// 文件上传接口 - 修改：支持'file'和'image'字段名
app.post('/upload', validateIPAndSession, checkFileRequestLimit, upload.fields([{ name: 'file' }, { name: 'image' }]), async (req, res) => {
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

    const { userId, groupId, fileType, privateChat } = req.body;

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
      
      insertQuery = 'INSERT INTO chat_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())';
      insertParams = [userId, content, messageType, safeGroupId || null];
      
      newMessage = {
        id: null, // 稍后设置
        userId,
        nickname: user.nickname,
        avatarUrl: user.avatar_url,
        content: content,
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
      
      insertQuery = 'INSERT INTO chat_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())';
      insertParams = [userId, content, messageType, safeGroupId || null];
      
      newMessage = {
        id: null, // 稍后设置
        userId,
        nickname: user.nickname,
        avatarUrl: user.avatar_url,
        content: content,
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
      
      // 将新消息添加到 Redis 群组缓存（即使失败也不影响主流程）
      try {
        await addGroupMessageToCache(safeGroupId, newMessage);
      } catch (cacheErr) {
        console.error('添加群组消息到Redis缓存失败:', cacheErr.message);
      }
      
      // 更新群组成员的未读消息计数
      try {
        // 获取群组成员列表，跳过消息发送者
        const [members] = await pool.execute(
          'SELECT user_id FROM chat_group_members WHERE group_id = ? AND user_id != ?',
          [safeGroupId, parseInt(userId)]
        );
        
        // 遍历群组成员，更新未读消息计数
        for (const member of members) {
          const memberId = member.user_id;
          
          // 使用JSON_MERGE_PATCH函数来更新未读消息计数
          await pool.execute(
            `UPDATE chat_users 
             SET unread_group_messages = JSON_MERGE_PATCH(
               COALESCE(unread_group_messages, '{}'), 
               JSON_OBJECT(?, COALESCE(CAST(JSON_EXTRACT(unread_group_messages, CONCAT('$."', ?, '"')) AS UNSIGNED), 0) + 1)
             ) 
             WHERE id = ?`,
            [groupIdStr, groupIdStr, memberId]
          );
        }
      } catch (unreadErr) {
        console.error('更新未读消息计数失败:', unreadErr.message);
    }
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
    // 将新消息添加到 Redis 缓存（即使失败也不影响主流程）
      try {
        await addGlobalMessageToCache(newMessage);
      } catch (cacheErr) {
        console.error('添加全局消息到Redis缓存失败:', cacheErr.message);
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

// 已认证用户管理（使用 Redis）
// 存储在 Redis key: scr:authenticated_users (Set)

// 添加已认证用户
async function addAuthenticatedUser(userId) {
  try {
    await redisClient.sAdd('scr:authenticated_users', String(userId));
  } catch (err) {
    console.error('添加已认证用户失败:', err.message);
  }
}

// 移除已认证用户
async function removeAuthenticatedUser(userId) {
  try {
    await redisClient.sRem('scr:authenticated_users', String(userId));
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
async function forceDisconnectUser(socket, reason = 'session-expired') {
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

    io.emit('users-list', {
      online: onlineUsersArray,
      offline: offlineUsersArray
    });
  }
  
  // 发送事件并断开连接
  socket.emit(reason);
  socket.disconnect(true);
}

// Socket.IO会话验证函数（包含IP验证）
async function validateSocketSession(socket, userData, skipAuthCheck = false) {
  // console.log(`🔐 [Socket.IO] 会话验证开始: userId=${userData.userId || 'undefined'}, socketId=${socket.id}`);
  
  // 首先验证IP
  const ipValid = await validateSocketIP(socket);
  if (!ipValid) {
    // console.log(`🚨 [Socket.IO] 会话验证失败: IP验证未通过, userId=${userData.userId || 'undefined'}`);
    await forceDisconnectUser(socket, 'session-expired');
    return false;
  }
  
  // 检查用户是否在Redis已认证列表中（除非跳过检查）
  if (!skipAuthCheck) {
    const isAuth = await isAuthenticatedUser(parseInt(userData.userId));
    if (!isAuth) {
      await forceDisconnectUser(socket, 'session-expired');
      return false;
    }
  }
  
  // 然后验证会话
  if (!userData.userId || !userData.sessionToken) {
    // console.error(`❌ [Socket.IO] 会话验证失败: 缺少必要参数, userId=${userData.userId || 'undefined'}, sessionToken=${userData.sessionToken ? 'present' : 'missing'}`);
    await forceDisconnectUser(socket, 'session-expired');
    return false;
  }

  const session = await getUserSession(parseInt(userData.userId));
  if (!session || session.token !== userData.sessionToken) {
    // console.error(`❌ [Socket.IO] 会话验证失败: token不匹配或会话不存在, userId=${userData.userId}`);
    await forceDisconnectUser(socket, 'session-expired');
    return false;
  }
  
  // console.log(`✅ [Socket.IO] 会话验证通过: userId=${userData.userId}, socketId=${socket.id}`);
  return true;
}

io.on('connection', (socket) => {
//   console.log('✅ 用户连接:', socket.id);

  // 获取聊天历史（不依赖 user-joined 事件）
  socket.on('get-chat-history', async (data) => {
      try {
        // 会话和IP验证
        const isValid = await validateSocketSession(socket, data);
        if (!isValid) {
          return;
        }
        
        // 检查是否是加载更多消息的请求
        const loadMore = data.loadMore || false;
        
        // 发送聊天历史 - 使用 Redis 缓存
        const limit = data.limit || 20;
        let messages = [];
        
        if (loadMore && data.olderThan) {
          // 如果是加载更多消息，并且提供了 olderThan 参数，获取更早的消息
          messages = await getGlobalMessages(limit, data.olderThan);
        } else {
          // 否则获取最新消息
          // 优先从 Redis 缓存中获取消息，如果缓存为空则从数据库中获取
          const cachedMessages = await getGlobalMessagesFromCache(limit);
          if (cachedMessages && cachedMessages.length > 0) {
            messages = cachedMessages;
          } else {
            // 缓存为空，从数据库中获取消息
            messages = await getGlobalMessages(limit);
          }
        }
        
        socket.emit('chat-history', {
          messages: messages,
          loadMore: loadMore
        });
      } catch (err) {
        console.error('❌ 处理获取聊天历史请求时出错:', err.message);
        socket.emit('error', { message: '获取聊天记录失败' });
      }
    });

  // 获取群组聊天历史（不依赖join-group事件）
  socket.on('get-group-chat-history', async (data) => {
      try {
        const { groupId, loadTime } = data;
        const userId = data.userId;

        
        // 确保groupId是字符串类型，避免Map键类型不一致
        const groupIdStr = String(groupId);
        
        // 会话和IP验证
        const isValid = await validateSocketSession(socket, data);
        if (!isValid) {
          return;
        }
        
        // 验证用户是否在群组中
        const [memberCheck] = await pool.query(
          'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ?',
          [groupId, userId]
        );
        
        if (memberCheck.length === 0) {
          socket.emit('error', { message: '您不在该群组中，无法查看聊天记录' });
          return;
        }
        
        // 发送群组消息历史 - 使用 Redis 缓存
        const limit = data.limit || 20;
        let messages = [];
        
        if (data.loadMore && data.olderThan) {
          // 如果是加载更多消息，并且提供了olderThan参数，获取更早的消息
          messages = await getGroupMessages(groupId, limit, data.olderThan);
        } else {
          // 否则获取最新消息
          // 优先从 Redis 缓存中获取消息，如果缓存为空则从数据库中获取
          const cachedMessages = await getGroupMessagesFromCache(groupId, limit);
          if (cachedMessages && cachedMessages.length > 0) {
            messages = cachedMessages;
          } else {
            messages = await getGroupMessages(groupId, limit);
          }
        }

        socket.emit('group-chat-history', {
          groupId: groupId,
          messages: messages,
          loadMore: data.loadMore || false,
          loadTime: loadTime
        });
      } catch (err) {
        console.error('❌ 处理获取群组聊天历史请求时出错:', err.message);
        socket.emit('error', { message: '获取群组聊天记录失败' });
      }
    });

  // 用户加入聊天室
  socket.on('user-joined', async (userData) => {
      try {
        // 会话和 IP 验证...
        const isValid = await validateSocketSession(socket, userData, true);
        if (!isValid) {
          return;
        }
        
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
            'SELECT group_id FROM chat_group_members WHERE user_id = ?',
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
            'SELECT nickname, avatar_url as avatarUrl, unread_group_messages, unread_private_messages FROM chat_users WHERE id = ?',
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
        const { nickname, avatarUrl, unread_group_messages, unread_private_messages } = user;
    
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
          sessionToken: userData.sessionToken
        });
    
        // 将用户添加到已认证集合，只有发送过 user-joined 的用户才能收到主聊天室消息
        await addAuthenticatedUser(userId);
    
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

        io.emit('users-list', {
          online: onlineUsersArray,
          offline: offlineUsersArray
        });

        // 检查是否是加载更多消息的请求
        const loadMore = userData.loadMore || false;
        
        // 发送聊天历史 - 使用 Redis 缓存
        const limit = userData.limit || 20;
        let messages = [];
        
        if (loadMore && userData.olderThan) {
          // 如果是加载更多消息，并且提供了 olderThan 参数，获取更早的消息
          messages = await getGlobalMessages(limit, userData.olderThan);
        } else {
          // 否则获取最新消息
          // 优先从 Redis 缓存中获取消息，如果缓存为空则从数据库中获取
          const cachedMessages = await getGlobalMessagesFromCache(limit);
          if (cachedMessages && cachedMessages.length > 0) {
            messages = cachedMessages;
          } else {
            // 缓存为空，从数据库中获取消息
            messages = await getGlobalMessages(limit);
          }
        }
        
        // 统计总未读消息数量
        let totalUnread = 0;
        const unreadMessages = unread_group_messages || {};
        for (const groupId in unreadMessages) {
          if (unreadMessages.hasOwnProperty(groupId)) {
            totalUnread += parseInt(unreadMessages[groupId]) || 0;
          }
        }
        
        // 统计私信未读消息数量
        let totalPrivateUnread = 0;
        const privateUnreadMessages = unread_private_messages || {};
        for (const friendId in privateUnreadMessages) {
          if (privateUnreadMessages.hasOwnProperty(friendId)) {
            totalPrivateUnread += parseInt(privateUnreadMessages[friendId]) || 0;
          }
        }

        // 如果有未读群组消息，获取每个群组的最后消息时间
        let groupLastMessageTimes = {};
        if (Object.keys(unreadMessages).length > 0) {
          try {
            const promises = Object.keys(unreadMessages).map(async (groupId) => {
              try {
                const [results] = await pool.execute(
                  'SELECT MAX(timestamp) as last_time FROM chat_messages WHERE group_id = ?',
                  [parseInt(groupId)]
                );
                if (!results || !results[0] || !results[0].last_time) {
                  return [groupId, null];
                }
                return [groupId, results[0].last_time];
              } catch (err) {
                return [groupId, null];
              }
            });
            
            const results = await Promise.all(promises);
            groupLastMessageTimes = Object.fromEntries(results);
          } catch (err) {
            console.error('获取群组最后消息时间失败:', err.message);
          }
        }

        // 如果有未读私信消息，获取每个好友的最后消息时间
        let privateLastMessageTimes = {};
        if (Object.keys(privateUnreadMessages).length > 0) {
          try {
            const promises = Object.keys(privateUnreadMessages).map(async (friendId) => {
              try {
                const [results] = await pool.execute(
                  `SELECT MAX(timestamp) as last_time FROM chat_private_messages 
                   WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)`,
                  [userId, parseInt(friendId), parseInt(friendId), userId]
                );
                if (!results || !results[0] || !results[0].last_time) {
                  return [friendId, null];
                }
                return [friendId, results[0].last_time];
              } catch (err) {
                return [friendId, null];
              }
            });
            
            const results = await Promise.all(promises);
            privateLastMessageTimes = Object.fromEntries(results);
          } catch (err) {
            console.error('获取私信最后消息时间失败:', err.message);
          }
        }

        // 发送聊天历史
        socket.emit('chat-history', {
          messages: messages,
          loadMore: loadMore,
          unreadMessages: unreadMessages,
          unreadPrivateMessages: privateUnreadMessages,
          groupLastMessageTimes: groupLastMessageTimes,
          privateLastMessageTimes: privateLastMessageTimes,
          totalUnread: totalUnread + totalPrivateUnread
        });
    
      } catch (err) {
        console.error('❌ 处理用户加入时出错:', err.message);
        socket.emit('error', { message: '获取聊天记录失败' });
      }
    });

  // 监听用户头像更新事件
  socket.on('avatar-updated', async (data) => {
    try {
    //   console.log('🖼️ 用户头像更新请求:', {
    //     socketId: socket.id,
    //     userId: data.userId
    //   });
      
      // 会话和IP验证
      const isValid = await validateSocketSession(socket, data);
      if (!isValid) {
        return;
      }
      
      // 验证参数
      if (!data.userId || !data.avatarUrl) {
        console.error('❌ 头像更新失败: 缺少必要参数');
        return;
      }
      
      // 获取当前用户信息
      const currentUser = await getOnlineUser(socket.id);
      if (!currentUser || String(currentUser.id) !== String(data.userId)) {
        console.error('❌ 头像更新失败: 用户身份验证失败');
        return;
      }
      
      // 更新在线用户列表中的头像URL
      await updateOnlineUser(socket.id, { avatarUrl: data.avatarUrl });
      
      // 保存头像URL到数据库
      await pool.execute(
        'UPDATE chat_users SET avatar_url = ? WHERE id = ?',
        [data.avatarUrl, data.userId]
      );
      
      // 广播更新后的用户列表给所有客户端
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

      io.emit('users-list', {
        online: onlineUsersArray,
        offline: offlineUsersArray
      });
      
      // 同时广播头像更新事件，以便客户端更新所有消息中的头像
      io.emit('avatar-updated', {
        userId: data.userId,
        avatarUrl: data.avatarUrl
      });
      
    //   console.log('✅ 用户头像更新成功:', currentUser.nickname);
      
    } catch (err) {
      console.error('❌ 处理头像更新时出错:', err.message);
    }
  });

  // 加入群组
  socket.on('join-group', async (data) => {
      try {
        const { groupId, userId, sessionToken, loadMore = false, olderThan, limit = 20 } = data;
    
        // 会话和IP验证...
        const isValid = await validateSocketSession(socket, data);
        if (!isValid) {
          return;
        }
    
        // 确保groupId是字符串类型，避免Map键类型不一致
        const groupIdStr = String(groupId);
          
        // 验证用户是否在群组中
        const [memberCheck] = await pool.query(
          'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ?',
          [groupId, userId]
        );
        
        if (memberCheck.length === 0) {
          socket.emit('error', { message: '您不在该群组中，无法查看聊天记录' });
          return;
        }
        
        // 自动已读该群组消息
        await pool.execute(
          `UPDATE chat_users 
           SET unread_group_messages = JSON_REMOVE(
             COALESCE(unread_group_messages, '{}'), 
             CONCAT('$."', ?, '"')
           ) 
           WHERE id = ?`,
          [groupIdStr, parseInt(userId)]
        );
        
        // 获取用户的未读消息统计
        const [users] = await pool.execute(
          'SELECT unread_group_messages FROM chat_users WHERE id = ?',
          [parseInt(userId)]
        );
        
        const unreadMessages = users[0].unread_group_messages || {};
        
        // 统计总未读消息数量
        let totalUnread = 0;
        for (const gid in unreadMessages) {
          if (unreadMessages.hasOwnProperty(gid)) {
            totalUnread += parseInt(unreadMessages[gid]) || 0;
          }
        }
        
        // 发送群组消息历史 - 使用 Redis 缓存
        let messages = [];
        
        if (loadMore && olderThan) {
          // 如果是加载更多消息，并且提供了 olderThan 参数，获取更早的消息
          messages = await getGroupMessages(groupId, limit, olderThan);
        } else {
          // 否则获取最新消息
          // 优先从 Redis 缓存中获取消息，如果缓存为空则从数据库中获取
          const cachedMessages = await getGroupMessagesFromCache(groupId, limit);
          if (cachedMessages && cachedMessages.length > 0) {
            messages = cachedMessages;
          } else {
            messages = await getGroupMessages(groupId, limit);
          }
        }
        
        socket.emit('messages-loaded', {
          type: 'group',
          groupId: groupId,
          messages: messages,
          loadMore: loadMore,
          unreadMessages: unreadMessages,
          totalUnread: totalUnread
        });
      } catch (err) {
        console.error('❌ 加入群组失败:', err.message);
        socket.emit('error', { message: '获取群组聊天记录失败' });
      }
    });

  // 离开群组
  socket.on('leave-group', async (data) => {
    try {
      // 会话和IP验证
      const isValid = await validateSocketSession(socket, data);
      if (!isValid) {
        console.log('❌ 会话验证失败:', { userId, friendId });
        return;
      }
      
      const { groupId } = data;
      socket.leave(`group_${groupId}`);
    //   console.log(`👋 用户离开群组: ${groupId}, socket: ${socket.id}`);
    } catch (err) {
      console.error('❌ 离开群组失败:', err.message);
    }
  });

  // 发送消息
  socket.on('send-message', async (messageData) => {
      try {
        const { userId, content, groupId, sessionToken } = messageData;
    
        // console.log('💬 发送消息请求:', {
        //   userId: userId,
        //   groupId: groupId,
        //   contentLength: content ? content.length : 0
        // });
    
        // 会话和 IP 验证...
        const isValid = await validateSocketSession(socket, messageData);
        if (!isValid) {
          return;
        }
    
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
          // 先检查群组是否存在
          const [groupCheck] = await pool.execute(
            'SELECT id FROM chat_groups WHERE id = ?',
            [parseInt(groupId)]
          );
          
          if (groupCheck.length === 0) {
            socket.emit('error', { message: '群组不存在' });
            return;
          }
          
          const [memberCheck] = await pool.execute(
            'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ?',
            [parseInt(groupId), parseInt(userId)]
          );
          
          if (memberCheck.length === 0) {
            socket.emit('error', { message: '您不在该群组中，无法发送消息' });
            return;
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
        
        let messageContent = cleanContent;
        if (messageData.quotedMessage) {
          const quotedData = {
            id: messageData.quotedMessage.id,
            userId: messageData.quotedMessage.userId || messageData.quotedMessage.user_id,
            nickname: messageData.quotedMessage.nickname,
            content: messageData.quotedMessage.content,
            messageType: messageData.quotedMessage.messageType || messageData.quotedMessage.message_type || 0
          };
          messageContent = JSON.stringify({
            type: 'quoted',
            quoted: quotedData,
            text: cleanContent,
            markdone: messageData.quotedMessage.markdone || false
          });
        }
        
        const [result] = await pool.execute(
            'INSERT INTO chat_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
            [userId, messageContent, messageType, groupId || null]
        );
        
        // 广播消息 - 使用已经过HTML转义的内容
        const newMessage = {
          id: result.insertId,
          userId,
          nickname: user.nickname,
          avatarUrl: user.avatar_url,
          content: messageContent,
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
          
          // 直接将新消息添加到 Redis 群组消息缓存（即使失败也不影响主流程）
          try {
            await addGroupMessageToCache(groupId, newMessage);
          } catch (cacheErr) {
            console.error('添加群组消息到Redis缓存失败:', cacheErr.message);
          }
          
          // 更新群组成员的未读消息计数
          try {
            // 获取群组成员列表
            const [members] = await pool.execute(
              'SELECT user_id FROM chat_group_members WHERE group_id = ? AND user_id != ?',
              [parseInt(groupId), parseInt(userId)]
            );
            
            // 遍历群组成员，更新未读消息计数
            for (const member of members) {
              const memberId = member.user_id;
              
              // 使用JSON_MERGE_PATCH函数来更新未读消息计数
              await pool.execute(
                `UPDATE chat_users 
                 SET unread_group_messages = JSON_MERGE_PATCH(
                   COALESCE(unread_group_messages, '{}'), 
                   JSON_OBJECT(?, COALESCE(CAST(JSON_EXTRACT(unread_group_messages, CONCAT('$."', ?, '"')) AS UNSIGNED), 0) + 1)
                 ) 
                 WHERE id = ?`,
                [groupIdStr, groupIdStr, memberId]
              );
            }
          } catch (unreadErr) {
            console.error('更新未读消息计数失败:', unreadErr.message);
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
          // 直接将新消息添加到 Redis 全局消息缓存（即使失败也不影响主流程）
          try {
            await addGlobalMessageToCache(newMessage);
          } catch (cacheErr) {
            console.error('添加全局消息到Redis缓存失败:', cacheErr.message);
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
  socket.on('private-message', async (messageData) => {
    try {
      const { userId, content, receiverId, sessionToken } = messageData;

      // 会话和 IP 验证
      const isValid = await validateSocketSession(socket, messageData);
      if (!isValid) {
        return;
      }

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

      // 不进行严格转义，保持原始内容格式，让前端处理安全的解析和链接显示
      const cleanContent = content;

      // 获取当前精确时间戳（毫秒级和ISO格式）
      const now = new Date();
      const timestamp = now.toISOString(); // 重新添加ISO格式时间戳，用于前端显示
      const timestampMs = now.getTime();

      // 插入私信到数据库
      const messageType = messageData.message_type || messageData.messageType || 0;
      
      let messageContent = cleanContent;
      if (messageData.quotedMessage) {
        const quotedData = {
          id: messageData.quotedMessage.id,
          userId: messageData.quotedMessage.userId || messageData.quotedMessage.user_id,
          nickname: messageData.quotedMessage.nickname,
          content: messageData.quotedMessage.content,
          messageType: messageData.quotedMessage.messageType || messageData.quotedMessage.message_type || 0
        };
        messageContent = JSON.stringify({
          type: 'quoted',
          quoted: quotedData,
          text: cleanContent,
          markdone: messageData.quotedMessage.markdone || false
        });
      }
      
      const [result] = await pool.execute(
          'INSERT INTO chat_private_messages (sender_id, receiver_id, content, message_type, is_read, timestamp) VALUES (?, ?, ?, ?, 0, NOW())',
          [userId, receiverId, messageContent, messageType]
      );

      // 构建私信消息对象
      const newMessage = {
        id: result.insertId,
        senderId: userId,
        receiverId: receiverId,
        senderNickname: user.nickname,
        senderAvatarUrl: user.avatar_url,
        content: messageContent,
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

      // 更新接收者的未读私信计数，无论是否在线
      // 当接收者打开聊天窗口时，会通过 join-private-chat 事件清除未读计数
      try {
        const userIdStr = userId.toString();
        await pool.execute(
          `UPDATE chat_users 
           SET unread_private_messages = JSON_MERGE_PATCH(
             COALESCE(unread_private_messages, '{}'), 
             JSON_OBJECT(?, COALESCE(CAST(JSON_EXTRACT(unread_private_messages, CONCAT('$."', ?, '"')) AS UNSIGNED), 0) + 1)
           ) 
           WHERE id = ?`,
          [userIdStr, userIdStr, parseInt(receiverId)]
        );
      } catch (unreadErr) {
        console.error('更新私信未读计数失败:', unreadErr.message);
      }
      
      // 确认私信已发送，只给发送者发送确认事件（不再发送 private-message-received 给发送者）
      socket.emit('private-message-sent', { messageId: result.insertId, message: newMessage });

    } catch (err) {
      console.error('❌ 保存私信失败:', err.message);
      socket.emit('error', { message: '发送私信失败' });
    }
  });
  
  // 撤回私信消息
  socket.on('withdraw-private-message', async (data) => {
    try {
      const { userId, messageId, sessionToken } = data;
      
      // 会话和IP验证
      const isValid = await validateSocketSession(socket, data);
      if (!isValid) {
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
      
      // 删除数据库记录
      await pool.execute('DELETE FROM chat_private_messages WHERE id = ?', [messageId]);
      
      // 将messageId转换为数字类型
      const numericMessageId = parseInt(messageId);
      
      // 通知发送者和接收者消息已撤回
      const withdrawNotification = {
        messageId: numericMessageId,
        userId: numericUserId,
        timestamp: Date.now()
      };
      
      // 发送撤回通知给发送者
      io.to(`user_${numericUserId}`).emit('private-message-withdrawn', withdrawNotification);
      
      // 发送撤回通知给接收者
      io.to(`user_${message.receiver_id}`).emit('private-message-withdrawn', withdrawNotification);
      
      // console.log('📤 私信消息已撤回:', { messageId: numericMessageId, senderId: message.sender_id, receiverId: message.receiver_id });
      
    } catch (err) {
      console.error('❌ 撤回私信失败:', err.message);
      console.error('❌ 错误详情:', err);
      socket.emit('error', { message: '撤回私信失败', error: err.message });
    }
  });

  // 加入私人聊天
  socket.on('join-private-chat', async (data) => {
    try {
      const { userId, friendId, sessionToken, loadMore = false, olderThan, limit = 20 } = data;

      // 会话和IP验证
      const isValid = await validateSocketSession(socket, data);
      if (!isValid) {
        return;
      }

      // 确保用户ID和好友ID是数字类型
      const numericUserId = parseInt(userId);
      const numericFriendId = parseInt(friendId);
      if (isNaN(numericUserId) || isNaN(numericFriendId)) {
        socket.emit('error', { message: '无效的用户ID或好友ID' });
        return;
      }

      // 验证对方是否是自己的好友
      const [friendCheck] = await pool.query(
        'SELECT id FROM chat_friends WHERE user_id = ? AND friend_id = ?',
        [numericUserId, numericFriendId]
      );
      
      if (friendCheck.length === 0) {
        socket.emit('error', { message: '对方不是您的好友，无法查看聊天记录' });
        return;
      }

      // 清除该好友的未读私信计数
      try {
        const friendIdStr = friendId.toString();
        await pool.execute(
          `UPDATE chat_users 
           SET unread_private_messages = JSON_REMOVE(
             COALESCE(unread_private_messages, '{}'), 
             CONCAT('$."', ?, '"')
           ) 
           WHERE id = ?`,
          [friendIdStr, numericUserId]
        );
        
        // 将该好友发来的消息标记为已读
        await pool.execute(
          `UPDATE chat_private_messages 
           SET is_read = 1 
           WHERE sender_id = ? AND receiver_id = ? AND is_read = 0`,
          [numericFriendId, numericUserId]
        );
        
        // 通知发送者其消息已被读取
        const allOnlineUsers = await getAllOnlineUsers();
        for (const onlineUser of allOnlineUsers) {
          if (String(onlineUser.id) === String(numericFriendId)) {
            const senderSocket = io.sockets.sockets.get(onlineUser.socketId);
            if (senderSocket) {
              // 发送已读事件给发送者
              senderSocket.emit('private-message-read', {
                fromUserId: numericUserId,
                friendId: numericFriendId
              });
            }
            break;
          }
        }
      } catch (unreadErr) {
        console.error('清除未读私信计数失败:', unreadErr.message);
      }

      // 获取私信消息
      let messages = [];

      // 从数据库获取私人聊天记录
      let query = `
        SELECT p.id, p.sender_id as senderId, p.receiver_id as receiverId, 
               p.content, p.message_type as messageType, p.is_read as isRead, p.timestamp,
               u1.nickname as senderNickname, u1.avatar_url as senderAvatarUrl,
               u2.nickname as receiverNickname, u2.avatar_url as receiverAvatarUrl
        FROM chat_private_messages p
        JOIN chat_users u1 ON p.sender_id = u1.id
        JOIN chat_users u2 ON p.receiver_id = u2.id
        WHERE ((p.sender_id = ? AND p.receiver_id = ?) OR (p.sender_id = ? AND p.receiver_id = ?))
      `;
      
      const params = [numericUserId, numericFriendId, numericFriendId, numericUserId];
      
      // 确保limit是有效的数字
      const safeLimit = parseInt(limit);
      const finalLimit = isNaN(safeLimit) ? 20 : safeLimit;
      
      // 只有在loadMore为true时，才使用olderThan参数
      if (loadMore) {
        const olderThanNum = parseInt(olderThan);
        
        if (!isNaN(olderThanNum)) {
          query += ` AND p.id < ? `;
          params.push(olderThanNum);
        }
      }
      
      query += ` ORDER BY p.timestamp DESC, p.id DESC LIMIT ?`;
      params.push(finalLimit);
      
      const [results] = await pool.query(query, params);
      
      messages = results.map(msg => {
        const message = {
          id: msg.id,
          senderId: msg.senderId,
          receiverId: msg.receiverId,
          senderNickname: msg.senderNickname,
          senderAvatarUrl: msg.senderAvatarUrl,
          receiverNickname: msg.receiverNickname,
          receiverAvatarUrl: msg.receiverAvatarUrl,
          content: msg.content,
          messageType: msg.messageType,
          isRead: msg.isRead || 0,
          timestamp: new Date(msg.timestamp).getTime(),
          timestampISO: new Date(msg.timestamp).toISOString()
        };
        
        // 处理图片消息：从content字段解析图片URL
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

      socket.emit('messages-loaded', {
        type: 'private',
        friendId: numericFriendId,
        messages: messages,
        loadMore: loadMore
      });

    } catch (err) {
      console.error('加入私人聊天失败:', err.message);
      console.error('错误详情:', err);
      socket.emit('error', { message: '获取私人聊天记录失败', error: err.message });
    }
  });
  
  // 获取私人聊天历史，用于加载更多消息
  socket.on('get-private-chat-history', async (data) => {
    try {
      const { userId, friendId, sessionToken, loadMore = true, olderThan, limit = 20 } = data;
      
      // console.log(`📥 [私信历史] 收到请求 - userId=${userId}, friendId=${friendId}, loadMore=${loadMore}, olderThan=${olderThan}, limit=${limit}`);
      
      // 会话和IP验证
      const isValid = await validateSocketSession(socket, data);
      if (!isValid) {
        // console.log(`❌ [私信历史] 会话验证失败`);
        return;
      }

      // 确保用户ID和好友ID是数字类型
      const numericUserId = parseInt(userId);
      const numericFriendId = parseInt(friendId);
      if (isNaN(numericUserId) || isNaN(numericFriendId)) {
        console.error('❌ [私信历史] 无效的用户ID或好友ID');
        socket.emit('error', { message: '无效的用户ID或好友ID' });
        return;
      }

      // 验证对方是否是自己的好友
      const [friendCheck] = await pool.query(
        'SELECT id FROM chat_friends WHERE user_id = ? AND friend_id = ?',
        [numericUserId, numericFriendId]
      );
      
      if (friendCheck.length === 0) {
        // console.log(`❌ [私信历史] 对方不是好友`);
        socket.emit('error', { message: '对方不是您的好友，无法查看聊天记录' });
        return;
      }

      let messages = [];

      // 从数据库获取私人聊天记录
      let query = `
        SELECT p.id, p.sender_id as senderId, p.receiver_id as receiverId, 
               p.content, p.message_type as messageType, p.timestamp,
               u1.nickname as senderNickname, u1.avatar_url as senderAvatarUrl,
               u2.nickname as receiverNickname, u2.avatar_url as receiverAvatarUrl
        FROM chat_private_messages p
        JOIN chat_users u1 ON p.sender_id = u1.id
        JOIN chat_users u2 ON p.receiver_id = u2.id
      `;
      
      const params = [numericUserId, numericFriendId, numericFriendId, numericUserId];
      
      // 构建WHERE子句
      let whereClause = `WHERE ((p.sender_id = ? AND p.receiver_id = ?) OR (p.sender_id = ? AND p.receiver_id = ?))`;
      
      // 确保limit是有效的数字
      const safeLimit = parseInt(limit);
      const finalLimit = isNaN(safeLimit) ? 20 : safeLimit;
      
      // 只有在loadMore为true时，才使用olderThan参数
      if (loadMore) {
        const olderThanNum = parseInt(olderThan);
        
        if (!isNaN(olderThanNum)) {
          whereClause += ` AND p.id < ? `;
          params.push(olderThanNum);
        } else {
          // console.log(`⚠️ [私信历史] olderThan无效，返回空列表`);
          socket.emit('private-chat-history', {
            friendId: numericFriendId,
            messages: [],
            loadMore: loadMore,
            total: 0,
            limit: finalLimit
          });
          return;
        }
      }
      
      query += whereClause;
      
      query += ` ORDER BY p.timestamp DESC, p.id DESC LIMIT ?`;
      params.push(finalLimit);
      
      // console.log(`🔍 [私信历史] 执行查询 - 最终SQL: ${query}`);
      const [results] = await pool.query(query, params);
      
      messages = results.map(msg => {
        const message = {
          id: msg.id,
          senderId: msg.senderId,
          receiverId: msg.receiverId,
          senderNickname: msg.senderNickname,
          senderAvatarUrl: msg.senderAvatarUrl,
          receiverNickname: msg.receiverNickname,
          receiverAvatarUrl: msg.receiverAvatarUrl,
          content: msg.content,
          messageType: msg.messageType,
          timestamp: new Date(msg.timestamp).getTime(),
          timestampISO: new Date(msg.timestamp).toISOString()
        };
        
        // 处理图片消息：从content字段解析图片URL
        if (msg.messageType === 1 && msg.content) {
          try {
            const contentData = JSON.parse(msg.content);
            if (contentData.url) {
              message.imageUrl = contentData.url;
            }
          } catch (error) {
            console.error(`❌ 解析图片消息失败: 消息ID=${msg.id}, 错误=${error.message}`);
          }
        }
        
        return message;
      });

      // 清除该好友的未读私信计数
      try {
        const friendIdStr = friendId.toString();
        await pool.execute(
          `UPDATE chat_users 
           SET unread_private_messages = JSON_REMOVE(
             COALESCE(unread_private_messages, '{}'), 
             CONCAT('$."', ?, '"')
           ) 
           WHERE id = ?`,
          [friendIdStr, numericUserId]
        );
      } catch (unreadErr) {
        console.error('清除未读私信计数失败:', unreadErr.message);
      }

      // console.log(`✅ [私信历史] 查询完成 - 找到 ${results.length} 条消息`);
      
      // 发送私人聊天历史给客户端
      const responseData = {
        friendId: numericFriendId,
        messages: messages,
        loadMore: loadMore,
        total: messages.length,
        limit: safeLimit
      };
      
      // console.log(`📤 [私信历史] 发送响应 - friendId=${numericFriendId}, messages.length=${messages.length}, loadMore=${loadMore}`);
      socket.emit('private-chat-history', responseData);

    } catch (err) {
      console.error('❌ 获取私人聊天历史失败:', err.message);
      socket.emit('error', { message: '获取私人聊天记录失败', error: err.message });
    }
  });

  // 统一加载消息事件（支持全局、群组、私信）
  socket.on('load-messages', async (data) => {
    try {
      const { type, userId, sessionToken, limit = 20, olderThan, groupId, friendId, loadMore = false } = data;
      
      // 会话和IP验证
      const isValid = await validateSocketSession(socket, data);
      if (!isValid) {
        return;
      }

      let messages = [];
      const numericUserId = parseInt(userId);
      let responseData = { type, messages: [], loadMore: loadMore };
      
      if (type === 'global') {
        // 加载全局聊天室消息 - 完全复刻 chat-history 事件
        if (olderThan) {
          messages = await getGlobalMessages(limit, olderThan);
        } else {
          const cachedMessages = await getGlobalMessagesFromCache(limit);
          messages = cachedMessages && cachedMessages.length > 0 ? cachedMessages : await getGlobalMessages(limit);
        }
        
        // 获取用户的未读消息统计
        const [users] = await pool.execute(
          'SELECT unread_group_messages, unread_private_messages FROM chat_users WHERE id = ?',
          [numericUserId]
        );
        
        const unreadMessages = users[0].unread_group_messages || {};
        const unreadPrivateMessages = users[0].unread_private_messages || {};
        
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
        responseData.unreadMessages = {
          groups: unreadMessages
        };
        responseData.unreadPrivateMessages = unreadPrivateMessages;
        responseData.groupLastMessageTimes = groupLastMessageTimes;
        responseData.privateLastMessageTimes = privateLastMessageTimes;
        socket.emit('messages-loaded', responseData);
      } else if (type === 'group') {
        // 加载群组消息 - 完全复刻 group-chat-history 事件
        const numericGroupId = parseInt(groupId);
        
        // 验证用户是否在群组中
        const [memberCheck] = await pool.query(
          'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ?',
          [numericGroupId, numericUserId]
        );
        
        if (memberCheck.length === 0) {
          socket.emit('error', { message: '您不在该群组中，无法查看聊天记录' });
          return;
        }
        
        // 自动已读该群组消息
        const groupIdStr = String(numericGroupId);
        await pool.execute(
          `UPDATE chat_users 
           SET unread_group_messages = JSON_REMOVE(
             COALESCE(unread_group_messages, '{}'), 
             CONCAT('$."', ?, '"')
           ) 
           WHERE id = ?`,
          [groupIdStr, numericUserId]
        );
        
        // 获取用户的未读消息统计
        const [users] = await pool.execute(
          'SELECT unread_group_messages, unread_private_messages FROM chat_users WHERE id = ?',
          [numericUserId]
        );
        
        const unreadMessages = users[0].unread_group_messages || {};
        
        // 统计总未读消息数量
        let totalUnread = 0;
        for (const gid in unreadMessages) {
          if (unreadMessages.hasOwnProperty(gid)) {
            totalUnread += parseInt(unreadMessages[gid]) || 0;
          }
        }
        
        // 获取群组消息
        if (loadMore && olderThan) {
          messages = await getGroupMessages(numericGroupId, limit, olderThan);
        } else {
          const cachedMessages = await getGroupMessagesFromCache(numericGroupId, limit);
          messages = cachedMessages && cachedMessages.length > 0 ? cachedMessages : await getGroupMessages(numericGroupId, limit);
        }
        
        responseData.messages = messages;
        responseData.groupId = numericGroupId;
        responseData.unreadMessages = unreadMessages;
        responseData.totalUnread = totalUnread;
        socket.emit('messages-loaded', responseData);
      } else if (type === 'private') {
        // 加载私信消息 - 完全复刻 private-chat-history 事件
        const numericFriendId = parseInt(friendId);
        
        // 验证对方是否是自己的好友
        const [friendCheck] = await pool.query(
          'SELECT id FROM chat_friends WHERE user_id = ? AND friend_id = ?',
          [numericUserId, numericFriendId]
        );
        
        if (friendCheck.length === 0) {
          socket.emit('error', { message: '对方不是您的好友，无法查看聊天记录' });
          return;
        }
        
        // 清除该好友的未读私信计数
        try {
          const friendIdStr = numericFriendId.toString();
          await pool.execute(
            `UPDATE chat_users 
             SET unread_private_messages = JSON_REMOVE(
               COALESCE(unread_private_messages, '{}'), 
               CONCAT('$."', ?, '"')
             ) 
             WHERE id = ?`,
            [friendIdStr, numericUserId]
          );
          
          // 将该好友发来的消息标记为已读
          await pool.execute(
            `UPDATE chat_private_messages 
             SET is_read = 1 
             WHERE sender_id = ? AND receiver_id = ? AND is_read = 0`,
            [numericFriendId, numericUserId]
          );
          
          // 通知发送者其消息已被读取
          const allOnlineUsers = await getAllOnlineUsers();
          for (const onlineUser of allOnlineUsers) {
            if (String(onlineUser.id) === String(numericFriendId)) {
              const senderSocket = io.sockets.sockets.get(onlineUser.socketId);
              if (senderSocket) {
                senderSocket.emit('private-message-read', {
                  fromUserId: numericUserId,
                  friendId: numericFriendId
                });
              }
              break;
            }
          }
        } catch (unreadErr) {
          console.error('清除未读私信计数失败:', unreadErr.message);
        }
        
        let query = `
          SELECT p.id, p.sender_id as senderId, p.receiver_id as receiverId, 
                 p.content, p.message_type as messageType, p.is_read as isRead, p.timestamp,
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
          const message = {
            id: msg.id,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            senderNickname: msg.senderNickname,
            senderAvatarUrl: msg.senderAvatarUrl,
            receiverNickname: msg.receiverNickname,
            receiverAvatarUrl: msg.receiverAvatarUrl,
            content: msg.content,
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
        
        responseData.messages = messages;
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

      // 会话和IP验证...
      const isValid = await validateSocketSession(socket, data);
      if (!isValid) {
        return;
      }

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
          'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ?',
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

      // 删除数据库记录
      await pool.execute('DELETE FROM chat_messages WHERE id = ?', [messageId]);
      
      // 将messageId转换为数字类型，确保与缓存中的msg.id类型匹配
      const numericMessageId = parseInt(messageId);
      
      // 从缓存中删除消息（即使失败也不影响主流程）
      try {
        if (message.group_id) {
          // 群组消息：从群组消息缓存中删除
          const groupIdStr = String(message.group_id);
          const groupCache = await getGroupMessagesFromCache(groupIdStr, 50);
          if (groupCache && groupCache.length > 0) {
            const updatedCache = groupCache.filter(msg => parseInt(msg.id) !== numericMessageId);
            await setGroupMessagesCache(groupIdStr, updatedCache);
          }
        } else {
          // 全局消息：从全局消息缓存中删除
          const globalCache = await getGlobalMessagesFromCache(50);
          if (globalCache && globalCache.length > 0) {
            const updatedCache = globalCache.filter(msg => parseInt(msg.id) !== numericMessageId);
            await setGlobalMessagesCache(updatedCache);
          }
        }
      } catch (cacheErr) {
        console.error('从Redis缓存删除消息失败:', cacheErr.message);
      }
      
      // 广播消息删除事件
      if (message.group_id) {
        // 群组消息：向群组成员广播
        const [groupMembers] = await pool.execute(
          'SELECT user_id FROM chat_group_members WHERE group_id = ?',
          [message.group_id]
        );
        for (const member of groupMembers) {
          io.to(`user_${member.user_id}`).emit('message-deleted', { 
            messageId: messageId,
            groupId: message.group_id 
          });
        }
      } else {
        // 公共消息：全局广播
        io.emit('message-deleted', { 
          messageId: messageId,
          groupId: message.group_id 
        });
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

  // 清除私信未读消息
  socket.on('clear-unread-messages', async (data) => {
    try {
      // 会话和IP验证
      const isValid = await validateSocketSession(socket, data);
      if (!isValid) {
        return;
      }
      
      const { userId, groupId, friendId } = data;
      
      // 清除群组未读消息
      if (userId && groupId) {
        // 确保groupId是字符串类型
        const groupIdStr = String(groupId);
        
        // 更新用户的未读消息，清除指定群组的未读计数
        await pool.execute(
          `UPDATE chat_users 
           SET unread_group_messages = JSON_REMOVE(
             COALESCE(unread_group_messages, '{}'), 
             CONCAT('$."', ?, '"')
           ) 
           WHERE id = ?`,
          [groupIdStr, parseInt(userId)]
        );
        
        // 通知客户端未读消息已清除
        socket.emit('unread-messages-cleared', { groupId });
      }
      
      // 清除私信未读消息
      if (userId && friendId) {
        const friendIdStr = String(friendId);
        
        // 更新用户的未读私信消息，清除指定好友的未读计数
        await pool.execute(
          `UPDATE chat_users 
           SET unread_private_messages = JSON_REMOVE(
             COALESCE(unread_private_messages, '{}'), 
             CONCAT('$."', ?, '"')
           ) 
           WHERE id = ?`,
          [friendIdStr, parseInt(userId)]
        );
        
        // 将该好友发来的消息标记为已读
        await pool.execute(
          `UPDATE chat_private_messages 
           SET is_read = 1 
           WHERE sender_id = ? AND receiver_id = ? AND is_read = 0`,
          [parseInt(friendId), parseInt(userId)]
        );
        
        // 通知发送者其消息已被读取
        const allOnlineUsers = await getAllOnlineUsers();
        for (const onlineUser of allOnlineUsers) {
          if (String(onlineUser.id) === String(friendId)) {
            const senderSocket = io.sockets.sockets.get(onlineUser.socketId);
            if (senderSocket) {
              senderSocket.emit('private-message-read', {
                fromUserId: parseInt(userId),
                friendId: parseInt(friendId)
              });
            }
            break;
          }
        }
        
        // 通知客户端私信未读消息已清除
        socket.emit('unread-private-messages-cleared', { friendId });
      }
    } catch (err) {
      console.error('❌ 清除未读消息失败:', err.message);
      socket.emit('error', { message: '清除未读消息失败' });
    }
  });

  // 用户断开连接
  socket.on('disconnect', async (reason) => {
    // 从已认证用户集合中移除
    const user = await getOnlineUser(socket.id);
    if (user) {
      await removeAuthenticatedUser(user.id);
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

      io.emit('users-list', {
        online: onlineUsersArray,
        offline: offlineUsersArray
      });
    }
  });

  // 连接错误处理
  socket.on('error', (error) => {
    console.error('❌ Socket错误:', { socketId: socket.id, error: error.message });
  });
});

// 撤回群组中所有消息
app.post('/recall-group-messages', validateIPAndSession, async (req, res) => {
  try {
    const { groupId } = req.body;
    const userId = req.userId; // 从validateSession中间件获取
    
    // 验证请求参数
    if (!groupId) {
      return res.status(400).json({ status: 'error', message: '缺少必要参数' });
    }
    
    // 检查用户是否是群主
    const [groupResults] = await pool.execute(
      'SELECT creator_id FROM chat_groups WHERE id = ?',
      [groupId]
    );
    
    if (groupResults.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }
    
    // 验证用户是否是群组成员
    const [memberCheck] = await pool.execute(
      'SELECT id FROM chat_group_members WHERE group_id = ? AND user_id = ?',
      [parseInt(groupId), parseInt(userId)]
    );
    
    if (memberCheck.length === 0) {
      return res.status(403).json({ status: 'error', message: '您不在该群组中' });
    }
    
    const group = groupResults[0];
    if (group.creator_id !== parseInt(userId)) {
      return res.status(403).json({ success: false, message: '只有群主可以撤回全部消息' });
    }
    
    // 删除群组中所有消息
    await pool.execute(
      'DELETE FROM chat_messages WHERE group_id = ?',
      [groupId]
    );
    
    // console.log(`🗑️ 群组 ${groupId} 的所有消息已被群主 ${userId} 撤回`);
    
    // 清空 Redis 消息缓存
    await redisClient.del(`scr:message:group:${groupId}`);
    
    // 通知群组内所有用户
    io.to(`group_${groupId}`).emit('all-group-messages-recalled', { groupId });
    
    res.json({ success: true, message: '所有群消息已成功撤回' });
  } catch (error) {
    console.error('❌ 撤回群消息失败:', error);
    res.status(500).json({ success: false, message: '服务器错误，请重试' });
  }
});

// 解散群组
app.post('/dissolve-group', validateIPAndSession, async (req, res) => {
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
      'SELECT creator_id, name, avatar_url FROM chat_groups WHERE id = ?',
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
      
      // 删除群组中的所有消息
      await connection.execute(
        'DELETE FROM chat_messages WHERE group_id = ?',
        [groupId]
      );
      
      // 删除群组和成员的关联
      await connection.execute(
        'DELETE FROM chat_group_members WHERE group_id = ?',
        [groupId]
      );
      
      // 删除群组
      await connection.execute(
        'DELETE FROM chat_groups WHERE id = ?',
        [groupId]
      );
      
      // 删除所有成员的该群组未读记录
      for (const member of members) {
        await connection.execute(
          `UPDATE chat_users 
          SET unread_group_messages = JSON_REMOVE(
            COALESCE(unread_group_messages, '{}'), 
            CONCAT('$.', JSON_QUOTE(?))
          ) 
          WHERE id = ?`,
          [String(groupId), member.user_id]
        );
      }
      
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
      
      // console.log(`💥 群组 ${groupId} (${group.name}) 已被群主 ${userId} 解散，所有群消息已删除`);
      
      // 向所有群组成员发送解散事件
      for (const member of members) {
        io.to(`user_${member.user_id}`).emit('group-dissolved', { groupId });
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
app.post('/update-group-name', validateIPAndSession, async (req, res) => {
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
      'SELECT creator_id FROM chat_groups WHERE id = ?',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }

    if (parseInt(group[0].creator_id) !== parseInt(userId)) {
      return res.status(403).json({ status: 'error', message: '只有群主可以修改群组名称' });
    }

    const cleanGroupName = sanitizeInput(newGroupName);

    // 更新群组名称
    await pool.execute(
      'UPDATE chat_groups SET name = ? WHERE id = ?',
      [cleanGroupName, groupId]
    );

    // console.log(`📝 群组 ${groupId} 的名称已更新为: ${cleanGroupName}`);

    // 向所有群组成员广播群组名称更新事件（使用群组房间）
    io.to(`group_${groupId}`).emit('group-name-updated', {
      groupId: groupId,
      newGroupName: cleanGroupName
    });

    res.json({ status: 'success', message: '群组名称已更新', newGroupName: cleanGroupName });
  } catch (err) {
    console.error('修改群组名称失败:', err.message);
    res.status(500).json({ status: 'error', message: '服务器错误，请重试' });
  }
});

// 修改群组公告接口
app.post('/update-group-description', validateIPAndSession, async (req, res) => {
  try {
    const { groupId, newDescription } = req.body;
    const userId = req.userId; // 从validateSession中间件获取

    // 验证参数
    if (!groupId) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }

    // 检查用户是否是群主
    const [group] = await pool.execute(
      'SELECT creator_id FROM chat_groups WHERE id = ?',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }

    if (parseInt(group[0].creator_id) !== parseInt(userId)) {
      return res.status(403).json({ status: 'error', message: '只有群主可以修改群组公告' });
    }

    const cleanDescription = sanitizeInput(newDescription);

    // 更新群组描述
    await pool.execute(
      'UPDATE chat_groups SET description = ? WHERE id = ?',
      [cleanDescription, groupId]
    );

    // console.log(`📝 群组 ${groupId} 的公告已更新为: ${cleanDescription}`);

    // 向所有群组成员广播群组公告更新事件（使用群组房间）
    io.to(`group_${groupId}`).emit('group-description-updated', {
      groupId: groupId,
      newDescription: cleanDescription
    });

    res.json({ status: 'success', message: '群组公告已更新', newDescription: cleanDescription });
  } catch (err) {
    console.error('修改群组公告失败:', err.message);
    res.status(500).json({ status: 'error', message: '服务器错误，请重试' });
  }
});

// 用户退出群组API
app.post('/leave-group', validateIPAndSession, async (req, res) => {
  try {
    const { groupId } = req.body;
    const userId = req.userId; // 从validateSession中间件获取
    
    // 验证请求参数
    if (!groupId) {
      return res.status(400).json({ status: 'error', message: '缺少必要参数' });
    }
    
    // 检查用户是否在群组中
    const [memberResults] = await pool.execute(
      'SELECT * FROM chat_group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );
    
    if (memberResults.length === 0) {
      return res.status(404).json({ status: 'error', message: '你不在该群组中' });
    }
    
    // 检查用户是否是群主
    const [groupResults] = await pool.execute(
      'SELECT creator_id FROM chat_groups WHERE id = ?',
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
app.post('/send-message', validateIPAndSession, async (req, res) => {
  try {
    const { content, groupId } = req.body;
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

    // 清理输入 - 进行HTML转义
    const cleanContent = sanitizeInput(content);

    // 插入消息到数据库
    const [result] = await pool.execute(
        'INSERT INTO chat_messages (user_id, content, group_id, timestamp) VALUES (?, ?, ?, NOW())',
        [userId, cleanContent, groupId || null]
    );

    // 创建消息对象
    const newMessage = {
      id: result.insertId,
      userId,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      content: cleanContent,
      groupId: groupId || null,
      timestamp: new Date()
    };

    // 广播消息
    if (groupId) {
      io.to(`group_${groupId}`).emit('message-received', newMessage);
      
      // 将新消息添加到 Redis 群组消息缓存（即使失败也不影响主流程）
      try {
        await addGroupMessageToCache(groupId, newMessage);
      } catch (cacheErr) {
        console.error('添加群组消息到Redis缓存失败:', cacheErr.message);
      }
      
      // 更新群组成员的未读消息计数
      try {
        // 获取群组成员列表，跳过消息发送者
        const [members] = await pool.execute(
          'SELECT user_id FROM chat_group_members WHERE group_id = ? AND user_id != ?',
          [parseInt(groupId), parseInt(userId)]
        );
        
        // 确保groupId是字符串类型，避免Map键类型不一致
        const groupIdStr = String(groupId);
        
        // 遍历群组成员，更新未读消息计数
        for (const member of members) {
          const memberId = member.user_id;
          
          // 使用JSON_MERGE_PATCH函数来更新未读消息计数
          await pool.execute(
            `UPDATE chat_users 
             SET unread_group_messages = JSON_MERGE_PATCH(
               COALESCE(unread_group_messages, '{}'), 
               JSON_OBJECT(?, COALESCE(CAST(JSON_EXTRACT(unread_group_messages, CONCAT('$."', ?, '"')) AS UNSIGNED), 0) + 1)
             ) 
             WHERE id = ?`,
            [groupIdStr, groupIdStr, memberId]
          );
        }
      } catch (unreadErr) {
        console.error('更新未读消息计数失败:', unreadErr.message);
      }
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
      // 将新消息添加到 Redis 全局消息缓存（即使失败也不影响主流程）
      try {
        await addGlobalMessageToCache(newMessage);
      } catch (cacheErr) {
        console.error('添加全局消息到Redis缓存失败:', cacheErr.message);
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
    
    // 初始化消息缓存（不阻塞服务器启动）
    // 在后台异步初始化缓存，服务器会立即启动
    (async () => {
      try {
        // 等待一小段时间确保服务器完全启动
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 初始化全局消息缓存到 Redis（200 条）
        const globalMessages = await getGlobalMessages(200);
        // 使用 setGlobalMessagesCache 批量设置，避免多次 lTrim 导致的问题
        await setGlobalMessagesCache(globalMessages);
        // console.log(`✅ 初始化全局消息缓存完成，包含${globalMessages.length}条消息`);
        
        // 获取所有群组 ID，初始化每个群组的消息缓存到 Redis（50 条）
        const [groups] = await pool.execute('SELECT DISTINCT group_id FROM chat_messages WHERE group_id IS NOT NULL');
        for (const group of groups) {
          // 获取更多消息以确保包含所有最新消息
          const groupMessages = await getGroupMessages(group.group_id, 50);
          // 使用 setGroupMessagesCache 批量设置，避免多次 lTrim 导致的问题
          await setGroupMessagesCache(group.group_id, groupMessages);
          // console.log(`✅ 初始化群组${group.group_id}缓存完成，包含${groupMessages.length}条消息`);
        }
        
        // console.log('📊 消息缓存初始化完成');
      } catch (err) {
        console.error('❌ 初始化消息缓存失败:', err.message);
      }
    })();

    server.listen(PORT, '0.0.0.0', () => {
      console.log('🚀 服务器启动成功!');
      console.log(`📍 服务器运行在端口 ${PORT}`);
      console.log(`🔍 健康检查地址: http://localhost:${PORT}/health`);
      console.log(`🔐 会话检查地址: http://localhost:${PORT}/session-check`);
      console.log(`📊 会话调试地址: http://localhost:${PORT}/sessions`);
      console.log('🌐 允许所有来源访问');
      console.log('💡 会话模式: 永不过期');

      // 检查头像存储状态
      const storageStatus = checkAvatarStorage();
      console.log(`💾 ${storageStatus.message}`);

      console.log('\n📋 服务器配置信息:');
      console.log(`   - Ping超时: ${io.engine.opts.pingTimeout}ms`);
      console.log(`   - Ping间隔: ${io.engine.opts.pingInterval}ms`);
      console.log(`   - 连接超时: ${io.engine.opts.connectTimeout}ms`);
      console.log(`   - 升级超时: ${io.engine.opts.upgradeTimeout}ms`);
      console.log(`   - 传输方式: ${io.engine.opts.transports.join(', ')}`);
      console.log(`   - 会话模式: 永不过期（100年）`);

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