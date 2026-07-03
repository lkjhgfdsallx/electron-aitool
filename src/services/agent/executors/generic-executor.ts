/**
 * GenericToolExecutor - 通用兜底工具执行器
 *
 * 处理所有未注册到专用执行器的工具，包括：
 * - MCP 工具（由 mcp-service 动态提供）
 * - 用户自定义工具（由 custom-tool-store 管理）
 * - 其他未分类工具
 *
 * 作为 toolExecutorRegistry 的 fallback，
 * 通过 toolService.executeTool 完成实际执行。
 */

import { toolService } from '../../tool-service'
import type { ToolExecutor, AgentSessionContext, ToolSessionContext } from '../tool-executor'
import type { ToolExecuteResult } from '../../../types'

export class GenericToolExecutor implements ToolExecutor {
  // 兜底执行器不声明具体 toolNames，由 registry 的 fallback 机制接管
  readonly toolNames: string[] = []

  createContext(_sessionCtx: AgentSessionContext): ToolSessionContext {
    return {}
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    _sessionCtx: ToolSessionContext,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    return await toolService.executeTool(toolName, args, agentSessionCtx.agentTools)
  }
}
