<template>
  <div class="admin-page-container">
    <div class="page-header">
      <h2>用户管理</h2>
      <div class="header-actions">
        <div class="search-box">
          <i class="fas fa-search"></i>
          <input type="text" v-model="searchQuery" placeholder="搜索用户名或昵称" @keyup.enter="loadUsers">
        </div>
      </div>
    </div>

    <div class="tabs">
      <button 
        v-for="tab in tabs" 
        :key="tab.key"
        :class="['tab-btn', { active: activeTab === tab.key }]"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span class="tab-badge" v-if="tab.count > 0">{{ tab.count }}</span>
      </button>
    </div>

    <div class="page-content">
      <div v-if="loading" class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <span>加载中...</span>
      </div>

      <div v-else-if="users.length === 0" class="empty-state">
        <i class="fas fa-users"></i>
        <span>暂无数据</span>
      </div>

      <div v-else class="data-table">
        <table>
          <thead>
            <tr>
              <th>用户信息</th>
              <th>注册时间</th>
              <th>状态</th>
              <th>消息数</th>
              <th>群组数</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>
                <div class="user-info">
                  <div class="avatar-wrapper">
                    <img v-if="getAvatarUrl(user)" :src="getAvatarUrl(user)" alt="头像" class="avatar">
                    <div v-else class="avatar-fallback">{{ getAvatarInitial(user.nickname || user.username) }}</div>
                    <span v-if="user.isOnline" class="online-indicator"></span>
                  </div>
                  <div class="user-details">
                    <p class="username">{{ user.nickname }}</p>
                    <p class="user-id">ID: {{ user.id }}</p>
                  </div>
                </div>
              </td>
              <td>{{ formatTime(user.created_at) }}</td>
              <td>
                <span :class="['status-badge', user.isOnline ? 'online' : 'offline']">
                  {{ user.isOnline ? '在线' : '离线' }}
                </span>
              </td>
              <td>{{ user.message_count || 0 }}</td>
              <td>{{ user.group_count || 0 }}</td>
              <td>
                <div class="action-buttons">
                  <button class="action-btn detail-btn" @click="showUserDetail(user)">
                    <i class="fas fa-eye"></i>
                  </button>
                  <button 
                    v-if="user.isOnline" 
                    class="action-btn warning-btn" 
                    @click="showConfirmModal('kick', user)"
                    title="踢下线"
                  >
                    <i class="fas fa-sign-out-alt"></i>
                  </button>
                  <button 
                    class="action-btn" 
                    :class="isBanned(user.id) ? 'success-btn' : 'danger-btn'"
                    @click="showConfirmModal(isBanned(user.id) ? 'unban' : 'ban', user)"
                    :title="isBanned(user.id) ? '解封' : '封禁'"
                  >
                    <i :class="isBanned(user.id) ? 'fas fa-unlock' : 'fas fa-ban'"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!loading && users.length > 0" class="pagination">
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

    <div v-if="showDetailModal" class="modal-overlay" @click.self="closeDetailModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>用户详情</h3>
          <button class="close-btn" @click="closeDetailModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div v-if="selectedUser" class="modal-body">
          <div class="detail-section">
            <div class="detail-avatar">
              <img v-if="getAvatarUrl(selectedUser)" :src="getAvatarUrl(selectedUser)" alt="头像">
              <div v-else class="detail-avatar-fallback">{{ getAvatarInitial(selectedUser.nickname || selectedUser.username) }}</div>
            </div>
            <div class="detail-info">
              <p><strong>昵称：</strong>{{ selectedUser.nickname }}</p>
              <p><strong>用户名：</strong>{{ selectedUser.username }}</p>
              <p><strong>用户ID：</strong>{{ selectedUser.id }}</p>
              <p><strong>邮箱：</strong>{{ selectedUser.email || '未设置' }}</p>
              <p><strong>状态：</strong>
                <span :class="['status-badge', selectedUser.isOnline ? 'online' : 'offline']">
                  {{ selectedUser.isOnline ? '在线' : '离线' }}
                </span>
              </p>
              <p><strong>注册时间：</strong>{{ formatTime(selectedUser.created_at) }}</p>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeDetailModal">关闭</button>
        </div>
      </div>
    </div>

    <div v-if="showConfirmModalFlag" class="modal-overlay" @click.self="closeConfirmModal">
      <div class="modal-content confirm-modal">
        <div class="modal-header">
          <h3>{{ confirmTitle }}</h3>
          <button class="close-btn" @click="closeConfirmModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <p>{{ confirmMessage }}</p>
          <input 
            v-if="confirmType === 'ban'" 
            v-model="banReason" 
            type="text" 
            placeholder="请输入封禁原因"
            class="reason-input"
          >
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeConfirmModal">取消</button>
          <button 
            class="btn" 
            :class="confirmType === 'ban' ? 'btn-danger' : 'btn-warning'"
            @click="executeAction"
          >
            确认{{ confirmType === 'ban' ? '封禁' : confirmType === 'unban' ? '解封' : '踢下线' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { getUsers, getUserDetail, banIP, unbanIP, kickSession, getBannedList, getAdminResourceUrl } from '@/utils/adminApi';
import toast from '@/utils/toast';

const searchQuery = ref('');
const activeTab = ref('users');
const users = ref([]);
const bannedList = ref([]);
const loading = ref(true);
const currentPage = ref(1);
const totalPages = ref(1);

const showDetailModal = ref(false);
const selectedUser = ref(null);

const showConfirmModalFlag = ref(false);
const confirmType = ref('');
const confirmUser = ref(null);
const confirmTitle = ref('');
const confirmMessage = ref('');
const banReason = ref('');

const tabs = computed(() => [
  { key: 'users', label: '用户列表', count: 0 },
  { key: 'sessions', label: '在线会话', count: 0 },
  { key: 'banned', label: '封禁记录', count: bannedList.value.length }
]);

onMounted(async () => {
  await loadUsers();
  await loadBannedList();
});

watch(searchQuery, () => {
  currentPage.value = 1;
});

watch(activeTab, () => {
  currentPage.value = 1;
  if (activeTab.value === 'banned') {
    loadBannedList();
  } else if (activeTab.value === 'users') {
    loadUsers();
  } else if (activeTab.value === 'sessions') {
    loadSessions();
  }
});

async function loadUsers() {
  loading.value = true;
  try {
    const data = await getUsers(currentPage.value, 20, searchQuery.value);
    users.value = data.users || [];
    totalPages.value = data.pagination?.totalPages || 1;
  } catch (error) {
    toast.error(error.message);
    users.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadSessions() {
  loading.value = true;
  try {
    const data = await getUsers(1, 100);
    users.value = (data.users || []).filter(u => u.isOnline);
    totalPages.value = 1;
  } catch (error) {
    toast.error(error.message);
    users.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadBannedList() {
  loading.value = true;
  try {
    const data = await getBannedList();
    bannedList.value = data.bannedList || [];
    if (activeTab.value === 'banned') {
      users.value = bannedList.value.map(b => ({
        id: b.user_id,
        nickname: b.nickname || '未知',
        username: b.username || '',
        avatar_url: null,
        created_at: b.banned_at,
        isOnline: false,
        message_count: 0,
        group_count: 0,
        ip_address: b.ip_address,
        reason: b.reason,
        expires_at: b.expires_at,
        status: b.status
      }));
      totalPages.value = 1;
    }
  } catch (error) {
    toast.error(error.message);
    bannedList.value = [];
  } finally {
    loading.value = false;
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--;
    if (activeTab.value === 'users') {
      loadUsers();
    }
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
    if (activeTab.value === 'users') {
      loadUsers();
    }
  }
}

function isBanned(userId) {
  return bannedList.value.some(b => b.user_id === userId);
}

async function showUserDetail(user) {
  try {
    const data = await getUserDetail(user.id);
    selectedUser.value = data.user;
    showDetailModal.value = true;
  } catch (error) {
    toast.error(error.message);
  }
}

function closeDetailModal() {
  showDetailModal.value = false;
  selectedUser.value = null;
}

function showConfirmModal(type, user) {
  confirmType.value = type;
  confirmUser.value = user;
  
  if (type === 'ban') {
    confirmTitle.value = '确认封禁';
    confirmMessage.value = `确定要封禁用户 "${user.nickname}" 吗？此操作将禁止该用户登录。`;
  } else if (type === 'unban') {
    confirmTitle.value = '确认解封';
    confirmMessage.value = `确定要解封用户 "${user.nickname}" 吗？`;
  } else if (type === 'kick') {
    confirmTitle.value = '确认踢下线';
    confirmMessage.value = `确定要将用户 "${user.nickname}" 踢下线吗？`;
  }
  
  showConfirmModalFlag.value = true;
}

function closeConfirmModal() {
  showConfirmModalFlag.value = false;
  confirmType.value = '';
  confirmUser.value = null;
  banReason.value = '';
}

async function executeAction() {
  try {
    if (confirmType.value === 'ban') {
      await banIP(null, confirmUser.value.id, banReason.value || '违反使用规则');
      toast.success('封禁成功');
    } else if (confirmType.value === 'unban') {
      await unbanIP(null, confirmUser.value.id);
      toast.success('解封成功');
    } else if (confirmType.value === 'kick') {
      await kickSession(confirmUser.value.id);
      toast.success('踢下线成功');
    }
    
    await loadUsers();
    await loadBannedList();
  } catch (error) {
    toast.error(error.message);
  } finally {
    closeConfirmModal();
  }
}

function getAvatarUrl(user) {
  const url = user?.avatar_url || user?.avatarUrl || user?.avatar || '';
  return url ? getAdminResourceUrl(url) : '';
}

function getAvatarInitial(name) {
  return (name || 'U').trim().charAt(0).toUpperCase();
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

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.tab-btn {
  padding: 8px 16px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #8b949e;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  background: #30363d;
  color: #c9d1d9;
}

.tab-btn.active {
  background: rgba(56, 139, 253, 0.15);
  color: #58a6ff;
  border-color: #388bfd;
}

.tab-badge {
  background: #f85149;
  color: white;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 10px;
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

.data-table {
  overflow-x: auto;
}

.data-table table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #21262d;
}

.data-table th {
  background: #21262d;
  color: #8b949e;
  font-size: 13px;
  font-weight: 500;
}

.data-table tr:hover {
  background: #21262d;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar-wrapper {
  position: relative;
}

.avatar,
.avatar-fallback {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}

.avatar {
  object-fit: cover;
}

.avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #3498db;
  color: white;
  font-weight: 600;
  font-size: 18px;
}

.online-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  background: #3fb950;
  border: 2px solid #161b22;
  border-radius: 50%;
}

.user-details p {
  margin: 0;
}

.username {
  color: #f0f6fc;
  font-weight: 500;
}

.user-id {
  color: #6e7681;
  font-size: 12px;
}

.status-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.online {
  background: rgba(46, 160, 67, 0.15);
  color: #3fb950;
}

.status-badge.offline {
  background: rgba(139, 148, 158, 0.15);
  color: #8b949e;
}

.action-buttons {
  display: flex;
  gap: 6px;
}

.action-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.2s ease;
}

.detail-btn {
  background: rgba(56, 139, 253, 0.15);
  color: #58a6ff;
}

.detail-btn:hover {
  background: rgba(56, 139, 253, 0.25);
}

.warning-btn {
  background: rgba(210, 153, 34, 0.15);
  color: #d29922;
}

.warning-btn:hover {
  background: rgba(210, 153, 34, 0.25);
}

.danger-btn {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.danger-btn:hover {
  background: rgba(248, 81, 73, 0.25);
}

.success-btn {
  background: rgba(46, 160, 67, 0.15);
  color: #3fb950;
}

.success-btn:hover {
  background: rgba(46, 160, 67, 0.25);
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

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #161b22;
  border-radius: 12px;
  border: 1px solid #30363d;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #30363d;
}

.modal-header h3 {
  margin: 0;
  color: #f0f6fc;
  font-size: 16px;
}

.close-btn {
  background: none;
  border: none;
  color: #8b949e;
  cursor: pointer;
  padding: 4px;
}

.close-btn:hover {
  color: #c9d1d9;
}

.modal-body {
  padding: 20px;
  max-height: 400px;
  overflow-y: auto;
}

.modal-body p {
  color: #c9d1d9;
  margin: 0 0 16px 0;
}

.reason-input {
  width: 100%;
  padding: 10px 12px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 8px;
  color: #c9d1d9;
  font-size: 14px;
  outline: none;
}

.reason-input:focus {
  border-color: #388bfd;
}

.reason-input::placeholder {
  color: #6e7681;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #30363d;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
}

.btn-secondary {
  background: #21262d;
  color: #8b949e;
  border: 1px solid #30363d;
}

.btn-secondary:hover {
  background: #30363d;
  color: #c9d1d9;
}

.btn-danger {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
  border: 1px solid rgba(248, 81, 73, 0.3);
}

.btn-danger:hover {
  background: rgba(248, 81, 73, 0.25);
}

.btn-warning {
  background: rgba(210, 153, 34, 0.15);
  color: #d29922;
  border: 1px solid rgba(210, 153, 34, 0.3);
}

.btn-warning:hover {
  background: rgba(210, 153, 34, 0.25);
}

.detail-section {
  display: flex;
  gap: 20px;
}

.detail-avatar {
  width: 80px;
  height: 80px;
}

.detail-avatar img {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
}

.detail-avatar-fallback {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #3498db;
  color: white;
  font-weight: 600;
  font-size: 28px;
}

.detail-info p {
  margin: 8px 0;
  color: #c9d1d9;
}

.detail-info strong {
  color: #8b949e;
}
</style>