<template>
  <div class="pow-captcha-container">
    <div v-if="!scriptLoaded && !loadError" class="pow-captcha-loading">加载验证码组件中...</div>
    <div v-if="loadError" class="pow-captcha-error">验证码加载失败，请刷新页面重试</div>
    <div ref="captchaContainer"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch } from 'vue';

const emit = defineEmits(['verify']);

const captchaContainer = ref(null);
const scriptLoaded = ref(false);
const loadError = ref(false);
let widget = null;

function onSuccess(e) {
  console.log('POW验证码成功事件触发:', e);
  console.log('事件类型:', e.type);
  console.log('事件详情:', e.detail);
  
  let token = null;
  if (e.detail && e.detail.token) {
    token = e.detail.token;
  } else if (e.detail && typeof e.detail === 'string') {
    token = e.detail;
  } else if (e.token) {
    token = e.token;
  }
  
  console.log('最终提取的token:', token);
  
  if (token) {
    emit('verify', token);
  }
}

function onError(e) {
  console.error('POW验证错误:', e.detail);
}

function initCaptcha() {
  console.log('开始初始化POW验证码');
  if (!captchaContainer.value) {
    console.error('验证码容器不存在');
    return;
  }

  captchaContainer.value.innerHTML = '';

  const widgetEl = document.createElement('cap-widget');
  widgetEl.id = 'pow-cap-widget';
  widgetEl.setAttribute('data-cap-api-endpoint', 'https://pow.airoe.cn/api/');

  widgetEl.addEventListener('success', onSuccess);
  widgetEl.addEventListener('error', onError);
  
  console.log('添加事件监听器完成');

  captchaContainer.value.appendChild(widgetEl);
  widget = widgetEl;
  
  console.log('验证码组件已添加到DOM');
  
  setTimeout(() => {
    const el = document.getElementById('pow-cap-widget');
    if (el) {
      console.log('检查到cap-widget元素:', el);
      console.log('元素属性:', el.attributes);
    } else {
      console.log('cap-widget元素不存在');
    }
  }, 1000);
}

function loadScript() {
  console.log('开始加载POW验证码脚本');
  
  if (document.querySelector('script[src="https://pow.airoe.cn/cap.min.js"]')) {
    console.log('脚本已加载，直接初始化');
    scriptLoaded.value = true;
    nextTick(() => initCaptcha());
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://pow.airoe.cn/cap.min.js';
  script.onload = () => {
    console.log('POW脚本加载成功');
    scriptLoaded.value = true;
    nextTick(() => initCaptcha());
  };
  script.onerror = () => {
    console.error('POW脚本加载失败');
    loadError.value = true;
  };
  document.head.appendChild(script);
}

onMounted(() => {
  console.log('POWCaptcha组件挂载');
  loadScript();
});

function reset() {
  console.log('重置POW验证码');
  loadError.value = false;
  scriptLoaded.value = false;

  const existingScript = document.querySelector('script[src="https://pow.airoe.cn/cap.min.js"]');
  if (existingScript) {
    existingScript.remove();
  }

  if (widget) {
    widget.removeEventListener('success', onSuccess);
    widget.removeEventListener('error', onError);
    widget = null;
  }

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