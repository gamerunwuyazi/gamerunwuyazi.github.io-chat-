    // 群组解散事件
    socket.on('group-dissolved', (data) => {
        loadGroupList();
        // 清除群组的最后消息时间记录
        if (data && data.groupId) {
            const store = window.chatStore;
            if (store && store.deleteGroupLastMessageTime) {
                store.deleteGroupLastMessageTime(data.groupId);
            }
            // 清除该群组的未读消息记录
            if (store && store.clearGroupUnread) {
                store.clearGroupUnread(data.groupId);
            }
            // 如果当前打开的群组就是解散的群组，清空当前群组
            if (store && String(store.currentGroupId) === String(data.groupId)) {
                store.setCurrentGroupId(null);
            }
        }
    });

    // 群组成员添加事件
    socket.on('members-added', (data) => {
        // console.log('📥 [群组] 收到成员添加事件:', data);
        // 刷新群组列表
        loadGroupList();
    });

    // 群组成员移除事件
    socket.on('member-removed', (data) => {
        // console.log('📥 [群组] 收到成员移除事件:', data);
        // 刷新群组列表
        loadGroupList();
        // 如果是自己被移除，清空当前群组
        if (data && data.groupId && data.userId) {
            const store = window.chatStore;
            if (store && String(store.currentGroupId) === String(data.groupId) && 
                String(store.currentUser?.id) === String(data.userId)) {
                store.setCurrentGroupId(null);
            }
        }
    });