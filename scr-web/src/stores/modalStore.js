import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useModalStore = defineStore('modal', () => {
  const showGroupInfoModal = ref(false);
  const showGroupMembersModal = ref(false);
  const showSendGroupCardModal = ref(false);
  const showCreateGroupModal = ref(false);
  const showAddGroupMemberModal = ref(false);
  const showUserProfileModal = ref(false);
  const showUserSearchModal = ref(false);
  const showImagePreviewModal = ref(false);
  const showAvatarPreviewModal = ref(false);
  const showUserAvatarPopup = ref(false);
  const showGroupCardPopup = ref(false);

  const modalData = ref({
    groupInfo: null,
    groupCardPopup: null,
    shareGroupCardTargets: [],
    userProfile: null,
    imagePreviewUrl: '',
    avatarPreviewUrl: '',
    userAvatarPopup: null
  });

  function getModalId(modalName) {
    const modalMap = {
      'groupInfo': 'groupInfoModal',
      'groupMembers': 'groupMembersModal',
      'sendGroupCard': 'sendGroupCardModal',
      'createGroup': 'createGroupModal',
      'addGroupMember': 'addGroupMemberModal',
      'userProfile': 'userProfileModal',
      'userSearch': 'userSearchModal',
      'imagePreview': 'imagePreviewModal',
      'avatarPreview': 'avatarPreviewModal',
      'userAvatarPopup': 'userAvatarPopup'
    };
    return modalMap[modalName] || null;
  }

  // 群组信息/用户资料以右侧抽屉形式展示，打开时让 #main-chat 增加 drawer-open，
  // CSS 据此缩窄聊天主区，为抽屉让出空间（仅桌面端布局存在 #main-chat）
  function setMainChatDrawer(open) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('main-chat');
    if (el) el.classList.toggle('drawer-open', open);
  }

  function openModal(modalName, data = null) {
    switch (modalName) {
      case 'groupInfo':
        showGroupInfoModal.value = true;
        if (data) modalData.value.groupInfo = data;
        setMainChatDrawer(true);
        break;
      case 'groupMembers':
        showGroupMembersModal.value = true;
        break;
      case 'sendGroupCard':
        showSendGroupCardModal.value = true;
        break;
      case 'createGroup':
        showCreateGroupModal.value = true;
        break;
      case 'addGroupMember':
        showAddGroupMemberModal.value = true;
        break;
      case 'userProfile':
        showUserProfileModal.value = true;
        if (data) modalData.value.userProfile = data;
        setMainChatDrawer(true);
        break;
      case 'userSearch':
        showUserSearchModal.value = true;
        break;
      case 'imagePreview':
        showImagePreviewModal.value = true;
        if (data) modalData.value.imagePreviewUrl = data;
        break;
      case 'avatarPreview':
        showAvatarPreviewModal.value = true;
        if (data) modalData.value.avatarPreviewUrl = data;
        break;
      case 'userAvatarPopup':
        showUserAvatarPopup.value = true;
        if (data) modalData.value.userAvatarPopup = data;
        break;
      case 'groupCardPopup':
        showGroupCardPopup.value = true;
        if (data) modalData.value.groupCardPopup = data;
        break;
    }
    setTimeout(() => {
      const modalId = getModalId(modalName);
      if (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = '';
      }
    }, 0);
  }

  function closeModal(modalName) {
    switch (modalName) {
      case 'groupInfo': showGroupInfoModal.value = false; setMainChatDrawer(false); break;
      case 'groupMembers': showGroupMembersModal.value = false; break;
      case 'sendGroupCard': showSendGroupCardModal.value = false; break;
      case 'createGroup': showCreateGroupModal.value = false; break;
      case 'addGroupMember': showAddGroupMemberModal.value = false; break;
      case 'userProfile': showUserProfileModal.value = false; setMainChatDrawer(false); break;
      case 'userSearch': showUserSearchModal.value = false; break;
      case 'imagePreview': showImagePreviewModal.value = false; break;
      case 'avatarPreview': showAvatarPreviewModal.value = false; break;
      case 'userAvatarPopup': showUserAvatarPopup.value = false; break;
      case 'groupCardPopup': showGroupCardPopup.value = false; break;
      default:
        showGroupInfoModal.value = false;
        showSendGroupCardModal.value = false;
        showCreateGroupModal.value = false;
        showAddGroupMemberModal.value = false;
        showUserProfileModal.value = false;
        showUserSearchModal.value = false;
        showImagePreviewModal.value = false;
        showAvatarPreviewModal.value = false;
        showUserAvatarPopup.value = false;
        showGroupCardPopup.value = false;
        setMainChatDrawer(false);
    }
  }

  return {
    showGroupInfoModal,
    showGroupMembersModal,
    showSendGroupCardModal,
    showCreateGroupModal,
    showAddGroupMemberModal,
    showUserProfileModal,
    showUserSearchModal,
    showImagePreviewModal,
    showAvatarPreviewModal,
    showUserAvatarPopup,
    showGroupCardPopup,
    modalData,
    openModal,
    closeModal,
    getModalId
  };
});
