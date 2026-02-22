<script setup>
/* eslint-disable vue/multi-word-component-names */
import { ref, computed, onMounted } from 'vue';
import { useChatStore } from '@/stores/chatStore';

const chatStore = useChatStore();

onMounted(() => {
  window.chatStore = chatStore;
  
  // 加载好友列表
  if (window.loadFriendsList) {
    window.loadFriendsList();
  }
});

// 私信搜索状态
const privateChatSearchKeyword = ref('');

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

// 工具函数：检查用户是否在线
function isUserOnline(userId) {
  return chatStore.onlineUsers.some(user => String(user.id) === String(userId));
}

// 计算属性：过滤后的好友列表
const filteredFriendsList = computed(() => {
  if (!privateChatSearchKeyword.value) {
    return chatStore.friendsList;
  }
  const keyword = privateChatSearchKeyword.value.toLowerCase();
  return chatStore.friendsList.filter(friend => {
    return (unescapeHtml(friend.nickname) || '').toLowerCase().includes(keyword);
  });
});

// 清除搜索
function clearPrivateChatSearch() {
  privateChatSearchKeyword.value = '';
}

// 处理好友点击
function handleFriendClick(friend) {
  if (window.switchToPrivateChat) {
    const avatarUrl = friend.avatarUrl || friend.avatar_url || friend.avatar || '';
    window.switchToPrivateChat(friend.id, unescapeHtml(friend.nickname), friend.username, avatarUrl);
  }
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

// 处理搜索用户按钮点击
function handleSearchUserClick() {
  if (typeof window.openModal === 'function') {
    window.openModal('userSearch');
  }
}
</script>

<template>
  <div id="secondary-sidebar">
    <div class="secondary-content" data-content="private-chat">
        <div class="sidebar-section">
            <div class="section-header">
                <div class="search-container">
                    <input type="text" id="privateChatSearchInput" placeholder="搜索好友..." class="search-input" v-model="privateChatSearchKeyword">
                    <button id="clearPrivateChatSearch" class="clear-search-btn" v-if="privateChatSearchKeyword" @click="clearPrivateChatSearch">×</button>
                    <button id="searchUserButton" class="create-group-btn" style="background-color: #3498db;" title="搜索用户" @click="handleSearchUserClick">+</button>
                </div>
            </div>
            <ul class="user-list" id="friendsList">
                <li v-if="chatStore.friendsList.length === 0" class="empty-friends">暂无好友，请先添加好友</li>
                <li v-else v-for="friend in filteredFriendsList" :key="friend.id" 
                    class="friend-item"
                    :data-user-id="friend.id"
                    :data-user-nickname="unescapeHtml(friend.nickname)"
                    @click="handleFriendClick(friend)">
                    <span v-if="getAvatarUrl(friend) && !isSvgAvatar(getAvatarUrl(friend))" class="user-avatar" @click.stop="handleUserAvatarClick($event, friend)">
                        <img :src="`${chatStore.SERVER_URL}${getAvatarUrl(friend)}`" :alt="unescapeHtml(friend.nickname)">
                    </span>
                    <span v-else class="user-avatar" @click.stop="handleUserAvatarClick($event, friend)">
                        {{ unescapeHtml(friend.nickname) ? unescapeHtml(friend.nickname).charAt(0).toUpperCase() : 'U' }}
                    </span>
                    <span class="friend-name" v-html="unescapeHtml(friend.nickname)"></span>
                    <span class="friend-status" :class="isUserOnline(friend.id) ? 'online' : 'offline'"></span>
                    <div class="unread-count private-unread-count" v-if="chatStore.unreadMessages.private && chatStore.unreadMessages.private[friend.id]">
                        {{ chatStore.unreadMessages.private[friend.id] }}
                    </div>
                </li>
            </ul>
        </div>
    </div>
  </div>
</template>

<style src="@/css/index.css"></style>
<style src="@/css/code-highlight.css"></style>
