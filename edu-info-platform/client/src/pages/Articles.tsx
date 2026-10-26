import { useState, useEffect, useCallback } from 'react'
import { Search, Newspaper, ChevronLeft, ChevronRight, Globe, MessageCircle } from 'lucide-react'
import { api } from '../hooks/useApi'
import type { Category, ArticleListResponse, Article } from '../types'
import ArticleCard from '../components/ArticleCard'

export default function Articles() {
  const [categories, setCategories] = useState<Category[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [activeCategory, setActiveCategory] = useState('')
  const [sourceType, setSourceType] = useState<string>('')

  const fetchCategories = useCallback(async () => {
    try {
      const data = await api.get<Category[]>('/categories')
      setCategories(data)
    } catch (err) {
      console.error('Failed to load categories:', err)
    }
  }, [])

  const fetchArticles = useCallback(async (p: number, categoryId: string, searchQuery: string, st: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', String(p))
      params.append('limit', '20')
      if (categoryId) params.append('categoryId', categoryId)
      if (searchQuery) params.append('search', searchQuery)
      if (st) params.append('sourceType', st)
      const data = await api.get<ArticleListResponse>(`/articles?${params.toString()}`)
      setArticles(data.articles)
      setTotal(data.total)
      setTotalPages(data.totalPages)
      setPage(data.page)
    } catch (err) {
      console.error('Failed to load articles:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  useEffect(() => {
    fetchArticles(1, activeCategory, search, sourceType)
  }, [activeCategory, search, sourceType, fetchArticles])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const handleCategoryClick = (catId: string) => {
    setActiveCategory(activeCategory === catId ? '' : catId)
    setPage(1)
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    fetchArticles(newPage, activeCategory, search, sourceType)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="flex h-[calc(100vh-0px)]">
      {/* Category Sidebar */}
      <aside className="w-48 lg:w-56 border-r border-gray-200 bg-white overflow-y-auto flex-shrink-0 hidden md:block">
        <div className="p-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <Newspaper className="w-4 h-4 text-primary-500" />
            资讯分类
          </h2>
        </div>
        <nav className="py-2">
          <button
            onClick={() => { setActiveCategory(''); setPage(1) }}
            className={`w-full text-left sidebar-link mx-2 ${!activeCategory ? 'active' : ''}`}
          >
            <span>全部文章</span>
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className={`w-full text-left sidebar-link mx-2 ${activeCategory === cat.id ? 'active' : ''}`}
            >
              <span>{cat.name}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4">
          <div className="max-w-4xl mx-auto">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="搜索文章标题和摘要..."
                  className="input-field pl-10 pr-4"
                />
              </div>
              <button type="submit" className="btn-primary text-sm px-4">搜索</button>
            </form>

            {/* Source type filter + mobile category */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {[
                  { value: '', label: '全部' },
                  { value: 'website', label: '网站', icon: Globe },
                  { value: 'wechat', label: '公众号', icon: MessageCircle },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setSourceType(opt.value); setPage(1) }}
                    className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      sourceType === opt.value ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {opt.icon && <opt.icon className="w-3 h-3" />}
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Mobile category pills */}
              <div className="md:hidden flex gap-1 overflow-x-auto flex-1">
                <button
                  onClick={() => handleCategoryClick('')}
                  className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${!activeCategory ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  全部
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryClick(cat.id)}
                    className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${activeCategory === cat.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Article Cards */}
        <div className="p-4 lg:p-6 max-w-5xl mx-auto">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                  <div className="h-3 bg-gray-200 rounded w-16 mb-3" />
                  <div className="h-4 bg-gray-200 rounded w-full mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <Newspaper className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-400 text-lg mb-1">暂无文章数据</p>
              <p className="text-gray-300 text-sm">请管理员在后台触发内容抓取</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">
                  共 <span className="font-medium text-gray-700">{total}</span> 篇文章
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {articles.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePageChange(p)}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                        page === p
                          ? 'bg-primary-600 text-white'
                          : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
