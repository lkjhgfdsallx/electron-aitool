import type { Tool, ToolDefinition, ToolExecuteResult } from '../types'
import { mcpService } from './mcp-service'
import { memoryService } from './memory-service'

/**
 * 工具服务 - 管理工具定义与执行
 */
export const toolService = {
  /**
   * 将 Tool 转换为 OpenAI Function Calling 格式
   */
  toToolDefinition(tool: Tool): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }
  },

  /**
   * 将工具列表转换为 OpenAI Function Calling 格式
   */
  toToolDefinitions(tools: Tool[]): ToolDefinition[] {
    return tools.filter((t) => t.enabled).map((t) => this.toToolDefinition(t))
  },

  /**
   * 执行工具调用
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    tools: Tool[]
  ): Promise<ToolExecuteResult> {
    const tool = tools.find((t) => t.name === toolName)
    if (!tool) {
      return { success: false, data: '', error: `工具 "${toolName}" 未找到` }
    }

    try {
      // 内置工具
      if (tool.isBuiltIn) {
        return await this.executeBuiltInTool(toolName, args)
      }

      // MCP 工具
      if (tool.isMCP && tool.mcpServerId) {
        return await mcpService.callTool(tool.mcpServerId, toolName, args)
      }

      return { success: false, data: '', error: '未知的工具类型' }
    } catch (error) {
      const message = error instanceof Error ? error.message : '工具执行失败'
      return { success: false, data: '', error: message }
    }
  },

  /**
   * 执行内置工具
   */
  async executeBuiltInTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolExecuteResult> {
    switch (toolName) {
      case 'get_current_time':
        return {
          success: true,
          data: JSON.stringify({
            datetime: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          })
        }

      case 'calculate': {
        try {
          const expression = String(args.expression ?? '')
          // 简单的数学表达式计算（仅允许数字和运算符）
          if (!/^[\d\s+\-*/().%^]+$/.test(expression)) {
            return { success: false, data: '', error: '不安全的表达式' }
          }
          const result = Function(`"use strict"; return (${expression})`)()
          return { success: true, data: JSON.stringify({ expression, result }) }
        } catch {
          return { success: false, data: '', error: '计算表达式无效' }
        }
      }

      case 'remember': {
        const key = String(args.key ?? '')
        const value = String(args.value ?? '')
        if (!key || !value) {
          return { success: false, data: '', error: 'remember 工具需要 key 和 value 参数' }
        }
        // 使用固定 agentId 'default'，实际调用时由 agent-engine 覆盖
        memoryService.remember('default', key, value)
        return { success: true, data: `已记住: ${key} = ${value}` }
      }

      case 'recall': {
        const key = String(args.key ?? '')
        if (!key) {
          return { success: false, data: '', error: 'recall 工具需要 key 参数' }
        }
        const value = memoryService.recall('default', key)
        if (value === null || value === undefined) {
          return { success: true, data: `没有找到关于 "${key}" 的记忆` }
        }
        return { success: true, data: `${key} = ${value}` }
      }

      case 'ask_self':
      case 'define_requirement':
      case 'review_requirements':
      case 'ask_human':
        // 这些工具由 agent-engine 内部处理，不应走到这里
        return { success: true, data: '此工具由 Agent 引擎内部处理，请通过 Agent 模式使用。' }

      default:
        return { success: false, data: '', error: `未知的内置工具: ${toolName}` }
    }
  }
}
