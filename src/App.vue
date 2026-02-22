<template>
  <router-view></router-view>
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
