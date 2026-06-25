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
  /** 自定义工具的 JS 函数体（async 箭头函数） */
  code?: string
  /** 执行超时时间（毫秒），默认 5000 */
  timeout?: number
}

export interface ToolExecuteResult {
  success: boolean
  data: string
  error?: string
  /** 执行耗时（毫秒） */
  durationMs?: number
}

/** 工具调用统计 */
export interface ToolCallStats {
  toolName: string
  callCount: number
  successCount: number
  failureCount: number
  totalDurationMs: number
  lastCalledAt: number // timestamp
}

export type ToolCreateInput = Omit<Tool, 'id' | 'isBuiltIn' | 'isMCP' | 'mcpServerId'>

/** MCP 服务器配置 */
export interface MCPServerConfig {
  id: string
  name: string
  /** 启动 MCP 服务器的命令，如 "npx" */
  command: string
  /** 命令参数，如 ["-y", "@upstash/context7-mcp"] */
  args: string[]
  /** 环境变量 */
  env?: Record<string, string>
  /** 自动允许的工具名称列表（无需用户确认） */
  alwaysAllow?: string[]
  enabled: boolean
  description?: string
}
