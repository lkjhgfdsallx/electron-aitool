/**
 * 上下文时间线面板 - C6
 *
 * 可视化查看被压缩的内容摘要：
 * - 按时间线展示 pre-compression 存档点
 * - 点击可查看压缩前的消息概要
 * - 显示压缩前后 Token 数对比
 */

import { useState, useEffect, useCallback } from 'react'
import { Clock, ChevronDown, ChevronRight, X, FileText, Zap } from 'lucide-react'
import { workspaceVCSService } from '../../services/workspace-vcs-service'
import type { Workspace, CheckpointIndex } from '../../types'

interface ContextTimelinePanelProps {
  workspace: Workspace
  onClose: () => void
}

export function ContextTimelinePanel({ workspace, onClose }: ContextTimelinePanelProps) {
  const [checkpoints, setCheckpoints] = useState<CheckpointIndex[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailMessages, setDetailMessages] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // 加载 pre-compression 类型的存档点
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const result = await workspaceVCSService.listCheckpoints(workspace.folderPath)
        if (!cancelled) {
          // 只显示 pre-compression 类型的存档点
          const compressionCheckpoints = (Array.isArray(result) ? result : [])
            .filter((cp) => cp.type === 'pre-compression')
            .sort((a, b) => b.createdAt - a.createdAt)
          setCheckpoints(compressionCheckpoints)
        }
      } catch (err) {
        console.warn('[ContextTimelinePanel] 加载存档点失败:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [workspace.folderPath])

  // 查看压缩前消息概要
  const handleViewDetail = useCallback(async (checkpointId: string) => {
    if (expandedId === checkpointId) {
      setExpandedId(null)
      setDetailMessages(null)
      return
    }

    setExpandedId(checkpointId)
    setDetailLoading(true)
    setDetailMessages(null)

    try {
      const messages = await workspaceVCSService.loadMessagesBeforeCompression(
        workspace.folderPath,
        checkpointId
      )
      if (messages && Array.isArray(messages)) {
        const msgs = messages as Array<{ role: string; content: string }>
        // 生成摘要：显示前 5 条和后 2 条消息
        const summary: string[] = []
        const maxShow = 5
        const tailShow = 2

        if (msgs.length <= maxShow + tailShow) {
          for (const msg of msgs) {
            summary.push(`[${msg.role}] ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}`)
          }
        } else {
          for (let i = 0; i < maxShow; i++) {
            const msg = msgs[i]
            summary.push(`[${msg.role}] ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}`)
          }
          summary.push(`\n... 省略 ${msgs.length - maxShow - tailShow} 条消息 ...\n`)
          for (let i = msgs.length - tailShow; i < msgs.length; i++) {
            const msg = msgs[i]
            summary.push(`[${msg.role}] ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}`)
          }
        }

        setDetailMessages(summary.join('\n'))
      } else {
        setDetailMessages('（无法加载压缩前消息）')
      }
    } catch {
      setDetailMessages('（加载失败）')
    } finally {
      setDetailLoading(false)
    }
  }, [expandedId, workspace.folderPath])

  return (
    <div className="absolute inset-0 z-20 bg-white/95 dark:bg-surface-900/95 backdrop-blur-sm flex flex-col overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-surface-200 dark:border-surface-700/60 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-purple-500" />
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">上下文时间线</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {checkpoints.length} 次压缩
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : checkpoints.length === 0 ? (
          <div className="text-center py-12">
            <Clock size={32} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">尚无上下文压缩记录</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              当对话上下文超过 Token 限制时，系统会自动压缩并保存存档点
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {checkpoints.map((cp) => (
              <div
                key={cp.id}
                className="border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden"
              >
                {/* 存档点头部 */}
                <button
                  onClick={() => handleViewDetail(cp.id)}
                  className="w-full flex items-start gap-3 p-3 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors text-left"
                >
                  <div className="mt-0.5">
                    {expandedId === cp.id ? (
                      <ChevronDown size={14} className="text-gray-400" />
                    ) : (
                      <ChevronRight size={14} className="text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                        {cp.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500">
                      <span>{new Date(cp.createdAt).toLocaleString('zh-CN')}</span>
                      {cp.linesAdded > 0 && (
                        <span className="text-green-500">+{cp.linesAdded} 行</span>
                      )}
                      {cp.linesRemoved > 0 && (
                        <span className="text-red-500">-{cp.linesRemoved} 行</span>
                      )}
                      <span>{cp.filesChanged} 个文件</span>
                    </div>
                  </div>
                  <Zap size={12} className="text-purple-400 flex-shrink-0 mt-0.5" />
                </button>

                {/* 展开的消息概要 */}
                {expandedId === cp.id && (
                  <div className="border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/30 p-3">
                    {detailLoading ? (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                        加载消息概要...
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 mb-2">
                          <FileText size={12} className="text-gray-400" />
                          <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                            压缩前消息概要
                          </span>
                        </div>
                        <pre className="text-[11px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto bg-white dark:bg-surface-900 rounded p-2 border border-surface-200 dark:border-surface-700">
                          {detailMessages || '（无内容）'}
                        </pre>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
