import { useState, useCallback } from 'react'
import { AlertTriangle, X } from 'lucide-react'

export interface ConfirmDialogConfig {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
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
  const [config, setConfig] = useState<ConfirmDialogConfig | null>(null)
  const [resolveRef, setResolveRef] = useState<((ok: boolean) => void) | null>(null)

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
      <div className="fixed inset-0 z-[9999]" onClick={handleCancel}>
        {/* 遮罩 */}
        <div className="absolute inset-0 bg-black/30 dark:bg-black/50" />
        {/* 弹窗 */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-surface-800 rounded-2xl border border-surface-200 dark:border-surface-700 shadow-elevated w-96 max-w-[90vw] p-6 animate-scale-in"
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
              <AlertTriangle size={18} className={iconColor} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">
                {config.title}
              </h3>
              <p className="text-xs text-muted mt-1.5">
                {config.message}
              </p>
            </div>
            <button
              onClick={handleCancel}
              className="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-muted transition-colors flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 mt-5">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium rounded-xl text-surface-600 dark:text-surface-400 bg-surface-100 dark:bg-surface-700/60 hover:bg-surface-200 dark:hover:bg-surface-600/60 transition-colors"
            >
              {config.cancelLabel || '取消'}
            </button>
            <button
              onClick={handleConfirm}
              className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${confirmBtnClass}`}
            >
              {config.confirmLabel || '确认'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return { confirm, Dialog }
}