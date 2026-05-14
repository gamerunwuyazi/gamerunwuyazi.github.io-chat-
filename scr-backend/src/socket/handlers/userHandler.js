import { SocketEvents } from '../events.js';

export function registerUserHandlers(socket, io, { pool, addOnlineUser, removeOnlineUser, getOnlineUser, getAllOnlineUsers, addAuthenticatedUser, removeAuthenticatedUser, forceDisconnectUser }) {
  
  // 用户加入聊天室
  socket.on(SocketEvents.USER_JOINED, async (userData) => {
    try {
      // 确保用户 ID 是数字类型，防止 SQL 注入
      const userId = parseInt(userData.userId);
      if (isNaN(userId)) {
        console.error('❌ 无效的用户 ID:', userData.userId);
        await forceDisconnectUser(socket, 'session-expired');
        return;
      }
      
      // 加入用户自己的房间，用于接收私人和群组通知
      socket.join(`user_${userId}`);
      
      // 加入用户的所有群组房间
      try {
        const [userGroups] = await pool.execute(
          'SELECT group_id FROM scr_group_members WHERE user_id = ? AND deleted_at IS NULL',
          [userId]
        );
        
        for (const group of userGroups) {
          socket.join(`group_${group.group_id}`);
        }
      } catch (err) {
        console.error('❌ 获取用户群组列表失败:', err.message);
      }
      
      // 获取客户端IP并加入IP房间，用于接收IP封禁通知
      let clientIP = socket.handshake.headers['x-forwarded-for'];
      if (!clientIP) {
        clientIP = socket.handshake.headers['x-real-ip'];
      }
      if (!clientIP) {
        clientIP = socket.handshake.address || socket.conn.remoteAddress;
      }
      // 取第一个IP（如果有多个）
      if (clientIP && clientIP.includes(',')) {
        clientIP = clientIP.split(',')[0].trim();
      }
      // 处理IPv6格式
      let processedIP = clientIP;
      if (processedIP === '::1') {
        processedIP = '127.0.0.1';
      } else if (processedIP && processedIP.startsWith('::ffff:')) {
        processedIP = processedIP.slice(7);
      }
      if (processedIP) {
        socket.join(`ip_${processedIP}`);
      }
      
      // 从数据库中获取真实的用户信息
      const [users] = await pool.execute(
          'SELECT nickname, avatar_url as avatarUrl, gender FROM scr_users WHERE id = ?',
          [userId]
      );
      
      if (users.length === 0) {
        console.error('❌ 用户不存在:', userId);
        socket.emit(SocketEvents.ERROR, { message: '用户不存在' });
        socket.emit(SocketEvents.SESSION_EXPIRED);
        socket.disconnect(true);
        return;
      }
      
      const user = users[0];
      const { nickname, avatarUrl, gender } = user;
  
      // 检查用户是否已经在线，如果在线则移除旧连接
      const allOnlineUsers = await getAllOnlineUsers();
      let isExistingUser = false;
      for (const onlineUser of allOnlineUsers) {
        if (String(onlineUser.id) === String(userId)) {
          await removeOnlineUser(onlineUser.socketId);
          isExistingUser = true;
          break;
        }
      }
  
      // 存储用户信息（使用数据库中的真实信息）
      await addOnlineUser(socket.id, {
        id: userId,
        nickname: nickname,
        socketId: socket.id,
        avatarUrl: avatarUrl,
        gender: gender,
        sessionToken: userData.sessionToken
      });
  
      // 将用户添加到已认证集合和房间，只有发送过 user-joined 的用户才能收到主聊天室消息
      await addAuthenticatedUser(userId, socket);
  
      // 更新用户最后在线时间
      await pool.execute(
          'UPDATE scr_users SET last_online = NOW() WHERE id = ?',
          [userId]
      );

      // 记录用户加入事件到scr_ip_logs
      try {
        // 从nginx代理头获取真实客户端IP
        let clientIP = socket.handshake.headers['x-forwarded-for'];
        if (!clientIP) {
          clientIP = socket.handshake.headers['x-real-ip'];
        }
        if (!clientIP) {
          clientIP = socket.handshake.address || 'unknown';
        }
        // 取第一个IP（如果有多个）
        if (clientIP && clientIP.includes(',')) {
          clientIP = clientIP.split(',')[0].trim();
        }
        await pool.execute(
          'INSERT INTO scr_ip_logs (user_id, ip_address, action) VALUES (?, ?, ?)',
          [userId, clientIP, 'check_status']
        );
        // 清理旧记录，保持最多6000条
        await pool.execute(
          'DELETE FROM scr_ip_logs WHERE id NOT IN (SELECT id FROM (SELECT id FROM scr_ip_logs ORDER BY timestamp DESC LIMIT 6000) AS tmp)'
        );
      } catch (logErr) {
        // 记录失败不影响主要功能
      }

      // 广播更新后的用户列表
      const onlineUsersList = await getAllOnlineUsers();
      const onlineUsersArray = onlineUsersList.map(user => ({
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
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
        .filter(user => !onlineUserIds.has(user.id))
        .map(user => ({
          id: user.id,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          isOnline: false,
          lastOnline: user.last_online
        }));

      // 只向已认证用户广播用户列表
      io.to('authenticated_users').emit(SocketEvents.USERS_LIST, {
        online: onlineUsersArray,
        offline: offlineUsersArray
      });

      // 发送加入确认事件
      socket.emit(SocketEvents.USER_JOINED_CONFIRMED, {
        success: true,
        userId: userId
      });
  
    } catch (err) {
      console.error('❌ 处理用户加入时出错:', err.message);
      socket.emit(SocketEvents.ERROR, { message: '加入聊天室失败' });
    }
  });

  // 获取在线用户列表
  socket.on(SocketEvents.GET_USERS, async () => {
    try {
      const allOnlineUsers = await getAllOnlineUsers();
      const onlineUsersArray = allOnlineUsers.map(user => ({
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
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
        .filter(user => !onlineUserIds.has(user.id))
        .map(user => ({
          id: user.id,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          isOnline: false,
          lastOnline: user.last_online
        }));

      socket.emit(SocketEvents.USERS_LIST, {
        online: onlineUsersArray,
        offline: offlineUsersArray
      });
    } catch (err) {
      console.error('获取用户列表失败:', err.message);
    }
  });

  // 用户断开连接
  socket.on(SocketEvents.DISCONNECT, async (reason) => {
    // 从已认证用户集合和房间中移除
    const user = await getOnlineUser(socket.id);
    if (user) {
      await removeAuthenticatedUser(user.id, socket);
    }

    // 从在线用户列表中移除
    if (user) {
      await removeOnlineUser(socket.id);

      // 更新用户最后上线时间（即下线时间）
      try {
        await pool.execute(
          'UPDATE scr_users SET last_online = NOW() WHERE id = ?',
          [user.id]
        );
      } catch (err) {
        console.error('更新用户最后上线时间失败:', err.message);
      }

      // 广播更新后的用户列表
      const allOnlineUsers = await getAllOnlineUsers();
      const onlineUsersArray = allOnlineUsers.map(u => ({
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
        .filter(user => !onlineUserIds.has(user.id))
        .map(user => ({
          id: user.id,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          isOnline: false,
          lastOnline: user.last_online
        }));

      // 只向已认证用户广播用户列表
      io.to('authenticated_users').emit(SocketEvents.USERS_LIST, {
        online: onlineUsersArray,
        offline: offlineUsersArray
      });
    }
  });

  // 连接错误处理
  socket.on(SocketEvents.ERROR, (error) => {
  });
}
