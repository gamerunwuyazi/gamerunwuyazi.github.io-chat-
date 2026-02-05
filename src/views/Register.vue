<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="register-container">
    <!-- 装饰性元素 -->
    <div class="decoration decoration-1"></div>
    <div class="decoration decoration-2"></div>
    <div class="decoration decoration-3"></div>
    
    <div class="register-form">
      <h1>注册聊天室账号</h1>
      <form ref="registerForm">
        <div class="input-group">
          <label for="username">用户名</label>
          <input type="text" id="username" ref="usernameInput" name="username" required placeholder="请输入用户名">
          <div class="validation-message" ref="usernameValidation"></div>
        </div>
        <div class="input-group">
          <label for="nickname">昵称</label>
          <input type="text" id="nickname" ref="nicknameInput" name="nickname" required placeholder="请输入昵称">
          <div class="validation-message" ref="nicknameValidation"></div>
        </div>
        <div class="input-group">
          <label for="password">密码</label>
          <input type="password" id="password" ref="passwordInput" name="password" required placeholder="请输入密码">
          <div class="validation-message" ref="passwordValidation"></div>
          <div class="password-strength" ref="passwordStrength"></div>
        </div>
        <div class="input-group">
          <label for="confirmPassword">确认密码</label>
          <input type="password" id="confirmPassword" ref="confirmPasswordInput" name="confirmPassword" required placeholder="请再次输入密码">
          <div class="validation-message" ref="confirmPasswordValidation"></div>
        </div>
        <div class="input-group">
          <label for="captcha">验证码</label>
          <div style="display: flex; gap: 10px; align-items: center;">
            <input type="text" id="captcha" ref="captchaInput" name="captcha" required placeholder="请输入验证码" style="flex: 1; width: 0;"> <!-- width: 0 确保flex: 1 能正常工作 -->
            <div ref="captchaContainer" style="cursor: pointer; flex-shrink: 0; width: 120px;"></div>
          </div>
        </div>
        <button type="submit" ref="registerButton">注册</button>
      </form>
      <p class="login-link">已有账号？<router-link to="/login">去登录</router-link></p>
      <div ref="registerMessage" class="register-message" style="display: none;"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

// 使用ref引用DOM元素
const registerForm = ref(null);
const usernameInput = ref(null);
const usernameValidation = ref(null);
const nicknameInput = ref(null);
const nicknameValidation = ref(null);
const passwordInput = ref(null);
const passwordValidation = ref(null);
const passwordStrength = ref(null);
const confirmPasswordInput = ref(null);
const confirmPasswordValidation = ref(null);
const registerMessage = ref(null);
const registerButton = ref(null);
const captchaInput = ref(null);
const captchaContainer = ref(null);
let currentCaptchaId = '';

// 防抖函数
function debounce(func, delay) {
  let timer;
  return function() {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, arguments), delay);
  };
}

// 获取验证码
async function getCaptcha() {
  try {
    const response = await fetch('https://back.hs.airoe.cn/captcha');
    const data = await response.json();
    if (data.status === 'success' && captchaContainer.value) {
      captchaContainer.value.innerHTML = data.captchaSvg;
      currentCaptchaId = data.captchaId;
    }
  } catch (error) {
    showMessage('获取验证码失败，请稍后重试', 'error');
  }
}

// 验证用户名
async function validateUsername() {
  if (!usernameInput.value || !usernameValidation.value) return false;
  
  const username = usernameInput.value.value.trim();
  if (!username) {
    usernameValidation.value.textContent = '';
    return false;
  }

  if (username.length > 30) {
    usernameValidation.value.textContent = '用户名长度不能超过30个字符';
    usernameValidation.value.className = 'validation-message error';
    return false;
  }

  // 显示加载状态
  usernameValidation.value.textContent = '检查中...';
  usernameValidation.value.className = 'validation-message';

  try {
    // 调用后端API检查用户名是否重复
    const response = await fetch(`https://back.hs.airoe.cn/check-username?username=${encodeURIComponent(username)}`);
    const data = await response.json();

    if (data.status === 'success') {
      if (data.isAvailable) {
        usernameValidation.value.textContent = '用户名可用';
        usernameValidation.value.className = 'validation-message success';
        return true;
      } else {
        usernameValidation.value.textContent = '用户名已存在';
        usernameValidation.value.className = 'validation-message error';
        return false;
      }
    } else {
      usernameValidation.value.textContent = data.message || '检查失败，请稍后重试';
      usernameValidation.value.className = 'validation-message error';
      return false;
    }
  } catch (error) {
    usernameValidation.value.textContent = '网络错误，请检查用户名是否合法，并稍后重试';
    usernameValidation.value.className = 'validation-message error';
    return false;
  }
}

// 验证昵称
function validateNickname() {
  if (!nicknameInput.value || !nicknameValidation.value) return false;
  
  const nickname = nicknameInput.value.value.trim();
  if (!nickname) {
    nicknameValidation.value.textContent = '';
    return false;
  }

  if (nickname.length > 30) {
    nicknameValidation.value.textContent = '昵称长度不能超过30个字符';
    nicknameValidation.value.className = 'validation-message error';
    return false;
  }

  nicknameValidation.value.textContent = '昵称可用';
  nicknameValidation.value.className = 'validation-message success';
  return true;
}

// 验证密码
function validatePassword() {
  if (!passwordInput.value || !passwordValidation.value || !passwordStrength.value) return false;
  
  const password = passwordInput.value.value;
  if (!password) {
    passwordValidation.value.textContent = '';
    passwordStrength.value.textContent = '';
    return false;
  }

  if (password.length < 6) {
    passwordValidation.value.textContent = '密码长度不能少于6个字符';
    passwordValidation.value.className = 'validation-message error';
    passwordStrength.value.textContent = '';
    return false;
  }

  passwordValidation.value.textContent = '';
  passwordValidation.value.className = 'validation-message';

  // 检测密码强度
  checkPasswordStrength(password);
  return true;
}

// 检测密码强度
function checkPasswordStrength(password) {
  if (!passwordStrength.value) return;
  
  let strength = 0;

  // 长度大于等于6
  if (password.length >= 6) strength++;

  // 包含数字
  if (/[0-9]/.test(password)) strength++;

  // 包含小写字母
  if (/[a-z]/.test(password)) strength++;

  // 包含大写字母
  if (/[A-Z]/.test(password)) strength++;

  // 包含特殊字符
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  let strengthText = '';
  let strengthClass = '';

  if (strength <= 2) {
    strengthText = '密码强度：弱';
    strengthClass = 'password-strength weak';
  } else if (strength <= 3) {
    strengthText = '密码强度：中等';
    strengthClass = 'password-strength medium';
  } else {
    strengthText = '密码强度：强';
    strengthClass = 'password-strength strong';
  }

  passwordStrength.value.textContent = strengthText;
  passwordStrength.value.className = strengthClass;
}

// 验证确认密码
function validateConfirmPassword() {
  if (!passwordInput.value || !confirmPasswordInput.value || !confirmPasswordValidation.value) return false;
  
  const password = passwordInput.value.value;
  const confirmPassword = confirmPasswordInput.value.value;

  if (!confirmPassword) {
    confirmPasswordValidation.value.textContent = '';
    return false;
  }

  if (password !== confirmPassword) {
    confirmPasswordValidation.value.textContent = '两次输入的密码不一致';
    confirmPasswordValidation.value.className = 'validation-message error';
    return false;
  }

  confirmPasswordValidation.value.textContent = '密码一致';
  confirmPasswordValidation.value.className = 'validation-message success';
  return true;
}

// 验证所有字段
async function validateAll() {
  const isUsernameValid = await validateUsername();
  const isNicknameValid = validateNickname();
  const isPasswordValid = validatePassword();
  const isConfirmPasswordValid = validateConfirmPassword();
  const isCaptchaValid = captchaInput.value?.value?.trim() !== '';

  return isUsernameValid && isNicknameValid && isPasswordValid && isConfirmPasswordValid && isCaptchaValid;
}

// 注册表单提交事件处理
async function handleRegister(e) {
  e.preventDefault();

  if (!await validateAll()) {
    showMessage('请修正表单中的错误后再提交', 'error');
    return;
  }

  const username = usernameInput.value?.value?.trim() || '';
  const nickname = nicknameInput.value?.value?.trim() || '';
  const password = passwordInput.value?.value?.trim() || '';
  const captchaCode = captchaInput.value?.value?.trim() || '';

  try {
    // 显示加载状态
    if (registerButton.value) {
      registerButton.value.disabled = true;
      registerButton.value.textContent = '注册中...';
    }

    // 提交注册请求
    const response = await fetch('https://back.hs.airoe.cn/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: username,
        nickname: nickname,
        password: password,
        captchaId: currentCaptchaId,
        captchaCode: captchaCode
      })
    });

    const responseText = await response.text();

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      showMessage('服务器响应格式错误，请稍后重试', 'error');
      return;
    }

    // 改进的响应处理逻辑，支持不同的响应格式
    if (data.success || data.status === 'success' || data.code === 200) {
      showMessage('注册成功，即将跳转到登录页面...', 'success');
      // 注册成功，跳转到登录页面
      setTimeout(() => {
        router.push('/login');
      }, 1500);
    } else {
      // 注册失败，显示错误信息
      const errorMessage = data.message || data.msg || '注册失败，请稍后重试';
      showMessage(errorMessage, 'error');
      // 失败时刷新验证码
      getCaptcha();
    }
  } catch (error) {
    showMessage('注册请求失败，请检查用户名/昵称/密码是否合法，并稍后重试', 'error');
    // 失败时刷新验证码
    getCaptcha();
  } finally {
    // 恢复按钮状态
    if (registerButton.value) {
      registerButton.value.disabled = false;
      registerButton.value.textContent = '注册';
    }
  }
}

// 显示消息函数
function showMessage(message, type) {
  if (registerMessage.value) {
    registerMessage.value.textContent = message;
    registerMessage.value.style.display = 'block';

    if (type === 'error') {
      registerMessage.value.style.color = '#d32f2f';
      registerMessage.value.style.backgroundColor = '#ffebee';
      registerMessage.value.style.borderColor = '#ffcdd2';
    } else if (type === 'success') {
      registerMessage.value.style.color = '#388e3c';
      registerMessage.value.style.backgroundColor = '#e8f5e8';
      registerMessage.value.style.borderColor = '#c8e6c9';
    }
  }
}

// 在组件挂载后初始化
onMounted(() => {
  // 加载验证码
  getCaptcha();
  
  // 添加验证码点击事件
  if (captchaContainer.value) {
    captchaContainer.value.addEventListener('click', getCaptcha);
  }
  
  // 添加表单提交事件
  if (registerForm.value) {
    registerForm.value.addEventListener('submit', handleRegister);
  }
  
  // 实时验证用户名
  if (usernameInput.value) {
    usernameInput.value.addEventListener('input', debounce(validateUsername, 500));
  }
  
  // 实时验证昵称
  if (nicknameInput.value) {
    nicknameInput.value.addEventListener('input', validateNickname);
  }
  
  // 实时验证密码
  if (passwordInput.value) {
    passwordInput.value.addEventListener('input', validatePassword);
  }
  
  // 实时验证确认密码
  if (confirmPasswordInput.value) {
    confirmPasswordInput.value.addEventListener('input', validateConfirmPassword);
  }
});
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
  color: #d32f2f;
  text-align: center;
  font-size: 14px;
  margin-top: 15px;
  padding: 10px;
  background-color: #ffebee;
  border-radius: 6px;
  border: 1px solid #ffcdd2;
}

/* 验证消息样式 */
.validation-message {
  font-size: 12px;
  min-height: 16px;
  margin-top: 4px;
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