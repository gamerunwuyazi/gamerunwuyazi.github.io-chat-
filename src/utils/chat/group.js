import { SERVER_URL, toast } from './config.js';
import { 
  getStore, 
  getCurrentUser, 
  getCurrentSessionToken, 
  sessionStore, 
  unreadMessages 
} from './store.js';
import { unescapeHtml } from './message.js';
import { 
  openImagePreview, 
  updateUnreadCountsDisplay, 
  updateTitleWithUnreadCount, 
  currentGroupId, 
  currentUser, 
  currentSessionToken, 
  currentGroupName, 
  currentActiveChat, 
  currentSendChatType, 
  selectedGroupIdForCard,
  setActiveChat
} from './ui.js';
import { isConnected } from './websocket.js';
import { uploadImage, uploadFile } from './upload.js';

let groupsList = [];
let currentSharedGroup = null;

function initializeGroupFunctions() {
    // 群组点击事件已经在之前的代码中实现

    // 初始化群组搜索功能
    const groupSearchInput = document.getElementById('groupSearchInput');
    const clearGroupSearch = document.getElementById('clearGroupSearch');

    if (groupSearchInput && clearGroupSearch) {
        groupSearchInput.addEventListener('input', () => {
            const keyword = groupSearchInput.value.toLowerCase();
            const groupItems = document.querySelectorAll('#groupList li[data-group-id]');

            groupItems.forEach(item => {
                const groupName = item.dataset.groupName.toLowerCase();
                if (groupName.includes(keyword)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });

            // 显示或隐藏清除搜索按钮
            if (keyword) {
                clearGroupSearch.style.display = 'inline';
            } else {
                clearGroupSearch.style.display = 'none';
            }
        });

        clearGroupSearch.addEventListener('click', () => {
            groupSearchInput.value = '';
            clearGroupSearch.style.display = 'none';
            const groupItems = document.querySelectorAll('#groupList li[data-group-id]');
            groupItems.forEach(item => {
                item.style.display = 'flex';
            });
        });
    }

    // 初始化群组消息发送
    const groupMessageInput = document.getElementById('groupMessageInput');
    const sendGroupMessageBtn = document.getElementById('sendGroupMessage');

    // 初始化群组图片和文件上传
    const groupImageUploadButton = document.getElementById('groupImageUploadButton');
    const groupFileUploadButton = document.getElementById('groupFileUploadButton');
    const groupImageInput = document.getElementById('groupImageInput');
    const groupFileInput = document.getElementById('groupFileInput');

    // 为群组聊天界面添加点击事件监听器，清除未读计数并发送加入事件
    const groupChatInterface = document.getElementById('groupChatInterface');
    if (groupChatInterface) {
        groupChatInterface.addEventListener('click', function() {
            if (currentGroupId) {
                // 清除群组未读计数
                delete unreadMessages.groups[currentGroupId];
                updateUnreadCountsDisplay();
                updateTitleWithUnreadCount();

                // 发送加入群组事件，只清除未读计数，不返回消息历史
                if (window.chatSocket) {
                    window.chatSocket.emit('join-group', {
                        groupId: parseInt(currentGroupId),
                        sessionToken: currentSessionToken,
                        userId: currentUser.id,
                        onlyClearUnread: true
                    });
                }
            }
        });
    }

    if (groupMessageInput && sendGroupMessageBtn) {
        sendGroupMessageBtn.addEventListener('click', function() {
            // console.log(`📤 群组消息发送按钮点击 - 群组ID: ${currentGroupId}, 群组名称: ${currentGroupName}`);
            sendGroupMessage();
        });

        // paste事件已在GroupChat.vue中处理
        // keydown事件已在GroupChat.vue中处理
    }

    // 初始化群组图片上传功能
    if (groupImageUploadButton && groupImageInput) {
        groupImageUploadButton.addEventListener('click', function() {
            // console.log(`🖼️  群组图片上传按钮点击 - 群组ID: ${currentGroupId}, 群组名称: ${currentGroupName}`);
            groupImageInput.click();
        });

        groupImageInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                // console.log(`📤 群组图片选择完成 - 文件名: ${this.files[0].name}, 大小: ${this.files[0].size} bytes, 群组ID: ${currentGroupId}`);
                uploadImage(this.files[0]);
            }
        });
    }

    // 初始化群组文件上传功能
    if (groupFileUploadButton && groupFileInput) {
        groupFileUploadButton.addEventListener('click', function() {
            // console.log(`📁 群组文件上传按钮点击 - 群组ID: ${currentGroupId}, 群组名称: ${currentGroupName}`);
            groupFileInput.click();
        });

        groupFileInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                // console.log(`📤 群组文件选择完成 - 文件名: ${this.files[0].name}, 大小: ${this.files[0].size} bytes, 群组ID: ${currentGroupId}`);
                uploadFile(this.files[0]);
            }
        });
    }

    function sendGroupMessage() {
        if (!currentGroupId) {
            console.warn('⚠️  无法发送群组消息 - 未选择群组');
            return;
        }

        const groupMessageInput = document.getElementById('groupMessageInput');
        if (!groupMessageInput) {
            console.error('❌ 无法获取群组消息输入框 - 元素不存在');
            return;
        }

        // 修复：正确获取输入框内容，处理可编辑div的内容获取
        let content = '';
        if (groupMessageInput.tagName === 'DIV' && groupMessageInput.isContentEditable) {
            // 对于可编辑div，获取文本内容并处理空标签
            content = groupMessageInput.textContent.trim();
            // 如果文本内容为空，尝试获取innerHTML并清理空标签
            if (!content) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = groupMessageInput.innerHTML;
                content = tempDiv.textContent.trim();
            }
        } else {
            // 对于普通input或textarea
            content = groupMessageInput.value || groupMessageInput.innerHTML || '';
            content = content.trim();
        }



        if (content && isConnected && window.chatSocket) {
            // console.log(`📤 准备发送群组消息 - 内容长度: ${content.length} 字符, 群组ID: ${currentGroupId}, 发送者ID: ${currentUser.id}`);

            // 使用Socket.io发送群组消息，与原UI保持一致，使用send-message事件并包含groupId参数
            const messageData = {
                groupId: currentGroupId,
                content: content,
                sessionToken: currentSessionToken,
                userId: currentUser.id
            };

            // console.log(`📡 发送群组消息到服务器 - 事件: send-message, 消息数据:`, messageData);
            window.chatSocket.emit('send-message', messageData);

            // 清空输入框
            groupMessageInput.value = '';
            // console.log(`✅ 群组消息发送完成 - 输入框已清空`);
        } else {
            if (!content) {
                console.warn('⚠️  无法发送群组消息 - 消息内容为空');
            } else if (!isConnected) {
                console.warn('⚠️  无法发送群组消息 - 未连接到服务器');
            } else if (!window.chatSocket) {
                console.warn('⚠️  无法发送群组消息 - WebSocket实例不存在');
            }
        }
    }
}

function addGroupCardClickListeners() {
    // 同时检查主聊天室、群组聊天和私信聊天的消息容器
    const messageContainers = ['#messageContainer', '#groupMessageContainer', '#privateMessageContainer'];
    
    messageContainers.forEach(containerSelector => {
        const groupCardElements = document.querySelectorAll(`${containerSelector} .group-card-container`);
        groupCardElements.forEach(groupCardElement => {
            // 移除现有的点击事件监听器，避免重复添加
            const newGroupCardElement = groupCardElement.cloneNode(true);
            groupCardElement.parentNode.replaceChild(newGroupCardElement, groupCardElement);
            
            // 获取群组ID
            let groupId = newGroupCardElement.getAttribute('data-group-id');
            
            // 尝试从群名片元素中提取群组信息
            const groupNameElement = newGroupCardElement.querySelector('.group-card-header');
            const groupDescriptionElement = newGroupCardElement.querySelector('.group-card-description');
            const groupAvatarElement = newGroupCardElement.querySelector('img');
            const groupName = groupNameElement ? groupNameElement.textContent.trim() : '未知群组';
            const groupDescription = groupDescriptionElement ? groupDescriptionElement.textContent.trim() : '暂无公告';
            let groupAvatarUrl = '';
            
            // 尝试从群名片元素中提取头像URL
            if (groupAvatarElement) {
                const avatarSrc = groupAvatarElement.src;
                if (avatarSrc) {
                    // 检查头像URL是否已经包含完整的服务器地址
                    if (avatarSrc.includes(SERVER_URL)) {
                        // 如果已经包含完整地址，提取相对路径
                        groupAvatarUrl = avatarSrc.replace(SERVER_URL, '');
                    } else {
                        // 否则保留原始URL
                        groupAvatarUrl = avatarSrc;
                    }
                }
            }
            
            // 如果没有从data属性获取到群组ID，尝试从群名片内容中解析
            if (!groupId) {
                try {
                    // 尝试从群名片的内容中解析群组ID
                    // 这里假设群名片的HTML结构中包含群组ID信息
                    // 或者尝试从头像URL中提取群组ID
                    if (groupAvatarUrl.includes('/group-avatars/')) {
                        const matches = groupAvatarUrl.match(/group-avatars\/(\d+)\./);
                        if (matches && matches[1]) {
                            groupId = matches[1];
                        }
                    }
                } catch (error) {
                    console.error('解析群组ID失败:', error);
                }
            }
            
            // 创建群名片数据
            const groupCardData = {
                group_id: groupId,
                group_name: groupName,
                group_description: groupDescription,
                avatar_url: groupAvatarUrl
            };
            
            // 添加点击事件监听器
            newGroupCardElement.addEventListener('click', function(e) {
                e.stopPropagation();
                showGroupCardPopup(e, groupCardData);
            });
        });
    });
}

function loadGroupList() {
    if (!currentUser || !currentSessionToken) return;

    // 使用fetch API加载群组列表
    fetch(`${SERVER_URL}/user-groups/${currentUser.id}`, {
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

    // 移除所有现有的点击事件监听器
    const newGroupInfoButton = groupInfoButton.cloneNode(true);
    groupInfoButton.parentNode.replaceChild(newGroupInfoButton, groupInfoButton);

    // 为新按钮添加点击事件
    newGroupInfoButton.addEventListener('click', function() {
        const user = getCurrentUser();
        const sessionToken = getCurrentSessionToken();
        
        if (!currentGroupId) {
            toast.warning('请先选择一个群组');
            return;
        }

        // 使用fetch API获取群组信息
        fetch(`${SERVER_URL}/group-info/${currentGroupId}`, {
            headers: {
                'user-id': user?.id,
                'session-token': sessionToken
            }
        })
            .then(response => {
                // 检查响应状态
                if (!response.ok) {
                    throw new Error(`HTTP错误! 状态码: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // 确保数据存在
                if (!data) {
                    throw new Error('获取数据失败');
                }

                if (data.status === 'success') {
                    displayGroupInfoModal(data.group, currentGroupId);
                } else {
                    toast.error('获取群组信息失败: ' + (data.message || '未知错误'));
                }
            })
            .catch(error => {
                console.error('获取群组信息错误:', error);
                // 只有当不是HTTP错误时才提示网络错误
                if (error.message && error.message.includes('HTTP错误')) {
                    toast.error('获取群组信息失败，服务器返回错误');
                } else {
                    toast.error('获取群组信息失败，网络错误');
                }
            });
    });
}

function setupLeaveGroupButton(leaveGroupButton) {
    if (!leaveGroupButton) return;

    // 移除所有现有的点击事件监听器
    const newLeaveGroupButton = leaveGroupButton.cloneNode(true);
    leaveGroupButton.parentNode.replaceChild(newLeaveGroupButton, leaveGroupButton);

    // 更新按钮文本
    updateLeaveGroupButtonText(newLeaveGroupButton);

    // 为新按钮添加点击事件
    newLeaveGroupButton.addEventListener('click', function() {
        if (!currentGroupId) {
            toast.warning('请先选择一个群组');
            return;
        }

        // 检查用户是否是群主
        fetch(`${SERVER_URL}/group-info/${currentGroupId}`, {
            headers: {
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            }
        })
            .then(response => {
                // 检查响应状态
                if (!response.ok) {
                    throw new Error(`HTTP错误! 状态码: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // 确保数据存在
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
                    // 处理服务器返回的错误
                    toast.error(data.message || '获取群组信息失败');
                }
            })
            .catch(error => {
                console.error('获取群组信息错误:', error);
                // 只有当不是HTTP错误时才提示网络错误
                if (error.message && error.message.includes('HTTP错误')) {
                    toast.error('获取群组信息失败，服务器返回错误');
                } else {
                    toast.error('获取群组信息失败，网络错误');
                }
            });
    });
}

function handleDissolveGroup(groupId) {
    if (confirm('确定要解散该群组吗？此操作不可恢复，所有群消息将被删除。')) {
        dissolveGroup(groupId);
    }
}

function handleLeaveGroup(groupId) {
    if (confirm('确定要退出该群组吗？')) {
        // 使用fetch API退出群组
        fetch(`${SERVER_URL}/leave-group`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'user-id': currentUser.id,
                'session-token': currentSessionToken
            },
            body: JSON.stringify({
                groupId: groupId
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    toast.success('已成功退出群组');
                    // 重新加载群组列表
                    loadGroupList();

                    // 清空当前群组信息
                    currentGroupId = null;
                    currentGroupName = '';

                    // 显示群组选择界面
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
            })
            .catch(error => {
                toast.error('退出群组失败，网络错误');
            });
    }
}

function dissolveGroup(groupId) {
    if (!currentUser || !currentSessionToken) {
        toast.error('请先登录');
        return;
    }

    if (!confirm('确定要解散本群组吗？此操作不可恢复，所有群消息将被删除。')) {
        return;
    }

    fetch(`${SERVER_URL}/dissolve-group`, {
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
            if (data.status === 'success') {
                toast.success('群组已成功解散，所有群消息已删除');

                // 清空当前群组信息
                const store = getStore();
                if (store) {
                    store.currentGroupId = null;
                    store.currentGroupName = '';
                    store.currentActiveChat = null;
                }

                // 重新加载群组列表
                loadGroupList();
            } else {
                toast.error('解散群组失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(error => {
            toast.error('解散群组失败，网络错误');
        });
}

function loadGroupMembers(groupId, isOwner) {
    // console.log(`📋 [群组成员] 开始加载群组成员列表，群组ID: ${groupId}，是否为群主: ${isOwner}`);

    const groupMembersContainer = document.getElementById('groupMembersContainer');
    const modalGroupMemberCount = document.getElementById('modalGroupMemberCount');
    if (!groupMembersContainer) {
        // console.error('❌ [群组成员] 未找到群组成员容器');
        return;
    }

    groupMembersContainer.innerHTML = '<div class="loading-members">正在加载成员列表...</div>';

    // console.log(`🔄 [群组成员] 发送请求获取群组成员列表，群组ID: ${groupId}`);
    fetch(`${SERVER_URL}/group-members/${groupId}`, {
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
        .catch(error => {
            // console.error('❌ [群组成员] 网络错误加载群组成员列表:', error);
            groupMembersContainer.innerHTML = '<div class="loading-members">加载成员列表失败，网络错误</div>';
        });
}

function updateGroupMembersList(members, isOwner, groupId) {
    // console.log(`📋 [群组成员] 开始更新群组成员列表，群组ID: ${groupId}，是否为群主: ${isOwner}，成员数量: ${members ? members.length : 0}`);

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
    members.forEach((member, index) => {
        // 检查是否是群主
        const isMemberOwner = String(member.id) === String(currentUser.id);

        // console.log(`👤 [群组成员] 处理成员 ${index + 1}/${members.length}: ID=${member.id}, 昵称=${member.nickname}, 是当前用户: ${isMemberOwner}`);

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

function removeMemberFromGroup(groupId, memberId, memberName) {
    if (!confirm(`确定要踢出成员 ${memberName} 吗？`)) return;
    if (!currentUser || !currentSessionToken) {
        toast.error('请先登录');
        return;
    }

    fetch(`${SERVER_URL}/remove-group-member`, {
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

    if (!groupId || !currentUser || !currentSessionToken) {
        return;
    }

    // 保存当前群组ID
    window.currentAddingGroupId = groupId;

    // 使用新的 openModal 方法
    if (typeof window.openModal === 'function') {
        window.openModal('addGroupMember');
    }

    // 等待 DOM 渲染完成后再操作
    setTimeout(() => {
        document.body.style.overflow = 'hidden';

        // 加载可用成员
        loadAvailableMembersForGroup(groupId);
    }, 100);
}

function confirmAddGroupMembers() {

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
    fetch(`${SERVER_URL}/add-group-members`, {
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
                    hideAddGroupMemberModal();
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
    if (!currentUser || !currentSessionToken) {
        toast.error('请先登录');
        return;
    }

    fetch(`${SERVER_URL}/update-group-name`, {
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
        .then(data => {
            if (data.status === 'success') {
                // 对服务器返回的新群组名称进行反转义，避免二次转义
                const unescapedGroupName = unescapeHtml(data.newGroupName);

                // 更新本地群组名称
                currentGroupName = unescapedGroupName;

                // 更新界面上的群组名称
                const currentGroupNameElement = document.getElementById('currentGroupName');
                if (currentGroupNameElement) {
                    currentGroupNameElement.textContent = unescapedGroupName;
                }

                // 更新群组列表中的名称
                updateGroupNameInList(groupId, unescapedGroupName);

                // 恢复群组信息模态框中群组名称的显示状态
                const groupNameContainer = document.querySelector('.group-info-item:nth-of-type(1) > div');
                if (groupNameContainer) {
                    groupNameContainer.innerHTML = `
                    <span id="modalGroupNameValue">${unescapedGroupName}</span>
                    <button id="editGroupNameBtn" class="edit-group-name-btn" style="padding: 4px 8px; background-color: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        编辑
                    </button>
                `;
                    // 重新设置编辑按钮功能
                    setupEditGroupNameButton(true, unescapedGroupName, groupId);
                }

                // 更新模态框标题
                const modalGroupName = document.getElementById('modalGroupName');
                if (modalGroupName) {
                    modalGroupName.textContent = `${unescapedGroupName} - 群组信息`;
                }

                toast.success('群组名称已成功更新');

                // 关闭管理模态框（如果打开的话）
                const manageGroupModal = document.getElementById('manageGroupModal');
                if (manageGroupModal && manageGroupModal.style.display !== 'none') {
                    manageGroupModal.style.display = 'none';
                }
            } else {
                toast.error('修改群组名称失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(error => {
            toast.error('修改群组名称失败，网络错误');
        });
}

function updateGroupNotice(groupId, newNotice) {
    if (!currentUser || !currentSessionToken) {
        toast.error('请先登录');
        return;
    }

    fetch(`${SERVER_URL}/update-group-description`, {
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
                // 更新群组列表中的公告（如果有显示的话）
                updateGroupNoticeInList(groupId, newNotice);

                // 直接获取群组公告容器，而不依赖于 modalGroupNoticeValue
                const groupNoticeContainer = document.querySelector('.group-info-item:nth-of-type(3) > div');
                if (groupNoticeContainer) {
                    // 恢复显示状态
                    groupNoticeContainer.innerHTML = `
                    <span id="modalGroupNoticeValue" style="flex: 1; word-break: break-word;">${newNotice || '暂无群组公告'}</span>
                    <button id="editGroupNoticeBtn" class="edit-group-notice-btn" style="padding: 4px 8px; background-color: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        编辑
                    </button>
                `;
                    // 重新设置编辑按钮功能
                    setupEditGroupNoticeButton(true, newNotice, groupId);
                }

                toast.success('群组公告已成功更新');
            } else {
                toast.error('修改群组公告失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(error => {
            console.error('修改群组公告失败:', error);
            toast.error('修改群组公告失败，网络错误: ' + error.message);
        });
}

function uploadGroupAvatar(groupId, file) {
    if (!currentUser || !currentSessionToken) {
        toast.error('请先登录');
        return;
    }

    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('groupId', groupId);
    formData.append('userId', currentUser.id);

    // 显示上传提示
    toast.info('正在上传群头像，请稍候...');

    fetch(`${SERVER_URL}/upload-group-avatar/${groupId}`, {
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
                // 重新加载群组信息
                fetch(`${SERVER_URL}/group-info/${groupId}`, {
                    headers: {
                        'user-id': currentUser.id,
                        'session-token': currentSessionToken
                    }
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.status === 'success') {
                            // 先关闭模态框，然后重新打开
                            const modal = document.getElementById('groupInfoModal');
                            if (modal) {
                                modal.style.display = 'none';
                            }

                            // 延迟一下再重新显示，确保DOM更新完成
                            setTimeout(() => {
                                // 重新显示群组信息模态框
                                displayGroupInfoModal(data.group, groupId);
                                // 刷新群组列表
                                loadGroupList();
                            }, 100);
                        }
                    });
            } else {
                toast.error('上传群头像失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(error => {
            toast.error('上传群头像失败，网络错误');
        });
}

function joinGroupWithToken(token, groupId, groupName, popup) {
    fetch(`${SERVER_URL}/join-group-with-token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        },
        body: JSON.stringify({ token: token })
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
    // 检查groupCardData是否存在
    if (!groupCardData) {
        return;
    }

    // 移除已存在的弹出窗口
    const existingPopup = document.getElementById('groupCardPopup');
    if (existingPopup) {
        existingPopup.remove();
    }

    // 创建弹出窗口
    const popup = document.createElement('div');
    popup.id = 'groupCardPopup';
    popup.style.position = 'fixed';
    popup.style.width = '300px';
    popup.style.backgroundColor = 'white';
    popup.style.border = '1px solid #3498db';
    popup.style.borderRadius = '8px';
    popup.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    popup.style.zIndex = '10000';
    popup.style.padding = '15px';

    // 填充弹出窗口内容
    // 使用DOM操作代替innerHTML，避免XSS和转义问题
    popup.innerHTML = '';

    // 创建头部
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '10px';

    // 创建标题和头像容器
    const titleContainer = document.createElement('div');
    titleContainer.style.display = 'flex';
    titleContainer.style.alignItems = 'center';
    titleContainer.style.gap = '10px';

    // 添加群头像
    if (groupCardData.avatar_url) {
        const avatarImg = document.createElement('img');
        avatarImg.src = `${SERVER_URL}${groupCardData.avatar_url}`;
        avatarImg.alt = groupCardData.group_name;
        avatarImg.style.width = '40px';
        avatarImg.style.height = '40px';
        avatarImg.style.borderRadius = '50%';
        avatarImg.style.objectFit = 'cover';
        avatarImg.style.cursor = 'pointer';
        avatarImg.addEventListener('click', function() {
            openImagePreview(avatarImg.src);
        });
        titleContainer.appendChild(avatarImg);
    } else if (groupCardData.avatarUrl) {
        // 尝试使用avatarUrl字段
        const avatarImg = document.createElement('img');
        avatarImg.src = `${SERVER_URL}${groupCardData.avatarUrl}`;
        avatarImg.alt = groupCardData.group_name;
        avatarImg.style.width = '40px';
        avatarImg.style.height = '40px';
        avatarImg.style.borderRadius = '50%';
        avatarImg.style.objectFit = 'cover';
        avatarImg.style.cursor = 'pointer';
        avatarImg.addEventListener('click', function() {
            openImagePreview(avatarImg.src);
        });
        titleContainer.appendChild(avatarImg);
    } else {
        // 显示默认头像
        const unescapedName = unescapeHtml(groupCardData.group_name || '');
        const initials = unescapedName ? unescapedName.charAt(0).toUpperCase() : 'G';
        const defaultAvatar = document.createElement('div');
        defaultAvatar.style.width = '40px';
        defaultAvatar.style.height = '40px';
        defaultAvatar.style.borderRadius = '50%';
        defaultAvatar.style.backgroundColor = '#3498db';
        defaultAvatar.style.color = 'white';
        defaultAvatar.style.display = 'flex';
        defaultAvatar.style.alignItems = 'center';
        defaultAvatar.style.justifyContent = 'center';
        defaultAvatar.style.fontSize = '18px';
        defaultAvatar.style.fontWeight = 'bold';
        defaultAvatar.textContent = initials;
        titleContainer.appendChild(defaultAvatar);
    }

    const title = document.createElement('h3');
    title.style.margin = '0';
    title.style.color = '#3498db';
    title.textContent = unescapeHtml(groupCardData.group_name || '未知群组');
    titleContainer.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.id = 'closeGroupCardPopup';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '18px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.color = '#999';
    closeBtn.textContent = '×';

    header.appendChild(titleContainer);
    header.appendChild(closeBtn);

    // 创建内容区
    const content = document.createElement('div');
    content.style.marginBottom = '15px';

    const groupIdP = document.createElement('p');
    groupIdP.style.margin = '8px 0';
    groupIdP.style.color = '#666';
    groupIdP.innerHTML = `<strong>群组ID:</strong> ${groupCardData.group_id || '未知'}`;

    const descP = document.createElement('p');
    descP.style.margin = '8px 0';
    descP.style.color = '#666';

    const descStrong = document.createElement('strong');
    descStrong.textContent = '公告:';
    descP.appendChild(descStrong);
    descP.appendChild(document.createTextNode(` ${unescapeHtml(groupCardData.group_description) || '暂无公告'}`));

    content.appendChild(groupIdP);
    content.appendChild(descP);

    // 检查用户是否已在群组中
    const store = window.chatStore;
    const isInGroup = store && store.groupsList && store.groupsList.some(g => String(g.id) === String(groupCardData.group_id));

    // 创建按钮区
    const buttonArea = document.createElement('div');
    buttonArea.style.display = 'flex';
    buttonArea.style.gap = '10px';

    const joinBtn = document.createElement('button');
    joinBtn.id = 'joinGroupButton';
    joinBtn.className = 'save-btn';
    joinBtn.style.flex = '1';

    if (isInGroup) {
        joinBtn.textContent = '发消息';
        joinBtn.addEventListener('click', function() {
            popup.remove();
            if (window.switchToGroupChat) {
                window.switchToGroupChat(
                    groupCardData.group_id,
                    groupCardData.group_name,
                    groupCardData.avatar_url || groupCardData.avatarUrl || ''
                );
            }
        });
    } else {
        joinBtn.textContent = '加入群组';
        joinBtn.addEventListener('click', function() {
            if (groupCardData.invite_token && groupCardData.group_id) {
                joinGroupWithToken(groupCardData.invite_token, groupCardData.group_id, groupCardData.group_name, popup);
            } else {
                console.warn('加入群组失败: 缺少必要的群组信息');
                toast.error('加入群组失败: 缺少必要的群组信息');
            }
        });
    }

    buttonArea.appendChild(joinBtn);

    // 组装弹出窗口
    popup.appendChild(header);
    popup.appendChild(content);
    popup.appendChild(buttonArea);

    // 添加到文档
    document.body.appendChild(popup);

    // 绑定关闭按钮事件
    closeBtn.addEventListener('click', function() {
        popup.remove();
    });

    // 点击外部关闭
    document.addEventListener('click', function(e) {
        if (!popup.contains(e.target) && e.target !== event.currentTarget) {
            popup.remove();
        }
    });

    // 计算并调整弹窗位置，确保不会超出屏幕边缘
    const popupRect = popup.getBoundingClientRect();
    const popupWidth = popupRect.width;
    const popupHeight = popupRect.height;

    // 计算初始位置（以鼠标位置为左上角）
    let left = event.clientX;
    let top = event.clientY;

    // 确保弹窗不会超出屏幕右边缘
    if (left + popupWidth > window.innerWidth) {
        left = window.innerWidth - popupWidth - 10;
    }

    // 确保弹窗不会超出屏幕下边缘
    if (top + popupHeight > window.innerHeight) {
        top = window.innerHeight - popupHeight - 10;
    }

    // 确保弹窗不会超出屏幕左边缘
    if (left < 0) {
        left = 10;
    }

    // 确保弹窗不会超出屏幕上边缘
    if (top < 0) {
        top = 10;
    }

    // 设置最终位置
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
}

function displayShareGroupCardModal() {
    const modal = document.getElementById('shareGroupCardModal');
    const shareGroupList = document.getElementById('shareGroupList');

    // 清空群组列表
    shareGroupList.innerHTML = '';

    // 加载用户加入的群组，排除当前要分享的群组
    fetch(`${SERVER_URL}/groups`, {
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
                        <label for="target-group-${group.id}" style="margin-left: 10px; cursor: pointer;">${unescapeHtml(group.name)}</label>
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
    if (!currentSharedGroup) return;

    // 获取选中的目标
    const selectedCheckboxes = document.querySelectorAll('.share-target-checkbox:checked');
    const selectedTargets = Array.from(selectedCheckboxes).map(checkbox => checkbox.value);

    if (selectedTargets.length === 0) {
        toast.warning('请选择至少一个分享目标');
        return;
    }

    // 生成群组邀请Token
    fetch(`${SERVER_URL}/generate-group-token`, {
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

function switchToGroupChat(groupId, groupName, _groupAvatarUrl) {
    const store = getStore();
    
    // 存储到会话存储对象
    sessionStore.currentGroupId = groupId;
    sessionStore.currentGroupName = groupName;
    sessionStore.currentActiveChat = `group_${groupId}`;
    sessionStore.currentSendChatType = 'group';
    sessionStore.selectedGroupIdForCard = groupId;
    
    // 同步到 store
    if (store) {
        store.currentGroupId = groupId;
        store.currentGroupName = groupName;
        store.currentActiveChat = `group_${groupId}`;
        store.currentSendChatType = 'group';
        store.selectedGroupIdForCard = groupId;
    }
    
    // 同步到 window（关键：用于加载更多历史消息）
    window.currentGroupId = groupId;
    window.currentActiveChat = `group_${groupId}`;
    
    // 设置活动聊天状态，并清除未读计数（因为用户真正进入了群组聊天）
    setActiveChat('group', groupId, true);

    // 跳转到群组页面
    if (window.router && window.router.currentRoute.value.path !== '/chat/group') {
        window.router.push('/chat/group');
    }

    // 将群组移到列表顶端（在路由跳转后执行，避免被 loadGroupList 覆盖）
    setTimeout(() => {
        if (store && store.moveGroupToTop) {
            store.moveGroupToTop(groupId);
        }
    }, 100);

    // 派发事件让Vue组件响应
    window.dispatchEvent(new CustomEvent('group-switched'));
    
    // 加载群组聊天记录，forceReload设置为true，确保切换群组时清空消息列表
    loadGroupMessages(groupId, true);
}

function loadGroupMessages(groupId, forceReload = false) {
    // 以下旧的 DOM 操作代码已禁用，使用 Vue 响应式渲染
    /*
    const groupMessageContainer = document.getElementById('groupMessageContainer');
    if (groupMessageContainer) {
        // 确保消息容器样式正确
        groupMessageContainer.style.flex = '1';
        groupMessageContainer.style.overflowY = 'auto';
        groupMessageContainer.style.padding = '10px';

        // 当切换群组时，需要清空消息容器，否则会导致不同群组的消息混合显示
        // 但是要以一种平滑的方式，避免闪烁
        if (forceReload) {
            // 清空消息容器，确保只显示当前群组的消息
            groupMessageContainer.innerHTML = '';
        }
    }
    */

    // 记录当前加载时间，用于去重
    const loadTime = Date.now();

    // 使用Socket.io获取群组聊天历史
    if (isConnected && window.chatSocket) {
        // 发送加入群组事件，根据原UI要求，只需要发送join-group事件，服务器会自动返回群组聊天历史
        const joinGroupData = {
            groupId: parseInt(groupId), // 确保是数字格式
            sessionToken: currentSessionToken,
            userId: currentUser.id,
            loadTime: loadTime // 传递加载时间戳
        };
        window.chatSocket.emit('join-group', joinGroupData);
    }
}

function updateGroupList(groups) {
    // 更新群组列表全局变量
    groupsList = groups;

    // 直接更新store
    if (window.chatStore) {
        window.chatStore.groupsList = [...groups];
    }

    // 更新未读计数显示
    updateUnreadCountsDisplay();

    // 直接更新store中的未读消息
    if (window.chatStore) {
        window.chatStore.unreadMessages = { ...unreadMessages };
    }

    // 如果有当前选中的群组，确保群组聊天界面显示
    if (currentGroupId) {
        const groupEmptyState = document.getElementById('groupEmptyState');
        const groupChatInterface = document.getElementById('groupChatInterface');
        const currentGroupNameElement = document.getElementById('currentGroupName');

        if (groupEmptyState) {
            groupEmptyState.style.display = 'none';
        }
        if (groupChatInterface) {
            groupChatInterface.style.display = 'flex';
            groupChatInterface.style.flexDirection = 'column';
        }
        if (currentGroupNameElement) {
            currentGroupNameElement.textContent = currentGroupName;
        }
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

    // 等待 DOM 渲染完成后再操作
    setTimeout(() => {
        const sendGroupCardList = document.getElementById('sendGroupCardList');
        if (!sendGroupCardList) {
            return;
        }

        const user = getCurrentUser();
        const sessionToken = getCurrentSessionToken();
        
        document.body.style.overflow = 'hidden';

        // 清空群组列表
        sendGroupCardList.innerHTML = '';

        // 加载用户加入的群组
        fetch(`${SERVER_URL}/user-groups/${user?.id}`, {
            headers: {
                'user-id': user?.id,
                'session-token': sessionToken
            }
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    const groups = data.groups;

                    if (groups.length === 0) {
                        sendGroupCardList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">你还没有加入任何群组</div>';
                    } else {
                        groups.forEach(group => {
                            const groupItem = document.createElement('div');
                            groupItem.className = 'send-group-card-item';
                            groupItem.style.display = 'flex';
                            groupItem.style.alignItems = 'center';
                            groupItem.style.margin = '10px 0';
                            groupItem.style.padding = '10px';
                            groupItem.style.borderRadius = '5px';
                            groupItem.style.cursor = 'pointer';
                            groupItem.style.border = '1px solid #ddd';
                            groupItem.style.transition = 'background-color 0.3s';

                            // 创建标签元素，使用textContent安全设置群组名称，避免XSS
                            const label = document.createElement('label');
                            label.setAttribute('for', `group-${group.id}`);
                            label.style.marginLeft = '10px';
                            label.style.cursor = 'pointer';
                            label.style.flex = '1';
                            // 服务器返回的名称已经被转义，需要反转义
                            const originalGroupName = unescapeHtml(group.group_name || group.name || '未命名群组');
                            label.textContent = originalGroupName;

                            // 创建单选按钮元素
                            const radio = document.createElement('input');
                            radio.setAttribute('type', 'radio');
                            radio.setAttribute('name', 'selectedGroup');
                            radio.setAttribute('value', group.id);
                            radio.setAttribute('id', `group-${group.id}`);
                            radio.className = 'send-group-card-radio';

                            // 清空并添加元素
                            groupItem.innerHTML = '';
                            groupItem.appendChild(radio);
                            groupItem.appendChild(label);

                            // 点击事件
                            groupItem.addEventListener('click', function() {
                                // 移除其他选中状态
                                document.querySelectorAll('.send-group-card-item').forEach(item => {
                                    item.style.backgroundColor = '';
                                    item.style.borderColor = '#ddd';
                                });
                                // 添加当前选中状态
                                this.style.backgroundColor = '#e8f5e8';
                                this.style.borderColor = '#3498db';
                                // 更新选中的群组ID
                                const store = getStore();
                                if (store) {
                                    store.selectedGroupIdForCard = group.id;
                                }
                                // 同时更新Vue组件中的状态
                                if (typeof window.selectGroupForCard === 'function') {
                                    window.selectGroupForCard(group.id);
                                }
                                // 启用发送按钮
                                const confirmBtn = document.getElementById('confirmSendGroupCard');
                                if (confirmBtn) {
                                    confirmBtn.disabled = false;
                                }
                            });

                            sendGroupCardList.appendChild(groupItem);
                        });
                    }
                }
            })
            .catch(error => {
                sendGroupCardList.innerHTML = '<div style="text-align: center; color: #e74c3c; padding: 20px;">加载群组列表失败</div>';
            });
    }, 100);
}

function sendGroupCard() {
    const store = getStore();
    if (!store || !store.selectedGroupIdForCard) {
        return;
    }

    const selectedGroupIdForCard = store.selectedGroupIdForCard;
    const currentSendChatType = store.currentSendChatType;
    const currentPrivateChatUserId = store.currentPrivateChatUserId;

    // 生成群组邀请Token
    fetch(`${SERVER_URL}/generate-group-token`, {
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
                fetch(`${SERVER_URL}/group-info/${selectedGroupIdForCard}`, {
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
                                group_name: group.name,
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
                                window.chatSocket.emit('private-message', {
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