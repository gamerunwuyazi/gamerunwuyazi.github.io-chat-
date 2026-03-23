<template>
  <div 
    class="quoted-message-display" 
    style="border-left: 3px solid #4CAF50; padding-left: 10px; margin-bottom: 8px; background: #f5f5f5; border-radius: 4px; padding: 8px; cursor: pointer;" 
    @click="handleQuotedMessageClick"
  >
    <div style="font-size: 12px; color: #666;">引用: <strong>{{ quotedMessageData.nickname }}</strong></div>
    
    <!-- 引用图片 -->
    <div v-if="imageUrl" style="margin-top: 5px;">
      <img 
        :src="fullImageUrl" 
        alt="引用图片"
        class="quoted-message-image"
        style="max-width: 200px; max-height: 150px; border-radius: 8px; object-fit: cover; cursor: pointer;"
        loading="lazy"
        @click.stop="handleImageClick(fullImageUrl)"
      >
    </div>
    
    <!-- 引用文件 -->
    <div v-else-if="fileUrl" style="margin-top: 5px;">
      <a 
        :href="fullFileUrl" 
        class="quoted-message-file-link" 
        target="_blank"
        style="color: #3498db; text-decoration: none; display: flex; align-items: center; gap: 8px;"
        @click.stop
      >
        <span class="quoted-message-file-icon" style="font-size: 24px;">{{ fileIcon }}</span>
        <span style="font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ displayFilename }}</span>
      </a>
    </div>
    
    <!-- 引用群名片 -->
    <div v-else-if="groupCardData" style="margin-top: 5px; background-color: #f0f8ff; border: 1px solid #3498db; border-radius: 8px; padding: 10px; cursor: pointer;" @click.stop="handleGroupCardClick">
      <div style="font-weight: bold; color: #3498db; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;">
        <img 
          v-if="groupCardAvatarUrl && !groupCardAvatarLoadFailed"
          :src="groupCardAvatarUrl"
          :alt="groupCardGroupName"
          style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;"
          @error="groupCardAvatarLoadFailed = true"
        >
        <div 
          v-else
          style="width: 20px; height: 20px; border-radius: 50%; background-color: #3498db; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;"
        >
          {{ groupCardInitials }}
        </div>
        {{ groupCardGroupName }}
      </div>
      <div style="color: #666; font-size: 14px; margin-bottom: 5px;">
        {{ groupCardGroupDescription }}
      </div>
      <div style="font-size: 12px; color: #999;">
        点击查看群组详情
      </div>
    </div>
    
    <!-- 普通文本 -->
    <div v-else style="font-size: 13px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
      {{ displayContent }}
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useChatStore } from '@/stores/chatStore';
import localForage from 'localforage';

const props = defineProps({
  quotedMessageData: {
    type: Object,
    required: true
  }
});

const chatStore = useChatStore();
const groupCardAvatarLoadFailed = ref(false);

const imageUrl = computed(() => {
  const msg = props.quotedMessageData;
  if (!msg) return null;
  if (msg.messageType !== 1) return null;
  
  try {
    const data = JSON.parse(msg.content || '{}');
    return data.url || null;
  } catch {
    return null;
  }
});

const fileUrl = computed(() => {
  const msg = props.quotedMessageData;
  if (!msg) return null;
  if (msg.messageType !== 2) return null;
  
  try {
    const data = JSON.parse(msg.content || '{}');
    return data.url || null;
  } catch {
    return null;
  }
});

const filename = computed(() => {
  const msg = props.quotedMessageData;
  if (!msg) return null;
  if (msg.messageType !== 2) return null;
  
  try {
    const data = JSON.parse(msg.content || '{}');
    return data.filename || data.name || null;
  } catch {
    return null;
  }
});

const groupCardData = computed(() => {
  const msg = props.quotedMessageData;
  if (!msg) return null;
  if (msg.messageType !== 3) return null;
  
  try {
    const data = JSON.parse(msg.content || '{}');
    if (data.type === 'group_card' && data.group_id) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
});

const displayContent = computed(() => {
  const msg = props.quotedMessageData;
  if (!msg) return '';
  
  if (msg.messageType === 1) {
    return '[图片]';
  } else if (msg.messageType === 2) {
    return '[文件]';
  } else if (msg.messageType === 3) {
    return '[群名片]';
  } else if (msg.messageType === 101) {
    return '撤回了一条消息';
  }
  
  return msg.content || '';
});

const fullImageUrl = computed(() => {
  if (!imageUrl.value) return '';
  return imageUrl.value.startsWith('http') ? imageUrl.value : `${chatStore.SERVER_URL}${imageUrl.value}`;
});

const fullFileUrl = computed(() => {
  if (!fileUrl.value) return '';
  return fileUrl.value.startsWith('http') ? fileUrl.value : `${chatStore.SERVER_URL}${fileUrl.value}`;
});

const displayFilename = computed(() => filename.value || '文件');

const fileIcon = computed(() => {
  if (!filename.value) return '📄';
  const ext = filename.value.split('.').pop()?.toLowerCase() || '';
  const extIcons = {
    pdf: '📕',
    doc: '📘',
    docx: '📘',
    xls: '📗',
    xlsx: '📗',
    ppt: '📙',
    pptx: '📙',
    zip: '📦',
    rar: '📦',
    '7z': '📦',
    mp3: '🎵',
    mp4: '🎬',
    avi: '🎬',
    mov: '🎬',
    jpg: '🖼️',
    jpeg: '🖼️',
    png: '🖼️',
    gif: '🖼️',
    bmp: '🖼️',
    webp: '🖼️'
  };
  return extIcons[ext] || '📄';
});

const groupCardAvatarUrl = computed(() => {
  if (!groupCardData.value?.avatar_url) return '';
  return groupCardData.value.avatar_url.startsWith('http') 
    ? groupCardData.value.avatar_url 
    : `${chatStore.SERVER_URL}${groupCardData.value.avatar_url}`;
});

const groupCardGroupName = computed(() => groupCardData.value?.group_name || '群组');
const groupCardGroupDescription = computed(() => groupCardData.value?.description || '');
const groupCardInitials = computed(() => {
  const name = groupCardGroupName.value;
  return name ? name.charAt(0).toUpperCase() : 'G';
});

async function handleQuotedMessageClick() {
  const quotedId = props.quotedMessageData?.id;
  if (!quotedId) return;
  
  // 先尝试在当前页面中查找
  let messageElement = document.querySelector(`[data-id="${quotedId}"]`);
  
  // 如果找不到，尝试从 indexedDB 查找并加载
  if (!messageElement) {
    try {
      const prefix = `chats-${chatStore.currentUser?.id || 'guest'}`;
      
      // 尝试从公共聊天室、群组、私信的 indexedDB 中查找
      const storageKeys = [
        `${prefix}-public`,
        ...Object.keys(chatStore.groupMessages || {}).map(id => `${prefix}-group-${id}`),
        ...Object.keys(chatStore.privateMessages || {}).map(id => `${prefix}-private-${id}`)
      ];
      
      let foundMessage = null;
      let foundStorageKey = null;
      
      for (const key of storageKeys) {
        const storageData = await localForage.getItem(key);
        const allMessages = storageData?.messages || [];
        const msg = allMessages.find(m => String(m.id) === String(quotedId));
        if (msg) {
          foundMessage = msg;
          foundStorageKey = key;
          break;
        }
      }
      
      if (foundMessage && foundStorageKey) {
        // 确定消息类型并加载到 store
        if (foundStorageKey.includes('-public')) {
          // 公共聊天室消息
          const storeMessages = chatStore.publicMessages;
          if (storeMessages.length > 0) {
            const storeMinId = Math.min(...storeMessages.map(m => m.id));
            const startId = Math.max(1, foundMessage.id - 20);
            const endId = storeMinId - 1;
            
            if (startId <= endId) {
              const storageData = await localForage.getItem(foundStorageKey);
              const allMessages = storageData?.messages || [];
              const messagesToAdd = allMessages
                .filter(msg => msg.id >= startId && msg.id <= endId && msg.messageType !== 101)
                .sort((a, b) => a.id - b.id);
              
              chatStore.prependPublicMessages(messagesToAdd);
            }
          }
        } else if (foundStorageKey.includes('-group-')) {
          // 群组消息
          const groupId = foundStorageKey.split('-group-')[1];
          const storeMessages = chatStore.groupMessages[groupId] || [];
          if (storeMessages.length > 0) {
            const storeMinId = Math.min(...storeMessages.map(m => m.id));
            const startId = Math.max(1, foundMessage.id - 20);
            const endId = storeMinId - 1;
            
            if (startId <= endId) {
              const storageData = await localForage.getItem(foundStorageKey);
              const allMessages = storageData?.messages || [];
              const messagesToAdd = allMessages
                .filter(msg => msg.id >= startId && msg.id <= endId && msg.messageType !== 101)
                .sort((a, b) => a.id - b.id);
              
              chatStore.prependGroupMessages(groupId, messagesToAdd);
            }
          }
        } else if (foundStorageKey.includes('-private-')) {
          // 私信消息
          const userId = foundStorageKey.split('-private-')[1];
          const storeMessages = chatStore.privateMessages[userId] || [];
          if (storeMessages.length > 0) {
            const storeMinId = Math.min(...storeMessages.map(m => m.id));
            const startId = Math.max(1, foundMessage.id - 20);
            const endId = storeMinId - 1;
            
            if (startId <= endId) {
              const storageData = await localForage.getItem(foundStorageKey);
              const allMessages = storageData?.messages || [];
              const messagesToAdd = allMessages
                .filter(msg => msg.id >= startId && msg.id <= endId && msg.messageType !== 101)
                .sort((a, b) => a.id - b.id);
              
              chatStore.prependPrivateMessages(userId, messagesToAdd);
            }
          }
        }
        
        // 等待消息加载后再查找元素
        setTimeout(() => {
          messageElement = document.querySelector(`[data-id="${quotedId}"]`);
          if (messageElement) {
            scrollToMessageElement(messageElement);
          }
        }, 300);
        return;
      }
    } catch (err) {
      console.error('从 indexedDB 查找引用消息失败:', err);
    }
  }
  
  // 如果找到了元素，滚动到该位置
  if (messageElement) {
    scrollToMessageElement(messageElement);
  }
}

function scrollToMessageElement(messageElement) {
  messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
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
}

function handleImageClick(url) {
  if (url) {
    chatStore.openModal('imagePreview', url);
  }
}

function handleGroupCardClick(event) {
  if (typeof window.showGroupCardPopup === 'function' && groupCardData.value) {
    window.showGroupCardPopup(event, groupCardData.value);
  }
}
</script>
