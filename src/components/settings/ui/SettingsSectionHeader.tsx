import type { LucideIcon } from 'lucide-react'

export interface SettingsSectionHeaderProps {
  icon?: LucideIcon
  title: string
  description?: string
  /** 右侧操作（如"添加"按钮） */
  actions?: React.ReactNode
}

/**
 * 统一区块小标题组件。
 *
 * 统一渲染: 图标 + 标题 + 可选描述 + 右侧操作区，
 * 替代 KnowledgeBaseSettings 中纯文字的 SectionHeader、
 * WorkspaceSettings 中 teal-500 的 SectionTitle、
 * UIPreferencesSection 中 accent-500 的 SectionIcon 等 4 种变体。
 */
export function SettingsSectionHeader({
  icon: Icon,
  title,
  description,
  actions,
}: SettingsSectionHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-3">
      <div className="min-w-0">
        <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 flex items-center gap-2">
          {Icon && <Icon size={16} className="text-accent-500 flex-shrink-0" />}
          {title}
        </h3>
        {description && (
          <p className="text-xs text-muted mt-0.5">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">{actions}</div>
      )}
    </div>
  )
}