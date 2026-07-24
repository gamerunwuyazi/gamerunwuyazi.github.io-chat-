<template>
  <div class="admin-page-container">
    <div class="page-header">
      <h2>日志与封禁</h2>
      <div class="header-actions">
        <button v-for="tab in tabs" :key="tab.key" :class="['tab-btn', { active: activeTab === tab.key }]" @click="switchTab(tab.key)">
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div class="page-content">
      <div class="toolbar">
        <select v-if="activeTab === 'audit'" v-model="filterAction" class="filter-select" @change="loadCurrentTab">
          <option value="">所有操作</option>
          <option v-for="action in actions" :key="action" :value="action">{{ getActionLabel(action) }}</option>
        </select>
        <div class="search-box">
          <i class="fas fa-search"></i>
          <input v-model.trim="searchText" type="text" placeholder="搜索IP、用户名、接口、详情" @keyup.enter="loadCurrentTab">
        </div>
        <button class="btn" @click="loadCurrentTab">搜索</button>
      </div>

      <div v-if="activeTab === 'banned'" class="toolbar ban-toolbar">
        <input v-model.trim="banForm.userId" type="number" placeholder="用户ID">
        <input v-model.trim="banForm.ipAddress" type="text" placeholder="IP地址">
        <input v-model.trim="banForm.reason" type="text" placeholder="封禁原因">
        <input v-model.trim="banForm.expiresAt" type="datetime-local" placeholder="解封时间">
        <button class="btn primary" @click="handleBan">添加封禁</button>
      </div>

      <div v-if="loading" class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <span>加载中...</span>
      </div>

      <div v-else-if="items.length === 0" class="empty-state">
        <i class="fas fa-file-alt"></i>
        <span>暂无数据</span>
      </div>

      <div v-else class="logs-list">
        <div v-for="item in items" :key="getItemKey(item)" class="log-item">
          <div class="log-header">
            <div class="log-icon" :class="getItemClass(item)">
              <i :class="getItemIcon(item)"></i>
            </div>
            <div class="log-info">
              <span class="log-action">{{ getItemTitle(item) }}</span>
              <span class="log-time">{{ formatTime(getItemTime(item)) }}</span>
            </div>
            <button v-if="activeTab === 'banned'" class="small-btn success" @click="handleUnban(item)">解封</button>
          </div>
          <div class="log-details">
            <template v-if="activeTab === 'audit'">
              <p><strong>操作人：</strong>{{ item.username || item.actor || '管理员' }}</p>
              <p><strong>详情：</strong>{{ getDetailsText(item) }}</p>
              <p v-if="item.ip_address"><strong>IP地址：</strong>{{ item.ip_address }}</p>
            </template>
            <template v-else-if="activeTab === 'ip'">
              <p><strong>用户：</strong>{{ item.nickname || item.username || '未知' }}</p>
              <p><strong>IP地址：</strong>{{ item.ip_address }}</p>
              <p><strong>操作：</strong>{{ item.action || '未知' }}</p>
            </template>
            <template v-else-if="activeTab === 'api'">
              <p><strong>用户：</strong>{{ item.nickname || item.username || '未知' }}</p>
              <p><strong>接口：</strong>{{ item.request_method }} {{ item.api_path }}</p>
              <p><strong>IP地址：</strong>{{ item.ip_address || '未知' }}</p>
            </template>
            <template v-else>
              <p><strong>目标：</strong>{{ item.ip_address || `用户 ${item.user_id}` }}</p>
              <p><strong>用户：</strong>{{ item.nickname || item.username || '未知' }}</p>
              <p><strong>原因：</strong>{{ item.reason || '未填写' }}</p>
              <p><strong>状态：</strong>{{ item.status }}</p>
            </template>
          </div>
        </div>
      </div>

      <div v-if="!loading && items.length > 0 && activeTab !== 'ip' && activeTab !== 'banned'" class="pagination">
        <button class="page-btn" :disabled="currentPage === 1" @click="prevPage"><i class="fas fa-chevron-left"></i></button>
        <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
        <button class="page-btn" :disabled="currentPage >= totalPages" @click="nextPage"><i class="fas fa-chevron-right"></i></button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getAuditLogs, getAuditActions, getLoginIPs, getApiLogs, getBannedList, banIP, unbanIP } from '@/utils/adminApi';
import toast from '@/utils/toast';

const tabs = [
  { key: 'audit', label: '审计日志' },
  { key: 'ip', label: 'IP日志' },
  { key: 'api', label: 'API日志' },
  { key: 'banned', label: '封禁列表' }
];

const activeTab = ref('audit');
const filterAction = ref('');
const searchText = ref('');
const items = ref([]);
const actions = ref([]);
const loading = ref(true);
const currentPage = ref(1);
const totalPages = ref(1);
const banForm = ref({ userId: '', ipAddress: '', reason: '', expiresAt: '' });

onMounted(async () => {
  await loadActions();
  await loadCurrentTab();
});

async function loadActions() {
  try {
    const data = await getAuditActions();
    actions.value = data.actions || [];
  } catch {
    actions.value = [];
  }
}

function switchTab(tab) {
  activeTab.value = tab;
  currentPage.value = 1;
  loadCurrentTab();
}

async function loadCurrentTab() {
  loading.value = true;
  try {
    if (activeTab.value === 'audit') {
      const data = await getAuditLogs(currentPage.value, 20, filterAction.value, searchText.value);
      items.value = data.logs || [];
      totalPages.value = data.pagination?.totalPages || 1;
    } else if (activeTab.value === 'ip') {
      const data = await getLoginIPs();
      const keyword = searchText.value.trim();
      const list = data.loginIPs || [];
      items.value = keyword
        ? list.filter(item => {
            const text = `${item.ip_address || ''} ${item.username || ''} ${item.nickname || ''} ${item.action || ''}`;
            return text.includes(keyword);
          })
        : list;
      totalPages.value = 1;
    } else if (activeTab.value === 'api') {
      const data = await getApiLogs(currentPage.value, 50);
      const keyword = searchText.value.trim();
      const list = data.apiLogs || [];
      items.value = keyword
        ? list.filter(item => {
            const text = `${item.ip_address || ''} ${item.username || ''} ${item.nickname || ''} ${item.api_path || ''}`;
            return text.includes(keyword);
          })
        : list;
      totalPages.value = data.pagination?.totalPages || 1;
    } else {
      const data = await getBannedList();
      const keyword = searchText.value.trim();
      const list = data.bannedList || [];
      items.value = keyword
        ? list.filter(item => {
            const text = `${item.ip_address || ''} ${item.username || ''} ${item.nickname || ''} ${item.reason || ''}`;
            return text.includes(keyword);
          })
        : list;
      totalPages.value = 1;
    }
  } catch (error) {
    toast.error(error.message);
    items.value = [];
  } finally {
    loading.value = false;
  }
}

async function handleBan() {
  if (!banForm.value.userId && !banForm.value.ipAddress) {
    toast.error('请至少填写用户ID或IP地址');
    return;
  }
  try {
    await banIP(banForm.value.ipAddress || null, banForm.value.userId ? Number(banForm.value.userId) : null, banForm.value.reason || '', banForm.value.expiresAt || null);
    toast.success('已添加封禁');
    banForm.value = { userId: '', ipAddress: '', reason: '', expiresAt: '' };
    await loadCurrentTab();
  } catch (error) {
    toast.error(error.message);
  }
}

async function handleUnban(item) {
  try {
    await unbanIP(item.ip_address || null, item.user_id || null);
    toast.success('已解封');
    await loadCurrentTab();
  } catch (error) {
    toast.error(error.message);
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--;
    loadCurrentTab();
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
    loadCurrentTab();
  }
}

function getItemKey(item) {
  return `${activeTab.value}-${item.id || item.timestamp || item.ip_address}`;
}

function getItemTime(item) {
  return item.timestamp || item.banned_at || item.created_at;
}

function getItemTitle(item) {
  if (activeTab.value === 'audit') return getActionLabel(item.action);
  if (activeTab.value === 'ip') return item.action === 'register' ? '注册IP' : '登录IP';
  if (activeTab.value === 'api') return item.api_path || 'API请求';
  return item.status || '封禁中';
}

function getItemIcon(item) {
  if (activeTab.value === 'banned') return 'fas fa-ban';
  if (activeTab.value === 'ip') return 'fas fa-network-wired';
  if (activeTab.value === 'api') return 'fas fa-route';
  return getActionIcon(item.action);
}

function getItemClass(item) {
  if (activeTab.value === 'banned') return 'danger';
  if (activeTab.value === 'ip') return 'info';
  if (activeTab.value === 'api') return 'default';
  return getActionClass(item.action);
}

function getActionLabel(action) {
  const labelMap = {
    login: '登录', logout: '退出', ban: '封禁', unban: '解封', kick_user: '踢下线',
    kick_member: '踢出群组', mute_member: '禁言', create_group: '创建群组', dissolve_group: '解散群组',
    delete_message: '删除消息', upload_file: '上传文件', delete_file: '删除文件', admin_login: '管理员登录',
    admin_login_failed: '管理员登录失败', create_admin_account: '创建管理员', update_admin_account: '更新管理员', delete_admin_account: '删除管理员'
  };
  return labelMap[action] || action;
}

function getActionIcon(action) {
  const iconMap = {
    login: 'fas fa-sign-in-alt', logout: 'fas fa-sign-out-alt', ban: 'fas fa-ban', unban: 'fas fa-unlock',
    kick_user: 'fas fa-user-minus', kick_member: 'fas fa-user-minus', mute_member: 'fas fa-microphone-slash',
    create_group: 'fas fa-users', dissolve_group: 'fas fa-trash', delete_message: 'fas fa-trash', upload_file: 'fas fa-upload',
    delete_file: 'fas fa-trash', admin_login: 'fas fa-user-shield', admin_login_failed: 'fas fa-triangle-exclamation'
  };
  return iconMap[action] || 'fas fa-activity';
}

function getActionClass(action) {
  const classMap = {
    login: 'success', logout: 'info', ban: 'danger', unban: 'success', kick_user: 'warning', kick_member: 'warning',
    mute_member: 'warning', create_group: 'success', dissolve_group: 'danger', delete_message: 'danger', upload_file: 'info',
    delete_file: 'danger', admin_login: 'success', admin_login_failed: 'danger'
  };
  return classMap[action] || 'default';
}

function getDetailsText(log) {
  if (!log.details) return '无详细信息';
  try {
    const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
    return Object.entries(details).map(([key, value]) => `${key}: ${value}`).join(', ') || '无详细信息';
  } catch {
    return log.details;
  }
}

function formatTime(dateString) {
  if (!dateString) return '未知';
  return new Date(dateString).toLocaleString('zh-CN');
}
</script>

<style scoped>
.admin-page-container { height: 100%; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; }
.page-header h2 { margin: 0; font-size: 18px; font-weight: 600; color: #f0f6fc; }
.header-actions, .toolbar { display: flex; gap: 12px; flex-wrap: wrap; }
.toolbar { margin-bottom: 16px; }
.search-box { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #21262d; border: 1px solid #30363d; border-radius: 8px; color: #8b949e; }
.search-box input { background: transparent; border: 0; color: #c9d1d9; outline: none; min-width: 220px; }
.tab-btn, .filter-select, .page-btn, .small-btn, .btn { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
.tab-btn.active { background: #1f6feb; border-color: #388bfd; color: #fff; }
.btn.primary { background: #1f6feb; border-color: #388bfd; color: #fff; }
.small-btn.success { color: #3fb950; border-color: #238636; }
.ban-toolbar input { background: #21262d; border: 1px solid #30363d; border-radius: 8px; color: #c9d1d9; padding: 8px 12px; outline: none; }
.page-content { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 16px; }
.loading-state, .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 220px; color: #8b949e; }
.logs-list { display: flex; flex-direction: column; gap: 12px; }
.log-item { background: #0d1117; border: 1px solid #30363d; border-radius: 10px; padding: 14px; }
.log-header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.log-icon { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #21262d; color: #8b949e; }
.log-icon.success { background: rgba(35, 134, 54, .2); color: #3fb950; }
.log-icon.danger { background: rgba(248, 81, 73, .2); color: #f85149; }
.log-icon.warning { background: rgba(210, 153, 34, .2); color: #d29922; }
.log-icon.info { background: rgba(56, 139, 253, .2); color: #58a6ff; }
.log-info { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.log-action { color: #f0f6fc; font-weight: 600; }
.log-time, .log-details { color: #8b949e; font-size: 13px; }
.log-details p { margin: 6px 0; word-break: break-word; }
.log-details strong { color: #c9d1d9; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 16px; }
.page-btn:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 900px) { .page-header, .toolbar { flex-direction: column; align-items: stretch; } .search-box input { min-width: 0; width: 100%; } }
</style>
