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
  /** 对话分支选择状态：分支点消息 ID → 当前激活的分支索引 */
  activeBranches?: Record<string, number>
}

export type ConversationCreateInput = Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'messageCount'>
