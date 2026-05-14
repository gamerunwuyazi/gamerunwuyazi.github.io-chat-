import { pool, redisClient } from '../models/database.js';
import { filterMessageFields } from '../utils/messageFilters.js';
import { checkRateLimit } from '../middleware/auth.js';
import { validateMessageContent } from '../utils/validators.js';
import { messageConfig, uploadConfig } from '../config/index.js';
import path from 'path';
import fs from 'fs';

const uploadDir = path.join(process.cwd(), uploadConfig.uploadDir);

let io = null;
let getAllOnlineUsersFn = null;
let isAuthenticatedUserFn = null;

export function setSocketDependencies(socketIo, getOnlineUsersFn, authUserFn) {
  io = socketIo;
  getAllOnlineUsersFn = getOnlineUsersFn;
  isAuthenticatedUserFn = authUserFn;
}

function checkIfUserMuted(isMutedValue) {
  const result = {
    muted: false,
    permanent: false,
    remainingMinutes: 0
  };
  
  // 情况1: NULL - 未禁言
  if (isMutedValue === null || isMutedValue === undefined) {
    return result;
  }
  
  const valueStr = String(isMutedValue).trim();
  
  // 情况2: 旧格式 TINYINT - 值为 '0' 或 '1'
  if (valueStr === '0') {
    return result; // 未禁言
  }
  
  if (valueStr === '1') {
    console.warn('⚠️ 检测到旧格式的禁言数据(TINYINT=1)，建议升级数据库结构');
    result.muted = true;
    result.permanent = true; // 旧格式的1视为永久禁言
    return result;
  }
  
  // 情况3: 新格式 DATETIME - 包含9999表示永久禁言
  if (valueStr.includes('9999')) {
    result.muted = true;
    result.permanent = true;
    return result;
  }
  
  // 情况4: 解析为日期时间（支持多种格式）
  let mutedTime;
  
  // 尝试解析MySQL DATETIME格式: "2026-05-13 19:35:15"
  const mysqlDateTimeMatch = valueStr.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (mysqlDateTimeMatch) {
    const [, year, month, day, hour, minute, second] = mysqlDateTimeMatch;
    mutedTime = new Date(
      parseInt(year), 
      parseInt(month) - 1, 
      parseInt(day),
      parseInt(hour), 
      parseInt(minute), 
      parseInt(second)
    );
  } else {
    // 尝试ISO格式或其他格式
    mutedTime = new Date(valueStr);
  }
  
  if (!isNaN(mutedTime.getTime())) {
    // 获取当前北京时间
    const now = new Date();
    
    // 计算时间差（毫秒）
    const diffMs = mutedTime.getTime() - now.getTime();
    const diffMinutes = Math.ceil(diffMs / (1000 * 60));
    
    if (diffMinutes > 0) {
      result.muted = true;
      result.remainingMinutes = diffMinutes;
    } else {
      result.muted = false; // 已过期
    }
  } else {
    console.error('❌ 无法解析禁言时间值:', isMutedValue, valueStr);
  }
  
  return result;
}

async function isGroupAdmin(groupId, userId) {
  try {
    const [groups] = await pool.execute(
      'SELECT creator_id FROM scr_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );
    if (groups.length === 0) return false;

    const isOwner = parseInt(groups[0].creator_id) === parseInt(userId);
    if (isOwner) return true;

    const [members] = await pool.execute(
      'SELECT is_admin FROM scr_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
      [groupId, userId]
    );

    return members.length > 0 && members[0].is_admin === 1;
  } catch (err) {
    console.error('检查群管理员身份失败:', err.message);
    return false;
  }
}

async function getGlobalMessages(limit = 50, olderThan = null) {
  try {
    let query = `
      SELECT m.id, m.user_id as userId, u.nickname, u.avatar_url as avatarUrl,
             m.content, m.at_userid, m.message_type as messageType, m.group_id as groupId, m.timestamp
      FROM scr_messages m
      JOIN scr_users u ON m.user_id = u.id
      WHERE m.group_id IS NULL
    `;

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
          query += ` AND m.id < ? `;
          params.push(safeOlderThan);
        }
      } catch (e) {
      }
    }

    query += ` ORDER BY m.timestamp DESC, m.id DESC LIMIT ?`;
    params.push(safeLimit);

    const [messages] = await pool.query(query, params);

    const processedMessages = messages.map(msg => {
      let atUserIds = null;
      if (msg.at_userid) {
        try {
          atUserIds = JSON.parse(msg.at_userid);
        } catch (e) {
          atUserIds = msg.at_userid;
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
        timestamp: msg.timestamp
      };

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
  } catch (err) {
    console.error('获取全局消息失败:', err.message);
    return [];
  }
}

async function getGroupMessages(groupId, limit = 50, olderThan = null) {
  try {
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

    let query = `
      SELECT m.id, m.user_id as userId, u.nickname, u.avatar_url as avatarUrl,
             m.content, m.at_userid, m.message_type as messageType, m.group_id as groupId, m.timestamp
      FROM scr_messages m
      JOIN scr_users u ON m.user_id = u.id
      WHERE m.group_id = ?
    `;
    const params = [safeGroupId];

    const isOlderThanValid = olderThan !== null && olderThan !== undefined && olderThan !== '' && olderThan !== 0 && String(olderThan).trim() !== '';
    if (isOlderThanValid) {
      let safeOlderThan = 0;
      try {
        safeOlderThan = parseInt(olderThan);
        if (!isNaN(safeOlderThan)) {
          query += ` AND m.id < ?`;
          params.push(safeOlderThan);
        }
      } catch (e) {
      }
    }

    query += ` ORDER BY m.timestamp DESC, m.id DESC LIMIT ?`;
    params.push(safeLimit);

    const [messages] = await pool.query(query, params);

    const processedMessages = messages.map(msg => {
      let atUserIds = null;
      if (msg.at_userid) {
        try {
          atUserIds = JSON.parse(msg.at_userid);
        } catch (e) {
          atUserIds = msg.at_userid;
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
        timestamp: msg.timestamp
      };

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
  } catch (err) {
    console.error('获取群组消息失败:', err.message);
    return [];
  }
}

export async function sendMessage(req, res) {
  try {
    const { content, groupId, at_userid } = req.body;
    const userId = req.userId;

    // 速率限制检查
    const rateLimitResult = await checkRateLimit(userId);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({ 
        status: 'error', 
        message: `发送消息过于频繁，请${rateLimitResult.retryAfter}秒后再试`,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: rateLimitResult.retryAfter
      });
    }

    // 验证消息内容
    if (!validateMessageContent(content)) {
      console.error('❌ 消息内容格式错误或超过 10000 字符限制');
      return res.status(400).json({ status: 'error', message: '消息内容格式错误或超过 10000 字符限制' });
    }

    // 获取用户信息
    const [users] = await pool.execute(
        'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
        [userId]
    );

    if (users.length === 0) {
      console.error('❌ 用户不存在:', userId);
      return res.status(404).json({ status: 'error', message: '用户不存在' });
    }

    const user = users[0];

    // 插入消息到数据库
    const [result] = await pool.execute(
        'INSERT INTO scr_messages (user_id, content, at_userid, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
        [userId, content, at_userid ? JSON.stringify(at_userid) : null, groupId || null]
    );

    // 创建消息对象
    const rawMessage = {
      id: result.insertId,
      userId,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      content: content,
      atUserid: at_userid,
      messageType: 0,
      groupId: groupId || null,
      timestamp: new Date()
    };

    // 根据消息类型过滤字段
    const messageTypeStr = groupId ? 'group' : 'public';
    const newMessage = filterMessageFields(rawMessage, messageTypeStr);

    // 广播消息
    if (groupId) {
      io.to(`group_${groupId}`).emit('message-received', newMessage);
      
    } else {
      // 只发送给已认证的用户（发送过 user-joined 事件的用户）
      const allOnlineUsers = await getAllOnlineUsersFn();
      for (const onlineUser of allOnlineUsers) {
        if (await isAuthenticatedUserFn(onlineUser.id)) {
          const socket = io.sockets.sockets.get(onlineUser.socketId);
          if (socket) {
            socket.emit('message-received', newMessage);
          }
        }
      }
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
}

export async function getOfflineMessages(req, res) {
  try {
    const userId = req.userId;
    const publicAndGroupMinId = req.query.publicAndGroupMinId ? parseInt(req.query.publicAndGroupMinId) : 0;
    const privateMinId = req.query.privateMinId ? parseInt(req.query.privateMinId) : 0;
    
    // 计算3个月前的时间
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    // 1. 获取公共聊天消息（group_id 为 NULL）
    const [publicMessages] = await pool.execute(`
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
      LIMIT ${messageConfig.offlineLimits.public}
    `, [threeMonthsAgo, publicAndGroupMinId]);
    
    // 2. 获取用户所在群组的消息（包括已解散的群组）
    const [allMemberRecords] = await pool.execute(`
      SELECT group_id, joined_at, deleted_at FROM scr_group_members WHERE user_id = ?
    `, [userId]);
    
    // 按群组ID分组
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
      // 为每个群组分别查询消息，根据所有加入记录返回对应消息
      for (const [groupId, records] of groupRecordsMap) {
        // 构建时间范围条件：所有 joined_at <= timestamp <= deleted_at（或未设置）
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
        
        const [groupMsgs] = await pool.execute(`
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
            g.deleted_at as groupDeletedAt
          FROM scr_messages m 
          JOIN scr_users u ON m.user_id = u.id 
          JOIN scr_groups g ON m.group_id = g.id
          WHERE m.group_id = ?
            AND m.timestamp >= ?
            AND m.id > ?
            AND (${timeCondition})
          ORDER BY m.timestamp DESC, m.id DESC
          LIMIT ${messageConfig.offlineLimits.group}
        `, params);
        
        groupMessages = groupMessages.concat(groupMsgs);
      }
      
      // 合并后按时间戳排序
      groupMessages.sort((a, b) => {
        if (b.timestamp !== a.timestamp) {
          return new Date(b.timestamp) - new Date(a.timestamp);
        }
        return b.id - a.id;
      });
      
      // 限制返回数量
      if (groupMessages.length > 8000) {
        groupMessages = groupMessages.slice(0, 8000);
      }
    }
    
    // 3. 获取私信消息
    const [privateMessages] = await pool.execute(`
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
      LIMIT ${messageConfig.offlineLimits.private}
    `, [userId, userId, userId, userId, threeMonthsAgo, privateMinId]);

    res.json({
      status: 'success',
      publicMessages: publicMessages.reverse(),
      groupMessages: groupMessages.reverse(),
      privateMessages: privateMessages.reverse(),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ 获取离线消息失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取离线消息失败' });
  }
}

export async function deleteDeletedSession(req, res) {
  try {
    const userId = req.headers['user-id'];
    const { type, id } = req.body;
    
    if (!userId) {
      return res.status(401).json({ status: 'error', message: '未授权' });
    }
    
    if (!type || !id) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }
    
    if (type !== 'group' && type !== 'private') {
      return res.status(400).json({ status: 'error', message: '类型必须是 group 或 private' });
    }
    
    if (type === 'group') {
      // 删除群组成员记录
      const [result] = await pool.execute(
        'DELETE FROM scr_group_members WHERE user_id = ? AND group_id = ? AND deleted_at IS NOT NULL',
        [userId, parseInt(id)]
      );
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ status: 'error', message: '未找到该群组的已删除会话记录' });
      }
    } else if (type === 'private') {
      // 私信删除服务器记录逻辑
      // 需要处理多种状态：5→0, 0→9, 6→删除, 10→11, 11→12

      // 第一步：检查是否有状态为5的记录（被对方拉黑），如果有则转为0
      const [updateResult5] = await pool.execute(
        'UPDATE scr_friends SET status = 0, created_at = NOW() WHERE user_id = ? AND friend_id = ? AND status = 5',
        [userId, parseInt(id)]
      );

      if (updateResult5.affectedRows > 0) {
        // 状态5成功转为0，完成
      } else {
        // 没有状态5的记录，继续检查其他状态

        // 第二步：检查是否有状态为10的记录（双向拉黑），如果有则转为11
        const [updateResult10] = await pool.execute(
          'UPDATE scr_friends SET status = 11, created_at = NOW() WHERE user_id = ? AND friend_id = ? AND status = 10',
          [userId, parseInt(id)]
        );

        if (updateResult10.affectedRows > 0) {
          // 状态10成功转为11（双向拉黑后删除），完成
        } else {
          // 没有状态10的记录，继续检查其他状态

          // 第三步：检查是否有状态0的记录（被拉黑后删除），如果有则转为9
          const [updateResult0] = await pool.execute(
            'UPDATE scr_friends SET status = 9, created_at = NOW() WHERE user_id = ? AND friend_id = ? AND status = 0',
            [userId, parseInt(id)]
          );

          if (updateResult0.affectedRows > 0) {
            // 状态0成功转为9（彻底清除），完成
          } else {
            // 没有状态0的记录，继续检查其他状态

            // 第四步：检查是否有状态11的记录（双向拉黑后删除），如果有则转为12
            const [updateResult11] = await pool.execute(
              'UPDATE scr_friends SET status = 12, created_at = NOW() WHERE user_id = ? AND friend_id = ? AND status = 11',
              [userId, parseInt(id)]
            );

            if (updateResult11.affectedRows > 0) {
              // 状态11成功转为12（双向彻底清除），完成
            } else {
              // 没有状态11的记录，继续检查其他状态

              // 第五步：检查是否有状态6的记录（被删除），直接物理删除
              const [deleteResult6] = await pool.execute(
                'DELETE FROM scr_friends WHERE user_id = ? AND friend_id = ? AND status = 6',
                [userId, parseInt(id)]
              );

              if (deleteResult6.affectedRows > 0) {
                // 状态6的记录已物理删除，完成
              } else {
                // 第六步：如果也没有状态6的记录，说明确实没有可删除的已删除会话记录
                return res.status(404).json({ status: 'error', message: '未找到该好友的已删除会话记录' });
              }
            }
          }
        }
      }
    }

    res.json({ status: 'success', message: '已删除会话记录已成功清除' });
  } catch (error) {
    console.error('❌ 删除单个已删除会话失败:', error);
    res.status(500).json({ status: 'error', message: '服务器错误，请重试' });
  }
}

// Socket.IO 事件处理函数
export function handleSendMessage(socket) {
  socket.on('send-message', async (messageData) => {
      try {
        const { userId, content, groupId, sessionToken, at_userid } = messageData;
    
        // 速率限制检查
        const rateLimitResult = await checkRateLimit(userId);
        if (!rateLimitResult.allowed) {
          // 通过 message-sent 事件返回速率限制错误
          socket.emit('message-sent', { 
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: `发送消息过于频繁，请${rateLimitResult.retryAfter}秒后再试`,
              retryAfter: rateLimitResult.retryAfter
            }
          });
          return;
        }
    
        // 验证消息内容...
        if (!validateMessageContent(content)) {
          console.error('❌ 消息内容格式错误或超过 10000 字符限制');
          socket.emit('error', { message: '消息内容格式错误或超过 10000 字符限制' });
          return;
        }
    
        // 如果是群组消息，验证用户是否在群组中
        if (groupId) {
          // 先检查群组是否存在，并获取群主信息和删除状态
          const [groupCheck] = await pool.execute(
            'SELECT id, creator_id, deleted_at FROM scr_groups WHERE id = ?',
            [groupId]
          );
          
          if (groupCheck.length === 0) {
            socket.emit('message-sent', { 
              success: false,
              error: {
                code: 'GROUP_NOT_FOUND',
                message: '群组不存在'
              }
            });
            return;
          }
          
          const groupExistCheck = groupCheck[0];
          
          // 检查群组是否已被删除
          if (groupExistCheck.deleted_at !== null) {
            socket.emit('message-sent', { 
              success: false,
              error: {
                code: 'GROUP_DELETED',
                message: '该群组已被解散，无法发送消息'
              }
            });
            return;
          }
          
          const [memberCheck] = await pool.execute(
            'SELECT id FROM scr_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
            [groupId, userId]
          );
          
          if (memberCheck.length === 0) {
            socket.emit('message-sent', { 
              success: false,
              error: {
                code: 'NOT_IN_GROUP',
                message: '您不在该群组中，无法发送消息'
              }
            });
            return;
          }
          
          // 获取群组信息和成员信息用于禁言检查
          const [groupInfoResult] = await pool.execute(
            'SELECT creator_id, is_mute_all FROM scr_groups WHERE id = ? AND deleted_at IS NULL',
            [groupId]
          );
          
          if (!groupInfoResult || groupInfoResult.length === 0) {
            socket.emit('message-sent', { 
              success: false,
              error: {
                code: 'GROUP_NOT_FOUND',
                message: '无法获取群组信息'
              }
            });
            return;
          }
          
          const muteCheckGroupInfo = groupInfoResult[0];
          const isGroupOwner = muteCheckGroupInfo.creator_id === userId;
          
          if (!isGroupOwner) {
            // 非群主用户需要进行禁言检查
            const [memberInfo] = await pool.execute(
              'SELECT is_admin, is_muted FROM scr_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
              [groupId, userId]
            );
            
            if (memberInfo.length > 0) {
              const member = memberInfo[0];
              
              // 检查全员禁言：如果开启了全员禁言，只有管理员可以发言
              if (muteCheckGroupInfo.is_mute_all === 1 && member.is_admin !== 1) {
                socket.emit('message-sent', { 
                  success: false,
                  error: {
                    code: 'GROUP_MUTE_ALL',
                    message: '当前已开启全员禁言，只有管理员可以发言'
                  }
                });
                return;
              }
              
              // 检查个人禁言状态（优化后的单字段设计）
              // 兼容旧格式(TINYINT: 0/1) 和新格式(DATETIME: NULL/时间戳)
              const isUserMuted = checkIfUserMuted(member.is_muted);
              
              if (isUserMuted.muted) {
              
              if (isUserMuted.permanent) {
                  // 永久禁言
                  socket.emit('message-sent', { 
                    success: false,
                    error: {
                      code: 'USER_MUTED',
                      message: '您已被永久禁言，无法发送消息'
                    }
                  });
                  return;
                } else if (isUserMuted.remainingMinutes > 0) {
                  // 临时禁言尚未到期
                  socket.emit('message-sent', { 
                    success: false,
                    error: {
                      code: 'USER_MUTED',
                      message: `您已被禁言，剩余时间约${isUserMuted.remainingMinutes}分钟`
                    }
                  });
                  return;
                } else {
                  // 禁言已过期，自动解除禁言（设置为NULL）
                  await pool.execute(
                    'UPDATE scr_group_members SET is_muted = NULL WHERE group_id = ? AND user_id = ?',
                    [groupId, userId]
                  );
                }
              } else {
                // 用户未被禁言，允许发送
              }
            } else {
              console.warn('未找到成员记录');
            }
          } else {
            // 群主无需禁言检查
          }
          
          // 检查是否包含 @全体成员 (-1)，只有群主或管理员才能发送
          if (at_userid && Array.isArray(at_userid)) {
            const hasAllMemberAt = at_userid.some(id => id === -1);
            if (hasAllMemberAt) {
              const isAdmin = await isGroupAdmin(groupId, userId);
              if (!isAdmin) {
                socket.emit('message-sent', { 
                  success: false,
                  error: {
                    code: 'NOT_GROUP_ADMIN',
                    message: '只有群主或管理员才能@全体成员'
                  }
                });
                return;
              }
            }
          }
        }
    
        // 获取用户信息...
        const [users] = await pool.execute(
            'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
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
        const timestamp = now.toISOString();
        const timestampMs = now.getTime();

        // 插入消息到数据库（使用MySQL的NOW()函数而不是JavaScript生成的ISO格式时间）
        // 使用前端发送的消息类型，默认为文字消息类型
        const messageType = messageData.message_type || messageData.messageType || 0;
        
        const messageContent = cleanContent;
        
        const [result] = await pool.execute(
            'INSERT INTO scr_messages (user_id, content, at_userid, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, ?, NOW())',
            [userId, messageContent, at_userid ? JSON.stringify(at_userid) : null, messageType, groupId || null]
        );
        
        // 广播消息 - 使用已经过HTML转义的内容
        const rawMessage = {
          id: result.insertId,
          userId,
          nickname: user.nickname,
          avatarUrl: user.avatar_url,
          content: messageContent,
          atUserid: at_userid,
          messageType: messageType,
          groupId: groupId || null,
          timestamp: timestampMs,
          timestampISO: timestamp
        };
        
        // 处理图片消息：从content字段解析图片URL
        if (messageType === 1 && cleanContent) {
          try {
            const contentData = JSON.parse(cleanContent);
            if (contentData.url) {
              rawMessage.imageUrl = contentData.url;
            }
          } catch (error) {
            console.error(`❌ 解析图片消息失败: 消息ID=${result.insertId}, 错误=${error.message}`);
          }
        }
        
        // 根据消息类型过滤字段
        const messageTypeStr = groupId ? 'group' : 'public';
        const newMessage = filterMessageFields(rawMessage, messageTypeStr);
        
        if (groupId) {
          // 确保groupId是字符串类型，避免Map键类型不一致
          const groupIdStr = String(groupId);
          
          // 群组消息：使用 socket.to() 广播给群组房间，避开发送者
          try {
            socket.to(`group_${groupId}`).emit('message-received', newMessage);
          } catch (directSendErr) {
            console.error('发送群组消息失败:', directSendErr.message);
          }
          
        } else {
          // 全局消息：发送给所有用户（避开发送者）
          // 遍历所有在线用户，跳过发送者
          const allOnlineUsers = await getAllOnlineUsersFn();
          for (const onlineUser of allOnlineUsers) {
            // 跳过消息发送者
            if (String(onlineUser.id) === String(userId)) {
              continue;
            }
            const socketInstance = io.sockets.sockets.get(onlineUser.socketId);
            if (socketInstance) {
              socketInstance.emit('message-received', newMessage);
            }
          }

        }
    
        // 确认消息已发送，只给发送者发送确认事件
        socket.emit('message-sent', { messageId: result.insertId, message: newMessage });
    
      } catch (err) {
        console.error('❌ 保存消息失败:', err.message);
        socket.emit('error', { message: '发送消息失败' });
      }
  });
}

export function handleDeleteMessage(socket) {
  socket.on('delete-message', async (data) => {
    try {
      const { messageId, userId, sessionToken } = data;

      // 先获取消息信息，检查是否有图片和权限
      const [messages] = await pool.execute(
          'SELECT content, message_type, user_id, group_id FROM scr_messages WHERE id = ?',
          [messageId]
      );

      if (messages.length === 0) {
        socket.emit('error', { message: '消息不存在' });
        return;
      }

      const message = messages[0];

      // 检查权限：只能删除自己的消息
      if (message.user_id !== userId) {
        console.error('❌ 权限不足，只能删除自己的消息:', { messageUserId: message.user_id, requestUserId: userId });
        socket.emit('error', { message: '只能删除自己的消息' });
        return;
      }
      
      // 如果是群组消息，验证用户是否在群组中
      if (message.group_id) {
        const [memberCheck] = await pool.execute(
          'SELECT id FROM scr_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
          [message.group_id, userId]
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
        const fileUrl = contentData.url;
        const filePath = path.join(process.cwd(), 'public', fileUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      // 将messageId转换为数字类型，确保与缓存中的msg.id类型匹配
      const numericMessageId = parseInt(messageId);
      
      // 将类型101消息保存到数据库
      let insertResult;
      if (message.group_id) {
        // 群组消息：保存到 scr_messages 表
        [insertResult] = await pool.execute(
          'INSERT INTO scr_messages (user_id, group_id, content, message_type, timestamp) VALUES (?, ?, ?, ?, NOW())',
          [userId, message.group_id, String(numericMessageId), 101]
        );
      } else {
        // 公共消息：保存到 scr_messages 表
        [insertResult] = await pool.execute(
          'INSERT INTO scr_messages (user_id, content, message_type, timestamp) VALUES (?, ?, ?, NOW())',
          [userId, String(numericMessageId), 101]
        );
      }
      
      // 发送类型101消息，内容为被撤回消息的ID，并保存到数据库
      const rawType101Message = {
        id: insertResult.insertId,
        userId: userId,
        nickname: '',
        avatarUrl: '',
        content: String(numericMessageId),
        messageType: 101,
        groupId: message.group_id || null,
        timestamp: Date.now(),
        timestampISO: new Date().toISOString()
      };
      
      // 根据消息类型过滤字段
      const messageTypeStr = message.group_id ? 'group' : 'public';
      const type101Message = filterMessageFields(rawType101Message, messageTypeStr);
      
      // 删除原数据库记录
      await pool.execute('DELETE FROM scr_messages WHERE id = ?', [messageId]);
      
      // 发送确认事件给发送者
      socket.emit('message-sent', { messageId: type101Message.id, message: type101Message });
      
      // 广播类型101消息给其他用户
      if (message.group_id) {
        // 群组消息：向群组成员广播（排除发送者）
        const [groupMembers] = await pool.execute(
          'SELECT user_id FROM scr_group_members WHERE group_id = ? AND deleted_at IS NULL AND user_id != ?',
          [message.group_id, userId]
        );
        for (const member of groupMembers) {
          io.to(`user_${member.user_id}`).emit('message-received', type101Message);
        }
      } else {
        // 公共消息：全局广播（发送者通过确认事件接收）
        socket.broadcast.emit('message-received', type101Message);
      }
      
    } catch (err) {
      console.error('删除消息失败:', err.message);
      socket.emit('error', { message: '删除消息失败' });
    }
  });
}

export function handleMessageRead(socket) {
  socket.on('message-read', async (data) => {
    try {
      if (!data) {
        return;
      }
      
      const { type, userId, friendId, groupId } = data;
      
      // 验证必需参数
      if (!type || !userId) {
        return;
      }
      
      // 速率限制检查
      const rateLimitResult = await checkRateLimit(userId);
      if (!rateLimitResult.allowed) {
        socket.emit('error', { 
          message: `操作过于频繁，请${rateLimitResult.retryAfter}秒后再试`
        });
        return;
      }
      
      const numericUserId = parseInt(userId);
      if (isNaN(numericUserId)) {
        return;
      }
      
      if (type === 'private') {
        if (!friendId) {
          return;
        }
        
        const numericFriendId = parseInt(friendId);
        if (isNaN(numericFriendId)) {
          return;
        }
        
        // 处理私信已读
        // 更新数据库中对方发给自己的未读消息为已读
        await pool.execute(
          'UPDATE scr_private_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
          [numericFriendId, numericUserId]
        );
        
        // 发送已读事件给对方
        io.to(`user_${numericFriendId}`).emit('private-message-read', {
          fromUserId: numericUserId,
          friendId: numericFriendId
        });
        
        // 检查对方是否在线
        const allOnlineUsers = await getAllOnlineUsersFn();
        const friendIsOnline = allOnlineUsers.some(u => u.id === numericFriendId);
        
        if (!friendIsOnline) {
          // 对方不在线，保存已读回执消息（103）到数据库
          
          // 获取刚才已读的最后一条消息的id作为内容
          const [readMessages] = await pool.execute(
            'SELECT id FROM scr_private_messages WHERE sender_id = ? AND receiver_id = ? AND is_read = 1 ORDER BY id DESC LIMIT 1',
            [numericFriendId, numericUserId]
          );
          
          let lastReadMessageId = 0;
          if (readMessages.length > 0) {
            lastReadMessageId = readMessages[0].id;
          }
          
          // 保存已读回执消息（103）到数据库
          const [insertResult] = await pool.execute(
            'INSERT INTO scr_private_messages (sender_id, receiver_id, content, message_type, timestamp, is_read) VALUES (?, ?, ?, ?, NOW(), 1)',
            [numericUserId, numericFriendId, String(lastReadMessageId), 103]
          );
          
          // 发送类型103消息给对方（虽然不在线，但可能重连后会收到历史消息）
          const rawType103Message = {
            id: insertResult.insertId,
            userId: numericUserId,
            nickname: '',
            avatarUrl: '',
            senderId: numericUserId,
            receiverId: numericFriendId,
            content: String(lastReadMessageId),
            messageType: 103,
            isRead: 1,
            timestamp: Date.now(),
            timestampISO: new Date().toISOString()
          };
          
          // 过滤私信消息字段
          const type103Message = filterMessageFields(rawType103Message, 'private');
          
          // 向对方的用户房间发送（虽然不在线，但可能重连后收到）
          io.to(`user_${numericFriendId}`).emit('private-message-received', type103Message);
        }
      } else if (type === 'group') {
        if (!groupId) {
          return;
        }
        
        const numericGroupId = parseInt(groupId);
        if (isNaN(numericGroupId)) {
          return;
        }
        
        // 处理群组消息已读
        // 更新数据库中该用户在该群组的未读消息为已读
        await pool.execute(
          'UPDATE scr_messages SET is_read = 1 WHERE group_id = ? AND user_id != ? AND is_read = 0',
          [numericGroupId, numericUserId]
        );
        
        // 可以选择向群组广播已读事件（可选）
        // io.to(`group_${numericGroupId}`).emit('group-message-read', {
        //   userId: numericUserId,
        //   groupId: numericGroupId
        // });
      }
      
    } catch (err) {
      console.error('处理消息已读失败:', err.message);
      socket.emit('error', { message: '处理消息已读失败' });
    }
  });
}

export function handleLoadMessages(socket) {
  socket.on('load-messages', async (data) => {
    try {
      const { type, userId, sessionToken, limit = 20, olderThan, groupId, friendId, loadMore = false } = data;
      
      let messages = [];
      const numericUserId = parseInt(userId);
      let responseData = { type, messages: [], loadMore: loadMore };
      
      if (type === 'global') {
        // 加载全局聊天室消息
        if (olderThan) {
          messages = await getGlobalMessages(limit, olderThan);
        } else {
          messages = await getGlobalMessages(limit);
        }
        
        // 收集群组最后消息时间（从消息表中动态获取）
        const groupLastMessageTimes = {};
        const [groupMessages] = await pool.execute(
          'SELECT group_id, MAX(timestamp) as last_time FROM scr_messages WHERE group_id IS NOT NULL GROUP BY group_id'
        );
        groupMessages.forEach(msg => {
          if (msg.last_time) {
            groupLastMessageTimes[msg.group_id] = msg.last_time;
          }
        });
        
        // 收集私信最后消息时间
        const privateLastMessageTimes = {};
        const [privateMsgs] = await pool.execute(
          'SELECT sender_id, receiver_id, MAX(timestamp) as last_time FROM scr_private_messages WHERE sender_id = ? OR receiver_id = ? GROUP BY sender_id, receiver_id',
          [numericUserId, numericUserId]
        );
        privateMsgs.forEach(msg => {
          const otherUserId = String(msg.sender_id) === String(numericUserId) ? msg.receiver_id : msg.sender_id;
          if (!privateLastMessageTimes[otherUserId] || new Date(msg.last_time) > new Date(privateLastMessageTimes[otherUserId])) {
            privateLastMessageTimes[otherUserId] = msg.last_time;
          }
        });
        
        responseData.messages = messages.reverse();
        responseData.groupLastMessageTimes = groupLastMessageTimes;
        responseData.privateLastMessageTimes = privateLastMessageTimes;
        socket.emit('messages-loaded', responseData);
      } else if (type === 'group') {
        // 加载群组消息
        const numericGroupId = parseInt(groupId);
        
        // 验证用户是否在群组中
        const [memberCheck] = await pool.query(
          'SELECT id FROM scr_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
          [numericGroupId, numericUserId]
        );
        
        if (memberCheck.length === 0) {
          socket.emit('error', { message: '您不在该群组中，无法查看聊天记录' });
          return;
        }
        
        // 获取群组消息
        if (loadMore && olderThan) {
          messages = await getGroupMessages(numericGroupId, limit, olderThan);
        } else {
          messages = await getGroupMessages(numericGroupId, limit);
        }
        
        responseData.messages = messages.reverse();
        responseData.groupId = numericGroupId;
        socket.emit('messages-loaded', responseData);
      } else if (type === 'private') {
        // 加载私信消息
        const numericFriendId = parseInt(friendId);
        
        // 验证对方是否是自己的好友
        const [friendCheck] = await pool.query(
          'SELECT id FROM scr_friends WHERE user_id = ? AND friend_id = ? AND status = 1',
          [numericUserId, numericFriendId]
        );
        
        if (friendCheck.length === 0) {
          socket.emit('error', { message: '对方不是您的好友，无法查看聊天记录' });
          return;
        }
        
        let query = `
          SELECT p.id, p.sender_id as senderId, p.receiver_id as receiverId, 
                 p.content, p.at_userid, p.message_type as messageType, p.is_read as isRead, p.timestamp,
                 u1.nickname as senderNickname, u1.avatar_url as senderAvatarUrl,
                 u2.nickname as receiverNickname, u2.avatar_url as receiverAvatarUrl
          FROM scr_private_messages p
          JOIN scr_users u1 ON p.sender_id = u1.id
          JOIN scr_users u2 ON p.receiver_id = u2.id
          WHERE ((p.sender_id = ? AND p.receiver_id = ?) OR (p.sender_id = ? AND p.receiver_id = ?))
        `;
        
        const params = [numericUserId, numericFriendId, numericFriendId, numericUserId];
        
        if (loadMore && olderThan) {
          query += ' AND p.id < ?';
          params.push(parseInt(olderThan));
        }
        
        query += ' ORDER BY p.timestamp DESC, p.id DESC LIMIT ?';
        params.push(parseInt(limit) + 1);
        
        const [privateMessages] = await pool.execute(query, params);
        
        // 检查是否有更多消息
        const hasMore = privateMessages.length > parseInt(limit);
        if (hasMore) {
          privateMessages.pop(); // 移除多余的一条
        }
        
        // 反转顺序，使最新的消息在最后
        messages = privateMessages.reverse();
        
        responseData.messages = messages;
        responseData.friendId = numericFriendId;
        responseData.hasMore = hasMore;
        socket.emit('messages-loaded', responseData);
      } else {
        socket.emit('error', { message: '不支持的消息类型' });
      }
      
    } catch (err) {
      console.error('加载消息失败:', err.message);
      socket.emit('error', { message: '加载消息失败' });
    }
  });
}

export function handleSendPrivateMessage(socket) {
  socket.on('send-private-message', async (messageData) => {
    try {
      const { userId, content, receiverId, sessionToken, at_userid } = messageData;

      // 速率限制检查
      const rateLimitResult = await checkRateLimit(userId);
      if (!rateLimitResult.allowed) {
        // 通过 private-message-sent 事件返回速率限制错误
        socket.emit('private-message-sent', { 
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `发送消息过于频繁，请${rateLimitResult.retryAfter}秒后再试`,
            retryAfter: rateLimitResult.retryAfter
          }
        });
        return;
      }

      // 验证消息内容
      if (!validateMessageContent(content)) {
        console.error('❌ 消息内容格式错误或超过 10000 字符限制');
        socket.emit('error', { message: '消息内容格式错误或超过 10000 字符限制' });
        return;
      }

      // 获取用户信息
      const [users] = await pool.execute(
          'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
          [userId]
      );

      if (users.length === 0) {
        console.error('❌ 用户不存在:', userId);
        socket.emit('error', { message: '用户不存在' });
        return;
      }

      const user = users[0];

      // 验证对方是否是自己的好友，并检查是否已删除
      const [friendCheck] = await pool.query(
        'SELECT id, status FROM scr_friends WHERE user_id = ? AND friend_id = ?',
        [parseInt(userId), parseInt(receiverId)]
      );

      if (friendCheck.length === 0) {
        socket.emit('private-message-sent', {
          success: false,
          error: {
            code: 'NOT_FRIEND',
            message: '对方不是您的好友，无法发送消息'
          }
        });
        return;
      }

      // 检查好友关系状态（允许进入检查流程的状态：好友列表显示或可拉取历史消息的状态）
      const allowedStatuses = [0, 1, 4, 5, 6, 10, 11];
      if (!allowedStatuses.includes(friendCheck[0].status)) {
        socket.emit('private-message-sent', {
          success: false,
          error: {
            code: 'INVALID_FRIEND_STATUS',
            message: '好友关系状态异常，无法发送消息'
          }
        });
        return;
      }

      // 检查是否被拉黑、被删除、双向拉黑等禁止发送消息的状态
      const blockedStatuses = [0, 5, 10, 11];
      if (blockedStatuses.includes(friendCheck[0].status)) {
        let blockMessage = '';
        switch (friendCheck[0].status) {
          case 5:
            blockMessage = '你已被对方拉黑，无法发送消息';
            break;
          case 0:
            blockMessage = '该好友关系已被删除，无法发送消息';
            break;
          case 10:
            blockMessage = '你们已互相拉黑，无法发送消息';
            break;
          case 11:
            blockMessage = '你们曾互相拉黑并删除，无法发送消息';
            break;
          default:
            blockMessage = '无法发送消息';
        }
        socket.emit('private-message-sent', {
          success: false,
          error: {
            code: 'FRIEND_BLOCKED_OR_DELETED',
            message: blockMessage
          }
        });
        return;
      }

      // 不进行严格转义，保持原始内容格式，让前端处理安全的解析和链接显示
      const cleanContent = content;

      // 获取当前精确时间戳（毫秒级和ISO格式）
      const now = new Date();
      const timestamp = now.toISOString();
      const timestampMs = now.getTime();

      // 插入私信到数据库
      const messageType = messageData.message_type || messageData.messageType || 0;
      
      const messageContent = cleanContent;
      
      const [result] = await pool.execute(
          'INSERT INTO scr_private_messages (sender_id, receiver_id, content, at_userid, message_type, is_read, timestamp) VALUES (?, ?, ?, ?, ?, 0, NOW())',
          [userId, receiverId, messageContent, at_userid ? JSON.stringify(at_userid) : null, messageType]
      );

      // 构建私信消息对象
      const rawMessage = {
        id: result.insertId,
        userId: userId,
        nickname: user.nickname,
        avatarUrl: user.avatar_url,
        senderId: userId,
        receiverId: parseInt(receiverId),
        content: messageContent,
        messageType: messageType,
        isRead: 0,
        timestamp: timestampMs,
        timestampISO: timestamp
      };

      // 处理图片消息：从content字段解析图片URL
      if (messageType === 1 && cleanContent) {
        try {
          const contentData = JSON.parse(cleanContent);
          if (contentData.url) {
            rawMessage.imageUrl = contentData.url;
          }
        } catch (error) {
          console.error(`❌ 解析图片消息失败: 消息ID=${result.insertId}, 错误=${error.message}`);
        }
      }
      
      // 过滤私信消息字段
      const newMessage = filterMessageFields(rawMessage, 'private');

      // 发送私信给接收者
      io.to(`user_${parseInt(receiverId)}`).emit('private-message-received', newMessage);

      // 确认私信已发送，只给发送者发送确认事件
      socket.emit('private-message-sent', { messageId: result.insertId, message: newMessage });

    } catch (err) {
      console.error('❌ 保存私信失败:', err.message);
      socket.emit('error', { message: '发送私信失败' });
    }
  });
}

export function handleDeletePrivateMessage(socket) {
  socket.on('delete-private-message', async (data) => {
    try {
      const { userId, messageId, sessionToken } = data;
      
      // 速率限制检查
      const rateLimitResult = await checkRateLimit(userId);
      if (!rateLimitResult.allowed) {
        socket.emit('error', { 
          message: `操作过于频繁，请${rateLimitResult.retryAfter}秒后再试`
        });
        return;
      }
      
      // 获取消息详情
      const [messages] = await pool.execute(
        'SELECT id, sender_id, receiver_id, content, message_type FROM scr_private_messages WHERE id = ?',
        [messageId]
      );
      
      if (messages.length === 0) {
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
        const fileUrl = contentData.url;
        const filePath = path.join(process.cwd(), 'public', fileUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      
      // 将messageId转换为数字类型
      const numericMessageId = parseInt(messageId);
      
      // 检查对方是否在线
      const allOnlineUsers = await getAllOnlineUsersFn();
      const receiverIsOnline = allOnlineUsers.some(u => u.id === message.receiver_id);
      
      let rawType101Message;
      
      if (receiverIsOnline) {
        // 对方在线，不保存到数据库，只发送101消息
        rawType101Message = {
          id: Date.now(),
          userId: numericUserId,
          nickname: '',
          avatarUrl: '',
          senderId: numericUserId,
          receiverId: message.receiver_id,
          content: String(numericMessageId),
          messageType: 101,
          timestamp: Date.now(),
          timestampISO: new Date().toISOString()
        };
      } else {
        // 对方不在线，保存到数据库
        const [insertResult] = await pool.execute(
          'INSERT INTO scr_private_messages (sender_id, receiver_id, content, message_type, is_read, timestamp) VALUES (?, ?, ?, ?, 1, NOW())',
          [numericUserId, message.receiver_id, String(numericMessageId), 101]
        );
        
        rawType101Message = {
          id: insertResult.insertId,
          userId: numericUserId,
          nickname: '',
          avatarUrl: '',
          senderId: numericUserId,
          receiverId: message.receiver_id,
          content: String(numericMessageId),
          messageType: 101,
          isRead: 1,
          timestamp: Date.now(),
          timestampISO: new Date().toISOString()
        };
      }
      
      // 过滤私信消息字段
      const type101Message = filterMessageFields(rawType101Message, 'private');
      
      // 删除原数据库记录
      await pool.execute('DELETE FROM scr_private_messages WHERE id = ?', [messageId]);
      
      // 发送确认事件给发送者
      socket.emit('private-message-sent', { 
        messageId: type101Message.id, 
        message: type101Message,
        deleted: true 
      });
      
      // 向接收者发送撤回通知
      io.to(`user_${message.receiver_id}`).emit('private-message-deleted', {
        messageId: numericMessageId,
        senderId: numericUserId,
        deleteMessage: type101Message
      });
      
    } catch (err) {
      console.error('撤回私信失败:', err.message);
      socket.emit('error', { message: '撤回私信失败' });
    }
  });
}
