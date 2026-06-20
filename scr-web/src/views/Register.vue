<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="register-container">
    <!-- 装饰性元素 -->
    <div class="decoration decoration-1"></div>
    <div class="decoration decoration-2"></div>
    <div class="decoration decoration-3"></div>

    <div class="register-form">
      <button class="theme-toggle" type="button" @click="toggleDarkMode" :title="isDarkMode ? '切换为浅色模式' : '切换为深色模式'">
        <span class="theme-icon">{{ isDarkMode ? '☀️' : '🌙' }}</span>
      </button>
      <h1>注册聊天室账号</h1>
      <form @submit.prevent="handleRegisterClick">
        <div class="input-group">
          <label for="username">用户名</label>
          <input 
            type="text" 
            id="username" 
            v-model="formData.username" 
            name="username" 
            required 
            placeholder="请输入用户名"
            @input="debouncedValidateUsername"
          >
          <div v-if="validation.username" :class="['validation-message', validation.usernameClass]">
            {{ validation.username }}
          </div>
        </div>
        <div class="input-group">
          <label for="nickname">昵称</label>
          <input 
            type="text" 
            id="nickname" 
            v-model="formData.nickname" 
            name="nickname" 
            required 
            placeholder="请输入昵称"
            @input="validateNickname"
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
            @input="validatePassword"
          >
          <div v-if="validation.password" :class="['validation-message', validation.passwordClass]">
            {{ validation.password }}
          </div>
          <div v-if="passwordStrengthText" :class="['password-strength', passwordStrengthClass]">
            {{ passwordStrengthText }}
          </div>
        </div>
        <div class="input-group">
          <label for="confirmPassword">确认密码</label>
          <input 
            type="password" 
            id="confirmPassword" 
            v-model="formData.confirmPassword" 
            name="confirmPassword" 
            required 
            placeholder="请再次输入密码"
            @input="validateConfirmPassword"
          >
          <div v-if="validation.confirmPassword" :class="['validation-message', validation.confirmPasswordClass]">
            {{ validation.confirmPassword }}
          </div>
        </div>
        <div class="input-group">
          <label>性别</label>
          <div class="gender-options">
            <label class="gender-option">
              <input 
                type="radio" 
                name="gender" 
                value="0" 
                v-model="formData.gender"
              >
              <span>保密</span>
            </label>
            <label class="gender-option">
              <input 
                type="radio" 
                name="gender" 
                value="1" 
                v-model="formData.gender"
              >
              <span>男</span>
            </label>
            <label class="gender-option">
              <input 
                type="radio" 
                name="gender" 
                value="2" 
                v-model="formData.gender"
              >
              <span>女</span>
            </label>
          </div>
        </div>
        <div v-if="loginNotice" class="login-notice">{{ loginNotice }}</div>
        <button type="submit" ref="registerButton" :disabled="!isFormValid || isSubmitting || captchaModalVisible">
          {{ isSubmitting ? '注册中...' : '注册' }}
        </button>
      </form>
      <p class="login-link">已有账号？<router-link to="/login">去登录</router-link></p>
      <div v-if="message" :class="['register-message', messageType]">
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
            <POWCaptcha ref="powCaptchaRef" @verify="onCaptchaVerify" />
            <div v-if="captchaError" class="captcha-error">{{ captchaError }}</div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { debounce } from 'lodash';
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { login } from '@/utils/chat';
import { originalFetch } from "@/utils/chat/config.js";
import POWCaptcha from '@/components/POWCaptcha.vue';


const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const loginNotice = import.meta.env.VITE_LOGIN_NOTICE || '';
const noticeColor = import.meta.env.VITE_LOGIN_NOTICE_COLOR || '';
const noticeBg = import.meta.env.VITE_LOGIN_NOTICE_BG || '';
const noticeBorder = import.meta.env.VITE_LOGIN_NOTICE_BORDER || '';
const noticeStyle = computed(() => {
  const style = {};
  if (noticeColor) style.color = noticeColor;
  if (noticeBg) style.backgroundColor = noticeBg;
  if (noticeBorder) style.borderColor = noticeBorder;
  return style;
});

// 深色模式切换
const isDarkMode = ref(false);
onMounted(() => {
  try {
    isDarkMode.value = document.body.classList.contains('dark-mode');
  } catch {}
});
function toggleDarkMode() {
  isDarkMode.value = !isDarkMode.value;
  document.body.classList.toggle('dark-mode', isDarkMode.value);
  try {
    localStorage.setItem('dark-mode', isDarkMode.value ? '1' : '0');
  } catch {}
}

const router = useRouter();

const formData = reactive({
  username: '',
  nickname: '',
  password: '',
  confirmPassword: '',
  gender: '0'
});

const message = ref('');
const messageType = ref('error');
const isSubmitting = ref(false);
const registerButton = ref(null);
const powCaptchaRef = ref(null);

// 模态框状态
const captchaModalVisible = ref(false);
const captchaError = ref('');

const validation = reactive({
  username: '',
  usernameClass: '',
  nickname: '',
  nicknameClass: '',
  password: '',
  passwordClass: '',
  confirmPassword: '',
  confirmPasswordClass: ''
});

const passwordStrengthText = ref('');
const passwordStrengthClass = ref('');

const isFormValid = computed(() => {
  const usernameValid = !!formData.username && String(formData.username).trim().length > 0 && validation.usernameClass === 'success';
  const nicknameValid = !!formData.nickname && String(formData.nickname).trim().length > 0 && validation.nicknameClass === 'success';
  const passwordValid = !!formData.password && String(formData.password).trim().length >= 6;
  const confirmPasswordValid = !!formData.confirmPassword && String(formData.confirmPassword).trim().length >= 6 && formData.password === formData.confirmPassword;
  return usernameValid && nicknameValid && passwordValid && confirmPasswordValid;
});

function showMessage(msg, type) {
  message.value = msg;
  messageType.value = type;
  setTimeout(() => {
    message.value = '';
  }, 5000);
}

async function validateUsername() {
  const username = formData.username.trim();
  if (!username) {
    validation.username = '';
    validation.usernameClass = '';
    return false;
  }

  if (username.length > 30) {
    validation.username = '用户名长度不能超过 30 个字符';
    validation.usernameClass = 'error';
    return false;
  }

  validation.username = '检查中...';
  validation.usernameClass = '';

  try {
    const response = await originalFetch(`${SERVER_URL}/api/check-username?username=${encodeURIComponent(username)}`);
    const data = await response.json();

    if (data.status === 'success') {
      if (data.isAvailable) {
        validation.username = '用户名可用';
        validation.usernameClass = 'success';
        return true;
      } else {
        validation.username = '用户名已存在';
        validation.usernameClass = 'error';
        return false;
      }
    } else {
      validation.username = data.message || '检查失败，请稍后重试';
      validation.usernameClass = 'error';
      return false;
    }
  } catch (error) {
    validation.username = '网络错误，请检查用户名是否合法，并稍后重试';
    validation.usernameClass = 'error';
    return false;
  }
}

const debouncedValidateUsername = debounce(validateUsername, 500);

function validateNickname() {
  const nickname = formData.nickname.trim();
  if (!nickname) {
    validation.nickname = '';
    validation.nicknameClass = '';
    return false;
  }

  if (nickname.length > 30) {
    validation.nickname = '昵称长度不能超过 30 个字符';
    validation.nicknameClass = 'error';
    return false;
  }

  validation.nickname = '昵称可用';
  validation.nicknameClass = 'success';
  return true;
}

function validatePassword() {
  const password = formData.password;
  if (!password) {
    validation.password = '';
    validation.passwordClass = '';
    passwordStrengthText.value = '';
    passwordStrengthClass.value = '';
    return false;
  }

  if (password.length < 6) {
    validation.password = '密码长度不能少于 6 个字符';
    validation.passwordClass = 'error';
    passwordStrengthText.value = '';
    return false;
  }

  validation.password = '';
  validation.passwordClass = '';
  checkPasswordStrength(password);
  return true;
}

function checkPasswordStrength(password) {
  let strength = 0;

  if (password.length >= 6) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  if (strength <= 2) {
    passwordStrengthText.value = '密码强度：弱';
    passwordStrengthClass.value = 'weak';
  } else if (strength <= 3) {
    passwordStrengthText.value = '密码强度：中等';
    passwordStrengthClass.value = 'medium';
  } else {
    passwordStrengthText.value = '密码强度：强';
    passwordStrengthClass.value = 'strong';
  }
}

function validateConfirmPassword() {
  const password = formData.password;
  const confirmPassword = formData.confirmPassword;

  if (!confirmPassword) {
    validation.confirmPassword = '';
    validation.confirmPasswordClass = '';
    return false;
  }

  if (password !== confirmPassword) {
    validation.confirmPassword = '两次输入的密码不一致';
    validation.confirmPasswordClass = 'error';
    return false;
  }

  validation.confirmPassword = '密码一致';
  validation.confirmPasswordClass = 'success';
  return true;
}

function openCaptchaModal() {
  captchaError.value = '';
  captchaModalVisible.value = true;
  if (powCaptchaRef.value) {
    powCaptchaRef.value.reset();
  }
}

function closeCaptchaModal() {
  captchaModalVisible.value = false;
  isSubmitting.value = false;
}

async function onCaptchaVerify(powToken) {
  await doRegisterRequest(powToken);
}

async function handleRegisterClick() {
  const isUsernameValid = await validateUsername();
  const isNicknameValid = validateNickname();
  const isPasswordValid = validatePassword();
  const isConfirmPasswordValid = validateConfirmPassword();

  if (!(isUsernameValid && isNicknameValid && isPasswordValid && isConfirmPasswordValid)) {
    showMessage('请修正表单中的错误后再提交', 'error');
    return;
  }
  openCaptchaModal();
}

async function doRegisterRequest(powToken) {
  isSubmitting.value = true;

  try {
    const registerResponse = await originalFetch(`${SERVER_URL}/api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: formData.username,
        nickname: formData.nickname,
        password: formData.password,
        gender: parseInt(formData.gender),
        powToken: powToken
      })
    });

    const registerResponseText = await registerResponse.text();

    let registerData;
    try {
      registerData = JSON.parse(registerResponseText);
    } catch (parseError) {
      showMessage('服务器响应格式错误，请稍后重试', 'error');
      closeCaptchaModal();
      return;
    }

    if (!(registerData.success || registerData.status === 'success' || registerData.code === 200)) {
      const errorMessage = registerData.message || registerData.msg || '注册失败，请稍后重试';

      if (registerResponse.status === 400 && (errorMessage.includes('用户名') || errorMessage.includes('密码') || errorMessage.includes('昵称'))) {
        closeCaptchaModal();
        showMessage(errorMessage, 'error');
        isSubmitting.value = false;
        return;
      }

      if (errorMessage.includes('人机验证') || errorMessage.includes('验证码')) {
        captchaError.value = '人机验证失败，请重试';
        if (powCaptchaRef.value) {
          powCaptchaRef.value.reset();
        }
        isSubmitting.value = false;
        return;
      }

      captchaError.value = errorMessage;
      isSubmitting.value = false;
      return;
    }

    closeCaptchaModal();
    showMessage('注册成功，正在自动登录...', 'success');

    const loginResponse = await originalFetch(`${SERVER_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: formData.username,
        password: formData.password,
        autoLoginToken: registerData.autoLoginToken
      })
    });

    const loginResponseText = await loginResponse.text();

    let loginData;
    try {
      loginData = JSON.parse(loginResponseText);
    } catch (parseError) {
      showMessage('注册成功，但登录响应解析失败，请手动登录', 'success');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
      isSubmitting.value = false;
      return;
    }

    if (loginData.success || loginData.status === 'success' || loginData.code === 200) {
      const userId = loginData.userId || (loginData.user && loginData.user.id) || (loginData.data && loginData.data.id) || '';
      const nickname = loginData.nickname || (loginData.user && loginData.user.nickname) || (loginData.data && loginData.data.nickname) || '';
      const signature = loginData.signature || (loginData.user && loginData.user.signature) || (loginData.data && loginData.data.signature) || '';
      const avatarUrl = loginData.avatarUrl || (loginData.user && loginData.user.avatarUrl) || (loginData.data && loginData.data.avatarUrl) || (loginData.user && loginData.user.avatar) || (loginData.data && loginData.data.avatar) || null;
      const gender = loginData.gender || (loginData.user && loginData.user.gender) || (loginData.data && loginData.data.gender) || 0;
      const sessionToken = loginData.sessionToken || loginData.token || loginData.session_token;
      const refreshToken = loginData.refreshToken || loginData.refresh_token;

      if (!userId || !sessionToken) {
        showMessage('注册成功，但登录响应数据不完整，请手动登录', 'success');
        setTimeout(() => {
          router.push('/login');
        }, 2000);
        isSubmitting.value = false;
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

      showMessage('登录成功，正在跳转...', 'success');
      setTimeout(() => {
        login();
      }, 500);
    } else {
      const errorMessage = loginData.message || loginData.msg || '注册成功，但自动登录失败，请手动登录';
      showMessage(errorMessage, 'success');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
      isSubmitting.value = false;
    }
  } catch (error) {
    closeCaptchaModal();
    showMessage('注册请求失败，请检查用户名/昵称/密码是否合法，并稍后重试', 'error');
    isSubmitting.value = false;
  }
}
</script>

<style scoped>
/* 注册页面容器样式 */
.register-container {
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

/* 注册表单容器 */
.register-form {
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

.register-form:hover {
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

/* 深色模式切换按钮 */
.theme-toggle {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid #e1e5e9;
  background: #f9fafb;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  padding: 0;
  margin: 0;
  box-shadow: none;
  color: inherit;
  font-size: 16px;
  line-height: 1;
}

.theme-toggle:hover {
  background: #e8ecf1;
  border-color: #c8d0d9;
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
}

.theme-toggle:active {
  transform: translateY(0);
}

.theme-icon {
  font-size: 16px;
  line-height: 1;
  display: inline-block;
}

/* 表单样式 */
form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 输入组样式 */
.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  border-color: #0072ff;
  background-color: white;
  box-shadow: 0 0 0 3px rgba(0, 114, 255, 0.1);
}

/* 通知文本样式 */
.login-notice {
  text-align: center;
  font-size: 13px;
  color: #e67e22;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #f0c27a;
  background-color: #fef9e7;
  margin-top: 10px;
}

/* 按钮样式 */
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
}

/* 登录链接样式 */
.login-link {
  text-align: center;
  margin-top: 25px;
  font-size: 14px;
  color: #666;
}

.login-link a {
  color: #0072ff;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.3s ease;
}

.login-link a:hover {
  color: #0056b3;
  text-decoration: underline;
}

/* 消息提示样式 */
.register-message {
  text-align: center;
  font-size: 14px;
  margin-top: 15px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid;
}

.register-message.error {
  color: #d32f2f;
  background-color: #ffebee;
  border-color: #ffcdd2;
}

.register-message.success {
  color: #388e3c;
  background-color: #e8f5e8;
  border-color: #c8e6c9;
}

/* 验证消息样式 */
.validation-message {
  font-size: 12px;
  min-height: 16px;
}

.validation-message.error {
  color: #d32f2f;
}

.validation-message.success {
  color: #388e3c;
}

/* 密码强度样式 */
.password-strength {
  font-size: 12px;
  margin-top: 8px;
}

.password-strength.weak {
  color: #d32f2f;
}

.password-strength.medium {
  color: #fbc02d;
}

.password-strength.strong {
  color: #388e3c;
}

/* 性别选项样式 */
.gender-options {
  display: flex;
  gap: 20px;
  padding: 8px 0;
}

.gender-option {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #555;
}

.gender-option input[type="radio"] {
  width: auto;
  margin: 0;
  cursor: pointer;
}

.gender-option:hover {
  color: #0072ff;
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

/* 响应式设计 */
@media (max-width: 480px) {
  .register-form {
    padding: 30px 20px;
  }

  h1 {
    font-size: 22px;
  }

  input, button {
    font-size: 15px;
  }
}

/* === 深色模式 === */
@media (prefers-color-scheme: dark) {
  .register-container {
    background: linear-gradient(135deg, #0d1117 0%, #161b22 100%);
  }
  .register-form {
    background: #161b22;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  }
  h1 {
    color: #f0f6fc;
  }
  .theme-toggle {
    background: #21262d;
    border-color: #30363d;
  }
  .theme-toggle:hover {
    background: #30363d;
    border-color: #484f58;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
  }
  label {
    color: #8b949e;
  }
  input {
    background-color: #0d1117;
    border-color: #30363d;
    color: #c9d1d9;
  }
  input:focus {
    border-color: #388bfd;
    background-color: #161b22;
    box-shadow: 0 0 0 3px rgba(56, 139, 255, 0.3);
  }
  input::placeholder {
    color: #6e7681;
  }
  button {
    background: #238636;
    color: #ffffff;
  }
  button:hover:not(:disabled) {
    background: #2ea043;
    box-shadow: 0 5px 15px rgba(46, 160, 67, 0.4);
  }
  button:disabled {
    background-color: #21262d;
    color: #6e7681;
  }
  .login-link {
    color: #8b949e;
  }
  .login-link a {
    color: #388bfd;
  }
  .login-link a:hover {
    color: #58a6ff;
  }
  .register-message.error {
    background-color: rgba(248, 81, 73, 0.15);
    color: #f85149;
    border-color: rgba(248, 81, 73, 0.4);
  }
  .register-message.success {
    background-color: rgba(46, 160, 67, 0.15);
    color: #3fb950;
    border-color: rgba(46, 160, 67, 0.4);
  }
  .login-notice {
    background-color: rgba(210, 153, 34, 0.15);
    color: #d29922;
    border-color: rgba(210, 153, 34, 0.4);
  }
  .validation-message.error {
    color: #f85149;
  }
  .validation-message.success {
    color: #3fb950;
  }
  .password-strength.weak {
    color: #f85149;
  }
  .password-strength.medium {
    color: #d29922;
  }
  .password-strength.strong {
    color: #3fb950;
  }
  .gender-option {
    color: #8b949e;
  }
  .gender-option:hover {
    color: #388bfd;
  }
  .decoration, .decoration-1 {
    background: rgba(56, 139, 253, 0.15) !important;
  }
  .decoration-2 {
    background: rgba(88, 166, 255, 0.12) !important;
  }
  .decoration-3 {
    background: rgba(56, 139, 253, 0.1) !important;
  }
  .captcha-modal {
    background: #161b22;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  }
  .captcha-modal-header {
    color: #f0f6fc;
  }
  .captcha-close-btn {
    color: #8b949e;
  }
  .captcha-close-btn:hover {
    color: #f0f6fc;
  }
  .captcha-error {
    color: #f85149;
  }
}

body.dark-mode .register-container {
  background: linear-gradient(135deg, #0d1117 0%, #161b22 100%) !important;
}
body.dark-mode .register-form {
  background: #161b22 !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4) !important;
}
body.dark-mode .register-form h1 {
  color: #f0f6fc !important;
}
body.dark-mode .register-form .theme-toggle {
  background: #21262d !important;
  border-color: #30363d !important;
  color: #f0f6fc !important;
}
body.dark-mode .register-form .theme-toggle:hover {
  background: #30363d !important;
  border-color: #484f58 !important;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3) !important;
}
body.dark-mode .register-form label {
  color: #8b949e !important;
}
body.dark-mode .register-form input {
  background-color: #0d1117 !important;
  border-color: #30363d !important;
  color: #c9d1d9 !important;
}
body.dark-mode .register-form input:focus {
  border-color: #388bfd !important;
  background-color: #161b22 !important;
  box-shadow: 0 0 0 3px rgba(56, 139, 255, 0.3) !important;
}
body.dark-mode .register-form input::placeholder {
  color: #6e7681 !important;
}
body.dark-mode .register-form button {
  background: #238636 !important;
  color: #ffffff !important;
}
body.dark-mode .register-form button:hover:not(:disabled) {
  background: #2ea043 !important;
  box-shadow: 0 5px 15px rgba(46, 160, 67, 0.4) !important;
}
body.dark-mode .register-form button:disabled {
  background-color: #21262d !important;
  color: #6e7681 !important;
}
body.dark-mode .register-form .login-link {
  color: #8b949e !important;
}
body.dark-mode .register-form .login-link a {
  color: #388bfd !important;
}
body.dark-mode .register-form .login-link a:hover {
  color: #58a6ff !important;
}
body.dark-mode .register-form .register-message.error {
  background-color: rgba(248, 81, 73, 0.15) !important;
  color: #f85149 !important;
  border-color: rgba(248, 81, 73, 0.4) !important;
}
body.dark-mode .register-form .register-message.success {
  background-color: rgba(46, 160, 67, 0.15) !important;
  color: #3fb950 !important;
  border-color: rgba(46, 160, 67, 0.4) !important;
}
body.dark-mode .register-form .login-notice {
  background-color: rgba(210, 153, 34, 0.15) !important;
  color: #d29922 !important;
  border-color: rgba(210, 153, 34, 0.4) !important;
}
body.dark-mode .register-form .validation-message.error {
  color: #f85149 !important;
}
body.dark-mode .register-form .validation-message.success {
  color: #3fb950 !important;
}
body.dark-mode .register-form .password-strength.weak {
  color: #f85149 !important;
}
body.dark-mode .register-form .password-strength.medium {
  color: #d29922 !important;
}
body.dark-mode .register-form .password-strength.strong {
  color: #3fb950 !important;
}
body.dark-mode .register-form .gender-option {
  color: #8b949e !important;
}
body.dark-mode .register-form .gender-option:hover {
  color: #388bfd !important;
}
body.dark-mode .register-container .decoration,
body.dark-mode .register-container .decoration-1 {
  background: rgba(56, 139, 253, 0.15) !important;
}
body.dark-mode .register-container .decoration-2 {
  background: rgba(88, 166, 255, 0.12) !important;
}
body.dark-mode .register-container .decoration-3 {
  background: rgba(56, 139, 253, 0.1) !important;
}
body.dark-mode .register-container .captcha-modal {
  background: #161b22 !important;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6) !important;
  border: 1px solid #30363d !important;
}
body.dark-mode .register-container .captcha-modal-header {
  color: #f0f6fc !important;
}
body.dark-mode .register-container .captcha-close-btn {
  color: #8b949e !important;
}
body.dark-mode .register-container .captcha-close-btn:hover {
  color: #f0f6fc !important;
}
body.dark-mode .register-container .captcha-error {
  color: #f85149 !important;
}
</style>