import { redisClient } from '../models/database.js';

export async function checkLoginRateLimit(ip) {
  try {
    const minuteKey = `scr:rate_limit:login:minute:${ip}`;
    const hourKey = `scr:rate_limit:login:hour:${ip}`;

    const minuteCount = await redisClient.incr(minuteKey);
    const hourCount = await redisClient.incr(hourKey);

    if (minuteCount === 1) {
      await redisClient.expire(minuteKey, 60);
    }
    if (hourCount === 1) {
      await redisClient.expire(hourKey, 3600);
    }

    const minuteTtl = await redisClient.ttl(minuteKey);
    const hourTtl = await redisClient.ttl(hourKey);

    if (minuteCount > 15) {
      return {
        allowed: false,
        limitType: 'minute',
        count: minuteCount,
        waitSeconds: minuteTtl > 0 ? minuteTtl : 60
      };
    }

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

export async function checkRegisterRateLimit(ip) {
  try {
    const now = new Date();
    const hourKey = `scr:rate_limit:register:hour:${ip}`;
    const dayKey = `scr:rate_limit:register:day:${ip}`;
    const monthKey = `scr:rate_limit:register:month:${ip}`;

    const hourCount = await redisClient.incr(hourKey);
    const dayCount = await redisClient.incr(dayKey);
    const monthCount = await redisClient.incr(monthKey);

    if (hourCount === 1) {
      await redisClient.expire(hourKey, 3600);
    }
    if (dayCount === 1) {
      await redisClient.expire(dayKey, 86400);
    }
    if (monthCount === 1) {
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
      const ttl = Math.ceil((monthEnd - now) / 1000);
      await redisClient.expire(monthKey, ttl);
    }

    let allowed = true;
    let limitType = '';
    let waitSeconds = 0;

    if (hourCount > 2) {
      const ttl = await redisClient.ttl(hourKey);
      allowed = false;
      limitType = 'hour';
      waitSeconds = ttl > 0 ? ttl : 3600;
    } else if (dayCount > 5) {
      const ttl = await redisClient.ttl(dayKey);
      allowed = false;
      limitType = 'day';
      waitSeconds = ttl > 0 ? ttl : 86400;
    } else if (monthCount > 20) {
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
      allowed = false;
      limitType = 'month';
      waitSeconds = Math.ceil((monthEnd - now) / 1000);
    }

    return { allowed, limitType, count: { hour: hourCount, day: dayCount, month: monthCount }, waitSeconds };
  } catch (err) {
    console.error('注册速率限制检查失败:', err.message);
    return { allowed: true, limitType: null, count: { hour: 0, day: 0, month: 0 }, waitSeconds: 0 };
  }
}
