# 教培资讯 - 教培 K12 资讯聚合平台

教育培训行业资讯聚合平台，面向教培 K12 新媒体专员**本地部署**使用：集成官网导航、新闻文章抓取、AI 智能助手与本地工作台，开箱即用、无需注册登录。

> 说明：本平台为**单机本地工作台**，已移除「资源广场」「注册/登录」等需要联网多用户的模块。打开网页即自动以管理员身份进入，所有功能（含内容抓取）对本地用户直接开放。

## 功能特性

### 🏠 首页（网站导航）
- 左侧分类栏（系统预置分类：政策法规、学科资讯、考试招生、教育科技、学前教育、基础教育、高等教育）
- 网站卡片展示：带图标、简介、标签的卡片，点击即可跳转外链
- 分类筛选：按分类浏览不同领域的教育网站；"全部"则按分类分组
- 搜索功能：关键词搜索（匹配名称 / 描述 / 标签）

### 📰 教育资讯（文章聚合）
- 展示爬虫抓回的新闻文章列表
- 按分类、按来源类型（网站 / 公众号）筛选
- 关键词搜索（标题 / 摘要 / 来源名）、分页浏览

### 🤖 AI 智能助手
- 教育培训领域专用 AI 对话，回复结构化（推荐网站 / 操作流程 / 检索关键词 / 补充建议）
- 内置本地智能匹配模式（无需 API Key 即可使用）
- 支持 OpenAI 兼容协议，可配置任意 AI API（用户级 baseUrl / apiKey / model 覆盖）
- 教育热点话题引擎：按当月动态生成热点并一键提问
- 聊天历史记录与恢复、Markdown 渲染

### 👤 我的控制台
- **网站管理**：新增 / 编辑 / 删除自定义网站；支持从 URL 一键 AI 生成信息、上传图标（base64）
- **公众号管理**：单独添加 / 编辑 / 删除微信类型来源（`type=wechat`）
- **合集管理**：创建 / 编辑 / 删除网站合集（多选网站打包）
- **账号设置**：更新用户名、公司、部门、岗位、头像

### 🔧 管理后台（默认管理员身份，免登录进入）
- 用户管理：查看本地用户（当前为单一本地管理员）
- 网站管理：查看和删除所有网站
- 合集管理：查看和删除所有合集
- 内容抓取：触发爬虫抓取新闻（**对所有登录用户开放**，不再限定管理员）

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vite + React 18 + TypeScript + Tailwind CSS |
| 状态管理 | Zustand |
| 路由 | React Router v6 |
| 图标 | Lucide React |
| 后端 | Express.js + TypeScript（tsx 直接运行，无需编译） |
| 数据存储 | JSON 文件（零数据库依赖） |
| 认证 | JWT 自动鉴权（免注册 / 登录，启动即管理员） |
| AI 接口 | OpenAI 兼容协议代理 |

## 项目结构

```
edu-info-platform/
├── client/                     # 前端 (Vite + React)
│   ├── src/
│   │   ├── components/         # 通用组件
│   │   │   ├── Layout.tsx      # 主布局（侧边栏 + 顶栏）
│   │   │   ├── WebsiteCard.tsx # 网站卡片组件
│   │   │   ├── AIChat.tsx      # AI 聊天组件
│   │   │   └── WechatDialog.tsx# 公众号名片弹窗
│   │   ├── pages/              # 页面
│   │   │   ├── Home.tsx        # 首页（网站导航）
│   │   │   ├── Articles.tsx    # 教育资讯
│   │   │   ├── Dashboard.tsx   # 用户控制台
│   │   │   ├── Admin.tsx       # 管理后台
│   │   │   └── AIChatPage.tsx  # AI 助手页
│   │   ├── hooks/useApi.ts     # API 请求封装
│   │   ├── store/authStore.ts  # 认证状态管理（自动登录）
│   │   └── types/index.ts      # TypeScript 类型定义
│   └── ...
├── server/                     # 后端 (Express)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts         # 认证 API（自动登录）
│   │   │   ├── websites.ts     # 网站 CRUD API
│   │   │   ├── categories.ts   # 分类 API
│   │   │   ├── collections.ts  # 合集 API
│   │   │   ├── chat.ts         # AI 聊天 API
│   │   │   ├── crawl.ts        # 内容抓取 API
│   │   │   ├── workbuddy.ts    # WorkBuddy 检索接口
│   │   │   └── admin.ts        # 管理后台 API
│   │   ├── middleware/auth.ts  # JWT 认证中间件
│   │   ├── services/crawler.ts # 爬虫服务
│   │   ├── utils/storage.ts    # JSON 文件存储工具
│   │   ├── data/               # JSON 数据文件
│   │   └── index.ts            # 服务入口
│   └── .env                    # 环境变量配置
└── package.json                # 根配置
```

## 快速启动

### 1. 安装依赖

```bash
npm run install:all
```

### 2. 配置环境变量（可选）

复制模板文件，然后按需修改：

```bash
cp server/.env.example server/.env
```

```env
PORT=3001
JWT_SECRET=your-secret-key
OPENAI_API_KEY=sk-your-api-key-here    # 可选，配置后启用 AI 对话
OPENAI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
```

> `.env` 已加入 `.gitignore`，不会进入版本库。**不配置 API Key 也能正常使用 AI 助手**，系统会自动降级为本地智能匹配模式。

### 3. 启动开发环境

```bash
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3001

启动后浏览器打开前端地址即**自动以管理员身份进入**，无需注册或登录。

### 4. 生产构建

```bash
npm run build
```

## API 接口

### 认证（已免登录，自动管理员）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/profile` | 获取个人信息 |
| PUT | `/api/auth/profile` | 更新个人信息 |

> 应用启动即自动以管理员身份登录并写入 token，无注册 / 登录接口。

### 网站
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/websites` | 获取网站列表 |
| GET | `/api/websites/my` | 获取我的网站 |
| POST | `/api/websites` | 添加网站 |
| PUT | `/api/websites/:id` | 更新网站 |
| DELETE | `/api/websites/:id` | 删除网站 |

### 分类
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/categories` | 获取分类列表 |
| POST | `/api/categories` | 添加自定义分类（管理员） |
| PUT | `/api/categories/:id` | 更新分类（管理员） |
| DELETE | `/api/categories/:id` | 删除分类（管理员） |

### 合集
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/collections` | 获取我的合集 |
| GET | `/api/collections/:id` | 获取合集详情 |
| POST | `/api/collections` | 创建合集 |
| PUT | `/api/collections/:id` | 更新合集 |
| DELETE | `/api/collections/:id` | 删除合集 |

### AI 聊天
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | AI 对话 |
| GET | `/api/chat/history` | 聊天历史 |

### 内容抓取
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/crawl/trigger` | 触发内容抓取（所有登录用户可用） |
| GET | `/api/crawl/status` | 获取上次抓取状态 |

## 数据说明

所有数据存储在 `server/src/data/` 目录下的 JSON 文件中（首次启动会自动初始化默认分类、官方站点与公众号种子数据）：

- `users.json` - 本地用户数据（单一本地管理员）
- `websites.json` - 网站数据（含系统预置官方站点与公众号）
- `categories.json` - 系统预置分类
- `collections.json` - 合集数据
- `articles.json` - 已抓取的文章数据
- `chats.json` - 聊天记录

> **说明**：存放个人使用痕迹的文件（`users.json`、`chats.json`、`settings.json`、`collections.json`）已加入 `.gitignore`，**不会提交到版本库**。首次启动时服务会自动生成这些空文件，无需手动创建。
