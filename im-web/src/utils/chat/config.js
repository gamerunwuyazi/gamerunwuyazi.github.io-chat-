const marked = require('marked');
const io = require('socket.io-client');
import toast from "../toast.js";

export { marked, io, toast };

export const SERVER_URL = process.env.VUE_APP_SERVER_URL || 'https://back.hs.airoe.cn';

export const MODAL_MAP = {
  'groupInfo': 'groupInfoModal',
  'sendGroupCard': 'sendGroupCardModal',
  'createGroup': 'createGroupModal',
  'addGroupMember': 'addGroupMemberModal',
  'userProfile': 'userProfileModal',
  'userSearch': 'userSearchModal',
  'imagePreview': 'imagePreviewModal',
  'avatarPreview': 'avatarPreviewModal'
};

export function getModalId(modalName) {
  return MODAL_MAP[modalName] || null;
}

export function getModalNameFromId(modalId) {
  const reverseMap = Object.fromEntries(
    Object.entries(MODAL_MAP).map(([name, id]) => [id, name])
  );
  return reverseMap[modalId] || null;
}
