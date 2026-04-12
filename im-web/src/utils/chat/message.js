import { toast } from './config.js';
import { 
  getCurrentUser, 
  getCurrentSessionToken, 
  sessionStore 
} from './store.js';

let chatStore = null;
export function setChatStore(store) {
  chatStore = store;
}

export function getChatStore() {
  if (chatStore) return chatStore;
  if (typeof window !== 'undefined' && window.chatStore) return window.chatStore;
  return null;
}

export function escapeHtml(text) {
  if (typeof text !== 'string') return text;
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function unescapeHtml(html) {
  const text = document.createElement('textarea');
  text.innerHTML = html;
  return text.value;
}

function setCursorToEnd(element) {
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(element);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function formatFileSize(bytes) {
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

export function clearContentEditable(element) {
  if (!element) return;
  element.innerHTML = '';
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
  element.textContent = '';
  
  // 同步更新 store 中的 messageInput
  const store = window.chatStore;
  if (store) {
    if (element.id === 'messageInput') {
      store.mainMessageInput = '';
    } else if (element.id === 'groupMessageInput') {
      store.groupMessageInput = '';
    } else if (element.id === 'privateMessageInput') {
      store.privateMessageInput = '';
    }
  }
}

export function sendMessage() {
  const messageInput = document.getElementById('messageInput');
  if (!messageInput) return;
  
  // 创建一个临时容器处理内容，确保@标签转换为纯文本
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = messageInput.innerHTML;
  
  // 处理所有@用户标签，将它们转为纯文本
  const atUserElements = tempDiv.querySelectorAll('.chat-at-user');
  atUserElements.forEach(el => {
    const textNode = document.createTextNode(el.textContent);
    el.parentNode.replaceChild(textNode, el);
  });
  
  let content = tempDiv.innerHTML.trim();
  if (content) {
    content = content.replace(/<div>/g, '\n').replace(/<\/div>/g, '').replace(/<br>/g, '\n').replace(/<br\s*\/?>/g, '\n');
    content = content.trim();
    content = unescapeHtml(content);
  }
  if (!content) {
    content = tempDiv.textContent.trim() || '';
  }
  
  const currentUser = getCurrentUser();
  const currentSessionToken = getCurrentSessionToken();

  if (content && window.chatSocket) {
    const activeChat = window.currentActiveChat || 'main';
    let groupId = null;
    if (activeChat !== 'main') {
      if (activeChat.startsWith('group_')) {
        groupId = activeChat.replace('group_', '');
      } else {
        groupId = activeChat;
      }
    }
    
    const quotedMessage = getChatStore()?.quotedMessage;
    
    // 获取 Markdown 工具栏状态
    const showMarkdownToolbar = document.querySelector('.toggle-btn')?.textContent?.includes('隐藏') || false;
    
    // 提取 @用户 ID
    const atUserElements = messageInput.querySelectorAll('.chat-at-user');
    const atUserIds = [];
    atUserElements.forEach(el => {
      if (el.dataset.id) {
        atUserIds.push(el.dataset.id);
      }
    });
    
    let messageContent = content;
    if (quotedMessage) {
      messageContent = JSON.stringify({
        type: 'quoted',
        text: content,
        quoted: {
          id: quotedMessage.id,
          userId: quotedMessage.userId,
          nickname: quotedMessage.nickname,
          content: quotedMessage.content,
          messageType: quotedMessage.messageType || 0
        },
        markdone: showMarkdownToolbar
      });
    }
    
    const messageData = {
      content: messageContent,
      groupId: groupId,
      sessionToken: currentSessionToken,
      userId: currentUser.id,
      at_userid: atUserIds
    };
    
    // 消息类型逻辑：
    // 1. 如果有引用消息，类型为 4（引用消息），优先级最高
    // 2. 如果展开了 MD 工具栏且没有引用消息，类型为 5（MD 消息）
    // 3. 否则类型为 0（普通文本）
    if (quotedMessage) {
      messageData.messageType = 4;
    } else if (showMarkdownToolbar) {
      messageData.messageType = 5;
    }
    
    // 清空输入框
    clearContentEditable(messageInput);
    
    // 设置超时处理：5秒内没有收到确认则提示失败
    const failedContent = content;
    const timeoutKey = 'sendMessage_' + Date.now();
    const sendTime = Date.now(); // 记录发送时间
    
    window._messageSendTimeouts = window._messageSendTimeouts || {};
    window._lastMessageSendTime = sendTime; // 记录最后一次消息发送时间
    
    window._messageSendTimeouts[timeoutKey] = setTimeout(() => {
      // 超时后将内容填充回输入框
      const input = document.getElementById('messageInput');
      if (input) {
        input.innerHTML = failedContent;
        setCursorToEnd(input);
      }
      // 显示失败提示
      toast.error('消息发送超时，请检查网络后重试');
      // 清理超时记录
      delete window._messageSendTimeouts[timeoutKey];
    }, 5000);
    
    // 监听确认事件（一次性）
    const messageSentHandler = (data) => {
      // 检查是否是速率限制错误
      if (data.success === false && data.error) {
        // 清除超时定时器
        const timeout = window._messageSendTimeouts[timeoutKey];
        if (timeout) {
          clearTimeout(timeout);
          delete window._messageSendTimeouts[timeoutKey];
        }
        // 移除事件监听
        window.chatSocket.off('message-sent', messageSentHandler);
        
        // 将消息内容填充回输入框
        const input = document.getElementById('messageInput');
        if (input) {
          input.innerHTML = failedContent;
          setCursorToEnd(input);
        }
        // 显示速率限制提示
        toast.error(data.error.message);
        return;
      }
      
      // 正常消息确认
      if (data.message && data.messageId) {
        // 清除超时定时器
        const timeout = window._messageSendTimeouts[timeoutKey];
        if (timeout) {
          clearTimeout(timeout);
          delete window._messageSendTimeouts[timeoutKey];
        }
        // 移除事件监听
        window.chatSocket.off('message-sent', messageSentHandler);
        
        // 清除主聊天室草稿
        const store = getChatStore();
        if (store && store.clearDraft) {
          store.clearDraft('main');
        }
      }
    };
    window.chatSocket.on('message-sent', messageSentHandler);
    
    window.chatSocket.emit('send-message', messageData);
    
    if (quotedMessage) {
      getChatStore()?.clearQuotedMessage();
    }
  }
}

export function sendGroupMessage() {
  const currentGroupId = sessionStore.currentGroupId;
  if (!currentGroupId) {
    console.warn('⚠️  无法发送群组消息 - 未选择群组');
    return;
  }

  const groupMessageInput = document.getElementById('groupMessageInput');
  if (!groupMessageInput) {
    console.error('❌ 无法获取群组消息输入框 - 元素不存在');
    return;
  }

  let content = '';
  if (groupMessageInput.tagName === 'DIV' && groupMessageInput.isContentEditable) {
    // 创建一个临时容器处理内容，确保@标签转换为纯文本
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = groupMessageInput.innerHTML;
    
    // 处理所有@用户标签，将它们转为纯文本
    const atUserElements = tempDiv.querySelectorAll('.chat-at-user');
    atUserElements.forEach(el => {
      const textNode = document.createTextNode(el.textContent);
      el.parentNode.replaceChild(textNode, el);
    });
    
    let htmlContent = tempDiv.innerHTML.trim();
    if (htmlContent) {
      htmlContent = htmlContent.replace(/<div>/g, '\n').replace(/<\/div>/g, '').replace(/<br>/g, '\n').replace(/<br\s*\/?>/g, '\n');
      content = htmlContent.trim();
      content = unescapeHtml(content);
    }
    if (!content) {
      content = tempDiv.textContent.trim();
    }
  } else {
    content = groupMessageInput.value || groupMessageInput.innerHTML || '';
    content = content.trim();
  }

  const currentUser = getCurrentUser();
  const currentSessionToken = getCurrentSessionToken();

  if (content && window.chatSocket) {
    const quotedMessage = getChatStore()?.quotedMessage;
    
    // 检查 MD 工具栏是否展开
    const showMarkdownToolbar = document.querySelector('.toggle-btn')?.textContent?.includes('隐藏') || false;
    
    // 提取 @用户 ID
    const atUserElements = groupMessageInput.querySelectorAll('.chat-at-user');
    const atUserIds = [];
    atUserElements.forEach(el => {
      if (el.dataset.id) {
        atUserIds.push(el.dataset.id);
      }
    });
    
    let messageContent = content;
    if (quotedMessage) {
      messageContent = JSON.stringify({
        type: 'quoted',
        text: content,
        quoted: {
          id: quotedMessage.id,
          userId: quotedMessage.userId,
          nickname: quotedMessage.nickname,
          content: quotedMessage.content,
          messageType: quotedMessage.messageType || 0
        },
        markdone: showMarkdownToolbar
      });
    }
    
    const messageData = {
      groupId: currentGroupId,
      content: messageContent,
      sessionToken: currentSessionToken,
      userId: currentUser.id,
      at_userid: atUserIds
    };
    
    // 消息类型逻辑：
    // 1. 如果有引用消息，类型为 4（引用消息），优先级最高
    // 2. 如果展开了 MD 工具栏且没有引用消息，类型为 5（MD 消息）
    // 3. 否则类型为 0（普通文本）
    if (quotedMessage) {
      messageData.messageType = 4;
    } else if (showMarkdownToolbar) {
      messageData.messageType = 5;
    }
    
    // 清空输入框
    if (groupMessageInput.tagName === 'TEXTAREA') {
      groupMessageInput.value = '';
    } else {
      clearContentEditable(groupMessageInput);
    }
    
    // 设置超时处理：5秒内没有收到确认则提示失败
    const failedContent = content;
    const timeoutKey = 'sendGroupMessage_' + Date.now();
    
    window._messageSendTimeouts = window._messageSendTimeouts || {};
    window._messageSendTimeouts[timeoutKey] = setTimeout(() => {
      // 超时后将内容填充回输入框
      const input = document.getElementById('groupMessageInput');
      if (input) {
        if (input.tagName === 'TEXTAREA') {
          input.value = failedContent;
          input.focus();
          input.setSelectionRange(failedContent.length, failedContent.length);
        } else {
          input.innerHTML = failedContent;
          setCursorToEnd(input);
        }
      }
      // 显示失败提示
      toast.error('消息发送超时，请检查网络后重试');
      // 清理超时记录
      delete window._messageSendTimeouts[timeoutKey];
    }, 5000);
    
    // 监听确认事件（一次性）
    const messageSentHandler = (data) => {
      // 检查是否是速率限制错误
      if (data.success === false && data.error) {
        // 清除超时定时器
        const timeout = window._messageSendTimeouts[timeoutKey];
        if (timeout) {
          clearTimeout(timeout);
          delete window._messageSendTimeouts[timeoutKey];
        }
        // 移除事件监听
        window.chatSocket.off('message-sent', messageSentHandler);
        
        // 将消息内容填充回输入框
        const input = document.getElementById('groupMessageInput');
        if (input) {
          if (input.tagName === 'TEXTAREA') {
            input.value = failedContent;
            input.focus();
            input.setSelectionRange(failedContent.length, failedContent.length);
          } else {
            input.innerHTML = failedContent;
            setCursorToEnd(input);
          }
        }
        // 显示速率限制提示
        toast.error(data.error.message);
        return;
      }
      
      // 正常消息确认
      if (data.message && data.messageId && String(data.message.groupId) === String(currentGroupId)) {
        // 清除超时定时器
        const timeout = window._messageSendTimeouts[timeoutKey];
        if (timeout) {
          clearTimeout(timeout);
          delete window._messageSendTimeouts[timeoutKey];
        }
        // 移除事件监听
        window.chatSocket.off('message-sent', messageSentHandler);
        
        // 清除群组草稿
        const store = getChatStore();
        if (store && store.clearDraft) {
          store.clearDraft('group', currentGroupId);
        }
      }
    };
    window.chatSocket.on('message-sent', messageSentHandler);
    
    window.chatSocket.emit('send-message', messageData);
    
    if (quotedMessage) {
      getChatStore()?.clearQuotedMessage();
    }
  }
}

export function sendPrivateMessage() {
  const currentUser = getCurrentUser();
  const currentSessionToken = getCurrentSessionToken();
  const currentPrivateChatUserId = sessionStore.currentPrivateChatUserId;
  
  if (!currentUser || !currentSessionToken || !currentPrivateChatUserId) return;

  const privateMessageInput = document.getElementById('privateMessageInput');
  if (!privateMessageInput) return;

  // 创建一个临时容器处理内容，确保@标签转换为纯文本
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = privateMessageInput.innerHTML;
  
  // 处理所有@用户标签，将它们转为纯文本
  const atUserElements = tempDiv.querySelectorAll('.chat-at-user');
  atUserElements.forEach(el => {
    const textNode = document.createTextNode(el.textContent);
    el.parentNode.replaceChild(textNode, el);
  });
  
  let content = tempDiv.innerHTML.trim();
  if (content) {
    content = content.replace(/<div>/g, '\n').replace(/<\/div>/g, '').replace(/<br>/g, '\n').replace(/<br\s*\/?>/g, '\n');
    content = content.trim();
    content = unescapeHtml(content);
  }
  if (!content) {
    content = tempDiv.textContent.trim();
  }
  if (!content) return;
  
  const quotedMessage = getChatStore()?.quotedMessage;

  // 检查 MD 工具栏是否展开
  const showMarkdownToolbar = document.querySelector('#privateInputButtons .toggle-btn')?.textContent?.includes('隐藏') || false;
  
  const atUserIds = [];
  atUserElements.forEach(el => {
    if (el.dataset.id) {
      atUserIds.push(el.dataset.id);
    }
  });

  let messageContent = content;
  if (quotedMessage) {
    messageContent = JSON.stringify({
      content: content,
      quotedMessage: {
        id: quotedMessage.id,
        userId: quotedMessage.userId,
        nickname: quotedMessage.nickname,
        content: quotedMessage.content,
        messageType: quotedMessage.messageType || 0,
        markdone: showMarkdownToolbar
      }
    });
  }
  
  const messageData = {
    userId: currentUser.id,
    content: messageContent,
    receiverId: currentPrivateChatUserId,
    sessionToken: currentSessionToken,
    at_userid: atUserIds
  };
  
  // 消息类型逻辑：
  // 1. 如果有引用消息，类型为 4（引用消息），优先级最高
  // 2. 如果展开了 MD 工具栏且没有引用消息，类型为 5（MD 消息）
  // 3. 否则类型为 0（普通文本）
  if (quotedMessage) {
    messageData.message_type = 4;
  } else if (showMarkdownToolbar) {
    messageData.message_type = 5;
  }
  
  if (window.chatSocket) {
    // 清空输入框
    clearContentEditable(privateMessageInput);
    
    // 设置超时处理：5秒内没有收到确认则提示失败
    const failedContent = content;
    const timeoutKey = 'sendPrivateMessage_' + Date.now();
    
    window._messageSendTimeouts = window._messageSendTimeouts || {};
    window._messageSendTimeouts[timeoutKey] = setTimeout(() => {
      // 超时后将内容填充回输入框
      const input = document.getElementById('privateMessageInput');
      if (input) {
        input.innerHTML = failedContent;
        setCursorToEnd(input);
      }
      // 显示失败提示
      toast.error('消息发送超时，请检查网络后重试');
      // 清理超时记录
      delete window._messageSendTimeouts[timeoutKey];
    }, 5000);
    
    // 监听确认事件（一次性）
    const privateMessageSentHandler = (data) => {
      // 检查是否是速率限制错误
      if (data.success === false && data.error) {
        // 清除超时定时器
        const timeout = window._messageSendTimeouts[timeoutKey];
        if (timeout) {
          clearTimeout(timeout);
          delete window._messageSendTimeouts[timeoutKey];
        }
        // 移除事件监听
        window.chatSocket.off('private-message-sent', privateMessageSentHandler);
        
        // 将消息内容填充回输入框
        const input = document.getElementById('privateMessageInput');
        if (input) {
          input.innerHTML = failedContent;
          setCursorToEnd(input);
        }
        // 显示速率限制提示
        toast.error(data.error.message);
        return;
      }
      
      // 正常消息确认
      if (data.message && data.messageId) {
        // 清除超时定时器
        const timeout = window._messageSendTimeouts[timeoutKey];
        if (timeout) {
          clearTimeout(timeout);
          delete window._messageSendTimeouts[timeoutKey];
        }
        // 移除事件监听
        window.chatSocket.off('private-message-sent', privateMessageSentHandler);
        
        // 清除私信草稿
        const store = getChatStore();
        if (store && store.clearDraft) {
          store.clearDraft('private', currentPrivateChatUserId);
        }
      }
    };
    window.chatSocket.on('private-message-sent', privateMessageSentHandler);
    
    window.chatSocket.emit('send-private-message', messageData);
    
    if (quotedMessage) {
      getChatStore()?.clearQuotedMessage();
    }
  }
}
