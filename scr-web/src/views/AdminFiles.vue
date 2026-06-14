<template>
  <div class="admin-page-container">
    <div class="page-header">
      <h2>文件管理</h2>
      <div class="header-actions">
        <div class="search-box">
          <i class="fas fa-search"></i>
          <input type="text" v-model="searchQuery" placeholder="搜索文件名" @keyup.enter="loadFiles">
        </div>
      </div>
    </div>

    <div class="page-content">
      <div v-if="loading" class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <span>加载中...</span>
      </div>

      <div v-else-if="files.length === 0" class="empty-state">
        <i class="fas fa-file"></i>
        <span>暂无数据</span>
      </div>

      <div v-else class="file-grid">
        <div v-for="file in files" :key="file.id" class="file-card">
          <div class="file-icon">
            <i :class="getFileIcon(file.filename)"></i>
          </div>
          <div class="file-info">
            <h3 class="file-name">{{ file.filename }}</h3>
            <p class="file-uploader">上传者: {{ file.nickname }}</p>
            <p class="file-time">{{ formatTime(file.timestamp) }}</p>
          </div>
          <div class="file-actions">
            <button 
              v-if="file.fileUrl" 
              class="action-btn download-btn" 
              :href="file.fileUrl" 
              target="_blank"
            >
              <i class="fas fa-download"></i>
            </button>
            <button class="action-btn delete-btn" @click="showConfirmModal(file)">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>

      <div v-if="!loading && files.length > 0" class="pagination">
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
          <h3>确认删除文件</h3>
          <button class="close-btn" @click="closeConfirmModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <p>确定要删除这个文件吗？此操作无法撤销。</p>
          <div class="file-info-preview">
            <p><strong>文件名：</strong>{{ selectedFile?.filename }}</p>
            <p><strong>上传者：</strong>{{ selectedFile?.nickname }}</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeConfirmModal">取消</button>
          <button class="btn btn-danger" @click="deleteFile">
            确认删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { getFiles, deleteFile as apiDeleteFile } from '@/utils/adminApi';
import toast from '@/utils/toast';

const searchQuery = ref('');
const files = ref([]);
const loading = ref(true);
const currentPage = ref(1);
const totalPages = ref(1);

const showConfirmModalFlag = ref(false);
const selectedFile = ref(null);

const filteredFiles = computed(() => {
  if (!searchQuery.value) return files.value;
  return files.value.filter(file => 
    file.filename.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

onMounted(async () => {
  await loadFiles();
});

async function loadFiles() {
  loading.value = true;
  try {
    const data = await getFiles(currentPage.value, 20);
    files.value = data.files || [];
    totalPages.value = data.pagination?.totalPages || 1;
  } catch (error) {
    toast.error(error.message);
    files.value = [];
  } finally {
    loading.value = false;
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--;
    loadFiles();
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
    loadFiles();
  }
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const iconMap = {
    'pdf': 'fas fa-file-pdf',
    'doc': 'fas fa-file-word',
    'docx': 'fas fa-file-word',
    'xls': 'fas fa-file-excel',
    'xlsx': 'fas fa-file-excel',
    'ppt': 'fas fa-file-powerpoint',
    'pptx': 'fas fa-file-powerpoint',
    'txt': 'fas fa-file-alt',
    'zip': 'fas fa-file-archive',
    'rar': 'fas fa-file-archive',
    '7z': 'fas fa-file-archive',
    'jpg': 'fas fa-file-image',
    'jpeg': 'fas fa-file-image',
    'png': 'fas fa-file-image',
    'gif': 'fas fa-file-image',
    'svg': 'fas fa-file-image',
    'mp4': 'fas fa-file-video',
    'mp3': 'fas fa-file-audio',
    'json': 'fas fa-file-code',
    'js': 'fas fa-file-code',
    'html': 'fas fa-file-code',
    'css': 'fas fa-file-code'
  };
  return iconMap[ext] || 'fas fa-file';
}

function showConfirmModal(file) {
  selectedFile.value = file;
  showConfirmModalFlag.value = true;
}

function closeConfirmModal() {
  showConfirmModalFlag.value = false;
  selectedFile.value = null;
}

async function deleteFile() {
  if (!selectedFile.value) return;
  
  try {
    await apiDeleteFile(selectedFile.value.id);
    toast.success('文件已删除');
    await loadFiles();
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

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.file-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #21262d;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid #30363d;
}

.file-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: rgba(56, 139, 253, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: #58a6ff;
  flex-shrink: 0;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-info h3 {
  margin: 0 0 4px 0;
  color: #f0f6fc;
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-info p {
  margin: 0;
  color: #6e7681;
  font-size: 12px;
}

.file-actions {
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

.download-btn {
  background: rgba(46, 160, 67, 0.15);
  color: #3fb950;
  text-decoration: none;
}

.download-btn:hover {
  background: rgba(46, 160, 67, 0.25);
}

.delete-btn {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
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

.file-info-preview {
  background: #21262d;
  border-radius: 8px;
  padding: 12px;
}

.file-info-preview p {
  margin: 4px 0;
  font-size: 14px;
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