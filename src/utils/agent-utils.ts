/**
 * Agent 分类工具
 *
 * 统一判断 Agent 的来源类别（预设 / 工作区专属 / 用户自定义），
 * 供设置页 Agent 管理、对话页 Agent 选择器、Agent 详情弹窗等处复用，
 * 避免各处重复实现分类逻辑导致不一致。
 */
import { SYSTEM_AGENT_TAGS } from '../types'
import type { AgentProfile } from '../types'
import {
  DEFAULT_AGENT_ID,
  WEBSITE_ANALYZER_AGENT_ID,
  WORKSPACE_LEADER_AGENT_ID,
} from '../constants/default-agents'

/** Agent 来源类别 */
export type AgentCategory = 'preset' | 'workspace' | 'custom'

/** 预设 Agent 的固定 ID 集合（全局预设 + 工作区 Leader 预设） */
export const PRESET_AGENT_IDS: ReadonlySet<string> = new Set([
  DEFAULT_AGENT_ID,
  WEBSITE_ANALYZER_AGENT_ID,
  WORKSPACE_LEADER_AGENT_ID,
])

/**
 * 判断一个 Agent 是否为预设 Agent。
 *
 * 判定规则（满足任一即视为预设）：
 * 1. Agent 的 id 命中预设 ID 集合；
 * 2. Agent 携带 `leader` 系统标签（工作区 AI 领导预设）。
 *
 * 注意：预设 Agent 可能是全局作用域（需求分析、网站分析），
 * 也可能是工作区作用域（AI 领导），因此「预设」与「工作区」并非互斥维度。
 * {@link getAgentCategory} 会优先返回 preset 以突出其预设身份。
 */
export function isPresetAgent(agent: Pick<AgentProfile, 'id' | 'tags'>): boolean {
  if (PRESET_AGENT_IDS.has(agent.id)) return true
  return !!agent.tags?.includes(SYSTEM_AGENT_TAGS.LEADER)
}

/**
 * 判断一个 Agent 是否为工作区专属 Agent。
 *
 * 判定规则：携带 `workspace` 系统标签，或 scope === 'workspace'。
 */
export function isWorkspaceAgent(agent: Pick<AgentProfile, 'tags' | 'scope'>): boolean {
  if (agent.scope === 'workspace') return true
  return !!agent.tags?.includes(SYSTEM_AGENT_TAGS.WORKSPACE)
}

/**
 * 判断一个 Agent 是否为用户自定义 Agent。
 *
 * 即：既非预设、也非工作区专属的全局 Agent。
 */
export function isCustomAgent(agent: Pick<AgentProfile, 'id' | 'tags' | 'scope'>): boolean {
  return !isPresetAgent(agent) && !isWorkspaceAgent(agent)
}

/**
 * 获取 Agent 的主分类标签，用于 UI 展示。
 *
 * 优先级：preset > workspace > custom。
 * 预设的工作区 Leader 会归为 preset（突出其预设身份），
 * 其余工作区 Agent 归为 workspace，其余全局 Agent 归为 custom。
 */
export function getAgentCategory(agent: Pick<AgentProfile, 'id' | 'tags' | 'scope'>): AgentCategory {
  if (isPresetAgent(agent)) return 'preset'
  if (isWorkspaceAgent(agent)) return 'workspace'
  return 'custom'
}

/** Agent 分类展示元数据：标签文案、图标 key、主题色类 */
export interface AgentCategoryMeta {
  /** 分类唯一标识 */
  category: AgentCategory
  /** 中文标签文案 */
  label: string
  /** 简短文案（用于紧凑场景，如选择器内联标签） */
  shortLabel: string
  /** lucide 图标名（供组件按需映射为图标） */
  icon: 'Sparkles' | 'FolderOpen' | 'User'
  /** 亮色主题下的 Tailwind 类（背景 + 文字） */
  lightClass: string
  /** 暗色主题下的 Tailwind 类（背景 + 文字） */
  darkClass: string
}

/** 各分类的展示元数据，供徽章组件与分组标题复用 */
export const AGENT_CATEGORY_META: Record<AgentCategory, AgentCategoryMeta> = {
  preset: {
    category: 'preset',
    label: '预设',
    shortLabel: '预设',
    icon: 'Sparkles',
    lightClass: 'bg-violet-100 text-violet-600',
    darkClass: 'dark:bg-violet-900/30 dark:text-violet-300',
  },
  workspace: {
    category: 'workspace',
    label: '工作区专属',
    shortLabel: '工作区',
    icon: 'FolderOpen',
    lightClass: 'bg-amber-100 text-amber-600',
    darkClass: 'dark:bg-amber-900/30 dark:text-amber-400',
  },
  custom: {
    category: 'custom',
    label: '自定义',
    shortLabel: '自定义',
    icon: 'User',
    lightClass: 'bg-sky-100 text-sky-600',
    darkClass: 'dark:bg-sky-900/30 dark:text-sky-300',
  },
}

/** 获取某分类的展示元数据 */
export function getAgentCategoryMeta(category: AgentCategory): AgentCategoryMeta {
  return AGENT_CATEGORY_META[category]
}

/**
 * 将 Agent 列表按分类分组，保持「预设 → 工作区专属 → 自定义」的稳定展示顺序。
 * 每组内保持原数组的相对顺序。
 */
export function groupAgentsByCategory(agents: AgentProfile[]): { category: AgentCategory; agents: AgentProfile[] }[] {
  const buckets: Record<AgentCategory, AgentProfile[]> = {
    preset: [],
    workspace: [],
    custom: [],
  }
  for (const agent of agents) {
    buckets[getAgentCategory(agent)].push(agent)
  }
  return (['preset', 'workspace', 'custom'] as AgentCategory[])
    .map((category) => ({ category, agents: buckets[category] }))
    .filter((g) => g.agents.length > 0)
}
