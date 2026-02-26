<script setup>
/* eslint-disable vue/multi-word-component-names */
import { onMounted } from 'vue';
import { useChatStore } from '@/stores/chatStore';

const chatStore = useChatStore();

onMounted(() => {
  window.chatStore = chatStore;
});

// 工具函数：HTML反转义
function unescapeHtml(html) {
  if (typeof html !== 'string') return html;
  const text = document.createElement('textarea');
  text.innerHTML = html;
  return text.value;
}

// 工具函数：获取用户头像URL
function getAvatarUrl(user) {
  let avatarUrl = '';
  if (user.avatarUrl && typeof user.avatarUrl === 'string') {
    avatarUrl = user.avatarUrl.trim();
  } else if (user.avatar_url && typeof user.avatar_url === 'string') {
    avatarUrl = user.avatar_url.trim();
  } else if (user.avatar && typeof user.avatar === 'string') {
    avatarUrl = user.avatar.trim();
  }
  return avatarUrl;
}

// 工具函数：检查是否为SVG格式
function isSvgAvatar(url) {
  return url && /\.svg$/i.test(url);
}

// 工具函数：获取用户显示名称
function getUserDisplayName(user) {
  const isCurrentUser = chatStore.currentUser && String(chatStore.currentUser.id) === String(user.id);
  if (isCurrentUser) {
    return `<strong>${unescapeHtml(user.nickname)} (我)</strong>`;
  }
  return unescapeHtml(user.nickname);
}

// 处理用户头像点击
function handleUserAvatarClick(event, user) {
  event.stopPropagation();
  if (window.showUserAvatarPopupVue) {
    window.showUserAvatarPopupVue(event, user);
  } else {
    const userData = {
      id: user.id,
      nickname: unescapeHtml(user.nickname),
      username: user.username,
      avatarUrl: getAvatarUrl(user)
    };
    chatStore.openModal('userAvatarPopup', userData);
  }
}
</script>

<template>
  <div id="secondary-sidebar">
    <div class="secondary-content" data-content="public-chat">
        <div class="sidebar-section">
            <h3>在线用户 <span id="onlineCount">({{ chatStore.onlineUsers.length }})</span></h3>
            <ul class="user-list" id="userList">
                <li v-if="chatStore.onlineUsers.length === 0">暂无在线用户</li>
                <li v-else v-for="user in chatStore.onlineUsers" :key="user.id" class="user-item" 
                    :style="{ padding: '8px 0px', display: 'flex', alignItems: 'center', fontWeight: 'normal' }">
                    <span v-if="getAvatarUrl(user) && !isSvgAvatar(getAvatarUrl(user))" class="user-avatar" @click="handleUserAvatarClick($event, user)">
                        <img :src="`${chatStore.SERVER_URL}${getAvatarUrl(user)}`" :alt="unescapeHtml(user.nickname)">
                    </span>
                    <span v-else class="user-avatar" @click="handleUserAvatarClick($event, user)">
                        {{ unescapeHtml(user.nickname) ? unescapeHtml(user.nickname).charAt(0).toUpperCase() : 'U' }}
                    </span>
                    <span class="user-name" v-html="getUserDisplayName(user)"></span>
                    <span class="user-status online"></span>
                </li>
            </ul>
        </div>
        
        <div class="sidebar-section">
            <div class="section-header">
                <h3>离线用户</h3>
            </div>
            <ul class="user-list" id="offlineUserList">
                <li v-if="chatStore.offlineUsers.length === 0">暂无离线用户</li>
                <li v-else v-for="user in chatStore.offlineUsers" :key="user.id" class="user-item"
                    :style="{ padding: '8px 0px', display: 'flex', alignItems: 'center', fontWeight: 'normal' }">
                    <span v-if="getAvatarUrl(user) && !isSvgAvatar(getAvatarUrl(user))" class="user-avatar" @click="handleUserAvatarClick($event, user)">
                        <img :src="`${chatStore.SERVER_URL}${getAvatarUrl(user)}`" :alt="unescapeHtml(user.nickname)">
                    </span>
                    <span v-else class="user-avatar" @click="handleUserAvatarClick($event, user)">
                        {{ unescapeHtml(user.nickname) ? unescapeHtml(user.nickname).charAt(0).toUpperCase() : 'U' }}
                    </span>
                    <span class="user-name" v-html="unescapeHtml(user.nickname)"></span>
                </li>
            </ul>
        </div>
    </div>
  </div>
</template>

<style src="@/css/index.css"></style>
<style src="@/css/code-highlight.css"></style>
