import { ChevronDown, ToggleLeft, ToggleRight } from 'lucide-react'
import type { SettingItemMeta } from '../../types/settings-meta'

export interface SettingFieldRendererProps<T = unknown> {
  item: SettingItemMeta
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  compact?: boolean
  className?: string
}

/**
 * 基于 settings-registry 元数据渲染设置字段。
 *
 * 目标：让完整设置页与快捷设置浮层共享同一套字段元数据与基础控件渲染逻辑。
 */
export function SettingFieldRenderer<T = unknown>({
  item,
  value,
  onChange,
  disabled = false,
  compact = false,
  className = '',
}: SettingFieldRendererProps<T>) {
  const labelClass = compact
    ? 'text-xs text-gray-700 dark:text-gray-300'
    : 'text-sm font-medium text-surface-700 dark:text-surface-300'
  const descClass = compact
    ? 'text-[10px] text-gray-400 dark:text-gray-500 mt-0.5'
    : 'text-xs text-muted mt-0.5'

  const renderControl = () => {
    switch (item.controlType) {
      case 'toggle': {
        const checked = Boolean(value)
        return (
          <button
            type="button"
            onClick={() => onChange((!checked) as T)}
            disabled={disabled}
            className={`transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              checked ? 'text-teal-500' : 'text-gray-300 dark:text-gray-600'
            }`}
            aria-label={`${checked ? '关闭' : '开启'}${item.label}`}
          >
            {checked ? <ToggleRight size={compact ? 22 : 24} /> : <ToggleLeft size={compact ? 22 : 24} />}
          </button>
        )
      }
      case 'select': {
        const options = item.options ?? []
        return (
          <div className="relative flex-shrink-0">
            <select
              value={String(value ?? '')}
              onChange={(e) => onChange(e.target.value as T)}
              disabled={disabled}
              className={`appearance-none rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-700/60 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:opacity-50 disabled:cursor-not-allowed ${
                compact ? 'max-w-[150px] px-2 py-1 pr-7 text-[11px]' : 'px-3 py-1.5 pr-8 text-xs'
              }`}
              aria-label={item.label}
            >
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
        )
      }
      case 'slider': {
        const numValue = Number(value ?? item.defaultValue ?? item.min ?? 0)
        const min = item.min ?? 0
        const max = item.max ?? 100
        const step = item.step ?? 1
        return (
          <div className={compact ? 'w-32' : 'w-full max-w-xs'}>
            <div className="flex items-center justify-end mb-1">
              <span className="text-[10px] font-mono text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 px-1.5 py-0.5 rounded">
                {numValue}{item.unit ?? ''}
              </span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={numValue}
              onChange={(e) => onChange(Number(e.target.value) as T)}
              disabled={disabled}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-surface-200 dark:bg-surface-700 accent-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={item.label}
            />
          </div>
        )
      }
      case 'number': {
        return (
          <input
            type="number"
            min={item.min}
            max={item.max}
            step={item.step}
            value={Number(value ?? item.defaultValue ?? 0)}
            onChange={(e) => onChange(Number(e.target.value) as T)}
            disabled={disabled}
            className="w-28 px-3 py-1.5 text-xs rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50 disabled:opacity-50"
            aria-label={item.label}
          />
        )
      }
      case 'input':
      case 'color': {
        return (
          <input
            type={item.controlType === 'color' ? 'color' : 'text'}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value as T)}
            disabled={disabled}
            className="w-full max-w-xs px-3 py-1.5 text-xs rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50 disabled:opacity-50"
            aria-label={item.label}
          />
        )
      }
      case 'textarea': {
        return (
          <textarea
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value as T)}
            disabled={disabled}
            rows={3}
            className="w-full px-3 py-2 text-xs rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50 disabled:opacity-50 resize-y"
            aria-label={item.label}
          />
        )
      }
      case 'custom':
      default:
        return null
    }
  }

  const control = renderControl()

  return (
    <div className={`flex items-center justify-between gap-3 ${compact ? 'px-3 py-2' : 'py-3'} ${className}`}>
      <div className="min-w-0">
        <label className={labelClass}>{item.label}</label>
        <p className={descClass}>{item.description}</p>
      </div>
      {control}
    </div>
  )
}
