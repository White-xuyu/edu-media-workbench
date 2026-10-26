import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { readData } from '../utils/storage.js'
import { executeCrawl, getLastCrawlStatus } from '../services/crawler.js'

const router = Router()

interface Website {
  id: string
  name: string
  url: string
  description: string
  icon: string
  categoryId: string
  tags: string[]
  type?: 'website' | 'wechat'
  isPublic?: boolean
  userId: string
  createdAt: string
  updatedAt?: string
}

// POST /api/crawl/trigger - Trigger content crawling (any logged-in user)
router.post('/trigger', authMiddleware, async (req, res) => {
  try {
    const { sourceIds } = req.body as { sourceIds?: string[] }

    // Get all websites
    let websites = readData('websites.json') as Website[]

    // Filter by sourceIds if provided
    if (sourceIds && sourceIds.length > 0) {
      websites = websites.filter((w) => sourceIds.includes(w.id))
    }

    if (websites.length === 0) {
      return res.status(400).json({ error: '没有可抓取的网站' })
    }

    console.log(`🕷️ 开始抓取 ${websites.length} 个来源...`)
    const result = await executeCrawl(websites)
    console.log(`✅ 抓取完成: ${result.newArticles} 篇新文章, ${result.successCount} 成功, ${result.failCount} 失败, ${result.skippedWechat} 公众号跳过`)

    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message || '抓取失败' })
  }
})

// GET /api/crawl/status - Get last crawl status (any logged-in user)
router.get('/status', authMiddleware, (_req, res) => {
  try {
    const status = getLastCrawlStatus()
    res.json(status)
  } catch (err: any) {
    res.status(500).json({ error: err.message || '获取状态失败' })
  }
})

export default router
