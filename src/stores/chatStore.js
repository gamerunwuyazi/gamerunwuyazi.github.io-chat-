import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useChatStore = defineStore('chat', () => {
  // 响应式状态
  const onlineUsers = ref([]);
  const offlineUsers = ref([]);
  const groupsList = ref([]);
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
  
  // 模态框数据
  const modalData = ref({
    groupInfo: null,
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
  }
  
  function setCurrentPrivateChatUserId(id) {
    currentPrivateChatUserId.value = id;
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
    return [...messages].sort((a, b) => {
      if (a.sequence !== undefined && b.sequence !== undefined) {
        return a.sequence - b.sequence;
      }
      return (a.timestamp || a.created_at) - (b.timestamp || b.created_at);
    });
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
    const newMessages = messages.filter(m => !existingIds.has(m.id));
    publicMessages.value = sortMessages([...newMessages, ...publicMessages.value]);
  }

  function prependGroupMessages(groupId, messages) {
    if (!groupMessages.value[groupId]) {
      groupMessages.value[groupId] = [];
    }
    const existingIds = new Set(groupMessages.value[groupId].map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id));
    groupMessages.value[groupId] = sortMessages([...newMessages, ...groupMessages.value[groupId]]);
  }

  function prependPrivateMessages(userId, messages) {
    if (!privateMessages.value[userId]) {
      privateMessages.value[userId] = [];
    }
    const existingIds = new Set(privateMessages.value[userId].map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id));
    privateMessages.value[userId] = sortMessages([...newMessages, ...privateMessages.value[userId]]);
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
    modalData,
    SERVER_URL,
    setCurrentUser,
    setCurrentSessionToken,
    setCurrentGroupId,
    setCurrentPrivateChatUserId,
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
    saveGroupLastMessageTimes,
    saveFriendLastMessageTimes,
    sortFriendsByLastMessageTime,
    sortGroupsByLastMessageTime,
    sortMessages
  };
});
