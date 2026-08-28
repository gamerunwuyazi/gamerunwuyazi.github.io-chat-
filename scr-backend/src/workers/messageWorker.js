// SPDX-License-Identifier: MIT
// 消息拉取 Worker 线程
// 将 getGlobalMessages / getGroupMessages / getOfflineMessages 等 CPU 密集的
// 消息查询与格式化任务放到独立线程执行，避免阻塞主线程事件循环。
import { parentPort, workerData } from 'worker_threads';
import mysql from 'mysql2/promise';
import { createClient } from 'redis';

const { dbConfig, redisUrl, offlineLimits } = workerData;

let dbPromise = null;
let redisPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });
  }
  return dbPromise;
}

function getRedis() {
  if (!redisPromise) {
    redisPromise = (async () => {
      const client = createClient({ url: redisUrl });
      client.on('error', () => {});
      await client.connect();
      return client;
    })();
  }
  return redisPromise;
}

// ===== getGlobalMessages =====
async function runGetGlobalMessages({ limit, olderThan, userId }) {
  const db = await getDb();
  const redis = await getRedis();

  let query = 'SELECT m.id, m.user_id as userId, u.nickname, u.avatar_url as avatarUrl,'
    + 'm.content, m.at_userid, m.message_type as messageType, m.group_id as groupId, m.timestamp'
    + ' FROM scr_messages m'
    + ' JOIN scr_users u ON m.user_id = u.id'
    + ' WHERE m.group_id IS NULL';

  const params = [];

  let safeLimit = 20;
  try {
    safeLimit = parseInt(limit);
    if (isNaN(safeLimit) || safeLimit <= 0) {
      safeLimit = 20;
    }
  } catch (e) {
    safeLimit = 20;
  }

  const isOlderThanValid = olderThan !== null && olderThan !== undefined && olderThan !== '' && olderThan !== 0 && String(olderThan).trim() !== '';

  if (isOlderThanValid) {
    let safeOlderThan = 0;
    try {
      safeOlderThan = parseInt(olderThan);
      if (!isNaN(safeOlderThan)) {
        query += ' AND m.id < ?';
        params.push(safeOlderThan);
      }
    } catch (e) {
      // 解析失败，使用默认值0
    }
  }

  query += ' ORDER BY m.timestamp DESC, m.id DESC LIMIT ?';
  params.push(safeLimit);

  const [messages] = await db.query(query, params);

  let readMaxId = 0;
  if (userId) {
    const readValue = await redis.get(`scr:read:global:${parseInt(userId)}`);
    readMaxId = readValue ? parseInt(readValue) : 0;
  }

  const processedMessages = messages.map(msg => {
    let atUserIds = null;
    if (msg.at_userid) {
      try {
        const parsed = JSON.parse(msg.at_userid);
        if (Array.isArray(parsed)) {
          atUserIds = parsed.filter(id => id !== null && id !== undefined && id !== '' && !isNaN(Number(id))).map(id => Number(id));
          if (atUserIds.length === 0) atUserIds = null;
        }
      } catch (e) {
        atUserIds = null;
      }
    }
    const baseMessage = {
      id: msg.id,
      userId: msg.userId,
      nickname: msg.nickname,
      avatarUrl: msg.avatarUrl,
      content: msg.content,
      at_userid: atUserIds,
      messageType: msg.messageType,
      groupId: msg.groupId !== null && msg.groupId !== undefined ? parseInt(msg.groupId) : null,
      timestamp: msg.timestamp,
      isRead: userId ? (msg.id <= readMaxId || String(msg.userId) === String(userId)) : false
    };

    if (msg.groupNickname) {
      baseMessage.groupNickname = msg.groupNickname;
    }

    if (msg.messageType === 101) {
      const recallMessageId = String(msg.content || '').trim();
      if (recallMessageId && !isNaN(Number(recallMessageId))) {
        baseMessage.content = recallMessageId;
      }
    }

    if (msg.messageType === 1 && msg.content) {
      try {
        const contentData = JSON.parse(msg.content);
        if (contentData.url) {
          baseMessage.imageUrl = contentData.url;
        }
      } catch (error) {
        console.error(`解析图片消息失败: 消息ID=${msg.id}, 错误=${error.message}`);
      }
    }

    return baseMessage;
  });

  return processedMessages.reverse();
}

// ===== getGroupMessages =====
async function runGetGroupMessages({ groupId, limit, olderThan, userId }) {
  const db = await getDb();
  const redis = await getRedis();

  let safeGroupId = 0;
  try {
    safeGroupId = parseInt(groupId);
    if (isNaN(safeGroupId)) {
      return [];
    }
  } catch (e) {
    return [];
  }

  let safeLimit = 20;
  try {
    safeLimit = parseInt(limit);
    if (isNaN(safeLimit) || safeLimit <= 0) {
      safeLimit = 20;
    }
  } catch (e) {
    safeLimit = 20;
  }

  let query = 'SELECT m.id, m.user_id as userId, u.nickname, u.avatar_url as avatarUrl,'
    + 'm.content, m.at_userid, m.message_type as messageType, m.group_id as groupId, m.timestamp,'
    + 'gm.group_nickname as groupNickname'
    + ' FROM scr_messages m'
    + ' JOIN scr_users u ON m.user_id = u.id'
    + ' LEFT JOIN scr_group_members gm ON m.user_id = gm.user_id AND m.group_id = gm.group_id AND gm.deleted_at IS NULL'
    + ' WHERE m.group_id = ?';
  const params = [safeGroupId];

  const isOlderThanValid = olderThan !== null && olderThan !== undefined && olderThan !== '' && olderThan !== 0 && String(olderThan).trim() !== '';
  if (isOlderThanValid) {
    let safeOlderThan = 0;
    try {
      safeOlderThan = parseInt(olderThan);
      if (!isNaN(safeOlderThan)) {
        query += ' AND m.id < ?';
        params.push(safeOlderThan);
      }
    } catch (e) {
      // 解析失败，使用默认值0
    }
  }

  query += ' ORDER BY m.timestamp DESC, m.id DESC LIMIT ?';
  params.push(safeLimit);

  const [messages] = await db.query(query, params);

  let readMaxId = 0;
  let isGroupDisturb = false;
  if (userId) {
    // 检查用户是否对该群组设置了免打扰
    try {
      const [memberRows] = await db.execute(
        'SELECT is_disturb FROM scr_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
        [safeGroupId, parseInt(userId)]
      );
      if (memberRows.length > 0 && memberRows[0].is_disturb === 1) {
        isGroupDisturb = true;
      }
    } catch (e) {
      console.error('检查群组免打扰状态失败:', e.message);
    }

    if (!isGroupDisturb) {
      const readValue = await redis.get(`scr:read:group:${safeGroupId}:${parseInt(userId)}`);
      readMaxId = readValue ? parseInt(readValue) : 0;
    }
  }

  const processedMessages = messages.map(msg => {
    let atUserIds = null;
    if (msg.at_userid) {
      try {
        const parsed = JSON.parse(msg.at_userid);
        if (Array.isArray(parsed)) {
          atUserIds = parsed.filter(id => id !== null && id !== undefined && id !== '' && !isNaN(Number(id))).map(id => Number(id));
          if (atUserIds.length === 0) atUserIds = null;
        }
      } catch (e) {
        atUserIds = null;
      }
    }
    const baseMessage = {
      id: msg.id,
      userId: msg.userId,
      nickname: msg.nickname,
      avatarUrl: msg.avatarUrl,
      content: msg.content,
      at_userid: atUserIds,
      messageType: msg.messageType,
      groupId: msg.groupId !== null && msg.groupId !== undefined ? parseInt(msg.groupId) : null,
      timestamp: msg.timestamp,
      isRead: userId ? (msg.id <= readMaxId || String(msg.userId) === String(userId)) : false
    };

    if (msg.groupNickname) {
      baseMessage.groupNickname = msg.groupNickname;
    }

    if (msg.messageType === 101) {
      try {
        const parsed = JSON.parse(msg.content);
        if (parsed && parsed.id) {
          baseMessage.content = msg.content;
        }
      } catch (e) {
        const recallMessageId = String(msg.content || '').trim();
        if (recallMessageId && !isNaN(Number(recallMessageId))) {
          baseMessage.content = JSON.stringify({
            id: Number(recallMessageId),
            nickname: { [msg.userId]: msg.groupNickname || msg.nickname || '用户' }
          });
        }
      }
    }

    if (msg.messageType === 1 && msg.content) {
      try {
        const contentData = JSON.parse(msg.content);
        if (contentData.url) {
          baseMessage.imageUrl = contentData.url;
        }
      } catch (error) {
        console.error(`解析图片消息失败: 消息ID=${msg.id}, 错误=${error.message}`);
      }
    }

    // 免打扰群组：强制所有消息已读
    if (isGroupDisturb) {
      baseMessage.isRead = true;
    }

    return baseMessage;
  });

  return processedMessages.reverse();
}

// ===== getOfflineMessages =====
async function runGetOfflineMessages({ userId, publicAndGroupMinId, privateMinId }) {
  const db = await getDb();
  const redis = await getRedis();

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const publicLimit = offlineLimits.public;
  const [publicMessages] = await db.query(`
    SELECT 
      m.id, 
      m.user_id as userId, 
      u.nickname, 
      u.avatar_url as avatarUrl, 
      m.content, 
      m.at_userid as atUserid,
      m.message_type as messageType, 
      m.timestamp,
      'public' as type
    FROM scr_messages m 
    JOIN scr_users u ON m.user_id = u.id 
    WHERE m.group_id IS NULL 
      AND m.timestamp >= ?
      AND m.id > ?
    ORDER BY m.timestamp DESC, m.id DESC
    LIMIT ?
  `, [threeMonthsAgo, publicAndGroupMinId, publicLimit]);

  const [allMemberRecords] = await db.execute(`
    SELECT group_id, joined_at, deleted_at FROM scr_group_members WHERE user_id = ?
  `, [userId]);

  const groupRecordsMap = new Map();
  for (const record of allMemberRecords) {
    const groupId = record.group_id;
    if (!groupRecordsMap.has(groupId)) {
      groupRecordsMap.set(groupId, []);
    }
    groupRecordsMap.get(groupId).push(record);
  }

  let groupMessages = [];
  if (groupRecordsMap.size > 0) {
    for (const [groupId, records] of groupRecordsMap) {
      const timeConditions = [];
      const params = [groupId, threeMonthsAgo, publicAndGroupMinId];

      for (const record of records) {
        if (record.deleted_at) {
          timeConditions.push(`(m.timestamp >= ? AND m.timestamp <= ?)`);
          params.push(record.joined_at, record.deleted_at);
        } else {
          timeConditions.push(`m.timestamp >= ?`);
          params.push(record.joined_at);
        }
      }

      const timeCondition = timeConditions.join(' OR ');

      const groupLimit = offlineLimits.group;
      params.push(groupLimit);

      const [groupMsgs] = await db.query(`
        SELECT 
          m.id, 
          m.user_id as userId, 
          u.nickname, 
          u.avatar_url as avatarUrl, 
          m.content, 
          m.at_userid as atUserid,
          m.message_type as messageType, 
          m.timestamp,
          'group' as type,
          m.group_id as groupId,
          g.name as groupName,
          g.deleted_at as groupDeletedAt,
          gm.group_nickname as groupNickname
        FROM scr_messages m 
        JOIN scr_users u ON m.user_id = u.id 
        JOIN scr_groups g ON m.group_id = g.id
        LEFT JOIN scr_group_members gm ON m.user_id = gm.user_id AND m.group_id = gm.group_id AND gm.deleted_at IS NULL
        WHERE m.group_id = ?
          AND m.timestamp >= ?
          AND m.id > ?
          AND (${timeCondition})
        ORDER BY m.timestamp DESC, m.id DESC
        LIMIT ?
      `, params);

      groupMessages = groupMessages.concat(groupMsgs);
    }

    groupMessages.sort((a, b) => {
      if (b.timestamp !== a.timestamp) {
        return new Date(b.timestamp) - new Date(a.timestamp);
      }
      return b.id - a.id;
    });

    if (groupMessages.length > 8000) {
      groupMessages = groupMessages.slice(0, 8000);
    }
  }

  const privateLimit = offlineLimits.private;
  const [privateMessages] = await db.query(`
    SELECT
      p.id,
      p.sender_id as senderId,
      p.receiver_id as receiverId,
      p.content,
      p.at_userid as atUserid,
      p.message_type as messageType,
      p.is_read as isRead,
      p.timestamp,
      'private' as type,
      u1.nickname as nickname,
      u1.avatar_url as avatarUrl,
      u2.nickname as receiverNickname,
      u2.avatar_url as receiverAvatarUrl
    FROM scr_private_messages p
    JOIN scr_users u1 ON p.sender_id = u1.id
    JOIN scr_users u2 ON p.receiver_id = u2.id
    WHERE ((p.sender_id = ? AND p.receiver_id != ?) OR (p.receiver_id = ? AND p.sender_id != ?))
      AND p.timestamp >= ?
      AND p.id > ?
    ORDER BY p.timestamp DESC, p.id DESC
    LIMIT ?
  `, [userId, userId, userId, userId, threeMonthsAgo, privateMinId, privateLimit]);

  const processRecallMessage = (msg) => {
    if (msg.messageType === 101) {
      if (msg.type === 'group' && msg.groupId) {
        try {
          const parsed = JSON.parse(msg.content);
          if (parsed && parsed.id) {
            return msg;
          }
        } catch (e) {
          // 旧格式，需要转换
        }
        const recallMessageId = String(msg.content || '').trim();
        if (recallMessageId && !isNaN(Number(recallMessageId))) {
          msg.content = JSON.stringify({
            id: Number(recallMessageId),
            nickname: { [msg.userId || msg.senderId]: msg.groupNickname || msg.nickname || '用户' }
          });
        }
      }
    }
    return msg;
  };

  let globalReadMaxId = 0;
  if (userId) {
    try {
      const val = await redis.get(`scr:read:global:${userId}`);
      globalReadMaxId = val ? parseInt(val) : 0;
    } catch (e) {
      globalReadMaxId = 0;
    }
  }

  const processedPublicMessages = publicMessages.map(msg => {
    const processed = processRecallMessage(msg);
    processed.isRead = globalReadMaxId > 0 ? (msg.id <= globalReadMaxId) : false;
    return processed;
  });

  const groupReadMaxIds = {};
  if (userId) {
    const uniqueGroupIds = [...new Set(groupMessages.map(m => m.groupId))];
    for (const gid of uniqueGroupIds) {
      try {
        const val = await redis.get(`scr:read:group:${gid}:${userId}`);
        groupReadMaxIds[gid] = val ? parseInt(val) : 0;
      } catch (e) {
        groupReadMaxIds[gid] = 0;
      }
    }
  }

  const processedGroupMessages = groupMessages.map(msg => {
    const processed = processRecallMessage(msg);
    const maxId = groupReadMaxIds[msg.groupId] || 0;
    const isOwnMessage = String(msg.userId || msg.senderId) === String(userId);
    processed.isRead = isOwnMessage || (maxId > 0 ? (msg.id <= maxId) : false);
    return processed;
  });

  const processedPrivateMessages = privateMessages.map(processRecallMessage);

  return {
    publicMessages: processedPublicMessages.reverse(),
    groupMessages: processedGroupMessages.reverse(),
    privateMessages: processedPrivateMessages.reverse(),
    timestamp: new Date().toISOString()
  };
}

// 任务分发
parentPort.on('message', async (task) => {
  try {
    let result;
    switch (task.type) {
      case 'getGlobalMessages':
        result = await runGetGlobalMessages(task);
        break;
      case 'getGroupMessages':
        result = await runGetGroupMessages(task);
        break;
      case 'getOfflineMessages':
        result = await runGetOfflineMessages(task);
        break;
      default:
        throw new Error('未知任务类型: ' + task.type);
    }
    parentPort.postMessage({ id: task.id, ok: true, result });
  } catch (err) {
    parentPort.postMessage({ id: task.id, ok: false, error: { message: err.message } });
  }
});
