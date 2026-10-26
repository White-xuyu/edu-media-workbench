import { create } from 'zustand'
import type { User } from '../types'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  initialized: boolean
  // 后端冷启动可能比前端慢，自动登录失败时置为 true，供界面提示
  authFailed: boolean
  login: (user: User, token: string) => void
  logout: () => void
  updateUser: (user: User) => void
  // 本地单用户模式：自动以默认管理员身份进入，无需注册/登录
  init: () => Promise<void>
  retryInit: () => Promise<void>
}

// 后端可能还在启动（尤其一键启动脚本刚拉起服务时），重试直到就绪
const AUTO_LOGIN_MAX_TRY = 40
const AUTO_LOGIN_INTERVAL_MS = 1500

export const useAuthStore = create<AuthState>((set, get) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  initialized: false,
  authFailed: false,

  login: (user: User, token: string) => {
    localStorage.setItem('user', JSON.stringify(user))
    localStorage.setItem('token', token)
    set({ user, token, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    set({ user: null, token: null, isAuthenticated: false })
  },

  updateUser: (user: User) => {
    localStorage.setItem('user', JSON.stringify(user))
    set({ user })
  },

  init: async () => {
    const existingToken = localStorage.getItem('token')
    const existingUser = localStorage.getItem('user')
    if (existingToken && existingUser) {
      set({ token: existingToken, user: JSON.parse(existingUser), isAuthenticated: true, initialized: true })
      return
    }

    for (let i = 0; i < AUTO_LOGIN_MAX_TRY; i++) {
      try {
        const res = await fetch('/api/auth/auto-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        if (res.ok) {
          const data = await res.json()
          localStorage.setItem('user', JSON.stringify(data.user))
          localStorage.setItem('token', data.token)
          set({ user: data.user, token: data.token, isAuthenticated: true, initialized: true, authFailed: false })
          return
        }
      } catch {
        // 后端尚未就绪，继续重试
      }
      await new Promise((r) => setTimeout(r, AUTO_LOGIN_INTERVAL_MS))
    }

    // 多次重试仍失败：不再静默吞掉，交由界面提示
    set({ initialized: true, authFailed: true })
  },

  retryInit: async () => {
    set({ initialized: false, authFailed: false })
    await get().init()
  },
}))
