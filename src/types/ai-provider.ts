// ==================== AI 源（Provider）相关类型 ====================

/**
 * Provider 类型：本地模型 或 远程 API
 */
export type ProviderType = 'remote' | 'local'

/**
 * 连接状态
 */
export type ConnectionStatus = 'unknown' | 'checking' | 'online' | 'offline' | 'error'

/**
 * 连接健康检查结果
 */
export interface ConnectionHealth {
  /** 当前连接状态 */
  status: ConnectionStatus
  /** 最后一次成功连接的时间戳 */
  lastConnectedAt?: number
  /** 最后一次检查的时间戳 */
  lastCheckedAt?: number
  /** 最后一次错误信息 */
  lastError?: string
  /** 响应延迟（毫秒） */
  latencyMs?: number
}

/**
 * 请求配置（每个 Provider 可独立设置）
 */
export interface ProviderRequestConfig {
  /** 请求超时时间（毫秒），默认 30000 */
  timeout?: number
  /** 失败重试次数，默认 0 */
  maxRetries?: number
  /** 自定义 HTTP 头（某些代理/网关需要） */
  customHeaders?: Record<string, string>
}

/**
 * 本地模型配置（用于 Ollama / LM Studio 等）
 */
export interface LocalModelConfig {
  /** 启动命令，如 "ollama serve" */
  launchCommand?: string
  /** 服务端口，默认从 baseUrl 解析 */
  port?: number
  /** 是否自动启动服务 */
  autoStart?: boolean
}

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
  /** 模型标签/分组，如 ["推理", "便宜", "长上下文"] */
  tags?: string[]
  /** 是否已弃用 */
  deprecated?: boolean
  /** 是否不可用 */
  unavailable?: boolean
  /** 覆盖的上下文窗口大小（token 数），用于 Agent 调度 */
  contextWindow?: number
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
  /** Provider 类型：远程 API 或本地模型 */
  type?: ProviderType
  /** 该源下的模型列表（从 /v1/models 拉取或手动添加） */
  models: AIModel[]
  /** 当前选中的默认模型 ID */
  defaultModelId?: string
  /** 最后拉取模型列表的时间戳 */
  modelsFetchedAt?: number
  /** 是否为默认 provider */
  isDefault?: boolean
  /** 连接健康检查信息 */
  health?: ConnectionHealth
  /** 请求配置 */
  requestConfig?: ProviderRequestConfig
  /** 本地模型配置（仅 type=local 时有效） */
  localConfig?: LocalModelConfig
  createdAt: number
  updatedAt: number
}

export type AIProviderCreateInput = Omit<AIProvider, 'id' | 'createdAt' | 'updatedAt' | 'models' | 'modelsFetchedAt' | 'health'> & {
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
