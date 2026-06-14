<template>
  <div class="admin-login-container">
    <div class="admin-login-form">
      <div class="login-header">
        <div class="logo-icon">
          <i class="fas fa-shield-alt"></i>
        </div>
        <h1>管理面板</h1>
        <p>请登录管理员账号</p>
      </div>
      
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="username">用户名</label>
          <input 
            type="text" 
            id="username" 
            v-model="formData.username" 
            placeholder="请输入管理员用户名"
            required
          >
        </div>
        <div class="form-group">
          <label for="password">密码</label>
          <input 
            type="password" 
            id="password" 
            v-model="formData.password" 
            placeholder="请输入管理员密码"
            required
          >
        </div>
        <button type="submit" :disabled="isSubmitting" class="login-btn">
          <span v-if="isSubmitting" class="btn-loading">
            <i class="fas fa-spinner fa-spin"></i>
            登录中...
          </span>
          <span v-else>登录</span>
        </button>
      </form>
      
      <div v-if="message" :class="['message', messageType]">
        {{ message }}
      </div>
      
      <div class="login-footer">
        <router-link to="/login">返回用户登录</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useAdminStore } from '@/stores/adminStore';
import { adminLogin } from '@/utils/adminApi';

const formData = reactive({
  username: '',
  password: ''
});

const isSubmitting = ref(false);
const message = ref('');
const messageType = ref('error');

const adminStore = useAdminStore();

function showMessage(msg, type) {
  message.value = msg;
  messageType.value = type;
  setTimeout(() => {
    message.value = '';
  }, 5000);
}

async function handleLogin() {
  if (!formData.username || !formData.password) {
    showMessage('请输入用户名和密码', 'error');
    return;
  }
  
  isSubmitting.value = true;
  
  try {
    const response = await adminLogin(formData.username, formData.password);
    
    if (response.success) {
      adminStore.setAdminInfo({
        token: response.token,
        username: response.username
      });
      showMessage('登录成功，正在跳转...', 'success');
      setTimeout(() => {
        window.location.href = '/admin';
      }, 500);
    } else {
      showMessage(response.message || '登录失败', 'error');
    }
  } catch (error) {
    showMessage(error.message || '登录请求失败', 'error');
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped>
.admin-login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e3a5f 0%, #0d1117 100%);
  padding: 20px;
}

.admin-login-form {
  background: #161b22;
  border-radius: 12px;
  padding: 40px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  border: 1px solid #30363d;
}

.login-header {
  text-align: center;
  margin-bottom: 35px;
}

.logo-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  background: linear-gradient(135deg, #388bfd 0%, #58a6ff 100%);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: white;
}

.login-header h1 {
  margin: 0 0 8px 0;
  color: #f0f6fc;
  font-size: 24px;
  font-weight: 600;
}

.login-header p {
  margin: 0;
  color: #8b949e;
  font-size: 14px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #8b949e;
  font-size: 14px;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 12px 15px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  color: #c9d1d9;
  font-size: 14px;
  box-sizing: border-box;
  transition: all 0.2s ease;
}

.form-group input:focus {
  outline: none;
  border-color: #388bfd;
  box-shadow: 0 0 0 3px rgba(56, 139, 253, 0.3);
}

.form-group input::placeholder {
  color: #484f58;
}

.login-btn {
  width: 100%;
  padding: 14px;
  background: #238636;
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 10px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.login-btn:hover:not(:disabled) {
  background: #2ea043;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(46, 160, 67, 0.3);
}

.login-btn:disabled {
  background: #21262d;
  color: #6e7681;
  cursor: not-allowed;
}

.btn-loading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.message {
  margin-top: 16px;
  padding: 12px 15px;
  border-radius: 6px;
  font-size: 14px;
  text-align: center;
}

.message.error {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
  border: 1px solid rgba(248, 81, 73, 0.3);
}

.message.success {
  background: rgba(46, 160, 67, 0.15);
  color: #3fb950;
  border: 1px solid rgba(46, 160, 67, 0.3);
}

.login-footer {
  margin-top: 24px;
  text-align: center;
}

.login-footer a {
  color: #58a6ff;
  text-decoration: none;
  font-size: 14px;
  transition: color 0.2s;
}

.login-footer a:hover {
  color: #79c0ff;
  text-decoration: underline;
}

@media (max-width: 480px) {
  .admin-login-form {
    padding: 30px 20px;
  }
  
  .login-header h1 {
    font-size: 22px;
  }
}
</style>