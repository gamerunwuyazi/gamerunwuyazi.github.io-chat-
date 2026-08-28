import mysql from 'mysql2/promise';
import { createClient } from 'redis';
import { dbConfig, getRedisUrl } from '../config/index.js';

const redisClient = createClient({
  url: getRedisUrl()
});

redisClient.on('error', (err) => {
  console.error('❌ Redis 连接错误:', err.message);
});

redisClient.on('reconnecting', () => {
  console.log('⚠️  Redis 正在重连...');
});

let isRedisConnected = false;

(async () => {
  try {
    await redisClient.connect();
    isRedisConnected = true;
  } catch (err) {
    console.error('❌ Redis 连接失败:', err.message);
    isRedisConnected = false;
  }
})();

// Redis 命令超时兜底：防止命令挂起时 Promise 永不 settle（泄漏）
// 压测反馈：3s 太激进，Redis 高峰排队时会把"Redis 忙"误判为业务失败，放宽到 10s
const REDIS_COMMAND_TIMEOUT_MS = 10000;

export class RedisUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RedisUnavailableError';
  }
}

function withRedisTimeout(operation) {
  return Promise.race([
    operation(redisClient),
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Redis 命令执行超时'));
      }, REDIS_COMMAND_TIMEOUT_MS);
      // 让定时器在进程退出前不阻塞
      if (timer.unref) timer.unref();
    })
  ]);
}

// options.strict: true 时，Redis 不可用/超时不再返回 fallbackValue，
// 而是抛出 RedisUnavailableError，由调用方决定语义（如 HTTP 返回 503 而非误判 401）
async function safeRedisExecute(operation, fallbackValue = null, options = {}) {
  const { strict = false } = options;

  if (!isRedisConnected || !redisClient || redisClient.isReady === false) {
    console.warn('⚠️  Redis 未连接，跳过操作');
    if (strict) throw new RedisUnavailableError('Redis 未连接');
    return fallbackValue;
  }

  try {
    return await withRedisTimeout(operation);
  } catch (err) {
    if (err.message?.includes('超时')) {
      console.warn('⚠️  Redis 命令执行超时，返回降级值');
      if (strict) throw new RedisUnavailableError('Redis 命令执行超时');
      return fallbackValue;
    }
    if (err.message?.includes('closed') || err.message?.includes('connection')) {
      console.warn('⚠️  Redis 连接已关闭，尝试重连...');
      isRedisConnected = false;
      try {
        await redisClient.connect();
        isRedisConnected = true;
        console.log('✅ Redis 重连成功');
        return await withRedisTimeout(operation);
      } catch (reconnectErr) {
        console.error('❌ Redis 重连失败:', reconnectErr.message);
        if (strict) throw new RedisUnavailableError('Redis 重连失败');
        return fallbackValue;
      }
    }
    throw err;
  }
}

const pool = mysql.createPool(dbConfig);

export { pool, redisClient, safeRedisExecute, isRedisConnected };
export default { pool, redisClient, safeRedisExecute, isRedisConnected };
