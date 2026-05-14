import path from 'path';
import fs from 'fs';
import { pool } from '../models/database.js';

let checkAvatarStorage;
let io;

export function initFileService(dependencies) {
  ({ checkAvatarStorage, io } = dependencies);
}

const uploadDir = path.join(process.cwd(), 'public', 'uploads');
const avatarDir = path.join(process.cwd(), 'public', 'avatars');

export async function uploadFile(req, res) {
  try {
    let uploadedFile;
    if (req.files && req.files.file && req.files.file.length > 0) {
      uploadedFile = req.files.file[0];
    } else if (req.files && req.files.image && req.files.image.length > 0) {
      uploadedFile = req.files.image[0];
    }

    if (!uploadedFile) {
      const filename = req.body?.filename || '';
      const ext = path.extname(filename).toLowerCase();
      const prohibitedExts = ['.php', '.php3', '.php4', '.php5', '.phtml', '.phar'];
      if (prohibitedExts.includes(ext)) {
        return res.status(400).json({ status: 'error', message: '禁止上传PHP文件' });
      }
      return res.status(400).json({ status: 'error', message: '没有上传文件' });
    }

    const { userId, groupId, fileType, privateChat, at_userid } = req.body;

    const sessionUserId = req.userId;
    if (!userId || !sessionUserId || parseInt(userId) !== parseInt(sessionUserId)) {
      return res.status(403).json({ status: 'error', message: '无权操作此用户' });
    }

    const [users] = await pool.execute(
        'SELECT id, nickname, avatar_url FROM scr_users WHERE id = ?',
        [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: '用户不存在' });
    }

    const user = users[0];
    
    if (!uploadedFile.filename) {
      console.error('❌ 上传文件缺少filename字段:', uploadedFile);
      return res.status(500).json({ status: 'error', message: '文件处理失败：无法获取文件名' });
    }
    
    const fileUrl = `/uploads/${uploadedFile.filename}`;

    let originalFilename = uploadedFile.originalname || 'unknown_file';
    try {
      originalFilename = decodeURIComponent(escape(originalFilename));
    } catch (e) {
      console.warn('⚠️ 解析原始文件名失败，使用默认值');
    }

    if (privateChat === 'true' || privateChat === true) {
      return res.json({
        status: 'success',
        message: '文件上传成功',
        url: fileUrl,
        filename: originalFilename
      });
    }

    const isImage = uploadedFile.mimetype.startsWith('image/') || fileType === 'image';

    let content, messageType, insertQuery, insertParams, rawMessage;
    const safeGroupId = groupId ? parseInt(groupId) : null;

    if (isImage) {
      const imageWidth = req.body.width ? parseInt(req.body.width) : undefined;
      const imageHeight = req.body.height ? parseInt(req.body.height) : undefined;

      const imageContent = { url: fileUrl };
      if (imageWidth && imageHeight) {
        imageContent.width = imageWidth;
        imageContent.height = imageHeight;
      }

      content = JSON.stringify(imageContent);
      messageType = 1;

      insertQuery = 'INSERT INTO scr_messages (user_id, content, at_userid, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, ?, NOW())';
      insertParams = [userId, content, at_userid ? JSON.stringify(at_userid) : null, messageType, safeGroupId || null];

      rawMessage = {
        id: null,
        userId,
        nickname: user.nickname,
        avatarUrl: user.avatar_url,
        content: content,
        atUserid: at_userid,
        messageType: messageType,
        groupId: safeGroupId || null,
        timestamp: null,
        timestampISO: null,
        imageUrl: fileUrl,
        width: imageWidth,
        height: imageHeight
      };
    } else {
      content = JSON.stringify({ url: fileUrl, filename: originalFilename });
      messageType = 2;

      insertQuery = 'INSERT INTO scr_messages (user_id, content, at_userid, message_type, group_id, timestamp) VALUES (?, ?, ?, ?, ?, NOW())';
      insertParams = [userId, content, at_userid ? JSON.stringify(at_userid) : null, messageType, safeGroupId || null];

      rawMessage = {
        id: null,
        userId,
        nickname: user.nickname,
        avatarUrl: user.avatar_url,
        content: content,
        atUserid: at_userid,
        messageType: messageType,
        groupId: safeGroupId || null,
        timestamp: null,
        timestampISO: null,
        fileUrl: fileUrl,
        filename: originalFilename
      };
    }

    const [result] = await pool.execute(insertQuery, insertParams);

    const now = new Date();
    const timestampMs = now.getTime();

    rawMessage.id = result.insertId;
    rawMessage.timestamp = timestampMs;
    rawMessage.timestampISO = now.toISOString();

    if (safeGroupId) {
      io.to(`group_${safeGroupId}`).emit('message-received', rawMessage);
    } else {
      io.emit('message-received', rawMessage);
    }

    res.json({
      status: 'success',
      message: isImage ? '图片上传成功' : '文件上传成功',
      url: fileUrl,
      filename: originalFilename,
      messageId: result.insertId,
      ...(isImage ? { width: rawMessage.width, height: rawMessage.height } : {})
    });
  } catch (err) {
    console.error('文件上传失败:', err.message);
    res.status(500).json({ status: 'error', message: '文件上传失败' });
  }
}

export async function getAvatarStorage(req, res) {
  try {
    const storageStatus = checkAvatarStorage();
    res.json({
      status: 'success',
      storageInfo: storageStatus
    });
  } catch (err) {
    console.error('获取存储状态失败:', err.message);
    res.status(500).json({ status: 'error', message: '获取存储状态失败' });
  }
}

export function checkAvatarStorageFunc() {
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
