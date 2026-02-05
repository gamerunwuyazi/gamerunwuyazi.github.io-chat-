<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="login-container">
    <!-- 装饰性元素 -->
    <div class="decoration decoration-1"></div>
    <div class="decoration decoration-2"></div>
    <div class="decoration decoration-3"></div>
    
    <div class="login-form">
      <h1>登录聊天室</h1>
      <form ref="loginForm">
        <div class="input-group">
          <label for="username">用户名</label>
          <input type="text" id="username" ref="usernameInput" name="username" required placeholder="请输入用户名">
        </div>
        <div class="input-group">
          <label for="password">密码</label>
          <input type="password" id="password" ref="passwordInput" name="password" required placeholder="请输入密码">
        </div>
        <div class="input-group">
          <label for="captcha">验证码</label>
          <div style="display: flex; gap: 10px; align-items: center;">
            <input type="text" id="captcha" ref="captchaInput" name="captcha" required placeholder="请输入验证码" style="flex: 1; width: 0;"> <!-- width: 0 确保flex: 1 能正常工作 -->
            <div ref="captchaContainer" style="cursor: pointer; flex-shrink: 0; width: 120px;"></div>
          </div>
        </div>
        <button type="submit">登录</button>
      </form>
      <p class="register-link">还没有账号？<router-link to="/register">去注册</router-link></p>
      <div ref="loginMessage" class="login-message" style="display: none;"></div>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue';
  import {login} from "@/utils/chat";

  
  // 使用ref引用DOM元素
  const loginForm = ref(null);
  const usernameInput = ref(null);
  const passwordInput = ref(null);
  const loginMessage = ref(null);
  const captchaInput = ref(null);
  const captchaContainer = ref(null);
  let currentCaptchaId = '';

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

  // 登录表单提交事件处理
  async function handleLogin(e) {
    e.preventDefault();

    const username = usernameInput.value?.value?.trim() || '';
    const password = passwordInput.value?.value?.trim() || '';
    const captchaCode = captchaInput.value?.value?.trim() || '';

    if (!username || !password || !captchaCode) {
      showMessage('请输入用户名、密码和验证码', 'error');
      return;
    }

    try {
      // 提交登录请求
      const response = await fetch('https://back.hs.airoe.cn/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: username,
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
      console.log('登录响应数据:', data);
      if (data.success || data.status === 'success' || data.code === 200) {
        // 登录成功，构造正确的用户信息对象
        const userId = data.userId || (data.user && data.user.id) || (data.data && data.data.id) || '';
        const nickname = data.nickname || (data.user && data.user.nickname) || (data.data && data.data.nickname) || '';
        const avatarUrl = data.avatarUrl || (data.user && data.user.avatarUrl) || (data.data && data.data.avatarUrl) || (data.user && data.user.avatar) || (data.data && data.data.avatar) || null;
        const sessionToken = data.sessionToken || data.token || data.session_token;

        // 检查必要字段是否存在
        if (!userId || !sessionToken) {
          showMessage('登录响应数据不完整，请稍后重试', 'error');
          getCaptcha();
          return;
        }

        // 构造与原UI一致的currentUser对象
        const userData = {
          id: userId ? String(userId) : '',
          nickname: nickname,
          avatarUrl: avatarUrl && typeof avatarUrl === 'string' ? avatarUrl.trim() : null
        };

        // 保存到新的localStorage键（与原UI一致）
        localStorage.setItem('currentUser', JSON.stringify(userData));
        localStorage.setItem('currentSessionToken', sessionToken);

        // 同时保存到旧的localStorage键，确保兼容性（与原UI一致）
        localStorage.setItem('chatUserId', userData.id);
        localStorage.setItem('chatUserNickname', userData.nickname);
        localStorage.setItem('chatSessionToken', sessionToken);

        // 只有当头像URL有效时才设置到localStorage（与原UI一致）
        if (userData.avatarUrl && typeof userData.avatarUrl === 'string') {
          localStorage.setItem('chatUserAvatar', userData.avatarUrl.trim());
        } else {
          localStorage.removeItem('chatUserAvatar');
        }

        // 跳转到新的聊天室页面
        login();
      } else {
        // 登录失败，显示错误信息
        const errorMessage = data.message || data.msg || '登录失败，请检查用户名和密码';
        showMessage(errorMessage, 'error');
        // 失败时刷新验证码
        getCaptcha();
      }
    } catch (error) {
      showMessage('登录请求失败，请检查用户名/密码是否合法，并稍后重试', 'error');
      // 失败时刷新验证码
      getCaptcha();
    }
  }

  // 显示消息函数
  function showMessage(message, type) {
    if (loginMessage.value) {
      loginMessage.value.textContent = message;
      loginMessage.value.style.display = 'block';

      if (type === 'error') {
        loginMessage.value.style.color = '#d32f2f';
        loginMessage.value.style.backgroundColor = '#ffebee';
        loginMessage.value.style.borderColor = '#ffcdd2';
      } else if (type === 'success') {
        loginMessage.value.style.color = '#388e3c';
        loginMessage.value.style.backgroundColor = '#e8f5e8';
        loginMessage.value.style.borderColor = '#c8e6c9';
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
    if (loginForm.value) {
      loginForm.value.addEventListener('submit', handleLogin);
    }
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
  color: #d32f2f;
  text-align: center;
  font-size: 14px;
  margin-top: 15px;
  padding: 10px;
  background-color: #ffebee;
  border-radius: 6px;
  border: 1px solid #ffcdd2;
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