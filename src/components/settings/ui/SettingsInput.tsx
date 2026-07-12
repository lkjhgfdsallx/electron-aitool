export interface SettingsInputProps {
  value: string
  onChange: (value: string) => void
  label?: string
  description?: string
  placeholder?: string
  disabled?: boolean
  type?: 'text' | 'number' | 'password'
  min?: number
  max?: number
  step?: number
  /** 输入框额外 className */
  className?: string
  /** 根元素额外 className（如 divide-y 容器中的 py-3） */
  wrapperClassName?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

/**
 * 统一 Input 输入框组件。
 *
 * 统一 bg-surface-50 dark:bg-surface-900 + accent-500 focus ring 样式，
 * 替代各面板中样式不统一的 input 元素。
 */
export function SettingsInput({
  value,
  onChange,
  label,
  description,
  placeholder,
  disabled = false,
  type = 'text',
  min,
  max,
  step,
  className = '',
  wrapperClassName,
  onKeyDown,
}: SettingsInputProps) {
  return (
    <div className={wrapperClassName}>
      {label && (
        <div className="mb-1">
          <span className="text-sm font-medium text-surface-700 dark:text-surface-300">{label}</span>
          {description && (
            <p className="text-xs text-muted mt-0.5">{description}</p>
          )}
        </div>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        className={`w-full px-3 py-2 text-sm border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 text-surface-700 dark:text-surface-300 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        aria-label={label}
      />
    </div>
  )
}