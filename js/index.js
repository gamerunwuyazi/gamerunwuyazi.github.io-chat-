document.addEventListener('DOMContentLoaded', function() {
    const SERVER_URL = 'http://152.136.175.209:3000';

    // 初始化变量
    let currentUser = null;
    let currentSessionToken = null;
    let isConnected = false;
    let isSidebarCollapsed = false;
    let hasReceivedHistory = false;
    let onlineUsersList = [];
    let autoScrollEnabled = true;
    let allUsers = [];
    let currentGroupId = null;
    let currentGroupName = '';
    let markdownEnabled = false;
    let groupMarkdownEnabled = false;
    let lastMessageUpdate = 0;
    let autoRefreshInterval = null;
    let isPageVisible = true;

    // 获取DOM元素
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const messageContainer = document.getElementById('messageContainer');
    const emptyState = document.getElementById('emptyState');
    const connectionStatus = document.getElementById('connectionStatus');
    const authModal = document.getElementById('authModal');
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const loginButton = document.getElementById('loginButton');
    const loginMessage = document.getElementById('loginMessage');
    const registerUsername = document.getElementById('registerUsername');
    const registerPassword = document.getElementById('registerPassword');
    const registerNickname = document.getElementById('registerNickname');
    const registerButton = document.getElementById('registerButton');
    const registerMessage = document.getElementById('registerMessage');
    const nicknameModal = document.getElementById('nicknameModal');
    const nicknameInput = document.getElementById('nicknameInput');
    const saveNicknameBtn = document.getElementById('saveNickname');
    const changeNicknameBtn = document.getElementById('changeNickname');
    const changeAvatarBtn = document.getElementById('changeAvatar');
    const logoutButton = document.getElementById('logoutButton');
    const currentNicknameSpan = document.getElementById('currentNickname');
    const currentAvatarImg = document.getElementById('currentAvatar');
    const userList = document.getElementById('userList');
    const offlineUserList = document.getElementById('offlineUserList');
    const groupList = document.getElementById('groupList');
    const onlineCount = document.getElementById('onlineCount');
    const totalOnlineCount = document.getElementById('totalOnlineCount');
    const messageCount = document.getElementById('messageCount');
    const storageStatus = document.getElementById('storageStatus');
    const uploadButton = document.getElementById('uploadButton');
    const fileInput = document.getElementById('fileInput');
    const imageUploadButton = document.getElementById('imageUploadButton');
    const imageInput = document.getElementById('imageInput');
    const uploadProgress = document.getElementById('uploadProgress');
    const uploadProgressBar = document.getElementById('uploadProgressBar');
    const sidebar = document.getElementById('sidebar');
    const toggleSidebarBtn = document.getElementById('toggleSidebar');
    const toggleSidebarText = document.querySelector('.toggle-sidebar-text');
    const imagePreviewModal = document.getElementById('imagePreviewModal');
    const previewImgElement = document.getElementById('previewImgElement');
    const closePreviewBtn = document.querySelector('.close-preview');
    const avatarModal = document.getElementById('avatarModal');
    const avatarInput = document.getElementById('avatarInput');
    const avatarPreview = document.getElementById('avatarPreview');
    const uploadAvatarButton = document.getElementById('uploadAvatarButton');
    const avatarMessage = document.getElementById('avatarMessage');
    const createGroupBtn = document.getElementById('createGroup');
    const createGroupModal = document.getElementById('createGroupModal');
    const groupNameInput = document.getElementById('groupNameInput');
    const groupDescriptionInput = document.getElementById('groupDescriptionInput');
    const groupMembersList = document.getElementById('groupMembersList');
    const createGroupButton = document.getElementById('createGroupButton');
    const createGroupMessage = document.getElementById('createGroupMessage');

    // 添加成员模态框相关元素
    const addGroupMemberModal = document.getElementById('addGroupMemberModal');
    const availableMembersList = document.getElementById('availableMembersList');
    const confirmAddMembersButton = document.getElementById('confirmAddMembersButton');
    const addMembersMessage = document.getElementById('addMembersMessage');
    const addMemberBtn = document.getElementById('addMemberBtn');
    const mainChat = document.getElementById('mainChat');
    const groupChat = document.getElementById('groupChat');
    const backToMainBtn = document.getElementById('backToMain');
    const manageGroupBtn = document.getElementById('manageGroupBtn');
    const groupImageUploadButton = document.getElementById('groupImageUploadButton');
    const groupImageInput = document.getElementById('groupImageInput');

    const groupTitle = document.getElementById('groupTitle');
    const groupMessageContainer = document.getElementById('groupMessageContainer');
    const groupMessageInput = document.getElementById('groupMessageInput');
    const sendGroupMessageBtn = document.getElementById('sendGroupMessage');
    const groupUploadButton = document.getElementById('groupUploadButton');
    const groupFileInput = document.getElementById('groupFileInput');
    const groupMemberList = document.getElementById('groupMemberList');
    const markdownToolbar = document.getElementById('markdownToolbar');
    const groupMarkdownToolbar = document.getElementById('groupMarkdownToolbar');
    const markdownToggle = document.getElementById('markdownToggle');
    const groupMarkdownToggle = document.getElementById('groupMarkdownToggle');

    // 简化的HTML处理函数 - 保留引号内的内容不转义
    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        // 首先移除控制字符
        let safeString = String(unsafe).replace(/[\x00-\x1F\x7F-\x9F]/g, '');

        // 针对URL的特殊处理 - 不转义URL中的特殊字符
        if (/\b(?:https?|ftp):\/\/[\-A-Z0-9+&@#\/%?=~_|!:,.;]*[\-A-Z0-9+&@#\/%=~_|]/i.test(safeString)) {
            return safeString; // 对于URL，保持原样
        }

        // 只对HTML标签进行必要的转义，保留其他内容
        return safeString
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    // 增强XSS防护：更安全的Markdown解析函数 - 修复HTML内容显示问题
    window.safeMarkdownParse = function safeMarkdownParse(content) {
        if (!content) return '';

        // 不再先对内容进行HTML转义，因为marked已经有sanitize选项
        // 使用marked解析原始内容
        if (typeof marked !== 'undefined') {
            try {
                // 创建自定义的渲染器以增强安全性
                const renderer = new marked.Renderer();

                // 覆盖链接渲染以增强安全性 - 修复空URL导致的解析错误
                const linkRenderer = renderer.link;
                renderer.link = function(href, title, text) {
                    try {
                        // 确保href、title和text是字符串
                        href = typeof href === 'string' ? href : '';
                        title = typeof title === 'string' ? title : '';
                        text = typeof text === 'string' ? text : '';

                        // 验证URL安全性
                        const cleanHref = validateUrl(href);
                        const cleanTitle = title ? escapeHtml(title) : '';
                        const cleanText = escapeHtml(text);

                        // 如果URL无效，返回纯文本而不是链接
                        if (!cleanHref) {
                            return cleanText;
                        }

                        return linkRenderer.call(this, cleanHref, cleanTitle, cleanText);
                    } catch (error) {
                        // 捕获任何错误并返回转义后的文本
                        console.error('链接渲染错误:', error);
                        return escapeHtml(typeof text === 'string' ? text : '');
                    }
                };

                // 增强图片渲染功能 - 支持更多图片Markdown语法特性
                const imageRenderer = renderer.image;
                renderer.image = function(href, title, text) {
                    try {
                        // 确保href、title和text是字符串
                        href = typeof href === 'string' ? href : '';
                        title = typeof title === 'string' ? title : '';
                        text = typeof text === 'string' ? text : '';

                        // 验证图片URL安全性
                        const cleanHref = validateUrl(href);
                        const cleanTitle = title ? escapeHtml(title) : '';
                        const cleanText = escapeHtml(text);

                        // 如果URL无效，返回纯文本而不是图片
                        if (!cleanHref) {
                            return `[图片: ${cleanText}]`;
                        }

                        // 解析图片大小参数 (![alt](url =WIDTHxHEIGHT))
                        let sizeParams = '';
                        const sizeRegex = /\s*=\s*(\d+)(?:x(\d+))?\s*$/;
                        const sizeMatch = cleanText.match(sizeRegex);
                        
                        if (sizeMatch) {
                            // 提取宽度和高度
                            const width = sizeMatch[1];
                            const height = sizeMatch[2] || '';
                            
                            // 构建大小参数
                            if (width) {
                                sizeParams = `width="${width}"`;
                                if (height) {
                                    sizeParams += ` height="${height}"`;
                                }
                            }
                            
                            // 移除大小参数，保留原始alt文本
                            const cleanAltText = cleanText.replace(sizeRegex, '');
                            
                            // 使用自定义的图片渲染，添加点击预览功能
                            return `<img src="${cleanHref}" alt="${cleanAltText}" title="${cleanTitle}" class="message-image" ${sizeParams} onclick="openImagePreview('${cleanHref}')">`;
                        } else {
                            // 默认图片渲染，添加点击预览功能
                            return `<img src="${cleanHref}" alt="${cleanText}" title="${cleanTitle}" class="message-image" onclick="openImagePreview('${cleanHref}')">`;
                        }
                    } catch (error) {
                        // 捕获任何错误并返回转义后的文本
                        console.error('图片渲染错误:', error);
                        return escapeHtml(typeof text === 'string' ? `[图片: ${text}]` : '[图片]');
                    }
                };

                marked.setOptions({
                    sanitize: false, // 关闭自动清理，因为我们有自定义的安全措施
                    breaks: true,
                    gfm: true,
                    renderer: renderer
                });

                // 直接解析原始内容
                let parsedContent = marked.parse(content);

                // 移除可能的危险属性
                parsedContent = removeDangerousAttributes(parsedContent);
                return parsedContent;
            } catch (error) {
                console.error('Markdown解析错误:', error);
                // 如果解析失败，返回转义后的内容
                return escapeHtml(content);
            }
        }

        // 如果marked库不可用，返回转义后的内容
        return escapeHtml(content);
    }

    // 验证URL安全性 - 全面支持各种格式的URL
    function validateUrl(url) {
        if (!url || typeof url !== 'string') return '';
    }
    
    // 图片预览功能
    window.openImagePreview = function(imageUrl) {
        // 检查是否已存在预览容器
        let previewContainer = document.getElementById('image-preview-container');
        
        if (!previewContainer) {
            // 创建预览容器
            previewContainer = document.createElement('div');
            previewContainer.id = 'image-preview-container';
            previewContainer.style.position = 'fixed';
            previewContainer.style.top = '0';
            previewContainer.style.left = '0';
            previewContainer.style.width = '100%';
            previewContainer.style.height = '100%';
            previewContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
            previewContainer.style.display = 'flex';
            previewContainer.style.justifyContent = 'center';
            previewContainer.style.alignItems = 'center';
            previewContainer.style.zIndex = '9999';
            previewContainer.style.cursor = 'pointer';
            previewContainer.style.flexDirection = 'column';
            previewContainer.style.padding = '20px';
            
            // 创建关闭按钮
            const closeButton = document.createElement('button');
            closeButton.innerText = '关闭';
            closeButton.style.position = 'absolute';
            closeButton.style.top = '20px';
            closeButton.style.right = '20px';
            closeButton.style.padding = '10px 20px';
            closeButton.style.backgroundColor = '#fff';
            closeButton.style.color = '#000';
            closeButton.style.border = 'none';
            closeButton.style.borderRadius = '5px';
            closeButton.style.cursor = 'pointer';
            closeButton.style.zIndex = '10';
            
            // 创建图片元素
            const previewImage = document.createElement('img');
            previewImage.id = 'preview-image';
            previewImage.style.maxWidth = '100%';
            previewImage.style.maxHeight = '80vh';
            previewImage.style.objectFit = 'contain';
            
            // 构建预览容器
            previewContainer.appendChild(closeButton);
            previewContainer.appendChild(previewImage);
            
            // 添加到文档
            document.body.appendChild(previewContainer);
            
            // 点击关闭按钮关闭预览
            closeButton.addEventListener('click', function(e) {
                e.stopPropagation();
                previewContainer.style.display = 'none';
            });
            
            // 点击容器关闭预览
            previewContainer.addEventListener('click', function() {
                previewContainer.style.display = 'none';
            });
            
            // 点击图片阻止冒泡
            previewImage.addEventListener('click', function(e) {
                e.stopPropagation();
            });
        }
        
        // 设置图片URL
        const previewImage = document.getElementById('preview-image');
        previewImage.src = imageUrl;
        
        // 显示预览容器
        previewContainer.style.display = 'flex';
    }    
    
    // 重新定义validateUrl函数（之前被截断了）
    function validateUrl(url) {
        if (!url || typeof url !== 'string') return '';

        // 尝试直接解析URL
        try {
            let parsedUrl = new URL(url);
            // 只允许安全的协议
            const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
            if (safeProtocols.includes(parsedUrl.protocol)) {
                return url;
            }
        } catch (e) {
            // URL解析失败，继续处理
        }

        // 检查是否是纯URL格式（没有协议前缀）
        // 更宽松的URL匹配正则表达式，支持各种格式的URL
        const urlPattern = /^(?:(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9.]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+)(?:[:/][^\s]*)?$/;

        // 如果匹配URL格式，添加http://协议再试一次
        if (urlPattern.test(url)) {
            try {
                const urlWithProtocol = 'http://' + url;
                new URL(urlWithProtocol); // 验证添加协议后是否有效
                return urlWithProtocol;
            } catch (e2) {
                // 仍然无效，继续尝试其他格式
            }
        }

        // 尝试匹配IP地址格式的URL
        const ipPattern = /^(?:(?:\d{1,3}\.){3}\d{1,3})(?:[:/][^\s]*)?$/;
        if (ipPattern.test(url)) {
            try {
                const urlWithProtocol = 'http://' + url;
                new URL(urlWithProtocol);
                return urlWithProtocol;
            } catch (e3) {
                // 仍然无效
            }
        }

        // 对于Markdown链接中的URL，即使格式不完全标准也尝试返回
        // 这是最后的尝试，确保大多数链接都能正常显示
        if (url.includes('.') && !url.includes(' ') && url.length > 3) {
            try {
                const urlWithProtocol = url.startsWith('//') ? 'http:' + url :
                    url.includes('://') ? url : 'http://' + url;
                new URL(urlWithProtocol);
                return urlWithProtocol;
            } catch (e4) {
                // 如果所有尝试都失败，返回原始URL（作为最后的手段）
                console.log('URL验证失败，但仍尝试返回:', url);
                return url; // 最后手段：即使验证失败也返回URL
            }
        }

        return url; // 最宽松的处理：返回原始URL，让前端决定如何显示
    }

    // 移除HTML中的危险属性
    function removeDangerousAttributes(html) {
        if (!html) return '';

        // 创建临时DOM元素用于处理
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // 定义危险属性列表 - 只包含事件处理器等真正危险的属性
        const dangerousAttributes = [
            'on*', 'action', 'formaction',
            'xlink:href', 'background', 'dynsrc', 'lowsrc'
        ];

        // 递归处理所有元素
        function processElement(element) {
            const attributes = Array.from(element.attributes);
            attributes.forEach(attr => {
                const attrName = attr.name.toLowerCase();
                // 检查是否是危险属性
                const isDangerous = dangerousAttributes.some(dangerousAttr => {
                    return dangerousAttr === attrName ||
                        (dangerousAttr.includes('*') && attrName.startsWith(dangerousAttr.replace('*', '')));
                });

                if (isDangerous) {
                    // 移除危险属性
                    element.removeAttribute(attrName);
                }
            });

            // 递归处理子元素
            Array.from(element.children).forEach(processElement);
        }

        Array.from(tempDiv.children).forEach(processElement);

        return tempDiv.innerHTML;
    }

    // 修复3：安全的DOM操作函数
    function safeSetInnerHTML(element, html) {
        if (!element || !(element instanceof Element)) return;
        element.innerHTML = html;
    }

    function safeSetTextContent(element, text) {
        if (!element || !(element instanceof Element)) return;
        element.textContent = text !== null && text !== undefined ? String(text) : '';
    }



    // 检查会话有效性
    function checkSessionValidity() {
        fetch(`${SERVER_URL}/session-check`, {
            method: 'GET',
            headers: {
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            }
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('会话已过期');
                }
                return response.json();
            })
            .then(data => {
                if (!data.valid) {
                    // 会话无效，自动引导用户重新登录
                    console.log('会话已过期，引导用户重新登录');
                    showReLoginPrompt();
                }
            })
            .catch(error => {
                console.error('会话检查失败:', error);
                // 网络错误也引导用户重新登录
                showReLoginPrompt();
            });
    }

    // 显示重新登录提示
    function showReLoginPrompt() {
        if (confirm('您的会话已过期，请重新登录以继续使用聊天功能。\n点击确定重新登录，取消将继续使用当前页面（可能无法发送消息）。')) {
            logout();
            authModal.style.display = 'flex';
            // 聚焦到登录表单
            loginUsername.focus();
        }
    }

    // 修复4：更新用户列表函数
    function updateUserList(users) {
        console.log('🔄 更新用户列表，数据:', users);

        if (!userList || !onlineCount) {
            console.error('用户列表元素未找到');
            return;
        }

        if (!users || !Array.isArray(users)) {
            console.error('用户数据无效:', users);
            userList.innerHTML = '<li>用户数据格式错误</li>';
            return;
        }

        onlineUsersList = users;

        userList.innerHTML = '';
        safeSetTextContent(onlineCount, `(${users.length})`);
        safeSetTextContent(totalOnlineCount, users.length.toString());

        if (users.length === 0) {
            userList.innerHTML = '<li>暂无在线用户</li>';
            return;
        }

        users.forEach(user => {
            const li = document.createElement('li');
            li.style.padding = '8px 0';
            li.style.borderBottom = '1px solid #f1f1f1';
            li.style.display = 'flex';
            li.style.alignItems = 'center';

            // 在线状态指示器 - 只保留一个
            const statusIndicator = document.createElement('span');
            statusIndicator.innerHTML = '●';
            statusIndicator.className = 'status-indicator online';

            // 用户头像 - 添加avatar_url兼容性处理和默认头像
            const avatarUrl = user.avatarUrl || user.avatar_url || null;
            let avatarHtml = '';
            if (avatarUrl) {
                avatarHtml = `<img src="${SERVER_URL}${avatarUrl}" class="user-avatar" style="width: 16px; height: 16px; margin-right: 5px; border-radius: 50%;">`;
            } else {
                // 使用安全的默认头像图标
                const firstChar = user.nickname && user.nickname.length > 0 ? user.nickname.charAt(0).toUpperCase() : 'U';
                avatarHtml = `<span class="default-avatar" style="display: inline-block; width: 16px; height: 16px; line-height: 16px; text-align: center; background-color: #ecf0f1; border-radius: 50%; margin-right: 5px; font-size: 10px;">${escapeHtml(firstChar)}</span>`;
            }

            // 用户信息
            const userInfo = document.createElement('span');
            const isCurrentUser = currentUser && user.id == currentUser.id;
            const displayName = isCurrentUser ? `${user.nickname} (我)` : user.nickname;

            // 确保不重复添加状态指示器
            userInfo.innerHTML = `${avatarHtml}${lightEscapeHtml(displayName)}`;
            if (isCurrentUser) {
                userInfo.style.fontWeight = 'bold';
            }

            li.appendChild(statusIndicator);
            li.appendChild(userInfo);
            userList.appendChild(li);
        });

        // 用户列表更新完成

        // 加载离线用户列表
        if (currentUser) {
            loadOfflineUsers();
        }
    }

    // 修复5：加载离线用户列表
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
                console.error('加载离线用户失败:', error);
            });
    }

    // 修复6：更新离线用户列表
    function updateOfflineUserList(users) {
        if (!offlineUserList) return;

        offlineUserList.innerHTML = '';

        const offlineUsers = users.filter(offlineUser =>
            !onlineUsersList.some(onlineUser => onlineUser.id == offlineUser.id)
        );

        if (offlineUsers.length === 0) {
            offlineUserList.innerHTML = '<li>暂无离线用户</li>';
            return;
        }

        offlineUsers.forEach(user => {
            const li = document.createElement('li');
            li.style.padding = '8px 0';
            li.style.borderBottom = '1px solid #f1f1f1';
            li.style.display = 'flex';
            li.style.alignItems = 'center';

            // 离线状态指示器
            const statusIndicator = document.createElement('span');
            statusIndicator.innerHTML = '●';
            statusIndicator.className = 'status-indicator offline';
            statusIndicator.style.marginRight = '8px';

            // 用户头像 - 增强兼容性处理和默认头像逻辑
            let avatarHtml = '';
            // 检查多种可能的头像URL字段名和值
            const avatarUrl = user.avatarUrl || user.avatar_url || null;

            // 增强的头像URL检查逻辑
            if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim() !== '') {
                // 确保URL格式正确，避免使用undefined或空字符串
                const fullAvatarUrl = `${SERVER_URL}${avatarUrl.trim()}`;
                avatarHtml = `<img src="${fullAvatarUrl}" class="user-avatar" style="width: 16px; height: 16px; margin-right: 5px; border-radius: 50%;">`;
            } else {
                // 使用默认头像图标
                avatarHtml = `<span class="default-avatar" style="display: inline-block; width: 16px; height: 16px; line-height: 16px; text-align: center; background-color: #ecf0f1; border-radius: 50%; margin-right: 5px; font-size: 10px;">${user.nickname.charAt(0).toUpperCase()}</span>`;
            }

            // 用户信息
            const userInfo = document.createElement('span');
            userInfo.innerHTML = `${avatarHtml}${lightEscapeHtml(user.nickname)} <span class="last-online">${formatDate(user.last_online)}</span>`;

            li.appendChild(statusIndicator);
            li.appendChild(userInfo);
            offlineUserList.appendChild(li);
        });
    }

    // 修复7：Markdown工具栏功能
    function initializeMarkdownToolbar() {
        // 主聊天室Markdown工具栏
        const markdownButtons = markdownToolbar.querySelectorAll('.markdown-btn');
        markdownButtons.forEach(button => {
            button.addEventListener('click', function() {
                const prefix = this.getAttribute('data-prefix') || '';
                const suffix = this.getAttribute('data-suffix') || '';
                const sample = this.getAttribute('data-sample') || '示例文本';

                insertMarkdownSyntax(messageInput, prefix, suffix, sample);
            });
        });

        // 群组聊天室Markdown工具栏
        const groupMarkdownButtons = groupMarkdownToolbar.querySelectorAll('.markdown-btn');
        groupMarkdownButtons.forEach(button => {
            button.addEventListener('click', function() {
                const prefix = this.getAttribute('data-prefix') || '';
                const suffix = this.getAttribute('data-suffix') || '';
                const sample = this.getAttribute('data-sample') || '示例文本';

                insertMarkdownSyntax(groupMessageInput, prefix, suffix, sample);
            });
        });

        // Markdown切换按钮
        markdownToggle.addEventListener('click', function() {
            markdownEnabled = !markdownEnabled;
            this.classList.toggle('active', markdownEnabled);
            markdownToolbar.classList.toggle('active', markdownEnabled);
        });

        groupMarkdownToggle.addEventListener('click', function() {
            groupMarkdownEnabled = !groupMarkdownEnabled;
            this.classList.toggle('active', groupMarkdownEnabled);
            groupMarkdownToolbar.classList.toggle('active', groupMarkdownEnabled);
        });
    }

    function startAutoRefresh() {
        // 停止之前的定时器
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }

        // 每30秒自动刷新消息
        autoRefreshInterval = setInterval(() => {
            if (isConnected && currentUser && isPageVisible) {
                refreshMessages();
            }
        }, 30000); // 30秒

        // 启动自动刷新，间隔30秒
    }

    function refreshMessages() {
        if (!currentUser || !currentSessionToken) {
            console.log('❌ 未登录，跳过刷新');
            return;
        }

        const isGroupChat = groupChat.style.display !== 'none';
        const targetGroupId = isGroupChat ? currentGroupId : null;

        console.log('🔄 刷新消息:', {
            isGroupChat: isGroupChat,
            groupId: targetGroupId,
            lastUpdate: lastMessageUpdate
        });

        fetch(`${SERVER_URL}/refresh-messages?groupId=${targetGroupId || ''}&lastUpdate=${lastMessageUpdate}`, {
            headers: {
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            }
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    // 刷新消息成功

                    // 更新最后更新时间
                    lastMessageUpdate = data.lastUpdate;

                    // 如果有新消息，更新显示
                    if (data.hasNewMessages && data.messages.length > 0) {
                        updateMessagesDisplay(data.messages, isGroupChat);
                    }
                } else {
                    console.error('❌ 刷新消息失败:', data.message);
                }
            })
            .catch(error => {
                console.error('❌ 刷新消息请求失败:', error);
            });
    }

    function updateMessagesDisplay(messages, isGroupChat) {
        const targetContainer = isGroupChat ? groupMessageContainer : messageContainer;
        const targetEmptyState = isGroupChat ? groupMessageContainer.querySelector('.empty-state') : emptyState;

        if (messages.length === 0) {
            if (targetEmptyState) {
                targetEmptyState.style.display = 'block';
            }
            return;
        }

        if (targetEmptyState) {
            targetEmptyState.style.display = 'none';
        }

        // 检查是否需要完全刷新
        const isInitialLoad = targetContainer.querySelectorAll('.message').length === 0;

        if (isInitialLoad) {
            // 首次加载时清空容器并添加所有消息
            targetContainer.innerHTML = '';
            messages.forEach(message => {
                const isOwn = currentUser && message.userId == currentUser.id;
                addMessageToContainer(message, isOwn, isGroupChat, targetContainer);
            });
        } else {
            // 刷新时，只添加新消息，不重新渲染所有消息
            // 获取当前已有的消息ID
            const existingMessageIds = new Set();
            targetContainer.querySelectorAll('.message').forEach(el => {
                existingMessageIds.add(el.getAttribute('data-message-id'));
            });

            // 只添加新消息
            const newMessages = messages.filter(msg => !existingMessageIds.has(msg.id.toString()));

            if (newMessages.length > 0) {
                // 记录当前滚动位置
                const wasScrolledToBottom = isScrolledToBottom(targetContainer);

                // 添加新消息
                newMessages.forEach(message => {
                    const isOwn = currentUser && message.userId == currentUser.id;
                    addMessageToContainer(message, isOwn, isGroupChat, targetContainer);
                });

                // 如果之前在底部，则保持在底部
                if (wasScrolledToBottom) {
                    scrollToBottom(targetContainer);
                }
            }
        }

        // 更新消息计数
        if (!isGroupChat && messageCount) {
            messageCount.textContent = `消息数量: ${messages.length}（向上滚动加载消息）`;
        }

        console.log(`✅ 更新消息显示: ${messages.length} 条消息`);
    }

    function insertMarkdownSyntax(textarea, prefix, suffix, sample) {
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);
        const textToInsert = selectedText || sample;

        const newText = prefix + textToInsert + suffix;
        textarea.value = textarea.value.substring(0, start) + newText + textarea.value.substring(end);

        // 设置光标位置
        const newCursorPos = start + prefix.length + textToInsert.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();

        // 自动调整高度
        autoResizeTextarea(textarea);
    }

    // 修复8：模态框事件绑定函数
    function initializeModalEvents() {
        console.log('初始化模态框事件');

        // 关闭按钮事件
        document.querySelectorAll('.close-modal').forEach(closeBtn => {
            closeBtn.addEventListener('click', function() {
                this.closest('.modal').style.display = 'none';
            });
        });

        // 移除模态框背景点击关闭功能，仅通过关闭按钮关闭模态框

        // 登录/注册标签切换
        loginTab.addEventListener('click', () => {
            loginTab.classList.add('active');
            registerTab.classList.remove('active');
            loginForm.classList.add('active');
            registerForm.classList.remove('active');
            loginMessage.style.display = 'none';
        });

        registerTab.addEventListener('click', () => {
            registerTab.classList.add('active');
            loginTab.classList.remove('active');
            registerForm.classList.add('active');
            loginForm.classList.remove('active');
            registerMessage.style.display = 'none';
        });

        // 修改昵称按钮
        changeNicknameBtn.addEventListener('click', showNicknameModal);

        // 保存昵称
        saveNicknameBtn.addEventListener('click', () => {
            const newNickname = nicknameInput.value.trim();
            if (newNickname && currentUser && currentSessionToken) {
                socket.emit('update-nickname', {
                    userId: currentUser.id,
                    newNickname: newNickname,
                    sessionToken: currentSessionToken
                });
                hideNicknameModal();
            }
        });

        // 更改头像按钮
        changeAvatarBtn.addEventListener('click', showAvatarModal);

        // 头像预览
        avatarInput.addEventListener('change', function(e) {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    avatarPreview.innerHTML = `<img src="${e.target.result}">`;
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });

        // 上传头像
        uploadAvatarButton.addEventListener('click', function() {
            const file = avatarInput.files[0];
            if (!file) {
                avatarMessage.textContent = '请选择头像文件';
                avatarMessage.style.color = 'red';
                return;
            }

            const formData = new FormData();
            formData.append('avatar', file);

            fetch(`${SERVER_URL}/upload-avatar`, {
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
                        currentUser.avatarUrl = data.avatarUrl;
                        currentAvatarImg.src = `${SERVER_URL}${data.avatarUrl}`;
                        currentAvatarImg.style.display = 'inline';

                        // 隐藏默认头像
                        const defaultAvatar = document.getElementById('defaultAvatar');
                        if (defaultAvatar) {
                            defaultAvatar.style.display = 'none';
                        }

                        localStorage.setItem('chatUserAvatar', data.avatarUrl);
                        avatarMessage.textContent = '头像上传成功';
                        avatarMessage.style.color = 'green';

                        // 通知服务器头像已更新，让服务器广播给所有客户端
                        if (isConnected && socket) {
                            socket.emit('avatar-updated', {
                                userId: currentUser.id,
                                avatarUrl: data.avatarUrl
                            });
                        }

                        // 立即刷新在线用户列表
                        if (isConnected && socket) {
                            socket.emit('get-online-users');
                        }

                        setTimeout(() => {
                            hideAvatarModal();
                        }, 2000);
                    } else {
                        avatarMessage.textContent = data.message;
                        avatarMessage.style.color = 'red';
                    }
                })
                .catch(error => {
                    console.error('上传错误:', error);
                    avatarMessage.textContent = '头像上传失败';
                    avatarMessage.style.color = 'red';
                });
        });

        // 创建群组按钮
        createGroupBtn.addEventListener('click', showCreateGroupModal);

        // 添加成员按钮
        addMemberBtn.addEventListener('click', showAddGroupMemberModal);

        // 创建群组
        createGroupButton.addEventListener('click', function() {
            const groupName = groupNameInput.value.trim();
            const description = groupDescriptionInput.value.trim();

            const selectedMembers = [];
            document.querySelectorAll('.member-checkbox:checked').forEach(checkbox => {
                selectedMembers.push(checkbox.value);
            });

            if (!groupName) {
                createGroupMessage.textContent = '请输入群组名称';
                createGroupMessage.style.color = 'red';
                return;
            }

            if (selectedMembers.length < 2) {
                createGroupMessage.textContent = '请选择至少2名其他成员';
                createGroupMessage.style.color = 'red';
                return;
            }

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
                    description: description,
                    memberIds: selectedMembers
                })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        createGroupMessage.textContent = '群组创建成功';
                        createGroupMessage.style.color = 'green';

                        loadUserGroups();

                        setTimeout(() => {
                            hideCreateGroupModal();
                        }, 2000);
                    } else {
                        createGroupMessage.textContent = data.message;
                        createGroupMessage.style.color = 'red';
                    }
                })
                .catch(error => {
                    console.error('创建群组失败:', error);
                    createGroupMessage.textContent = '创建群组失败';
                    createGroupMessage.style.color = 'red';
                });
        });

        // 确认添加成员
        confirmAddMembersButton.addEventListener('click', function() {
            const selectedMembers = [];
            document.querySelectorAll('.available-member-checkbox:checked').forEach(checkbox => {
                selectedMembers.push(checkbox.value);
            });

            if (selectedMembers.length === 0) {
                addMembersMessage.textContent = '请选择至少1名成员';
                addMembersMessage.style.color = 'red';
                return;
            }

            fetch(`${SERVER_URL}/add-group-members`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'user-id': currentUser.id,
                    'session-token': currentSessionToken
                },
                body: JSON.stringify({
                    userId: currentUser.id,
                    groupId: currentGroupId,
                    memberIds: selectedMembers
                })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        addMembersMessage.textContent = '成员添加成功';
                        addMembersMessage.style.color = 'green';
                        loadGroupMembers(currentGroupId);

                        // 2秒后关闭模态框
                        setTimeout(() => {
                            hideAddGroupMemberModal();
                        }, 2000);
                    } else {
                        addMembersMessage.textContent = data.message;
                        addMembersMessage.style.color = 'red';
                    }
                })
                .catch(error => {
                    console.error('添加成员失败:', error);
                    addMembersMessage.textContent = '添加成员失败';
                    addMembersMessage.style.color = 'red';
                });
        });
    }

    // 加载管理群组模态框中的成员列表
    function loadManageGroupMembers() {
        if (!currentGroupId || !currentUser || !currentSessionToken) {
            console.error('无法加载群组成员列表：缺少必要参数');
            return;
        }

        const manageMembersList = document.getElementById('manageMembersList');
        if (!manageMembersList) {
            console.error('找不到成员列表容器');
            return;
        }

        // 显示加载中状态
        manageMembersList.innerHTML = '<div class="loading">加载中...</div>';

        fetch(`${SERVER_URL}/group-members/${currentGroupId}`, {
            headers: {
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            }
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    manageMembersList.innerHTML = '';

                    if (!data.members || data.members.length === 0) {
                        manageMembersList.innerHTML = '<div class="empty-state">暂无成员</div>';
                        return;
                    }

                    data.members.forEach(member => {
                        const memberItem = document.createElement('div');
                        memberItem.className = 'manage-member-item';

                        const avatarHtml = member.avatar_url ?
                            `<img src="${SERVER_URL}${member.avatar_url}" class="user-avatar" style="width: 24px; height: 24px; margin-right: 8px; border-radius: 50%;">` :
                            '';

                        // 在线状态指示器
                        const onlineStatus = member.isOnline ?
                            '<span class="online-indicator" style="display: inline-block; width: 8px; height: 8px; background-color: #27ae60; border-radius: 50%; margin-right: 5px;"></span>' :
                            '<span class="offline-indicator" style="display: inline-block; width: 8px; height: 8px; background-color: #95a5a6; border-radius: 50%; margin-right: 5px;"></span>';

                        memberItem.innerHTML = `
                            <div class="member-info">
                                ${avatarHtml}
                                ${onlineStatus}
                                <span class="member-name">${lightEscapeHtml(member.nickname)}</span>
                                ${String(member.id) === currentUser.id ? '<span class="member-tag">(我)</span>' : ''}
                                ${String(member.id) === window.currentGroupCreatorId ? '<span class="member-tag">(群主)</span>' : ''}
                            </div>
                            ${String(member.id) !== currentUser.id && window.isGroupCreator ?
                            `<button class="remove-member-btn" data-member-id="${member.id}" data-member-name="${lightEscapeHtml(member.nickname)}">踢出</button>` :
                            ''}
                        `;

                        manageMembersList.appendChild(memberItem);
                    });

                    // 添加踢出成员按钮事件监听
                    document.querySelectorAll('.remove-member-btn').forEach(button => {
                        button.addEventListener('click', function() {
                            const memberId = this.getAttribute('data-member-id');
                            const memberName = this.getAttribute('data-member-name');

                            if (confirm(`确定要将 ${memberName} 踢出群组吗？`)) {
                                removeMemberFromGroup(currentGroupId, memberId);
                                // 操作成功后重新加载成员列表
                                setTimeout(() => loadManageGroupMembers(), 500);
                            }
                        });
                    });

                } else {
                    manageMembersList.innerHTML = `<div class="error">加载失败: ${escapeHtml(data.message || '')}</div>`;
                }
            })
            .catch(error => {
                console.error('加载群组成员失败:', error);
                manageMembersList.innerHTML = '<div class="error">加载成员列表失败</div>';
            });
    }

    // 初始化管理群组模态框的标签页切换
    function initializeManageGroupTabs() {
        const tabs = document.querySelectorAll('.management-tab');
        const contents = document.querySelectorAll('.management-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                // 移除所有标签的激活状态
                tabs.forEach(t => t.classList.remove('active'));
                // 隐藏所有内容区域
                contents.forEach(c => {
                    c.classList.remove('active');
                    c.style.display = 'none';
                });

                // 激活当前标签
                this.classList.add('active');
                // 显示对应内容区域
                const tabId = this.getAttribute('data-tab');
                const content = document.getElementById(tabId + 'Content');
                if (content) {
                    content.classList.add('active');
                    content.style.display = 'block';
                }
            });
        });

        // 默认激活第一个标签
        if (tabs.length > 0) {
            // 确保第一个标签页的内容区域显示
            contents.forEach(c => {
                c.classList.remove('active');
                c.style.display = 'none';
            });
            tabs[0].classList.add('active');
            const firstContent = document.getElementById(tabs[0].getAttribute('data-tab') + 'Content');
            if (firstContent) {
                firstContent.classList.add('active');
                firstContent.style.display = 'block';
            }
        }

        // 添加修改群组名称按钮事件
        const updateGroupNameBtn = document.getElementById('updateGroupNameBtn');
        const groupNameUpdateInput = document.getElementById('groupNameUpdateInput');
        const manageGroupMessage = document.getElementById('manageGroupMessage');

        if (updateGroupNameBtn && groupNameUpdateInput) {
            // 如果有当前群组信息，预先填充当前群组名称
            if (currentGroupName) {
                groupNameUpdateInput.value = currentGroupName;
            }

            updateGroupNameBtn.addEventListener('click', function() {
                const newGroupName = groupNameUpdateInput.value.trim();

                if (!newGroupName) {
                    showManageGroupMessage('请输入群组名称', 'error');
                    return;
                }

                if (newGroupName.length > 20) {
                    showManageGroupMessage('群组名称不能超过20个字符', 'error');
                    return;
                }

                // 检查群组名称格式是否有效（简单验证）
                if (!/^[\u4e00-\u9fa5a-zA-Z0-9_\-\s]{1,20}$/.test(newGroupName)) {
                    showManageGroupMessage('群组名称只能包含中文、英文、数字、下划线、短横线和空格', 'error');
                    return;
                }

                // 调用API更新群组名称
                updateGroupName(currentGroupId, newGroupName);
            });
        }

        // 添加解散群组按钮事件
        const dissolveGroupBtn = document.getElementById('dissolveGroupBtn');
        if (dissolveGroupBtn) {
            dissolveGroupBtn.addEventListener('click', function() {
                if (confirm('确定要解散本群组吗？此操作不可恢复，所有群消息将被删除。')) {
                    dissolveGroup(currentGroupId);
                    // 操作完成后关闭模态框
                    document.getElementById('manageGroupModal').style.display = 'none';
                }
            });
        }
    }

    // 修复9：显示/隐藏模态框函数
    function showNicknameModal() {
        nicknameModal.style.display = 'flex';
        if (currentUser) {
            nicknameInput.value = currentUser.nickname;
        }
    }

    function hideNicknameModal() {
        nicknameModal.style.display = 'none';
    }

    function showAvatarModal() {
        avatarModal.style.display = 'flex';
        avatarInput.value = '';
        avatarPreview.innerHTML = '';
        avatarMessage.textContent = '';
    }

    function hideAvatarModal() {
        avatarModal.style.display = 'none';
    }

    function showCreateGroupModal() {
        createGroupModal.style.display = 'flex';
        loadAllUsers();
    }

    function hideCreateGroupModal() {
        createGroupModal.style.display = 'none';
        groupNameInput.value = '';
        groupDescriptionInput.value = '';
        document.querySelectorAll('.member-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        createGroupMessage.textContent = '';
    }

    // 显示管理群组消息
    function showManageGroupMessage(message, type = 'info') {
        const manageGroupMessage = document.getElementById('manageGroupMessage');
        if (manageGroupMessage) {
            manageGroupMessage.textContent = message;
            manageGroupMessage.className = type;
            manageGroupMessage.style.color = type === 'error' ? 'red' : 'green';

            // 3秒后自动隐藏消息
            setTimeout(() => {
                if (manageGroupMessage) {
                    manageGroupMessage.textContent = '';
                    manageGroupMessage.className = '';
                }
            }, 3000);
        }
    }

    // 更新群组名称
    function updateGroupName(groupId, newGroupName) {
        if (!groupId || !newGroupName) return;

        // 获取群组标题DOM元素
        const currentGroupTitle = document.getElementById('groupTitle');

        fetch(`${SERVER_URL}/update-group-name`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            },
            body: JSON.stringify({ groupId, newGroupName })
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    // 更新本地保存的群组名称
                    currentGroupName = data.newGroupName;

                    // 更新界面上显示的群组名称
                    if (currentGroupTitle) {
                        currentGroupTitle.textContent = data.newGroupName;
                    }

                    // 更新群组列表中的名称
                    updateGroupNameInList(groupId, data.newGroupName);

                    showManageGroupMessage('群组名称已成功更新', 'success');

                    // 3秒后关闭模态框
                    setTimeout(() => {
                        const manageGroupModal = document.getElementById('manageGroupModal');
                        if (manageGroupModal) {
                            manageGroupModal.style.display = 'none';
                        }
                    }, 1500);
                } else {
                    showManageGroupMessage(data.message || '修改群组名称失败', 'error');
                }
            })
            .catch(error => {
                console.error('修改群组名称失败:', error);
                showManageGroupMessage('网络错误，请重试', 'error');
            });
    }

    // 更新群组列表中的群组名称
    function updateGroupNameInList(groupId, newGroupName) {
        const groupList = document.getElementById('groupList');
        if (groupList) {
            const groupItems = groupList.querySelectorAll('li[data-group-id="' + groupId + '"]');
            groupItems.forEach(item => {
                const groupNameEl = item.querySelector('.group-name');
                if (groupNameEl) {
                    groupNameEl.textContent = newGroupName;
                }
            });
        }
    }

    // 显示添加成员模态框
    function showAddGroupMemberModal() {
        addGroupMemberModal.style.display = 'flex';
        loadAvailableMembers();
    }

    // 隐藏添加成员模态框
    function hideAddGroupMemberModal() {
        addGroupMemberModal.style.display = 'none';
        addMembersMessage.textContent = '';
        document.querySelectorAll('.available-member-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
    }

    // 修复10：群组相关功能
    function loadAvailableMembers() {
        if (!currentGroupId || !currentUser || !currentSessionToken) {
            availableMembersList.innerHTML = '<div>无法加载成员列表</div>';
            return;
        }

        fetch(`${SERVER_URL}/available-group-members/${currentGroupId}`, {
            method: 'GET',
            headers: {
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            }
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    availableMembersList.innerHTML = '';

                    if (!data.members || data.members.length === 0) {
                        availableMembersList.innerHTML = '<div>没有可添加的成员</div>';
                        return;
                    }

                    data.members.forEach(member => {
                        const memberItem = document.createElement('div');
                        memberItem.className = 'member-item';
                        memberItem.innerHTML = `
                            <input type="checkbox" class="available-member-checkbox" value="${member.id}" id="available-member-${member.id}">
                            <label for="available-member-${member.id}">
                                ${member.avatarUrl ? `<img src="${SERVER_URL}${member.avatarUrl}" alt="头像" style="width: 16px; height: 16px; border-radius: 50%; margin-right: 8px;">` : ''}
                                <span>${lightEscapeHtml(member.nickname)}</span>
                            </label>
                        `;
                        availableMembersList.appendChild(memberItem);
                    });
                } else {
                    availableMembersList.innerHTML = `<div>加载失败: ${escapeHtml(data.message || '')}</div>`;
                }
            })
            .catch(error => {
                console.error('加载可用成员失败:', error);
                availableMembersList.innerHTML = '<div>加载成员列表失败</div>';
            });
    }

    function loadUserGroups() {
        if (!currentUser || !currentSessionToken) {
            console.log('未登录，无法加载群组列表');
            return;
        }

        console.log('加载用户群组列表，用户ID:', currentUser.id);

        fetch(`${SERVER_URL}/user-groups/${currentUser.id}`, {
            headers: {
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            }
        })
            .then(response => response.json())
            .then(data => {
                console.log('群组列表响应:', data);
                if (data.status === 'success') {
                    updateGroupList(data.groups);
                } else {
                    console.error('获取群组列表失败:', data.message);
                    groupList.innerHTML = '<li>加载失败: ' + data.message + '</li>';
                }
            })
            .catch(error => {
                console.error('加载群组列表失败:', error);
                groupList.innerHTML = '<li>加载失败: 网络错误</li>';
            });
    }

    function updateGroupList(groups) {
        if (!groupList) {
            console.error('groupList元素未找到，检查HTML结构');
            return;
        }

        console.log('更新群组列表，接收到的数据:', groups);

        // 清空现有内容
        groupList.innerHTML = '';

        // 检查数据有效性
        if (!groups || !Array.isArray(groups)) {
            groupList.innerHTML = '<li>群组数据无效</li>';
            return;
        }

        if (groups.length === 0) {
            groupList.innerHTML = '<li>暂无群组，点击"创建群组"开始聊天</li>';
            return;
        }

        // 正确使用map函数渲染列表
        groups.forEach((group, index) => {
            const li = document.createElement('li');
            li.style.padding = '10px';
            li.style.borderBottom = '1px solid #eee';
            li.style.cursor = 'pointer';
            li.style.transition = 'background-color 0.2s';

            // 确保数据存在
            const groupName = group.name || '未命名群组';
            const groupId = group.id ? String(group.id) : `temp-${index}`;

            li.innerHTML = `
                    <div style="display: flex; align-items: center;">
                        <span style="margin-right: 8px;">💬</span>
                        <span>${lightEscapeHtml(groupName)}</span>
                    </div>
                `;

            li.setAttribute('data-group-id', groupId);
            li.setAttribute('data-group-name', groupName);

            // 添加交互效果
            li.addEventListener('mouseenter', function() {
                const isDarkMode = document.body.classList.contains('dark-mode');
                this.style.backgroundColor = isDarkMode ? 'rgb(74, 74, 74)' : '#f5f5f5';
            });

            li.addEventListener('mouseleave', function() {
                this.style.backgroundColor = '';
            });

            li.addEventListener('click', function() {
                const groupId = this.getAttribute('data-group-id');
                const groupName = this.getAttribute('data-group-name');
                console.log('点击群组:', groupId, groupName);
                showGroupChat(groupId, groupName);
            });

            groupList.appendChild(li);
        });

        console.log(`群组列表更新完成，共渲染 ${groups.length} 个群组`);
    }

    function loadAllUsers() {
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
                    allUsers = data.users;
                    updateGroupMembersList(data.users);
                }
            })
            .catch(error => {
                console.error('加载用户列表失败:', error);
                groupMembersList.innerHTML = '<div>加载失败</div>';
            });
    }

    function updateGroupMembersList(users) {
        if (!groupMembersList) return;

        groupMembersList.innerHTML = '';

        const otherUsers = users.filter(user => user.id != currentUser.id);

        if (otherUsers.length === 0) {
            groupMembersList.innerHTML = '<div>暂无其他用户</div>';
            return;
        }

        otherUsers.forEach(user => {
            const memberItem = document.createElement('div');
            memberItem.className = 'member-item';
            memberItem.innerHTML = `
                    <input type="checkbox" class="member-checkbox" value="${user.id}" id="member-${user.id}">
                    <label for="member-${user.id}">${lightEscapeHtml(user.nickname)}</label>
                `;
            groupMembersList.appendChild(memberItem);
        });
    }

    function showGroupChat(groupId, groupName) {
        if (!groupId || !groupName) {
            console.error('群组ID或名称为空');
            return;
        }

        console.log('切换到群组聊天:', groupId, groupName);

        currentGroupId = groupId;
        currentGroupName = groupName;

        mainChat.style.display = 'none';
        groupChat.style.display = 'flex';
        safeSetTextContent(groupTitle, groupName);

        groupMessageContainer.innerHTML = `
                <div class="empty-state">
                    <h3>暂无消息</h3>
                    <p>发送第一条消息开始群聊吧!</p>
                </div>
            `;

        // 加入群组
        if (socket && isConnected) {
            socket.emit('join-group', {
                groupId: groupId,
                userId: currentUser.id,
                sessionToken: currentSessionToken,
                offset: 0,
                limit: 200
            });
        }

        // 加载群组成员
        loadGroupMembers(groupId);

        // 启用输入框
        groupMessageInput.disabled = false;
        groupMessageInput.placeholder = '输入群组消息后按回车发送';
        sendGroupMessageBtn.disabled = false;
        groupUploadButton.disabled = false;
        groupFileInput.disabled = false;
        groupImageUploadButton.disabled = false;
        groupImageInput.disabled = false;

        // 检查用户是否是群主
        checkIfUserIsGroupCreator(groupId);
    }

    // 检查用户是否是群组的创建者
    function checkIfUserIsGroupCreator(groupId) {
        if (!currentUser || !currentSessionToken) {
            addMemberBtn.style.display = 'none';
            manageGroupBtn.style.display = 'none';
            window.isGroupCreator = false;
            return;
        }

        fetch(`${SERVER_URL}/group-info/${groupId}`, {
            headers: {
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            }
        })
            .then(response => {
                if (!response.ok) throw new Error('网络错误');
                return response.json();
            })
            .then(data => {
                if (data.status === 'success' && data.group && String(data.group.creator_id) === currentUser.id) {
                    // 用户是群主，显示管理按钮
                    addMemberBtn.style.display = 'inline-block';
                    manageGroupBtn.style.display = 'inline-block';
                    window.isGroupCreator = true;
                } else {
                    addMemberBtn.style.display = 'none';
                    manageGroupBtn.style.display = 'none';
                    window.isGroupCreator = false;
                }
                // 重新加载群组成员列表，以显示或隐藏踢出按钮
                loadGroupMembers(groupId);
            })
            .catch(error => {
                console.error('检查群主身份失败:', error);
                addMemberBtn.style.display = 'none';
                manageGroupBtn.style.display = 'none';
                window.isGroupCreator = false;
            });
    }

    function loadGroupMembers(groupId) {
        if (!currentUser || !currentSessionToken) return;

        fetch(`${SERVER_URL}/group-members/${groupId}`, {
            headers: {
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            }
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    updateGroupMemberList(data.members);
                } else {
                    console.error('加载群组成员失败:', data.message);
                    groupMemberList.innerHTML = '<li>加载失败</li>';
                }
            })
            .catch(error => {
                console.error('加载群组成员失败:', error);
                groupMemberList.innerHTML = '<li>加载失败</li>';
            });
    }

    function updateGroupMemberList(members) {
        if (!groupMemberList) return;

        groupMemberList.innerHTML = '';

        if (!members || !Array.isArray(members) || members.length === 0) {
            groupMemberList.innerHTML = '<li>暂无成员</li>';
            return;
        }

        members.forEach(member => {
            const li = document.createElement('li');
            li.style.padding = '8px 0';
            li.style.borderBottom = '1px solid #f1f1f1';
            li.style.display = 'flex';
            li.style.alignItems = 'center';
            li.style.justifyContent = 'space-between';

            // 修复头像显示逻辑：头像在状态指示点后面，使用SERVER_URL + 数据库头像链接
            // 添加avatar_url兼容性处理和默认头像
            const avatarUrl = member.avatarUrl || member.avatar_url || null;
            let avatarHtml = '';
            if (avatarUrl) {
                avatarHtml = `<img src="${SERVER_URL}${avatarUrl}" class="user-avatar" style="width: 16px; height: 16px; margin-right: 5px; border-radius: 50%;">`;
            } else {
                // 使用默认头像图标
                avatarHtml = `<span class="default-avatar" style="display: inline-block; width: 16px; height: 16px; line-height: 16px; text-align: center; background-color: #ecf0f1; border-radius: 50%; margin-right: 5px; font-size: 10px;">${member.nickname.charAt(0).toUpperCase()}</span>`;
            }

            const memberInfo = document.createElement('div');
            memberInfo.style.display = 'flex';
            memberInfo.style.alignItems = 'center';

            // 添加在线状态指示器
            const onlineStatus = member.isOnline ?
                '<span class="online-indicator" style="display: inline-block; width: 8px; height: 8px; background-color: #27ae60; border-radius: 50%; margin-right: 5px;"></span>' :
                '<span class="offline-indicator" style="display: inline-block; width: 8px; height: 8px; background-color: #95a5a6; border-radius: 50%; margin-right: 5px;"></span>';

            if (String(member.id) === currentUser.id) {
                memberInfo.innerHTML = `${onlineStatus}${avatarHtml}<strong>${lightEscapeHtml(member.nickname)} (我)</strong>`;
            } else {
                memberInfo.innerHTML = `${onlineStatus}${avatarHtml}${lightEscapeHtml(member.nickname)}`;
            }

            li.appendChild(memberInfo);

            // 检查是否是群主，如果是且不是自己，则显示踢出按钮
            if (window.isGroupCreator && String(member.id) !== currentUser.id) {
                const kickButton = document.createElement('button');
                kickButton.textContent = '踢出';
                kickButton.style.padding = '2px 6px';
                kickButton.style.fontSize = '10px';
                kickButton.style.backgroundColor = '#ff4444';
                kickButton.style.color = 'white';
                kickButton.style.border = 'none';
                kickButton.style.borderRadius = '3px';
                kickButton.style.cursor = 'pointer';

                kickButton.addEventListener('click', function(e) {
                    e.stopPropagation();
                    removeMemberFromGroup(currentGroupId, member.id);
                });

                li.appendChild(kickButton);
            }

            groupMemberList.appendChild(li);
        });
    }

    // 踢出成员函数
    function removeMemberFromGroup(groupId, memberId) {
        if (!confirm('确定要踢出该成员吗？')) return;
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
                userId: currentUser.id,
                groupId: groupId,
                memberId: memberId
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // 重新加载群组成员列表
                    loadGroupMembers(groupId);
                    alert('成员已成功踢出');
                } else {
                    alert(data.message || '踢出成员失败');
                }
            })
            .catch(error => {
                console.error('踢出成员失败:', error);
                alert('踢出成员失败，请重试');
            });
    }

    function backToMainChat() {
        if (currentGroupId) {
            socket.emit('leave-group', { groupId: currentGroupId });
            currentGroupId = null;
            currentGroupName = '';
        }

        groupChat.style.display = 'none';
        mainChat.style.display = 'block';

        groupMessageInput.disabled = true;
        groupMessageInput.placeholder = '请先加入群组';
        sendGroupMessageBtn.disabled = true;
        groupUploadButton.disabled = true;
        groupFileInput.disabled = true;
        groupImageUploadButton.disabled = true;
        groupImageInput.disabled = true;
    }

    function addMessageToContainer(message, isOwn, isGroupChat, container, isLoadMore = false) {
        // 创建消息元素
        const messageElement = document.createElement('div');
        // 添加data-timestamp属性，用于确定加载更多时的起始点
        messageElement.dataset.timestamp = message.timestamp;
        messageElement.className = `message ${isOwn ? 'own-message' : ''}`;
        messageElement.setAttribute('data-user-id', message.userId);
        messageElement.setAttribute('data-message-id', message.id);

        // 统一构建消息HTML结构
        const avatarHtml = message.avatarUrl ?
            `<img src="${SERVER_URL}${message.avatarUrl}" class="message-avatar" alt="${message.nickname}">` :
            '';

        let contentHtml = '';

        if (message.imageUrl) {
            // 检查是否为图片文件（根据扩展名）
            const isImage = message.filename ? /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(message.filename) : !message.filename;

            // 如果是图片文件，显示图片预览
            if (isImage) {
                contentHtml = `
                <div class="message-content">
                  <img src="${SERVER_URL}${message.imageUrl}" class="message-image" alt="聊天图片" onclick="openImagePreview('${SERVER_URL}${message.imageUrl}')">
                </div>
              `;
            } else {
                // 非图片文件显示为文件链接卡片样式
                contentHtml = `
                <div class="message-content">
                  <div class="file-link-container">
                    <a href="${SERVER_URL}${message.imageUrl}" class="file-link" download="${escapeHtml(message.filename)}" target="_blank">
                      <span>${escapeHtml(message.filename)}</span>
                    </a>
                  </div>
                </div>
              `;
            }
        } else {
            // 使用全局的safeMarkdownParse函数，确保宽松解析器可以正确替换
            const parsedContent = window.safeMarkdownParse(message.content);
            contentHtml = `
              <div class="message-content">
                ${parsedContent}
              </div>
            `;
        }

        messageElement.innerHTML = `
            <div class="message-header">
              ${avatarHtml}
              <div class="nickname">${lightEscapeHtml(message.nickname)}</div>
            </div>
            ${contentHtml}
            <div class="message-time">${formatTime(message.timestamp)}</div>
            ${isOwn ? `<button class="delete-button" data-id="${message.id}" title="撤回消息">×</button>` : ''}
          `;

        // 修复：统一消息插入逻辑，确保无论消息类型如何都能按正确顺序插入
        if (isLoadMore) {
            // 向上滚动加载的消息应该插入到容器开头
            if (container.firstChild) {
                container.insertBefore(messageElement, container.firstChild);
            } else {
                container.appendChild(messageElement);
            }
        } else {
            // 普通消息添加到容器末尾
            container.appendChild(messageElement);
        }

        // 添加文件卡片点击事件，确保整个卡片都可以点击
        const fileContainer = messageElement.querySelector('.file-link-container');
        if (fileContainer) {
            fileContainer.addEventListener('click', function(e) {
                const fileLink = this.querySelector('.file-link');
                if (fileLink && e.target !== fileLink && !fileLink.contains(e.target)) {
                    e.preventDefault();
                    fileLink.click();
                }
            });
        }

        // 添加撤回按钮事件监听
        if (isOwn) {
            const deleteButton = messageElement.querySelector('.delete-button');
            if (deleteButton) {
                deleteButton.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const messageId = this.getAttribute('data-id');
                    console.log('撤回消息:', messageId);
                    socket.emit('delete-message', {
                        messageId: messageId,
                        userId: currentUser.id,
                        sessionToken: currentSessionToken
                    });
                });
            }
        }
    }

    function setupPageVisibility() {
        // 现代浏览器的页面可见性API
        let visibilityProperty;
        if ('hidden' in document) {
            visibilityProperty = 'hidden';
        } else if ('webkitHidden' in document) {
            visibilityProperty = 'webkitHidden';
        } else if ('mozHidden' in document) {
            visibilityProperty = 'mozHidden';
        }

        if (visibilityProperty) {
            const visibilityChangeEvent = visibilityProperty.replace('hidden', 'visibilitychange');

            document.addEventListener(visibilityChangeEvent, function() {
                isPageVisible = !document[visibilityProperty];
                console.log('📄 页面可见性变化:', isPageVisible ? '可见' : '隐藏');

                if (isPageVisible && isConnected) {
                    // 页面从隐藏变为可见，立即刷新消息
                    console.log('🔄 页面恢复可见，刷新消息');
                    refreshMessages();
                    // 重新请求在线用户列表
                    if (currentUser) {
                        socket.emit('get-online-users');
                    }
                }
            });
        }
        // 传统浏览器的窗口焦点事件
        window.addEventListener('focus', function() {
            if (!isPageVisible) {
                isPageVisible = true;
                console.log('🔄 窗口获得焦点，刷新消息');
                if (isConnected) {
                    refreshMessages();
                    if (currentUser) {
                        socket.emit('get-online-users');
                    }
                }
            }
        });

        window.addEventListener('blur', function() {
            isPageVisible = false;
            console.log('📄 窗口失去焦点');
        });
    }

    // 修复11：消息处理函数 - 增加isLoadMore参数以支持向上滚动加载
    function addMessage(message, isOwn = false, isGroup = false, isLoadMore = false) {
        const targetContainer = isGroup ? groupMessageContainer : messageContainer;
        const targetEmptyState = isGroup ? groupMessageContainer.querySelector('.empty-state') : emptyState;

        if (targetEmptyState && targetEmptyState.style.display !== 'none') {
            targetEmptyState.style.display = 'none';
        }

        addMessageToContainer(message, isOwn, isGroup, targetContainer, isLoadMore);

        if (!isGroup && messageCount) {
            const count = messageContainer.querySelectorAll('.message').length;
            messageCount.textContent = `消息数量: ${count}（向上滚动加载消息）`;
        }

        // 只有非向上滚动加载时才自动滚动到底部
        if (!isLoadMore) {
            scrollToBottom(targetContainer);
        }
    }

    // 修复12：连接状态和存储状态
    function updateConnectionStatus(status, message) {
        if (!connectionStatus) return;

        if (status === 'connected') {
            connectionStatus.textContent = '连接状态: 已连接';
            connectionStatus.style.color = '#27ae60';
        } else if (status === 'connecting') {
            connectionStatus.textContent = '连接状态: 连接中...';
            connectionStatus.style.color = '#f39c12';
        } else if (status === 'disconnected') {
            connectionStatus.textContent = '连接状态: 已断开';
            connectionStatus.style.color = '#e74c3c';
        } else {
            connectionStatus.textContent = `连接状态: ${message}`;
            connectionStatus.style.color = '#e74c3c';
        }
    }

    function checkStorageStatus() {
        if (!currentUser || !currentSessionToken) {
            storageStatus.textContent = '存储状态: 未登录';
            storageStatus.style.color = '#6c757d';
            return;
        }

        fetch(`${SERVER_URL}/avatar-storage`, {
            headers: {
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            }
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    // 修复存储空间显示问题
                    const storageInfo = data.storageInfo;
                    let displayText = '';

                    if (storageInfo.sizeInGB) {
                        displayText = `存储: ${storageInfo.sizeInGB}GB/5GB`;
                    } else if (storageInfo.size) {
                        displayText = `存储: ${storageInfo.size.toFixed(2)}MB/5000MB`;
                    } else {
                        displayText = storageInfo.message || '存储状态未知';
                    }

                    storageStatus.textContent = `存储状态: ${displayText}`;
                    storageStatus.style.color = storageInfo.full ? '#e74c3c' : '#27ae60';
                } else {
                    storageStatus.textContent = '存储状态: 获取失败';
                    storageStatus.style.color = '#e74c3c';
                }
            })
            .catch(error => {
                console.error('获取存储状态失败:', error);
                storageStatus.textContent = '存储状态: 网络错误';
                storageStatus.style.color = '#e74c3c';
            });
    }

    // 修复13：辅助函数
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }

    function formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();

        // 仅比较日期部分（年、月、日），不考虑具体时间
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const diffTime = Math.abs(nowOnly - dateOnly);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return '今天';
        if (diffDays === 1) return '昨天';
        if (diffDays < 7) return `${diffDays}天前`;

        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    }

    function isScrolledToBottom(container) {
        const threshold = 100;
        const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        return distanceToBottom <= threshold;
    }

    function scrollToBottom(container) {
        try {
            // 总是尝试滚动到底部，但尊重用户滚动偏好
            if (autoScrollEnabled) {
                // 先尝试直接设置滚动位置（更可靠）
                container.scrollTop = container.scrollHeight;

                // 双重检查确保滚动到底部
                setTimeout(() => {
                    if (container.scrollTop < container.scrollHeight - container.clientHeight) {
                        container.scrollTop = container.scrollHeight;
                    }
                }, 50);
            }
        } catch (error) {
            console.error('滚动到底部失败:', error);
            // 降级方案
            if (autoScrollEnabled) {
                container.scrollTop = container.scrollHeight;
            }
        }
    }

    function autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    // 保持滚动条位置 - 修复消息丢失问题
    function holdingScrollBar(container, prevScrollHeight) {
        // 确保DOM完全渲染
        setTimeout(() => {
            // 关键修复：不使用简单的高度差计算，而是使用一个更可靠的方法来保持用户看到的内容位置
            // 新消息是添加到顶部的，所以理论上scrollTop会自动增加相应的高度
            // 但是由于浏览器渲染延迟和异步操作，我们需要主动维护这个位置

            // 计算新增内容的高度
            const newScrollHeight = container.scrollHeight;
            const addedHeight = newScrollHeight - (prevScrollHeight || 0);

            // 直接设置滚动行为为auto，避免任何动画
            container.style.scrollBehavior = 'auto';

            // 关键修复：设置滚动位置为新增高度，这样用户看到的内容位置就不会改变
            container.scrollTop = addedHeight;

            // 使用更精确的多轮检查确保滚动位置稳定
            const checkAndAdjustScroll = () => {
                setTimeout(() => {
                    const currentHeight = container.scrollHeight;
                    const currentAddedHeight = currentHeight - (prevScrollHeight || 0);

                    // 只有当滚动位置差异较大时才调整，避免频繁调整
                    if (Math.abs(container.scrollTop - currentAddedHeight) > 3) {
                        console.log('调整滚动位置:', container.scrollTop, '->', currentAddedHeight);
                        container.scrollTop = currentAddedHeight;

                        // 继续检查一次，确保稳定
                        setTimeout(checkAndAdjustScroll, 10);
                    }
                }, 10);
            };

            // 开始检查和调整过程
            checkAndAdjustScroll();

            // 添加额外的保障检查点
            setTimeout(() => {
                const currentHeight = container.scrollHeight;
                const currentAddedHeight = currentHeight - (prevScrollHeight || 0);
                if (Math.abs(container.scrollTop - currentAddedHeight) > 3) {
                    container.scrollTop = currentAddedHeight;

                    // 最后微小调整，解决某些设备上的渲染问题
                    setTimeout(() => {
                        container.scrollTop = container.scrollHeight - (prevScrollHeight || 0);
                    }, 50);
                }
            }, 100);
        }, 10);
    }

    function toggleSidebar() {
        isSidebarCollapsed = !isSidebarCollapsed;
    }

    // 修复14：登录状态管理
    function updateLoginState(isLoggedIn) {
        if (isLoggedIn && currentUser) {
            // 对昵称进行完整的HTML实体解码处理
            const unescapedNickname = currentUser.nickname
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");

            safeSetTextContent(currentNicknameSpan, unescapedNickname);

            if (currentUser.avatarUrl) {
                currentAvatarImg.src = `${SERVER_URL}${currentUser.avatarUrl}`;
                currentAvatarImg.style.display = 'inline';
            } else {
                // 显示默认头像 - 使用用户昵称的第一个字符
                currentAvatarImg.style.display = 'none';
                // 创建默认头像元素（如果不存在）
                let defaultAvatar = document.getElementById('defaultAvatar');
                if (!defaultAvatar) {
                    defaultAvatar = document.createElement('div');
                    defaultAvatar.id = 'defaultAvatar';
                    defaultAvatar.className = 'default-avatar';
                    defaultAvatar.style.display = 'inline-block';
                    defaultAvatar.style.width = '40px';
                    defaultAvatar.style.height = '40px';
                    defaultAvatar.style.lineHeight = '40px';
                    defaultAvatar.style.textAlign = 'center';
                    defaultAvatar.style.backgroundColor = '#ecf0f1';
                    defaultAvatar.style.borderRadius = '50%';
                    defaultAvatar.style.marginRight = '10px';
                    defaultAvatar.style.fontSize = '16px';
                    defaultAvatar.style.color = '#333';
                    currentAvatarImg.parentNode.insertBefore(defaultAvatar, currentAvatarImg);
                }
                // 设置默认头像文本为昵称第一个字符
                defaultAvatar.textContent = currentUser.nickname.charAt(0).toUpperCase();
                defaultAvatar.style.display = 'inline-block';
            }

            changeNicknameBtn.style.display = 'inline-block';
            changeAvatarBtn.style.display = 'inline-block';
            createGroupBtn.style.display = 'inline-block';
            logoutButton.style.display = 'inline-block';

            // 登录状态下隐藏登录按钮
            let loginButtonElement = document.getElementById('loginButtonElement');
            if (loginButtonElement) {
                loginButtonElement.style.display = 'none';
            }

            messageInput.disabled = false;
            messageInput.placeholder = '输入消息后按回车发送';
            sendButton.disabled = false;
            uploadButton.disabled = false;
            fileInput.disabled = false;
            imageUploadButton.disabled = false;
            imageInput.disabled = false;

            authModal.style.display = 'none';

            // 登录后立即加载数据
            loadUserGroups();
            checkStorageStatus();

            // 如果已连接，立即加入聊天室
            if (isConnected && socket) {
                socket.emit('user-joined', {
                    userId: currentUser.id,
                    nickname: currentUser.nickname,
                    avatarUrl: currentUser.avatarUrl,
                    sessionToken: currentSessionToken,
                    offset: 0,
                    limit: 20
                });
            }

        } else {
            safeSetTextContent(currentNicknameSpan, '未登录');
            currentAvatarImg.style.display = 'none';

            changeNicknameBtn.style.display = 'none';
            changeAvatarBtn.style.display = 'none';
            createGroupBtn.style.display = 'none';
            logoutButton.style.display = 'none';

            // 检查是否已经存在登录按钮，如果没有则创建
            let loginButtonElement = document.getElementById('loginButtonElement');
            if (!loginButtonElement) {
                loginButtonElement = document.createElement('button');
                loginButtonElement.id = 'loginButtonElement';
                loginButtonElement.textContent = '登录';
                loginButtonElement.style.background = 'rgba(255, 255, 255, 0.2)';
                loginButtonElement.style.border = 'none';
                loginButtonElement.style.color = 'white';
                loginButtonElement.style.padding = '5px 10px';
                loginButtonElement.style.borderRadius = '15px';
                loginButtonElement.style.cursor = 'pointer';
                loginButtonElement.style.marginLeft = '10px';
                currentAvatarImg.parentNode.appendChild(loginButtonElement);

                // 添加点击事件打开登录模态框
                loginButtonElement.addEventListener('click', function() {
                    authModal.style.display = 'flex';
                });
            } else {
                loginButtonElement.style.display = 'inline-block';
            }

            messageInput.disabled = true;
            messageInput.placeholder = '请先登录';
            sendButton.disabled = true;
            uploadButton.disabled = true;
            fileInput.disabled = true;
            imageUploadButton.disabled = true;
            imageInput.disabled = true;

            authModal.style.display = 'flex';
        }
    }

    function logout() {
        currentUser = null;
        currentSessionToken = null;

        localStorage.removeItem('chatUserId');
        localStorage.removeItem('chatUserNickname');
        localStorage.removeItem('chatUserAvatar');
        localStorage.removeItem('chatSessionToken');

        updateLoginState(false);

        messageContainer.innerHTML = '';
        emptyState.style.display = 'block';

        userList.innerHTML = '<li>暂无在线用户</li>';
        safeSetTextContent(onlineCount, '(0)');
        safeSetTextContent(totalOnlineCount, '0');

        backToMainChat();
    }

    // 通用消息发送函数，实现WebSocket优先、HTTP请求备用的机制
    function sendMessageWithFallback(content, groupId = null, inputElement = null) {
        if (!content || !currentUser || !currentSessionToken) {
            console.log('发送消息条件不满足');
            return false;
        }

        console.log(`📤 准备发送消息${groupId ? '到群组 ' + groupId : '（全局）'}:`, content);

        // 优先使用WebSocket发送
        if (isConnected && socket) {
            try {
                socket.emit('send-message', {
                    userId: currentUser.id,
                    content: content,
                    groupId: groupId,
                    sessionToken: currentSessionToken
                });

                // 清除输入框内容
                if (inputElement) {
                    inputElement.value = '';
                    autoResizeTextarea(inputElement);
                }

                console.log('✅ WebSocket消息发送请求已发送');
                return true;
            } catch (wsError) {
                console.error('❌ WebSocket发送消息失败:', wsError);
                // 继续尝试HTTP请求
            }
        } else {
            console.log('ℹ️ WebSocket未连接，尝试使用HTTP请求');
        }

        // WebSocket发送失败或未连接时，使用HTTP请求发送
        const requestData = {
            content: content,
            groupId: groupId
        };

        console.log('📤 使用HTTP请求发送消息:', requestData);

        // 添加正确的会话令牌头信息
        const headers = {
            'Content-Type': 'application/json',
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        };

        fetch(`${SERVER_URL}/api/send-message`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestData),
            credentials: 'include'
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP错误! 状态码: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    console.log('✅ HTTP消息发送成功，消息ID:', data.messageId);

                    // 清除输入框内容
                    if (inputElement) {
                        inputElement.value = '';
                        autoResizeTextarea(inputElement);
                    }
                } else {
                    console.error('❌ HTTP消息发送失败:', data.message);
                    showNotification('发送消息失败: ' + data.message, 'error');
                }
            })
            .catch(httpError => {
                console.error('❌ HTTP请求异常:', httpError);
                showNotification('发送消息失败，请检查网络连接', 'error');
            });

        return true;
    }

    // 修复15：消息发送函数
    function sendMessage() {
        const content = messageInput.value.trim();
        sendMessageWithFallback(content, null, messageInput);
    }

    function sendGroupMessage() {
        const content = groupMessageInput.value.trim();
        if (!currentGroupId) {
            console.log('发送群组消息条件不满足: 未选择群组');
            return;
        }
        sendMessageWithFallback(content, currentGroupId, groupMessageInput);
    }

    // 修复16：Socket.IO事件处理
    const socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity, // 无限重试
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: true
    });

    socket.on('connect', () => {
        // 已成功连接到服务器
        isConnected = true;
        updateConnectionStatus('connected', '已连接');
        checkStorageStatus();

        // 启动自动刷新
        startAutoRefresh();

        // 登录后立即加入聊天室
        if (currentUser && currentSessionToken) {
            console.log('🔄 连接建立，重新加入聊天室');
            socket.emit('user-joined', {
                userId: currentUser.id,
                nickname: currentUser.nickname,
                avatarUrl: currentUser.avatarUrl,
                sessionToken: currentSessionToken,
                offset: 0,
                limit: 20
            });

            // 立即请求在线用户列表
            socket.emit('get-online-users');

            // 如果正在群组聊天，重新加入群组
            if (currentGroupId) {
                socket.emit('join-group', {
                    groupId: currentGroupId,
                    userId: currentUser.id,
                    sessionToken: currentSessionToken,
                    offset: 0,
                    limit: 20
                });
            }
        }
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log(`✅ 第${attemptNumber}次重新连接成功`);
        updateConnectionStatus('connected', '已重新连接');
        checkStorageStatus();

        // 重新加入聊天室
        if (currentUser && currentSessionToken) {
            console.log('🔄 重新连接成功，重新加入聊天室');
            socket.emit('user-joined', {
                userId: currentUser.id,
                nickname: currentUser.nickname,
                avatarUrl: currentUser.avatarUrl,
                sessionToken: currentSessionToken,
                offset: 0,
                limit: 20
            });

            // 重新请求在线用户列表
            socket.emit('get-online-users');

            // 如果正在群组聊天，重新加入群组
            if (currentGroupId) {
                socket.emit('join-group', {
                    groupId: currentGroupId,
                    userId: currentUser.id,
                    sessionToken: currentSessionToken,
                    offset: 0,
                    limit: 200
                });
            }
        }

        // 重新启动自动刷新
        startAutoRefresh();
    });

    // 监听群组创建事件 - 实时更新群组列表
    socket.on('group-created', (data) => {
        console.log('🔄 接收群组创建通知:', data);
        // 刷新用户的群组列表，不需要刷新整个页面
        loadUserGroups();
    });

    // 监听群组名称更新事件 - 实时更新群组信息
    socket.on('group-name-updated', (data) => {
        console.log('🔄 接收群组名称更新通知:', data);
        loadUserGroups();
    });

    // 监听群组成员添加事件 - 实时更新群组列表
    socket.on('members-added', (data) => {
        console.log('🔄 接收群组成员添加通知:', data);
        loadUserGroups();
        // 如果当前在该群组聊天，也需要更新群组成员列表
        if (currentGroupId === data.groupId) {
            loadGroupMembers(data.groupId);
        }
    });

    // 监听群组成员移除事件 - 实时更新群组列表
    socket.on('member-removed', (data) => {
        console.log('🔄 接收群组成员移除通知:', data);
        loadUserGroups();
        // 如果当前在该群组聊天，也需要更新群组成员列表
        if (currentGroupId === data.groupId) {
            loadGroupMembers(data.groupId);
        }
    });

    socket.on('users-updated', (users) => {
        updateUserList(users);
    });

    // 监听头像更新事件 - 更新已发送消息中的头像
    socket.on('avatar-updated', (data) => {
        console.log('🔄 接收头像更新通知:', data);

        // 确保有用户ID和头像URL
        if (!data.userId || !data.avatarUrl) {
            console.warn('⚠️ 头像更新数据不完整');
            return;
        }

        // 获取完整的头像URL
        const fullAvatarUrl = `${SERVER_URL}${data.avatarUrl}`;

        // 1. 更新所有消息中的头像（包括主聊天和群聊）
        const messageElements = document.querySelectorAll('.message');
        messageElements.forEach(messageElement => {
            // 获取消息的用户ID
            const messageUserId = messageElement.getAttribute('data-user-id');

            // 检查用户ID是否匹配
            if (messageUserId && messageUserId == data.userId) {
                // 查找消息中的头像元素
                const avatarImg = messageElement.querySelector('.message-avatar');

                if (avatarImg) {
                    // 先检查当前src是否已经是最新的，避免不必要的更新
                    if (avatarImg.src !== fullAvatarUrl) {
                        avatarImg.src = fullAvatarUrl;
                        console.log('✅ 更新了用户ID为', data.userId, '的消息头像');
                    }
                }
            }
        });

        // 2. 同时也更新当前用户自己的头像（如果是自己更新的）
        if (currentUser && currentUser.id == data.userId) {
            const currentAvatarImg = document.getElementById('currentAvatar');
            if (currentAvatarImg && currentAvatarImg.src !== fullAvatarUrl) {
                currentAvatarImg.src = fullAvatarUrl;
            }
        }
    });

    socket.on('online-users', (users) => {
        updateUserList(users);
    });

    socket.on('message-received', (message) => {
        const isOwn = currentUser && message.userId == currentUser.id;

        // 判断消息类型并显示
        if (message.groupId && currentGroupId && message.groupId == currentGroupId) {
            // 群组消息
            addMessage(message, isOwn, true);
        } else if (!message.groupId && mainChat.style.display !== 'none') {
            // 全局消息
            addMessage(message, isOwn, false);
        }
    });

    socket.on('message-deleted', (data) => {
        const messageElement = document.querySelector(`.message[data-message-id="${data.messageId}"]`);
        if (messageElement) {
            messageElement.remove();
        }

        // 更新消息计数
        if (messageCount) {
            const count = messageContainer.querySelectorAll('.message').length;
            messageCount.textContent = `消息数量: ${count}（向上滚动加载消息）`;
        }
    });

    socket.on('chat-history', (data) => {
        // 更新最后更新时间
        if (data.lastUpdate) {
            lastMessageUpdate = data.lastUpdate;
        }

        // 如果是首次加载，清空容器
        if (!hasReceivedHistory) {
            messageContainer.innerHTML = '';
            hasReceivedHistory = true;
        }

        if (!data.messages || data.messages.length === 0) {
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // 流式渲染 - 逐条渲染消息，避免一次性渲染大量DOM节点
        let currentIndex = 0;
        // 对于首次加载的消息，我们需要反转顺序，确保最早的消息在顶部
        // 对于加载更多的消息，保持原始顺序（因为已经是降序排列）
        const messagesToRender = data.loadMore ? data.messages : [...data.messages].reverse();

        // 定义渲染函数
        function renderNextMessage() {
            if (currentIndex < messagesToRender.length) {
                const message = messagesToRender[currentIndex];
                const isOwn = currentUser && message.userId == currentUser.id;
                // 传递loadMore参数给addMessage函数
                addMessage(message, isOwn, false, data.loadMore);
                currentIndex++;

                // 使用requestAnimationFrame确保渲染平滑
                requestAnimationFrame(() => {
                    renderNextMessage();
                });
            } else {
                // 所有消息渲染完成
                if (messageCount) {
                    const count = messageContainer.querySelectorAll('.message').length;
                    messageCount.textContent = `消息数量: ${count}（向上滚动加载消息）`;
                }

                // 清除加载中状态
                window.isLoadingMoreMessages = false;

                // 移除加载中提示
                const loadingIndicators = document.querySelectorAll('.loading-indicator');
                loadingIndicators.forEach(el => el.remove());

                // 向上滚动加载时处理
                if (data.loadMore) {
                    // 使用优化的滚动位置保持函数，避免滚动跳动
                    holdingScrollBar(messageContainer, window.globalPrevScrollHeight);
                } else {
                    // 非向上滚动加载时自动滚动到底部
                    scrollToBottom(messageContainer);
                }

                // 隐藏加载更多按钮，使用向上滚动加载
                const loadMoreBtn = document.getElementById('load-more-global');
                if (loadMoreBtn) {
                    loadMoreBtn.style.display = 'none';
                }
            }
        }

        // 开始渲染第一条消息
        renderNextMessage();
    })

    // 接收所有群消息被撤回的通知
    socket.on('all-group-messages-recalled', (data) => {
        const { groupId } = data;
        if (currentGroupId && parseInt(currentGroupId) === parseInt(groupId)) {
            const messageContainer = document.getElementById('groupMessageContainer');
            if (messageContainer) {
                messageContainer.innerHTML = '<div class="message notification">💬 所有群消息已被群主撤回</div>';
            }
            alert('所有群消息已被群主撤回');
        }
    });

    // 接收群组解散的通知
    socket.on('group-dissolved', (data) => {
        const { groupId } = data;
        if (currentGroupId && parseInt(currentGroupId) === parseInt(groupId)) {
            // 清空消息容器
            const messageContainer = document.getElementById('groupMessageContainer');
            if (messageContainer) {
                messageContainer.innerHTML = '<div class="message notification">💥 群组已被解散</div>';
            }

            // 禁用聊天输入
            const groupInputArea = document.querySelector('.group-input-area');
            if (groupInputArea) {
                groupInputArea.style.opacity = '0.5';
                groupInputArea.style.pointerEvents = 'none';
            }

            // 禁用管理按钮
            const manageGroupBtn = document.getElementById('manageGroupBtn');
            if (manageGroupBtn) {
                manageGroupBtn.style.display = 'none';
            }

            // 可以选择跳转到群列表页面
        }
    });

    // 接收群组名称更新的通知
    socket.on('group-name-updated', (data) => {
        const { groupId, newGroupName } = data;

        // 更新本地保存的群组名称
        if (currentGroupId && parseInt(currentGroupId) === parseInt(groupId)) {
            currentGroupName = newGroupName;

            // 获取群组标题DOM元素
            const currentGroupTitle = document.getElementById('groupTitle');

            // 更新界面上显示的群组名称
            if (currentGroupTitle) {
                currentGroupTitle.textContent = newGroupName;
            }
        }

        // 更新群组列表中的名称
        updateGroupNameInList(groupId, newGroupName);
    });

    socket.on('group-chat-history', (data) => {
        // 收到群组聊天历史

        // 更新最后更新时间
        if (data.lastUpdate) {
            lastMessageUpdate = data.lastUpdate;
        }

        // 如果是首次加载，清空容器
        if (groupMessageContainer.innerHTML.trim() === '' ||
            groupMessageContainer.querySelector('.empty-state')) {
            groupMessageContainer.innerHTML = '';
        }

        if (!data.messages || data.messages.length === 0) {
            groupMessageContainer.innerHTML = `
              <div class="empty-state">
                <h3>暂无消息</h3>
                <p>发送第一条消息开始群聊吧!</p>
              </div>
            `;
            return;
        }

        // 流式渲染 - 逐条渲染消息，避免一次性渲染大量DOM节点
        let currentIndex = 0;
        // 对于首次加载的消息，我们需要反转顺序，确保最早的消息在顶部
        // 对于加载更多的消息，保持原始顺序（因为已经是降序排列）
        const messagesToRender = data.loadMore ? data.messages : [...data.messages].reverse();

        // 定义渲染函数
        function renderNextMessage() {
            if (currentIndex < messagesToRender.length) {
                const message = messagesToRender[currentIndex];
                const isOwn = currentUser && message.userId == currentUser.id;
                // 传递loadMore参数给addMessage函数
                addMessage(message, isOwn, true, data.loadMore);
                currentIndex++;

                // 使用requestAnimationFrame确保渲染平滑
                requestAnimationFrame(() => {
                    renderNextMessage();
                });
            } else {
                // 所有消息渲染完成
                // 清除加载中状态
                window.isLoadingMoreMessages = false;

                // 移除加载中提示
                const loadingIndicators = document.querySelectorAll('.loading-indicator');
                loadingIndicators.forEach(el => el.remove());

                // 向上滚动加载时处理
                if (data.loadMore) {
                    // 使用优化的滚动位置保持函数，避免滚动跳动
                    holdingScrollBar(groupMessageContainer, window.groupPrevScrollHeight);
                } else {
                    // 非向上滚动加载时自动滚动到底部
                    scrollToBottom(groupMessageContainer);
                }

                // 隐藏加载更多按钮，使用向上滚动加载
                const loadMoreBtn = document.getElementById('load-more-group');
                if (loadMoreBtn) {
                    loadMoreBtn.style.display = 'none';
                }
            }
        }

        // 开始渲染第一条消息
        renderNextMessage();
    });

    socket.on('nickname-updated', (data) => {
        // 收到昵称更新
        if (data.userId == currentUser?.id) {
            // 对昵称进行完整的HTML实体解码处理
            const unescapedNickname = data.newNickname
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");

            currentUser.nickname = unescapedNickname;
            safeSetTextContent(currentNicknameSpan, unescapedNickname);
            localStorage.setItem('chatUserNickname', unescapedNickname);

            // 刷新用户列表显示
            socket.emit('get-online-users');
        }
    });

    socket.on('session-expired', () => {
        alert('会话已过期，请重新登录');
        logout();
    });

    socket.on('error', (error) => {
        console.error('服务器错误:', error);
        alert(`错误: ${error.message}`);
    });

    // 显示加载更多按钮
    function showLoadMoreButton(type) {
        // 先移除已有的加载更多按钮
        const existingButton = document.getElementById(`load-more-${type}`);
        if (existingButton) {
            existingButton.remove();
        }

        // 创建加载更多按钮
        const loadMoreButton = document.createElement('button');
        loadMoreButton.id = `load-more-${type}`;
        loadMoreButton.textContent = '加载更多消息';
        loadMoreButton.className = 'load-more-button';
        loadMoreButton.style.display = 'block';
        loadMoreButton.style.margin = '10px auto';
        loadMoreButton.style.padding = '8px 16px';
        loadMoreButton.style.backgroundColor = '#3498db';
        loadMoreButton.style.color = 'white';
        loadMoreButton.style.border = 'none';
        loadMoreButton.style.borderRadius = '4px';
        loadMoreButton.style.cursor = 'pointer';

        // 添加点击事件
        loadMoreButton.addEventListener('click', function() {
            this.textContent = '加载中...';
            this.disabled = true;
            loadMoreMessages(type);
        });

        // 根据类型添加到不同的容器
        if (type === 'global') {
            messageContainer.parentNode.insertBefore(loadMoreButton, messageContainer.nextSibling);
        } else if (type === 'group') {
            groupMessageContainer.parentNode.insertBefore(loadMoreButton, groupMessageContainer.nextSibling);
        }
    }

    // 加载更多消息
    function loadMoreMessages(type) {
        if (!currentUser || !currentSessionToken) {
            return;
        }

        // loadMoreMessages函数已被向上滚动加载替代
        // 此函数保留但不实际使用，向上滚动时会自动触发加载
        console.log('loadMoreMessages被调用，现已使用向上滚动加载替代');

        if (type === 'global') {
            const offset = window.globalNextOffset || 0;
            socket.emit('user-joined', {
                userId: currentUser.id,
                nickname: currentUser.nickname,
                avatarUrl: currentUser.avatarUrl,
                sessionToken: currentSessionToken,
                offset: offset,
                limit: 20,
                loadMore: true // 标记为加载更多
            });
        } else if (type === 'group' && currentGroupId) {
            const offset = window.groupNextOffset || 0;
            socket.emit('join-group', {
                groupId: currentGroupId,
                userId: currentUser.id,
                sessionToken: currentSessionToken,
                offset: offset,
                limit: 20,
                loadMore: true // 标记为加载更多
            });
        }
    }

    // 修复17：事件监听器初始化
    function initializeEventListeners() {
        console.log('初始化事件监听器');

        // 发送消息事件
        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        sendGroupMessageBtn.addEventListener('click', sendGroupMessage);
        groupMessageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendGroupMessage();
            }
        });

        // 侧边栏切换
        toggleSidebarBtn.addEventListener('click', toggleSidebar);

        // 返回主聊天室
        backToMainBtn.addEventListener('click', backToMainChat);

        // 管理群聊按钮点击事件
        manageGroupBtn.addEventListener('click', function() {
            if (!window.isGroupCreator || !currentGroupId) return;

            // 显示管理群组模态框
            const manageGroupModal = document.getElementById('manageGroupModal');
            if (manageGroupModal) {
                manageGroupModal.style.display = 'block';

                // 加载群组成员列表
                loadManageGroupMembers();

                // 初始化管理群组模态框的标签页切换
                initializeManageGroupTabs();
            }
        });

        // 退出登录
        logoutButton.addEventListener('click', logout);

        // 文件和图片上传
        uploadButton.addEventListener('click', () => fileInput.click());
        imageUploadButton.addEventListener('click', () => imageInput.click());
        groupUploadButton.addEventListener('click', () => groupFileInput.click());
        groupImageUploadButton.addEventListener('click', () => groupImageInput.click());

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                uploadFile(e.target.files[0], false);
            }
        });

        imageInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                uploadFile(e.target.files[0], false);
            }
        });

        groupFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                uploadFile(e.target.files[0], true);
            }
        });

        groupImageInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                uploadFile(e.target.files[0], true);
            }
        });

        // 登录注册按钮
        loginButton.addEventListener('click', handleLogin);
        registerButton.addEventListener('click', handleRegister);

        // 输入框自动调整高度
        messageInput.addEventListener('input', function() {
            autoResizeTextarea(this);
        });

        groupMessageInput.addEventListener('input', function() {
            autoResizeTextarea(this);
        });

        // 添加粘贴事件处理，支持粘贴图片或文件
        messageInput.addEventListener('paste', handlePaste);
        groupMessageInput.addEventListener('paste', function(e) {
            handlePaste(e, true);
        });

        function handlePaste(e, isGroup = false) {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            if (!items || items.length === 0) return;

            // 查找剪贴板中的文件
            for (let i = 0; i < items.length; i++) {
                if (items[i].kind === 'file') {
                    const file = items[i].getAsFile();
                    if (file) {
                        uploadFile(file, isGroup);
                        break;
                    }
                }
            }
        }

        // 消息容器滚动事件 - 添加向上滚动加载功能
        messageContainer.addEventListener('scroll', function(e) {
            if (!isScrolledToBottom(this)) {
                autoScrollEnabled = false;
            } else {
                autoScrollEnabled = true;
            }

            // 向上滚动到顶部时加载新消息
            if (this.scrollTop < 50) { // 使用50px的阈值，避免必须滚动到绝对顶部
                // 避免频繁触发
                if (!window.isLoadingMoreMessages) {
                    // 阻止默认滚动行为，避免滚动动画
                    e.preventDefault();

                    window.isLoadingMoreMessages = true;

                    // 记录当前滚动位置信息（用于加载后恢复）
                    window.globalPrevScrollHeight = this.scrollHeight;

                    // 获取当前显示的最早消息的时间戳
                    const messages = messageContainer.querySelectorAll('.message');
                    const firstMessage = messages.length > 0 ? messages[0] : null;
                    // 关键修复：确保正确获取时间戳，即使没有data-timestamp属性
                    let olderThan = null;
                    if (firstMessage) {
                        // 优先使用data-timestamp属性
                        if (firstMessage.dataset.timestamp) {
                            olderThan = firstMessage.dataset.timestamp;
                        } else {
                            // 备选方案：从消息时间元素中解析时间戳
                            const timeElement = firstMessage.querySelector('.message-time');
                            if (timeElement) {
                                // 这里可以根据实际情况实现时间解析逻辑
                                // 注：这只是一个备选方案，理想情况下应该始终有data-timestamp属性
                                console.warn('找不到data-timestamp属性，使用备选方案');
                            }
                        }
                        console.log('获取到的olderThan时间戳:', olderThan);
                    }

                    socket.emit('user-joined', {
                        userId: currentUser.id,
                        nickname: currentUser.nickname,
                        avatarUrl: currentUser.avatarUrl,
                        sessionToken: currentSessionToken,
                        limit: 20,
                        loadMore: true,
                        olderThan: olderThan
                    });

                    // 添加加载中提示
                    const loadingIndicator = document.createElement('div');
                    loadingIndicator.className = 'loading-indicator';
                    loadingIndicator.textContent = '加载中...';
                    loadingIndicator.style.textAlign = 'center';
                    loadingIndicator.style.padding = '10px';
                    loadingIndicator.style.color = '#666';
                    this.insertBefore(loadingIndicator, this.firstChild);
                }
            }

            // 持续更新滚动位置设置，确保在用户滚动离开底部时不会自动滚动
            if (!isScrolledToBottom(this)) {
                autoScrollEnabled = false;
                // 保存当前滚动位置，用于在需要时恢复
                window.globalLastScrollPosition = this.scrollTop;
            } else {
                autoScrollEnabled = true;
            }
        });

        groupMessageContainer.addEventListener('scroll', function(e) {
            if (!isScrolledToBottom(this)) {
                autoScrollEnabled = false;
            } else {
                autoScrollEnabled = true;
            }

            // 向上滚动到顶部时加载新消息
            if (this.scrollTop < 50 && currentGroupId) { // 使用50px的阈值，避免必须滚动到绝对顶部
                // 避免频繁触发
                if (!window.isLoadingMoreMessages) {
                    // 阻止默认滚动行为，避免滚动动画
                    e.preventDefault();

                    window.isLoadingMoreMessages = true;

                    // 记录当前滚动位置信息（用于加载后恢复）
                    window.groupPrevScrollHeight = this.scrollHeight;

                    // 获取当前显示的最早消息的时间戳
                    const messages = groupMessageContainer.querySelectorAll('.message');
                    const firstMessage = messages.length > 0 ? messages[0] : null;
                    // 关键修复：确保正确获取时间戳，即使没有data-timestamp属性
                    let olderThan = null;
                    if (firstMessage) {
                        // 优先使用data-timestamp属性
                        if (firstMessage.dataset.timestamp) {
                            olderThan = firstMessage.dataset.timestamp;
                        } else {
                            // 备选方案：从消息时间元素中解析时间戳
                            const timeElement = firstMessage.querySelector('.message-time');
                            if (timeElement) {
                                // 这里可以根据实际情况实现时间解析逻辑
                                // 注：这只是一个备选方案，理想情况下应该始终有data-timestamp属性
                                console.warn('找不到data-timestamp属性，使用备选方案');
                            }
                        }
                        console.log('获取到的olderThan时间戳:', olderThan);
                    }

                    socket.emit('join-group', {
                        groupId: currentGroupId,
                        userId: currentUser.id,
                        sessionToken: currentSessionToken,
                        limit: 20,
                        loadMore: true,
                        olderThan: olderThan
                    });

                    // 添加加载中提示
                    const loadingIndicator = document.createElement('div');
                    loadingIndicator.className = 'loading-indicator';
                    loadingIndicator.textContent = '加载中...';
                    loadingIndicator.style.textAlign = 'center';
                    loadingIndicator.style.padding = '10px';
                    loadingIndicator.style.color = '#666';
                    this.insertBefore(loadingIndicator, this.firstChild);
                }
            }

            // 持续更新滚动位置设置，确保在用户滚动离开底部时不会自动滚动
            if (!isScrolledToBottom(this)) {
                autoScrollEnabled = false;
                // 保存当前滚动位置，用于在需要时恢复
                window.groupLastScrollPosition = this.scrollTop;
            } else {
                autoScrollEnabled = true;
            }
        });

        // 初始化Markdown工具栏
        initializeMarkdownToolbar();

        // 初始化模态框事件
        initializeModalEvents();
    }

    // 修复18：登录注册处理
    function handleLogin() {
        const username = loginUsername.value.trim();
        const password = loginPassword.value.trim();

        if (!username || !password) {
            loginMessage.textContent = '请填写用户名和密码';
            loginMessage.style.display = 'block';
            return;
        }

        loginButton.disabled = true;
        loginButton.textContent = '登录中...';

        fetch(`${SERVER_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    // 对昵称进行完整的HTML实体解码处理
                    const unescapedNickname = data.nickname
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&quot;/g, '"')
                        .replace(/&#39;/g, "'");

                    currentUser = {
                        id: data.userId.toString(),
                        nickname: unescapedNickname,
                        avatarUrl: data.avatarUrl
                    };
                    currentSessionToken = data.sessionToken;

                    localStorage.setItem('chatUserId', currentUser.id);
                    localStorage.setItem('chatUserNickname', currentUser.nickname);
                    localStorage.setItem('chatUserAvatar', currentUser.avatarUrl);
                    localStorage.setItem('chatSessionToken', currentSessionToken);
                    if (currentUser.avatarUrl) {
                        localStorage.setItem('chatUserAvatar', currentUser.avatarUrl);
                    }

                    updateLoginState(true);

                    // 设置最后更新时间
                    lastMessageUpdate = Date.now();

                    // 登录后立即加入聊天室 - 无条件发送，连接建立后会自动发送
                    socket.emit('user-joined', {
                        userId: currentUser.id,
                        nickname: currentUser.nickname,
                        avatarUrl: currentUser.avatarUrl,
                        sessionToken: currentSessionToken,
                        offset: 0,
                        limit: 20
                    });

                    // 立即请求在线用户列表
                    socket.emit('get-online-users');

                    // 启动自动刷新
                    startAutoRefresh();

                } else {
                    loginMessage.textContent = data.message;
                    loginMessage.style.display = 'block';
                    loginButton.disabled = false;
                    loginButton.textContent = '登录';
                }
            })
            .catch(error => {
                console.error('登录错误:', error);
                loginMessage.textContent = '登录失败，请重试';
                loginMessage.style.display = 'block';
                loginButton.disabled = false;
                loginButton.textContent = '登录';
            });
    }

    function handleRegister() {
        const username = registerUsername.value.trim();
        const password = registerPassword.value.trim();
        const nickname = registerNickname.value.trim();

        if (!username || !password || !nickname) {
            registerMessage.textContent = '请填写所有字段';
            registerMessage.style.display = 'block';
            return;
        }

        fetch(`${SERVER_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password, nickname })
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    registerMessage.textContent = '注册成功，请登录';
                    registerMessage.style.color = 'green';
                    registerMessage.style.display = 'block';

                    setTimeout(() => {
                        loginTab.click();
                        loginUsername.value = username;
                        loginPassword.value = '';
                    }, 1000);
                } else {
                    registerMessage.textContent = data.message;
                    registerMessage.style.display = 'block';
                }
            })
            .catch(error => {
                console.error('注册错误:', error);
                registerMessage.textContent = '注册失败，请重试';
                registerMessage.style.display = 'block';
            });
    }

    // 文件上传函数 - 支持所有类型的文件
    function uploadFile(file, isGroup) {
        if (!file) {
            alert('请选择有效的文件');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert('文件大小不能超过5MB');
            return;
        }

        const formData = new FormData();
        formData.append('image', file); // 保持原有的字段名，避免后端修改
        formData.append('userId', currentUser.id);

        if (isGroup && currentGroupId) {
            formData.append('groupId', currentGroupId);
        }

        uploadProgress.style.display = 'block';
        let progress = 0;
        const interval = setInterval(() => {
            progress += 5;
            if (progress > 90) clearInterval(interval);
            uploadProgressBar.style.width = `${progress}%`;
        }, 100);

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
                clearInterval(interval);
                uploadProgressBar.style.width = '100%';

                setTimeout(() => {
                    uploadProgress.style.display = 'none';
                    uploadProgressBar.style.width = '0%';
                }, 500);

                if (data.status === 'success') {
                    console.log('文件上传成功');
                    // 不需要额外操作，因为/upload接口已经将消息保存到数据库并广播给所有客户端
                    // 客户端会通过socket.io接收message-received事件来更新界面
                } else {
                    alert('文件上传失败: ' + data.message);
                }
            })
            .catch(error => {
                clearInterval(interval);
                uploadProgress.style.display = 'none';
                uploadProgressBar.style.width = '0%';
                console.error('上传错误:', error);
                alert('文件上传失败');
            });
    }

    // 深色模式切换功能
    function toggleDarkMode() {
        // 切换body上的dark-mode类
        document.body.classList.toggle('dark-mode');

        // 获取当前模式
        const isDarkMode = document.body.classList.contains('dark-mode');

        // 更新按钮文本和图标
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.textContent = isDarkMode ? '🌙 深色模式' : '🌞 浅色模式';
        }

        // 保存用户的深色模式偏好到本地存储
        localStorage.setItem('chatDarkMode', isDarkMode ? 'true' : 'false');
    }

    // 修复20：应用初始化
    function initializeApp() {
        console.log('🚀 初始化聊天室应用');

        // 检查本地存储的深色模式偏好
        const savedDarkMode = localStorage.getItem('chatDarkMode');
        const darkModeToggle = document.getElementById('darkModeToggle');

        // 应用深色模式（如果用户之前选择了深色模式或者系统偏好深色模式）
        if (savedDarkMode === 'true' || (savedDarkMode === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.body.classList.add('dark-mode');
            if (darkModeToggle) {
                darkModeToggle.textContent = '🌙 深色模式';
            }
        } else {
            document.body.classList.remove('dark-mode');
            if (darkModeToggle) {
                darkModeToggle.textContent = '🌞 浅色模式';
            }
        }

        // 检查本地存储的登录状态
        const savedUserId = localStorage.getItem('chatUserId');
        let savedUserNickname = localStorage.getItem('chatUserNickname');
        const savedUserAvatar = localStorage.getItem('chatUserAvatar');
        const savedSessionToken = localStorage.getItem('chatSessionToken');

        // 对从localStorage读取的昵称进行完整的HTML实体解码处理
        if (savedUserNickname) {
            savedUserNickname = savedUserNickname
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
        }

        if (savedUserId && savedUserNickname && savedSessionToken) {
            currentUser = {
                id: savedUserId,
                nickname: savedUserNickname,
                avatarUrl: savedUserAvatar
            };
            currentSessionToken = savedSessionToken;
            updateLoginState(true);

            // 立即设置最后更新时间
            lastMessageUpdate = Date.now();
        } else {
            updateLoginState(false);
        }

        // 初始化事件监听器
        initializeEventListeners();

        // 绑定深色模式切换按钮事件
        if (darkModeToggle) {
            darkModeToggle.addEventListener('click', toggleDarkMode);
        }

        // 设置页面可见性检测
        setupPageVisibility();

        // 初始化状态显示
        updateConnectionStatus('connecting', '连接中...');
        checkStorageStatus();

        // 应用初始化完成

        // 初始化完成后，设置延迟再检查是否需要滚动到底部
        setTimeout(() => {
            if (currentUser && autoScrollEnabled) {
                // 确保当前显示的消息容器滚动到底部
                if (mainChat.style.display !== 'none' && messageContainer.scrollHeight > 0) {
                    scrollToBottom(messageContainer);
                } else if (groupChat.style.display !== 'none' && currentGroupId && groupMessageContainer.scrollHeight > 0) {
                    scrollToBottom(groupMessageContainer);
                }
            }
        }, 1000); // 1秒延迟，确保消息加载完成
    }

    // 修复21：全局函数和启动
    window.openImagePreview = function(imageUrl) {
        previewImgElement.src = imageUrl;
        imagePreviewModal.style.display = 'flex';
    };

    // 关闭图片预览
    if (closePreviewBtn) {
        closePreviewBtn.addEventListener('click', function() {
            imagePreviewModal.style.display = 'none';
        });
    }

    imagePreviewModal.addEventListener('click', function(e) {
        if (e.target === imagePreviewModal) {
            imagePreviewModal.style.display = 'none';
        }
    });

    // 撤回群组中所有消息
    function recallAllGroupMessages(groupId) {
        if (!currentUser || !currentSessionToken) {
            alert('请先登录');
            return;
        }

        fetch(`${SERVER_URL}/recall-group-messages`, {
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
                if (data.success) {
                    alert('所有群消息已成功撤回');
                    // 清空本地消息容器
                    groupMessageContainer.innerHTML = `
                        <div class="empty-state">
                            <h3>暂无消息</h3>
                            <p>发送第一条消息开始群聊吧!</p>
                        </div>
                    `;
                    // 请求更新后的消息历史
                    socket.emit('join-group', {
                        groupId: groupId,
                        userId: currentUser.id,
                        sessionToken: currentSessionToken,
                        offset: 0,
                        limit: 200
                    });
                } else {
                    alert(data.message || '撤回消息失败');
                }
            })
            .catch(error => {
                console.error('撤回消息失败:', error);
                alert('撤回消息失败，请重试');
            });
    }

    // 解散群组
    function dissolveGroup(groupId) {
        if (!currentUser || !currentSessionToken) {
            alert('请先登录');
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
                    // 刷新群组列表
                    loadUserGroups();
                } else {
                    alert(data.message || '解散群组失败');
                }
            })
            .catch(error => {
                console.error('解散群组失败:', error);
                alert('解散群组失败，请重试');
            });
    }

    // 加载用户的所有群组
    function loadUserGroups() {
        if (!currentUser || !currentSessionToken) return;

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
                }
            })
            .catch(error => {
                console.error('加载用户群组失败:', error);
            });
    }

    // 宽松的HTML处理和Markdown解析功能

    // 简化的HTML转义函数 - 保留引号内的内容不转义
    function looseEscapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        // 首先移除控制字符
        let safeString = String(unsafe).replace(/[\x00-\x1F\x7F-\x9F]/g, '');

        // 针对URL的特殊处理 - 不转义URL中的特殊字符
        if (/\b(?:https?|ftp):\/\/[\-A-Z0-9+&@#\/%?=~_|!:,.;]*[\-A-Z0-9+&@#\/%=~_|]/i.test(safeString)) {
            return safeString; // 对于URL，保持原样
        }

        // 只对HTML标签进行必要的转义，保留其他内容
        return safeString
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    // 宽松的Markdown解析函数 - 不再添加引号
    function looseMarkdownParse(content) {
        if (!content) return '';

        // 使用marked解析原始内容
        if (typeof marked !== 'undefined') {
            try {
                // 创建自定义的渲染器
                const renderer = new marked.Renderer();

                // 覆盖链接渲染，更加宽松地处理URL
                const linkRenderer = renderer.link || function(href, title, text) {
                    // 默认的链接渲染实现
                    let out = `<a href="${href}"`;
                    if (title) {
                        out += ` title="${title}"`;
                    }
                    out += `>${text}</a>`;
                    return out;
                };

                renderer.link = function(href, title, text) {
                    try {
                        // 确保所有参数都是字符串
                        href = typeof href === 'string' ? href : '';
                        title = typeof title === 'string' ? title : '';
                        text = typeof text === 'string' ? text : '';

                        // 使用宽松的URL验证
                        const cleanHref = looseValidateUrl(href);
                        const cleanTitle = title ? looseEscapeHtml(title) : '';
                        const cleanText = looseEscapeHtml(text);

                        // 直接实现链接渲染，避免this指向问题
                        let out = `<a href="${looseEscapeHtml(cleanHref)}"`;
                        if (cleanTitle) {
                            out += ` title="${cleanTitle}"`;
                        }
                        out += `>${cleanText}</a>`;
                        return out;
                    } catch (error) {
                        console.error('链接渲染错误:', error);
                        return looseEscapeHtml(typeof text === 'string' ? text : '');
                    }
                };

                // 覆盖图片渲染
                renderer.image = function(href, title, text) {
                    try {
                        // 确保所有参数都是字符串
                        href = typeof href === 'string' ? href : '';
                        title = typeof title === 'string' ? title : '';
                        text = typeof text === 'string' ? text : '';

                        // 使用宽松的URL验证
                        const cleanHref = looseValidateUrl(href);
                        const cleanTitle = title ? looseEscapeHtml(title) : '';
                        const cleanText = looseEscapeHtml(text);

                        // 直接实现图片渲染，避免this指向问题
                        let out = `<img src="${looseEscapeHtml(cleanHref)}" alt="${cleanText}"`;
                        if (cleanTitle) {
                            out += ` title="${cleanTitle}"`;
                        }
                        out += '>';
                        return out;
                    } catch (error) {
                        console.error('图片渲染错误:', error);
                        return looseEscapeHtml(typeof text === 'string' ? `[图片: ${text}]` : '[图片]');
                    }
                };

                marked.setOptions({
                    sanitize: false, // 关闭自动清理，更加宽松
                    breaks: true,
                    gfm: true,
                    renderer: renderer
                });

                // 直接解析原始内容
                let parsedContent = marked.parse(content);

                // 移除可能的危险属性
                parsedContent = looseRemoveDangerousAttributes(parsedContent);
                return parsedContent;
            } catch (error) {
                console.error('Markdown解析错误:', error);
                // 如果解析失败，也尝试以宽松方式返回内容
                return looseEscapeHtml(content);
            }
        }

        // 如果marked库不可用，返回转义后的内容
        return looseEscapeHtml(content);
    }

    // 宽松的URL验证函数 - 几乎接受所有可能的URL格式
    function looseValidateUrl(url) {
        // 确保返回值始终是字符串
        if (!url || typeof url !== 'string') return '';

        // 对于任何非空字符串，都尝试将其作为URL处理
        return url;
    }

    // 宽松的危险属性移除函数
    function looseRemoveDangerousAttributes(html) {
        if (!html) return '';

        // 创建临时DOM元素用于处理
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // 只移除最危险的事件处理器属性
        const dangerousAttributes = ['on*'];

        // 递归处理所有元素
        function processElement(element) {
            const attributes = Array.from(element.attributes);
            attributes.forEach(attr => {
                const attrName = attr.name.toLowerCase();
                // 检查是否是危险属性
                const isDangerous = dangerousAttributes.some(dangerousAttr => {
                    return dangerousAttr === attrName ||
                        (dangerousAttr.includes('*') && attrName.startsWith(dangerousAttr.replace('*', '')));
                });

                if (isDangerous) {
                    // 移除危险属性
                    element.removeAttribute(attrName);
                }
            });

            // 递归处理子元素
            Array.from(element.children).forEach(processElement);
        }

        Array.from(tempDiv.children).forEach(processElement);

        return tempDiv.innerHTML;
    }

    // 轻量级转义函数 - 只转义<和>，不转义&（用于昵称、群组名称等显示）
    function lightEscapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        // 首先移除控制字符
        let safeString = String(unsafe).replace(/[\x00-\x1F\x7F-\x9F]/g, '');

        // 只转义<和>
        return safeString
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    // 初始化消息解析器 - 不再限制HTML标签显示
    function initLooseParser() {
        // 检查是否已加载
        if (window.looseParserInitialized) return;

        // 确保全局函数可用，无论原有函数是否存在
        window.originalSafeMarkdownParse = window.safeMarkdownParse || function(content) { return content; };
        window.safeMarkdownParse = looseMarkdownParse;

        window.originalEscapeHtml = window.escapeHtml || function(content) { return content; };
        window.escapeHtml = looseEscapeHtml;

        window.originalValidateUrl = window.validateUrl || function(url) { return url; };
        window.validateUrl = looseValidateUrl;

        window.originalRemoveDangerousAttributes = window.removeDangerousAttributes || function(html) { return html; };
        window.removeDangerousAttributes = looseRemoveDangerousAttributes;

        window.looseParserInitialized = true;
        console.log('消息解析器已初始化，HTML标签将正常显示');
    }

    // 最后启动应用
    initializeApp();
});
// 增强的HTML转义函数
function simpleEscapeHtml(text) {
    if (text === null || text === undefined) return '';
    text = String(text); // 确保是字符串
    return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 显示HTML转义字符的函数
function showEscapedHtml(text) {
    if (text === null || text === undefined) return '';
    text = String(text); // 确保是字符串
    return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 简单的URL验证函数
function simpleValidateUrl(url) {
    if (!url) return '';
    url = String(url); // 确保是字符串
    url = url.trim().replace(/^['"]|['"]$/g, '');

    // 确保URL有协议
    if (!url.match(/^https?:\/\//i)) {
        url = 'http://' + url;
    } try {
        new URL(url);
        return url;
    } catch (e) {
        console.warn('URL验证失败:', url);
        return '';
    }
}

// 移除危险属性
function simpleRemoveDangerousAttributes(html) {
    const div = document.createElement('div');
    div.innerHTML = html;

    const allElements = div.querySelectorAll('*');
    allElements.forEach(el => {
        const attrs = Array.from(el.attributes);
        attrs.forEach(attr => {
            if (attr.name.toLowerCase().startsWith('on') || attr.name.toLowerCase().includes('script') || attr.name.toLowerCase().includes('cookie')) {
                el.removeAttribute(attr.name);
            }
        });
    });

    return div.innerHTML;
}

// 增强的Markdown解析函数 - 支持更多Markdown语法
function enhancedMarkdownParse(content, showEscapedChars = false) {
    if (!content) return '';
    content = String(content); // 确保是字符串
    let result = content;

    try {
        // 处理HTML标签转义显示
        if (showEscapedChars) {
            result = showEscapedHtml(result);
        }

        // 处理粗体 **text** 或 __text__
        result = handleBoldAndItalic(result, showEscapedChars, /(?:\*\*|__)(.*?)(?:\*\*|__)/g, 'strong');

        // 处理斜体 *text* 或 _text_
        result = handleBoldAndItalic(result, showEscapedChars, /(?:\*|_)(.*?)(?:\*|_)/g, 'em');

        // 处理代码块 ```code```
        result = handleCodeBlocks(result, showEscapedChars, /```([\s\S]*?)```/g);

        // 处理行内代码 `code`
        result = handleInlineCode(result, showEscapedChars, /`(.*?)`/g);

        // 处理标题 # Title
        result = handleHeaders(result, showEscapedChars, /^(#{1,6})\s+(.*?)$/gm);

        // 处理无序列表 - item
        result = handleUnorderedList(result, showEscapedChars, /^(\s*-\s+)(.*?)$/gm);

        // 处理引用 > text
        result = handleBlockquote(result, showEscapedChars, /^(\s*>\s+)(.*?)$/gm);

        // 处理Markdown链接 [text](url)
        result = handleLinks(result, showEscapedChars, /\[(.*?)\]\((.*?)\)/g);

        // 处理图片 ![alt](url)
        result = handleImages(result, showEscapedChars, /!\[(.*?)\]\((.*?)\)/g);

        // 处理纯URL链接
        result = handleUrls(result, showEscapedChars, /(?:^|\s)(https?:\/\/[^\s<>]+)(?![^<>]*>)/g);
    } catch (e) {
        console.error('解析Markdown时出错:', e);
    }

    return result;
}

function handleBoldAndItalic(text, showEscapedChars, regex, tag) {
    return text.replace(regex, function (match, content) {
        const escapedContent = escapeText(content, showEscapedChars);
        return `<${tag}>${escapedContent}</${tag}>`;
    });
}

function handleCodeBlocks(text, showEscapedChars, regex) {
    return text.replace(regex, function (match, code) {
        const escapedCode = escapeText(code, showEscapedChars);
        return `<pre><code>${escapedCode}</code></pre>`;
    });
}

function handleInlineCode(text, showEscapedChars, regex) {
    return text.replace(regex, function (match, code) {
        const escapedCode = escapeText(code, showEscapedChars);
        return `<code>${escapedCode}</code>`;
    });
}

function handleHeaders(text, showEscapedChars, regex) {
    return text.replace(regex, function (match, hashes, title) {
        const level = hashes.length;
        const escapedTitle = escapeText(title, showEscapedChars);
        return `<h${level}>${escapedTitle}</h${level}>`;
    });
}

function handleUnorderedList(text, showEscapedChars, regex) {
    return text.replace(regex, function (match, indent, item) {
        const escapedItem = escapeText(item, showEscapedChars);
        return `<li>${escapedItem}</li>`;
    });
}

function handleBlockquote(text, showEscapedChars, regex) {
    return text.replace(regex, function (match, indent, text) {
        const escapedText = escapeText(text, showEscapedChars);
        return `<blockquote>${escapedText}</blockquote>`;
    });
}

function handleLinks(text, showEscapedChars, regex) {
    return text.replace(regex, function (match, text, url) {
        const cleanUrl = simpleValidateUrl(url);
        const cleanText = escapeText(text || cleanUrl || match, showEscapedChars);
        if (!cleanUrl) {
            return cleanText;
        }
        return `<a href="${simpleEscapeHtml(cleanUrl)}" target="_blank" rel="noopener noreferrer">${cleanText}</a>`;
    });
}

function handleImages(text, showEscapedChars, regex) {
    return text.replace(regex, function (match, alt, url) {
        const cleanUrl = simpleValidateUrl(url);
        const cleanAlt = escapeText(alt || '图片', showEscapedChars);
        if (!cleanUrl) {
            return `[图片: ${cleanAlt}]`;
        }
        return `<img src="${simpleEscapeHtml(cleanUrl)}" alt="${cleanAlt}" class="message-image">`;
    });
}

function handleUrls(text, showEscapedChars, regex) {
    return text.replace(regex, function (match) {
        const url = match.trim();
        const cleanUrl = simpleValidateUrl(url);
        if (!cleanUrl) {
            return match;
        }
        return ` <a href="${simpleEscapeHtml(cleanUrl)}" target="_blank" rel="noopener noreferrer">${escapeText(url, showEscapedChars)}</a>`;
    });
}

function escapeText(text, showEscapedChars) {
    return showEscapedChars ? showEscapedHtml(text) : simpleEscapeHtml(text);
}