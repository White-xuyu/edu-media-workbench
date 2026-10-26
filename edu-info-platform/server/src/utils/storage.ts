import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.join(__dirname, '..', 'data')

// Ensure data directory and JSON files exist
function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  const files = ['users.json', 'websites.json', 'categories.json', 'collections.json', 'chats.json', 'settings.json', 'articles.json']
  for (const file of files) {
    const filePath = path.join(DATA_DIR, file)
    if (!fs.existsSync(filePath)) {
      // Initialize based on file type
      if (file === 'categories.json') {
        fs.writeFileSync(filePath, JSON.stringify(getDefaultCategories(), null, 2))
      } else if (file === 'websites.json') {
        fs.writeFileSync(filePath, JSON.stringify(getDefaultWebsites(), null, 2))
      } else {
        fs.writeFileSync(filePath, JSON.stringify([]))
      }
    }
  }
}

function getDefaultCategories() {
  return [
    { id: 'cat-1', name: '政策法规', icon: 'ScrollText', type: 'system', order: 1 },
    { id: 'cat-2', name: '学科资讯', icon: 'BookOpen', type: 'system', order: 2 },
    { id: 'cat-3', name: '考试招生', icon: 'FileText', type: 'system', order: 3 },
    { id: 'cat-5', name: '教育科技', icon: 'Cpu', type: 'system', order: 5 },
    { id: 'cat-6', name: '学前教育', icon: 'Baby', type: 'system', order: 6 },
    { id: 'cat-7', name: '基础教育', icon: 'School', type: 'system', order: 7 },
    { id: 'cat-8', name: '高等教育', icon: 'GraduationCap', type: 'system', order: 8 },
  ]
}

function getDefaultWebsites() {
  return [
    {
      id: 'ws-1',
      name: '中华人民共和国教育部',
      url: 'https://www.moe.gov.cn',
      description: '教育部官方网站，发布最新教育政策、法规和通知',
      icon: '',
      categoryId: 'cat-1',
      tags: ['官方', '政策', '教育部'],
      type: 'website',
      isPublic: true,
      userId: 'system',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ws-2',
      name: '中国教育考试网',
      url: 'https://www.neea.edu.cn',
      description: '教育部教育考试院主办，提供各类教育考试信息',
      icon: '',
      categoryId: 'cat-3',
      tags: ['考试', '招生', '官方'],
      type: 'website',
      isPublic: true,
      userId: 'system',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ws-3',
      name: '中国教育在线',
      url: 'https://www.eol.cn',
      description: '综合教育门户，提供教育新闻、考试、留学等信息',
      icon: '',
      categoryId: 'cat-2',
      tags: ['综合', '新闻', '考试'],
      type: 'website',
      isPublic: true,
      userId: 'system',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ws-4',
      name: '阳光高考',
      url: 'https://gaokao.chsi.com.cn',
      description: '教育部高校招生阳光工程指定平台，提供高考政策与招生信息',
      icon: '',
      categoryId: 'cat-3',
      tags: ['高考', '招生', '官方'],
      type: 'website',
      isPublic: true,
      userId: 'system',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ws-5',
      name: '中国教师资格网',
      url: 'https://www.jszg.edu.cn',
      description: '教师资格认定、考试、注册的官方网站',
      icon: '',
      categoryId: 'cat-1',
      tags: ['教师', '资格证', '官方'],
      type: 'website',
      isPublic: true,
      userId: 'system',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ws-6',
      name: '中国教育信息化网',
      url: 'https://www.ict.edu.cn',
      description: '教育信息化政策、技术和应用资讯平台',
      icon: '',
      categoryId: 'cat-5',
      tags: ['信息化', '科技', '教育技术'],
      type: 'website',
      isPublic: true,
      userId: 'system',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ws-8',
      name: '国家中小学智慧教育平台',
      url: 'https://www.smartedu.cn',
      description: '国家中小学智慧教育平台，提供优质教育资源和在线学习',
      icon: '',
      categoryId: 'cat-7',
      tags: ['中小学', '在线学习', '资源'],
      type: 'website',
      isPublic: true,
      userId: 'system',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'gzh-1',
      name: '微言教育',
      url: 'https://weixin.sogou.com/weixin?type=1&query=微言教育',
      description: '教育部官方微信公众号，发布最新教育政策、通知和资讯',
      icon: '',
      categoryId: 'cat-1',
      tags: ['官方', '政策', '教育部'],
      type: 'wechat',
      isPublic: true,
      userId: 'system',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'gzh-2',
      name: '中国教育报',
      url: 'https://weixin.sogou.com/weixin?type=1&query=中国教育报',
      description: '中国教育报刊社官方公众号，教育新闻、评论和深度报道',
      icon: '',
      categoryId: 'cat-2',
      tags: ['新闻', '综合', '评论'],
      type: 'wechat',
      isPublic: true,
      userId: 'system',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'gzh-3',
      name: '人民教育',
      url: 'https://weixin.sogou.com/weixin?type=1&query=人民教育',
      description: '人民教育出版社官方公众号，提供教材解读、教学资源和教育理念',
      icon: '',
      categoryId: 'cat-2',
      tags: ['教材', '教学', '人教社'],
      type: 'wechat',
      isPublic: true,
      userId: 'system',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'gzh-4',
      name: '阳光高考信息平台',
      url: 'https://weixin.sogou.com/weixin?type=1&query=阳光高考',
      description: '教育部高校招生阳光工程指定公众号，高考政策和志愿填报指导',
      icon: '',
      categoryId: 'cat-3',
      tags: ['高考', '招生', '志愿'],
      type: 'wechat',
      isPublic: true,
      userId: 'system',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'gzh-5',
      name: '研招网',
      url: 'https://weixin.sogou.com/weixin?type=1&query=研招网',
      description: '中国研究生招生信息网官方公众号，考研报名、调剂和录取信息',
      icon: '',
      categoryId: 'cat-3',
      tags: ['考研', '招生', '研究生'],
      type: 'wechat',
      isPublic: true,
      userId: 'system',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'gzh-6',
      name: '中国教师报',
      url: 'https://weixin.sogou.com/weixin?type=1&query=中国教师报',
      description: '中国教师报官方公众号，为教师提供专业成长、教学方法和教育资讯',
      icon: '',
      categoryId: 'cat-7',
      tags: ['教师', '教学', '专业发展'],
      type: 'wechat',
      isPublic: true,
      userId: 'system',
      createdAt: new Date().toISOString(),
    },
  ]
}

// Generic CRUD operations
function readData(filename: string): any[] {
  const filePath = path.join(DATA_DIR, filename)
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function writeData(filename: string, data: any[]): void {
  const filePath = path.join(DATA_DIR, filename)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

// Initialize on import
ensureDataFiles()

export { DATA_DIR, readData, writeData, getDefaultCategories }
