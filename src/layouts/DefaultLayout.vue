<template>
  <div id="main-chat">
    <ChatSidebar/>
    
    <router-view name="sidebar"></router-view>
    
    <div id="chat-main" @click="handleChatMainClick">
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
import { initChatStore, setActiveChat, updateTitleWithUnreadCount } from "@/utils/chat";
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

function handleChatMainClick() {
  const path = route.path;
  const sessionToken = chatStore.currentSessionToken;
  const userId = chatStore.currentUser?.id;
  
  if (path.startsWith('/chat/group')) {
    const groupId = chatStore.currentGroupId;
    if (groupId && window.chatSocket && sessionToken && userId) {
      const unreadGroup = chatStore.unreadMessages?.groups?.[groupId];
      if (unreadGroup > 0) {
        window.chatSocket.emit('join-group', {
          groupId: parseInt(groupId),
          sessionToken: sessionToken,
          userId: userId,
          noHistory: true
        });
        chatStore.unreadMessages.groups[groupId] = 0;
        updateTitleWithUnreadCount();
      }
    }
  } else if (path.startsWith('/chat/private')) {
    const friendId = chatStore.currentPrivateChatUserId;
    if (friendId && window.chatSocket && sessionToken && userId) {
      const unreadPrivate = chatStore.unreadMessages?.private?.[friendId];
      if (unreadPrivate > 0) {
        window.chatSocket.emit('join-private-chat', {
          userId: userId,
          friendId: friendId,
          sessionToken: sessionToken,
          onlyClearUnread: true,
          noHistory: true
        });
        chatStore.unreadMessages.private[friendId] = 0;
        updateTitleWithUnreadCount();
      }
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