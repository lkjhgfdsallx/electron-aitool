import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { MainArea } from './components/layout/MainArea'
import { TitleBar } from './components/layout/TitleBar'
import { initMCPSync } from './stores/mcp-tool-store'
import { useShortcuts } from './hooks/use-shortcuts'
import type { ViewMode, SettingsSection } from './components/settings/SettingsNavRail'

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('chat')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('ai-providers')

  // 应用启动时初始化 MCP 工具同步（监听配置变更，自动刷新工具列表）
  useEffect(() => {
    initMCPSync()
  }, [])

  // 快捷键桥接：将 store 中的快捷键配置注册到 Electron globalShortcut
  const openSettingsCb = useCallback(() => {
    setSettingsSection('ai-providers')
    setViewMode('settings')
  }, [])
  useShortcuts({ openSettings: openSettingsCb })

  const openSettings = (section: SettingsSection = 'ai-providers') => {
    setSettingsSection(section)
    setViewMode('settings')
  }

  const openKnowledgeBase = () => {
    setViewMode('knowledge-base')
  }

  const closeSettings = () => {
    setViewMode('chat')
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden select-none">
      {/* 自定义标题栏 - 替代 Electron 原生标题栏 */}
      <TitleBar />

      {/* 主内容区域 */}
      <div className="flex flex-1 min-h-0">
      {/* 侧边栏 - 仅在对话模式下显示 */}
      {viewMode === 'chat' && (
        <Sidebar
          viewMode={viewMode}
          onOpenSettings={openSettings}
          onOpenKnowledgeBase={openKnowledgeBase}
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
    </div>
  )
}
