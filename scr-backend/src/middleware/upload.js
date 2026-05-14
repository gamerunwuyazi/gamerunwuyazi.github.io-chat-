import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from '../models/database.js';
import { uploadConfig } from '../config/index.js';

const uploadDir = path.join(process.cwd(), uploadConfig.uploadDir);
const avatarDir = path.join(process.cwd(), uploadConfig.avatarDir);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, avatarDir);
  },
  filename: function (req, file, cb) {
    const userId = req.headers['user-id'] || req.userId;

    if (!userId || userId === 'undefined') {
      return cb(new Error('用户ID不能为空'), false);
    }

    const ext = path.extname(file.originalname).replace(/[/\x00]/g, '_');
    const filename = `avatar_${userId}${ext}`;

    cb(null, filename);
  }
});

const groupAvatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, avatarDir);
  },
  filename: function (req, file, cb) {
    const groupId = req.params.groupId;

    const ext = path.extname(file.originalname).replace(/[/\x00]/g, '_');
    const filename = `group_avatar_${groupId}${ext}`;

    cb(null, filename);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: uploadConfig.maxAvatarSizeMB * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const prohibitedExts = ['.php', '.php3', '.php4', '.php5', '.phtml', '.phar'];

    if (prohibitedExts.includes(ext)) {
      cb(null, false);
    } else if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'), false);
    }
  }
});

const groupAvatarUpload = multer({
  storage: groupAvatarStorage,
  limits: {
    fileSize: uploadConfig.maxAvatarSizeMB * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const prohibitedExts = ['.php', '.php3', '.php4', '.php5', '.phtml', '.phar'];

    if (prohibitedExts.includes(ext)) {
      cb(null, false);
    } else if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'), false);
    }
  }
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const uniqueSuffix = timestamp + '-' + Math.round(Math.random() * 1E9);

    let originalName = file.originalname;
    try {
      originalName = decodeURIComponent(escape(originalName));
    } catch (e) {
    }

    const ext = path.extname(originalName);
    const safeFilename = uniqueSuffix + ext;
    cb(null, safeFilename);
  }
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 15 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const prohibitedExts = ['.php', '.php3', '.php4', '.php5', '.phtml', '.phar'];

    if (prohibitedExts.includes(ext)) {
      cb(null, false);
    } else {
      cb(null, true);
    }
  }
});

async function checkFileRequestLimit(req, res, next) {
  try {
    const userId = req.userId;
    const now = new Date();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    const [hourlyResults] = await pool.execute(
      'SELECT COUNT(*) as count FROM scr_file_request_logs WHERE request_time > ?',
      [oneHourAgo]
    );

    const [dailyResults] = await pool.execute(
      'SELECT COUNT(*) as count FROM scr_file_request_logs WHERE request_time > ?',
      [oneDayAgo]
    );

    const hourlyCount = hourlyResults[0].count;
    const dailyCount = dailyResults[0].count;

    if (hourlyCount >= 100) {
      return res.status(429).json({
        status: 'error',
        message: '服务器文件上传过于频繁，请稍后再试'
      });
    }

    if (dailyCount >= 500) {
      return res.status(429).json({
        status: 'error',
        message: '服务器今日上传次数已达上限，请明天再试'
      });
    }

    await pool.execute(
      'INSERT INTO scr_file_request_logs (user_id, request_time, ip_address) VALUES (?, ?, ?)',
      [userId, now, req.ip]
    );
    await pool.execute(
      'DELETE FROM scr_file_request_logs WHERE id NOT IN (SELECT id FROM (SELECT id FROM scr_file_request_logs ORDER BY request_time DESC LIMIT 1000) AS tmp)'
    );

    next();
  } catch (err) {
    console.error('检查请求限制失败:', err.message);
    next();
  }
}

export {
  avatarUpload,
  groupAvatarUpload,
  upload,
  checkFileRequestLimit,
  uploadDir,
  avatarDir
};
