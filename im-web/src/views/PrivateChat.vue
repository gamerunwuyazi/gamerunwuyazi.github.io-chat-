<template>
  <div class="chat-content" data-content="private-chat">
    <div v-if="!isPrivateChatVisible" class="empty-chat-state">
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
            <h2>{{ displayCurrentUserName }}</h2>
            <div class="user-status">
              {{ isUserOnline(chatStore.currentPrivateChatUserId) ? '在线' : '离线' }}
            </div>
          </div>
        </div>
        <div class="private-actions">
          <button id="privateUserInfoButton" title="查看用户资料" @click="handlePrivateUserInfoClick"><img src="/icon/User-Profile-256-2.ico" alt="查看用户资料" style="width: 15px; height: 15px;"></button>
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
        <template v-if="privateMessages.length !== 0">
          <PrivateMessageItem 
            v-for="message in privateMessages" 
            :key="message.id"
            :message="message"
            :is-own="isOwnMessage(message)"
          />
        </template>
        <div v-else class="empty-state">
          <h3>暂无私信</h3>
          <p>发送第一条消息开始聊天吧!</p>
        </div>
      </div>

      <div class="input-area">
        <QuotedMessagePreview v-if="chatStore.quotedMessage" :quoted-message="chatStore.quotedMessage" @close="chatStore.clearQuotedMessage()" />
        <div class="input-container" id="privateInputContainer"
          @drop="handlePrivateDrop"
          @dragover="handlePrivateDragOver"
          @dragenter="handlePrivateDragEnter"
          @dragleave="handlePrivateDragLeave">
          <div 
            ref="privateMessageInputRef"
            id="privateMessageInput" 
            class="editable-div" 
            placeholder="发送消息（Ctrl+Enter或Shift+Enter换行  打开md工具栏即可支持Markdown语法）" 
            contenteditable="true"
            @keydown="handlePrivateMessageInputKeydown"
            @input="handlePrivateMessageInput"
            @paste="handlePrivatePaste"
          ></div>
          <div v-if="isDragOver" class="drop-overlay">
            <div class="drop-content">
              <i class="fas fa-cloud-upload-alt"></i>
              <p>松开即可发送</p>
            </div>
          </div>
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
        <div v-if="showMoreFunctions" class="more-functions" id="privateMoreFunctions">
          <button id="privateImageUploadButton" title="上传图片" @click="handlePrivateImageUploadClick">
            📷 <span class="button-text">发送图片</span>
          </button>
          <button id="privateFileUploadButton" title="上传文件" @click="handlePrivateFileUploadClick">
            📤 <span class="button-text">发送文件</span>
          </button>
          <button id="privateSendGroupCardButton" title="发送群名片" @click="handleSendGroupCard">
            📱 <span class="button-text">发送群名片</span>
          </button>
          <button id="privateSearchMessageButton" title="查找消息" @click="openSearchModal">
            🔍 <span class="button-text">查找消息</span>
          </button>
        </div>
        <input v-if="showImageInput" type="file" ref="privateImageInputRef" id="privateImageInput" style="display: none;" accept="image/*" @change="handlePrivateImageUpload" @cancel="handlePrivateImageCancel">
        <input v-if="showFileInput" type="file" ref="privateFileInputRef" id="privateFileInput" style="display: none;" @change="handlePrivateFileUpload" @cancel="handlePrivateFileCancel">
      </div>

      <div v-if="chatStore.showUploadProgress" class="upload-progress" id="privateUploadProgress">
        <div class="upload-progress-bar" id="privateUploadProgressBar" :style="{ width: chatStore.uploadProgress + '%' }"></div>
      </div>

      <!-- 查找消息模态框 -->
      <Teleport to="body" v-if="showSearchModal">
        <div class="search-modal-overlay" @click.self="closeSearchModal">
          <div class="search-modal">
            <div class="search-modal-header">
              <h3>查找消息</h3>
              <button class="close-btn" @click="closeSearchModal">×</button>
            </div>
            <div class="search-modal-body">
              <div class="search-input-container">
                <input 
                  v-model="searchKeyword" 
                  type="text" 
                  placeholder="输入搜索内容..." 
                  @keyup.enter="executeSearch"
                  ref="searchInputRef"
                />
                <button class="search-btn" @click="executeSearch" :disabled="isSearching || !searchKeyword.trim()">
                  {{ isSearching ? '搜索中...' : '搜索' }}
                </button>
              </div>
              <div v-if="searchResults.length > 0" class="search-results">
                <div class="search-results-count">找到 {{ searchResults.length }} 条消息</div>
                <div class="search-results-list">
                  <div 
                    v-for="result in searchResults" 
                    :key="result.id" 
                    class="search-result-item"
                    @click="scrollToMessage(result)"
                  >
                    <div class="result-header">
                      <span class="result-nickname">{{ result.senderId === chatStore.currentUser?.id ? '我' : chatStore.currentPrivateChatNickname }}</span>
                      <span class="result-time">{{ formatTime(result.timestamp) }}</span>
                    </div>
                    <div class="result-content" v-html="highlightKeyword(result.content)"></div>
                  </div>
                </div>
              </div>
              <div v-else-if="searchKeyword && hasSearched && !isSearching" class="no-results">
                未找到匹配的消息
              </div>
            </div>
          </div>
        </div>
      </Teleport>
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
import QuotedMessagePreview from "@/components/MessageItem/QuotedMessagePreview.vue";

import {
  setActiveChat,
  loadPrivateChatHistory,
  initializeImageClickEvents,
  initializePrivateChatInterface,
  initializeScrollLoading,
  uploadPrivateImage,
  uploadPrivateFile,
  unescapeHtml
} from "@/utils/chat";

const chatStore = useChatStore();
const SERVER_URL = chatStore.SERVER_URL || process.env.VUE_APP_SERVER_URL || '';

const route = useRoute();
const privateMessageInputRef = ref(null);
const privateImageInputRef = ref(null);
const privateFileInputRef = ref(null);
const privateMessageContainerRef = ref(null);
const isDragOver = ref(false);
const showImageInput = ref(false);
const showFileInput = ref(false);
let dragCounter = 0;
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

function isNearBottom() {
  if (!privateMessageContainerRef.value) return false;
  const container = privateMessageContainerRef.value;
  const threshold = 150;
  return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
}

function refreshScrollPos() {
  // console.log('[PrivateChat] refreshScrollPos - 开始刷新滚动位置');
  // console.log('[PrivateChat] refreshScrollPos - window.prevPrivateScrollHeight:', window.prevPrivateScrollHeight);
  // console.log('[PrivateChat] refreshScrollPos - window.prevPrivateScrollTop:', window.prevPrivateScrollTop);
  
  if (window.prevPrivateScrollHeight === undefined || window.prevPrivateScrollTop === undefined) {
    // console.log('[PrivateChat] refreshScrollPos - 没有保存的滚动位置，跳过');
    return;
  }
  
  nextTick(() => {
    if (privateMessageContainerRef.value) {
      const scrollWrap = privateMessageContainerRef.value;
      const newScrollHeight = scrollWrap.scrollHeight;
      const offsetTop = newScrollHeight - window.prevPrivateScrollHeight;
      
      // 只有当 scrollHeight 真的发生变化时才调整滚动位置
      // 如果没有变化，说明没有加载到新消息，保持当前滚动位置
      if (offsetTop !== 0) {
        const newScrollTop = window.prevPrivateScrollTop + offsetTop;
        
        // console.log('[PrivateChat] refreshScrollPos - newScrollHeight:', newScrollHeight);
        // console.log('[PrivateChat] refreshScrollPos - offsetTop:', offsetTop);
        // console.log('[PrivateChat] refreshScrollPos - 新scrollTop:', newScrollTop);
        
        scrollWrap.scrollTop = newScrollTop;
      }
      
      window.prevPrivateScrollHeight = undefined;
      window.prevPrivateScrollTop = undefined;
      // console.log('[PrivateChat] refreshScrollPos - 滚动位置刷新完成');
    } else {
      // console.log('[PrivateChat] refreshScrollPos - 条件不满足，跳过刷新');
    }
  });
}

const isPrivateChatVisible = ref(false);
const currentUserName = ref('好友昵称');
const currentUserAvatarUrl = ref('');
const currentUserInitials = ref('U');
const showMarkdownToolbar = ref(false);
const showMoreFunctions = ref(false);

const displayCurrentUserName = computed(() => {
  return unescapeHtml(currentUserName.value || '好友昵称');
});

function applySavedPrivateState() {
  if (chatStore.currentPrivateChatUserId) {
    setActiveChat('private', chatStore.currentPrivateChatUserId, false);
    isPrivateChatVisible.value = true;
    currentUserName.value = chatStore.currentPrivateChatNickname;
    
    const avatarUrl = chatStore.currentPrivateChatAvatarUrl;
    if (avatarUrl) {
      currentUserAvatarUrl.value = avatarUrl.startsWith('http') ? avatarUrl : `${SERVER_URL}${avatarUrl}`;
    } else {
      currentUserAvatarUrl.value = '';
      const unescapedNickname = unescapeHtml(chatStore.currentPrivateChatNickname || '');
      currentUserInitials.value = unescapedNickname ? unescapedNickname.charAt(0).toUpperCase() : 'U';
    }
    
    initializePrivateChatInterface();
    loadPrivateChatHistory(chatStore.currentPrivateChatUserId);
    
    // 重新初始化滚动监听器
    nextTick(() => {
      initializeScrollLoading(true);
    });
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
    const input = privateMessageInputRef.value;
    
    // 清理只包含br标签的空内容（但不清理包含空格的内容）
    const textContent = input.textContent;
    const htmlContent = input.innerHTML;
    
    // 只有当内容真的为空或只有br标签时才清空
    // 注意：textContent 包含空格时长度不为0，所以不会误清空
    if (textContent === '' && (!htmlContent || htmlContent === '<br>' || htmlContent === '<br/>' || htmlContent === '<br />')) {
      input.innerHTML = '';
      return;
    }
    
    chatStore.privateMessageInput = input.textContent || input.innerHTML;
    
    const maxHeight = 180;
    if (input.scrollHeight > maxHeight) {
      input.style.overflowY = 'auto';
    } else {
      input.style.overflowY = 'hidden';
    }
    
    input.scrollTop = input.scrollHeight;
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
    // 发送消息后滚动到底部
    scrollToBottom();
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
  
  const input = privateMessageInputRef.value;
  
  if (input.tagName === 'DIV' && input.isContentEditable) {
    document.execCommand('insertHTML', false, '<br><br>');
  }
}

function handlePrivatePaste(e) {
  const items = e.clipboardData.items;
  let hasImageOrFile = false;
  
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        uploadPrivateImage(file);
      }
      hasImageOrFile = true;
      break;
    } else if (item.type === 'application/octet-stream') {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        uploadPrivateFile(file);
      }
      hasImageOrFile = true;
      break;
    }
  }
  
  if (!hasImageOrFile) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text');
    if (text) {
      document.execCommand('insertText', false, text);
    }
  }
}

function handlePrivateDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}

function handlePrivateDragEnter(e) {
  e.preventDefault();
  dragCounter++;
  if (dragCounter === 1) {
    isDragOver.value = true;
  }
}

function handlePrivateDragLeave(e) {
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0) {
    isDragOver.value = false;
  }
}

function handlePrivateDrop(e) {
  e.preventDefault();
  dragCounter = 0;
  isDragOver.value = false;
  
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        uploadPrivateImage(file);
      } else {
        uploadPrivateFile(file);
      }
    }
    return;
  }
  
  const items = e.dataTransfer.items;
  if (items) {
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          if (file.type.startsWith('image/')) {
            uploadPrivateImage(file);
          } else {
            uploadPrivateFile(file);
          }
        }
        return;
      }
    }
  }
  
  const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
  if (text) {
    const privateMessageInput = document.getElementById('privateMessageInput');
    if (privateMessageInput) {
      privateMessageInput.focus();
      document.execCommand('insertText', false, text);
    }
  }
}

function handlePrivateImageUploadClick() {
  showImageInput.value = true;
  nextTick(() => {
    if (privateImageInputRef.value) {
      privateImageInputRef.value.click();
    }
  });
}

function handlePrivateFileUploadClick() {
  showFileInput.value = true;
  nextTick(() => {
    if (privateFileInputRef.value) {
      privateFileInputRef.value.click();
    }
  });
}

function handlePrivateImageUpload(e) {
  const file = e.target.files[0];
  if (file) {
    uploadPrivateImage(file);
  }
  showImageInput.value = false;
  if (privateImageInputRef.value) {
    privateImageInputRef.value.value = '';
  }
}

function handlePrivateImageCancel() {
  showImageInput.value = false;
}

function handlePrivateFileUpload(e) {
  const file = e.target.files[0];
  if (file) {
    uploadPrivateFile(file);
  }
  showFileInput.value = false;
  if (privateFileInputRef.value) {
    privateFileInputRef.value.value = '';
  }
}

function handlePrivateFileCancel() {
  showFileInput.value = false;
}

// 查找消息功能
const showSearchModal = ref(false);
const searchKeyword = ref('');
const searchResults = ref([]);
const isSearching = ref(false);
const hasSearched = ref(false);
const searchInputRef = ref(null);

function openSearchModal() {
  showSearchModal.value = true;
  showMoreFunctions.value = false;
  nextTick(() => {
    if (searchInputRef.value) {
      searchInputRef.value.focus();
    }
  });
}

function closeSearchModal() {
  showSearchModal.value = false;
  searchKeyword.value = '';
  searchResults.value = [];
  hasSearched.value = false;
}

async function executeSearch() {
  if (!searchKeyword.value.trim()) return;
  
  isSearching.value = true;
  hasSearched.value = false;
  searchResults.value = [];
  
  try {
    const friendId = chatStore.currentPrivateChatUserId;
    const messages = chatStore.privateMessages[friendId] || [];
    
    // 如果消息数量不足，发送加载更多事件
    if (messages.length < 200) {
      for (let i = 0; i < 10; i++) {
        if (chatStore.privateMessages[friendId]?.length >= 200) break;
        
        const currentMessages = chatStore.privateMessages[friendId] || [];
        const oldestMessage = currentMessages[0];
        if (!oldestMessage) break;
        
        if (window.chatSocket && window.chatSocket.connected) {
          await new Promise((resolve) => {
            let resolved = false;
            const handler = () => {
              if (resolved) return;
              resolved = true;
              window.chatSocket.off('private-chat-history', handler);
              setTimeout(resolve, 100);
            };
            window.chatSocket.on('private-chat-history', handler);
            
            window.chatSocket.emit('get-private-chat-history', {
              userId: chatStore.currentUser?.id,
              friendId: friendId,
              sessionToken: chatStore.currentSessionToken,
              limit: 20,
              loadMore: true,
              olderThan: oldestMessage.id
            });
            
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                window.chatSocket.off('private-chat-history', handler);
                resolve();
              }
            }, 3000);
          });
        }
      }
    }
    
    const allMessages = chatStore.privateMessages[friendId] || [];
    const keyword = searchKeyword.value.trim().toLowerCase();
    
    searchResults.value = allMessages
      .filter(msg => {
        const content = msg.content?.toLowerCase() || '';
        return content.includes(keyword);
      })
      .reverse();
    
    hasSearched.value = true;
  } catch (err) {
    console.error('搜索失败:', err);
  } finally {
    isSearching.value = false;
  }
}

function highlightKeyword(content) {
  if (!content || !searchKeyword.value) return content;
  
  const keyword = searchKeyword.value.trim();
  const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return content.replace(regex, '<mark class="search-highlight">$1</mark>');
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } else {
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
}

function scrollToMessage(message) {
  closeSearchModal();
  
  const friendId = chatStore.currentPrivateChatUserId;
  const messages = chatStore.privateMessages[friendId] || [];
  const messageIndex = messages.findIndex(m => m.id === message.id);
  
  if (messageIndex !== -1 && privateMessageContainerRef.value) {
    const container = privateMessageContainerRef.value;
    const messageElements = container.querySelectorAll('.message');
    const targetElement = messageElements[messageIndex];
    
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        const isOwn = targetElement.classList.contains('own-message');
        const originalBg = isOwn ? '#E8F5E8' : '#FFFFFF';
        targetElement.style.backgroundColor = 'rgba(76, 175, 80, 0.6)';
        targetElement.classList.add('active');
        setTimeout(() => {
          targetElement.style.backgroundColor = originalBg;
          setTimeout(() => {
            targetElement.classList.remove('active');
          }, 500);
        }, 3000);
      }, 500);
    }
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
      currentUserAvatarUrl.value = avatarUrl.startsWith('http') ? avatarUrl : `${SERVER_URL}${avatarUrl}`;
    } else {
      currentUserAvatarUrl.value = '';
      const unescapedNickname = unescapeHtml(chatStore.currentPrivateChatNickname || '');
      currentUserInitials.value = unescapedNickname ? unescapedNickname.charAt(0).toUpperCase() : 'U';
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
  
  document.addEventListener('click', function(e) {
    const copyButton = e.target.closest('.copy-button');
    if (copyButton) {
      const code = copyButton.getAttribute('data-code');
      if (code) {
        const decodedCode = decodeURIComponent(code);
        const unescapedCode = decodedCode
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ');
        navigator.clipboard.writeText(unescapedCode).then(() => {
          const notice = copyButton.closest('.highlight-tools').querySelector('.copy-notice');
          if (notice) {
            notice.textContent = '已复制';
            notice.style.color = '#4CAF50';
            setTimeout(() => {
              notice.textContent = '';
            }, 2000);
          }
        }).catch(err => {
          console.error('复制失败:', err);
        });
      }
    }
  });
});

onUnmounted(() => {
  window.removeEventListener('private-switched', handlePrivateSwitched);
});

watch(
  () => chatStore.currentPrivateChatUserId,
  (newUserId, oldUserId) => {
    if (newUserId && newUserId !== oldUserId) {
      window.prevPrivateScrollHeight = undefined;
      window.prevPrivateScrollTop = undefined;
      window.isLoadingMoreMessages = false;
      if (window.scrollingInitialized) {
        window.scrollingInitialized.private = false;
      }
      if (window.privateChatAllLoaded && window.privateChatAllLoaded[newUserId] === undefined) {
        window.privateChatAllLoaded[newUserId] = false;
      }
      
      nextTick(() => {
        if (privateMessageContainerRef.value) {
          privateMessageContainerRef.value.scrollTop = 0;
        }
        scrollToBottom();
        setTimeout(() => {
          initializeScrollLoading(true);
        }, 100);
        setTimeout(() => {
          if (window.scrollingInitialized) {
            window.scrollingInitialized.private = true;
          }
        }, 600);
      });
    }
    if (!newUserId) {
      isPrivateChatVisible.value = false;
    }
  }
);

watch(
  () => privateMessages.value,
  (newMessages) => {
    if (window.isLoadingMoreMessages) {
      refreshScrollPos();
      setTimeout(() => {
        if (typeof window.resetLoadingState === 'function') {
          window.resetLoadingState();
        }
      }, 100);
    } else if (newMessages.length > previousPrivateMessageLength && !window.isLoadingMoreMessages) {
      if (isNearBottom()) {
        scrollToBottom();
      }
    }
    previousPrivateMessageLength = newMessages.length;
  },
  { deep: true }
);

watch(
  () => route.path,
  (newPath) => {
    if (newPath.startsWith('/chat/private')) {
      window.prevPrivateScrollHeight = undefined;
      window.prevPrivateScrollTop = undefined;
      window.isLoadingMoreMessages = false;
      if (window.scrollingInitialized) {
        window.scrollingInitialized.private = false;
      }
      
      scrollToBottom();
      // 切换到私信聊天时清除引用消息
      if (chatStore.clearQuotedMessage) {
        chatStore.clearQuotedMessage();
      }
      // 切换到私信聊天时，清除其他会话的消息，只保留最近 20 条
      if (chatStore.clearOtherGroupMessages) {
        chatStore.clearOtherGroupMessages(null);
      }
      if (chatStore.clearOtherPrivateMessages) {
        chatStore.clearOtherPrivateMessages(chatStore.currentPrivateChatUserId);
      }
      if (chatStore.clearPublicMessagesExceptRecent) {
        chatStore.clearPublicMessagesExceptRecent();
      }
      nextTick(() => {
        initializeScrollLoading(true);
      });
      setTimeout(() => {
        if (window.scrollingInitialized) {
          window.scrollingInitialized.private = true;
        }
      }, 600);
    }
  }
);
</script>
