const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

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
  const url = new URL(`${SERVER_URL}/api/admin/users`);
  url.searchParams.set('page', page);
  url.searchParams.set('limit', limit);
  if (search) {
    url.searchParams.set('search', search);
  }
  
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
  const url = new URL(`${SERVER_URL}/api/admin/messages`);
  url.searchParams.set('page', page);
  url.searchParams.set('limit', limit);
  if (type) url.searchParams.set('type', type);
  if (search) url.searchParams.set('search', search);
  if (groupId) url.searchParams.set('groupId', groupId);
  if (userId) url.searchParams.set('userId', userId);
  
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
  const url = new URL(`${SERVER_URL}/api/admin/private-messages`);
  url.searchParams.set('page', page);
  url.searchParams.set('limit', limit);
  if (search) url.searchParams.set('search', search);
  if (userId) url.searchParams.set('userId', userId);
  
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
  const url = new URL(`${SERVER_URL}/api/admin/groups`);
  url.searchParams.set('page', page);
  url.searchParams.set('limit', limit);
  if (search) url.searchParams.set('search', search);
  
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
  const url = new URL(`${SERVER_URL}/api/admin/files`);
  url.searchParams.set('page', page);
  url.searchParams.set('limit', limit);
  
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
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '删除文件失败');
  }
  
  return response.json();
}

export async function getAuditLogs(page = 1, limit = 50, action = '', userId = '') {
  const token = localStorage.getItem('adminToken');
  const url = new URL(`${SERVER_URL}/api/admin/audit-logs`);
  url.searchParams.set('page', page);
  url.searchParams.set('limit', limit);
  if (action) url.searchParams.set('action', action);
  if (userId) url.searchParams.set('userId', userId);
  
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