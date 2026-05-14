import crypto from 'crypto';

export const FRIEND_STATUS = {
  STAIN_AFTER_BLOCK_AND_DELETE: 0,
  NORMAL: 1,
  PENDING_THEIR_ACCEPT: 2,
  PENDING_MY_ACCEPT: 3,
  BLOCKED_BY_ME: 4,
  BLOCKED_BY_THEM_STAIN: 5,
  DELETED: 6,
  PENDING_BLOCKED_PASSIVE_STAIN: 7,
  PENDING_BLOCKED_ACTIVE_STAIN: 8,
  COMPLETELY_REMOVED_STAIN: 9,
  MUTUAL_BLOCK: 10,
  MUTUAL_BLOCK_DELETED_STAIN: 11,
  MUTUAL_COMPLETELY_REMOVED_STAIN: 12,
  PENDING_MUTUAL_STAIN_SENT: 13,
  PENDING_MUTUAL_STAIN_RECEIVED: 14
};

export const FRIEND_STATUS_DESCRIPTIONS = {
  [FRIEND_STATUS.STAIN_AFTER_BLOCK_AND_DELETE]: '被拉黑后删除(污点)',
  [FRIEND_STATUS.NORMAL]: '正常好友',
  [FRIEND_STATUS.PENDING_THEIR_ACCEPT]: '等待对方接受',
  [FRIEND_STATUS.PENDING_MY_ACCEPT]: '等待自己接受',
  [FRIEND_STATUS.BLOCKED_BY_ME]: '拉黑对方',
  [FRIEND_STATUS.BLOCKED_BY_THEM_STAIN]: '被对方拉黑(污点)',
  [FRIEND_STATUS.DELETED]: '被删除',
  [FRIEND_STATUS.PENDING_BLOCKED_PASSIVE_STAIN]: '待处理已拉黑-被动(污点)',
  [FRIEND_STATUS.PENDING_BLOCKED_ACTIVE_STAIN]: '待处理已拉黑-主动(污点)',
  [FRIEND_STATUS.COMPLETELY_REMOVED_STAIN]: '彻底清除(污点)',
  [FRIEND_STATUS.MUTUAL_BLOCK]: '双向拉黑',
  [FRIEND_STATUS.MUTUAL_BLOCK_DELETED_STAIN]: '双向拉黑后删除(污点)',
  [FRIEND_STATUS.MUTUAL_COMPLETELY_REMOVED_STAIN]: '双向彻底清除(污点)',
  [FRIEND_STATUS.PENDING_MUTUAL_STAIN_SENT]: '待处理双方污点-发送(污点)',
  [FRIEND_STATUS.PENDING_MUTUAL_STAIN_RECEIVED]: '待处理双方污点-接收(污点)'
};

export const SINGLE_STAIN_STATUSES = [
  FRIEND_STATUS.STAIN_AFTER_BLOCK_AND_DELETE,
  FRIEND_STATUS.BLOCKED_BY_ME,
  FRIEND_STATUS.BLOCKED_BY_THEM_STAIN,
  FRIEND_STATUS.PENDING_BLOCKED_PASSIVE_STAIN,
  FRIEND_STATUS.PENDING_BLOCKED_ACTIVE_STAIN,
  FRIEND_STATUS.COMPLETELY_REMOVED_STAIN
];

export const MUTUAL_STAIN_STATUSES = [
  FRIEND_STATUS.MUTUAL_BLOCK,
  FRIEND_STATUS.MUTUAL_BLOCK_DELETED_STAIN,
  FRIEND_STATUS.MUTUAL_COMPLETELY_REMOVED_STAIN
];

export const ALL_STAIN_STATUSES = [...SINGLE_STAIN_STATUSES, ...MUTUAL_STAIN_STATUSES, FRIEND_STATUS.PENDING_MUTUAL_STAIN_SENT, FRIEND_STATUS.PENDING_MUTUAL_STAIN_RECEIVED];

export const ERROR_CODES = {
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  GROUP_NOT_FOUND: 'GROUP_NOT_FOUND',
  GROUP_DELETED: 'GROUP_DELETED',
  NOT_IN_GROUP: 'NOT_IN_GROUP',
  NOT_GROUP_ADMIN: 'NOT_GROUP_ADMIN',
  NOT_FRIEND: 'NOT_FRIEND',
  INVALID_FRIEND_STATUS: 'INVALID_FRIEND_STATUS',
  FRIEND_BLOCKED_OR_DELETED: 'FRIEND_BLOCKED_OR_DELETED'
};

export const RATE_LIMIT_CONFIG = {
  SHORT_WINDOW_MS: 10 * 1000,
  SHORT_LIMIT: 10,
  LONG_WINDOW_MS: 60 * 1000,
  LONG_LIMIT: 40
};

const sqlInjectionPattern = /(^'|'$|^"|"$|;|--|\/\*|\*\/|\b(or|and|union|select|insert|update|delete|drop|create|alter|exec|execute|xp_)|\b(1=1|0=0)\b|\bwhere\b|\bfrom\b|\bjoin\b|\bcase\b|\bwhen\b|\bthen\b|\belse\b|\bend\b)/i;

export function validateUsername(username) {
  try {
    if (!username || typeof username !== 'string') return false;
    if (sqlInjectionPattern.test(username)) return false;
    return username.trim().length > 0;
  } catch (error) {
    console.error('用户名验证出错:', error.message);
    return false;
  }
}

export function validatePassword(password) {
  try {
    if (!password || typeof password !== 'string') return false;
    if (sqlInjectionPattern.test(password)) return false;
    return password.trim().length > 0;
  } catch (error) {
    console.error('密码验证出错:', error.message);
    return false;
  }
}

export function validateNickname(nickname) {
  try {
    if (!nickname || typeof nickname !== 'string') return false;
    if (sqlInjectionPattern.test(nickname)) return false;
    return nickname.trim().length > 0;
  } catch (error) {
    console.error('昵称验证出错:', error.message);
    return false;
  }
}

export function validateMessageContent(content) {
  if (typeof content === 'string' && content.trim().length > 0 && content.length <= 10000) {
    return true;
  }
  return false;
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}
