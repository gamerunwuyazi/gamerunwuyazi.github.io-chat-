/*
 * 新聊天界面的JavaScript代码
 * 参考原UI的JS代码实现核心功能
 * @copyright Copyright (c) 2026 gamerunwuyazi. All rights reserved.
 */
const SERVER_URL = 'https://back.hs.airoe.cn';

// 初始化变量
let currentUser = null;
let currentSessionToken = null;
let isConnected = false;
let currentGroupId = null;
let currentGroupName = '';
let currentPrivateChatUserId = null; // 当前私信聊天的用户ID
let currentPrivateChatUsername = ''; // 当前私信聊天的用户名
let onlineUsersList = [];
let friendsList = []; // 好友列表
let hasReceivedHistory = false; // 用于跟踪是否已经接收过普通聊天历史记录
let hasReceivedGroupHistory = false; // 用于跟踪是否已经接收过群组聊天历史记录
let hasReceivedPrivateHistory = false; // 用于跟踪是否已经接收过私信聊天历史记录
let originalTitle = document.title; // 保存原始标题
let unreadMessages = { global: 0, groups: {}, private: {} }; // 未读消息计数
let isPageVisible = true; // 页面可见性状态
let currentActiveChat = 'main'; // 当前活动聊天室：'main'、群组ID或用户ID
let lastNotificationTime = 0; // 最后通知时间，用于控制通知频率
let groupMessageCache = {}; // 群组消息缓存，当用户不在群组页面时存储消息

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

// 初始化私信聊天功能
function initializePrivateChatFunctions() {
    // 初始化好友列表事件监听
    initializeFriendsListListeners();
    
    // 初始化用户资料模态框
    initializeUserProfileModal();
    
    // 初始化用户搜索功能
    initializeUserSearch();
    
    // 初始化私信消息发送功能
    initializePrivateMessageSending();
    
    // 初始化私信聊天界面事件
    initializePrivateChatInterface();
}

// 加载好友列表
function loadFriendsList() {
    if (!currentUser || !currentSessionToken) return;
    
    // 使用fetch API加载好友列表
    fetch(`${SERVER_URL}/user/friends`, {
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            updateFriendsList(data.friends);
        } else {
            const friendsList = document.getElementById('friendsList');
            if (friendsList) {
                friendsList.innerHTML = '<li>加载好友列表失败: ' + data.message + '</li>';
            }
        }
    })
    .catch(error => {
        const friendsList = document.getElementById('friendsList');
        if (friendsList) {
            friendsList.innerHTML = '<li>加载好友列表失败: 网络错误</li>';
        }
    });
}

// 更新好友列表
function updateFriendsList(friends) {
    const friendsListElement = document.getElementById('friendsList');
    if (!friendsListElement) return;
    
    friendsListElement.innerHTML = '';
    
    // 更新好友列表全局变量
    friendsList = friends;
    
    if (friends.length === 0) {
        friendsListElement.innerHTML = '<li class="empty-friends">暂无好友，请先添加好友</li>';
        return;
    }
    
    friends.forEach(friend => {
        const li = document.createElement('li');
        li.className = 'friend-item';
        li.dataset.userId = friend.id;
        li.dataset.userNickname = friend.nickname;
        
        // 安全获取用户头像URL
        let avatarUrl = '';
        if (friend.avatarUrl && typeof friend.avatarUrl === 'string') {
            avatarUrl = friend.avatarUrl.trim();
        } else if (friend.avatar_url && typeof friend.avatar_url === 'string') {
            avatarUrl = friend.avatar_url.trim();
        }
        
        // 显示用户头像或默认头像
        let avatarHtml = '';
        if (avatarUrl) {
            // 检查头像URL是否为SVG格式，防止XSS攻击
            const isSvgAvatar = /\.svg$/i.test(avatarUrl);
            if (isSvgAvatar) {
                // SVG文件特殊处理：使用默认头像
                const initials = friend.nickname ? friend.nickname.charAt(0).toUpperCase() : 'U';
                avatarHtml = `<span class="user-avatar">${initials}</span>`;
            } else {
                const fullAvatarUrl = `${SERVER_URL}${avatarUrl}`;
                avatarHtml = `<span class="user-avatar"><img src="${fullAvatarUrl}" alt="${friend.nickname}"></span>`;
            }
        } else {
            const initials = friend.nickname ? friend.nickname.charAt(0).toUpperCase() : 'U';
            avatarHtml = `<span class="user-avatar">${initials}</span>`;
        }
        
        // 检查好友是否在线
        const isOnline = onlineUsersList.some(onlineUser => String(onlineUser.id) === String(friend.id));
        
        // 构建好友列表项HTML
        li.innerHTML = `
            ${avatarHtml}
            <span class="friend-name">${friend.nickname}</span>
            <span class="friend-status ${isOnline ? 'online' : 'offline'}"></span>
            <div class="unread-count private-unread-count" id="privateUnreadCount_${friend.id}"></div>
        `;
        
        // 添加点击事件，切换到与该好友的私信聊天
        li.addEventListener('click', () => {
            switchToPrivateChat(friend.id, friend.nickname, friend.username, avatarUrl);
        });
        
        friendsListElement.appendChild(li);
    });
    
    // 更新未读消息计数显示
    updateUnreadCountsDisplay();
    
    // 为好友头像添加点击事件监听器
    addAvatarClickListeners();
}

// 切换到私信聊天
function switchToPrivateChat(userId, nickname, username, avatarUrl) {
    currentPrivateChatUserId = userId;
    currentPrivateChatUsername = username;
    currentPrivateChatNickname = nickname;
    
    // 更新私信聊天界面
    const privateChatInterface = document.getElementById('privateChatInterface');
    const privateEmptyState = document.getElementById('privateEmptyState');
    const privateUserName = document.getElementById('privateUserName');
    const privateUserAvatar = document.getElementById('privateUserAvatar');
    const privateUserInitials = document.getElementById('privateUserInitials');
    const privateUserStatus = document.getElementById('privateUserStatus');
    
    if (privateChatInterface && privateEmptyState && privateUserName && privateUserAvatar && privateUserInitials) {
        // 显示私信聊天界面，隐藏空白状态
        privateChatInterface.style.display = 'flex';
        privateChatInterface.style.flexDirection = 'column';
        privateEmptyState.style.display = 'none';
        
        // 更新用户名
        privateUserName.textContent = nickname ? unescapeHtml(nickname) : '';
        
        // 更新用户头像
    if (avatarUrl) {
        const fullAvatarUrl = `${SERVER_URL}${avatarUrl}`;
        privateUserAvatar.src = fullAvatarUrl;
        privateUserAvatar.style.display = 'block';
        privateUserAvatar.style.visibility = 'visible'; // 确保头像可见
        privateUserInitials.style.display = 'none';
        privateUserInitials.style.visibility = 'hidden'; // 确保初始头像不可见
    } else {
        const initials = nickname ? nickname.charAt(0).toUpperCase() : 'U';
        privateUserInitials.textContent = initials;
        privateUserInitials.style.display = 'flex';
        privateUserInitials.style.visibility = 'visible'; // 确保初始头像可见
        privateUserAvatar.style.display = 'none';
        privateUserAvatar.style.visibility = 'hidden'; // 确保头像不可见
        privateUserAvatar.src = ''; // 清空头像src，防止显示旧头像
    }
    
    // 更新用户在线状态
    if (privateUserStatus) {
        const isOnline = onlineUsersList.some(onlineUser => String(onlineUser.id) === String(userId));
        privateUserStatus.textContent = isOnline ? '在线' : '离线';
        privateUserStatus.className = `user-status ${isOnline ? 'online' : 'offline'}`;
    }
    }
    
    // 加载私信聊天历史
    loadPrivateChatHistory(userId);
    
    // 设置当前活动聊天室为私信
    setActiveChat('private', userId);
    
    // 重新初始化私信聊天界面事件，确保按钮功能更新
    initializePrivateChatInterface();
}

// 加载私信聊天历史
function loadPrivateChatHistory(userId) {
    if (!currentUser || !currentSessionToken) return;
    
    const privateMessageContainer = document.getElementById('privateMessageContainer');
    if (privateMessageContainer) {
        // 显示友好的加载状态
        privateMessageContainer.innerHTML = `
            <div class="loading-messages">
                <div class="loading-spinner"></div>
                <div class="loading-text">正在加载聊天记录...</div>
            </div>
        `;
        
        // 发送加入私信会话事件，获取聊天历史
        if (window.chatSocket) {
            window.chatSocket.emit('join-private-chat', {
                userId: currentUser.id,
                friendId: userId,
                sessionToken: currentSessionToken
            });
        } else {
            // WebSocket未连接，显示错误信息
            privateMessageContainer.innerHTML = `
                <div class="empty-state error-state">
                    <div class="error-icon">❌</div>
                    <h3>连接失败</h3>
                    <p>无法连接到聊天服务器，请检查网络连接后重试</p>
                    <button class="retry-button" onclick="loadPrivateChatHistory(${userId})">重试</button>
                </div>
            `;
        }
    }
}

// 渲染私信消息
function renderPrivateMessage(message, returnElement = false) {
    const privateMessageContainer = document.getElementById('privateMessageContainer');
    if (!privateMessageContainer) return;
    
    // 检查消息对象是否有效
    if (!message) {
        return;
    }
    
    // 检查是否是当前聊天对象的消息，使用字符串比较确保类型一致
    const msgSenderId = String(message.senderId);
    const msgReceiverId = String(message.receiverId);
    const currentChatId = String(currentPrivateChatUserId);
    if (msgSenderId !== currentChatId && msgReceiverId !== currentChatId) {
        return;
    }
    
    // 检查消息ID是否已经存在，避免重复渲染
    if (document.querySelector(`#privateMessageContainer [data-id="${message.id}"]`)) {
        return;
    }
    
    // 移除加载状态
    const loadingElement = privateMessageContainer.querySelector('.loading-messages');
    if (loadingElement) {
        loadingElement.remove();
    }
    
    // 移除空状态
    const emptyElement = privateMessageContainer.querySelector('.empty-state');
    if (emptyElement) {
        emptyElement.remove();
    }
    
    // 允许content为null或空字符串，支持纯图片或文件消息
    if (!message.messageType && !message.content && !message.imageUrl && !message.fileUrl && !message.text) {
        return;
    }
    
    // 适配不同消息格式，支持直接包含userId、nickname等字段的消息
    const messageUser = {
        id: message.senderId,
        nickname: message.senderNickname || message.sender || '未知用户',
        avatarUrl: message.senderAvatarUrl || message.avatarUrl
    };
    
    // 安全获取发送者信息
    const senderId = messageUser.id;
    const senderNickname = messageUser.nickname;
    const senderAvatarUrl = messageUser.avatarUrl;
    const isOwn = currentUser && String(currentUser.id) === String(senderId);
    
    // 创建消息元素
    const messageElement = document.createElement('div');
    // 设置消息样式：别人的消息靠左白色，自己的消息靠右绿色
    messageElement.className = `message ${isOwn ? 'own-message' : 'other-message'}`;
    messageElement.setAttribute('data-id', message.id);
    messageElement.setAttribute('data-user-id', senderId);
    
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
        messageElement.style.minWidth = '70px'; // 确保能容纳时间显示
        messageElement.style.alignSelf = 'flex-end';
        messageElement.style.position = 'relative'; // 为撤回按钮添加定位上下文
        messageElement.style.transition = 'all 0.2s';
    } else {
        messageElement.style.marginLeft = '10px';
        messageElement.style.marginRight = '20%';
        messageElement.style.backgroundColor = '#FFFFFF';
        messageElement.style.borderRadius = '18px';
        messageElement.style.padding = '10px 15px';
        messageElement.style.maxWidth = '80%';
        messageElement.style.minWidth = '70px'; // 确保能容纳时间显示
        messageElement.style.alignSelf = 'flex-start';
        messageElement.style.border = '1px solid #E0E0E0';
        messageElement.style.position = 'relative'; // 为可能的未来功能添加定位上下文
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
    
    // 构建消息HTML
    let messageHtml = '';
    
    // 使用时间格式显示时间，不带年月日
    const timeString = new Date(message.timestampISO || message.created_at || message.timestamp).toLocaleTimeString();
    
    // 消息头部：只显示时间，不显示昵称
    if (!isOwn) {
        // 对方消息：时间显示在消息左侧
        messageHtml += `<div class="message-header" style="display: flex; justify-content: flex-start; margin-bottom: 5px;">`;
        messageHtml += `<span class="message-time" style="color: #999; font-size: 12px;">${timeString}</span>`;
        messageHtml += `</div>`;
    } else {
        // 自己的消息：时间显示在消息右侧
        messageHtml += `<div class="message-header" style="display: flex; justify-content: flex-end; margin-bottom: 5px;">`;
        messageHtml += `<span class="message-time" style="color: #999; font-size: 12px;">${timeString}</span>`;
        messageHtml += `</div>`;
    }
    
    // 设置消息最小宽度，确保能容纳时间显示
    messageElement.style.minWidth = "70px";
    
    // 消息内容
    messageHtml += `<div class="message-content">`;
    
    // 处理不同类型的消息
    switch (message.messageType) {
        case 1: // 图片消息
            if (message.imageUrl) {
                // 直接使用imageUrl字段
                const fullImageUrl = message.imageUrl.startsWith('http') ? message.imageUrl : `${SERVER_URL}${message.imageUrl}`;
                messageHtml += `<img src="${fullImageUrl}" alt="图片" class="message-image" onclick="openImagePreview('${fullImageUrl}')" style="max-width: 100%; border-radius: 10px; cursor: pointer;">`;
            } else {
                try {
                    // 尝试从content字段解析
                    const imageData = JSON.parse(message.content);
                    if (imageData && imageData.url) {
                        const fullImageUrl = imageData.url.startsWith('http') ? imageData.url : `${SERVER_URL}${imageData.url}`;
                        messageHtml += `<img src="${fullImageUrl}" alt="图片" class="message-image" onclick="openImagePreview('${fullImageUrl}')" style="max-width: 100%; border-radius: 10px; cursor: pointer;">`;
                    }
                } catch (error) {
                    // 如果解析失败，作为普通文本消息处理
                    messageHtml += `<div class="message-text">${escapeHtml(message.content)}</div>`;
                }
            }
            break;
            
        case 2: // 文件消息
            if (message.fileUrl) {
                // 直接使用fileUrl字段
                const fullFileUrl = message.fileUrl.startsWith('http') ? message.fileUrl : `${SERVER_URL}${message.fileUrl}`;
                messageHtml += `<div class="file-link-container" style="display: flex; align-items: center; gap: 10px; padding: 10px; background: #f5f5f5; border-radius: 8px;">`;
                messageHtml += `<span class="file-icon" style="font-size: 20px;">📁</span>`;
                messageHtml += `<a href="${fullFileUrl}" target="_blank" class="message-link" style="text-decoration: none; color: #0d6efd; word-break: break-all;">${message.fileName || '文件'}</a>`;
                if (message.fileSize) {
                    messageHtml += `<span class="file-size" style="color: #666; font-size: 12px;">(${formatFileSize(message.fileSize)})</span>`;
                }
                messageHtml += `</div>`;
            } else {
                try {
                    // 尝试从content字段解析
                    const fileData = JSON.parse(message.content);
                    if (fileData && fileData.url && fileData.name) {
                        const fullFileUrl = fileData.url.startsWith('http') ? fileData.url : `${SERVER_URL}${fileData.url}`;
                        messageHtml += `<div class="file-link-container" style="display: flex; align-items: center; gap: 10px; padding: 10px; background: #f5f5f5; border-radius: 8px;">`;
                        messageHtml += `<span class="file-icon" style="font-size: 20px;">📁</span>`;
                        messageHtml += `<a href="${fullFileUrl}" target="_blank" class="message-link" style="text-decoration: none; color: #0d6efd; word-break: break-all;">${fileData.name}</a>`;
                        if (fileData.size) {
                            messageHtml += `<span class="file-size" style="color: #666; font-size: 12px;">(${formatFileSize(fileData.size)})</span>`;
                        }
                        messageHtml += `</div>`;
                    }
                } catch (error) {
                    // 如果解析失败，作为普通文本消息处理
                    messageHtml += `<div class="message-text">${escapeHtml(message.content)}</div>`;
                }
            }
            break;
            
        case 3: // 群名片消息
            try {
                // 解析群名片数据
                const groupCardData = JSON.parse(message.content);
                messageHtml += `
                    <div class="group-card-container" style="background-color: #f0f8ff; border: 1px solid #3498db; border-radius: 8px; padding: 10px; cursor: pointer; margin-top: 5px;">
                        <div class="group-card-header" style="font-weight: bold; color: #3498db; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;">
                            ${groupCardData.avatar_url ? `<img src="${SERVER_URL}${groupCardData.avatar_url}" alt="${groupCardData.group_name}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; cursor: pointer;" onclick="openImagePreview('${SERVER_URL}${groupCardData.avatar_url}')">` : `<div style="width: 20px; height: 20px; border-radius: 50%; background-color: #3498db; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">${groupCardData.group_name.charAt(0).toUpperCase()}</div>`}
                            ${escapeHtml(groupCardData.group_name)}
                        </div>
                        <div class="group-card-description" style="color: #666; font-size: 14px; margin-bottom: 5px;">
                            ${groupCardData.group_description || '暂无描述'}
                        </div>
                        <div class="group-card-footer" style="font-size: 12px; color: #999;">
                            点击查看群组详情
                        </div>
                    </div>
                `;
            } catch (error) {
                // 如果解析失败，作为普通文本消息处理
                messageHtml += `<div class="message-text">${escapeHtml(message.content)}</div>`;
            }
            break;
            
        default: // 文本消息
            // 使用Markdown渲染文本消息
            let content = message.content || message.text || '';
            // 先转义内容，确保安全
            content = escapeHtml(content);
            if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
                try {
                    // 配置marked，确保安全渲染
                    marked.setOptions({
                        breaks: true,
                        gfm: true
                    });
                    content = marked.parse(content);
                } catch (e) {
                    // 如果解析失败，使用已经转义的内容
                    content = escapeHtml(content);
                }
            } else {
                // 没有marked库，使用已经转义的内容
                content = escapeHtml(content);
            }
            messageHtml += `<div class="message-text" style="word-break: break-word;">${content}</div>`;
            break;
    }
    
    messageHtml += `</div>`;
    
    // 为自己发送的消息添加撤回按钮
    if (isOwn) {
        messageHtml += `<button class="message-action-button withdraw-button" onclick="withdrawPrivateMessage(${message.id})" style="position: absolute; top: 8px; right: 8px; background: transparent; border: none; color: #666; font-size: 16px; cursor: pointer; padding: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 50%; opacity: 1;">×</button>`;
    }
    
    messageElement.innerHTML = messageHtml;
    
    // 为群名片添加点击事件
    if (message.messageType === 3) {
        const groupCardElement = messageElement.querySelector('.group-card-container');
        if (groupCardElement) {
            try {
                const groupCardData = JSON.parse(message.content);
                groupCardElement.addEventListener('click', function(e) {
                    e.stopPropagation();
                    // 使用群组聊天界面的群名片弹窗
                    showGroupCardPopup(e, groupCardData);
                });
            } catch (error) {
                console.error('解析群名片数据失败:', error);
            }
        }
    }
    
    if (returnElement) {
        // 如果需要返回元素（用于历史消息加载），不直接添加到容器
        return messageElement;
    } else {
        // 添加到消息容器
        privateMessageContainer.appendChild(messageElement);
        
        // 滚动到底部
        privateMessageContainer.scrollTop = privateMessageContainer.scrollHeight;
    }
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes < 1024) {
        return bytes + ' B';
    } else if (bytes < 1048576) {
        return (bytes / 1024).toFixed(2) + ' KB';
    } else if (bytes < 1073741824) {
        return (bytes / 1048576).toFixed(2) + ' MB';
    } else {
        return (bytes / 1073741824).toFixed(2) + ' GB';
    }
}

// 撤回私信消息 - 定义为全局函数，以便HTML可以直接调用
window.withdrawPrivateMessage = function(messageId) {
    if (!currentUser || !currentSessionToken) return;
    
    // 发送撤回请求到服务器
    if (window.chatSocket) {
        window.chatSocket.emit('withdraw-private-message', {
            userId: currentUser.id,
            messageId: messageId,
            sessionToken: currentSessionToken
        });
    }
}

// 上传私信图片
function uploadPrivateImage(file) {
    if (!currentUser || !currentSessionToken || !currentPrivateChatUserId) return;
    
    // 检查当前聊天对象是否是好友
    const isFriend = friendsList.some(friend => String(friend.id) === String(currentPrivateChatUserId));
    if (!isFriend) {
        alert('您与该用户不是好友，无法发送私信');
        return;
    }
    
    const formData = new FormData();
    formData.append('image', file);
    formData.append('userId', currentUser.id);
    formData.append('privateChat', true); // 标记为私信聊天，只返回文件URL，不创建消息
    
    // 使用私信聊天的上传进度条
    const uploadProgress = document.getElementById('privateUploadProgress');
    const uploadProgressBar = document.getElementById('privateUploadProgressBar');
    if (uploadProgress && uploadProgressBar) {
        uploadProgress.style.display = 'block';
        uploadProgressBar.style.width = '0%';
    }
    
    // 发送图片上传请求
    fetch(`${SERVER_URL}/upload`, {
        method: 'POST',
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // 上传成功，构建消息数据并发送私信
            const messageData = {
                userId: currentUser.id,
                content: JSON.stringify({ url: data.url, name: file.name }),
                receiverId: currentPrivateChatUserId,
                sessionToken: currentSessionToken,
                messageType: 1 // 1代表图片消息
            };
            
            // 发送私信
            if (window.chatSocket) {
                window.chatSocket.emit('private-message', messageData);
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
        // 清空文件输入
        const privateImageInput = document.getElementById('privateImageInput');
        if (privateImageInput) {
            privateImageInput.value = '';
        }
    });
}

// 上传私信文件
function uploadPrivateFile(file) {
    if (!currentUser || !currentSessionToken || !currentPrivateChatUserId) return;
    
    // 检查当前聊天对象是否是好友
    const isFriend = friendsList.some(friend => String(friend.id) === String(currentPrivateChatUserId));
    if (!isFriend) {
        alert('您与该用户不是好友，无法发送私信');
        return;
    }
    
    const formData = new FormData();
    formData.append('image', file); // 使用与图片上传相同的字段名，保持后端一致
    formData.append('userId', currentUser.id);
    formData.append('privateChat', true); // 标记为私信聊天，只返回文件URL，不创建消息
    
    // 使用私信聊天的上传进度条
    const uploadProgress = document.getElementById('privateUploadProgress');
    const uploadProgressBar = document.getElementById('privateUploadProgressBar');
    if (uploadProgress && uploadProgressBar) {
        uploadProgress.style.display = 'block';
        uploadProgressBar.style.width = '0%';
    }
    
    // 发送文件上传请求
    fetch(`${SERVER_URL}/upload`, {
        method: 'POST',
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // 上传成功，构建消息数据并发送私信
            const messageData = {
                userId: currentUser.id,
                content: JSON.stringify({ url: data.url, name: file.name, size: file.size }),
                receiverId: currentPrivateChatUserId,
                sessionToken: currentSessionToken,
                messageType: 2 // 2代表文件消息
            };
            
            // 发送私信
            if (window.chatSocket) {
                window.chatSocket.emit('private-message', messageData);
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
        // 清空文件输入
        const privateFileInput = document.getElementById('privateFileInput');
        if (privateFileInput) {
            privateFileInput.value = '';
        }
    });
}

// 初始化好友列表事件监听
function initializeFriendsListListeners() {
    // 好友列表搜索功能
    const privateChatSearchInput = document.getElementById('privateChatSearchInput');
    const clearPrivateChatSearch = document.getElementById('clearPrivateChatSearch');
    
    if (privateChatSearchInput && clearPrivateChatSearch) {
        privateChatSearchInput.addEventListener('input', () => {
            const keyword = privateChatSearchInput.value.toLowerCase();
            const friendItems = document.querySelectorAll('.friend-item');
            
            friendItems.forEach(item => {
                const friendName = item.dataset.userNickname.toLowerCase();
                if (friendName.includes(keyword)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
            
            // 显示或隐藏清除搜索按钮
            if (keyword) {
                clearPrivateChatSearch.style.display = 'inline';
            } else {
                clearPrivateChatSearch.style.display = 'none';
            }
        });
        
        clearPrivateChatSearch.addEventListener('click', () => {
            privateChatSearchInput.value = '';
            clearPrivateChatSearch.style.display = 'none';
            const friendItems = document.querySelectorAll('.friend-item');
            friendItems.forEach(item => {
                item.style.display = 'flex';
            });
        });
    }
    
    // 搜索用户按钮
    const searchUserButton = document.getElementById('searchUserButton');
    if (searchUserButton) {
        searchUserButton.addEventListener('click', () => {
            document.getElementById('userSearchModal').style.display = 'flex';
        });
    }
}

// 初始化用户资料模态框
function initializeUserProfileModal() {
    // 关闭用户资料模态框
    const closeUserProfileModal = document.getElementById('closeUserProfileModal');
    const closeUserProfileButton = document.getElementById('closeUserProfileButton');
    
    if (closeUserProfileModal) {
        closeUserProfileModal.addEventListener('click', () => {
            document.getElementById('userProfileModal').style.display = 'none';
        });
    }
    
    if (closeUserProfileButton) {
        closeUserProfileButton.addEventListener('click', () => {
            document.getElementById('userProfileModal').style.display = 'none';
        });
    }
    

}

// 初始化用户搜索功能
function initializeUserSearch() {
    // 关闭用户搜索模态框
    const closeUserSearchModal = document.getElementById('closeUserSearchModal');
    const cancelUserSearch = document.getElementById('cancelUserSearch');
    
    if (closeUserSearchModal) {
        closeUserSearchModal.addEventListener('click', () => {
            document.getElementById('userSearchModal').style.display = 'none';
        });
    }
    
    if (cancelUserSearch) {
        cancelUserSearch.addEventListener('click', () => {
            document.getElementById('userSearchModal').style.display = 'none';
        });
    }
    
    // 搜索用户按钮
    const confirmUserSearch = document.getElementById('confirmUserSearch');
    if (confirmUserSearch) {
        confirmUserSearch.addEventListener('click', () => {
            const searchKeyword = document.getElementById('searchKeyword').value;
            if (searchKeyword.trim()) {
                searchUsers(searchKeyword.trim());
            }
        });
    }
}

// 搜索用户
function searchUsers(keyword) {
    if (!currentUser || !currentSessionToken) return;
    
    // 使用fetch API搜索用户
    fetch(`${SERVER_URL}/user/search?keyword=${encodeURIComponent(keyword)}`, {
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            displaySearchResults(data.users);
        } else {
            const searchResults = document.getElementById('searchResults');
            if (searchResults) {
                searchResults.innerHTML = '<div class="search-result-item">搜索失败: ' + data.message + '</div>';
            }
        }
    })
    .catch(error => {
        const searchResults = document.getElementById('searchResults');
        if (searchResults) {
            searchResults.innerHTML = '<div class="search-result-item">搜索失败: 网络错误</div>';
        }
    });
}

// 显示搜索结果
function displaySearchResults(users) {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;
    
    searchResults.innerHTML = '';
    
    if (users.length === 0) {
        searchResults.innerHTML = '<div class="search-result-item">未找到匹配的用户</div>';
        return;
    }
    
    users.forEach(user => {
        const resultItem = document.createElement('div');
        resultItem.className = 'search-result-item';
        
        // 安全获取用户头像URL，复制其他地方的头像插入逻辑
    let avatarUrl = '';
    if (user.avatarUrl && typeof user.avatarUrl === 'string') {
        avatarUrl = user.avatarUrl.trim();
    } else if (user.avatar_url && typeof user.avatar_url === 'string') {
        avatarUrl = user.avatar_url.trim();
    } else if (user.avatar && typeof user.avatar === 'string') {
        avatarUrl = user.avatar.trim();
    }
    
    // 检查avatarUrl是否为有效的图片URL，避免显示无效链接
    if (avatarUrl) {
        const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;
        if (!avatarUrl.match(imageExtensions) && !avatarUrl.includes('/avatar/') && !avatarUrl.includes('/upload/')) {
            // 无效的头像URL，清空以便显示默认头像
            avatarUrl = '';
        }
    }
    
    // 检查avatarUrl是否为有效的图片URL，避免显示无效链接
    if (avatarUrl) {
        const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;
        if (!avatarUrl.match(imageExtensions) && !avatarUrl.includes('/avatar/') && !avatarUrl.includes('/upload/')) {
            // 无效的头像URL，清空以便显示默认头像
            avatarUrl = '';
        }
    }
    
    // 检查头像URL是否为SVG格式，防止XSS攻击
    const isSvgAvatar = /\.svg$/i.test(avatarUrl);
        
        // 显示用户头像或默认头像
        let avatarHtml = '';
        if (avatarUrl) {
            const isSvgAvatar = /\.svg$/i.test(avatarUrl);
            if (isSvgAvatar) {
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
        
        // 构建搜索结果项HTML
        resultItem.innerHTML = `
            ${avatarHtml}
            <div class="search-result-info">
                <div class="search-result-nickname">${user.nickname}</div>
                <div class="search-result-username">@${user.username}</div>
            </div>
            <button class="add-friend-btn" data-user-id="${user.id}" data-user-nickname="${user.nickname}" data-user-avatar="${avatarUrl}">+</button>
        `;
        
        // 添加添加好友按钮事件
        const addFriendBtn = resultItem.querySelector('.add-friend-btn');
        addFriendBtn.addEventListener('click', () => {
            addFriend(user.id);
        });
        
        // 为搜索结果中的用户头像添加点击事件
        const resultAvatar = resultItem.querySelector('.user-avatar');
        resultAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            showUserAvatarPopup(e, user);
        });
        
        // 添加点击事件，显示用户资料
        resultItem.addEventListener('click', (e) => {
            if (!e.target.classList.contains('add-friend-btn') && !e.target.closest('.user-avatar')) {
                showUserProfile(user);
            }
        });
        
        searchResults.appendChild(resultItem);
    });
}

// 显示用户资料
function showUserProfile(user) {
    const userProfileModal = document.getElementById('userProfileModal');
    const modalUserAvatar = document.getElementById('modalUserAvatar');
    const modalUserInitials = document.getElementById('modalUserInitials');
    const modalUserNickname = document.getElementById('modalUserNickname');
    const modalUsername = document.getElementById('modalUsername');
    const modalUserId = document.getElementById('modalUserId');
    const modalUserStatus = document.getElementById('modalUserStatus');
    
    if (!userProfileModal || !modalUserAvatar || !modalUserInitials || !modalUserNickname || !modalUsername || !modalUserId || !modalUserStatus) return;
    
    // 安全获取用户头像URL，复制其他地方的头像插入逻辑
    let avatarUrl = '';
    if (user.avatarUrl && typeof user.avatarUrl === 'string') {
        avatarUrl = user.avatarUrl.trim();
    } else if (user.avatar_url && typeof user.avatar_url === 'string') {
        avatarUrl = user.avatar_url.trim();
    } else if (user.avatar && typeof user.avatar === 'string') {
        avatarUrl = user.avatar.trim();
    }
    
    // 检查avatarUrl是否为有效的图片URL，避免显示无效链接
    if (avatarUrl) {
        const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;
        if (!avatarUrl.match(imageExtensions) && !avatarUrl.includes('/avatar/') && !avatarUrl.includes('/upload/')) {
            // 无效的头像URL，清空以便显示默认头像
            avatarUrl = '';
        }
    }
    
    // 检查头像URL是否为SVG格式，防止XSS攻击
    const isSvgAvatar = /\.svg$/i.test(avatarUrl);
    
    // 更新用户头像
    if (avatarUrl && !isSvgAvatar) {
        let fullAvatarUrl = '';
        // 如果已经是完整URL，直接使用，否则拼接SERVER_URL
        if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
            fullAvatarUrl = avatarUrl;
        } else {
            fullAvatarUrl = `${SERVER_URL}${avatarUrl}`;
        }
        modalUserAvatar.src = fullAvatarUrl;
        modalUserAvatar.style.display = 'block';
        modalUserAvatar.style.width = '120px'; // 确保头像大小一致
        modalUserAvatar.style.height = '120px'; // 确保头像大小一致
        modalUserAvatar.style.visibility = 'visible'; // 确保头像可见
        modalUserInitials.style.display = 'none';
        modalUserInitials.style.visibility = 'hidden'; // 确保初始头像不可见
    } else {
        // 没有头像时显示默认头像（首字母）
        const initials = user.nickname ? user.nickname.charAt(0).toUpperCase() : 'U';
        modalUserInitials.textContent = initials;
        modalUserInitials.style.display = 'flex';
        modalUserInitials.style.alignItems = 'center';
        modalUserInitials.style.justifyContent = 'center';
        modalUserInitials.style.width = '80px'; // 调整初始头像大小为更小的值
        modalUserInitials.style.height = '80px'; // 调整初始头像大小为更小的值
        modalUserInitials.style.fontSize = '32px'; // 调整初始头像字体大小为更小的值
        modalUserInitials.style.borderRadius = '50%'; // 圆形初始头像
        modalUserInitials.style.backgroundColor = '#f0f0f0'; // 初始头像背景色
        modalUserInitials.style.color = '#333'; // 初始头像文字颜色
        modalUserInitials.style.border = '2px solid #e0e0e0'; // 添加边框
        modalUserInitials.style.visibility = 'visible'; // 确保初始头像可见
        modalUserInitials.style.position = 'relative'; // 确保初始头像在正确的层级
        modalUserInitials.style.zIndex = '1'; // 确保初始头像不会覆盖其他内容
        
        // 确保没有头像时，图片元素完全不可见
        modalUserAvatar.style.display = 'none';
        modalUserAvatar.style.visibility = 'hidden'; // 确保图片不可见
        modalUserAvatar.src = ''; // 清空图片src，防止alt文本显示
    }
    
    // 更新用户资料
    modalUserNickname.textContent = user.nickname ? unescapeHtml(user.nickname) : '未知昵称';
    // 确保modalUsername显示的是用户名，而不是昵称
    const username = user.username || user.name || '未知用户名';
    modalUsername.textContent = typeof username === 'string' ? unescapeHtml(username) : username;
    modalUserId.textContent = user.id;
    
    // 检查用户是否在线
    const isOnline = onlineUsersList.some(onlineUser => String(onlineUser.id) === String(user.id));
    modalUserStatus.textContent = isOnline ? '在线' : '离线';
    
    // 显示用户资料模态框
    userProfileModal.style.display = 'flex';
    
    // 添加事件监听器，防止模态框内容点击事件冒泡导致关闭
    const modalContent = userProfileModal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    // 为模态框背景添加点击事件，点击背景关闭模态框
    userProfileModal.addEventListener('click', () => {
        userProfileModal.style.display = 'none';
    });
}

// 显示用户头像小弹窗
function showUserAvatarPopup(event, user) {
    event.stopPropagation();
    
    const popup = document.getElementById('userAvatarPopup');
    const popupAvatarImg = document.getElementById('popupAvatarImg');
    const popupInitials = document.getElementById('popupInitials');
    const popupNickname = document.getElementById('popupNickname');
    const popupUsername = document.getElementById('popupUsername');
    const popupAddFriend = document.getElementById('popupAddFriend');
    
    if (!popup || !popupAvatarImg || !popupInitials || !popupNickname || !popupUsername || !popupAddFriend) return;
    
    // 先隐藏弹窗，等获取到完整用户信息后再显示
    popup.style.display = 'none';
    
    // 保存当前用户ID，用于添加好友
    popup.dataset.userId = user.id;
    
    // 检查是否已经是好友
    const isFriend = friendsList.some(friend => String(friend.id) === String(user.id));
    const isCurrentUser = currentUser && String(currentUser.id) === String(user.id);
    
    // 更新添加好友按钮状态
    if (isFriend || isCurrentUser) {
        popupAddFriend.textContent = '已添加';
        popupAddFriend.style.backgroundColor = '#ccc';
        popupAddFriend.style.cursor = 'not-allowed';
        popupAddFriend.disabled = true;
        popupAddFriend.onclick = null;
    } else {
        popupAddFriend.textContent = '添加好友';
        popupAddFriend.style.backgroundColor = '#3498db';
        popupAddFriend.style.cursor = 'pointer';
        popupAddFriend.disabled = false;
        popupAddFriend.onclick = function() {
            addFriend(user.id);
            hideUserAvatarPopup();
        };
    }
    
    // 请求完整的用户信息，然后再显示弹窗
    const fetchUserInfo = () => {
        return fetch(`${SERVER_URL}/user/${user.id}`, {
            headers: {
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                return data.user;
            }
            throw new Error('获取用户信息失败');
        })
        .catch(error => {
            console.error('获取用户信息失败:', error);
            return null;
        });
    };
    
    // 如果已经有完整用户信息，直接显示；否则先请求
    if (user.id && user.username) {
        // 已有完整信息，直接显示
        displayPopup(user);
    } else {
        // 请求完整用户信息
        fetchUserInfo().then(fullUser => {
            if (fullUser) {
                displayPopup(fullUser);
            } else {
                // 如果请求失败，使用传入的基本信息显示
                displayPopup(user);
            }
        });
    }
    
    // 显示弹窗的函数
    function displayPopup(displayUser) {
        // 更新用户信息
        popupNickname.textContent = displayUser.nickname || '未知昵称';
        
        if (displayUser.username) {
            popupUsername.textContent = displayUser.username;
            popupUsername.style.display = 'block';
        } else {
            popupUsername.textContent = '';
            popupUsername.style.display = 'none';
        }
        
        // 安全获取用户头像URL
        let avatarUrl = '';
        if (displayUser.avatarUrl && typeof displayUser.avatarUrl === 'string') {
            avatarUrl = displayUser.avatarUrl.trim();
        } else if (displayUser.avatar_url && typeof displayUser.avatar_url === 'string') {
            avatarUrl = displayUser.avatar_url.trim();
        } else if (displayUser.avatar && typeof displayUser.avatar === 'string') {
            avatarUrl = displayUser.avatar.trim();
        }
        
        // 更新用户头像
    if (avatarUrl) {
        const fullAvatarUrl = `${SERVER_URL}${avatarUrl}`;
        popupAvatarImg.src = fullAvatarUrl;
        popupAvatarImg.style.display = 'block';
        popupAvatarImg.style.cursor = 'pointer';
        popupAvatarImg.addEventListener('click', function() {
            openImagePreview(popupAvatarImg.src);
        });
        popupInitials.style.display = 'none';
    } else {
        const initials = displayUser.nickname ? displayUser.nickname.charAt(0).toUpperCase() : 'U';
        popupInitials.textContent = initials;
        popupInitials.style.display = 'block';
        popupAvatarImg.style.display = 'none';
    }
        
        // 显示小弹窗以便获取实际尺寸
        popup.style.display = 'block';
        
        // 获取弹窗的实际尺寸
        const popupRect = popup.getBoundingClientRect();
        const popupWidth = popupRect.width;
        const popupHeight = popupRect.height;
        
        // 计算初始位置（以鼠标位置为左上角）
        let left = event.clientX + window.scrollX;
        let top = event.clientY + window.scrollY;
        
        // 确保弹窗不会超出屏幕右边缘
        if (left + popupWidth > window.innerWidth + window.scrollX) {
            left = window.innerWidth + window.scrollX - popupWidth - 10;
        }
        
        // 确保弹窗不会超出屏幕下边缘
        if (top + popupHeight > window.innerHeight + window.scrollY) {
            top = window.innerHeight + window.scrollY - popupHeight - 10;
        }
        
        // 确保弹窗不会超出屏幕左边缘
        if (left < window.scrollX) {
            left = window.scrollX + 10;
        }
        
        // 确保弹窗不会超出屏幕上边缘
        if (top < window.scrollY) {
            top = window.scrollY + 10;
        }
        
        // 设置最终位置
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
        
        // 添加全局点击事件，点击其他地方隐藏小弹窗
        setTimeout(() => {
            document.addEventListener('click', hideUserAvatarPopup);
        }, 0);
    }
}

// 隐藏用户头像小弹窗
function hideUserAvatarPopup() {
    const popup = document.getElementById('userAvatarPopup');
    if (popup) {
        popup.style.display = 'none';
    }
    
    // 移除全局点击事件
    document.removeEventListener('click', hideUserAvatarPopup);
}

// 为用户头像添加点击事件监听器
function addAvatarClickListeners() {
    
    // 为好友列表中的用户头像添加点击事件
    const friendAvatars = document.querySelectorAll('.friend-item .user-avatar');
    friendAvatars.forEach((avatar, index) => {
        avatar.addEventListener('click', (event) => {
            const friend = friendsList[index];
            if (friend) {
                showUserAvatarPopup(event, friend);
            }
        });
    });
    
    // 为在线用户列表中的用户头像添加点击事件
    const onlineUserAvatars = document.querySelectorAll('#userList .user-avatar');
    onlineUserAvatars.forEach((avatar, index) => {
        avatar.addEventListener('click', (event) => {
            const user = onlineUsersList[index];
            if (user) {
                showUserAvatarPopup(event, user);
            }
        });
    });
    
    // 为离线用户列表中的用户头像添加点击事件
    const offlineUserAvatars = document.querySelectorAll('#offlineUserList .user-avatar');
    offlineUserAvatars.forEach((avatar, index) => {
        // 从离线用户列表中获取对应的用户数据
        const offlineUserList = document.querySelectorAll('#offlineUserList .user-item');
        const userNickname = offlineUserList[index].querySelector('.user-name').textContent;
        
        // 创建用户对象
        const user = {
            id: offlineUserList[index].dataset.userId || '',
            nickname: userNickname,
            avatarUrl: ''
        };
        
        avatar.addEventListener('click', (event) => {
            showUserAvatarPopup(event, user);
        });
    });
}

// 添加好友
function addFriend(userId) {
    if (!currentUser || !currentSessionToken) return;
    
    // 使用fetch API添加好友
    fetch(`${SERVER_URL}/user/add-friend`, {
        method: 'POST',
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ friendId: userId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // 重新加载好友列表
            loadFriendsList();
            alert('添加好友成功');
        } else {
            alert('添加好友失败: ' + data.message);
        }
    })
    .catch(error => {
        alert('添加好友失败: 网络错误');
    });
}

// 初始化私信消息发送功能
function initializePrivateMessageSending() {
    // 发送私信按钮事件
    const sendPrivateMessageButton = document.getElementById('sendPrivateMessage');
    if (sendPrivateMessageButton) {
        sendPrivateMessageButton.addEventListener('click', () => {
            sendPrivateMessage();
        });
    }
    
    // 私信消息输入框回车发送
    const privateMessageInput = document.getElementById('privateMessageInput');
    if (privateMessageInput) {
        privateMessageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                e.preventDefault();
                sendPrivateMessage();
            }
        });
    }
    
    // 初始化Markdown工具栏
    const markdownToolbar = document.getElementById('privateMarkdownToolbar');
    if (markdownToolbar) {
        const markdownButtons = markdownToolbar.querySelectorAll('.markdown-btn');
        markdownButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                // 阻止事件冒泡，避免触发其他点击事件
                e.stopPropagation();
                
                const prefix = button.getAttribute('data-prefix') || '';
                const suffix = button.getAttribute('data-suffix') || '';
                const sample = button.getAttribute('data-sample') || '';
                
                // 插入Markdown格式到输入框
                insertMarkdownFormat(prefix, suffix, sample);
            });
        });
    }
    
    // 初始化图片上传功能
    const privateImageUploadButton = document.getElementById('privateImageUploadButton');
    const privateImageInput = document.getElementById('privateImageInput');
    if (privateImageUploadButton && privateImageInput) {
        // 移除可能存在的旧事件监听器
        privateImageUploadButton.onclick = null;
        privateImageInput.onchange = null;
        
        privateImageUploadButton.onclick = () => {
            privateImageInput.click();
        };
        
        privateImageInput.onchange = function() {
            if (this.files && this.files[0]) {
                uploadPrivateImage(this.files[0]);
            }
        };
    }
    
    // 初始化文件上传功能
    const privateFileUploadButton = document.getElementById('privateFileUploadButton');
    const privateFileInput = document.getElementById('privateFileInput');
    if (privateFileUploadButton && privateFileInput) {
        // 移除可能存在的旧事件监听器
        privateFileUploadButton.onclick = null;
        privateFileInput.onchange = null;
        
        privateFileUploadButton.onclick = () => {
            privateFileInput.click();
        };
        
        privateFileInput.onchange = function() {
            if (this.files && this.files[0]) {
                // 如果文件是图片类型，则自动转换为发送图片
                if (this.files[0].type.startsWith('image/')) {
                    uploadPrivateImage(this.files[0]);
                } else {
                    uploadPrivateFile(this.files[0]);
                }
            }
        };
    }
    
    // 为私信输入框添加黏贴事件处理，支持黏贴图片和文件
    // const privateMessageInput = document.getElementById('privateMessageInput');
    if (privateMessageInput) {
        privateMessageInput.addEventListener('paste', function(e) {
            const items = e.clipboardData.items;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        uploadPrivateImage(file);
                    }
                    break;
                } else if (item.type === 'application/octet-stream') {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        uploadPrivateFile(file);
                    }
                    break;
                }
            }
        });
    }
}

// 插入Markdown格式到输入框
function insertMarkdownFormat(prefix, suffix, sample) {
    // 确定当前活动的输入框
    let activeInput = null;
    
    // 根据当前聊天类型选择对应的输入框
    const activeChatContent = document.querySelector('.chat-content.active');
    if (activeChatContent) {
        const contentType = activeChatContent.getAttribute('data-content');
        switch (contentType) {
            case 'public-chat':
                activeInput = document.getElementById('messageInput');
                break;
            case 'group-chat':
                activeInput = document.getElementById('groupMessageInput');
                break;
            case 'private-chat':
                activeInput = document.getElementById('privateMessageInput');
                break;
            default:
                // 默认尝试获取当前聚焦的输入框
                activeInput = document.activeElement;
        }
    } else {
        // 尝试获取当前聚焦的输入框
        activeInput = document.activeElement;
    }
    
    // 如果没有找到有效的输入框，返回
    if (!activeInput || !activeInput.isContentEditable) {
        // 如果当前聚焦的不是可编辑元素，尝试获取可见的可编辑输入框
        const editableInputs = document.querySelectorAll('.editable-div, [contenteditable="true"]');
        for (let i = 0; i < editableInputs.length; i++) {
            if (editableInputs[i].offsetParent !== null) { // 检查元素是否可见
                activeInput = editableInputs[i];
                break;
            }
        }
        
        if (!activeInput || !activeInput.isContentEditable) {
            return;
        }
    }
    
    // 获取当前选中的文本
    let selectedText = '';
    if (window.getSelection) {
        const selection = window.getSelection();
        selectedText = selection.toString();
    } else if (document.selection && document.selection.type !== 'Control') {
        selectedText = document.selection.createRange().text;
    }
    
    // 如果没有选中文本，使用示例文本
    if (!selectedText) {
        selectedText = sample;
    }
    
    // 聚焦到输入框
    activeInput.focus();
    
    // 插入Markdown格式
    const newText = prefix + selectedText + suffix;
    
    // 替换选中的文本
    document.execCommand('insertText', false, newText);
}

// 发送私信
function sendPrivateMessage() {
    if (!currentUser || !currentSessionToken || !currentPrivateChatUserId) return;
    
    const privateMessageInput = document.getElementById('privateMessageInput');
    if (!privateMessageInput) return;
    
    // 获取可编辑div的内容
    const content = privateMessageInput.innerText.trim();
    if (!content) return;
    
    // 检查当前聊天对象是否是好友
    const isFriend = friendsList.some(friend => String(friend.id) === String(currentPrivateChatUserId));
    if (!isFriend) {
        alert('您与该用户不是好友，无法发送私信');
        return;
    }
    
    // 构建私信消息数据
    const messageData = {
        userId: currentUser.id,
        content: content,
        receiverId: currentPrivateChatUserId,
        sessionToken: currentSessionToken
    };
    
    // 发送私信
    if (window.chatSocket) {
        window.chatSocket.emit('private-message', messageData);
    }
    
    // 清空输入框
    privateMessageInput.innerHTML = '';
}

// 初始化私信聊天界面事件
function initializePrivateChatInterface() {
    // 删除好友按钮
    const deleteFriendButton = document.getElementById('deleteFriendButton');
    if (deleteFriendButton) {
        // 移除旧的事件监听器，避免重复绑定
        deleteFriendButton.onclick = null;
        deleteFriendButton.onclick = () => {
            if (currentPrivateChatUserId) {
                deleteFriend(currentPrivateChatUserId);
            }
        };
    }
    
    // 查看用户资料按钮
    const privateUserInfoButton = document.getElementById('privateUserInfoButton');
    if (privateUserInfoButton) {
        // 移除旧的事件监听器，避免重复绑定
        privateUserInfoButton.onclick = null;
        privateUserInfoButton.onclick = () => {
            // 显示用户资料模态框
            if (currentPrivateChatUserId && currentPrivateChatUsername) {
                // 获取当前聊天对象的头像URL
                const privateUserAvatar = document.getElementById('privateUserAvatar');
                let avatarUrl = '';
                if (privateUserAvatar && privateUserAvatar.src && privateUserAvatar.src !== '') {
                    // 确保只有当src包含SERVER_URL时才进行替换，避免重复拼接
                    if (privateUserAvatar.src.startsWith(SERVER_URL)) {
                        avatarUrl = privateUserAvatar.src.replace(SERVER_URL, '');
                    } else if (privateUserAvatar.src.startsWith('http')) {
                        // 如果是完整URL，直接使用
                        avatarUrl = privateUserAvatar.src;
                    }
                }
                
                // 直接使用当前聊天对象的信息创建用户对象
                const user = {
                    id: currentPrivateChatUserId,
                    nickname: currentPrivateChatNickname,
                    avatarUrl: avatarUrl,
                    username: currentPrivateChatUsername // 使用昵称作为用户名，因为私信中没有用户名信息
                };
                showUserProfile(user);
            }
        };
    }
    
    // 私信更多按钮
    const privateMoreButton = document.getElementById('privateMoreButton');
    if (privateMoreButton) {
        // 移除旧的事件监听器，避免重复绑定
        privateMoreButton.onclick = null;
        privateMoreButton.onclick = (e) => {
            e.stopPropagation();
            const privateMoreFunctions = document.getElementById('privateMoreFunctions');
            if (privateMoreFunctions) {
                privateMoreFunctions.classList.toggle('show');
            }
        };
    }
    
    // 私信Markdown工具栏切换按钮
    const togglePrivateMarkdownToolbar = document.getElementById('togglePrivateMarkdownToolbar');
    if (togglePrivateMarkdownToolbar) {
        togglePrivateMarkdownToolbar.addEventListener('click', () => {
            const privateMarkdownToolbar = document.getElementById('privateMarkdownToolbar');
            if (privateMarkdownToolbar) {
                privateMarkdownToolbar.style.display = privateMarkdownToolbar.style.display === 'flex' ? 'none' : 'flex';
                
                // 切换图标方向
                const icon = togglePrivateMarkdownToolbar.querySelector('i');
                if (icon) {
                    icon.style.transform = privateMarkdownToolbar.style.display === 'flex' ? 'rotate(180deg)' : 'rotate(0deg)';
                }
            }
        });
    }
    
    // 私信聊天界面初始化完成 - 已在initializePrivateMessageSending中添加了上传按钮事件监听器
    
    // 为私信聊天界面添加点击事件监听器，清除未读计数并发送加入事件
    const privateChatInterface = document.getElementById('privateChatInterface');
    if (privateChatInterface) {
        privateChatInterface.addEventListener('click', function() {
            if (currentPrivateChatUserId) {
                // 清除私信未读计数
                delete unreadMessages.private[currentPrivateChatUserId];
                updateUnreadCountsDisplay();
                updateTitleWithUnreadCount();
                
                // 发送加入私信聊天事件，只清除未读计数，不返回消息历史
                if (window.chatSocket) {
                    window.chatSocket.emit('join-private-chat', {
                        userId: currentUser.id,
                        friendId: currentPrivateChatUserId,
                        sessionToken: currentSessionToken,
                        onlyClearUnread: true
                    });
                }
            }
        });
    }
}

// 删除好友
function deleteFriend(userId) {
    if (!currentUser || !currentSessionToken) return;
    
    if (confirm('确定要删除这个好友吗？')) {
        // 使用fetch API删除好友
        fetch(`${SERVER_URL}/user/remove-friend`, {
            method: 'POST',
            headers: {
                'user-id': currentUser.id,
                'session-token': currentSessionToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ friendId: userId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // 重新加载好友列表
                loadFriendsList();
                
                // 如果当前正在与该好友聊天，切换到空白状态
                if (currentPrivateChatUserId === userId) {
                    const privateChatInterface = document.getElementById('privateChatInterface');
                    const privateEmptyState = document.getElementById('privateEmptyState');
                    if (privateChatInterface && privateEmptyState) {
                        privateChatInterface.style.display = 'none';
                        privateEmptyState.style.display = 'flex';
                        currentPrivateChatUserId = null;
                        currentPrivateChatUsername = '';
                    }
                }
                
                alert('删除好友成功');
            } else {
                alert('删除好友失败: ' + data.message);
            }
        })
        .catch(error => {
            alert('删除好友失败: 网络错误');
        });
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
    
    // 直接执行初始化，不依赖DOMContentLoaded事件
    // 初始化消息发送功能
    initializeMessageSending();
    
    // 初始化群组功能
    initializeGroupFunctions();
    
    // 初始化私信聊天功能
    initializePrivateChatFunctions();
    
    // 初始化设置功能
    initializeSettingsFunctions();
    
    // 初始化页面焦点事件监听
    initializeFocusListeners();
    
    // 初始化更多按钮功能
    initializeMoreButtons();
    
    // 加载用户列表
    loadUserList();
    
    // 加载离线用户列表
    loadOfflineUsers();
    
    // 加载群组列表
    loadGroupList();
    
    // 加载好友列表
    loadFriendsList();
    
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
        
        // 检查IP是否被封禁，根据后端返回的isBanned字段判断
        if (data.isBanned) {
            const message = `您的IP已被封禁，${data.message || '无法访问'}`;
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
    
    // 在线用户列表定时请求定时器
    let onlineUsersTimer = null;
    
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
                    
                    // 启动定时请求在线用户列表（每30秒一次），用于及时获取IP封禁消息
                    if (!onlineUsersTimer) {
                        onlineUsersTimer = setInterval(() => {
                            if (isConnected && currentUser && currentSessionToken) {
                                socket.emit('get-online-users');
                            }
                        }, 30000); // 30秒
                    }
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
                    
                    // 确保定时请求在线用户列表的定时器已启动
                    if (!onlineUsersTimer) {
                        onlineUsersTimer = setInterval(() => {
                            if (isConnected && currentUser && currentSessionToken) {
                                socket.emit('get-online-users');
                            }
                        }, 30000); // 30秒
                    }
                }
            });
        }
    });
    
    // 断开连接事件
    socket.on('disconnect', () => {
        isConnected = false;
        // 禁用消息发送功能
        disableMessageSending();
        // 清除在线用户列表定时请求定时器
        if (onlineUsersTimer) {
            clearInterval(onlineUsersTimer);
            onlineUsersTimer = null;
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
            // 标记为实时消息
            message.isHistory = false;
            // 如果包含群组ID，调用群组消息显示函数
            handleNewMessage(message, true, message.groupId);
            displayGroupMessage(message);
        } else {
            // 否则调用普通消息显示函数
            handleNewMessage(message, false);
            displayMessage(message);
        }
    });
    
    // 接收消息发送确认事件
    socket.on('message-sent', (data) => {
        // 检查是否包含完整的消息数据
        if (data.message) {
            const message = data.message;
            // 标记为实时消息
            message.isHistory = false;
            
            // 检查消息是否包含群组ID
            if (message.groupId) {
                // 如果是群组消息，直接显示，不更新未读计数（自己发送的消息）
                displayGroupMessage(message);
            } else {
                // 否则显示普通消息
                displayMessage(message);
            }
        }
    });
    
    // 接收群组消息事件 - 保留用于兼容性，但不重复处理未读计数
    socket.on('group-message-received', (message) => {
        // 检查消息中是否包含新的会话令牌
        if (message.sessionToken) {
            // 更新会话令牌
            currentSessionToken = message.sessionToken;
            localStorage.setItem('currentSessionToken', currentSessionToken);
        }
        
        // 标记为实时消息
        message.isHistory = false;
        // 只显示消息，不重复更新未读计数（已在message-received事件中处理）
        displayGroupMessage(message);
    });
    
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
    
    // 好友删除事件
    socket.on('friend-removed', () => {
        // 刷新好友列表
        loadFriendsList();
    });
    
    // 头像更新事件
    socket.on('avatar-updated', (data) => {
        // 刷新所有相关的头像显示
        if (data.userId && data.avatarUrl) {
            // 刷新好友列表中的头像
            loadFriendsList();
            // 刷新群组列表中的头像
            loadGroupList();
            // 刷新当前聊天界面中的头像
            if (currentPrivateChatUserId) {
                // 如果当前在私信聊天，刷新私信界面的头像
                const privateUserAvatar = document.querySelector('#privateChatInterface .chat-avatar img');
                if (privateUserAvatar && currentPrivateChatUserId === data.userId) {
                    privateUserAvatar.src = `${SERVER_URL}${data.avatarUrl}`;
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
        
        // 处理未读消息信息
        let processedUnreadMessages = {
            global: 0,
            groups: {},
            private: {}
        };
        
        // 处理群组未读消息
        if (data.unreadMessages) {
            if (data.unreadMessages && typeof data.unreadMessages === 'object' && !data.unreadMessages.hasOwnProperty('global')) {
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
        unreadMessages = processedUnreadMessages;
        
        // 检查并处理免打扰群组的未读消息
        const mutedGroups = getMutedGroups();
        for (const groupId in unreadMessages.groups) {
            if (unreadMessages.groups.hasOwnProperty(groupId)) {
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
        // console.log(`📥 收到群组聊天历史响应 - 群组ID: ${data.groupId || currentGroupId}, 消息数量: ${data.messages ? data.messages.length : 0}, 是否加载更多: ${data.loadMore ? '是' : '否'}`);
        
        // 检查历史记录响应中是否包含新的会话令牌
        if (data.sessionToken) {
            // console.log(`🔄 更新会话令牌 - 来自群组聊天历史响应`);
            // 更新会话令牌
            currentSessionToken = data.sessionToken;
            localStorage.setItem('currentSessionToken', currentSessionToken);
        }
        
        // 处理未读消息信息
        if (data.unreadMessages) {
            // 检查数据格式：如果是直接的群组键值对，则转换为期望的格式
            let processedUnreadMessages = data.unreadMessages;
            if (processedUnreadMessages && typeof processedUnreadMessages === 'object' && !processedUnreadMessages.hasOwnProperty('global')) {
                // 格式转换：将直接的群组键值对转换为包含global和groups的对象
                processedUnreadMessages = {
                    global: 0,
                    groups: processedUnreadMessages
                };
            }
            // 更新未读消息计数，确保包含groups和private属性
            unreadMessages = {
                global: processedUnreadMessages.global || 0,
                groups: processedUnreadMessages.groups || {},
                private: processedUnreadMessages.private || {}
            };
            
            // 检查并处理免打扰群组的未读消息
            const mutedGroups = getMutedGroups();
            for (const groupId in unreadMessages.groups) {
                if (unreadMessages.groups.hasOwnProperty(groupId)) {
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
                // console.log(`📥 加载更多返回0条消息 - 已到达群组聊天历史尽头`);
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
                groupMessageContainer.scrollTop = heightDifference;
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
            if (processedUnreadMessages && typeof processedUnreadMessages === 'object' && !processedUnreadMessages.hasOwnProperty('global')) {
                // 格式转换：将直接的群组键值对转换为包含global和groups的对象
                processedUnreadMessages = {
                    global: 0,
                    groups: processedUnreadMessages
                };
            }
            // 更新未读消息计数，确保包含groups和private属性
            unreadMessages = {
                global: processedUnreadMessages.global || 0,
                groups: processedUnreadMessages.groups || {},
                private: processedUnreadMessages.private || {}
            };
            
            // 检查并处理免打扰群组的未读消息
            const mutedGroups = getMutedGroups();
            for (const groupId in unreadMessages.groups) {
                if (unreadMessages.groups.hasOwnProperty(groupId)) {
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
            alert('会话已过期或在其他设备登录，请重新登录');
            logout();
        }
    });
    
    // 会话过期事件
    socket.on('session-expired', () => {
        alert('会话已过期或在其他设备登录，请重新登录');
        logout();
    });
    
    // 账户被封禁事件
    socket.on('account-banned', (data) => {
        const message = `您的IP已被封禁，${data.message || '无法访问'}`;
        alert(message);
        logout();
    });
    
    // 消息被撤回事件 - 同时处理公共聊天和群组聊天
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
    
    // 私信消息接收事件
    socket.on('private-message-sent', (data) => {
        // 检查是否包含完整的消息数据
        if (data.message) {
            const message = data.message;
            // 标记为实时消息
            message.isHistory = false;
            // 显示私信消息
            renderPrivateMessage(message);
        }
    });
    
    // 私信消息接收事件
    socket.on('private-message-received', (message) => {
        // 检查消息中是否包含新的会话令牌
        if (message.sessionToken) {
            // 更新会话令牌
            currentSessionToken = message.sessionToken;
            localStorage.setItem('currentSessionToken', currentSessionToken);
        }
        
        // 检查消息发送者是否是自己，如果是则不添加未读计数
        if (message.senderId === currentUser.id || message.userId === currentUser.id) {
            return;
        }
        
        // 标记为实时消息
        message.isHistory = false;
        
        // 检查消息是否是当前聊天对象的消息，使用字符串比较确保类型一致
        const msgSenderId = String(message.senderId);
        const msgReceiverId = String(message.receiverId);
        
        // 显示私信消息
        renderPrivateMessage(message);
        
        // 更新未读计数
        // 如果页面不可见，或者用户不在当前私信聊天中，添加未读计数
        const isInCurrentPrivateChat = currentActiveChat === `private_${msgSenderId}`;
        if (!isPageVisible || !isInCurrentPrivateChat) {
            // 确定消息对应的用户ID（如果是收到的消息，显示发送者的未读计数）
            const targetUserId = String(currentUser.id) === msgReceiverId ? msgSenderId : msgReceiverId;
            
            // 更新未读消息计数
            unreadMessages.private[targetUserId] = (unreadMessages.private[targetUserId] || 0) + 1;
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
        
        // 移除被撤回的消息
        const messageElement = document.querySelector(`#privateMessageContainer [data-id="${data.messageId}"]`);
        if (messageElement) {
            messageElement.remove();
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
            .catch(error => {
                console.error('Error loading friends:', error);
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
        
        // 为离线用户列表项添加data-user-id属性
        li.setAttribute('data-user-id', user.id);
        
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
    
    // 为新渲染的离线用户头像添加点击事件
    addAvatarClickListeners();
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
        // 新格式：使用messageType字段，0=文字，1=图片，2=文件
        if (!message.messageType && !message.content && !message.imageUrl && !message.fileUrl && !message.text) {
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
        messageElement.style.minWidth = '70px'; // 确保能容纳时间显示
        messageElement.style.alignSelf = 'flex-end';
    } else {
        messageElement.style.marginLeft = '10px';
        messageElement.style.marginRight = '20%';
        messageElement.style.backgroundColor = '#FFFFFF';
        messageElement.style.borderRadius = '18px';
        messageElement.style.padding = '10px 15px';
        messageElement.style.maxWidth = '80%';
        messageElement.style.minWidth = '70px'; // 确保能容纳时间显示
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
            
            // 处理图片和文件链接，确保URL完整
            // 替换相对URL为完整URL
            if (SERVER_URL) {
                // 处理图片URL
                contentToParse = contentToParse.replace(/!\[([^\]]+)\]\(([^)]+)\)/g, (match, alt, url) => {
                    // 清除URL前后的空格
                    const trimmedUrl = url.trim();
                    // 如果URL是相对路径，添加服务器前缀
                    if (trimmedUrl && !trimmedUrl.startsWith('http') && !trimmedUrl.startsWith('//')) {
                        return `![${alt}](${SERVER_URL}${trimmedUrl})`;
                    }
                    return match;
                });
                
                // 处理普通链接，改进正则表达式以支持更复杂的URL
                contentToParse = contentToParse.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                    // 清除URL前后的空格
                    const trimmedUrl = url.trim();
                    // 如果URL是相对路径或缺少协议的绝对URL
                    if (trimmedUrl && !trimmedUrl.startsWith('http') && !trimmedUrl.startsWith('//')) {
                        // 检查是否是缺少协议的绝对URL（包含域名格式）
                        if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?(:\d+)?/.test(trimmedUrl)) {
                            // 缺少协议的绝对URL，添加https://前缀
                            return `[${text}](https://${trimmedUrl})`;
                        } else {
                            // 真正的相对路径，添加服务器前缀
                            return `[${text}](${SERVER_URL}${trimmedUrl})`;
                        }
                    }
                    return match;
                });
                
                // 处理直接的URL链接（没有Markdown格式），改进正则表达式以支持更复杂的URL
                // 支持包含括号、查询参数和特殊字符的复杂URL
                // 确保不会匹配到已经是Markdown格式的链接中的URL，也不会匹配URL参数中的URL
                const urlRegex = /(?<!\]\()(?<!\[)(?<!https?:\/\/[^?&"'<>\s]+\?.*)(?<!https?:\/\/[^?&"'<>\s]+&.*)(https?:\/\/(?:[^\s"'<>]+))/g;
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
                const isHttpLink = /^https?:\/\//i.test(href);
                const isImageLink = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(href);
                
                // 定义常见的文件扩展名
                const fileExtensions = /\.(pdf|doc|docx|txt|rtf|xls|xlsx|csv|zip|rar|7z|tar|gz|mp3|wav|ogg|flac|mp4|avi|mov|wmv|flv|exe|dll|bat|sh|ppt|pptx|js|ts|html|css|php|py|java|c|cpp|cs|go|rb|swift|kt|svg)$/i;
                const hasFileExtension = fileExtensions.test(href);
                
                // 如果是图片链接，不添加文件容器
                if (isImageLink) {
                    return match;
                }
                
                // 如果是文件链接，添加文件容器和图标
                if (hasDownloadAttr || (!isHttpLink && hasFileExtension)) {
                    // 提取文件扩展名
                    const fileExtension = href.split('.').pop().toLowerCase();
                    
                    // 根据文件类型选择图标
                    let fileIcon = '📄'; // 默认文件图标
                    if (/^(pdf|doc|docx|txt|rtf)$/i.test(fileExtension)) {
                        fileIcon = '📝';
                    } else if (/^(xls|xlsx|csv)$/i.test(fileExtension)) {
                        fileIcon = '📊';
                    } else if (/^(zip|rar|7z|tar|gz)$/i.test(fileExtension)) {
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
    
    // 为链接添加正确样式，区分文件链接和普通链接（优先处理）
    parsedContent = parsedContent.replace(/<a/g, '<a class="message-link" target="_blank" rel="noopener noreferrer" style="color: #3498db; text-decoration: none;"');
    
    // 为文件链接添加容器，确保文件卡片样式正确应用
    // 匹配所有带有下载属性或文件扩展名的链接
    parsedContent = parsedContent.replace(/<a([^>]*)(href="([^"]*)")([^>]*)>([^<]*)<\/a>/g, (match, attr1, hrefAttr, href, attr2, text) => {
        // 检查是否为文件链接（包含文件扩展名或下载属性）
        const hasDownloadAttr = match.includes('download');
        const isHttpLink = /^https?:\/\//i.test(href);
        const isImageLink = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(href);
        
        // 定义常见的文件扩展名
        const fileExtensions = /\.(pdf|doc|docx|txt|rtf|xls|xlsx|csv|zip|rar|7z|tar|gz|mp3|wav|ogg|flac|mp4|avi|mov|wmv|flv|exe|dll|bat|sh|ppt|pptx|js|ts|html|css|php|py|java|c|cpp|cs|go|rb|swift|kt|svg)$/i;
        const hasFileExtension = fileExtensions.test(href);
        
        // 如果是图片链接，保持图片链接样式
        if (isImageLink) {
            return match;
        }
        
        // 如果是文件链接，添加文件容器和图标
        if (hasDownloadAttr || (!isHttpLink && hasFileExtension)) {
            // 提取文件扩展名
            const fileExtension = href.split('.').pop().toLowerCase();
            
            // 根据文件类型选择图标
            let fileIcon = '📄'; // 默认文件图标
            if (/^(pdf|doc|docx|txt|rtf)$/i.test(fileExtension)) {
                fileIcon = '📝';
            } else if (/^(xls|xlsx|csv)$/i.test(fileExtension)) {
                fileIcon = '📊';
            } else if (/^(zip|rar|7z|tar|gz)$/i.test(fileExtension)) {
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
            return `<div class="file-link-container"><a${attr1} ${hrefAttr}${attr2} class="file-link" target="_blank"><span class="file-icon">${fileIcon}</span><span>${text}</span></a></div>`;
        }
        
        // 普通链接，保持原样式
        return match;
    });
    
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
    
    // 直接渲染图片和文件，不通过Markdown转换
    let messageContent = '';
    
    // 解析不同类型的消息内容
    let imageUrl = message.imageUrl;
    let fileUrl = message.fileUrl;
    let filename = message.filename;
    let textContent = message.content;
    let groupCardData = null;
    
    // 处理新的消息格式
    if (message.messageType !== undefined) {
        switch (message.messageType) {
            case 1: // 图片消息
                try {
                    const imageData = JSON.parse(message.content);
                    imageUrl = imageData.url;
                    filename = imageData.filename;
                } catch (error) {
                    console.error('解析图片消息JSON失败:', error);
                }
                break;
            case 2: // 文件消息
                try {
                    const fileData = JSON.parse(message.content);
                    fileUrl = fileData.url;
                    filename = fileData.filename;
                } catch (error) {
                    console.error('解析文件消息JSON失败:', error);
                }
                break;
            case 3: // 群名片消息
                try {
                    groupCardData = JSON.parse(message.content);
                    // 检查是否为有效的群名片数据
                    if (groupCardData.type === 'group_card' && groupCardData.group_id) {
                        // 群名片数据有效
                    } else {
                        groupCardData = null;
                    }
                } catch (error) {
                    console.error('解析群名片消息JSON失败:', error);
                    groupCardData = null;
                }
                break;
            default: // 文字消息
                textContent = message.content;
                break;
        }
    }
    
    // 渲染图片
    if (imageUrl && imageUrl !== null && imageUrl !== '') {
        const imgSrc = imageUrl.startsWith('http') ? imageUrl : `${SERVER_URL}${imageUrl}`;
        messageContent += `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(filename || '图片')}" class="message-image" style="max-width: 100%; height: auto; cursor: pointer;">`;
    }
    
    // 渲染文件
    if (fileUrl && fileUrl !== null && fileUrl !== '') {
        const fullFileUrl = fileUrl.startsWith('http') ? fileUrl : `${SERVER_URL}${fileUrl}`;
        const displayFilename = filename || '文件';
        const fileExtension = displayFilename.split('.').pop().toLowerCase();
        
        // 根据文件类型选择图标
        let fileIcon = '📄';
        if (/^(pdf|doc|docx|txt|rtf)$/i.test(fileExtension)) {
            fileIcon = '📝';
        } else if (/^(xls|xlsx|csv)$/i.test(fileExtension)) {
            fileIcon = '📊';
        } else if (/^(zip|rar|7z|tar|gz)$/i.test(fileExtension)) {
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
        
        messageContent += `<div class="file-link-container"><a href="${escapeHtml(fullFileUrl)}" class="file-link" target="_blank" style="color: #3498db; text-decoration: none;"><span class="file-icon">${fileIcon}</span><span>${escapeHtml(displayFilename)}</span></a></div>`;
    }
    
    // 渲染群名片
    if (groupCardData) {
        messageContent += `
            <div class="group-card-container" style="background-color: #f0f8ff; border: 1px solid #3498db; border-radius: 8px; padding: 10px; cursor: pointer; margin-top: 5px;">
                <div class="group-card-header" style="font-weight: bold; color: #3498db; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;">
                    ${groupCardData.avatar_url ? `<img src="${SERVER_URL}${groupCardData.avatar_url}" alt="${groupCardData.group_name}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; cursor: pointer;" onclick="openImagePreview('${SERVER_URL}${groupCardData.avatar_url}')">` : `<div style="width: 20px; height: 20px; border-radius: 50%; background-color: #3498db; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">${groupCardData.group_name.charAt(0).toUpperCase()}</div>`}
                    ${groupCardData.group_name}
                </div>
                <div class="group-card-description" style="color: #666; font-size: 14px; margin-bottom: 5px;">
                    ${groupCardData.group_description || '暂无描述'}
                </div>
                <div class="group-card-footer" style="font-size: 12px; color: #999;">
                    点击查看群组详情
                </div>
            </div>
        `;
    }
    
    // 渲染文本内容（如果有）
    if ((parsedContent && parsedContent.trim() !== '') && !(fileUrl || imageUrl || groupCardData)) {
        messageContent += parsedContent;
    }
    
    messageElement.innerHTML = `
        <div class="message-header" style="display: flex; align-items: center; margin-bottom: 5px;">
            ${avatarHtml}
            <div style="flex: 1;">
                <span class="message-sender" style="font-weight: bold;">${senderNickname}</span>
                <span class="message-time" style="float: right; color: #999; font-size: 12px;">${message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}</span>
            </div>
            ${isOwn ? `<button class="delete-button" data-id="${message.id}" title="撤回消息" style="background: none; border: none; color: #999; font-size: 16px; cursor: pointer; margin-left: 10px;">×</button>` : ''}
        </div>
        <div class="message-content">${messageContent}</div>
    `;
    
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
    
    // 添加群名片点击事件监听
    if (groupCardData) {
        const groupCardElement = messageElement.querySelector('.group-card-container');
        if (groupCardElement) {
            groupCardElement.addEventListener('click', function(e) {
                e.stopPropagation();
                showGroupCardPopup(e, groupCardData);
            });
        }
    }
    
    // 为用户头像添加点击事件
    const messageAvatar = messageElement.querySelector('.user-avatar');
    if (messageAvatar) {
        messageAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            showUserAvatarPopup(e, messageUser);
        });
    }
    
    if (returnElement) {
        // 只返回消息元素，不添加到容器
        return messageElement;
    }
    
    // 渲染数学公式
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(messageElement, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$" , right: "$" , display: false}
            ]
        });
    }
    
    // 检查并移除空状态
    const emptyState = messageContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.style.display = 'none';
    }
    
    messageContainer.appendChild(messageElement);
    
    // 改进滚动逻辑：只有当用户已经在聊天底部附近（距离底部不超过150px），或者是用户自己发送的消息时才滚动到底部
    const distanceToBottom = messageContainer.scrollHeight - messageContainer.scrollTop - messageContainer.clientHeight;
    const isAtBottom = distanceToBottom <= 150;
    if (isAtBottom || isOwn) {
        // 使用setTimeout确保DOM更新完成后再滚动
        setTimeout(() => {
            messageContainer.scrollTop = messageContainer.scrollHeight;
        }, 0);
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
    
    // 检查消息的群组ID是否与当前活跃群组ID匹配
    // 只有匹配时才显示消息，避免消息串群
    // 但如果是历史消息（没有message.id或通过历史消息加载调用），则允许显示
    const messageGroupId = message.groupId;
    // 检查是否是通过历史消息加载调用的（通过returnElement参数或调用上下文判断）
    const isHistoryMessage = returnElement || message.isHistory || false;
    // 类型转换：确保比较时类型一致
    const currentChatId = String(currentActiveChat);
    const msgGroupId = String(messageGroupId);
    
    // 如果消息的群组ID与当前活跃群组ID不匹配，且不是历史消息，则缓存消息
    if (messageGroupId && currentActiveChat && msgGroupId !== currentChatId && !isHistoryMessage) {
        // 缓存消息
        if (!groupMessageCache[msgGroupId]) {
            groupMessageCache[msgGroupId] = [];
        }
        // 检查消息是否已经在缓存中，避免重复
        const isDuplicate = groupMessageCache[msgGroupId].some(m => m.id === message.id);
        if (!isDuplicate) {
            groupMessageCache[msgGroupId].push(message);
        }
        return;
    }
    
    // 检查消息ID是否已经存在，避免重复渲染
    if (document.querySelector(`#groupMessageContainer [data-id="${message.id}"]`)) {
        return;
    }
    
    // 允许content为null或空字符串，支持纯图片或文件消息
    // 新格式：使用messageType字段，0=文字，1=图片，2=文件
    // 移除额外的检查，确保所有有效的历史消息都能显示
    if (!message.messageType && !message.content && !message.imageUrl && !message.fileUrl && !message.text) {
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
            
            // 处理图片和文件链接，确保URL完整
            // 替换相对URL为完整URL
            if (SERVER_URL) {
                // 处理图片URL
                contentToParse = contentToParse.replace(/!\[([^\]]+)\]\(([^)]+)\)/g, (match, alt, url) => {
                    // 清除URL前后的空格
                    const trimmedUrl = url.trim();
                    // 如果URL是相对路径，添加服务器前缀
                    if (trimmedUrl && !trimmedUrl.startsWith('http') && !trimmedUrl.startsWith('//')) {
                        return `![${alt}](${SERVER_URL}${trimmedUrl})`;
                    }
                    return match;
                });
                
                // 处理普通链接，改进正则表达式以支持更复杂的URL
                contentToParse = contentToParse.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                    // 清除URL前后的空格
                    const trimmedUrl = url.trim();
                    // 如果URL是相对路径或缺少协议的绝对URL
                    if (trimmedUrl && !trimmedUrl.startsWith('http') && !trimmedUrl.startsWith('//')) {
                        // 检查是否是缺少协议的绝对URL（包含域名格式）
                        if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?(:\d+)?/.test(trimmedUrl)) {
                            // 缺少协议的绝对URL，添加https://前缀
                            return `[${text}](https://${trimmedUrl})`;
                        } else {
                            // 真正的相对路径，添加服务器前缀
                            return `[${text}](${SERVER_URL}${trimmedUrl})`;
                        }
                    }
                    return match;
                });
                
                // 处理直接的URL链接（没有Markdown格式），改进正则表达式以支持更复杂的URL
                // 支持包含括号、查询参数和特殊字符的复杂URL
                // 确保不会匹配到已经是Markdown格式的链接中的URL，也不会匹配URL参数中的URL
                const urlRegex = /(?<!\]\()(?<!\[)(?<!https?:\/\/[^?&"'<>\s]+\?.*)(?<!https?:\/\/[^?&"'<>\s]+&.*)(https?:\/\/(?:[^\s"'<>]+))/g;
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
    
    // 为链接添加正确样式，区分文件链接和普通链接（优先处理）
    parsedContent = parsedContent.replace(/<a/g, '<a class="message-link" target="_blank" rel="noopener noreferrer" style="color: #3498db; text-decoration: none;"');
    
    // 为文件链接添加容器，确保文件卡片样式正确应用
    // 匹配所有带有下载属性或文件扩展名的链接
    parsedContent = parsedContent.replace(/<a([^>]*)(href="([^"]*)")([^>]*)>([^<]*)<\/a>/g, (match, attr1, hrefAttr, href, attr2, text) => {
        // 检查是否为文件链接（包含文件扩展名或下载属性）
        const hasDownloadAttr = match.includes('download');
        const isHttpLink = /^https?:\/\//i.test(href);
        const isImageLink = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(href);
        
        // 定义常见的文件扩展名
        const fileExtensions = /\.(pdf|doc|docx|txt|rtf|xls|xlsx|csv|zip|rar|7z|tar|gz|mp3|wav|ogg|flac|mp4|avi|mov|wmv|flv|exe|dll|bat|sh|ppt|pptx|js|ts|html|css|php|py|java|c|cpp|cs|go|rb|swift|kt|svg)$/i;
        const hasFileExtension = fileExtensions.test(href);
        
        // 如果是图片链接，保持图片链接样式
        if (isImageLink) {
            return match;
        }
        
        // 如果是文件链接，添加文件容器和图标
        if (hasDownloadAttr || (!isHttpLink && hasFileExtension)) {
            // 提取文件扩展名
            const fileExtension = href.split('.').pop().toLowerCase();
            
            // 根据文件类型选择图标
            let fileIcon = '📄'; // 默认文件图标
            if (/^(pdf|doc|docx|txt|rtf)$/i.test(fileExtension)) {
                fileIcon = '📝';
            } else if (/^(xls|xlsx|csv)$/i.test(fileExtension)) {
                fileIcon = '📊';
            } else if (/^(zip|rar|7z|tar|gz)$/i.test(fileExtension)) {
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
            return `<div class="file-link-container"><a${attr1} ${hrefAttr}${attr2} class="file-link" target="_blank"><span class="file-icon">${fileIcon}</span><span>${text}</span></a></div>`;
        }
        
        // 普通链接，保持原样式
        return match;
    });
    
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
    
    // 直接渲染图片和文件，不通过Markdown转换
    let messageContent = '';
    
    // 解析不同类型的消息内容
    let imageUrl = message.imageUrl;
    let fileUrl = message.fileUrl;
    let filename = message.filename;
    let textContent = message.content;
    let groupCardData = null;
    
    // 处理新的消息格式
    if (message.messageType !== undefined) {
        switch (message.messageType) {
            case 1: // 图片消息
                try {
                    const imageData = JSON.parse(message.content);
                    imageUrl = imageData.url;
                    filename = imageData.filename;
                } catch (error) {
                    console.error('解析图片消息JSON失败:', error);
                }
                break;
            case 2: // 文件消息
                try {
                    const fileData = JSON.parse(message.content);
                    fileUrl = fileData.url;
                    filename = fileData.filename;
                } catch (error) {
                    console.error('解析文件消息JSON失败:', error);
                }
                break;
            case 3: // 群名片消息
                try {
                    groupCardData = JSON.parse(message.content);
                    // 检查是否为有效的群名片数据
                    if (groupCardData.type === 'group_card' && groupCardData.group_id) {
                        // 群名片数据有效
                    } else {
                        groupCardData = null;
                    }
                } catch (error) {
                    console.error('解析群名片消息JSON失败:', error);
                    groupCardData = null;
                }
                break;
            default: // 文字消息
                textContent = message.content;
                break;
        }
    }
    
    // 渲染图片
    if (imageUrl && imageUrl !== null && imageUrl !== '') {
        const imgSrc = imageUrl.startsWith('http') ? imageUrl : `${SERVER_URL}${imageUrl}`;
        messageContent += `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(filename || '图片')}" class="message-image" style="max-width: 100%; height: auto; cursor: pointer;">`;
    }
    
    // 渲染文件
    if (fileUrl && fileUrl !== null && fileUrl !== '') {
        const fileFullUrl = fileUrl.startsWith('http') ? fileUrl : `${SERVER_URL}${fileUrl}`;
        const displayFilename = filename || '文件';
        const fileExtension = displayFilename.split('.').pop().toLowerCase();
        
        // 根据文件类型选择图标
        let fileIcon = '📄';
        if (/^(pdf|doc|docx|txt|rtf)$/i.test(fileExtension)) {
            fileIcon = '📝';
        } else if (/^(xls|xlsx|csv)$/i.test(fileExtension)) {
            fileIcon = '📊';
        } else if (/^(zip|rar|7z|tar|gz)$/i.test(fileExtension)) {
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
        
        messageContent += `<div class="file-link-container"><a href="${escapeHtml(fileFullUrl)}" class="file-link" target="_blank" style="color: #3498db; text-decoration: none;"><span class="file-icon">${fileIcon}</span><span>${escapeHtml(displayFilename)}</span></a></div>`;
    }
    
    // 渲染群名片
    if (groupCardData) {
        messageContent += `
            <div class="group-card-container" style="background-color: #f0f8ff; border: 1px solid #3498db; border-radius: 8px; padding: 10px; cursor: pointer; margin-top: 5px;">
                <div class="group-card-header" style="font-weight: bold; color: #3498db; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;">
                    ${groupCardData.avatar_url ? `<img src="${SERVER_URL}${groupCardData.avatar_url}" alt="${groupCardData.group_name}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; cursor: pointer;" onclick="openImagePreview('${SERVER_URL}${groupCardData.avatar_url}')">` : `<div style="width: 20px; height: 20px; border-radius: 50%; background-color: #3498db; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">${groupCardData.group_name.charAt(0).toUpperCase()}</div>`}
                    ${groupCardData.group_name}
                </div>
                <div class="group-card-description" style="color: #666; font-size: 14px; margin-bottom: 5px;">
                    ${groupCardData.group_description || '暂无描述'}
                </div>
                <div class="group-card-footer" style="font-size: 12px; color: #999;">
                    点击查看群组详情
                </div>
            </div>
        `;
    }
    
    // 渲染文本内容（如果有），但如果是纯文件、图片或群名片消息，则不渲染
    if ((parsedContent && parsedContent.trim() !== '') && !(fileUrl || imageUrl || groupCardData)) {
        messageContent += parsedContent;
    }
    
    messageElement.innerHTML = `
        <div class="message-header" style="display: flex; align-items: center; margin-bottom: 5px;">
            ${avatarHtml}
            <div style="flex: 1;">
                <span class="message-sender" style="font-weight: bold;">${senderNickname}</span>
                <span class="message-time" style="float: right; color: #999; font-size: 12px;">${message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}</span>
            </div>
            ${isOwn ? `<button class="delete-button" data-id="${message.id}" title="撤回消息" style="background: none; border: none; color: #999; font-size: 16px; cursor: pointer; margin-left: 10px;">×</button>` : ''}
        </div>
        <div class="message-content">${messageContent}</div>
    `;
    
    // 添加撤回按钮事件监听
    if (isOwn) {
        const deleteButton = messageElement.querySelector('.delete-button');
        if (deleteButton) {
            deleteButton.addEventListener('click', function(e) {
                e.stopPropagation();
                const messageId = this.getAttribute('data-id');
                
                // 确保消息ID有效，使用与原UI一致的事件名称和参数格式
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
    
    // 添加群名片点击事件监听
    if (groupCardData) {
        const groupCardElement = messageElement.querySelector('.group-card-container');
        if (groupCardElement) {
            groupCardElement.addEventListener('click', function(e) {
                e.stopPropagation();
                showGroupCardPopup(e, groupCardData);
            });
        }
    }
    
    // 为用户头像添加点击事件
    const groupMessageAvatar = messageElement.querySelector('.user-avatar');
    if (groupMessageAvatar) {
        groupMessageAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            showUserAvatarPopup(e, messageUser);
        });
    }
    
    if (returnElement) {
        // 只返回消息元素，不添加到容器
        return messageElement;
    }
    
    // 渲染数学公式
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(messageElement, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$" , right: "$" , display: false}
            ]
        });
    }
    
    // 检查并移除空状态
    const groupEmptyState = groupMessageContainer.querySelector('.empty-state');
    if (groupEmptyState) {
        groupEmptyState.style.display = 'none';
    }
    
    groupMessageContainer.appendChild(messageElement);
    
    // 改进滚动逻辑：只有当用户已经在聊天底部附近（距离底部不超过150px），或者是用户自己发送的消息时才滚动到底部
    const distanceToBottom = groupMessageContainer.scrollHeight - groupMessageContainer.scrollTop - groupMessageContainer.clientHeight;
    const isAtBottom = distanceToBottom <= 150;
    if (isAtBottom || isOwn) {
        // 使用setTimeout确保DOM更新完成后再滚动
        setTimeout(() => {
            groupMessageContainer.scrollTop = groupMessageContainer.scrollHeight;
        }, 0);
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

// 初始化更多按钮功能
function initializeMoreButtons() {
    // 主聊天室更多按钮
    const moreButton = document.getElementById('moreButton');
    const mainMoreFunctions = document.getElementById('mainMoreFunctions');
    const mainInputContainer = document.getElementById('mainInputContainer');
    
    if (moreButton && mainMoreFunctions && mainInputContainer) {
        moreButton.addEventListener('click', function() {
            mainMoreFunctions.classList.toggle('show');
            mainInputContainer.classList.toggle('lifted');
        });
    }
    
    // 群组聊天更多按钮
    const groupMoreButton = document.getElementById('groupMoreButton');
    const groupMoreFunctions = document.getElementById('groupMoreFunctions');
    const groupInputContainer = document.getElementById('groupInputContainer');
    
    if (groupMoreButton && groupMoreFunctions && groupInputContainer) {
        groupMoreButton.addEventListener('click', function() {
            groupMoreFunctions.classList.toggle('show');
            groupInputContainer.classList.toggle('lifted');
        });
    }
    
    // 发送群名片按钮事件
    const sendGroupCardButton = document.getElementById('sendGroupCardButton');
    const sendGroupCardButtonGroup = document.getElementById('sendGroupCardButtonGroup');
    const privateSendGroupCardButton = document.getElementById('privateSendGroupCardButton');
    
    // console.log('🔍 发送群名片按钮元素:', { sendGroupCardButton, sendGroupCardButtonGroup, privateSendGroupCardButton });
    
    if (sendGroupCardButton) {
        sendGroupCardButton.addEventListener('click', function() {
            // console.log('🖱️  发送群名片按钮被点击');
            showSendGroupCardModal('main');
        });
    }
    
    if (sendGroupCardButtonGroup) {
        sendGroupCardButtonGroup.addEventListener('click', function() {
            // console.log('🖱️  群组发送群名片按钮被点击');
            showSendGroupCardModal('group');
        });
    }
    
    if (privateSendGroupCardButton) {
        privateSendGroupCardButton.addEventListener('click', function() {
            // console.log('🖱️  私信发送群名片按钮被点击');
            showSendGroupCardModal('private');
        });
    }
    
    // 发送群名片模态框事件
    const closeSendGroupCardModal = document.getElementById('closeSendGroupCardModal');
    const cancelSendGroupCard = document.getElementById('cancelSendGroupCard');
    const confirmSendGroupCard = document.getElementById('confirmSendGroupCard');
    
    // console.log('🔍 发送群名片模态框元素:', { closeSendGroupCardModal, cancelSendGroupCard, confirmSendGroupCard });
    
    if (closeSendGroupCardModal) {
        closeSendGroupCardModal.addEventListener('click', function() {
            document.getElementById('sendGroupCardModal').style.display = 'none';
        });
    }
    
    if (cancelSendGroupCard) {
        cancelSendGroupCard.addEventListener('click', function() {
            document.getElementById('sendGroupCardModal').style.display = 'none';
        });
    }
    
    if (confirmSendGroupCard) {
        confirmSendGroupCard.addEventListener('click', function() {
            sendGroupCard();
        });
    }
    

}

// 当前要发送的聊天类型（main或group）
currentSendChatType = 'main';

// 当前选中的要发送的群组ID
selectedGroupIdForCard = null;

// 显示发送群名片模态框
function showSendGroupCardModal(chatType) {
    currentSendChatType = chatType;
    selectedGroupIdForCard = null;
    
    const modal = document.getElementById('sendGroupCardModal');
    const sendGroupCardList = document.getElementById('sendGroupCardList');
    
    if (!modal) {
        return;
    }
    
    // 显示模态框
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '1000';
    document.body.style.overflow = 'hidden';
    
    // 清空群组列表
    sendGroupCardList.innerHTML = '';
    
    // 加载用户加入的群组
    fetch(`${SERVER_URL}/user-groups/${currentUser.id}`, {
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            const groups = data.groups;
            
            if (groups.length === 0) {
                sendGroupCardList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">你还没有加入任何群组</div>';
            } else {
                groups.forEach(group => {
                    const groupItem = document.createElement('div');
                    groupItem.className = 'send-group-card-item';
                    groupItem.style.display = 'flex';
                    groupItem.style.alignItems = 'center';
                    groupItem.style.margin = '10px 0';
                    groupItem.style.padding = '10px';
                    groupItem.style.borderRadius = '5px';
                    groupItem.style.cursor = 'pointer';
                    groupItem.style.border = '1px solid #ddd';
                    groupItem.style.transition = 'background-color 0.3s';
                    
                    // 创建标签元素，使用textContent安全设置群组名称，避免XSS
                    const label = document.createElement('label');
                    label.setAttribute('for', `group-${group.id}`);
                    label.style.marginLeft = '10px';
                    label.style.cursor = 'pointer';
                    label.style.flex = '1';
                    // 服务器返回的名称已经被转义，需要反转义
                    const originalGroupName = unescapeHtml(group.group_name || group.name || '未命名群组');
                    label.textContent = originalGroupName;
                    
                    // 创建单选按钮元素
                    const radio = document.createElement('input');
                    radio.setAttribute('type', 'radio');
                    radio.setAttribute('name', 'selectedGroup');
                    radio.setAttribute('value', group.id);
                    radio.setAttribute('id', `group-${group.id}`);
                    radio.className = 'send-group-card-radio';
                    
                    // 清空并添加元素
                    groupItem.innerHTML = '';
                    groupItem.appendChild(radio);
                    groupItem.appendChild(label);
                    
                    // 点击事件
                    groupItem.addEventListener('click', function() {
                        // 移除其他选中状态
                        document.querySelectorAll('.send-group-card-item').forEach(item => {
                            item.style.backgroundColor = '';
                            item.style.borderColor = '#ddd';
                        });
                        // 添加当前选中状态
                        this.style.backgroundColor = '#e8f5e8';
                        this.style.borderColor = '#3498db';
                        // 更新选中的群组ID
                        selectedGroupIdForCard = group.id;
                        // 启用发送按钮
                        document.getElementById('confirmSendGroupCard').disabled = false;
                    });
                    
                    sendGroupCardList.appendChild(groupItem);
                });
            }
        }
    })
    .catch(error => {
        sendGroupCardList.innerHTML = '<div style="text-align: center; color: #e74c3c; padding: 20px;">加载群组列表失败</div>';
    });
    
    // 显示模态框
    modal.style.display = 'flex';
}

// 发送群名片
function sendGroupCard() {
    if (!selectedGroupIdForCard) {
        return;
    }
    
    // 生成群组邀请Token
    fetch(`${SERVER_URL}/generate-group-token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: JSON.stringify({ groupId: selectedGroupIdForCard })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            const token = data.token;
            
            // 获取群组信息
            fetch(`${SERVER_URL}/group-info/${selectedGroupIdForCard}`, {
                headers: {
                    'user-id': currentUser.id,
                    'session-token': currentSessionToken
                }
            })
            .then(response => response.json())
            .then(groupData => {
                if (groupData.status === 'success') {
                    const group = groupData.group;
                    
                    // 构建群名片消息内容
                    const groupCardContent = JSON.stringify({
                        type: 'group_card',
                        group_id: group.id,
                        group_name: group.name,
                        group_description: group.description || '',
                        invite_token: token,
                        avatar_url: group.avatar_url || group.avatarUrl || ''
                    });
                    
                    // 发送群名片消息
            if (currentSendChatType === 'main') {
                // 发送到主聊天室
                window.chatSocket.emit('send-message', {
                    content: groupCardContent,
                    messageType: 3, // 群名片消息类型
                    sessionToken: currentSessionToken,
                    userId: currentUser.id
                });
            } else if (currentSendChatType === 'group') {
                // 发送到当前群组
                window.chatSocket.emit('send-message', {
                    content: groupCardContent,
                    messageType: 3, // 群名片消息类型
                    groupId: currentGroupId,
                    sessionToken: currentSessionToken,
                    userId: currentUser.id
                });
            } else if (currentSendChatType === 'private') {
                // 发送到当前私信聊天
                window.chatSocket.emit('private-message', {
                    content: groupCardContent,
                    messageType: 3, // 群名片消息类型
                    receiverId: currentPrivateChatUserId,
                    sessionToken: currentSessionToken,
                    userId: currentUser.id
                });
            }
                    
                    // 关闭模态框
                    const modal = document.getElementById('sendGroupCardModal');
                    if (modal) {
                        modal.style.display = 'none';
                        document.body.style.overflow = '';
                    }
                }
            });
        } else {
            alert('生成邀请Token失败: ' + (data.message || '未知错误'));
        }
    })
    .catch(error => {
        console.error('发送群名片失败:', error);
        alert('发送群名片失败，网络错误');
    });
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
        
        // 添加黏贴事件处理，支持黏贴图片和文件
        messageInput.addEventListener('paste', function(e) {
            const items = e.clipboardData.items;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        uploadImage(file);
                    }
                    break;
                } else if (item.type === 'application/octet-stream') {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        uploadFile(file);
                    }
                    break;
                }
            }
        });
        
        messageInput.addEventListener('keydown', function(e) {
            // 按Enter发送消息
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                // 确保输入框已启用
                if (messageInput.contentEditable === 'true') {
                    e.preventDefault(); // 阻止默认换行
                    sendMessage();
                }
            } 
            // Ctrl+Enter插入换行（原UI逻辑）
            else if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                // 使用Selection API处理div输入框的文本插入和光标定位
                const selection = window.getSelection();
                const range = selection.getRangeAt(0);
                
                // 创建包含换行符的文档片段
                const br = document.createElement('br');
                
                // 删除当前选区
                range.deleteContents();
                
                // 插入换行符
                range.insertNode(br);
                
                // 将光标移动到换行符后面
                range.setStartAfter(br);
                range.setEndAfter(br);
                
                // 更新选区
                selection.removeAllRanges();
                selection.addRange(range);
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
        
        // 初始化时调整布局
        adjustChatLayout();
        
        toggleMarkdownToolbarBtn.addEventListener('click', function() {
            if (markdownToolbar.style.display === 'none') {
                // 显示工具栏
                markdownToolbar.style.display = 'flex';
                this.innerHTML = '<i class="fas fa-chevron-up"></i> 隐藏Markdown工具栏';
            } else {
                // 隐藏工具栏
                markdownToolbar.style.display = 'none';
                this.innerHTML = '<i class="fas fa-chevron-down"></i> MD';
            }
            
            // 切换后调整布局
            adjustChatLayout();
        });
    }
    
    // 页面加载时调整一次布局
    adjustChatLayout();
    
    // 初始化Markdown工具栏功能
    if (markdownToolbar) {
        const markdownButtons = markdownToolbar.querySelectorAll('.markdown-btn');
        markdownButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                // 阻止事件冒泡，避免触发其他点击事件
                e.stopPropagation();
                
                const prefix = this.getAttribute('data-prefix') || '';
                const suffix = this.getAttribute('data-suffix') || '';
                const sample = this.getAttribute('data-sample') || '示例文本';
                
                try {
                    // 确保输入框获得焦点
                    messageInput.focus();
                    
                    // 使用Selection API处理div输入框的文本插入和光标定位
                    const selection = window.getSelection();
                    const range = selection.getRangeAt(0);
                    
                    // 检查选区是否在输入框内
                    if (messageInput.contains(range.commonAncestorContainer)) {
                        // 获取当前选中文本
                        const selectedText = range.toString();
                        
                        // 创建包含新文本的文档片段
                        const newText = prefix + (selectedText || sample) + suffix;
                        const textNode = document.createTextNode(newText);
                        
                        // 删除当前选区并插入新文本
                        range.deleteContents();
                        range.insertNode(textNode);
                        
                        // 设置新的光标位置
                        const newCursorStart = prefix.length;
                        const newCursorEnd = (selectedText ? prefix.length + selectedText.length : prefix.length + sample.length);
                        
                        range.setStart(textNode, newCursorStart);
                        range.setEnd(textNode, newCursorEnd);
                        
                        // 更新选区
                        selection.removeAllRanges();
                        selection.addRange(range);
                    } else {
                        // 如果选区不在输入框内，直接在输入框末尾插入文本
                        messageInput.innerHTML += prefix + sample + suffix;
                        // 设置光标位置到文本末尾
                        messageInput.focus();
                        const selection = window.getSelection();
                        const range = document.createRange();
                        range.selectNodeContents(messageInput);
                        range.collapse(false);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                } catch (error) {
                    // 如果没有选区，直接在输入框末尾插入文本
                    messageInput.innerHTML += prefix + sample + suffix;
                    // 设置光标位置到文本末尾
                    messageInput.focus();
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(messageInput);
                    range.collapse(false);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            });
        });
    }
    
    // 初始化群组Markdown工具栏
    const toggleGroupMarkdownToolbarBtn = document.getElementById('toggleGroupMarkdownToolbar');
    const groupMarkdownToolbar = document.getElementById('groupMarkdownToolbar');
    const groupMessageInput = document.getElementById('groupMessageInput');
    
    if (toggleGroupMarkdownToolbarBtn && groupMarkdownToolbar) {
        // 默认隐藏工具栏
        groupMarkdownToolbar.style.display = 'none';
        
        // 初始化时调整布局
        adjustChatLayout();
        
        toggleGroupMarkdownToolbarBtn.addEventListener('click', function() {
            if (groupMarkdownToolbar.style.display === 'none') {
                // 显示工具栏
                groupMarkdownToolbar.style.display = 'flex';
                this.innerHTML = '<i class="fas fa-chevron-up"></i> 隐藏Markdown工具栏';
            } else {
                // 隐藏工具栏
                groupMarkdownToolbar.style.display = 'none';
                this.innerHTML = '<i class="fas fa-chevron-down"></i> MD';
            }
            
            // 切换后不需要调整全局布局，因为群组工具栏在群组界面内部
        });
        
        // 初始化群组Markdown工具栏功能
        const groupMarkdownButtons = groupMarkdownToolbar.querySelectorAll('.markdown-btn');
        groupMarkdownButtons.forEach(button => {
            button.addEventListener('click', function() {
                const prefix = this.getAttribute('data-prefix') || '';
                const suffix = this.getAttribute('data-suffix') || '';
                const sample = this.getAttribute('data-sample') || '示例文本';
                
                // 处理textarea输入框的文本插入
                const groupMessageInput = document.getElementById('groupMessageInput');
                if (groupMessageInput) {
                    // 获取当前光标位置
                    const startPos = groupMessageInput.selectionStart;
                    const endPos = groupMessageInput.selectionEnd;
                    const selectedText = groupMessageInput.value.substring(startPos, endPos);
                    
                    // 创建包含新文本的字符串
                    const newText = prefix + (selectedText || sample) + suffix;
                    
                    // 插入新文本
                    groupMessageInput.value = groupMessageInput.value.substring(0, startPos) + newText + groupMessageInput.value.substring(endPos);
                    
                    // 设置新的光标位置
                    const newCursorStart = startPos + prefix.length;
                    const newCursorEnd = (selectedText ? startPos + prefix.length + selectedText.length : startPos + prefix.length + sample.length);
                    groupMessageInput.setSelectionRange(newCursorStart, newCursorEnd);
                    
                    // 确保输入框获得焦点
                    groupMessageInput.focus();
                }
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
        // 移除可能的空标签，获取纯文本内容
        const content = messageInput.textContent.trim() || messageInput.innerHTML.trim();
        
        if (content && isConnected && window.chatSocket) {
            // 使用Socket.io发送消息，确保格式正确
            const messageData = {
                content: content,
                groupId: currentActiveChat === 'main' ? null : currentActiveChat, // 根据当前活动聊天室设置groupId
                sessionToken: currentSessionToken,
                userId: currentUser.id
            };
            window.chatSocket.emit('send-message', messageData);
            
            // 清空输入框
            messageInput.innerHTML = '';
        }
    }
    
}

// 动态调整布局函数 - 全局函数，供所有聊天模式使用
function adjustChatLayout() {
const chatContent = document.querySelector('.chat-content.active');
if (chatContent) {
    // 移除可能导致空白的样式
    chatContent.style.marginBottom = '0';
    chatContent.style.paddingBottom = '0';
    chatContent.style.height = '100%';
    chatContent.style.overflow = 'hidden';
    
    // 根据聊天类型调整padding-top
    if (chatContent.dataset.content === 'public-chat') {
        // 公共聊天界面：根据Markdown工具栏的显示状态动态调整padding-top
        const markdownToolbar = document.getElementById('markdownToolbar');
        if (markdownToolbar && markdownToolbar.style.display !== 'none') {
            // 工具栏显示时，增加padding-top
            chatContent.style.paddingTop = '60px';
        } else {
            // 工具栏隐藏时，减少padding-top
            chatContent.style.paddingTop = '0';
        }
    } else if (chatContent.dataset.content === 'group-chat') {
        // 群组聊天界面：移除padding-top，因为工具栏在group-header下方
        chatContent.style.paddingTop = '0';
    } else {
        // 其他界面：移除padding-top
        chatContent.style.paddingTop = '0';
    }
    
    // 强制重新计算布局
    chatContent.style.display = 'none';
    requestAnimationFrame(() => {
        chatContent.style.display = 'flex';
    });
}
}

// 上传图片 - 全局函数，供所有聊天模式使用
function uploadImage(file) {
const formData = new FormData();
formData.append('image', file); // 保持与原UI一致，使用'image'字段名
formData.append('userId', currentUser.id);

// 只有在群组聊天时才添加groupId字段
const isGroupChat = currentActiveChat !== 'main' && !currentActiveChat.startsWith('private_');
if (isGroupChat || currentGroupId) {
    const groupId = isGroupChat ? currentActiveChat : currentGroupId;
    formData.append('groupId', groupId);
}

// 根据当前是否在群组聊天中使用正确的上传进度条
const uploadProgress = (isGroupChat || currentGroupId) ? document.getElementById('groupUploadProgress') : document.getElementById('uploadProgress');
const uploadProgressBar = (isGroupChat || currentGroupId) ? document.getElementById('groupUploadProgressBar') : document.getElementById('uploadProgressBar');
if (uploadProgress && uploadProgressBar) {
    uploadProgress.style.display = 'block';
    uploadProgressBar.style.width = '0%';
}
    
    // 发送图片上传请求
    fetch(`${SERVER_URL}/upload`, {
        method: 'POST',
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // 上传成功，只依赖服务器的Socket.IO广播，避免显示重复消息

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
        // 根据当前是否在群组聊天中使用正确的文件输入元素
        if (isGroupChat || currentGroupId) {
            const groupImageInput = document.getElementById('groupImageInput');
            if (groupImageInput) {
                groupImageInput.value = '';
            }
        } else {
            const imageInput = document.getElementById('imageInput');
            if (imageInput) {
                imageInput.value = '';
            }
        }
    });
}

// 上传文件 - 全局函数，供所有聊天模式使用
function uploadFile(file) {
const formData = new FormData();
formData.append('image', file); // 保持与原UI一致，使用'image'字段名
formData.append('userId', currentUser.id);

// 只有在群组聊天时才添加groupId字段
const isGroupChat = currentActiveChat !== 'main' && !currentActiveChat.startsWith('private_');
if (isGroupChat || currentGroupId) {
    const groupId = isGroupChat ? currentActiveChat : currentGroupId;
    formData.append('groupId', groupId);
}

// 根据当前是否在群组聊天中使用正确的上传进度条
const uploadProgress = (isGroupChat || currentGroupId) ? document.getElementById('groupUploadProgress') : document.getElementById('uploadProgress');
const uploadProgressBar = (isGroupChat || currentGroupId) ? document.getElementById('groupUploadProgressBar') : document.getElementById('uploadProgressBar');
if (uploadProgress && uploadProgressBar) {
    uploadProgress.style.display = 'block';
    uploadProgressBar.style.width = '0%';
}
    
    // 发送文件上传请求
    fetch(`${SERVER_URL}/upload`, {
        method: 'POST',
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // 上传成功，只依赖服务器的Socket.IO广播，避免显示重复消息

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
        // 根据当前是否在群组聊天中使用正确的文件输入元素
        if (isGroupChat || currentGroupId) {
            const groupFileInput = document.getElementById('groupFileInput');
            if (groupFileInput) {
                groupFileInput.value = '';
            }
        } else {
            const fileInput = document.getElementById('fileInput');
            if (fileInput) {
                fileInput.value = '';
            }
        }
    });
}

// 初始化群组功能
function initializeGroupFunctions() {
    // 群组点击事件已经在之前的代码中实现
    
    // 初始化群组消息发送
    const groupMessageInput = document.getElementById('groupMessageInput');
    const sendGroupMessageBtn = document.getElementById('sendGroupMessage');
    
    // 初始化群组图片和文件上传
    const groupImageUploadButton = document.getElementById('groupImageUploadButton');
    const groupFileUploadButton = document.getElementById('groupFileUploadButton');
    const groupImageInput = document.getElementById('groupImageInput');
    const groupFileInput = document.getElementById('groupFileInput');
    
    // 为群组聊天界面添加点击事件监听器，清除未读计数并发送加入事件
    const groupChatInterface = document.getElementById('groupChatInterface');
    if (groupChatInterface) {
        groupChatInterface.addEventListener('click', function() {
            if (currentGroupId) {
                // 清除群组未读计数
                delete unreadMessages.groups[currentGroupId];
                updateUnreadCountsDisplay();
                updateTitleWithUnreadCount();
                
                // 发送加入群组事件，只清除未读计数，不返回消息历史
                if (window.chatSocket) {
                    window.chatSocket.emit('join-group', {
                        groupId: parseInt(currentGroupId),
                        sessionToken: currentSessionToken,
                        userId: currentUser.id,
                        onlyClearUnread: true
                    });
                }
            }
        });
    }
    
    if (groupMessageInput && sendGroupMessageBtn) {
        sendGroupMessageBtn.addEventListener('click', function() {
            // console.log(`📤 群组消息发送按钮点击 - 群组ID: ${currentGroupId}, 群组名称: ${currentGroupName}`);
            sendGroupMessage();
        });
        
        // 添加黏贴事件处理，支持黏贴图片和文件
        groupMessageInput.addEventListener('paste', function(e) {
            const items = e.clipboardData.items;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        uploadImage(file);
                    }
                    break;
                } else if (item.type === 'application/octet-stream') {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                        uploadFile(file);
                    }
                    break;
                }
            }
        });
        
        groupMessageInput.addEventListener('keydown', function(e) {
            // 按Enter发送消息
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                e.preventDefault(); // 阻止默认换行
                sendGroupMessage();
            } 
            // Ctrl+Enter插入换行（textarea版本）
            else if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                
                // 对于textarea元素，使用更简单的方式处理换行
                const textarea = groupMessageInput;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                
                // 在当前光标位置插入换行符
                const value = textarea.value;
                textarea.value = value.substring(0, start) + '\n' + value.substring(end);
                
                // 将光标移动到换行符后面
                const newPosition = start + 1;
                textarea.setSelectionRange(newPosition, newPosition);
                
                // 确保输入框保持焦点
                textarea.focus();
            }
            // Shift+Enter也允许换行
            else if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey) {
                // 允许默认换行行为
            }
        });
    }
    
    // 初始化群组图片上传功能
    if (groupImageUploadButton && groupImageInput) {
        groupImageUploadButton.addEventListener('click', function() {
            // console.log(`🖼️  群组图片上传按钮点击 - 群组ID: ${currentGroupId}, 群组名称: ${currentGroupName}`);
            groupImageInput.click();
        });
        
        groupImageInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                // console.log(`📤 群组图片选择完成 - 文件名: ${this.files[0].name}, 大小: ${this.files[0].size} bytes, 群组ID: ${currentGroupId}`);
                uploadImage(this.files[0]);
            }
        });
    }
    
    // 初始化群组文件上传功能
    if (groupFileUploadButton && groupFileInput) {
        groupFileUploadButton.addEventListener('click', function() {
            // console.log(`📁 群组文件上传按钮点击 - 群组ID: ${currentGroupId}, 群组名称: ${currentGroupName}`);
            groupFileInput.click();
        });
        
        groupFileInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                // console.log(`📤 群组文件选择完成 - 文件名: ${this.files[0].name}, 大小: ${this.files[0].size} bytes, 群组ID: ${currentGroupId}`);
                uploadFile(this.files[0]);
            }
        });
    }
    
    function sendGroupMessage() {
        if (!currentGroupId) {
            console.warn('⚠️  无法发送群组消息 - 未选择群组');
            return;
        }
        
        const groupMessageInput = document.getElementById('groupMessageInput');
        if (!groupMessageInput) {
            console.error('❌ 无法获取群组消息输入框 - 元素不存在');
            return;
        }
        
        // 修复：正确获取输入框内容，处理可编辑div的内容获取
        let content = '';
        if (groupMessageInput.tagName === 'DIV' && groupMessageInput.isContentEditable) {
            // 对于可编辑div，获取文本内容并处理空标签
            content = groupMessageInput.textContent.trim();
            // 如果文本内容为空，尝试获取innerHTML并清理空标签
            if (!content) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = groupMessageInput.innerHTML;
                content = tempDiv.textContent.trim();
            }
        } else {
            // 对于普通input或textarea
            content = groupMessageInput.value || groupMessageInput.innerHTML || '';
            content = content.trim();
        }
        

        
        if (content && isConnected && window.chatSocket) {
            // console.log(`📤 准备发送群组消息 - 内容长度: ${content.length} 字符, 群组ID: ${currentGroupId}, 发送者ID: ${currentUser.id}`);
            
            // 使用Socket.io发送群组消息，与原UI保持一致，使用send-message事件并包含groupId参数
            const messageData = {
                groupId: currentGroupId,
                content: content,
                sessionToken: currentSessionToken,
                userId: currentUser.id
            };
            
            // console.log(`📡 发送群组消息到服务器 - 事件: send-message, 消息数据:`, messageData);
            window.chatSocket.emit('send-message', messageData);
            
            // 清空输入框
            groupMessageInput.value = '';
            // console.log(`✅ 群组消息发送完成 - 输入框已清空`);
        } else {
            if (!content) {
                console.warn('⚠️  无法发送群组消息 - 消息内容为空');
            } else if (!isConnected) {
                console.warn('⚠️  无法发送群组消息 - 未连接到服务器');
            } else if (!window.chatSocket) {
                console.warn('⚠️  无法发送群组消息 - WebSocket实例不存在');
            }
        }
    }
}

// 当前要分享的群组信息
currentSharedGroup = null;

// 显示分享群名片模态框
function displayShareGroupCardModal() {
    const modal = document.getElementById('shareGroupCardModal');
    const shareGroupList = document.getElementById('shareGroupList');
    
    // 清空群组列表
    shareGroupList.innerHTML = '';
    
    // 加载用户加入的群组，排除当前要分享的群组
    fetch(`${SERVER_URL}/groups`, {
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            const groups = data.groups;
            groups.forEach(group => {
                // 排除当前要分享的群组
                if (group.id !== currentSharedGroup.id) {
                    const groupItem = document.createElement('div');
                    groupItem.className = 'share-target-item';
                    groupItem.style.display = 'flex';
                    groupItem.style.alignItems = 'center';
                    groupItem.style.margin = '10px 0';
                    
                    groupItem.innerHTML = `
                        <input type="checkbox" id="target-group-${group.id}" value="group-${group.id}" class="share-target-checkbox">
                        <label for="target-group-${group.id}" style="margin-left: 10px; cursor: pointer;">${unescapeHtml(group.name)}</label>
                    `;
                    
                    shareGroupList.appendChild(groupItem);
                }
            });
        }
    })
    .catch(error => {
        console.error('加载群组列表失败:', error);
    });
    
    // 显示模态框
    modal.style.display = 'flex';
    
    // 绑定关闭按钮事件
    const closeBtn = document.getElementById('closeShareGroupCardModal');
    closeBtn.onclick = function() {
        modal.style.display = 'none';
    };
    
    // 绑定取消按钮事件
    const cancelBtn = document.getElementById('cancelShareGroupCard');
    cancelBtn.onclick = function() {
        modal.style.display = 'none';
    };
    
    // 绑定确认分享按钮事件
    const confirmBtn = document.getElementById('confirmShareGroupCard');
    confirmBtn.onclick = function() {
        shareGroupCard();
    };
    
    // 点击模态框外部关闭
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };
}

// 分享群名片
function shareGroupCard() {
    if (!currentSharedGroup) return;
    
    // 获取选中的目标
    const selectedCheckboxes = document.querySelectorAll('.share-target-checkbox:checked');
    const selectedTargets = Array.from(selectedCheckboxes).map(checkbox => checkbox.value);
    
    if (selectedTargets.length === 0) {
        alert('请选择至少一个分享目标');
        return;
    }
    
    // 生成群组邀请Token
    fetch(`${SERVER_URL}/generate-group-token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: JSON.stringify({ groupId: currentSharedGroup.id })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            const token = data.token;
            
            // 构建群名片消息内容
            const groupCardContent = JSON.stringify({
                type: 'group_card',
                group_id: currentSharedGroup.id,
                group_name: currentSharedGroup.name,
                group_description: currentSharedGroup.description || '',
                invite_token: token,
                avatar_url: currentSharedGroup.avatar_url || currentSharedGroup.avatarUrl || ''
            });
            
            // 发送群名片消息到选中的目标
            selectedTargets.forEach(target => {
                if (target === 'main') {
                    // 发送到主聊天室
                    window.chatSocket.emit('send-message', {
                        content: groupCardContent,
                        messageType: 3, // 群名片消息类型
                        sessionToken: currentSessionToken,
                        userId: currentUser.id
                    });
                } else {
                    // 发送到群组
                    const groupId = target.replace('group-', '');
                    window.chatSocket.emit('send-message', {
                        content: groupCardContent,
                        messageType: 3, // 群名片消息类型
                        groupId: groupId,
                        sessionToken: currentSessionToken,
                        userId: currentUser.id
                    });
                }
            });
            
            // 关闭模态框
            const modal = document.getElementById('shareGroupCardModal');
            modal.style.display = 'none';
            
            alert('群名片分享成功');
        } else {
            alert('生成邀请Token失败: ' + (data.message || '未知错误'));
        }
    })
    .catch(error => {
        console.error('分享群名片失败:', error);
        alert('分享群名片失败，网络错误');
    });
}

// 显示群名片弹出窗口
function showGroupCardPopup(event, groupCardData) {
    // 移除已存在的弹出窗口
    const existingPopup = document.getElementById('groupCardPopup');
    if (existingPopup) {
        existingPopup.remove();
    }
    
    // 创建弹出窗口
    const popup = document.createElement('div');
    popup.id = 'groupCardPopup';
    popup.style.position = 'fixed';
    popup.style.width = '300px';
    popup.style.backgroundColor = 'white';
    popup.style.border = '1px solid #3498db';
    popup.style.borderRadius = '8px';
    popup.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    popup.style.zIndex = '10000';
    popup.style.padding = '15px';
    
    // 填充弹出窗口内容
    // 使用DOM操作代替innerHTML，避免XSS和转义问题
    popup.innerHTML = '';
    
    // 创建头部
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '10px';
    
    // 创建标题和头像容器
    const titleContainer = document.createElement('div');
    titleContainer.style.display = 'flex';
    titleContainer.style.alignItems = 'center';
    titleContainer.style.gap = '10px';
    
    // 添加群头像
    if (groupCardData.avatar_url) {
        const avatarImg = document.createElement('img');
        avatarImg.src = `${SERVER_URL}${groupCardData.avatar_url}`;
        avatarImg.alt = groupCardData.group_name;
        avatarImg.style.width = '40px';
        avatarImg.style.height = '40px';
        avatarImg.style.borderRadius = '50%';
        avatarImg.style.objectFit = 'cover';
        avatarImg.style.cursor = 'pointer';
        avatarImg.addEventListener('click', function() {
            openImagePreview(avatarImg.src);
        });
        titleContainer.appendChild(avatarImg);
    } else if (groupCardData.avatarUrl) {
        // 尝试使用avatarUrl字段
        const avatarImg = document.createElement('img');
        avatarImg.src = `${SERVER_URL}${groupCardData.avatarUrl}`;
        avatarImg.alt = groupCardData.group_name;
        avatarImg.style.width = '40px';
        avatarImg.style.height = '40px';
        avatarImg.style.borderRadius = '50%';
        avatarImg.style.objectFit = 'cover';
        avatarImg.style.cursor = 'pointer';
        avatarImg.addEventListener('click', function() {
            openImagePreview(avatarImg.src);
        });
        titleContainer.appendChild(avatarImg);
    } else {
        // 显示默认头像
        const initials = groupCardData.group_name.charAt(0).toUpperCase();
        const defaultAvatar = document.createElement('div');
        defaultAvatar.style.width = '40px';
        defaultAvatar.style.height = '40px';
        defaultAvatar.style.borderRadius = '50%';
        defaultAvatar.style.backgroundColor = '#3498db';
        defaultAvatar.style.color = 'white';
        defaultAvatar.style.display = 'flex';
        defaultAvatar.style.alignItems = 'center';
        defaultAvatar.style.justifyContent = 'center';
        defaultAvatar.style.fontSize = '18px';
        defaultAvatar.style.fontWeight = 'bold';
        defaultAvatar.textContent = initials;
        titleContainer.appendChild(defaultAvatar);
    }
    
    const title = document.createElement('h3');
    title.style.margin = '0';
    title.style.color = '#3498db';
    title.textContent = unescapeHtml(groupCardData.group_name);
    titleContainer.appendChild(title);
    
    const closeBtn = document.createElement('button');
    closeBtn.id = 'closeGroupCardPopup';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '18px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.color = '#999';
    closeBtn.textContent = '×';
    
    header.appendChild(titleContainer);
    header.appendChild(closeBtn);
    
    // 创建内容区
    const content = document.createElement('div');
    content.style.marginBottom = '15px';
    
    const groupIdP = document.createElement('p');
    groupIdP.style.margin = '8px 0';
    groupIdP.style.color = '#666';
    groupIdP.innerHTML = `<strong>群组ID:</strong> ${groupCardData.group_id}`;
    
    const descP = document.createElement('p');
    descP.style.margin = '8px 0';
    descP.style.color = '#666';
    
    const descStrong = document.createElement('strong');
    descStrong.textContent = '公告:';
    descP.appendChild(descStrong);
    descP.appendChild(document.createTextNode(` ${unescapeHtml(groupCardData.group_description) || '暂无描述'}`));
    
    content.appendChild(groupIdP);
    content.appendChild(descP);
    
    // 创建按钮区
    const buttonArea = document.createElement('div');
    buttonArea.style.display = 'flex';
    buttonArea.style.gap = '10px';
    
    const joinBtn = document.createElement('button');
    joinBtn.id = 'joinGroupButton';
    joinBtn.className = 'save-btn';
    joinBtn.style.flex = '1';
    joinBtn.textContent = '加入群组';
    
    buttonArea.appendChild(joinBtn);
    
    // 组装弹出窗口
    popup.appendChild(header);
    popup.appendChild(content);
    popup.appendChild(buttonArea);
    
    // 添加到文档
    document.body.appendChild(popup);
    
    // 绑定关闭按钮事件
    closeBtn.addEventListener('click', function() {
        popup.remove();
    });
    
    // 绑定加入群组按钮事件
    joinBtn.addEventListener('click', function() {
        joinGroupWithToken(groupCardData.invite_token, groupCardData.group_id, groupCardData.group_name, popup);
    });
    
    // 点击外部关闭
    document.addEventListener('click', function(e) {
        if (!popup.contains(e.target) && e.target !== event.currentTarget) {
            popup.remove();
        }
    });
    
    // 计算并调整弹窗位置，确保不会超出屏幕边缘
    const popupRect = popup.getBoundingClientRect();
    const popupWidth = popupRect.width;
    const popupHeight = popupRect.height;
    
    // 计算初始位置（以鼠标位置为左上角）
    let left = event.clientX;
    let top = event.clientY;
    
    // 确保弹窗不会超出屏幕右边缘
    if (left + popupWidth > window.innerWidth) {
        left = window.innerWidth - popupWidth - 10;
    }
    
    // 确保弹窗不会超出屏幕下边缘
    if (top + popupHeight > window.innerHeight) {
        top = window.innerHeight - popupHeight - 10;
    }
    
    // 确保弹窗不会超出屏幕左边缘
    if (left < 0) {
        left = 10;
    }
    
    // 确保弹窗不会超出屏幕上边缘
    if (top < 0) {
        top = 10;
    }
    
    // 设置最终位置
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
}

// 使用Token加入群组
function joinGroupWithToken(token, groupId, groupName, popup) {
fetch(`${SERVER_URL}/join-group-with-token`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'user-id': currentUser.id,
        'session-token': currentSessionToken
    },
    body: JSON.stringify({ token: token })
})
.then(response => response.json())
.then(data => {
    if (data.status === 'success') {
        alert(`成功加入群组: ${groupName}`);
        // 关闭弹出窗口
        if (popup) {
            popup.remove();
        }
        // 刷新群组列表
        loadGroupList();
    } else {
        alert('加入群组失败: ' + (data.message || '未知错误'));
    }
})
.catch(error => {
    console.error('加入群组失败:', error);
    alert('加入群组失败，网络错误');
});
}

// 获取验证码
function getPasswordCaptcha() {
    fetch(`${SERVER_URL}/captcha`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const captchaContainer = document.getElementById('passwordCaptchaContainer');
                const captchaIdInput = document.getElementById('passwordCaptchaId');
                
                if (captchaContainer && captchaIdInput) {
                    // 直接嵌入SVG内容，替换整个验证码容器的内容
                    captchaContainer.innerHTML = data.captchaSvg;
                    // 为直接嵌入的SVG添加点击事件
                    const svgElement = captchaContainer.querySelector('svg');
                    if (svgElement) {
                        svgElement.style.border = '1px solid #ddd';
                        svgElement.style.cursor = 'pointer';
                        svgElement.style.borderRadius = '4px';
                        svgElement.addEventListener('click', getPasswordCaptcha);
                    }
                    captchaIdInput.value = data.captchaId;
                }
            }
        })
        .catch(error => {
            console.error('获取验证码失败:', error);
        });
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
    
    // 初始获取验证码
    getPasswordCaptcha();
    
    // 初始化头像上传功能
    const selectAvatarButton = document.getElementById('selectAvatarButton');
    const avatarFileInput = document.getElementById('avatarFileInput');
    const uploadAvatarButton = document.getElementById('uploadAvatarButton');
    const avatarPreview = document.getElementById('avatarPreview');
    
    if (selectAvatarButton && avatarFileInput) {
        // 选择头像按钮点击事件
        selectAvatarButton.addEventListener('click', function() {
            avatarFileInput.click();
        });
        
        // 文件选择变化事件
        avatarFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                // 预览图片
                const reader = new FileReader();
                reader.onload = function(e) {
                    if (avatarPreview) {
                        // 清空预览区域
                        avatarPreview.innerHTML = '';
                        
                        // 创建预览图片元素
                        const img = document.createElement('img');
                        img.src = e.target.result;
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                        img.style.borderRadius = '50%';
                        
                        avatarPreview.appendChild(img);
                    }
                };
                reader.readAsDataURL(file);
                
                // 启用上传按钮
                if (uploadAvatarButton) {
                    uploadAvatarButton.disabled = false;
                }
            }
        });
    }
    
    if (uploadAvatarButton) {
        // 上传头像按钮点击事件
        uploadAvatarButton.addEventListener('click', function() {
            const file = avatarFileInput.files[0];
            if (file) {
                uploadUserAvatar(file);
            }
        });
    }
}

// 上传用户头像
function uploadUserAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('userId', currentUser.id);
    
    fetch(`${SERVER_URL}/upload-avatar`, {
        method: 'POST',
        headers: {
            'session-token': currentSessionToken,
            'user-id': currentUser.id
        },
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            showSuccess('头像上传成功');
            
            // 更新本地用户信息
            if (data.avatarUrl) {
                currentUser.avatarUrl = data.avatarUrl;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                
                // 更新UI中的头像
                const currentUserAvatar = document.getElementById('currentUserAvatar');
                if (currentUserAvatar) {
                    currentUserAvatar.src = `${SERVER_URL}${data.avatarUrl}`;
                    currentUserAvatar.style.display = 'block';
                }
                
                // 更新头像预览
                const currentAvatarImg = document.getElementById('currentAvatarImg');
                if (currentAvatarImg) {
                    currentAvatarImg.src = `${SERVER_URL}${data.avatarUrl}`;
                }
            }
            
            // 重置上传按钮状态
            const uploadAvatarButton = document.getElementById('uploadAvatarButton');
            if (uploadAvatarButton) {
                uploadAvatarButton.disabled = true;
            }
        } else {
            showError(data.message || '头像上传失败');
        }
    })
    .catch(error => {
        showError('头像上传失败，请重试');
    });
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
    } else if (settingId === 'change-password') {
        // 获取密码输入值
        const oldPassword = document.getElementById('oldPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const captchaId = document.getElementById('passwordCaptchaId').value;
        const captchaCode = document.getElementById('passwordCaptchaCode').value;
        
        // 验证密码
        if (!oldPassword || !newPassword || !confirmPassword) {
            showError('所有密码字段都不能为空');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showError('新密码和确认密码不一致');
            return;
        }
        
        if (newPassword.length < 6) {
            showError('新密码长度不能少于6个字符');
            return;
        }
        
        // 验证验证码
        if (!captchaId || !captchaCode) {
            showError('验证码不能为空');
            return;
        }
        
        // 使用WebSocket发送密码修改请求
        if (window.chatSocket) {
            // 发送密码修改请求
            window.chatSocket.emit('change-password', {
                userId: currentUser.id,
                oldPassword: oldPassword,
                newPassword: newPassword,
                captchaId: captchaId,
                captchaCode: captchaCode,
                sessionToken: currentSessionToken
            });
            
            // 监听密码修改结果
            window.chatSocket.once('password-change-result', (result) => {
                if (result.success) {
                    showSuccess('密码修改成功');
                    // 清空表单
                    form.reset();
                    // 刷新验证码
                    getPasswordCaptcha();
                } else {
                    showError(result.message || '密码修改失败');
                    // 刷新验证码
                    getPasswordCaptcha();
                }
            });
        } else {
            showError('WebSocket连接未建立，无法修改密码');
        }
    } else {
        // 其他设置类型仍然使用HTTP请求
        let endpoint = '';
        switch (settingId) {
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
    
    // 创建群组按钮点击事件
    setupCreateGroupButton(createGroupButton);
    
    // 群组信息按钮点击事件
    setupGroupInfoButton(groupInfoButton);
    
    // 退出/解散群组按钮点击事件
    setupLeaveGroupButton(leaveGroupButton);
}

// 设置创建群组按钮
function setupCreateGroupButton(createGroupButton) {
    if (!createGroupButton) return;
    
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
            
            // 清空表单
            newGroupNameInput.value = '';
            newGroupDescriptionInput.value = '';
            
            // 设置模态框显示方式为flex
            modal.style.display = 'flex';
            
            // 直接调用loadAvailableMembers
            if (window.ModalManager && typeof window.ModalManager.loadAvailableMembers === 'function') {
                window.ModalManager.loadAvailableMembers();
            }
        }
    });
}

// 设置群组信息按钮
function setupGroupInfoButton(groupInfoButton) {
    if (!groupInfoButton) return;
    
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
        .then(response => {
            // 检查响应状态
            if (!response.ok) {
                throw new Error(`HTTP错误! 状态码: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // 确保数据存在
            if (!data) {
                throw new Error('获取数据失败');
            }
            
            if (data.status === 'success') {
                displayGroupInfoModal(data.group, currentGroupId);
            } else {
                alert('获取群组信息失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(error => {
            console.error('获取群组信息错误:', error);
            // 只有当不是HTTP错误时才提示网络错误
            if (error.message && error.message.includes('HTTP错误')) {
                alert('获取群组信息失败，服务器返回错误');
            } else {
                alert('获取群组信息失败，网络错误');
            }
        });
    });
}

// 显示群组信息模态框
function displayGroupInfoModal(groupData, groupId) {
    // 显示群组信息模态框
    const modal = document.getElementById('groupInfoModal');
    const modalGroupName = document.getElementById('modalGroupName');
    const modalGroupNameValue = document.getElementById('modalGroupNameValue');
    const modalGroupIdValue = document.getElementById('modalGroupIdValue');
    const modalGroupMemberCount = document.getElementById('modalGroupMemberCount');
    const modalGroupOwner = document.getElementById('modalGroupOwner');
    const groupManageSection = document.getElementById('groupManageSection');
    
    // 对群组名称进行反转义，避免二次转义
    const originalGroupName = unescapeHtml(groupData.name);
    
    modalGroupName.textContent = `${originalGroupName} - 群组信息`;
    modalGroupNameValue.textContent = originalGroupName;
    modalGroupIdValue.textContent = groupData.id;
    modalGroupMemberCount.textContent = '加载中';
    
    // 显示群主信息（使用与原UI一致的creator_id）
    const ownerId = groupData.creator_id || groupData.ownerId || groupData.creatorId || groupData.adminId;
    const isOwner = currentUser.id === String(ownerId);
    
    // 显示群组公告
    const modalGroupNoticeValue = document.getElementById('modalGroupNoticeValue');
    if (modalGroupNoticeValue) {
        modalGroupNoticeValue.textContent = groupData.description ? unescapeHtml(groupData.description) : '暂无群组公告';
    }
    
    // 先移除已存在的头像元素，防止残留
    const existingAvatarElement = document.getElementById('modalGroupAvatarValue');
    if (existingAvatarElement) {
        existingAvatarElement.remove();
    }
    
    // 显示群头像
    const modalGroupAvatarValue = document.createElement('div');
    modalGroupAvatarValue.id = 'modalGroupAvatarValue';
    modalGroupAvatarValue.style.marginBottom = '15px';
    
    // 创建头像容器
    const avatarContainer = document.createElement('div');
    avatarContainer.style.display = 'flex';
    avatarContainer.style.alignItems = 'center';
    avatarContainer.style.gap = '10px';
    
    // 显示群头像或默认头像
    const groupAvatarUrl = groupData.avatar_url || groupData.avatarUrl || '';
    let avatarHtml = '';
    if (groupAvatarUrl) {
        // 检查头像URL是否为SVG格式，防止XSS攻击
        const isSvgAvatar = /\.svg$/i.test(groupAvatarUrl);
        if (isSvgAvatar) {
            // SVG文件特殊处理：使用默认头像
            const initials = originalGroupName.charAt(0).toUpperCase();
            avatarHtml = `<div class="group-avatar-large" style="width: 80px; height: 80px; border-radius: 50%; background-color: #3498db; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 32px; color: white; cursor: pointer;">${initials}</div>`;
        } else {
            const fullAvatarUrl = `${SERVER_URL}${groupAvatarUrl}`;
            avatarHtml = `<img src="${fullAvatarUrl}" alt="${originalGroupName}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; cursor: pointer;">`;
        }
    } else {
        // 没有头像时显示默认头像（群组名称首字母）
        const initials = originalGroupName.charAt(0).toUpperCase();
        avatarHtml = `<div class="group-avatar-large" style="width: 80px; height: 80px; border-radius: 50%; background-color: #3498db; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 32px; color: white; cursor: pointer;">${initials}</div>`;
    }
    
    avatarContainer.innerHTML = avatarHtml;
    
    // 如果是群主，添加上传头像按钮
    if (isOwner) {
        const uploadAvatarBtn = document.createElement('button');
        uploadAvatarBtn.id = 'uploadGroupAvatarBtn';
        uploadAvatarBtn.className = 'edit-group-avatar-btn';
        uploadAvatarBtn.style.padding = '6px 12px';
        uploadAvatarBtn.style.backgroundColor = '#3498db';
        uploadAvatarBtn.style.color = 'white';
        uploadAvatarBtn.style.border = 'none';
        uploadAvatarBtn.style.borderRadius = '4px';
        uploadAvatarBtn.style.cursor = 'pointer';
        uploadAvatarBtn.style.fontSize = '12px';
        uploadAvatarBtn.textContent = '上传群头像';
        
        // 添加点击事件
        uploadAvatarBtn.addEventListener('click', function(e) {
            // 阻止事件冒泡，避免触发头像放大查看
            e.stopPropagation();
            
            // 创建文件输入元素
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);
            
            // 触发文件选择
            fileInput.click();
            
            // 处理文件选择
            fileInput.addEventListener('change', function() {
                if (this.files && this.files[0]) {
                    uploadGroupAvatar(groupId, this.files[0]);
                }
                document.body.removeChild(fileInput);
            });
        });
        
        avatarContainer.appendChild(uploadAvatarBtn);
    }
    
    modalGroupAvatarValue.appendChild(avatarContainer);
    
    // 插入到模态框头部
    const modalBody = modal.querySelector('.modal-body');
    if (modalBody && modalBody.firstChild) {
        modalBody.insertBefore(modalGroupAvatarValue, modalBody.firstChild);
    }
    
    // 设置群组公告编辑按钮
    setupEditGroupNoticeButton(isOwner, groupData.description || '', groupId);
    
    if (modalGroupOwner) {
        modalGroupOwner.textContent = `群主ID: ${ownerId}`;
    }
    
    // 显示或隐藏管理功能
    if (groupManageSection) {
        groupManageSection.style.display = isOwner ? 'block' : 'none';
    }
    
    // 设置群组名称编辑按钮
    setupEditGroupNameButton(isOwner, originalGroupName, groupId);
    
    // 显示模态框
    modal.style.display = 'flex';
    
    // 加载群组成员列表
    loadGroupMembers(groupId, isOwner);
    
    // 添加刷新成员列表按钮事件
    const refreshGroupMembersBtn = document.getElementById('refreshGroupMembers');
    if (refreshGroupMembersBtn) {
        refreshGroupMembersBtn.onclick = function() {
            loadGroupMembers(groupId, isOwner);
        };
    }
    
    // 添加添加成员按钮事件
    const addMemberToGroupBtn = document.getElementById('addMemberToGroup');
    if (addMemberToGroupBtn) {
        addMemberToGroupBtn.onclick = function() {
            // 打开添加成员模态框
            showAddGroupMemberModal(groupId);
        };
    }
}

// 上传群头像
function uploadGroupAvatar(groupId, file) {
    if (!currentUser || !currentSessionToken) {
        alert('请先登录');
        return;
    }
    
    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('groupId', groupId);
    formData.append('userId', currentUser.id);
    
    // 显示上传提示
    alert('正在上传群头像，请稍候...');
    
    fetch(`${SERVER_URL}/upload-group-avatar/${groupId}`, {
        method: 'POST',
        headers: {
            'session-token': currentSessionToken,
            'user-id': currentUser.id
        },
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            alert('群头像上传成功');
            // 重新加载群组信息
            fetch(`${SERVER_URL}/group-info/${groupId}`, {
                headers: {
                    'user-id': currentUser.id,
                    'session-token': currentSessionToken
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    // 先关闭模态框，然后重新打开
                    const modal = document.getElementById('groupInfoModal');
                    if (modal) {
                        modal.style.display = 'none';
                    }
                    
                    // 延迟一下再重新显示，确保DOM更新完成
                    setTimeout(() => {
                        // 重新显示群组信息模态框
                        displayGroupInfoModal(data.group, groupId);
                        // 刷新群组列表
                        loadGroupList();
                    }, 100);
                }
            });
        } else {
            alert('上传群头像失败: ' + (data.message || '未知错误'));
        }
    })
    .catch(error => {
        alert('上传群头像失败，网络错误');
    });
}

// 设置群组公告编辑按钮
function setupEditGroupNoticeButton(isOwner, currentNotice, groupId) {
    const editGroupNoticeBtn = document.getElementById('editGroupNoticeBtn');
    if (!editGroupNoticeBtn) return;
    
    if (isOwner) {
        editGroupNoticeBtn.style.display = 'inline-block';
        
        // 为编辑按钮添加点击事件
        editGroupNoticeBtn.onclick = function() {
            const modalGroupNoticeValue = document.getElementById('modalGroupNoticeValue');
            
            // 创建编辑输入框
            const editTextarea = document.createElement('textarea');
            editTextarea.value = currentNotice;
            editTextarea.className = 'edit-group-notice-textarea';
            editTextarea.style.padding = '6px';
            editTextarea.style.border = '1px solid #dee2e6';
            editTextarea.style.borderRadius = '4px';
            editTextarea.style.fontSize = '14px';
            editTextarea.style.flex = '1';
            editTextarea.style.minHeight = '80px';
            editTextarea.style.resize = 'vertical';
            
            // 创建保存和取消按钮
            const saveBtn = document.createElement('button');
            saveBtn.textContent = '保存';
            saveBtn.className = 'save-group-notice-btn';
            saveBtn.style.marginLeft = '5px';
            saveBtn.style.padding = '6px 12px';
            saveBtn.style.background = '#27ae60';
            saveBtn.style.color = 'white';
            saveBtn.style.border = 'none';
            saveBtn.style.borderRadius = '4px';
            saveBtn.style.cursor = 'pointer';
            saveBtn.style.fontSize = '12px';
            saveBtn.style.alignSelf = 'flex-start';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = '取消';
            cancelBtn.className = 'cancel-group-notice-btn';
            cancelBtn.style.marginLeft = '5px';
            cancelBtn.style.padding = '6px 12px';
            cancelBtn.style.background = '#6c757d';
            cancelBtn.style.color = 'white';
            cancelBtn.style.border = 'none';
            cancelBtn.style.borderRadius = '4px';
            cancelBtn.style.cursor = 'pointer';
            cancelBtn.style.fontSize = '12px';
            cancelBtn.style.alignSelf = 'flex-start';
            
            // 替换显示为编辑界面
            const groupNoticeContainer = modalGroupNoticeValue.parentElement;
            groupNoticeContainer.innerHTML = '';
            groupNoticeContainer.appendChild(editTextarea);
            groupNoticeContainer.appendChild(saveBtn);
            groupNoticeContainer.appendChild(cancelBtn);
            
            // 聚焦到输入框
            editTextarea.focus();
            
            // 保存按钮点击事件
            saveBtn.onclick = function() {
                const newNotice = editTextarea.value.trim();
                // 更新群组公告
                updateGroupNotice(groupId, newNotice);
            };
            
            // 取消按钮点击事件
            cancelBtn.onclick = function() {
                // 创建元素，使用textContent设置内容，防止XSS攻击
                const span = document.createElement('span');
                span.id = 'modalGroupNoticeValue';
                span.style.flex = '1';
                span.style.wordBreak = 'break-word';
                span.textContent = currentNotice || '暂无群组公告';
                
                const button = document.createElement('button');
                button.id = 'editGroupNoticeBtn';
                button.className = 'edit-group-notice-btn';
                button.style.padding = '4px 8px';
                button.style.backgroundColor = '#3498db';
                button.style.color = 'white';
                button.style.border = 'none';
                button.style.borderRadius = '4px';
                button.style.cursor = 'pointer';
                button.style.fontSize = '12px';
                button.textContent = '编辑';
                
                // 清空容器并添加元素
                groupNoticeContainer.innerHTML = '';
                groupNoticeContainer.appendChild(span);
                groupNoticeContainer.appendChild(button);
                
                // 重新绑定编辑按钮事件
                button.onclick = editGroupNoticeBtn.onclick;
            };
        };
    } else {
        editGroupNoticeBtn.style.display = 'none';
    }
}

// 设置群组名称编辑按钮
function setupEditGroupNameButton(isOwner, currentName, groupId) {
    const editGroupNameBtn = document.getElementById('editGroupNameBtn');
    if (!editGroupNameBtn) return;
    
    if (isOwner) {
        editGroupNameBtn.style.display = 'inline-block';
        
        // 为编辑按钮添加点击事件
        editGroupNameBtn.onclick = function() {
            const modalGroupNameValue = document.getElementById('modalGroupNameValue');
            
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
                    updateGroupName(groupId, newGroupName);
                }
            };
            
            // 取消按钮点击事件
            cancelBtn.onclick = function() {
                // 创建元素，使用textContent设置内容，防止XSS攻击
                const span = document.createElement('span');
                span.id = 'modalGroupNameValue';
                span.textContent = currentName;
                
                const button = document.createElement('button');
                button.id = 'editGroupNameBtn';
                button.className = 'edit-group-name-btn';
                button.style.padding = '4px 8px';
                button.style.backgroundColor = '#3498db';
                button.style.color = 'white';
                button.style.border = 'none';
                button.style.borderRadius = '4px';
                button.style.cursor = 'pointer';
                button.style.fontSize = '12px';
                button.textContent = '编辑';
                
                // 清空容器并添加元素
                groupNameContainer.innerHTML = '';
                groupNameContainer.appendChild(span);
                groupNameContainer.appendChild(button);
                
                // 重新绑定编辑按钮事件
                button.onclick = editGroupNameBtn.onclick;
            };
        };
    } else {
        editGroupNameBtn.style.display = 'none';
    }
}

// 设置退出/解散群组按钮
function setupLeaveGroupButton(leaveGroupButton) {
    if (!leaveGroupButton) return;
    
    // 移除所有现有的点击事件监听器
    const newLeaveGroupButton = leaveGroupButton.cloneNode(true);
    leaveGroupButton.parentNode.replaceChild(newLeaveGroupButton, leaveGroupButton);
    
    // 更新按钮文本
    updateLeaveGroupButtonText(newLeaveGroupButton);
    
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
        .then(response => {
            // 检查响应状态
            if (!response.ok) {
                throw new Error(`HTTP错误! 状态码: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // 确保数据存在
            if (!data) {
                throw new Error('获取数据失败');
            }
            
            if (data.status === 'success') {
                const ownerId = data.group.creator_id || data.group.ownerId || data.group.creatorId || data.group.adminId;
                const isOwner = currentUser.id === String(ownerId);
                
                if (isOwner) {
                    handleDissolveGroup(currentGroupId);
                } else {
                    handleLeaveGroup(currentGroupId);
                }
            } else {
                // 处理服务器返回的错误
                alert(data.message || '获取群组信息失败');
            }
        })
        .catch(error => {
            console.error('获取群组信息错误:', error);
            // 只有当不是HTTP错误时才提示网络错误
            if (error.message && error.message.includes('HTTP错误')) {
                alert('获取群组信息失败，服务器返回错误');
            } else {
                alert('获取群组信息失败，网络错误');
            }
        });
    });
}

// 更新退出/解散群组按钮文本
function updateLeaveGroupButtonText(leaveGroupButton) {
    if (!leaveGroupButton || !currentGroupId) return;
    
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
            
            // 根据是否是群主修改按钮文本
            leaveGroupButton.textContent = isOwner ? '解散群组' : '退出群组';
        }
    })
    .catch(error => {
        console.error('获取群组信息失败:', error);
    });
}

// 处理解散群组
function handleDissolveGroup(groupId) {
    if (confirm('确定要解散该群组吗？此操作不可恢复，所有群消息将被删除。')) {
        dissolveGroup(groupId);
    }
}

// 处理退出群组
function handleLeaveGroup(groupId) {
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
                groupId: groupId
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

// 加载群组成员列表
function loadGroupMembers(groupId, isOwner) {
    // console.log(`📋 [群组成员] 开始加载群组成员列表，群组ID: ${groupId}，是否为群主: ${isOwner}`);
    
    const groupMembersContainer = document.getElementById('groupMembersContainer');
    const modalGroupMemberCount = document.getElementById('modalGroupMemberCount');
    if (!groupMembersContainer) {
        // console.error('❌ [群组成员] 未找到群组成员容器');
        return;
    }
    
    groupMembersContainer.innerHTML = '<div class="loading-members">正在加载成员列表...</div>';
    
    // console.log(`🔄 [群组成员] 发送请求获取群组成员列表，群组ID: ${groupId}`);
    fetch(`${SERVER_URL}/group-members/${groupId}`, {
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        }
    })
    .then(response => response.json())
    .then(data => {
        // console.log(`✅ [群组成员] 收到群组成员列表响应，状态: ${data.status}，数据:`, data);
        
        if (data.status === 'success') {
            // console.log(`📊 [群组成员] 成功获取群组成员列表，共 ${data.members.length} 个成员`);
            updateGroupMembersList(data.members, isOwner, groupId);
            // 更新群组成员数量
            modalGroupMemberCount.textContent = data.members.length;
        } else {
            const errorMsg = data.message || '未知错误';
            // console.error(`❌ [群组成员] 加载群组成员列表失败: ${errorMsg}`);
            groupMembersContainer.innerHTML = `<div class="loading-members">加载成员列表失败: ${errorMsg}</div>`;
        }
    })
    .catch(error => {
        // console.error('❌ [群组成员] 网络错误加载群组成员列表:', error);
        groupMembersContainer.innerHTML = '<div class="loading-members">加载成员列表失败，网络错误</div>';
    });
}

// 更新群组成员列表显示
function updateGroupMembersList(members, isOwner, groupId) {
    // console.log(`📋 [群组成员] 开始更新群组成员列表，群组ID: ${groupId}，是否为群主: ${isOwner}，成员数量: ${members ? members.length : 0}`);
    
    const groupMembersContainer = document.getElementById('groupMembersContainer');
    if (!groupMembersContainer) {
        // console.error('❌ [群组成员] 未找到群组成员容器');
        return;
    }
    
    if (!members || !Array.isArray(members) || members.length === 0) {
        // console.log(`📊 [群组成员] 群组成员列表为空，群组ID: ${groupId}`);
        groupMembersContainer.innerHTML = '<div class="loading-members">没有可用的成员</div>';
        return;
    }
    
    // console.log(`📊 [群组成员] 开始渲染 ${members.length} 个成员，群组ID: ${groupId}`);
    let membersHtml = '';
    members.forEach((member, index) => {
        // 检查是否是群主
        const isMemberOwner = String(member.id) === String(currentUser.id);
        
        // console.log(`👤 [群组成员] 处理成员 ${index + 1}/${members.length}: ID=${member.id}, 昵称=${member.nickname}, 是当前用户: ${isMemberOwner}`);
        
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
    
    // console.log(`✅ [群组成员] 成员列表HTML生成完成，共 ${members.length} 个成员`);
    groupMembersContainer.innerHTML = membersHtml;
    
    // 添加踢出成员按钮事件
    if (isOwner) {
        const kickButtons = groupMembersContainer.querySelectorAll('.kick-member-btn');
        // console.log(`🔧 [群组成员] 添加 ${kickButtons.length} 个踢出成员按钮事件`);
        
        kickButtons.forEach(button => {
            button.addEventListener('click', function() {
                const groupId = this.getAttribute('data-group-id');
                const memberId = this.getAttribute('data-member-id');
                const memberName = this.getAttribute('data-member-name');
                
                // console.log(`🚫 [群组成员] 点击踢出按钮，群组ID: ${groupId}，成员ID: ${memberId}，成员昵称: ${memberName}`);
                removeMemberFromGroup(groupId, memberId, memberName);
            });
        });
    }
    
    // console.log(`✅ [群组成员] 群组成员列表更新完成，群组ID: ${groupId}`);
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

        // 检查服务器返回的状态，有些服务器可能返回不同的状态值
        if (data.status === 'success' || (data.message && data.message.includes('成功'))) {
            alert(`已成功踢出成员 ${memberName}`);
            // 重新加载群组成员列表
            loadGroupMembers(groupId, true);
        } else {
            alert('踢出成员失败: ' + (data.message || '未知错误'));
        }
    })
    .catch(error => {
        console.error('踢出成员失败:', error);
        alert('踢出成员失败，网络错误');
    });
}

// 显示添加群组成员模态框
function showAddGroupMemberModal(groupId) {

    if (!groupId || !currentUser || !currentSessionToken) {
        return;
    }
    
    // 保存当前群组ID
    window.currentAddingGroupId = groupId;
    
    // 显示模态框
    const modal = document.getElementById('addGroupMemberModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        document.body.style.overflow = 'hidden';
    }
    
    // 加载可用成员
    loadAvailableMembersForGroup(groupId);
}

// 隐藏添加群组成员模态框
function hideAddGroupMemberModal() {

    const modal = document.getElementById('addGroupMemberModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
    
    // 清空消息
    const addMembersMessage = document.getElementById('addMembersMessage');
    if (addMembersMessage) {
        addMembersMessage.textContent = '';
    }
    
    // 清空选择
    const availableMembersList = document.getElementById('availableMembersList');
    if (availableMembersList) {
        const checkboxes = availableMembersList.querySelectorAll('.available-member-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
    }
    
    // 清除当前群组ID
    delete window.currentAddingGroupId;
}

// 加载可添加到群组的成员（只显示好友）
function loadAvailableMembersForGroup(groupId) {

    if (!groupId || !currentUser || !currentSessionToken) {
        return;
    }
    
    const availableMembersList = document.getElementById('availableMembersList');
    if (!availableMembersList) {
        return;
    }
    
    // 显示加载状态
    availableMembersList.innerHTML = '<div class="loading-members">正在加载好友列表...</div>';
    
    // 先获取好友列表
    fetch(`${SERVER_URL}/user/friends`, {
        method: 'GET',
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        }
    })
    .then(response => response.json())
    .then(friendsData => {
        if (friendsData.status === 'success' && friendsData.friends && Array.isArray(friendsData.friends)) {
            // 然后获取已在群组中的成员列表
            return fetch(`${SERVER_URL}/group-members/${groupId}`, {
                method: 'GET',
                headers: {
                    'user-id': currentUser.id,
                    'session-token': currentSessionToken
                }
            })
            .then(response => response.json())
            .then(membersData => {
                let groupMembers = [];
                if (membersData.status === 'success' && membersData.members && Array.isArray(membersData.members)) {
                    groupMembers = membersData.members;
                }
                
                // 提取已在群组中的成员ID
                const groupMemberIds = new Set(groupMembers.map(member => {
                    return String(member.id);
                }));
                
                // 过滤出不在群组中的好友
                const availableFriends = friendsData.friends.filter(friend => {
                    const friendId = String(friend.id);
                    const isNotCurrentUser = friendId !== String(currentUser.id);
                    const isNotInGroup = !groupMemberIds.has(friendId);
                    return isNotCurrentUser && isNotInGroup;
                });
                
                return availableFriends;
            });
        } else {
            return [];
        }
    })
    .then(availableFriends => {
        if (availableFriends.length === 0) {
            availableMembersList.innerHTML = '<div class="loading-members">没有可添加的好友</div>';
            return;
        }
        
        // 渲染可添加好友列表
        availableMembersList.innerHTML = availableFriends.map(friend => `
            <div class="member-item">
                <input type="checkbox" class="available-member-checkbox" id="available-member-${friend.id}" value="${friend.id}">
                <label for="available-member-${friend.id}" class="member-nickname">${friend.nickname || friend.username || '未知用户'}</label>
            </div>
        `).join('');
    })
    .catch(error => {
        availableMembersList.innerHTML = '<div class="loading-members">加载好友列表失败</div>';
    });
}

// 确认添加群组成员
function confirmAddGroupMembers() {

    const groupId = window.currentAddingGroupId;
    if (!groupId || !currentUser || !currentSessionToken) {
        return;
    }
    
    const availableMembersList = document.getElementById('availableMembersList');
    const addMembersMessage = document.getElementById('addMembersMessage');
    
    if (!availableMembersList || !addMembersMessage) {
        console.error('❌ [添加成员] 找不到必要的DOM元素');
        return;
    }
    
    // 获取选中的成员ID
    const checkboxes = availableMembersList.querySelectorAll('.available-member-checkbox:checked');
    const selectedMemberIds = Array.from(checkboxes).map(checkbox => checkbox.value);
    
    if (selectedMemberIds.length === 0) {
        addMembersMessage.textContent = '请选择至少1名成员';
        addMembersMessage.className = 'create-group-message error';
        return;
    }
    
    // 隐藏错误消息
    addMembersMessage.textContent = '';
    addMembersMessage.className = 'create-group-message';
    

    
    // 发送添加成员请求
    fetch(`${SERVER_URL}/add-group-members`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: JSON.stringify({
            groupId: groupId,
            memberIds: selectedMemberIds
        })
    })
    .then(response => response.json())
    .then(data => {

        
        if (data.status === 'success' || (data.message && data.message.includes('成功'))) {
            addMembersMessage.textContent = '成员添加成功';
            addMembersMessage.className = 'create-group-message success';
            
            // 延迟关闭模态框
            setTimeout(() => {
                hideAddGroupMemberModal();
                // 重新加载群组成员列表
                loadGroupMembers(groupId, true);
            }, 1000);
        } else {
            addMembersMessage.textContent = data.message || '添加成员失败';
            addMembersMessage.className = 'create-group-message error';
        }
    })
    .catch(error => {
        console.error(`❌ [添加成员] 添加成员到群组 ${groupId} 失败:`, error);
        addMembersMessage.textContent = '添加成员失败，网络错误';
        addMembersMessage.className = 'create-group-message error';
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
            
            // 恢复群组信息模态框中群组名称的显示状态
            const groupNameContainer = document.querySelector('.group-info-item:nth-of-type(1) > div');
            if (groupNameContainer) {
                groupNameContainer.innerHTML = `
                    <span id="modalGroupNameValue">${unescapedGroupName}</span>
                    <button id="editGroupNameBtn" class="edit-group-name-btn" style="padding: 4px 8px; background-color: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        编辑
                    </button>
                `;
                // 重新设置编辑按钮功能
                setupEditGroupNameButton(true, unescapedGroupName, groupId);
            }
            
            // 更新模态框标题
            const modalGroupName = document.getElementById('modalGroupName');
            if (modalGroupName) {
                modalGroupName.textContent = `${unescapedGroupName} - 群组信息`;
            }
            
            alert('群组名称已成功更新');
            
            // 关闭管理模态框（如果打开的话）
            const manageGroupModal = document.getElementById('manageGroupModal');
            if (manageGroupModal && manageGroupModal.style.display !== 'none') {
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

// 更新群组公告
function updateGroupNotice(groupId, newNotice) {
    if (!currentUser || !currentSessionToken) {
        alert('请先登录');
        return;
    }
    
    fetch(`${SERVER_URL}/update-group-description`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: JSON.stringify({
            groupId: groupId,
            newDescription: newNotice
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP错误! 状态码: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.status === 'success') {
            // 更新群组列表中的公告（如果有显示的话）
            updateGroupNoticeInList(groupId, newNotice);
            
            // 直接获取群组公告容器，而不依赖于 modalGroupNoticeValue
            const groupNoticeContainer = document.querySelector('.group-info-item:nth-of-type(3) > div');
            if (groupNoticeContainer) {
                // 恢复显示状态
                groupNoticeContainer.innerHTML = `
                    <span id="modalGroupNoticeValue" style="flex: 1; word-break: break-word;">${newNotice || '暂无群组公告'}</span>
                    <button id="editGroupNoticeBtn" class="edit-group-notice-btn" style="padding: 4px 8px; background-color: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        编辑
                    </button>
                `;
                // 重新设置编辑按钮功能
                setupEditGroupNoticeButton(true, newNotice, groupId);
            }
            
            alert('群组公告已成功更新');
        } else {
            alert('修改群组公告失败: ' + (data.message || '未知错误'));
        }
    })
    .catch(error => {
        console.error('修改群组公告失败:', error);
        alert('修改群组公告失败，网络错误: ' + error.message);
    });
}

// 更新群组列表中的群组公告
function updateGroupNoticeInList(groupId, newNotice) {
    // 这里可以根据需要更新群组列表中的公告显示
    // 如果群组列表中没有显示公告，则不需要实现
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
    
    // 添加详细日志，记录在线用户列表更新情况
    // console.log('📱 在线用户列表更新：');
    // console.log('   原始数据：', users);
    // console.log('   用户数量：', users.length);
    // console.log('   用户IDs：', users.map(user => user.id).join(', '));
    
    // 更新在线用户列表全局变量
    onlineUsersList = users;
    
    // 更新在线用户数量
    if (onlineCount) {
        onlineCount.textContent = `(${users.length})`;
    }
    
    // 当在线用户列表更新时，重新检查并更新所有好友的在线状态
    updateFriendsList(friendsList);
    
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
        
        // 为在线用户列表项添加data-user-id属性
        li.setAttribute('data-user-id', user.id);
        
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
    
    // 更新好友列表的在线状态
    const friendItems = document.querySelectorAll('.friend-item');
    friendItems.forEach(item => {
        const friendId = item.dataset.userId;
        const isOnline = onlineUsersList.some(user => String(user.id) === String(friendId));
        const statusElement = item.querySelector('.friend-status');
        if (statusElement) {
            statusElement.className = `friend-status ${isOnline ? 'online' : 'offline'}`;
        }
    });
    
    // 为新渲染的用户头像添加点击事件
    addAvatarClickListeners();
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

// HTML转义函数，防止XSS攻击
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
        const groupUnread = unreadMessages.groups[groupId] || 0;
        totalUnread += groupUnread;
    }
    
    // 累加所有私信的未读消息数
    for (const userId in unreadMessages.private) {
        const privateUnread = unreadMessages.private[userId] || 0;
        totalUnread += privateUnread;
    }
    
    // 更新页面标题，格式：（X条未读）简易聊天室
    if (totalUnread > 0) {
        document.title = `（${totalUnread}条未读）${originalTitle}`;

    } else {
        document.title = originalTitle;
    }
    
    // 更新未读计数显示
    updateUnreadCountsDisplay();
}

// 更新未读计数显示
function updateUnreadCountsDisplay() {
    // 更新公共聊天按钮的未读计数
    const publicChatUnreadEl = document.getElementById('publicChatUnreadCount');
    if (publicChatUnreadEl) {
        if (unreadMessages.global > 0) {
            publicChatUnreadEl.textContent = unreadMessages.global;
        } else {
            publicChatUnreadEl.textContent = '';
        }
    }
    
    // 更新群组聊天按钮的未读计数
    const groupChatUnreadEl = document.getElementById('groupChatUnreadCount');
    if (groupChatUnreadEl) {
        // 计算所有群组的未读消息总数
        let totalGroupUnread = 0;
        for (const groupId in unreadMessages.groups) {
            const groupUnread = unreadMessages.groups[groupId] || 0;
            totalGroupUnread += groupUnread;
        }
        if (totalGroupUnread > 0) {
            groupChatUnreadEl.textContent = totalGroupUnread;
        } else {
            groupChatUnreadEl.textContent = '';
        }
    }
    
    // 更新私信聊天按钮的未读计数
    const privateChatUnreadEl = document.getElementById('privateChatUnreadCount');
    if (privateChatUnreadEl) {
        // 计算所有私信的未读消息总数
        let totalPrivateUnread = 0;
        for (const userId in unreadMessages.private) {
            const privateUnread = unreadMessages.private[userId] || 0;
            totalPrivateUnread += privateUnread;
        }
        if (totalPrivateUnread > 0) {
            privateChatUnreadEl.textContent = totalPrivateUnread;
        } else {
            privateChatUnreadEl.textContent = '';
        }
    }
    
    // 更新群组列表中每个群组的未读计数
    const groupListItems = document.querySelectorAll('#groupList li[data-group-id]');
    groupListItems.forEach(item => {
        const groupId = item.getAttribute('data-group-id');
        const unreadCount = unreadMessages.groups[groupId] || 0;
        const unreadEl = item.querySelector('.group-unread-count');
        if (unreadEl) {
            if (unreadCount > 0) {
                unreadEl.textContent = unreadCount;
            } else {
                unreadEl.textContent = '';
            }
        }
    });
    
    // 更新好友列表中每个好友的未读计数
    const friendListItems = document.querySelectorAll('#friendsList li.friend-item');
    friendListItems.forEach(item => {
        const userId = item.getAttribute('data-user-id');
        const unreadCount = unreadMessages.private[userId] || 0;
        const unreadEl = item.querySelector('.private-unread-count');
        if (unreadEl) {
            if (unreadCount > 0) {
                unreadEl.textContent = unreadCount;
            } else {
                unreadEl.textContent = '';
            }
        }
    });
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
        } else if (currentActiveChat.startsWith('private_')) {
            // 清除当前私信聊天未读计数
            const userId = currentActiveChat.replace('private_', '');
            if (unreadMessages.private[userId] > 0) {
                unreadMessages.private[userId] = 0;
                updateTitleWithUnreadCount();
            }
        } else {
            // 清除当前群组未读计数
            if (unreadMessages.groups[currentActiveChat] > 0) {
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
        } else if (currentActiveChat.startsWith('private_')) {
            // 清除当前私信聊天未读计数
            const userId = currentActiveChat.replace('private_', '');
            if (unreadMessages.private[userId] > 0) {
                unreadMessages.private[userId] = 0;
                updateTitleWithUnreadCount();
            }
        } else {
            // 清除当前群组未读计数
            if (unreadMessages.groups[currentActiveChat] > 0) {
                unreadMessages.groups[currentActiveChat] = 0;
                updateTitleWithUnreadCount();
            }
        }
    }
}

// 设置当前活动聊天室
function setActiveChat(chatType, id = null) {
    if (chatType === 'main') {
        currentActiveChat = 'main';
        // 清除全局未读消息计数
        if (unreadMessages.global > 0) {
            // console.log(`🔔 切换到主聊天室，清除全局未读消息计数: ${unreadMessages.global}`);
            unreadMessages.global = 0;
            updateTitleWithUnreadCount();
        }
    } else if (chatType === 'group' && id) {
        currentActiveChat = id;
        // 清除该群组未读消息计数
        if (unreadMessages.groups[id] > 0) {
            unreadMessages.groups[id] = 0;
            updateTitleWithUnreadCount();
        }
    } else if (chatType === 'private' && id) {
        currentActiveChat = `private_${id}`;
        // 清除该好友未读消息计数
        if (unreadMessages.private[id] > 0) {
            unreadMessages.private[id] = 0;
            updateTitleWithUnreadCount();
        }
    }
    // console.log(`💬 切换活动聊天室: ${currentActiveChat}`);
}

// 处理新消息，更新未读计数
function handleNewMessage(message, isGroup = false, groupId = null) {
    // 检查消息是否有效
    if (!message) return;
    
    // 检查消息发送者是否是自己，如果是则不添加未读计数
    if (message.senderId === currentUser.id || message.userId === currentUser.id) {
        return;
    }
    
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
            // 检查群组是否被免打扰
            if (!isGroupMuted(groupId)) {
                // 更新群组未读消息计数
                unreadMessages.groups[groupId] = (unreadMessages.groups[groupId] || 0) + 1;
            } else {

            }
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
// 免打扰功能相关函数
function getMutedGroups() {
    const mutedGroups = localStorage.getItem('mutedGroups');
    return mutedGroups ? JSON.parse(mutedGroups) : [];
}

function isGroupMuted(groupId) {
    const mutedGroups = getMutedGroups();
    return mutedGroups.includes(groupId.toString());
}

function toggleGroupMute(groupId) {
    const mutedGroups = getMutedGroups();
    const groupIdStr = groupId.toString();
    let updatedGroups;
    
    if (mutedGroups.includes(groupIdStr)) {
        // 取消免打扰
        updatedGroups = mutedGroups.filter(id => id !== groupIdStr);
        console.log(`🔔 取消群组免打扰 - 群组ID: ${groupId}`);
    } else {
        // 设置免打扰
        updatedGroups = [...mutedGroups, groupIdStr];
        console.log(`🔕 设置群组免打扰 - 群组ID: ${groupId}`);
    }
    
    localStorage.setItem('mutedGroups', JSON.stringify(updatedGroups));
    // 更新群组列表显示
    updateGroupListDisplay();
    // 更新未读计数
    updateUnreadCountsDisplay();
    return !mutedGroups.includes(groupIdStr); // 返回新的免打扰状态
}

// 更新群组列表显示（重新渲染或更新免打扰图标）
function updateGroupListDisplay() {
    const groupList = document.getElementById('groupList');
    if (!groupList) return;
    
    // 更新每个群组项的免打扰图标
    const groupItems = groupList.querySelectorAll('li');
    groupItems.forEach(item => {
        const groupId = item.getAttribute('data-group-id');
        updateGroupMuteIcon(item, groupId);
    });
}

// 更新群组项的免打扰图标
function updateGroupMuteIcon(groupItem, groupId) {
    // 移除现有的免打扰图标
    let muteIcon = groupItem.querySelector('.mute-icon');
    if (muteIcon) {
        muteIcon.remove();
    }
    
    // 如果群组被静音，添加免打扰图标
    if (isGroupMuted(groupId)) {
        muteIcon = document.createElement('span');
        muteIcon.className = 'mute-icon';
        muteIcon.textContent = '🔕';
        muteIcon.style.marginLeft = '5px';
        muteIcon.style.fontSize = '12px';
        muteIcon.title = '已免打扰';
        groupItem.appendChild(muteIcon);
    }
}

// 显示右键菜单
function showContextMenu(e, groupId, groupName) {
    // 先隐藏现有的右键菜单
    hideContextMenu();
    
    // 创建右键菜单元素
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.position = 'fixed';
    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';
    contextMenu.style.backgroundColor = 'white';
    contextMenu.style.border = '1px solid #ddd';
    contextMenu.style.borderRadius = '4px';
    contextMenu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    contextMenu.style.zIndex = '1000';
    contextMenu.style.padding = '5px 0';
    
    // 添加菜单项
    const isMuted = isGroupMuted(groupId);
    const menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item';
    menuItem.textContent = isMuted ? '取消免打扰' : '免打扰';
    menuItem.style.padding = '8px 15px';
    menuItem.style.cursor = 'pointer';
    menuItem.style.fontSize = '14px';
    menuItem.style.whiteSpace = 'nowrap';
    
    menuItem.addEventListener('click', () => {
        toggleGroupMute(groupId);
        hideContextMenu();
    });
    
    contextMenu.appendChild(menuItem);
    document.body.appendChild(contextMenu);
    
    // 保存当前菜单引用
    window.currentContextMenu = contextMenu;
    
    // 添加全局点击事件监听，点击其他地方关闭菜单
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu);
    }, 0);
}

// 隐藏右键菜单
function hideContextMenu() {
    if (window.currentContextMenu) {
        document.body.removeChild(window.currentContextMenu);
        window.currentContextMenu = null;
    }
    document.removeEventListener('click', hideContextMenu);
}

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
        
        // 注意：不再为群组添加active类
        // if (currentGroupId === group.id) {
        //     li.classList.add('active');
        // }
        
        // 显示群头像或默认头像
        let avatarHtml = '';
        const groupAvatarUrl = group.avatar_url || group.avatarUrl || '';
        if (groupAvatarUrl) {
            // 检查头像URL是否为SVG格式，防止XSS攻击
            const isSvgAvatar = /\.svg$/i.test(groupAvatarUrl);
            if (isSvgAvatar) {
                // SVG文件特殊处理：使用默认头像
                const initials = originalGroupName.charAt(0).toUpperCase();
                avatarHtml = `<span class="group-avatar">${initials}</span>`;
            } else {
                const fullAvatarUrl = `${SERVER_URL}${groupAvatarUrl}`;
                avatarHtml = `<span class="group-avatar"><img src="${fullAvatarUrl}" alt="${originalGroupName}"></span>`;
            }
        } else {
            // 没有头像时显示默认头像（群组名称首字母）
            const initials = originalGroupName.charAt(0).toUpperCase();
            avatarHtml = `<span class="group-avatar">${initials}</span>`;
        }
        
        // 创建群组名称元素，使用textContent避免HTML转义
        const groupNameSpan = document.createElement('span');
        groupNameSpan.className = 'group-name';
        groupNameSpan.textContent = originalGroupName;
        
        // 创建群组项内容
        li.innerHTML = `
            ${avatarHtml}
            ${groupNameSpan.outerHTML}
            <div class="unread-count group-unread-count"></div>
        `;
        
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
        
        // 添加右键菜单事件
        li.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            const groupId = this.getAttribute('data-group-id');
            const groupName = this.getAttribute('data-group-name');
            showContextMenu(e, groupId, groupName);
        });
        
        // 更新免打扰图标
        updateGroupMuteIcon(li, group.id);
        
        groupList.appendChild(li);
    });
    
    // 更新未读计数显示
    updateUnreadCountsDisplay();
    
    // 如果有当前选中的群组，确保群组聊天界面显示
    if (currentGroupId) {
        const groupEmptyState = document.getElementById('groupEmptyState');
        const groupChatInterface = document.getElementById('groupChatInterface');
        const currentGroupNameElement = document.getElementById('currentGroupName');
        
        if (groupEmptyState) {
            groupEmptyState.style.display = 'none';
        }
        if (groupChatInterface) {
            groupChatInterface.style.display = 'flex';
            groupChatInterface.style.flexDirection = 'column';
        }
        if (currentGroupNameElement) {
            currentGroupNameElement.textContent = currentGroupName;
        }
    }
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
            // 标记为历史消息
            message.isHistory = true;
            displayGroupMessage(message);
        });
                    // 历史消息加载完成后，强制滚动到底部
                    setTimeout(() => {
                        groupMessageContainer.scrollTop = groupMessageContainer.scrollHeight;
                    }, 0);
                }
            }
        })
        .catch(error => {
        });
    }
    
    // 显示缓存的消息并清空缓存
    const groupIdStr = String(groupId);
    if (groupMessageCache[groupIdStr] && groupMessageCache[groupIdStr].length > 0) {
        // 延迟显示缓存的消息，确保DOM已经更新
        setTimeout(() => {
            const container = document.getElementById('groupMessageContainer');
            if (container) {
                // 显示缓存的消息
                groupMessageCache[groupIdStr].forEach(message => {
                    // 检查消息是否已经存在，避免重复渲染
                    if (!document.querySelector(`#groupMessageContainer [data-id="${message.id}"]`)) {
                        displayGroupMessage(message);
                    }
                });
                // 清空缓存
                groupMessageCache[groupIdStr] = [];
            }
        }, 500);
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
                    // 明确设置display为none，确保非活动聊天内容被隐藏
                    content.style.display = 'none';
                });
                
                item.classList.add('active');
                
                const targetSecondaryContent = document.querySelector(`.secondary-content[data-content="${targetSection}"]`);
                if (targetSecondaryContent) {
                    targetSecondaryContent.classList.add('active');
                }
                
                const targetChatContent = document.querySelector(`.chat-content[data-content="${targetSection}"]`);
                if (targetChatContent) {
                    targetChatContent.classList.add('active');
                    // 明确设置display为flex，确保目标聊天内容显示
                    targetChatContent.style.display = 'flex';
                    // 切换后调整布局
                    adjustChatLayout();
                }
                
                // 根据目标页面类型控制Markdown工具栏的显示
                const markdownToolbar = document.getElementById('markdownToolbar');
                const toggleMarkdownToolbarBtn = document.getElementById('toggleMarkdownToolbar');
                const toggleGroupMarkdownToolbarBtn = document.getElementById('toggleGroupMarkdownToolbar');
                
                // 公共聊天工具栏只在公共聊天界面显示
                if (markdownToolbar) {
                    if (targetSection === 'public-chat') {
                        // 公共聊天页面，保持工具栏的显示状态
                        // 不改变工具栏的display状态，保持用户之前的选择
                    } else {
                        // 非公共聊天页面，隐藏公共工具栏
                        markdownToolbar.style.display = 'none';
                    }
                }
                
                // 显示/隐藏相应的切换按钮，并更新按钮文本
                if (toggleMarkdownToolbarBtn) {
                    if (targetSection === 'public-chat') {
                        toggleMarkdownToolbarBtn.style.display = 'inline-block';
                        // 根据工具栏的显示状态更新按钮文本
                        if (markdownToolbar) {
                            if (markdownToolbar.style.display === 'none') {
                                toggleMarkdownToolbarBtn.innerHTML = '<i class="fas fa-chevron-down"></i> MD';
                            } else {
                                toggleMarkdownToolbarBtn.innerHTML = '<i class="fas fa-chevron-up"></i> 隐藏Markdown工具栏';
                            }
                        }
                    } else {
                        toggleMarkdownToolbarBtn.style.display = 'none';
                    }
                }
                
                if (toggleGroupMarkdownToolbarBtn) {
                    toggleGroupMarkdownToolbarBtn.style.display = targetSection === 'group-chat' ? 'inline-block' : 'none';
                }
                
                // 当切换到主聊天室时，更新当前活动聊天室并清除未读计数
                if (targetSection === 'public-chat') {
                    setActiveChat('main');
                    // 不再重置当前群组信息，以便切换回群组聊天时能恢复
                } else if (targetSection === 'group-chat') {
                    // 切换到群组聊天页面时，刷新群组列表
                    loadGroupList();
                    
                    // 如果当前有选中的群组，立即更新currentActiveChat
                    // 这样在loadGroupList异步完成之前，新消息就能正常显示
                    if (currentGroupId) {
                        setActiveChat('group', currentGroupId);
                    }
                    
                    // 立即恢复当前群组选择状态，因为loadGroupList是异步的，需要在回调中处理
                    const originalLoadGroupList = window.loadGroupList;
                    window.loadGroupList = function() {
                        // 调用原始的loadGroupList函数
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
                                
                                // 恢复之前选择的群组状态
                                if (currentGroupId) {
                                    // 确保currentActiveChat正确设置
                                    setActiveChat('group', currentGroupId);
                                    
                                    // 注意：不再为群组添加active类
                                    // 高亮显示当前选择的群组项
                                    // const groupItems = document.querySelectorAll('#groupList li[data-group-id]');
                                    // groupItems.forEach(item => {
                                    //     if (item.getAttribute('data-group-id') === currentGroupId) {
                                    //         item.classList.add('active');
                                    //     } else {
                                    //         item.classList.remove('active');
                                    //     }
                                    // });
                                    
                                    // 确保群组聊天界面显示，并加载聊天记录
                                    const groupEmptyState = document.getElementById('groupEmptyState');
                                    const groupChatInterface = document.getElementById('groupChatInterface');
                                    const currentGroupNameElement = document.getElementById('currentGroupName');
                                    
                                    if (groupEmptyState) {
                                        groupEmptyState.style.display = 'none';
                                    }
                                    if (groupChatInterface) {
                                        groupChatInterface.style.display = 'flex';
                                        groupChatInterface.style.flexDirection = 'column';
                                    }
                                    if (currentGroupNameElement) {
                                        currentGroupNameElement.textContent = currentGroupName;
                                    }
                                    
                                    // 加载群组聊天记录
                                    loadGroupMessages(currentGroupId);
                                }
                            }
                        })
                        .catch(error => {
                            const groupList = document.getElementById('groupList');
                            if (groupList) {
                                groupList.innerHTML = '<li>加载失败: 网络错误</li>';
                            }
                        });
                    };
                    
                    // 调用重写后的loadGroupList函数
                    loadGroupList();
                    
                    // 恢复原始的loadGroupList函数
                    setTimeout(() => {
                        window.loadGroupList = originalLoadGroupList;
                    }, 1000);
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
    const privateMessageContainer = document.getElementById('privateMessageContainer');
    
    // 初始化加载状态标志
    window.isLoadingMoreMessages = false;
    window.loadingIndicatorTimeout = null;
    
    // 检查是否滚动到底部的辅助函数
    function isScrolledToBottom(container) {
        const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        return distanceToBottom < 10; // 10px的阈值
    }
    
    // 滚动事件处理函数
    function handleScroll(e, container, isGroup, isPrivate = false) {
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
                        window.chatSocket.emit('get-group-chat-history', joinGroupData);
                    } else if (isPrivate && currentPrivateChatUserId) {
                        // 加载私信消息
                        const historyOptions = {
                            userId: currentUser.id,
                            friendId: currentPrivateChatUserId,
                            sessionToken: currentSessionToken,
                            limit: 20,
                            loadMore: true,
                            olderThan: olderThan
                        };
                        window.chatSocket.emit('get-private-chat-history', historyOptions);
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
    
    // 为全局消息容器添加滚动事件监听
    if (messageContainer) {
        messageContainer.addEventListener('scroll', function(e) {
            handleScroll(e, this, false);
        });
    }
    
    // 为群组消息容器添加滚动事件监听
    if (groupMessageContainer) {
        groupMessageContainer.addEventListener('scroll', function(e) {
            handleScroll(e, this, true);
        });
    }
    
    // 为私信消息容器添加滚动事件监听
    if (privateMessageContainer) {
        privateMessageContainer.addEventListener('scroll', function(e) {
            handleScroll(e, this, false, true);
        });
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

// 图片预览功能
function openImagePreview(imageUrl) {
    const modal = document.getElementById('imagePreviewModal');
    const imgElement = document.getElementById('previewImgElement');
    const closeBtn = document.getElementById('closeImagePreviewModal');
    
    if (modal && imgElement) {
        imgElement.src = imageUrl;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    
    // 关闭按钮事件
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            if (modal) {
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
        });
    }
}

// 头像预览功能
function openAvatarPreview(avatarUrl) {
    const modal = document.getElementById('avatarPreviewModal');
    const imgElement = document.getElementById('previewAvatarElement');
    const closeBtn = document.getElementById('closeAvatarPreviewModal');
    
    if (modal && imgElement) {
        imgElement.src = avatarUrl;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    
    // 关闭按钮事件
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            if (modal) {
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
        });
    }
}

// 为所有图片添加点击事件
function addImageClickEvents() {
    const images = document.querySelectorAll('.message-image');
    images.forEach(img => {
        if (!img.hasAttribute('data-click-added')) {
            img.addEventListener('click', function() {
                const src = this.getAttribute('src');
                if (src) {
                    openImagePreview(src);
                }
            });
            img.setAttribute('data-click-added', 'true');
        }
    });
}

// 为所有用户头像添加点击事件
function addAvatarClickEvents() {
    // 为所有带有user-avatar类的元素添加点击事件
    const avatars = document.querySelectorAll('.user-avatar');
    avatars.forEach(avatar => {
        if (!avatar.hasAttribute('data-click-added')) {
            avatar.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // 查找对应的用户ID
                let userId;
                
                // 检查父元素是否有data-user-id属性
                if (this.closest('[data-user-id]')) {
                    userId = this.closest('[data-user-id]').getAttribute('data-user-id');
                }
                // 检查是否是在线用户列表中的头像
                else if (this.closest('.user-item')) {
                    userId = this.closest('.user-item').getAttribute('data-user-id');
                }
                // 检查是否是消息中的头像
                else if (this.closest('.message-item')) {
                    userId = this.closest('.message-item').getAttribute('data-user-id');
                }
                // 检查是否是搜索结果中的头像
                else if (this.closest('.search-result-item')) {
                    userId = this.closest('.search-result-item').querySelector('.add-friend-btn')?.getAttribute('data-user-id');
                }
                
                if (userId) {
                    // 查找对应的用户昵称
                    let nickname = '';
                    
                    // 检查父元素是否有data-user-nickname属性
                    const parentWithId = this.closest('[data-user-id]');
                    if (parentWithId) {
                        if (parentWithId.hasAttribute('data-user-nickname')) {
                            nickname = parentWithId.getAttribute('data-user-nickname');
                        } else {
                            const nameElement = parentWithId.querySelector('.friend-name, .user-name, .message-nickname');
                            if (nameElement) {
                                nickname = nameElement.textContent;
                            }
                        }
                    } else if (this.closest('.user-item')) {
                        const userItem = this.closest('.user-item');
                        const nameElement = userItem.querySelector('.user-name');
                        if (nameElement) {
                            nickname = nameElement.textContent;
                        }
                    } else if (this.closest('.message-item')) {
                        const messageItem = this.closest('.message-item');
                        const nameElement = messageItem.querySelector('.message-nickname');
                        if (nameElement) {
                            nickname = nameElement.textContent;
                        }
                    }
                    
                    // 显示用户头像小弹窗
                    showUserAvatarPopup(e, { id: userId, nickname: nickname });
                }
            });
            avatar.setAttribute('data-click-added', 'true');
        }
    });
    
    // 为所有用户头像图片添加点击事件
    const avatarImages = document.querySelectorAll('.user-avatar-img');
    avatarImages.forEach(img => {
        if (!img.hasAttribute('data-click-added')) {
            img.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // 查找对应的用户ID
                let userId;
                
                // 检查父元素是否有data-user-id属性
                if (this.closest('[data-user-id]')) {
                    userId = this.closest('[data-user-id]').getAttribute('data-user-id');
                }
                // 检查是否是当前用户头像
                else if (this.id === 'currentUserAvatar') {
                    // 不处理当前用户头像点击
                    return;
                }
                
                if (userId) {
                    // 查找对应的用户昵称
                    let nickname = '';
                    
                    // 检查父元素是否有data-user-nickname属性
                    const parentWithId = this.closest('[data-user-id]');
                    if (parentWithId) {
                        if (parentWithId.hasAttribute('data-user-nickname')) {
                            nickname = parentWithId.getAttribute('data-user-nickname');
                        } else {
                            const nameElement = parentWithId.querySelector('.friend-name, .user-name, .message-nickname');
                            if (nameElement) {
                                nickname = nameElement.textContent;
                            }
                        }
                    }
                    
                    // 显示用户头像小弹窗
                    showUserAvatarPopup(e, { id: userId, nickname: nickname });
                }
            });
            img.setAttribute('data-click-added', 'true');
        }
    });
}

// 添加事件委托，为动态生成的图片和头像添加事件
function setupEventDelegation() {
    // 为消息容器添加事件委托，处理图片点击
    const messageContainer = document.getElementById('messageContainer');
    const groupMessageContainer = document.getElementById('groupMessageContainer');
    const privateMessageContainer = document.getElementById('privateMessageContainer');
    
    // 处理头像点击的通用函数
    function handleAvatarClick(e) {
        // 查找对应的用户ID
        let userId;
        let nickname = '';
        const messageElement = e.target.closest('.message-item');
        
        if (messageElement) {
            userId = messageElement.getAttribute('data-user-id');
            // 查找消息中的用户昵称
            const nameElement = messageElement.querySelector('.message-nickname');
            if (nameElement) {
                nickname = nameElement.textContent;
            }
        } else {
            const userElement = e.target.closest('[data-user-id]');
            if (userElement) {
                userId = userElement.getAttribute('data-user-id');
                // 查找用户元素中的昵称
                if (userElement.hasAttribute('data-user-nickname')) {
                    nickname = userElement.getAttribute('data-user-nickname');
                } else {
                    const nameElement = userElement.querySelector('.friend-name, .user-name, .message-nickname');
                    if (nameElement) {
                        nickname = nameElement.textContent;
                    }
                }
            }
        }
        
        if (userId) {
            // 显示用户头像小弹窗
            showUserAvatarPopup(e, { id: userId, nickname: nickname });
        }
    }
    
    // 公共聊天消息容器
    if (messageContainer) {
        messageContainer.addEventListener('click', function(e) {
            // 图片点击
            if (e.target.classList.contains('message-image')) {
                const src = e.target.getAttribute('src');
                if (src) {
                    openImagePreview(src);
                }
            }
            // 头像点击
            else if (e.target.classList.contains('user-avatar') || (e.target.tagName === 'IMG' && e.target.parentElement.classList.contains('user-avatar'))) {
                handleAvatarClick(e);
            }
        });
    }
    
    // 群组聊天消息容器
    if (groupMessageContainer) {
        groupMessageContainer.addEventListener('click', function(e) {
            // 图片点击
            if (e.target.classList.contains('message-image')) {
                const src = e.target.getAttribute('src');
                if (src) {
                    openImagePreview(src);
                }
            }
            // 头像点击
            else if (e.target.classList.contains('user-avatar') || (e.target.tagName === 'IMG' && e.target.parentElement.classList.contains('user-avatar'))) {
                handleAvatarClick(e);
            }
        });
    }
    
    // 私信聊天消息容器
    if (privateMessageContainer) {
        privateMessageContainer.addEventListener('click', function(e) {
            // 图片点击
            if (e.target.classList.contains('message-image')) {
                const src = e.target.getAttribute('src');
                if (src) {
                    openImagePreview(src);
                }
            }
            // 头像点击
            else if (e.target.classList.contains('user-avatar') || (e.target.tagName === 'IMG' && e.target.parentElement.classList.contains('user-avatar'))) {
                handleAvatarClick(e);
            }
        });
    }
    
    // 在线用户列表容器
    const userList = document.getElementById('userList');
    if (userList) {
        userList.addEventListener('click', function(e) {
            // 头像点击 - 检查点击的是否是头像图片或包含头像图片的元素
            if (e.target.classList.contains('user-avatar') || (e.target.tagName === 'IMG' && e.target.parentElement.classList.contains('user-avatar'))) {
                handleAvatarClick(e);
            }
        });
    }
    
    // 离线用户列表容器
    const offlineUserList = document.getElementById('offlineUserList');
    if (offlineUserList) {
        offlineUserList.addEventListener('click', function(e) {
            // 头像点击 - 检查点击的是否是头像图片或包含头像图片的元素
            if (e.target.classList.contains('user-avatar') || (e.target.tagName === 'IMG' && e.target.parentElement.classList.contains('user-avatar'))) {
                handleAvatarClick(e);
            }
        });
    }
    
    // 好友列表容器
    const friendsList = document.getElementById('friendsList');
    if (friendsList) {
        friendsList.addEventListener('click', function(e) {
            // 头像点击 - 检查点击的是否是头像图片或包含头像图片的元素
            if ((e.target.classList.contains('user-avatar') || (e.target.tagName === 'IMG' && e.target.parentElement.classList.contains('user-avatar'))) && !e.target.closest('.friend-item')) {
                handleAvatarClick(e);
            }
        });
    }
}

// 为群组头像添加点击事件
function addGroupAvatarClickEvents() {
    // 为群组列表中的头像添加点击事件
    const groupList = document.getElementById('groupList');
    if (groupList) {
        groupList.addEventListener('click', function(e) {
            if (e.target.closest('.group-avatar')) {
                const groupAvatar = e.target.closest('.group-avatar');
                const img = groupAvatar.querySelector('img');
                if (img && img.src) {
                    openImagePreview(img.src);
                }
            }
        });
    }
    
    // 为模态框中的群组头像添加点击事件
    const modal = document.getElementById('groupInfoModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target.closest('#modalGroupAvatarValue')) {
                const avatarContainer = e.target.closest('#modalGroupAvatarValue');
                const img = avatarContainer.querySelector('img');
                if (img && img.src) {
                    openImagePreview(img.src);
                }
            }
        });
    }
}
document.addEventListener('DOMContentLoaded', function() {
    // 页面加载完成后执行的初始化
    window.addEventListener('load', function() {
        // 设置事件委托
        setupEventDelegation();
        // 为已存在的图片和头像添加事件
        addImageClickEvents();
        addAvatarClickEvents();
        addGroupAvatarClickEvents();
    });
});