<template>
  <div class="admin-layout">
    <aside class="admin-sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <i class="fas fa-shield-alt"></i>
          <span>管理面板</span>
        </div>
      </div>
      
      <nav class="sidebar-nav">
        <ul>
          <li v-for="item in menuItems" :key="item.path">
            <router-link 
              :to="item.path" 
              :class="['nav-item', { active: $route.path.startsWith(item.path) }]"
            >
              <i :class="item.icon"></i>
              <span>{{ item.label }}</span>
            </router-link>
          </li>
        </ul>
      </nav>
    </aside>
    
    <div class="admin-main">
      <header class="admin-header">
        <div class="header-left">
          <h1>{{ currentPageTitle }}</h1>
        </div>
        <div class="header-right">
          <div class="user-info">
            <span class="username">{{ adminStore.adminUsername }}</span>
            <button class="logout-btn" @click="handleLogout">
              <i class="fas fa-sign-out-alt"></i>
              <span>退出</span>
            </button>
          </div>
        </div>
      </header>
      
      <main class="admin-content">
        <router-view></router-view>
      </main>
    </div>
  </div>
</template>

<script setup>import { computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAdminStore } from '@/stores/adminStore';
import { adminLogout } from '@/utils/adminApi';
const route = useRoute();
const adminStore = useAdminStore();

onMounted(() => {
  document.body.classList.add('dark-mode');
});

onUnmounted(() => {
  document.body.classList.remove('dark-mode');
});
const menuItems = [
 { path: '/admin', label: '仪表盘', icon: 'fas fa-tachometer-alt' },
 { path: '/admin/users', label: '用户管理', icon: 'fas fa-users' },
 { path: '/admin/groups', label: '群组管理', icon: 'fas fa-users' },
 { path: '/admin/messages', label: '消息管理', icon: 'fas fa-message' },
 { path: '/admin/files', label: '文件管理', icon: 'fas fa-file' },
 { path: '/admin/logs', label: '审计日志', icon: 'fas fa-file-alt' }
];
const currentPageTitle = computed(() => {
 const currentItem = menuItems
   .slice()
   .sort((a, b) => b.path.length - a.path.length)
   .find(item => route.path.startsWith(item.path));
 return currentItem ? currentItem.label : '仪表盘';
});
async function handleLogout() {
 if (confirm('确定要退出登录吗？')) {
 try {
 await adminLogout();
 }
 catch {
 // 忽略退出请求的错误
 }
 finally {
 adminStore.clearAdminInfo();
 window.location.href = '/admin/login';
 }
 }
}
</script>

<style scoped>
.admin-layout {
  display: flex;
  height: 100vh;
  background: #0d1117;
  color: #c9d1d9;
}

.admin-sidebar {
  width: 220px;
  background: #161b22;
  border-right: 1px solid #30363d;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid #30363d;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
  color: #f0f6fc;
}

.sidebar-logo i {
  font-size: 24px;
  color: #388bfd;
}

.sidebar-nav {
  flex: 1;
  padding: 16px 0;
}

.sidebar-nav ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  color: #8b949e;
  text-decoration: none;
  transition: all 0.2s ease;
  border-left: 2px solid transparent;
}

.nav-item:hover {
  background: #21262d;
  color: #c9d1d9;
}

.nav-item.active {
  background: rgba(56, 139, 253, 0.15);
  color: #58a6ff;
  border-left-color: #388bfd;
}

.nav-item i {
  width: 18px;
  font-size: 16px;
}

.admin-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
}

.header-left h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #f0f6fc;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.username {
  font-size: 14px;
  color: #c9d1d9;
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(248, 81, 73, 0.15);
  border: 1px solid rgba(248, 81, 73, 0.3);
  border-radius: 6px;
  color: #f85149;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.logout-btn:hover {
  background: rgba(248, 81, 73, 0.25);
}

.admin-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

@media (max-width: 768px) {
  .admin-sidebar {
    width: 60px;
  }
  
  .sidebar-logo span {
    display: none;
  }
  
  .nav-item span {
    display: none;
  }
  
  .nav-item {
    justify-content: center;
  }
  
  .username {
    display: none;
  }
  
  .logout-btn span {
    display: none;
  }
}
</style>