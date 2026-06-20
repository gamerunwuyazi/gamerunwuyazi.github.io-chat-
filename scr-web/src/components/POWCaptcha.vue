<template>
  <div class="pow-captcha-container">
    <div ref="captchaContainer" id="pow-captcha-wrapper"></div>
    <div v-if="error" class="pow-captcha-error">{{ error }}</div>
    <div v-if="loading" class="pow-captcha-loading">加载中...</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';

const emit = defineEmits(['verify']);

const captchaContainer = ref(null);
const error = ref('');
const loading = ref(true);

let captchaWidget = null;

const API_ENDPOINT = 'https://pow.airoe.cn/api/';

onMounted(() => {
  loadCaptchaScript();
});

onUnmounted(() => {
  if (captchaWidget) {
    try {
      captchaWidget.destroy();
    } catch {}
  }
});

function loadCaptchaScript() {
  const script = document.createElement('script');
  script.src = 'https://pow.airoe.cn/cap.min.js';
  script.onload = initCaptcha;
  script.onerror = () => {
    error.value = '验证码加载失败，请刷新重试';
    loading.value = false;
  };
  document.head.appendChild(script);
}

function initCaptcha() {
  if (!captchaContainer.value) {
    error.value = '容器不存在';
    loading.value = false;
    return;
  }

  try {
    captchaWidget = new window.CapWidget({
      container: captchaContainer.value,
      apiEndpoint: API_ENDPOINT,
      onSuccess: (token) => {
        error.value = '';
        emit('verify', token);
      },
      onError: (err) => {
        error.value = err.message || '验证失败，请重试';
      },
      onExpired: () => {
        error.value = '验证已过期，请重新验证';
      }
    });
    loading.value = false;
  } catch (err) {
    error.value = '验证码初始化失败: ' + (err.message || '未知错误');
    loading.value = false;
  }
}

function reset() {
  error.value = '';
  loading.value = true;
  if (captchaWidget) {
    try {
      captchaWidget.destroy();
    } catch {}
  }
  setTimeout(() => {
    initCaptcha();
  }, 100);
}

defineExpose({ reset });
</script>

<style scoped>
.pow-captcha-container {
  width: 100%;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pow-captcha-error {
  color: #d32f2f;
  font-size: 13px;
  margin-top: 10px;
  text-align: center;
}

.pow-captcha-loading {
  color: #666;
  font-size: 14px;
  padding: 20px;
}

#pow-captcha-wrapper {
  width: 100%;
}
</style>