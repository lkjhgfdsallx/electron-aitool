// ==================== 全局配置类型 ====================

import type { MCPServerConfig } from './tool'

/**
 * 从 Provider 解析后的 AI 请求配置（供 aiService 使用）
 */
export interface ResolvedAIConfig {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  streamEnabled: boolean
}

export interface GlobalConfig {
  /** @deprecated 保留用于数据迁移，请使用 AIProvider 系统 */
  apiKey: string
  /** @deprecated 保留用于数据迁移，请使用 AIProvider 系统 */
  baseUrl: string
  /** @deprecated 保留用于数据迁移，请使用 AIProvider 系统 */
  defaultModel: string
  temperature: number
  maxTokens: number
  streamEnabled: boolean
  mcpServers: MCPServerConfig[]
  /** 当前激活的 AI 源 ID（全局默认） */
  activeProviderId?: string
}

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 4096,
  streamEnabled: true,
  mcpServers: [],
  activeProviderId: undefined
}
