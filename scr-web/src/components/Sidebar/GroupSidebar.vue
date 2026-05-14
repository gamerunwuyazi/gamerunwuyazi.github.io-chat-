<script setup>
/* eslint-disable vue/multi-word-component-names */
import { ref, computed, onUnmounted } from 'vue';

import { useBaseStore } from '@/stores/baseStore';
import { useGroupStore } from '@/stores/groupStore';
import { useUnreadStore } from '@/stores/unreadStore';
import { useDraftStore } from '@/stores/draftStore';
import { useModalStore } from '@/stores/modalStore';
import { useStorageStore } from '@/stores/storageStore';
import { openGroupCardPopup } from '@/stores/index.js';
import { switchToGroupChat } from '@/utils/chat/group';

const baseStore = useBaseStore();
const groupStore = useGroupStore();
const unreadStore = useUnreadStore();
const draftStore = useDraftStore();
const modalStore = useModalStore();
const storageStore = useStorageStore();

onUnmounted(() => {
  // 清理所有事件监听器
  document.removeEventListener('click', hideContextMenu);
  document.removeEventListener('contextmenu', hideContextMenu);
  window.removeEventListener('scroll', hideContextMenu, true);
});

// 右键菜单相关
const showContextMenu = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const currentContextMenuGroup = ref(null);

// 群组搜索状态
const groupSearchKeyword = ref('');



// 工具函数：获取群组头像 URL（带版本号参数）
function getGroupAvatarUrl(group) {
  let avatarUrl = '';
  if (group.avatarUrl && typeof group.avatarUrl === 'string') {
    avatarUrl = group.avatarUrl.trim();
  } else if (group.avatar_url && typeof group.avatar_url === 'string') {
    avatarUrl = group.avatar_url.trim();
  } else if (group.avatar && typeof group.avatar === 'string') {
    avatarUrl = group.avatar.trim();
  }
  
  // 如果有版本号，添加?v=参数
  if (avatarUrl && group.avatarVersion) {
    return `${avatarUrl}?v=${group.avatarVersion}`;
  }
  
  return avatarUrl;
}

// 工具函数：检查是否为 SVG 格式
function isSvgAvatar(url) {
  return url && /\.svg$/i.test(url);
}

function unescapeHtml(html) {
  const text = document.createElement('textarea');
  text.innerHTML = html;
  return text.value;
}

function getGroupLastMessage(group) {
  if (draftStore.drafts && draftStore.drafts.groups && draftStore.drafts.groups[group.id]) {
    const draftContent = draftStore.drafts.groups[group.id];
    if (draftContent) {
      return `[草稿] ${draftContent}`;
    }
  }
  
  const lastMessage = group.lastMessage || storageStore.getGroupLastMessage(group.id);
  if (!lastMessage) return '';
  
  let content = storageStore.formatMessageContent(lastMessage);
  const senderName = lastMessage.nickname || '群成员';
  
  return `${senderName}: ${content}`;
}

function hasDraft(group) {
  return draftStore.drafts && draftStore.drafts.groups && draftStore.drafts.groups[group.id];
}

// 获取免打扰群组列表
function getMutedGroups() {
  try {
    return JSON.parse(localStorage.getItem('mutedGroups') || '[]');
  } catch {
    return [];
  }
}

// 检查群组是否被免打扰
function isGroupMuted(groupId) {
  const mutedGroups = getMutedGroups();
  return mutedGroups.includes(String(groupId));
}

function toggleGroupMute(groupId) {
  const mutedGroups = getMutedGroups();
  const index = mutedGroups.indexOf(String(groupId));
  
  if (index === -1) {
    mutedGroups.push(String(groupId));
    unreadStore.clearGroupUnread(groupId);
  } else {
    mutedGroups.splice(index, 1);
  }
  
  localStorage.setItem('mutedGroups', JSON.stringify(mutedGroups));
  
  hideContextMenu();
}

async function deleteDeletedGroup(groupId) {
  hideContextMenu();
  
  try {
    await storageStore.deleteSingleDeletedSession('group', groupId);
  } catch (error) {
    console.error('删除已删除群组会话失败:', error);
  }
}

const filteredGroupsList = computed(() => {
  if (!groupStore.groupsList) return [];
  const allGroups = [...groupStore.groupsList];
  if (!groupSearchKeyword.value) {
    return allGroups;
  }
  const keyword = groupSearchKeyword.value.toLowerCase();
  return allGroups.filter(group => {
    const groupName = group.name || '';
    return groupName.toLowerCase().includes(keyword);
  });
});

// 清除搜索
function clearGroupSearch() {
  groupSearchKeyword.value = '';
}

// 处理群组点击
function handleGroupClick(group) {
  hideContextMenu();
  const originalGroupName = group.name || '';
  switchToGroupChat(group.id, originalGroupName, group.avatar_url || group.avatarUrl || '');
}

// 处理群组右键点击
function handleGroupRightClick(event, group) {
  event.preventDefault();
  event.stopPropagation();
  
  // 先隐藏现有菜单
  hideContextMenu();
  
  currentContextMenuGroup.value = group;
  contextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY
  };
  showContextMenu.value = true;
  
  // 延迟添加事件监听器，避免立即触发
  setTimeout(() => {
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('contextmenu', hideContextMenu);
    window.addEventListener('scroll', hideContextMenu, true);
  }, 0);
}

// 隐藏右键菜单
function hideContextMenu() {
  showContextMenu.value = false;
  currentContextMenuGroup.value = null;
  
  // 移除事件监听器
  document.removeEventListener('click', hideContextMenu);
  document.removeEventListener('contextmenu', hideContextMenu);
  window.removeEventListener('scroll', hideContextMenu, true);
}

function handleGroupAvatarClick(event, group) {
  event.stopPropagation();
  
  const avatarUrl = getGroupAvatarUrl(group);
  if (avatarUrl && !isSvgAvatar(avatarUrl)) {
    const fullAvatarUrl = `${baseStore.SERVER_URL}${avatarUrl}`;
    modalStore.openModal('avatarPreview', fullAvatarUrl);
  }
}

function handleCreateGroupClick() {
  modalStore.openModal('createGroup');
}

// 处理头像加载失败
function handleGroupAvatarError(event, group) {
  // 将头像 URL 设为空字符串，显示默认头像
  group.avatarUrl = '';
  group.avatar_url = '';
  group.avatar = '';
}
</script>

<template>
  <div id="secondary-sidebar">
    <div class="secondary-content" data-content="group-chat">
        <div class="sidebar-section">
            <div class="section-header">
                <div class="search-container">
                    <input type="text" id="groupSearchInput" placeholder="搜索群组..." class="search-input" v-model="groupSearchKeyword">
                    <button id="clearGroupSearch" class="clear-search-btn" v-if="groupSearchKeyword" @click="clearGroupSearch">×</button>
                    <button id="createGroupButton" class="create-group-btn" title="创建群组" @click="handleCreateGroupClick">+</button>
                </div>
            </div>
            <ul class="user-list" id="groupList">
                <li v-if="groupStore.groupsList === null" class="loading-item">
                    <span class="loading-text">正在加载群组列表...</span>
                </li>
                <li v-else-if="groupStore.groupsList.length === 0" class="empty-item">
                    <span class="empty-text">暂无群组</span>
                </li>
                <li v-else v-for="group in filteredGroupsList" :key="group.id" 
                    :data-group-id="group.id" 
                    :data-group-name="group.name"
                    :class="{ 'deleted-item': group.deleted_at }"
                    @click="handleGroupClick(group)"
                    @contextmenu.prevent="handleGroupRightClick($event, group)">
                    <span v-if="getGroupAvatarUrl(group) && !isSvgAvatar(getGroupAvatarUrl(group))" class="group-avatar" @click="handleGroupAvatarClick($event, group)">
                        <img :src="`${baseStore.SERVER_URL}${getGroupAvatarUrl(group)}`" :alt="group.name" @error="handleGroupAvatarError($event, group)">
                        <span v-if="group.deleted_at" class="deleted-icon">🗑️</span>
                    </span>
                    <span v-else class="group-avatar" @click="handleGroupAvatarClick($event, group)">
                        {{ group.name.charAt(0).toUpperCase() }}
                        <span v-if="group.deleted_at" class="deleted-icon">🗑️</span>
                    </span>
                    <div class="group-info">
                        <span class="group-name" :style="{ color: group.deleted_at ? '#000' : '' }">{{ group.name }} <span v-if="group.deleted_at" style="font-size: 12px;">(已删除)</span></span>
                        <span v-if="groupStore.hasGroupAtMe && groupStore.hasGroupAtMe(group.id) && !group.deleted_at" class="group-last-message at-me-text">[有人@我]</span>
                        <span v-else-if="hasDraft(group) && !group.deleted_at" class="group-last-message draft-text">{{ getGroupLastMessage(group) }}</span>
                        <span v-else-if="group.deleted_at" class="group-last-message" style="color: #000;">该会话已被删除</span>
                        <span v-else class="group-last-message">{{ getGroupLastMessage(group) }}</span>
                    </div>
                    <span v-if="isGroupMuted(group.id) && !group.deleted_at" class="mute-icon" style="margin-left: 5px; font-size: 12px;" title="已免打扰">🔕</span>
                    <div class="unread-count group-unread-count" v-if="unreadStore.unreadMessages.groups && unreadStore.unreadMessages.groups[group.id] && !isGroupMuted(group.id)">
                        {{ unreadStore.unreadMessages.groups[group.id] }}
                    </div>
                </li>
            </ul>
        </div>
    </div>

    <!-- 右键菜单 -->
    <div v-if="showContextMenu" class="context-menu" 
         :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
         @click.stop>
        <div v-if="currentContextMenuGroup.deleted_at" class="context-menu-item delete-action" @click="deleteDeletedGroup(currentContextMenuGroup.id)" style="color: #e74c3c;">
            删除会话记录
        </div>
        <div v-else class="context-menu-item" @click="toggleGroupMute(currentContextMenuGroup.id)" style="color: black;">
            {{ isGroupMuted(currentContextMenuGroup.id) ? '取消免打扰' : '免打扰' }}
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

.deleted-item {
    opacity: 0.7;
    background-color: #f5f5f5 !important;
    border-left: 3px solid #e74c3c;
}

.deleted-item:hover {
    background-color: #ececec !important;
}

.deleted-item .group-avatar {
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

.group-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.group-name {
    font-weight: 500;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.group-last-message {
    font-size: 12px;
    color: #999;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
}

.at-me-text {
    color: #ff4757 !important;
    font-weight: 500;
}

.draft-text {
    color: #ff0000 !important;
    font-weight: 500;
}
</style>
