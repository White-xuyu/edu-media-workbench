# 教培新媒体工具箱

一个仓库装两个本地应用：**教培新媒体工作台** + **信息聚合平台**。
从「找选题 → 写文案 → 做封面 → 合规检查 → 发小红书」整条链路都能在本机跑完，数据全部存在本地，不依赖任何云服务。

| 应用 | 端口 | 干什么 |
| --- | --- | --- |
| 教培新媒体工作台 `edu-media-workbench/` | **4000** | 选题日历、生成未来话题、写小红书文案、生成封面、合规自检、发布/存草稿到小红书 |
| 信息聚合平台 `edu-info-platform/` | 前端 **5173**、后端 API **3001** | 抓取教育部等 14 个来源的教育资讯 + AI 助手问答，给工作台提供素材 |

两者是**串联**的：工作台生成选题时会去调聚合平台的 `/api/articles` 拿最新资讯当素材。
所以两个都启动才是完整体验；只想要资讯和 AI 问答的话，单独跑聚合平台也可以。

---

## 快速开始

### 方式一：一键启动（Windows，推荐）

双击 **`启动应用.bat`**，它会：

1. 清掉 3001 / 4000 / 5173 上残留的旧进程（重复双击也不会端口冲突）
2. 依次拉起后端、前端、工作台
3. **轮询三个端口直到真正能访问**才打开浏览器（不是傻等固定秒数）

启动后自动打开：

- 信息聚合平台 <http://localhost:5173>
- 教培新媒体工作台 <http://localhost:4000>

不用了就双击 **`停止应用.bat`**。

> 三个黑色最小化窗口是服务本体，**关掉就等于停服务**，最小化即可。

### 方式二：手动启动

```bash
# 1) 聚合平台后端（3001）
cd edu-info-platform/server && npm install && npm run dev

# 2) 聚合平台前端（5173）
cd edu-info-platform/client && npm install && npm run dev

# 3) 教培新媒体工作台（4000）
cd edu-media-workbench && npm install && node server.js
```

---

## 首次使用必须做的两件事

### 1. 配大模型 Key（不配就只有部分功能可用）

两个应用各配各的，都是 OpenAI 兼容协议（DeepSeek / 通义 / 智谱等都行）。

**工作台** —— 复制 `edu-media-workbench/config.example.json` 为 `config.json`，填：

```json
{
  "llm": {
    "apiKey": "sk-xxxxxx",
    "baseUrl": "https://api.deepseek.com",
    "model": "deepseek-chat"
  }
}
```

**聚合平台** —— 复制 `edu-info-platform/server/.env.example` 为 `.env`，填：

```env
OPENAI_API_KEY=sk-xxxxxx
OPENAI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
```

> `config.json` 和 `.env` 都已在 `.gitignore` 中排除，**不会被提交**。别把自己的 Key 硬写进别的文件。

### 2. 登录小红书（要发布才需要）

在工作台「发布环境 / 风控护栏」里点 **「打开发布专用浏览器」**，扫码登录一次。
之后发布/存草稿会自动复用这个登录态。

---

## 目录结构

```
.
├─ edu-media-workbench/       工作台（4000）
│  ├─ server.js               Express 后端：LLM 调用、封面渲染、发布调度
│  ├─ xhs-publish.js          Playwright 发布脚本（CDP 反检测）
│  ├─ config.example.json     配置模板 → 另存为 config.json
│  ├─ prompts/                选题/文案/物料的提示词，可在页面上直接改
│  └─ public/                 前端（原生 HTML/CSS/JS，无构建）
│
├─ edu-info-platform/         信息聚合平台
│  ├─ server/                 Express + tsx，JSON 文件存储，零数据库
│  │  └─ src/data/            资讯/用户/网站源等数据（首次启动自动生成）
│  └─ client/                 React + Vite + TypeScript
│
├─ 启动应用.bat  /  停止应用.bat
├─ wait-ready.js              端口就绪探测（替代固定等待）
└─ kill-ports.js              启动前清理端口
```

---

## 功能要点

**选题日历**：工作台「生成未来话题」出选题后，点每张卡片的 **「确认排期」**（或顶部「全部确认排期」），
选题会按 Day1=今天、Day2=明天…… 自动写入日历，日期可单独改。日历圆点 = 已排期 / 已发布 / 已存草稿，
鼠标悬停可看标题与状态。

**资讯抓取**：在聚合平台「管理后台 → 内容抓取」手动触发，一次抓 14 个来源。
目前教育部、中国教育考试网、中国教育在线、中国教育信息化网、北京市教委可正常抓；
阳光高考被 WAF 拦截、中国教师资格网和智慧教育平台是前端渲染页面，这 3 个抓不到；
6 个公众号源按设计跳过（需在微信内查看）。**抓取没有定时任务，需手动点。**

**发布**：推荐走「推送到小红书草稿」，内容进草稿箱后自己在小红书后台检查再发，风险最低。
「直接发布」会触发平台风控，只有养熟的号才建议用。

---

## 常见问题

**端口被占用 / 打不开页面** —— 双击 `启动应用.bat` 会自动清理端口；手动启动时先跑 `node kill-ports.js`。

**侧边栏没有「AI 助手」** —— 说明前端没拿到登录 token，通常是后端（3001）还没起来。
现在页面会自动重试 60 秒并给出「重新连接」按钮，不会再静默消失；还不行就确认 3001 端口在监听。

**资讯标题出现乱码** —— 已在爬虫里做了字符集探测（GBK 站点按 GBK 解码）。如果哪天又出现，
清理 `edu-info-platform/server/src/data/articles.json` 里对应来源的条目后重新抓取即可。

**Node 版本** —— 需要 Node 18+（用到内置 `fetch` 和 `TextDecoder('gbk')`）。

---

## 说明

- 两个应用原本是独立仓库（`edu-info-platform`、`edu-media-workbench`），现合并为一个仓库便于分发，
  子目录内保留各自原有的 `.gitignore`，密钥文件均不入库。
- 数据全部存放在本地 JSON 文件与浏览器 `localStorage`，换机器不会自动同步。
- 小红书发布基于浏览器自动化，请遵守平台规则、控制发布频率。
