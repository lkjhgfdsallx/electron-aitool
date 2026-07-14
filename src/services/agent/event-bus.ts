import type { AgentStep, AgentRunStatus } from '../../types'

/** Agent 引擎事件类型 */
export type AgentEventType =
  | 'step'                 // 步骤产生
  | 'token'                // 文本 token
  | 'reasoning_token'      // 推理 token
  | 'status_change'        // 状态变更
  | 'error'                // 错误
  | 'done'                 // 完成
  | 'human_input'          // 需要人工输入
  | 'report_ready'         // 报告就绪
  | 'site_analyzer_progress' // 网站分析进度
  | 'context_compressed'   // 上下文压缩
  | 'plan_created'         // 计划创建
  | 'task_updated'         // 任务更新

/** Agent 事件 */
export interface AgentEvent {
  /** 事件类型 */
  type: AgentEventType
  /** 事件序列号（同一次运行内单调递增） */
  seq: number
  /** 时间戳 */
  timestamp: number
  /** 关联的运行 id */
  runId: string
  /** 关联的 Agent id */
  agentId: string
  /** 步骤（type='step' 时） */
  step?: AgentStep
  /** token 文本（type='token'/'reasoning_token' 时） */
  token?: string
  /** 状态（type='status_change' 时） */
  status?: AgentRunStatus
  /** 错误信息（type='error' 时） */
  error?: string
  /** 最终内容（type='done' 时） */
  content?: string
  /** 自定义负载 */
  payload?: unknown
}

/** 事件订阅器 */
export type AgentEventHandler = (event: AgentEvent) => void

/** 事件总线接口 */
export interface EventBus {
  /** 发布事件（type + payload 模式，内部自动构建完整 AgentEvent） */
  emit(type: AgentEventType, payload?: Partial<AgentEvent>): void
  /** 订阅事件（返回取消订阅函数） */
  on(type: AgentEventType | '*', handler: AgentEventHandler): () => void
  /** 取消所有订阅 */
  clear(): void
}

/**
 * 事件总线实现
 *
 * 每次 runAgent 调用 startRun(runId) 初始化，
 * 循环中 emit 事件，UI 层 on/subscribe 处理。
 */
class EventBusImpl implements EventBus {
  private handlers = new Map<string, Set<AgentEventHandler>>()
  private wildcardHandlers = new Set<AgentEventHandler>()
  private seqCounter = 0
  private _runId: string | null = null
  private _agentId: string | null = null
  private debug = false

  /** 开始一次运行（重置序列号、关联 runId 和 agentId） */
  startRun(runId: string, agentId: string): void {
    this._runId = runId
    this._agentId = agentId
    this.seqCounter = 0
    if (this.debug) {
      console.log(`[EventBus] startRun: runId=${runId}, agentId=${agentId}`)
    }
  }

  /** 获取当前事件序列号 */
  get currentSeq(): number {
    return this.seqCounter
  }

  /** 获取当前运行 ID */
  get currentRunId(): string | null {
    return this._runId
  }

  /** 发布事件 */
  emit(type: AgentEventType, payload?: Partial<AgentEvent>): void {
    if (!this._runId || !this._agentId) {
      console.warn('[EventBus] emit called without startRun, ignoring')
      return
    }

    const event: AgentEvent = {
      type,
      seq: this.seqCounter++,
      timestamp: Date.now(),
      runId: this._runId!,
      agentId: this._agentId,
      ...payload,
    }

    if (this.debug) {
      console.log(`[EventBus] emit: ${type} seq=${event.seq}`, payload)
    }

    // 分发给类型订阅者
    const typeHandlers = this.handlers.get(type)
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(event)
        } catch (err) {
          console.error('[EventBus] handler error:', err)
        }
      }
    }

    // 分发给通配订阅者
    for (const handler of this.wildcardHandlers) {
      try {
        handler(event)
      } catch (err) {
        console.error('[EventBus] wildcard handler error:', err)
      }
    }
  }

  /** 订阅事件（返回取消订阅函数） */
  on(type: AgentEventType | '*', handler: AgentEventHandler): () => void {
    if (type === '*') {
      this.wildcardHandlers.add(handler)
      return () => { this.wildcardHandlers.delete(handler) }
    }

    let set = this.handlers.get(type)
    if (!set) {
      set = new Set<AgentEventHandler>()
      this.handlers.set(type, set)
    }
    set.add(handler)
    return () => {
      set!.delete(handler)
      if (set!.size === 0) {
        this.handlers.delete(type)
      }
    }
  }

  /** 取消所有订阅 */
  clear(): void {
    this.handlers.clear()
    this.wildcardHandlers.clear()
  }

  /** 设置调试模式 */
  setDebug(enabled: boolean): void {
    this.debug = enabled
  }
}

/** 全局 Agent 事件总线单例 */
export const agentEventBus = new EventBusImpl()
