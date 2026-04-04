<template>
  <div 
    :class="['message', isOwn ? 'own-message' : 'other-message', { 'active': isActive }]"
    :data-id="message.id"
    :data-identifier="messageIdentifier"
    :style="messageStyle"
    @contextmenu="handleContextMenu"
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
          @error="handleAvatarError"
        >
          {{ !avatarIsImage ? senderInitials : '' }}
        </component>
        <div style="flex: 1;">
          <span class="message-sender" style="font-weight: bold;">{{ senderNickname }}</span>
          <span class="message-time" style="float: right; color: #999; font-size: 12px;">{{ messageTime }}</span>
        </div>
      </template>
      <template v-else>
        <component 
          :is="avatarIsImage ? 'img' : 'div'"
          :src="avatarIsImage ? fullAvatarUrl : undefined"
          :alt="senderNickname"
          class="user-avatar"
          :class="{ 'default-avatar': !avatarIsImage }"
          style="width: 32px; height: 32px; border-radius: 50%; margin-right: 10px; background-color: #e0e0e0; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #666; cursor: pointer;"
          @click="handleAvatarClick"
          @error="handleAvatarError"
        >
          {{ !avatarIsImage ? senderInitials : '' }}
        </component>
        <div style="flex: 1;">
          <span class="message-sender" style="font-weight: bold;">{{ senderNickname }}</span>
          <span class="message-time" style="float: right; color: #999; font-size: 12px;">{{ messageTime }}</span>
        </div>
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
      <div v-else-if="isVideoFile" class="video-container" style="width: 300px; max-width: 400px;">
        <video 
          :src="fullFileUrl" 
          controls 
          style="width: 100%;"
          preload="metadata"
        >
          您的浏览器不支持视频播放
        </video>
        <div style="font-size: 12px; color: #999; margin-top: 5px;">{{ displayFilename }}</div>
      </div>
      <div v-else-if="isAudioFile" class="audio-container" style="width: 300px; max-width: 400px;">
        <audio 
          :src="fullFileUrl" 
          controls 
          style="width: 100%;"
          preload="metadata"
        >
          您的浏览器不支持音频播放
        </audio>
        <div style="font-size: 12px; color: #999; margin-top: 5px;">{{ displayFilename }}</div>
      </div>
      <div v-else-if="fileUrl" class="file-link-container">
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
        v-else-if="groupCardData" 
        class="group-card-container"
        :data-group-id="groupCardData.group_id"
        style="background-color: #f0f8ff; border: 1px solid #3498db; border-radius: 8px; padding: 10px; cursor: pointer; margin-top: 5px;"
        @click="handleGroupCardClick"
      >
        <div class="group-card-header" style="font-weight: bold; color: #3498db; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;">
          <img 
            v-if="groupCardAvatarUrl"
            :src="groupCardAvatarUrl"
            :alt="groupCardGroupName"
            style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; cursor: pointer;"
            @click.stop="handleImageClick(groupCardAvatarUrl)"
            @error="handleGroupCardAvatarError"
          >
          <div 
            v-else
            style="width: 20px; height: 20px; border-radius: 50%; background-color: #3498db; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;"
          >
            {{ groupCardInitials }}
          </div>
          {{ groupCardGroupName }}
        </div>
        <div class="group-card-description" style="color: #666; font-size: 14px; margin-bottom: 5px;">
          {{ groupCardGroupDescription }}
        </div>
        <div class="group-card-footer" style="font-size: 12px; color: #999;">
          点击查看群组详情
        </div>
      </div>
      <div v-else-if="parsedContent && !(imageUrl || fileUrl || groupCardData || quotedMessageData)" v-html="parsedContent" class="message-text"></div>
      <template v-else-if="quotedMessageData">
        <div v-if="quotedMessageData.text" class="message-text">
          <p v-if="!quotedMessageData.markdone">{{ quotedMessageData.text }}</p>
          <div v-else v-html="quotedMessageParsedContent"></div>
        </div>
        <QuotedMessage :quoted-message-data="quotedMessageData.quoted" />
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import { useChatStore } from '@/stores/chatStore';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import QuotedMessage from './QuotedMessage.vue';

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

const isActive = ref(false);
const avatarLoadFailed = ref(false);
const groupCardAvatarLoadFailed = ref(false);

onMounted(() => {
  const messageEl = document.querySelector(`[data-id="${props.message.id}"]`);
  if (messageEl) {
    messageEl.addEventListener('click', (e) => {
      const link = e.target.closest('a.message-link, a.file-link');
      if (link) {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href) {
          window.open(href, '_blank');
        }
      }
    });
  }
});

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


const senderNickname = computed(() => {
  const nickname = messageUser.value.nickname || '未知用户';
  return nickname;
});
const senderInitials = computed(() => senderNickname.value ? senderNickname.value.charAt(0).toUpperCase() : 'U');
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

const avatarIsImage = computed(() => fullAvatarUrl.value !== '' && !avatarLoadFailed.value);

function handleAvatarError() {
  avatarLoadFailed.value = true;
}

const messageTime = computed(() => {
  if (props.message.timestamp) {
    return new Date(props.message.timestamp).toLocaleTimeString();
  }
  return new Date().toLocaleTimeString();
});

const messageIdentifier = computed(() => {
  if (props.message.identifier) return props.message.identifier;
  const content = props.message.content || props.message.text || 'empty';
  const sender = props.message.userId || props.message.senderId || 'unknown';
  const time = props.message.timestamp || props.message.createdAt || 'unknown';
  const data = `${sender}-${time}-${JSON.stringify(content)}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
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
      alignSelf: 'flex-end'
    };
  } else {
    return {
      marginLeft: '10px',
      marginRight: '20%',
      backgroundColor: '#FFFFFF',
      borderRadius: '18px',
      padding: '10px 15px',
      maxWidth: '80%',
      alignSelf: 'flex-start',
      border: '1px solid #E0E0E0'
    };
  }
});

const messageData = computed(() => {
  let imageUrl = props.message.imageUrl;
  let fileUrl = props.message.fileUrl;
  let filename = props.message.filename;
  let textContent = props.message.content;
  let groupCardData = null;
  let quotedMessageData = null;
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
      case 4:
        try {
          const quotedData = JSON.parse(props.message.content);
          if (quotedData.type === 'quoted' && quotedData.quoted) {
            quotedMessageData = {
              quoted: quotedData.quoted,
              text: quotedData.text || '',
              markdone: quotedData.markdone || false
            };
            textContent = quotedData.text || '';
          }
        } catch (error) {
          console.error('解析引用消息JSON失败:', error);
        }
        break;
      default:
        textContent = props.message.content;
        break;
    }
  }

  return { imageUrl, fileUrl, filename, textContent, groupCardData, quotedMessageData, width, height };
});

const imageUrl = computed(() => messageData.value.imageUrl);
const fileUrl = computed(() => messageData.value.fileUrl);
const filename = computed(() => messageData.value.filename);
const textContent = computed(() => messageData.value.textContent);
const groupCardData = computed(() => messageData.value.groupCardData);
const quotedMessageData = computed(() => messageData.value.quotedMessageData);
const imageWidth = computed(() => messageData.value.width);
const imageHeight = computed(() => messageData.value.height);

const isAudioFile = computed(() => {
  if (!filename.value) return false;
  const ext = filename.value.split('.').pop().toLowerCase();
  return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext);
});

const isVideoFile = computed(() => {
  if (!filename.value) return false;
  const ext = filename.value.split('.').pop().toLowerCase();
  return ['mp4', 'webm', 'ogg', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v'].includes(ext);
});

const quotedMessageParsedContent = computed(() => {
  if (!quotedMessageData.value?.text || !quotedMessageData.value?.markdone) return '';
  
  let contentToParse = escapeHtml(quotedMessageData.value.text);
  
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
    
    const lines = code.split('\n');
    let lineNumbers = '';
    let codeLines = '';
    lines.forEach((line, index) => {
      lineNumbers += `<pre><span class="line">${index + 1}</span></pre>`;
      codeLines += `<pre><code>${line}</code></pre>`;
    });
    
    return `<figure class="highlight">
      <div class="highlight-tools">
        <div class="macStyle">
          <div class="mac-close"></div>
          <div class="mac-minimize"></div>
          <div class="mac-maximize"></div>
        </div>
        <div class="code-lang">${language}</div>
        <div class="copy-notice"></div>
        <i class="fas fa-paste copy-button" data-code="${encodedCode}"></i>
        <i class="fa-solid fa-up-right-and-down-left-from-center fullpage-button"></i>
      </div>
      <table>
        <tbody>
          <tr>
            <td class="gutter">
              ${lineNumbers}
            </td>
            <td class="code">
              ${codeLines}
            </td>
          </tr>
        </tbody>
      </table>
    </figure>`;
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

  return DOMPurify.sanitize(parsed);
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
  // 如果头像加载失败，返回空字符串
  if (groupCardAvatarLoadFailed.value) return '';
  
  if (!groupCardData.value || !groupCardData.value.avatarUrl) return '';
  return `${chatStore.SERVER_URL}${groupCardData.value.avatarUrl}`;
});

function handleGroupCardAvatarError() {
  groupCardAvatarLoadFailed.value = true;
}

const groupCardGroupName = computed(() => {
  if (!groupCardData.value || !groupCardData.value.group_name) return '';
  return groupCardData.value.group_name;
});

const groupCardGroupDescription = computed(() => {
  if (!groupCardData.value || !groupCardData.value.group_description) return '暂无公告';
  return groupCardData.value.group_description;
});

const groupCardInitials = computed(() => {
  const name = groupCardGroupName.value;
  return name ? name.charAt(0).toUpperCase() : 'G';
});

function escapeHtml(text) {
  if (typeof text !== 'string') return text;
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const parsedContent = computed(() => {
  if (!textContent.value) return '';

  const isMarkdown = props.message.messageType === 5;
  
  // 对于非 Markdown 消息，也要自动识别链接
  if (!isMarkdown) {
    let escapedContent = escapeHtml(textContent.value);
    // 使用正则表达式识别 URL 并转换为可点击链接
    const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
    escapedContent = escapedContent.replace(urlRegex, (url) => {
      return `<a href="${url}" class="message-link" target="_blank" rel="noopener noreferrer" style="color: #3498db; text-decoration: none;">${url}</a>`;
    });
    return `<p>${escapedContent}</p>`;
  }

  let contentToParse = escapeHtml(textContent.value);

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
    
    const lines = code.split('\n');
    let lineNumbers = '';
    let codeLines = '';
    lines.forEach((line, index) => {
      lineNumbers += `<pre><span class="line">${index + 1}</span></pre>`;
      codeLines += `<pre><code>${line}</code></pre>`;
    });
    
    return `<figure class="highlight">
      <div class="highlight-tools">
        <div class="macStyle">
          <div class="mac-close"></div>
          <div class="mac-minimize"></div>
          <div class="mac-maximize"></div>
        </div>
        <div class="code-lang">${language}</div>
        <div class="copy-notice"></div>
        <i class="fas fa-paste copy-button" data-code="${encodedCode}"></i>
        <i class="fa-solid fa-up-right-and-down-left-from-center fullpage-button"></i>
      </div>
      <table>
        <tbody>
          <tr>
            <td class="gutter">
              ${lineNumbers}
            </td>
            <td class="code">
              ${codeLines}
            </td>
          </tr>
        </tbody>
      </table>
    </figure>`;
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



function handleContextMenu(event) {
  event.preventDefault();
  
  const messageElement = event.currentTarget;
  const messageId = messageElement.getAttribute('data-id');
  const currentUserId = chatStore.currentUser?.id;
  const senderNicknameValue = messageElement.querySelector('.message-sender')?.textContent || '';
  const messageType = props.message.messageType || 0;
  
  if (!messageId) return;
  
  hideContextMenu();
  
  const contextMenu = document.createElement('div');
  contextMenu.className = 'message-context-menu';
  contextMenu.style.position = 'fixed';
  contextMenu.style.left = event.clientX + 'px';
  contextMenu.style.top = event.clientY + 'px';
  contextMenu.style.backgroundColor = 'white';
  contextMenu.style.border = '1px solid #ddd';
  contextMenu.style.borderRadius = '4px';
  contextMenu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
  contextMenu.style.zIndex = '10000';
  contextMenu.style.padding = '5px 0';
  
  // 引用消息菜单项
  const quoteMenuItem = document.createElement('div');
  quoteMenuItem.className = 'context-menu-item';
  quoteMenuItem.textContent = '引用';
  quoteMenuItem.style.padding = '8px 15px';
  quoteMenuItem.style.cursor = 'pointer';
  quoteMenuItem.style.fontSize = '14px';
  quoteMenuItem.style.whiteSpace = 'nowrap';
  
  const userId = messageUser.value?.id;
  
  quoteMenuItem.addEventListener('click', () => {
    let quotedMsgData = {};
    if (messageType === 4) {
      quotedMsgData = {
        id: messageId,
        userId: userId,
        nickname: senderNicknameValue,
        content: JSON.parse(props.message.content).text,
        messageType: 4
      };
    } else {
      quotedMsgData = {
        id: messageId,
        userId: userId,
        nickname: senderNicknameValue,
        content: props.message.content,
        messageType: messageType
      };
    }

    chatStore.setQuotedMessage(quotedMsgData);
    hideContextMenu();
  });
  
  contextMenu.appendChild(quoteMenuItem);
  
  const isOwnMessage = messageUser.value && String(messageUser.value.id) === String(currentUserId);
  
  // 删除消息菜单项
  const deleteMenuItem = document.createElement('div');
  deleteMenuItem.className = 'context-menu-item';
  deleteMenuItem.textContent = '删除';
  deleteMenuItem.style.padding = '8px 15px';
  deleteMenuItem.style.cursor = 'pointer';
  deleteMenuItem.style.fontSize = '14px';
  deleteMenuItem.style.whiteSpace = 'nowrap';
  
  deleteMenuItem.addEventListener('click', () => {
    chatStore.deleteGroupMessage(chatStore.currentGroupId, messageId);
    hideContextMenu();
  });
  
  contextMenu.appendChild(deleteMenuItem);
  
  // 撤回消息菜单项（仅自己的消息）
  if (isOwnMessage) {
    const menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item';
    menuItem.textContent = '撤回';
    menuItem.style.padding = '8px 15px';
    menuItem.style.cursor = 'pointer';
    menuItem.style.fontSize = '14px';
    menuItem.style.whiteSpace = 'nowrap';
    
    menuItem.addEventListener('click', () => {
      if (window.chatSocket && messageId) {
        window.chatSocket.emit('delete-message', {
          messageId: messageId,
          sessionToken: chatStore.currentSessionToken,
          userId: currentUserId
        });
      }
      hideContextMenu();
    });
    
    contextMenu.appendChild(menuItem);
  }
  
  document.body.appendChild(contextMenu);
  
  window.currentMessageContextMenu = contextMenu;
  
  setTimeout(() => {
    document.addEventListener('click', hideContextMenu);
  }, 0);
}

function hideContextMenu() {
  if (window.currentMessageContextMenu) {
    document.body.removeChild(window.currentMessageContextMenu);
    window.currentMessageContextMenu = null;
  }
  document.removeEventListener('click', hideContextMenu);
}
</script>

<style scoped>
.message {
  word-break: break-word;
  display: flex;
  flex-direction: column;
  margin-bottom: 10px;
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
