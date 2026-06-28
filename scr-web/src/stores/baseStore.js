import { defineStore } from 'pinia';
import { ref } from 'vue';
import { setFriendVerification as apiSetFriendVerification, getFriendRequestsReceived, getFriendRequestsSent } from '@/api/user.js';

export const useBaseStore = defineStore('base', () => {
  const currentUser = ref(null);
  const currentSessionToken = ref(localStorage.getItem('currentSessionToken') || null);
  const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
  const loading = ref(false);
  const isConnected = ref(false);
  const isFetchingOfflineMessages = ref(false);
  const showFetchingMessage = ref(false);
  const hasReceivedHistory = ref(false);
  const hasReceivedGroupHistory = ref(false);
  const hasReceivedPrivateHistory = ref(false);
  const friendVerification = ref(false);
  const messageStyle = ref(localStorage.getItem('messageStyle') || 'new');
  const receivedFriendRequests = ref([]);
  const sentFriendRequests = ref([]);

  function getStorageKeyPrefix() {
    const userId = currentUser.value?.id || 'guest';
    return `chats-${userId}`;
  }

  function setCurrentUser(user) {
    currentUser.value = user;
    if (user && user.friend_verification !== undefined) {
      friendVerification.value = user.friend_verification === 1;
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

  function setLoading(loadingState) {
    loading.value = loadingState;
  }

  async function setFriendVerification(requireVerification) {
    try {
      const response = await apiSetFriendVerification(requireVerification);
      const data = response.data;
      if (data.status === 'success') {
        friendVerification.value = requireVerification;
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.message };
      }
    } catch (error) {
      console.error('设置好友验证失败:', error);
      return { success: false, message: '设置好友验证失败' };
    }
  }

  function setMessageStyle(style) {
    messageStyle.value = style;
    localStorage.setItem('messageStyle', style);
  }

  async function loadFriendRequests() {
    try {
      const userId = currentUser.value?.id;
      const sessionToken = currentSessionToken.value;

      if (!userId || !sessionToken) return;

      const [receivedRes, sentRes] = await Promise.all([
        getFriendRequestsReceived(),
        getFriendRequestsSent()
      ]);

      const receivedData = receivedRes.data;
      const sentData = sentRes.data;

      if (receivedData.status === 'success') {
        receivedFriendRequests.value = receivedData.requests || [];
      }

      if (sentData.status === 'success') {
        sentFriendRequests.value = sentData.requests || [];
      }
    } catch (error) {
      console.error('加载好友请求失败:', error);
    }
  }

  function updateReceivedFriendRequests(requests) {
    receivedFriendRequests.value = requests;
  }

  function updateSentFriendRequests(requests) {
    sentFriendRequests.value = requests;
  }

  return {
    currentUser,
    currentSessionToken,
    SERVER_URL,
    loading,
    isConnected,
    isFetchingOfflineMessages,
    showFetchingMessage,
    hasReceivedHistory,
    hasReceivedGroupHistory,
    hasReceivedPrivateHistory,
    friendVerification,
    messageStyle,
    receivedFriendRequests,
    sentFriendRequests,
    getStorageKeyPrefix,
    setCurrentUser,
    setCurrentSessionToken,
    setLoading,
    setFriendVerification,
    setMessageStyle,
    loadFriendRequests,
    updateReceivedFriendRequests,
    updateSentFriendRequests
  };
});