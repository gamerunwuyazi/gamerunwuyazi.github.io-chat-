<template>
  <!-- 群组聊天界面 -->
  <div class="chat-content" data-content="group-chat">
    <!-- 空白状态 -->
    <div class="empty-chat-state active" id="groupEmptyState">
      <div class="empty-icon">👥</div>
      <h3>选择一个群组开始聊天</h3>
      <p>请从左侧群组列表中选择一个群组，开始群聊会话</p>
    </div>

    <!-- 具体群组聊天界面 -->
    <div class="group-chat-interface" id="groupChatInterface" style="display: none;">
      <!-- 群组头部 -->
      <div class="group-header">
        <h2 id="currentGroupName">群组名称</h2>
        <div class="group-actions">
          <button id="groupInfoButton">群组信息</button>
          <button id="leaveGroupButton">退出群组</button>
        </div>
      </div>

      <!-- 群组Markdown工具栏 -->
      <div class="markdown-toolbar group-markdown-toolbar" id="groupMarkdownToolbar" style="display: none;">
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

      <!-- 群组消息列表 -->
      <div id="groupMessageContainer">
        <div class="empty-state">
          <h3>暂无群消息</h3>
          <p>发送第一条消息开始群聊吧!</p>
        </div>
      </div>

      <!-- 群组输入区域 -->
      <div class="input-area">
        <div class="input-container" id="groupInputContainer">
          <textarea id="groupMessageInput" placeholder="输入群组消息..."></textarea>
        </div>
        <div class="input-buttons" id="groupInputButtons">
          <button id="sendGroupMessage">发送</button>
          <button id="groupMoreButton" class="more-button" title="更多功能">
            ⋯ <span class="button-text">更多</span>
          </button>
          <button id="toggleGroupMarkdownToolbar" class="toggle-btn" style="background: #f1f1f1; border: 1px solid #ddd; border-radius: 4px; padding: 5px 10px; font-size: 12px; cursor: pointer; color: #666; transition: all 0.2s; margin-left: 5px;">
            <i class="fas fa-chevron-down"></i> MD
          </button>
        </div>
        <!-- 将more-functions移到input-buttons外面 -->
        <div class="more-functions" id="groupMoreFunctions" style="display: none;">
          <button id="groupImageUploadButton" title="上传图片">
            📷 <span class="button-text">发送图片</span>
          </button>
          <button id="groupFileUploadButton" title="上传文件">
            📤 <span class="button-text">发送文件</span>
          </button>
          <button id="sendGroupCardButtonGroup" title="发送群名片">
            📱 <span class="button-text">发送群名片</span>
          </button>
        </div>
        <input type="file" id="groupImageInput" style="display: none;" accept="image/*">
        <input type="file" id="groupFileInput" style="display: none;">
      </div>

      <!-- 上传进度条 -->
      <div class="upload-progress" id="groupUploadProgress">
        <div class="upload-progress-bar" id="groupUploadProgressBar"></div>
      </div>
    </div>
  </div>
</template>

<style src="@/css/index.css"></style>
<style src="@/css/code-highlight.css"></style>
<script setup>
import {onMounted} from "vue";
import {initializeGroupFunctions, initializeMoreButtons, addGroupButtonListeners, sessionStore, setActiveChat, loadGroupMessages, initializeScrollLoading} from "@/utils/chat";

// 直接应用保存的群组状态，不使用setTimeout
function applySavedGroupState() {
  if (sessionStore.currentGroupId) {
    // console.log('直接应用保存的群组状态:', {
    //   groupId: sessionStore.currentGroupId,
    //   groupName: sessionStore.currentGroupName
    // });
    
    // 设置活动聊天为群组
    setActiveChat('group', sessionStore.currentGroupId);
    
    // 确保群组聊天界面显示
    const groupEmptyState = document.getElementById('groupEmptyState');
    const groupChatInterface = document.getElementById('groupChatInterface');
    const currentGroupNameElement = document.getElementById('currentGroupName');
    if (groupEmptyState) groupEmptyState.style.display = 'none';
    if (groupChatInterface) {
      groupChatInterface.style.display = 'flex';
      groupChatInterface.style.flexDirection = 'column';
    }
    if (currentGroupNameElement) currentGroupNameElement.textContent = sessionStore.currentGroupName;
    
    // 加载群组聊天记录
    loadGroupMessages(sessionStore.currentGroupId, false);
    
    // 执行addGroupButtonListeners函数
    addGroupButtonListeners();
  }
}

onMounted(() => {
  initializeGroupFunctions()
  initializeMoreButtons()

  // 直接应用保存的群组状态
  applySavedGroupState();

  // 确保在组件挂载后再初始化滚动加载更多事件
  initializeScrollLoading();

  // 初始化群组MD工具栏
  const groupMarkdownToolbar = document.getElementById('groupMarkdownToolbar');
  const toggleGroupMarkdownToolbarBtn = document.getElementById('toggleGroupMarkdownToolbar');

  if (toggleGroupMarkdownToolbarBtn && groupMarkdownToolbar) {
    // 默认隐藏工具栏
    groupMarkdownToolbar.style.display = 'none';

    // 绑定点击事件
    toggleGroupMarkdownToolbarBtn.addEventListener('click', function () {
      if (groupMarkdownToolbar.style.display === 'none') {
        // 显示工具栏
        groupMarkdownToolbar.style.display = 'flex';
        this.innerHTML = '<i class="fas fa-chevron-up"></i> 隐藏Markdown工具栏';
      } else {
        // 隐藏工具栏
        groupMarkdownToolbar.style.display = 'none';
        this.innerHTML = '<i class="fas fa-chevron-down"></i> MD';
      }
    });
  }
});
</script>