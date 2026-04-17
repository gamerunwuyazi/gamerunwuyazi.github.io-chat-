import { ref, toRaw } from 'vue';
import localForage from 'localforage';

const cachePublicMessages = [];
const cacheGroupMessages = {};
const cachePrivateMessages = {};
const fullPublicMessages = ref(null);
const fullGroupMessages = ref({});
const fullPrivateMessages = ref({});

export function createStorageModule(getContext) {
  const publicAndGroupMinId = ref(0);
  const privateMinId = ref(0);

  async function saveToStorage(context) {
    const { loading, getStorageKeyPrefix, publicStored, groupStored, privateStored, groupsList, friendsList } = context;
    
    if (loading.value) {
      return;
    }

    const prefix = getStorageKeyPrefix();

    try {
      if (!publicStored.value) {
        const messagesToSave = fullPublicMessages.value !== null 
          ? fullPublicMessages.value 
          : [];
        const messages = messagesToSave.map(msg => toRaw(msg));
        await localForage.setItem(`${prefix}-public`, { messages });
        publicStored.value = true;
      }

      for (const [groupId, messages] of Object.entries(fullGroupMessages.value)) {
        if (!groupStored.value[groupId]) {
          const msgs = messages.map(msg => toRaw(msg));
          const key = `${prefix}-group-${groupId}`;
          let sessionData = await localForage.getItem(key) || { messages: [] };
          sessionData = { ...toRaw(sessionData), messages: msgs };
          const groupInfo = groupsList?.value?.find(g => String(g.id) === String(groupId));
          if (groupInfo) {
            const rawGroupInfo = toRaw(groupInfo);
            if (rawGroupInfo.name) sessionData.name = rawGroupInfo.name;
            if (rawGroupInfo.avatarUrl) sessionData.avatarUrl = rawGroupInfo.avatarUrl;
            if (rawGroupInfo.deleted_at) sessionData.deleted_at = rawGroupInfo.deleted_at;
          }
          await localForage.setItem(key, sessionData);
          groupStored.value[groupId] = true;
        }
      }

      for (const [userId, messages] of Object.entries(fullPrivateMessages.value)) {
        if (!privateStored.value[userId]) {
          const msgs = messages.map(msg => toRaw(msg));
          const key = `${prefix}-private-${userId}`;
          let sessionData = await localForage.getItem(key) || { messages: [] };
          sessionData = { ...toRaw(sessionData), messages: msgs };
          const friendInfo = friendsList?.value?.find(f => String(f.id) === String(userId));
          if (friendInfo) {
            const rawFriendInfo = toRaw(friendInfo);
            if (rawFriendInfo.nickname) sessionData.nickname = rawFriendInfo.nickname;
            if (rawFriendInfo.avatarUrl) sessionData.avatarUrl = rawFriendInfo.avatarUrl;
            if (rawFriendInfo.deleted_at) sessionData.deleted_at = rawFriendInfo.deleted_at;
          }
          await localForage.setItem(key, sessionData);
          privateStored.value[userId] = true;
        }
      }

      const chatKeys = [
        `${prefix}-public`,
        ...Object.keys(fullGroupMessages.value).map(id => `${prefix}-group-${id}`),
        ...Object.keys(fullPrivateMessages.value).map(id => `${prefix}-private-${id}`),
      ];
      await localForage.setItem(prefix, { chatKeys });
    } catch (err) {
      console.error('本地消息缓存存储失败', err);
    }
  }

  function loadMessages(loadToStore, context) {
    return new Promise(async (resolve, reject) => {
      const { getStorageKeyPrefix, publicMessages, groupMessages, privateMessages, publicStored, groupStored, privateStored } = context;
      
      try {
        const prefix = getStorageKeyPrefix();
        
        await loadMinIds(context);
        
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
            fullPublicMessages.value = [...messages];
            if (loadToStore) {
              const filteredMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
              publicMessages.value = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
            }
          } else if (key.includes('-group-')) {
            const groupId = key.split('-group-')[1];
            fullGroupMessages.value[groupId] = [...messages];
            if (loadToStore) {
              const filteredMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
              groupMessages.value[groupId] = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
            }
          } else if (key.includes('-private-')) {
            const userId = key.split('-private-')[1];
            fullPrivateMessages.value[userId] = [...messages];
            if (loadToStore) {
              const filteredMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);
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

  function clearMessages(context) {
    const { publicMessages, groupMessages, privateMessages, publicStored, groupStored, privateStored } = context;
    
    cachePublicMessages.length = 0;
    Object.keys(cacheGroupMessages).forEach(key => delete cacheGroupMessages[key]);
    Object.keys(cachePrivateMessages).forEach(key => delete cachePrivateMessages[key]);
    publicMessages.value = [];
    groupMessages.value = {};
    privateMessages.value = {};
    publicStored.value = false;
    groupStored.value = {};
    privateStored.value = {};
    fullPublicMessages.value = null;
    fullGroupMessages.value = {};
    fullPrivateMessages.value = {};
  }

  async function saveMinIds(context) {
    const { getStorageKeyPrefix } = context;
    
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

  async function loadMinIds(context) {
    const { getStorageKeyPrefix } = context;
    
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

  function refreshMessages(context) {
    const { publicMessages, groupMessages, privateMessages, publicStored, groupStored, privateStored, saveToStorage } = context;
    
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

  async function processOfflineMessage(message, onlySaveToDB, context) {
    const { 
      currentUser, 
      onlineUsers, 
      friendsList, 
      groupsList,
      getStorageKeyPrefix, 
      updateUserInfoInMessages,
      deletePublicMessage,
      deleteGroupMessage,
      deletePrivateMessage,
      setGroupHasAtMe,
      updatePrivateMessagesReadStatus,
      loading,
      publicMessages,
      groupMessages,
      privateMessages,
      publicStored,
      groupStored,
      privateStored,
      saveToStorage
    } = context;

    const processedMessage = {
      id: message.id,
      userId: message.userId,
      nickname: message.nickname,
      avatarUrl: message.avatarUrl,
      content: message.content,
      atUserid: message.atUserid,
      messageType: message.messageType,
      timestamp: message.timestamp,
      type: message.type,
      groupId: message.groupId,
      groupName: message.groupName,
      groupDeletedAt: message.groupDeletedAt,
      senderId: message.senderId,
      receiverId: message.receiverId,
      isRead: message.isRead
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
          try {
            const prefix = getStorageKeyPrefix();
            const key = `${prefix}-private-${userId}`;
            const existingData = await localForage.getItem(key);
            if (existingData) {
              const updatedSessionData = { ...toRaw(existingData) };
              updatedSessionData.nickname = updateData.nickname;
              await localForage.setItem(key, updatedSessionData);
            }
          } catch (e) {
            console.error('更新 IndexedDB 中的好友昵称失败:', e);
          }
          updateUserInfoInMessages(userId, { nickname: updateData.nickname }, {
            fullPublicMessages: fullPublicMessages.value,
            fullGroupMessages: fullGroupMessages.value,
            fullPrivateMessages: fullPrivateMessages.value,
            publicMessages,
            groupMessages,
            privateMessages,
            publicStored,
            groupStored,
            privateStored,
            groupsList,
            friendsList,
            saveToStorage: () => saveToStorage(getContext())
          });
        } else if (updateData.type === 'avatar' && updateData.avatar_url) {
          if (onlineUsers.value) {
            const userIndex = onlineUsers.value.findIndex(u => String(u.id) === String(userId));
            if (userIndex !== -1) {
              onlineUsers.value[userIndex].avatar = updateData.avatar_url;
              onlineUsers.value[userIndex].avatarUrl = updateData.avatar_url;
              onlineUsers.value[userIndex].avatar_url = updateData.avatar_url;
            }
          }
          if (friendsList.value) {
            const friendIndex = friendsList.value.findIndex(f => String(f.id) === String(userId));
            if (friendIndex !== -1) {
              friendsList.value[friendIndex].avatarUrl = updateData.avatar_url;
              friendsList.value[friendIndex].avatar_url = updateData.avatar_url;
              friendsList.value[friendIndex].avatar = updateData.avatar_url;
              friendsList.value = [...friendsList.value];
            }
          }
          try {
            const prefix = getStorageKeyPrefix();
            const key = `${prefix}-private-${userId}`;
            const existingData = await localForage.getItem(key);
            if (existingData) {
              const updatedSessionData = { ...toRaw(existingData) };
              updatedSessionData.avatarUrl = updateData.avatar_url;
              await localForage.setItem(key, updatedSessionData);
            }
          } catch (e) {
            console.error('更新 IndexedDB 中的好友头像失败:', e);
          }
          updateUserInfoInMessages(userId, { avatarUrl: updateData.avatar_url }, {
            fullPublicMessages: fullPublicMessages.value,
            fullGroupMessages: fullGroupMessages.value,
            fullPrivateMessages: fullPrivateMessages.value,
            publicMessages,
            groupMessages,
            privateMessages,
            publicStored,
            groupStored,
            privateStored,
            groupsList,
            friendsList,
            saveToStorage: () => saveToStorage(getContext())
          });
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
      const fullExists = fullPublicMessages.value?.some(m => m.id === processedMessage.id) || false;
      
      if (!fullExists) {
        if (fullPublicMessages.value === null) {
          fullPublicMessages.value = [processedMessage];
        } else {
          fullPublicMessages.value.push(processedMessage);
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
      
      if (message.atUserid && currentUser && !isWithdrawMessage) {
        const atUserIds = Array.isArray(message.atUserid) ? message.atUserid : [message.atUserid];
        const isCurrentUserAt = atUserIds.some(id => String(id) === String(currentUser.id));
        if (isCurrentUserAt) {
          setGroupHasAtMe(groupId);
        }
      }
      
      const targetMessages = loading.value 
        ? (cacheGroupMessages[groupId] || (cacheGroupMessages[groupId] = []))
        : (groupMessages.value[groupId] || (groupMessages.value[groupId] = []));
      const exists = targetMessages.some(m => m.id === processedMessage.id);
      const fullExists = fullGroupMessages.value[groupId]?.some(m => m.id === processedMessage.id) || false;
      
      if (!fullExists) {
        if (!fullGroupMessages.value[groupId]) {
          fullGroupMessages.value[groupId] = [processedMessage];
        } else {
          fullGroupMessages.value[groupId].push(processedMessage);
        }
        groupStored.value[groupId] = false;
      }
      
      if (!onlySaveToDB && !exists && !isWithdrawMessage && !isUserInfoUpdateMessage) {
        if (loading.value) {
          cacheGroupMessages[groupId].push(processedMessage);
        } else {
          groupMessages.value[groupId].push(processedMessage);
          groupStored.value[groupId] = false;
        }
      } else if (exists) {
        groupStored.value[groupId] = false;
      }
      if (processedMessage.id > publicAndGroupMinId.value) {
        publicAndGroupMinId.value = processedMessage.id;
      }
    } else if (message.type === 'private') {
      const msgSenderId = String(message.senderId);
      const msgReceiverId = String(message.receiverId);
      const currentUserIdStr = String(currentUser?.id);
      
      const otherUserId = msgSenderId === currentUserIdStr ? msgReceiverId : msgSenderId;
      
      const isWithdrawMessage = processedMessage.messageType === 101;
      const isReadReceiptMessage = processedMessage.messageType === 103;
      
      if (isWithdrawMessage) {
        const messageIdToDelete = processedMessage.content;
        if (messageIdToDelete) {
          deletePrivateMessage(otherUserId, messageIdToDelete);
        }
      } else if (isReadReceiptMessage) {
        const readMessageId = processedMessage.content;
        updatePrivateMessagesReadStatus(otherUserId, readMessageId);
      }
      
      const targetMessages = loading.value 
        ? (cachePrivateMessages[otherUserId] || (cachePrivateMessages[otherUserId] = []))
        : (privateMessages.value[otherUserId] || (privateMessages.value[otherUserId] = []));
      const exists = targetMessages.some(m => m.id === processedMessage.id);
      const fullExists = fullPrivateMessages.value[otherUserId]?.some(m => m.id === processedMessage.id) || false;
      
      if (!fullExists) {
        if (!fullPrivateMessages.value[otherUserId]) {
          fullPrivateMessages.value[otherUserId] = [processedMessage];
        } else {
          fullPrivateMessages.value[otherUserId].push(processedMessage);
        }
        privateStored.value[otherUserId] = false;
      }
      
      if (!onlySaveToDB && !exists && !isWithdrawMessage && !isReadReceiptMessage && !isUserInfoUpdateMessage) {
        if (loading.value) {
          cachePrivateMessages[otherUserId].push(processedMessage);
        } else {
          privateMessages.value[otherUserId].push(processedMessage);
          privateStored.value[otherUserId] = false;
        }
      } else if (exists) {
        privateStored.value[otherUserId] = false;
      }
      if (processedMessage.id > privateMinId.value) {
        privateMinId.value = processedMessage.id;
      }
    }
  }

  async function fetchAndMergeOfflineMessages(onlySaveToDB, context) {
    const { 
      currentUser, 
      currentSessionToken, 
      SERVER_URL,
      isFetchingOfflineMessages,
      showFetchingMessage,
      loading,
      loadUnreadCountsFromLocalStorage,
      loadUnreadCountsFromStorage,
      saveUnreadCountsToLocalStorageDirect,
      currentActiveChat,
      groupsList,
      friendsList,
      sortGroupsByLastMessageTime,
      sortFriendsByLastMessageTime,
      publicMessages,
      groupMessages,
      privateMessages,
      publicStored,
      groupStored,
      privateStored,
      saveToStorage,
      saveMinIds,
      processOfflineMessage
    } = context;

    if (!currentUser || !currentSessionToken) {
      return;
    }

    loadUnreadCountsFromLocalStorage();

    isFetchingOfflineMessages.value = true;
    if (!onlySaveToDB) {
      showFetchingMessage.value = true;
      loading.value = true;
    }

    const userInfoUpdateMessages = [];
    
    const existingPublicMessageIds = new Set(fullPublicMessages.value ? fullPublicMessages.value.map(m => m.id) : []);
    const existingGroupMessageIds = {};
    Object.keys(fullGroupMessages.value).forEach(groupId => {
      existingGroupMessageIds[groupId] = new Set(fullGroupMessages.value[groupId].map(m => m.id));
    });
    const existingPrivateMessageIds = {};
    Object.keys(fullPrivateMessages.value).forEach(userId => {
      existingPrivateMessageIds[userId] = new Set(fullPrivateMessages.value[userId].map(m => m.id));
    });

    try {
      const publicAndGroupMinIdParam = publicAndGroupMinId.value;
      const privateMinIdParam = privateMinId.value;

      const response = await fetch(`${SERVER_URL}/api/offline-messages?publicAndGroupMinId=${publicAndGroupMinIdParam}&privateMinId=${privateMinIdParam}`, {
        headers: {
          'user-id': currentUser.id,
          'session-token': currentSessionToken
        }
      });

      const data = await response.json();

      if (data.status === 'success') {
        if (data.publicMessages && data.publicMessages.length > 0) {
          data.publicMessages.forEach(message => {
            if (message.message_type === 102) {
              userInfoUpdateMessages.push({ ...message, type: 'public' });
            } else {
              processOfflineMessage({ ...message, type: 'public' }, onlySaveToDB);
            }
          });
        }
        if (data.groupMessages && data.groupMessages.length > 0) {
          data.groupMessages.forEach(message => {
            if (message.message_type === 102) {
              userInfoUpdateMessages.push({ ...message, type: 'group' });
            } else {
              processOfflineMessage({ ...message, type: 'group' }, onlySaveToDB);
            }
          });
        }
        if (data.privateMessages && data.privateMessages.length > 0) {
          data.privateMessages.forEach(message => {
            if (message.message_type === 102) {
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
          const newMessages = cachePublicMessages.filter(m => !existingPublicMessageIds.has(m.id));
          
          if (newMessages.length > 0) {
            const isMainChatActive = currentActiveChat.value === 'main';
            const isPageVisible = !document.hidden && document.hasFocus();
            
            if (!isMainChatActive || !isPageVisible) {
              const savedUnreadCounts = loadUnreadCountsFromStorage();
              savedUnreadCounts.global += newMessages.length;
              saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
            }
          }
          
          if (fullPublicMessages.value === null) {
            fullPublicMessages.value = [...newMessages, ...publicMessages.value];
          } else {
            const fullIds = new Set(fullPublicMessages.value.map(m => m.id));
            const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
            fullPublicMessages.value = [...fullNewMessages, ...fullPublicMessages.value];
          }
          
          const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
          const combinedMessages = [...publicMessages.value, ...displayNewMessages];
          publicMessages.value = combinedMessages.slice(Math.max(0, combinedMessages.length - 20), combinedMessages.length);
          cachePublicMessages.length = 0;
        }
        
        Object.keys(cacheGroupMessages).forEach(groupId => {
          if (cacheGroupMessages[groupId]) {
            const existingIds = existingGroupMessageIds[groupId] || new Set();
            const newMessages = cacheGroupMessages[groupId].filter(m => !existingIds.has(m.id));
            
            if (newMessages.length > 0) {
              const isGroupChatActive = currentActiveChat.value === `group_${groupId}`;
              const isPageVisible = !document.hidden && document.hasFocus();
              
              const mutedGroups = JSON.parse(localStorage.getItem('mutedGroups') || '[]');
              const isMuted = mutedGroups.includes(groupId.toString());
              
              if (!isMuted && (!isGroupChatActive || !isPageVisible)) {
                const savedUnreadCounts = loadUnreadCountsFromStorage();
                if (!savedUnreadCounts.groups[groupId]) {
                  savedUnreadCounts.groups[groupId] = 0;
                }
                savedUnreadCounts.groups[groupId] += newMessages.length;
                saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
              }
            }
            
            if (newMessages.length > 0 && groupsList.value) {
              const group = groupsList.value.find(g => String(g.id) === String(groupId));
              if (group && group.deleted_at == null) {
                const lastMessage = newMessages[0];
                const newTime = new Date(lastMessage.timestamp || Date.now()).toISOString();
                group.last_message_time = newTime;
              }
              sortGroupsByLastMessageTime();
            }
            
            if (!fullGroupMessages.value[groupId]) {
              fullGroupMessages.value[groupId] = [...newMessages, ...(groupMessages.value[groupId] || [])];
            } else {
              const fullIds = new Set(fullGroupMessages.value[groupId].map(m => m.id));
              const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
              fullGroupMessages.value[groupId] = [...fullNewMessages, ...fullGroupMessages.value[groupId]];
            }
            
            const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
            const combinedMessages = [...(groupMessages.value[groupId] || []), ...displayNewMessages];
            groupMessages.value[groupId] = combinedMessages.slice(Math.max(0, combinedMessages.length - 20), combinedMessages.length);
          }
        });
        Object.keys(cacheGroupMessages).forEach(key => delete cacheGroupMessages[key]);
        
        Object.keys(cachePrivateMessages).forEach(userId => {
          if (cachePrivateMessages[userId]) {
            const existingIds = existingPrivateMessageIds[userId] || new Set();
            const newMessages = cachePrivateMessages[userId].filter(m => !existingIds.has(m.id));
            
            if (newMessages.length > 0) {
              const isPrivateChatActive = currentActiveChat.value === `private_${userId}`;
              const isPageVisible = !document.hidden && document.hasFocus();
              
              if (!isPrivateChatActive || !isPageVisible) {
                const savedUnreadCounts = loadUnreadCountsFromStorage();
                if (!savedUnreadCounts.private[userId]) {
                  savedUnreadCounts.private[userId] = 0;
                }
                savedUnreadCounts.private[userId] += newMessages.length;
                saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
              }
            }
            
            if (newMessages.length > 0 && friendsList.value) {
              const friend = friendsList.value.find(f => String(f.id) === String(userId));
              if (friend && friend.deleted_at == null) {
                const lastMessage = newMessages[0];
                const newTime = new Date(lastMessage.timestamp || Date.now()).toISOString();
                friend.last_message_time = newTime;
              }
              sortFriendsByLastMessageTime();
            }
            
            if (!fullPrivateMessages.value[userId]) {
              fullPrivateMessages.value[userId] = [...newMessages, ...(privateMessages.value[userId] || [])];
            } else {
              const fullIds = new Set(fullPrivateMessages.value[userId].map(m => m.id));
              const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
              fullPrivateMessages.value[userId] = [...fullNewMessages, ...fullPrivateMessages.value[userId]];
            }
            
            const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
            const combinedMessages = [...(privateMessages.value[userId] || []), ...displayNewMessages];
            privateMessages.value[userId] = combinedMessages.slice(Math.max(0, combinedMessages.length - 20), combinedMessages.length);
          }
        });
        Object.keys(cachePrivateMessages).forEach(key => delete cachePrivateMessages[key]);

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
        if (cachePublicMessages.length > 0) {
          const newMessages = cachePublicMessages.filter(m => !existingPublicMessageIds.has(m.id) && m.messageType !== 101 && m.messageType !== 102);
          
          if (newMessages.length > 0) {
            const isMainChatActive = currentActiveChat.value === 'main';
            const isPageVisible = !document.hidden && document.hasFocus();
            
            if (!isMainChatActive || !isPageVisible) {
              const savedUnreadCounts = loadUnreadCountsFromStorage();
              savedUnreadCounts.global += newMessages.length;
              saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
            }
          }
          
          if (fullPublicMessages.value === null) {
            fullPublicMessages.value = [...cachePublicMessages];
          } else {
            const fullIds = new Set(fullPublicMessages.value.map(m => m.id));
            const fullNewMessages = cachePublicMessages.filter(m => !fullIds.has(m.id));
            fullPublicMessages.value = [...fullPublicMessages.value, ...fullNewMessages];
          }
          cachePublicMessages.length = 0;
        }
        
        Object.keys(cacheGroupMessages).forEach(groupId => {
          if (cacheGroupMessages[groupId]) {
            const existingIds = existingGroupMessageIds[groupId] || new Set();
            const newMessages = cacheGroupMessages[groupId].filter(m => !existingIds.has(m.id) && m.messageType !== 101 && m.messageType !== 102);
            
            if (newMessages.length > 0) {
              const isGroupChatActive = currentActiveChat.value === `group_${groupId}`;
              const isPageVisible = !document.hidden && document.hasFocus();
              
              const mutedGroups = JSON.parse(localStorage.getItem('mutedGroups') || '[]');
              const isMuted = mutedGroups.includes(groupId.toString());
              
              if (!isMuted && (!isGroupChatActive || !isPageVisible)) {
                const savedUnreadCounts = loadUnreadCountsFromStorage();
                if (!savedUnreadCounts.groups[groupId]) {
                  savedUnreadCounts.groups[groupId] = 0;
                }
                savedUnreadCounts.groups[groupId] += newMessages.length;
                saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
              }
            }
            
            if (!fullGroupMessages.value[groupId]) {
              fullGroupMessages.value[groupId] = [...cacheGroupMessages[groupId]];
            } else {
              const fullIds = new Set(fullGroupMessages.value[groupId].map(m => m.id));
              const fullNewMessages = cacheGroupMessages[groupId].filter(m => !fullIds.has(m.id));
              fullGroupMessages.value[groupId] = [...fullGroupMessages.value[groupId], ...fullNewMessages];
            }
          }
        });
        Object.keys(cacheGroupMessages).forEach(key => delete cacheGroupMessages[key]);
        
        Object.keys(cachePrivateMessages).forEach(userId => {
          if (cachePrivateMessages[userId]) {
            const existingIds = existingPrivateMessageIds[userId] || new Set();
            const newMessages = cachePrivateMessages[userId].filter(m => !existingIds.has(m.id) && m.messageType !== 101 && m.messageType !== 102);
            
            if (newMessages.length > 0) {
              const isPrivateChatActive = currentActiveChat.value === `private_${userId}`;
              const isPageVisible = !document.hidden && document.hasFocus();
              
              if (!isPrivateChatActive || !isPageVisible) {
                const savedUnreadCounts = loadUnreadCountsFromStorage();
                if (!savedUnreadCounts.private[userId]) {
                  savedUnreadCounts.private[userId] = 0;
                }
                savedUnreadCounts.private[userId] += newMessages.length;
                saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
              }
            }
            
            if (!fullPrivateMessages.value[userId]) {
              fullPrivateMessages.value[userId] = [...cachePrivateMessages[userId]];
            } else {
              const fullIds = new Set(fullPrivateMessages.value[userId].map(m => m.id));
              const fullNewMessages = cachePrivateMessages[userId].filter(m => !fullIds.has(m.id));
              fullPrivateMessages.value[userId] = [...fullPrivateMessages.value[userId], ...fullNewMessages];
            }
          }
        });
        Object.keys(cachePrivateMessages).forEach(key => delete cachePrivateMessages[key]);

        publicStored.value = false;
        Object.keys(fullGroupMessages.value).forEach(id => groupStored.value[id] = false);
        Object.keys(fullPrivateMessages.value).forEach(id => privateStored.value[id] = false);
        await saveToStorage();

        if (userInfoUpdateMessages.length > 0) {
          userInfoUpdateMessages.forEach(message => {
            processOfflineMessage(message, onlySaveToDB);
          });
        }
        
        await saveMinIds();
        
        isFetchingOfflineMessages.value = false;
      }
      
      loadUnreadCountsFromLocalStorage();
    }
  }

  async function initializeMessages(context) {
    const { showFetchingMessage, loadUnreadCountsFromLocalStorage, loadMinIds, loadMessages, fetchAndMergeOfflineMessages } = context;
    
    showFetchingMessage.value = true;

    try {
      loadUnreadCountsFromLocalStorage();
      await loadMinIds();
      await loadMessages(false);
      await fetchAndMergeOfflineMessages(false);
      await loadMessages(true);
      showFetchingMessage.value = false;
    } catch (error) {
      console.error('初始化消息流程失败:', error);
      showFetchingMessage.value = false;
    }
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
    
    if (msgType === 100) {
      if (typeof content === 'string' && content.startsWith('{')) {
        try {
          const parsed = JSON.parse(content);
          return parsed.content || '';
        } catch {
        }
      }
      return content || '';
    } else if (msgType === 4) {
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

  async function clearAllDeletedSessions(context) {
    const { getStorageKeyPrefix, groupsList, friendsList, fullGroupMessages, fullPrivateMessages, groupMessages, privateMessages, groupStored, privateStored, publicStored, loadUnreadCountsFromLocalStorage, saveUnreadCountsToLocalStorage, saveToStorage } = context;
    
    try {
      const prefix = getStorageKeyPrefix();
      
      const deletedGroupIds = [];
      const deletedFriendIds = [];
      
      if (groupsList.value) {
        groupsList.value.forEach(g => {
          if (g.deleted_at) {
            deletedGroupIds.push(String(g.id));
          }
        });
      }
      
      if (friendsList.value) {
        friendsList.value.forEach(f => {
          if (f.deleted_at) {
            deletedFriendIds.push(String(f.id));
          }
        });
      }
      
      if (groupsList.value) {
        groupsList.value = groupsList.value.filter(g => !g.deleted_at);
      }
      
      if (friendsList.value) {
        friendsList.value = friendsList.value.filter(f => !f.deleted_at);
      }
      
      const chatKeysData = await localForage.getItem(prefix);
      if (chatKeysData && chatKeysData.chatKeys) {
        const rawChatKeysData = toRaw(chatKeysData);
        for (const key of rawChatKeysData.chatKeys) {
          if (key.includes('-group-') || key.includes('-private-')) {
            const sessionData = await localForage.getItem(key);
            if (sessionData && sessionData.deleted_at) {
              await localForage.removeItem(key);
            }
          }
        }
        
        const remainingKeys = [];
        for (const key of rawChatKeysData.chatKeys) {
          if (key.includes('-group-') || key.includes('-private-')) {
            const sessionData = await localForage.getItem(key);
            if (!sessionData || !sessionData.deleted_at) {
              remainingKeys.push(key);
            }
          } else {
            remainingKeys.push(key);
          }
        }
        await localForage.setItem(prefix, { chatKeys: remainingKeys });
      }
      
      Object.keys(fullGroupMessages.value).forEach(groupId => {
        const group = groupsList.value?.find(g => String(g.id) === String(groupId));
        if (!group || group.deleted_at) {
          delete fullGroupMessages.value[groupId];
          delete groupMessages.value[groupId];
          groupStored.value[groupId] = true;
        }
      });
      
      Object.keys(fullPrivateMessages.value).forEach(userId => {
        const friend = friendsList.value?.find(f => String(f.id) === String(userId));
        if (!friend || friend.deleted_at) {
          delete fullPrivateMessages.value[userId];
          delete privateMessages.value[userId];
          privateStored.value[userId] = true;
        }
      });
      
      loadUnreadCountsFromLocalStorage();
      
      deletedGroupIds.forEach(groupId => {
        if (unreadMessages.value.groups[groupId]) {
          delete unreadMessages.value.groups[groupId];
        }
      });
      
      deletedFriendIds.forEach(userId => {
        if (unreadMessages.value.private[userId]) {
          delete unreadMessages.value.private[userId];
        }
      });
      
      saveUnreadCountsToLocalStorage();
      
      publicStored.value = false;
      saveToStorage();
      
      return true;
    } catch (error) {
      console.error('清除已删除会话失败:', error);
      throw error;
    }
  }

  function getGroupLastMessage(groupId) {
    const messages = fullGroupMessages.value[groupId] || [];
    const validMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
    if (validMessages.length === 0) return null;
    return validMessages[validMessages.length - 1];
  }

  function getPrivateLastMessage(userId) {
    const messages = fullPrivateMessages.value[userId] || [];
    const validMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);
    if (validMessages.length === 0) return null;
    return validMessages[validMessages.length - 1];
  }

  function clearAllCache() {
    cachePublicMessages.length = 0;
    Object.keys(cacheGroupMessages).forEach(key => delete cacheGroupMessages[key]);
    Object.keys(cachePrivateMessages).forEach(key => delete cachePrivateMessages[key]);
    fullPublicMessages.value = null;
    fullGroupMessages.value = {};
    fullPrivateMessages.value = {};
    publicAndGroupMinId.value = 0;
    privateMinId.value = 0;
  }

  return {
    publicAndGroupMinId,
    privateMinId,
    saveToStorage,
    loadMessages,
    clearMessages,
    saveMinIds,
    loadMinIds,
    refreshMessages,
    processOfflineMessage,
    fetchAndMergeOfflineMessages,
    initializeMessages,
    formatMessageContent,
    clearAllDeletedSessions,
    getGroupLastMessage,
    getPrivateLastMessage,
    fullPublicMessages,
    fullGroupMessages,
    fullPrivateMessages,
    cachePublicMessages,
    cacheGroupMessages,
    cachePrivateMessages,
    clearAllCache
  };
}
