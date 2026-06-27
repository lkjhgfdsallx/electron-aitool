import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { MainArea } from './components/layout/MainArea'
import { TitleBar } from './components/layout/TitleBar'
import { CommandApprovalDialog } from './components/workspace/CommandApprovalDialog'
import { initMCPSync } from './stores/mcp-tool-store'
import { useWorkspaceStore } from './stores/workspace-store'
import { useShortcuts } from './hooks/use-shortcuts'
import type { ViewMode, SettingsSection } from './components/settings/SettingsNavRail'

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('chat')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('ai-providers')
  const deactivateWorkspace = useWorkspaceStore((s) => s.deactivateWorkspace)

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

  const openWorkspace = () => {
    setViewMode('workspace')
  }

  /** 从工作区或其他视图返回对话页 */
  const closeSettings = () => {
    // 离开工作区视图时，清除运行时的工作区激活状态
    // 工作区数据（workspaces）已持久化，但 activeWorkspaceId/openTabs 是运行时状态
    deactivateWorkspace()
    setViewMode('chat')
  }

  /** 是否显示全局侧边栏（仅对话模式下显示，工作区有自己的三栏布局） */
  const showSidebar = viewMode === 'chat'

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden select-none">
      {/* 自定义标题栏 - 替代 Electron 原生标题栏 */}
      <TitleBar />

      {/* 主内容区域 */}
      <div className="flex flex-1 min-h-0">
      {/* 侧边栏 - 对话和工作区模式下显示 */}
      {showSidebar && (
        <Sidebar
          viewMode={viewMode}
          onOpenSettings={openSettings}
          onOpenKnowledgeBase={openKnowledgeBase}
          onOpenWorkspace={openWorkspace}
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

      {/* 工作区：全局命令审批弹窗（覆盖在所有内容之上） */}
      <CommandApprovalDialog />
    </div>
  )
}
