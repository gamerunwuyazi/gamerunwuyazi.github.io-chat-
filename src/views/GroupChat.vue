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
            :key="message.id || message.sequence"
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
        <div v-if="chatStore.quotedMessage" class="quoted-message-preview" style="display: flex; align-items: center; padding: 8px 12px; background: #f5f5f5; border-left: 3px solid #4CAF50; margin-bottom: 8px; border-radius: 4px;">
          <div style="flex: 1;">
            <div style="font-size: 12px; color: #666;">引用: <strong>{{ chatStore.quotedMessage.nickname }}</strong></div>
            <div style="font-size: 13px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ chatStore.quotedMessage.content }}</div>
          </div>
          <button @click="chatStore.clearQuotedMessage()" style="background: none; border: none; color: #999; font-size: 18px; cursor: pointer; padding: 0 5px;">×</button>
        </div>
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
            placeholder="发送消息（Ctrl+Enter或Shift+Enter换行  支持Markdown语法）"
            @input="handleGroupMessageInput"
          ></div>
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
        <div class="more-functions" id="groupMoreFunctions" :style="{ display: showMoreFunctions ? 'block' : 'none' }">
          <button id="groupImageUploadButton" title="上传图片" @click="handleGroupImageUploadClick">
            📷 <span class="button-text">发送图片</span>
          </button>
          <button id="groupFileUploadButton" title="上传文件" @click="handleGroupFileUploadClick">
            📤 <span class="button-text">发送文件</span>
          </button>
          <button id="sendGroupCardButtonGroup" title="发送群名片" @click="handleSendGroupCard">
            📱 <span class="button-text">发送群名片</span>
          </button>
        </div>
        <input type="file" ref="groupImageInputRef" id="groupImageInput" style="display: none;" accept="image/*" @change="handleGroupImageUpload">
        <input type="file" ref="groupFileInputRef" id="groupFileInput" style="display: none;" @change="handleGroupFileUpload">
      </div>

      <div class="upload-progress" id="groupUploadProgress" :style="{ display: chatStore.showUploadProgress ? 'block' : 'none' }">
        <div class="upload-progress-bar" id="groupUploadProgressBar" :style="{ width: chatStore.uploadProgress + '%' }"></div>
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
import GroupMessageItem from "@/components/MessageItem/GroupMessageItem.vue";
import { setActiveChat, loadGroupMessages, initializeScrollLoading, uploadImage, uploadFile, clearContentEditable, unescapeHtml } from "@/utils/chat";
import toast from "@/utils/toast";

const chatStore = useChatStore();
const route = useRoute();
const groupMessageInputRef = ref(null);
const groupImageInputRef = ref(null);
const groupFileInputRef = ref(null);
const groupMessageContainerRef = ref(null);
const isDragOver = ref(false);
let dragCounter = 0;
let previousGroupMessageLength = 0;

const isGroupChatVisible = ref(false);
const currentGroupName = ref('群组名称');
const showMarkdownToolbar = ref(false);
const showMoreFunctions = ref(false);
const currentGroupInfo = ref(null);

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

function refreshScrollPos() {
  // console.log('[GroupChat] refreshScrollPos - 开始刷新滚动位置');
  // console.log('[GroupChat] refreshScrollPos - window.prevGroupScrollHeight:', window.prevGroupScrollHeight);
  // console.log('[GroupChat] refreshScrollPos - window.prevGroupScrollTop:', window.prevGroupScrollTop);
  
  nextTick(() => {
    if (groupMessageContainerRef.value && window.prevGroupScrollHeight !== undefined && window.prevGroupScrollTop !== undefined) {
      const scrollWrap = groupMessageContainerRef.value;
      const newScrollHeight = scrollWrap.scrollHeight;
      const offsetTop = newScrollHeight - window.prevGroupScrollHeight;
      const newScrollTop = window.prevGroupScrollTop + offsetTop;
      
      // console.log('[GroupChat] refreshScrollPos - newScrollHeight:', newScrollHeight);
      // console.log('[GroupChat] refreshScrollPos - offsetTop:', offsetTop);
      // console.log('[GroupChat] refreshScrollPos - 新scrollTop:', newScrollTop);
      
      scrollWrap.scrollTop = newScrollTop;
      
      window.prevGroupScrollHeight = undefined;
      window.prevGroupScrollTop = undefined;
      // console.log('[GroupChat] refreshScrollPos - 滚动位置刷新完成');
    } else {
      // console.log('[GroupChat] refreshScrollPos - 条件不满足，跳过刷新');
    }
  });
}

window.groupRefreshScrollPos = refreshScrollPos;

function applySavedGroupState() {
  if (chatStore.currentGroupId) {
    setActiveChat('group', chatStore.currentGroupId, false);
    isGroupChatVisible.value = true;
    currentGroupName.value = chatStore.currentGroupName;
    loadGroupMessages(chatStore.currentGroupId, false);
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
  
  fetch(`${chatStore.SERVER_URL}/group-info/${chatStore.currentGroupId}`, {
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
}

function toggleMarkdownToolbar() {
  showMarkdownToolbar.value = !showMarkdownToolbar.value;
}

function toggleMoreFunctions() {
  showMoreFunctions.value = !showMoreFunctions.value;
}

function handleGroupMessageInputKeydown(e) {
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
    chatStore.groupMessageInput = groupMessageInputRef.value.innerHTML;
    
    const input = groupMessageInputRef.value;
    const maxHeight = 180;
    if (input.scrollHeight > maxHeight) {
      input.style.overflowY = 'auto';
    } else {
      input.style.overflowY = 'hidden';
    }
    
    const textContent = input.textContent.trim();
    const htmlContent = input.innerHTML.trim();
    if (!textContent && (!htmlContent || htmlContent === '<br>' || htmlContent === '<br/>' || htmlContent === '<br />')) {
      input.innerHTML = '';
    }
    
    input.scrollTop = input.scrollHeight;
  }
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
  
  fetch(`${chatStore.SERVER_URL}/group-info/${chatStore.currentGroupId}`, {
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
  if (groupImageInputRef.value) {
    groupImageInputRef.value.click();
  }
}

function handleGroupFileUploadClick() {
  if (groupFileInputRef.value) {
    groupFileInputRef.value.click();
  }
}

function handleGroupImageUpload(e) {
  const file = e.target.files[0];
  if (file) {
    uploadImage(file);
  }
  if (groupImageInputRef.value) {
    groupImageInputRef.value.value = '';
  }
}

function handleGroupFileUpload(e) {
  const file = e.target.files[0];
  if (file) {
    uploadFile(file);
  }
  if (groupFileInputRef.value) {
    groupFileInputRef.value.value = '';
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
      nextTick(() => {
        if (groupMessageContainerRef.value) {
          groupMessageContainerRef.value.scrollTop = 0;
        }
        // 切换群组后，等待消息加载完成后再滚动到底部
        scrollToBottom();
        // 多次尝试滚动，确保消息加载后也能滚动
        setTimeout(() => {
          scrollToBottom();
        }, 200);
        setTimeout(() => {
          scrollToBottom();
        }, 500);
        // 切换群组后，重新初始化滚动监听器
        setTimeout(() => {
          initializeScrollLoading(true);
        }, 100);
      });
    }
    // 当群组 ID 变为 null 时（群组解散或退出），隐藏群组聊天界面
    if (!newGroupId) {
      isGroupChatVisible.value = false;
      currentGroupInfo.value = null;
    }
  }
);

watch(
  () => groupMessages.value,
  (newMessages) => {
    // console.log('[GroupChat] 群组消息变化 - isLoadingMoreMessages:', window.isLoadingMoreMessages);
    // console.log('[GroupChat] 群组消息变化 - 新消息数量:', newMessages.length);
    // console.log('[GroupChat] 群组消息变化 - 旧消息数量:', previousGroupMessageLength);
    
    if (window.isLoadingMoreMessages) {
      // console.log('[GroupChat] 检测到加载更多历史消息，开始刷新滚动位置');
      refreshScrollPos();
      setTimeout(() => {
        if (typeof window.resetLoadingState === 'function') {
          // console.log('[GroupChat] 调用window.resetLoadingState清除加载状态');
          window.resetLoadingState();
        }
      }, 100);
    } else if (newMessages.length > previousGroupMessageLength && !window.isLoadingMoreMessages) {
      // console.log('[GroupChat] 检测到新消息，滚动到底部');
      scrollToBottom();
    }
    previousGroupMessageLength = newMessages.length;
  },
  { deep: true }
);

watch(
  () => route.path,
  (newPath) => {
    if (newPath.startsWith('/chat/group')) {
      scrollToBottom();
      // 切换到群组聊天时清除引用消息
      if (chatStore.clearQuotedMessage) {
        chatStore.clearQuotedMessage();
      }
      nextTick(() => {
        initializeScrollLoading(true);
      });
    }
  }
);

onMounted(() => {
  window.addEventListener('group-switched', handleGroupSwitched);
  
  // 恢复之前保存的群组会话
  if (chatStore.currentGroupId) {
    applySavedGroupState();
  }
  
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
  window.removeEventListener('group-switched', handleGroupSwitched);
});
</script>
