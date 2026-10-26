export interface User {
  id: string
  username: string
  email: string
  role: 'user' | 'admin'
  avatar: string
  company?: string
  department?: string
  position?: string
  campus?: string
  grade?: string
  createdAt: string
}

// 个人资料下拉预设（可按实际校区/学段调整）
export const CAMPUS_OPTIONS = [
  '北京学校',
  '天津学校',
  '石家庄学校',
  '太原学校',
  '呼和浩特学校',
  '唐山学校',
  '保定学校',
  '廊坊学校',
  '秦皇岛学校',
  '邯郸学校',
]

export const GRADE_OPTIONS = [
  '小学',
  '初中',
  '高中',
  '全学段（K12）',
]

export interface Website {
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

export interface Category {
  id: string
  name: string
  icon: string
  type: 'system' | 'custom'
  userId?: string
  order: number
}

export interface Collection {
  id: string
  name: string
  description: string
  websiteIds: string[]
  isPublic: boolean
  userId: string
  user?: { username: string; avatar?: string; company?: string; department?: string; position?: string }
  websites?: Website[]
  websiteCount?: number
  createdAt: string
  updatedAt?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface ChatHistory {
  id: string
  userId: string
  question: string
  answer: string
  createdAt: string
}

export interface Article {
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

export interface ArticleListResponse {
  articles: Article[]
  total: number
  page: number
  totalPages: number
}

export interface CrawlResult {
  status: string
  totalSources: number
  successCount: number
  failCount: number
  skippedWechat: number
  newArticles: number
  results: CrawlSourceResult[]
}

export interface CrawlSourceResult {
  sourceId: string
  sourceName: string
  status: 'success' | 'failed' | 'skipped_wechat'
  articlesFound: number
  error?: string
  message?: string
}
