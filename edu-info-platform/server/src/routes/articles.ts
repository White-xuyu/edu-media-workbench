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

// GET /api/articles - List articles with pagination and filtering
router.get('/', (req, res) => {
  try {
    const {
      page = '1',
      limit = '20',
      categoryId,
      sourceId,
      search,
      sourceType,
    } = req.query as Record<string, string | undefined>

    let articles = readData('articles.json') as Article[]

    // Filters
    if (categoryId) {
      articles = articles.filter((a) => a.categoryId === categoryId)
    }
    if (sourceId) {
      articles = articles.filter((a) => a.sourceId === sourceId)
    }
    if (sourceType && (sourceType === 'website' || sourceType === 'wechat')) {
      articles = articles.filter((a) => a.sourceType === sourceType)
    }
    if (search) {
      const q = search.toLowerCase()
      articles = articles.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.sourceName.toLowerCase().includes(q)
      )
    }

    // Sort: publishDate desc (nulls last), then crawledAt desc
    articles.sort((a, b) => {
      if (a.publishDate && b.publishDate) {
        return new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
      }
      if (a.publishDate) return -1
      if (b.publishDate) return 1
      return new Date(b.crawledAt).getTime() - new Date(a.crawledAt).getTime()
    })

    // Pagination
    const pageNum = Math.max(1, parseInt(page || '1'))
    const limitNum = Math.min(100, Math.max(1, parseInt(limit || '20')))
    const total = articles.length
    const totalPages = Math.ceil(total / limitNum)
    const start = (pageNum - 1) * limitNum
    const pagedArticles = articles.slice(start, start + limitNum)

    res.json({
      articles: pagedArticles,
      total,
      page: pageNum,
      totalPages,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message || '获取文章列表失败' })
  }
})

// GET /api/articles/:id - Get single article
router.get('/:id', (req, res) => {
  try {
    const articles = readData('articles.json') as Article[]
    const article = articles.find((a) => a.id === req.params.id)
    if (!article) {
      return res.status(404).json({ error: '文章不存在' })
    }
    res.json(article)
  } catch (err: any) {
    res.status(500).json({ error: err.message || '获取文章失败' })
  }
})

export default router
