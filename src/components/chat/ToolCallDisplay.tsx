import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Wrench,
  CheckCircle,
  XCircle,
  Loader2,
  Clock
} from 'lucide-react'
import type { ToolCall } from '../../types'

interface ToolCallDisplayProps {
  toolCalls: ToolCall[]
}

const statusConfig = {
  pending: { icon: Clock, color: 'text-gray-400', dotColor: 'bg-gray-400', label: '等待中' },
  running: { icon: Loader2, color: 'text-blue-500 animate-spin', dotColor: 'bg-blue-500 animate-pulse', label: '执行中' },
  completed: { icon: CheckCircle, color: 'text-green-500', dotColor: 'bg-green-500', label: '完成' },
  error: { icon: XCircle, color: 'text-danger-500', dotColor: 'bg-danger-500', label: '错误' }
}

export function ToolCallDisplay({ toolCalls }: ToolCallDisplayProps) {
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    const next = new Set(expandedCalls)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setExpandedCalls(next)
  }

  if (!toolCalls || toolCalls.length === 0) return null

  return (
    <div className="mb-2 space-y-2 overflow-hidden">
      {toolCalls.map((tc) => {
        const isExpanded = expandedCalls.has(tc.id)
        const status = statusConfig[tc.status]
        const StatusIcon = status.icon

        return (
          <div
            key={tc.id}
            className="rounded-xl border border-surface-200/60 dark:border-surface-700/40 bg-surface-50/60 dark:bg-surface-800/30 overflow-hidden"
          >
            <button
              onClick={() => toggleExpand(tc.id)}
              className="flex items-center gap-2 w-full px-3 py-2 cursor-pointer hover:bg-surface-100/80 dark:hover:bg-surface-700/40 transition-colors"
            >
              <div className="w-6 h-6 rounded-md bg-accent-50 dark:bg-accent-950/30 flex items-center justify-center flex-shrink-0">
                <Wrench size={12} className="text-accent-500" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {tc.name}
              </span>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor} flex-shrink-0`} />
              <span className="text-xs text-muted">{status.label}</span>
              <div className="ml-auto flex-shrink-0">
                {isExpanded ? (
                  <ChevronDown size={14} className="text-muted" />
                ) : (
                  <ChevronRight size={14} className="text-muted" />
                )}
              </div>
            </button>

            <div
              className="overflow-hidden transition-all duration-300 ease-in-out"
              style={{ maxHeight: isExpanded ? '800px' : '0px', opacity: isExpanded ? 1 : 0 }}
            >
              <div className="px-3 pb-3 space-y-2 border-t border-surface-200/40 dark:border-surface-700/30 animate-fade-in">
                {/* 输入参数 */}
                <div>
                  <div className="text-xs font-medium text-muted mt-2 mb-1">
                    输入参数
                  </div>
                  <pre className="text-xs bg-surface-100 dark:bg-surface-800 rounded-lg p-2.5 font-mono overflow-x-auto">
                    {formatJSON(tc.arguments)}
                  </pre>
                </div>

                {/* 返回结果 */}
                {tc.result && (
                  <div>
                    <div className="text-xs font-medium text-muted mb-1">
                      返回结果
                    </div>
                    <pre className="text-xs bg-surface-100 dark:bg-surface-800 rounded-lg p-2.5 font-mono overflow-x-auto max-h-40 overflow-y-auto">
                      {formatJSON(tc.result)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function formatJSON(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
  }
}
