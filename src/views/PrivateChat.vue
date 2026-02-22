<template>
  <div class="chat-content" data-content="private-chat">
    <div v-if="!isPrivateChatVisible" class="empty-chat-state">
      <div class="empty-icon">👤</div>
      <h3>选择一个好友开始聊天</h3>
      <p>请从左侧好友列表中选择一个好友，开始私聊会话</p>
    </div>

    <div v-else class="private-chat-interface">
      <div class="private-header">
        <div class="private-user-info">
          <div class="private-user-avatar">
            <img v-if="currentUserAvatarUrl" :src="currentUserAvatarUrl" alt="用户头像" class="user-avatar-img" loading="lazy" width="40" height="40" style="aspect-ratio: 1/1; object-fit: cover;">
            <span v-else class="user-initials">{{ currentUserInitials }}</span>
          </div>
          <div class="private-user-details">
            <h2 v-html="currentUserName"></h2>
            <div class="user-status">
              {{ isUserOnline(chatStore.currentPrivateChatUserId) ? '在线' : '离线' }}
            </div>
          </div>
        </div>
        <div class="private-actions">
          <button id="privateUserInfoButton" title="查看用户资料" @click="handlePrivateUserInfoClick">👤</button>
          <button id="deleteFriendButton" title="删除好友" @click="handleDeleteFriendClick">🗑️</button>
        </div>
      </div>

      <div class="markdown-toolbar private-markdown-toolbar" v-if="showMarkdownToolbar">
        <button class="markdown-btn" @click="insertMarkdown('**', '**', '粗体文本')">粗体</button>
        <button class="markdown-btn" @click="insertMarkdown('_', '_', '斜体文本')">斜体</button>
        <button class="markdown-btn" @click="insertMarkdown('`', '`', '代码')">代码</button>
        <button class="markdown-btn" @click="insertMarkdown('```\n', '\n```', '代码块')">代码块</button>
        <button class="markdown-btn" @click="insertMarkdown('# ', '', '标题')">标题</button>
        <button class="markdown-btn" @click="insertMarkdown('- ', '', '列表项')">列表</button>
        <button class="markdown-btn" @click="insertMarkdown('> ', '', '引用文本')">引用</button>
        <button class="markdown-btn" @click="insertMarkdown('[链接描述](', ')', '链接文本')">链接</button>
        <button class="markdown-btn" @click="insertMarkdown('![图片无法显示时的文字](', ')', '图片URL')">图片</button>
      </div>

      <div id="privateMessageContainer" ref="privateMessageContainerRef">
        <PrivateMessageItem 
          v-for="message in privateMessages" 
          :key="message.id || message.sequence"
          :message="message"
          :is-own="isOwnMessage(message)"
        />
        <div v-if="privateMessages.length === 0" class="empty-state">
          <h3>暂无私信</h3>
          <p>发送第一条消息开始聊天吧!</p>
        </div>
      </div>

      <div class="input-area">
        <div class="input-container" id="privateInputContainer">
          <div 
            ref="privateMessageInputRef"
            id="privateMessageInput" 
            class="editable-div" 
            placeholder="发送消息（Ctrl+Enter或Shift+Enter换行  支持Markdown语法）" 
            contenteditable="true"
            @keydown="handlePrivateMessageInputKeydown"
            @input="handlePrivateMessageInput"
            @paste="handlePrivatePaste"
          ></div>
        </div>
        <div class="input-buttons" id="privateInputButtons">
          <button id="sendPrivateMessage" @click="handleSendPrivateMessage">发送</button>
          <button id="privateMoreButton" class="more-button" title="更多功能" @click="toggleMoreFunctions">
            ⋯ <span class="button-text">更多</span>
          </button>
          <button class="toggle-btn" 
            style="background: #f1f1f1; border: 1px solid #ddd; border-radius: 4px; padding: 5px 10px; font-size: 12px; cursor: pointer; color: #666; transition: all 0.2s; margin-left: 5px;"
            @click="toggleMarkdownToolbar">
            <i v-if="!showMarkdownToolbar" class="fas fa-chevron-down"></i>
            <i v-else class="fas fa-chevron-up"></i>
            {{ showMarkdownToolbar ? ' 隐藏Markdown工具栏' : ' MD' }}
          </button>
        </div>
        <div class="more-functions" id="privateMoreFunctions" :style="{ display: showMoreFunctions ? 'block' : 'none' }">
          <button id="privateImageUploadButton" title="上传图片" @click="handlePrivateImageUploadClick">
            📷 <span class="button-text">发送图片</span>
          </button>
          <button id="privateFileUploadButton" title="上传文件" @click="handlePrivateFileUploadClick">
            📤 <span class="button-text">发送文件</span>
          </button>
          <button id="privateSendGroupCardButton" title="发送群名片" @click="handleSendGroupCard">
            📱 <span class="button-text">发送群名片</span>
          </button>
        </div>
        <input type="file" ref="privateImageInputRef" id="privateImageInput" style="display: none;" accept="image/*" @change="handlePrivateImageUpload">
        <input type="file" ref="privateFileInputRef" id="privateFileInput" style="display: none;" @change="handlePrivateFileUpload">
      </div>

      <div class="upload-progress" id="privateUploadProgress" :style="{ display: chatStore.showUploadProgress ? 'block' : 'none' }">
        <div class="upload-progress-bar" id="privateUploadProgressBar" :style="{ width: chatStore.uploadProgress + '%' }"></div>
      </div>
    </div>
  </div>
</template>

<style src="@/css/index.css"></style>
<style src="@/css/code-highlight.css"></style>
<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from "vue";
import { useChatStore } from "@/stores/chatStore";
import { useRoute } from "vue-router";
import PrivateMessageItem from "@/components/MessageItem/PrivateMessageItem.vue";
import {
  setActiveChat,
  loadPrivateChatHistory,
  initializeImageClickEvents,
  initializePrivateChatInterface,
  initializeScrollLoading,
  uploadPrivateImage,
  uploadPrivateFile
} from "@/utils/chat";
import toast from "@/utils/toast";

const chatStore = useChatStore();
const route = useRoute();
const privateMessageInputRef = ref(null);
const privateImageInputRef = ref(null);
const privateFileInputRef = ref(null);
const privateMessageContainerRef = ref(null);
let previousPrivateMessageLength = 0;

const currentUserId = computed(() => chatStore.currentUser?.id);

const privateMessages = computed(() => {
  return chatStore.privateMessages[chatStore.currentPrivateChatUserId] || [];
});

function isOwnMessage(message) {
  if (!currentUserId.value) return false;
  return String(message.userId) === String(currentUserId.value) || 
         (message.user && String(message.user.id) === String(currentUserId.value)) ||
         String(message.senderId) === String(currentUserId.value);
}

function scrollToBottom() {
  nextTick(() => {
    if (privateMessageContainerRef.value) {
      privateMessageContainerRef.value.scrollTop = privateMessageContainerRef.value.scrollHeight;
    }
  });
}

function refreshScrollPos() {
  // console.log('[PrivateChat] refreshScrollPos - 开始刷新滚动位置');
  // console.log('[PrivateChat] refreshScrollPos - window.prevPrivateScrollHeight:', window.prevPrivateScrollHeight);
  // console.log('[PrivateChat] refreshScrollPos - window.prevPrivateScrollTop:', window.prevPrivateScrollTop);
  
  nextTick(() => {
    if (privateMessageContainerRef.value && window.prevPrivateScrollHeight !== undefined && window.prevPrivateScrollTop !== undefined) {
      const scrollWrap = privateMessageContainerRef.value;
      const newScrollHeight = scrollWrap.scrollHeight;
      const offsetTop = newScrollHeight - window.prevPrivateScrollHeight;
      const newScrollTop = window.prevPrivateScrollTop + offsetTop;
      
      // console.log('[PrivateChat] refreshScrollPos - newScrollHeight:', newScrollHeight);
      // console.log('[PrivateChat] refreshScrollPos - offsetTop:', offsetTop);
      // console.log('[PrivateChat] refreshScrollPos - 新scrollTop:', newScrollTop);
      
      scrollWrap.scrollTop = newScrollTop;
      
      window.prevPrivateScrollHeight = undefined;
      window.prevPrivateScrollTop = undefined;
      // console.log('[PrivateChat] refreshScrollPos - 滚动位置刷新完成');
    } else {
      // console.log('[PrivateChat] refreshScrollPos - 条件不满足，跳过刷新');
    }
  });
}

window.privateRefreshScrollPos = refreshScrollPos;

const isPrivateChatVisible = ref(false);
const currentUserName = ref('好友昵称');
const currentUserAvatarUrl = ref('');
const currentUserInitials = ref('U');
const showMarkdownToolbar = ref(false);
const showMoreFunctions = ref(false);

function applySavedPrivateState() {
  if (chatStore.currentPrivateChatUserId) {
    setActiveChat('private', chatStore.currentPrivateChatUserId, false);
    isPrivateChatVisible.value = true;
    currentUserName.value = chatStore.currentPrivateChatNickname;
    
    const avatarUrl = chatStore.currentPrivateChatAvatarUrl;
    if (avatarUrl) {
      currentUserAvatarUrl.value = `https://back.hs.airoe.cn${avatarUrl}`;
    } else {
      currentUserAvatarUrl.value = '';
      currentUserInitials.value = chatStore.currentPrivateChatNickname ? chatStore.currentPrivateChatNickname.charAt(0).toUpperCase() : 'U';
    }
    
    initializePrivateChatInterface();
    loadPrivateChatHistory(chatStore.currentPrivateChatUserId);
  }
}

function toggleMarkdownToolbar() {
  showMarkdownToolbar.value = !showMarkdownToolbar.value;
}

function toggleMoreFunctions() {
  showMoreFunctions.value = !showMoreFunctions.value;
}

function handlePrivateMessageInput() {
  if (privateMessageInputRef.value) {
    chatStore.privateMessageInput = privateMessageInputRef.value.textContent || privateMessageInputRef.value.innerHTML;
  }
}

function handlePrivateMessageInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
    e.preventDefault();
    handleSendPrivateMessage();
  } else if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    insertPrivateNewLine();
  }
}

function handleSendPrivateMessage() {
  if (window.sendPrivateMessage) {
    window.sendPrivateMessage();
  }
}

function handleSendGroupCard() {
  if (window.showSendGroupCardModal) {
    window.showSendGroupCardModal('private');
  }
}

function handlePrivateUserInfoClick() {
  const user = {
    id: chatStore.currentPrivateChatUserId,
    nickname: chatStore.currentPrivateChatNickname,
    username: chatStore.currentPrivateChatUsername,
    avatarUrl: chatStore.currentPrivateChatAvatarUrl
  };
  
  if (typeof window.showUserProfile === 'function') {
    window.showUserProfile(user);
  } else {
    chatStore.openModal('userProfile', user);
  }
}

function handleDeleteFriendClick() {
  if (!chatStore.currentPrivateChatUserId) {
    toast.warning('请先选择一个好友');
    return;
  }
  const user = chatStore.currentUser;
  const sessionToken = chatStore.currentSessionToken;
  
  if (!user || !sessionToken) {
    toast.warning('请先登录');
    return;
  }
  
  if (confirm('确定要删除这个好友吗？')) {
    fetch(`${chatStore.SERVER_URL}/user/remove-friend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': user.id,
        'session-token': sessionToken
      },
      body: JSON.stringify({
        friendId: chatStore.currentPrivateChatUserId
      })
    })
      .then(response => response.json())
      .then(data => {
        if (data.status === 'success') {
          toast.success('删除好友成功');
          if (window.loadFriendsList) {
            window.loadFriendsList();
          }
          isPrivateChatVisible.value = false;
        } else {
          toast.error(data.message || '删除好友失败');
        }
      })
      .catch(() => {
        toast.error('删除好友失败，网络错误');
      });
  }
}

function insertMarkdown(prefix, suffix, sample) {
  if (!privateMessageInputRef.value) return;
  
  const input = privateMessageInputRef.value;
  input.focus();
  
  const selection = window.getSelection();
  const range = selection.getRangeAt(0);
  
  let selectedText = range.toString();
  if (!selectedText) selectedText = sample;
  
  const textNode = document.createTextNode(prefix + selectedText + suffix);
  range.deleteContents();
  range.insertNode(textNode);
  
  range.setStartAfter(textNode);
  range.setEndAfter(textNode);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertPrivateNewLine() {
  if (!privateMessageInputRef.value) return;
  
  const selection = window.getSelection();
  const range = selection.getRangeAt(0);
  
  const br = document.createElement('br');
  range.deleteContents();
  range.insertNode(br);
  
  range.setStartAfter(br);
  range.setEndAfter(br);
  selection.removeAllRanges();
  selection.addRange(range);
}

function handlePrivatePaste(e) {
  const items = e.clipboardData.items;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        uploadPrivateImage(file);
      }
      break;
    } else if (item.type === 'application/octet-stream') {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        uploadPrivateFile(file);
      }
      break;
    }
  }
}

function handlePrivateImageUploadClick() {
  if (privateImageInputRef.value) {
    privateImageInputRef.value.click();
  }
}

function handlePrivateFileUploadClick() {
  if (privateFileInputRef.value) {
    privateFileInputRef.value.click();
  }
}

function handlePrivateImageUpload(e) {
  const file = e.target.files[0];
  if (file) {
    uploadPrivateImage(file);
  }
  if (privateImageInputRef.value) {
    privateImageInputRef.value.value = '';
  }
}

function handlePrivateFileUpload(e) {
  const file = e.target.files[0];
  if (file) {
    uploadPrivateFile(file);
  }
  if (privateFileInputRef.value) {
    privateFileInputRef.value.value = '';
  }
}

function isUserOnline(userId) {
  return chatStore.onlineUsers.some(user => String(user.id) === String(userId));
}

function handlePrivateSwitched() {
  if (chatStore.currentPrivateChatUserId) {
    isPrivateChatVisible.value = true;
    currentUserName.value = chatStore.currentPrivateChatNickname;
    
    const avatarUrl = chatStore.currentPrivateChatAvatarUrl;
    if (avatarUrl) {
      currentUserAvatarUrl.value = `https://back.hs.airoe.cn${avatarUrl}`;
    } else {
      currentUserAvatarUrl.value = '';
      currentUserInitials.value = chatStore.currentPrivateChatNickname ? chatStore.currentPrivateChatNickname.charAt(0).toUpperCase() : 'U';
    }
    
    // 切换私信后，重新初始化滚动监听器
    setTimeout(() => {
      initializeScrollLoading(true);
    }, 100);
  }
}

onMounted(() => {
  applySavedPrivateState();
  
  setTimeout(() => {
    initializeScrollLoading(true);
  }, 100);

  setTimeout(() => {
    initializeImageClickEvents();
  }, 500);

  window.addEventListener('private-switched', handlePrivateSwitched);
  scrollToBottom();
});

onUnmounted(() => {
  window.removeEventListener('private-switched', handlePrivateSwitched);
});

watch(
  () => chatStore.currentPrivateChatUserId,
  (newUserId, oldUserId) => {
    if (newUserId && newUserId !== oldUserId) {
      nextTick(() => {
        if (privateMessageContainerRef.value) {
          privateMessageContainerRef.value.scrollTop = 0;
        }
        // 切换私信后，重新初始化滚动监听器
        setTimeout(() => {
          initializeScrollLoading(true);
        }, 100);
      });
    }
  }
);

watch(
  () => privateMessages.value,
  (newMessages) => {
    // console.log('[PrivateChat] 私信消息变化 - isLoadingMoreMessages:', window.isLoadingMoreMessages);
    // console.log('[PrivateChat] 私信消息变化 - 新消息数量:', newMessages.length);
    // console.log('[PrivateChat] 私信消息变化 - 旧消息数量:', previousPrivateMessageLength);
    
    if (window.isLoadingMoreMessages) {
      // console.log('[PrivateChat] 检测到加载更多历史消息，开始刷新滚动位置');
      refreshScrollPos();
      setTimeout(() => {
        if (typeof window.resetLoadingState === 'function') {
          // console.log('[PrivateChat] 调用window.resetLoadingState清除加载状态');
          window.resetLoadingState();
        }
      }, 100);
    } else if (newMessages.length > previousPrivateMessageLength && !window.isLoadingMoreMessages) {
      // console.log('[PrivateChat] 检测到新消息，滚动到底部');
      scrollToBottom();
    }
    previousPrivateMessageLength = newMessages.length;
  },
  { deep: true }
);

watch(
  () => route.path,
  (newPath) => {
    if (newPath.startsWith('/chat/private')) {
      scrollToBottom();
      nextTick(() => {
        initializeScrollLoading(true);
      });
    }
  }
);
</script>
