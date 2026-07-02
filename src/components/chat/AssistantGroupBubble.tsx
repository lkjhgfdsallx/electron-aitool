import { useState, useCallback, useMemo, memo } from 'react'
import {
  Copy,
  RotateCcw,
  Check,
  Bot,
  Forward,
  AlertTriangle
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
  /** 继续生成：在已有内容基础上让 AI 从断点继续输出 */
  onContinueGeneration?: (messageId: string) => void
}

/**
 * 将多轮工具调用产生的多条 assistant+tool 消息合并渲染为单个气泡
 * 用户看到的是一次完整的 AI 回复，而非多段碎片
 */
export const AssistantGroupBubble = memo(function AssistantGroupBubble({
  messages,
  showTimestamp = true,
  showTokenUsage = true,
  showAvatar = true,
  messageAlignment = 'left-right',
  onRegenerate,
  onContinueGeneration
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

  const justifyClass = (() => {
    switch (messageAlignment) {
      case 'all-right':
        return 'justify-end'
      case 'left-right':
      case 'all-left':
      case 'full-width':
      default:
        return ''
    }
  })()
  const bubbleClass = (() => {
    switch (messageAlignment) {
      case 'all-right':
        return 'max-w-[80%]'
      case 'left-right':
      case 'all-left':
      case 'full-width':
      default:
        return 'w-full'
    }
  })()

  return (
    <div className={`px-4 py-3 group animate-fade-in flex ${isError ? 'bg-danger-50/50 dark:bg-danger-950/20' : ''} ${justifyClass}`}>
      <div className={`flex gap-3 ${bubbleClass}`}>
      {/* 头像 */}
      {showAvatar && (
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
        <Bot size={16} className="text-white" />
      </div>
      )}

      {/* 内容区域 */}
      <div className="flex-1 min-w-0 overflow-hidden selection-boundary-parent">
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
            <ThinkingSection content={allReasoningContent} isStreaming={isStreaming} />
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

        {/* 截断消息提示 + 继续生成按钮 */}
        {(() => {
          const truncatedMsg = assistantMsgs.find(m => m.finishReason === 'abort' || m.finishReason === 'length')
          if (!truncatedMsg || isStreaming) return null
          return (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200/60 dark:border-blue-800/40">
              <AlertTriangle size={14} className="text-blue-500 flex-shrink-0" />
              <span className="text-xs text-blue-700 dark:text-blue-300 flex-1">
                {truncatedMsg.finishReason === 'length' ? '回复已达到最大长度限制，可以续写' : '回复被中断，可以继续生成'}
              </span>
              {onContinueGeneration && (
                <button
                  onClick={() => onContinueGeneration(truncatedMsg.id)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors shadow-sm"
                  title="继续生成"
                >
                  <Forward size={12} />
                  继续生成
                </button>
              )}
            </div>
          )
        })()}

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
    </div>
  )
}, (prevProps, nextProps) => {
  // 自定义比较：只在消息核心字段变化时重渲染
  if (prevProps.messages.length !== nextProps.messages.length) return false
  for (let i = 0; i < prevProps.messages.length; i++) {
    const prev = prevProps.messages[i]
    const next = nextProps.messages[i]
    if (
      prev.id !== next.id ||
      prev.content !== next.content ||
      prev.isStreaming !== next.isStreaming ||
      prev.isError !== next.isError ||
      prev.reasoningContent !== next.reasoningContent ||
      prev.tokenUsage !== next.tokenUsage ||
      prev.toolCalls !== next.toolCalls
    ) {
      return false
    }
  }
  return (
    prevProps.showTimestamp === nextProps.showTimestamp &&
    prevProps.showTokenUsage === nextProps.showTokenUsage &&
    prevProps.showAvatar === nextProps.showAvatar &&
    prevProps.messageAlignment === nextProps.messageAlignment &&
    prevProps.onRegenerate === nextProps.onRegenerate &&
    prevProps.onContinueGeneration === nextProps.onContinueGeneration
  )
})

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
