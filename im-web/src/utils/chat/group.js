import { SERVER_URL, toast } from './config.js';
import { 
  getStore, 
  getCurrentUser, 
  getCurrentSessionToken, 
  sessionStore, 
  unreadMessages 
} from './store.js';
import { unescapeHtml } from './message.js';
import modal from '../modal.js';
import {
  updateUnreadCountsDisplay,
  currentGroupId,
  setActiveChat,
  setActiveChatDirect,
  updateGroupListDisplay
} from './ui.js';
import { isConnected } from './websocket.js';
import localForage from 'localforage';

let groupsList = [];
let currentSharedGroup = null;

function initializeGroupFunctions() {
    // 所有事件已在 Vue 组件中处理
}

function addGroupCardClickListeners() {
    // 群名片点击事件已在 Vue 组件中处理
}

function loadGroupList() {
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();
    if (!currentUser || !currentSessionToken) return;

    // 异步请求服务器数据进行更新
    fetch(`${SERVER_URL}/api/user-groups/${currentUser.id}`, {
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        }
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                updateGroupList(data.groups);
            }
        })
        .catch(() => {
            // 错误处理由store管理
        });
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
        // 取消免打扰
        updatedGroups = mutedGroups.filter(id => id !== groupIdStr);
        console.log(`🔔 取消群组免打扰 - 群组ID: ${groupId}`);
    } else {
        // 设置免打扰
        updatedGroups = [...mutedGroups, groupIdStr];
        console.log(`🔕 设置群组免打扰 - 群组ID: ${groupId}`);
    }

    localStorage.setItem('mutedGroups', JSON.stringify(updatedGroups));
    // 更新群组列表显示
    updateGroupListDisplay();
    // 更新未读计数
    updateUnreadCountsDisplay();
    return !mutedGroups.includes(groupIdStr); // 返回新的免打扰状态
}

function setupCreateGroupButton(createGroupButton) {
    if (!createGroupButton) return;

    // 移除所有现有的点击事件监听器
    const newCreateGroupButton = createGroupButton.cloneNode(true);
    createGroupButton.parentNode.replaceChild(newCreateGroupButton, createGroupButton);

    // 为新按钮添加点击事件
    newCreateGroupButton.addEventListener('click', function() {
        // 使用新的 openModal 方法
        if (typeof window.openModal === 'function') {
            window.openModal('createGroup');
        }

        // 等待 DOM 渲染完成后再操作
        setTimeout(() => {
            const newGroupNameInput = document.getElementById('newGroupName');
            const newGroupDescriptionInput = document.getElementById('newGroupDescription');

            // 清空表单
            if (newGroupNameInput) newGroupNameInput.value = '';
            if (newGroupDescriptionInput) newGroupDescriptionInput.value = '';

            // 直接调用loadAvailableMembers
            if (window.ModalManager && typeof window.ModalManager.loadAvailableMembers === 'function') {
                window.ModalManager.loadAvailableMembers();
            }
        }, 100);
    });
}

function setupGroupInfoButton(groupInfoButton) {
    if (!groupInfoButton) return;

    const newGroupInfoButton = groupInfoButton.cloneNode(true);
    groupInfoButton.parentNode.replaceChild(newGroupInfoButton, groupInfoButton);

    newGroupInfoButton.addEventListener('click', function() {
        const user = getCurrentUser();
        const sessionToken = getCurrentSessionToken();
        
        if (!currentGroupId) {
            toast.warning('请先选择一个群组');
            return;
        }

        fetch(`${SERVER_URL}/api/group-info/${currentGroupId}`, {
            headers: {
                'user-id': user?.id,
                'session-token': sessionToken
            }
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP错误! 状态码: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (!data) {
                    throw new Error('获取数据失败');
                }

                if (data.status === 'success') {
                    const group = data.group;
                    if (window.displayGroupInfoModalVue) {
                        window.displayGroupInfoModalVue(group, currentGroupId);
                    }
                } else {
                    toast.error('获取群组信息失败: ' + (data.message || '未知错误'));
                }
            })
            .catch(() => {
                toast.error('获取群组信息失败');
            });
    });
}

function setupLeaveGroupButton(leaveGroupButton) {
    if (!leaveGroupButton) return;

    const newLeaveGroupButton = leaveGroupButton.cloneNode(true);
    leaveGroupButton.parentNode.replaceChild(newLeaveGroupButton, leaveGroupButton);

    newLeaveGroupButton.addEventListener('click', function() {
        const currentUser = getCurrentUser();
        const currentSessionToken = getCurrentSessionToken();
        if (!currentGroupId) {
            toast.warning('请先选择一个群组');
            return;
        }

        fetch(`${SERVER_URL}/api/group-info/${currentGroupId}`, {
            headers: {
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            }
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP错误! 状态码: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (!data) {
                    throw new Error('获取数据失败');
                }

                if (data.status === 'success') {
                    const ownerId = data.group.creator_id || data.group.ownerId || data.group.creatorId || data.group.adminId;
                    const isOwner = currentUser.id === String(ownerId);

                    if (isOwner) {
                        handleDissolveGroup(currentGroupId);
                    } else {
                        handleLeaveGroup(currentGroupId);
                    }
                } else {
                    toast.error(data.message || '获取群组信息失败');
                }
            })
            .catch(() => {
                toast.error('获取群组信息失败');
            });
    });
}

async function handleDissolveGroup(groupId) {
    const confirmed = await modal.confirm('确定要解散该群组吗？此操作不可恢复，所有群消息将被删除。', '解散群组', 'error');
    if (confirmed) {
        dissolveGroup(groupId);
    }
}

async function handleLeaveGroup(groupId) {
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();
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

            // 关闭群组信息模态框
            const store = getStore();
            if (store && store.closeModal) {
                store.closeModal('groupInfo');
            }
            if (store && store.setCurrentGroupId) {
                store.setCurrentGroupId(null);
            }
            
            // 用户自己操作退出，只标记为已删除，不清空本地消息
            if (store && store.markGroupAsDeleted) {
                await store.markGroupAsDeleted(groupId, false);
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
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();
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

                const store = getStore();
                if (store) {
                    store.currentGroupId = null;
                    store.currentGroupName = '';
                    store.currentActiveChat = null;
                    
                    // 群主自己操作解散，直接删除本地记录
                    if (store.markGroupAsDeleted) {
                        store.markGroupAsDeleted(groupId, true);
                    }
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
    // console.log(`📋 [群组成员] 开始加载群组成员列表，群组ID: ${groupId}，是否为群主: ${isOwner}`);
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();

    const groupMembersContainer = document.getElementById('groupMembersContainer');
    const modalGroupMemberCount = document.getElementById('modalGroupMemberCount');
    if (!groupMembersContainer) {
        // console.error('❌ [群组成员] 未找到群组成员容器');
        return;
    }

    groupMembersContainer.innerHTML = '<div class="loading-members">正在加载成员列表...</div>';

    // console.log(`🔄 [群组成员] 发送请求获取群组成员列表，群组ID: ${groupId}`);
    fetch(`${SERVER_URL}/api/group-members/${groupId}`, {
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        }
    })
        .then(response => response.json())
        .then(data => {
            // console.log(`✅ [群组成员] 收到群组成员列表响应，状态: ${data.status}，数据:`, data);

            if (data.status === 'success') {
                // console.log(`📊 [群组成员] 成功获取群组成员列表，共 ${data.members.length} 个成员`);
                updateGroupMembersList(data.members, isOwner, groupId);
                // 更新群组成员数量
                modalGroupMemberCount.textContent = data.members.length;
            } else {
                const errorMsg = data.message || '未知错误';
                // console.error(`❌ [群组成员] 加载群组成员列表失败: ${errorMsg}`);
                groupMembersContainer.innerHTML = `<div class="loading-members">加载成员列表失败: ${errorMsg}</div>`;
            }
        })
        .catch(() => {
            groupMembersContainer.innerHTML = '<div class="loading-members">加载成员列表失败，网络错误</div>';
        });
}

function updateGroupMembersList(members, isOwner, groupId) {
    // console.log(`📋 [群组成员] 开始更新群组成员列表，群组ID: ${groupId}，是否为群主: ${isOwner}，成员数量: ${members ? members.length : 0}`);
    const currentUser = getCurrentUser();

    const groupMembersContainer = document.getElementById('groupMembersContainer');
    if (!groupMembersContainer) {
        // console.error('❌ [群组成员] 未找到群组成员容器');
        return;
    }

    if (!members || !Array.isArray(members) || members.length === 0) {
        // console.log(`📊 [群组成员] 群组成员列表为空，群组ID: ${groupId}`);
        groupMembersContainer.innerHTML = '<div class="loading-members">没有可用的成员</div>';
        return;
    }

    // console.log(`📊 [群组成员] 开始渲染 ${members.length} 个成员，群组ID: ${groupId}`);
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

    // console.log(`✅ [群组成员] 成员列表HTML生成完成，共 ${members.length} 个成员`);
    groupMembersContainer.innerHTML = membersHtml;

    // 添加踢出成员按钮事件
    if (isOwner) {
        const kickButtons = groupMembersContainer.querySelectorAll('.kick-member-btn');
        // console.log(`🔧 [群组成员] 添加 ${kickButtons.length} 个踢出成员按钮事件`);

        kickButtons.forEach(button => {
            button.addEventListener('click', function() {
                const groupId = this.getAttribute('data-group-id');
                const memberId = this.getAttribute('data-member-id');
                const memberName = this.getAttribute('data-member-name');

                // console.log(`🚫 [群组成员] 点击踢出按钮，群组ID: ${groupId}，成员ID: ${memberId}，成员昵称: ${memberName}`);
                removeMemberFromGroup(groupId, memberId, memberName);
            });
        });
    }

    // console.log(`✅ [群组成员] 群组成员列表更新完成，群组ID: ${groupId}`);
}

async function removeMemberFromGroup(groupId, memberId, memberName) {
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();
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

            // 检查服务器返回的状态，有些服务器可能返回不同的状态值
            if (data.status === 'success' || (data.message && data.message.includes('成功'))) {
                toast.success(`已成功踢出成员 ${memberName}`);
                // 重新加载群组成员列表
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

function showAddGroupMemberModal(groupId) {
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();
    if (!groupId || !currentUser || !currentSessionToken) {
        return;
    }
    window.currentAddingGroupId = groupId;
    if (typeof window.openModal === 'function') {
        window.openModal('addGroupMember');
    }
    setTimeout(() => {
        document.body.style.overflow = 'hidden';
    }, 100);
}

function hideAddGroupMemberModal() {
    if (typeof window.closeModal === 'function') {
        window.closeModal('addGroupMember');
    }
}

function confirmAddGroupMembers() {
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();
    const groupId = window.currentAddingGroupId;
    if (!groupId || !currentUser || !currentSessionToken) {
        return;
    }

    const availableMembersList = document.getElementById('availableMembersList');
    const addMembersMessage = document.getElementById('addMembersMessage');

    if (!availableMembersList || !addMembersMessage) {
        console.error('❌ [添加成员] 找不到必要的DOM元素');
        return;
    }

    // 获取选中的成员ID
    const checkboxes = availableMembersList.querySelectorAll('.available-member-checkbox:checked');
    const selectedMemberIds = Array.from(checkboxes).map(checkbox => checkbox.value);

    if (selectedMemberIds.length === 0) {
        addMembersMessage.textContent = '请选择至少1名成员';
        addMembersMessage.className = 'create-group-message error';
        return;
    }

    // 隐藏错误消息
    addMembersMessage.textContent = '';
    addMembersMessage.className = 'create-group-message';



    // 发送添加成员请求
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

                // 延迟关闭模态框
                setTimeout(() => {
                    if (typeof window.closeModal === 'function') {
                        window.closeModal('addGroupMember');
                    }
                    // 重新加载群组成员列表
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
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();
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
                
                // 更新 chatStore 中的当前群组名称
                const store = getStore();
                if (store && String(store.currentGroupId) === String(groupId)) {
                    store.currentGroupName = groupName;
                }
                
                // 更新 groupsList 中的群组名称
                if (window.chatStore && window.chatStore.groupsList) {
                    const group = window.chatStore.groupsList.find(g => String(g.id) === String(groupId));
                    if (group) {
                        group.name = groupName;
                    }
                }
                
                // 更新 IndexedDB 中的群组名称
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
                
                // 更新 sessionStore 中的群组名称
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
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();
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
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();
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
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();
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
                // 关闭弹出窗口
                if (popup) {
                    popup.remove();
                }
                // 刷新群组列表
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
    // 使用 Vue 组件显示群名片弹窗
    if (window.showGroupCardPopupVue) {
        window.showGroupCardPopupVue(event, groupCardData);
    }
}

function displayShareGroupCardModal() {
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();
    const modal = document.getElementById('shareGroupCardModal');
    const shareGroupList = document.getElementById('shareGroupList');

    // 清空群组列表
    shareGroupList.innerHTML = '';

    // 加载用户加入的群组，排除当前要分享的群组
    fetch(`${SERVER_URL}/api/user-groups/${currentUser.id}`, {
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        }
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const groups = data.groups;
                groups.forEach(group => {
                    // 排除当前要分享的群组
                    if (group.id !== currentSharedGroup.id) {
                        const groupItem = document.createElement('div');
                        groupItem.className = 'share-target-item';
                        groupItem.style.display = 'flex';
                        groupItem.style.alignItems = 'center';
                        groupItem.style.margin = '10px 0';

                        groupItem.innerHTML = `
                        <input type="checkbox" id="target-group-${group.id}" value="group-${group.id}" class="share-target-checkbox">
                        <label for="target-group-${group.id}" style="margin-left: 10px; cursor: pointer;">${group.name}</label>
                    `;

                        shareGroupList.appendChild(groupItem);
                    }
                });
            }
        })
        .catch(error => {
            console.error('加载群组列表失败:', error);
        });

    // 显示模态框
    modal.style.display = 'flex';

    // 绑定关闭按钮事件
    const closeBtn = document.getElementById('closeShareGroupCardModal');
    closeBtn.onclick = function() {
        modal.style.display = 'none';
    };

    // 绑定取消按钮事件
    const cancelBtn = document.getElementById('cancelShareGroupCard');
    cancelBtn.onclick = function() {
        modal.style.display = 'none';
    };

    // 绑定确认分享按钮事件
    const confirmBtn = document.getElementById('confirmShareGroupCard');
    confirmBtn.onclick = function() {
        shareGroupCard();
    };

    // 点击模态框外部关闭
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };
}

function shareGroupCard() {
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();
    if (!currentSharedGroup) return;

    // 获取选中的目标
    const selectedCheckboxes = document.querySelectorAll('.share-target-checkbox:checked');
    const selectedTargets = Array.from(selectedCheckboxes).map(checkbox => checkbox.value);

    if (selectedTargets.length === 0) {
        toast.warning('请选择至少一个分享目标');
        return;
    }

    // 生成群组邀请Token
    fetch(`${SERVER_URL}/api/generate-group-token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: JSON.stringify({ groupId: currentSharedGroup.id })
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const token = data.token;

                // 构建群名片消息内容
                const groupCardContent = JSON.stringify({
                    type: 'group_card',
                    group_id: currentSharedGroup.id,
                    group_name: currentSharedGroup.name,
                    group_description: currentSharedGroup.description || '',
                    invite_token: token,
                    avatar_url: currentSharedGroup.avatar_url || currentSharedGroup.avatarUrl || ''
                });

                // 发送群名片消息到选中的目标
                selectedTargets.forEach(target => {
                    if (target === 'main') {
                        // 发送到主聊天室
                        window.chatSocket.emit('send-message', {
                            content: groupCardContent,
                            messageType: 3, // 群名片消息类型
                            sessionToken: currentSessionToken,
                            userId: currentUser.id
                        });
                    } else {
                        // 发送到群组
                        const groupId = target.replace('group-', '');
                        window.chatSocket.emit('send-message', {
                            content: groupCardContent,
                            messageType: 3, // 群名片消息类型
                            groupId: groupId,
                            sessionToken: currentSessionToken,
                            userId: currentUser.id
                        });
                    }
                });

                // 关闭模态框
                const modal = document.getElementById('shareGroupCardModal');
                modal.style.display = 'none';

                toast.success('群名片分享成功');
            } else {
                toast.error('生成邀请Token失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(error => {
            console.error('分享群名片失败:', error);
            toast.error('分享群名片失败，网络错误');
        });
}

function moveGroupToTop(groupId) {
    const groupList = document.getElementById('groupList');
    if (!groupList) return;
    
    const groupItems = groupList.querySelectorAll('li[data-group-id]');
    for (const item of groupItems) {
        if (String(item.getAttribute('data-group-id')) === String(groupId)) {
            // 将群组移到列表顶部
            groupList.insertBefore(item, groupList.firstChild);
            
            // 更新内存中的群组列表顺序
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
    const store = getStore();
    
    // 保存当前群组的草稿并重新设置侧边栏的 [草稿] 标记
    // 注意：必须先保存旧群组的草稿，再更新 currentActiveChat
    const currentGroupId = store?.currentGroupId?.value ?? store?.currentGroupId;
    if (currentGroupId) {
      const groupMessageInput = document.getElementById('groupMessageInput');
      if (groupMessageInput) {
        const content = groupMessageInput.textContent || groupMessageInput.innerHTML || '';
        store.saveDraft('group', currentGroupId, content);
      }
      // 离开当前会话时，重新设置侧边栏的 [草稿] 标记
      store.setLastMessageToDraft('group', currentGroupId);
    }
    
    // 先保存旧的 currentActiveChat
    const oldCurrentActiveChat = sessionStore.currentActiveChat;
    
    sessionStore.currentGroupId = groupId;
    sessionStore.currentGroupName = groupName;
    sessionStore.currentActiveChat = `group_${groupId}`;
    sessionStore.currentSendChatType = 'group';
    sessionStore.selectedGroupIdForCard = groupId;
    
    // 重置该会话的全部加载标志
    if (!window.groupChatAllLoaded) {
        window.groupChatAllLoaded = {};
    }
    delete window.groupChatAllLoaded[groupId];
    
    if (store) {
        store.currentGroupId = groupId;
        store.currentGroupName = groupName;
        store.currentActiveChat = `group_${groupId}`;
        store.currentSendChatType = 'group';
        store.selectedGroupIdForCard = groupId;
        
        // 同时重置 chatStore 中的标记
        if (store.setGroupAllLoaded) {
            store.setGroupAllLoaded(groupId, false);
        }
        
        // 清零该会话的未读计数
        if (store.clearGroupUnread) {
            store.clearGroupUnread(groupId);
        }

        // 清除该群组的@我标记
        if (store.clearGroupHasAtMe) {
            store.clearGroupHasAtMe(groupId);
        }
    }
    
    window.currentGroupId = groupId;
    window.currentActiveChat = `group_${groupId}`;
    
    // 直接调用 setActiveChat，但不保存新群组的草稿
    setActiveChatDirect('group', groupId, true);

    if (window.router && window.router.currentRoute.value.path !== '/chat/group') {
        window.router.push('/chat/group');
    }

    window.dispatchEvent(new CustomEvent('group-switched'));
    
    // 更新未读计数显示
    if (typeof window.updateUnreadCountsDisplay === 'function') {
        window.updateUnreadCountsDisplay();
    }
    
    const hasMessages = store && store.groupMessages && store.groupMessages[groupId] && store.groupMessages[groupId].length > 0;
    window.switchingGroupWithExistingMessages = hasMessages;
}

function loadGroupMessages(groupId) {
    // 不再发送加入事件，直接从 chatStore 渲染本地存储的消息
}

async function updateGroupList(groups) {
    // 更新群组列表全局变量
    groupsList = groups;

    // 直接更新 store
    if (window.chatStore) {
        const userId = window.chatStore.currentUser?.id || 'guest';
        const prefix = `chats-${userId}`;

        // 从 localStorage 加载 groups_with_at_me
        if (window.chatStore.loadGroupsWithAtMeFromLocalStorage) {
            window.chatStore.loadGroupsWithAtMeFromLocalStorage();
        }

        // 获取现有的群组列表，保留 deleted_at 字段
        const existingGroups = window.chatStore.groupsList || [];
        const existingGroupMap = new Map();
        existingGroups.forEach(g => existingGroupMap.set(String(g.id), g));

        // 收集服务器返回的群组ID
        const serverGroupIds = new Set(groups.map(g => String(g.id)));

        // 第一步：从 chatKeys 读取所有群组会话
        let chatKeysData = null;
        try {
            chatKeysData = await localForage.getItem(prefix);
        } catch (e) {
            console.error('读取 chatKeys 失败:', e);
        }
        
        // 收集所有本地存在的群组ID（从 chatKeys）
        const localGroupIdsFromKeys = new Set();
        if (chatKeysData && chatKeysData.chatKeys) {
            chatKeysData.chatKeys.forEach(key => {
                if (key.includes('-group-')) {
                    const groupId = key.split('-group-')[1];
                    localGroupIdsFromKeys.add(groupId);
                }
            });
        }

        // 第二步：确保服务器返回的所有群组都在 chatKeys 中
        const newChatKeys = chatKeysData && chatKeysData.chatKeys ? [...chatKeysData.chatKeys] : [];
        for (const group of groups) {
            const groupIdStr = String(group.id);
            const key = `${prefix}-group-${groupIdStr}`;
            if (!localGroupIdsFromKeys.has(groupIdStr)) {
                newChatKeys.push(key);
                localGroupIdsFromKeys.add(groupIdStr);
            }
        }
        // 更新 chatKeys
        try {
            await localForage.setItem(prefix, { chatKeys: newChatKeys });
        } catch (e) {
            console.error('更新 chatKeys 失败:', e);
        }

        // 第三步：把服务器返回的信息保存到 IndexedDB
        for (const group of groups) {
            const existingGroup = existingGroupMap.get(String(group.id));
            
            // 更新 IndexedDB 中的会话信息
            try {
                const key = `${prefix}-group-${group.id}`;
                const existingData = await localForage.getItem(key) || { messages: [] };
                const updatedSessionData = { ...existingData };
                if (group.name) updatedSessionData.name = group.name;
                if (group.avatar_url) updatedSessionData.avatarUrl = group.avatar_url;
                else if (group.avatarUrl) updatedSessionData.avatarUrl = group.avatarUrl;
                
                // 如果服务器返回了这个群组，但本地标记了deleted_at，取消标记
                delete updatedSessionData.deleted_at;
                
                await localForage.setItem(key, updatedSessionData);
            } catch (e) {
                console.error('更新IndexedDB中的群组会话信息失败:', e);
            }
        }

        // 第四步：处理 chatKeys 中所有不在服务器返回列表中的群组，标记为已删除
        for (const groupId of localGroupIdsFromKeys) {
            const groupIdStr = String(groupId);
            if (!serverGroupIds.has(groupIdStr)) {
                // 先从 IndexedDB 读取，检查是否已经标记为已删除
                try {
                    const key = `${prefix}-group-${groupId}`;
                    const existingData = await localForage.getItem(key);
                    if (!existingData?.deleted_at) {
                        let updatedSessionData;
                        if (existingData) {
                            updatedSessionData = { ...existingData };
                        } else {
                            // 从 existingGroups 中获取群组信息
                            const existingGroup = existingGroupMap.get(groupIdStr);
                            updatedSessionData = { messages: [] };
                            if (existingGroup) {
                                if (existingGroup.name) updatedSessionData.name = existingGroup.name;
                                if (existingGroup.avatar_url) updatedSessionData.avatarUrl = existingGroup.avatar_url;
                                else if (existingGroup.avatarUrl) updatedSessionData.avatarUrl = existingGroup.avatarUrl;
                            }
                        }
                        
                        // 发现缺少名称时直接请求 API 补全信息
                        if (!updatedSessionData.name) {
                            try {
                                const response = await fetch(`${SERVER_URL}/api/group-info/${groupId}`, {
                                    method: 'GET',
                                    headers: {
                                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
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

        // 第五步：直接从 IndexedDB 加载所有群组到 store
        const allGroups = [];
        for (const groupId of localGroupIdsFromKeys) {
            try {
                const key = `${prefix}-group-${groupId}`;
                const data = await localForage.getItem(key);
                if (data) {
                    let groupName = data.name || '群组';
                    
                    // 发现缺少名称时直接请求 API 补全信息
                    if (!data.name) {
                        try {
                            const response = await fetch(`${SERVER_URL}/api/group-info/${groupId}`, {
                                method: 'GET',
                                headers: {
                                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
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
                                    // 保存获取到的信息到IndexedDB
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
                    
                    // 优先使用 IndexedDB 中保存的 last_message_time
                    if (data.last_message_time) {
                        group.last_message_time = data.last_message_time;
                    }
                    
                    // 从IndexedDB加载最后消息
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

        // 设置到 store
        window.chatStore.groupsList = allGroups;
        // 按最后消息时间排序
        window.chatStore.sortGroupsByLastMessageTime();
    }

    // 更新未读计数显示
    updateUnreadCountsDisplay();

    // 直接更新store中的未读消息
    if (window.chatStore) {
        window.chatStore.unreadMessages = { ...unreadMessages };
    }
}

function showSendGroupCardModal(chatType) {
    const store = getStore();
    if (store) {
        store.currentSendChatType = chatType;
        store.selectedGroupIdForCard = null;
    }

    // 使用新的 openModal 方法
    if (typeof window.openModal === 'function') {
        window.openModal('sendGroupCard');
    }
    // 群组列表加载已迁移到 Vue 组件
}

function sendGroupCard() {
    const store = getStore();
    if (!store || !store.selectedGroupIdForCard) {
        return;
    }

    const selectedGroupIdForCard = store.selectedGroupIdForCard;
    const currentSendChatType = store.currentSendChatType;
    const currentPrivateChatUserId = store.currentPrivateChatUserId;
    const currentGroupId = store.currentGroupId;
    const currentUser = getCurrentUser();
    const currentSessionToken = getCurrentSessionToken();

    // 生成群组邀请Token
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

                // 获取群组信息
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
                            
                            // 构建群名片消息内容
                            const groupCardContent = JSON.stringify({
                                type: 'group_card',
                                group_id: group.id,
                                group_name: group.name || '',
                                group_description: group.description || '',
                                invite_token: token,
                                avatar_url: group.avatar_url || group.avatarUrl || ''
                            });

                            // 发送群名片消息
                            if (currentSendChatType === 'main') {
                                // 发送到主聊天室
                                window.chatSocket.emit('send-message', {
                                    content: groupCardContent,
                                    messageType: 3,
                                    sessionToken: currentSessionToken,
                                    userId: currentUser.id
                                });
                            } else if (currentSendChatType === 'group') {
                                // 发送到当前群组
                                window.chatSocket.emit('send-message', {
                                    content: groupCardContent,
                                    messageType: 3,
                                    groupId: currentGroupId,
                                    sessionToken: currentSessionToken,
                                    userId: currentUser.id
                                });
                            } else if (currentSendChatType === 'private' && currentPrivateChatUserId) {
                                // 发送到当前私信聊天
                                window.chatSocket.emit('send-private-message', {
                                    content: groupCardContent,
                                    messageType: 3,
                                    receiverId: currentPrivateChatUserId,
                                    sessionToken: currentSessionToken,
                                    userId: currentUser.id
                                });
                            }

                            // 关闭模态框
                            if (typeof window.closeModal === 'function') {
                                window.closeModal('sendGroupCard');
                            }
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
  initializeGroupFunctions,
  addGroupCardClickListeners,
  loadGroupList,
  getMutedGroups,
  isGroupMuted,
  toggleGroupMute,
  setupCreateGroupButton,
  setupGroupInfoButton,
  setupLeaveGroupButton,
  loadGroupMembers,
  showAddGroupMemberModal,
  hideAddGroupMemberModal,
  confirmAddGroupMembers,
  updateGroupName,
  updateGroupNotice,
  uploadGroupAvatar,
  joinGroupWithToken,
  showGroupCardPopup,
  displayShareGroupCardModal,
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
  currentSharedGroup
};