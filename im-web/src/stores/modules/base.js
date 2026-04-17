import { ref } from 'vue';

export function createBaseModule() {
  const currentUser = ref(null);
  const currentSessionToken = ref(localStorage.getItem('currentSessionToken') || null);
  const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://back.hs.airoe.cn';
  const loading = ref(false);
  const isConnected = ref(false);
  const isFetchingOfflineMessages = ref(false);
  const showFetchingMessage = ref(false);
  const hasReceivedHistory = ref(false);
  const hasReceivedGroupHistory = ref(false);
  const hasReceivedPrivateHistory = ref(false);

  function getStorageKeyPrefix() {
    const userId = currentUser.value?.id || 'guest';
    return `chats-${userId}`;
  }

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

  function setLoading(loadingState) {
    loading.value = loadingState;
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
    getStorageKeyPrefix,
    setCurrentUser,
    setCurrentSessionToken,
    setLoading
  };
}
