<script setup>
import {ref, computed, onMounted, onUnmounted} from "vue";
import VueTurnstile from 'vue-turnstile';

import {useBaseStore} from "@/stores/baseStore";
import {useStorageStore} from "@/stores/storageStore";
import {useUnreadStore} from "@/stores/unreadStore";
import {currentSessionToken} from "@/utils/chat";
import modal from "@/utils/modal";

const baseStore = useBaseStore();
const storageStore = useStorageStore();
const unreadStore = useUnreadStore();
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://back.hs.airoe.cn'
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''

const currentUser = computed(() => baseStore.currentUser);

const currentSetting = ref('')

const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const passwordMessage = ref('')
const passwordMessageClass = ref('')

const turnstileRef = ref(null)
const turnstileToken = ref('')

const isPasswordFormValid = computed(() => {
  const oldPasswordValid = !!passwordForm.value.oldPassword && String(passwordForm.value.oldPassword).trim().length > 0;
  const newPasswordValid = !!passwordForm.value.newPassword && String(passwordForm.value.newPassword).trim().length >= 6;
  const confirmPasswordValid = !!passwordForm.value.confirmPassword && String(passwordForm.value.confirmPassword).trim().length >= 6 && passwordForm.value.newPassword === passwordForm.value.confirmPassword;
  const turnstileValid = !!turnstileToken.value && String(turnstileToken.value).length > 0;
  return oldPasswordValid && newPasswordValid && confirmPasswordValid && turnstileValid;
})

const nicknameForm = ref({
  newNickname: ''
})
const nicknameMessage = ref('')
const nicknameMessageClass = ref('')

const signatureForm = ref({
  newSignature: ''
})
const signatureMessage = ref('')
const signatureMessageClass = ref('')

const genderForm = ref({
  newGender: '0'
})
const genderMessage = ref('')
const genderMessageClass = ref('')

const avatarPreview = ref('')
const selectedAvatarFile = ref(null)
const avatarMessage = ref('')
const avatarMessageClass = ref('')
const avatarInputRef = ref(null)
const avatarLoadFailed = ref(false)

const friendVerificationEnabled = ref(false)
const friendRequestMessage = ref('')
const friendRequestMessageClass = ref('')

const receivedFriendRequestsFromStore = computed(() => baseStore.receivedFriendRequests || [])
const sentFriendRequestsFromStore = computed(() => baseStore.sentFriendRequests || [])

const userInitials = computed(() => {
  const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
  const nickname = user.nickname || '';
  return nickname ? nickname.charAt(0).toUpperCase() : 'U'
})

function isSvgAvatar(url) {
  return url && /\.svg$/i.test(url);
}

function getCurrentUserId() {
  return currentUser.value?.id || baseStore.currentUser?.id
}

function getCurrentSessionToken() {
  if (currentSessionToken) {
    return currentSessionToken
  }
  return localStorage.getItem('currentSessionToken') || ''
}

function resetTurnstile() {
  if (turnstileRef.value) {
    turnstileToken.value = ''
    turnstileRef.value.reset()
  }
}

function handleSettingClick(setting) {
  currentSetting.value = setting
  
  if (setting === 'change-nickname') {
    nicknameForm.value.newNickname = currentUser.value?.nickname || ''
  } else if (setting === 'change-gender') {
    genderForm.value.newGender = String(currentUser.value?.gender || 0)
  } else if (setting === 'change-signature') {
    signatureForm.value.newSignature = currentUser.value?.signature || ''
  } else if (setting === 'upload-avatar') {
    avatarLoadFailed.value = false
    if (currentUser.value?.avatar_url) {
      avatarPreview.value = SERVER_URL + currentUser.value.avatar_url
    }
  } else if (setting === 'friend-verification') {
    friendVerificationEnabled.value = baseStore.friendVerification
  }
}

async function handleChangePassword() {
  passwordMessage.value = ''
  
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    passwordMessage.value = '两次输入的密码不一致'
    passwordMessageClass.value = 'error'
    return
  }

  if (!turnstileToken.value) {
    passwordMessage.value = '请完成人机验证'
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
    const response = await fetch(`${SERVER_URL}/api/user/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': userId,
        'session-token': sessionToken
      },
      body: JSON.stringify({
        oldPassword: passwordForm.value.oldPassword,
        newPassword: passwordForm.value.newPassword,
        turnstileToken: turnstileToken.value
      })
    })
    
    const data = await response.json()
    
    if (data.status === 'success') {
      passwordMessage.value = '密码修改成功'
      passwordMessageClass.value = 'success'
      passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
      resetTurnstile()
    } else {
      passwordMessage.value = data.message || '密码修改失败'
      passwordMessageClass.value = 'error'
      resetTurnstile()
    }
  } catch (error) {
    console.error('修改密码失败:', error)
    passwordMessage.value = '网络错误'
    passwordMessageClass.value = 'error'
    resetTurnstile()
  }
}

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
    const response = await fetch(`${SERVER_URL}/api/user/update-nickname`, {
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

async function handleChangeSignature() {
  signatureMessage.value = ''
  
  const userId = getCurrentUserId()
  const sessionToken = getCurrentSessionToken()
  
  try {
    const response = await fetch(`${SERVER_URL}/api/update-signature`, {
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

async function handleChangeGender() {
  genderMessage.value = ''
  
  const userId = getCurrentUserId()
  const sessionToken = getCurrentSessionToken()
  
  try {
    const response = await fetch(`${SERVER_URL}/api/update-gender`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': userId,
        'session-token': sessionToken
      },
      body: JSON.stringify({
        gender: parseInt(genderForm.value.newGender)
      })
    })
    const data = await response.json()
    
    if (data.status === 'success') {
      genderMessage.value = '性别修改成功'
      genderMessageClass.value = 'success'
      if (baseStore.currentUser) {
        baseStore.currentUser.gender = parseInt(genderForm.value.newGender)
      }
    } else {
      genderMessage.value = data.message || '性别修改失败'
      genderMessageClass.value = 'error'
    }
  } catch (error) {
    genderMessage.value = '网络错误'
    genderMessageClass.value = 'error'
  }
}

function handleAvatarPreviewError() {
  avatarLoadFailed.value = true
  avatarPreview.value = ''
}

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

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`

  return date.toLocaleDateString('zh-CN')
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
    const response = await fetch(`${SERVER_URL}/api/upload-avatar`, {
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
      
      baseStore.setCurrentUser(user)
      
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

function handleSettingsItemClick(event) {
  const setting = event.detail?.setting
  if (setting) {
    handleSettingClick(setting)
  }
}

async function handleClearUnreadCounts() {
  const confirmed = await modal.confirm('确定要清除全部未读计数吗？\n这将清除所有会话的未读消息计数。', '确认清除')
  if (!confirmed) {
    return
  }

  try {
    unreadStore.clearAllUnreadCounts()
    await modal.success('未读计数已成功清除！', '成功')
  } catch (error) {
    console.error('清除未读计数失败:', error)
    await modal.error('清除未读计数失败，请稍后重试', '错误')
  }
}

async function handleToggleFriendVerification() {
  friendRequestMessage.value = ''
  const result = await baseStore.setFriendVerification(friendVerificationEnabled.value)

  if (result.success) {
    friendRequestMessage.value = result.message
    friendRequestMessageClass.value = 'success'
  } else {
    friendRequestMessage.value = result.message
    friendRequestMessageClass.value = 'error'
    friendVerificationEnabled.value = !friendVerificationEnabled.value
  }
}

async function handleAcceptFriendRequest(requesterId) {
  friendRequestMessage.value = ''
  const userId = getCurrentUserId()
  const sessionToken = getCurrentSessionToken()

  try {
    const response = await fetch(`${SERVER_URL}/api/user/accept-friend-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': userId,
        'session-token': sessionToken
      },
      body: JSON.stringify({ requesterId })
    })

    const data = await response.json()

    if (data.status === 'success') {
      friendRequestMessage.value = '已接受好友请求'
      friendRequestMessageClass.value = 'success'
      await baseStore.loadFriendRequests()
    } else {
      friendRequestMessage.value = data.message || '接受好友请求失败'
      friendRequestMessageClass.value = 'error'
    }
  } catch (error) {
    console.error('接受好友请求失败:', error)
    friendRequestMessage.value = '网络错误'
    friendRequestMessageClass.value = 'error'
  }
}

async function handleRejectFriendRequest(requesterId) {
  friendRequestMessage.value = ''
  const userId = getCurrentUserId()
  const sessionToken = getCurrentSessionToken()

  try {
    const response = await fetch(`${SERVER_URL}/api/user/reject-friend-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': userId,
        'session-token': sessionToken
      },
      body: JSON.stringify({ requesterId })
    })

    const data = await response.json()

    if (data.status === 'success') {
      friendRequestMessage.value = '已拒绝好友请求'
      friendRequestMessageClass.value = 'success'
      await baseStore.loadFriendRequests()
    } else {
      friendRequestMessage.value = data.message || '拒绝好友请求失败'
      friendRequestMessageClass.value = 'error'
    }
  } catch (error) {
    console.error('拒绝好友请求失败:', error)
    friendRequestMessage.value = '网络错误'
    friendRequestMessageClass.value = 'error'
  }
}

async function handleCancelFriendRequest(friendId) {
  friendRequestMessage.value = ''
  const userId = getCurrentUserId()
  const sessionToken = getCurrentSessionToken()

  try {
    const response = await fetch(`${SERVER_URL}/api/user/cancel-friend-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-id': userId,
        'session-token': sessionToken
      },
      body: JSON.stringify({ friendId })
    })

    const data = await response.json()

    if (data.status === 'success') {
      friendRequestMessage.value = '已撤销好友请求'
      friendRequestMessageClass.value = 'success'
      await baseStore.loadFriendRequests()
    } else {
      friendRequestMessage.value = data.message || '撤销好友请求失败'
      friendRequestMessageClass.value = 'error'
    }
  } catch (error) {
    console.error('撤销好友请求失败:', error)
    friendRequestMessage.value = '网络错误'
    friendRequestMessageClass.value = 'error'
  }
}

onMounted(() => {
  window.addEventListener('settings-item-click', handleSettingsItemClick)
})

onUnmounted(() => {
  window.removeEventListener('settings-item-click', handleSettingsItemClick)
})
</script>

<template>
  <div class="chat-content" data-content="user-settings">
    <div v-if="!currentSetting" class="empty-chat-state active">
      <h3>选择一个设置项进行配置</h3>
      <p>请从左侧设置列表中选择一个选项，进行个性化配置</p>
    </div>

    <div v-else class="settings-container" style="display: flex; flex-direction: column;">
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
          <div class="form-group">
            <label>人机验证</label>
            <div class="turnstile-container">
              <VueTurnstile 
                ref="turnstileRef"
                :site-key="TURNSTILE_SITE_KEY"
                v-model="turnstileToken"
                theme="light"
              />
            </div>
          </div>
          <div v-if="passwordMessage" :class="'form-message ' + passwordMessageClass">{{ passwordMessage }}</div>
          <div class="form-actions">
            <button type="submit" class="save-btn" :disabled="!isPasswordFormValid">保存</button>
            <button type="button" class="cancel-btn" @click="currentSetting = ''">取消</button>
          </div>
        </form>
      </div>

      <div v-if="currentSetting === 'change-nickname'" class="settings-detail">
        <h2>修改昵称</h2>
        <form class="settings-form" @submit.prevent="handleChangeNickname">
          <div class="form-group">
            <label for="newNickname">新昵称</label>
            <input type="text" id="newNickname" v-model="nicknameForm.newNickname" placeholder="请输入新昵称" required>
          </div>
          <div v-if="nicknameMessage" :class="'form-message ' + nicknameMessageClass">{{ nicknameMessage }}</div>
          <div class="form-actions">
            <button type="submit" class="save-btn">保存</button>
            <button type="button" class="cancel-btn" @click="currentSetting = ''">取消</button>
          </div>
        </form>
      </div>

      <div v-if="currentSetting === 'change-gender'" class="settings-detail">
        <h2>性别设置</h2>
        <form class="settings-form" @submit.prevent="handleChangeGender">
          <div class="form-group">
            <label>选择性别</label>
            <div class="gender-options" style="display: flex; gap: 20px; margin-top: 10px;">
              <label class="gender-option" style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="radio" name="gender" value="0" v-model="genderForm.newGender" style="width: auto; margin: 0;">
                <span>保密</span>
              </label>
              <label class="gender-option" style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="radio" name="gender" value="1" v-model="genderForm.newGender" style="width: auto; margin: 0;">
                <span>男</span>
              </label>
              <label class="gender-option" style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="radio" name="gender" value="2" v-model="genderForm.newGender" style="width: auto; margin: 0;">
                <span>女</span>
              </label>
            </div>
          </div>
          <div v-if="genderMessage" :class="'form-message ' + genderMessageClass">{{ genderMessage }}</div>
          <div class="form-actions">
            <button type="submit" class="save-btn">保存</button>
            <button type="button" class="cancel-btn" @click="currentSetting = ''">取消</button>
          </div>
        </form>
      </div>

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

      <div v-if="currentSetting === 'upload-avatar'" class="settings-detail">
        <h2>上传头像</h2>
        <div class="avatar-upload-section">
          <div class="avatar-preview" id="avatarPreview">
            <img v-if="avatarPreview && avatarPreview !== '' && !isSvgAvatar(avatarPreview)" :src="avatarPreview" alt="头像预览" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover;" @error="handleAvatarPreviewError">
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

      <div v-if="currentSetting === 'clear-unread-counts'" class="settings-detail">
        <h2>清除未读计数</h2>
        <div style="margin-bottom: 20px;">
          <p>此操作将清除所有会话的未读消息计数。</p>
        </div>
        <div class="form-actions">
          <button type="button" class="save-btn" style="background: #3498db;" @click="handleClearUnreadCounts">清除未读计数</button>
          <button type="button" class="cancel-btn" @click="currentSetting = ''">取消</button>
        </div>
      </div>

      <div v-if="currentSetting === 'version-info'" class="settings-detail">
        <h2>版本信息</h2>
        <div class="version-info">
          <div class="version-item">
            <div class="version-label">当前版本</div>
            <div class="version-value">26.5.3</div>
          </div>
          <div class="version-item">
            <div class="version-label">最后更新</div>
            <div class="version-value">2026.5.3</div>
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

      <div v-if="currentSetting === 'help-center'" class="settings-detail">
        <h2>帮助中心</h2>
        <div class="help-content">
          <h3>如何发送消息？</h3>
          <p>在输入框中输入内容，按下Enter键即可发送消息。</p>

          <h3>如何使用Markdown？</h3>
          <p>打开工具栏后点击工具栏上的按钮，或手动输入Markdown语法，支持粗体、斜体、代码、链接等。</p>

          <h3>如何创建群组？</h3>
          <p>在群组聊天界面，点击左侧群组列表上方的"+"按钮即可创建新群组。</p>
        </div>
        <div class="form-actions" style="margin-top: 20px;">
          <button type="button" class="cancel-btn" @click="currentSetting = ''">返回</button>
        </div>
      </div>

      <div v-if="currentSetting === 'friend-verification'" class="settings-detail">
        <h2>{{ friendVerificationEnabled ? '好友申请' : '好友验证' }}</h2>

        <div class="friend-verification-section">
          <div class="verification-toggle">
            <label class="toggle-label">
              <span>加我为好友时需要验证</span>
              <label class="switch">
                <input type="checkbox" v-model="friendVerificationEnabled" @change="handleToggleFriendVerification">
                <span class="slider round"></span>
              </label>
            </label>
            <p class="toggle-description">
              {{ friendVerificationEnabled ? '开启后，他人添加你为好友时需要经过你的同意' : '关闭后，他人可以直接添加你为好友' }}
            </p>
          </div>

          <div v-if="!friendVerificationEnabled" class="requests-section">
            <h3>发送的好友申请（等待对方接受）</h3>
            <div v-if="sentFriendRequestsFromStore.length === 0" class="empty-requests">
              <p>暂无发送的好友申请</p>
            </div>
            <div v-else class="requests-list">
              <div v-for="request in sentFriendRequestsFromStore" :key="request.id" class="request-item pending">
                <div class="request-user-info">
                  <img v-if="request.avatar_url" :src="SERVER_URL + request.avatar_url" alt="头像" class="request-avatar">
                  <div v-else class="request-avatar-placeholder">{{ request.nickname?.charAt(0)?.toUpperCase() || 'U' }}</div>
                  <div class="request-details">
                    <div class="request-nickname">{{ request.nickname || request.username }}</div>
                    <div class="request-time">等待对方接受 · {{ formatTime(request.created_at) }}</div>
                  </div>
                </div>
                <div class="request-actions">
                  <button class="cancel-btn-small" @click="handleCancelFriendRequest(request.id)">撤销</button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="friendVerificationEnabled" class="friend-requests-container">
            <div class="requests-section">
              <h3>收到的好友申请（等待我接受）</h3>
              <div v-if="receivedFriendRequestsFromStore.length === 0" class="empty-requests">
                <p>暂无收到的好友申请</p>
              </div>
              <div v-else class="requests-list">
                <div v-for="request in receivedFriendRequestsFromStore" :key="request.id" class="request-item">
                  <div class="request-user-info">
                    <img v-if="request.avatar_url" :src="SERVER_URL + request.avatar_url" alt="头像" class="request-avatar">
                    <div v-else class="request-avatar-placeholder">{{ request.nickname?.charAt(0)?.toUpperCase() || 'U' }}</div>
                    <div class="request-details">
                      <div class="request-nickname">{{ request.nickname || request.username }}</div>
                      <div class="request-time">{{ formatTime(request.created_at) }}</div>
                    </div>
                  </div>
                  <div class="request-actions">
                    <button class="accept-btn" @click="handleAcceptFriendRequest(request.id)">接受</button>
                    <button class="reject-btn" @click="handleRejectFriendRequest(request.id)">拒绝</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="requests-section" style="margin-top: 30px;">
              <h3>发送的好友申请（等待对方接受）</h3>
              <div v-if="sentFriendRequestsFromStore.length === 0" class="empty-requests">
                <p>暂无发送的好友申请</p>
              </div>
              <div v-else class="requests-list">
                <div v-for="request in sentFriendRequestsFromStore" :key="request.id" class="request-item pending">
                  <div class="request-user-info">
                    <img v-if="request.avatar_url" :src="SERVER_URL + request.avatar_url" alt="头像" class="request-avatar">
                    <div v-else class="request-avatar-placeholder">{{ request.nickname?.charAt(0)?.toUpperCase() || 'U' }}</div>
                    <div class="request-details">
                      <div class="request-nickname">{{ request.nickname || request.username }}</div>
                      <div class="request-time">等待对方接受 · {{ formatTime(request.created_at) }}</div>
                    </div>
                  </div>
                  <div class="request-actions">
                    <button class="cancel-btn-small" @click="handleCancelFriendRequest(request.id)">撤销</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="friendRequestMessage" :class="'form-message ' + friendRequestMessageClass" style="margin-top: 15px;">
            {{ friendRequestMessage }}
          </div>

          <div class="form-actions" style="margin-top: 20px;">
            <button type="button" class="cancel-btn" @click="currentSetting = ''">返回</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.turnstile-container {
  display: flex;
  justify-content: flex-start;
  margin-top: 8px;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #ccc;
}

.friend-verification-section {
  padding: 10px 0;
}

.verification-toggle {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.toggle-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 10px;
}

.switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 24px;
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
}

.slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: .4s;
}

input:checked + .slider {
  background-color: #2196F3;
}

input:checked + .slider:before {
  transform: translateX(26px);
}

.slider.round {
  border-radius: 24px;
}

.slider.round:before {
  border-radius: 50%;
}

.toggle-description {
  color: #666;
  font-size: 14px;
  margin: 0;
  padding-left: 0;
}

.friend-requests-container {
  margin-top: 20px;
}

.requests-section h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 15px;
  color: #333;
}

.empty-requests {
  text-align: center;
  padding: 30px;
  color: #999;
  background: #f8f9fa;
  border-radius: 8px;
}

.requests-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.request-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  transition: all 0.2s;
}

.request-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border-color: #2196F3;
}

.request-user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.request-avatar {
  width: 45px;
  height: 45px;
  border-radius: 50%;
  object-fit: cover;
}

.request-avatar-placeholder {
  width: 45px;
  height: 45px;
  border-radius: 50%;
  background-color: #3498db;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 18px;
  font-weight: 500;
}

.request-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.request-nickname {
  font-size: 15px;
  font-weight: 500;
  color: #333;
}

.request-time {
  font-size: 13px;
  color: #999;
}

.request-actions {
  display: flex;
  gap: 8px;
}

.accept-btn,
.reject-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 5px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.accept-btn {
  background: #4CAF50;
  color: white;
}

.accept-btn:hover {
  background: #45a049;
}

.reject-btn {
  background: #f44336;
  color: white;
}

.reject-btn:hover {
  background: #da190b;
}

.cancel-btn-small {
  padding: 6px 16px;
  border: none;
  border-radius: 5px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
  background: #ff9800;
  color: white;
}

.cancel-btn-small:hover {
  background: #f57c00;
}

.request-status {
  color: #ff9800;
  font-size: 14px;
  font-weight: 500;
}

.loading-state {
  text-align: center;
  padding: 40px;
  color: #666;
}
</style>
