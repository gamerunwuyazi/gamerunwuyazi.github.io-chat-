import { SERVER_URL, toast } from './config.js';
import { 
  getStore, 
  getCurrentUser, 
  getCurrentSessionToken, 
  syncCurrentActiveChat 
} from './store.js';
import { currentUser, currentSessionToken } from './ui.js';

function showError(message) {
  if (typeof window.toast !== 'undefined' && window.toast.error) {
    window.toast.error(message);
  }
}

function showSuccess(message) {
  if (typeof window.toast !== 'undefined' && window.toast.success) {
    window.toast.success(message);
  }
}

// ============================================
// 文件上传功能模块
// 包含图片/文件上传、滚动加载、图片点击事件、事件委托等
// ============================================

/**
 * 上传图片到当前聊天（公共或群组）
 * @param {File} file - 要上传的图片文件
 */
function uploadImage(file) {
  syncCurrentActiveChat();
  
  const chat = String(window.currentActiveChat || 'main');
  
  if (chat.startsWith('private_')) {
    uploadPrivateImage(file);
    return;
  }
  
  if (!currentUser || !currentSessionToken) {
    currentUser = getCurrentUser();
    currentSessionToken = getCurrentSessionToken();
  }
  const store = getStore();
  
  const img = new Image();
  const reader = new FileReader();
  reader.onload = function(e) {
    img.onload = function() {
      const width = img.width;
      const height = img.height;

      const formData = new FormData();
      formData.append('image', file);
      formData.append('userId', currentUser.id);
      formData.append('width', width);
      formData.append('height', height);

      const isGroupChat = chat !== 'main';
      if (isGroupChat) {
        let groupId = chat;
        if (typeof groupId === 'string' && groupId.startsWith('group_')) {
          groupId = groupId.replace('group_', '');
        }
        formData.append('groupId', groupId);
      }

      if (store) {
        store.showUploadProgress = true;
        store.uploadProgress = 0;
      }

      fetch(`${SERVER_URL}/upload`, {
        method: 'POST',
        headers: {
          'user-id': currentUser.id,
          'session-token': currentSessionToken
        },
        body: formData
      })
        .then(response => {
          if (response.status === 413) {
            throw new Error('文件过大');
          }
          return response.json();
        })
        .then(data => {
          if (data.status === 'success') {
            // 上传成功，不做额外处理
          } else {
            showError(data.message || '图片上传失败');
          }
        })
        .catch(error => {
          if (error.message && error.message.includes('Failed to fetch')) {
            showError('文件过大');
          } else {
            showError(error.message || '图片上传失败，请稍后重试');
          }
        })
        .finally(() => {
          if (store) {
            store.showUploadProgress = false;
            store.uploadProgress = 0;
          }
        });
    };

    img.onerror = function() {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('userId', currentUser.id);

      const isGroupChat = chat !== 'main';
      if (isGroupChat) {
        let groupId = chat;
        if (typeof groupId === 'string' && groupId.startsWith('group_')) {
          groupId = groupId.replace('group_', '');
        }
        formData.append('groupId', groupId);
      }

      fetch(`${SERVER_URL}/upload`, {
        method: 'POST',
        headers: {
          'user-id': currentUser.id,
          'session-token': currentSessionToken
        },
        body: formData
      })
        .then(response => response.json())
        .then(data => {
          if (data.status !== 'success') {
            showError(data.message || '图片上传失败');
          }
        })
        .catch(() => {
          showError('图片上传失败，请稍后重试');
        });
    };

    img.src = e.target.result;
  };

  reader.readAsDataURL(file);
}

/**
 * 上传文件到当前聊天（公共或群组）
 * @param {File} file - 要上传的文件
 */
function uploadFile(file) {
  syncCurrentActiveChat();
  
  const chat = String(window.currentActiveChat || 'main');
  
  if (chat.startsWith('private_')) {
    uploadPrivateFile(file);
    return;
  }
  
  if (!currentUser || !currentSessionToken) {
    currentUser = getCurrentUser();
    currentSessionToken = getCurrentSessionToken();
  }
  const store = getStore();
  
  const formData = new FormData();
  formData.append('image', file);
  formData.append('userId', currentUser.id);

  const isGroupChat = chat !== 'main';
  if (isGroupChat) {
    let groupId = chat;
    if (typeof groupId === 'string' && groupId.startsWith('group_')) {
      groupId = groupId.replace('group_', '');
    }
    formData.append('groupId', groupId);
  }

  if (store) {
    store.showUploadProgress = true;
    store.uploadProgress = 0;
  }

  fetch(`${SERVER_URL}/upload`, {
    method: 'POST',
    headers: {
      'user-id': currentUser.id,
      'session-token': currentSessionToken
    },
    body: formData
  })
    .then(response => {
      if (response.status === 413) {
        throw new Error('文件过大');
      }
      return response.json();
    })
    .then(data => {
      if (data.status === 'success') {
        // 上传成功，不做额外处理
      } else {
        showError(data.message || '文件上传失败');
      }
    })
    .catch(error => {
      if (error.message && error.message.includes('Failed to fetch')) {
        showError('文件过大');
      } else {
        showError(error.message || '文件上传失败，请稍后重试');
      }
    })
    .finally(() => {
      if (store) {
        store.showUploadProgress = false;
        store.uploadProgress = 0;
      }
    });
}

/**
 * 上传私信图片
 * @param {File} file - 图片文件
 */
function uploadPrivateImage(file) {
  if (!currentUser || !currentSessionToken) {
    currentUser = getCurrentUser();
    currentSessionToken = getCurrentSessionToken();
  }
  
  if (!currentUser || !currentSessionToken) return;

  const privateChatUserId = window.currentPrivateChatUserId;
  if (!privateChatUserId) return;

  const store = getStore();
  const friendsList = store?.friendsList || [];
  const isFriend = friendsList.some(friend => String(friend.id) === String(privateChatUserId));
  if (!isFriend) {
    showError('您与该用户不是好友，无法发送私信');
    return;
  }

  const formData = new FormData();
  formData.append('image', file);
  formData.append('userId', currentUser.id);
  formData.append('privateChat', true);

  const uploadProgress = document.getElementById('privateUploadProgress');
  const uploadProgressBar = document.getElementById('privateUploadProgressBar');
  if (uploadProgress && uploadProgressBar) {
    uploadProgress.style.display = 'block';
    uploadProgressBar.style.width = '0%';
  }

  fetch(`${SERVER_URL}/upload`, {
    method: 'POST',
    headers: {
      'user-id': currentUser.id,
      'session-token': currentSessionToken
    },
    body: formData
  })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        const messageData = {
          userId: currentUser.id,
          content: JSON.stringify({ url: data.url, name: file.name }),
          receiverId: privateChatUserId,
          sessionToken: currentSessionToken,
          messageType: 1
        };

        if (window.chatSocket) {
          window.chatSocket.emit('private-message', messageData);
        }
      } else {
        showError(data.message || '图片上传失败');
      }
    })
    .catch(() => {
      showError('图片上传失败，请稍后重试');
    })
    .finally(() => {
      if (uploadProgress) {
        uploadProgress.style.display = 'none';
      }
      const privateImageInput = document.getElementById('privateImageInput');
      if (privateImageInput) {
        privateImageInput.value = '';
      }
    });
}

/**
 * 上传私信文件
 * @param {File} file - 文件
 */
function uploadPrivateFile(file) {
  if (!currentUser || !currentSessionToken) {
    currentUser = getCurrentUser();
    currentSessionToken = getCurrentSessionToken();
  }
  
  if (!currentUser || !currentSessionToken) return;

  const privateChatUserId = window.currentPrivateChatUserId;
  if (!privateChatUserId) return;

  const store = getStore();
  const friendsList = store?.friendsList || [];
  const isFriend = friendsList.some(friend => String(friend.id) === String(privateChatUserId));
  if (!isFriend) {
    showError('您与该用户不是好友，无法发送私信');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('userId', currentUser.id);
  formData.append('privateChat', true);

  const uploadProgress = document.getElementById('privateUploadProgress');
  const uploadProgressBar = document.getElementById('privateUploadProgressBar');
  if (uploadProgress && uploadProgressBar) {
    uploadProgress.style.display = 'block';
    uploadProgressBar.style.width = '0%';
  }

  fetch(`${SERVER_URL}/upload`, {
    method: 'POST',
    headers: {
      'user-id': currentUser.id,
      'session-token': currentSessionToken
    },
    body: formData
  })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        const messageData = {
          userId: currentUser.id,
          content: JSON.stringify({ url: data.url, name: file.name, size: file.size }),
          receiverId: privateChatUserId,
          sessionToken: currentSessionToken,
          messageType: 2
        };

        if (window.chatSocket) {
          window.chatSocket.emit('private-message', messageData);
        }
      } else {
        showError(data.message || '文件上传失败');
      }
    })
    .catch(() => {
      showError('文件上传失败，请稍后重试');
    })
    .finally(() => {
      if (uploadProgress) {
        uploadProgress.style.display = 'none';
      }
      const privateFileInput = document.getElementById('privateFileInput');
      if (privateFileInput) {
        privateFileInput.value = '';
      }
    });
}

/**
 * 上传用户头像
 * @param {File} file - 头像文件
 */
function uploadUserAvatar(file) {
  if (!currentUser || !currentSessionToken) {
    currentUser = getCurrentUser();
    currentSessionToken = getCurrentSessionToken();
  }
  
  if (!currentUser || !currentSessionToken) return;
  
  const formData = new FormData();
  formData.append('avatar', file);
  formData.append('userId', currentUser.id);

  fetch(`${SERVER_URL}/upload-avatar`, {
    method: 'POST',
    headers: {
      'session-token': currentSessionToken,
      'user-id': currentUser.id
    },
    body: formData
  })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        showSuccess('头像上传成功');

        // 更新本地用户信息
        if (data.avatarUrl) {
          currentUser.avatarUrl = data.avatarUrl;
          localStorage.setItem('currentUser', JSON.stringify(currentUser));

          // 更新UI中的头像
          const currentUserAvatar = document.getElementById('currentUserAvatar');
          if (currentUserAvatar) {
            currentUserAvatar.src = `${SERVER_URL}${data.avatarUrl}`;
            currentUserAvatar.style.display = 'block';
          }

          // 更新头像预览
          const currentAvatarImg = document.getElementById('currentAvatarImg');
          if (currentAvatarImg) {
            currentAvatarImg.src = `${SERVER_URL}${data.avatarUrl}`;
          }
        }

        // 重置上传按钮状态
        const uploadAvatarButton = document.getElementById('uploadAvatarButton');
        if (uploadAvatarButton) {
          uploadAvatarButton.disabled = true;
        }
      } else {
        showError(data.message || '头像上传失败');
      }
    })
    .catch(error => {
      showError('头像上传失败，请重试');
    });
}

/**
 * 初始化上传功能（绑定文件选择输入框事件）
 */
function initializeUpload() {
  const imageInput = document.getElementById('imageInput');
  if (imageInput) {
    imageInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        uploadImage(file);
        imageInput.value = '';
      }
    });
  }

  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        uploadFile(file);
        fileInput.value = '';
      }
    });
  }

  const privateImageInput = document.getElementById('privateImageInput');
  if (privateImageInput) {
    privateImageInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        uploadPrivateImage(file);
      }
    });
  }

  const privateFileInput = document.getElementById('privateFileInput');
  if (privateFileInput) {
    privateFileInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        uploadPrivateFile(file);
      }
    });
  }
}

/**
 * 初始化滚动加载历史消息
 * @param {boolean} force - 是否强制重新绑定滚动监听
 */
function initializeScrollLoading(force = false) {
  const messageContainer = document.getElementById('messageContainer');
  const groupMessageContainer = document.getElementById('groupMessageContainer');
  const privateMessageContainer = document.getElementById('privateMessageContainer');

  // console.log('[ScrollLoading] initializeScrollLoading被调用 - force:', force);

  if (window.isLoadingMoreMessages === undefined) {
    window.isLoadingMoreMessages = false;
  }
  if (window.loadingIndicatorTimeout === undefined) {
    window.loadingIndicatorTimeout = null;
  }

  function handleScroll(e, container, isGroup, isPrivate = false) {
    const chatType = isPrivate ? '私信' : (isGroup ? '群组' : '主聊天室');
    
    // console.log(`[ScrollLoading] [${chatType}] 滚动事件触发 - scrollTop: ${container.scrollTop}`);
    
    if (container.scrollTop < 50) {
      if (!window.isLoadingMoreMessages) {
        // console.log(`[ScrollLoading] [${chatType}] 检测到滚动到顶部附近，开始加载更多历史消息`);
        window.isLoadingMoreMessages = true;

        const prevScrollHeight = container.scrollHeight;
        const prevScrollTop = 0;
        
        if (isPrivate) {
          window.prevPrivateScrollHeight = prevScrollHeight;
          window.prevPrivateScrollTop = prevScrollTop;
        } else if (isGroup) {
          window.prevGroupScrollHeight = prevScrollHeight;
          window.prevGroupScrollTop = prevScrollTop;
        } else {
          window.prevPublicScrollHeight = prevScrollHeight;
          window.prevPublicScrollTop = prevScrollTop;
        }

        const store = getStore();
        let olderThan = null;
        let messages = [];

        if (isPrivate && store && store.privateMessages && window.currentPrivateChatUserId) {
          messages = store.privateMessages[window.currentPrivateChatUserId] || [];
        } else if (isGroup && store && store.groupMessages && window.currentGroupId) {
          messages = store.groupMessages[window.currentGroupId] || [];
        } else if (store && store.publicMessages) {
          messages = store.publicMessages || [];
        }

        if (messages.length > 0) {
          let minSequence = null;
          for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (msg.sequence !== undefined) {
              const sequence = parseInt(msg.sequence);
              if (!isNaN(sequence)) {
                if (minSequence === null || sequence < minSequence) {
                  minSequence = sequence;
                }
              }
            }
          }
          olderThan = minSequence;
        }

        if (!currentUser || !currentSessionToken) {
          currentUser = getCurrentUser();
          currentSessionToken = getCurrentSessionToken();
        }

        if (currentUser && currentSessionToken) {
          if (isGroup && window.currentGroupId) {
            window.chatSocket.emit('get-group-chat-history', {
              groupId: window.currentGroupId,
              sessionToken: currentSessionToken,
              userId: currentUser.id,
              limit: 20,
              loadMore: true,
              olderThan: olderThan
            });
          } else if (isPrivate && window.currentPrivateChatUserId) {
            window.chatSocket.emit('get-private-chat-history', {
              userId: currentUser.id,
              friendId: window.currentPrivateChatUserId,
              sessionToken: currentSessionToken,
              limit: 20,
              loadMore: true,
              olderThan: olderThan
            });
          } else {
            window.chatSocket.emit('get-chat-history', {
              userId: currentUser.id,
              sessionToken: currentSessionToken,
              limit: 20,
              loadMore: true,
              olderThan: olderThan
            });
          }

          window.loadingIndicatorTimeout = setTimeout(() => {
            if (window.isLoadingMoreMessages) {
              const loadingIndicator = document.createElement('div');
              loadingIndicator.className = 'loading-indicator';
              loadingIndicator.textContent = '加载中...';
              loadingIndicator.style.textAlign = 'center';
              loadingIndicator.style.padding = '10px';
              loadingIndicator.style.color = '#666';
              loadingIndicator.style.fontSize = '14px';
              container.insertBefore(loadingIndicator, container.firstChild);
            }
          }, 500);
        } else {
          window.isLoadingMoreMessages = false;
        }
      }
    }
  }

  function addScrollListener(container, isGroup, isPrivate) {
    if (!container) {
      return;
    }
    
    if (force) {
      container._scrollListenerAdded = false;
    }
    
    if (container._scrollListenerAdded) {
      return;
    }
    
    container._scrollListenerAdded = true;
    
    const scrollHandler = function(e) {
      handleScroll(e, this, isGroup, isPrivate);
    };
    
    container.addEventListener('scroll', scrollHandler);
  }

  addScrollListener(messageContainer, false, false);
  addScrollListener(groupMessageContainer, true, false);
  addScrollListener(privateMessageContainer, false, true);

  window.resetLoadingState = function() {
    window.isLoadingMoreMessages = false;
    if (window.loadingIndicatorTimeout) {
      clearTimeout(window.loadingIndicatorTimeout);
      window.loadingIndicatorTimeout = null;
    }

    const loadingIndicators = document.querySelectorAll('.loading-indicator');
    loadingIndicators.forEach(indicator => indicator.remove());
  };
}

/**
 * 初始化图片点击事件（预览图片）
 */
function initializeImageClickEvents() {
  const messageImages = document.querySelectorAll('.message-image');
  messageImages.forEach(img => {
    img.addEventListener('click', function() {
      const src = this.src;
      if (typeof window.openImagePreview === 'function') {
        window.openImagePreview(src);
      }
    });
  });
  
  const groupCardAvatars = document.querySelectorAll('.group-card-container img');
  groupCardAvatars.forEach(img => {
    img.addEventListener('click', function(e) {
      e.stopPropagation();
      const src = this.src;
      if (typeof window.openImagePreview === 'function') {
        window.openImagePreview(src);
      }
    });
  });
}

/**
 * 初始化事件委托（头像点击、图片预览）
 */
function initializeEventDelegation() {
  const messageContainer = document.getElementById('messageContainer');
  const groupMessageContainer = document.getElementById('groupMessageContainer');
  const privateMessageContainer = document.getElementById('privateMessageContainer');

  function handleAvatarClick(e) {
    let userId;
    let nickname = '';
    const store = getStore();
    const friendsList = store?.friendsList || [];
    const onlineUsersList = store?.onlineUsers || [];
    
    const messageElement = e.target.closest('.message-item');
    if (messageElement) {
      userId = messageElement.getAttribute('data-user-id');
      const nameElement = messageElement.querySelector('.message-nickname');
      if (nameElement) {
        nickname = nameElement.textContent;
      }
    } else {
      const friendItem = e.target.closest('.friend-item');
      if (friendItem) {
        const friendNameElement = friendItem.querySelector('.friend-name');
        if (friendNameElement) {
          nickname = friendNameElement.textContent;
          for (const friend of friendsList) {
            if (friend.nickname === nickname || friendNameElement.textContent.includes(friend.nickname)) {
              userId = friend.id;
              break;
            }
          }
        }
      }
      
      if (!userId) {
        const userElement = e.target.closest('[data-user-id]');
        if (userElement) {
          userId = userElement.getAttribute('data-user-id');
          if (userElement.hasAttribute('data-user-nickname')) {
            nickname = userElement.getAttribute('data-user-nickname');
          } else {
            const nameElement = userElement.querySelector('.friend-name, .user-name, .message-nickname');
            if (nameElement) {
              nickname = nameElement.textContent;
            }
          }
        }
      }
    }

    if (userId) {
      let fullUser = null;
      
      for (const onlineUser of onlineUsersList) {
        if (String(onlineUser.id) === String(userId)) {
          fullUser = onlineUser;
          break;
        }
      }
      
      if (!fullUser) {
        for (const friend of friendsList) {
          if (String(friend.id) === String(userId)) {
            fullUser = friend;
            break;
          }
        }
      }
      
      if (fullUser) {
        if (typeof window.showUserAvatarPopup === 'function') {
          window.showUserAvatarPopup(e, fullUser);
        }
      } else {
        if (typeof window.showUserAvatarPopup === 'function') {
          window.showUserAvatarPopup(e, { id: userId, nickname: nickname });
        }
      }
    }
  }

  if (messageContainer) {
    messageContainer.addEventListener('click', function(e) {
      if (e.target.classList.contains('message-image')) {
        const src = e.target.getAttribute('src');
        if (src && typeof window.openImagePreview === 'function') {
          window.openImagePreview(src);
        }
      } else if (e.target.classList.contains('user-avatar') || (e.target.tagName === 'IMG' && e.target.parentElement.classList.contains('user-avatar'))) {
        handleAvatarClick(e);
      }
    });
  }

  if (groupMessageContainer) {
    groupMessageContainer.addEventListener('click', function(e) {
      if (e.target.classList.contains('message-image')) {
        const src = e.target.getAttribute('src');
        if (src && typeof window.openImagePreview === 'function') {
          window.openImagePreview(src);
        }
      } else if (e.target.classList.contains('user-avatar') || (e.target.tagName === 'IMG' && e.target.parentElement.classList.contains('user-avatar'))) {
        handleAvatarClick(e);
      }
    });
  }

  if (privateMessageContainer) {
    privateMessageContainer.addEventListener('click', function(e) {
      const avatarElement = e.target.closest('.user-avatar');
      if (avatarElement) {
        e.stopPropagation();
        handleAvatarClick(e);
        return;
      }
      
      if (e.target.classList.contains('message-image')) {
        const src = e.target.getAttribute('src');
        if (src && typeof window.openImagePreview === 'function') {
          window.openImagePreview(src);
        }
      }
    });
  }
}

export {
  uploadImage,
  uploadFile,
  uploadPrivateImage,
  uploadPrivateFile,
  uploadUserAvatar,
  initializeUpload,
  initializeScrollLoading,
  initializeImageClickEvents,
  initializeEventDelegation,
  showError,
  showSuccess
};