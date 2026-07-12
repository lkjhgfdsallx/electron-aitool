import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface SettingsEmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  /** 可选的操作按钮 */
  action?: ReactNode
  /** 图标大小 */
  iconSize?: number
}

/**
 * 统一空状态组件。
 *
 * 统一渲染：大图标(opacity-20) + 标题 + 描述 + 可选操作按钮，
 * 替代各面板中各自实现的空状态（AgentManager/PromptManager/SkillManager/
 * PromptPlayground/PromptChainEditor/VersionHistory/ToolEditor 各有独立版本）。
 */
export function SettingsEmptyState({
  icon: Icon,
  title,
  description,
  action,
  iconSize = 36,
}: SettingsEmptyStateProps) {
  return (
    <div className="flex items-center justify-center h-full text-muted">
      <div className="text-center px-4">
        <Icon size={iconSize} className="mx-auto mb-3 opacity-20" />
        <p className="text-sm font-medium text-surface-600 dark:text-surface-400">{title}</p>
        {description && (
          <p className="text-xs mt-1 text-surface-400 dark:text-surface-500">{description}</p>
        )}
        {action && (
          <div className="mt-4">{action}</div>
        )}
      </div>
    </div>
  )
}