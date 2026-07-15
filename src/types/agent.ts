// ==================== Agent 相关类型 ====================

import type { PromptSection, PromptVariable } from './prompt'
import type { AgentWorkflow } from './agent-workflow'

/**
 * 规划策略
 */
export type PlanningStrategy =
  | 'react'           // ReAct：思考-行动-观察 循环
  | 'plan-and-execute' // 先拆解子任务，再逐步执行
  | 'trial-and-error'  // 允许试错重试

/**
 * 记忆配置
 */
export interface MemoryConfig {
  /** 对话历史保留轮数 */
  historyTurns: number
  /** 是否启用长期记忆 */
  longTermEnabled: boolean
  /** 是否跨会话记忆（true=按 agent 全局共享；false=仅当前对话） */
  crossSession: boolean
  /** 自动注入最多条数（默认 30） */
  maxInjectEntries?: number
  /** 自动注入最大字符数（默认 4000） */
  maxInjectChars?: number
  /**
   * 本对话暂停注入时是否同时阻断 recall / list_memories。
   * 默认 false：暂停只影响自动注入，Agent 仍可主动召回。
   */
  pauseBlocksRecall?: boolean
}

/**
 * 终止条件
 */
export interface TerminationConfig {
  /** 最大推理步数 */
  maxSteps: number
  /** 超时时间（秒） */
  timeoutSeconds: number
  /** 达到目标后自动结束 */
  autoStopOnGoal: boolean
}

/**
 * Agent 模型配置（可覆盖全局配置）
 */
export interface AgentModelConfig {
  /** 绑定的 AI 源 ID（为空则使用对话/全局配置） */
  providerId?: string
  /** 绑定的模型 ID（为空则使用对话/全局配置） */
  modelId?: string
  /** @deprecated 保留用于数据迁移，请使用 modelId */
  model?: string
  /** temperature（为空则使用全局配置） */
  temperature?: number
  /** max_tokens（为空则使用全局配置） */
  maxTokens?: number
}

/**
 * 系统保留标签
 */
export const SYSTEM_AGENT_TAGS = {
  /** 标识为工作区独立 Agent */
  WORKSPACE: 'workspace',
  /** 标识为工作区 AI 领导 Agent（隐含 WORKSPACE 标签） */
  LEADER: 'leader',
} as const

export type SystemAgentTag = typeof SYSTEM_AGENT_TAGS[keyof typeof SYSTEM_AGENT_TAGS]

/** Agent 作用域：全局 Agent 存在于应用级配置，工作区 Agent 跟随工作区文件持久化。 */
export type AgentScope = 'global' | 'workspace'

/**
 * Agent 配置文件（用户可自主设计的 Agent）
 */
export interface AgentProfile {
  id: string
  name: string
  description: string
  avatar?: string // emoji 或图标名
  /** 系统提示词：定义 Agent 身份、目标、行为规范 */
  systemPrompt: string
  /** 该 Agent 可用的工具 ID 列表 */
  enabledToolIds: string[]
  /** 规划策略 */
  planningStrategy: PlanningStrategy
  /** 记忆配置 */
  memoryConfig: MemoryConfig
  /** 终止条件 */
  termination: TerminationConfig
  /** 模型配置（覆盖全局） */
  modelConfig: AgentModelConfig
  /** 绑定的知识库集合 ID 列表（为空则搜索全部） */
  knowledgeBaseIds?: string[]
  /** 绑定的 Skills ID 列表（为空则不注入任何 Skills） */
  enabledSkillIds?: string[]
  /** 标签列表（`workspace` 为系统保留标签，标识工作区独立 Agent） */
  tags?: string[]
  /** Agent 作用域：缺省视为 global，用于兼容旧数据 */
  scope?: AgentScope
  /** 工作区 Agent 所属的工作区文件夹路径；scope='workspace' 时应存在 */
  workspaceFolderPath?: string
  /** 是否启用 */
  enabled: boolean

  // ===== 扩展字段（全部可选，向后兼容） =====

  /** 复用提示词系统的段落（与 systemPrompt 组合或替代） */
  promptSections?: PromptSection[]
  /** 引用已有 Prompt 模板 id（Prompt 系统） */
  promptTemplateId?: string
  /** 变量定义（同 Prompt 系统） */
  variables?: PromptVariable[]
  /** 行为编排（状态机定义） */
  workflow?: AgentWorkflow
  /** 上下文管理策略 */
  contextPolicy?: ContextPolicy
  /** 工具审批门槛覆盖 */
  approvalPolicy?: ApprovalPolicy
  /** 并行度上限 */
  maxParallelSubtasks?: number

  createdAt: number
  updatedAt: number
}

/**
 * 上下文管理策略
 */
export interface ContextPolicy {
  /** 策略：fixed=固定截断（丢弃早期），compress=摘要压缩 */
  strategy: 'fixed' | 'compress'
  /** 触发压缩/截断的 token 阈值（字符数近似） */
  maxTokens?: number
  /** 保留的原始最近轮数 */
  keepRecentTurns?: number
}

/**
 * 工具审批策略
 */
export interface ApprovalPolicy {
  /** 需要审批的工具名列表 */
  requireApprovalFor?: string[]
  /** 自动批准只读类工具 */
  autoApproveRead?: boolean
  /** 自动批准写类工具 */
  autoApproveWrite?: boolean
}

export type AgentProfileCreateInput = Omit<AgentProfile, 'id' | 'createdAt' | 'updatedAt'>
export type AgentProfileUpdateInput = Partial<Omit<AgentProfile, 'id' | 'createdAt'>> & { id: string }

// ==================== Agent 执行步骤类型 ====================

/** Agent 步骤类型 */
export type AgentStepType = 'thinking' | 'action' | 'observation' | 'final_answer' | 'error' | 'human_input' | 'subtask_result'

/** 单个 Agent 执行步骤 */
export interface AgentStep {
  id: string
  type: AgentStepType
  /** 步骤内容 */
  content: string
  /** 如果是 action，记录工具调用信息 */
  toolCall?: {
    name: string
    arguments: Record<string, unknown>
  }
  /** 如果是 observation，记录工具执行结果 */
  toolResult?: {
    success: boolean
    data: string
    error?: string
  }
  /** 如果是 human_input，记录供用户选择的选项 */
  humanChoice?: {
    question: string
    options: Array<{ label: string; value: string; description?: string }>
    allowMultiple?: boolean
  }
  /** 如果是 human_input，记录用户的选择结果（单选为字符串，多选为字符串数组） */
  humanResponse?: string | string[]
  /** 步骤序号 */
  stepIndex: number
  /** 时间戳 */
  timestamp: number
  /** 来源 Agent ID（子 Agent 执行时标识来源） */
  sourceAgentId?: string
  /** 来源 Agent 名称（用于 UI 展示） */
  sourceAgentName?: string
  /** 来源 Agent 头像 */
  sourceAgentAvatar?: string
  /** 子任务结构化成果（type='subtask_result' 时，Boomerang 回流） */
  subtaskResult?: {
    agentId: string
    agentName: string
    task: string
    content: string
    status: 'success' | 'error' | 'partial'
    stepCount: number
    error?: string
    artifacts?: string[]
    timestamp: number
  }
}

/** Agent 运行状态 */
export type AgentRunStatus = 'idle' | 'running' | 'completed' | 'error' | 'stopped'

/** Agent 运行上下文 */
export interface AgentRunContext {
  /** 关联的 Agent ID */
  agentId: string
  /** 当前运行状态 */
  status: AgentRunStatus
  /** 已执行的步骤 */
  steps: AgentStep[]
  /** 当前步数 */
  currentStep: number
  /** 错误信息 */
  error?: string
  /** 开始时间 */
  startedAt?: number
  /** 结束时间 */
  endedAt?: number
}

// ==================== 提示词类型已迁移至 prompt.ts ====================
// 保留 re-export 以维持向后兼容
export type {
  Prompt,
  PromptCreateInput,
  PromptUpdateInput,
  PromptVariable,
  PromptVariableType,
  PromptSection,
  PromptSectionType,
  PromptVersion,
  PromptABTest,
  PromptChain,
  PromptChainNode,
  VariableValidationResult,
  VariableRenderResult,
  PromptRuntimeContext,
  BuiltinContextVariable,
  DiffResult,
  DiffLine,
} from './prompt'
export { BUILTIN_CONTEXT_VARIABLES, SECTION_TYPE_META } from './prompt'
