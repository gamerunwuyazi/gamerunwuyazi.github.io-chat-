import { SERVER_URL, io, toast, getModalNameFromId, originalFetch } from './config.js';
import { 
  getStore, 
  getCurrentUser,
  getCurrentSessionToken,
  unreadMessages,
  sessionStore,
  setCurrentSessionToken
} from './store.js';
import { unescapeHtml } from './message.js';
import { 
  updateUnreadCountsDisplay, 
  currentGroupId, 
  currentActiveChat, 
  logout,
  currentPrivateChatUserId,
  openImagePreview
} from './ui.js';
import { 
  loadGroupList, 
  updateGroupList, 
  getMutedGroups, 
  hideAddGroupMemberModal, 
  confirmAddGroupMembers 
} from './group.js';
import { loadFriendsList } from './private.js';
import modal from '../modal.js';
import { refreshTokenWithQueue, isTokenRefreshing } from './tokenManager.js';
import localForage from 'localforage';

let isConnected = false;
let avatarVersions = {};

function updateUserList(users) {
  if (!Array.isArray(users)) {
    console.error('Invalid users data:', users);
    users = [];
  }

  const store = getStore();
  if (store) {
    const currentUserId = store.currentUser?.id;
    
    const processedUsers = users.map(user => ({
      ...user,
      nickname: user.nickname
    }));
    
    const onlineUsers = processedUsers.filter(u => u.isOnline !== false);
    // 离线用户列表过滤掉当前用户
    const offlineUsers = processedUsers.filter(u => u.isOnline === false && String(u.id) !== String(currentUserId));
    store.onlineUsers = onlineUsers;
    store.offlineUsers = offlineUsers;
  }
}

// 保存 socket 实例以便断开连接
let socket = null;

function initializeWebSocket() {
    // 使用 Socket.io 连接到服务器
    socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: true
    });

    // 连接成功事件
    socket.on('connect', async () => {
        isConnected = true;

        // 登录后先检查IP和用户状态，然后再加入聊天室
        const currentUser = getCurrentUser();
        const currentSessionToken = getCurrentSessionToken();
        if (currentUser && currentSessionToken) {
            checkUserAndIPStatus((canProceed) => {
                if (canProceed) {
                    // 检查通过，发送user-joined事件进行认证和加入聊天
                    // 后端会从数据库获取用户的真实信息（昵称、头像等）
                    const joinedData = {
                        userId: currentUser.id ? String(currentUser.id) : null,
                        sessionToken: currentSessionToken
                    };
                    socket.emit('user-joined', joinedData);

                    // 如果正在群组聊天，加入群组
                    if (currentGroupId) {
                        socket.emit('join-group', {
                            groupId: currentGroupId,
                            sessionToken: currentSessionToken,
                            userId: currentUser.id,
                            loadTime: Date.now()
                        });
                    }

                    // 启用消息发送功能
                    enableMessageSending();
                }
            });
        }
    });

    // 断开连接事件
    socket.on('disconnect', () => {
        
        isConnected = false;
        // 禁用消息发送功能
        disableMessageSending();
    });

    // 重连成功事件 - 通过 Manager 对象监听
    socket.io.on('reconnect', async (attemptNumber) => {
        const currentUser = getCurrentUser();
        const currentSessionToken = getCurrentSessionToken();
        
        if (currentUser && currentSessionToken) {
            // 重连成功后拉取离线消息
            const store = window.chatStore;
            if (store && store.fetchAndMergeOfflineMessages) {
                try {
                    await store.fetchAndMergeOfflineMessages(false);
                } catch (err) {
                    console.error('重连后拉取离线消息失败:', err);
                }
            }
        }
    });

    // 接收消息事件
    socket.on('message-received', async (message) => {
        // 检查消息中是否包含新的会话令牌
        if (message.sessionToken) {
            // 更新会话令牌
            setCurrentSessionToken(message.sessionToken);
        }

        const store = window.chatStore;
        const isPageVisible = !document.hidden;
        const isBrowserFocused = document.hasFocus();
        const pageVisible = isPageVisible && isBrowserFocused;
        
        // 检查是否是类型101撤回消息
        if (message.messageType === 101) {
            const messageIdToDelete = message.content;
            if (store && messageIdToDelete) {
                if (message.groupId) {
                    // 群组消息撤回
                    store.deleteGroupMessage(message.groupId, messageIdToDelete);
                    // 添加101撤回消息
                    store.addGroupMessage(message.groupId, message);
                } else {
                    // 公共消息撤回
                    store.deletePublicMessage(messageIdToDelete);
                    // 添加101撤回消息
                    store.addPublicMessage(message);
                }
                // 更新对应的 minId
                if (message.id && store.publicAndGroupMinId !== undefined) {
                    if (message.id > store.publicAndGroupMinId) {
                        store.publicAndGroupMinId = message.id;
                        if (store.saveMinIds) {
                            store.saveMinIds();
                        }
                    }
                }
            }
            return;
        }

        // 检查是否是类型102用户信息更新消息
        if (message.messageType === 102) {
            try {
                const updateData = JSON.parse(message.content);
                const userId = message.userId;
                if (updateData.type === 'nickname' && updateData.nickname) {
                    if (store && store.onlineUsers) {
                        const userIndex = store.onlineUsers.findIndex(u => String(u.id) === String(userId));
                        if (userIndex !== -1) {
                            store.onlineUsers[userIndex].nickname = updateData.nickname;
                        }
                    }
                    if (store && store.friendsList) {
                        const friendIndex = store.friendsList.findIndex(f => String(f.id) === String(userId));
                        if (friendIndex !== -1) {
                            store.friendsList[friendIndex].nickname = updateData.nickname;
                            store.friendsList = [...store.friendsList];
                        }
                    }
                    // 更新 IndexedDB 中的会话信息（无论好友是否已删除）
                    try {
                        const currentUser = getCurrentUser();
                        const userIdForStorage = currentUser?.id || 'guest';
                        const prefix = `chats-${userIdForStorage}`;
                        const key = `${prefix}-private-${userId}`;
                        const existingData = await localForage.getItem(key);
                        if (existingData) {
                            const updatedSessionData = { ...existingData };
                            updatedSessionData.nickname = updateData.nickname;
                            await localForage.setItem(key, updatedSessionData);
                        }
                    } catch (e) {
                        console.error('更新IndexedDB中的好友昵称失败:', e);
                    }
                    if (store && store.updateUserInfoInMessages) {
                        store.updateUserInfoInMessages(userId, { nickname: updateData.nickname });
                    }
                } else if (updateData.type === 'avatar' && updateData.avatarUrl) {
                    if (store && store.onlineUsers) {
                        const userIndex = store.onlineUsers.findIndex(u => String(u.id) === String(userId));
                        if (userIndex !== -1) {
                            store.onlineUsers[userIndex].avatar = updateData.avatarUrl;
                            store.onlineUsers[userIndex].avatarUrl = updateData.avatarUrl;
                            store.onlineUsers[userIndex].avatar_url = updateData.avatarUrl;
                        }
                    }
                    if (store && store.friendsList) {
                        const friendIndex = store.friendsList.findIndex(f => String(f.id) === String(userId));
                        if (friendIndex !== -1) {
                            store.friendsList[friendIndex].avatarUrl = updateData.avatarUrl;
                            store.friendsList[friendIndex].avatar_url = updateData.avatarUrl;
                            store.friendsList[friendIndex].avatar = updateData.avatarUrl;
                            store.friendsList = [...store.friendsList];
                        }
                    }
                    // 更新 IndexedDB 中的会话信息（无论好友是否已删除）
                    try {
                        const currentUser = getCurrentUser();
                        const userIdForStorage = currentUser?.id || 'guest';
                        const prefix = `chats-${userIdForStorage}`;
                        const key = `${prefix}-private-${userId}`;
                        const existingData = await localForage.getItem(key);
                        if (existingData) {
                            const updatedSessionData = { ...existingData };
                            updatedSessionData.avatarUrl = updateData.avatarUrl;
                            await localForage.setItem(key, updatedSessionData);
                        }
                    } catch (e) {
                        console.error('更新IndexedDB中的好友头像失败:', e);
                    }
                    if (store && store.updateUserInfoInMessages) {
                        store.updateUserInfoInMessages(userId, { avatarUrl: updateData.avatarUrl });
                    }
                }
            } catch (e) {
                console.error('解析102消息失败:', e);
            }
            
            // 添加102消息到store（公共消息）
            if (store && store.addPublicMessage) {
                store.addPublicMessage(message);
            }
            
            // 更新对应的 minId
            if (message.id && store && store.publicAndGroupMinId !== undefined) {
                if (message.id > store.publicAndGroupMinId) {
                    store.publicAndGroupMinId = message.id;
                    if (store.saveMinIds) {
                        store.saveMinIds();
                    }
                }
            }
            
            return;
        }
        
        // 更新对应的 minId（只对非撤回消息）
        if (message.id && store && store.publicAndGroupMinId !== undefined) {
            if (message.id > store.publicAndGroupMinId) {
                store.publicAndGroupMinId = message.id;
                if (store.saveMinIds) {
                    store.saveMinIds();
                }
            }
        }
        
        const currentUser = getCurrentUser();
        
        // 检查消息是否包含群组 ID
        if (message.groupId) {
            // 检查是否是历史消息
            const now = Date.now();
            const messageTime = message.timestamp ? new Date(message.timestamp).getTime() : now;
            const isRecentMessage = now - messageTime < 10000;
            message.isHistory = message.isHistory || !isRecentMessage;
            
            // 添加消息到 store
            if (store && store.addGroupMessage) {
                store.addGroupMessage(message.groupId, message);
            }
            
            if (message.at_userid && currentUser && !message.isHistory) {
                const atUserIds = Array.isArray(message.at_userid) ? message.at_userid : [message.at_userid];
                const isCurrentUserAt = atUserIds.some(id => String(id) === String(currentUser.id) || String(id) === '-1');
                if (isCurrentUserAt) {
                    // 查找群组名称
                    let groupName = '未知群组';
                    if (store && store.groupsList) {
                        const group = store.groupsList.find(g => String(g.id) === String(message.groupId));
                        if (group) {
                            groupName = group.name;
                        }
                    }
                    toast.info(`群组 ${groupName} 有@你的消息`);
                    // 设置该群组有@我的消息标记
                    if (store && store.setGroupHasAtMe) {
                        store.setGroupHasAtMe(message.groupId);
                    }
                }
            }
            
            // 更新群组最后消息时间并重新排序
            if (store && store.groupsList) {
                const group = store.groupsList.find(g => String(g.id) === String(message.groupId));
                if (group) {
                    const newTime = new Date(message.timestamp || Date.now()).toISOString();
                    group.last_message_time = newTime;
                    group.lastMessage = message;
                    store.sortGroupsByLastMessageTime();
                }
            }
            
            // 更新群组未读计数
            // 规则：如果不是自己发送的消息，且 (不在当前群组页面 或 页面不可见 或 浏览器没有焦点)，则增加未读计数
            // 另外：如果是免打扰群组，则不增加未读计数
            
            const isOwnMessage = String(currentUser.id) === String(message.userId);
            const groupIdStr = String(message.groupId);
            const isCurrentGroup = currentActiveChat === `group_${groupIdStr}`;
            const isGroupMuted = typeof window.isGroupMuted === 'function' && window.isGroupMuted(message.groupId);
            
            // 只有在当前群组页面且浏览器有焦点且页面可见时，才不增加未读计数
            const shouldAddGroupUnread = !isOwnMessage && !(isCurrentGroup && isPageVisible && isBrowserFocused) && !isGroupMuted;
            
            if (shouldAddGroupUnread) {
                if (store && store.incrementGroupUnread) {
                    store.incrementGroupUnread(message.groupId);
                }
                updateUnreadCountsDisplay();
            }
            
            // 如果用户当前正在该群组聊天中且浏览器有焦点且页面可见，自动清除未读
            if (isCurrentGroup && isPageVisible && isBrowserFocused && !isOwnMessage) {
                // 立即清除群组未读计数
                if (store && store.clearGroupUnread) {
                    store.clearGroupUnread(message.groupId);
                }
                updateUnreadCountsDisplay();
            }
            
            // 如果当前焦点在群组页面，将群组移到顶部
            if (pageVisible && currentActiveChat === `group_${groupIdStr}`) {
                if (store && store.moveGroupToTop) {
                    store.moveGroupToTop(message.groupId);
                }
            }
        } else {
            // 添加公共消息到 store
            if (store && store.addPublicMessage) {
                store.addPublicMessage(message);
            }
            
            // 检查@通知
            const currentUser = getCurrentUser();
            if (message.at_userid && currentUser && !message.isHistory) {
                const atUserIds = Array.isArray(message.at_userid) ? message.at_userid : [message.at_userid];
                const isCurrentUserAt = atUserIds.some(id => String(id) === String(currentUser.id));
                if (isCurrentUserAt) {
                    toast.info('主聊天室有@你的消息');
                }
            }
            
            // 更新公共聊天未读计数
            // 规则：如果不是自己发送的消息，且 (不在主聊天室路由 或 页面不可见 或 浏览器没有焦点)，则增加未读计数
            const isOwnMessage = String(currentUser.id) === String(message.userId);
            
            // 检查当前路由是否在主聊天室（/chat 或 /chat/）
            const currentPath = window.router ? window.router.currentRoute.value.path : '';
            const isInMainChatRoute = currentPath === '/chat' || currentPath === '/chat/';
            
            // 只有在主聊天室路由且浏览器有焦点且页面可见时，才不增加未读计数
            const shouldAddUnread = !isOwnMessage && !(isInMainChatRoute && isPageVisible && isBrowserFocused);
            
            if (shouldAddUnread) {
                if (store && store.incrementGlobalUnread) {
                    store.incrementGlobalUnread();
                }
                updateUnreadCountsDisplay();
            }
            
            // 如果用户当前正在主聊天室路由且浏览器有焦点且页面可见，自动清除未读
            if (isInMainChatRoute && isPageVisible && isBrowserFocused && !isOwnMessage) {
                // 清除主聊天室未读计数
                if (store && store.clearGlobalUnread) {
                    store.clearGlobalUnread();
                }
                updateUnreadCountsDisplay();
            }
        }
    });

    // 接收消息发送确认事件 - 根据确认事件渲染消息
    socket.on('message-sent', (data) => {
        // 检查是否包含完整的消息数据
        if (data.message && data.messageId) {
            const confirmedMessage = data.message;
            
            // 标记为实时消息
            confirmedMessage.isHistory = false;
            
            const store = window.chatStore;
            
            // 更新对应的 minId
            if (confirmedMessage.id && store && store.publicAndGroupMinId !== undefined) {
                if (confirmedMessage.id > store.publicAndGroupMinId) {
                    store.publicAndGroupMinId = confirmedMessage.id;
                    if (store.saveMinIds) {
                        store.saveMinIds();
                    }
                }
            }
            
            // 检查消息中是否包含群组 ID
            if (confirmedMessage.groupId) {
                // 群组消息
                const groupId = String(confirmedMessage.groupId);
                
                // 添加确认后的消息到 store
                if (store && store.addGroupMessage) {
                    store.addGroupMessage(groupId, confirmedMessage);
                }
                
                // 更新群组最后消息
                if (store && store.updateGroupLastMessage) {
                    store.updateGroupLastMessage(groupId, confirmedMessage);
                }
                
                // 将群组移到列表顶部
                if (store && store.moveGroupToTop) {
                    store.moveGroupToTop(groupId);
                }
                
                // 清空群组草稿
                if (store && store.clearDraft) {
                    store.clearDraft('group', groupId);
                }
            } else {
                // 公共消息
                // 添加确认后的消息到 store
                if (store && store.addPublicMessage) {
                    store.addPublicMessage(confirmedMessage);
                }
                
                // 清空公共聊天草稿
                if (store && store.clearDraft) {
                    store.clearDraft('main', null);
                }
            }
        }
    });

    // 用户列表更新事件
    socket.on('users-list', (data) => {
        const allUsers = [...data.online, ...data.offline];
        updateUserList(allUsers);
    });

    // 群组列表更新事件
    socket.on('group-list', (groups) => {
        updateGroupList(groups);
    });

    // 群组创建事件
    socket.on('group-created', async (data) => {
        // 加载群组列表
        loadGroupList();
        // 保存群组名称和头像到 IndexedDB
        if (data && data.groupId) {
            const store = window.chatStore;
            try {
                const userId = store.currentUser?.id || 'guest';
                const prefix = `chats-${userId}`;
                const key = `${prefix}-group-${data.groupId}`;
                const existingData = await localForage.getItem(key);
                const updatedSessionData = existingData ? { ...existingData } : { messages: [] };
                if (data.groupName) updatedSessionData.name = data.groupName;
                if (data.groupAvatarUrl) updatedSessionData.avatarUrl = data.groupAvatarUrl;
                else if (data.group_avatar_url) updatedSessionData.avatarUrl = data.group_avatar_url;
                await localForage.setItem(key, updatedSessionData);
            } catch (e) {
                console.error('保存群组信息到 IndexedDB 失败:', e);
            }
        }
    });

    // 群组删除事件
    socket.on('group-deleted', (data) => {
        // 加载群组列表
        loadGroupList();
    });

    // 群组解散事件
    socket.on('group-dissolved', async (data) => {
        // console.log('📥 [群组] 收到群组解散事件:', data);
        if (data && data.groupId) {
            const store = window.chatStore;
            if (store && store.markGroupAsDeleted) {
                store.markGroupAsDeleted(data.groupId);
            }
            // 把解散状态记录到 IndexedDB
            try {
                const currentUser = getCurrentUser();
                const userIdForStorage = currentUser?.id || 'guest';
                const prefix = `chats-${userIdForStorage}`;
                const key = `${prefix}-group-${data.groupId}`;
                const existingData = await localForage.getItem(key);
                if (existingData) {
                    const updatedSessionData = { ...existingData };
                    updatedSessionData.deleted_at = new Date().toISOString();
                    await localForage.setItem(key, updatedSessionData);
                }
            } catch (e) {
                console.error('记录群组解散状态到 IndexedDB 失败:', e);
            }
            // 清除该群组的未读消息记录
            if (store && store.clearGroupUnread) {
                store.clearGroupUnread(data.groupId);
            }
            // 如果当前活动群组就是解散的群组，清空当前群组
            if (store && String(store.currentGroupId) === String(data.groupId)) {
                store.setCurrentGroupId(null);
            }
        }
    });

    // 群组成员添加事件
    socket.on('members-added', (data) => {
        // console.log('📥 [群组] 收到成员添加事件:', data);
        // 刷新群组列表
        loadGroupList();
        // 如果是当前正在查看的群组，触发事件更新成员列表
        if (data && data.groupId) {
            const store = window.chatStore;
            if (store && String(store.currentGroupId) === String(data.groupId)) {
                // 
                window.dispatchEvent(new CustomEvent('group-members-changed', { 
                    detail: { groupId: data.groupId, action: 'added', data: data } 
                }));
            }
        }
    });

    // 群组成员移除事件
    socket.on('member-removed', (data) => {
        // console.log('📥 [群组] 收到成员移除事件:', data);
        // 刷新群组列表
        loadGroupList();
        // 如果是自己被移除，清空当前群组并标记会话为已删除
        // 注意：后端发送的字段是 memberId，不是 userId
        const removedUserId = data.memberId || data.userId;
        if (data && data.groupId && removedUserId) {
            const store = window.chatStore;
            // 如果是自己被移除，标记会话为已删除
            if (store && String(store.currentUser?.id) === String(removedUserId)) {
                if (store.markGroupAsDeleted) {
                    store.markGroupAsDeleted(data.groupId, false);
                }
                // 如果当前活动群组就是这个群组，清空当前群组
                if (String(store.currentGroupId) === String(data.groupId)) {
                    store.setCurrentGroupId(null);
                }
            }
            // 如果是当前正在查看的群组，触发事件更新成员列表
            if (store && String(store.currentGroupId) === String(data.groupId)) {
                window.dispatchEvent(new CustomEvent('group-members-changed', { 
                    detail: { groupId: data.groupId, action: 'removed', data: data } 
                }));
            }
        }
    });

    // 好友添加事件
    socket.on('friend-added', async (data) => {
        // 刷新好友列表
        loadFriendsList();
        // 保存添加好友的时间到最后消息时间记录
        if (data && data.friendId) {
            const store = window.chatStore;
            if (store) {
                // 如果该好友本地已标记删除，则删除deleted_at标记，并保存好友信息
                try {
                    const userId = store.currentUser?.id || 'guest';
                    const prefix = `chats-${userId}`;
                    const key = `${prefix}-private-${data.friendId}`;
                    const existingData = await localForage.getItem(key);
                    const updatedSessionData = existingData ? { ...existingData } : { messages: [] };
                    
                    // 保存好友信息到 IndexedDB
                    if (data.nickname) updatedSessionData.nickname = data.nickname;
                    if (data.username) updatedSessionData.username = data.username;
                    if (data.avatarUrl) updatedSessionData.avatarUrl = data.avatarUrl;
                    else if (data.avatar_url) updatedSessionData.avatarUrl = data.avatar_url;
                    
                    // 移除 deleted_at 标记
                    delete updatedSessionData.deleted_at;
                    
                    await localForage.setItem(key, updatedSessionData);
                } catch (e) {
                    console.error('更新好友会话信息失败:', e);
                }
                
                if (store.friendsList) {
                    const friend = store.friendsList.find(f => String(f.id) === String(data.friendId));
                    if (friend && friend.deleted_at) {
                        delete friend.deleted_at;
                    }
                }
            }
        }
    });

    // 被添加到群组事件
    socket.on('added-to-group', async (data) => {
        // 刷新群组列表
        loadGroupList();
        // 如果该群组本地已标记删除，则删除deleted_at标记，并保存群组信息
        if (data && data.groupId) {
            const store = window.chatStore;
            if (store) {
                try {
                    const userId = store.currentUser?.id || 'guest';
                    const prefix = `chats-${userId}`;
                    const key = `${prefix}-group-${data.groupId}`;
                    const existingData = await localForage.getItem(key);
                    const updatedSessionData = existingData ? { ...existingData } : { messages: [] };
                    
                    // 保存群组信息到 IndexedDB
                    if (data.groupName) updatedSessionData.name = data.groupName;
                    if (data.groupAvatarUrl) updatedSessionData.avatarUrl = data.groupAvatarUrl;
                    
                    // 移除 deleted_at 标记
                    delete updatedSessionData.deleted_at;
                    
                    await localForage.setItem(key, updatedSessionData);
                } catch (e) {
                    console.error('更新群组会话信息失败:', e);
                }
                
                if (store.groupsList) {
                    const group = store.groupsList.find(g => String(g.id) === String(data.groupId));
                    if (group && group.deleted_at) {
                        delete group.deleted_at;
                    }
                }
            }
        }
    });

    // 好友删除事件
    socket.on('friend-removed', async (data) => {
        if (data && data.friendId) {
            const store = window.chatStore;
            
            if (store && store.markFriendAsDeleted) {
                store.markFriendAsDeleted(data.friendId);
            }
            // 清除该好友的未读私信消息记录
            if (store && store.clearPrivateUnread) {
                store.clearPrivateUnread(data.friendId);
            }
            // 如果当前打开的私信就是删除的好友，清空当前私信
            if (store && String(store.currentPrivateChatUserId) === String(data.friendId)) {
                store.setCurrentPrivateChatUserId(null);
            }
        }
    });

    // 头像更新事件
    socket.on('avatar-updated', async (data) => {
        // 刷新所有相关的头像显示
        if (data.userId && data.avatarUrl) {
            // 更新在线用户列表中的头像
            const store = window.chatStore;
            if (store && store.onlineUsers) {
                const userIndex = store.onlineUsers.findIndex(u => String(u.id) === String(data.userId));
                if (userIndex !== -1) {
                    // 更新在线用户的头像（支持 avatar、avatarUrl、avatar_url 三种字段名）
                    store.onlineUsers[userIndex].avatar = data.avatarUrl;
                    store.onlineUsers[userIndex].avatarUrl = data.avatarUrl;
                    store.onlineUsers[userIndex].avatar_url = data.avatarUrl;
                }
            }
            
            // 直接更新好友列表中的头像，而不是重新从服务器加载
            if (store && store.friendsList) {
                const friendIndex = store.friendsList.findIndex(f => String(f.id) === String(data.userId));
                if (friendIndex !== -1) {
                    // 更新好友的头像 URL（支持 avatarUrl、avatar_url、avatar 三种字段名）
                    store.friendsList[friendIndex].avatarUrl = data.avatarUrl;
                    store.friendsList[friendIndex].avatar_url = data.avatarUrl;
                    store.friendsList[friendIndex].avatar = data.avatarUrl;
                    // 触发响应式更新
                    store.friendsList = [...store.friendsList];
                }
            }
            
            // 更新所有消息列表中该用户的头像
            if (store && store.updateUserInfoInMessages) {
                store.updateUserInfoInMessages(data.userId, { avatarUrl: data.avatarUrl });
            }
            
            // 更新 IndexedDB 中的会话信息（无论好友是否已删除）
            try {
                const currentUser = getCurrentUser();
                const userIdForStorage = currentUser?.id || 'guest';
                const prefix = `chats-${userIdForStorage}`;
                const key = `${prefix}-private-${data.userId}`;
                const existingData = await localForage.getItem(key);
                if (existingData) {
                    const updatedSessionData = { ...existingData };
                    updatedSessionData.avatarUrl = data.avatarUrl;
                    await localForage.setItem(key, updatedSessionData);
                }
            } catch (e) {
                console.error('更新IndexedDB中的好友头像失败:', e);
            }
            
            // 刷新群组列表中的头像
            loadGroupList();
            // 刷新当前聊天界面中的头像
            if (currentPrivateChatUserId) {
                // 如果当前在私信聊天，刷新私信界面的头像
                const privateUserAvatar = document.querySelector('#privateChatInterface .chat-avatar img');
                if (privateUserAvatar && currentPrivateChatUserId === data.userId) {
                    // 直接使用服务器返回的完整 URL（已包含?v=参数）
                    const fullUrl = data.avatarUrl.startsWith('http') ? data.avatarUrl : `${SERVER_URL}${data.avatarUrl}`;
                    privateUserAvatar.src = fullUrl;
                }
            }
        }
    });

    // 昵称更新事件
    socket.on('nickname-updated', async (data) => {
        if (data.userId && data.nickname) {
            // 更新在线用户列表中的昵称
            const store = window.chatStore;
            if (store && store.onlineUsers) {
                const userIndex = store.onlineUsers.findIndex(u => String(u.id) === String(data.userId));
                if (userIndex !== -1) {
                    store.onlineUsers[userIndex].nickname = data.nickname;
                }
            }
            
            // 更新好友列表中的昵称
            if (store && store.friendsList) {
                const friendIndex = store.friendsList.findIndex(f => String(f.id) === String(data.userId));
                if (friendIndex !== -1) {
                    store.friendsList[friendIndex].nickname = data.nickname;
                    // 触发响应式更新
                    store.friendsList = [...store.friendsList];
                }
            }
            
            // 更新所有消息列表中该用户的昵称
            if (store && store.updateUserInfoInMessages) {
                store.updateUserInfoInMessages(data.userId, { nickname: data.nickname });
            }
            
            // 更新 IndexedDB 中的会话信息（无论好友是否已删除）
            try {
                const currentUser = getCurrentUser();
                const userIdForStorage = currentUser?.id || 'guest';
                const prefix = `chats-${userIdForStorage}`;
                const key = `${prefix}-private-${data.userId}`;
                const existingData = await localForage.getItem(key);
                if (existingData) {
                    const updatedSessionData = { ...existingData };
                    updatedSessionData.nickname = data.nickname;
                    await localForage.setItem(key, updatedSessionData);
                }
            } catch (e) {
                console.error('更新IndexedDB中的好友昵称失败:', e);
            }
            
            // 如果当前在私信聊天且是更新的用户，刷新私信界面的昵称
            if (currentPrivateChatUserId && String(currentPrivateChatUserId) === String(data.userId)) {
                const privateUserName = document.querySelector('#privateChatInterface .private-user-details h2');
                if (privateUserName) {
                    privateUserName.textContent = data.nickname;
                }
            }
        }
    });

    // 群头像更新事件
    socket.on('group-avatar-updated', async (data) => {
        if (data.groupId && data.avatarUrl) {
            const store = window.chatStore;
            
            // 更新群组列表中的头像
            if (store && store.groupsList) {
                const groupIndex = store.groupsList.findIndex(g => String(g.id) === String(data.groupId));
                if (groupIndex !== -1) {
                    store.groupsList[groupIndex].avatar_url = data.avatarUrl;
                    store.groupsList[groupIndex].avatarUrl = data.avatarUrl;
                    // 触发响应式更新
                    store.groupsList = [...store.groupsList];
                }
            }
            
            // 更新群组消息中该群组的头像（群名片等）
            if (store && store.updateGroupInfoInMessages) {
                store.updateGroupInfoInMessages(data.groupId, { avatarUrl: data.avatarUrl });
            }
            
            // 更新 IndexedDB 中的群组会话信息
            try {
                const currentUser = getCurrentUser();
                const userIdForStorage = currentUser?.id || 'guest';
                const prefix = `chats-${userIdForStorage}`;
                const key = `${prefix}-group-${data.groupId}`;
                const existingData = await localForage.getItem(key);
                if (existingData) {
                    const updatedSessionData = { ...existingData };
                    updatedSessionData.avatarUrl = data.avatarUrl;
                    await localForage.setItem(key, updatedSessionData);
                }
            } catch (e) {
                console.error('更新IndexedDB中的群组头像失败:', e);
            }
            
            // 如果当前正在该群组聊天中，更新群组信息模态框中的头像
            if (store && store.modalData && store.modalData.groupInfo && 
                String(store.modalData.groupInfo.id) === String(data.groupId)) {
                store.modalData.groupInfo.avatar_url = data.avatarUrl;
            }
        }
    });

    // IP封禁事件
    socket.on('ip-banned', async (data) => {
        console.log('🚫 您的IP已被封禁:', data);
        
        // 显示封禁提示
        let banMessage = `您的IP已被封禁\n\n原因: ${data.reason || '违反使用规则'}`;
        if (data.expiresAt) {
            const expireDate = new Date(data.expiresAt);
            banMessage += `\n\n解封时间: ${expireDate.toLocaleString('zh-CN')}`;
        } else {
            banMessage += '\n\n封禁类型: 永久封禁';
        }
        
        await modal.error(banMessage, 'IP已被封禁');
        
        // 清除本地存储
        localStorage.removeItem('currentUser');
        localStorage.removeItem('currentSessionToken');
        
        // 断开连接
        socket.disconnect();
        
        // 跳转到登录页面
        window.location.href = '/login';
    });

    // 用户封禁事件
    socket.on('user-banned', async (data) => {
        console.log('🚫 您的账户已被封禁:', data);
        
        // 显示封禁提示
        let banMessage = `您的账户已被封禁\n\n原因: ${data.reason || '违反使用规则'}`;
        if (data.expiresAt) {
            const expireDate = new Date(data.expiresAt);
            banMessage += `\n\n解封时间: ${expireDate.toLocaleString('zh-CN')}`;
        } else {
            banMessage += '\n\n封禁类型: 永久封禁';
        }
        
        await modal.error(banMessage, '账户已被封禁');
        
        // 清除本地存储
        localStorage.removeItem('currentUser');
        localStorage.removeItem('currentSessionToken');
        
        // 断开连接
        socket.disconnect();
        
        // 跳转到登录页面
        window.location.href = '/login';
    });

    // 统一加载消息事件（替代原来的三个事件）
    socket.on('messages-loaded', async (data) => {
        const store = window.chatStore;
        
        // 检查响应中是否包含新的会话令牌
        if (data.sessionToken) {
            // 更新会话令牌
            setCurrentSessionToken(data.sessionToken);
        }
        
        if (data.type === 'global') {
            // 全局聊天室消息 - 完全复刻 chat-history 事件
            if (store && data.messages) {
                if (data.loadMore && store.prependPublicMessages) {
                    store.prependPublicMessages(data.messages);
                } else if (store.setPublicMessages) {
                    store.setPublicMessages(data.messages);
                }
                
                // 检查是否加载更多时返回了空数组或消息数少于20条，标记为已全部加载
                if (data.loadMore) {
                    const isAllLoaded = !data.messages || data.messages.length < 20 || data.messages.length === 0;
                    if (isAllLoaded && store.setPublicAllLoaded) {
                        store.setPublicAllLoaded(true);
                    }
                }
            }

            if (data.groupLastMessageTimes && Object.keys(data.groupLastMessageTimes).length > 0) {
                if (window.chatStore && window.chatStore.groupsList) {
                    const userId = window.chatStore.currentUser?.id || 'guest';
                    const prefix = `chats-${userId}`;
                    
                    const groups = window.chatStore.groupsList;
                    for (const group of groups) {
                        const lastTime = data.groupLastMessageTimes[group.id];
                        if (lastTime) {
                            const time = lastTime instanceof Date ? lastTime.toISOString() : new Date(lastTime).toISOString();
                            group.last_message_time = time;
                            
                            // 保存到 IndexedDB
                            try {
                                const key = `${prefix}-group-${group.id}`;
                                const existingData = await localForage.getItem(key);
                                if (existingData) {
                                    const updatedData = { ...existingData };
                                    updatedData.last_message_time = time;
                                    await localForage.setItem(key, updatedData);
                                }
                            } catch (e) {
                                console.error('保存群组最后消息时间到IndexedDB失败:', e);
                            }
                        }
                    }
                    window.chatStore.sortGroupsByLastMessageTime();
                }
            }

            if (data.privateLastMessageTimes && Object.keys(data.privateLastMessageTimes).length > 0) {
                if (window.chatStore && window.chatStore.friendsList) {
                    const userId = window.chatStore.currentUser?.id || 'guest';
                    const prefix = `chats-${userId}`;
                    
                    const friends = window.chatStore.friendsList;
                    for (const friend of friends) {
                        const lastTime = data.privateLastMessageTimes[friend.id];
                        if (lastTime) {
                            const time = lastTime instanceof Date ? lastTime.toISOString() : new Date(lastTime).toISOString();
                            friend.last_message_time = time;
                            
                            // 保存到 IndexedDB
                            try {
                                const key = `${prefix}-private-${friend.id}`;
                                const existingData = await localForage.getItem(key);
                                if (existingData) {
                                    const updatedData = { ...existingData };
                                    updatedData.last_message_time = time;
                                    await localForage.setItem(key, updatedData);
                                }
                            } catch (e) {
                                console.error('保存好友最后消息时间到IndexedDB失败:', e);
                            }
                        }
                    }
                    window.chatStore.sortFriendsByLastMessageTime();
                }
            }

            updateUnreadCountsDisplay();
        } else if (data.type === 'group') {
            // 群组消息 - 完全复刻 group-chat-history 事件
            const groupId = data.groupId || currentGroupId;
            if (store && data.messages && groupId) {
                if (data.loadMore && store.prependGroupMessages) {
                    store.prependGroupMessages(groupId, data.messages);
                } else if (store.setGroupMessages) {
                    store.setGroupMessages(groupId, data.messages);
                }
                
                // 检查是否加载更多时返回了空数组或消息数少于20条，标记为已全部加载
                if (data.loadMore) {
                    const isAllLoaded = !data.messages || data.messages.length < 20 || data.messages.length === 0;
                    if (isAllLoaded && store.setGroupAllLoaded) {
                        store.setGroupAllLoaded(groupId, true);
                    }
                    // 同时更新 window.groupChatAllLoaded（保持兼容性）
                    if (!window.groupChatAllLoaded) {
                        window.groupChatAllLoaded = {};
                    }
                    if (isAllLoaded) {
                        window.groupChatAllLoaded[groupId] = true;
                    }
                }
            }

            // 清除该群组的未读计数，因为用户正在加载群组消息
            if (store && store.clearGroupUnread && groupId) {
                store.clearGroupUnread(groupId);
            }
            updateUnreadCountsDisplay();
        } else if (data.type === 'private') {
            // 私信消息 - 完全复刻 private-chat-history 事件
            

            let userId = data.friendId || data.userId || currentPrivateChatUserId;
            
            const currentUser = getCurrentUser();
            
            if (!userId && data.messages && data.messages.length > 0) {
                const firstMessage = data.messages[0];
                const msgSenderId = String(firstMessage.senderId);
                const msgReceiverId = String(firstMessage.receiverId);
                userId = String(currentUser.id) === msgReceiverId ? msgSenderId : msgReceiverId;
                
            }

            if (data.loadMore && userId) {
                
                if (!window.privateChatAllLoaded) {
                    window.privateChatAllLoaded = {};
                    
                }

                const isAllLoaded = !data.messages || data.messages.length < 20 || data.messages.length === 0;
                
                if (isAllLoaded) {
                    window.privateChatAllLoaded[userId] = true;
                    // 同时更新 chatStore 中的标记
                    if (store && store.setPrivateAllLoaded) {
                        store.setPrivateAllLoaded(userId, true);
                    }
                }
            }

            if (store && data.messages && userId) {
                if (data.loadMore && store.prependPrivateMessages) {
                    store.prependPrivateMessages(userId, data.messages);
                } else if (store.setPrivateMessages) {
                    store.setPrivateMessages(userId, data.messages);
                }
            }

            // 清除该私信的未读计数，因为用户正在加载私信消息
            if (store && store.clearPrivateUnread && userId) {
                store.clearPrivateUnread(userId);
            }
            updateUnreadCountsDisplay();
        }
    });

    // 聊天历史记录事件
    socket.on('chat-history', async (data) => {
        // 检查历史记录响应中是否包含新的会话令牌
        if (data.sessionToken) {
            // 更新会话令牌
            setCurrentSessionToken(data.sessionToken);
        }

        const store = window.chatStore;
        if (store && data.messages) {
            if (data.loadMore && store.prependPublicMessages) {
                store.prependPublicMessages(data.messages);
            } else if (store.setPublicMessages) {
                store.setPublicMessages(data.messages);
            }
        }

        // 处理群组最后消息时间
        if (data.groupLastMessageTimes && Object.keys(data.groupLastMessageTimes).length > 0) {
            // 更新群组列表中的最后消息时间
            if (window.chatStore && window.chatStore.groupsList) {
                const userId = window.chatStore.currentUser?.id || 'guest';
                const prefix = `chats-${userId}`;
                
                const groups = window.chatStore.groupsList;
                for (const group of groups) {
                    const lastTime = data.groupLastMessageTimes[group.id];
                    if (lastTime) {
                        // 如果是字符串时间，转换为 ISO 格式
                        const time = lastTime instanceof Date ? lastTime.toISOString() : new Date(lastTime).toISOString();
                        group.last_message_time = time;
                        
                        // 保存到 IndexedDB
                        try {
                            const key = `${prefix}-group-${group.id}`;
                            const existingData = await localForage.getItem(key);
                            if (existingData) {
                                const updatedData = { ...existingData };
                                updatedData.last_message_time = time;
                                await localForage.setItem(key, updatedData);
                            }
                        } catch (e) {
                            console.error('保存群组最后消息时间到IndexedDB失败:', e);
                        }
                    }
                }
                // 重新排序
                window.chatStore.sortGroupsByLastMessageTime();
            }
        }

        // 处理私信最后消息时间
        if (data.privateLastMessageTimes && Object.keys(data.privateLastMessageTimes).length > 0) {
            // 更新好友列表中的最后消息时间
            if (window.chatStore && window.chatStore.friendsList) {
                const userId = window.chatStore.currentUser?.id || 'guest';
                const prefix = `chats-${userId}`;
                
                const friends = window.chatStore.friendsList;
                for (const friend of friends) {
                    const lastTime = data.privateLastMessageTimes[friend.id];
                    if (lastTime) {
                        // 如果是字符串时间，转换为 ISO 格式
                        const time = lastTime instanceof Date ? lastTime.toISOString() : new Date(lastTime).toISOString();
                        friend.last_message_time = time;
                        
                        // 保存到 IndexedDB
                        try {
                            const key = `${prefix}-private-${friend.id}`;
                            const existingData = await localForage.getItem(key);
                            if (existingData) {
                                const updatedData = { ...existingData };
                                updatedData.last_message_time = time;
                                await localForage.setItem(key, updatedData);
                            }
                        } catch (e) {
                            console.error('保存好友最后消息时间到IndexedDB失败:', e);
                        }
                    }
                }
                // 重新排序
                window.chatStore.sortFriendsByLastMessageTime();
            }
        }

        // 更新未读计数显示
        updateUnreadCountsDisplay();
    });

    // 用户加入聊天室响应事件
    socket.on('user-joined-response', (data) => {
        // 检查响应中是否包含新的会话令牌
        if (data.sessionToken) {
            // 更新会话令牌
            setCurrentSessionToken(data.sessionToken);
        }

        // 从本地存储加载未读消息计数（不再依赖后端）
        const store = window.chatStore;
        if (store && store.loadUnreadMessages) {
            store.loadUnreadMessages();
        }

        // 更新未读计数显示
        updateUnreadCountsDisplay();
    });

    // 登录成功响应事件
    socket.on('login-success', (data) => {
        // 检查响应中是否包含新的会话令牌
        if (data.sessionToken) {
            // 更新会话令牌
            setCurrentSessionToken(data.sessionToken);
        }
    });

    // 连接关闭事件
    socket.on('disconnect', () => {
        
        isConnected = false;
        // 禁用消息发送功能
        disableMessageSending();
    });

    // 连接错误事件
    socket.on('error', () => {
        
        isConnected = false;
        disableMessageSending();
    });

    // 处理原始WebSocket消息
    // 服务器可能会直接发送["session-expired"]格式的消息
    socket.on('message', async (data) => {
        // 检查是否是会话过期消息
        if (Array.isArray(data) && data[0] === 'session-expired') {
            const eventData = data[1];
            await handleSessionExpired(eventData);
        }
    });

    // 会话过期事件
    socket.on('session-expired', async (eventData) => {
        await handleSessionExpired(eventData);
    });

    // 处理会话过期的公共函数
    async function handleSessionExpired(eventData) {
        // 检查是否在发送消息后 5 秒内
        const now = Date.now();
        const lastSendTime = window._lastMessageSendTime || 0;
        const isWithin5Seconds = now - lastSendTime < 5000;
        
        if (isWithin5Seconds) {
            // 重置所有消息发送计时器
            if (window._messageSendTimeouts) {
                for (const key in window._messageSendTimeouts) {
                    clearTimeout(window._messageSendTimeouts[key]);
                }
                window._messageSendTimeouts = {};
            }
        }
        
        // 检查是否有原始事件信息（无论是否在 5 秒内都要处理）
        if (eventData && eventData.originalEventName && eventData.originalEventData) {
            // 有原始事件信息，刷新 Token 后重新发送
            try {
                const refreshSuccess = await refreshTokenWithQueue(originalFetch);
                
                if (refreshSuccess) {
                    // 刷新成功，更新原始事件数据中的 token 并重新发送
                    const newToken = localStorage.getItem('currentSessionToken');
                    const newEventData = { ...eventData.originalEventData };
                    
                    // 更新 sessionToken
                    if (newToken) {
                        newEventData.sessionToken = newToken;
                    }
                    
                    // 重新发送原始事件
                    socket.emit(eventData.originalEventName, newEventData);
                } else {
                    // 刷新失败才退出登录
                    await modal.warning('您的会话已过期或在其他设备登录，请重新登录', '会话过期');
                    logout();
                }
            } catch (error) {
                console.error('刷新 Token 失败:', error);
                await modal.warning('您的会话已过期或在其他设备登录，请重新登录', '会话过期');
                logout();
            }
        } else if (!isWithin5Seconds) {
            // 没有原始事件信息且超过 5 秒，正常刷新 Token
            try {
                const refreshSuccess = await refreshTokenWithQueue(originalFetch);
                
                if (!refreshSuccess) {
                    // 刷新失败才退出登录
                    await modal.warning('您的会话已过期或在其他设备登录，请重新登录', '会话过期');
                    logout();
                }
            } catch (error) {
                console.error('刷新 Token 失败:', error);
                await modal.warning('您的会话已过期或在其他设备登录，请重新登录', '会话过期');
                logout();
            }
        }
    }

    // 账户在其他设备登录事件（顶号）
    socket.on('account-logged-in-elsewhere', async (data) => {
        await modal.warning(data.message || '您的账号在其他设备上登录，请重新登录', '账号异地登录');
        logout();
    });

    // 账户被封禁事件
    socket.on('account-banned', async (data) => {
        const message = `您的账户已被封禁\n\n${data.message || '无法访问'}`;
        await modal.error(message, '账户被封禁');
        logout();
    });

    // 消息被撤回事件 - 同时处理公共聊天和群组聊天
    socket.on('message-deleted', (data) => {
        const { messageId } = data;
        const store = getStore();
        
        if (messageId) {
            // 从 store 中删除消息
            if (store) {
                store.deletePublicMessage(messageId);
                
                // 尝试从所有群组中删除
                if (store.groupMessages) {
                    for (const groupId in store.groupMessages) {
                        store.deleteGroupMessage(groupId, messageId);
                    }
                }
            }
        }
    });
    // 监听群组名称更新事件
    socket.on('group-name-updated', async (data) => {
        // 只有登录状态才刷新群组列表
        const currentUser = getCurrentUser();
        const currentSessionToken = getCurrentSessionToken();
        if (currentUser && currentSessionToken) {
            loadGroupList();
            
            // 如果有数据并且是当前群组，更新相关状态
            if (data && data.groupId && data.newGroupName) {
                const store = window.chatStore;
                if (store && String(store.currentGroupId) === String(data.groupId)) {
                    store.currentGroupName = data.newGroupName;
                }
                
                // 更新 sessionStore
                if (sessionStore && String(sessionStore.currentGroupId) === String(data.groupId)) {
                    sessionStore.currentGroupName = data.newGroupName;
                }
                
                // 更新 DOM 元素
                const currentGroupNameElement = document.getElementById('currentGroupName');
                if (currentGroupNameElement) {
                    currentGroupNameElement.textContent = data.newGroupName;
                }
                const modalGroupName = document.getElementById('modalGroupName');
                if (modalGroupName) {
                    modalGroupName.textContent = `${data.newGroupName} - 群组信息`;
                }
                
                // 更新 IndexedDB 中的群组会话信息
                try {
                    const userIdForStorage = currentUser?.id || 'guest';
                    const prefix = `chats-${userIdForStorage}`;
                    const key = `${prefix}-group-${data.groupId}`;
                    const existingData = await localForage.getItem(key);
                    if (existingData) {
                        const updatedSessionData = { ...existingData };
                        updatedSessionData.name = data.newGroupName;
                        await localForage.setItem(key, updatedSessionData);
                    }
                } catch (e) {
                    console.error('更新IndexedDB中的群组名称失败:', e);
                }
            }
        }
    });

    // 监听群组公告更新事件
    socket.on('group-description-updated', (data) => {
        // 只有登录状态才刷新群组列表
        const currentUser = getCurrentUser();
        const currentSessionToken = getCurrentSessionToken();
        if (currentUser && currentSessionToken) {
            loadGroupList();

            // 如果当前正在查看该群组的信息模态框，更新公告显示
            const modal = document.getElementById('groupInfoModal');
            if (modal && modal.style.display === 'flex') {
                const modalGroupNoticeValue = document.getElementById('modalGroupNoticeValue');
                if (modalGroupNoticeValue) {
                    modalGroupNoticeValue.textContent = data.newDescription ? data.newDescription : '暂无群组公告';
                }
            }
        }
    });

    // 私信消息发送确认事件 - 根据确认事件渲染消息
    socket.on('private-message-sent', (data) => {
        // 检查是否包含完整的消息数据
        if (data.message && data.messageId) {
            const confirmedMessage = data.message;
            
            // 标记为实时消息
            confirmedMessage.isHistory = false;
            
            const store = window.chatStore;
            
            // 更新对应的 minId
            if (confirmedMessage.id && store && store.privateMinId !== undefined) {
                if (confirmedMessage.id > store.privateMinId) {
                    store.privateMinId = confirmedMessage.id;
                    if (store.saveMinIds) {
                        store.saveMinIds();
                    }
                }
            }
            
            // 添加确认后的私信消息到 store
            if (store && store.addPrivateMessage) {
                const currentPrivateUserId = sessionStore.currentPrivateChatUserId;
                if (currentPrivateUserId) {
                    store.addPrivateMessage(currentPrivateUserId, confirmedMessage);
                }
            }
            
            // 更新好友最后消息
            if (store && store.updateFriendLastMessage) {
                const currentPrivateUserId = sessionStore.currentPrivateChatUserId;
                if (currentPrivateUserId) {
                    store.updateFriendLastMessage(currentPrivateUserId, confirmedMessage);
                }
            }
            
            // 将私信好友移到列表顶部
            if (store && store.moveFriendToTop) {
                const currentPrivateUserId = sessionStore.currentPrivateChatUserId;
                if (currentPrivateUserId) {
                    store.moveFriendToTop(currentPrivateUserId);
                }
            }
            
            // 清空私信草稿
            if (store && store.clearDraft) {
                const currentPrivateUserId = sessionStore.currentPrivateChatUserId;
                if (currentPrivateUserId) {
                    store.clearDraft('private', currentPrivateUserId);
                }
            }
        }
    });

    // 私信消息接收事件
    socket.on('private-message-received', (message) => {
        // 检查消息中是否包含新的会话令牌
        if (message.sessionToken) {
            // 更新会话令牌
            setCurrentSessionToken(message.sessionToken);
        }

        // 检查是否是类型101撤回消息
        if (message.messageType === 101) {
            const messageIdToDelete = message.content;
            const store = window.chatStore;
            const currentUser = getCurrentUser();
            if (store && messageIdToDelete) {
                // 确定聊天对象ID
                const msgSenderId = String(message.senderId);
                const msgReceiverId = String(message.receiverId);
                const chatPartnerId = String(currentUser.id) === msgReceiverId ? msgSenderId : msgReceiverId;
                
                // 从该私信会话中删除消息
                store.deletePrivateMessage(chatPartnerId, messageIdToDelete);
                // 添加101撤回消息
                store.addPrivateMessage(chatPartnerId, message);
                // 注意：在线101撤回消息不更新 minId，避免导致minId过大
                // 只有通过拉取离线消息接口获得的101消息才会处理minId
            }
            return;
        }
        
        // 检查是否是类型103已读回执消息
        if (message.messageType === 103) {
            const store = window.chatStore;
            const currentUser = getCurrentUser();
            console.log('[103消息] 收到在线103已读回执消息', message);
            if (store) {
                // 确定聊天对象ID
                const msgSenderId = String(message.senderId);
                const msgReceiverId = String(message.receiverId);
                const chatPartnerId = String(currentUser.id) === msgReceiverId ? msgSenderId : msgReceiverId;
                
                // 获取已读的最后一条消息ID
                const readMessageId = message.content;
                console.log('[103消息] chatPartnerId:', chatPartnerId, 'readMessageId:', readMessageId);
                
                // 更新该会话中自己发送的消息的已读状态
                if (store.updatePrivateMessagesReadStatus) {
                    console.log('[103消息] 开始调用 updatePrivateMessagesReadStatus');
                    store.updatePrivateMessagesReadStatus(chatPartnerId, readMessageId);
                }
                
                // 添加103已读回执消息到IndexedDB（但不加入store）
                console.log('[103消息] 添加到IndexedDB');
                store.addPrivateMessage(chatPartnerId, message);
            }
            return;
        }
        
        // 标记为实时消息
        message.isHistory = false;

        // 检查消息是否是当前聊天对象的消息，使用字符串比较确保类型一致
        const msgSenderId = String(message.senderId);
        const msgReceiverId = String(message.receiverId);
        const currentUser = getCurrentUser();
        
        // 确定聊天对象ID（无论收到还是发送消息，聊天对象都是对方）
        const chatPartnerId = String(currentUser.id) === msgReceiverId ? msgSenderId : msgReceiverId;

        // 定义一些变量在后面使用
        const isOwnMessage = String(currentUser.id) === String(msgSenderId);
        const isWithdrawMessage = message.messageType === 101;
        const isReadReceiptMessage = message.messageType === 103;

        // 如果当前正在该私信聊天中，自动将好友移到列表顶部
        // 条件：页面可见 + 当前聊天是私聊页面 + 消息是当前私聊对象发来的
        const store = window.chatStore;
        const pageVisible = !document.hidden && document.hasFocus();
        
        if (message.id && store && store.privateMinId !== undefined) {
            if (message.id > store.privateMinId) {
                store.privateMinId = message.id;
                if (store.saveMinIds) {
                    store.saveMinIds();
                }
            }
        }
        
        if (pageVisible && currentActiveChat === `private_${chatPartnerId}`) {
            if (store && store.moveFriendToTop) {
                store.moveFriendToTop(chatPartnerId);
            }
        }

        // 更新好友最后消息时间并重新排序（排除101和103消息）
        if (store && store.friendsList && !isWithdrawMessage && !isReadReceiptMessage) {
            const friend = store.friendsList.find(f => String(f.id) === String(chatPartnerId));
            if (friend) {
                const newTime = new Date(message.timestamp || Date.now()).toISOString();
                friend.last_message_time = newTime;
                friend.lastMessage = message;
                store.sortFriendsByLastMessageTime();
            }
        }

        if (store && store.addPrivateMessage) {
            store.addPrivateMessage(chatPartnerId, message);
        }

        // 更新未读计数
        // 如果页面不可见，或者用户不在当前私信聊天中，或者浏览器没有焦点，添加未读计数
        // 排除自己发送的消息，排除101撤回消息和103已读回执消息
        const isPageInvisible = document.hidden;
        const isBrowserNotFocused = !document.hasFocus();
        const isCurrentPrivateChat = currentActiveChat === `private_${chatPartnerId}`;
        
        // 只有在当前私信聊天且浏览器有焦点且页面可见时，才不增加未读计数
        // 同时排除撤回消息和已读回执消息
        const shouldAddPrivateUnread = !isOwnMessage && !isWithdrawMessage && !isReadReceiptMessage && !(isCurrentPrivateChat && !isPageInvisible && !isBrowserNotFocused);
        
        if (shouldAddPrivateUnread) {
            // 更新未读消息计数 - 使用 chatPartnerId 作为键
            if (store && store.incrementPrivateUnread) {
                store.incrementPrivateUnread(chatPartnerId);
            }
            updateUnreadCountsDisplay();
        } else if (!isOwnMessage && !isWithdrawMessage && !isReadReceiptMessage && isCurrentPrivateChat && !isPageInvisible && !isBrowserNotFocused) {
            // 用户正在当前私信聊天中且页面可见且浏览器有焦点，自动发送已读事件
            sendReadMessageEvent('private', { friendId: chatPartnerId });
        }
        
        // 如果用户当前正在该私信聊天中且浏览器有焦点且页面可见，自动清除未读
        if (isCurrentPrivateChat && !isPageInvisible && !isBrowserNotFocused && !isOwnMessage && !isWithdrawMessage && !isReadReceiptMessage) {
            // 清除私信未读计数
            if (store && store.clearPrivateUnread) {
                store.clearPrivateUnread(chatPartnerId);
            }
            updateUnreadCountsDisplay();
        }
    });

    // 私信消息已读事件
    socket.on('private-message-read', async (data) => {
        if (!data || !data.fromUserId || !data.friendId) return;
        
        const store = getStore();
        // fromUserId: 读消息的人（对方）
        // friendId: 收到已读事件的人（自己）
        const readerId = data.fromUserId;
        const myId = data.friendId;
        
        // 更新自己发给对方的消息为已读
        // 私信消息存储在 privateMessages[对方ID] 中
        let hasUpdates = false;
        if (store && store.privateMessages && store.privateMessages[readerId]) {
            const messages = store.privateMessages[readerId];
            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                // 自己发送的消息（senderId === myId）且接收者是对方（receiverId === readerId）
                if (String(msg.senderId) === String(myId) && String(msg.receiverId) === String(readerId)) {
                    if (msg.isRead !== 1) {
                        messages[i] = { ...msg, isRead: 1 };
                        hasUpdates = true;
                    }
                }
            }
            // 触发响应式更新
            if (hasUpdates) {
                store.privateMessages[readerId] = [...messages];
            }
        }
        
        // 更新 IndexedDB 中的消息
        if (hasUpdates && store && store.getStorageKeyPrefix) {
            try {
                const prefix = store.getStorageKeyPrefix();
                const key = `${prefix}-private-${readerId}`;
                const existingData = await localForage.getItem(key);
                if (existingData && existingData.messages) {
                    const dbMessages = existingData.messages;
                    let dbHasUpdates = false;
                    for (let i = 0; i < dbMessages.length; i++) {
                        const msg = dbMessages[i];
                        if (String(msg.senderId) === String(myId) && String(msg.receiverId) === String(readerId)) {
                            if (msg.isRead !== 1) {
                                dbMessages[i] = { ...msg, isRead: 1 };
                                dbHasUpdates = true;
                            }
                        }
                    }
                    if (dbHasUpdates) {
                        await localForage.setItem(key, { ...existingData, messages: dbMessages });
                    }
                }
            } catch (e) {
                console.error('更新IndexedDB中的私信已读状态失败:', e);
            }
        }
    });

    // 好友列表更新事件
    socket.on('friend-list-updated', () => {
        // 更新好友列表
        loadFriendsList();
    });

    // 私信消息撤回事件
    socket.on('private-message-withdrawn', (data) => {
        if (!data || !data.messageId) return;

        const store = getStore();
        
        // 移除被撤回的消息 - DOM
        const messageElement = document.querySelector(`#privateMessageContainer [data-id="${data.messageId}"]`);
        if (messageElement) {
            messageElement.remove();
        }

        // 从 store 中删除私信消息
        if (store && store.deletePrivateMessage) {
            // 尝试从所有私信会话中删除
            if (store.privateMessages) {
                for (const userId in store.privateMessages) {
                    store.deletePrivateMessage(userId, data.messageId);
                }
            }
        }
    });

    // 保存socket实例
    window.chatSocket = socket;
    // 暴露发送已读消息事件函数到window
    window.sendReadMessageEvent = sendReadMessageEvent;

    // 统一加载消息函数（支持全局、群组、私信）
    window.loadMessages = function(type, options = {}) {
        if (!window.chatSocket) return;
        const currentUser = getCurrentUser();
        const currentSessionToken = getCurrentSessionToken();
        
        const data = {
            type: type,
            userId: currentUser.id,
            sessionToken: currentSessionToken,
            limit: options.limit || 20,
            loadMore: options.loadMore || false
        };
        
        if (options.olderThan) {
            data.olderThan = options.olderThan;
        }
        
        if (type === 'group' && options.groupId) {
            data.groupId = options.groupId;
        }
        
        if (type === 'private' && options.friendId) {
            data.friendId = options.friendId;
        }
        
        window.chatSocket.emit('load-messages', data);
    };

    // 创建集中化的模态框管理器
    const ModalManager = {
        // 初始化模态框管理器
        init: function() {
            this.initCreateGroupModal();
            this.initGroupInfoModal();
            this.initAddGroupMemberModal();
        },

        // 显示模态框
        showModal: function(modalId) {
            const modalName = getModalNameFromId(modalId);
            if (modalName && window.openModal) {
                window.openModal(modalName);
            } else {
                // 回退到原来的方法
                const modal = document.getElementById(modalId);
                if (modal) {
                    modal.style.display = 'flex';
                    modal.style.justifyContent = 'center';
                    modal.style.alignItems = 'center';
                    modal.style.zIndex = '1000';
                    document.body.style.overflow = 'hidden';

                    // 如果是创建群组模态框，加载成员列表
                    if (modalId === 'createGroupModal') {
                        this.loadAvailableMembers();
                    }
                }
            }
        },

        // 隐藏模态框
        hideModal: function(modalId) {
            const modalName = getModalNameFromId(modalId);
            if (modalName && window.closeModal) {
                window.closeModal(modalName);
            } else {
                // 回退到原来的方法
                const modal = document.getElementById(modalId);
                if (modal) {
                    modal.style.display = 'none';
                    document.body.style.overflow = '';
                }
            }
        },

        // 初始化创建群组模态框
        initCreateGroupModal: function() {
            const modalId = 'createGroupModal';
            const closeButtons = [
                document.getElementById('closeCreateGroupModal'),
                document.getElementById('cancelCreateGroup')
            ];

            // 绑定关闭按钮事件
            closeButtons.forEach(button => {
                if (button) {
                    button.addEventListener('click', () => {
                        this.hideModal(modalId);
                    });
                }
            });

            // 点击模态框外部关闭
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        this.hideModal(modalId);
                    }
                });
            }

            // 绑定创建群组按钮事件
            const createGroupButton = document.getElementById('createGroupButton');
            if (createGroupButton) {
                createGroupButton.addEventListener('click', () => {

                    this.showModal(modalId);
                    this.loadAvailableMembers();
                });
            }

            // 确保模态框显示时加载成员列表
            if (modal) {
                modal.addEventListener('show', () => {

                    this.loadAvailableMembers();
                });
            }

            // 绑定表单提交事件
            this.bindCreateGroupSubmit();
        },

        // 初始化群组信息模态框
        initGroupInfoModal: function() {
            const modalId = 'groupInfoModal';
            const closeButtons = [
                document.getElementById('closeGroupInfoModal'),
                document.getElementById('modalCloseButton')
            ];

            // 绑定关闭按钮事件
            closeButtons.forEach(button => {
                if (button) {
                    button.addEventListener('click', () => {
                        this.hideModal(modalId);
                    });
                }
            });

            // 点击模态框外部关闭
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        this.hideModal(modalId);
                    }
                });
            }
        },

        // 初始化添加群组成员模态框
        initAddGroupMemberModal: function() {
            const modalId = 'addGroupMemberModal';
            const closeButtons = [
                document.getElementById('closeAddGroupMemberModal'),
                document.getElementById('cancelAddMembers')
            ];

            // 绑定关闭按钮事件
            closeButtons.forEach(button => {
                if (button) {
                    button.addEventListener('click', () => {
                        this.hideModal(modalId);
                        hideAddGroupMemberModal();
                    });
                }
            });

            // 点击模态框外部关闭
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        this.hideModal(modalId);
                        hideAddGroupMemberModal();
                    }
                });
            }

            // 绑定确认添加成员按钮事件
            const confirmAddMembersBtn = document.getElementById('confirmAddMembers');
            if (confirmAddMembersBtn) {
                confirmAddMembersBtn.addEventListener('click', confirmAddGroupMembers);
            }
        },

        // 加载可用成员列表（只显示好友）
        loadAvailableMembers: function() {
            const currentUser = getCurrentUser();
            const currentSessionToken = getCurrentSessionToken();
            const groupMembersList = document.getElementById('groupMembersList');
            if (!groupMembersList) return;

            // 显示加载状态
            groupMembersList.innerHTML = '<div class="loading-members">正在加载好友列表...</div>';

            // 检查用户是否已登录
            if (!currentUser || !currentSessionToken) {
                groupMembersList.innerHTML = '<div class="loading-members">请先登录</div>';
                return;
            }

            // 获取好友列表
            fetch(`${SERVER_URL}/api/user/friends`, {
                headers: {
                    'user-id': currentUser.id,
                    'session-token': currentSessionToken
                }
            })
                .then(response => response.json())
                .then(data => {
                    let friends = [];
                    if (data.status === 'success' && data.friends) {
                        friends = data.friends;
                    } else {
                        console.error('Failed to get friends:', data.message || 'Unknown error');
                    }

                    // 过滤掉当前用户，只显示其他好友
                    const availableMembers = friends.filter(friend => friend.id !== currentUser.id);

                    // 显示成员列表
                    if (availableMembers.length === 0) {
                        groupMembersList.innerHTML = '<div class="loading-members">没有可用的好友</div>';
                    } else {
                        groupMembersList.innerHTML = availableMembers.map(friend => `
                        <div class="member-item">
                            <input type="checkbox" class="member-checkbox" id="member-${friend.id}" value="${friend.id}">
                            <label for="member-${friend.id}" class="member-nickname">${friend.nickname || friend.username}</label>
                        </div>
                    `).join('');
                    }
                })
                .catch(_error => {
                    console.error('Error loading friends:', _error);
                    groupMembersList.innerHTML = '<div class="loading-members">加载好友列表失败</div>';
                });
        },

        // 绑定创建群组表单提交事件
        bindCreateGroupSubmit: function() {
            const submitButton = document.getElementById('submitCreateGroup');
            if (submitButton) {
                submitButton.addEventListener('click', () => {
                    this.handleCreateGroupSubmit();
                });
            }
        },

        // 处理创建群组表单提交
        handleCreateGroupSubmit: function() {
            const currentUser = getCurrentUser();
            const currentSessionToken = getCurrentSessionToken();
            const newGroupNameInput = document.getElementById('newGroupName');
            const newGroupDescriptionInput = document.getElementById('newGroupDescription');
            const createGroupMessage = document.getElementById('createGroupMessage');

            const groupName = newGroupNameInput.value.trim();
            const groupDescription = newGroupDescriptionInput.value.trim();

            // 获取选中的成员ID
            const selectedMemberCheckboxes = document.querySelectorAll('.member-checkbox:checked');
            const selectedMemberIds = Array.from(selectedMemberCheckboxes).map(checkbox => checkbox.value);

            // 验证表单
            if (!groupName) {
                if (createGroupMessage) {
                    createGroupMessage.textContent = '群组名称不能为空';
                    createGroupMessage.className = 'create-group-message error';
                }
                return;
            }

            // 取消最小成员限制，允许1人创建群组
            if (selectedMemberIds.length < 0) {
                if (createGroupMessage) {
                    createGroupMessage.textContent = '请选择成员';
                    createGroupMessage.className = 'create-group-message error';
                }
                return;
            }

            // 隐藏错误消息
            if (createGroupMessage) {
                createGroupMessage.textContent = '';
                createGroupMessage.className = 'create-group-message';
            }

            // 使用fetch API创建群组
            fetch(`${SERVER_URL}/api/create-group`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'user-id': currentUser.id,
                    'session-token': currentSessionToken
                },
                body: JSON.stringify({
                    userId: currentUser.id,
                    groupName: groupName,
                    description: groupDescription,
                    memberIds: selectedMemberIds
                })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        if (createGroupMessage) {
                            createGroupMessage.textContent = '群组创建成功';
                            createGroupMessage.className = 'create-group-message success';
                        }

                        // 重新加载群组列表
                        loadGroupList();

                        // 1秒后关闭模态框
                        setTimeout(() => {
                            this.hideModal('createGroupModal');
                        }, 1000);
                    } else {
                        if (createGroupMessage) {
                            createGroupMessage.textContent = data.message || '群组创建失败';
                            createGroupMessage.className = 'create-group-message error';
                        }
                    }
                })
                .catch(() => {
                    if (createGroupMessage) {
                        createGroupMessage.textContent = '创建群组失败，网络错误';
                        createGroupMessage.className = 'create-group-message error';
                    }
                });
        }
    };

    // 初始化模态框管理器
    ModalManager.init();
    // 将ModalManager实例赋值给window对象，方便其他函数访问
    window.ModalManager = ModalManager;

    // 图片预览功能
    window.openImagePreview = function(imageUrl) {
        const modal = document.getElementById('imagePreviewModal');
        const imgElement = document.getElementById('previewImgElement');
        const closeBtn = document.getElementById('closeImagePreviewModal');

        if (modal && imgElement) {
            // 先检查模态框是否已经打开，如果是则先关闭
            if (modal.style.display === 'flex') {
                closeImagePreviewModal();
            }

            imgElement.src = imageUrl;
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        // 关闭按钮事件
        if (closeBtn) {
            // 先移除可能存在的事件监听器，避免重复绑定
            closeBtn.removeEventListener('click', closeImagePreviewModal);
            closeBtn.addEventListener('click', closeImagePreviewModal);
        } else {
            // 如果关闭按钮不存在，创建一个
            if (modal) {
                const closeBtnContainer = document.createElement('div');
                closeBtnContainer.id = 'closeImagePreviewModal';
                closeBtnContainer.style.position = 'absolute';
                closeBtnContainer.style.top = '10px';
                closeBtnContainer.style.right = '10px';
                closeBtnContainer.style.width = '30px';
                closeBtnContainer.style.height = '30px';
                closeBtnContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                closeBtnContainer.style.color = 'white';
                closeBtnContainer.style.borderRadius = '50%';
                closeBtnContainer.style.display = 'flex';
                closeBtnContainer.style.justifyContent = 'center';
                closeBtnContainer.style.alignItems = 'center';
                closeBtnContainer.style.cursor = 'pointer';
                closeBtnContainer.style.zIndex = '1001';
                closeBtnContainer.textContent = '×';
                closeBtnContainer.style.fontSize = '20px';
                closeBtnContainer.style.fontWeight = 'bold';
                
                // 检查模态框中是否已经有关闭按钮
                const existingCloseBtn = modal.querySelector('#closeImagePreviewModal');
                if (!existingCloseBtn) {
                    modal.appendChild(closeBtnContainer);
                }
                
                // 为新创建的关闭按钮添加事件监听器
                closeBtnContainer.addEventListener('click', closeImagePreviewModal);
            }
        }

        // 点击模态框背景关闭
        if (modal) {
            // 先移除可能存在的事件监听器，避免重复绑定
            modal.removeEventListener('click', handleModalBackgroundClick);
            modal.addEventListener('click', handleModalBackgroundClick);
        }
    };

    // 关闭图片预览模态框
    function closeImagePreviewModal() {
        const modal = document.getElementById('imagePreviewModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    // 处理模态框背景点击
    function handleModalBackgroundClick(e) {
        const modal = document.getElementById('imagePreviewModal');
        if (e.target === modal) {
            closeImagePreviewModal();
        }
    }

    // 直接为关闭按钮添加事件监听器，确保即使不通过openImagePreview打开也能工作
    const closeBtn = document.getElementById('closeImagePreviewModal');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeImagePreviewModal);
    }

    // 直接为模态框添加背景点击事件监听器
    const imagePreviewModal = document.getElementById('imagePreviewModal');
    if (imagePreviewModal) {
        imagePreviewModal.addEventListener('click', handleModalBackgroundClick);
    }

    // 为所有已存在的图片添加点击事件
    function addImageClickEvents() {
        const images = document.querySelectorAll('.message-image');
        images.forEach(img => {
            if (!img.hasAttribute('data-click-added')) {
                img.addEventListener('click', () => {
                    const src = img.getAttribute('src');
                    if (src) {
                        openImagePreview(src);
                    }
                });
                img.setAttribute('data-click-added', 'true');
            }
        });
    }

    // 为所有已存在的代码块复制按钮添加点击事件
    function addCopyButtonEvents() {
        const copyButtons = document.querySelectorAll('.copy-button');
        copyButtons.forEach(button => {
            if (!button.hasAttribute('data-click-added')) {
                button.addEventListener('click', () => {
                    const code = decodeURIComponent(button.getAttribute('data-code'));
                    navigator.clipboard.writeText(code).then(() => {
                        // 显示复制成功提示
                        const copyNotice = button.parentElement.querySelector('.copy-notice');
                        if (copyNotice) {
                            copyNotice.textContent = '已复制';
                            copyNotice.style.color = '#4CAF50';
                            setTimeout(() => {
                                copyNotice.textContent = '';
                            }, 2000);
                        }
                    }).catch(err => {
                        console.error('复制失败:', err);
                    });
                });
                button.setAttribute('data-click-added', 'true');
            }
        });
    }

    // 初始调用一次
    addImageClickEvents();
    addCopyButtonEvents();

    // 监听新图片和代码块添加，动态绑定点击事件
    const messageContainer = document.getElementById('messageContainer');
    if (messageContainer) {
        const observer = new MutationObserver(() => {
            addImageClickEvents();
            addCopyButtonEvents();
        });
        observer.observe(messageContainer, { childList: true, subtree: true });
    }

    // 监听群组消息容器
    const groupMessageContainer = document.getElementById('groupMessageContainer');
    if (groupMessageContainer) {
        const groupObserver = new MutationObserver(() => {
            addImageClickEvents();
            addCopyButtonEvents();
        });
        groupObserver.observe(groupMessageContainer, { childList: true, subtree: true });
    }

    // 监听私信消息容器
    const privateMessageContainer = document.getElementById('privateMessageContainer');
    if (privateMessageContainer) {
        const privateObserver = new MutationObserver(() => {
            addImageClickEvents();
            addCopyButtonEvents();
        });
        privateObserver.observe(privateMessageContainer, { childList: true, subtree: true });
    }
}

// ============================================
// WebSocket 连接管理辅助函数
// 包含消息发送启用/禁用、用户/IP状态检查、离线用户管理
// ============================================

/**
 * 启用消息发送功能（启用输入框和按钮）
 */
function enableMessageSending() {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const imageUploadButton = document.getElementById('imageUploadButton');
    const fileUploadButton = document.getElementById('fileUploadButton');

    if (messageInput) {
        messageInput.removeAttribute('disabled');
        messageInput.placeholder = '输入消息...';
    }

    if (sendButton) {
        sendButton.removeAttribute('disabled');
    }

    if (imageUploadButton) {
        imageUploadButton.removeAttribute('disabled');
    }

    if (fileUploadButton) {
        fileUploadButton.removeAttribute('disabled');
    }

    // 启用群组消息发送功能
    const groupMessageInput = document.getElementById('groupMessageInput');
    const sendGroupMessageBtn = document.getElementById('sendGroupMessage');
    const groupImageUploadButton = document.getElementById('groupImageUploadButton');
    const groupFileUploadButton = document.getElementById('groupFileUploadButton');

    if (groupMessageInput) {
        groupMessageInput.removeAttribute('disabled');
        groupMessageInput.placeholder = '输入群组消息...';
    }

    if (sendGroupMessageBtn) {
        sendGroupMessageBtn.removeAttribute('disabled');
    }

    if (groupImageUploadButton) {
        groupImageUploadButton.removeAttribute('disabled');
    }

    if (groupFileUploadButton) {
        groupFileUploadButton.removeAttribute('disabled');
    }
}

/**
 * 禁用消息发送功能（禁用输入框和按钮）
 */
function disableMessageSending() {
    // 只有当用户未登录时才禁用消息发送功能
    // 已登录用户即使WebSocket连接暂时断开，也应该保持输入框可用
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();
    if (!currentUser || !currentSessionToken) {
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const imageUploadButton = document.getElementById('imageUploadButton');
        const fileUploadButton = document.getElementById('fileUploadButton');

        if (messageInput) {
            messageInput.setAttribute('disabled', 'disabled');
            messageInput.placeholder = '请先登录';
        }

        if (sendButton) {
            sendButton.setAttribute('disabled', 'disabled');
        }

        if (imageUploadButton) {
            imageUploadButton.setAttribute('disabled', 'disabled');
        }

        if (fileUploadButton) {
            fileUploadButton.setAttribute('disabled', 'disabled');
        }

        // 禁用群组消息发送功能
        const groupMessageInput = document.getElementById('groupMessageInput');
        const sendGroupMessageBtn = document.getElementById('sendGroupMessage');
        const groupImageUploadButton = document.getElementById('groupImageUploadButton');
        const groupFileUploadButton = document.getElementById('groupFileUploadButton');

        if (groupMessageInput) {
            groupMessageInput.setAttribute('disabled', 'disabled');
            groupMessageInput.placeholder = '请先登录';
        }

        if (sendGroupMessageBtn) {
            sendGroupMessageBtn.setAttribute('disabled', 'disabled');
        }

        if (groupImageUploadButton) {
            groupImageUploadButton.setAttribute('disabled', 'disabled');
        }

        if (groupFileUploadButton) {
            groupFileUploadButton.setAttribute('disabled', 'disabled');
        }
    }
}

/**
 * 检查用户和IP状态（是否封禁、用户是否存在）
 * @param {Function} callback - 回调函数，参数为是否允许继续
 * @returns {Promise<boolean>} - 返回 Promise，表示是否允许继续
 */
async function checkUserAndIPStatus(callback) {
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();
    // 构建请求头，包含会话令牌
    const headers = {
        'Content-Type': 'application/json'
    };
    
    // 如果有会话令牌，添加到请求头中
    if (currentSessionToken) {
        headers['session-token'] = currentSessionToken;
    }
    
    try {
        const response = await fetch(`${SERVER_URL}/api/check-status`, {
            method: 'GET',
            headers: headers
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误! 状态码: ${response.status}`);
        }
        
        const data = await response.json();

        // 检查IP是否被封禁，根据后端返回的isBanned字段判断
        if (data.isBanned) {
            const message = `您的IP已被封禁，${data.message || '无法访问'}`;
            toast.error(message);
            logout();
            if (callback) callback(false);
            return false;
        }

        // 如果有用户登录，检查用户是否仍然存在
        if (currentUser && !data.userExists) {
            toast.error('您的账户可能已被删除或禁用，请联系管理员。');
            logout();
            if (callback) callback(false);
            return false;
        }

        // 检查通过
        if (callback) callback(true);
        return true;
    } catch (err) {
        // 检查失败时，允许继续连接（容错处理）
        if (callback) callback(true);
        return true;
    }
}

// 断开 WebSocket 连接
function disconnectWebSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
        isConnected = false;
        console.log('✅ WebSocket 连接已断开');
    }
}

// 发送已读消息事件
function sendReadMessageEvent(type, options = {}) {
    if (!socket) {
        console.warn('WebSocket 未连接，无法发送已读消息事件');
        return;
    }

    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();

    if (!currentUser || !currentSessionToken) {
        console.warn('用户未登录，无法发送已读消息事件');
        return;
    }

    const data = {
        type: type,
        userId: currentUser.id,
        sessionToken: currentSessionToken
    };

    if (type === 'private' && options.friendId) {
        data.friendId = options.friendId;
    } else if (type === 'group' && options.groupId) {
        data.groupId = options.groupId;
    }

    socket.emit('message-read', data);
}

export {
  initializeWebSocket,
  enableMessageSending,
  disableMessageSending,
  checkUserAndIPStatus,
  disconnectWebSocket,
  isConnected,
  avatarVersions,
  sendReadMessageEvent
};