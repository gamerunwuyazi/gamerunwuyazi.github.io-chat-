import request from '@/utils/request.js';

/**
 * 加载群组列表
 */
export function getGroupList(userId) {
  return request.get(`/api/user-groups/${userId}`);
}

/**
 * 退出群组
 */
export function leaveGroup(groupId) {
  return request.post('/api/leave-group', { groupId });
}

/**
 * 解散群组
 */
export function dissolveGroup(userId, groupId) {
  return request.post('/api/dissolve-group', { userId, groupId });
}

/**
 * 获取群组成员
 */
export function getGroupMembers(groupId) {
  return request.get(`/api/group-members/${groupId}`);
}

/**
 * 移除群组成员
 */
export function removeGroupMember(groupId, memberId) {
  return request.post('/api/remove-group-member', { groupId, memberId });
}

/**
 * 添加群组成员
 */
export function addGroupMembers(groupId, memberIds) {
  return request.post('/api/add-group-members', { groupId, memberIds });
}

/**
 * 更新群组名称
 */
export function updateGroupName(groupId, newGroupName) {
  return request.post('/api/update-group-name', { groupId, newGroupName });
}

/**
 * 更新群组公告
 */
export function updateGroupDescription(groupId, newDescription) {
  return request.post('/api/update-group-description', { groupId, newDescription });
}

/**
 * 上传群头像
 */
export function uploadGroupAvatar(groupId, formData) {
  return request.post(`/api/upload-group-avatar/${groupId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
}

/**
 * 通过令牌加入群组
 */
export function joinGroupWithToken(token, isFromGroupCard = false) {
  return request.post('/api/join-group-with-token', { token, isFromGroupCard });
}

/**
 * 获取群组信息
 */
export function getGroupInfo(groupId) {
  return request.get(`/api/group-info/${groupId}`);
}

/**
 * 生成群组邀请令牌
 */
export function generateGroupToken(groupId) {
  return request.post('/api/generate-group-token', { groupId });
}

/**
 * 创建群组
 */
export function createGroup(data) {
  return request.post('/api/create-group', data);
}

/**
 * 设置群组备注
 */
export function setGroupRemark(groupId, remark) {
  return request.post('/api/set-group-remark', { groupId, remark });
}

/**
 * 设置群组昵称
 */
export function setGroupNickname(groupId, nickname) {
  return request.post('/api/set-group-nickname', { groupId, groupNickname: nickname });
}

/**
 * 获取群组昵称
 */
export function getGroupNickname(groupId) {
  return request.get(`/api/get-group-nickname/${groupId}`);
}

/**
 * 设置群组管理员
 */
export function setGroupAdmin(groupId, memberId, isAdmin) {
  return request.post('/api/set-group-admin', { groupId, memberId, isAdmin });
}

/**
 * 禁言群组成员
 */
export function muteGroupMember(groupId, memberId, duration) {
  return request.post('/api/mute-group-member', { groupId, memberId, duration });
}

/**
 * 取消禁言群组成员
 */
export function unmuteGroupMember(groupId, memberId) {
  return request.post('/api/unmute-group-member', { groupId, memberId });
}

/**
 * 设置全员禁言
 */
export function setAllMute(groupId, isAllMute) {
  return request.post('/api/set-mute-all', { groupId, isMuteAll: isAllMute });
}

/**
 * 获取群组禁言状态
 */
export function getGroupMuteStatus(groupId) {
  return request.get(`/api/mute-status/${groupId}`);
}

/**
 * 设置群组免打扰
 */
export function setGroupDisturb(groupId, isDisturb) {
  return request.post('/api/set-group-disturb', { groupId, isDisturb });
}