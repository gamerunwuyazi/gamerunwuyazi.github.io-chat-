<template>
  <!-- 手机端布局 -->
  <MobileLayout v-if="isMobile" />

  <!-- 桌面端布局 -->
  <div v-else id="main-chat">
    <ChatSidebar/>
    
    <router-view name="sidebar"></router-view>
    
    <div id="chat-main">
      <router-view></router-view>
    </div>
    <div id="modal">
      <ChatModal/>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";

import ChatModal from "@/components/ChatModal.vue";
import ChatSidebar from "@/components/ChatSidebar.vue"
import MobileLayout from "@/layouts/MobileLayout.vue"
import { useSessionStore } from "@/stores/sessionStore";
import { setActiveChat } from "@/utils/chat";

const sessionStore = useSessionStore();
const route = useRoute();

const isMobile = ref(false);

function checkMobile() {
  isMobile.value = window.innerWidth <= 768;
}

function updateCurrentActiveChat(clearUnread = false) {
  const path = route.path;
  
  if (path === '/chat' || path === '/chat/') {
    setActiveChat('main', null, clearUnread);
  } else if (path.startsWith('/chat/group')) {
    if (sessionStore.currentGroupId) {
      setActiveChat('group', sessionStore.currentGroupId, clearUnread);
    }
  } else if (path.startsWith('/chat/private')) {
    if (sessionStore.currentPrivateChatUserId) {
      setActiveChat('private', sessionStore.currentPrivateChatUserId, clearUnread);
    }
  }
}

onMounted(() => {
  checkMobile();
  window.addEventListener('resize', checkMobile);
  updateCurrentActiveChat(false);
});

watch(
  () => route.path,
  () => {
    updateCurrentActiveChat(true);
  }
);
</script>