// ==================== AI 源（Provider）相关类型 ====================

/**
 * AI 模型
 */
export interface AIModel {
  /** 模型 ID，如 "gpt-4o-mini", "deepseek-chat" */
  id: string
  /** 显示名称 */
  name: string
  /** 模型提供者，如 "openai", "deepseek" */
  ownedBy?: string
}

/**
 * AI 源（Provider）- 代表一个 AI 服务提供者
 * 每个 Provider 包含 baseUrl + apiKey，下面挂多个模型
 */
export interface AIProvider {
  id: string
  /** 显示名称，如 "OpenAI", "DeepSeek", "本地 Ollama" */
  name: string
  /** API 基础地址，如 "https://api.openai.com/v1" */
  baseUrl: string
  /** API 密钥 */
  apiKey: string
  /** 该源下的模型列表（从 /v1/models 拉取或手动添加） */
  models: AIModel[]
  /** 当前选中的默认模型 ID */
  defaultModelId?: string
  /** 最后拉取模型列表的时间戳 */
  modelsFetchedAt?: number
  /** 是否为默认 provider */
  isDefault?: boolean
  createdAt: number
  updatedAt: number
}

export type AIProviderCreateInput = Omit<AIProvider, 'id' | 'createdAt' | 'updatedAt' | 'models' | 'modelsFetchedAt'> & {
  models?: AIModel[]
}
export type AIProviderUpdateInput = Partial<Omit<AIProvider, 'id' | 'createdAt'>> & { id: string }

/**
 * 对话级别的 AI 配置（记录当前对话使用的 provider）
 * 模型由 provider.defaultModelId 决定
 */
export interface ConversationAIConfig {
  /** 使用的 AI 源 ID */
  providerId: string
}
