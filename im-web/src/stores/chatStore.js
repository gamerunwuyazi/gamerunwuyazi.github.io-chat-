import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useChatStore = defineStore('chat', () => {
  // 响应式状态
  const onlineUsers = ref([]);
  const offlineUsers = ref([]);
  const groupsList = ref(null);  // null 表示加载中，空数组表示暂无群组
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
  
  // 会话状态
  const currentGroupId = ref(null);
  const currentGroupName = ref('');
  const currentPrivateChatUserId = ref(null);
  const currentPrivateChatUsername = ref('');
  const currentPrivateChatNickname = ref('');
  const currentPrivateChatAvatarUrl = ref('');
  const currentActiveChat = ref('main');
  const currentSendChatType = ref('main');
  const selectedGroupIdForCard = ref(null);
  
  // UI 状态
  const isPageVisible = ref(true);
  const isConnected = ref(false);
  
  // 历史记录标记
  const hasReceivedHistory = ref(false);
  const hasReceivedGroupHistory = ref(false);
  const hasReceivedPrivateHistory = ref(false);
  
  // 输入框内容
  const mainMessageInput = ref('');
  const groupMessageInput = ref('');
  const privateMessageInput = ref('');
  
  // 上传进度
  const uploadProgress = ref(0);
  const showUploadProgress = ref(false);
  
  // 模态框状态
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
  
  // 模态框数据
  const modalData = ref({
    groupInfo: null,
    groupCardPopup: null,
    shareGroupCardTargets: [],
    userProfile: null,
    imagePreviewUrl: '',
    avatarPreviewUrl: '',
    userAvatarPopup: null
  });
  
  // 引用消息
  const quotedMessage = ref(null);
  
  const SERVER_URL = process.env.VUE_APP_SERVER_URL || 'https://back.hs.airoe.cn';
  
  // Actions
  function setCurrentUser(user) {
    currentUser.value = user;
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
    // 切换群组时清除引用消息
    clearQuotedMessage();
    // 切换群组时，清除其他群组的消息，只保留最近 20 条
    clearOtherGroupMessages(id);
    clearPublicMessagesExceptRecent();
    clearOtherPrivateMessages(null);
  }
  
  function setCurrentPrivateChatUserId(id) {
    currentPrivateChatUserId.value = id;
    // 切换私信对象时清除引用消息
    clearQuotedMessage();
    // 切换私信时，清除其他私信的消息，只保留最近 20 条
    clearOtherPrivateMessages(id);
    clearPublicMessagesExceptRecent();
    clearOtherGroupMessages(null);
  }
  
  function setCurrentActiveChat(type) {
    currentActiveChat.value = type;
    // 切换聊天类型时清除引用消息
    clearQuotedMessage();
    // 切换聊天类型时，清除其他会话的消息，只保留最近 20 条
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
    // 清除模态框可能存在的内联样式
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
        // 关闭所有模态框
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

  // 消息管理
  function addPublicMessage(message) {
    const exists = publicMessages.value.some(m => m.id === message.id);
    if (!exists) {
      publicMessages.value.push(message);
    }
  }

  function addGroupMessage(groupId, message) {
    if (!groupMessages.value[groupId]) {
      groupMessages.value[groupId] = [];
    }
    const exists = groupMessages.value[groupId].some(m => m.id === message.id);
    if (!exists) {
      groupMessages.value[groupId].push(message);
    }
  }

  function addPrivateMessage(userId, message) {
    if (!privateMessages.value[userId]) {
      privateMessages.value[userId] = [];
    }
    const exists = privateMessages.value[userId].some(m => m.id === message.id);
    if (!exists) {
      privateMessages.value[userId].push(message);
    }
  }

  function sortMessages(messages) {
    // 后端返回的是按 timestamp DESC 排序（最新在前），需要反转让最新消息在最后
    return [...messages].reverse();
  }

  function setPublicMessages(messages) {
    publicMessages.value = sortMessages(messages);
  }

  function setGroupMessages(groupId, messages) {
    groupMessages.value[groupId] = sortMessages(messages);
  }

  function setPrivateMessages(userId, messages) {
    privateMessages.value[userId] = sortMessages(messages);
  }

  function prependPublicMessages(messages) {
    const existingIds = new Set(publicMessages.value.map(m => m.id));
    // 后端返回的消息是按 timestamp DESC 排序（最新在前），需要反转让最新消息在最后
    const newMessages = messages.filter(m => !existingIds.has(m.id)).reverse();
    publicMessages.value = [...newMessages, ...publicMessages.value];
  }

  function prependGroupMessages(groupId, messages) {
    if (!groupMessages.value[groupId]) {
      groupMessages.value[groupId] = [];
    }
    const existingIds = new Set(groupMessages.value[groupId].map(m => m.id));
    // 后端返回的消息是按 timestamp DESC 排序（最新在前），需要反转让最新消息在最后
    const newMessages = messages.filter(m => !existingIds.has(m.id)).reverse();
    groupMessages.value[groupId] = [...newMessages, ...groupMessages.value[groupId]];
  }

  function prependPrivateMessages(userId, messages) {
    if (!privateMessages.value[userId]) {
      privateMessages.value[userId] = [];
    }
    const existingIds = new Set(privateMessages.value[userId].map(m => m.id));
    // 后端返回的消息是按 timestamp DESC 排序（最新在前），需要反转让最新消息在最后
    const newMessages = messages.filter(m => !existingIds.has(m.id)).reverse();
    privateMessages.value[userId] = [...newMessages, ...privateMessages.value[userId]];
  }

  function clearPublicMessages() {
    publicMessages.value = [];
  }

  function clearGroupMessages(groupId) {
    if (groupMessages.value[groupId]) {
      groupMessages.value[groupId] = [];
    }
  }

  function clearPrivateMessages(userId) {
    if (privateMessages.value[userId]) {
      privateMessages.value[userId] = [];
    }
  }

  function deletePublicMessage(messageId) {
    const index = publicMessages.value.findIndex(m => String(m.id) === String(messageId));
    if (index !== -1) {
      publicMessages.value.splice(index, 1);
    }
  }

  function deleteGroupMessage(groupId, messageId) {
    if (groupMessages.value[groupId]) {
      const index = groupMessages.value[groupId].findIndex(m => String(m.id) === String(messageId));
      if (index !== -1) {
        groupMessages.value[groupId].splice(index, 1);
      }
    }
  }

  function deletePrivateMessage(userId, messageId) {
    if (privateMessages.value[userId]) {
      const index = privateMessages.value[userId].findIndex(m => String(m.id) === String(messageId));
      if (index !== -1) {
        privateMessages.value[userId].splice(index, 1);
      }
    }
  }

  function updateUserInfoInMessages(userId, updates) {
    const userIdStr = String(userId);
    
    const updateMessage = (message) => {
      if (String(message.sender_id) === userIdStr || String(message.userId) === userIdStr || String(message.user_id) === userIdStr) {
        if (updates.nickname !== undefined) {
          message.nickname = updates.nickname;
          message.sender_nickname = updates.nickname;
          message.user_nickname = updates.nickname;
        }
        if (updates.avatarUrl !== undefined) {
          message.avatarUrl = updates.avatarUrl;
          message.avatar_url = updates.avatarUrl;
          message.sender_avatar = updates.avatarUrl;
          message.user_avatar = updates.avatarUrl;
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
  }

  function updateGroupInfoInMessages(groupId, updates) {
    const groupIdStr = String(groupId);
    
    const updateMessage = (message) => {
      if (message.group_card && String(message.group_card.group_id) === groupIdStr) {
        if (updates.avatarUrl !== undefined) {
          message.group_card.avatar_url = updates.avatarUrl;
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
          message.quoted_message.group_card.avatar_url = updates.avatarUrl;
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
  }

  function moveGroupToTop(groupId) {
    const index = groupsList.value.findIndex(g => String(g.id) === String(groupId));
    if (index > 0) {
      const group = groupsList.value.splice(index, 1)[0];
      // 更新最后消息时间为当前时间，确保重新排序后仍在顶部
      const newTime = new Date().toISOString();
      group.last_message_time = newTime;
      groupsList.value.unshift(group);
      // 重新排序
      sortGroupsByLastMessageTime();
      // 保存到 localStorage
      saveGroupLastMessageTime(groupId, newTime);
    }
  }

  function moveFriendToTop(userId) {
    const index = friendsList.value.findIndex(f => String(f.id) === String(userId));
    if (index > 0) {
      const friend = friendsList.value.splice(index, 1)[0];
      // 更新最后消息时间为当前时间，确保重新排序后仍在顶部
      const newTime = new Date().toISOString();
      friend.last_message_time = newTime;
      friendsList.value.unshift(friend);
      // 重新排序
      sortFriendsByLastMessageTime();
      // 保存到 localStorage
      saveFriendLastMessageTime(userId, newTime);
    }
  }

  // 保存群组最后消息时间到 localStorage
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

  // 保存好友最后消息时间到 localStorage
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

  // 从 localStorage 获取群组最后消息时间
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

  // 从 localStorage 获取好友最后消息时间
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

  // 删除群组的最后消息时间记录
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

  // 删除好友的最后消息时间记录
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

  // 清除群组未读消息
  function clearGroupUnread(groupId) {
    if (unreadMessages.value.groups && unreadMessages.value.groups[groupId]) {
      delete unreadMessages.value.groups[groupId];
    }
  }

  // 清除私信未读消息
  function clearPrivateUnread(userId) {
    if (unreadMessages.value.private && unreadMessages.value.private[userId]) {
      delete unreadMessages.value.private[userId];
    }
  }

  // 批量保存群组最后消息时间
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

  // 批量保存好友最后消息时间
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

  // 按最后消息时间排序好友列表
  function sortFriendsByLastMessageTime() {
    friendsList.value.sort((a, b) => {
      const aTime = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
      const bTime = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
      return bTime - aTime;
    });
  }

  // 按最后消息时间排序群组列表
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
  
  // 清除其他群组的消息，只保留当前群组的消息
  function clearOtherGroupMessages(currentGroupId) {
    const allGroupIds = Object.keys(groupMessages.value);
    allGroupIds.forEach(groupId => {
      if (String(groupId) !== String(currentGroupId)) {
        // 清除其他群组的消息，只保留最近 20 条
        if (groupMessages.value[groupId] && groupMessages.value[groupId].length > 20) {
          groupMessages.value[groupId] = groupMessages.value[groupId].slice(-20);
        }
      }
    });
  }
  
  // 清除其他私信的消息，只保留当前私信的消息
  function clearOtherPrivateMessages(currentUserId) {
    const allUserIds = Object.keys(privateMessages.value);
    allUserIds.forEach(userId => {
      if (String(userId) !== String(currentUserId)) {
        // 清除其他私信的消息，只保留最近 20 条
        if (privateMessages.value[userId] && privateMessages.value[userId].length > 20) {
          privateMessages.value[userId] = privateMessages.value[userId].slice(-20);
        }
      }
    });
  }
  
  // 清除公共聊天消息，只保留最近 20 条
  function clearPublicMessagesExceptRecent() {
    if (publicMessages.value.length > 20) {
      publicMessages.value = publicMessages.value.slice(-20);
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
    saveGroupLastMessageTimes,
    saveFriendLastMessageTimes,
    sortFriendsByLastMessageTime,
    sortGroupsByLastMessageTime,
    sortMessages
  };
});
