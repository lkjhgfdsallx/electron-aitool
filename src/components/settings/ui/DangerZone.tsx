import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

export interface DangerZoneProps {
  children: ReactNode
  title?: string
  description?: string
  className?: string
}

/**
 * 统一危险区域容器组件。
 *
 * 使用 danger Token（border-danger-200/40 dark:border-danger-800/20），
 * 替代 KnowledgeBaseSettings 中 red-200 原生色 和 DataManagementSection 中 danger Token
 * 两套不统一风格。
 *
 * 包裹所有危险操作（清空/删除/重置数据库等），提供统一的视觉警示。
 */
export function DangerZone({
  children,
  title = '危险操作',
  description = '以下操作可能不可逆，请谨慎使用',
  className = '',
}: DangerZoneProps) {
  return (
    <div className={`rounded-xl border border-danger-200/40 dark:border-danger-800/20 overflow-hidden ${className}`}>
      {/* 标题栏 */}
      <div className="flex items-center gap-2 px-5 py-3 bg-danger-50/50 dark:bg-danger-950/15 border-b border-danger-200/30 dark:border-danger-800/15">
        <AlertTriangle size={14} className="text-danger-500 flex-shrink-0" />
        <div>
          <h4 className="text-xs font-semibold text-danger-700 dark:text-danger-300">{title}</h4>
          <p className="text-[10px] text-danger-500/80 dark:text-danger-400/80 mt-0.5">{description}</p>
        </div>
      </div>
      {/* 内容区 */}
      <div className="p-5">
        {children}
      </div>
    </div>
  )
}