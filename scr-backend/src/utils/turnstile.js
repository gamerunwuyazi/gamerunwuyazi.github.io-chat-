import { TURNSTILE_SECRET_KEY } from '../config/index.js';

const SECRET_KEY = TURNSTILE_SECRET_KEY || '';

export async function verifyTurnstileToken(token, clientIP) {
  try {
    const response = await globalThis.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `secret=${encodeURIComponent(SECRET_KEY)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(clientIP)}`
    });

    const data = await response.json();
    return { success: data.success === true, message: null };
  } catch (error) {
    return { success: false, message: '网络不佳，请稍后再试' };
  }
}
