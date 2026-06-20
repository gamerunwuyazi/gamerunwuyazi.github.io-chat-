<template>
  <div class="pow-captcha-container">
    <div v-if="loadError" class="pow-captcha-error">验证码加载失败，请刷新页面重试</div>
    <div v-else-if="!scriptLoaded" class="pow-captcha-loading">加载验证码组件中...</div>
    <cap-widget
      v-else
      ref="widgetRef"
      data-cap-api-endpoint="https://pow.airoe.cn/api/"
      @solve="onVerify"
      @success="onVerify"
      @token="onVerify"
      @error="onError"
    ></cap-widget>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue';

const emit = defineEmits(['verify']);

const widgetRef = ref(null);
const scriptLoaded = ref(false);
const loadError = ref(false);

function extractToken(event) {
  const detail = event?.detail;
  if (typeof detail === 'string') return detail;
  return detail?.token || detail?.solution || detail?.value || event?.token || '';
}

function onVerify(event) {
  const token = extractToken(event);
  if (token) {
    emit('verify', token);
  }
}

function onError(event) {
  console.error('POW验证错误:', event?.detail || event);
}

function loadScript() {
  if (window.customElements?.get('cap-widget')) {
    scriptLoaded.value = true;
    return;
  }

  const existingScript = document.querySelector('script[src="https://pow.airoe.cn/cap.min.js"]');
  if (existingScript) {
    existingScript.addEventListener('load', () => {
      scriptLoaded.value = true;
    }, { once: true });
    existingScript.addEventListener('error', () => {
      loadError.value = true;
    }, { once: true });
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://pow.airoe.cn/cap.min.js';
  script.onload = () => {
    scriptLoaded.value = true;
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
  nextTick(() => {
    scriptLoaded.value = true;
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

cap-widget {
  width: 100%;
  max-width: 320px;
}
</style>