// ==================== 工具相关类型 ====================

/** 符合 OpenAI Function Calling 格式的工具定义 */
export interface ToolFunction {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema
}

export interface ToolDefinition {
  type: 'function'
  function: ToolFunction
}

export interface Tool {
  id: string
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema
  isBuiltIn: boolean
  isMCP: boolean
  mcpServerId?: string
  enabled: boolean
}

export interface ToolExecuteResult {
  success: boolean
  data: string
  error?: string
}

export type ToolCreateInput = Omit<Tool, 'id' | 'isBuiltIn' | 'isMCP' | 'mcpServerId'>

/** MCP 服务器配置 */
export interface MCPServerConfig {
  id: string
  name: string
  url: string
  enabled: boolean
  description?: string
}
