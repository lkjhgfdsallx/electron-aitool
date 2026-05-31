import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Bot, Zap, Settings2 } from 'lucide-react'
import { useAgentStore } from '../../stores/agent-store'
import type { AgentProfile } from '../../types'

interface AgentSelectorProps {
  selectedAgentId?: string
  onSelect: (agentId: string | undefined) => void
  onOpenAgentManager?: () => void
}

export function AgentSelector({ selectedAgentId, onSelect, onOpenAgentManager }: AgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { agents } = useAgentStore()

  const selectedAgent = agents.find((a) => a.id === selectedAgentId)
  const enabledAgents = agents.filter((a) => a.enabled)

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 触发按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {selectedAgent ? (
          <>
            <span className="text-base">{selectedAgent.avatar || '🤖'}</span>
            <span className="font-medium text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
              {selectedAgent.name}
            </span>
          </>
        ) : (
          <>
            <Zap size={14} className="text-gray-400" />
            <span className="text-gray-500">普通对话</span>
          </>
        )}
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
          {/* 普通对话选项 */}
          <button
            onClick={() => {
              onSelect(undefined)
              setIsOpen(false)
            }}
            className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
              !selectedAgentId ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            <Zap size={14} className={!selectedAgentId ? 'text-primary-500' : 'text-gray-400'} />
            <span>普通对话</span>
            {!selectedAgentId && (
              <span className="ml-auto text-xs text-primary-500">✓</span>
            )}
          </button>

          {/* 分隔线 */}
          {enabledAgents.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-700" />
          )}

          {/* Agent 列表 */}
          {enabledAgents.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-gray-400">
              暂无可用 Agent
            </div>
          ) : (
            enabledAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => {
                  onSelect(agent.id)
                  setIsOpen(false)
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  selectedAgentId === agent.id ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <span className="text-base">{agent.avatar || '🤖'}</span>
                <div className="flex-1 min-w-0 text-left">
                  <div className="font-medium truncate">{agent.name}</div>
                  {agent.description && (
                    <div className="text-xs text-gray-400 truncate">{agent.description}</div>
                  )}
                </div>
                {selectedAgentId === agent.id && (
                  <span className="text-xs text-primary-500">✓</span>
                )}
              </button>
            ))
          )}

          {/* 管理入口 */}
          {onOpenAgentManager && (
            <>
              <div className="border-t border-gray-100 dark:border-gray-700" />
              <button
                onClick={() => {
                  onOpenAgentManager()
                  setIsOpen(false)
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                <Settings2 size={14} />
                <span>管理 Agent</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
