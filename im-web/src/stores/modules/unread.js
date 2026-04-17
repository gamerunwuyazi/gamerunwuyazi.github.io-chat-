import { ref } from 'vue';

export function createUnreadModule(getCurrentUser) {
  const unreadMessages = ref({
    global: 0,
    groups: {},
    private: {}
  });

  function clearGroupUnread(groupId, context) {
    const { loadUnreadCountsFromLocalStorage, saveUnreadCountsToLocalStorage } = context;
    
    loadUnreadCountsFromLocalStorage();
    const groupIdStr = String(groupId);
    if (unreadMessages.value.groups && unreadMessages.value.groups[groupIdStr]) {
      delete unreadMessages.value.groups[groupIdStr];
    }
    saveUnreadCountsToLocalStorage();
  }

  function clearPrivateUnread(userId, context) {
    const { loadUnreadCountsFromLocalStorage, saveUnreadCountsToLocalStorage } = context;
    
    loadUnreadCountsFromLocalStorage();
    const userIdStr = String(userId);
    let hasUnreadToClear = false;
    if (unreadMessages.value.private && unreadMessages.value.private[userIdStr]) {
      delete unreadMessages.value.private[userIdStr];
      hasUnreadToClear = true;
    }
    saveUnreadCountsToLocalStorage();
    if (hasUnreadToClear && window.sendReadMessageEvent) {
      window.sendReadMessageEvent('private', { friendId: userId });
    }
  }

  function clearGlobalUnread(context) {
    const { loadUnreadCountsFromLocalStorage, saveUnreadCountsToLocalStorage } = context;
    
    loadUnreadCountsFromLocalStorage();
    unreadMessages.value.global = 0;
    saveUnreadCountsToLocalStorage();
  }

  function incrementGroupUnread(groupId, context) {
    const { loadUnreadCountsFromLocalStorage, saveUnreadCountsToLocalStorage } = context;
    
    loadUnreadCountsFromLocalStorage();
    const groupIdStr = String(groupId);
    if (!unreadMessages.value.groups[groupIdStr]) {
      unreadMessages.value.groups[groupIdStr] = 0;
    }
    unreadMessages.value.groups[groupIdStr]++;
    saveUnreadCountsToLocalStorage();
  }

  function incrementGlobalUnread(context) {
    const { loadUnreadCountsFromLocalStorage, saveUnreadCountsToLocalStorage } = context;
    
    loadUnreadCountsFromLocalStorage();
    unreadMessages.value.global++;
    saveUnreadCountsToLocalStorage();
  }

  function incrementPrivateUnread(userId, context) {
    const { loadUnreadCountsFromLocalStorage, saveUnreadCountsToLocalStorage } = context;
    
    loadUnreadCountsFromLocalStorage();
    const userIdStr = String(userId);
    if (!unreadMessages.value.private[userIdStr]) {
      unreadMessages.value.private[userIdStr] = 0;
    }
    unreadMessages.value.private[userIdStr]++;
    saveUnreadCountsToLocalStorage();
  }

  function loadUnreadCountsFromLocalStorage() {
    try {
      const currentUser = getCurrentUser();
      const data = localStorage.getItem(`unread_counts_${currentUser?.id}`);
      if (data) {
        const counts = JSON.parse(data);
        unreadMessages.value.global = counts.global || 0;
        unreadMessages.value.groups = counts.groups || {};
        unreadMessages.value.private = counts.private || {};
      }
    } catch (err) {
      console.error('加载未读计数失败:', err);
    }
  }

  function loadUnreadCountsFromStorage() {
    try {
      const currentUser = getCurrentUser();
      const data = localStorage.getItem(`unread_counts_${currentUser?.id}`);
      if (data) {
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('读取未读计数失败:', err);
    }
    return { global: 0, groups: {}, private: {} };
  }

  function saveUnreadCountsToLocalStorage() {
    try {
      const currentUser = getCurrentUser();
      const counts = {
        global: unreadMessages.value.global,
        groups: unreadMessages.value.groups,
        private: unreadMessages.value.private
      };
      localStorage.setItem(`unread_counts_${currentUser?.id}`, JSON.stringify(counts));
    } catch (err) {
      console.error('保存未读计数失败:', err);
    }
  }

  function saveUnreadCountsToLocalStorageDirect(counts) {
    try {
      const currentUser = getCurrentUser();
      localStorage.setItem(`unread_counts_${currentUser?.id}`, JSON.stringify(counts));
      unreadMessages.value.global = counts.global || 0;
      unreadMessages.value.groups = counts.groups || {};
      unreadMessages.value.private = counts.private || {};
    } catch (err) {
      console.error('保存未读计数失败:', err);
    }
  }

  function clearAllUnreadCounts() {
    try {
      loadUnreadCountsFromLocalStorage();
      unreadMessages.value.global = 0;
      unreadMessages.value.groups = {};
      unreadMessages.value.private = {};
      saveUnreadCountsToLocalStorage();
      
      if (typeof window.updateUnreadCountsDisplay === 'function') {
        window.updateUnreadCountsDisplay();
      }
      
      return true;
    } catch (error) {
      console.error('清除未读计数失败:', error);
      throw error;
    }
  }

  return {
    unreadMessages,
    clearGroupUnread,
    clearPrivateUnread,
    clearGlobalUnread,
    incrementGroupUnread,
    incrementGlobalUnread,
    incrementPrivateUnread,
    loadUnreadCountsFromLocalStorage,
    loadUnreadCountsFromStorage,
    saveUnreadCountsToLocalStorage,
    saveUnreadCountsToLocalStorageDirect,
    clearAllUnreadCounts
  };
}
