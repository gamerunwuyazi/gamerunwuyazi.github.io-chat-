# 聊天室后端 API 和 WebSocket 文档

## 1. 概述

本文档详细描述了聊天室后端的 HTTP API 端点和 WebSocket 事件，包括请求参数、响应格式和使用示例。

## 2. HTTP API 端点

### 2.1 公共接口

#### 2.1.1 健康检查
- **URL**: `/health`
- **方法**: `GET`
- **描述**: 检查服务器健康状态
- **响应示例**:
  ```json
  {
    "status": "ok",
    "timestamp": "2023-07-01T12:00:00.000Z",
    "activeSessions": 5,
    "message": "会话永不过期模式"
  }
  ```

#### 2.1.2 IP和用户状态检查
- **URL**: `/check-status`
- **方法**: `GET`
- **描述**: 检查客户端IP是否被封禁及用户是否存在
- **参数**:
  - `userId` (可选): 用户ID
- **响应示例**:
  ```json
  {
    "status": "success",
    "ipAddress": "192.168.1.1",
    "isBanned": false,
    "userExists": true,
    "remainingTime": null,
    "message": "状态正常"
  }
  ```

#### 2.1.3 用户名重复检查
- **URL**: `/check-username`
- **方法**: `GET`
- **描述**: 检查用户名是否已存在
- **参数**:
  - `username`: 要检查的用户名
- **响应示例**:
  ```json
  {
    "status": "success",
    "isAvailable": true,
    "username": "testuser"
  }
  ```

#### 2.1.4 获取验证码
- **URL**: `/captcha`
- **方法**: `GET`
- **描述**: 获取验证码
- **响应示例**:
  ```json
  {
    "status": "success",
    "captchaId": "1234567890abcdef",
    "captchaSvg": "<svg>...</svg>",
    "expireMinutes": 5
  }
  ```

### 2.2 用户认证

#### 2.2.1 用户注册
- **URL**: `/register`
- **方法**: `POST`
- **描述**: 用户注册
- **请求体**:
  ```json
  {
    "username": "testuser",
    "password": "password123",
    "nickname": "测试用户",
    "captchaId": "1234567890abcdef",
    "captchaCode": "1234"
  }
  ```
- **响应示例**:
  ```json
  {
    "status": "success",
    "message": "注册成功",
    "userId": 1
  }
  ```

#### 2.2.2 用户登录
- **URL**: `/login`
- **方法**: `POST`
- **描述**: 用户登录
- **请求体**:
  ```json
  {
    "username": "testuser",
    "password": "password123",
    "captchaId": "1234567890abcdef",
    "captchaCode": "1234"
  }
  ```
- **响应示例**:
  ```json
  {
    "status": "success",
    "message": "登录成功（会话永不过期）",
    "userId": 1,
    "nickname": "测试用户",
    "avatarUrl": "/avatars/avatar_1.png",
    "sessionToken": "abcdef1234567890"
  }
  ```

#### 2.2.3 会话状态检查
- **URL**: `/session-check`
- **方法**: `GET`
- **描述**: 检查会话是否有效
- **头部参数**:
  - `user-id`: 用户ID
  - `session-token`: 会话令牌
- **响应示例**:
  ```json
  {
    "status": "success",
    "valid": true,
    "userId": "1",
    "message": "会话有效（永不过期）"
  }
  ```

### 2.3 用户管理

#### 2.3.1 获取用户信息
- **URL**: `/user/:id`
- **方法**: `GET`
- **描述**: 获取用户信息
- **头部参数**:
  - `user-id`: 用户ID
  - `session-token`: 会话令牌
- **响应示例**:
  ```json
  {
    "status": "success",
    "user": {
      "id": 1,
      "username": "testuser",
      "nickname": "测试用户",
      "avatar_url": "/avatars/avatar_1.png"
    }
  }
  ```

#### 2.3.2 获取离线用户列表
- **URL**: `/offline-users`
- **方法**: `GET`
- **描述**: 获取最近7天内活跃过的离线用户列表
- **头部参数**:
  - `user-id`: 用户ID
  - `session-token`: 会话令牌
- **响应示例**:
  ```json
  {
    "status": "success",
    "users": [
      {
        "id": 2,
        "nickname": "离线用户",
        "last_online": "2023-07-01T12:00:00.000Z",
        "avatarUrl": "/avatars/avatar_2.png"
      }
    ]
  }
  ```

#### 2.3.3 上传头像
- **URL**: `/upload-avatar`
- **方法**: `POST`
- **描述**: 上传用户头像
- **头部参数**:
  - `user-id`: 用户ID
  - `session-token`: 会话令牌
- **请求体**: `multipart/form-data`
  - `avatar`: 头像文件（最大2MB）
- **响应示例**:
  ```json
  {
    "status": "success",
    "avatarUrl": "/avatars/avatar_1.png",
    "storageInfo": {
      "full": false,
      "size": 100.5,
      "sizeInGB": "0.10",
      "message": "当前头像存储使用: 100.50MB (0.10GB/5GB)"
    }
  }
  ```

#### 2.3.4 获取头像存储状态
- **URL**: `/avatar-storage`
- **方法**: `GET`
- **描述**: 获取头像存储状态
- **头部参数**:
  - `user-id`: 用户ID
  - `session-token`: 会话令牌
- **响应示例**:
  ```json
  {
    "status": "success",
    "storageInfo": {
      "full": false,
      "size": 100.5,
      "sizeInGB": "0.10",
      "message": "当前头像存储使用: 100.50MB (0.10GB/5GB)"
    }
  }
  ```

### 2.4 群组管理

#### 2.4.1 创建群组
- **URL**: `/create-group`
- **方法**: `POST`
- **描述**: 创建群组
- **头部参数**:
  - `user-id`: 用户ID
  - `session-token`: 会话令牌
- **请求体**:
  ```json
  {
    "userId": 1,
    "groupName": "测试群组",
    "description": "这是一个测试群组",
    "memberIds": [2, 3]
  }
  ```
- **响应示例**:
  ```json
  {
    "status": "success",
    "message": "群组创建成功",
    "group": {
      "id": 1,
      "name": "测试群组",
      "description": "这是一个测试群组",
      "creator_id": 1,
      "created_at": "2023-07-01T12:00:00.000Z",
      "creator_name": "测试用户"
    },
    "members": [
      {
        "id": 1,
        "nickname": "测试用户",
        "avatar_url": "/avatars/avatar_1.png"
      },
      {
        "id": 2,
        "nickname": "用户2",
        "avatar_url": "/avatars/avatar_2.png"
      },
      {
        "id": 3,
        "nickname": "用户3",
        "avatar_url": "/avatars/avatar_3.png"
      }
    ]
  }
  ```

#### 2.4.2 获取用户群组列表
- **URL**: `/user-groups/:userId`
- **方法**: `GET`
- **描述**: 获取用户所属的群组列表
- **头部参数**:
  - `user-id`: 用户ID
  - `session-token`: 会话令牌
- **响应示例**:
  ```json
  {
    "status": "success",
    "groups": [
      {
        "id": 1,
        "name": "测试群组",
        "description": "这是一个测试群组",
        "creator_id": 1,
        "created_at": "2023-07-01T12:00:00.000Z",
        "joined_at": "2023-07-01T12:00:00.000Z"
      }
    ],
    "timestamp": "2023-07-01T12:00:00.000Z"
  }
  ```

#### 2.4.3 获取可添加到群组的成员列表
- **URL**: `/available-group-members/:groupId`
- **方法**: `GET`
- **描述**: 获取可添加到群组的成员列表（仅群主可访问）
- **头部参数**:
  - `user-id`: 用户ID
  - `session-token`: 会话令牌
- **响应示例**:
  ```json
  {
    "status": "success",
    "members": [
      {
        "id": 4,
        "nickname": "用户4",
        "avatarUrl": "/avatars/avatar_4.png"
      }
    ]
  }
  ```

#### 2.4.4 获取群组信息
- **URL**: `/group-info/:groupId`
- **方法**: `GET`
- **描述**: 获取群组信息
- **头部参数**:
  - `user-id`: 用户ID
  - `session-token`: 会话令牌
- **响应示例**:
  ```json
  {
    "status": "success",
    "group": {
      "id": 1,
      "name": "测试群组",
      "description": "这是一个测试群组",
      "creator_id": 1,
      "created_at": "2023-07-01T12:00:00.000Z"
    }
  }
  ```

#### 2.4.5 获取群组成员
- **URL**: `/group-members/:groupId`
- **方法**: `GET`
- **描述**: 获取群组成员列表
- **头部参数**:
  - `user-id`: 用户ID
  - `session-token`: 会话令牌
- **响应示例**:
  ```json
  {
    "status": "success",
    "members": [
      {
        "id": 1,
        "nickname": "测试用户",
        "avatarUrl": "/avatars/avatar_1.png"
      },
      {
        "id": 2,
        "nickname": "用户2",
        "avatarUrl": "/avatars/avatar_2.png"
      }
    ]
  }
  ```

#### 2.4.6 获取群组消息
- **URL**: `/group-messages/:groupId`
- **方法**: `GET`
- **描述**: 获取群组消息
- **头部参数**:
  - `user-id`: 用户ID
  - `session-token`: 会话令牌
- **响应示例**:
  ```json
  {
    "status": "success",
    "messages": [
      {
        "id": 1,
        "userId": 1,
        "nickname": "测试用户",
        "avatarUrl": "/avatars/avatar_1.png",
        "content": "Hello, world!",
        "imageUrl": null,
        "filename": null,
        "fileUrl": null,
        "timestamp": 1625097600000
      }
    ]
  }
  ```

#### 2.4.7 踢出群组成员
- **URL**: `/remove-group-member`
- **方法**: `POST`
- **描述**: 踢出群组成员（仅群主可操作）
- **头部参数**:
  - `user-id`: 用户ID
  - `session-token`: 会话令牌
- **请求体**:
  ```json
  {
    "groupId": 1,
    "memberId": 2
  }
  ```
- **响应示例**:
  ```json
  {
    "success": true,
    "message": "成员已成功踢出"
  }
  ```

#### 2.4.8 群主拉取成员
- **URL**: `/add-group-members`
- **方法**: `POST`
- **描述**: 群主拉取成员加入群组
- **头部参数**:
  - `user-id`: 用户ID
  - `session-token`: 会话令牌
- **请求体**:
  ```json
  {
    "groupId": 1,
    "memberIds": [4, 5]
  }
  ```
- **响应示例**:
  ```json
  {
    "status": "success",
    "message": "成员添加成功",
    "addedCount": 2,
    "members": [
      {
        "id": 1,
        "nickname": "测试用户",
        "avatarUrl": "/avatars/avatar_1.png"
      },
      {
        "id": 2,
        "nickname": "用户2",
        "avatarUrl": "/avatars/avatar_2.png"
      },
      {
        "id": 3,
        "nickname": "用户3",
        "avatarUrl": "/avatars/avatar_3.png"
      },
      {
        "id": 4,
        "nickname": "用户4",
        "avatarUrl": "/avatars/avatar_4.png"
      },
      {
        "id": 5,
        "nickname": "用户5",
        "avatarUrl": "/avatars/avatar_5.png"
      }
    ]
  }
  ```

### 2.5 消息和文件

#### 2.5.1 刷新消息
- **URL**: `/refresh-messages`
- **方法**: `GET`
- **描述**: 刷新消息列表
- **头部参数**:
  - `user-id`: 用户ID
  - `session-token`: 会话令牌
- **参数**:
  - `groupId` (可选): 群组ID
  - `lastUpdate` (可选): 上次更新时间戳
- **响应示例**:
  ```json
  {
    "status": "success",
    "messages": [
      {
        "id": 1,
        "userId": 1,
        "nickname": "测试用户",
        "avatarUrl": "/avatars/avatar_1.png",
        "content": "Hello, world!",
        "imageUrl": null,
        "filename": null,
        "fileUrl": null,
        "timestamp": 1625097600000
      }
    ],
    "lastUpdate": 1625097600000,
    "hasNewMessages": false
  }
  ```

#### 2.5.2 文件上传
- **URL**: `/upload`
- **方法**: `POST`
- **描述**: 上传文件或图片
- **头部参数**:
  - `user-id`: 用户ID
  - `session-token`: 会话令牌
- **请求体**: `multipart/form-data`
  - `file` 或 `image`: 文件或图片
  - `userId`: 用户ID
  - `groupId` (可选): 群组ID
  - `fileType` (可选): 文件类型
- **响应示例** (图片):
  ```json
  {
    "status": "success",
    "imageUrl": "/uploads/1234567890-1234567890.png"
  }
  ```
- **响应示例** (文件):
  ```json
  {
    "status": "success",
    "fileUrl": "/uploads/1234567890-1234567890.pdf",
    "filename": "document.pdf"
  }
  ```

## 3. WebSocket 事件

### 3.1 客户端发送事件

#### 3.1.1 获取聊天历史
- **事件名**: `get-chat-history`
- **描述**: 获取聊天历史
- **数据**:
  ```json
  {
    "userId": 1,
    "sessionToken": "abcdef1234567890",
    "limit": 20,
    "loadMore": false,
    "olderThan": null
  }
  ```

#### 3.1.2 获取群组聊天历史
- **事件名**: `get-group-chat-history`
- **描述**: 获取群组聊天历史
- **数据**:
  ```json
  {
    "userId": 1,
    "sessionToken": "abcdef1234567890",
    "groupId": 1,
    "limit": 20,
    "loadMore": false,
    "olderThan": null
  }
  ```

#### 3.1.3 用户加入聊天室
- **事件名**: `user-joined`
- **描述**: 用户加入聊天室
- **数据**:
  ```json
  {
    "userId": 1,
    "nickname": "测试用户",
    "avatarUrl": "/avatars/avatar_1.png",
    "sessionToken": "abcdef1234567890"
  }
  ```

#### 3.1.4 用户头像更新
- **事件名**: `avatar-updated`
- **描述**: 用户头像更新
- **数据**:
  ```json
  {
    "userId": 1,
    "avatarUrl": "/avatars/avatar_1_new.png",
    "sessionToken": "abcdef1234567890"
  }
  ```

#### 3.1.5 加入群组
- **事件名**: `join-group`
- **描述**: 加入群组
- **数据**:
  ```json
  {
    "userId": 1,
    "sessionToken": "abcdef1234567890",
    "groupId": 1,
    "loadMore": false,
    "olderThan": null,
    "limit": 20
  }
  ```

#### 3.1.6 离开群组
- **事件名**: `leave-group`
- **描述**: 离开群组
- **数据**:
  ```json
  {
    "userId": 1,
    "sessionToken": "abcdef1234567890",
    "groupId": 1
  }
  ```

#### 3.1.7 更新用户昵称
- **事件名**: `update-nickname`
- **描述**: 更新用户昵称
- **数据**:
  ```json
  {
    "userId": 1,
    "newNickname": "新昵称",
    "sessionToken": "abcdef1234567890"
  }
  ```

### 3.2 服务器发送事件

#### 3.2.1 聊天历史
- **事件名**: `chat-history`
- **描述**: 聊天历史
- **数据**:
  ```json
  {
    "messages": [
      {
        "id": 1,
        "userId": 1,
        "nickname": "测试用户",
        "avatarUrl": "/avatars/avatar_1.png",
        "content": "Hello, world!",
        "imageUrl": null,
        "filename": null,
        "fileUrl": null,
        "timestamp": 1625097600000,
        "timestampISO": "2023-07-01T12:00:00.000Z",
        "sequence": 1
      }
    ],
    "lastUpdate": 1625097600000,
    "loadMore": false
  }
  ```

#### 3.2.2 群组聊天历史
- **事件名**: `group-chat-history`
- **描述**: 群组聊天历史
- **数据**:
  ```json
  {
    "groupId": 1,
    "messages": [
      {
        "id": 1,
        "userId": 1,
        "nickname": "测试用户",
        "avatarUrl": "/avatars/avatar_1.png",
        "content": "Hello, group!",
        "imageUrl": null,
        "filename": null,
        "fileUrl": null,
        "timestamp": 1625097600000,
        "timestampISO": "2023-07-01T12:00:00.000Z",
        "sequence": 1
      }
    ],
    "lastUpdate": 1625097600000,
    "loadMore": false
  }
  ```

#### 3.2.3 更新后的用户列表
- **事件名**: `users-updated`
- **描述**: 更新后的用户列表
- **数据**:
  ```json
  [
    {
      "id": 1,
      "nickname": "测试用户",
      "avatarUrl": "/avatars/avatar_1.png"
    },
    {
      "id": 2,
      "nickname": "用户2",
      "avatarUrl": "/avatars/avatar_2.png"
    }
  ]
  ```

#### 3.2.4 账户被封禁
- **事件名**: `account-banned`
- **描述**: 账户被封禁
- **数据**:
  ```json
  {
    "message": "您的IP已被封禁，无法访问",
    "ipAddress": "192.168.1.1",
    "isBanned": true,
    "remainingTime": {
      "days": 5,
      "hours": 0,
      "minutes": 0,
      "totalSeconds": 432000
    },
    "status": "error"
  }
  ```

#### 3.2.5 会话过期
- **事件名**: `session-expired`
- **描述**: 会话过期
- **数据**: 无

#### 3.2.6 错误信息
- **事件名**: `error`
- **描述**: 错误信息
- **数据**:
  ```json
  {
    "message": "错误描述"
  }
  ```

#### 3.2.7 账户在其他地方登录
- **事件名**: `account-logged-in-elsewhere`
- **描述**: 账户在其他地方登录
- **数据**:
  ```json
  {
    "message": "您的账号在其他设备上登录，请重新登录",
    "timestamp": "2023-07-01T12:00:00.000Z"
  }
  ```

#### 3.2.8 群组创建
- **事件名**: `group-created`
- **描述**: 群组创建
- **数据**:
  ```json
  {
    "groupId": 1,
    "groupName": "测试群组",
    "creatorId": 1,
    "members": [
      {
        "id": 1,
        "nickname": "测试用户",
        "avatar_url": "/avatars/avatar_1.png"
      },
      {
        "id": 2,
        "nickname": "用户2",
        "avatar_url": "/avatars/avatar_2.png"
      }
    ]
  }
  ```

#### 3.2.9 成员被移除
- **事件名**: `member-removed`
- **描述**: 成员被移除
- **数据**:
  ```json
  {
    "groupId": 1,
    "memberId": 2
  }
  ```

#### 3.2.10 成员被添加
- **事件名**: `members-added`
- **描述**: 成员被添加
- **数据**:
  ```json
  {
    "groupId": 1,
    "newMembers": [
      {
        "id": 4,
        "nickname": "用户4",
        "avatarUrl": "/avatars/avatar_4.png"
      }
    ],
    "allMembers": [
      {
        "id": 1,
        "nickname": "测试用户",
        "avatarUrl": "/avatars/avatar_1.png"
      },
      {
        "id": 2,
        "nickname": "用户2",
        "avatarUrl": "/avatars/avatar_2.png"
      },
      {
        "id": 3,
        "nickname": "用户3",
        "avatarUrl": "/avatars/avatar_3.png"
      },
      {
        "id": 4,
        "nickname": "用户4",
        "avatarUrl": "/avatars/avatar_4.png"
      }
    ]
  }
  ```

#### 3.2.11 收到消息
- **事件名**: `message-received`
- **描述**: 收到新消息
- **数据**:
  ```json
  {
    "id": 1,
    "userId": 1,
    "nickname": "测试用户",
    "avatarUrl": "/avatars/avatar_1.png",
    "content": "Hello, world!",
    "imageUrl": null,
    "filename": null,
    "fileUrl": null,
    "groupId": null,
    "timestamp": 1625097600000,
    "timestampISO": "2023-07-01T12:00:00.000Z",
    "sequence": 1
  }
  ```

## 4. 状态码

| 状态码 | 描述 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权访问 |
| 403 | 访问被拒绝 |
| 404 | 资源不存在 |
| 429 | 请求过于频繁 |
| 500 | 服务器错误 |

## 5. 认证方式

所有需要认证的接口都需要在请求头中包含以下参数：
- `user-id`: 用户ID
- `session-token`: 会话令牌

## 6. 数据格式

### 6.1 消息格式

```json
{
  "id": 1,
  "userId": 1,
  "nickname": "测试用户",
  "avatarUrl": "/avatars/avatar_1.png",
  "content": "消息内容",
  "imageUrl": "/uploads/image.png",
  "filename": "document.pdf",
  "fileUrl": "/uploads/document.pdf",
  "groupId": null,
  "timestamp": 1625097600000,
  "timestampISO": "2023-07-01T12:00:00.000Z",
  "sequence": 1
}
```

### 6.2 用户格式

```json
{
  "id": 1,
  "nickname": "测试用户",
  "avatarUrl": "/avatars/avatar_1.png"
}
```

### 6.3 群组格式

```json
{
  "id": 1,
  "name": "测试群组",
  "description": "这是一个测试群组",
  "creatorId": 1,
  "createdAt": "2023-07-01T12:00:00.000Z",
  "members": [
    {
      "id": 1,
      "nickname": "测试用户",
      "avatarUrl": "/avatars/avatar_1.png"
    }
  ]
}
```

## 7. 安全注意事项

1. 所有API请求都经过IP封禁检查
2. 登录失败次数过多会导致IP被封禁
3. 会话令牌使用安全的随机生成方式
4. 密码使用bcrypt进行哈希存储
5. 输入数据经过严格验证和清理，防止SQL注入和XSS攻击
6. 文件上传有大小限制和类型检查
7. 头像存储有容量限制
8. 敏感操作需要会话验证

## 8. 性能优化

1. 消息使用缓存机制，减少数据库查询
2. 会话永不过期，减少重新登录频率
3. 文件上传使用限流机制，防止服务器过载
4. 定期清理过期验证码，减少内存占用
5. 使用连接池管理数据库连接
6. WebSocket连接使用高效的事件驱动机制

## 9. 版本信息

- 版本: 1.0.0
- 发布日期: 2023-07-01
- 作者: 聊天室开发团队

## 10. 联系方式

如有问题或建议，请联系聊天室开发团队。