import { ref, toRaw } from 'vue';
import localForage from 'localforage';

export function createGroupModule(getContext) {
  const groupsList = ref(null);
  const groupMessages = ref({});
  const groupAllLoaded = ref({});
  const groupStored = ref({});
  const groupPageSize = ref({});
  const groupPageOffset = ref({});
  const groupLoadingMore = ref({});
  const groupsWithAtMe = ref({});

  function addGroupMessage(groupId, message, context) {
    const { loading, cacheGroupMessages, fullGroupMessages, publicAndGroupMinId, saveMinIds, saveToStorage } = context;
    
    const isWithdrawMessage = message.messageType === 101;
    const messages = loading.value 
      ? (cacheGroupMessages[groupId] || (cacheGroupMessages[groupId] = [])) 
      : (groupMessages.value[groupId] || (groupMessages.value[groupId] = []));
    const exists = messages.some(m => m.id === message.id);
    if (!exists && !isWithdrawMessage) {
      messages.push(message);
    }
    if (!fullGroupMessages.value[groupId]) {
      fullGroupMessages.value[groupId] = [message];
    } else {
      const fullExists = fullGroupMessages.value[groupId].some(m => m.id === message.id);
      if (!fullExists) {
        fullGroupMessages.value[groupId].push(message);
      }
    }
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

  function setGroupMessages(groupId, messages, context) {
    const { loading, cacheGroupMessages, fullGroupMessages, currentUser, saveToStorage } = context;
    
    if (currentUser) {
      for (const message of messages) {
        if (message.atUserid && message.messageType !== 101 && message.messageType !== 102) {
          const atUserIds = Array.isArray(message.atUserid) ? message.atUserid : [message.atUserid];
          const isCurrentUserAt = atUserIds.some(id => String(id) === String(currentUser.id) || String(id) === '-1');
          if (isCurrentUserAt) {
            setGroupHasAtMe(groupId);
          }
        }
      }
    }
    
    if (loading.value) {
      cacheGroupMessages[groupId] = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
    } else {
      if (!fullGroupMessages.value[groupId]) {
        fullGroupMessages.value[groupId] = [...messages];
      } else {
        const fullExistingIds = new Set(fullGroupMessages.value[groupId].map(m => m.id));
        const fullNewMessages = messages.filter(m => !fullExistingIds.has(m.id));
        fullGroupMessages.value[groupId] = [...fullGroupMessages.value[groupId], ...fullNewMessages];
      }
      const filteredMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
      groupMessages.value[groupId] = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
      groupStored.value[groupId] = false;
      saveToStorage();
    }
  }

  function prependGroupMessages(groupId, messages, context) {
    const { loading, cacheGroupMessages, fullGroupMessages, currentUser, saveToStorage } = context;
    
    if (currentUser) {
      for (const message of messages) {
        if (message.atUserid && message.messageType !== 101 && message.messageType !== 102) {
          const atUserIds = Array.isArray(message.atUserid) ? message.atUserid : [message.atUserid];
          const isCurrentUserAt = atUserIds.some(id => String(id) === String(currentUser.id) || String(id) === '-1');
          if (isCurrentUserAt) {
            setGroupHasAtMe(groupId);
            break;
          }
        }
      }
    }
    
    const targetMessages = loading.value 
      ? (cacheGroupMessages[groupId] || (cacheGroupMessages[groupId] = [])) 
      : (groupMessages.value[groupId] || (groupMessages.value[groupId] = []));
    const existingIds = new Set(targetMessages.map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id));
    const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
    
    if (loading.value) {
      displayNewMessages.sort((a, b) => a.id - b.id);
      cacheGroupMessages[groupId] = [...displayNewMessages, ...(cacheGroupMessages[groupId] || [])];
    } else {
      if (fullGroupMessages.value[groupId]) {
        const fullIds = new Set(fullGroupMessages.value[groupId].map(m => m.id));
        const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
        fullNewMessages.sort((a, b) => a.id - b.id);
        fullGroupMessages.value[groupId] = [...fullNewMessages, ...fullGroupMessages.value[groupId]];
      }
      displayNewMessages.sort((a, b) => a.id - b.id);
      groupMessages.value[groupId] = [...displayNewMessages, ...groupMessages.value[groupId]];
      groupStored.value[groupId] = false;
      saveToStorage();
    }
  }

  function clearGroupMessages(groupId, context) {
    const { saveToStorage } = context;
    if (groupMessages.value[groupId]) {
      groupMessages.value[groupId] = [];
      groupStored.value[groupId] = false;
      saveToStorage();
    }
  }

  function deleteGroupMessage(groupId, messageId, context) {
    const { fullGroupMessages, saveToStorage } = context;
    
    if (groupMessages.value[groupId]) {
      const index = groupMessages.value[groupId].findIndex(m => String(m.id) === String(messageId));
      if (index !== -1) {
        groupMessages.value[groupId].splice(index, 1);
      }
    }
    if (fullGroupMessages.value[groupId]) {
      const fullIndex = fullGroupMessages.value[groupId].findIndex(m => String(m.id) === String(messageId));
      if (fullIndex !== -1) {
        fullGroupMessages.value[groupId].splice(fullIndex, 1);
      }
    }
    groupStored.value[groupId] = false;
    saveToStorage();
    updateGroupLastMessageAfterDelete(groupId, context);
  }

  function moveGroupToTop(groupId, context) {
    const { sortGroupsByLastMessageTime } = context;
    const index = groupsList.value.findIndex(g => String(g.id) === String(groupId));
    if (index > 0) {
      const group = groupsList.value[index];
      if (group.deleted_at != null) {
        return;
      }
      const removedGroup = groupsList.value.splice(index, 1)[0];
      const newTime = new Date().toISOString();
      removedGroup.last_message_time = newTime;
      groupsList.value.unshift(removedGroup);
      sortGroupsByLastMessageTime();
    }
  }

  function sortGroupsByLastMessageTime() {
    groupsList.value.sort((a, b) => {
      const aTime = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
      const bTime = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
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

  function getGroupLastMessage(groupId, context) {
    const { fullGroupMessages } = context;
    const messages = fullGroupMessages.value[groupId] || groupMessages.value[groupId] || [];
    const validMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
    if (validMessages.length === 0) return null;
    return validMessages[validMessages.length - 1];
  }

  function updateGroupLastMessage(groupId, message) {
    if (!groupsList.value) return;
    const group = groupsList.value.find(g => String(g.id) === String(groupId));
    if (group) {
      group.lastMessage = message;
    }
  }

  function updateGroupLastMessageAfterDelete(groupId, context) {
    const { fullGroupMessages } = context;
    if (!groupsList.value) return;
    const group = groupsList.value.find(g => String(g.id) === String(groupId));
    if (!group || group.deleted_at != null) return;

    const messages = fullGroupMessages.value[groupId] || [];
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
      if (saved) {
        groupsWithAtMe.value = JSON.parse(saved);
      }
    } catch (err) {
      console.error('加载groupsWithAtMe失败:', err);
    }
  }

  function saveGroupsWithAtMeToLocalStorage(currentUser) {
    try {
      const userId = currentUser?.id || 'guest';
      localStorage.setItem(`groups_with_at_me_${userId}`, JSON.stringify(groupsWithAtMe.value));
    } catch (err) {
      console.error('保存groupsWithAtMe失败:', err);
    }
  }

  async function markGroupAsDeleted(groupId, isOwnOperation, context) {
    const { currentUser, getStorageKeyPrefix, fullGroupMessages, groupMessages, groupStored, currentGroupId, saveToStorage } = context;
    
    if (!groupsList.value) return;
    const groupIndex = groupsList.value.findIndex(g => String(g.id) === String(groupId));
    if (groupIndex === -1) return;
    
    const prefix = getStorageKeyPrefix();
    
    if (isOwnOperation) {
      delete fullGroupMessages.value[groupId];
      delete groupMessages.value[groupId];
      await localForage.removeItem(`${prefix}-group-${groupId}`);
      const chatKeysData = await localForage.getItem(prefix);
      if (chatKeysData && chatKeysData.chatKeys) {
        const rawChatKeysData = toRaw(chatKeysData);
        rawChatKeysData.chatKeys = rawChatKeysData.chatKeys.filter(key => key !== `${prefix}-group-${groupId}`);
        await localForage.setItem(prefix, rawChatKeysData);
      }
      groupsList.value.splice(groupIndex, 1);
      
      if (currentGroupId.value && String(currentGroupId.value) === String(groupId)) {
        currentGroupId.value = null;
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
            const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'https://back.hs.airoe.cn'}/api/group-info/${groupId}`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'user-id': currentUser?.id,
                'session-token': localStorage.getItem('currentSessionToken')
              }
            });
            if (response.ok) {
              const data = await response.json();
              if (data.status === 'success' && data.group) {
                if (!sessionData.name && data.group.name) {
                  sessionData.name = data.group.name;
                }
                if (!sessionData.avatarUrl && data.group.avatar_url) {
                  sessionData.avatarUrl = data.group.avatar_url;
                }
              }
            }
          } catch (e) {
            console.error('获取群组信息失败:', e);
          }
        }
        
        sessionData.deleted_at = group.deleted_at;
        await localForage.setItem(key, sessionData);
      } catch (e) {
        console.error('更新群组会话的 deleted_at 标记失败:', e);
      }
    }
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
    markGroupAsDeleted
  };
}
