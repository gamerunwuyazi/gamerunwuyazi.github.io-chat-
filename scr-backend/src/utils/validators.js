import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const sqlInjectionPattern = /(^'|'$|^"|"$|;|--|\/\*|\*\/|\b(or|and|union|select|insert|update|delete|drop|create|alter|exec|execute|xp_)|\b(1=1|0=0)\b|\bwhere\b|\bfrom\b|\bjoin\b|\bcase\b|\bwhen\b|\bthen\b|\belse\b|\bend\b)/i;

export function filterMessageFields(message, messageType) {
  let timestamp = message.timestamp;
  let timestampISO = message.timestampISO;

  if (timestamp instanceof Date) {
    timestampISO = timestamp.toISOString();
    timestamp = timestamp.getTime();
  } else if (typeof timestamp === 'string') {
    const date = new Date(timestamp);
    timestamp = date.getTime();
    timestampISO = timestampISO || date.toISOString();
  }

  const baseFields = {
    id: Number(message.id),
    userId: Number(message.userId),
    nickname: message.nickname,
    avatarUrl: message.avatarUrl,
    content: message.content,
    messageType: Number(message.messageType),
    timestamp: timestamp,
    timestampISO: timestampISO
  };

  function processAtUserid(atUseridValue) {
    if (atUseridValue === undefined || atUseridValue === null) return null;

    let atUseridArray;

    if (typeof atUseridValue === 'string') {
      try {
        atUseridArray = JSON.parse(atUseridValue);
      } catch (e) {
        atUseridArray = [atUseridValue];
      }
    } else if (Array.isArray(atUseridValue)) {
      atUseridArray = atUseridValue;
    } else {
      atUseridArray = [atUseridValue];
    }

    const validIds = atUseridArray
      .filter(id => id !== null && id !== undefined && id !== '')
      .map(id => Number(id))
      .filter(id => !isNaN(id));

    return validIds.length > 0 ? validIds : null;
  }

  if (messageType === 'public') {
    const atUserid = processAtUserid(message.atUserid || message.at_userid);
    if (atUserid) {
      baseFields.atUserid = atUserid;
    }
  } else if (messageType === 'group') {
    const atUserid = processAtUserid(message.atUserid || message.at_userid);
    if (atUserid) {
      baseFields.atUserid = atUserid;
    }
    baseFields.groupId = Number(message.groupId);
  } else if (messageType === 'private') {
    baseFields.senderId = Number(message.senderId);
    baseFields.receiverId = Number(message.receiverId);
    baseFields.isRead = message.isRead;
    delete baseFields.userId;
  }

  return baseFields;
}

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

import { messageConfig } from '../config/index.js';

export function validateMessageContent(content) {
  if (typeof content === 'string' && content.trim().length > 0 && content.length <= messageConfig.maxLength) {
    return true;
  }
  return false;
}
