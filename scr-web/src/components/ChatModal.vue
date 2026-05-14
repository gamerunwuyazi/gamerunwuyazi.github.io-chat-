<template>
  <!-- 群组信息模态框 -->
  <Teleport to="body" v-if="modalStore.showGroupInfoModal">
    <div id="groupInfoModal" class="modal" :style="modalStyle" @click="modalStore.closeModal('groupInfo')">
      <div class="modal-content" style="max-height: 85vh; max-width: 450px; width: 90%; display: flex; flex-direction: column; background: #f5f5f5;" @click.stop>
        <div class="modal-header" style="flex-shrink: 0; background: #f5f5f5; border-bottom: none; padding: 12px 16px;">
          <h2 id="modalGroupName" style="font-size: 20px; font-weight: 700; margin: 0;">{{ groupInfoName }} - 群组信息</h2>
          <span class="close" id="closeGroupInfoModal" @click="modalStore.closeModal('groupInfo')" style="font-size: 28px; opacity: 0.6;">&times;</span>
        </div>
        
        <div class="modal-body" style="flex: 1; overflow-y: auto; padding: 16px;">
          <div v-if="modalStore.modalData.groupInfo">
            <template v-if="!isGroupDeleted">
              <!-- 群头像和上传按钮 -->
              <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
                <div style="width: 100px; height: 100px; border-radius: 50%; background: #3498db; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;">
                  <img v-if="groupInfoAvatarUrl" :src="groupInfoAvatarUrl" :alt="groupInfoName" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" @click="openGroupInfoAvatarPreview" @error="handleGroupInfoAvatarError">
                  <span v-else style="font-size: 40px; color: white; font-weight: bold;">{{ groupInfoInitials }}</span>
                </div>
                <div v-if="isCurrentUserGroupOwner || isCurrentUserGroupAdmin">
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
                  <button v-if="isCurrentUserGroupOwner || isCurrentUserGroupAdmin" @click="startEditGroupName" style="background: #3498db; padding: 5px 10px; border-radius: 6px; color: white; border: none; cursor: pointer; font-size: 13px; font-weight: 600;">
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
                <span style="font-size: 16px;">{{ modalStore.modalData.groupInfo.id }}</span>
              </div>

              <!-- 群组公告 -->
              <div style="display: flex; gap: 10px; margin-bottom: 16px; align-items: flex-start;">
                <label style="font-size: 16px; font-weight: 700; color: #555; min-width: 80px; margin-top: 2px;">群组公告:</label>
                <template v-if="!editingGroupNotice">
                  <span style="flex: 1; font-size: 14px; word-break: break-word;">{{ groupInfoDescription }}</span>
                  <button v-if="isCurrentUserGroupOwner || isCurrentUserGroupAdmin" @click="startEditGroupNotice" style="background: #3498db; padding: 5px 10px; border-radius: 6px; color: white; border: none; cursor: pointer; font-size: 13px; font-weight: 600; flex-shrink: 0;">
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
                <span style="font-size: 16px;">群主ID: {{ modalStore.modalData.groupInfo.creator_id || '未知' }}</span>
              </div>

              <!-- 群组成员标题 -->
              <h3 style="font-size: 18px; font-weight: 800; margin-bottom: 12px;">群组成员</h3>

              <!-- 群组成员列表 -->
              <div v-if="groupMembers.length > 0" style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 12px; padding: 12px; margin-bottom: 24px;">
                <div v-for="member in membersWithMuteStatus" :key="member.id" 
                   style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: white; border-radius: 10px; margin-bottom: 6px; cursor: context-menu;"
                   @contextmenu.prevent="showMemberContextMenu($event, member)">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <!-- 成员头像 -->
                  <div style="display: flex; align-items: center; position: relative;">
                    <div style="width: 36px; height: 36px; border-radius: 50%; background: #3498db; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                      <img v-if="getMemberAvatarUrl(member)" :src="getMemberAvatarUrl(member)" :alt="member.nickname" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                      <span v-else style="font-size: 14px; color: white; font-weight: bold;">{{ getMemberInitials(member) }}</span>
                    </div>
                    <!-- 在线状态指示器 -->
                    <div v-if="isMemberOnline(member.id)" style="position: absolute; bottom: -2px; right: -6px; width: 10px; height: 10px; background: #2ed573; border: 2px solid white; border-radius: 50%;"></div>
                  </div>
                    <!-- 成员昵称和角色 -->
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span style="font-size: 14px; font-weight: 500;">{{ member.nickname || member.username }}</span>
                      <span v-if="String(member.id) === String(modalStore.modalData.groupInfo.creator_id)" style="background: #ff4757; color: white; font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 600;">群主</span>
                      <span v-else-if="member.is_admin" style="background: #ffa502; color: white; font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 600;">管理</span>
                      <span v-if="String(member.id) === String(baseStore.currentUser?.id)" style="color: #3498db; font-size: 12px; font-weight: 700;">（我）</span>
                    </div>
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <!-- 只显示禁言状态，其他操作移至右键菜单 -->
                    <span v-if="member.muteStatusText" 
                          :style="{ 
                            background: member.isPermanentMute ? '#ff4757' : '#ffa502', 
                            color: 'white', 
                            fontSize: '11px', 
                            padding: '2px 8px', 
                            borderRadius: '4px', 
                            fontWeight: '600',
                            whiteSpace: 'nowrap'
                          }"
                          :title="getMuteStatusTooltip(member)">
                      {{ member.muteStatusText }}
                    </span>
                    <!-- 右键提示 -->
                    <span style="color: #999; font-size: 11px; cursor: help;" title="右键点击查看更多操作">⋮</span>
                  </div>
                </div>
                
                <!-- 右键菜单遮罩层 -->
                <div v-if="contextMenu.visible" 
                     @click="hideContextMenu"
                     :style="{ 
                       position: 'fixed', 
                       left: '0', 
                       top: '0', 
                       width: '100vw', 
                       height: '100vh', 
                       zIndex: 9999,
                       background: 'transparent'
                     }">
                </div>
                
                <!-- 右键菜单 -->
                <div v-if="contextMenu.visible" 
                     class="context-menu-active"
                     :style="{ 
                       position: 'fixed', 
                       left: contextMenu.x + 'px', 
                       top: contextMenu.y + 'px', 
                       zIndex: 10000,
                       background: 'white',
                       borderRadius: '8px',
                       boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                       padding: '6px 0',
                       minWidth: '160px'
                     }"
                     @click.stop>
                  <div style="padding: 8px 16px; color: #666; font-size: 12px; font-weight: 600; border-bottom: 1px solid #f0f0f0;">
                    {{ contextMenu.member?.nickname || contextMenu.member?.username }} (ID: {{ contextMenu.member?.id }})
                  </div>
                  
                  <!-- 踢出成员 -->
                  <div v-if="(isCurrentUserGroupOwner && String(contextMenu.member?.id) !== String(baseStore.currentUser?.id)) || 
                           (isCurrentUserGroupAdmin && !contextMenu.member?.is_admin && String(contextMenu.member?.id) !== String(modalStore.modalData.groupInfo.creator_id) && String(contextMenu.member?.id) !== String(baseStore.currentUser?.id))"
                       @click="handleContextAction('remove')"
                       style="padding: 10px 16px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 8px;"
                       @mouseenter="$event.currentTarget.style.background='#f5f5f5'"
                       @mouseleave="$event.currentTarget.style.background='white'">
                    <span>🚫</span><span>踢出成员</span>
                  </div>
                  
                  <!-- 设置/取消管理员（仅群主） -->
                  <div v-if="isCurrentUserGroupOwner && String(contextMenu.member?.id) !== String(baseStore.currentUser?.id) && String(contextMenu.member?.id) !== String(modalStore.modalData.groupInfo.creator_id)"
                       @click="handleContextAction('admin')"
                       style="padding: 10px 16px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 8px;"
                       @mouseenter="$event.currentTarget.style.background='#f5f5f5'"
                       @mouseleave="$event.currentTarget.style.background='white'">
                    <span>{{ contextMenu.member?.is_admin ? '⬇️' : '⬆️' }}</span>
                    <span>{{ contextMenu.member?.is_admin ? '取消管理员' : '设为管理员' }}</span>
                  </div>
                  
                  <!-- 禁言/解禁 -->
                  <div v-if="(isCurrentUserGroupOwner || isCurrentUserGroupAdmin) && 
                                String(contextMenu.member?.id) !== String(baseStore.currentUser?.id) && 
                                String(contextMenu.member?.id) !== String(modalStore.modalData.groupInfo.creator_id) &&
                                (!contextMenu.member?.is_admin || isCurrentUserGroupOwner)"
                       @click="handleContextAction('mute')"
                       style="padding: 10px 16px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 8px;"
                       @mouseenter="$event.currentTarget.style.background='#f5f5f5'"
                       @mouseleave="$event.currentTarget.style.background='white'">
                    <span>{{ contextMenu.member?.is_muted ? '🔓' : '🔒' }}</span>
                    <span>{{ contextMenu.member?.is_muted ? '解除禁言' : '禁言成员' }}</span>
                  </div>
                  
                  <!-- 分隔线（如果有操作按钮） -->
                  <div v-if="canShowContextMenuActions" style="height: 1px; background: #f0f0f0; margin: 6px 0;"></div>
                  
                  <!-- 查看详细信息 -->
                  <div @click="handleContextAction('info')"
                       style="padding: 10px 16px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 8px; color: #3498db;"
                       @mouseenter="$event.currentTarget.style.background='#f5f5f5'"
                       @mouseleave="$event.currentTarget.style.background='white'">
                    <span>ℹ️</span><span>查看详情</span>
                  </div>
                </div>
              </div>
              <div v-else style="text-align: center; color: #999; padding: 16px;">加载成员列表中...</div>

              <!-- 群主/管理管理区域 -->
              <div v-if="isCurrentUserGroupOwner || isCurrentUserGroupAdmin" style="border-top: 1px solid #e0e0e0; padding-top: 20px;">
                <h3 style="font-size: 18px; font-weight: 800; margin-bottom: 12px;">群组管理</h3>
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                  <!-- 群主和管理员都可以添加成员 -->
                  <button v-if="isCurrentUserGroupOwner || isCurrentUserGroupAdmin" @click="handleAddGroupMembers" style="background: #2ed573; padding: 8px 16px; border-radius: 6px; color: white; border: none; cursor: pointer; font-size: 13px; font-weight: 600;">
                    添加成员
                  </button>
                  <button @click="loadGroupMembers(modalStore.modalData.groupInfo.id); loadGroupMuteStatus(modalStore.modalData.groupInfo.id)" style="background: #2ed573; padding: 8px 16px; border-radius: 6px; color: white; border: none; cursor: pointer; font-size: 13px; font-weight: 600;">
                    刷新成员列表
                  </button>
                  <!-- 全员禁言开关 -->
                  <button 
                    @click="handleToggleMuteAll" 
                    :style="{ 
                      background: isMuteAllEnabled ? '#ff4757' : '#ffa502', 
                      padding: '8px 16px', 
                      borderRadius: '6px', 
                      color: 'white', 
                      border: 'none', 
                      cursor: 'pointer', 
                      fontSize: '13px', 
                      fontWeight: '600'
                    }">
                    {{ isMuteAllEnabled ? '关闭全员禁言' : '开启全员禁言' }}
                  </button>
                  <!-- 全员禁言状态提示 -->
                  <span v-if="isMuteAllEnabled" style="background: #ff4757; color: white; font-size: 11px; padding: 8px 12px; border-radius: 6px; font-weight: 600; display: flex; align-items: center;">
                    🔒 当前已开启全员禁言，只有管理员可以发言
                  </span>
                </div>
              </div>
            </template>
            <template v-else>
              <div style="text-align: center; padding: 40px 20px;">
                <div style="font-size: 48px; margin-bottom: 16px;">🗑️</div>
                <div style="font-size: 18px; font-weight: 600; color: #555; margin-bottom: 8px;">该群组已被删除</div>
                <div style="font-size: 14px; color: #999;">您可以删除该群组的本地记录</div>
              </div>
            </template>
          </div>
          <div v-else style="text-align: center; color: #999; padding: 30px;">
            加载群组信息中...
          </div>
        </div>
        <div class="modal-footer" style="flex-shrink: 0; background: #f5f5f5; border-top: none; padding: 12px 16px; justify-content: space-between;">
          <template v-if="!isGroupDeleted">
            <button v-if="isCurrentUserGroupOwner" @click="handleDissolveGroup" style="background: #ff4757; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">解散群组</button>
            <button v-else @click="handleLeaveGroup" style="background: #ff4757; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">退出群组</button>
          </template>
          <template v-else>
            <button @click="handleDeleteGroupLocalRecord" style="background: #ff4757; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">删除会话</button>
          </template>
          <button id="modalCloseButton" class="cancel-btn" @click="modalStore.closeModal('groupInfo')" style="background: #95a5a6; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 创建群组模态框 -->
  <Teleport to="body" v-if="modalStore.showCreateGroupModal">
    <div id="createGroupModal" class="modal" :style="modalStyle" @click="modalStore.closeModal('createGroup')">
      <div class="modal-content" style="max-height: 100vh; max-width: 450px; width: 90%; display: flex; flex-direction: column;" @click.stop>
        <div class="modal-header" style="flex-shrink: 0; padding: 12px 16px;">
          <h2 style="font-size: 18px; font-weight: 700; margin: 0;">创建群组</h2>
          <span class="close" id="closeCreateGroupModal" @click="modalStore.closeModal('createGroup')" style="font-size: 24px;">&times;</span>
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
                <div style="display: flex; align-items: center; position: relative; margin-left: 8px;">
                  <div style="width: 32px; height: 32px; border-radius: 50%; background: #3498db; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden;">
                    <img v-if="getMemberAvatarUrl(user)" :src="getMemberAvatarUrl(user)" :alt="user.nickname || user.username" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
                    <span v-else style="font-size: 14px; color: white; font-weight: bold;">{{ (user.nickname || user.username || 'U').charAt(0).toUpperCase() }}</span>
                  </div>
                  <!-- 在线状态指示器 -->
                  <div v-if="isMemberOnline(user.id)" style="position: absolute; bottom: -2px; right: -6px; width: 10px; height: 10px; background: #2ed573; border: 2px solid white; border-radius: 50%;"></div>
                </div>
                <label :for="'member-' + user.id" style="flex: 1; margin-left: 8px; margin-bottom: 0px; cursor: pointer; font-weight: 500; text-align: left; font-size: 14px; display: flex; align-items: center; line-height: 1.4;">
                  <span style="display: inline-block;">{{ user.nickname || user.username }}</span>
                  <span style="color: #666; font-size: 12px; margin-left: 6px;">ID: {{ user.id }}</span>
                </label>
              </div>
            </div>
          </div>
          <div id="createGroupMessage" v-if="createGroupMessage" :style="{ color: createGroupMessageType === 'success' ? '#2ed573' : '#ff4757', fontSize: '14px', marginTop: '10px' }">{{ createGroupMessage }}</div>
        </div>
        <div class="modal-footer" style="flex-shrink: 0; gap: 10px; padding: 12px 16px;">
          <button id="cancelCreateGroup" class="cancel-btn" @click="modalStore.closeModal('createGroup')" style="background: #ff4757; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">取消</button>
          <button id="submitCreateGroup" class="save-btn" @click="handleCreateGroup" style="background: #2ed573; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">创建群组</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 发送群名片模态框（单选） -->
  <Teleport to="body" v-if="modalStore.showSendGroupCardModal">
    <div id="sendGroupCardModal" class="modal" :style="modalStyle" @click="modalStore.closeModal('sendGroupCard')">
      <div class="modal-content" style="width: 400px;" @click.stop>
        <div class="modal-header">
          <h2>选择群名片</h2>
          <span class="close" id="closeSendGroupCardModal" @click="modalStore.closeModal('sendGroupCard')">&times;</span>
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
          <button id="cancelSendGroupCard" class="cancel-btn" @click="modalStore.closeModal('sendGroupCard')">取消</button>
          <button id="confirmSendGroupCard" class="save-btn" :disabled="!selectedGroupIdForSendCard" @click="handleSendGroupCard">发送</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 用户资料模态框 -->
  <Teleport to="body" v-if="modalStore.showUserProfileModal">
    <div id="userProfileModal" class="modal" :style="modalStyle" @click="modalStore.closeModal('userProfile')">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>用户资料</h2>
          <span class="close" id="closeUserProfileModal" @click="modalStore.closeModal('userProfile')">&times;</span>
        </div>
        <div class="modal-body">
          <div v-if="modalStore.modalData.userProfile" class="user-profile-container">
            <template v-if="!isFriendDeleted">
              <div class="user-profile-avatar" style="width: 80px; height: 80px; border-radius: 50%; background: #3498db; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;">
                <img v-if="userProfileAvatarUrl" :src="userProfileAvatarUrl" alt="用户头像" class="user-avatar-img" loading="lazy" width="80" height="80" style="aspect-ratio: 1/1; object-fit: cover; border-radius: 50%;" @click="openUserProfileAvatarPreview" @error="handleUserProfileAvatarError">
                <span v-else class="user-initials" style="font-size: 32px; color: white; font-weight: bold;">{{ getUserInitials(modalStore.modalData.userProfile.nickname) }}</span>
              </div>
              <div class="user-profile-info">
                <div class="user-profile-item">
                  <label>昵称:</label>
                  <span>{{ modalStore.modalData.userProfile.nickname }}</span>
                </div>
                <div class="user-profile-item">
                  <label>用户名:</label>
                  <span>{{ modalStore.modalData.userProfile.username }}</span>
                </div>
                <div class="user-profile-item">
                  <label>用户 ID:</label>
                  <span>{{ modalStore.modalData.userProfile.id }}</span>
                </div>
                <div class="user-profile-item">
                  <label>性别:</label>
                  <span>{{ getGenderText(modalStore.modalData.userProfile.gender) }}</span>
                </div>
                <div class="user-profile-item">
                  <label>状态:</label>
                  <span class="user-status">
                    {{ isUserOnline(modalStore.modalData.userProfile.id) ? '在线' : '离线' }}
                  </span>
                </div>
              </div>
              <div v-if="userProfileIsFriend" style="display: flex; align-items: center; gap: 10px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                  <label>拉黑用户</label>
                  <label class="switch">
                    <input 
                      type="checkbox" 
                      v-model="userProfileIsBlocked" 
                      @change="handleUserProfileToggleBlockUser"
                      :disabled="userProfileBlockingLoading"
                    >
                    <span class="slider round"></span>
                  </label>
                </label>
              </div>
            </template>
            <template v-else>
              <div style="text-align: center; padding: 40px 20px;">
                <div style="font-size: 48px; margin-bottom: 16px;">🗑️</div>
                <div style="font-size: 18px; font-weight: 600; color: #555; margin-bottom: 8px;">该好友已被删除</div>
                <div style="font-size: 14px; color: #999;">您可以删除该好友的本地记录</div>
              </div>
            </template>
          </div>
          <div v-else>
            <span>加载用户资料中...</span>
          </div>
        </div>
        <div class="modal-footer" style="justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <template v-if="!isFriendDeleted">
            <button id="deleteFriendButton" @click="handleDeleteFriend" style="background: #ff4757; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">删除好友</button>
          </template>
          <template v-else>
            <button id="deleteFriendLocalRecordButton" @click="handleDeleteFriendLocalRecord" style="background: #ff4757; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">删除会话</button>
          </template>
          <button id="closeUserProfileButton" class="cancel-btn" @click="modalStore.closeModal('userProfile')" style="background: #95a5a6; color: white; border: none; padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 用户搜索模态框 -->
  <Teleport to="body" v-if="modalStore.showUserSearchModal">
    <div id="userSearchModal" class="modal" :style="modalStyle" @click="modalStore.closeModal('userSearch')">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>搜索用户</h2>
          <span class="close" id="closeUserSearchModal" @click="modalStore.closeModal('userSearch')">&times;</span>
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
              <button v-if="isSearchResultUserFriend(user.id)" class="message-friend-btn" @click="handleMessageFriendFromSearch(user)" style="width: 32px; height: 32px; border-radius: 50%; background: #27ae60; color: white; border: none; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" title="发消息">💬</button>
              <button v-else class="add-friend-btn" @click="handleAddFriend(user)" style="width: 32px; height: 32px; border-radius: 50%; background: #3498db; color: white; border: none; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" title="添加好友">+</button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="cancelUserSearch" class="cancel-btn" @click="modalStore.closeModal('userSearch')">取消</button>
          <button id="confirmUserSearch" class="save-btn" @click="handleUserSearch">搜索</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 图片预览模态框 -->
  <Teleport to="body" v-if="modalStore.showImagePreviewModal">
    <div id="imagePreviewModal" class="modal" :style="imagePreviewModalStyle" @click="modalStore.closeModal('imagePreview')">
      <div style="position: relative; max-width: 90%; max-height: 90%;" @click.stop>
        <img id="previewImgElement" :src="modalStore.modalData.imagePreviewUrl" alt="图片预览" style="width: 100%; height: auto; max-width: 90vw; max-height: 90vh; aspect-ratio: 16/9; object-fit: contain;" loading="lazy">
        <span class="close" id="closeImagePreviewModal" style="position: absolute; top: -30px; right: -30px; color: #f1f1f1; font-size: 40px; font-weight: bold; cursor: pointer;" @click="modalStore.closeModal('imagePreview')">&times;</span>
      </div>
    </div>
  </Teleport>

  <!-- 头像预览模态框 -->
  <Teleport to="body" v-if="modalStore.showAvatarPreviewModal">
    <div id="avatarPreviewModal" class="modal" :style="avatarPreviewModalStyle" @click="modalStore.closeModal('avatarPreview')">
      <div style="position: relative; max-width: 300px; max-height: 300px;" @click.stop>
        <img id="previewAvatarElement" :src="modalStore.modalData.avatarPreviewUrl" alt="头像预览" style="width: 300px; height: 300px; border-radius: 50%; object-fit: cover;">
        <span class="close" id="closeAvatarPreviewModal" style="position: absolute; top: -30px; right: -30px; color: #f1f1f1; font-size: 40px; font-weight: bold; cursor: pointer;" @click="modalStore.closeModal('avatarPreview')">&times;</span>
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
              <div style="display: flex; align-items: center; position: relative; margin-left: 12px;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: #3498db; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden;">
                  <img v-if="getMemberAvatarUrl(friend)" :src="getMemberAvatarUrl(friend)" :alt="friend.nickname || friend.username" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
                  <span v-else style="font-size: 16px; color: white; font-weight: bold;">{{ (friend.nickname || friend.username || 'U').charAt(0).toUpperCase() }}</span>
                </div>
                <!-- 在线状态指示器 -->
                <div v-if="isMemberOnline(friend.id)" style="position: absolute; bottom: -2px; right: -6px; width: 10px; height: 10px; background: #2ed573; border: 2px solid white; border-radius: 50%;"></div>
              </div>
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
  <Teleport to="body" v-if="modalStore.showUserAvatarPopup">
    <div 
      style="position: fixed; left: 0; top: 0; width: 100%; height: 100%; z-index: 9999; pointer-events: none;"
      @click="modalStore.closeModal('userAvatarPopup')"
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
                  :key="userAvatarPopupUserId"
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
              <div v-if="isUserOnline(modalStore.modalData.userAvatarPopup?.id)" class="online-indicator"></div>
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
  <Teleport to="body" v-if="modalStore.showGroupCardPopup">
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
.switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 20px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: .4s;
  border-radius: 20px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  transition: .4s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: #e74c3c;
}

input:checked + .slider:before {
  transform: translateX(20px);
}

input:disabled + .slider {
  opacity: 0.5;
  cursor: not-allowed;
}

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
import { ref, computed, watch, onMounted, onUnmounted } from "vue";

import { useBaseStore } from "@/stores/baseStore";
import { useUserStore } from "@/stores/userStore";
import { useFriendStore } from "@/stores/friendStore";
import { useGroupStore } from "@/stores/groupStore";
import { usePublicStore } from "@/stores/publicStore";
import { useModalStore } from "@/stores/modalStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useStorageStore } from "@/stores/storageStore";
import { useUnreadStore } from "@/stores/unreadStore";
import { useDraftStore } from "@/stores/draftStore";
import { useInputStore } from "@/stores/inputStore";
import { registerPopupFunctions } from "@/stores/index.js";
import { 
  addFriend, 
  switchToGroupChat, 
  switchToPrivateChat, 
  loadGroupList, 
  loadFriendsList,
  joinGroupWithToken,
  sendGroupCard
} from "@/utils/chat";
import modal from "@/utils/modal";
import toast from "@/utils/toast";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://back.hs.airoe.cn';

const baseStore = useBaseStore();
const userStore = useUserStore();
const friendStore = useFriendStore();
const groupStore = useGroupStore();
const publicStore = usePublicStore();
const modalStore = useModalStore();
const sessionStore = useSessionStore();
const storageStore = useStorageStore();
const unreadStore = useUnreadStore();
const draftStore = useDraftStore();
const inputStore = useInputStore();

const searchKeyword = ref('');
const searching = ref(false);
const hasSearched = ref(false);
const searchResults = ref([]);
const selectedGroupIdForSendCard = ref(null);
const sendGroupCardList = ref([]);
const loadingSendGroupCardList = ref(false);
const groupMembers = ref([]);
const loadingMembers = ref(false);
const currentTime = ref(Date.now()); // 用于触发 computed 重新计算的时间戳
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

const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  member: null
});

const userAvatarPopupLeft = ref(0);
const userAvatarPopupTop = ref(0);
const userAvatarPopupUserId = ref(null);
const userAvatarPopupEvent = ref(null);
const userAvatarPopupAvatarLoadFailed = ref(false);
const userProfileAvatarLoadFailed = ref(false);
const userProfileIsBlocked = ref(false);
const userProfileBlockingLoading = ref(false);
const groupInfoAvatarLoadFailed = ref(false);

let muteTimer = null;

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
  const nickname = modalStore.modalData.userAvatarPopup?.nickname || '未知昵称';
  return nickname;
});

const userAvatarPopupUsername = computed(() => {
  return modalStore.modalData.userAvatarPopup?.username || '';
});

const userAvatarPopupSignature = computed(() => {
  const signature = modalStore.modalData.userAvatarPopup?.signature || '';
  return signature;
});

const userAvatarPopupGender = computed(() => {
  return modalStore.modalData.userAvatarPopup?.gender || 0;
});

const userAvatarPopupInitials = computed(() => {
  const nickname = userAvatarPopupNickname.value;
  return nickname ? nickname.charAt(0).toUpperCase() : 'U';
});

const userAvatarPopupAvatarUrl = computed(() => {
  if (userAvatarPopupAvatarLoadFailed.value) return '';
  
  const user = modalStore.modalData.userAvatarPopup;
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
  if (userProfileAvatarLoadFailed.value) return '';
  
  const user = modalStore.modalData.userProfile;
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
  return friendStore.friendsList.some(friend => String(friend.id) === String(userId));
});

const userAvatarPopupIsCurrentUser = computed(() => {
  const userId = userAvatarPopupUserId.value;
  if (!userId || !baseStore.currentUser) return false;
  return String(baseStore.currentUser.id) === String(userId);
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
  if (!modalStore.modalData.groupInfo || !baseStore.currentUser) {
    return false;
  }
  return String(modalStore.modalData.groupInfo.creator_id) === String(baseStore.currentUser.id);
});

// 检查当前用户是否是群管理员（包括群主）
const isCurrentUserGroupAdmin = computed(() => {
  if (isCurrentUserGroupOwner.value) return true;
  
  const currentUserId = baseStore.currentUser?.id;
  const groupId = modalStore.modalData.groupInfo?.id;
  
  if (!currentUserId || !groupId || !groupMembers.value.length) {
    return false;
  }
  
  // 在成员列表中查找当前用户是否是管理员
  const currentUserMember = groupMembers.value.find(m => String(m.id) === String(currentUserId));
  return currentUserMember && currentUserMember.is_admin === 1;
});

const isGroupDeleted = computed(() => {
  return modalStore.modalData.groupInfo?.deleted_at != null;
});

const isFriendDeleted = computed(() => {
  return modalStore.modalData.userProfile?.deleted_at != null;
});

const userProfileIsFriend = computed(() => {
  const userId = modalStore.modalData.userProfile?.id;
  if (!userId || !baseStore.currentUser) return false;
  if (String(baseStore.currentUser.id) === String(userId)) return false;
  return friendStore.friendsList.some(friend => String(friend.id) === String(userId));
});

const groupInfoName = computed(() => {
  const name = modalStore.modalData.groupInfo?.name || '';
  return name;
});

const groupInfoDescription = computed(() => {
  const desc = modalStore.modalData.groupInfo?.description || '暂无公告';
  return desc;
});

const groupInfoInitials = computed(() => {
  const name = groupInfoName.value;
  return name ? name.charAt(0).toUpperCase() : 'G';
});

const groupCardPopupData = computed(() => {
  return modalStore.modalData.groupCardPopup;
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
  return groupStore.groupsList && groupStore.groupsList.some(g => String(g.id) === String(groupCardPopupData.value?.group_id));
});

function closeGroupCardPopup() {
  modalStore.closeModal('groupCardPopup');
  document.removeEventListener('click', closeGroupCardPopup);
  document.removeEventListener('contextmenu', closeGroupCardPopup);
  window.removeEventListener('scroll', closeGroupCardPopup);
}

function handleGroupCardPopupAvatarError() {
  groupCardPopupAvatarLoadFailed.value = true;
}

function openGroupCardPopupAvatarPreview() {
  if (groupCardPopupAvatarUrl.value) {
    modalStore.openModal('imagePreview', groupCardPopupAvatarUrl.value);
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
  
  modalStore.openModal('groupCardPopup', groupData);
  
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
  if (data) {
    switchToGroupChat(data.group_id, data.group_name, data.avatar_url || data.avatarUrl || '');
    setTimeout(() => {
      groupStore.updateGroupSessionTime(data.group_id);
    }, 200);
  }
  closeGroupCardPopup();
}

function handleGroupCardPopupJoinGroup() {
  const data = groupCardPopupData.value;
  if (data && data.invite_token) {
    joinGroupWithToken(data.invite_token, data.group_id, data.group_name, null, true);
  }
  closeGroupCardPopup();
}

const groupInfoAvatarUrl = computed(() => {
  if (groupInfoAvatarLoadFailed.value) return '';
  
  const group = modalStore.modalData.groupInfo;
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
  return `${baseStore.SERVER_URL}${url}`;
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
  return userStore.onlineUsers.some(user => String(user.id) === String(userId));
}

async function handleUserSearch() {
  if (!searchKeyword.value.trim()) {
    return;
  }
  
  searching.value = true;
  hasSearched.value = true;
  
  try {
    const user = baseStore.currentUser;
    const sessionToken = baseStore.currentSessionToken;
    
    const response = await fetch(`${baseStore.SERVER_URL}/api/user/search?keyword=${encodeURIComponent(searchKeyword.value.trim())}`, {
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
  addFriend(user.id);
}

function isSearchResultUserFriend(userId) {
  return friendStore.friendsList.some(friend => String(friend.id) === String(userId));
}

function handleMessageFriendFromSearch(user) {
  modalStore.closeModal('userSearch');
  switchToPrivateChat(
    user.id,
    user.nickname || user.username,
    user.username,
    user.avatarUrl || user.avatar_url || user.avatar
  );
  setTimeout(() => {
    friendStore.updateFriendSessionTime(user.id);
  }, 200);
}

function handleSendGroupCard() {
  if (selectedGroupIdForSendCard.value) {
    sessionStore.selectedGroupIdForCard = selectedGroupIdForSendCard.value;
    sendGroupCard();
  }
}

watch(() => modalStore.showSendGroupCardModal, (newVal) => {
  if (newVal) {
    selectedGroupIdForSendCard.value = null;
    sendGroupCardList.value = (groupStore.groupsList || []).filter(g => !g.deleted_at);
  }
});

watch(() => modalStore.showUserAvatarPopup, (newVal) => {
  if (newVal) {
    userAvatarPopupAvatarLoadFailed.value = false;
  }
});

watch(() => modalStore.showUserProfileModal, (newVal) => {
  if (newVal) {
    userProfileAvatarLoadFailed.value = false;
    userProfileIsBlocked.value = false;
    
    // 查询拉黑状态
    const userId = modalStore.modalData.userProfile?.id;
    if (userId && userProfileIsFriend.value) {
      fetch(`${SERVER_URL}/api/user/check-block-status/${userId}`, {
        headers: {
          'user-id': baseStore.currentUser?.id,
          'session-token': baseStore.currentSessionToken
        }
      })
      .then(response => response.json())
      .then(data => {
        if (data.status === 'success') {
          userProfileIsBlocked.value = data.isBlocked;
        }
      })
      .catch(e => {
        console.error('查询拉黑状态失败:', e);
      });
    }
  }
});

watch(() => modalStore.showGroupInfoModal, (newVal) => {
  if (newVal) {
    groupInfoAvatarLoadFailed.value = false;
  }
});

function selectGroupForSendCard(groupId) {
  selectedGroupIdForSendCard.value = groupId;
  sessionStore.selectedGroupIdForCard = groupId;
}

async function loadGroupMembers(groupId) {
  if (!groupId) return;
  
  try {
    const response = await fetch(`${baseStore.SERVER_URL}/api/group-members/${groupId}`, {
      headers: {
        'user-id': baseStore.currentUser?.id || '',
        'session-token': baseStore.currentSessionToken || ''
      }
    });
    
    const data = await response.json();
    if (data.status === 'success' && data.members) {
      groupMembers.value = data.members.map(member => ({
        ...member,
        nickname: member.nickname || member.username || '',
        is_muted: false,
        muted_until: null,
        isPermanentMuted: false
      }));
      
      // 加载禁言状态
      loadGroupMuteStatus(groupId);
    }
  } catch (error) {
    console.error('加载群组成员失败:', error);
  }
}

// 群组成员排序：在线成员在前，按ID排序
const sortedGroupMembers = computed(() => {
  const online = [];
  const offline = [];
  
  for (const member of groupMembers.value) {
    if (isMemberOnline(member.id)) {
      online.push(member);
    } else {
      offline.push(member);
    }
  }
  
  // 按ID排序
  online.sort((a, b) => a.id - b.id);
  offline.sort((a, b) => a.id - b.id);
  
  return [...online, ...offline];
});

// 计算每个成员的禁言状态显示
const membersWithMuteStatus = computed(() => {
  // 访问 currentTime 来建立依赖关系，确保时间变化时重新计算
  const now = currentTime.value;
  
  return sortedGroupMembers.value.map(member => {
    // 首先检查是否有禁言标记
    if (!member.is_muted) {
      return {
        ...member,
        muteStatusText: '',
        isPermanentMute: false
      };
    }
    
    // 检查是否是永久禁言（优先于 muted_until 检查，因为永久禁言的 muted_until 可能为 null）
    if (member.isPermanentMuted) {
      return {
        ...member,
        muteStatusText: '🔒 永久禁言',
        isPermanentMute: true
      };
    }
    
    // 通过 mutedUntil 值检测永久禁言（9999年或超过100年）
    if (member.muted_until && isPermanentMute(member.muted_until)) {
      return {
        ...member,
        muteStatusText: '🔒 永久禁言',
        isPermanentMute: true
      };
    }
    
    // 如果没有 muted_until 时间，且不是永久禁言，则显示未禁言
    if (!member.muted_until) {
      return {
        ...member,
        muteStatusText: '',
        isPermanentMute: false
      };
    }
    
    // 临时禁言
    const mutedTime = new Date(member.muted_until);
    const diffMs = mutedTime.getTime() - now;
    
    // 已过期
    if (diffMs <= 0) {
      return {
        ...member,
        muteStatusText: '',
        isPermanentMute: false
      };
    }
    
    // 计算剩余时间显示
    const timeStr = formatMuteTimeWithNow(mutedTime, now);
    return {
      ...member,
      muteStatusText: `⏰ ${timeStr}`,
      isPermanentMute: false
    };
  });
});

// 判断成员是否在线
function isMemberOnline(memberId) {
  if (!userStore.onlineUsers) return false;
  return userStore.onlineUsers.some(u => String(u.id) === String(memberId));
}

// 获取成员头像URL
function getMemberAvatarUrl(member) {
  let url = '';
  if (member.avatarUrl && typeof member.avatarUrl === 'string') {
    url = member.avatarUrl.trim();
  } else if (member.avatar_url && typeof member.avatar_url === 'string') {
    url = member.avatar_url.trim();
  } else if (member.avatar && typeof member.avatar === 'string') {
    url = member.avatar.trim();
  }
  
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${SERVER_URL}${url}`;
}

// 获取成员昵称首字母
function getMemberInitials(member) {
  const name = member.nickname || member.username || 'U';
  return name.charAt(0).toUpperCase();
}

async function loadAvailableMembers() {
  loadingMembers.value = true;
  try {
    const user = baseStore.currentUser;
    
    if (friendStore.friendsList && Array.isArray(friendStore.friendsList)) {
      availableMembers.value = friendStore.friendsList
        .filter(friend => {
          const isNotCurrentUser = String(friend.id) !== String(user?.id);
          const isNotDeleted = !friend.deleted_at;
          return isNotCurrentUser && isNotDeleted;
        })
        .map(friend => ({
          id: friend.id,
          nickname: friend.nickname || friend.username || '',
          avatarUrl: friend.avatar_url || friend.avatarUrl || ''
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
    const user = baseStore.currentUser;
    const sessionToken = baseStore.currentSessionToken;

    if (!user || !sessionToken) {
      createGroupMessage.value = '未登录，请先登录';
      createGroupMessageType.value = 'error';
      return;
    }

    const response = await fetch(`${baseStore.SERVER_URL}/api/create-group`, {
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

      if (data.createMessage && data.createMessage.groupId) {
        groupStore.addGroupMessage(data.createMessage.groupId, data.createMessage);
      }

      loadGroupList();

      setTimeout(() => {
        modalStore.closeModal('createGroup');
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

watch(() => modalStore.showGroupInfoModal, (newVal) => {
  if (newVal && modalStore.modalData.groupInfo) {
    if (modalStore.modalData.groupInfo.deleted_at == null) {
      loadGroupMembers(modalStore.modalData.groupInfo.id);
    }
    // 启动或重启倒计时定时器
    startMuteTimer();
  } else {
    groupMembers.value = [];
    // 关闭模态框时停止定时器，节省资源
    stopMuteTimer();
  }
});

watch(() => modalStore.showCreateGroupModal, (newVal) => {
  if (newVal) {
    selectedMembers.value = [];
    newGroupName.value = '';
    newGroupDesc.value = '';
    createGroupMessage.value = '';
    loadAvailableMembers();
  }
});

watch(() => modalStore.showGroupInfoModal, (newVal) => {
  if (newVal && modalStore.modalData.groupInfo) {
    activeTab.value = 'info';
    newGroupDescription.value = modalStore.modalData.groupInfo.description || '';
    editingGroupName.value = false;
    editingGroupNotice.value = false;
    tempGroupName.value = modalStore.modalData.groupInfo.name || '';
    tempGroupNotice.value = modalStore.modalData.groupInfo.description || '';
  }
});

watch(() => modalStore.showGroupCardPopup, (newVal) => {
  if (newVal) {
    groupCardPopupAvatarLoadFailed.value = false;
  }
});

function startEditGroupName() {
  tempGroupName.value = modalStore.modalData.groupInfo.name || '';
  editingGroupName.value = true;
}

function cancelEditGroupName() {
  editingGroupName.value = false;
  tempGroupName.value = modalStore.modalData.groupInfo.name || '';
}

async function saveGroupName() {
  if (!tempGroupName.value.trim()) {
    toast.error('群组名称不能为空');
    return;
  }
  
  try {
    const groupId = modalStore.modalData.groupInfo.id;
    const response = await fetch(`${baseStore.SERVER_URL}/api/update-group-name`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': baseStore.currentUser?.id || '',
        'session-token': baseStore.currentSessionToken || ''
      },
      body: JSON.stringify({ 
        groupId: Number(groupId),
        newGroupName: tempGroupName.value.trim()
      })
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      toast.success('群组名称已更新');
      modalStore.modalData.groupInfo.name = tempGroupName.value.trim();
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
  tempGroupNotice.value = modalStore.modalData.groupInfo.description || '';
  editingGroupNotice.value = true;
}

function cancelEditGroupNotice() {
  editingGroupNotice.value = false;
  tempGroupNotice.value = modalStore.modalData.groupInfo.description || '';
}

async function saveGroupNotice() {
  try {
    const groupId = modalStore.modalData.groupInfo.id;
    const response = await fetch(`${baseStore.SERVER_URL}/api/update-group-description`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': baseStore.currentUser?.id || '',
        'session-token': baseStore.currentSessionToken || ''
      },
      body: JSON.stringify({ 
        groupId: Number(groupId),
        newDescription: tempGroupNotice.value
      })
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      toast.success('群组公告已更新');
      modalStore.modalData.groupInfo.description = tempGroupNotice.value;
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
    const groupId = modalStore.modalData.groupInfo.id;
    const response = await fetch(`${baseStore.SERVER_URL}/api/remove-group-member`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': baseStore.currentUser?.id || '',
        'session-token': baseStore.currentSessionToken || ''
      },
      body: JSON.stringify({ 
        groupId: Number(groupId),
        memberId: Number(member.id)
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

async function handleSetGroupAdmin(member) {
  const action = member.is_admin ? '取消' : '设置';
  const confirmed = await modal.confirm(`确定要${action} ${member.nickname || member.username} 的管理员权限吗？`, `${action}管理员`);
  if (!confirmed) {
    return;
  }
  
  try {
    const groupId = modalStore.modalData.groupInfo.id;
    const response = await fetch(`${baseStore.SERVER_URL}/api/set-group-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': baseStore.currentUser?.id || '',
        'session-token': baseStore.currentSessionToken || ''
      },
      body: JSON.stringify({ 
        groupId: Number(groupId),
        memberId: Number(member.id),
        isAdmin: !member.is_admin
      })
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      toast.success(data.message || `已${action}管理员权限`);
      loadGroupMembers(groupId);
    } else {
      toast.error(data.message || `${action}管理员失败`);
    }
  } catch (error) {
    console.error(`${action}管理员失败:`, error);
    toast.error(`${action}管理员失败`);
  }
}

async function handleMuteGroupMember(member) {
  const durationOptions = [
    { label: '10分钟', value: 10 },
    { label: '30分钟', value: 30 },
    { label: '1小时', value: 60 },
    { label: '24小时', value: 1440 },
    { label: '7天', value: 10080 },
    { label: '30天', value: 43200 },
    { label: '永久禁言', value: 0 },
    { label: '⏰ 自定义时间...', value: -1 }
  ];
  
  const durationText = await modal.select(
    `选择禁言时长 - ${member.nickname || member.username}`,
    durationOptions.map(opt => opt.label),
    '选择禁言时长'
  );
  
  if (!durationText) {
    return;
  }
  
  const selectedOption = durationOptions.find(opt => opt.label === durationText);
  let duration = selectedOption ? selectedOption.value : 0;
  
  // 如果选择了自定义时间，弹出日期时间选择器
  if (duration === -1) {
    const customDateTime = await showCustomMuteTimePicker(member);
    if (!customDateTime) {
      return; // 用户取消选择
    }
    
    // customDateTime 是用户选择的截止时间的ISO字符串
    // 计算分钟数
    const selectedTime = new Date(customDateTime);
    const now = new Date();
    const diffMs = selectedTime.getTime() - now.getTime();
    const diffMinutes = Math.ceil(diffMs / (1000 * 60));
    
    if (diffMinutes <= 0) {
      toast.error('选择的解禁时间必须大于当前时间');
      return;
    }
    
    // 如果超过100年（52560000分钟），自动设为永久禁言
    if (diffMinutes > 52560000) {
      const confirmed = await modal.confirm(
        '您选择的时间超过100年，将自动设置为永久禁言。是否继续？',
        '提示',
        'warning'
      );
      
      if (!confirmed) {
        return;
      }
      
      duration = 0; // 永久禁言
    } else {
      duration = diffMinutes;
    }
  }
  
  try {
    const groupId = modalStore.modalData.groupInfo.id;
    const response = await fetch(`${baseStore.SERVER_URL}/api/mute-group-member`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': baseStore.currentUser?.id || '',
        'session-token': baseStore.currentSessionToken || ''
      },
      body: JSON.stringify({ 
        groupId: Number(groupId),
        memberId: Number(member.id),
        duration: duration
      })
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      if (duration > 0) {
        const mutedUntil = new Date(data.mutedUntil);
        const timeStr = formatMuteTime(mutedUntil);
        toast.success(`已禁言 ${member.nickname || member.username}，解禁时间：${timeStr}`);
      } else {
        toast.success(`已永久禁言 ${member.nickname || member.username}`);
      }
      loadGroupMembers(groupId);
    } else {
      toast.error(data.message || '禁言失败');
    }
  } catch (error) {
    console.error('禁言成员失败:', error);
    toast.error('禁言失败');
  }
}

async function handleUnmuteGroupMember(member) {
  const confirmed = await modal.confirm(`确定要解除 ${member.nickname || member.username} 的禁言吗？`, '解除禁言');
  if (!confirmed) {
    return;
  }
  
  try {
    const groupId = modalStore.modalData.groupInfo.id;
    const response = await fetch(`${baseStore.SERVER_URL}/api/unmute-group-member`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': baseStore.currentUser?.id || '',
        'session-token': baseStore.currentSessionToken || ''
      },
      body: JSON.stringify({ 
        groupId: Number(groupId),
        memberId: Number(member.id)
      })
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      toast.success(`已解除 ${member.nickname || member.username} 的禁言`);
      loadGroupMembers(groupId);
    } else {
      toast.error(data.message || '解除禁言失败');
    }
  } catch (error) {
    console.error('解除禁言失败:', error);
    toast.error('解除禁言失败');
  }
}

// 自定义时间选择器
async function showCustomMuteTimePicker(member) {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    container.id = 'custom-mute-time-picker';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 24px;
      min-width: 350px;
      max-width: 450px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      animation: slideIn 0.2s ease;
    `;
    
    const now = new Date();
    const defaultTime = new Date(now.getTime() + 60 * 60 * 1000); // 默认1小时后
    
    // 格式化日期时间为datetime-local输入格式
    const formatDateTimeLocal = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    
    modal.innerHTML = `
      <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #333;">自定义解禁时间</h3>
      <p style="color: #666; font-size: 14px; margin-bottom: 16px;">
        为 ${member.nickname || member.username} 设置自定义解禁时间
      </p>
      <div style="margin-bottom: 20px;">
        <label style="display: block; font-weight: 600; color: #444; margin-bottom: 8px; font-size: 14px;">
          解禁时间：
        </label>
        <input 
          type="datetime-local" 
          id="customMuteDateTime" 
          value="${formatDateTimeLocal(defaultTime)}"
          min="${formatDateTimeLocal(now)}"
          style="
            width: 100%;
            padding: 10px 14px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            box-sizing: border-box;
            outline: none;
            transition: border-color 0.3s;
          "
        />
        <p id="timeWarning" style="color: #ff4757; font-size: 12px; margin-top: 8px; display: none;">
          ⚠️ 超过100年将自动设置为永久禁言
        </p>
      </div>
      <div style="display: flex; gap: 12px;">
        <button id="cancelCustomMute" style="
          flex: 1;
          padding: 10px 20px;
          border: 1px solid #d9d9d9;
          border-radius: 6px;
          background: white;
          color: #666;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.3s;
        ">取消</button>
        <button id="confirmCustomMute" style="
          flex: 1;
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          background: #3498db;
          color: white;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.3s;
        ">确认</button>
      </div>
    `;
    
    container.appendChild(modal);
    document.body.appendChild(container);
    
    const dateTimeInput = modal.querySelector('#customMuteDateTime');
    const warningEl = modal.querySelector('#timeWarning');
    const cancelBtn = modal.querySelector('#cancelCustomMute');
    const confirmBtn = modal.querySelector('#confirmCustomMute');
    
    // 监听时间变化，显示警告
    dateTimeInput.addEventListener('change', () => {
      const selectedTime = new Date(dateTimeInput.value);
      const diffMs = selectedTime.getTime() - now.getTime();
      const diffYears = diffMs / (365.25 * 24 * 60 * 60 * 1000);
      
      if (diffYears > 100) {
        warningEl.style.display = 'block';
        dateTimeInput.style.borderColor = '#ff4757';
      } else {
        warningEl.style.display = 'none';
        dateTimeInput.style.borderColor = '#e0e0e0';
      }
    });
    
    // 聚焦效果
    dateTimeInput.addEventListener('focus', () => {
      dateTimeInput.style.borderColor = '#3498db';
    });
    
    dateTimeInput.addEventListener('blur', () => {
      if (warningEl.style.display !== 'block') {
        dateTimeInput.style.borderColor = '#e0e0e0';
      }
    });
    
    function cleanup() {
      container.remove();
    }
    
    function handleConfirm() {
      const selectedValue = dateTimeInput.value;
      if (!selectedValue) {
        toast.error('请选择解禁时间');
        return;
      }
      
      const selectedTime = new Date(selectedValue);
      cleanup();
      resolve(selectedTime.toISOString());
    }
    
    function handleCancel() {
      cleanup();
      resolve(null);
    }
    
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    
    container.addEventListener('click', (e) => {
      if (e.target === container) handleCancel();
    });
    
    // 键盘事件
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        handleConfirm();
        document.removeEventListener('keydown', handleKeyDown);
      } else if (e.key === 'Escape') {
        handleCancel();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    // 添加动画样式（如果不存在）
    if (!document.querySelector('#modal-animations-style')) {
      const style = document.createElement('style');
      style.id = 'modal-animations-style';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes slideOut {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(-20px); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  });
}

// 格式化禁言时间显示
function formatMuteTime(dateTime) {
  if (!dateTime) return '';
  
  const now = new Date();
  const diffMs = dateTime.getTime() - now.getTime();
  const diffSeconds = Math.ceil(diffMs / 1000);
  
  // 检查是否已过期（负数或零）
  if (diffSeconds <= 0) {
    return '已过期';
  }
  
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  // 检查是否超过100年
  const diffYears = diffDays / 365.25;
  if (diffYears > 100) {
    return '永久禁言';
  }
  
  // 根据时间长度返回友好的格式
  if (diffSeconds < 60) {
    return `${diffSeconds}秒后`;
  } else if (diffMinutes < 60) {
    const remainingSeconds = diffSeconds % 60;
    return `${diffMinutes}分${remainingSeconds}秒后`;
  } else if (diffHours < 24) {
    const remainingMinutes = diffMinutes % 60;
    return `${diffHours}小时${remainingMinutes}分后`;
  } else if (diffDays < 30) {
    const remainingHours = diffHours % 24;
    return `${diffDays}天${remainingHours}小时后`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    const remainingDays = diffDays % 30;
    return `${months}个月${remainingDays}天后`;
  } else {
    const years = Math.floor(diffDays / 365);
    const remainingDays = Math.floor(diffDays % 365);
    const months = Math.floor(remainingDays / 30);
    return `${years}年${months}个月后 (${dateTime.toLocaleString('zh-CN')})`;
  }
}

// 使用指定的 now 时间来格式化禁言时间（用于 computed）
function formatMuteTimeWithNow(dateTime, now) {
  if (!dateTime || !now) return '';
  
  const diffMs = dateTime.getTime() - now;
  const diffSeconds = Math.ceil(diffMs / 1000);
  
  // 检查是否已过期（负数或零）
  if (diffSeconds <= 0) {
    return '已过期';
  }
  
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  // 根据时间长度返回友好的格式
  if (diffSeconds < 60) {
    return `${diffSeconds}秒后`;
  } else if (diffMinutes < 60) {
    const remainingSeconds = diffSeconds % 60;
    return `${diffMinutes}分${remainingSeconds}秒后`;
  } else if (diffHours < 24) {
    const remainingMinutes = diffMinutes % 60;
    return `${diffHours}小时${remainingMinutes}分后`;
  } else if (diffDays < 30) {
    const remainingHours = diffHours % 24;
    return `${diffDays}天${remainingHours}小时后`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    const remainingDays = diffDays % 30;
    return `${months}个月${remainingDays}天后`;
  } else {
    const years = Math.floor(diffDays / 365);
    const remainingDays = Math.floor(diffDays % 365);
    const months = Math.floor(remainingDays / 30);
    return `${years}年${months}个月后 (${dateTime.toLocaleString('zh-CN')})`;
  }
}

// 检查是否为永久禁言（超过100年或存储值为9999年）
function isPermanentMute(mutedUntil) {
  if (!mutedUntil) return false;
  
  const mutedTime = new Date(mutedUntil);
  const now = new Date();
  const diffMs = mutedTime.getTime() - now.getTime();
  const diffYears = diffMs / (365.25 * 24 * 60 * 60 * 1000);
  
  // 超过100年或者存储值包含9999
  return diffYears > 100 || String(mutedUntil).includes('9999');
}

// 获取禁言状态显示文本
function getMuteStatusText(member) {
  if (!member.is_muted) return '';
  
  // 使用 isPermanentMute 函数检测（支持超过100年自动判断）
  if (isPermanentMute(member.muted_until) || member.isPermanentMuted) {
    return '🔒 永久禁言';
  }
  
  // 如果有截止时间，检查是否已过期
  if (member.muted_until) {
    const mutedTime = new Date(member.muted_until);
    const now = new Date();
    const diffMs = mutedTime.getTime() - now.getTime();
    
    // 如果已过期，返回空文本（这样禁言标识不会显示，按钮会显示为"禁言"）
    if (diffMs <= 0) {
      return '';
    }
    
    const timeStr = formatMuteTime(mutedTime);
    console.log('⏰ 禁言时间:', timeStr);
    return `⏰ ${timeStr}`;
  }
  
  return '已禁言';
}

// 获取禁言状态提示信息（鼠标悬停显示）
function getMuteStatusTooltip(member) {
  if (!member.is_muted) return '';
  
  if (isPermanentMute(member.muted_until) || member.isPermanentMuted) {
    return '该成员已被永久禁言，无法发送消息';
  }
  
  if (member.muted_until) {
    const mutedTime = new Date(member.muted_until);
    const formattedTime = mutedTime.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    return `解禁时间：${formattedTime}\n点击查看详情`;
  }
  
  return '该成员已被禁言，无法发送消息';
}

const isMuteAllEnabled = ref(false);

async function handleToggleMuteAll() {
  const action = isMuteAllEnabled.value ? '关闭' : '开启';
  const confirmed = await modal.confirm(`确定要${action}全员禁言吗？${!isMuteAllEnabled.value ? '开启后只有群主和管理员可以发言' : '关闭后所有成员都可以发言'}`, `${action}全员禁言`);
  if (!confirmed) {
    return;
  }
  
  try {
    const groupId = modalStore.modalData.groupInfo.id;
    const response = await fetch(`${baseStore.SERVER_URL}/api/set-mute-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': baseStore.currentUser?.id || '',
        'session-token': baseStore.currentSessionToken || ''
      },
      body: JSON.stringify({ 
        groupId: Number(groupId),
        isMuteAll: !isMuteAllEnabled.value
      })
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      isMuteAllEnabled.value = !isMuteAllEnabled.value;
      toast.success(data.message || `已${action}全员禁言`);
    } else {
      toast.error(data.message || `${action}全员禁言失败`);
    }
  } catch (error) {
    console.error(`${action}全员禁言失败:`, error);
    toast.error(`${action}全员禁言失败`);
  }
}

async function loadGroupMuteStatus(groupId) {
  try {
    const response = await fetch(`${baseStore.SERVER_URL}/api/mute-status/${groupId}`, {
      headers: {
        'user-id': baseStore.currentUser?.id || '',
        'session-token': baseStore.currentSessionToken || ''
      }
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      isMuteAllEnabled.value = data.isMuteAll;
      
      // 更新成员的禁言状态
      if (groupMembers.value.length > 0 && data.members) {
        groupMembers.value = groupMembers.value.map(member => {
          const muteInfo = data.members.find(m => String(m.id) === String(member.id));
          if (muteInfo && muteInfo.isMuted) {
            const mutedUntil = muteInfo.mutedUntil;
            
            // 使用 isPermanentMute 函数检测是否超过100年（双重保障）
            const autoDetectedPermanent = isPermanentMute(mutedUntil);
            
            // 前端二次验证：检查临时禁言是否已过期（防止后端漏检或时区差异）
            if (!autoDetectedPermanent && !muteInfo.isPermanent && mutedUntil) {
              const mutedTime = new Date(mutedUntil);
              const now = new Date();
              const diffMs = mutedTime.getTime() - now.getTime();
              
              // 如果已过期，返回未禁言状态
              if (diffMs <= 0) {
                return {
                  ...member,
                  is_muted: false,
                  muted_until: null,
                  isPermanentMuted: false
                };
              }
            }
            
            return {
              ...member,
              is_muted: true,
              muted_until: mutedUntil,
              isPermanentMuted: muteInfo.isPermanent || autoDetectedPermanent  // 优先使用后端判断，但前端也会自动检测
            };
          }
          return {
            ...member,
            is_muted: false,
            muted_until: null,
            isPermanentMuted: false
          };
        });
      }
    }
  } catch (error) {
    console.error('获取禁言状态失败:', error);
  }
}

async function handleDissolveGroup() {
  const groupId = modalStore.modalData.groupInfo?.id;
  if (!groupId) {
    toast.error('群组信息不存在');
    return;
  }
  
  const confirmed = await modal.confirm('确定要解散这个群组吗？此操作不可撤销！', '解散群组', 'error');
  if (!confirmed) {
    return;
  }
  
  try {
    const response = await fetch(`${baseStore.SERVER_URL}/api/dissolve-group`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': baseStore.currentUser?.id || '',
        'session-token': baseStore.currentSessionToken || ''
      },
      body: JSON.stringify({ groupId })
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      toast.success('群组已解散');
      modalStore.closeModal('groupInfo');
      sessionStore.setCurrentGroupId(null);
      
      await groupStore.markGroupAsDeleted(groupId, true);
      
      loadGroupList();
    } else {
      toast.error(data.message || '解散群组失败');
    }
  } catch (error) {
    console.error('解散群组失败:', error);
    toast.error('解散群组失败');
  }
}

async function handleLeaveGroup() {
  const groupId = modalStore.modalData.groupInfo?.id;
  if (!groupId) {
    toast.error('群组信息不存在');
    return;
  }
  
  const confirmed = await modal.confirm('确定要退出这个群组吗？', '退出群组');
  if (!confirmed) {
    return;
  }
  
  try {
    const response = await fetch(`${baseStore.SERVER_URL}/api/leave-group`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': baseStore.currentUser?.id || '',
        'session-token': baseStore.currentSessionToken || ''
      },
      body: JSON.stringify({ groupId })
    });
    
    const data = await response.json();
    if (data.success || data.status === 'success') {
      toast.success('已退出群组');
      modalStore.closeModal('groupInfo');
      sessionStore.setCurrentGroupId(null);
      
      await groupStore.markGroupAsDeleted(groupId, false);
      
      loadGroupList();
    } else {
      toast.error(data.message || '退出群组失败');
    }
  } catch (error) {
    console.error('退出群组失败:', error);
    toast.error('退出群组失败');
  }
}

async function handleDeleteFriend() {
  const friendId = modalStore.modalData.userProfile?.id;
  if (!friendId) {
    toast.error('用户信息不存在');
    return;
  }
  
  const confirmed = await modal.confirm('确定要删除这个好友吗？', '删除好友');
  if (!confirmed) {
    return;
  }
  
  try {
    const response = await fetch(`${baseStore.SERVER_URL}/api/user/remove-friend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': baseStore.currentUser?.id || '',
        'session-token': baseStore.currentSessionToken || ''
      },
      body: JSON.stringify({ friendId })
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      toast.success('删除好友成功');
      modalStore.closeModal('userProfile');
      
      await friendStore.markFriendAsDeleted(friendId, true);
      
      loadFriendsList();
      sessionStore.setCurrentPrivateChatUserId(null);
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
    const user = baseStore.currentUser;
    const sessionToken = baseStore.currentSessionToken;
    const groupId = modalStore.modalData.groupInfo.id;
    
    const membersResponse = await fetch(`${baseStore.SERVER_URL}/api/group-members/${groupId}`, {
      headers: {
        'user-id': user?.id || '',
        'session-token': sessionToken || ''
      }
    });
    
    const membersData = await membersResponse.json();
    const groupMemberIds = new Set((membersData.members || []).map(m => String(m.id)));
    
    if (friendStore.friendsList && Array.isArray(friendStore.friendsList)) {
      availableFriendsForAdd.value = friendStore.friendsList
        .filter(friend => {
          const friendId = String(friend.id);
          const isNotCurrentUser = friendId !== String(user?.id);
          const isNotInGroup = !groupMemberIds.has(friendId);
          const isNotDeleted = !friend.deleted_at;
          return isNotCurrentUser && isNotInGroup && isNotDeleted;
        })
        .map(friend => ({
          id: friend.id,
          nickname: friend.nickname || friend.username || '',
          avatarUrl: friend.avatar_url || friend.avatarUrl || ''
        }));
    } else {
      availableFriendsForAdd.value = [];
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
    const groupId = modalStore.modalData.groupInfo.id;
    const response = await fetch(`${baseStore.SERVER_URL}/api/add-group-members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': baseStore.currentUser?.id || '',
        'session-token': baseStore.currentSessionToken || ''
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

async function handleDeleteGroupLocalRecord() {
  const groupId = modalStore.modalData.groupInfo?.id;
  if (!groupId) {
    toast.error('群组信息不存在');
    return;
  }
  
  const confirmed = await modal.confirm('确定要删除该群组的会话记录吗？\n这将同时删除服务器和本地的记录。', '删除会话');
  if (!confirmed) {
    return;
  }
  
  try {
    await storageStore.deleteSingleDeletedSession('group', groupId);
    toast.success('会话记录已删除');
    modalStore.closeModal('groupInfo');
    sessionStore.setCurrentGroupId(null);
  } catch (error) {
    console.error('删除会话记录失败:', error);
    toast.error('删除会话记录失败: ' + error.message);
  }
}

async function handleDeleteFriendLocalRecord() {
  const friendId = modalStore.modalData.userProfile?.id;
  if (!friendId) {
    toast.error('用户信息不存在');
    return;
  }
  
  const confirmed = await modal.confirm('确定要删除该好友的会话记录吗？\n这将同时删除服务器和本地的记录。', '删除会话');
  if (!confirmed) {
    return;
  }
  
  try {
    await storageStore.deleteSingleDeletedSession('private', friendId);
    toast.success('会话记录已删除');
    modalStore.closeModal('userProfile');
    sessionStore.setCurrentPrivateChatUserId(null);
  } catch (error) {
    console.error('删除会话记录失败:', error);
    toast.error('删除会话记录失败: ' + error.message);
  }
}

async function handleGroupAvatarChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  
  try {
    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('groupId', modalStore.modalData.groupInfo.id);
    formData.append('userId', baseStore.currentUser?.id || '');
    
    const groupId = modalStore.modalData.groupInfo.id;
    const response = await fetch(`${baseStore.SERVER_URL}/api/upload-group-avatar/${groupId}`, {
      method: 'POST',
      headers: {
        'user-id': baseStore.currentUser?.id || '',
        'session-token': baseStore.currentSessionToken || ''
      },
      body: formData
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      toast.success('群头像上传成功');
      const infoResponse = await fetch(`${baseStore.SERVER_URL}/api/group-info/${groupId}`, {
        headers: {
          'user-id': baseStore.currentUser?.id || '',
          'session-token': baseStore.currentSessionToken || ''
        }
      });
      const infoData = await infoResponse.json();
      if (infoData.status === 'success' && infoData.group) {
        modalStore.modalData.groupInfo = infoData.group;
      }
      loadGroupList();
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
        'user-id': baseStore.currentUser?.id || '',
        'session-token': baseStore.currentSessionToken || ''
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
  modalStore.closeModal('userAvatarPopup');
  document.removeEventListener('click', hideUserAvatarPopupVue);
  document.removeEventListener('contextmenu', hideUserAvatarPopupVue);
  window.removeEventListener('scroll', hideUserAvatarPopupVue);
}

async function showUserAvatarPopupVue(event, user) {
  event.stopPropagation();
  
  // 先关闭之前的弹窗
  hideUserAvatarPopupVue();
  
  userAvatarPopupEvent.value = event;
  userAvatarPopupUserId.value = user.id;
  
  userAvatarPopupLeft.value = event.clientX;
  userAvatarPopupTop.value = event.clientY;
  
  const displayPopup = async (displayUser) => {
    modalStore.openModal('userAvatarPopup', displayUser);
    
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
    modalStore.openModal('avatarPreview', userAvatarPopupAvatarUrl.value);
  }
}

function openUserProfileAvatarPreview() {
  if (userProfileAvatarUrl.value) {
    modalStore.openModal('avatarPreview', userProfileAvatarUrl.value);
  }
}

async function handleUserProfileToggleBlockUser() {
  const targetUserId = modalStore.modalData.userProfile?.id;
  if (!targetUserId || userProfileBlockingLoading.value) return;
  
  // 注意：由于 v-model 先于 @change 执行，此时 userProfileIsBlocked.value 已经是新值
  // 所以要取反得到操作前的状态来判断应该调用哪个API
  const willBeBlocked = userProfileIsBlocked.value; // 这是操作后的状态
  const isCurrentlyBlocked = !willBeBlocked; // 操作前的状态
  
  userProfileBlockingLoading.value = true;
  
  try {
    // 根据操作前的状态决定调用哪个API
    // 如果操作前已拉黑(isCurrentlyBlocked=true)，现在要取消拉黑
    // 如果操作前未拉黑(isCurrentlyBlocked=false)，现在要拉黑
    const apiUrl = isCurrentlyBlocked ? '/api/user/unblock-user' : '/api/user/block-user';
    const response = await fetch(`${SERVER_URL}${apiUrl}`, {
      method: 'POST',
      headers: {
        'user-id': baseStore.currentUser?.id,
        'session-token': baseStore.currentSessionToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ targetUserId })
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
      // userProfileIsBlocked.value 已经被 v-model 更新了，无需再次修改
      
      // 刷新好友列表
      if (typeof loadFriendsList === 'function') {
        loadFriendsList();
      }
      
      toast.success(data.message);
    } else {
      // 失败时，需要将状态恢复回去
      userProfileIsBlocked.value = isCurrentlyBlocked;
      toast.error(data.message || (isCurrentlyBlocked ? '取消拉黑失败' : '拉黑失败'));
    }
  } catch (e) {
    console.error('拉黑操作失败:', e);
    // 异常时也需要恢复状态
    userProfileIsBlocked.value = !userProfileIsBlocked.value;
    toast.error('网络错误');
  } finally {
    userProfileBlockingLoading.value = false;
  }
}

function openGroupInfoAvatarPreview() {
  if (groupInfoAvatarUrl.value) {
    modalStore.openModal('avatarPreview', groupInfoAvatarUrl.value);
  }
}

function handleUserAvatarPopupAddFriend() {
  if (userAvatarPopupAddFriendButtonDisabled.value || !userAvatarPopupUserId.value) return;

  if (userAvatarPopupIsFriend.value) {
    const user = modalStore.modalData.userAvatarPopup;
    if (user) {
      hideUserAvatarPopupVue();
      switchToPrivateChat(
        userAvatarPopupUserId.value,
        user.nickname || user.username,
        user.username,
        user.avatarUrl || user.avatar_url || user.avatar
      );
      setTimeout(() => {
        friendStore.updateFriendSessionTime(userAvatarPopupUserId.value);
      }, 200);
    }
    return;
  }

  addFriend(userAvatarPopupUserId.value);
  hideUserAvatarPopupVue();
}

function showMemberContextMenu(event, member) {
  event.preventDefault();
  
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    member: member
  };
  
  // 调整菜单位置，防止超出屏幕
  setTimeout(() => {
    const menuEl = document.querySelector('.context-menu-active');
    if (menuEl) {
      const rect = menuEl.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        contextMenu.value.x = window.innerWidth - rect.width - 10;
      }
      if (rect.bottom > window.innerHeight) {
        contextMenu.value.y = window.innerHeight - rect.height - 10;
      }
    }
  }, 0);
}

function hideContextMenu() {
  contextMenu.value = {
    visible: false,
    x: 0,
    y: 0,
    member: null
  };
}

const canShowContextMenuActions = computed(() => {
  const member = contextMenu.value.member;
  if (!member) return false;
  
  const isOwner = isCurrentUserGroupOwner.value;
  const isAdmin = isCurrentUserGroupAdmin.value;
  const isSelf = String(member.id) === String(baseStore.currentUser?.id);
  const isCreator = String(member.id) === String(modalStore.modalData.groupInfo?.creator_id);
  
  return !isSelf && (
    (isOwner && !isCreator) ||
    (isAdmin && !member.is_admin && !isCreator)
  );
});

async function handleContextAction(action) {
  const member = contextMenu.value.member;
  if (!member) return;
  
  hideContextMenu();
  
  switch (action) {
    case 'remove':
      await handleRemoveGroupMember(member);
      break;
    case 'admin':
      await handleSetGroupAdmin(member);
      break;
    case 'mute':
      if (member.is_muted) {
        await handleUnmuteGroupMember(member);
      } else {
        await handleMuteGroupMember(member);
      }
      break;
    case 'info':
      showMemberInfo(member);
      break;
  }
}

function showMemberInfo(member) {
  let infoText = `成员信息\n`;
  infoText += `━━━━━━━━━━━━\n`;
  infoText += `昵称：${member.nickname || member.username || '未知'}\n`;
  infoText += `ID：${member.id}\n`;
  infoText += `角色：${String(member.id) === String(modalStore.modalData.groupInfo?.creator_id) ? '群主' : member.is_admin ? '管理员' : '普通成员'}\n`;
  infoText += `状态：${isMemberOnline(member.id) ? '在线' : '离线'}\n`;
  
  if (member.is_muted) {
    infoText += `\n禁言状态：\n`;
    if (isPermanentMute(member.muted_until) || member.isPermanentMuted) {
      infoText += `  类型：永久禁言\n`;
    } else if (member.muted_until) {
      infoText += `  类型：临时禁言\n`;
      infoText += `  截止时间：${new Date(member.muted_until).toLocaleString('zh-CN')}\n`;
      infoText += `  剩余时间：${getMuteStatusText(member)}\n`;
    }
  }
  
  alert(infoText);
}

function updateMuteCountdowns() {
  if (!groupMembers.value || groupMembers.value.length === 0) return false;
  
  const now = Date.now();
  let hasActiveMutes = false;
  
  // 检查是否有成员禁言已过期，如果有则更新状态
  const updatedMembers = groupMembers.value.map(member => {
    if (!member.is_muted || !member.muted_until) {
      return member;
    }
    
    if (isPermanentMute(member.muted_until) || member.isPermanentMuted) {
      hasActiveMutes = true;
      return member;
    }
    
    const mutedTime = new Date(member.muted_until);
    const diffMs = mutedTime.getTime() - now;
    
    if (diffMs <= 0) {
      // 禁言已过期，更新状态
      return {
        ...member,
        is_muted: false,
        muted_until: null,
        isPermanentMuted: false
      };
    }
    
    hasActiveMutes = true;
    return member;
  });
  
  // 检查是否有成员状态发生变化
  const hasChanges = JSON.stringify(updatedMembers) !== JSON.stringify(groupMembers.value);
  if (hasChanges) {
    groupMembers.value = updatedMembers;
  }
  
  // 更新时间戳，触发 computed 重新计算
  currentTime.value = now;
  
  return hasActiveMutes;
}

function startMuteTimer() {
  stopMuteTimer();
  
  function tick() {
    const hasActiveMutes = updateMuteCountdowns();
    muteTimer = setTimeout(tick, hasActiveMutes ? 1000 : 30000);
  }
  
  // 立即执行第一次更新
  tick();
}

function stopMuteTimer() {
  if (muteTimer) {
    clearTimeout(muteTimer);
    muteTimer = null;
  }
}

onUnmounted(() => {
  stopMuteTimer();
});

registerPopupFunctions(showUserAvatarPopupVue, hideUserAvatarPopupVue, showGroupCardPopupVue);
</script>