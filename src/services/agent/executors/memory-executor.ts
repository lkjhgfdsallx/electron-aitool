/**
 * MemoryToolExecutor - 记忆工具执行器
 *
 * 处理 remember / recall 两个内置记忆工具。
 * 从 agent-engine.ts 的 handleRememberTool / handleRecallTool 拆出。
 */

import { memoryService } from '../../memory-service'
import type { ToolExecutor, AgentSessionContext, ToolSessionContext } from '../tool-executor'
import type { ToolExecuteResult } from '../../../types'

export class MemoryToolExecutor implements ToolExecutor {
  readonly toolNames = ['remember', 'recall']

  createContext(_sessionCtx: AgentSessionContext): ToolSessionContext {
    // 记忆工具无会话级状态，所有数据持久化在 memoryService 中
    return {}
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    _sessionCtx: ToolSessionContext,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    switch (toolName) {
      case 'remember':
        return this.handleRemember(args, agentSessionCtx.agentId)
      case 'recall':
        return this.handleRecall(args, agentSessionCtx.agentId)
      default:
        return { success: false, data: '', error: `MemoryToolExecutor: 未知工具 "${toolName}"` }
    }
  }

  private handleRemember(args: Record<string, unknown>, agentId: string): ToolExecuteResult {
    const key = String(args.key ?? '')
    const value = String(args.value ?? '')
    if (!key || !value) {
      return { success: false, data: '', error: 'remember 工具需要 key 和 value 参数' }
    }
    memoryService.remember(agentId, key, value)
    return { success: true, data: `已记住: ${key} = ${value}` }
  }

  private handleRecall(args: Record<string, unknown>, agentId: string): ToolExecuteResult {
    const key = String(args.key ?? '')
    if (!key) {
      return { success: false, data: '', error: 'recall 工具需要 key 参数' }
    }
    const value = memoryService.recall(agentId, key)
    if (value === null || value === undefined) {
      return { success: true, data: `没有找到关于 "${key}" 的记忆` }
    }
    return { success: true, data: `${key} = ${value}` }
  }
}
