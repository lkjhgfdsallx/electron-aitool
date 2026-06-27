/**
 * 上下文压缩指示组件
 *
 * 在消息流中显示，标记上下文已被压缩的位置。
 * 提供"查看被压缩内容"的链接，点击后从存档点加载历史消息。
 */

import { useState, useCallback } from 'react'
import { workspaceVCSService } from '../../services/workspace-vcs-service'
import { useWorkspaceStore } from '../../stores/workspace-store'

// ---- 组件 ----

interface CompressionIndicatorProps {
  /** 压缩发生时关联的存档点 ID */
  checkpointId: string
  /** 压缩时间 */
  compressedAt: number
  /** 被压缩的消息数量 */
  compressedMessageCount?: number
  /** 压缩前的 Token 数 */
  tokensBefore?: number
  /** 压缩后的 Token 数 */
  tokensAfter?: number
}

export function CompressionIndicator({
  checkpointId,
  compressedAt,
  compressedMessageCount,
  tokensBefore,
  tokensAfter,
}: CompressionIndicatorProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)

  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [loadedMessages, setLoadedMessages] = useState<unknown[] | null>(null)

  // 加载压缩前的消息历史
  const handleViewCompressed = useCallback(async () => {
    if (!workspace) return
    if (loadedMessages) {
      setIsExpanded(!isExpanded)
      return
    }

    setIsLoading(true)
    try {
      const messages = await workspaceVCSService.loadMessagesBeforeCompression(
        workspace.folderPath,
        checkpointId,
      )
      if (messages) {
        setLoadedMessages(messages)
        setIsExpanded(true)
      }
    } catch (err) {
      console.error('[CompressionIndicator] 加载压缩内容失败:', err)
    } finally {
      setIsLoading(false)
    }
  }, [workspace, checkpointId, loadedMessages, isExpanded])

  const time = new Date(compressedAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="my-3">
      {/* 压缩标记线 */}
      <div className="flex items-center gap-3 px-4">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-300 dark:via-cyan-700 to-transparent" />
        <button
          onClick={handleViewCompressed}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 transition-colors text-xs"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {isLoading ? '加载中...' : '上下文已压缩'}
          {compressedMessageCount && (
            <span className="text-[10px] text-cyan-500 dark:text-cyan-500">
              ({compressedMessageCount} 条消息)
            </span>
          )}
          <span className="text-[10px] text-cyan-400 dark:text-cyan-600">{time}</span>
        </button>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-300 dark:via-cyan-700 to-transparent" />
      </div>

      {/* 统计信息 */}
      {(tokensBefore || tokensAfter) && (
        <div className="flex items-center justify-center gap-3 mt-1.5 text-[10px] text-surface-400 dark:text-surface-500">
          {tokensBefore && <span>压缩前: {tokensBefore.toLocaleString()} tokens</span>}
          {tokensBefore && tokensAfter && (
            <span className="text-cyan-500">
              ↓ {Math.round((1 - tokensAfter / tokensBefore) * 100)}%
            </span>
          )}
          {tokensAfter && <span>压缩后: {tokensAfter.toLocaleString()} tokens</span>}
        </div>
      )}

      {/* 展开的压缩内容 */}
      {isExpanded && loadedMessages && (
        <div className="mx-4 mt-2 p-3 rounded-lg bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800 max-h-60 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-cyan-700 dark:text-cyan-300">
              压缩前的消息历史（共 {loadedMessages.length} 条）
            </span>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-xs text-cyan-500 hover:text-cyan-700 dark:hover:text-cyan-300"
            >
              收起
            </button>
          </div>
          <div className="space-y-1.5">
            {loadedMessages.map((msg, i) => {
              const m = msg as { role?: string; content?: string }
              return (
                <div key={i} className="text-xs text-surface-600 dark:text-surface-300">
                  <span className={`font-medium ${
                    m.role === 'user' ? 'text-blue-500' :
                    m.role === 'assistant' ? 'text-emerald-500' :
                    'text-surface-400'
                  }`}>
                    {m.role === 'user' ? '用户' : m.role === 'assistant' ? 'AI' : m.role ?? '?'}:
                  </span>
                  <span className="ml-1 line-clamp-2">
                    {typeof m.content === 'string' ? m.content.slice(0, 200) : '[非文本内容]'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
