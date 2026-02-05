<template>
  <div id="main-chat" v-if="isUserLoggedIn && shouldShowSidebar">
    <ChatSidebar/>

    <ChatSecondarySidebar/>

    <div id="chat-main">
      <router-view></router-view>
    </div>
  </div>
  <ChatModal v-if="isUserLoggedIn && shouldShowSidebar"/>
  <router-view v-else></router-view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import ChatSidebar from "@/components/ChatSidebar.vue"
import ChatSecondarySidebar from "@/components/ChatSecondarySidebar.vue"
import { 
  initializeChat,
} from "@/utils/chat"
import ChatModal from "@/components/ChatModal.vue";

const router = useRouter()
const route = useRoute()

// 响应式数据
const userLoggedIn = ref(false)

// 检查登录状态的函数
function checkLoginStatus() {
  const currentUser = localStorage.getItem('currentUser')
  const currentSessionToken = localStorage.getItem('currentSessionToken')
  const chatUserId = localStorage.getItem('chatUserId')
  const chatSessionToken = localStorage.getItem('chatSessionToken')
  const userId = localStorage.getItem('userId')
  const sessionToken = localStorage.getItem('sessionToken')
  
  // 多种登录状态判断方式
  const isLoggedIn = (!!currentUser && (!!currentSessionToken || !!chatSessionToken)) || 
                     (!!chatUserId && !!chatSessionToken) || 
                     (!!userId && !!sessionToken)
  
  userLoggedIn.value = isLoggedIn
  return isLoggedIn
}

// 计算属性
const isUserLoggedIn = computed(() => userLoggedIn.value)

// 计算属性：判断是否应该显示侧边栏
const shouldShowSidebar = computed(() => {
  // 获取当前路由路径
  const path = route.path
  // 只在聊天相关页面显示侧边栏
  return ['/chat', '/chat/group', '/chat/private', '/settings'].includes(path)
})

/* 检查登录状态
// const checkLoginStatus = () => {
//   const userId = localStorage.getItem('userId')
//   const sessionToken = localStorage.getItem('sessionToken')
//   const nickname = localStorage.getItem('nickname')
//   const avatarUrl = localStorage.getItem('avatarUrl')
//
//   if (userId && sessionToken) {
//     // 更新当前用户状态
//     setCurrentUser({
//       id: userId,
//       nickname: nickname,
//       avatarUrl: avatarUrl
//     })
//     setCurrentSessionToken(sessionToken)
//
//     // 初始化聊天
//     initializeChat()
//   }
// }
 */

// 监听路由变化
const handleRouteChange = () => {
  // 检查是否需要登录
  const requiresAuth = ['public', 'group', 'private', 'settings'].includes(route.name)
  
  // 使用checkLoginStatus函数检查登录状态
  const isLoggedIn = checkLoginStatus()
  
  if (requiresAuth && !isLoggedIn) {
    // 重定向到登录页面
    router.push('/login')
  }
  
  // 如果用户已登录，确保在聊天相关页面显示侧边栏
  if (isLoggedIn) {
    const path = route.path
    if (['/chat', '/chat/group', '/chat/private', '/settings'].includes(path)) {
      // 确保侧边栏显示
      // 这里不需要额外操作，shouldShowSidebar计算属性会处理
    }
  }
}

// 初始化
onMounted(async () => {
  // 初始检查登录状态
  checkLoginStatus()
  
  // 监听路由变化
  router.afterEach(() => {
    checkLoginStatus()
    handleRouteChange()
  })

  await router.isReady()

  if (isUserLoggedIn.value) {
    initializeChat()
  }
})
</script>