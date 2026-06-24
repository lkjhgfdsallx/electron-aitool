import { Database, Trash2 } from 'lucide-react'
import { useConversationStore } from '../../stores/conversation-store'

interface DataManagementSectionProps {
  onNavigateToSection?: (section: string) => void
}

export function DataManagementSection({ onNavigateToSection }: DataManagementSectionProps) {
  const { clearMessages, conversations } = useConversationStore()

  const handleClearAll = () => {
    if (confirm('确定要清除所有对话数据吗？此操作不可恢复。')) {
      for (const conv of conversations) {
        clearMessages(conv.id)
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <Database size={20} className="text-accent-500" />
          数据管理
        </h2>
        <p className="text-sm text-muted mt-1">
          管理应用数据，包括对话记录和知识库
        </p>
      </div>

      {/* 数据操作 */}
      <div className="space-y-3">
        {/* 知识库入口 */}
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300">知识库管理</h3>
              <p className="text-xs text-muted mt-0.5">
                查看和管理已上传的知识库文件
              </p>
            </div>
            <button
              onClick={() => onNavigateToSection?.('knowledge-base')}
              className="flex items-center gap-2 px-4 py-2 text-sm text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800/60 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
            >
              <Database size={14} /> 管理知识库
            </button>
          </div>
        </div>

        {/* 危险操作 */}
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-danger-200/60 dark:border-danger-800/30 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-danger-600 dark:text-danger-400">清除对话数据</h3>
              <p className="text-xs text-muted mt-0.5">
                删除所有对话的消息记录，共 {conversations.length} 个对话
              </p>
            </div>
            <button
              onClick={handleClearAll}
              className="flex items-center gap-2 px-4 py-2 text-sm text-danger-500 border border-danger-200 dark:border-danger-800/60 rounded-xl hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-colors"
            >
              <Trash2 size={14} /> 清除所有对话数据
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
