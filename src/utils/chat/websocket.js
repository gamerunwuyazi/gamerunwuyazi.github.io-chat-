import { SERVER_URL, io, toast } from './config.js';
import { 
  getStore, 
  getCurrentUser, 
  getCurrentSessionToken, 
  unreadMessages 
} from './store.js';
import { unescapeHtml } from './message.js';
import { updateUnreadCountsDisplay, updateTitleWithUnreadCount, currentUser, currentSessionToken, currentGroupId, currentActiveChat, isPageVisible, logout } from './ui.js';
import { loadGroupList } from './group.js';

let isConnected = false;
let avatarVersions = {};

function updateUserList(users) {
  if (!Array.isArray(users)) {
    console.error('Invalid users data:', users);
    users = [];
  }

  const store = getStore();
  if (store) {
    store.onlineUsers = [...users];
    
    // 重新加载离线用户列表，确保过滤掉新的在线用户
    if (window.loadOfflineUsers) {
      window.loadOfflineUsers();
    }
  }
}


function initializeWebSocket() {
    // 实现真实的WebSocket连接 - 使用Socket.io

    // 使用Socket.io连接到服务器
    const socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: true
    });

    // 连接成功事件
    socket.on('connect', () => {
        isConnected = true;

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

                    // 立即请求在线用户列表
                    socket.emit('get-online-users');

                    // 如果正在群组聊天，加入群组并使用新事件获取群组聊天历史
                    if (currentGroupId) {
                        // console.log(`📥 准备获取群组聊天历史 - 群组ID: ${currentGroupId}, 用户ID: ${currentUser.id}`);

                        // 加入群组
                        socket.emit('join-group', {
                            groupId: currentGroupId,
                            sessionToken: currentSessionToken,
                            userId: currentUser.id
                        });

                        // 使用新的WebSocket事件获取群组聊天历史
                        const historyRequest = {
                            groupId: currentGroupId,
                            userId: currentUser.id,
                            sessionToken: currentSessionToken,
                            limit: 20
                        };
                        // console.log(`📡 发送群组聊天历史请求 - 事件: get-group-chat-history, 请求参数:`, historyRequest);
                        socket.emit('get-group-chat-history', historyRequest);
                    }

                    // 启用消息发送功能
                    enableMessageSending();
                }
            });
        }
    });

    // 重连事件
    socket.on('reconnect', (attemptNumber) => {
        
        isConnected = true;

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

                    // 立即请求在线用户列表
                    socket.emit('get-online-users');

                    // 如果正在群组聊天，重新加入群组并使用新事件获取群组聊天历史
                    if (currentGroupId) {
                        // console.log(`📥 重连后获取群组聊天历史 - 群组ID: ${currentGroupId}, 用户ID: ${currentUser.id}`);

                        // 重新加入群组
                        socket.emit('join-group', {
                            groupId: currentGroupId,
                            sessionToken: currentSessionToken,
                            userId: currentUser.id
                        });

                        // 使用新的WebSocket事件获取群组聊天历史
                        const historyRequest = {
                            groupId: currentGroupId,
                            userId: currentUser.id,
                            sessionToken: currentSessionToken,
                            limit: 20
                        };
                        // console.log(`📡 重连后发送群组聊天历史请求 - 事件: get-group-chat-history, 请求参数:`, historyRequest);
                        socket.emit('get-group-chat-history', historyRequest);
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

    // 接收消息事件
    socket.on('message-received', (message) => {
        // 检查消息中是否包含新的会话令牌
        if (message.sessionToken) {
            // 更新会话令牌
            currentSessionToken = message.sessionToken;
            localStorage.setItem('currentSessionToken', currentSessionToken);
        }

        const store = window.chatStore;
        const pageVisible = (window.isPageVisible !== undefined ? window.isPageVisible : true) && document.hasFocus();
        
        // 检查消息是否包含群组ID
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
            
            // 更新群组未读计数 - 如果不是自己发送的消息且不在当前群组页面或浏览器没有焦点
            const isOwnMessage = String(currentUser.id) === String(message.userId);
            const isBrowserNotFocused = !document.hasFocus();
            if (!isOwnMessage && (currentActiveChat !== `group_${message.groupId}` || isBrowserNotFocused)) {
                const groupIdStr = String(message.groupId);
                if (store && store.unreadMessages) {
                    store.unreadMessages.groups[groupIdStr] = (store.unreadMessages.groups[groupIdStr] || 0) + 1;
                }
                updateUnreadCountsDisplay();
                updateTitleWithUnreadCount();
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
            
            // 更新公共聊天未读计数 - 如果不是自己发送的消息且页面不可见或浏览器没有焦点
            const isOwnMessage = String(currentUser.id) === String(message.userId);
            const isPageInvisible = window.isPageVisible === false;
            const isBrowserNotFocused = !document.hasFocus();
            if (!isOwnMessage && (isPageInvisible || isBrowserNotFocused)) {
                if (store && store.unreadMessages) {
                    store.unreadMessages.global = (store.unreadMessages.global || 0) + 1;
                }
                updateUnreadCountsDisplay();
                updateTitleWithUnreadCount();
            }
        }
    });

    // 接收消息发送确认事件 - 已禁用，避免消息重复显示
    // socket.on('message-sent', (data) => {
    //     // 检查是否包含完整的消息数据
    //     if (data.message) {
    //         const message = data.message;
    //         // 标记为实时消息
    //         message.isHistory = false;

    //         // 检查消息是否包含群组ID
    //         if (message.groupId) {
    //             // 如果当前正在该群组聊天中，自动将群组移到列表顶部
    //             if (currentGroupId === String(message.groupId)) {
    //                 moveGroupToTop(message.groupId);
    //             }
    //             // 如果是群组消息，直接显示，不更新未读计数（自己发送的消息）
    //             displayGroupMessage(message);
    //         } else {
    //             // 否则显示普通消息
    //             displayMessage(message);
    //         }
    //     }
    // });

    // 接收群组消息事件 - 已禁用，避免消息重复显示
    // socket.on('group-message-received', (message) => {
    //     // 检查消息中是否包含新的会话令牌
    //     if (message.sessionToken) {
    //         // 更新会话令牌
    //         currentSessionToken = message.sessionToken;
    //         localStorage.setItem('currentSessionToken', currentSessionToken);
    //     }

    //     // 检查是否是历史消息：当消息没有isHistory标记但有timestamp且不是刚刚发送的，视为历史消息
    //     // 这样可以避免与group-chat-history事件处理函数中的向下滚动逻辑重复执行
    //     const now = Date.now();
    //     const messageTime = message.timestamp ? new Date(message.timestamp).getTime() : now;
    //     const isRecentMessage = now - messageTime < 10000; // 10秒内的消息视为实时消息
    //     message.isHistory = message.isHistory || !isRecentMessage;
        
    //     // 如果当前正在该群组聊天中，自动将群组移到列表顶部
    //     // 注意：后端发送的消息中使用groupId属性
    //     const msgGroupId = message.groupId || message.group_id;
    //     if (msgGroupId && currentGroupId === String(msgGroupId)) {
    //         moveGroupToTop(msgGroupId);
    //     }
        
    //     // 只显示消息，不重复更新未读计数（已在message-received事件中处理）
    //     displayGroupMessage(message);
    // });

    // 在线用户更新事件
    socket.on('online-users', (users) => {
        updateUserList(users);
    });

    // 用户列表更新事件（兼容旧事件名）
    socket.on('users-updated', (users) => {
        updateUserList(users);
        // 刷新好友列表，确保昵称已更新
        loadFriendsList();
    });

    // 群组列表更新事件
    socket.on('group-list', (groups) => {
        updateGroupList(groups);
    });

    // 群组创建事件
    socket.on('group-created', () => {
        loadGroupList();
    });

    // 群组删除事件
    socket.on('group-deleted', () => {
        loadGroupList();
    });

    // 群组解散事件
    socket.on('group-dissolved', () => {
        loadGroupList();
    });

    // 好友删除事件
    socket.on('friend-removed', () => {
        // 刷新好友列表
        loadFriendsList();
    });

    // 头像更新事件
    socket.on('avatar-updated', (data) => {
        // 刷新所有相关的头像显示
        if (data.userId && data.avatarUrl) {
            // 更新头像版本号
            if (!avatarVersions[data.userId]) {
                avatarVersions[data.userId] = 0;
            }
            avatarVersions[data.userId]++;
            
            // 刷新好友列表中的头像
            loadFriendsList();
            // 刷新群组列表中的头像
            loadGroupList();
            // 刷新当前聊天界面中的头像
            if (currentPrivateChatUserId) {
                // 如果当前在私信聊天，刷新私信界面的头像
                const privateUserAvatar = document.querySelector('#privateChatInterface .chat-avatar img');
                if (privateUserAvatar && currentPrivateChatUserId === data.userId) {
                    // 添加版本号参数强制刷新
                    privateUserAvatar.src = `${SERVER_URL}${data.avatarUrl}?v=${avatarVersions[data.userId]}`;
                }
            }
        }
    });

    // 聊天历史记录事件
    socket.on('chat-history', (data) => {
        // 检查历史记录响应中是否包含新的会话令牌
        if (data.sessionToken) {
            // 更新会话令牌
            currentSessionToken = data.sessionToken;
            localStorage.setItem('currentSessionToken', currentSessionToken);
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
        let processedUnreadMessages = {
            global: 0,
            groups: {},
            private: {}
        };

        // 处理群组未读消息
        if (data.unreadMessages) {
            if (data.unreadMessages && typeof data.unreadMessages === 'object' && !Object.prototype.hasOwnProperty.call(data.unreadMessages, 'global')) {
                // 格式转换：将直接的群组键值对转换为包含global和groups的对象
                processedUnreadMessages.groups = data.unreadMessages;
            } else {
                processedUnreadMessages.groups = data.unreadMessages.groups || {};
                processedUnreadMessages.global = data.unreadMessages.global || 0;
            }
        }

        // 处理私信未读消息
        if (data.unreadPrivateMessages) {
            processedUnreadMessages.private = data.unreadPrivateMessages;
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
                        window.chatSocket.emit('join-group', {
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

        // 以下旧的 DOM 操作代码已禁用，使用 Vue 响应式渲染
        /*
        const messageContainer = document.getElementById('messageContainer');
        if (!messageContainer) return;

        const emptyState = messageContainer.querySelector('.empty-state');

        // 只有登录状态才加载和显示聊天历史
        if (currentUser && currentSessionToken) {
            // 如果是首次加载，清空容器
            if (!hasReceivedHistory) {
                messageContainer.innerHTML = '';
                hasReceivedHistory = true;
            }

            if (!data.messages || !Array.isArray(data.messages) || data.messages.length === 0) {
                if (emptyState) {
                    emptyState.style.display = 'block';
                }
                // 重置加载状态
                if (window.resetLoadingState) {
                    window.resetLoadingState();
                }
                return;
            }

            if (emptyState) {
                emptyState.style.display = 'none';
            }

            // 对消息进行排序，优先使用sequence字段
            const sortedMessages = [...data.messages].sort((a, b) => {
                if (a.sequence !== undefined && b.sequence !== undefined) {
                    return b.sequence - a.sequence; // 降序排列（新消息在前）
                }
                return b.timestamp - a.timestamp;
            });

            // 对于首次加载的消息，我们需要反转顺序，确保最早的消息在顶部
            // 对于加载更多的消息，保持原始顺序
            const messagesToRender = data.loadMore ? sortedMessages : sortedMessages.reverse();

            // 创建已处理消息ID集合，避免同一批加载中重复处理
            const processedMessageIds = new Set();

            // 先收集当前已存在的消息ID
            const existingMessages = messageContainer.querySelectorAll('[data-id]');
            existingMessages.forEach(msg => {
                processedMessageIds.add(msg.getAttribute('data-id'));
            });

            // 保存当前滚动位置和高度，用于恢复（仅在加载更多时）
            let prevScrollHeight, prevScrollTop;
            if (data.loadMore) {
                prevScrollHeight = messageContainer.scrollHeight;
                prevScrollTop = messageContainer.scrollTop;
            }

            // 一次性渲染所有消息
            messagesToRender.forEach(message => {
                // 确保消息有必要的属性
                if (!message || !message.id) {
                    return;
                }

                // 检查消息ID是否已经处理过，避免重复
                if (processedMessageIds.has(String(message.id))) {
                    return;
                }

                // 标记为已处理
                processedMessageIds.add(String(message.id));

                // 对于加载更多的消息，返回元素并插入到顶部
                if (data.loadMore) {
                    const messageElement = displayMessage(message, true);
                    if (messageElement) {
                        messageContainer.insertBefore(messageElement, messageContainer.firstChild);
                    }
                } else {
                    // 正常加载，直接添加到容器
                    displayMessage(message);
                }
            });

            // 恢复滚动位置，确保用户体验流畅（仅在加载更多时）
            if (data.loadMore && prevScrollHeight !== undefined && prevScrollTop !== undefined) {
                const newScrollHeight = messageContainer.scrollHeight;
                const heightDifference = newScrollHeight - prevScrollHeight;
                messageContainer.scrollTop = prevScrollTop + heightDifference;
            } else if (!data.loadMore) {
                // 首次加载时滚动到底部
                messageContainer.scrollTop = messageContainer.scrollHeight;
            }
        }

        // 重置加载状态
        if (window.resetLoadingState) {
            window.resetLoadingState();
        }
        */
    });

    // 群组聊天历史记录事件
    socket.on('group-chat-history', (data) => {
        // console.log(`📥 收到群组聊天历史响应 - 群组ID: ${data.groupId || currentGroupId}, 消息数量: ${data.messages ? data.messages.length : 0}, 是否加载更多: ${data.loadMore ? '是' : '否'}`);

        // 检查历史记录响应中是否包含新的会话令牌
        if (data.sessionToken) {
            // console.log(`🔄 更新会话令牌 - 来自群组聊天历史响应`);
            // 更新会话令牌
            currentSessionToken = data.sessionToken;
            localStorage.setItem('currentSessionToken', currentSessionToken);
        }

        const store = window.chatStore;
        const groupId = data.groupId || currentGroupId;
        if (store && data.messages && groupId) {
            if (data.loadMore && store.prependGroupMessages) {
                store.prependGroupMessages(groupId, data.messages);
            } else if (store.setGroupMessages) {
                store.setGroupMessages(groupId, data.messages);
            }
        }

        // 处理未读消息信息
        if (data.unreadMessages) {
            // 检查数据格式：如果是直接的群组键值对，则转换为期望的格式
            let processedUnreadMessages = data.unreadMessages;
            if (processedUnreadMessages && typeof processedUnreadMessages === 'object' && !Object.prototype.hasOwnProperty.call(processedUnreadMessages, 'global')) {
                // 格式转换：将直接的群组键值对转换为包含global和groups的对象
                processedUnreadMessages = {
                    global: 0,
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
                            window.chatSocket.emit('join-group', {
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

        // 以下旧的 DOM 操作代码已禁用，使用 Vue 响应式渲染
        /*
        const groupMessageContainer = document.getElementById('groupMessageContainer');
        if (!groupMessageContainer) {
            // console.error('❌ 群组消息容器不存在 - 无法显示历史消息');
            // 重置加载状态
            if (window.resetLoadingState) {
                window.resetLoadingState();
            }
            return;
        }

        const groupEmptyState = groupMessageContainer.querySelector('.empty-state');

        // 只有登录状态才加载和显示聊天历史
        if (currentUser && currentSessionToken) {
            // 如果是首次加载，清空容器
            if (!hasReceivedGroupHistory) {
                groupMessageContainer.innerHTML = '';
                hasReceivedGroupHistory = true;
            }

            // 修复：处理加载更多返回0条消息的情况
            if (data.loadMore && (!data.messages || !Array.isArray(data.messages) || data.messages.length === 0)) {
                // console.log(`📥 加载更多返回0条消息 - 已到达群组聊天历史尽头');
                // 重置加载状态
                if (window.resetLoadingState) {
                    window.resetLoadingState();
                }
                return;
            }

            if (!data.messages || !Array.isArray(data.messages) || data.messages.length === 0) {
                // 没有消息时，显示空状态
                groupMessageContainer.innerHTML = `
                    <div class="empty-state">
                        <h3>暂无消息</h3>
                        <p>发送第一条消息开始群聊吧!</p>
                    </div>
                `;
                // 重置加载状态
                if (window.resetLoadingState) {
                    window.resetLoadingState();
                }
                return;
            }

            if (groupEmptyState) {
                groupEmptyState.style.display = 'none';
            }

            // 对消息进行排序，优先使用sequence字段
            const sortedMessages = [...data.messages].sort((a, b) => {
                if (a.sequence !== undefined && b.sequence !== undefined) {
                    return b.sequence - a.sequence; // 降序排列（新消息在前）
                }
                return b.timestamp - a.timestamp;
            });

            // 对于首次加载的消息，我们需要反转顺序，确保最早的消息在顶部
            // 对于加载更多的消息，保持原始顺序
            const messagesToRender = data.loadMore ? sortedMessages : sortedMessages.reverse();

            // 创建已处理消息ID集合，避免同一批加载中重复处理
            const processedMessageIds = new Set();

            // 先收集当前已存在的消息ID
            const existingMessages = groupMessageContainer.querySelectorAll('[data-id]');
            existingMessages.forEach(msg => {
                processedMessageIds.add(msg.getAttribute('data-id'));
            });

            // 保存当前滚动位置和高度，用于恢复（仅在加载更多时）
            let prevScrollHeight, prevScrollTop;
            if (data.loadMore) {
                prevScrollHeight = groupMessageContainer.scrollHeight;
                prevScrollTop = groupMessageContainer.scrollTop;
            }

            // 一次性渲染所有消息
            if (data.loadMore) {
                // 对于加载更多的消息，从旧到新顺序，插入到顶部
                messagesToRender.forEach(message => {
                    // 确保消息有必要的属性
                    if (!message || !message.id) {
                        return;
                    }

                    // 检查消息ID是否已经处理过，避免重复
                    if (processedMessageIds.has(String(message.id))) {
                        return;
                    }

                    // 标记为已处理
                    processedMessageIds.add(String(message.id));

                    // 标记为历史消息
                    message.isHistory = true;
                    const messageElement = displayGroupMessage(message, true);
                    if (messageElement) {
                        groupMessageContainer.insertBefore(messageElement, groupMessageContainer.firstChild);
                    }
                });
            } else {
                // 对于首次加载的消息，从旧到新顺序，添加到末尾
                // messagesToRender已经是反转后的顺序（最早消息在前），直接按顺序渲染
                messagesToRender.forEach(message => {
                    // 确保消息有必要的属性
                    if (!message || !message.id) {
                        return;
                    }

                    // 检查消息ID是否已经处理过，避免重复
                    if (processedMessageIds.has(String(message.id))) {
                        return;
                    }

                    // 标记为已处理
                    processedMessageIds.add(String(message.id));

                    // 标记为历史消息
                    message.isHistory = true;
                    // 正常加载，直接添加到容器
                    displayGroupMessage(message);
                });
            }

            // 恢复滚动位置，确保用户体验流畅
            if (data.loadMore && prevScrollHeight !== undefined && prevScrollTop !== undefined) {
                // 加载更多后，保持用户原来的相对位置
                const newScrollHeight = groupMessageContainer.scrollHeight;
                const heightDifference = newScrollHeight - prevScrollHeight;
                groupMessageContainer.scrollTop = prevScrollTop + heightDifference;
            } else {
                // 首次加载时，确保滚动到底部
                setTimeout(() => {
                    groupMessageContainer.scrollTop = groupMessageContainer.scrollHeight;
                }, 0);
            }
        }

        // 重置加载状态
        if (window.resetLoadingState) {
            window.resetLoadingState();
        }
        */
    });

    // 用户加入聊天室响应事件
    socket.on('user-joined-response', (data) => {
        // 检查响应中是否包含新的会话令牌
        if (data.sessionToken) {
            // 更新会话令牌
            currentSessionToken = data.sessionToken;
            localStorage.setItem('currentSessionToken', currentSessionToken);
        }

        // 处理未读消息信息
        if (data.unreadMessages) {
            // 检查数据格式：如果是直接的群组键值对，则转换为期望的格式
            let processedUnreadMessages = data.unreadMessages;
            if (processedUnreadMessages && typeof processedUnreadMessages === 'object' && !Object.prototype.hasOwnProperty.call(processedUnreadMessages, 'global')) {
                // 格式转换：将直接的群组键值对转换为包含global和groups的对象
                processedUnreadMessages = {
                    global: 0,
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
                            window.chatSocket.emit('join-group', {
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
            currentSessionToken = data.sessionToken;
            localStorage.setItem('currentSessionToken', currentSessionToken);
        }
    });

    // 连接关闭事件
    socket.on('disconnect', () => {
        
        isConnected = false;
        // 禁用消息发送功能
        disableMessageSending();
    });

    // 连接错误事件
    socket.on('error', (error) => {
        
        isConnected = false;
        disableMessageSending();
    });

    // 处理原始WebSocket消息
    // 服务器可能会直接发送["session-expired"]格式的消息
    socket.on('message', (data) => {
        // 检查是否是会话过期消息
        if (Array.isArray(data) && data[0] === 'session-expired') {
            toast.error('会话已过期或在其他设备登录，请重新登录');
            logout();
        }
    });

    // 会话过期事件
    socket.on('session-expired', () => {
        toast.error('会话已过期或在其他设备登录，请重新登录');
        logout();
    });

    // 账户被封禁事件
    socket.on('account-banned', (data) => {
        const message = `您的IP已被封禁，${data.message || '无法访问'}`;
        toast.error(message);
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
    socket.on('group-name-updated', (data) => {
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

    // 私信消息接收事件 - 已禁用，避免消息重复显示
    // socket.on('private-message-sent', (data) => {
    //     // 检查是否包含完整的消息数据
    //     if (data.message) {
    //         const message = data.message;
    //         // 标记为实时消息
    //         message.isHistory = false;
    //         // 显示私信消息
    //         renderPrivateMessage(message);
    //     }
    // });

    // 私信消息接收事件
    socket.on('private-message-received', (message) => {
        // 检查消息中是否包含新的会话令牌
        if (message.sessionToken) {
            // 更新会话令牌
            currentSessionToken = message.sessionToken;
            localStorage.setItem('currentSessionToken', currentSessionToken);
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

        // 显示私信消息 - 已禁用，使用 Vue 响应式渲染
        // renderPrivateMessage(message);

        if (store && store.addPrivateMessage) {
            store.addPrivateMessage(chatPartnerId, message);
        }

        // 更新未读计数
        // 如果页面不可见，或者用户不在当前私信聊天中，或者浏览器没有焦点，添加未读计数
        // 排除自己发送的消息
        const isOwnMessage = String(currentUser.id) === String(msgSenderId);
        const isPageInvisible = window.isPageVisible === false;
        const isBrowserNotFocused = !document.hasFocus();
        if (!isOwnMessage && (isPageInvisible || isBrowserNotFocused || currentActiveChat !== `private_${msgSenderId}`)) {
            // 更新未读消息计数
            if (store && store.unreadMessages) {
                store.unreadMessages.private[msgSenderId] = (store.unreadMessages.private[msgSenderId] || 0) + 1;
            }
            updateUnreadCountsDisplay();
            updateTitleWithUnreadCount();
        }
    });

    // 好友列表更新事件
    socket.on('friend-list-updated', (data) => {
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

    // 私信聊天历史记录事件
    socket.on('private-chat-history', (data) => {
        // 检查历史记录响应中是否包含新的会话令牌
        if (data.sessionToken) {
            // 更新会话令牌
            currentSessionToken = data.sessionToken;
            localStorage.setItem('currentSessionToken', currentSessionToken);
        }

        const store = window.chatStore;
        // 优先从 data 中获取 userId，其次使用 currentPrivateChatUserId
        let userId = data.userId || currentPrivateChatUserId;
        
        // 如果还是没有 userId，尝试从消息中推断
        if (!userId && data.messages && data.messages.length > 0) {
            const firstMessage = data.messages[0];
            const msgSenderId = String(firstMessage.senderId);
            const msgReceiverId = String(firstMessage.receiverId);
            userId = String(currentUser.id) === msgReceiverId ? msgSenderId : msgReceiverId;
        }

        if (store && data.messages && userId) {
            if (data.loadMore && store.prependPrivateMessages) {
                store.prependPrivateMessages(userId, data.messages);
            } else if (store.setPrivateMessages) {
                store.setPrivateMessages(userId, data.messages);
            }
        }

        // 以下旧的 DOM 操作代码已禁用，使用 Vue 响应式渲染
        /*
        const privateMessageContainer = document.getElementById('privateMessageContainer');
        if (!privateMessageContainer) {
            // 重置加载状态
            if (window.resetLoadingState) {
                window.resetLoadingState();
            }
            return;
        }

        // 只有登录状态才加载和显示聊天历史
        if (currentUser && currentSessionToken) {
            // 如果是首次加载，清空容器
            if (!hasReceivedPrivateHistory || !data.loadMore) {
                privateMessageContainer.innerHTML = '';
                hasReceivedPrivateHistory = true;
            }

            // 处理加载更多返回0条消息的情况
            if (data.loadMore && (!data.messages || !Array.isArray(data.messages) || data.messages.length === 0)) {
                // 重置加载状态
                if (window.resetLoadingState) {
                    window.resetLoadingState();
                }
                return;
            }

            // 处理私信聊天历史记录
            if (data.messages && Array.isArray(data.messages)) {
                if (data.messages.length === 0) {
                    // 没有消息时显示友好的空状态
                    privateMessageContainer.innerHTML = `
                        <div class="empty-state">
                            <div class="empty-icon">💬</div>
                            <h3>暂无消息</h3>
                            <p>发送第一条消息开始你们的对话吧!</p>
                        </div>
                    `;
                } else {
                    // 移除空状态
                    const emptyElement = privateMessageContainer.querySelector('.empty-state');
                    if (emptyElement) {
                        emptyElement.remove();
                    }

                    // 对消息进行排序，优先使用sequence字段
                    const sortedMessages = [...data.messages].sort((a, b) => {
                        if (a.sequence !== undefined && b.sequence !== undefined) {
                            return b.sequence - a.sequence; // 降序排列（新消息在前）
                        }
                        return new Date(b.timestampISO || b.created_at || b.timestamp) - new Date(a.timestampISO || a.created_at || a.timestamp);
                    });

                    // 对于首次加载的消息，我们需要反转顺序，确保最早的消息在顶部
                    // 对于加载更多的消息，保持原始顺序
                    const messagesToRender = data.loadMore ? sortedMessages : sortedMessages.reverse();

                    // 创建已处理消息ID集合，避免同一批加载中重复处理
                    const processedMessageIds = new Set();

                    // 先收集当前已存在的消息ID
                    const existingMessages = privateMessageContainer.querySelectorAll('[data-id]');
                    existingMessages.forEach(msg => {
                        processedMessageIds.add(msg.getAttribute('data-id'));
                    });

                    // 保存当前滚动位置和高度，用于恢复（仅在加载更多时）
                    let prevScrollHeight, prevScrollTop;
                    if (data.loadMore) {
                        prevScrollHeight = privateMessageContainer.scrollHeight;
                        prevScrollTop = privateMessageContainer.scrollTop;
                    }

                    // 一次性渲染所有消息
                    if (data.loadMore) {
                        // 对于加载更多的消息，从旧到新顺序，插入到顶部
                        messagesToRender.forEach(message => {
                            // 确保消息有必要的属性
                            if (!message || !message.id) {
                                return;
                            }

                            // 检查消息ID是否已经处理过，避免重复
                            if (processedMessageIds.has(String(message.id))) {
                                return;
                            }

                            // 标记为已处理
                            processedMessageIds.add(String(message.id));

                            // 标记为历史消息
                            message.isHistory = true;
                            const messageElement = renderPrivateMessage(message, true);
                            if (messageElement) {
                                privateMessageContainer.insertBefore(messageElement, privateMessageContainer.firstChild);
                            }
                        });
                    } else {
                        // 对于首次加载的消息，从旧到新顺序，添加到末尾
                        messagesToRender.forEach(message => {
                            // 确保消息有必要的属性
                            if (!message || !message.id) {
                                return;
                            }

                            // 检查消息ID是否已经处理过，避免重复
                            if (processedMessageIds.has(String(message.id))) {
                                return;
                            }

                            // 标记为已处理
                            processedMessageIds.add(String(message.id));

                            // 标记为历史消息
                            message.isHistory = true;
                            // 正常加载，直接添加到容器
                            renderPrivateMessage(message);
                        });
                    }

                    // 恢复滚动位置，确保用户体验流畅
                    if (data.loadMore && prevScrollHeight !== undefined && prevScrollTop !== undefined) {
                        // 加载更多后，保持用户原来的相对位置
                        const newScrollHeight = privateMessageContainer.scrollHeight;
                        const heightDifference = newScrollHeight - prevScrollHeight;
                        privateMessageContainer.scrollTop = prevScrollTop + heightDifference;
                    } else if (!data.loadMore) {
                        // 首次加载时滚动到底部
                        privateMessageContainer.scrollTop = privateMessageContainer.scrollHeight;
                    }
                }
            } else {
                // 没有消息数据时显示友好的空状态
                privateMessageContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">💬</div>
                        <h3>暂无消息</h3>
                        <p>发送第一条消息开始你们的对话吧!</p>
                    </div>
                `;
            }
        }

        // 重置加载状态
        if (window.resetLoadingState) {
            window.resetLoadingState();
        }
        */
    });

    // 保存socket实例
    window.chatSocket = socket;

    // 导出获取聊天历史的函数，供外部调用
    window.getChatHistory = function(options = {}) {
        if (!window.chatSocket) return;

        window.chatSocket.emit('get-chat-history', {
            userId: currentUser.id,
            sessionToken: currentSessionToken,
            loadMore: options.loadMore || false,
            olderThan: options.olderThan || null,
            limit: options.limit || 20
        });
    };

    // 导出获取群组聊天历史的函数，供外部调用
    window.getGroupChatHistory = function(groupId, options = {}) {
        if (!window.chatSocket || !groupId) {
            console.warn('⚠️  无法获取群组聊天历史 - WebSocket未连接或群组ID无效');
            return;
        }

        const historyOptions = {
            userId: currentUser.id,
            sessionToken: currentSessionToken,
            groupId: groupId,
            loadMore: options.loadMore || false,
            olderThan: options.olderThan || null,
            limit: options.limit || 20
        };

        if (historyOptions.loadMore) {
            // console.log(`📥 请求加载更多群组聊天历史 - 群组ID: ${groupId}, 限制: ${historyOptions.limit}, 更早于: ${historyOptions.olderThan || '最新'}`);
        } else {
            // console.log(`📥 请求刷新群组聊天历史 - 群组ID: ${groupId}, 限制: ${historyOptions.limit}`);
        }

        window.chatSocket.emit('get-group-chat-history', historyOptions);
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

    // 更新所有消息中的昵称显示函数
    window.updateAllMessagesNickname = function updateAllMessagesNickname(userId, newNickname) {
        // 确保参数有效性
        if (!userId || typeof userId !== 'string' || !newNickname || typeof newNickname !== 'string') {
            return;
        }

        // 更新所有聊天记录中该用户的历史消息昵称（包括主聊天和群聊）
        const messages = document.querySelectorAll('.message');
        messages.forEach(message => {
            const messageHeader = message.querySelector('.message-header');
            if (messageHeader) {
                // 检查消息是否属于目标用户
                const isOwn = message.classList.contains('own-message');
                if (isOwn && currentUser && String(currentUser.id) === String(userId)) {
                    // 更新自己的消息昵称
                    const senderNickname = messageHeader.querySelector('.message-sender');
                    if (senderNickname) {
                        senderNickname.textContent = newNickname;
                    }
                } else {
                    // 检查其他用户的消息
                    // 这里需要根据实际的消息结构进行调整
                    // 假设消息中包含data-user-id属性
                    const messageUserId = message.getAttribute('data-user-id');
                    if (messageUserId && String(messageUserId) === String(userId)) {
                        const senderNickname = messageHeader.querySelector('.message-sender');
                        if (senderNickname) {
                            senderNickname.textContent = newNickname;
                        }
                    }
                }
            }
        });
    };
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
 */
function checkUserAndIPStatus(callback) {
    // 构建请求头，包含会话令牌
    const headers = {
        'Content-Type': 'application/json'
    };
    
    // 如果有会话令牌，添加到请求头中
    if (currentSessionToken) {
        headers['session-token'] = currentSessionToken;
    }
    
    fetch(`${SERVER_URL}/check-status`, {
        method: 'GET',
        headers: headers
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP错误! 状态码: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {

            // 检查IP是否被封禁，根据后端返回的isBanned字段判断
            if (data.isBanned) {
                const message = `您的IP已被封禁，${data.message || '无法访问'}`;
                toast.error(message);
                logout();
                callback(false);
                return;
            }

            // 如果有用户登录，检查用户是否仍然存在
            if (currentUser && !data.userExists) {
                toast.error('您的账户可能已被删除或禁用，请联系管理员。');
                logout();
                callback(false);
                return;
            }

            // 检查通过
            callback(true);
        })
        .catch(() => {
            // 检查失败时，允许继续连接（容错处理）
            callback(true);
        });
}

/**
 * 加载离线用户列表
 */
function loadOfflineUsers() {
    if (!currentUser || !currentSessionToken) return;

    fetch(`${SERVER_URL}/offline-users`, {
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        }
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                updateOfflineUserList(data.users);
            }
        });
}

/**
 * 更新离线用户列表（过滤掉在线用户）
 * @param {Array} users - 从服务器获取的离线用户列表
 */
function updateOfflineUserList(users) {
    if (!users || !Array.isArray(users)) {
        users = [];
    }

    const store = getStore();
    
    // 过滤掉在线用户
    const filteredOfflineUsers = users.filter(offlineUser => {
        if (!store || !store.onlineUsers) {
            return true;
        }
        return !store.onlineUsers.some(onlineUser => onlineUser.id == offlineUser.id);
    });

    // 直接更新store
    if (store) {
        store.offlineUsers = [...filteredOfflineUsers];
    }
}

export {
  initializeWebSocket,
  enableMessageSending,
  disableMessageSending,
  checkUserAndIPStatus,
  loadOfflineUsers,
  updateOfflineUserList,
  isConnected,
  avatarVersions
};