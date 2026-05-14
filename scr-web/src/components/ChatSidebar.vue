<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';

import { useBaseStore } from '@/stores/baseStore';
import { useUnreadStore } from '@/stores/unreadStore';
import { logout } from '@/utils/chat/ui';
import modal from '@/utils/modal';

const baseStore = useBaseStore();
const unreadStore = useUnreadStore();
const SERVER_URL = baseStore.SERVER_URL || import.meta.env.VITE_SERVER_URL || '';

const router = useRouter();
const route = useRoute();

const avatarVersion = ref(Date.now())
const avatarLoadFailed = ref(false);

function handleUserAvatarUpdate() {
  avatarVersion.value = Date.now()
  avatarLoadFailed.value = false;
}

onMounted(() => {
  window.addEventListener('user-avatar-updated', handleUserAvatarUpdate)
});

onUnmounted(() => {
  window.removeEventListener('user-avatar-updated', handleUserAvatarUpdate)
});

const activeMenuItem = computed(() => {
  const path = route.path;
  if (path === '/chat' || path === '/') {
    return 'public-chat';
  } else if (path.startsWith('/chat/group')) {
    return 'group-chat';
  } else if (path.startsWith('/chat/private')) {
    return 'private-chat';
  } else if (path.startsWith('/chat/settings')) {
    return 'user-settings';
  } else {
    return 'public-chat';
  }
});

const publicUnreadCount = computed(() => {
  return unreadStore.unreadMessages?.global || 0;
});

const groupUnreadCount = computed(() => {
  if (!unreadStore.unreadMessages?.groups) return 0;
  
  let mutedGroups = [];
  try {
    mutedGroups = JSON.parse(localStorage.getItem('mutedGroups') || '[]');
  } catch {
    mutedGroups = [];
  }
  
  let total = 0;
  for (const groupId in unreadStore.unreadMessages.groups) {
    if (!mutedGroups.includes(groupId)) {
      total += unreadStore.unreadMessages.groups[groupId] || 0;
    }
  }
  return total;
});

const privateUnreadCount = computed(() => {
  if (!unreadStore.unreadMessages?.private) return 0;
  
  let mutedPrivateChats = [];
  try {
    mutedPrivateChats = JSON.parse(localStorage.getItem('mutedPrivateChats') || '[]');
  } catch {
    mutedPrivateChats = [];
  }
  
  let total = 0;
  for (const userId in unreadStore.unreadMessages.private) {
    if (!mutedPrivateChats.includes(userId)) {
      total += unreadStore.unreadMessages.private[userId] || 0;
    }
  }
  return total;
});

const friendRequestUnreadCount = computed(() => {
  return Array.isArray(baseStore.receivedFriendRequests) ? baseStore.receivedFriendRequests.length : 0;
});

const currentUser = computed(() => {
  avatarVersion.value;
  
  if (baseStore.currentUser && baseStore.currentUser.nickname) {
    return {
      id: baseStore.currentUser.id,
      nickname: baseStore.currentUser.nickname,
      gender: baseStore.currentUser.gender,
      avatarUrl: baseStore.currentUser.avatar_url
    };
  }
  
  return null;
});

const userAvatarUrl = computed(() => {
  if (avatarLoadFailed.value) return '';
  
  const user = currentUser.value;
  if (!user) return '';
  
  let url = user.avatar || user.avatarUrl || '';
  if (url && !/\.svg$/i.test(url)) {
    const baseUrl = url.startsWith('http') ? '' : SERVER_URL;
    return `${baseUrl}${url}?v=${avatarVersion.value}`;
  }
  return '';
});

const userInitials = computed(() => {
  const user = currentUser.value;
  const nickname = user?.nickname || '';
  return nickname ? nickname.charAt(0).toUpperCase() : 'U';
});

const showAvatarImage = computed(() => {
  return userAvatarUrl.value !== '' && !avatarLoadFailed.value;
});

function handleAvatarError() {
  avatarLoadFailed.value = true;
}

async function handleMenuClick(section) {
  if (section === 'logout') {
    const confirmed = await modal.confirm('确定要退出登录吗？', '退出登录');
    if (confirmed) {
      logout();
    }
    return;
  }

  let path = '';
  if (section === 'public-chat') {
    path = '/chat';
  } else if (section === 'group-chat') {
    path = '/chat/group';
  } else if (section === 'private-chat') {
    path = '/chat/private';
  } else if (section === 'user-settings') {
    path = '/chat/settings';
  }
  
  if (path) {
    router.push(path);
  }
}
</script>

<template>
  <div id="sidebar">
    <div class="sidebar-header">
        <div id="userProfile" class="user-profile">
            <div id="userAvatar" class="user-avatar">
                <template v-if="currentUser">
                    <img v-if="showAvatarImage" :src="userAvatarUrl" alt="用户头像" class="user-avatar-img" loading="lazy" width="60" height="60" style="aspect-ratio: 1/1; object-fit: cover;" @error="handleAvatarError">
                    <span v-else id="userInitials" class="user-initials">{{ userInitials }}</span>
                </template>

            </div>
        </div>
    </div>
    
    <div class="menu-section">
        <ul class="menu-list">
            <li :class="['menu-item', { active: activeMenuItem === 'public-chat' }]" data-section="public-chat" @click="handleMenuClick('public-chat')">
                <div class="chat-avatar"><img src="/icon/Message-256.ico" alt="公共聊天" style="width: 24px; height: 24px;"></div>
                <div v-if="publicUnreadCount > 0" class="unread-count">{{ publicUnreadCount }}</div>
            </li>
        </ul>
    </div>
    
    <div class="menu-section">
        <ul class="menu-list">
            <li :class="['menu-item', { active: activeMenuItem === 'group-chat' }]" data-section="group-chat" @click="handleMenuClick('group-chat')">
                <div class="chat-avatar"><img src="/icon/User-Group-256.ico" alt="群组聊天" style="width: 24px; height: 24px;"></div>
                <div v-if="groupUnreadCount > 0" class="unread-count">{{ groupUnreadCount }}</div>
            </li>
        </ul>
    </div>

    <div class="menu-section">
        <ul class="menu-list">
            <li :class="['menu-item', { active: activeMenuItem === 'private-chat' }]" data-section="private-chat" @click="handleMenuClick('private-chat')">
                <div class="chat-avatar"><img src="/icon/User-Profile-256.ico" alt="私信聊天" style="width: 24px; height: 24px;"></div>
                <div v-if="privateUnreadCount > 0" class="unread-count">{{ privateUnreadCount }}</div>
            </li>
        </ul>
    </div>

    <div class="menu-section">
        <ul class="menu-list">
            <li :class="['menu-item', { active: activeMenuItem === 'user-settings' }]" data-section="user-settings" @click="handleMenuClick('user-settings')">
                <div class="chat-avatar">
                    <img src="/icon/Settings-01-256.ico" alt="用户设置" style="width: 24px; height: 24px;">
                    <span v-if="friendRequestUnreadCount > 0" class="unread-count">{{ friendRequestUnreadCount > 99 ? '99+' : friendRequestUnreadCount }}</span>
                </div>
            </li>
        </ul>
    </div>
    
    <div class="menu-section" style="margin-top: auto; margin-bottom: 20px;">
        <ul class="menu-list">
            <li class="menu-item" data-section="logout" @click="handleMenuClick('logout')">
                <div class="chat-avatar">
                    <i class="fas fa-power-off"></i>
                </div>
            </li>
        </ul>
    </div>
</div>
</template>

<style scoped>
.chat-avatar {
  position: relative;
}

.chat-avatar .unread-count {
  position: absolute;
  top: -5px;
  right: -5px;
  font-size: 10px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
}
</style>
