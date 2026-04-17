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

async function login() {
  const currentUserStr = localStorage.getItem('currentUser');
  const currentSessionToken = localStorage.getItem('currentSessionToken');
  const chatUserId = localStorage.getItem('chatUserId');
  
  const store = getStore();
  if (store) {
    let currentUser = null;
    
    // 优先从 localStorage 的 currentUser 获取用户ID
    if (currentUserStr) {
      try {
        const parsedUser = JSON.parse(currentUserStr);
        currentUser = {
          id: parsedUser.id
        };
      } catch (error) {
        console.warn('解析 currentUser 失败:', error);
      }
    } else if (chatUserId) {
      // 兼容旧版 localStorage
      currentUser = {
        id: chatUserId
      };
    }
    
    if (currentUser && currentSessionToken) {
      store.currentUser = currentUser;
      store.setCurrentSessionToken(currentSessionToken);
      console.log('✅ login() 函数同步用户信息到 store:', currentUser?.id);
      
      // 调用 /self API 获取完整的用户信息
      try {
        const response = await fetch(`${SERVER_URL}/api/self`, {
          headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
          }
        });
        const data = await response.json();
        if (data.status === 'success' && data.user) {
          store.currentUser = {
            id: data.user.id,
            username: data.user.username,
            nickname: data.user.nickname,
            gender: data.user.gender,
            signature: data.user.signature,
            avatar_url: data.user.avatar_url
          };
        }
      } catch (error) {
        console.error('获取用户信息失败:', error);
      }
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
  uploadVideo,
  uploadPrivateImage,
  uploadPrivateFile,
  uploadPrivateVideo,
  uploadUserAvatar,
  initializeUpload,
  initializeScrollLoading,
  initializeImageClickEvents,
  initializeEventDelegation,
} = uploadModule;

export const {
  initializeWebSocket,
  disconnectWebSocket,
  reconnectWebSocket,
  isConnected
} = websocketModule;

if (typeof window !== 'undefined') {
  window.marked = marked;
  window.io = io;
  window.toast = toast;
  window.SERVER_URL = SERVER_URL;
  
  window.sendMessage = sendMessage;
  window.sendGroupMessage = sendGroupMessage;
  window.sendPrivateMessage = sendPrivateMessage;
  
  window.switchToPrivateChat = privateModule.switchToPrivateChat;
  window.loadFriendsList = privateModule.loadFriendsList;
  window.showUserProfile = privateModule.showUserProfile;
  window.showUserAvatarPopup = privateModule.showUserAvatarPopup;
  window.addFriend = privateModule.addFriend;
  window.isPrivateMuted = privateModule.isPrivateMuted;
  window.togglePrivateMute = privateModule.togglePrivateMute;
  
  window.switchToGroupChat = groupModule.switchToGroupChat;
  window.joinGroupWithToken = groupModule.joinGroupWithToken;
  window.sendGroupCard = groupModule.sendGroupCard;
  window.isGroupMuted = groupModule.isGroupMuted;
  window.showSendGroupCardModal = groupModule.showSendGroupCardModal;
  window.showGroupCardPopup = groupModule.showGroupCardPopup;
  window.loadGroupList = groupModule.loadGroupList;
  
  window.openModal = uiModule.openModal;
  window.closeModal = uiModule.closeModal;
  window.updateUnreadCountsDisplay = uiModule.updateUnreadCountsDisplay;
  window.setActiveChat = uiModule.setActiveChat;
  window.currentActiveChat = uiModule.currentActiveChat;
  window.currentGroupId = uiModule.currentGroupId;
  window.currentGroupName = uiModule.currentGroupName;
  window.currentUser = uiModule.currentUser;
  window.currentSessionToken = uiModule.currentSessionToken;
  window.hasReceivedHistory = uiModule.hasReceivedHistory;
  window.hasReceivedGroupHistory = uiModule.hasReceivedGroupHistory;
  window.hasReceivedPrivateHistory = uiModule.hasReceivedPrivateHistory;
  window.currentPrivateChatUserId = uiModule.currentPrivateChatUserId;
  window.currentPrivateChatUsername = uiModule.currentPrivateChatUsername;
  window.currentPrivateChatNickname = uiModule.currentPrivateChatNickname;
  window.currentSendChatType = uiModule.currentSendChatType;
  window.selectedGroupIdForCard = uiModule.selectedGroupIdForCard;
  
  window.isConnected = websocketModule.isConnected;
}
