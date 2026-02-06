<template>
  <div class="chat-content" data-content="private-chat">
    <!-- 空白状态 -->
    <div class="empty-chat-state active" id="privateEmptyState">
      <div class="empty-icon">👤</div>
      <h3>选择一个好友开始聊天</h3>
      <p>请从左侧好友列表中选择一个好友，开始私聊会话</p>
    </div>

    <!-- 具体私信聊天界面 -->
    <div class="private-chat-interface" id="privateChatInterface" style="display: none;">
      <!-- 聊天头部 -->
      <div class="private-header">
        <div class="private-user-info">
          <div class="private-user-avatar">
            <img id="privateUserAvatar" src="" alt="用户头像" class="user-avatar-img" loading="lazy" width="40" height="40" style="aspect-ratio: 1/1; object-fit: cover;">
            <span id="privateUserInitials" class="user-initials"></span>
          </div>
          <div class="private-user-details">
            <h2 id="privateUserName">好友昵称</h2>
            <div id="privateUserStatus" class="user-status">在线</div>
          </div>
        </div>
        <div class="private-actions">
          <button id="privateUserInfoButton" title="查看用户资料" @click="initializeUserProfileModal()">👤</button>
          <button id="deleteFriendButton" title="删除好友">🗑️</button>
        </div>
      </div>

      <!-- 私信Markdown工具栏 -->
      <div class="markdown-toolbar private-markdown-toolbar" id="privateMarkdownToolbar" style="display: none;">
        <button class="markdown-btn" data-prefix="**" data-suffix="**" data-sample="粗体文本">粗体</button>
        <button class="markdown-btn" data-prefix="_" data-suffix="_" data-sample="斜体文本">斜体</button>
        <button class="markdown-btn" data-prefix="`" data-suffix="`" data-sample="代码">代码</button>
        <button class="markdown-btn" data-prefix="```\n" data-suffix="\n```" data-sample="代码块">代码块</button>
        <button class="markdown-btn" data-prefix="# " data-sample="标题">标题</button>
        <button class="markdown-btn" data-prefix="- " data-sample="列表项">列表</button>
        <button class="markdown-btn" data-prefix="> " data-sample="引用文本">引用</button>
        <button class="markdown-btn" data-prefix="[链接描述](" data-suffix=")" data-sample="链接文本">链接</button>
        <button class="markdown-btn" data-prefix="![图片无法显示时的文字](" data-suffix=")" data-sample="图片URL">图片</button>
      </div>

      <!-- 私信消息列表 -->
      <div id="privateMessageContainer">
        <div class="empty-state">
          <h3>暂无私信</h3>
          <p>发送第一条消息开始聊天吧!</p>
        </div>
      </div>

      <!-- 私信输入区域 -->
      <div class="input-area">
        <div class="input-container" id="privateInputContainer">
          <div id="privateMessageInput" class="editable-div" placeholder="发送消息（Ctrl+Enter或Shift+Enter换行  支持Markdown语法）" contenteditable="true"></div>
        </div>
        <div class="input-buttons" id="privateInputButtons">
          <button id="sendPrivateMessage">发送</button>
          <button id="privateMoreButton" class="more-button" title="更多功能">
            ⋯ <span class="button-text">更多</span>
          </button>
          <button id="togglePrivateMarkdownToolbar" class="toggle-btn" style="background: #f1f1f1; border: 1px solid #ddd; border-radius: 4px; padding: 5px 10px; font-size: 12px; cursor: pointer; color: #666; transition: all 0.2s; margin-left: 5px;">
            <i class="fas fa-chevron-down"></i> MD
          </button>
        </div>
        <!-- 将more-functions移到input-buttons外面 -->
        <div class="more-functions" id="privateMoreFunctions" style="display: none;">
          <button id="privateImageUploadButton" title="上传图片">
            📷 <span class="button-text">发送图片</span>
          </button>
          <button id="privateFileUploadButton" title="上传文件">
            📤 <span class="button-text">发送文件</span>
          </button>
          <button id="privateSendGroupCardButton" title="发送群名片">
            📱 <span class="button-text">发送群名片</span>
          </button>
        </div>
        <input type="file" id="privateImageInput" style="display: none;" accept="image/*">
        <input type="file" id="privateFileInput" style="display: none;">
      </div>

      <!-- 上传进度条 -->
      <div class="upload-progress" id="privateUploadProgress">
        <div class="upload-progress-bar" id="privateUploadProgressBar"></div>
      </div>
    </div>
  </div>
</template>

<style src="@/css/index.css"></style>
<style src="@/css/code-highlight.css"></style>
<script setup>
import {onMounted} from "vue";
import {
  initializePrivateMessageSending,
  sessionStore,
  setActiveChat,
  loadPrivateChatHistory,
  initializeUserProfileModal,
  initializeImageClickEvents
} from "@/utils/chat";
import {initializePrivateChatInterface} from "@/utils/chat";

onMounted(() => {
  initializePrivateMessageSending()

  // 检查是否有保持的私信会话信息，如果有则应用
  if (sessionStore.currentPrivateChatUserId) {
    // console.log('检测到保持的私信会话信息，应用状态:', {
    //   userId: sessionStore.currentPrivateChatUserId,
    //   username: sessionStore.currentPrivateChatUsername,
    //   nickname: sessionStore.currentPrivateChatNickname
    // });
    
    // 设置活动聊天状态
    setActiveChat('private', sessionStore.currentPrivateChatUserId);
    
    // 确保私信聊天界面显示
    const privateEmptyState = document.getElementById('privateEmptyState');
    const privateChatInterface = document.getElementById('privateChatInterface');
    const privateUserName = document.getElementById('privateUserName');
    const privateUserAvatar = document.getElementById('privateUserAvatar');
    const privateUserInitials = document.getElementById('privateUserInitials');
    if (privateEmptyState) privateEmptyState.style.display = 'none';
    if (privateChatInterface) {
      privateChatInterface.style.display = 'flex';
      privateChatInterface.style.flexDirection = 'column';
    }
    if (privateUserName) privateUserName.textContent = sessionStore.currentPrivateChatNickname;
    if (privateUserAvatar && privateUserInitials) {
      const avatarUrl = sessionStore.currentPrivateChatAvatarUrl;
      if (avatarUrl) {
        const fullAvatarUrl = `https://back.hs.airoe.cn${avatarUrl}`;
        privateUserAvatar.src = fullAvatarUrl;
        privateUserAvatar.style.display = 'block';
        privateUserAvatar.style.visibility = 'visible';
        privateUserInitials.style.display = 'none';
        privateUserInitials.style.visibility = 'hidden';
      } else {
        const initials = sessionStore.currentPrivateChatNickname ? sessionStore.currentPrivateChatNickname.charAt(0).toUpperCase() : 'U';
        privateUserInitials.textContent = initials;
        privateUserInitials.style.display = 'flex';
        privateUserInitials.style.visibility = 'visible';
        privateUserAvatar.style.display = 'none';
        privateUserAvatar.style.visibility = 'hidden';
        privateUserAvatar.src = '';
      }
    }
    
    // 初始化私信聊天界面事件
    initializePrivateChatInterface();

    // 加载私信聊天记录
    loadPrivateChatHistory(sessionStore.currentPrivateChatUserId);
  }

  // 为已有的消息添加图片点击事件
  setTimeout(() => {
    // 初始化所有图片的点击事件，用于放大预览
    initializeImageClickEvents();
  }, 500);
})
</script>