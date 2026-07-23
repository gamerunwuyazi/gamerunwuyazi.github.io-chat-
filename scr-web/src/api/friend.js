import request from '@/utils/request.js';

/**
 * 获取好友列表
 */
export function getFriendsList() {
  return request.get('/api/user/friends');
}

/**
 * 获取用户信息
 */
export function getUserInfo(userId) {
  return request.get(`/api/user/${userId}`);
}

/**
 * 添加好友
 */
export function addFriend(friendId, message) {
  return request.post('/api/user/add-friend', { friendId, message });
}

/**
 * 删除好友
 */
export function removeFriend(friendId) {
  return request.post('/api/user/remove-friend', { friendId });
}

/**
 * 设置好友免打扰
 */
export function setFriendDisturb(friendId, isDisturb) {
  return request.post('/api/user/set-friend-disturb', { friendId, isDisturb });
}

/**
 * 设置好友备注
 */
export function setFriendRemark(friendId, remark) {
  return request.post('/api/user/set-friend-remark', { friendId, remark });
}