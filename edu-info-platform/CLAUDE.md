# 教培资讯平台 — AI 运行手册

这是一个教育培训资讯聚合平台：前端 React + Vite，后端 Express + TypeScript（tsx 直接运行，无需编译），数据用 JSON 文件存储，无数据库。

## 你的任务

从解压后的这个文件夹，把项目跑起来并在浏览器打开网页，全程尽量少让用户动手。

## 运行步骤

### 1. 安装依赖

在项目根目录（含 `package.json` 的那个目录）执行：

```bash
npm run install:all
```

（等价于在根目录、server、client 各执行一次 `npm install`）

### 2. 启动

```bash
npm run dev
```

- 后端：http://localhost:3001
- 前端：http://localhost:5173

### 3. 验证成功

- 后端健康检查：访问 http://localhost:3001/api/health ，返回 `{"status":"ok",...}` 即正常
- 前端：浏览器打开 http://localhost:5173

### 4. 首次使用

- 打开网页即**自动以管理员身份进入**，无需注册或登录
- 在「管理后台 → 内容抓取」标签页可触发爬虫抓取新闻（已对所有使用用户开放，不再限定管理员）

## 配置说明（默认已可用，无需手动配置）

- `server/.env` 未随仓库提供（存放私密 Key）。如需配置：复制 `server/.env.example` 为 `server/.env` 再改
- AI 对话默认走「本地智能匹配」模式；要接入真实 AI，编辑 `server/.env`：
  - `OPENAI_API_KEY` 改成真实 key
  - `OPENAI_BASE_URL` / `AI_MODEL` 按需改（默认 DeepSeek）

## 环境要求

- Node.js 18 及以上。先执行 `node -v` 确认；若无 Node，先提示用户安装 https://nodejs.org

## 常见问题排查

- **端口被占用**：改 `server/.env` 的 `PORT`，并同步改 `client/vite.config.ts` 里 `/api` 代理的 target 端口
- **前端白屏/加载不出**：先确认后端 3001 已启动，看 `npm run dev` 终端有无报错
- **AI 不回复**：确认 `server/.env` 的 `OPENAI_API_KEY` 已填真实 key
- **依赖安装失败**：确认 Node 版本 ≥ 18，删除各目录 `node_modules` 后重试

## 数据说明

- 数据存于 `server/src/data/*.json`，首次启动会自动补齐默认分类和网站
- `articles.json` 是打包时自带的爬取结果（种子数据），删除后重新触发抓取即可重建
- 微信公众号来源不会被自动抓取（微信反爬），仅提供跳转入口
