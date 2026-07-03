import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles/globals.css'
import { registerAllExecutors } from './services/agent'

// 注册所有工具执行器（必须在 Agent 运行之前完成）
registerAllExecutors()

// 初始化主题
const savedTheme = localStorage.getItem('ui-preferences')
if (savedTheme) {
  try {
    const { state } = JSON.parse(savedTheme)
    if (state?.theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (state?.theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.classList.toggle('dark', prefersDark)
    }
  } catch {
    // 忽略解析错误
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
