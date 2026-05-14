import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import schedule from 'node-schedule';
import { pool, redisClient } from './models/database.js';
import { validateIPAndSession, isIPBanned, isUserBanned, getUserSession, checkRateLimit } from './middleware/auth.js';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler.js';
import { setupAllRoutes } from './routes/index.js';
import { setupSocketIO } from './socket/index.js';
import { setSocketDependencies as setGroupDeps } from './services/groupService.js';
import { setSocketDependencies as setMessageDeps } from './services/messageService.js';
import { initUserService } from './services/userService.js';
import { initFileService } from './services/fileService.js';
import { validateMessageContent, filterMessageFields } from './utils/validators.js';
import { getClientIP, generateSessionToken, checkAvatarStorage } from './utils/helpers.js';
import {
  serverConfig,
  uploadConfig,
  sessionConfig,
  cronConfig
} from './config/index.js';

const app = express();
const server = http.createServer(app);

const uploadDir = path.join(process.cwd(), uploadConfig.uploadDir);
const avatarDir = path.join(process.cwd(), uploadConfig.avatarDir);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const corsOptions = {
  origin: function (origin, callback) {
    callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "user-id", "session-token"]
};

app.use(cors(corsOptions));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=0; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.path.includes('/admin') || req.path.includes('/private')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

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

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// 静态文件服务（必须在认证和路由之前）
app.use('/uploads', express.static(uploadDir));
app.use('/avatars', (req, res, next) => {
  res.set('Cache-Control', 'public, max-age=31536000');
  express.static(avatarDir)(req, res, next);
});

app.use(validateIPAndSession);

const io = setupSocketIO(server, {
  pool,
  redisClient,
  isIPBanned,
  isUserBanned,
  getUserSession,
  validateMessageContent,
  checkRateLimit,
  filterMessageFields,
  isGroupAdmin: async () => false,
  getGlobalMessages: async () => [],
  getGroupMessages: async () => []
});

const onlineUserManager = {
  getAllOnlineUsers: async () => {
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
};

setGroupDeps(io, onlineUserManager.getAllOnlineUsers);
setMessageDeps(io, onlineUserManager.getAllOnlineUsers);

initUserService({ io });
initFileService({ io, checkAvatarStorage });

setupAllRoutes(app, io);

app.use(notFoundHandler);
app.use(globalErrorHandler);

async function initializeDatabase() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS scr_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        nickname VARCHAR(255) NOT NULL,
        gender TINYINT DEFAULT 0 COMMENT '性别：0=保密，1=男，2=女',
        signature VARCHAR(500) DEFAULT NULL COMMENT '用户个性签名',
        avatar_url VARCHAR(500) DEFAULT NULL,
        friend_verification TINYINT(1) DEFAULT 0 COMMENT '加我为好友时是否需要验证：0=不需要，1=需要',
        last_online TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX username_index (username),
        INDEX last_online_index (last_online)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS scr_file_request_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        request_time DATETIME NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        FOREIGN KEY (user_id) REFERENCES scr_users(id) ON DELETE CASCADE,
        INDEX idx_scr_file_requests_user_time (user_id, request_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS scr_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        refresh_token VARCHAR(255) NOT NULL,
        refresh_expires DATETIME NOT NULL,
        last_active DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES scr_users(id) ON DELETE CASCADE,
        INDEX idx_scr_sessions_refresh_token (refresh_token),
        INDEX idx_scr_sessions_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS scr_api_logs (
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
      CREATE TABLE IF NOT EXISTS scr_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        creator_id INT NOT NULL,
        avatar_url VARCHAR(500) DEFAULT NULL,
        is_mute_all TINYINT(1) DEFAULT 0 COMMENT '是否全员禁言: 0=不禁言, 1=全员禁言',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        INDEX creator_id_index (creator_id),
        FOREIGN KEY (creator_id) REFERENCES scr_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS scr_friends (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        friend_id INT NOT NULL,
        status TINYINT DEFAULT 1 COMMENT '好友状态：0=被拉黑后删除(污点)，1=正常好友，2=等待对方接受，3=等待自己接受，4=拉黑对方，5=被对方拉黑(污点)，6=被删除，7=待处理已拉黑-被动(污点)，8=待处理已拉黑-主动(污点)，9=彻底清除(污点)，10=双向拉黑，11=双向拉黑后删除(污点)，12=双向彻底清除(污点)，13=待处理双方污点-发送(污点)，14=待处理双方污点-接收(污点)',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES scr_users(id) ON DELETE CASCADE,
        FOREIGN KEY (friend_id) REFERENCES scr_users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_friendship (user_id, friend_id),
        INDEX idx_friends_user_id (user_id),
        INDEX idx_friends_friend_id (friend_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS scr_private_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender_id INT NOT NULL,
        receiver_id INT NOT NULL,
        content TEXT,
        at_userid JSON DEFAULT NULL COMMENT '@用户ID列表，JSON数组格式',
        message_type INT NOT NULL DEFAULT '0' COMMENT '0代表文字，1代表图片，2代表文件，4代表引用消息',
        is_read TINYINT NOT NULL DEFAULT 0 COMMENT '0代表未读，1代表已读',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES scr_users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES scr_users(id) ON DELETE CASCADE,
        INDEX idx_private_messages_sender_receiver (sender_id, receiver_id),
        INDEX idx_private_messages_receiver_sender (receiver_id, sender_id),
        INDEX idx_private_messages_timestamp (timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS scr_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        content TEXT,
        at_userid JSON DEFAULT NULL COMMENT '@用户ID列表，JSON数组格式',
        message_type INT NOT NULL DEFAULT '0' COMMENT '0代表文字，1代表图片，2代表文件，4代表引用消息',
        group_id INT DEFAULT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX user_id_index (user_id),
        INDEX group_id_index (group_id),
        INDEX timestamp_index (timestamp),
        FOREIGN KEY (user_id) REFERENCES scr_users(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES scr_groups(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS scr_group_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        group_id INT NOT NULL,
        user_id INT NOT NULL,
        is_admin TINYINT(1) DEFAULT 0,
        is_muted DATETIME NULL DEFAULT NULL COMMENT '禁言状态: NULL=未禁言, 1=永久禁言, 时间戳=临时禁言截止时间',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL DEFAULT NULL,
        INDEX group_id_index (group_id),
        INDEX user_id_index (user_id),
        FOREIGN KEY (group_id) REFERENCES scr_groups(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES scr_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS scr_ip_logs (
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
      CREATE TABLE IF NOT EXISTS scr_banned_ips (
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
    console.error('❌ 数据库初始化失败:', err.message);
    throw err;
  }
}

async function loadSessionsFromDatabase() {
  try {
    if (!redisClient || redisClient.isReady === false) {
      console.warn('⚠️  Redis 未连接，跳过加载会话');
      return;
    }

    const [sessions] = await pool.execute(`
      SELECT user_id, refresh_token, refresh_expires
      FROM scr_sessions
      WHERE refresh_expires > NOW()
    `);

    if (sessions.length === 0) {
      console.log('✅ 数据库中没有有效会话');
      return;
    }

    const pipeline = redisClient.multi();

    for (const session of sessions) {
      const userId = parseInt(session.user_id);
      const refreshToken = session.refresh_token;
      const refreshExpires = new Date(session.refresh_expires).getTime();

      const ttlSeconds = Math.max(1, Math.floor((refreshExpires - Date.now()) / 1000));

      const refreshTokenKey = `scr:refreshToken:${userId}`;
      pipeline.set(refreshTokenKey, refreshToken);
      pipeline.expire(refreshTokenKey, ttlSeconds);
    }

    await pipeline.exec();
  } catch (err) {
    if (err.message?.includes('closed') || err.message?.includes('connection')) {
      console.warn('⚠️  Redis 连接断开，会话加载失败（将在下次重连后自动同步）');
    } else {
      console.error('❌ 从数据库加载会话失败:', err.message);
    }
  }
}

async function syncBannedIPsToRedis() {
  try {
    const [bannedRecords] = await pool.execute(
      'SELECT ip_address, user_id, reason, expires_at FROM scr_banned_ips WHERE expires_at IS NULL OR expires_at > NOW()'
    );

    await redisClient.del('scr:banned_ips');
    await redisClient.del('scr:banned_users');

    if (bannedRecords.length === 0) {
      return;
    }

    const pipeline = redisClient.multi();

    for (const record of bannedRecords) {
      if (record.ip_address) {
        const banData = {
          reason: record.reason || null,
          expires_at: record.expires_at ? record.expires_at.toISOString() : null,
          banned_by: record.banned_by || null
        };
        pipeline.hSet('scr:banned_ips', record.ip_address, JSON.stringify(banData));
      }

      if (record.user_id) {
        const banData = {
          reason: record.reason || null,
          expires_at: record.expires_at ? record.expires_at.toISOString() : null,
          banned_by: record.banned_by || null
        };
        pipeline.hSet('scr:banned_users', String(record.user_id), JSON.stringify(banData));
      }
    }

    await pipeline.exec();

    console.log(`✅ 已同步 ${bannedRecords.length} 条封禁记录到 Redis`);
  } catch (err) {
    console.error('❌ 同步封禁记录到 Redis 失败:', err.message);
  }
}

async function cleanupExpiredSessions() {
  try {
    const [result] = await pool.execute(
      'DELETE FROM scr_sessions WHERE refresh_expires < NOW()'
    );

    if (result.affectedRows > 0) {
      console.log(`🧹 已清理 ${result.affectedRows} 个过期的会话`);
    }
  } catch (err) {
    console.error('清理过期会话失败:', err.message);
  }
}

async function cleanExpiredFiles() {
  try {
    const retentionDaysAgo = Date.now() - cronConfig.fileRetentionDays * 24 * 60 * 60 * 1000;

    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      let deletedFileCount = 0;

      for (const file of files) {
        const filePath = path.join(uploadDir, file);
        try {
          const stats = fs.statSync(filePath);
          const fileMtime = stats.mtime.getTime();

          if (fileMtime < retentionDaysAgo) {
            fs.unlinkSync(filePath);
            deletedFileCount++;
          }
        } catch (err) {
          console.warn(`⚠️ 无法处理文件 ${file}: ${err.message}`);
        }
      }
      deletedFileCount > 0 ? console.log(`✅ 清理了 ${deletedFileCount} 个过期文件`) : null;
    }
  } catch (err) {
    console.error('❌ 清理过期文件失败:', err.message);
  }
}

async function getOnlineUserCount() {
  try {
    return await redisClient.hLen('scr:online_users');
  } catch (err) {
    console.error('获取在线用户数量失败:', err.message);
    return 0;
  }
}

async function getSessionCount() {
  try {
    const keys = await redisClient.keys('scr:refreshToken:*');
    return keys.length;
  } catch (err) {
    console.error('获取会话数量失败:', err.message);
    return 0;
  }
}

const PORT = serverConfig.port;

async function startServer() {
  try {
    schedule.scheduleJob(cronConfig.cleanupSchedule, async () => {
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

    cleanExpiredFiles();
    cleanupExpiredSessions();

    await initializeDatabase();
    await loadSessionsFromDatabase();
    await syncBannedIPsToRedis();

    await redisClient.del('scr:online_users');
    await redisClient.del('scr:authenticated_users');

    server.listen(PORT, '0.0.0.0', () => {
      console.log('🚀 服务器启动成功!');
      console.log(`📍 服务器运行在端口 ${PORT}`);
      console.log(`🔍 健康检查地址: http://localhost:${PORT}/health`);
      console.log(`🔐 会话检查地址: http://localhost:${PORT}/session-check`);
      console.log(`📊 会话调试地址: http://localhost:${PORT}/sessions`);
      console.log(`🌐 CORS: ${serverConfig.corsOrigin}`);
      console.log(`💡 会话模式: ${sessionConfig.expireMinutes}分钟过期`);

      const storageStatus = checkAvatarStorage();
      console.log(`💾 ${storageStatus.message}`);

      console.log('\n📋 服务器配置信息:');
      console.log(`   - Ping超时: ${io.engine.opts.pingTimeout}ms`);
      console.log(`   - Ping间隔: ${io.engine.opts.pingInterval}ms`);
      console.log(`   - 连接超时: ${io.engine.opts.connectTimeout}ms`);
      console.log(`   - 升级超时: ${io.engine.opts.upgradeTimeout}ms`);
      console.log(`   - 传输方式: ${io.engine.opts.transports.join(', ')}`);
      console.log(`   - 会话模式: ${sessionConfig.expireMinutes}分钟过期`);

      console.log(`---------------------------------------------------------`);
    });
  } catch (err) {
    console.error('💥 启动服务器失败:', err.message);
    process.exit(1);
  }
}

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

startServer();

export { server, app, io };
