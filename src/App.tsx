import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { MainArea } from './components/layout/MainArea'
import { TitleBar } from './components/layout/TitleBar'
import { CommandApprovalDialog } from './components/workspace/CommandApprovalDialog'
import { FileActionApprovalDialog } from './components/workspace/FileActionApprovalDialog'
import i18n, { getDefaultLanguage } from '@/i18n/config'
import { initMCPSync } from './stores/mcp-tool-store'
import { useWorkspaceStore } from './stores/workspace-store'
import { useConversationStore } from './stores/conversation-store'
import { useSkillStore } from './stores/skill-store'
import { useShortcuts } from './hooks/use-shortcuts'
import type { ViewMode, SettingsSection } from './components/settings/SettingsNavRail'

// 初始化 i18n
const initI18n = async () => {
  const defaultLang = getDefaultLanguage()
  if (i18n.language !== defaultLang) {
    await i18n.changeLanguage(defaultLang)
  }
}

// 应用启动时初始化
initI18n()

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('chat')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('ai-providers')
  /** 打开设置页时可选：直接进入指定 Agent / AI 源的编辑态 */
  const [settingsEditId, setSettingsEditId] = useState<string | undefined>()
  const deactivateWorkspace = useWorkspaceStore((s) => s.deactivateWorkspace)

  // 应用启动时初始化 MCP 工具同步（监听配置变更，自动刷新工具列表）
  useEffect(() => {
    initMCPSync()
  }, [])

  // ⚡ 应用启动时初始化消息数据（localStorage→IDB 迁移 + 加载当前对话消息）
  useEffect(() => {
    useConversationStore.getState().initializeMessages()
  }, [])

  // ⚡ 应用启动时从 IndexedDB 预加载 Skills，避免 list_skills 在未打开设置页时返回空列表
  useEffect(() => {
    void useSkillStore.getState().ensureSkillsLoaded()
  }, [])

  // 安全保障：当不在工作区模式时，确保 currentConversationId 不指向工作区对话
  // 解决退出工作区后对话区仍显示工作区对话的问题
  useEffect(() => {
    if (viewMode === 'workspace') return
    const convStore = useConversationStore.getState()
    const currentConv = convStore.currentConversationId
      ? convStore.conversations.find((c) => c.id === convStore.currentConversationId)
      : null
    if (currentConv?.workspaceId) {
      const nonWorkspaceConvs = convStore.conversations
        .filter((c) => !c.workspaceId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
      convStore.selectConversation(nonWorkspaceConvs[0]?.id ?? null)
    }
  }, [viewMode])

  // 快捷键桥接：将 store 中的快捷键配置注册到 Electron globalShortcut
  const openSettingsCb = useCallback(() => {
    setSettingsSection('ai-providers')
    setSettingsEditId(undefined)
    setViewMode('settings')
  }, [])
  useShortcuts({ openSettings: openSettingsCb })

  /** 打开设置页；可选传入 editId 以直接进入对应 Agent / AI 源编辑页 */
  const openSettings = (section: SettingsSection = 'ai-providers', editId?: string) => {
    setSettingsSection(section)
    setSettingsEditId(editId)
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
    if (viewMode === 'workspace') {
      // 离开工作区视图时，清除运行时的工作区激活状态
      // deactivateWorkspace 内部会自动将 currentConversationId 切换到非工作区对话
      deactivateWorkspace()
    }
    setSettingsEditId(undefined)
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
        settingsEditId={settingsEditId}
        onOpenSettings={openSettings}
        onCloseSettings={closeSettings}
        onOpenWorkspace={openWorkspace}
      />
      </div>

      {/* 工作区：全局命令审批弹窗（覆盖在所有内容之上） */}
      <CommandApprovalDialog />
      {/* 工作区：文件操作审批弹窗（阶段 1 新增，参考 ROO CODE Auto-Approve） */}
      <FileActionApprovalDialog />
    </div>
  )
}
