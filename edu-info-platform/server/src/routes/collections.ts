import { Router, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { readData, writeData } from '../utils/storage.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

const router = Router()

// GET /api/collections - get current user's collections
router.get('/', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const collections = readData('collections.json')
    const myCollections = collections.filter((c: any) => c.userId === req.userId)
    res.json(myCollections)
  } catch (error) {
    res.status(500).json({ error: '获取合集列表失败' })
  }
})

// GET /api/collections/:id - get a specific collection with its websites
router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const collections = readData('collections.json')
    const collection = collections.find((c: any) => c.id === req.params.id)

    if (!collection) {
      return res.status(404).json({ error: '合集不存在' })
    }

    // Get the websites for this collection
    const websites = readData('websites.json')
    const collectionWebsites = websites.filter((w: any) =>
      collection.websiteIds.includes(w.id)
    )

    res.json({ ...collection, websites: collectionWebsites })
  } catch (error) {
    res.status(500).json({ error: '获取合集详情失败' })
  }
})

// POST /api/collections - create a new collection
router.post('/', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { name, description, websiteIds, isPublic } = req.body

    if (!name) {
      return res.status(400).json({ error: '合集名称为必填项' })
    }

    const collections = readData('collections.json')
    const newCollection = {
      id: uuidv4(),
      name,
      description: description || '',
      websiteIds: websiteIds || [],
      isPublic: isPublic || false,
      userId: req.userId!,
      createdAt: new Date().toISOString(),
    }

    collections.push(newCollection)
    writeData('collections.json', collections)

    res.status(201).json(newCollection)
  } catch (error) {
    res.status(500).json({ error: '创建合集失败' })
  }
})

// PUT /api/collections/:id - update a collection
router.put('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const collections = readData('collections.json')
    const index = collections.findIndex((c: any) => c.id === req.params.id)

    if (index === -1) {
      return res.status(404).json({ error: '合集不存在' })
    }

    if (collections[index].userId !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ error: '无权修改此合集' })
    }

    const { name, description, websiteIds, isPublic } = req.body
    if (name) collections[index].name = name
    if (description !== undefined) collections[index].description = description
    if (websiteIds) collections[index].websiteIds = websiteIds
    if (isPublic !== undefined) collections[index].isPublic = isPublic
    collections[index].updatedAt = new Date().toISOString()

    writeData('collections.json', collections)
    res.json(collections[index])
  } catch (error) {
    res.status(500).json({ error: '更新合集失败' })
  }
})

// DELETE /api/collections/:id - delete a collection
router.delete('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const collections = readData('collections.json')
    const index = collections.findIndex((c: any) => c.id === req.params.id)

    if (index === -1) {
      return res.status(404).json({ error: '合集不存在' })
    }

    if (collections[index].userId !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ error: '无权删除此合集' })
    }

    collections.splice(index, 1)
    writeData('collections.json', collections)
    res.json({ message: '删除成功' })
  } catch (error) {
    res.status(500).json({ error: '删除合集失败' })
  }
})

export default router
