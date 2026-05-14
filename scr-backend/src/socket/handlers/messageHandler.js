import { SocketEvents } from '../events.js';
import path from 'path';
import fs from 'fs';

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

export function registerMessageHandlers(socket, io, { pool, checkRateLimit, validateMessageContent, filterMessageFields, getAllOnlineUsers, getGlobalMessages, getGroupMessages, isGroupAdmin }) {
  
  // 发送消息
  socket.on(SocketEvents.SEND_MESSAGE, async (messageData) => {
    try {
      const { userId, content, groupId, sessionToken, at_userid } = messageData;
  
      // 速率限制检查
      const rateLimitResult = await checkRateLimit(userId);
      if (!rateLimitResult.allowed) {
        // 通过 message-sent 事件返回速率限制错误
        socket.emit(SocketEvents.MESSAGE_SENT, { 
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
        socket.emit(SocketEvents.ERROR, { message: '消息内容格式错误或超过 10000 字符限制' });
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
          socket.emit(SocketEvents.MESSAGE_SENT, { 
            success: false,
            error: {
              code: 'GROUP_NOT_FOUND',
              message: '群组不存在'
            }
          });
          return;
        }
        
        const groupInfo = groupCheck[0];
        
        // 检查群组是否已被删除
        if (groupInfo.deleted_at !== null) {
          socket.emit(SocketEvents.MESSAGE_SENT, { 
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
          socket.emit(SocketEvents.MESSAGE_SENT, { 
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
          socket.emit(SocketEvents.MESSAGE_SENT, { 
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
              socket.emit(SocketEvents.MESSAGE_SENT, { 
                success: false,
                error: {
                  code: 'GROUP_MUTE_ALL',
                  message: '当前已开启全员禁言，只有管理员可以发言'
                }
              });
              return;
            }
            
            // 检查个人禁言状态（优化后的单字段设计）
            const isUserMuted = checkIfUserMuted(member.is_muted);
            
            if (isUserMuted.muted) {
              
              if (isUserMuted.permanent) {
                // 永久禁言
                socket.emit(SocketEvents.MESSAGE_SENT, { 
                  success: false,
                  error: {
                    code: 'USER_MUTED',
                    message: '您已被永久禁言，无法发送消息'
                  }
                });
                return;
              } else if (isUserMuted.remainingMinutes > 0) {
                // 临时禁言尚未到期
                socket.emit(SocketEvents.MESSAGE_SENT, { 
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
              socket.emit(SocketEvents.MESSAGE_SENT, { 
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
        socket.emit(SocketEvents.ERROR, { message: '用户不存在' });
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
          socket.to(`group_${groupId}`).emit(SocketEvents.MESSAGE_RECEIVED, newMessage);
        } catch (directSendErr) {
          console.error('发送群组消息失败:', directSendErr.message);
        }
        
        
      } else {
        // 全局消息：发送给所有认证用户（避开发送者）
        socket.to('authenticated_users').emit(SocketEvents.MESSAGE_RECEIVED, newMessage);
      }
  
      // 确认消息已发送，只给发送者发送确认事件
      socket.emit(SocketEvents.MESSAGE_SENT, { messageId: result.insertId, message: newMessage });
  
    } catch (err) {
      console.error('❌ 保存消息失败:', err.message);
      socket.emit(SocketEvents.ERROR, { message: '发送消息失败' });
    }
  });

  // 删除消息
  socket.on(SocketEvents.DELETE_MESSAGE, async (data) => {
    try {
      const { messageId, userId, sessionToken } = data;

      // 先获取消息信息，检查是否有图片和权限
      const [messages] = await pool.execute(
          'SELECT content, message_type, user_id, group_id FROM scr_messages WHERE id = ?',
          [messageId]
      );

      if (messages.length === 0) {
        socket.emit(SocketEvents.ERROR, { message: '消息不存在' });
        return;
      }

      const message = messages[0];

      // 检查权限：只能删除自己的消息
      if (message.user_id !== userId) {
        console.error('❌ 权限不足，只能删除自己的消息:', { messageUserId: message.user_id, requestUserId: userId });
        socket.emit(SocketEvents.ERROR, { message: '只能删除自己的消息' });
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
          socket.emit(SocketEvents.ERROR, { message: '您不在该群组中，无法删除消息' });
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
        // 有文件需要删除
        const fileUrl = contentData.url;
        const filePath = path.join(process.cwd(), 'public', fileUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      // 将messageId转换为数字类型，确保与缓存中的msg.id类型匹配
      const numericMessageId = Number(messageId);
      
      // 查询操作者（发送撤回请求的用户）的昵称和头像
      const [operatorInfo] = await pool.execute(
        'SELECT nickname, avatar_url FROM scr_users WHERE id = ?',
        [userId]
      );
      const operatorNickname = operatorInfo[0]?.nickname || '未知用户';
      const operatorAvatarUrl = operatorInfo[0]?.avatar_url || '';
      
      // 构建撤回提示内容（使用操作者昵称，纯文本格式）
      const recallContent = `${operatorNickname}撤回了一条消息`;
      
      // 更新原数据库记录（只修改内容为纯文本，不修改messageType）
      await pool.execute(
        'UPDATE scr_messages SET content = ? WHERE id = ?',
        [recallContent, messageId]
      );
      
      // 单独生成一条简单的101消息（只包含被撤回消息ID）
      let insertResult;
      if (message.group_id) {
        [insertResult] = await pool.execute(
          'INSERT INTO scr_messages (user_id, group_id, content, message_type, timestamp) VALUES (?, ?, ?, ?, NOW())',
          [userId, message.group_id, String(numericMessageId), 101]
        );
      } else {
        [insertResult] = await pool.execute(
          'INSERT INTO scr_messages (user_id, content, message_type, timestamp) VALUES (?, ?, ?, NOW())',
          [userId, String(numericMessageId), 101]
        );
      }
      
      // 发送简单格式的101消息（content只是被撤回消息ID）
      const rawType101Message = {
        id: insertResult.insertId,  // 101消息自己的ID
        userId: userId,
        nickname: operatorNickname,
        avatarUrl: operatorAvatarUrl,
        content: String(numericMessageId),  // 只包含被撤回消息ID
        messageType: 101,
        groupId: message.group_id || null,
        timestamp: Date.now(),
        timestampISO: new Date().toISOString()
      };
      
      // 根据消息类型过滤字段
      const messageTypeStr = message.group_id ? 'group' : 'public';
      const type101Message = filterMessageFields(rawType101Message, messageTypeStr);
      
      // 发送确认事件给发送者
      socket.emit(SocketEvents.MESSAGE_SENT, { messageId: type101Message.id, message: type101Message });
      
      // 广播类型101消息给其他用户
      if (message.group_id) {
        // 群组消息：向群组房间广播（排除发送者）
        socket.to(`group_${message.group_id}`).emit(SocketEvents.MESSAGE_RECEIVED, type101Message);
      } else {
        // 公共消息：全局广播（发送者通过确认事件接收）
        socket.to('authenticated_users').emit(SocketEvents.MESSAGE_RECEIVED, type101Message);
      }
      
    } catch (err) {
      console.error('删除消息失败:', err.message);
      socket.emit(SocketEvents.ERROR, { message: '删除消息失败' });
    }
  });

  // 消息已读事件（支持私信和群组）
  socket.on(SocketEvents.MESSAGE_READ, async (data) => {
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
        socket.emit(SocketEvents.ERROR, { 
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
        io.to(`user_${numericFriendId}`).emit(SocketEvents.PRIVATE_MESSAGE_READ, {
          fromUserId: numericUserId,
          friendId: numericFriendId
        });
        
        // 检查对方是否在线
        const allOnlineUsers = await getAllOnlineUsers();
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
          
          io.to(`user_${numericFriendId}`).emit(SocketEvents.PRIVATE_MESSAGE_RECEIVED, type103Message);
        }
        
      } else if (type === 'group') {
        if (!groupId) {
          return;
        }
        
        // 处理群组已读（预留，后续实现）
        const numericGroupId = parseInt(groupId);
        if (isNaN(numericGroupId)) {
          return;
        }
      } else {
        return;
      }
      
    } catch (err) {
      console.error('❌ 处理消息已读事件失败:', err.message);
      console.error('❌ 错误详情:', err);
    }
  });

  // 统一加载消息事件（支持全局、群组、私信）
  socket.on(SocketEvents.LOAD_MESSAGES, async (data) => {
    try {
      const { type, userId, sessionToken, limit = 20, olderThan, groupId, friendId, loadMore = false } = data;
      
      let messages = [];
      const numericUserId = parseInt(userId);
      let responseData = { type, messages: [], loadMore: loadMore };
      
      if (type === 'global') {
        // 加载全局聊天室消息 - 完全复刻 chat-history 事件
        if (olderThan) {
          messages = await getGlobalMessages(limit, olderThan);
        } else {
          // 直接从数据库获取最新消息
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
        const [privateMessages] = await pool.execute(
          'SELECT sender_id, receiver_id, MAX(timestamp) as last_time FROM scr_private_messages WHERE sender_id = ? OR receiver_id = ? GROUP BY sender_id, receiver_id',
          [numericUserId, numericUserId]
        );
        privateMessages.forEach(msg => {
          const otherUserId = String(msg.sender_id) === String(numericUserId) ? msg.receiver_id : msg.sender_id;
          if (!privateLastMessageTimes[otherUserId] || new Date(msg.last_time) > new Date(privateLastMessageTimes[otherUserId])) {
            privateLastMessageTimes[otherUserId] = msg.last_time;
          }
        });
        
        responseData.messages = messages.reverse();
        responseData.groupLastMessageTimes = groupLastMessageTimes;
        responseData.privateLastMessageTimes = privateLastMessageTimes;
        socket.emit(SocketEvents.MESSAGES_LOADED, responseData);
      } else if (type === 'group') {
        // 加载群组消息 - 完全复刻 group-chat-history 事件
        const numericGroupId = parseInt(groupId);
        
        // 验证用户是否在群组中
        const [memberCheck] = await pool.query(
          'SELECT id FROM scr_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
          [numericGroupId, numericUserId]
        );
        
        if (memberCheck.length === 0) {
          socket.emit(SocketEvents.ERROR, { message: '您不在该群组中，无法查看聊天记录' });
          return;
        }
        
        // 获取群组消息
        if (loadMore && olderThan) {
          messages = await getGroupMessages(numericGroupId, limit, olderThan);
        } else {
          // 直接从数据库获取最新消息
          messages = await getGroupMessages(numericGroupId, limit);
        }
        
        responseData.messages = messages.reverse();
        responseData.groupId = numericGroupId;
        socket.emit(SocketEvents.MESSAGES_LOADED, responseData);
      } else if (type === 'private') {
        // 加载私信消息 - 完全复刻 private-chat-history 事件
        const numericFriendId = parseInt(friendId);
        
        // 验证对方是否是自己的好友
        const [friendCheck] = await pool.query(
          'SELECT id FROM scr_friends WHERE user_id = ? AND friend_id = ? AND status = 1',
          [numericUserId, numericFriendId]
        );
        
        if (friendCheck.length === 0) {
          socket.emit(SocketEvents.ERROR, { message: '对方不是您的好友，无法查看聊天记录' });
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
        
        if (loadMore) {
          const olderThanNum = parseInt(olderThan);
          if (!isNaN(olderThanNum)) {
            query += ` AND p.id < ? `;
            params.push(olderThanNum);
          }
        }
        
        const safeLimit = parseInt(limit);
        const finalLimit = isNaN(safeLimit) ? 20 : safeLimit;
        query += ` ORDER BY p.timestamp DESC, p.id DESC LIMIT ?`;
        params.push(finalLimit);
        
        const [results] = await pool.query(query, params);
        
        messages = results.map(msg => {
          let atUserIds = null;
          if (msg.at_userid) {
            try {
              atUserIds = JSON.parse(msg.at_userid);
            } catch (e) {
              atUserIds = msg.at_userid;
            }
          }
          const message = {
            id: msg.id,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            senderNickname: msg.senderNickname,
            senderAvatarUrl: msg.senderAvatarUrl,
            receiverNickname: msg.receiverNickname,
            receiverAvatarUrl: msg.receiverAvatarUrl,
            content: msg.content,
            at_userid: atUserIds,
            messageType: msg.messageType,
            isRead: msg.isRead || 0,
            timestamp: new Date(msg.timestamp).getTime(),
            timestampISO: new Date(msg.timestamp).toISOString()
          };
          
          if (msg.messageType === 1 && msg.content) {
            try {
              const contentData = JSON.parse(msg.content);
              if (contentData.url) {
                message.imageUrl = contentData.url;
              }
            } catch (error) {
              console.error(`解析图片消息失败: 消息ID=${msg.id}, 错误=${error.message}`);
            }
          }
          
          return message;
        });
        
        responseData.messages = messages.reverse();
        responseData.friendId = numericFriendId;
        socket.emit(SocketEvents.MESSAGES_LOADED, responseData);
      } else {
        socket.emit(SocketEvents.ERROR, { message: '无效的消息类型' });
      }
    } catch (err) {
      console.error('❌ 加载消息失败:', err.message);
      socket.emit(SocketEvents.ERROR, { message: '加载消息失败', error: err.message });
    }
  });
}
