/**
 * AI Changes 卡片
 *
 * 挂在 assistant 消息下方：展示本轮 AI 写入的文件列表、+/- 行统计、
 * 可展开 unified diff，并支持按回合还原到写入前状态。
 */

import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FilePlus2, FilePenLine, FileX2, RotateCcw, Loader2 } from 'lucide-react'
import { aiChangesService } from '../../services/ai-changes-service'
import { useWorkspaceStore } from '../../stores/workspace-store'
import type { AiFileChange, AiTurnChanges } from '../../types/ai-changes'
import { useAppTranslation } from '../../i18n/hooks'

interface AiChangesCardProps {
  turnChanges: AiTurnChanges
}

function changeTypeLabel(type: AiFileChange['changeType'], t: ReturnType<typeof useAppTranslation>['t']): string {
  switch (type) {
    case 'added':
      return t('workspace.aiChangesTypeAdded', { defaultValue: 'Added' })
    case 'deleted':
      return t('workspace.aiChangesTypeDeleted', { defaultValue: 'Deleted' })
    default:
      return t('workspace.aiChangesTypeModified', { defaultValue: 'Modified' })
  }
}

function ChangeTypeIcon({ type }: { type: AiFileChange['changeType'] }) {
  const className = 'w-3.5 h-3.5 shrink-0'
  switch (type) {
    case 'added':
      return <FilePlus2 className={`${className} text-emerald-500`} />
    case 'deleted':
      return <FileX2 className={`${className} text-red-500`} />
    default:
      return <FilePenLine className={`${className} text-amber-500`} />
  }
}

function DiffPreview({ diff }: { diff: string }) {
  const { t } = useAppTranslation()
  const lines = diff.split('\n').slice(0, 200)
  return (
    <pre className="mt-1.5 max-h-48 overflow-auto rounded-md bg-surface-900/95 dark:bg-black/40 text-[11px] leading-relaxed p-2 font-mono text-surface-100 border border-surface-700/50">
      {lines.map((line, idx) => {
        let color = 'text-surface-300'
        if (line.startsWith('+')) color = 'text-emerald-400'
        else if (line.startsWith('-')) color = 'text-red-400'
        else if (line.startsWith('@@') || line.startsWith('...')) color = 'text-sky-400'
        return (
          <div key={idx} className={color}>
            {line || ' '}
          </div>
        )
      })}
      {diff.split('\n').length > 200 && (
        <div className="text-surface-500 mt-1">{t('workspace.aiChangesDiffTruncated', { defaultValue: '… diff truncated' })}</div>
      )}
    </pre>
  )
}

export function AiChangesCard({ turnChanges }: AiChangesCardProps) {
  const { t } = useAppTranslation()
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const workspace = useMemo(
    () => workspaces.find((w) => w.id === turnChanges.workspaceId),
    [workspaces, turnChanges.workspaceId],
  )

  const [expanded, setExpanded] = useState(false)
  const [openFiles, setOpenFiles] = useState<Record<string, boolean>>({})
  const [restoring, setRestoring] = useState(false)
  const [restored, setRestored] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [statusError, setStatusError] = useState(false)

  const { summary, files, restorable } = turnChanges
  if (!files?.length) return null

  const toggleFile = useCallback((path: string) => {
    setOpenFiles((prev) => ({ ...prev, [path]: !prev[path] }))
  }, [])

  const handleRestore = useCallback(async () => {
    if (!workspace?.folderPath || restoring || restored) return
    if (!restorable) {
      setStatusError(true)
      setStatusMsg(t('workspace.aiChangesMissingSnapshot', { defaultValue: 'This turn is missing complete before snapshots and cannot be restored' }))
      return
    }

    const ok = window.confirm(
      t('workspace.aiChangesRestoreConfirm', {
        count: summary.filesChanged,
        defaultValue: `Restore ${summary.filesChanged} file(s) written by AI in this turn to their pre-write state.\nAdded files will be deleted; modified/deleted files will be restored from snapshots.\nContinue?`,
      }),
    )
    if (!ok) return

    setRestoring(true)
    setStatusMsg(null)
    setStatusError(false)
    try {
      const result = await aiChangesService.restoreTurn(workspace.folderPath, turnChanges)
      setStatusMsg(result.message)
      setStatusError(!result.success)
      if (result.success || result.restoredFiles.length > 0) {
        setRestored(true)
      }
    } catch (err) {
      setStatusError(true)
      setStatusMsg(err instanceof Error ? err.message : t('workspace.aiChangesRestoreFailed', { defaultValue: 'Restore failed' }))
    } finally {
      setRestoring(false)
    }
  }, [workspace?.folderPath, restoring, restored, restorable, summary.filesChanged, turnChanges, t])

  return (
    <div className="mt-3 rounded-xl border border-teal-200/70 dark:border-teal-800/50 bg-teal-50/50 dark:bg-teal-950/20 overflow-hidden">
      {/* 摘要栏 */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left hover:opacity-90 transition-opacity"
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
          )}
          <span className="text-xs font-semibold text-teal-700 dark:text-teal-300 shrink-0">
            {t('workspace.aiChanges', { defaultValue: 'AI Changes' })}
          </span>
          <span className="text-xs text-teal-600/80 dark:text-teal-400/80 truncate">
            {t('workspace.aiChangesFilesCount', { count: summary.filesChanged, defaultValue: `${summary.filesChanged} files` })}
          </span>
          <span className="text-xs tabular-nums shrink-0">
            <span className="text-emerald-600 dark:text-emerald-400">+{summary.linesAdded}</span>
            {' '}
            <span className="text-red-500 dark:text-red-400">-{summary.linesRemoved}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => void handleRestore()}
          disabled={restoring || restored || !restorable || !workspace}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium
            bg-white/80 dark:bg-surface-900/60 border border-teal-200 dark:border-teal-800
            text-teal-700 dark:text-teal-300
            hover:bg-teal-100 dark:hover:bg-teal-900/40
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          title={!restorable ? t('workspace.aiChangesRestoreUnavailableTitle', { defaultValue: 'Snapshot missing; restore unavailable' }) : restored ? t('workspace.aiChangesAlreadyRestoredTitle', { defaultValue: 'Already restored' }) : t('workspace.aiChangesRestoreTitle', { defaultValue: 'Restore files to before this turn' })}
        >
          {restoring ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RotateCcw className="w-3 h-3" />
          )}
          {restored ? t('workspace.aiChangesRestored', { defaultValue: 'Restored' }) : restoring ? t('workspace.aiChangesRestoring', { defaultValue: 'Restoring…' }) : t('workspace.aiChangesRestore', { defaultValue: 'Restore' })}
        </button>
      </div>

      {/* 文件列表 */}
      {expanded && (
        <div className="border-t border-teal-200/60 dark:border-teal-800/40 px-2 py-1.5 space-y-0.5">
          {files.map((file) => {
            const isOpen = Boolean(openFiles[file.filePath])
            const hasDiff = Boolean(file.unifiedDiff)
            return (
              <div key={file.filePath} className="rounded-md">
                <button
                  type="button"
                  onClick={() => hasDiff && toggleFile(file.filePath)}
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left rounded-md
                    hover:bg-teal-100/60 dark:hover:bg-teal-900/30 transition-colors
                    ${hasDiff ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  {hasDiff ? (
                    isOpen ? (
                      <ChevronDown className="w-3 h-3 text-surface-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-surface-400 shrink-0" />
                    )
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <ChangeTypeIcon type={file.changeType} />
                  <span className="text-[11px] text-surface-700 dark:text-surface-200 truncate flex-1 min-w-0 font-mono">
                    {file.filePath}
                  </span>
                  <span className="text-[10px] text-surface-400 shrink-0">
                    {changeTypeLabel(file.changeType, t)}
                  </span>
                  <span className="text-[11px] tabular-nums shrink-0 ml-1">
                    <span className="text-emerald-600 dark:text-emerald-400">+{file.linesAdded}</span>
                    {' '}
                    <span className="text-red-500 dark:text-red-400">-{file.linesRemoved}</span>
                  </span>
                </button>
                {isOpen && file.unifiedDiff && (
                  <div className="px-2 pb-1.5">
                    <DiffPreview diff={file.unifiedDiff} />
                  </div>
                )}
              </div>
            )
          })}

          {!restorable && (
            <p className="px-2 py-1 text-[10px] text-amber-600 dark:text-amber-400">
              {t('workspace.aiChangesPartialSnapshotHint', { defaultValue: 'Some files have no before snapshot (too large or newly added); full content restore is unavailable' })}
            </p>
          )}
        </div>
      )}

      {statusMsg && (
        <div
          className={`px-3 py-1.5 text-[11px] border-t border-teal-200/60 dark:border-teal-800/40 ${
            statusError
              ? 'text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20'
              : 'text-teal-700 dark:text-teal-300'
          }`}
        >
          {statusMsg}
        </div>
      )}
    </div>
  )
}
