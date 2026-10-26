// 教培新媒体本地工作台 —— 后端聚合服务
// 端口 4000，纯本机使用。所有外部系统（聚合平台/大模型API/发布脚本）都在这一层收口。
// PLAYWRIGHT_BROWSERS_PATH：不写死本机目录；优先继承环境变量，未设置则交给 playwright 默认缓存（~/.cache/ms-playwright）。
// 用户可用环境变量自定义；别人机器 `npx playwright install chromium` 即可，无需改路径。
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const { execFile, spawn } = require('child_process');

// TLS 验证保持默认开启（Obsidian 已移除，无需忽略自签证书）

const app = express();
app.use(express.json({ limit: '10mb' }));

const ROOT = __dirname;
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf-8'));
const PROMPTS_DIR = path.join(ROOT, 'prompts');
const OUTPUT_DIR = path.join(ROOT, 'output');
const KB_DIR = path.join(OUTPUT_DIR, 'knowledge');
const KB_INDEX = path.join(KB_DIR, 'index.json');
fs.mkdirSync(KB_DIR, { recursive: true });
const PLAYWRIGHT_DIR = path.join(os.homedir(), '.workbuddy/binaries/node/workspace/node_modules'); // WorkBuddy 受管 node 隔离工作区兜底（本机存在；他人 npm install 后主路径命中不触发）
const NODE_EXE = process.execPath; // 用「运行本服务的 node」启动子进程，换机器不用改路径
// 多路径回退加载 playwright：优先本工作区本地 node_modules（npm install 后），再回退隔离工作区，保证可移植
function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  try { return require(path.join(PLAYWRIGHT_DIR, 'playwright')); } catch (e2) {}
  return null;
}
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ---------- 校区配置（内置固定 + 用户自定义持久化）----------
const CAMPUSES_FILE = path.join(ROOT, 'campuses.json');
const BUILTIN_CAMPUSES = {
  '北京校区': ['北京', '海淀', '朝阳', '西城', '东城', '丰台', '北京中考', '北京高考', '北京小升初', '北京政策', '北京教育'],
  '唐山校区': ['唐山', '路北', '路南', '丰南', '唐山中考', '唐山高考', '唐山教育', '河北中考', '河北高考', '唐山政策'],
  '呼和浩特校区': ['呼和浩特', '呼市', '新城区', '赛罕区', '回民区', '内蒙古', '呼和浩特中考', '呼和浩特高考', '内蒙古教育', '蒙招考']
};
function loadCampuses() {
  let custom = {};
  try { custom = JSON.parse(fs.readFileSync(CAMPUSES_FILE, 'utf-8')); } catch (e) { custom = {}; }
  return { builtin: BUILTIN_CAMPUSES, custom };
}
function saveCampuses(custom) {
  try { fs.writeFileSync(CAMPUSES_FILE, JSON.stringify(custom, null, 2), 'utf-8'); } catch (e) {}
}

// ---------- 发布风控护栏 + CDP 真实浏览器连接 ----------
// 反检测思路（见《当浏览器自动化遇上平台风控》）：与其伪装成真实浏览器，不如直接复用用户真实浏览器。
// CDP 模式连上用户已登录、有浏览历史/书签的真实 Chrome/Edge，可大幅降低风控识别。
// 频率护栏避免"操作频繁"触发平台逐步加码的限流/警告。
const PUBLISH_GUARD_FILE = path.join(OUTPUT_DIR, 'publish-guard.json');
const CDP_DEFAULTS = {
  minIntervalMinutes: 10,                                   // 两次自动发布的最小间隔（分钟）
  minDraftIntervalMinutes: 15,                              // 两次「存小红书草稿」的最小间隔（分钟）
  cdpPort: 9222,                                            // 真实浏览器远程调试端口
  cdpBrowserPath: '',   // 空 → 自动探测 Edge/Chrome 常见安装位
  cdpProfileDir: ''      // 空 → 动态生成（本机复用 ~/.workbuddy/xhs-cdp-chrome 保留登录态；他人用同规则自动建）
};
// 自动探测浏览器可执行文件路径（Windows/macOS/Linux 常见安装位）
function detectBrowserPath() {
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/snap/bin/chromium', '/opt/microsoft/msedge/msedge'
  ];
  for (const p of candidates) { try { if (fs.existsSync(p)) return p; } catch (e) {} }
  return '';
}
// 发布专用浏览器配置目录：config 优先；否则用 ~/.workbuddy/xhs-cdp-chrome（本机复用旧登录态，他人自动创建）
function resolveProfileDir(configured) {
  if (configured && configured.trim()) return configured;
  return path.join(os.homedir(), '.workbuddy', 'xhs-cdp-chrome');
}
// 浏览器可执行文件：config 优先（且须存在）；否则自动探测
function resolveBrowserPath(configured) {
  if (configured && configured.trim() && fs.existsSync(configured)) return configured;
  return detectBrowserPath();
}
// 保留 config.json 中已有的 publish 字段（scriptPath/sessionDir/accountName），补齐缺失的 CDP 默认值
CONFIG.publish = Object.assign({}, CDP_DEFAULTS, CONFIG.publish || {});
// 封面/白皮书渲染用的无头浏览器：优先系统 Chrome/Edge（免 npx playwright install，换机器也能直接跑）
const RENDER_BROWSER = resolveBrowserPath(CONFIG.publish.cdpBrowserPath);
function chromiumLaunchOptions(options = {}) {
  return RENDER_BROWSER ? Object.assign({}, options, { executablePath: RENDER_BROWSER }) : options;
}
function loadGuard() {
  const empty = { lastPublishAt: null, lastDraftAt: null };
  try { return Object.assign(empty, JSON.parse(fs.readFileSync(PUBLISH_GUARD_FILE, 'utf-8')) || {}); }
  catch (e) { return empty; }
}
function saveGuard(g) {
  try { fs.writeFileSync(PUBLISH_GUARD_FILE, JSON.stringify(g, null, 2), 'utf-8'); } catch (e) {}
}
// 直连 127.0.0.1 探测 CDP 调试端口（不走系统代理，规避 ClashX 等把 localhost 转发代理导致 502 的坑）
function detectCDP(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: 1500 }, (r) => {
      let data = '';
      r.on('data', (c) => { data += c; });
      r.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve({ ok: true, wsUrl: j.webSocketDebuggerUrl || null, browser: j.Browser || j['User-Agent'] || '', version: j.BrowserVersion || '' });
        } catch (e) { resolve({ ok: false, error: 'parse' }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', () => { resolve({ ok: false, error: 'refused' }); });
  });
}

// 实时检测「发布专用浏览器」是否已登录小红书：连上活的浏览器，读其 cookie 判断登录态。
// 注意：启动浏览器用的是 --user-data-dir（profile），登录态只存在浏览器 cookie/profile 里，
// 不存在于任何独立的"会话目录"，因此必须以活浏览器 cookie 为准，而非探测磁盘目录。
async function detectXhsLogin() {
  const cdp = await detectCDP(CONFIG.publish.cdpPort);
  if (!cdp.ok) return { connected: false, loggedIn: false };
  const pw = loadPlaywright();
  if (!pw) return { connected: true, loggedIn: false, note: 'no-playwright' };
  let browser;
  try {
    browser = await pw.chromium.connectOverCDP('http://127.0.0.1:' + CONFIG.publish.cdpPort);
    const ctx = browser.contexts()[0];
    if (!ctx) return { connected: true, loggedIn: false, note: 'no-context' };
    const cookies = await ctx.cookies().catch(() => []);
    // 创作平台已登录标记（HttpOnly，仅登录后存在）；web_session 为消费端 App 登录标记
    const loggedIn = cookies.some(c =>
      c.name === 'galaxy_creator_session_id' ||
      c.name === 'access-token-creator.xiaohongshu.com' ||
      c.name === 'web_session'
    );
    return { connected: true, loggedIn };
  } catch (e) {
    return { connected: true, loggedIn: false, note: 'cdp-eval: ' + e.message };
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
  }
}

// ---------- 安全写入助手 ----------
// Windows 上 fs.writeFileSync 偶发 EPERM（被系统索引/杀毒/句柄占用），
// 用「临时文件 + rename 原子替换 + EPERM/EBUSY 重试」大幅提高稳定性。
function safeWriteJsonSync(filePath, content) {
  const enc = 'utf-8';
  const tmp = filePath + '.tmp';
  const writeOnce = () => fs.writeFileSync(tmp, content, enc);
  const tryWrite = () => {
    try { writeOnce(); }
    catch (e) {
      if (e.code !== 'EPERM' && e.code !== 'EBUSY' && e.code !== 'EACCES') throw e;
      // 句柄被占：短暂等待 + 重试一次
      const end = Date.now() + 400;
      while (Date.now() < end) {
        try { writeOnce(); return; } catch (e2) {
          if (e2.code !== 'EPERM' && e2.code !== 'EBUSY' && e2.code !== 'EACCES') throw e2;
        }
      }
      // 仍失败：删后重写
      try { fs.unlinkSync(filePath); } catch (e3) {}
      try { fs.unlinkSync(tmp); } catch (e3) {}
      writeOnce();
    }
  };
  tryWrite();
  try { fs.unlinkSync(filePath); } catch (e) {}
  try { fs.renameSync(tmp, filePath); } catch (e) {
    // rename 偶尔也 EPERM：最后兜底直接覆写
    try { fs.unlinkSync(tmp); } catch (e2) {}
    fs.writeFileSync(filePath, content, enc);
  }
}

// ---------- 违规日志 ----------
const VIOLATION_LOG = path.join(OUTPUT_DIR, 'violation_log.json');
function loadViolationLog() {
  try { return JSON.parse(fs.readFileSync(VIOLATION_LOG, 'utf-8')); } catch (e) { return []; }
}
function saveViolationLog(arr) {
  safeWriteJsonSync(VIOLATION_LOG, JSON.stringify(arr, null, 2));
}
// 统一写入口（手动记录 + 发布失败自动记录都走这里）
function recordViolation(o) {
  const entry = {
    id: 'vl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    type: o.type || 'warning',            // 'warning' | 'limit' | 'ban' | 'other'
    trigger: o.trigger || '未填写原因',
    detail: o.detail || '',
    action: o.action || '',
    auto: !!o.auto,                       // true = 系统自动记录，false = 手动填写
    time: new Date().toISOString()
  };
  const log = loadViolationLog();
  log.unshift(entry);
  saveViolationLog(log);
  return entry;
}
// 预置常见触发原因供用户选择
const VIOLATION_TRIGGERS = [
  '频繁发布（短时间内多条）',
  '标题含敏感/夸大词汇',
  '正文含违禁词',
  '图片/封面违规（水印、二维码、诱导）',
  '账号行为异常（自动化检测）',
  '内容重复/抄袭判定',
  '引流行为（微信号、加群等）',
  '其他'
];

// ---------- 违禁词清单（合规检查用，用户可在网页端编辑）----------
const BANNED_FILE = path.join(OUTPUT_DIR, 'banned_words.json');
const DEFAULT_BANNED_WORDS = [
  '保过','保提分','保录取','包过','100%通过','签约保过','不过退费','快速提分','精准提分','靶向提分','名校直通车','精准押题','押题准','稳上','稳提','必过',
  '命题专家','原命题教师','内部题库','官方指定','命题组','阅卷组','内部命题','真题泄露','内部渠道','绝密',
  '状元','喜报','红榜','光荣榜','家长感谢信','名师执教','名校名师','上岸案例','学员成绩',
  '国家级','最高级','最佳','最强','最优','顶级','极致','行业标杆','全网第一','销量第一','王牌','王者','史无前例','绝无仅有',
  '再不补习就落后','一步落后步步落后','分数决定未来','考不上高中就没有未来','名额紧张','考纲重大调整','输在起跑线','落后同龄人',
  '加微信','微信号','公众号','私信我','扫码领','0元学','免费领资料'
];
function loadBannedWords() {
  try { return JSON.parse(fs.readFileSync(BANNED_FILE, 'utf-8')); } catch (e) { return DEFAULT_BANNED_WORDS.slice(); }
}
function saveBannedWords(arr) {
  const clean = Array.from(new Set(arr.map(s => String(s).trim()).filter(Boolean)));
  safeWriteJsonSync(BANNED_FILE, JSON.stringify(clean, null, 2));
  return clean;
}
// 首次启动用默认词表 seed（之后完全以文件为准，用户编辑持久化）
if (!fs.existsSync(BANNED_FILE)) saveBannedWords(DEFAULT_BANNED_WORDS);

// ---------- 运行时读取 LLM 配置（候选链，不落盘）----------
function parseEnvFile(p) {
  const out = {};
  try {
    const txt = fs.readFileSync(p, 'utf-8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch (e) { /* 忽略缺失文件 */ }
  return out;
}
function isRealKey(k) { return k && k.length > 20 && !/your|example|xxxx|placeholder/i.test(k); }
function loadLLMConfig() {
  // llm.source 设计：'direct'（默认，走下方候选链）/ 'platform'（待接入 edu-info-platform 的 /api/chat，需 JWT/token）
  // 本轮仅保留 'direct'，platform 分支在「API 单聊」轮实现。
  if (CONFIG.llm && CONFIG.llm.source === 'platform') {
    // TODO(平台接入): 用 CONFIG.llm.platformToken 调 edu-info-platform /api/chat
    console.log('[LLM] source=platform 尚未实现，回退到 direct 候选链');
  }
  // 1) config.json 的 llm 段（用户自己的 key，最优先）
  if (CONFIG.llm && isRealKey(CONFIG.llm.apiKey)) {
    return { apiKey: CONFIG.llm.apiKey, baseUrl: (CONFIG.llm.baseUrl || 'https://api.deepseek.com').replace(/\/$/, ''), model: CONFIG.llm.model || 'deepseek-chat', src: 'config.json' };
  }
  // 2) 用户平台 edu-info-platform 的 OPENAI_*（若真实配置）
  const a = parseEnvFile(CONFIG.platform.envPath);
  if (isRealKey(a.OPENAI_API_KEY)) {
    return { apiKey: a.OPENAI_API_KEY, baseUrl: (a.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''), model: a.AI_MODEL || 'gpt-4o-mini', src: 'edu-info-platform' };
  }
  // 3) 用户自备的兜底 .env（通过 config.json 的 llm.fallbackEnvPath 指定，可移植；未配置则跳过）
  const fb = CONFIG.llm && CONFIG.llm.fallbackEnvPath;
  if (fb) {
    const b = parseEnvFile(fb);
    if (isRealKey(b.DEEPSEEK_API_KEY)) {
      return { apiKey: b.DEEPSEEK_API_KEY, baseUrl: (b.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''), model: b.DEEPSEEK_CHAT_MODEL || 'deepseek-chat', src: 'fallbackEnv' };
    }
    if (isRealKey(b.OPENAI_API_KEY)) {
      return { apiKey: b.OPENAI_API_KEY, baseUrl: (b.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''), model: b.AI_MODEL || 'gpt-4o-mini', src: 'fallbackEnv' };
    }
  }
  return { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', src: '无' };
}
let LLM = loadLLMConfig();

// ---------- 工具 ----------
async function fetchText(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  return { status: res.status, body: text };
}
// Obsidian 集成已移除（obsBase / obsHeaders / obsidianGet）
async function callLLM(system, user) {
  if (!LLM.apiKey) throw new Error('未配置大模型 API Key。请在 config.json 的 llm.apiKey 填入你的 DeepSeek/OpenAI Key（或在 llm.fallbackEnvPath 指向含 key 的 .env 文件）。当前来源：' + LLM.src);
  const url = `${LLM.baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LLM.apiKey },
    body: JSON.stringify({
      model: LLM.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.8
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error('LLM 错误: ' + (data.error && data.error.message || res.status));
  return (data.choices && data.choices[0] && data.choices[0].message.content) || '';
}

// 选题纯文本解析：按 DayN / 标题：/ 角度：/ 钩子： 拆成数组（容错）
function parseTopics(text) {
  let t = String(text).replace(/```[\s\S]*?```/g, '').trim();
  const blocks = t.split(/\n\s*---\s*\n/);
  const days = [];
  for (const blk of blocks) {
    const dayM = blk.match(/Day\s*(\d+)/i);
    if (!dayM) continue;
    const day = parseInt(dayM[1], 10);
    let title = '', angle = '', hook = '';
    for (const line of blk.split('\n')) {
      const m = line.match(/^\s*(标题|角度|钩子)\s*[：:]\s*(.*)$/);
      if (!m) continue;
      if (m[1] === '标题') title = m[2].trim();
      else if (m[1] === '角度') angle = m[2].trim();
      else if (m[1] === '钩子') hook = m[2].trim();
    }
    if (title) days.push({ day, title, angle, hook });
  }
  return days;
}

// ---------- 静态前端 ----------
app.use(express.static(path.join(ROOT, 'public')));
app.use('/output', express.static(OUTPUT_DIR));

// ---------- 状态灯 ----------
app.get('/api/status', async (req, res) => {
  const out = { platform: null, xiaohongshu: null, llmConfigured: false };
  try {
    const r = await fetchText(CONFIG.platform.baseUrl + '/api/health');
    out.platform = { ok: r.status === 200, detail: r.status === 200 ? '运行正常' : ('HTTP ' + r.status) };
  } catch (e) { out.platform = { ok: false, detail: e.message }; }
  try { out.llmConfigured = !!LLM.apiKey; } catch (e) {}
  try {
    // 实时检测：发布专用浏览器是否连上 + 是否真已登录小红书（读活浏览器 cookie）
    const login = await detectXhsLogin();
    let level = 'bad', detail = '';
    if (!login.connected) {
      level = 'bad'; detail = '未连接发布浏览器';
    } else if (login.loggedIn) {
      level = 'ok'; detail = '已连接并已登录小红书';
    } else if (login.note === 'no-playwright') {
      level = 'warn'; detail = '已连接浏览器（缺少 playwright，无法校验登录态）';
    } else {
      level = 'warn'; detail = '已连接浏览器，但未检测到小红书登录态';
    }
    out.xiaohongshu = { ok: level === 'ok', level, detail, accountName: CONFIG.publish.accountName || '', connected: login.connected, loggedIn: login.loggedIn };
  } catch (e) { out.xiaohongshu = { ok: false, detail: e.message }; }
  res.json(out);
});

// ---------- 聚合平台：资讯 + 素材检索 ----------
app.get('/api/news', async (req, res) => {
  try {
    const page = req.query.page || 1, pageSize = req.query.pageSize || 20;
    const r = await fetchText(`${CONFIG.platform.baseUrl}/api/articles?page=${page}&pageSize=${pageSize}`);
    res.status(r.status).send(r.body);
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const r = await fetchText(`${CONFIG.platform.baseUrl}/api/workbuddy/search?q=${encodeURIComponent(q)}&limit=10`);
    res.status(r.status).send(r.body);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// ---------- 校区：内置 + 自定义（持久化到 campuses.json）----------
app.get('/api/campuses', (req, res) => {
  const { builtin, custom } = loadCampuses();
  const builtinList = Object.keys(builtin).map(name => ({ name, keywords: builtin[name], builtin: true }));
  const customList = Object.keys(custom).map(name => ({ name, keywords: custom[name], builtin: false }));
  res.json({ campuses: [...builtinList, ...customList] });
});
app.post('/api/campuses', (req, res) => {
  const { name, keywords, action } = req.body || {};
  const { builtin, custom } = loadCampuses();
  if (action === 'delete') {
    if (builtin[name]) return res.status(400).json({ error: '内置校区不可删除' });
    if (!custom[name]) return res.status(404).json({ error: '自定义校区不存在' });
    delete custom[name];
    saveCampuses(custom);
    return res.json({ ok: true });
  }
  if (!name || !Array.isArray(keywords) || !keywords.length) return res.status(400).json({ error: '校区名和关键词必填' });
  if (builtin[name] || custom[name]) return res.status(400).json({ error: '校区名已存在' });
  custom[name] = keywords;
  saveCampuses(custom);
  res.json({ ok: true });
});

// ---------- 配置 API（替代 Obsidian 入口）----------
const CONFIG_PATH = path.join(__dirname, 'config.json');
function maskKey(k) {
  if (!k || k.length <= 6) return '';
  return k.slice(0, 4) + '••••••' + k.slice(-2);
}
function safeConfigForFrontend() {
  const llm = CONFIG.llm || {};
  const pub = CONFIG.publish || {};
  return {
    llm: {
      source: llm.source || 'direct',
      apiKey: maskKey(llm.apiKey),
      apiKeySet: isRealKey(llm.apiKey),
      baseUrl: llm.baseUrl || 'https://api.deepseek.com',
      model: llm.model || 'deepseek-chat'
    },
    platform: { baseUrl: (CONFIG.platform && CONFIG.platform.baseUrl) || 'http://localhost:3001' },
    publish: {
      minIntervalMinutes: pub.minIntervalMinutes || 60,
      minDraftIntervalMinutes: pub.minDraftIntervalMinutes || 15,
      humanize: pub.humanize || { enabled: true, intensity: 'normal' },
      cdpPort: pub.cdpPort || 9222
    }
  };
}
app.get('/api/config', (req, res) => {
  res.json(safeConfigForFrontend());
});
app.post('/api/config', (req, res) => {
  try {
    const b = req.body || {};
    if (b.llm) {
      CONFIG.llm = CONFIG.llm || {};
      if (typeof b.llm.source === 'string') CONFIG.llm.source = b.llm.source;
      // 只覆盖非空且非脱敏值的 key（避免把前端回传的 •••• 写回文件）
      if (b.llm.apiKey && !String(b.llm.apiKey).includes('•')) CONFIG.llm.apiKey = b.llm.apiKey;
      if (typeof b.llm.baseUrl === 'string') CONFIG.llm.baseUrl = b.llm.baseUrl;
      if (typeof b.llm.model === 'string') CONFIG.llm.model = b.llm.model;
      LLM = loadLLMConfig();
    }
    if (b.platform) {
      CONFIG.platform = CONFIG.platform || {};
      if (typeof b.platform.baseUrl === 'string') CONFIG.platform.baseUrl = b.platform.baseUrl;
    }
    if (b.publish) {
      CONFIG.publish = CONFIG.publish || {};
      if (b.publish.minIntervalMinutes != null) CONFIG.publish.minIntervalMinutes = Number(b.publish.minIntervalMinutes) || 60;
      if (b.publish.minDraftIntervalMinutes != null) CONFIG.publish.minDraftIntervalMinutes = Number(b.publish.minDraftIntervalMinutes) || 15;
      if (b.publish.humanize) CONFIG.publish.humanize = b.publish.humanize;
      if (b.publish.cdpPort != null) CONFIG.publish.cdpPort = Number(b.publish.cdpPort) || 9222;
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2), 'utf-8');
    res.json({ ok: true, config: safeConfigForFrontend(), llmConfigured: !!LLM.apiKey });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/config/test-llm', async (req, res) => {
  try {
    if (!LLM.apiKey) return res.json({ ok: false, detail: '未配置 API Key' });
    const r = await callLLM('你是配置测试助手，只做连通性校验。', '请只回复「通过」两个字。');
    res.json({ ok: true, detail: '连接成功，模型返回：' + (r || '').slice(0, 30) });
  } catch (e) { res.json({ ok: false, detail: e.message }); }
});

// ---------- 知识库（内置轻量，替代 Obsidian/白皮书上传）----------
function loadKBIndex() {
  try {
    const raw = JSON.parse(fs.readFileSync(KB_INDEX, 'utf-8'));
    let collections = [], items = [];
    if (Array.isArray(raw)) { items = raw.map(x => ({ ...x, collectionId: x.collectionId || null })); }
    else { collections = Array.isArray(raw.collections) ? raw.collections : []; items = Array.isArray(raw.items) ? raw.items : []; }
    // 可移植化：index.json 中存的是打包机上的绝对路径，换机器后失效 → 用 basename 回退到当前 KB_DIR
    items = items.map(x => {
      const fix = (p) => {
        if (!p) return p;
        if (fs.existsSync(p)) return p;
        const cand = path.join(KB_DIR, path.basename(p));
        return fs.existsSync(cand) ? cand : p;
      };
      return { ...x, absPath: fix(x.absPath), textPath: fix(x.textPath) };
    });
    return { collections, items };
  } catch (e) { return { collections: [], items: [] }; }
}
function saveKBIndex(data) {
  if (Array.isArray(data)) data = { collections: [], items: data };
  fs.writeFileSync(KB_INDEX, JSON.stringify(data, null, 2), 'utf-8');
}
const KB_ALLOWED = ['.txt', '.md', '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv'];
// 上传：multer 流式落盘（去掉 base64，大文件更快且不阻塞事件循环）
const multer = require('multer');
const kbStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, KB_DIR),
  filename: (req, file, cb) => {
    const id = 'kb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const safe = (file.originalname || 'doc').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5.-]/g, '_');
    req.kbId = id;
    cb(null, id + '_' + safe);
  }
});
const kbUpload = multer({ storage: kbStorage, limits: { fileSize: 80 * 1024 * 1024 } });
// ---------- 知识库解析清洗（去网页导航垃圾 / 合并中文逐字断行 / 标题转 Markdown）----------
// 噪声词白名单（只删"短行 + 命中"，避免误伤正文）
const NAV_NOISE = ['首页', '政务公开', '办事服务', '互动交流', '无障碍', '网站地图', '联系我们', '访问我的专属空间', '用户登录', '设为首页', '加入收藏', '版权所有', 'ICP备', '京ICP', '主办单位', '承办单位', '技术支持', '友情链接', '网站标识码', '京公网安备', '微信扫一扫', '扫一扫', '分享到', '打印本页', '关闭窗口', '返回顶部', '上一页', '下一页', '发布时间', '信息来源', '浏览次数', '阅读次数', '访问量', '主题分类', '成文日期', '分享：', '分享:', '智能问答', '政务邮箱', '请输入关键字', '搜本网', '相关解读', '政民互动', '工作动态', '便民服务', '关于我们', '站点地图', '建议意见', '法律声明', '市民服务热线', '政策解读', '政策文件'];
// 视为"句子完整结束"的行尾标点：以此结尾的行不再与其后行合并
const SENT_END = /[。！？；：”"』」）》】〕…—]$/;
function cleanParsedText(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/\r/g, '').replace(/\u0000/g, '');
  const lines = s.split('\n');
  const out = [];
  for (let ln of lines) {
    const t = ln.trim();
    if (!t) { out.push(''); continue; }                 // 保留空行做段落分隔
    if (/^--\s*\d+\s+of\s+\d+\s*--$/.test(t)) continue; // 1) PDF 分页标记 -- N of M --
    const noUrl = t.replace(/\([^)]*\)/g, '').trim();   // 去掉行内 URL 残留
    const hasUrl = /\([^)]*\)/.test(t);
    if (hasUrl && !noUrl) continue;                     // 2) 只有链接没有文字 → 删
    if (hasUrl && [...noUrl].length <= 4) continue;     // 3) 链接 + 短残片（如"(../../)务公开"）→ 删
    if (t.includes('>') && /\(\.{1,2}\//.test(t) && [...noUrl].length <= 20) continue; // 4) 面包屑导航
    if ([...t].length <= 40 && NAV_NOISE.some(w => t.includes(w))) continue;          // 5) 导航/页眉页脚垃圾行
    const last = out[out.length - 1];
    if (last && last.trim() === t) continue;            // 6) 连续重复行只留一次
    // 7) 标题转 Markdown（短行 + 公文/编号结构；标题与正文粘连时拆开）
    if ([...t].length <= 60) {
      let h = null, head = '';
      const m1 = t.match(/^第[一二三四五六七八九十百0-9]+[章节条部分款]/);
      const m2 = t.match(/^（[一二三四五六七八九十0-9]+）|^[一二三四五六七八九十]+、/);
      const m3 = t.match(/^[0-9]{1,3}[.、．](?!\d)/);
      if (m1) { h = '###'; head = m1[0]; }
      else if (m2) { h = '####'; head = m2[0]; }
      else if (m3) { h = '####'; head = m3[0]; }
      if (h) {
        out.push(h + ' ' + head);
        const rest = t.slice(head.length).trim();
        if (rest) out.push(rest);
        continue;
      }
    }
    // 8) 合并中文逐字断行：前一行未以句末标点结束，且本行以中文/数字/引号/〔开头 → 拼接
    if (last && last.trim() && !SENT_END.test(last.trim()) && /^[\u4e00-\u9fa5\u3001\u201c0-9（〔]/.test(t)) {
      out[out.length - 1] = last + t;
      continue;
    }
    out.push(t);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim(); // 9) 连续 3+ 空行压缩为 1
}
// 清洗文件名：去掉 PDF 下载时浏览器追加的网站/栏目后缀，避免列表超长
function cleanOriginalName(name) {
  let s = String(name || '');
  for (const w of ['首都之窗', '北京市人民政府门户网站', '政策文件', '规范性文件', '通知公告', '政府信息公开', '新闻动态', '政务公开']) {
    s = s.split(w).join('');
  }
  s = s.replace(/_+/g, '_').replace(/^_+|_(?=\.)/g, '').trim();
  return s || '文档';
}
async function parseFileToText(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.txt' || ext === '.md') return await fs.promises.readFile(absPath, 'utf-8');
  let text = '';
  if (ext === '.pdf') {
    const { PDFParse } = require('pdf-parse');
    const buf = await fs.promises.readFile(absPath);
    const out = await new PDFParse({ data: buf }).getText();
    text = out.text || '';
  } else if (ext === '.docx' || ext === '.doc') {
    const mammoth = require('mammoth');
    const out = await mammoth.extractRawText({ path: absPath });
    text = out.value || '';
  } else if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(absPath);
    const sheets = [];
    for (const name of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      if (csv.trim()) sheets.push(`【工作表：${name}】\n${csv}`);
    }
    text = sheets.join('\n\n') || '';
    return text; // 表格保持原样（结构不能被断行合并破坏）
  } else {
    const t = await fs.promises.readFile(absPath, 'utf-8').catch(() => null);
    if (t !== null) return t;
    throw new Error('不支持的文件类型：' + ext + '，仅支持 txt/md/pdf/docx/doc/xlsx/xls/csv');
  }
  return cleanParsedText(text); // PDF/docx 过清洗 pipeline
}
// 解析队列：限制并发，避免多个大文件同时解析占满事件循环导致上传/删除卡顿
const parseQueue = [];
let parsingCount = 0;
const MAX_PARSE = 2;
function enqueueParse(rec) { parseQueue.push(rec); pumpParse(); }
function pumpParse() {
  while (parsingCount < MAX_PARSE && parseQueue.length) {
    const rec = parseQueue.shift();
    parsingCount++;
    runParse(rec).catch(() => {}).finally(() => { parsingCount--; pumpParse(); });
  }
}
async function runParse(rec) {
  try {
    const text = await parseFileToText(rec.absPath);
    fs.writeFileSync(rec.textPath, text, 'utf-8');
    // 新产物为 .md 时，清理同名旧 .txt 残留（旧版本遗留，避免双份）
    if (rec.textPath.endsWith('.md')) {
      try { const oldTxt = rec.textPath.slice(0, -3) + '.txt'; if (fs.existsSync(oldTxt)) fs.unlinkSync(oldTxt); } catch (e) {}
    }
    rec.status = 'ready'; rec.textLen = [...text].length; rec.error = null;
  } catch (e) { rec.status = 'error'; rec.error = e.message; rec.textLen = 0; }
  const data = loadKBIndex();
  const idx = data.items.findIndex(x => x.id === rec.id);
  if (idx >= 0) data.items[idx] = rec; else data.items.push(rec);
  saveKBIndex(data);
}
// 生成物料/选题时：拉取知识库已解析文本（全文分段 + 可选关键词粗筛优先）
async function gatherKnowledge(kws) {
  let kb = '';
  try {
    const items = loadKBIndex().items.filter(x => x.status === 'ready' && x.textPath && fs.existsSync(x.textPath));
    for (const it of items.slice(0, 12)) {
      let t = '';
      try { t = fs.readFileSync(it.textPath, 'utf-8'); } catch (e) {}
      if (!t) continue;
      // 兼容历史 .txt 残留（旧版未清洗），统一再过一遍清洗
      if (it.textPath.endsWith('.txt')) t = cleanParsedText(t);
      let picked = t;
      if (Array.isArray(kws) && kws.length) {
        // 关键词粗筛：命中校区/主题词的段落优先拼入，未命中段落兜底，单文件总长截断 8000 字
        const paras = t.split(/\n{2,}/);
        const hit = paras.filter(p => kws.some(k => p.includes(k)));
        const rest = paras.filter(p => !kws.some(k => p.includes(k)));
        picked = [...hit, ...rest].join('\n\n').slice(0, 8000);
      } else {
        picked = t.slice(0, 8000);
      }
      kb += `\n\n【知识库·${it.originalName}】\n` + picked;
    }
  } catch (e) { kb = '（知识库读取失败：' + e.message + '）'; }
  return kb || '（无）';
}
// 解析校区关键词（内置扩展词 + 自定义标签）
function resolveCampusKeywords(name) {
  const { builtin, custom } = loadCampuses();
  return (builtin[name] || custom[name] || [name]).slice();
}
// 校区定向检索：对校区名+扩展词（OR 合并）分别检索聚合平台与本地知识库，合并去重
async function searchByCampus(campusName) {
  const kws = resolveCampusKeywords(campusName);
  const platformHits = [];
  const fileHits = [];
  // 聚合平台检索（平台没起则静默跳过）
  for (const kw of kws) {
    try {
      const r = await fetchText(`${CONFIG.platform.baseUrl}/api/workbuddy/search?q=${encodeURIComponent(kw)}&limit=5`);
      let j = {};
      try { j = JSON.parse(r.body); } catch (e) {}
      const items = j.results || j.articles || j.data || [];
      for (const it of items) {
        const title = it.title || it.name || '';
        const snippet = String(it.snippet || it.content || it.body || it.text || '').slice(0, 200);
        if (title || snippet) platformHits.push(`【聚合平台·${kw}】${title}：${snippet}`);
      }
    } catch (e) { /* 平台未运行，跳过 */ }
  }
  // 本地知识库（上传文件）grep
  try {
    const items = loadKBIndex().items.filter(x => x.status === 'ready' && x.textPath && fs.existsSync(x.textPath));
    for (const it of items) {
      let t = '';
      try { t = fs.readFileSync(it.textPath, 'utf-8'); } catch (e) { continue; }
      for (const kw of kws) {
        const idx = t.indexOf(kw);
        if (idx >= 0) {
          // 取命中处所在整段（\n\n 分界），比固定 ±180 字更完整；段落内残留的 URL 行一并滤掉
          const segStart = Math.max(0, t.lastIndexOf('\n\n', idx));
          const segEnd = t.indexOf('\n\n', idx + kw.length);
          const segRaw = t.slice(segStart, segEnd === -1 ? t.length : segEnd).trim();
          const seg = segRaw.split('\n').filter(l => !/\([^)]*\)/.test(l)).join('\n').trim();
          fileHits.push(`【上传文件·${it.originalName}·${kw}】${seg.slice(0, 500)}`);
          break; // 一个文件命中任一关键词即取一段，避免重复
        }
      }
    }
  } catch (e) {}
  const platformCount = platformHits.length;
  const fileCount = fileHits.length;
  const material = [...platformHits, ...fileHits].slice(0, 30).join('\n\n');
  const degraded = platformCount === 0; // 平台未贡献任何命中（离线/无结果）
  return {
    material: material || '（该校区暂未检索到本地素材，已按通用视角生成，建议上传该校区资料后重试）',
    platformCount, fileCount, campusName, keywords: kws, degraded
  };
}
// 上传（multipart 流式落盘 → 异步解析）
app.post('/api/knowledge/upload', kbUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    const rawName = req.file.originalname || 'doc';
    const ext = (path.extname(rawName) || '').toLowerCase();
    if (!KB_ALLOWED.includes(ext)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({ error: '不支持的文件类型：' + (ext || '未知') + '（仅支持 txt/md/pdf/docx/doc/xlsx/xls/csv）' });
    }
    const data = loadKBIndex();
    let collectionId = null;
    if (req.body && req.body.collectionId && data.collections.some(c => c.id === req.body.collectionId)) collectionId = req.body.collectionId;
    const id = req.kbId;
    const fpath = req.file.path;
    const rec = {
      id, originalName: cleanOriginalName(rawName), savedName: req.file.filename, absPath: fpath,
      ext, size: req.file.size, uploadedAt: new Date().toISOString(),
      status: 'parsing', textLen: 0, error: null, textPath: fpath + '.md', collectionId
    };
    data.items.push(rec); saveKBIndex(data);
    enqueueParse(rec);
    res.json({ ok: true, record: rec });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// 列表（含合集）
app.get('/api/knowledge/list', (req, res) => {
  try {
    const data = loadKBIndex();
    const items = data.items.slice().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    res.json({ collections: data.collections, items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// 删除文件
app.delete('/api/knowledge/:id', (req, res) => {
  try {
    const data = loadKBIndex();
    const rec = data.items.find(x => x.id === req.params.id);
    if (!rec) return res.status(404).json({ error: '记录不存在' });
    if (!rec.absPath.startsWith(KB_DIR)) return res.status(403).json({ error: '非法路径' });
    try { fs.unlinkSync(rec.absPath); } catch (e) {}
    try { if (rec.textPath) fs.unlinkSync(rec.textPath); } catch (e) {}
    data.items = data.items.filter(x => x.id !== req.params.id);
    saveKBIndex(data);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// 重新解析
app.post('/api/knowledge/reparse/:id', (req, res) => {
  try {
    const data = loadKBIndex();
    const rec = data.items.find(x => x.id === req.params.id);
    if (!rec) return res.status(404).json({ error: '记录不存在' });
    rec.status = 'parsing'; saveKBIndex(data);
    enqueueParse(rec);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// 批量重试所有失败项
app.post('/api/knowledge/reparse-failed', (req, res) => {
  try {
    const data = loadKBIndex();
    const failed = data.items.filter(x => x.status === 'error');
    failed.forEach(rec => { rec.status = 'parsing'; enqueueParse(rec); });
    saveKBIndex(data);
    res.json({ ok: true, count: failed.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// 生成时拉取全部已解析文本
app.get('/api/knowledge/content', (req, res) => {
  try {
    const items = loadKBIndex().items.filter(x => x.status === 'ready' && x.textPath && fs.existsSync(x.textPath));
    let text = '';
    for (const it of items) {
      let t = '';
      try { t = fs.readFileSync(it.textPath, 'utf-8'); } catch (e) {}
      if (t) text += `\n\n【${it.originalName}】\n` + t.slice(0, 8000);
    }
    res.json({ text: text || '（知识库暂无已解析内容）' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 违禁词清单（合规检查用，网页端可编辑）----------
app.get('/api/banned-words', (req, res) => {
  try { res.json({ words: loadBannedWords() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/banned-words', (req, res) => {
  try {
    const raw = (req.body && req.body.words);
    if (!Array.isArray(raw)) return res.status(400).json({ error: 'words 必须是数组' });
    const clean = saveBannedWords(raw);
    res.json({ ok: true, count: clean.length, words: clean });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 云端违禁词检测（chinese-sensitive-words 云 API，前端做 A+C 双通道降级）----------
// 该开源项目本质是远程词库 API 的 MCP 封装：POST {WORDSCHECK_API_BASE}/check 传 {text, ner}。
// 面板不引入 MCP/SDK，直接 HTTP 调用同一接口，省一层子进程开销。
// 免费额度 100 次/天（无需 token）；配 WORDSCHECK_ACCESS_TOKEN 后不限量。
// 任何异常（断网/超时/超限/401）都返回 offline:true，由前端降级到本地 banned_words.json 词表，绝不阻塞发布主流程。
const WORDSCHECK_API_BASE = (process.env.WORDSCHECK_API_BASE || 'https://www.xdhdancer.top/api8888').replace(/\/+$/, '');
const WORDSCHECK_TOKEN = process.env.WORDSCHECK_ACCESS_TOKEN || '';
const REMOTE_CHECK_TIMEOUT = 8000;
function mapRemoteLevel(lv) {
  const s = String(lv || '');
  if (s.includes('高')) return 'high';
  if (s.includes('中')) return 'mid';
  if (s.includes('低')) return 'low';
  return 'tip';
}
app.post('/api/compliance/remote-check', async (req, res) => {
  const text = (req.body && req.body.text || '').toString();
  if (!text.trim()) return res.json({ ok: true, hits: [], source: 'cloud' });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REMOTE_CHECK_TIMEOUT);
  try {
    const r = await fetch(`${WORDSCHECK_API_BASE}/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(WORDSCHECK_TOKEN ? { Authorization: `Bearer ${WORDSCHECK_TOKEN}` } : {})
      },
      body: JSON.stringify({ text, ner: true }),
      signal: ac.signal
    });
    if (r.status === 429) return res.json({ ok: false, offline: true, reason: 'rate_limit' }); // 免费额度用完 → 前端本地兜底
    if (r.status === 401 || r.status === 403) return res.json({ ok: false, offline: true, reason: 'auth' });
    if (!r.ok) return res.json({ ok: false, offline: true, reason: 'http_' + r.status });
    const d = await r.json();
    const list = (d && d.data && Array.isArray(d.data.wordList)) ? d.data.wordList : [];
    const hits = list.map(w => ({
      keyword: w.keyword,
      category: w.category || '',
      level: mapRemoteLevel(w.level),
      suggestion: Array.isArray(w.suggestion) ? w.suggestion.filter(Boolean) : []
    }));
    res.json({ ok: true, hits, source: 'cloud', stats: (d && d.data && d.data.stats) || null });
  } catch (e) {
    res.json({ ok: false, offline: true, reason: (e && e.name === 'AbortError') ? 'timeout' : 'network' });
  } finally {
    clearTimeout(timer);
  }
});

// ---------- 离线扩展词库（平台营销合规词 + 变体词 + 跳字归一化） ----------
// 数据来源：workbench/dict/platform_marketing_words.json（自编，依据公开广告法极限词与小红书/抖音平台违禁口径，含分级与替换建议）。
// 说明：开源词库类仓库（如 konsheng/Sensitive-lexicon）的"广告类型.txt"实为垃圾广告/招嫖黑产词，与营销合规无关，故不采用。
// 归一化匹配：NFKC 全角转半角 + 去空白与分隔符号 + 小写，可识别「加 微 信」「最.好.的」等跳字/拆字写法。
const EXT_DICT_FILE = path.join(ROOT, 'dict', 'platform_marketing_words.json');
function stripNormalize(s) {
  return String(s || '').normalize('NFKC').toLowerCase()
    .replace(/[\s\u3000·•.,，。!！?？:：;；、"'“”‘’~～()（）\[\]【】{}<>《》〈〉\-_—–/\\|@＠#＃$￥%＆&*＊+＋=＝^℃°]+/g, '');
}
const EXT_WORDS = (() => {
  try {
    const arr = JSON.parse(fs.readFileSync(EXT_DICT_FILE, 'utf-8'));
    const out = [];
    for (const it of arr) {
      if (!it || !it.k) continue;
      const k = String(it.k).trim();
      if (!k) continue;
      const norm = stripNormalize(k);
      out.push({
        k,
        norm,
        c: String(it.c || ''),
        l: (['high', 'mid', 'low', 'tip'].includes(it.l) ? it.l : 'tip'),
        s: Array.isArray(it.s) ? it.s.filter(Boolean).map(String) : []
      });
    }
    console.log('[ext-dict] 已加载离线扩展词库：' + out.length + ' 词');
    return out;
  } catch (e) {
    console.error('[ext-dict] 加载失败（不影响本地词表）：' + e.message);
    return [];
  }
})();
function extSpecialHits(text) {
  const hits = [];
  const t = String(text || '');
  const phones = t.match(/1[3-9]\d{9}/g);
  if (phones) for (const x of new Set(phones)) hits.push({ keyword: x, category: '联系方式(手机号)', l: 'high', s: ['删除联系方式', '评论区互动'] });
  const urls = t.match(/(?:https?:\/\/|www\.)[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/g);
  if (urls) for (const x of new Set(urls)) hits.push({ keyword: x.slice(0, 40) + (x.length > 40 ? '…' : ''), category: '站外链接', l: 'high', s: ['删除外链'] });
  return hits;
}
app.post('/api/compliance/ext-check', (req, res) => {
  try {
    const text = (req.body && req.body.text || '').toString();
    if (!text.trim()) return res.json({ ok: true, hits: [], source: 'ext' });
    const nt = stripNormalize(text);
    const hits = [];
    const seen = new Set();
    for (const w of EXT_WORDS) {
      const hitRaw = text.includes(w.k);
      const hitJump = w.norm.length >= 2 && nt.includes(w.norm);
      if ((hitRaw || hitJump) && !seen.has(w.k)) {
        seen.add(w.k);
        hits.push({ keyword: w.k, category: w.c, level: w.l, suggestion: w.s });
      }
    }
    for (const h of extSpecialHits(text)) {
      if (!seen.has(h.keyword)) {
        seen.add(h.keyword);
        hits.push({ keyword: h.keyword, category: h.category, level: h.l, suggestion: h.s || [] });
      }
    }
    // 子串去重：同一处文本若同时命中「微信」「加微」「加微信」，只保留最长的那个，
    // 否则结果区会出现 3 条指向同一个位置的重复提示，很吵。
    // 注意必须用归一化后的文本比较——跳字写法（如「加 微 信」）在原文里找不到「加微信」，
    // 只比原文会导致去重失效。
    const normOf = h => h.norm || stripNormalize(h.keyword);
    const hitOf = h => text.includes(h.keyword) || (normOf(h).length >= 2 && nt.includes(normOf(h)));
    const merged = hits.filter(a => !hits.some(b => {
      if (b === a) return false;
      if (normOf(b).length <= normOf(a).length) return false;
      return hitOf(b) && normOf(b).includes(normOf(a));
    }));
    res.json({ ok: true, hits: merged.slice(0, 60).map(({ norm, ...rest }) => rest), source: 'ext' });
  } catch (e) {
    res.json({ ok: true, hits: [], source: 'ext', error: e.message });
  }
});

// 只读查询离线扩展词库（供「合规设置」页展示分类统计与词表）。含分类分级汇总。
app.get('/api/compliance/ext-dict', (req, res) => {
  try {
    const cats = {};
    const levels = {};
    for (const w of EXT_WORDS) {
      cats[w.c] = (cats[w.c] || 0) + 1;
      levels[w.l] = (levels[w.l] || 0) + 1;
    }
    res.json({
      ok: true,
      total: EXT_WORDS.length,
      source: '离线扩展词库',
      categories: Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      levels,
      // 完整词表用于只读预览（前端按分类折叠展示，不提供增删——增删改在 dict JSON 里做）
      words: EXT_WORDS.map(({ k, c, l, s }) => ({ k, c, l, s }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- 合集（文件夹）管理 ----------
app.get('/api/knowledge/collections', (req, res) => {
  try { res.json({ collections: loadKBIndex().collections }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/knowledge/collections', (req, res) => {
  try {
    const name = (req.body && req.body.name || '').toString().trim();
    if (!name) return res.status(400).json({ error: '合集名称不能为空' });
    const data = loadKBIndex();
    if (data.collections.some(c => c.name === name)) return res.status(409).json({ error: '已存在同名合集' });
    const col = { id: 'col_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5), name, createdAt: new Date().toISOString() };
    data.collections.push(col);
    saveKBIndex(data);
    res.json({ ok: true, collection: col });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/knowledge/collections/:id', (req, res) => {
  try {
    const data = loadKBIndex();
    const col = data.collections.find(c => c.id === req.params.id);
    if (!col) return res.status(404).json({ error: '合集不存在' });
    // 合集被删：其中的文件移到「未分类」，不删除文件
    data.items.forEach(it => { if (it.collectionId === col.id) it.collectionId = null; });
    data.collections = data.collections.filter(c => c.id !== col.id);
    saveKBIndex(data);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Prompt 模板（可编辑）----------
app.get('/api/prompts/:name', (req, res) => {
  try { res.send(fs.readFileSync(path.join(PROMPTS_DIR, req.params.name + '.json'), 'utf-8')); }
  catch (e) { res.status(404).json({ error: '未找到模板' }); }
});
app.post('/api/prompts/:name', (req, res) => {
  try {
    const f = path.join(PROMPTS_DIR, req.params.name + '.json');
    const cur = JSON.parse(fs.readFileSync(f, 'utf-8'));
    const next = Object.assign({}, cur, req.body);
    fs.writeFileSync(f, JSON.stringify(next, null, 2), 'utf-8');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 选题日历生成 ----------
app.post('/api/generate/topics', async (req, res) => {
  try {
    const business = req.body.business || '素养智学/小学';
    const days = parseInt(req.body.days) || 7;
    const campus = req.body.campus || '';
    const tpl = JSON.parse(fs.readFileSync(path.join(PROMPTS_DIR, 'topic-expert.json'), 'utf-8'));
    // 聚合平台是独立项目，常处于未启动状态。此处必须与 /api/generate/material 一样做降级，
    // 否则平台一挂整个选题生成直接 500，用户连「用知识库兜底生成」都做不了。
    let news = '';
    let newsOk = true;
    try {
      const newsR = await fetchText(`${CONFIG.platform.baseUrl}/api/articles?page=1&pageSize=15`);
      news = (JSON.parse(newsR.body).articles || []).map(a => `- ${a.title}（${a.sourceName}）`).join('\n');
    } catch (e) { news = '（资讯读取失败：' + e.message + '）'; newsOk = false; }
    const knowledge = await gatherKnowledge(campus ? resolveCampusKeywords(campus) : null);
    let user = tpl.userTemplate
      .replace('{{business}}', business)
      .replace('{{days}}', days)
      .replace('{{news}}', news || '（无）')
      .replace('{{knowledge}}', knowledge || '（无）')
      .replace('{{obsidian}}', '（无）');
    let campusStat = null;
    if (campus) {
      const cs = await searchByCampus(campus);
      const campusCtx = `\n\n【校区定向素材·${campus}】\n${cs.material}\n\n要求：请重点基于【${campus}】的本地学情、政策与招生节奏生成选题，使内容贴合该校区的家长关注点。`;
      user = user.includes('{{campus}}') ? user.replace('{{campus}}', campusCtx) : (user + campusCtx);
      campusStat = { campus: cs.campusName, platformCount: cs.platformCount, fileCount: cs.fileCount, degraded: cs.degraded };
    }
    const result = await callLLM(tpl.system, user);
    const parsed = parseTopics(result);
    if (parsed.length) res.json({ days: parsed, campusStat, newsOk });
    else res.json({ days: [], raw: result, campusStat, newsOk });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 文案 humanize（内容级反检测：去 AI 模板味）----------
// 同一提示词批量产出的文案有统一词汇/排版/emoji 指纹，平台可聚类识别。
// humanize 在 LLM 生成后过一道随机扰动，让每篇更像真人手打。
// 不改动标题（保字数）与文末 # 标签语义，仅抖动顺序 / 插入噪声。
const SYNONYMS = {
  '推荐': ['安利', '种草', '说一个'],
  '其实': ['说真的', '讲真', '老实说'],
  '很多': ['不少', '一堆', '超多'],
  '重要': ['关键', '要紧', '核心'],
  '注意': ['留意', '当心', '留心'],
  '方法': ['办法', '招', '路子'],
  '孩子': ['娃', '小朋友', '神兽'],
  '家长': ['老母亲', '爸妈', '家长朋友'],
  '学习': ['吸收', '啃书', '上课'],
  '真的': ['确实', '属实', '蛮'],
  '可以': ['能', '不妨', '试试'],
  '建议': ['劝', '支个招', '划重点'],
  '因为': ['由于', '毕竟', '说白了'],
  '但是': ['不过', '但', '然鹅'],
  '如果': ['要是', '假使', '万一'],
  '特别': ['格外', '贼', '尤其'],
  '简单': ['省事', '不复杂', 'easy'],
  '适合': ['适配', '对路', '吃得消'],
  '需要': ['得', '要', '少不了'],
  '可能': ['也许', '说不定', '搞不好'],
  '担心': ['怕', '顾虑', '揪心'],
  '帮助': ['帮上忙', '搭把手', '助力'],
  '发现': ['察觉', '注意到', '看出来'],
};
const EMOJI_POOL = ['✨', '🔥', '💡', '⚠️', '✅', '🌟', '📌', '💬', '🎯', '🌈', '😉', '🙌', '📝', '💪'];
function _hPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function _hRand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function humanize(text, intensity = 'normal') {
  if (!text || typeof text !== 'string') return text;
  const conf = { light: { syn: 2, emoji: 0, split: 0.2 }, normal: { syn: 4, emoji: 1, split: 0.45 }, strong: { syn: 7, emoji: 2, split: 0.7 } }[intensity] || { syn: 4, emoji: 1, split: 0.45 };
  const lines = text.split('\n');
  if (lines.length === 0) return text;
  const title = lines[0];
  // 末尾连续 # 开头行作为标签块
  const tagLines = [];
  for (let i = lines.length - 1; i >= 1; i--) {
    if (lines[i].trim().startsWith('#')) tagLines.unshift(lines[i].trim());
    else break;
  }
  const bodyEnd = lines.length - tagLines.length;
  let bodyText = lines.slice(1, bodyEnd).join('\n');

  // 1) 同义词替换（仅正文）
  const words = Object.keys(SYNONYMS);
  const pool = [...words];
  const chosen = [];
  for (let i = 0; i < conf.syn && pool.length; i++) {
    const idx = _hRand(0, pool.length - 1);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  for (const w of chosen) {
    bodyText = bodyText.replace(new RegExp(w, 'g'), () => _hPick(SYNONYMS[w]));
  }

  // 2) 断行抖动：按句切分 → 随机重组为碎句行
  const sentences = bodyText.split(/(?<=[。！？；])/).map(s => s.trim()).filter(Boolean);
  const newBody = [];
  let buf = '';
  for (let i = 0; i < sentences.length; i++) {
    buf += sentences[i];
    if (Math.random() < conf.split || i === sentences.length - 1) { newBody.push(buf); buf = ''; }
    else buf += '\n';
  }
  if (buf) newBody.push(buf);

  // 3) emoji 随机化：随机行首插入
  for (let k = 0; k < conf.emoji && newBody.length; k++) {
    const li = _hRand(0, newBody.length - 1);
    if (!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(newBody[li].charAt(0))) {
      newBody[li] = _hPick(EMOJI_POOL) + ' ' + newBody[li];
    }
  }

  // 4) 标签块：打乱顺序（strong 时随机子集）
  let tags = (tagLines.join(' ').match(/#[\S]+/g) || []);
  tags = tags.sort(() => Math.random() - 0.5);
  if (intensity === 'strong' && tags.length > 8) tags = tags.slice(0, _hRand(5, 8));
  const tagBlock = tags.join(' ');

  const out = [title, ...newBody];
  if (tagBlock) out.push('', tagBlock);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ---------- 文案生成 ----------
app.post('/api/generate/copy', async (req, res) => {
  try {
    const { topic, angle, policy_hook, audience, campus } = req.body;
    const tpl = JSON.parse(fs.readFileSync(path.join(PROMPTS_DIR, 'copywriter.json'), 'utf-8'));
    let user = tpl.userTemplate
      .replace('{{topic}}', topic || '')
      .replace('{{angle}}', angle || '')
      .replace('{{policy_hook}}', policy_hook || '')
      .replace('{{audience}}', audience || '');
    let campusStat = null;
    if (campus) {
      const cs = await searchByCampus(campus);
      const campusCtx = `\n\n【校区定向素材·${campus}】\n${cs.material}\n\n要求：请基于【${campus}】的本地学情、政策与招生节奏撰写，贴合该校区的家长关切。`;
      user = user.includes('{{campus}}') ? user.replace('{{campus}}', campusCtx) : (user + campusCtx);
      campusStat = { campus: cs.campusName, platformCount: cs.platformCount, fileCount: cs.fileCount, degraded: cs.degraded };
    }
    const raw = await callLLM(tpl.system, user);
    const hcfg = (CONFIG.publish && CONFIG.publish.humanize) || {};
    const result = (hcfg.enabled === false) ? raw : humanize(raw, hcfg.intensity || 'normal');
    res.json({ result, campusStat, humanized: result !== raw });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 物料生成（聚合平台资讯 + 知识库 + LLM）----------
app.post('/api/generate/material', async (req, res) => {
  try {
    const { theme, type = '政策解读物料', business = '素养智学/小学', whitepapers = [] } = req.body || {};
    if (!theme || !String(theme).trim()) return res.status(400).json({ error: '请填写主题' });
    const tpl = JSON.parse(fs.readFileSync(path.join(PROMPTS_DIR, 'material.json'), 'utf-8'));

    // 聚合平台资讯
    let news = '';
    try {
      const newsR = await fetchText(`${CONFIG.platform.baseUrl}/api/articles?page=1&pageSize=20`);
      news = (JSON.parse(newsR.body).articles || []).map(a => `- ${a.title}（${a.sourceName}）`).join('\n');
    } catch (e) { news = '（资讯读取失败：' + e.message + '）'; }

    // 知识库（内置轻量，本地上传素材）
    const knowledge = await gatherKnowledge();

    const user = tpl.userTemplate
      .replace('{{theme}}', theme)
      .replace('{{type}}', type)
      .replace('{{business}}', business)
      .replace('{{news}}', news || '（无）')
      .replace('{{knowledge}}', knowledge || '（无）')
      .replace('{{obsidian}}', '（无）')
      .replace('{{whitepapers}}', knowledge || '（无）');
    const result = await callLLM(tpl.system, user);
    res.json({ result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 封面一句话简介（AI 生成）----------
app.post('/api/generate/intro', async (req, res) => {
  try {
    const { title = '', body = '' } = req.body || {};
    if (!title.trim() && !body.trim()) return res.status(400).json({ error: '请先填写笔记标题或正文' });
    const raw = await callLLM(
      '你是小红书教培运营助手。根据笔记标题和正文写一句话简介：不超过30字，口语化、说家长关心的点，不要表情符号、引号和任何解释，直接输出简介本身。',
      `笔记标题：${title || '（无）'}\n正文开头：${body.slice(0, 300) || '（无）'}`
    );
    const intro = raw.trim().split('\n')[0].replace(/^["'“”]+|["'“”]+$/g, '').slice(0, 40);
    res.json({ intro });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 封面渲染（HTML 模板 + Playwright 截图）----------
// 封面模板清单：id 必须对应 covers/ 下的同名 .html 文件（白名单，防路径穿越）
const COVER_TEMPLATES = [
  { id: 'template1', name: '极简大字 · 米白纸纹' },
  { id: 'template2', name: '品牌绿块 · 瑞士网格' },
  { id: 'template3', name: '杂志衬线 · 牛皮纸' },
  { id: 'template5', name: '干货卡片 · 清单风' },
  { id: 'template6', name: '照片打底 · 大字压图' },
  { id: 'template7', name: '多图拼贴 · 宫格' },
  { id: 'template8', name: '荧光笔 · 手账便签' }
];
function resolveCoverTemplate(t) {
  if (t === 'random') return COVER_TEMPLATES[Math.floor(Math.random() * COVER_TEMPLATES.length)];
  return COVER_TEMPLATES.find(x => x.id === t) || COVER_TEMPLATES[0];
}
app.get('/api/cover/templates', (req, res) => { res.json({ templates: COVER_TEMPLATES }); });

// 渲染前注入的小脚本：标题按字数自动缩号，避免长标题溢出；空字段自动隐藏
const COVER_FIT_SCRIPT = `<script>
(function(){
  var t=document.querySelector('.title');
  if(t){var n=(t.textContent||'').trim().length;var s=parseFloat(window.getComputedStyle(t).fontSize)||80;
    if(n>26){s=Math.min(s,54);}else if(n>20){s=Math.min(s,64);}else if(n>14){s=Math.min(s,74);}
    t.style.fontSize=s+'px';}
  var sub=document.querySelector('.subtitle');
  if(sub&&!(sub.textContent||'').trim()){sub.style.display='none';}
  var tg=document.querySelector('.tag');
  if(tg&&!(tg.textContent||'').trim()){tg.style.display='none';}
  var it=document.querySelector('.intro');
  if(it&&!(it.textContent||'').trim()){it.style.display='none';}
})();
</script>`;

// 本环境须用 --single-process，且 page.close() 会连带杀死浏览器，
// 故每次请求独立 launch，截图后先返回响应，再异步关浏览器（不 await，try/catch 兜底）。
app.post('/api/cover/render', async (req, res) => {
  let tmp = null;
  let browser = null;
  let responded = false;
  try {
    const { title = '', subtitle = '', tag = '', intro = '', theme = 'blue', template = 'template1', bg = '', images = [] } = req.body;
    const tpl = resolveCoverTemplate(String(template || 'template1'));
    const bgPath = String(bg || 'bg-samples/classroom.png');
    const imgs = (Array.isArray(images) && images.length ? images : ['bg-samples/writing.png', 'bg-samples/stationery.png', 'bg-samples/classroom.png']).map(String);
    let html = fs.readFileSync(path.join(ROOT, 'covers', tpl.id + '.html'), 'utf-8');
    html = html.replace(/\{\{title\}\}/g, title).replace(/\{\{subtitle\}\}/g, subtitle).replace(/\{\{tag\}\}/g, tag).replace(/\{\{intro\}\}/g, intro);
    html = html.replace(/\{\{bg\}\}/g, bgPath)
      .replace(/\{\{img1\}\}/g, imgs[0] || '')
      .replace(/\{\{img2\}\}/g, imgs[1] || '')
      .replace(/\{\{img3\}\}/g, imgs[2] || '');
    html = html.replace('</body>', COVER_FIT_SCRIPT + '\n</body>');
    tmp = path.join(OUTPUT_DIR, 'cover_tmp_' + Date.now() + '.html');
    fs.writeFileSync(tmp, html, 'utf-8');
    const outPng = path.join(OUTPUT_DIR, 'cover_' + Date.now() + '.png');
    const pw = loadPlaywright();
    if (!pw) return res.status(500).json({ error: '未找到 playwright，请先运行 npm install 并 npx playwright install chromium' });
    const { chromium } = pw;
    browser = await chromium.launch(chromiumLaunchOptions({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] }));
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
    await page.goto('file://' + tmp);
    await page.screenshot({ path: outPng });
    try { fs.unlinkSync(tmp); } catch (e) { /* 安全删除拦截时忽略 */ }
    responded = true;
    res.json({ ok: true, url: '/output/' + path.basename(outPng), template: tpl.id, templateName: tpl.name });
  } catch (e) {
    if (!responded) res.status(500).json({ error: e.message });
  } finally {
    if (browser) { browser.close().catch(() => {}); }
    if (tmp) { try { fs.unlinkSync(tmp); } catch (_) {} }
  }
});

// ---------- 发布素材上传（base64 → 落盘）----------
app.post('/api/cover/upload', (req, res) => {
  try {
    const { filename, data } = req.body || {};
    if (!data) return res.status(400).json({ error: '缺少 data' });
    const m = String(data).match(/^data:([\w\/\-.]+);base64,(.*)$/);
    const b64 = m ? m[2] : String(data);
    const ext = (m && m[1].split('/')[1]) || 'png';
    const dir = path.join(OUTPUT_DIR, 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    const fname = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    fs.writeFileSync(path.join(dir, fname), Buffer.from(b64, 'base64'));
    res.json({ ok: true, path: '/output/uploads/' + fname });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 白皮书参考上传（base64 → 落盘 → 留存）----------
const WP_DIR = path.join(OUTPUT_DIR, 'whitepapers');
app.post('/api/whitepaper/upload', (req, res) => {
  try {
    const { filename, data } = req.body || {};
    if (!data) return res.status(400).json({ error: '缺少 data' });
    const m = String(data).match(/^data:([\w\/\-.]+);base64,(.*)$/);
    const b64 = m ? m[2] : String(data);
    // 从 filename 或 MIME 推断扩展名
    let ext = 'bin';
    if (filename) {
      const dot = filename.lastIndexOf('.');
      if (dot > 0) ext = filename.slice(dot + 1);
    } else if (m && m[1].split('/')[1]) {
      ext = m[1].split('/')[1];
    }
    fs.mkdirSync(WP_DIR, { recursive: true });
    const safeName = (filename || 'whitepaper').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5.-]/g, '_');
    const fname = Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '_' + safeName;
    const fpath = path.join(WP_DIR, fname);
    fs.writeFileSync(fpath, Buffer.from(b64, 'base64'));
    const stat = fs.statSync(fpath);
    res.json({
      ok: true,
      filename: fname,
      originalName: filename || fname,
      path: '/output/whitepapers/' + fname,
      absPath: fpath,
      size: stat.size,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 列出已上传白皮书
app.get('/api/whitepapers', (req, res) => {
  try {
    if (!fs.existsSync(WP_DIR)) return res.json({ files: [] });
    const files = fs.readdirSync(WP_DIR)
      .filter(f => !f.startsWith('.'))
      .map(f => {
        const fp = path.join(WP_DIR, f);
        try {
          const stat = fs.statSync(fp);
          return { filename: f, path: '/output/whitepapers/' + f, absPath: fp, size: stat.size, mtime: stat.mtime };
        } catch (_) { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);
    res.json({ files });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 删除白皮书
app.delete('/api/whitepapers/:filename', (req, res) => {
  try {
    const fp = path.join(WP_DIR, req.params.filename);
    // 安全检查：防止路径穿越
    if (!fp.startsWith(WP_DIR)) return res.status(403).json({ error: '非法路径' });
    if (fs.existsSync(fp)) { fs.unlinkSync(fp); res.json({ ok: true }); }
    else { res.status(404).json({ error: '文件不存在' }); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 白皮书物料导出：docx / pdf ----------
app.post('/api/whitepaper/export', async (req, res) => {
  try {
    const { content = '', title = '物料', format = 'docx' } = req.body || {};
    if (!content || !String(content).trim()) return res.status(400).json({ error: '无内容可导出' });
    const safeName = (title || '物料').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5.-]/g, '_');
    const marked = require('marked');
    const html = marked.parse(String(content));

    if (format === 'docx') {
      const htmlDocx = require('html-docx-js');
      const full = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
      const blob = htmlDocx.asBlob(full);
      const buf = Buffer.from(await blob.arrayBuffer());
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="whitepaper.docx"; filename*=UTF-8''${encodeURIComponent(safeName + '.docx')}`);
      return res.send(buf);
    }

    if (format === 'pdf') {
      const { chromium } = require('playwright');
      const styled = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:'Microsoft YaHei','PingFang SC','SimSun',sans-serif;font-size:14px;line-height:1.85;color:#222;padding:8px 4px}
        h1{font-size:23px;border-bottom:2px solid #2563eb;padding-bottom:8px;color:#1e3a8a;margin-top:8px}
        h2{font-size:18px;color:#1e3a8a;margin-top:22px}
        h3{font-size:15px;color:#334155;margin-top:16px}
        p{margin:9px 0}
        ul,ol{margin:8px 0;padding-left:24px}
        li{margin:4px 0}
        code{background:#f1f5f9;padding:2px 5px;border-radius:4px;font-size:13px}
        blockquote{border-left:3px solid #cbd5e1;margin:10px 0;padding:6px 14px;color:#475569;background:#f8fafc}
        strong{color:#0f172a}
        table{border-collapse:collapse;margin:10px 0;font-size:13px}
        td,th{border:1px solid #cbd5e1;padding:6px 10px}
      </style></head><body>${html}</body></html>`;
      const browser = await chromium.launch(chromiumLaunchOptions());
      try {
        const page = await browser.newPage();
        await page.setContent(styled, { waitUntil: 'networkidle' });
        const pdf = await page.pdf({ format: 'A4', margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' }, printBackground: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="whitepaper.pdf"; filename*=UTF-8''${encodeURIComponent(safeName + '.pdf')}`);
        return res.send(Buffer.from(pdf));
      } finally {
        await browser.close();
      }
    }
    return res.status(400).json({ error: '不支持的格式：' + format + '（仅 docx / pdf）' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- 发布环境设置 / CDP 真实浏览器状态 / 风控护栏 ----------
app.get('/api/publish-settings', async (req, res) => {
  const g = loadGuard();
  const cdp = await detectCDP(CONFIG.publish.cdpPort);
  res.json({
    minIntervalMinutes: CONFIG.publish.minIntervalMinutes,
    minDraftIntervalMinutes: CONFIG.publish.minDraftIntervalMinutes,
    lastPublishAt: g.lastPublishAt,
    lastDraftAt: g.lastDraftAt,
    cdp: { port: CONFIG.publish.cdpPort, connected: cdp.ok, browser: cdp.browser || '', mode: cdp.ok ? 'cdp' : 'fallback' }
  });
});

app.post('/api/publish-settings', (req, res) => {
  // 两个间隔都可选传入：只传哪个就只校验/更新哪个
  const v = req.body.minIntervalMinutes != null ? Number(req.body.minIntervalMinutes) : null;
  const dv = req.body.minDraftIntervalMinutes != null ? Number(req.body.minDraftIntervalMinutes) : null;
  if (v != null) {
    if (!Number.isFinite(v) || v < 1 || v > 1440) return res.status(400).json({ error: '发布间隔需在 1~1440 分钟之间' });
    CONFIG.publish.minIntervalMinutes = Math.round(v);
  }
  if (dv != null) {
    if (!Number.isFinite(dv) || dv < 1 || dv > 1440) return res.status(400).json({ error: '存草稿间隔需在 1~1440 分钟之间' });
    CONFIG.publish.minDraftIntervalMinutes = Math.round(dv);
  }
  if (v == null && dv == null) return res.status(400).json({ error: '未提供要修改的间隔值' });
  try { fs.writeFileSync(path.join(ROOT, 'config.json'), JSON.stringify(CONFIG, null, 2), 'utf-8'); }
  catch (e) { return res.status(500).json({ error: '写入配置失败：' + e.message }); }
  res.json({ ok: true, minIntervalMinutes: CONFIG.publish.minIntervalMinutes, minDraftIntervalMinutes: CONFIG.publish.minDraftIntervalMinutes });
});

app.get('/api/publish-cdp-status', async (req, res) => {
  const cdp = await detectCDP(CONFIG.publish.cdpPort);
  res.json({ connected: cdp.ok, browser: cdp.browser || '', port: CONFIG.publish.cdpPort });
});

// 启动"发布专用"真实浏览器（独立配置目录 + 远程调试端口），供 CDP 模式连接，获得真实环境指纹
app.post('/api/publish-cdp-launch', (req, res) => {
  const exe = resolveBrowserPath(CONFIG.publish.cdpBrowserPath);
  if (!exe) return res.status(400).json({ error: '未找到浏览器。请在 config.json 的 publish.cdpBrowserPath 指定 Edge/Chrome 路径，或确保系统已安装 Edge/Chrome。' });
  const profileDir = resolveProfileDir(CONFIG.publish.cdpProfileDir);
  try { fs.mkdirSync(profileDir, { recursive: true }); } catch (e) {}
  const port = CONFIG.publish.cdpPort;
  try {
    const child = spawn(exe, [
      '--remote-debugging-port=' + port,
      '--user-data-dir=' + profileDir,
      '--no-first-run',
      '--no-default-browser-check',
      'https://creator.xiaohongshu.com'
    ], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    res.json({ ok: true, message: '已启动发布专用浏览器，正在打开远程调试端口 ' + port });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 发布（生成任务单 → 直调 xhs-publish.js Playwright 脚本）----------
app.post('/api/publish', async (req, res) => {
  try {
    const job = req.body;
    const mode = job.mode || 'draft';

    // 风控护栏：避免触发平台"操作频繁"逐步加码的限流/警告（验证码 → 操作限制 → 账号标记）。
    // ⚠️ 存草稿与直接发布共用前 6 步（登录创作平台 → 填标题 → 填正文 → 传图），
    //    对平台而言是同等级写操作，账号行为标记照样累积，因此两者都必须受间隔约束。
    //    旧逻辑只约束 mode==='publish'，导致存草稿可无间隔连点 —— 已修复。
    const isPub = mode === 'publish';
    const guardField = isPub ? 'lastPublishAt' : 'lastDraftAt';
    const intervalCfg = isPub ? 'minIntervalMinutes' : 'minDraftIntervalMinutes';
    const intervalMin = Number(CONFIG.publish[intervalCfg]) || (isPub ? 10 : 15);
    const actionText = isPub ? '自动发布' : '存小红书草稿';
    {
      const g = loadGuard();
      if (g[guardField]) {
        const elapsedMin = (Date.now() - new Date(g[guardField]).getTime()) / 60000;
        if (elapsedMin < intervalMin) {
          const waitMin = Math.ceil(intervalMin - elapsedMin);
          return res.status(429).json({
            error: `距上次${actionText}仅 ${elapsedMin.toFixed(1)} 分钟，平台风控建议间隔 ≥ ${intervalMin} 分钟。请 ${waitMin} 分钟后再试，或改用「一键下载（手动发）」。`
          });
        }
      }
    }

    // 【修复】images 相对路径转绝对路径（前端传 /output/uploads/xxx.png，
    // Windows 下 fs.existsSync 不认 / 开头的相对路径，导致脚本秒退）
    const WORKBENCH_ROOT = path.resolve(__dirname);
    if (Array.isArray(job.images)) {
      job.images = job.images.map(img => {
        if (typeof img !== 'string') return img;
        // 已是带盘符的绝对路径（如 C:/... 或 D:/...）→ 不动
        // ⚠️ 不能用 path.isAbsolute()！Windows 下 '/output/xxx' 也返回 true（= 当前盘根目录），
        //   但 fs.existsSync('/output/xxx') 在 Windows 上找不到文件，导致脚本秒退
        if (/^[A-Za-z]:/.test(img)) return img;
        // 相对路径 → 基于 workbench 根目录解析
        return path.resolve(WORKBENCH_ROOT, img.replace(/^\//, ''));
      });
    }

    // 选择发布环境：只要真实浏览器(CDP)已连接，无论「存草稿箱」还是「直接发布」都优先复用，
    // 复用用户已登录、有浏览历史/书签/其他 cookie 的真实环境，显著降低风控识别，
    // 也避免回退到空 profile → 弹未登录新窗口又要重新扫码（问题①根因）
    {
      const cdp = await detectCDP(CONFIG.publish.cdpPort);
      if (cdp.ok) { job.useCDP = true; job.cdpPort = CONFIG.publish.cdpPort; }
    }

    const jobPath = path.join(OUTPUT_DIR, 'publish-task_' + Date.now() + '.json');
    fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf-8');

    // 控制通道指针：脚本会写 <jobPath>.control.json，后端据此转发「关闭」信号
    const controlPath = jobPath + '.control.json';
    try { fs.writeFileSync(path.join(OUTPUT_DIR, '.current-publish.json'), JSON.stringify({ controlPath, jobPath }, null, 2)); } catch (e) {}

    console.log(`[发布] mode=${mode} task=${jobPath} images=${job.images.length} useCDP=${!!job.useCDP}`);

    // 通过护栏校验后，记录本次操作时间（无论成败都计入间隔，防止失败后立即重试触发风险）
    // 存草稿同样记录 —— 它也是一次平台写操作。
    {
      const g = loadGuard();
      g[guardField] = new Date().toISOString();
      saveGuard(g);
    }

    // 直调 xiaohongshu-auto 发布脚本（headless=false，弹出浏览器窗口）
    // 脚本路径：支持相对路径（相对 workbench 根），便于整体打包迁移到别的机器
    const scriptPath = path.isAbsolute(CONFIG.publish.scriptPath)
      ? CONFIG.publish.scriptPath
      : path.resolve(__dirname, CONFIG.publish.scriptPath);
    execFile(NODE_EXE, [scriptPath, '--config', jobPath], {
      timeout: 300000,
      windowsHide: false,  // 让用户看到浏览器操作
      env: {
        ...process.env,
        // NODE_PATH：本地 node_modules 优先（npm install 后），再回退工作区 node_modules，保证换机器可解析 playwright
        NODE_PATH: [path.join(__dirname, 'node_modules'), PLAYWRIGHT_DIR].join(process.platform === 'win32' ? ';' : ':'),
        // 浏览器二进制路径：仅继承环境变量；未设置则交给 playwright 默认缓存（不再写死 C:/pw-browsers）
        ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH } : {})
      }
    }, (err, stdout, stderr) => {
      if (err) {
        console.error(`[发布失败] ${err.message}`);
        console.error(`[stderr] ${stderr}`);
      } else {
        console.log(`[发布完成] stdout:\n${stdout}`);
      }
      // 将结果写入 .result.json，前端可轮询读取
      // 注意：脚本在进程结束前已写好含 result 字段的文件，这里先读取并保留 result，避免覆写丢失真实发布状态
      try {
        let existing = {};
        try { if (fs.existsSync(jobPath + '.result.json')) existing = JSON.parse(fs.readFileSync(jobPath + '.result.json', 'utf-8')); } catch (e) {}
        // 脚本自己写过 success:false 就以脚本为准：脚本失败后会保持浏览器打开等你关窗，
        // 进程最终是 exit(0)，只看退出码会把失败误判成成功。
        const scriptFailed = existing.success === false;
        const success = scriptFailed ? false : !err;
        const detail = [scriptFailed ? existing.error : (err ? err.message : ''), (stderr || '').slice(-300)]
          .filter(Boolean).join('\n');
        const result = {
          completed: true,
          success,
          error: detail || null,
          stdout: stdout || '',
          stderr: stderr || '',
          finishedAt: new Date().toISOString(),
          result: existing.result || null
        };
        fs.writeFileSync(jobPath + '.result.json', JSON.stringify(result, null, 2));
        // 未成功发布 → 自动记一条违规日志。放在服务端是为了「人走了也留痕」：
        // 发布脚本要跑几分钟，前端那条记录会随页面刷新/关闭一起消失。
        if (!success) {
          recordViolation({
            type: 'warning',
            trigger: mode === 'publish' ? '自动发布未成功' : '存小红书草稿未成功',
            detail: ('《' + (job.title || '无标题') + '》\n' + (detail || '未知错误')).slice(0, 500),
            action: '建议改用手动发布（一键下载）',
            auto: true
          });
        }
      } catch (e) { /* ignore */ }
    });

    // 立即返回，脚本在后台跑
    res.json({
      ok: true,
      taskPath: jobPath,
      controlPath,
      mode,
      resultPath: jobPath + '.result.json',
      message: mode === 'publish'
        ? '🚀 已启动自动发布！浏览器窗口将弹出，请勿关闭。'
        : '📋 已启动草稿模式！浏览器窗口将弹出。'
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 发布状态查询（前端轮询：账号 + 是否完成 + 是否可关闭）----------
app.get('/api/publish/status', (req, res) => {
  try {
    const marker = path.join(OUTPUT_DIR, '.current-publish.json');
    if (!fs.existsSync(marker)) return res.json({ running: false });
    const { controlPath } = JSON.parse(fs.readFileSync(marker, 'utf-8'));
    if (!fs.existsSync(controlPath)) return res.json({ running: false });
    const d = JSON.parse(fs.readFileSync(controlPath, 'utf-8'));
    // 若控制 server 端口可用，ping 一下确认进程还活着（防止脚本已退出但文件残留）
    if (d.port) {
      const http = require('http');
      const probe = http.request({ host: '127.0.0.1', port: d.port, path: '/', method: 'GET', timeout: 1500 }, r2 => {
        r2.resume();
        res.json({ running: true, ...d });
      });
      probe.on('error', () => res.json({ running: false }));
      probe.on('timeout', () => { probe.destroy(); res.json({ running: false }); });
      probe.end();
    } else {
      res.json({ running: true, ...d });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 关闭发布浏览器（转发关闭信号到脚本控制 server）----------
app.post('/api/publish/close', (req, res) => {
  try {
    const marker = path.join(OUTPUT_DIR, '.current-publish.json');
    if (!fs.existsSync(marker)) return res.json({ ok: false, error: '没有正在运行的发布任务' });
    const { controlPath } = JSON.parse(fs.readFileSync(marker, 'utf-8'));
    if (!fs.existsSync(controlPath)) return res.json({ ok: false, error: '发布任务已结束' });
    const d = JSON.parse(fs.readFileSync(controlPath, 'utf-8'));
    if (!d.port) return res.json({ ok: false, error: '控制端口未知，无法远程关闭（可手动关闭浏览器窗口）' });
    const http = require('http');
    const req2 = http.request({ host: '127.0.0.1', port: d.port, path: '/close', method: 'POST', timeout: 3000 }, r2 => {
      r2.resume();
      res.json({ ok: true, message: '已发送关闭信号' });
    });
    req2.on('error', e => res.json({ ok: false, error: e.message }));
    req2.on('timeout', () => { req2.destroy(); res.json({ ok: false, error: '关闭信号超时' }); });
    req2.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 发布结果轮询（前端每 5s 查一次）----------
app.get('/api/publish-result', (req, res) => {
  const p = req.query.path;
  if (!p || !p.startsWith(path.resolve(OUTPUT_DIR))) { return res.status(400).json({ error: '非法路径' }); }
  try {
    if (!fs.existsSync(p)) return res.json({ completed: false });
    const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
    res.json(d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 发布历史（扫描任务单 + 结果文件）----------
app.get('/api/publish-history', (req, res) => {
  try {
    const files = fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.startsWith('publish-task_') && f.endsWith('.json') && !f.endsWith('.result.json') && !f.endsWith('.control.json'))
      .map(f => {
        const taskPath = path.join(OUTPUT_DIR, f);
        const resultPath = taskPath + '.result.json';
        let task = {}, result = {};
        try { task = JSON.parse(fs.readFileSync(taskPath, 'utf-8')); } catch (e) {}
        try { result = JSON.parse(fs.readFileSync(resultPath, 'utf-8')); } catch (e) {}
        const tsMatch = f.match(/publish-task_(\d+)\.json$/);
        const createdAt = tsMatch ? new Date(parseInt(tsMatch[1], 10)).toISOString() : new Date(fs.statSync(taskPath).mtime).toISOString();
        return {
          id: tsMatch ? tsMatch[1] : f,
          title: task.title || '（无标题）',
          category: task.category || 'other',
          mode: task.mode || 'draft',
          createdAt,
          taskPath,
          resultPath,
          success: result.success === undefined ? null : result.success,
          realResult: result.result || null,
          error: result.error || null,
          finishedAt: result.finishedAt || null
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ list: files });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 违规日志 ----------
app.get('/api/violation-log', (req, res) => {
  try { res.json({ items: loadViolationLog().sort((a, b) => new Date(b.time) - new Date(a.time)), triggers: VIOLATION_TRIGGERS }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/violation-log', (req, res) => {
  try {
    const { type, trigger, detail, action } = req.body || {};
    if (!type || !trigger) return res.status(400).json({ error: '缺少 type 或 trigger' });
    res.json({ ok: true, entry: recordViolation({ type, trigger, detail, action }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/violation-log/:id', (req, res) => {
  try {
    const log = loadViolationLog().filter(x => x.id !== req.params.id);
    saveViolationLog(log);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 启动时自动归档"孤儿文件"（磁盘存在但不在索引里的 PDF/txt 残留，只移动不删除，可随时找回）
function archiveOrphans() {
  try {
    const orphanDir = path.join(KB_DIR, '_orphan_backup');
    const data = loadKBIndex();
    const known = new Set();
    data.items.forEach(it => {
      known.add(path.basename(it.absPath));
      if (it.textPath) known.add(path.basename(it.textPath));
    });
    const files = fs.readdirSync(KB_DIR).filter(f => f !== 'index.json' && !f.startsWith('_orphan_backup'));
    const orphans = files.filter(f => !known.has(f));
    if (!orphans.length) return 0;
    fs.mkdirSync(orphanDir, { recursive: true });
    let moved = 0;
    for (const f of orphans) {
      try { fs.renameSync(path.join(KB_DIR, f), path.join(orphanDir, f)); moved++; } catch (e) {}
    }
    if (moved) console.log(`[知识库] 已归档 ${moved} 个孤儿文件 → output/knowledge/_orphan_backup/`);
    return moved;
  } catch (e) { return 0; }
}

app.listen(CONFIG.server.port, () => {
  archiveOrphans();
  console.log(`[教培工作台] 已启动: http://localhost:${CONFIG.server.port}`);
  console.log(`[LLM] src=${LLM.src} model=${LLM.model} base=${LLM.baseUrl} key=${LLM.apiKey ? '已加载' : '缺失!'}`);
});
