import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface SettingsHeaderProps {
  icon: LucideIcon
  title: string
  description?: string
  /** 右侧操作按钮/搜索栏区域 */
  actions?: ReactNode
}

/**
 * 统一设置面板标题组件。
 *
 * 统一渲染: text-lg font-semibold + text-accent-500 图标 + 可选描述 + 右侧操作区插槽。
 * 替代各面板中 text-lg/text-xl/text-base 混用 + violet/amber/teal/orange 多色图标的标题变体。
 */
export function SettingsHeader({ icon: Icon, title, description, actions }: SettingsHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2.5">
          <Icon size={20} className="text-accent-500 flex-shrink-0" />
          {title}
        </h2>
        {description && (
          <p className="text-xs text-muted mt-1 ml-[30px]">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </div>
  )
}