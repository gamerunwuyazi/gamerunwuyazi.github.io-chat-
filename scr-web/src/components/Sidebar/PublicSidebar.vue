<script setup>
import { useBaseStore } from '@/stores/baseStore';
import { useUserStore } from '@/stores/userStore';
import { openUserAvatarPopup } from '@/stores/index.js';

const baseStore = useBaseStore();
const userStore = useUserStore();

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

function isSvgAvatar(url) {
  return url && /\.svg$/i.test(url);
}

function getUserDisplayName(user) {
  const isCurrentUser = baseStore.currentUser && String(baseStore.currentUser.id) === String(user.id);
  const nickname = user.nickname;
  if (isCurrentUser) {
    return `${nickname} (我)`;
  }
  return nickname;
}

function handleUserAvatarClick(event, user) {
  event.stopPropagation();
  openUserAvatarPopup(event, user);
}

function handleAvatarError(event, user) {
  user.avatarUrl = '';
  user.avatar_url = '';
  user.avatar = '';
}
</script>

<template>
  <div id="secondary-sidebar">
    <div class="secondary-content" data-content="public-chat">
        <div class="sidebar-section">
            <h3>在线用户 <span id="onlineCount">({{ userStore.onlineUsers.length }})</span></h3>
            <ul class="user-list" id="userList">
                <li v-if="userStore.onlineUsers.length === 0">暂无在线用户</li>
                <li v-else v-for="user in userStore.onlineUsers" :key="user.id" class="user-item" 
                    :style="{ padding: '8px 0px', display: 'flex', alignItems: 'center', fontWeight: 'normal' }">
                    <span v-if="getAvatarUrl(user) && !isSvgAvatar(getAvatarUrl(user))" class="user-avatar" @click="handleUserAvatarClick($event, user)">
                        <img :src="`${baseStore.SERVER_URL}${getAvatarUrl(user)}`" :alt="user.nickname" @error="handleAvatarError($event, user)">
                    </span>
                    <span v-else class="user-avatar" @click="handleUserAvatarClick($event, user)">
                        {{ user.nickname ? user.nickname.charAt(0).toUpperCase() : 'U' }}
                    </span>
                    <span class="user-name" :class="{ 'current-user': baseStore.currentUser && String(baseStore.currentUser.id) === String(user.id) }">{{ getUserDisplayName(user) }}</span>
                    <span class="user-status online"></span>
                </li>
            </ul>
        </div>
        
        <div class="sidebar-section">
            <div class="section-header">
                <h3>离线用户</h3>
            </div>
            <ul class="user-list" id="offlineUserList">
                <li v-if="userStore.offlineUsers.length === 0">暂无离线用户</li>
                <li v-else v-for="user in userStore.offlineUsers" :key="user.id" class="user-item"
                    :style="{ padding: '8px 0px', display: 'flex', alignItems: 'center', fontWeight: 'normal' }">
                    <span v-if="getAvatarUrl(user) && !isSvgAvatar(getAvatarUrl(user))" class="user-avatar" @click="handleUserAvatarClick($event, user)">
                        <img :src="`${baseStore.SERVER_URL}${getAvatarUrl(user)}`" :alt="user.nickname" @error="handleAvatarError($event, user)">
                    </span>
                    <span v-else class="user-avatar" @click="handleUserAvatarClick($event, user)">
                        {{ user.nickname ? user.nickname.charAt(0).toUpperCase() : 'U' }}
                    </span>
                    <span class="user-name">{{ user.nickname }}</span>
                </li>
            </ul>
        </div>
    </div>
  </div>
</template>

<style scoped>
.current-user {
  font-weight: bold;
}
</style>
