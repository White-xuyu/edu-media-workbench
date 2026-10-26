import { Router, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { readData, writeData } from '../utils/storage.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

const router = Router()

// GET /api/websites - get all websites (public + user's own)
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const { categoryId, search, userId } = req.query
    let websites = readData('websites.json')

    if (categoryId) {
      websites = websites.filter((w: any) => w.categoryId === categoryId)
    }

    if (search) {
      const keyword = (search as string).toLowerCase()
      websites = websites.filter((w: any) =>
        w.name.toLowerCase().includes(keyword) ||
        w.description.toLowerCase().includes(keyword) ||
        (w.tags && w.tags.some((t: string) => t.toLowerCase().includes(keyword)))
      )
    }

    // Filter: show system websites + user's own + public user websites
    websites = websites.filter((w: any) =>
      w.userId === 'system' || w.isPublic || w.userId === userId
    )

    res.json(websites)
  } catch (error) {
    res.status(500).json({ error: '获取网站列表失败' })
  }
})

// GET /api/websites/my - get current user's websites
router.get('/my', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const websites = readData('websites.json')
    const myWebsites = websites.filter((w: any) => w.userId === req.userId)
    res.json(myWebsites)
  } catch (error) {
    res.status(500).json({ error: '获取我的网站列表失败' })
  }
})

// POST /api/websites - create a new website
router.post('/', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { name, url, description, icon, categoryId, tags, isPublic, type } = req.body

    if (!name || !url) {
      return res.status(400).json({ error: '名称和链接为必填项' })
    }

    const websites = readData('websites.json')

    // Check for duplicate URL
    const normalizedUrl = url.trim().toLowerCase()
    const duplicate = websites.find((w: any) => w.url.trim().toLowerCase() === normalizedUrl)
    if (duplicate) {
      return res.status(400).json({ error: '该链接已被添加，请勿重复添加' })
    }

    const newWebsite = {
      id: uuidv4(),
      name,
      url,
      description: description || '',
      icon: icon || '',
      categoryId: categoryId || 'cat-2',
      tags: tags || [],
      type: type || 'website',
      isPublic: isPublic || false,
      userId: req.userId!,
      createdAt: new Date().toISOString(),
    }

    websites.push(newWebsite)
    writeData('websites.json', websites)

    res.status(201).json(newWebsite)
  } catch (error) {
    res.status(500).json({ error: '添加网站失败' })
  }
})

// POST /api/websites/generate-meta - fetch and parse metadata from a URL
router.post('/generate-meta', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { url } = req.body

    if (!url) {
      return res.status(400).json({ error: '请提供网址' })
    }

    let html: string
    try {
      const response = await fetch(url)
      if (!response.ok) {
        return res.status(400).json({ error: '无法访问该网址' })
      }
      html = await response.text()
    } catch {
      return res.status(400).json({ error: '无法访问该网址' })
    }

    // Extract title from <title> tag
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : ''

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)
      || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i)
    const description = descMatch ? descMatch[1].trim() : ''

    // Extract meta keywords
    const keywordsMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']*)["'][^>]*>/i)
      || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']keywords["'][^>]*>/i)
    let tags: string[] = []
    if (keywordsMatch) {
      tags = keywordsMatch[1].split(',').map((t: string) => t.trim()).filter(Boolean)
    }

    res.json({ title, description, tags })
  } catch (error) {
    res.status(500).json({ error: '获取网页信息失败' })
  }
})

// PUT /api/websites/:id - update a website
router.put('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const websites = readData('websites.json')
    const index = websites.findIndex((w: any) => w.id === req.params.id)

    if (index === -1) {
      return res.status(404).json({ error: '网站不存在' })
    }

    if (websites[index].userId !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ error: '无权修改此网站' })
    }

    // Check for duplicate URL (exclude current website)
    const { name, url, description, icon, categoryId, tags, isPublic } = req.body
    if (url) {
      const normalizedUrl = url.trim().toLowerCase()
      const duplicate = websites.find((w: any) =>
        w.id !== req.params.id && w.url.trim().toLowerCase() === normalizedUrl
      )
      if (duplicate) {
        return res.status(400).json({ error: '该网址已被添加，请勿重复添加' })
      }
    }

    if (name) websites[index].name = name
    if (url) websites[index].url = url
    if (description !== undefined) websites[index].description = description
    if (icon !== undefined) websites[index].icon = icon
    if (categoryId) websites[index].categoryId = categoryId
    if (tags) websites[index].tags = tags
    if (isPublic !== undefined) websites[index].isPublic = isPublic
    websites[index].updatedAt = new Date().toISOString()

    writeData('websites.json', websites)
    res.json(websites[index])
  } catch (error) {
    res.status(500).json({ error: '更新网站失败' })
  }
})

// DELETE /api/websites/:id - delete a website
router.delete('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const websites = readData('websites.json')
    const index = websites.findIndex((w: any) => w.id === req.params.id)

    if (index === -1) {
      return res.status(404).json({ error: '网站不存在' })
    }

    if (websites[index].userId !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ error: '无权删除此网站' })
    }

    websites.splice(index, 1)
    writeData('websites.json', websites)
    res.json({ message: '删除成功' })
  } catch (error) {
    res.status(500).json({ error: '删除网站失败' })
  }
})

export default router
