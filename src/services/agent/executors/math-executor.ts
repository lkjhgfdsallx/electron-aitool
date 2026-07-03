/**
 * MathToolExecutor - 数学工具执行器
 *
 * 处理所有 math_* 系列工具：
 * - math_analyze / math_algebra / math_geometry / math_number / math_symbolic / math_verify
 *
 * 从 agent-engine.ts 的 executeMathTool 调用拆出。
 */

import { executeMathTool } from '../../math-tools'
import type { ToolExecutor, AgentSessionContext, ToolSessionContext } from '../tool-executor'
import type { ToolExecuteResult } from '../../../types'

export class MathToolExecutor implements ToolExecutor {
  readonly toolNames = [
    'math_analyze',
    'math_algebra',
    'math_geometry',
    'math_number',
    'math_symbolic',
    'math_verify',
  ]

  createContext(_sessionCtx: AgentSessionContext): ToolSessionContext {
    // 数学工具无会话级状态
    return {}
  }

  execute(
    toolName: string,
    args: Record<string, unknown>,
    _sessionCtx: ToolSessionContext,
    _agentSessionCtx: AgentSessionContext,
  ): ToolExecuteResult {
    if (!this.toolNames.includes(toolName)) {
      return { success: false, data: '', error: `MathToolExecutor: 未知工具 "${toolName}"` }
    }
    return executeMathTool(toolName, args)
  }
}
