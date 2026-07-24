const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export const ADMIN_DEFAULT_AVATAR = '';

export function getAdminResourceUrl(url, fallback = ADMIN_DEFAULT_AVATAR) {
  if (!url) return fallback;
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  if (!SERVER_URL) return url;
  return `${SERVER_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

export async function adminLogin(username, password) {
  const response = await fetch(`${SERVER_URL}/api/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || '登录失败');
  }
  
  return data;
}

export async function adminLogout() {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });
  
  return response.json();
}

export async function getDashboardStats() {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/stats`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取统计数据失败');
  }
  
  return response.json();
}

export async function getRecentActivities(page = 1, limit = 10) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/audit-logs?page=${page}&limit=${limit}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取活动日志失败');
  }
  
  return response.json();
}

export async function getUsers(page = 1, limit = 10, search = '') {
  const token = localStorage.getItem('adminToken');
  const params = new URLSearchParams({ page, limit });
  if (search) params.set('search', search);
  const url = `${SERVER_URL}/api/admin/users?${params.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取用户列表失败');
  }
  
  return response.json();
}

export async function getUserDetail(userId) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/users/${userId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取用户详情失败');
  }
  
  return response.json();
}

export async function banUser(userId, reason = '') {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/users/${userId}/ban`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ reason })
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '封禁用户失败');
  }
  
  return response.json();
}

export async function unbanUser(userId) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/users/${userId}/unban`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '解封用户失败');
  }
  
  return response.json();
}

export async function kickUser(userId) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/users/${userId}/kick`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '踢下线失败');
  }
  
  return response.json();
}

export async function getOnlineSessions() {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/online-sessions`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取在线会话失败');
  }
  
  return response.json();
}

export async function kickSession(userId) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/kick-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ userId })
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '断开会话失败');
  }
  
  return response.json();
}

export async function getBannedList() {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/banned-ips`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取封禁列表失败');
  }
  
  return response.json();
}

export async function banIP(ipAddress, userId = null, reason = '', expiresAt = null) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/ban-ip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ ipAddress, userId, reason, expiresAt })
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '封禁失败');
  }
  
  return response.json();
}

export async function unbanIP(ipAddress = null, userId = null) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/unban-ip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ ipAddress, userId })
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '解封失败');
  }
  
  return response.json();
}

export async function getMessages(page = 1, limit = 50, type = '', search = '', groupId = '', userId = '') {
  const token = localStorage.getItem('adminToken');
  const params = new URLSearchParams({ page, limit });
  if (type) params.set('type', type);
  if (search) params.set('search', search);
  if (groupId) params.set('groupId', groupId);
  if (userId) params.set('userId', userId);
  const url = `${SERVER_URL}/api/admin/messages?${params.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取消息列表失败');
  }
  
  return response.json();
}

export async function getPrivateMessages(page = 1, limit = 50, search = '', userId = '') {
  const token = localStorage.getItem('adminToken');
  const params = new URLSearchParams({ page, limit });
  if (search) params.set('search', search);
  if (userId) params.set('userId', userId);
  const url = `${SERVER_URL}/api/admin/private-messages?${params.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取私聊消息失败');
  }
  
  return response.json();
}

export async function deleteMessage(messageId) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/message/${messageId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '删除消息失败');
  }
  
  return response.json();
}

export async function getGroups(page = 1, limit = 50, search = '') {
  const token = localStorage.getItem('adminToken');
  const params = new URLSearchParams({ page, limit });
  if (search) params.set('search', search);
  const url = `${SERVER_URL}/api/admin/groups?${params.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取群组列表失败');
  }
  
  return response.json();
}

export async function getGroupDetail(groupId) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/group/${groupId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取群组详情失败');
  }
  
  return response.json();
}

export async function muteGroupMember(groupId, memberId, duration = null) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/group/${groupId}/mute-member`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ memberId, duration })
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '禁言失败');
  }
  
  return response.json();
}

export async function kickGroupMember(groupId, memberId) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/group/${groupId}/kick-member`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ memberId })
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '踢人失败');
  }
  
  return response.json();
}

export async function dissolveGroup(groupId) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/group/${groupId}/dissolve`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '解散群组失败');
  }
  
  return response.json();
}

export async function getFiles(page = 1, limit = 50) {
  const token = localStorage.getItem('adminToken');
  const params = new URLSearchParams({ page, limit });
  const url = `${SERVER_URL}/api/admin/files?${params.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取文件列表失败');
  }
  
  return response.json();
}

export async function deleteFile(messageId) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/file/${messageId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '删除文件失败');
  }
  
  return response.json();
}

export async function getAuditLogs(page = 1, limit = 50, action = '', search = '', userId = '') {
  const token = localStorage.getItem('adminToken');
  const params = new URLSearchParams({ page, limit });
  if (action) params.set('action', action);
  if (userId) params.set('userId', userId);
  if (search) params.set('search', search);
  const url = `${SERVER_URL}/api/admin/audit-logs?${params.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取审计日志失败');
  }
  
  return response.json();
}

export async function getAuditActions() {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/audit-actions`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取操作类型失败');
  }
  
  return response.json();
}

export async function getLoginIPs() {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/login-ips`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取IP日志失败');
  }
  return response.json();
}

export async function getApiLogs(page = 1, limit = 50) {
  const token = localStorage.getItem('adminToken');
  const params = new URLSearchParams({ page, limit });
  const response = await fetch(`${SERVER_URL}/api/admin/api-logs?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取API日志失败');
  }
  return response.json();
}

export async function getAdminAccounts() {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/admin-accounts`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取管理员账号失败');
  }
  return response.json();
}

export async function createAdminAccount(username, password) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/admin-accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '创建管理员账号失败');
  }
  return response.json();
}

export async function updateAdminAccount(accountId, payload) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/admin-accounts/${accountId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '更新管理员账号失败');
  }
  return response.json();
}

export async function deleteAdminAccount(accountId) {
  const token = localStorage.getItem('adminToken');
  const response = await fetch(`${SERVER_URL}/api/admin/admin-accounts/${accountId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '删除管理员账号失败');
  }
  return response.json();
}