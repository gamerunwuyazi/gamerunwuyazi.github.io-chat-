<script setup>
import { onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import {saveChatHistory} from "@/utils/chat";

const router = useRouter();

// 计算属性：根据当前哈希路径确定应该激活的菜单项
const activeMenuItem = computed(() => {
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

// 初始化必要的变量
let unreadMessages = { global: 0, groups: {}, private: {} }; // 未读消息计数
let originalTitle = document.title; // 保存原始标题

onMounted(() => {
  // 初始化侧边栏切换功能
  initSidebarToggle();
  // 加载用户头像
  updateUserAvatar();
});

// 更新用户头像显示
function updateUserAvatar() {
  const currentUserAvatar = document.getElementById('currentUserAvatar');
  const userInitials = document.getElementById('userInitials');

  if (!currentUserAvatar || !userInitials) return;

  // 尝试从多个来源获取用户信息
  let currentUser = null;
  
  // 先尝试从localStorage获取currentUser
  const currentUserStr = localStorage.getItem('currentUser');
  if (currentUserStr) {
    try {
      currentUser = JSON.parse(currentUserStr);
    } catch (error) {
      console.warn('解析currentUser失败，尝试从其他localStorage项获取');
    }
  }
  
  // 如果没有获取到，尝试从其他localStorage项获取
  if (!currentUser) {
    const userId = localStorage.getItem('chatUserId');
    const nickname = localStorage.getItem('chatUserNickname');
    const avatarUrl = localStorage.getItem('chatUserAvatar');
    
    if (userId) {
      currentUser = {
        id: userId,
        nickname: nickname,
        avatarUrl: avatarUrl
      };
    }
  }
  
  // 如果还是没有获取到，尝试从userId、nickname等获取
  if (!currentUser) {
    const userId = localStorage.getItem('userId');
    const nickname = localStorage.getItem('nickname');
    const avatarUrl = localStorage.getItem('avatarUrl');
    
    if (userId) {
      currentUser = {
        id: userId,
        nickname: nickname,
        avatarUrl: avatarUrl
      };
    }
  }
  
  // 如果仍然没有获取到用户信息，返回
  if (!currentUser) return;

  // 获取用户头像URL，支持多种格式
  let avatarUrl = '';
  if (currentUser.avatar && typeof currentUser.avatar === 'string') {
    avatarUrl = currentUser.avatar.trim();
  } else if (currentUser.avatarUrl && typeof currentUser.avatarUrl === 'string') {
    avatarUrl = currentUser.avatarUrl.trim();
  }

  // 检查头像URL是否为SVG格式，如果是则使用默认头像，防止SVG XSS攻击
  const isSvgAvatar = avatarUrl && /\.svg$/i.test(avatarUrl);

  if (avatarUrl && !isSvgAvatar) {
    // 显示用户头像，隐藏默认头像
    const fullAvatarUrl = `https://back.hs.airoe.cn${avatarUrl}`;
    currentUserAvatar.src = fullAvatarUrl;
    currentUserAvatar.style.display = 'block';
    userInitials.style.display = 'none';
  } else {
    // 显示用户首字母，隐藏真实头像（包括SVG格式头像）
    const initials = currentUser.nickname ? currentUser.nickname.charAt(0).toUpperCase() : 'U';
    userInitials.textContent = initials;
    userInitials.style.display = 'block';
    currentUserAvatar.style.display = 'none';
  }
}

function initSidebarToggle() {
  const menuItems = document.querySelectorAll('.menu-item');
  const secondaryContents = document.querySelectorAll('.secondary-content');
  const chatContents = document.querySelectorAll('.chat-content');
  const switchToOldUI = document.getElementById('switchToOldUI');

  // 添加切换到旧UI的点击事件
  if (switchToOldUI) {
    switchToOldUI.addEventListener('click', () => {
      window.location.href = '/oldUI/';
    });
  }

  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetSection = item.getAttribute('data-section');

      // 处理退出登录 - 先检查，避免移除active类
      if (targetSection === 'logout') {
        if (confirm('确定要退出登录吗？')) {
          logout();
        }
        return;
      }

      // 非退出登录操作，才执行active类的切换
      menuItems.forEach(menuItem => {
        menuItem.classList.remove('active');
      });

      secondaryContents.forEach(content => {
        content.classList.remove('active');
      });

      chatContents.forEach(content => {
        content.classList.remove('active');
        // 明确设置display为none，确保非活动聊天内容被隐藏
        content.style.display = 'none';
      });

      item.classList.add('active');

      const targetSecondaryContent = document.querySelector(`.secondary-content[data-content="${targetSection}"]`);
      if (targetSecondaryContent) {
        targetSecondaryContent.classList.add('active');
      }

      const targetChatContent = document.querySelector(`.chat-content[data-content="${targetSection}"]`);
      if (targetChatContent) {
        targetChatContent.classList.add('active');
        // 明确设置display为flex，确保目标聊天内容显示
        targetChatContent.style.display = 'flex';
        // 切换后调整布局
        adjustChatLayout();
      }

      // 根据目标页面类型控制Markdown工具栏的显示
      const markdownToolbar = document.getElementById('markdownToolbar');
      const toggleMarkdownToolbarBtn = document.getElementById('toggleMarkdownToolbar');
      const toggleGroupMarkdownToolbarBtn = document.getElementById('toggleGroupMarkdownToolbar');

      // 公共聊天工具栏只在公共聊天界面显示
      if (markdownToolbar) {
        if (targetSection === 'public-chat') {
          // 公共聊天页面，保持工具栏的显示状态
          // 不改变工具栏的display状态，保持用户之前的选择
        } else {
          // 非公共聊天页面，隐藏公共工具栏
          markdownToolbar.style.display = 'none';
        }
      }

      // 显示/隐藏相应的切换按钮，并更新按钮文本
      if (toggleMarkdownToolbarBtn) {
        if (targetSection === 'public-chat') {
          toggleMarkdownToolbarBtn.style.display = 'inline-block';
          // 根据工具栏的显示状态更新按钮文本
          if (markdownToolbar) {
            if (markdownToolbar.style.display === 'none') {
              toggleMarkdownToolbarBtn.innerHTML = '<i class="fas fa-chevron-down"></i> MD';
            } else {
              toggleMarkdownToolbarBtn.innerHTML = '<i class="fas fa-chevron-up"></i> 隐藏Markdown工具栏';
            }
          }
        } else {
          toggleMarkdownToolbarBtn.style.display = 'none';
        }
      }

      if (toggleGroupMarkdownToolbarBtn) {
        toggleGroupMarkdownToolbarBtn.style.display = targetSection === 'group-chat' ? 'inline-block' : 'none';
      }

      // 当切换到主聊天室时，清除未读计数
      if (targetSection === 'public-chat') {
        // 清除全局未读消息计数
        unreadMessages.global = 0;
        updateUnreadCount();
        // 清除未读消息指示
        document.getElementById('publicChatUnreadCount').textContent = '';
        // 恢复页面标题
        document.title = originalTitle;
      }

      // 当切换到群组聊天时，更新当前活动聊天室并清除对应群组的未读计数
      if (targetSection === 'group-chat') {
        // 清除群组未读消息计数显示
        document.getElementById('groupChatUnreadCount').textContent = '';
      }

      // 当切换到私信聊天时，更新当前活动聊天室并清除对应用户的未读计数
      if (targetSection === 'private-chat') {
        // 清除私信未读消息计数显示
        document.getElementById('privateChatUnreadCount').textContent = '';
      }

      // 更新哈希路径
      updateHashPath(targetSection);
    });
  });
}

function logout() {
  // 清除localStorage中的用户信息
  localStorage.removeItem('currentUser');
  localStorage.removeItem('currentSessionToken');
  localStorage.removeItem('chatUserId');
  localStorage.removeItem('chatUserNickname');
  localStorage.removeItem('chatSessionToken');
  localStorage.removeItem('chatUserAvatar');
  localStorage.removeItem('userId');
  localStorage.removeItem('nickname');
  localStorage.removeItem('avatarUrl');
  localStorage.removeItem('sessionToken');

  // 重定向到登录页面
  router.push('/login');
}

function adjustChatLayout() {
  // 调整聊天布局的逻辑
  console.log('Adjusting chat layout');
}

function updateUnreadCount() {
  // 更新未读消息计数的逻辑
  console.log('Updating unread count');
}

function updateHashPath(section) {
  // 根据 section 更新哈希路径
  let hash = '';
  // 保存历史消息
  if (window.location.hash === '#/chat') {
    saveChatHistory('save')
  }
  switch (section) {
    case 'public-chat':
      hash = '#/chat';
      break;
    case 'group-chat':
      hash = '#/chat/group';
      break;
    case 'private-chat':
      hash = '#/chat/private';
      break;
    case 'user-settings':
      hash = '#/settings';
      break;
    default:
      hash = '#/chat';
  }
  // 更新哈希路径，不触发页面刷新
  window.location.hash = hash;
}
</script>

<template>
  <div id="sidebar">
    <div class="sidebar-header">
        <div id="userProfile" class="user-profile">
            <div id="userAvatar" class="user-avatar">
                <img id="currentUserAvatar" src="" alt="用户头像" class="user-avatar-img" loading="lazy" width="60" height="60" style="aspect-ratio: 1/1; object-fit: cover;">
                <span id="userInitials" class="user-initials"></span>
            </div>
        </div>
    </div>
    <!-- 公共聊天板块 -->
    <div class="menu-section">
        <ul class="menu-list">
            <li :class="['menu-item', { active: activeMenuItem === 'public-chat' }]" data-section="public-chat">
                <div class="chat-avatar">💬</div>
                <div class="unread-count" id="publicChatUnreadCount"></div>
            </li>
        </ul>
    </div>
    
    <!-- 群组聊天板块 -->
    <div class="menu-section">
        <ul class="menu-list">
            <li :class="['menu-item', { active: activeMenuItem === 'group-chat' }]" data-section="group-chat">
                <div class="chat-avatar"><img src="icon/User-Group-256.ico" alt="群组聊天" style="width: 24px; height: 24px;"></div>
                <div class="unread-count" id="groupChatUnreadCount"></div>
            </li>
        </ul>
    </div>

    <!-- 私信聊天板块 -->
    <div class="menu-section">
        <ul class="menu-list">
            <li :class="['menu-item', { active: activeMenuItem === 'private-chat' }]" data-section="private-chat">
                <div class="chat-avatar"><img src="icon/User-Profile-256.ico" alt="私信聊天" style="width: 24px; height: 24px;"></div>
                <div class="unread-count" id="privateChatUnreadCount"></div>
            </li>
        </ul>
    </div>

    <div class="menu-section">
        <ul class="menu-list">
            <li :class="['menu-item', { active: activeMenuItem === 'user-settings' }]" data-section="user-settings">
                <div class="chat-avatar"><img src="icon/Settings-01-256.ico" alt="用户设置" style="width: 24px; height: 24px;"></div>
            </li>
        </ul>
    </div>
    
    <!-- 底部区域 -->
    <div class="menu-section" style="margin-top: auto; margin-bottom: 20px;">
        <!-- 切换到旧UI按钮 -->
        <ul class="menu-list">
            <li class="menu-item" id="switchToOldUI">
                <div class="chat-avatar" title="切换到旧UI">⬅️</div>
            </li>
        </ul>
        
        <!-- 退出登录按钮 -->
        <ul class="menu-list">
            <li class="menu-item" data-section="logout">
                <div class="chat-avatar">⏻</div>
            </li>
        </ul>
    </div>
</div>
</template>

<style src="@/css/index.css"></style>
<style src="@/css/code-highlight.css"></style>