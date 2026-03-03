<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="login-container">
    <!-- 装饰性元素 -->
    <div class="decoration decoration-1"></div>
    <div class="decoration decoration-2"></div>
    <div class="decoration decoration-3"></div>
    
    <div class="login-form">
      <h1>登录聊天室</h1>
      <form @submit.prevent="handleLogin">
        <div class="input-group">
          <label for="username">用户名</label>
          <input 
            type="text" 
            id="username" 
            v-model="username" 
            name="username" 
            required 
            placeholder="请输入用户名"
          >
        </div>
        <div class="input-group">
          <label for="password">密码</label>
          <input 
            type="password" 
            id="password" 
            v-model="password" 
            name="password" 
            required 
            placeholder="请输入密码"
          >
        </div>
        <div class="input-group">
          <label for="captcha">验证码</label>
          <div style="display: flex; gap: 10px; align-items: center;">
            <input 
              type="text" 
              id="captcha" 
              v-model="captchaCode" 
              name="captcha" 
              required 
              placeholder="请输入验证码" 
              style="flex: 1; width: 0;"
            >
            <div 
              v-html="captchaSvg" 
              @click="getCaptcha" 
              style="cursor: pointer; flex-shrink: 0; width: 120px;"
            ></div>
          </div>
        </div>
        <button type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? '登录中...' : '登录' }}
        </button>
      </form>
      <p class="register-link">还没有账号？<router-link to="/register">去注册</router-link></p>
      <div v-if="message" :class="['login-message', messageType]">
        {{ message }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { login } from "@/utils/chat";

// 响应式表单数据
const formData = reactive({
  username: '',
  password: '',
  captchaCode: ''
});

// 解构表单数据以便使用 v-model
const username = ref(formData.username);
const password = ref(formData.password);
const captchaCode = ref(formData.captchaCode);

// UI 状态
const captchaSvg = ref('');
const currentCaptchaId = ref('');
const message = ref('');
const messageType = ref('error');
const isSubmitting = ref(false);

// 同步表单数据到 reactive 对象
function syncFormData() {
  formData.username = username.value;
  formData.password = password.value;
  formData.captchaCode = captchaCode.value;
}

// 获取验证码
async function getCaptcha() {
  try {
    const response = await fetch('https://back.hs.airoe.cn/captcha');
    const data = await response.json();
    if (data.status === 'success') {
      captchaSvg.value = data.captchaSvg;
      currentCaptchaId.value = data.captchaId;
    }
  } catch (error) {
    showMessage('获取验证码失败，请稍后重试', 'error');
  }
}

// 显示消息函数
function showMessage(msg, type) {
  message.value = msg;
  messageType.value = type;
  setTimeout(() => {
    message.value = '';
  }, 5000);
}

// 登录表单提交事件处理
async function handleLogin() {
  syncFormData();
  
  if (!formData.username || !formData.password || !formData.captchaCode) {
    showMessage('请输入用户名、密码和验证码', 'error');
    return;
  }

  isSubmitting.value = true;

  try {
    const response = await fetch('https://back.hs.airoe.cn/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: formData.username,
        password: formData.password,
        captchaId: currentCaptchaId.value,
        captchaCode: formData.captchaCode
      })
    });

    const responseText = await response.text();

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      showMessage('服务器响应格式错误，请稍后重试', 'error');
      isSubmitting.value = false;
      return;
    }

    if (data.success || data.status === 'success' || data.code === 200) {
      const userId = data.userId || (data.user && data.user.id) || (data.data && data.data.id) || '';
      const nickname = data.nickname || (data.user && data.user.nickname) || (data.data && data.data.nickname) || '';
      const avatarUrl = data.avatarUrl || (data.user && data.user.avatarUrl) || (data.data && data.data.avatarUrl) || (data.user && data.user.avatar) || (data.data && data.data.avatar) || null;
      const gender = data.gender || (data.user && data.user.gender) || (data.data && data.data.gender) || 0;
      const sessionToken = data.sessionToken || data.token || data.session_token;

      if (!userId || !sessionToken) {
        showMessage('登录响应数据不完整，请稍后重试', 'error');
        getCaptcha();
        isSubmitting.value = false;
        return;
      }

      const userData = {
        id: userId ? String(userId) : '',
        nickname: nickname,
        gender: gender,
        avatarUrl: avatarUrl && typeof avatarUrl === 'string' ? avatarUrl.trim() : null
      };

      localStorage.setItem('currentUser', JSON.stringify(userData));
      localStorage.setItem('currentSessionToken', sessionToken);
      localStorage.setItem('chatUserId', userData.id);
      localStorage.setItem('chatUserNickname', userData.nickname);
      localStorage.setItem('chatSessionToken', sessionToken);
      localStorage.setItem('chatUserGender', String(userData.gender || 0));

      showMessage('登录成功，正在跳转...', 'success');
      setTimeout(() => {
        login();
      }, 500);
    } else {
      const errorMessage = data.message || data.msg || '登录失败，请检查用户名和密码';
      showMessage(errorMessage, 'error');
      getCaptcha();
      isSubmitting.value = false;
    }
  } catch (error) {
    showMessage('登录请求失败，请检查用户名/密码是否合法，并稍后重试', 'error');
    getCaptcha();
    isSubmitting.value = false;
  }
}

// 在组件挂载后初始化
onMounted(() => {
  getCaptcha();
});
</script>

<style scoped>
/* 登录页面容器样式 */
.login-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  box-sizing: border-box;
  overflow: hidden;
}

/* 装饰性元素 */
.decoration {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
}

.decoration-1 {
  width: 150px;
  height: 150px;
  background: rgba(255, 255, 255, 0.2);
  top: -150px;
  right: 0px;
  animation: float 16s infinite ease-in-out;
}

.decoration-2 {
  width: 200px;
  height: 200px;
  background: rgba(255, 255, 255, 0.18);
  bottom: -100px;
  left: -50px;
  animation: float 12s infinite ease-in-out;
}

.decoration-3 {
  width: 100px;
  height: 100px;
  background: rgba(255, 255, 255, 0.15);
  top: 50%;
  right: 50px;
  animation: float 8s infinite ease-in-out;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0) translateX(0);
  }

  25% {
    transform: translateY(-60px) translateX(30px);
  }

  50% {
    transform: translateY(30px) translateX(-45px);
  }

  75% {
    transform: translateY(-30px) translateX(-30px);
  }
}

/* 登录表单容器 */
.login-form {
  position: relative;
  background: white;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 400px;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  z-index: 10;
}

.login-form:hover {
  transform: translateY(-2px);
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.15);
}

/* 标题样式 */
h1 {
  text-align: center;
  color: #333;
  margin-bottom: 30px;
  font-size: 24px;
  font-weight: 600;
}

/* 表单样式 */
form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 输入组样式 */
.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 标签样式 */
label {
  font-size: 14px;
  font-weight: 500;
  color: #555;
}

/* 输入框样式 */
input {
  padding: 12px 15px;
  border: 2px solid #e1e5e9;
  border-radius: 8px;
  font-size: 16px;
  transition: all 0.3s ease;
  background-color: #f9fafb;
}

input:focus {
  outline: none;
  border-color: #667eea;
  background-color: white;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

/* 按钮样式 */
button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 14px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-top: 10px;
}

button:hover {
  transform: translateY(-1px);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}

button:active {
  transform: translateY(0);
}

/* 注册链接样式 */
.register-link {
  text-align: center;
  margin-top: 25px;
  font-size: 14px;
  color: #666;
}

.register-link a {
  color: #667eea;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.3s ease;
}

.register-link a:hover {
  color: #764ba2;
  text-decoration: underline;
}

/* 消息提示样式 */
.login-message {
  text-align: center;
  font-size: 14px;
  margin-top: 15px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid;
}

.login-message.error {
  color: #d32f2f;
  background-color: #ffebee;
  border-color: #ffcdd2;
}

.login-message.success {
  color: #388e3c;
  background-color: #e8f5e8;
  border-color: #c8e6c9;
}

/* 响应式设计 */
@media (max-width: 480px) {
  .login-form {
    padding: 30px 20px;
  }

  h1 {
    font-size: 22px;
  }

  input, button {
    font-size: 15px;
  }
}
</style>