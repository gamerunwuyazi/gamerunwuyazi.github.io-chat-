import { defineStore } from 'pinia';
import { ref } from 'vue';
import { sendReadMessageEvent, sendClearGroupUnread, sendClearGlobalUnread, updateUnreadCountsDisplay } from '@/utils/chat';
import { useBaseStore } from './baseStore';

export const useUnreadStore = defineStore('unread', () => {
  const unreadMessages = ref({
    global: 0,
    groups: {},
    private: {}
  });

  const hasPublicAtMe = ref(false);

  function clearGroupUnread(groupId) {
    loadUnreadCountsFromLocalStorage();
    const groupIdStr = String(groupId);
    let hasUnreadToClear = false;
    if (unreadMessages.value.groups && unreadMessages.value.groups[groupIdStr]) {
      delete unreadMessages.value.groups[groupIdStr];
      hasUnreadToClear = true;
    }
    saveUnreadCountsToLocalStorage();
    if (hasUnreadToClear) sendClearGroupUnread(groupId);
  }

  function clearPrivateUnread(userId) {
    loadUnreadCountsFromLocalStorage();
    const userIdStr = String(userId);
    let hasUnreadToClear = false;
    if (unreadMessages.value.private && unreadMessages.value.private[userIdStr]) {
      delete unreadMessages.value.private[userIdStr];
      hasUnreadToClear = true;
    }
    saveUnreadCountsToLocalStorage();
    if (hasUnreadToClear && sendReadMessageEvent) sendReadMessageEvent('private', { friendId: userId });
  }

  function clearGlobalUnread() {
    loadUnreadCountsFromLocalStorage();
    let hasUnreadToClear = unreadMessages.value.global > 0;
    unreadMessages.value.global = 0;
    hasPublicAtMe.value = false;
    saveUnreadCountsToLocalStorage();
    if (hasUnreadToClear) sendClearGlobalUnread();
  }

  function incrementGroupUnread(groupId) {
    loadUnreadCountsFromLocalStorage();
    const groupIdStr = String(groupId);
    if (!unreadMessages.value.groups[groupIdStr]) unreadMessages.value.groups[groupIdStr] = 0;
    unreadMessages.value.groups[groupIdStr]++;
    saveUnreadCountsToLocalStorage();
  }

  function incrementGlobalUnread() {
    loadUnreadCountsFromLocalStorage();
    unreadMessages.value.global++;
    saveUnreadCountsToLocalStorage();
  }

  function incrementPrivateUnread(userId) {
    loadUnreadCountsFromLocalStorage();
    const userIdStr = String(userId);
    if (!unreadMessages.value.private[userIdStr]) unreadMessages.value.private[userIdStr] = 0;
    unreadMessages.value.private[userIdStr]++;
    saveUnreadCountsToLocalStorage();
  }

  function loadUnreadCountsFromLocalStorage() {
    const baseStore = useBaseStore();
    try {
      let userId = baseStore.currentUser?.id || null;
      if (!userId) {
        const storedUserId = localStorage.getItem('chatUserId');
        if (storedUserId) userId = storedUserId;
      }
      if (!userId) return;
      const data = localStorage.getItem(`unread_counts_${userId}`);
      if (data) {
        const counts = JSON.parse(data);
        unreadMessages.value.global = counts.global || 0;
        unreadMessages.value.groups = counts.groups || {};
        unreadMessages.value.private = counts.private || {};
      }
    } catch (err) {}
  }

  function loadUnreadCountsFromStorage() {
    const baseStore = useBaseStore();
    try {
      let userId = baseStore.currentUser?.id || null;
      if (!userId) {
        const storedUserId = localStorage.getItem('chatUserId');
        if (storedUserId) userId = storedUserId;
      }
      if (!userId) return { global: 0, groups: {}, private: {} };
      const data = localStorage.getItem(`unread_counts_${userId}`);
      if (data) return JSON.parse(data);
    } catch (err) {}
    return { global: 0, groups: {}, private: {} };
  }

  function saveUnreadCountsToLocalStorage() {
    const baseStore = useBaseStore();
    try {
      let userId = baseStore.currentUser?.id || null;
      if (!userId) {
        const storedUserId = localStorage.getItem('chatUserId');
        if (storedUserId) userId = storedUserId;
      }
      if (!userId) return;
      const counts = { global: unreadMessages.value.global, groups: unreadMessages.value.groups, private: unreadMessages.value.private };
      localStorage.setItem(`unread_counts_${userId}`, JSON.stringify(counts));
    } catch (err) {}
  }

  function saveUnreadCountsToLocalStorageDirect(counts) {
    const baseStore = useBaseStore();
    try {
      let userId = baseStore.currentUser?.id || null;
      if (!userId) {
        const storedUserId = localStorage.getItem('chatUserId');
        if (storedUserId) userId = storedUserId;
      }
      if (!userId) return;
      localStorage.setItem(`unread_counts_${userId}`, JSON.stringify(counts));
      unreadMessages.value.global = counts.global || 0;
      unreadMessages.value.groups = counts.groups || {};
      unreadMessages.value.private = counts.private || {};
    } catch (err) {}
  }

  function clearAllUnreadCounts() {
    loadUnreadCountsFromLocalStorage();
    unreadMessages.value.global = 0;
    unreadMessages.value.groups = {};
    unreadMessages.value.private = {};
    hasPublicAtMe.value = false;
    saveUnreadCountsToLocalStorage();
    if (typeof updateUnreadCountsDisplay === 'function') updateUnreadCountsDisplay();
    return true;
  }

  function setPublicHasAtMe() {
    hasPublicAtMe.value = true;
  }

  function clearPublicHasAtMe() {
    hasPublicAtMe.value = false;
  }

  return {
    unreadMessages,
    hasPublicAtMe,
    clearGroupUnread,
    clearPrivateUnread,
    clearGlobalUnread,
    incrementGroupUnread,
    incrementGlobalUnread,
    incrementPrivateUnread,
    loadUnreadCountsFromLocalStorage,
    loadUnreadCountsFromStorage,
    saveUnreadCountsToLocalStorage,
    saveUnreadCountsToLocalStorageDirect,
    clearAllUnreadCounts,
    setPublicHasAtMe,
    clearPublicHasAtMe
  };
});
