// ==================== 对话相关类型 ====================

import type { ConversationAIConfig } from './ai-provider'

export interface Conversation {
  id: string
  title: string
  promptId?: string // 关联的提示词 ID
  /** 关联的 Agent ID（Agent 模式） */
  agentId?: string
  /** 关联的工作区 ID（工作区模式） */
  workspaceId?: string
  /** 对话级别的 AI 源配置（覆盖全局默认） */
  aiConfig?: ConversationAIConfig
  isPinned: boolean
  createdAt: number
  updatedAt: number
  messageCount: number
  /** 对话分支选择状态：分支点消息 ID → 当前激活的分支索引 */
  activeBranches?: Record<string, number>
  /** 当前对话激活的知识库集合 ID 列表（用户可在对话中临时切换） */
  activeKnowledgeBaseIds?: string[]
  /** 最后一条消息的预览文本（缓存，避免渲染时加载全部消息） */
  lastMessagePreview?: string
}

export type ConversationCreateInput = Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'messageCount'>
