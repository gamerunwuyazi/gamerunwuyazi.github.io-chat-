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
  const currentGroupMembers = ref([]);
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

  function updateGroupNicknameInMessages(groupId, members) {
    const storageStore = useStorageStore();
    if (!groupId || !members || !Array.isArray(members)) return;

    const updateMessages = (messages) => {
      if (!messages || !Array.isArray(messages)) return false;
      let updated = false;

      messages.forEach(msg => {
        const member = members.find(m => String(m.id) === String(msg.userId));
        if (member && member.group_nickname) {
          if (msg.groupNickname !== member.group_nickname) {
            msg.groupNickname = member.group_nickname;
            updated = true;
          }
        } else if (msg.groupNickname) {
          msg.groupNickname = null;
          updated = true;
        }

        // 如果没有群昵称，检测并更新全局昵称
        if (member && !member.group_nickname && member.nickname) {
          if (msg.nickname !== member.nickname) {
            msg.nickname = member.nickname;
            updated = true;
          }
        } else if (!member && msg.nickname) {
          // 发送者不在成员列表中（可能已退出），保留原昵称
        }

        // 同时更新被撤回消息中的撤回人昵称
        if (msg.isRecalled || msg.messageType === 101) {
          if (msg.content && typeof msg.content === 'string') {
            try {
              const contentParsed = JSON.parse(msg.content);
              if (contentParsed && typeof contentParsed === 'object' && !Array.isArray(contentParsed)) {
                const recallerIds = Object.keys(contentParsed);
                for (const recallerId of recallerIds) {
                  const recallerMember = members.find(m => String(m.id) === String(recallerId));
                  if (recallerMember) {
                    const newRecallNickname = recallerMember.group_nickname || recallerMember.nickname;
                    if (newRecallNickname && contentParsed[recallerId] !== newRecallNickname) {
                      contentParsed[recallerId] = newRecallNickname;
                      updated = true;
                    }
                  }
                }
                if (updated) {
                  msg.content = JSON.stringify(contentParsed);
                }
              }
            } catch (e) {
              // 旧格式兼容
            }
          }
        }

        // 同时更新100系统消息中所有用户的昵称
        if (msg.messageType === 100 && msg.content && typeof msg.content === 'string') {
          try {
            const contentParsed = JSON.parse(msg.content);
            if (contentParsed && contentParsed.action) {
              let msgUpdated = false;
              for (const member of members) {
                const key = String(member.id);
                if (contentParsed[key] !== undefined) {
                  const newNick = member.group_nickname || member.nickname;
                  if (newNick && contentParsed[key] !== newNick) {
                    contentParsed[key] = newNick;
                    msgUpdated = true;
                  }
                }
              }
              if (msgUpdated) {
                msg.content = JSON.stringify(contentParsed);
                updated = true;
              }
            }
          } catch (e) {
            // 解析失败，跳过
          }
        }
      });

      return updated;
    };

    let anyUpdated = false;

    if (groupMessages.value[groupId]) {
      if (updateMessages(groupMessages.value[groupId])) {
        anyUpdated = true;
      }
    }

    if (storageStore.fullGroupMessages[groupId]) {
      if (updateMessages(storageStore.fullGroupMessages[groupId])) {
        anyUpdated = true;
      }
    }

    if (anyUpdated) {

      // 同步更新侧边栏最后消息的 groupNickname
      syncLastMessageGroupNickname(groupId);

      groupStored.value[groupId] = false;
      storageStore.saveToStorage();
    }
  }

  // 直接针对某个用户在指定群组更新所有消息的 groupNickname（用于 socket 事件）
  function updateUserGroupNicknameInMessages(groupId, userId, newGroupNickname, globalNicknameFromEvent) {
    const storageStore = useStorageStore();
    if (!groupId) return false;

    const updateMessages = (messages) => {
      if (!messages || !Array.isArray(messages)) return { updated: false, newArray: messages };
      let updated = false;

      const newArray = messages.map(msg => {
        let modified = false;
        const newMsg = { ...toRaw(msg) };

        if (String(newMsg.userId) === String(userId)) {
          if (newGroupNickname) {
            if (newMsg.groupNickname !== newGroupNickname) {
              newMsg.groupNickname = newGroupNickname;
              modified = true;
            }
          } else if (newMsg.groupNickname) {
            newMsg.groupNickname = null;
            modified = true;
          }

          if (!newGroupNickname) {
            const memberInfo = currentGroupMembers.value
              ? currentGroupMembers.value.find(m => String(m.id) === String(userId))
              : null;
            const globalNickname = globalNicknameFromEvent || memberInfo?.nickname || newMsg.nickname;
            if (globalNickname && newMsg.nickname !== globalNickname) {
              newMsg.nickname = globalNickname;
              modified = true;
            }
          }
        }

        if (newMsg.messageType === 100 && newMsg.content && typeof newMsg.content === 'string') {
          try {
            const parsed = JSON.parse(newMsg.content);
            if (parsed && parsed.action && parsed[String(userId)] !== undefined) {
              let newDisplayName = newGroupNickname;
              if (!newDisplayName) {
                const memberInfo = currentGroupMembers.value
                  ? currentGroupMembers.value.find(m => String(m.id) === String(userId))
                  : null;
                newDisplayName = globalNicknameFromEvent || memberInfo?.nickname || newMsg.nickname;
              }
              if (parsed[String(userId)] !== newDisplayName) {
                parsed[String(userId)] = newDisplayName;
                newMsg.content = JSON.stringify(parsed);
                modified = true;
              }
            }
          } catch {}
        }

        if (newMsg.isRecalled || newMsg.messageType === 101) {
          if (newMsg.content && typeof newMsg.content === 'string') {
            try {
              const contentParsed = JSON.parse(newMsg.content);
              if (contentParsed && typeof contentParsed === 'object' && !Array.isArray(contentParsed)) {
                let wasUpdated = false;

                const getGlobalNickname = () => {
                  const memberInfo = currentGroupMembers.value
                    ? currentGroupMembers.value.find(m => String(m.id) === String(userId))
                    : null;
                  return globalNicknameFromEvent || memberInfo?.nickname || null;
                };

                if (contentParsed.id && contentParsed.nickname && typeof contentParsed.nickname === 'object') {
                  const innerObj = contentParsed.nickname;
                  if (innerObj[String(userId)] !== undefined) {
                    const newDisplayName = newGroupNickname || getGlobalNickname() || innerObj[String(userId)];
                    if (innerObj[String(userId)] !== newDisplayName) {
                      innerObj[String(userId)] = newDisplayName;
                      contentParsed.nickname = innerObj;
                      newMsg.content = JSON.stringify(contentParsed);
                      wasUpdated = true;
                    }
                  }
                } else {
                  const recallerIds = Object.keys(contentParsed);
                  if (recallerIds.includes(String(userId))) {
                    const newDisplayName = newGroupNickname || getGlobalNickname() || contentParsed[userId];
                    if (contentParsed[userId] !== newDisplayName) {
                      contentParsed[userId] = newDisplayName;
                      newMsg.content = JSON.stringify(contentParsed);
                      wasUpdated = true;
                    }
                  }
                }

                if (wasUpdated) {
                  modified = true;
                }
              }
            } catch (e) {
              // 旧格式兼容
            }
          }
        }

        if (modified) {
          updated = true;
          return newMsg;
        }
        return msg;
      });

      return { updated, newArray };
    };

    let anyUpdated = false;

    if (groupMessages.value[groupId]) {
      const result = updateMessages(groupMessages.value[groupId]);
      if (result.updated) {
        anyUpdated = true;
        groupMessages.value[groupId] = result.newArray;
      }
    }

    if (storageStore.fullGroupMessages[groupId]) {
      const result = updateMessages(storageStore.fullGroupMessages[groupId]);
      if (result.updated) {
        anyUpdated = true;
        storageStore.fullGroupMessages[groupId] = result.newArray;
      }
    }

    if (anyUpdated) {

      // 同步更新侧边栏最后消息的 groupNickname
      syncLastMessageGroupNickname(groupId);

      groupStored.value[groupId] = false;
      storageStore.saveToStorage();
    }

    return anyUpdated;
  }

  // 检测当前群最后一条消息的 stored groupNickname 是否与成员信息一致，不一致则触发全量更新
  function detectAndUpdateGroupNicknames(groupId) {
    const storageStore = useStorageStore();
    if (!groupId) return;

    const members = currentGroupMembers.value;
    if (!members || !Array.isArray(members) || members.length === 0) return;

    // 获取该群的所有消息（从 groupMessages 或 fullGroupMessages）
    const allMessages = groupMessages.value[groupId] || storageStore.fullGroupMessages[groupId];
    if (!allMessages || !Array.isArray(allMessages) || allMessages.length === 0) return;

    // 找最后一条非系统消息（非 101/102/103/104 类型）
    const lastRealMessage = [...allMessages].reverse().find(msg => ![101, 102, 103, 104].includes(msg.messageType));
    if (!lastRealMessage || !lastRealMessage.userId) return;

    // 检查最后消息的用户在成员列表中是否有群昵称
    const lastMsgMember = members.find(m => String(m.id) === String(lastRealMessage.userId));
    if (!lastMsgMember) return;

    const currentGroupNickname = lastMsgMember.group_nickname || null;
    const storedGroupNickname = lastRealMessage.groupNickname || null;

    // 如果不一致，触发全量更新
    if (currentGroupNickname !== storedGroupNickname) {
      updateGroupNicknameInMessages(groupId, members);
      return;
    }

    // 如果发送者没有群昵称，检测全局昵称是否一致
    if (!currentGroupNickname) {
      const currentGlobalNickname = lastMsgMember.nickname || null;
      const storedGlobalNickname = lastRealMessage.nickname || null;
      if (currentGlobalNickname && currentGlobalNickname !== storedGlobalNickname) {
        updateGroupNicknameInMessages(groupId, members);
      }
    }
  }

  // 同步更新侧边栏最后消息的 groupNickname（在消息更新后调用，确保侧边栏显示正确）
  function syncLastMessageGroupNickname(groupId) {
    if (!groupsList.value || !Array.isArray(groupsList.value)) return;
    const group = groupsList.value.find(g => String(g.id) === String(groupId));
    if (!group || !group.lastMessage) return;

    // 从更新后的 stored messages 中找同 id 的消息，同步 groupNickname
    const storageStore = useStorageStore();
    const allMsgs = storageStore.fullGroupMessages[groupId] || groupMessages.value[groupId];
    if (!allMsgs || !Array.isArray(allMsgs)) return;

    const storedMsg = allMsgs.find(m => String(m.id) === String(group.lastMessage.id));
    if (storedMsg) {
      if (storedMsg.groupNickname) {
        group.lastMessage.groupNickname = storedMsg.groupNickname;
      } else {
        group.lastMessage.groupNickname = null;
      }

      if (storedMsg.nickname) {
        group.lastMessage.nickname = storedMsg.nickname;
      }

      if (storedMsg.isRecalled || storedMsg.messageType === 101 || storedMsg.messageType === 100) {
        group.lastMessage.content = storedMsg.content;
      }
    }
  }

  return {
    groupsList,
    groupMessages,
    currentGroupMembers,
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
    updateQuotedMessage,
    updateGroupNicknameInMessages,
    updateUserGroupNicknameInMessages,
    detectAndUpdateGroupNicknames,
    syncLastMessageGroupNickname
  };
});
