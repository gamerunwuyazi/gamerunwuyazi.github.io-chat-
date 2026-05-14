import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import App from './App.vue'
import { createClearStorePlugin, resetAllStores, clearSpecificStore } from './stores/plugins/clearStore.js'
import { setRouter } from './utils/chat/routerInstance.js'

import './utils/chat/config.js';

import './assets/css/index.css'
import './assets/css/code-highlight.css'
import './assets/css/mobile.css'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/login',
            name: 'login',
            component: () => import('./views/Login.vue')
        },
        {
            path: '/register',
            name: 'register',
            component: () => import('./views/Register.vue')
        },
        {
            path: '/',
            redirect: '/chat'
        },
        {
            path: '/chat',
            component: () => import('./layouts/DefaultLayout.vue'),
            children: [
                {
                    path: '',
                    name: 'public',
                    components: {
                        default: () => import('./views/PublicChat.vue'),
                        sidebar: () => import('./components/Sidebar/PublicSidebar.vue')
                    }
                },
                {
                    path: 'group',
                    name: 'group',
                    components: {
                        default: () => import('./views/GroupChat.vue'),
                        sidebar: () => import('./components/Sidebar/GroupSidebar.vue')
                    }
                },
                {
                    path: 'private',
                    name: 'private',
                    components: {
                        default: () => import('./views/PrivateChat.vue'),
                        sidebar: () => import('./components/Sidebar/PrivateSidebar.vue')
                    }
                },
                {
                    path: 'settings',
                    name: 'settings',
                    components: {
                        default: () => import('./views/UserSettings.vue'),
                        sidebar: () => import('./components/Sidebar/SettingsSidebar.vue')
                    }
                }
            ]
        },
        {
            path: '/:pathMatch(.*)*',
            redirect: '/chat'
        }
    ]
})

router.beforeEach(to => {
  if (to.path.startsWith('/chat')) {
    const sessionToken = localStorage.getItem('currentSessionToken') || localStorage.getItem('sessionToken');
    if (!sessionToken) {
      return '/login';
    }

    const userId = localStorage.getItem('chatUserId');

    if (!userId) {
      return '/login';
    }
  }
  return true;
});

const pinia = createPinia()

pinia.use(createClearStorePlugin())

const app = createApp(App)
app.use(router)
setRouter(router)
app.use(pinia)
app.mount('#app')

export { router, resetAllStores, clearSpecificStore, pinia };