import { useState, useMemo, useCallback } from 'react'
import { useAppTranslation } from '@/i18n/hooks'
import {
  ArrowLeft,
  GitBranch,
  RotateCcw,
  Clock,
  Plus,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useAgentStore } from '../../stores/agent-store'
import { PromptVersionService } from '../../services/prompt-version-service'
import type { Prompt, PromptVersion, DiffResult, DiffLine } from '../../types'
import { useConfirmDialog, SettingsEmptyState } from './ui'

interface VersionHistoryProps {
  prompt: Prompt
  onBack: () => void
}

export function VersionHistory({ prompt, onBack }: VersionHistoryProps) {
  const { t } = useAppTranslation()
  const { savePromptVersion, rollbackPromptVersion } = useAgentStore()
  const { confirm, Dialog } = useConfirmDialog()

  const [selectedV1, setSelectedV1] = useState<string | null>(null)
  const [selectedV2, setSelectedV2] = useState<string | null>(null)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [versionLabel, setVersionLabel] = useState('')

  // 按版本号倒序排列
  const sortedVersions = useMemo(() => {
    return [...prompt.versionHistory].sort((a, b) => b.version - a.version)
  }, [prompt.versionHistory])

  // 计算 diff
  const diff = useMemo((): DiffResult | null => {
    if (!selectedV1 || !selectedV2) return null
    const v1 = prompt.versionHistory.find((v) => v.id === selectedV1)
    const v2 = prompt.versionHistory.find((v) => v.id === selectedV2)
    if (!v1 || !v2) return null
    return PromptVersionService.computeDiff(v1, v2)
  }, [prompt.versionHistory, selectedV1, selectedV2])

  const handleSaveVersion = useCallback(() => {
    savePromptVersion(prompt.id, versionLabel || undefined)
    setVersionLabel('')
    setShowSaveForm(false)
  }, [prompt.id, versionLabel, savePromptVersion])

  const handleRollback = useCallback(
    async (versionId: string) => {
      const ok = await confirm({
        title: t('prompt.rollbackTitle'),
        message: t('prompt.rollbackConfirm'),
        confirmLabel: t('prompt.rollback'),
        variant: 'warning',
      })
      if (ok) {
        rollbackPromptVersion(prompt.id, versionId)
      }
    },
    [prompt.id, rollbackPromptVersion, confirm],
  )

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-surface-200/80 dark:border-surface-700/60">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-muted transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
            <GitBranch size={16} className="text-purple-500" />
            {t('prompt.versionHistory')}
          </h3>
          <p className="text-xs text-muted">{prompt.name} · {t('prompt.currentVersion', { version: prompt.currentVersion })}</p>
        </div>
        <button
          onClick={() => setShowSaveForm(!showSaveForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
        >
          <Plus size={13} /> {t('prompt.saveVersion')}
        </button>
      </div>

      {/* 保存版本表单 */}
      {showSaveForm && (
        <div className="px-6 py-3 border-b border-surface-200/80 dark:border-surface-700/60 bg-surface-50 dark:bg-surface-900/50">
          <div className="flex gap-2">
            <input
              type="text"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder={t('prompt.saveVersionPlaceholder', { version: prompt.currentVersion + 1 })}
              className="flex-1 px-3 py-1.5 text-xs border rounded-lg bg-white dark:bg-surface-800 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30"
            />
            <button
              onClick={handleSaveVersion}
              className="px-3 py-1.5 text-xs bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
            >
              {t('common.save')}
            </button>
            <button
              onClick={() => setShowSaveForm(false)}
              className="px-3 py-1.5 text-xs text-muted border border-surface-300 dark:border-surface-600 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* 主内容 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧：版本列表 */}
        <div className="w-64 flex-shrink-0 border-r border-surface-200/80 dark:border-surface-700/60 overflow-y-auto">
          {sortedVersions.length === 0 ? (
            <div className="px-4 py-8">
              <SettingsEmptyState
                icon={GitBranch}
                title={t('prompt.noVersionHistory')}
                description={t('prompt.createVersionHint')}
                iconSize={32}
              />
            </div>
          ) : (
            <div className="py-1">
              {sortedVersions.map((v) => (
                <VersionItem
                  key={v.id}
                  version={v}
                  isSelectedV1={selectedV1 === v.id}
                  isSelectedV2={selectedV2 === v.id}
                  onSelectV1={() => setSelectedV1(v.id)}
                  onSelectV2={() => setSelectedV2(v.id)}
                  onRollback={() => handleRollback(v.id)}
                  formatTime={formatTime}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>

        {/* 右侧：Diff 视图 */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedV1 || !selectedV2 ? (
            <div className="flex items-center justify-center h-full text-muted">
              <div className="text-center">
                <GitBranch size={36} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">{t('prompt.selectVersionsToCompare')}</p>
                <p className="text-xs mt-1">{t('prompt.selectVersionsHint')}</p>
              </div>
            </div>
          ) : diff ? (
            <DiffView diff={diff} />
          ) : null}
        </div>
      </div>
      <Dialog />
    </div>
  )
}

// ==================== 版本列表项 ====================

function VersionItem({
  version,
  isSelectedV1,
  isSelectedV2,
  onSelectV1,
  onSelectV2,
  onRollback,
  formatTime,
  t,
}: {
  version: PromptVersion
  isSelectedV1: boolean
  isSelectedV2: boolean
  onSelectV1: () => void
  onSelectV2: () => void
  onRollback: () => void
  formatTime: (ts: number) => string
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`px-3 py-2.5 border-l-2 transition-colors ${
        isSelectedV1 || isSelectedV2
          ? 'border-l-accent-500 bg-accent-50/50 dark:bg-accent-950/20'
          : 'border-l-transparent hover:bg-surface-50 dark:hover:bg-surface-900/30'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono font-medium text-surface-800 dark:text-surface-200">
              {version.label}
            </span>
            <span className="text-[10px] text-muted flex items-center gap-0.5">
              <Clock size={10} />
              {formatTime(version.createdAt)}
            </span>
          </div>
          <p className="text-[10px] text-muted mt-0.5 truncate">
            {version.snapshot.name}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onSelectV1}
            className={`px-1.5 py-0.5 text-[10px] rounded ${
              isSelectedV1
                ? 'bg-blue-500 text-white'
                : 'bg-surface-100 dark:bg-surface-800 text-muted hover:text-blue-500'
            }`}
            title={t('prompt.compareBaseline')}
          >
            V1
          </button>
          <button
            onClick={onSelectV2}
            className={`px-1.5 py-0.5 text-[10px] rounded ${
              isSelectedV2
                ? 'bg-green-500 text-white'
                : 'bg-surface-100 dark:bg-surface-800 text-muted hover:text-green-500'
            }`}
            title={t('prompt.compareTarget')}
          >
            V2
          </button>
          <button
            onClick={onRollback}
            className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-muted hover:text-accent-500"
            title={t('prompt.rollbackToVersion')}
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* 展开预览 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] text-muted hover:text-surface-700 dark:hover:text-surface-300 mt-1"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        内容预览
      </button>
      {expanded && (
        <pre className="mt-1.5 p-2 bg-surface-50 dark:bg-surface-900 rounded text-[10px] text-surface-600 dark:text-surface-400 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
          {version.snapshot.content.slice(0, 500)}
          {version.snapshot.content.length > 500 && '...'}
        </pre>
      )}
    </div>
  )
}

// ==================== Diff 视图 ====================

function DiffView({ diff }: { diff: DiffResult }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3 text-xs">
        <span className="text-green-600 dark:text-green-400">+{diff.addedCount} 新增</span>
        <span className="text-red-600 dark:text-red-400">-{diff.removedCount} 删除</span>
        <span className="text-muted">{diff.unchangedCount} 未变</span>
      </div>
      <div className="bg-surface-50 dark:bg-surface-900 rounded-xl border border-surface-200/80 dark:border-surface-700/60 overflow-hidden">
        <pre className="text-xs font-mono leading-relaxed">
          {diff.lines.map((line, i) => (
            <DiffLine key={i} line={line} />
          ))}
        </pre>
      </div>
    </div>
  )
}

function DiffLine({ line }: { line: DiffLine }) {
  const bgClass =
    line.type === 'added'
      ? 'bg-green-50 dark:bg-green-950/20'
      : line.type === 'removed'
        ? 'bg-red-50 dark:bg-red-950/20'
        : ''

  const textClass =
    line.type === 'added'
      ? 'text-green-700 dark:text-green-300'
      : line.type === 'removed'
        ? 'text-red-700 dark:text-red-300'
        : 'text-surface-600 dark:text-surface-400'

  const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '

  return (
    <div className={`flex ${bgClass}`}>
      <span className="w-8 flex-shrink-0 text-center text-muted select-none border-r border-surface-200/40 dark:border-surface-700/20">
        {prefix}
      </span>
      <span className={`flex-1 px-3 py-0.5 ${textClass}`}>
        {prefix}
        {line.content}
      </span>
    </div>
  )
}
