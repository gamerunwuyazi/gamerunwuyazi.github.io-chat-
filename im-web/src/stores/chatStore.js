import { defineStore } from 'pinia';
import { ref, toRaw } from 'vue';
import localForage from 'localforage';

let cachePublicMessages = [];
let cacheGroupMessages = {};
let cachePrivateMessages = {};

export const useChatStore = defineStore('chat', () => {
  const onlineUsers = ref([]);
  const offlineUsers = ref([]);
  const groupsList = ref(null);
  const friendsList = ref([]);
  const publicMessages = ref([]);
  const groupMessages = ref({});
  const privateMessages = ref({});
  const unreadMessages = ref({
    global: 0,
    groups: {},
    private: {}
  });
  const currentUser = ref(null);
  const currentSessionToken = ref(localStorage.getItem('currentSessionToken') || null);
  
  const currentGroupId = ref(null);
  const currentGroupName = ref('');
  const currentPrivateChatUserId = ref(null);
  const currentPrivateChatUsername = ref('');
  const currentPrivateChatNickname = ref('');
  const currentPrivateChatAvatarUrl = ref('');
  const currentActiveChat = ref('main');
  const currentSendChatType = ref('main');
  const selectedGroupIdForCard = ref(null);
  
  const isPageVisible = ref(true);
  const isConnected = ref(false);
  const loading = ref(false);
  const isFetchingOfflineMessages = ref(false);
  const showFetchingMessage = ref(false);
  
  const hasReceivedHistory = ref(false);
  const hasReceivedGroupHistory = ref(false);
  const hasReceivedPrivateHistory = ref(false);
  
  const mainMessageInput = ref('');
  const groupMessageInput = ref('');
  const privateMessageInput = ref('');
  
  const uploadProgress = ref(0);
  const showUploadProgress = ref(false);
  
  const showGroupInfoModal = ref(false);
  const showSendGroupCardModal = ref(false);
  const showCreateGroupModal = ref(false);
  const showAddGroupMemberModal = ref(false);
  const showUserProfileModal = ref(false);
  const showUserSearchModal = ref(false);
  const showImagePreviewModal = ref(false);
  const showAvatarPreviewModal = ref(false);
  const showUserAvatarPopup = ref(false);
  const showGroupCardPopup = ref(false);
  
  const modalData = ref({
    groupInfo: null,
    groupCardPopup: null,
    shareGroupCardTargets: [],
    userProfile: null,
    imagePreviewUrl: '',
    avatarPreviewUrl: '',
    userAvatarPopup: null
  });
  
  const quotedMessage = ref(null);
  
  const groupAllLoaded = ref({});
  const privateAllLoaded = ref({});
  const publicAllLoaded = ref(false);
  
  const publicStored = ref(false);
  const groupStored = ref({});
  const privateStored = ref({});
  
  // 完整消息列表（只在 IndexedDB 中存储）
  let fullPublicMessages = null;
  let fullGroupMessages = {};
  let fullPrivateMessages = {};
  
  const publicAndGroupMinId = ref(0);
  const privateMinId = ref(0);
  
  const publicPageSize = ref(20);
  const publicPageOffset = ref(0);
  const publicLoadingMore = ref(false);
  const groupPageSize = ref({});
  const groupPageOffset = ref({});
  const groupLoadingMore = ref({});
  const privatePageSize = ref({});
  const privatePageOffset = ref({});
  const privateLoadingMore = ref({});
  
  const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://back.hs.airoe.cn';
  
  function getStorageKeyPrefix() {
    const userId = currentUser.value?.id || 'guest';
    return `chats-${userId}`;
  }
  
  function setCurrentUser(user) {
    currentUser.value = user;
    if (user) {
      loadUnreadCountsFromLocalStorage();
    }
  }
  
  function setCurrentSessionToken(token) {
    currentSessionToken.value = token;
    if (token) {
      localStorage.setItem('currentSessionToken', token);
    } else {
      localStorage.removeItem('currentSessionToken');
    }
  }
  
  function setCurrentGroupId(id) {
    currentGroupId.value = id;
    clearQuotedMessage();
    clearOtherGroupMessages(id);
    clearPublicMessagesExceptRecent();
    clearOtherPrivateMessages(null);
  }
  
  function setCurrentPrivateChatUserId(id) {
    currentPrivateChatUserId.value = id;
    clearQuotedMessage();
    clearOtherPrivateMessages(id);
    clearPublicMessagesExceptRecent();
    clearOtherGroupMessages(null);
  }
  
  function setCurrentActiveChat(type) {
    currentActiveChat.value = type;
    clearQuotedMessage();
    if (type === 'main') {
      clearPublicMessagesExceptRecent();
      clearOtherGroupMessages(null);
      clearOtherPrivateMessages(null);
    } else if (type.startsWith('group_')) {
      const groupId = type.replace('group_', '');
      clearOtherGroupMessages(groupId);
      clearPublicMessagesExceptRecent();
      clearOtherPrivateMessages(null);
    } else if (type.startsWith('private_')) {
      const userId = type.replace('private_', '');
      clearOtherPrivateMessages(userId);
      clearPublicMessagesExceptRecent();
      clearOtherGroupMessages(null);
    }
  }
  
  function openModal(modalName, data = null) {
    switch (modalName) {
      case 'groupInfo':
        showGroupInfoModal.value = true;
        if (data) modalData.value.groupInfo = data;
        break;
      case 'sendGroupCard':
        showSendGroupCardModal.value = true;
        break;
      case 'createGroup':
        showCreateGroupModal.value = true;
        break;
      case 'addGroupMember':
        showAddGroupMemberModal.value = true;
        break;
      case 'userProfile':
        showUserProfileModal.value = true;
        if (data) modalData.value.userProfile = data;
        break;
      case 'userSearch':
        showUserSearchModal.value = true;
        break;
      case 'imagePreview':
        showImagePreviewModal.value = true;
        if (data) modalData.value.imagePreviewUrl = data;
        break;
      case 'avatarPreview':
        showAvatarPreviewModal.value = true;
        if (data) modalData.value.avatarPreviewUrl = data;
        break;
      case 'userAvatarPopup':
        showUserAvatarPopup.value = true;
        if (data) modalData.value.userAvatarPopup = data;
        break;
      case 'groupCardPopup':
        showGroupCardPopup.value = true;
        if (data) modalData.value.groupCardPopup = data;
        break;
    }
    setTimeout(() => {
      const modalId = getModalId(modalName);
      if (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
          modal.style.display = '';
        }
      }
    }, 0);
  }
  
  function getModalId(modalName) {
    const modalMap = {
      'groupInfo': 'groupInfoModal',
      'sendGroupCard': 'sendGroupCardModal',
      'createGroup': 'createGroupModal',
      'addGroupMember': 'addGroupMemberModal',
      'userProfile': 'userProfileModal',
      'userSearch': 'userSearchModal',
      'imagePreview': 'imagePreviewModal',
      'avatarPreview': 'avatarPreviewModal',
      'userAvatarPopup': 'userAvatarPopup'
    };
    return modalMap[modalName] || null;
  }
  
  function closeModal(modalName) {
    switch (modalName) {
      case 'groupInfo':
        showGroupInfoModal.value = false;
        break;
      case 'sendGroupCard':
        showSendGroupCardModal.value = false;
        break;
      case 'createGroup':
        showCreateGroupModal.value = false;
        break;
      case 'addGroupMember':
        showAddGroupMemberModal.value = false;
        break;
      case 'userProfile':
        showUserProfileModal.value = false;
        break;
      case 'userSearch':
        showUserSearchModal.value = false;
        break;
      case 'imagePreview':
        showImagePreviewModal.value = false;
        break;
      case 'avatarPreview':
        showAvatarPreviewModal.value = false;
        break;
      case 'userAvatarPopup':
        showUserAvatarPopup.value = false;
        break;
      case 'groupCardPopup':
        showGroupCardPopup.value = false;
        break;
      default:
        showGroupInfoModal.value = false;
        showSendGroupCardModal.value = false;
        showCreateGroupModal.value = false;
        showAddGroupMemberModal.value = false;
        showUserProfileModal.value = false;
        showUserSearchModal.value = false;
        showImagePreviewModal.value = false;
        showAvatarPreviewModal.value = false;
        showUserAvatarPopup.value = false;
        showGroupCardPopup.value = false;
    }
  }

  function addPublicMessage(message) {
    const isWithdrawMessage = message.messageType === 101;
    const messages = loading.value ? cachePublicMessages : publicMessages.value;
    const exists = messages.some(m => m.id === message.id);
    if (!exists && !isWithdrawMessage) {
      messages.push(message);
    }
    // 同时更新完整消息列表（包括101消息）
    if (fullPublicMessages === null) {
      fullPublicMessages = [message];
    } else {
      const fullExists = fullPublicMessages.some(m => m.id === message.id);
      if (!fullExists) {
        fullPublicMessages.push(message);
      }
    }
    if (!loading.value) {
      publicStored.value = false;
      saveToStorage();
    }
  }

  function addGroupMessage(groupId, message) {
    const isWithdrawMessage = message.messageType === 101;
    const messages = loading.value ? (cacheGroupMessages[groupId] || (cacheGroupMessages[groupId] = [])) : (groupMessages.value[groupId] || (groupMessages.value[groupId] = []));
    const exists = messages.some(m => m.id === message.id);
    if (!exists && !isWithdrawMessage) {
      messages.push(message);
    }
    // 同时更新完整消息列表（包括101消息）
    if (fullGroupMessages[groupId] === null || fullGroupMessages[groupId] === undefined) {
      fullGroupMessages[groupId] = [message];
    } else {
      const fullExists = fullGroupMessages[groupId].some(m => m.id === message.id);
      if (!fullExists) {
        fullGroupMessages[groupId].push(message);
      }
    }
    if (!loading.value) {
      groupStored.value[groupId] = false;
      saveToStorage();
    }
  }

  function addPrivateMessage(userId, message) {
    const isWithdrawMessage = message.messageType === 101;
    const messages = loading.value ? (cachePrivateMessages[userId] || (cachePrivateMessages[userId] = [])) : (privateMessages.value[userId] || (privateMessages.value[userId] = []));
    const exists = messages.some(m => m.id === message.id);
    if (!exists && !isWithdrawMessage) {
      messages.push(message);
    }
    // 同时更新完整消息列表（包括101消息）
    if (fullPrivateMessages[userId] === null || fullPrivateMessages[userId] === undefined) {
      fullPrivateMessages[userId] = [message];
    } else {
      const fullExists = fullPrivateMessages[userId].some(m => m.id === message.id);
      if (!fullExists) {
        fullPrivateMessages[userId].push(message);
      }
    }
    if (!loading.value) {
      privateStored.value[userId] = false;
      saveToStorage();
    }
  }

  function sortMessages(messages) {
    return [...messages].reverse();
  }

  function setPublicMessages(messages) {
    const sortedMessages = sortMessages(messages);
    if (loading.value) {
      cachePublicMessages = sortedMessages.filter(m => m.messageType !== 101);
    } else {
      // 更新完整消息列表
      if (fullPublicMessages === null) {
        fullPublicMessages = [...sortedMessages];
      } else {
        // 合并现有消息和新消息
        const existingIds = new Set(fullPublicMessages.map(m => m.id));
        const newMessages = sortedMessages.filter(m => !existingIds.has(m.id));
        fullPublicMessages = [...newMessages, ...fullPublicMessages];
      }
      // 只在 store 中保存最近 20 条非101消息
      publicMessages.value = sortedMessages.filter(m => m.messageType !== 101).slice(-20);
      publicStored.value = false;
      saveToStorage();
    }
  }

  function setGroupMessages(groupId, messages) {
    const sortedMessages = sortMessages(messages);
    if (loading.value) {
      cacheGroupMessages[groupId] = sortedMessages.filter(m => m.messageType !== 101);
    } else {
      // 更新完整消息列表
      if (fullGroupMessages[groupId] === null || fullGroupMessages[groupId] === undefined) {
        fullGroupMessages[groupId] = [...sortedMessages];
      } else {
        // 合并现有消息和新消息
        const existingIds = new Set(fullGroupMessages[groupId].map(m => m.id));
        const newMessages = sortedMessages.filter(m => !existingIds.has(m.id));
        fullGroupMessages[groupId] = [...newMessages, ...fullGroupMessages[groupId]];
      }
      // 只在 store 中保存最近 20 条非101消息
      groupMessages.value[groupId] = sortedMessages.filter(m => m.messageType !== 101).slice(-20);
      groupStored.value[groupId] = false;
      saveToStorage();
    }
  }

  function setPrivateMessages(userId, messages) {
    const sortedMessages = sortMessages(messages);
    if (loading.value) {
      cachePrivateMessages[userId] = sortedMessages.filter(m => m.messageType !== 101);
    } else {
      // 更新完整消息列表
      if (fullPrivateMessages[userId] === null || fullPrivateMessages[userId] === undefined) {
        fullPrivateMessages[userId] = [...sortedMessages];
      } else {
        // 合并现有消息和新消息
        const existingIds = new Set(fullPrivateMessages[userId].map(m => m.id));
        const newMessages = sortedMessages.filter(m => !existingIds.has(m.id));
        fullPrivateMessages[userId] = [...newMessages, ...fullPrivateMessages[userId]];
      }
      // 只在 store 中保存最近 20 条非101消息
      privateMessages.value[userId] = sortedMessages.filter(m => m.messageType !== 101).slice(-20);
      privateStored.value[userId] = false;
      saveToStorage();
    }
  }

  function prependPublicMessages(messages) {
    const targetMessages = loading.value ? cachePublicMessages : publicMessages.value;
    const existingIds = new Set(targetMessages.map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id)).sort((a, b) => a.id - b.id);
    const displayNewMessages = newMessages.filter(m => m.messageType !== 101);
    
    if (loading.value) {
      cachePublicMessages = [...displayNewMessages, ...cachePublicMessages];
    } else {
      // 更新完整消息列表
      if (fullPublicMessages !== null) {
        const fullIds = new Set(fullPublicMessages.map(m => m.id));
        const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
        fullPublicMessages = [...fullNewMessages, ...fullPublicMessages];
      }
      publicMessages.value = [...displayNewMessages, ...publicMessages.value];
      publicStored.value = false;
      saveToStorage();
    }
  }

  function prependGroupMessages(groupId, messages) {
    const targetMessages = loading.value ? (cacheGroupMessages[groupId] || (cacheGroupMessages[groupId] = [])) : (groupMessages.value[groupId] || (groupMessages.value[groupId] = []));
    const existingIds = new Set(targetMessages.map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id)).sort((a, b) => a.id - b.id);
    const displayNewMessages = newMessages.filter(m => m.messageType !== 101);
    if (loading.value) {
      cacheGroupMessages[groupId] = [...displayNewMessages, ...(cacheGroupMessages[groupId] || [])];
    } else {
      // 更新完整消息列表
      if (fullGroupMessages[groupId] !== null && fullGroupMessages[groupId] !== undefined) {
        const fullIds = new Set(fullGroupMessages[groupId].map(m => m.id));
        const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
        fullGroupMessages[groupId] = [...fullNewMessages, ...fullGroupMessages[groupId]];
      }
      groupMessages.value[groupId] = [...displayNewMessages, ...groupMessages.value[groupId]];
      groupStored.value[groupId] = false;
      saveToStorage();
    }
  }

  function prependPrivateMessages(userId, messages) {
    const targetMessages = loading.value ? (cachePrivateMessages[userId] || (cachePrivateMessages[userId] = [])) : (privateMessages.value[userId] || (privateMessages.value[userId] = []));
    const existingIds = new Set(targetMessages.map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id)).sort((a, b) => a.id - b.id);
    const displayNewMessages = newMessages.filter(m => m.messageType !== 101);
    if (loading.value) {
      cachePrivateMessages[userId] = [...displayNewMessages, ...(cachePrivateMessages[userId] || [])];
    } else {
      // 更新完整消息列表
      if (fullPrivateMessages[userId] !== null && fullPrivateMessages[userId] !== undefined) {
        const fullIds = new Set(fullPrivateMessages[userId].map(m => m.id));
        const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
        fullPrivateMessages[userId] = [...fullNewMessages, ...fullPrivateMessages[userId]];
      }
      privateMessages.value[userId] = [...displayNewMessages, ...privateMessages.value[userId]];
      privateStored.value[userId] = false;
      saveToStorage();
    }
  }

  function clearPublicMessages() {
    publicMessages.value = [];
    publicStored.value = false;
    saveToStorage();
  }

  function clearGroupMessages(groupId) {
    if (groupMessages.value[groupId]) {
      groupMessages.value[groupId] = [];
      groupStored.value[groupId] = false;
      saveToStorage();
    }
  }

  function clearPrivateMessages(userId) {
    if (privateMessages.value[userId]) {
      privateMessages.value[userId] = [];
      privateStored.value[userId] = false;
      saveToStorage();
    }
  }

  function deletePublicMessage(messageId) {
    const index = publicMessages.value.findIndex(m => String(m.id) === String(messageId));
    if (index !== -1) {
      publicMessages.value.splice(index, 1);
    }
    if (fullPublicMessages) {
      const fullIndex = fullPublicMessages.findIndex(m => String(m.id) === String(messageId));
      if (fullIndex !== -1) {
        fullPublicMessages.splice(fullIndex, 1);
      }
    }
    publicStored.value = false;
    saveToStorage();
  }

  function deleteGroupMessage(groupId, messageId) {
    if (groupMessages.value[groupId]) {
      const index = groupMessages.value[groupId].findIndex(m => String(m.id) === String(messageId));
      if (index !== -1) {
        groupMessages.value[groupId].splice(index, 1);
      }
    }
    if (fullGroupMessages[groupId]) {
      const fullIndex = fullGroupMessages[groupId].findIndex(m => String(m.id) === String(messageId));
      if (fullIndex !== -1) {
        fullGroupMessages[groupId].splice(fullIndex, 1);
      }
    }
    groupStored.value[groupId] = false;
    saveToStorage();
    
    // 更新群组最后消息
    updateGroupLastMessageAfterDelete(groupId);
  }

  function deletePrivateMessage(userId, messageId) {
    if (privateMessages.value[userId]) {
      const index = privateMessages.value[userId].findIndex(m => String(m.id) === String(messageId));
      if (index !== -1) {
        privateMessages.value[userId].splice(index, 1);
      }
    }
    if (fullPrivateMessages[userId]) {
      const fullIndex = fullPrivateMessages[userId].findIndex(m => String(m.id) === String(messageId));
      if (fullIndex !== -1) {
        fullPrivateMessages[userId].splice(fullIndex, 1);
      }
    }
    privateStored.value[userId] = false;
    saveToStorage();
    
    // 更新私信最后消息
    updateFriendLastMessageAfterDelete(userId);
  }

  function updateUserInfoInMessages(userId, updates) {
    const userIdStr = String(userId);
    
    const updateMessage = (message) => {
      if (String(message.sender_id) === userIdStr || String(message.userId) === userIdStr || String(message.user_id) === userIdStr) {
        if (updates.nickname !== undefined) {
          message.nickname = updates.nickname;
        }
        if (updates.avatarUrl !== undefined) {
          message.avatarUrl = updates.avatarUrl;
        }
      }
      if (message.quoted_message && String(message.quoted_message.sender_id) === userIdStr) {
        if (updates.nickname !== undefined) {
          message.quoted_message.sender_nickname = updates.nickname;
        }
        if (updates.avatarUrl !== undefined) {
          message.quoted_message.sender_avatar = updates.avatarUrl;
        }
      }
    };
    
    publicMessages.value.forEach(updateMessage);
    
    Object.values(groupMessages.value).forEach(messages => {
      messages.forEach(updateMessage);
    });
    
    Object.values(privateMessages.value).forEach(messages => {
      messages.forEach(updateMessage);
    });
    
    // 更新完整公共消息列表
    if (fullPublicMessages) {
      fullPublicMessages.forEach(updateMessage);
    }
    
    // 更新完整群组消息列表
    Object.values(fullGroupMessages).forEach(messages => {
      messages.forEach(updateMessage);
    });
    
    // 更新完整私信消息列表
    Object.values(fullPrivateMessages).forEach(messages => {
      messages.forEach(updateMessage);
    });

    publicStored.value = false;
    Object.keys(groupStored.value).forEach(id => groupStored.value[id] = false);
    Object.keys(privateStored.value).forEach(id => privateStored.value[id] = false);
    saveToStorage();
  }

  function updateGroupInfoInMessages(groupId, updates) {
    const groupIdStr = String(groupId);
    
    const updateMessage = (message) => {
      if (message.group_card && String(message.group_card.group_id) === groupIdStr) {
        if (updates.avatarUrl !== undefined) {
          message.group_card.avatarUrl = updates.avatarUrl;
        }
        if (updates.groupName !== undefined) {
          message.group_card.group_name = updates.groupName;
        }
        if (updates.groupDescription !== undefined) {
          message.group_card.group_description = updates.groupDescription;
        }
      }
      if (message.quoted_message && message.quoted_message.group_card && 
          String(message.quoted_message.group_card.group_id) === groupIdStr) {
        if (updates.avatarUrl !== undefined) {
          message.quoted_message.group_card.avatarUrl = updates.avatarUrl;
        }
        if (updates.groupName !== undefined) {
          message.quoted_message.group_card.group_name = updates.groupName;
        }
      }
    };
    
    publicMessages.value.forEach(updateMessage);
    
    Object.values(groupMessages.value).forEach(messages => {
      messages.forEach(updateMessage);
    });
    
    Object.values(privateMessages.value).forEach(messages => {
      messages.forEach(updateMessage);
    });
    
    // 更新完整公共消息列表
    if (fullPublicMessages) {
      fullPublicMessages.forEach(updateMessage);
    }
    
    // 更新完整群组消息列表
    Object.values(fullGroupMessages).forEach(messages => {
      messages.forEach(updateMessage);
    });
    
    // 更新完整私信消息列表
    Object.values(fullPrivateMessages).forEach(messages => {
      messages.forEach(updateMessage);
    });

    publicStored.value = false;
    Object.keys(groupStored.value).forEach(id => groupStored.value[id] = false);
    Object.keys(privateStored.value).forEach(id => privateStored.value[id] = false);
    saveToStorage();
  }

  function moveGroupToTop(groupId) {
    const index = groupsList.value.findIndex(g => String(g.id) === String(groupId));
    if (index > 0) {
      const group = groupsList.value.splice(index, 1)[0];
      const newTime = new Date().toISOString();
      group.last_message_time = newTime;
      groupsList.value.unshift(group);
      sortGroupsByLastMessageTime();
      saveGroupLastMessageTime(groupId, newTime);
    }
  }

  function moveFriendToTop(userId) {
    const index = friendsList.value.findIndex(f => String(f.id) === String(userId));
    if (index > 0) {
      const friend = friendsList.value.splice(index, 1)[0];
      const newTime = new Date().toISOString();
      friend.last_message_time = newTime;
      friendsList.value.unshift(friend);
      sortFriendsByLastMessageTime();
      saveFriendLastMessageTime(userId, newTime);
    }
  }

  function saveGroupLastMessageTime(groupId, time) {
    try {
      const key = 'group_last_message_times';
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      data[groupId] = time;
      localStorage.setItem(key, JSON.stringify(data));
    } catch (err) {
      console.error('保存群组最后消息时间失败:', err);
    }
  }

  function saveFriendLastMessageTime(userId, time) {
    try {
      const key = 'friend_last_message_times';
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      data[userId] = time;
      localStorage.setItem(key, JSON.stringify(data));
    } catch (err) {
      console.error('保存好友最后消息时间失败:', err);
    }
  }

  function getGroupLastMessageTime(groupId) {
    try {
      const key = 'group_last_message_times';
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      return data[groupId] || null;
    } catch (err) {
      console.error('获取群组最后消息时间失败:', err);
      return null;
    }
  }

  function getFriendLastMessageTime(userId) {
    try {
      const key = 'friend_last_message_times';
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      return data[userId] || null;
    } catch (err) {
      console.error('获取好友最后消息时间失败:', err);
      return null;
    }
  }

  function deleteGroupLastMessageTime(groupId) {
    try {
      const key = 'group_last_message_times';
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      delete data[groupId];
      localStorage.setItem(key, JSON.stringify(data));
    } catch (err) {
      console.error('删除群组最后消息时间失败:', err);
    }
  }

  function deleteFriendLastMessageTime(userId) {
    try {
      const key = 'friend_last_message_times';
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      delete data[userId];
      localStorage.setItem(key, JSON.stringify(data));
    } catch (err) {
      console.error('删除好友最后消息时间失败:', err);
    }
  }

  function clearGroupUnread(groupId) {
    if (unreadMessages.value.groups && unreadMessages.value.groups[groupId]) {
      delete unreadMessages.value.groups[groupId];
    }
    // 保存到 localStorage
    saveUnreadCountsToLocalStorage();
  }

  function clearPrivateUnread(userId) {
    if (unreadMessages.value.private && unreadMessages.value.private[userId]) {
      delete unreadMessages.value.private[userId];
    }
    // 保存到 localStorage
    saveUnreadCountsToLocalStorage();
  }
  
  function incrementGroupUnread(groupId) {
    if (!unreadMessages.value.groups[groupId]) {
      unreadMessages.value.groups[groupId] = 0;
    }
    unreadMessages.value.groups[groupId]++;
    // 保存到 localStorage
    saveUnreadCountsToLocalStorage();
  }
  
  function incrementGlobalUnread() {
    unreadMessages.value.global++;
    // 保存到 localStorage
    saveUnreadCountsToLocalStorage();
  }
  
  function incrementPrivateUnread(userId) {
    if (!unreadMessages.value.private[userId]) {
      unreadMessages.value.private[userId] = 0;
    }
    unreadMessages.value.private[userId]++;
    // 保存到 localStorage
    saveUnreadCountsToLocalStorage();
  }
  
  function clearGlobalUnread() {
    unreadMessages.value.global = 0;
    // 保存到 localStorage
    saveUnreadCountsToLocalStorage();
  }

  function saveGroupLastMessageTimes(times) {
    try {
      const key = 'group_last_message_times';
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      Object.assign(data, times);
      localStorage.setItem(key, JSON.stringify(data));
    } catch (err) {
      console.error('批量保存群组最后消息时间失败:', err);
    }
  }

  function saveFriendLastMessageTimes(times) {
    try {
      const key = 'friend_last_message_times';
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      Object.assign(data, times);
      localStorage.setItem(key, JSON.stringify(data));
    } catch (err) {
      console.error('批量保存好友最后消息时间失败:', err);
    }
  }

  function sortFriendsByLastMessageTime() {
    friendsList.value.sort((a, b) => {
      const aTime = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
      const bTime = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
      return bTime - aTime;
    });
  }

  function sortGroupsByLastMessageTime() {
    groupsList.value.sort((a, b) => {
      const aTime = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
      const bTime = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
      return bTime - aTime;
    });
  }
  
  function setQuotedMessage(message) {
    quotedMessage.value = message;
  }
  
  function clearQuotedMessage() {
    quotedMessage.value = null;
  }
  
  function clearOtherGroupMessages(currentGroupId) {
    const allGroupIds = Object.keys(groupMessages.value);
    allGroupIds.forEach(groupId => {
      if (String(groupId) !== String(currentGroupId)) {
        if (groupMessages.value[groupId] && groupMessages.value[groupId].length > 20) {
          groupMessages.value[groupId] = groupMessages.value[groupId].slice(-20);
        }
      }
    });
  }
  
  function clearOtherPrivateMessages(currentUserId) {
    const allUserIds = Object.keys(privateMessages.value);
    allUserIds.forEach(userId => {
      if (String(userId) !== String(currentUserId)) {
        if (privateMessages.value[userId] && privateMessages.value[userId].length > 20) {
          privateMessages.value[userId] = privateMessages.value[userId].slice(-20);
        }
      }
    });
  }
  
  function clearPublicMessagesExceptRecent() {
    if (publicMessages.value.length > 20) {
      publicMessages.value = publicMessages.value.slice(-20);
    }
  }

  function setLoading(loadingState) {
    loading.value = loadingState;
  }

  function refreshMessages() {
    if (cachePublicMessages.length > 0) {
      publicMessages.value = cachePublicMessages;
      cachePublicMessages = [];
    }
    
    Object.keys(cacheGroupMessages).forEach(groupId => {
      if (cacheGroupMessages[groupId]) {
        groupMessages.value[groupId] = cacheGroupMessages[groupId];
      }
    });
    cacheGroupMessages = {};
    
    Object.keys(cachePrivateMessages).forEach(userId => {
      if (cachePrivateMessages[userId]) {
        privateMessages.value[userId] = cachePrivateMessages[userId];
      }
    });
    cachePrivateMessages = {};

    publicStored.value = false;
    Object.keys(groupMessages.value).forEach(id => groupStored.value[id] = false);
    Object.keys(privateMessages.value).forEach(id => privateStored.value[id] = false);
    saveToStorage();
  }

  async function saveToStorage() {
    if (loading.value) return;

    const prefix = getStorageKeyPrefix();

    try {
      if (!publicStored.value) {
        // 保存完整公共聊天室消息
        const messagesToSave = fullPublicMessages !== null 
          ? fullPublicMessages 
          : publicMessages.value;
        const messages = messagesToSave.map(msg => toRaw(msg));
        await localForage.setItem(`${prefix}-public`, { messages });
        publicStored.value = true;
      }

      for (const [groupId, messages] of Object.entries(groupMessages.value)) {
        if (!groupStored.value[groupId]) {
          // 保存完整群组消息
          const messagesToSave = fullGroupMessages[groupId] !== null 
            ? fullGroupMessages[groupId] 
            : messages;
          const msgs = messagesToSave.map(msg => toRaw(msg));
          await localForage.setItem(`${prefix}-group-${groupId}`, { messages: msgs });
          groupStored.value[groupId] = true;
        }
      }

      for (const [userId, messages] of Object.entries(privateMessages.value)) {
        if (!privateStored.value[userId]) {
          // 保存完整私信消息
          const messagesToSave = fullPrivateMessages[userId] !== null 
            ? fullPrivateMessages[userId] 
            : messages;
          const msgs = messagesToSave.map(msg => toRaw(msg));
          await localForage.setItem(`${prefix}-private-${userId}`, { messages: msgs });
          privateStored.value[userId] = true;
        }
      }

      const chatKeys = [
        `${prefix}-public`,
        ...Object.keys(groupMessages.value).map(id => `${prefix}-group-${id}`),
        ...Object.keys(privateMessages.value).map(id => `${prefix}-private-${id}`),
      ];
      await localForage.setItem(prefix, { chatKeys });
    } catch (err) {
      console.error('本地消息缓存存储失败', err);
    }
  }

  function loadMessages() {
    return new Promise(async (resolve, reject) => {
      try {
        const prefix = getStorageKeyPrefix();
        
        await loadMinIds();
        
        const data = await localForage.getItem(prefix);
        if (!data || !data.chatKeys) {
          resolve();
          return;
        }
        
        const promises = data.chatKeys.map(key => localForage.getItem(key));
        
        const results = await Promise.all(promises);
        for (let i = 0; i < results.length; i++) {
          const itemData = results[i];
          if (!itemData) continue;
          
          const key = data.chatKeys[i];
          const messages = itemData.messages || [];
          
          if (key.includes('-public')) {
            // 保存完整消息列表到内存变量
            fullPublicMessages = [...messages];
            // 只在 store 中保存最近 20 条非101消息
            publicMessages.value = messages.filter(m => m.messageType !== 101).slice(-20);
          } else if (key.includes('-group-')) {
            const groupId = key.split('-group-')[1];
            // 保存完整消息列表到内存变量
            fullGroupMessages[groupId] = [...messages];
            // 只在 store 中保存最近 20 条非101消息
            groupMessages.value[groupId] = messages.filter(m => m.messageType !== 101).slice(-20);
          } else if (key.includes('-private-')) {
            const userId = key.split('-private-')[1];
            // 保存完整消息列表到内存变量
            fullPrivateMessages[userId] = [...messages];
            // 只在 store 中保存最近 20 条非101消息
            privateMessages.value[userId] = messages.filter(m => m.messageType !== 101).slice(-20);
          }
        }
        
        publicStored.value = true;
        Object.keys(groupMessages.value).forEach(id => groupStored.value[id] = true);
        Object.keys(privateMessages.value).forEach(id => privateStored.value[id] = true);
        
        resolve();
      } catch (e) {
        console.log("加载消息失败");
        reject(e);
      }
    });
  }

  function clearMessages() {
    cachePublicMessages = [];
    cacheGroupMessages = {};
    cachePrivateMessages = {};
    publicMessages.value = [];
    groupMessages.value = {};
    privateMessages.value = {};
    publicStored.value = false;
    groupStored.value = {};
    privateStored.value = {};
    // 清除完整消息列表
    fullPublicMessages = null;
    fullGroupMessages = {};
    fullPrivateMessages = {};
  }
  
  function processOfflineMessage(message) {
    const processedMessage = {
      ...message,
      id: message.id,
      sender_id: message.userId || message.senderId,
      user_id: message.userId || message.senderId,
      nickname: message.nickname,
      avatarUrl: message.avatarUrl,
      message_type: message.messageType
    };

    if (message.type === 'public') {
      const isWithdrawMessage = processedMessage.messageType === 101;
      if (isWithdrawMessage) {
        const messageIdToDelete = processedMessage.content;
        if (messageIdToDelete) {
          deletePublicMessage(messageIdToDelete);
        }
      }
      const targetMessages = loading.value ? cachePublicMessages : publicMessages.value;
      const exists = targetMessages.some(m => m.id === processedMessage.id);
      const fullExists = fullPublicMessages?.some(m => m.id === processedMessage.id) || false;
      
      // 更新完整消息列表（包括 101 撤回消息）
      if (!fullExists) {
        if (fullPublicMessages === null) {
          fullPublicMessages = [processedMessage];
        } else {
          fullPublicMessages.push(processedMessage);
        }
        publicStored.value = false;
      }
      
      if (!exists && !isWithdrawMessage) {
        if (loading.value) {
          cachePublicMessages.unshift(processedMessage);
        } else {
          publicMessages.value.unshift(processedMessage);
          publicStored.value = false;
        }
      } else if (exists) {
        // 消息已存在但需要确保标记为未保存
        publicStored.value = false;
      }
      if (processedMessage.id > publicAndGroupMinId.value) {
        publicAndGroupMinId.value = processedMessage.id;
      }
    } else if (message.type === 'group') {
      const groupId = message.groupId;
      const isWithdrawMessage = processedMessage.messageType === 101;
      if (isWithdrawMessage) {
        const messageIdToDelete = processedMessage.content;
        if (messageIdToDelete) {
          deleteGroupMessage(groupId, messageIdToDelete);
        }
      }
      const targetMessages = loading.value 
        ? (cacheGroupMessages[groupId] || (cacheGroupMessages[groupId] = []))
        : (groupMessages.value[groupId] || (groupMessages.value[groupId] = []));
      const exists = targetMessages.some(m => m.id === processedMessage.id);
      const fullExists = fullGroupMessages[groupId]?.some(m => m.id === processedMessage.id) || false;
      
      // 更新完整消息列表（包括 101 撤回消息）
      if (!fullExists) {
        if (fullGroupMessages[groupId] === null || fullGroupMessages[groupId] === undefined) {
          fullGroupMessages[groupId] = [processedMessage];
        } else {
          fullGroupMessages[groupId].push(processedMessage);
        }
        groupStored.value[groupId] = false;
      }
      
      if (!exists && !isWithdrawMessage) {
        if (loading.value) {
          cacheGroupMessages[groupId].unshift({
            ...processedMessage,
            group_id: groupId,
            group_name: message.groupName
          });
        } else {
          groupMessages.value[groupId].unshift({
            ...processedMessage,
            group_id: groupId,
            group_name: message.groupName
          });
          groupStored.value[groupId] = false;
        }
      } else if (exists) {
        // 消息已存在但需要确保标记为未保存
        groupStored.value[groupId] = false;
      }
      if (processedMessage.id > publicAndGroupMinId.value) {
        publicAndGroupMinId.value = processedMessage.id;
      }
    } else if (message.type === 'private') {
      // 确定对话方 ID（使用字符串比较确保类型一致）
      const msgSenderId = String(message.senderId || message.sender_id);
      const msgReceiverId = String(message.receiverId || message.receiver_id);
      const currentUserIdStr = String(currentUser.value?.id);
      
      // otherUserId 是对话方的 ID（不是自己的 ID）
      const otherUserId = msgSenderId === currentUserIdStr ? msgReceiverId : msgSenderId;
      
      const isWithdrawMessage = processedMessage.messageType === 101;
      if (isWithdrawMessage) {
        const messageIdToDelete = processedMessage.content;
        if (messageIdToDelete) {
          deletePrivateMessage(otherUserId, messageIdToDelete);
        }
      }
      const targetMessages = loading.value 
        ? (cachePrivateMessages[otherUserId] || (cachePrivateMessages[otherUserId] = []))
        : (privateMessages.value[otherUserId] || (privateMessages.value[otherUserId] = []));
      const exists = targetMessages.some(m => m.id === processedMessage.id);
      const fullExists = fullPrivateMessages[otherUserId]?.some(m => m.id === processedMessage.id) || false;
      
      // 更新完整消息列表（包括 101 撤回消息）
      if (!fullExists) {
        const fullMsg = {
          ...processedMessage,
          receiver_id: message.receiverId || message.receiver_id,
          is_read: message.isRead !== undefined ? message.isRead : (message.is_read !== undefined ? message.is_read : 0)
        };
        if (!fullPrivateMessages[otherUserId]) {
          fullPrivateMessages[otherUserId] = [fullMsg];
        } else {
          fullPrivateMessages[otherUserId].push(fullMsg);
        }
        privateStored.value[otherUserId] = false;
      }
      
      if (!exists && !isWithdrawMessage) {
        if (loading.value) {
          cachePrivateMessages[otherUserId].unshift({
            ...processedMessage,
            receiver_id: message.receiverId || message.receiver_id,
            is_read: message.isRead !== undefined ? message.isRead : (message.is_read !== undefined ? message.is_read : 0)
          });
        } else {
          privateMessages.value[otherUserId].unshift({
            ...processedMessage,
            receiver_id: message.receiverId || message.receiver_id,
            is_read: message.isRead !== undefined ? message.isRead : (message.is_read !== undefined ? message.is_read : 0)
          });
          privateStored.value[otherUserId] = false;
        }
      } else if (exists) {
        // 消息已存在但需要确保标记为未保存
        privateStored.value[otherUserId] = false;
      }
      if (processedMessage.id > privateMinId.value) {
        privateMinId.value = processedMessage.id;
      }
    }
  }

  async function fetchAndMergeOfflineMessages() {
    if (!currentUser.value || !currentSessionToken.value) {
      return;
    }

    isFetchingOfflineMessages.value = true;
    showFetchingMessage.value = true;
    loading.value = true;

    try {
      const publicAndGroupMinIdParam = publicAndGroupMinId.value;
      const privateMinIdParam = privateMinId.value;

      const response = await fetch(`${SERVER_URL}/api/offline-messages?publicAndGroupMinId=${publicAndGroupMinIdParam}&privateMinId=${privateMinIdParam}`, {
        headers: {
          'user-id': currentUser.value.id,
          'session-token': currentSessionToken.value
        }
      });

      const data = await response.json();

      if (data.status === 'success') {
        if (data.publicMessages && data.publicMessages.length > 0) {
          data.publicMessages.forEach(message => {
            processOfflineMessage({ ...message, type: 'public' });
          });
        }
        if (data.groupMessages && data.groupMessages.length > 0) {
          data.groupMessages.forEach(message => {
            processOfflineMessage({ ...message, type: 'group' });
          });
        }
        if (data.privateMessages && data.privateMessages.length > 0) {
          data.privateMessages.forEach(message => {
            processOfflineMessage({ ...message, type: 'private' });
          });
        }
      }
    } catch (error) {
      console.error('获取离线消息失败:', error);
    } finally {
      loading.value = false;
      isFetchingOfflineMessages.value = false;
      
      if (cachePublicMessages.length > 0) {
        const existingIds = new Set(publicMessages.value.map(m => m.id));
        const newMessages = cachePublicMessages.filter(m => !existingIds.has(m.id));
        
        // 更新未读计数（主聊天室）
        if (newMessages.length > 0) {
          const currentUserId = currentUser.value?.id;
          const isMainChatActive = currentActiveChat.value === 'main';
          const isPageVisible = window.isPageVisible !== false && document.hasFocus();
          
          // 如果不在主聊天室页面或页面不可见，增加未读计数
          if (!isMainChatActive || !isPageVisible) {
            unreadMessages.value.global += newMessages.length;
            // 保存到 localStorage
            saveUnreadCountsToLocalStorage();
          }
        }
        
        // 更新完整消息列表（包括 101 撤回消息）- 新消息放在后面（因为是离线期间的消息）
        if (fullPublicMessages === null) {
          fullPublicMessages = [...publicMessages.value, ...newMessages];
        } else {
          const fullIds = new Set(fullPublicMessages.map(m => m.id));
          const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
          fullPublicMessages = [...fullPublicMessages, ...fullNewMessages];
        }
        
        // 更新显示消息列表（只显示非 101 消息，最多 20 条）- 新消息放在后面
        const displayNewMessages = newMessages.filter(m => m.messageType !== 101);
        publicMessages.value = [...publicMessages.value, ...displayNewMessages].slice(-20);
        cachePublicMessages = [];
      }
      
      Object.keys(cacheGroupMessages).forEach(groupId => {
        if (cacheGroupMessages[groupId]) {
          const existingIds = new Set((groupMessages.value[groupId] || []).map(m => m.id));
          const newMessages = cacheGroupMessages[groupId].filter(m => !existingIds.has(m.id));
          
          // 更新未读计数（群组）
          if (newMessages.length > 0) {
            const currentUserId = currentUser.value?.id;
            const isGroupChatActive = currentActiveChat.value === `group_${groupId}`;
            const isPageVisible = window.isPageVisible !== false && document.hasFocus();
            
            // 如果不在当前群组页面或页面不可见，增加未读计数
            if (!isGroupChatActive || !isPageVisible) {
              if (!unreadMessages.value.groups[groupId]) {
                unreadMessages.value.groups[groupId] = 0;
              }
              unreadMessages.value.groups[groupId] += newMessages.length;
              // 保存到 localStorage
              saveUnreadCountsToLocalStorage();
            }
          }
          
          // 更新群组最后消息时间并重新排序
          if (newMessages.length > 0 && groupsList.value) {
            const group = groupsList.value.find(g => String(g.id) === String(groupId));
            if (group) {
              const lastMessage = newMessages[newMessages.length - 1];
              const newTime = new Date(lastMessage.timestamp || Date.now()).toISOString();
              group.last_message_time = newTime;
              saveGroupLastMessageTime(groupId, newTime);
            }
            sortGroupsByLastMessageTime();
          }
          
          // 更新完整消息列表（包括 101 撤回消息）- 新消息放在后面
          if (!fullGroupMessages[groupId]) {
            fullGroupMessages[groupId] = [...(groupMessages.value[groupId] || []), ...newMessages];
          } else {
            const fullIds = new Set(fullGroupMessages[groupId].map(m => m.id));
            const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
            fullGroupMessages[groupId] = [...fullGroupMessages[groupId], ...fullNewMessages];
          }
          
          // 更新显示消息列表（只显示非 101 消息，最多 20 条）- 新消息放在后面
          const displayNewMessages = newMessages.filter(m => m.messageType !== 101);
          groupMessages.value[groupId] = [...(groupMessages.value[groupId] || []), ...displayNewMessages].slice(-20);
        }
      });
      cacheGroupMessages = {};
      
      Object.keys(cachePrivateMessages).forEach(userId => {
        if (cachePrivateMessages[userId]) {
          const existingIds = new Set((privateMessages.value[userId] || []).map(m => m.id));
          const newMessages = cachePrivateMessages[userId].filter(m => !existingIds.has(m.id));
          
          // 更新未读计数（私信）
          if (newMessages.length > 0) {
            const currentUserId = currentUser.value?.id;
            const isPrivateChatActive = currentActiveChat.value === `private_${userId}`;
            const isPageVisible = window.isPageVisible !== false && document.hasFocus();
            
            // 如果不在当前私信页面或页面不可见，增加未读计数
            if (!isPrivateChatActive || !isPageVisible) {
              if (!unreadMessages.value.private[userId]) {
                unreadMessages.value.private[userId] = 0;
              }
              unreadMessages.value.private[userId] += newMessages.length;
              // 保存到 localStorage
              saveUnreadCountsToLocalStorage();
            }
          }
          
          // 更新私信最后消息时间并重新排序
          if (newMessages.length > 0 && friendsList.value) {
            const friend = friendsList.value.find(f => String(f.id) === String(userId));
            if (friend) {
              const lastMessage = newMessages[newMessages.length - 1];
              const newTime = new Date(lastMessage.timestamp || Date.now()).toISOString();
              friend.last_message_time = newTime;
              saveFriendLastMessageTime(userId, newTime);
            }
            sortFriendsByLastMessageTime();
          }
          
          // 更新完整消息列表（包括 101 撤回消息）- 新消息放在后面
          if (!fullPrivateMessages[userId]) {
            fullPrivateMessages[userId] = [...(privateMessages.value[userId] || []), ...newMessages];
          } else {
            const fullIds = new Set(fullPrivateMessages[userId].map(m => m.id));
            const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
            fullPrivateMessages[userId] = [...fullPrivateMessages[userId], ...fullNewMessages];
          }
          
          // 更新显示消息列表（只显示非 101 消息，最多 20 条）- 新消息放在后面
          const displayNewMessages = newMessages.filter(m => m.messageType !== 101);
          privateMessages.value[userId] = [...(privateMessages.value[userId] || []), ...displayNewMessages].slice(-20);
        }
      });
      cachePrivateMessages = {};

      publicStored.value = false;
      Object.keys(groupMessages.value).forEach(id => groupStored.value[id] = false);
      Object.keys(privateMessages.value).forEach(id => privateStored.value[id] = false);
      saveToStorage();
      
      setTimeout(() => {
        showFetchingMessage.value = false;
      }, 500);
      
      saveMinIds();
    }
  }
  
  async function saveMinIds() {
    try {
      const prefix = getStorageKeyPrefix();
      await localForage.setItem(`${prefix}-minIds`, {
        publicAndGroupMinId: toRaw(publicAndGroupMinId.value),
        privateMinId: toRaw(privateMinId.value),
      });
    } catch (err) {
      console.error('保存 minId 失败:', err);
    }
  }
  
  async function loadMinIds() {
    try {
      const prefix = getStorageKeyPrefix();
      const data = await localForage.getItem(`${prefix}-minIds`);
      if (data) {
        publicAndGroupMinId.value = data.publicAndGroupMinId || 0;
        privateMinId.value = data.privateMinId || 0;
      }
    } catch (err) {
      console.error('加载 minId 失败:', err);
    }
  }
  
  function saveUnreadCountsToLocalStorage() {
    try {
      const counts = {
        global: unreadMessages.value.global,
        groups: unreadMessages.value.groups,
        private: unreadMessages.value.private
      };
      localStorage.setItem(`unread_counts_${currentUser.value?.id}`, JSON.stringify(counts));
    } catch (err) {
      console.error('保存未读计数失败:', err);
    }
  }
  
  function getGroupLastMessage(groupId) {
    const messages = fullGroupMessages[groupId] || groupMessages.value[groupId] || [];
    const validMessages = messages.filter(m => m.messageType !== 101);
    if (validMessages.length === 0) return null;
    return validMessages[validMessages.length - 1];
  }

  function getPrivateLastMessage(userId) {
    const messages = fullPrivateMessages[userId] || privateMessages.value[userId] || [];
    const validMessages = messages.filter(m => m.messageType !== 101);
    if (validMessages.length === 0) return null;
    return validMessages[validMessages.length - 1];
  }

  function formatMessageContent(message) {
    if (!message) return '';
    
    let content = message.content || '';
    let msgType = message.messageType;
    
    const parseQuotedContent = (quotedMsg) => {
      if (!quotedMsg) return '';
      
      const qType = quotedMsg.messageType;
      
      if (qType === 1) {
        return '[图片]';
      } else if (qType === 2) {
        return '[文件]';
      } else if (qType === 3) {
        return '[群名片]';
      } else if (qType === 101) {
        return '撤回了一条消息';
      } else if (qType === 4 && (quotedMsg.quotedMessage || quotedMsg.quoted_message || quotedMsg.quoted)) {
        return parseQuotedContent(quotedMsg.quotedMessage || quotedMsg.quoted_message || quotedMsg.quoted);
      }
      
      return quotedMsg.content || '';
    };
    
    if (msgType === 4) {
      if (typeof content === 'string' && content.startsWith('{')) {
        try {
          const parsed = JSON.parse(content);
          if (parsed.type === 'quoted') {
            if (parsed.quoted) {
              const originalContent = parseQuotedContent(parsed.quoted);
              return `[引用] ${originalContent}`;
            } else if (parsed.text) {
              return `[引用] ${parsed.text}`;
            }
          }
        } catch {
        }
      }
      return '[引用]';
    } else if (msgType === 1) {
      return '[图片]';
    } else if (msgType === 2) {
      return '[文件]';
    } else if (msgType === 3) {
      return '[群名片]';
    } else if (msgType === 101) {
      return '撤回了一条消息';
    } else if (message.group_card || message.groupCard) {
      return '[群名片]';
    }
    
    if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.type === 'quoted' && parsed.quoted) {
          const originalContent = parseQuotedContent(parsed.quoted);
          return `[引用] ${originalContent}`;
        }
      } catch {
      }
    }
    
    return content || '';
  }

  function updateGroupLastMessage(groupId, message) {
    if (!groupsList.value) return;
    const group = groupsList.value.find(g => String(g.id) === String(groupId));
    if (group) {
      group.lastMessage = message;
    }
  }

  function updateFriendLastMessage(userId, message) {
    if (!friendsList.value) return;
    const friend = friendsList.value.find(f => String(f.id) === String(userId));
    if (friend) {
      friend.lastMessage = message;
    }
  }

  function updateGroupLastMessageAfterDelete(groupId) {
    if (!groupsList.value) return;
    const group = groupsList.value.find(g => String(g.id) === String(groupId));
    if (!group) return;

    const messages = fullGroupMessages[groupId] || [];
    const validMessages = messages.filter(m => m.messageType !== 101);
    
    if (validMessages.length > 0) {
      const lastMessage = validMessages[validMessages.length - 1];
      group.lastMessage = lastMessage;
      const newTime = new Date(lastMessage.timestamp || Date.now()).toISOString();
      group.last_message_time = newTime;
      saveGroupLastMessageTime(groupId, newTime);
    } else {
      group.lastMessage = null;
      group.last_message_time = null;
      saveGroupLastMessageTime(groupId, null);
    }
    
    sortGroupsByLastMessageTime();
  }

  function updateFriendLastMessageAfterDelete(userId) {
    if (!friendsList.value) return;
    const friend = friendsList.value.find(f => String(f.id) === String(userId));
    if (!friend) return;

    const messages = fullPrivateMessages[userId] || [];
    const validMessages = messages.filter(m => m.messageType !== 101);
    
    if (validMessages.length > 0) {
      const lastMessage = validMessages[validMessages.length - 1];
      friend.lastMessage = lastMessage;
      const newTime = new Date(lastMessage.timestamp || Date.now()).toISOString();
      friend.last_message_time = newTime;
      saveFriendLastMessageTime(userId, newTime);
    } else {
      friend.lastMessage = null;
      friend.last_message_time = null;
      saveFriendLastMessageTime(userId, null);
    }
    
    sortFriendsByLastMessageTime();
  }

  function loadUnreadCountsFromLocalStorage() {
    try {
      const data = localStorage.getItem(`unread_counts_${currentUser.value?.id}`);
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

  function setGroupAllLoaded(groupId, value) {
    groupAllLoaded.value[groupId] = value;
  }
  
  function isGroupAllLoaded(groupId) {
    return groupAllLoaded.value[groupId] || false;
  }
  
  function setPrivateAllLoaded(userId, value) {
    privateAllLoaded.value[userId] = value;
  }
  
  function isPrivateAllLoaded(userId) {
    return privateAllLoaded.value[userId] || false;
  }
  
  function setPublicAllLoaded(value) {
    publicAllLoaded.value = value;
  }
  
  function isPublicAllLoaded() {
    return publicAllLoaded.value;
  }
  
  async function initializeMessages() {
    showFetchingMessage.value = true;

    try {
      // 先加载未读计数
      loadUnreadCountsFromLocalStorage();
      await loadMessages();
      await fetchAndMergeOfflineMessages();
    } catch (error) {
      console.error('初始化消息流程失败:', error);
      showFetchingMessage.value = false;
    }
  }

  return {
    onlineUsers,
    offlineUsers,
    groupsList,
    friendsList,
    publicMessages,
    groupMessages,
    privateMessages,
    unreadMessages,
    quotedMessage,
    setQuotedMessage,
    clearQuotedMessage,
    clearOtherGroupMessages,
    clearOtherPrivateMessages,
    clearPublicMessagesExceptRecent,
    currentUser,
    currentSessionToken,
    currentGroupId,
    currentGroupName,
    currentPrivateChatUserId,
    currentPrivateChatUsername,
    currentPrivateChatNickname,
    currentPrivateChatAvatarUrl,
    currentActiveChat,
    currentSendChatType,
    selectedGroupIdForCard,
    isPageVisible,
    isConnected,
    loading,
    isFetchingOfflineMessages,
    showFetchingMessage,
    hasReceivedHistory,
    hasReceivedGroupHistory,
    hasReceivedPrivateHistory,
    mainMessageInput,
    groupMessageInput,
    privateMessageInput,
    uploadProgress,
    showUploadProgress,
    showGroupInfoModal,
    showSendGroupCardModal,
    showCreateGroupModal,
    showAddGroupMemberModal,
    showUserProfileModal,
    showUserSearchModal,
    showImagePreviewModal,
    showAvatarPreviewModal,
    showUserAvatarPopup,
    showGroupCardPopup,
    modalData,
    SERVER_URL,
    setCurrentUser,
    setCurrentSessionToken,
    setCurrentGroupId,
    setCurrentPrivateChatUserId,
    setCurrentActiveChat,
    openModal,
    closeModal,
    addPublicMessage,
    addGroupMessage,
    addPrivateMessage,
    setPublicMessages,
    setGroupMessages,
    setPrivateMessages,
    prependPublicMessages,
    prependGroupMessages,
    prependPrivateMessages,
    clearPublicMessages,
    clearGroupMessages,
    clearPrivateMessages,
    deletePublicMessage,
    deleteGroupMessage,
    deletePrivateMessage,
    updateUserInfoInMessages,
    updateGroupInfoInMessages,
    moveGroupToTop,
    moveFriendToTop,
    saveGroupLastMessageTime,
    saveFriendLastMessageTime,
    getGroupLastMessageTime,
    getFriendLastMessageTime,
    deleteGroupLastMessageTime,
    deleteFriendLastMessageTime,
    clearGroupUnread,
    clearPrivateUnread,
    clearGlobalUnread,
    incrementGroupUnread,
    incrementGlobalUnread,
    incrementPrivateUnread,
    saveGroupLastMessageTimes,
    saveFriendLastMessageTimes,
    sortFriendsByLastMessageTime,
    sortGroupsByLastMessageTime,
    sortMessages,
    setLoading,
    refreshMessages,
    saveToStorage,
    loadMessages,
    clearMessages,
    processOfflineMessage,
    fetchAndMergeOfflineMessages,
    initializeMessages,
    setGroupAllLoaded,
    isGroupAllLoaded,
    setPrivateAllLoaded,
    isPrivateAllLoaded,
    setPublicAllLoaded,
    isPublicAllLoaded,
    saveMinIds,
    loadMinIds,
    publicAndGroupMinId,
    privateMinId,
    publicPageSize,
    publicPageOffset,
    publicLoadingMore,
    groupPageSize,
    groupPageOffset,
    groupLoadingMore,
    privatePageSize,
    privatePageOffset,
    privateLoadingMore,
    fullPublicMessages,
    fullGroupMessages,
    fullPrivateMessages,
    getGroupLastMessage,
    getPrivateLastMessage,
    formatMessageContent,
    updateGroupLastMessage,
    updateFriendLastMessage
  };
});
