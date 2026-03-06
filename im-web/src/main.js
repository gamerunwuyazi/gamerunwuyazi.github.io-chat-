import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia } from 'pinia'
import App from './App.vue'

// 导入复制过来的 css 文件
import './css/index.css'
import './css/code-highlight.css'
import './css/mobile.css'

// 创建路由实例
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

// 全局路由守卫：检查用户是否登录
router.beforeEach((to, from, next) => {
    // 检查用户是否在 /chat 路由下
    if (to.path.startsWith('/chat')) {
        // 检查 localStorage 中的用户信息
        const currentUserStr = localStorage.getItem('currentUser');
        const chatUserId = localStorage.getItem('chatUserId');
        const userId = localStorage.getItem('userId');
        const sessionToken = localStorage.getItem('currentSessionToken') || localStorage.getItem('sessionToken');
        
        let isLoggedIn = false;
        
        if (currentUserStr) {
            try {
                const user = JSON.parse(currentUserStr);
                if (user && user.id && sessionToken) {
                    isLoggedIn = true;
                }
            } catch (e) {
                // ignore
            }
        }
        
        if (chatUserId && sessionToken) {
            isLoggedIn = true;
        }
        
        if (userId && sessionToken) {
            isLoggedIn = true;
        }
        
        if (!isLoggedIn) {
            next('/login');
            return;
        }
    }
    next();
})

// 创建Pinia实例
const pinia = createPinia()

// 创建应用实例并使用路由和Pinia
const app = createApp(App)
app.use(router)
app.use(pinia)
app.mount('#app')

// 将 router 挂载到 window 上供其他模块使用
window.router = router;
