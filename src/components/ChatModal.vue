<template>
  <div>
    <!-- 群组信息模态框 -->
    <div id="groupInfoModal" class="modal" v-if="chatStore.showGroupInfoModal" :style="modalStyle" @click="chatStore.closeModal('groupInfo')">
      <div class="modal-content" style="max-height: 85vh; max-width: 450px; width: 90%; display: flex; flex-direction: column; background: #f5f5f5;" @click.stop>
        <div class="modal-header" style="flex-shrink: 0; background: #f5f5f5; border-bottom: none; padding: 12px 16px;">
          <h2 id="modalGroupName" style="font-size: 20px; font-weight: 700; margin: 0;">{{ chatStore.modalData.groupInfo?.name || '' }} - 群组信息</h2>
          <span class="close" id="closeGroupInfoModal" @click="chatStore.closeModal('groupInfo')" style="font-size: 28px; opacity: 0.6;">&times;</span>
        </div>
        
        <div class="modal-body" style="flex: 1; overflow-y: auto; padding: 16px;">
          <div v-if="chatStore.modalData.groupInfo">
            <!-- 群头像和上传按钮 -->
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
              <div style="width: 100px; height: 100px; border-radius: 50%; background: #3498db; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <img v-if="chatStore.modalData.groupInfo.avatar_url" :src="getFullAvatarUrl(chatStore.modalData.groupInfo.avatar_url)" :alt="chatStore.modalData.groupInfo.name" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                <span v-else style="font-size: 40px; color: white; font-weight: bold;">{{ chatStore.modalData.groupInfo.name?.charAt(0)?.toUpperCase() || 'G' }}</span>
              </div>
              <div v-if="isCurrentUserGroupOwner">
                <input type="file" ref="groupAvatarInput" accept="image/*" style="display: none;" @change="handleGroupAvatarChange">
                <button class="save-btn" @click="groupAvatarInput?.click()" style="background: #3498db; padding: 8px 16px; border-radius: 8px; color: white; border: none; cursor: pointer; font-size: 14px; font-weight: 600;">
                  上传群头像
                </button>
              </div>
            </div>

            <!-- 群组名称 -->
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
              <label style="font-size: 16px; font-weight: 700; color: #555; min-width: 80px;">群组名称:</label>
              <template v-if="!editingGroupName">
                <span style="font-size: 16px; font-weight: 500; flex: 1;">{{ chatStore.modalData.groupInfo.name }}</span>
                <button v-if="isCurrentUserGroupOwner" @click="startEditGroupName" style="background: #3498db; padding: 5px 10px; border-radius: 6px; color: white; border: none; cursor: pointer; font-size: 13px; font-weight: 600;">
                  编辑
                </button>
              </template>
              <template v-else>
                <input type="text" v-model="tempGroupName" style="flex: 1; padding: 6px 10px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                <button @click="saveGroupName" style="background: #2ed573; padding: 6px 12px; border-radius: 6px; color: white; border: none; cursor: pointer; font-size: 14px; font-weight: 600; margin-left: 8px;">
                  保存
                </button>
                <button @click="cancelEditGroupName" style="background: #95a5a6; padding: 6px 12px; border-radius: 6px; color: white; border: none; cursor: pointer; font-size: 14px; font-weight: 600; margin-left: 8px;">
                  取消
                </button>
              </template>
            </div>

            <!-- 群组ID -->
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
              <label style="font-size: 16px; font-weight: 700; color: #555; min-width: 80px;">群组ID:</label>
              <span style="font-size: 16px;">{{ chatStore.modalData.groupInfo.id }}</span>
            </div>

            <!-- 群组公告 -->
            <div style="display: flex; gap: 10px; margin-bottom: 16px; align-items: flex-start;">
              <label style="font-size: 16px; font-weight: 700; color: #555; min-width: 80px; margin-top: 2px;">群组公告:</label>
              <template v-if="!editingGroupNotice">
                <span style="flex: 1; font-size: 14px; word-break: break-word;">{{ chatStore.modalData.groupInfo.description || '暂无公告' }}</span>
                <button v-if="isCurrentUserGroupOwner" @click="startEditGroupNotice" style="background: #3498db; padding: 5px 10px; border-radius: 6px; color: white; border: none; cursor: pointer; font-size: 13px; font-weight: 600; flex-shrink: 0;">
                  编辑
                </button>
              </template>
              <template v-else>
                <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                  <textarea v-model="tempGroupNotice" style="width: 100%; padding: 8px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; min-height: 80px; resize: vertical; box-sizing: border-box;"></textarea>
                  <div style="display: flex; gap: 6px;">
                    <button @click="saveGroupNotice" style="background: #2ed573; padding: 6px 12px; border-radius: 6px; color: white; border: none; cursor: pointer; font-size: 14px; font-weight: 600;">
                      保存
                    </button>
                    <button @click="cancelEditGroupNotice" style="background: #95a5a6; padding: 6px 12px; border-radius: 6px; color: white; border: none; cursor: pointer; font-size: 14px; font-weight: 600;">
                      取消
                    </button>
                  </div>
                </div>
              </template>
            </div>

            <!-- 成员数量 -->
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
              <label style="font-size: 16px; font-weight: 700; color: #555; min-width: 80px;">成员数量:</label>
              <span style="font-size: 16px;">{{ groupMembers.length }}</span>
            </div>

            <!-- 群主 -->
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 24px;">
              <label style="font-size: 16px; font-weight: 700; color: #555; min-width: 80px;">群主:</label>
              <span style="font-size: 16px;">群主ID: {{ chatStore.modalData.groupInfo.creator_id || '未知' }}</span>
            </div>

            <!-- 群组成员标题 -->
            <h3 style="font-size: 18px; font-weight: 800; margin-bottom: 12px;">群组成员</h3>

            <!-- 群组成员列表 -->
            <div v-if="groupMembers.length > 0" style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 12px; padding: 12px; margin-bottom: 24px;">
              <div v-for="member in groupMembers" :key="member.id" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: white; border-radius: 10px; margin-bottom: 8px;">
                <span style="font-size: 15px; font-weight: 500;">{{ member.nickname || member.username }}</span>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="color: #666; font-size: 14px;">ID: {{ member.id }}</span>
                  <span v-if="String(member.id) === String(chatStore.currentUser?.id)" style="color: #3498db; font-size: 14px; font-weight: 700;">（我）</span>
                  <button v-if="isCurrentUserGroupOwner && String(member.id) !== String(chatStore.modalData.groupInfo.creator_id)" 
                          @click="handleRemoveGroupMember(member)" 
                          style="background: #e74c3c; padding: 5px 10px; border-radius: 6px; color: white; border: none; cursor: pointer; font-size: 13px; font-weight: 600;">
                    踢出
                  </button>
                </div>
              </div>
            </div>
            <div v-else style="text-align: center; color: #999; padding: 16px;">加载成员列表中...</div>

            <!-- 群主管理区域 -->
            <div v-if="isCurrentUserGroupOwner" style="border-top: 1px solid #e0e0e0; padding-top: 20px;">
              <h3 style="font-size: 18px; font-weight: 800; margin-bottom: 12px;">群组管理</h3>
              <div style="display: flex; gap: 12px;">
                <button @click="handleAddGroupMembers" style="background: #2ed573; padding: 8px 16px; border-radius: 6px; color: white; border: none; cursor: pointer; font-size: 13px; font-weight: 600;">
                  添加成员
                </button>
                <button @click="loadGroupMembers(chatStore.modalData.groupInfo.id)" style="background: #2ed573; padding: 8px 16px; border-radius: 6px; color: white; border: none; cursor: pointer; font-size: 13px; font-weight: 600;">
                  刷新成员列表
                </button>
              </div>
            </div>
          </div>
          <div v-else style="text-align: center; color: #999; padding: 30px;">
            加载群组信息中...
          </div>
        </div>
        <div class="modal-footer" style="flex-shrink: 0; background: #f5f5f5; border-top: none; padding: 12px 16px; justify-content: flex-end;">
          <button id="modalCloseButton" class="cancel-btn" @click="chatStore.closeModal('groupInfo')" style="background: #ff4757; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">关闭</button>
        </div>
      </div>
    </div>

    <!-- 创建群组模态框 -->
    <div id="createGroupModal" class="modal" v-if="chatStore.showCreateGroupModal" :style="modalStyle" @click="chatStore.closeModal('createGroup')">
      <div class="modal-content" style="max-height: 100vh; max-width: 450px; width: 90%; display: flex; flex-direction: column;" @click.stop>
        <div class="modal-header" style="flex-shrink: 0; padding: 12px 16px;">
          <h2 style="font-size: 18px; font-weight: 700; margin: 0;">创建群组</h2>
          <span class="close" id="closeCreateGroupModal" @click="chatStore.closeModal('createGroup')" style="font-size: 24px;">&times;</span>
        </div>
        <div class="modal-body" style="flex: 1; overflow-y: auto; padding: 12px 16px;">
          <div class="form-group" style="margin-bottom: 12px;">
            <label for="groupNameInput" style="display: block; font-weight: 600; color: #444; margin-bottom: 6px; font-size: 14px;">群组名称 *</label>
            <input type="text" id="groupNameInput" v-model="newGroupName" placeholder="请输入群组名称" required style="width: 100%; padding: 10px 14px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
          </div>
          <div class="form-group" style="margin-bottom: 12px;">
            <label for="groupDescriptionInput" style="display: block; font-weight: 600; color: #444; margin-bottom: 6px; font-size: 14px;">群组公告</label>
            <textarea id="groupDescriptionInput" v-model="newGroupDesc" placeholder="请输入群组公告（可选）" style="width: 100%; padding: 10px 14px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; box-sizing: border-box; min-height: 80px; resize: vertical;"></textarea>
          </div>
          <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-weight: 600; color: #444; margin-bottom: 8px; font-size: 14px;">选择其他群成员</label>
            <div class="select-all-container" style="display: flex; align-items: center; margin-bottom: 8px;">
              <input type="checkbox" id="selectAllGroupMembers" @change="handleSelectAllMembers" style="width: 18px; height: 18px; cursor: pointer;">
              <label for="selectAllGroupMembers" style="margin-left: 6px; margin-bottom: 3px; font-weight: 500; cursor: pointer; font-size: 14px;">全选</label>
            </div>
            <div class="member-list" id="groupMembersList" style="max-height: 180px; overflow-y: auto; border: 2px solid #e0e0e0; border-radius: 8px; padding: 10px; background: #f9f9f9;">
              <div v-if="loadingMembers" style="text-align: center; color: #999; padding: 20px; font-size: 14px;">加载中...</div>
              <div v-else-if="availableMembers.length === 0" style="text-align: center; color: #999; padding: 20px; font-size: 14px;">暂无可用成员</div>
              <div v-else v-for="user in availableMembers" :key="user.id" class="member-item" style="display: flex; align-items: center; padding: 8px; margin-bottom: 4px; background: white; border: 1px solid #e0e0e0; border-radius: 6px; cursor: pointer;">
                <input type="checkbox" :id="'member-' + user.id" :value="user.id" v-model="selectedMembers" style="width: 16px; height: 16px; cursor: pointer; flex-shrink: 0;">
                <label :for="'member-' + user.id" style="flex: 1; margin-left: 8px; margin-bottom: 0px; cursor: pointer; font-weight: 500; text-align: left; font-size: 14px; display: flex; align-items: center; line-height: 1.4;">
                  <span style="display: inline-block;">{{ user.nickname }}</span>
                  <span style="color: #666; font-size: 12px; margin-left: 6px;">ID: {{ user.id }}</span>
                </label>
              </div>
            </div>
          </div>
          <div id="createGroupMessage" v-if="createGroupMessage" :style="{ color: createGroupMessageType === 'success' ? '#2ed573' : '#ff4757', fontSize: '14px', marginTop: '10px' }">{{ createGroupMessage }}</div>
        </div>
        <div class="modal-footer" style="flex-shrink: 0; gap: 10px; padding: 12px 16px;">
          <button id="cancelCreateGroup" class="cancel-btn" @click="chatStore.closeModal('createGroup')" style="background: #ff4757; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">取消</button>
          <button id="submitCreateGroup" class="save-btn" @click="handleCreateGroup" style="background: #2ed573; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">创建群组</button>
        </div>
      </div>
    </div>

    <!-- 发送群名片模态框（单选） -->
    <div id="sendGroupCardModal" class="modal" v-if="chatStore.showSendGroupCardModal" :style="modalStyle" @click="chatStore.closeModal('sendGroupCard')">
      <div class="modal-content" style="width: 400px;" @click.stop>
        <div class="modal-header">
          <h2>选择群名片</h2>
          <span class="close" id="closeSendGroupCardModal" @click="chatStore.closeModal('sendGroupCard')">&times;</span>
        </div>
        <div class="modal-body">
          <p>选择要发送的群名片：</p>
          <div class="send-group-card-container" style="max-height: 300px; overflow-y: auto; margin: 15px 0;">
            <div id="sendGroupCardList"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="cancelSendGroupCard" class="cancel-btn" @click="chatStore.closeModal('sendGroupCard')">取消</button>
          <button id="confirmSendGroupCard" class="save-btn" :disabled="!selectedGroupIdForSendCard" @click="handleSendGroupCard">发送</button>
        </div>
      </div>
    </div>

    <!-- 用户资料模态框 -->
    <div id="userProfileModal" class="modal" v-if="chatStore.showUserProfileModal" :style="modalStyle" @click="chatStore.closeModal('userProfile')">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>用户资料</h2>
          <span class="close" id="closeUserProfileModal" @click="chatStore.closeModal('userProfile')">&times;</span>
        </div>
        <div class="modal-body">
          <div v-if="chatStore.modalData.userProfile" class="user-profile-container">
            <div class="user-profile-avatar">
              <img v-if="chatStore.modalData.userProfile.avatarUrl" :src="getFullAvatarUrl(chatStore.modalData.userProfile.avatarUrl)" alt="用户头像" class="user-avatar-img" loading="lazy" width="80" height="80" style="aspect-ratio: 1/1; object-fit: cover; border-radius: 50%;">
              <span v-else class="user-initials">{{ getUserInitials(chatStore.modalData.userProfile.nickname) }}</span>
            </div>
            <div class="user-profile-info">
              <div class="user-profile-item">
                <label>昵称:</label>
                <span>{{ chatStore.modalData.userProfile.nickname }}</span>
              </div>
              <div class="user-profile-item">
                <label>用户名:</label>
                <span>{{ chatStore.modalData.userProfile.username }}</span>
              </div>
              <div class="user-profile-item">
                <label>用户ID:</label>
                <span>{{ chatStore.modalData.userProfile.id }}</span>
              </div>
              <div class="user-profile-item">
                <label>状态:</label>
                <span class="user-status">
                  {{ isUserOnline(chatStore.modalData.userProfile.id) ? '在线' : '离线' }}
                </span>
              </div>
            </div>
          </div>
          <div v-else>
            <span>加载用户资料中...</span>
          </div>
        </div>
        <div class="modal-footer">
          <button id="closeUserProfileButton" class="cancel-btn" @click="chatStore.closeModal('userProfile')">关闭</button>
        </div>
      </div>
    </div>

    <!-- 用户搜索模态框 -->
    <div id="userSearchModal" class="modal" v-if="chatStore.showUserSearchModal" :style="modalStyle" @click="chatStore.closeModal('userSearch')">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>搜索用户</h2>
          <span class="close" id="closeUserSearchModal" @click="chatStore.closeModal('userSearch')">&times;</span>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="searchKeyword">搜索关键词:</label>
            <input type="text" id="searchKeyword" placeholder="输入用户名或昵称" required v-model="searchKeyword">
          </div>
          <div id="searchResults" class="search-results" style="max-height: 300px; overflow-y: auto; margin-top: 15px;">
            <div v-if="searching" style="text-align: center; color: #999; padding: 20px;">搜索中...</div>
            <div v-else-if="searchResults.length === 0 && hasSearched" style="text-align: center; color: #999; padding: 20px;">未找到匹配的用户</div>
            <div v-else v-for="user in searchResults" :key="user.id" style="display: flex; align-items: center; padding: 12px; margin-bottom: 8px; background: white; border: 1px solid #e0e0e0; border-radius: 8px;">
              <div class="user-avatar-small" style="width: 40px; height: 40px; border-radius: 50%; background: #f0f0f0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 12px;">
                <img v-if="user.avatarUrl || user.avatar_url || user.avatar" :src="getFullAvatarUrl(user.avatarUrl || user.avatar_url || user.avatar)" :alt="user.nickname" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                <span v-else style="font-size: 16px; font-weight: 600; color: #666;">{{ getUserInitials(user.nickname) }}</span>
              </div>
              <div class="user-details" style="flex: 1;">
                <div class="user-nickname" style="font-weight: 600; font-size: 15px;">{{ user.nickname }}</div>
                <div class="user-username" style="color: #666; font-size: 13px;">@{{ user.username }}</div>
              </div>
              <button class="add-friend-btn" @click="handleAddFriend(user)" style="width: 32px; height: 32px; border-radius: 50%; background: #3498db; color: white; border: none; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">+</button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="cancelUserSearch" class="cancel-btn" @click="chatStore.closeModal('userSearch')">取消</button>
          <button id="confirmUserSearch" class="save-btn" @click="handleUserSearch">搜索</button>
        </div>
      </div>
    </div>

    <!-- 图片预览模态框 -->
    <div id="imagePreviewModal" class="modal" v-if="chatStore.showImagePreviewModal" :style="imagePreviewModalStyle" @click="chatStore.closeModal('imagePreview')">
      <div style="position: relative; max-width: 90%; max-height: 90%;" @click.stop>
        <img id="previewImgElement" :src="chatStore.modalData.imagePreviewUrl" alt="图片预览" style="width: 100%; height: auto; max-width: 90vw; max-height: 90vh; aspect-ratio: 16/9; object-fit: contain;" loading="lazy">
        <span class="close" id="closeImagePreviewModal" style="position: absolute; top: -30px; right: -30px; color: #f1f1f1; font-size: 40px; font-weight: bold; cursor: pointer;" @click="chatStore.closeModal('imagePreview')">&times;</span>
      </div>
    </div>

    <!-- 头像预览模态框 -->
    <div id="avatarPreviewModal" class="modal" v-if="chatStore.showAvatarPreviewModal" :style="avatarPreviewModalStyle" @click="chatStore.closeModal('avatarPreview')">
      <div style="position: relative; max-width: 300px; max-height: 300px;" @click.stop>
        <img id="previewAvatarElement" :src="chatStore.modalData.avatarPreviewUrl" alt="头像预览" style="width: 300px; height: 300px; border-radius: 50%; object-fit: cover;">
        <span class="close" id="closeAvatarPreviewModal" style="position: absolute; top: -30px; right: -30px; color: #f1f1f1; font-size: 40px; font-weight: bold; cursor: pointer;" @click="chatStore.closeModal('avatarPreview')">&times;</span>
      </div>
    </div>

    <!-- 添加成员模态框 -->
    <div id="addGroupMembersModal" class="modal" v-if="showAddGroupMembersModal" :style="modalStyle" @click="showAddGroupMembersModal = false">
      <div class="modal-content" style="max-height: 90vh; max-width: 500px; width: 90%; display: flex; flex-direction: column;" @click.stop>
        <div class="modal-header" style="flex-shrink: 0;">
          <h2>添加成员</h2>
          <span class="close" @click="showAddGroupMembersModal = false">&times;</span>
        </div>
        <div class="modal-body" style="flex: 1; overflow-y: auto;">
          <div id="availableMembersList" style="max-height: 400px; overflow-y: auto;">
            <div v-if="availableFriendsForAdd.length === 0" style="text-align: center; color: #999; padding: 30px;">没有可添加的好友</div>
            <div v-else v-for="friend in availableFriendsForAdd" :key="friend.id" class="member-item" style="display: flex; align-items: center; padding: 10px; margin-bottom: 8px; background: white; border: 1px solid #e0e0e0; border-radius: 8px; cursor: pointer;">
              <input type="checkbox" :id="'friend-' + friend.id" :value="friend.id" v-model="selectedFriendIdsForAdd" style="width: 20px; height: 20px; cursor: pointer; flex-shrink: 0;">
              <label :for="'friend-' + friend.id" style="flex: 1; margin-left: 12px; cursor: pointer; font-weight: 500; text-align: left;">{{ friend.nickname || friend.username }} <span style="color: #666; font-size: 14px;">ID: {{ friend.id }}</span></label>
            </div>
          </div>
          <div id="addMembersMessage" style="margin-top: 10px;"></div>
        </div>
        <div class="modal-footer" style="flex-shrink: 0; gap: 12px;">
          <button class="cancel-btn" @click="showAddGroupMembersModal = false" style="background: #ff4757; color: white; border: none; padding: 12px 30px; border-radius: 8px; font-size: 16px; cursor: pointer;">取消</button>
          <button class="save-btn" @click="confirmAddGroupMembers" style="background: #2ed573; color: white; border: none; padding: 12px 30px; border-radius: 8px; font-size: 16px; cursor: pointer;">添加成员</button>
        </div>
      </div>
    </div>

    <!-- 用户头像小弹窗 -->
    <div 
      v-if="chatStore.showUserAvatarPopup" 
      style="position: fixed; left: 0; top: 0; width: 100%; height: 100%; z-index: 9999;"
      @click="chatStore.closeModal('userAvatarPopup')"
    >
      <div 
        id="userAvatarPopup" 
        :style="userAvatarPopupStyle"
        @click.stop
      >
        <div class="popup-header">
          <div class="popup-avatar">
            <img 
              id="popupAvatarImg" 
              :src="userAvatarPopupAvatarUrl" 
              alt="用户头像"
              :style="{ display: userAvatarPopupAvatarUrl ? 'block' : 'none' }"
              @click="openUserAvatarPopupAvatarPreview"
            >
            <span 
              id="popupInitials" 
              :style="{ display: userAvatarPopupAvatarUrl ? 'none' : 'block' }"
            >{{ userAvatarPopupInitials }}</span>
          </div>
          <div class="popup-info">
            <div id="popupNickname">{{ userAvatarPopupNickname }}</div>
            <div 
              id="popupUsername" 
              :style="{ display: userAvatarPopupUsername ? 'block' : 'none' }"
            >{{ userAvatarPopupUsername }}</div>
          </div>
        </div>
        <div 
          v-if="userAvatarPopupSignature" 
          class="popup-signature-section"
        >
          <div class="signature-label">个性签名</div>
          <div id="popupSignature" class="signature-content">{{ userAvatarPopupSignature }}</div>
        </div>
        <div class="popup-actions">
          <button 
            id="popupAddFriend" 
            :style="userAvatarPopupAddFriendButtonStyle"
            :disabled="userAvatarPopupAddFriendButtonDisabled"
            @click="handleUserAvatarPopupAddFriend"
          >{{ userAvatarPopupAddFriendButtonText }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
#userAvatarPopup {
  position: fixed;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  z-index: 10001;
  min-width: 250px;
  opacity: 0;
  transition: opacity 0.1s;
}

#userAvatarPopup.visible {
  opacity: 1;
}

#userAvatarPopup .popup-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

#userAvatarPopup .popup-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3498db;
  color: white;
  font-weight: bold;
}

#userAvatarPopup .popup-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: pointer;
}

#userAvatarPopup .popup-avatar span {
  font-size: 18px;
}

#userAvatarPopup .popup-info {
  flex: 1;
}

#userAvatarPopup .popup-info #popupNickname {
  font-weight: bold;
  font-size: 16px;
}

#userAvatarPopup .popup-info #popupUsername {
  font-size: 14px;
  color: #666;
}

#userAvatarPopup .popup-actions {
  margin-top: 10px;
  display: flex;
  gap: 10px;
}

#userAvatarPopup .popup-actions button {
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

#userAvatarPopup .popup-signature-section {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #eee;
}

#userAvatarPopup .signature-label {
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

#userAvatarPopup .signature-content {
  font-size: 13px;
  color: #666;
  word-break: break-word;
}
</style>

<script setup>
import { useChatStore } from "@/stores/chatStore";
import { ref, computed, watch, onMounted } from "vue";
import { addFriend } from "@/utils/chat";
import toast from "@/utils/toast";

const SERVER_URL = process.env.VUE_APP_SERVER_URL || 'https://back.hs.airoe.cn';

const chatStore = useChatStore();

const searchKeyword = ref('');
const searching = ref(false);
const hasSearched = ref(false);
const searchResults = ref([]);
const selectedGroupIdForSendCard = ref(null);
const groupMembers = ref([]);
const loadingMembers = ref(false);
const availableMembers = ref([]);
const selectedMembers = ref([]);
const activeTab = ref('info');
const newGroupDescription = ref('');
const newGroupName = ref('');
const newGroupDesc = ref('');
const createGroupMessage = ref('');
const createGroupMessageType = ref('');
const showAddGroupMembersModal = ref(false);
const groupAvatarInput = ref(null);
const editingGroupName = ref(false);
const editingGroupNotice = ref(false);
const tempGroupName = ref('');
const tempGroupNotice = ref('');
const availableFriendsForAdd = ref([]);
const selectedFriendIdsForAdd = ref([]);

const userAvatarPopupLeft = ref(0);
const userAvatarPopupTop = ref(0);
const userAvatarPopupUserId = ref(null);
const userAvatarPopupEvent = ref(null);

const modalStyle = computed(() => ({
  display: 'flex',
  position: 'fixed',
  zIndex: 1000,
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  justifyContent: 'center',
  alignItems: 'center'
}));

const imagePreviewModalStyle = computed(() => ({
  display: 'flex',
  position: 'fixed',
  zIndex: 10001,
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',
  overflow: 'auto',
  backgroundColor: 'rgba(0,0,0,0.9)',
  justifyContent: 'center',
  alignItems: 'center'
}));

const avatarPreviewModalStyle = computed(() => ({
  display: 'flex',
  position: 'fixed',
  zIndex: 10001,
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',
  overflow: 'auto',
  backgroundColor: 'rgba(0,0,0,0.9)',
  justifyContent: 'center',
  alignItems: 'center'
}));

const userAvatarPopupStyle = computed(() => ({
  left: userAvatarPopupLeft.value + 'px',
  top: userAvatarPopupTop.value + 'px',
  position: 'fixed',
  zIndex: '10001'
}));

const userAvatarPopupNickname = computed(() => {
  return chatStore.modalData.userAvatarPopup?.nickname || '未知昵称';
});

const userAvatarPopupUsername = computed(() => {
  return chatStore.modalData.userAvatarPopup?.username || '';
});

const userAvatarPopupSignature = computed(() => {
  return chatStore.modalData.userAvatarPopup?.signature || '';
});

const userAvatarPopupInitials = computed(() => {
  const nickname = userAvatarPopupNickname.value;
  return nickname ? nickname.charAt(0).toUpperCase() : 'U';
});

const userAvatarPopupAvatarUrl = computed(() => {
  const user = chatStore.modalData.userAvatarPopup;
  if (!user) return '';
  
  let url = '';
  if (user.avatarUrl && typeof user.avatarUrl === 'string') {
    url = user.avatarUrl.trim();
  } else if (user.avatar_url && typeof user.avatar_url === 'string') {
    url = user.avatar_url.trim();
  } else if (user.avatar && typeof user.avatar === 'string') {
    url = user.avatar.trim();
  }
  
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${SERVER_URL}${url}`;
});

const userAvatarPopupIsFriend = computed(() => {
  const userId = userAvatarPopupUserId.value;
  if (!userId) return false;
  return chatStore.friendsList.some(friend => String(friend.id) === String(userId));
});

const userAvatarPopupIsCurrentUser = computed(() => {
  const userId = userAvatarPopupUserId.value;
  if (!userId || !chatStore.currentUser) return false;
  return String(chatStore.currentUser.id) === String(userId);
});

const userAvatarPopupAddFriendButtonText = computed(() => {
  if (userAvatarPopupIsFriend.value || userAvatarPopupIsCurrentUser.value) {
    return '已添加';
  }
  return '添加好友';
});

const userAvatarPopupAddFriendButtonDisabled = computed(() => {
  return userAvatarPopupIsFriend.value || userAvatarPopupIsCurrentUser.value;
});

const userAvatarPopupAddFriendButtonStyle = computed(() => {
  if (userAvatarPopupIsFriend.value || userAvatarPopupIsCurrentUser.value) {
    return {
      backgroundColor: '#ccc',
      color: 'white',
      cursor: 'not-allowed'
    };
  }
  return {
    backgroundColor: '#3498db',
    color: 'white',
    cursor: 'pointer'
  };
});

const isCurrentUserGroupOwner = computed(() => {
  if (!chatStore.modalData.groupInfo || !chatStore.currentUser) {
    return false;
  }
  return String(chatStore.modalData.groupInfo.creator_id) === String(chatStore.currentUser.id);
});

function getFullAvatarUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${chatStore.SERVER_URL}${url}`;
}

function getUserInitials(name) {
  if (!name) return 'U';
  return name.charAt(0).toUpperCase();
}

function isUserOnline(userId) {
  return chatStore.onlineUsers.some(user => String(user.id) === String(userId));
}

async function handleUserSearch() {
  if (!searchKeyword.value.trim()) {
    return;
  }
  
  searching.value = true;
  hasSearched.value = true;
  
  try {
    const user = chatStore.currentUser;
    const sessionToken = chatStore.currentSessionToken;
    
    console.log('[搜索用户] 当前用户:', user);
    console.log('[搜索用户] 当前用户ID:', user?.id);
    console.log('[搜索用户] 当前用户ID类型:', typeof user?.id);
    
    const response = await fetch(`${chatStore.SERVER_URL}/user/search?keyword=${encodeURIComponent(searchKeyword.value.trim())}`, {
      headers: {
        'user-id': user?.id || '',
        'session-token': sessionToken || ''
      }
    });
    
    const data = await response.json();
    
    console.log('[搜索用户] API返回数据:', data);
    
    if (data.status === 'success') {
      const users = data.users || [];
      console.log('[搜索用户] 搜索到的用户列表:', users);
      
      searchResults.value = users.filter(u => {
        const isCurrentUser = String(u.id) === String(user?.id);
        console.log('[搜索用户] 比较用户:', u.id, 'vs', user?.id, '是否是自己:', isCurrentUser);
        return !isCurrentUser;
      });
      
      console.log('[搜索用户] 过滤后的用户列表:', searchResults.value);
    } else {
      searchResults.value = [];
    }
  } catch (error) {
    console.error('搜索用户失败:', error);
    searchResults.value = [];
  } finally {
    searching.value = false;
  }
}

function handleAddFriend(user) {
  if (typeof window.addFriend === 'function') {
    window.addFriend(user.id);
  }
}

function handleSendGroupCard() {
  console.log('[发送群名片] 点击发送按钮');
  console.log('[发送群名片] selectedGroupIdForSendCard:', selectedGroupIdForSendCard.value);
  
  if (selectedGroupIdForSendCard.value) {
    console.log('[发送群名片] 开始发送群名片');
    if (typeof window.chatStore !== 'undefined' && window.chatStore) {
      window.chatStore.selectedGroupIdForCard = selectedGroupIdForSendCard.value;
      console.log('[发送群名片] 已同步到 window.chatStore.selectedGroupIdForCard');
    }
    if (typeof window.sendGroupCard === 'function') {
      console.log('[发送群名片] 调用 window.sendGroupCard()');
      window.sendGroupCard();
    } else {
      console.warn('[发送群名片] window.sendGroupCard 函数不存在');
    }
  } else {
    console.warn('[发送群名片] 未选择群组');
  }
}

watch(() => chatStore.showSendGroupCardModal, (newVal) => {
  if (newVal) {
    selectedGroupIdForSendCard.value = null;
  }
});

window.selectGroupForCard = function(groupId) {
  console.log('[发送群名片] 选择群组 ID:', groupId);
  selectedGroupIdForSendCard.value = groupId;
  if (chatStore) {
    chatStore.selectedGroupIdForCard = groupId;
  }
};

async function loadGroupMembers(groupId) {
  if (!groupId) return;
  
  try {
    const response = await fetch(`${chatStore.SERVER_URL}/group-members/${groupId}`, {
      headers: {
        'user-id': chatStore.currentUser?.id || '',
        'session-token': chatStore.currentSessionToken || ''
      }
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      groupMembers.value = data.members || [];
    }
  } catch (error) {
    console.error('加载群组成员失败:', error);
  }
}

async function loadAvailableMembers() {
  loadingMembers.value = true;
  try {
    availableMembers.value = [...chatStore.onlineUsers, ...chatStore.offlineUsers]
      .filter(user => user.id !== chatStore.currentUser?.id)
      .filter((user, index, self) => 
        index === self.findIndex(u => u.id === user.id)
      );
  } catch (error) {
    console.error('加载可用成员失败:', error);
    availableMembers.value = [];
  } finally {
    loadingMembers.value = false;
  }
}

function handleSelectAllMembers(event) {
  if (event.target.checked) {
    selectedMembers.value = availableMembers.value.map(user => user.id);
  } else {
    selectedMembers.value = [];
  }
}

async function handleCreateGroup() {
  const groupName = newGroupName.value.trim();
  const groupDescription = newGroupDesc.value.trim();
  const selectedMemberIds = selectedMembers.value;

  if (!groupName) {
    createGroupMessage.value = '群组名称不能为空';
    createGroupMessageType.value = 'error';
    return;
  }

  createGroupMessage.value = '';

  try {
    const user = chatStore.currentUser;
    const sessionToken = chatStore.currentSessionToken;

    if (!user || !sessionToken) {
      createGroupMessage.value = '未登录，请先登录';
      createGroupMessageType.value = 'error';
      return;
    }

    const response = await fetch(`${chatStore.SERVER_URL}/create-group`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': user.id,
        'session-token': sessionToken
      },
      body: JSON.stringify({
        userId: user.id,
        groupName: groupName,
        description: groupDescription,
        memberIds: selectedMemberIds
      })
    });

    const data = await response.json();

    if (data.status === 'success') {
      createGroupMessage.value = '群组创建成功';
      createGroupMessageType.value = 'success';

      if (typeof window.loadGroupList === 'function') {
        window.loadGroupList();
      }

      setTimeout(() => {
        chatStore.closeModal('createGroup');
        newGroupName.value = '';
        newGroupDesc.value = '';
        selectedMembers.value = [];
        createGroupMessage.value = '';
      }, 1000);
    } else {
      createGroupMessage.value = data.message || '群组创建失败';
      createGroupMessageType.value = 'error';
    }
  } catch (error) {
    console.error('创建群组失败:', error);
    createGroupMessage.value = '创建群组失败，网络错误';
    createGroupMessageType.value = 'error';
  }
}

watch(() => chatStore.showGroupInfoModal, (newVal) => {
  if (newVal && chatStore.modalData.groupInfo) {
    loadGroupMembers(chatStore.modalData.groupInfo.id);
  } else {
    groupMembers.value = [];
  }
});

watch(() => chatStore.showCreateGroupModal, (newVal) => {
  if (newVal) {
    selectedMembers.value = [];
    newGroupName.value = '';
    newGroupDesc.value = '';
    createGroupMessage.value = '';
    loadAvailableMembers();
  }
});

watch(() => chatStore.showGroupInfoModal, (newVal) => {
  if (newVal && chatStore.modalData.groupInfo) {
    activeTab.value = 'info';
    newGroupDescription.value = chatStore.modalData.groupInfo.description || '';
    editingGroupName.value = false;
    editingGroupNotice.value = false;
    tempGroupName.value = chatStore.modalData.groupInfo.name || '';
    tempGroupNotice.value = chatStore.modalData.groupInfo.description || '';
  }
});

function startEditGroupName() {
  tempGroupName.value = chatStore.modalData.groupInfo.name || '';
  editingGroupName.value = true;
}

function cancelEditGroupName() {
  editingGroupName.value = false;
  tempGroupName.value = chatStore.modalData.groupInfo.name || '';
}

async function saveGroupName() {
  if (!tempGroupName.value.trim()) {
    toast.error('群组名称不能为空');
    return;
  }
  
  try {
    const groupId = chatStore.modalData.groupInfo.id;
    const response = await fetch(`${chatStore.SERVER_URL}/update-group-name`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': chatStore.currentUser?.id || '',
        'session-token': chatStore.currentSessionToken || ''
      },
      body: JSON.stringify({ 
        groupId: groupId,
        newGroupName: tempGroupName.value.trim()
      })
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      toast.success('群组名称已更新');
      chatStore.modalData.groupInfo.name = tempGroupName.value.trim();
      editingGroupName.value = false;
    } else {
      toast.error(data.message || '更新群组名称失败');
    }
  } catch (error) {
    console.error('更新群组名称失败:', error);
    toast.error('更新群组名称失败');
  }
}

function startEditGroupNotice() {
  tempGroupNotice.value = chatStore.modalData.groupInfo.description || '';
  editingGroupNotice.value = true;
}

function cancelEditGroupNotice() {
  editingGroupNotice.value = false;
  tempGroupNotice.value = chatStore.modalData.groupInfo.description || '';
}

async function saveGroupNotice() {
  try {
    const groupId = chatStore.modalData.groupInfo.id;
    const response = await fetch(`${chatStore.SERVER_URL}/update-group-description`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': chatStore.currentUser?.id || '',
        'session-token': chatStore.currentSessionToken || ''
      },
      body: JSON.stringify({ 
        groupId: groupId,
        newDescription: tempGroupNotice.value
      })
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      toast.success('群组公告已更新');
      chatStore.modalData.groupInfo.description = tempGroupNotice.value;
      editingGroupNotice.value = false;
    } else {
      toast.error(data.message || '更新群组公告失败');
    }
  } catch (error) {
    console.error('更新群组公告失败:', error);
    toast.error('更新群组公告失败');
  }
}

async function handleRemoveGroupMember(member) {
  if (!confirm(`确定要踢出成员 ${member.nickname || member.username} 吗？`)) {
    return;
  }
  
  try {
    const groupId = chatStore.modalData.groupInfo.id;
    const response = await fetch(`${chatStore.SERVER_URL}/remove-group-member`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': chatStore.currentUser?.id || '',
        'session-token': chatStore.currentSessionToken || ''
      },
      body: JSON.stringify({ 
        groupId: groupId,
        memberId: member.id
      })
    });
    
    const data = await response.json();
    if (data.status === 'success' || (data.message && data.message.includes('成功'))) {
      toast.success(`已成功踢出成员 ${member.nickname || member.username}`);
      loadGroupMembers(groupId);
    } else {
      toast.error(data.message || '踢出成员失败');
    }
  } catch (error) {
    console.error('踢出成员失败:', error);
    toast.error('踢出成员失败');
  }
}

async function handleAddGroupMembers() {
  selectedFriendIdsForAdd.value = [];
  showAddGroupMembersModal.value = true;
  await loadAvailableFriendsForAdd();
}

async function loadAvailableFriendsForAdd() {
  try {
    const user = chatStore.currentUser;
    const sessionToken = chatStore.currentSessionToken;
    const groupId = chatStore.modalData.groupInfo.id;
    
    const friendsResponse = await fetch(`${chatStore.SERVER_URL}/user/friends`, {
      headers: {
        'user-id': user?.id || '',
        'session-token': sessionToken || ''
      }
    });
    
    const friendsData = await friendsResponse.json();
    if (friendsData.status === 'success' && friendsData.friends) {
      const membersResponse = await fetch(`${chatStore.SERVER_URL}/group-members/${groupId}`, {
        headers: {
          'user-id': user?.id || '',
          'session-token': sessionToken || ''
        }
      });
      
      const membersData = await membersResponse.json();
      const groupMemberIds = new Set((membersData.members || []).map(m => String(m.id)));
      
      availableFriendsForAdd.value = friendsData.friends.filter(friend => {
        const friendId = String(friend.id);
        const isNotCurrentUser = friendId !== String(user?.id);
        const isNotInGroup = !groupMemberIds.has(friendId);
        return isNotCurrentUser && isNotInGroup;
      });
    }
  } catch (error) {
    console.error('加载好友列表失败:', error);
    availableFriendsForAdd.value = [];
  }
}

async function confirmAddGroupMembers() {
  if (selectedFriendIdsForAdd.value.length === 0) {
    toast.error('请选择至少1名成员');
    return;
  }
  
  try {
    const groupId = chatStore.modalData.groupInfo.id;
    const response = await fetch(`${chatStore.SERVER_URL}/add-group-members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': chatStore.currentUser?.id || '',
        'session-token': chatStore.currentSessionToken || ''
      },
      body: JSON.stringify({ 
        groupId: groupId,
        memberIds: selectedFriendIdsForAdd.value
      })
    });
    
    const data = await response.json();
    if (data.status === 'success' || (data.message && data.message.includes('成功'))) {
      toast.success('成员添加成功');
      showAddGroupMembersModal.value = false;
      loadGroupMembers(groupId);
    } else {
      toast.error(data.message || '添加成员失败');
    }
  } catch (error) {
    console.error('添加成员失败:', error);
    toast.error('添加成员失败');
  }
}

async function handleGroupAvatarChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  
  try {
    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('groupId', chatStore.modalData.groupInfo.id);
    formData.append('userId', chatStore.currentUser?.id || '');
    
    const groupId = chatStore.modalData.groupInfo.id;
    const response = await fetch(`${chatStore.SERVER_URL}/upload-group-avatar/${groupId}`, {
      method: 'POST',
      headers: {
        'user-id': chatStore.currentUser?.id || '',
        'session-token': chatStore.currentSessionToken || ''
      },
      body: formData
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      toast.success('群头像上传成功');
      const infoResponse = await fetch(`${chatStore.SERVER_URL}/group-info/${groupId}`, {
        headers: {
          'user-id': chatStore.currentUser?.id || '',
          'session-token': chatStore.currentSessionToken || ''
        }
      });
      const infoData = await infoResponse.json();
      if (infoData.status === 'success' && infoData.group) {
        chatStore.modalData.groupInfo = infoData.group;
      }
      if (typeof window.loadGroupList === 'function') {
        window.loadGroupList();
      }
    } else {
      toast.error('上传群头像失败: ' + (data.message || '未知错误'));
    }
  } catch (error) {
    console.error('上传群头像失败:', error);
    toast.error('上传群头像失败，网络错误');
  }
  
  if (groupAvatarInput.value) {
    groupAvatarInput.value.value = '';
  }
}

async function fetchUserInfo(userId) {
  try {
    const response = await fetch(`${SERVER_URL}/user/${userId}`, {
      headers: {
        'user-id': chatStore.currentUser?.id || '',
        'session-token': chatStore.currentSessionToken || ''
      }
    });
    const data = await response.json();
    if (data.status === 'success') {
      return data.user;
    }
  } catch (error) {
    console.error('获取用户信息失败:', error);
  }
  return null;
}

function updateUserAvatarPopupPosition(event) {
  const popup = document.getElementById('userAvatarPopup');
  if (!popup) return;
  
  const popupRect = popup.getBoundingClientRect();
  const popupWidth = popupRect.width || 250;
  const popupHeight = popupRect.height || 150;
  
  let left = event.clientX;
  let top = event.clientY;
  
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  if (left + popupWidth > viewportWidth) {
    left = viewportWidth - popupWidth - 10;
  }
  
  if (top + popupHeight > viewportHeight) {
    top = event.clientY - popupHeight - 10;
  }
  
  if (left < 0) {
    left = 10;
  }
  
  if (top < 0) {
    top = 10;
  }
  
  userAvatarPopupLeft.value = left;
  userAvatarPopupTop.value = top;
}

async function showUserAvatarPopupVue(event, user) {
  event.stopPropagation();
  
  userAvatarPopupEvent.value = event;
  userAvatarPopupUserId.value = user.id;
  
  userAvatarPopupLeft.value = event.clientX;
  userAvatarPopupTop.value = event.clientY;
  
  const displayPopup = async (displayUser) => {
    chatStore.openModal('userAvatarPopup', displayUser);
    
    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    updateUserAvatarPopupPosition(event);
    
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    const popup = document.getElementById('userAvatarPopup');
    if (popup) {
      popup.classList.add('visible');
    }
  };
  
  if (user.id && user.username) {
    await displayPopup(user);
  } else {
    const fullUser = await fetchUserInfo(user.id);
    if (fullUser) {
      await displayPopup(fullUser);
    } else {
      await displayPopup(user);
    }
  }
}

function hideUserAvatarPopupVue() {
  const popup = document.getElementById('userAvatarPopup');
  if (popup) {
    popup.classList.remove('visible');
  }
  chatStore.closeModal('userAvatarPopup');
}

function openUserAvatarPopupAvatarPreview() {
  if (userAvatarPopupAvatarUrl.value) {
    chatStore.openModal('imagePreview', userAvatarPopupAvatarUrl.value);
  }
}

function handleUserAvatarPopupAddFriend() {
  if (userAvatarPopupAddFriendButtonDisabled.value || !userAvatarPopupUserId.value) return;
  
  addFriend(userAvatarPopupUserId.value);
  hideUserAvatarPopupVue();
}

onMounted(() => {
  window.showUserAvatarPopupVue = showUserAvatarPopupVue;
  window.hideUserAvatarPopupVue = hideUserAvatarPopupVue;
});
</script>

<style src="@/css/index.css"></style>
<style src="@/css/code-highlight.css"></style>
