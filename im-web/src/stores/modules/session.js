import { ref } from 'vue';

export function createSessionModule(getContext) {
  const currentGroupId = ref(null);
  const currentGroupName = ref('');
  const currentPrivateChatUserId = ref(null);
  const currentPrivateChatUsername = ref('');
  const currentPrivateChatNickname = ref('');
  const currentPrivateChatAvatarUrl = ref('');
  const currentActiveChat = ref('main');
  const currentSendChatType = ref('main');
  const selectedGroupIdForCard = ref(null);

  function setCurrentGroupId(id, context) {
    const { clearQuotedMessage, clearOtherGroupMessages, clearPublicMessagesExceptRecent, clearOtherPrivateMessages, clearGroupHasAtMe } = context;
    
    currentGroupId.value = id;
    clearQuotedMessage();
    clearOtherGroupMessages(id);
    clearPublicMessagesExceptRecent();
    clearOtherPrivateMessages(null);
    if (id) {
      clearGroupHasAtMe(id);
    }
  }

  function setCurrentPrivateChatUserId(id, context) {
    const { clearQuotedMessage, clearOtherPrivateMessages, clearPublicMessagesExceptRecent, clearOtherGroupMessages } = context;
    
    currentPrivateChatUserId.value = id;
    clearQuotedMessage();
    clearOtherPrivateMessages(id);
    clearPublicMessagesExceptRecent();
    clearOtherGroupMessages(null);
  }

  function setCurrentActiveChat(type, context) {
    const { clearQuotedMessage, clearPublicMessagesExceptRecent, clearOtherGroupMessages, clearOtherPrivateMessages, clearGroupHasAtMe } = context;
    
    currentActiveChat.value = type;
    clearQuotedMessage();
    if (type === 'main') {
      clearPublicMessagesExceptRecent();
      clearOtherGroupMessages(null);
      clearOtherPrivateMessages(null);
    } else if (type.startsWith('group_')) {
      const groupId = type.replace('group_', '');
      clearOtherGroupMessages(groupId);
      clearPublicMessagesExceptRecent();
      clearOtherPrivateMessages(null);
      if (groupId) {
        clearGroupHasAtMe(groupId);
      }
    } else if (type.startsWith('private_')) {
      const userId = type.replace('private_', '');
      clearOtherPrivateMessages(userId);
      clearPublicMessagesExceptRecent();
      clearOtherGroupMessages(null);
    }
  }

  return {
    currentGroupId,
    currentGroupName,
    currentPrivateChatUserId,
    currentPrivateChatUsername,
    currentPrivateChatNickname,
    currentPrivateChatAvatarUrl,
    currentActiveChat,
    currentSendChatType,
    selectedGroupIdForCard,
    setCurrentGroupId,
    setCurrentPrivateChatUserId,
    setCurrentActiveChat
  };
}
