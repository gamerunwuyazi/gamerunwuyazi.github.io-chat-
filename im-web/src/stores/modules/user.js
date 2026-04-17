import { ref } from 'vue';

export function createUserModule(getCurrentUser, getGroupsList, getFriendsList) {
  const onlineUsers = ref([]);
  const offlineUsers = ref([]);

  function findUserById(userId) {
    const idStr = String(userId);
    const currentUser = getCurrentUser();
    const groupsList = getGroupsList();
    const friendsList = getFriendsList();
    
    if (currentUser && String(currentUser.id) === idStr) {
      return currentUser;
    }
    if (friendsList) {
      const friend = friendsList.find(f => String(f.id) === idStr);
      if (friend) {
        return friend;
      }
    }
    if (groupsList) {
      for (const group of groupsList) {
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

  function updateUserInfoInMessages(userId, userInfo, context) {
    const userIdStr = String(userId);
    const { 
      fullPublicMessages, 
      fullGroupMessages, 
      fullPrivateMessages,
      publicMessages, 
      groupMessages, 
      privateMessages,
      publicStored,
      groupStored,
      privateStored,
      groupsList,
      friendsList,
      saveToStorage
    } = context;

    if (fullPublicMessages && fullPublicMessages.length > 0) {
      for (let i = 0; i < fullPublicMessages.length; i++) {
        if (String(fullPublicMessages[i].sender_id) === userIdStr || String(fullPublicMessages[i].userId) === userIdStr) {
          if (userInfo.nickname) {
            fullPublicMessages[i].nickname = userInfo.nickname;
          }
          if (userInfo.avatarUrl) {
            fullPublicMessages[i].avatarUrl = userInfo.avatarUrl;
          }
        }
      }
    }

    if (fullGroupMessages) {
      for (const groupId in fullGroupMessages) {
        if (fullGroupMessages[groupId] && fullGroupMessages[groupId].length > 0) {
          for (let i = 0; i < fullGroupMessages[groupId].length; i++) {
            if (String(fullGroupMessages[groupId][i].sender_id) === userIdStr || String(fullGroupMessages[groupId][i].userId) === userIdStr) {
              if (userInfo.nickname) {
                fullGroupMessages[groupId][i].nickname = userInfo.nickname;
              }
              if (userInfo.avatarUrl) {
                fullGroupMessages[groupId][i].avatarUrl = userInfo.avatarUrl;
              }
            }
          }
        }
      }
    }

    if (fullPrivateMessages) {
      for (const otherUserId in fullPrivateMessages) {
        if (fullPrivateMessages[otherUserId] && fullPrivateMessages[otherUserId].length > 0) {
          for (let i = 0; i < fullPrivateMessages[otherUserId].length; i++) {
            if (String(fullPrivateMessages[otherUserId][i].sender_id) === userIdStr || String(fullPrivateMessages[otherUserId][i].userId) === userIdStr) {
              if (userInfo.nickname) {
                fullPrivateMessages[otherUserId][i].nickname = userInfo.nickname;
              }
              if (userInfo.avatarUrl) {
                fullPrivateMessages[otherUserId][i].avatarUrl = userInfo.avatarUrl;
              }
            }
          }
        }
      }
    }

    if (publicMessages && publicMessages.value && publicMessages.value.length > 0) {
      const newPublicMessages = publicMessages.value.map(msg => {
        if (String(msg.sender_id) === userIdStr || String(msg.userId) === userIdStr) {
          return {
            ...msg,
            ...(userInfo.nickname && { nickname: userInfo.nickname }),
            ...(userInfo.avatarUrl && { avatarUrl: userInfo.avatarUrl })
          };
        }
        return msg;
      });
      publicMessages.value = newPublicMessages;
    }

    if (groupMessages && groupMessages.value) {
      for (const groupId in groupMessages.value) {
        if (groupMessages.value[groupId] && groupMessages.value[groupId].length > 0) {
          const newGroupMessages = groupMessages.value[groupId].map(msg => {
            if (String(msg.sender_id) === userIdStr || String(msg.userId) === userIdStr) {
              return {
                ...msg,
                ...(userInfo.nickname && { nickname: userInfo.nickname }),
                ...(userInfo.avatarUrl && { avatarUrl: userInfo.avatarUrl })
              };
            }
            return msg;
          });
          groupMessages.value[groupId] = newGroupMessages;
        }
      }
    }

    if (privateMessages && privateMessages.value) {
      for (const otherUserId in privateMessages.value) {
        if (privateMessages.value[otherUserId] && privateMessages.value[otherUserId].length > 0) {
          const newPrivateMessages = privateMessages.value[otherUserId].map(msg => {
            if (String(msg.sender_id) === userIdStr || String(msg.userId) === userIdStr) {
              return {
                ...msg,
                ...(userInfo.nickname && { nickname: userInfo.nickname }),
                ...(userInfo.avatarUrl && { avatarUrl: userInfo.avatarUrl })
              };
            }
            return msg;
          });
          privateMessages.value[otherUserId] = newPrivateMessages;
        }
      }
    }

    if (publicStored) {
      publicStored.value = false;
    }
    if (groupStored && groupStored.value) {
      for (const groupId in groupStored.value) {
        groupStored.value[groupId] = false;
      }
    }
    if (privateStored && privateStored.value) {
      for (const otherUserId in privateStored.value) {
        privateStored.value[otherUserId] = false;
      }
    }

    if (groupsList && groupsList.value && groupsList.value.length > 0) {
      for (let i = 0; i < groupsList.value.length; i++) {
        const group = groupsList.value[i];
        if (group.lastMessage) {
          const lastMsg = group.lastMessage;
          if (String(lastMsg.userId) === userIdStr || String(lastMsg.sender_id) === userIdStr) {
            if (userInfo.nickname) {
              lastMsg.nickname = userInfo.nickname;
            }
            if (userInfo.avatarUrl) {
              lastMsg.avatarUrl = userInfo.avatarUrl;
            }
          }
        }
      }
    }

    if (friendsList && friendsList.value && friendsList.value.length > 0) {
      for (let i = 0; i < friendsList.value.length; i++) {
        const friend = friendsList.value[i];
        if (friend.lastMessage) {
          const lastMsg = friend.lastMessage;
          if (String(lastMsg.userId) === userIdStr || String(lastMsg.sender_id) === userIdStr) {
            if (userInfo.nickname) {
              lastMsg.nickname = userInfo.nickname;
            }
            if (userInfo.avatarUrl) {
              lastMsg.avatarUrl = userInfo.avatarUrl;
            }
          }
        }
      }
    }

    if (saveToStorage) {
      saveToStorage();
    }
  }

  return {
    onlineUsers,
    offlineUsers,
    findUserById,
    getUserName,
    getUserAvatar,
    updateUserInfoInMessages
  };
}
