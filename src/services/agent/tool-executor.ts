/**
 * Agent 引擎重构 - Phase 0 脚手架
 *
 * 定义插件化工具执行器的核心接口。
 * 取代 agent-engine.ts 内的 if-else 硬编码工具分发。
 *
 * 设计要点：
 * - 引擎只负责"调用模型 → 解析工具调用 → 分发执行 → 反馈结果"循环
 * - 每个领域工具实现 ToolExecutor 接口，通过 toolExecutorRegistry 注册
 * - 工具的会话级状态（如 collectedRequirements、activeTaskId）收进各自的 ToolSessionContext
 */

import type { Tool, ToolExecuteResult, ResolvedAIConfig, AgentStep } from '../../types'
import type { WorkspaceContext, AgentEngineCallbacks } from '../agent-engine'

/**
 * 单次 Agent 运行共享的会话上下文
 *
 * 一次 runAgent 调用对应一个 AgentSessionContext，
 * 所有 ToolExecutor 在同一次运行中共享此上下文。
 */
export interface AgentSessionContext {
  /** 当前运行的 Agent id */
  agentId: string
  /** 当前运行的 Agent 名称 */
  agentName: string
  /** 本次运行的唯一 ID（用于 checkpoint 和 EventBus 关联） */
  runId: string
  /** 关联的对话 ID（用于 checkpoint 查询） */
  conversationId: string
  /** Agent 可用的工具列表 */
  agentTools: Tool[]
  /** 解析后的 AI 配置 */
  resolvedConfig: ResolvedAIConfig
  /** 中止信号 */
  signal: AbortSignal
  /** 工作区上下文（可选，工作区模式下提供） */
  workspace?: WorkspaceContext
  /** 引擎回调（用于 ask_human 等需要与 UI 交互的工具） */
  callbacks: AgentEngineCallbacks
  /** 当前步数计数器引用（与引擎共享，工具可推进步数） */
  stepCounter: { value: number }
  /** 已执行的步骤数组引用（工具可写入步骤，如 human_input） */
  steps: AgentStep[]
  /** 收集的产物路径（跨工具共享，write_file 等工具写入） */
  artifacts: string[]
}

/**
 * 单个 ToolExecutor 的会话级状态容器
 *
 * 每个执行器在同一次 Agent 运行中持有独立的状态，
 * 例如 RequirementToolExecutor 的 collectedRequirements、selfQARecords。
 * 用 Record 而非具体接口，让各执行器自定义其状态形状。
 */
export type ToolSessionContext = Record<string, unknown>

/**
 * 工具执行器接口 —— 所有工具统一实现此接口
 *
 * 取代 agent-engine.ts 中 30+ 个 if-else 分支：
 *   if (tc.name === 'remember') { result = handleRememberTool(args) }
 *   else if (tc.name === 'recall') { ... }
 *   ...
 *
 * 现在引擎只需：
 *   const executor = registry.resolve(toolName)
 *   const result = await executor.execute(toolName, args, sessionCtx)
 */
export interface ToolExecutor {
  /** 该执行器负责处理的工具名列表（如 ['remember', 'recall']） */
  readonly toolNames: string[]

  /**
   * 创建一次 Agent 运行的会话级上下文
   * 每次运行调用一次，返回的状态对象在整个运行期间被该执行器复用
   */
  createContext?(sessionCtx: AgentSessionContext): ToolSessionContext

  /**
   * 执行单个工具调用
   *
   * @param toolName 工具名（必须属于 toolNames 之一）
   * @param args 工具参数（已解析的 JSON 对象）
   * @param sessionCtx 该执行器的会话级状态（由 createContext 创建）
   * @param agentSessionCtx 整个 Agent 运行的共享上下文
   */
  execute(
    toolName: string,
    args: Record<string, unknown>,
    sessionCtx: ToolSessionContext,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> | ToolExecuteResult

  /** 运行结束时清理资源（如关闭浏览器、移除进度监听器） */
  destroy?(sessionCtx: ToolSessionContext, agentSessionCtx: AgentSessionContext): void
}

