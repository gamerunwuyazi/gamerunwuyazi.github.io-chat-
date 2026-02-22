<template>
  <div id="main-chat">
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
import { onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useChatStore } from "@/stores/chatStore";
import { initChatStore, setActiveChat } from "@/utils/chat";
import ChatSidebar from "@/components/ChatSidebar.vue"
import ChatModal from "@/components/ChatModal.vue";

const chatStore = useChatStore();
const route = useRoute();

function updateCurrentActiveChat() {
  const path = route.path;
  
  if (path === '/chat' || path === '/chat/') {
    setActiveChat('main');
  } else if (path.startsWith('/chat/group')) {
    if (chatStore.currentGroupId) {
      setActiveChat('group', chatStore.currentGroupId);
    }
  } else if (path.startsWith('/chat/private')) {
    if (chatStore.currentPrivateChatUserId) {
      setActiveChat('private', chatStore.currentPrivateChatUserId);
    }
  }
}

onMounted(() => {
  initChatStore(chatStore);
  updateCurrentActiveChat();
});

watch(
  () => route.path,
  () => {
    updateCurrentActiveChat();
  }
);
</script>