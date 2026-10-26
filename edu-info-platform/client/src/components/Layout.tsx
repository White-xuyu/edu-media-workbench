import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import {
  Home, MessageSquare, LayoutDashboard, Settings, Newspaper,
  Menu, X, GraduationCap, User, ChevronLeft, ChevronRight
} from 'lucide-react'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true'
  })
  const location = useLocation()
  const { user } = useAuthStore()

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar_collapsed', String(next))
  }

  const navItems = [
    { path: '/', label: '首页', icon: Home },
    { path: '/articles', label: '教育资讯', icon: Newspaper },
    { path: '/ai-chat', label: 'AI 助手', icon: MessageSquare, auth: true },
    { path: '/dashboard', label: '我的控制台', icon: LayoutDashboard, auth: true },
    ...(user?.role === 'admin' ? [{ path: '/admin', label: '管理后台', icon: Settings }] : []),
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen bg-white border-r border-gray-200 z-50
        transform transition-all duration-200 lg:transform-none
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${collapsed ? 'w-16' : 'w-56'}
        flex flex-col
      `}>
        {/* Logo */}
        <Link to="/" className={`flex items-center gap-2 px-4 py-4 border-b border-gray-100 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          {!collapsed && <span className="font-bold text-gray-800 text-lg">教培资讯</span>}
        </Link>

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapsed}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 z-10"
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5 text-gray-400" />
          )}
        </button>

        {/* Navigation */}
        <nav className={`flex-1 py-4 space-y-1 overflow-y-auto ${collapsed ? 'px-2' : 'px-3'}`}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            const Icon = item.icon
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`sidebar-link ${isActive ? 'active' : ''} ${collapsed ? 'justify-center' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-4 h-4" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-gray-100 p-3">
          <Link
            to="/dashboard"
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? user?.username : undefined}
          >
            <div className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <User className="w-4 h-4 text-primary-600" />
              )}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-sm text-gray-700 truncate">{user?.username || '本地管理员'}</div>
                {(user?.campus || user?.grade) && (
                  <div className="text-xs text-gray-400 truncate">
                    {[user.campus, user.grade].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            )}
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-gray-100 rounded-lg"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-800">教培资讯</span>
          </Link>
        </header>

        {/* Page content */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
