import type { LucideIcon } from 'lucide-react'
import { Check, X, Info, Loader2 } from 'lucide-react'

export type StatusType = 'success' | 'error' | 'info' | 'loading'

export interface StatusFeedbackProps {
  type: StatusType
  message: string
  /** 是否可见 */
  visible?: boolean
  /** 关闭回调（显示 X 按钮） */
  onClose?: () => void
  className?: string
}

const STATUS_CONFIG: Record<
  StatusType,
  { icon: LucideIcon; bg: string; darkBg: string; border: string; darkBorder: string; text: string; darkText: string; iconColor: string; darkIconColor: string }
> = {
  success: {
    icon: Check,
    bg: 'bg-emerald-50',
    darkBg: 'dark:bg-emerald-950/20',
    border: 'border-emerald-200/60',
    darkBorder: 'dark:border-emerald-800/30',
    text: 'text-emerald-700',
    darkText: 'dark:text-emerald-300',
    iconColor: 'text-emerald-500',
    darkIconColor: 'dark:text-emerald-400',
  },
  error: {
    icon: X,
    bg: 'bg-red-50',
    darkBg: 'dark:bg-red-950/20',
    border: 'border-red-200/60',
    darkBorder: 'dark:border-red-800/30',
    text: 'text-red-700',
    darkText: 'dark:text-red-300',
    iconColor: 'text-red-500',
    darkIconColor: 'dark:text-red-400',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-50',
    darkBg: 'dark:bg-blue-950/20',
    border: 'border-blue-200/60',
    darkBorder: 'dark:border-blue-800/30',
    text: 'text-blue-700',
    darkText: 'dark:text-blue-300',
    iconColor: 'text-blue-500',
    darkIconColor: 'dark:text-blue-400',
  },
  loading: {
    icon: Loader2,
    bg: 'bg-surface-50',
    darkBg: 'dark:bg-surface-800/60',
    border: 'border-surface-200/60',
    darkBorder: 'dark:border-surface-700/40',
    text: 'text-surface-700',
    darkText: 'dark:text-surface-300',
    iconColor: 'text-accent-500',
    darkIconColor: 'dark:text-accent-400',
  },
}

/**
 * 统一状态反馈横幅组件。
 *
 * 支持 success/error/info/loading 四种语义类型，统一 animate-fade-in 进入动画。
 *
 * 替代：
 * - ModelParamsSection/ToolEditor 中的"已保存" feedback span
 * - DataManagementSection 中的 StatusBanner 组件
 * - KnowledgeBaseSettings 中缺少的自动保存反馈
 * - UIPreferencesSection 中缺少的自动保存反馈
 */
export function StatusFeedback({
  type,
  message,
  visible = true,
  onClose,
  className = '',
}: StatusFeedbackProps) {
  if (!visible) return null

  const cfg = STATUS_CONFIG[type]
  const Icon = type === 'loading' ? cfg.icon : cfg.icon
  const iconSpin = type === 'loading'

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs animate-fade-in-up ${cfg.bg} ${cfg.darkBg} ${cfg.border} ${cfg.darkBorder} ${cfg.text} ${cfg.darkText} ${className}`}
    >
      <Icon size={13} className={`flex-shrink-0 ${iconSpin ? 'animate-spin' : ''} ${cfg.iconColor} ${cfg.darkIconColor}`} />
      <span className="flex-1">{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}