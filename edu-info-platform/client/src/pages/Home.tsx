import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, Bot, ChevronRight, TrendingUp } from 'lucide-react'
import { api } from '../hooks/useApi'
import type { Website, Category } from '../types'
import WebsiteCard from '../components/WebsiteCard'
import WechatDialog from '../components/WechatDialog'

export default function Home() {
  const [categories, setCategories] = useState<Category[]>([])
  const [websites, setWebsites] = useState<Website[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [wechatDialog, setWechatDialog] = useState<Website | null>(null)
  const [sidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true'
  })

  const fetchCategories = useCallback(async () => {
    try {
      const data = await api.get<Category[]>('/categories')
      setCategories(data)
    } catch (err) {
      console.error('Failed to fetch categories:', err)
    }
  }, [])

  const fetchWebsites = useCallback(async (categoryId?: string, searchQuery?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (categoryId) params.append('categoryId', categoryId)
      if (searchQuery) params.append('search', searchQuery)
      const query = params.toString()
      const data = await api.get<Website[]>(`/websites${query ? `?${query}` : ''}`)
      setWebsites(data)
    } catch (err) {
      console.error('Failed to fetch websites:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCategories()
    fetchWebsites()
  }, [fetchCategories, fetchWebsites])

  const handleCategoryClick = (categoryId: string) => {
    const newCategory = activeCategory === categoryId ? '' : categoryId
    setActiveCategory(newCategory)
    fetchWebsites(newCategory, search)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    fetchWebsites(activeCategory, searchInput)
  }

  // Group websites by category for display when no specific filter
  const groupedWebsites = activeCategory
    ? null
    : categories.reduce((acc, cat) => {
        const ws = websites.filter((w) => w.categoryId === cat.id)
        if (ws.length > 0) acc.push({ category: cat, websites: ws })
        return acc
      }, [] as { category: Category; websites: Website[] }[])

  return (
    <div className="flex h-[calc(100vh-0px)]">
      {/* Category Sidebar */}
      <aside className={`w-48 lg:w-56 border-r border-gray-200 bg-white overflow-y-auto flex-shrink-0 ${sidebarCollapsed ? 'hidden' : 'hidden md:block'}`}>
        <div className="p-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-primary-500" />
            资讯分类
          </h2>
        </div>
        <nav className="py-2">
          <button
            onClick={() => {
              setActiveCategory('')
              fetchWebsites('', search)
            }}
            className={`w-full text-left sidebar-link mx-2 ${
              !activeCategory ? 'active' : ''
            }`}
          >
            <span>全部资讯</span>
            <ChevronRight className="w-3 h-3 ml-auto" />
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className={`w-full text-left sidebar-link mx-2 ${
                activeCategory === cat.id ? 'active' : ''
              }`}
            >
              <span>{cat.name}</span>
              <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100" />
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {/* Search & AI Banner */}
        <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center gap-4">
            <form onSubmit={handleSearch} className="flex-1 relative flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="搜索教育资讯网站..."
                  className="input-field pl-10 pr-4"
                />
              </div>
              <button type="submit" className="btn-primary text-sm px-4">
                搜索
              </button>
            </form>
            <Link
              to="/ai-chat"
              className="btn-primary flex items-center gap-2 whitespace-nowrap"
            >
              <Bot className="w-4 h-4" />
              <span className="hidden sm:inline">AI 助手</span>
            </Link>
          </div>
        </div>

        {/* Mobile category scroll */}
        <div className="md:hidden bg-white border-b border-gray-200 px-4 py-2 overflow-x-auto flex gap-2">
          <button
            onClick={() => {
              setActiveCategory('')
              fetchWebsites('', search)
            }}
            className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap ${
              !activeCategory ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            全部
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap ${
                activeCategory === cat.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Website Cards */}
        <div className="p-4 lg:p-6 max-w-5xl mx-auto">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-200" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-gray-100 rounded w-full mb-1" />
                      <div className="h-3 bg-gray-100 rounded w-2/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : activeCategory ? (
            // Flat view for category filter
            <>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                {categories.find((c) => c.id === activeCategory)?.name || '筛选结果'}
                <span className="text-sm font-normal text-gray-500 ml-2">
                  共 {websites.length} 个网站
                </span>
              </h2>
              {websites.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p>该分类下暂无网站</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {websites.map((ws) => (
                    <WebsiteCard key={ws.id} website={ws} onWechatClick={setWechatDialog} />
                  ))}
                </div>
              )}
            </>
          ) : (
            // Grouped by category
            <>
              {search && (
                <h2 className="text-lg font-semibold text-gray-800 mb-4">
                  搜索 "{search}" 的结果
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    共 {websites.length} 个网站
                  </span>
                </h2>
              )}
              {groupedWebsites && groupedWebsites.map(({ category, websites: categoryWebsites }) => (
                <section key={category.id} className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-base font-semibold text-gray-800">{category.name}</h2>
                    <span className="text-xs text-gray-400">
                      ({categoryWebsites.length})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {categoryWebsites.map((ws) => (
                      <WebsiteCard key={ws.id} website={ws} onWechatClick={setWechatDialog} />
                    ))}
                  </div>
                </section>
              ))}
              {(!groupedWebsites || groupedWebsites.length === 0) && !loading && (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-lg mb-2">暂无网站数据</p>
                  <p className="text-sm">请尝试其他搜索条件</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {wechatDialog && (
        <WechatDialog website={wechatDialog} onClose={() => setWechatDialog(null)} />
      )}
    </div>
  )
}
