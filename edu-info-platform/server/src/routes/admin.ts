import { Router, Response } from 'express'
import { readData } from '../utils/storage.js'
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js'

const router = Router()

// All admin routes require auth + admin role
router.use(authMiddleware, adminMiddleware)

// GET /api/admin/users
router.get('/users', (_req: AuthRequest, res: Response) => {
  try {
    const users = readData('users.json')
    const usersWithoutPasswords = users.map((u: any) => {
      const { password, ...rest } = u
      return rest
    })
    res.json(usersWithoutPasswords)
  } catch (error) {
    res.status(500).json({ error: '获取用户列表失败' })
  }
})

// GET /api/admin/websites - get ALL websites
router.get('/websites', (_req: AuthRequest, res: Response) => {
  try {
    const websites = readData('websites.json')
    res.json(websites)
  } catch (error) {
    res.status(500).json({ error: '获取网站列表失败' })
  }
})

// GET /api/admin/collections - get ALL collections
router.get('/collections', (_req: AuthRequest, res: Response) => {
  try {
    const collections = readData('collections.json')
    res.json(collections)
  } catch (error) {
    res.status(500).json({ error: '获取合集列表失败' })
  }
})

export default router
