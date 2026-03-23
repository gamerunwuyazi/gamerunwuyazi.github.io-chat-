<template>
  <div>
    <router-view></router-view>
    <div v-if="chatStore.showFetchingMessage" class="fetching-message-overlay">
      <div class="fetching-message-box">
        <i class="fas fa-spinner fa-spin"></i>
        <span>拉取消息中...</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useChatStore } from '@/stores/chatStore'
import { initializeChat, initChatStore } from "@/utils/chat"

const userLoggedIn = ref(false)
const chatStore = useChatStore()

function checkLoginStatus() {
  const currentUser = localStorage.getItem('currentUser')
  const currentSessionToken = localStorage.getItem('currentSessionToken')
  const chatUserId = localStorage.getItem('chatUserId')
  const chatSessionToken = localStorage.getItem('chatSessionToken')
  const userId = localStorage.getItem('userId')
  const sessionToken = localStorage.getItem('sessionToken')
  
  const isLoggedIn = (!!currentUser && (!!currentSessionToken || !!chatSessionToken)) || 
                     (!!chatUserId && !!chatSessionToken) || 
                     (!!userId && !!sessionToken)
  
  userLoggedIn.value = isLoggedIn
  return isLoggedIn
}

onMounted(() => {
  // 首先初始化 store 引用
  initChatStore(chatStore)
  
  checkLoginStatus()
  
  if (userLoggedIn.value) {
   initializeChat()
  }
})
</script>

<style scoped>
.fetching-message-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.fetching-message-box {
  background-color: white;
  padding: 20px 40px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
}

.fetching-message-box i {
  color: #4a90e2;
}
</style>
