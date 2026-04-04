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
  
  // 草稿存储
  const drafts = ref({
    main: '',
    groups: {},
    private: {}
  });
  
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
  
  // 记录哪些群组有@我的消息
  const groupsWithAtMe = ref({});
  
  const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://back.hs.airoe.cn';
  
  function getStorageKeyPrefix() {
    const userId = currentUser.value?.id || 'guest';
    return `chats-${userId}`;
  }
  
  function setCurrentUser(user) {
    currentUser.value = user;
    if (user) {
      loadUnreadCountsFromLocalStorage();
      loadGroupsWithAtMeFromLocalStorage();
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
    // 清除该群组的@我标记
    if (id) {
      clearGroupHasAtMe(id);
    }
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
      // 清除该群组的@我标记
      if (groupId) {
        clearGroupHasAtMe(groupId);
      }
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
    const isUserInfoUpdateMessage = message.messageType === 102;
    const messages = loading.value ? cachePublicMessages : publicMessages.value;
    const exists = messages.some(m => m.id === message.id);
    if (!exists && !isWithdrawMessage && !isUserInfoUpdateMessage) {
      messages.push(message);
    }
    // 同时更新完整消息列表（包括101和102消息），新消息在后
    if (fullPublicMessages === null) {
      fullPublicMessages = [message];
    } else {
      const fullExists = fullPublicMessages.some(m => m.id === message.id);
      if (!fullExists) {
        fullPublicMessages.push(message);
      }
    }
    // 更新 minId
    if (message.id && message.id > publicAndGroupMinId.value) {
      publicAndGroupMinId.value = message.id;
      if (saveMinIds) {
        saveMinIds();
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
    // 同时更新完整消息列表（包括101消息），新消息在后
    if (fullGroupMessages[groupId] === null || fullGroupMessages[groupId] === undefined) {
      fullGroupMessages[groupId] = [message];
    } else {
      const fullExists = fullGroupMessages[groupId].some(m => m.id === message.id);
      if (!fullExists) {
        fullGroupMessages[groupId].push(message);
      }
    }
    // 更新 minId
    if (message.id && message.id > publicAndGroupMinId.value) {
      publicAndGroupMinId.value = message.id;
      if (saveMinIds) {
        saveMinIds();
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
    // 同时更新完整消息列表（包括101消息），新消息在后
    if (fullPrivateMessages[userId] === null || fullPrivateMessages[userId] === undefined) {
      fullPrivateMessages[userId] = [message];
    } else {
      const fullExists = fullPrivateMessages[userId].some(m => m.id === message.id);
      if (!fullExists) {
        fullPrivateMessages[userId].push(message);
      }
    }
    // 更新 minId
    if (message.id && message.id > privateMinId.value) {
      privateMinId.value = message.id;
      if (saveMinIds) {
        saveMinIds();
      }
    }
    if (!loading.value) {
      privateStored.value[userId] = false;
      saveToStorage();
    }
  }

  function setPublicMessages(messages) {
    if (loading.value) {
      cachePublicMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
    } else {
      // 更新完整消息列表（保存原始顺序）
      if (fullPublicMessages === null) {
        fullPublicMessages = [...messages];
      } else {
        // 合并现有消息和新消息（新消息在后，保持原始顺序）
        const fullExistingIds = new Set(fullPublicMessages.map(m => m.id));
        const fullNewMessages = messages.filter(m => !fullExistingIds.has(m.id));
        fullPublicMessages = [...fullPublicMessages, ...fullNewMessages];
      }
      // 只在 store 中保存最近 20 条非101、非102消息（用于显示）
      const filteredMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
      publicMessages.value = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
      publicStored.value = false;
      saveToStorage();
    }
  }

  function setGroupMessages(groupId, messages) {
    
    // 检查拉取的消息中是否有@自己的消息
    if (currentUser.value) {
      for (const message of messages) {
        if (message.at_userid && message.messageType !== 101 && message.messageType !== 102) {
          const atUserIds = Array.isArray(message.at_userid) ? message.at_userid : [message.at_userid];
          const isCurrentUserAt = atUserIds.some(id => String(id) === String(currentUser.value.id));
          if (isCurrentUserAt) {
            setGroupHasAtMe(groupId);
          }
        }
      }
    }
    
    if (loading.value) {
      cacheGroupMessages[groupId] = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
    } else {
      // 更新完整消息列表（保存原始顺序）
      if (fullGroupMessages[groupId] === null || fullGroupMessages[groupId] === undefined) {
        fullGroupMessages[groupId] = [...messages];
      } else {
        // 合并现有消息和新消息（新消息在后，保持原始顺序）
        const fullExistingIds = new Set(fullGroupMessages[groupId].map(m => m.id));
        const fullNewMessages = messages.filter(m => !fullExistingIds.has(m.id));
        fullGroupMessages[groupId] = [...fullGroupMessages[groupId], ...fullNewMessages];
      }
      // 只在 store 中保存最近 20 条非101、非102消息（用于显示）
      const filteredMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
      groupMessages.value[groupId] = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
      groupStored.value[groupId] = false;
      saveToStorage();
    }
  }

  function setPrivateMessages(userId, messages) {
    if (loading.value) {
      cachePrivateMessages[userId] = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
    } else {
      // 更新完整消息列表（保存原始顺序）
      if (fullPrivateMessages[userId] === null || fullPrivateMessages[userId] === undefined) {
        fullPrivateMessages[userId] = [...messages];
      } else {
        // 合并现有消息和新消息（新消息在后，保持原始顺序）
        const fullExistingIds = new Set(fullPrivateMessages[userId].map(m => m.id));
        const fullNewMessages = messages.filter(m => !fullExistingIds.has(m.id));
        fullPrivateMessages[userId] = [...fullPrivateMessages[userId], ...fullNewMessages];
      }
      // 只在 store 中保存最近 20 条非101、非102消息（用于显示）
      const filteredMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
      privateMessages.value[userId] = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
      privateStored.value[userId] = false;
      saveToStorage();
    }
  }

  function prependPublicMessages(messages) {
    const targetMessages = loading.value ? cachePublicMessages : publicMessages.value;
    const existingIds = new Set(targetMessages.map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id));
    const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
    
    if (loading.value) {
      cachePublicMessages = [...displayNewMessages, ...cachePublicMessages];
    } else {
      // 更新完整消息列表 - 新消息（加载的是更旧的消息）放在前面
      if (fullPublicMessages !== null) {
        const fullIds = new Set(fullPublicMessages.map(m => m.id));
        const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
        // 确保按 ID 升序排序（从小到大，最旧的在前）
        fullNewMessages.sort((a, b) => a.id - b.id);
        fullPublicMessages = [...fullNewMessages, ...fullPublicMessages];
      }
      // 确保按 ID 升序排序（从小到大，最旧的在前）
      displayNewMessages.sort((a, b) => a.id - b.id);
      publicMessages.value = [...displayNewMessages, ...publicMessages.value];
      publicStored.value = false;
      saveToStorage();
    }
  }

  function prependGroupMessages(groupId, messages) {
    
    // 检查拉取的消息中是否有@自己的消息
    if (currentUser.value) {
      for (const message of messages) {
        if (message.at_userid && message.messageType !== 101 && message.messageType !== 102) {
          const atUserIds = Array.isArray(message.at_userid) ? message.at_userid : [message.at_userid];
          const isCurrentUserAt = atUserIds.some(id => String(id) === String(currentUser.value.id));
          if (isCurrentUserAt) {
            setGroupHasAtMe(groupId);
            break;
          }
        }
      }
    }
    
    const targetMessages = loading.value ? (cacheGroupMessages[groupId] || (cacheGroupMessages[groupId] = [])) : (groupMessages.value[groupId] || (groupMessages.value[groupId] = []));
    const existingIds = new Set(targetMessages.map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id));
    const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
    if (loading.value) {
      cacheGroupMessages[groupId] = [...displayNewMessages, ...(cacheGroupMessages[groupId] || [])];
    } else {
      // 更新完整消息列表 - 新消息（加载的是更旧的消息）放在前面
      if (fullGroupMessages[groupId] !== null && fullGroupMessages[groupId] !== undefined) {
        const fullIds = new Set(fullGroupMessages[groupId].map(m => m.id));
        const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
        // 确保按 ID 升序排序（从小到大，最旧的在前）
        fullNewMessages.sort((a, b) => a.id - b.id);
        fullGroupMessages[groupId] = [...fullNewMessages, ...fullGroupMessages[groupId]];
      }
      // 确保按 ID 升序排序（从小到大，最旧的在前）
      displayNewMessages.sort((a, b) => a.id - b.id);
      groupMessages.value[groupId] = [...displayNewMessages, ...groupMessages.value[groupId]];
      groupStored.value[groupId] = false;
      saveToStorage();
    }
  }

  function prependPrivateMessages(userId, messages) {
    const targetMessages = loading.value ? (cachePrivateMessages[userId] || (cachePrivateMessages[userId] = [])) : (privateMessages.value[userId] || (privateMessages.value[userId] = []));
    const existingIds = new Set(targetMessages.map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id));
    const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
    if (loading.value) {
      cachePrivateMessages[userId] = [...displayNewMessages, ...(cachePrivateMessages[userId] || [])];
    } else {
      // 更新完整消息列表 - 新消息（加载的是更旧的消息）放在前面
      if (fullPrivateMessages[userId] !== null && fullPrivateMessages[userId] !== undefined) {
        const fullIds = new Set(fullPrivateMessages[userId].map(m => m.id));
        const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
        // 确保按 ID 升序排序（从小到大，最旧的在前）
        fullNewMessages.sort((a, b) => a.id - b.id);
        fullPrivateMessages[userId] = [...fullNewMessages, ...fullPrivateMessages[userId]];
      }
      // 确保按 ID 升序排序（从小到大，最旧的在前）
      displayNewMessages.sort((a, b) => a.id - b.id);
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
    // 先从 localStorage 加载最新数据，避免覆盖
    loadUnreadCountsFromLocalStorage();
    const groupIdStr = String(groupId);
    if (unreadMessages.value.groups && unreadMessages.value.groups[groupIdStr]) {
      delete unreadMessages.value.groups[groupIdStr];
    }
    // 保存到 localStorage
    saveUnreadCountsToLocalStorage();
  }

  function clearPrivateUnread(userId) {
    // 先从 localStorage 加载最新数据，避免覆盖
    loadUnreadCountsFromLocalStorage();
    const userIdStr = String(userId);
    if (unreadMessages.value.private && unreadMessages.value.private[userIdStr]) {
      delete unreadMessages.value.private[userIdStr];
    }
    // 保存到 localStorage
    saveUnreadCountsToLocalStorage();
    // 发送已读消息事件到后端
    if (window.sendReadMessageEvent) {
      window.sendReadMessageEvent('private', { friendId: userId });
    }
  }
  
  function incrementGroupUnread(groupId) {
    // 先从 localStorage 加载最新数据，避免覆盖
    loadUnreadCountsFromLocalStorage();
    const groupIdStr = String(groupId);
    if (!unreadMessages.value.groups[groupIdStr]) {
      unreadMessages.value.groups[groupIdStr] = 0;
    }
    unreadMessages.value.groups[groupIdStr]++;
    // 保存到 localStorage
    saveUnreadCountsToLocalStorage();
  }
  
  function incrementGlobalUnread() {
    // 先从 localStorage 加载最新数据，避免覆盖
    loadUnreadCountsFromLocalStorage();
    unreadMessages.value.global++;
    // 保存到 localStorage
    saveUnreadCountsToLocalStorage();
  }
  
  function incrementPrivateUnread(userId) {
    // 先从 localStorage 加载最新数据，避免覆盖
    loadUnreadCountsFromLocalStorage();
    const userIdStr = String(userId);
    if (!unreadMessages.value.private[userIdStr]) {
      unreadMessages.value.private[userIdStr] = 0;
    }
    unreadMessages.value.private[userIdStr]++;
    // 保存到 localStorage
    saveUnreadCountsToLocalStorage();
  }
  
  function clearGlobalUnread() {
    // 先从 localStorage 加载最新数据，避免覆盖
    loadUnreadCountsFromLocalStorage();
    unreadMessages.value.global = 0;
    // 保存到 localStorage
    saveUnreadCountsToLocalStorage();
  }

  function findUserById(userId) {
    const idStr = String(userId);
    if (currentUser.value && String(currentUser.value.id) === idStr) {
      return currentUser.value;
    }
    if (friendsList.value) {
      const friend = friendsList.value.find(f => String(f.id) === idStr);
      if (friend) {
        return friend;
      }
    }
    if (groupsList.value) {
      for (const group of groupsList.value) {
        if (group.members) {
          const member = group.members.find(m => String(m.id) === idStr);
          if (member) {
            return member;
          }
        }
      }
    }
    return null;
  }

  function getUserName(userId) {
    const user = findUserById(userId);
    if (user) {
      return user.nickname || user.username || '未知用户';
    }
    return '未知用户';
  }

  function getUserAvatar(userId) {
    const user = findUserById(userId);
    if (user) {
      return user.avatarUrl || '';
    }
    return '';
  }

  function updateUserInfoInMessages(userId, userInfo) {
    const userIdStr = String(userId);

    if (fullPublicMessages && fullPublicMessages.length > 0) {
      for (let i = 0; i < fullPublicMessages.length; i++) {
        if (String(fullPublicMessages[i].sender_id) === userIdStr || String(fullPublicMessages[i].userId) === userIdStr) {
          if (userInfo.nickname) {
            fullPublicMessages[i].nickname = userInfo.nickname;
          }
          if (userInfo.avatarUrl) {
            fullPublicMessages[i].avatarUrl = userInfo.avatarUrl;
          }
        }
      }
    }

    if (fullGroupMessages) {
      for (const groupId in fullGroupMessages) {
        if (fullGroupMessages[groupId] && fullGroupMessages[groupId].length > 0) {
          for (let i = 0; i < fullGroupMessages[groupId].length; i++) {
            if (String(fullGroupMessages[groupId][i].sender_id) === userIdStr || String(fullGroupMessages[groupId][i].userId) === userIdStr) {
              if (userInfo.nickname) {
                fullGroupMessages[groupId][i].nickname = userInfo.nickname;
              }
              if (userInfo.avatarUrl) {
                fullGroupMessages[groupId][i].avatarUrl = userInfo.avatarUrl;
              }
            }
          }
        }
      }
    }

    if (fullPrivateMessages) {
      for (const otherUserId in fullPrivateMessages) {
        if (fullPrivateMessages[otherUserId] && fullPrivateMessages[otherUserId].length > 0) {
          for (let i = 0; i < fullPrivateMessages[otherUserId].length; i++) {
            if (String(fullPrivateMessages[otherUserId][i].sender_id) === userIdStr || String(fullPrivateMessages[otherUserId][i].userId) === userIdStr) {
              if (userInfo.nickname) {
                fullPrivateMessages[otherUserId][i].nickname = userInfo.nickname;
              }
              if (userInfo.avatarUrl) {
                fullPrivateMessages[otherUserId][i].avatarUrl = userInfo.avatarUrl;
              }
            }
          }
        }
      }
    }

    if (publicMessages.value && publicMessages.value.length > 0) {
      const newPublicMessages = publicMessages.value.map(msg => {
        if (String(msg.sender_id) === userIdStr || String(msg.userId) === userIdStr) {
          return {
            ...msg,
            ...(userInfo.nickname && { nickname: userInfo.nickname }),
            ...(userInfo.avatarUrl && { avatarUrl: userInfo.avatarUrl })
          };
        }
        return msg;
      });
      publicMessages.value = newPublicMessages;
    }

    if (groupMessages.value) {
      for (const groupId in groupMessages.value) {
        if (groupMessages.value[groupId] && groupMessages.value[groupId].length > 0) {
          const newGroupMessages = groupMessages.value[groupId].map(msg => {
            if (String(msg.sender_id) === userIdStr || String(msg.userId) === userIdStr) {
              return {
                ...msg,
                ...(userInfo.nickname && { nickname: userInfo.nickname }),
                ...(userInfo.avatarUrl && { avatarUrl: userInfo.avatarUrl })
              };
            }
            return msg;
          });
          groupMessages.value[groupId] = newGroupMessages;
        }
      }
    }

    if (privateMessages.value) {
      for (const otherUserId in privateMessages.value) {
        if (privateMessages.value[otherUserId] && privateMessages.value[otherUserId].length > 0) {
          const newPrivateMessages = privateMessages.value[otherUserId].map(msg => {
            if (String(msg.sender_id) === userIdStr || String(msg.userId) === userIdStr) {
              return {
                ...msg,
                ...(userInfo.nickname && { nickname: userInfo.nickname }),
                ...(userInfo.avatarUrl && { avatarUrl: userInfo.avatarUrl })
              };
            }
            return msg;
          });
          privateMessages.value[otherUserId] = newPrivateMessages;
        }
      }
    }

    publicStored.value = false;
    if (groupStored.value) {
      for (const groupId in groupStored.value) {
        groupStored.value[groupId] = false;
      }
    }
    if (privateStored.value) {
      for (const otherUserId in privateStored.value) {
        privateStored.value[otherUserId] = false;
      }
    }

    if (groupsList.value && groupsList.value.length > 0) {
      for (let i = 0; i < groupsList.value.length; i++) {
        const group = groupsList.value[i];
        if (group.lastMessage) {
          const lastMsg = group.lastMessage;
          if (String(lastMsg.userId) === userIdStr || String(lastMsg.sender_id) === userIdStr) {
            if (userInfo.nickname) {
              lastMsg.nickname = userInfo.nickname;
            }
            if (userInfo.avatarUrl) {
              lastMsg.avatarUrl = userInfo.avatarUrl;
            }
          }
        }
      }
    }

    if (friendsList.value && friendsList.value.length > 0) {
      for (let i = 0; i < friendsList.value.length; i++) {
        const friend = friendsList.value[i];
        if (friend.lastMessage) {
          const lastMsg = friend.lastMessage;
          if (String(lastMsg.userId) === userIdStr || String(lastMsg.sender_id) === userIdStr) {
            if (userInfo.nickname) {
              lastMsg.nickname = userInfo.nickname;
            }
            if (userInfo.avatarUrl) {
              lastMsg.avatarUrl = userInfo.avatarUrl;
            }
          }
        }
      }
    }

    saveToStorage();
  }
  
  // 标记群组有@我的消息
  function setGroupHasAtMe(groupId) {
    const groupIdStr = String(groupId);
    groupsWithAtMe.value[groupIdStr] = true;
    saveGroupsWithAtMeToLocalStorage();
  }
  
  // 清除群组的@我标记
  function clearGroupHasAtMe(groupId) {
    const groupIdStr = String(groupId);
    if (groupsWithAtMe.value[groupIdStr]) {
      delete groupsWithAtMe.value[groupIdStr];
      saveGroupsWithAtMeToLocalStorage();
    }
  }
  
  // 检查群组是否有@我的消息
  function hasGroupAtMe(groupId) {
    const groupIdStr = String(groupId);
    return !!groupsWithAtMe.value[groupIdStr];
  }
  
  // 保存groupsWithAtMe到localStorage
  function saveGroupsWithAtMeToLocalStorage() {
    try {
      localStorage.setItem('groups_with_at_me', JSON.stringify(groupsWithAtMe.value));
    } catch (err) {
      console.error('保存groupsWithAtMe失败:', err);
    }
  }
  
  // 从localStorage加载groupsWithAtMe
  function loadGroupsWithAtMeFromLocalStorage() {
    try {
      const saved = localStorage.getItem('groups_with_at_me');
      if (saved) {
        groupsWithAtMe.value = JSON.parse(saved);
      }
    } catch (err) {
      console.error('加载groupsWithAtMe失败:', err);
    }
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
          groupMessages.value[groupId] = groupMessages.value[groupId].slice(Math.max(0, groupMessages.value[groupId].length - 20), groupMessages.value[groupId].length);
        }
      }
    });
  }
  
  function clearOtherPrivateMessages(currentUserId) {
    const allUserIds = Object.keys(privateMessages.value);
    allUserIds.forEach(userId => {
      if (String(userId) !== String(currentUserId)) {
        if (privateMessages.value[userId] && privateMessages.value[userId].length > 20) {
          privateMessages.value[userId] = privateMessages.value[userId].slice(Math.max(0, privateMessages.value[userId].length - 20), privateMessages.value[userId].length);
        }
      }
    });
  }
  
  function clearPublicMessagesExceptRecent() {
    if (publicMessages.value.length > 20) {
      publicMessages.value = publicMessages.value.slice(Math.max(0, publicMessages.value.length - 20), publicMessages.value.length);
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
        const messagesToSave = fullPublicMessages != null 
          ? fullPublicMessages 
          : publicMessages.value;
        const messages = messagesToSave.map(msg => toRaw(msg));
        await localForage.setItem(`${prefix}-public`, { messages });
        publicStored.value = true;
      }

      // 保存所有完整群组消息，包括不在 store 中的
      for (const [groupId, messages] of Object.entries(fullGroupMessages)) {
        if (!groupStored.value[groupId]) {
          const msgs = messages.map(msg => toRaw(msg));
          await localForage.setItem(`${prefix}-group-${groupId}`, { messages: msgs });
          groupStored.value[groupId] = true;
        }
      }

      // 保存所有完整私信消息，包括不在 store 中的
      for (const [userId, messages] of Object.entries(fullPrivateMessages)) {
        if (!privateStored.value[userId]) {
          const msgs = messages.map(msg => toRaw(msg));
          await localForage.setItem(`${prefix}-private-${userId}`, { messages: msgs });
          privateStored.value[userId] = true;
        }
      }

      const chatKeys = [
        `${prefix}-public`,
        ...Object.keys(fullGroupMessages).map(id => `${prefix}-group-${id}`),
        ...Object.keys(fullPrivateMessages).map(id => `${prefix}-private-${id}`),
      ];
      await localForage.setItem(prefix, { chatKeys });
    } catch (err) {
      console.error('本地消息缓存存储失败', err);
    }
  }

  function loadMessages(loadToStore = true) {
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
            // 保存原始顺序的消息到内存变量
            fullPublicMessages = [...messages];
            if (loadToStore) {
              // 只在 store 中保存最近 20 条非101、非102消息（从长度-21到长度-1）
              const filteredMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
              publicMessages.value = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
            }
          } else if (key.includes('-group-')) {
            const groupId = key.split('-group-')[1];
            // 保存原始顺序的消息到内存变量
            fullGroupMessages[groupId] = [...messages];
            if (loadToStore) {
              // 只在 store 中保存最近 20 条非101、非102消息（从长度-21到长度-1）
              const filteredMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
              groupMessages.value[groupId] = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
            }
          } else if (key.includes('-private-')) {
            const userId = key.split('-private-')[1];
            // 保存原始顺序的消息到内存变量
            fullPrivateMessages[userId] = [...messages];
            if (loadToStore) {
              // 只在 store 中保存最近 20 条非101、非102消息（从长度-21到长度-1）
              const filteredMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
              privateMessages.value[userId] = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
            }
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
  
  function processOfflineMessage(message, onlySaveToDB = false) {
    const processedMessage = {
      ...message,
      id: message.id,
      sender_id: message.userId || message.senderId,
      nickname: message.nickname,
      avatarUrl: message.avatarUrl
    };

    const isUserInfoUpdateMessage = processedMessage.messageType === 102;
    if (isUserInfoUpdateMessage) {
      try {
        const updateData = JSON.parse(processedMessage.content);
        const userId = processedMessage.userId;
        if (updateData.type === 'nickname' && updateData.nickname) {
          if (onlineUsers.value) {
            const userIndex = onlineUsers.value.findIndex(u => String(u.id) === String(userId));
            if (userIndex !== -1) {
              onlineUsers.value[userIndex].nickname = updateData.nickname;
            }
          }
          if (friendsList.value) {
            const friendIndex = friendsList.value.findIndex(f => String(f.id) === String(userId));
            if (friendIndex !== -1) {
              friendsList.value[friendIndex].nickname = updateData.nickname;
              friendsList.value = [...friendsList.value];
            }
          }
          updateUserInfoInMessages(userId, { nickname: updateData.nickname });
        } else if (updateData.type === 'avatar' && updateData.avatarUrl) {
          if (onlineUsers.value) {
            const userIndex = onlineUsers.value.findIndex(u => String(u.id) === String(userId));
            if (userIndex !== -1) {
              onlineUsers.value[userIndex].avatar = updateData.avatarUrl;
              onlineUsers.value[userIndex].avatarUrl = updateData.avatarUrl;
              onlineUsers.value[userIndex].avatar_url = updateData.avatarUrl;
            }
          }
          if (friendsList.value) {
            const friendIndex = friendsList.value.findIndex(f => String(f.id) === String(userId));
            if (friendIndex !== -1) {
              friendsList.value[friendIndex].avatarUrl = updateData.avatarUrl;
              friendsList.value[friendIndex].avatar_url = updateData.avatarUrl;
              friendsList.value[friendIndex].avatar = updateData.avatarUrl;
              friendsList.value = [...friendsList.value];
            }
          }
          updateUserInfoInMessages(userId, { avatarUrl: updateData.avatarUrl });
        }
      } catch (e) {
        console.error('解析102消息失败:', e);
      }
    }

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
      
      // 更新完整消息列表（包括 101 撤回消息），新消息在后
      if (!fullExists) {
        if (fullPublicMessages === null) {
          fullPublicMessages = [processedMessage];
        } else {
          fullPublicMessages.push(processedMessage);
        }
        publicStored.value = false;
      }
      
      if (!onlySaveToDB && !exists && !isWithdrawMessage && !isUserInfoUpdateMessage) {
        if (loading.value) {
          cachePublicMessages.push(processedMessage);
        } else {
          publicMessages.value.push(processedMessage);
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
      
      // 检查是否是@我的离线消息
      if (message.at_userid && currentUser.value && !isWithdrawMessage) {
        const atUserIds = Array.isArray(message.at_userid) ? message.at_userid : [message.at_userid];
        const isCurrentUserAt = atUserIds.some(id => String(id) === String(currentUser.value.id));
        if (isCurrentUserAt) {
          setGroupHasAtMe(groupId);
        }
      }
      
      const targetMessages = loading.value 
        ? (cacheGroupMessages[groupId] || (cacheGroupMessages[groupId] = []))
        : (groupMessages.value[groupId] || (groupMessages.value[groupId] = []));
      const exists = targetMessages.some(m => m.id === processedMessage.id);
      const fullExists = fullGroupMessages[groupId]?.some(m => m.id === processedMessage.id) || false;
      
      // 更新完整消息列表（包括 101 撤回消息），新消息在后
      if (!fullExists) {
        if (fullGroupMessages[groupId] === null || fullGroupMessages[groupId] === undefined) {
          fullGroupMessages[groupId] = [processedMessage];
        } else {
          fullGroupMessages[groupId].push(processedMessage);
        }
        groupStored.value[groupId] = false;
      }
      
      if (!onlySaveToDB && !exists && !isWithdrawMessage && !isUserInfoUpdateMessage) {
        if (loading.value) {
          cacheGroupMessages[groupId].push({
            ...processedMessage,
            group_id: groupId,
            group_name: message.groupName
          });
        } else {
          groupMessages.value[groupId].push({
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
      
      // 更新完整消息列表（包括 101 撤回消息），新消息在后
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
      
      if (!onlySaveToDB && !exists && !isWithdrawMessage && !isUserInfoUpdateMessage) {
        if (loading.value) {
          cachePrivateMessages[otherUserId].push({
            ...processedMessage,
            receiver_id: message.receiverId || message.receiver_id,
            is_read: message.isRead !== undefined ? message.isRead : (message.is_read !== undefined ? message.is_read : 0)
          });
        } else {
          privateMessages.value[otherUserId].push({
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

  async function fetchAndMergeOfflineMessages(onlySaveToDB = false) {
    if (!currentUser.value || !currentSessionToken.value) {
      return;
    }

    // 先从 localStorage 读取已有的未读计数
    loadUnreadCountsFromLocalStorage();

    isFetchingOfflineMessages.value = true;
    if (!onlySaveToDB) {
      showFetchingMessage.value = true;
      loading.value = true;
    }

    const userInfoUpdateMessages = [];
    
    // 记录开始时已存在的消息ID集合，用于后续判断哪些是真正的新消息
    const existingPublicMessageIds = new Set(fullPublicMessages ? fullPublicMessages.map(m => m.id) : []);
    const existingGroupMessageIds = {};
    Object.keys(fullGroupMessages).forEach(groupId => {
      existingGroupMessageIds[groupId] = new Set(fullGroupMessages[groupId].map(m => m.id));
    });
    const existingPrivateMessageIds = {};
    Object.keys(fullPrivateMessages).forEach(userId => {
      existingPrivateMessageIds[userId] = new Set(fullPrivateMessages[userId].map(m => m.id));
    });
    
    // 记录开始时的未读计数
    const startUnreadCounts = loadUnreadCountsFromStorage();

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
            if (message.messageType === 102) {
              userInfoUpdateMessages.push({ ...message, type: 'public' });
            } else {
              processOfflineMessage({ ...message, type: 'public' }, onlySaveToDB);
            }
          });
        }
        if (data.groupMessages && data.groupMessages.length > 0) {
          data.groupMessages.forEach(message => {
            if (message.messageType === 102) {
              userInfoUpdateMessages.push({ ...message, type: 'group' });
            } else {
              processOfflineMessage({ ...message, type: 'group' }, onlySaveToDB);
            }
          });
        }
        if (data.privateMessages && data.privateMessages.length > 0) {
          data.privateMessages.forEach(message => {
            if (message.messageType === 102) {
              userInfoUpdateMessages.push({ ...message, type: 'private' });
            } else {
              processOfflineMessage({ ...message, type: 'private' }, onlySaveToDB);
            }
          });
        }
      }
    } catch (error) {
      console.error('获取离线消息失败:', error);
    } finally {
      if (!onlySaveToDB) {
        loading.value = false;
        isFetchingOfflineMessages.value = false;
        
        if (cachePublicMessages.length > 0) {
          // 使用记录的已存在消息ID集合来判断哪些是真正的新消息
          const newMessages = cachePublicMessages.filter(m => !existingPublicMessageIds.has(m.id));
          
          // 更新未读计数（主聊天室）- 直接操作 localStorage
          if (newMessages.length > 0) {
            const currentUserId = currentUser.value?.id;
            const isMainChatActive = currentActiveChat.value === 'main';
            const isPageVisible = window.isPageVisible !== false && document.hasFocus();
            
            // 如果不在主聊天室页面或页面不可见，增加未读计数
            if (!isMainChatActive || !isPageVisible) {
              // 先从 localStorage 读取
              const savedUnreadCounts = loadUnreadCountsFromStorage();
              savedUnreadCounts.global += newMessages.length;
              // 保存回 localStorage
              saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
            }
          }
          
          // 更新完整消息列表（包括 101 撤回消息）- 新消息放在前面
          if (fullPublicMessages === null) {
            fullPublicMessages = [...newMessages, ...publicMessages.value];
          } else {
            const fullIds = new Set(fullPublicMessages.map(m => m.id));
            const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
            fullPublicMessages = [...fullNewMessages, ...fullPublicMessages];
          }
          
          // 更新显示消息列表（只显示非 101 消息，最多 20 条）- 新消息放在后面
          const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
          const combinedMessages = [...publicMessages.value, ...displayNewMessages];
          publicMessages.value = combinedMessages.slice(Math.max(0, combinedMessages.length - 20), combinedMessages.length);
          cachePublicMessages = [];
        }
        
        Object.keys(cacheGroupMessages).forEach(groupId => {
          if (cacheGroupMessages[groupId]) {
            // 使用记录的已存在消息ID集合来判断哪些是真正的新消息
            const existingIds = existingGroupMessageIds[groupId] || new Set();
            const newMessages = cacheGroupMessages[groupId].filter(m => !existingIds.has(m.id));
            
            // 更新未读计数（群组）- 直接操作 localStorage
            if (newMessages.length > 0) {
              const currentUserId = currentUser.value?.id;
              const isGroupChatActive = currentActiveChat.value === `group_${groupId}`;
              const isPageVisible = window.isPageVisible !== false && document.hasFocus();
              
              // 获取免打扰群组列表
              const mutedGroups = JSON.parse(localStorage.getItem('mutedGroups') || '[]');
              const isMuted = mutedGroups.includes(groupId.toString());
              
              // 如果不在当前群组页面或页面不可见，且不是免打扰群组，增加未读计数
              if (!isMuted && (!isGroupChatActive || !isPageVisible)) {
                // 先从 localStorage 读取
                const savedUnreadCounts = loadUnreadCountsFromStorage();
                if (!savedUnreadCounts.groups[groupId]) {
                  savedUnreadCounts.groups[groupId] = 0;
                }
                savedUnreadCounts.groups[groupId] += newMessages.length;
                // 保存回 localStorage
                saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
              }
            }
            
            // 更新群组最后消息时间并重新排序
            if (newMessages.length > 0 && groupsList.value) {
              const group = groupsList.value.find(g => String(g.id) === String(groupId));
              if (group) {
                const lastMessage = newMessages[0];
                const newTime = new Date(lastMessage.timestamp || Date.now()).toISOString();
                group.last_message_time = newTime;
              }
              sortGroupsByLastMessageTime();
            }
            
            // 更新完整消息列表（包括 101 撤回消息）- 新消息放在前面
            if (!fullGroupMessages[groupId]) {
              fullGroupMessages[groupId] = [...newMessages, ...(groupMessages.value[groupId] || [])];
            } else {
              const fullIds = new Set(fullGroupMessages[groupId].map(m => m.id));
              const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
              fullGroupMessages[groupId] = [...fullNewMessages, ...fullGroupMessages[groupId]];
            }
            
            // 更新显示消息列表（只显示非 101 消息，最多 20 条）- 新消息放在后面
            const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
            const combinedMessages = [...(groupMessages.value[groupId] || []), ...displayNewMessages];
            groupMessages.value[groupId] = combinedMessages.slice(Math.max(0, combinedMessages.length - 20), combinedMessages.length);
          }
        });
        cacheGroupMessages = {};
        
        Object.keys(cachePrivateMessages).forEach(userId => {
          if (cachePrivateMessages[userId]) {
            // 使用记录的已存在消息ID集合来判断哪些是真正的新消息
            const existingIds = existingPrivateMessageIds[userId] || new Set();
            const newMessages = cachePrivateMessages[userId].filter(m => !existingIds.has(m.id));
            
            // 更新未读计数（私信）- 直接操作 localStorage
            if (newMessages.length > 0) {
              const currentUserId = currentUser.value?.id;
              const isPrivateChatActive = currentActiveChat.value === `private_${userId}`;
              const isPageVisible = window.isPageVisible !== false && document.hasFocus();
              
              // 如果不在当前私信页面或页面不可见，增加未读计数
              if (!isPrivateChatActive || !isPageVisible) {
                // 先从 localStorage 读取
                const savedUnreadCounts = loadUnreadCountsFromStorage();
                if (!savedUnreadCounts.private[userId]) {
                  savedUnreadCounts.private[userId] = 0;
                }
                savedUnreadCounts.private[userId] += newMessages.length;
                // 保存回 localStorage
                saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
              }
            }
            
            // 更新私信最后消息时间并重新排序
            if (newMessages.length > 0 && friendsList.value) {
              const friend = friendsList.value.find(f => String(f.id) === String(userId));
              if (friend) {
                const lastMessage = newMessages[0];
                const newTime = new Date(lastMessage.timestamp || Date.now()).toISOString();
                friend.last_message_time = newTime;
              }
              sortFriendsByLastMessageTime();
            }
            
            // 更新完整消息列表（包括 101 撤回消息）- 新消息放在前面
            if (!fullPrivateMessages[userId]) {
              fullPrivateMessages[userId] = [...newMessages, ...(privateMessages.value[userId] || [])];
            } else {
              const fullIds = new Set(fullPrivateMessages[userId].map(m => m.id));
              const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
              fullPrivateMessages[userId] = [...fullNewMessages, ...fullPrivateMessages[userId]];
            }
            
            // 更新显示消息列表（只显示非 101 消息，最多 20 条）- 新消息放在后面
            const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
            const combinedMessages = [...(privateMessages.value[userId] || []), ...displayNewMessages];
            privateMessages.value[userId] = combinedMessages.slice(Math.max(0, combinedMessages.length - 20), combinedMessages.length);
          }
        });
        cachePrivateMessages = {};

        publicStored.value = false;
        Object.keys(groupMessages.value).forEach(id => groupStored.value[id] = false);
        Object.keys(privateMessages.value).forEach(id => privateStored.value[id] = false);
        await saveToStorage();

        if (userInfoUpdateMessages.length > 0) {
          userInfoUpdateMessages.forEach(message => {
            processOfflineMessage(message, onlySaveToDB);
          });
        }
        
        setTimeout(() => {
          showFetchingMessage.value = false;
        }, 500);
        
        await saveMinIds();
      } else {
        // onlySaveToDB 模式下，直接保存到 indexedDB，同时也计算未读计数
        if (cachePublicMessages.length > 0) {
          // 使用记录的已存在消息ID集合来判断哪些是真正的新消息
          const newMessages = cachePublicMessages.filter(m => !existingPublicMessageIds.has(m.id) && m.messageType !== 101 && m.messageType !== 102);
          
          // 更新未读计数（主聊天室）
          if (newMessages.length > 0) {
            const isMainChatActive = currentActiveChat.value === 'main';
            const isPageVisible = window.isPageVisible !== false && document.hasFocus();
            
            if (!isMainChatActive || !isPageVisible) {
              // 先从 localStorage 读取
              const savedUnreadCounts = loadUnreadCountsFromStorage();
              savedUnreadCounts.global += newMessages.length;
              // 保存回 localStorage
              saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
            }
          }
          
          if (fullPublicMessages === null) {
            fullPublicMessages = [...cachePublicMessages];
          } else {
            const fullIds = new Set(fullPublicMessages.map(m => m.id));
            const fullNewMessages = cachePublicMessages.filter(m => !fullIds.has(m.id));
            fullPublicMessages = [...fullPublicMessages, ...fullNewMessages];
          }
          cachePublicMessages = [];
        }
        
        Object.keys(cacheGroupMessages).forEach(groupId => {
          if (cacheGroupMessages[groupId]) {
            // 使用记录的已存在消息ID集合来判断哪些是真正的新消息
            const existingIds = existingGroupMessageIds[groupId] || new Set();
            const newMessages = cacheGroupMessages[groupId].filter(m => !existingIds.has(m.id) && m.messageType !== 101 && m.messageType !== 102);
            
            // 更新未读计数（群组）
            if (newMessages.length > 0) {
              const isGroupChatActive = currentActiveChat.value === `group_${groupId}`;
              const isPageVisible = window.isPageVisible !== false && document.hasFocus();
              
              // 获取免打扰群组列表
              const mutedGroups = JSON.parse(localStorage.getItem('mutedGroups') || '[]');
              const isMuted = mutedGroups.includes(groupId.toString());
              
              if (!isMuted && (!isGroupChatActive || !isPageVisible)) {
                // 先从 localStorage 读取
                const savedUnreadCounts = loadUnreadCountsFromStorage();
                if (!savedUnreadCounts.groups[groupId]) {
                  savedUnreadCounts.groups[groupId] = 0;
                }
                savedUnreadCounts.groups[groupId] += newMessages.length;
                // 保存回 localStorage
                saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
              }
            }
            
            if (!fullGroupMessages[groupId]) {
              fullGroupMessages[groupId] = [...cacheGroupMessages[groupId]];
            } else {
              const fullIds = new Set(fullGroupMessages[groupId].map(m => m.id));
              const fullNewMessages = cacheGroupMessages[groupId].filter(m => !fullIds.has(m.id));
              fullGroupMessages[groupId] = [...fullGroupMessages[groupId], ...fullNewMessages];
            }
          }
        });
        cacheGroupMessages = {};
        
        Object.keys(cachePrivateMessages).forEach(userId => {
          if (cachePrivateMessages[userId]) {
            // 使用记录的已存在消息ID集合来判断哪些是真正的新消息
            const existingIds = existingPrivateMessageIds[userId] || new Set();
            const newMessages = cachePrivateMessages[userId].filter(m => !existingIds.has(m.id) && m.messageType !== 101 && m.messageType !== 102);
            
            // 更新未读计数（私信）
            if (newMessages.length > 0) {
              const isPrivateChatActive = currentActiveChat.value === `private_${userId}`;
              const isPageVisible = window.isPageVisible !== false && document.hasFocus();
              
              if (!isPrivateChatActive || !isPageVisible) {
                // 先从 localStorage 读取
                const savedUnreadCounts = loadUnreadCountsFromStorage();
                if (!savedUnreadCounts.private[userId]) {
                  savedUnreadCounts.private[userId] = 0;
                }
                savedUnreadCounts.private[userId] += newMessages.length;
                // 保存回 localStorage
                saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
              }
            }
            
            if (!fullPrivateMessages[userId]) {
              fullPrivateMessages[userId] = [...cachePrivateMessages[userId]];
            } else {
              const fullIds = new Set(fullPrivateMessages[userId].map(m => m.id));
              const fullNewMessages = cachePrivateMessages[userId].filter(m => !fullIds.has(m.id));
              fullPrivateMessages[userId] = [...fullPrivateMessages[userId], ...fullNewMessages];
            }
          }
        });
        cachePrivateMessages = {};

        publicStored.value = false;
        Object.keys(fullGroupMessages).forEach(id => groupStored.value[id] = false);
        Object.keys(fullPrivateMessages).forEach(id => privateStored.value[id] = false);
        await saveToStorage();

        if (userInfoUpdateMessages.length > 0) {
          userInfoUpdateMessages.forEach(message => {
            processOfflineMessage(message, onlySaveToDB);
          });
        }
        
        await saveMinIds();
        
        isFetchingOfflineMessages.value = false;
      }
      
      // 无论 onlySaveToDB 是 true 还是 false，都从 localStorage 同步未读计数到 store
      loadUnreadCountsFromLocalStorage();
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
    const validMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
    if (validMessages.length === 0) return null;
    return validMessages[validMessages.length - 1];
  }

  function getPrivateLastMessage(userId) {
    const messages = fullPrivateMessages[userId] || privateMessages.value[userId] || [];
    const validMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
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
    const validMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);

    if (validMessages.length > 0) {
      const lastMessage = validMessages[validMessages.length - 1];
      group.lastMessage = lastMessage;
      const newTime = new Date(lastMessage.timestamp || Date.now()).toISOString();
      group.last_message_time = newTime;
    } else {
      group.lastMessage = null;
      group.last_message_time = null;
    }

    sortGroupsByLastMessageTime();
  }

  function updateFriendLastMessageAfterDelete(userId) {
    if (!friendsList.value) return;
    const friend = friendsList.value.find(f => String(f.id) === String(userId));
    if (!friend) return;

    const messages = fullPrivateMessages[userId] || [];
    const validMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);

    if (validMessages.length > 0) {
      const lastMessage = validMessages[validMessages.length - 1];
      friend.lastMessage = lastMessage;
      const newTime = new Date(lastMessage.timestamp || Date.now()).toISOString();
      friend.last_message_time = newTime;
    } else {
      friend.lastMessage = null;
      friend.last_message_time = null;
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

  // 直接从 localStorage 读取未读计数（不更新 store）
  function loadUnreadCountsFromStorage() {
    try {
      const data = localStorage.getItem(`unread_counts_${currentUser.value?.id}`);
      if (data) {
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('读取未读计数失败:', err);
    }
    return { global: 0, groups: {}, private: {} };
  }

  // 直接保存到 localStorage（不使用 store 的值）并更新 store 状态
  function saveUnreadCountsToLocalStorageDirect(counts) {
    try {
      localStorage.setItem(`unread_counts_${currentUser.value?.id}`, JSON.stringify(counts));
      // 同时更新 store 状态，确保状态一致
      unreadMessages.value.global = counts.global || 0;
      unreadMessages.value.groups = counts.groups || {};
      unreadMessages.value.private = counts.private || {};
    } catch (err) {
      console.error('保存未读计数失败:', err);
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
      // 先加载已有的未读计数
      loadUnreadCountsFromLocalStorage();
      // 先加载 minIds
      await loadMinIds();
      // 先从 indexedDB 加载已有消息到 fullMessages（不加入 store）
      await loadMessages(false);
      // 拉取离线消息并加入 store（同时计算未读计数，且内部会调用 saveToStorage()）
      await fetchAndMergeOfflineMessages(false);
      // 加载所有消息到 store（包括已有的未读计数）
      await loadMessages(true);
      showFetchingMessage.value = false;
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
    loadUnreadCountsFromLocalStorage,
    loadUnreadCountsFromStorage,
    saveUnreadCountsToLocalStorage,
    saveUnreadCountsToLocalStorageDirect,
    incrementGroupUnread,
    incrementGlobalUnread,
    incrementPrivateUnread,
    saveGroupLastMessageTimes,
    saveFriendLastMessageTimes,
    sortFriendsByLastMessageTime,
    sortGroupsByLastMessageTime,
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
    getGroupLastMessage,
    getPrivateLastMessage,
    formatMessageContent,
    updateGroupLastMessage,
    updateFriendLastMessage,
    groupsWithAtMe,
    setGroupHasAtMe,
    clearGroupHasAtMe,
    hasGroupAtMe,
    loadGroupsWithAtMeFromLocalStorage,
    saveGroupsWithAtMeToLocalStorage,
    updateGroupLastMessageAfterDelete,
    updateFriendLastMessageAfterDelete,
    findUserById,
    getUserName,
    getUserAvatar,
    updateUserInfoInMessages,
    drafts,
    saveDraft,
    getDraft,
    clearDraft,
    tempRestoreLastMessage,
    setLastMessageToDraft
  };

  // 保存草稿
  function saveDraft(chatType, id, content) {
    if (chatType === 'main') {
      drafts.value.main = content;
    } else if (chatType === 'group' && id) {
      drafts.value.groups[id] = content;
      // 更新群组最后消息为草稿
      if (groupsList.value) {
        const group = groupsList.value.find(g => String(g.id) === String(id));
        if (group) {
          if (content) {
            group.lastMessage = {
              content: `[草稿] ${content}`,
              nickname: '我',
              messageType: 0
            };
          } else {
            // 如果内容为空，恢复原来的最后消息
            const lastMsg = getGroupLastMessage(id);
            group.lastMessage = lastMsg;
          }
        }
      }
    } else if (chatType === 'private' && id) {
      drafts.value.private[id] = content;
      // 更新私信最后消息为草稿
      if (friendsList.value) {
        const friend = friendsList.value.find(f => String(f.id) === String(id));
        if (friend) {
          if (content) {
            friend.lastMessage = {
              content: `[草稿] ${content}`,
              nickname: '我',
              messageType: 0
            };
          } else {
            // 如果内容为空，恢复原来的最后消息
            const lastMsg = getPrivateLastMessage(id);
            friend.lastMessage = lastMsg;
          }
        }
      }
    }
  }

  // 获取草稿
  function getDraft(chatType, id) {
    if (chatType === 'main') {
      return drafts.value.main || '';
    } else if (chatType === 'group' && id) {
      return drafts.value.groups[id] || '';
    } else if (chatType === 'private' && id) {
      return drafts.value.private[id] || '';
    }
    return '';
  }

  // 清除草稿
  function clearDraft(chatType, id) {
    if (chatType === 'main') {
      drafts.value.main = '';
    } else if (chatType === 'group' && id) {
      delete drafts.value.groups[id];
      // 恢复原来的最后消息
      if (groupsList.value) {
        const group = groupsList.value.find(g => String(g.id) === String(id));
        if (group) {
          const lastMsg = getGroupLastMessage(id);
          group.lastMessage = lastMsg;
        }
      }
    } else if (chatType === 'private' && id) {
      delete drafts.value.private[id];
      // 恢复原来的最后消息
      if (friendsList.value) {
        const friend = friendsList.value.find(f => String(f.id) === String(id));
        if (friend) {
          const lastMsg = getPrivateLastMessage(id);
          friend.lastMessage = lastMsg;
        }
      }
    }
  }

  // 临时恢复 lastMessage（当切换到有草稿的会话时调用，移除[草稿]标记）
  function tempRestoreLastMessage(chatType, id) {
    if (chatType === 'group' && id) {
      if (groupsList.value) {
        const group = groupsList.value.find(g => String(g.id) === String(id));
        if (group) {
          const lastMsg = getGroupLastMessage(id);
          group.lastMessage = lastMsg;
        }
      }
    } else if (chatType === 'private' && id) {
      if (friendsList.value) {
        const friend = friendsList.value.find(f => String(f.id) === String(id));
        if (friend) {
          const lastMsg = getPrivateLastMessage(id);
          friend.lastMessage = lastMsg;
        }
      }
    }
  }

  // 重新设置 lastMessage 为草稿（当离开有草稿的会话时调用）
  function setLastMessageToDraft(chatType, id) {
    if (chatType === 'group' && id) {
      const draftContent = drafts.value.groups[id];
      if (draftContent && groupsList.value) {
        const group = groupsList.value.find(g => String(g.id) === String(id));
        if (group) {
          group.lastMessage = {
            content: `[草稿] ${draftContent}`,
            nickname: '我',
            messageType: 0
          };
        }
      }
    } else if (chatType === 'private' && id) {
      const draftContent = drafts.value.private[id];
      if (draftContent && friendsList.value) {
        const friend = friendsList.value.find(f => String(f.id) === String(id));
        if (friend) {
          friend.lastMessage = {
            content: `[草稿] ${draftContent}`,
            nickname: '我',
            messageType: 0
          };
        }
      }
    }
  }
});
