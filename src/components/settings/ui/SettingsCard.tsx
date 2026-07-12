import type { ReactNode } from 'react'

export interface SettingsCardProps {
  children: ReactNode
  className?: string
  /** 是否可折叠 */
  collapsible?: boolean
  /** 折叠状态（受控） */
  collapsed?: boolean
  /** 折叠切换回调 */
  onToggleCollapse?: () => void
  /** 折叠标题 */
  collapseTitle?: string
  /** 默认折叠（非受控初始化） */
  defaultCollapsed?: boolean
}

/**
 * 统一卡片容器组件。
 *
 * 统一渲染: bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5
 * 替代 p-5 vs p-4、/80 /60 vs /50 透明度不一致的卡片变体。
 */
export function SettingsCard({
  children,
  className = '',
  collapsible = false,
  collapsed,
  onToggleCollapse,
  collapseTitle,
}: SettingsCardProps) {
  const baseClass =
    'bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60'

  if (!collapsible) {
    return (
      <div className={`${baseClass} p-5 ${className}`}>
        {children}
      </div>
    )
  }

  return (
    <div className={`${baseClass} overflow-hidden ${className}`}>
      {collapseTitle && onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-50 dark:hover:bg-surface-700/20 transition-colors"
        >
          <span className="text-sm font-medium text-surface-700 dark:text-surface-300">{collapseTitle}</span>
          <span className="text-muted text-xs">{collapsed ? '展开' : '折叠'}</span>
        </button>
      )}
      {!collapsed && (
        <div className={collapseTitle ? 'px-5 pb-5' : 'p-5'}>
          {children}
        </div>
      )}
    </div>
  )
}