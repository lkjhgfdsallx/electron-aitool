/**
 * 存档点时间线标记组件
 *
 * 在消息列表中内联渲染，显示一个时间线节点。
 * 展示存档类型图标、描述、变更摘要。
 */

import type { CheckpointIndex } from '../../types'
import { useAppTranslation } from '../../i18n/hooks'

// ---- 存档类型配置 ----

const TYPE_CONFIG: Record<string, {
  labelKey: string
  icon: string
  color: string
  bgColor: string
  borderColor: string
}> = {
  auto: {
    labelKey: 'workspace.autoCheckpoint',
    icon: '⏱',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
  },
  manual: {
    labelKey: 'workspace.manualCheckpointLabel',
    icon: '📌',
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-50 dark:bg-violet-950/30',
    borderColor: 'border-violet-200 dark:border-violet-800',
  },
  'pre-command': {
    labelKey: 'workspace.preCommandCheckpoint',
    icon: '⚡',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
  'pre-restore': {
    labelKey: 'workspace.preRestoreCheckpoint',
    icon: '↩',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    borderColor: 'border-orange-200 dark:border-orange-800',
  },
  'pre-compression': {
    labelKey: 'workspace.preCompressionCheckpoint',
    icon: '📦',
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-50 dark:bg-cyan-950/30',
    borderColor: 'border-cyan-200 dark:border-cyan-800',
  },
}

// ---- 格式化时间 ----

function formatTime(timestamp: number, locale: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time

  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}/${day} ${time}`
}

// ---- 组件 ----

interface CheckpointMarkerProps {
  checkpoint: CheckpointIndex
  onClick?: (checkpoint: CheckpointIndex) => void
}

export function CheckpointMarker({ checkpoint, onClick }: CheckpointMarkerProps) {
  const { t, currentLang } = useAppTranslation()
  const config = TYPE_CONFIG[checkpoint.type] ?? TYPE_CONFIG.auto

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 group cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
      onClick={() => onClick?.(checkpoint)}
    >
      {/* 时间线 */}
      <div className="flex flex-col items-center">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${config.bgColor} ${config.color} border ${config.borderColor}`}>
          {config.icon}
        </div>
        <div className="w-px h-full min-h-[8px] bg-surface-200 dark:bg-surface-700" />
      </div>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${config.color}`}>
            {t(config.labelKey)}
          </span>
          <span className="text-[10px] text-surface-400 dark:text-surface-500">
            {formatTime(checkpoint.createdAt, currentLang)}
          </span>
        </div>
        <p className="text-xs text-surface-600 dark:text-surface-300 mt-0.5 truncate">
          {checkpoint.description}
        </p>
        {checkpoint.filesChanged > 0 && (
          <div className="flex items-center gap-2 mt-1 text-[10px] text-surface-400 dark:text-surface-500">
            <span>{t('workspace.filesCount', { count: checkpoint.filesChanged })}</span>
            {checkpoint.linesAdded > 0 && (
              <span className="text-emerald-500">+{checkpoint.linesAdded}</span>
            )}
            {checkpoint.linesRemoved > 0 && (
              <span className="text-red-500">-{checkpoint.linesRemoved}</span>
            )}
          </div>
        )}
      </div>

      {/* 操作提示 */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400">
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </div>
    </div>
  )
}
