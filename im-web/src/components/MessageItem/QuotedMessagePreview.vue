<template>
  <div class="quoted-message-preview" style="display: flex; align-items: center; padding: 8px 12px; background: #f5f5f5; border-left: 3px solid #4CAF50; margin-bottom: 8px; border-radius: 4px;">
    <div style="flex: 1;">
      <div style="font-size: 12px; color: #666;">引用: <strong>{{ quotedMessage.nickname }}</strong></div>
      <!-- 引用图片 -->
      <div v-if="isImage" style="margin-top: 5px;">
        <img :src="fullImageUrl" alt="引用图片" style="max-width: 100px; max-height: 80px; border-radius: 4px; object-fit: cover;">
      </div>
      <!-- 引用文件 -->
      <div v-else-if="isFile" style="margin-top: 5px;">
        <span style="font-size: 16px;">{{ fileIcon }}</span>
        <span style="font-size: 13px; margin-left: 5px;">{{ displayFilename }}</span>
      </div>
      <!-- 引用群名片 -->
      <div v-else-if="isGroupCard" style="margin-top: 5px; background-color: #f0f8ff; border: 1px solid #3498db; border-radius: 4px; padding: 6px;">
        <div style="font-weight: bold; color: #3498db; font-size: 13px; display: flex; align-items: center; gap: 4px;">
          <img 
            v-if="groupCardAvatarUrl && !groupCardAvatarLoadFailed" 
            :src="groupCardAvatarUrl" 
            style="width: 16px; height: 16px; border-radius: 50%; object-fit: cover;"
            @error="groupCardAvatarLoadFailed = true"
          >
          <div 
            v-else
            style="width: 16px; height: 16px; border-radius: 50%; background-color: #3498db; color: white; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold;"
          >
            {{ groupCardInitials }}
          </div>
          {{ groupCardGroupName }}
        </div>
      </div>
      <!-- 普通文本 -->
      <div v-else style="font-size: 13px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        {{ displayContent }}
      </div>
    </div>
    <button @click="$emit('close')" style="background: none; border: none; color: #999; font-size: 18px; cursor: pointer; padding: 0 5px;">×</button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useChatStore } from '@/stores/chatStore';

const props = defineProps({
  quotedMessage: {
    type: Object,
    required: true
  }
});

defineEmits(['close']);

const chatStore = useChatStore();
const groupCardAvatarLoadFailed = ref(false);

const messageType = computed(() => props.quotedMessage?.messageType || 0);

const isImage = computed(() => messageType.value === 1);
const isFile = computed(() => messageType.value === 2);
const isGroupCard = computed(() => messageType.value === 3);

const imageUrl = computed(() => {
  if (!isImage.value) return null;
  try {
    const data = JSON.parse(props.quotedMessage.content || '{}');
    return data.url || null;
  } catch {
    return null;
  }
});

const fullImageUrl = computed(() => {
  if (!imageUrl.value) return '';
  return imageUrl.value.startsWith('http') ? imageUrl.value : `${chatStore.SERVER_URL}${imageUrl.value}`;
});

const filename = computed(() => {
  if (!isFile.value) return null;
  try {
    const data = JSON.parse(props.quotedMessage.content || '{}');
    return data.filename || data.name || null;
  } catch {
    return null;
  }
});

const displayFilename = computed(() => filename.value || '文件');

const fileIcon = computed(() => {
  if (!filename.value) return '📄';
  const ext = filename.value.split('.').pop()?.toLowerCase() || '';
  const extIcons = {
    pdf: '📕', doc: '📘', docx: '📘',
    xls: '📗', xlsx: '📗',
    ppt: '📙', pptx: '📙',
    zip: '📦', rar: '📦', '7z': '📦',
    mp3: '🎵', mp4: '🎬', avi: '🎬', mov: '🎬',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', bmp: '🖼️', webp: '🖼️'
  };
  return extIcons[ext] || '📄';
});

const groupCardData = computed(() => {
  if (!isGroupCard.value) return null;
  try {
    const data = JSON.parse(props.quotedMessage.content || '{}');
    if (data.type === 'group_card' && data.group_id) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
});

const groupCardAvatarUrl = computed(() => {
  if (!groupCardData.value?.avatar_url) return '';
  return groupCardData.value.avatar_url.startsWith('http') 
    ? groupCardData.value.avatar_url 
    : `${chatStore.SERVER_URL}${groupCardData.value.avatar_url}`;
});

const groupCardGroupName = computed(() => groupCardData.value?.group_name || '群组');

const groupCardInitials = computed(() => {
  const name = groupCardGroupName.value;
  return name ? name.charAt(0).toUpperCase() : 'G';
});

const displayContent = computed(() => props.quotedMessage?.content || '');
</script>
