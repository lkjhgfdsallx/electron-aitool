/**
 * Agent 分类徽章
 *
 * 统一渲染「预设 / 工作区专属 / 自定义」分类标签，
 * 供设置页 Agent 管理、对话页 Agent 选择器、Agent 详情弹窗复用，
 * 保证各处视觉与文案一致。
 *
 * 复用 {@link getAgentCategory} / {@link AGENT_CATEGORY_META} 工具，
 * 避免在多个组件中重复实现分类判断与样式。
 */
import { Sparkles, FolderOpen, User } from 'lucide-react'
import type { AgentProfile } from '../../types'
import {
  getAgentCategory,
  getAgentCategoryMeta,
  type AgentCategory,
} from '../../utils/agent-utils'

/** 图标名 → lucide 组件映射 */
const ICON_MAP = {
  Sparkles: Sparkles,
  FolderOpen: FolderOpen,
  User: User,
} as const

export interface AgentCategoryBadgeProps {
  /** 目标 Agent；若提供则自动推断分类 */
  agent?: Pick<AgentProfile, 'id' | 'tags' | 'scope'>
  /** 直接指定分类，优先级高于 agent 推断 */
  category?: AgentCategory
  /** 是否显示图标（默认 true） */
  showIcon?: boolean
  /** 使用简短文案（如「工作区」而非「工作区专属」），默认 false */
  short?: boolean
  /** 图标尺寸（px），默认 9 */
  iconSize?: number
  /** 额外类名 */
  className?: string
}

/**
 * 渲染单个分类徽章。
 *
 * 用法：
 * ```tsx
 * <AgentCategoryBadge agent={agent} />
 * <AgentCategoryBadge category="preset" short />
 * ```
 */
export function AgentCategoryBadge({
  agent,
  category,
  showIcon = true,
  short = false,
  iconSize = 9,
  className = '',
}: AgentCategoryBadgeProps) {
  const resolved = category ?? (agent ? getAgentCategory(agent) : 'custom')
  const meta = getAgentCategoryMeta(resolved)
  const Icon = ICON_MAP[meta.icon]
  const text = short ? meta.shortLabel : meta.label

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full ${meta.lightClass} ${meta.darkClass} ${className}`}
    >
      {showIcon && <Icon size={iconSize} />}
      {text}
    </span>
  )
}
