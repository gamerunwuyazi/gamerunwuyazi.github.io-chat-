# simple-chat-room

一个基于 WebSocket 的实时聊天系统，支持公共聊天、私密聊天和群组聊天功能。

## 技术栈

### 后端
- **运行时**: Node.js 21+
- **框架**: Express 5 + Socket.IO 4
- **数据库**: MySQL 8+（主存储），Redis 7+（会话与在线状态）
- **构建**: esbuild（打包为单文件）

### 前端
- **框架**: Vue 3 + Pinia（状态管理）
- **构建**: Vite 8
- **WebSocket 客户端**: Socket.IO Client

## 功能特性

- 用户注册与登录（支持滑块验证码）
- 公共聊天室（全员消息）
- 私密聊天（一对一）
- 群组聊天（支持创建/加入群组、群管理）
- 文件与图片上传/分享
- 消息引用回复
- @用户 提醒
- 好友系统（添加/删除/搜索）
- 好友验证开关
- 在线状态显示
- 消息离线拉取
- IP 与 API 请求日志审计
- **端到端加密（E2EE）** - 私聊和群聊消息端到端加密，服务器无法查看明文
- **管理面板** - 完整的管理员后台，支持用户管理、群组管理、消息管理、文件管理、封禁管理

## 部署前准备

### 环境要求

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 21 | 运行时环境 |
| MySQL | >= 8.0 | 主数据库 |
| Redis | >= 7.0 | 会话缓存与在线状态 |
| npm | >= 10 | 包管理 |

## 部署步骤

### 1. 克隆项目并安装依赖

```bash
# 后端
cd scr-backend
npm install

# 前端
cd ../scr-web
npm install
```

### 2. 配置环境变量

```bash
cd scr-backend
cp .env.example .env.local
```

编辑 `.env.local`，根据实际环境修改以下必填项：

```ini
DB_HOST=localhost          # MySQL 地址
DB_USER=your_user          # MySQL 用户名
DB_PASSWORD=your_password  # MySQL 密码
DB_NAME=your_database      # 数据库名称
ADMIN_PASSWORD=your_admin_pwd  # 管理员密码
```

其余配置项可按需调整（端口、Redis、速率限制等），所有项均有默认值。

### 3. 配置前端环境变量

```bash
cd scr-web
cp .env.example .env
```

编辑 `.env`，设置后端服务地址：

```ini
VITE_SERVER_URL=http://localhost:3000  # 后端服务地址（留空则使用同域）
```

### 4. 启动 Redis 和 MySQL

确保 Redis 和 MySQL 服务已运行，且 MySQL 中已创建对应的数据库（无需手动建表，系统启动时会自动创建）。

### 5. 生成密钥

```bash
cd scr-backend
npm run generate-keys
```

### 6. 构建后端

```bash
cd scr-backend
npm run build
```

### 7. 启动后端服务

```bash
cd scr-backend
npm run server
```

后端默认监听端口 **3000**。

### 8. 启动前端（开发模式）

```bash
cd scr-web
npm run dev
```

前端开发服务器默认监听端口 **8080**，访问 `http://localhost:8080` 即可。

### 9. 生产环境构建前端

```bash
cd scr-web
npm run build
```

构建产物输出到 `scr-web/dist/` 目录，可部署到任意静态文件服务器（Nginx 等），并配置反向代理将 `/api`、`/socket.io/` 等路径转发到后端端口。

## 管理面板

系统提供完整的管理面板，用于监控和管理聊天室。

### 访问方式

访问地址：`http://your-domain/admin/login`

### 功能模块

- **仪表盘** - 统计概览（用户数、在线数、群组数、消息数、文件数、封禁数）
- **用户管理** - 用户列表、搜索、封禁、解封、踢下线
- **会话管理** - 在线会话列表、断开指定会话
- **群组管理** - 群组列表、详情、成员管理、禁言、踢人、解散
- **消息管理** - 公共/私聊/群聊消息查看、删除
- **文件管理** - 上传文件列表、删除
- **审计日志** - 所有管理操作记录

## 端到端加密

系统支持端到端加密（E2EE），确保消息隐私安全。

### 特性

- 使用浏览器 Web Crypto API 生成和管理密钥
- 私钥仅存储在用户浏览器本地，不上传服务器
- 支持私聊和群聊消息加密
- 加密消息在服务器端仅存储密文
- 兼容历史明文消息

## 项目结构

```
simple-chat-room/
├── scr-backend/           # 后端服务
│   ├── src/
│   │   ├── config/        # 配置
│   │   ├── middleware/     # 中间件（认证、错误处理、文件上传）
│   │   ├── models/        # 数据库连接
│   │   ├── routes/        # API 路由（含管理接口）
│   │   ├── services/      # 业务逻辑
│   │   ├── socket/        # WebSocket 事件处理
│   │   └── utils/         # 工具函数
│   ├── keys/              # 密钥文件（运行 generate-keys 生成）
│   ├── app.js             # 构建产物
│   ├── esbuild.config.mjs # 构建配置
│   └── generate-keys.mjs  # RSA 密钥对生成脚本
├── scr-web/               # Vue 3 前端
│   ├── src/
│   │   ├── components/     # 组件
│   │   ├── layouts/        # 布局（含管理面板布局）
│   │   ├── views/          # 页面（含管理面板页面）
│   │   ├── stores/         # Pinia 状态管理
│   │   ├── utils/          # 工具函数（含加密工具）
│   │   └── composables/    # 组合式函数
├── .trae/                 # Trae AI 规格文档
├── LICENSE                # MIT 开源协议
└── README.md              # 本文件
```

## 脚本说明

### 后端

| 命令 | 说明 |
|------|------|
| `npm run build` | 使用 esbuild 打包源码到 app.js（生产模式，压缩） |
| `npm run server` | 构建（生产模式）并启动服务 |
| `npm start` | 直接使用源码启动（不构建） |
| `npm run dev` | 开发模式（构建后监听源码变化自动重启） |
| `npm run devbuild` | 开发构建（仅构建，不压缩，不监听） |
| `npm run generate-keys` | 生成 RSA 2048 密钥对到 keys/ 目录 |
| `npm run lint` | 运行 ESLint 检查代码 |


### 前端

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产环境构建 |
| `npm run lint` | 运行 ESLint 检查代码 |

## 常见问题

**Q: 启动时提示"未检测到配置文件"**
A: 请确保已执行 `cp .env.example .env.local` 并填写配置。

**Q: 数据库连接失败**
A: 检查 MySQL 服务是否运行，以及 `.env.local` 中的数据库配置是否正确。

**Q: 前端连接不上后端**
A: 前端通过环境变量 `VITE_SERVER_URL` 配置后端地址（留空代表使用同域），在 `scr-web/.env.local` 中设置。

**Q: 管理面板无法访问**
A: 请确保已在 `.env.local` 中配置 `ADMIN_PASSWORD`，并使用正确的密码登录。

## 许可证

本项目基于 MIT 许可证开源 - 详见 [LICENSE](LICENSE) 文件。
