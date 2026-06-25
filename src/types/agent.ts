// ==================== Agent 相关类型 ====================

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
  /** 是否跨会话记忆 */
  crossSession: boolean
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
  /** 是否启用 */
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export type AgentProfileCreateInput = Omit<AgentProfile, 'id' | 'createdAt' | 'updatedAt'>
export type AgentProfileUpdateInput = Partial<Omit<AgentProfile, 'id' | 'createdAt'>> & { id: string }

// ==================== Agent 执行步骤类型 ====================

/** Agent 步骤类型 */
export type AgentStepType = 'thinking' | 'action' | 'observation' | 'final_answer' | 'error' | 'human_input'

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
