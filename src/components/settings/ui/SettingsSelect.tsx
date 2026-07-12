import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

export interface SettingsSelectOption<V extends string = string> {
  label: string
  value: V
}

export interface SettingsSelectProps<V extends string = string> {
  value: V
  onChange: (value: V) => void
  options: SettingsSelectOption<V>[]
  label?: string
  description?: string
  disabled?: boolean
  placeholder?: string
  /** 垂直布局 = label 上 select 下（默认，表单场景）；水平布局 = label 左 select 右（内联行场景） */
  layout?: 'vertical' | 'horizontal'
  /** 根元素额外 className（如 divide-y 容器中的 py-3） */
  className?: string
}

/**
 * 统一 Select 下拉选择组件。
 *
 * 使用 ChevronDown 图标覆盖 + accent-500 focus ring，
 * 替代各面板中样式不统一的原生 select。
 *
 * @generic V - 选项值的联合类型（默认 string）
 */
export function SettingsSelect<V extends string = string>({
  value,
  onChange,
  options,
  label,
  description,
  disabled = false,
  placeholder,
  layout = 'vertical',
  className,
}: SettingsSelectProps<V>) {
  const selectElement: ReactNode = (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        disabled={disabled}
        className={`appearance-none bg-surface-50 dark:bg-surface-900 border border-surface-300 dark:border-surface-600 rounded-lg px-3 py-1.5 pr-8 text-xs text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
          layout === 'horizontal' ? '' : 'w-full'
        }`}
        aria-label={label}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
    </div>
  )

  const labelBlock: ReactNode = (label || description) && (
    <div className={layout === 'horizontal' ? 'min-w-0' : 'mb-1'}>
      {label && (
        <span className="text-sm font-medium text-surface-700 dark:text-surface-300">{label}</span>
      )}
      {description && (
        <p className="text-xs text-muted mt-0.5">{description}</p>
      )}
    </div>
  )

  if (layout === 'horizontal') {
    return (
      <div className={`flex items-center justify-between gap-3 ${className ?? ''}`}>
        {labelBlock}
        {selectElement}
      </div>
    )
  }

  return (
    <div className={className}>
      {labelBlock}
      {selectElement}
    </div>
  )
}
