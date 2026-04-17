import { defineStore } from 'pinia';
import { createBaseModule } from './modules/base.js';
import { createUserModule } from './modules/user.js';
import { createSessionModule } from './modules/session.js';
import { createPublicModule } from './modules/public.js';
import { createGroupModule } from './modules/group.js';
import { createFriendModule } from './modules/friend.js';
import { createUnreadModule } from './modules/unread.js';
import { createModalModule } from './modules/modal.js';
import { createInputModule } from './modules/input.js';
import { createDraftModule } from './modules/draft.js';
import { createStorageModule } from './modules/storage.js';

export const useChatStore = defineStore('chat', () => {
  const baseModule = createBaseModule();
  const modalModule = createModalModule();
  const inputModule = createInputModule();

  const getCurrentUser = () => baseModule.currentUser.value;

  const getContext = () => ({
    currentUser: baseModule.currentUser.value,
    currentSessionToken: baseModule.currentSessionToken.value,
    loading: baseModule.loading,
    getStorageKeyPrefix: baseModule.getStorageKeyPrefix,
    getCurrentUser,
    getGroupsList,
    getFriendsList,
    onlineUsers: userModule.onlineUsers,
    offlineUsers: userModule.offlineUsers,
    groupsList: groupModule.groupsList,
    friendsList: friendModule.friendsList,
    publicMessages: publicModule.publicMessages,
    groupMessages: groupModule.groupMessages,
    privateMessages: friendModule.privateMessages,
    unreadMessages: unreadModule.unreadMessages,
    publicStored: publicModule.publicStored,
    groupStored: groupModule.groupStored,
    privateStored: friendModule.privateStored,
    fullPublicMessages: storageModule.fullPublicMessages,
    fullGroupMessages: storageModule.fullGroupMessages,
    fullPrivateMessages: storageModule.fullPrivateMessages,
    cachePublicMessages: storageModule.cachePublicMessages,
    cacheGroupMessages: storageModule.cacheGroupMessages,
    cachePrivateMessages: storageModule.cachePrivateMessages,
    publicAndGroupMinId: storageModule.publicAndGroupMinId,
    privateMinId: storageModule.privateMinId,
    currentActiveChat: sessionModule.currentActiveChat,
    currentGroupId: sessionModule.currentGroupId,
    currentPrivateChatUserId: sessionModule.currentPrivateChatUserId,
    groupsWithAtMe: groupModule.groupsWithAtMe,
    saveToStorage: storageModule.saveToStorage,
    saveMinIds: storageModule.saveMinIds,
    loadMinIds: storageModule.loadMinIds,
    clearQuotedMessage: inputModule.clearQuotedMessage,
    clearOtherGroupMessages: groupModule.clearOtherGroupMessages,
    clearOtherPrivateMessages: friendModule.clearOtherPrivateMessages,
    clearPublicMessagesExceptRecent: publicModule.clearPublicMessagesExceptRecent,
    clearGroupHasAtMe: groupModule.clearGroupHasAtMe,
    setGroupHasAtMe: groupModule.setGroupHasAtMe,
    loadUnreadCountsFromLocalStorage: unreadModule.loadUnreadCountsFromLocalStorage,
    saveUnreadCountsToLocalStorage: unreadModule.saveUnreadCountsToLocalStorage,
    loadUnreadCountsFromStorage: unreadModule.loadUnreadCountsFromStorage,
    saveUnreadCountsToLocalStorageDirect: unreadModule.saveUnreadCountsToLocalStorageDirect,
    sortGroupsByLastMessageTime: groupModule.sortGroupsByLastMessageTime,
    sortFriendsByLastMessageTime: friendModule.sortFriendsByLastMessageTime,
    updateUserInfoInMessages: userModule.updateUserInfoInMessages,
    deletePublicMessage: (messageId) => publicModule.deletePublicMessage(messageId, getContext()),
    deleteGroupMessage: (groupId, messageId) => groupModule.deleteGroupMessage(groupId, messageId, getContext()),
    deletePrivateMessage: (userId, messageId) => friendModule.deletePrivateMessage(userId, messageId, getContext()),
    updateGroupLastMessageAfterDelete: (groupId) => groupModule.updateGroupLastMessageAfterDelete(groupId, getContext()),
    updateFriendLastMessageAfterDelete: (userId) => friendModule.updateFriendLastMessageAfterDelete(userId, getContext()),
    updatePrivateMessagesReadStatus: (userId, readMessageId) => friendModule.updatePrivateMessagesReadStatus(userId, readMessageId, getContext()),
    markGroupAsDeleted: (groupId, isOwnOperation) => groupModule.markGroupAsDeleted(groupId, isOwnOperation, getContext()),
    markFriendAsDeleted: (userId, isOwnOperation) => friendModule.markFriendAsDeleted(userId, isOwnOperation, getContext()),
    getGroupLastMessage: (groupId) => storageModule.getGroupLastMessage(groupId),
    getPrivateLastMessage: (userId) => storageModule.getPrivateLastMessage(userId),
    loadMessages: (loadToStore) => storageModule.loadMessages(loadToStore, getContext()),
    clearMessages: () => storageModule.clearMessages(getContext()),
    refreshMessages: () => storageModule.refreshMessages(getContext()),
    processOfflineMessage: (message, onlySaveToDB) => storageModule.processOfflineMessage(message, onlySaveToDB, getContext()),
    fetchAndMergeOfflineMessages: (onlySaveToDB) => storageModule.fetchAndMergeOfflineMessages(onlySaveToDB, getContext()),
    initializeMessages: () => storageModule.initializeMessages(getContext()),
    saveToStorage: () => storageModule.saveToStorage(getContext()),
    saveMinIds: () => storageModule.saveMinIds(getContext()),
    loadMinIds: () => storageModule.loadMinIds(getContext()),
    formatMessageContent: storageModule.formatMessageContent,
    clearAllDeletedSessions: () => storageModule.clearAllDeletedSessions(getContext()),
    showFetchingMessage: baseModule.showFetchingMessage,
    isFetchingOfflineMessages: baseModule.isFetchingOfflineMessages,
    SERVER_URL: baseModule.SERVER_URL
  });

  const publicModule = createPublicModule(getContext);
  const groupModule = createGroupModule(getContext);
  const friendModule = createFriendModule(getContext);
  const sessionModule = createSessionModule(getContext);
  const draftModule = createDraftModule(getContext);
  const storageModule = createStorageModule(getContext);

  const getGroupsList = () => groupModule.groupsList.value;
  const getFriendsList = () => friendModule.friendsList.value;

  const userModule = createUserModule(getCurrentUser, getGroupsList, getFriendsList);
  const unreadModule = createUnreadModule(getCurrentUser);

  function setCurrentUser(user) {
    baseModule.setCurrentUser(user);
    if (user) {
      unreadModule.loadUnreadCountsFromLocalStorage();
      groupModule.loadGroupsWithAtMeFromLocalStorage(user);
    }
  }

  function setCurrentGroupId(id) {
    sessionModule.setCurrentGroupId(id, {
      clearQuotedMessage: inputModule.clearQuotedMessage,
      clearOtherGroupMessages: groupModule.clearOtherGroupMessages,
      clearPublicMessagesExceptRecent: publicModule.clearPublicMessagesExceptRecent,
      clearOtherPrivateMessages: friendModule.clearOtherPrivateMessages,
      clearGroupHasAtMe: groupModule.clearGroupHasAtMe
    });
  }

  function setCurrentPrivateChatUserId(id) {
    sessionModule.setCurrentPrivateChatUserId(id, {
      clearQuotedMessage: inputModule.clearQuotedMessage,
      clearOtherPrivateMessages: friendModule.clearOtherPrivateMessages,
      clearPublicMessagesExceptRecent: publicModule.clearPublicMessagesExceptRecent,
      clearOtherGroupMessages: groupModule.clearOtherGroupMessages
    });
  }

  function setCurrentActiveChat(type) {
    sessionModule.setCurrentActiveChat(type, {
      clearQuotedMessage: inputModule.clearQuotedMessage,
      clearPublicMessagesExceptRecent: publicModule.clearPublicMessagesExceptRecent,
      clearOtherGroupMessages: groupModule.clearOtherGroupMessages,
      clearOtherPrivateMessages: friendModule.clearOtherPrivateMessages,
      clearGroupHasAtMe: groupModule.clearGroupHasAtMe
    });
  }

  function addPublicMessage(message) {
    publicModule.addPublicMessage(message, {
      loading: baseModule.loading,
      cachePublicMessages: storageModule.cachePublicMessages,
      fullPublicMessages: storageModule.fullPublicMessages,
      publicAndGroupMinId: storageModule.publicAndGroupMinId,
      saveMinIds: () => storageModule.saveMinIds(getContext()),
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function addGroupMessage(groupId, message) {
    groupModule.addGroupMessage(groupId, message, {
      loading: baseModule.loading,
      cacheGroupMessages: storageModule.cacheGroupMessages,
      fullGroupMessages: storageModule.fullGroupMessages,
      publicAndGroupMinId: storageModule.publicAndGroupMinId,
      saveMinIds: () => storageModule.saveMinIds(getContext()),
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function addPrivateMessage(userId, message) {
    friendModule.addPrivateMessage(userId, message, {
      loading: baseModule.loading,
      cachePrivateMessages: storageModule.cachePrivateMessages,
      fullPrivateMessages: storageModule.fullPrivateMessages,
      privateMinId: storageModule.privateMinId,
      saveMinIds: () => storageModule.saveMinIds(getContext()),
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function setPublicMessages(messages) {
    publicModule.setPublicMessages(messages, {
      loading: baseModule.loading,
      cachePublicMessages: storageModule.cachePublicMessages,
      fullPublicMessages: storageModule.fullPublicMessages,
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function setGroupMessages(groupId, messages) {
    groupModule.setGroupMessages(groupId, messages, {
      loading: baseModule.loading,
      cacheGroupMessages: storageModule.cacheGroupMessages,
      fullGroupMessages: storageModule.fullGroupMessages,
      currentUser: baseModule.currentUser.value,
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function setPrivateMessages(userId, messages) {
    friendModule.setPrivateMessages(userId, messages, {
      loading: baseModule.loading,
      cachePrivateMessages: storageModule.cachePrivateMessages,
      fullPrivateMessages: storageModule.fullPrivateMessages,
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function prependPublicMessages(messages) {
    publicModule.prependPublicMessages(messages, {
      loading: baseModule.loading,
      cachePublicMessages: storageModule.cachePublicMessages,
      fullPublicMessages: storageModule.fullPublicMessages,
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function prependGroupMessages(groupId, messages) {
    groupModule.prependGroupMessages(groupId, messages, {
      loading: baseModule.loading,
      cacheGroupMessages: storageModule.cacheGroupMessages,
      fullGroupMessages: storageModule.fullGroupMessages,
      currentUser: baseModule.currentUser.value,
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function prependPrivateMessages(userId, messages) {
    friendModule.prependPrivateMessages(userId, messages, {
      loading: baseModule.loading,
      cachePrivateMessages: storageModule.cachePrivateMessages,
      fullPrivateMessages: storageModule.fullPrivateMessages,
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function clearPublicMessages() {
    publicModule.clearPublicMessages({
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function clearGroupMessages(groupId) {
    groupModule.clearGroupMessages(groupId, {
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function clearPrivateMessages(userId) {
    friendModule.clearPrivateMessages(userId, {
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function deletePublicMessage(messageId) {
    publicModule.deletePublicMessage(messageId, {
      fullPublicMessages: storageModule.fullPublicMessages,
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function deleteGroupMessage(groupId, messageId) {
    groupModule.deleteGroupMessage(groupId, messageId, {
      fullGroupMessages: storageModule.fullGroupMessages,
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function deletePrivateMessage(userId, messageId) {
    friendModule.deletePrivateMessage(userId, messageId, {
      fullPrivateMessages: storageModule.fullPrivateMessages,
      saveToStorage: () => storageModule.saveToStorage(getContext()),
      updateFriendLastMessageAfterDelete: (uid) => friendModule.updateFriendLastMessageAfterDelete(uid, getContext())
    });
  }

  function moveGroupToTop(groupId) {
    groupModule.moveGroupToTop(groupId, {
      sortGroupsByLastMessageTime: groupModule.sortGroupsByLastMessageTime
    });
  }

  function moveFriendToTop(userId) {
    friendModule.moveFriendToTop(userId, {
      sortFriendsByLastMessageTime: friendModule.sortFriendsByLastMessageTime
    });
  }

  function clearGroupUnread(groupId) {
    unreadModule.clearGroupUnread(groupId, {
      loadUnreadCountsFromLocalStorage: unreadModule.loadUnreadCountsFromLocalStorage,
      saveUnreadCountsToLocalStorage: unreadModule.saveUnreadCountsToLocalStorage
    });
  }

  function clearPrivateUnread(userId) {
    unreadModule.clearPrivateUnread(userId, {
      loadUnreadCountsFromLocalStorage: unreadModule.loadUnreadCountsFromLocalStorage,
      saveUnreadCountsToLocalStorage: unreadModule.saveUnreadCountsToLocalStorage
    });
  }

  function clearGlobalUnread() {
    unreadModule.clearGlobalUnread({
      loadUnreadCountsFromLocalStorage: unreadModule.loadUnreadCountsFromLocalStorage,
      saveUnreadCountsToLocalStorage: unreadModule.saveUnreadCountsToLocalStorage
    });
  }

  function incrementGroupUnread(groupId) {
    unreadModule.incrementGroupUnread(groupId, {
      loadUnreadCountsFromLocalStorage: unreadModule.loadUnreadCountsFromLocalStorage,
      saveUnreadCountsToLocalStorage: unreadModule.saveUnreadCountsToLocalStorage
    });
  }

  function incrementGlobalUnread() {
    unreadModule.incrementGlobalUnread({
      loadUnreadCountsFromLocalStorage: unreadModule.loadUnreadCountsFromLocalStorage,
      saveUnreadCountsToLocalStorage: unreadModule.saveUnreadCountsToLocalStorage
    });
  }

  function incrementPrivateUnread(userId) {
    unreadModule.incrementPrivateUnread(userId, {
      loadUnreadCountsFromLocalStorage: unreadModule.loadUnreadCountsFromLocalStorage,
      saveUnreadCountsToLocalStorage: unreadModule.saveUnreadCountsToLocalStorage
    });
  }

  function updateUserInfoInMessages(userId, userInfo) {
    userModule.updateUserInfoInMessages(userId, userInfo, {
      fullPublicMessages: storageModule.fullPublicMessages,
      fullGroupMessages: storageModule.fullGroupMessages,
      fullPrivateMessages: storageModule.fullPrivateMessages,
      publicMessages: publicModule.publicMessages,
      groupMessages: groupModule.groupMessages,
      privateMessages: friendModule.privateMessages,
      publicStored: publicModule.publicStored,
      groupStored: groupModule.groupStored,
      privateStored: friendModule.privateStored,
      groupsList: groupModule.groupsList,
      friendsList: friendModule.friendsList,
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function updatePrivateMessagesReadStatus(userId, readMessageId) {
    friendModule.updatePrivateMessagesReadStatus(userId, readMessageId, {
      currentUser: baseModule.currentUser.value,
      fullPrivateMessages: storageModule.fullPrivateMessages,
      privateStored: friendModule.privateStored,
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function updateGroupLastMessage(groupId, message) {
    groupModule.updateGroupLastMessage(groupId, message);
  }

  function updateFriendLastMessage(userId, message) {
    friendModule.updateFriendLastMessage(userId, message);
  }

  function markGroupAsDeleted(groupId, isOwnOperation = false) {
    groupModule.markGroupAsDeleted(groupId, isOwnOperation, {
      currentUser: baseModule.currentUser.value,
      getStorageKeyPrefix: baseModule.getStorageKeyPrefix,
      fullGroupMessages: storageModule.fullGroupMessages,
      groupMessages: groupModule.groupMessages,
      groupStored: groupModule.groupStored,
      currentGroupId: sessionModule.currentGroupId,
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function markFriendAsDeleted(userId, isOwnOperation = false) {
    friendModule.markFriendAsDeleted(userId, isOwnOperation, {
      currentUser: baseModule.currentUser.value,
      getStorageKeyPrefix: baseModule.getStorageKeyPrefix,
      fullPrivateMessages: storageModule.fullPrivateMessages,
      currentPrivateChatUserId: sessionModule.currentPrivateChatUserId,
      saveToStorage: () => storageModule.saveToStorage(getContext())
    });
  }

  function saveDraft(chatType, id, content) {
    draftModule.saveDraft(chatType, id, content, {
      groupsList: groupModule.groupsList,
      friendsList: friendModule.friendsList,
      getGroupLastMessage: storageModule.getGroupLastMessage,
      getPrivateLastMessage: storageModule.getPrivateLastMessage
    });
  }

  function getDraft(chatType, id) {
    return draftModule.getDraft(chatType, id);
  }

  function clearDraft(chatType, id) {
    draftModule.clearDraft(chatType, id, {
      groupsList: groupModule.groupsList,
      friendsList: friendModule.friendsList,
      getGroupLastMessage: storageModule.getGroupLastMessage,
      getPrivateLastMessage: storageModule.getPrivateLastMessage
    });
  }

  function tempRestoreLastMessage(chatType, id) {
    draftModule.tempRestoreLastMessage(chatType, id, {
      groupsList: groupModule.groupsList,
      friendsList: friendModule.friendsList,
      getGroupLastMessage: storageModule.getGroupLastMessage,
      getPrivateLastMessage: storageModule.getPrivateLastMessage
    });
  }

  function setLastMessageToDraft(chatType, id) {
    draftModule.setLastMessageToDraft(chatType, id, {
      groupsList: groupModule.groupsList,
      friendsList: friendModule.friendsList
    });
  }

  function saveToStorage() {
    storageModule.saveToStorage(getContext());
  }

  function loadMessages(loadToStore = true) {
    return storageModule.loadMessages(loadToStore, getContext());
  }

  function clearMessages() {
    storageModule.clearMessages(getContext());
  }

  function processOfflineMessage(message, onlySaveToDB = false) {
    storageModule.processOfflineMessage(message, onlySaveToDB, getContext());
  }

  function fetchAndMergeOfflineMessages(onlySaveToDB = false) {
    return storageModule.fetchAndMergeOfflineMessages(onlySaveToDB, getContext());
  }

  function initializeMessages() {
    return storageModule.initializeMessages(getContext());
  }

  function saveMinIds() {
    storageModule.saveMinIds(getContext());
  }

  function loadMinIds() {
    storageModule.loadMinIds(getContext());
  }

  function refreshMessages() {
    storageModule.refreshMessages(getContext());
  }

  function formatMessageContent(message) {
    return storageModule.formatMessageContent(message);
  }

  function clearAllDeletedSessions() {
    return storageModule.clearAllDeletedSessions(getContext());
  }

  function clearAllUnreadCounts() {
    return unreadModule.clearAllUnreadCounts();
  }

  function getStorageKeyPrefix() {
    return baseModule.getStorageKeyPrefix();
  }

  return {
    onlineUsers: userModule.onlineUsers,
    offlineUsers: userModule.offlineUsers,
    groupsList: groupModule.groupsList,
    friendsList: friendModule.friendsList,
    publicMessages: publicModule.publicMessages,
    groupMessages: groupModule.groupMessages,
    privateMessages: friendModule.privateMessages,
    unreadMessages: unreadModule.unreadMessages,
    quotedMessage: inputModule.quotedMessage,
    setQuotedMessage: inputModule.setQuotedMessage,
    clearQuotedMessage: inputModule.clearQuotedMessage,
    clearOtherGroupMessages: groupModule.clearOtherGroupMessages,
    clearOtherPrivateMessages: friendModule.clearOtherPrivateMessages,
    clearPublicMessagesExceptRecent: publicModule.clearPublicMessagesExceptRecent,
    currentUser: baseModule.currentUser,
    currentSessionToken: baseModule.currentSessionToken,
    currentGroupId: sessionModule.currentGroupId,
    currentGroupName: sessionModule.currentGroupName,
    currentPrivateChatUserId: sessionModule.currentPrivateChatUserId,
    currentPrivateChatUsername: sessionModule.currentPrivateChatUsername,
    currentPrivateChatNickname: sessionModule.currentPrivateChatNickname,
    currentPrivateChatAvatarUrl: sessionModule.currentPrivateChatAvatarUrl,
    currentActiveChat: sessionModule.currentActiveChat,
    currentSendChatType: sessionModule.currentSendChatType,
    selectedGroupIdForCard: sessionModule.selectedGroupIdForCard,
    isConnected: baseModule.isConnected,
    loading: baseModule.loading,
    isFetchingOfflineMessages: baseModule.isFetchingOfflineMessages,
    showFetchingMessage: baseModule.showFetchingMessage,
    hasReceivedHistory: baseModule.hasReceivedHistory,
    hasReceivedGroupHistory: baseModule.hasReceivedGroupHistory,
    hasReceivedPrivateHistory: baseModule.hasReceivedPrivateHistory,
    mainMessageInput: inputModule.mainMessageInput,
    groupMessageInput: inputModule.groupMessageInput,
    privateMessageInput: inputModule.privateMessageInput,
    uploadProgress: inputModule.uploadProgress,
    showUploadProgress: inputModule.showUploadProgress,
    showGroupInfoModal: modalModule.showGroupInfoModal,
    showSendGroupCardModal: modalModule.showSendGroupCardModal,
    showCreateGroupModal: modalModule.showCreateGroupModal,
    showAddGroupMemberModal: modalModule.showAddGroupMemberModal,
    showUserProfileModal: modalModule.showUserProfileModal,
    showUserSearchModal: modalModule.showUserSearchModal,
    showImagePreviewModal: modalModule.showImagePreviewModal,
    showAvatarPreviewModal: modalModule.showAvatarPreviewModal,
    showUserAvatarPopup: modalModule.showUserAvatarPopup,
    showGroupCardPopup: modalModule.showGroupCardPopup,
    modalData: modalModule.modalData,
    SERVER_URL: baseModule.SERVER_URL,
    setCurrentUser,
    setCurrentSessionToken: baseModule.setCurrentSessionToken,
    setCurrentGroupId,
    setCurrentPrivateChatUserId,
    setCurrentActiveChat,
    openModal: modalModule.openModal,
    closeModal: modalModule.closeModal,
    addPublicMessage,
    addGroupMessage,
    addPrivateMessage,
    updatePrivateMessagesReadStatus,
    setPublicMessages,
    setGroupMessages,
    setPrivateMessages,
    prependPublicMessages,
    prependGroupMessages,
    prependPrivateMessages,
    clearPublicMessages,
    clearGroupMessages,
    clearPrivateMessages,
    deletePublicMessage,
    deleteGroupMessage,
    deletePrivateMessage,
    moveGroupToTop,
    moveFriendToTop,
    clearGroupUnread,
    clearPrivateUnread,
    clearGlobalUnread,
    loadUnreadCountsFromLocalStorage: unreadModule.loadUnreadCountsFromLocalStorage,
    loadUnreadCountsFromStorage: unreadModule.loadUnreadCountsFromStorage,
    saveUnreadCountsToLocalStorage: unreadModule.saveUnreadCountsToLocalStorage,
    saveUnreadCountsToLocalStorageDirect: unreadModule.saveUnreadCountsToLocalStorageDirect,
    incrementGroupUnread,
    incrementGlobalUnread,
    incrementPrivateUnread,
    sortFriendsByLastMessageTime: friendModule.sortFriendsByLastMessageTime,
    sortGroupsByLastMessageTime: groupModule.sortGroupsByLastMessageTime,
    setLoading: baseModule.setLoading,
    refreshMessages,
    saveToStorage,
    loadMessages,
    clearMessages,
    processOfflineMessage,
    fetchAndMergeOfflineMessages,
    initializeMessages,
    setGroupAllLoaded: groupModule.setGroupAllLoaded,
    isGroupAllLoaded: groupModule.isGroupAllLoaded,
    setPrivateAllLoaded: friendModule.setPrivateAllLoaded,
    isPrivateAllLoaded: friendModule.isPrivateAllLoaded,
    setPublicAllLoaded: publicModule.setPublicAllLoaded,
    isPublicAllLoaded: publicModule.isPublicAllLoaded,
    saveMinIds,
    loadMinIds,
    publicAndGroupMinId: storageModule.publicAndGroupMinId,
    privateMinId: storageModule.privateMinId,
    publicPageSize: publicModule.publicPageSize,
    publicPageOffset: publicModule.publicPageOffset,
    publicLoadingMore: publicModule.publicLoadingMore,
    groupPageSize: groupModule.groupPageSize,
    groupPageOffset: groupModule.groupPageOffset,
    groupLoadingMore: groupModule.groupLoadingMore,
    privatePageSize: friendModule.privatePageSize,
    privatePageOffset: friendModule.privatePageOffset,
    privateLoadingMore: friendModule.privateLoadingMore,
    getGroupLastMessage: storageModule.getGroupLastMessage,
    getPrivateLastMessage: storageModule.getPrivateLastMessage,
    formatMessageContent,
    updateGroupLastMessage,
    updateFriendLastMessage,
    groupsWithAtMe: groupModule.groupsWithAtMe,
    setGroupHasAtMe: groupModule.setGroupHasAtMe,
    clearGroupHasAtMe: groupModule.clearGroupHasAtMe,
    hasGroupAtMe: groupModule.hasGroupAtMe,
    loadGroupsWithAtMeFromLocalStorage: groupModule.loadGroupsWithAtMeFromLocalStorage,
    saveGroupsWithAtMeToLocalStorage: groupModule.saveGroupsWithAtMeToLocalStorage,
    updateGroupLastMessageAfterDelete: (groupId) => groupModule.updateGroupLastMessageAfterDelete(groupId, getContext()),
    updateFriendLastMessageAfterDelete: (userId) => friendModule.updateFriendLastMessageAfterDelete(userId, getContext()),
    findUserById: userModule.findUserById,
    getUserName: userModule.getUserName,
    getUserAvatar: userModule.getUserAvatar,
    updateUserInfoInMessages,
    markGroupAsDeleted,
    markFriendAsDeleted,
    drafts: draftModule.drafts,
    saveDraft,
    getDraft,
    clearDraft,
    tempRestoreLastMessage,
    setLastMessageToDraft,
    getStorageKeyPrefix,
    clearAllDeletedSessions,
    clearAllUnreadCounts,
    clearAllCache: storageModule.clearAllCache
  };
});
