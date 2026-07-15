/**
 * MemoryToolExecutor - 记忆工具执行器
 *
 * 处理 remember / recall / forget / list_memories。
 * 写入与读取尊重 Agent.memoryConfig.crossSession 与当前 conversationId。
 * 若 pauseBlocksRecall 且本对话已暂停注入，则阻断 recall / list_memories。
 */

import { memoryService } from '../../memory-service'
import type { ToolExecutor, AgentSessionContext, ToolSessionContext } from '../tool-executor'
import type { ToolExecuteResult } from '../../../types'

export class MemoryToolExecutor implements ToolExecutor {
  readonly toolNames = ['remember', 'recall', 'forget', 'list_memories']

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
        return this.handleRemember(args, agentSessionCtx)
      case 'recall':
        return this.handleRecall(args, agentSessionCtx)
      case 'forget':
        return this.handleForget(args, agentSessionCtx)
      case 'list_memories':
        return this.handleListMemories(args, agentSessionCtx)
      default:
        return { success: false, data: '', error: `MemoryToolExecutor: 未知工具 "${toolName}"` }
    }
  }

  private resolveScope(agentSessionCtx: AgentSessionContext): {
    agentId: string
    crossSession: boolean
    conversationId?: string
    sourceRunId: string
  } {
    const crossSession = agentSessionCtx.memoryCrossSession !== false
    const conversationId = agentSessionCtx.conversationId || undefined
    return {
      agentId: agentSessionCtx.agentId,
      crossSession,
      conversationId,
      sourceRunId: agentSessionCtx.runId,
    }
  }

  /** 暂停注入 + pauseBlocksRecall 时阻断主动读取类工具 */
  private isRecallBlocked(agentSessionCtx: AgentSessionContext): boolean {
    return !!(
      agentSessionCtx.memoryInjectionPaused &&
      agentSessionCtx.memoryPauseBlocksRecall
    )
  }

  private handleRemember(
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): ToolExecuteResult {
    const key = String(args.key ?? '')
    const value = String(args.value ?? '')
    if (!key || !value) {
      return { success: false, data: '', error: 'remember 工具需要 key 和 value 参数' }
    }
    const { agentId, crossSession, conversationId, sourceRunId } = this.resolveScope(agentSessionCtx)
    memoryService.remember({
      agentId,
      key,
      value,
      crossSession,
      conversationId,
      sourceRunId,
    })
    const scopeHint = crossSession ? '跨会话' : '仅本对话'
    return { success: true, data: `已记住（${scopeHint}）: ${key} = ${value}` }
  }

  private handleRecall(
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): ToolExecuteResult {
    if (this.isRecallBlocked(agentSessionCtx)) {
      return {
        success: true,
        data: '本对话已暂停长期记忆注入，且配置为暂停时阻断 recall。请用户恢复注入后再读取记忆。',
      }
    }
    const key = String(args.key ?? '')
    if (!key) {
      return { success: false, data: '', error: 'recall 工具需要 key 参数' }
    }
    const { agentId, crossSession, conversationId } = this.resolveScope(agentSessionCtx)
    const value = memoryService.recall({
      agentId,
      key,
      crossSession,
      conversationId,
    })
    if (value === null || value === undefined) {
      return { success: true, data: `没有找到关于 "${key}" 的记忆` }
    }
    return { success: true, data: `${key} = ${value}` }
  }

  private handleForget(
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): ToolExecuteResult {
    const key = String(args.key ?? '')
    if (!key) {
      return { success: false, data: '', error: 'forget 工具需要 key 参数' }
    }
    const { agentId, crossSession, conversationId } = this.resolveScope(agentSessionCtx)
    const removed = memoryService.forget({
      agentId,
      key,
      crossSession,
      conversationId,
    })
    if (!removed) {
      return { success: true, data: `没有找到可删除的记忆: "${key}"` }
    }
    return { success: true, data: `已忘记: ${key}` }
  }

  private handleListMemories(
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): ToolExecuteResult {
    if (this.isRecallBlocked(agentSessionCtx)) {
      return {
        success: true,
        data: '本对话已暂停长期记忆注入，且配置为暂停时阻断 list_memories。请用户恢复注入后再列出记忆。',
      }
    }
    const limitRaw = args.limit
    const limit =
      typeof limitRaw === 'number' && Number.isFinite(limitRaw)
        ? Math.min(100, Math.max(1, Math.floor(limitRaw)))
        : 50
    const query = args.query != null ? String(args.query) : undefined
    const { agentId, crossSession, conversationId } = this.resolveScope(agentSessionCtx)
    const items = memoryService.listMemories({
      agentId,
      crossSession,
      conversationId,
      limit,
      query,
    })
    if (items.length === 0) {
      return { success: true, data: '当前作用域下没有可见记忆。' }
    }
    const scopeHint = crossSession ? '跨会话' : '仅本对话'
    const lines = items.map((m, i) => {
      const preview =
        m.value.length > 120 ? `${m.value.slice(0, 120)}…` : m.value
      return `${i + 1}. [${m.key}] ${preview}`
    })
    return {
      success: true,
      data: [
        `可见记忆（${scopeHint}，列出 ${items.length} 条）:`,
        ...lines,
        '如需完整内容请使用 recall(key)。',
      ].join('\n'),
    }
  }
}
