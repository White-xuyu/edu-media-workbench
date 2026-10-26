import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from './store/authStore'
import Layout from './components/Layout'
import ProfileSetup from './components/ProfileSetup'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import AIChatPage from './pages/AIChatPage'
import Articles from './pages/Articles'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Connecting />
  return <>{children}</>
}

// 后端还没起来时，不要一脚把用户踢回首页（那样看起来像"功能没启动"）
function Connecting() {
  const { initialized, authFailed, retryInit } = useAuthStore()
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-3 text-center px-6">
      <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
      <div className="text-sm text-gray-500">
        {authFailed ? '无法连接本地服务（端口 3001）' : '正在连接本地服务…'}
      </div>
      {authFailed && (
        <button onClick={retryInit} className="btn-primary text-sm px-4 py-1.5">
          重新连接
        </button>
      )}
      {!initialized && <div className="text-xs text-gray-400">首次启动需要几秒，请稍候</div>}
    </div>
  )
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user || user.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const initialized = useAuthStore((s) => s.initialized)
  const user = useAuthStore((s) => s.user)
  const authFailed = useAuthStore((s) => s.authFailed)
  const retryInit = useAuthStore((s) => s.retryInit)
  const needsProfileSetup = !!user && (!user.campus || !user.grade)

  if (!initialized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">
        正在加载...
      </div>
    )
  }

  // 首次进入：未设置校区/学段则先引导填写资料
  if (needsProfileSetup) {
    return <ProfileSetup />
  }

  return (
    <>
      {authFailed && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs px-4 py-2 flex items-center justify-center gap-3">
          <span>AI 助手暂时不可用：连不上本地服务（3001）。请确认服务已启动。</span>
          <button onClick={retryInit} className="underline font-medium">重新连接</button>
        </div>
      )}
      <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/ai-chat" element={
          <ProtectedRoute><AIChatPage /></ProtectedRoute>
        } />
        <Route path="/dashboard" element={
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        } />
        <Route path="/articles" element={<Articles />} />
        <Route path="/admin" element={
          <ProtectedRoute><AdminRoute><Admin /></AdminRoute></ProtectedRoute>
        } />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
