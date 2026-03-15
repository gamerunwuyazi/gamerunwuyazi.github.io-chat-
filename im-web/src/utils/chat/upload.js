import { SERVER_URL } from './config.js';
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

function uploadWithProgress(url, formData, store, onSuccess, onError) {
  const xhr = new XMLHttpRequest();
  
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable && store) {
      const percentComplete = Math.round((e.loaded / e.total) * 100);
      store.uploadProgress = percentComplete;
    }
  });
  
  xhr.addEventListener('load', () => {
    if (store) {
      store.showUploadProgress = false;
      store.uploadProgress = 0;
    }
    
    if (xhr.status === 413) {
      onError('文件过大');
      return;
    }
    
    try {
      const data = JSON.parse(xhr.responseText);
      if (data.status === 'success') {
        onSuccess(data);
      } else {
        onError(data.message || '上传失败');
      }
    } catch (e) {
      onError('上传失败，请稍后重试');
    }
  });
  
  xhr.addEventListener('error', () => {
    if (store) {
      store.showUploadProgress = false;
      store.uploadProgress = 0;
    }
    onError('上传失败，请稍后重试');
  });
  
  xhr.addEventListener('abort', () => {
    if (store) {
      store.showUploadProgress = false;
      store.uploadProgress = 0;
    }
  });
  
  xhr.open('POST', url);
  xhr.setRequestHeader('user-id', currentUser.id);
  xhr.setRequestHeader('session-token', currentSessionToken);
  xhr.send(formData);
}

function uploadImage(file) {
  syncCurrentActiveChat();
  
  const chat = String(window.currentActiveChat || 'main');
  
  if (chat.startsWith('private_')) {
    uploadPrivateImage(file);
    return;
  }
  
  const user = currentUser || getCurrentUser();
  const token = currentSessionToken || getCurrentSessionToken();
  if (!user || !token) {
    return;
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
      formData.append('userId', user.id);
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

      uploadWithProgress(
        `${SERVER_URL}/upload`,
        formData,
        store,
        () => {},
        () => showError('上传失败')
      );
    };

    img.onerror = function() {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('userId', user.id);

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

      uploadWithProgress(
        `${SERVER_URL}/upload`,
        formData,
        store,
        () => {},
        () => showError('上传失败')
      );
    };

    img.src = e.target.result;
  };

  reader.readAsDataURL(file);
}

function uploadFile(file) {
  syncCurrentActiveChat();
  
  const chat = String(window.currentActiveChat || 'main');
  
  if (chat.startsWith('private_')) {
    uploadPrivateFile(file);
    return;
  }
  
  const user = currentUser || getCurrentUser();
  const token = currentSessionToken || getCurrentSessionToken();
  if (!user || !token) {
    return;
  }
  const store = getStore();
  
  const formData = new FormData();
  formData.append('image', file);
  formData.append('userId', user.id);

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

  uploadWithProgress(
    `${SERVER_URL}/upload`,
    formData,
    store,
    () => {},
    () => showError('上传失败')
  );
}

function uploadPrivateImage(file) {
  const user = currentUser || getCurrentUser();
  const token = currentSessionToken || getCurrentSessionToken();
  
  if (!user || !token) return;

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
  formData.append('userId', user.id);
  formData.append('privateChat', true);

  if (store) {
    store.showUploadProgress = true;
    store.uploadProgress = 0;
  }

  uploadWithProgress(
    `${SERVER_URL}/upload`,
    formData,
    store,
    (data) => {
      const messageData = {
        userId: user.id,
        content: JSON.stringify({ url: data.url, name: file.name }),
        receiverId: privateChatUserId,
        sessionToken: token,
        messageType: 1
      };

      if (window.chatSocket) {
        window.chatSocket.emit('private-message', messageData);
      }
    },
    () => showError('上传失败')
  );
}

function uploadPrivateFile(file) {
  const user = currentUser || getCurrentUser();
  const token = currentSessionToken || getCurrentSessionToken();
  
  if (!user || !token) return;

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
  formData.append('userId', user.id);
  formData.append('privateChat', true);

  if (store) {
    store.showUploadProgress = true;
    store.uploadProgress = 0;
  }

  uploadWithProgress(
    `${SERVER_URL}/upload`,
    formData,
    store,
    (data) => {
      const messageData = {
        userId: user.id,
        content: JSON.stringify({ url: data.url, name: file.name, size: file.size }),
        receiverId: privateChatUserId,
        sessionToken: token,
        messageType: 2
      };

      if (window.chatSocket) {
        window.chatSocket.emit('private-message', messageData);
      }
    },
    () => showError('上传失败')
  );
}

function uploadUserAvatar(file) {
  const user = currentUser || getCurrentUser();
  const token = currentSessionToken || getCurrentSessionToken();
  
  if (!user || !token) return;
  
  const formData = new FormData();
  formData.append('avatar', file);
  formData.append('userId', user.id);

  fetch(`${SERVER_URL}/upload-avatar`, {
    method: 'POST',
    headers: {
      'session-token': token,
      'user-id': user.id
    },
    body: formData
  })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        showSuccess('头像上传成功');

        if (data.avatarUrl) {
          const updatedUser = { ...user, avatarUrl: data.avatarUrl };
          localStorage.setItem('currentUser', JSON.stringify(updatedUser));

          const currentUserAvatar = document.getElementById('currentUserAvatar');
          if (currentUserAvatar) {
            currentUserAvatar.src = `${SERVER_URL}${data.avatarUrl}`;
            currentUserAvatar.style.display = 'block';
          }

          const currentAvatarImg = document.getElementById('currentAvatarImg');
          if (currentAvatarImg) {
            currentAvatarImg.src = `${SERVER_URL}${data.avatarUrl}`;
          }
        }

        const uploadAvatarButton = document.getElementById('uploadAvatarButton');
        if (uploadAvatarButton) {
          uploadAvatarButton.disabled = true;
        }
      } else {
        showError(data.message || '头像上传失败');
      }
    })
    .catch(() => {
      showError('头像上传失败，请重试');
    });
}

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

function initializeScrollLoading(force = false) {
  const messageContainer = document.getElementById('messageContainer');
  const groupMessageContainer = document.getElementById('groupMessageContainer');
  const privateMessageContainer = document.getElementById('privateMessageContainer');

  if (window.isLoadingMoreMessages === undefined) {
    window.isLoadingMoreMessages = false;
  }
  if (window.loadingIndicatorTimeout === undefined) {
    window.loadingIndicatorTimeout = null;
  }
  if (window.scrollingInitialized === undefined) {
    window.scrollingInitialized = {};
  }
  if (window.privateChatAllLoaded === undefined) {
    window.privateChatAllLoaded = {};
  }

  function handleScroll(e, container, isGroup, isPrivate = false) {
    const containerId = isPrivate ? 'private' : (isGroup ? 'group' : 'public');
    
    if (container.scrollTop < 50) {
      if (isPrivate && window.currentPrivateChatUserId) {
        if (window.privateChatAllLoaded[window.currentPrivateChatUserId]) {
          return;
        }
      }
      
      if (!window.isLoadingMoreMessages && window.scrollingInitialized[containerId]) {
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
          olderThan = messages[0].id;
        }

        const user = currentUser || getCurrentUser();
        const token = currentSessionToken || getCurrentSessionToken();

        if (user && token && window.loadMessages) {
          if (isGroup && window.currentGroupId) {
            window.loadMessages('group', {
              groupId: window.currentGroupId,
              limit: 20,
              olderThan: olderThan,
              loadMore: true
            });
          } else if (isPrivate && window.currentPrivateChatUserId) {
            window.loadMessages('private', {
              friendId: window.currentPrivateChatUserId,
              limit: 20,
              olderThan: olderThan,
              loadMore: true
            });
          } else {
            window.loadMessages('global', {
              limit: 20,
              olderThan: olderThan,
              loadMore: true
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

  setTimeout(() => {
    window.scrollingInitialized = {
      public: true,
      group: true,
      private: true
    };
  }, 500);

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