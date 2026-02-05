<template>
  <div id="groupInfoModal" class="modal" style="display: none;">
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="modalGroupName">群组信息</h2>
        <span class="close" id="closeGroupInfoModal">&times;</span>
      </div>
      <div class="modal-body">
        <div class="group-info-item">
          <label>群组名称:</label>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span id="modalGroupNameValue"></span>
            <button id="editGroupNameBtn" class="edit-group-name-btn" style="padding: 4px 8px; background-color: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
              编辑
            </button>
          </div>
        </div>
        <div class="group-info-item">
          <label>群组ID:</label>
          <span id="modalGroupIdValue"></span>
        </div>
        <div class="group-info-item">
          <label>群组公告:</label>
          <div style="display: flex; align-items: flex-start; gap: 10px;">
            <span id="modalGroupNoticeValue" style="flex: 1; word-break: break-word;"></span>
            <button id="editGroupNoticeBtn" class="edit-group-notice-btn" style="padding: 4px 8px; background-color: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
              编辑
            </button>
          </div>
        </div>
        <div class="group-info-item">
          <label>成员数量:</label>
          <span id="modalGroupMemberCount"></span>
        </div>
        <div class="group-info-item">
          <label>群主:</label>
          <span id="modalGroupOwner">加载中...</span>
        </div>

        <!-- 群组成员列表 -->
        <div class="group-members-section">
          <h3>群组成员</h3>
          <div id="groupMembersContainer" class="group-members-container">
            <div class="loading-members">正在加载成员列表...</div>
          </div>
        </div>

        <!-- 群主管理区域 -->
        <div id="groupManageSection" class="group-manage-section" style="display: none;">
          <h3>群组管理</h3>
          <div class="group-manage-buttons">
            <button id="addMemberToGroup" class="save-btn">添加成员</button>
            <button id="refreshGroupMembers" class="save-btn">刷新成员列表</button>
          </div>
        </div>


      </div>
      <div class="modal-footer">
        <button id="modalCloseButton" class="cancel-btn">关闭</button>
      </div>
    </div>
  </div>

  <!-- 分享群名片模态框 -->
  <div id="shareGroupCardModal" class="modal" style="display: none;">
    <div class="modal-content" style="width: 500px;">
      <div class="modal-header">
        <h2>分享群名片</h2>
        <span class="close" id="closeShareGroupCardModal">&times;</span>
      </div>
      <div class="modal-body">
        <p>选择要分享的群组或主聊天室：</p>
        <div class="share-targets-container" style="max-height: 300px; overflow-y: auto; margin: 15px 0;">
          <!-- 主聊天室选项 -->
          <div class="share-target-item" style="display: flex; align-items: center; margin: 10px 0;">
            <input type="checkbox" id="target-main-chat" value="main" class="share-target-checkbox">
            <label for="target-main-chat" style="margin-left: 10px; cursor: pointer;">主聊天室</label>
          </div>
          <!-- 群组列表 -->
          <div id="shareGroupList" style="margin-top: 15px;">
            <!-- 群组选项将动态添加 -->
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button id="cancelShareGroupCard" class="cancel-btn">取消</button>
        <button id="confirmShareGroupCard" class="save-btn">发送</button>
      </div>
    </div>
  </div>

  <!-- 发送群名片模态框（单选） -->
  <div id="sendGroupCardModal" class="modal" style="display: none;">
    <div class="modal-content" style="width: 400px;">
      <div class="modal-header">
        <h2>选择群名片</h2>
        <span class="close" id="closeSendGroupCardModal">&times;</span>
      </div>
      <div class="modal-body">
        <p>选择要发送的群名片：</p>
        <div class="send-group-card-container" style="max-height: 300px; overflow-y: auto; margin: 15px 0;">
          <!-- 群组列表将动态添加 -->
          <div id="sendGroupCardList"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button id="cancelSendGroupCard" class="cancel-btn">取消</button>
        <button id="confirmSendGroupCard" class="save-btn" disabled>发送</button>
      </div>
    </div>
  </div>

  <!-- 创建群组模态框 -->
  <div id="createGroupModal" class="modal" style="display: none;">
    <div class="modal-content">
      <div class="modal-header">
        <h2>创建新群组</h2>
        <span class="close" id="closeCreateGroupModal">&times;</span>
      </div>
      <div class="modal-body">
        <form id="createGroupForm" class="settings-form">
          <div class="form-group">
            <label for="newGroupName">群组名称 *</label>
            <input type="text" id="newGroupName" placeholder="请输入群组名称" maxlength="50" required>
          </div>
          <div class="form-group">
            <label for="newGroupDescription">群组公告</label>
            <textarea id="newGroupDescription" placeholder="请输入群组公告（可选）" rows="3" maxlength="200"></textarea>
          </div>
          <div class="form-group">
            <label>选择其他群成员</label>
            <div id="groupMembersList" class="group-members-list">
              <!-- 成员列表将通过JavaScript动态加载 -->
              <div class="loading-members">正在加载成员列表...</div>
            </div>
          </div>
          <div id="createGroupMessage" class="create-group-message"></div>
        </form>
      </div>
      <div class="modal-footer">
        <button id="cancelCreateGroup" class="cancel-btn">取消</button>
        <button id="submitCreateGroup" class="save-btn">创建群组</button>
      </div>
    </div>
  </div>

  <!-- 添加群组成员模态框 -->
  <div id="addGroupMemberModal" class="modal" style="display: none;">
    <div class="modal-content">
      <div class="modal-header">
        <h2>添加群组成员</h2>
        <span class="close" id="closeAddGroupMemberModal">&times;</span>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>选择要添加的成员</label>
          <div id="availableMembersList" class="group-members-list">
            <!-- 可添加成员列表将通过JavaScript动态加载 -->
            <div class="loading-members">正在加载可用成员...</div>
          </div>
        </div>
        <div id="addMembersMessage" class="create-group-message"></div>
      </div>
      <div class="modal-footer">
        <button id="cancelAddMembers" class="cancel-btn">取消</button>
        <button id="confirmAddMembers" class="save-btn">确认添加</button>
      </div>
    </div>
  </div>

  <!-- 用户资料模态框 -->
  <div id="userProfileModal" class="modal" style="display: none;">
    <div class="modal-content">
      <div class="modal-header">
        <h2>用户资料</h2>
        <span class="close" id="closeUserProfileModal">&times;</span>
      </div>
      <div class="modal-body">
        <div class="user-profile-container">
          <div class="user-profile-avatar">
            <img id="modalUserAvatar" src="" alt="用户头像" class="user-avatar-img" loading="lazy" width="120" height="120" style="aspect-ratio: 1/1; object-fit: cover; border-radius: 50%;">
            <span id="modalUserInitials" class="user-initials"></span>
          </div>
          <div class="user-profile-info">
            <div class="user-profile-item">
              <label>昵称:</label>
              <span id="modalUserNickname"></span>
            </div>
            <div class="user-profile-item">
              <label>用户名:</label>
              <span id="modalUsername"></span>
            </div>
            <div class="user-profile-item">
              <label>用户ID:</label>
              <span id="modalUserId"></span>
            </div>
            <div class="user-profile-item">
              <label>状态:</label>
              <span id="modalUserStatus" class="user-status"></span>
            </div>
          </div>

        </div>
      </div>
      <div class="modal-footer">
        <button id="closeUserProfileButton" class="cancel-btn">关闭</button>
      </div>
    </div>
  </div>

  <!-- 用户头像小弹窗 -->
  <div id="userAvatarPopup" style="display: none; position: absolute; background: white; border: 1px solid #ddd; border-radius: 8px; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); z-index: 1000; min-width: 250px;">
    <div class="popup-header" style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
      <div class="popup-avatar" style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #3498db; color: white; font-weight: bold;">
        <img id="popupAvatarImg" src="" alt="用户头像" style="width: 100%; height: 100%; object-fit: cover;">
        <span id="popupInitials" style="display: none; font-size: 18px;"></span>
      </div>
      <div class="popup-info">
        <div id="popupNickname" style="font-weight: bold; font-size: 16px;"></div>
        <div id="popupUsername" style="font-size: 14px; color: #666;"></div>
      </div>
    </div>
    <div class="popup-actions" style="margin-top: 10px; display: flex; gap: 10px;">
      <button id="popupAddFriend" style="flex: 1; padding: 8px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">添加好友</button>
    </div>
  </div>

  <!-- 用户搜索模态框 -->
  <div id="userSearchModal" class="modal" style="display: none;">
    <div class="modal-content">
      <div class="modal-header">
        <h2>搜索用户</h2>
        <span class="close" id="closeUserSearchModal">&times;</span>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="searchKeyword">搜索关键词:</label>
          <input type="text" id="searchKeyword" placeholder="输入用户名或昵称" required>
        </div>
        <div id="searchResults" class="search-results">
          <!-- 搜索结果将通过JavaScript动态加载 -->
        </div>
      </div>
      <div class="modal-footer">
        <button id="cancelUserSearch" class="cancel-btn">取消</button>
        <button id="confirmUserSearch" class="save-btn">搜索</button>
      </div>
    </div>
  </div>

  <!-- 图片预览模态框 -->
  <div id="imagePreviewModal" class="modal" style="display: none; position: fixed; z-index: 10001; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.9); justify-content: center; align-items: center;">
    <div style="position: relative; max-width: 90%; max-height: 90%;">
      <img id="previewImgElement" src="" alt="图片预览" style="width: 100%; height: auto; max-width: 90vw; max-height: 90vh; aspect-ratio: 16/9; object-fit: contain;" loading="lazy">
      <span class="close" id="closeImagePreviewModal" style="position: absolute; top: -30px; right: -30px; color: #f1f1f1; font-size: 40px; font-weight: bold; cursor: pointer;">&times;</span>
    </div>
  </div>

  <!-- 头像预览模态框 -->
  <div id="avatarPreviewModal" class="modal" style="display: none; position: fixed; z-index: 10001; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.9); justify-content: center; align-items: center;">
    <div style="position: relative; max-width: 300px; max-height: 300px;">
      <img id="previewAvatarElement" src="" alt="头像预览" style="width: 300px; height: 300px; border-radius: 50%; object-fit: cover;">
      <span class="close" id="closeAvatarPreviewModal" style="position: absolute; top: -30px; right: -30px; color: #f1f1f1; font-size: 40px; font-weight: bold; cursor: pointer;">&times;</span>
    </div>
  </div>
</template>

<script>
// 全局处理模态框外部点击关闭
window.addEventListener('click', function(event) {
  // 检查是否点击了模态框外部
  if (event.target.classList.contains('modal')) {
    // 关闭所有模态框
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
      modal.style.display = 'none';
    });
  }
});
</script>

<style src="@/css/index.css"></style>
<style src="@/css/code-highlight.css"></style>