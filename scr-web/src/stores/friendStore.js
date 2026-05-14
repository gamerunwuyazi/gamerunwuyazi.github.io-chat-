import { defineStore } from 'pinia';
import { ref, toRaw } from 'vue';
import localForage from 'localforage';
import { useStorageStore } from './storageStore';
import { useBaseStore } from './baseStore';
import { useSessionStore } from './sessionStore';

export const useFriendStore = defineStore('friend', () => {
  const friendsList = ref([]);
  const privateMessages = ref({});
  const privateAllLoaded = ref({});
  const privateStored = ref({});
  const privatePageSize = ref({});
  const privatePageOffset = ref({});
  const privateLoadingMore = ref({});

  function addPrivateMessage(userId, message) {
    const storageStore = useStorageStore();
    const baseStore = useBaseStore();

    const isWithdrawMessage = message.messageType === 101;
    const isUserInfoUpdateMessage = message.messageType === 102;
    const isReadReceiptMessage = message.messageType === 103;
    const messages = baseStore.loading
      ? (storageStore.getCachePrivate()[userId] || (storageStore.getCachePrivate()[userId] = []))
      : (privateMessages.value[userId] || (privateMessages.value[userId] = []));
    const exists = messages.some(m => m.id === message.id);
    if (!exists && !isWithdrawMessage && !isUserInfoUpdateMessage && !isReadReceiptMessage) {
      messages.push(message);
    }
    if (storageStore.fullPrivateMessages && !storageStore.fullPrivateMessages[userId]) {
      storageStore.fullPrivateMessages[userId] = [message];
    } else if (storageStore.fullPrivateMessages) {
      const fullExists = storageStore.fullPrivateMessages[userId].some(m => m.id === message.id);
      if (!fullExists) {
        storageStore.fullPrivateMessages[userId].push(message);
      }
    }

    if (message.id && message.id > storageStore.privateMinId && !isWithdrawMessage) {
      storageStore.privateMinId = message.id;
      storageStore.saveMinIds();
    }
    if (!baseStore.loading) {
      privateStored.value[userId] = false;
      storageStore.saveToStorage();
    }
  }

  function setPrivateMessages(userId, messages) {
    const storageStore = useStorageStore();
    const baseStore = useBaseStore();

    if (baseStore.loading) {
      storageStore.getCachePrivate()[userId] = messages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);
    } else {
      if (!storageStore.fullPrivateMessages[userId]) {
        storageStore.fullPrivateMessages[userId] = [...messages];
      } else {
        const fullExistingIds = new Set(storageStore.fullPrivateMessages[userId].map(m => m.id));
        const fullNewMessages = messages.filter(m => !fullExistingIds.has(m.id));
        storageStore.fullPrivateMessages[userId] = [...storageStore.fullPrivateMessages[userId], ...fullNewMessages];
      }
      const filteredMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);
      privateMessages.value[userId] = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
      privateStored.value[userId] = false;
      storageStore.saveToStorage();
    }
  }

  function prependPrivateMessages(userId, messages) {
    const storageStore = useStorageStore();
    const baseStore = useBaseStore();

    const targetMessages = baseStore.loading
      ? (storageStore.getCachePrivate()[userId] || (storageStore.getCachePrivate()[userId] = []))
      : (privateMessages.value[userId] || (privateMessages.value[userId] = []));
    const existingIds = new Set(targetMessages.map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id));
    const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);

    if (baseStore.loading) {
      displayNewMessages.sort((a, b) => a.id - b.id);
      storageStore.getCachePrivate()[userId] = [...displayNewMessages, ...(storageStore.getCachePrivate()[userId] || [])];
    } else {
      if (storageStore.fullPrivateMessages && storageStore.fullPrivateMessages[userId]) {
        const fullIds = new Set(storageStore.fullPrivateMessages[userId].map(m => m.id));
        const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
        fullNewMessages.sort((a, b) => a.id - b.id);
        storageStore.fullPrivateMessages[userId] = [...fullNewMessages, ...storageStore.fullPrivateMessages[userId]];
      }
      displayNewMessages.sort((a, b) => a.id - b.id);
      privateMessages.value[userId] = [...displayNewMessages, ...privateMessages.value[userId]];
      privateStored.value[userId] = false;
      storageStore.saveToStorage();
    }
  }

  function clearPrivateMessages(userId) {
    const storageStore = useStorageStore();
    if (privateMessages.value[userId]) {
      privateMessages.value[userId] = [];
      privateStored.value[userId] = false;
      storageStore.saveToStorage();
    }
  }

  function deletePrivateMessage(userId, messageId) {
    const storageStore = useStorageStore();

    if (privateMessages.value[userId]) {
      const index = privateMessages.value[userId].findIndex(m => String(m.id) === String(messageId));
      if (index !== -1) privateMessages.value[userId].splice(index, 1);
    }
    if (storageStore.fullPrivateMessages[userId]) {
      const fullIndex = storageStore.fullPrivateMessages[userId].findIndex(m => String(m.id) === String(messageId));
      if (fullIndex !== -1) storageStore.fullPrivateMessages[userId].splice(fullIndex, 1);
    }
    privateStored.value[userId] = false;
    storageStore.saveToStorage();
    updateFriendLastMessageAfterDelete(userId);
  }

  function moveFriendToTop(userId) {
    const friend = friendsList.value.find(f => String(f.id) === String(userId));
    if (friend && friend.deleted_at == null) {
      friend.session_last_active_time = new Date().toISOString();
      sortFriendsByLastMessageTime();
    }
  }

  function updateFriendSessionTime(userId) {
    const storageStore = useStorageStore();
    const friend = friendsList.value.find(f => String(f.id) === String(userId));
    if (friend && friend.deleted_at == null) {
      const newTime = new Date().toISOString();
      friend.session_last_active_time = newTime;
      sortFriendsByLastMessageTime();
      storageStore.updateSessionLastMessageTime('friend', userId, newTime);
    }
  }

  function sortFriendsByLastMessageTime() {
    friendsList.value.sort((a, b) => {
      const aTime = a.session_last_active_time ? new Date(a.session_last_active_time).getTime() : (a.last_message_time ? new Date(a.last_message_time).getTime() : 0);
      const bTime = b.session_last_active_time ? new Date(b.session_last_active_time).getTime() : (b.last_message_time ? new Date(b.last_message_time).getTime() : 0);
      return bTime - aTime;
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

  function setPrivateAllLoaded(userId, value) {
    privateAllLoaded.value[userId] = value;
  }

  function isPrivateAllLoaded(userId) {
    return privateAllLoaded.value[userId] || false;
  }

  function getPrivateLastMessage(userId) {
    const storageStore = useStorageStore();
    const messages = storageStore.fullPrivateMessages[userId] || privateMessages.value[userId] || [];
    const validMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);
    if (validMessages.length === 0) return null;
    return validMessages[validMessages.length - 1];
  }

  function updateFriendLastMessage(userId, message) {
    if (!friendsList.value) return;
    if (message && (message.messageType === 101 || message.messageType === 102 || message.messageType === 103)) return;
    const friend = friendsList.value.find(f => String(f.id) === String(userId));
    if (friend) {
      friend.lastMessage = message;
      friend.session_last_active_time = new Date(message.timestamp || Date.now()).toISOString();
    }
  }

  function updateFriendLastMessageAfterDelete(userId) {
    const storageStore = useStorageStore();

    if (!friendsList.value) return;
    const friend = friendsList.value.find(f => String(f.id) === String(userId));
    if (!friend || friend.deleted_at != null) return;

    const messages = storageStore.fullPrivateMessages[userId] || [];
    const validMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);

    if (validMessages.length > 0) {
      const lastMessage = validMessages[validMessages.length - 1];
      friend.lastMessage = lastMessage;
      const newTime = new Date(lastMessage.timestamp || Date.now()).toISOString();
      friend.last_message_time = newTime;
      friend.session_last_active_time = newTime;
    } else {
      friend.lastMessage = null;
      friend.last_message_time = null;
      friend.session_last_active_time = null;
    }

    sortFriendsByLastMessageTime();
  }

  function updatePrivateMessagesReadStatus(userId, readMessageId) {
    const storageStore = useStorageStore();
    const baseStore = useBaseStore();

    const targetReadId = readMessageId ? parseInt(readMessageId) : null;
    const currentUserId = baseStore.currentUser?.id;
    if (!currentUserId) return;

    const messages = privateMessages.value[userId];
    if (messages && Array.isArray(messages)) {
      const myMessages = [];
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m.id && m.senderId !== undefined && String(m.senderId) === String(currentUserId)) {
          if (!targetReadId || m.id <= targetReadId) {
            myMessages.push({ index: i, id: m.id, isRead: m.isRead });
          }
        }
      }
      myMessages.sort((a, b) => b.id - a.id);
      let stopped = false;
      for (const item of myMessages) {
        if (stopped) break;
        const m = messages[item.index];
        if (m.isRead === 1) { stopped = true; break; }
        m.isRead = 1;
      }
    }

    if (storageStore.fullPrivateMessages[userId]) {
      const fullMessages = storageStore.fullPrivateMessages[userId];
      if (fullMessages && Array.isArray(fullMessages)) {
        const myMessages = [];
        for (let i = 0; i < fullMessages.length; i++) {
          const m = fullMessages[i];
          if (m.id && m.senderId !== undefined && String(m.senderId) === String(currentUserId)) {
            if (!targetReadId || m.id <= targetReadId) {
              myMessages.push({ index: i, id: m.id, isRead: m.isRead });
            }
          }
        }
        myMessages.sort((a, b) => b.id - a.id);
        let stopped = false;
        for (const item of myMessages) {
          if (stopped) break;
          const m = fullMessages[item.index];
          if (m.isRead === 1) { stopped = true; break; }
          m.isRead = 1;
        }
      }
    }

    privateStored.value[userId] = false;
    storageStore.saveToStorage();
  }

  async function markFriendAsDeleted(userId, isOwnOperation) {
    const storageStore = useStorageStore();
    const baseStore = useBaseStore();
    const sessionStore = useSessionStore();

    if (!friendsList.value) return;
    const friendIndex = friendsList.value.findIndex(f => String(f.id) === String(userId));
    if (friendIndex === -1) return;

    const prefix = storageStore.getStorageKeyPrefix();

    if (isOwnOperation) {
      delete storageStore.fullPrivateMessages[userId];
      delete privateMessages.value[userId];
      await localForage.removeItem(`${prefix}-private-${userId}`);
      const chatKeysData = await localForage.getItem(prefix);
      if (chatKeysData && chatKeysData.chatKeys) {
        const rawChatKeysData = toRaw(chatKeysData);
        rawChatKeysData.chatKeys = rawChatKeysData.chatKeys.filter(key => key !== `${prefix}-private-${userId}`);
        await localForage.setItem(prefix, rawChatKeysData);
      }
      friendsList.value.splice(friendIndex, 1);

      if (sessionStore.currentPrivateChatUserId && String(sessionStore.currentPrivateChatUserId) === String(userId)) {
        sessionStore.currentPrivateChatUserId = null;
      }
    } else {
      const friend = friendsList.value[friendIndex];
      friend.deleted_at = new Date().toISOString();

      try {
        const key = `${prefix}-private-${userId}`;
        const existingData = await localForage.getItem(key);
        let sessionData = existingData ? { ...toRaw(existingData) } : { messages: [] };

        if (!sessionData.nickname) {
          try {
            const response = await fetch(`/api/user/${userId}`, {
              method: 'GET',
              headers: { 'session-token': localStorage.getItem('currentSessionToken') }
            });
            if (response.ok) {
              const data = await response.json();
              if (data.status === 'success' && data.user) {
                if (!sessionData.nickname && data.user.nickname) sessionData.nickname = data.user.nickname;
                if (!sessionData.avatarUrl && data.user.avatar_url) sessionData.avatarUrl = data.user.avatar_url;
                if (!sessionData.username && data.user.username) sessionData.username = data.user.username;
              }
            }
          } catch (e) { /* ignore */ }
        }

        sessionData.deleted_at = friend.deleted_at;
        await localForage.setItem(key, sessionData);
      } catch (e) { /* ignore */ }
    }
  }

  function updateQuotedMessage(userId, messageId, newContent) {
    const storageStore = useStorageStore();
    let updated = false;

    if (privateMessages.value[userId]) {
      const index = privateMessages.value[userId].findIndex(m => String(m.id) === String(messageId));
      if (index !== -1) {
        privateMessages.value[userId][index] = toRaw({ ...toRaw(privateMessages.value[userId][index]), content: newContent });
        updated = true;
      }
    }

    if (storageStore.fullPrivateMessages[userId]) {
      const fullIndex = storageStore.fullPrivateMessages[userId].findIndex(m => String(m.id) === String(messageId));
      if (fullIndex !== -1) {
        storageStore.fullPrivateMessages[userId][fullIndex] = toRaw({ ...toRaw(storageStore.fullPrivateMessages[userId][fullIndex]), content: newContent });
        updated = true;
      }
    }

    if (updated) {
      privateStored.value[userId] = false;
      storageStore.saveToStorage();
    }

    return updated;
  }

  return {
    friendsList,
    privateMessages,
    privateAllLoaded,
    privateStored,
    privatePageSize,
    privatePageOffset,
    privateLoadingMore,
    addPrivateMessage,
    setPrivateMessages,
    prependPrivateMessages,
    clearPrivateMessages,
    deletePrivateMessage,
    moveFriendToTop,
    updateFriendSessionTime,
    sortFriendsByLastMessageTime,
    clearOtherPrivateMessages,
    setPrivateAllLoaded,
    isPrivateAllLoaded,
    getPrivateLastMessage,
    updateFriendLastMessage,
    updateFriendLastMessageAfterDelete,
    updatePrivateMessagesReadStatus,
    markFriendAsDeleted,
    updateQuotedMessage
  };
});
