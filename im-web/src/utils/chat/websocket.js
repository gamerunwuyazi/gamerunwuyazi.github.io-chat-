import { SERVER_URL, io, toast, getModalNameFromId } from './config.js';
import { 
  getStore, 
  unreadMessages,
  sessionStore,
  setCurrentSessionToken
} from './store.js';
import { unescapeHtml } from './message.js';
import { 
  updateUnreadCountsDisplay, 
  updateTitleWithUnreadCount, 
  currentUser, 
  currentSessionToken, 
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
import { refreshToken } from './ui.js';

let isConnected = false;
let avatarVersions = {};
let tokenRefreshTimer = null;

function startTokenRefreshTimer() {
    if (tokenRefreshTimer) {
        clearInterval(tokenRefreshTimer);
    }
    
    tokenRefreshTimer = setInterval(async () => {
        if (currentUser && localStorage.getItem('refreshToken')) {
            await refreshToken();
        }
    }, 19 * 60 * 1000 + 30 * 1000);
}

function updateUserList(users) {
  if (!Array.isArray(users)) {
    console.error('Invalid users data:', users);
    users = [];
  }

  const store = getStore();
  if (store) {
    const currentUserId = store.currentUser?.id;
    
    const onlineUsers = users.filter(u => u.isOnline !== false);
    // 离线用户列表过滤掉当前用户
    const offlineUsers = users.filter(u => u.isOnline === false && String(u.id) !== String(currentUserId));
    store.onlineUsers = onlineUsers;
    store.offlineUsers = offlineUsers;
  }
}

// 保存 socket 实例以便断开连接
let socket = null;
let isTokenRefreshing = false;
let tokenRefreshPromise = null;

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

        // 如果正在刷新 Token，等待刷新完成
        if (isTokenRefreshing && tokenRefreshPromise) {
            await tokenRefreshPromise;
        }

        // 登录后先检查IP和用户状态，然后再加入聊天室
        if (currentUser && currentSessionToken) {
            checkUserAndIPStatus((canProceed) => {
                if (canProceed) {
                    // 检查通过，发送user-joined事件进行认证和加入聊天，但不依赖它获取历史消息
                    // 确保发送的数据格式正确，特别是avatarUrl字段
                    // 安全处理userId，避免undefined错误
                    // 支持多种头像URL字段名：avatarUrl、avatar_url和avatar
                    let avatarUrl = '';
                    if (currentUser.avatarUrl && typeof currentUser.avatarUrl === 'string') {
                        avatarUrl = currentUser.avatarUrl.trim();
                    } else if (currentUser.avatar_url && typeof currentUser.avatar_url === 'string') {
                        avatarUrl = currentUser.avatar_url.trim();
                    } else if (currentUser.avatar && typeof currentUser.avatar === 'string') {
                        avatarUrl = currentUser.avatar.trim();
                    }

                    const joinedData = {
                        userId: currentUser.id ? String(currentUser.id) : null,
                        nickname: currentUser.nickname,
                        avatarUrl: avatarUrl || null,
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
        
        // 启动 Token 刷新定时器
        if (currentUser && localStorage.getItem('refreshToken')) {
            startTokenRefreshTimer();
        }
    });

    // 重连事件 - 注意：Socket.io 3.x+ 需要使用 socket.io.on 捕获重连事件
    // 重连时会自动触发 socket.on('connect')，所以这里只需要刷新 Token
    // 并设置标志让 connect 事件等待 Token 刷新完成
    socket.io.on('reconnect', async () => {
        // 重连时刷新 Token
        if (currentUser && localStorage.getItem('refreshToken')) {
            isTokenRefreshing = true;
            tokenRefreshPromise = refreshToken();
            await tokenRefreshPromise;
            isTokenRefreshing = false;
            tokenRefreshPromise = null;
        }
    });

    // 断开连接事件
    socket.on('disconnect', () => {
        
        isConnected = false;
        // 禁用消息发送功能
        disableMessageSending();
    });

    // 接收消息事件
    socket.on('message-received', (message) => {
        // 检查消息中是否包含新的会话令牌
        if (message.sessionToken) {
            // 更新会话令牌
            setCurrentSessionToken(message.sessionToken);
        }

        const store = window.chatStore;
        const isPageVisible = window.isPageVisible !== false;
        const isBrowserFocused = document.hasFocus();
        const pageVisible = isPageVisible && isBrowserFocused;
        
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
            
            // 更新群组最后消息时间并重新排序
            if (store && store.groupsList) {
                const group = store.groupsList.find(g => String(g.id) === String(message.groupId));
                if (group) {
                    const newTime = new Date(message.timestamp || Date.now()).toISOString();
                    group.last_message_time = newTime;
                    store.sortGroupsByLastMessageTime();
                    // 保存到 localStorage
                    if (store.saveGroupLastMessageTime) {
                        store.saveGroupLastMessageTime(message.groupId, newTime);
                    }
                }
            }
            
            // 更新群组未读计数
            // 规则：如果不是自己发送的消息，且 (不在当前群组页面 或 页面不可见 或 浏览器没有焦点)，则增加未读计数
            // 另外：如果是免打扰群组，则不增加未读计数
            const isOwnMessage = String(currentUser.id) === String(message.userId);
            const isCurrentGroup = currentActiveChat === `group_${message.groupId}`;
            const isGroupMuted = typeof window.isGroupMuted === 'function' && window.isGroupMuted(message.groupId);
            
            // 只有在当前群组页面且浏览器有焦点且页面可见时，才不增加未读计数
            const shouldAddGroupUnread = !isOwnMessage && !(isCurrentGroup && isPageVisible && isBrowserFocused) && !isGroupMuted;
            
            if (shouldAddGroupUnread) {
                const groupIdStr = String(message.groupId);
                if (store && store.unreadMessages) {
                    store.unreadMessages.groups[groupIdStr] = (store.unreadMessages.groups[groupIdStr] || 0) + 1;
                }
                updateUnreadCountsDisplay();
                updateTitleWithUnreadCount();
            }
            
            // 如果用户当前正在该群组聊天中且浏览器有焦点且页面可见，自动清除未读并发送清除事件
            if (isCurrentGroup && isPageVisible && isBrowserFocused && !isOwnMessage) {
                // 先立即清除群组未读计数
                if (store && store.unreadMessages) {
                    store.unreadMessages.groups[String(message.groupId)] = 0;
                }
                updateUnreadCountsDisplay();
                
                // 发送清除群组未读消息事件
                socket.emit('clear-unread-messages', {
                    userId: currentUser.id,
                    sessionToken: currentSessionToken,
                    groupId: message.groupId
                });
            }
            
            // 如果当前焦点在群组页面，将群组移到顶部
            if (pageVisible && currentActiveChat === `group_${message.groupId}`) {
                if (store && store.moveGroupToTop) {
                    store.moveGroupToTop(message.groupId);
                }
            }
        } else {
            // 添加公共消息到 store
            if (store && store.addPublicMessage) {
                store.addPublicMessage(message);
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
                if (store && store.unreadMessages) {
                    store.unreadMessages.global = (store.unreadMessages.global || 0) + 1;
                }
                updateUnreadCountsDisplay();
                updateTitleWithUnreadCount();
            }
            
            // 如果用户当前正在主聊天室路由且浏览器有焦点且页面可见，自动清除未读
            if (isInMainChatRoute && isPageVisible && isBrowserFocused && !isOwnMessage) {
                // 清除主聊天室未读计数
                if (store && store.unreadMessages) {
                    store.unreadMessages.global = 0;
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
            
            // 检查消息中是否包含群组 ID
            if (confirmedMessage.groupId) {
                // 群组消息
                const groupId = String(confirmedMessage.groupId);
                
                // 添加确认后的消息到 store
                if (store && store.addGroupMessage) {
                    store.addGroupMessage(groupId, confirmedMessage);
                }
                
                // 将群组移到列表顶部
                if (store && store.moveGroupToTop) {
                    store.moveGroupToTop(groupId);
                }
            } else {
                // 公共消息
                // 添加确认后的消息到 store
                if (store && store.addPublicMessage) {
                    store.addPublicMessage(confirmedMessage);
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
    socket.on('group-created', (data) => {
        // 加载群组列表
        loadGroupList();
        // 保存群组创建时间到最后消息时间记录
        if (data && data.groupId) {
            const store = window.chatStore;
            if (store && store.saveGroupLastMessageTime) {
                const createTime = new Date().toISOString();
                store.saveGroupLastMessageTime(data.groupId, createTime);
            }
        }
    });

    // 群组删除事件
    socket.on('group-deleted', (data) => {
        // 加载群组列表
        loadGroupList();
        // 清除群组的最后消息时间记录
        if (data && data.groupId) {
            const store = window.chatStore;
            if (store && store.deleteGroupLastMessageTime) {
                store.deleteGroupLastMessageTime(data.groupId);
            }
        }
    });

    // 群组解散事件
    socket.on('group-dissolved', (data) => {
        // console.log('📥 [群组] 收到群组解散事件:', data);
        loadGroupList();
        // 清除群组的最后消息时间记录
        if (data && data.groupId) {
            const store = window.chatStore;
            if (store && store.deleteGroupLastMessageTime) {
                store.deleteGroupLastMessageTime(data.groupId);
            }
            // 清除该群组的未读消息记录
            if (store && store.clearGroupUnread) {
                store.clearGroupUnread(data.groupId);
            }
            // 如果当前活动群组就是解散的群组，清空当前群组
            if (store && String(store.currentGroupId) === String(data.groupId)) {
                // 
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
        // 如果是自己被移除，清空当前群组
        // 注意：后端发送的字段是 memberId，不是 userId
        const removedUserId = data.memberId || data.userId;
        if (data && data.groupId && removedUserId) {
            const store = window.chatStore;
            // 如果当前活动群组就是这个群组，且被移除的是自己，清空当前群组
            if (store && String(store.currentGroupId) === String(data.groupId) && 
                String(store.currentUser?.id) === String(removedUserId)) {
                // 
                store.setCurrentGroupId(null);
                return;
            }
            // 如果是当前正在查看的群组，触发事件更新成员列表
            if (store && String(store.currentGroupId) === String(data.groupId)) {
                // 
                window.dispatchEvent(new CustomEvent('group-members-changed', { 
                    detail: { groupId: data.groupId, action: 'removed', data: data } 
                }));
            }
        }
    });

    // 好友添加事件
    socket.on('friend-added', (data) => {
        // 刷新好友列表
        loadFriendsList();
        // 保存添加好友的时间到最后消息时间记录
        if (data && data.friendId) {
            const store = window.chatStore;
            if (store && store.saveFriendLastMessageTime) {
                const addTime = new Date(data.timestamp || Date.now()).toISOString();
                store.saveFriendLastMessageTime(data.friendId, addTime);
            }
        }
    });

    // 好友删除事件
    socket.on('friend-removed', (data) => {
        // 刷新好友列表
        loadFriendsList();
        // 清除好友的最后消息时间记录
        if (data && data.friendId) {
            const store = window.chatStore;
            if (store && store.deleteFriendLastMessageTime) {
                store.deleteFriendLastMessageTime(data.friendId);
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
    socket.on('avatar-updated', (data) => {
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
    socket.on('nickname-updated', (data) => {
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
    socket.on('group-avatar-updated', (data) => {
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

    // 统一加载消息事件（替代原来的三个事件）
    socket.on('messages-loaded', (data) => {
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
            }

            // 处理未读消息信息
            let processedUnreadMessages = {
                groups: {},
                private: {}
            };

            if (data.unreadMessages) {
                if (data.unreadMessages && typeof data.unreadMessages === 'object' && !Object.prototype.hasOwnProperty.call(data.unreadMessages, 'global')) {
                    processedUnreadMessages.groups = data.unreadMessages;
                } else {
                    processedUnreadMessages.groups = data.unreadMessages.groups || {};
                }
            }

            if (data.unreadPrivateMessages) {
                processedUnreadMessages.private = data.unreadPrivateMessages;
            }

            if (data.groupLastMessageTimes && Object.keys(data.groupLastMessageTimes).length > 0) {
                if (window.chatStore && window.chatStore.groupsList) {
                    const groups = window.chatStore.groupsList;
                    groups.forEach(group => {
                        const lastTime = data.groupLastMessageTimes[group.id];
                        if (lastTime) {
                            group.last_message_time = lastTime instanceof Date ? lastTime.toISOString() : new Date(lastTime).toISOString();
                        }
                    });
                    window.chatStore.sortGroupsByLastMessageTime();
                }
                if (window.chatStore && window.chatStore.saveGroupLastMessageTimes) {
                    window.chatStore.saveGroupLastMessageTimes(data.groupLastMessageTimes);
                }
            }

            if (data.privateLastMessageTimes && Object.keys(data.privateLastMessageTimes).length > 0) {
                if (window.chatStore && window.chatStore.friendsList) {
                    const friends = window.chatStore.friendsList;
                    friends.forEach(friend => {
                        const lastTime = data.privateLastMessageTimes[friend.id];
                        if (lastTime) {
                            friend.last_message_time = lastTime instanceof Date ? lastTime.toISOString() : new Date(lastTime).toISOString();
                        }
                    });
                    window.chatStore.sortFriendsByLastMessageTime();
                }
                if (window.chatStore && window.chatStore.saveFriendLastMessageTimes) {
                    window.chatStore.saveFriendLastMessageTimes(data.privateLastMessageTimes);
                }
            }

            // 只更新有值的未读记录，不覆盖已有的记录
            if (data.unreadMessages && data.unreadMessages.groups) {
                for (const gid in data.unreadMessages.groups) {
                    if (Object.prototype.hasOwnProperty.call(data.unreadMessages.groups, gid)) {
                        unreadMessages.groups[gid] = data.unreadMessages.groups[gid];
                    }
                }
            }
            if (data.unreadPrivateMessages) {
                for (const pid in data.unreadPrivateMessages) {
                    if (Object.prototype.hasOwnProperty.call(data.unreadPrivateMessages, pid)) {
                        unreadMessages.private[pid] = data.unreadPrivateMessages[pid];
                    }
                }
            }

            const mutedGroups = getMutedGroups();
            for (const groupId in unreadMessages.groups) {
                if (unreadMessages.groups && Object.prototype.hasOwnProperty.call(unreadMessages.groups, groupId)) {
                    if (mutedGroups.includes(groupId)) {
                        unreadMessages.groups[groupId] = 0;

                        if (window.chatSocket) {
                            window.chatSocket.emit('clear-unread-messages', {
                                groupId: groupId,
                                sessionToken: currentSessionToken,
                                userId: currentUser.id
                            });
                        }
                    }
                }
            }

            updateUnreadCountsDisplay();
            updateTitleWithUnreadCount();
        } else if (data.type === 'group') {
            // 群组消息 - 完全复刻 group-chat-history 事件
            const groupId = data.groupId || currentGroupId;
            if (store && data.messages && groupId) {
                if (data.loadMore && store.prependGroupMessages) {
                    store.prependGroupMessages(groupId, data.messages);
                } else if (store.setGroupMessages) {
                    store.setGroupMessages(groupId, data.messages);
                }
            }

            if (data.unreadMessages) {
                let processedUnreadMessages = data.unreadMessages;
                if (processedUnreadMessages && typeof processedUnreadMessages === 'object' && !Object.prototype.hasOwnProperty.call(processedUnreadMessages, 'global')) {
                    processedUnreadMessages = {
                        groups: processedUnreadMessages
                    };
                }
                if (processedUnreadMessages.groups) {
                    unreadMessages.groups = processedUnreadMessages.groups;
                }
                if (processedUnreadMessages.private) {
                    unreadMessages.private = processedUnreadMessages.private;
                }

                const mutedGroups = getMutedGroups();
                for (const groupId in unreadMessages.groups) {
                    if (Object.prototype.hasOwnProperty.call(unreadMessages.groups, groupId)) {
                        if (mutedGroups.includes(groupId)) {
                            unreadMessages.groups[groupId] = 0;

                            if (window.chatSocket) {
                                window.chatSocket.emit('clear-unread-messages', {
                                    groupId: groupId,
                                    sessionToken: currentSessionToken,
                                    userId: currentUser.id
                                });
                            }
                        }
                    }
                }

                updateTitleWithUnreadCount();
            }
        } else if (data.type === 'private') {
            // 私信消息 - 完全复刻 private-chat-history 事件
            

            let userId = data.friendId || data.userId || currentPrivateChatUserId;

            

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
                }
            }

            if (store && data.messages && userId) {
                if (data.loadMore && store.prependPrivateMessages) {
                    store.prependPrivateMessages(userId, data.messages);
                } else if (store.setPrivateMessages) {
                    store.setPrivateMessages(userId, data.messages);
                }
            }
        }
    });

    // 聊天历史记录事件
    socket.on('chat-history', (data) => {
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

        // 处理未读消息信息
        // 注意：不要设置默认值，只有在服务器明确返回时才更新
        let processedUnreadMessages = {
            groups: {},
            private: {}
        };

        // 处理群组未读消息
        if (data.unreadMessages) {
            if (data.unreadMessages && typeof data.unreadMessages === 'object' && !Object.prototype.hasOwnProperty.call(data.unreadMessages, 'global')) {
                // 格式转换：将直接的群组键值对转换为包含 global 和 groups 的对象
                processedUnreadMessages.groups = data.unreadMessages;
            } else {
                processedUnreadMessages.groups = data.unreadMessages.groups || {};
                // 只有服务器明确返回 global 字段时才设置
                if (data.unreadMessages.global !== undefined) {
                    processedUnreadMessages.global = data.unreadMessages.global;
                }
            }
        }

        // 处理私信未读消息
        if (data.unreadPrivateMessages) {
            processedUnreadMessages.private = data.unreadPrivateMessages;
        }

        // 处理群组最后消息时间（仅在有未读消息时返回）
        if (data.groupLastMessageTimes && Object.keys(data.groupLastMessageTimes).length > 0) {
            // 更新群组列表中的最后消息时间
            if (window.chatStore && window.chatStore.groupsList) {
                const groups = window.chatStore.groupsList;
                groups.forEach(group => {
                    const lastTime = data.groupLastMessageTimes[group.id];
                    if (lastTime) {
                        // 如果是字符串时间，转换为 ISO 格式
                        group.last_message_time = lastTime instanceof Date ? lastTime.toISOString() : new Date(lastTime).toISOString();
                    }
                });
                // 重新排序
                window.chatStore.sortGroupsByLastMessageTime();
            }
            // 保存到 localStorage
            if (window.chatStore && window.chatStore.saveGroupLastMessageTimes) {
                window.chatStore.saveGroupLastMessageTimes(data.groupLastMessageTimes);
            }
        }

        // 处理私信最后消息时间（仅在有未读消息时返回）
        if (data.privateLastMessageTimes && Object.keys(data.privateLastMessageTimes).length > 0) {
            // 更新好友列表中的最后消息时间
            if (window.chatStore && window.chatStore.friendsList) {
                const friends = window.chatStore.friendsList;
                friends.forEach(friend => {
                    const lastTime = data.privateLastMessageTimes[friend.id];
                    if (lastTime) {
                        // 如果是字符串时间，转换为 ISO 格式
                        friend.last_message_time = lastTime instanceof Date ? lastTime.toISOString() : new Date(lastTime).toISOString();
                    }
                });
                // 重新排序
                window.chatStore.sortFriendsByLastMessageTime();
            }
            // 保存到 localStorage
            if (window.chatStore && window.chatStore.saveFriendLastMessageTimes) {
                window.chatStore.saveFriendLastMessageTimes(data.privateLastMessageTimes);
            }
        }

        // 更新未读消息计数
        // 只在服务器明确返回未读消息计数时才更新，否则保持当前的未读计数
        if (data.unreadMessages || data.unreadPrivateMessages) {
            if (processedUnreadMessages.global !== undefined) {
                unreadMessages.global = processedUnreadMessages.global;
            }
            if (processedUnreadMessages.groups) {
                unreadMessages.groups = processedUnreadMessages.groups;
            }
            if (processedUnreadMessages.private) {
                unreadMessages.private = processedUnreadMessages.private;
            }
        }

        // 检查并处理免打扰群组的未读消息
        const mutedGroups = getMutedGroups();
        for (const groupId in unreadMessages.groups) {
            if (unreadMessages.groups && Object.prototype.hasOwnProperty.call(unreadMessages.groups, groupId)) {
                // 检查群组是否被免打扰
                if (mutedGroups.includes(groupId)) {
                    // 清除免打扰群组的未读消息计数
                    unreadMessages.groups[groupId] = 0;

                    // 发送WebSocket消息，通知服务器已读该群组消息
                    if (window.chatSocket) {
                        window.chatSocket.emit('clear-unread-messages', {
                            groupId: groupId,
                            sessionToken: currentSessionToken,
                            userId: currentUser.id
                        });
                    }
                }
            }
        }

        // 更新未读计数显示
        updateUnreadCountsDisplay();
        updateTitleWithUnreadCount();
    });

    // 用户加入聊天室响应事件
    socket.on('user-joined-response', (data) => {
        // 检查响应中是否包含新的会话令牌
        if (data.sessionToken) {
            // 更新会话令牌
            setCurrentSessionToken(data.sessionToken);
        }

        // 处理未读消息信息
        if (data.unreadMessages) {
            // 检查数据格式：如果是直接的群组键值对，则转换为期望的格式
            let processedUnreadMessages = data.unreadMessages;
            if (processedUnreadMessages && typeof processedUnreadMessages === 'object' && !Object.prototype.hasOwnProperty.call(processedUnreadMessages, 'global')) {
                // 格式转换：将直接的群组键值对转换为包含groups的对象
                // 注意：不设置 global 默认值，只有在服务器明确返回时才更新
                processedUnreadMessages = {
                    groups: processedUnreadMessages
                };
            }
            // 更新未读消息计数，确保包含groups和private属性，保持响应性
            // 只在服务器明确返回未读消息计数时才更新，否则保持当前的未读计数
            if (processedUnreadMessages.global !== undefined) {
                unreadMessages.global = processedUnreadMessages.global;
            }
            if (processedUnreadMessages.groups) {
                unreadMessages.groups = processedUnreadMessages.groups;
            }
            if (processedUnreadMessages.private) {
                unreadMessages.private = processedUnreadMessages.private;
            }

            // 检查并处理免打扰群组的未读消息
            const mutedGroups = getMutedGroups();
            for (const groupId in unreadMessages.groups) {
                if (Object.prototype.hasOwnProperty.call(unreadMessages.groups, groupId)) {
                    // 检查群组是否被免打扰
                    if (mutedGroups.includes(groupId)) {
                        // 清除免打扰群组的未读消息计数
                        unreadMessages.groups[groupId] = 0;

                        // 发送WebSocket消息，通知服务器已读该群组消息
                        if (window.chatSocket) {
                            window.chatSocket.emit('clear-unread-messages', {
                            groupId: groupId,
                            sessionToken: currentSessionToken,
                            userId: currentUser.id
                        });
                        }
                    }
                }
            }

            // 更新未读计数显示
            updateTitleWithUnreadCount();
        }
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
            await modal.warning('您的会话已过期或在其他设备登录，请重新登录', '会话过期');
            logout();
        }
    });

    // 会话过期事件
    socket.on('session-expired', async () => {
        await modal.warning('您的会话已过期或在其他设备登录，请重新登录', '会话过期');
        logout();
    });

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
    socket.on('group-name-updated', () => {
        // 只有登录状态才刷新群组列表
        if (currentUser && currentSessionToken) {
            loadGroupList();
        }
    });

    // 监听群组公告更新事件
    socket.on('group-description-updated', (data) => {
        // 只有登录状态才刷新群组列表
        if (currentUser && currentSessionToken) {
            loadGroupList();

            // 如果当前正在查看该群组的信息模态框，更新公告显示
            const modal = document.getElementById('groupInfoModal');
            if (modal && modal.style.display === 'flex') {
                const modalGroupNoticeValue = document.getElementById('modalGroupNoticeValue');
                if (modalGroupNoticeValue) {
                    modalGroupNoticeValue.textContent = data.newDescription ? unescapeHtml(data.newDescription) : '暂无群组公告';
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
            
            // 添加确认后的私信消息到 store
            if (store && store.addPrivateMessage) {
                const currentPrivateUserId = sessionStore.currentPrivateChatUserId;
                if (currentPrivateUserId) {
                    store.addPrivateMessage(currentPrivateUserId, confirmedMessage);
                }
            }
            
            // 将私信好友移到列表顶部
            if (store && store.moveFriendToTop) {
                const currentPrivateUserId = sessionStore.currentPrivateChatUserId;
                if (currentPrivateUserId) {
                    store.moveFriendToTop(currentPrivateUserId);
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

        // 标记为实时消息
        message.isHistory = false;

        // 检查消息是否是当前聊天对象的消息，使用字符串比较确保类型一致
        const msgSenderId = String(message.senderId);
        const msgReceiverId = String(message.receiverId);
        
        // 确定聊天对象ID（无论收到还是发送消息，聊天对象都是对方）
        const chatPartnerId = String(currentUser.id) === msgReceiverId ? msgSenderId : msgReceiverId;

        // 如果当前正在该私信聊天中，自动将好友移到列表顶部
        // 条件：页面可见 + 当前聊天是私聊页面 + 消息是当前私聊对象发来的
        const store = window.chatStore;
        const pageVisible = (window.isPageVisible !== undefined ? window.isPageVisible : true) && document.hasFocus();
        
        if (pageVisible && currentActiveChat === `private_${chatPartnerId}`) {
            if (store && store.moveFriendToTop) {
                store.moveFriendToTop(chatPartnerId);
            }
        }

        // 更新好友最后消息时间并重新排序
        if (store && store.friendsList) {
            const friend = store.friendsList.find(f => String(f.id) === String(chatPartnerId));
            if (friend) {
                const newTime = new Date(message.timestamp || Date.now()).toISOString();
                friend.last_message_time = newTime;
                store.sortFriendsByLastMessageTime();
                // 保存到 localStorage
                if (store.saveFriendLastMessageTime) {
                    store.saveFriendLastMessageTime(chatPartnerId, newTime);
                }
            }
        }

        if (store && store.addPrivateMessage) {
            store.addPrivateMessage(chatPartnerId, message);
        }

        // 更新未读计数
        // 如果页面不可见，或者用户不在当前私信聊天中，或者浏览器没有焦点，添加未读计数
        // 排除自己发送的消息
        const isOwnMessage = String(currentUser.id) === String(msgSenderId);
        const isPageInvisible = window.isPageVisible === false;
        const isBrowserNotFocused = !document.hasFocus();
        const isCurrentPrivateChat = currentActiveChat === `private_${chatPartnerId}`;
        
        // 只有在当前私信聊天且浏览器有焦点且页面可见时，才不增加未读计数
        const shouldAddPrivateUnread = !isOwnMessage && !(isCurrentPrivateChat && !isPageInvisible && !isBrowserNotFocused);
        
        if (shouldAddPrivateUnread) {
            // 更新未读消息计数 - 使用 chatPartnerId 作为键
            if (store && store.unreadMessages) {
                store.unreadMessages.private[chatPartnerId] = (store.unreadMessages.private[chatPartnerId] || 0) + 1;
            }
            updateUnreadCountsDisplay();
            updateTitleWithUnreadCount();
        }
        
        // 如果用户当前正在该私信聊天中且浏览器有焦点且页面可见，自动清除未读并发送清除事件
        if (isCurrentPrivateChat && !isPageInvisible && !isBrowserNotFocused && !isOwnMessage) {
            // 清除私信未读计数
            if (store && store.unreadMessages) {
                store.unreadMessages.private[chatPartnerId] = 0;
            }
            updateUnreadCountsDisplay();
            
            // 发送清除私信未读消息事件
            socket.emit('clear-unread-messages', {
                userId: currentUser.id,
                sessionToken: currentSessionToken,
                friendId: chatPartnerId
            });
        }
    });

    // 私信消息已读事件
    socket.on('private-message-read', (data) => {
        if (!data || !data.fromUserId || !data.friendId) return;
        
        const store = getStore();
        // fromUserId: 读消息的人（对方）
        // friendId: 收到已读事件的人（自己）
        const readerId = data.fromUserId;
        const myId = data.friendId;
        
        // 更新自己发给对方的消息为已读
        // 私信消息存储在 privateMessages[对方ID] 中
        if (store && store.privateMessages && store.privateMessages[readerId]) {
            const messages = store.privateMessages[readerId];
            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                // 自己发送的消息（senderId === myId）且接收者是对方（receiverId === readerId）
                if (String(msg.senderId) === String(myId) && String(msg.receiverId) === String(readerId)) {
                    if (msg.isRead !== 1) {
                        messages[i] = { ...msg, isRead: 1 };
                    }
                }
            }
            // 触发响应式更新
            store.privateMessages[readerId] = [...messages];
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

    // 统一加载消息函数（支持全局、群组、私信）
    window.loadMessages = function(type, options = {}) {
        if (!window.chatSocket) return;
        
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
            fetch(`${SERVER_URL}/user/friends`, {
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
            fetch(`${SERVER_URL}/create-group`, {
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
    // 构建请求头，包含会话令牌
    const headers = {
        'Content-Type': 'application/json'
    };
    
    // 如果有会话令牌，添加到请求头中
    if (currentSessionToken) {
        headers['session-token'] = currentSessionToken;
    }
    
    try {
        const response = await fetch(`${SERVER_URL}/check-status`, {
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

export {
  initializeWebSocket,
  enableMessageSending,
  disableMessageSending,
  checkUserAndIPStatus,
  disconnectWebSocket,
  isConnected,
  avatarVersions
};