import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { readData, writeData } from '../utils/storage.js'
import { authMiddleware, generateToken, AuthRequest } from '../middleware/auth.js'

const router = Router()

// 本地单用户模式：自动登录为默认管理员（无需注册/密码）
// GET /api/auth/auto-login
router.post('/auto-login', async (_req: AuthRequest, res: Response) => {
  try {
    const users = readData('users.json')
    let admin = users.find((u: any) => u.role === 'admin')

    // 首次启动：自动创建默认管理员
    if (!admin) {
      admin = {
        id: uuidv4(),
        username: '本地管理员',
        email: 'admin@local',
        password: '',
        role: 'admin',
        avatar: '',
        company: '',
        department: '',
        position: '',
        campus: '',
        grade: '',
        createdAt: new Date().toISOString(),
      }
      users.push(admin)
      writeData('users.json', users)
    }

    const token = generateToken(admin.id, admin.role)
    const { password: _pw, ...userWithoutPassword } = admin
    res.json({ user: userWithoutPassword, token })
  } catch (error) {
    res.status(500).json({ error: '自动登录失败，请稍后重试' })
  }
})

// POST /api/auth/login （保留，便于脚本/接口调用）
router.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: '请填写邮箱和密码' })
    }

    const users = readData('users.json')
    const user = users.find((u: any) => u.email === email)

    if (!user) {
      return res.status(400).json({ error: '邮箱或密码错误' })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return res.status(400).json({ error: '邮箱或密码错误' })
    }

    const token = generateToken(user.id, user.role)
    const { password: _, ...userWithoutPassword } = user
    res.json({ user: userWithoutPassword, token })
  } catch (error) {
    res.status(500).json({ error: '登录失败，请稍后重试' })
  }
})

// GET /api/auth/profile
router.get('/profile', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const users = readData('users.json')
    const user = users.find((u: any) => u.id === req.userId)

    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const { password: _, ...userWithoutPassword } = user
    res.json(userWithoutPassword)
  } catch (error) {
    res.status(500).json({ error: '获取用户信息失败' })
  }
})

// PUT /api/auth/profile - update profile (username, avatar, company, etc.)
router.put('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { username, avatar, company, department, position, campus, grade } = req.body
    const users = readData('users.json')
    const userIndex = users.findIndex((u: any) => u.id === req.userId)

    if (userIndex === -1) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const user = users[userIndex]

    if (username) user.username = username
    if (avatar !== undefined) user.avatar = avatar
    if (company !== undefined) user.company = company
    if (department !== undefined) user.department = department
    if (position !== undefined) user.position = position
    if (campus !== undefined) user.campus = campus
    if (grade !== undefined) user.grade = grade

    users[userIndex] = user
    writeData('users.json', users)

    const { password: _, ...userWithoutPassword } = user
    res.json(userWithoutPassword)
  } catch (error) {
    res.status(500).json({ error: '更新用户信息失败' })
  }
})

export default router
