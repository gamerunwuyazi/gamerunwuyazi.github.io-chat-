<template>
  <div class="admin-page-container">
    <div class="page-header">
      <h2>消息管理</h2>
      <div class="header-actions">
        <div class="search-box">
          <i class="fas fa-search"></i>
          <input type="text" v-model="searchQuery" placeholder="搜索消息内容" @keyup.enter="loadMessages">
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
      </button>
    </div>

    <div class="page-content">
      <div v-if="loading" class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <span>加载中...</span>
      </div>

      <div v-else-if="messages.length === 0" class="empty-state">
        <i class="fas fa-message"></i>
        <span>暂无数据</span>
      </div>

      <div v-else class="message-list">
        <div v-for="message in messages" :key="message.id" class="message-item">
          <div class="message-header">
            <div class="message-author">
              <img 
                :src="getAvatar(message)" 
                alt="头像" 
                class="author-avatar"
              >
              <div class="author-info">
                <span class="author-name">{{ getAuthorName(message) }}</span>
                <span class="message-time">{{ formatTime(message.timestamp) }}</span>
              </div>
            </div>
            <div class="message-type">
              <span :class="['type-badge', getTypeClass(message)]">{{ getTypeLabel(message) }}</span>
            </div>
          </div>
          
          <div class="message-content">
            <p :class="{ 'encrypted': message.isEncrypted }">
              {{ message.content }}
            </p>
          </div>

          <div class="message-footer">
            <span class="message-id">消息ID: {{ message.id }}</span>
            <button class="delete-btn" @click="showConfirmModal(message)">
              <i class="fas fa-trash"></i>
              <span>删除</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="!loading && messages.length > 0" class="pagination">
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

    <div v-if="showConfirmModalFlag" class="modal-overlay" @click.self="closeConfirmModal">
      <div class="modal-content confirm-modal">
        <div class="modal-header">
          <h3>确认删除消息</h3>
          <button class="close-btn" @click="closeConfirmModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <p>确定要删除这条消息吗？此操作无法撤销。</p>
          <div class="preview-content">
            <p><strong>消息内容：</strong></p>
            <p>{{ selectedMessage?.content || '无法预览' }}</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeConfirmModal">取消</button>
          <button class="btn btn-danger" @click="deleteMessage">
            确认删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { getMessages, getPrivateMessages, deleteMessage as apiDeleteMessage, getAdminResourceUrl } from '@/utils/adminApi';
import toast from '@/utils/toast';

const searchQuery = ref('');
const activeTab = ref('public');
const messages = ref([]);
const loading = ref(true);
const currentPage = ref(1);
const totalPages = ref(1);

const showConfirmModalFlag = ref(false);
const selectedMessage = ref(null);

const tabs = [
  { key: 'public', label: '公共消息' },
  { key: 'group', label: '群聊消息' },
  { key: 'private', label: '私聊消息' }
];

onMounted(async () => {
  await loadMessages();
});

let loadSeq = 0;

watch([searchQuery, activeTab], () => {
  currentPage.value = 1;
  loadMessages();
});

function normalizeMessagesResponse(data) {
  const payload = data?.data || data || {};
  return {
    messages: payload.messages || payload.list || payload.records || [],
    pagination: payload.pagination || payload.page || {}
  };
}

async function loadMessages() {
  const seq = ++loadSeq;
  loading.value = true;
  try {
    let data;
    if (activeTab.value === 'private') {
      data = await getPrivateMessages(currentPage.value, 20, searchQuery.value);
    } else {
      const type = activeTab.value === 'public' ? 'public' : 'group';
      data = await getMessages(currentPage.value, 20, type, searchQuery.value);
    }
    if (seq !== loadSeq) return;
    const normalized = normalizeMessagesResponse(data);
    messages.value = normalized.messages;
    totalPages.value = normalized.pagination?.totalPages || normalized.pagination?.pages || 1;
  } catch (error) {
    if (seq !== loadSeq) return;
    toast.error(error.message);
    messages.value = [];
  } finally {
    if (seq === loadSeq) {
      loading.value = false;
    }
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--;
    loadMessages();
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
    loadMessages();
  }
}

function getAvatar(message) {
  const avatarUrl = message.source === 'private' ? message.senderAvatarUrl : message.avatarUrl;
  return getAdminResourceUrl(avatarUrl);
}

function getAuthorName(message) {
  if (message.source === 'private') {
    return `${message.senderNickname} -> ${message.receiverNickname}`;
  }
  return message.nickname || '未知用户';
}

function getTypeLabel(message) {
  if (message.source === 'private') return '私聊';
  if (message.groupId) return '群聊';
  return '公共';
}

function getTypeClass(message) {
  if (message.source === 'private') return 'private';
  if (message.groupId) return 'group';
  return 'public';
}

function showConfirmModal(message) {
  selectedMessage.value = message;
  showConfirmModalFlag.value = true;
}

function closeConfirmModal() {
  showConfirmModalFlag.value = false;
  selectedMessage.value = null;
}

async function deleteMessage() {
  if (!selectedMessage.value) return;
  
  try {
    await apiDeleteMessage(selectedMessage.value.id);
    toast.success('消息已删除');
    await loadMessages();
  } catch (error) {
    toast.error(error.message);
  } finally {
    closeConfirmModal();
  }
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

.message-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-item {
  background: #21262d;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid #30363d;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.message-author {
  display: flex;
  align-items: center;
  gap: 12px;
}

.author-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.author-info {
  display: flex;
  flex-direction: column;
}

.author-name {
  color: #f0f6fc;
  font-weight: 500;
  font-size: 14px;
}

.message-time {
  color: #6e7681;
  font-size: 12px;
}

.type-badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.type-badge.public {
  background: rgba(56, 139, 253, 0.15);
  color: #58a6ff;
}

.type-badge.group {
  background: rgba(210, 153, 34, 0.15);
  color: #d29922;
}

.type-badge.private {
  background: rgba(163, 113, 247, 0.15);
  color: #a371f7;
}

.message-content p {
  margin: 0;
  color: #c9d1d9;
  line-height: 1.6;
  word-break: break-all;
}

.message-content p.encrypted {
  color: #f85149;
  font-style: italic;
}

.message-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #30363d;
}

.message-id {
  color: #6e7681;
  font-size: 12px;
}

.delete-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(248, 81, 73, 0.15);
  border: 1px solid rgba(248, 81, 73, 0.3);
  border-radius: 6px;
  color: #f85149;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.delete-btn:hover {
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
  max-width: 500px;
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
}

.modal-body p {
  color: #c9d1d9;
  margin: 0 0 16px 0;
}

.preview-content {
  background: #21262d;
  border-radius: 8px;
  padding: 12px;
}

.preview-content p {
  margin: 0;
}

.preview-content p:first-child {
  margin-bottom: 8px;
  color: #8b949e;
  font-size: 13px;
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