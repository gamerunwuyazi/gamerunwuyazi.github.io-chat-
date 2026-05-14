import localForage from 'localforage';

import modal from '../modal.js';

import { SERVER_URL, toast } from './config.js';
import {
  useBaseStore,
  useSessionStore,
  useGroupStore,
  useModalStore,
  useUnreadStore,
  useDraftStore,
  getChatSocket,
  openGroupCardPopup
} from '@/stores/index.js';
import {
  updateUnreadCountsDisplay,
  setActiveChatDirect,
  updateGroupListDisplay
} from './ui.js';
import { navigateTo } from './routerInstance.js';


let groupsList = [];
let currentSharedGroup = null;
let switchingGroupWithExistingMessages = false;
let groupChatAllLoaded = {};

async function loadGroupList() {
    const baseStore = useBaseStore();
    const currentUser = baseStore.currentUser;
    const currentSessionToken = baseStore.currentSessionToken;
    if (!currentUser || !currentSessionToken) return;

    try {
        const response = await fetch(`${SERVER_URL}/api/user-groups/${currentUser.id}`, {
            headers: {
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            }
        });
        const data = await response.json();
        if (data.status === 'success') {
            await updateGroupList(data.groups);
        }
    } catch (e) {
        console.error('加载群组列表失败:', e);
    }
}

function getMutedGroups() {
    const mutedGroups = localStorage.getItem('mutedGroups');
    return mutedGroups ? JSON.parse(mutedGroups) : [];
}

function isGroupMuted(groupId) {
    const mutedGroups = getMutedGroups();
    return mutedGroups.includes(groupId.toString());
}

function toggleGroupMute(groupId) {
    const mutedGroups = getMutedGroups();
    const groupIdStr = groupId.toString();
    let updatedGroups;

    if (mutedGroups.includes(groupIdStr)) {
        updatedGroups = mutedGroups.filter(id => id !== groupIdStr);
    } else {
        updatedGroups = [...mutedGroups, groupIdStr];
    }

    localStorage.setItem('mutedGroups', JSON.stringify(updatedGroups));
    updateGroupListDisplay();
    updateUnreadCountsDisplay();
    return !mutedGroups.includes(groupIdStr);
}

async function handleDissolveGroup(groupId) {
    const confirmed = await modal.confirm('确定要解散该群组吗？此操作不可恢复，所有群消息将被删除。', '解散群组', 'error');
    if (confirmed) {
        dissolveGroup(groupId);
    }
}

async function handleLeaveGroup(groupId) {
    const baseStore = useBaseStore();
    const sessionStore = useSessionStore();
    const groupStore = useGroupStore();
    const modalStore = useModalStore();
    const currentUser = baseStore.currentUser;
    const currentSessionToken = baseStore.currentSessionToken;
    const confirmed = await modal.confirm('确定要退出该群组吗？', '退出群组');
    if (!confirmed) {
        return;
    }
    
    try {
        const response = await fetch(`${SERVER_URL}/api/leave-group`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            },
            body: JSON.stringify({
                groupId: groupId
            })
        });
        
        const data = await response.json();
        if (data.success || data.status === 'success') {
            toast.success('已成功退出群组');
            loadGroupList();

            if (modalStore) {
                modalStore.closeModal('groupInfo');
            }
            if (sessionStore) {
                sessionStore.setCurrentGroupId(null);
            }
            
            if (groupStore) {
                await groupStore.markGroupAsDeleted(groupId, false);
            }

            const groupEmptyState = document.getElementById('groupEmptyState');
            const groupChatInterface = document.getElementById('groupChatInterface');
            const currentGroupNameElement = document.getElementById('currentGroupName');

            if (groupEmptyState) {
                groupEmptyState.style.display = 'flex';
            }
            if (groupChatInterface) {
                groupChatInterface.style.display = 'none';
            }
            if (currentGroupNameElement) {
                currentGroupNameElement.textContent = '群组名称';
            }
        } else {
            toast.error('退出群组失败: ' + (data.message || '未知错误'));
        }
    } catch (error) {
        console.error('退出群组失败:', error);
        toast.error('退出群组失败，网络错误');
    }
}

async function dissolveGroup(groupId) {
    const baseStore = useBaseStore();
    const sessionStore = useSessionStore();
    const groupStore = useGroupStore();
    const currentUser = baseStore.currentUser;
    const currentSessionToken = baseStore.currentSessionToken;
    if (!currentUser || !currentSessionToken) {
        toast.error('请先登录');
        return;
    }

    const confirmed = await modal.confirm('确定要解散本群组吗？此操作不可恢复，所有群消息将被删除。', '解散群组', 'error');
    if (!confirmed) {
        return;
    }

    fetch(`${SERVER_URL}/api/dissolve-group`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: JSON.stringify({
            userId: currentUser.id,
            groupId: groupId
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success || data.status === 'success') {
                toast.success('群组已成功解散，所有群消息已删除');

                if (sessionStore) {
                    sessionStore.setCurrentGroupId(null);
                    sessionStore.currentGroupName = '';
                    sessionStore.setCurrentActiveChat('main');
                }
                
                if (groupStore) {
                    groupStore.markGroupAsDeleted(groupId, true);
                }

                loadGroupList();
            } else {
                toast.error('解散群组失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(() => {
            toast.error('解散群组失败，网络错误');
        });
}

function loadGroupMembers(groupId, isOwner) {

    const baseStore = useBaseStore();
    const currentUser = baseStore.currentUser;
    const currentSessionToken = baseStore.currentSessionToken;

    const groupMembersContainer = document.getElementById('groupMembersContainer');
    const modalGroupMemberCount = document.getElementById('modalGroupMemberCount');
    if (!groupMembersContainer) {
        return;
    }

    groupMembersContainer.innerHTML = '<div class="loading-members">正在加载成员列表...</div>';


    fetch(`${SERVER_URL}/api/group-members/${groupId}`, {
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        }
    })
        .then(response => response.json())
        .then(data => {


            if (data.status === 'success') {

                updateGroupMembersList(data.members, isOwner, groupId);
                modalGroupMemberCount.textContent = data.members.length;
            } else {
                const errorMsg = data.message || '未知错误';
                groupMembersContainer.innerHTML = `<div class="loading-members">加载成员列表失败: ${errorMsg}</div>`;
            }
        })
        .catch(() => {
            groupMembersContainer.innerHTML = '<div class="loading-members">加载成员列表失败，网络错误</div>';
        });
}

function updateGroupMembersList(members, isOwner, groupId) {

    const baseStore = useBaseStore();
    const currentUser = baseStore.currentUser;

    const groupMembersContainer = document.getElementById('groupMembersContainer');
    if (!groupMembersContainer) {
        return;
    }

    if (!members || !Array.isArray(members) || members.length === 0) {

        groupMembersContainer.innerHTML = '<div class="loading-members">没有可用的成员</div>';
        return;
    }


    let membersHtml = '';
    members.forEach((member) => {
        const isMemberOwner = String(member.id) === String(currentUser.id);

        membersHtml += `
            <div class="group-member-item">
                <div class="group-member-info">
                    <span class="group-member-name">${member.nickname}</span>
                    <span class="group-member-id">ID: ${member.id}</span>
                    ${isMemberOwner ? '<span class="group-member-role">（我）</span>' : ''}
                </div>
                ${isOwner && !isMemberOwner ? `
                    <button class="kick-member-btn" data-group-id="${groupId}" data-member-id="${member.id}" data-member-name="${member.nickname}">
                        踢出
                    </button>
                ` : ''}
            </div>
        `;
    });


    groupMembersContainer.innerHTML = membersHtml;

    if (isOwner) {
        const kickButtons = groupMembersContainer.querySelectorAll('.kick-member-btn');


        kickButtons.forEach(button => {
            button.addEventListener('click', function() {
                const groupId = this.getAttribute('data-group-id');
                const memberId = this.getAttribute('data-member-id');
                const memberName = this.getAttribute('data-member-name');


                removeMemberFromGroup(groupId, memberId, memberName);
            });
        });
    }


}

async function removeMemberFromGroup(groupId, memberId, memberName) {
    const baseStore = useBaseStore();
    const currentUser = baseStore.currentUser;
    const currentSessionToken = baseStore.currentSessionToken;
    const confirmed = await modal.confirm(`确定要踢出成员 ${memberName} 吗？`, '踢出成员');
    if (!confirmed) return;
    if (!currentUser || !currentSessionToken) {
        toast.error('请先登录');
        return;
    }

    fetch(`${SERVER_URL}/api/remove-group-member`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: JSON.stringify({
            groupId: groupId,
            memberId: memberId
        })
    })
        .then(response => response.json())
        .then(data => {

            if (data.status === 'success' || (data.message && data.message.includes('成功'))) {
                toast.success(`已成功踢出成员 ${memberName}`);
                loadGroupMembers(groupId, true);
            } else {
                toast.error('踢出成员失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(error => {
            console.error('踢出成员失败:', error);
            toast.error('踢出成员失败，网络错误');
        });
}

let currentAddingGroupId = null;
    
    function showAddGroupMemberModal(groupId) {
        const baseStore = useBaseStore();
        const sessionStore = useSessionStore();
        const modalStore = useModalStore();
        const currentUser = baseStore.currentUser;
        const currentSessionToken = baseStore.currentSessionToken;
        if (!groupId || !currentUser || !currentSessionToken) {
            return;
        }
        currentAddingGroupId = groupId;
        if (modalStore) {
            modalStore.openModal('addGroupMember');
        }
        setTimeout(() => {
            document.body.style.overflow = 'hidden';
        }, 100);
    }
    
    function hideAddGroupMemberModal() {
        const modalStore = useModalStore();
        if (modalStore) {
            modalStore.closeModal('addGroupMember');
        }
    }
    
    function confirmAddGroupMembers() {
        const baseStore = useBaseStore();
        const sessionStore = useSessionStore();
        const modalStore = useModalStore();
        const currentUser = baseStore.currentUser;
        const currentSessionToken = baseStore.currentSessionToken;
        const groupId = currentAddingGroupId;
        if (!groupId || !currentUser || !currentSessionToken) {
            return;
        }

    const availableMembersList = document.getElementById('availableMembersList');
    const addMembersMessage = document.getElementById('addMembersMessage');

    if (!availableMembersList || !addMembersMessage) {
        console.error('❌ [添加成员] 找不到必要的DOM元素');
        return;
    }

    const checkboxes = availableMembersList.querySelectorAll('.available-member-checkbox:checked');
    const selectedMemberIds = Array.from(checkboxes).map(checkbox => checkbox.value);

    if (selectedMemberIds.length === 0) {
        addMembersMessage.textContent = '请选择至少1名成员';
        addMembersMessage.className = 'create-group-message error';
        return;
    }

    addMembersMessage.textContent = '';
    addMembersMessage.className = 'create-group-message';



    fetch(`${SERVER_URL}/api/add-group-members`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: JSON.stringify({
            groupId: groupId,
            memberIds: selectedMemberIds
        })
    })
        .then(response => response.json())
        .then(data => {


            if (data.status === 'success' || (data.message && data.message.includes('成功'))) {
                addMembersMessage.textContent = '成员添加成功';
                addMembersMessage.className = 'create-group-message success';

                setTimeout(() => {
                    if (modalStore) {
                        modalStore.closeModal('addGroupMember');
                    }
                    loadGroupMembers(groupId, true);
                }, 1000);
            } else {
                addMembersMessage.textContent = data.message || '添加成员失败';
                addMembersMessage.className = 'create-group-message error';
            }
        })
        .catch(error => {
            console.error(`❌ [添加成员] 添加成员到群组 ${groupId} 失败:`, error);
            addMembersMessage.textContent = '添加成员失败，网络错误';
            addMembersMessage.className = 'create-group-message error';
        });
}

function updateGroupName(groupId, newGroupName) {
    const baseStore = useBaseStore();
    const sessionStore = useSessionStore();
    const groupStore = useGroupStore();
    const currentUser = baseStore.currentUser;
    const currentSessionToken = baseStore.currentSessionToken;
    if (!currentUser || !currentSessionToken) {
        toast.error('请先登录');
        return;
    }

    fetch(`${SERVER_URL}/api/update-group-name`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: JSON.stringify({
            groupId: groupId,
            newGroupName: newGroupName
        })
    })
        .then(response => response.json())
        .then(async data => {
            if (data.status === 'success') {
                const groupName = data.newGroupName;
                const currentGroupNameElement = document.getElementById('currentGroupName');
                if (currentGroupNameElement) {
                    currentGroupNameElement.textContent = groupName;
                }
                const modalGroupName = document.getElementById('modalGroupName');
                if (modalGroupName) {
                    modalGroupName.textContent = `${groupName} - 群组信息`;
                }
                
                if (sessionStore && String(sessionStore.currentGroupId) === String(groupId)) {
                    sessionStore.currentGroupName = groupName;
                }
                
                if (groupStore && groupStore.groupsList) {
                    const group = groupStore.groupsList.find(g => String(g.id) === String(groupId));
                    if (group) {
                        group.name = groupName;
                    }
                }
                
                try {
                    const userId = currentUser.id;
                    const prefix = `chats-${userId}`;
                    const key = `${prefix}-group-${groupId}`;
                    const existingData = await localForage.getItem(key);
                    if (existingData) {
                        const updatedSessionData = { ...existingData };
                        updatedSessionData.name = groupName;
                        await localForage.setItem(key, updatedSessionData);
                    }
                } catch (e) {
                    console.error('更新群组名称到 IndexedDB 失败:', e);
                }
                
                if (sessionStore && String(sessionStore.currentGroupId) === String(groupId)) {
                    sessionStore.currentGroupName = groupName;
                }
                
                toast.success('群组名称已成功更新');
                const manageGroupModal = document.getElementById('manageGroupModal');
                if (manageGroupModal && manageGroupModal.style.display !== 'none') {
                    manageGroupModal.style.display = 'none';
                }
            } else {
                toast.error('修改群组名称失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(() => {
            toast.error('修改群组名称失败，网络错误');
        });
}

function updateGroupNotice(groupId, newNotice) {
    const baseStore = useBaseStore();
    const currentUser = baseStore.currentUser;
    const currentSessionToken = baseStore.currentSessionToken;
    if (!currentUser || !currentSessionToken) {
        toast.error('请先登录');
        return;
    }

    fetch(`${SERVER_URL}/api/update-group-description`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: JSON.stringify({
            groupId: groupId,
            newDescription: newNotice
        })
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP错误! 状态码: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.status === 'success') {
                toast.success('群组公告已成功更新');
            } else {
                toast.error('修改群组公告失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(() => {
            toast.error('修改群组公告失败，网络错误');
        });
}

function uploadGroupAvatar(groupId, file) {
    const baseStore = useBaseStore();
    const currentUser = baseStore.currentUser;
    const currentSessionToken = baseStore.currentSessionToken;
    if (!currentUser || !currentSessionToken) {
        toast.error('请先登录');
        return;
    }

    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('groupId', groupId);
    formData.append('userId', currentUser.id);

    toast.info('正在上传群头像，请稍候...');

    fetch(`${SERVER_URL}/api/upload-group-avatar/${groupId}`, {
        method: 'POST',
        headers: {
            'session-token': currentSessionToken,
            'user-id': currentUser.id
        },
        body: formData
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                toast.success('群头像上传成功');
                const modal = document.getElementById('groupInfoModal');
                if (modal) {
                    modal.style.display = 'none';
                }
                loadGroupList();
            } else {
                toast.error('上传群头像失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(() => {
            toast.error('上传群头像失败，网络错误');
        });
}

function joinGroupWithToken(token, groupId, groupName, popup, isFromGroupCard = false) {
    const baseStore = useBaseStore();
    const currentUser = baseStore.currentUser;
    const currentSessionToken = baseStore.currentSessionToken;
    fetch(`${SERVER_URL}/api/join-group-with-token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: JSON.stringify({ token: token, isFromGroupCard: isFromGroupCard })
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                toast.success(`成功加入群组: ${groupName}`);
                if (popup) {
                    popup.remove();
                }
                loadGroupList();
            } else {
                toast.error('加入群组失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(error => {
            console.error('加入群组失败:', error);
            toast.error('加入群组失败，网络错误');
        });
}

function showGroupCardPopup(event, groupCardData) {
    openGroupCardPopup(event, groupCardData);
}

function moveGroupToTop(groupId) {
    const groupList = document.getElementById('groupList');
    if (!groupList) return;
    
    const groupItems = groupList.querySelectorAll('li[data-group-id]');
    for (const item of groupItems) {
        if (String(item.getAttribute('data-group-id')) === String(groupId)) {
            groupList.insertBefore(item, groupList.firstChild);
            
            const groupIndex = groupsList.findIndex(g => String(g.id) === String(groupId));
            if (groupIndex > 0) {
                const group = groupsList.splice(groupIndex, 1)[0];
                groupsList.unshift(group);
            }
            
            break;
        }
    }
}

function switchToGroupChat(groupId, groupName) {
    const sessionStore = useSessionStore();
    const groupStore = useGroupStore();
    const baseStore = useBaseStore();
    const draftStore = useDraftStore();
    
    const currentGroupId = sessionStore?.currentGroupId;
    if (currentGroupId) {
      const groupMessageInput = document.getElementById('groupMessageInput');
      if (groupMessageInput) {
        const content = groupMessageInput.textContent || groupMessageInput.innerHTML || '';
        if (draftStore) draftStore.saveDraft('group', currentGroupId, content);
      }
      if (draftStore) draftStore.setLastMessageToDraft('group', currentGroupId);
    }
    
    const oldCurrentActiveChat = sessionStore.currentActiveChat;
    
    sessionStore.currentGroupId = groupId;
    sessionStore.currentGroupName = groupName;
    sessionStore.currentActiveChat = `group_${groupId}`;
    sessionStore.currentSendChatType = 'group';
    sessionStore.selectedGroupIdForCard = groupId;
    
    delete groupChatAllLoaded[groupId];
    
    if (groupStore) {
        groupStore.setGroupAllLoaded(groupId, false);
        groupStore.clearGroupHasAtMe(groupId);
    }
    
    const unreadStore = useUnreadStore();
    if (unreadStore) {
        unreadStore.clearGroupUnread(groupId);
    }
    
    if (sessionStore) {
        sessionStore.setCurrentGroupId(groupId);
        sessionStore.setCurrentActiveChat(`group_${groupId}`);
    }
    
    sessionStore.currentGroupId = groupId;
    sessionStore.currentActiveChat = `group_${groupId}`;
    
    setActiveChatDirect('group', groupId, true);

    navigateTo('/chat/group');
    
    window.dispatchEvent(new CustomEvent('group-switched'));
    
    if (typeof updateUnreadCountsDisplay === 'function') {
        updateUnreadCountsDisplay();
    }
    
    const hasMessages = groupStore && groupStore.groupMessages && groupStore.groupMessages[groupId] && groupStore.groupMessages[groupId].length > 0;
    switchingGroupWithExistingMessages = hasMessages;
}

function loadGroupMessages(groupId) {
}

async function updateGroupList(groups) {
    groupsList = groups;

    const baseStore = useBaseStore();
    const sessionStore = useSessionStore();
    const groupStore = useGroupStore();
    const unreadStore = useUnreadStore();
    
    if (groupStore) {
        const userId = baseStore.currentUser?.id || 'guest';
        const prefix = `chats-${userId}`;

        groupStore.loadGroupsWithAtMeFromLocalStorage(baseStore.currentUser);

        const existingGroups = groupStore.groupsList || [];
        const existingGroupMap = new Map();
        existingGroups.forEach(g => existingGroupMap.set(String(g.id), g));

        const serverGroupIds = new Set(groups.map(g => String(g.id)));

        let chatKeysData = null;
        try {
            chatKeysData = await localForage.getItem(prefix);
        } catch (e) {
            console.error('读取 chatKeys 失败:', e);
        }
        
        const localGroupIdsFromKeys = new Set();
        if (chatKeysData && chatKeysData.chatKeys) {
            chatKeysData.chatKeys.forEach(key => {
                if (key.includes('-group-')) {
                    const groupId = key.split('-group-')[1];
                    localGroupIdsFromKeys.add(groupId);
                }
            });
        }

        const newChatKeys = chatKeysData && chatKeysData.chatKeys ? [...chatKeysData.chatKeys] : [];
        for (const group of groups) {
            const groupIdStr = String(group.id);
            const key = `${prefix}-group-${groupIdStr}`;
            if (!localGroupIdsFromKeys.has(groupIdStr)) {
                newChatKeys.push(key);
                localGroupIdsFromKeys.add(groupIdStr);
            }
        }
        try {
            await localForage.setItem(prefix, { chatKeys: newChatKeys });
        } catch (e) {
            console.error('更新 chatKeys 失败:', e);
        }

        for (const group of groups) {
            const existingGroup = existingGroupMap.get(String(group.id));
            
            try {
                const key = `${prefix}-group-${group.id}`;
                const existingData = await localForage.getItem(key) || { messages: [] };
                const updatedSessionData = { ...existingData };
                if (group.name) updatedSessionData.name = group.name;
                if (group.avatar_url) updatedSessionData.avatarUrl = group.avatar_url;
                else if (group.avatarUrl) updatedSessionData.avatarUrl = group.avatarUrl;
                
                delete updatedSessionData.deleted_at;
                
                await localForage.setItem(key, updatedSessionData);
            } catch (e) {
                console.error('更新IndexedDB中的群组会话信息失败:', e);
            }
        }

        for (const groupId of localGroupIdsFromKeys) {
            const groupIdStr = String(groupId);
            if (!serverGroupIds.has(groupIdStr)) {
                try {
                    const key = `${prefix}-group-${groupId}`;
                    const existingData = await localForage.getItem(key);
                    if (!existingData?.deleted_at) {
                        let updatedSessionData;
                        if (existingData) {
                            updatedSessionData = { ...existingData };
                        } else {
                            const existingGroup = existingGroupMap.get(groupIdStr);
                            updatedSessionData = { messages: [] };
                            if (existingGroup) {
                                if (existingGroup.name) updatedSessionData.name = existingGroup.name;
                                if (existingGroup.avatar_url) updatedSessionData.avatarUrl = existingGroup.avatar_url;
                                else if (existingGroup.avatarUrl) updatedSessionData.avatarUrl = existingGroup.avatarUrl;
                            }
                        }
                        
                        if (!updatedSessionData.name) {
                            try {
                                const response = await fetch(`${SERVER_URL}/api/group-info/${groupId}`, {
                                    method: 'GET',
                                    headers: {
                                        'user-id': userId,
                                        'session-token': localStorage.getItem('currentSessionToken')
                                    }
                                });
                                if (response.ok) {
                                    const responseData = await response.json();
                                    if (responseData.status === 'success' && responseData.group) {
                                        if (!updatedSessionData.name && responseData.group.name) {
                                            updatedSessionData.name = responseData.group.name;
                                        }
                                        if (!updatedSessionData.avatarUrl && responseData.group.avatar_url) {
                                            updatedSessionData.avatarUrl = responseData.group.avatar_url;
                                        }
                                    }
                                }
                            } catch (e) {
                                console.error('获取群组信息失败:', e);
                            }
                        }
                        
                        updatedSessionData.deleted_at = new Date().toISOString();
                        await localForage.setItem(key, updatedSessionData);
                    }
                } catch (e) {
                    console.error('更新群组deleted_at失败:', e);
                }
            }
        }

        const allGroups = [];
        for (const groupId of localGroupIdsFromKeys) {
            try {
                const key = `${prefix}-group-${groupId}`;
                const data = await localForage.getItem(key);
                if (data) {
                    let groupName = data.name || '群组';
                    
                    if (!data.name) {
                        try {
                            const response = await fetch(`${SERVER_URL}/api/group-info/${groupId}`, {
                                method: 'GET',
                                headers: {
                                    'user-id': userId,
                                    'session-token': localStorage.getItem('currentSessionToken')
                                }
                            });
                            if (response.ok) {
                                const responseData = await response.json();
                                if (responseData.status === 'success' && responseData.group) {
                                    if (!data.name && responseData.group.name) {
                                        groupName = responseData.group.name;
                                        data.name = responseData.group.name;
                                    }
                                    if (!data.avatarUrl && responseData.group.avatar_url) {
                                        data.avatarUrl = responseData.group.avatar_url;
                                    }
                                    const key = `${prefix}-group-${groupId}`;
                                    const updatedData = { ...data };
                                    await localForage.setItem(key, updatedData);
                                }
                            }
                        } catch (e) {
                            console.error('获取群组信息失败:', e);
                        }
                    }
                    
                    const group = {
                        id: groupId,
                        name: groupName,
                        avatarUrl: data.avatarUrl,
                        deleted_at: data.deleted_at
                    };
                    
                    if (data.last_message_time) {
                        group.last_message_time = data.last_message_time;
                    }
                    
                    if (data.messages && data.messages.length > 0) {
                        const validMessages = data.messages.filter(m => m.messageType !== 101 && m.messageType !== 102);
                        if (validMessages.length > 0) {
                            group.lastMessage = validMessages[validMessages.length - 1];
                            if (!group.last_message_time) {
                                group.last_message_time = validMessages[validMessages.length - 1].timestamp || new Date().toISOString();
                            }
                        }
                    }
                    
                    allGroups.push(group);
                }
            } catch (e) {
                console.error('从IndexedDB加载群组失败:', e);
            }
        }

        groupStore.groupsList = allGroups;
        groupStore.sortGroupsByLastMessageTime();
    }

    updateUnreadCountsDisplay();
    if (unreadStore) {
        unreadStore.unreadMessages = { ...unreadStore.unreadMessages };
    }
}

function showSendGroupCardModal(chatType) {
    const sessionStore = useSessionStore();
    const modalStore = useModalStore();
    if (sessionStore) {
        sessionStore.currentSendChatType = chatType;
        sessionStore.selectedGroupIdForCard = null;
    }

    if (modalStore) {
        modalStore.openModal('sendGroupCard');
    }
}

function sendGroupCard() {
    const sessionStore = useSessionStore();
    const groupStore = useGroupStore();
    const baseStore = useBaseStore();
    const modalStore = useModalStore();
    
    if (!sessionStore || !sessionStore.selectedGroupIdForCard) {
        return;
    }

    const selectedGroupIdForCard = sessionStore.selectedGroupIdForCard;
    const currentSendChatType = sessionStore.currentSendChatType;
    const currentPrivateChatUserId = sessionStore.currentPrivateChatUserId;
    const currentGroupId = sessionStore.currentGroupId;
    const currentUser = baseStore.currentUser;
    const currentSessionToken = baseStore.currentSessionToken;
    const chatSocket = getChatSocket();

    fetch(`${SERVER_URL}/api/generate-group-token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: JSON.stringify({ groupId: selectedGroupIdForCard })
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const token = data.token;

                fetch(`${SERVER_URL}/api/group-info/${selectedGroupIdForCard}`, {
                    headers: {
                        'user-id': currentUser.id,
                        'session-token': currentSessionToken
                    }
                })
                    .then(response => response.json())
                    .then(groupData => {
                        if (groupData.status === 'success') {
                            const group = groupData.group;
                            
                            const groupCardContent = JSON.stringify({
                                type: 'group_card',
                                group_id: group.id,
                                group_name: group.name || '',
                                group_description: group.description || '',
                                invite_token: token,
                                avatar_url: group.avatar_url || group.avatarUrl || ''
                            });

                            if (chatSocket) {
                                if (currentSendChatType === 'main') {
                                    chatSocket.emit('send-message', {
                                        content: groupCardContent,
                                        messageType: 3,
                                        sessionToken: currentSessionToken,
                                        userId: Number(currentUser.id)
                                    });
                                } else if (currentSendChatType === 'group') {
                                    chatSocket.emit('send-message', {
                                        content: groupCardContent,
                                        messageType: 3,
                                        groupId: Number(currentGroupId),
                                        sessionToken: currentSessionToken,
                                        userId: Number(currentUser.id)
                                    });
                                } else if (currentSendChatType === 'private' && currentPrivateChatUserId) {
                                    chatSocket.emit('send-private-message', {
                                        content: groupCardContent,
                                        messageType: 3,
                                        receiverId: Number(currentPrivateChatUserId),
                                        sessionToken: currentSessionToken,
                                        userId: Number(currentUser.id)
                                    });
                                }
                            }

                            if (modalStore) {
                                modalStore.closeModal('sendGroupCard');
                            }
                            
                            setTimeout(() => {
                                let container = null;
                                if (currentSendChatType === 'main') {
                                    container = document.getElementById('messageContainer');
                                } else if (currentSendChatType === 'group') {
                                    container = document.getElementById('groupMessageContainer');
                                } else if (currentSendChatType === 'private') {
                                    container = document.getElementById('privateMessageContainer');
                                }
                                if (container) {
                                    container.scrollTop = container.scrollHeight;
                                }
                            }, 100);
                        }
                    })
                    .catch(error => {
                        console.error('获取群组信息失败:', error);
                    });
            }
        })
        .catch(error => {
            console.error('生成群组邀请Token失败:', error);
        });
}

export {
  loadGroupList,
  getMutedGroups,
  isGroupMuted,
  toggleGroupMute,
  loadGroupMembers,
  showAddGroupMemberModal,
  hideAddGroupMemberModal,
  confirmAddGroupMembers,
  updateGroupName,
  updateGroupNotice,
  uploadGroupAvatar,
  joinGroupWithToken,
  showGroupCardPopup,
  moveGroupToTop,
  switchToGroupChat,
  loadGroupMessages,
  updateGroupList,
  showSendGroupCardModal,
  sendGroupCard,
  handleDissolveGroup,
  handleLeaveGroup,
  dissolveGroup,
  removeMemberFromGroup,
  groupsList,
  currentSharedGroup,
  switchingGroupWithExistingMessages,
  groupChatAllLoaded
};
