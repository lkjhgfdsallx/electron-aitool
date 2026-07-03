/**
 * Agent 引擎重构 - 注册入口
 *
 * 此文件是 src/services/agent/ 模块的统一入口：
 * - 注册所有 ToolExecutor 到全局 registry
 * - 导出核心类型和 registry 实例
 * - 供 agent-engine.ts 和外部消费者使用
 */

// ---- 核心类型 & registry 实例 ----
import type {
  ToolExecutor,
  AgentSessionContext,
  ToolSessionContext,
  SerializableToolExecutor,
} from './tool-executor'

import { toolExecutorRegistry } from './tool-executor-registry'

import type { ToolExecutorSessionBundle } from './tool-executor-registry'

// ---- Phase 2 Event Bus + Checkpoint ----
import type {
  AgentEventType,
  AgentEvent,
  AgentEventHandler,
  EventBus,
} from './event-bus'

import {
  agentEventBus,
} from './event-bus'

import type {
  AgentCheckpoint,
  CheckpointStore,
} from './checkpoint-store'

import {
  checkpointStore,
} from './checkpoint-store'

// ---- 执行器类 ----
import { MemoryToolExecutor } from './executors/memory-executor'
import { RequirementToolExecutor } from './executors/requirement-executor'
import { HumanInputToolExecutor } from './executors/human-input-executor'
import { SiteAnalyzerToolExecutor } from './executors/site-analyzer-executor'
import { WorkspaceToolExecutor } from './executors/workspace-executor'
import { MathToolExecutor } from './executors/math-executor'
import { GenericToolExecutor } from './executors/generic-executor'
import { PlannerToolExecutor } from './planner'

// ---- 导出 ----
export type {
  ToolExecutor,
  AgentSessionContext,
  ToolSessionContext,
  SerializableToolExecutor,
}
export { toolExecutorRegistry }
export type { ToolExecutorSessionBundle }
export type { AgentEventType, AgentEvent, AgentEventHandler, EventBus }
export { agentEventBus }
export type { AgentCheckpoint, CheckpointStore }
export { checkpointStore }
export {
  MemoryToolExecutor,
  RequirementToolExecutor,
  HumanInputToolExecutor,
  SiteAnalyzerToolExecutor,
  WorkspaceToolExecutor,
  MathToolExecutor,
  GenericToolExecutor,
  PlannerToolExecutor,
}

// ---- 注册所有执行器 ----

/**
 * 将所有内置 ToolExecutor 注册到全局 registry
 *
 * 应在应用启动时调用一次（如在 App.tsx 或 main.tsx 中）。
 * 注册顺序：专用执行器 → 兜底执行器。
 */
export function registerAllExecutors(): void {
  // 专用执行器（按领域划分）
  toolExecutorRegistry.register(new MemoryToolExecutor())
  toolExecutorRegistry.register(new RequirementToolExecutor())
  toolExecutorRegistry.register(new HumanInputToolExecutor())
  toolExecutorRegistry.register(new SiteAnalyzerToolExecutor())
  toolExecutorRegistry.register(new WorkspaceToolExecutor())
  toolExecutorRegistry.register(new MathToolExecutor())
  // Phase 3: 结构化任务规划执行器（create_plan / update_task / get_plan）
  toolExecutorRegistry.register(new PlannerToolExecutor())

  // 兜底执行器（处理 MCP / 自定义 / 其他未分类工具）
  toolExecutorRegistry.registerFallback(new GenericToolExecutor())
}
