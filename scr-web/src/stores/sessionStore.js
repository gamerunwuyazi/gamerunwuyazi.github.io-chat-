import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useBaseStore } from './baseStore';
import { useGroupStore } from './groupStore';
import { useFriendStore } from './friendStore';
import { usePublicStore } from './publicStore';
import { useInputStore } from './inputStore';

export const useSessionStore = defineStore('session', () => {
  const currentGroupId = ref(null);
  const currentGroupName = ref('');
  const currentPrivateChatUserId = ref(null);
  const currentPrivateChatUsername = ref('');
  const currentPrivateChatNickname = ref('');
  const currentPrivateChatAvatarUrl = ref('');
  const currentActiveChat = ref('main');
  const currentSendChatType = ref('main');
  const selectedGroupIdForCard = ref(null);

  function setCurrentGroupId(id) {
    const groupStore = useGroupStore();
    const friendStore = useFriendStore();
    const publicStore = usePublicStore();
    const baseStore = useBaseStore();

    currentGroupId.value = id;
    const inputStore = useInputStore();
    if (inputStore) inputStore.clearQuotedMessage();
    if (groupStore) groupStore.clearOtherGroupMessages(id);
    if (publicStore) publicStore.clearPublicMessagesExceptRecent();
    if (friendStore) friendStore.clearOtherPrivateMessages(null);
    if (id && groupStore) groupStore.clearGroupHasAtMe(id);
  }

  function setCurrentPrivateChatUserId(id) {
    const groupStore = useGroupStore();
    const friendStore = useFriendStore();
    const publicStore = usePublicStore();
    const inputStore = useInputStore();

    currentPrivateChatUserId.value = id;
    if (inputStore) inputStore.clearQuotedMessage();
    if (friendStore) friendStore.clearOtherPrivateMessages(id);
    if (publicStore) publicStore.clearPublicMessagesExceptRecent();
    if (groupStore) groupStore.clearOtherGroupMessages(null);
  }

  function setCurrentActiveChat(type) {
    const groupStore = useGroupStore();
    const friendStore = useFriendStore();
    const publicStore = usePublicStore();
    const inputStore = useInputStore();

    currentActiveChat.value = type;
    if (inputStore) inputStore.clearQuotedMessage();
    if (type === 'main') {
      if (publicStore) publicStore.clearPublicMessagesExceptRecent();
      if (groupStore) groupStore.clearOtherGroupMessages(null);
      if (friendStore) friendStore.clearOtherPrivateMessages(null);
    } else if (type.startsWith('group_')) {
      const groupId = type.replace('group_', '');
      if (groupStore) groupStore.clearOtherGroupMessages(groupId);
      if (publicStore) publicStore.clearPublicMessagesExceptRecent();
      if (friendStore) friendStore.clearOtherPrivateMessages(null);
      if (groupId && groupStore) groupStore.clearGroupHasAtMe(groupId);
    } else if (type.startsWith('private_')) {
      const userId = type.replace('private_', '');
      if (friendStore) friendStore.clearOtherPrivateMessages(userId);
      if (publicStore) publicStore.clearPublicMessagesExceptRecent();
      if (groupStore) groupStore.clearOtherGroupMessages(null);
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
});
