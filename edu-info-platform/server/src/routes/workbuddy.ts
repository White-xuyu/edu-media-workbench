import { Router } from 'express'
import { readData } from '../utils/storage.js'

const router = Router()

interface Article {
  id: string
  title: string
  url: string
  summary: string
  sourceId: string
  sourceName: string
  sourceType: 'website' | 'wechat'
  categoryId: string
  tags: string[]
  publishDate?: string | null
  crawledAt: string
  createdAt: string
}

// GET /api/workbuddy/search?q=关键词&limit=10
// 供 WorkBuddy Agent 调用，检索平台爬取的政策资讯
router.get('/search', (req, res) => {
  try {
    const { q, limit = '10' } = req.query as { q?: string; limit?: string }

    const keyword = (q || '').trim().toLowerCase()
    const limitNum = Math.min(50, Math.max(1, parseInt(limit || '10')))

    const articles = readData('articles.json') as Article[]

    // 在标题、摘要、标签中搜索；无关键词时返回全部
    const matched = keyword
      ? articles.filter((a) => {
          const inTitle = a.title && a.title.toLowerCase().includes(keyword)
          const inSummary = a.summary && a.summary.toLowerCase().includes(keyword)
          const inTags = a.tags?.some((t) => t.toLowerCase().includes(keyword))
          return inTitle || inSummary || inTags
        })
      : [...articles]

    // 按 publishDate 降序排序
    matched.sort((a, b) => {
      if (a.publishDate && b.publishDate) {
        return new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
      }
      if (a.publishDate) return -1
      if (b.publishDate) return 1
      return 0
    })

    // 精简返回字段，只保留 WorkBuddy 需要的
    const results = matched.slice(0, limitNum).map((a) => ({
      title: a.title,
      url: a.url,
      summary: a.summary,
      sourceName: a.sourceName,
      publishDate: a.publishDate,
    }))

    res.json({
      articles: results,
      total: matched.length,
      keyword: q?.trim() || '',
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message || '搜索失败' })
  }
})

export default router
