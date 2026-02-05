<script setup>
/* eslint-disable vue/multi-word-component-names */
import { computed } from 'vue';

// 计算属性：根据当前哈希路径确定应该激活的二级侧边栏
const activeSecondarySidebar = computed(() => {
  const hash = window.location.hash;
  if (hash === '#/chat') {
    return 'public-chat';
  } else if (hash === '#/chat/group') {
    return 'group-chat';
  } else if (hash === '#/chat/private') {
    return 'private-chat';
  } else if (hash === '#/settings') {
    return 'user-settings';
  } else {
    return 'public-chat';
  }
});
</script>

<template>
  <div id="secondary-sidebar">
    <!-- 公共聊天二层侧边栏 -->
    <div :class="['secondary-content', { active: activeSecondarySidebar === 'public-chat' }]" data-content="public-chat">
        <div class="sidebar-section">
            <h3>在线用户 <span id="onlineCount">(0)</span></h3>
            <ul class="user-list" id="userList">
                <li>暂无在线用户</li>
            </ul>
        </div>
        
        <div class="sidebar-section">
            <div class="section-header">
                <h3>离线用户</h3>
            </div>
            <ul class="user-list" id="offlineUserList">
                <li>暂无离线用户</li>
            </ul>
        </div>
    </div>
    
    <!-- 群组聊天二层侧边栏 -->
    <div :class="['secondary-content', { active: activeSecondarySidebar === 'group-chat' }]" data-content="group-chat">
        <div class="sidebar-section">
            <div class="section-header">
                <div class="search-container">
                    <input type="text" id="groupSearchInput" placeholder="搜索群组..." class="search-input">
                    <button id="clearGroupSearch" class="clear-search-btn" style="display: none;">×</button>
                    <button id="createGroupButton" class="create-group-btn" title="创建群组">+</button>
                </div>
            </div>
            <ul class="user-list" id="groupList">
                <li class="loading-item">
                    <span class="loading-text">正在加载群组列表...</span>
                </li>
            </ul>
        </div>
    </div>
    
    <!-- 私信聊天二层侧边栏 -->
    <div :class="['secondary-content', { active: activeSecondarySidebar === 'private-chat' }]" data-content="private-chat">
        <div class="sidebar-section">
            <div class="section-header">
                <div class="search-container">
                    <input type="text" id="privateChatSearchInput" placeholder="搜索好友..." class="search-input">
                    <button id="clearPrivateChatSearch" class="clear-search-btn" style="display: none;">×</button>
                    <button id="searchUserButton" class="create-group-btn" style="background-color: #3498db;" title="搜索用户">+</button>
                </div>
            </div>
            <ul class="user-list" id="friendsList">
                <li class="empty-friends">暂无好友，请先添加好友</li>
            </ul>
        </div>
    </div>
    
    <!-- 用户设置二层侧边栏 -->
    <div :class="['secondary-content', { active: activeSecondarySidebar === 'user-settings' }]" data-content="user-settings">
        <div class="sidebar-section">
            <h3>账户设置</h3>
            <ul class="settings-list">
                <li class="settings-item" data-setting-id="change-password">修改密码</li>
                <li class="settings-item" data-setting-id="change-nickname">修改昵称</li>
                <li class="settings-item" data-setting-id="upload-avatar">上传头像</li>
            </ul>
        </div>
        
        <div class="sidebar-section">
            <h3>聊天设置</h3>
            <ul class="settings-list">
                <li class="settings-item" data-setting-id="theme-settings" style="color: #999;">主题设置 <span style="color: #ff6b6b;">(未实现)</span></li>
                <li class="settings-item" data-setting-id="shortcut-settings">快捷键</li>
            </ul>
        </div>
        
        <div class="sidebar-section">
            <h3>关于</h3>
            <ul class="settings-list">
                <li class="settings-item" data-setting-id="version-info">版本信息</li>
                <li class="settings-item" data-setting-id="help-center">帮助中心</li>
            </ul>
        </div>
    </div>
</div>
</template>

<style src="@/css/index.css"></style>
<style src="@/css/code-highlight.css"></style>