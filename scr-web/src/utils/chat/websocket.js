import localForage from 'localforage';

import modal from '../modal.js';

import { SERVER_URL, io, toast, originalFetch } from './config.js';
import { 
  loadGroupList, 
  updateGroupList,
  isGroupMuted
} from './group.js';
import { loadFriendsList } from './private.js';
import {
  useBaseStore,
  useUserStore,
  useFriendStore,
  useGroupStore,
  usePublicStore,
  useModalStore,
  useSessionStore,
  useStorageStore,
  useUnreadStore,
  useDraftStore,
  useInputStore,
  setChatSocket,
  getChatSocket
} from '@/stores/index.js';
import { refreshTokenWithQueue } from './tokenManager.js';
import { 
  updateUnreadCountsDisplay, 
  currentActiveChat, 
  logout
} from './ui.js';
import { navigateTo } from './routerInstance.js';


let avatarVersions = {};
let _lastMessageSendTime = 0;
let _messageSendTimeouts = {};

function updateUserList(users) {
  if (!Array.isArray(users)) {
    console.error('Invalid users data:', users);
    users = [];
  }

  const userStore = useUserStore();
  const baseStore = useBaseStore();
  if (userStore) {
    const currentUserId = baseStore.currentUser?.id;
    
    const processedUsers = users.map(user => ({
      ...user,
      nickname: user.nickname
    }));
    
    const onlineUsers = processedUsers.filter(u => u.isOnline !== false);
    // 离线用户列表过滤掉当前用户
    const offlineUsers = processedUsers.filter(u => u.isOnline === false && String(u.id) !== String(currentUserId));
    userStore.onlineUsers = onlineUsers;
    userStore.offlineUsers = offlineUsers;
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

    const userStore = useUserStore();
    const baseStore = useBaseStore();
    if (setChatSocket) {
        setChatSocket(socket);
    }

    // 连接成功事件
    socket.on('connect', async () => {
        baseStore.isConnected = true;
        const sessionStore = useSessionStore();

        // 登录后先检查IP和用户状态，然后再加入聊天室
        const currentUser = baseStore.currentUser;
        const currentSessionToken = baseStore.currentSessionToken;
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
                    if (sessionStore.currentGroupId) {
                        socket.emit('join-group', {
                            groupId: sessionStore.currentGroupId,
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
        baseStore.isConnected = false;
        // 禁用消息发送功能
        disableMessageSending();
    });

    // 重连成功事件 - 通过 Manager 对象监听
    socket.io.on('reconnect', async () => {
        const baseStore = useBaseStore();
        const storageStore = useStorageStore();
        const currentUser = baseStore.currentUser;
        const currentSessionToken = baseStore.currentSessionToken;
        
        if (currentUser && currentSessionToken) {
            // 重连成功后拉取离线消息
            if (storageStore && storageStore.fetchAndMergeOfflineMessages) {
                try {
                    await storageStore.fetchAndMergeOfflineMessages(false);
                } catch (err) {
                    console.error('重连后拉取离线消息失败:', err);
                }
            }
        }
    });

    // 接收消息事件
    socket.on('message-received', async (message) => {
        // 检查消息中是否包含新的会话令牌
        const sessionStore = useSessionStore();
        if (message.sessionToken) {
            // 更新会话令牌
            sessionStore.setCurrentSessionToken(message.sessionToken);
        }

        const userStore = useUserStore();
        const baseStore = useBaseStore();
        const friendStore = useFriendStore();
        const groupStore = useGroupStore();
        const publicStore = usePublicStore();
        const storageStore = useStorageStore();
        const unreadStore = useUnreadStore();
        const isPageVisible = !document.hidden;
        const isBrowserFocused = document.hasFocus();
        const pageVisible = isPageVisible && isBrowserFocused;
        
        // 检查是否是类型101撤回消息
        if (message.messageType === 101) {
            // 101消息的content是被撤回消息的ID（简单字符串格式）
            const originalMessageId = String(message.content).trim();
            
            if (!originalMessageId || !storageStore) {
                return;
            }

            // 先查找并替换引用该被撤回消息的消息
            if (storageStore.fixQuotedMessagesForWithdrawn) {
                if (message.groupId) {
                    // 群组消息 - 从 fullGroupMessages 中查找
                    if (storageStore.fullGroupMessages !== null && storageStore.fullGroupMessages !== undefined && storageStore.fullGroupMessages[message.groupId]) {
                        const messages = storageStore.fullGroupMessages[message.groupId];
                        const updates = storageStore.fixQuotedMessagesForWithdrawn(originalMessageId, messages);
                        updates.forEach(update => {
                            if (groupStore.updateGroupQuotedMessage) {
                                groupStore.updateGroupQuotedMessage(message.groupId, update.messageId, update.newContent);
                            }
                        });
                    }
                } else if (message.senderId && message.receiverId) {
                    // 私信消息 - 从 fullPrivateMessages 中查找
                    const currentUser = baseStore.currentUser;
                    const msgSenderId = String(message.senderId);
                    const msgReceiverId = String(message.receiverId);
                    const chatPartnerId = String(currentUser?.id) === msgReceiverId ? msgSenderId : msgReceiverId;

                    if (storageStore.fullPrivateMessages !== null && storageStore.fullPrivateMessages !== undefined && storageStore.fullPrivateMessages[chatPartnerId]) {
                        const messages = storageStore.fullPrivateMessages[chatPartnerId];
                        const updates = storageStore.fixQuotedMessagesForWithdrawn(originalMessageId, messages);
                        updates.forEach(update => {
                            if (friendStore.updatePrivateQuotedMessage) {
                                friendStore.updatePrivateQuotedMessage(chatPartnerId, update.messageId, update.newContent);
                            }
                        });
                    }
                } else {
                    // 公共消息 - 从 fullPublicMessages 中查找
                    if (storageStore.fullPublicMessages !== null && storageStore.fullPublicMessages !== undefined) {
                        const messages = storageStore.fullPublicMessages;
                        const updates = storageStore.fixQuotedMessagesForWithdrawn(originalMessageId, messages);
                        updates.forEach(update => {
                            if (publicStore.updatePublicQuotedMessage) {
                                publicStore.updatePublicQuotedMessage(update.messageId, update.newContent);
                            }
                        });
                    }
                }
            }

            // 根据被撤回消息ID找到原消息并标记为已撤回
            if (message.groupId) {
                // 群组消息撤回
                const groupMessages = storageStore.fullGroupMessages?.[message.groupId];

                if (groupMessages) {
                    const targetMsg = groupMessages.find(m => String(m.id) === originalMessageId);
                    if (targetMsg) {
                        // 使用101消息中的信息构建撤回提示（不依赖本地旧content）
                        const recallText = `${message.nickname || '某人'}撤回了一条消息`;
                        
                        // 标记为已撤回并应用系统样式
                        Object.assign(targetMsg, {
                            isRecalled: true,
                            isSystemMessage: true,
                            content: recallText,  // 直接使用构建的撤回提示
                            nickname: message.nickname || targetMsg.nickname,
                            avatarUrl: message.avatarUrl || targetMsg.avatarUrl
                        });

                        // 触发UI更新
                        if (groupStore.updateGroupMessage) {
                            groupStore.updateGroupMessage(message.groupId, originalMessageId, targetMsg);
                        }

                        // 持久化到IndexedDB（更新现有记录，不删除）
                        if (storageStore.saveGroupMessageToIndexedDB) {
                            storageStore.saveGroupMessageToIndexedDB(message.groupId, targetMsg);
                        }
                    }
                }

                // 更新群组会话的最后消息时间
                if (groupStore && groupStore.groupsList) {
                    const group = groupStore.groupsList.find(g => String(g.id) === String(message.groupId));
                    if (group) {
                        const newTime = new Date(message.timestamp || Date.now()).toISOString();
                        const recallText = `${message.nickname || '某人'}撤回了一条消息`;
                        group.last_message_time = newTime;
                        group.session_last_active_time = newTime;
                        group.lastMessage = {
                            ...message,
                            content: recallText,
                            nickname: message.nickname || targetMsg?.nickname
                        };
                        groupStore.sortGroupsByLastMessageTime();
                        if (storageStore.updateSessionLastMessageTime) {
                            storageStore.updateSessionLastMessageTime('group', message.groupId, newTime);
                        }
                    }
                }
            } else if (message.senderId && message.receiverId) {
                // 私信消息撤回
                const currentUser = baseStore.currentUser;
                const msgSenderId = String(message.senderId);
                const msgReceiverId = String(message.receiverId);
                const chatPartnerId = String(currentUser?.id) === msgReceiverId ? msgSenderId : msgReceiverId;

                const privateMessages = storageStore.fullPrivateMessages?.[chatPartnerId];
                if (privateMessages) {
                    const targetMsg = privateMessages.find(m => String(m.id) === originalMessageId);
                    if (targetMsg) {
                        // 使用101消息中的信息构建撤回提示（不依赖本地旧content）
                        const recallText = `${message.nickname || '某人'}撤回了一条消息`;
                        
                        // 标记为已撤回并应用系统样式
                        Object.assign(targetMsg, {
                            isRecalled: true,
                            isSystemMessage: true,
                            content: recallText,  // 直接使用构建的撤回提示
                            nickname: message.nickname || targetMsg.nickname,
                            avatarUrl: message.avatarUrl || targetMsg.avatarUrl
                        });

                        // 触发UI更新
                        if (friendStore.updatePrivateMessage) {
                            friendStore.updatePrivateMessage(chatPartnerId, originalMessageId, targetMsg);
                        }

                        // 持久化到IndexedDB（更新现有记录，不删除）
                        if (storageStore.savePrivateMessageToIndexedDB) {
                            storageStore.savePrivateMessageToIndexedDB(chatPartnerId, targetMsg);
                        }
                    }
                }

                // 更新私信会话的最后消息时间
                if (friendStore && friendStore.friendsList) {
                    const friend = friendStore.friendsList.find(f => String(f.id) === String(chatPartnerId));
                    if (friend) {
                        const newTime = new Date(message.timestamp || Date.now()).toISOString();
                        const recallText = `${message.nickname || '某人'}撤回了一条消息`;
                        friend.last_message_time = newTime;
                        friend.session_last_active_time = newTime;
                        friend.lastMessage = {
                            ...message,
                            content: recallText,
                            nickname: message.nickname || targetMsg?.nickname
                        };
                        friendStore.sortFriendsByLastMessageTime();
                        if (storageStore.updateSessionLastMessageTime) {
                            storageStore.updateSessionLastMessageTime('friend', chatPartnerId, newTime);
                        }
                    }
                }
            } else {
                // 公共消息撤回
                const publicMessages = storageStore.fullPublicMessages;
                if (publicMessages) {
                    const targetMsg = publicMessages.find(m => String(m.id) === originalMessageId);
                    if (targetMsg) {
                        // 使用101消息中的信息构建撤回提示（不依赖本地旧content）
                        const recallText = `${message.nickname || '某人'}撤回了一条消息`;
                        
                        // 标记为已撤回并应用系统样式
                        Object.assign(targetMsg, {
                            isRecalled: true,
                            isSystemMessage: true,
                            content: recallText,  // 直接使用构建的撤回提示
                            nickname: message.nickname || targetMsg.nickname,
                            avatarUrl: message.avatarUrl || targetMsg.avatarUrl
                        });

                        // 触发UI更新
                        if (publicStore.updatePublicMessage) {
                            publicStore.updatePublicMessage(originalMessageId, targetMsg);
                        }

                        // 持久化到IndexedDB（更新现有记录，不删除）
                        if (storageStore.savePublicMessageToIndexedDB) {
                            storageStore.savePublicMessageToIndexedDB(targetMsg);
                        }
                    }
                }
            }
            
            // 更新对应的 minId
            if (message.id && storageStore.publicAndGroupMinId !== undefined) {
                if (message.id > storageStore.publicAndGroupMinId) {
                    storageStore.publicAndGroupMinId = message.id;
                    if (storageStore.saveMinIds) {
                        storageStore.saveMinIds();
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
                    if (userStore && userStore.onlineUsers) {
                        const userIndex = userStore.onlineUsers.findIndex(u => String(u.id) === String(userId));
                        if (userIndex !== -1) {
                            userStore.onlineUsers[userIndex].nickname = updateData.nickname;
                        }
                    }
                    if (friendStore && friendStore.friendsList) {
                        const friendIndex = friendStore.friendsList.findIndex(f => String(f.id) === String(userId));
                        if (friendIndex !== -1) {
                            friendStore.friendsList[friendIndex].nickname = updateData.nickname;
                            friendStore.friendsList = [...friendStore.friendsList];
                        }
                    }
                    // 更新 IndexedDB 中的会话信息（无论好友是否已删除）
                    try {
                        const currentUser = baseStore.currentUser;
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
                    if (storageStore && storageStore.updateUserInfoInMessages) {
                        storageStore.updateUserInfoInMessages(userId, { nickname: updateData.nickname });
                    }
                } else if (updateData.type === 'avatar' && updateData.avatarUrl) {
                    if (userStore && userStore.onlineUsers) {
                        const userIndex = userStore.onlineUsers.findIndex(u => String(u.id) === String(userId));
                        if (userIndex !== -1) {
                            userStore.onlineUsers[userIndex].avatar = updateData.avatarUrl;
                            userStore.onlineUsers[userIndex].avatarUrl = updateData.avatarUrl;
                            userStore.onlineUsers[userIndex].avatar_url = updateData.avatarUrl;
                        }
                    }
                    if (friendStore && friendStore.friendsList) {
                        const friendIndex = friendStore.friendsList.findIndex(f => String(f.id) === String(userId));
                        if (friendIndex !== -1) {
                            friendStore.friendsList[friendIndex].avatarUrl = updateData.avatarUrl;
                            friendStore.friendsList[friendIndex].avatar_url = updateData.avatarUrl;
                            friendStore.friendsList[friendIndex].avatar = updateData.avatarUrl;
                            friendStore.friendsList = [...friendStore.friendsList];
                        }
                    }
                    // 更新 IndexedDB 中的会话信息（无论好友是否已删除）
                    try {
                        const currentUser = baseStore.currentUser;
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
                    if (storageStore && storageStore.updateUserInfoInMessages) {
                        storageStore.updateUserInfoInMessages(userId, { avatarUrl: updateData.avatarUrl });
                    }
                }
            } catch (e) {
                console.error('解析102消息失败:', e);
            }
            
            // 添加102消息到store（公共消息）
            if (publicStore && publicStore.addPublicMessage) {
                publicStore.addPublicMessage(message);
            }
            
            // 更新对应的 minId
            if (message.id && storageStore && storageStore.publicAndGroupMinId !== undefined) {
                if (message.id > storageStore.publicAndGroupMinId) {
                    storageStore.publicAndGroupMinId = message.id;
                    if (storageStore.saveMinIds) {
                        storageStore.saveMinIds();
                    }
                }
            }
            
            return;
        }
        
        // 更新对应的 minId（只对非撤回消息）
        if (message.id && storageStore && storageStore.publicAndGroupMinId !== undefined) {
            if (message.id > storageStore.publicAndGroupMinId) {
                storageStore.publicAndGroupMinId = message.id;
                if (storageStore.saveMinIds) {
                    storageStore.saveMinIds();
                }
            }
        }
        
        const currentUser = baseStore.currentUser;
        
        // 检查消息是否包含群组 ID
        if (message.groupId) {
            // 添加消息到 store
            if (groupStore && groupStore.addGroupMessage) {
                groupStore.addGroupMessage(message.groupId, message);
            }
            
            // 检查@通知
            if (message.atUserid && currentUser) {
                const atUserIds = Array.isArray(message.atUserid) ? message.atUserid : [message.atUserid];
                const isCurrentUserAt = atUserIds.some(id => String(id) === String(currentUser.id) || String(id) === '-1');
                if (isCurrentUserAt) {
                    // 查找群组名称
                    let groupName = '未知群组';
                    if (groupStore && groupStore.groupsList) {
                        const group = groupStore.groupsList.find(g => String(g.id) === String(message.groupId));
                        if (group) {
                            groupName = group.name;
                        }
                    }
                    toast.info(`群组 ${groupName} 有@你的消息`);
                    // 设置该群组有@我的消息标记
                    if (groupStore && groupStore.setGroupHasAtMe) {
                        groupStore.setGroupHasAtMe(message.groupId);
                    }
                }
            }
            
            // 更新群组最后消息时间并重新排序
            if (groupStore && groupStore.groupsList) {
                const group = groupStore.groupsList.find(g => String(g.id) === String(message.groupId));
                if (group) {
                    const newTime = new Date(message.timestamp || Date.now()).toISOString();
                    group.last_message_time = newTime;
                    group.session_last_active_time = newTime;
                    group.lastMessage = message;
                    groupStore.sortGroupsByLastMessageTime();
                    if (storageStore.updateSessionLastMessageTime) {
                        storageStore.updateSessionLastMessageTime('group', message.groupId, newTime);
                    }
                }
            }
            
            // 更新群组未读计数
            // 规则：如果不是自己发送的消息，且 (不在当前群组页面 或 页面不可见 或 浏览器没有焦点)，则增加未读计数
            // 另外：如果是免打扰群组，则不增加未读计数
            
            const isOwnMessage = String(currentUser.id) === String(message.userId);
            const groupIdStr = String(message.groupId);
            const isCurrentGroup = currentActiveChat === `group_${groupIdStr}`;
            const isGroupMutedLocal = typeof isGroupMuted === 'function' && isGroupMuted(message.groupId);
            
            // 只有在当前群组页面且浏览器有焦点且页面可见时，才不增加未读计数
            const shouldAddGroupUnread = !isOwnMessage && !(isCurrentGroup && isPageVisible && isBrowserFocused) && !isGroupMutedLocal;
            
            if (shouldAddGroupUnread) {
                if (unreadStore && unreadStore.incrementGroupUnread) {
                    unreadStore.incrementGroupUnread(message.groupId);
                }
                updateUnreadCountsDisplay();
            }
            
            // 如果用户当前正在该群组聊天中且浏览器有焦点且页面可见，自动清除未读
            if (isCurrentGroup && isPageVisible && isBrowserFocused && !isOwnMessage) {
                // 立即清除群组未读计数
                if (unreadStore && unreadStore.clearGroupUnread) {
                    unreadStore.clearGroupUnread(message.groupId);
                }
                updateUnreadCountsDisplay();
            }
            
            // 如果当前焦点在群组页面，将群组移到顶部
            if (pageVisible && currentActiveChat === `group_${groupIdStr}`) {
                if (groupStore && groupStore.moveGroupToTop) {
                    groupStore.moveGroupToTop(message.groupId);
                }
            }
        } else {
            // 添加公共消息到 store
            if (publicStore && publicStore.addPublicMessage) {
                publicStore.addPublicMessage(message);
            }
            
            // 检查@通知
            if (message.atUserid && currentUser) {
                const atUserIds = Array.isArray(message.atUserid) ? message.atUserid : [message.atUserid];
                const isCurrentUserAt = atUserIds.some(id => String(id) === String(currentUser.id));
                if (isCurrentUserAt) {
                    toast.info('主聊天室有@你的消息');
                }
            }
            
            // 更新公共聊天未读计数
            // 规则：如果不是自己发送的消息，且 (不在主聊天室路由 或 页面不可见 或 浏览器没有焦点)，则增加未读计数
            const isOwnMessage = String(currentUser.id) === String(message.userId);
            
            // 检查当前路由是否在主聊天室（/chat 或 /chat/）
            const baseStore = useBaseStore();
            const currentPath = baseStore?.currentRoute?.path || '';
            const isInMainChatRoute = currentPath === '/chat' || currentPath === '/chat/';
            
            // 只有在主聊天室路由且浏览器有焦点且页面可见时，才不增加未读计数
            const shouldAddUnread = !isOwnMessage && !(isInMainChatRoute && isPageVisible && isBrowserFocused);
            
            if (shouldAddUnread) {
                if (unreadStore && unreadStore.incrementGlobalUnread) {
                    unreadStore.incrementGlobalUnread();
                }
                updateUnreadCountsDisplay();
            }
            
            // 如果用户当前正在主聊天室路由且浏览器有焦点且页面可见，自动清除未读
            if (isInMainChatRoute && isPageVisible && isBrowserFocused && !isOwnMessage) {
                // 清除主聊天室未读计数
                if (unreadStore && unreadStore.clearGlobalUnread) {
                    unreadStore.clearGlobalUnread();
                }
                updateUnreadCountsDisplay();
            }
        }
    });

    // 接收消息发送确认事件 - 根据确认事件渲染消息
    socket.on('message-sent', (data) => {
        const groupStore = useGroupStore();
        const publicStore = usePublicStore();
        const storageStore = useStorageStore();
        const draftStore = useDraftStore();

        // 检查是否包含完整的消息数据
        if (data.message && data.messageId) {
            const confirmedMessage = data.message;
            
            // 检查是否是类型101撤回消息
            if (confirmedMessage.messageType === 101) {
                // 101消息的content是被撤回消息的ID（简单字符串格式）
                const originalMessageId = String(confirmedMessage.content).trim();
                
                if (!originalMessageId || !storageStore) {
                    return;
                }

                // 先查找并替换引用该消息的消息
                if (storageStore.fixQuotedMessagesForWithdrawn) {
                    if (confirmedMessage.groupId) {
                        // 群组消息 - 从 fullGroupMessages 中查找
                        if (storageStore.fullGroupMessages !== null && storageStore.fullGroupMessages !== undefined && storageStore.fullGroupMessages[confirmedMessage.groupId]) {
                            const messages = storageStore.fullGroupMessages[confirmedMessage.groupId];
                            const updates = storageStore.fixQuotedMessagesForWithdrawn(originalMessageId, messages);
                            updates.forEach(update => {
                                if (groupStore.updateGroupQuotedMessage) {
                                    groupStore.updateGroupQuotedMessage(confirmedMessage.groupId, update.messageId, update.newContent);
                                }
                            });
                        }
                    } else {
                        // 公共消息 - 从 fullPublicMessages 中查找
                        if (storageStore.fullPublicMessages !== null && storageStore.fullPublicMessages !== undefined) {
                            const messages = storageStore.fullPublicMessages;
                            const updates = storageStore.fixQuotedMessagesForWithdrawn(originalMessageId, messages);
                            updates.forEach(update => {
                                if (publicStore.updatePublicQuotedMessage) {
                                    publicStore.updatePublicQuotedMessage(update.messageId, update.newContent);
                                }
                            });
                        }
                    }
                }

                // 根据被撤回消息ID找到原消息并标记为已撤回
                if (confirmedMessage.groupId) {
                    // 群组消息撤回
                    const groupMessages = storageStore.fullGroupMessages?.[confirmedMessage.groupId];
                    if (groupMessages) {
                        const targetMsg = groupMessages.find(m => String(m.id) === originalMessageId);
                        if (targetMsg) {
                            // 使用101消息中的信息构建撤回提示（不依赖本地旧content）
                            const recallText = `${confirmedMessage.nickname || '某人'}撤回了一条消息`;
                            
                            // 标记为已撤回并应用系统样式
                            Object.assign(targetMsg, {
                                isRecalled: true,
                                isSystemMessage: true,
                                content: recallText,  // 直接使用构建的撤回提示
                                nickname: confirmedMessage.nickname || targetMsg.nickname,
                                avatarUrl: confirmedMessage.avatarUrl || targetMsg.avatarUrl
                            });

                            // 触发UI更新
                            if (groupStore.updateGroupMessage) {
                                groupStore.updateGroupMessage(confirmedMessage.groupId, originalMessageId, targetMsg);
                            }

                            // 持久化到IndexedDB（更新现有记录，不删除）
                            if (storageStore.saveGroupMessageToIndexedDB) {
                                storageStore.saveGroupMessageToIndexedDB(confirmedMessage.groupId, targetMsg);
                            }
                        }
                    }

                    // 更新群组会话的最后消息时间
                    if (groupStore && groupStore.groupsList) {
                        const group = groupStore.groupsList.find(g => String(g.id) === String(confirmedMessage.groupId));
                        if (group) {
                            const newTime = new Date(confirmedMessage.timestamp || Date.now()).toISOString();
                            const recallText = `${confirmedMessage.nickname || '某人'}撤回了一条消息`;
                            group.last_message_time = newTime;
                            group.session_last_active_time = newTime;
                            group.lastMessage = {
                                ...confirmedMessage,
                                content: recallText,
                                nickname: confirmedMessage.nickname || targetMsg?.nickname
                            };
                            groupStore.sortGroupsByLastMessageTime();
                            if (storageStore.updateSessionLastMessageTime) {
                                storageStore.updateSessionLastMessageTime('group', confirmedMessage.groupId, newTime);
                            }
                        }
                    }
                } else {
                    // 公共消息撤回
                    const publicMessages = storageStore.fullPublicMessages;
                    if (publicMessages) {
                        const targetMsg = publicMessages.find(m => String(m.id) === originalMessageId);
                        if (targetMsg) {
                            // 使用101消息中的信息构建撤回提示（不依赖本地旧content）
                            const recallText = `${confirmedMessage.nickname || '某人'}撤回了一条消息`;
                            
                            // 标记为已撤回并应用系统样式
                            Object.assign(targetMsg, {
                                isRecalled: true,
                                isSystemMessage: true,
                                content: recallText,  // 直接使用构建的撤回提示
                                nickname: confirmedMessage.nickname || targetMsg.nickname,
                                avatarUrl: confirmedMessage.avatarUrl || targetMsg.avatarUrl
                            });

                            // 触发UI更新
                            if (publicStore.updatePublicMessage) {
                                publicStore.updatePublicMessage(originalMessageId, targetMsg);
                            }

                            // 持久化到IndexedDB（更新现有记录，不删除）
                            if (storageStore.savePublicMessageToIndexedDB) {
                                storageStore.savePublicMessageToIndexedDB(targetMsg);
                            }
                        }
                    }
                }
                return;
            }
            
            // 更新对应的 minId
            if (confirmedMessage.id && storageStore && storageStore.publicAndGroupMinId !== undefined) {
                if (confirmedMessage.id > storageStore.publicAndGroupMinId) {
                    storageStore.publicAndGroupMinId = confirmedMessage.id;
                    if (storageStore.saveMinIds) {
                        storageStore.saveMinIds();
                    }
                }
            }
            
            // 检查消息中是否包含群组 ID
            if (confirmedMessage.groupId) {
                // 群组消息
                const groupId = String(confirmedMessage.groupId);
                
                // 添加确认后的消息到 store
                if (groupStore && groupStore.addGroupMessage) {
                    groupStore.addGroupMessage(groupId, confirmedMessage);
                }
                
                // 更新群组最后消息
                if (groupStore && groupStore.updateGroupLastMessage) {
                    groupStore.updateGroupLastMessage(groupId, confirmedMessage);
                }
                
                // 将群组移到列表顶部
                if (groupStore && groupStore.moveGroupToTop) {
                    groupStore.moveGroupToTop(groupId);
                }
                
                // 清空群组草稿
                if (draftStore && draftStore.clearDraft) {
                    draftStore.clearDraft('group', groupId);
                }
            } else {
                // 公共消息
                // 添加确认后的消息到 store
                if (publicStore && publicStore.addPublicMessage) {
                    publicStore.addPublicMessage(confirmedMessage);
                }
                
                // 清空公共聊天草稿
                const inputStore = useInputStore();
                if (inputStore) {
                    inputStore.mainMessageInput = '';
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
        // 先等待群组列表刷新完成
        await loadGroupList();
        
        // 保存群组名称和头像到 IndexedDB
        if (data && data.groupId) {
            try {
                const userId = baseStore.currentUser?.id || 'guest';
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
        const groupStore = useGroupStore();
        const baseStore = useBaseStore();
        const unreadStore = useUnreadStore();
        const sessionStore = useSessionStore();

        if (data && data.groupId) {
            if (groupStore && groupStore.markGroupAsDeleted) {
                groupStore.markGroupAsDeleted(data.groupId);
            }
            // 把解散状态记录到 IndexedDB
            try {
                const currentUser = baseStore.currentUser;
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
            if (unreadStore && unreadStore.clearGroupUnread) {
                unreadStore.clearGroupUnread(data.groupId);
            }
            // 如果当前活动群组就是解散的群组，清空当前群组
            if (sessionStore && String(sessionStore.currentGroupId) === String(data.groupId)) {
                sessionStore.setCurrentGroupId(null);
            }
        }
    });

    // 群组成员添加事件
    socket.on('members-added', (data) => {
        const sessionStore = useSessionStore();

        // 刷新群组列表
        loadGroupList();
        // 如果是当前正在查看的群组，触发事件更新成员列表
        if (data && data.groupId) {
            if (sessionStore && String(sessionStore.currentGroupId) === String(data.groupId)) {
                // 
                window.dispatchEvent(new CustomEvent('group-members-changed', { 
                    detail: { groupId: data.groupId, action: 'added', data: data } 
                }));
            }
        }
    });

    // 群组成员移除事件
    socket.on('member-removed', (data) => {
        const baseStore = useBaseStore();
        const groupStore = useGroupStore();
        const sessionStore = useSessionStore();

        // 刷新群组列表
        loadGroupList();
        // 如果是自己被移除，清空当前群组并标记会话为已删除
        // 注意：后端发送的字段是 memberId，不是 userId
        const removedUserId = data.memberId || data.userId;
        if (data && data.groupId && removedUserId) {
            // 如果是自己被移除，标记会话为已删除
            if (baseStore && String(baseStore.currentUser?.id) === String(removedUserId)) {
                if (groupStore.markGroupAsDeleted) {
                    groupStore.markGroupAsDeleted(data.groupId, false);
                }
                // 如果当前活动群组就是这个群组，清空当前群组
                if (String(sessionStore.currentGroupId) === String(data.groupId)) {
                    sessionStore.setCurrentGroupId(null);
                }
            }
            // 如果是当前正在查看的群组，触发事件更新成员列表
            if (sessionStore && String(sessionStore.currentGroupId) === String(data.groupId)) {
                window.dispatchEvent(new CustomEvent('group-members-changed', { 
                    detail: { groupId: data.groupId, action: 'removed', data: data } 
                }));
            }
        }
    });

    // 好友添加事件
    socket.on('friend-added', async (data) => {
        const baseStore = useBaseStore();
        const friendStore = useFriendStore();

        // 先等待好友列表刷新完成
        await loadFriendsList();
        
        // 保存添加好友的时间到最后消息时间记录
        if (data && data.friendId) {
            // 如果该好友本地已标记删除，则删除deleted_at标记，并保存好友信息
            try {
                const userId = baseStore.currentUser?.id || 'guest';
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
            
            if (friendStore.friendsList) {
                const friend = friendStore.friendsList.find(f => String(f.id) === String(data.friendId));
                if (friend && friend.deleted_at) {
                    delete friend.deleted_at;
                }
            }
        }
    });

    // 好友请求列表更新事件
    socket.on('friend-requests-updated', async (data) => {
        const baseStore = useBaseStore();

        // 重新加载好友请求列表
        if (baseStore.loadFriendRequests) {
            await baseStore.loadFriendRequests();
        }
    });

    // 收到新的好友请求通知
    socket.on('friend-request-received', async (data) => {
        const baseStore = useBaseStore();

        // 重新加载收到的好友请求列表
        if (baseStore.loadFriendRequests) {
            await baseStore.loadFriendRequests();
        }
    });

    // 好友请求被拒绝通知
    socket.on('friend-request-rejected', async (data) => {
        const baseStore = useBaseStore();

        // 重新加载发送的好友请求列表
        if (baseStore.loadFriendRequests) {
            await baseStore.loadFriendRequests();
        }
    });

    // 被添加到群组事件
    socket.on('added-to-group', async (data) => {
        const baseStore = useBaseStore();
        const groupStore = useGroupStore();

        // 先等待群组列表刷新完成
        await loadGroupList();
        
        // 如果该群组本地已标记删除，则删除deleted_at标记，并保存群组信息
        if (data && data.groupId) {
            try {
                const userId = baseStore.currentUser?.id || 'guest';
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
            
            if (groupStore.groupsList) {
                const group = groupStore.groupsList.find(g => String(g.id) === String(data.groupId));
                if (group && group.deleted_at) {
                    delete group.deleted_at;
                }
            }
        }
    });

    // 好友删除事件
    socket.on('friend-removed', async (data) => {
        const friendStore = useFriendStore();
        const unreadStore = useUnreadStore();
        const sessionStore = useSessionStore();

        if (data && data.friendId) {
            if (friendStore && friendStore.markFriendAsDeleted) {
                friendStore.markFriendAsDeleted(data.friendId);
            }
            // 清除该好友的未读私信消息记录
            if (unreadStore && unreadStore.clearPrivateUnread) {
                unreadStore.clearPrivateUnread(data.friendId);
            }
            // 如果当前打开的私信就是删除的好友，清空当前私信
            if (sessionStore && String(sessionStore.currentPrivateChatUserId) === String(data.friendId)) {
                sessionStore.setCurrentPrivateChatUserId(null);
            }
        }
    });

    // 群管理员变更事件
    socket.on('group-admin-changed', (data) => {
        if (data && data.groupId) {
            window.dispatchEvent(new CustomEvent('group-members-changed', { 
                detail: { groupId: data.groupId, action: 'admin-changed', data: data } 
            }));
        }
    });

    // 头像更新事件
    socket.on('avatar-updated', async (data) => {
        const userStore = useUserStore();
        const friendStore = useFriendStore();
        const storageStore = useStorageStore();
        const baseStore = useBaseStore();
        const sessionStore = useSessionStore();

        // 刷新所有相关的头像显示
        if (data.userId && data.avatarUrl) {
            // 更新在线用户列表中的头像
            if (userStore && userStore.onlineUsers) {
                const userIndex = userStore.onlineUsers.findIndex(u => String(u.id) === String(data.userId));
                if (userIndex !== -1) {
                    // 更新在线用户的头像（支持 avatar、avatarUrl、avatar_url 三种字段名）
                    userStore.onlineUsers[userIndex].avatar = data.avatarUrl;
                    userStore.onlineUsers[userIndex].avatarUrl = data.avatarUrl;
                    userStore.onlineUsers[userIndex].avatar_url = data.avatarUrl;
                }
            }
            
            // 直接更新好友列表中的头像，而不是重新从服务器加载
            if (friendStore && friendStore.friendsList) {
                const friendIndex = friendStore.friendsList.findIndex(f => String(f.id) === String(data.userId));
                if (friendIndex !== -1) {
                    // 更新好友的头像 URL（支持 avatarUrl、avatar_url、avatar 三种字段名）
                    friendStore.friendsList[friendIndex].avatarUrl = data.avatarUrl;
                    friendStore.friendsList[friendIndex].avatar_url = data.avatarUrl;
                    friendStore.friendsList[friendIndex].avatar = data.avatarUrl;
                    // 触发响应式更新
                    friendStore.friendsList = [...friendStore.friendsList];
                }
            }
            
            // 更新所有消息列表中该用户的头像
            if (storageStore && storageStore.updateUserInfoInMessages) {
                storageStore.updateUserInfoInMessages(data.userId, { avatarUrl: data.avatarUrl });
            }
            
            // 更新 IndexedDB 中的会话信息（无论好友是否已删除）
            try {
                const currentUser = baseStore.currentUser;
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
            if (sessionStore.currentPrivateChatUserId) {
                // 如果当前在私信聊天，刷新私信界面的头像
                const privateUserAvatar = document.querySelector('#privateChatInterface .chat-avatar img');
                if (privateUserAvatar && sessionStore.currentPrivateChatUserId === data.userId) {
                    // 直接使用服务器返回的完整 URL（已包含?v=参数）
                    const fullUrl = data.avatarUrl.startsWith('http') ? data.avatarUrl : `${SERVER_URL}${data.avatarUrl}`;
                    privateUserAvatar.src = fullUrl;
                }
            }
        }
    });

    // 昵称更新事件
    socket.on('nickname-updated', async (data) => {
        const userStore = useUserStore();
        const friendStore = useFriendStore();
        const storageStore = useStorageStore();
        const baseStore = useBaseStore();
        const sessionStore = useSessionStore();

        if (data.userId && data.nickname) {
            // 更新在线用户列表中的昵称
            if (userStore && userStore.onlineUsers) {
                const userIndex = userStore.onlineUsers.findIndex(u => String(u.id) === String(data.userId));
                if (userIndex !== -1) {
                    userStore.onlineUsers[userIndex].nickname = data.nickname;
                }
            }
            
            // 更新好友列表中的昵称
            if (friendStore && friendStore.friendsList) {
                const friendIndex = friendStore.friendsList.findIndex(f => String(f.id) === String(data.userId));
                if (friendIndex !== -1) {
                    friendStore.friendsList[friendIndex].nickname = data.nickname;
                    // 触发响应式更新
                    friendStore.friendsList = [...friendStore.friendsList];
                }
            }
            
            // 更新所有消息列表中该用户的昵称
            if (storageStore && storageStore.updateUserInfoInMessages) {
                storageStore.updateUserInfoInMessages(data.userId, { nickname: data.nickname });
            }
            
            // 更新 IndexedDB 中的会话信息（无论好友是否已删除）
            try {
                const currentUser = baseStore.currentUser;
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
            if (sessionStore.currentPrivateChatUserId && String(sessionStore.currentPrivateChatUserId) === String(data.userId)) {
                const privateUserName = document.querySelector('#privateChatInterface .private-user-details h2');
                if (privateUserName) {
                    privateUserName.textContent = data.nickname;
                }
            }
        }
    });

    // 群头像更新事件
    socket.on('group-avatar-updated', async (data) => {
        const groupStore = useGroupStore();
        const storageStore = useStorageStore();
        const baseStore = useBaseStore();
        const modalStore = useModalStore();

        if (data.groupId && data.avatarUrl) {
            // 更新群组列表中的头像
            if (groupStore && groupStore.groupsList) {
                const groupIndex = groupStore.groupsList.findIndex(g => String(g.id) === String(data.groupId));
                if (groupIndex !== -1) {
                    groupStore.groupsList[groupIndex].avatar_url = data.avatarUrl;
                    groupStore.groupsList[groupIndex].avatarUrl = data.avatarUrl;
                    // 触发响应式更新
                    groupStore.groupsList = [...groupStore.groupsList];
                }
            }
            
            // 更新群组消息中该群组的头像（群名片等）
            if (storageStore && storageStore.updateGroupInfoInMessages) {
                storageStore.updateGroupInfoInMessages(data.groupId, { avatarUrl: data.avatarUrl });
            }
            
            // 更新 IndexedDB 中的群组会话信息
            try {
                const currentUser = baseStore.currentUser;
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
            if (modalStore && modalStore.modalData && modalStore.modalData.groupInfo && 
                String(modalStore.modalData.groupInfo.id) === String(data.groupId)) {
                modalStore.modalData.groupInfo.avatar_url = data.avatarUrl;
            }
        }
    });

    // IP封禁事件
    socket.on('ip-banned', async (data) => {
        // 显示封禁提示
        let banMessage = `您的 IP 已被封禁\n\n原因：${data.reason || '违反使用规则'}`;
        if (data.expiresAt) {
            const expireDate = new Date(data.expiresAt);
            banMessage += `\n\n解封时间：${expireDate.toLocaleString('zh-CN')}`;
        } else {
            banMessage += '\n\n封禁类型：永久封禁';
        }
        
        await modal.error(banMessage, 'IP 已被封禁');
        
        // 清除本地存储
        localStorage.removeItem('currentSessionToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('chatUserId');
        
        // 断开连接
        socket.disconnect();
        
        // 跳转到登录页面
        navigateTo('/login');
    });

    // 用户封禁事件
    socket.on('user-banned', async (data) => {
        // 显示封禁提示
        let banMessage = `您的账户已被封禁\n\n原因：${data.reason || '违反使用规则'}`;
        if (data.expiresAt) {
            const expireDate = new Date(data.expiresAt);
            banMessage += `\n\n解封时间：${expireDate.toLocaleString('zh-CN')}`;
        } else {
            banMessage += '\n\n封禁类型：永久封禁';
        }
        
        await modal.error(banMessage, '账户已被封禁');
        
        // 清除本地存储
        localStorage.removeItem('currentSessionToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('chatUserId');
        
        // 断开连接
        socket.disconnect();
        
        // 跳转到登录页面
        navigateTo('/login');
    });

    // 统一加载消息事件（替代原来的三个事件）
    socket.on('messages-loaded', async (data) => {
        const sessionStore = useSessionStore();
        const publicStore = usePublicStore();
        const groupStore = useGroupStore();
        const baseStore = useBaseStore();
        const friendStore = useFriendStore();
        const unreadStore = useUnreadStore();

        // 检查响应中是否包含新的会话令牌
        if (data.sessionToken) {
            // 更新会话令牌
            sessionStore.setCurrentSessionToken(data.sessionToken);
        }
        
        if (data.type === 'global') {
            // 全局聊天室消息 - 完全复刻 chat-history 事件
            if (publicStore && data.messages) {
                if (data.loadMore && publicStore.prependPublicMessages) {
                    publicStore.prependPublicMessages(data.messages);
                } else if (publicStore.setPublicMessages) {
                    publicStore.setPublicMessages(data.messages);
                }
                
                // 检查是否加载更多时返回了空数组或消息数少于20条，标记为已全部加载
                if (data.loadMore) {
                    const isAllLoaded = !data.messages || data.messages.length < 20 || data.messages.length === 0;
                    if (isAllLoaded && publicStore.setPublicAllLoaded) {
                        publicStore.setPublicAllLoaded(true);
                    }
                }
            }

            if (data.groupLastMessageTimes && Object.keys(data.groupLastMessageTimes).length > 0) {
                if (groupStore && groupStore.groupsList) {
                    const userId = baseStore.currentUser?.id || 'guest';
                    const prefix = `chats-${userId}`;
                    
                    const groups = groupStore.groupsList;
                    for (const group of groups) {
                        const lastTime = data.groupLastMessageTimes[group.id];
                        if (lastTime) {
                            const time = lastTime instanceof Date ? lastTime.toISOString() : new Date(lastTime).toISOString();
                            group.last_message_time = time;
                            group.session_last_active_time = time;
                            
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
                    groupStore.sortGroupsByLastMessageTime();
                }
            }

            if (data.privateLastMessageTimes && Object.keys(data.privateLastMessageTimes).length > 0) {
                if (friendStore && friendStore.friendsList) {
                    const userId = baseStore.currentUser?.id || 'guest';
                    const prefix = `chats-${userId}`;
                    
                    const friends = friendStore.friendsList;
                    for (const friend of friends) {
                        const lastTime = data.privateLastMessageTimes[friend.id];
                        if (lastTime) {
                            const time = lastTime instanceof Date ? lastTime.toISOString() : new Date(lastTime).toISOString();
                            friend.last_message_time = time;
                            friend.session_last_active_time = time;
                            
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
                    friendStore.sortFriendsByLastMessageTime();
                }
            }

            updateUnreadCountsDisplay();
        } else if (data.type === 'group') {
            // 群组消息 - 完全复刻 group-chat-history 事件
            const groupId = data.groupId || sessionStore.currentGroupId;
            if (groupStore && data.messages && groupId) {
                if (data.loadMore && groupStore.prependGroupMessages) {
                    groupStore.prependGroupMessages(groupId, data.messages);
                } else if (groupStore.setGroupMessages) {
                    groupStore.setGroupMessages(groupId, data.messages);
                }
                
                // 检查是否加载更多时返回了空数组或消息数少于20条，标记为已全部加载
                if (data.loadMore) {
                    const isAllLoaded = !data.messages || data.messages.length < 20 || data.messages.length === 0;
                    if (isAllLoaded && groupStore.setGroupAllLoaded) {
                        groupStore.setGroupAllLoaded(groupId, true);
                    }
                }
            }

            // 清除该群组的未读计数，因为用户正在加载群组消息
            if (unreadStore && unreadStore.clearGroupUnread && groupId) {
                unreadStore.clearGroupUnread(groupId);
            }
            updateUnreadCountsDisplay();
        } else if (data.type === 'private') {
            // 私信消息 - 完全复刻 private-chat-history 事件
            

            let userId = data.friendId || data.userId || sessionStore.currentPrivateChatUserId;
            
            const currentUser = baseStore.currentUser;
            
            if (!userId && data.messages && data.messages.length > 0) {
                const firstMessage = data.messages[0];
                const msgSenderId = String(firstMessage.senderId);
                const msgReceiverId = String(firstMessage.receiverId);
                userId = String(currentUser.id) === msgReceiverId ? msgSenderId : msgReceiverId;
                
            }

            if (data.loadMore && userId) {
                
                const isAllLoaded = !data.messages || data.messages.length < 20 || data.messages.length === 0;
                
                if (isAllLoaded) {
                    // 更新 chatStore 中的标记
                    if (friendStore && friendStore.setPrivateAllLoaded) {
                        friendStore.setPrivateAllLoaded(userId, true);
                    }
                }
            }

            if (friendStore && data.messages && userId) {
                if (data.loadMore && friendStore.prependPrivateMessages) {
                    friendStore.prependPrivateMessages(userId, data.messages);
                } else if (friendStore.setPrivateMessages) {
                    friendStore.setPrivateMessages(userId, data.messages);
                }
            }

            // 清除该私信的未读计数，因为用户正在加载私信消息
            if (unreadStore && unreadStore.clearPrivateUnread && userId) {
                unreadStore.clearPrivateUnread(userId);
            }
            updateUnreadCountsDisplay();
        }
    });

    // 聊天历史记录事件
    socket.on('chat-history', async (data) => {
        const sessionStore = useSessionStore();
        const publicStore = usePublicStore();
        const groupStore = useGroupStore();
        const baseStore = useBaseStore();
        const friendStore = useFriendStore();
        const unreadStore = useUnreadStore();

        // 检查历史记录响应中是否包含新的会话令牌
        if (data.sessionToken) {
            // 更新会话令牌
            sessionStore.setCurrentSessionToken(data.sessionToken);
        }

        if (publicStore && data.messages) {
            if (data.loadMore && publicStore.prependPublicMessages) {
                publicStore.prependPublicMessages(data.messages);
            } else if (publicStore.setPublicMessages) {
                publicStore.setPublicMessages(data.messages);
            }
        }

        // 处理群组最后消息时间
        if (data.groupLastMessageTimes && Object.keys(data.groupLastMessageTimes).length > 0) {
            // 更新群组列表中的最后消息时间
            if (groupStore && groupStore.groupsList) {
                const userId = baseStore.currentUser?.id || 'guest';
                const prefix = `chats-${userId}`;
                
                const groups = groupStore.groupsList;
                for (const group of groups) {
                    const lastTime = data.groupLastMessageTimes[group.id];
                    if (lastTime) {
                        const time = lastTime instanceof Date ? lastTime.toISOString() : new Date(lastTime).toISOString();
                        group.last_message_time = time;
                        group.session_last_active_time = time;
                        
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
                groupStore.sortGroupsByLastMessageTime();
            }
        }

        // 处理私信最后消息时间
        if (data.privateLastMessageTimes && Object.keys(data.privateLastMessageTimes).length > 0) {
            // 更新好友列表中的最后消息时间
            if (friendStore && friendStore.friendsList) {
                const userId = baseStore.currentUser?.id || 'guest';
                const prefix = `chats-${userId}`;
                
                const friends = friendStore.friendsList;
                for (const friend of friends) {
                    const lastTime = data.privateLastMessageTimes[friend.id];
                    if (lastTime) {
                        const time = lastTime instanceof Date ? lastTime.toISOString() : new Date(lastTime).toISOString();
                        friend.last_message_time = time;
                        friend.session_last_active_time = time;
                        
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
                friendStore.sortFriendsByLastMessageTime();
            }
        }

        // 更新未读计数显示
        updateUnreadCountsDisplay();
    });

    // 用户加入聊天室响应事件
    socket.on('user-joined-response', (data) => {
        const sessionStore = useSessionStore();
        const unreadStore = useUnreadStore();

        // 检查响应中是否包含新的会话令牌
        if (data.sessionToken) {
            // 更新会话令牌
            sessionStore.setCurrentSessionToken(data.sessionToken);
        }

        // 从本地存储加载未读消息计数（不再依赖后端）
        if (unreadStore && unreadStore.loadUnreadMessages) {
            unreadStore.loadUnreadMessages();
        }

        // 更新未读计数显示
        updateUnreadCountsDisplay();
    });

    // 登录成功响应事件
    socket.on('login-success', (data) => {
        const sessionStore = useSessionStore();

        // 检查响应中是否包含新的会话令牌
        if (data.sessionToken) {
            // 更新会话令牌
            sessionStore.setCurrentSessionToken(data.sessionToken);
        }
    });

    // 连接关闭事件
    socket.on('disconnect', () => {
        baseStore.isConnected = false;
        // 禁用消息发送功能
        disableMessageSending();
    });

    // 连接错误事件
    socket.on('error', () => {
        baseStore.isConnected = false;
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
        const lastSendTime = _lastMessageSendTime || 0;
        const isWithin5Seconds = now - lastSendTime < 5000;
        
        if (isWithin5Seconds) {
            // 重置所有消息发送计时器
            if (_messageSendTimeouts) {
                for (const key in _messageSendTimeouts) {
                    clearTimeout(_messageSendTimeouts[key]);
                }
                _messageSendTimeouts = {};
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

    // 监听群组名称更新事件
    socket.on('group-name-updated', async (data) => {
        const baseStore = useBaseStore();
        const sessionStore = useSessionStore();

        // 只有登录状态才刷新群组列表
        const currentUser = baseStore.currentUser;
        const currentSessionToken = baseStore.currentSessionToken;
        if (currentUser && currentSessionToken) {
            loadGroupList();
            
            // 如果有数据并且是当前群组，更新相关状态
            if (data && data.groupId && data.newGroupName) {
                if (sessionStore && String(sessionStore.currentGroupId) === String(data.groupId)) {
                    sessionStore.currentGroupName = data.newGroupName;
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
        const baseStore = useBaseStore();

        // 只有登录状态才刷新群组列表
        const currentUser = baseStore.currentUser;
        const currentSessionToken = baseStore.currentSessionToken;
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
        const storageStore = useStorageStore();
        const friendStore = useFriendStore();
        const sessionStore = useSessionStore();
        const draftStore = useDraftStore();
        const baseStore = useBaseStore();

        // 检查是否包含完整的消息数据
        if (data.message && data.messageId) {
            const confirmedMessage = data.message;
            
            // 检查是否是类型101撤回消息
            if (confirmedMessage.messageType === 101) {
                // 101消息的content是被撤回消息的ID（简单字符串格式）
                const originalMessageId = String(confirmedMessage.content).trim();
                
                if (!originalMessageId || !storageStore) {
                    return;
                }

                const currentUser = baseStore.currentUser;
                if (currentUser) {
                    // 确定聊天对象ID
                    const msgSenderId = String(confirmedMessage.senderId);
                    const msgReceiverId = String(confirmedMessage.receiverId);
                    const chatPartnerId = String(currentUser.id) === msgReceiverId ? msgSenderId : msgReceiverId;

                    // 先查找并替换引用该被撤回消息的消息
                    if (storageStore.fixQuotedMessagesForWithdrawn) {
                        if (storageStore.fullPrivateMessages !== null && storageStore.fullPrivateMessages !== undefined && storageStore.fullPrivateMessages[chatPartnerId]) {
                            const messages = storageStore.fullPrivateMessages[chatPartnerId];
                            const updates = storageStore.fixQuotedMessagesForWithdrawn(originalMessageId, messages);
                            updates.forEach(update => {
                                if (friendStore.updatePrivateQuotedMessage) {
                                    friendStore.updatePrivateQuotedMessage(chatPartnerId, update.messageId, update.newContent);
                                }
                            });
                        }
                    }

                    // 私信消息撤回 - 根据被撤回消息ID找到原消息并标记为已撤回
                    const privateMessages = storageStore.fullPrivateMessages?.[chatPartnerId];
                    if (privateMessages) {
                        const targetMsg = privateMessages.find(m => String(m.id) === originalMessageId);
                        if (targetMsg) {
                            // 使用101消息中的信息构建撤回提示（不依赖本地旧content）
                            const recallText = `${confirmedMessage.nickname || '某人'}撤回了一条消息`;
                            
                            // 标记为已撤回并应用系统样式
                            Object.assign(targetMsg, {
                                isRecalled: true,
                                isSystemMessage: true,
                                content: recallText,  // 直接使用构建的撤回提示
                                nickname: confirmedMessage.nickname || targetMsg.nickname,
                                avatarUrl: confirmedMessage.avatarUrl || targetMsg.avatarUrl
                            });

                            // 触发UI更新
                            if (friendStore.updatePrivateMessage) {
                                friendStore.updatePrivateMessage(chatPartnerId, originalMessageId, targetMsg);
                            }

                            // 持久化到IndexedDB（更新现有记录，不删除）
                            if (storageStore.savePrivateMessageToIndexedDB) {
                                storageStore.savePrivateMessageToIndexedDB(chatPartnerId, targetMsg);
                            }
                        }
                    }

                    // 更新私信会话的最后消息时间
                    if (friendStore && friendStore.friendsList) {
                        const friend = friendStore.friendsList.find(f => String(f.id) === String(chatPartnerId));
                        if (friend) {
                            const newTime = new Date(confirmedMessage.timestamp || Date.now()).toISOString();
                            const recallText = `${confirmedMessage.nickname || '某人'}撤回了一条消息`;
                            friend.last_message_time = newTime;
                            friend.session_last_active_time = newTime;
                            friend.lastMessage = {
                                ...confirmedMessage,
                                content: recallText,
                                nickname: confirmedMessage.nickname || targetMsg?.nickname
                            };
                            friendStore.sortFriendsByLastMessageTime();
                            if (storageStore.updateSessionLastMessageTime) {
                                storageStore.updateSessionLastMessageTime('friend', chatPartnerId, newTime);
                            }
                        }
                    }
                }
                return;
            }
            
            // 更新对应的 minId
            if (confirmedMessage.id && storageStore && storageStore.privateMinId !== undefined) {
                if (confirmedMessage.id > storageStore.privateMinId) {
                    storageStore.privateMinId = confirmedMessage.id;
                    if (storageStore.saveMinIds) {
                        storageStore.saveMinIds();
                    }
                }
            }
            
            // 添加确认后的私信消息到 store
            if (friendStore && friendStore.addPrivateMessage) {
                const currentPrivateUserId = sessionStore.currentPrivateChatUserId;
                if (currentPrivateUserId) {
                    friendStore.addPrivateMessage(currentPrivateUserId, confirmedMessage);
                }
            }
            
            // 更新好友最后消息
            if (friendStore && friendStore.updateFriendLastMessage) {
                const currentPrivateUserId = sessionStore.currentPrivateChatUserId;
                if (currentPrivateUserId) {
                    friendStore.updateFriendLastMessage(currentPrivateUserId, confirmedMessage);
                }
            }
            
            // 更新会话最后消息时间到 IndexedDB
            if (storageStore && storageStore.updateSessionLastMessageTime && confirmedMessage.messageType !== 101 && confirmedMessage.messageType !== 103) {
                const currentPrivateUserId = sessionStore.currentPrivateChatUserId;
                if (currentPrivateUserId) {
                    const newTime = new Date(confirmedMessage.timestamp || Date.now()).toISOString();
                    storageStore.updateSessionLastMessageTime('friend', currentPrivateUserId, newTime);
                }
            }
            
            // 将私信好友移到列表顶部
            if (friendStore && friendStore.moveFriendToTop) {
                const currentPrivateUserId = sessionStore.currentPrivateChatUserId;
                if (currentPrivateUserId) {
                    friendStore.moveFriendToTop(currentPrivateUserId);
                }
            }
            
            // 清空私信草稿
            if (draftStore && draftStore.clearDraft) {
                const currentPrivateUserId = sessionStore.currentPrivateChatUserId;
                if (currentPrivateUserId) {
                    draftStore.clearDraft('private', currentPrivateUserId);
                }
            }
        }
    });

    // 私信消息接收事件
    socket.on('private-message-received', (message) => {
        const sessionStore = useSessionStore();
        const baseStore = useBaseStore();
        const storageStore = useStorageStore();
        const friendStore = useFriendStore();
        const unreadStore = useUnreadStore();

        // 检查消息中是否包含新的会话令牌
        if (message.sessionToken) {
            // 更新会话令牌
            sessionStore.setCurrentSessionToken(message.sessionToken);
        }

        // 检查是否是类型101撤回消息
        if (message.messageType === 101) {
            // 101消息的content是被撤回消息的ID（简单字符串格式）
            const originalMessageId = String(message.content).trim();
            
            if (!originalMessageId || !storageStore) {
                return;
            }

            const currentUser = baseStore.currentUser;
            if (currentUser) {
                // 确定聊天对象ID
                const msgSenderId = String(message.senderId);
                const msgReceiverId = String(message.receiverId);
                const chatPartnerId = String(currentUser.id) === msgReceiverId ? msgSenderId : msgReceiverId;

                // 先查找并替换引用该被撤回消息的消息
                if (storageStore.fixQuotedMessagesForWithdrawn) {
                    if (storageStore.fullPrivateMessages !== null && storageStore.fullPrivateMessages !== undefined && storageStore.fullPrivateMessages[chatPartnerId]) {
                        const messages = storageStore.fullPrivateMessages[chatPartnerId];
                        const updates = storageStore.fixQuotedMessagesForWithdrawn(originalMessageId, messages);
                        updates.forEach(update => {
                            if (friendStore.updatePrivateQuotedMessage) {
                                friendStore.updatePrivateQuotedMessage(chatPartnerId, update.messageId, update.newContent);
                            }
                        });
                    }
                }

                // 私信消息撤回 - 根据被撤回消息ID找到原消息并标记为已撤回
                const privateMessages = storageStore.fullPrivateMessages?.[chatPartnerId];
                if (privateMessages) {
                    const targetMsg = privateMessages.find(m => String(m.id) === originalMessageId);
                    if (targetMsg) {
                        // 使用101消息中的信息构建撤回提示（不依赖本地旧content）
                        const recallText = `${message.nickname || '某人'}撤回了一条消息`;
                        
                        // 标记为已撤回并应用系统样式
                        Object.assign(targetMsg, {
                            isRecalled: true,
                            isSystemMessage: true,
                            content: recallText,  // 直接使用构建的撤回提示
                            nickname: message.nickname || targetMsg.nickname,
                            avatarUrl: message.avatarUrl || targetMsg.avatarUrl
                        });

                        // 触发UI更新
                        if (friendStore.updatePrivateMessage) {
                            friendStore.updatePrivateMessage(chatPartnerId, originalMessageId, targetMsg);
                        }

                        // 持久化到IndexedDB（更新现有记录，不删除）
                        if (storageStore.savePrivateMessageToIndexedDB) {
                            storageStore.savePrivateMessageToIndexedDB(chatPartnerId, targetMsg);
                        }
                    }
                }

                // 更新私信会话的最后消息时间
                if (friendStore && friendStore.friendsList) {
                    const friend = friendStore.friendsList.find(f => String(f.id) === String(chatPartnerId));
                    if (friend) {
                        const newTime = new Date(message.timestamp || Date.now()).toISOString();
                        const recallText = `${message.nickname || '某人'}撤回了一条消息`;
                        friend.last_message_time = newTime;
                        friend.session_last_active_time = newTime;
                        friend.lastMessage = {
                            ...message,
                            content: recallText,
                            nickname: message.nickname || targetMsg?.nickname
                        };
                        friendStore.sortFriendsByLastMessageTime();
                        if (storageStore.updateSessionLastMessageTime) {
                            storageStore.updateSessionLastMessageTime('friend', chatPartnerId, newTime);
                        }
                    }
                }

                // 注意：在线101撤回消息不更新 minId，避免导致minId过大
                // 只有通过拉取离线消息接口获得的101消息才会处理minId
            }
            return;
        }
        
        // 检查是否是类型103已读回执消息
        if (message.messageType === 103) {
            const currentUser = baseStore.currentUser;
            // 确定聊天对象ID
            const msgSenderId = String(message.senderId);
            const msgReceiverId = String(message.receiverId);
            const chatPartnerId = String(currentUser.id) === msgReceiverId ? msgSenderId : msgReceiverId;
            
            // 获取已读的最后一条消息ID
            const readMessageId = message.content;
            
            // 更新该会话中自己发送的消息的已读状态
            if (friendStore.updatePrivateMessagesReadStatus) {
                friendStore.updatePrivateMessagesReadStatus(chatPartnerId, readMessageId);
            }
            
            // 添加103已读回执消息到IndexedDB（但不加入store）
            friendStore.addPrivateMessage(chatPartnerId, message);
            return;
        }
        
        // 检查消息是否是当前聊天对象的消息，使用字符串比较确保类型一致
        const msgSenderId = String(message.senderId);
        const msgReceiverId = String(message.receiverId);
        const currentUser = baseStore.currentUser;
        
        // 确定聊天对象ID（无论收到还是发送消息，聊天对象都是对方）
        const chatPartnerId = String(currentUser.id) === msgReceiverId ? msgSenderId : msgReceiverId;

        // 定义一些变量在后面使用
        const isOwnMessage = String(currentUser.id) === String(msgSenderId);
        const isWithdrawMessage = message.messageType === 101;
        const isReadReceiptMessage = message.messageType === 103;

        // 如果当前正在该私信聊天中，自动将好友移到列表顶部
        // 条件：页面可见 + 当前聊天是私聊页面 + 消息是当前私聊对象发来的
        const pageVisible = !document.hidden && document.hasFocus();
        
        if (message.id && storageStore && storageStore.privateMinId !== undefined) {
            if (message.id > storageStore.privateMinId) {
                storageStore.privateMinId = message.id;
                if (storageStore.saveMinIds) {
                    storageStore.saveMinIds();
                }
            }
        }
        
        if (pageVisible && currentActiveChat === `private_${chatPartnerId}`) {
            if (friendStore && friendStore.moveFriendToTop) {
                friendStore.moveFriendToTop(chatPartnerId);
            }
        }

        // 先添加消息到 store
        if (friendStore && friendStore.addPrivateMessage) {
            friendStore.addPrivateMessage(chatPartnerId, message);
        }

        // 更新好友最后消息时间并重新排序（排除101撤回消息和103已读回执消息）
        if (friendStore && friendStore.friendsList && !isWithdrawMessage && !isReadReceiptMessage) {
            const friend = friendStore.friendsList.find(f => String(f.id) === String(chatPartnerId));
            if (friend) {
                const newTime = new Date(message.timestamp || Date.now()).toISOString();
                friend.last_message_time = newTime;
                friend.session_last_active_time = newTime;
                friend.lastMessage = message;
                friendStore.sortFriendsByLastMessageTime();
                if (storageStore.updateSessionLastMessageTime) {
                    storageStore.updateSessionLastMessageTime('friend', chatPartnerId, newTime);
                }
            }
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
            if (unreadStore && unreadStore.incrementPrivateUnread) {
                unreadStore.incrementPrivateUnread(chatPartnerId);
            }
            updateUnreadCountsDisplay();
        } else if (!isOwnMessage && !isWithdrawMessage && !isReadReceiptMessage && isCurrentPrivateChat && !isPageInvisible && !isBrowserNotFocused) {
            // 用户正在当前私信聊天中且页面可见且浏览器有焦点，自动发送已读事件
            sendReadMessageEvent('private', { friendId: chatPartnerId });
        }
        
        // 如果用户当前正在该私信聊天中且浏览器有焦点且页面可见，自动清除未读
        if (isCurrentPrivateChat && !isPageInvisible && !isBrowserNotFocused && !isOwnMessage && !isWithdrawMessage && !isReadReceiptMessage) {
            // 清除私信未读计数
            if (unreadStore && unreadStore.clearPrivateUnread) {
                unreadStore.clearPrivateUnread(chatPartnerId);
            }
            updateUnreadCountsDisplay();
        }
    });

    // 私信消息已读事件
    socket.on('private-message-read', async (data) => {
        const friendStore = useFriendStore();
        const sessionStore = useSessionStore();

        if (!data || !data.fromUserId || !data.friendId) return;
        
        // fromUserId: 读消息的人（对方）
        // friendId: 收到已读事件的人（自己）
        const readerId = data.fromUserId;
        const myId = data.friendId;
        
        // 更新自己发给对方的消息为已读
        // 私信消息存储在 privateMessages[对方ID] 中
        let hasUpdates = false;
        if (friendStore && friendStore.privateMessages && friendStore.privateMessages[readerId]) {
            const messages = friendStore.privateMessages[readerId];
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
                friendStore.privateMessages[readerId] = [...messages];
            }
        }
        
        // 更新 IndexedDB 中的消息
        if (hasUpdates && sessionStore && sessionStore.getStorageKeyPrefix) {
            try {
                const prefix = sessionStore.getStorageKeyPrefix();
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
    socket.on('friend-list-updated', async () => {
        // 更新好友列表
        await loadFriendsList();
    });

    // 保存socket实例
    // 暴露发送已读消息事件函数

    // ModalManager已移至Vue组件ChatModal.vue中实现

    // 图片预览功能已移至Vue组件ChatModal.vue中实现
}

// 统一加载消息函数（支持全局、群组、私信）
function loadMessages(type, options = {}) {
    if (!socket) return;
    const baseStore = useBaseStore();
    const sessionStore = useSessionStore();
    const currentUser = baseStore.currentUser;
    const currentSessionToken = baseStore.currentSessionToken;
    
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
    
    socket.emit('load-messages', data);
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
    const baseStore = useBaseStore();
    const currentUser = baseStore.currentUser;
    const currentSessionToken = baseStore.currentSessionToken;
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
    const baseStore = useBaseStore();
    const currentUser = baseStore.currentUser;
    const currentSessionToken = baseStore.currentSessionToken;
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
    const baseStore = useBaseStore();
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    if (baseStore) {
        baseStore.isConnected = false;
    }
}

// 发送已读消息事件
function sendReadMessageEvent(type, options = {}) {
    if (!socket) {
        console.warn('WebSocket 未连接，无法发送已读消息事件');
        return;
    }

    const baseStore = useBaseStore();
    const currentUser = baseStore.currentUser;
    const currentSessionToken = baseStore.currentSessionToken;

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
  avatarVersions,
  sendReadMessageEvent,
  loadMessages
};