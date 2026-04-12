<template>
  <div class="chat-content" data-content="public-chat">
    <div id="markdownToolbar" class="markdown-toolbar" v-if="showMarkdownToolbar">
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

    <div id="messageContainer" ref="messageContainerRef">
      <template v-if="chatStore.publicMessages.length !== 0">
        <PublicMessageItem
          v-for="message in chatStore.publicMessages" 
          :key="message.id"
          :message="message"
          :is-own="isOwnMessage(message)"
        />
      </template>
      <div v-else class="empty-state" id="emptyState">
        <h3>暂无消息</h3>
        <p>发送第一条消息开始聊天吧!</p>
      </div>
    </div>

    <div class="input-area">
      <QuotedMessagePreview v-if="chatStore.quotedMessage" :quoted-message="chatStore.quotedMessage" @close="chatStore.clearQuotedMessage()" />
      <div class="input-container" id="mainInputContainer" 
        @drop="handleDrop"
        @dragover="handleDragOver"
        @dragenter="handleDragEnter"
        @dragleave="handleDragLeave">
        <div 
          ref="messageInputRef"
          id="messageInput" 
          class="editable-div" 
          placeholder="发送消息（Ctrl+Enter或Shift+Enter换行  打开md工具栏即可支持Markdown语法）" 
          contenteditable="true"
          @keydown="handleMessageInputKeydown"
          @input="handleMessageInput"
          @paste="handlePaste"
          @compositionstart="isComposing = true"
          @compositionend="handleCompositionEnd"
        ></div>
        <!-- @ 提示选择器 -->
        <div v-if="showAtPicker" class="at-picker" :style="{ top: atPickerPosition.top + 'px', left: atPickerPosition.left + 'px' }">
          <div 
            v-for="(user, index) in filteredAtSuggestions" 
            :key="user.id"
            class="at-picker-item"
            :class="{ selected: index === selectedAtIndex }"
            @click="selectAtUser(user)"
          >
            <div class="user-avatar-wrapper">
              <component 
                :is="getAvatarIsImage(user) ? 'img' : 'div'"
                :src="getAvatarIsImage(user) ? getFullAvatarUrl(user) : undefined"
                :alt="user.nickname"
                class="user-avatar"
                :class="{ 'default-avatar': !getAvatarIsImage(user) }"
                @error="handleAvatarError(user.id)"
              >
                {{ !getAvatarIsImage(user) ? getUserInitials(user) : '' }}
              </component>
            </div>
            <span class="at-picker-nickname">{{ user.nickname }}</span>
          </div>
          <div v-if="filteredAtSuggestions.length === 0" class="at-picker-empty">暂无在线用户</div>
        </div>
        <div v-if="isDragOver" class="drop-overlay">
          <div class="drop-content">
            <i class="fas fa-cloud-upload-alt"></i>
            <p>松开即可发送</p>
          </div>
        </div>
      </div>
      <div class="input-buttons" id="mainInputButtons">
        <button id="sendButton" @click="handleSendMessage">发送</button>
        <button id="moreButton" class="more-button" title="更多功能" @click="toggleMoreFunctions">
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
      <div v-if="showMoreFunctions" class="more-functions" id="mainMoreFunctions">
        <button id="imageUploadButton" title="上传图片" @click="handleImageUploadClick">
          📷 <span class="button-text">发送图片</span>
        </button>
        <button id="fileUploadButton" title="上传文件" @click="handleFileUploadClick">
          📤 <span class="button-text">发送文件</span>
        </button>
        <button id="videoUploadButton" title="上传视频" @click="handleVideoUploadClick">
          🎬 <span class="button-text">发送视频</span>
        </button>
        <button id="sendGroupCardButton" title="发送群名片" @click="handleSendGroupCard">
          📱 <span class="button-text">发送群名片</span>
        </button>
        <button id="searchMessageButton" title="查找消息" @click="openSearchModal">
          🔍 <span class="button-text">查找消息</span>
        </button>
      </div>
      <input v-if="showImageInput" type="file" ref="imageInputRef" id="imageInput" style="display: none;" accept="image/*" @change="handleImageUpload" @cancel="handleImageCancel">
      <input v-if="showFileInput" type="file" ref="fileInputRef" id="fileInput" style="display: none;" @change="handleFileUpload" @cancel="handleFileCancel">
      <input v-if="showVideoInput" type="file" ref="videoInputRef" id="videoInput" style="display: none;" accept="video/*" @change="handleVideoUpload" @cancel="handleVideoCancel">
    </div>

    <div v-if="chatStore.showUploadProgress" class="upload-progress" id="uploadProgress">
      <div class="upload-progress-bar" id="uploadProgressBar" :style="{ width: chatStore.uploadProgress + '%' }"></div>
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
                    <span class="result-nickname">{{ result.nickname }}</span>
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
</template>

<style scoped>
.chat-at-user {
  color: #00f;
  border-radius: 3px;
}

.at-picker {
  position: fixed;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-height: 250px;
  overflow-y: auto;
  z-index: 10000;
  min-width: 200px;
}

.at-picker-item {
  padding: 10px 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #f0f0f0;
}

.at-picker-item:last-child {
  border-bottom: none;
}

.at-picker-item:hover,
.at-picker-item.selected {
  background: #f5f5f5;
}

.user-avatar-wrapper {
  position: relative;
  display: inline-flex;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: #666;
  font-size: 14px;
  object-fit: cover;
}

.at-picker-nickname {
  font-weight: 500;
  color: #333;
}

.at-picker-empty {
  padding: 15px;
  text-align: center;
  color: #999;
}
</style>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from "vue";
import { useChatStore } from "@/stores/chatStore";
import { useRoute } from "vue-router";
import localForage from "localforage";
import PublicMessageItem from "@/components/MessageItem/PublicMessageItem.vue";
import QuotedMessagePreview from "@/components/MessageItem/QuotedMessagePreview.vue";
import { 
  uploadImage,
  uploadFile,
  uploadVideo,
  initializeScrollLoading
} from "@/utils/chat";
import { clearContentEditable } from "@/utils/chat/message.js";

const chatStore = useChatStore();
const route = useRoute();
const messageInputRef = ref(null);
const imageInputRef = ref(null);
const fileInputRef = ref(null);
const videoInputRef = ref(null);
const messageContainerRef = ref(null);
const isDragOver = ref(false);
const showImageInput = ref(false);
const showFileInput = ref(false);
const showVideoInput = ref(false);
let dragCounter = 0;
let previousPublicMessageLength = 0;

const currentUserId = computed(() => chatStore.currentUser?.id);

function isOwnMessage(message) {
  if (!currentUserId.value) return false;
  return String(message.userId) === String(currentUserId.value) || 
         (message.user && String(message.user.id) === String(currentUserId.value));
}

function scrollToBottom() {
  nextTick(() => {
    if (messageContainerRef.value) {
      messageContainerRef.value.scrollTop = messageContainerRef.value.scrollHeight;
    }
  });
}

function isNearBottom() {
  if (!messageContainerRef.value) return false;
  const container = messageContainerRef.value;
  const threshold = 150;
  return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
}

function refreshScrollPos() {
  // console.log('[PublicChat] refreshScrollPos - 开始刷新滚动位置');
  // console.log('[PublicChat] refreshScrollPos - window.prevPublicScrollHeight:', window.prevPublicScrollHeight);
  // console.log('[PublicChat] refreshScrollPos - window.prevPublicScrollTop:', window.prevPublicScrollTop);
  
  if (window.prevPublicScrollHeight === undefined || window.prevPublicScrollTop === undefined) {
    // console.log('[PublicChat] refreshScrollPos - 没有保存的滚动位置，跳过');
    return;
  }
  
  nextTick(() => {
    if (messageContainerRef.value) {
      const scrollWrap = messageContainerRef.value;
      const newScrollHeight = scrollWrap.scrollHeight;
      const offsetTop = newScrollHeight - window.prevPublicScrollHeight;
      
      // 只有当 scrollHeight 真的发生变化时才调整滚动位置
      // 如果没有变化，说明没有加载到新消息，保持当前滚动位置
      if (offsetTop !== 0) {
        const newScrollTop = window.prevPublicScrollTop + offsetTop;
        
        // console.log('[PublicChat] refreshScrollPos - newScrollHeight:', newScrollHeight);
        // console.log('[PublicChat] refreshScrollPos - offsetTop:', offsetTop);
        // console.log('[PublicChat] refreshScrollPos - 新scrollTop:', newScrollTop);
        
        scrollWrap.scrollTop = newScrollTop;
      }
      
      window.prevPublicScrollHeight = undefined;
      window.prevPublicScrollTop = undefined;
      // console.log('[PublicChat] refreshScrollPos - 滚动位置刷新完成');
    } else {
      // console.log('[PublicChat] refreshScrollPos - 条件不满足，跳过刷新');
    }
  });
}

watch(
  () => chatStore.publicMessages,
  (newMessages) => {
    if (window.isLoadingMoreMessages) {
      refreshScrollPos();
      setTimeout(() => {
        if (typeof window.resetLoadingState === 'function') {
          window.resetLoadingState();
        }
      }, 100);
    } else if (newMessages.length > previousPublicMessageLength && !window.isLoadingMoreMessages) {
      if (isNearBottom()) {
        scrollToBottom();
      }
    }
    previousPublicMessageLength = newMessages.length;
  },
  { deep: true }
);

watch(
  () => route.path,
  (newPath, oldPath) => {
    // 离开主聊天室时保存草稿
    if ((oldPath === '/chat' || oldPath === '/chat/') && (newPath !== '/chat' && newPath !== '/chat/')) {
      const mainMessageInput = document.getElementById('messageInput');
      if (mainMessageInput) {
        const draftContent = mainMessageInput.innerHTML;
        chatStore.saveDraft('main', null, draftContent);
      }
    }
    
    if (newPath === '/chat' || newPath === '/chat/') {
      window.prevPublicScrollHeight = undefined;
      window.prevPublicScrollTop = undefined;
      window.isLoadingMoreMessages = false;
      if (window.scrollingInitialized) {
        window.scrollingInitialized.public = false;
      }
      
      // 恢复主聊天室草稿
      const mainDraft = chatStore.getDraft('main');
      if (mainDraft) {
        nextTick(() => {
          const mainMessageInput = document.getElementById('messageInput');
          if (mainMessageInput) {
            mainMessageInput.innerHTML = mainDraft;
          }
        });
      }
      
      scrollToBottom();
      setTimeout(() => {
        scrollToBottom();
      }, 200);
      setTimeout(() => {
        scrollToBottom();
      }, 500);
      if (chatStore.clearQuotedMessage) {
        chatStore.clearQuotedMessage();
      }
      if (chatStore.clearOtherGroupMessages) {
        chatStore.clearOtherGroupMessages(null);
      }
      if (chatStore.clearOtherPrivateMessages) {
        chatStore.clearOtherPrivateMessages(null);
      }
      if (chatStore.clearPublicMessagesExceptRecent) {
        chatStore.clearPublicMessagesExceptRecent();
      }
      nextTick(() => {
        initializeScrollLoading(true);
      });
      setTimeout(() => {
        if (window.scrollingInitialized) {
          window.scrollingInitialized.public = true;
        }
      }, 600);
    }
  }
);

onMounted(() => {
  window.prevPublicScrollHeight = undefined;
  window.prevPublicScrollTop = undefined;
  window.isLoadingMoreMessages = false;
  if (window.scrollingInitialized) {
    window.scrollingInitialized.public = false;
  }
  
  // 恢复主聊天室草稿
  nextTick(() => {
    const mainDraft = chatStore.getDraft('main');
    if (mainDraft) {
      const mainMessageInput = document.getElementById('messageInput');
      if (mainMessageInput) {
        mainMessageInput.innerHTML = mainDraft;
      }
    }
  });
  
  scrollToBottom();
  
  setTimeout(() => {
    initializeScrollLoading(true);
  }, 100);
  setTimeout(() => {
    if (window.scrollingInitialized) {
      window.scrollingInitialized.public = true;
    }
  }, 600);
  
  // 点击或右键其他地方隐藏 @ 提示框
  function hideAtPickerOnClick(e) {
    if (!showAtPicker.value) return;
    const atPicker = document.querySelector('.at-picker');
    const messageInput = document.getElementById('messageInput');
    if (atPicker && messageInput && 
        !atPicker.contains(e.target) && 
        !messageInput.contains(e.target)) {
      showAtPicker.value = false;
    }
  }
  
  document.addEventListener('click', function(e) {
    hideAtPickerOnClick(e);
    
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
  
  document.addEventListener('contextmenu', function(e) {
    hideAtPickerOnClick(e);
  });
});

const showMarkdownToolbar = ref(false);
const showMoreFunctions = ref(false);
const showAtPicker = ref(false);
const atPickerPosition = ref({ top: 0, left: 0 });
const atSuggestions = ref([]);
const filteredAtSuggestions = ref([]);
const selectedAtIndex = ref(0);
const atTriggerPosition = ref(0);
const isComposing = ref(false);
const avatarLoadFailedMap = ref({});

function getAvatarIsImage(user) {
  return getFullAvatarUrl(user) !== '' && !avatarLoadFailedMap.value[user.id];
}

function getFullAvatarUrl(user) {
  const avatarUrl = user.avatarUrl;
  if (!avatarUrl) return '';
  if (/^\.(svg)$/i.test(avatarUrl) || avatarUrl.includes('.svg')) return '';
  return avatarUrl.startsWith('http') ? avatarUrl : `${chatStore.SERVER_URL}${avatarUrl}`;
}

function getUserInitials(user) {
  const nickname = user.nickname || 'U';
  return nickname.charAt(0).toUpperCase();
}

function handleAvatarError(userId) {
  avatarLoadFailedMap.value[userId] = true;
}

function toggleMarkdownToolbar() {
  showMarkdownToolbar.value = !showMarkdownToolbar.value;
}

function toggleMoreFunctions() {
  showMoreFunctions.value = !showMoreFunctions.value;
}

function handleMessageInput() {
  if (messageInputRef.value) {
    const input = messageInputRef.value;
    
    // 清理只包含br标签的空内容（但不清理包含空格的内容）
    const textContent = input.textContent;
    const htmlContent = input.innerHTML;
    
    // 只有当内容真的为空或只有br标签时才清空
    // 注意：textContent 包含空格时长度不为0，所以不会误清空
    if (textContent === '' && (!htmlContent || htmlContent === '<br>' || htmlContent === '<br/>' || htmlContent === '<br />')) {
      input.innerHTML = '';
      showAtPicker.value = false;
      return;
    }
    
    chatStore.mainMessageInput = input.innerHTML;
    
    const maxHeight = 180;
    if (input.scrollHeight > maxHeight) {
      input.style.overflowY = 'auto';
    } else {
      input.style.overflowY = 'hidden';
    }
    
    // 如果正在输入中文，不处理
    if (isComposing.value) {
      return;
    }
    
    // @ 提示功能
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const textNode = range.startContainer;
      
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const text = textNode.textContent;
        const cursorPos = range.startOffset;
        
        // 查找 @ 触发器
        const textBeforeCursor = text.substring(0, cursorPos);
        const atIndex = textBeforeCursor.lastIndexOf('@');
        
        if (atIndex !== -1) {
          // 检查 @ 后面是否有空格或其他分隔符
          const textAfterAt = textBeforeCursor.substring(atIndex + 1);
          if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
            // 触发 @ 提示
            atTriggerPosition.value = atIndex;
            
            // 保存@触发器信息，用于点击时定位
            atTriggerInfo = {
              textNode: textNode,
              atIndex: atIndex,
              cursorPos: cursorPos
            };
            
            // 获取在线用户列表
            const allOnlineUsers = chatStore.onlineUsers || [];
            atSuggestions.value = allOnlineUsers
              .filter(user => user && String(user.id) !== String(chatStore.currentUser?.id))
              .map(user => ({
                id: user.id,
                nickname: user.nickname || user.name || '未知用户',
                username: user.nickname || user.name || String(user.id),
                avatarUrl: user.avatarUrl || user.avatar_url || null
              }))
              .filter(u => u.username);
            
            // 过滤建议 - 根据输入的文字匹配
            const searchText = textAfterAt.toLowerCase();
            if (searchText) {
              filteredAtSuggestions.value = atSuggestions.value
                .map(user => {
                  const nicknameLower = (user.nickname || '').toLowerCase();
                  const usernameLower = (user.username || '').toLowerCase();
                  
                  // 计算匹配分数
                  let score = 0;
                  if (nicknameLower === searchText || usernameLower === searchText) {
                    score = 100; // 完全匹配
                  } else if (nicknameLower.startsWith(searchText) || usernameLower.startsWith(searchText)) {
                    score = 80; // 开头匹配
                  } else if (nicknameLower.includes(searchText) || usernameLower.includes(searchText)) {
                    score = 60; // 包含匹配
                  } else {
                    score = 0; // 不匹配
                  }
                  
                  return { ...user, score };
                })
                .filter(user => user.score > 0)
                .sort((a, b) => b.score - a.score);
            } else {
              filteredAtSuggestions.value = [...atSuggestions.value];
            }
            
            // 在过滤完成后计算位置 - 底部贴在输入框顶部
            if (filteredAtSuggestions.value.length > 0) {
              const inputRect = messageInputRef.value.getBoundingClientRect();
              const pickerMaxHeight = 250;
              const estimatedHeight = Math.min(filteredAtSuggestions.value.length * 45 + 20, pickerMaxHeight);
              atPickerPosition.value = {
                top: inputRect.top - estimatedHeight,
                left: inputRect.left
              };
            }
            
            selectedAtIndex.value = 0;
            showAtPicker.value = filteredAtSuggestions.value.length > 0;
          } else {
            showAtPicker.value = false;
          }
        } else {
          showAtPicker.value = false;
        }
      } else {
        showAtPicker.value = false;
      }
    }
  }
}

function handleCompositionEnd() {
  isComposing.value = false;
  // 中文输入结束后重新处理输入
  handleMessageInput();
}

function handleMessageInputKeydown(e) {
  if (showAtPicker.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedAtIndex.value = (selectedAtIndex.value + 1) % filteredAtSuggestions.value.length;
      return;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedAtIndex.value = (selectedAtIndex.value - 1 + filteredAtSuggestions.value.length) % filteredAtSuggestions.value.length;
      return;
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (filteredAtSuggestions.value.length > 0) {
        selectAtUser(filteredAtSuggestions.value[selectedAtIndex.value]);
      }
      return;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      showAtPicker.value = false;
      return;
    }
  }
  
  // 删除键 - 参考 boxim 的做法，让浏览器默认行为处理删除 @用户元素
  // 因为 @用户元素设置了 contentEditable='false'，浏览器会把它当作一个整体来处理
  if (e.key === 'Backspace') {
    // 等待 DOM 更新后检查是否为空
    setTimeout(() => {
      if (!messageInputRef.value) return;
      const s = messageInputRef.value.innerHTML.trim();
      // 空 DOM 时，需要刷新 DOM
      if (s === '' || s === '<br>' || s === '<div>&nbsp;</div>') {
        clearContentEditable(messageInputRef.value);
      }
    }, 0);
  }
  
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
    e.preventDefault();
    handleSendMessage();
  } else if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    insertNewLine();
  }
}

function handleSendMessage() {
  if (window.sendMessage) {
    window.sendMessage();
    // 发送消息后滚动到底部
    scrollToBottom();
  }
}

// 保存@触发器的位置信息
let atTriggerInfo = null;

function selectAtUser(user) {
  if (!messageInputRef.value) return;
  
  const input = messageInputRef.value;
  const selection = window.getSelection();
  
  // 先获取焦点，但尝试保持选区
  input.focus();
  
  // 如果有保存的@触发器信息，使用它
  if (atTriggerInfo && atTriggerInfo.textNode && atTriggerInfo.atIndex !== -1) {
    const textNode = atTriggerInfo.textNode;
    const atIndex = atTriggerInfo.atIndex;
    const cursorPos = atTriggerInfo.cursorPos;
    
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      // 创建新的选区
      const range = document.createRange();
      
      // 选中输入的 @xx 符
      range.setStart(textNode, atIndex);
      range.setEnd(textNode, cursorPos);
      range.deleteContents();
      range.collapse(true);
      
      // 创建元素节点
      const element = document.createElement('SPAN');
      element.className = 'chat-at-user';
      element.dataset.id = user.id;
      element.contentEditable = 'false';
      element.innerText = `@${user.username}`;
      range.insertNode(element);
      
      // 光标移动到元素后面
      range.setStartAfter(element);
      range.collapse(true);
      
      // 插入普通空格
      const textNodeSpace = document.createTextNode(' ');
      range.insertNode(textNodeSpace);
      
      // 设置光标位置在空格后面
      range.setStartAfter(textNodeSpace);
      range.collapse(true);
      
      // 立即设置光标位置
      selection.removeAllRanges();
      selection.addRange(range);
    }
  } else if (selection && selection.rangeCount > 0) {
    // 备用方案：使用当前选区
    const range = selection.getRangeAt(0);
    
    // 查找 @ 触发器 - 改进查找逻辑，处理更复杂的情况
    let textNode = range.startContainer;
    let cursorPos = range.startOffset;
    let atIndex = -1;
    
    // 如果当前不是文本节点，往前查找
    while (textNode && textNode.nodeType !== Node.TEXT_NODE) {
      if (textNode.previousSibling) {
        textNode = textNode.previousSibling;
        while (textNode.lastChild) {
          textNode = textNode.lastChild;
        }
        if (textNode.nodeType === Node.TEXT_NODE) {
          cursorPos = textNode.textContent.length;
        }
      } else {
        textNode = textNode.parentNode;
      }
    }
    
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      const text = textNode.textContent;
      const textBeforeCursor = text.substring(0, cursorPos);
      atIndex = textBeforeCursor.lastIndexOf('@');
      
      if (atIndex !== -1) {
        // 选中输入的 @xx 符
        range.setStart(textNode, atIndex);
        range.setEnd(textNode, cursorPos);
        range.deleteContents();
        range.collapse(true);
        
        // 创建元素节点
        const element = document.createElement('SPAN');
        element.className = 'chat-at-user';
        element.dataset.id = user.id;
        element.contentEditable = 'false';
        element.innerText = `@${user.username}`;
        range.insertNode(element);
        
        // 光标移动到元素后面
        range.setStartAfter(element);
        range.collapse(true);
        
        // 立即设置光标位置
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }
  
  // 清除保存的信息
  atTriggerInfo = null;
  showAtPicker.value = false;
  chatStore.mainMessageInput = input.innerHTML;
  input.focus();
}

function handleSendGroupCard() {
  if (window.showSendGroupCardModal) {
    window.showSendGroupCardModal('main');
  }
}

function insertMarkdown(prefix, suffix, sample) {
  if (!messageInputRef.value) return;
  
  const input = messageInputRef.value;
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

function insertNewLine() {
  if (!messageInputRef.value) return;
  
  const input = messageInputRef.value;
  
  if (input.tagName === 'DIV' && input.isContentEditable) {
    document.execCommand('insertHTML', false, '<br><br>');
  } else {
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
}

function handlePaste(e) {
  const items = e.clipboardData.items;
  let hasImageOrFile = false;
  
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        uploadImage(file);
      }
      hasImageOrFile = true;
      break;
    } else if (item.type === 'application/octet-stream') {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        uploadFile(file);
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

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}

function handleDragEnter(e) {
  e.preventDefault();
  dragCounter++;
  if (dragCounter === 1) {
    isDragOver.value = true;
  }
}

function handleDragLeave(e) {
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0) {
    isDragOver.value = false;
  }
}

function handleDrop(e) {
  e.preventDefault();
  dragCounter = 0;
  isDragOver.value = false;
  
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        uploadImage(file);
      } else {
        uploadFile(file);
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
            uploadImage(file);
          } else {
            uploadFile(file);
          }
        }
        return;
      }
    }
  }
  
  const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
  if (text) {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
      messageInput.focus();
      document.execCommand('insertText', false, text);
    }
  }
}

function handleImageUploadClick() {
  showImageInput.value = true;
  nextTick(() => {
    if (imageInputRef.value) {
      imageInputRef.value.click();
    }
  });
}

function handleFileUploadClick() {
  showFileInput.value = true;
  nextTick(() => {
    if (fileInputRef.value) {
      fileInputRef.value.click();
    }
  });
}

function handleImageUpload(e) {
  const file = e.target.files[0];
  if (file) {
    uploadImage(file);
  }
  showImageInput.value = false;
  if (imageInputRef.value) {
    imageInputRef.value.value = '';
  }
}

function handleImageCancel() {
  showImageInput.value = false;
}

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (file) {
    uploadFile(file);
  }
  showFileInput.value = false;
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}

function handleFileCancel() {
  showFileInput.value = false;
}

function handleVideoUploadClick() {
  showVideoInput.value = true;
  nextTick(() => {
    if (videoInputRef.value) {
      videoInputRef.value.click();
    }
  });
}

function handleVideoUpload(e) {
  const file = e.target.files[0];
  if (file) {
    uploadVideo(file);
  }
  showVideoInput.value = false;
  if (videoInputRef.value) {
    videoInputRef.value.value = '';
  }
}

function handleVideoCancel() {
  showVideoInput.value = false;
}

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
    const prefix = `chats-${chatStore.currentUser?.id || 'guest'}`;
    const storageKey = `${prefix}-public`;
    
    // 直接从 indexedDB 读取消息
    const storageData = await localForage.getItem(storageKey);
    const allMessages = storageData?.messages || [];
    const keyword = searchKeyword.value.trim().toLowerCase();
    
    // 搜索消息
    const matchedMessages = allMessages
      .filter(msg => {
        if (msg.messageType === 101) return false;
        const content = msg.content?.toLowerCase() || '';
        const nickname = msg.nickname?.toLowerCase() || '';
        return content.includes(keyword) || nickname.includes(keyword);
      });
    
    if (matchedMessages.length > 0) {
      searchResults.value = [...matchedMessages].reverse();
      
      // 找到查找到的所有消息中最小的ID
      const minMatchedId = Math.min(...matchedMessages.map(m => m.id));
      
      // 获取store中的当前消息列表的最小ID
      const storeMessages = chatStore.publicMessages;
      if (storeMessages.length > 0) {
        const storeMinId = Math.min(...storeMessages.map(m => m.id));
        
        // 从完整消息列表中提取需要添加的消息：从最小匹配ID-20 到 store最小ID-1
        const startId = Math.max(1, minMatchedId - 20);
        const endId = storeMinId - 1;
        
        if (startId <= endId) {
          const messagesToAdd = allMessages
            .filter(msg => msg.id >= startId && msg.id <= endId && msg.messageType !== 101)
            .sort((a, b) => a.id - b.id);
          
          // 添加到store
          chatStore.prependPublicMessages(messagesToAdd);
        }
      }
    }
    
    hasSearched.value = true;
  } catch (err) {
    console.error('搜索失败:', err);
  } finally {
    isSearching.value = false;
  }
}

function highlightKeyword(content) {
  if (!content || !searchKeyword.value) {
    if (!content) return content;
    const div = document.createElement('div');
    div.textContent = content;
    return div.innerHTML;
  }
  
  const keyword = searchKeyword.value.trim();
  
  const div = document.createElement('div');
  div.textContent = content;
  let escapedContent = div.innerHTML;
  
  const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escapedContent.replace(regex, '<mark class="search-highlight">$1</mark>');
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
  
  // 使用 data-id 属性查找消息元素
  const messageElement = document.querySelector(`[data-id="${message.id}"]`);
  if (messageElement) {
    messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      // 使用 style.backgroundColor 直接设置背景色，避免触发 CSS 动画重播
      const isOwn = messageElement.classList.contains('own-message');
      const originalBg = isOwn ? '#E8F5E8' : '#FFFFFF';
      messageElement.style.backgroundColor = 'rgba(76, 175, 80, 0.6)';
      messageElement.classList.add('active');
      setTimeout(() => {
        messageElement.style.backgroundColor = originalBg;
        setTimeout(() => {
          messageElement.classList.remove('active');
        }, 500);
      }, 3000);
    }, 500);
  } else {
    // 如果找不到元素，尝试通过消息索引定位
    const allMessages = chatStore.publicMessages;
    const messageIndex = allMessages.findIndex(m => m.id === message.id);
    
    if (messageIndex !== -1 && messageContainerRef.value) {
      const container = messageContainerRef.value;
      // 查找所有消息元素
      const messageElements = container.querySelectorAll('.message');
      // 消息列表是从新到旧，DOM顺序也是从新到旧
      const targetElement = messageElements[messageIndex];
      
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          // 使用 style.backgroundColor 直接设置背景色，避免触发 CSS 动画重播
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
}
</script>
