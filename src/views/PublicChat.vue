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
          :key="message.id || message.sequence"
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
      <div v-if="chatStore.quotedMessage" class="quoted-message-preview" style="display: flex; align-items: center; padding: 8px 12px; background: #f5f5f5; border-left: 3px solid #4CAF50; margin-bottom: 8px; border-radius: 4px;">
        <div style="flex: 1;">
          <div style="font-size: 12px; color: #666;">引用: <strong>{{ chatStore.quotedMessage.nickname }}</strong></div>
          <div style="font-size: 13px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ chatStore.quotedMessage.content }}</div>
        </div>
        <button @click="chatStore.clearQuotedMessage()" style="background: none; border: none; color: #999; font-size: 18px; cursor: pointer; padding: 0 5px;">×</button>
      </div>
      <div class="input-container" id="mainInputContainer" 
        @drop="handleDrop"
        @dragover="handleDragOver"
        @dragenter="handleDragEnter"
        @dragleave="handleDragLeave">
        <div 
          ref="messageInputRef"
          id="messageInput" 
          class="editable-div" 
          placeholder="发送消息（Ctrl+Enter或Shift+Enter换行  支持Markdown语法）" 
          contenteditable="true"
          @keydown="handleMessageInputKeydown"
          @input="handleMessageInput"
          @paste="handlePaste"
        ></div>
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
      <div class="more-functions" id="mainMoreFunctions" :style="{ display: showMoreFunctions ? 'block' : 'none' }">
        <button id="imageUploadButton" title="上传图片" @click="handleImageUploadClick">
          📷 <span class="button-text">发送图片</span>
        </button>
        <button id="fileUploadButton" title="上传文件" @click="handleFileUploadClick">
          📤 <span class="button-text">发送文件</span>
        </button>
        <button id="sendGroupCardButton" title="发送群名片" @click="handleSendGroupCard">
          📱 <span class="button-text">发送群名片</span>
        </button>
      </div>
      <input type="file" ref="imageInputRef" id="imageInput" style="display: none;" accept="image/*" @change="handleImageUpload">
      <input type="file" ref="fileInputRef" id="fileInput" style="display: none;" @change="handleFileUpload">
    </div>

    <div class="upload-progress" id="uploadProgress" :style="{ display: chatStore.showUploadProgress ? 'block' : 'none' }">
      <div class="upload-progress-bar" id="uploadProgressBar" :style="{ width: chatStore.uploadProgress + '%' }"></div>
    </div>
  </div>
</template>

<style src="@/css/index.css"></style>
<style src="@/css/code-highlight.css"></style>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from "vue";
import { useChatStore } from "@/stores/chatStore";
import { useRoute } from "vue-router";
import PublicMessageItem from "@/components/MessageItem/PublicMessageItem.vue";
import { 
  uploadImage,
  uploadFile,
  initializeScrollLoading
} from "@/utils/chat";

const chatStore = useChatStore();
const route = useRoute();
const messageInputRef = ref(null);
const imageInputRef = ref(null);
const fileInputRef = ref(null);
const messageContainerRef = ref(null);
const isDragOver = ref(false);
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

function refreshScrollPos() {
  // console.log('[PublicChat] refreshScrollPos - 开始刷新滚动位置');
  // console.log('[PublicChat] refreshScrollPos - window.prevPublicScrollHeight:', window.prevPublicScrollHeight);
  // console.log('[PublicChat] refreshScrollPos - window.prevPublicScrollTop:', window.prevPublicScrollTop);
  
  nextTick(() => {
    if (messageContainerRef.value && window.prevPublicScrollHeight !== undefined && window.prevPublicScrollTop !== undefined) {
      const scrollWrap = messageContainerRef.value;
      const newScrollHeight = scrollWrap.scrollHeight;
      const offsetTop = newScrollHeight - window.prevPublicScrollHeight;
      const newScrollTop = window.prevPublicScrollTop + offsetTop;
      
      // console.log('[PublicChat] refreshScrollPos - newScrollHeight:', newScrollHeight);
      // console.log('[PublicChat] refreshScrollPos - offsetTop:', offsetTop);
      // console.log('[PublicChat] refreshScrollPos - 新scrollTop:', newScrollTop);
      
      scrollWrap.scrollTop = newScrollTop;
      
      window.prevPublicScrollHeight = undefined;
      window.prevPublicScrollTop = undefined;
      // console.log('[PublicChat] refreshScrollPos - 滚动位置刷新完成');
    } else {
      // console.log('[PublicChat] refreshScrollPos - 条件不满足，跳过刷新');
    }
  });
}

window.publicRefreshScrollPos = refreshScrollPos;

watch(
  () => chatStore.publicMessages,
  (newMessages) => {
    // console.log('[PublicChat] 公共消息变化 - isLoadingMoreMessages:', window.isLoadingMoreMessages);
    // console.log('[PublicChat] 公共消息变化 - 新消息数量:', newMessages.length);
    // console.log('[PublicChat] 公共消息变化 - 旧消息数量:', previousPublicMessageLength);
    
    if (window.isLoadingMoreMessages) {
      // console.log('[PublicChat] 检测到加载更多历史消息，开始刷新滚动位置');
      refreshScrollPos();
      setTimeout(() => {
        if (typeof window.resetLoadingState === 'function') {
          // console.log('[PublicChat] 调用window.resetLoadingState清除加载状态');
          window.resetLoadingState();
        }
      }, 100);
    } else if (newMessages.length > previousPublicMessageLength && !window.isLoadingMoreMessages) {
      // console.log('[PublicChat] 检测到新消息，滚动到底部');
      scrollToBottom();
    }
    previousPublicMessageLength = newMessages.length;
  },
  { deep: true }
);

watch(
  () => route.path,
  (newPath) => {
    if (newPath === '/chat' || newPath === '/chat/') {
      scrollToBottom();
      nextTick(() => {
        initializeScrollLoading(true);
      });
    }
  }
);

onMounted(() => {
  scrollToBottom();
  
  setTimeout(() => {
    initializeScrollLoading(true);
  }, 100);
  
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

const showMarkdownToolbar = ref(false);
const showMoreFunctions = ref(false);

function toggleMarkdownToolbar() {
  showMarkdownToolbar.value = !showMarkdownToolbar.value;
}

function toggleMoreFunctions() {
  showMoreFunctions.value = !showMoreFunctions.value;
}

function handleMessageInput() {
  if (messageInputRef.value) {
    chatStore.mainMessageInput = messageInputRef.value.textContent || messageInputRef.value.innerHTML;
    
    const input = messageInputRef.value;
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

function handleMessageInputKeydown(e) {
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
  }
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
  if (imageInputRef.value) {
    imageInputRef.value.click();
  }
}

function handleFileUploadClick() {
  if (fileInputRef.value) {
    fileInputRef.value.click();
  }
}

function handleImageUpload(e) {
  const file = e.target.files[0];
  if (file) {
    uploadImage(file);
  }
  if (imageInputRef.value) {
    imageInputRef.value.value = '';
  }
}

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (file) {
    uploadFile(file);
  }
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}
</script>
