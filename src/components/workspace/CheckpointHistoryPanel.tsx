/**
 * 存档历史面板组件
 *
 * 侧边面板形式展示所有存档点列表，
 * 支持按类型筛选、查看详情、还原操作。
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { workspaceVCSService } from '../../services/workspace-vcs-service'
import type { CheckpointIndex, CheckpointDetail, CheckpointType } from '../../types'

// ---- 筛选选项 ----

type FilterType = 'all' | CheckpointType

const FILTER_OPTIONS: Array<{ value: FilterType; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'auto', label: '自动' },
  { value: 'manual', label: '手动' },
  { value: 'pre-command', label: '命令前' },
  { value: 'pre-restore', label: '还原前' },
  { value: 'pre-compression', label: '压缩前' },
]

// ---- 存档类型样式 ----

const TYPE_STYLES: Record<string, { label: string; icon: string; color: string }> = {
  auto: { label: '自动', icon: '⏱', color: 'text-blue-500' },
  manual: { label: '手动', icon: '📌', color: 'text-violet-500' },
  'pre-command': { label: '命令前', icon: '⚡', color: 'text-amber-500' },
  'pre-restore': { label: '还原前', icon: '↩', color: 'text-orange-500' },
  'pre-compression': { label: '压缩前', icon: '📦', color: 'text-cyan-500' },
}

// ---- 格式化时间 ----

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  if (isToday) return `今天 ${time}`
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString()
  if (isYesterday) return `昨天 ${time}`
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ---- 组件 ----

interface CheckpointHistoryPanelProps {
  open: boolean
  onClose: () => void
}

export function CheckpointHistoryPanel({ open, onClose }: CheckpointHistoryPanelProps) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const checkpointIndex = useWorkspaceStore((s) => s.checkpointIndex)
  const isLoadingCheckpoints = useWorkspaceStore((s) => s.isLoadingCheckpoints)

  const [filter, setFilter] = useState<FilterType>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CheckpointDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)

  // 筛选存档点
  const filteredCheckpoints = useMemo(() => {
    if (filter === 'all') return checkpointIndex
    return checkpointIndex.filter((cp) => cp.type === filter)
  }, [checkpointIndex, filter])

  // 加载详情
  const loadDetail = useCallback(async (checkpointId: string) => {
    if (!workspace) return
    setIsLoadingDetail(true)
    setSelectedId(checkpointId)
    setShowRestoreConfirm(false)

    try {
      const result = await workspaceVCSService.getCheckpointDetail(workspace.folderPath, checkpointId)
      setDetail(result)
    } catch (err) {
      console.error('[CheckpointHistoryPanel] 加载详情失败:', err)
      setDetail(null)
    } finally {
      setIsLoadingDetail(false)
    }
  }, [workspace])

  // 还原
  const handleRestore = useCallback(async () => {
    if (!workspace || !selectedId) return
    setIsRestoring(true)

    try {
      const result = await workspaceVCSService.restoreToCheckpoint(
        workspace.folderPath,
        selectedId,
        workspace.id,
      )
      if (result.success) {
        setShowRestoreConfirm(false)
        // 还原成功后关闭面板
        onClose()
      } else {
        console.error('[CheckpointHistoryPanel] 还原失败:', result.error)
      }
    } catch (err) {
      console.error('[CheckpointHistoryPanel] 还原异常:', err)
    } finally {
      setIsRestoring(false)
    }
  }, [workspace, selectedId, onClose])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || !workspace) return null

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* 面板 */}
      <div className="relative w-full max-w-md bg-white dark:bg-surface-900 shadow-2xl border-l border-surface-200 dark:border-surface-700 flex flex-col animate-slide-in-right">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-700">
          <div>
            <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">存档历史</h2>
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              {workspace.name} · {checkpointIndex.length} 个存档点
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 筛选栏 */}
        <div className="flex items-center gap-1 px-5 py-3 border-b border-surface-200 dark:border-surface-700 overflow-x-auto">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                filter === option.value
                  ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                  : 'text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="flex-1 flex min-h-0">
          {/* 左侧列表 */}
          <div className={`${selectedId ? 'w-1/2' : 'w-full'} border-r border-surface-200 dark:border-surface-700 overflow-y-auto transition-all`}>
            {isLoadingCheckpoints ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredCheckpoints.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-surface-400 dark:text-surface-500">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <p className="text-xs mt-2">暂无存档点</p>
              </div>
            ) : (
              <div className="divide-y divide-surface-100 dark:divide-surface-800">
                {filteredCheckpoints.map((cp) => {
                  const style = TYPE_STYLES[cp.type] ?? TYPE_STYLES.auto
                  const isSelected = selectedId === cp.id

                  return (
                    <button
                      key={cp.id}
                      onClick={() => loadDetail(cp.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors ${
                        isSelected ? 'bg-teal-50/50 dark:bg-teal-950/20 border-l-2 border-teal-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs">{style.icon}</span>
                        <span className={`text-[10px] font-medium ${style.color}`}>{style.label}</span>
                        <span className="text-[10px] text-surface-400 dark:text-surface-500 ml-auto">
                          {formatTime(cp.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-surface-700 dark:text-surface-300 mt-1 line-clamp-2">
                        {cp.description}
                      </p>
                      {cp.filesChanged > 0 && (
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-surface-400 dark:text-surface-500">
                          <span>{cp.filesChanged} 文件</span>
                          {cp.linesAdded > 0 && <span className="text-emerald-500">+{cp.linesAdded}</span>}
                          {cp.linesRemoved > 0 && <span className="text-red-500">-{cp.linesRemoved}</span>}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 右侧详情 */}
          {selectedId && (
            <div className="w-1/2 overflow-y-auto">
              {isLoadingDetail ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : detail ? (
                <div className="p-4 space-y-4">
                  {/* 基本信息 */}
                  <div>
                    <h3 className="text-xs font-semibold text-surface-700 dark:text-surface-300 mb-2">存档信息</h3>
                    <div className="space-y-1.5 text-xs text-surface-600 dark:text-surface-400">
                      <div className="flex justify-between">
                        <span>ID</span>
                        <span className="font-mono text-[10px]">{detail.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>类型</span>
                        <span>{TYPE_STYLES[detail.metadata.type]?.label ?? detail.metadata.type}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>时间</span>
                        <span>{formatTime(detail.metadata.createdAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>文件数</span>
                        <span>{detail.metadata.filesChanged}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>行变化</span>
                        <span>
                          <span className="text-emerald-500">+{detail.metadata.linesAdded}</span>
                          {' / '}
                          <span className="text-red-500">-{detail.metadata.linesRemoved}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 描述 */}
                  <div>
                    <h3 className="text-xs font-semibold text-surface-700 dark:text-surface-300 mb-1.5">描述</h3>
                    <p className="text-xs text-surface-600 dark:text-surface-400 bg-surface-50 dark:bg-surface-800/80 rounded-md p-2.5">
                      {detail.metadata.description}
                    </p>
                  </div>

                  {/* 变更文件列表 */}
                  {detail.fileChanges && detail.fileChanges.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-surface-700 dark:text-surface-300 mb-1.5">
                        变更文件 ({detail.fileChanges.length})
                      </h3>
                      <div className="space-y-1">
                        {detail.fileChanges.map((fc, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-surface-50 dark:bg-surface-800/80 text-xs"
                          >
                            <span className={`w-4 text-center font-bold ${
                              fc.changeType === 'added' ? 'text-emerald-500' :
                              fc.changeType === 'deleted' ? 'text-red-500' :
                              'text-amber-500'
                            }`}>
                              {fc.changeType === 'added' ? 'A' : fc.changeType === 'deleted' ? 'D' : 'M'}
                            </span>
                            <span className="flex-1 font-mono text-[10px] text-surface-600 dark:text-surface-300 truncate">
                              {fc.filePath}
                            </span>
                            {(fc.linesAdded > 0 || fc.linesRemoved > 0) && (
                              <span className="text-[10px] shrink-0">
                                {fc.linesAdded > 0 && <span className="text-emerald-500">+{fc.linesAdded}</span>}
                                {fc.linesRemoved > 0 && <span className="text-red-500 ml-1">-{fc.linesRemoved}</span>}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 还原操作 */}
                  <div className="pt-2 border-t border-surface-200 dark:border-surface-700">
                    {showRestoreConfirm ? (
                      <div className="space-y-2">
                        <p className="text-xs text-orange-600 dark:text-orange-400">
                          ⚠ 还原将覆盖当前文件，但会先自动创建一个还原前存档点。
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleRestore}
                            disabled={isRestoring}
                            className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                          >
                            {isRestoring ? '还原中...' : '确认还原'}
                          </button>
                          <button
                            onClick={() => setShowRestoreConfirm(false)}
                            className="px-3 py-2 text-xs font-medium rounded-lg border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowRestoreConfirm(true)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="1 4 1 10 7 10" />
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                        </svg>
                        还原到此存档点
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-12 text-xs text-surface-400">
                  加载详情失败
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
