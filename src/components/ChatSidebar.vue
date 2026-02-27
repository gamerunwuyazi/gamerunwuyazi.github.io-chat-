<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useChatStore } from '@/stores/chatStore';
import { logout } from '@/utils/chat/ui';
import { unescapeHtml } from '@/utils/chat';

const router = useRouter();
const route = useRoute();
const chatStore = useChatStore();

const avatarVersion = ref(Date.now())

function handleUserAvatarUpdate() {
  avatarVersion.value = Date.now()
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
      return JSON.parse(currentUserStr);
    } catch {
      // ignore
    }
  }
  
  const userId = localStorage.getItem('chatUserId');
  const nickname = localStorage.getItem('chatUserNickname');
  const avatarUrl = localStorage.getItem('chatUserAvatar');
  if (userId) {
    return { id: userId, nickname, avatarUrl };
  }
  
  const id = localStorage.getItem('userId');
  const nick = localStorage.getItem('nickname');
  const avatar = localStorage.getItem('avatarUrl');
  if (id) {
    return { id, nickname: nick, avatarUrl: avatar };
  }
  
  return null;
});

const userAvatarUrl = computed(() => {
  const user = currentUser.value;
  if (!user) return '';
  
  let url = user.avatar || user.avatarUrl || '';
  if (url && !/\.svg$/i.test(url)) {
    return `https://back.hs.airoe.cn${url}?v=${avatarVersion.value}`;
  }
  return '';
});

const userInitials = computed(() => {
  const user = currentUser.value;
  const nickname = user?.nickname || '';
  const unescapedNickname = unescapeHtml(nickname);
  return unescapedNickname ? unescapedNickname.charAt(0).toUpperCase() : 'U';
});

const showAvatarImage = computed(() => {
  return userAvatarUrl.value !== '';
});

function handleMenuClick(section) {
  if (section === 'logout') {
    if (confirm('确定要退出登录吗？')) {
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
                <img v-if="showAvatarImage" :src="userAvatarUrl" alt="用户头像" class="user-avatar-img" loading="lazy" width="60" height="60" style="aspect-ratio: 1/1; object-fit: cover;">
                <span v-else id="userInitials" class="user-initials">{{ userInitials }}</span>
            </div>
        </div>
    </div>
    
    <div class="menu-section">
        <ul class="menu-list">
            <li :class="['menu-item', { active: activeMenuItem === 'public-chat' }]" data-section="public-chat" @click="handleMenuClick('public-chat')">
                <div class="chat-avatar">💬</div>
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
                <div class="chat-avatar">⏻</div>
            </li>
        </ul>
    </div>
</div>
</template>

<style src="@/css/index.css"></style>
<style src="@/css/code-highlight.css"></style>
