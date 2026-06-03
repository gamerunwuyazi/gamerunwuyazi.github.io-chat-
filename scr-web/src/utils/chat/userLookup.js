export function findUserInfo(quotedMessage, storeContext) {
  if (!quotedMessage) return { nickname: '', avatarUrl: '' };
  let nickname = quotedMessage.nickname || '';
  let avatarUrl = quotedMessage.avatarUrl || '';
  if (!nickname || !avatarUrl) {
    const uid = String(quotedMessage.userId || '');
    if (uid) {
      const { sessionStore, groupStore, friendStore, publicStore, baseStore } = storeContext;
      const currentUserId = baseStore?.currentUser?.id;
      if (currentUserId !== undefined && String(currentUserId) === uid) {
        if (!nickname) nickname = baseStore.currentUser.nickname || '';
        if (!avatarUrl) avatarUrl = baseStore.currentUser.avatarUrl || '';
      } else {
        const groupId = sessionStore.currentGroupId;
        if (groupId && groupStore.groups?.[groupId]) {
          const members = groupStore.groups[groupId].members || [];
          const member = members.find(m => String(m.id || m.user_id || m.userId) === uid);
          if (member) {
            if (!nickname) nickname = member.group_nickname || member.nickname || '';
            if (!avatarUrl) avatarUrl = member.avatar_url || member.avatarUrl || member.avatar || '';
          }
        }
        if (!nickname || !avatarUrl) {
          const friends = friendStore.friends || [];
          const friend = friends.find(f => String(f.id || f.userId) === uid);
          if (friend) {
            if (!nickname) nickname = friend.nickname || '';
            if (!avatarUrl) avatarUrl = friend.avatarUrl || friend.avatar_url || '';
          }
        }
        if (!nickname || !avatarUrl) {
          const publicUser = publicStore.getPublicUser?.(uid);
          if (publicUser) {
            if (!nickname) nickname = publicUser.nickname || '';
            if (!avatarUrl) avatarUrl = publicUser.avatarUrl || publicUser.avatar_url || '';
          }
        }
      }
    }
  }
  return { nickname, avatarUrl };
}