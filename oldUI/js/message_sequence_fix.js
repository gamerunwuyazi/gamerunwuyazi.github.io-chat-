// 消息序号修复功能 - 解决消息重复渲染和排序错误问题

// 此模块提供修复消息排序和去重的功能
// 它会在收到新消息时使用sequence字段进行正确排序

(function() {
    // 存储消息ID的集合，用于去重
    const globalMessageIds = new Set();
    const groupMessageIds = new Map(); // key: groupId, value: Set of message IDs
    
    // 全局消息容器引用
    let messageContainer = null;
    // 群组消息容器引用
    let groupMessageContainer = null;
    // 当前群组ID
    let currentGroupId = null;
    
    // 初始化函数
    function initMessageSequenceFix() {

        
        // 获取DOM元素引用
        messageContainer = document.getElementById('messageContainer');
        groupMessageContainer = document.getElementById('groupMessageContainer');
        
        // 监听DOM变化，确保我们能及时获取到最新的DOM元素
        const observer = new MutationObserver(() => {
            if (!messageContainer) messageContainer = document.getElementById('messageContainer');
            if (!groupMessageContainer) groupMessageContainer = document.getElementById('groupMessageContainer');
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // 保存原始的addMessage函数
        window.originalAddMessage = window.addMessage;
        
        // 重写addMessage函数，添加去重逻辑
        window.addMessage = function(message, isOwn, isGroupChat, isLoadMore = false) {
            // 如果消息已经存在，则不添加
            if (isGroupChat && currentGroupId) {
                if (!groupMessageIds.has(currentGroupId)) {
                    groupMessageIds.set(currentGroupId, new Set());
                }
                const groupMsgIds = groupMessageIds.get(currentGroupId);
                
                if (groupMsgIds.has(message.id)) {
                    return;
                }
                
                groupMsgIds.add(message.id);
            } else {
                if (globalMessageIds.has(message.id)) {
                    return;
                }
                
                globalMessageIds.add(message.id);
            }
            
            // 调用原始的addMessage函数
            window.originalAddMessage(message, isOwn, isGroupChat, isLoadMore);
        };
        
        // 监听群组切换事件
        window.addEventListener('groupChanged', (event) => {
                currentGroupId = event.detail.groupId;
            });
        
        // 为现有消息添加去重功能
    // 使用延迟执行，确保DOM中已经有消息元素
    setTimeout(addMessageDeduplicationToExistingMessages, 500);
        
        // 监听聊天历史事件，确保使用sequence字段进行正确排序
        if (window.socket) {
            // 保存原始的chat-history事件处理器
            const originalChatHistoryHandler = window.socket._chatHistoryHandler;
            
            // 监听全局聊天历史
            window.socket.on('chat-history', function(data) {
                // 确保数据有效
                if (!data || !data.messages) {
                    if (originalChatHistoryHandler) {
                        originalChatHistoryHandler(data);
                    }
                    return;
                }
                
                // 优先使用sequence字段排序，如果没有则回退到timestamp
                if (data.messages.length > 0 && typeof data.messages[0].sequence === 'number') {

                    // 按sequence升序排序（最早的消息在前）
                    data.messages.sort((a, b) => a.sequence - b.sequence);
                } else {

                    // 按timestamp升序排序
                    data.messages.sort((a, b) => a.timestamp - b.timestamp);
                }
                
                // 去重
                const uniqueMessages = [];
                const seenIds = new Set();
                
                data.messages.forEach(msg => {
                    if (!seenIds.has(msg.id)) {
                        seenIds.add(msg.id);
                        uniqueMessages.push(msg);
                        
                        // 同时更新全局消息ID集合
                        if (!globalMessageIds.has(msg.id)) {
                            globalMessageIds.add(msg.id);
                        }
                    }
                });
                
                data.messages = uniqueMessages;
                
                // 不再调用原始的事件处理器，直接使用我们自己的渲染函数
                // 避免index.js中的反转操作干扰我们已经排好序的消息
                renderMessages(data, false);
                
                // 确保重置加载状态，无论是否调用了原始处理器
                window.isLoadingMoreMessages = false;
            });
            
            // 保存原始的group-chat-history事件处理器
            const originalGroupChatHistoryHandler = window.socket._groupChatHistoryHandler;
            
            // 监听群组聊天历史
            window.socket.on('group-chat-history', function(data) {
                // 确保数据有效
                if (!data || !data.messages || !data.groupId) {
                    if (originalGroupChatHistoryHandler) {
                        originalGroupChatHistoryHandler(data);
                    }
                    return;
                }
                
                // 优先使用sequence字段排序，如果没有则回退到timestamp
                if (data.messages.length > 0 && typeof data.messages[0].sequence === 'number') {

                    // 按sequence升序排序（最早的消息在前）
                    data.messages.sort((a, b) => a.sequence - b.sequence);
                } else {

                    // 按timestamp升序排序
                    data.messages.sort((a, b) => a.timestamp - b.timestamp);
                }
                
                // 去重
                const uniqueMessages = [];
                const seenIds = new Set();
                
                data.messages.forEach(msg => {
                    if (!seenIds.has(msg.id)) {
                        seenIds.add(msg.id);
                        uniqueMessages.push(msg);
                        
                        // 同时更新群组消息ID集合
                        if (!groupMessageIds.has(data.groupId)) {
                            groupMessageIds.set(data.groupId, new Set());
                        }
                        const groupMsgIds = groupMessageIds.get(data.groupId);
                        if (!groupMsgIds.has(msg.id)) {
                            groupMsgIds.add(msg.id);
                        }
                    }
                });
                
                data.messages = uniqueMessages;
                
                // 不再调用原始的事件处理器，直接使用我们自己的渲染函数
                // 避免index.js中的反转操作干扰我们已经排好序的消息
                renderMessages(data, true);
                
                // 确保重置加载状态，无论是否调用了原始处理器
                window.isLoadingMoreMessages = false;
            });
        }
        

    }
    
    // 为现有消息添加去重功能
    function addMessageDeduplicationToExistingMessages() {
        if (!messageContainer) return;
        
        // 获取所有消息元素
        const messageElements = document.querySelectorAll('.message');

        
        // 遍历所有消息元素，提取ID并添加到去重集合
        messageElements.forEach(element => {
            const messageId = element.getAttribute('data-message-id');
            const groupId = element.closest('#groupMessageContainer') ? currentGroupId : null;
            
            if (messageId) {
                if (groupId) {
                    if (!groupMessageIds.has(groupId)) {
                        groupMessageIds.set(groupId, new Set());
                    }
                    groupMessageIds.get(groupId).add(messageId);
                } else {
                    globalMessageIds.add(messageId);
                }
            }
        });
    }
    
    // 渲染消息的辅助函数 - 一次性渲染所有消息
            function renderMessages(data, isGroupChat) {
                if (!data || !data.messages) return;
                
                const container = isGroupChat ? groupMessageContainer : messageContainer;
                
                if (!container) return;
                
                // 记录加载前的滚动高度（用于加载更多时保持滚动位置）
                let prevScrollHeight = 0;
                if (data.loadMore && container) {
                    prevScrollHeight = container.scrollHeight;

                }
                
                // 清空容器
                if (!data.loadMore) {
                    container.innerHTML = '';
                }
                
                // 一次性渲染所有消息
                data.messages.forEach(message => {
                    const msgIsOwn = window.currentUser && message.userId == window.currentUser.id;
                    window.addMessage(message, msgIsOwn, isGroupChat, data.loadMore);
                });
                
                // 向上滚动加载时保持滚动位置
                if (data.loadMore && container && prevScrollHeight > 0) {
                    const newScrollHeight = container.scrollHeight;
                    const heightDifference = newScrollHeight - prevScrollHeight;
                    container.scrollTop = container.scrollTop + heightDifference;

                } else if (!data.loadMore && container) {
                    // 非加载更多时滚动到底部
                    container.scrollTop = container.scrollHeight;
                }
                
                // 确保重置加载状态

                window.isLoadingMoreMessages = false;
                
                // 清除加载提示
                const loadingIndicators = document.querySelectorAll('.loading-indicator');
                loadingIndicators.forEach(el => el.remove());
            }
    
    // 暴露一些方法给外部使用
    window.messageSequenceFix = {
        init: initMessageSequenceFix,
        clearMessageCache: function() {
                globalMessageIds.clear();
                groupMessageIds.clear();
            },
        setCurrentGroupId: function(groupId) {
            currentGroupId = groupId;
        }
    };
    
    // 在DOM加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMessageSequenceFix);
    } else {
        initMessageSequenceFix();
    }
})();