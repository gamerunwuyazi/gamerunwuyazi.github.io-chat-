<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="register-container">
    <!-- 装饰性元素 -->
    <div class="decoration decoration-1"></div>
    <div class="decoration decoration-2"></div>
    <div class="decoration decoration-3"></div>
    
    <div class="register-form">
      <h1>注册聊天室账号</h1>
      <form @submit.prevent="handleRegister">
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
        <div class="input-group">
          <label>人机验证</label>
          <div class="turnstile-container">
            <VueTurnstile 
              ref="turnstileRef"
              site-key="0x4AAAAAACmJCFDcKhJ4p3Ua"
              v-model="turnstileToken"
              theme="light"
            />
          </div>
        </div>
        <button type="submit" ref="registerButton" :disabled="!isFormValid || isSubmitting">
          {{ isSubmitting ? '注册中...' : '注册' }}
        </button>
      </form>
      <p class="login-link">已有账号？<router-link to="/login">去登录</router-link></p>
      <div v-if="message" :class="['register-message', messageType]">
        {{ message }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { debounce } from 'lodash';
import { login } from '@/utils/chat';
import VueTurnstile from 'vue-turnstile';

const router = useRouter();

const formData = reactive({
  username: '',
  nickname: '',
  password: '',
  confirmPassword: '',
  gender: '0'
});

const turnstileRef = ref(null);
const turnstileToken = ref('');
const message = ref('');
const messageType = ref('error');
const isSubmitting = ref(false);
const registerButton = ref(null);

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
  const turnstileValid = !!turnstileToken.value && String(turnstileToken.value).length > 0;
  return usernameValid && nicknameValid && passwordValid && confirmPasswordValid && turnstileValid;
});

function showMessage(msg, type) {
  message.value = msg;
  messageType.value = type;
  setTimeout(() => {
    message.value = '';
  }, 5000);
}

function resetTurnstile() {
  if (turnstileRef.value) {
    turnstileToken.value = '';
    turnstileRef.value.reset();
  }
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
    const response = await fetch(`https://back.hs.airoe.cn/check-username?username=${encodeURIComponent(username)}`);
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

async function validateAll() {
  const isUsernameValid = await validateUsername();
  const isNicknameValid = validateNickname();
  const isPasswordValid = validatePassword();
  const isConfirmPasswordValid = validateConfirmPassword();
  const isTurnstileValid = turnstileToken.value !== '';

  if (!isTurnstileValid) {
    showMessage('请完成人机验证', 'error');
  }

  return isUsernameValid && isNicknameValid && isPasswordValid && isConfirmPasswordValid && isTurnstileValid;
}

async function handleRegister() {
  if (!await validateAll()) {
    showMessage('请修正表单中的错误后再提交', 'error');
    return;
  }

  isSubmitting.value = true;

  try {
    const registerResponse = await fetch('https://back.hs.airoe.cn/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: formData.username,
        nickname: formData.nickname,
        password: formData.password,
        gender: parseInt(formData.gender),
        turnstileToken: turnstileToken.value
      })
    });

    const registerResponseText = await registerResponse.text();

    let registerData;
    try {
      registerData = JSON.parse(registerResponseText);
    } catch (parseError) {
      showMessage('服务器响应格式错误，请稍后重试', 'error');
      isSubmitting.value = false;
      resetTurnstile();
      return;
    }

    if (!(registerData.success || registerData.status === 'success' || registerData.code === 200)) {
      const errorMessage = registerData.message || registerData.msg || '注册失败，请稍后重试';
      showMessage(errorMessage, 'error');
      resetTurnstile();
      isSubmitting.value = false;
      return;
    }

    showMessage('注册成功，正在自动登录...', 'success');
    
    const loginResponse = await fetch('https://back.hs.airoe.cn/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
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
      const avatarUrl = loginData.avatarUrl || (loginData.user && loginData.user.avatarUrl) || (loginData.data && loginData.data.avatarUrl) || (loginData.user && loginData.user.avatar) || (loginData.data && loginData.data.avatar) || null;
      const gender = loginData.gender || (loginData.user && loginData.user.gender) || (loginData.data && loginData.data.gender) || 0;
      const sessionToken = loginData.sessionToken || loginData.token || loginData.session_token;

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
      const errorMessage = loginData.message || loginData.msg || '注册成功，但自动登录失败，请手动登录';
      showMessage(errorMessage, 'success');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
      isSubmitting.value = false;
    }
  } catch (error) {
    showMessage('注册请求失败，请检查用户名/昵称/密码是否合法，并稍后重试', 'error');
    resetTurnstile();
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
  border-color: #667eea;
  background-color: white;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

/* Turnstile 容器样式 */
.turnstile-container {
  display: flex;
  justify-content: flex-start;
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
  color: #667eea;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.3s ease;
}

.login-link a:hover {
  color: #764ba2;
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
  color: #667eea;
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
</style>
