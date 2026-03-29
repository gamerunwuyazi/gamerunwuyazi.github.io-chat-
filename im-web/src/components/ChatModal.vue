<template>
  <!-- 群组信息模态框 -->
  <Teleport to="body" v-if="chatStore.showGroupInfoModal">
    <div id="groupInfoModal" class="modal" :style="modalStyle" @click="chatStore.closeModal('groupInfo')">
      <div class="modal-content" style="max-height: 85vh; max-width: 450px; width: 90%; display: flex; flex-direction: column; background: #f5f5f5;" @click.stop>
        <div class="modal-header" style="flex-shrink: 0; background: #f5f5f5; border-bottom: none; padding: 12px 16px;">
          <h2 id="modalGroupName" style="font-size: 20px; font-weight: 700; margin: 0;">{{ groupInfoName }} - 群组信息</h2>
          <span class="close" id="closeGroupInfoModal" @click="chatStore.closeModal('groupInfo')" style="font-size: 28px; opacity: 0.6;">&times;</span>
        </div>
        
        <div class="modal-body" style="flex: 1; overflow-y: auto; padding: 16px;">
          <div v-if="chatStore.modalData.groupInfo">
            <!-- 群头像和上传按钮 -->
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
              <div style="width: 100px; height: 100px; border-radius: 50%; background: #3498db; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <img v-if="groupInfoAvatarUrl" :src="groupInfoAvatarUrl" :alt="groupInfoName" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" @error="handleGroupInfoAvatarError">
                <span v-else style="font-size: 40px; color: white; font-weight: bold;">{{ groupInfoInitials }}</span>
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
                <span style="font-size: 16px; font-weight: 500; flex: 1;">{{ groupInfoName }}</span>
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
                <span style="flex: 1; font-size: 14px; word-break: break-word;">{{ groupInfoDescription }}</span>
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
        <div class="modal-footer" style="flex-shrink: 0; background: #f5f5f5; border-top: none; padding: 12px 16px; justify-content: space-between;">
          <button v-if="isCurrentUserGroupOwner" @click="handleDissolveGroup" style="background: #ff4757; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">解散群组</button>
          <button v-else @click="handleLeaveGroup" style="background: #ff4757; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">退出群组</button>
          <button id="modalCloseButton" class="cancel-btn" @click="chatStore.closeModal('groupInfo')" style="background: #95a5a6; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 创建群组模态框 -->
  <Teleport to="body" v-if="chatStore.showCreateGroupModal">
    <div id="createGroupModal" class="modal" :style="modalStyle" @click="chatStore.closeModal('createGroup')">
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
  </Teleport>

  <!-- 发送群名片模态框（单选） -->
  <Teleport to="body" v-if="chatStore.showSendGroupCardModal">
    <div id="sendGroupCardModal" class="modal" :style="modalStyle" @click="chatStore.closeModal('sendGroupCard')">
      <div class="modal-content" style="width: 400px;" @click.stop>
        <div class="modal-header">
          <h2>选择群名片</h2>
          <span class="close" id="closeSendGroupCardModal" @click="chatStore.closeModal('sendGroupCard')">&times;</span>
        </div>
        <div class="modal-body">
          <p>选择要发送的群名片：</p>
          <div class="send-group-card-container" style="max-height: 300px; overflow-y: auto; margin: 15px 0;">
            <div v-if="loadingSendGroupCardList" style="text-align: center; color: #666; padding: 20px;">加载中...</div>
            <div v-else-if="sendGroupCardList.length === 0" style="text-align: center; color: #666; padding: 20px;">你还没有加入任何群组</div>
            <div v-else>
              <div 
                v-for="group in sendGroupCardList" 
                :key="group.id"
                class="send-group-card-item"
                :style="{
                  display: 'flex',
                  alignItems: 'center',
                  margin: '10px 0',
                  padding: '10px',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: selectedGroupIdForSendCard === group.id ? '#3498db' : '#ddd',
                  backgroundColor: selectedGroupIdForSendCard === group.id ? '#e8f5e8' : 'transparent',
                  transition: 'background-color 0.3s'
                }"
                @click="selectGroupForSendCard(group.id)"
              >
                <input 
                  type="radio" 
                  name="selectedGroup" 
                  :value="group.id" 
                  :id="`group-${group.id}`"
                  class="send-group-card-radio"
                  :checked="selectedGroupIdForSendCard === group.id"
                  @click.stop
                >
                <label 
                  :for="`group-${group.id}`"
                  style="margin-left: 10px; cursor: pointer; flex: 1;"
                >{{ group.group_name || group.name || '未命名群组' }}</label>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="cancelSendGroupCard" class="cancel-btn" @click="chatStore.closeModal('sendGroupCard')">取消</button>
          <button id="confirmSendGroupCard" class="save-btn" :disabled="!selectedGroupIdForSendCard" @click="handleSendGroupCard">发送</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 用户资料模态框 -->
  <Teleport to="body" v-if="chatStore.showUserProfileModal">
    <div id="userProfileModal" class="modal" :style="modalStyle" @click="chatStore.closeModal('userProfile')">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>用户资料</h2>
          <span class="close" id="closeUserProfileModal" @click="chatStore.closeModal('userProfile')">&times;</span>
        </div>
        <div class="modal-body">
          <div v-if="chatStore.modalData.userProfile" class="user-profile-container">
            <div class="user-profile-avatar" style="width: 80px; height: 80px; border-radius: 50%; background: #3498db; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <img v-if="userProfileAvatarUrl" :src="userProfileAvatarUrl" alt="用户头像" class="user-avatar-img" loading="lazy" width="80" height="80" style="aspect-ratio: 1/1; object-fit: cover; border-radius: 50%;" @error="handleUserProfileAvatarError">
              <span v-else class="user-initials" style="font-size: 32px; color: white; font-weight: bold;">{{ getUserInitials(chatStore.modalData.userProfile.nickname) }}</span>
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
                <label>用户 ID:</label>
                <span>{{ chatStore.modalData.userProfile.id }}</span>
              </div>
              <div class="user-profile-item">
                <label>性别:</label>
                <span>{{ getGenderText(chatStore.modalData.userProfile.gender) }}</span>
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
        <div class="modal-footer" style="justify-content: space-between;">
          <button id="deleteFriendButton" @click="handleDeleteFriend" style="background: #ff4757; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">删除好友</button>
          <button id="closeUserProfileButton" class="cancel-btn" @click="chatStore.closeModal('userProfile')" style="background: #95a5a6; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 用户搜索模态框 -->
  <Teleport to="body" v-if="chatStore.showUserSearchModal">
    <div id="userSearchModal" class="modal" :style="modalStyle" @click="chatStore.closeModal('userSearch')">
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
  </Teleport>

  <!-- 图片预览模态框 -->
  <Teleport to="body" v-if="chatStore.showImagePreviewModal">
    <div id="imagePreviewModal" class="modal" :style="imagePreviewModalStyle" @click="chatStore.closeModal('imagePreview')">
      <div style="position: relative; max-width: 90%; max-height: 90%;" @click.stop>
        <img id="previewImgElement" :src="chatStore.modalData.imagePreviewUrl" alt="图片预览" style="width: 100%; height: auto; max-width: 90vw; max-height: 90vh; aspect-ratio: 16/9; object-fit: contain;" loading="lazy">
        <span class="close" id="closeImagePreviewModal" style="position: absolute; top: -30px; right: -30px; color: #f1f1f1; font-size: 40px; font-weight: bold; cursor: pointer;" @click="chatStore.closeModal('imagePreview')">&times;</span>
      </div>
    </div>
  </Teleport>

  <!-- 头像预览模态框 -->
  <Teleport to="body" v-if="chatStore.showAvatarPreviewModal">
    <div id="avatarPreviewModal" class="modal" :style="avatarPreviewModalStyle" @click="chatStore.closeModal('avatarPreview')">
      <div style="position: relative; max-width: 300px; max-height: 300px;" @click.stop>
        <img id="previewAvatarElement" :src="chatStore.modalData.avatarPreviewUrl" alt="头像预览" style="width: 300px; height: 300px; border-radius: 50%; object-fit: cover;">
        <span class="close" id="closeAvatarPreviewModal" style="position: absolute; top: -30px; right: -30px; color: #f1f1f1; font-size: 40px; font-weight: bold; cursor: pointer;" @click="chatStore.closeModal('avatarPreview')">&times;</span>
      </div>
    </div>
  </Teleport>

  <!-- 添加成员模态框 -->
  <Teleport to="body" v-if="showAddGroupMembersModal">
    <div id="addGroupMembersModal" class="modal" :style="modalStyle" @click="showAddGroupMembersModal = false">
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
          <button class="cancel-btn" @click="showAddGroupMembersModal = false" style="background: #ff4757; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer;">取消</button>
          <button class="save-btn" @click="confirmAddGroupMembers" style="background: #2ed573; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer;">添加成员</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 用户头像小弹窗 -->
  <Teleport to="body" v-if="chatStore.showUserAvatarPopup">
    <div 
      style="position: fixed; left: 0; top: 0; width: 100%; height: 100%; z-index: 9999; pointer-events: none;"
      @click="chatStore.closeModal('userAvatarPopup')"
    >
      <div 
        id="userAvatarPopup" 
        :style="userAvatarPopupStyle"
        @click.stop
        style="pointer-events: auto;"
      >
        <div class="popup-header">
            <div class="user-avatar-wrapper">
              <div class="popup-avatar">
                <img 
                  id="popupAvatarImg" 
                  :src="userAvatarPopupAvatarUrl" 
                  alt="用户头像"
                  :style="{ display: userAvatarPopupAvatarUrl ? 'block' : 'none' }"
                  @click="openUserAvatarPopupAvatarPreview"
                  @error="handleUserAvatarPopupAvatarError"
                >
                <span 
                  id="popupInitials" 
                  :style="{ display: userAvatarPopupAvatarUrl ? 'none' : 'block' }"
                >{{ userAvatarPopupInitials }}</span>
              </div>
              <div v-if="isUserOnline(chatStore.modalData.userAvatarPopup?.id)" class="online-indicator"></div>
            </div>
          <div class="popup-info">
            <div class="popup-info-top">
              <div id="popupNickname">{{ userAvatarPopupNickname }}</div>
              <span 
                v-if="userAvatarPopupGender && userAvatarPopupGender !== 0" 
                class="gender-icon" 
                :class="userAvatarPopupGender === 1 ? 'male' : 'female'"
                :title="userAvatarPopupGender === 1 ? '男' : '女'"
              >
                {{ userAvatarPopupGender === 1 ? '♂' : '♀' }}
              </span>
            </div>
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
            v-if="userAvatarPopupAddFriendButtonText !== '已添加'"
          >{{ userAvatarPopupAddFriendButtonText }}</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 群名片小弹窗 -->
  <Teleport to="body" v-if="chatStore.showGroupCardPopup">
    <div 
      style="position: fixed; left: 0; top: 0; width: 100%; height: 100%; z-index: 9999; pointer-events: none;"
      @click="closeGroupCardPopup"
    >
      <div 
        id="groupCardPopup" 
        :style="groupCardPopupStyle"
        @click.stop
        style="pointer-events: auto;"
      >
        <div class="popup-header">
          <div class="popup-avatar">
            <img 
              v-if="groupCardPopupAvatarUrl" 
              :src="groupCardPopupAvatarUrl" 
              :alt="groupCardPopupData?.group_name"
              :style="{ display: groupCardPopupAvatarUrl ? 'block' : 'none' }"
              @click="openGroupCardPopupAvatarPreview"
              @error="handleGroupCardPopupAvatarError"
            >
            <span 
              :style="{ display: groupCardPopupAvatarUrl ? 'none' : 'block' }"
            >{{ groupCardPopupInitials }}</span>
          </div>
          <div class="popup-info">
            <div class="popup-info-top">
              <div class="popup-nickname">{{ groupCardPopupData?.group_name || '未知群组' }}</div>
            </div>
            <div class="popup-username">ID: {{ groupCardPopupData?.group_id || '未知' }}</div>
          </div>
        </div>
        <div v-if="groupCardPopupData?.group_description" class="popup-signature-section">
          <div class="signature-label">公告</div>
          <div class="signature-content">{{ groupCardPopupData.group_description }}</div>
        </div>
        <div class="popup-actions">
          <button 
            v-if="groupCardPopupIsInGroup"
            class="add-friend-btn"
            @click="handleGroupCardPopupSendMessage"
          >发消息</button>
          <button 
            v-else
            class="add-friend-btn"
            @click="handleGroupCardPopupJoinGroup"
            :disabled="!groupCardPopupData?.invite_token"
          >加入群组</button>
        </div>
      </div>
    </div>
  </Teleport>
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

#userAvatarPopup .user-avatar-wrapper {
  position: relative;
  display: inline-flex;
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

#userAvatarPopup .online-indicator {
  position: absolute;
  right: -2px;
  bottom: 0;
  width: 10px;
  height: 10px;
  background: limegreen;
  border-radius: 50%;
  border: 2px solid white;
  z-index: 1;
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

#userAvatarPopup .popup-info-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

#userAvatarPopup .popup-info #popupNickname {
  font-weight: bold;
  font-size: 16px;
}

#userAvatarPopup .popup-info #popupUsername {
  font-size: 14px;
  color: #666;
}

#userAvatarPopup .gender-icon {
  font-size: 14px;
  font-weight: bold;
}

#userAvatarPopup .gender-icon.male {
  color: #3498db;
}

#userAvatarPopup .gender-icon.female {
  color: #e91e63;
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

#groupCardPopup {
  position: fixed;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  z-index: 10001;
  min-width: 250px;
  max-width: 300px;
  opacity: 0;
  transition: opacity 0.1s;
}

#groupCardPopup.visible {
  opacity: 1;
}

#groupCardPopup .popup-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

#groupCardPopup .popup-avatar {
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
  flex-shrink: 0;
}

#groupCardPopup .popup-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: pointer;
}

#groupCardPopup .popup-avatar span {
  font-size: 18px;
}

#groupCardPopup .popup-info {
  flex: 1;
  min-width: 0;
}

#groupCardPopup .popup-info-top {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

#groupCardPopup .popup-nickname {
  font-weight: bold;
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

#groupCardPopup .popup-username {
  font-size: 13px;
  color: #666;
}

#groupCardPopup .popup-signature-section {
  margin: 10px 0;
  padding-top: 10px;
  border-top: 1px solid #eee;
}

#groupCardPopup .signature-label {
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

#groupCardPopup .signature-content {
  font-size: 13px;
  color: #666;
  word-break: break-word;
  max-height: 60px;
  overflow-y: auto;
}

#groupCardPopup .popup-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #eee;
}

#groupCardPopup .add-friend-btn {
  flex: 1;
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: #3498db;
  color: white;
  transition: background-color 0.2s;
}

#groupCardPopup .add-friend-btn:hover {
  background: #2980b9;
}

#groupCardPopup .add-friend-btn:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}
</style>

<script setup>
import { useChatStore } from "@/stores/chatStore";
import { ref, computed, watch, onMounted } from "vue";
import { addFriend } from "@/utils/chat";
import toast from "@/utils/toast";
import modal from "@/utils/modal";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://back.hs.airoe.cn';

const chatStore = useChatStore();

const searchKeyword = ref('');
const searching = ref(false);
const hasSearched = ref(false);
const searchResults = ref([]);
const selectedGroupIdForSendCard = ref(null);
const sendGroupCardList = ref([]);
const loadingSendGroupCardList = ref(false);
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
const userAvatarPopupAvatarLoadFailed = ref(false);
const userProfileAvatarLoadFailed = ref(false);
const groupInfoAvatarLoadFailed = ref(false);

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
  zIndex: '10001',
  maxWidth: '300px',
}));

const groupCardPopupLeft = ref(0);
const groupCardPopupTop = ref(0);
const groupCardPopupEvent = ref(null);

const groupCardPopupStyle = computed(() => ({
  left: groupCardPopupLeft.value + 'px',
  top: groupCardPopupTop.value + 'px',
  position: 'fixed',
  zIndex: '10001',
  maxWidth: '300px',
}));



const userAvatarPopupNickname = computed(() => {
  const nickname = chatStore.modalData.userAvatarPopup?.nickname || '未知昵称';
  return nickname;
});

const userAvatarPopupUsername = computed(() => {
  return chatStore.modalData.userAvatarPopup?.username || '';
});

const userAvatarPopupSignature = computed(() => {
  const signature = chatStore.modalData.userAvatarPopup?.signature || '';
  return signature;
});

const userAvatarPopupGender = computed(() => {
  return chatStore.modalData.userAvatarPopup?.gender || 0;
});

const userAvatarPopupInitials = computed(() => {
  const nickname = userAvatarPopupNickname.value;
  return nickname ? nickname.charAt(0).toUpperCase() : 'U';
});

const userAvatarPopupAvatarUrl = computed(() => {
  // 如果头像加载失败，返回空字符串
  if (userAvatarPopupAvatarLoadFailed.value) return '';
  
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

function handleUserAvatarPopupAvatarError() {
  userAvatarPopupAvatarLoadFailed.value = true;
}

function handleUserProfileAvatarError() {
  userProfileAvatarLoadFailed.value = true;
}

function handleGroupInfoAvatarError() {
  groupInfoAvatarLoadFailed.value = true;
}

const userProfileAvatarUrl = computed(() => {
  // 如果头像加载失败，返回空字符串
  if (userProfileAvatarLoadFailed.value) return '';
  
  const user = chatStore.modalData.userProfile;
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
  if (userAvatarPopupIsCurrentUser.value) {
    return '已添加';
  }
  if (userAvatarPopupIsFriend.value) {
    return '发消息';
  }
  return '添加好友';
});

const userAvatarPopupAddFriendButtonDisabled = computed(() => {
  return userAvatarPopupIsCurrentUser.value;
});

const userAvatarPopupAddFriendButtonStyle = computed(() => {
  if (userAvatarPopupIsCurrentUser.value) {
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

const groupInfoName = computed(() => {
  const name = chatStore.modalData.groupInfo?.name || '';
  return name;
});

const groupInfoDescription = computed(() => {
  const desc = chatStore.modalData.groupInfo?.description || '暂无公告';
  return desc;
});

const groupInfoInitials = computed(() => {
  const name = groupInfoName.value;
  return name ? name.charAt(0).toUpperCase() : 'G';
});

const groupCardPopupData = computed(() => {
  return chatStore.modalData.groupCardPopup;
});

const groupCardPopupInitials = computed(() => {
  const name = groupCardPopupData.value?.group_name || '';
  return name ? name.charAt(0).toUpperCase() : 'G';
});

const groupCardPopupAvatarLoadFailed = ref(false);

const groupCardPopupAvatarUrl = computed(() => {
  if (groupCardPopupAvatarLoadFailed.value) return '';
  
  const data = groupCardPopupData.value;
  if (!data) return '';
  
  let url = data.avatar_url || data.avatarUrl || '';
  if (!url) return '';
  
  if (url.startsWith('http')) return url;
  return `${SERVER_URL}${url}`;
});

const groupCardPopupIsInGroup = computed(() => {
  const store = chatStore;
  return store && store.groupsList && store.groupsList.some(g => String(g.id) === String(groupCardPopupData.value?.group_id));
});

function closeGroupCardPopup() {
  chatStore.closeModal('groupCardPopup');
  document.removeEventListener('click', closeGroupCardPopup);
  document.removeEventListener('contextmenu', closeGroupCardPopup);
  window.removeEventListener('scroll', closeGroupCardPopup);
}

function handleGroupCardPopupAvatarError() {
  groupCardPopupAvatarLoadFailed.value = true;
}

function openGroupCardPopupAvatarPreview() {
  if (groupCardPopupAvatarUrl.value) {
    chatStore.openModal('imagePreview', groupCardPopupAvatarUrl.value);
  }
}

function updateGroupCardPopupPosition(event) {
  const popup = document.getElementById('groupCardPopup');
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
  
  groupCardPopupLeft.value = left;
  groupCardPopupTop.value = top;
}

async function showGroupCardPopupVue(event, groupData) {
  event.stopPropagation();
  
  groupCardPopupEvent.value = event;
  groupCardPopupLeft.value = event.clientX;
  groupCardPopupTop.value = event.clientY;
  
  chatStore.openModal('groupCardPopup', groupData);
  
  await new Promise(resolve => requestAnimationFrame(resolve));
  await new Promise(resolve => requestAnimationFrame(resolve));
  
  updateGroupCardPopupPosition(event);
  
  await new Promise(resolve => requestAnimationFrame(resolve));
  
  const popup = document.getElementById('groupCardPopup');
  if (popup) {
    popup.classList.add('visible');
  }
  
  setTimeout(() => {
    document.addEventListener('click', closeGroupCardPopup);
    document.addEventListener('contextmenu', closeGroupCardPopup);
    window.addEventListener('scroll', closeGroupCardPopup);
  }, 0);
}

function handleGroupCardPopupSendMessage() {
  const data = groupCardPopupData.value;
  if (data && window.switchToGroupChat) {
    window.switchToGroupChat(data.group_id, data.group_name, data.avatar_url || data.avatarUrl || '');
    // 将群组移到列表顶端
    setTimeout(() => {
      if (chatStore.moveGroupToTop) {
        chatStore.moveGroupToTop(data.group_id);
      }
    }, 200);
  }
  closeGroupCardPopup();
}

function handleGroupCardPopupJoinGroup() {
  const data = groupCardPopupData.value;
  if (data && data.invite_token && window.joinGroupWithToken) {
    window.joinGroupWithToken(data.invite_token, data.group_id, data.group_name, null);
  }
  closeGroupCardPopup();
}

const groupInfoAvatarUrl = computed(() => {
  // 如果头像加载失败，返回空字符串
  if (groupInfoAvatarLoadFailed.value) return '';
  
  const group = chatStore.modalData.groupInfo;
  if (!group) return '';
  
  let url = '';
  if (group.avatar_url && typeof group.avatar_url === 'string') {
    url = group.avatar_url.trim();
  } else if (group.avatarUrl && typeof group.avatarUrl === 'string') {
    url = group.avatarUrl.trim();
  } else if (group.avatar && typeof group.avatar === 'string') {
    url = group.avatar.trim();
  }
  
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${SERVER_URL}${url}`;
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

function getGenderText(gender) {
  if (gender === 1) return '男';
  if (gender === 2) return '女';
  return '保密';
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
    
    const response = await fetch(`${chatStore.SERVER_URL}/api/user/search?keyword=${encodeURIComponent(searchKeyword.value.trim())}`, {
      headers: {
        'user-id': user?.id || '',
        'session-token': sessionToken || ''
      }
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
      const users = data.users || [];
      
      searchResults.value = users.filter(u => {
        const isCurrentUser = String(u.id) === String(user?.id);
        return !isCurrentUser;
      });
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
  // console.log('[发送群名片] 点击发送按钮');
  // console.log('[发送群名片] selectedGroupIdForSendCard:', selectedGroupIdForSendCard.value);
  
  if (selectedGroupIdForSendCard.value) {
    // console.log('[发送群名片] 开始发送群名片');
    if (typeof window.chatStore !== 'undefined' && window.chatStore) {
      window.chatStore.selectedGroupIdForCard = selectedGroupIdForSendCard.value;
      // console.log('[发送群名片] 已同步到 window.chatStore.selectedGroupIdForCard');
    }
    if (typeof window.sendGroupCard === 'function') {
      // console.log('[发送群名片] 调用 window.sendGroupCard()');
      window.sendGroupCard();
    } else {
      // console.warn('[发送群名片] window.sendGroupCard 函数不存在');
    }
  } else {
    // console.warn('[发送群名片] 未选择群组');
  }
}

watch(() => chatStore.showSendGroupCardModal, (newVal) => {
  if (newVal) {
    selectedGroupIdForSendCard.value = null;
    // 直接使用 store 中已经排好序的群组列表
    sendGroupCardList.value = [...(chatStore.groupsList || [])];
  }
});

watch(() => chatStore.showUserAvatarPopup, (newVal) => {
  if (newVal) {
    userAvatarPopupAvatarLoadFailed.value = false;
  }
});

watch(() => chatStore.showUserProfileModal, (newVal) => {
  if (newVal) {
    userProfileAvatarLoadFailed.value = false;
  }
});

watch(() => chatStore.showGroupInfoModal, (newVal) => {
  if (newVal) {
    groupInfoAvatarLoadFailed.value = false;
  }
});

function selectGroupForSendCard(groupId) {
  selectedGroupIdForSendCard.value = groupId;
  if (chatStore) {
    chatStore.selectedGroupIdForCard = groupId;
  }
}

async function loadGroupMembers(groupId) {
  if (!groupId) return;
  
  try {
    const response = await fetch(`${chatStore.SERVER_URL}/api/group-members/${groupId}`, {
      headers: {
        'user-id': chatStore.currentUser?.id || '',
        'session-token': chatStore.currentSessionToken || ''
      }
    });
    
    const data = await response.json();
    if (data.status === 'success' && data.members) {
      groupMembers.value = data.members.map(member => ({
        ...member,
        nickname: member.nickname || member.username || ''
      }));
    }
  } catch (error) {
    console.error('加载群组成员失败:', error);
  }
}

async function loadAvailableMembers() {
  loadingMembers.value = true;
  try {
    // 直接从服务器获取最新的好友列表
    const user = chatStore.currentUser;
    const sessionToken = chatStore.currentSessionToken;
    
    const friendsResponse = await fetch(`${chatStore.SERVER_URL}/api/user/friends`, {
      headers: {
        'user-id': user?.id || '',
        'session-token': sessionToken || ''
      }
    });
    
    const friendsData = await friendsResponse.json();
    if (friendsData.status === 'success' && friendsData.friends) {
      // 从好友列表中选择成员，而不是所有在线/离线用户
      availableMembers.value = friendsData.friends
        .filter(friend => String(friend.id) !== String(user?.id))
        .filter((friend, index, self) => 
          index === self.findIndex(f => String(f.id) === String(friend.id))
        )
        .map(friend => ({
          ...friend,
          nickname: friend.nickname || friend.username || ''
        }));
    } else {
      availableMembers.value = [];
    }
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

    const response = await fetch(`${chatStore.SERVER_URL}/api/create-group`, {
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

watch(() => chatStore.showGroupCardPopup, (newVal) => {
  if (newVal) {
    groupCardPopupAvatarLoadFailed.value = false;
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
    const response = await fetch(`${chatStore.SERVER_URL}/api/update-group-name`, {
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
    const response = await fetch(`${chatStore.SERVER_URL}/api/update-group-description`, {
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
  const confirmed = await modal.confirm(`确定要踢出成员 ${member.nickname || member.username} 吗？`, '踢出成员');
  if (!confirmed) {
    return;
  }
  
  try {
    const groupId = chatStore.modalData.groupInfo.id;
    const response = await fetch(`${chatStore.SERVER_URL}/api/remove-group-member`, {
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

async function handleDissolveGroup() {
  const groupId = chatStore.modalData.groupInfo?.id;
  if (!groupId) {
    toast.error('群组信息不存在');
    return;
  }
  
  const confirmed = await modal.confirm('确定要解散这个群组吗？此操作不可撤销！', '解散群组', 'error');
  if (!confirmed) {
    return;
  }
  
  try {
    const response = await fetch(`${chatStore.SERVER_URL}/api/dissolve-group`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': chatStore.currentUser?.id || '',
        'session-token': chatStore.currentSessionToken || ''
      },
      body: JSON.stringify({ groupId })
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      toast.success('群组已解散');
      chatStore.closeModal('groupInfo');
      chatStore.setCurrentGroupId(null);
      if (window.loadGroupList) {
        window.loadGroupList();
      }
    } else {
      toast.error(data.message || '解散群组失败');
    }
  } catch (error) {
    console.error('解散群组失败:', error);
    toast.error('解散群组失败');
  }
}

async function handleLeaveGroup() {
  const groupId = chatStore.modalData.groupInfo?.id;
  if (!groupId) {
    toast.error('群组信息不存在');
    return;
  }
  
  const confirmed = await modal.confirm('确定要退出这个群组吗？', '退出群组');
  if (!confirmed) {
    return;
  }
  
  try {
    const response = await fetch(`${chatStore.SERVER_URL}/api/leave-group`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': chatStore.currentUser?.id || '',
        'session-token': chatStore.currentSessionToken || ''
      },
      body: JSON.stringify({ groupId })
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      toast.success('已退出群组');
      chatStore.closeModal('groupInfo');
      chatStore.setCurrentGroupId(null);
      if (window.loadGroupList) {
        window.loadGroupList();
      }
    } else {
      toast.error(data.message || '退出群组失败');
    }
  } catch (error) {
    console.error('退出群组失败:', error);
    toast.error('退出群组失败');
  }
}

async function handleDeleteFriend() {
  const friendId = chatStore.modalData.userProfile?.id;
  if (!friendId) {
    toast.error('用户信息不存在');
    return;
  }
  
  const confirmed = await modal.confirm('确定要删除这个好友吗？', '删除好友');
  if (!confirmed) {
    return;
  }
  
  try {
    const response = await fetch(`${chatStore.SERVER_URL}/api/user/remove-friend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': chatStore.currentUser?.id || '',
        'session-token': chatStore.currentSessionToken || ''
      },
      body: JSON.stringify({ friendId })
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      toast.success('删除好友成功');
      chatStore.closeModal('userProfile');
      if (window.loadFriendsList) {
        window.loadFriendsList();
      }
      chatStore.setCurrentPrivateChatUserId(null);
      chatStore.currentPrivateChatUserId = null;
    } else {
      toast.error(data.message || '删除好友失败');
    }
  } catch (error) {
    console.error('删除好友失败:', error);
    toast.error('删除好友失败');
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
    
    const friendsResponse = await fetch(`${chatStore.SERVER_URL}/api/user/friends`, {
      headers: {
        'user-id': user?.id || '',
        'session-token': sessionToken || ''
      }
    });
    
    const friendsData = await friendsResponse.json();
    if (friendsData.status === 'success' && friendsData.friends) {
      const membersResponse = await fetch(`${chatStore.SERVER_URL}/api/group-members/${groupId}`, {
        headers: {
          'user-id': user?.id || '',
          'session-token': sessionToken || ''
        }
      });
      
      const membersData = await membersResponse.json();
      const groupMemberIds = new Set((membersData.members || []).map(m => String(m.id)));
      
      availableFriendsForAdd.value = friendsData.friends
        .filter(friend => {
          const friendId = String(friend.id);
          const isNotCurrentUser = friendId !== String(user?.id);
          const isNotInGroup = !groupMemberIds.has(friendId);
          return isNotCurrentUser && isNotInGroup;
        })
        .map(friend => ({
          ...friend,
          nickname: friend.nickname || friend.username || ''
        }));
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
    const response = await fetch(`${chatStore.SERVER_URL}/api/add-group-members`, {
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
    const response = await fetch(`${chatStore.SERVER_URL}/api/upload-group-avatar/${groupId}`, {
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
      const infoResponse = await fetch(`${chatStore.SERVER_URL}/api/group-info/${groupId}`, {
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

function unescapeHtml(html) {
  const text = document.createElement('textarea');
  text.innerHTML = html;
  return text.value;
}

async function fetchUserInfo(userId) {
  try {
    const response = await fetch(`${SERVER_URL}/api/user/${userId}`, {
      headers: {
        'user-id': chatStore.currentUser?.id || '',
        'session-token': chatStore.currentSessionToken || ''
      }
    });
    const data = await response.json();
    if (data.status === 'success' && data.user) {
      return {
        id: data.user.id,
        username: data.user.username,
        nickname: data.user.nickname || '',
        signature: data.user.signature || '',
        gender: data.user.gender,
        avatarUrl: data.user.avatar_url || data.user.avatarUrl || data.user.avatar
      };
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

function hideUserAvatarPopupVue() {
  const popup = document.getElementById('userAvatarPopup');
  if (popup) {
    popup.classList.remove('visible');
  }
  chatStore.closeModal('userAvatarPopup');
  document.removeEventListener('click', hideUserAvatarPopupVue);
  document.removeEventListener('contextmenu', hideUserAvatarPopupVue);
  window.removeEventListener('scroll', hideUserAvatarPopupVue);
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
    
    setTimeout(() => {
      document.addEventListener('click', hideUserAvatarPopupVue);
      document.addEventListener('contextmenu', hideUserAvatarPopupVue);
      window.addEventListener('scroll', hideUserAvatarPopupVue);
    }, 0);
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

function openUserAvatarPopupAvatarPreview() {
  if (userAvatarPopupAvatarUrl.value) {
    chatStore.openModal('imagePreview', userAvatarPopupAvatarUrl.value);
  }
}

function handleUserAvatarPopupAddFriend() {
  if (userAvatarPopupAddFriendButtonDisabled.value || !userAvatarPopupUserId.value) return;
  
  if (userAvatarPopupIsFriend.value) {
    const user = chatStore.modalData.userAvatarPopup;
    if (user) {
      hideUserAvatarPopupVue();
      if (window.switchToPrivateChat) {
        window.switchToPrivateChat(
          userAvatarPopupUserId.value,
          user.nickname || user.username,
          user.username,
          user.avatarUrl || user.avatar_url || user.avatar
        );
      }
      // 将好友移到列表顶端（延迟执行，避免被页面加载逻辑覆盖）
      setTimeout(() => {
        if (chatStore && chatStore.moveFriendToTop) {
          chatStore.moveFriendToTop(userAvatarPopupUserId.value);
        }
      }, 200);
    }
    return;
  }
  
  addFriend(userAvatarPopupUserId.value);
  hideUserAvatarPopupVue();
}

onMounted(() => {
  window.showUserAvatarPopupVue = showUserAvatarPopupVue;
  window.hideUserAvatarPopupVue = hideUserAvatarPopupVue;
  window.showGroupCardPopupVue = showGroupCardPopupVue;
});
</script>
