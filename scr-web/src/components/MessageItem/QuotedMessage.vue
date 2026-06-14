<template>
  <div 
    class="quoted-message-display quoted-message-wrapper" 
    @click="handleQuotedMessageClick"
  >
    <div class="quoted-message-header">
    <img v-if="senderAvatarUrl && !senderAvatarError" :src="senderAvatarUrl" class="quoted-sender-avatar" @error="senderAvatarError = true">
    <div v-else class="quoted-sender-avatar-fallback">{{ senderInitial }}</div>
    引用: <strong>{{ resolvedUserInfo.nickname }}</strong>
  </div>
    
    <!-- 引用图片 -->
    <div v-if="imageUrl" class="quoted-content-section">
      <img 
        :src="fullImageUrl" 
        alt="引用图片"
        class="quoted-message-image quoted-image-thumb"
        loading="lazy"
        @click.stop="handleImageClick(fullImageUrl)"
      >
    </div>
    
    <!-- 引用文件 -->
    <div v-else-if="fileUrl" class="quoted-content-section">
      <a 
        :href="fullFileUrl" 
        class="quoted-message-file-link quoted-file-link" 
        target="_blank"
        @click.stop
      >
        <span class="quoted-message-file-icon quoted-file-icon">{{ fileIcon }}</span>
        <span class="quoted-file-name">{{ displayFilename }}</span>
      </a>
    </div>
    
    <!-- 引用群名片 -->
    <div v-else-if="groupCardData" class="quoted-content-section quoted-group-card" @click.stop="handleGroupCardClick">
      <div class="quoted-group-card-header">
        <img 
          v-if="groupCardAvatarUrl && !isSvgAvatar(groupCardAvatarUrl) && !groupCardAvatarLoadFailed"
          :src="groupCardAvatarUrl"
          :alt="groupCardGroupName"
          class="quoted-group-card-avatar"
          @error="groupCardAvatarLoadFailed = true"
        >
        <div 
          v-else
          class="quoted-group-card-avatar-fallback"
        >
          {{ groupCardInitials }}
        </div>
        {{ groupCardGroupName }}
      </div>
      <div class="quoted-group-card-desc">
        {{ groupCardGroupDescription }}
      </div>
      <div class="quoted-group-card-hint">
        点击查看群组详情
      </div>
    </div>
    
    <!-- 普通文本 -->
    <div v-else class="quoted-text-preview">
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

import { useMessageHighlight } from '@/composables/useMessageHighlight';
import { useBaseStore } from '@/stores/baseStore';
import { useFriendStore } from '@/stores/friendStore';
import { useGroupStore } from '@/stores/groupStore';
import { useModalStore } from '@/stores/modalStore';
import { usePublicStore } from '@/stores/publicStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useStorageStore } from '@/stores/storageStore';
import { showGroupCardPopup } from '@/utils/chat';
import { findUserInfo } from '@/utils/chat/userLookup';

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
const sessionStore = useSessionStore();
const storageStore = useStorageStore();
const groupCardAvatarLoadFailed = ref(false);
const senderAvatarError = ref(false);
const { scrollAndHighlight } = useMessageHighlight();

function getQuotedUserInfo() {
  const msgId = props.quotedMessageData?.id;
  if (msgId && msgId !== -1 && String(msgId) !== '-1') {
    const pubMsg = publicStore.publicMessages?.find(m => String(m.id) === String(msgId));
    if (pubMsg && pubMsg.nickname) return pubMsg;
    
    const gid = sessionStore.currentGroupId;
    if (gid && groupStore.groupMessages[gid]) {
      const gMsg = groupStore.groupMessages[gid].find(m => String(m.id) === String(msgId));
      if (gMsg && gMsg.nickname) return gMsg;
    }
    
    const pid = sessionStore.currentPrivateChatUserId;
    if (pid && friendStore.privateMessages[pid]) {
      const pMsg = friendStore.privateMessages[pid].find(m => String(m.id) === String(msgId));
      if (pMsg && pMsg.nickname) return pMsg;
    }
    
    const fullPubMsg = storageStore.fullPublicMessages?.find(m => String(m.id) === String(msgId));
    if (fullPubMsg && fullPubMsg.nickname) return fullPubMsg;
    
    const fullGroups = storageStore.fullGroupMessages;
    if (fullGroups) {
      for (const [, msgs] of Object.entries(fullGroups)) {
        const found = msgs?.find(m => String(m.id) === String(msgId));
        if (found && found.nickname) return found;
      }
    }
    
    const fullPrivates = storageStore.fullPrivateMessages;
    if (fullPrivates) {
      for (const [, msgs] of Object.entries(fullPrivates)) {
        const found = msgs?.find(m => String(m.id) === String(msgId));
        if (found && found.nickname) return found;
      }
    }
  }
  return findUserInfo(props.quotedMessageData, { sessionStore, groupStore, friendStore, publicStore, baseStore });
}

const resolvedUserInfo = computed(() => getQuotedUserInfo());

const senderAvatarUrl = computed(() => {
  const avatar = getQuotedUserInfo().avatarUrl;
  if (!avatar) return '';
  return avatar.startsWith('http') ? avatar : `${baseStore.SERVER_URL}${avatar}`;
});

const senderInitial = computed(() => {
  const name = getQuotedUserInfo().nickname;
  return name ? name.charAt(0).toUpperCase() : '?';
});

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
  
  if (msg.messageType === 101) {
    const nickname = getQuotedUserInfo().nickname;
    return nickname ? `${nickname}撤回了一条消息` : '撤回了一条消息';
  }
  
  if (msg.messageType === 1) {
    return '[图片]';
  } else if (msg.messageType === 2) {
    return '[文件]';
  } else if (msg.messageType === 3) {
    return '[群名片]';
  } else if (msg.messageType === 4) {
    return msg.content || '';
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
  
  if (!quotedId || quotedId === -1 || String(quotedId) === '-1') {
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
  scrollAndHighlight(messageElement);
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
