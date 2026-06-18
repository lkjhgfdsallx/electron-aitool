import { Plus, PanelLeftClose, PanelLeft, FileText, Bot, Plug, Settings, Keyboard, HelpCircle } from 'lucide-react'
import { ConversationList } from '../conversation/ConversationList'
import { useConversationStore } from '../../stores/conversation-store'
import { useSettingsStore } from '../../stores'

interface SidebarProps {
  onOpenPromptManager?: () => void
  onOpenAgentManager?: () => void
  onOpenMCP?: () => void
  onOpenSettings?: () => void
}

export function Sidebar({ onOpenPromptManager, onOpenAgentManager, onOpenMCP }: SidebarProps) {
  const { createConversation } = useConversationStore()
  const { sidebarCollapsed, toggleSidebar } = useSettingsStore()

  if (sidebarCollapsed) {
    return (
      <div className="flex-shrink-0 w-14 border-r border-surface-200 dark:border-surface-700/60 bg-surface-50 dark:bg-surface-950 flex flex-col items-center py-3 gap-1.5">
        <button
          onClick={toggleSidebar}
          className="p-2.5 rounded-xl hover:bg-surface-200 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
          title="展开侧边栏"
        >
          <PanelLeft size={18} />
        </button>

        {/* 新建对话 - 渐变按钮 */}
        <button
          onClick={() => createConversation()}
          className="mt-1 p-2.5 rounded-xl bg-gradient-brand text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95"
          title="新建对话"
        >
          <Plus size={18} />
        </button>

        <div className="w-8 my-1">
          <div className="divider-gradient" />
        </div>

        <button
          onClick={onOpenAgentManager}
          className="p-2.5 rounded-xl hover:bg-surface-200 dark:hover:bg-surface-800 text-gray-400 hover:text-accent-600 dark:hover:text-accent-400 transition-all"
          title="Agent 管理"
        >
          <Bot size={18} />
        </button>
        <button
          onClick={onOpenPromptManager}
          className="p-2.5 rounded-xl hover:bg-surface-200 dark:hover:bg-surface-800 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-all"
          title="提示词管理"
        >
          <FileText size={18} />
        </button>
        <button
          onClick={onOpenMCP}
          className="p-2.5 rounded-xl hover:bg-surface-200 dark:hover:bg-surface-800 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all"
          title="MCP 配置"
        >
          <Plug size={18} />
        </button>

        <div className="flex-1" />

        <button
          onClick={toggleSidebar}
          className="p-2.5 rounded-xl hover:bg-surface-200 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
          title="收起侧边栏"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 w-64 border-r border-surface-200 dark:border-surface-700/60 bg-surface-50 dark:bg-surface-950 flex flex-col animate-fade-in">
      {/* 品牌区 */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-brand shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
                <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" opacity="0.9" />
                <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-800 dark:text-gray-100 tracking-tight">AI Tool</h1>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">v1.0</p>
            </div>
          </div>
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
            title="收起侧边栏"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        {/* 新建对话按钮 */}
        <button
          onClick={() => createConversation()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-brand text-white text-sm font-medium shadow-sm hover:shadow-md transition-all hover:brightness-110 active:scale-[0.98]"
        >
          <Plus size={16} strokeWidth={2.5} />
          新建对话
        </button>
      </div>

      {/* 功能入口 */}
      <div className="px-3 py-1.5">
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenAgentManager}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-surface-200 dark:hover:bg-surface-800 hover:text-accent-600 dark:hover:text-accent-400 transition-all"
          >
            <Bot size={13} />
            <span>Agent</span>
          </button>
          <button
            onClick={onOpenPromptManager}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-surface-200 dark:hover:bg-surface-800 hover:text-primary-600 dark:hover:text-primary-400 transition-all"
          >
            <FileText size={13} />
            <span>提示词</span>
          </button>
          <button
            onClick={onOpenMCP}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-surface-200 dark:hover:bg-surface-800 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all"
          >
            <Plug size={13} />
            <span>MCP</span>
          </button>
        </div>
      </div>

      {/* 分隔线 */}
      <div className="px-4">
        <div className="divider-gradient" />
      </div>

      {/* 对话列表 */}
      <div className="flex-1 min-h-0">
        <ConversationList />
      </div>
    </div>
  )
}
