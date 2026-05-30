import fs from 'fs';
import path from 'path';
import { createCaptcha } from 'scr-slider-captcha/backend';

const KEYS_DIR = path.join(process.cwd(), 'keys');

let publicKey = null;
let privateKey = null;

function loadKeys() {
  if (!publicKey || !privateKey) {
    try {
      publicKey = fs.readFileSync(path.join(KEYS_DIR, 'public.pem'), 'utf8');
      privateKey = fs.readFileSync(path.join(KEYS_DIR, 'private.pem'), 'utf8');
    } catch (err) {
      throw new Error('密钥文件不存在，请先运行 npm run generate-keys 生成密钥对');
    }
  }
  return { publicKey, privateKey };
}

export function setupRoutes(app, io) {
  app.post('/api/captcha/create', async (req, res) => {
    try {
      const { publicKey } = loadKeys();
      const result = await createCaptcha({
        width: 300,
        height: 150,
        puzzleSize: 50,
        publicKey
      });
      res.json(result);
    } catch (err) {
      const errorMsg = (err && err.message) || '';
      if (!errorMsg || /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|picsum/i.test(errorMsg) || /picsum/i.test(err && err.code || '')) {
        return res.status(500).json({ status: 'error', message: '网络不佳，请稍后再重新登录' });
      }
      console.error('创建验证码失败:', err.message);
      res.status(500).json({ status: 'error', message: '创建验证码失败' });
    }
  });
}