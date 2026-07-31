import { useState, useCallback, useEffect, useId, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useAppTranslation } from '../../../i18n/hooks'

export interface ConfirmDialogConfig {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** 仅显示确认按钮，适合错误/冲突通知。 */
  alertOnly?: boolean
  /** danger = 红色确认按钮, warning = 琥珀色确认按钮, default = accent-500 确认按钮 */
  variant?: 'default' | 'danger' | 'warning'
}

export interface ConfirmDialogResult {
  /** 触发确认弹窗 */
  confirm: (config: ConfirmDialogConfig) => Promise<boolean>
  /** 渲染弹窗的组件（在 JSX 中放置） */
  Dialog: React.FC
}

/**
 * 统一确认对话框 Hook。
 *
 * 返回 confirm(config) 函数用于触发弹窗，以及 Dialog 组件用于在 JSX 中渲染。
 *
 * 替代项目中各面板的浏览器 confirm() 调用：
 * - DataManagementSection: handleClearApiKeys/handleClearMCP/handleDeleteByRange/handleDeleteAll
 * - WorkspaceSettings: handleDelete
 * - PromptChainEditor: handleDelete
 * - VersionHistory: handleRollback
 *
 * 使用示例:
 * ```tsx
 * function MyPanel() {
 *   const { confirm, Dialog } = useConfirmDialog()
 *
 *   const handleDelete = async () => {
 *     const ok = await confirm({
 *       title: '确认删除',
 *       message: '此操作不可撤销，确定要继续吗？',
 *       variant: 'danger',
 *     })
 *     if (ok) { /* 执行删除 * / }
 *   }
 *
 *   return (
 *     <>
 *       <button onClick={handleDelete}>删除</button>
 *       <Dialog />
 *     </>
 *   )
 * }
 * ```
 */
export function useConfirmDialog(): ConfirmDialogResult {
  const { t } = useAppTranslation()
  const [config, setConfig] = useState<ConfirmDialogConfig | null>(null)
  const [resolveRef, setResolveRef] = useState<((ok: boolean) => void) | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!config) return
    const previousFocus = document.activeElement as HTMLElement | null
    const frame = requestAnimationFrame(() => confirmButtonRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !config.alertOnly) {
        event.preventDefault()
        resolveRef?.(false)
        setConfig(null)
        setResolveRef(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [config, resolveRef])

  const confirm = useCallback((cfg: ConfirmDialogConfig): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfig(cfg)
      setResolveRef(() => resolve)
    })
  }, [])

  const handleConfirm = useCallback(() => {
    resolveRef?.(true)
    setConfig(null)
    setResolveRef(null)
  }, [resolveRef])

  const handleCancel = useCallback(() => {
    resolveRef?.(false)
    setConfig(null)
    setResolveRef(null)
  }, [resolveRef])

  const Dialog: React.FC = () => {
    if (!config) return null

    const confirmBtnClass =
      config.variant === 'danger'
        ? 'bg-danger-500 hover:bg-danger-600 text-white'
        : config.variant === 'warning'
          ? 'bg-amber-500 hover:bg-amber-600 text-white'
          : 'bg-accent-500 hover:bg-accent-600 text-white'

    const iconColor =
      config.variant === 'danger'
        ? 'text-danger-500'
        : config.variant === 'warning'
          ? 'text-amber-500'
          : 'text-accent-500'

    return (
      <div className="fixed inset-0 z-[9999]" onClick={config.alertOnly ? undefined : handleCancel}>
        {/* 遮罩 */}
        <div className="absolute inset-0 bg-black/30 dark:bg-black/50" />
        {/* 弹窗 */}
        <div
          role={config.alertOnly ? 'alertdialog' : 'dialog'}
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-surface-800 rounded-2xl border border-surface-200 dark:border-surface-700 shadow-elevated w-[32rem] max-w-[90vw] max-h-[85vh] overflow-y-auto p-6 animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
              config.variant === 'danger'
                ? 'bg-danger-50 dark:bg-danger-950/30'
                : config.variant === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/30'
                  : 'bg-accent-50 dark:bg-accent-950/30'
            }`}>
              <AlertTriangle size={18} className={iconColor} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 id={titleId} className="text-sm font-semibold text-surface-800 dark:text-surface-200">
                {config.title}
              </h3>
              <p id={descriptionId} className="text-xs text-muted mt-1.5 whitespace-pre-wrap leading-relaxed break-words">
                {config.message}
              </p>
            </div>
            {!config.alertOnly && (
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60 transition-colors flex-shrink-0"
                aria-label={config.cancelLabel || t('common.cancel')}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 mt-5">
            {!config.alertOnly && (
              <button
                type="button"
                onClick={handleCancel}
                className="min-h-11 px-4 py-2 text-sm font-medium rounded-xl text-surface-600 dark:text-surface-400 bg-surface-100 dark:bg-surface-700/60 hover:bg-surface-200 dark:hover:bg-surface-600/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60 transition-colors"
              >
                {config.cancelLabel || t('common.cancel')}
              </button>
            )}
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={handleConfirm}
              className={`min-h-11 px-4 py-2 text-sm font-medium rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500/60 transition-colors ${confirmBtnClass}`}
            >
              {config.confirmLabel || t('common.confirm')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return { confirm, Dialog }
}