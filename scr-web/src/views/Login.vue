<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="login-container">
    <!-- 装饰性元素 -->
    <div class="decoration decoration-1"></div>
    <div class="decoration decoration-2"></div>
    <div class="decoration decoration-3"></div>

    <div class="login-form">
      <h1>登录聊天室</h1>
      <form @submit.prevent="handleLoginClick">
        <div class="input-group">
          <label for="username">用户名</label>
          <input 
            type="text" 
            id="username" 
            v-model="formData.username" 
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
            v-model="formData.password" 
            name="password" 
            required 
            placeholder="请输入密码"
          >
        </div>
        <button type="submit" :disabled="!isFormValid || isSubmitting || captchaModalVisible">
          {{ isSubmitting ? '登录中...' : '登录' }}
        </button>
      </form>
      <p class="register-link">还没有账号？<router-link to="/register">去注册</router-link></p>
      <div v-if="message" :class="['login-message', messageType]">
        {{ message }}
      </div>
    </div>

    <!-- 验证码模态框 -->
    <Teleport to="body">
      <div v-if="captchaModalVisible" class="captcha-modal-overlay" @click.self="closeCaptchaModal">
        <div class="captcha-modal">
          <div class="captcha-modal-header">
            <span>请完成人机验证</span>
            <button class="captcha-close-btn" @click="closeCaptchaModal">&times;</button>
          </div>
          <div class="captcha-modal-body">
            <SliderCaptcha
              :bg-base64="modalBgBase64"
              :puzzle-base64="modalPuzzleBase64"
              :target-y="modalTargetY"
              :puzzle-size="modalPuzzleSize"
              :width="300"
              :height="150"
              :public-key="modalPublicKey"
              @verify="onCaptchaVerify"
            />
            <div v-if="captchaError" class="captcha-error">{{ captchaError }}</div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { SliderCaptcha } from 'scr-slider-captcha/frontend';
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';

import { useCaptcha } from '@/composables/useCaptcha';
import { login } from "@/utils/chat";
import { originalFetch } from "@/utils/chat/config.js";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const {
  captchaError
} = useCaptcha();

const formData = reactive({
  username: '',
  password: ''
});

const message = ref('');
const messageType = ref('error');
const isSubmitting = ref(false);

// 模态框状态
const captchaModalVisible = ref(false);
const modalBgBase64 = ref('');
const modalPuzzleBase64 = ref('');
const modalTargetY = ref(0);
const modalPuzzleSize = ref(50);
const modalPublicKey = ref('');
let pendingCaptchaId = '';

// 调试函数：使用自动登录Token登录
async function autoLoginWithTokenFunc(autoLoginToken, username, password) {
  if (!autoLoginToken || !username || !password) {
    console.error('请提供autoLoginToken、username和password');
    return;
  }

  try {
    const loginResponse = await originalFetch(`${SERVER_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: username,
        password: password,
        autoLoginToken: autoLoginToken
      })
    });

    const loginResponseText = await loginResponse.text();

    let loginData;
    try {
      loginData = JSON.parse(loginResponseText);
    } catch (parseError) {
      console.error('登录响应解析失败');
      return;
    }

    if (!(loginData.success || loginData.status === 'success' || loginData.code === 200)) {
      const errorMessage = loginData.message || loginData.msg || '自动登录失败';
      console.error(errorMessage);
      return;
    }

    const userId = loginData.userId || (loginData.user && loginData.user.id) || (loginData.data && loginData.data.id) || '';
    const nickname = loginData.nickname || (loginData.user && loginData.user.nickname) || (loginData.data && loginData.data.nickname) || '';
    const signature = loginData.signature || (loginData.user && loginData.user.signature) || (loginData.data && loginData.data.signature) || '';
    const avatarUrl = loginData.avatarUrl || (loginData.user && loginData.user.avatarUrl) || (loginData.data && loginData.data.avatarUrl) || (loginData.user && loginData.user.avatar) || (loginData.data && loginData.data.avatar) || null;
    const gender = loginData.gender || (loginData.user && loginData.user.gender) || (loginData.data && loginData.data.gender) || 0;
    const sessionToken = loginData.sessionToken || loginData.token || loginData.session_token;
    const refreshToken = loginData.refreshToken || loginData.refresh_token;

    if (!userId || !sessionToken) {
      console.error('登录响应数据不完整');
      return;
    }

    const userData = {
      id: userId ? String(userId) : '',
      nickname: nickname,
      signature: signature,
      gender: gender,
      avatarUrl: avatarUrl && typeof avatarUrl === 'string' ? avatarUrl.trim() : null
    };

    localStorage.setItem('currentSessionToken', sessionToken);
    localStorage.setItem('chatUserId', userData.id);
    
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }

    setTimeout(() => {
      login();
    }, 500);
  } catch (error) {
    console.error('自动登录请求失败:', error);
  }
}

if (import.meta.env.DEV) {
  onMounted(() => {
    window.autoLoginWithToken = autoLoginWithTokenFunc;
  });
  
  onUnmounted(() => {
    delete window.autoLoginWithToken;
  });
}

const isFormValid = computed(() => {
  const usernameValid = !!formData.username && String(formData.username).trim().length > 0;
  const passwordValid = !!formData.password && String(formData.password).trim().length > 0;
  return usernameValid && passwordValid;
});

function showMessage(msg, type) {
  message.value = msg;
  messageType.value = type;
  setTimeout(() => {
    message.value = '';
  }, 5000);
}

async function openCaptchaModal() {
  captchaError.value = '';
  captchaModalVisible.value = true;
  try {
    const res = await originalFetch(`${SERVER_URL}/api/captcha/create`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.captchaId) {
      pendingCaptchaId = data.captchaId;
      modalBgBase64.value = data.bgBase64;
      modalPuzzleBase64.value = data.puzzleBase64;
      modalTargetY.value = data.targetY;
      modalPuzzleSize.value = data.puzzleSize;
      modalPublicKey.value = data.publicKey || '';
    } else {
      captchaError.value = data.message || '获取验证码失败';
    }
  } catch (err) {
    const msg = err?.message || '';
    if (msg && !msg.includes('Failed to fetch')) {
      captchaError.value = msg;
    } else {
      captchaError.value = '网络错误，请稍后重试';
    }
  }
}

function closeCaptchaModal() {
  captchaModalVisible.value = false;
  modalBgBase64.value = '';
  modalPuzzleBase64.value = '';
  isSubmitting.value = false;
}

async function onCaptchaVerify(encryptedData) {
  await doLoginRequest(pendingCaptchaId, encryptedData);
}

function handleLoginClick() {
  if (!formData.username || !formData.password) {
    showMessage('请输入用户名和密码', 'error');
    return;
  }
  openCaptchaModal();
}

async function doLoginRequest(captchaIdVal, encryptedTrajectoryVal) {
  isSubmitting.value = true;

  try {
    const response = await originalFetch(`${SERVER_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: formData.username,
        password: formData.password,
        captchaId: captchaIdVal,
        encryptedTrajectory: encryptedTrajectoryVal
      })
    });

    const responseText = await response.text();

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      showMessage('服务器响应格式错误，请稍后重试', 'error');
      closeCaptchaModal();
      return;
    }

    if (data.success || data.status === 'success' || data.code === 200) {
      const userId = data.userId || (data.user && data.user.id) || (data.data && data.data.id) || '';
      const nickname = data.nickname || (data.user && data.user.nickname) || (data.data && data.data.nickname) || '';
      const signature = data.signature || (data.user && data.user.signature) || (data.data && data.data.signature) || '';
      const avatarUrl = data.avatarUrl || (data.user && data.user.avatarUrl) || (data.data && data.data.avatarUrl) || (data.user && data.user.avatar) || (data.data && data.data.avatar) || null;
      const gender = data.gender || (data.user && data.user.gender) || (data.data && data.data.gender) || 0;
      const sessionToken = data.sessionToken || data.token || data.session_token;
      const refreshToken = data.refreshToken || data.refresh_token;

      if (!userId || !sessionToken) {
        showMessage('登录响应数据不完整，请稍后重试', 'error');
        closeCaptchaModal();
        return;
      }

      const userData = {
        id: userId ? String(userId) : '',
        nickname: nickname,
        signature: signature,
        gender: gender,
        avatarUrl: avatarUrl && typeof avatarUrl === 'string' ? avatarUrl.trim() : null
      };

      localStorage.setItem('currentSessionToken', sessionToken);
      localStorage.setItem('chatUserId', userData.id);
      
      if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
      }

      closeCaptchaModal();
      showMessage('登录成功，正在跳转...', 'success');
      setTimeout(() => {
        login();
      }, 500);
    } else {
      let errorMessage = data.message || data.msg || '登录失败';

      if (response.status === 401 || errorMessage.includes('用户名') || errorMessage.includes('密码')) {
        closeCaptchaModal();
        showMessage(errorMessage, 'error');
        isSubmitting.value = false;
        return;
      }

      if (response.status === 400) {
        if (errorMessage.includes('人机验证') || errorMessage.includes('验证码')) {
          captchaError.value = '人机验证失败，请重试';
          modalBgBase64.value = '';
          await new Promise(resolve => setTimeout(resolve, 1000));
          await openCaptchaModal();
          isSubmitting.value = false;
          return;
        } else if (errorMessage.includes('频繁') || errorMessage.includes('频率')) {
          // keep original
        } else if (errorMessage.includes('封禁')) {
          // keep original
        } else {
          errorMessage = errorMessage || '登录信息有误，请检查后重试';
        }
      } else if (response.status === 429) {
        errorMessage = errorMessage || '操作过于频繁，请稍后再试';
      } else if (response.status === 403) {
        errorMessage = errorMessage || '账号异常，请联系管理员';
      }

      captchaError.value = errorMessage;
      isSubmitting.value = false;
    }
  } catch (error) {
    closeCaptchaModal();
    showMessage('登录请求失败，请检查网络连接或稍后重试', 'error');
    isSubmitting.value = false;
  }
}
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
  background: linear-gradient(135deg, white 0%, #e0f1ff 100%);
  padding: 20px;
  box-sizing: border-box;
  overflow: hidden;
}

/* 装饰性元素 */
.decoration {
  position: absolute;
  border-radius: 50%;
  background: rgba(150, 200, 255, 0.6);
}

.decoration-1 {
  width: 150px;
  height: 150px;
  background: rgba(150, 200, 255, 0.6);
  top: -150px;
  right: 0px;
  animation: float 16s infinite ease-in-out;
}

.decoration-2 {
  width: 200px;
  height: 200px;
  background: rgba(140, 190, 255, 0.55);
  bottom: -100px;
  left: -50px;
  animation: float 12s infinite ease-in-out;
}

.decoration-3 {
  width: 100px;
  height: 100px;
  background: rgba(160, 210, 255, 0.5);
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

h1 {
  text-align: center;
  color: #333;
  margin-bottom: 30px;
  font-size: 24px;
  font-weight: 600;
}

form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

label {
  font-size: 14px;
  font-weight: 500;
  color: #555;
}

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
  border-color: #0072ff;
  background-color: white;
  box-shadow: 0 0 0 3px rgba(0, 114, 255, 0.1);
}

button {
  background: #0072ff;
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
  box-shadow: 0 5px 15px rgba(0, 114, 255, 0.4);
  background: #0062dd;
}

button:active {
  transform: translateY(0);
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.register-link {
  text-align: center;
  margin-top: 25px;
  font-size: 14px;
  color: #666;
}

.register-link a {
  color: #0072ff;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.3s ease;
}

.register-link a:hover {
  color: #0056b3;
  text-decoration: underline;
}

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

/* 验证码模态框 */
.captcha-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.captcha-modal {
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  padding: 24px;
  max-width: 360px;
  width: 90%;
  animation: modalIn 0.2s ease-out;
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.captcha-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.captcha-close-btn {
  background: none;
  border: none;
  font-size: 22px;
  color: #999;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: color 0.2s;
  margin-top: 0;
}

.captcha-close-btn:hover {
  color: #333;
}

.captcha-modal-body {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.captcha-error {
  color: #d32f2f;
  font-size: 13px;
  margin-top: 10px;
  text-align: center;
}

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