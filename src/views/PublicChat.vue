<template>
  <!-- Markdown工具栏 -->
  <div class="markdown-toolbar" id="markdownToolbar">
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

  <!-- 公共聊天界面 -->
  <div class="chat-content active" data-content="public-chat">
    <!-- 消息列表 -->
    <div id="messageContainer">
      <div class="empty-state" id="emptyState">
        <h3>暂无消息</h3>
        <p>发送第一条消息开始聊天吧!</p>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <div class="input-container" id="mainInputContainer">
        <div id="messageInput" class="editable-div" placeholder="发送消息（Ctrl+Enter或Shift+Enter换行  支持Markdown语法）" contenteditable="true"></div>
      </div>
      <div class="input-buttons" id="mainInputButtons">
        <button id="sendButton">发送</button>
        <button id="moreButton" class="more-button" title="更多功能">
          ⋯ <span class="button-text">更多</span>
        </button>
        <button id="toggleMarkdownToolbar" class="toggle-btn" style="background: #f1f1f1; border: 1px solid #ddd; border-radius: 4px; padding: 5px 10px; font-size: 12px; cursor: pointer; color: #666; transition: all 0.2s; margin-left: 5px;">
          <i class="fas fa-chevron-down"></i> MD
        </button>
      </div>
      <!-- 将more-functions移到input-buttons外面 -->
      <div class="more-functions" id="mainMoreFunctions" style="display: none;">
        <button id="imageUploadButton" title="上传图片">
          📷 <span class="button-text">发送图片</span>
        </button>
        <button id="fileUploadButton" title="上传文件">
          📤 <span class="button-text">发送文件</span>
        </button>
        <button id="sendGroupCardButton" title="发送群名片">
          📱 <span class="button-text">发送群名片</span>
        </button>
      </div>
      <input type="file" id="imageInput" style="display: none;" accept="image/*">
      <input type="file" id="fileInput" style="display: none;">
    </div>

    <!-- 上传进度条 -->
    <div class="upload-progress" id="uploadProgress">
      <div class="upload-progress-bar" id="uploadProgressBar"></div>
    </div>
  </div>
</template>

<style src="@/css/index.css"></style>
<style src="@/css/code-highlight.css"></style>

<script setup>
import {onMounted} from "vue";
import {saveChatHistory, initializeMessageSending, initializeMoreButtons, initializeScrollLoading, addWithdrawButtonListener, addAvatarClickListenersToAllMessages, addGroupCardClickListeners, initializeImageClickEvents} from "@/utils/chat";

onMounted(() => {
  saveChatHistory('pull')
  initializeMessageSending()
  initializeMoreButtons()
  initializeScrollLoading()

  // 为已有的消息添加撤回按钮事件监听器
  setTimeout(() => {
    const messageElements = document.querySelectorAll('.message');
    messageElements.forEach(element => {
      if (element.querySelector('.delete-button')) {
        addWithdrawButtonListener(element);
      }
    });
    
    // 为所有消息的用户头像添加点击事件
    addAvatarClickListenersToAllMessages();
    
    // 为所有群名片添加点击事件
    addGroupCardClickListeners();
    
    // 初始化所有图片的点击事件，用于放大预览
    initializeImageClickEvents();
  }, 500);
})
</script>