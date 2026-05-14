import { defineStore } from 'pinia';
import { ref } from 'vue';
import { sendReadMessageEvent, updateUnreadCountsDisplay } from '@/utils/chat';
import { useBaseStore } from './baseStore';

export const useUnreadStore = defineStore('unread', () => {
  const unreadMessages = ref({
    global: 0,
    groups: {},
    private: {}
  });

  function clearGroupUnread(groupId) {
    loadUnreadCountsFromLocalStorage();
    const groupIdStr = String(groupId);
    if (unreadMessages.value.groups && unreadMessages.value.groups[groupIdStr]) {
      delete unreadMessages.value.groups[groupIdStr];
    }
    saveUnreadCountsToLocalStorage();
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
    unreadMessages.value.global = 0;
    saveUnreadCountsToLocalStorage();
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
      const userId = baseStore.currentUser?.id || null;
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
      const userId = baseStore.currentUser?.id || null;
      if (!userId) return { global: 0, groups: {}, private: {} };
      const data = localStorage.getItem(`unread_counts_${userId}`);
      if (data) return JSON.parse(data);
    } catch (err) {}
    return { global: 0, groups: {}, private: {} };
  }

  function saveUnreadCountsToLocalStorage() {
    const baseStore = useBaseStore();
    try {
      const userId = baseStore.currentUser?.id || null;
      if (!userId) return;
      const counts = { global: unreadMessages.value.global, groups: unreadMessages.value.groups, private: unreadMessages.value.private };
      localStorage.setItem(`unread_counts_${userId}`, JSON.stringify(counts));
    } catch (err) {}
  }

  function saveUnreadCountsToLocalStorageDirect(counts) {
    const baseStore = useBaseStore();
    try {
      const userId = baseStore.currentUser?.id || null;
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
    saveUnreadCountsToLocalStorage();
    if (typeof updateUnreadCountsDisplay === 'function') updateUnreadCountsDisplay();
    return true;
  }

  return {
    unreadMessages,
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
    clearAllUnreadCounts
  };
});
