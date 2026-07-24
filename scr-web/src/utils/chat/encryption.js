import localForage from 'localforage';

import { SERVER_URL } from './config.js';

const KEY_ALGORITHM = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256'
};

const SYMMETRIC_ALGORITHM = {
  name: 'AES-GCM',
  length: 256
};

const PRIVATE_KEY_BACKUP_VERSION = 1;
const PRIVATE_KEY_BACKUP_ITERATIONS = 310000;

export const ENCRYPTION_VERSION = 1;
export const UNDECRYPTABLE_MESSAGE_TEXT = '无法解密此消息';

const publicKeyCache = new Map();

function getCrypto() {
  const cryptoImpl = window.crypto || window.msCrypto;
  if (!cryptoImpl || !cryptoImpl.subtle) {
    throw new Error('当前浏览器不支持 Web Crypto');
  }
  return cryptoImpl;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function derivePrivateKeyBackupKey(password, salt, iterations = PRIVATE_KEY_BACKUP_ITERATIONS) {
  const cryptoImpl = getCrypto();
  const baseKey = await cryptoImpl.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return cryptoImpl.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function createPrivateKeyBackup(privateKey, password) {
  const cryptoImpl = getCrypto();
  const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
  const salt = cryptoImpl.getRandomValues(new Uint8Array(16));
  const backupKey = await derivePrivateKeyBackupKey(password, salt);
  const exportedPrivateKey = await exportPrivateKey(privateKey);
  const ciphertext = await cryptoImpl.subtle.encrypt(
    { name: 'AES-GCM', iv },
    backupKey,
    new TextEncoder().encode(exportedPrivateKey)
  );
  return {
    version: PRIVATE_KEY_BACKUP_VERSION,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: PRIVATE_KEY_BACKUP_ITERATIONS,
    salt: arrayBufferToBase64(salt.buffer),
    iv: arrayBufferToBase64(iv.buffer),
    ciphertext: arrayBufferToBase64(ciphertext)
  };
}

function getLegacySalt(username, userId) {
  return new TextEncoder().encode(`scr-e2ee:${String(username || '').trim().toLowerCase()}:${String(userId)}`);
}

async function decryptPrivateKeyBackup(backup, password, username, userId) {
  if (!backup?.ciphertext || !backup?.iv) return null;
  const iterations = backup.iterations || PRIVATE_KEY_BACKUP_ITERATIONS;
  const salt = backup.salt ? base64ToArrayBuffer(backup.salt) : getLegacySalt(username, userId);
  const backupKey = await derivePrivateKeyBackupKey(password, salt, iterations);
  const decrypted = await getCrypto().subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(backup.iv) },
    backupKey,
    base64ToArrayBuffer(backup.ciphertext)
  );
  return new TextDecoder().decode(decrypted);
}

function getUserKeyStorageKey(userId) {
  return `e2ee-identity-key-${userId}`;
}

function getPublicKeyCacheKey(userId, sessionType, sessionId) {
  return `e2ee-public-keys-${userId}-${sessionType}-${sessionId}`;
}

function extractPublicKeysPayload(publicKeys) {
  if (publicKeys?.data && typeof publicKeys.data === 'object') {
    return publicKeys.data.publicKeys || publicKeys.data.keys || publicKeys.data.users || publicKeys.data.members || publicKeys.data.data || publicKeys.data.publicKey || publicKeys.data;
  }
  return publicKeys;
}

function normalizePublicKeyMap(publicKeys, fallbackUserId = null) {
  const normalizedPublicKeys = extractPublicKeysPayload(publicKeys);
  const result = {};
  if (typeof normalizedPublicKeys === 'string') {
    if (fallbackUserId) {
      result[String(fallbackUserId)] = normalizedPublicKeys;
    }
  } else if (Array.isArray(normalizedPublicKeys)) {
    normalizedPublicKeys.forEach(item => {
      const userId = item.userId || item.user_id || item.id;
      const publicKey = item.publicKey || item.public_key || item.encryptionPublicKey || item.encryption_public_key;
      if (userId && publicKey) {
        result[String(userId)] = publicKey;
      }
    });
  } else if (normalizedPublicKeys && typeof normalizedPublicKeys === 'object') {
    const singleUserId = normalizedPublicKeys.userId || normalizedPublicKeys.user_id || normalizedPublicKeys.id || fallbackUserId;
    const singlePublicKey = normalizedPublicKeys.publicKey || normalizedPublicKeys.public_key || normalizedPublicKeys.encryptionPublicKey || normalizedPublicKeys.encryption_public_key;
    if (singleUserId && singlePublicKey) {
      result[String(singleUserId)] = singlePublicKey;
    } else {
      Object.entries(normalizedPublicKeys).forEach(([userId, publicKey]) => {
        if (typeof publicKey === 'string') {
          result[String(userId)] = publicKey;
        } else if (publicKey && typeof publicKey === 'object') {
          const normalizedUserId = publicKey.userId || publicKey.user_id || publicKey.id || userId;
          const normalizedPublicKey = publicKey.publicKey || publicKey.public_key || publicKey.encryptionPublicKey || publicKey.encryption_public_key;
          if (normalizedUserId && normalizedPublicKey) {
            result[String(normalizedUserId)] = normalizedPublicKey;
          }
        }
      });
    }
  }
  return result;
}

async function exportPublicKey(publicKey) {
  const exported = await getCrypto().subtle.exportKey('spki', publicKey);
  return arrayBufferToBase64(exported);
}

async function exportPrivateKey(privateKey) {
  const exported = await getCrypto().subtle.exportKey('pkcs8', privateKey);
  return arrayBufferToBase64(exported);
}

async function importPublicKey(publicKey) {
  return getCrypto().subtle.importKey(
    'spki',
    base64ToArrayBuffer(publicKey),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt', 'wrapKey']
  );
}

async function importPrivateKey(privateKey) {
  return getCrypto().subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(privateKey),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt', 'unwrapKey']
  );
}

async function getStoredIdentity(userId) {
  return localForage.getItem(getUserKeyStorageKey(userId));
}

export async function ensureLocalIdentityKey(userId, options = {}) {
  if (!userId) {
    throw new Error('缺少用户 ID，无法初始化加密密钥');
  }

  const storedIdentity = await getStoredIdentity(userId);
  if (storedIdentity?.publicKey && storedIdentity?.privateKey) {
    if (options.password && !storedIdentity.privateKeyBackup) {
      const privateKey = await importPrivateKey(storedIdentity.privateKey);
      const identity = {
        ...storedIdentity,
        privateKeyBackup: await createPrivateKeyBackup(privateKey, options.password)
      };
      await localForage.setItem(getUserKeyStorageKey(userId), identity);
      return identity;
    }
    return storedIdentity;
  }

  if (options.privateKeyBackup && options.password && options.username && options.publicKey) {
    try {
      const privateKey = await decryptPrivateKeyBackup(options.privateKeyBackup, options.password, options.username, userId);
      if (privateKey) {
        const importedPrivateKey = await importPrivateKey(privateKey);
        const importedPublicKey = await importPublicKey(options.publicKey);
        const identity = {
          version: ENCRYPTION_VERSION,
          algorithm: KEY_ALGORITHM.name,
          hash: KEY_ALGORITHM.hash,
          publicKey: await exportPublicKey(importedPublicKey),
          privateKey: await exportPrivateKey(importedPrivateKey),
          createdAt: new Date().toISOString(),
          restoredAt: new Date().toISOString()
        };
        await localForage.setItem(getUserKeyStorageKey(userId), identity);
        return identity;
      }
    } catch (error) {
      console.error('恢复加密私钥失败:', error);
    }
  }

  const keyPair = await getCrypto().subtle.generateKey(KEY_ALGORITHM, true, ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']);
  const identity = {
    version: ENCRYPTION_VERSION,
    algorithm: KEY_ALGORITHM.name,
    hash: KEY_ALGORITHM.hash,
    publicKey: await exportPublicKey(keyPair.publicKey),
    privateKey: await exportPrivateKey(keyPair.privateKey),
    createdAt: new Date().toISOString()
  };

  if (options.password) {
    identity.privateKeyBackup = await createPrivateKeyBackup(keyPair.privateKey, options.password);
  }

  await localForage.setItem(getUserKeyStorageKey(userId), identity);
  return identity;
}

export async function rewrapLocalPrivateKeyBackup(userId, username, password) {
  const storedIdentity = await getStoredIdentity(userId);
  if (!storedIdentity?.privateKey) {
    throw new Error('缺少本地私钥，无法更新密钥备份');
  }
  const privateKey = await importPrivateKey(storedIdentity.privateKey);
  const privateKeyBackup = await createPrivateKeyBackup(privateKey, password);
  const identity = {
    ...storedIdentity,
    privateKeyBackup
  };
  await localForage.setItem(getUserKeyStorageKey(userId), identity);
  return privateKeyBackup;
}

export async function publishLocalPublicKey(userId, sessionToken, options = {}) {
  if (!userId || !sessionToken) {
    return { success: false, message: '缺少登录状态，无法上传公钥' };
  }

  const identity = await ensureLocalIdentityKey(userId, options);
  const response = await fetch(`${SERVER_URL}/api/user/encryption-public-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'user-id': userId,
      'session-token': sessionToken
    },
    body: JSON.stringify({
      publicKey: identity.publicKey,
      encryptionPublicKey: identity.publicKey,
      encryptionPrivateKeyBackup: identity.privateKeyBackup,
      keyVersion: identity.version,
      algorithm: identity.algorithm,
      hash: identity.hash
    })
  });
  const data = await response.json().catch(() => ({}));
  return {
    success: response.ok && (data.status === 'success' || data.success !== false),
    ...data
  };
}

export async function initializeEncryptionForUser(userId, sessionToken, options = {}) {
  const identity = await ensureLocalIdentityKey(userId, options);
  try {
    await publishLocalPublicKey(userId, sessionToken, options);
  } catch (error) {
    console.error('上传加密公钥失败:', error);
  }
  return identity;
}

export async function fetchPrivateChatPublicKeys(userId, sessionToken, targetUserId) {
  if (!userId || !sessionToken || !targetUserId) return {};
  const cacheKey = getPublicKeyCacheKey(userId, 'private', targetUserId);
  const response = await fetch(`${SERVER_URL}/api/encryption/public-keys/private/${targetUserId}`, {
    headers: {
      'user-id': userId,
      'session-token': sessionToken
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data.status && data.status !== 'success')) {
    throw new Error(data.message || '获取私聊公钥失败');
  }
  const publicKeys = normalizePublicKeyMap(data.publicKeys || data.keys || data.users || data.data || data.publicKey || data, targetUserId);
  await localForage.setItem(cacheKey, publicKeys);
  publicKeyCache.set(cacheKey, publicKeys);
  return publicKeys;
}

export async function fetchGroupChatPublicKeys(userId, sessionToken, groupId) {
  if (!userId || !sessionToken || !groupId) return {};
  const cacheKey = getPublicKeyCacheKey(userId, 'group', groupId);
  const response = await fetch(`${SERVER_URL}/api/encryption/public-keys/group/${groupId}`, {
    headers: {
      'user-id': userId,
      'session-token': sessionToken
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data.status && data.status !== 'success')) {
    throw new Error(data.message || '获取群聊公钥失败');
  }
  const publicKeys = normalizePublicKeyMap(data.publicKeys || data.keys || data.members || data.data);
  await localForage.setItem(cacheKey, publicKeys);
  publicKeyCache.set(cacheKey, publicKeys);
  return publicKeys;
}

export async function getCachedSessionPublicKeys(userId, sessionType, sessionId) {
  const cacheKey = getPublicKeyCacheKey(userId, sessionType, sessionId);
  if (publicKeyCache.has(cacheKey)) {
    return publicKeyCache.get(cacheKey);
  }
  const publicKeys = await localForage.getItem(cacheKey) || {};
  publicKeyCache.set(cacheKey, publicKeys);
  return publicKeys;
}

export async function encryptMessageForRecipients(plainText, recipientPublicKeys) {
  const normalizedPublicKeys = normalizePublicKeyMap(recipientPublicKeys);
  const recipientIds = Object.keys(normalizedPublicKeys);
  if (!plainText || recipientIds.length === 0) {
    throw new Error('缺少消息内容或接收方公钥');
  }

  const cryptoImpl = getCrypto();
  const messageKey = await cryptoImpl.subtle.generateKey(SYMMETRIC_ALGORITHM, true, ['encrypt', 'decrypt']);
  const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
  const encodedContent = new TextEncoder().encode(plainText);
  const ciphertext = await cryptoImpl.subtle.encrypt({ name: 'AES-GCM', iv }, messageKey, encodedContent);
  const wrappedKeys = {};

  for (const recipientId of recipientIds) {
    const publicKey = await importPublicKey(normalizedPublicKeys[recipientId]);
    const wrappedKey = await cryptoImpl.subtle.wrapKey('raw', messageKey, publicKey, { name: 'RSA-OAEP' });
    wrappedKeys[recipientId] = arrayBufferToBase64(wrappedKey);
  }

  return {
    encrypted: true,
    version: ENCRYPTION_VERSION,
    algorithm: 'AES-GCM',
    keyAlgorithm: 'RSA-OAEP',
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer),
    wrappedKeys
  };
}

export async function decryptMessageForUser(encryptedPayload, userId) {
  try {
    if (!encryptedPayload?.encrypted) {
      return { success: true, text: encryptedPayload?.content || encryptedPayload };
    }

    const wrappedKey = encryptedPayload.wrappedKeys?.[String(userId)] || encryptedPayload.keys?.[String(userId)];
    if (!wrappedKey) {
      return createUndecryptableMessageState('missing-key');
    }

    const storedIdentity = await getStoredIdentity(userId);
    if (!storedIdentity?.privateKey) {
      return createUndecryptableMessageState('missing-local-private-key');
    }

    const cryptoImpl = getCrypto();
    const privateKey = await importPrivateKey(storedIdentity.privateKey);
    const messageKey = await cryptoImpl.subtle.unwrapKey(
      'raw',
      base64ToArrayBuffer(wrappedKey),
      privateKey,
      { name: 'RSA-OAEP' },
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const decrypted = await cryptoImpl.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToArrayBuffer(encryptedPayload.iv) },
      messageKey,
      base64ToArrayBuffer(encryptedPayload.ciphertext || encryptedPayload.content)
    );

    return {
      success: true,
      text: new TextDecoder().decode(decrypted)
    };
  } catch (error) {
    console.error('解密消息失败:', error);
    return createUndecryptableMessageState('decrypt-failed');
  }
}

export function createUndecryptableMessageState(reason = 'decrypt-failed') {
  return {
    success: false,
    undecryptable: true,
    reason,
    text: UNDECRYPTABLE_MESSAGE_TEXT
  };
}

export function getMessageEncryptionPayload(message) {
  const encryptedFlag = message?.encrypted ?? message?.isEncrypted ?? message?.is_encrypted;
  const isEncryptedMessage = encryptedFlag === true || encryptedFlag === 1 || encryptedFlag === '1' || encryptedFlag === 'true';
  if (!message || !isEncryptedMessage) return null;
  const metadata = message.encryption || message.encryptionMetadata || message.encryption_metadata || message.encryptedPayload || message.encrypted_payload;
  if (typeof metadata === 'string') {
    try {
      const parsedMetadata = JSON.parse(metadata);
      return {
        ...parsedMetadata,
        encrypted: true,
        ciphertext: parsedMetadata.ciphertext || message.ciphertext || message.content,
        iv: parsedMetadata.iv || message.iv,
        wrappedKeys: parsedMetadata.wrappedKeys || parsedMetadata.wrapped_keys || message.wrappedKeys || message.wrapped_keys || message.keys,
        keys: parsedMetadata.keys || message.keys
      };
    } catch {
      return null;
    }
  }
  if (metadata && typeof metadata === 'object') {
    return {
      ...metadata,
      encrypted: true,
      ciphertext: metadata.ciphertext || message.ciphertext || message.content,
      iv: metadata.iv || message.iv,
      wrappedKeys: metadata.wrappedKeys || metadata.wrapped_keys || message.wrappedKeys || message.wrapped_keys || message.keys,
      keys: metadata.keys || message.keys
    };
  }
  if (message.ciphertext || message.encryptedContent || message.encrypted_content || message.iv || message.wrappedKeys || message.keys) {
    return {
      encrypted: true,
      ciphertext: message.ciphertext || message.encryptedContent || message.encrypted_content || message.content,
      iv: message.iv,
      wrappedKeys: message.wrappedKeys || message.wrapped_keys || message.keys,
      keys: message.keys
    };
  }
  return null;
}

export async function decryptChatMessage(message, currentUserId) {
  if (!message || !currentUserId) return message;
  const encryptionPayload = getMessageEncryptionPayload(message);
  if (!encryptionPayload) return message;

  const result = await decryptMessageForUser({ ...encryptionPayload, encrypted: true }, String(currentUserId));
  return {
    ...message,
    encrypted: true,
    encryptedContent: message.encryptedContent || message.content,
    encryption: encryptionPayload,
    encryptionMetadata: encryptionPayload,
    content: result.text,
    decryptFailed: !result.success,
    undecryptable: !!result.undecryptable
  };
}

export async function decryptChatMessages(messages, currentUserId) {
  if (!Array.isArray(messages)) return messages;
  return Promise.all(messages.map(message => decryptChatMessage(message, currentUserId)));
}
