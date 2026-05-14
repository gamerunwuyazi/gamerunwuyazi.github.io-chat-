import { defineStore } from 'pinia';
import { ref, toRaw } from 'vue';
import localForage from 'localforage';
import { useStorageStore } from './storageStore';
import { useBaseStore } from './baseStore';
import { useSessionStore } from './sessionStore';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export const useGroupStore = defineStore('group', () => {
  const groupsList = ref([]);
  const groupMessages = ref({});
  const groupAllLoaded = ref({});
  const groupStored = ref({});
  const groupPageSize = ref({});
  const groupPageOffset = ref({});
  const groupLoadingMore = ref({});
  const groupsWithAtMe = ref({});

  function addGroupMessage(groupId, message) {
    const storageStore = useStorageStore();
    const baseStore = useBaseStore();

    const isWithdrawMessage = message.messageType === 101;
    const messages = baseStore.loading
      ? (storageStore.getCacheGroup()[groupId] || (storageStore.getCacheGroup()[groupId] = []))
      : (groupMessages.value[groupId] || (groupMessages.value[groupId] = []));
    const exists = messages.some(m => m.id === message.id);
    if (!exists && !isWithdrawMessage) {
      messages.push(message);
    }
    if (storageStore.fullGroupMessages && !storageStore.fullGroupMessages[groupId]) {
      storageStore.fullGroupMessages[groupId] = [message];
    } else if (storageStore.fullGroupMessages) {
      const fullExists = storageStore.fullGroupMessages[groupId].some(m => m.id === message.id);
      if (!fullExists) storageStore.fullGroupMessages[groupId].push(message);
    }
    if (message.id && message.id > storageStore.publicAndGroupMinId) {
      storageStore.publicAndGroupMinId = message.id;
      storageStore.saveMinIds();
    }
    if (!baseStore.loading) {
      groupStored.value[groupId] = false;
      storageStore.saveToStorage();
    }
  }

  function setGroupMessages(groupId, messages) {
    const storageStore = useStorageStore();
    const baseStore = useBaseStore();

    if (baseStore.currentUser) {
      for (const message of messages) {
        if (message.atUserid && message.messageType !== 101 && message.messageType !== 102) {
          const atUserIds = Array.isArray(message.atUserid) ? message.atUserid : [message.atUserid];
          const isCurrentUserAt = atUserIds.some(id => String(id) === String(baseStore.currentUser.id) || String(id) === '-1');
          if (isCurrentUserAt) setGroupHasAtMe(groupId);
        }
      }
    }

    if (baseStore.loading) {
      storageStore.getCacheGroup()[groupId] = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
    } else {
      if (!storageStore.fullGroupMessages[groupId]) {
        storageStore.fullGroupMessages[groupId] = [...messages];
      } else {
        const fullExistingIds = new Set(storageStore.fullGroupMessages[groupId].map(m => m.id));
        const fullNewMessages = messages.filter(m => !fullExistingIds.has(m.id));
        storageStore.fullGroupMessages[groupId] = [...storageStore.fullGroupMessages[groupId], ...fullNewMessages];
      }
      const filteredMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
      groupMessages.value[groupId] = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
      groupStored.value[groupId] = false;
      storageStore.saveToStorage();
    }
  }

  function prependGroupMessages(groupId, messages) {
    const storageStore = useStorageStore();
    const baseStore = useBaseStore();

    if (baseStore.currentUser) {
      for (const message of messages) {
        if (message.atUserid && message.messageType !== 101 && message.messageType !== 102) {
          const atUserIds = Array.isArray(message.atUserid) ? message.atUserid : [message.atUserid];
          const isCurrentUserAt = atUserIds.some(id => String(id) === String(baseStore.currentUser.id) || String(id) === '-1');
          if (isCurrentUserAt) { setGroupHasAtMe(groupId); break; }
        }
      }
    }

    const targetMessages = baseStore.loading
      ? (storageStore.getCacheGroup()[groupId] || (storageStore.getCacheGroup()[groupId] = []))
      : (groupMessages.value[groupId] || (groupMessages.value[groupId] = []));
    const existingIds = new Set(targetMessages.map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id));
    const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);

    if (baseStore.loading) {
      displayNewMessages.sort((a, b) => a.id - b.id);
      storageStore.getCacheGroup()[groupId] = [...displayNewMessages, ...(storageStore.getCacheGroup()[groupId] || [])];
    } else {
      if (storageStore.fullGroupMessages[groupId]) {
        const fullIds = new Set(storageStore.fullGroupMessages[groupId].map(m => m.id));
        const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
        fullNewMessages.sort((a, b) => a.id - b.id);
        storageStore.fullGroupMessages[groupId] = [...fullNewMessages, ...storageStore.fullGroupMessages[groupId]];
      }
      displayNewMessages.sort((a, b) => a.id - b.id);
      groupMessages.value[groupId] = [...displayNewMessages, ...groupMessages.value[groupId]];
      groupStored.value[groupId] = false;
      storageStore.saveToStorage();
    }
  }

  function clearGroupMessages(groupId) {
    const storageStore = useStorageStore();
    if (groupMessages.value[groupId]) {
      groupMessages.value[groupId] = [];
      groupStored.value[groupId] = false;
      storageStore.saveToStorage();
    }
  }

  function deleteGroupMessage(groupId, messageId) {
    const storageStore = useStorageStore();

    if (groupMessages.value[groupId]) {
      const index = groupMessages.value[groupId].findIndex(m => String(m.id) === String(messageId));
      if (index !== -1) groupMessages.value[groupId].splice(index, 1);
    }
    if (storageStore.fullGroupMessages[groupId]) {
      const fullIndex = storageStore.fullGroupMessages[groupId].findIndex(m => String(m.id) === String(messageId));
      if (fullIndex !== -1) storageStore.fullGroupMessages[groupId].splice(fullIndex, 1);
    }
    groupStored.value[groupId] = false;
    storageStore.saveToStorage();
    updateGroupLastMessageAfterDelete(groupId);
  }

  function moveGroupToTop(groupId) {
    const group = groupsList.value.find(g => String(g.id) === String(groupId));
    if (group && group.deleted_at == null) {
      group.session_last_active_time = new Date().toISOString();
      sortGroupsByLastMessageTime();
    }
  }

  function updateGroupSessionTime(groupId) {
    const storageStore = useStorageStore();
    const group = groupsList.value.find(g => String(g.id) === String(groupId));
    if (group && group.deleted_at == null) {
      const newTime = new Date().toISOString();
      group.session_last_active_time = newTime;
      sortGroupsByLastMessageTime();
      storageStore.updateSessionLastMessageTime('group', groupId, newTime);
    }
  }

  function sortGroupsByLastMessageTime() {
    groupsList.value.sort((a, b) => {
      const aTime = a.session_last_active_time ? new Date(a.session_last_active_time).getTime() : (a.last_message_time ? new Date(a.last_message_time).getTime() : 0);
      const bTime = b.session_last_active_time ? new Date(b.session_last_active_time).getTime() : (b.last_message_time ? new Date(b.last_message_time).getTime() : 0);
      return bTime - aTime;
    });
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

  function setGroupAllLoaded(groupId, value) {
    groupAllLoaded.value[groupId] = value;
  }

  function isGroupAllLoaded(groupId) {
    return groupAllLoaded.value[groupId] || false;
  }

  function getGroupLastMessage(groupId) {
    const storageStore = useStorageStore();
    const messages = storageStore.fullGroupMessages[groupId] || groupMessages.value[groupId] || [];
    const validMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
    if (validMessages.length === 0) return null;
    return validMessages[validMessages.length - 1];
  }

  function updateGroupLastMessage(groupId, message) {
    if (!groupsList.value) return;
    if (message && (message.messageType === 101 || message.messageType === 102)) return;
    const group = groupsList.value.find(g => String(g.id) === String(groupId));
    if (group) {
      group.lastMessage = message;
      group.session_last_active_time = new Date(message.timestamp || Date.now()).toISOString();
    }
  }

  function updateGroupLastMessageAfterDelete(groupId) {
    const storageStore = useStorageStore();

    if (!groupsList.value) return;
    const group = groupsList.value.find(g => String(g.id) === String(groupId));
    if (!group || group.deleted_at != null) return;

    const messages = storageStore.fullGroupMessages[groupId] || [];
    const validMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);

    if (validMessages.length > 0) {
      const lastMessage = validMessages[validMessages.length - 1];
      group.lastMessage = lastMessage;
      const newTime = new Date(lastMessage.timestamp || Date.now()).toISOString();
      group.last_message_time = newTime;
      group.session_last_active_time = newTime;
    } else {
      group.lastMessage = null;
      group.last_message_time = null;
      group.session_last_active_time = null;
    }

    sortGroupsByLastMessageTime();
  }

  function setGroupHasAtMe(groupId) {
    const groupIdStr = String(groupId);
    groupsWithAtMe.value[groupIdStr] = true;
    saveGroupsWithAtMeToLocalStorage();
  }

  function clearGroupHasAtMe(groupId) {
    const groupIdStr = String(groupId);
    if (groupsWithAtMe.value[groupIdStr]) {
      delete groupsWithAtMe.value[groupIdStr];
      saveGroupsWithAtMeToLocalStorage();
    }
  }

  function hasGroupAtMe(groupId) {
    const groupIdStr = String(groupId);
    return !!groupsWithAtMe.value[groupIdStr];
  }

  function loadGroupsWithAtMeFromLocalStorage(currentUser) {
    try {
      const userId = currentUser?.id || 'guest';
      const saved = localStorage.getItem(`groups_with_at_me_${userId}`);
      if (saved) groupsWithAtMe.value = JSON.parse(saved);
    } catch (err) {}
  }

  function saveGroupsWithAtMeToLocalStorage() {
    const baseStore = useBaseStore();
    try {
      const userId = baseStore.currentUser?.id || 'guest';
      localStorage.setItem(`groups_with_at_me_${userId}`, JSON.stringify(groupsWithAtMe.value));
    } catch (err) {}
  }

  async function markGroupAsDeleted(groupId, isOwnOperation) {
    const storageStore = useStorageStore();
    const baseStore = useBaseStore();
    const sessionStore = useSessionStore();

    if (!groupsList.value) return;
    const groupIndex = groupsList.value.findIndex(g => String(g.id) === String(groupId));
    if (groupIndex === -1) return;

    const prefix = storageStore.getStorageKeyPrefix();

    if (isOwnOperation) {
      delete storageStore.fullGroupMessages[groupId];
      delete groupMessages.value[groupId];
      await localForage.removeItem(`${prefix}-group-${groupId}`);
      const chatKeysData = await localForage.getItem(prefix);
      if (chatKeysData && chatKeysData.chatKeys) {
        const rawChatKeysData = toRaw(chatKeysData);
        rawChatKeysData.chatKeys = rawChatKeysData.chatKeys.filter(key => key !== `${prefix}-group-${groupId}`);
        await localForage.setItem(prefix, rawChatKeysData);
      }
      groupsList.value.splice(groupIndex, 1);

      if (sessionStore.currentGroupId && String(sessionStore.currentGroupId) === String(groupId)) {
        sessionStore.currentGroupId = null;
      }
    } else {
      const group = groupsList.value[groupIndex];
      group.deleted_at = new Date().toISOString();

      try {
        const key = `${prefix}-group-${groupId}`;
        const existingData = await localForage.getItem(key);
        let sessionData = existingData ? { ...toRaw(existingData) } : { messages: [] };

        if (!sessionData.name) {
          try {
            const response = await fetch(`${SERVER_URL}/api/group-info/${groupId}`, {
              method: 'GET',
              headers: { 'user-id': baseStore.currentUser?.id, 'session-token': localStorage.getItem('currentSessionToken') }
            });
            if (response.ok) {
              const data = await response.json();
              if (data.status === 'success' && data.group) {
                if (!sessionData.name && data.group.name) sessionData.name = data.group.name;
                if (!sessionData.avatarUrl && data.group.avatar_url) sessionData.avatarUrl = data.group.avatar_url;
              }
            }
          } catch (e) {}
        }

        sessionData.deleted_at = group.deleted_at;
        await localForage.setItem(key, sessionData);
      } catch (e) {}
    }
  }

  function updateQuotedMessage(groupId, messageId, newContent) {
    const storageStore = useStorageStore();
    let updated = false;

    if (groupMessages.value[groupId]) {
      const index = groupMessages.value[groupId].findIndex(m => String(m.id) === String(messageId));
      if (index !== -1) {
        groupMessages.value[groupId][index] = toRaw({ ...toRaw(groupMessages.value[groupId][index]), content: newContent });
        updated = true;
      }
    }

    if (storageStore.fullGroupMessages[groupId]) {
      const fullIndex = storageStore.fullGroupMessages[groupId].findIndex(m => String(m.id) === String(messageId));
      if (fullIndex !== -1) {
        storageStore.fullGroupMessages[groupId][fullIndex] = toRaw({ ...toRaw(storageStore.fullGroupMessages[groupId][fullIndex]), content: newContent });
        updated = true;
      }
    }

    if (updated) {
      groupStored.value[groupId] = false;
      storageStore.saveToStorage();
    }

    return updated;
  }

  return {
    groupsList,
    groupMessages,
    groupAllLoaded,
    groupStored,
    groupPageSize,
    groupPageOffset,
    groupLoadingMore,
    groupsWithAtMe,
    addGroupMessage,
    setGroupMessages,
    prependGroupMessages,
    clearGroupMessages,
    deleteGroupMessage,
    moveGroupToTop,
    updateGroupSessionTime,
    sortGroupsByLastMessageTime,
    clearOtherGroupMessages,
    setGroupAllLoaded,
    isGroupAllLoaded,
    getGroupLastMessage,
    updateGroupLastMessage,
    updateGroupLastMessageAfterDelete,
    setGroupHasAtMe,
    clearGroupHasAtMe,
    hasGroupAtMe,
    loadGroupsWithAtMeFromLocalStorage,
    saveGroupsWithAtMeToLocalStorage,
    markGroupAsDeleted,
    updateQuotedMessage
  };
});
