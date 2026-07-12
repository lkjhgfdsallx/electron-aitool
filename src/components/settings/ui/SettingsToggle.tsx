import type { LucideIcon } from 'lucide-react'

export interface SettingsToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** sm = w-9 h-5 (紧凑，用于内联/弹窗), md = w-11 h-6 (标准，用于表单) */
  size?: 'sm' | 'md'
  label?: string
  description?: string
  icon?: LucideIcon
  /** 根元素额外 className（如 divide-y 容器中的 py-3） */
  className?: string
}

/**
 * 统一 Toggle 开关组件。
 *
 * 使用 CSS 滑块模式，统一 accent-500 品牌色，替代项目中 3 种不同的 Toggle 实现。
 * - 标准尺寸 (md): w-11 h-6，translate-x-5，用于表单面板
 * - 紧凑尺寸 (sm): w-9 h-5，translate-x-4，用于内联/弹窗/变量输入
 */
export function SettingsToggle({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  label,
  description,
  icon: Icon,
  className,
}: SettingsToggleProps) {
  const trackClass =
    size === 'md'
      ? 'w-11 h-6'
      : 'w-9 h-5'

  const knobClass =
    size === 'md'
      ? 'left-0.5 top-0.5 w-5 h-5 translate-x-5'
      : 'left-0.5 top-0.5 w-4 h-4 translate-x-4'

  const knobTranslate = checked ? (size === 'md' ? 'translate-x-5' : 'translate-x-4') : 'translate-x-0.5'

  return (
    <div className={`flex items-center justify-between gap-3 ${className ?? ''}`}>
      {(label || Icon) && (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {Icon && <Icon size={14} className="text-surface-500 dark:text-surface-400 flex-shrink-0" />}
            {label && (
              <span className="text-sm font-medium text-surface-700 dark:text-surface-300">{label}</span>
            )}
          </div>
          {description && (
            <p className="text-xs text-muted mt-0.5">{description}</p>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative flex-shrink-0 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 ${trackClass} ${
          checked ? 'bg-accent-500' : 'bg-surface-300 dark:bg-surface-600'
        }`}
        role="switch"
        aria-checked={checked}
        aria-label={label || (checked ? '关闭' : '开启')}
      >
        <span
          className={`absolute rounded-full bg-white shadow-sm transition-transform ${size === 'md' ? 'w-5 h-5 top-0.5' : 'w-4 h-4 top-0.5'} ${knobTranslate}`}
        />
      </button>
    </div>
  )
}