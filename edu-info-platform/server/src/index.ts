import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load env
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })

import authRoutes from './routes/auth.js'
import websiteRoutes from './routes/websites.js'
import categoryRoutes from './routes/categories.js'
import collectionRoutes from './routes/collections.js'
import chatRoutes from './routes/chat.js'
import adminRoutes from './routes/admin.js'
import articleRoutes from './routes/articles.js'
import crawlRoutes from './routes/crawl.js'
import workbuddyRoutes from './routes/workbuddy.js'

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Serve uploaded files
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/websites', websiteRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/collections', collectionRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/articles', articleRoutes)
app.use('/api/crawl', crawlRoutes)
app.use('/api/workbuddy', workbuddyRoutes)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist')
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`🚀 教培资讯平台后端服务已启动: http://localhost:${PORT}`)
  console.log(`📁 数据存储: JSON 文件`)
  console.log(`🤖 AI 接口: ${process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-your-api-key-here' ? '已配置' : '使用本地智能匹配模式'}`)
})
