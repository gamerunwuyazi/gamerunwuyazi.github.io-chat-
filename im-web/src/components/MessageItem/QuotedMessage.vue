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

const props = defineProps({
  quotedMessageData: {
    type: Object,
    required: true
  }
});

const chatStore = useChatStore();
const groupCardAvatarLoadFailed = ref(false);

const imageUrl = computed(() => {
  if (!props.quotedMessageData) return null;
  if (props.quotedMessageData.messageType !== 1) return null;
  
  try {
    const data = JSON.parse(props.quotedMessageData.content || '{}');
    return data.url || null;
  } catch {
    return null;
  }
});

const fileUrl = computed(() => {
  if (!props.quotedMessageData) return null;
  if (props.quotedMessageData.messageType !== 2) return null;
  
  try {
    const data = JSON.parse(props.quotedMessageData.content || '{}');
    return data.url || null;
  } catch {
    return null;
  }
});

const filename = computed(() => {
  if (!props.quotedMessageData) return null;
  if (props.quotedMessageData.messageType !== 2) return null;
  
  try {
    const data = JSON.parse(props.quotedMessageData.content || '{}');
    return data.filename || data.name || null;
  } catch {
    return null;
  }
});

const groupCardData = computed(() => {
  if (!props.quotedMessageData) return null;
  if (props.quotedMessageData.messageType !== 3) return null;
  
  try {
    const data = JSON.parse(props.quotedMessageData.content || '{}');
    if (data.type === 'group_card' && data.group_id) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
});

const displayContent = computed(() => {
  return props.quotedMessageData?.content || '';
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

function handleQuotedMessageClick() {
  const quotedId = props.quotedMessageData?.id;
  if (!quotedId) return;
  
  const messageElement = document.querySelector(`[data-id="${quotedId}"]`);
  if (messageElement) {
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
