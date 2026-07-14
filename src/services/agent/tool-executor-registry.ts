/**
 * 引擎通过 resolve(toolName) 获取执行器，每次运行创建独立的 session bundle。
 */

import type {
  ToolExecutor,
  AgentSessionContext,
  ToolSessionContext,
} from './tool-executor'

/**
 * 单次 Agent 运行的执行器绑定集合
 *
 * 一次 runAgent 调用对应一个 SessionBundle：
 * - 各执行器持有独立的 ToolSessionContext（会话级状态）
 * - 运行结束时调用 destroyAll 清理资源
 */
export interface ToolExecutorSessionBundle {
  /** 按工具名解析执行器 */
  resolve: (toolName: string) => {
    executor: ToolExecutor
    sessionCtx: ToolSessionContext
  } | undefined

  /** 运行结束时清理所有执行器的资源 */
  destroyAll: () => void
}

class ToolExecutorRegistryImpl {
  /** 工具名 → 执行器（全局唯一注册） */
  private readonly executors = new Map<string, ToolExecutor>()

  /** 通用兜底执行器（处理未注册的工具，如 MCP/自定义工具） */
  private fallbackExecutor: ToolExecutor | null = null

  /**
   * 注册工具执行器
   * @param executor 执行器实例
   */
  register(executor: ToolExecutor): void {
    for (const name of executor.toolNames) {
      if (this.executors.has(name)) {
        console.warn(`[ToolExecutorRegistry] 工具 "${name}" 被重复注册，后者覆盖前者`)
      }
      this.executors.set(name, executor)
    }
  }

  /**
   * 注册兜底执行器
   *
   * 当 resolve(toolName) 找不到专用执行器时使用。
   * GenericToolExecutor 会调用 toolService.executeTool 处理 MCP/自定义工具。
   *
   * @param executor 兜底执行器（toolNames 通常为空，因为通过 isFallback 标识）
   */
  registerFallback(executor: ToolExecutor): void {
    this.fallbackExecutor = executor
  }

  /** 查询某工具名是否已注册专用执行器 */
  has(toolName: string): boolean {
    return this.executors.has(toolName)
  }

  /** 获取已注册的所有工具名 */
  listToolNames(): string[] {
    return Array.from(this.executors.keys())
  }

  /**
   * 为一次 Agent 运行创建执行器绑定集合
   *
   * - 为每个已注册的执行器创建独立的 ToolSessionContext
   * - 返回 resolve 函数，引擎用它按工具名查找执行器及其 session 上下文
   * - 未注册的工具 fallback 到 fallbackExecutor
   *
   * @param sessionCtx 一次 Agent 运行的共享会话上下文
   */
  createSessionBundle(sessionCtx: AgentSessionContext): ToolExecutorSessionBundle {
    // 每个执行器 → 其在本轮运行中的 session 上下文
    const sessionCtxMap = new Map<ToolExecutor, ToolSessionContext>()

    /** 获取（或创建）执行器在本轮运行的 session 上下文 */
    const getSessionCtx = (executor: ToolExecutor): ToolSessionContext => {
      if (!sessionCtxMap.has(executor)) {
        sessionCtxMap.set(
          executor,
          executor.createContext ? executor.createContext(sessionCtx) : {},
        )
      }
      return sessionCtxMap.get(executor)!
    }

    return {
      resolve: (toolName: string) => {
        const executor = this.executors.get(toolName) ?? this.fallbackExecutor
        if (!executor) return undefined
        return {
          executor,
          sessionCtx: getSessionCtx(executor),
        }
      },
      destroyAll: () => {
        for (const [executor, ctx] of sessionCtxMap) {
          try {
            executor.destroy?.(ctx, sessionCtx)
          } catch (e) {
            console.error('[ToolExecutorRegistry] destroy 异常:', e)
          }
        }
        sessionCtxMap.clear()
      },
    }
  }
}

/** 全局工具执行器注册表（启动时由 src/services/agent/index.ts 完成注册） */
export const toolExecutorRegistry = new ToolExecutorRegistryImpl()
