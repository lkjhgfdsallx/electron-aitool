import { Plus, PanelLeftClose, PanelLeft, FileText, Settings, Bot, Plug } from 'lucide-react'
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
      <div className="flex-shrink-0 w-12 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 flex flex-col items-center py-3 gap-2">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          title="展开侧边栏"
        >
          <PanelLeft size={18} />
        </button>
        <button
          onClick={() => createConversation()}
          className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          title="新建对话"
        >
          <Plus size={18} />
        </button>
        <button
          onClick={onOpenAgentManager}
          className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          title="Agent 管理"
        >
          <Bot size={18} />
        </button>
        <button
          onClick={onOpenPromptManager}
          className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          title="提示词管理"
        >
          <FileText size={18} />
        </button>
        <button
          onClick={onOpenMCP}
          className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          title="MCP 配置"
        >
          <Plug size={18} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 w-64 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">对话</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => createConversation()}
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            title="新建对话"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={onOpenAgentManager}
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            title="Agent 管理"
          >
            <Bot size={16} />
          </button>
          <button
            onClick={onOpenPromptManager}
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            title="提示词管理"
          >
            <FileText size={16} />
          </button>
          <button
            onClick={onOpenMCP}
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            title="MCP 配置"
          >
            <Plug size={16} />
          </button>
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            title="收起侧边栏"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 min-h-0">
        <ConversationList />
      </div>
    </div>
  )
}
