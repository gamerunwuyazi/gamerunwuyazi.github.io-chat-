import { ref } from 'vue';

export function createPublicModule(getContext) {
  const publicMessages = ref([]);
  const publicAllLoaded = ref(false);
  const publicStored = ref(false);
  const publicPageSize = ref(20);
  const publicPageOffset = ref(0);
  const publicLoadingMore = ref(false);

  function addPublicMessage(message, context) {
    const { loading, cachePublicMessages, fullPublicMessages, publicAndGroupMinId, saveMinIds, saveToStorage } = context;
    
    const isWithdrawMessage = message.messageType === 101;
    const isUserInfoUpdateMessage = message.messageType === 102;
    const messages = loading.value ? cachePublicMessages : publicMessages.value;
    const exists = messages.some(m => m.id === message.id);
    if (!exists && !isWithdrawMessage && !isUserInfoUpdateMessage) {
      messages.push(message);
    }
    if (!fullPublicMessages.value || fullPublicMessages.value === null) {
      fullPublicMessages.value = [message];
    } else {
      const fullExists = fullPublicMessages.value.some(m => m.id === message.id);
      if (!fullExists) {
        fullPublicMessages.value.push(message);
      }
    }
    if (message.id && message.id > publicAndGroupMinId.value) {
      publicAndGroupMinId.value = message.id;
      if (saveMinIds) {
        saveMinIds();
      }
    }
    if (!loading.value) {
      publicStored.value = false;
      saveToStorage();
    }
  }

  function setPublicMessages(messages, context) {
    const { loading, cachePublicMessages, fullPublicMessages, saveToStorage } = context;
    
    if (loading.value) {
      cachePublicMessages.length = 0;
      cachePublicMessages.push(...messages.filter(m => m.messageType !== 101 && m.messageType !== 102));
    } else {
      if (!fullPublicMessages.value || fullPublicMessages.value === null) {
        fullPublicMessages.value = [...messages];
      } else {
        const fullExistingIds = new Set(fullPublicMessages.value.map(m => m.id));
        const fullNewMessages = messages.filter(m => !fullExistingIds.has(m.id));
        fullPublicMessages.value = [...fullPublicMessages.value, ...fullNewMessages];
      }
      const filteredMessages = messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
      publicMessages.value = filteredMessages.slice(Math.max(0, filteredMessages.length - 20), filteredMessages.length);
      publicStored.value = false;
      saveToStorage();
    }
  }

  function prependPublicMessages(messages, context) {
    const { loading, cachePublicMessages, fullPublicMessages, saveToStorage } = context;
    
    const targetMessages = loading.value ? cachePublicMessages : publicMessages.value;
    const existingIds = new Set(targetMessages.map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id));
    const displayNewMessages = newMessages.filter(m => m.messageType !== 101 && m.messageType !== 102);
    
    if (loading.value) {
      displayNewMessages.sort((a, b) => a.id - b.id);
      cachePublicMessages.unshift(...displayNewMessages);
    } else {
      if (fullPublicMessages.value && fullPublicMessages.value !== null) {
        const fullIds = new Set(fullPublicMessages.value.map(m => m.id));
        const fullNewMessages = newMessages.filter(m => !fullIds.has(m.id));
        fullNewMessages.sort((a, b) => a.id - b.id);
        fullPublicMessages.value = [...fullNewMessages, ...fullPublicMessages.value];
      } else {
        fullPublicMessages.value = [...displayNewMessages];
      }
      displayNewMessages.sort((a, b) => a.id - b.id);
      publicMessages.value = [...displayNewMessages, ...publicMessages.value];
      publicStored.value = false;
      saveToStorage();
    }
  }

  function clearPublicMessages(context) {
    const { saveToStorage } = context;
    publicMessages.value = [];
    publicStored.value = false;
    saveToStorage();
  }

  function deletePublicMessage(messageId, context) {
    const { fullPublicMessages, saveToStorage } = context;
    
    const index = publicMessages.value.findIndex(m => String(m.id) === String(messageId));
    if (index !== -1) {
      publicMessages.value.splice(index, 1);
    }
    if (fullPublicMessages.value) {
      const fullIndex = fullPublicMessages.value.findIndex(m => String(m.id) === String(messageId));
      if (fullIndex !== -1) {
        fullPublicMessages.value.splice(fullIndex, 1);
      }
    }
    publicStored.value = false;
    saveToStorage();
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
    isPublicAllLoaded
  };
}
