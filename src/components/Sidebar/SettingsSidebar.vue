<script setup>
/* eslint-disable vue/multi-word-component-names */
import { onMounted } from 'vue';
import { useChatStore } from '@/stores/chatStore';

const chatStore = useChatStore();

onMounted(() => {
  window.chatStore = chatStore;
});

// 处理设置项点击
function handleSettingItemClick(settingId) {
  // 设置全局变量供UserSettings监听
  window.__currentSetting = settingId;
  
  // 同时派发事件
  window.dispatchEvent(new CustomEvent('settings-item-click', {
    detail: { setting: settingId }
  }));
}
</script>

<template>
  <div id="secondary-sidebar">
    <div class="secondary-content" data-content="user-settings">
        <div class="sidebar-section">
            <h3>账户设置</h3>
            <ul class="settings-list">
                <li class="settings-item" data-setting-id="change-password" @click="handleSettingItemClick('change-password')">修改密码</li>
                <li class="settings-item" data-setting-id="change-nickname" @click="handleSettingItemClick('change-nickname')">修改昵称</li>
                <li class="settings-item" data-setting-id="change-signature" @click="handleSettingItemClick('change-signature')">个性签名</li>
                <li class="settings-item" data-setting-id="upload-avatar" @click="handleSettingItemClick('upload-avatar')">上传头像</li>
            </ul>
        </div>
        
        <div class="sidebar-section">
            <h3>聊天设置</h3>
            <ul class="settings-list">
                <li class="settings-item" style="color: #999;">主题设置 <span style="color: #ff6b6b;">(未实现)</span></li>
                <li class="settings-item" data-setting-id="shortcut-settings" @click="handleSettingItemClick('shortcut-settings')">快捷键</li>
            </ul>
        </div>
        
        <div class="sidebar-section">
            <h3>关于</h3>
            <ul class="settings-list">
                <li class="settings-item" data-setting-id="version-info" @click="handleSettingItemClick('version-info')">版本信息</li>
                <li class="settings-item" data-setting-id="help-center" @click="handleSettingItemClick('help-center')">帮助中心</li>
            </ul>
        </div>
    </div>
  </div>
</template>

<style src="@/css/index.css"></style>
<style src="@/css/code-highlight.css"></style>
