export interface SettingsSliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  label?: string
  description?: string
  disabled?: boolean
  /** 根元素额外 className（如 divide-y 容器中的 py-3） */
  className?: string
}

/**
 * 统一 Slider 滑块组件。
 *
 * 统一 accent-500 滑轨颜色 + accent-50/accent-950 值标签，
 * 替代各面板中 teal/violet/amber 混用的滑块。
 */
export function SettingsSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  label,
  description,
  disabled = false,
  className,
}: SettingsSliderProps) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <div className="min-w-0">
          {label && (
            <span className="text-sm font-medium text-surface-700 dark:text-surface-300">{label}</span>
          )}
          {description && (
            <p className="text-xs text-muted mt-0.5">{description}</p>
          )}
        </div>
        <span className="flex-shrink-0 text-xs font-mono text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-950/30 px-2 py-0.5 rounded-md ml-3">
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-surface-200 dark:bg-surface-700 accent-500 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={label}
      />
      <div className="flex justify-between text-[10px] text-muted mt-1">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  )
}