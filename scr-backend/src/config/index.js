import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

let envPath;
if (fs.existsSync(path.join(process.cwd(), '.env.local'))) {
  envPath = path.join(process.cwd(), '.env.local');
} else if (fs.existsSync(path.join(process.cwd(), '.env'))) {
  envPath = path.join(process.cwd(), '.env');
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

// ============================================
// 数据库配置
// ============================================
export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// ============================================
// 服务器配置
// ============================================
export const serverConfig = {
  port: parseInt(process.env.PORT) || 15825,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*'
};

// ============================================
// Redis 配置
// ============================================
export const redisConfig = {
  url: process.env.REDIS_URL || null,
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined
};

// ============================================
// Socket.IO WebSocket 配置
// ============================================
export const socketConfig = {
  pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT) || 60000,
  pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL) || 25000,
  connectTimeout: parseInt(process.env.SOCKET_CONNECT_TIMEOUT) || 45000,
  upgradeTimeout: parseInt(process.env.SOCKET_UPGRADE_TIMEOUT) || 30000,
  cors: {
    origin: serverConfig.corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
    transports: ['websocket', 'polling']
  },
  allowEIO3: true
};

// ============================================
// 速率限制配置
// ============================================
export const rateLimitConfig = {
  shortWindowMs: parseInt(process.env.RATE_LIMIT_SHORT_WINDOW_MS) || 10000,
  shortLimit: parseInt(process.env.RATE_LIMIT_SHORT_LIMIT) || 10,
  longWindowMs: parseInt(process.env.RATE_LIMIT_LONG_WINDOW_MS) || 60000,
  longLimit: parseInt(process.env.RATE_LIMIT_LONG_LIMIT) || 40
};

// ============================================
// 文件上传配置
// ============================================
export const uploadConfig = {
  uploadDir: process.env.UPLOAD_DIR || 'public/uploads',
  avatarDir: process.env.AVATAR_DIR || 'public/avatars',
  maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB) || 10,
  maxAvatarSizeMB: parseInt(process.env.MAX_AVATAR_SIZE_MB) || 2
};

// ============================================
// 会话配置
// ============================================
export const sessionConfig = {
  expireMinutes: parseInt(process.env.SESSION_EXPIRE_MINUTES) || 20,
  refreshExpireDays: parseInt(process.env.REFRESH_TOKEN_EXPIRE_DAYS) || 7,
  autoLoginExpireMinutes: parseInt(process.env.AUTO_LOGIN_EXPIRE_MINUTES) || 5
};

// ============================================
// 消息配置
// ============================================
export const messageConfig = {
  maxLength: parseInt(process.env.MAX_MESSAGE_LENGTH) || 10000,
  offlineLimits: {
    public: parseInt(process.env.OFFLINE_MESSAGES_LIMIT_PUBLIC) || 2500,
    group: parseInt(process.env.OFFLINE_MESSAGES_LIMIT_GROUP) || 8000,
    private: parseInt(process.env.OFFLINE_MESSAGES_LIMIT_PRIVATE) || 5000
  }
};

// ============================================
// 定时任务配置
// ============================================
export const cronConfig = {
  cleanupSchedule: process.env.CLEANUP_CRON_SCHEDULE || '0 0 2 * * *',
  fileRetentionDays: parseInt(process.env.FILE_RETENTION_DAYS) || 7
};

// ============================================
// 安全配置
// ============================================
export const securityConfig = {
  adminPassword: process.env.ADMIN_PASSWORD,
  turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || ''
};

// ============================================
// 日志配置
// ============================================
export const logConfig = {
  level: process.env.LOG_LEVEL || 'info'
};

// 兼容性导出（保持向后兼容）
export const ADMIN_PASSWORD = securityConfig.adminPassword;
export const TURNSTILE_SECRET_KEY = securityConfig.turnstileSecretKey;

// 获取 Redis 连接 URL（优先使用完整URL，否则构建）
export function getRedisUrl() {
  if (redisConfig.url) return redisConfig.url;
  
  let url = `redis://`;
  if (redisConfig.password) {
    url += `:${redisConfig.password}@`;
  }
  url += `${redisConfig.host}:${redisConfig.port}`;
  
  return url;
}

export default {
  dbConfig,
  serverConfig,
  redisConfig,
  socketConfig,
  rateLimitConfig,
  uploadConfig,
  sessionConfig,
  messageConfig,
  cronConfig,
  securityConfig,
  logConfig,
  ADMIN_PASSWORD,
  TURNSTILE_SECRET_KEY,
  getRedisUrl
};
