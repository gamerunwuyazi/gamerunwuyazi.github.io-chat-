import { SERVER_URL, toast } from './config.js';
import { 
  getStore, 
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

export function sendMessage() {
  const messageInput = document.getElementById('messageInput');
  if (!messageInput) return;
  
  let content = messageInput.innerHTML.trim();
  if (content) {
    content = content.replace(/<div>/g, '\n').replace(/<\/div>/g, '').replace(/<br>/g, '\n').replace(/<br\s*\/?>/g, '\n');
    content = content.trim();
  }
  if (!content) {
    content = messageInput.textContent.trim() || '';
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
    
    const messageData = {
      content: content,
      groupId: groupId,
      sessionToken: currentSessionToken,
      userId: currentUser.id
    };
    
    if (quotedMessage) {
      messageData.message_type = 4;
      messageData.quotedMessage = {
        id: quotedMessage.id,
        userId: quotedMessage.userId,
        nickname: quotedMessage.nickname,
        content: quotedMessage.content,
        messageType: quotedMessage.messageType || 0
      };
    }
    
    window.chatSocket.emit('send-message', messageData);
    messageInput.innerHTML = '';
    
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
    let htmlContent = groupMessageInput.innerHTML.trim();
    if (htmlContent) {
      htmlContent = htmlContent.replace(/<div>/g, '\n').replace(/<\/div>/g, '').replace(/<br>/g, '\n').replace(/<br\s*\/?>/g, '\n');
      content = htmlContent.trim();
    }
    if (!content) {
      content = groupMessageInput.textContent.trim();
    }
  } else {
    content = groupMessageInput.value || groupMessageInput.innerHTML || '';
    content = content.trim();
  }

  const currentUser = getCurrentUser();
  const currentSessionToken = getCurrentSessionToken();

  if (content && window.chatSocket) {
    const quotedMessage = getChatStore()?.quotedMessage;
    
    const messageData = {
      groupId: currentGroupId,
      content: content,
      sessionToken: currentSessionToken,
      userId: currentUser.id
    };
    
    if (quotedMessage) {
      messageData.message_type = 4;
      messageData.quotedMessage = {
        id: quotedMessage.id,
        userId: quotedMessage.userId,
        nickname: quotedMessage.nickname,
        content: quotedMessage.content,
        messageType: quotedMessage.messageType || 0
      };
    }
    
    window.chatSocket.emit('send-message', messageData);
    if (groupMessageInput.tagName === 'TEXTAREA') {
      groupMessageInput.value = '';
    } else {
      groupMessageInput.innerHTML = '';
    }
    
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

  let content = privateMessageInput.innerHTML.trim();
  if (content) {
    content = content.replace(/<div>/g, '\n').replace(/<\/div>/g, '').replace(/<br>/g, '\n').replace(/<br\s*\/?>/g, '\n');
    content = content.trim();
  }
  if (!content) {
    content = privateMessageInput.innerText.trim();
  }
  if (!content) return;
  
  const quotedMessage = getChatStore()?.quotedMessage;

  const messageData = {
    userId: currentUser.id,
    content: content,
    receiverId: currentPrivateChatUserId,
    sessionToken: currentSessionToken
  };
  
  if (quotedMessage) {
    messageData.message_type = 4;
    messageData.quotedMessage = {
      id: quotedMessage.id,
      userId: quotedMessage.userId,
      nickname: quotedMessage.nickname,
      content: quotedMessage.content,
      messageType: quotedMessage.messageType || 0
    };
  }

  if (window.chatSocket) {
    window.chatSocket.emit('private-message', messageData);
  }

  privateMessageInput.innerHTML = '';
  
  if (quotedMessage) {
    getChatStore()?.clearQuotedMessage();
  }
}
