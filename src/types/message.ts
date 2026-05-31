// ==================== 消息相关类型 ====================

import type { AgentStep } from './agent'

export interface ToolCall {
  id: string
  name: string
  arguments: string // JSON 字符串
  result?: string
  status: 'pending' | 'running' | 'completed' | 'error'
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/** 消息附件 */
export interface MessageAttachment {
  name: string
  type: string   // MIME 类型，如 'image/png'、'text/plain'
  content: string // 图片为 base64 data URL，文本为纯文本内容
  size: number
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  reasoningContent?: string // 思考过程（如 DeepSeek R1）
  timestamp: number
  tokenUsage?: TokenUsage
  toolCalls?: ToolCall[]
  toolCallId?: string   // 工具返回结果时关联的调用 ID
  toolName?: string     // 工具返回结果时的工具名称
  isStreaming?: boolean
  isError?: boolean
  isEdited?: boolean
  parentId?: string     // 重新生成时关联的原始消息 ID
  attachments?: MessageAttachment[] // 附件列表
  /** Agent 执行步骤（Agent 模式下的思考链、工具调用等） */
  agentSteps?: AgentStep[]
  /** 关联的 Agent ID */
  agentId?: string
}

export type MessageCreateInput = Omit<Message, 'id' | 'timestamp'>
