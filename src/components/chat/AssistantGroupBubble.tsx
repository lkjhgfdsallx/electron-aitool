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

  return (
    <div className={`flex gap-3 px-4 py-3 group ${isError ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
      {/* 头像 */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
        <Bot size={16} className="text-white" />
      </div>

      {/* 内容区域 */}
      <div className="flex-1 min-w-0 selection-boundary-parent">
        {/* 头部信息 */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            AI
          </span>
          {showTimestamp && (
            <span className="text-xs text-gray-400">
              {formatTime(timestamp)}
            </span>
          )}
          {showTokenUsage && totalTokens > 0 && (
            <span className="text-xs text-gray-400">
              {totalTokens} tokens
            </span>
          )}
          {isStreaming && (
            <span className="text-xs text-blue-500 animate-pulse">生成中...</span>
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
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              title="复制"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? '已复制' : '复制'}
            </button>
            {onRegenerate && regenerateTargetId && (
              <button
                onClick={() => onRegenerate(regenerateTargetId)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
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
