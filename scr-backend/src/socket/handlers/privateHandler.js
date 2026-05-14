import { SocketEvents } from '../events.js';
import path from 'path';
import fs from 'fs';

export function registerPrivateHandlers(socket, io, { pool, checkRateLimit, validateMessageContent, filterMessageFields, getAllOnlineUsers }) {
  
  // 发送私信
  socket.on(SocketEvents.SEND_PRIVATE_MESSAGE, async (messageData) => {
    try {
      const { userId, content, receiverId, sessionToken, at_userid } = messageData;

      // 速率限制检查
      const rateLimitResult = await checkRateLimit(userId);
      if (!rateLimitResult.allowed) {
        // 通过 private-message-sent 事件返回速率限制错误
        socket.emit(SocketEvents.PRIVATE_MESSAGE_SENT, { 
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
        socket.emit(SocketEvents.ERROR, { message: '消息内容格式错误或超过 10000 字符限制' });
        return;
      }

      // 获取用户信息
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

      // 验证对方是否是自己的好友，并检查是否已删除
      const [friendCheck] = await pool.query(
        'SELECT id, status FROM scr_friends WHERE user_id = ? AND friend_id = ?',
        [parseInt(userId), parseInt(receiverId)]
      );

      if (friendCheck.length === 0) {
        socket.emit(SocketEvents.PRIVATE_MESSAGE_SENT, {
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
        socket.emit(SocketEvents.PRIVATE_MESSAGE_SENT, {
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
        socket.emit(SocketEvents.PRIVATE_MESSAGE_SENT, {
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
      io.to(`user_${parseInt(receiverId)}`).emit(SocketEvents.PRIVATE_MESSAGE_RECEIVED, newMessage);

      // 确认私信已发送，只给发送者发送确认事件（不再发送 private-message-received 给发送者）
      socket.emit(SocketEvents.PRIVATE_MESSAGE_SENT, { messageId: result.insertId, message: newMessage });

    } catch (err) {
      console.error('❌ 保存私信失败:', err.message);
      socket.emit(SocketEvents.ERROR, { message: '发送私信失败' });
    }
  });
  
  // 撤回私信消息
  socket.on(SocketEvents.DELETE_PRIVATE_MESSAGE, async (data) => {
    try {
      const { userId, messageId, sessionToken } = data;
      
      // 速率限制检查
      const rateLimitResult = await checkRateLimit(userId);
      if (!rateLimitResult.allowed) {
        socket.emit(SocketEvents.ERROR, { 
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
        socket.emit(SocketEvents.ERROR, { message: '消息不存在' });
        return;
      }
      
      const message = messages[0];
      const numericUserId = parseInt(userId);
      
      // 检查是否是消息发送者
      if (numericUserId !== message.sender_id) {
        console.error('❌ 只有消息发送者才能撤回消息:', { userId: numericUserId, senderId: message.sender_id });
        socket.emit(SocketEvents.ERROR, { message: '只有消息发送者才能撤回消息' });
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
        // 有文件需要删除
        const fileUrl = contentData.url;
        const filePath = path.join(process.cwd(), 'public', fileUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      
      // 将messageId转换为数字类型
      const numericMessageId = parseInt(messageId);
      
      // 查询操作者（发送撤回请求的用户）的昵称和头像
      const [operatorInfo] = await pool.execute(
        'SELECT nickname, avatar_url FROM scr_users WHERE id = ?',
        [numericUserId]
      );
      const operatorNickname = operatorInfo[0]?.nickname || '未知用户';
      const operatorAvatarUrl = operatorInfo[0]?.avatar_url || '';
      
      // 构建撤回提示内容（使用操作者昵称，纯文本格式）
      const recallContent = `${operatorNickname}撤回了一条消息`;
      
      // 更新原数据库记录（只修改内容为纯文本，不修改messageType）
      await pool.execute(
        'UPDATE scr_private_messages SET content = ? WHERE id = ?',
        [recallContent, messageId]
      );
      
      // 单独生成一条简单的101消息（只包含被撤回消息ID）
      const [insertResult] = await pool.execute(
        'INSERT INTO scr_private_messages (sender_id, receiver_id, content, message_type, timestamp) VALUES (?, ?, ?, ?, NOW())',
        [numericUserId, message.receiver_id, String(numericMessageId), 101]
      );
      
      // 发送简单格式的101消息（content只是被撤回消息ID）
      const rawType101Message = {
        id: insertResult.insertId,  // 101消息自己的ID
        userId: numericUserId,
        nickname: operatorNickname,
        avatarUrl: operatorAvatarUrl,
        senderId: numericUserId,
        receiverId: message.receiver_id,
        content: String(numericMessageId),  // 只包含被撤回消息ID
        messageType: 101,
        timestamp: Date.now(),
        timestampISO: new Date().toISOString()
      };
      
      // 过滤私信消息字段
      const type101Message = filterMessageFields(rawType101Message, 'private');
      
      // 发送确认事件给发送者
      socket.emit(SocketEvents.PRIVATE_MESSAGE_SENT, { messageId: type101Message.id, message: type101Message });
      
      // 只给接收者发送消息接收事件
      io.to(`user_${message.receiver_id}`).emit(SocketEvents.PRIVATE_MESSAGE_RECEIVED, type101Message);
      
    } catch (err) {
      console.error('❌ 撤回私信失败:', err.message);
      console.error('❌ 错误详情:', err);
      socket.emit(SocketEvents.ERROR, { message: '撤回私信失败', error: err.message });
    }
  });
}
