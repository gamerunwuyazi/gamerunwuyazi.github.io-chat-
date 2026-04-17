import { ref } from 'vue';

export function createInputModule() {
  const mainMessageInput = ref('');
  const groupMessageInput = ref('');
  const privateMessageInput = ref('');
  const uploadProgress = ref(0);
  const showUploadProgress = ref(false);
  const quotedMessage = ref(null);

  function setQuotedMessage(message) {
    quotedMessage.value = message;
  }

  function clearQuotedMessage() {
    quotedMessage.value = null;
  }

  return {
    mainMessageInput,
    groupMessageInput,
    privateMessageInput,
    uploadProgress,
    showUploadProgress,
    quotedMessage,
    setQuotedMessage,
    clearQuotedMessage
  };
}
