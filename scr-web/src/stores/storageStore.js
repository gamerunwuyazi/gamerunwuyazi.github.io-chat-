import { defineStore } from 'pinia';
import { ref, toRaw } from 'vue';
import localForage from 'localforage';
import { useUserStore } from './userStore';
import { useFriendStore } from './friendStore';
import { useGroupStore } from './groupStore';
import { usePublicStore } from './publicStore';
import { useSessionStore } from './sessionStore';
import { useUnreadStore } from './unreadStore';
import { useBaseStore } from './baseStore';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

let cachePublicMessages = [];
let cacheGroupMessages = {};
let cachePrivateMessages = {};

export const useStorageStore = defineStore('storage', () => {
  const fullPublicMessages = ref(null);
  const fullGroupMessages = ref({});
  const fullPrivateMessages = ref({});
  const sessionLastMessageTimes = ref({ groups: {}, friends: {} });
  const publicAndGroupMinId = ref(0);
  const privateMinId = ref(0);

  function getStorageKeyPrefix() {
    const baseStore = useBaseStore();
    const userId = baseStore.currentUser?.id || 'guest';
    return `chats-${userId}`;
  }

  async function saveToStorage() {
    const baseStore = useBaseStore();
    const groupStore = useGroupStore();
    const friendStore = useFriendStore();
    const publicStore = usePublicStore();

    if (baseStore.loading) return;

    const prefix = getStorageKeyPrefix();

    try {
      if (publicStore && !publicStore.publicStored) {
        const messagesToSave = fullPublicMessages.value !== null ? fullPublicMessages.value : [];
        const messages = messagesToSave.map(msg => toRaw(msg));
        await localForage.setItem(`${prefix}-public`, { messages });
        publicStore.publicStored = true;
      }

      for (const [groupId, messages] of Object.entries(fullGroupMessages.value)) {
        if (groupStore && !groupStore.groupStored[groupId]) {
          const msgs = messages.map(msg => toRaw(msg));
          const key = `${prefix}-group-${groupId}`;
          let sessionData = await localForage.getItem(key) || { messages: [] };
          sessionData = { ...toRaw(sessionData), messages: msgs };
          if (groupStore.groupsList) {
            const groupInfo = groupStore.groupsList.find(g => String(g.id) === String(groupId));
            if (groupInfo) {
              const rawGroupInfo = toRaw(groupInfo);
              if (rawGroupInfo.name) sessionData.name = rawGroupInfo.name;
              if (rawGroupInfo.avatarUrl) sessionData.avatarUrl = rawGroupInfo.avatarUrl;
              if (rawGroupInfo.deleted_at) sessionData.deleted_at = rawGroupInfo.deleted_at;
            }
          }
          const trackedTime = sessionLastMessageTimes.value.groups[groupId];
          if (trackedTime) sessionData.last_message_time = trackedTime;
          await localForage.setItem(key, sessionData);
          groupStore.groupStored[groupId] = true;
        }
      }

      for (const [userId, messages] of Object.entries(fullPrivateMessages.value)) {
        if (friendStore && !friendStore.privateStored[userId]) {
          const msgs = messages.map(msg => toRaw(msg));
          const key = `${prefix}-private-${userId}`;
          let sessionData = await localForage.getItem(key) || { messages: [] };
          sessionData = { ...toRaw(sessionData), messages: msgs };
          if (friendStore.friendsList) {
            const friendInfo = friendStore.friendsList.find(f => String(f.id) === String(userId));
            if (friendInfo) {
              const rawFriendInfo = toRaw(friendInfo);
              if (rawFriendInfo.nickname) sessionData.nickname = rawFriendInfo.nickname;
              if (rawFriendInfo.avatarUrl) sessionData.avatarUrl = rawFriendInfo.avatarUrl;
              if (rawFriendInfo.deleted_at) sessionData.deleted_at = rawFriendInfo.deleted_at;
            }
          }
          const trackedTime = sessionLastMessageTimes.value.friends[userId];
          if (trackedTime) sessionData.last_message_time = trackedTime;
          await localForage.setItem(key, sessionData);
          friendStore.privateStored[userId] = true;
        }
      }

      const chatKeys = [
        `${prefix}-public`,
        ...Object.keys(fullGroupMessages.value).map(id => `${prefix}-group-${id}`),
        ...Object.keys(fullPrivateMessages.value).map(id => `${prefix}-private-${id}`)
      ];
      await localForage.setItem(prefix, { chatKeys });
    } catch (err) {
      console.error('保存到存储失败:', err);
    }
  }

  async function updateSessionLastMessageTime(sessionType, sessionId, lastMessageTime) {
    const baseStore = useBaseStore();
    const groupStore = useGroupStore();
    const friendStore = useFriendStore();

    if (baseStore.loading) return;

    const prefix = getStorageKeyPrefix();

    try {
      if (sessionType === 'group') {
        sessionLastMessageTimes.value.groups[sessionId] = lastMessageTime;
        const key = `${prefix}-group-${sessionId}`;
        let sessionData = await localForage.getItem(key) || { messages: [] };
        sessionData.last_message_time = lastMessageTime;
        if (fullGroupMessages.value && fullGroupMessages.value[sessionId]) {
          const msgs = fullGroupMessages.value[sessionId].map(msg => toRaw(msg));
          sessionData.messages = msgs;
        }
        if (groupStore.groupsList) {
          const groupInfo = groupStore.groupsList.find(g => String(g.id) === String(sessionId));
          if (groupInfo) {
            const rawGroupInfo = toRaw(groupInfo);
            if (rawGroupInfo.name) sessionData.name = rawGroupInfo.name;
            if (rawGroupInfo.avatarUrl) sessionData.avatarUrl = rawGroupInfo.avatarUrl;
            if (rawGroupInfo.deleted_at) sessionData.deleted_at = rawGroupInfo.deleted_at;
          }
        }
        await localForage.setItem(key, sessionData);
      } else if (sessionType === 'friend') {
        sessionLastMessageTimes.value.friends[sessionId] = lastMessageTime;
        const key = `${prefix}-private-${sessionId}`;
        let sessionData = await localForage.getItem(key) || { messages: [] };
        sessionData.last_message_time = lastMessageTime;
        if (fullPrivateMessages.value && fullPrivateMessages.value[sessionId]) {
          const msgs = fullPrivateMessages.value[sessionId].map(msg => toRaw(msg));
          sessionData.messages = msgs;
        }
        if (friendStore.friendsList) {
          const friendInfo = friendStore.friendsList.find(f => String(f.id) === String(sessionId));
          if (friendInfo) {
            const rawFriendInfo = toRaw(friendInfo);
            if (rawFriendInfo.nickname) sessionData.nickname = rawFriendInfo.nickname;
            if (rawFriendInfo.avatarUrl) sessionData.avatarUrl = rawFriendInfo.avatarUrl;
            if (rawFriendInfo.deleted_at) sessionData.deleted_at = rawFriendInfo.deleted_at;
          }
        }
        await localForage.setItem(key, sessionData);
      }
    } catch (err) {
      console.error('更新会话最后消息时间失败:', err);
    }
  }

  async function loadMessages(loadToStore) {
    const publicStore = usePublicStore();
    const groupStore = useGroupStore();
    const friendStore = useFriendStore();

    const prefix = getStorageKeyPrefix();
    
    await loadMinIds();

    const data = await localForage.getItem(prefix);
    
    if (!data || !data.chatKeys) {
      return;
    }
    
    const promises = data.chatKeys.map(key => localForage.getItem(key));
    const results = await Promise.all(promises);

    for (let i = 0; i < results.length; i++) {
      const itemData = results[i];
      const key = data.chatKeys[i];
      
      if (!itemData) {
        continue;
      }

      const messages = itemData.messages || [];

      if (key.includes('-public')) {
        const checkedMessages = checkAndFixQuotedMessages(messages, 'public');
        fullPublicMessages.value = [...checkedMessages];
        if (loadToStore) {
          const filteredMessages = checkedMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
          publicStore.publicMessages = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
        }
      } else if (key.includes('-group-')) {
        const groupId = key.split('-group-')[1];
        const checkedMessages = checkAndFixQuotedMessages(messages, 'group', groupId);
        fullGroupMessages.value[groupId] = [...checkedMessages];
        if (loadToStore) {
          const filteredMessages = checkedMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
          groupStore.groupMessages[groupId] = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
        }
      } else if (key.includes('-private-')) {
        const userId = key.split('-private-')[1];
        const checkedMessages = checkAndFixQuotedMessages(messages, 'private', userId);
        fullPrivateMessages.value[userId] = [...checkedMessages];
        if (loadToStore) {
          const filteredMessages = checkedMessages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);
          friendStore.privateMessages[userId] = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
        }
      }
    }

    publicStore.publicStored = true;
    Object.keys(groupStore.groupMessages).forEach(id => { groupStore.groupStored[id] = true; });
    Object.keys(friendStore.privateMessages).forEach(id => { friendStore.privateStored[id] = true; });
  }

  function clearMessages() {
    const publicStore = usePublicStore();
    const groupStore = useGroupStore();
    const friendStore = useFriendStore();

    cachePublicMessages.length = 0;
    Object.keys(cacheGroupMessages).forEach(key => delete cacheGroupMessages[key]);
    Object.keys(cachePrivateMessages).forEach(key => delete cachePrivateMessages[key]);
    publicStore.publicMessages = [];
    groupStore.groupMessages = {};
    friendStore.privateMessages = {};
    publicStore.publicStored = false;
    groupStore.groupStored = {};
    friendStore.privateStored = {};
    fullPublicMessages.value = null;
    fullGroupMessages.value = {};
    fullPrivateMessages.value = {};
    sessionLastMessageTimes.value = { groups: {}, friends: {} };
  }

  async function saveMinIds() {
    try {
      const prefix = getStorageKeyPrefix();
      await localForage.setItem(`${prefix}-minIds`, {
        publicAndGroupMinId: toRaw(publicAndGroupMinId.value),
        privateMinId: toRaw(privateMinId.value)
      });
    } catch (err) {
      console.error('保存minIds失败:', err);
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
      console.error('加载minIds失败:', err);
    }
  }

  function refreshMessages() {
    const publicStore = usePublicStore();
    const groupStore = useGroupStore();
    const friendStore = useFriendStore();

    if (cachePublicMessages.length > 0) {
      publicStore.publicMessages = cachePublicMessages;
      cachePublicMessages = [];
    }

    Object.keys(cacheGroupMessages).forEach(groupId => {
      if (cacheGroupMessages[groupId]) groupStore.groupMessages[groupId] = cacheGroupMessages[groupId];
    });
    cacheGroupMessages = {};

    Object.keys(cachePrivateMessages).forEach(userId => {
      if (cachePrivateMessages[userId]) friendStore.privateMessages[userId] = cachePrivateMessages[userId];
    });
    cachePrivateMessages = {};

    publicStore.publicStored = false;
    Object.keys(groupStore.groupMessages).forEach(id => { groupStore.groupStored[id] = false; });
    Object.keys(friendStore.privateMessages).forEach(id => { friendStore.privateStored[id] = false; });
    saveToStorage();
  }

  async function processOfflineMessage(message, onlySaveToDB) {
    const baseStore = useBaseStore();
    const userStore = useUserStore();
    const friendStore = useFriendStore();
    const groupStore = useGroupStore();
    const publicStore = usePublicStore();

    const processedMessage = {
      id: Number(message.id),
      userId: Number(message.userId),
      nickname: message.nickname,
      avatarUrl: message.avatarUrl,
      content: message.content,
      messageType: Number(message.messageType),
      timestamp: message.timestamp,
      type: message.type
    };

    if (message.type === 'public') {
      if (message.atUserid !== undefined && message.atUserid !== null) {
        const atUserid = Array.isArray(message.atUserid) ? message.atUserid : [message.atUserid];
        if (atUserid.length > 0) {
          processedMessage.atUserid = atUserid.map(id => Number(id));
        }
      }
    } else if (message.type === 'group') {
      if (message.atUserid !== undefined && message.atUserid !== null) {
        const atUserid = Array.isArray(message.atUserid) ? message.atUserid : [message.atUserid];
        if (atUserid.length > 0) {
          processedMessage.atUserid = atUserid.map(id => Number(id));
        }
      }
      processedMessage.groupId = Number(message.groupId);
    } else if (message.type === 'private') {
      processedMessage.senderId = Number(message.senderId);
      processedMessage.receiverId = Number(message.receiverId);
      processedMessage.isRead = message.isRead;
      delete processedMessage.userId;
    }

    const isUserInfoUpdateMessage = processedMessage.messageType === 102;
    if (isUserInfoUpdateMessage) {
      try {
        const updateData = JSON.parse(processedMessage.content);
        const userId = processedMessage.userId;
        if (updateData.type === 'nickname' && updateData.nickname) {
          if (userStore.onlineUsers) {
            const userIndex = userStore.onlineUsers.findIndex(u => String(u.id) === String(userId));
            if (userIndex !== -1) {
              userStore.onlineUsers[userIndex].nickname = updateData.nickname;
            }
          }
          if (friendStore.friendsList) {
            const friendIndex = friendStore.friendsList.findIndex(f => String(f.id) === String(userId));
            if (friendIndex !== -1) {
              friendStore.friendsList[friendIndex].nickname = updateData.nickname;
              friendStore.friendsList = [...friendStore.friendsList];
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
            console.error('更新IndexedDB中的好友昵称失败:', e);
          }
          updateUserInfoInMessages(userId, { nickname: updateData.nickname });
        } else if (updateData.type === 'avatar' && updateData.avatar_url) {
          if (userStore.onlineUsers) {
            const userIndex = userStore.onlineUsers.findIndex(u => String(u.id) === String(userId));
            if (userIndex !== -1) {
              userStore.onlineUsers[userIndex].avatar = updateData.avatar_url;
              userStore.onlineUsers[userIndex].avatarUrl = updateData.avatar_url;
              userStore.onlineUsers[userIndex].avatar_url = updateData.avatar_url;
            }
          }
          if (friendStore.friendsList) {
            const friendIndex = friendStore.friendsList.findIndex(f => String(f.id) === String(userId));
            if (friendIndex !== -1) {
              friendStore.friendsList[friendIndex].avatarUrl = updateData.avatar_url;
              friendStore.friendsList[friendIndex].avatar_url = updateData.avatar_url;
              friendStore.friendsList[friendIndex].avatar = updateData.avatar_url;
              friendStore.friendsList = [...friendStore.friendsList];
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
            console.error('更新IndexedDB中的好友头像失败:', e);
          }
          updateUserInfoInMessages(userId, { avatarUrl: updateData.avatar_url });
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
          if (fullPublicMessages.value !== null && fullPublicMessages.value !== undefined) {
            const updates = fixQuotedMessagesForWithdrawn(messageIdToDelete, fullPublicMessages.value);
            updates.forEach(update => {
              const index = publicStore.publicMessages?.findIndex(m => String(m.id) === String(update.messageId));
              if (index !== -1) {
                publicStore.publicMessages[index] = toRaw({
                  ...toRaw(publicStore.publicMessages[index]),
                  content: update.newContent
                });
              }
              const fullIndex = fullPublicMessages.value.findIndex(m => String(m.id) === String(update.messageId));
              if (fullIndex !== -1) {
                fullPublicMessages.value[fullIndex] = toRaw({
                  ...toRaw(fullPublicMessages.value[fullIndex]),
                  content: update.newContent
                });
              }
            });
            if (updates.length > 0) {
              publicStore.publicStored = false;
            }
          }
          const targetIndex = fullPublicMessages.value?.findIndex(m => String(m.id) === String(messageIdToDelete));
          if (targetIndex !== -1) {
            fullPublicMessages.value[targetIndex] = toRaw({
              ...toRaw(fullPublicMessages.value[targetIndex]),
              content: `${processedMessage.nickname || '某人'}撤回了一条消息`,
              isRecalled: true,
              isSystemMessage: true
            });
            publicStore.publicStored = false;
          }
          const displayIndex = publicStore.publicMessages?.findIndex(m => String(m.id) === String(messageIdToDelete));
          if (displayIndex !== -1) {
            publicStore.publicMessages[displayIndex] = toRaw({
              ...toRaw(publicStore.publicMessages[displayIndex]),
              content: `${processedMessage.nickname || '某人'}撤回了一条消息`,
              isRecalled: true,
              isSystemMessage: true
            });
          }
        }
      }
      const targetMessages = baseStore.loading ? cachePublicMessages : (publicStore.publicMessages || []);
      const exists = targetMessages.some(m => m.id === processedMessage.id);
      const fullExists = fullPublicMessages.value?.some(m => m.id === processedMessage.id) || false;

      if (!fullExists) {
        if (fullPublicMessages.value === null) {
          fullPublicMessages.value = [processedMessage];
        } else {
          fullPublicMessages.value.push(processedMessage);
        }
        publicStore.publicStored = false;
      }

      if (!onlySaveToDB && !exists && !isWithdrawMessage && !isUserInfoUpdateMessage) {
        if (baseStore.loading) {
          cachePublicMessages.push(processedMessage);
        } else {
          publicStore.publicMessages.push(processedMessage);
          publicStore.publicStored = false;
        }
      } else if (exists) {
        publicStore.publicStored = false;
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
          if (fullGroupMessages.value && fullGroupMessages.value[groupId]) {
            const updates = fixQuotedMessagesForWithdrawn(messageIdToDelete, fullGroupMessages.value[groupId]);
            updates.forEach(update => {
              if (groupStore.groupMessages[groupId]) {
                const index = groupStore.groupMessages[groupId].findIndex(m => String(m.id) === String(update.messageId));
                if (index !== -1) {
                  groupStore.groupMessages[groupId][index] = toRaw({
                    ...toRaw(groupStore.groupMessages[groupId][index]),
                    content: update.newContent
                  });
                }
              }
              const fullIndex = fullGroupMessages.value[groupId].findIndex(m => String(m.id) === String(update.messageId));
              if (fullIndex !== -1) {
                fullGroupMessages.value[groupId][fullIndex] = toRaw({
                  ...toRaw(fullGroupMessages.value[groupId][fullIndex]),
                  content: update.newContent
                });
              }
            });
            if (updates.length > 0) {
              groupStore.groupStored[groupId] = false;
            }
          }
          const targetIndex = fullGroupMessages.value[groupId]?.findIndex(m => String(m.id) === String(messageIdToDelete));
          if (targetIndex !== -1) {
            fullGroupMessages.value[groupId][targetIndex] = toRaw({
              ...toRaw(fullGroupMessages.value[groupId][targetIndex]),
              content: `${processedMessage.nickname || '某人'}撤回了一条消息`,
              isRecalled: true,
              isSystemMessage: true
            });
            groupStore.groupStored[groupId] = false;
          }
          const displayIndex = groupStore.groupMessages[groupId]?.findIndex(m => String(m.id) === String(messageIdToDelete));
          if (displayIndex !== -1) {
            groupStore.groupMessages[groupId][displayIndex] = toRaw({
              ...toRaw(groupStore.groupMessages[groupId][displayIndex]),
              content: `${processedMessage.nickname || '某人'}撤回了一条消息`,
              isRecalled: true,
              isSystemMessage: true
            });
          }
        }
      }

      if (message.atUserid && baseStore.currentUser && !isWithdrawMessage) {
        const atUserIds = Array.isArray(message.atUserid) ? message.atUserid : [message.atUserid];
        const isCurrentUserAt = atUserIds.some(id => String(id) === String(baseStore.currentUser.id));
        if (isCurrentUserAt) {
          groupStore.setGroupHasAtMe(groupId);
        }
      }

      const targetMessages = baseStore.loading
        ? (cacheGroupMessages[groupId] || (cacheGroupMessages[groupId] = []))
        : (groupStore.groupMessages[groupId] || (groupStore.groupMessages[groupId] = []));
      const exists = targetMessages.some(m => m.id === processedMessage.id);
      const fullExists = fullGroupMessages.value[groupId]?.some(m => m.id === processedMessage.id) || false;

      if (!fullExists) {
        if (!fullGroupMessages.value[groupId]) {
          fullGroupMessages.value[groupId] = [processedMessage];
        } else {
          fullGroupMessages.value[groupId].push(processedMessage);
        }
        groupStore.groupStored[groupId] = false;
      }

      if (!onlySaveToDB && !exists && !isWithdrawMessage && !isUserInfoUpdateMessage) {
        if (baseStore.loading) {
          cacheGroupMessages[groupId].push(processedMessage);
        } else {
          groupStore.groupMessages[groupId].push(processedMessage);
          groupStore.groupStored[groupId] = false;
        }
      } else if (exists) {
        groupStore.groupStored[groupId] = false;
      }
      if (processedMessage.id > publicAndGroupMinId.value) {
        publicAndGroupMinId.value = processedMessage.id;
      }

      if (!isWithdrawMessage && !isUserInfoUpdateMessage) {
        const newTime = new Date(processedMessage.timestamp || Date.now()).toISOString();
        const existingTime = sessionLastMessageTimes.value.groups[groupId];
        if (!existingTime || new Date(newTime) > new Date(existingTime)) {
          sessionLastMessageTimes.value.groups[groupId] = newTime;
        }
        if (groupStore.groupsList) {
          const group = groupStore.groupsList.find(g => String(g.id) === String(groupId));
          if (group && group.deleted_at == null) {
            group.session_last_active_time = newTime;
            groupStore.sortGroupsByLastMessageTime();
          }
        }
      }
    } else if (message.type === 'private') {
      const msgSenderId = String(message.senderId);
      const msgReceiverId = String(message.receiverId);
      const currentUserIdStr = String(baseStore.currentUser?.id);

      const otherUserId = msgSenderId === currentUserIdStr ? msgReceiverId : msgSenderId;

      const isWithdrawMessage = processedMessage.messageType === 101;
      const isReadReceiptMessage = processedMessage.messageType === 103;

      if (isWithdrawMessage) {
        const messageIdToDelete = processedMessage.content;
        if (messageIdToDelete) {
          if (fullPrivateMessages.value && fullPrivateMessages.value[otherUserId]) {
            const updates = fixQuotedMessagesForWithdrawn(messageIdToDelete, fullPrivateMessages.value[otherUserId]);
            updates.forEach(update => {
              if (friendStore.privateMessages[otherUserId]) {
                const index = friendStore.privateMessages[otherUserId].findIndex(m => String(m.id) === String(update.messageId));
                if (index !== -1) {
                  friendStore.privateMessages[otherUserId][index] = toRaw({
                    ...toRaw(friendStore.privateMessages[otherUserId][index]),
                    content: update.newContent
                  });
                }
              }
              const fullIndex = fullPrivateMessages.value[otherUserId].findIndex(m => String(m.id) === String(update.messageId));
              if (fullIndex !== -1) {
                fullPrivateMessages.value[otherUserId][fullIndex] = toRaw({
                  ...toRaw(fullPrivateMessages.value[otherUserId][fullIndex]),
                  content: update.newContent
                });
              }
            });
            if (updates.length > 0) {
              friendStore.privateStored[otherUserId] = false;
            }
          }
          const targetIndex = fullPrivateMessages.value[otherUserId]?.findIndex(m => String(m.id) === String(messageIdToDelete));
          if (targetIndex !== -1) {
            fullPrivateMessages.value[otherUserId][targetIndex] = toRaw({
              ...toRaw(fullPrivateMessages.value[otherUserId][targetIndex]),
              content: `${processedMessage.nickname || '某人'}撤回了一条消息`,
              isRecalled: true,
              isSystemMessage: true
            });
            friendStore.privateStored[otherUserId] = false;
          }
          const displayIndex = friendStore.privateMessages[otherUserId]?.findIndex(m => String(m.id) === String(messageIdToDelete));
          if (displayIndex !== -1) {
            friendStore.privateMessages[otherUserId][displayIndex] = toRaw({
              ...toRaw(friendStore.privateMessages[otherUserId][displayIndex]),
              content: `${processedMessage.nickname || '某人'}撤回了一条消息`,
              isRecalled: true,
              isSystemMessage: true
            });
          }
        }
      } else if (isReadReceiptMessage) {
        const readMessageId = processedMessage.content;
        friendStore.updatePrivateMessagesReadStatus(otherUserId, readMessageId);
      }

      const targetMessages = baseStore.loading
        ? (cachePrivateMessages[otherUserId] || (cachePrivateMessages[otherUserId] = []))
        : (friendStore.privateMessages[otherUserId] || (friendStore.privateMessages[otherUserId] = []));
      const exists = targetMessages.some(m => m.id === processedMessage.id);
      const fullExists = fullPrivateMessages.value[otherUserId]?.some(m => m.id === processedMessage.id) || false;

      if (!fullExists) {
        if (!fullPrivateMessages.value[otherUserId]) {
          fullPrivateMessages.value[otherUserId] = [processedMessage];
        } else {
          fullPrivateMessages.value[otherUserId].push(processedMessage);
        }
        friendStore.privateStored[otherUserId] = false;
      }

      if (!onlySaveToDB && !exists && !isWithdrawMessage && !isReadReceiptMessage && !isUserInfoUpdateMessage) {
        if (baseStore.loading) {
          cachePrivateMessages[otherUserId].push(processedMessage);
        } else {
          friendStore.privateMessages[otherUserId].push(processedMessage);
          friendStore.privateStored[otherUserId] = false;
        }
      } else if (exists) {
        friendStore.privateStored[otherUserId] = false;
      }
      if (processedMessage.id > privateMinId.value) {
        privateMinId.value = processedMessage.id;
      }

      if (!isWithdrawMessage && !isReadReceiptMessage && !isUserInfoUpdateMessage) {
        const newTime = new Date(processedMessage.timestamp || Date.now()).toISOString();
        const existingTime = sessionLastMessageTimes.value.friends[otherUserId];
        if (!existingTime || new Date(newTime) > new Date(existingTime)) {
          sessionLastMessageTimes.value.friends[otherUserId] = newTime;
        }
        if (friendStore.friendsList) {
          const friend = friendStore.friendsList.find(f => String(f.id) === String(otherUserId));
          if (friend && friend.deleted_at == null) {
            friend.session_last_active_time = newTime;
            friendStore.sortFriendsByLastMessageTime();
          }
        }
      }
    }
  }

  async function fetchAndMergeOfflineMessages(onlySaveToDB) {
    const baseStore = useBaseStore();
    const friendStore = useFriendStore();
    const groupStore = useGroupStore();
    const publicStore = usePublicStore();
    const unreadStore = useUnreadStore();

    const currentUser = baseStore.currentUser;
    const currentSessionToken = baseStore.currentSessionToken;

    if (!currentUser || !currentSessionToken) {
      return;
    }

    if (unreadStore.loadUnreadCountsFromLocalStorage) {
      unreadStore.loadUnreadCountsFromLocalStorage();
    }

    baseStore.isFetchingOfflineMessages = true;
    if (!onlySaveToDB) {
      baseStore.showFetchingMessage = true;
      baseStore.loading = true;
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
        
        baseStore.hasReceivedHistory = true;
        baseStore.hasReceivedGroupHistory = true;
        baseStore.hasReceivedPrivateHistory = true;
      }
    } catch (error) {
      console.error('获取离线消息失败:', error);
    } finally {
      if (!onlySaveToDB) {
        baseStore.loading = false;
        baseStore.isFetchingOfflineMessages = false;

        if (cachePublicMessages.length > 0) {
          const newMessages = cachePublicMessages.filter(m => !existingPublicMessageIds.has(m.id));

          if (newMessages.length > 0) {
            const sessionStore = useSessionStore();
            const isMainChatActive = sessionStore.currentActiveChat === 'main';
            const isPageVisible = !document.hidden && document.hasFocus();

            const otherUserMessages = newMessages.filter(m => String(m.sender_id) !== String(currentUser?.id));

            if (!isMainChatActive || !isPageVisible) {
              if (otherUserMessages.length > 0) {
                const savedUnreadCounts = unreadStore.loadUnreadCountsFromStorage ? unreadStore.loadUnreadCountsFromStorage() : { global: 0, groups: {}, private: {} };
                savedUnreadCounts.global += otherUserMessages.length;
                if (unreadStore.saveUnreadCountsToLocalStorageDirect) unreadStore.saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
              }
            }
          }

          if (fullPublicMessages.value === null) {
            fullPublicMessages.value = [...newMessages, ...(publicStore.publicMessages || [])];
          } else {
            const fullIds = new Set(fullPublicMessages.value.map(m => m.id));
            const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
            fullPublicMessages.value = [...fullNewMessages, ...fullPublicMessages.value];
          }

          const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
          const combinedMessages = [...publicStore.publicMessages, ...displayNewMessages];
          publicStore.publicMessages = combinedMessages.slice(Math.max(0, combinedMessages.length - 20), combinedMessages.length);
          cachePublicMessages.length = 0;
        }

        Object.keys(cacheGroupMessages).forEach(groupId => {
          if (cacheGroupMessages[groupId]) {
            const existingIds = existingGroupMessageIds[groupId] || new Set();
            const newMessages = cacheGroupMessages[groupId].filter(m => !existingIds.has(m.id));

            if (newMessages.length > 0) {
              const sessionStore = useSessionStore();
              const isGroupChatActive = sessionStore.currentActiveChat === `group_${groupId}`;
              const isPageVisible = !document.hidden && document.hasFocus();

              const mutedGroups = JSON.parse(localStorage.getItem('mutedGroups') || '[]');
              const isMuted = mutedGroups.includes(groupId.toString());

              const otherUserMessages = newMessages.filter(m => String(m.sender_id) !== String(currentUser?.id));

              if (!isMuted && (!isGroupChatActive || !isPageVisible)) {
                if (otherUserMessages.length > 0) {
                  const savedUnreadCounts = unreadStore.loadUnreadCountsFromStorage ? unreadStore.loadUnreadCountsFromStorage() : { global: 0, groups: {}, private: {} };
                  if (!savedUnreadCounts.groups[groupId]) {
                    savedUnreadCounts.groups[groupId] = 0;
                  }
                  savedUnreadCounts.groups[groupId] += otherUserMessages.length;
                  if (unreadStore.saveUnreadCountsToLocalStorageDirect) unreadStore.saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
                }
              }
            }

            if (newMessages.length > 0 && groupStore.groupsList) {
              const group = groupStore.groupsList.find(g => String(g.id) === String(groupId));
              if (group && group.deleted_at == null) {
                const validMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
                if (validMessages.length > 0) {
                  const lastMessage = validMessages[validMessages.length - 1];
                  const newTime = new Date(lastMessage.timestamp || Date.now()).toISOString();
                  group.last_message_time = newTime;
                  group.session_last_active_time = newTime;
                }
              }
              groupStore.sortGroupsByLastMessageTime();
            }

            if (!fullGroupMessages.value[groupId]) {
              fullGroupMessages.value[groupId] = [...newMessages, ...(groupStore.groupMessages[groupId] || [])];
            } else {
              const fullIds = new Set(fullGroupMessages.value[groupId].map(m => m.id));
              const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
              fullGroupMessages.value[groupId] = [...fullNewMessages, ...fullGroupMessages.value[groupId]];
            }

            const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
            const combinedMessages = [...(groupStore.groupMessages[groupId] || []), ...displayNewMessages];
            groupStore.groupMessages[groupId] = combinedMessages.slice(Math.max(0, combinedMessages.length - 20), combinedMessages.length);
          }
        });
        Object.keys(cacheGroupMessages).forEach(key => delete cacheGroupMessages[key]);

        Object.keys(cachePrivateMessages).forEach(userId => {
          if (cachePrivateMessages[userId]) {
            const existingIds = existingPrivateMessageIds[userId] || new Set();
            const newMessages = cachePrivateMessages[userId].filter(m => !existingIds.has(m.id));

            if (newMessages.length > 0) {
              const sessionStore = useSessionStore();
              const isPrivateChatActive = sessionStore.currentActiveChat === `private_${userId}`;
              const isPageVisible = !document.hidden && document.hasFocus();

              const otherUserMessages = newMessages.filter(m => String(m.sender_id) !== String(currentUser?.id));

              if (!isPrivateChatActive || !isPageVisible) {
                if (otherUserMessages.length > 0) {
                  const savedUnreadCounts = unreadStore.loadUnreadCountsFromStorage ? unreadStore.loadUnreadCountsFromStorage() : { global: 0, groups: {}, private: {} };
                  if (!savedUnreadCounts.private[userId]) {
                    savedUnreadCounts.private[userId] = 0;
                  }
                  savedUnreadCounts.private[userId] += otherUserMessages.length;
                  if (unreadStore.saveUnreadCountsToLocalStorageDirect) unreadStore.saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
                }
              }
            }

            if (newMessages.length > 0 && friendStore.friendsList) {
              const friend = friendStore.friendsList.find(f => String(f.id) === String(userId));
              if (friend && friend.deleted_at == null) {
                const validMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);
                if (validMessages.length > 0) {
                  const lastMessage = validMessages[validMessages.length - 1];
                  const newTime = new Date(lastMessage.timestamp || Date.now()).toISOString();
                  friend.last_message_time = newTime;
                  friend.session_last_active_time = newTime;
                }
              }
              friendStore.sortFriendsByLastMessageTime();
            }

            if (!fullPrivateMessages.value[userId]) {
              fullPrivateMessages.value[userId] = [...newMessages, ...(friendStore.privateMessages[userId] || [])];
            } else {
              const fullIds = new Set(fullPrivateMessages.value[userId].map(m => m.id));
              const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
              fullPrivateMessages.value[userId] = [...fullNewMessages, ...fullPrivateMessages.value[userId]];
            }

            const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);
            const combinedMessages = [...(friendStore.privateMessages[userId] || []), ...displayNewMessages];
            friendStore.privateMessages[userId] = combinedMessages.slice(Math.max(0, combinedMessages.length - 20), combinedMessages.length);
          }
        });
        Object.keys(cachePrivateMessages).forEach(key => delete cachePrivateMessages[key]);

        publicStore.publicStored = false;
        Object.keys(groupStore.groupMessages).forEach(id => { groupStore.groupStored[id] = false; });
        Object.keys(friendStore.privateMessages).forEach(id => { friendStore.privateStored[id] = false; });
        await saveToStorage();

        if (userInfoUpdateMessages.length > 0) {
          userInfoUpdateMessages.forEach(message => {
            processOfflineMessage(message, onlySaveToDB);
          });
        }

        setTimeout(() => {
          baseStore.showFetchingMessage = false;
        }, 500);

        await saveMinIds();
      } else {
        if (cachePublicMessages.length > 0) {
          const newMessages = cachePublicMessages.filter(m => !existingPublicMessageIds.has(m.id) && m.messageType !== 101 && m.messageType !== 102);

          if (newMessages.length > 0) {
            const sessionStore = useSessionStore();
            const isMainChatActive = sessionStore.currentActiveChat === 'main';
            const isPageVisible = !document.hidden && document.hasFocus();

            if (!isMainChatActive || !isPageVisible) {
              const savedUnreadCounts = unreadStore.loadUnreadCountsFromStorage ? unreadStore.loadUnreadCountsFromStorage() : { global: 0, groups: {}, private: {} };
              savedUnreadCounts.global += newMessages.length;
              if (unreadStore.saveUnreadCountsToLocalStorageDirect) unreadStore.saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
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
              const sessionStore = useSessionStore();
              const isGroupChatActive = sessionStore.currentActiveChat === `group_${groupId}`;
              const isPageVisible = !document.hidden && document.hasFocus();

              const mutedGroups = JSON.parse(localStorage.getItem('mutedGroups') || '[]');
              const isMuted = mutedGroups.includes(groupId.toString());

              const otherUserMessages = newMessages.filter(m => String(m.sender_id) !== String(currentUser?.id));

              if (!isMuted && (!isGroupChatActive || !isPageVisible)) {
                if (otherUserMessages.length > 0) {
                  const savedUnreadCounts = unreadStore.loadUnreadCountsFromStorage ? unreadStore.loadUnreadCountsFromStorage() : { global: 0, groups: {}, private: {} };
                  if (!savedUnreadCounts.groups[groupId]) {
                    savedUnreadCounts.groups[groupId] = 0;
                  }
                  savedUnreadCounts.groups[groupId] += otherUserMessages.length;
                  if (unreadStore.saveUnreadCountsToLocalStorageDirect) unreadStore.saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
                }
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
              const sessionStore = useSessionStore();
              const isPrivateChatActive = sessionStore.currentActiveChat === `private_${userId}`;
              const isPageVisible = !document.hidden && document.hasFocus();

              if (!isPrivateChatActive || !isPageVisible) {
                const savedUnreadCounts = unreadStore.loadUnreadCountsFromStorage ? unreadStore.loadUnreadCountsFromStorage() : { global: 0, groups: {}, private: {} };
                if (!savedUnreadCounts.private[userId]) {
                  savedUnreadCounts.private[userId] = 0;
                }
                savedUnreadCounts.private[userId] += newMessages.length;
                if (unreadStore.saveUnreadCountsToLocalStorageDirect) unreadStore.saveUnreadCountsToLocalStorageDirect(savedUnreadCounts);
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

        publicStore.publicStored = false;
        Object.keys(fullGroupMessages.value).forEach(id => { groupStore.groupStored[id] = false; });
        Object.keys(fullPrivateMessages.value).forEach(id => { friendStore.privateStored[id] = false; });
        await saveToStorage();

        if (userInfoUpdateMessages.length > 0) {
          userInfoUpdateMessages.forEach(message => {
            processOfflineMessage(message, onlySaveToDB);
          });
        }

        await saveMinIds();

        baseStore.isFetchingOfflineMessages = false;
      }

      if (unreadStore.loadUnreadCountsFromLocalStorage) {
        unreadStore.loadUnreadCountsFromLocalStorage();
      }
    }
  }

  async function initializeMessages() {
    const baseStore = useBaseStore();
    const unreadStore = useUnreadStore();

    baseStore.showFetchingMessage = true;

    try {
      if (unreadStore.loadUnreadCountsFromLocalStorage) unreadStore.loadUnreadCountsFromLocalStorage();
      await loadMinIds();
      await loadMessages(false);
      await fetchAndMergeOfflineMessages(false);
      await loadMessages(true);
      baseStore.showFetchingMessage = false;
    } catch (error) {
      console.error('初始化消息流程失败:', error);
      baseStore.showFetchingMessage = false;
    }
  }

  function updateUserInfoInMessages(userId, updates) {
    if (fullPublicMessages.value) {
      fullPublicMessages.value.forEach(msg => {
        if (String(msg.userId) === String(userId)) {
          if (updates.nickname) msg.nickname = updates.nickname;
          if (updates.avatarUrl) msg.avatarUrl = updates.avatarUrl;
        }
      });
    }

    Object.keys(fullGroupMessages.value).forEach(groupId => {
      fullGroupMessages.value[groupId].forEach(msg => {
        if (String(msg.userId) === String(userId)) {
          if (updates.nickname) msg.nickname = updates.nickname;
          if (updates.avatarUrl) msg.avatarUrl = updates.avatarUrl;
        }
      });
    });

    Object.keys(fullPrivateMessages.value).forEach(otherUserId => {
      fullPrivateMessages.value[otherUserId].forEach(msg => {
        if (String(msg.senderId) === String(userId) || String(msg.receiverId) === String(userId)) {
          if (updates.nickname) msg.nickname = updates.nickname;
          if (updates.avatarUrl) msg.avatarUrl = updates.avatarUrl;
        }
      });
    });
  }

  function formatMessageContent(message) {
    if (!message) return '';

    let content = message.content || '';
    let msgType = message.messageType;

    const parseQuotedContent = (quotedMsg) => {
      if (!quotedMsg) return '';
      const qType = quotedMsg.messageType;
      if (qType === 1) return '[图片]';
      if (qType === 2) return '[文件]';
      if (qType === 3) return '[群名片]';
      if (qType === 101) return '撤回了一条消息';
      if (qType === 4 && (quotedMsg.quotedMessage || quotedMsg.quoted_message || quotedMsg.quoted)) return parseQuotedContent(quotedMsg.quotedMessage || quotedMsg.quoted_message || quotedMsg.quoted);
      return quotedMsg.content || '';
    };

    if (msgType === 100) {
      if (typeof content === 'string' && content.startsWith('{')) {
        try { const parsed = JSON.parse(content); return parsed.content || ''; } catch {}
      }
      return content || '';
    } else if (msgType === 4) {
      if (typeof content === 'string' && content.startsWith('{')) {
        try {
          const parsed = JSON.parse(content);
          if (parsed.type === 'quoted') {
            if (parsed.quoted) return `[引用] ${parseQuotedContent(parsed.quoted)}`;
            if (parsed.text) return `[引用] ${parsed.text}`;
          }
        } catch {}
      }
      return '[引用]';
    } else if (msgType === 1) return '[图片]';
    else if (msgType === 2) return '[文件]';
    else if (msgType === 3) return '[群名片]';
    else if (msgType === 101) return content || '撤回了一条消息';
    else if (message.group_card || message.groupCard) return '[群名片]';

    if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.type === 'quoted' && parsed.quoted) return `[引用] ${parseQuotedContent(parsed.quoted)}`;
      } catch {}
    }

    return content || '';
  }

  async function clearAllDeletedSessions() {
    const groupStore = useGroupStore();
    const friendStore = useFriendStore();
    const unreadStore = useUnreadStore();
    const publicStore = usePublicStore();

    try {
      const prefix = getStorageKeyPrefix();

      const deletedGroupIds = [];
      const deletedFriendIds = [];

      if (groupStore.groupsList) {
        groupStore.groupsList.forEach(g => {
          if (g.deleted_at) {
            deletedGroupIds.push(String(g.id));
          }
        });
      }

      if (friendStore.friendsList) {
        friendStore.friendsList.forEach(f => {
          if (f.deleted_at) {
            deletedFriendIds.push(String(f.id));
          }
        });
      }

      if (groupStore.groupsList) {
        groupStore.groupsList = groupStore.groupsList.filter(g => !g.deleted_at);
      }

      if (friendStore.friendsList) {
        friendStore.friendsList = friendStore.friendsList.filter(f => !f.deleted_at);
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
        const group = groupStore.groupsList?.find(g => String(g.id) === String(groupId));
        if (!group || group.deleted_at) {
          delete fullGroupMessages.value[groupId];
          delete groupStore.groupMessages[groupId];
          groupStore.groupStored[groupId] = true;
        }
      });

      Object.keys(fullPrivateMessages.value).forEach(userId => {
        const friend = friendStore.friendsList?.find(f => String(f.id) === String(userId));
        if (!friend || friend.deleted_at) {
          delete fullPrivateMessages.value[userId];
          delete friendStore.privateMessages[userId];
          friendStore.privateStored[userId] = true;
        }
      });

      if (unreadStore.loadUnreadCountsFromLocalStorage) unreadStore.loadUnreadCountsFromLocalStorage();

      deletedGroupIds.forEach(groupId => {
        if (unreadStore.unreadMessages?.groups?.[groupId]) {
          delete unreadStore.unreadMessages.groups[groupId];
        }
      });

      deletedFriendIds.forEach(userId => {
        if (unreadStore.unreadMessages?.private?.[userId]) {
          delete unreadStore.unreadMessages.private[userId];
        }
      });

      if (unreadStore.saveUnreadCountsToLocalStorage) unreadStore.saveUnreadCountsToLocalStorage();

      publicStore.publicStored = false;
      await saveToStorage();

      return true;
    } catch (error) {
      console.error('清除已删除会话失败:', error);
      throw error;
    }
  }

  async function deleteSingleDeletedSession(type, id) {
    const baseStore = useBaseStore();
    const groupStore = useGroupStore();
    const friendStore = useFriendStore();
    const unreadStore = useUnreadStore();
    const sessionStore = useSessionStore();

    try {
      const currentUser = baseStore.currentUser;
      if (!currentUser) return false;

      // 调用后端接口删除服务器记录
      const response = await fetch(`${SERVER_URL}/api/delete-deleted-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-id': String(currentUser.id),
          'session-token': baseStore.currentSessionToken || ''
        },
        body: JSON.stringify({ type, id })
      });

      const data = await response.json();

      // 如果服务器返回404（记录已不存在），继续处理本地删除
      if (response.status === 404) {
      } else if (data.status !== 'success' && data.success !== true) {
        throw new Error(data.message || '服务器删除失败');
      }
      
      // 检查是否正在查看要删除的会话，如果是则先关闭
      if (type === 'group' && String(sessionStore.currentGroupId) === String(id)) {
        sessionStore.setCurrentGroupId(null);
        // 触发事件让视图层切换到空状态
        window.dispatchEvent(new CustomEvent('chat-session-closed', { detail: { type: 'group', id } }));
      } else if (type === 'private' && String(sessionStore.currentPrivateChatUserId) === String(id)) {
        sessionStore.setCurrentPrivateChatUserId(null);
        window.dispatchEvent(new CustomEvent('chat-session-closed', { detail: { type: 'private', id } }));
      }
      
      // 删除本地记录
      const prefix = getStorageKeyPrefix();
      
      if (type === 'group') {
        // 从群组列表中移除
        if (groupStore.groupsList) {
          groupStore.groupsList = groupStore.groupsList.filter(g => String(g.id) !== String(id));
        }
        
        // 删除本地存储
        const key = `${prefix}-group-${id}`;
        await localForage.removeItem(key);
        
        // 清除消息
        delete fullGroupMessages.value[id];
        delete groupStore.groupMessages[id];
        
        // 清除未读计数
        if (unreadStore.unreadMessages?.groups?.[id]) {
          delete unreadStore.unreadMessages.groups[id];
        }
      } else if (type === 'private') {
        // 从好友列表中移除
        if (friendStore.friendsList) {
          friendStore.friendsList = friendStore.friendsList.filter(f => String(f.id) !== String(id));
        }
        
        // 删除本地存储
        const key = `${prefix}-private-${id}`;
        await localForage.removeItem(key);
        
        // 清除消息
        delete fullPrivateMessages.value[id];
        delete friendStore.privateMessages[id];
        
        // 清除未读计数
        if (unreadStore.unreadMessages?.private?.[id]) {
          delete unreadStore.unreadMessages.private[id];
        }
      }
      
      // 更新 chatKeys
      const chatKeysData = await localForage.getItem(prefix);
      if (chatKeysData && chatKeysData.chatKeys) {
        const rawChatKeysData = toRaw(chatKeysData);
        const targetKey = type === 'group' ? `${prefix}-group-${id}` : `${prefix}-private-${id}`;
        chatKeysData.chatKeys = rawChatKeysData.chatKeys.filter(k => k !== targetKey);
        await localForage.setItem(prefix, chatKeysData);
      }
      
      if (unreadStore.saveUnreadCountsToLocalStorage) {
        unreadStore.saveUnreadCountsToLocalStorage();
      }
      
      await saveToStorage();
      
      return true;
    } catch (error) {
      console.error('删除已删除会话失败:', error);
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

  function checkAndFixQuotedMessages(messages, sessionType, sessionId) {
    if (!messages || !Array.isArray(messages)) return messages;

    const messageIds = new Set(messages.map(m => String(m.id)));

    return messages.map((msg) => {
      if (msg.messageType === 4 && msg.content) {
        try {
          const content = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
          if (content.quotedMessage || content.quoted_message || content.quoted) {
            const quoted = content.quotedMessage || content.quoted_message || content.quoted;
            const quotedId = quoted?.id;
            if (quotedId === -1 || quotedId === '-1') return toRaw(msg);
            if (quotedId && !messageIds.has(String(quotedId))) {
              const newContent = { ...content, quoted: { id: -1, messageType: 101, content: '原引用消息已撤回', nickname: quoted?.nickname || '' } };
              delete newContent.quotedMessage;
              delete newContent.quoted_message;
              return toRaw({ ...toRaw(msg), content: JSON.stringify(newContent) });
            }
          }
        } catch (e) {}
      }
      return toRaw(msg);
    });
  }

  function fixQuotedMessagesForWithdrawn(withdrawnMessageId, messages) {
    if (!messages || !Array.isArray(messages)) return [];

    const withdrawnMessageIndex = messages.findIndex(m => String(m.id) === String(withdrawnMessageId));
    if (withdrawnMessageIndex === -1) return [];

    const updates = [];

    for (let i = withdrawnMessageIndex; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.messageType === 4 && msg.content) {
        try {
          const content = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
          if (content.quotedMessage || content.quoted_message || content.quoted) {
            const quoted = content.quotedMessage || content.quoted_message || content.quoted;
            const quotedId = quoted?.id;
            if (quotedId && String(quotedId) === String(withdrawnMessageId)) {
              const newContent = { ...content, quoted: { id: -1, messageType: 101, content: '原引用消息已撤回', nickname: quoted?.nickname || '' } };
              delete newContent.quotedMessage;
              delete newContent.quoted_message;
              updates.push({ messageId: msg.id, newContent: JSON.stringify(newContent) });
            }
          }
        } catch (e) {}
      }
    }

    return updates;
  }

  function getCachePublic() { return cachePublicMessages; }
  function setCachePublic(val) { cachePublicMessages = val; }
  function getCacheGroup() { return cacheGroupMessages; }
  function setCacheGroup(val) { cacheGroupMessages = val; }
  function getCachePrivate() { return cachePrivateMessages; }
  function setCachePrivate(val) { cachePrivateMessages = val; }

  return {
    fullPublicMessages,
    fullGroupMessages,
    fullPrivateMessages,
    sessionLastMessageTimes,
    publicAndGroupMinId,
    privateMinId,
    getStorageKeyPrefix,
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
    deleteSingleDeletedSession,
    getGroupLastMessage,
    getPrivateLastMessage,
    clearAllCache,
    checkAndFixQuotedMessages,
    fixQuotedMessagesForWithdrawn,
    updateSessionLastMessageTime,
    updateUserInfoInMessages,
    getCachePublic,
    setCachePublic,
    getCacheGroup,
    setCacheGroup,
    getCachePrivate,
    setCachePrivate
  };
});
