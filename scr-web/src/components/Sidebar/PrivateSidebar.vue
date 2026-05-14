<script setup>
/* eslint-disable vue/multi-word-component-names */
import { ref, computed, onUnmounted } from 'vue';

import { useBaseStore } from '@/stores/baseStore';
import { useUserStore } from '@/stores/userStore';
import { useFriendStore } from '@/stores/friendStore';
import { useUnreadStore } from '@/stores/unreadStore';
import { useDraftStore } from '@/stores/draftStore';
import { useModalStore } from '@/stores/modalStore';
import { useStorageStore } from '@/stores/storageStore';
import { switchToPrivateChat } from '@/utils/chat/private';

const baseStore = useBaseStore();
const userStore = useUserStore();
const friendStore = useFriendStore();
const unreadStore = useUnreadStore();
const draftStore = useDraftStore();
const modalStore = useModalStore();
const storageStore = useStorageStore();

onUnmounted(() => {
  document.removeEventListener('click', hideContextMenu);
  document.removeEventListener('contextmenu', hideContextMenu);
  window.removeEventListener('scroll', hideContextMenu, true);
});

// 私信搜索状态
const privateChatSearchKeyword = ref('');

// 右键菜单相关
const showContextMenu = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const currentContextMenuFriend = ref(null);

// 获取免打扰私信列表
function getMutedPrivateChats() {
  try {
    return JSON.parse(localStorage.getItem('mutedPrivateChats') || '[]');
  } catch {
    return [];
  }
}

// 检查私信是否被免打扰
function isPrivateMuted(userId) {
  const mutedPrivateChats = getMutedPrivateChats();
  return mutedPrivateChats.includes(String(userId));
}

function togglePrivateMute(userId) {
  const mutedPrivateChats = getMutedPrivateChats();
  const index = mutedPrivateChats.indexOf(String(userId));
  
  if (index === -1) {
    mutedPrivateChats.push(String(userId));
    unreadStore.clearPrivateUnread(userId);
  } else {
    mutedPrivateChats.splice(index, 1);
  }
  
  localStorage.setItem('mutedPrivateChats', JSON.stringify(mutedPrivateChats));
  
  hideContextMenu();
}

async function deleteDeletedFriend(friendId) {
  hideContextMenu();
  
  try {
    await storageStore.deleteSingleDeletedSession('private', friendId);
  } catch (error) {
    console.error('删除已删除好友会话失败:', error);
  }
}



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

function getPrivateLastMessage(friend) {
  if (draftStore.drafts && draftStore.drafts.private && draftStore.drafts.private[friend.id]) {
    const draftContent = draftStore.drafts.private[friend.id];
    if (draftContent) {
      return `[草稿] ${draftContent}`;
    }
  }
  
  const lastMessage = friend.lastMessage || storageStore.getPrivateLastMessage(friend.id);
  if (!lastMessage) return '';
  
  return storageStore.formatMessageContent(lastMessage);
}

function hasDraft(friend) {
  return draftStore.drafts && draftStore.drafts.private && draftStore.drafts.private[friend.id];
}

function isUserOnline(userId) {
  return userStore.onlineUsers.some(user => String(user.id) === String(userId));
}

const filteredFriendsList = computed(() => {
  const allFriends = [...friendStore.friendsList];
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
  hideContextMenu();
  const avatarUrl = friend.avatarUrl || friend.avatar_url || friend.avatar || '';
  switchToPrivateChat(friend.id, friend.nickname, friend.username, avatarUrl);
}

// 处理好友右键点击
function handleFriendRightClick(event, friend) {
  event.preventDefault();
  event.stopPropagation();
  
  hideContextMenu();
  
  currentContextMenuFriend.value = friend;
  contextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY
  };
  showContextMenu.value = true;
  
  setTimeout(() => {
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('contextmenu', hideContextMenu);
    window.addEventListener('scroll', hideContextMenu, true);
  }, 0);
}

// 隐藏右键菜单
function hideContextMenu() {
  showContextMenu.value = false;
  currentContextMenuFriend.value = null;
  
  document.removeEventListener('click', hideContextMenu);
  document.removeEventListener('contextmenu', hideContextMenu);
  window.removeEventListener('scroll', hideContextMenu, true);
}

function handleUserAvatarClick(event, user) {
  event.stopPropagation();
  const avatarUrl = getAvatarUrl(user);
  if (avatarUrl && !isSvgAvatar(avatarUrl)) {
    const fullAvatarUrl = avatarUrl.startsWith('http') ? avatarUrl : `${baseStore.SERVER_URL}${avatarUrl}`;
    modalStore.openModal('avatarPreview', fullAvatarUrl);
  }
}

function handleAvatarError(event, friend) {
  friend.avatarUrl = '';
  friend.avatar_url = '';
  friend.avatar = '';
}

function handleSearchUserClick() {
  modalStore.openModal('userSearch');
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
                <li v-if="friendStore.friendsList.length === 0" class="empty-friends">暂无好友，请先添加好友</li>
                <li v-else v-for="friend in filteredFriendsList" :key="friend.id" 
                    class="friend-item"
                    :data-user-id="friend.id"
                    :data-user-nickname="friend.nickname"
                    :class="{ 'deleted-item': friend.deleted_at }"
                    @click="handleFriendClick(friend)"
                    @contextmenu.prevent="handleFriendRightClick($event, friend)">
                    <span class="user-avatar-wrapper" @click.stop="handleUserAvatarClick($event, friend)">
                        <span v-if="getAvatarUrl(friend) && !isSvgAvatar(getAvatarUrl(friend))" class="user-avatar">
                            <img :src="`${baseStore.SERVER_URL}${getAvatarUrl(friend)}`" :alt="friend.nickname" @error="handleAvatarError($event, friend)">
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
                    <span v-if="isPrivateMuted(friend.id) && !friend.deleted_at" class="mute-icon" style="margin-left: 5px; font-size: 12px;" title="已免打扰">🔕</span>
                    <span v-else-if="!friend.deleted_at" class="friend-status" :class="isUserOnline(friend.id) ? 'online' : 'offline'"></span>
                    <div class="unread-count private-unread-count" v-if="unreadStore.unreadMessages.private && unreadStore.unreadMessages.private[friend.id] && !isPrivateMuted(friend.id)">
                        {{ unreadStore.unreadMessages.private[friend.id] }}
                    </div>
                </li>
            </ul>
        </div>
    </div>

    <!-- 右键菜单 -->
    <div v-if="showContextMenu" class="context-menu" 
         :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
         @click.stop>
        <div v-if="currentContextMenuFriend.deleted_at" class="context-menu-item delete-action" @click="deleteDeletedFriend(currentContextMenuFriend.id)" style="color: #e74c3c;">
            删除会话记录
        </div>
        <div v-else class="context-menu-item" @click="togglePrivateMute(currentContextMenuFriend.id)" style="color: black;">
            {{ isPrivateMuted(currentContextMenuFriend.id) ? '取消免打扰' : '免打扰' }}
        </div>
    </div>
  </div>
</template>

<style scoped>
.context-menu {
    position: fixed;
    z-index: 10000;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    padding: 5px 0;
}

.context-menu-item {
    padding: 8px 15px;
    cursor: pointer;
    font-size: 14px;
    white-space: nowrap;
    transition: background-color 0.2s;
}

.context-menu-item:hover {
    background-color: #f5f5f5;
}

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
