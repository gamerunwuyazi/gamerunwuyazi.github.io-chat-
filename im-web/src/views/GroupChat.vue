<template>
  <div class="chat-content" data-content="group-chat">
    <div v-if="!isGroupChatVisible" class="empty-chat-state">
      <h3>选择一个群组开始聊天</h3>
      <p>请从左侧群组列表中选择一个群组，开始群聊会话</p>
    </div>

    <div v-else class="group-chat-interface">
      <div class="group-header">
        <h2>{{ displayGroupName }}</h2>
        <div class="group-actions">
          <button id="groupInfoButton" @click="handleGroupInfoClick">群组信息</button>
        </div>
      </div>

      <div class="markdown-toolbar group-markdown-toolbar" v-if="showMarkdownToolbar">
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

      <div id="groupMessageContainer" ref="groupMessageContainerRef">
        <template v-if="groupMessages.length !== 0">
          <GroupMessageItem 
            v-for="message in groupMessages" 
            :key="message.id"
            :message="message"
            :is-own="isOwnMessage(message)"
          />
        </template>
        <div v-else class="empty-state">
          <h3>暂无群消息</h3>
          <p>发送第一条消息开始群聊吧!</p>
        </div>
      </div>
      <div class="input-area">
        <QuotedMessagePreview v-if="chatStore.quotedMessage" :quoted-message="chatStore.quotedMessage" @close="chatStore.clearQuotedMessage()" />
        <div class="input-container"
          @drop="handleGroupDrop"
          @dragover="handleGroupDragOver"
          @dragenter="handleGroupDragEnter"
          @dragleave="handleGroupDragLeave">
          <div class="editable-div"
            id="groupMessageInput" 
            @keydown="handleGroupMessageInputKeydown"
            @paste="handleGroupPaste"
            ref="groupMessageInputRef"
            contenteditable="true"
            placeholder="发送消息（Ctrl+Enter或Shift+Enter换行  打开md工具栏即可支持Markdown语法）"
            @input="handleGroupMessageInput"
            @compositionstart="isComposing = true"
            @compositionend="handleGroupCompositionEnd"
          ></div>
          <!-- @ 提示选择器 -->
          <div v-if="showAtPicker" class="at-picker" :style="{ top: atPickerPosition.top + 'px', left: atPickerPosition.left + 'px' }">
            <div 
              v-for="(user, index) in filteredAtSuggestions" 
              :key="user.id"
              class="at-picker-item"
              :class="{ selected: index === selectedAtIndex }"
              @click="selectGroupAtUser(user)"
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
                <div v-if="user.isOnline" class="online-indicator"></div>
              </div>
              <span class="at-picker-nickname">{{ user.nickname }}</span>
            </div>
            <div v-if="filteredAtSuggestions.length === 0" class="at-picker-empty">暂无群成员</div>
          </div>
          <div v-if="isDragOver" class="drop-overlay">
            <div class="drop-content">
              <i class="fas fa-cloud-upload-alt"></i>
              <p>松开即可发送</p>
            </div>
          </div>
        </div>
        <div class="input-buttons" id="groupInputButtons">
          <button id="sendGroupMessage" @click="handleSendGroupMessage">发送</button>
          <button id="groupMoreButton" class="more-button" title="更多功能" @click="toggleMoreFunctions">
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
        <div v-if="showMoreFunctions" class="more-functions" id="groupMoreFunctions">
          <button id="groupImageUploadButton" title="上传图片" @click="handleGroupImageUploadClick">
            📷 <span class="button-text">发送图片</span>
          </button>
          <button id="groupFileUploadButton" title="上传文件" @click="handleGroupFileUploadClick">
            📤 <span class="button-text">发送文件</span>
          </button>
          <button id="sendGroupCardButtonGroup" title="发送群名片" @click="handleSendGroupCard">
            📱 <span class="button-text">发送群名片</span>
          </button>
          <button id="groupSearchMessageButton" title="查找消息" @click="openSearchModal">
            🔍 <span class="button-text">查找消息</span>
          </button>
        </div>
        <input v-if="showImageInput" type="file" ref="groupImageInputRef" id="groupImageInput" style="display: none;" accept="image/*" @change="handleGroupImageUpload" @cancel="handleGroupImageCancel">
        <input v-if="showFileInput" type="file" ref="groupFileInputRef" id="groupFileInput" style="display: none;" @change="handleGroupFileUpload" @cancel="handleGroupFileCancel">
      </div>

      <div v-if="chatStore.showUploadProgress" class="upload-progress" id="groupUploadProgress">
        <div class="upload-progress-bar" id="groupUploadProgressBar" :style="{ width: chatStore.uploadProgress + '%' }"></div>
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
  </div>
</template>

<style scoped>
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

.online-indicator {
  position: absolute;
  right: -2px;
  bottom: 0;
  width: 10px;
  height: 10px;
  background: limegreen;
  border-radius: 50%;
  border: 2px solid white;
  z-index: 1;
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
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from "vue";
import { useChatStore } from "@/stores/chatStore";
import { useRoute } from "vue-router";
import localForage from "localforage";
import GroupMessageItem from "@/components/MessageItem/GroupMessageItem.vue";
import QuotedMessagePreview from "@/components/MessageItem/QuotedMessagePreview.vue";
import { setActiveChat, loadGroupMessages, initializeScrollLoading, uploadImage, uploadFile, clearContentEditable, unescapeHtml } from "@/utils/chat";
import toast from "@/utils/toast";

const chatStore = useChatStore();
const route = useRoute();
const groupMessageInputRef = ref(null);
const groupImageInputRef = ref(null);
const groupFileInputRef = ref(null);
const groupMessageContainerRef = ref(null);
const showImageInput = ref(false);
const showFileInput = ref(false);
const isDragOver = ref(false);
let dragCounter = 0;
let previousGroupMessageLength = 0;

const isGroupChatVisible = ref(false);
const currentGroupName = ref('群组名称');
const showMarkdownToolbar = ref(false);
const showAtPicker = ref(false);
const atPickerPosition = ref({ top: 0, left: 0 });
const atSuggestions = ref([]);
const filteredAtSuggestions = ref([]);
const selectedAtIndex = ref(0);
const atTriggerPosition = ref(0);
const isComposing = ref(false);
const showMoreFunctions = ref(false);
const currentGroupInfo = ref(null);
const groupMembers = ref([]);
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

const displayGroupName = computed(() => {
  const name = currentGroupName.value || '群组名称';
  return unescapeHtml(name);
});

const currentUserId = computed(() => chatStore.currentUser?.id);

const groupMessages = computed(() => {
  return chatStore.groupMessages[chatStore.currentGroupId] || [];
});

function isOwnMessage(message) {
  if (!currentUserId.value) return false;
  return String(message.userId) === String(currentUserId.value) || 
         (message.user && String(message.user.id) === String(currentUserId.value));
}

function scrollToBottom() {
  nextTick(() => {
    if (groupMessageContainerRef.value) {
      groupMessageContainerRef.value.scrollTop = groupMessageContainerRef.value.scrollHeight;
    }
  });
}

function isNearBottom() {
  if (!groupMessageContainerRef.value) return false;
  const container = groupMessageContainerRef.value;
  const threshold = 150;
  return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
}

function refreshScrollPos() {
  // console.log('[GroupChat] refreshScrollPos - 开始刷新滚动位置');
  // console.log('[GroupChat] refreshScrollPos - window.prevGroupScrollHeight:', window.prevGroupScrollHeight);
  // console.log('[GroupChat] refreshScrollPos - window.prevGroupScrollTop:', window.prevGroupScrollTop);
  
  if (window.prevGroupScrollHeight === undefined || window.prevGroupScrollTop === undefined) {
    // console.log('[GroupChat] refreshScrollPos - 没有保存的滚动位置，跳过');
    return;
  }
  
  nextTick(() => {
    if (groupMessageContainerRef.value) {
      const scrollWrap = groupMessageContainerRef.value;
      const newScrollHeight = scrollWrap.scrollHeight;
      const offsetTop = newScrollHeight - window.prevGroupScrollHeight;
      
      // 只有当 scrollHeight 真的发生变化时才调整滚动位置
      // 如果没有变化，说明没有加载到新消息，保持当前滚动位置
      if (offsetTop !== 0) {
        const newScrollTop = window.prevGroupScrollTop + offsetTop;
        
        // console.log('[GroupChat] refreshScrollPos - newScrollHeight:', newScrollHeight);
        // console.log('[GroupChat] refreshScrollPos - offsetTop:', offsetTop);
        // console.log('[GroupChat] refreshScrollPos - 新scrollTop:', newScrollTop);
        
        scrollWrap.scrollTop = newScrollTop;
      }
      
      window.prevGroupScrollHeight = undefined;
      window.prevGroupScrollTop = undefined;
      // console.log('[GroupChat] refreshScrollPos - 滚动位置刷新完成');
    } else {
      // console.log('[GroupChat] refreshScrollPos - 条件不满足，跳过刷新');
    }
  });
}

function applySavedGroupState() {
  if (chatStore.currentGroupId) {
    setActiveChat('group', chatStore.currentGroupId, false);
    isGroupChatVisible.value = true;
    currentGroupName.value = chatStore.currentGroupName;
    loadCurrentGroupInfo();
    
    // 重新初始化滚动监听器
    nextTick(() => {
      initializeScrollLoading(true);
    });
  }
}

function loadCurrentGroupInfo() {
  if (!chatStore.currentGroupId) return;
  const user = chatStore.currentUser;
  const sessionToken = chatStore.currentSessionToken;
  
  if (!user || !sessionToken) return;
  
  // 加载群组基本信息
  fetch(`${chatStore.SERVER_URL}/api/group-info/${chatStore.currentGroupId}`, {
    headers: {
      'user-id': user.id,
      'session-token': sessionToken
    }
  })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        currentGroupInfo.value = data.group;
      }
    });
    
  // 加载群组成员列表
  fetch(`${chatStore.SERVER_URL}/api/group-members/${chatStore.currentGroupId}`, {
    headers: {
      'user-id': user.id,
      'session-token': sessionToken
    }
  })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        groupMembers.value = data.members || [];
      }
    })
    .catch(err => {
      console.error('加载群组成员失败:', err);
      groupMembers.value = [];
    });
}

function toggleMarkdownToolbar() {
  showMarkdownToolbar.value = !showMarkdownToolbar.value;
}

function toggleMoreFunctions() {
  showMoreFunctions.value = !showMoreFunctions.value;
}

function handleGroupMessageInputKeydown(e) {
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
        selectGroupAtUser(filteredAtSuggestions.value[selectedAtIndex.value]);
      }
      return;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      showAtPicker.value = false;
      return;
    }
  }
  
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
    e.preventDefault();
    handleSendGroupMessage();
  } else if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    insertGroupNewLine();
  }
}

function insertGroupNewLine() {
  if (!groupMessageInputRef.value) return;
  
  const input = groupMessageInputRef.value;
  
  if (input.tagName === 'DIV' && input.isContentEditable) {
    document.execCommand('insertHTML', false, '<br><br>');
  }
}

function handleGroupPaste(e) {
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

function handleGroupDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}

function handleGroupDragEnter(e) {
  e.preventDefault();
  dragCounter++;
  if (dragCounter === 1) {
    isDragOver.value = true;
  }
}

function handleGroupDragLeave(e) {
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0) {
    isDragOver.value = false;
  }
}

function handleGroupDrop(e) {
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
    const groupMessageInput = document.getElementById('groupMessageInput');
    if (groupMessageInput) {
      groupMessageInput.focus();
      document.execCommand('insertText', false, text);
    }
  }
}

function handleGroupMessageInput() {
  if (groupMessageInputRef.value) {
    const input = groupMessageInputRef.value;
    
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
    
    chatStore.groupMessageInput = input.innerHTML;
    
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
    
    // @ 提示功能 - 获取群组成员
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const textNode = range.startContainer;
      
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const text = textNode.textContent;
        const cursorPos = range.startOffset;
        
        const textBeforeCursor = text.substring(0, cursorPos);
        const atIndex = textBeforeCursor.lastIndexOf('@');
        
        if (atIndex !== -1) {
          const textAfterAt = textBeforeCursor.substring(atIndex + 1);
          if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
            atTriggerPosition.value = atIndex;
            
            // 获取群组成员列表
            const members = groupMembers.value || [];
            const onlineUserIds = new Set((chatStore.onlineUsers || []).map(user => String(user.id)));
            
            atSuggestions.value = members
              .filter(member => member)
              .map(member => {
                const userId = member.userId || member.id;
                const isOnline = onlineUserIds.has(String(userId));
                return {
                  id: userId,
                  nickname: unescapeHtml(member.nickname || member.name || '未知成员'),
                  username: unescapeHtml(member.nickname || member.name || String(userId)),
                  avatarUrl: member.avatarUrl || member.avatar_url || null,
                  isOnline: isOnline
                };
              })
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
                .sort((a, b) => {
                  // 优先按在线状态排序（在线在上）
                  if (a.isOnline !== b.isOnline) {
                    return b.isOnline ? 1 : -1;
                  }
                  // 然后按匹配分数排序
                  return b.score - a.score;
                });
            } else {
              filteredAtSuggestions.value = [...atSuggestions.value].sort((a, b) => {
                // 优先按在线状态排序（在线在上）
                if (a.isOnline !== b.isOnline) {
                  return b.isOnline ? 1 : -1;
                }
                return 0;
              });
            }
            
            // 在过滤完成后计算位置
            if (filteredAtSuggestions.value.length > 0) {
              const inputRect = groupMessageInputRef.value.getBoundingClientRect();
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
    
    input.scrollTop = input.scrollHeight;
  }
}

function handleGroupCompositionEnd() {
  isComposing.value = false;
  // 中文输入结束后重新处理输入
  handleGroupMessageInput();
}

function handleSendGroupMessage() {
  if (groupMessageInputRef.value) {
    const content = groupMessageInputRef.value.textContent.trim() || groupMessageInputRef.value.innerHTML.trim();
    if (content) {
      if (window.sendGroupMessage) {
        window.sendGroupMessage();
      } else if (window.chatSocket && window.isConnected && chatStore.currentGroupId) {
        const messageData = {
          content: content,
          groupId: chatStore.currentGroupId,
          sessionToken: chatStore.currentSessionToken,
          userId: chatStore.currentUser.id
        };
        window.chatSocket.emit('send-message', messageData);
        clearContentEditable(groupMessageInputRef.value);
      }
      // 发送消息后滚动到底部
      scrollToBottom();
    }
  }
}

function handleSendGroupCard() {
  if (window.showSendGroupCardModal) {
    window.showSendGroupCardModal('group');
  }
}

function handleGroupInfoClick() {
  if (!chatStore.currentGroupId) {
    toast.warning('请先选择一个群组');
    return;
  }
  const user = chatStore.currentUser;
  const sessionToken = chatStore.currentSessionToken;
  
  if (!user || !sessionToken) {
    toast.warning('请先登录');
    return;
  }
  
  fetch(`${chatStore.SERVER_URL}/api/group-info/${chatStore.currentGroupId}`, {
    headers: {
      'user-id': user.id,
      'session-token': sessionToken
    }
  })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        currentGroupInfo.value = data.group;
        chatStore.openModal('groupInfo', data.group);
      }
    });
}

function selectGroupAtUser(user) {
  if (!groupMessageInputRef.value) return;
  
  const input = groupMessageInputRef.value;
  
  // 从输入框文本中查找 @ 位置
  const text = input.textContent || '';
  const atIndex = text.lastIndexOf('@');
  
  if (atIndex !== -1) {
    // 找到 @ 位置，替换为 @username 
    const textBeforeAt = text.substring(0, atIndex);
    const textAfterAt = text.substring(atIndex + 1);
    
    // 找到第一个空格或换行符的位置
    let textAfterUsername = textAfterAt;
    const spaceMatch = textAfterAt.match(/^(\S+)/);
    if (spaceMatch) {
      textAfterUsername = textAfterAt.substring(spaceMatch[1].length);
    }
    
    const replaceText = `@${user.username} `    
    input.textContent = textBeforeAt + replaceText + textAfterUsername;
    
    // 设置光标位置到替换文本之后
    const newCursorPos = atIndex + replaceText.length;
    const newRange = document.createRange();
    const textNode = input.firstChild;
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      newRange.setStart(textNode, Math.min(newCursorPos, textNode.textContent.length));
      newRange.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(newRange);
    }
  }
  
  showAtPicker.value = false;
  chatStore.groupMessageInput = input.innerHTML;
  input.focus();
}

function insertMarkdown(prefix, suffix, sample) {
  if (!groupMessageInputRef.value) return;
  
  const input = groupMessageInputRef.value;
  input.focus();
  
  // 获取当前选中的文本
  let selectedText = '';
  if (window.getSelection) {
    const selection = window.getSelection();
    selectedText = selection.toString();
  }
  
  if (!selectedText) selectedText = sample;
  
  // 插入Markdown格式
  const newText = prefix + selectedText + suffix;
  
  // 使用 document.execCommand 插入文本到 contenteditable div
  document.execCommand('insertText', false, newText);
  
  // 将光标移动到插入文本的末尾
  setTimeout(() => {
    if (window.getSelection) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }, 0);
}

function handleGroupImageUploadClick() {
  showImageInput.value = true;
  nextTick(() => {
    if (groupImageInputRef.value) {
      groupImageInputRef.value.click();
    }
  });
}

function handleGroupFileUploadClick() {
  showFileInput.value = true;
  nextTick(() => {
    if (groupFileInputRef.value) {
      groupFileInputRef.value.click();
    }
  });
}

function handleGroupImageUpload(e) {
  const file = e.target.files[0];
  if (file) {
    uploadImage(file);
  }
  showImageInput.value = false;
  if (groupImageInputRef.value) {
    groupImageInputRef.value.value = '';
  }
}

function handleGroupImageCancel() {
  showImageInput.value = false;
}

function handleGroupFileUpload(e) {
  const file = e.target.files[0];
  if (file) {
    uploadFile(file);
  }
  showFileInput.value = false;
  if (groupFileInputRef.value) {
    groupFileInputRef.value.value = '';
  }
}

function handleGroupFileCancel() {
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
    const groupId = chatStore.currentGroupId;
    const prefix = `chats-${chatStore.currentUser?.id || 'guest'}`;
    const storageKey = `${prefix}-group-${groupId}`;
    
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
      const storeMessages = chatStore.groupMessages[groupId] || [];
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
          chatStore.prependGroupMessages(groupId, messagesToAdd);
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
  
  const groupId = chatStore.currentGroupId;
  const messages = chatStore.groupMessages[groupId] || [];
  const messageIndex = messages.findIndex(m => m.id === message.id);
  
  if (messageIndex !== -1 && groupMessageContainerRef.value) {
    const container = groupMessageContainerRef.value;
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

function handleGroupSwitched() {
  if (chatStore.currentGroupId) {
    isGroupChatVisible.value = true;
    currentGroupName.value = chatStore.currentGroupName;
    loadCurrentGroupInfo();
    
    // 切换群组后，重新初始化滚动监听器
    setTimeout(() => {
      initializeScrollLoading(true);
    }, 100);
  }
}

watch(
  () => chatStore.currentGroupId,
  (newGroupId, oldGroupId) => {
    if (newGroupId && newGroupId !== oldGroupId) {
      window.prevGroupScrollHeight = undefined;
      window.prevGroupScrollTop = undefined;
      window.isLoadingMoreMessages = false;
      if (window.scrollingInitialized) {
        window.scrollingInitialized.group = false;
      }
      
      nextTick(() => {
        if (groupMessageContainerRef.value) {
          groupMessageContainerRef.value.scrollTop = 0;
        }
        scrollToBottom();
        setTimeout(() => {
          initializeScrollLoading(true);
        }, 100);
        setTimeout(() => {
          if (window.scrollingInitialized) {
            window.scrollingInitialized.group = true;
          }
        }, 600);
      });
    }
    if (!newGroupId) {
      isGroupChatVisible.value = false;
      currentGroupInfo.value = null;
    }
  }
);

watch(
  () => groupMessages.value,
  (newMessages) => {
    if (window.isLoadingMoreMessages) {
      refreshScrollPos();
      setTimeout(() => {
        if (typeof window.resetLoadingState === 'function') {
          window.resetLoadingState();
        }
      }, 100);
    } else if (newMessages.length > previousGroupMessageLength && !window.isLoadingMoreMessages) {
      if (isNearBottom()) {
        scrollToBottom();
      }
    }
    previousGroupMessageLength = newMessages.length;
  },
  { deep: true }
);

watch(
  () => route.path,
  (newPath) => {
    if (newPath.startsWith('/chat/group')) {
      window.prevGroupScrollHeight = undefined;
      window.prevGroupScrollTop = undefined;
      window.isLoadingMoreMessages = false;
      if (window.scrollingInitialized) {
        window.scrollingInitialized.group = false;
      }
      
      if (window.switchingGroupWithExistingMessages) {
        // 如果是切换到已有消息的群组，先不滚动到底部，让用户自己滚动
        delete window.switchingGroupWithExistingMessages;
        nextTick(() => {
          initializeScrollLoading(true);
        });
        setTimeout(() => {
          if (window.scrollingInitialized) {
            window.scrollingInitialized.group = true;
          }
        }, 1000);
      } else {
        // 如果是新群组或没有消息，则滚动到底部
        scrollToBottom();
        nextTick(() => {
          initializeScrollLoading(true);
        });
        setTimeout(() => {
          if (window.scrollingInitialized) {
            window.scrollingInitialized.group = true;
          }
        }, 600);
      }
      
      // 切换到群组聊天时清除引用消息
      if (chatStore.clearQuotedMessage) {
        chatStore.clearQuotedMessage();
      }
      // 切换到群组聊天时，清除其他会话的消息，只保留最近 20 条
      if (chatStore.clearOtherGroupMessages) {
        chatStore.clearOtherGroupMessages(chatStore.currentGroupId);
      }
      if (chatStore.clearOtherPrivateMessages) {
        chatStore.clearOtherPrivateMessages(null);
      }
      if (chatStore.clearPublicMessagesExceptRecent) {
        chatStore.clearPublicMessagesExceptRecent();
      }
    }
  }
);

function handleGroupMembersChanged(event) {
  console.log('📥 [GroupChat] 收到群组成员变更事件:', event.detail);
  loadCurrentGroupInfo();
}

onMounted(() => {
  window.addEventListener('group-switched', handleGroupSwitched);
  window.addEventListener('group-members-changed', handleGroupMembersChanged);
  
  // 恢复之前保存的群组会话
  if (chatStore.currentGroupId) {
    applySavedGroupState();
  }
  
  scrollToBottom();
  
  // 点击或右键其他地方隐藏 @ 提示框
  function hideAtPickerOnClick(e) {
    if (!showAtPicker.value) return;
    const atPicker = document.querySelector('.at-picker');
    const messageInput = document.getElementById('groupMessageInput');
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

onUnmounted(() => {
  window.removeEventListener('group-switched', handleGroupSwitched);
  window.removeEventListener('group-members-changed', handleGroupMembersChanged);
});
</script>
