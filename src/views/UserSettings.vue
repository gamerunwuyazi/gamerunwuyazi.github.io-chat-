<template>
  <div class="chat-content" data-content="user-settings">
    <!-- 空白状态 -->
    <div class="empty-chat-state active" id="settingsEmptyState">
      <div class="empty-icon">⚙️</div>
      <h3>选择一个设置项进行配置</h3>
      <p>请从左侧设置列表中选择一个选项，进行个性化配置</p>
    </div>

    <!-- 设置详情容器 -->
    <div class="settings-container" id="settingsContainer" style="display: none;">
      <!-- 修改密码 -->
      <div class="settings-detail" data-setting="change-password" style="display: none;">
        <h2>修改密码</h2>
        <form class="settings-form">
          <div class="form-group">
            <label for="oldPassword">原密码</label>
            <input type="password" id="oldPassword" placeholder="请输入原密码" required>
          </div>
          <div class="form-group">
            <label for="newPassword">新密码</label>
            <input type="password" id="newPassword" placeholder="请输入新密码" required>
          </div>
          <div class="form-group">
            <label for="confirmPassword">确认新密码</label>
            <input type="password" id="confirmPassword" placeholder="请再次输入新密码" required>
          </div>
          <div class="form-group captcha-group">
            <label for="passwordCaptchaCode">验证码</label>
            <div class="captcha-row" style="display: flex; gap: 10px; align-items: center;">
              <input type="text" id="passwordCaptchaCode" placeholder="请输入验证码" required style="flex: 1;">
              <div id="passwordCaptchaContainer" style="display: flex; align-items: center;">
                <img id="passwordCaptchaImage" alt="验证码" style="border: 1px solid #ddd; cursor: pointer; border-radius: 4px;">
              </div>
            </div>
            <input type="hidden" id="passwordCaptchaId">
          </div>
          <div class="form-actions">
            <button type="submit" class="save-btn">保存</button>
            <button type="button" class="cancel-btn">取消</button>
          </div>
        </form>
      </div>

      <!-- 修改昵称 -->
      <div class="settings-detail" data-setting="change-nickname" style="display: none;">
        <h2>修改昵称</h2>
        <form class="settings-form">
          <div class="form-group">
            <label for="newNickname">新昵称</label>
            <input type="text" id="newNickname" name="newNickname" placeholder="请输入新昵称" maxlength="40" required>
          </div>
          <div class="form-actions">
            <button type="submit" class="save-btn">保存</button>
            <button type="button" class="cancel-btn">取消</button>
          </div>
        </form>
      </div>

      <!-- 上传头像 -->
      <div class="settings-detail" data-setting="upload-avatar" style="display: none;">
        <h2>上传头像</h2>
        <div class="avatar-upload-section">
          <div class="avatar-preview" id="avatarPreview">
            <!-- 头像预览将通过JavaScript动态添加 -->
          </div>
          <div class="avatar-upload-buttons">
            <input type="file" id="avatarFileInput" style="display: none;" accept="image/*">
            <button id="selectAvatarButton" class="save-btn">选择图片</button>
            <button id="uploadAvatarButton" class="save-btn" disabled>上传头像</button>
          </div>
        </div>
      </div>

      <!-- 快捷键设置 -->
      <div class="settings-detail" data-setting="shortcut-settings" style="display: none;">
        <h2>快捷键设置</h2>
        <div class="shortcuts-list">
          <div class="shortcut-item">
            <div class="shortcut-name">发送消息</div>
            <div class="shortcut-keys">Enter</div>
          </div>
          <div class="shortcut-item">
            <div class="shortcut-name">换行</div>
            <div class="shortcut-keys">Shift + Enter</div>
          </div>
          <div class="shortcut-item">
            <div class="shortcut-name">切换Markdown工具栏</div>
            <div class="shortcut-keys">Ctrl + M</div>
          </div>
        </div>
      </div>

      <!-- 版本信息 -->
      <div class="settings-detail" data-setting="version-info" style="display: none;">
        <h2>版本信息</h2>
        <div class="version-info">
          <div class="version-item">
            <div class="version-label">当前版本</div>
            <div class="version-value">2.2.5</div>
          </div>
          <div class="version-item">
            <div class="version-label">最后更新</div>
            <div class="version-value">2026.01.28</div>
          </div>
          <div class="version-item">
            <div class="version-label">开发者</div>
            <div class="version-value">gamerunwuyazi</div>
          </div>
        </div>
      </div>

      <!-- 帮助中心 -->
      <div class="settings-detail" data-setting="help-center" style="display: none;">
        <h2>帮助中心</h2>
        <div class="help-content">
          <h3>如何发送消息？</h3>
          <p>在输入框中输入内容，按下Enter键即可发送消息。</p>

          <h3>如何使用Markdown？</h3>
          <p>点击工具栏上的按钮，或手动输入Markdown语法，支持粗体、斜体、代码、链接等。</p>

          <h3>如何创建群组？</h3>
          <p>在群组聊天界面，点击左侧群组列表上方的"+"按钮即可创建新群组。</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
  import {onMounted} from "vue";
  import {initializeSettingsFunctions, initSettingsItemClick} from '@/utils/chat'

  onMounted(() => {
    initializeSettingsFunctions()
    initSettingsItemClick()
  })
</script>

<style src="@/css/index.css"></style>
<style src="@/css/code-highlight.css"></style>