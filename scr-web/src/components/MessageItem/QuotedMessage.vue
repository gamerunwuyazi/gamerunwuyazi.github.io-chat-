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
          v-if="groupCardAvatarUrl && !isSvgAvatar(groupCardAvatarUrl) && !groupCardAvatarLoadFailed"
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
      <span v-if="isMarkdownContent" v-html="displayContent"></span>
      <template v-else>{{ displayContent }}</template>
    </div>
  </div>
</template>

<script setup>
import DOMPurify from 'dompurify';
import localForage from 'localforage';
import { marked } from 'marked';
import { computed, ref } from 'vue';

import { useBaseStore } from '@/stores/baseStore';
import { useGroupStore } from '@/stores/groupStore';
import { useFriendStore } from '@/stores/friendStore';
import { usePublicStore } from '@/stores/publicStore';
import { useModalStore } from '@/stores/modalStore';
import { useStorageStore } from '@/stores/storageStore';
import { showGroupCardPopup } from '@/utils/chat';
import toast from '@/utils/toast';

const props = defineProps({
  quotedMessageData: {
    type: Object,
    required: true
  }
});

const baseStore = useBaseStore();
const groupStore = useGroupStore();
const friendStore = useFriendStore();
const publicStore = usePublicStore();
const modalStore = useModalStore();
const storageStore = useStorageStore();
const groupCardAvatarLoadFailed = ref(false);

function escapeHtmlForMarkdown(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSvgAvatar(url) {
  return url && /\.svg$/i.test(url);
}

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
  } else if (msg.messageType === 4) {
    try {
      const data = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
      return data.text || data.content || '';
    } catch {
      return msg.content || '';
    }
  } else if (msg.messageType === 5 || msg.markdone) {
    let content = msg.content || '';
    try {
      content = escapeHtmlForMarkdown(content);
      marked.setOptions({ breaks: true, gfm: true });
      let parsed = marked.parse(content).trim();
      parsed = parsed.replace(/<svg[^>]*>.*?<\/svg>/gi, '[SVG图片]');
      parsed = parsed.replace(/<(?!\/?(a|img|div|span|br|p|h[1-6]|strong|em|code|pre|ul|ol|li|blockquote|figure|table|tbody|tr|td|i)\b)[^>]*>/gi, '');
      parsed = parsed.replace(/<img/g, '<img style="max-width: 100%; height: auto;"');
      parsed = parsed.replace(/<a/g, '<a target="_blank" rel="noopener noreferrer" style="color: #3498db;"');
      return DOMPurify.sanitize(parsed);
    } catch {
      return content;
    }
  } else if (msg.messageType === 101) {
    return '撤回了一条消息';
  }
  
  return msg.content || '';
});

const isMarkdownContent = computed(() => {
  const msg = props.quotedMessageData;
  return msg && (msg.messageType === 5 || msg.markdone);
});

const fullImageUrl = computed(() => {
  if (!imageUrl.value) return '';
  return imageUrl.value.startsWith('http') ? imageUrl.value : `${baseStore.SERVER_URL}${imageUrl.value}`;
});

const fullFileUrl = computed(() => {
  if (!fileUrl.value) return '';
  return fileUrl.value.startsWith('http') ? fileUrl.value : `${baseStore.SERVER_URL}${fileUrl.value}`;
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
    : `${baseStore.SERVER_URL}${groupCardData.value.avatar_url}`;
});

const groupCardGroupName = computed(() => groupCardData.value?.group_name || '群组');
const groupCardGroupDescription = computed(() => groupCardData.value?.description || '');
const groupCardInitials = computed(() => {
  const name = groupCardGroupName.value;
  return name ? name.charAt(0).toUpperCase() : 'G';
});

async function handleQuotedMessageClick() {
  const quotedId = props.quotedMessageData?.id;
  
  if (quotedId === -1) {
    toast.warning('原引用消息已撤回', 3000);
    return;
  }
  
  if (!quotedId) {
    return;
  }
  
  let messageElement = document.querySelector(`[data-id="${quotedId}"]`);
  
  if (!messageElement) {
    try {
      const prefix = `chats-${baseStore.currentUser?.id || 'guest'}`;
      
      const storageKeys = [
        `${prefix}-public`,
        ...Object.keys(groupStore.groupMessages || {}).map(id => `${prefix}-group-${id}`),
        ...Object.keys(friendStore.privateMessages || {}).map(id => `${prefix}-private-${id}`)
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
        if (foundStorageKey.includes('-public')) {
          const storeMessages = publicStore.publicMessages;
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
              
              publicStore.prependPublicMessages(messagesToAdd);
            }
          }
        } else if (foundStorageKey.includes('-group-')) {
          const groupId = foundStorageKey.split('-group-')[1];
          const storeMessages = groupStore.groupMessages[groupId] || [];
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
              
              groupStore.prependGroupMessages(groupId, messagesToAdd);
            }
          }
        } else if (foundStorageKey.includes('-private-')) {
          const userId = foundStorageKey.split('-private-')[1];
          const storeMessages = friendStore.privateMessages[userId] || [];
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
              
              friendStore.prependPrivateMessages(userId, messagesToAdd);
            }
          }
        }
        
        setTimeout(() => {
          messageElement = document.querySelector(`[data-id="${quotedId}"]`);
          if (messageElement) {
            scrollToMessageElement(messageElement);
          }
        }, 300);
        return;
      }
    } catch (err) {
      // 查找失败，忽略
    }
  }
  
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
    modalStore.openModal('imagePreview', url);
  }
}

function handleGroupCardClick(event) {
  if (groupCardData.value) {
    showGroupCardPopup(event, groupCardData.value);
  }
}
</script>
