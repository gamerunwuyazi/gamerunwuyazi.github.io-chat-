<template>
  <div class="pow-captcha-container">
    <div v-if="!scriptLoaded && !loadError" class="pow-captcha-loading">加载验证码组件中...</div>
    <div v-if="loadError" class="pow-captcha-error">验证码加载失败，请刷新页面重试</div>
    <div ref="captchaContainer"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue';

const emit = defineEmits(['verify']);

const captchaContainer = ref(null);
const scriptLoaded = ref(false);
const loadError = ref(false);

function onSuccess(e) {
  const token = e.detail?.token;
  if (token) {
    emit('verify', token);
  }
}

function onError(e) {
  console.error('POW验证错误:', e.detail);
}

function initCaptcha() {
  if (!captchaContainer.value) return;

  // 清除旧内容
  captchaContainer.value.innerHTML = '';

  const widget = document.createElement('cap-widget');
  widget.id = 'pow-cap-widget';
  widget.setAttribute('data-cap-api-endpoint', 'https://pow.airoe.cn/api/');

  widget.addEventListener('success', onSuccess);
  widget.addEventListener('error', onError);

  captchaContainer.value.appendChild(widget);
}

function loadScript() {
  // 检查是否已加载
  if (document.querySelector('script[src="https://pow.airoe.cn/cap.min.js"]')) {
    scriptLoaded.value = true;
    nextTick(() => initCaptcha());
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://pow.airoe.cn/cap.min.js';
  script.onload = () => {
    scriptLoaded.value = true;
    nextTick(() => initCaptcha());
  };
  script.onerror = () => {
    loadError.value = true;
  };
  document.head.appendChild(script);
}

onMounted(() => {
  loadScript();
});

function reset() {
  loadError.value = false;
  scriptLoaded.value = false;

  // 移除旧脚本
  const existingScript = document.querySelector('script[src="https://pow.airoe.cn/cap.min.js"]');
  if (existingScript) {
    existingScript.remove();
  }

  // 重新加载
  nextTick(() => {
    loadScript();
  });
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

:deep(cap-widget) {
  width: 100%;
  max-width: 320px;
}
</style>