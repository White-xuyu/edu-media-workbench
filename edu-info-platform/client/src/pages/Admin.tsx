import { useState, useEffect, useCallback } from 'react'
import { Shield, Users, Globe, FolderOpen, Trash2, Download, Loader2 } from 'lucide-react'
import { api } from '../hooks/useApi'
import type { User, Website, Collection, CrawlResult, CrawlSourceResult } from '../types'

type Tab = 'users' | 'websites' | 'collections' | 'crawl'

export default function Admin() {
  const [tab, setTab] = useState<Tab>('users')

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
          <Shield className="w-5 h-5 text-red-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">管理后台</h1>
          <p className="text-sm text-gray-500">管理用户、网站和合集</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {[
          { key: 'users' as Tab, label: '用户管理', icon: Users },
          { key: 'websites' as Tab, label: '网站管理', icon: Globe },
          { key: 'collections' as Tab, label: '合集管理', icon: FolderOpen },
          { key: 'crawl' as Tab, label: '内容抓取', icon: Download },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && <UsersPanel />}
      {tab === 'websites' && <WebsitesPanel />}
      {tab === 'collections' && <CollectionsPanel />}
      {tab === 'crawl' && <CrawlPanel />}
    </div>
  )
}

function UsersPanel() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<User[]>('/admin/users')
      setUsers(data)
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  if (loading) return <div className="text-gray-400 text-sm">加载中...</div>

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">用户名</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">邮箱</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">角色</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">注册时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden">
                      {user.avatar ? (
                        <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Users className="w-3.5 h-3.5 text-primary-500" />
                      )}
                    </div>
                    <span className="font-medium text-gray-700">{user.username}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{user.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    user.role === 'admin' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {user.role === 'admin' ? '管理员' : '普通用户'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WebsitesPanel() {
  const [websites, setWebsites] = useState<Website[]>([])
  const [loading, setLoading] = useState(true)

  const loadWebsites = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<Website[]>('/admin/websites')
      setWebsites(data)
    } catch (err) {
      console.error('Failed to load websites:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadWebsites() }, [loadWebsites])

  const handleDelete = async (website: Website) => {
    if (!confirm(`确定删除网站 "${website.name}"？`)) return
    try {
      await api.delete(`/websites/${website.id}`)
      loadWebsites()
    } catch (err: any) { alert(err.message) }
  }

  if (loading) return <div className="text-gray-400 text-sm">加载中...</div>

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">网站</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">URL</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">所有者</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {websites.map((ws) => (
              <tr key={ws.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-700">{ws.name}</td>
                <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                  <a href={ws.url} target="_blank" rel="noopener" className="text-primary-600 hover:underline">
                    {ws.url}
                  </a>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {ws.userId === 'system' ? '系统' : ws.userId}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(ws)}
                    className="p-1 hover:bg-red-50 rounded text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CollectionsPanel() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)

  const loadCollections = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<Collection[]>('/admin/collections')
      setCollections(data)
    } catch (err) {
      console.error('Failed to load collections:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCollections() }, [loadCollections])

  const handleDelete = async (col: Collection) => {
    if (!confirm(`确定删除合集 "${col.name}"？`)) return
    try {
      await api.delete(`/collections/${col.id}`)
      loadCollections()
    } catch (err: any) { alert(err.message) }
  }

  if (loading) return <div className="text-gray-400 text-sm">加载中...</div>

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">合集名称</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">描述</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">网站数</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">创建时间</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {collections.map((col) => (
              <tr key={col.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-700">{col.name}</td>
                <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{col.description}</td>
                <td className="px-4 py-3 text-gray-500">{col.websiteIds?.length || 0}</td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(col.createdAt).toLocaleDateString('zh-CN')}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(col)}
                    className="p-1 hover:bg-red-50 rounded text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CrawlPanel() {
  const [crawling, setCrawling] = useState(false)
  const [result, setResult] = useState<CrawlResult | null>(null)
  const [error, setError] = useState('')
  const [websites, setWebsites] = useState<Website[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const loadWebsites = useCallback(async () => {
    try {
      const data = await api.get<Website[]>('/admin/websites')
      setWebsites(data)
    } catch (err) {
      console.error('Failed to load websites:', err)
    }
  }, [])

  useEffect(() => { loadWebsites() }, [loadWebsites])

  const handleCrawl = async () => {
    setCrawling(true)
    setError('')
    setResult(null)
    try {
      const body = selectedIds.length > 0 ? { sourceIds: selectedIds } : {}
      const data = await api.post<CrawlResult>('/crawl/trigger', body)
      setResult(data)
    } catch (err: any) {
      setError(err.message || '抓取失败')
    } finally {
      setCrawling(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-800 mb-3">触发内容抓取</h3>
        <p className="text-sm text-gray-500 mb-4">
          抓取网站的 RSS 或首页文章链接。微信公众号会被跳过。
        </p>
        <button
          onClick={handleCrawl}
          disabled={crawling}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          {crawling ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              抓取中...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              开始抓取{selectedIds.length > 0 ? ` (${selectedIds.length}个来源)` : '全部'}
            </>
          )}
        </button>
        {error && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</div>
        )}
      </div>

      {result && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-800 mb-3">抓取结果</h3>
          {result.status === 'already_running' ? (
            <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-4 py-2">
              抓取任务正在运行中，请稍后再试
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{result.newArticles}</p>
                  <p className="text-xs text-green-500">新增文章</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{result.successCount}</p>
                  <p className="text-xs text-blue-500">成功</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{result.failCount}</p>
                  <p className="text-xs text-red-500">失败</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-gray-600">{result.skippedWechat}</p>
                  <p className="text-xs text-gray-500">跳过(公众号)</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">来源</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">状态</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">文章数</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">备注</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.results.map((r: CrawlSourceResult) => (
                      <tr key={r.sourceId} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-700">{r.sourceName}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            r.status === 'success' ? 'bg-green-50 text-green-600' :
                            r.status === 'skipped_wechat' ? 'bg-gray-100 text-gray-500' :
                            'bg-red-50 text-red-600'
                          }`}>
                            {r.status === 'success' ? '成功' : r.status === 'skipped_wechat' ? '跳过' : '失败'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-500">{r.articlesFound}</td>
                        <td className="px-4 py-2 text-gray-400 text-xs max-w-[200px] truncate">
                          {r.message || r.error || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-800 mb-3">选择抓取来源</h3>
        <p className="text-sm text-gray-500 mb-3">勾选后点击抓取按钮只抓取选中来源。留空则全部抓取。</p>
        <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {websites.map((ws) => (
            <label key={ws.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={selectedIds.includes(ws.id)}
                onChange={() => toggleSelect(ws.id)}
                className="w-4 h-4 text-primary-600 rounded" />
              <span className="text-sm text-gray-700">{ws.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-auto ${
                ws.type === 'wechat' ? 'bg-green-50 text-green-500' : 'bg-blue-50 text-blue-500'
              }`}>
                {ws.type === 'wechat' ? '公众号' : '网站'}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
