import { SERVER_URL, toast } from './config.js';
import { 
  getStore, 
  getCurrentUser, 
  getCurrentSessionToken, 
  sessionStore, 
  unreadMessages 
} from './store.js';
import { escapeHtml, unescapeHtml, sendPrivateMessage } from './message.js';

let friendsList = [];

function initializeFriendsListListeners() {
  const privateChatSearchInput = document.getElementById('privateChatSearchInput');
  const clearPrivateChatSearch = document.getElementById('clearPrivateChatSearch');

  if (privateChatSearchInput && clearPrivateChatSearch) {
    privateChatSearchInput.addEventListener('input', () => {
      const keyword = privateChatSearchInput.value.toLowerCase();
      const friendItems = document.querySelectorAll('.friend-item');

      friendItems.forEach(item => {
        const friendName = item.dataset.userNickname.toLowerCase();
        if (friendName.includes(keyword)) {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
      });

      if (keyword) {
        clearPrivateChatSearch.style.display = 'inline';
      } else {
        clearPrivateChatSearch.style.display = 'none';
      }
    });

    clearPrivateChatSearch.addEventListener('click', () => {
      privateChatSearchInput.value = '';
      clearPrivateChatSearch.style.display = 'none';
      const friendItems = document.querySelectorAll('.friend-item');
      friendItems.forEach(item => {
        item.style.display = 'flex';
      });
    });
  }

  const searchUserButton = document.getElementById('searchUserButton');
  if (searchUserButton) {
    searchUserButton.addEventListener('click', () => {
      if (typeof window.openModal === 'function') {
        window.openModal('userSearch');
      }
    });
  }
}

function switchToPrivateChat(userId, nickname, username, avatarUrl) {
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

  window.dispatchEvent(new CustomEvent('private-switched'));
  
  loadPrivateChatHistory(userId);
}

function initializePrivateChatFunctions() {
  initializeFriendsListListeners();
  initializeUserProfileModal();
  initializeUserSearch();
  initializePrivateMessageSending();
  initializePrivateChatInterface();
}

function initializePrivateChatInterface() {
  const deleteFriendButton = document.getElementById('deleteFriendButton');
  if (deleteFriendButton) {
    deleteFriendButton.onclick = null;
    deleteFriendButton.onclick = () => {
      const currentPrivateChatUserId = sessionStore.currentPrivateChatUserId;
      if (currentPrivateChatUserId) {
        deleteFriend(currentPrivateChatUserId);
      }
    };
  }

  const privateUserInfoButton = document.getElementById('privateUserInfoButton');
  if (privateUserInfoButton) {
    privateUserInfoButton.onclick = null;
    privateUserInfoButton.onclick = () => {
      const currentPrivateChatUserId = sessionStore.currentPrivateChatUserId;
      const currentPrivateChatUsername = sessionStore.currentPrivateChatUsername;
      const currentPrivateChatNickname = sessionStore.currentPrivateChatNickname;
      
      if (currentPrivateChatUserId && currentPrivateChatUsername) {
        const privateUserAvatar = document.getElementById('privateUserAvatar');
        let avatarUrl = '';
        if (privateUserAvatar && privateUserAvatar.src && privateUserAvatar.src !== '') {
          if (privateUserAvatar.src.startsWith(SERVER_URL)) {
            avatarUrl = privateUserAvatar.src.replace(SERVER_URL, '');
          } else if (privateUserAvatar.src.startsWith('http')) {
            avatarUrl = privateUserAvatar.src;
          }
        }

        const user = {
          id: currentPrivateChatUserId,
          nickname: currentPrivateChatNickname,
          avatarUrl: avatarUrl,
          username: currentPrivateChatUsername
        };
        showUserProfile(user);
      }
    };
  }

  const privateMoreButton = document.getElementById('privateMoreButton');
  if (privateMoreButton) {
    privateMoreButton.onclick = null;
    privateMoreButton.onclick = (e) => {
      e.stopPropagation();
      const privateMoreFunctions = document.getElementById('privateMoreFunctions');
      if (privateMoreFunctions) {
        privateMoreFunctions.classList.toggle('show');
      }
    };
  }

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
            sessionToken: currentSessionToken,
            onlyClearUnread: true
          });
        }
      }
    });
  }
}

export function initializePrivateMessageSending() {
  const sendPrivateMessageButton = document.getElementById('sendPrivateMessage');
  if (sendPrivateMessageButton) {
    sendPrivateMessageButton.addEventListener('click', () => {
      sendPrivateMessage();
    });
  }

  const privateMessageInput = document.getElementById('privateMessageInput');
  if (privateMessageInput) {
    privateMessageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        sendPrivateMessage();
      } else if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        
        if (privateMessageInput.tagName === 'DIV' && privateMessageInput.isContentEditable) {
          const selection = window.getSelection();
          const range = selection.getRangeAt(0);
          
          const br = document.createElement('br');
          
          range.deleteContents();
          range.insertNode(br);
          
          range.setStartAfter(br);
          range.setEndAfter(br);
          
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          const start = privateMessageInput.selectionStart;
          const end = privateMessageInput.selectionEnd;
          
          const value = privateMessageInput.value;
          privateMessageInput.value = value.substring(0, start) + '\n' + value.substring(end);
          
          const newPosition = start + 1;
          privateMessageInput.setSelectionRange(newPosition, newPosition);
          
          privateMessageInput.focus();
        }
      }
    });
  }

  const markdownToolbar = document.getElementById('privateMarkdownToolbar');
  if (markdownToolbar) {
    const markdownButtons = markdownToolbar.querySelectorAll('.markdown-btn');
    markdownButtons.forEach(button => {
      button.addEventListener('click', function(e) {
        e.stopPropagation();

        const prefix = button.getAttribute('data-prefix') || '';
        const suffix = button.getAttribute('data-suffix') || '';
        const sample = button.getAttribute('data-sample') || '';

        if (typeof window.insertMarkdownFormat === 'function') {
          window.insertMarkdownFormat(prefix, suffix, sample);
        }
      });
    });
  }

  const privateImageUploadButton = document.getElementById('privateImageUploadButton');
  const privateImageInput = document.getElementById('privateImageInput');
  if (privateImageUploadButton && privateImageInput) {
    privateImageUploadButton.onclick = null;
    privateImageInput.onchange = null;

    privateImageUploadButton.onclick = () => {
      privateImageInput.click();
    };

    privateImageInput.onchange = function() {
      if (this.files && this.files[0]) {
        if (typeof window.uploadPrivateImage === 'function') {
          window.uploadPrivateImage(this.files[0]);
        }
      }
    };
  }

  const privateFileUploadButton = document.getElementById('privateFileUploadButton');
  const privateFileInput = document.getElementById('privateFileInput');
  if (privateFileUploadButton && privateFileInput) {
    privateFileUploadButton.onclick = null;
    privateFileInput.onchange = null;

    privateFileUploadButton.onclick = () => {
      privateFileInput.click();
    };

    privateFileInput.onchange = function() {
      if (this.files && this.files[0]) {
        if (this.files[0].type.startsWith('image/')) {
          if (typeof window.uploadPrivateImage === 'function') {
            window.uploadPrivateImage(this.files[0]);
          }
        } else {
          if (typeof window.uploadPrivateFile === 'function') {
            window.uploadPrivateFile(this.files[0]);
          }
        }
      }
    };
  }

  if (privateMessageInput) {
    privateMessageInput.addEventListener('paste', function(e) {
      const items = e.clipboardData.items;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file && typeof window.uploadPrivateImage === 'function') {
            window.uploadPrivateImage(file);
          }
          break;
        } else if (item.type === 'application/octet-stream') {
          e.preventDefault();
          const file = item.getAsFile();
          if (file && typeof window.uploadPrivateFile === 'function') {
            window.uploadPrivateFile(file);
          }
          break;
        }
      }
    });
  }
}

function loadPrivateChatHistory(userId) {
  const currentUser = getCurrentUser();
  const currentSessionToken = getCurrentSessionToken();
  
  if (!currentUser || !currentSessionToken) return;

  if (window.chatSocket) {
    window.chatSocket.emit('join-private-chat', {
      userId: currentUser.id,
      friendId: userId,
      sessionToken: currentSessionToken
    });
  }
}

window.withdrawPrivateMessage = function(messageId) {
  const currentUser = getCurrentUser();
  const currentSessionToken = getCurrentSessionToken();
  
  if (!currentUser || !currentSessionToken) return;

  if (window.chatSocket) {
    window.chatSocket.emit('withdraw-private-message', {
      userId: currentUser.id,
      messageId: messageId,
      sessionToken: currentSessionToken
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
    window.chatStore.friendsList = [...friends];
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

function deleteFriend(userId) {
  const currentUser = getCurrentUser();
  const currentSessionToken = getCurrentSessionToken();
  
  if (!currentUser || !currentSessionToken) return;

  if (confirm('确定要删除这个好友吗？')) {
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
  if (typeof window.openModal === 'function') {
    window.openModal('userProfile', user);
  }
  
  setTimeout(() => {
    const modalUserAvatar = document.getElementById('modalUserAvatar');
    const modalUserInitials = document.getElementById('modalUserInitials');
    const modalUserNickname = document.getElementById('modalUserNickname');
    const modalUsername = document.getElementById('modalUsername');
    const modalUserId = document.getElementById('modalUserId');
    const modalUserStatus = document.getElementById('modalUserStatus');

    if (!modalUserAvatar || !modalUserInitials || !modalUserNickname || !modalUsername || !modalUserId || !modalUserStatus) return;

    modalUserNickname.textContent = '加载中...';
    modalUsername.textContent = '';
    modalUserId.textContent = user.id || '';
    modalUserStatus.textContent = '';
    
    const signatureSection = document.querySelector('#userProfileModal .signature-section');
    if (signatureSection) {
      signatureSection.style.display = 'none';
    }

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
        if (data.status === 'success' && data.user) {
          displayUserInfo(data.user);
        } else {
          displayUserInfo(user);
        }
      })
      .catch(_error => {
        console.error('获取用户信息失败:', _error);
        displayUserInfo(user);
      });
  }, 100);
}

function displayUserInfo(user) {
  const modalUserAvatar = document.getElementById('modalUserAvatar');
  const modalUserInitials = document.getElementById('modalUserInitials');
  const modalUserNickname = document.getElementById('modalUserNickname');
  const modalUsername = document.getElementById('modalUsername');
  const modalUserId = document.getElementById('modalUserId');

  if (!modalUserAvatar || !modalUserInitials || !modalUserNickname || !modalUsername || !modalUserId) return;

  modalUserNickname.textContent = user.nickname || '未知昵称';
  modalUsername.textContent = user.username || '';
  modalUserId.textContent = user.id || '';

  let avatarUrl = '';
  if (user.avatarUrl && typeof user.avatarUrl === 'string') {
    avatarUrl = user.avatarUrl.trim();
  } else if (user.avatar_url && typeof user.avatar_url === 'string') {
    avatarUrl = user.avatar_url.trim();
  } else if (user.avatar && typeof user.avatar === 'string') {
    avatarUrl = user.avatar.trim();
  }

  if (avatarUrl) {
    const fullAvatarUrl = `${SERVER_URL}${avatarUrl}`;
    modalUserAvatar.src = fullAvatarUrl;
    modalUserAvatar.style.display = 'block';
    modalUserInitials.style.display = 'none';
  } else {
    const initials = user.nickname ? user.nickname.charAt(0).toUpperCase() : 'U';
    modalUserInitials.textContent = initials;
    modalUserInitials.style.display = 'block';
    modalUserAvatar.style.display = 'none';
  }

  const signatureSection = document.querySelector('#userProfileModal .signature-section');
  const signatureElement = document.getElementById('modalUserSignature');
  if (signatureSection && signatureElement && user.signature) {
    signatureElement.textContent = unescapeHtml(user.signature);
    signatureSection.style.display = 'block';
  }
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

  if (isFriend || isCurrentUser) {
    popupAddFriend.textContent = '已添加';
    popupAddFriend.style.backgroundColor = '#ccc';
    popupAddFriend.style.cursor = 'not-allowed';
    popupAddFriend.disabled = true;
    popupAddFriend.onclick = null;
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
      const initials = displayUser.nickname ? displayUser.nickname.charAt(0).toUpperCase() : 'U';
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

    let avatarHtml = '';
    if (avatarUrl) {
      const isSvgAvatar = /\.svg$/i.test(avatarUrl);
      if (isSvgAvatar) {
        const initials = user.nickname ? user.nickname.charAt(0).toUpperCase() : 'U';
        avatarHtml = `<span class="user-avatar">${initials}</span>`;
      } else {
        const fullAvatarUrl = `${SERVER_URL}${avatarUrl}`;
        avatarHtml = `<span class="user-avatar"><img src="${fullAvatarUrl}" alt="${user.nickname}"></span>`;
      }
    } else {
      const initials = user.nickname ? user.nickname.charAt(0).toUpperCase() : 'U';
      avatarHtml = `<span class="user-avatar">${initials}</span>`;
    }

    resultItem.innerHTML = `
      ${avatarHtml}
      <div class="search-result-info">
        <div class="search-result-nickname">${user.nickname}</div>
        <div class="search-result-username">@${user.username}</div>
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
