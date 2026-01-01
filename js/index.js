// 新聊天界面的JavaScript代码
// 参考原UI的JS代码实现核心功能

document.addEventListener('DOMContentLoaded', function() {
    const SERVER_URL = 'https://back.hs.airoe.cn';
    
    // 初始化变量
        let currentUser = null;
        let currentSessionToken = null;
        let isConnected = false;
        let currentGroupId = null;
        let currentGroupName = '';
        let onlineUsersList = [];
        let hasReceivedHistory = false; // 用于跟踪是否已经接收过普通聊天历史记录
        let hasReceivedGroupHistory = false; // 用于跟踪是否已经接收过群组聊天历史记录
        let originalTitle = document.title; // 保存原始标题
        let unreadMessages = { global: 0, groups: {} }; // 未读消息计数
        let isPageVisible = true; // 页面可见性状态
        let currentActiveChat = 'main'; // 当前活动聊天室：'main'或群组ID
        let lastNotificationTime = 0; // 最后通知时间，用于控制通知频率
    
    // 更新用户头像显示
    function updateUserAvatar() {
        const currentUserAvatar = document.getElementById('currentUserAvatar');
        const userInitials = document.getElementById('userInitials');
        
        if (!currentUser || !currentUserAvatar || !userInitials) return;
        
        // 获取用户头像URL，支持多种格式
        let avatarUrl = '';
        if (currentUser.avatar && typeof currentUser.avatar === 'string') {
            avatarUrl = currentUser.avatar.trim();
        } else if (currentUser.avatarUrl && typeof currentUser.avatarUrl === 'string') {
            avatarUrl = currentUser.avatarUrl.trim();
        }
        
        // 检查头像URL是否为SVG格式，如果是则使用默认头像，防止SVG XSS攻击
        const isSvgAvatar = avatarUrl && /\.svg$/i.test(avatarUrl);
        
        if (avatarUrl && !isSvgAvatar) {
            // 显示用户头像，隐藏默认头像
            const fullAvatarUrl = `${SERVER_URL}${avatarUrl}`;
            currentUserAvatar.src = fullAvatarUrl;
            currentUserAvatar.style.display = 'block';
            userInitials.style.display = 'none';
        } else {
            // 显示用户首字母，隐藏真实头像（包括SVG格式头像）
            const initials = currentUser.nickname ? currentUser.nickname.charAt(0).toUpperCase() : 'U';
            userInitials.textContent = initials;
            userInitials.style.display = 'block';
            currentUserAvatar.style.display = 'none';
        }
    }
    
    // 退出登录函数
    function logout() {
        
        // 断开WebSocket连接
        if (window.chatSocket) {
            window.chatSocket.disconnect();
        }
        
        // 清除localStorage
        localStorage.removeItem('currentUser');
        localStorage.removeItem('currentSessionToken');
        localStorage.removeItem('chatUserId');
        localStorage.removeItem('chatUserNickname');
        localStorage.removeItem('chatSessionToken');
        localStorage.removeItem('chatUserAvatar');
        
        // 重置变量
        currentUser = null;
        currentSessionToken = null;
        isConnected = false;
        currentGroupId = null;
        currentGroupName = '';
        onlineUsersList = [];
        
        // 跳转到登录页面
        window.location.href = 'login.html';
    }
    
    // 检查用户是否已登录
    function checkLoginStatus() {
        let savedUser = localStorage.getItem('currentUser');
        let savedToken = localStorage.getItem('currentSessionToken');
        
        // 兼容处理：如果没有找到新的localStorage键，尝试从旧键获取（与原UI一致）
        if (!savedUser || !savedToken) {
            const chatUserId = localStorage.getItem('chatUserId');
            const chatUserNickname = localStorage.getItem('chatUserNickname');
            const chatSessionToken = localStorage.getItem('chatSessionToken');
            const chatUserAvatar = localStorage.getItem('chatUserAvatar');
            
            if (chatUserId && chatSessionToken) {
                // 从旧键构造用户信息
                savedUser = JSON.stringify({
                    id: chatUserId,
                    nickname: chatUserNickname || '',
                    avatarUrl: chatUserAvatar || null
                });
                savedToken = chatSessionToken;
                
                // 保存到新的localStorage键，确保后续使用统一
                localStorage.setItem('currentUser', savedUser);
                localStorage.setItem('currentSessionToken', savedToken);
            }
        }
        
        if (savedUser && savedToken) {
            currentUser = JSON.parse(savedUser);
            currentSessionToken = savedToken;
            
            // 更新用户头像显示
            updateUserAvatar();
            
            initializeChat();
        } else {
            // 未登录，跳转到登录页面
            window.location.href = 'login.html';
        }
    }
    
    // 初始化聊天功能
    function initializeChat() {
        // 初始化WebSocket连接
        initializeWebSocket();
        
        // 初始化消息发送功能
        initializeMessageSending();
        
        // 初始化群组功能
        initializeGroupFunctions();
        
        // 初始化设置功能
        initializeSettingsFunctions();
        
        // 初始化页面焦点事件监听
        initializeFocusListeners();
        
        // 加载用户列表
        loadUserList();
        
        // 加载离线用户列表
        loadOfflineUsers();
        
        // 加载群组列表
        loadGroupList();
        
        // 立即启用消息发送功能，因为用户已经登录
        enableMessageSending();
    }
    
    // 检查IP封禁和用户存在性函数
    function checkUserAndIPStatus(callback) {
        fetch(`${SERVER_URL}/check-status`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP错误! 状态码: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            
            // 检查IP是否被封禁
            if (data.ipBanned) {
                const message = `您的IP已被封禁，原因: ${data.banReason || '未知'}。` +
                              (data.banExpiry ? ` 解封时间: ${new Date(data.banExpiry).toLocaleString()}` : '');
                alert(message);
                logout();
                callback(false);
                return;
            }
            
            // 如果有用户登录，检查用户是否仍然存在
            if (currentUser && !data.userExists) {
                alert('您的账户可能已被删除或禁用，请联系管理员。');
                logout();
                callback(false);
                return;
            }
            
            // 检查通过
            callback(true);
        })
        .catch(error => {
            // 检查失败时，允许继续连接（容错处理）
            callback(true);
        });
    }
    
    // 初始化WebSocket连接
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
                            // 加入群组
                            socket.emit('join-group', {
                                groupId: currentGroupId,
                                sessionToken: currentSessionToken,
                                userId: currentUser.id
                            });
                            
                            // 使用新的WebSocket事件获取群组聊天历史
                            socket.emit('get-group-chat-history', {
                                groupId: currentGroupId,
                                userId: currentUser.id,
                                sessionToken: currentSessionToken,
                                limit: 20
                            });
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
                            // 重新加入群组
                            socket.emit('join-group', {
                                groupId: currentGroupId,
                                sessionToken: currentSessionToken,
                                userId: currentUser.id
                            });
                            
                            // 使用新的WebSocket事件获取群组聊天历史
                            socket.emit('get-group-chat-history', {
                                groupId: currentGroupId,
                                userId: currentUser.id,
                                sessionToken: currentSessionToken,
                                limit: 20
                            });
                        }
                        
                        // 启用消息发送功能
                        enableMessageSending();
                    }
                });
            }
        });
        
        // 接收消息事件
        socket.on('message-received', (message) => {
            // 检查消息中是否包含新的会话令牌
            if (message.sessionToken) {
                // 更新会话令牌
                currentSessionToken = message.sessionToken;
                localStorage.setItem('currentSessionToken', currentSessionToken);
            }
            
            // 检查消息是否包含群组ID
            if (message.groupId) {
                // 如果包含群组ID，调用群组消息显示函数
                handleNewMessage(message, true, message.groupId);
                displayGroupMessage(message);
            } else {
                // 否则调用普通消息显示函数
                handleNewMessage(message, false);
                displayMessage(message);
            }
        });
        
        // 接收群组消息事件
        socket.on('group-message-received', (message) => {
            // 检查消息中是否包含新的会话令牌
            if (message.sessionToken) {
                // 更新会话令牌
                currentSessionToken = message.sessionToken;
                localStorage.setItem('currentSessionToken', currentSessionToken);
            }
            
            // 更新未读消息计数
            handleNewMessage(message, true, message.groupId || currentGroupId);
            displayGroupMessage(message);
        });
        
        // 在线用户更新事件
        socket.on('online-users', (users) => {
            updateUserList(users);
        });
        
        // 用户列表更新事件（兼容旧事件名）
        socket.on('users-updated', (users) => {
            updateUserList(users);
        });
        
        // 群组列表更新事件
        socket.on('group-list', (groups) => {
            updateGroupList(groups);
        });
        
        // 聊天历史记录事件
        socket.on('chat-history', (data) => {
            // 检查历史记录响应中是否包含新的会话令牌
            if (data.sessionToken) {
                // 更新会话令牌
                currentSessionToken = data.sessionToken;
                localStorage.setItem('currentSessionToken', currentSessionToken);
            }
            
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
        });
        
        // 群组聊天历史记录事件
        socket.on('group-chat-history', (data) => {
            // 检查历史记录响应中是否包含新的会话令牌
            if (data.sessionToken) {
                // 更新会话令牌
                currentSessionToken = data.sessionToken;
                localStorage.setItem('currentSessionToken', currentSessionToken);
            }
            
            const groupMessageContainer = document.getElementById('groupMessageContainer');
            if (!groupMessageContainer) return;
            
            const groupEmptyState = groupMessageContainer.querySelector('.empty-state');
            
            // 只有登录状态才加载和显示聊天历史
            if (currentUser && currentSessionToken) {
                // 如果是首次加载，清空容器
                if (!hasReceivedGroupHistory) {
                    groupMessageContainer.innerHTML = '';
                    hasReceivedGroupHistory = true;
                }
                
                if (!data.messages || !Array.isArray(data.messages) || data.messages.length === 0) {
                    if (groupEmptyState) {
                        groupEmptyState.style.display = 'block';
                    }
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
                        const messageElement = displayGroupMessage(message, true);
                        if (messageElement) {
                            groupMessageContainer.insertBefore(messageElement, groupMessageContainer.firstChild);
                        }
                    } else {
                        // 正常加载，直接添加到容器
                        displayGroupMessage(message);
                    }
                });
                
                // 恢复滚动位置，确保用户体验流畅（仅在加载更多时）
                if (data.loadMore && prevScrollHeight !== undefined && prevScrollTop !== undefined) {
                    const newScrollHeight = groupMessageContainer.scrollHeight;
                    const heightDifference = newScrollHeight - prevScrollHeight;
                    groupMessageContainer.scrollTop = prevScrollTop + heightDifference;
                } else if (!data.loadMore) {
                    // 首次加载时滚动到底部
                    groupMessageContainer.scrollTop = groupMessageContainer.scrollHeight;
                }
            }
            
            // 重置加载状态
            if (window.resetLoadingState) {
                window.resetLoadingState();
            }
        });
        
        // 用户加入聊天室响应事件
        socket.on('user-joined-response', (data) => {
            // 检查响应中是否包含新的会话令牌
            if (data.sessionToken) {
                // 更新会话令牌
                currentSessionToken = data.sessionToken;
                localStorage.setItem('currentSessionToken', currentSessionToken);
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
                alert('会话已过期，请重新登录');
                logout();
            }
        });
        
        // 会话过期事件
        socket.on('session-expired', () => {
            alert('会话已过期，请重新登录');
            logout();
        });
        
        // 消息被撤回事件
        socket.on('message-deleted', (data) => {
            const { messageId } = data;
            if (messageId) {
                // 删除公共聊天区的消息
                const messageElement = document.querySelector(`#messageContainer [data-id="${messageId}"]`);
                if (messageElement) {
                    messageElement.remove();
                }
                
                // 删除群组聊天区的消息
                const groupMessageElement = document.querySelector(`#groupMessageContainer [data-id="${messageId}"]`);
                if (groupMessageElement) {
                    groupMessageElement.remove();
                }
            }
        });
        
        // 群组消息被撤回事件
        socket.on('group-message-deleted', (data) => {
            const { messageId } = data;
            if (messageId) {
                const groupMessageElement = document.querySelector(`#groupMessageContainer [data-id="${messageId}"]`);
                if (groupMessageElement) {
                    groupMessageElement.remove();
                }
            }
        });
        
        // 监听群组名称更新事件
        socket.on('group-name-updated', (data) => {
            console.log('🔄 接收群组名称更新通知:', data);
            // 只有登录状态才刷新群组列表
            if (currentUser && currentSessionToken) {
                loadGroupList();
            }
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
            if (!window.chatSocket || !groupId) return;
            
            window.chatSocket.emit('get-group-chat-history', {
                userId: currentUser.id,
                sessionToken: currentSessionToken,
                groupId: groupId,
                loadMore: options.loadMore || false,
                olderThan: options.olderThan || null,
                limit: options.limit || 20
            });
        };
        
        // 创建集中化的模态框管理器
        const ModalManager = {
            // 初始化模态框管理器
            init: function() {
                this.initCreateGroupModal();
                this.initGroupInfoModal();
            },
            
            // 显示模态框
            showModal: function(modalId) {
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
            },
            
            // 隐藏模态框
            hideModal: function(modalId) {
                const modal = document.getElementById(modalId);
                if (modal) {
                    modal.style.display = 'none';
                    document.body.style.overflow = '';
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
            
            // 加载可用成员列表
            loadAvailableMembers: function() {
                const groupMembersList = document.getElementById('groupMembersList');
                if (!groupMembersList) return;
                
                // 显示加载状态
                groupMembersList.innerHTML = '<div class="loading-members">正在加载成员列表...</div>';
                
                // 检查用户是否已登录
                if (!currentUser || !currentSessionToken) {
                    groupMembersList.innerHTML = '<div class="loading-members">请先登录</div>';
                    return;
                }
                

                
                // 获取离线用户列表
                fetch(`${SERVER_URL}/offline-users`, {
                    headers: {
                        'user-id': currentUser.id,
                        'session-token': currentSessionToken
                    }
                })
                .then(response => {

                    return response.json();
                })
                .then(data => {

                    let allUsers = [];
                    if (data.status === 'success' && data.users) {
                        allUsers = data.users;
                    } else {
                        console.error('Failed to get offline users:', data.message || 'Unknown error');
                    }
                    
                    // 过滤掉当前用户，只显示其他用户
                    const availableMembers = allUsers.filter(user => user.id !== currentUser.id);
                    

                    
                    // 显示成员列表
                    if (availableMembers.length === 0) {
                        groupMembersList.innerHTML = '<div class="loading-members">没有可用的成员</div>';
                    } else {
                        groupMembersList.innerHTML = availableMembers.map(user => `
                            <div class="member-item">
                                <input type="checkbox" class="member-checkbox" id="member-${user.id}" value="${user.id}">
                                <label for="member-${user.id}" class="member-nickname">${user.nickname || user.username}</label>
                            </div>
                        `).join('');
                    }
                })
                .catch(error => {
                    console.error('Error loading offline users:', error);
                    groupMembersList.innerHTML = '<div class="loading-members">加载成员列表失败</div>';
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
                
                if (selectedMemberIds.length < 2) {
                    if (createGroupMessage) {
                        createGroupMessage.textContent = '请选择至少2名成员';
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
                .catch(error => {
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
            
            if (modal && imgElement) {
                imgElement.src = imageUrl;
                modal.style.display = 'flex';
                document.body.style.overflow = 'hidden';
            }
        };
        
        // 关闭图片预览
        function closeImagePreview() {
            const modal = document.getElementById('imagePreviewModal');
            if (modal) {
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
        }
        
        // 关闭按钮事件
        const closePreviewBtn = document.querySelector('.close-preview');
        if (closePreviewBtn) {
            closePreviewBtn.addEventListener('click', closeImagePreview);
        }
        
        // 点击模态框背景关闭
        const imagePreviewModal = document.getElementById('imagePreviewModal');
        if (imagePreviewModal) {
            imagePreviewModal.addEventListener('click', (e) => {
                if (e.target === imagePreviewModal) {
                    closeImagePreview();
                }
            });
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
    
    // 启用消息发送功能
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
    
    // 禁用消息发送功能
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
    
    // 加载离线用户列表
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
        })
        .catch(error => {
        });
    }
    
    // 更新离线用户列表
    function updateOfflineUserList(users) {
        const offlineUserList = document.getElementById('offlineUserList');
        if (!offlineUserList) return;
        
        offlineUserList.innerHTML = '';
        
        if (!users || users.length === 0) {
            offlineUserList.innerHTML = '<li>暂无离线用户</li>';
            return;
        }
        
        // 过滤掉在线用户
        const filteredOfflineUsers = users.filter(offlineUser => {
            return !onlineUsersList.some(onlineUser => onlineUser.id == offlineUser.id);
        });
        
        if (filteredOfflineUsers.length === 0) {
            offlineUserList.innerHTML = '<li>暂无离线用户</li>';
            return;
        }
        
        filteredOfflineUsers.forEach(user => {
            const li = document.createElement('li');
            
            // 安全获取用户头像URL，支持多种格式，与原UI保持一致
            let avatarUrl = '';
            if (user.avatarUrl && typeof user.avatarUrl === 'string') {
                avatarUrl = user.avatarUrl.trim();
            } else if (user.avatar_url && typeof user.avatar_url === 'string') {
                avatarUrl = user.avatar_url.trim();
            } else if (user.avatar && typeof user.avatar === 'string') {
                avatarUrl = user.avatar.trim();
            }
            
            // 显示用户头像或默认头像，与在线用户列表样式一致
            let avatarHtml = '';
            // 严格检查头像URL是否为SVG格式
            const isSvgAvatar = avatarUrl && /\.svg$/i.test(avatarUrl);
            if (avatarUrl && !isSvgAvatar) {
                avatarHtml = `<span class="user-avatar"><img src="${SERVER_URL}${avatarUrl}" alt="${user.nickname}"></span>`;
            } else {
                const initials = user.nickname.charAt(0).toUpperCase();
                avatarHtml = `<span class="user-avatar">${initials}</span>`;
            }
            
            li.innerHTML = `
                ${avatarHtml}
                <span class="user-name">${user.nickname}</span>
                <span class="user-status offline"></span>
            `;
            
            // 添加与在线用户列表一致的样式
            li.style.padding = '8px 0';
            li.style.borderBottom = '1px solid #f1f1f1';
            li.style.display = 'flex';
            li.style.alignItems = 'center';
            li.className = 'user-item';
            
            offlineUserList.appendChild(li);
        });
    }
    
    // 移除handleReceivedMessage函数，改为使用特定的Socket.io事件处理不同类型的消息
    
    // 显示消息
    function displayMessage(message, returnElement = false) {
        const messageContainer = document.getElementById('messageContainer');
        if (!messageContainer) return;
        
        // 检查消息对象是否有效
        if (!message) {
            return;
        }
        
        // 检查消息ID是否已经存在，避免重复渲染
        if (document.querySelector(`#messageContainer [data-id="${message.id}"]`)) {
            return;
        }
        
        // 允许content为null或空字符串，支持纯图片或文件消息
        // 移除额外的检查，确保所有有效的历史消息都能显示
        if (!message.content && !message.imageUrl && !message.fileUrl && !message.text) {
            return;
        }
        
        // 适配不同消息格式，支持直接包含userId、nickname等字段的消息
        const messageUser = message.user || {
            id: message.userId,
            nickname: message.nickname,
            avatarUrl: message.avatarUrl
        };
        
        // 安全获取发送者信息
        const senderId = messageUser.id;
        const senderNickname = messageUser.nickname || '未知用户';
        const senderAvatarUrl = messageUser.avatarUrl;
        const isOwn = currentUser && String(currentUser.id) === String(senderId);
        
        const messageElement = document.createElement('div');
        // 设置消息样式：别人的消息靠左白色，自己的消息靠右绿色
        messageElement.className = `message ${isOwn ? 'own-message' : 'other-message'}`;
        messageElement.setAttribute('data-id', message.id);
        
        // 保存sequence值，用于滚动加载
        if (message.sequence !== undefined) {
            messageElement.setAttribute('data-sequence', message.sequence);
        }
        
        // 添加内联样式，确保样式正确应用
        if (isOwn) {
            messageElement.style.marginLeft = '20%';
            messageElement.style.marginRight = '10px';
            messageElement.style.backgroundColor = '#E8F5E8';
            messageElement.style.borderRadius = '18px';
            messageElement.style.padding = '10px 15px';
            messageElement.style.maxWidth = '80%';
            messageElement.style.alignSelf = 'flex-end';
        } else {
            messageElement.style.marginLeft = '10px';
            messageElement.style.marginRight = '20%';
            messageElement.style.backgroundColor = '#FFFFFF';
            messageElement.style.borderRadius = '18px';
            messageElement.style.padding = '10px 15px';
            messageElement.style.maxWidth = '80%';
            messageElement.style.alignSelf = 'flex-start';
            messageElement.style.border = '1px solid #E0E0E0';
        }
        messageElement.style.display = 'flex';
        messageElement.style.flexDirection = 'column';
        messageElement.style.marginBottom = '10px';
        
        // HTML字符转义函数，防止XSS攻击
        function escapeHtml(text) {
            if (typeof text !== 'string') return text;
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // 解析Markdown内容，确保图片和文件链接正确渲染
        let parsedContent = message.content || '';
        if (typeof marked !== 'undefined') {
            try {
                // 配置marked，确保安全渲染，并使用自定义渲染器
                const renderer = new marked.Renderer();
                
                // 重写code方法，生成带有highlight类的figure结构
                renderer.code = function(code, language) {
                    // 添加详细调试日志

                    
                    const lang = language || 'code';
                    
                    // 生成行号
                    const lines = code.split('\n');
                    // 移除br标签，让CSS控制行间距
                    const lineNumbers = lines.map((_, index) => `<span class="line">${index + 1}</span>`).join('');
                    
                    // 生成转义的code用于复制按钮
                    const encodedCode = encodeURIComponent(code);
                    
                    // 生成符合原UI要求的HTML结构
                    const html = `<figure class="highlight">
             <div class="highlight-tools">
                 <div class="macStyle">
                     <div class="mac-close"></div>
                     <div class="mac-minimize"></div>
                     <div class="mac-maximize"></div>
                 </div>
                 <div class="code-lang">${lang}</div>
                 <div class="copy-notice"></div>
                 <i class="fas fa-paste copy-button" data-code="${encodedCode}"></i>
                 <i class="fa-solid fa-up-right-and-down-left-from-center fullpage-button"></i>
             </div>
             <table>
                 <tbody>
                     <tr>
                         <td class="gutter">
                             <pre>${lineNumbers}</pre>
                         </td>
                         <td class="code">
                             <pre><code>${code}</code></pre>
                         </td>
                     </tr>
                 </tbody>
             </table>
         </figure>`;
                    
                    // 添加生成的HTML结构调试日志（完整显示）

                    
                    return html;
                };
                
                marked.setOptions({
                    breaks: true, // 自动转换换行符为<br>
                    gfm: true, // 使用GitHub Flavored Markdown
                    renderer: renderer
                });
                
                // 处理消息数据，支持直接包含图片和文件信息的消息格式
                let contentToParse = message.content || '';
                
                // 先对原始内容进行HTML转义，防止XSS
                contentToParse = escapeHtml(contentToParse);
                
                // 如果消息直接包含imageUrl或fileUrl字段，转换为Markdown格式
                if (message.imageUrl) {
                    const filename = message.filename || '';
                    const isSvgFile = /\.svg$/i.test(filename);
                    
                    // 直接包含图片URL的消息，转换为Markdown图片格式
                    if (isSvgFile) {
                        // SVG文件特殊处理：转换为文件链接，而不是直接嵌入图片
                        contentToParse = `[${escapeHtml(filename || 'SVG图片')}](${escapeHtml(message.imageUrl)})`;
                    } else {
                        // 普通图片文件，转换为图片格式
                        contentToParse = `![${escapeHtml(filename || '图片')}](${escapeHtml(message.imageUrl)})`;
                    }
                } else if (message.fileUrl) {
                    // 直接包含文件URL的消息，转换为Markdown链接格式
                    contentToParse = `[${escapeHtml(message.filename || '文件')}](${escapeHtml(message.fileUrl)})`;
                }
                
                // 处理图片和文件链接，确保URL完整
                // 替换相对URL为完整URL
                if (SERVER_URL) {
                    // 处理图片URL
                    contentToParse = contentToParse.replace(/!\[([^\]]+)\]\(([^)]+)\)/g, (match, alt, url) => {
                        // 如果URL是相对路径，添加服务器前缀
                        if (url && !url.startsWith('http') && !url.startsWith('//')) {
                            return `![${alt}](${SERVER_URL}${url})`;
                        }
                        return match;
                    });
                    
                    // 处理普通链接
                    contentToParse = contentToParse.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                        // 如果URL是相对路径，添加服务器前缀
                        if (url && !url.startsWith('http') && !url.startsWith('//')) {
                            return `[${text}](${SERVER_URL}${url})`;
                        }
                        return match;
                    });
                    
                    // 处理直接的URL链接（没有Markdown格式），只处理纯URL，不处理已经是Markdown格式的链接
                    const urlRegex = /(?<!\]\()(https?:\/\/[^\s]+)/g;
                    // 使用实际URL作为链接文本，而不是固定的"链接"文字
                    contentToParse = contentToParse.replace(urlRegex, '[$1]($1)');
                }
                
                parsedContent = marked.parse(contentToParse).trim();
                
                // 移除所有SVG元素，防止XSS攻击
                parsedContent = parsedContent.replace(/<svg[^>]*>.*?<\/svg>/gi, '[SVG图片]');
                
                // 确保只允许安全的HTML标签，移除所有其他标签
                // 允许代码块所需的标签：figure, table, tbody, tr, td, i
                parsedContent = parsedContent.replace(/<(?!\/?(a|img|div|span|br|p|h[1-6]|strong|em|code|pre|ul|ol|li|blockquote|figure|table|tbody|tr|td|i)\b)[^>]*>/gi, '');
                

                
                // 为文件链接添加容器，确保文件卡片样式正确应用
                // 匹配所有带有下载属性或文件扩展名的链接
                parsedContent = parsedContent.replace(/<a([^>]*)(href="([^"]*)")([^>]*)>([^<]*)<\/a>/g, (match, attr1, hrefAttr, href, attr2, text) => {
                    // 检查是否为文件链接（包含文件扩展名或下载属性）
                    const hasDownloadAttr = match.includes('download');
                    const hasFileExtension = /\.\w+$/.test(href);
                    const isImageLink = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(href);
                    
                    // 如果是图片链接，不添加文件容器
                    if (isImageLink) {
                        return match;
                    }
                    
                    // 如果是文件链接，添加文件容器和图标
                    if (hasDownloadAttr || hasFileExtension) {
                        // 提取文件扩展名
                        const fileExtension = text.split('.').pop().toLowerCase();
                        
                        // 根据文件类型选择图标
                        let fileIcon = '📄'; // 默认文件图标
                        if (/^(pdf|doc|docx|txt|rtf)$/.test(fileExtension)) {
                            fileIcon = '📝';
                        } else if (/^(xls|xlsx|csv)$/.test(fileExtension)) {
                            fileIcon = '📊';
                        } else if (/^(zip|rar|7z|tar|gz)$/.test(fileExtension)) {
                            fileIcon = '🗜️';
                        } else if (/^(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileExtension)) {
                            fileIcon = '🖼️';
                        } else if (/^(mp3|wav|ogg|flac)$/i.test(fileExtension)) {
                            fileIcon = '🎵';
                        } else if (/^(mp4|avi|mov|wmv|flv)$/i.test(fileExtension)) {
                            fileIcon = '🎬';
                        } else if (/^(exe|dll|bat|sh)$/i.test(fileExtension)) {
                            fileIcon = '⚙️';
                        } else if (/^(ppt|pptx)$/i.test(fileExtension)) {
                            fileIcon = '📋';
                        } else if (/^(js|ts|html|css|php|py|java|c|cpp|cs|go|rb|swift|kt)$/i.test(fileExtension)) {
                            fileIcon = '💻';
                        }
                        
                        // 确保链接可以点击，使用正确的分组引用
                        return `<div class="file-link-container"><a${attr1} ${hrefAttr}${attr2} target="_blank"><span class="file-icon">${fileIcon}</span><span>${text}</span></a></div>`;
                    }
                    
                    return match;
                });
            } catch (error) {
                // 如果解析失败，使用转义后的原始内容
                parsedContent = escapeHtml(message.content);
            }
        } else {
            // 如果marked库不可用，直接使用转义后的内容
            parsedContent = escapeHtml(message.content);
        }
        
        // 确保图片有正确的样式
        parsedContent = parsedContent.replace(/<img/g, '<img class="message-image" style="max-width: 100%; height: auto; cursor: pointer;"');
        
        // 确保链接有正确的样式
        parsedContent = parsedContent.replace(/<a/g, '<a class="message-link" target="_blank" rel="noopener noreferrer" style="color: #3498db; text-decoration: none;"');
        
        // 为链接添加悬停效果
        parsedContent = parsedContent.replace(/<\/a>/g, '</a>');
        
        // 移除文件卡片外面的文件名显示，因为文件名已经在文件卡片内部显示
        // 只有当消息不是直接包含文件URL时，才可能需要显示文件名
        if (message.filename && !message.fileUrl && !message.imageUrl && (!message.content || !message.content.includes(message.filename))) {
            parsedContent += `<div class="message-filename" style="margin-top: 5px; color: #666; font-size: 12px;">${escapeHtml(message.filename)}</div>`;
        }
        
        
        // 构建完整的头像URL，并检查是否为SVG格式，防止XSS攻击
        let fullAvatarUrl = '';
        // 严格检查头像URL是否为SVG格式
        const isSvgAvatar = senderAvatarUrl && 
            (typeof senderAvatarUrl === 'string' && /\.svg$/i.test(senderAvatarUrl) || 
             senderAvatarUrl.includes('.svg'));
        
        if (senderAvatarUrl && !isSvgAvatar) {
            fullAvatarUrl = `${SERVER_URL}${senderAvatarUrl}`;
        }
        
        // 显示用户头像
        const avatarHtml = fullAvatarUrl ? 
            `<img src="${fullAvatarUrl}" alt="${senderNickname}" class="user-avatar" style="width: 32px; height: 32px; border-radius: 50%; margin-right: 10px;">` : 
            `<div class="user-avatar default-avatar" style="width: 32px; height: 32px; border-radius: 50%; margin-right: 10px; background-color: #e0e0e0; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #666;">${senderNickname.charAt(0).toUpperCase()}</div>`;
        
        messageElement.innerHTML = `
            <div class="message-header" style="display: flex; align-items: center; margin-bottom: 5px;">
                ${avatarHtml}
                <div style="flex: 1;">
                    <span class="message-sender" style="font-weight: bold;">${senderNickname}</span>
                    <span class="message-time" style="float: right; color: #999; font-size: 12px;">${message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}</span>
                </div>
                ${isOwn ? `<button class="delete-button" data-id="${message.id}" title="撤回消息" style="background: none; border: none; color: #999; font-size: 16px; cursor: pointer; margin-left: 10px;">×</button>` : ''}
            </div>
            <div class="message-content">${parsedContent}</div>
        `;
        
        if (returnElement) {
            // 只返回消息元素，不添加到容器
            return messageElement;
        }
        
        messageContainer.appendChild(messageElement);
        messageContainer.scrollTop = messageContainer.scrollHeight;
        
        // 渲染数学公式
        if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(messageElement, {
                delimiters: [
                    {left: "$$", right: "$$", display: true},
                    {left: "$" , right: "$" , display: false}
                ]
            });
        }
        
        // 添加撤回按钮事件监听
        if (isOwn) {
            const deleteButton = messageElement.querySelector('.delete-button');
            if (deleteButton) {
                deleteButton.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const messageId = this.getAttribute('data-id');
                    
                    // 确保消息ID有效，使用正确的事件名和参数格式
                    if (messageId) {
                        window.chatSocket.emit('delete-message', {
                            messageId: messageId, // 使用正确的参数名messageId
                            sessionToken: currentSessionToken,
                            userId: currentUser.id
                        });
                    }
                });
            }
        }
    }
    
    // 显示群组消息
    function displayGroupMessage(message, returnElement = false) {
        const groupMessageContainer = document.getElementById('groupMessageContainer');
        if (!groupMessageContainer) return;
        
        // 检查消息对象是否有效
        if (!message) {
            return;
        }
        
        // 检查消息ID是否已经存在，避免重复渲染
        if (document.querySelector(`#groupMessageContainer [data-id="${message.id}"]`)) {
            return;
        }
        
        // 允许content为null或空字符串，支持纯图片或文件消息
        // 移除额外的检查，确保所有有效的历史消息都能显示
        if (!message.content && !message.imageUrl && !message.fileUrl && !message.text) {
            return;
        }
        
        // 适配不同消息格式，支持直接包含userId、nickname等字段的消息
        const messageUser = message.user || {
            id: message.userId,
            nickname: message.nickname,
            avatarUrl: message.avatarUrl
        };
        
        // 安全获取发送者信息
        const senderId = messageUser.id;
        const senderNickname = messageUser.nickname || '未知用户';
        const senderAvatarUrl = messageUser.avatarUrl;
        const isOwn = currentUser && String(currentUser.id) === String(senderId);
        
        const messageElement = document.createElement('div');
        // 设置消息样式：别人的消息靠左白色，自己的消息靠右绿色
        messageElement.className = `message ${isOwn ? 'own-message' : 'other-message'}`;
        messageElement.setAttribute('data-id', message.id);
        
        // 保存sequence值，用于滚动加载
        if (message.sequence !== undefined) {
            messageElement.setAttribute('data-sequence', message.sequence);
        }
        
        // 添加内联样式，确保样式正确应用
        if (isOwn) {
            messageElement.style.marginLeft = '20%';
            messageElement.style.marginRight = '10px';
            messageElement.style.backgroundColor = '#E8F5E8';
            messageElement.style.borderRadius = '18px';
            messageElement.style.padding = '10px 15px';
            messageElement.style.maxWidth = '80%';
            messageElement.style.alignSelf = 'flex-end';
        } else {
            messageElement.style.marginLeft = '10px';
            messageElement.style.marginRight = '20%';
            messageElement.style.backgroundColor = '#FFFFFF';
            messageElement.style.borderRadius = '18px';
            messageElement.style.padding = '10px 15px';
            messageElement.style.maxWidth = '80%';
            messageElement.style.alignSelf = 'flex-start';
            messageElement.style.border = '1px solid #E0E0E0';
        }
        messageElement.style.display = 'flex';
        messageElement.style.flexDirection = 'column';
        messageElement.style.marginBottom = '10px';
        
        // HTML字符转义函数，防止XSS攻击
        function escapeHtml(text) {
            if (typeof text !== 'string') return text;
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // 解析Markdown内容，确保图片和文件链接正确渲染
        let parsedContent = message.content || '';
        if (typeof marked !== 'undefined') {
            try {
                // 配置marked，确保安全渲染，并使用自定义渲染器
                const renderer = new marked.Renderer();
                
                // 重写code方法，生成带有highlight类的figure结构
                renderer.code = function(code, language) {
                    // 添加详细调试日志

                    
                    const lang = language || 'code';
                    
                    // 生成行号
                    const lines = code.split('\n');
                    // 移除br标签，让CSS控制行间距
                    const lineNumbers = lines.map((_, index) => `<span class="line">${index + 1}</span>`).join('');
                    
                    // 生成转义的code用于复制按钮
                    const encodedCode = encodeURIComponent(code);
                    
                    // 生成符合原UI要求的HTML结构
                    const html = `<figure class="highlight">
             <div class="highlight-tools">
                 <div class="macStyle">
                     <div class="mac-close"></div>
                     <div class="mac-minimize"></div>
                     <div class="mac-maximize"></div>
                 </div>
                 <div class="code-lang">${lang}</div>
                 <div class="copy-notice"></div>
                 <i class="fas fa-paste copy-button" data-code="${encodedCode}"></i>
                 <i class="fa-solid fa-up-right-and-down-left-from-center fullpage-button"></i>
             </div>
             <table>
                 <tbody>
                     <tr>
                         <td class="gutter">
                             <pre>${lineNumbers}</pre>
                         </td>
                         <td class="code">
                             <pre><code>${code}</code></pre>
                         </td>
                     </tr>
                 </tbody>
             </table>
         </figure>`;
                    
                    // 添加生成的HTML结构调试日志（完整显示）

                    
                    return html;
                };
                
                marked.setOptions({
                    breaks: true, // 自动转换换行符为<br>
                    gfm: true, // 使用GitHub Flavored Markdown
                    renderer: renderer
                });
                
                // 处理消息数据，支持直接包含图片和文件信息的消息格式
                let contentToParse = message.content || '';
                
                // 先对原始内容进行HTML转义，防止XSS
                contentToParse = escapeHtml(contentToParse);
                
                // 如果消息直接包含imageUrl或fileUrl字段，转换为Markdown格式
                if (message.imageUrl) {
                    const filename = message.filename || '';
                    const isSvgFile = /\.svg$/i.test(filename);
                    
                    // 直接包含图片URL的消息，转换为Markdown图片格式
                    if (isSvgFile) {
                        // SVG文件特殊处理：转换为文件链接，而不是直接嵌入图片
                        contentToParse = `[${escapeHtml(filename || 'SVG图片')}](${escapeHtml(message.imageUrl)})`;
                    } else {
                        // 普通图片文件，转换为图片格式
                        contentToParse = `![${escapeHtml(filename || '图片')}](${escapeHtml(message.imageUrl)})`;
                    }
                } else if (message.fileUrl) {
                    // 直接包含文件URL的消息，转换为Markdown链接格式
                    contentToParse = `[${escapeHtml(message.filename || '文件')}](${escapeHtml(message.fileUrl)})`;
                }
                
                // 处理图片和文件链接，确保URL完整
                // 替换相对URL为完整URL
                if (SERVER_URL) {
                    // 处理图片URL
                    contentToParse = contentToParse.replace(/!\[([^\]]+)\]\(([^)]+)\)/g, (match, alt, url) => {
                        // 如果URL是相对路径，添加服务器前缀
                        if (url && !url.startsWith('http') && !url.startsWith('//')) {
                            return `![${alt}](${SERVER_URL}${url})`;
                        }
                        return match;
                    });
                    
                    // 处理普通链接
                    contentToParse = contentToParse.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                        // 如果URL是相对路径，添加服务器前缀
                        if (url && !url.startsWith('http') && !url.startsWith('//')) {
                            return `[${text}](${SERVER_URL}${url})`;
                        }
                        return match;
                    });
                    
                    // 处理直接的URL链接（没有Markdown格式），只处理纯URL，不处理已经是Markdown格式的链接
                    const urlRegex = /(?<!\]\()(https?:\/\/[^\s]+)/g;
                    // 使用实际URL作为链接文本，而不是固定的"链接"文字
                    contentToParse = contentToParse.replace(urlRegex, '[$1]($1)');
                }
                
                parsedContent = marked.parse(contentToParse).trim();
                
                // 移除所有SVG元素，防止XSS攻击
                parsedContent = parsedContent.replace(/<svg[^>]*>.*?<\/svg>/gi, '[SVG图片]');
                
                // 确保只允许安全的HTML标签，移除所有其他标签
                // 允许代码块所需的标签：figure, table, tbody, tr, td, i
                parsedContent = parsedContent.replace(/<(?!\/?(a|img|div|span|br|p|h[1-6]|strong|em|code|pre|ul|ol|li|blockquote|figure|table|tbody|tr|td|i)\b)[^>]*>/gi, '');
            } catch (error) {
                // 如果解析失败，使用转义后的原始内容
                parsedContent = escapeHtml(message.content);
            }
        } else {
            // 如果marked库不可用，直接使用转义后的内容
            parsedContent = escapeHtml(message.content);
        }
        
        // 确保图片有正确的样式
        parsedContent = parsedContent.replace(/<img/g, '<img class="message-image" style="max-width: 100%; height: auto; cursor: pointer;"');
        
        // 确保链接有正确的样式
        parsedContent = parsedContent.replace(/<a/g, '<a class="message-link" target="_blank" rel="noopener noreferrer" style="color: #3498db; text-decoration: none;"');
        
        // 为链接添加悬停效果
        parsedContent = parsedContent.replace(/<\/a>/g, '</a>');
        
        // 移除文件卡片外面的文件名显示，因为文件名已经在文件卡片内部显示
        // 只有当消息不是直接包含文件URL时，才可能需要显示文件名
        if (message.filename && !message.fileUrl && !message.imageUrl && (!message.content || !message.content.includes(message.filename))) {
            parsedContent += `<div class="message-filename" style="margin-top: 5px; color: #666; font-size: 12px;">${escapeHtml(message.filename)}</div>`;
        }
        
        
        // 构建完整的头像URL，并检查是否为SVG格式，防止XSS攻击
        let fullAvatarUrl = '';
        // 严格检查头像URL是否为SVG格式
        const isSvgAvatar = senderAvatarUrl && 
            (typeof senderAvatarUrl === 'string' && /\.svg$/i.test(senderAvatarUrl) || 
             senderAvatarUrl.includes('.svg'));
        
        if (senderAvatarUrl && !isSvgAvatar) {
            fullAvatarUrl = `${SERVER_URL}${senderAvatarUrl}`;
        }
        
        // 显示用户头像
        const avatarHtml = fullAvatarUrl ? 
            `<img src="${fullAvatarUrl}" alt="${senderNickname}" class="user-avatar" style="width: 32px; height: 32px; border-radius: 50%; margin-right: 10px;">` : 
            `<div class="user-avatar default-avatar" style="width: 32px; height: 32px; border-radius: 50%; margin-right: 10px; background-color: #e0e0e0; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #666;">${senderNickname.charAt(0).toUpperCase()}</div>`;
        
        messageElement.innerHTML = `
            <div class="message-header" style="display: flex; align-items: center; margin-bottom: 5px;">
                ${avatarHtml}
                <div style="flex: 1;">
                    <span class="message-sender" style="font-weight: bold;">${senderNickname}</span>
                    <span class="message-time" style="float: right; color: #999; font-size: 12px;">${message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}</span>
                </div>
                ${isOwn ? `<button class="delete-button" data-id="${message.id}" title="撤回消息" style="background: none; border: none; color: #999; font-size: 16px; cursor: pointer; margin-left: 10px;">×</button>` : ''}
            </div>
            <div class="message-content">${parsedContent}</div>
        `;
        
        if (returnElement) {
            // 只返回消息元素，不添加到容器
            return messageElement;
        }
        
        groupMessageContainer.appendChild(messageElement);
        groupMessageContainer.scrollTop = groupMessageContainer.scrollHeight;
        
        // 渲染数学公式
        if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(messageElement, {
                delimiters: [
                    {left: "$$", right: "$$", display: true},
                    {left: "$" , right: "$" , display: false}
                ]
            });
        }
        
        // 添加撤回按钮事件监听
        if (isOwn) {
            const deleteButton = messageElement.querySelector('.delete-button');
            if (deleteButton) {
                deleteButton.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const messageId = this.getAttribute('data-id');
                    
                    // 确保消息ID和群组ID有效，使用正确的参数格式
                    if (messageId && currentGroupId) {
                        window.chatSocket.emit('delete-group-message', {
                            messageId: messageId, // 使用正确的参数名messageId
                            groupId: currentGroupId,
                            sessionToken: currentSessionToken,
                            userId: currentUser.id
                        });
                    }
                });
            }
        }
    }
    
    // 初始化页面焦点事件监听
    function initializeFocusListeners() {
        // 添加页面可见性变化事件监听
        document.addEventListener('visibilitychange', handlePageVisibilityChange);
        
        // 添加页面焦点变化事件监听
        window.addEventListener('focus', handleFocusChange);
        window.addEventListener('blur', handleFocusChange);
    }
    
    // 初始化消息发送功能
    function initializeMessageSending() {
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const imageUploadButton = document.getElementById('imageUploadButton');
        const fileUploadButton = document.getElementById('fileUploadButton');
        const imageInput = document.getElementById('imageInput');
        const fileInput = document.getElementById('fileInput');
        const markdownToolbar = document.getElementById('markdownToolbar');
        
        // 确保消息输入框和按钮在初始化时没有被禁用
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
        
        if (messageInput && sendButton) {
            sendButton.addEventListener('click', function() {
                sendMessage();
            });
            
            messageInput.addEventListener('keydown', function(e) {
                // 按Enter发送消息
                if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                    // 确保输入框已启用
                    if (!messageInput.disabled) {
                        e.preventDefault(); // 阻止默认换行
                        sendMessage();
                    }
                } 
                // Ctrl+Enter插入换行（原UI逻辑）
                else if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey) {
                    e.preventDefault();
                    const start = messageInput.selectionStart;
                    const end = messageInput.selectionEnd;
                    const value = messageInput.value;
                    messageInput.value = value.substring(0, start) + '\n' + value.substring(end);
                    // 设置光标位置到换行符后
                    messageInput.selectionStart = messageInput.selectionEnd = start + 1;
                }
                // Shift+Enter也允许换行
                else if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey) {
                    // 允许默认换行行为
                }
            });
        }
        
        // 初始化Markdown工具栏开关
        const toggleMarkdownToolbarBtn = document.getElementById('toggleMarkdownToolbar');
        if (toggleMarkdownToolbarBtn && markdownToolbar) {
            // 默认隐藏工具栏
            markdownToolbar.style.display = 'none';
            
            toggleMarkdownToolbarBtn.addEventListener('click', function() {
                if (markdownToolbar.style.display === 'none') {
                    // 显示工具栏
                    markdownToolbar.style.display = 'flex';
                    this.innerHTML = '<i class="fas fa-chevron-up"></i> 隐藏Markdown工具栏';
                } else {
                    // 隐藏工具栏
                    markdownToolbar.style.display = 'none';
                    this.innerHTML = '<i class="fas fa-chevron-down"></i> 显示Markdown工具栏';
                }
            });
        }
        
        // 初始化Markdown工具栏功能
        if (markdownToolbar) {
            const markdownButtons = markdownToolbar.querySelectorAll('.markdown-btn');
            markdownButtons.forEach(button => {
                button.addEventListener('click', function() {
                    const prefix = this.getAttribute('data-prefix') || '';
                    const suffix = this.getAttribute('data-suffix') || '';
                    const sample = this.getAttribute('data-sample') || '示例文本';
                    
                    // 插入Markdown语法
                    const cursorPos = messageInput.selectionStart;
                    const textBefore = messageInput.value.substring(0, cursorPos);
                    const textAfter = messageInput.value.substring(messageInput.selectionEnd);
                    
                    messageInput.value = textBefore + prefix + sample + suffix + textAfter;
                    messageInput.focus();
                    messageInput.setSelectionRange(
                        cursorPos + prefix.length,
                        cursorPos + prefix.length + sample.length
                    );
                });
            });
        }
        
        // 初始化图片上传功能
        if (imageUploadButton && imageInput) {
            imageUploadButton.addEventListener('click', function() {
                imageInput.click();
            });
            
            imageInput.addEventListener('change', function() {
                if (this.files && this.files[0]) {
                    uploadImage(this.files[0]);
                }
            });
        }
        
        // 初始化文件上传功能
        if (fileUploadButton && fileInput) {
            fileUploadButton.addEventListener('click', function() {
                fileInput.click();
            });
            
            fileInput.addEventListener('change', function() {
                if (this.files && this.files[0]) {
                    uploadFile(this.files[0]);
                }
            });
        }
        
        function sendMessage() {
            const messageInput = document.getElementById('messageInput');
            const content = messageInput.value.trim();
            
            if (content && isConnected && window.chatSocket) {
                // 使用Socket.io发送消息，确保格式正确
                const messageData = {
                    content: content,
                    groupId: null, // 公共聊天时groupId为null
                    sessionToken: currentSessionToken,
                    userId: currentUser.id
                };
                window.chatSocket.emit('send-message', messageData);
                
                // 清空输入框
                messageInput.value = '';
            }
        }
        
        // 上传图片
        function uploadImage(file) {
            const formData = new FormData();
            formData.append('image', file);
            
            // 显示上传进度
            const uploadProgress = document.getElementById('uploadProgress');
            const uploadProgressBar = document.getElementById('uploadProgressBar');
            if (uploadProgress && uploadProgressBar) {
                uploadProgress.style.display = 'block';
                uploadProgressBar.style.width = '0%';
            }
            
            // 发送图片上传请求
            fetch(`${SERVER_URL}/upload-image`, {
                method: 'POST',
                headers: {
                    'user-id': currentUser.id,
                    'session-token': currentSessionToken
                },
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // 图片上传成功，发送图片消息，确保格式正确
                    if (isConnected && window.chatSocket) {
                        const messageData = {
                            content: `![${file.name}](${data.imageUrl})`,
                            groupId: null, // 公共聊天时groupId为null
                            sessionToken: currentSessionToken,
                            userId: currentUser.id
                        };
                        window.chatSocket.emit('send-message', messageData);
                    }
                } else {
                    showError(data.message || '图片上传失败');
                }
            })
            .catch(error => {
                showError('图片上传失败，请稍后重试');
            })
            .finally(() => {
                // 隐藏上传进度
                if (uploadProgress) {
                    uploadProgress.style.display = 'none';
                }
                // 重置文件输入
                imageInput.value = '';
            });
        }
        
        // 上传文件
        function uploadFile(file) {
            const formData = new FormData();
            formData.append('file', file);
            
            // 显示上传进度
            const uploadProgress = document.getElementById('uploadProgress');
            const uploadProgressBar = document.getElementById('uploadProgressBar');
            if (uploadProgress && uploadProgressBar) {
                uploadProgress.style.display = 'block';
                uploadProgressBar.style.width = '0%';
            }
            
            // 发送文件上传请求
            fetch(`${SERVER_URL}/upload-file`, {
                method: 'POST',
                headers: {
                    'user-id': currentUser.id,
                    'session-token': currentSessionToken
                },
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // 文件上传成功，发送文件消息，确保格式正确
                    if (isConnected && window.chatSocket) {
                        const messageData = {
                            content: `[${file.name}](${data.fileUrl})`,
                            groupId: null, // 公共聊天时groupId为null
                            sessionToken: currentSessionToken,
                            userId: currentUser.id
                        };
                        window.chatSocket.emit('send-message', messageData);
                    }
                } else {
                    showError(data.message || '文件上传失败');
                }
            })
            .catch(error => {
                showError('文件上传失败，请稍后重试');
            })
            .finally(() => {
                // 隐藏上传进度
                if (uploadProgress) {
                    uploadProgress.style.display = 'none';
                }
                // 重置文件输入
                fileInput.value = '';
            });
        }
    }
    
    // 初始化群组功能
    function initializeGroupFunctions() {
        // 群组点击事件已经在之前的代码中实现
        
        // 初始化群组消息发送
        const groupMessageInput = document.getElementById('groupMessageInput');
        const sendGroupMessageBtn = document.getElementById('sendGroupMessage');
        
        if (groupMessageInput && sendGroupMessageBtn) {
            sendGroupMessageBtn.addEventListener('click', function() {
                sendGroupMessage();
            });
            
            groupMessageInput.addEventListener('keydown', function(e) {
                // 按Enter发送消息
                if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                    // 确保输入框已启用
                    if (!groupMessageInput.disabled) {
                        e.preventDefault(); // 阻止默认换行
                        sendGroupMessage();
                    }
                } 
                // Ctrl+Enter插入换行（原UI逻辑）
                else if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey) {
                    e.preventDefault();
                    const start = groupMessageInput.selectionStart;
                    const end = groupMessageInput.selectionEnd;
                    const value = groupMessageInput.value;
                    groupMessageInput.value = value.substring(0, start) + '\n' + value.substring(end);
                    // 设置光标位置到换行符后
                    groupMessageInput.selectionStart = groupMessageInput.selectionEnd = start + 1;
                }
                // Shift+Enter也允许换行
                else if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey) {
                    // 允许默认换行行为
                }
            });
        }
        
        function sendGroupMessage() {
            if (!currentGroupId) {
                return;
            }
            
            const groupMessageInput = document.getElementById('groupMessageInput');
            const content = groupMessageInput.value.trim();
            
            if (content && isConnected && window.chatSocket) {
                // 使用Socket.io发送群组消息，与原UI保持一致，使用send-message事件并包含groupId参数
                const messageData = {
                    groupId: currentGroupId,
                    content: content,
                    sessionToken: currentSessionToken,
                    userId: currentUser.id
                };
                window.chatSocket.emit('send-message', messageData);
                
                // 清空输入框
                groupMessageInput.value = '';
            }
        }
    }
    
    // 初始化设置功能
    function initializeSettingsFunctions() {
        // 初始化各种设置表单的提交处理，只选择设置容器内的settings-form
        const settingsContainer = document.getElementById('settingsContainer');
        if (settingsContainer) {
            const settingsForms = settingsContainer.querySelectorAll('.settings-form');
            
            settingsForms.forEach(form => {
                form.addEventListener('submit', function(e) {
                    e.preventDefault();
                    handleSettingsSubmit(this);
                });
            });
        }
    }
    
    // 处理设置表单提交
    function handleSettingsSubmit(form) {
        const settingId = form.closest('.settings-detail').getAttribute('data-setting');
        
        // 实现真实的设置提交逻辑
        const formData = new FormData(form);
        const data = {};
        formData.forEach((value, key) => {
            data[key] = value;
        });
        
        // 处理不同类型的设置
        if (settingId === 'change-nickname') {
            // 确保新昵称存在
            if (!data.newNickname || data.newNickname.trim() === '') {
                showError('昵称不能为空');
                return;
            }
            
            // 更改昵称使用WebSocket事件，与原UI保持一致
            if (window.chatSocket) {
                // 发送更新昵称请求
                window.chatSocket.emit('update-nickname', {
                    userId: currentUser.id,
                    newNickname: data.newNickname,
                    sessionToken: currentSessionToken
                });
                
                // 立即更新本地用户信息
                currentUser.nickname = data.newNickname;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                
                // 发送昵称变更广播
                window.chatSocket.emit('broadcast-nickname-change', {
                    userId: currentUser.id,
                    newNickname: data.newNickname,
                    sessionToken: currentSessionToken
                });
                
                // 立即更新所有消息中的昵称显示
                updateAllMessagesNickname(currentUser.id, data.newNickname);
                
                // 显示成功消息
                showSuccess('昵称修改成功');
            }
        } else {
            // 其他设置类型仍然使用HTTP请求
            let endpoint = '';
            switch (settingId) {
                case 'change-password':
                    endpoint = '/change-password';
                    break;
                case 'shortcut-settings':
                    endpoint = '/shortcut-settings';
                    break;
                case 'version-info':
                    endpoint = '/version-info';
                    break;
                case 'help-center':
                    endpoint = '/help-center';
                    break;
                default:
                    return;
            }
            
            // 发送设置请求
            fetch(`${SERVER_URL}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'user-id': currentUser.id,
                    'session-token': currentSessionToken
                },
                body: JSON.stringify(data)
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    showSuccess('设置保存成功');
                } else {
                    showError(data.message || '设置保存失败');
                }
            })
            .catch(error => {
                showError('设置请求失败，请稍后重试');
            });
        }
    }
    
    // 为群组按钮添加事件监听器的函数
    function addGroupButtonListeners() {
        // 直接获取按钮元素
        const groupInfoButton = document.getElementById('groupInfoButton');
        const createGroupButton = document.getElementById('createGroupButton');
        const leaveGroupButton = document.getElementById('leaveGroupButton');
        
        // 调试：检查是否进入createGroupButton逻辑

        // 创建群组按钮点击事件
        if (createGroupButton) {

            // 移除所有现有的点击事件监听器
            const newCreateGroupButton = createGroupButton.cloneNode(true);
            createGroupButton.parentNode.replaceChild(newCreateGroupButton, createGroupButton);
            
            // 为新按钮添加点击事件
            newCreateGroupButton.addEventListener('click', function() {

                // 使用ModalManager打开创建群组模态框
                const modalManager = window.ModalManager;
                if (modalManager && typeof modalManager.showModal === 'function') {
                    modalManager.showModal('createGroupModal');
                } else {
                    // 备用方案：直接打开模态框
                    const modal = document.getElementById('createGroupModal');
                    const newGroupNameInput = document.getElementById('newGroupName');
                    const newGroupDescriptionInput = document.getElementById('newGroupDescription');
                    
                    // 调试：检查元素是否找到

                    
                    // 清空表单
                    newGroupNameInput.value = '';
                    newGroupDescriptionInput.value = '';
                    
                    // 设置模态框显示方式为flex，因为我们使用了flex布局
                    modal.style.display = 'flex';

                    
                    // 直接调用loadAvailableMembers
                    if (window.ModalManager && typeof window.ModalManager.loadAvailableMembers === 'function') {
                        window.ModalManager.loadAvailableMembers();
                    }
                }
            });
        }
        
        // 群组信息按钮点击事件
                if (groupInfoButton) {
                    // 移除所有现有的点击事件监听器
                    const newGroupInfoButton = groupInfoButton.cloneNode(true);
                    groupInfoButton.parentNode.replaceChild(newGroupInfoButton, groupInfoButton);
                    
                    // 为新按钮添加点击事件
                    newGroupInfoButton.addEventListener('click', function() {
                        if (!currentGroupId) {
                            alert('请先选择一个群组');
                            return;
                        }
                        
                        // 使用fetch API获取群组信息
                        fetch(`${SERVER_URL}/group-info/${currentGroupId}`, {
                            headers: {
                                'user-id': currentUser.id,
                                'session-token': currentSessionToken
                            }
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.status === 'success') {
                                // 显示群组信息模态框
                                const modal = document.getElementById('groupInfoModal');
                                const modalGroupName = document.getElementById('modalGroupName');
                                const modalGroupNameValue = document.getElementById('modalGroupNameValue');
                                const modalGroupIdValue = document.getElementById('modalGroupIdValue');
                                const modalGroupMemberCount = document.getElementById('modalGroupMemberCount');
                                const modalGroupOwner = document.getElementById('modalGroupOwner');
                                const groupManageSection = document.getElementById('groupManageSection');
                                
                                // 对群组名称进行反转义，避免二次转义
                                const originalGroupName = unescapeHtml(data.group.name);
                                
                                modalGroupName.textContent = `${originalGroupName} - 群组信息`;
                                modalGroupNameValue.textContent = originalGroupName;
                                modalGroupIdValue.textContent = data.group.id;
                                modalGroupMemberCount.textContent = Array.isArray(data.group.members) ? data.group.members.length : data.group.memberCount || data.group.count || data.group.userCount || data.group.groupCount || 0;
                                
                                // 显示群主信息（使用与原UI一致的creator_id）
                                const ownerId = data.group.creator_id || data.group.ownerId || data.group.creatorId || data.group.adminId;
                                const isOwner = currentUser.id === String(ownerId);
                                
                                if (modalGroupOwner) {
                                    modalGroupOwner.textContent = `群主ID: ${ownerId}`;
                                }
                                
                                // 显示或隐藏管理功能
                                if (groupManageSection) {
                                    if (isOwner) {
                                        groupManageSection.style.display = 'block';
                                    } else {
                                        groupManageSection.style.display = 'none';
                                    }
                                }
                                
                                // 显示或隐藏群组名称编辑按钮
                                const editGroupNameBtn = document.getElementById('editGroupNameBtn');
                                if (editGroupNameBtn) {
                                    if (isOwner) {
                                        editGroupNameBtn.style.display = 'inline-block';
                                        // 为编辑按钮添加点击事件
                                        editGroupNameBtn.onclick = function() {
                                            const modalGroupNameValue = document.getElementById('modalGroupNameValue');
                                            const currentName = modalGroupNameValue.textContent;
                                            
                                            // 创建编辑输入框
                                            const editInput = document.createElement('input');
                                            editInput.type = 'text';
                                            editInput.value = currentName;
                                            editInput.className = 'edit-group-name-input';
                                            editInput.style.padding = '6px';
                                            editInput.style.border = '1px solid #dee2e6';
                                            editInput.style.borderRadius = '4px';
                                            editInput.style.fontSize = '14px';
                                            
                                            // 创建保存和取消按钮
                                            const saveBtn = document.createElement('button');
                                            saveBtn.textContent = '保存';
                                            saveBtn.className = 'save-group-name-btn';
                                            saveBtn.style.marginLeft = '5px';
                                            saveBtn.style.padding = '6px 12px';
                                            saveBtn.style.background = '#27ae60';
                                            saveBtn.style.color = 'white';
                                            saveBtn.style.border = 'none';
                                            saveBtn.style.borderRadius = '4px';
                                            saveBtn.style.cursor = 'pointer';
                                            saveBtn.style.fontSize = '12px';
                                            
                                            const cancelBtn = document.createElement('button');
                                            cancelBtn.textContent = '取消';
                                            cancelBtn.className = 'cancel-group-name-btn';
                                            cancelBtn.style.marginLeft = '5px';
                                            cancelBtn.style.padding = '6px 12px';
                                            cancelBtn.style.background = '#6c757d';
                                            cancelBtn.style.color = 'white';
                                            cancelBtn.style.border = 'none';
                                            cancelBtn.style.borderRadius = '4px';
                                            cancelBtn.style.cursor = 'pointer';
                                            cancelBtn.style.fontSize = '12px';
                                            
                                            // 替换显示为编辑界面
                                            const groupNameContainer = modalGroupNameValue.parentElement;
                                            groupNameContainer.innerHTML = '';
                                            groupNameContainer.appendChild(editInput);
                                            groupNameContainer.appendChild(saveBtn);
                                            groupNameContainer.appendChild(cancelBtn);
                                            
                                            // 聚焦到输入框
                                            editInput.focus();
                                            
                                            // 保存按钮点击事件
                                            saveBtn.onclick = function() {
                                                const newGroupName = editInput.value.trim();
                                                if (newGroupName && newGroupName !== currentName) {
                                                    // 更新群组名称
                                                    updateGroupName(currentGroupId, newGroupName);
                                                }
                                            };
                                            
                                            // 取消按钮点击事件
                                            cancelBtn.onclick = function() {
                                                // 恢复显示
                                                groupNameContainer.innerHTML = `
                                                    <span id="modalGroupNameValue">${currentName}</span>
                                                    <button id="editGroupNameBtn" class="edit-group-name-btn" style="padding: 4px 8px; background-color: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                                        编辑
                                                    </button>
                                                `;
                                                // 重新绑定编辑按钮事件
                                                const newEditBtn = groupNameContainer.querySelector('#editGroupNameBtn');
                                                if (newEditBtn) {
                                                    newEditBtn.onclick = editGroupNameBtn.onclick;
                                                }
                                            };
                                        };
                                    } else {
                                        editGroupNameBtn.style.display = 'none';
                                    }
                                }
                                
                                // 显示模态框
                                modal.style.display = 'flex';
                                
                                // 加载群组成员列表
                                loadGroupMembers(currentGroupId, isOwner);
                                
                                // 添加刷新成员列表按钮事件
                                const refreshGroupMembersBtn = document.getElementById('refreshGroupMembers');
                                if (refreshGroupMembersBtn) {
                                    refreshGroupMembersBtn.onclick = function() {
                                        loadGroupMembers(currentGroupId, isOwner);
                                    };
                                }
                            } else {
                                alert('获取群组信息失败: ' + (data.message || '未知错误'));
                            }
                        })
                        .catch(error => {
                            alert('获取群组信息失败，网络错误');
                        });
                    });
                }
        

        
        // 退出/解散群组按钮点击事件
        if (leaveGroupButton) {
            // 移除所有现有的点击事件监听器
            const newLeaveGroupButton = leaveGroupButton.cloneNode(true);
            leaveGroupButton.parentNode.replaceChild(newLeaveGroupButton, leaveGroupButton);
            
            // 检查用户是否是群主
            let isOwner = false;
            if (currentGroupId) {
                fetch(`${SERVER_URL}/group-info/${currentGroupId}`, {
                    headers: {
                        'user-id': currentUser.id,
                        'session-token': currentSessionToken
                    }
                })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        const ownerId = data.group.creator_id || data.group.ownerId || data.group.creatorId || data.group.adminId;
                        isOwner = currentUser.id === String(ownerId);
                        
                        // 根据是否是群主修改按钮文本
                        if (isOwner) {
                            newLeaveGroupButton.textContent = '解散群组';
                        } else {
                            newLeaveGroupButton.textContent = '退出群组';
                        }
                    }
                })
                .catch(error => {
                    console.error('获取群组信息失败:', error);
                });
            }
            
            // 为新按钮添加点击事件
            newLeaveGroupButton.addEventListener('click', function() {
                if (!currentGroupId) {
                    alert('请先选择一个群组');
                    return;
                }
                
                // 检查用户是否是群主
                fetch(`${SERVER_URL}/group-info/${currentGroupId}`, {
                    headers: {
                        'user-id': currentUser.id,
                        'session-token': currentSessionToken
                    }
                })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        const ownerId = data.group.creator_id || data.group.ownerId || data.group.creatorId || data.group.adminId;
                        const isOwner = currentUser.id === String(ownerId);
                        
                        if (isOwner) {
                            // 群主：解散群组
                            if (confirm('确定要解散该群组吗？此操作不可恢复，所有群消息将被删除。')) {
                                dissolveGroup(currentGroupId);
                            }
                        } else {
                            // 非群主：退出群组
                            if (confirm('确定要退出该群组吗？')) {
                                // 使用fetch API退出群组
                                fetch(`${SERVER_URL}/leave-group`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'user-id': currentUser.id,
                                        'session-token': currentSessionToken
                                    },
                                    body: JSON.stringify({
                                        groupId: currentGroupId
                                    })
                                })
                                .then(response => response.json())
                                .then(data => {
                                    if (data.status === 'success') {
                                        alert('已成功退出群组');
                                        // 重新加载群组列表
                                        loadGroupList();
                                        
                                        // 清空当前群组信息
                                        currentGroupId = null;
                                        currentGroupName = '';
                                        
                                        // 显示群组选择界面
                                        const groupEmptyState = document.getElementById('groupEmptyState');
                                        const groupChatInterface = document.getElementById('groupChatInterface');
                                        const currentGroupNameElement = document.getElementById('currentGroupName');
                                        
                                        if (groupEmptyState) {
                                            groupEmptyState.style.display = 'flex';
                                        }
                                        if (groupChatInterface) {
                                            groupChatInterface.style.display = 'none';
                                        }
                                        if (currentGroupNameElement) {
                                            currentGroupNameElement.textContent = '群组名称';
                                        }
                                    } else {
                                        alert('退出群组失败: ' + (data.message || '未知错误'));
                                    }
                                })
                                .catch(error => {
                                    alert('退出群组失败，网络错误');
                                });
                            }
                        }
                    }
                })
                .catch(error => {
                    alert('获取群组信息失败，网络错误');
                });
            });
        }
    }
    
    // 加载群组成员列表
    function loadGroupMembers(groupId, isOwner) {
        console.log(`📋 [群组成员] 开始加载群组成员列表，群组ID: ${groupId}，是否为群主: ${isOwner}`);
        
        const groupMembersContainer = document.getElementById('groupMembersContainer');
        if (!groupMembersContainer) {
            console.error('❌ [群组成员] 未找到群组成员容器');
            return;
        }
        
        groupMembersContainer.innerHTML = '<div class="loading-members">正在加载成员列表...</div>';
        
        console.log(`🔄 [群组成员] 发送请求获取群组成员列表，群组ID: ${groupId}`);
        fetch(`${SERVER_URL}/group-members/${groupId}`, {
            headers: {
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            }
        })
        .then(response => response.json())
        .then(data => {
            console.log(`✅ [群组成员] 收到群组成员列表响应，状态: ${data.status}，数据:`, data);
            
            if (data.status === 'success') {
                console.log(`📊 [群组成员] 成功获取群组成员列表，共 ${data.members.length} 个成员`);
                updateGroupMembersList(data.members, isOwner, groupId);
            } else {
                const errorMsg = data.message || '未知错误';
                console.error(`❌ [群组成员] 加载群组成员列表失败: ${errorMsg}`);
                groupMembersContainer.innerHTML = `<div class="loading-members">加载成员列表失败: ${errorMsg}</div>`;
            }
        })
        .catch(error => {
            console.error('❌ [群组成员] 网络错误加载群组成员列表:', error);
            groupMembersContainer.innerHTML = '<div class="loading-members">加载成员列表失败，网络错误</div>';
        });
    }
    
    // 更新群组成员列表显示
    function updateGroupMembersList(members, isOwner, groupId) {
        console.log(`📋 [群组成员] 开始更新群组成员列表，群组ID: ${groupId}，是否为群主: ${isOwner}，成员数量: ${members ? members.length : 0}`);
        
        const groupMembersContainer = document.getElementById('groupMembersContainer');
        if (!groupMembersContainer) {
            console.error('❌ [群组成员] 未找到群组成员容器');
            return;
        }
        
        if (!members || !Array.isArray(members) || members.length === 0) {
            console.log(`📊 [群组成员] 群组成员列表为空，群组ID: ${groupId}`);
            groupMembersContainer.innerHTML = '<div class="loading-members">没有可用的成员</div>';
            return;
        }
        
        console.log(`📊 [群组成员] 开始渲染 ${members.length} 个成员，群组ID: ${groupId}`);
        let membersHtml = '';
        members.forEach((member, index) => {
            // 检查是否是群主
            const isMemberOwner = String(member.id) === String(currentUser.id);
            
            console.log(`👤 [群组成员] 处理成员 ${index + 1}/${members.length}: ID=${member.id}, 昵称=${member.nickname}, 是当前用户: ${isMemberOwner}`);
            
            membersHtml += `
                <div class="group-member-item">
                    <div class="group-member-info">
                        <span class="group-member-name">${member.nickname}</span>
                        <span class="group-member-id">ID: ${member.id}</span>
                        ${isMemberOwner ? '<span class="group-member-role">（我）</span>' : ''}
                    </div>
                    ${isOwner && !isMemberOwner ? `
                        <button class="kick-member-btn" data-group-id="${groupId}" data-member-id="${member.id}" data-member-name="${member.nickname}">
                            踢出
                        </button>
                    ` : ''}
                </div>
            `;
        });
        
        console.log(`✅ [群组成员] 成员列表HTML生成完成，共 ${members.length} 个成员`);
        groupMembersContainer.innerHTML = membersHtml;
        
        // 添加踢出成员按钮事件
        if (isOwner) {
            const kickButtons = groupMembersContainer.querySelectorAll('.kick-member-btn');
            console.log(`🔧 [群组成员] 添加 ${kickButtons.length} 个踢出成员按钮事件`);
            
            kickButtons.forEach(button => {
                button.addEventListener('click', function() {
                    const groupId = this.getAttribute('data-group-id');
                    const memberId = this.getAttribute('data-member-id');
                    const memberName = this.getAttribute('data-member-name');
                    
                    console.log(`🚫 [群组成员] 点击踢出按钮，群组ID: ${groupId}，成员ID: ${memberId}，成员昵称: ${memberName}`);
                    removeMemberFromGroup(groupId, memberId, memberName);
                });
            });
        }
        
        console.log(`✅ [群组成员] 群组成员列表更新完成，群组ID: ${groupId}`);
    }
    
    // 踢出成员函数
    function removeMemberFromGroup(groupId, memberId, memberName) {
        if (!confirm(`确定要踢出成员 ${memberName} 吗？`)) return;
        if (!currentUser || !currentSessionToken) {
            alert('请先登录');
            return;
        }
        
        fetch(`${SERVER_URL}/remove-group-member`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            },
            body: JSON.stringify({
                groupId: groupId,
                memberId: memberId
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                alert(`已成功踢出成员 ${memberName}`);
                // 重新加载群组成员列表
                loadGroupMembers(groupId, true);
            } else {
                alert('踢出成员失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(error => {
            alert('踢出成员失败，网络错误');
        });
    }
    
    // 更新群组名称
    function updateGroupName(groupId, newGroupName) {
        if (!currentUser || !currentSessionToken) {
            alert('请先登录');
            return;
        }
        
        fetch(`${SERVER_URL}/update-group-name`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            },
            body: JSON.stringify({
                groupId: groupId,
                newGroupName: newGroupName
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // 对服务器返回的新群组名称进行反转义，避免二次转义
                const unescapedGroupName = unescapeHtml(data.newGroupName);
                
                // 更新本地群组名称
                currentGroupName = unescapedGroupName;
                
                // 更新界面上的群组名称
                const currentGroupNameElement = document.getElementById('currentGroupName');
                if (currentGroupNameElement) {
                    currentGroupNameElement.textContent = unescapedGroupName;
                }
                
                // 更新群组列表中的名称
                updateGroupNameInList(groupId, unescapedGroupName);
                
                alert('群组名称已成功更新');
                
                // 关闭管理模态框
                const manageGroupModal = document.getElementById('manageGroupModal');
                if (manageGroupModal) {
                    manageGroupModal.style.display = 'none';
                }
            } else {
                alert('修改群组名称失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(error => {
            alert('修改群组名称失败，网络错误');
        });
    }
    
    // 更新群组列表中的群组名称
    function updateGroupNameInList(groupId, newGroupName) {
        const groupList = document.getElementById('groupList');
        if (!groupList) return;
        
        const groupItems = groupList.querySelectorAll(`li[data-group-id="${groupId}"]`);
        groupItems.forEach(item => {
            const groupNameEl = item.querySelector('.group-name');
            if (groupNameEl) {
                groupNameEl.textContent = newGroupName;
            }
        });
    }
    
    // 解散群组
    function dissolveGroup(groupId) {
        if (!currentUser || !currentSessionToken) {
            alert('请先登录');
            return;
        }
        
        if (!confirm('确定要解散本群组吗？此操作不可恢复，所有群消息将被删除。')) {
            return;
        }
        
        fetch(`${SERVER_URL}/dissolve-group`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            },
            body: JSON.stringify({
                userId: currentUser.id,
                groupId: groupId
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                alert('群组已成功解散，所有群消息已删除');
                
                // 返回主聊天界面
                backToMainChat();
                
                // 重新加载群组列表
                loadGroupList();
            } else {
                alert('解散群组失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(error => {
            alert('解散群组失败，网络错误');
        });
    }
    
    // 返回主聊天界面
    function backToMainChat() {
        // 显示主聊天界面
        const publicChatContent = document.querySelector('.chat-content[data-content="public-chat"]');
        const groupChatInterface = document.getElementById('groupChatInterface');
        const groupEmptyState = document.getElementById('groupEmptyState');
        const currentGroupNameElement = document.getElementById('currentGroupName');
        
        if (publicChatContent) {
            publicChatContent.classList.add('active');
        }
        
        if (groupChatInterface) {
            groupChatInterface.style.display = 'none';
        }
        
        if (groupEmptyState) {
            groupEmptyState.style.display = 'flex';
        }
        
        if (currentGroupNameElement) {
            currentGroupNameElement.textContent = '群组名称';
        }
        
        // 清空当前群组信息
        currentGroupId = null;
        currentGroupName = '';
        
        // 设置当前活动聊天室为主聊天
        setActiveChat('main');
    }
    
    // 初始化群组信息和成员按钮事件
    function initializeGroupButtons() {
        // 立即添加一次
        addGroupButtonListeners();
        
        // 在群组切换时重新添加事件监听器
        // 因为群组聊天界面可能是动态显示的
        const groupChatInterface = document.getElementById('groupChatInterface');
        if (groupChatInterface) {
            // 当群组聊天界面显示时，重新添加事件监听器
            const observer = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    if (mutation.attributeName === 'style') {
                        if (groupChatInterface.style.display !== 'none') {
                            addGroupButtonListeners();
                        }
                    }
                });
            });
            
            observer.observe(groupChatInterface, {
                attributes: true
            });
        }
        
        // 监听群组列表点击事件，切换群组时重新添加事件监听器
        const groupList = document.getElementById('groupList');
        if (groupList) {
            groupList.addEventListener('click', () => {
                // 延迟50ms，确保群组界面已经显示
                setTimeout(() => {
                    addGroupButtonListeners();
                }, 50);
            });
        }
    }
    
    // 加载用户列表
    function loadUserList() {
        // 使用WebSocket获取在线用户列表
        if (isConnected && window.chatSocket) {
            window.chatSocket.emit('get-online-users');
        }
    }
    
    // 更新用户列表（将在线用户列表样式改回与离线用户列表一致）
    function updateUserList(users) {
        const userList = document.getElementById('userList');
        const onlineCount = document.getElementById('onlineCount');
        if (!userList) {
            console.error('User list element not found');
            return;
        }
        
        // 验证用户列表数据
        if (!Array.isArray(users)) {
            console.error('Invalid users data:', users);
            users = [];
        }
        
        // 更新在线用户列表全局变量
        onlineUsersList = users;
        
        // 更新在线用户数量
        if (onlineCount) {
            onlineCount.textContent = `(${users.length})`;
        }
        
        userList.innerHTML = '';
        
        if (users.length === 0) {
            userList.innerHTML = '<li>暂无在线用户</li>';
            return;
        }
        

        users.forEach(user => {
            // 验证用户数据
            if (!user || !user.id) {
                console.error('Invalid user object:', user);
                return;
            }
            
            const li = document.createElement('li');
            
            // 安全获取用户头像URL，支持多种格式，与原UI保持一致
            let avatarUrl = '';
            if (user.avatarUrl && typeof user.avatarUrl === 'string') {
                avatarUrl = user.avatarUrl.trim();
            } else if (user.avatar_url && typeof user.avatar_url === 'string') {
                avatarUrl = user.avatar_url.trim();
            } else if (user.avatar && typeof user.avatar === 'string') {
                avatarUrl = user.avatar.trim();
            }
            
            // 显示用户头像或默认头像，与离线用户列表样式一致
            let avatarHtml = '';
            if (avatarUrl) {
                // 检查头像URL是否为SVG格式，防止XSS攻击
                const isSvgAvatar = /\.svg$/i.test(avatarUrl);
                if (isSvgAvatar) {
                    // SVG文件特殊处理：使用默认头像
                    const initials = user.nickname ? user.nickname.charAt(0).toUpperCase() : 'U';
                    avatarHtml = `<span class="user-avatar">${initials}</span>`;
                } else {
                    const fullAvatarUrl = `${SERVER_URL}${avatarUrl}`;
                    avatarHtml = `<span class="user-avatar"><img src="${fullAvatarUrl}" alt="${user.nickname}"></span>`;
                }
            } else {
                const initials = user.nickname ? user.nickname.charAt(0).toUpperCase() : 'U';
                avatarHtml = `<span class="user-avatar">${initials}</span>`;
            }
            
            // 判断是否是当前用户
            const isCurrentUser = currentUser && String(currentUser.id) === String(user.id);
            const displayName = isCurrentUser ? `${user.nickname} (我)` : user.nickname;
            
            // 构建与离线用户列表一致的HTML结构
            li.innerHTML = `
                ${avatarHtml}
                <span class="user-name">${displayName}</span>
                <span class="user-status online"></span>
            `;
            
            // 添加样式，与离线用户列表一致
            li.style.padding = '8px 0';
            li.style.borderBottom = '1px solid #f1f1f1';
            li.style.display = 'flex';
            li.style.alignItems = 'center';
            
            // 设置样式类，确保与CSS样式兼容
            li.className = 'user-item';
            
            // 如果是当前用户，添加特殊样式
            if (isCurrentUser) {
                li.style.fontWeight = 'bold';
            }
            
            userList.appendChild(li);
        });
        
        // 更新离线用户列表，过滤掉在线用户
        loadOfflineUsers();
    }
    
    // 加载群组列表
    function loadGroupList() {
        if (!currentUser || !currentSessionToken) return;
        
        // 使用fetch API加载群组列表
        fetch(`${SERVER_URL}/user-groups/${currentUser.id}`, {
            headers: {
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                updateGroupList(data.groups);
            } else {
                const groupList = document.getElementById('groupList');
                if (groupList) {
                    groupList.innerHTML = '<li>加载失败: ' + data.message + '</li>';
                }
            }
        })
        .catch(error => {
            const groupList = document.getElementById('groupList');
            if (groupList) {
                groupList.innerHTML = '<li>加载失败: 网络错误</li>';
            }
        });
    }
    
    // HTML反转义函数，用于处理服务器返回的已转义的群组名称
    function unescapeHtml(html) {
        const text = document.createElement('textarea');
        text.innerHTML = html;
        return text.value;
    }
    
    // 更新标题显示未读消息计数
    function updateTitleWithUnreadCount() {
        let totalUnread = unreadMessages.global;
        
        // 累加所有群组的未读消息数
        for (const groupId in unreadMessages.groups) {
            totalUnread += unreadMessages.groups[groupId] || 0;
        }
        
        // 更新页面标题，格式：（X条未读）简易聊天室
        if (totalUnread > 0) {
            document.title = `（${totalUnread}条未读）${originalTitle}`;
            console.log(`📌 更新标题为: （${totalUnread}条未读）${originalTitle}`);
        } else {
            document.title = originalTitle;
            console.log(`📌 更新标题为: ${originalTitle}`);
        }
    }
    
    // 处理页面可见性变化
    function handlePageVisibilityChange() {
        isPageVisible = !document.hidden;
        // console.log(`👁️  页面可见性变化: ${isPageVisible ? '可见' : '不可见'}`);
        
        // 页面从不可见变为可见时，清除当前活动聊天室的未读计数
        if (isPageVisible) {
            if (currentActiveChat === 'main') {
                // 清除主聊天室未读计数
                if (unreadMessages.global > 0) {
                    // console.log(`🔔 主聊天室获得焦点，清除未读消息计数: ${unreadMessages.global}`);
                    unreadMessages.global = 0;
                    updateTitleWithUnreadCount();
                }
            } else {
                // 清除当前群组未读计数
                if (unreadMessages.groups[currentActiveChat] > 0) {
                    console.log(`🔔 群组 ${currentActiveChat} 获得焦点，清除未读消息计数: ${unreadMessages.groups[currentActiveChat]}`);
                    unreadMessages.groups[currentActiveChat] = 0;
                    updateTitleWithUnreadCount();
                }
            }
        }
    }
    
    // 处理页面焦点变化
    function handleFocusChange() {
        isPageVisible = document.hasFocus();
        // console.log(`👁️  页面焦点变化: ${isPageVisible ? '获得焦点' : '失去焦点'}`);
        
        // 页面获得焦点时，清除当前活动聊天室的未读计数
        if (isPageVisible) {
            if (currentActiveChat === 'main') {
                // 清除主聊天室未读计数
                if (unreadMessages.global > 0) {
                    // console.log(`🔔 主聊天室获得焦点，清除未读消息计数: ${unreadMessages.global}`);
                    unreadMessages.global = 0;
                    updateTitleWithUnreadCount();
                }
            } else {
                // 清除当前群组未读计数
                if (unreadMessages.groups[currentActiveChat] > 0) {
                    // console.log(`🔔 群组 ${currentActiveChat} 获得焦点，清除未读消息计数: ${unreadMessages.groups[currentActiveChat]}`);
                    unreadMessages.groups[currentActiveChat] = 0;
                    updateTitleWithUnreadCount();
                }
            }
        }
    }
    
    // 设置当前活动聊天室
    function setActiveChat(chatType, groupId = null) {
        if (chatType === 'main') {
            currentActiveChat = 'main';
            // 清除全局未读消息计数
            if (unreadMessages.global > 0) {
                // console.log(`🔔 切换到主聊天室，清除全局未读消息计数: ${unreadMessages.global}`);
                unreadMessages.global = 0;
                updateTitleWithUnreadCount();
            }
        } else if (chatType === 'group' && groupId) {
            currentActiveChat = groupId;
            // 清除该群组未读消息计数
            if (unreadMessages.groups[groupId] > 0) {
                // console.log(`🔔 切换到群组 ${groupId}，清除未读消息计数: ${unreadMessages.groups[groupId]}`);
                unreadMessages.groups[groupId] = 0;
                updateTitleWithUnreadCount();
            }
        }
        // console.log(`💬 切换活动聊天室: ${currentActiveChat}`);
    }
    
    // 处理新消息，更新未读计数
    function handleNewMessage(message, isGroup = false, groupId = null) {
        // 检查消息是否有效
        if (!message) return;
        
        // 使用浏览器API判断页面是否获得焦点
        // 如果页面可见且用户在当前聊天室，不添加未读计数
        let shouldAddUnread = !isPageVisible;
        if (isPageVisible) {
            if (isGroup && groupId) {
                // 如果是群组消息，检查用户是否在该群组
                shouldAddUnread = currentActiveChat !== groupId;
            } else {
                // 如果是普通消息，检查用户是否在主聊天室
                shouldAddUnread = currentActiveChat !== 'main';
            }
        }
        
        if (shouldAddUnread) {
            if (isGroup && groupId) {
                // 更新群组未读消息计数
                unreadMessages.groups[groupId] = (unreadMessages.groups[groupId] || 0) + 1;
                // console.log(`🔔 收到群组 ${groupId} 新消息，未读计数: ${unreadMessages.groups[groupId]}`);
            } else {
                // 更新全局未读消息计数
                unreadMessages.global++;
                // console.log(`🔔 收到主聊天室新消息，未读计数: ${unreadMessages.global}`);
            }
            // 更新标题
            updateTitleWithUnreadCount();
        } else {
            // console.log(`✅ 收到新消息，用户当前在活动聊天室，不添加未读计数`);
        }
    }
    
    // 更新群组列表
    function updateGroupList(groups) {
        const groupList = document.getElementById('groupList');
        if (!groupList) return;
        
        groupList.innerHTML = '';
        
        groups.forEach(group => {
            // 反转义群组名称，因为服务器返回的名称已经被转义
            const originalGroupName = unescapeHtml(group.name);
            
            const li = document.createElement('li');
            li.setAttribute('data-group-id', group.id);
            li.setAttribute('data-group-name', originalGroupName);
            
            // 创建群组名称元素，使用textContent避免HTML转义
            const groupNameSpan = document.createElement('span');
            groupNameSpan.className = 'group-name';
            groupNameSpan.textContent = originalGroupName;
            li.appendChild(groupNameSpan);
            
            // 添加点击事件
            li.addEventListener('click', function() {
                // 获取群组ID和名称
                const groupId = this.getAttribute('data-group-id');
                // 使用反转义后的群组名称
                const groupName = originalGroupName;
                
                // 更新当前群组
                currentGroupId = groupId;
                currentGroupName = groupName;
                
                // 显示群组聊天界面
                const groupEmptyState = document.getElementById('groupEmptyState');
                const groupChatInterface = document.getElementById('groupChatInterface');
                const currentGroupNameElement = document.getElementById('currentGroupName');
                
                if (groupEmptyState) {
                    groupEmptyState.style.display = 'none';
                }
                if (groupChatInterface) {
                    groupChatInterface.style.display = 'flex';
                    // 确保群组聊天界面的样式正确
                    groupChatInterface.style.flexDirection = 'column';
                }
                if (currentGroupNameElement) {
                    // 使用反转义后的群组名称
                    currentGroupNameElement.textContent = groupName;
                }
                
                // 设置当前活动聊天室为群组
                setActiveChat('group', groupId);
                
                // 立即加载群组聊天记录
                loadGroupMessages(groupId);
            });
            
            groupList.appendChild(li);
        });
    }
    
    // 加载群组聊天记录
    function loadGroupMessages(groupId) {
        // 清空现有消息，显示加载状态
        const groupMessageContainer = document.getElementById('groupMessageContainer');
        if (groupMessageContainer) {
            groupMessageContainer.innerHTML = `
                <div class="empty-state">
                    <h3>加载中...</h3>
                    <p>正在加载群组聊天记录...</p>
                </div>
            `;
            // 确保消息容器样式正确
            groupMessageContainer.style.flex = '1';
            groupMessageContainer.style.overflowY = 'auto';
            groupMessageContainer.style.padding = '10px';
        }
        
        // 使用Socket.io获取群组聊天历史
        if (isConnected && window.chatSocket) {
            // 发送加入群组事件，根据原UI要求，只需要发送join-group事件，服务器会自动返回群组聊天历史
            const joinGroupData = {
                groupId: parseInt(groupId), // 确保是数字格式
                sessionToken: currentSessionToken,
                userId: currentUser.id
            };
            window.chatSocket.emit('join-group', joinGroupData);
        } else {
            // 如果WebSocket未连接，尝试使用HTTP请求获取历史记录
            fetch(`${SERVER_URL}/group-chat-history/${groupId}`, {
                headers: {
                    'user-id': currentUser.id,
                    'session-token': currentSessionToken
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success' && data.messages) {
                    // 清空现有消息
                    if (groupMessageContainer) {
                        groupMessageContainer.innerHTML = '';
                        // 显示历史消息
                        data.messages.forEach(message => {
                            displayGroupMessage(message);
                        });
                    }
                }
            })
            .catch(error => {
            });
        }
    }
    
    // 显示错误消息
    function showError(message) {
        alert(message);
    }
    
    // 显示成功消息
    function showSuccess(message) {
        alert(message);
    }
    
    // 登出函数
    function logout() {
        // 清除localStorage中的用户信息和会话令牌
        localStorage.removeItem('currentUser');
        localStorage.removeItem('currentSessionToken');
        
        // 重置当前用户状态
        currentUser = null;
        currentSessionToken = null;
        isConnected = false;
        
        // 禁用消息发送功能
        disableMessageSending();
        
        // 跳转到登录页面
        window.location.href = 'login.html';
    }
    
    // 初始化侧边栏切换功能（之前已实现）
        function initSidebarToggle() {
            const menuItems = document.querySelectorAll('.menu-item');
            const secondaryContents = document.querySelectorAll('.secondary-content');
            const chatContents = document.querySelectorAll('.chat-content');
            const switchToOldUI = document.getElementById('switchToOldUI');
            
            // 添加切换到旧UI的点击事件
            if (switchToOldUI) {
                switchToOldUI.addEventListener('click', () => {
                    window.location.href = '/oldUI/';
                });
            }
            
            menuItems.forEach(item => {
                item.addEventListener('click', () => {
                    const targetSection = item.getAttribute('data-section');
                    
                    // 处理退出登录 - 先检查，避免移除active类
                    if (targetSection === 'logout') {
                        if (confirm('确定要退出登录吗？')) {
                            logout();
                        }
                        return;
                    }
                    
                    // 非退出登录操作，才执行active类的切换
                    menuItems.forEach(menuItem => {
                        menuItem.classList.remove('active');
                    });
                    
                    secondaryContents.forEach(content => {
                        content.classList.remove('active');
                    });
                    
                    chatContents.forEach(content => {
                        content.classList.remove('active');
                    });
                    
                    item.classList.add('active');
                    
                    const targetSecondaryContent = document.querySelector(`.secondary-content[data-content="${targetSection}"]`);
                    if (targetSecondaryContent) {
                        targetSecondaryContent.classList.add('active');
                    }
                    
                    const targetChatContent = document.querySelector(`.chat-content[data-content="${targetSection}"]`);
                    if (targetChatContent) {
                        targetChatContent.classList.add('active');
                        
                        // 当切换到主聊天室时，更新当前活动聊天室并清除未读计数
                        if (targetSection === 'public-chat') {
                            setActiveChat('main');
                        }
                    }
                });
            });
        }
    
    // 设置项点击功能（之前已实现）
    function initSettingsItemClick() {
        const settingsItems = document.querySelectorAll('.settings-item');
        const settingsDetails = document.querySelectorAll('.settings-detail');
        const settingsEmptyState = document.getElementById('settingsEmptyState');
        const settingsContainer = document.getElementById('settingsContainer');
        
        settingsItems.forEach(item => {
            item.addEventListener('click', () => {
                const settingId = item.getAttribute('data-setting-id');
                
                settingsEmptyState.style.display = 'none';
                settingsContainer.style.display = 'block';
                
                settingsDetails.forEach(detail => {
                    detail.style.display = 'none';
                });
                
                const targetSetting = document.querySelector(`.settings-detail[data-setting="${settingId}"]`);
                if (targetSetting) {
                    targetSetting.style.display = 'block';
                }
            });
        });
    }
    
    // 群组点击功能（之前已实现）
    function initGroupClick() {
        const groupItems = document.querySelectorAll('#groupList li[data-group-id]');
        const groupEmptyState = document.getElementById('groupEmptyState');
        const groupChatInterface = document.getElementById('groupChatInterface');
        const currentGroupNameElement = document.getElementById('currentGroupName');
        
        groupItems.forEach(item => {
            // 直接从当前元素获取群组ID和名称，避免从DOM获取转义后的名称
            const groupId = item.getAttribute('data-group-id');
            // 获取当前元素的群组名称，使用textContent避免HTML转义
            const groupNameSpan = item.querySelector('.group-name');
            
            item.addEventListener('click', () => {
                groupEmptyState.style.display = 'none';
                groupChatInterface.style.display = 'flex';
                
                // 使用textContent避免二次转义
                const groupName = groupNameSpan ? groupNameSpan.textContent : '群组名称';
                currentGroupNameElement.textContent = groupName;
                currentGroupId = groupId;
                currentGroupName = groupName;
                
                // 更新当前活动聊天室并清除未读计数
                setActiveChat('group', groupId);
                
                // TODO: 加载群组聊天记录
            });
        });
    }
    
    // 取消按钮功能（之前已实现）
    function initCancelButtons() {
        const cancelButtons = document.querySelectorAll('.cancel-btn');
        const settingsEmptyState = document.getElementById('settingsEmptyState');
        const settingsContainer = document.getElementById('settingsContainer');
        
        cancelButtons.forEach(button => {
            button.addEventListener('click', () => {
                settingsEmptyState.style.display = 'flex';
                settingsContainer.style.display = 'none';
            });
        });
    }
    
    // 初始化所有功能
    function initAllFunctions() {
        // 检查登录状态
        checkLoginStatus();
        
        // 初始化侧边栏切换
        initSidebarToggle();
        
        // 初始化设置项点击
        initSettingsItemClick();
        
        // 初始化群组点击
        initGroupClick();
        
        // 初始化取消按钮
        initCancelButtons();
        
        // 初始化滚动加载历史消息功能
        initializeScrollLoading();
        
        // 初始化群组信息和成员按钮事件
        initializeGroupButtons();
    }
    
    // 向上滚动加载历史消息功能
    function initializeScrollLoading() {
        const messageContainer = document.getElementById('messageContainer');
        const groupMessageContainer = document.getElementById('groupMessageContainer');
        
        if (!messageContainer || !groupMessageContainer) return;
        
        // 初始化加载状态标志
        window.isLoadingMoreMessages = false;
        window.loadingIndicatorTimeout = null;
        
        // 检查是否滚动到底部的辅助函数
        function isScrolledToBottom(container) {
            const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            return distanceToBottom < 10; // 10px的阈值
        }
        
        // 为全局消息容器添加滚动事件监听
        messageContainer.addEventListener('scroll', function(e) {
            handleScroll(e, this, false);
        });
        
        // 为群组消息容器添加滚动事件监听
        groupMessageContainer.addEventListener('scroll', function(e) {
            handleScroll(e, this, true);
        });
        
        // 滚动事件处理函数
        function handleScroll(e, container, isGroup) {
            // 向上滚动到顶部附近时加载新消息
            if (container.scrollTop < 50) { // 使用50px的阈值，避免必须滚动到绝对顶部
                // 避免频繁触发
                if (!window.isLoadingMoreMessages) {
                    window.isLoadingMoreMessages = true;
                    
                    // 记录当前滚动位置信息（用于加载后恢复）
                    const prevScrollHeight = container.scrollHeight;
                    const prevScrollTop = container.scrollTop;
                    
                    // 获取当前显示的最早消息的sequence值
                            const messages = container.querySelectorAll('.message');
                            let olderThan = null;
                            
                            if (messages.length > 0) {
                                let minSequence = null;
                                for (let i = 0; i < messages.length; i++) {
                                    const msg = messages[i];
                                    // 从data-sequence属性获取sequence值
                                    const sequenceAttr = msg.getAttribute('data-sequence');
                                    if (sequenceAttr !== null) {
                                        const sequence = parseInt(sequenceAttr);
                                        if (!isNaN(sequence)) {
                                            if (minSequence === null || sequence < minSequence) {
                                                minSequence = sequence;
                                            }
                                        }
                                    }
                                }
                                olderThan = minSequence;
                            }
                    
                    // 发送加载更多请求
                    if (currentUser && currentSessionToken) {
                        if (isGroup && currentGroupId) {
                            // 加载群组消息
                            const joinGroupData = {
                                groupId: currentGroupId,
                                sessionToken: currentSessionToken,
                                userId: currentUser.id,
                                limit: 20,
                                loadMore: true,
                                olderThan: olderThan
                            };
                            window.chatSocket.emit('join-group', joinGroupData);
                        } else {
                            // 加载全局消息，使用新的WebSocket事件
                            window.chatSocket.emit('get-chat-history', {
                                userId: currentUser.id,
                                sessionToken: currentSessionToken,
                                limit: 20,
                                loadMore: true,
                                olderThan: olderThan
                            });
                        }
                        
                        // 0.5秒后显示加载中提示，避免加载速度快时显示
                        window.loadingIndicatorTimeout = setTimeout(() => {
                            // 只有在仍然处于加载状态时才显示
                            if (window.isLoadingMoreMessages) {
                                const loadingIndicator = document.createElement('div');
                                loadingIndicator.className = 'loading-indicator';
                                loadingIndicator.textContent = '加载中...';
                                loadingIndicator.style.textAlign = 'center';
                                loadingIndicator.style.padding = '10px';
                                loadingIndicator.style.color = '#666';
                                loadingIndicator.style.fontSize = '14px';
                                container.insertBefore(loadingIndicator, container.firstChild);
                            }
                        }, 500);
                    } else {
                        window.isLoadingMoreMessages = false;
                    }
                }
            }
        }
        
        // 提供给外部调用的函数，用于重置加载状态
        window.resetLoadingState = function() {
            window.isLoadingMoreMessages = false;
            if (window.loadingIndicatorTimeout) {
                clearTimeout(window.loadingIndicatorTimeout);
                window.loadingIndicatorTimeout = null;
            }
            
            // 移除所有加载指示器
            const loadingIndicators = document.querySelectorAll('.loading-indicator');
            loadingIndicators.forEach(indicator => indicator.remove());
        };
    }
    
    // 启动初始化
    initAllFunctions();
});
