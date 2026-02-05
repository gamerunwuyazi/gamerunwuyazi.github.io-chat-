import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'

// 导入复制过来的 css 文件
import './css/index.css'
import './css/code-highlight.css'
import './css/mobile.css'

// 创建路由实例
const router = createRouter({
    history: createWebHashHistory(),
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
            path: '/chat',
            name: 'public',
            component: () => import('./views/PublicChat.vue')
        },
        {
            path: '/chat/group',
            name: 'group',
            component: () => import('./views/GroupChat.vue')
        },
        {
            path: '/chat/private',
            name: 'private',
            component: () => import('./views/PrivateChat.vue')
        },
        {
            path: '/settings',
            name: 'settings',
            component: () => import('./views/UserSettings.vue')
        },
        {
            path: '/',
            redirect: '/chat'
        },
        {
            path: '/:pathMatch(.*)*',
            redirect: '/chat'
        }
    ]
})

// 创建应用实例并使用路由
const app = createApp(App)
app.use(router)
app.mount('#app')
