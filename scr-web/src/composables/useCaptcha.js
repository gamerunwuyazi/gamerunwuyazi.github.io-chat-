import { ref } from 'vue';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const captchaId = ref('');
const bgBase64 = ref('');
const puzzleBase64 = ref('');
const targetY = ref(0);
const puzzleSize = ref(50);
const publicKey = ref('');
const encryptedTrajectory = ref('');
const captchaVerified = ref(false);
const captchaError = ref('');

export function useCaptcha() {
  async function fetchCaptcha() {
    try {
      captchaError.value = '';
      captchaVerified.value = false;
      encryptedTrajectory.value = '';
      const res = await fetch(`${SERVER_URL}/api/captcha/create`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.captchaId) {
        captchaId.value = data.captchaId;
        bgBase64.value = data.bgBase64;
        puzzleBase64.value = data.puzzleBase64;
        targetY.value = data.targetY;
        puzzleSize.value = data.puzzleSize;
        publicKey.value = data.publicKey || '';
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

  async function handleVerify(encryptedData) {
    captchaError.value = '';
    encryptedTrajectory.value = encryptedData;
    if (!captchaId.value || !encryptedData) {
      captchaError.value = '验证码验证失败';
      return;
    }
    try {
      const res = await fetch(`${SERVER_URL}/api/captcha/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          captchaId: captchaId.value,
          encryptedTrajectory: encryptedData
        })
      });
      const result = await res.json();
      if (result.success) {
        captchaVerified.value = true;
      } else {
        captchaVerified.value = false;
        captchaError.value = result.message || '验证失败，请重试';
        fetchCaptcha();
      }
    } catch (err) {
      const msg = err?.message || '';
      if (msg && !msg.includes('Failed to fetch')) {
        captchaError.value = msg;
      } else {
        captchaError.value = '网络错误，请稍后重试';
      }
      captchaVerified.value = false;
    }
  }

  function resetCaptcha() {
    captchaId.value = '';
    bgBase64.value = '';
    puzzleBase64.value = '';
    targetY.value = 0;
    puzzleSize.value = 50;
    publicKey.value = '';
    encryptedTrajectory.value = '';
    captchaVerified.value = false;
    captchaError.value = '';
  }

  return {
    captchaId,
    bgBase64,
    puzzleBase64,
    targetY,
    puzzleSize,
    publicKey,
    encryptedTrajectory,
    captchaVerified,
    captchaError,
    fetchCaptcha,
    handleVerify,
    resetCaptcha
  };
}