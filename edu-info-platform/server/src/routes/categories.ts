import { Router, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { readData, writeData } from '../utils/storage.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

const router = Router()

// GET /api/categories - get all categories (system + user's custom)
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    let categories = readData('categories.json')

    // Filter: system categories + current user's custom categories
    categories = categories.filter((c: any) =>
      c.type === 'system' || c.userId === req.query.userId
    )

    categories.sort((a: any, b: any) => a.order - b.order)
    res.json(categories)
  } catch (error) {
    res.status(500).json({ error: '获取分类列表失败' })
  }
})

// POST /api/categories - create a custom category
router.post('/', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { name, icon } = req.body

    if (!name) {
      return res.status(400).json({ error: '分类名称为必填项' })
    }

    const categories = readData('categories.json')
    const newCategory = {
      id: uuidv4(),
      name,
      icon: icon || 'Folder',
      type: 'custom',
      userId: req.userId!,
      order: categories.length + 1,
      createdAt: new Date().toISOString(),
    }

    categories.push(newCategory)
    writeData('categories.json', categories)

    res.status(201).json(newCategory)
  } catch (error) {
    res.status(500).json({ error: '添加分类失败' })
  }
})

// PUT /api/categories/:id - update a category
router.put('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const categories = readData('categories.json')
    const index = categories.findIndex((c: any) => c.id === req.params.id)

    if (index === -1) {
      return res.status(404).json({ error: '分类不存在' })
    }

    if (categories[index].type === 'system') {
      return res.status(403).json({ error: '系统分类不可修改' })
    }

    if (categories[index].userId !== req.userId) {
      return res.status(403).json({ error: '无权修改此分类' })
    }

    const { name, icon } = req.body
    if (name) categories[index].name = name
    if (icon) categories[index].icon = icon

    writeData('categories.json', categories)
    res.json(categories[index])
  } catch (error) {
    res.status(500).json({ error: '更新分类失败' })
  }
})

// DELETE /api/categories/:id - delete a category
router.delete('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const categories = readData('categories.json')
    const index = categories.findIndex((c: any) => c.id === req.params.id)

    if (index === -1) {
      return res.status(404).json({ error: '分类不存在' })
    }

    if (categories[index].type === 'system') {
      return res.status(403).json({ error: '系统分类不可删除' })
    }

    if (categories[index].userId !== req.userId) {
      return res.status(403).json({ error: '无权删除此分类' })
    }

    categories.splice(index, 1)
    writeData('categories.json', categories)
    res.json({ message: '删除成功' })
  } catch (error) {
    res.status(500).json({ error: '删除分类失败' })
  }
})

export default router
