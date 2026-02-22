<template>
  <div 
    :class="['message', isOwn ? 'own-message' : 'other-message']"
    :data-id="message.id"
    :data-user-id="senderId"
    :data-sequence="message.sequence"
    :style="messageStyle"
  >
    <div class="message-header" style="display: flex; align-items: center; margin-bottom: 5px;">
      <template v-if="!isOwn">
        <component 
          :is="avatarIsImage ? 'img' : 'div'"
          :src="avatarIsImage ? fullAvatarUrl : undefined"
          :alt="senderNickname"
          class="user-avatar"
          :class="{ 'default-avatar': !avatarIsImage }"
          style="width: 32px; height: 32px; border-radius: 50%; margin-right: 10px; background-color: #e0e0e0; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #666; cursor: pointer;"
          @click="handleAvatarClick"
        >
          {{ !avatarIsImage ? senderNickname.charAt(0).toUpperCase() : '' }}
        </component>
        <div style="flex: 1;">
          <span class="message-sender" style="font-weight: bold;">{{ senderNickname }}</span>
          <span class="message-time" style="float: right; color: #999; font-size: 12px;">{{ messageTime }}</span>
        </div>
      </template>
      <template v-if="isOwn">
        <component 
          :is="avatarIsImage ? 'img' : 'div'"
          :src="avatarIsImage ? fullAvatarUrl : undefined"
          :alt="senderNickname"
          class="user-avatar"
          :class="{ 'default-avatar': !avatarIsImage }"
          style="width: 32px; height: 32px; border-radius: 50%; margin-right: 10px; background-color: #e0e0e0; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #666; cursor: pointer;"
          @click="handleAvatarClick"
        >
          {{ !avatarIsImage ? senderNickname.charAt(0).toUpperCase() : '' }}
        </component>
        <div style="flex: 1;">
          <span class="message-sender" style="font-weight: bold;">{{ senderNickname }}</span>
          <span class="message-time" style="float: right; color: #999; font-size: 12px;">{{ messageTime }}</span>
        </div>
        <button 
          v-if="message.id"
          class="delete-button" 
          :data-id="message.id"
          title="撤回消息"
          style="background: none; border: none; color: #999; font-size: 16px; cursor: pointer; margin-left: 10px;"
          @click="handleDeleteClick"
        >
          ×
        </button>
      </template>
    </div>
    <div class="message-content">
      <div v-if="imageUrl" class="message-image-container">
        <img 
          :src="fullImageUrl" 
          :alt="filename || '图片'"
          :width="imageWidth"
          :height="imageHeight"
          class="message-image"
          style="max-width: 100%; height: auto; cursor: pointer;"
          @click="handleImageClick(fullImageUrl)"
        >
      </div>
      <div v-if="fileUrl" class="file-link-container">
        <a 
          :href="fullFileUrl" 
          class="file-link" 
          target="_blank"
          style="color: #3498db; text-decoration: none;"
        >
          <span class="file-icon">{{ fileIcon }}</span>
          <span>{{ displayFilename }}</span>
        </a>
      </div>
      <div 
        v-if="groupCardData" 
        class="group-card-container"
        :data-group-id="groupCardData.group_id"
        style="background-color: #f0f8ff; border: 1px solid #3498db; border-radius: 8px; padding: 10px; cursor: pointer; margin-top: 5px;"
        @click="handleGroupCardClick"
      >
        <div class="group-card-header" style="font-weight: bold; color: #3498db; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;">
          <img 
            v-if="groupCardData.avatar_url"
            :src="groupCardAvatarUrl"
            :alt="groupCardData.group_name"
            style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; cursor: pointer;"
            @click.stop="handleImageClick(groupCardAvatarUrl)"
          >
          <div 
            v-else
            style="width: 20px; height: 20px; border-radius: 50%; background-color: #3498db; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;"
          >
            {{ groupCardData.group_name.charAt(0).toUpperCase() }}
          </div>
          {{ groupCardData.group_name }}
        </div>
        <div class="group-card-description" style="color: #666; font-size: 14px; margin-bottom: 5px;">
          {{ groupCardData.group_description || '暂无公告' }}
        </div>
        <div class="group-card-footer" style="font-size: 12px; color: #999;">
          点击查看群组详情
        </div>
      </div>
      <div v-if="parsedContent && !(imageUrl || fileUrl || groupCardData)" v-html="parsedContent" class="message-text"></div>
      <div v-if="showFilename" class="message-filename" style="margin-top: 5px; color: #666; font-size: 12px;">
        {{ filename }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineProps } from 'vue';
import { useChatStore } from '../../stores/chatStore';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const props = defineProps({
  message: {
    type: Object,
    required: true
  },
  isOwn: {
    type: Boolean,
    default: false
  }
});

const chatStore = useChatStore();

const messageUser = computed(() => {
  if (props.message.user) {
    return props.message.user;
  }
  return {
    id: props.message.userId,
    nickname: props.message.nickname,
    avatarUrl: props.message.avatarUrl
  };
});

const senderId = computed(() => messageUser.value.id);
const senderNickname = computed(() => messageUser.value.nickname || '未知用户');
const senderAvatarUrl = computed(() => messageUser.value.avatarUrl);

const isSvgAvatar = computed(() => {
  if (!senderAvatarUrl.value) return false;
  return typeof senderAvatarUrl.value === 'string' && 
    (/\.(svg)$/i.test(senderAvatarUrl.value) || senderAvatarUrl.value.includes('.svg'));
});

const fullAvatarUrl = computed(() => {
  if (senderAvatarUrl.value && !isSvgAvatar.value) {
    return `${chatStore.SERVER_URL}${senderAvatarUrl.value}`;
  }
  return '';
});

const avatarIsImage = computed(() => fullAvatarUrl.value !== '');

const messageTime = computed(() => {
  if (props.message.timestamp) {
    return new Date(props.message.timestamp).toLocaleTimeString();
  }
  return new Date().toLocaleTimeString();
});

const messageStyle = computed(() => {
  if (props.isOwn) {
    return {
      marginLeft: '20%',
      marginRight: '10px',
      backgroundColor: '#E8F5E8',
      borderRadius: '18px',
      padding: '10px 15px',
      maxWidth: '80%',
      minWidth: '70px',
      alignSelf: 'flex-end',
      display: 'flex',
      flexDirection: 'column',
      marginBottom: '10px'
    };
  } else {
    return {
      marginLeft: '10px',
      marginRight: '20%',
      backgroundColor: '#FFFFFF',
      borderRadius: '18px',
      padding: '10px 15px',
      maxWidth: '80%',
      minWidth: '70px',
      alignSelf: 'flex-start',
      border: '1px solid #E0E0E0',
      display: 'flex',
      flexDirection: 'column',
      marginBottom: '10px'
    };
  }
});

const messageData = computed(() => {
  let imageUrl = props.message.imageUrl;
  let fileUrl = props.message.fileUrl;
  let filename = props.message.filename;
  let textContent = props.message.content;
  let groupCardData = null;
  let width = props.message.width;
  let height = props.message.height;

  if (props.message.messageType !== undefined) {
    switch (props.message.messageType) {
      case 1:
        try {
          const imageData = JSON.parse(props.message.content);
          imageUrl = imageData.url;
          filename = imageData.filename;
          if (imageData.width && imageData.height) {
            width = imageData.width;
            height = imageData.height;
          }
        } catch (error) {
          console.error('解析图片消息JSON失败:', error);
        }
        break;
      case 2:
        try {
          const fileData = JSON.parse(props.message.content);
          fileUrl = fileData.url;
          filename = fileData.filename;
        } catch (error) {
          console.error('解析文件消息JSON失败:', error);
        }
        break;
      case 3:
        try {
          groupCardData = JSON.parse(props.message.content);
          if (groupCardData.type !== 'group_card' || !groupCardData.group_id) {
            groupCardData = null;
          }
        } catch (error) {
          console.error('解析群名片消息JSON失败:', error);
          groupCardData = null;
        }
        break;
      default:
        textContent = props.message.content;
        break;
    }
  }

  return { imageUrl, fileUrl, filename, textContent, groupCardData, width, height };
});

const imageUrl = computed(() => messageData.value.imageUrl);
const fileUrl = computed(() => messageData.value.fileUrl);
const filename = computed(() => messageData.value.filename);
const textContent = computed(() => messageData.value.textContent);
const groupCardData = computed(() => messageData.value.groupCardData);
const imageWidth = computed(() => messageData.value.width);
const imageHeight = computed(() => messageData.value.height);

const fullImageUrl = computed(() => {
  if (!imageUrl.value) return '';
  return imageUrl.value.startsWith('http') ? imageUrl.value : `${chatStore.SERVER_URL}${imageUrl.value}`;
});

const fullFileUrl = computed(() => {
  if (!fileUrl.value) return '';
  return fileUrl.value.startsWith('http') ? fileUrl.value : `${chatStore.SERVER_URL}${fileUrl.value}`;
});

const displayFilename = computed(() => filename.value || '文件');

const fileExtension = computed(() => displayFilename.value.split('.').pop().toLowerCase());

const fileIcon = computed(() => {
  let icon = '📄';
  if (/^(pdf|doc|docx|txt|rtf)$/i.test(fileExtension.value)) {
    icon = '📝';
  } else if (/^(xls|xlsx|csv)$/i.test(fileExtension.value)) {
    icon = '📊';
  } else if (/^(zip|rar|7z|tar|gz)$/i.test(fileExtension.value)) {
    icon = '🗜️';
  } else if (/^(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileExtension.value)) {
    icon = '🖼️';
  } else if (/^(mp3|wav|ogg|flac)$/i.test(fileExtension.value)) {
    icon = '🎵';
  } else if (/^(mp4|avi|mov|wmv|flv)$/i.test(fileExtension.value)) {
    icon = '🎬';
  } else if (/^(exe|dll|bat|sh)$/i.test(fileExtension.value)) {
    icon = '⚙️';
  } else if (/^(ppt|pptx)$/i.test(fileExtension.value)) {
    icon = '📋';
  } else if (/^(js|ts|html|css|php|py|java|c|cpp|cs|go|rb|swift|kt)$/i.test(fileExtension.value)) {
    icon = '💻';
  }
  return icon;
});

const groupCardAvatarUrl = computed(() => {
  if (!groupCardData.value || !groupCardData.value.avatar_url) return '';
  return `${chatStore.SERVER_URL}${groupCardData.value.avatar_url}`;
});

const showFilename = computed(() => {
  return filename.value && !fileUrl.value && !imageUrl.value && 
    (!textContent.value || !textContent.value.includes(filename.value));
});

function escapeHtml(text) {
  if (typeof text !== 'string') return text;
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const parsedContent = computed(() => {
  if (!textContent.value) return '';

  let contentToParse = textContent.value;
  contentToParse = escapeHtml(contentToParse);

  if (chatStore.SERVER_URL) {
    contentToParse = contentToParse.replace(/!\[([^\]]+)\]\(([^)]+)\)/g, (match, alt, url) => {
      const trimmedUrl = url.trim();
      if (trimmedUrl && !trimmedUrl.startsWith('http') && !trimmedUrl.startsWith('//')) {
        return `![${alt}](${chatStore.SERVER_URL}${trimmedUrl})`;
      }
      return match;
    });

    contentToParse = contentToParse.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
      const trimmedUrl = url.trim();
      if (trimmedUrl && !trimmedUrl.startsWith('http') && !trimmedUrl.startsWith('//')) {
        if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?(:\d+)?/.test(trimmedUrl)) {
          return `[${text}](https://${trimmedUrl})`;
        } else {
          return `[${text}](${chatStore.SERVER_URL}${trimmedUrl})`;
        }
      }
      return match;
    });

    const urlRegex = /(?<!\]\()(?<!\[)(?<!https?:\/\/[^?&"'<>\s]+\?.*)(?<!https?:\/\/[^?&"'<>\s]+&.*)(https?:\/\/(?:[^\s"'<>]+))/g;
    contentToParse = contentToParse.replace(urlRegex, '[$1]($1)');
  }

  const renderer = new marked.Renderer();
  renderer.code = function({ text, lang }) {
    const language = lang || 'text';
    const code = text;
    const encodedCode = encodeURIComponent(code);
    
    return `<pre class="markdown-code-block" data-code="${encodedCode}"><code class="language-${language}">${code}</code></pre>`;
  };

  marked.setOptions({
    breaks: true,
    gfm: true,
    renderer: renderer
  });

  let parsed = marked.parse(contentToParse).trim();
  parsed = parsed.replace(/<svg[^>]*>.*?<\/svg>/gi, '[SVG图片]');
  parsed = parsed.replace(/<(?!\/?(a|img|div|span|br|p|h[1-6]|strong|em|code|pre|ul|ol|li|blockquote|figure|table|tbody|tr|td|i)\b)[^>]*>/gi, '');

  parsed = parsed.replace(/<img/g, '<img class="message-image" style="max-width: 100%; height: auto; cursor: pointer;"');
  parsed = parsed.replace(/<a/g, '<a class="message-link" target="_blank" rel="noopener noreferrer" style="color: #3498db; text-decoration: none;"');

  parsed = parsed.replace(/<a([^>]*)(href="([^"]*)")([^>]*)>([^<]*)<\/a>/g, (match, attr1, hrefAttr, href, attr2, text) => {
    const hasDownloadAttr = match.includes('download');
    const isHttpLink = /^https?:\/\//i.test(href);
    const isImageLink = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(href);
    const fileExtensions = /\.(pdf|doc|docx|txt|rtf|xls|xlsx|csv|zip|rar|7z|tar|gz|mp3|wav|ogg|flac|mp4|avi|mov|wmv|flv|exe|dll|bat|sh|ppt|pptx|js|ts|html|css|php|py|java|c|cpp|cs|go|rb|swift|kt|svg)$/i;
    const hasFileExtension = fileExtensions.test(href);

    if (isImageLink) {
      return match;
    }

    if (hasDownloadAttr || (!isHttpLink && hasFileExtension)) {
      const fileExt = href.split('.').pop().toLowerCase();
      let icon = '📄';
      if (/^(pdf|doc|docx|txt|rtf)$/i.test(fileExt)) {
        icon = '📝';
      } else if (/^(xls|xlsx|csv)$/i.test(fileExt)) {
        icon = '📊';
      } else if (/^(zip|rar|7z|tar|gz)$/i.test(fileExt)) {
        icon = '🗜️';
      } else if (/^(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileExt)) {
        icon = '🖼️';
      } else if (/^(mp3|wav|ogg|flac)$/i.test(fileExt)) {
        icon = '🎵';
      } else if (/^(mp4|avi|mov|wmv|flv)$/i.test(fileExt)) {
        icon = '🎬';
      } else if (/^(exe|dll|bat|sh)$/i.test(fileExt)) {
        icon = '⚙️';
      } else if (/^(ppt|pptx)$/i.test(fileExt)) {
        icon = '📋';
      } else if (/^(js|ts|html|css|php|py|java|c|cpp|cs|go|rb|swift|kt)$/i.test(fileExt)) {
        icon = '💻';
      }

      return `<div class="file-link-container"><a${attr1} ${hrefAttr}${attr2} class="file-link" target="_blank"><span class="file-icon">${icon}</span><span>${text}</span></a></div>`;
    }

    return match;
  });

  return DOMPurify.sanitize(parsed);
});

function handleAvatarClick(event) {
  event.stopPropagation();
  if (typeof window.showUserAvatarPopupVue === 'function') {
    window.showUserAvatarPopupVue(event, messageUser.value);
  } else {
    chatStore.openModal('userAvatarPopup', messageUser.value);
  }
}

function handleImageClick(url) {
  chatStore.openModal('imagePreview', url);
}

function handleGroupCardClick(event) {
  event.stopPropagation();
  if (typeof window.showGroupCardPopup === 'function') {
    window.showGroupCardPopup(event, groupCardData.value);
  }
}

function handleDeleteClick(event) {
  event.stopPropagation();
  const messageId = props.message.id;
  if (messageId) {
    window.chatSocket.emit('delete-message', {
      messageId: messageId,
      sessionToken: chatStore.currentSessionToken,
      userId: messageUser.value.id
    });
  }
}
</script>

<style scoped>
.message {
  word-break: break-word;
}

.message-text {
  white-space: pre-wrap;
}

.message-text img {
  max-width: 100%;
  height: auto;
  cursor: pointer;
}
</style>
