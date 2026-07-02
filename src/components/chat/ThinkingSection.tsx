import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronRight, Brain } from 'lucide-react'

interface ThinkingSectionProps {
  content: string
  /** 是否正在流式输出（思考中） */
  isStreaming?: boolean
  /** 默认是否展开 */
  defaultExpanded?: boolean
}

export function ThinkingSection({ content, isStreaming = false, defaultExpanded = false }: ThinkingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)

  if (!content) return null

  // 流式输出时，若用户没有手动上滑，则自动滚动到底部以展示最新内容
  useEffect(() => {
    if (!isStreaming || !isExpanded) return
    const el = scrollRef.current
    if (!el || userScrolledUpRef.current) return
    el.scrollTop = el.scrollHeight
  }, [content, isStreaming, isExpanded])

  // 流式状态变化时重置用户滚动标记
  useEffect(() => {
    if (!isStreaming) {
      userScrolledUpRef.current = false
    }
  }, [isStreaming])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    // 当用户滚动到接近底部时，恢复自动滚动；否则标记用户已上滑
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    userScrolledUpRef.current = !atBottom
  }

  return (
    <div className="mb-2 rounded-xl border border-surface-200/60 dark:border-surface-700/40 overflow-hidden bg-surface-50/60 dark:bg-surface-800/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-lg border-none bg-transparent hover:bg-surface-100 dark:hover:bg-surface-700/60 transition-all text-muted cursor-pointer"
      >
        <div className="w-5 h-5 rounded-md bg-accent-50 dark:bg-accent-950/30 flex items-center justify-center flex-shrink-0">
          <Brain size={12} className="text-accent-400" />
        </div>
        <span className="font-medium">思考过程</span>
        {isStreaming ? (
          <span className="inline-flex items-center gap-1 text-accent-500">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
            思考中...
          </span>
        ) : (
          <span className="text-muted/70">已完成</span>
        )}
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
        style={{ maxHeight: isExpanded ? '60vh' : '0px', opacity: isExpanded ? 1 : 0 }}
      >
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="mt-2 mx-3 mb-3 p-3 rounded-lg bg-surface-50/60 dark:bg-surface-800/30 border border-surface-200/40 dark:border-surface-700/30 max-h-[calc(60vh-2rem)] overflow-y-auto"
        >
          <div className="text-xs text-muted leading-relaxed whitespace-pre-wrap break-words">
            {content}
          </div>
        </div>
      </div>
    </div>
  )
}
