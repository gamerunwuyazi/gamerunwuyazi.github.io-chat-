<script setup>
/* eslint-disable vue/multi-word-component-names */
import { ref, computed, onMounted } from 'vue';
import { useChatStore } from '@/stores/chatStore';

const chatStore = useChatStore();

onMounted(() => {
  window.chatStore = chatStore;
});

// 私信搜索状态
const privateChatSearchKeyword = ref('');



// 工具函数：获取用户头像 URL（带版本号参数）
function getAvatarUrl(user) {
  let avatarUrl = '';
  if (user.avatarUrl && typeof user.avatarUrl === 'string') {
    avatarUrl = user.avatarUrl.trim();
  } else if (user.avatar_url && typeof user.avatar_url === 'string') {
    avatarUrl = user.avatar_url.trim();
  } else if (user.avatar && typeof user.avatar === 'string') {
    avatarUrl = user.avatar.trim();
  }
  
  // 如果有版本号，添加?v=参数
  if (avatarUrl && user.avatarVersion) {
    return `${avatarUrl}?v=${user.avatarVersion}`;
  }
  
  return avatarUrl;
}

// 工具函数：检查是否为SVG格式
function isSvgAvatar(url) {
  return url && /\.svg$/i.test(url);
}

// 获取私信最后消息
function getPrivateLastMessage(friend) {
  // 优先检查是否有草稿
  if (chatStore.drafts && chatStore.drafts.private && chatStore.drafts.private[friend.id]) {
    const draftContent = chatStore.drafts.private[friend.id];
    if (draftContent) {
      return `[草稿] ${draftContent}`;
    }
  }
  
  const lastMessage = friend.lastMessage || chatStore.getPrivateLastMessage(friend.id);
  if (!lastMessage) return '';
  
  return chatStore.formatMessageContent(lastMessage);
}

// 检查是否有草稿
function hasDraft(friend) {
  return chatStore.drafts && chatStore.drafts.private && chatStore.drafts.private[friend.id];
}

// 工具函数：检查用户是否在线
function isUserOnline(userId) {
  return chatStore.onlineUsers.some(user => String(user.id) === String(userId));
}

// 计算属性：过滤后的好友列表（包括已删除的好友）
const filteredFriendsList = computed(() => {
  const allFriends = [...chatStore.friendsList];
  if (!privateChatSearchKeyword.value) {
    return allFriends;
  }
  const keyword = privateChatSearchKeyword.value.toLowerCase();
  return allFriends.filter(friend => {
    return (friend.nickname || '').toLowerCase().includes(keyword);
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
    window.switchToPrivateChat(friend.id, friend.nickname, friend.username, avatarUrl);
  }
}

// 处理用户头像点击
function handleUserAvatarClick(event, user) {
  event.stopPropagation();
  const avatarUrl = getAvatarUrl(user);
  if (avatarUrl) {
    const fullAvatarUrl = avatarUrl.startsWith('http') ? avatarUrl : `${chatStore.SERVER_URL}${avatarUrl}`;
    chatStore.openModal('avatarPreview', fullAvatarUrl);
  } else {
    if (window.showUserAvatarPopupVue) {
      window.showUserAvatarPopupVue(event, user);
    } else {
      const userData = {
        id: user.id,
        nickname: user.nickname,
        username: user.username,
        avatarUrl: getAvatarUrl(user)
      };
      chatStore.openModal('userAvatarPopup', userData);
    }
  }
}

// 处理头像加载失败
function handleAvatarError(event, friend) {
  // 将头像 URL 设为空字符串，显示默认头像
  friend.avatarUrl = '';
  friend.avatar_url = '';
  friend.avatar = '';
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
                    :data-user-nickname="friend.nickname"
                    :class="{ 'deleted-item': friend.deleted_at }"
                    @click="handleFriendClick(friend)">
                    <span class="user-avatar-wrapper" @click.stop="handleUserAvatarClick($event, friend)">
                        <span v-if="getAvatarUrl(friend) && !isSvgAvatar(getAvatarUrl(friend))" class="user-avatar">
                            <img :src="`${chatStore.SERVER_URL}${getAvatarUrl(friend)}`" :alt="friend.nickname" @error="handleAvatarError($event, friend)">
                            <span v-if="friend.deleted_at" class="deleted-icon">🗑️</span>
                        </span>
                        <span v-else class="user-avatar">
                            {{ friend.nickname ? friend.nickname.charAt(0).toUpperCase() : 'U' }}
                            <span v-if="friend.deleted_at" class="deleted-icon">🗑️</span>
                        </span>
                        <span v-if="isUserOnline(friend.id) && !friend.deleted_at" class="online-indicator"></span>
                    </span>
                    <div class="friend-info">
                        <span class="friend-name" :style="{ color: friend.deleted_at ? '#000' : '' }">{{ friend.nickname }} <span v-if="friend.deleted_at" style="font-size: 12px;">(已删除)</span></span>
                        <span v-if="hasDraft(friend) && !friend.deleted_at" class="friend-last-message draft-text">{{ getPrivateLastMessage(friend) }}</span>
                        <span v-else-if="friend.deleted_at" class="friend-last-message" style="color: #000;">该会话已被删除</span>
                        <span v-else class="friend-last-message">{{ getPrivateLastMessage(friend) }}</span>
                    </div>
                    <span v-if="!friend.deleted_at" class="friend-status" :class="isUserOnline(friend.id) ? 'online' : 'offline'"></span>
                    <div class="unread-count private-unread-count" v-if="chatStore.unreadMessages.private && chatStore.unreadMessages.private[friend.id]">
                        {{ chatStore.unreadMessages.private[friend.id] }}
                    </div>
                </li>
            </ul>
        </div>
    </div>
  </div>
</template>

<style scoped>
.user-avatar-wrapper {
  position: relative;
  display: inline-flex;
}

.deleted-item {
  opacity: 0.7;
  background-color: #f5f5f5 !important;
  border-left: 3px solid #e74c3c;
}

.deleted-item:hover {
  background-color: #ececec !important;
}

.deleted-item .user-avatar {
  filter: grayscale(100%);
  position: relative;
}

.deleted-icon {
  position: absolute;
  bottom: -2px;
  right: -2px;
  background: #fff;
  border-radius: 50%;
  font-size: 12px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.online-indicator {
  position: absolute;
  right: -2px;
  bottom: 0;
  width: 8px;
  height: 8px;
  background: limegreen;
  border-radius: 50%;
  border: 2px solid white;
  z-index: 1;
}

.friend-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.friend-name {
  font-weight: 500;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.friend-last-message {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.draft-text {
  color: #ff0000 !important;
  font-weight: 500;
}
</style>
