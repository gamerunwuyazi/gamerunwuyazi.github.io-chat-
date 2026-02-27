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
const svgCaptcha = require('svg-captcha');
const dotenv = require('dotenv');

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

// 配置marked安全选项
// 使用动态import导入marked，因为它是ES模块
let marked = null;
(async () => {
  try {
    const markedModule = await import('marked');
    // 检查markedModule的结构，确保获取正确的marked对象
    if (markedModule && typeof markedModule === 'object') {
      // 优先使用default导出，如果没有则直接使用markedModule
      marked = markedModule.default || markedModule;
      
      // 只有在marked对象存在且具有setOptions方法时才调用它
      if (marked && typeof marked.setOptions === 'function') {
        // 配置marked安全选项
        marked.setOptions({
          sanitize: true,
          breaks: true,
          gfm: true
        });
      } else {

      }
    }
  } catch (error) {
    console.error('Failed to load marked module:', error);
  }
})();

const messageCache = {
  global: [],
  groups: new Map(),
  lastUpdated: Date.now()
};

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

// 用户会话管理
const userSessions = new Map();

// 验证码存储，使用Map存储，键为验证码ID，值为{code: 验证码, expire: 过期时间}
const captchaStore = new Map();

// 验证码过期时间（分钟）
const CAPTCHA_EXPIRE_MINUTES = 5;

// 生成验证码ID
function generateCaptchaId() {
  return crypto.randomBytes(16).toString('hex');
}

// 生成验证码
function generateCaptcha() {
  const captcha = svgCaptcha.create({
    size: 4, // 验证码长度
    ignoreChars: '0o1iIl', // 忽略易混淆字符
    noise: 2, // 干扰线数量
    width: 120, // 宽度
    height: 40, // 高度
    fontSize: 30, // 字体大小
    color: true, // 彩色验证码
    background: '#f0f0f0' // 背景色
  });
  
  return captcha;
}

// 清理过期验证码
function cleanupExpiredCaptchas() {
  const now = Date.now();
  for (const [id, captcha] of captchaStore.entries()) {
    if (now > captcha.expire) {
      captchaStore.delete(id);
    }
  }
}

// 每5分钟清理一次过期验证码
setInterval(cleanupExpiredCaptchas, 5 * 60 * 1000);

// 生成会话令牌
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 验证用户会话 - 修改：永不过期
async function validateUserSession(userId, token) {
    if (!userId || !token) {
        // console.error('会话验证失败: 缺少userId或token');
        return false;
    }
    
    try {
        const userIdNum = parseInt(userId);
        let session = userSessions.get(userIdNum);
        
        // 如果Map中没有会话，尝试从数据库加载
        if (!session) {
            // console.log(`🔄 Map中未找到会话，尝试从数据库加载 - 用户ID: ${userIdNum}`);
            
            // 从数据库查询该用户的会话
            const [sessions] = await pool.execute(
                'SELECT user_id, token, expires, last_active, created_at FROM chat_sessions WHERE user_id = ? AND expires > NOW()',
                [userIdNum]
            );
            
            if (sessions.length > 0) {
                // 找到会话，更新到Map中
                const dbSession = sessions[0];
                session = {
                    token: dbSession.token,
                    expires: new Date(dbSession.expires).getTime(),
                    userId: parseInt(dbSession.user_id),
                    lastActive: new Date(dbSession.last_active).getTime(),
                    createdAt: new Date(dbSession.created_at).getTime()
                };
                
                userSessions.set(userIdNum, session);
                // console.log(`✅ 从数据库加载会话成功 - 用户ID: ${userIdNum}`);
            } else {
                // 数据库中也没有会话
                return false;
            }
        }
        
        if (session.token !== token) {
            // console.error('会话验证失败: token不匹配');
            return false;
        }
        
        // 修改：移除过期检查，会话永不过期
        return true;
        
    } catch (error) {
        console.error('会话验证异常:', error);
        return false;
    }
}

// 创建用户会话 - 修改：永不过期，并添加顶号提示功能
async function createUserSession(userId) {
    const token = generateSessionToken();
    // 修改：设置为100年过期，相当于永不过期
    const expires = Date.now() + (100 * 365 * 24 * 60 * 60 * 1000); // 100年
    
    const session = {
        token,
        expires,
        userId: parseInt(userId),
        lastActive: Date.now(),
        createdAt: Date.now()
    };
    
    // 检查是否已有该用户的会话（顶号检测）
        const existingSession = userSessions.get(parseInt(userId));
        if (existingSession) {
        
        // 查找该用户的在线socket连接
        for (let [socketId, user] of onlineUsers.entries()) {
            if (user.id === parseInt(userId)) {
                // 向旧连接发送顶号通知
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('account-logged-in-elsewhere', {
                        message: '您的账号在其他设备上登录，请重新登录',
                        timestamp: new Date().toISOString()
                    });

                }
                break;
            }
        }
    }
    
    userSessions.set(parseInt(userId), session);
    
    // 保存会话到数据库
    await saveSessionToDatabase(parseInt(userId), token, expires);
    
    return token;
}

// 清除过期会话 - 修改：不移除任何会话
function cleanupExpiredSessions() {
    // 当前会话永不过期，无需清理
}

// 修改：不再自动清理会话
// setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

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
  // 对于普通消息，只要求内容是有效的字符串类型，不限制长度
  if (content && typeof content === 'string') {
    // 直接使用原始内容，不进行HTML转义
    // 前端将负责安全的解析和渲染
    return true; // 不再限制长度，只要求是有效的字符串
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
      let userId = null;
      const sessionToken = req.headers['session-token'];
      if (sessionToken) {
        for (const [id, session] of userSessions.entries()) {
          if (session.token === sessionToken) {
            userId = id;
            break;
          }
        }
      }
      
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
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeSessions: userSessions.size,
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
    
    // 如果有会话令牌，根据存储的用户令牌Map找出对应的用户ID
    if (sessionToken) {
      // 遍历userSessions Map，查找对应的用户ID
      for (const [id, session] of userSessions.entries()) {
        if (session.token === sessionToken) {
          userId = id.toString();
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

// 获取验证码API
app.get('/captcha', (req, res) => {
  try {
    // 生成验证码
    const captcha = generateCaptcha();
    const captchaId = generateCaptchaId();
    
    // 计算过期时间
    const expireTime = Date.now() + CAPTCHA_EXPIRE_MINUTES * 60 * 1000;
    
    // 存储验证码
    captchaStore.set(captchaId, {
      code: captcha.text.toLowerCase(), // 转为小写存储，不区分大小写验证
      expire: expireTime
    });
    
    // 返回验证码ID和SVG数据
    res.json({
      status: 'success',
      captchaId: captchaId,
      captchaSvg: captcha.data,
      expireMinutes: CAPTCHA_EXPIRE_MINUTES
    });
  } catch (err) {
    console.error('生成验证码失败:', err.message);
    res.status(500).json({ status: 'error', message: '生成验证码失败' });
  }
});

// 获取所有会话信息（调试用，需要密码验证）
app.get('/sessions', (req, res) => {
  try {
    const { password } = req.query;
    
    // 密码验证
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ status: 'error', message: '密码错误，访问被拒绝' });
    }
    
    const sessionsArray = Array.from(userSessions.entries()).map(([userId, session]) => ({
      userId,
      token: session.token.substring(0, 10) + '...',
      createdAt: new Date(session.createdAt).toISOString(),
      lastActive: new Date(session.lastActive).toISOString(),
      expires: new Date(session.expires).toISOString()
    }));

    res.json({
      status: 'success',
      totalSessions: userSessions.size,
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

// 获取用户好友列表
app.get('/user/friends', validateIPAndSession, async (req, res) => {
  try {
    const userId = parseInt(req.userId);
    
    // 查询用户的好友列表，按最后私信消息时间排序
    const [friends] = await pool.execute(`
      SELECT cu.id, cu.nickname, cu.username, cu.avatar_url, cf.last_message_time
      FROM chat_friends cf 
      JOIN chat_users cu ON cf.friend_id = cu.id 
      WHERE cf.user_id = ?
      ORDER BY cf.last_message_time DESC, cf.created_at DESC
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
    
    // 向被添加好友的用户发送WebSocket事件，通知其更新私信会话列表
    for (let [socketId, user] of onlineUsers.entries()) {
      if (user.id === friendIdNum) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          // 发送更新好友列表的事件
          socket.emit('friend-list-updated', {
            message: '好友列表已更新',
            timestamp: Date.now()
          });
        }
        break;
      }
    }
    
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
    const friendSocket = findSocketByUserId(friendIdNum);
    if (friendSocket) {
      friendSocket.emit('friend-removed', { userId: userId });
    }

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
      SELECT id, nickname, username, avatar_url 
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
      const groupCacheSize = messageCache.groups.get(groupId)?.length || 0;

    } else {
      messages = await getGlobalMessages();

    }
    
    res.json({
      status: 'success',
      messages: messages,
      lastUpdate: messageCache.lastUpdated,
      hasNewMessages: lastUpdate && parseInt(lastUpdate) < messageCache.lastUpdated
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
        signature VARCHAR(500) DEFAULT NULL COMMENT '用户个性签名',
        avatar_url VARCHAR(500) DEFAULT NULL,
        last_online TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        unread_group_messages JSON COMMENT '存储用户群组的未读消息，格式为{群组ID: 未读数量}',
        unread_private_messages JSON COMMENT '存储用户私信的未读消息，格式为{用户ID: 未读数量}',
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
    
    // 创建会话存储表
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL UNIQUE,
          token VARCHAR(255) NOT NULL,
          expires DATETIME NOT NULL,
          last_active DATETIME NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES chat_users(id) ON DELETE CASCADE,
          INDEX idx_chat_sessions_token (token),
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
          last_message_time TIMESTAMP NULL DEFAULT NULL COMMENT '最后消息时间，用于排序',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX creator_id_index (creator_id),
          INDEX last_message_time_index (last_message_time),
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
          last_message_time TIMESTAMP NULL DEFAULT NULL COMMENT '最后私信消息时间，用于排序',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES chat_users(id) ON DELETE CASCADE,
          FOREIGN KEY (friend_id) REFERENCES chat_users(id) ON DELETE CASCADE,
          UNIQUE KEY unique_friendship (user_id, friend_id),
          INDEX idx_friends_user_id (user_id),
          INDEX idx_friends_friend_id (friend_id),
          INDEX idx_friends_last_message_time (last_message_time)
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
          sequence BIGINT NOT NULL DEFAULT 0,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (sender_id) REFERENCES chat_users(id) ON DELETE CASCADE,
          FOREIGN KEY (receiver_id) REFERENCES chat_users(id) ON DELETE CASCADE,
          INDEX idx_private_messages_sender_receiver (sender_id, receiver_id),
          INDEX idx_private_messages_receiver_sender (receiver_id, sender_id),
          INDEX idx_private_messages_sequence (sequence),
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

      // 移除不必要的ALTER TABLE语句，unread_group_messages字段已存在


  } catch (err) {
    console.error('初始化数据库失败:', err.message);
  }
}

// 从数据库加载会话到Map
async function loadSessionsFromDatabase() {
  try {

    
    // 查询所有有效的会话
    const [sessions] = await pool.execute(`
      SELECT user_id, token, expires, last_active, created_at 
      FROM chat_sessions 
      WHERE expires > NOW()
    `);
    
    // 清空现有的会话Map
    userSessions.clear();
    
    // 将数据库中的会话加载到Map中
    sessions.forEach(session => {
      userSessions.set(parseInt(session.user_id), {
        token: session.token,
        expires: new Date(session.expires).getTime(),
        userId: parseInt(session.user_id),
        lastActive: new Date(session.last_active).getTime(),
        createdAt: new Date(session.created_at).getTime()
      });
    });
    

  } catch (err) {
    console.error('❌ 从数据库加载会话失败:', err.message);
  }
}

// 保存会话到数据库
async function saveSessionToDatabase(userId, token, expires) {
  try {
    const now = new Date();
    const expiresDate = new Date(expires);
    
    // 插入或更新会话
    await pool.execute(`
      INSERT INTO chat_sessions (user_id, token, expires, last_active) 
      VALUES (?, ?, ?, ?) 
      ON DUPLICATE KEY UPDATE 
        token = VALUES(token), 
        expires = VALUES(expires), 
        last_active = VALUES(last_active)
    `, [userId, token, expiresDate, now]);
    
    // console.log(`💾 会话已保存到数据库 - 用户ID: ${userId}`);
  } catch (err) {
    console.error(`❌ 保存会话到数据库失败 - 用户ID: ${userId}, 错误:`, err.message);
  }
}

// 检查IP是否被封禁并返回详细信息，同时清理过期封禁记录
async function isIPBanned(ip) {
  try {
    // 先检查并删除该IP的过期封禁记录
    await pool.execute(
        'DELETE FROM chat_banned_ips WHERE ip_address = ? AND expires_at IS NOT NULL AND expires_at <= NOW()',
        [ip]
    );
    
    // 然后查询是否有当前有效的封禁记录
    const [results] = await pool.execute(
        'SELECT id, reason, expires_at FROM chat_banned_ips WHERE ip_address = ? AND (expires_at IS NULL OR expires_at > NOW())',
        [ip]
    );
    
    if (results.length > 0) {
      // 返回详细信息，包括是否被封禁、封禁原因和剩余封禁时间
      const { reason, expires_at } = results[0];
      let remainingTime = null;
      
      if (expires_at) {
        const now = new Date();
        const expireDate = new Date(expires_at);
        const diff = expireDate - now;
        
        // 计算剩余时间（天、小时、分钟）
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        remainingTime = {
          days,
          hours,
          minutes,
          totalSeconds: Math.floor(diff / 1000)
        };
      }
      
      return {
        isBanned: true,
        reason: reason || '违反使用规则',
        remainingTime
      };
    }
    
    return {
      isBanned: false,
      reason: null,
      remainingTime: null
    };
  } catch (err) {
    console.error('检查IP封禁失败:', err.message);
    return {
      isBanned: false,
      reason: null,
      remainingTime: null
    };
  }
}

// 记录登录尝试
async function recordLoginAttempt(ip) {
  try {
    const now = Date.now();

    const [attempts] = await pool.execute(
        'SELECT timestamp FROM chat_ip_logs WHERE ip_address = ? AND action = ? AND timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR)',
        [ip, 'login_failed']
    );

    // 修改：将登录失败次数从10次改为30次
    if (attempts.length >= 30) {
      // 修改：设置5天后自动解封
      const expireTime = new Date();
      expireTime.setDate(expireTime.getDate() + 5);
      
      await pool.execute(
          'INSERT INTO chat_banned_ips (ip_address, reason, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE reason = ?, expires_at = ?',
          [ip, '多次登录尝试失败', expireTime, '多次登录尝试失败', expireTime]
      );

    }

    return attempts.length + 1;
  } catch (err) {
    console.error('记录登录尝试失败:', err.message);
    return 0;
  }
}

async function getGlobalMessages(limit = 50, olderThan = null) {
  try {
    let query = `
      SELECT m.id, m.user_id as userId, u.nickname, u.avatar_url as avatarUrl, 
             m.content, m.message_type as messageType, m.group_id as groupId, m.timestamp, 
             m.sequence 
      FROM chat_messages m 
      JOIN chat_users u ON m.user_id = u.id 
      WHERE m.group_id IS NULL 
    `;
    
    const params = [];
    
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
    
    // 修复：改进olderThan检查逻辑，处理各种无效类型
    const isOlderThanValid = olderThan !== null && olderThan !== undefined && olderThan !== '' && olderThan !== 0 && String(olderThan).trim() !== '';
    
    if (isOlderThanValid) {
          // 确保olderThan是有效整数
          let safeOlderThan = 0;
          try {
            safeOlderThan = parseInt(olderThan);
            if (!isNaN(safeOlderThan)) {
              query += ` AND m.sequence < ? `;
              params.push(safeOlderThan);
            }
          } catch (e) {
            // 忽略无效的olderThan参数
          }
        }
    
    // 使用sequence值进行排序，确保消息顺序正确
    // 如果sequence为NULL，则使用timestamp作为排序依据，确保最新消息始终能被获取到
    query += ` ORDER BY m.sequence DESC, m.timestamp DESC LIMIT ?`;
    params.push(safeLimit);
    
    // 修复：使用pool.query代替pool.execute，避免参数类型不匹配问题
    const [messages] = await pool.query(query, params);

    // 不再在后端对消息内容进行marked解析，直接返回原始内容
    // 前端将负责使用safeMarkdownParse函数进行安全的解析和渲染
    // SQL查询已经按时间戳降序排序，不需要额外的JavaScript排序
    // 确保每个消息都有正确的sequence值和groupId类型
    const processedMessages = messages.map(msg => {
      // 创建基础消息对象
      const baseMessage = {
        ...msg,
        // 确保返回的消息对象包含所有必要的字段
        sequence: msg.sequence !== null ? parseInt(msg.sequence) : null, // 确保sequence是数字类型
        groupId: msg.groupId !== null && msg.groupId !== undefined ? parseInt(msg.groupId) : null // 确保groupId是数字类型
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
             m.content, m.message_type as messageType, m.timestamp, 
             m.sequence 
      FROM chat_messages m 
      JOIN chat_users u ON m.user_id = u.id 
      WHERE m.group_id = ? 
    `;
    
    const params = [safeGroupId];
    
    // 修复：改进olderThan检查逻辑，处理各种无效类型
    const isOlderThanValid = olderThan !== null && olderThan !== undefined && olderThan !== '' && olderThan !== 0 && String(olderThan).trim() !== '';
    
    if (isOlderThanValid) {
          // 确保olderThan是有效整数
          let safeOlderThan = 0;
          try {
            safeOlderThan = parseInt(olderThan);
            if (!isNaN(safeOlderThan)) {
              query += ` AND m.sequence < ? `;
              params.push(safeOlderThan);
            }
          } catch (e) {
            // 忽略无效的olderThan参数
          }
        }
    
    // 使用sequence值进行排序，确保消息顺序正确
    // 如果sequence为NULL，则使用timestamp作为排序依据，确保最新消息始终能被获取到
    query += ` ORDER BY m.sequence DESC, m.timestamp DESC LIMIT ?`;
    params.push(safeLimit);
    
    // 修复：使用pool.query代替pool.execute，避免参数类型不匹配问题
    const [messages] = await pool.query(query, params);

    // 不再在后端对消息内容进行marked解析，直接返回原始内容
    // 前端将负责使用safeMarkdownParse函数进行安全的解析和渲染
    // SQL查询已经按时间戳降序排序，不需要额外的JavaScript排序
    const processedMessages = messages.map(msg => {
      // 创建基础消息对象
      const baseMessage = {
        ...msg,
        sequence: msg.sequence !== null ? parseInt(msg.sequence) : null, // 确保sequence是数字类型
        groupId: safeGroupId // 直接使用已转换为数字类型的groupId
      };
      
      // 处理图片消息：从content字段解析图片URL
      if (msg.messageType === 1 && msg.content) {
        try {
          const contentData = JSON.parse(msg.content);
          if (contentData.url) {
            baseMessage.imageUrl = contentData.url;
          }
        } catch (error) {
          console.error(`❌ 解析群组图片消息失败: 消息ID=${msg.id}, 群组ID=${safeGroupId}, 错误=${error.message}`);
        }
      }
      
      return baseMessage;
    });
    
    // 只有当调用者明确需要更新缓存时，才更新缓存
    // 对于user-joined事件，我们不需要更新缓存，因为它会覆盖之前添加的图片消息
    // 所以这里不再总是更新缓存
    
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
    const { username, password, nickname, signature, captchaId, captchaCode } = req.body;
    const clientIP = getClientIP(req);

    console.log('注册请求IP:', clientIP);

    const banInfo = await isIPBanned(clientIP);
    if (banInfo.isBanned) {
      return res.status(403).json({ status: 'error', message: '您的IP已被封禁', isBanned: true, remainingTime: banInfo.remainingTime });
    }

    if (!username || !password || !nickname || !captchaId || !captchaCode) {
      return res.status(400).json({ status: 'error', message: '请填写所有字段和验证码' });
    }

    // 验证验证码
    const captcha = captchaStore.get(captchaId);
    if (!captcha) {
      return res.status(400).json({ status: 'error', message: '验证码已过期或无效' });
    }
    
    if (Date.now() > captcha.expire) {
      captchaStore.delete(captchaId);
      return res.status(400).json({ status: 'error', message: '验证码已过期' });
    }
    
    if (captchaCode.toLowerCase() !== captcha.code) {
      return res.status(400).json({ status: 'error', message: '验证码错误' });
    }
    
    // 验证码验证成功，删除验证码（只能使用一次）
    captchaStore.delete(captchaId);

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
    const cleanSignature = signature ? sanitizeInput(signature).substring(0, 500) : null;

    const [existingUsers] = await pool.execute(
        'SELECT id FROM chat_users WHERE username = ?',
        [cleanUsername]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ status: 'error', message: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
        'INSERT INTO chat_users (username, password, nickname, signature, last_online) VALUES (?, ?, ?, ?, NOW())',
        [cleanUsername, hashedPassword, cleanNickname, cleanSignature]
    );

    await logIPAction(result.insertId, clientIP, 'register');

    res.json({
      status: 'success',
      message: '注册成功',
      userId: result.insertId
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
      return res.status(400).json({ status: 'error', message: '用户ID不能为空' });
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

// 修改密码API
app.post('/user/change-password', validateIPAndSession, async (req, res) => {
  try {
    const userId = req.userId;
    const { oldPassword, newPassword, captchaId, captchaCode } = req.body;

    if (!oldPassword || !newPassword || !captchaId || !captchaCode) {
      return res.status(400).json({ status: 'error', message: '缺少必要参数' });
    }

    if (!validatePassword(newPassword)) {
      return res.status(400).json({ status: 'error', message: '新密码格式错误' });
    }

    const captcha = captchaStore.get(captchaId);
    if (!captcha) {
      return res.status(400).json({ status: 'error', message: '验证码已过期' });
    }

    if (Date.now() > captcha.expire) {
      captchaStore.delete(captchaId);
      return res.status(400).json({ status: 'error', message: '验证码已过期' });
    }

    if (captchaCode.toLowerCase() !== captcha.code) {
      return res.status(400).json({ status: 'error', message: '验证码错误' });
    }

    captchaStore.delete(captchaId);

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

    res.json({ status: 'success', message: '昵称修改成功', nickname: cleanNickname });
  } catch (err) {
    console.error('修改昵称失败:', err.message);
    res.status(500).json({ status: 'error', message: '修改昵称失败' });
  }
});

// 用户登录接口
app.post('/login', async (req, res) => {
  try {
    const { username, password, captchaId, captchaCode } = req.body;
    const clientIP = getClientIP(req);

    console.log('登录请求IP:', clientIP);

    // 检查IP是否被封禁，并获取封禁详情
    const banInfo = await isIPBanned(clientIP);
    if (banInfo.isBanned) {
      let message = '您的IP已被封禁';
      
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

    if (!username || !password || !captchaId || !captchaCode) {
      return res.status(400).json({ status: 'error', message: '请填写用户名、密码和验证码' });
    }

    // 验证验证码
    const captcha = captchaStore.get(captchaId);
    if (!captcha) {
      return res.status(400).json({ status: 'error', message: '验证码已过期或无效' });
    }
    
    if (Date.now() > captcha.expire) {
      captchaStore.delete(captchaId);
      return res.status(400).json({ status: 'error', message: '验证码已过期' });
    }
    
    if (captchaCode.toLowerCase() !== captcha.code) {
      return res.status(400).json({ status: 'error', message: '验证码错误' });
    }
    
    // 验证码验证成功，删除验证码（只能使用一次）
    captchaStore.delete(captchaId);

    if (!validateUsername(username)) {
      return res.status(400).json({ status: 'error', message: '用户名或密码非法' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ status: 'error', message: '用户名或密码非法' });
    }

    const cleanUsername = sanitizeInput(username);

    const [users] = await pool.execute(
        'SELECT id, username, password, nickname, avatar_url FROM chat_users WHERE username = ?',
        [cleanUsername]
    );

    if (users.length === 0) {
      await logIPAction(null, clientIP, 'login_failed');
      const currentAttempt = await recordLoginAttempt(clientIP);
      const maxAttempts = 30;
      const remainingAttempts = maxAttempts - currentAttempt;
      
      let message = '用户名或密码错误';
      if (remainingAttempts <= 5 && remainingAttempts > 0) {
        message += `，您还剩 ${remainingAttempts} 次登录机会，超过将被封禁`;
      }

      return res.status(400).json({ 
        status: 'error', 
        message: message,
        remainingAttempts: remainingAttempts > 0 ? remainingAttempts : 0
      });
    }

    const user = users[0];

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      await logIPAction(null, clientIP, 'login_failed');
      const currentAttempt = await recordLoginAttempt(clientIP);
      const maxAttempts = 30;
      const remainingAttempts = maxAttempts - currentAttempt;
      
      let message = '用户名或密码错误';
      if (remainingAttempts <= 5 && remainingAttempts > 0) {
        message += `，您还剩 ${remainingAttempts} 次登录机会，超过将被封禁`;
      }

      return res.status(400).json({ 
        status: 'error', 
        message: message,
        remainingAttempts: remainingAttempts > 0 ? remainingAttempts : 0
      });
    }

    await pool.execute(
        'UPDATE chat_users SET last_online = NOW() WHERE id = ?',
        [user.id]
    );

    const sessionToken = await createUserSession(user.id);

    await logIPAction(user.id, clientIP, 'login_success');

    res.json({
      status: 'success',
      message: '登录成功（会话永不过期）',
      userId: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      sessionToken: sessionToken
    });
  } catch (err) {
    console.error('登录失败:', err.message);
    res.status(500).json({ status: 'error', message: '登录失败' });
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
        'SELECT id, username, nickname, signature, avatar_url FROM chat_users WHERE id = ?',
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

// 获取离线用户列表接口
app.get('/offline-users', validateIPAndSession, async (req, res) => {
  try {
    const [offlineUsers] = await pool.execute(`
      SELECT id, nickname, last_online, avatar_url as avatarUrl 
      FROM chat_users 
      WHERE last_online IS NOT NULL 
      AND last_online >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      ORDER BY last_online DESC
    `);

    res.json({
      status: 'success',
      users: offlineUsers
    });
  } catch (err) {
    console.error('获取离线用户列表失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取离线用户列表失败' });
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

    // 更新群组头像URL
    await pool.execute(
        'UPDATE chat_groups SET avatar_url = ? WHERE id = ?',
        [avatarPath, groupId]
    );

    res.json({
      status: 'success',
      message: '群头像上传成功',
      groupId: group.id,
      groupName: group.name,
      avatarUrl: avatarPath
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
    const oldAvatarUrl = user.avatar_url;
    const avatarUrl = `/avatars/${req.file.filename}`;

    // 删除旧头像文件（如果存在且不是默认头像）
    if (oldAvatarUrl && oldAvatarUrl !== '/avatars/default.png') {
      try {
        const oldAvatarPath = path.join(__dirname, 'avatars', path.basename(oldAvatarUrl));
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
          // console.log('已删除旧头像文件:', oldAvatarPath);
        }
      } catch (deleteError) {
        console.error('删除旧头像文件失败:', deleteError.message);
        // 即使删除失败，也继续更新数据库，不阻止用户上传新头像
      }
    }

    await pool.execute(
        'UPDATE chat_users SET avatar_url = ? WHERE id = ?',
        [avatarUrl, userId]
    );

    res.json({
      status: 'success',
      avatarUrl: avatarUrl,
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

    io.emit('group-created', {
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
      SELECT g.*, gm.joined_at
      FROM chat_groups g 
      JOIN chat_group_members gm ON g.id = gm.group_id 
      WHERE gm.user_id = ? 
      ORDER BY g.last_message_time DESC, g.created_at DESC
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

    // 发送Socket.IO通知给群组内的用户
    io.to(`group_${groupId}`).emit('member-removed', { groupId, memberId });
    
    // 发送全局广播，确保所有用户的群组列表都能更新
    io.emit('member-removed', { groupId, memberId });
    
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

    // 发送Socket.IO通知给群组内的用户
    io.to(`group_${groupId}`).emit('members-added', {
      groupId: groupId,
      newMembers: newMembersInfo,
      allMembers: updatedMembers
    });
    
    // 发送全局广播，确保所有用户的群组列表都能更新
    io.emit('members-added', {
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
    
    // 计算新消息的sequence值 - 使用与send-message事件相同的逻辑
    let messageSequence = null;
    
    try {
      if (safeGroupId) {
        // 直接获取当前最大的sequence值，然后加1作为新消息的sequence值
        const [maxSeqResult] = await pool.execute(
          'SELECT MAX(sequence) as maxSeq FROM chat_messages WHERE group_id = ?',
          [safeGroupId]
        );
        
        // 确保maxSeq是数字类型，避免类型转换错误
        const maxSeq = maxSeqResult[0].maxSeq !== null ? parseInt(maxSeqResult[0].maxSeq) : 0;
        messageSequence = maxSeq + 1;
      } else {
        // 直接获取当前最大的sequence值，然后加1作为新消息的sequence值
        const [maxSeqResult] = await pool.execute(
          'SELECT MAX(sequence) as maxSeq FROM chat_messages WHERE group_id IS NULL'
        );
        
        // 确保maxSeq是数字类型，避免类型转换错误
        const maxSeq = maxSeqResult[0].maxSeq !== null ? parseInt(maxSeqResult[0].maxSeq) : 0;
        messageSequence = maxSeq + 1;
      }
    } catch (sequenceError) {
      console.error('❌ sequence值计算错误:', sequenceError.message);
    }
    
    // 多层保障：确保sequence值不为空
    if (!messageSequence || messageSequence <= 0) {
      // 备用方法：计算消息数量作为sequence值
      if (safeGroupId) {
        const [countResult] = await pool.execute(
          'SELECT COUNT(*) as count FROM chat_messages WHERE group_id = ? AND timestamp <= NOW()',
          [safeGroupId]
        );
        messageSequence = parseInt(countResult[0].count);
      } else {
        const [countResult] = await pool.execute(
          'SELECT COUNT(*) as count FROM chat_messages WHERE group_id IS NULL AND timestamp <= NOW()'
        );
        messageSequence = parseInt(countResult[0].count);
      }
    }
    
    // 最终保障：如果所有方法都失败，使用ID作为sequence
    if (!messageSequence || messageSequence <= 0) {
      messageSequence = parseInt(result.insertId);
    }
    
    // 设置新消息的sequence值，确保参数类型正确
    await pool.execute(
      'UPDATE chat_messages SET sequence = ? WHERE id = ?',
      [parseInt(messageSequence), parseInt(result.insertId)]
    );
    
    // 设置新消息的sequence值
    newMessage.sequence = messageSequence;

    if (safeGroupId) {
      io.to(`group_${safeGroupId}`).emit('message-received', newMessage);
      
      // 更新群组的最后消息时间
      await pool.execute(
        'UPDATE chat_groups SET last_message_time = NOW() WHERE id = ?',
        [safeGroupId]
      );
      
      // 确保groupId是字符串类型，避免Map键类型不一致
      const groupIdStr = String(safeGroupId);
      // 直接将新消息添加到群组消息缓存
      let cachedGroupMessages = messageCache.groups.get(groupIdStr) || [];
      cachedGroupMessages.unshift(newMessage);
      // 保留最新的50条消息
      cachedGroupMessages = cachedGroupMessages.slice(0, 50);
      messageCache.groups.set(groupIdStr, cachedGroupMessages);
      messageCache.lastUpdated = Date.now();
      
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
      
      // 更新群组的最后消息时间
      await pool.execute(
        'UPDATE chat_groups SET last_message_time = NOW() WHERE id = ?',
        [parseInt(groupId)]
      );
    } else {
      io.emit('message-received', newMessage);
      // 直接将新消息添加到全局消息缓存
      let cachedGlobalMessages = messageCache.global || [];
      cachedGlobalMessages.unshift(newMessage);
      // 保留最新的50条消息
      cachedGlobalMessages = cachedGlobalMessages.slice(0, 50);
      messageCache.global = cachedGlobalMessages;
      messageCache.lastUpdated = Date.now();
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

// 存储在线用户
const onlineUsers = new Map();

// 根据用户ID查找对应的socket连接
function findSocketByUserId(userId) {
  for (let [socketId, user] of onlineUsers.entries()) {
    if (user.id === userId) {
      return io.sockets.sockets.get(socketId);
    }
  }
  return null;
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

// Socket.IO会话验证函数（包含IP验证）
async function validateSocketSession(socket, userData) {
  // console.log(`🔐 [Socket.IO] 会话验证开始: userId=${userData.userId || 'undefined'}, socketId=${socket.id}`);
  
  // 首先验证IP
  const ipValid = await validateSocketIP(socket);
  if (!ipValid) {
    // console.log(`🚨 [Socket.IO] 会话验证失败: IP验证未通过, userId=${userData.userId || 'undefined'}`);
    return false;
  }
  
  // 然后验证会话
  if (!userData.userId || !userData.sessionToken) {
    // console.error(`❌ [Socket.IO] 会话验证失败: 缺少必要参数, userId=${userData.userId || 'undefined'}, sessionToken=${userData.sessionToken ? 'present' : 'missing'}`);
    socket.emit('session-expired');
    socket.disconnect();
    return false;
  }

  const session = userSessions.get(parseInt(userData.userId));
  if (!session || session.token !== userData.sessionToken) {
    // console.error(`❌ [Socket.IO] 会话验证失败: token不匹配或会话不存在, userId=${userData.userId}`);
    socket.emit('session-expired');
    socket.disconnect();
    return false;
  }
  
  // console.log(`✅ [Socket.IO] 会话验证通过: userId=${userData.userId}, socketId=${socket.id}`);
  return true;
}

io.on('connection', (socket) => {
//   console.log('✅ 用户连接:', socket.id);

  // 获取聊天历史（不依赖user-joined事件）
  socket.on('get-chat-history', async (data) => {
      try {
        // 会话和IP验证
        const isValid = await validateSocketSession(socket, data);
        if (!isValid) {
          return;
        }
        
        // 检查是否是加载更多消息的请求
        const loadMore = data.loadMore || false;
        
        // 发送聊天历史 - 使用缓存
        const limit = data.limit || 20;
        let messages = [];
        
        if (loadMore && data.olderThan) {
          // 如果是加载更多消息，并且提供了olderThan参数，获取更早的消息
          messages = await getGlobalMessages(limit, data.olderThan);
        } else {
          // 否则获取最新消息
          // 优先从缓存中获取消息，如果缓存为空则从数据库中获取
          if (messageCache.global && messageCache.global.length > 0) {
            messages = messageCache.global.slice(0, limit);
          } else {
            // 缓存为空，从数据库中获取消息
            messages = await getGlobalMessages(limit);
            // 手动更新缓存，确保后续消息能够被正确添加
            messageCache.global = messages;
            messageCache.lastUpdated = Date.now();
          }
        }
        
        socket.emit('chat-history', {
          messages: messages,
          lastUpdate: messageCache.lastUpdated,
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
        const { groupId } = data;
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
        
        // 发送群组消息历史 - 使用缓存
        const limit = data.limit || 20;
        let messages = [];
        
        // 检查当前缓存状态
        const currentCache = messageCache.groups.get(groupIdStr);
        
        if (data.loadMore && data.olderThan) {
          // 如果是加载更多消息，并且提供了olderThan参数，获取更早的消息
          messages = await getGroupMessages(groupId, limit, data.olderThan);
        } else {
          // 否则获取最新消息
          // 优先从缓存中获取消息，如果缓存为空则从数据库中获取
          if (messageCache.groups.get(groupIdStr) && messageCache.groups.get(groupIdStr).length > 0) {
            messages = messageCache.groups.get(groupIdStr).slice(0, limit);
          } else {
            messages = await getGroupMessages(groupId, limit);
            // 手动更新缓存，确保后续消息能够被正确添加
            messageCache.groups.set(groupIdStr, messages);
            messageCache.lastUpdated = Date.now();
          }
        }
        
        const groupCacheSize = messageCache.groups.get(groupIdStr)?.length || 0;

        socket.emit('group-chat-history', {
          groupId: groupId,
          messages: messages,
          lastUpdate: messageCache.lastUpdated,
          loadMore: data.loadMore || false
        });
      } catch (err) {
        console.error('❌ 处理获取群组聊天历史请求时出错:', err.message);
        socket.emit('error', { message: '获取群组聊天记录失败' });
      }
    });

  // 用户加入聊天室
  socket.on('user-joined', async (userData) => {
      try {
        // 会话和IP验证...
        const isValid = await validateSocketSession(socket, userData);
        if (!isValid) {
          return;
        }
        
        // 确保用户ID是数字类型，防止SQL注入
        const userId = parseInt(userData.userId);
        if (isNaN(userId)) {
          console.error('❌ 无效的用户ID:', userData.userId);
          socket.emit('error', { message: '无效的用户ID' });
          return;
        }
        
        // 从数据库中获取真实的用户信息
        const [users] = await pool.execute(
            'SELECT nickname, avatar_url as avatarUrl, unread_group_messages, unread_private_messages FROM chat_users WHERE id = ?',
            [userId]
        );
        
        if (users.length === 0) {
          console.error('❌ 用户不存在:', userId);
          socket.emit('error', { message: '用户不存在' });
          return;
        }
        
        const user = users[0];
        const { nickname, avatarUrl, unread_group_messages, unread_private_messages } = user;
    
        // 检查用户是否已经在线
        let isExistingUser = false;
        for (let [id, onlineUser] of onlineUsers.entries()) {
          if (onlineUser.id === userId) {
            onlineUsers.delete(id);
            isExistingUser = true;
            break;
          }
        }
    
        // 存储用户信息（使用数据库中的真实信息）
        onlineUsers.set(socket.id, {
          id: userId,
          nickname: nickname,
          socketId: socket.id,
          avatarUrl: avatarUrl,
          sessionToken: userData.sessionToken
        });
    
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
        const usersArray = Array.from(onlineUsers.values()).map(user => ({
          id: user.id,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl
        }));
    
        io.emit('users-updated', usersArray);

        // 检查是否是加载更多消息的请求
        const loadMore = userData.loadMore || false;
        
        // 发送聊天历史 - 使用缓存
        const limit = userData.limit || 20;
        let messages = [];
        
        if (loadMore && userData.olderThan) {
          // 如果是加载更多消息，并且提供了olderThan参数，获取更早的消息
          messages = await getGlobalMessages(limit, userData.olderThan);
        } else {
          // 否则获取最新消息
          // 优先从缓存中获取消息，如果缓存为空则从数据库中获取
          if (messageCache.global && messageCache.global.length > 0) {
            messages = messageCache.global.slice(0, limit);
          } else {
            // 缓存为空，从数据库中获取消息
            messages = await getGlobalMessages(limit);
            // 手动更新缓存，确保后续消息能够被正确添加
            messageCache.global = messages;
            messageCache.lastUpdated = Date.now();
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

        socket.emit('chat-history', {
          messages: messages,
          lastUpdate: messageCache.lastUpdated,
          loadMore: loadMore,
          unreadMessages: unreadMessages,
          unreadPrivateMessages: privateUnreadMessages,
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
      const currentUser = onlineUsers.get(socket.id);
      if (!currentUser || currentUser.id !== data.userId) {
        console.error('❌ 头像更新失败: 用户身份验证失败');
        return;
      }
      
      // 更新在线用户列表中的头像URL
      currentUser.avatarUrl = data.avatarUrl;
      onlineUsers.set(socket.id, currentUser);
      
      // 保存头像URL到数据库
      await pool.execute(
        'UPDATE chat_users SET avatar_url = ? WHERE id = ?',
        [data.avatarUrl, data.userId]
      );
      
      // 广播更新后的用户列表给所有客户端
      const usersArray = Array.from(onlineUsers.values()).map(user => ({
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl
      }));
      
      io.emit('users-updated', usersArray);
      
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
        const { groupId, userId, sessionToken, loadMore = false, onlyClearUnread = false, noHistory = false } = data;
    
        // console.log('👥 [群组加入] 收到请求:', {
        //   socketId: socket.id,
        //   userId: userId,
        //   groupId: groupId,
        //   loadMore: loadMore,
        //   olderThan: data.olderThan,
        //   limit: data.limit
        // });
    
        // 会话和IP验证...
        const isValid = await validateSocketSession(socket, data);
        if (!isValid) {
          return;
        }
    
        // 如果不是加载更多，则加入群组频道
        if (!loadMore) {
          socket.join(`group_${groupId}`);
          // console.log(`✅ 用户加入群组: ${groupId}, socket: ${socket.id}`);
          
          // 自动已读该群组消息
          const groupIdStr = String(groupId);
          await pool.execute(
            `UPDATE chat_users 
             SET unread_group_messages = JSON_REMOVE(
               COALESCE(unread_group_messages, '{}'), 
               CONCAT('$."', ?, '"')
             ) 
             WHERE id = ?`,
            [groupIdStr, parseInt(userId)]
          );
          
          // 如果只需要清除未读计数，则不返回消息历史
          if (onlyClearUnread || noHistory) {
            return;
          }
        }
    
        // 确保groupId是字符串类型，避免Map键类型不一致
        const groupIdStr = String(groupId);
        // 发送群组消息历史 - 使用缓存
        const limit = data.limit || 20;
        let messages = [];
        
        // 检查当前缓存状态
        const currentCache = messageCache.groups.get(groupIdStr);
        
        if (loadMore && data.olderThan) {
          // 如果是加载更多消息，并且提供了olderThan参数，获取更早的消息
          messages = await getGroupMessages(groupId, limit, data.olderThan);
        } else {
          // 否则获取最新消息
          // 优先从缓存中获取消息，如果缓存为空则从数据库中获取
          if (messageCache.groups.get(groupIdStr) && messageCache.groups.get(groupIdStr).length > 0) {
            messages = messageCache.groups.get(groupIdStr).slice(0, limit);
          } else {
            messages = await getGroupMessages(groupId, limit);
            // 手动更新缓存，确保后续消息能够被正确添加
            messageCache.groups.set(groupIdStr, messages);
            messageCache.lastUpdated = Date.now();
          }
        }

        // console.log(`📨 [群组加入] 发送群组消息历史给用户: groupId=${groupId}, 消息数量=${messages.length}, 是否加载更多=${loadMore}`);
        
        const groupCacheSize = messageCache.groups.get(groupId)?.length || 0;

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

        socket.emit('group-chat-history', {
          groupId: groupId,
          messages: messages,
          lastUpdate: messageCache.lastUpdated,
          loadMore: loadMore,
          unreadMessages: unreadMessages,
          totalUnread: totalUnread
        });
      } catch (err) {
        console.error('❌ 加入群组失败:', err.message);
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
    
        // 会话和IP验证...
        const isValid = await validateSocketSession(socket, messageData);
        if (!isValid) {
          return;
        }
    
        // 验证消息内容...
        if (!validateMessageContent(content)) {
          console.error('❌ 消息内容格式错误');
          socket.emit('error', { message: '消息内容格式错误' });
          return;
        }
    
        // 如果是群组消息，验证用户是否在群组中
        if (groupId) {
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
            content: messageData.quotedMessage.content
          };
          messageContent = JSON.stringify({
            type: 'quoted',
            quoted: quotedData,
            text: cleanContent
          });
        }
        
        const [result] = await pool.execute(
            'INSERT INTO chat_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
            [userId, messageContent, messageType, groupId || null]
        );
        
        // 计算新消息的sequence值 - 优化方法，确保不会清除现有消息的序号
        let messageSequence = null;
        
        try {
          if (groupId) {
            // console.log(`🔄 为群组 ${groupId} 的新消息分配序号`);
            
            // 直接获取当前最大的sequence值，然后加1作为新消息的sequence值
            const [maxSeqResult] = await pool.execute(
              'SELECT MAX(sequence) as maxSeq FROM chat_messages WHERE group_id = ?',
              [parseInt(groupId)]
            );
            
            // 确保maxSeq是数字类型，避免类型转换错误
            const maxSeq = maxSeqResult[0].maxSeq !== null ? parseInt(maxSeqResult[0].maxSeq) : 0;
            messageSequence = maxSeq + 1;
            // console.log(`✅ 新群组消息的sequence值: ${messageSequence}`);
          } else {
            // console.log('🔄 为全局新消息分配序号');
            
            // 直接获取当前最大的sequence值，然后加1作为新消息的sequence值
            const [maxSeqResult] = await pool.execute(
              'SELECT MAX(sequence) as maxSeq FROM chat_messages WHERE group_id IS NULL'
            );
            
            // 确保maxSeq是数字类型，避免类型转换错误
            const maxSeq = maxSeqResult[0].maxSeq !== null ? parseInt(maxSeqResult[0].maxSeq) : 0;
            messageSequence = maxSeq + 1;
            // console.log(`✅ 新全局消息的sequence值: ${messageSequence}`);
          }
        } catch (sequenceError) {
          console.error('❌ sequence值计算错误:', sequenceError.message);
        }
        
        // 多层保障：确保sequence值不为空
        if (!messageSequence || messageSequence <= 0) {
          // console.log('⚠️ sequence值无效，尝试备用方法');
          
          // 备用方法：计算消息数量作为sequence值
          if (groupId) {
            const [countResult] = await pool.execute(
              'SELECT COUNT(*) as count FROM chat_messages WHERE group_id = ? AND timestamp <= NOW()',
              [parseInt(groupId)]
            );
            messageSequence = parseInt(countResult[0].count);
          } else {
            const [countResult] = await pool.execute(
              'SELECT COUNT(*) as count FROM chat_messages WHERE group_id IS NULL AND timestamp <= NOW()'
            );
            messageSequence = parseInt(countResult[0].count);
          }
          // console.log(`🔧 使用备用方法计算sequence值: ${messageSequence}`);
        }
        
        // 最终保障：如果所有方法都失败，使用ID作为sequence
        if (!messageSequence || messageSequence <= 0) {
          // console.log('🚨 所有方法都失败，使用ID作为sequence值');
          messageSequence = parseInt(result.insertId);
        }
        
        // console.log(`📊 消息 ${result.insertId} 的最终sequence值:`, messageSequence);
        
        // 设置新消息的sequence值，确保参数类型正确
        await pool.execute(
          'UPDATE chat_messages SET sequence = ? WHERE id = ?',
          [parseInt(messageSequence), parseInt(result.insertId)]
        );
        // console.log(`✅ 已设置新消息的sequence值`);
        
        // 额外检查：确保没有重复的sequence值
        if (groupId) {
          const [duplicateCheck] = await pool.execute(
            'SELECT COUNT(*) as duplicateCount, sequence FROM chat_messages WHERE group_id = ? GROUP BY sequence HAVING COUNT(*) > 1 LIMIT 1',
            [parseInt(groupId)]
          );
          
          if (duplicateCheck.length > 0) {
            // console.error(`⚠️ 警告：发现重复的sequence值 ${duplicateCheck[0].sequence}`);
            // 如果发现重复，只针对当前消息重新设置，不影响其他消息
            const [maxSeqResult] = await pool.execute(
              'SELECT MAX(sequence) as maxSeq FROM chat_messages WHERE group_id = ? AND id != ?',
              [parseInt(groupId), parseInt(result.insertId)]
            );
            const maxSeq = maxSeqResult[0].maxSeq !== null ? parseInt(maxSeqResult[0].maxSeq) : 0;
            const newSequence = maxSeq + 1;
            await pool.execute(
              'UPDATE chat_messages SET sequence = ? WHERE id = ?',
              [parseInt(newSequence), parseInt(result.insertId)]
            );
            messageSequence = newSequence;
            // console.log(`🔄 已修复重复的sequence值，新值为: ${newSequence}`);
          }
        } else {
          const [duplicateCheck] = await pool.execute(
            'SELECT COUNT(*) as duplicateCount, sequence FROM chat_messages WHERE group_id IS NULL GROUP BY sequence HAVING COUNT(*) > 1 LIMIT 1'
          );
          
          if (duplicateCheck.length > 0) {
            // console.error(`⚠️ 警告：发现重复的sequence值 ${duplicateCheck[0].sequence}`);
            // 如果发现重复，只针对当前消息重新设置，不影响其他消息
            const [maxSeqResult] = await pool.execute(
              'SELECT MAX(sequence) as maxSeq FROM chat_messages WHERE group_id IS NULL AND id != ?',
              [parseInt(result.insertId)]
            );
            const maxSeq = maxSeqResult[0].maxSeq !== null ? parseInt(maxSeqResult[0].maxSeq) : 0;
            const newSequence = maxSeq + 1;
            await pool.execute(
              'UPDATE chat_messages SET sequence = ? WHERE id = ?',
              [parseInt(newSequence), parseInt(result.insertId)]
            );
            messageSequence = newSequence;
            // console.log(`🔄 已修复重复的sequence值，新值为: ${newSequence}`);
          }
        }
    
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
          timestampISO: timestamp,
          sequence: messageSequence
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
          
          // 群组消息：发送给群组成员
          // 使用直接发送方式，避免重复发送消息
          try {
            // 获取群组成员列表
            const [members] = await pool.execute(
              'SELECT user_id FROM chat_group_members WHERE group_id = ?',
              [parseInt(groupId)]
            );
            
            // 遍历群组成员，直接发送消息给在线用户
            for (const member of members) {
              const memberId = member.user_id;
              
              // 查找该用户的在线socket连接
              for (let [socketId, onlineUser] of onlineUsers.entries()) {
                if (onlineUser.id === memberId) {
                  const socket = io.sockets.sockets.get(socketId);
                  if (socket) {
                    // 直接发送消息给该socket连接，包括发送者自己
                    socket.emit('message-received', newMessage);
                  }
                  break;
                }
              }
            }
          } catch (directSendErr) {
            console.error('直接发送群组消息失败:', directSendErr.message);
          }
          
          // 直接将新消息添加到群组消息缓存
          let cachedGroupMessages = messageCache.groups.get(groupIdStr) || [];
          // 将新消息添加到缓存开头
          cachedGroupMessages.unshift(newMessage);
          // 保留最新的50条消息
          cachedGroupMessages = cachedGroupMessages.slice(0, 50);
          // 更新缓存
          messageCache.groups.set(groupIdStr, cachedGroupMessages);
          messageCache.lastUpdated = Date.now();
          
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
          
          // 更新群组的最后消息时间
          await pool.execute(
            'UPDATE chat_groups SET last_message_time = NOW() WHERE id = ?',
            [parseInt(groupId)]
          );
        } else {
          // 全局消息：发送给所有用户
          io.emit('message-received', newMessage);
          // 直接将新消息添加到全局消息缓存
          let cachedGlobalMessages = messageCache.global || [];
          // 将新消息添加到缓存开头
          cachedGlobalMessages.unshift(newMessage);
          // 保留最新的50条消息
          cachedGlobalMessages = cachedGlobalMessages.slice(0, 50);
          // 更新缓存
          messageCache.global = cachedGlobalMessages;
          messageCache.lastUpdated = Date.now();
        }
    
        // 确认消息已发送，并包含完整的消息数据，让发送者可以实时看到自己的消息
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

      // 会话和IP验证
      const isValid = await validateSocketSession(socket, messageData);
      if (!isValid) {
        return;
      }

      // 验证消息内容
      if (!validateMessageContent(content)) {
        console.error('❌ 消息内容格式错误');
        socket.emit('error', { message: '消息内容格式错误' });
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

      // 计算新消息的sequence值
      let messageSequence = null;
      try {
        // 直接获取当前最大的sequence值，然后加1作为新消息的sequence值
        const [maxSeqResult] = await pool.execute(
          'SELECT MAX(sequence) as maxSeq FROM chat_private_messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)',
          [userId, receiverId, receiverId, userId]
        );
        
        // 确保maxSeq是数字类型，避免类型转换错误
        const maxSeq = maxSeqResult[0].maxSeq !== null ? parseInt(maxSeqResult[0].maxSeq) : 0;
        
        // 避免sequence值过大导致溢出，设置一个合理的最大值（10亿）
        // 如果接近最大值，重新开始计数
        if (maxSeq >= 1000000000) {
          messageSequence = 1;
        } else {
          messageSequence = maxSeq + 1;
        }
      } catch (sequenceError) {
        console.error('❌ sequence值计算错误:', sequenceError.message);
        // 出错时使用一个合理的sequence值，避免使用时间戳导致跳跃
        messageSequence = 1;
      }
      
      // 最终保障：确保sequence值是合理的数字
      if (!messageSequence || messageSequence <= 0) {
        messageSequence = 1;
      }

      // 插入私信到数据库，直接包含sequence值
      const messageType = messageData.message_type || messageData.messageType || 0;
      
      let messageContent = cleanContent;
      if (messageData.quotedMessage) {
        const quotedData = {
          id: messageData.quotedMessage.id,
          userId: messageData.quotedMessage.userId || messageData.quotedMessage.user_id,
          nickname: messageData.quotedMessage.nickname,
          content: messageData.quotedMessage.content
        };
        messageContent = JSON.stringify({
          type: 'quoted',
          quoted: quotedData,
          text: cleanContent
        });
      }
      
      const [result] = await pool.execute(
          'INSERT INTO chat_private_messages (sender_id, receiver_id, content, message_type, sequence, timestamp) VALUES (?, ?, ?, ?, ?, NOW())',
          [userId, receiverId, messageContent, messageType, parseInt(messageSequence)]
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
        timestamp: timestampMs,
        timestampISO: timestamp,
        sequence: messageSequence
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
      let receiverFound = false;
      for (let [socketId, onlineUser] of onlineUsers.entries()) {
        if (onlineUser.id === parseInt(receiverId)) {
          const receiverSocket = io.sockets.sockets.get(socketId);
          if (receiverSocket) {
            receiverSocket.emit('private-message-received', newMessage);
            receiverFound = true;
          }
          break;
        }
      }

      // 更新接收者的未读私信计数，无论是否在线
      // 当接收者打开聊天窗口时，会通过join-private-chat事件清除未读计数
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
      
      // 更新好友关系的最后私信消息时间
      try {
        // 更新发送者与接收者的好友关系中的最后消息时间
        await pool.execute(
          'UPDATE chat_friends SET last_message_time = NOW() WHERE user_id = ? AND friend_id = ?',
          [userId, parseInt(receiverId)]
        );
        await pool.execute(
          'UPDATE chat_friends SET last_message_time = NOW() WHERE user_id = ? AND friend_id = ?',
          [parseInt(receiverId), userId]
        );
      } catch (lastMsgErr) {
        console.error('更新最后私信消息时间失败:', lastMsgErr.message);
      }
      
      // 发送私信给发送者（自己也能看到自己发送的私信）
      socket.emit('private-message-received', newMessage);

      // 确认私信已发送
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
      socket.emit('private-message-withdrawn', withdrawNotification);
      
      // 发送撤回通知给接收者
      for (let [socketId, onlineUser] of onlineUsers.entries()) {
        if (onlineUser.id === message.receiver_id) {
          const receiverSocket = io.sockets.sockets.get(socketId);
          if (receiverSocket) {
            receiverSocket.emit('private-message-withdrawn', withdrawNotification);
          }
          break;
        }
      }
      
      // console.log('📤 私信消息已撤回:', { messageId: numericMessageId, senderId: message.sender_id, receiverId: message.receiver_id });
      
    } catch (err) {
      console.error('❌ 撤回私信失败:', err.message);
      console.error('❌ 错误详情:', err);
      socket.emit('error', { message: '撤回私信失败', error: err.message });
    }
  });

  // 加入私人聊天，获取聊天历史
  socket.on('join-private-chat', async (data) => {
    try {
      const { userId, friendId, sessionToken, loadMore = false, onlyClearUnread = false, noHistory = false } = data;

      // 会话和IP验证
      const isValid = await validateSocketSession(socket, data);
      if (!isValid) {
        return;
      }

      // 确保用户ID和好友ID是数字类型
      const numericUserId = parseInt(userId);
      const numericFriendId = parseInt(friendId);
      if (isNaN(numericUserId) || isNaN(numericFriendId)) {
        // console.error('❌ 无效的用户ID或好友ID:', { userId, friendId, numericUserId, numericFriendId });
        socket.emit('error', { message: '无效的用户ID或好友ID' });
        return;
      }

      // 发送私人聊天历史
      const limit = data.limit || 20;
      let messages = [];

      // 从数据库获取私人聊天记录
      let query = `
        SELECT p.id, p.sender_id as senderId, p.receiver_id as receiverId, 
               p.content, p.message_type as messageType, p.timestamp, p.sequence,
               u1.nickname as senderNickname, u1.avatar_url as senderAvatarUrl,
               u2.nickname as receiverNickname, u2.avatar_url as receiverAvatarUrl
        FROM chat_private_messages p
        JOIN chat_users u1 ON p.sender_id = u1.id
        JOIN chat_users u2 ON p.receiver_id = u2.id
        WHERE (p.sender_id = ? AND p.receiver_id = ?) OR (p.sender_id = ? AND p.receiver_id = ?)
      `;
      
      const params = [numericUserId, numericFriendId, numericFriendId, numericUserId];
      
      if (loadMore && data.olderThan) {
        // 确保olderThan是有效的数字
        const olderThan = parseInt(data.olderThan);
        if (!isNaN(olderThan)) {
          // 如果是加载更多消息，并且提供了有效的olderThan参数，获取更早的消息
          query += ` AND p.sequence < ? `;
          params.push(olderThan);
        }
      }
      
      // 按时间顺序排序，只返回最新的limit条消息
      query += ` ORDER BY p.sequence DESC LIMIT ?`;
      // 确保limit是有效的数字
      const safeLimit = parseInt(limit);
      const finalLimit = isNaN(safeLimit) ? 20 : safeLimit;
      params.push(finalLimit);
      
      // console.log('📋 执行查询:', {
      //   query,
      //   params: [...params.slice(0, -1), params[params.length - 1]]
      // });
      
      // 使用query而不是execute，query方法会自动处理参数类型转换
      const [results] = await pool.query(query, params);
      
      // console.log('✅ 查询成功，返回', results.length, '条消息');
      
      // 处理消息，转换为前端需要的格式
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
          timestampISO: new Date(msg.timestamp).toISOString(),
          sequence: msg.sequence
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
        
        // 如果只需要清除未读计数，则不返回消息历史
        if (onlyClearUnread || noHistory) {
          return;
        }
      } catch (unreadErr) {
        console.error('清除未读私信计数失败:', unreadErr.message);
      }

      // 发送私人聊天历史给客户端
      socket.emit('private-chat-history', {
        friendId: numericFriendId,
        messages: messages,
        loadMore: loadMore,
        total: messages.length,
        limit: finalLimit
      });

    } catch (err) {
      console.error('❌ 加入私人聊天失败:', err.message);
      console.error('❌ 错误详情:', err);
      socket.emit('error', { message: '获取私人聊天记录失败', error: err.message });
    }
  });

  // 初始化：更新现有私信消息的sequence值，确保它们有正确的sequence值
  async function initializePrivateMessageSequences() {
    try {
      // 获取所有没有sequence值或sequence值为0的私信消息
      const [messages] = await pool.execute(
        'SELECT id, sender_id, receiver_id, timestamp FROM chat_private_messages WHERE sequence <= 0 OR sequence IS NULL ORDER BY timestamp ASC'
      );
      
      if (messages.length > 0) {
        // console.log(`📝 发现 ${messages.length} 条需要更新sequence值的私信消息`);
        
        // 按对话分组处理
        const conversations = new Map();
        
        // 首先对所有消息进行分组
        messages.forEach(msg => {
          // 创建对话唯一标识（按sender_id和receiver_id排序后组合）
          const conversationKey = [msg.sender_id, msg.receiver_id].sort().join('-');
          if (!conversations.has(conversationKey)) {
            conversations.set(conversationKey, []);
          }
          conversations.get(conversationKey).push(msg);
        });
        
        // 遍历每个对话，更新sequence值
        for (const [conversationKey, conversationMessages] of conversations.entries()) {
          // 按时间戳排序
          conversationMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          
          // 开始更新sequence值
          for (let i = 0; i < conversationMessages.length; i++) {
            const msg = conversationMessages[i];
            const sequence = i + 1;
            await pool.execute(
              'UPDATE chat_private_messages SET sequence = ? WHERE id = ?',
              [sequence, msg.id]
            );
          }
        }
        
        // console.log('✅ 已更新所有私信消息的sequence值');
      } else {
        // console.log('✅ 所有私信消息都已有正确的sequence值');
      }
    } catch (err) {
      console.error('❌ 初始化私信消息sequence值失败:', err.message);
    }
  }
  
  // 在服务器启动时初始化私信消息sequence值
  initializePrivateMessageSequences();
  
  // 获取私人聊天历史，用于加载更多消息
  socket.on('get-private-chat-history', async (data) => {
    try {
      const { userId, friendId, sessionToken, loadMore = true, olderThan, limit = 20 } = data;
      
      // 会话和IP验证
      const isValid = await validateSocketSession(socket, data);
      if (!isValid) {
        return;
      }

      // 确保用户ID和好友ID是数字类型
      const numericUserId = parseInt(userId);
      const numericFriendId = parseInt(friendId);
      if (isNaN(numericUserId) || isNaN(numericFriendId)) {
        console.error('❌ 无效的用户ID或好友ID');
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

      let messages = [];

      // 从数据库获取私人聊天记录
      let query = `
        SELECT p.id, p.sender_id as senderId, p.receiver_id as receiverId, 
               p.content, p.message_type as messageType, p.timestamp, p.sequence,
               u1.nickname as senderNickname, u1.avatar_url as senderAvatarUrl,
               u2.nickname as receiverNickname, u2.avatar_url as receiverAvatarUrl
        FROM chat_private_messages p
        JOIN chat_users u1 ON p.sender_id = u1.id
        JOIN chat_users u2 ON p.receiver_id = u2.id
      `;
      
      const params = [numericUserId, numericFriendId, numericFriendId, numericUserId];
      
      // 构建WHERE子句
      let whereClause = `WHERE ((p.sender_id = ? AND p.receiver_id = ?) OR (p.sender_id = ? AND p.receiver_id = ?))`;
      
      // 确保limit是有效的数字 - 提前定义，避免olderThan无效时无法使用
      const safeLimit = parseInt(limit);
      const finalLimit = isNaN(safeLimit) ? 20 : safeLimit;
      
      // 只有在loadMore为true时，才使用olderThan参数
      if (loadMore) {
        // 确保olderThan是有效的数字
        const olderThanNum = parseInt(olderThan);
        
        if (!isNaN(olderThanNum)) {
          // 获取比olderThan更早的消息
          // 正确添加括号，确保AND条件应用于整个WHERE子句
          whereClause += ` AND p.sequence < ? `;
          params.push(olderThanNum);
        } else {
          // 如果loadMore为true但olderThan无效，返回空数组
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
      
      // 将WHERE子句添加到查询中
      query += whereClause;
      
      // 按时间顺序排序，只返回最新的limit条消息
      query += ` ORDER BY p.sequence DESC LIMIT ?`;
      params.push(finalLimit);
      
      // 使用query而不是execute，query方法会自动处理参数类型转换
      const [results] = await pool.query(query, params);
      
      // 处理消息，转换为前端需要的格式
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
          timestampISO: new Date(msg.timestamp).toISOString(),
          sequence: msg.sequence
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

      // 发送私人聊天历史给客户端
      socket.emit('private-chat-history', {
        friendId: numericFriendId,
        messages: messages,
        loadMore: loadMore,
        total: messages.length,
        limit: safeLimit
      });

    } catch (err) {
      console.error('❌ 获取私人聊天历史失败:', err.message);
      socket.emit('error', { message: '获取私人聊天记录失败', error: err.message });
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
        console.error('❌ 消息不存在:', messageId);
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
      
      // 从缓存中删除消息
    if (message.group_id) {
      // 群组消息：从群组消息缓存中删除
      // 确保使用字符串类型作为Map键
      const groupIdStr = String(message.group_id);
      const groupCache = messageCache.groups.get(groupIdStr);
      if (groupCache && groupCache.length > 0) {
        const updatedCache = groupCache.filter(msg => parseInt(msg.id) !== numericMessageId);
        messageCache.groups.set(groupIdStr, updatedCache);
        messageCache.lastUpdated = Date.now();
      }
    } else {
        // 全局消息：从全局消息缓存中删除
        if (messageCache.global && messageCache.global.length > 0) {
          const updatedCache = messageCache.global.filter(msg => parseInt(msg.id) !== numericMessageId);
          messageCache.global = updatedCache;
          messageCache.lastUpdated = Date.now();
        }
      }
      
      // 重新计算sequence值以保持连续性 - 使用更安全的方法
      try {
        if (message.group_id) {
          // 群组消息：重新计算该群组的sequence值
          // console.log(`🔄 开始重新计算群组 ${message.group_id} 的消息sequence值`);
          
          // 使用变量递增方式重新分配sequence值
          await pool.execute('SET @seq := 0');
          await pool.execute(
            'UPDATE chat_messages SET sequence = (@seq := @seq + 1) WHERE group_id = ? ORDER BY timestamp ASC',
            [message.group_id]
          );
          
          // console.log(`✅ 群组 ${message.group_id} 的sequence值重新计算完成`);
        } else {
          // 全局消息：重新计算全局消息的sequence值
          // console.log('🔄 开始重新计算全局消息的sequence值');
          
          // 使用变量递增方式重新分配sequence值
          await pool.execute('SET @seq := 0');
          await pool.execute(
            'UPDATE chat_messages SET sequence = (@seq := @seq + 1) WHERE group_id IS NULL ORDER BY timestamp ASC'
          );
          
          // console.log('✅ 全局消息的sequence值重新计算完成');
        }
      } catch (seqError) {
        console.error('❌ 重新计算sequence值失败:', seqError.message);
        // 不影响删除操作的成功，只记录错误
      }
      
      // 广播消息删除事件
      io.emit('message-deleted', { 
        messageId: messageId,
        groupId: message.group_id 
      });
      
      // console.log('✅ 消息删除成功:', messageId);
    } catch (err) {
      console.error('❌ 删除消息失败:', err.message);
      socket.emit('error', { message: '删除消息失败' });
    }
  });

  // 获取在线用户列表
  socket.on('get-online-users', async () => {
    try {
      // 直接检查IP是否被封禁，无需会话验证
      const ipValid = await validateSocketIP(socket);
      if (!ipValid) {
        return;
      }
      
      const usersArray = Array.from(onlineUsers.values()).map(user => ({
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl
      }));

      socket.emit('online-users', usersArray);
      //console.log('📊 发送在线用户列表给:', socket.id, '用户数量:', usersArray.length);
    } catch (err) {
      console.error('❌ 获取在线用户列表失败:', err.message);
    }
  });

  // 心跳检测 - 修改：不再需要延长会话
  socket.on('heartbeat', async (data) => {
    try {
      // 会话和IP验证
      const isValid = await validateSocketSession(socket, data);
      if (!isValid) {
        return;
      }
      
      // 修改：永不过期模式，只需简单确认
      if (data.userId && data.sessionToken) {
        const session = userSessions.get(parseInt(data.userId));
        if (session && session.token === data.sessionToken) {
          // 更新最后活动时间，但不会过期
          session.lastActive = Date.now();
          socket.emit('heartbeat-ack', { 
            timestamp: Date.now(),
            userId: data.userId,
            message: '心跳确认（会话永不过期）'
          });
          return;
        }
      }
      socket.emit('session-expired');
    } catch (err) {
      console.error('❌ 心跳检测失败:', err.message);
      socket.emit('error', { message: '服务器错误' });
    }
  });

  // 延长会话 - 修改：不再需要，会话永不过期
  socket.on('extend-session', async (data) => {
    try {
      // 会话和IP验证
      const isValid = await validateSocketSession(socket, data);
      if (!isValid) {
        return;
      }
      
      // 修改：永不过期模式，直接返回成功
      if (data.userId && data.sessionToken) {
        const session = userSessions.get(parseInt(data.userId));
        if (session && session.token === data.sessionToken) {
          session.lastActive = Date.now();
          socket.emit('session-extended', {
            newExpires: session.expires,
            userId: data.userId,
            message: '会话已延长（永不过期模式）'
          });
          return;
        }
      }
      socket.emit('session-expired');
    } catch (err) {
      console.error('❌ 延长会话失败:', err.message);
      socket.emit('error', { message: '服务器错误' });
    }
  });

  // 清除群组未读消息
  socket.on('clear-unread-messages', async (data) => {
    try {
      // 会话和IP验证
      const isValid = await validateSocketSession(socket, data);
      if (!isValid) {
        return;
      }
      
      const { userId, groupId } = data;
      
      if (!userId || !groupId) {
        console.error('❌ 清除未读消息失败: 缺少必要参数');
        socket.emit('error', { message: '缺少必要参数' });
        return;
      }
      
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
    } catch (err) {
      console.error('❌ 清除未读消息失败:', err.message);
      socket.emit('error', { message: '清除未读消息失败' });
    }
  });

  // 用户断开连接
  socket.on('disconnect', (reason) => {
    // console.log('❌ 用户断开连接:', {
    //   socketId: socket.id,
    //   reason: reason,
    //   onlineUsersBefore: onlineUsers.size
    // });

    // 从在线用户列表中移除
    if (onlineUsers.has(socket.id)) {
      const user = onlineUsers.get(socket.id);
      onlineUsers.delete(socket.id);

      // console.log('👤 用户从在线列表移除:', user.nickname);

      // 广播更新后的用户列表
      const usersArray = Array.from(onlineUsers.values()).map(user => ({
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl
      }));

      io.emit('users-updated', usersArray);
      // console.log('📊 当前在线用户数:', onlineUsers.size);
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
    
    // 清空消息缓存
    messageCache.groups.delete(parseInt(groupId));
    
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
      'SELECT creator_id, name FROM chat_groups WHERE id = ?',
      [groupId]
    );
    
    if (groupResults.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }
    
    const group = groupResults[0];
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
      
      // console.log(`💥 群组 ${groupId} (${group.name}) 已被群主 ${userId} 解散，所有群消息已删除`);
      
      // 清空消息缓存
      messageCache.groups.delete(parseInt(groupId));
      
      // 通知群组内所有用户
      io.to(`group_${groupId}`).emit('group-dissolved', { groupId });
      
      // 向所有群组成员发送解散事件，确保所有成员都能收到通知
      for (const member of members) {
        // 查找该成员的在线socket连接
        for (let [socketId, user] of onlineUsers.entries()) {
          if (user.id === parseInt(member.user_id)) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
              socket.emit('group-dissolved', { groupId });
            }
            break;
          }
        }
      }
      
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

    // 通知群组内所有用户
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

    // 通知群组内所有用户
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
      
      // 通知群组内所有用户
      io.to(`group_${groupId}`).emit('member-left-group', { groupId, userId });
      
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

// 处理POST请求
app.post('/send-message', validateIPAndSession, async (req, res) => {
  try {
    const { content, groupId } = req.body;
    const userId = req.userId; // 从validateSession中间件获取

    // console.log('💬 HTTP发送消息请求:', {
    //   userId: userId,
    //   groupId: groupId,
    //   contentLength: content ? content.length : 0
    // });

    // 验证消息内容
    if (!validateMessageContent(content)) {
      console.error('❌ 消息内容格式错误');
      return res.status(400).json({ status: 'error', message: '消息内容格式错误' });
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

    // 获取当前最大sequence值
    const tableName = 'chat_messages';
    let maxSeqResult;
    
    if (groupId) {
      [maxSeqResult] = await pool.execute(
        'SELECT COALESCE(MAX(sequence), 0) as max_seq FROM chat_messages WHERE group_id = ?',
        [groupId]
      );
    } else {
      [maxSeqResult] = await pool.execute(
        'SELECT COALESCE(MAX(sequence), 0) as max_seq FROM chat_messages WHERE group_id IS NULL'
      );
    }
    
    const newSeq = maxSeqResult[0].max_seq + 1;
    
    // 插入消息到数据库（包含sequence值）
    const [result] = await pool.execute(
        'INSERT INTO chat_messages (user_id, content, group_id, sequence) VALUES (?, ?, ?, ?)',
        [userId, cleanContent, groupId || null, newSeq]
    );

    // 创建消息对象
    const newMessage = {
      id: result.insertId,
      userId,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      content: cleanContent,
      groupId: groupId || null,
      timestamp: new Date(),
      sequence: newSeq
    };

    // 广播消息，不需要重新计算所有sequence值
    if (groupId) {
      io.to(`group_${groupId}`).emit('message-received', newMessage);
      await getGroupMessages(groupId);
      
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
      io.emit('message-received', newMessage);
      await getGlobalMessages();
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

// 初始化所有消息的sequence值
async function initializeMessageSequences() {
  try {
    // console.log('🔄 开始初始化所有消息的sequence值...');
    
    // 初始化全局消息的sequence值
    await pool.execute('SET @seq := 0');
    const [globalResult] = await pool.execute(
      'UPDATE chat_messages SET sequence = (@seq := @seq + 1) WHERE group_id IS NULL ORDER BY timestamp ASC'
    );
    // console.log(`✅ 初始化了 ${globalResult.affectedRows} 条全局消息的sequence值`);
    
    // 获取所有群组ID
    const [groups] = await pool.execute('SELECT DISTINCT group_id FROM chat_messages WHERE group_id IS NOT NULL');
    
    // 为每个群组初始化消息的sequence值
    for (const group of groups) {
      const groupId = group.group_id;
      await pool.execute('SET @seq := 0');
      const [groupResult] = await pool.execute(
        'UPDATE chat_messages SET sequence = (@seq := @seq + 1) WHERE group_id = ? ORDER BY timestamp ASC',
        [groupId]
      );
      // console.log(`✅ 初始化了群组 ${groupId} 的 ${groupResult.affectedRows} 条消息的sequence值`);
    }
    
    // console.log('✅ 所有消息的sequence值初始化完成');
  } catch (err) {
    console.error('❌ 初始化消息sequence值失败:', err.message);
  }
}

async function startServer() {
  try {
    await initializeDatabase();
    await loadSessionsFromDatabase();
    await initializeMessageSequences();
    
    // 初始化消息缓存，确保第一次获取消息时缓存不是空的
    // 获取更多消息以确保包含所有最新消息，特别是那些可能因为sequence值问题而被遗漏的消息
    const globalMessages = await getGlobalMessages(50);
    messageCache.global = globalMessages;
    messageCache.lastUpdated = Date.now();
    // console.log(`📊 初始化全局消息缓存完成，包含${globalMessages.length}条消息`);
    
    // 获取所有群组ID，初始化每个群组的消息缓存
    const [groups] = await pool.execute('SELECT DISTINCT group_id FROM chat_messages WHERE group_id IS NOT NULL');
    for (const group of groups) {
      // 获取更多消息以确保包含所有最新消息，特别是那些可能因为sequence值问题而被遗漏的消息
      const groupMessages = await getGroupMessages(group.group_id, 50);
      // 确保使用字符串类型作为Map键
      messageCache.groups.set(String(group.group_id), groupMessages);
      messageCache.lastUpdated = Date.now();
      // console.log(`📊 初始化群组${group.group_id}缓存完成，包含${groupMessages.length}条消息`);
    }


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
process.on('SIGINT', () => {
  console.log('\n🛑 收到关闭信号，正在优雅关闭服务器...');
  console.log(`📊 关闭前在线用户数: ${onlineUsers.size}`);
  console.log(`💾 活动会话数: ${userSessions.size}`);
  console.log('💡 所有会话将保持有效（永不过期）');

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

// 设置定时任务，每天凌晨2点执行清理
function scheduleCleanupTask() {
  // 每天凌晨2点执行
  schedule.scheduleJob('0 0 2 * * *', cleanExpiredFiles);

  console.log(`
__  ___/__(_)______ ______________  /____     _________  /_______ __  /_   __________________________ ___ 
_____ \\__  /__  __ \`__ \\__  __ \\_  /_  _ \\    _  ___/_  __ \\  __ \`/  __/   __  ___/  __ \\  __ \\_  __ \`__ \\
____/ /_  / _  / / / / /_  /_/ /  / /  __/    / /__ _  / / / /_/ // /_     _  /   / /_/ / /_/ /  / / / / /
/____/ /_/  /_/ /_/ /_/_  .___//_/  \\___/     \\___/ /_/ /_/\\__,_/ \\__/     /_/    \\____/\\____//_/ /_/ /_/ 
                       /_/                                                                                 
`);

  console.log('⏰ 已设置定时任务：每天凌晨2点清理过期文件');
  
  // 服务器启动时立即执行一次清理
  cleanExpiredFiles()
}

// 在启动服务器之前设置定时任务
scheduleCleanupTask();

startServer();