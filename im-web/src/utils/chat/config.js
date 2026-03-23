import { marked } from 'marked';
import { io } from 'socket.io-client';
import toast from "../toast.js";
import localForage from './localforage.js';

export { marked, io, toast, localForage };

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://back.hs.airoe.cn';

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
