import { marked, io, toast, SERVER_URL, getModalId, getModalNameFromId, MODAL_MAP } from './config.js';
import { 
  initChatStore,
  getStore,
  getCurrentUser,
  getCurrentSessionToken,
  setCurrentUser,
  setCurrentSessionToken,
  sessionStore,
  unreadMessages,
  syncCurrentActiveChat,
  deletePublicMessage,
  deleteGroupMessage,
  deletePrivateMessage
} from './store.js';
import {
  escapeHtml,
  unescapeHtml,
  formatFileSize,
  sendMessage,
  sendGroupMessage,
  sendPrivateMessage,
  clearContentEditable
} from './message.js';
import * as privateModule from './private.js';
import * as groupModule from './group.js';
import * as uiModule from './ui.js';
import * as uploadModule from './upload.js';
import * as websocketModule from './websocket.js';

function login() {
  const currentUserStr = localStorage.getItem('currentUser');
  const storedCurrentSessionToken = localStorage.getItem('currentSessionToken');
  const chatUserId = localStorage.getItem('chatUserId');
  const chatSessionToken = localStorage.getItem('chatSessionToken');
  const chatUserNickname = localStorage.getItem('chatUserNickname');
  const chatUserAvatar = localStorage.getItem('chatUserAvatar');
  
  const store = getStore();
  if (store) {
    let currentUser = null;
    let currentSessionToken = null;
    
    if (currentUserStr) {
      try {
        currentUser = JSON.parse(currentUserStr);
      } catch (error) {
        console.warn('解析currentUser失败:', error);
      }
    } else if (chatUserId) {
      currentUser = {
        id: chatUserId,
        nickname: chatUserNickname,
        avatarUrl: chatUserAvatar
      };
    }
    
    currentSessionToken = storedCurrentSessionToken || chatSessionToken;
    
    if (currentUser && currentSessionToken) {
      store.currentUser = currentUser;
      store.setCurrentSessionToken(currentSessionToken);
      console.log('✅ login() 函数同步用户信息到 store:', currentUser?.id);
    }
  }
  
  window.router.push('/chat');
  
  setTimeout(() => {
    uiModule.initializeChat();
  }, 100);
}

export {
  marked,
  io,
  toast,
  SERVER_URL,
  getModalId,
  getModalNameFromId,
  MODAL_MAP,
  initChatStore,
  getStore,
  getCurrentUser,
  getCurrentSessionToken,
  setCurrentUser,
  setCurrentSessionToken,
  sessionStore,
  unreadMessages,
  syncCurrentActiveChat,
  deletePublicMessage,
  deleteGroupMessage,
  deletePrivateMessage,
  escapeHtml,
  unescapeHtml,
  formatFileSize,
  sendMessage,
  sendGroupMessage,
  sendPrivateMessage,
  clearContentEditable,
  login,
  privateModule,
  groupModule,
  uiModule,
  uploadModule,
  websocketModule
};

export const {
  initializeFriendsListListeners,
  switchToPrivateChat,
  initializePrivateChatFunctions,
  initializePrivateChatInterface,
  loadPrivateChatHistory,
  loadFriendsList,
  updateFriendsList,
  deleteFriend,
  showUserProfile,
  showUserAvatarPopup,
  hideUserAvatarPopup,
  initializeUserProfileModal,
  initializeUserSearch,
  searchUsers,
  displaySearchResults,
  addFriend
} = privateModule;

export const {
  initializeGroupFunctions,
  addGroupCardClickListeners,
  loadGroupList,
  getMutedGroups,
  isGroupMuted,
  toggleGroupMute,
  setupCreateGroupButton,
  setupGroupInfoButton,
  setupLeaveGroupButton,
  loadGroupMembers,
  showAddGroupMemberModal,
  confirmAddGroupMembers,
  updateGroupName,
  updateGroupNotice,
  uploadGroupAvatar,
  joinGroupWithToken,
  showGroupCardPopup,
  displayShareGroupCardModal,
  moveGroupToTop,
  switchToGroupChat,
  loadGroupMessages,
  updateGroupList,
  showSendGroupCardModal,
  sendGroupCard,
  handleDissolveGroup,
  handleLeaveGroup,
  dissolveGroup,
  removeMemberFromGroup,
  groupsList,
  currentSharedGroup
} = groupModule;

export const {
  openImagePreview,
  openModal,
  closeModal,
  initSettingsItemClick,
  insertMarkdownFormat,
  initializeMoreButtons,
  initializeFocusListeners,
  initSidebarToggle,
  showError,
  showSuccess,
  updateTitleWithUnreadCount,
  handlePageVisibilityChange,
  handleFocusChange,
  updateUnreadCountsDisplay,
  setActiveChat,
  addImageClickEvents,
  addAvatarClickEvents,
  addGroupAvatarClickEvents,
  initializeChat,
  _syncToStore,
  updateUserAvatar,
  adjustChatLayout,
  showContextMenu,
  hideContextMenu,
  updateGroupMuteIcon,
  updateGroupListDisplay,
  loadOfflineUsers,
  updateOfflineUserList,
  originalTitle,
  isPageVisible,
  currentActiveChat,
  currentGroupId,
  currentGroupName,
  currentUser,
  currentSessionToken,
  hasReceivedHistory,
  hasReceivedGroupHistory,
  hasReceivedPrivateHistory,
  currentPrivateChatUserId,
  currentPrivateChatUsername,
  currentPrivateChatNickname,
  currentSendChatType,
  selectedGroupIdForCard
} = uiModule;

export const {
  uploadImage,
  uploadFile,
  uploadPrivateImage,
  uploadPrivateFile,
  uploadUserAvatar,
  initializeUpload,
  initializeScrollLoading,
  initializeImageClickEvents,
  initializeEventDelegation
} = uploadModule;

export const {
  initializeWebSocket,
  disconnectWebSocket,
  reconnectWebSocket,
  isConnected,
  chatSocket
} = websocketModule;

if (typeof window !== 'undefined') {
  window.marked = marked;
  window.io = io;
  window.toast = toast;
  window.SERVER_URL = SERVER_URL;
  window.getModalId = getModalId;
  window.getModalNameFromId = getModalNameFromId;
  window.MODAL_MAP = MODAL_MAP;
  
  window.initChatStore = initChatStore;
  window.getStore = getStore;
  window.getCurrentUser = getCurrentUser;
  window.getCurrentSessionToken = getCurrentSessionToken;
  window.setCurrentUser = setCurrentUser;
  window.setCurrentSessionToken = setCurrentSessionToken;
  window.sessionStore = sessionStore;
  window.unreadMessages = unreadMessages;
  window.syncCurrentActiveChat = syncCurrentActiveChat;
  window.deletePublicMessage = deletePublicMessage;
  window.deleteGroupMessage = deleteGroupMessage;
  window.deletePrivateMessage = deletePrivateMessage;
  
  window.escapeHtml = escapeHtml;
  window.unescapeHtml = unescapeHtml;
  window.formatFileSize = formatFileSize;
  window.sendMessage = sendMessage;
  window.sendGroupMessage = sendGroupMessage;
  window.sendPrivateMessage = sendPrivateMessage;
  window.login = login;
  window.loadOfflineUsers = loadOfflineUsers;
  window.updateOfflineUserList = updateOfflineUserList;
  window.dissolveGroup = groupModule.dissolveGroup;
  
  Object.assign(window, privateModule);
  Object.assign(window, groupModule);
  Object.assign(window, uiModule);
  Object.assign(window, uploadModule);
  Object.assign(window, websocketModule);
}
