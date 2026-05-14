import { defineStore } from 'pinia';
import { ref, toRaw } from 'vue';
import { useStorageStore } from './storageStore';
import { useBaseStore } from './baseStore';

export const usePublicStore = defineStore('public', () => {
  const publicMessages = ref([]);
  const publicAllLoaded = ref(false);
  const publicStored = ref(false);
  const publicPageSize = ref(20);
  const publicPageOffset = ref(0);
  const publicLoadingMore = ref(false);

  function addPublicMessage(message) {
    const storageStore = useStorageStore();
    const baseStore = useBaseStore();

    const isWithdrawMessage = message.messageType === 101;
    const isUserInfoUpdateMessage = message.messageType === 102;
    const messages = baseStore.loading ? storageStore.getCachePublic() : publicMessages.value;
    const exists = messages.some(m => m.id === message.id);
    if (!exists && !isWithdrawMessage && !isUserInfoUpdateMessage) messages.push(message);

    if (!storageStore.fullPublicMessages || storageStore.fullPublicMessages === null || !storageStore.fullPublicMessages) {
      storageStore.fullPublicMessages = [message];
    } else {
      const fullExists = storageStore.fullPublicMessages.some(m => m.id === message.id);
      if (!fullExists) storageStore.fullPublicMessages.push(message);
    }
    if (message.id && message.id > storageStore.publicAndGroupMinId) {
      storageStore.publicAndGroupMinId = message.id;
      storageStore.saveMinIds();
    }
    if (!baseStore.loading) {
      publicStored.value = false;
      storageStore.saveToStorage();
    }
  }

  function setPublicMessages(messages) {
    const storageStore = useStorageStore();
    const baseStore = useBaseStore();

    if (baseStore.loading) {
      storageStore.getCachePublic().length = 0;
      storageStore.getCachePublic().push(...messages.filter(m => m.messageType !== 101 && m.messageType !== 102));
    } else {
      if (!storageStore.fullPublicMessages || storageStore.fullPublicMessages === null || !storageStore.fullPublicMessages) {
        storageStore.fullPublicMessages = [...messages];
      } else {
        const fullExistingIds = new Set(storageStore.fullPublicMessages.map(m => m.id));
        const fullNewMessages = messages.filter(m => !fullExistingIds.has(m.id));
        storageStore.fullPublicMessages = [...storageStore.fullPublicMessages, ...fullNewMessages];
      }
      const filteredMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
      publicMessages.value = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
      publicStored.value = false;
      storageStore.saveToStorage();
    }
  }

  function prependPublicMessages(messages) {
    const storageStore = useStorageStore();
    const baseStore = useBaseStore();

    const targetMessages = baseStore.loading ? storageStore.getCachePublic() : publicMessages.value;
    const existingIds = new Set(targetMessages.map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id));
    const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);

    if (baseStore.loading) {
      displayNewMessages.sort((a, b) => a.id - b.id);
      storageStore.getCachePublic().unshift(...displayNewMessages);
    } else {
      if (storageStore.fullPublicMessages && storageStore.fullPublicMessages !== null) {
        const fullIds = new Set(storageStore.fullPublicMessages.map(m => m.id));
        const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
        fullNewMessages.sort((a, b) => a.id - b.id);
        storageStore.fullPublicMessages = [...fullNewMessages, ...storageStore.fullPublicMessages];
      } else {
        storageStore.fullPublicMessages = [...displayNewMessages];
      }
      displayNewMessages.sort((a, b) => a.id - b.id);
      publicMessages.value = [...displayNewMessages, ...publicMessages.value];
      publicStored.value = false;
      storageStore.saveToStorage();
    }
  }

  function clearPublicMessages() {
    const storageStore = useStorageStore();
    publicMessages.value = [];
    publicStored.value = false;
    storageStore.saveToStorage();
  }

  function deletePublicMessage(messageId) {
    const storageStore = useStorageStore();

    const index = publicMessages.value.findIndex(m => String(m.id) === String(messageId));
    if (index !== -1) publicMessages.value.splice(index, 1);

    if (storageStore.fullPublicMessages) {
      const fullIndex = storageStore.fullPublicMessages.findIndex(m => String(m.id) === String(messageId));
      if (fullIndex !== -1) storageStore.fullPublicMessages.splice(fullIndex, 1);
    }

    publicStored.value = false;
    storageStore.saveToStorage();
  }

  function clearPublicMessagesExceptRecent() {
    if (publicMessages.value.length > 20) {
      publicMessages.value = publicMessages.value.slice(Math.max(0, publicMessages.value.length - 20), publicMessages.value.length);
    }
  }

  function setPublicAllLoaded(value) {
    publicAllLoaded.value = value;
  }

  function isPublicAllLoaded() {
    return publicAllLoaded.value;
  }

  function updateQuotedMessage(messageId, newContent) {
    const storageStore = useStorageStore();
    let updated = false;

    const index = publicMessages.value.findIndex(m => String(m.id) === String(messageId));
    if (index !== -1) {
      publicMessages.value[index] = toRaw({ ...toRaw(publicMessages.value[index]), content: newContent });
      updated = true;
    }

    if (storageStore.fullPublicMessages) {
      const fullIndex = storageStore.fullPublicMessages.findIndex(m => String(m.id) === String(messageId));
      if (fullIndex !== -1) {
        storageStore.fullPublicMessages[fullIndex] = toRaw({ ...toRaw(storageStore.fullPublicMessages[fullIndex]), content: newContent });
        updated = true;
      }
    }

    if (updated) {
      publicStored.value = false;
      storageStore.saveToStorage();
    }

    return updated;
  }

  return {
    publicMessages,
    publicAllLoaded,
    publicStored,
    publicPageSize,
    publicPageOffset,
    publicLoadingMore,
    addPublicMessage,
    setPublicMessages,
    prependPublicMessages,
    clearPublicMessages,
    deletePublicMessage,
    clearPublicMessagesExceptRecent,
    setPublicAllLoaded,
    isPublicAllLoaded,
    updateQuotedMessage
  };
});
