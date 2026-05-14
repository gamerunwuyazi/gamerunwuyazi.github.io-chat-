import mysql from 'mysql2/promise';
import { createClient } from 'redis';
import { dbConfig, getRedisUrl, redisConfig } from '../config/index.js';

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

async function safeRedisExecute(operation, fallbackValue = null) {
  if (!isRedisConnected || !redisClient || redisClient.isReady === false) {
    console.warn('⚠️  Redis 未连接，跳过操作');
    return fallbackValue;
  }
  
  try {
    return await operation(redisClient);
  } catch (err) {
    if (err.message?.includes('closed') || err.message?.includes('connection')) {
      console.warn('⚠️  Redis 连接已关闭，尝试重连...');
      isRedisConnected = false;
      try {
        await redisClient.connect();
        isRedisConnected = true;
        console.log('✅ Redis 重连成功');
        return await operation(redisClient);
      } catch (reconnectErr) {
        console.error('❌ Redis 重连失败:', reconnectErr.message);
        return fallbackValue;
      }
    }
    throw err;
  }
}

const pool = mysql.createPool(dbConfig);

export { pool, redisClient, safeRedisExecute, isRedisConnected };
export default { pool, redisClient, safeRedisExecute, isRedisConnected };
