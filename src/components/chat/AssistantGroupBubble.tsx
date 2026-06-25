import { useState, useCallback, useMemo } from 'react'
import {
  Copy,
  RotateCcw,
  Check,
  Bot
} from 'lucide-react'
import { MarkdownRenderer } from '../ui/MarkdownRenderer'
import { SelectionBoundary } from '../ui/SelectionBoundary'
import { ThinkingSection } from './ThinkingSection'
import { ToolCallDisplay } from './ToolCallDisplay'
import type { Message, ToolCall } from '../../types'

interface AssistantGroupBubbleProps {
  /** 该组包含的所有消息（assistant + tool，按时间顺序） */
  messages: Message[]
  showTimestamp?: boolean
  showTokenUsage?: boolean
  showAvatar?: boolean
  messageAlignment?: 'left-right' | 'all-left' | 'all-right' | 'full-width'
  onRegenerate?: (messageId: string) => void
}

/**
 * 将多轮工具调用产生的多条 assistant+tool 消息合并渲染为单个气泡
 * 用户看到的是一次完整的 AI 回复，而非多段碎片
 */
export function AssistantGroupBubble({
  messages,
  showTimestamp = true,
  showTokenUsage = true,
  showAvatar = true,
  messageAlignment = 'left-right',
  onRegenerate
}: AssistantGroupBubbleProps) {
  const [copied, setCopied] = useState(false)

  // 分离 assistant 和 tool 消息
  const assistantMsgs = useMemo(
    () => messages.filter((m) => m.role === 'assistant'),
    [messages]
  )

  // 合并所有工具调用（按出现顺序）
  const allToolCalls = useMemo((): ToolCall[] => {
    const calls: ToolCall[] = []
    for (const msg of assistantMsgs) {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        calls.push(...msg.toolCalls)
      }
    }
    return calls
  }, [assistantMsgs])

  // 合并所有推理内容
  const allReasoningContent = useMemo((): string => {
    return assistantMsgs
      .map((m) => m.reasoningContent ?? '')
      .filter(Boolean)
      .join('\n\n')
  }, [assistantMsgs])

  // 最终文本内容：取最后一条有内容的 assistant 消息
  const finalContent = useMemo((): string => {
    for (let i = assistantMsgs.length - 1; i >= 0; i--) {
      const content = assistantMsgs[i].content?.trim()
      if (content) return content
    }
    return ''
  }, [assistantMsgs])

  // 是否有任何内容正在流式输出
  const isStreaming = useMemo(
    () => messages.some((m) => m.isStreaming),
    [messages]
  )

  // 是否有错误
  const isError = useMemo(
    () => assistantMsgs.some((m) => m.isError),
    [assistantMsgs]
  )

  // 合并 token 用量
  const totalTokens = useMemo(() => {
    let total = 0
    for (const msg of assistantMsgs) {
      if (msg.tokenUsage) {
        total += msg.tokenUsage.totalTokens
      }
    }
    return total
  }, [assistantMsgs])

  // 时间戳：取第一条消息的时间
  const timestamp = messages[0]?.timestamp ?? Date.now()

  // 用于重新生成的消息 ID：取第一条 assistant 消息
  const regenerateTargetId = assistantMsgs[0]?.id

  // 复制全部内容
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(finalContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [finalContent])

  const alignmentClass = (() => {
    switch (messageAlignment) {
      case 'all-right': return 'ml-auto'
      case 'full-width': return 'w-full'
      case 'left-right':
      case 'all-left':
      default:
        return ''
    }
  })()

  return (
    <div className={`flex gap-3 px-4 py-3 group animate-fade-in ${isError ? 'bg-danger-50/50 dark:bg-danger-950/20' : ''} ${alignmentClass === 'w-full' ? 'w-full' : alignmentClass}`}>
      {/* 头像 */}
      {showAvatar && (
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
        <Bot size={16} className="text-white" />
      </div>
      )}

      {/* 内容区域 */}
      <div className="flex-1 min-w-0 selection-boundary-parent">
        {/* 头部信息 */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            AI
          </span>
          {showTimestamp && (
            <span className="text-xs text-muted">
              {formatTime(timestamp)}
            </span>
          )}
          {showTokenUsage && totalTokens > 0 && (
            <span className="text-xs text-muted">
              {totalTokens} tokens
            </span>
          )}
          {isStreaming && (
            <span className="inline-flex items-center gap-1 text-xs text-accent-500"><span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />思考中...</span>
          )}
        </div>

        {/* 思考过程 */}
        {allReasoningContent && (
          <SelectionBoundary>
            <ThinkingSection content={allReasoningContent} />
          </SelectionBoundary>
        )}

        {/* 工具调用（合并展示） */}
        {allToolCalls.length > 0 && (
          <SelectionBoundary>
            <ToolCallDisplay toolCalls={allToolCalls} />
          </SelectionBoundary>
        )}

        {/* 最终文本内容 */}
        {finalContent && (
          <SelectionBoundary>
            <MarkdownRenderer content={finalContent} />
          </SelectionBoundary>
        )}

        {/* 操作按钮 */}
        {!isStreaming && (
          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 text-xs text-muted hover:text-gray-700 dark:hover:text-gray-300 rounded-md hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
              title="复制"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? '已复制' : '复制'}
            </button>
            {onRegenerate && regenerateTargetId && (
              <button
                onClick={() => onRegenerate(regenerateTargetId)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-muted hover:text-gray-700 dark:hover:text-gray-300 rounded-md hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
                title="重新生成"
              >
                <RotateCcw size={12} />
                重新生成
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
