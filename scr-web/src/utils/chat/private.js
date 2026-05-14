import localForage from 'localforage';

import modal from '../modal.js';

import { SERVER_URL, toast } from './config.js';
import { updateUnreadCountsDisplay, setActiveChatDirect } from './ui.js';
import {
  useBaseStore,
  useFriendStore,
  useSessionStore,
  useUnreadStore,
  useDraftStore,
  useModalStore,
  openUserAvatarPopup,
  closeUserAvatarPopup
} from '@/stores/index.js';
import { unescapeHtml } from './message.js';
import { navigateTo } from './routerInstance.js';

let friendsList = [];

function switchToPrivateChat(userId, nickname, username, avatarUrl) {
  const sessionStore = useSessionStore();
  const friendStore = useFriendStore();
  const unreadStore = useUnreadStore();
  const draftStore = useDraftStore();
  
  const currentPrivateUserId = sessionStore?.currentPrivateChatUserId;
  if (currentPrivateUserId) {
    const privateMessageInput = document.getElementById('privateMessageInput');
    if (privateMessageInput) {
      const content = privateMessageInput.textContent || privateMessageInput.innerHTML || '';
      if (draftStore) {
        draftStore.saveDraft('private', currentPrivateUserId, content);
      }
    }
    if (draftStore) {
      draftStore.setLastMessageToDraft('private', currentPrivateUserId);
    }
  }
  
  const currentPrivateChatUserId = userId;
  const currentPrivateChatUsername = username;
  const currentPrivateChatNickname = nickname;
  const currentActiveChat = `private_${userId}`;
  
  sessionStore.currentPrivateChatUserId = currentPrivateChatUserId;
  sessionStore.currentPrivateChatUsername = currentPrivateChatUsername;
  sessionStore.currentPrivateChatNickname = currentPrivateChatNickname;
  sessionStore.currentPrivateChatAvatarUrl = avatarUrl;
  sessionStore.currentActiveChat = currentActiveChat;

  if (sessionStore) {
    sessionStore.setCurrentPrivateChatUserId(userId);
  }
  
  if (friendStore && friendStore.setPrivateAllLoaded) {
    friendStore.setPrivateAllLoaded(userId, false);
  }
  
  if (unreadStore && unreadStore.clearPrivateUnread) {
    unreadStore.clearPrivateUnread(userId);
  }

  setActiveChatDirect('private', userId, true);

  navigateTo('/chat/private');
  
  window.dispatchEvent(new CustomEvent('private-switched'));
  
  if (typeof updateUnreadCountsDisplay === 'function') {
    updateUnreadCountsDisplay();
  }
  
  const hasMessages = friendStore && friendStore.privateMessages && friendStore.privateMessages[userId] && friendStore.privateMessages[userId].length > 0;
}

function initializePrivateChatInterface() {
  const togglePrivateMarkdownToolbar = document.getElementById('togglePrivateMarkdownToolbar');
  if (togglePrivateMarkdownToolbar) {
    togglePrivateMarkdownToolbar.addEventListener('click', () => {
      const privateMarkdownToolbar = document.getElementById('privateMarkdownToolbar');
      if (privateMarkdownToolbar) {
        privateMarkdownToolbar.style.display = privateMarkdownToolbar.style.display === 'flex' ? 'none' : 'flex';

        const icon = togglePrivateMarkdownToolbar.querySelector('i');
        if (icon) {
          icon.style.transform = privateMarkdownToolbar.style.display === 'flex' ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      }
    });
  }

  const privateChatInterface = document.getElementById('privateChatInterface');
  if (privateChatInterface) {
    privateChatInterface.addEventListener('click', function() {
      const sessionStore = useSessionStore();
      const baseStore = useBaseStore();
      const unreadStore = useUnreadStore();
      
      const currentPrivateChatUserId = sessionStore.currentPrivateChatUserId;
      const currentUser = baseStore.currentUser;
      const currentSessionToken = baseStore.currentSessionToken;
      
      if (currentPrivateChatUserId) {
        if (unreadStore && unreadStore.unreadMessages) {
          delete unreadStore.unreadMessages.private[currentPrivateChatUserId];
        }
        if (typeof updateUnreadCountsDisplay === 'function') {
          updateUnreadCountsDisplay();
        }
      }
    });
  }
}

export function initializePrivateMessageSending() {
}

function loadPrivateChatHistory(userId) {
}

async function loadFriendsList() {
  const baseStore = useBaseStore();
  const currentUser = baseStore.currentUser;
  const currentSessionToken = baseStore.currentSessionToken;

  if (!currentUser || !currentSessionToken) return;

  try {
    const response = await fetch(`${SERVER_URL}/api/user/friends`, {
      headers: {
        'user-id': currentUser.id,
        'session-token': currentSessionToken
      }
    });
    const data = await response.json();
    if (data.status === 'success') {
      await updateFriendsList(data.friends);
    }
  } catch (e) {
    console.error('加载好友列表失败:', e);
  }

  try {
    if (baseStore.loadFriendRequests) {
      await baseStore.loadFriendRequests();
    }
  } catch (e) {
    console.error('加载好友请求失败:', e);
  }
}

async function updateFriendsList(friends) {
  friendsList = friends;

  const baseStore = useBaseStore();
  const sessionStore = useSessionStore();
  const friendStore = useFriendStore();
  const unreadStore = useUnreadStore();
  
  if (friendStore) {
    const userId = baseStore.currentUser?.id || 'guest';
    const prefix = `chats-${userId}`;

    const existingFriends = friendStore.friendsList || [];
    const existingFriendMap = new Map();
    existingFriends.forEach(f => existingFriendMap.set(String(f.id), f));

    const serverFriendIds = new Set(friends.map(f => String(f.id)));

    let chatKeysData = null;
    try {
      chatKeysData = await localForage.getItem(prefix);
    } catch (e) {
      console.error('读取 chatKeys 失败:', e);
    }
    
    const localFriendIdsFromKeys = new Set();
    if (chatKeysData && chatKeysData.chatKeys) {
      chatKeysData.chatKeys.forEach(key => {
        if (key.includes('-private-')) {
          const friendId = key.split('-private-')[1];
          localFriendIdsFromKeys.add(friendId);
        }
      });
    }

    const newChatKeys = chatKeysData && chatKeysData.chatKeys ? [...chatKeysData.chatKeys] : [];
    for (const friend of friends) {
      const friendIdStr = String(friend.id);
      const key = `${prefix}-private-${friendIdStr}`;
      if (!localFriendIdsFromKeys.has(friendIdStr)) {
        newChatKeys.push(key);
        localFriendIdsFromKeys.add(friendIdStr);
      }
    }
    try {
      await localForage.setItem(prefix, { chatKeys: newChatKeys });
    } catch (e) {
      console.error('更新 chatKeys 失败:', e);
    }

    for (const friend of friends) {
      const existingFriend = existingFriendMap.get(String(friend.id));
      
      try {
        const key = `${prefix}-private-${friend.id}`;
        const existingData = await localForage.getItem(key) || { messages: [] };
        const updatedSessionData = { ...existingData };
        if (friend.nickname) updatedSessionData.nickname = friend.nickname;
        if (friend.username) updatedSessionData.username = friend.username;
        if (friend.avatar_url) updatedSessionData.avatarUrl = friend.avatar_url;
        else if (friend.avatarUrl) updatedSessionData.avatarUrl = friend.avatarUrl;
        
        delete updatedSessionData.deleted_at;
        
        await localForage.setItem(key, updatedSessionData);
      } catch (e) {
        console.error('更新IndexedDB中的好友会话信息失败:', e);
      }
    }

    for (const friendId of localFriendIdsFromKeys) {
      const friendIdStr = String(friendId);
      if (!serverFriendIds.has(friendIdStr)) {
        try {
          const key = `${prefix}-private-${friendId}`;
          const existingData = await localForage.getItem(key);
          if (!existingData?.deleted_at) {
            let updatedSessionData;
            if (existingData) {
              updatedSessionData = { ...existingData };
            } else {
              const existingFriend = existingFriendMap.get(friendIdStr);
              updatedSessionData = { messages: [] };
              if (existingFriend) {
                if (existingFriend.nickname) updatedSessionData.nickname = existingFriend.nickname;
                if (existingFriend.username) updatedSessionData.username = existingFriend.username;
                if (existingFriend.avatar_url) updatedSessionData.avatarUrl = existingFriend.avatar_url;
                else if (existingFriend.avatarUrl) updatedSessionData.avatarUrl = existingFriend.avatarUrl;
              }
            }
            
            if (!updatedSessionData.nickname) {
              try {
                const response = await fetch(`${SERVER_URL}/api/user/${friendId}`, {
                  method: 'GET',
                  headers: {
                    'user-id': userId,
                    'session-token': localStorage.getItem('currentSessionToken')
                  }
                });
                if (response.ok) {
                  const responseData = await response.json();
                  if (responseData.status === 'success' && responseData.user) {
                    if (!updatedSessionData.nickname && responseData.user.nickname) {
                      updatedSessionData.nickname = responseData.user.nickname;
                    }
                    if (!updatedSessionData.avatarUrl && responseData.user.avatar_url) {
                      updatedSessionData.avatarUrl = responseData.user.avatar_url;
                    }
                    if (!updatedSessionData.username && responseData.user.username) {
                      updatedSessionData.username = responseData.user.username;
                    }
                  }
                }
              } catch (e) {
                console.error('获取用户信息失败:', e);
              }
            }
            
            updatedSessionData.deleted_at = new Date().toISOString();
            await localForage.setItem(key, updatedSessionData);
          }
        } catch (e) {
          console.error('更新好友deleted_at失败:', e);
        }
      }
    }

    const allFriends = [];
    for (const friendId of localFriendIdsFromKeys) {
      try {
        const key = `${prefix}-private-${friendId}`;
        const data = await localForage.getItem(key);
        if (data) {
          let friendNickname = data.nickname || '用户';
          
          if (!data.nickname) {
            try {
              const response = await fetch(`/api/user/${friendId}`, {
                method: 'GET',
                headers: {
                  'session-token': localStorage.getItem('currentSessionToken')
                }
              });
              if (response.ok) {
                const responseData = await response.json();
                if (responseData.status === 'success' && responseData.user) {
                  if (!data.nickname && responseData.user.nickname) {
                    friendNickname = responseData.user.nickname;
                    data.nickname = responseData.user.nickname;
                  }
                  if (!data.avatarUrl && responseData.user.avatar_url) {
                    data.avatarUrl = responseData.user.avatar_url;
                  }
                  if (!data.username && responseData.user.username) {
                    data.username = responseData.user.username;
                  }
                  const key = `${prefix}-private-${friendId}`;
                  const updatedData = { ...data };
                  await localForage.setItem(key, updatedData);
                }
              }
            } catch (e) {
              console.error('获取用户信息失败:', e);
            }
          }
          
          const friend = {
            id: friendId,
            nickname: friendNickname,
            username: data.username || 'user',
            avatarUrl: data.avatarUrl,
            deleted_at: data.deleted_at
          };
          
          if (data.last_message_time) {
            friend.last_message_time = data.last_message_time;
          }
          
          if (data.messages && data.messages.length > 0) {
            const validMessages = data.messages.filter(m => m.messageType !== 101 && m.messageType !== 102 && m.messageType !== 103);
            if (validMessages.length > 0) {
              friend.lastMessage = validMessages[validMessages.length - 1];
              if (!friend.last_message_time) {
                friend.last_message_time = validMessages[validMessages.length - 1].timestamp || new Date().toISOString();
              }
            }
          }
          
          allFriends.push(friend);
        }
      } catch (e) {
        console.error('从IndexedDB加载好友失败:', e);
      }
    }

    friendStore.friendsList = allFriends;
    friendStore.sortFriendsByLastMessageTime();
  }

  if (typeof updateUnreadCountsDisplay === 'function') {
    updateUnreadCountsDisplay();
  }
  if (unreadStore && unreadStore.unreadMessages) {
    unreadStore.unreadMessages = { ...unreadStore.unreadMessages };
  }
}

export function addFriend(userId) {
  const baseStore = useBaseStore();
  const currentUser = baseStore.currentUser;
  const currentSessionToken = baseStore.currentSessionToken;

  if (!currentUser || !currentSessionToken) return;

  fetch(`${SERVER_URL}/api/user/add-friend`, {
    method: 'POST',
    headers: {
      'user-id': currentUser.id,
      'session-token': currentSessionToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ friendId: userId })
  })
  .then(response => response.json())
  .then(data => {
    if (data.status === 'success') {
      loadFriendsList();
      toast.success(data.message);
    } else {
      toast.error(data.message || '操作失败');
    }
  })
  .catch(() => {
    toast.error('网络错误');
  });
}

async function deleteFriend(userId) {
  const baseStore = useBaseStore();
  const sessionStore = useSessionStore();
  const friendStore = useFriendStore();
  const currentUser = baseStore.currentUser;
  const currentSessionToken = baseStore.currentSessionToken;
  
  if (!currentUser || !currentSessionToken) return;

  const confirmed = await modal.confirm('确定要删除这个好友吗？', '删除好友');
  if (confirmed) {
    fetch(`${SERVER_URL}/api/user/remove-friend`, {
      method: 'POST',
      headers: {
        'user-id': currentUser.id,
        'session-token': currentSessionToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ friendId: userId })
    })
      .then(response => response.json())
      .then(data => {
        if (data.status === 'success') {
          if (friendStore && friendStore.markFriendAsDeleted) {
            friendStore.markFriendAsDeleted(userId, true);
          }
          
          loadFriendsList();

          const currentPrivateChatUserId = sessionStore.currentPrivateChatUserId;
          if (currentPrivateChatUserId === userId) {
            const privateChatInterface = document.getElementById('privateChatInterface');
            const privateEmptyState = document.getElementById('privateEmptyState');
            if (privateChatInterface && privateEmptyState) {
              privateChatInterface.style.display = 'none';
              privateEmptyState.style.display = 'flex';
            }
          }

          toast.success('删除好友成功');
        } else {
          toast.error('删除好友失败: ' + data.message);
        }
      })
      .catch(() => {
        toast.error('删除好友失败: 网络错误');
      });
  }
}

function showUserProfile(user) {
  const friendStore = useFriendStore();
  const baseStore = useBaseStore();
  const sessionStore = useSessionStore();
  const modalStore = useModalStore();
  
  const currentFriend = friendStore?.friendsList?.find(f => String(f.id) === String(user.id));
  if (currentFriend && currentFriend.deleted_at != null) {
    if (modalStore && modalStore.openModal) {
      modalStore.openModal('userProfile', currentFriend);
    }
    return;
  }
  
  const currentUserInfo = baseStore.currentUser;
  const sessionToken = baseStore.currentSessionToken;

  fetch(`${SERVER_URL}/api/user/${user.id}`, {
    headers: {
      'user-id': currentUserInfo?.id || '',
      'session-token': sessionToken || ''
    }
  })
    .then(response => response.json())
    .then(data => {
      let fullUser = user;
      if (data.status === 'success' && data.user) {
        fullUser = {
          id: data.user.id,
          username: data.user.username,
          nickname: data.user.nickname,
          gender: data.user.gender !== undefined ? data.user.gender : 0,
          signature: data.user.signature,
          avatarUrl: data.user.avatar_url || data.user.avatarUrl || data.user.avatar
        };
      }
      if (modalStore && modalStore.openModal) {
        modalStore.openModal('userProfile', fullUser);
      }
    })
    .catch(_error => {
      console.error('获取用户信息失败:', _error);
      if (modalStore && modalStore.openModal) {
        modalStore.openModal('userProfile', user);
      }
    });
}

function showUserAvatarPopup(event, user) {
  event.stopPropagation();
  openUserAvatarPopup(event, user);
}

function hideUserAvatarPopup() {
  closeUserAvatarPopup();
}

function searchUsers(keyword) {
  const baseStore = useBaseStore();
  const currentUser = baseStore.currentUser;
  const currentSessionToken = baseStore.currentSessionToken;
  
  if (!currentUser || !currentSessionToken) return;

  fetch(`${SERVER_URL}/api/user/search?keyword=${encodeURIComponent(keyword)}`, {
    headers: {
      'user-id': currentUser.id,
      'session-token': currentSessionToken
    }
  })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        displaySearchResults(data.users);
      } else {
        const searchResults = document.getElementById('searchResults');
        if (searchResults) {
          searchResults.innerHTML = '<div class="search-result-item">搜索失败: ' + data.message + '</div>';
        }
      }
    })
    .catch(() => {
      const searchResults = document.getElementById('searchResults');
      if (searchResults) {
        searchResults.innerHTML = '<div class="search-result-item">搜索失败: 网络错误</div>';
      }
    });
}

function displaySearchResults(users) {
  const searchResults = document.getElementById('searchResults');
  if (!searchResults) return;

  searchResults.innerHTML = '';

  if (users.length === 0) {
    searchResults.innerHTML = '<div class="search-result-item">未找到匹配的用户</div>';
    return;
  }

  users.forEach(user => {
    const resultItem = document.createElement('div');
    resultItem.className = 'search-result-item';

    let avatarUrl = '';
    if (user.avatarUrl && typeof user.avatarUrl === 'string') {
      avatarUrl = user.avatarUrl.trim();
    } else if (user.avatar_url && typeof user.avatar_url === 'string') {
      avatarUrl = user.avatar_url.trim();
    } else if (user.avatar && typeof user.avatar === 'string') {
      avatarUrl = user.avatar.trim();
    }

    if (avatarUrl) {
      const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;
      if (!avatarUrl.match(imageExtensions) && !avatarUrl.includes('/avatar/') && !avatarUrl.includes('/upload/')) {
        avatarUrl = '';
      }
    }

    const nickname = user.nickname || '';
    const username = user.username || '';

    let avatarHtml = '';
    if (avatarUrl) {
      const isSvgAvatar = /\.svg$/i.test(avatarUrl);
      if (isSvgAvatar) {
        const initials = nickname ? nickname.charAt(0).toUpperCase() : 'U';
        avatarHtml = `<span class="user-avatar">${initials}</span>`;
      } else {
        const fullAvatarUrl = `${SERVER_URL}${avatarUrl}`;
        avatarHtml = `<span class="user-avatar"><img src="${fullAvatarUrl}" alt="${nickname}"></span>`;
      }
    } else {
      const initials = nickname ? nickname.charAt(0).toUpperCase() : 'U';
      avatarHtml = `<span class="user-avatar">${initials}</span>`;
    }

    resultItem.innerHTML = `
      ${avatarHtml}
      <div class="search-result-info">
        <div class="search-result-nickname">${nickname}</div>
        <div class="search-result-username">@${username}</div>
      </div>
      <button class="add-friend-btn" data-user-id="${user.id}" data-user-nickname="${user.nickname}" data-user-avatar="${avatarUrl}">+</button>
    `;

    const addFriendBtn = resultItem.querySelector('.add-friend-btn');
    addFriendBtn.addEventListener('click', () => {
      addFriend(user.id);
    });

    const resultAvatar = resultItem.querySelector('.user-avatar');
    resultAvatar.addEventListener('click', (e) => {
      e.stopPropagation();
      showUserAvatarPopup(e, user);
    });

    resultItem.addEventListener('click', (e) => {
      if (!e.target.classList.contains('add-friend-btn') && !e.target.closest('.user-avatar')) {
        showUserProfile(user);
      }
    });

    searchResults.appendChild(resultItem);
  });
}

function getMutedPrivateChats() {
    const mutedPrivateChats = localStorage.getItem('mutedPrivateChats');
    return mutedPrivateChats ? JSON.parse(mutedPrivateChats) : [];
}

function isPrivateMuted(userId) {
    const mutedPrivateChats = getMutedPrivateChats();
    return mutedPrivateChats.includes(userId.toString());
}

function togglePrivateMute(userId) {
    const mutedPrivateChats = getMutedPrivateChats();
    const userIdStr = userId.toString();
    let updatedChats;

    if (mutedPrivateChats.includes(userIdStr)) {
        updatedChats = mutedPrivateChats.filter(id => id !== userIdStr);
    } else {
        updatedChats = [...mutedPrivateChats, userIdStr];
    }

    localStorage.setItem('mutedPrivateChats', JSON.stringify(updatedChats));
    updateUnreadCountsDisplay();
    return !mutedPrivateChats.includes(userIdStr);
}

export {
  switchToPrivateChat,
  initializePrivateChatInterface,
  loadPrivateChatHistory,
  loadFriendsList,
  updateFriendsList,
  deleteFriend,
  showUserProfile,
  showUserAvatarPopup,
  hideUserAvatarPopup,
  searchUsers,
  displaySearchResults,
  getMutedPrivateChats,
  isPrivateMuted,
  togglePrivateMute
};
