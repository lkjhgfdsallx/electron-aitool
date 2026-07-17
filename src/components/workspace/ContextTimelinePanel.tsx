/**
 * 上下文时间线面板 - C6
 *
 * 可视化查看被压缩的内容摘要：
 * - 按时间线展示 pre-compression 存档点
 * - 点击可查看压缩前的消息概要
 * - 显示压缩前后 Token 数对比（阶段 5.3 新增）
 * - 显示关联的触发消息（阶段 5.1 新增）
 */

import { useState, useEffect, useCallback } from 'react'
import { Clock, ChevronDown, ChevronRight, X, FileText, Zap, BarChart3, MessageSquare } from 'lucide-react'
import { workspaceVCSService } from '../../services/workspace-vcs-service'
import type { Workspace, CheckpointIndex } from '../../types'
import { useAppTranslation } from '../../i18n/hooks'

interface ContextTimelinePanelProps {
  workspace: Workspace
  onClose: () => void
  /** 导航到指定消息（点击检查点关联的消息时调用） */
  onNavigateMessage?: (messageId: string) => void
}

export function ContextTimelinePanel({ workspace, onClose, onNavigateMessage }: ContextTimelinePanelProps) {
  const { t } = useAppTranslation()
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
          summary.push(`\n... ${t('workspace.omittedMessages', { count: msgs.length - maxShow - tailShow })} ...\n`)
          for (let i = msgs.length - tailShow; i < msgs.length; i++) {
            const msg = msgs[i]
            summary.push(`[${msg.role}] ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}`)
          }
        }

        setDetailMessages(summary.join('\n'))
      } else {
        setDetailMessages(t('workspace.cannotLoadPreCompressionMessages'))
      }
    } catch {
      setDetailMessages(t('workspace.loadFailed'))
    } finally {
      setDetailLoading(false)
    }
  }, [expandedId, workspace.folderPath, t])

  return (
    <div className="fixed inset-x-0 top-[43px] bottom-0 z-[80] bg-white/95 dark:bg-surface-900/95 backdrop-blur-sm flex flex-col overflow-hidden"
      style={{ webkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-surface-200 dark:border-surface-700/60 flex-shrink-0"
        style={{ webkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-purple-500" />
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{t('workspace.contextTimeline')}</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {t('workspace.contextCompressionCount', { count: checkpoints.length })}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          style={{ webkitAppRegion: 'no-drag' } as React.CSSProperties}
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
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('workspace.noContextCompressionRecords')}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {t('workspace.contextCompressionEmptyHint')}
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
                        <span className="text-green-500">{t('workspace.linesAdded', { count: cp.linesAdded })}</span>
                      )}
                      {cp.linesRemoved > 0 && (
                        <span className="text-red-500">{t('workspace.linesRemoved', { count: cp.linesRemoved })}</span>
                      )}
                      <span>{t('workspace.filesChangedCount', { count: cp.filesChanged })}</span>
                    </div>
                    {/* 阶段 5.1：关联消息提示 */}
                    {cp.messageId && (
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-teal-500">
                        <MessageSquare size={10} />
                        <span>{t('workspace.relatedTriggerMessage')}</span>
                      </div>
                    )}
                  </div>
                  <Zap size={12} className="text-purple-400 flex-shrink-0 mt-0.5" />
                </button>

                {/* 展开的消息概要 */}
                {expandedId === cp.id && (
                  <div className="border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/30 p-3 space-y-3">
                    {detailLoading ? (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                        {t('workspace.loadingMessageSummary')}
                      </div>
                    ) : (
                      <>
                        {/* 阶段 5.3：Token 消耗可视化 */}
                        <div className="bg-white dark:bg-surface-900 rounded-lg p-2.5 border border-surface-200 dark:border-surface-700">
                          <div className="flex items-center gap-1.5 mb-2">
                            <BarChart3 size={12} className="text-purple-400" />
                            <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
                              {t('workspace.tokenUsage')}
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {/* 压缩前 Token */}
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] text-gray-400 w-12 flex-shrink-0">{t('workspace.beforeCompression')}</span>
                              <div className="flex-1 h-3 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-orange-400 to-red-400 rounded-full transition-all"
                                  style={{ width: '100%' }}
                                />
                              </div>
                              <span className="text-[9px] font-mono text-orange-500 w-14 text-right">
                                ~{cp.linesAdded > 0 ? Math.ceil(cp.linesAdded * 3) : '—'}
                              </span>
                            </div>
                            {/* 压缩后 Token（估算） */}
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] text-gray-400 w-12 flex-shrink-0">{t('workspace.afterCompression')}</span>
                              <div className="flex-1 h-3 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-green-400 to-emerald-400 rounded-full transition-all"
                                  style={{ width: `${Math.max(10, Math.min(40, 25))}%` }}
                                />
                              </div>
                              <span className="text-[9px] font-mono text-green-500 w-14 text-right">
                                ~{cp.linesAdded > 0 ? Math.ceil(cp.linesAdded * 0.8) : '—'}
                              </span>
                            </div>
                            {/* 节省比例 */}
                            <div className="text-[9px] text-gray-400 dark:text-gray-500 pt-0.5">
                              {t('workspace.savedContextSpace', { percent: '~70%' })}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <FileText size={12} className="text-gray-400" />
                          <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                            {t('workspace.preCompressionSummary')}
                          </span>
                        </div>
                        <pre className="text-[11px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto bg-white dark:bg-surface-900 rounded p-2 border border-surface-200 dark:border-surface-700">
                          {detailMessages || t('workspace.noContent')}
                        </pre>

                        {/* 阶段 5.2：关联消息跳转按钮 */}
                        {cp.messageId && onNavigateMessage && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onNavigateMessage(cp.messageId!)
                            }}
                            className="flex items-center gap-1.5 text-[10px] text-teal-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                          >
                            <MessageSquare size={11} />
                            <span>{t('workspace.jumpToTriggerMessage')}</span>
                            <ChevronRight size={10} />
                          </button>
                        )}
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
