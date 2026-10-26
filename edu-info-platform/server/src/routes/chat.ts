import { Router, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { readData, writeData } from '../utils/storage.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

const router = Router()

// GET /api/chat/settings - get current user's AI config
router.get('/settings', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const settings = readData('settings.json')
    const userSettings = settings.find((s: any) => s.userId === req.userId)

    if (!userSettings || !userSettings.apiKey) {
      return res.json({ apiKey: '', baseUrl: '', model: '' })
    }

    // Mask API key: show first 4 + last 4 chars
    const key = userSettings.apiKey
    const maskedKey = key.length > 8
      ? key.slice(0, 4) + '****' + key.slice(-4)
      : '****'

    res.json({
      apiKey: maskedKey,
      baseUrl: userSettings.baseUrl || '',
      model: userSettings.model || '',
    })
  } catch (error) {
    res.status(500).json({ error: '获取AI配置失败' })
  }
})

// PUT /api/chat/settings - save current user's AI config
router.put('/settings', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { apiKey, baseUrl, model } = req.body

    const settings = readData('settings.json')
    const index = settings.findIndex((s: any) => s.userId === req.userId)

    if (index === -1) {
      settings.push({
        userId: req.userId!,
        apiKey: apiKey || '',
        baseUrl: baseUrl || '',
        model: model || '',
      })
    } else {
      if (apiKey !== undefined) settings[index].apiKey = apiKey
      if (baseUrl !== undefined) settings[index].baseUrl = baseUrl
      if (model !== undefined) settings[index].model = model
    }

    writeData('settings.json', settings)
    res.json({ message: 'AI配置已保存' })
  } catch (error) {
    res.status(500).json({ error: '保存AI配置失败' })
  }
})

// POST /api/chat - AI chat with education context
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { message, history = [] } = req.body

    if (!message) {
      return res.status(400).json({ error: '请输入问题' })
    }

    // Build context from websites
    const websites = readData('websites.json')
    const categories = readData('categories.json')

    // Create a context summary of available resources
    const categoryMap = categories.reduce((map: any, c: any) => {
      map[c.id] = c.name
      return map
    }, {})

    const websiteContext = websites
      .filter((w: any) => w.userId === 'system' || w.isPublic)
      .map((w: any) => `- ${w.name} (${w.url}) - ${w.description} [分类: ${categoryMap[w.categoryId] || '未分类'}]`)
      .join('\n')

    const systemPrompt = `你是一个教育资讯助手，专门帮助用户查找教育相关政策、考试、招生等资讯。

${getHotTopicsSystemPrompt()}

你可以参考以下网站资源库：

${websiteContext}

当用户询问问题时，请：
1. 推荐相关的官方网站（从上述资源库中选择最匹配的）
2. 提供操作流程和步骤
3. 推荐检索关键词
4. 如果资源库中没有完全匹配的，也可以推荐其他权威网站

请以结构化的方式回复，包含以下部分（用Markdown格式）：
### 📌 推荐网站
### 📋 操作流程
### 🔍 检索关键词
### 💡 补充建议

请用中文回复。`

    // Prepare messages for AI API
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10).map((h: any) => ({
        role: h.role,
        content: h.content,
      })),
      { role: 'user', content: message },
    ]

    // Read user's AI settings from settings.json
    const settings = readData('settings.json')
    const userSettings = settings.find((s: any) => s.userId === req.userId)

    // Use user's own API config if available, otherwise fall back to server env vars
    let apiKey: string
    let baseUrl: string
    let model: string

    if (userSettings && userSettings.apiKey && userSettings.apiKey !== '') {
      apiKey = userSettings.apiKey
      baseUrl = userSettings.baseUrl || 'https://api.openai.com/v1'
      model = userSettings.model || 'gpt-4o-mini'
    } else {
      apiKey = process.env.OPENAI_API_KEY || ''
      baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
      model = process.env.AI_MODEL || 'gpt-4o-mini'
    }

    let aiResponse = ''
    let usedFallback = false

    if (apiKey && apiKey !== 'sk-your-api-key-here') {
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
            max_tokens: 2000,
          }),
        })

        if (response.ok) {
          const data = await response.json() as any
          aiResponse = data.choices?.[0]?.message?.content || ''
        } else {
          usedFallback = true
        }
      } catch {
        usedFallback = true
      }
    } else {
      usedFallback = true
    }

    // Fallback response when AI API is not available
    if (usedFallback || !aiResponse) {
      aiResponse = generateFallbackResponse(message, websites, categoryMap)
    }

    // Save chat history
    const chats = readData('chats.json')
    const chatRecord = {
      id: uuidv4(),
      userId: req.userId!,
      question: message,
      answer: aiResponse,
      createdAt: new Date().toISOString(),
    }
    chats.push(chatRecord)
    writeData('chats.json', chats)

    res.json({
      id: chatRecord.id,
      message: aiResponse,
      usedFallback: usedFallback && !aiResponse,
    })
  } catch (error) {
    console.error('Chat error:', error)
    res.status(500).json({ error: 'AI回复失败，请稍后重试' })
  }
})

// GET /api/chat/history - get user's chat history
router.get('/history', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const chats = readData('chats.json')
    const myChats = chats
      .filter((c: any) => c.userId === req.userId)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50)
    res.json(myChats)
  } catch (error) {
    res.status(500).json({ error: '获取聊天记录失败' })
  }
})

function generateFallbackResponse(
  message: string,
  websites: any[],
  categoryMap: Record<string, string>
): string {
  const query = message.toLowerCase()
  const keywords = extractKeywords(query)

  // Find matching websites
  const scoredWebsites = websites
    .filter((w: any) => w.userId === 'system' || w.isPublic)
    .map((w: any) => {
      let score = 0
      const searchText = `${w.name} ${w.description} ${(w.tags || []).join(' ')} ${categoryMap[w.categoryId] || ''}`.toLowerCase()
      for (const kw of keywords) {
        if (searchText.includes(kw)) score += 1
      }
      return { ...w, score, categoryName: categoryMap[w.categoryId] || '未分类' }
    })
    .filter((w: any) => w.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5)

  // Generate search keywords
  const searchKeywords = generateSearchKeywords(message)

  // Generate procedure based on topic
  const procedure = generateProcedure(message)

  const websiteList = scoredWebsites.length > 0
    ? scoredWebsites.map((w: any) => `- **[${w.name}](${w.url})** — ${w.description} *(分类: ${w.categoryName})*`).join('\n')
    : '- 未找到完全匹配的网站，建议使用下方检索关键词自行搜索'

  return `### 📌 推荐网站

${websiteList}

### 📋 操作流程

${procedure}

### 🔍 检索关键词

${searchKeywords.map(k => `\`${k}\``).join('  ')}

### 💡 补充建议

- 建议关注教育部及各省教育厅官方网站获取最新政策
- 关键时间节点（报名、考试、查分）请以官方公告为准
- 可以收藏本平台的相关网站，方便随时查阅
- 如有具体地区要求，请补充说明所在省市，可获取更精准的信息

> 💬 此回复由本地智能匹配生成。配置OpenAI API后可获得更精准的AI推荐。`
}

function extractKeywords(query: string): string[] {
  const keywordMap: Record<string, string[]> = {
    '高考': ['高考', '招生', '考试', '志愿', '录取'],
    '中考': ['中考', '初中', '招生', '志愿', '录取'],
    '教师资格': ['教师', '资格', '认定', '考试'],
    '考研': ['研究生', '考试', '招生', '硕士'],
    '留学': ['留学', '出国', '国际', '海外'],
    '政策': ['政策', '法规', '教育部', '通知'],
    '职业教育': ['职业', '技能', '培训', '就业'],
    '学前教育': ['幼儿', '学前', '早教', '入园'],
    '义务教育': ['小学', '初中', '义务教育', '入学'],
    '在线教育': ['在线', '网络', '远程', '慕课', 'MOOC'],
  }

  const found: string[] = []
  for (const [category, kws] of Object.entries(keywordMap)) {
    if (kws.some(kw => query.includes(kw))) {
      found.push(...kws)
    }
  }
  return found.length > 0 ? found : ['教育', '政策', '官网']
}

function generateSearchKeywords(message: string): string[] {
  const baseKeywords = ['官方网站', '最新政策', '报名入口']
  const query = message.toLowerCase()

  if (query.includes('高考') || query.includes('志愿')) {
    return ['高考志愿填报', '阳光高考网', '省教育考试院', '高校招生章程', '录取分数线']
  }
  if (query.includes('中考') || query.includes('初三')) {
    return ['中考志愿填报', '中考招生政策', 'XX省教育厅', '中招考试', '普通高中招生']
  }
  if (query.includes('教师')) {
    return ['教师资格证', '教师招聘', '教师资格认定', '中小学教师资格考试']
  }
  if (query.includes('考研')) {
    return ['研究生招生', '研招网', '考研报名', '国家线', '院校招生简章']
  }
  if (query.includes('留学')) {
    return ['留学申请', '教育部留学服务中心', '海外院校认证', '留学签证政策']
  }

  return baseKeywords
}

function generateProcedure(message: string): string {
  const query = message.toLowerCase()

  if (query.includes('高考') || query.includes('志愿')) {
    return `1. **了解政策** — 访问省教育考试院官网查看最新高考政策
2. **查询分数线** — 在阳光高考网查询历年录取分数线
3. **选择院校专业** — 结合成绩和兴趣选择目标院校和专业
4. **填报志愿** — 在规定时间内登录省教育考试院志愿填报系统
5. **确认提交** — 核对无误后提交并打印确认表`
  }

  if (query.includes('中考') || query.includes('初三')) {
    return `1. **了解当地政策** — 访问所在省/市教育厅（局）官网查看中考政策
2. **关注报名时间** — 注意中考报名、体育考试、志愿填报等关键时间节点
3. **了解招生计划** — 查看各普通高中的招生计划和招生范围
4. **填报志愿** — 按规定时间和方式填报志愿
5. **关注录取结果** — 及时查询录取结果并按要求报到`
  }

  if (query.includes('教师')) {
    return `1. **确定目标** — 明确要考取的教师资格类别（幼儿园/小学/中学等）
2. **查看报考条件** — 在中国教师资格网查看学历、专业等要求
3. **准备笔试** — 了解考试科目，购买教材备考
4. **报名考试** — 在NTCE官网报名，按时参加笔试和面试
5. **申请认定** — 通过考试后在中国教师资格网申请资格认定`
  }

  return `1. **明确需求** — 确定您要查询的具体教育问题
2. **访问权威网站** — 优先选择教育部及省市教育厅官方网站
3. **使用关键词检索** — 利用上述推荐关键词在搜索引擎中查找
4. **核实信息** — 多方比对，以官方发布的信息为准
5. **收藏有用网站** — 将常用网站添加到本平台方便后续查阅`
}

// GET /api/chat/hotspots - get current hot topics based on date
router.get('/hotspots', (_req: AuthRequest, res: Response) => {
  try {
    const hotspots = getHotTopics()
    res.json(hotspots)
  } catch (error) {
    res.status(500).json({ error: '获取热点话题失败' })
  }
})

// ─── Hot Topics Engine ───

interface HotTopic {
  id: string
  label: string
  question: string
  emoji: string
}

function getHotTopics(): HotTopic[] {
  const now = new Date()
  const month = now.getMonth() + 1 // 1-12
  const year = now.getFullYear()

  // Year-round topics
  const yearRound: HotTopic[] = [
    { id: 'ht-double-reduce', label: '双减政策', question: '最新的双减政策有哪些变化？对中小学有什么影响？', emoji: '📚' },
    { id: 'ht-new-standard', label: '新课标解读', question: '2022版义务教育新课标的核心要点和实施进展如何？', emoji: '📖' },
    { id: 'ht-ai-edu', label: 'AI+教育', question: '人工智能在教育领域的应用有哪些最新政策和技术趋势？', emoji: '🤖' },
  ]

  // Monthly topics
  const monthlyMap: Record<number, HotTopic[]> = {
    1: [
      { id: 'ht-postgrad-winter', label: '考研初试', question: '今年考研初试成绩什么时候公布？复试如何准备？', emoji: '🎓' },
      { id: 'ht-art-exam', label: '艺考校考', question: '今年艺术类校考时间和政策有什么变化？', emoji: '🎨' },
      { id: 'ht-winter-vacation', label: '寒假安排', question: '各地中小学寒假时间安排和假期托管政策', emoji: '⛄' },
    ],
    2: [
      { id: 'ht-new-semester', label: '春季开学', question: '春季开学有哪些新政策和要求？课后服务如何安排？', emoji: '🏫' },
      { id: 'ht-postgrad-score', label: '考研查分', question: '考研初试成绩查询时间和调剂流程', emoji: '📊' },
      { id: 'ht-teacher-recruit', label: '教师招聘', question: '春季教师招聘有哪些重要公告？考试时间如何安排？', emoji: '💼' },
    ],
    3: [
      { id: 'ht-gaokao-policy', label: '高考政策', question: `${year}年高考最新政策有哪些？强基计划和综合评价如何报名？`, emoji: '🔥' },
      { id: 'ht-strong-basic', label: '强基计划', question: `${year}年强基计划招生简章发布了吗？如何报考？`, emoji: '🌟' },
      { id: 'ht-teacher-qualify', label: '教资考试', question: '教师资格证春季考试报名时间和备考指南', emoji: '📝' },
    ],
    4: [
      { id: 'ht-gaokao-physical', label: '高考体检', question: '高考体检标准和注意事项，对志愿填报有什么影响？', emoji: '🏥' },
      { id: 'ht-zhongkao-prep', label: '中考冲刺', question: '中考最后冲刺阶段如何高效备考？各地中考时间安排', emoji: '💪' },
      { id: 'ht-study-abroad', label: '留学申请', question: '秋季留学申请时间规划和各国签证政策', emoji: '✈️' },
    ],
    5: [
      { id: 'ht-gaokao-countdown', label: '高考倒计时', question: '高考最后一个月如何冲刺？考前心理调适和准备事项', emoji: '⏰' },
      { id: 'ht-zhongkao-time', label: '中考时间', question: '各地中考时间和招生政策汇总', emoji: '📅' },
      { id: 'ht-children-day', label: '学前教育入学', question: '幼儿园和小学秋季入学报名时间和政策', emoji: '🎈' },
    ],
    6: [
      { id: 'ht-gaokao', label: '高考进行时', question: `${year}年高考真题、分数线和志愿填报指南`, emoji: '🔥' },
      { id: 'ht-zhongkao', label: '中考政策', question: '今年中考招生政策和志愿填报规则有哪些变化？', emoji: '📋' },
      { id: 'ht-summer-plan', label: '暑期规划', question: '暑假如何合理安排学习和活动？暑期托管服务政策', emoji: '☀️' },
    ],
    7: [
      { id: 'ht-gaokao-volunteer', label: '高考志愿填报', question: `${year}年高考志愿填报技巧、批次设置和注意事项`, emoji: '🔥' },
      { id: 'ht-college-admission', label: '录取分数线', question: '今年各省高考录取分数线预测和历年对比', emoji: '📈' },
      { id: 'ht-zhongkao-result', label: '中考查分', question: '各地中考查分时间和高中录取流程', emoji: '🔍' },
    ],
    8: [
      { id: 'ht-gaokao-admission', label: '高考录取', question: '高考录取通知书什么时候发放？录取结果如何查询？', emoji: '📬' },
      { id: 'ht-postgrad-prep', label: '考研备考', question: '考研备考攻略：如何制定复习计划和选择院校', emoji: '📚' },
      { id: 'ht-fall-semester', label: '秋季开学', question: '秋季开学时间和新学期教育政策变化', emoji: '🍂' },
    ],
    9: [
      { id: 'ht-teacher-autumn', label: '秋季教资', question: '教师资格证秋季考试报名和备考指南', emoji: '📝' },
      { id: 'ht-postgrad-reg', label: '考研报名', question: `${year}年研究生考试报名时间、流程和注意事项`, emoji: '🎯' },
      { id: 'ht-new-student', label: '新生入学', question: '新生入学政策和学籍管理规定', emoji: '🏫' },
    ],
    10: [
      { id: 'ht-college-entrance', label: '高考报名', question: `${year + 1}年高考报名时间和政策有何变化？`, emoji: '✏️' },
      { id: 'ht-postgrad-exam', label: '考研冲刺', question: '考研最后两个月如何高效冲刺复习？', emoji: '💪' },
      { id: 'ht-national-holiday', label: '教育政策回顾', question: '今年教育领域有哪些重要政策发布和改革措施？', emoji: '📊' },
    ],
    11: [
      { id: 'ht-college-art', label: '艺考统考', question: `${year + 1}年艺术类统考时间和政策变化`, emoji: '🎨' },
      { id: 'ht-postgrad-confirm', label: '考研确认', question: '考研网上确认时间和现场确认注意事项', emoji: '✅' },
      { id: 'ht-winter-flu', label: '校园疫情防控', question: '冬季学校传染病防控政策和措施', emoji: '🏥' },
    ],
    12: [
      { id: 'ht-postgrad-final', label: '考研初试', question: `${year + 1}年考研初试最后冲刺和考场注意事项`, emoji: '🎓' },
      { id: 'ht-year-review', label: '年度教育盘点', question: `${year}年教育领域十大热点事件和政策回顾`, emoji: '🔙' },
      { id: 'ht-winter-vacation-plan', label: '寒假规划', question: '各地中小学寒假时间安排和学生寒假学习建议', emoji: '⛄' },
    ],
  }

  const monthly = monthlyMap[month] || []

  // Pick 3 year-round + 3 monthly, deduplicate
  const shuffled = [...yearRound].sort(() => Math.random() - 0.5).slice(0, 3)
  const combined = [...shuffled, ...monthly.slice(0, 3)]

  // If less than 5, pad with year-round
  while (combined.length < 5) {
    const extra = yearRound[combined.length % yearRound.length]
    if (!combined.find(t => t.id === extra.id)) {
      combined.push(extra)
    } else {
      break
    }
  }

  return combined.slice(0, 6)
}

function getHotTopicsSystemPrompt(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const hotspots = getHotTopics()

  const monthNames = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

  return `【当前时间】${monthNames[month]}
【教育热点话题】
${hotspots.map(h => `- ${h.emoji} ${h.label}：${h.question}`).join('\n')}

请根据当前月份的教育热点，在回答中优先推荐与热门话题相关的网站和资讯。如果用户问的问题与当前热点话题相关，要主动告知当前最新的政策动态和关键时间节点。`
}

export default router
