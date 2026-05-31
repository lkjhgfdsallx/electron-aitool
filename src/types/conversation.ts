// ==================== 对话相关类型 ====================

export interface Conversation {
  id: string
  title: string
  promptId?: string // 关联的提示词 ID
  /** 关联的 Agent ID（Agent 模式） */
  agentId?: string
  isPinned: boolean
  createdAt: number
  updatedAt: number
  messageCount: number
}

export type ConversationCreateInput = Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'messageCount'>
