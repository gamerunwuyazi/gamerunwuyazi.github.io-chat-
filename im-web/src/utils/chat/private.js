import { SERVER_URL, toast } from './config.js';
import { updateUnreadCountsDisplay, setActiveChatDirect } from './ui.js';
import { 
  getStore, 
  getCurrentUser, 
  getCurrentSessionToken, 
  sessionStore, 
  unreadMessages 
} from './store.js';
import { unescapeHtml } from './message.js';
import modal from '../modal.js';
import localForage from 'localforage';

let friendsList = [];

function initializeFriendsListListeners() {
  // 好友搜索功能已移至 Vue 组件 (PrivateSidebar.vue)
}

function switchToPrivateChat(userId, nickname, username, avatarUrl) {
  // console.log(`🔄 [切换私信] 切换到私信会话 - userId=${userId}, nickname=${nickname}`);
  const store = getStore();
  
  // 保存当前私信的草稿并重新设置侧边栏的 [草稿] 标记
  const currentPrivateUserId = store?.currentPrivateChatUserId?.value ?? store?.currentPrivateChatUserId;
  if (currentPrivateUserId) {
    const privateMessageInput = document.getElementById('privateMessageInput');
    if (privateMessageInput) {
      const content = privateMessageInput.textContent || privateMessageInput.innerHTML || '';
      store.saveDraft('private', currentPrivateUserId, content);
    }
    // 离开当前会话时，重新设置侧边栏的 [草稿] 标记
    store.setLastMessageToDraft('private', currentPrivateUserId);
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

  // 同步到 window（关键：用于加载更多历史消息）
  window.currentPrivateChatUserId = userId;
  
  // 重置该会话的全部加载标志
  if (!window.privateChatAllLoaded) {
    window.privateChatAllLoaded = {};
  }
  delete window.privateChatAllLoaded[userId];
  
  if (store) {
    // 同时重置 chatStore 中的标记
    if (store.setPrivateAllLoaded) {
      store.setPrivateAllLoaded(userId, false);
    }
    // console.log(`🔄 [切换私信] 重置会话 ${userId} 的全部加载标志 - window.privateChatAllLoaded[${userId}] 已删除`);
    store.currentPrivateChatUserId = userId;
    store.currentPrivateChatUsername = username;
    store.currentPrivateChatNickname = nickname;
    store.currentPrivateChatAvatarUrl = avatarUrl;
    store.currentActiveChat = `private_${userId}`;
    
    // 清零该会话的未读计数
    if (store.clearPrivateUnread) {
      store.clearPrivateUnread(userId);
    }
  }

  // 直接调用 setActiveChatDirect，不保存新私信的草稿
  setActiveChatDirect('private', userId, true);

  // 跳转到私信页面
  if (window.router && window.router.currentRoute.value.path !== '/chat/private') {
    window.router.push('/chat/private');
  }

  window.dispatchEvent(new CustomEvent('private-switched'));
  
  // 更新未读计数显示
  if (typeof window.updateUnreadCountsDisplay === 'function') {
    window.updateUnreadCountsDisplay();
  }
  if (typeof window.updateTitleWithUnreadCount === 'function') {
    window.updateTitleWithUnreadCount();
  }
  
  const hasMessages = store && store.privateMessages && store.privateMessages[userId] && store.privateMessages[userId].length > 0;
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
      }
    });
  }
}

export function initializePrivateMessageSending() {
  // 私信消息发送、图片上传、文件上传等事件已在 Vue 组件中处理
}

function loadPrivateChatHistory(userId) {
  // 不再发送加入事件，直接从 chatStore 渲染本地存储的消息
}

function loadFriendsList() {
  const currentUser = getCurrentUser();
  const currentSessionToken = getCurrentSessionToken();
  
  if (!currentUser || !currentSessionToken) return;

  // 异步请求服务器数据进行更新
  fetch(`${SERVER_URL}/api/user/friends`, {
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

async function updateFriendsList(friends) {
  friendsList = friends;

  if (window.chatStore) {
    const userId = window.chatStore.currentUser?.id || 'guest';
    const prefix = `chats-${userId}`;

    // 获取现有的好友列表，保留 deleted_at 字段
    const existingFriends = window.chatStore.friendsList || [];
    const existingFriendMap = new Map();
    existingFriends.forEach(f => existingFriendMap.set(String(f.id), f));

    // 收集服务器返回的好友ID
    const serverFriendIds = new Set(friends.map(f => String(f.id)));

    // 第一步：从 chatKeys 读取所有好友会话
    let chatKeysData = null;
    try {
      chatKeysData = await localForage.getItem(prefix);
    } catch (e) {
      console.error('读取 chatKeys 失败:', e);
    }
    
    // 收集所有本地存在的好友ID（从 chatKeys）
    const localFriendIdsFromKeys = new Set();
    if (chatKeysData && chatKeysData.chatKeys) {
      chatKeysData.chatKeys.forEach(key => {
        if (key.includes('-private-')) {
          const friendId = key.split('-private-')[1];
          localFriendIdsFromKeys.add(friendId);
        }
      });
    }

    // 第二步：确保服务器返回的所有好友都在 chatKeys 中
    const newChatKeys = chatKeysData && chatKeysData.chatKeys ? [...chatKeysData.chatKeys] : [];
    for (const friend of friends) {
      const friendIdStr = String(friend.id);
      const key = `${prefix}-private-${friendIdStr}`;
      if (!localFriendIdsFromKeys.has(friendIdStr)) {
        newChatKeys.push(key);
        localFriendIdsFromKeys.add(friendIdStr);
      }
    }
    // 更新 chatKeys
    try {
      await localForage.setItem(prefix, { chatKeys: newChatKeys });
    } catch (e) {
      console.error('更新 chatKeys 失败:', e);
    }

    // 第三步：把服务器返回的信息保存到 IndexedDB
    for (const friend of friends) {
      const existingFriend = existingFriendMap.get(String(friend.id));
      
      // 更新 IndexedDB 中的会话信息
      try {
        const key = `${prefix}-private-${friend.id}`;
        const existingData = await localForage.getItem(key) || { messages: [] };
        const updatedSessionData = { ...existingData };
        if (friend.nickname) updatedSessionData.nickname = friend.nickname;
        if (friend.username) updatedSessionData.username = friend.username;
        if (friend.avatar_url) updatedSessionData.avatarUrl = friend.avatar_url;
        else if (friend.avatarUrl) updatedSessionData.avatarUrl = friend.avatarUrl;
        
        // 如果服务器返回了这个好友，但本地标记了deleted_at，取消标记
        delete updatedSessionData.deleted_at;
        
        await localForage.setItem(key, updatedSessionData);
      } catch (e) {
        console.error('更新IndexedDB中的好友会话信息失败:', e);
      }
    }

    // 第四步：处理 chatKeys 中所有不在服务器返回列表中的好友，标记为已删除
    for (const friendId of localFriendIdsFromKeys) {
      const friendIdStr = String(friendId);
      if (!serverFriendIds.has(friendIdStr)) {
        // 先从 IndexedDB 读取，检查是否已经标记为已删除
        try {
          const key = `${prefix}-private-${friendId}`;
          const existingData = await localForage.getItem(key);
          if (!existingData?.deleted_at) {
            let updatedSessionData;
            if (existingData) {
              updatedSessionData = { ...existingData };
            } else {
              // 从 existingFriends 中获取好友信息
              const existingFriend = existingFriendMap.get(friendIdStr);
              updatedSessionData = { messages: [] };
              if (existingFriend) {
                if (existingFriend.nickname) updatedSessionData.nickname = existingFriend.nickname;
                if (existingFriend.username) updatedSessionData.username = existingFriend.username;
                if (existingFriend.avatar_url) updatedSessionData.avatarUrl = existingFriend.avatar_url;
                else if (existingFriend.avatarUrl) updatedSessionData.avatarUrl = existingFriend.avatarUrl;
              }
            }
            
            // 发现缺少昵称时直接请求 API 补全信息
            if (!updatedSessionData.nickname) {
              try {
                const response = await fetch(`${SERVER_URL}/api/user/${friendId}`, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
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

    // 第五步：直接从 IndexedDB 加载所有好友到 store
    const allFriends = [];
    for (const friendId of localFriendIdsFromKeys) {
      try {
        const key = `${prefix}-private-${friendId}`;
        const data = await localForage.getItem(key);
        if (data) {
          let friendNickname = data.nickname || '用户';
          
          // 发现缺少昵称时直接请求 API 补全信息
          if (!data.nickname) {
            try {
              const response = await fetch(`/api/user/${friendId}`, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('token')}`
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
                  // 保存获取到的信息到IndexedDB
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
          
          // 优先使用 IndexedDB 中保存的 last_message_time
          if (data.last_message_time) {
            friend.last_message_time = data.last_message_time;
          }
          
          // 从IndexedDB加载最后消息
          if (data.messages && data.messages.length > 0) {
            const validMessages = data.messages.filter(m => m.messageType !== 101 && m.messageType !== 103);
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

    // 设置到 store
    window.chatStore.friendsList = allFriends;
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
          const store = getStore();
          
          // 用户自己操作删除，清空本地消息
          if (store && store.markFriendAsDeleted) {
            store.markFriendAsDeleted(userId, true);
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
  const store = getStore();
  const currentFriend = store?.friendsList?.find(f => String(f.id) === String(user.id));
  if (currentFriend && currentFriend.deleted_at != null) {
    if (typeof window.openModal === 'function') {
      window.openModal('userProfile', currentFriend);
    } else if (window.chatStore) {
      window.chatStore.openModal('userProfile', currentFriend);
    }
    return;
  }
  
  const currentUserInfo = getCurrentUser();
  const sessionToken = getCurrentSessionToken();

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
    
    return fetch(`${SERVER_URL}/api/user/${user.id}`, {
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
        popupSignature.textContent = signature;
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
      const nickname = displayUser.nickname || '';
      const initials = nickname ? nickname.charAt(0).toUpperCase() : 'U';
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
