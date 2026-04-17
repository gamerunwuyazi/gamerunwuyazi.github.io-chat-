import { ref } from 'vue';

export function createDraftModule(getContext) {
  const drafts = ref({
    main: '',
    groups: {},
    private: {}
  });

  function saveDraft(chatType, id, content, context) {
    const { groupsList, friendsList, getGroupLastMessage, getPrivateLastMessage } = context;
    
    if (chatType === 'main') {
      drafts.value.main = content;
    } else if (chatType === 'group' && id) {
      drafts.value.groups[id] = content;
      if (groupsList && groupsList.value) {
        const group = groupsList.value.find(g => String(g.id) === String(id));
        if (group) {
          if (content) {
            group.lastMessage = {
              content: `[草稿] ${content}`,
              nickname: '我',
              messageType: 0
            };
          } else {
            const lastMsg = getGroupLastMessage(id);
            group.lastMessage = lastMsg;
          }
        }
      }
    } else if (chatType === 'private' && id) {
      drafts.value.private[id] = content;
      if (friendsList && friendsList.value) {
        const friend = friendsList.value.find(f => String(f.id) === String(id));
        if (friend) {
          if (content) {
            friend.lastMessage = {
              content: `[草稿] ${content}`,
              nickname: '我',
              messageType: 0
            };
          } else {
            const lastMsg = getPrivateLastMessage(id);
            friend.lastMessage = lastMsg;
          }
        }
      }
    }
  }

  function getDraft(chatType, id) {
    if (chatType === 'main') {
      return drafts.value.main || '';
    } else if (chatType === 'group' && id) {
      return drafts.value.groups[id] || '';
    } else if (chatType === 'private' && id) {
      return drafts.value.private[id] || '';
    }
    return '';
  }

  function clearDraft(chatType, id, context) {
    const { groupsList, friendsList, getGroupLastMessage, getPrivateLastMessage } = context;
    
    if (chatType === 'main') {
      drafts.value.main = '';
    } else if (chatType === 'group' && id) {
      delete drafts.value.groups[id];
      if (groupsList && groupsList.value) {
        const group = groupsList.value.find(g => String(g.id) === String(id));
        if (group) {
          const lastMsg = getGroupLastMessage(id);
          group.lastMessage = lastMsg;
        }
      }
    } else if (chatType === 'private' && id) {
      delete drafts.value.private[id];
      if (friendsList && friendsList.value) {
        const friend = friendsList.value.find(f => String(f.id) === String(id));
        if (friend) {
          const lastMsg = getPrivateLastMessage(id);
          friend.lastMessage = lastMsg;
        }
      }
    }
  }

  function tempRestoreLastMessage(chatType, id, context) {
    const { groupsList, friendsList, getGroupLastMessage, getPrivateLastMessage } = context;
    
    if (chatType === 'group' && id) {
      if (groupsList && groupsList.value) {
        const group = groupsList.value.find(g => String(g.id) === String(id));
        if (group) {
          const lastMsg = getGroupLastMessage(id);
          group.lastMessage = lastMsg;
        }
      }
    } else if (chatType === 'private' && id) {
      if (friendsList && friendsList.value) {
        const friend = friendsList.value.find(f => String(f.id) === String(id));
        if (friend) {
          const lastMsg = getPrivateLastMessage(id);
          friend.lastMessage = lastMsg;
        }
      }
    }
  }

  function setLastMessageToDraft(chatType, id, context) {
    const { groupsList, friendsList } = context;
    
    if (chatType === 'group' && id) {
      const draftContent = drafts.value.groups[id];
      if (draftContent && groupsList && groupsList.value) {
        const group = groupsList.value.find(g => String(g.id) === String(id));
        if (group) {
          group.lastMessage = {
            content: `[草稿] ${draftContent}`,
            nickname: '我',
            messageType: 0
          };
        }
      }
    } else if (chatType === 'private' && id) {
      const draftContent = drafts.value.private[id];
      if (draftContent && friendsList && friendsList.value) {
        const friend = friendsList.value.find(f => String(f.id) === String(id));
        if (friend) {
          friend.lastMessage = {
            content: `[草稿] ${draftContent}`,
            nickname: '我',
            messageType: 0
          };
        }
      }
    }
  }

  return {
    drafts,
    saveDraft,
    getDraft,
    clearDraft,
    tempRestoreLastMessage,
    setLastMessageToDraft
  };
}
