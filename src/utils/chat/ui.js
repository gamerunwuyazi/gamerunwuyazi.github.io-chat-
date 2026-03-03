import { SERVER_URL, toast, getModalId, getModalNameFromId } from './config.js';
import { 
  getStore,
  unreadMessages,
  syncCurrentActiveChat
} from './store.js';
import { unescapeHtml } from './message.js';
import { websocketModule } from './index.js';

let originalTitle = document.title;
let isPageVisible = !document.hidden;
let currentActiveChat = 'main';
let currentGroupId = null;

function logout() {
  // 断开 WebSocket 连接
  if (websocketModule && websocketModule.disconnectWebSocket) {
    websocketModule.disconnectWebSocket();
  }
  
  localStorage.removeItem('currentUser');
  localStorage.removeItem('currentSessionToken');
  localStorage.removeItem('chatUserId');
  localStorage.removeItem('chatUserNickname');
  localStorage.removeItem('chatUserGender');
  window.router.push('/login');
}
let currentGroupName = '';
let currentUser = null;
let currentSessionToken = null;
let hasReceivedHistory = false;
let hasReceivedGroupHistory = false;
let hasReceivedPrivateHistory = false;
let currentPrivateChatUserId = null;
let currentPrivateChatUsername = null;
let currentPrivateChatNickname = null;
let currentSendChatType = null;
let selectedGroupIdForCard = null;

// ============================================
// UI 相关功能模块
// 包含图片预览、模态框、设置项、Markdown、焦点事件、侧边栏、消息提示、未读计数、聊天初始化等
// ============================================

// 优先从其他文件提取，若不存在则从 chat.js 中提取

// ---------- 图片预览 ----------
// 来源: const io = require('socket.io-client).txt
function openImagePreview(imageUrl) {
    const modal = document.getElementById('imagePreviewModal');
    const imgElement = document.getElementById('previewImgElement');
    const closeBtn = document.getElementById('closeImagePreviewModal');

    if (modal && imgElement) {
        // 先检查模态框是否已经打开，如果是则先关闭
        if (modal.style.display === 'flex') {
            closeImagePreviewModal();
        }

        imgElement.src = imageUrl;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    // 关闭按钮事件
    if (closeBtn) {
        // 先移除可能存在的事件监听器，避免重复绑定
        closeBtn.removeEventListener('click', closeImagePreviewModal);
        closeBtn.addEventListener('click', closeImagePreviewModal);
    } else {
        // 如果关闭按钮不存在，创建一个
        if (modal) {
            const closeBtnContainer = document.createElement('div');
            closeBtnContainer.id = 'closeImagePreviewModal';
            closeBtnContainer.style.position = 'absolute';
            closeBtnContainer.style.top = '10px';
            closeBtnContainer.style.right = '10px';
            closeBtnContainer.style.width = '30px';
            closeBtnContainer.style.height = '30px';
            closeBtnContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            closeBtnContainer.style.color = 'white';
            closeBtnContainer.style.borderRadius = '50%';
            closeBtnContainer.style.display = 'flex';
            closeBtnContainer.style.justifyContent = 'center';
            closeBtnContainer.style.alignItems = 'center';
            closeBtnContainer.style.cursor = 'pointer';
            closeBtnContainer.style.zIndex = '1001';
            closeBtnContainer.textContent = '×';
            closeBtnContainer.style.fontSize = '20px';
            closeBtnContainer.style.fontWeight = 'bold';
            
            // 检查模态框中是否已经有关闭按钮
            const existingCloseBtn = modal.querySelector('#closeImagePreviewModal');
            if (!existingCloseBtn) {
                modal.appendChild(closeBtnContainer);
            }
            
            // 为新创建的关闭按钮添加事件监听器
            closeBtnContainer.addEventListener('click', closeImagePreviewModal);
        }
    }

    // 点击模态框背景关闭
    if (modal) {
        // 先移除可能存在的事件监听器，避免重复绑定
        modal.removeEventListener('click', handleModalBackgroundClick);
        modal.addEventListener('click', handleModalBackgroundClick);
    }
}

// 关闭图片预览模态框（内部函数，也在同一文件中定义）
function closeImagePreviewModal() {
    const modal = document.getElementById('imagePreviewModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

// 处理模态框背景点击（内部函数）
function handleModalBackgroundClick(e) {
    const modal = document.getElementById('imagePreviewModal');
    if (e.target === modal) {
        closeImagePreviewModal();
    }
}

// 直接为关闭按钮添加事件监听器，确保即使不通过openImagePreview打开也能工作
const closeBtn = document.getElementById('closeImagePreviewModal');
if (closeBtn) {
    closeBtn.addEventListener('click', closeImagePreviewModal);
}

// 直接为模态框添加背景点击事件监听器
const imagePreviewModal = document.getElementById('imagePreviewModal');
if (imagePreviewModal) {
    imagePreviewModal.addEventListener('click', handleModalBackgroundClick);
}

// ---------- 模态框打开/关闭 ----------
// 来源: 显示错误消息.txt
function openModal(modalName, data = null) {
  const store = getStore();
  if (store && store.openModal) {
    store.openModal(modalName, data);
  } else {
    // 回退到原来的方法
    const modalId = getModalId(modalName);
    if (modalId) {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.style.display = 'flex';
      }
    }
  }
}

function closeModal(modalName) {
  const store = getStore();
  if (store && store.closeModal) {
    store.closeModal(modalName);
  } else {
    // 回退到原来的方法
    const modalId = getModalId(modalName);
    if (modalId) {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.style.display = 'none';
      }
    } else {
      // 关闭所有模态框
      const modals = document.querySelectorAll('.modal');
      modals.forEach(modal => {
        modal.style.display = 'none';
      });
    }
  }
}

// getModalId 和 getModalNameFromId 已从 config.js 导入

// ---------- 设置项点击 ----------
// 来源: import { setupLeaveGroupButton } fr.txt
function initSettingsItemClick() {
    // 设置项点击事件已移至 UserSettings.vue
    // 左侧设置列表点击时派发事件
    const settingsItems = document.querySelectorAll('.settings-item');
    
    settingsItems.forEach(item => {
        item.addEventListener('click', () => {
            const settingId = item.getAttribute('data-setting-id');
            if (settingId) {
                window.dispatchEvent(new CustomEvent('settings-item-click', {
                    detail: { setting: settingId }
                }));
            }
        });
    });
}

// ---------- 插入 Markdown 格式 ----------
// 来源: 显示错误消息.txt
function insertMarkdownFormat(prefix, suffix, sample) {
  // 确定当前活动的输入框
  let activeInput = null;

  // 根据当前聊天类型选择对应的输入框
  const activeChatContent = document.querySelector('.chat-content.active');
  if (activeChatContent) {
    const contentType = activeChatContent.getAttribute('data-content');
    switch (contentType) {
      case 'public-chat':
        activeInput = document.getElementById('messageInput');
        break;
      case 'group-chat':
        activeInput = document.getElementById('groupMessageInput');
        break;
      case 'private-chat':
        activeInput = document.getElementById('privateMessageInput');
        break;
      default:
        // 默认尝试获取当前聚焦的输入框
        activeInput = document.activeElement;
    }
  } else {
    // 尝试获取当前聚焦的输入框
    activeInput = document.activeElement;
  }

  // 如果没有找到有效的输入框，返回
  if (!activeInput || !activeInput.isContentEditable) {
    // 如果当前聚焦的不是可编辑元素，尝试获取可见的可编辑输入框
    const editableInputs = document.querySelectorAll('.editable-div, [contenteditable="true"]');
    for (let i = 0; i < editableInputs.length; i++) {
      if (editableInputs[i].offsetParent !== null) { // 检查元素是否可见
        activeInput = editableInputs[i];
        break;
      }
    }

    if (!activeInput || !activeInput.isContentEditable) {
      return;
    }
  }

  // 获取当前选中的文本
  let selectedText = '';
  if (window.getSelection) {
    const selection = window.getSelection();
    selectedText = selection.toString();
  } else if (document.selection && document.selection.type !== 'Control') {
    selectedText = document.selection.createRange().text;
  }

  // 如果没有选中文本，使用示例文本
  if (!selectedText) {
    selectedText = sample;
  }

  // 聚焦到输入框
  activeInput.focus();

  // 插入Markdown格式
  const newText = prefix + selectedText + suffix;

  // 替换选中的文本
  document.execCommand('insertText', false, newText);
}

// ---------- 初始化更多按钮 ----------
// 来源: 显示错误消息.txt
function initializeMoreButtons() {
  // 主聊天室更多按钮
  const moreButton = document.getElementById('moreButton');
  const mainMoreFunctions = document.getElementById('mainMoreFunctions');
  const mainInputContainer = document.getElementById('mainInputContainer');

  if (moreButton && mainMoreFunctions && mainInputContainer) {
    // 移除旧的点击事件监听器
    const newMoreButton = moreButton.cloneNode(true);
    moreButton.parentNode.replaceChild(newMoreButton, moreButton);
    // 添加新的点击事件监听器
    newMoreButton.addEventListener('click', function() {
      mainMoreFunctions.classList.toggle('show');
      mainInputContainer.classList.toggle('lifted');
    });
  }

  // 群组聊天更多按钮
  const groupMoreButton = document.getElementById('groupMoreButton');
  const groupMoreFunctions = document.getElementById('groupMoreFunctions');
  const groupInputContainer = document.getElementById('groupInputContainer');

  if (groupMoreButton && groupMoreFunctions && groupInputContainer) {
    // 移除旧的点击事件监听器
    const newGroupMoreButton = groupMoreButton.cloneNode(true);
    groupMoreButton.parentNode.replaceChild(newGroupMoreButton, groupMoreButton);
    // 添加新的点击事件监听器
    newGroupMoreButton.addEventListener('click', function() {
      groupMoreFunctions.classList.toggle('show');
      groupInputContainer.classList.toggle('lifted');
    });
  }

  // 私信聊天更多按钮
  const privateMoreButton = document.getElementById('privateMoreButton');
  const privateMoreFunctions = document.getElementById('privateMoreFunctions');
  const privateInputContainer = document.getElementById('privateInputContainer');

  if (privateMoreButton && privateMoreFunctions && privateInputContainer) {
    // 移除旧的点击事件监听器
    const newPrivateMoreButton = privateMoreButton.cloneNode(true);
    privateMoreButton.parentNode.replaceChild(newPrivateMoreButton, privateMoreButton);
    // 添加新的点击事件监听器
    newPrivateMoreButton.addEventListener('click', function() {
      privateMoreFunctions.classList.toggle('show');
      privateInputContainer.classList.toggle('lifted');
    });
  }

  // 发送群名片按钮事件
  const sendGroupCardButton = document.getElementById('sendGroupCardButton');
  const sendGroupCardButtonGroup = document.getElementById('sendGroupCardButtonGroup');
  const privateSendGroupCardButton = document.getElementById('privateSendGroupCardButton');

  if (sendGroupCardButton) {
    // 移除旧的点击事件监听器
    const newSendGroupCardButton = sendGroupCardButton.cloneNode(true);
    sendGroupCardButton.parentNode.replaceChild(newSendGroupCardButton, sendGroupCardButton);
    // 添加新的点击事件监听器
    newSendGroupCardButton.addEventListener('click', function() {
      showSendGroupCardModal('main');
    });
  }

  if (sendGroupCardButtonGroup) {
    // 移除旧的点击事件监听器
    const newSendGroupCardButtonGroup = sendGroupCardButtonGroup.cloneNode(true);
    sendGroupCardButtonGroup.parentNode.replaceChild(newSendGroupCardButtonGroup, sendGroupCardButtonGroup);
    // 添加新的点击事件监听器
    newSendGroupCardButtonGroup.addEventListener('click', function() {
      showSendGroupCardModal('group');
    });
  }

  if (privateSendGroupCardButton) {
    // 移除旧的点击事件监听器
    const newPrivateSendGroupCardButton = privateSendGroupCardButton.cloneNode(true);
    privateSendGroupCardButton.parentNode.replaceChild(newPrivateSendGroupCardButton, privateSendGroupCardButton);
    // 添加新的点击事件监听器
    newPrivateSendGroupCardButton.addEventListener('click', function() {
      showSendGroupCardModal('private');
    });
  }

  // 发送群名片模态框事件
  const closeSendGroupCardModal = document.getElementById('closeSendGroupCardModal');
  const cancelSendGroupCard = document.getElementById('cancelSendGroupCard');
  const confirmSendGroupCard = document.getElementById('confirmSendGroupCard');

  if (closeSendGroupCardModal) {
    // 移除旧的点击事件监听器
    const newCloseSendGroupCardModal = closeSendGroupCardModal.cloneNode(true);
    closeSendGroupCardModal.parentNode.replaceChild(newCloseSendGroupCardModal, closeSendGroupCardModal);
    // 添加新的点击事件监听器
    newCloseSendGroupCardModal.addEventListener('click', function() {
      const modal = document.getElementById('sendGroupCardModal');
      if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
      }
    });
  }

  if (cancelSendGroupCard) {
    // 移除旧的点击事件监听器
    const newCancelSendGroupCard = cancelSendGroupCard.cloneNode(true);
    cancelSendGroupCard.parentNode.replaceChild(newCancelSendGroupCard, cancelSendGroupCard);
    // 添加新的点击事件监听器
    newCancelSendGroupCard.addEventListener('click', function() {
      const modal = document.getElementById('sendGroupCardModal');
      if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
      }
    });
  }

  if (confirmSendGroupCard) {
    // 移除旧的点击事件监听器
    const newConfirmSendGroupCard = confirmSendGroupCard.cloneNode(true);
    confirmSendGroupCard.parentNode.replaceChild(newConfirmSendGroupCard, confirmSendGroupCard);
    // 添加新的点击事件监听器
    newConfirmSendGroupCard.addEventListener('click', function() {
      sendGroupCard();
    });
  }
}

// ---------- 初始化焦点监听 ----------
// 来源: 显示错误消息.txt
function initializeFocusListeners() {
  // 添加页面可见性变化事件监听
  document.addEventListener('visibilitychange', handlePageVisibilityChange);

  // 添加页面焦点变化事件监听
  window.addEventListener('focus', handleFocusChange);
  window.addEventListener('blur', handleFocusChange);
}

// ---------- 初始化侧边栏切换 ----------
// 来源: 显示错误消息.txt
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

      // 当切换到主聊天室时，更新当前活动聊天室并清除未读计数
      if (targetSection === 'public-chat') {
        // 设置活动聊天状态为main，并清除未读计数（因为用户真正进入了主聊天室）
        setActiveChat('main', null, true);
        // 只重新初始化头像点击事件，不需要重新加载用户列表
        initAllFunctions();
        // 不再重置当前群组信息，以便切换回群组聊天时能恢复
      } else if (targetSection === 'group-chat') {
        // 切换到群组聊天页面时，刷新群组列表
        loadGroupList();

        // 如果当前有选中的群组，立即更新currentActiveChat
        // 这样在loadGroupList异步完成之前，新消息就能正常显示
        if (currentGroupId) {
          // 设置活动聊天状态为group，并清除未读计数（因为用户真正进入了群组聊天）
          setActiveChat('group', currentGroupId, true);
        }

        // 立即恢复当前群组选择状态，因为loadGroupList是异步的，需要在回调中处理
        const originalLoadGroupList = window.loadGroupList;
        window.loadGroupList = function() {
          // 调用原始的loadGroupList函数
          fetch(`${SERVER_URL}/user-groups/${currentUser.id}`, {
            headers: {
              'user-id': currentUser.id,
              'session-token': currentSessionToken
            }
          })
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                updateGroupList(data.groups);

                // 恢复之前选择的群组状态
                if (currentGroupId) {
                  // 确保currentActiveChat正确设置
                  // 设置活动聊天状态为group，并清除未读计数（因为用户真正进入了群组聊天）
                  setActiveChat('group', currentGroupId, true);

                  // 确保群组聊天界面显示，并加载聊天记录
                  const groupEmptyState = document.getElementById('groupEmptyState');
                  const groupChatInterface = document.getElementById('groupChatInterface');
                  const currentGroupNameElement = document.getElementById('currentGroupName');

                  if (groupEmptyState) {
                    groupEmptyState.style.display = 'none';
                  }
                  if (groupChatInterface) {
                    groupChatInterface.style.display = 'flex';
                    groupChatInterface.style.flexDirection = 'column';
                  }
                  if (currentGroupNameElement) {
                    currentGroupNameElement.textContent = currentGroupName;
                  }

                  // 加载群组聊天记录
                  // 从其他页面切换到群组页面时，不清空消息列表，只添加新消息
                  loadGroupMessages(currentGroupId, false);
                }
              }
            })
            .catch(error => {
              const groupList = document.getElementById('groupList');
              if (groupList) {
                groupList.innerHTML = '<li>加载失败: 网络错误</li>';
              }
            });
        };

        // 调用重写后的loadGroupList函数
        loadGroupList();

        // 恢复原始的loadGroupList函数
        setTimeout(() => {
          window.loadGroupList = originalLoadGroupList;
        }, 1000);
      }
    });
  });
}

// ---------- 消息提示 ----------
// 来源: 显示错误消息.txt
// 显示错误消息
function showError(message) {
  toast.error(message);
}

// 显示成功消息
function showSuccess(message) {
  toast.success(message);
}

// ---------- 更新标题未读数 ----------
// 来源: 显示错误消息.txt
function updateTitleWithUnreadCount() {
  let totalUnread = unreadMessages.global;

  // 累加所有群组的未读消息数
  for (const groupId in unreadMessages.groups) {
    const groupUnread = unreadMessages.groups[groupId] || 0;
    totalUnread += groupUnread;
  }

  // 累加所有私信的未读消息数
  for (const userId in unreadMessages.private) {
    const privateUnread = unreadMessages.private[userId] || 0;
    totalUnread += privateUnread;
  }

  // 更新页面标题，格式：（X条未读）简易聊天室
  if (totalUnread > 0) {
    document.title = `（${totalUnread}条未读）${originalTitle}`;
  } else {
    document.title = originalTitle;
  }

  // 更新未读计数显示
  updateUnreadCountsDisplay();
}

// ---------- 页面可见性处理 ----------
// 来源: 显示错误消息.txt
function handlePageVisibilityChange() {
  isPageVisible = !document.hidden;

  // 页面从不可见变为可见时，只清除当前活动会话的未读计数
  if (isPageVisible) {
    const chat = currentActiveChat || window.currentActiveChat || '';
    if (typeof chat !== 'string') {
      return;
    }

    // 清除当前活动会话的未读计数
    if (chat === 'main') {
      // 公共聊天室
      if (unreadMessages.global > 0) {
        unreadMessages.global = 0;
      }
    } else if (chat.startsWith('group_')) {
      // 群组聊天室
      const groupId = chat.replace('group_', '');
      if (unreadMessages.groups[groupId] > 0) {
        unreadMessages.groups[groupId] = 0;
      }
    } else if (chat.startsWith('private_')) {
      // 私信聊天室
      const userId = chat.replace('private_', '');
      if (unreadMessages.private[userId] > 0) {
        unreadMessages.private[userId] = 0;
      }
    }
    
    // 更新未读计数显示和标题
    updateUnreadCountsDisplay();
    updateTitleWithUnreadCount();
  }
}

function handleFocusChange() {
  isPageVisible = document.hasFocus();

  // 页面获得焦点时，只清除当前活动会话的未读计数
  if (isPageVisible) {
    const chat = currentActiveChat || window.currentActiveChat || '';
    if (typeof chat !== 'string') {
      return;
    }

    // 清除当前活动会话的未读计数
    if (chat === 'main') {
      // 公共聊天室
      if (unreadMessages.global > 0) {
        unreadMessages.global = 0;
      }
    } else if (chat.startsWith('group_')) {
      // 群组聊天室
      const groupId = chat.replace('group_', '');
      if (unreadMessages.groups[groupId] > 0) {
        unreadMessages.groups[groupId] = 0;
      }
    } else if (chat.startsWith('private_')) {
      // 私信聊天室
      const userId = chat.replace('private_', '');
      if (unreadMessages.private[userId] > 0) {
        unreadMessages.private[userId] = 0;
      }
    }
    
    // 更新未读计数显示和标题
    updateUnreadCountsDisplay();
    updateTitleWithUnreadCount();
  }
}

// ---------- 更新未读数显示 ----------
// 来源: 显示错误消息.txt
function updateUnreadCountsDisplay() {
  // 更新公共聊天按钮的未读计数
  const publicChatUnreadEl = document.getElementById('publicChatUnreadCount');
  if (publicChatUnreadEl) {
    if (unreadMessages.global > 0) {
      publicChatUnreadEl.textContent = unreadMessages.global;
    } else {
      publicChatUnreadEl.textContent = '';
    }
  }

  // 更新群组聊天按钮的未读计数
  const groupChatUnreadEl = document.getElementById('groupChatUnreadCount');
  if (groupChatUnreadEl) {
    // 计算所有群组的未读消息总数
    let totalGroupUnread = 0;
    // 使用Object.keys()方法遍历对象的所有自有键，避免遍历原型链上的键
    Object.keys(unreadMessages.groups).forEach(groupId => {
      const groupUnread = unreadMessages.groups[groupId] || 0;
      totalGroupUnread += groupUnread;
    });
    if (totalGroupUnread > 0) {
      groupChatUnreadEl.textContent = totalGroupUnread;
    } else {
      groupChatUnreadEl.textContent = '';
    }
  }

  // 更新私信聊天按钮的未读计数
  const privateChatUnreadEl = document.getElementById('privateChatUnreadCount');
  if (privateChatUnreadEl) {
    // 计算所有私信的未读消息总数
    let totalPrivateUnread = 0;
    // 使用Object.keys()方法遍历对象的所有自有键，避免遍历原型链上的键
    Object.keys(unreadMessages.private).forEach(userId => {
      const privateUnread = unreadMessages.private[userId] || 0;
      totalPrivateUnread += privateUnread;
    });
    if (totalPrivateUnread > 0) {
      privateChatUnreadEl.textContent = totalPrivateUnread;
    } else {
      privateChatUnreadEl.textContent = '';
    }
  }

  // 直接更新store中的未读消息
  if (window.chatStore) {
    window.chatStore.unreadMessages = { ...unreadMessages };
  }
}

// ---------- 设置当前活动聊天室 ----------
// 来源: 显示错误消息.txt
function setActiveChat(chatType, id = null, clearUnread = false) {
  const store = window.chatStore;
  if (chatType === 'main') {
    currentActiveChat = 'main';
    window.currentActiveChat = 'main';
    if (store) {
      store.currentActiveChat = 'main';
      // 切换聊天类型时清除引用消息
      if (store.setCurrentActiveChat) {
        store.setCurrentActiveChat('main');
      }
    }
    // 清除全局未读消息计数
    if (clearUnread && unreadMessages.global > 0) {
      unreadMessages.global = 0;
      updateTitleWithUnreadCount();
    }
  } else if (chatType === 'group' && id) {
    currentActiveChat = `group_${id}`;
    window.currentActiveChat = `group_${id}`;
    if (store) {
      store.currentActiveChat = `group_${id}`;
      // 切换聊天类型时清除引用消息
      if (store.setCurrentActiveChat) {
        store.setCurrentActiveChat(`group_${id}`);
      }
    }
    // 清除该群组未读消息计数
    if (clearUnread && unreadMessages.groups[id] > 0) {
      unreadMessages.groups[id] = 0;
      updateTitleWithUnreadCount();
    }
  } else if (chatType === 'private' && id) {
    currentActiveChat = `private_${id}`;
    window.currentActiveChat = `private_${id}`;
    if (store) {
      store.currentActiveChat = `private_${id}`;
      // 切换聊天类型时清除引用消息
      if (store.setCurrentActiveChat) {
        store.setCurrentActiveChat(`private_${id}`);
      }
    }
    // 清除该好友未读消息计数
    if (clearUnread && unreadMessages.private[id] > 0) {
      unreadMessages.private[id] = 0;
      updateTitleWithUnreadCount();
    }
  }
}

// ---------- 图片点击事件、头像点击事件 ----------
// 以下函数来自 chat.txt（其他文件中未找到同名函数）

function addImageClickEvents() {
    const images = document.querySelectorAll('.message-image');
    images.forEach(img => {
        if (!img.hasAttribute('data-click-added')) {
            img.addEventListener('click', function() {
                const src = this.getAttribute('src');
                if (src) {
                    openImagePreview(src);
                }
            });
            img.setAttribute('data-click-added', 'true');
        }
    });
}

function addAvatarClickEvents() {
    // 为所有带有user-avatar类的元素添加点击事件
    const avatars = document.querySelectorAll('.user-avatar');
    avatars.forEach(avatar => {
        if (!avatar.hasAttribute('data-click-added')) {
            avatar.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                // 查找对应的用户ID
                let userId;

                // 检查父元素是否有data-user-id属性
                if (this.closest('[data-user-id]')) {
                    userId = this.closest('[data-user-id]').getAttribute('data-user-id');
                }
                // 检查是否是在线用户列表中的头像
                else if (this.closest('.user-item')) {
                    userId = this.closest('.user-item').getAttribute('data-user-id');
                }
                // 检查是否是消息中的头像
                else if (this.closest('.message-item')) {
                    userId = this.closest('.message-item').getAttribute('data-user-id');
                }
                // 检查是否是搜索结果中的头像
                else if (this.closest('.search-result-item')) {
                    userId = this.closest('.search-result-item').querySelector('.add-friend-btn')?.getAttribute('data-user-id');
                }

                if (userId) {
                    // 查找对应的用户昵称
                    let nickname = '';

                    // 检查父元素是否有data-user-nickname属性
                    const parentWithId = this.closest('[data-user-id]');
                    if (parentWithId) {
                        if (parentWithId.hasAttribute('data-user-nickname')) {
                            nickname = parentWithId.getAttribute('data-user-nickname');
                        } else {
                            const nameElement = parentWithId.querySelector('.friend-name, .user-name, .message-nickname');
                            if (nameElement) {
                                nickname = nameElement.textContent;
                            }
                        }
                    } else if (this.closest('.user-item')) {
                        const userItem = this.closest('.user-item');
                        const nameElement = userItem.querySelector('.user-name');
                        if (nameElement) {
                            nickname = nameElement.textContent;
                        }
                    } else if (this.closest('.message-item')) {
                        const messageItem = this.closest('.message-item');
                        const nameElement = messageItem.querySelector('.message-nickname');
                        if (nameElement) {
                            nickname = nameElement.textContent;
                        }
                    }

                    // 显示用户头像小弹窗
                    showUserAvatarPopup(e, { id: userId, nickname: nickname });
                }
            });
            avatar.setAttribute('data-click-added', 'true');
        }
    });

    // 为所有用户头像图片添加点击事件
    const avatarImages = document.querySelectorAll('.user-avatar-img');
    avatarImages.forEach(img => {
        if (!img.hasAttribute('data-click-added')) {
            img.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                // 查找对应的用户ID
                let userId;

                // 检查父元素是否有data-user-id属性
                if (this.closest('[data-user-id]')) {
                    userId = this.closest('[data-user-id]').getAttribute('data-user-id');
                }
                // 检查是否是当前用户头像
                else if (this.id === 'currentUserAvatar') {
                    // 不处理当前用户头像点击
                    return;
                }

                if (userId) {
                    // 查找对应的用户昵称
                    let nickname = '';

                    // 检查父元素是否有data-user-nickname属性
                    const parentWithId = this.closest('[data-user-id]');
                    if (parentWithId) {
                        if (parentWithId.hasAttribute('data-user-nickname')) {
                            nickname = parentWithId.getAttribute('data-user-nickname');
                        } else {
                            const nameElement = parentWithId.querySelector('.friend-name, .user-name, .message-nickname');
                            if (nameElement) {
                                nickname = nameElement.textContent;
                            }
                        }
                    }

                    // 显示用户头像小弹窗
                    showUserAvatarPopup(e, { id: userId, nickname: nickname });
                }
            });
            img.setAttribute('data-click-added', 'true');
        }
    });
}

function addGroupAvatarClickEvents() {
    // 为群组列表中的头像添加点击事件
    const groupList = document.getElementById('groupList');
    if (groupList) {
        groupList.addEventListener('click', function(e) {
            if (e.target.closest('.group-avatar')) {
                const groupAvatar = e.target.closest('.group-avatar');
                const img = groupAvatar.querySelector('img');
                if (img && img.src) {
                    openImagePreview(img.src);
                }
            }
        });
    }

    // 为模态框中的群组头像添加点击事件
    const modal = document.getElementById('groupInfoModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target.closest('#modalGroupAvatarValue')) {
                const avatarContainer = e.target.closest('#modalGroupAvatarValue');
                const img = avatarContainer.querySelector('img');
                if (img && img.src) {
                    openImagePreview(img.src);
                }
            }
        });
    }
}

// ---------- 初始化聊天 ----------
// 来源: chat.txt
function initializeChat() {
        // 首先尝试从 store 中获取用户信息
        const store = window.chatStore;
        if (store && store.currentUser && store.currentSessionToken) {
            currentUser = store.currentUser;
            currentSessionToken = store.currentSessionToken;
            window.currentSessionToken = currentSessionToken;
        }
        // 如果 store 中没有，再尝试从 localStorage 获取
        else if (!currentUser || !currentSessionToken) {
            // 尝试从localStorage获取 - 支持多种格式
            let userId = localStorage.getItem('chatUserId') || 
                        localStorage.getItem('userId') ||
                        localStorage.getItem('currentUserId');
            let sessionToken = localStorage.getItem('chatSessionToken') ||
                              localStorage.getItem('currentSessionToken') ||
                              localStorage.getItem('sessionToken');
            let nickname = localStorage.getItem('chatUserNickname') ||
                          localStorage.getItem('nickname') ||
                          localStorage.getItem('currentUserNickname');
            let gender = localStorage.getItem('chatUserGender');

            // console.log('📋 从 localStorage 读取到的数据:', { userId, sessionToken, nickname });

            if (userId && sessionToken) {
                currentUser = {
                    id: userId,
                    nickname: nickname,
                    gender: gender ? parseInt(gender) : 0,
                    avatarUrl: null  // 从后端获取，不从 localStorage 读取
                };
                currentSessionToken = sessionToken;
                window.currentSessionToken = sessionToken;
                
                // 同步到 store
                if (store) {
                    store.currentUser = currentUser;
                    store.setCurrentSessionToken(sessionToken);
                }
                // console.log('✅ 从 localStorage 中获取到用户信息:', currentUser?.id);
            } else {
                console.warn('⚠️ 未找到用户信息，初始化聊天失败');
                return;
            }
        }
        // 执行初始化逻辑
        try {
          if (typeof initializeWebSocket === 'function') initializeWebSocket();
          if (typeof initializeMessageSending === 'function') initializeMessageSending();
          if (typeof enableMessageSending === 'function') enableMessageSending();
          initializeFocusListeners();
          loadOfflineUsers();
          loadGroupList();
        } catch (error) {
            console.error('初始化聊天失败:', error);
        }
}



// ---------- 同步到 Store ----------
// 来源: chat.txt
function _syncToStore() {
  // 先同步 currentActiveChat
  syncCurrentActiveChat();
  
  const store = window.chatStore;
  if (!store) return;
  
  // 同步所有变量到 store
  if (currentUser !== null) store.currentUser = currentUser;
  if (currentSessionToken !== null) store.currentSessionToken = currentSessionToken;
  store.isConnected = isConnected;
  store.currentGroupId = currentGroupId;
  store.currentGroupName = currentGroupName;
  store.currentPrivateChatUserId = currentPrivateChatUserId;
  store.currentPrivateChatUsername = currentPrivateChatUsername;
  store.currentPrivateChatNickname = currentPrivateChatNickname;
  store.currentActiveChat = currentActiveChat;
  store.currentSendChatType = currentSendChatType;
  store.selectedGroupIdForCard = selectedGroupIdForCard;
  store.isPageVisible = isPageVisible;
  store.hasReceivedHistory = hasReceivedHistory;
  store.hasReceivedGroupHistory = hasReceivedGroupHistory;
  store.hasReceivedPrivateHistory = hasReceivedPrivateHistory;
}

// ---------- 更新用户头像 ----------
// 来源: chat.txt
function updateUserAvatar() {
    const currentUserAvatar = document.getElementById('currentUserAvatar');
    const userInitials = document.getElementById('userInitials');

    if (!currentUser || !currentUserAvatar || !userInitials) return;

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
        const fullAvatarUrl = `${SERVER_URL}${avatarUrl}`;
        currentUserAvatar.src = fullAvatarUrl;
        currentUserAvatar.style.display = 'block';
        userInitials.style.display = 'none';
    } else {
        // 显示用户首字母，隐藏真实头像（包括SVG格式头像）
        const unescapedNickname = unescapeHtml(currentUser.nickname || '');
        const initials = unescapedNickname ? unescapedNickname.charAt(0).toUpperCase() : 'U';
        userInitials.textContent = initials;
        userInitials.style.display = 'block';
        currentUserAvatar.style.display = 'none';
    }
}

// ---------- 调整聊天布局 ----------
// 来源: chat.txt
function adjustChatLayout() {
    const chatContent = document.querySelector('.chat-content.active');
    if (chatContent) {
        // 移除可能导致空白的样式
        chatContent.style.marginBottom = '0';
        chatContent.style.paddingBottom = '0';
        chatContent.style.height = '100%';
        chatContent.style.overflow = 'hidden';

        // 根据聊天类型调整padding-top
        if (chatContent.dataset.content === 'public-chat') {
            // 公共聊天界面：根据Markdown工具栏的显示状态动态调整padding-top
            const markdownToolbar = document.getElementById('markdownToolbar');
            if (markdownToolbar && markdownToolbar.style.display !== 'none') {
                // 工具栏显示时，增加padding-top
                chatContent.style.paddingTop = '60px';
            } else {
                // 工具栏隐藏时，减少padding-top
                chatContent.style.paddingTop = '0';
            }
        } else if (chatContent.dataset.content === 'group-chat') {
            // 群组聊天界面：移除padding-top，因为工具栏在group-header下方
            chatContent.style.paddingTop = '0';
        } else {
            // 其他界面：移除padding-top
            chatContent.style.paddingTop = '0';
        }

        // 强制重新计算布局
        chatContent.style.display = 'none';
        requestAnimationFrame(() => {
            chatContent.style.display = 'flex';
        });
    }
}

// ---------- 右键菜单 ----------
// 来源: function initializeGroupFunctions().txt
function showContextMenu(e, groupId, groupName) {
    // 先隐藏现有的右键菜单
    hideContextMenu();

    // 创建右键菜单元素
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.position = 'fixed';
    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';
    contextMenu.style.backgroundColor = 'white';
    contextMenu.style.border = '1px solid #ddd';
    contextMenu.style.borderRadius = '4px';
    contextMenu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    contextMenu.style.zIndex = '1000';
    contextMenu.style.padding = '5px 0';

    // 添加菜单项
    const isMuted = isGroupMuted(groupId);
    const menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item';
    menuItem.textContent = isMuted ? '取消免打扰' : '免打扰';
    menuItem.style.padding = '8px 15px';
    menuItem.style.cursor = 'pointer';
    menuItem.style.fontSize = '14px';
    menuItem.style.whiteSpace = 'nowrap';

    menuItem.addEventListener('click', () => {
        toggleGroupMute(groupId);
        hideContextMenu();
    });

    contextMenu.appendChild(menuItem);
    document.body.appendChild(contextMenu);

    // 保存当前菜单引用
    window.currentContextMenu = contextMenu;

    // 添加全局点击事件监听，点击其他地方关闭菜单
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu);
    }, 0);
}

// 隐藏右键菜单
function hideContextMenu() {
    if (window.currentContextMenu) {
        document.body.removeChild(window.currentContextMenu);
        window.currentContextMenu = null;
    }
    document.removeEventListener('click', hideContextMenu);
}

// ---------- 更新群组免打扰图标 ----------
// 来源: function initializeGroupFunctions().txt
function updateGroupMuteIcon(groupItem, groupId) {
    // 移除现有的免打扰图标
    let muteIcon = groupItem.querySelector('.mute-icon');
    if (muteIcon) {
        muteIcon.remove();
    }

    // 如果群组被静音，添加免打扰图标
    if (isGroupMuted(groupId)) {
        muteIcon = document.createElement('span');
        muteIcon.className = 'mute-icon';
        muteIcon.textContent = '🔕';
        muteIcon.style.marginLeft = '5px';
        muteIcon.style.fontSize = '12px';
        muteIcon.title = '已免打扰';
        groupItem.appendChild(muteIcon);
    }
}

function updateGroupListDisplay() {
    const groupList = document.getElementById('groupList');
    if (!groupList) return;

    // 更新每个群组项的免打扰图标
    const groupItems = groupList.querySelectorAll('li');
    groupItems.forEach(item => {
        const groupId = item.getAttribute('data-group-id');
        updateGroupMuteIcon(item, groupId);
    });
}

function loadOfflineUsers() {
    if (!currentUser || !currentSessionToken) return;

    fetch(`${SERVER_URL}/offline-users`, {
        headers: {
            'user-id': currentUser.id,
            'session-token': currentSessionToken
        }
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                updateOfflineUserList(data.users);
            }
        });
}

function updateOfflineUserList(users) {
    if (!users || !Array.isArray(users)) {
        users = [];
    }

    const store = getStore();
    
    const filteredOfflineUsers = users.filter(offlineUser => {
        if (!store || !store.onlineUsers) {
            return true;
        }
        return !store.onlineUsers.some(onlineUser => onlineUser.id == offlineUser.id);
    });

    if (store) {
        store.offlineUsers = [...filteredOfflineUsers];
    }
}

export {
  openImagePreview,
  openModal,
  closeModal,
  getModalNameFromId,
  getModalId,
  logout,
  initSettingsItemClick,
  insertMarkdownFormat,
  initializeMoreButtons,
  initializeFocusListeners,
  initSidebarToggle,
  showError,
  showSuccess,
  updateTitleWithUnreadCount,
  handlePageVisibilityChange,
  handleFocusChange,
  updateUnreadCountsDisplay,
  setActiveChat,
  addImageClickEvents,
  addAvatarClickEvents,
  addGroupAvatarClickEvents,
  initializeChat,
  _syncToStore,
  updateUserAvatar,
  adjustChatLayout,
  showContextMenu,
  hideContextMenu,
  updateGroupMuteIcon,
  updateGroupListDisplay,
  loadOfflineUsers,
  updateOfflineUserList,
  originalTitle,
  isPageVisible,
  currentActiveChat,
  currentGroupId,
  currentGroupName,
  currentUser,
  currentSessionToken,
  hasReceivedHistory,
  hasReceivedGroupHistory,
  hasReceivedPrivateHistory,
  currentPrivateChatUserId,
  currentPrivateChatUsername,
  currentPrivateChatNickname,
  currentSendChatType,
  selectedGroupIdForCard
};