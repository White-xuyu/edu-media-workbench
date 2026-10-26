const $ = (id) => document.getElementById(id);

/* ============ 通用二选一弹窗 ============ */
let __askCb = null;
function askChoice(title, msg, cancelText, okText, cb) {
  $('ask-title').textContent = title;
  $('ask-msg').textContent = msg;
  $('ask-cancel').textContent = cancelText;
  $('ask-ok').textContent = okText;
  __askCb = cb;
  $('ask-mask').classList.add('show');
}
function closeAsk(ok) {
  $('ask-mask').classList.remove('show');
  const cb = __askCb; __askCb = null;
  if (cb) cb(ok);
}

/* ============ 视图路由 ============ */
let __curView = 'calendar';
let cfgKeyDirty = false; // 配置页填了 API Key 但没点保存
function showView(name) {
  if (cfgKeyDirty && __curView === 'config' && name !== 'config') {
    return askChoice('API Key 还没保存', '你填了 API Key 但没点「保存配置」，现在离开不会生效。',
      '不保存，直接离开', '留在本页保存', stay => { cfgKeyDirty = false; if (!stay) showView(name); });
  }
  __curView = name;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'history') loadPublishHistory();
  if (name === 'news') loadKnowledge(); // 知识库已并入资讯收集页
  if (name === 'banned') loadBannedWords();
  if (name === 'violation') loadViolationLog();
  if (name === 'publish') loadPublishEnv();
  if (name === 'config') loadConfig();
  // 切换菜单时把整页滚动复位到顶部（页面由 window 滚动，各视图无独立滚动容器）
  window.scrollTo(0, 0);
}
document.querySelectorAll('.nav-item').forEach(n => {
  n.onclick = () => showView(n.dataset.view);
});

/* ============ 状态灯 ============ */
async function loadStatus() {
  try {
    const r = await fetch('/api/status');
    const s = await r.json();
    setLight('lt-platform', s.platform, '聚合平台');
    setLight('lt-xhs', s.xiaohongshu, '小红书');
    setLight('lt-config', { ok: !!s.llmConfigured, detail: s.llmConfigured ? '已配置' : '未配置 API Key，点此进入' }, '配置 API');
    $('xhs-account').textContent = (s.xiaohongshu && s.xiaohongshu.accountName) ? ('（' + s.xiaohongshu.accountName + '）') : '';
    // 进平台首次提醒（同一会话只弹一次）
    if (!s.llmConfigured && !window.__configRemindShown && !sessionStorage.getItem('configRemindDismissed')) {
      window.__configRemindShown = true;
      showConfigRemind();
    }
  } catch (e) { console.warn(e); }
}
function setLight(id, info, label) {
  const el = $(id);
  const lightEl = el.closest('.light');
  if (!info) { el.className = 'dot'; lightEl.setAttribute('data-tip', label + '：状态未知'); return; }
  const level = info.level || (info.ok ? 'ok' : 'bad');
  el.className = 'dot ' + (level === 'ok' ? 'ok' : level === 'warn' ? 'warn' : 'bad');
  let tip = level === 'ok' ? '正常' : level === 'warn' ? '需注意' : '异常';
  if (label === '小红书' && info.accountName) tip += '（' + info.accountName + '）';
  lightEl.setAttribute('data-tip', label + '：' + tip + ' · ' + info.detail);
}

/* ============ 资讯 ============ */
$('btn-news').onclick = async () => {
  const box = $('news-list'); box.innerHTML = '加载中…';
  const r = await fetch('/api/news?pageSize=20');
  const d = await r.json();
  const items = d.articles || [];
  box.innerHTML = items.map(a =>
    `<div class="item">${esc(a.title)}<div class="src">${esc(a.sourceName || '')} · ${esc((a.publishDate||'').slice(0,10))}</div></div>`
  ).join('') || '<div class="muted" style="padding:12px">无数据</div>';
};

/* ============ 系统配置（替代 Obsidian 入口）============ */
function bindConfigButtons() {
  $('btn-config-header').onclick = () => showView('config');
  $('btn-cfg-save').onclick = saveConfig;
  $('btn-cfg-test').onclick = testLLM;
  $('btn-cfg-reset').onclick = resetConfig;
  $('cfg-key-toggle').onclick = () => {
    // 只在「填了 key 还没保存」时才有东西可看；已保存的 key 服务端不回传给前端，不回显。
    const el = $('cfg-llm-key');
    if (!el.value) { showToast('这里没有可显示的 Key：已保存的 Key 出于安全不回显，需要查看请重新粘贴一次。'); return; }
    el.type = el.type === 'password' ? 'text' : 'password';
    $('cfg-key-toggle').textContent = el.type === 'password' ? '显示' : '隐藏';
  };
  // 填了 key 未保存 → 离开配置页时提醒
  $('cfg-llm-key').addEventListener('input', () => { cfgKeyDirty = !!$('cfg-llm-key').value; });
}
async function loadConfig() {
  try {
    const r = await fetch('/api/config');
    const c = await r.json();
    const keyEl = $('cfg-llm-key');
    keyEl.value = '';
    keyEl.type = 'password';
    keyEl.placeholder = c.llm.apiKeySet ? '已配置（留空表示不修改）' : 'sk-... 留空表示不修改';
    $('cfg-key-toggle').textContent = '显示';
    cfgKeyDirty = false;
    $('cfg-llm-base').value = c.llm.baseUrl || 'https://api.deepseek.com';
    $('cfg-llm-model').value = c.llm.model || 'deepseek-chat';
    $('cfg-platform-url').value = c.platform.baseUrl || 'http://localhost:3001';
    $('cfg-pub-interval').value = c.publish.minIntervalMinutes || 60;
    $('cfg-pub-draft-interval').value = c.publish.minDraftIntervalMinutes || 15;
    const h = c.publish.humanize || {};
    $('cfg-pub-humanize').value = h.enabled === false ? 'off' : (h.intensity || 'normal');
    $('cfg-pub-cdp').value = c.publish.cdpPort || 9222;
  } catch (e) { console.warn(e); }
}
async function saveConfig() {
  const msg = $('cfg-msg');
  msg.textContent = '保存中…';
  const hv = $('cfg-pub-humanize').value;
  const body = {
    llm: {
      apiKey: $('cfg-llm-key').value,
      baseUrl: $('cfg-llm-base').value,
      model: $('cfg-llm-model').value
    },
    platform: { baseUrl: $('cfg-platform-url').value },
    publish: {
      minIntervalMinutes: Number($('cfg-pub-interval').value) || 60,
      minDraftIntervalMinutes: Number($('cfg-pub-draft-interval').value) || 15,
      humanize: { enabled: hv !== 'off', intensity: hv === 'off' ? 'normal' : hv },
      cdpPort: Number($('cfg-pub-cdp').value) || 9222
    }
  };
  try {
    const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (d.ok) {
      // 不回读 Key 输入框：保留用户刚填的内容，「显示/隐藏」才有东西可切
      if (body.llm.apiKey) $('cfg-llm-key').placeholder = '已配置（留空表示不修改）';
      cfgKeyDirty = false;
      msg.textContent = '已保存 ✓' + (d.llmConfigured ? '（大模型已生效）' : '（大模型仍未配置）');
      setLight('lt-config', { ok: !!d.llmConfigured, detail: d.llmConfigured ? '已配置' : '大模型仍未配置' }, '配置 API');
    } else msg.textContent = '保存失败：' + (d.error || '未知错误');
  } catch (e) { msg.textContent = '保存失败：' + e.message; }
}
async function testLLM() {
  const msg = $('cfg-msg');
  msg.textContent = '测试中…';
  try {
    const r = await fetch('/api/config/test-llm', { method: 'POST' });
    const d = await r.json();
    msg.textContent = d.ok ? ('连接成功 ✓ ' + d.detail) : ('连接失败：' + d.detail);
  } catch (e) { msg.textContent = '测试失败：' + e.message; }
}
async function resetConfig() {
  if (!confirm('确认恢复发布间隔 / Humanize / CDP 为默认值？大模型 Key 不会被覆盖。')) return;
  $('cfg-pub-interval').value = 60;
  $('cfg-pub-humanize').value = 'normal';
  $('cfg-pub-cdp').value = 9222;
  $('cfg-msg').textContent = '已重置发布默认项，点「保存配置」生效';
}
function showConfigRemind() {
  const m = $('config-remind-mask');
  if (m) m.classList.add('show');
}
function closeConfigRemind() {
  const m = $('config-remind-mask');
  if (m) m.classList.remove('show');
  sessionStorage.setItem('configRemindDismissed', '1');
}
function goConfigFromRemind() {
  closeConfigRemind();
  showView('config');
}

/* ============ 校区选择 + 自定义 + 记忆 ============ */
window.__campus = localStorage.getItem('lastCampus') || '';
function renderCampusTags(tags) {
  const box = $('campus-tags');
  box.innerHTML = tags.map((t, i) => `<span class="tag" data-i="${i}">${esc(t)}<span class="tag-x" onclick="removeCampusTag(${i})">×</span></span>`).join('');
}
let __campusTags = [];
window.removeCampusTag = function (i) { __campusTags.splice(i, 1); renderCampusTags(__campusTags); };
async function loadCampuses() {
  try {
    const d = await (await fetch('/api/campuses')).json();
    const sel = $('campus');
    sel.innerHTML = d.campuses.map(c => `<option value="${esc(c.name)}">${esc(c.name)}${c.builtin ? '' : '（自定义）'}</option>`).join('');
    const last = localStorage.getItem('lastCampus');
    if (last && d.campuses.some(c => c.name === last)) sel.value = last;
    else if (d.campuses.length) { sel.value = d.campuses[0].name; localStorage.setItem('lastCampus', sel.value); }
    window.__campus = sel.value;
  } catch (e) {}
}
$('campus').onchange = () => { window.__campus = $('campus').value; localStorage.setItem('lastCampus', $('campus').value); };
$('btn-campus-add').onclick = () => {
  const area = $('campus-add-area');
  area.style.display = area.style.display === 'none' ? 'block' : 'none';
  if (area.style.display === 'block') { $('campus-name').value = ''; __campusTags = []; renderCampusTags(__campusTags); }
};
$('campus-kw-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const v = e.target.value.trim();
    if (v && !__campusTags.includes(v)) { __campusTags.push(v); renderCampusTags(__campusTags); }
    e.target.value = '';
  }
});
$('btn-campus-save').onclick = async () => {
  const name = $('campus-name').value.trim();
  if (!name) { alert('请填写校区名'); return; }
  if (!__campusTags.length) { alert('请至少添加一个关键词'); return; }
  const r = await fetch('/api/campuses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, keywords: __campusTags }) });
  const d = await r.json();
  if (d.ok) { alert('校区已保存'); $('campus-add-area').style.display = 'none'; await loadCampuses(); }
  else alert('保存失败：' + (d.error || '未知'));
};
$('btn-campus-del').onclick = async () => {
  const name = $('campus').value;
  if (!name) return;
  if (!confirm('确定删除校区「' + name + '」？内置校区不可删。')) return;
  const r = await fetch('/api/campuses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, action: 'delete' }) });
  const d = await r.json();
  if (d.ok) { alert('已删除'); await loadCampuses(); }
  else alert('删除失败：' + (d.error || '未知'));
};
function renderCampusStat(el, stat) {
  if (!stat || !stat.campus) { el.innerHTML = ''; return; }
  let note = '';
  if (stat.platformCount === 0 && stat.fileCount === 0) note = ' ⚠ 未检索到专属素材，已按通用视角生成，建议上传该校区资料';
  else if (stat.degraded) note = '（聚合平台未连接，素材仅来自上传文件）';
  el.innerHTML = `校区：<b>${esc(stat.campus)}</b> ｜ 命中聚合平台 ${stat.platformCount} 条 ｜ 上传文件 ${stat.fileCount} 条${note}`;
}

/* ============ 选题 ============ */
$('btn-topics').onclick = async () => {
  const box = $('topic-result'); box.innerHTML = '生成中…（调平台大模型）';
  $('topic-stat').innerHTML = '';
  const r = await fetch('/api/generate/topics', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business: $('business').value, days: parseInt($('days').value) || 7, campus: $('campus').value })
  });
  const d = await r.json();
  if (d.days && d.days.length) renderTopics(d.days);
  else box.textContent = d.raw || ('错误：' + (d.error || '未知'));
  renderCampusStat($('topic-stat'), d.campusStat);
};
// Day1 排在今天，Day2 明天 …… 生成时选的就是「未来 N 天」，直接映射过去
function topicDate(day) {
  const bj = beijingNow();
  return dateKey(new Date(bj.getTime() + ((day || 1) - 1) * 86400000));
}
function catOptionsHtml(selected) {
  return CATEGORIES.map(c => `<option value="${c.key}"${c.key === selected ? ' selected' : ''}>${c.label}</option>`).join('');
}
// 写入日历；同一天同一标题不重复排
function planTopicToCalendar(dateStr, topic) {
  const mem = loadCalendarMemory();
  mem[dateStr] = mem[dateStr] || [];
  if (mem[dateStr].some(e => e.title === topic.title)) return false;
  mem[dateStr].push({
    title: topic.title,
    angle: topic.angle || '',
    hook: topic.hook || '',
    category: topic.category || 'other',
    day: topic.day || null,
    planned: true,          // 已确认排期，尚未产出/发布
    at: beijingNow().toISOString(),
  });
  localStorage.setItem(CAL_KEY, JSON.stringify(mem));
  renderCalendar();
  return true;
}
function topicCardValue(i, sel) {
  const card = document.querySelector(`.topic-card[data-idx="${i}"]`);
  const el = card && card.querySelector(sel);
  return el ? el.value : '';
}
// 已排期的卡片置灰并标记，避免重复点确认
function refreshTopicPlannedState() {
  const mem = loadCalendarMemory();
  document.querySelectorAll('.topic-card[data-idx]').forEach(card => {
    const i = parseInt(card.dataset.idx, 10);
    const t = window.__topics && window.__topics[i];
    if (!t) return;
    const date = topicCardValue(i, '.tc-date');
    const planned = !!date && (mem[date] || []).some(e => e.title === t.title);
    card.classList.toggle('planned', planned);
    const btn = card.querySelector('.tc-confirm');
    if (btn) {
      btn.disabled = planned;
      btn.textContent = planned ? '已排期 ✓' : '确认排期';
    }
  });
}
window.confirmTopic = function (i) {
  const t = window.__topics && window.__topics[i];
  if (!t) return;
  const date = topicCardValue(i, '.tc-date') || topicDate(t.day);
  const cat = topicCardValue(i, '.tc-cat') || 'other';
  if (!date) { showToast('请先选择排期日期'); return; }
  if (!planTopicToCalendar(date, { title: t.title, angle: t.angle, hook: t.hook, category: cat, day: t.day })) {
    showToast('该选题在这一天已经排过了');
    return;
  }
  refreshTopicPlannedState();
  showToast(`已排入日历：${date}`);
};
function confirmAllTopics() {
  if (!window.__topics || !window.__topics.length) { showToast('先生成选题'); return; }
  let n = 0;
  window.__topics.forEach((t, i) => {
    const date = topicCardValue(i, '.tc-date') || topicDate(t.day);
    if (!date) return;
    if (planTopicToCalendar(date, { title: t.title, angle: t.angle, hook: t.hook, category: topicCardValue(i, '.tc-cat') || 'other', day: t.day })) n++;
  });
  refreshTopicPlannedState();
  if (n) {
    showToast(`已把 ${n} 条选题排入日历`);
    showView('calendar');
  } else {
    showToast('这些选题都已经排过期了');
  }
}
function renderTopics(days) {
  const box = $('topic-result');
  window.__topics = days;
  box.innerHTML = `
    <div class="topic-batch">
      <span class="muted">确认后自动同步到「选题日历」，日期默认按 Day 顺序排到未来 ${days.length} 天，可单独改。</span>
      <button id="btn-confirm-all">全部确认排期</button>
    </div>` + days.map((t, i) => `
    <div class="topic-card" data-idx="${i}">
      <div class="tc-badge">Day${t.day}</div>
      <div class="tc-title">${esc(t.title)}</div>
      <div class="tc-meta"><b>角度</b> ${esc(t.angle || '—')}</div>
      <div class="tc-meta"><b>钩子</b> ${esc(t.hook || '—')}</div>
      <div class="tc-schedule">
        <label>排期</label>
        <input type="date" class="tc-date" value="${topicDate(t.day)}">
        <select class="tc-cat">${catOptionsHtml('other')}</select>
      </div>
      <div class="tc-actions">
        <button class="tc-confirm" onclick="confirmTopic(${i})">确认排期</button>
        <button class="ghost" onclick="fillCopy(${i})">填入文案</button>
        <button class="ghost" onclick="copyTopic(${i})">复制</button>
      </div>
    </div>`).join('');
  const all = $('btn-confirm-all');
  if (all) all.onclick = confirmAllTopics;
  refreshTopicPlannedState();
}
window.fillCopy = function (i) {
  const t = window.__topics && window.__topics[i];
  if (!t) return;
  $('c-topic').value = t.title || '';
  $('c-angle').value = t.angle || '';
  $('c-hook').value = t.hook || '';
  showInfo('已同步到选题与文案', '标题、角度、政策钩子已填入「选题与文案」。点击下方「知道了」将自动跳转到该页面继续编辑。', () => { showView('plan'); showToast('已跳转到「选题与文案」'); });
};
window.copyTopic = function (i) {
  const t = window.__topics && window.__topics[i];
  if (!t) return;
  const txt = `Day${t.day}\n标题：${t.title}\n角度：${t.angle}\n钩子：${t.hook}`;
  navigator.clipboard.writeText(txt).then(() => alert('已复制 Day' + t.day));
};
$('btn-edit-topic').onclick = async () => {
  const ta = $('topic-prompt');
  if (ta.style.display === 'none') {
    const d = await (await fetch('/api/prompts/topic-expert')).json();
    ta.value = '【system】\n' + d.system + '\n\n【user 模板】\n' + d.userTemplate;
    ta.style.display = 'block';
  } else {
    const v = ta.value.split('\n\n【user 模板】\n');
    const sys = v[0].replace('【system】\n', '');
    const ut = v[1] || '';
    await fetch('/api/prompts/topic-expert', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: sys, userTemplate: ut })
    });
    ta.style.display = 'none';
    alert('选题提示词已保存');
  }
};

/* ============ 文案 ============ */
function stripFence(s) {
  return String(s).replace(/```(?:json|markdown)?\s*([\s\S]*?)```/g, '$1').trim();
}

/* ============ 合规：字数限制 + 违禁词 ============ */
// 小红书限制：标题≤20字、正文≤1000字、话题≤10个
const TITLE_MAX = 20, BODY_MAX = 1000, TAG_MAX = 10;
// 教培行业高危违禁词（命中即可能限流/删帖/封号）
const BANNED_WORDS = [
  // 保证/效果承诺
  '保过','保提分','保录取','包过','100%通过','签约保过','不过退费','快速提分','精准提分','靶向提分','名校直通车','精准押题','押题准','稳上','稳提','必过',
  // 关联考试/命题
  '命题专家','原命题教师','内部题库','官方指定','命题组','阅卷组','内部命题','真题泄露','内部渠道','绝密',
  // 受益者推荐证明
  '状元','喜报','红榜','光荣榜','家长感谢信','名师执教','名校名师','上岸案例','学员成绩',
  // 绝对化用语（广告法）
  '国家级','最高级','最佳','最强','最优','顶级','极致','行业标杆','全网第一','销量第一','王牌','王者','史无前例','绝无仅有',
  // 制造焦虑
  '再不补习就落后','一步落后步步落后','分数决定未来','考不上高中就没有未来','名额紧张','考纲重大调整','输在起跑线','落后同龄人',
  // 站外导流
  '加微信','微信号','公众号','私信我','扫码领','0元学','免费领资料'
];
function complianceScan(text) {
  const lines = (text || '').split('\n');
  const titleLine = (lines[0] || '').trim();
  const body = lines.slice(1).join('\n').trim();
  const titleLen = [...titleLine].length;
  const bodyLen = [...body].length;
  const hits = [];
  const dict = window.__bannedWords && window.__bannedWords.length ? window.__bannedWords : BANNED_WORDS;
  for (const w of dict) {
    if (text && text.indexOf(w) !== -1) hits.push(w);
  }
  return { titleLen, bodyLen, hits };
}
// 命中词统一显示：本地词 = 字符串（按高危处理）；云端词 = {keyword, level, category, suggestion}
const LV_META = { high: ['高危', '#d93026'], mid: ['中危', '#e8590c'], low: ['低危', '#e6a700'], tip: ['提示', '#868e96'] };
function hitChip(h) {
  const isStr = typeof h === 'string';
  const kw = isStr ? h : (h && h.keyword) || '';
  const lv = isStr ? 'high' : (h && h.level) || 'tip';
  const cat = isStr ? '' : (h && h.category) || '';
  const sug = isStr ? [] : (h && Array.isArray(h.suggestion) ? h.suggestion : []);
  const meta = LV_META[lv] || LV_META.tip;
  let s = '<span class="hit hit-jump" data-kw="' + escAttr(kw) + '" title="点击定位到正文位置">' + esc(kw) + '</span>' +
    '<span class="lv-tag" style="color:' + meta[1] + ';border-color:' + meta[1] + '">' + meta[0] + '</span>';
  if (cat) s += '<span class="lv-cat">' + esc(cat) + '</span>';
  if (sug.length) s += '<span class="muted">→ 可替换：' + sug.slice(0, 4).map(esc).join(' / ') + '</span>';
  return s;
}
// 云端检测不可用原因 → 展示文案（前端 A+C 降级说明）
function remoteReasonText(reason) {
  if (!reason) return '暂不可用';
  if (reason === 'rate_limit') return '免费额度用尽';
  if (reason === 'auth') return 'Token 失效';
  if (reason === 'timeout') return '连接超时';
  if (String(reason).indexOf('http_') === 0) return '服务异常';
  return '网络不可用';
}
// 三通道合规扫描：本地教培词表（永远可用）+ 离线扩展词库（本地归一化跳字识别，永稳）+ 云端词库（尽力而为，失败自动跳过）。
async function complianceFullScan(text, timeoutMs) {
  const base = complianceScan(text);
  const t = timeoutMs || 6000;
  const call = async (url) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), t);
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text || '' }), signal: ac.signal
      });
      clearTimeout(timer);
      return await r.json();
    } catch (e) { clearTimeout(timer); return { ok: false }; }
  };
  // 两个服务端通道并发跑，整体等待 ≈ 单个通道的最长耗时，互不阻塞
  const [de, dc] = await Promise.all([
    call('/api/compliance/ext-check'),
    call('/api/compliance/remote-check')
  ]);
  const extOk = !!(de && de.ok);
  const cloudOk = !!(dc && dc.ok);
  const cloudReason = (!cloudOk && dc && dc.reason) || '';
  // 合并去重：同一词多通道命中 → 等级取最高（本地命中视为高危）；类别/替换建议优先非本地来源
  const RANK = { high: 4, mid: 3, low: 2, tip: 1 };
  const map = new Map();
  const put = (h, src) => {
    const kw = (h && h.keyword) || '';
    if (!kw) return;
    const nonLocal = src !== '本地教培词表';
    const prev = map.get(kw);
    if (!prev) {
      map.set(kw, {
        keyword: kw,
        level: RANK[h.level] ? h.level : 'tip',
        category: h.category || src,
        suggestion: Array.isArray(h.suggestion) ? h.suggestion : []
      });
      return;
    }
    if ((RANK[h.level] || 0) > (RANK[prev.level] || 0)) prev.level = h.level;
    if (nonLocal) {
      if (h.category) prev.category = h.category;
      if (Array.isArray(h.suggestion) && h.suggestion.length) prev.suggestion = h.suggestion;
    }
  };
  for (const h of (de && de.ok ? (de.hits || []) : [])) put(h, '离线扩展词库');
  for (const h of (dc && dc.ok ? (dc.hits || []) : [])) put(h, '云端词库');
  for (const kw of base.hits) put({ keyword: kw, level: 'high', category: '本地教培词表', suggestion: [] }, '本地教培词表');
  const hits = [...map.values()];
  // 检测源说明
  let sourceText = '本地教培词表';
  const parts = [];
  if (extOk) parts.push('离线扩展词库');
  if (cloudOk) parts.push('云端词库');
  parts.push('本地教培词表');
  sourceText = parts.join(' + ');
  if (!cloudOk && cloudReason) sourceText += '（云端' + remoteReasonText(cloudReason) + '，已自动跳过）';
  return { titleLen: base.titleLen, bodyLen: base.bodyLen, hits, sourceText, extOk, cloudOk };
}
function renderCheck(box, titleLen, bodyLen, hits, tagCount, opts) {
  opts = opts || {};
  const titleOver = titleLen > TITLE_MAX;
  const bodyOver = bodyLen > BODY_MAX;
  const tagOver = (tagCount || 0) > TAG_MAX;
  const ok = !titleOver && !bodyOver && !tagOver && hits.length === 0;
  let html = '<span class="ttl">' + (ok ? '<svg class="ico ok" style="vertical-align:-0.15em"><use href="#i-check"/></svg> 合规检查通过' : '<svg class="ico warn" style="vertical-align:-0.15em"><use href="#i-warning"/></svg> 发现问题，建议修改后再发布') + '</span><br>';
  html += '标题 <span class="stat' + (titleOver ? ' err-text' : '') + '">' + titleLen + '/' + TITLE_MAX + '</span>　';
  html += '正文 <span class="stat' + (bodyOver ? ' err-text' : '') + '">' + bodyLen + '/' + BODY_MAX + '</span>';
  if (tagCount !== undefined) html += '　标签 <span class="stat' + (tagOver ? ' err-text' : '') + '">' + tagCount + '/' + TAG_MAX + '</span>';
  if (hits.length) {
    html += '<br><div class="chk-hits">' + hits.map(hitChip).join('<br>') + '</div>';
    html += '<br><span class="muted">命中词易触发限流/删帖/封号，请按建议改写后再发布。</span>';
  }
  if (opts.note) html += '<br><span class="muted">' + esc(opts.note) + '</span>';
  if (opts.sourceText) html += '<br><span class="muted">检测源：' + esc(opts.sourceText) + '</span>';
  box.className = 'check-box ' + (ok ? 'ok' : 'bad');
  box.innerHTML = html;
  box.style.display = 'block';
}
function updateCounters() {
  const t = $('p-title').value, b = $('p-body').value;
  const tags = $('p-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  const tc = $('p-title-count'), bc = $('p-body-count'), tagc = $('p-tags-count');
  const tl = [...t].length, bl = [...b].length;
  tc.textContent = tl + '/' + TITLE_MAX; tc.classList.toggle('over', tl > TITLE_MAX);
  bc.textContent = bl + '/' + BODY_MAX; bc.classList.toggle('over', bl > BODY_MAX);
  tagc.textContent = tags.length + '/' + TAG_MAX; tagc.classList.toggle('over', tags.length > TAG_MAX);
}
$('btn-check-copy').onclick = async () => {
  const text = $('copy-result').value || '';
  if (!text.trim()) { alert('请先生成文案'); return; }
  const box = $('copy-check');
  box.className = 'check-box'; box.style.display = 'block';
  box.innerHTML = '<span class="muted">合规检测中…（本地词表 + 云端词库）</span>';
  const s = await complianceFullScan(text);
  renderCheck(box, s.titleLen, s.bodyLen, s.hits, undefined, { sourceText: s.sourceText });
  hlApply('copy-result', s.hits);
};
$('btn-check-pub').onclick = async () => {
  const title = $('p-title').value.trim();
  const body = $('p-body').value.trim();
  const tags = $('p-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  const merged = body + (tags.length ? '\n\n' + tags.map(t => '#' + t).join(' ') : '');
  const box = $('pub-check');
  box.className = 'check-box'; box.style.display = 'block';
  box.innerHTML = '<span class="muted">合规检测中…（本地词表 + 云端词库）</span>';
  const s = await complianceFullScan(title + '\n' + merged);
  renderCheck(box, s.titleLen, s.bodyLen, s.hits, tags.length, { sourceText: s.sourceText });
  hlApply('p-title', s.hits);
  hlApply('p-body', s.hits);
};
['p-title', 'p-body', 'p-tags', 'p-category'].forEach(id => {
  const el = $(id); if (!el) return;
  const onChange = () => { updateCounters(); scheduleAutosave(); };
  el.addEventListener('input', onChange);
  el.addEventListener('change', onChange); // select（分类）主要走 change
});

/* ============ 违禁词输入框内高亮（镜像背景层 + 点击跳转）============ */
// textarea/input 本身画不了标记，底下垫一层逐字对齐的背景层：文字排版参数运行时从输入框克隆，避免 CSS 漂移错位
const __hl = {}; // id -> { ta, bd, ranges, cur, text }
function hlBuild(ta) {
  if (__hl[ta.id]) return __hl[ta.id];
  const wrap = document.createElement('div');
  wrap.className = 'hl-wrap';
  const bd = document.createElement('div');
  bd.className = 'hl-backdrop' + (ta.tagName === 'INPUT' ? ' hl-input' : '');
  ta.parentNode.insertBefore(wrap, ta);
  wrap.appendChild(bd);
  wrap.appendChild(ta);
  const cs = getComputedStyle(ta);
  ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','textAlign','borderRadius'].forEach(p => { bd.style[p] = cs[p]; });
  // 背景层无边框：用「padding + 原边框宽度」补出文字起点
  ['Top','Right','Bottom','Left'].forEach(s => { bd.style['padding' + s] = (parseFloat(cs['padding' + s]) + parseFloat(cs['border' + s + 'Width'])) + 'px'; });
  // 不用 inset:0 靠对齐：直接按输入框实际摆放（含 margin），拖拽缩放也跟随
  const place = () => {
    bd.style.top = ta.offsetTop + 'px'; bd.style.left = ta.offsetLeft + 'px';
    bd.style.width = ta.offsetWidth + 'px'; bd.style.height = ta.offsetHeight + 'px';
  };
  place();
  if (window.ResizeObserver) new ResizeObserver(place).observe(ta);
  ta.addEventListener('scroll', () => { bd.scrollTop = ta.scrollTop; bd.scrollLeft = ta.scrollLeft; });
  ta.addEventListener('input', () => hlClear(ta.id)); // 编辑后旧高亮即失效
  __hl[ta.id] = { ta, bd, ranges: [], cur: {}, text: '' };
  return __hl[ta.id];
}
function hlFindRanges(text, hits) {
  const found = [];
  for (const h of (hits || [])) {
    const kw = (h && h.keyword) || ''; if (!kw) continue;
    let i = 0;
    while ((i = text.indexOf(kw, i)) !== -1) { found.push({ s: i, e: i + kw.length, lv: (h && h.level) || 'tip', kw }); i += kw.length; }
  }
  found.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
  const out = []; let last = -1;
  for (const r of found) if (r.s >= last) { out.push(r); last = r.e; } // 重叠时先出现的赢
  return out;
}
function hlRender(key) {
  const st = __hl[key]; if (!st) return;
  const text = st.ta.value;
  let html = '', pos = 0;
  for (const r of st.ranges) {
    html += esc(text.slice(pos, r.s)) + '<mark class="hl-hit hl-' + r.lv + '">' + esc(text.slice(r.s, r.e)) + '</mark>';
    pos = r.e;
  }
  html += esc(text.slice(pos));
  st.bd.innerHTML = st.ta.tagName === 'INPUT' ? '<span>' + html + '</span>' : html + '\n';
  st.bd.scrollTop = st.ta.scrollTop; st.bd.scrollLeft = st.ta.scrollLeft;
  st.text = text;
}
function hlApply(key, hits) {
  const ta = $(key); if (!ta) return;
  const st = hlBuild(ta);
  st.ranges = hlFindRanges(ta.value, hits); // hits 为空 → 清空旧标记
  st.cur = {};
  hlRender(key);
  if (st.ranges.length) showToast('已在输入框标出 ' + st.ranges.length + ' 处命中词，点击检查结果里的词可逐个跳转');
}
function hlClear(key) {
  const st = __hl[key]; if (!st) return;
  st.ranges = []; st.cur = {}; st.bd.innerHTML = ''; st.text = '';
}
function hlJump(key, kw) {
  const st = __hl[key]; if (!st) return false;
  const list = st.ranges.filter(r => r.kw === kw);
  if (!list.length) return false;
  const i = st.cur[kw] || 0; st.cur[kw] = (i + 1) % list.length; // 同词多处 → 每点一次跳下一处
  const r = list[i];
  st.ta.focus();
  st.ta.setSelectionRange(r.s, r.e);
  if (st.ta.tagName === 'TEXTAREA') {
    const line = st.ta.value.slice(0, r.s).split('\n').length - 1;
    const lh = parseFloat(getComputedStyle(st.ta).lineHeight) || 20;
    st.ta.scrollTop = Math.max(0, line * lh - st.ta.clientHeight / 2);
    st.bd.scrollTop = st.ta.scrollTop;
  }
  return true;
}
$('copy-check').addEventListener('click', e => {
  const t = e.target.closest('.hit-jump'); if (t) hlJump('copy-result', t.getAttribute('data-kw'));
});
$('pub-check').addEventListener('click', e => {
  const t = e.target.closest('.hit-jump'); if (!t) return;
  const kw = t.getAttribute('data-kw');
  if (!hlJump('p-title', kw)) hlJump('p-body', kw);
});

/* ============ 违禁词清单编辑 ============ */
window.__bannedWords = BANNED_WORDS.slice(); // 默认兜底，加载后由服务端覆盖
let __bwDraft = [];
async function loadBannedWords() {
  try {
    const r = await fetch('/api/banned-words');
    const d = await r.json();
    window.__bannedWords = d.words || BANNED_WORDS.slice();
    __bwDraft = window.__bannedWords.slice();
    renderBannedList();
  } catch (e) { /* 忽略，保留兜底词表 */ }
}
function renderBannedList() {
  const box = $('bw-list');
  const count = $('bw-count');
  if (!box) return;
  count.textContent = '共 ' + __bwDraft.length + ' 个';
  if (!__bwDraft.length) { box.innerHTML = '<span class="muted">清单为空，添加后将参与合规检查</span>'; return; }
  box.innerHTML = __bwDraft.map(w => `<span class="bw-chip">${esc(w)}<button class="bw-x" data-w="${esc(w)}" title="删除">×</button></span>`).join('');
  box.querySelectorAll('.bw-x').forEach(b => b.onclick = () => {
    __bwDraft = __bwDraft.filter(x => x !== b.dataset.w);
    renderBannedList();
  });
}
function addBannedWord() {
  const inp = $('bw-input');
  const w = inp.value.trim();
  if (!w) return;
  if (__bwDraft.includes(w)) { showToast('已存在：' + w); inp.value = ''; return; }
  __bwDraft.push(w);
  inp.value = '';
  renderBannedList();
  inp.focus();
}
async function saveBannedWords() {
  try {
    const r = await fetch('/api/banned-words', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words: __bwDraft })
    });
    const d = await r.json();
    if (d.ok) { window.__bannedWords = d.words; showToast('已保存 ' + d.count + ' 个违禁词'); }
    else alert('保存失败：' + d.error);
  } catch (e) { alert('保存异常：' + e.message); }
}
async function resetBannedWords() {
  if (!confirm('确定用内置默认违禁词覆盖当前清单？')) return;
  try {
    const r = await fetch('/api/banned-words', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words: BANNED_WORDS.slice() })
    });
    const d = await r.json();
    if (d.ok) { __bwDraft = d.words; window.__bannedWords = d.words; renderBannedList(); showToast('已重置为默认'); }
  } catch (e) { alert('异常：' + e.message); }
}
$('btn-bw-add').onclick = addBannedWord;
$('btn-bw-save').onclick = saveBannedWords;
$('btn-bw-reset').onclick = resetBannedWords;
$('bw-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addBannedWord(); } });

/* ============ 离线扩展词库（只读预览：合规检查的第二个词库通道） ============ */
// 与上面可编辑的 64 条「本地教培清单」不同，这里是 543 条随代码分发、自动参与
// 合规检查的营销合规词库。不提供页内增删（改动在 dict/platform_marketing_words.json）。
const EXT_LV_NAME = { high: '高危', mid: '中危', low: '低危', tip: '提示' };
async function loadExtDict() {
  try {
    const r = await fetch('/api/compliance/ext-dict');
    const d = await r.json();
    if (!d.ok) return;
    const csum = $('ext-count'); if (csum) csum.textContent = '共 ' + d.total + ' 个（' + d.source + '）';
    const csum2 = $('ext-level-sum'); if (csum2) {
      csum2.textContent = '高危' + (d.levels.high || 0) + ' · 中危' + (d.levels.mid || 0) + ' · 低危' + (d.levels.low || 0) + ' · 提示' + (d.levels.tip || 0);
    }
    const box = $('ext-list'); if (!box) return;
    if (!d.words || !d.words.length) { box.innerHTML = '<span class="muted">扩展词库为空</span>'; return; }
    // 按分类分组
    const byCat = {};
    for (const w of d.words) (byCat[w.c || '未分类'] = byCat[w.c || '未分类'] || []).push(w);
    box.innerHTML = Object.entries(byCat).sort((a, b) => b[1].length - a[1].length).map(([cat, arr]) => {
      const meta = LV_META; // {high:['高危',color]...}
      const chips = arr.map(w => {
        const m = meta[w.l] || meta.tip;
        return '<span class="ext-chip" title="' + esc(cat) + '">' + esc(w.k) +
          '<span class="lv-tag" style="color:' + m[1] + ';border-color:' + m[1] + '">' + m[0] + '</span></span>';
      }).join('');
      return '<details class="ext-cat"><summary>' + esc(cat) + ' <span class="muted">' + arr.length + ' 词</span></summary>' +
        '<div class="ext-words">' + chips + '</div></details>';
    }).join('');
  } catch (e) { /* 忽略 */ }
}
if ($('ext-dict-box')) loadExtDict();

/* ============ 违规日志 ============ */
async function loadViolationLog() {
  try {
    const r = await fetch('/api/violation-log');
    const d = await r.json();
    renderViolationList(d.items || []);
    // 填充触发原因下拉
    if (d.triggers) {
      const sel = $('vl-trigger');
      const currentVal = sel.value;
      sel.innerHTML = '<option value="">-- 选择或手动填写 --</option>' +
        d.triggers.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
      sel.value = currentVal;
    }
  } catch (e) { /* ignore */ }
}
function renderViolationList(items) {
  const ul = $('vl-list');
  const empty = $('vl-empty');
  const stats = $('vl-stats');
  if (!ul) return;
  if (!items.length) {
    ul.innerHTML = '';
    if (empty) empty.style.display = 'block';
    if (stats) stats.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';
  // 统计
  const byType = {};
  items.forEach(i => { byType[i.type] = (byType[i.type] || 0) + 1; });
  const typeLabel = { warning: '警告', limit: '限流', ban: '封禁', other: '其他' };
  if (stats) {
    stats.style.display = 'block';
    stats.innerHTML = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px">' +
      Object.entries(byType).map(([k, v]) =>
        `<span style="background:${k==='warning'?'#fef3c7':k==='limit'?'#fee2e2':k==='ban'?'#fecaca':'#e5e7eb'};padding:4px 12px;border-radius:20px;font-size:12px">${typeLabel[k]||k} ×${v}</span>`
      ).join('') +
      `<span style="background:#E7F3EE;color:#0F5A3F;padding:4px 12px;border-radius:20px;font-size:12px"><svg class="ico ico-sm"><use href="#i-clipboard"/></svg> 共 ${items.length} 条记录</span></div>`;
  }
  ul.innerHTML = items.map(v => {
    const typeBadge = typeLabel[v.type] || v.type;
    const timeStr = v.time ? new Date(v.time).toLocaleString('zh-CN') : '';
    return `<li class="draft-item">
      <div class="di-top">
        <div class="di-info" style="flex:1">
          <div class="di-title">
            <span class="di-cat" style="background:${v.type==='warning'?'#fef3c7':v.type==='limit'?'#fee2e2':v.type==='ban'?'#fecaca':'#e5e7eb'};color:${v.type==='warning'?'#92400e':v.type==='limit'?'#991b1b':v.type==='ban'?'#991b1b':'#374151'}">${typeBadge}</span>
            ${v.auto ? '<span class="di-cat" style="background:#EEF2FF;color:#3730A3">自动</span>' : '<span class="di-cat" style="background:#F1F5F3;color:#48655A">手动</span>'}
            ${esc(v.trigger || '未填写原因')}
          </div>
          <div class="di-meta"><span>${timeStr}</span></div>
          ${v.detail ? `<div class="di-body-preview"><svg class="ico ico-sm"><use href="#i-edit"/></svg> ${esc(v.detail)}</div>` : ''}
          ${v.action ? `<div class="di-tags" style="color:#059669"><svg class="ico ok ico-sm"><use href="#i-check"/></svg> 处理：${esc(v.action)}</div>` : ''}
        </div>
      </div>
      <div class="di-actions">
        <button class="ghost di-del" onclick="delVL('${v.id}')"><svg class="ico err"><use href="#i-trash"/></svg>删除</button>
      </div>
    </li>`;
  }).join('');
}
$('btn-vl-add').onclick = async () => {
  const type = $('vl-type').value;
  let trigger = $('vl-trigger').value;
  const detail = $('vl-detail').value.trim();
  const action = $('vl-action').value.trim();
  if (!trigger) {
    trigger = detail.slice(0, 30) || '其他';
  }
  try {
    const r = await fetch('/api/violation-log', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, trigger, detail, action })
    });
    const d = await r.json();
    if (d.ok) {
      showToast('已记录违规事件');
      // 清空表单
      $('vl-detail').value = '';
      $('vl-action').value = '';
      $('vl-trigger').value = '';
      loadViolationLog();
    } else alert('记录失败：' + d.error);
  } catch (e) { alert('异常：' + e.message); }
};
window.delVL = async (id) => {
  if (!confirm('确定删除这条违规记录？')) return;
  try { await fetch('/api/violation-log/' + encodeURIComponent(id), { method: 'DELETE' }); loadViolationLog(); } catch (e) {}
};

$('btn-copy').onclick = async () => {
  const topic = $('c-topic').value.trim();
  const angle = $('c-angle').value.trim();
  const hook = $('c-hook').value.trim();
  const aud = $('c-aud').value.trim();
  if (!topic && !angle && !hook && !aud) { alert('请输入内容'); return; }
  const box = $('copy-result'); box.value = '生成中…';
  $('copy-stat').innerHTML = '';
  const r = await fetch('/api/generate/copy', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: $('c-topic').value, angle: $('c-angle').value,
      policy_hook: $('c-hook').value, audience: $('c-aud').value,
      campus: window.__campus || ''
    })
  });
  const d = await r.json();
  box.value = stripFence(d.result || ('错误：' + (d.error || '未知')));
  hlClear('copy-result'); // 新文案覆盖后旧高亮作废
  renderCampusStat($('copy-stat'), d.campusStat);
};
$('btn-edit-copy').onclick = async () => {
  const ta = $('copy-prompt');
  if (ta.style.display === 'none') {
    const d = await (await fetch('/api/prompts/copywriter')).json();
    ta.value = '【system】\n' + d.system + '\n\n【user 模板】\n' + d.userTemplate;
    ta.style.display = 'block';
  } else {
    const v = ta.value.split('\n\n【user 模板】\n');
    const sys = v[0].replace('【system】\n', '');
    const ut = v[1] || '';
    await fetch('/api/prompts/copywriter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: sys, userTemplate: ut })
    });
    ta.style.display = 'none';
    alert('文案提示词已保存');
  }
};

/* ============ 封面 ============ */
let aiCoverPath = '';
let materials = []; // { id, path, name, asCover }
function updateCoverPreview() {
  const cover = (materials.find(m => m.asCover) || {}).path || aiCoverPath;
  const img = $('cover-img');
  if (cover) { img.src = cover + '?t=' + Date.now(); img.style.display = 'block'; }
  else { img.style.display = 'none'; }
}
async function loadCoverTemplates() {
  try {
    const r = await fetch('/api/cover/templates');
    const d = await r.json();
    const sel = $('cv-tpl');
    if (!sel || !d.templates) return;
    d.templates.forEach(t => {
      const o = document.createElement('option');
      o.value = t.id; o.textContent = t.name;
      sel.appendChild(o);
    });
    const saved = localStorage.getItem('cvTpl');
    if (saved) sel.value = saved;
  } catch (e) { /* 模板接口失败不影响生成，默认 template1 */ }
}
async function renderCover() {
  const title = $('cv-title').value.trim();
  const sub = $('cv-sub').value.trim();
  const tag = $('cv-tag').value.trim();
  const intro = $('cv-intro') ? $('cv-intro').value.trim() : '';
  if (!title && !sub && !tag && !intro) { alert('请输入内容'); return; }
  const img = $('cover-img');
  const tpl = ($('cv-tpl') && $('cv-tpl').value) || 'template1';
  try { localStorage.setItem('cvTpl', tpl); } catch (e) {}
  const r = await fetch('/api/cover/render', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: $('cv-title').value, subtitle: $('cv-sub').value, tag: $('cv-tag').value, intro: $('cv-intro') ? $('cv-intro').value : '', template: tpl })
  });
  const d = await r.json();
  if (d.ok) { aiCoverPath = d.url; updateCoverPreview(); }
  else { alert('封面渲染失败：' + d.error); }
}
$('btn-cover').onclick = renderCover;
$('btn-cv-sync').onclick = () => {
  const t = $('p-title').value.trim();
  if (!t) { showToast('上方笔记标题还是空的，先填标题再同步'); return; }
  $('cv-title').value = t;
  const tags = $('p-tags').value.split(/[,，、]/).map(s => s.trim()).filter(Boolean).slice(0, 5);
  if (!tags.length) return;
  if ($('cv-tag').value.trim()) { showToast('主标题已同步；标签框已有内容，未覆盖'); return; }
  $('cv-tag').value = tags.join(' ');
  showToast('已同步主标题和前 ' + tags.length + ' 个标签');
};
$('btn-cv-intro').onclick = async () => {
  const btn = $('btn-cv-intro');
  const title = $('p-title').value.trim() || $('cv-title').value.trim();
  const body = $('p-body').value.trim();
  if (!title && !body) { showToast('先填笔记标题或正文，AI 才有依据'); return; }
  btn.disabled = true;
  try {
    const r = await fetch('/api/generate/intro', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body: body.slice(0, 500) })
    });
    const d = await r.json();
    if (d.intro) { $('cv-intro').value = d.intro; showToast('简介已生成，可再手动改'); }
    else showToast('生成失败：' + (d.error || '未知错误'));
  } catch (e) { showToast('生成失败：' + e.message); }
  btn.disabled = false;
};
loadCoverTemplates();

function readFileAsDataURL(f) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(f);
  });
}
$('cv-upload').onchange = async (e) => {
  const files = Array.from(e.target.files || []);
  for (const f of files) {
    const dataUrl = await readFileAsDataURL(f);
    const r = await fetch('/api/cover/upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: f.name, data: dataUrl })
    });
    const d = await r.json();
    if (d.ok) materials.push({ id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6), path: d.path, name: f.name, asCover: false });
  }
  e.target.value = '';
  renderMaterials();
};
function renderMaterials() {
  const ul = $('cv-materials');
  if (!materials.length) { ul.innerHTML = '<li class="muted">尚未上传</li>'; return; }
  ul.innerHTML = materials.map((m, i) => `
    <li class="mat-item">
      <img src="${m.path}" class="mat-thumb">
      <span class="mat-name">${esc(m.name)}</span>
      <label class="mat-cover"><input type="radio" name="ascover" ${m.asCover ? 'checked' : ''} onchange="setCover('${m.id}')"> 设为封面</label>
      <button class="ghost" onclick="moveMat(${i},-1)">↑</button>
      <button class="ghost" onclick="moveMat(${i},1)">↓</button>
      <button class="ghost" onclick="delMat('${m.id}')"><svg class="ico err ico-sm"><use href="#i-trash"/></svg></button>
    </li>`).join('');
}
window.setCover = (id) => { materials.forEach(m => m.asCover = (m.id === id)); renderMaterials(); updateCoverPreview(); };
window.moveMat = (i, dir) => {
  const j = i + dir; if (j < 0 || j >= materials.length) return;
  [materials[i], materials[j]] = [materials[j], materials[i]];
  renderMaterials();
};
window.delMat = (id) => { materials = materials.filter(m => m.id !== id); renderMaterials(); updateCoverPreview(); };

/* ============ 同步到发布栏 ============ */
$('btn-sync-publish').onclick = () => {
  // 从文案结果提取标签（#标签 形式）或保留正文中的 # 话题
  const bodyText = $('copy-result').value || '';
  const tags = (bodyText.match(/#([^\s#]+)/g) || []).map(s => s.slice(1));
  $('p-title').value = $('c-topic').value || '';
  $('p-body').value = bodyText;
  hlClear('p-title'); hlClear('p-body'); // 内容被覆盖，旧高亮作废
  $('p-tags').value = tags.join(',');
  updateCounters(); // 同步后刷新字数计数
  saveAutosave();   // 同步即存进本机暂存，刷新也不丢
  showInfo('已同步到发布栏', '标题、正文、标签已填入「发布到小红书」。点击下方「知道了」将自动跳转到该页面检查并发布。', () => { showView('publish'); showToast('已跳转到「发布到小红书」'); });
};

/* ============ 通用提示弹窗 ============ */
let infoCb = null;
function showInfo(title, msg, cb) {
  $('info-title').textContent = title;
  $('info-msg').textContent = msg;
  $('info-mask').classList.add('show');
  infoCb = cb || null;
}
function closeInfo() {
  $('info-mask').classList.remove('show');
  const cb = infoCb; infoCb = null;
  if (cb) cb();
}

/* ============ 选题日历 + 记忆 ============ */
const CATEGORIES = [
  { key: 'policy', label: '政策讲解', color: '#0F7A52' },
  { key: 'subject', label: '学科分享', color: '#0E7490' },
  { key: 'institution', label: '机构动态', color: '#D97706' },
  { key: 'parents', label: '家长干货', color: '#10B981' },
  { key: 'other', label: '其他', color: '#64748b' },
];
function catOf(key) { return CATEGORIES.find(c => c.key === key) || CATEGORIES[4]; }
const CAL_KEY = 'xhs_calendar_memory';
function loadCalendarMemory() {
  try { return JSON.parse(localStorage.getItem(CAL_KEY) || '{}'); } catch (e) { return {}; }
}
// 北京时间（UTC+8），不受浏览器本地时区影响
function beijingNow() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 8 * 3600000);
}
let calView = null; // 当前查看的年月 {y, m}
function addCalendarMemory(dateStr, topic) {
  const mem = loadCalendarMemory();
  mem[dateStr] = mem[dateStr] || [];
  mem[dateStr].push({ title: topic.title, angle: topic.angle || '', hook: topic.hook || '', category: topic.category || 'other', at: beijingNow().toISOString() });
  localStorage.setItem(CAL_KEY, JSON.stringify(mem));
  renderCalendar();
}
function renderCalendar() {
  const box = $('calendar');
  const bj = beijingNow();
  if (!calView) calView = { y: bj.getFullYear(), m: bj.getMonth() };
  const { y, m } = calView;
  const todayStr = dateKey(bj);
  const first = new Date(y, m, 1);
  const startWeek = (first.getDay() + 6) % 7; // 周一为一周开始
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const mem = loadCalendarMemory();
  const head = ['一','二','三','四','五','六','日'].map(d => `<div class="cal-head">${d}</div>`).join('');
  let cells = '';
  for (let i = 0; i < startWeek; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = ds === todayStr;
    const has = mem[ds] && mem[ds].length;
    const dots = has ? mem[ds].slice(0, 5).map(e => `<span class="cal-dot" style="background:${catOf(e.category).color}"></span>`).join('') : '';
    cells += `<div class="cal-cell ${isToday ? 'today' : ''}" data-date="${ds}">
      <div class="cal-num">${d}</div>
      <div class="cal-dots">${dots}</div>
    </div>`;
  }
  box.innerHTML = head + cells;
  $('cal-label').textContent = `${y}年${m + 1}月`;
  renderCalendarTooltip();
}
// 日历 hover 浮窗：显示当日所有选题的标题 + 分类 + 发布状态（仅成功/草稿，过滤失败）
function renderCalendarTooltip() {
  let tip = document.getElementById('cal-tooltip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'cal-tooltip'; document.body.appendChild(tip); }
  const mem = loadCalendarMemory();
  const history = window.__publishHistory || [];
  document.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    const ds = cell.dataset.date;
    const entries = mem[ds] || [];
    if (!entries.length) return;
    cell.addEventListener('mouseenter', () => {
      // 过滤：只保留发布成功或草稿保存的记录（排除失败）
      const rows = entries.map(e => {
        const cat = catOf(e.category);
        const match = history.filter(h => h.title === e.title).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        // 已确认排期但还没产出 → 与「已发布 / 草稿」区分开，日历才有排期意义
        let status = e.planned
          ? '<svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-calendar"/></svg> 已排期'
          : '选题已记录';
        if (match) {
          if (match.realResult === 'published') status = '<svg class="ico ok ico-sm" style="vertical-align:-0.1em"><use href="#i-check"/></svg> 已发布';
          else if (match.realResult === 'draft-saved') status = '<svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-clipboard"/></svg> 草稿';
          else if (match.success === false) return null; // 失败的不显示
          else status = '<svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-history"/></svg> 已提交';
        }
        return `<div class="cal-tip-row"><span class="cal-tip-dot" style="background:${cat.color}"></span><span class="cal-tip-title">${esc(e.title)}</span><span class="cal-tip-status">${status}</span></div>`;
      }).filter(Boolean).join('');
      const count = entries.filter(e => {
        const match = history.filter(h => h.title === e.title).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        return !match || match.success !== false;
      }).length;
      if (!count) { tip.classList.remove('show'); return; }
      tip.innerHTML = `<div class="cal-tip-head">${ds} · 共 ${count} 条</div>${rows}`;
      tip.classList.add('show');
      const r = cell.getBoundingClientRect();
      tip.style.left = Math.min(r.left, window.innerWidth - 300) + 'px';
      tip.style.top = (r.bottom + 6) + 'px';
    });
    cell.addEventListener('mouseleave', () => tip.classList.remove('show'));
  });
}
// 月份切换
$('cal-prev').onclick = () => { if (!calView) calView = { y: beijingNow().getFullYear(), m: beijingNow().getMonth() }; calView.m--; if (calView.m < 0) { calView.m = 11; calView.y--; } renderCalendar(); };
$('cal-next').onclick = () => { if (!calView) calView = { y: beijingNow().getFullYear(), m: beijingNow().getMonth() }; calView.m++; if (calView.m > 11) { calView.m = 0; calView.y++; } renderCalendar(); };
$('cal-today').onclick = () => { const bj = beijingNow(); calView = { y: bj.getFullYear(), m: bj.getMonth() }; renderCalendar(); };
function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

/* ============ 发布页自动暂存（防刷新 / 误关丢失）============ */
// 只保留「当前正在编辑的那一份」：改动即写本机，下次打开问你要不要留。
const AUTOSAVE_KEY = 'xhs_publish_autosave';
let __autoSaveTimer = null;
function publishSnapshot() {
  const g = (id) => ($(id) ? $(id).value : '');
  return {
    title: g('p-title'), body: g('p-body'), tags: g('p-tags'),
    category: g('p-category') || 'other',
    cover: (materials.find(m => m.asCover) || {}).path || (typeof aiCoverPath !== 'undefined' ? aiCoverPath : '') || '',
    materials: materials.map(m => ({ path: m.path, name: m.name, asCover: m.asCover })),
    time: new Date().toLocaleString('zh-CN')
  };
}
function snapshotHasContent(s) { return !!(s && ((s.title || '').trim() || (s.body || '').trim())); }
function saveAutosave() {
  try {
    const s = publishSnapshot();
    if (!snapshotHasContent(s)) { localStorage.removeItem(AUTOSAVE_KEY); return; }
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(s));
  } catch (e) {}
}
function scheduleAutosave() {
  if (__autoSaveTimer) clearTimeout(__autoSaveTimer);
  __autoSaveTimer = setTimeout(saveAutosave, 800);
}
function applySnapshot(s) {
  $('p-title').value = s.title || '';
  $('p-body').value = s.body || '';
  hlClear('p-title'); hlClear('p-body');
  $('p-tags').value = s.tags || '';
  $('p-category').value = s.category || 'other';
  if (s.cover) { aiCoverPath = s.cover; updateCoverPreview(); }
  if (s.materials && s.materials.length) { materials = s.materials.map(m => Object.assign({}, m)); renderMaterials(); }
  updateCounters();
}
function clearPublishForm() {
  $('p-title').value = ''; $('p-body').value = ''; $('p-tags').value = '';
  hlClear('p-title'); hlClear('p-body');
  aiCoverPath = ''; materials = [];
  renderMaterials(); updateCoverPreview(); updateCounters();
}
// 刷新/重开页面：不默默恢复，先问「留还是丢」
function promptRestoreAutosave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null'); } catch (e) {}
  if (!s || !snapshotHasContent(s)) return;
  const t = (s.title || s.body || '').trim().slice(0, 16);
  askChoice('刚刚编辑的内容没有保存', '「' + t + '…」还留在本机暂存里，要做什么操作？',
    '丢弃并清空', '保留这次编辑', keep => {
      if (!keep) { localStorage.removeItem(AUTOSAVE_KEY); clearPublishForm(); showToast('已丢弃，发布表单已清空'); return; }
      applySnapshot(s);
      showToast('已保留上次编辑的内容（' + (s.time || '') + '）');
    });
}

/* ============ 一键下载发布包（手动发布替代方案）============ */
$('btn-download-pkg').onclick = () => {
  const title = $('p-title').value.trim();
  const body = $('p-body').value.trim();
  const rawTags = $('p-tags').value.trim();
  const tags = rawTags.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  const category = $('p-category').value || 'other';
  const catLabel = { policy: '政策讲解', subject: '学科分享', institution: '机构动态', parents: '家长干货', other: '其他' }[category] || category;

  if (!title && !body) {
    alert('请先填写标题或正文内容');
    return;
  }

  // 格式化内容：模拟小红书发布格式
  const hashTags = tags.length ? '\n\n' + tags.map(t => '#' + t).join(' ') : '';
  const lines = [
    '═══════════════════════════',
    '   小红书发布素材包（手动发布用）',
    '═══════════════════════════',
    '',
    '【标题】',
    title || '（未填写）',
    '',
    '【分类】',
    catLabel,
    '',
    '【正文】',
    body || '（未填写）',
    '',
    '【标签】',
    tags.length ? tags.join('、') : '（未填写）',
    '',
    '【复制到小红书时直接粘贴以下内容】',
    '───────────────────────────',
    title,
    '',
    body + hashTags,
    '───────────────────────────',
    '',
    '【封面图】',
    (typeof aiCoverPath !== 'undefined' && aiCoverPath)
      ? '已生成封面 → 右键上方封面图片「图片另存为」即可'
      : '尚未生成封面，建议先在「① AI 封面」区域生成一张',
    '',
    '【使用说明】',
    '1. 打开小红书网页版/APP，新建笔记',
    '2. 粘贴上方「复制到小红书」区域的完整内容',
    '3. 上传封面图和素材图',
    '4. 检查无误后点发布',
    '',
    '生成时间：' + new Date().toLocaleString('zh-CN'),
    '═══════════════════════════',
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '小红书发布_' + (title.slice(0, 15) || '素材') + '_' + new Date().toISOString().slice(0, 10) + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const box = $('publish-result');
  box.innerHTML = '<span class="ok-text"><svg class="ico ok" style="vertical-align:-0.15em"><use href="#i-download"/></svg> 发布包已下载！</span><br>' +
    '<span class="muted">打开下载的 txt 文件，按里面的步骤手动发小红书即可。别忘了保存封面图（右键→另存为）。</span>';
};

/* ============ 发布（两按钮）============ */
let pendingMode = null;
async function doPublish(mode) {
  const box = $('publish-result'); box.textContent = '正在启动发布脚本…';
  const title = $('p-title').value.trim();
  if (!title) { box.innerHTML = '<span class="err-text"><svg class="ico err" style="vertical-align:-0.15em"><use href="#i-close"/></svg> 请先填写标题</span>'; return; }
  const tags = $('p-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  const cover = (materials.find(m => m.asCover) || {}).path || aiCoverPath || '';
  // 封面优先，保证发布首图正确；其余素材跟进
  const images = [];
  if (cover) images.push(cover);
  for (const m of materials) if (m.path !== cover) images.push(m.path);
  if (!images.length) {
    box.innerHTML = '<span class="err-text"><svg class="ico err" style="vertical-align:-0.15em"><use href="#i-close"/></svg> 请先生成或上传至少一张图片（封面/素材），小红书发布必须含图</span>';
    return;
  }
  // ===== 发布前 CDP 状态引导（修复问题①：避免静默回退未登录窗口又要重扫码）=====
  let cdpConnected = false;
  try {
    const cs = await fetch('/api/publish-cdp-status').then(r => r.json()).catch(() => ({ connected: false }));
    cdpConnected = !!(cs && cs.connected);
  } catch (e) {}
  if (!cdpConnected) {
    const tip = mode === 'publish'
      ? '你还没有启动并登录「发布专用浏览器」。现在点【直接发布】会弹出一个未登录的新浏览器窗口，需要重新扫码登录，且风控风险较高。\n\n建议：先点左侧「启动发布专用浏览器」并扫码登录一次（之后会复用已登录环境），再回来发布。\n\n仍要直接发布（将弹出未登录窗口）？'
      : '你还没有启动并登录「发布专用浏览器」。现在点【存小红书草稿箱】会弹出一个未登录的新浏览器窗口，需要重新扫码登录。\n\n建议：先点左侧「启动发布专用浏览器」并扫码登录一次（之后会复用已登录环境），再回来操作。\n\n仍要继续（将弹出未登录窗口）？';
    if (!window.confirm(tip)) {
      box.innerHTML = '<span class="muted"><svg class="ico warn ico-sm" style="vertical-align:-0.1em"><use href="#i-warning"/></svg> 已取消。请先点左侧【启动发布专用浏览器】扫码登录，再回来发布。</span>';
      return;
    }
  }
  // 标签并入正文（脚本为纯发布，不单独处理 tags 字段）
  let body = $('p-body').value.trim();
  if (tags.length) {
    const tagLine = tags.map(t => '#' + t).join(' ');
    body = body ? body + '\n\n' + tagLine : tagLine;
  }
  // ===== 发布前合规硬拦截（小红书限制 + 教培高危词）=====
  const titleLen = [...title].length, bodyLen = [...body].length;
  if (titleLen > TITLE_MAX) { box.innerHTML = '<span class="err-text"><svg class="ico err" style="vertical-align:-0.15em"><use href="#i-close"/></svg> 标题 ' + titleLen + ' 字，超过小红书 20 字上限，会被截断/拒发。请精简后再发布。</span>'; return; }
  if (bodyLen > BODY_MAX) { box.innerHTML = '<span class="err-text"><svg class="ico err" style="vertical-align:-0.15em"><use href="#i-close"/></svg> 正文 ' + bodyLen + ' 字，超过小红书 1000 字上限。请精简后再发布。</span>'; return; }
  if (tags.length > TAG_MAX) { box.innerHTML = '<span class="err-text"><svg class="ico err" style="vertical-align:-0.15em"><use href="#i-close"/></svg> 标签 ' + tags.length + ' 个，超过上限 10 个。请删减后再发布。</span>'; return; }
  const scan = complianceScan(title + '\n' + body);
  if (scan.hits.length) {
    box.innerHTML = '<span class="err-text"><svg class="ico err" style="vertical-align:-0.15em"><use href="#i-close"/></svg> 命中 ' + scan.hits.length + ' 个教培高危词：' + scan.hits.map(h => '<span class="hit">' + h + '</span>').join('') + '。<br>为防删帖/封号，请改写后再发布。</span>';
    return;
  }
  // ===== 离线扩展/云端补充检测：本地词表未命中时，扩展词库与云端词库再扫一遍（含跳字/变体识别）。断网/超限自动跳过，不阻塞发布 =====
  const full = await complianceFullScan(title + '\n' + body, 2500);
  const blockers = (full.hits || []).filter(h => h.level === 'high' || h.level === 'mid');
  if (blockers.length) {
    box.innerHTML = '<span class="err-text"><svg class="ico err" style="vertical-align:-0.15em"><use href="#i-close"/></svg> 命中 ' + blockers.length + ' 个平台级违规点（中危及以上），为防删帖/封号请改写后再发布：</span><br>' +
      blockers.map(hitChip).join('<br>') +
      '<br><span class="muted">检测源：' + esc(full.sourceText) + '</span>';
    return;
  }
  const payload = { title, body, images, mode, category: $('p-category').value || 'other' };
  const r = await fetch('/api/publish', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const d = await r.json();
  if (d.ok) {
    box.innerHTML = `<span class="ok-text"><svg class="ico ok" style="vertical-align:-0.15em"><use href="#i-check"/></svg> ${d.message}</span><br><br>` +
      `任务单：<code>${d.taskPath}</code><br>` +
      `模式：<b>${mode === 'draft' ? '<svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-clipboard"/></svg> 存小红书草稿箱（填完内容停在编辑页）' : '<svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-send"/></svg> 直接发布（全自动）'}</b><br>` +
      `封面：${cover || '（无）'} | 素材图：${images.length} 张<br><br>` +
      `<span class="muted" id="pub-status"><svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-history"/></svg> 等待脚本执行完成…</span>`;
    localStorage.removeItem(AUTOSAVE_KEY); // 已交付给发布脚本，本机暂存清掉
    // 暂存日历数据：仅当脚本真正执行成功才写入选题日历（避免失败也留记录）
    const pendingCal = { title: $('p-title').value, angle: $('c-angle').value, hook: $('c-hook').value, category: $('p-category').value || 'other' };
    if (d.resultPath) pollPublishResult(d.resultPath, box, pendingCal);
  } else {
    // 服务端拦截（含频率护栏 429）：把错误按行渲染，区分风控提示
    const msg = (d.error || '未知错误').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    const isGuard = d.error && /间隔|分钟/.test(d.error);
    box.innerHTML = '<span class="err-text"><svg class="ico err" style="vertical-align:-0.15em"><use href="#i-close"/></svg> ' + msg + '</span>' +
      (isGuard ? '<br><br><span class="muted">提示：将「最小发布间隔」调大、或改用手动发布（一键下载）可进一步降低风控概率。</span>' : '');
  }
}

// 轮询发布脚本执行结果
async function pollPublishResult(resultPath, box, pendingCal) {
  const statusEl = $('pub-status') || box;
  for (let i = 0; i < 72; i++) { // 72 * 5s = 6min，比服务端脚本超时(5min)多留 1 分钟，避免同时到点看不到最终状态
    await new Promise(r => setTimeout(r, 5000));
    try {
      const r = await fetch('/api/publish-result?path=' + encodeURIComponent(resultPath));
      if (!r.ok) continue;
      const d = await r.json();
      if (!d.completed) continue;
      if (d.success) {
        statusEl.innerHTML = '<span class="ok-text"><svg class="ico ok" style="vertical-align:-0.15em"><use href="#i-check"/></svg> 脚本执行完成！</span>' +
          (d.stdout ? '<br><pre class="log-out">' + d.stdout.slice(-500) + '</pre>' : '') +
          '<br><span class="muted">请检查弹出的浏览器窗口确认最终状态。</span>';
        // 仅在真正成功时写入选题日历
        if (pendingCal) addCalendarMemory(dateKey(new Date()), pendingCal);
      } else {
        statusEl.innerHTML = '<span class="err-text"><svg class="ico err" style="vertical-align:-0.15em"><use href="#i-close"/></svg> 脚本执行失败</span>' +
          (d.error ? '<br>错误：' + d.error : '') +
          (d.stderr ? '<br><pre class="log-err">' + d.stderr.slice(-800) + '</pre>' : '') +
          '<br><span class="muted"><svg class="ico warn ico-sm" style="vertical-align:-0.1em"><use href="#i-warning"/></svg> 发布失败，未写入选题日历；已自动记入「违规日志」。</span>';
        // 记录由服务端完成（页面关了也不丢），这里不再重复写
      }
      return;
    } catch (e) { /* 继续轮询 */ }
    statusEl.textContent = `等待中… (${(i+1)*5}s)`;
  }
  statusEl.innerHTML = '<span class="muted"><svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-history"/></svg> 轮询超时（6分钟），脚本可能仍在运行。请查看浏览器窗口或 server 控制台。</span>';
}
$('btn-publish-draft').onclick = () => doPublish('draft');
$('btn-publish-now').onclick = () => { pendingMode = 'publish'; $('confirm-mask').classList.add('show'); };
function closeConfirm(ok) {
  $('confirm-mask').classList.remove('show');
  if (ok && pendingMode) doPublish(pendingMode);
  pendingMode = null;
}

/* ============ 发布环境 / 风控护栏（反检测）============ */
let cdpPollTimer = null;
async function loadPublishEnv() {
  try {
    const r = await fetch('/api/publish-settings');
    const d = await r.json();
    const st = $('cdp-status-text');
    if (d.cdp && d.cdp.connected) {
      st.innerHTML = '<span style="color:#16a34a;font-weight:600"><svg class="ico ok ico-sm" style="vertical-align:-0.1em"><use href="#i-check"/></svg> 已连接（' + esc(d.cdp.browser || 'real browser') + '）</span>';
      $('btn-cdp-launch').style.display = 'none';
      $('cdp-launch-hint').textContent = '自动发布将复用此真实浏览器环境，大幅降风险。';
    } else {
      st.innerHTML = '<span style="color:#d97706;font-weight:600"><svg class="ico warn ico-sm" style="vertical-align:-0.1em"><use href="#i-warning"/></svg> 未连接（将用独立自动化环境，风险较高）</span>';
      $('btn-cdp-launch').style.display = '';
      $('cdp-launch-hint').textContent = '点此打开一个带远程调试的真实浏览器（首次需登录一次，之后复用）。';
    }
    $('guard-interval').value = d.minIntervalMinutes || 10;
    $('guard-draft-interval').value = d.minDraftIntervalMinutes || 15;
    renderGuardInfo(d);
  } catch (e) {
    $('cdp-status-text').textContent = '检测失败';
  }
}
// 发布与存草稿分别计时：两者对平台都是写操作，都会累积账号行为标记
function guardLine(label, lastAt, min) {
  if (!lastAt) return label + '：尚未记录。';
  const last = new Date(lastAt);
  const next = new Date(last.getTime() + min * 60000);
  const now = new Date();
  if (now < next) {
    const waitMin = Math.ceil((next - now) / 60000);
    return label + '：' + last.toLocaleString('zh-CN') + ' ｜ <span style="color:#d97706">还需约 ' + waitMin + ' 分钟</span>';
  }
  return label + '：' + last.toLocaleString('zh-CN') + ' ｜ 已满足间隔。';
}
function renderGuardInfo(d) {
  const info = $('guard-info');
  if (!info) return;
  info.innerHTML = guardLine('自动发布', d.lastPublishAt, d.minIntervalMinutes || 10)
    + '<br>' + guardLine('存小红书草稿', d.lastDraftAt, d.minDraftIntervalMinutes || 15);
}
$('btn-cdp-launch').onclick = async () => {
  const hint = $('cdp-launch-hint');
  hint.textContent = '正在启动发布专用浏览器…';
  try {
    const r = await fetch('/api/publish-cdp-launch', { method: 'POST' });
    const d = await r.json();
    if (!d.ok) { hint.textContent = '启动失败：' + (d.error || ''); return; }
    hint.textContent = '已启动，正在连接调试端口…';
    if (cdpPollTimer) clearInterval(cdpPollTimer);
    let tries = 0;
    cdpPollTimer = setInterval(async () => {
      tries++;
      try {
        const s = await fetch('/api/publish-cdp-status');
        const sd = await s.json();
        if (sd.connected) { clearInterval(cdpPollTimer); loadPublishEnv(); loadStatus(); }
        else if (tries >= 15) { clearInterval(cdpPollTimer); hint.textContent = '连接超时，请检查浏览器是否弹出或端口被占用。'; }
      } catch (e) { if (tries >= 15) clearInterval(cdpPollTimer); }
    }, 2000);
  } catch (e) { hint.textContent = '启动出错：' + e.message; }
};
async function saveGuardInterval(field) {
  const el = field === 'minIntervalMinutes' ? $('guard-interval') : $('guard-draft-interval');
  const v = Number(el.value);
  try {
    const r = await fetch('/api/publish-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: v })
    });
    const d = await r.json();
    if (d.ok) {
      showInfo('已保存', '发布间隔 ' + d.minIntervalMinutes + ' 分钟 / 存草稿间隔 ' + d.minDraftIntervalMinutes + ' 分钟');
      loadPublishEnv();
    } else showInfo('保存失败', d.error || '');
  } catch (e) {}
}
$('btn-guard-save').onclick = () => saveGuardInterval('minIntervalMinutes');
$('btn-guard-draft-save').onclick = () => saveGuardInterval('minDraftIntervalMinutes');

/* ============ Toast ============ */
let toastCb = null;
function showToast(msg, cb) {
  const t = $('toast');
  // 仅写入文字到子 span，避免把关闭 × 也一并清掉
  const msgEl = $('toast-msg');
  if (msgEl) msgEl.textContent = msg;
  t.classList.add('show');
  toastCb = cb || null;
  clearTimeout(window.__toastTimer);
  // 双保险：既用 visibility/opacity 兜底，又保留 4s 自动关闭
  window.__toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
}
function onToastClick(e) {
  // 点击 × 关闭时不执行回调（避免误触发跳转等副作用）；点击其它区域时执行回调
  const t = $('toast');
  t.classList.remove('show');
  if (e && e.target && e.target.classList && e.target.classList.contains('toast-x')) return;
  if (toastCb) toastCb();
}

/* ============ 工具 ============ */
function esc(s) { return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

/* ============ 物料生成 ============ */
window.__materialMd = '';
function mdToHtml(md) {
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const lines = String(md).split('\n');
  let html = '', inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw.replace(/\r/g, '');
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (h) { closeList(); const lvl = h[1].length; html += `<h${lvl}>${esc(h[2])}</h${lvl}>`; }
    else if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${esc(li[1])}</li>`; }
    else if (line.trim() === '') { closeList(); }
    else { closeList(); html += `<p>${esc(line)}</p>`; }
  }
  closeList();
  return html;
}
/* ============ 知识库（内置轻量，替代 Obsidian/白皮书上传）============ */
function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
// ---------------- 知识库（合集 + 文件）----------------
window.__kbCol = 'all';   // 'all' | 'uncat' | colId
let __kbAllItems = [];
let __kbCols = [];

async function loadKnowledge() {
  try {
    const r = await fetch('/api/knowledge/list');
    const d = await r.json();
    __kbCols = d.collections || [];
    __kbAllItems = d.items || [];
    renderKBCollections();
    renderKnowledgeList(kbFiltered());
  } catch (e) { /* 忽略 */ }
}
function kbFiltered() {
  if (window.__kbCol === 'uncat') return __kbAllItems.filter(i => !i.collectionId);
  if (window.__kbCol === 'all') return __kbAllItems;
  return __kbAllItems.filter(i => i.collectionId === window.__kbCol);
}
function renderKBCollections() {
  const box = $('kb-cols');
  if (!box) return;
  const chips = [];
  const mk = (id, label, active, icon) =>
    `<span class="kb-col ${active ? 'active' : ''}" data-col="${id}" onclick="selectKBCol('${id}')">${icon || ''}${esc(label)}</span>`;
  chips.push(mk('all', '全部', window.__kbCol === 'all', '<svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-folder"/></svg> '));
  chips.push(mk('uncat', '未分类', window.__kbCol === 'uncat', '<svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-folder"/></svg> '));
  for (const c of __kbCols) {
    const cnt = __kbAllItems.filter(i => i.collectionId === c.id).length;
    chips.push(
      `<span class="kb-col ${window.__kbCol === c.id ? 'active' : ''}" data-col="${c.id}" onclick="selectKBCol('${c.id}')">${esc(c.name)} <span class="kb-col-n">${cnt}</span></span>` +
      `<span class="kb-col-x" title="删除合集（文件移至未分类）" onclick="delKBCol('${c.id}')">×</span>`
    );
  }
  box.innerHTML = chips.join('');
}
window.selectKBCol = (id) => { window.__kbCol = id; renderKBCollections(); renderKnowledgeList(kbFiltered()); };
window.delKBCol = async (id) => {
  const col = __kbCols.find(c => c.id === id);
  if (!confirm('删除合集「' + (col ? col.name : '') + '」？其中的文件会移到「未分类」，不会删除。')) return;
  try {
    const r = await fetch('/api/knowledge/collections/' + encodeURIComponent(id), { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) showToast('已删除合集');
    else alert('删除失败：' + d.error);
  } catch (e) { alert('异常：' + e.message); }
  if (window.__kbCol === id) window.__kbCol = 'all';
  loadKnowledge();
};
$('btn-new-col').onclick = async () => {
  const name = prompt('合集名称（如：政策资讯 / 学科运营）：');
  if (!name) return;
  try {
    const r = await fetch('/api/knowledge/collections', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() })
    });
    const d = await r.json();
    if (d.ok) { showToast('已新建合集：' + d.collection.name); window.__kbCol = d.collection.id; }
    else alert('新建失败：' + d.error);
  } catch (e) { alert('异常：' + e.message); }
  loadKnowledge();
};
function renderKnowledgeList(items) {
  const ul = $('kb-list');
  const empty = $('kb-empty');
  if (!ul) return;
  if (!items.length) { ul.innerHTML = ''; if (empty) empty.style.display = 'block'; const bar = $('kb-batch-bar'); if (bar) bar.style.display = 'none'; return; }
  if (empty) empty.style.display = 'none';
  ul.innerHTML = items.map(it => {
    const st = it.status === 'ready' ? '<span class="kb-st ready"><svg class="ico ok ico-sm" style="vertical-align:-0.1em"><use href="#i-check"/></svg> 已解析</span>'
      : it.status === 'parsing' ? '<span class="kb-st parsing"><svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-history"/></svg> 解析中…</span>'
      : '<span class="kb-st err" title="' + esc(it.error || '') + '"><svg class="ico err ico-sm" style="vertical-align:-0.1em"><use href="#i-close"/></svg> 失败</span>';
    const len = it.textLen ? (' · ' + it.textLen + ' 字') : '';
    const retry = it.status === 'error' ? `<button class="ghost" onclick="reparseKB('${it.id}')" style="font-size:12px;padding:2px 8px">重试</button>` : '';
    const col = (it.collectionId && __kbCols.find(c => c.id === it.collectionId)) ? __kbCols.find(c => c.id === it.collectionId) : null;
    const colTag = (window.__kbCol === 'all' && col) ? `<span class="kb-st" style="background:#E7F3EE;color:#0F5A3F">${esc(col.name)}</span>` : '';
    const nameFull = it.originalName || it.savedName || '文档';
    const nameShow = nameFull.length > 36 ? nameFull.slice(0, 36) + '…' : nameFull;
    return `<li class="kb-item">
      <input type="checkbox" class="kb-cb" data-id="${it.id}" onchange="onKBCheck()">
      <span class="mat-name" title="${esc(nameFull)}"><svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-doc"/></svg> ${esc(nameShow)}</span>
      <span class="muted">${fmtSize(it.size)}${len}</span>
      ${st}
      ${colTag}
      ${retry}
      <button class="ghost" onclick="delKB('${it.id}')" style="font-size:12px;padding:2px 8px">删除</button>
    </li>`;
  }).join('');
  const bar = $('kb-batch-bar');
  if (bar) { bar.style.display = 'none'; updateKBBatchBar(); }
  const ready = items.filter(i => i.status === 'ready').length;
  const chars = items.reduce((s, i) => s + (i.textLen || 0), 0);
  const stats = $('kb-stats');
  if (stats) stats.textContent = `共 ${items.length} 篇 · 已解析 ${ready} 篇 · 总 ${chars} 字`;
}
// 批量选中状态
function onKBCheck() { updateKBBatchBar(); }
function updateKBBatchBar() {
  const cbs = document.querySelectorAll('.kb-cb:checked');
  const bar = $('kb-batch-bar');
  if (!bar) return;
  if (cbs.length > 0) { bar.style.display = 'flex'; bar.querySelector('span').textContent = '已选 ' + cbs.length + ' 项'; }
  else { bar.style.display = 'none'; }
}
// 批量删除
window.batchDelKB = async () => {
  const cbs = document.querySelectorAll('.kb-cb:checked');
  if (!cbs.length) return;
  const ids = Array.from(cbs).map(cb => cb.dataset.id);
  if (!confirm('确定删除所选的 ' + ids.length + ' 个文件？')) return;
  let ok = 0;
  for (const id of ids) {
    try { await fetch('/api/knowledge/' + encodeURIComponent(id), { method: 'DELETE' }); ok++; } catch (e) {}
  }
  showToast('已删除 ' + ok + ' 个文件');
  loadKnowledge();
};
// 重试所有解析失败的文件
window.reparseAllFailed = async () => {
  try {
    const r = await fetch('/api/knowledge/reparse-failed', { method: 'POST' });
    const d = await r.json();
    if (d.ok) showToast('已提交 ' + d.count + ' 个文件重新解析');
    else alert('重试失败：' + d.error);
    pollKBStatus();
  } catch (e) { alert('异常：' + e.message); }
};
$('btn-kb-upload').onclick = async () => {
  const input = $('kb-upload');
  if (!input.files.length) { alert('请先选择文件'); return; }
  const collectionId = (window.__kbCol && window.__kbCol !== 'all' && window.__kbCol !== 'uncat') ? window.__kbCol : null;
  let done = 0, fail = 0;
  for (const file of input.files) {
    const fd = new FormData();
    fd.append('file', file);
    if (collectionId) fd.append('collectionId', collectionId);
    try {
      const r = await fetch('/api/knowledge/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (d.ok) { showToast('已上传：' + d.record.originalName); done++; }
      else { alert('上传失败：' + (d.error || '')); fail++; }
    } catch (e) { alert('上传异常：' + e.message); fail++; }
  }
  input.value = '';
  loadKnowledge();
  if (done) pollKBStatus();
};
window.delKB = async (id) => {
  if (!confirm('确定删除该知识库文件？')) return;
  try { await fetch('/api/knowledge/' + encodeURIComponent(id), { method: 'DELETE' }); } catch (e) {}
  loadKnowledge();
};
window.reparseKB = async (id) => {
  try { await fetch('/api/knowledge/reparse/' + encodeURIComponent(id), { method: 'POST' }); showToast('已重新解析'); } catch (e) {}
  pollKBStatus();
};
async function pollKBStatus() {
  try {
    const r = await fetch('/api/knowledge/list');
    const d = await r.json();
    __kbCols = d.collections || [];
    __kbAllItems = d.items || [];
    renderKBCollections();
    renderKnowledgeList(kbFiltered());
    if ((d.items || []).some(i => i.status === 'parsing')) setTimeout(pollKBStatus, 2500);
  } catch (e) {}
}

$('btn-material').onclick = async () => {
  const theme = $('m-theme').value.trim();
  if (!theme) { $('material-result').innerHTML = '<span class="err-text"><svg class="ico err" style="vertical-align:-0.15em"><use href="#i-close"/></svg> 请先填写主题</span>'; return; }
  const box = $('material-result'); box.innerHTML = '生成中…（综合信息聚合平台 + 知识库 + 大模型）';
  $('material-actions').style.display = 'none';
  try {
    const r = await fetch('/api/generate/material', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme, type: $('m-type').value, business: $('m-business').value })
    });
    const d = await r.json();
    if (d.result) {
      box.innerHTML = mdToHtml(d.result);
      $('material-actions').style.display = 'flex';
      window.__materialMd = d.result;
    } else {
      box.textContent = '错误：' + (d.error || '未知');
    }
  } catch (e) {
    box.textContent = '请求失败：' + e.message;
  }
};
$('btn-copy-material').onclick = () => {
  if (window.__materialMd) navigator.clipboard.writeText(window.__materialMd).then(() => alert('已复制物料文档'));
};
$('btn-dl-material').onclick = () => {
  if (!window.__materialMd) return;
  const blob = new Blob([window.__materialMd], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ($('m-theme').value.trim() || '物料') + '.md';
  a.click();
};
$('btn-dl-docx').onclick = () => exportMaterial('docx');
$('btn-dl-pdf').onclick = () => exportMaterial('pdf');
async function exportMaterial(format) {
  if (!window.__materialMd) { alert('请先生成物料文档'); return; }
  const btn = format === 'docx' ? $('btn-dl-docx') : $('btn-dl-pdf');
  const oldHtml = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '生成中…';
  try {
    const r = await fetch('/api/whitepaper/export?format=' + format, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: window.__materialMd, title: $('m-theme').value.trim() || '物料', format })
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert('导出失败：' + (e.error || r.status)); return; }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ($('m-theme').value.trim() || '物料') + '.' + format;
    a.click();
  } catch (e) { alert('导出失败：' + e.message); }
  finally { btn.disabled = false; btn.innerHTML = oldHtml; }
}
$('btn-edit-material').onclick = async () => {
  const ta = $('material-prompt');
  if (ta.style.display === 'none') {
    const d = await (await fetch('/api/prompts/material')).json();
    ta.value = '【system】\n' + d.system + '\n\n【user 模板】\n' + d.userTemplate;
    ta.style.display = 'block';
  } else {
    const v = ta.value.split('\n\n【user 模板】\n');
    const sys = v[0].replace('【system】\n', '');
    const ut = v[1] || '';
    await fetch('/api/prompts/material', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: sys, userTemplate: ut })
    });
    ta.style.display = 'none';
    alert('物料提示词已保存');
  }
};

/* ============ 发布历史 ============ */
async function loadPublishHistory() {
  const box = $('history-result');
  if (box) box.innerHTML = '<span class="muted">加载中…</span>';
  try {
    const r = await fetch('/api/publish-history');
    const d = await r.json();
    window.__publishHistory = d.list || [];
    renderPublishHistory();
    renderCalendar(); // 刷新日历 hover 浮窗里的发布状态
  } catch (e) {
    if (box) box.innerHTML = '<span class="err-text">加载失败：' + esc(e.message) + '</span>';
  }
}
const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
// 把 createdAt 归一成 YYYY-MM-DD（本地时间）
function histDayKey(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 10);
  return dateKey(d);
}
function histDayLabel(key) {
  const today = dateKey(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterday = dateKey(y);
  const [Y, M, D] = key.split('-');
  const d = new Date(Number(Y), Number(M) - 1, Number(D));
  return {
    text: `${Number(M)}月${Number(D)}日`,
    week: isNaN(d) ? '' : WEEK_CN[d.getDay()],
    isToday: key === today,
    isYesterday: key === yesterday
  };
}
function renderPublishHistory() {
  const box = $('history-result');
  if (!box) return;
  const list = window.__publishHistory || [];
  if (!list.length) { box.innerHTML = '<span class="muted">暂无发布记录</span>'; return; }

  // 按日期分组（新日期在前，同日内新记录在前）
  const groups = {};
  list.forEach(h => {
    const k = histDayKey(h.createdAt);
    (groups[k] = groups[k] || []).push(h);
  });
  const keys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  const html = keys.map(k => {
    const lb = histDayLabel(k);
    const items = groups[k].slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const okCnt = items.filter(h => h.success === true).length;
    const failCnt = items.filter(h => h.success === false).length;
    const badge = lb.isToday ? '<span class="hg-today">今天</span>'
      : lb.isYesterday ? '<span class="hg-week">昨天</span>' : '';
    const summary = `${items.length} 条` + (failCnt ? ` · <svg class="ico ok ico-sm" style="vertical-align:-0.1em"><use href="#i-check"/></svg>${okCnt} <svg class="ico err ico-sm" style="vertical-align:-0.1em"><use href="#i-close"/></svg>${failCnt}` : '');
    const rows = items.map(h => {
      const cat = catOf(h.category);
      const modeText = h.mode === 'publish' ? '<svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-send"/></svg> 直接发布' : '<svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-clipboard"/></svg> 存草稿';
      let statusText = '<svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-history"/></svg> 执行中';
      if (h.success === true) {
        statusText = h.realResult === 'published' ? '<svg class="ico ok ico-sm" style="vertical-align:-0.1em"><use href="#i-check"/></svg> 已发布'
          : h.realResult === 'draft-saved' ? '<svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-clipboard"/></svg> 草稿已保存'
          : '<svg class="ico ok ico-sm" style="vertical-align:-0.1em"><use href="#i-check"/></svg> 脚本完成（状态未知）';
      } else if (h.success === false) {
        statusText = '<svg class="ico err ico-sm" style="vertical-align:-0.1em"><use href="#i-close"/></svg> 失败' + (h.error ? '：' + esc(String(h.error).slice(0, 100)) : '');
      }
      const hm = String(h.createdAt).slice(11, 16); // 只显示时分，日期已在分组头
      return '<div class="history-item">'
        + '<div class="hi-title">' + esc(h.title) + '</div>'
        + '<div class="hi-meta">'
        + '<span class="hi-cat" style="background:' + cat.color + '1a;color:' + cat.color + '">' + cat.label + '</span>'
        + '<span class="hi-mode">' + modeText + '</span>'
        + '<span class="hi-time"><svg class="ico ico-sm" style="vertical-align:-0.1em"><use href="#i-history"/></svg> ' + hm + '</span>'
        + '</div>'
        + '<div class="hi-status">' + statusText + '</div>'
        + '</div>';
    }).join('');
    return '<div class="history-group">'
      + '<div class="hg-head">'
      + '<span class="hg-date">' + lb.text + '</span>'
      + '<span class="hg-week">' + lb.week + '</span>'
      + badge
      + '<span class="hg-count">' + summary + '</span>'
      + '</div>' + rows + '</div>';
  }).join('');

  box.innerHTML = '<div class="history-list">' + html + '</div>';
}


/* ============ 启动 ============ */
loadStatus();
setInterval(loadStatus, 30000);
loadBannedWords(); // 启动即拉取最新违禁词，供合规检查使用
loadCampuses(); // 加载校区下拉（内置+自定义），并恢复上次记忆的选择
renderCalendar();
promptRestoreAutosave(); // 上次没保存的编辑内容：先问你「保留」还是「丢弃并清空」
bindConfigButtons();
showView('calendar');
$('btn-refresh-history').onclick = loadPublishHistory;

/* ============ 固定头部：动态测量头部高度，写入 --header-h 供侧栏 sticky 偏移使用 ============ */
function syncHeaderHeight() {
  const h = document.querySelector('header');
  if (h) document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
}
syncHeaderHeight();
window.addEventListener('resize', syncHeaderHeight);
// 字体/图标加载完成后高度可能变化，再校准一次
window.addEventListener('load', syncHeaderHeight);
