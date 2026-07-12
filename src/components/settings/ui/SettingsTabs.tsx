import type { LucideIcon } from 'lucide-react'

export interface SettingsTab {
  key: string
  label: string
  icon?: LucideIcon
  /** Tab 右侧的计数/徽章 */
  badge?: number | string
  /** 禁用态：置灰且不可点击 */
  disabled?: boolean
}

export interface SettingsTabsProps {
  tabs: SettingsTab[]
  activeTab: string
  onTabChange: (key: string) => void
  /** filled = 背景填充激活态, underline = 下边框激活态 */
  variant?: 'filled' | 'underline'
}

/**
 * 统一 Tab 组件。
 *
 * 支持两种 variant：
 * - filled (默认)：bg-accent-500 text-white 激活态，用于 PromptEditor/MCPConfig/ToolEditor 风格
 * - underline：border-b-2 border-accent-500 激活态，用于 SkillEditor 原风格
 *
 * 统一 accent-500 作为激活色，替代 amber-500/Surface-700 等多色变体。
 */
export function SettingsTabs({
  tabs,
  activeTab,
  onTabChange,
  variant = 'filled',
}: SettingsTabsProps) {
  if (variant === 'underline') {
    return (
      <div className="flex border-b border-surface-200 dark:border-surface-700" role="tablist">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key
          const disabled = tab.disabled
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={disabled ? undefined : () => onTabChange(tab.key)}
              disabled={disabled}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors -mb-[1px] ${
                disabled
                  ? 'text-muted/50 cursor-not-allowed border-b-2 border-transparent'
                  : isActive
                    ? 'text-accent-600 dark:text-accent-400 border-b-2 border-accent-500 bg-accent-50/50 dark:bg-accent-950/20'
                    : 'text-muted hover:text-surface-700 dark:hover:text-surface-300 border-b-2 border-transparent'
              }`}
            >
              {tab.icon && <tab.icon size={14} />}
              {tab.label}
              {tab.badge !== undefined && (
                <span className={`ml-1 px-1.5 py-0 rounded-full text-[10px] font-medium ${
                  isActive
                    ? 'bg-accent-100 dark:bg-accent-900/40 text-accent-600 dark:text-accent-400'
                    : 'bg-surface-100 dark:bg-surface-700 text-muted'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  // filled variant (默认)
  return (
    <div className="flex gap-1 bg-surface-100 dark:bg-surface-800 p-1 rounded-xl" role="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key
        const disabled = tab.disabled
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={disabled ? undefined : () => onTabChange(tab.key)}
            disabled={disabled}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              disabled
                ? 'text-muted/50 cursor-not-allowed'
                : isActive
                  ? 'bg-accent-500 text-white shadow-sm'
                  : 'text-muted hover:text-surface-700 dark:hover:text-surface-300'
            }`}
          >
            {tab.icon && <tab.icon size={13} />}
            {tab.label}
            {tab.badge !== undefined && (
              <span className={`ml-0.5 px-1.5 py-0 rounded text-[10px] font-medium ${
                isActive
                  ? 'bg-white/20'
                  : 'bg-surface-200 dark:bg-surface-700'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}