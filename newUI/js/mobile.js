// 手机适配逻辑

// 设备检测函数 - 只识别真正的手机设备，排除平板和PC
function isMobileDevice() {
    // 获取设备信息
    const userAgent = navigator.userAgent.toLowerCase();
    const width = window.innerWidth;
    
    // 平板设备关键字
    const tabletKeywords = ['ipad', 'android.*tablet', 'kindle', 'silk', 'playbook', 'tablet'];
    const isTablet = tabletKeywords.some(keyword => {
        const regex = new RegExp(keyword, 'i');
        return regex.test(userAgent);
    });
    
    // 手机设备关键字
    const mobileKeywords = ['android.*mobile', 'iphone', 'ipod', 'windows phone', 'blackberry', 'nokia', 'opera mini', 'mobile'];
    const isMobile = mobileKeywords.some(keyword => {
        const regex = new RegExp(keyword, 'i');
        return regex.test(userAgent);
    });
    
    // 精确的屏幕宽度检测，只将小屏幕手机识别为移动设备
    // 手机屏幕宽度通常小于768px，平板设备通常大于等于768px
    const isSmallScreen = width < 768;
    
    // 只有同时满足以下条件才识别为手机设备：
    // 1. 包含手机设备关键字
    // 2. 不是平板设备
    // 3. 屏幕宽度小于768px
    return isMobile && !isTablet && isSmallScreen;
}

// 手机适配主函数
function initializeMobileAdaptation() {
    // 检查是否为手机设备
    if (isMobileDevice()) {
        // 隐藏桌面版聊天界面
        const mainChat = document.getElementById('main-chat');
        if (mainChat) {
            mainChat.style.display = 'none';
        }
        
        // 显示手机版聊天界面
        const mobileChat = document.getElementById('mobile-chat');
        if (mobileChat) {
            mobileChat.style.display = 'flex';
        }
        
        // 为原JS代码创建元素别名，确保DOM操作正常工作
        createElementAliases();
        
        // 初始化手机界面
        initializeMobileUI();
    }
}

// 为原JS代码创建元素别名，确保DOM操作正常工作
function createElementAliases() {
    // 为关键元素创建别名，确保原JS代码可以通过原来的ID访问到手机设备的元素
    const aliasMap = {
        'messageContainer': 'mobileMessageContainer',
        'groupMessageContainer': 'mobileMessageContainer',
        'messageInput': 'mobileMessageInput',
        'groupMessageInput': 'mobileMessageInput',
        'sendButton': 'mobileSendButton',
        'sendGroupMessage': 'mobileSendButton',
        'currentUserAvatar': 'mobileCurrentUserAvatar',
        'userInitials': 'mobileUserName'
    };
    
    // 创建元素别名
    Object.keys(aliasMap).forEach(originalId => {
        const mobileId = aliasMap[originalId];
        const mobileElement = document.getElementById(mobileId);
        
        if (mobileElement && !document.getElementById(originalId)) {
            // 如果原ID不存在，则创建一个别名元素
            const aliasElement = document.createElement('div');
            aliasElement.id = originalId;
            aliasElement.style.display = 'none';
            document.body.appendChild(aliasElement);
            
            // 重写document.getElementById函数，让它在找不到原元素时返回手机元素
            const originalGetElementById = document.getElementById;
            document.getElementById = function(id) {
                const result = originalGetElementById.call(this, id);
                if (!result && aliasMap[id]) {
                    return originalGetElementById.call(this, aliasMap[id]);
                }
                return result;
            };
        }
    });
    
    // 重写querySelector和querySelectorAll函数，确保它们也能正确处理手机元素
    const originalQuerySelector = document.querySelector;
    document.querySelector = function(selector) {
        let result = originalQuerySelector.call(this, selector);
        if (!result) {
            // 处理#messageContainer和#groupMessageContainer选择器
            if (selector === '#messageContainer' || selector === '#groupMessageContainer') {
                result = originalQuerySelector.call(this, '#mobileMessageContainer');
            }
        }
        return result;
    };
    
    const originalQuerySelectorAll = document.querySelectorAll;
    document.querySelectorAll = function(selector) {
        let results = originalQuerySelectorAll.call(this, selector);
        if (results.length === 0) {
            // 处理包含#messageContainer或#groupMessageContainer的选择器
            if (selector.includes('#messageContainer') || selector.includes('#groupMessageContainer')) {
                results = originalQuerySelectorAll.call(this, '#mobileMessageContainer');
            }
        }
        return results;
    };
}

// 初始化手机界面
function initializeMobileUI() {
    // 初始化侧边菜单
    initializeMobileSidebar();
    
    // 初始化消息发送功能
    initializeMobileMessageSending();
    
    // 初始化设备检测函数
    window.isMobileDevice = isMobileDevice;
}

// 初始化手机侧边菜单
function initializeMobileSidebar() {
    const menuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('mobileSidebar');
    const overlay = document.querySelector('.mobile-sidebar-overlay');
    
    if (menuBtn && sidebar && overlay) {
        // 打开侧边菜单
        menuBtn.addEventListener('click', function() {
            sidebar.classList.add('active');
            overlay.classList.add('active');
        });
        
        // 关闭侧边菜单
        function closeSidebar() {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        }
        
        // 点击遮罩关闭侧边菜单
        overlay.addEventListener('click', closeSidebar);
        
        // 点击菜单项关闭侧边菜单
        const menuItems = document.querySelectorAll('.mobile-menu-item');
        menuItems.forEach(item => {
            item.addEventListener('click', function() {
                // 移除所有菜单项的active类
                menuItems.forEach(i => i.classList.remove('active'));
                // 添加当前菜单项的active类
                this.classList.add('active');
                // 关闭侧边菜单
                closeSidebar();
            });
        });
    }
}

// 初始化手机消息发送功能
function initializeMobileMessageSending() {
    const messageInput = document.getElementById('mobileMessageInput');
    const sendButton = document.getElementById('mobileSendButton');
    
    if (messageInput && sendButton) {
        // 点击发送按钮发送消息
        sendButton.addEventListener('click', function() {
            sendMobileMessage();
        });
        
        // 按Enter发送消息
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                e.preventDefault();
                sendMobileMessage();
            }
        });
    }
}

// 发送手机消息
function sendMobileMessage() {
    const messageInput = document.getElementById('mobileMessageInput');
    const content = messageInput.textContent.trim() || messageInput.innerHTML.trim();
    
    if (content && isConnected && window.chatSocket) {
        // 使用Socket.io发送消息
        const messageData = {
            content: content,
            groupId: null, // 公共聊天时groupId为null
            sessionToken: currentSessionToken,
            userId: currentUser.id
        };
        
        window.chatSocket.emit('send-message', messageData);
        
        // 清空输入框
        messageInput.innerHTML = '';
    }
}

// 将设备检测函数暴露为全局变量，以便原JS代码可以使用
window.isMobileDevice = isMobileDevice;

// 全局函数：获取当前设备对应的元素ID
window.getDeviceElementId = function(baseId) {
    // 检查是否为手机设备
    const isMobile = isMobileDevice();
    
    // 设备元素ID映射
    const deviceElementMap = {
        'messageContainer': isMobile ? 'mobileMessageContainer' : 'messageContainer',
        'groupMessageContainer': isMobile ? 'mobileMessageContainer' : 'groupMessageContainer',
        'messageInput': isMobile ? 'mobileMessageInput' : 'messageInput',
        'groupMessageInput': isMobile ? 'mobileMessageInput' : 'groupMessageInput',
        'sendButton': isMobile ? 'mobileSendButton' : 'sendButton',
        'sendGroupMessage': isMobile ? 'mobileSendButton' : 'sendGroupMessage',
        'currentUserAvatar': isMobile ? 'mobileCurrentUserAvatar' : 'currentUserAvatar',
        'userInitials': isMobile ? 'mobileUserName' : 'userInitials'
    };
    
    return deviceElementMap[baseId] || baseId;
};

// 全局函数：获取当前设备对应的消息容器
window.getMessageContainer = function(isGroupChat = false) {
    const containerId = isGroupChat ? 'groupMessageContainer' : 'messageContainer';
    const actualId = window.getDeviceElementId(containerId);
    return document.getElementById(actualId);
};

// 全局函数：获取当前设备对应的输入框
window.getMessageInput = function(isGroupChat = false) {
    const inputId = isGroupChat ? 'groupMessageInput' : 'messageInput';
    const actualId = window.getDeviceElementId(inputId);
    return document.getElementById(actualId);
};

// 全局函数：获取当前设备对应的发送按钮
window.getSendButton = function(isGroupChat = false) {
    const buttonId = isGroupChat ? 'sendGroupMessage' : 'sendButton';
    const actualId = window.getDeviceElementId(buttonId);
    return document.getElementById(actualId);
};

// 监听DOM加载完成事件，初始化手机适配
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMobileAdaptation);
} else {
    // DOM已经加载完成，直接初始化
    initializeMobileAdaptation();
}
