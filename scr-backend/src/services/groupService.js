import { pool, redisClient } from '../models/database.js';
import { filterMessageFields } from '../utils/messageFilters.js';
import { checkAvatarStorage } from '../utils/helpers.js';
import { sqlInjectionPattern, validateNickname } from '../utils/validators.js';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

let io = null;
let getAllOnlineUsersFn = null;

export function setSocketDependencies(socketIo, getOnlineUsersFn) {
  io = socketIo;
  getAllOnlineUsersFn = getOnlineUsersFn;
}

async function isGroupOwner(groupId, userId) {
  try {
    const [groups] = await pool.execute(
      'SELECT creator_id FROM scr_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );
    if (groups.length === 0) return false;
    return parseInt(groups[0].creator_id) === parseInt(userId);
  } catch (err) {
    console.error('检查群主身份失败', err.message);
    return false;
  }
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
    console.error('检查群管理员身份失败', err.message);
    return false;
  }
}

export async function getGroupById(req, res) {
  try {
    const groupId = req.params.id;

    const [groups] = await pool.execute(
        'SELECT id, name, description, creator_id, avatar_url, created_at FROM scr_groups WHERE id = ? AND deleted_at IS NULL',
        [groupId]
    );

    if (groups.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }

    res.json({
      status: 'success',
      group: groups[0]
    });
  } catch (err) {
    console.error('获取群组信息失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取群组信息失败' });
  }
}

export async function uploadGroupAvatar(req, res, next) {
  try {
    if (!req.file) {
      const ext = req.body.filename ? path.extname(req.body.filename).toLowerCase() : '';
      const prohibitedExts = ['.php', '.php3', '.php4', '.php5', '.phtml', '.phar'];
      if (prohibitedExts.includes(ext)) {
        return res.status(400).json({ status: 'error', message: '禁止上传PHP文件' });
      }
      return res.status(400).json({ status: 'error', message: '没有上传文件' });
    }

    const storageStatus = checkAvatarStorage();
    if (storageStatus.full) {
      return res.status(400).json({ status: 'error', message: storageStatus.message });
    }

    const userId = req.userId;
    const groupId = req.params.groupId;

    if (!userId || !groupId) {
      return res.status(400).json({ status: 'error', message: '用户ID和群组ID不能为空' });
    }

    // 检查用户是否是群主或管理员
    const hasPermission = await isGroupAdmin(groupId, userId);
    if (!hasPermission) {
      return res.status(403).json({ status: 'error', message: '只有群主或管理员可以修改群头像' });
    }

    const [groups] = await pool.execute(
        'SELECT id, name, creator_id FROM scr_groups WHERE id = ? AND deleted_at IS NULL',
        [groupId]
    );

    if (groups.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }

    const group = groups[0];
    const avatarPath = `/avatars/${req.file.filename}`;
    
    // 清理该群组的旧头像文件
    const avatarDir = path.join(__dirname, '..', '..', 'public', 'avatars');
    const groupAvatarFiles = fs.readdirSync(avatarDir).filter(file => {
      return file.startsWith(`group_avatar_${groupId}.`);
    });

    // 如果头像文件数量大于1，删除除当前头像外的其他文件
    if (groupAvatarFiles.length > 1) {
      const currentAvatarFilename = req.file.filename;
      for (const file of groupAvatarFiles) {
        if (file !== currentAvatarFilename) {
          try {
            const filePath = path.join(avatarDir, file);
            fs.unlinkSync(filePath);
          } catch (deleteError) {
            console.error(`删除旧群头像文件 ${file} 失败:`, deleteError.message);
          }
        }
      }
    }
    
    // 生成带时间戳的头像URL，确保客户端获取最新资源
    const timestamp = Date.now();
    const avatarUrlWithVersion = `${avatarPath}?v=${timestamp}`;

    // 更新群组头像 URL
    await pool.execute(
        'UPDATE scr_groups SET avatar_url = ? WHERE id = ? AND deleted_at IS NULL',
        [avatarUrlWithVersion, groupId]
    );

    // 广播群头像更新事件给所有群组成员（使用群组房间）
    io.to(`group_${groupId}`).emit('group-avatar-updated', {
      groupId: groupId,
      avatarUrl: avatarUrlWithVersion
    });

    res.json({
      status: 'success',
      message: '群头像上传成功',
      groupId: group.id,
      groupName: group.name,
      avatarUrl: avatarUrlWithVersion
    });
  } catch (err) {
    console.error('上传群头像失败', err.message);
    res.status(500).json({ status: 'error', message: '上传群头像失败' });
  }
}

export async function createGroup(req, res) {
  try {
    const { userId, groupName, description, memberIds } = req.body;

    if (!userId || !groupName || !memberIds || !Array.isArray(memberIds)) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }

    const sessionUserId = req.userId;
    if (parseInt(userId) !== parseInt(sessionUserId)) {
      return res.status(403).json({ status: 'error', message: '无权操作此用户' });
    }

    // 群组名称验证
    if (!groupName || typeof groupName !== 'string' || groupName.trim().length === 0) {
      return res.status(400).json({ status: 'error', message: '群组名称不能为空' });
    }

    // 检查群组名称是否包含SQL注入
    if (sqlInjectionPattern.test(groupName)) {
      return res.status(400).json({ status: 'error', message: '群组名称非法' });
    }

    // 检查描述是否包含SQL注入（如果提供了描述）
    if (description && typeof description === 'string' && sqlInjectionPattern.test(description)) {
      return res.status(400).json({ status: 'error', message: '群组描述非法' });
    }

    // 移除3人限制，改为1人以上
    const allMemberIds = [...new Set([parseInt(userId), ...memberIds.map(id => parseInt(id))])];
    
    // 获取创建者的所有好友ID
    const [friendIds] = await pool.execute(
      'SELECT friend_id FROM scr_friends WHERE user_id = ? AND status = 1',
      [parseInt(userId)]
    );
    const friends = friendIds.map(row => row.friend_id);
    
    // 验证所有添加的成员都是创建者的好友
    const nonFriendMembers = allMemberIds.filter(memberId => memberId !== parseInt(userId) && !friends.includes(memberId));
    if (nonFriendMembers.length > 0) {
      return res.status(400).json({ status: 'error', message: '只能添加好友到群组' });
    }
    
    // 验证所有成员都存在
    const placeholders = allMemberIds.map(() => '?').join(',');
    const [members] = await pool.execute(
        `SELECT id FROM scr_users WHERE id IN (${placeholders})`,
        allMemberIds
    );
    
    if (members.length !== allMemberIds.length) {
      return res.status(400).json({ status: 'error', message: '部分成员不存在' });
    }

    const [groupResult] = await pool.execute(
        'INSERT INTO scr_groups (name, description, creator_id) VALUES (?, ?, ?)',
        [groupName, description || '', userId]
    );

    const groupId = groupResult.insertId;

    const memberValues = allMemberIds.map(memberId => [groupId, memberId]);
    await pool.query(
        'INSERT INTO scr_group_members (group_id, user_id) VALUES ?',
        [memberValues]
    );

    const [groups] = await pool.execute(`
      SELECT g.*, u.nickname as creator_name 
      FROM scr_groups g 
      JOIN scr_users u ON g.creator_id = u.id 
      WHERE g.id = ? AND g.deleted_at IS NULL
    `, [groupId]);

    const [groupMembers] = await pool.execute(`
      SELECT u.id, u.nickname, u.avatar_url 
      FROM scr_group_members gm 
      JOIN scr_users u ON gm.user_id = u.id 
      WHERE gm.group_id = ? AND gm.deleted_at IS NULL
    `, [groupId]);

    // 让所有在线成员加入群组房间
    for (const member of groupMembers) {
      const allOnlineUsers = await getAllOnlineUsersFn();
      for (const onlineUser of allOnlineUsers) {
        if (String(onlineUser.id) === String(member.id)) {
          const memberSocket = io.sockets.sockets.get(onlineUser.socketId);
          if (memberSocket) {
            memberSocket.join(`group_${groupId}`);
          }
        }
      }
    }
    
    // 获取创建者信息
    const [creatorInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
      [userId]
    );

    // 先广播类型100的系统消息：XXX创建了群组
    const now = new Date();
    let createContent = `${creatorInfo[0]?.nickname || '用户'}创建了群组`;
    
    // 如果有同时加入的成员，添加到消息内容
    const otherMemberIds = allMemberIds.filter(id => id !== parseInt(userId));
    if (otherMemberIds.length > 0) {
      const [otherMembersInfo] = await pool.execute(
        `SELECT u.id, u.nickname FROM scr_users u WHERE u.id IN (${otherMemberIds.map(() => '?').join(',')})`,
        otherMemberIds
      );
      const otherMemberNames = otherMembersInfo.map(m => m.nickname || '用户').join('、');
      createContent += `，同时加入群组的有：${otherMemberNames}`;
    }
    
    const [insertResult] = await pool.execute(
      'INSERT INTO scr_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [userId, createContent, 100, groupId]
    );

    // 构建100类型消息对象
    const rawType100Message = {
      id: insertResult.insertId,
      userId: userId,
      nickname: creatorInfo[0]?.nickname || '',
      avatarUrl: creatorInfo[0]?.avatar_url || '',
      content: createContent,
      messageType: 100,
      groupId: groupId,
      timestamp: now.getTime(),
      timestampISO: now.toISOString()
    };

    // 过滤群组消息字段
    const type100Message = filterMessageFields(rawType100Message, 'group');

    // 向所有群组成员发送100类型消息（先广播）
    io.to(`group_${groupId}`).emit('message-received', type100Message);
      
    // 向所有群组成员广播群组创建事件（使用群组房间）
    io.to(`group_${groupId}`).emit('group-created', {
      groupId: groupId,
      groupName: groupName,
      creatorId: userId,
      members: groupMembers
    });

    res.json({
      status: 'success',
      message: '群组创建成功',
      group: groups[0],
      members: groupMembers,
      createMessage: type100Message
    });
  } catch (err) {
    console.error('创建群组失败:', err.message);
    res.status(500).json({ status: 'error', message: '创建群组失败' });
  }
}

export async function getUserGroups(req, res) {
  try {
    const userId = req.params.userId;

    const sessionUserId = req.userId;
    if (Number(userId) !== Number(sessionUserId)) {
      console.error('权限错误: 尝试访问其他用户的群组列表');
      return res.status(403).json({ status: 'error', message: '无权访问此用户信息' });
    }

    const [groups] = await pool.execute(`
      SELECT g.*
      FROM scr_groups g 
      JOIN scr_group_members gm ON g.id = gm.group_id 
      WHERE gm.user_id = ? AND g.deleted_at IS NULL AND gm.deleted_at IS NULL
      ORDER BY g.id DESC
    `, [userId]);

    // 确保所有ID字段都是数字格式
    const normalizedGroups = groups.map(group => ({
      ...group,
      id: Number(group.id),
      creator_id: Number(group.creator_id),
      is_mute_all: Number(group.is_mute_all)
    }));

    const responseData = {
      status: 'success',
      groups: normalizedGroups,
      timestamp: new Date().toISOString()
    };
    
    res.json(responseData);
  } catch (err) {
    console.error('获取群组列表失败:', err.message);
    console.error('错误详情:', err);
    res.status(500).json({ status: 'error', message: '获取群组列表失败', error: err.message });
  }
}

export async function getAvailableGroupMembers(req, res) {
  try {
    const groupId = req.params.groupId;
    const userId = req.userId;

    // 检查请求者是否为群主或管理员
    const hasPermission = await isGroupAdmin(groupId, userId);
    if (!hasPermission) {
      return res.status(403).json({ success: false, message: '只有群主或管理员可以查看可添加成员' });
    }

    // 查询不在该群组中的创建者的好友
    const [availableMembers] = await pool.execute(`
      SELECT u.id, u.nickname, u.avatar_url
      FROM scr_users u
      JOIN scr_friends f ON u.id = f.friend_id
      WHERE f.user_id = ? AND f.status = 1 AND u.id NOT IN (
        SELECT user_id FROM scr_group_members WHERE group_id = ? AND deleted_at IS NULL
      ) AND u.id != ?
    `, [userId, groupId, userId]);

    res.json({
      status: 'success',
      members: availableMembers.map(member => ({
        id: member.id,
        nickname: member.nickname,
        avatarUrl: member.avatar_url
      }))
    });
  } catch (err) {
    console.error('获取可添加成员失败', err.message);
    res.status(500).json({ success: false, message: '获取可添加成员失败' });
  }
}

export async function getGroupInfo(req, res) {
  try {
    const groupId = req.params.groupId;

    const [group] = await pool.execute(
      'SELECT id, name, description, creator_id, created_at, avatar_url, deleted_at, is_mute_all FROM scr_groups WHERE id = ?',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }

    // 确保所有ID字段都是数字格式
    const normalizedGroup = {
      ...group[0],
      id: Number(group[0].id),
      creator_id: Number(group[0].creator_id),
      is_mute_all: Number(group[0].is_mute_all)
    };

    res.json({
      status: 'success',
      group: normalizedGroup
    });
  } catch (err) {
    console.error('获取群组信息失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取群组信息失败' });
  }
}

export async function getGroupMembers(req, res) {
  try {
    const groupId = req.params.groupId;

    const [members] = await pool.execute(`
      SELECT u.id, u.nickname, u.avatar_url as avatarUrl, gm.is_admin, gm.is_muted
      FROM scr_group_members gm 
      JOIN scr_users u ON gm.user_id = u.id 
      WHERE gm.group_id = ? AND gm.deleted_at IS NULL
    `, [groupId]);

    // 确保所有ID字段都是数字格式
    const normalizedMembers = members.map(member => ({
      id: Number(member.id),
      nickname: member.nickname,
      avatarUrl: member.avatarUrl,
      is_admin: Number(member.is_admin),
      is_muted: member.is_muted
    }));

    res.json({
      status: 'success',
      members: normalizedMembers
    });
  } catch (err) {
    console.error('获取群组成员失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取群组成员失败' });
  }
}

export async function removeGroupMember(req, res) {
  try {
    const { groupId, memberId } = req.body;
    const userId = req.userId;

    // 验证参数
    if (!groupId || !memberId) {
      return res.status(400).json({ success: false, message: '参数错误' });
    }

    // 检查请求者是否为群主或管理员
    const hasPermission = await isGroupAdmin(groupId, userId);
    if (!hasPermission) {
      return res.status(403).json({ success: false, message: '只有群主或管理员可以踢出成员' });
    }

    // 检查成员是否在群组中
    const [member] = await pool.execute(
      'SELECT id, is_admin FROM scr_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
      [groupId, memberId]
    );

    if (!member || member.length === 0) {
      return res.status(404).json({ success: false, message: '该成员不在群组中' });
    }

    // 不能踢出自己
    if (parseInt(memberId) === parseInt(userId)) {
      return res.status(400).json({ success: false, message: '不能踢出自己' });
    }
    
    // 管理员不能踢出群主或其他管理员（只有群主可以）
    const isOwner = await isGroupOwner(groupId, userId);
    if (!isOwner && member[0].is_admin === 1) {
      return res.status(403).json({ success: false, message: '只有群主可以踢出管理员' });
    }

    // 获取被踢出的成员信息
    const [memberInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
      [memberId]
    );

    // 获取群主信息
    const [creatorInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
      [userId]
    );

    // 先广播类型100的系统消息：XXX被踢出了群组
    const now = new Date();
    const kickedContent = `${memberInfo[0]?.nickname || '用户'}被移出了群组`;
    const [insertResult] = await pool.execute(
      'INSERT INTO scr_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [userId, kickedContent, 100, groupId]
    );

    // 构建100类型消息对象
    const rawType100Message = {
      id: insertResult.insertId,
      userId: userId,
      nickname: creatorInfo[0]?.nickname || '',
      avatarUrl: creatorInfo[0]?.avatar_url || '',
      content: kickedContent,
      messageType: 100,
      groupId: groupId,
      timestamp: now.getTime(),
      timestampISO: now.toISOString()
    };

    // 过滤群组消息字段
    const type100Message = filterMessageFields(rawType100Message, 'group');

    // 向所有群组成员发送100类型消息（先广播）
    io.to(`group_${groupId}`).emit('message-received', type100Message);
    
    // 同时也向被踢出的成员的用户房间发送，确保他们能收到
    io.to(`user_${memberId}`).emit('message-received', type100Message);

    // 执行踢出操作 - 逻辑删除，只记录deleted_at（加1秒）
    const deletedAt = new Date(Date.now() + 1000);
    await pool.execute(
      'UPDATE scr_group_members SET deleted_at = ? WHERE group_id = ? AND user_id = ?',
      [deletedAt, groupId, memberId]
    );

    // 让被踢出的用户离开群组socket.io房间
    const allOnlineUsers = await getAllOnlineUsersFn();
    for (const onlineUser of allOnlineUsers) {
      if (String(onlineUser.id) === String(memberId)) {
        const memberSocket = io.sockets.sockets.get(onlineUser.socketId);
        if (memberSocket) {
          memberSocket.leave(`group_${groupId}`);
        }
      }
    }

    // 向所有群组成员广播成员被踢出事件
    io.to(`group_${groupId}`).emit('member-removed', { groupId, memberId });

    // 也通知被踢出的成员
    io.to(`user_${memberId}`).emit('member-removed', { groupId, memberId });
    
    res.json({ success: true, message: '成员已成功踢出' });
  } catch (err) {
    console.error('踢出成员失败:', err.message);
    res.status(500).json({ success: false, message: '踢出成员失败' });
  }
}

export async function setGroupAdmin(req, res) {
  try {
    const { groupId, memberId, isAdmin } = req.body;
    const userId = req.userId;

    // 验证参数
    if (!groupId || !memberId || typeof isAdmin !== 'boolean') {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }

    // 检查请求者是否为群主（只有群主可以设置管理员）
    const isOwner = await isGroupOwner(groupId, userId);
    if (!isOwner) {
      return res.status(403).json({ status: 'error', message: '只有群主可以设置管理员' });
    }

    // 不能设置自己为管理员（自己已经是群主了）
    if (parseInt(memberId) === parseInt(userId)) {
      return res.status(400).json({ status: 'error', message: '不能设置群主为管理员' });
    }

    // 检查目标成员是否在群组中
    const [member] = await pool.execute(
      'SELECT id, is_admin FROM scr_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
      [groupId, memberId]
    );

    if (!member || member.length === 0) {
      return res.status(404).json({ status: 'error', message: '该成员不在群组中' });
    }

    // 更新管理员状态
    await pool.execute(
      'UPDATE scr_group_members SET is_admin = ? WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
      [isAdmin ? 1 : 0, groupId, memberId]
    );

    // 获取用户信息
    const [userInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
      [memberId]
    );

    // 向所有群组成员广播管理员变更事件
    io.to(`group_${groupId}`).emit('group-admin-changed', {
      groupId: groupId,
      userId: memberId,
      isAdmin: isAdmin,
      nickname: userInfo[0]?.nickname || '',
      avatarUrl: userInfo[0]?.avatar_url || ''
    });

    res.json({ 
      status: 'success', 
      message: isAdmin ? '已设置为管理员' : '已取消管理员权限'
    });
  } catch (err) {
    console.error('设置群管理员失败:', err.message);
    res.status(500).json({ status: 'error', message: '设置群管理员失败' });
  }
}

export async function addGroupMembers(req, res) {
  try {
    const { groupId, memberIds, userId: requestUserId } = req.body;
    const userId = req.userId;
    
    // 验证请求中的用户ID是否与会话用户ID一致
    if (requestUserId && String(requestUserId) !== String(userId)) {
      return res.status(403).json({ status: 'error', message: '无效的用户ID' });
    }

    if (!groupId || !memberIds || !Array.isArray(memberIds)) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }

    // 检查用户是否是群主或管理员（群主和管理员都可以拉取成员）
    const hasPermission = await isGroupAdmin(groupId, userId);
    if (!hasPermission) {
      return res.status(403).json({ status: 'error', message: '只有群主或管理员可以拉取成员' });
    }

    const [group] = await pool.execute(
      'SELECT name, avatar_url FROM scr_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }

    // 检查成员是否存在
    const cleanMemberIds = [...new Set(memberIds.map(id => parseInt(id)))];
    const placeholders = cleanMemberIds.map(() => '?').join(',');
    const [users] = await pool.execute(
      `SELECT id FROM scr_users WHERE id IN (${placeholders})`,
      cleanMemberIds
    );

    if (users.length !== cleanMemberIds.length) {
      return res.status(400).json({ status: 'error', message: '部分用户不存在' });
    }
    
    // 获取群主的所有好友ID
    const [friendIds] = await pool.execute(
      'SELECT friend_id FROM scr_friends WHERE user_id = ? AND status = 1',
      [parseInt(userId)]
    );
    const friends = friendIds.map(row => row.friend_id);
    
    // 验证所有要添加的成员都是群主的好友
    const nonFriendMembers = cleanMemberIds.filter(memberId => !friends.includes(memberId));
    if (nonFriendMembers.length > 0) {
      return res.status(400).json({ status: 'error', message: '只能添加好友到群组' });
    }

    // 检查用户是否已经在群组中
    const [existingMembers] = await pool.execute(
      `SELECT user_id FROM scr_group_members WHERE group_id = ? AND user_id IN (${placeholders}) AND deleted_at IS NULL`,
      [groupId].concat(cleanMemberIds)
    );

    const existingUserIds = new Set(existingMembers.map(m => m.user_id));
    const newMemberIds = cleanMemberIds.filter(id => !existingUserIds.has(id));

    if (newMemberIds.length === 0) {
      return res.status(400).json({ status: 'error', message: '所选用户已在群组中' });
    }

    // 获取新成员信息
    const [newMembersInfo] = await pool.execute(
      `SELECT u.id, u.nickname, u.avatar_url as avatarUrl 
      FROM scr_users u 
      WHERE u.id IN (${newMemberIds.map(() => '?').join(',')})`,
      newMemberIds
    );

    // 获取群主信息
    const [creatorInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
      [userId]
    );

    // 添加新成员，总是创建新记录
    for (const memberId of newMemberIds) {
      await pool.execute(
        'INSERT INTO scr_group_members (group_id, user_id, joined_at) VALUES (?, ?, NOW())',
        [groupId, memberId]
      );
    }

    // 获取更新后的群组成员列表（只获取未删除的成员）
    const [updatedMembers] = await pool.execute(
      `SELECT u.id, u.nickname, u.avatar_url as avatarUrl
      FROM scr_group_members gm
      JOIN scr_users u ON gm.user_id = u.id
      WHERE gm.group_id = ? AND gm.deleted_at IS NULL`,
      [groupId]
    );

    // 让所有在线的新成员加入群组房间
    const allOnlineUsers = await getAllOnlineUsersFn();
    for (const memberId of newMemberIds) {
      for (const onlineUser of allOnlineUsers) {
        if (String(onlineUser.id) === String(memberId)) {
          const memberSocket = io.sockets.sockets.get(onlineUser.socketId);
          if (memberSocket) {
            memberSocket.join(`group_${groupId}`);
          }
        }
      }
    }

    // 插入类型100的系统消息：XXX邀请XXX加入了群组
    const now = new Date();
    const newMemberNames = newMembersInfo.map(m => m.nickname || '用户').join('、');
    const inviterName = creatorInfo[0]?.nickname || '用户';
    const addedContent = `${inviterName}邀请${newMemberNames}加入了群组`;
    const [insertResult] = await pool.execute(
      'INSERT INTO scr_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [userId, addedContent, 100, groupId]
    );

    // 构建100类型消息对象
    const rawType100Message = {
      id: insertResult.insertId,
      userId: userId,
      nickname: creatorInfo[0]?.nickname || '',
      avatarUrl: creatorInfo[0]?.avatar_url || '',
      content: addedContent,
      messageType: 100,
      groupId: groupId,
      timestamp: now.getTime(),
      timestampISO: now.toISOString()
    };

    // 过滤群组消息字段
    const type100Message = filterMessageFields(rawType100Message, 'group');

    // 向所有群组成员发送100类型消息
    io.to(`group_${groupId}`).emit('message-received', type100Message);

    // 向每个新成员单独发送被添加到群组的事件
    for (const memberId of newMemberIds) {
      io.to(`user_${memberId}`).emit('added-to-group', {
        groupId: groupId,
        groupName: group.name,
        groupAvatarUrl: group.avatar_url,
        members: updatedMembers,
        addMessage: type100Message
      });
    }

    // 向所有群组成员广播成员添加事件（不包括新成员，他们通过added-to-group接收）
    io.to(`group_${groupId}`).emit('members-added', {
      groupId: groupId,
      newMemberIds: newMemberIds,
      members: updatedMembers
    });

    res.json({
      status: 'success',
      message: '成员添加成功',
      groupId: groupId,
      addedMemberIds: newMemberIds,
      members: updatedMembers,
      addMessage: type100Message
    });
  } catch (err) {
    console.error('添加群组成员失败:', err.message);
    res.status(500).json({ status: 'error', message: '添加群组成员失败' });
  }
}

export async function generateGroupToken(req, res) {
  try {
    const { groupId } = req.body;
    const userId = req.userId;
    
    if (!groupId) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }
    
    // 检查用户是否为群组成员
    const [member] = await pool.execute(
      'SELECT id FROM scr_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
      [groupId, userId]
    );
    
    if (!member || member.length === 0) {
      return res.status(403).json({ status: 'error', message: '只有群组成员可以生成邀请Token' });
    }
    
    // 生成唯一Token
    const token = crypto.randomBytes(16).toString('hex');
    // 设置Token有效期为7天（秒）
    const expiresInSeconds = 7 * 24 * 60 * 60;
    const expires = new Date(Date.now() + expiresInSeconds * 1000);
    
    // 存储Token到Redis
    const redisKey = `group_invite_token:${token}`;
    await redisClient.setEx(redisKey, expiresInSeconds, JSON.stringify({
      groupId: groupId,
      createdBy: userId
    }));
    
    res.json({ status: 'success', token, expires });
  } catch (err) {
    console.error('生成群组邀请Token失败:', err.message);
    res.status(500).json({ status: 'error', message: '生成邀请Token失败' });
  }
}

export async function validateGroupToken(req, res) {
  try {
    const { token } = req.params;
    
    // 从Redis读取Token
    const redisKey = `group_invite_token:${token}`;
    const tokenData = await redisClient.get(redisKey);
    
    if (!tokenData) {
      return res.status(400).json({ status: 'error', message: '无效或过期的邀请Token' });
    }
    
    const { groupId } = JSON.parse(tokenData);
    
    // 获取群组信息
    const [groups] = await pool.execute(
      'SELECT id, name, description FROM scr_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );
    
    if (!groups || groups.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }
    
    res.json({ status: 'success', group: groups[0] });
  } catch (err) {
    console.error('验证群组邀请Token失败:', err.message);
    res.status(500).json({ status: 'error', message: '验证邀请Token失败' });
  }
}

export async function joinGroupWithToken(req, res) {
  try {
    const { token, isFromGroupCard } = req.body;
    const userId = req.userId;
    
    if (!token) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }
    
    // 从Redis读取Token
    const redisKey = `group_invite_token:${token}`;
    const tokenData = await redisClient.get(redisKey);
    
    if (!tokenData) {
      return res.status(400).json({ status: 'error', message: '无效或过期的邀请Token' });
    }
    
    const { groupId } = JSON.parse(tokenData);
    
    // 获取群组信息
    const [group] = await pool.execute(
      'SELECT id, name, avatar_url FROM scr_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );
    
    if (!group || group.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }
    
    // 检查用户是否已经是群组成员
    const [members] = await pool.execute(
      'SELECT id, deleted_at FROM scr_group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );
    
    if (members && members.length > 0) {
      if (members[0].deleted_at === null) {
        return res.status(400).json({ status: 'error', message: '你已经是该群组成员' });
      }
    }
    
    // 获取用户信息
    const [userInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
      [userId]
    );
    
    // 执行加入操作，总是创建新记录
    await pool.execute(
      'INSERT INTO scr_group_members (group_id, user_id, joined_at) VALUES (?, ?, NOW())',
      [groupId, userId]
    );
    
    // 让用户加入群组房间
    const allOnlineUsers = await getAllOnlineUsersFn();
    for (const onlineUser of allOnlineUsers) {
      if (String(onlineUser.id) === String(userId)) {
        const userSocket = io.sockets.sockets.get(onlineUser.socketId);
        if (userSocket) {
          userSocket.join(`group_${groupId}`);
        }
      }
    }
    
    // 插入类型100的系统消息
    const now = new Date();
    let joinContent;
    if (isFromGroupCard) {
      joinContent = `${userInfo[0]?.nickname || '用户'}通过群名片加入了群组`;
    } else {
      joinContent = `${userInfo[0]?.nickname || '用户'}加入了群组`;
    }
    const [insertResult] = await pool.execute(
      'INSERT INTO scr_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [userId, joinContent, 100, groupId]
    );

    // 构建100类型消息对象
    const rawType100Message = {
      id: insertResult.insertId,
      userId: userId,
      nickname: userInfo[0]?.nickname || '',
      avatarUrl: userInfo[0]?.avatar_url || '',
      content: joinContent,
      messageType: 100,
      groupId: groupId,
      timestamp: now.getTime(),
      timestampISO: now.toISOString()
    };

    // 过滤群组消息字段
    const type100Message = filterMessageFields(rawType100Message, 'group');

    // 向所有群组成员发送100类型消息（用户已经加入房间了）
    io.to(`group_${groupId}`).emit('message-received', type100Message);
    
    // 同时也向新成员的用户房间发送，确保他们能收到
    io.to(`user_${userId}`).emit('message-received', type100Message);
    
    // 向新成员单独发送被添加到群组的事件，包含群组信息
    const [updatedMembers] = await pool.execute(`
      SELECT u.id, u.nickname, u.avatar_url as avatarUrl, gm.is_admin
      FROM scr_group_members gm 
      JOIN scr_users u ON gm.user_id = u.id 
      WHERE gm.group_id = ? AND gm.deleted_at IS NULL
    `, [groupId]);
    
    io.to(`user_${userId}`).emit('added-to-group', {
      groupId: groupId,
      groupName: group.name,
      groupAvatarUrl: group.avatar_url,
      members: updatedMembers,
      addMessage: type100Message
    });
    
    // 向所有群组成员广播成员添加事件（不包括新成员）
    io.to(`group_${groupId}`).emit('members-added', {
      groupId: groupId,
      newMemberIds: [parseInt(userId)],
      members: updatedMembers
    });

    res.json({
      status: 'success',
      message: '成功加入群组',
      groupId: groupId,
      groupName: group.name,
      joinMessage: type100Message
    });
  } catch (err) {
    console.error('使用Token加入群组失败:', err.message);
    res.status(500).json({ status: 'error', message: '加入群组失败' });
  }
}

export async function leaveGroup(req, res) {
  try {
    const { groupId } = req.body;
    const userId = req.userId;

    // 验证参数
    if (!groupId) {
      return res.status(400).json({ success: false, message: '参数错误' });
    }

    // 检查群组是否存在
    const [group] = await pool.execute(
      'SELECT id, name, creator_id FROM scr_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ success: false, message: '群组不存在' });
    }

    // 检查成员是否在群组中
    const [member] = await pool.execute(
      'SELECT id FROM scr_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
      [groupId, userId]
    );

    if (!member || member.length === 0) {
      return res.status(404).json({ success: false, message: '你不在该群组中' });
    }

    // 不能退出自己是群主的群组
    if (parseInt(group[0].creator_id) === parseInt(userId)) {
      return res.status(400).json({ success: false, message: '群主不能退出群组，请先转让群主或解散群组' });
    }

    // 获取用户信息
    const [userInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
      [userId]
    );

    // 先广播类型100的系统消息：XXX退出了群组
    const now = new Date();
    const leaveContent = `${userInfo[0]?.nickname || '用户'}退出了群组`;
    const [insertResult] = await pool.execute(
      'INSERT INTO scr_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [userId, leaveContent, 100, groupId]
    );

    // 构建100类型消息对象
    const rawType100Message = {
      id: insertResult.insertId,
      userId: userId,
      nickname: userInfo[0]?.nickname || '',
      avatarUrl: userInfo[0]?.avatar_url || '',
      content: leaveContent,
      messageType: 100,
      groupId: groupId,
      timestamp: now.getTime(),
      timestampISO: now.toISOString()
    };

    // 过滤群组消息字段
    const type100Message = filterMessageFields(rawType100Message, 'group');

    // 向所有群组成员发送100类型消息（先广播）
    io.to(`group_${groupId}`).emit('message-received', type100Message);
    
    // 同时也向退出的成员的用户房间发送，确保他们能收到
    io.to(`user_${userId}`).emit('message-received', type100Message);

    // 执行退出操作 - 逻辑删除，只记录deleted_at（加1秒）
    const deletedAt = new Date(Date.now() + 1000);
    await pool.execute(
      'UPDATE scr_group_members SET deleted_at = ? WHERE group_id = ? AND user_id = ?',
      [deletedAt, groupId, userId]
    );

    // 让退出的用户离开群组socket.io房间
    const allOnlineUsers = await getAllOnlineUsersFn();
    for (const onlineUser of allOnlineUsers) {
      if (String(onlineUser.id) === String(userId)) {
        const userSocket = io.sockets.sockets.get(onlineUser.socketId);
        if (userSocket) {
          userSocket.leave(`group_${groupId}`);
        }
      }
    }

    // 向所有群组成员广播成员退出事件
    io.to(`group_${groupId}`).emit('member-removed', { groupId, memberId: userId });

    // 也通知退出的成员
    io.to(`user_${userId}`).emit('member-removed', { groupId, memberId: userId });
    
    res.json({ success: true, message: '成功退出群组' });
  } catch (err) {
    console.error('退出群组失败', err.message);
    res.status(500).json({ success: false, message: '退出群组失败' });
  }
}

export async function dissolveGroup(req, res) {
  try {
    const { groupId, userId: requestUserId } = req.body;
    const userId = req.userId;
    
    // 验证请求中的用户ID是否与会话用户ID一致
    if (requestUserId && String(requestUserId) !== String(userId)) {
      return res.status(403).json({ status: 'error', message: '无效的用户ID' });
    }
    
    // 验证请求参数
    if (!groupId) {
      return res.status(400).json({ status: 'error', message: '缺少必要参数' });
    }
    
    // 检查用户是否是群主（只有群主可以解散群组）
    const isOwner = await isGroupOwner(groupId, userId);
    if (!isOwner) {
      return res.status(403).json({ status: 'error', message: '只有群主可以解散群组' });
    }

    const [groupResults] = await pool.execute(
      'SELECT name, avatar_url FROM scr_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );

    if (groupResults.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }

    const group = groupResults[0];
    const groupAvatarUrl = group.avatar_url;
    
    // 获取连接并开始事务
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // 获取群组所有成员
      const [members] = await connection.execute(
        'SELECT user_id FROM scr_group_members WHERE group_id = ?',
        [groupId]
      );
      
      // 设置群组为已删除（标记deleted_at）
      await connection.execute(
        'UPDATE scr_groups SET deleted_at = NOW() WHERE id = ?',
        [groupId]
      );
      
      // 保留成员记录，添加deleted_at 标记
      await connection.execute(
        'UPDATE scr_group_members SET deleted_at = NOW() WHERE group_id = ?',
        [groupId]
      );
      
      // 提交事务
      await connection.commit();
      connection.release();
      
      // 删除群头像文件（如果不是默认头像）
      if (groupAvatarUrl && groupAvatarUrl !== '/avatars/default.png') {
        try {
          // 去掉 URL 中的 ?v= 参数，并构建正确的文件路径
          const avatarPathWithoutVersion = groupAvatarUrl.split('?')[0];
          const fullAvatarPath = path.join(__dirname, '..', '..', 'public', avatarPathWithoutVersion);
          if (fs.existsSync(fullAvatarPath)) {
            fs.unlinkSync(fullAvatarPath);
          }
        } catch (deleteError) {
          console.error('删除群头像文件失败', deleteError.message);
        }
      }
      
      // 获取当前时间
      const now = new Date();
      
      // 获取群主信息
      const [creatorInfo] = await pool.execute(
        'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
        [userId]
      );
      
      // 只添加一条群组解散消息，发送人是群主
      const dissolvedContent = JSON.stringify({
        groupName: group.name,
        content: '群组已解散'
      });
      const [insertResult] = await pool.execute(
        'INSERT INTO scr_messages (user_id, content, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, NOW())',
        [userId, dissolvedContent, 100, groupId]
      );
      
      // 构建100类型消息对象
      const rawType100Message = {
        id: insertResult.insertId,
        userId: userId,
        nickname: creatorInfo[0]?.nickname || '',
        avatarUrl: creatorInfo[0]?.avatar_url || '',
        content: dissolvedContent,
        messageType: 100,
        groupId: groupId,
        timestamp: now.getTime(),
        timestampISO: now.toISOString()
      };
      
      // 过滤群组消息字段
      const type100Message = filterMessageFields(rawType100Message, 'group');
      
      // 广播群组解散消息和事件
      io.to(`group_${groupId}`).emit('message-received', type100Message);
      io.to(`group_${groupId}`).emit('group-dissolved', {
        groupId: groupId,
        groupName: group.name,
        dissolvedBy: userId,
        dissolvedMessage: type100Message
      });
      
      // 让所有在线成员离开群组socket.io房间
      const allOnlineUsers = await getAllOnlineUsersFn();
      for (const member of members) {
        for (const onlineUser of allOnlineUsers) {
          if (String(onlineUser.id) === String(member.user_id)) {
            const memberSocket = io.sockets.sockets.get(onlineUser.socketId);
            if (memberSocket) {
              memberSocket.leave(`group_${groupId}`);
            }
          }
        }
      }
      
      res.json({ 
        status: 'success', 
        message: '群组已成功解散',
        groupId: groupId,
        groupName: group.name
      });
    } catch (transactionErr) {
      await connection.rollback();
      connection.release();
      throw transactionErr;
    }
  } catch (err) {
    console.error('解散群组失败:', err.message);
    res.status(500).json({ status: 'error', message: '解散群组失败' });
  }
}

export async function updateGroupName(req, res) {
  try {
    const { groupId, newGroupName } = req.body;
    const userId = req.userId;

    // 验证参数
    if (!groupId || !newGroupName) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }

    if (!validateNickname(newGroupName)) {
      return res.status(400).json({ status: 'error', message: '群组名称格式错误' });
    }

    // 检查用户是否是群主或管理员
    const hasPermission = await isGroupAdmin(groupId, userId);
    if (!hasPermission) {
      return res.status(403).json({ status: 'error', message: '只有群主或管理员可以修改群组名称' });
    }

    // 更新群组名称
    await pool.execute(
      'UPDATE scr_groups SET name = ? WHERE id = ? AND deleted_at IS NULL',
      [newGroupName, groupId]
    );

    // 向所有群组成员广播群组名称更新事件（使用群组房间）
    io.to(`group_${groupId}`).emit('group-name-updated', {
      groupId: groupId,
      newGroupName: newGroupName
    });

    res.json({ status: 'success', message: '群组名称已更新', newGroupName: newGroupName });
  } catch (err) {
    console.error('修改群组名称失败:', err.message);
    res.status(500).json({ status: 'error', message: '服务器错误，请重试' });
  }
}

export async function updateGroupDescription(req, res) {
  try {
    const { groupId, newDescription } = req.body;
    const userId = req.userId;

    // 验证参数
    if (!groupId) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }

    // 检查用户是否是群主或管理员
    const hasPermission = await isGroupAdmin(groupId, userId);
    if (!hasPermission) {
      return res.status(403).json({ status: 'error', message: '只有群主或管理员可以修改群组公告' });
    }

    // 更新群组描述
    await pool.execute(
      'UPDATE scr_groups SET description = ? WHERE id = ? AND deleted_at IS NULL',
      [newDescription, groupId]
    );

    // 向所有群组成员广播群组公告更新事件（使用群组房间）
    io.to(`group_${groupId}`).emit('group-description-updated', {
      groupId: groupId,
      newDescription: newDescription
    });

    res.json({ status: 'success', message: '群组公告已更新', newDescription: newDescription });
  } catch (err) {
    console.error('修改群组公告失败:', err.message);
    res.status(500).json({ status: 'error', message: '服务器错误，请重试' });
  }
}

export async function muteGroupMember(req, res) {
  try {
    const { groupId, memberId, duration } = req.body;
    const userId = req.userId;

    // 验证参数
    if (!groupId || !memberId) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }

    // 检查请求者是否为群主或管理员
    const hasPermission = await isGroupAdmin(groupId, userId);
    if (!hasPermission) {
      return res.status(403).json({ status: 'error', message: '只有群主或管理员可以禁言成员' });
    }

    // 检查目标成员是否在群组中
    const [member] = await pool.execute(
      'SELECT gm.id, gm.user_id, u.id as uid, g.creator_id FROM scr_group_members gm JOIN scr_users u ON gm.user_id = u.id JOIN scr_groups g ON gm.group_id = g.id WHERE gm.group_id = ? AND gm.user_id = ? AND gm.deleted_at IS NULL',
      [groupId, memberId]
    );

    if (!member || member.length === 0) {
      return res.status(404).json({ status: 'error', message: '该成员不在群组中' });
    }

    // 不能禁言群主
    if (parseInt(member[0].creator_id) === parseInt(memberId)) {
      return res.status(400).json({ status: 'error', message: '不能禁言群主' });
    }

    // 管理员不能禁言其他管理员（只有群主可以）
    const isOwner = await isGroupOwner(groupId, userId);
    if (!isOwner) {
      const [targetMember] = await pool.execute(
        'SELECT is_admin FROM scr_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
        [groupId, memberId]
      );
      if (targetMember.length > 0 && targetMember[0].is_admin === 1) {
        return res.status(403).json({ status: 'error', message: '只有群主可以禁言管理员' });
      }
    }

    // 计算禁言值（优化后的单字段设计）
    // is_muted: NULL=未禁言, '9999-12-31 23:59:59'=永久禁言, 时间戳=临时禁言截止时间
    let mutedValue;
    
    if (duration !== undefined && duration !== null) {
      if (typeof duration !== 'number' || isNaN(duration)) {
        return res.status(400).json({ 
          status: 'error', 
          message: '禁言时长必须是数字',
          code: 'INVALID_DURATION_TYPE'
        });
      }
      
      if (duration < 0) {
        return res.status(400).json({ 
          status: 'error', 
          message: '禁言时长不能为负数',
          code: 'NEGATIVE_DURATION'
        });
      }
      
      if (duration === 0) {
        // duration 为 0 表示永久禁言
        mutedValue = '9999-12-31 23:59:59';
      } else {
        // 临时禁言：存储截止时间戳（使用北京时间 UTC+8）
        const now = new Date();
        const mutedUntilDate = new Date(now.getTime() + duration * 60 * 1000);
        
        // 验证：确保计算的禁言时间比当前时间晚
        if (mutedUntilDate.getTime() <= now.getTime()) {
          return res.status(400).json({ 
            status: 'error', 
            message: '禁言截止时间必须晚于当前时间，请设置有效的禁言时长',
            code: 'INVALID_MUTE_TIME'
          });
        }
        
        // 验证：防止极端情况（如 duration 过大导致的时间溢出）
        const maxMuteYears = 100;
        const maxMuteTime = new Date(now.getTime() + maxMuteYears * 365.25 * 24 * 60 * 60 * 1000);
        if (mutedUntilDate.getTime() > maxMuteTime.getTime()) {
          // 超过100年，自动转为永久禁言
          mutedValue = '9999-12-31 23:59:59';
        } else {
          // 转换为北京时间格式：YYYY-MM-DD HH:mm:ss
          const beijingTimeStr = mutedUntilDate.toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });
          
          // 格式化为 MySQL DATETIME 格式
          mutedValue = beijingTimeStr.replace(/(\d{4})\/(\d{2})\/(\d{2})/, '$1-$2-$3');
          
          // 最终验证：确保格式化后的时间字符串解析后仍然有效
          const parsedMutedTime = new Date(mutedValue.replace(' ', 'T'));
          if (isNaN(parsedMutedTime.getTime()) || parsedMutedTime.getTime() <= now.getTime()) {
            return res.status(500).json({ 
              status: 'error', 
              message: '禁言时间计算错误，请重试',
              code: 'MUTE_TIME_CALCULATION_ERROR'
            });
          }
        }
      }
    } else {
      // 未提供 duration 参数，默认为永久禁言
      mutedValue = '9999-12-31 23:59:59';
    }

    // 执行禁言操作（使用单一字段 is_muted）
    const [updateResult] = await pool.execute(
      'UPDATE scr_group_members SET is_muted = ? WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
      [mutedValue, groupId, memberId]
    );

    // 获取被禁言用户信息
    const [userInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
      [memberId]
    );

    // 向所有群组成员广播禁言事件
    io.to(`group_${groupId}`).emit('member-muted', {
      groupId: groupId,
      userId: memberId,
      nickname: userInfo[0]?.nickname || '',
      mutedUntil: mutedValue,
      isPermanent: !duration || duration <= 0,
      duration: duration
    });

    // 也通知被禁言的用户
    io.to(`user_${memberId}`).emit('member-muted', {
      groupId: groupId,
      mutedUntil: mutedValue,
      isPermanent: !duration || duration <= 0,
      duration: duration
    });

    res.json({
      status: 'success',
      message: duration > 0 ? `已禁言${duration}分钟` : '已永久禁言',
      mutedUntil: mutedValue,
      isPermanent: !duration || duration <= 0
    });
  } catch (err) {
    console.error('禁言成员失败:', err.message);
    res.status(500).json({ status: 'error', message: '禁言成员失败' });
  }
}

export async function unmuteGroupMember(req, res) {
  try {
    const { groupId, memberId } = req.body;
    const userId = req.userId;

    // 验证参数
    if (!groupId || !memberId) {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }

    // 检查请求者是否为群主或管理员
    const hasPermission = await isGroupAdmin(groupId, userId);
    if (!hasPermission) {
      return res.status(403).json({ status: 'error', message: '只有群主或管理员可以解除禁言' });
    }

    // 检查目标成员是否在群组中
    const [member] = await pool.execute(
      'SELECT id FROM scr_group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
      [groupId, memberId]
    );

    if (!member || member.length === 0) {
      return res.status(404).json({ status: 'error', message: '该成员不在群组中' });
    }

    // 执行解除禁言操作（设置为NULL表示未禁言）
    await pool.execute(
      'UPDATE scr_group_members SET is_muted = NULL WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL',
      [groupId, memberId]
    );

    // 获取用户信息
    const [userInfo] = await pool.execute(
      'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
      [memberId]
    );

    // 向所有群组成员广播解除禁言事件
    io.to(`group_${groupId}`).emit('member-unmuted', {
      groupId: groupId,
      userId: memberId,
      nickname: userInfo[0]?.nickname || ''
    });

    // 也通知被解除禁言的用户
    io.to(`user_${memberId}`).emit('member-unmuted', {
      groupId: groupId
    });

    res.json({ status: 'success', message: '已解除禁言' });
  } catch (err) {
    console.error('解除禁言失败:', err.message);
    res.status(500).json({ status: 'error', message: '解除禁言失败' });
  }
}

export async function setMuteAll(req, res) {
  try {
    const { groupId, isMuteAll } = req.body;
    const userId = req.userId;

    // 验证参数
    if (!groupId || typeof isMuteAll !== 'boolean') {
      return res.status(400).json({ status: 'error', message: '参数错误' });
    }

    // 检查请求者是否为群主或管理员
    const hasPermission = await isGroupAdmin(groupId, userId);
    if (!hasPermission) {
      return res.status(403).json({ status: 'error', message: '只有群主或管理员可以设置全员禁言' });
    }

    // 执行全员禁言/解禁操作
    await pool.execute(
      'UPDATE scr_groups SET is_mute_all = ? WHERE id = ? AND deleted_at IS NULL',
      [isMuteAll ? 1 : 0, groupId]
    );

    // 向所有群组成员广播全员禁言状态变更事件
    io.to(`group_${groupId}`).emit('mute-all-changed', {
      groupId: groupId,
      isMuteAll: isMuteAll,
      operatedBy: userId
    });

    res.json({
      status: 'success',
      message: isMuteAll ? '已开启全员禁言' : '已关闭全员禁言',
      isMuteAll: isMuteAll
    });
  } catch (err) {
    console.error('设置全员禁言失败:', err.message);
    res.status(500).json({ status: 'error', message: '设置全员禁言失败' });
  }
}

export async function getMuteStatus(req, res) {
  try {
    const groupId = req.params.groupId;

    // 获取群组的全员禁言状态
    const [groupInfo] = await pool.execute(
      'SELECT is_mute_all FROM scr_groups WHERE id = ? AND deleted_at IS NULL',
      [groupId]
    );

    if (!groupInfo || groupInfo.length === 0) {
      return res.status(404).json({ status: 'error', message: '群组不存在' });
    }

    // 获取所有成员的禁言状态（优化后的单字段设计）
    const [members] = await pool.execute(`
      SELECT u.id, u.nickname, gm.is_muted 
      FROM scr_group_members gm 
      JOIN scr_users u ON gm.user_id = u.id 
      WHERE gm.group_id = ? AND gm.deleted_at IS NULL
    `, [groupId]);

    // 处理成员禁言状态
    const processedMembers = members.map(m => {
      let isMuted = false;
      let mutedUntil = null;
      let isPermanent = false;

      if (m.is_muted !== null) {
        const mutedValue = String(m.is_muted);
        
        // 判断是否为永久禁言（存储为'9999-12-31 23:59:59'）
        if (mutedValue.includes('9999')) {
          isMuted = true;
          isPermanent = true;
        } else {
          // 临时禁言，检查是否已过期
          const mutedTime = new Date(mutedValue);
          if (!isNaN(mutedTime.getTime())) {
            const now = new Date();
            const diffMs = mutedTime.getTime() - now.getTime();
            
            if (diffMs > 0) {
              // 未过期，返回禁言状态和截止时间
              isMuted = true;
              mutedUntil = m.is_muted;
            }
            // 已过期的不设置 isMuted，相当于自动解除禁言
          }
        }
      }

      return {
        id: Number(m.id),
        nickname: m.nickname,
        isMuted: isMuted,
        mutedUntil: mutedUntil,
        isPermanent: isPermanent
      };
    });

    res.json({
      status: 'success',
      isMuteAll: groupInfo[0].is_mute_all === 1,
      members: processedMembers
    });
  } catch (err) {
    console.error('获取禁言状态失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取禁言状态失败' });
  }
}
