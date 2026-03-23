let internalCurrentUser = null;
let internalCurrentSessionToken = localStorage.getItem('currentSessionToken') || null;
let internalRefreshToken = localStorage.getItem('refreshToken') || null;

export function initChatStore(store) {
  window.chatStore = store;
}

export function getStore() {
  return window.chatStore;
}

export function getCurrentUser() {
  const store = getStore();
  if (store && store.currentUser) {
    return store.currentUser;
  }
  return internalCurrentUser || window.currentUser;
}

export function setCurrentUser(user) {
  internalCurrentUser = user;
  
  const store = getStore();
  if (store) {
    store.currentUser = user;
  }
  
  if (user) {
    localStorage.setItem('userId', user.id);
    // 不再保存 nickname 和 avatarUrl 到 localStorage，从后端 /self API 获取
  }
}

export function getCurrentSessionToken() {
  const store = getStore();
  if (store && store.currentSessionToken) {
    return store.currentSessionToken;
  }
  return internalCurrentSessionToken || window.currentSessionToken;
}

export function setCurrentSessionToken(token) {
  internalCurrentSessionToken = token;
  window.currentSessionToken = token;
  
  const store = getStore();
  if (store && store.setCurrentSessionToken) {
    store.setCurrentSessionToken(token);
  }
  
  if (token) {
    localStorage.setItem('currentSessionToken', token);
  } else {
    localStorage.removeItem('currentSessionToken');
  }
}

export function getRefreshToken() {
  const token = internalRefreshToken || localStorage.getItem('refreshToken');
  
  // 如果用户已登录但没有 refreshToken，跳转到登录页面
  const currentUser = getCurrentUser();
  const hasSession = localStorage.getItem('currentSessionToken');
  
  if (!token && (currentUser || hasSession)) {
    console.warn('用户已登录但未找到 refreshToken，即将跳转到登录页面');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentSessionToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('chatUserId');
    localStorage.removeItem('chatUserNickname');
    localStorage.removeItem('chatUserGender');
    window.location.href = '/login';
    return null;
  }
  
  return token;
}

export function setRefreshToken(token) {
  internalRefreshToken = token;
  
  if (token) {
    localStorage.setItem('refreshToken', token);
  } else {
    localStorage.removeItem('refreshToken');
  }
}

export const sessionStore = {
  get currentGroupId() { return getStore()?.currentGroupId; },
  set currentGroupId(val) { if(getStore()) getStore().currentGroupId = val; },
  get currentGroupName() { return getStore()?.currentGroupName; },
  set currentGroupName(val) { if(getStore()) getStore().currentGroupName = val; },
  get currentPrivateChatUserId() { return getStore()?.currentPrivateChatUserId; },
  set currentPrivateChatUserId(val) { if(getStore()) getStore().currentPrivateChatUserId = val; },
  get currentPrivateChatUsername() { return getStore()?.currentPrivateChatUsername; },
  set currentPrivateChatUsername(val) { if(getStore()) getStore().currentPrivateChatUsername = val; },
  get currentPrivateChatNickname() { return getStore()?.currentPrivateChatNickname; },
  set currentPrivateChatNickname(val) { if(getStore()) getStore().currentPrivateChatNickname = val; },
  get currentPrivateChatAvatarUrl() { return getStore()?.currentPrivateChatAvatarUrl; },
  set currentPrivateChatAvatarUrl(val) { if(getStore()) getStore().currentPrivateChatAvatarUrl = val; },
  get currentActiveChat() { return window.currentActiveChat || getStore()?.currentActiveChat; },
  set currentActiveChat(val) { 
    window.currentActiveChat = val;
    if(getStore()) getStore().currentActiveChat = val; 
  },
  get currentSendChatType() { return getStore()?.currentSendChatType; },
  set currentSendChatType(val) { if(getStore()) getStore().currentSendChatType = val; },
  get selectedGroupIdForCard() { return getStore()?.selectedGroupIdForCard; },
  set selectedGroupIdForCard(val) { if(getStore()) getStore().selectedGroupIdForCard = val; }
};

export const unreadMessages = {
  get global() { return getStore()?.unreadMessages?.global || 0; },
  set global(val) { if(getStore()) getStore().unreadMessages.global = val; },
  get groups() { return getStore()?.unreadMessages?.groups || {}; },
  set groups(val) { if(getStore()) getStore().unreadMessages.groups = val; },
  get private() { return getStore()?.unreadMessages?.private || {}; },
  set private(val) { if(getStore()) getStore().unreadMessages.private = val; }
};

let _currentActiveChatInternal = 'main';

if (typeof window !== 'undefined') {
  Object.defineProperty(window, '_chatJsActiveChatVar', {
    get: function() {
      return window.currentActiveChat || _currentActiveChatInternal || 'main';
    },
    set: function(val) {
      _currentActiveChatInternal = val;
      window.currentActiveChat = val;
    }
  });
  
  if (!window.currentActiveChat) {
    window.currentActiveChat = sessionStore.currentActiveChat || 'main';
  }
}

export function syncCurrentActiveChat() {
  const store = getStore();
  if (window.currentActiveChat && store && store.currentActiveChat !== window.currentActiveChat) {
    store.currentActiveChat = window.currentActiveChat;
  }
}

export function deletePublicMessage(messageId) {
  const store = getStore();
  if (store && store.publicMessages) {
    store.publicMessages = store.publicMessages.filter(m => m.id !== messageId);
  }
}

export function deleteGroupMessage(groupId, messageId) {
  const store = getStore();
  if (store && store.groupMessages && store.groupMessages[groupId]) {
    store.groupMessages[groupId] = store.groupMessages[groupId].filter(m => m.id !== messageId);
  }
}

export function deletePrivateMessage(userId, messageId) {
  const store = getStore();
  if (store && store.privateMessages && store.privateMessages[userId]) {
    store.privateMessages[userId] = store.privateMessages[userId].filter(m => m.id !== messageId);
  }
}
