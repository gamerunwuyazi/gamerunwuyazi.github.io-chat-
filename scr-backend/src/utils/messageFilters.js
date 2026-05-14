function processAtUserid(atUseridValue) {
  if (atUseridValue === undefined || atUseridValue === null) return null;
  
  let atUseridArray;
  
  if (typeof atUseridValue === 'string') {
    try {
      atUseridArray = JSON.parse(atUseridValue);
    } catch (e) {
      atUseridArray = [atUseridValue];
    }
  } else if (Array.isArray(atUseridValue)) {
    atUseridArray = atUseridValue;
  } else {
    atUseridArray = [atUseridValue];
  }
  
  const validIds = atUseridArray
    .filter(id => id !== null && id !== undefined && id !== '')
    .map(id => Number(id))
    .filter(id => !isNaN(id));
  
  return validIds.length > 0 ? validIds : null;
}

export function filterMessageFields(message, messageType) {
  let timestamp = message.timestamp;
  let timestampISO = message.timestampISO;
  
  if (timestamp instanceof Date) {
    timestampISO = timestamp.toISOString();
    timestamp = timestamp.getTime();
  } else if (typeof timestamp === 'string') {
    const date = new Date(timestamp);
    timestamp = date.getTime();
    timestampISO = timestampISO || date.toISOString();
  }
  
  const baseFields = {
    id: Number(message.id),
    userId: Number(message.userId),
    nickname: message.nickname,
    avatarUrl: message.avatarUrl,
    content: message.content,
    messageType: Number(message.messageType),
    timestamp: timestamp,
    timestampISO: timestampISO
  };

  if (messageType === 'public') {
    const atUserid = processAtUserid(message.atUserid || message.at_userid);
    if (atUserid) {
      baseFields.atUserid = atUserid;
    }
  } else if (messageType === 'group') {
    const atUserid = processAtUserid(message.atUserid || message.at_userid);
    if (atUserid) {
      baseFields.atUserid = atUserid;
    }
    baseFields.groupId = Number(message.groupId);
  } else if (messageType === 'private') {
    baseFields.senderId = Number(message.senderId);
    baseFields.receiverId = Number(message.receiverId);
    baseFields.isRead = message.isRead;
    delete baseFields.userId;
  }

  return baseFields;
}
