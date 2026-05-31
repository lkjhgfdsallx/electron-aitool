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
  pending: { icon: Clock, color: 'text-gray-500', label: '等待中' },
  running: { icon: Loader2, color: 'text-blue-500 animate-spin', label: '执行中' },
  completed: { icon: CheckCircle, color: 'text-green-500', label: '完成' },
  error: { icon: XCircle, color: 'text-red-500', label: '错误' }
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
    <div className="mb-2 space-y-1">
      {toolCalls.map((tc) => {
        const isExpanded = expandedCalls.has(tc.id)
        const status = statusConfig[tc.status]
        const StatusIcon = status.icon

        return (
          <div
            key={tc.id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800/50"
          >
            <button
              onClick={() => toggleExpand(tc.id)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              <Wrench size={14} className="text-gray-500" />
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {tc.name}
              </span>
              <StatusIcon size={14} className={status.color} />
              <span className="text-xs text-gray-500">{status.label}</span>
              <div className="ml-auto">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 space-y-2 border-t border-gray-200 dark:border-gray-700">
                {/* 输入参数 */}
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-2 mb-1">
                    输入参数
                  </div>
                  <pre className="text-xs bg-gray-100 dark:bg-gray-900 rounded p-2 overflow-x-auto">
                    {formatJSON(tc.arguments)}
                  </pre>
                </div>

                {/* 返回结果 */}
                {tc.result && (
                  <div>
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      返回结果
                    </div>
                    <pre className="text-xs bg-gray-100 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
                      {formatJSON(tc.result)}
                    </pre>
                  </div>
                )}
              </div>
            )}
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
