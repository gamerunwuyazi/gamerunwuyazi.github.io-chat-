import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useBaseStore } from './baseStore';
import { useFriendStore } from './friendStore';
import { useGroupStore } from './groupStore';
import { useStorageStore } from './storageStore';
import { usePublicStore } from './publicStore';

export const useUserStore = defineStore('user', () => {
  const onlineUsers = ref([]);
  const offlineUsers = ref([]);

  function findUserById(userId) {
    const baseStore = useBaseStore();
    const friendStore = useFriendStore();
    const groupStore = useGroupStore();

    const idStr = String(userId);
    const currentUser = baseStore.currentUser;

    if (currentUser && String(currentUser.id) === idStr) {
      return currentUser;
    }
    if (friendStore.friendsList) {
      const friend = friendStore.friendsList.find(f => String(f.id) === idStr);
      if (friend) {
        return friend;
      }
    }
    if (groupStore.groupsList) {
      for (const group of groupStore.groupsList) {
        if (group.members) {
          const member = group.members.find(m => String(m.id) === idStr);
          if (member) {
            return member;
          }
        }
      }
    }
    return null;
  }

  function getUserName(userId) {
    const user = findUserById(userId);
    if (user) {
      return user.nickname || user.username || '未知用户';
    }
    return '未知用户';
  }

  function getUserAvatar(userId) {
    const user = findUserById(userId);
    if (user) {
      return user.avatarUrl || '';
    }
    return '';
  }

  function updateUserInfoInMessages(userId, userInfo) {
    const storageStore = useStorageStore();
    const publicStore = usePublicStore();
    const groupStore = useGroupStore();
    const friendStore = useFriendStore();

    const userIdStr = String(userId);

    if (storageStore.fullPublicMessages && storageStore.fullPublicMessages.length > 0) {
      for (let i = 0; i < storageStore.fullPublicMessages.length; i++) {
        if (String(storageStore.fullPublicMessages[i].sender_id) === userIdStr || String(storageStore.fullPublicMessages[i].userId) === userIdStr) {
          if (userInfo.nickname) storageStore.fullPublicMessages[i].nickname = userInfo.nickname;
          if (userInfo.avatarUrl) storageStore.fullPublicMessages[i].avatarUrl = userInfo.avatarUrl;
        }
      }
    }

    if (storageStore.fullGroupMessages) {
      for (const groupId in storageStore.fullGroupMessages) {
        if (storageStore.fullGroupMessages[groupId] && storageStore.fullGroupMessages[groupId].length > 0) {
          for (let i = 0; i < storageStore.fullGroupMessages[groupId].length; i++) {
            if (String(storageStore.fullGroupMessages[groupId][i].sender_id) === userIdStr || String(storageStore.fullGroupMessages[groupId][i].userId) === userIdStr) {
              if (userInfo.nickname) storageStore.fullGroupMessages[groupId][i].nickname = userInfo.nickname;
              if (userInfo.avatarUrl) storageStore.fullGroupMessages[groupId][i].avatarUrl = userInfo.avatarUrl;
            }
          }
        }
      }
    }

    if (storageStore.fullPrivateMessages) {
      for (const otherUserId in storageStore.fullPrivateMessages) {
        if (storageStore.fullPrivateMessages[otherUserId] && storageStore.fullPrivateMessages[otherUserId].length > 0) {
          for (let i = 0; i < storageStore.fullPrivateMessages[otherUserId].length; i++) {
            if (String(storageStore.fullPrivateMessages[otherUserId][i].sender_id) === userIdStr || String(storageStore.fullPrivateMessages[otherUserId][i].userId) === userIdStr) {
              if (userInfo.nickname) storageStore.fullPrivateMessages[otherUserId][i].nickname = userInfo.nickname;
              if (userInfo.avatarUrl) storageStore.fullPrivateMessages[otherUserId][i].avatarUrl = userInfo.avatarUrl;
            }
          }
        }
      }
    }

    if (publicStore.publicMessages && publicStore.publicMessages.length > 0) {
      publicStore.publicMessages = publicStore.publicMessages.map(msg => {
        if (String(msg.sender_id) === userIdStr || String(msg.userId) === userIdStr) {
          return { ...msg, ...(userInfo.nickname && { nickname: userInfo.nickname }), ...(userInfo.avatarUrl && { avatarUrl: userInfo.avatarUrl }) };
        }
        return msg;
      });
    }

    if (groupStore.groupMessages) {
      for (const groupId in groupStore.groupMessages) {
        if (groupStore.groupMessages[groupId] && groupStore.groupMessages[groupId].length > 0) {
          groupStore.groupMessages[groupId] = groupStore.groupMessages[groupId].map(msg => {
            if (String(msg.sender_id) === userIdStr || String(msg.userId) === userIdStr) {
              return { ...msg, ...(userInfo.nickname && { nickname: userInfo.nickname }), ...(userInfo.avatarUrl && { avatarUrl: userInfo.avatarUrl }) };
            }
            return msg;
          });
        }
      }
    }

    if (friendStore.privateMessages) {
      for (const otherUserId in friendStore.privateMessages) {
        if (friendStore.privateMessages[otherUserId] && friendStore.privateMessages[otherUserId].length > 0) {
          friendStore.privateMessages[otherUserId] = friendStore.privateMessages[otherUserId].map(msg => {
            if (String(msg.sender_id) === userIdStr || String(msg.userId) === userIdStr) {
              return { ...msg, ...(userInfo.nickname && { nickname: userInfo.nickname }), ...(userInfo.avatarUrl && { avatarUrl: userInfo.avatarUrl }) };
            }
            return msg;
          });
        }
      }
    }

    publicStore.publicStored = false;
    if (groupStore.groupStored) {
      for (const groupId in groupStore.groupStored) groupStore.groupStored[groupId] = false;
    }
    if (friendStore.privateStored) {
      for (const otherUserId in friendStore.privateStored) friendStore.privateStored[otherUserId] = false;
    }

    if (groupStore.groupsList && groupStore.groupsList.length > 0) {
      for (let i = 0; i < groupStore.groupsList.length; i++) {
        const group = groupStore.groupsList[i];
        if (group.lastMessage) {
          const lastMsg = group.lastMessage;
          if (String(lastMsg.userId) === userIdStr || String(lastMsg.sender_id) === userIdStr) {
            if (userInfo.nickname) lastMsg.nickname = userInfo.nickname;
            if (userInfo.avatarUrl) lastMsg.avatarUrl = userInfo.avatarUrl;
          }
        }
      }
    }

    if (friendStore.friendsList && friendStore.friendsList.length > 0) {
      for (let i = 0; i < friendStore.friendsList.length; i++) {
        const friend = friendStore.friendsList[i];
        if (friend.lastMessage) {
          const lastMsg = friend.lastMessage;
          if (String(lastMsg.userId) === userIdStr || String(lastMsg.sender_id) === userIdStr) {
            if (userInfo.nickname) lastMsg.nickname = userInfo.nickname;
            if (userInfo.avatarUrl) lastMsg.avatarUrl = userInfo.avatarUrl;
          }
        }
      }
    }

    storageStore.saveToStorage();
  }

  return {
    onlineUsers,
    offlineUsers,
    findUserById,
    getUserName,
    getUserAvatar,
    updateUserInfoInMessages
  };
});
