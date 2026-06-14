<template>
  <div class="admin-page-container">
    <div class="page-header">
      <h2>审计日志</h2>
      <div class="header-actions">
        <select v-model="filterAction" class="filter-select" @change="loadLogs">
          <option value="">所有操作</option>
          <option v-for="action in actions" :key="action" :value="action">{{ getActionLabel(action) }}</option>
        </select>
        <div class="search-box">
          <i class="fas fa-search"></i>
          <input type="text" v-model="searchQuery" placeholder="搜索内容" @keyup.enter="loadLogs">
        </div>
      </div>
    </div>

    <div class="page-content">
      <div v-if="loading" class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <span>加载中...</span>
      </div>

      <div v-else-if="logs.length === 0" class="empty-state">
        <i class="fas fa-file-alt"></i>
        <span>暂无数据</span>
      </div>

      <div v-else class="logs-list">
        <div v-for="log in logs" :key="log.id" class="log-item">
          <div class="log-header">
            <div class="log-icon" :class="getActionClass(log.action)">
              <i :class="getActionIcon(log.action)"></i>
            </div>
            <div class="log-info">
              <span class="log-action">{{ getActionLabel(log.action) }}</span>
              <span class="log-time">{{ formatTime(log.timestamp) }}</span>
            </div>
            <span class="log-target" v-if="log.target_id">目标: {{ log.target_id }}</span>
          </div>
          
          <div class="log-details">
            <p><strong>操作人：</strong>{{ log.username || log.actor || '管理员' }}</p>
            <p><strong>详情：</strong>{{ getDetailsText(log) }}</p>
            <p v-if="log.ip_address"><strong>IP地址：</strong>{{ log.ip_address }}</p>
          </div>
        </div>
      </div>

      <div v-if="!loading && logs.length > 0" class="pagination">
        <button 
          class="page-btn" 
          :disabled="currentPage === 1" 
          @click="prevPage"
        >
          <i class="fas fa-chevron-left"></i>
        </button>
        <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
        <button 
          class="page-btn" 
          :disabled="currentPage >= totalPages" 
          @click="nextPage"
        >
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { getAuditLogs, getAuditActions } from '@/utils/adminApi';
import toast from '@/utils/toast';

const searchQuery = ref('');
const filterAction = ref('');
const logs = ref([]);
const actions = ref([]);
const loading = ref(true);
const currentPage = ref(1);
const totalPages = ref(1);

onMounted(async () => {
  await loadActions();
  await loadLogs();
});

watch([searchQuery, filterAction], () => {
  currentPage.value = 1;
  loadLogs();
});

async function loadActions() {
  try {
    const data = await getAuditActions();
    actions.value = data.actions || [];
  } catch (error) {
    console.error('Failed to load actions:', error);
    actions.value = [];
  }
}

async function loadLogs() {
  loading.value = true;
  try {
    const data = await getAuditLogs(currentPage.value, 20, filterAction.value);
    logs.value = data.logs || [];
    totalPages.value = data.pagination?.totalPages || 1;
  } catch (error) {
    toast.error(error.message);
    logs.value = [];
  } finally {
    loading.value = false;
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--;
    loadLogs();
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
    loadLogs();
  }
}

function getActionLabel(action) {
  const labelMap = {
    'login': '登录',
    'logout': '退出',
    'ban': '封禁',
    'unban': '解封',
    'kick_user': '踢下线',
    'kick_member': '踢出群组',
    'mute_member': '禁言',
    'create_group': '创建群组',
    'dissolve_group': '解散群组',
    'delete_message': '删除消息',
    'upload_file': '上传文件',
    'delete_file': '删除文件'
  };
  return labelMap[action] || action;
}

function getActionIcon(action) {
  const iconMap = {
    'login': 'fas fa-sign-in-alt',
    'logout': 'fas fa-sign-out-alt',
    'ban': 'fas fa-ban',
    'unban': 'fas fa-unlock',
    'kick_user': 'fas fa-user-minus',
    'kick_member': 'fas fa-user-minus',
    'mute_member': 'fas fa-microphone-slash',
    'create_group': 'fas fa-users',
    'dissolve_group': 'fas fa-trash',
    'delete_message': 'fas fa-trash',
    'upload_file': 'fas fa-upload',
    'delete_file': 'fas fa-trash'
  };
  return iconMap[action] || 'fas fa-activity';
}

function getActionClass(action) {
  const classMap = {
    'login': 'success',
    'logout': 'info',
    'ban': 'danger',
    'unban': 'success',
    'kick_user': 'warning',
    'kick_member': 'warning',
    'mute_member': 'warning',
    'create_group': 'success',
    'dissolve_group': 'danger',
    'delete_message': 'danger',
    'upload_file': 'info',
    'delete_file': 'danger'
  };
  return classMap[action] || 'default';
}

function getDetailsText(log) {
  if (log.details) {
    try {
      const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
      const parts = [];
      if (details.userId) parts.push(`用户ID: ${details.userId}`);
      if (details.username) parts.push(`用户名: ${details.username}`);
      if (details.nickname) parts.push(`昵称: ${details.nickname}`);
      if (details.groupId) parts.push(`群组ID: ${details.groupId}`);
      if (details.groupName) parts.push(`群组名: ${details.groupName}`);
      if (details.reason) parts.push(`原因: ${details.reason}`);
      if (details.memberId) parts.push(`成员ID: ${details.memberId}`);
      if (details.memberNickname) parts.push(`成员昵称: ${details.memberNickname}`);
      if (details.filename) parts.push(`文件名: ${details.filename}`);
      if (parts.length > 0) return parts.join(', ');
    } catch (e) {
      return log.details;
    }
  }
  return '无详细信息';
}

function formatTime(dateString) {
  if (!dateString) return '未知';
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN');
}
</script>

<style scoped>
.admin-page-container {
  height: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #f0f6fc;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.filter-select {
  padding: 8px 12px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 8px;
  color: #c9d1d9;
  font-size: 14px;
  outline: none;
  cursor: pointer;
}

.filter-select:focus {
  border-color: #388bfd;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 8px;
  min-width: 200px;
}

.search-box i {
  color: #6e7681;
  font-size: 14px;
}

.search-box input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #c9d1d9;
  font-size: 14px;
}

.search-box input::placeholder {
  color: #6e7681;
}

.page-content {
  background: #161b22;
  border-radius: 12px;
  border: 1px solid #30363d;
  min-height: 400px;
  padding: 16px;
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

.logs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.log-item {
  background: #21262d;
  border-radius: 8px;
  padding: 16px;
  border: 1px solid #30363d;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.log-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.log-icon.success {
  background: rgba(46, 160, 67, 0.15);
  color: #3fb950;
}

.log-icon.info {
  background: rgba(56, 139, 253, 0.15);
  color: #58a6ff;
}

.log-icon.warning {
  background: rgba(210, 153, 34, 0.15);
  color: #d29922;
}

.log-icon.danger {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.log-icon.default {
  background: rgba(139, 148, 158, 0.15);
  color: #8b949e;
}

.log-info {
  flex: 1;
}

.log-action {
  color: #f0f6fc;
  font-weight: 500;
  font-size: 14px;
  margin-right: 12px;
}

.log-time {
  color: #6e7681;
  font-size: 12px;
}

.log-target {
  color: #8b949e;
  font-size: 12px;
  padding: 4px 8px;
  background: #30363d;
  border-radius: 4px;
}

.log-details {
  padding-left: 48px;
}

.log-details p {
  margin: 4px 0;
  color: #8b949e;
  font-size: 13px;
}

.log-details strong {
  color: #c9d1d9;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
}

.page-btn {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: 1px solid #30363d;
  background: #21262d;
  color: #8b949e;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.page-btn:hover:not(:disabled) {
  background: #30363d;
  color: #c9d1d9;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  color: #8b949e;
  font-size: 14px;
}
</style>