import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // 必须显式监听 0.0.0.0：Node 17+ 起 localhost 会被解析成 IPv6 的 ::1，
    // 导致只监听 [::1]，而浏览器/系统解析 localhost 时优先走 IPv4 127.0.0.1 → 连不上（或被系统代理拦截返回 502）
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        // 用 127.0.0.1 而非 localhost，避免代理目标再次落到 IPv6 解析歧义上
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})
