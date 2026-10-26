import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { useAuthStore } from './store/authStore'
import './index.css'

async function bootstrap() {
  // 本地单用户模式：启动即自动登录，无需注册/登录页
  await useAuthStore.getState().init()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
}

bootstrap()
