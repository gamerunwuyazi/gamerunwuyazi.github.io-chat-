<template>
  <div class="admin-page-container">
    <div class="page-header">
      <h2>群组管理</h2>
      <div class="header-actions">
        <div class="search-box">
          <i class="fas fa-search"></i>
          <input type="text" v-model="searchQuery" placeholder="搜索群组名称" @keyup.enter="loadGroups">
        </div>
      </div>
    </div>

    <div class="page-content">
      <div v-if="loading" class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <span>加载中...</span>
      </div>

      <div v-else-if="groups.length === 0" class="empty-state">
        <i class="fas fa-users"></i>
        <span>暂无数据</span>
      </div>

      <div v-else class="group-grid">
        <div v-for="group in groups" :key="group.id" class="group-card">
          <div class="group-header">
            <img 
              :src="getAdminResourceUrl(group.avatarUrl, '/icon/User-Group-256.ico')" 
              alt="群组头像" 
              class="group-avatar"
            >
            <div class="group-info">
              <h3 class="group-name">{{ group.name }}</h3>
              <p class="group-creator">创建者: {{ group.creatorNickname }}</p>
            </div>
          </div>
          
          <p class="group-description">{{ group.description || '暂无描述' }}</p>
          
          <div class="group-stats">
            <div class="stat-item">
              <span class="stat-value">{{ group.memberCount || 0 }}</span>
              <span class="stat-label">成员</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ group.messageCount || 0 }}</span>
              <span class="stat-label">消息</span>
            </div>
          </div>

          <div class="group-actions">
            <button class="action-btn detail-btn" @click="showGroupDetail(group)">
              <i class="fas fa-eye"></i>
              <span>详情</span>
            </button>
            <button class="action-btn danger-btn" @click="showConfirmModal('dissolve', group)">
              <i class="fas fa-trash"></i>
              <span>解散</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="!loading && groups.length > 0" class="pagination">
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
      <div class="modal-content detail-modal">
        <div class="modal-header">
          <h3>群组详情</h3>
          <button class="close-btn" @click="closeDetailModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div v-if="selectedGroup" class="modal-body">
          <div class="detail-header">
            <div class="detail-avatar-wrap">
              <img v-if="getAvatarUrl(selectedGroup)" :src="getAvatarUrl(selectedGroup)" alt="群组头像" class="detail-avatar">
              <div v-else class="group-avatar-fallback detail-avatar-fallback">{{ getAvatarInitial(selectedGroup.name) }}</div>
            </div>
            <div class="detail-info">
              <h2>{{ selectedGroup.name }}</h2>
              <p>创建者: {{ selectedGroup.creatorNickname }}</p>
              <p>创建时间: {{ formatTime(selectedGroup.createdAt) }}</p>
              <p>成员数: {{ selectedGroup.memberCount }} | 消息数: {{ selectedGroup.messageCount }}</p>
            </div>
          </div>

          <div class="description-section">
            <h4>群组描述</h4>
            <p>{{ selectedGroup.description || '暂无描述' }}</p>
          </div>

          <div class="members-section">
            <h4>成员列表</h4>
            <div class="members-list">
              <div 
                v-for="member in selectedGroup.members" 
                :key="member.id" 
                class="member-item"
              >
                <img 
                  :src="getAdminResourceUrl(member.avatarUrl)" 
                  alt="头像" 
                  class="member-avatar"
                >
                <div class="member-info">
                  <p class="member-name">
                    {{ member.nickname }}
                    <span v-if="member.isAdmin" class="admin-badge">管理员</span>
                    <span v-if="member.isMuted" class="muted-badge">已禁言</span>
                  </p>
                  <p class="member-join">加入于 {{ formatTime(member.joinedAt) }}</p>
                </div>
                <div class="member-actions">
                  <button 
                    v-if="!member.isAdmin" 
                    class="mini-btn" 
                    :class="member.isMuted ? 'success-btn' : 'warning-btn'"
                    @click="showMemberActionModal(member.isMuted ? 'unmute' : 'mute', member)"
                  >
                    <i :class="member.isMuted ? 'fas fa-unlock' : 'fas fa-microphone-slash'"></i>
                  </button>
                  <button 
                    v-if="!member.isAdmin" 
                    class="mini-btn danger-btn" 
                    @click="showMemberActionModal('kick', member)"
                  >
                    <i class="fas fa-user-minus"></i>
                  </button>
                </div>
              </div>
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
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeConfirmModal">取消</button>
          <button 
            class="btn btn-danger"
            @click="executeAction"
          >
            {{ confirmActionText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { getGroups, getGroupDetail, dissolveGroup, muteGroupMember, kickGroupMember, getAdminResourceUrl } from '@/utils/adminApi';
import toast from '@/utils/toast';

const searchQuery = ref('');
const groups = ref([]);
const loading = ref(true);
const currentPage = ref(1);
const totalPages = ref(1);

const showDetailModal = ref(false);
const selectedGroup = ref(null);

const showConfirmModalFlag = ref(false);
const confirmType = ref('');
const confirmTarget = ref(null);
const confirmTitle = ref('');
const confirmMessage = ref('');
const confirmActionText = ref('');

onMounted(async () => {
  await loadGroups();
});

watch(searchQuery, () => {
  currentPage.value = 1;
  loadGroups();
});

async function loadGroups() {
  loading.value = true;
  try {
    const data = await getGroups(currentPage.value, 20, searchQuery.value);
    groups.value = data.groups || [];
    totalPages.value = data.pagination?.totalPages || 1;
  } catch (error) {
    toast.error(error.message);
    groups.value = [];
  } finally {
    loading.value = false;
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--;
    loadGroups();
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
    loadGroups();
  }
}

async function showGroupDetail(group) {
  loading.value = true;
  try {
    const data = await getGroupDetail(group.id);
    selectedGroup.value = data.group;
    showDetailModal.value = true;
  } catch (error) {
    toast.error(error.message);
  } finally {
    loading.value = false;
  }
}

function closeDetailModal() {
  showDetailModal.value = false;
  selectedGroup.value = null;
}

function showConfirmModal(type, target) {
  confirmType.value = type;
  confirmTarget.value = target;
  
  if (type === 'dissolve') {
    confirmTitle.value = '确认解散群组';
    confirmMessage.value = `确定要解散群组 "${target.name}" 吗？此操作将删除该群组及其所有成员关系，无法撤销。`;
    confirmActionText.value = '确认解散';
  }
  
  showConfirmModalFlag.value = true;
}

function showMemberActionModal(type, member) {
  confirmType.value = type;
  confirmTarget.value = { member, group: selectedGroup.value };
  
  if (type === 'mute') {
    confirmTitle.value = '确认禁言';
    confirmMessage.value = `确定要禁言成员 "${member.nickname}" 吗？`;
    confirmActionText.value = '确认禁言';
  } else if (type === 'unmute') {
    confirmTitle.value = '确认解除禁言';
    confirmMessage.value = `确定要解除 "${member.nickname}" 的禁言吗？`;
    confirmActionText.value = '确认解除';
  } else if (type === 'kick') {
    confirmTitle.value = '确认踢人';
    confirmMessage.value = `确定要将 "${member.nickname}" 踢出群组吗？`;
    confirmActionText.value = '确认踢出';
  }
  
  showConfirmModalFlag.value = true;
}

function closeConfirmModal() {
  showConfirmModalFlag.value = false;
  confirmType.value = '';
  confirmTarget.value = null;
}

async function executeAction() {
  try {
    if (confirmType.value === 'dissolve') {
      await dissolveGroup(confirmTarget.value.id);
      toast.success('群组已解散');
      await loadGroups();
    } else if (confirmType.value === 'mute') {
      await muteGroupMember(confirmTarget.value.group.id, confirmTarget.value.member.id, 0);
      toast.success('成员已被禁言');
      await refreshGroupDetail();
    } else if (confirmType.value === 'unmute') {
      await muteGroupMember(confirmTarget.value.group.id, confirmTarget.value.member.id, null);
      toast.success('禁言已解除');
      await refreshGroupDetail();
    } else if (confirmType.value === 'kick') {
      await kickGroupMember(confirmTarget.value.group.id, confirmTarget.value.member.id);
      toast.success('成员已被踢出');
      await refreshGroupDetail();
    }
  } catch (error) {
    toast.error(error.message);
  } finally {
    closeConfirmModal();
  }
}

async function refreshGroupDetail() {
  if (selectedGroup.value) {
    const data = await getGroupDetail(selectedGroup.value.id);
    selectedGroup.value = data.group;
  }
}

function getAvatarUrl(entity) {
  const url = entity?.avatarUrl || entity?.avatar_url || entity?.avatar || '';
  return url ? getAdminResourceUrl(url) : '';
}

function getAvatarInitial(name) {
  return (name || 'G').trim().charAt(0).toUpperCase();
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

.group-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.group-card {
  background: #21262d;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid #30363d;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.group-avatar {
  width: 50px;
  height: 50px;
  border-radius: 8px;
  object-fit: cover;
}

.group-info h3 {
  margin: 0 0 4px 0;
  color: #f0f6fc;
  font-size: 16px;
}

.group-info p {
  margin: 0;
  color: #6e7681;
  font-size: 13px;
}

.group-description {
  margin: 0 0 12px 0;
  color: #8b949e;
  font-size: 14px;
  line-height: 1.5;
}

.group-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: #f0f6fc;
}

.stat-label {
  font-size: 12px;
  color: #6e7681;
}

.group-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 6px;
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.detail-btn {
  background: rgba(56, 139, 253, 0.15);
  color: #58a6ff;
}

.detail-btn:hover {
  background: rgba(56, 139, 253, 0.25);
}

.danger-btn {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.danger-btn:hover {
  background: rgba(248, 81, 73, 0.25);
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
  max-width: 700px;
  max-height: 80vh;
  overflow: hidden;
}

.detail-modal {
  max-width: 800px;
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
  max-height: 500px;
  overflow-y: auto;
}

.detail-header {
  display: flex;
  gap: 20px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #30363d;
}

.detail-avatar-wrap {
  width: 80px;
  height: 80px;
}

.detail-avatar {
  width: 80px;
  height: 80px;
  border-radius: 12px;
  object-fit: cover;
}

.detail-avatar-fallback {
  width: 80px;
  height: 80px;
  border-radius: 12px;
  font-size: 24px;
}

.detail-info h2 {
  margin: 0 0 8px 0;
  color: #f0f6fc;
}

.detail-info p {
  margin: 4px 0;
  color: #8b949e;
  font-size: 14px;
}

.description-section {
  margin-bottom: 24px;
}

.description-section h4 {
  margin: 0 0 8px 0;
  color: #c9d1d9;
}

.description-section p {
  margin: 0;
  color: #8b949e;
  line-height: 1.5;
}

.members-section h4 {
  margin: 0 0 12px 0;
  color: #c9d1d9;
}

.members-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #21262d;
  border-radius: 8px;
}

.member-avatar-wrap {
  width: 40px;
  height: 40px;
}

.member-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.member-avatar-fallback {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 16px;
}

.member-info {
  flex: 1;
}

.member-name {
  margin: 0 0 4px 0;
  color: #f0f6fc;
  font-size: 14px;
}

.member-join {
  margin: 0;
  color: #6e7681;
  font-size: 12px;
}

.admin-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  background: rgba(56, 139, 253, 0.2);
  color: #58a6ff;
  font-size: 11px;
  border-radius: 10px;
}

.muted-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  background: rgba(248, 81, 73, 0.2);
  color: #f85149;
  font-size: 11px;
  border-radius: 10px;
}

.member-actions {
  display: flex;
  gap: 6px;
}

.mini-btn {
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

.mini-btn.warning-btn {
  background: rgba(210, 153, 34, 0.15);
  color: #d29922;
}

.mini-btn.warning-btn:hover {
  background: rgba(210, 153, 34, 0.25);
}

.mini-btn.success-btn {
  background: rgba(46, 160, 67, 0.15);
  color: #3fb950;
}

.mini-btn.success-btn:hover {
  background: rgba(46, 160, 67, 0.25);
}

.mini-btn.danger-btn {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.mini-btn.danger-btn:hover {
  background: rgba(248, 81, 73, 0.25);
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
</style>