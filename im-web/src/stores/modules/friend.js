import { ref, toRaw } from 'vue';
import localForage from 'localforage';

export function createFriendModule(getContext) {
  const friendsList = ref([]);
  const privateMessages = ref({});
  const privateAllLoaded = ref({});
  const privateStored = ref({});
  const privatePageSize = ref({});
  const privatePageOffset = ref({});
  const privateLoadingMore = ref({});

  function addPrivateMessage(userId, message, context) {
    const { loading, cachePrivateMessages, fullPrivateMessages, privateMinId, saveMinIds, saveToStorage } = context;
    
    const isWithdrawMessage = message.messageType === 101;
    const isReadReceiptMessage = message.messageType === 103;
    const messages = loading.value 
      ? (cachePrivateMessages[userId] || (cachePrivateMessages[userId] = [])) 
      : (privateMessages.value[userId] || (privateMessages.value[userId] = []));
    const exists = messages.some(m => m.id === message.id);
    if (!exists && !isWithdrawMessage && !isReadReceiptMessage) {
      messages.push(message);
    }
    if (!fullPrivateMessages.value[userId]) {
      fullPrivateMessages.value[userId] = [message];
    } else {
      const fullExists = fullPrivateMessages.value[userId].some(m => m.id === message.id);
      if (!fullExists) {
        fullPrivateMessages.value[userId].push(message);
      }
    }
    
    if (message.id && message.id > privateMinId.value && !isWithdrawMessage) {
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

  function setPrivateMessages(userId, messages, context) {
    const { loading, cachePrivateMessages, fullPrivateMessages, saveToStorage } = context;
    
    if (loading.value) {
      cachePrivateMessages[userId] = messages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);
    } else {
      if (!fullPrivateMessages.value[userId]) {
        fullPrivateMessages.value[userId] = [...messages];
      } else {
        const fullExistingIds = new Set(fullPrivateMessages.value[userId].map(m => m.id));
        const fullNewMessages = messages.filter(m => !fullExistingIds.has(m.id));
        fullPrivateMessages.value[userId] = [...fullPrivateMessages.value[userId], ...fullNewMessages];
      }
      const filteredMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);
      privateMessages.value[userId] = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
      privateStored.value[userId] = false;
      saveToStorage();
    }
  }

  function prependPrivateMessages(userId, messages, context) {
    const { loading, cachePrivateMessages, fullPrivateMessages, saveToStorage } = context;
    
    const targetMessages = loading.value 
      ? (cachePrivateMessages[userId] || (cachePrivateMessages[userId] = [])) 
      : (privateMessages.value[userId] || (privateMessages.value[userId] = []));
    const existingIds = new Set(targetMessages.map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id));
    const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);
    
    if (loading.value) {
      displayNewMessages.sort((a, b) => a.id - b.id);
      cachePrivateMessages[userId] = [...displayNewMessages, ...(cachePrivateMessages[userId] || [])];
    } else {
      if (fullPrivateMessages && fullPrivateMessages.value && fullPrivateMessages.value[userId]) {
        const fullIds = new Set(fullPrivateMessages.value[userId].map(m => m.id));
        const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
        fullNewMessages.sort((a, b) => a.id - b.id);
        fullPrivateMessages.value[userId] = [...fullNewMessages, ...fullPrivateMessages.value[userId]];
      }
      displayNewMessages.sort((a, b) => a.id - b.id);
      privateMessages.value[userId] = [...displayNewMessages, ...privateMessages.value[userId]];
      privateStored.value[userId] = false;
      saveToStorage();
    }
  }

  function clearPrivateMessages(userId, context) {
    const { saveToStorage } = context;
    if (privateMessages.value[userId]) {
      privateMessages.value[userId] = [];
      privateStored.value[userId] = false;
      saveToStorage();
    }
  }

  function deletePrivateMessage(userId, messageId, context) {
    const { fullPrivateMessages, saveToStorage, updateFriendLastMessageAfterDelete } = context;
    
    if (privateMessages.value[userId]) {
      const index = privateMessages.value[userId].findIndex(m => String(m.id) === String(messageId));
      if (index !== -1) {
        privateMessages.value[userId].splice(index, 1);
      }
    }
    if (fullPrivateMessages.value[userId]) {
      const fullIndex = fullPrivateMessages.value[userId].findIndex(m => String(m.id) === String(messageId));
      if (fullIndex !== -1) {
        fullPrivateMessages.value[userId].splice(fullIndex, 1);
      }
    }
    privateStored.value[userId] = false;
    saveToStorage();
    
    updateFriendLastMessageAfterDelete(userId);
  }

  function moveFriendToTop(userId, context) {
    const { sortFriendsByLastMessageTime } = context;
    
    const index = friendsList.value.findIndex(f => String(f.id) === String(userId));
    if (index > 0) {
      const friend = friendsList.value[index];
      if (friend.deleted_at != null) {
        return;
      }
      const removedFriend = friendsList.value.splice(index, 1)[0];
      const newTime = new Date().toISOString();
      removedFriend.last_message_time = newTime;
      friendsList.value.unshift(removedFriend);
      sortFriendsByLastMessageTime();
    }
  }

  function sortFriendsByLastMessageTime() {
    friendsList.value.sort((a, b) => {
      const aTime = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
      const bTime = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
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

  function getPrivateLastMessage(userId, context) {
    const { fullPrivateMessages } = context;
    const messages = fullPrivateMessages.value[userId] || privateMessages.value[userId] || [];
    const validMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);
    if (validMessages.length === 0) return null;
    return validMessages[validMessages.length - 1];
  }

  function updateFriendLastMessage(userId, message) {
    if (!friendsList.value) return;
    const friend = friendsList.value.find(f => String(f.id) === String(userId));
    if (friend && message && message.messageType !== 101 && message.messageType !== 103) {
      friend.lastMessage = message;
    }
  }

  function updateFriendLastMessageAfterDelete(userId, context) {
    const { fullPrivateMessages, sortFriendsByLastMessageTime } = context;
    
    if (!friendsList.value) return;
    const friend = friendsList.value.find(f => String(f.id) === String(userId));
    if (!friend || friend.deleted_at != null) return;

    const messages = fullPrivateMessages.value[userId] || [];
    const validMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);

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

  function updatePrivateMessagesReadStatus(userId, readMessageId, context) {
    const { currentUser, fullPrivateMessages, privateStored, saveToStorage } = context;
    
    const targetReadId = readMessageId ? parseInt(readMessageId) : null;
    const currentUserId = currentUser?.id;
    if (!currentUserId) {
      return;
    }
    
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
        if (m.isRead === 1) {
          stopped = true;
          break;
        }
        m.isRead = 1;
      }
    }
    
    if (fullPrivateMessages && fullPrivateMessages.value && fullPrivateMessages.value[userId]) {
      const fullMessages = fullPrivateMessages.value[userId];
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
          if (m.isRead === 1) {
            stopped = true;
            break;
          }
          m.isRead = 1;
        }
      }
    }
    
    privateStored.value[userId] = false;
    saveToStorage();
  }

  async function markFriendAsDeleted(userId, isOwnOperation, context) {
    const { currentUser, getStorageKeyPrefix, fullPrivateMessages, currentPrivateChatUserId, saveToStorage } = context;
    
    if (!friendsList.value) return;
    const friendIndex = friendsList.value.findIndex(f => String(f.id) === String(userId));
    if (friendIndex === -1) return;
    
    const prefix = getStorageKeyPrefix();
    
    if (isOwnOperation) {
      delete fullPrivateMessages.value[userId];
      delete privateMessages.value[userId];
      await localForage.removeItem(`${prefix}-private-${userId}`);
      const chatKeysData = await localForage.getItem(prefix);
      if (chatKeysData && chatKeysData.chatKeys) {
        const rawChatKeysData = toRaw(chatKeysData);
        rawChatKeysData.chatKeys = rawChatKeysData.chatKeys.filter(key => key !== `${prefix}-private-${userId}`);
        await localForage.setItem(prefix, rawChatKeysData);
      }
      friendsList.value.splice(friendIndex, 1);
      
      if (currentPrivateChatUserId.value && String(currentPrivateChatUserId.value) === String(userId)) {
        currentPrivateChatUserId.value = null;
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
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              }
            });
            if (response.ok) {
              const data = await response.json();
              if (data.status === 'success' && data.user) {
                if (!sessionData.nickname && data.user.nickname) {
                  sessionData.nickname = data.user.nickname;
                }
                if (!sessionData.avatarUrl && data.user.avatar_url) {
                  sessionData.avatarUrl = data.user.avatar_url;
                }
                if (!sessionData.username && data.user.username) {
                  sessionData.username = data.user.username;
                }
              }
            }
          } catch (e) {
            console.error('获取用户信息失败:', e);
          }
        }
        
        sessionData.deleted_at = friend.deleted_at;
        await localForage.setItem(key, sessionData);
      } catch (e) {
        console.error('更新好友会话的 deleted_at 标记失败:', e);
      }
    }
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
    sortFriendsByLastMessageTime,
    clearOtherPrivateMessages,
    setPrivateAllLoaded,
    isPrivateAllLoaded,
    getPrivateLastMessage,
    updateFriendLastMessage,
    updateFriendLastMessageAfterDelete,
    updatePrivateMessagesReadStatus,
    markFriendAsDeleted
  };
}
