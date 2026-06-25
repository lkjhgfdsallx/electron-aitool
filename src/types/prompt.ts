// ==================== 提示词变量系统 ====================

/** 变量基础类型 */
export type PromptVariableType = 'string' | 'number' | 'boolean' | 'select' | 'textarea'

/** 变量定义 */
export interface PromptVariable {
  /** 变量名（对应 {{variable_name}} 中的 variable_name） */
  name: string
  /** 显示标签 */
  label: string
  /** 变量类型 */
  type: PromptVariableType
  /** 默认值 */
  defaultValue?: string | number | boolean
  /** 占位提示 */
  placeholder?: string
  /** 是否必填 */
  required: boolean
  /** 仅 select 类型：可选项 */
  options?: Array<{ label: string; value: string }>
  /** 变量描述（tooltip） */
  description?: string
}

// ==================== 结构化提示词段落 ====================

/** 段落类型 */
export type PromptSectionType =
  | 'role'         // 角色设定
  | 'task'         // 任务目标
  | 'constraints'  // 约束条件
  | 'output'       // 输出格式
  | 'few_shot'     // Few-shot 示例
  | 'custom'       // 自定义段落

/** 段落类型元数据 */
export const SECTION_TYPE_META: Record<PromptSectionType, { label: string; icon: string; placeholder: string }> = {
  role:        { label: '角色设定',   icon: '🎭', placeholder: '你是一个专业的...' },
  task:        { label: '任务目标',   icon: '🎯', placeholder: '请帮我完成以下任务...' },
  constraints: { label: '约束条件',   icon: '⚠️', placeholder: '请遵循以下规则...' },
  output:      { label: '输出格式',   icon: '📋', placeholder: '请以以下格式输出...' },
  few_shot:    { label: 'Few-shot 示例', icon: '💡', placeholder: '输入：...\n输出：...' },
  custom:      { label: '自定义段落', icon: '📝', placeholder: '在此输入内容...' },
}

/** 提示词段落 */
export interface PromptSection {
  id: string
  type: PromptSectionType
  title: string
  content: string
  enabled: boolean
  order: number
}

// ==================== 版本管理 ====================

/** 版本快照 */
export interface PromptVersion {
  id: string
  promptId: string
  version: number
  label: string
  snapshot: {
    name: string
    description: string
    content: string
    sections?: PromptSection[]
    variables?: PromptVariable[]
  }
  createdAt: number
}

// ==================== A/B 测试 ====================

/** A/B 测试配置 */
export interface PromptABTest {
  id: string
  promptId: string
  versionA: {
    content: string
    sections?: PromptSection[]
    variables?: PromptVariable[]
  }
  versionB: {
    content: string
    sections?: PromptSection[]
    variables?: PromptVariable[]
  }
  /** 分配策略 */
  strategy: 'random' | 'alternate' | 'manual'
  /** 是否启用 */
  enabled: boolean
  createdAt: number
}

// ==================== 提示词链 ====================

/** 提示词链节点 */
export interface PromptChainNode {
  id: string
  promptId: string
  order: number
  /** 变量映射：将上一个节点的输出映射到本节点的某个变量 */
  variableMapping?: Record<string, string>
}

/** 提示词链 */
export interface PromptChain {
  id: string
  name: string
  description: string
  nodes: PromptChainNode[]
  createdAt: number
  updatedAt: number
}

// ==================== 核心 Prompt 接口 ====================

export interface Prompt {
  id: string
  name: string
  description: string

  // 内容 — 两种模式二选一
  /** 简单模式：纯文本内容（支持 {{variable}} 语法） */
  content: string
  /** 结构化模式：分段内容（与 content 互斥，sections 存在时优先使用） */
  sections?: PromptSection[]

  // 变量系统
  variables: PromptVariable[]

  // 组织与检索
  tags: string[]
  category?: string
  favorite: boolean
  pinned: boolean

  // 版本
  currentVersion: number
  versionHistory: PromptVersion[]

  // A/B 测试
  abTest?: PromptABTest

  // 元数据
  createdAt: number
  updatedAt: number
}

export type PromptCreateInput = Omit<Prompt, 'id' | 'createdAt' | 'updatedAt' | 'currentVersion' | 'versionHistory'>
export type PromptUpdateInput = Partial<Omit<Prompt, 'id' | 'createdAt'>> & { id: string }

// ==================== 变量渲染结果 ====================

export interface VariableValidationResult {
  valid: boolean
  missing: string[]     // 缺失的必填变量名
  invalid: string[]     // 类型不匹配的变量名
}

export interface VariableRenderResult {
  content: string       // 渲染后的完整内容
  warnings: string[]    // 渲染过程中的警告（如未定义变量）
}

// ==================== 内置上下文变量 ====================

export interface PromptRuntimeContext {
  currentAgentName?: string
  defaultModel?: string
  userName?: string
  conversationTopic?: string
}

/** 内置上下文变量键名 */
export const BUILTIN_CONTEXT_VARIABLES = [
  'current_date',
  'current_time',
  'current_datetime',
  'active_agent_name',
  'default_model',
  'user_name',
  'conversation_topic',
] as const

export type BuiltinContextVariable = (typeof BUILTIN_CONTEXT_VARIABLES)[number]

// ==================== Diff 结果 ====================

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
  lineNumber?: number
}

export interface DiffResult {
  lines: DiffLine[]
  addedCount: number
  removedCount: number
  unchangedCount: number
}
