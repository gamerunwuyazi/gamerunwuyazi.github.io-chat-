<template>
  <div class="admin-page-container">
    <div class="page-header">
      <h2>后台账号</h2>
      <form class="create-form" @submit.prevent="handleCreate">
        <input v-model.trim="newUsername" type="text" placeholder="用户名" autocomplete="off">
        <input v-model="newPassword" type="password" placeholder="密码" autocomplete="new-password">
        <button class="btn primary" type="submit">新增管理员</button>
      </form>
    </div>

    <div class="page-content">
      <div v-if="loading" class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <span>加载中...</span>
      </div>
      <div v-else-if="accounts.length === 0" class="empty-state">
        <i class="fas fa-user-shield"></i>
        <span>暂无管理员账号</span>
      </div>
      <div v-else class="account-list">
        <div v-for="account in accounts" :key="account.id" class="account-card">
          <div class="account-main">
            <div class="account-icon"><i class="fas fa-user-shield"></i></div>
            <div>
              <div class="account-name">{{ account.username }}</div>
              <div class="account-meta">
                创建：{{ formatTime(account.createdAt) }} · 最后登录：{{ formatTime(account.lastLoginAt) }}
              </div>
            </div>
          </div>
          <div class="account-actions">
            <span :class="['status-badge', account.isEnabled ? 'enabled' : 'disabled']">
              {{ account.isEnabled ? '已启用' : '已停用' }}
            </span>
            <button class="btn" @click="handleToggle(account)">{{ account.isEnabled ? '停用' : '启用' }}</button>
            <button class="btn" @click="openPasswordModal(account)">改密</button>
            <button class="btn danger" @click="handleDelete(account)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="passwordAccount" class="modal-overlay" @click.self="closePasswordModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>修改 {{ passwordAccount.username }} 的密码</h3>
          <button class="close-btn" @click="closePasswordModal"><i class="fas fa-times"></i></button>
        </div>
        <form class="modal-body" @submit.prevent="handleUpdatePassword">
          <input v-model="passwordValue" type="password" placeholder="新密码" autocomplete="new-password">
          <div class="modal-footer">
            <button class="btn" type="button" @click="closePasswordModal">取消</button>
            <button class="btn primary" type="submit">保存</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getAdminAccounts, createAdminAccount, updateAdminAccount, deleteAdminAccount } from '@/utils/adminApi';
import toast from '@/utils/toast';

const accounts = ref([]);
const loading = ref(true);
const newUsername = ref('');
const newPassword = ref('');
const passwordAccount = ref(null);
const passwordValue = ref('');

onMounted(loadAccounts);

async function loadAccounts() {
  loading.value = true;
  try {
    const data = await getAdminAccounts();
    accounts.value = data.accounts || [];
  } catch (error) {
    toast.error(error.message);
    accounts.value = [];
  } finally {
    loading.value = false;
  }
}

async function handleCreate() {
  if (!newUsername.value || !newPassword.value) {
    toast.error('请输入用户名和密码');
    return;
  }
  try {
    await createAdminAccount(newUsername.value, newPassword.value);
    toast.success('管理员账号已创建');
    newUsername.value = '';
    newPassword.value = '';
    await loadAccounts();
  } catch (error) {
    toast.error(error.message);
  }
}

async function handleToggle(account) {
  try {
    await updateAdminAccount(account.id, { isEnabled: !account.isEnabled });
    toast.success('账号状态已更新');
    await loadAccounts();
  } catch (error) {
    toast.error(error.message);
  }
}

function openPasswordModal(account) {
  passwordAccount.value = account;
  passwordValue.value = '';
}

function closePasswordModal() {
  passwordAccount.value = null;
  passwordValue.value = '';
}

async function handleUpdatePassword() {
  if (!passwordValue.value) {
    toast.error('请输入新密码');
    return;
  }
  try {
    await updateAdminAccount(passwordAccount.value.id, { password: passwordValue.value });
    toast.success('密码已更新');
    closePasswordModal();
  } catch (error) {
    toast.error(error.message);
  }
}

async function handleDelete(account) {
  if (!confirm(`确定删除管理员账号 ${account.username} 吗？`)) return;
  try {
    await deleteAdminAccount(account.id);
    toast.success('管理员账号已删除');
    await loadAccounts();
  } catch (error) {
    toast.error(error.message);
  }
}

function formatTime(value) {
  if (!value) return '从未';
  return new Date(value).toLocaleString('zh-CN');
}
</script>

<style scoped>
.admin-page-container { height: 100%; }
.page-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 16px; }
.page-header h2 { margin: 0; font-size: 18px; font-weight: 600; color: #f0f6fc; }
.create-form { display: flex; gap: 10px; flex-wrap: wrap; }
input { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; border-radius: 8px; padding: 9px 12px; outline: none; }
input:focus { border-color: #388bfd; }
.page-content { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 16px; }
.loading-state, .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 220px; color: #8b949e; }
.account-list { display: flex; flex-direction: column; gap: 12px; }
.account-card { display: flex; justify-content: space-between; align-items: center; gap: 16px; background: #0d1117; border: 1px solid #30363d; border-radius: 10px; padding: 14px; }
.account-main { display: flex; align-items: center; gap: 12px; min-width: 0; }
.account-icon { width: 40px; height: 40px; border-radius: 50%; background: rgba(56, 139, 253, .16); color: #58a6ff; display: flex; align-items: center; justify-content: center; }
.account-name { color: #f0f6fc; font-weight: 600; margin-bottom: 4px; }
.account-meta { color: #8b949e; font-size: 13px; }
.account-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.status-badge { padding: 4px 8px; border-radius: 999px; font-size: 12px; }
.status-badge.enabled { color: #3fb950; background: rgba(35, 134, 54, .16); }
.status-badge.disabled { color: #f85149; background: rgba(248, 81, 73, .16); }
.btn { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
.btn.primary { background: #1f6feb; border-color: #388bfd; color: #fff; }
.btn.danger { color: #f85149; border-color: #da3633; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, .65); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-content { width: min(420px, 92vw); background: #161b22; border: 1px solid #30363d; border-radius: 12px; color: #c9d1d9; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid #30363d; }
.modal-header h3 { margin: 0; color: #f0f6fc; font-size: 16px; }
.close-btn { background: transparent; border: 0; color: #8b949e; cursor: pointer; }
.modal-body { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 10px; }
@media (max-width: 720px) { .page-header, .account-card { flex-direction: column; align-items: stretch; } }
</style>
