export interface SettingsTextareaProps {
  value: string
  onChange: (value: string) => void
  label?: string
  description?: string
  placeholder?: string
  disabled?: boolean
  rows?: number
  /** textarea 额外 className */
  className?: string
  /** 根元素额外 className（如 divide-y 容器中的 py-3） */
  wrapperClassName?: string
}

/**
 * 统一 Textarea 多行文本域组件。
 *
 * 统一 bg-white dark:bg-surface-800 + accent-500 focus ring 样式，
 * 替代各面板中使用不同背景色（surface-50/surface-900/white/surface-800）的 textarea。
 */
export function SettingsTextarea({
  value,
  onChange,
  label,
  description,
  placeholder,
  disabled = false,
  rows = 4,
  className = '',
  wrapperClassName,
}: SettingsTextareaProps) {
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
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-surface-800 border-surface-300 dark:border-surface-600 text-surface-700 dark:text-surface-300 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 disabled:opacity-50 disabled:cursor-not-allowed resize-y font-mono ${className}`}
        aria-label={label}
      />
    </div>
  )
}