import { SERVER_URL, toast } from './config.js';
import { 
  getStore, 
  getCurrentUser, 
  getCurrentSessionToken, 
  sessionStore 
} from './store.js';

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
  
  const content = messageInput.textContent.trim() || messageInput.innerHTML.trim();
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
    const messageData = {
      content: content,
      groupId: groupId,
      sessionToken: currentSessionToken,
      userId: currentUser.id
    };
    window.chatSocket.emit('send-message', messageData);
    messageInput.innerHTML = '';
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
    content = groupMessageInput.textContent.trim();
    if (!content) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = groupMessageInput.innerHTML;
      content = tempDiv.textContent.trim();
    }
  } else {
    content = groupMessageInput.value || groupMessageInput.innerHTML || '';
    content = content.trim();
  }

  const currentUser = getCurrentUser();
  const currentSessionToken = getCurrentSessionToken();

  if (content && window.chatSocket) {
    const messageData = {
      groupId: currentGroupId,
      content: content,
      sessionToken: currentSessionToken,
      userId: currentUser.id
    };
    window.chatSocket.emit('send-message', messageData);
    if (groupMessageInput.tagName === 'TEXTAREA') {
      groupMessageInput.value = '';
    } else {
      groupMessageInput.innerHTML = '';
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

  const content = privateMessageInput.innerText.trim();
  if (!content) return;

  const messageData = {
    userId: currentUser.id,
    content: content,
    receiverId: currentPrivateChatUserId,
    sessionToken: currentSessionToken
  };

  if (window.chatSocket) {
    window.chatSocket.emit('private-message', messageData);
  }

  privateMessageInput.innerHTML = '';
}
