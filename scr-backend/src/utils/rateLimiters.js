import { redisClient } from '../models/database.js';

// 登录速率限制 —— INCR 计数 + 首次设置 TTL，放入 Lua 中原子执行。
// 修复旧版 INCR 与 EXPIRE 分离导致的极小崩溃窗口（INCR 后未设 TTL 的 key 永不过期）。
const LOGIN_RATE_LIMIT_LUA = `
  local minuteKey = KEYS[1]
  local hourKey = KEYS[2]

  local minuteCount = redis.call('INCR', minuteKey)
  local hourCount = redis.call('INCR', hourKey)

  -- 首次递增时设置过期时间，保证 key 一定能自动过期
  if minuteCount == 1 then redis.call('EXPIRE', minuteKey, 60) end
  if hourCount == 1 then redis.call('EXPIRE', hourKey, 3600) end

  local minuteTtl = redis.call('TTL', minuteKey)
  local hourTtl = redis.call('TTL', hourKey)

  return {minuteCount, hourCount, minuteTtl, hourTtl}
`;

export async function checkLoginRateLimit(ip) {
  try {
    const minuteKey = `scr:rate_limit:login:minute:${ip}`;
    const hourKey = `scr:rate_limit:login:hour:${ip}`;

    const result = await redisClient.eval(LOGIN_RATE_LIMIT_LUA, {
      keys: [minuteKey, hourKey],
      arguments: []
    });

    const [minuteCount, hourCount, minuteTtl, hourTtl] = result.map(Number);

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

// 注册速率限制 —— 小时/天/月 三级 INCR 计数 + 首次设置 TTL，Lua 原子执行。
// 月窗口 TTL 由调用方按"本月剩余时长"传入（依赖 JS 时钟计算月末时刻）。
const REGISTER_RATE_LIMIT_LUA = `
  local hourKey = KEYS[1]
  local dayKey = KEYS[2]
  local monthKey = KEYS[3]
  local monthTtl = tonumber(ARGV[1])

  local hourCount = redis.call('INCR', hourKey)
  local dayCount = redis.call('INCR', dayKey)
  local monthCount = redis.call('INCR', monthKey)

  if hourCount == 1 then redis.call('EXPIRE', hourKey, 3600) end
  if dayCount == 1 then redis.call('EXPIRE', dayKey, 86400) end
  if monthCount == 1 then redis.call('EXPIRE', monthKey, monthTtl) end

  local hourTtl = redis.call('TTL', hourKey)
  local dayTtl = redis.call('TTL', dayKey)
  local monthTtlOut = redis.call('TTL', monthKey)

  return {hourCount, dayCount, monthCount, hourTtl, dayTtl, monthTtlOut}
`;

export async function checkRegisterRateLimit(ip) {
  try {
    const now = new Date();
    const hourKey = `scr:rate_limit:register:hour:${ip}`;
    const dayKey = `scr:rate_limit:register:day:${ip}`;
    const monthKey = `scr:rate_limit:register:month:${ip}`;
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
    const monthTtl = Math.ceil((monthEnd - now) / 1000);

    const result = await redisClient.eval(REGISTER_RATE_LIMIT_LUA, {
      keys: [hourKey, dayKey, monthKey],
      // Lua eval 参数必须为 string|Buffer，数字需转字符串
      arguments: [String(monthTtl)]
    });

    const [hourCount, dayCount, monthCount, hourTtl, dayTtl, monthTtlOut] = result.map(Number);

    let allowed = true;
    let limitType = '';
    let waitSeconds = 0;

    if (hourCount > 2) {
      allowed = false;
      limitType = 'hour';
      waitSeconds = hourTtl > 0 ? hourTtl : 3600;
    } else if (dayCount > 5) {
      allowed = false;
      limitType = 'day';
      waitSeconds = dayTtl > 0 ? dayTtl : 86400;
    } else if (monthCount > 20) {
      allowed = false;
      limitType = 'month';
      waitSeconds = monthTtlOut > 0 ? monthTtlOut : monthTtl;
    }

    return { allowed, limitType, count: { hour: hourCount, day: dayCount, month: monthCount }, waitSeconds };
  } catch (err) {
    console.error('注册速率限制检查失败:', err.message);
    return { allowed: true, limitType: null, count: { hour: 0, day: 0, month: 0 }, waitSeconds: 0 };
  }
}
