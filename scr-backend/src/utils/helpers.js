import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const avatarDir = path.join(process.cwd(), 'public', 'avatars');

export function getClientIP(req) {
  if (req.headers['x-forwarded-for']) {
    const forwardedFor = req.headers['x-forwarded-for'].trim();
    const ips = forwardedFor.split(',');
    const clientIP = ips[0].trim();
    return clientIP;
  }
  
  return req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      (req.connection.socket ? req.connection.socket.remoteAddress : null);
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function checkAvatarStorage() {
  let totalSize = 0;

  if (fs.existsSync(avatarDir)) {
    const files = fs.readdirSync(avatarDir);
    for (const file of files) {
      const filePath = path.join(avatarDir, file);
      try {
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      } catch (err) {
        console.error('获取文件状态失败:', filePath, err.message);
      }
    }
  }

  const sizeInMB = totalSize / (1024 * 1024);

  if (sizeInMB >= 5000) {
    return {
      full: true,
      size: sizeInMB,
      sizeInGB: (sizeInMB / 1024).toFixed(2),
      message: `服务器头像存储已满（超过5GB，当前使用: ${(sizeInMB / 1024).toFixed(2)}GB/5GB）`
    };
  }

  return {
    full: false,
    size: sizeInMB,
    sizeInGB: (sizeInMB / 1024).toFixed(2),
    message: `当前头像存储使用: ${sizeInMB.toFixed(2)}MB (${(sizeInMB / 1024).toFixed(2)}GB/5GB)`
  };
}
