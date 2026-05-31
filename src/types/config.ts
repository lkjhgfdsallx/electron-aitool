// ==================== 全局配置类型 ====================

import type { MCPServerConfig } from './tool'

export interface GlobalConfig {
  apiKey: string
  baseUrl: string
  defaultModel: string
  temperature: number
  maxTokens: number
  streamEnabled: boolean
  mcpServers: MCPServerConfig[]
}

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 4096,
  streamEnabled: true,
  mcpServers: []
}
