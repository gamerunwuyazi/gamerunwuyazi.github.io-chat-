import { Server } from 'socket.io';
import { registerUserHandlers } from './handlers/userHandler.js';
import { registerMessageHandlers } from './handlers/messageHandler.js';
import { registerPrivateHandlers } from './handlers/privateHandler.js';
import { socketConfig } from '../config/index.js';

// 在线用户管理（使用 Redis）
// 存储在 Redis key: scr:online_users (Hash: socketId -> userData)

// 添加在线用户
async function addOnlineUser(socketId, userData, redisClient) {
  try {
    await redisClient.hSet('scr:online_users', socketId, JSON.stringify(userData));
  } catch (err) {
    console.error('添加在线用户失败:', err.message);
  }
}

// 移除在线用户
async function removeOnlineUser(socketId, redisClient) {
  try {
    await redisClient.hDel('scr:online_users', socketId);
  } catch (err) {
    console.error('移除在线用户失败:', err.message);
  }
}

// 获取在线用户
async function getOnlineUser(socketId, redisClient) {
  try {
    const userData = await redisClient.hGet('scr:online_users', socketId);
    return userData ? JSON.parse(userData) : null;
  } catch (err) {
    console.error('获取在线用户失败:', err.message);
    return null;
  }
}

// 获取所有在线用户
async function getAllOnlineUsers(redisClient) {
  try {
    const users = await redisClient.hGetAll('scr:online_users');
    const result = [];
    for (const socketId in users) {
      result.push({ socketId, ...JSON.parse(users[socketId]) });
    }
    return result;
  } catch (err) {
    console.error('获取所有在线用户失败:', err.message);
    return [];
  }
}

// 获取在线用户数量
async function getOnlineUserCount(redisClient) {
  try {
    return await redisClient.hLen('scr:online_users');
  } catch (err) {
    console.error('获取在线用户数量失败:', err.message);
    return 0;
  }
}

// 更新在线用户数据
async function updateOnlineUser(socketId, updates, redisClient) {
  try {
    const userData = await getOnlineUser(socketId, redisClient);
    if (userData) {
      const updatedUser = { ...userData, ...updates };
      await redisClient.hSet('scr:online_users', socketId, JSON.stringify(updatedUser));
      return updatedUser;
    }
    return null;
  } catch (err) {
    console.error('更新在线用户失败:', err.message);
    return null;
  }
}

// 按用户ID更新所有在线用户数据
async function updateOnlineUserByUserId(userId, updates, redisClient) {
  try {
    const users = await redisClient.hGetAll('scr:online_users');
    for (const socketId in users) {
      const userData = JSON.parse(users[socketId]);
      if (String(userData.id) === String(userId)) {
        const updatedUser = { ...userData, ...updates };
        await redisClient.hSet('scr:online_users', socketId, JSON.stringify(updatedUser));
      }
    }
  } catch (err) {
    console.error('按用户ID更新在线用户失败:', err.message);
  }
}

// 检查用户是否在线
async function isUserOnline(socketId, redisClient) {
  try {
    return await redisClient.hExists('scr:online_users', socketId);
  } catch (err) {
    console.error('检查用户是否在线失败:', err.message);
    return false;
  }
}

// 已认证用户管理（使用 socket.io 原生房间）
// 房间名：authenticated_users

// 添加已认证用户到房间
async function addAuthenticatedUser(userId, socket, redisClient) {
  try {
    // 添加到 Redis Set（保留用于兼容性检查）
    await redisClient.sAdd('scr:authenticated_users', String(userId));
    // 添加到 socket.io 房间
    if (socket) {
      socket.join('authenticated_users');
    }
  } catch (err) {
    console.error('添加已认证用户失败:', err.message);
  }
}

// 从房间移除已认证用户
async function removeAuthenticatedUser(userId, socket, redisClient) {
  try {
    // 从 Redis Set 移除
    await redisClient.sRem('scr:authenticated_users', String(userId));
    // 从 socket.io 房间移除
    if (socket) {
      socket.leave('authenticated_users');
    }
  } catch (err) {
    console.error('移除已认证用户失败:', err.message);
  }
}

// 检查用户是否已认证
async function isAuthenticatedUser(userId, redisClient) {
  try {
    return await redisClient.sIsMember('scr:authenticated_users', String(userId));
  } catch (err) {
    console.error('检查已认证用户失败:', err.message);
    return false;
  }
}

export function setupSocketIO(server, { pool, redisClient, isIPBanned, isUserBanned, getUserSession, validateMessageContent, checkRateLimit, filterMessageFields, isGroupAdmin, getGlobalMessages, getGroupMessages }) {
  
  // 配置 Socket.IO - 使用环境变量配置
  const io = new Server(server, {
    ...socketConfig
  });

  // 封装在线用户管理函数（绑定redisClient）
  const onlineUserManager = {
    addOnlineUser: (socketId, userData) => addOnlineUser(socketId, userData, redisClient),
    removeOnlineUser: (socketId) => removeOnlineUser(socketId, redisClient),
    getOnlineUser: (socketId) => getOnlineUser(socketId, redisClient),
    getAllOnlineUsers: () => getAllOnlineUsers(redisClient),
    getOnlineUserCount: () => getOnlineUserCount(redisClient),
    updateOnlineUser: (socketId, updates) => updateOnlineUser(socketId, updates, redisClient),
    updateOnlineUserByUserId: (userId, updates) => updateOnlineUserByUserId(userId, updates, redisClient),
    isUserOnline: (socketId) => isUserOnline(socketId, redisClient)
  };

  // 封装已认证用户管理函数（绑定redisClient）
  const authUserManager = {
    addAuthenticatedUser: (userId, socket) => addAuthenticatedUser(userId, socket, redisClient),
    removeAuthenticatedUser: (userId, socket) => removeAuthenticatedUser(userId, socket, redisClient),
    isAuthenticatedUser: (userId) => isAuthenticatedUser(userId, redisClient)
  };

  // Socket.IO IP封禁验证函数
  async function validateSocketIP(socket, next) {
    try {
      // 首先尝试从x-forwarded-for头获取真实IP
      let clientIP = socket.handshake.address;
      
      // 处理代理情况，获取真实IP
      if (socket.handshake.headers && socket.handshake.headers['x-forwarded-for']) {
        const forwardedFor = socket.handshake.headers['x-forwarded-for'].trim();
        const ips = forwardedFor.split(',');
        // 取第一个IP地址，并去除空格
        clientIP = ips[0].trim();
      }
      
      // 处理IPv6地址，转换为IPv4格式（如果是localhost的话）
      if (clientIP === '::1') {
        clientIP = '127.0.0.1';
      } else if (clientIP && clientIP.startsWith('::ffff:')) {
        // 处理IPv6格式的IPv4地址，例如::ffff:192.168.1.1
        clientIP = clientIP.slice(7);
      }
      
      // 检查IP是否被封禁，使用isIPBanned函数检查，该函数会考虑封禁过期时间
      const banInfo = await isIPBanned(clientIP);
      
      if (banInfo.isBanned) {
        // 构建封禁消息
        let message = '您的IP已被封禁，无法访问';
        if (banInfo.reason) {
          message += `，原因：${banInfo.reason}`;
        }
        
        // 发送详细的封禁信息，包括剩余封禁时间和封禁原因
        socket.emit('account-banned', {
          message: message,
          ipAddress: clientIP,
          isBanned: true,
          reason: banInfo.reason,
          remainingTime: banInfo.remainingTime,
          status: 'error'
        });
        socket.disconnect();
        return false;
      }
      
      return true;
    } catch (error) {
      socket.emit('error', { message: '服务器错误' });
      socket.disconnect();
      return false;
    }
  }

  // 强制断开用户连接并清理
  async function forceDisconnectUser(socket, reason = 'session-expired', originalEventName = null, originalEventData = null) {
    // 如果是 session-expired，只发送事件，不做其他清理操作
    if (reason === 'session-expired') {
      // 发送事件，带上原始事件信息
      if (originalEventName && originalEventData) {
        socket.emit(reason, {
          originalEventName: originalEventName,
          originalEventData: originalEventData
        });
      } else {
        socket.emit(reason);
      }
    } else {
      // 其他原因（如 account-logged-in-elsewhere）继续断开连接
      // 从在线用户列表中移除
      const user = await onlineUserManager.getOnlineUser(socket.id);
      if (user) {
        await onlineUserManager.removeOnlineUser(socket.id);
        await authUserManager.removeAuthenticatedUser(user.id, socket);
        
        // 更新用户最后在线时间
        try {
          await pool.execute(
            'UPDATE scr_users SET last_online = NOW() WHERE id = ?',
            [user.id]
          );
        } catch (err) {
          console.error('更新用户最后上线时间失败:', err.message);
        }
        
        // 广播更新后的用户列表
        const onlineUsersList = await onlineUserManager.getAllOnlineUsers();
        const onlineUsersArray = onlineUsersList.map(u => ({
          id: u.id,
          nickname: u.nickname,
          avatarUrl: u.avatarUrl,
          isOnline: true
        }));

        const onlineUserIds = new Set(onlineUsersArray.map(u => u.id));
        
        const [offlineUsersData] = await pool.execute(`
          SELECT id, nickname, last_online, avatar_url as avatarUrl 
          FROM scr_users 
          WHERE last_online IS NOT NULL 
          AND last_online >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          ORDER BY last_online DESC
        `);

        const offlineUsersArray = offlineUsersData
          .filter(u => !onlineUserIds.has(u.id))
          .map(u => ({
            id: u.id,
            nickname: u.nickname,
            avatarUrl: u.avatarUrl,
            isOnline: false,
            lastOnline: u.last_online
          }));

        // 只向已认证用户广播用户列表
        io.to('authenticated_users').emit('users-list', {
          online: onlineUsersArray,
          offline: offlineUsersArray
        });
      }
      
      // 发送事件并断开连接
      socket.emit(reason);
      socket.disconnect(true);
    }
  }

  // Socket.IO会话验证中间件（包含IP验证）
  async function validateSocketPacket(socket, [eventName, ...args]) {
    // 首先验证IP
    const ipValid = await validateSocketIP(socket);
    if (!ipValid) {
      throw new Error('IP验证失败');
    }
    
    // 不需要验证的事件列表
    const excludedEvents = ['disconnect', 'error'];
    if (excludedEvents.includes(eventName)) {
      return true;
    }
    
    const data = args[0] || {};
    const userData = data;
    
    // 检查用户ID是否被封禁
    if (userData.userId) {
      const userBanInfo = await isUserBanned(String(userData.userId));
      if (userBanInfo.isBanned) {
        let message = '您的账号已被封禁，无法访问';
        if (userBanInfo.reason) {
          message += `，原因：${userBanInfo.reason}`;
        }
        
        socket.emit('account-banned', {
          message: message,
          userId: userData.userId,
          isBanned: true,
          reason: userBanInfo.reason,
          remainingTime: userBanInfo.remainingTime,
          status: 'error'
        });
        socket.disconnect();
        throw new Error('账号被封禁');
      }
    }
    
    // user-joined 事件可以跳过认证列表检查
    const skipAuthCheck = eventName === 'user-joined';
    
    // 检查用户是否在Redis已认证列表中（除非跳过检查）
    if (!skipAuthCheck && userData.userId) {
      const isAuth = await authUserManager.isAuthenticatedUser(parseInt(userData.userId));
      if (!isAuth) {
        await forceDisconnectUser(socket, 'session-expired', eventName, data);
        throw new Error('会话过期');
      }
    }
    
    // 然后验证会话（如果有用户数据）
    if (userData.userId || userData.sessionToken) {
      if (!userData.userId || !userData.sessionToken) {
        await forceDisconnectUser(socket, 'session-expired', eventName, data);
        throw new Error('会话无效');
      }

      const session = await getUserSession(parseInt(userData.userId));
      if (!session || session.token !== userData.sessionToken) {
        await forceDisconnectUser(socket, 'session-expired', eventName, data);
        throw new Error('会话无效');
      }
    }
    
    // 验证通过
    return true;
  }

  io.on('connection', (socket) => {
    // 为每个连接的 socket 设置数据包验证中间件
    socket.use(async (packet, next) => {
      try {
        await validateSocketPacket(socket, packet);
        next();
      } catch (err) {
        next(err);
      }
    });

    // 注册各个handler
    const context = {
      pool,
      ...onlineUserManager,
      ...authUserManager,
      forceDisconnectUser,
      checkRateLimit,
      validateMessageContent,
      filterMessageFields,
      isGroupAdmin,
      getGlobalMessages,
      getGroupMessages
    };

    registerUserHandlers(socket, io, context);
    registerMessageHandlers(socket, io, context);
    registerPrivateHandlers(socket, io, context);
  });

  return io;
}

export default setupSocketIO;
