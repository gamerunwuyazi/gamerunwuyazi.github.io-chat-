import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useAdminStore = defineStore('admin', () => {
  const adminToken = ref(localStorage.getItem('adminToken') || '');
  const adminUsername = ref(localStorage.getItem('adminUsername') || '');
  const isLoggedIn = ref(!!adminToken.value);

  function setAdminInfo({ token, username }) {
    adminToken.value = token;
    adminUsername.value = username;
    isLoggedIn.value = true;
    localStorage.setItem('adminToken', token);
    localStorage.setItem('adminUsername', username);
  }

  function clearAdminInfo() {
    adminToken.value = '';
    adminUsername.value = '';
    isLoggedIn.value = false;
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUsername');
  }

  const token = computed(() => adminToken.value);

  return {
    adminToken,
    adminUsername,
    isLoggedIn,
    token,
    setAdminInfo,
    clearAdminInfo
  };
});