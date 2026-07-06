import { X, FolderOpen, ArrowUpToLine, Brain, Wrench, Database, Clock } from 'lucide-react'
import type { AgentProfile } from '../../types'
import { SYSTEM_AGENT_TAGS } from '../../types'
import { useWorkspaceAgentStore } from '../../stores/workspace-agent-store'

interface AgentDetailDialogProps {
  agent: AgentProfile | null
  open: boolean
  onClose: () => void
}

export function AgentDetailDialog({ agent, open, onClose }: AgentDetailDialogProps) {
  const { promoteToGlobal } = useWorkspaceAgentStore()

  if (!open || !agent) return null

  const isWorkspaceAgent = agent.tags?.includes(SYSTEM_AGENT_TAGS.WORKSPACE)

  const handlePromoteToGlobal = () => {
    const promoted = promoteToGlobal(agent.id)
    if (promoted) {
      alert(`已将 Agent "${promoted.name}" 提升为全局 Agent`)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* 弹窗 */}
      <div className="relative w-full max-w-xl max-h-[80vh] bg-white dark:bg-surface-800 rounded-xl border border-surface-200/80 dark:border-surface-700/60 shadow-2xl overflow-hidden flex flex-col animate-scale-in">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200/60 dark:border-surface-700/40">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{agent.avatar || '🤖'}</span>
            <div>
              <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">{agent.name}</h3>
              {isWorkspaceAgent && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 mt-0.5">
                  <FolderOpen size={9} />
                  工作区专属
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-muted transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 描述 */}
          {agent.description && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">描述</h4>
              <p className="text-sm text-surface-800 dark:text-surface-200">{agent.description}</p>
            </div>
          )}

          {/* 系统提示词 */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
              <Brain size={12} />
              系统提示词
            </h4>
            <div className="bg-surface-50 dark:bg-surface-900 rounded-lg p-3 max-h-36 overflow-y-auto">
              <pre className="text-xs text-surface-700 dark:text-surface-300 whitespace-pre-wrap font-mono">
                {agent.systemPrompt || '(空)'}
              </pre>
            </div>
          </div>

          {/* 工具 */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
              <Wrench size={12} />
              启用工具（{agent.enabledToolIds.length}）
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {agent.enabledToolIds.length > 0
                ? agent.enabledToolIds.map((toolId) => (
                    <span
                      key={toolId}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 border border-surface-200/60 dark:border-surface-600/50 truncate max-w-[140px]"
                      title={toolId}
                    >
                      {toolId.split(':').pop() || toolId}
                    </span>
                  ))
                : <span className="text-xs text-muted">无</span>}
            </div>
          </div>

          {/* 策略配置 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                <Brain size={12} />
                规划策略
              </h4>
              <span className="text-sm text-surface-800 dark:text-surface-200">{agent.planningStrategy}</span>
            </div>
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                <Database size={12} />
                记忆
              </h4>
              <span className="text-sm text-surface-800 dark:text-surface-200">
                {agent.memoryConfig.longTermEnabled ? '长期记忆' : '仅对话'}
                {agent.memoryConfig.crossSession ? ' / 跨会话' : ''}
              </span>
            </div>
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                <Clock size={12} />
                最大步数
              </h4>
              <span className="text-sm text-surface-800 dark:text-surface-200">{agent.termination.maxSteps}</span>
            </div>
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">超时</h4>
              <span className="text-sm text-surface-800 dark:text-surface-200">
                {agent.termination.timeoutSeconds > 0 ? `${agent.termination.timeoutSeconds}s` : '不限制'}
              </span>
            </div>
          </div>

          {/* 标签 */}
          {agent.tags && agent.tags.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">标签</h4>
              <div className="flex flex-wrap gap-1.5">
                {agent.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 border border-surface-200/60 dark:border-surface-600/50"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-surface-200/60 dark:border-surface-700/40 bg-surface-50/50 dark:bg-surface-900/30">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-surface-300 dark:border-surface-600 text-muted hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            关闭
          </button>
          {isWorkspaceAgent && (
            <button
              onClick={handlePromoteToGlobal}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-accent-500 text-white hover:bg-accent-600 transition-colors"
            >
              <ArrowUpToLine size={14} />
              提升为全局 Agent
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
