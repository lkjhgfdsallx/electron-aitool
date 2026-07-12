import { useState, useEffect, useCallback } from 'react'
import { Save, RotateCcw, Check, Loader2 } from 'lucide-react'

export interface SettingsSaveBarProps {
  /** 保存回调 */
  onSave: () => void | Promise<void>
  /** 恢复默认回调（可选） */
  onReset?: () => void
  /** 保存按钮文字 */
  saveLabel?: string
  /** 恢复默认文字 */
  resetLabel?: string
  /** 表单是否有未保存的修改 — 控制按钮是否可点击 */
  isDirty: boolean
  /** 保存中状态 */
  isSaving?: boolean
  /** 是否显示"已保存"反馈 */
  savedFeedback?: boolean
  /** 快捷键提示 */
  shortcut?: string
}

/**
 * 统一 Sticky 底部保存栏组件。
 *
 * 解决 AgentManager/AIProviderManager/MCPConfig 等面板中保存按钮在文档底部、
 * 用户需长时间滚动才能到达的核心 UX 问题。
 *
 * 使用 sticky bottom-0 + backdrop-blur 始终固定在视口底部，
 * 内容区域只需 flex-1 overflow-y-auto 即可独立滚动。
 */
export function SettingsSaveBar({
  onSave,
  onReset,
  saveLabel = '保存',
  resetLabel = '恢复默认',
  isDirty,
  isSaving = false,
  savedFeedback = false,
  shortcut = 'Ctrl+S',
}: SettingsSaveBarProps) {
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    if (savedFeedback) {
      setShowSaved(true)
      const timer = setTimeout(() => setShowSaved(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [savedFeedback])

  /** Ctrl+S / Cmd+S 键盘快捷键 */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (isDirty && !isSaving) {
          onSave()
        }
      }
    },
    [isDirty, isSaving, onSave],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="sticky bottom-0 flex-shrink-0 bg-white/80 dark:bg-surface-900/80 backdrop-blur-sm border-t border-surface-200/80 dark:border-surface-700/60 px-6 py-3 flex items-center justify-between z-10">
      <div className="flex items-center gap-3 text-xs text-muted">
        {savedFeedback && showSaved && (
          <span className="flex items-center gap-1 text-accent-600 dark:text-accent-400 animate-fade-in-up">
            <Check size={13} />
            已保存
          </span>
        )}
        {shortcut && !isSaving && !showSaved && (
          <span>
            <kbd className="px-1.5 py-0.5 bg-surface-100 dark:bg-surface-700 rounded text-[10px] font-mono">{shortcut}</kbd>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-surface-600 dark:text-surface-400 bg-surface-100 dark:bg-surface-700/60 rounded-xl hover:bg-surface-200 dark:hover:bg-surface-600/60 disabled:opacity-50 transition-colors"
          >
            <RotateCcw size={14} />
            {resetLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty || isSaving}
          className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium bg-accent-500 text-white rounded-xl hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {isSaving ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Save size={14} />
              {saveLabel}
            </>
          )}
        </button>
      </div>
    </div>
  )
}