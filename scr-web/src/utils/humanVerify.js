import { humanVerify } from 'human-verify';

function ensureWebCrypto() {
  const cryptoImpl = globalThis.crypto || window.crypto;
  if (cryptoImpl && !globalThis.crypto) {
    globalThis.crypto = cryptoImpl;
  }

  if (!cryptoImpl?.subtle?.digest) {
    throw new Error('当前访问环境不支持安全加密接口，请使用 http://localhost:8080 或 HTTPS 访问后重试');
  }
}

export async function runHumanVerify(options) {
  ensureWebCrypto();
  return humanVerify(options);
}
