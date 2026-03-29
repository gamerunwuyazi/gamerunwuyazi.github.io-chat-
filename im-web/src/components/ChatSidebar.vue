<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useChatStore } from '@/stores/chatStore';
import { logout } from '@/utils/chat/ui';
import modal from '@/utils/modal';

const chatStore = useChatStore();
const SERVER_URL = chatStore.SERVER_URL || import.meta.env.VITE_SERVER_URL || '';

const router = useRouter();
const route = useRoute();

const avatarVersion = ref(Date.now())
const avatarLoadFailed = ref(false);

function handleUserAvatarUpdate() {
  avatarVersion.value = Date.now()
  avatarLoadFailed.value = false;
}

onMounted(() => {
  window.chatStore = chatStore;
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
  return chatStore.unreadMessages?.global || 0;
});

const groupUnreadCount = computed(() => {
  if (!chatStore.unreadMessages?.groups) return 0;
  let total = 0;
  Object.values(chatStore.unreadMessages.groups).forEach(count => {
    total += count || 0;
  });
  return total;
});

const privateUnreadCount = computed(() => {
  if (!chatStore.unreadMessages?.private) return 0;
  let total = 0;
  Object.values(chatStore.unreadMessages.private).forEach(count => {
    total += count || 0;
  });
  return total;
});

const currentUser = computed(() => {
  avatarVersion.value; // 触发响应式更新
  const currentUserStr = localStorage.getItem('currentUser');
  if (currentUserStr) {
    try {
      const user = JSON.parse(currentUserStr);
      if (user && user.id) {
        return {
          id: user.id,
          nickname: user.nickname,
          gender: user.gender,
          avatarUrl: user.avatarUrl  // 从后端获取，不保存在 localStorage
        };
      }
    } catch {
      // ignore
    }
  }
  
  const userId = localStorage.getItem('chatUserId');
  const nickname = localStorage.getItem('chatUserNickname');
  const gender = localStorage.getItem('chatUserGender');
  if (userId) {
    return { id: userId, nickname, gender, avatarUrl: null };
  }
  
  const id = localStorage.getItem('userId');
  const nick = localStorage.getItem('nickname');
  if (id) {
    return { id, nickname: nick, avatarUrl: null };
  }
  
  return null;
});

const userAvatarUrl = computed(() => {
  // 如果头像加载失败，返回空字符串
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
  // 设置头像加载失败标志，显示默认头像
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
                <img v-if="showAvatarImage" :src="userAvatarUrl" alt="用户头像" class="user-avatar-img" loading="lazy" width="60" height="60" style="aspect-ratio: 1/1; object-fit: cover;" @error="handleAvatarError">
                <span v-else id="userInitials" class="user-initials">{{ userInitials }}</span>
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
                <div class="chat-avatar"><img src="/icon/Settings-01-256.ico" alt="用户设置" style="width: 24px; height: 24px;"></div>
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
