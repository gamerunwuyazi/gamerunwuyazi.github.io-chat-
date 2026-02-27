<script setup>
import {ref, computed, onMounted, onUnmounted} from "vue";
import {currentUser, currentSessionToken, unescapeHtml} from "@/utils/chat";

const SERVER_URL = process.env.VUE_APP_SERVER_URL || 'https://back.hs.airoe.cn'

// 当前显示的设置项
const currentSetting = ref('')

// 修改密码表单
const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
  captchaCode: '',
  captchaId: ''
})
const passwordMessage = ref('')
const passwordMessageClass = ref('')

// 修改昵称表单
const nicknameForm = ref({
  newNickname: ''
})
const nicknameMessage = ref('')
const nicknameMessageClass = ref('')

// 修改个性签名表单
const signatureForm = ref({
  newSignature: ''
})
const signatureMessage = ref('')
const signatureMessageClass = ref('')

// 头像相关
const avatarPreview = ref('')
const selectedAvatarFile = ref(null)
const avatarMessage = ref('')
const avatarMessageClass = ref('')
const avatarInputRef = ref(null)

// 用户首字母
const userInitials = computed(() => {
  const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
  const nickname = unescapeHtml(user.nickname || '');
  return nickname ? nickname.charAt(0).toUpperCase() : 'U'
})

// 验证码图片
const captchaImage = ref('')

// 获取当前用户ID
function getCurrentUserId() {
  if (currentUser && currentUser.id) {
    return currentUser.id
  }
  const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
  return user.id
}

// 获取当前会话token
function getCurrentSessionToken() {
  if (currentSessionToken) {
    return currentSessionToken
  }
  return localStorage.getItem('currentSessionToken') || localStorage.getItem('sessionToken') || ''
}

// 处理设置项点击
function handleSettingClick(setting) {
  currentSetting.value = setting
  
  if (setting === 'change-password') {
    refreshCaptcha()
  } else if (setting === 'change-nickname') {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
    nicknameForm.value.newNickname = user.nickname || ''
  } else if (setting === 'change-signature') {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
    signatureForm.value.newSignature = user.signature || ''
  } else if (setting === 'upload-avatar') {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
    if (user.avatarUrl) {
      avatarPreview.value = SERVER_URL + user.avatarUrl
    }
  }
}

// 刷新验证码
async function refreshCaptcha() {
  try {
    const userId = getCurrentUserId()
    const response = await fetch(`${SERVER_URL}/captcha`, {
      headers: {
        'user-id': userId
      }
    })
    const contentType = response.headers.get('content-type') || ''
    
    // 检查响应是否是SVG格式
    if (contentType.includes('image/svg') || contentType.includes('svg+xml')) {
      // 直接读取SVG内容
      const svgText = await response.text()
      // 将SVG转换为base64数据URL
      captchaImage.value = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)))
      // 从响应头获取captchaId（如果有的话）
      const captchaId = response.headers.get('captcha-id') || ''
      if (captchaId) {
        passwordForm.value.captchaId = captchaId
      }
    } else {
      // 否则按JSON格式处理
      const data = await response.json()
      if (data.captchaId) {
        passwordForm.value.captchaId = data.captchaId
        // 检查是captchaImage还是captchaSvg
        if (data.captchaImage) {
          captchaImage.value = data.captchaImage
        } else if (data.captchaSvg) {
          // 如果是captchaSvg，也转换为base64
          captchaImage.value = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data.captchaSvg)))
        }
      }
    }
  } catch (error) {
    console.error('获取验证码失败:', error)
  }
}

// 修改密码 - 使用API
async function handleChangePassword() {
  passwordMessage.value = ''
  
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    passwordMessage.value = '两次输入的密码不一致'
    passwordMessageClass.value = 'error'
    return
  }
  
  const userId = getCurrentUserId()
  const sessionToken = getCurrentSessionToken()
  
  if (!userId) {
    passwordMessage.value = '用户未登录'
    passwordMessageClass.value = 'error'
    return
  }
  
  try {
    const response = await fetch(`${SERVER_URL}/user/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': userId,
        'session-token': sessionToken
      },
      body: JSON.stringify({
        oldPassword: passwordForm.value.oldPassword,
        newPassword: passwordForm.value.newPassword,
        captchaId: passwordForm.value.captchaId,
        captchaCode: passwordForm.value.captchaCode
      })
    })
    
    const data = await response.json()
    
    if (data.status === 'success') {
      passwordMessage.value = '密码修改成功'
      passwordMessageClass.value = 'success'
      passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '', captchaCode: '', captchaId: '' }
    } else {
      passwordMessage.value = data.message || '密码修改失败'
      passwordMessageClass.value = 'error'
      refreshCaptcha()
    }
  } catch (error) {
    console.error('修改密码失败:', error)
    passwordMessage.value = '网络错误'
    passwordMessageClass.value = 'error'
  }
}

// 修改昵称 - 使用API
async function handleChangeNickname() {
  nicknameMessage.value = ''
  
  const newNickname = nicknameForm.value.newNickname.trim()
  if (!newNickname) {
    nicknameMessage.value = '昵称不能为空'
    nicknameMessageClass.value = 'error'
    return
  }
  
  const userId = getCurrentUserId()
  const sessionToken = getCurrentSessionToken()
  
  if (!userId) {
    nicknameMessage.value = '用户未登录'
    nicknameMessageClass.value = 'error'
    return
  }
  
  try {
    const response = await fetch(`${SERVER_URL}/user/update-nickname`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': userId,
        'session-token': sessionToken
      },
      body: JSON.stringify({
        newNickname: newNickname
      })
    })
    
    const data = await response.json()
    
    if (data.status === 'success') {
      nicknameMessage.value = '昵称修改成功'
      nicknameMessageClass.value = 'success'
      const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
      user.nickname = newNickname
      localStorage.setItem('currentUser', JSON.stringify(user))
    } else {
      nicknameMessage.value = data.message || '昵称修改失败'
      nicknameMessageClass.value = 'error'
    }
  } catch (error) {
    console.error('修改昵称失败:', error)
    nicknameMessage.value = '网络错误'
    nicknameMessageClass.value = 'error'
  }
}

// 修改个性签名
async function handleChangeSignature() {
  signatureMessage.value = ''
  
  const userId = getCurrentUserId()
  const sessionToken = getCurrentSessionToken()
  
  try {
    const response = await fetch(`${SERVER_URL}/update-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': userId,
        'session-token': sessionToken
      },
      body: JSON.stringify({
        signature: signatureForm.value.newSignature
      })
    })
    const data = await response.json()
    
    if (data.status === 'success') {
      signatureMessage.value = '个性签名修改成功'
      signatureMessageClass.value = 'success'
      const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
      user.signature = signatureForm.value.newSignature
      localStorage.setItem('currentUser', JSON.stringify(user))
    } else {
      signatureMessage.value = data.message || '个性签名修改失败'
      signatureMessageClass.value = 'error'
    }
  } catch (error) {
    signatureMessage.value = '网络错误'
    signatureMessageClass.value = 'error'
  }
}

// 头像上传处理
function handleAvatarChange(event) {
  const file = event.target.files[0]
  if (!file) return
  
  if (!file.type.startsWith('image/')) {
    avatarMessage.value = '请选择图片文件'
    avatarMessageClass.value = 'error'
    return
  }
  
  if (file.size > 2 * 1024 * 1024) {
    avatarMessage.value = '图片大小不能超过2MB'
    avatarMessageClass.value = 'error'
    return
  }
  
  selectedAvatarFile.value = file
  
  const reader = new FileReader()
  reader.onload = (e) => {
    avatarPreview.value = e.target.result
  }
  reader.readAsDataURL(file)
}

function triggerAvatarSelect() {
  const input = document.getElementById('avatarFileInput')
  if (input) {
    input.click()
  }
}

async function handleUploadAvatar() {
  if (!selectedAvatarFile.value) {
    avatarMessage.value = '请先选择图片'
    avatarMessageClass.value = 'error'
    return
  }
  
  const userId = getCurrentUserId()
  const sessionToken = getCurrentSessionToken()
  
  const formData = new FormData()
  formData.append('avatar', selectedAvatarFile.value)
  formData.append('userId', userId)
  
  try {
    const response = await fetch(`${SERVER_URL}/upload-avatar`, {
      method: 'POST',
      headers: {
        'user-id': userId,
        'session-token': sessionToken
      },
      body: formData
    })
    const data = await response.json()
    
    if (data.status === 'success') {
      avatarMessage.value = '头像上传成功'
      avatarMessageClass.value = 'success'
      const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
      user.avatarUrl = data.avatarUrl
      user.avatarVersion = Date.now()
      localStorage.setItem('currentUser', JSON.stringify(user))
      
      if (window.chatStore) {
        window.chatStore.currentUser = user
      }
      window.currentUser = user
      
      selectedAvatarFile.value = null
      avatarPreview.value = ''
      
      window.dispatchEvent(new CustomEvent('user-avatar-updated', { detail: { avatarUrl: data.avatarUrl, avatarVersion: user.avatarVersion } }))
    } else {
      avatarMessage.value = data.message || '头像上传失败'
      avatarMessageClass.value = 'error'
    }
  } catch (error) {
    avatarMessage.value = '网络错误'
    avatarMessageClass.value = 'error'
  }
}

// 监听设置项点击事件
function handleSettingsItemClick(event) {
  const setting = event.detail?.setting
  if (setting) {
    handleSettingClick(setting)
  }
}

onMounted(() => {
  if (window.__currentSetting) {
    handleSettingClick(window.__currentSetting)
    window.__currentSetting = null
  }
  
  window.addEventListener('settings-item-click', handleSettingsItemClick)
})

onUnmounted(() => {
  window.removeEventListener('settings-item-click', handleSettingsItemClick)
})
</script>

<template>
  <div class="chat-content" data-content="user-settings">
    <!-- 空白状态 - 没有选择设置项时显示 -->
    <div v-if="!currentSetting" class="empty-chat-state active">
      <div class="empty-icon">⚙️</div>
      <h3>选择一个设置项进行配置</h3>
      <p>请从左侧设置列表中选择一个选项，进行个性化配置</p>
    </div>

    <!-- 设置详情容器 - 选择设置项后显示 -->
    <div v-if="currentSetting" class="settings-container" style="display: flex; flex-direction: column;">
      <!-- 修改密码 -->
      <div v-if="currentSetting === 'change-password'" class="settings-detail">
        <h2>修改密码</h2>
        <form class="settings-form" @submit.prevent="handleChangePassword">
          <div class="form-group">
            <label for="oldPassword">原密码</label>
            <input type="password" id="oldPassword" v-model="passwordForm.oldPassword" placeholder="请输入原密码" required>
          </div>
          <div class="form-group">
            <label for="newPassword">新密码</label>
            <input type="password" id="newPassword" v-model="passwordForm.newPassword" placeholder="请输入新密码" required>
          </div>
          <div class="form-group">
            <label for="confirmPassword">确认新密码</label>
            <input type="password" id="confirmPassword" v-model="passwordForm.confirmPassword" placeholder="请再次输入新密码" required>
          </div>
          <div class="form-group captcha-group">
            <label for="passwordCaptchaCode">验证码</label>
            <div class="captcha-row" style="display: flex; gap: 10px; align-items: center;">
              <input type="text" id="passwordCaptchaCode" v-model="passwordForm.captchaCode" placeholder="请输入验证码" required style="flex: 1;">
              <div style="display: flex; align-items: center;">
                <img :src="captchaImage" alt="验证码" @click="refreshCaptcha" style="border: 1px solid #ddd; cursor: pointer; border-radius: 4px;">
              </div>
            </div>
            <input type="hidden" id="passwordCaptchaId" v-model="passwordForm.captchaId">
          </div>
          <div v-if="passwordMessage" :class="'form-message ' + passwordMessageClass">{{ passwordMessage }}</div>
          <div class="form-actions">
            <button type="submit" class="save-btn">保存</button>
            <button type="button" class="cancel-btn" @click="currentSetting = ''">取消</button>
          </div>
        </form>
      </div>

      <!-- 修改昵称 -->
      <div v-if="currentSetting === 'change-nickname'" class="settings-detail">
        <h2>修改昵称</h2>
        <form class="settings-form" @submit.prevent="handleChangeNickname">
          <div class="form-group">
            <label for="newNickname">新昵称</label>
            <input type="text" id="newNickname" v-model="nicknameForm.newNickname" placeholder="请输入新昵称" maxlength="40" required>
          </div>
          <div v-if="nicknameMessage" :class="'form-message ' + nicknameMessageClass">{{ nicknameMessage }}</div>
          <div class="form-actions">
            <button type="submit" class="save-btn">保存</button>
            <button type="button" class="cancel-btn" @click="currentSetting = ''">取消</button>
          </div>
        </form>
      </div>

      <!-- 修改个性签名 -->
      <div v-if="currentSetting === 'change-signature'" class="settings-detail">
        <h2>修改个性签名</h2>
        <form class="settings-form" @submit.prevent="handleChangeSignature">
          <div class="form-group">
            <label for="newSignature">个性签名</label>
            <textarea id="newSignature" v-model="signatureForm.newSignature" placeholder="请输入个性签名（最多500字）" maxlength="500" rows="3"></textarea>
          </div>
          <div v-if="signatureMessage" :class="'form-message ' + signatureMessageClass">{{ signatureMessage }}</div>
          <div class="form-actions">
            <button type="submit" class="save-btn">保存</button>
            <button type="button" class="cancel-btn" @click="currentSetting = ''">取消</button>
          </div>
        </form>
      </div>

      <!-- 上传头像 -->
      <div v-if="currentSetting === 'upload-avatar'" class="settings-detail">
        <h2>上传头像</h2>
        <div class="avatar-upload-section">
          <div class="avatar-preview" id="avatarPreview">
            <img v-if="avatarPreview" :src="avatarPreview" alt="头像预览" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover;">
            <span v-else class="user-initials" style="width: 120px; height: 120px; font-size: 48px;">{{ userInitials }}</span>
          </div>
          <div class="avatar-upload-buttons">
            <input type="file" ref="avatarInputRef" id="avatarFileInput" style="display: none;" accept="image/*" @change="handleAvatarChange">
            <button id="selectAvatarButton" class="save-btn" @click="triggerAvatarSelect">选择图片</button>
            <button id="uploadAvatarButton" class="save-btn" :disabled="!selectedAvatarFile" @click="handleUploadAvatar">上传头像</button>
          </div>
          <div v-if="avatarMessage" :class="'form-message ' + avatarMessageClass">{{ avatarMessage }}</div>
        </div>
      </div>

      <!-- 快捷键设置 -->
      <div v-if="currentSetting === 'shortcut-settings'" class="settings-detail">
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
        <div class="form-actions" style="margin-top: 20px;">
          <button type="button" class="cancel-btn" @click="currentSetting = ''">返回</button>
        </div>
      </div>

      <!-- 版本信息 -->
      <div v-if="currentSetting === 'version-info'" class="settings-detail">
        <h2>版本信息</h2>
        <div class="version-info">
          <div class="version-item">
            <div class="version-label">当前版本</div>
            <div class="version-value">2.3.1</div>
          </div>
          <div class="version-item">
            <div class="version-label">最后更新</div>
            <div class="version-value">2026.02.22</div>
          </div>
          <div class="version-item">
            <div class="version-label">开发者</div>
            <div class="version-value">gamerunwuyazi</div>
          </div>
        </div>
        <div class="form-actions" style="margin-top: 20px;">
          <button type="button" class="cancel-btn" @click="currentSetting = ''">返回</button>
        </div>
      </div>

      <!-- 帮助中心 -->
      <div v-if="currentSetting === 'help-center'" class="settings-detail">
        <h2>帮助中心</h2>
        <div class="help-content">
          <h3>如何发送消息？</h3>
          <p>在输入框中输入内容，按下Enter键即可发送消息。</p>

          <h3>如何使用Markdown？</h3>
          <p>点击工具栏上的按钮，或手动输入Markdown语法，支持粗体、斜体、代码、链接等。</p>

          <h3>如何创建群组？</h3>
          <p>在群组聊天界面，点击左侧群组列表上方的"+"按钮即可创建新群组。</p>
        </div>
        <div class="form-actions" style="margin-top: 20px;">
          <button type="button" class="cancel-btn" @click="currentSetting = ''">返回</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style src="@/css/index.css"></style>
<style src="@/css/code-highlight.css"></style>
