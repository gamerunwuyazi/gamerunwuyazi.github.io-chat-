<template>
  <div class="dashboard-container">
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon users-icon">
          <i class="fas fa-users"></i>
        </div>
        <div class="stat-content">
          <p class="stat-value">{{ stats.totalUsers || 0 }}</p>
          <p class="stat-label">总用户数</p>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon online-icon">
          <i class="fas fa-circle"></i>
        </div>
        <div class="stat-content">
          <p class="stat-value">{{ stats.onlineUsers || 0 }}</p>
          <p class="stat-label">在线用户</p>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon groups-icon">
          <i class="fas fa-users"></i>
        </div>
        <div class="stat-content">
          <p class="stat-value">{{ stats.totalGroups || 0 }}</p>
          <p class="stat-label">群组数量</p>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon messages-icon">
          <i class="fas fa-message"></i>
        </div>
        <div class="stat-content">
          <p class="stat-value">{{ stats.totalMessages || 0 }}</p>
          <p class="stat-label">消息总数</p>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon files-icon">
          <i class="fas fa-file"></i>
        </div>
        <div class="stat-content">
          <p class="stat-value">{{ stats.totalFiles || 0 }}</p>
          <p class="stat-label">文件数量</p>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon bans-icon">
          <i class="fas fa-ban"></i>
        </div>
        <div class="stat-content">
          <p class="stat-value">{{ stats.bannedUsers || 0 }}</p>
          <p class="stat-label">封禁用户</p>
        </div>
      </div>
    </div>
    
    <div class="dashboard-sections">
      <div class="section recent-activities">
        <div class="section-header">
          <h2>最近活动</h2>
          <button class="view-all-btn">查看全部</button>
        </div>
        
        <div v-if="loadingActivities" class="loading-state">
          <i class="fas fa-spinner fa-spin"></i>
          <span>加载中...</span>
        </div>
        
        <div v-else-if="activities.length === 0" class="empty-state">
          <i class="fas fa-inbox"></i>
          <span>暂无活动记录</span>
        </div>
        
        <div v-else class="activities-list">
          <div v-for="activity in activities" :key="activity.id" class="activity-item">
            <div class="activity-icon" :class="getIconClass(activity.action)">
              <i :class="getIcon(activity.action)"></i>
            </div>
            <div class="activity-content">
              <p class="activity-description">{{ formatActivity(activity) }}</p>
              <p class="activity-time">{{ formatTime(activity.createdAt) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getDashboardStats, getRecentActivities } from '@/utils/adminApi';

const stats = ref({
  totalUsers: 0,
  onlineUsers: 0,
  totalGroups: 0,
  totalMessages: 0,
  totalFiles: 0,
  bannedUsers: 0
});

const activities = ref([]);
const loadingActivities = ref(true);

onMounted(async () => {
  await loadStats();
  await loadActivities();
});

async function loadStats() {
  try {
    const data = await getDashboardStats();
    stats.value = data;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

async function loadActivities() {
  loadingActivities.value = true;
  try {
    const data = await getRecentActivities(1, 10);
    activities.value = data.data || data.records || [];
  } catch (error) {
    console.error('Failed to load activities:', error);
    activities.value = [];
  } finally {
    loadingActivities.value = false;
  }
}

function getIcon(action) {
  const iconMap = {
    'login': 'fas fa-sign-in-alt',
    'logout': 'fas fa-sign-out-alt',
    'ban': 'fas fa-ban',
    'unban': 'fas fa-unlock',
    'kick': 'fas fa-user-minus',
    'create_group': 'fas fa-users',
    'delete_group': 'fas fa-trash',
    'delete_message': 'fas fa-trash',
    'upload_file': 'fas fa-upload',
    'delete_file': 'fas fa-trash'
  };
  return iconMap[action] || 'fas fa-activity';
}

function getIconClass(action) {
  const classMap = {
    'login': 'success',
    'logout': 'info',
    'ban': 'danger',
    'unban': 'success',
    'kick': 'warning',
    'create_group': 'success',
    'delete_group': 'danger',
    'delete_message': 'danger',
    'upload_file': 'info',
    'delete_file': 'danger'
  };
  return classMap[action] || 'default';
}

function formatActivity(activity) {
  const actionMap = {
    'login': `${activity.actor} 登录了管理面板`,
    'logout': `${activity.actor} 退出了管理面板`,
    'ban': `${activity.actor} 封禁了用户 ${activity.target}`,
    'unban': `${activity.actor} 解封了用户 ${activity.target}`,
    'kick': `${activity.actor} 踢下线了用户 ${activity.target}`,
    'create_group': `${activity.actor} 创建了群组 ${activity.target}`,
    'delete_group': `${activity.actor} 删除了群组 ${activity.target}`,
    'delete_message': `${activity.actor} 删除了消息`,
    'upload_file': `${activity.target} 上传了文件`,
    'delete_file': `${activity.actor} 删除了文件`
  };
  return actionMap[activity.action] || `${activity.actor} 执行了 ${activity.action} 操作`;
}

function formatTime(dateString) {
  if (!dateString) return '未知';
  
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  
  return date.toLocaleDateString('zh-CN');
}
</script>

<style scoped>
.dashboard-container {
  width: 100%;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: #161b22;
  border-radius: 12px;
  border: 1px solid #30363d;
  transition: all 0.2s ease;
}

.stat-card:hover {
  border-color: #388bfd;
  transform: translateY(-2px);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.stat-icon.users-icon {
  background: rgba(56, 139, 253, 0.15);
  color: #58a6ff;
}

.stat-icon.online-icon {
  background: rgba(46, 160, 67, 0.15);
  color: #3fb950;
}

.stat-icon.groups-icon {
  background: rgba(210, 153, 34, 0.15);
  color: #d29922;
}

.stat-icon.messages-icon {
  background: rgba(163, 113, 247, 0.15);
  color: #a371f7;
}

.stat-icon.files-icon {
  background: rgba(248, 108, 108, 0.15);
  color: #f86c6c;
}

.stat-icon.bans-icon {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.stat-content {
  flex: 1;
}

.stat-value {
  margin: 0 0 4px 0;
  font-size: 28px;
  font-weight: 700;
  color: #f0f6fc;
}

.stat-label {
  margin: 0;
  font-size: 14px;
  color: #8b949e;
}

.dashboard-sections {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
}

.section {
  background: #161b22;
  border-radius: 12px;
  border: 1px solid #30363d;
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #30363d;
}

.section-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #f0f6fc;
}

.view-all-btn {
  padding: 6px 12px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #8b949e;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.view-all-btn:hover {
  background: #30363d;
  color: #c9d1d9;
}

.loading-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px;
  color: #8b949e;
}

.activities-list {
  padding: 8px 0;
}

.activity-item {
  display: flex;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid #21262d;
  transition: background 0.2s ease;
}

.activity-item:hover {
  background: #21262d;
}

.activity-item:last-child {
  border-bottom: none;
}

.activity-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.activity-icon.success {
  background: rgba(46, 160, 67, 0.15);
  color: #3fb950;
}

.activity-icon.info {
  background: rgba(56, 139, 253, 0.15);
  color: #58a6ff;
}

.activity-icon.warning {
  background: rgba(210, 153, 34, 0.15);
  color: #d29922;
}

.activity-icon.danger {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.activity-icon.default {
  background: rgba(139, 148, 158, 0.15);
  color: #8b949e;
}

.activity-content {
  flex: 1;
  min-width: 0;
}

.activity-description {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: #c9d1d9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-time {
  margin: 0;
  font-size: 12px;
  color: #6e7681;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .stat-value {
    font-size: 22px;
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>