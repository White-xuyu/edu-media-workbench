/*
 * xhs-publish.js — 小红书图文笔记「纯发布」工具
 *
 * 只负责发布环节：打开浏览器 → 登录 → 填标题 → 传图片 → （可选填正文）
 * 然后分两个分支：
 *   --mode publish   直接发布
 *   --mode draft     存到草稿箱
 *
 * 输入通过 --config <json> 或单个参数传入：
 *   --title "标题"
 *   --body  "正文（单行，\\n 表示换行）"   或   --body-file <path.txt>
 *   --images "a.png,b.png,c.png"          （多图逗号分隔，支持绝对路径）
 *   --mode  draft | publish               （默认 publish）
 *
 * 示例：
 *   node xhs-publish.js --config note.json
 *   node xhs-publish.js --title "测试标题" --images "C:/x/1.png,C:/x/2.png" --mode draft
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

// 路径改为相对脚本目录，使整个 workbench 文件夹可整体拷贝到别的机器运行（可移植）
const SCREENSHOT_DIR = path.join(__dirname, 'publish-screenshots');
const SESSION_DIR = path.join(__dirname, 'xhs-session');

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ---------- 参数解析 ----------
function parseArgs(argv) {
  const cfg = { title: '', body: '', images: [], mode: 'publish', configPath: '', useCDP: false, cdpPort: 9222 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') {
      cfg.configPath = argv[i + 1];
      try {
        const j = JSON.parse(fs.readFileSync(argv[++i], 'utf8'));
        if (j.title !== undefined) cfg.title = j.title;
        if (j.body !== undefined) cfg.body = j.body;
        if (Array.isArray(j.images)) cfg.images = j.images;
        else if (typeof j.images === 'string') cfg.images = j.images.split(',').map(s => s.trim()).filter(Boolean);
        if (j.mode) cfg.mode = j.mode;
        if (j.useCDP) cfg.useCDP = true;
        if (j.cdpPort) cfg.cdpPort = j.cdpPort;
      } catch (e) {
        console.error('ERROR reading --config: ' + e.message);
        process.exit(1);
      }
    } else if (a === '--title') cfg.title = argv[++i];
    else if (a === '--body') cfg.body = argv[++i].replace(/\\n/g, '\n');
    else if (a === '--body-file') cfg.body = fs.readFileSync(argv[++i], 'utf8');
    else if (a === '--images') cfg.images = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--mode') cfg.mode = argv[++i];
    else if (a === '--use-cdp') cfg.useCDP = true;
    else if (a === '--cdp-port') cfg.cdpPort = Number(argv[++i]) || 9222;
  }
  return cfg;
}

const CFG = parseArgs(process.argv);
const TITLE = (CFG.title || '').trim();
const BODY = (CFG.body || '').trim();
const IMAGES = CFG.images;
const MODE = CFG.mode === 'draft' ? 'draft' : 'publish';
const USE_CDP = CFG.useCDP === true;
const CDP_PORT = CFG.cdpPort || 9222;

// ---------- 控制通道（让工作台能查询账号 + 手动关闭浏览器）----------
// 脚本启动一个本地控制 server（127.0.0.1 随机端口），并写入控制文件。
// 工作台后端读取控制文件转发「关闭」信号；成功后浏览器保持打开，由用户手动关闭。
const CONTROL_PATH = CFG.configPath
  ? (CFG.configPath + '.control.json')
  : path.join(SCREENSHOT_DIR, 'publish-control.json');
const RESULT_PATH = CONTROL_PATH.replace(/\.control\.json$/, '.result.json');

let CONTROL_PORT = null;
let controlData = { status: 'starting', mode: MODE };
let fallbackTimer = null;
let idleReminderTimer = null;
let closing = false;
let browser = null;
let isCDP = false;       // 是否连上用户真实浏览器（CDP 模式）
let browserOwned = false; // 浏览器是否由本脚本启动（CDP 模式为 false，结束不关闭）

function writeControl(patch) {
  controlData = Object.assign({}, controlData, patch);
  try { fs.writeFileSync(CONTROL_PATH, JSON.stringify(controlData, null, 2)); } catch (e) {}
}
function readControl() {
  try { return JSON.parse(fs.readFileSync(CONTROL_PATH, 'utf-8')); } catch (e) { return controlData; }
}
async function detectAccount(page) {
  try {
    const name = await page.evaluate(() => {
      const sels = [
        '.side-bar .user-name', '.side-bar [class*="user-name"]',
        '[class*="userInfo"] [class*="name"]', '[class*="nickName"]', '[class*="nickname"]',
        'a[class*="user-name"]', '[class*="userInfo"] span',
      ];
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el && el.textContent.trim()) return el.textContent.trim().slice(0, 30);
      }
      const av = document.querySelector('img[class*="avatar"]');
      if (av && av.getAttribute('title')) return av.getAttribute('title').slice(0, 30);
      return '';
    });
    return name || null;
  } catch (e) { return null; }
}
async function failAndLeave(reason) {
  log('❌ ' + reason);
  try { await screenshot(page, 'fail'); } catch (e) {}
  writeControl({ status: 'failed', error: reason, finishedAt: new Date().toISOString() });
  try { fs.writeFileSync(RESULT_PATH, JSON.stringify({ completed: true, success: false, error: reason, finishedAt: new Date().toISOString() })); } catch (e) {}
}
async function closeBrowserAndExit(reason) {
  if (closing) return; closing = true;
  try { if (fallbackTimer) clearTimeout(fallbackTimer); } catch (e) {}
  try { if (idleReminderTimer) clearInterval(idleReminderTimer); } catch (e) {}
  // CDP 模式连接的是用户真实浏览器，绝不能关闭；仅关闭本脚本自己启动的浏览器
  try { if (browserOwned && browser) await browser.close(); } catch (e) {}
  writeControl({ status: 'closed', closedReason: reason, finishedAt: new Date().toISOString() });
  log('浏览器已关闭，进程退出 (' + reason + ')');
  try { controlServer.close(); } catch (e) {}
  process.exit(0);
}

// 本地控制 server：GET / 返回状态；POST /close 触发关闭
const controlServer = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'POST' && req.url === '/close') {
    res.end(JSON.stringify({ ok: true, message: 'closing' }));
    closeBrowserAndExit('user-closed').catch(() => process.exit(0));
  } else {
    res.end(JSON.stringify(readControl()));
  }
});
controlServer.listen(0, '127.0.0.1', () => {
  CONTROL_PORT = controlServer.address().port;
  writeControl({ port: CONTROL_PORT, pid: process.pid, status: 'running', startTime: new Date().toISOString(), mode: MODE });
  log('🛰️ 控制 server 已启动: 127.0.0.1:' + CONTROL_PORT);
});
// 兜底：浏览器保持打开，等待用户手动关闭（工作台「关闭浏览器」按钮，或直接关闭窗口）。
// 不再定时自动关闭浏览器，避免打断你检查草稿 / 发布状态。仅每 10 分钟打印一次提醒，不自动退出。
idleReminderTimer = setInterval(() => {
  log('💡 浏览器仍保持打开，等待你手动关闭（工作台「关闭浏览器」按钮，或直接关闭窗口）。');
}, 10 * 60 * 1000);

// ---------- 校验 ----------
if (!TITLE) { console.error('ERROR: --title 不能为空'); process.exit(1); }
if (!IMAGES.length) { console.error('ERROR: --images 至少需要一张图片'); process.exit(1); }
for (const p of IMAGES) {
  if (!fs.existsSync(p)) { console.error('ERROR: 图片不存在: ' + p); process.exit(1); }
}

// ---------- 工具函数 ----------
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
async function screenshot(page, name) {
  const fp = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: fp, fullPage: false });
  log('Screenshot: ' + fp);
}
async function findVisible(page, selectors, timeout = 5000) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout })) return el;
    } catch (e) {}
  }
  return null;
}
async function clickByText(page, text, timeout = 5000) {
  const strategies = [
    `button:has-text("${text}")`, `a:has-text("${text}")`,
    `li:has-text("${text}")`, `div:has-text("${text}")`,
    `span:has-text("${text}")`, `[class*="tab"]:has-text("${text}")`,
  ];
  for (const sel of strategies) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout })) { await el.click(); return true; }
    } catch (e) {}
  }
  return page.evaluate((t) => {
    const all = Array.from(document.querySelectorAll('button,a,li,div,span,[role="tab"]'));
    for (const el of all) {
      if (el.children.length === 0 && el.textContent.trim() === t) { el.click(); return true; }
    }
    for (const el of all) {
      if (el.textContent.trim().includes(t) && (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'tab')) { el.click(); return true; }
    }
    return false;
  }, text);
}

// ---------- 拟人化节奏（反检测核心：让操作像真人，有快有慢、偶尔犹豫）----------
function rand(min, max) { return min + Math.random() * (max - min); }
// 带抖动的等待：基准 ms 的 0.6~1.5 倍，避免机器式固定间隔被风控识别
async function jwait(page, ms) { await page.waitForTimeout(rand(ms * 0.6, ms * 1.5)); }
// 偶发"思考/犹豫"停顿：约 12% 概率多等 0.8~2.5s，模拟真人停顿
async function think(page) { if (Math.random() < 0.12) await page.waitForTimeout(rand(800, 2500)); }

// 拟人打字：逐字输入，速度有快有慢；标点 / 换行处"换口气"停顿；偶发思考停顿。
// 相比旧版固定 delay 的 page.type()，这里明显更像真人——不会匀速刷字。
// ⚠️ 反检测关键：改用 keyboard.type 单键输入，其产生的 input 事件 isTrusted=true；
//   旧版 insertText 走 Input.insertText，input 事件 isTrusted=false —— 这是最硬的机器指纹。
async function humanType(page, el, text) {
  await el.click().catch(() => {});
  await el.focus().catch(() => {});
  await jwait(page, 250);
  const PUNCT = '，。！？、；：,.!?;:…';
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === '\n') {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(rand(300, 750)); // 换行"想一下下一句"
      continue;
    }
    // 单字符用 keyboard.type（trusted）；emoji 等代理对回退 insertText（极少出现）
    if (ch.length > 1) {
      await page.keyboard.insertText(ch);
    } else {
      await page.keyboard.type(ch, { delay: 0 });
    }
    // 基础逐字间隔：有时快（20ms）有时慢（120ms）
    let d = rand(20, 120);
    // 标点处"换口气"：明显更长停顿
    if (PUNCT.includes(ch)) d = rand(180, 560);
    // 偶发"思考"停顿（约 9% 概率），模拟真人打字卡顿 / 构思
    if (Math.random() < 0.09) d += rand(400, 1300);
    await page.waitForTimeout(d);
  }
}

// ---------- 拟人鼠标：贝塞尔曲线移动（替代直线坐标点击）----------
// 真人移动鼠标走曲线，直线 = 机器。二次贝塞尔，控制点带随机偏移。
async function humanMove(page, x1, y1, x2, y2) {
  const cx = (x1 + x2) / 2 + rand(-90, 90);
  const cy = (y1 + y2) / 2 + rand(-70, 70);
  for (let t = 0; t <= 1; t += 0.08) {
    const mt = 1 - t;
    const x = mt * mt * x1 + 2 * mt * t * cx + t * t * x2;
    const y = mt * mt * y1 + 2 * mt * t * cy + t * t * y2;
    await page.mouse.move(x, y);
    await page.waitForTimeout(rand(8, 22));
  }
}
// 拟人点击：先贝塞尔移动到目标，停顿再按下/抬起，带微抖动
async function humanClick(page, x, y) {
  const cur = await page.mouse.position();
  await humanMove(page, cur.x || 0, cur.y || 0, x, y);
  await page.waitForTimeout(rand(60, 180));
  await page.mouse.down();
  await page.waitForTimeout(rand(25, 80));
  await page.mouse.up();
}

// ---------- 拟人滚动：分段滚动（替代 scrollTo 直跳）----------
async function humanScroll(page) {
  const h = await page.evaluate(() => document.body.scrollHeight || 0).catch(() => 0);
  const vh = await page.evaluate(() => window.innerHeight || 800).catch(() => 800);
  let y = 0;
  let guard = 0;
  while (y < h && guard++ < 30) {
    const step = rand(vh * 0.35, vh * 0.85);
    y = Math.min(h, y + step);
    await page.evaluate((yy) => window.scrollTo(0, yy), y).catch(() => {});
    await page.waitForTimeout(rand(300, 900));
  }
}

// ---------- 养号预热：发布前先"逛逛"，降低纯发不互动的异常画像 ----------
// 新开标签页去首页浏览几个帖子 + 随机点赞 1 个，不离开当前 editor 页；
// 即使失败也静默跳过，不阻断发布主流程。
async function warmUp(page) {
  try {
    const ctx = page.context();
    const tab = await ctx.newPage();
    await tab.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await jwait(tab, 2000);
    for (let i = 0; i < 3; i++) {
      await humanScroll(tab);
      // 尽力而为：找一个可见的"赞"按钮点一下（模拟真人互动）
      const like = tab.locator('[class*="like"], [aria-label*="赞"], button:has-text("赞")').first();
      try {
        if (await like.isVisible({ timeout: 1500 })) {
          const box = await like.boundingBox();
          if (box) await humanClick(tab, box.x + box.width / 2, box.y + box.height / 2);
        }
      } catch (e) { /* 忽略单个失败 */ }
      await jwait(tab, rand(2000, 5000));
    }
    await tab.close();
    log('✅ 养号预热：已浏览首页并随机互动（降低纯发文异常画像）');
  } catch (e) {
    log('⚠️ 预热跳过（不影响发布）：' + e.message);
  }
}

// ---------- CDP 真实浏览器探测（直连 127.0.0.1，避开系统代理导致 localhost 502 的坑）----------
function detectCDP(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: 1500 }, (r) => {
      let data = '';
      r.on('data', (c) => { data += c; });
      r.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve({ ok: true, wsUrl: j.webSocketDebuggerUrl || null, browser: j.Browser || j['User-Agent'] || '' });
        } catch (e) { resolve({ ok: false, error: 'parse' }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', () => { resolve({ ok: false, error: 'refused' }); });
  });
}

// ---------- 主流程 ----------
(async () => {
  log(`=== XHS publish tool | mode=${MODE} | images=${IMAGES.length} | body=${BODY ? 'yes' : 'no'} ===`);

  // ---------- 浏览器选择 ----------
  // 反检测优先策略（见《当浏览器自动化遇上平台风控》）：
  //   1) 开启 CDP(useCDP) 且本机真实浏览器已开远程调试端口 → connectOverCDP 连接用户真实浏览器。
  //      复用真实 UA/指纹/cookies/浏览历史/书签（"生活痕迹"），且 navigator.webdriver 为 false。
  //      ⚠️ CDP 模式不新建 context（网络栈不完整会致 HTTPS 全挂），改用已有 contexts[0] 并新建标签页；
  //         结束时不关闭浏览器（那是用户真实的日常浏览器）。
  //   2) 否则回退独立自动化 Edge/Chromium 配置目录（现有逻辑）+ --disable-blink-features=AutomationControlled。
  // 跨平台浏览器探测：按 Windows/macOS/Linux 常见安装位依次探测，返回第一个存在的系统浏览器路径。
  // 返回 '' 表示未找到任何系统浏览器 → 下方回退到 Playwright 自带的 Chromium（需先 npx playwright install chromium）。
  function detectBrowserPath() {
    const candidates = [
      // Windows
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      // macOS
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      // Linux
      '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium', '/usr/bin/chromium-browser',
      '/snap/bin/chromium', '/opt/microsoft/msedge/msedge'
    ];
    for (const p of candidates) { try { if (fs.existsSync(p)) return p; } catch (e) {} }
    return '';
  }
  const EDGE_AUTO_PROFILE = path.join(__dirname, 'xhs-session-edge');  // 独立自动化配置目录（相对脚本，可移植）
  let page = null;

  if (USE_CDP) {
    const cdp = await detectCDP(CDP_PORT);
    if (cdp.ok && cdp.wsUrl) {
      log('🔗 CDP 模式：连接本机真实浏览器（' + (cdp.browser || 'unknown') + '）@127.0.0.1:' + CDP_PORT);
      try {
        browser = await chromium.connectOverCDP(cdp.wsUrl);
        isCDP = true;
        browserOwned = false; // 真实浏览器，脚本结束不关闭
        const context = browser.contexts()[0] || await browser.newContext();
        page = await context.newPage();
        log('✅ 已连真实浏览器，新建标签页');
      } catch (e) {
        log('⚠️ CDP 连接失败（' + e.message.slice(0, 120) + '），回退独立环境');
        isCDP = false;
        browser = null;
      }
    } else {
      log('⚠️ CDP 未连接（端口 ' + CDP_PORT + ' 无响应），回退独立环境');
    }
  }

  if (!browser) {
    browserOwned = true;
    const bp = detectBrowserPath();
    if (bp) {
      log('🌐 使用系统浏览器（' + bp + '，独立自动化配置目录，不影响你日常浏览器）');
      if (!fs.existsSync(EDGE_AUTO_PROFILE)) fs.mkdirSync(EDGE_AUTO_PROFILE, { recursive: true });
      try {
        browser = await chromium.launchPersistentContext(EDGE_AUTO_PROFILE, {
          executablePath: bp,
          headless: false,
          viewport: { width: 1280, height: 900 },
          locale: 'zh-CN',
          args: ['--disable-blink-features=AutomationControlled'],
        });
      } catch (e) {
        log('⚠️ 系统浏览器启动失败（' + e.message.slice(0, 120) + '），回退到内置 Chromium');
        browser = await chromium.launchPersistentContext(SESSION_DIR, {
          headless: false,
          viewport: { width: 1280, height: 900 },
          locale: 'zh-CN',
          args: ['--disable-blink-features=AutomationControlled'],
        });
      }
    } else {
      log('⚠️ 未检测到系统 Edge/Chrome/Chromium，回退到 Playwright 内置 Chromium（请确保已执行 npx playwright install chromium）');
      browser = await chromium.launchPersistentContext(SESSION_DIR, {
        headless: false,
        viewport: { width: 1280, height: 900 },
        locale: 'zh-CN',
        args: ['--disable-blink-features=AutomationControlled'],
      });
    }
  }

  // 自动接受可能的确认弹窗（如"离开将保存草稿"）；CDP 真实浏览器下也温和接受
  browser.on('dialog', async (d) => { log('Dialog auto-accept: ' + d.message()); try { await d.accept(); } catch (e) {} });
  // 用户手动关闭浏览器窗口时，清理定时器并退出进程（避免进程挂着）；工作台「关闭浏览器」按钮走 /close 同样会触发
  browser.on('disconnected', () => {
    if (closing) return; closing = true;
    log('🚪 浏览器已关闭（用户手动关闭），清理并退出进程');
    try { if (idleReminderTimer) clearInterval(idleReminderTimer); } catch (e) {}
    try { controlServer.close(); } catch (e) {}
    process.exit(0);
  });

  if (!page) page = browser.pages()[0] || await browser.newPage();

  try {
    // Step 1: 导航 + 登录检测
    log('Step 1: 打开创作者平台...');
    await page.goto('https://creator.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await jwait(page, 5000);
    await screenshot(page, 'step1-home');

    const bodyText = await page.textContent('body');
    const notLoggedIn = bodyText.includes('短信登录') || bodyText.includes('扫码登录') ||
      (await page.locator('input[placeholder*="手机号"]').count()) > 0;
    const loggedIn = (await page.locator('text=发布笔记').count()) > 0 ||
      (await page.locator('text=创作中心').count()) > 0;

    if (notLoggedIn || !loggedIn) {
      log('⚠️ 未登录，等待扫码/短信登录（最多 180s）...');
      let ok = false;
      for (let i = 0; i < 36; i++) {
        await jwait(page, 5000);
        const t = await page.textContent('body');
        const stillOut = t.includes('短信登录') || t.includes('扫码登录') ||
          (await page.locator('input[placeholder*="手机号"]').count()) > 0;
        const inNow = (await page.locator('text=发布笔记').count()) > 0 ||
          (await page.locator('text=创作中心').count()) > 0;
        if (!stillOut && inNow) { ok = true; break; }
        if (i % 6 === 0) log(`等待登录... ${(i + 1) * 5}s`);
      }
      if (!ok) { await failAndLeave('登录超时（180s 内未扫码/登录）'); return; }
      await jwait(page, 3000);
      await screenshot(page, 'step1-loggedin');
    } else {
      log('✅ 已登录');
    }

    // 登录成功 → 探测当前账号昵称（用于工作台展示，确认与日常账号一致）
    const acc = await detectAccount(page);
    if (acc) { writeControl({ account: acc }); log('👤 当前账号：' + acc); }
    else { log('⚠️ 未能自动识别账号昵称（不影响发布，请自行确认弹窗内账号）'); }

    // 养号预热：发布前先"逛逛"首页并随机互动，降低"只发不互动"的异常画像（反检测 L1）
    await warmUp(page);
    await jwait(page, 2000);

    // Step 2: 点「发布笔记」→ 进入图文编辑器
    // 小红书创作者平台 UI 已多次改版，当前主流为「标签页式」（上传视频/上传图文/写长文/发播客），
    // 旧版曾用下拉菜单+「发布图文笔记」卡片。本步骤兼容两种模式。
    log('Step 2: 点「发布笔记」→ 进入图文编辑器');
    const pubBtn = await findVisible(page, [
      'button:has-text("发布笔记")', 'a:has-text("发布笔记")', '[class*="sidebar"] :text("发布笔记")',
    ]);
    if (pubBtn) await pubBtn.click(); else await clickByText(page, '发布笔记');
    await jwait(page, 3000);
    await screenshot(page, 'step2-after-click');

    // ---- 策略 A（新版）：找「上传图文」标签页并点击 ----
    let enteredEditor = false;
    const imageTabSelectors = [
      // 标签页文字匹配（新版 UI 最常见）
      '[role="tab"]:has-text("上传图文")',
      'div[class*="tab"]:has-text("上传图文")',
      'span[class*="tab"]:has-text("上传图文")',
      'a:has-text("上传图文")',
      // 也兼容旧文案变体
      '[role="tab"]:has-text("发布图文")',
      'div[class*="tab"]:has-text("发布图文")',
    ];
    for (const sel of imageTabSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click(); enteredEditor = true;
          log('✅ 点击了「上传图文」标签（新版 UI）');
          break;
        }
      } catch (e) {}
    }

    // ---- 策略 B（旧版）：找下拉菜单里的「发布图文笔记」卡片/条目 ----
    if (!enteredEditor) {
      const card = await findVisible(page, [
        '[class*="creator-item"]:has-text("发布图文笔记")',
        '[class*="card"]:has-text("发布图文笔记")',
        '[class*="item"]:has-text("发布图文笔记")',
        'li:has-text("发布图文笔记")',
      ], 3000);
      if (card) { await card.click(); enteredEditor = true; log('✅ 点「发布图文笔记」卡片（旧版 UI）'); }
      else { enteredEditor = await clickByText(page, '发布图文笔记'); if (enteredEditor) log('✅ 文字点击「发布图文笔记」（旧版 UI）'); }
    }

    // ---- 策略 C（兜底）：通过 URL 参数强制切换到图文模式 ----
    if (!enteredEditor) {
      log('⚠️ 未找到任何图文入口按钮，尝试 URL 参数切换');
      try {
        let url = page.url();
        let newUrl = url.replace(/[?&]target=video/, '&target=image-text');
        if (newUrl === url) newUrl = url + (url.includes('?') ? '&' : '?') + 'target=image-text';
        await page.goto(newUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        enteredEditor = true; log('✅ 通过 URL 参数切换到图文模式');
      } catch (e) { log('URL 切换失败: ' + e.message); }
    }

    // ---- 策略 D（最终兜底）：JS evaluate 直接在页面里找含"上传图文"/"图文"的元素并点击 ----
    if (!enteredEditor) {
      enteredEditor = await page.evaluate(() => {
        // 搜所有可交互元素，优先 role=tab / class 含 tab / a 标签
        const candidates = Array.from(document.querySelectorAll(
          '[role="tab"], [class*="tab"], a, button, div[onclick], span[onclick]'
        ));
        for (const el of candidates) {
          const t = el.textContent.trim();
          if ((t === '上传图文' || t === '发布图文' || t === '发布图文笔记') && el.offsetParent !== null) {
            el.click(); return true;
          }
        }
        return false;
      });
      if (enteredEditor) log('✅ JS 兜底点击成功');
    }

    if (!enteredEditor) {
      await screenshot(page, 'step2-fail-no-entry');
      await failAndLeave('找不到图文发布入口（已尝试：标签页/卡片/URL参数/JS兜底）'); return;
    }

    await jwait(page, 4000);
    await screenshot(page, 'step2-editor');

    // 验证是否真的进入了图文模式（不在视频标签）
    let editorBodyText = await page.textContent('body');
    if (editorBodyText.includes('拖拽视频') || editorBodyText.includes('上传视频')) {
      log('⚠️ 当前仍在视频标签，再次尝试切到「上传图文」');
      // 再试一次 JS 直接点
      await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('*'));
        for (const el of all) {
          const t = el.textContent.trim();
          if ((t === '上传图文' || t === '发布图文') && el.children.length <= 3 && el.offsetParent !== null) {
            el.click(); return;
          }
        }
      });
      await jwait(page, 3000);
      await screenshot(page, 'step2-tab-switched');
    }

    // Step 3: 上传图片（支持多张）
    log(`Step 3: 上传 ${IMAGES.length} 张图片`);
    const fi = page.locator('input[type="file"]').first();
    try {
      await fi.setInputFiles(IMAGES);
      log('✅ 已 setInputFiles');
    } catch (e) {
      log('setInputFiles 失败: ' + e.message);
      const zone = await findVisible(page, ['text=上传图片', 'text=添加图片', '[class*="upload"]']);
      if (zone) {
        const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), zone.click()]);
        await fc.setFiles(IMAGES);
        log('✅ 通过 filechooser 上传');
      } else {
        log('ERROR: 无法上传图片'); await failAndLeave('无法上传图片'); return;
      }
    }
    await jwait(page, 5000);
    await screenshot(page, 'step3-uploaded');

    // Step 4: 填标题
    log('Step 4: 填标题');
    const titleEl = await findVisible(page, [
      'input[placeholder*="标题"]', 'textarea[placeholder*="标题"]',
      '[class*="title"] input', '[class*="title"] textarea',
    ], 6000);
    if (titleEl) {
      await titleEl.click(); await jwait(page, 300);
      await titleEl.fill('');
      await humanType(page, titleEl, TITLE);
      log('✅ 标题已填（拟人输入）');
    } else {
      log('ERROR: 标题框未出现（可能图片未解锁）');
      await failAndLeave('标题框未出现（可能图片未解锁）'); return;
    }
    await jwait(page, 800);
    await screenshot(page, 'step4-title');

    // Step 5: 填正文（可选）
    if (BODY) {
      log('Step 5: 填正文');
      const bodyEl = await findVisible(page, [
        '[contenteditable="true"]', '[class*="content"] [contenteditable]',
        '[class*="editor"] [contenteditable]', '.ql-editor',
        'textarea[placeholder*="正文"]', 'textarea[placeholder*="内容"]',
      ], 6000);
      if (bodyEl) {
        await bodyEl.click(); await jwait(page, 300);
        await humanType(page, bodyEl, BODY); // 整段含换行，拟人逐字输入
        log('✅ 正文已填（拟人输入）');
      } else {
        log('⚠️ 正文框未找到，跳过正文');
      }
      await jwait(page, 800);
      await screenshot(page, 'step5-body');
    } else {
      log('Step 5: 无正文，跳过');
    }

    // Step 6: 一键排版（仅发布分支做）
    if (MODE === 'publish') {
      log('Step 6: 一键排版');
      try {
        const fmt = page.locator('text=一键排版').first();
        if (await fmt.isVisible({ timeout: 3000 })) { await fmt.click(); await jwait(page, 1500); log('✅ 一键排版完成'); }
      } catch (e) { log('无「一键排版」，跳过'); }
      await screenshot(page, 'step6-format');
    }

    // Step 7: 分支 —— 发布 or 存草稿
    await humanScroll(page);
    await jwait(page, 1500);
    await think(page); // 拟人：发布前偶发"犹豫"停顿
    await screenshot(page, 'step7-before-action');

    const pubInfo = await page.evaluate(() => {
      const b = document.querySelector('xhs-publish-btn');
      if (!b) return { found: false };
      const r = b.getBoundingClientRect();
      return {
        found: true,
        center: { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) },
        hasOnPublish: typeof b._onPublish === 'function',
        hasOnSave: typeof b._onSave === 'function',
        disabled: b.getAttribute('submit-disabled') === 'true',
      };
    });
    log('发布按钮信息: ' + JSON.stringify(pubInfo));

    if (!pubInfo.found) { log('ERROR: 找不到 xhs-publish-btn'); await failAndLeave('找不到 xhs-publish-btn'); return; }
    if (pubInfo.disabled) { log('⚠️ 按钮 disabled，检查必填项'); }

    let acted = false;
    if (MODE === 'draft') {
      // 存草稿：调用 _onSave()
      if (pubInfo.hasOnSave) {
        await page.evaluate(() => document.querySelector('xhs-publish-btn')._onSave());
        acted = true; log('✅ 调用 _onSave()（存草稿）');
      }
    } else {
      // 直接发布：调用 _onPublish()
      if (pubInfo.hasOnPublish) {
        await page.evaluate(() => document.querySelector('xhs-publish-btn')._onPublish());
        acted = true; log('✅ 调用 _onPublish()（发布）');
      }
    }
    // 兜底：拟人点击（贝塞尔曲线 + 真实按下/抬起，规避直线点击指纹）
    if (!acted) {
      try { await humanClick(page, pubInfo.center.x, pubInfo.center.y); acted = true; log('✅ 拟人坐标点击'); }
      catch (e) { log('坐标点击失败: ' + e.message); }
    }
    if (!acted) { log('ERROR: 未触发任何动作'); await failAndLeave('未触发任何动作（_onSave/_onPublish 均不可用且坐标点击失败）'); return; }

    await jwait(page, 5000);
    await screenshot(page, 'step7-after-action');

    // 结果校验
    const after = await page.textContent('body');
    let result = 'unknown';
    if (MODE === 'draft') {
      const draftIndicators = ['草稿', '保存成功', '已保存', '存草稿', '暂存'];
      if (draftIndicators.some(k => after.includes(k))) result = 'draft-saved';
    } else {
      const pubIndicators = ['发布成功', '提交成功', '已提交审核', '审核中'];
      if (pubIndicators.some(k => after.includes(k))) result = 'published';
    }
    if (result === 'unknown') {
      // 尝试导航到对应页面确认
      try {
        if (MODE === 'draft') { await page.goto('https://creator.xiaohongshu.com/creator/note-draft', { waitUntil: 'domcontentloaded' }); }
        else { await page.goto('https://creator.xiaohongshu.com/creator/note', { waitUntil: 'domcontentloaded' }); }
        await jwait(page, 3000);
        await screenshot(page, 'step7-verify-page');
      } catch (e) {}
    }
    log(`=== 结果: ${result} (mode=${MODE}) ===`);
    // 无法确认成功时不再谎报成功：报「未确认」交给人工核对。
    // 否则一次真失败会被记成「已发布」，永远进不了违规日志（这就是自动记录一直空着的原因之一）。
    const unverified = result === 'unknown';
    writeControl({
      status: unverified ? 'failed' : 'done',
      result,
      error: unverified ? '无法确认发布结果' : '',
      finishedAt: new Date().toISOString(),
    });
    try {
      fs.writeFileSync(RESULT_PATH, JSON.stringify(unverified
        ? {
            completed: true, success: false, result: 'unknown',
            error: '无法确认发布结果：页面未出现成功标识，请到小红书创作平台「笔记管理 / 草稿箱」人工确认',
            finishedAt: new Date().toISOString(),
          }
        : { completed: true, success: true, result, finishedAt: new Date().toISOString() }));
    } catch (e) {}
    log(unverified
      ? '⚠️ 无法确认是否成功，已按「未确认」上报。浏览器保持打开，请人工核对后台后手动关闭。'
      : '✅ 已写入完成状态。浏览器保持打开，等待你手动关闭（工作台「关闭浏览器」按钮，或直接关闭窗口）。');
  } catch (error) {
    log('ERROR: ' + error.message);
    try { await screenshot(page, 'error'); } catch (e) {}
    await failAndLeave('运行异常：' + error.message);
  }
  // 注意：不再自动关闭浏览器（finally 不 close）。关闭由控制 server 的 /close 或兜底超时触发。
})();
