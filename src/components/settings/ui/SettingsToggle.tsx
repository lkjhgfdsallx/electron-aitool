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
 * 使用与 MCP 扩展服务页一致的 CSS 滑块模式，统一 accent-500 品牌色。
 * - 标准尺寸 (md): w-11 h-6，knob h-4 w-4，开启 translate-x-6
 * - 紧凑尺寸 (sm): w-9 h-5，knob h-3.5 w-3.5，开启 translate-x-4
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
  const trackClass = size === 'md' ? 'h-6 w-11' : 'h-5 w-9'
  const knobSizeClass = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'
  const knobTranslate = checked
    ? size === 'md'
      ? 'translate-x-6'
      : 'translate-x-4'
    : 'translate-x-1'

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
        className={`relative inline-flex flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 ${trackClass} ${
          checked ? 'bg-accent-500' : 'bg-surface-300 dark:bg-surface-600'
        }`}
        role="switch"
        aria-checked={checked}
        aria-label={label || (checked ? '关闭' : '开启')}
      >
        <span
          className={`inline-block transform rounded-full bg-white shadow-sm transition-transform ${knobSizeClass} ${knobTranslate}`}
        />
      </button>
    </div>
  )
}