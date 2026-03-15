import { SERVER_URL, toast } from './config.js';
import { 
  getStore, 
  getCurrentUser, 
  getCurrentSessionToken, 
  sessionStore, 
  unreadMessages 
} from './store.js';
import { unescapeHtml } from './message.js';
import modal from '../modal.js';

let friendsList = [];

function initializeFriendsListListeners() {
  // 好友搜索功能已移至 Vue 组件 (PrivateSidebar.vue)
}

function switchToPrivateChat(userId, nickname, username, avatarUrl) {
  // console.log(`🔄 [切换私信] 切换到私信会话 - userId=${userId}, nickname=${nickname}`);
  
  const currentPrivateChatUserId = userId;
  const currentPrivateChatUsername = username;
  const currentPrivateChatNickname = nickname;
  const currentActiveChat = `private_${userId}`;
  
  sessionStore.currentPrivateChatUserId = currentPrivateChatUserId;
  sessionStore.currentPrivateChatUsername = currentPrivateChatUsername;
  sessionStore.currentPrivateChatNickname = currentPrivateChatNickname;
  sessionStore.currentPrivateChatAvatarUrl = avatarUrl;
  sessionStore.currentActiveChat = currentActiveChat;

  // 同步到 window（关键：用于加载更多历史消息）
  window.currentPrivateChatUserId = userId;
  
  // 重置该会话的全部加载标志
  if (!window.privateChatAllLoaded) {
    window.privateChatAllLoaded = {};
  }
  delete window.privateChatAllLoaded[userId];
  // console.log(`🔄 [切换私信] 重置会话 ${userId} 的全部加载标志 - window.privateChatAllLoaded[${userId}] 已删除`);
  
  // 同步到 store
  const store = getStore();
  if (store) {
    store.currentPrivateChatUserId = userId;
    store.currentPrivateChatUsername = username;
    store.currentPrivateChatNickname = nickname;
    store.currentPrivateChatAvatarUrl = avatarUrl;
    store.currentActiveChat = `private_${userId}`;
  }

  if (typeof window.setActiveChat === 'function') {
    window.setActiveChat('private', userId, true);
  }

  // 跳转到私信页面
  if (window.router && window.router.currentRoute.value.path !== '/chat/private') {
    window.router.push('/chat/private');
  }

  window.dispatchEvent(new CustomEvent('private-switched'));
  
  const hasMessages = store && store.privateMessages && store.privateMessages[userId] && store.privateMessages[userId].length > 0;
  loadPrivateChatHistory(userId, !hasMessages);
}

function initializePrivateChatFunctions() {
  initializeFriendsListListeners();
  initializeUserProfileModal();
  initializeUserSearch();
  initializePrivateMessageSending();
  initializePrivateChatInterface();
}

function initializePrivateChatInterface() {
  // 大部分事件已在 Vue 组件中处理，只保留必要的 DOM 操作
  
  // Markdown 工具栏切换（如果 Vue 中没有处理）
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

  // 私信聊天界面点击清除未读
  const privateChatInterface = document.getElementById('privateChatInterface');
  if (privateChatInterface) {
    privateChatInterface.addEventListener('click', function() {
      const currentPrivateChatUserId = sessionStore.currentPrivateChatUserId;
      const currentUser = getCurrentUser();
      const currentSessionToken = getCurrentSessionToken();
      
      if (currentPrivateChatUserId) {
        delete unreadMessages.private[currentPrivateChatUserId];
        if (typeof window.updateUnreadCountsDisplay === 'function') {
          window.updateUnreadCountsDisplay();
        }
        if (typeof window.updateTitleWithUnreadCount === 'function') {
          window.updateTitleWithUnreadCount();
        }

        if (window.chatSocket) {
          window.chatSocket.emit('join-private-chat', {
            userId: currentUser.id,
            friendId: currentPrivateChatUserId,
            sessionToken: currentSessionToken
          });
        }
      }
    });
  }
}

export function initializePrivateMessageSending() {
  // 私信消息发送、图片上传、文件上传等事件已在 Vue 组件中处理
}

function loadPrivateChatHistory(userId) {
  const currentUser = getCurrentUser();
  const currentSessionToken = getCurrentSessionToken();
  
  if (!currentUser || !currentSessionToken) return;

  if (window.chatSocket) {
    window.chatSocket.emit('join-private-chat', {
      userId: currentUser.id,
      friendId: userId,
      sessionToken: currentSessionToken,
      loadMore: false,
      limit: 20
    });
  }
}

function loadFriendsList() {
  const currentUser = getCurrentUser();
  const currentSessionToken = getCurrentSessionToken();
  
  if (!currentUser || !currentSessionToken) return;

  fetch(`${SERVER_URL}/user/friends`, {
    headers: {
      'user-id': currentUser.id,
      'session-token': currentSessionToken
    }
  })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        updateFriendsList(data.friends);
      }
    })
    .catch(() => {
    });
}

function updateFriendsList(friends) {
  friendsList = friends;

  if (window.chatStore) {
    // 应用 localStorage 缓存的最后消息时间
    const updatedFriends = friends.map(friend => {
      const cachedTime = window.chatStore.getFriendLastMessageTime(friend.id);
      if (cachedTime) {
        return { ...friend, last_message_time: cachedTime };
      }
      return friend;
    });
    
    window.chatStore.friendsList = updatedFriends;
    // 按最后消息时间排序
    window.chatStore.sortFriendsByLastMessageTime();
  }

  if (typeof window.updateUnreadCountsDisplay === 'function') {
    window.updateUnreadCountsDisplay();
  }

  if (window.chatStore) {
    window.chatStore.unreadMessages = { ...unreadMessages };
  }
}

export function addFriend(userId) {
  const currentUser = getCurrentUser();
  const currentSessionToken = getCurrentSessionToken();
  
  if (!currentUser || !currentSessionToken) return;

  fetch(`${SERVER_URL}/user/add-friend`, {
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
        toast.success('添加好友成功');
      } else {
        toast.error('添加好友失败: ' + data.message);
      }
    })
    .catch(() => {
      toast.error('添加好友失败: 网络错误');
    });
}

async function deleteFriend(userId) {
  const currentUser = getCurrentUser();
  const currentSessionToken = getCurrentSessionToken();
  
  if (!currentUser || !currentSessionToken) return;

  const confirmed = await modal.confirm('确定要删除这个好友吗？', '删除好友');
  if (confirmed) {
    fetch(`${SERVER_URL}/user/remove-friend`, {
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
  const currentUserInfo = getCurrentUser();
  const sessionToken = getCurrentSessionToken();

  fetch(`${SERVER_URL}/user/${user.id}`, {
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
      if (typeof window.openModal === 'function') {
        window.openModal('userProfile', fullUser);
      } else if (window.chatStore) {
        window.chatStore.openModal('userProfile', fullUser);
      }
    })
    .catch(_error => {
      console.error('获取用户信息失败:', _error);
      if (typeof window.openModal === 'function') {
        window.openModal('userProfile', user);
      } else if (window.chatStore) {
        window.chatStore.openModal('userProfile', user);
      }
    });
}

function showUserAvatarPopup(event, user) {
  event.stopPropagation();

  const popup = document.getElementById('userAvatarPopup');
  const popupAvatarImg = document.getElementById('popupAvatarImg');
  const popupInitials = document.getElementById('popupInitials');
  const popupNickname = document.getElementById('popupNickname');
  const popupUsername = document.getElementById('popupUsername');
  const popupAddFriend = document.getElementById('popupAddFriend');

  if (!popup || !popupAvatarImg || !popupInitials || !popupNickname || !popupUsername || !popupAddFriend) return;

  popup.style.display = 'none';
  popup.dataset.userId = user.id;

  const isFriend = friendsList.some(friend => String(friend.id) === String(user.id));
  const currentUser = getCurrentUser();
  const isCurrentUser = currentUser && String(currentUser.id) === String(user.id);

  if (isCurrentUser) {
    popupAddFriend.textContent = '已添加';
    popupAddFriend.style.backgroundColor = '#ccc';
    popupAddFriend.style.cursor = 'not-allowed';
    popupAddFriend.disabled = true;
    popupAddFriend.onclick = null;
  } else if (isFriend) {
    popupAddFriend.textContent = '发消息';
    popupAddFriend.style.backgroundColor = '#3498db';
    popupAddFriend.style.cursor = 'pointer';
    popupAddFriend.disabled = false;
    popupAddFriend.onclick = function() {
      hideUserAvatarPopup();
      switchToPrivateChat(user.id, user.nickname || user.username, user.username, user.avatarUrl || user.avatar_url || user.avatar);
      // 将好友移到列表顶端（延迟执行，避免被页面加载逻辑覆盖）
      setTimeout(() => {
        const store = getStore();
        if (store && store.moveFriendToTop) {
          store.moveFriendToTop(user.id);
        }
      }, 200);
    };
  } else {
    popupAddFriend.textContent = '添加好友';
    popupAddFriend.style.backgroundColor = '#3498db';
    popupAddFriend.style.cursor = 'pointer';
    popupAddFriend.disabled = false;
    popupAddFriend.onclick = function() {
      addFriend(user.id);
      hideUserAvatarPopup();
    };
  }

  const fetchUserInfo = () => {
    const currentUserInfo = getCurrentUser();
    const sessionToken = getCurrentSessionToken();
    
    return fetch(`${SERVER_URL}/user/${user.id}`, {
      headers: {
        'user-id': currentUserInfo?.id || '',
        'session-token': sessionToken || ''
      }
    })
      .then(response => response.json())
      .then(data => {
        if (data.status === 'success') {
          return data.user;
        }
        throw new Error('获取用户信息失败');
      })
      .catch(error => {
        console.error('获取用户信息失败:', error);
        return null;
      });
  };

  if (user.id && user.username) {
    displayPopup(user);
  } else {
    fetchUserInfo().then(fullUser => {
      if (fullUser) {
        displayPopup(fullUser);
      } else {
        displayPopup(user);
      }
    });
  }

  function displayPopup(displayUser) {
    popupNickname.textContent = displayUser.nickname || '未知昵称';

    if (displayUser.username) {
      popupUsername.textContent = displayUser.username;
      popupUsername.style.display = 'block';
    } else {
      popupUsername.textContent = '';
      popupUsername.style.display = 'none';
    }

    const popupSignatureSection = document.getElementById('popupSignatureSection');
    const popupSignature = document.getElementById('popupSignature');
    if (popupSignatureSection && popupSignature) {
      const signature = displayUser.signature || '';
      if (signature && signature.trim()) {
        popupSignature.textContent = unescapeHtml(signature);
        popupSignatureSection.style.display = 'block';
      } else {
        popupSignatureSection.style.display = 'none';
      }
    }

    let avatarUrl = '';
    if (displayUser.avatarUrl && typeof displayUser.avatarUrl === 'string') {
      avatarUrl = displayUser.avatarUrl.trim();
    } else if (displayUser.avatar_url && typeof displayUser.avatar_url === 'string') {
      avatarUrl = displayUser.avatar_url.trim();
    } else if (displayUser.avatar && typeof displayUser.avatar === 'string') {
      avatarUrl = displayUser.avatar.trim();
    }

    if (avatarUrl) {
      const fullAvatarUrl = `${SERVER_URL}${avatarUrl}`;
      popupAvatarImg.src = fullAvatarUrl;
      popupAvatarImg.style.display = 'block';
      popupAvatarImg.style.cursor = 'pointer';
      popupAvatarImg.addEventListener('click', function() {
        if (typeof window.openImagePreview === 'function') {
          window.openImagePreview(popupAvatarImg.src);
        }
      });
      popupInitials.style.display = 'none';
    } else {
      const unescapedNickname = unescapeHtml(displayUser.nickname || '');
      const initials = unescapedNickname ? unescapedNickname.charAt(0).toUpperCase() : 'U';
      popupInitials.textContent = initials;
      popupInitials.style.display = 'block';
      popupAvatarImg.style.display = 'none';
    }

    popup.style.display = 'block';

    const popupRect = popup.getBoundingClientRect();
    const popupWidth = popupRect.width;
    const popupHeight = popupRect.height;

    let left = event.clientX + window.scrollX;
    let top = event.clientY + window.scrollY;

    if (left + popupWidth > window.innerWidth + window.scrollX) {
      left = window.innerWidth + window.scrollX - popupWidth - 10;
    }

    if (top + popupHeight > window.innerHeight + window.scrollY) {
      top = window.innerHeight + window.scrollY - popupHeight - 10;
    }

    if (left < window.scrollX) {
      left = window.scrollX + 10;
    }

    if (top < window.scrollY) {
      top = window.scrollY + 10;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    setTimeout(() => {
      document.addEventListener('click', hideUserAvatarPopup);
    }, 0);
  }
}

function hideUserAvatarPopup() {
  const popup = document.getElementById('userAvatarPopup');
  if (popup) {
    popup.style.display = 'none';
  }

  document.removeEventListener('click', hideUserAvatarPopup);
}

function initializeUserProfileModal() {
  const closeUserProfileModal = document.getElementById('closeUserProfileModal');
  const closeUserProfileButton = document.getElementById('closeUserProfileButton');

  if (closeUserProfileModal) {
    closeUserProfileModal.addEventListener('click', () => {
      document.getElementById('userProfileModal').style.display = 'none';
    });
  }

  if (closeUserProfileButton) {
    closeUserProfileButton.addEventListener('click', () => {
      document.getElementById('userProfileModal').style.display = 'none';
    });
  }
}

function initializeUserSearch() {
  const closeUserSearchModal = document.getElementById('closeUserSearchModal');
  const cancelUserSearch = document.getElementById('cancelUserSearch');

  if (closeUserSearchModal) {
    closeUserSearchModal.addEventListener('click', () => {
      document.getElementById('userSearchModal').style.display = 'none';
    });
  }

  if (cancelUserSearch) {
    cancelUserSearch.addEventListener('click', () => {
      document.getElementById('userSearchModal').style.display = 'none';
    });
  }

  const confirmUserSearch = document.getElementById('confirmUserSearch');
  if (confirmUserSearch) {
    confirmUserSearch.addEventListener('click', () => {
      const searchKeyword = document.getElementById('searchKeyword').value;
      if (searchKeyword.trim()) {
        searchUsers(searchKeyword.trim());
      }
    });
  }
}

function searchUsers(keyword) {
  const currentUser = getCurrentUser();
  const currentSessionToken = getCurrentSessionToken();
  
  if (!currentUser || !currentSessionToken) return;

  fetch(`${SERVER_URL}/user/search?keyword=${encodeURIComponent(keyword)}`, {
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

    const unescapedNickname = unescapeHtml(user.nickname || '');
    const unescapedUsername = unescapeHtml(user.username || '');

    let avatarHtml = '';
    if (avatarUrl) {
      const isSvgAvatar = /\.svg$/i.test(avatarUrl);
      if (isSvgAvatar) {
        const initials = unescapedNickname ? unescapedNickname.charAt(0).toUpperCase() : 'U';
        avatarHtml = `<span class="user-avatar">${initials}</span>`;
      } else {
        const fullAvatarUrl = `${SERVER_URL}${avatarUrl}`;
        avatarHtml = `<span class="user-avatar"><img src="${fullAvatarUrl}" alt="${unescapedNickname}"></span>`;
      }
    } else {
      const initials = unescapedNickname ? unescapedNickname.charAt(0).toUpperCase() : 'U';
      avatarHtml = `<span class="user-avatar">${initials}</span>`;
    }

    resultItem.innerHTML = `
      ${avatarHtml}
      <div class="search-result-info">
        <div class="search-result-nickname">${unescapedNickname}</div>
        <div class="search-result-username">@${unescapedUsername}</div>
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

export {
  initializeFriendsListListeners,
  switchToPrivateChat,
  initializePrivateChatFunctions,
  initializePrivateChatInterface,
  loadPrivateChatHistory,
  loadFriendsList,
  updateFriendsList,
  deleteFriend,
  showUserProfile,
  showUserAvatarPopup,
  hideUserAvatarPopup,
  initializeUserProfileModal,
  initializeUserSearch,
  searchUsers,
  displaySearchResults
};
