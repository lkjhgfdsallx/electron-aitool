import { useState, useEffect } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { MainArea } from './components/layout/MainArea'
import { initMCPSync } from './stores/mcp-tool-store'
import type { ViewMode, SettingsSection } from './components/settings/SettingsNavRail'

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('chat')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('ai-providers')

  // 应用启动时初始化 MCP 工具同步（监听配置变更，自动刷新工具列表）
  useEffect(() => {
    initMCPSync()
  }, [])

  const openSettings = (section: SettingsSection = 'ai-providers') => {
    setSettingsSection(section)
    setViewMode('settings')
  }

  const closeSettings = () => {
    setViewMode('chat')
  }

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden select-none">
      {/* 侧边栏 - 仅在对话模式下显示 */}
      {viewMode === 'chat' && (
        <Sidebar
          viewMode={viewMode}
          onOpenSettings={openSettings}
          onBackToChat={closeSettings}
        />
      )}

      {/* 主区域 */}
      <MainArea
        viewMode={viewMode}
        settingsSection={settingsSection}
        onOpenSettings={openSettings}
        onCloseSettings={closeSettings}
      />
    </div>
  )
}
