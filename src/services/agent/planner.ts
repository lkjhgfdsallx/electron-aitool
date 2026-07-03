/**
 * PlannerToolExecutor - 结构化任务规划工具执行器（Phase 3）
 *
 * 处理三个规划工具：
 * - create_plan：LLM 产出结构化任务列表，引擎写入 Plan，发布 plan_created 事件
 * - update_task：LLM 标记任务状态变更，发布 task_updated 事件
 * - get_plan：LLM 读取当前计划
 *
 * Plan 数据存储在 ToolSessionContext 中（同一次 Agent 运行共享），
 * 并通过 AgentSessionContext.bus 发布事件供 UI 订阅。
 *
 * 可序列化：实现 SerializableToolExecutor，支持 checkpoint 断点恢复。
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  ToolExecutor,
  AgentSessionContext,
  ToolSessionContext,
  SerializableToolExecutor,
} from './tool-executor'
import type { ToolExecuteResult } from '../../types'
import type {
  AgentPlan,
  AgentTask,
  AgentTaskStatus,
  AgentPlanStatus,
  CreatePlanInput,
  CreatePlanTaskInput,
  UpdateTaskInput,
} from '../../types/agent-plan'
import {
  getPlanProgress,
  isPlanDone,
  hasPlanFailed,
} from '../../types/agent-plan'
import { agentEventBus } from './event-bus'

/** 规划工具的会话级状态 */
interface PlannerSessionContext extends ToolSessionContext {
  /** 当前活跃的计划（一次运行最多一个） */
  currentPlan: AgentPlan | null
}

export class PlannerToolExecutor implements SerializableToolExecutor {
  readonly toolNames = ['create_plan', 'update_task', 'get_plan']

  createContext(_sessionCtx: AgentSessionContext): ToolSessionContext {
    return {
      currentPlan: null,
    } as PlannerSessionContext
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    sessionCtx: ToolSessionContext,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    const ctx = sessionCtx as PlannerSessionContext
    switch (toolName) {
      case 'create_plan':
        return this.handleCreatePlan(args, ctx, agentSessionCtx)
      case 'update_task':
        return this.handleUpdateTask(args, ctx, agentSessionCtx)
      case 'get_plan':
        return this.handleGetPlan(ctx)
      default:
        return { success: false, data: '', error: `PlannerToolExecutor: 未知工具 "${toolName}"` }
    }
  }

  // ---- create_plan ----

  private handleCreatePlan(
    args: Record<string, unknown>,
    ctx: PlannerSessionContext,
    agentSessionCtx: AgentSessionContext,
  ): ToolExecuteResult {
    const goal = String(args.goal ?? '')
    const rawTasks = Array.isArray(args.tasks) ? args.tasks as unknown[] : []

    if (!goal) {
      return { success: false, data: '', error: 'create_plan 工具需要 goal 参数' }
    }
    if (rawTasks.length === 0) {
      return { success: false, data: '', error: 'create_plan 工具需要至少一个任务' }
    }

    // 解析任务输入，将 dependsOnIndexes 转换为任务 id
    const now = Date.now()
    const taskInputs: CreatePlanTaskInput[] = []
    const createdTasks: AgentTask[] = []

    for (let i = 0; i < rawTasks.length; i++) {
      const raw = rawTasks[i] as Record<string, unknown>
      const title = String(raw?.title ?? '')
      const description = String(raw?.description ?? '')
      if (!title) {
        return { success: false, data: '', error: `第 ${i + 1} 个任务缺少 title` }
      }
      const taskId = `task-${uuidv4().slice(0, 8)}`
      const dependsOnIndexes = Array.isArray(raw?.dependsOnIndexes)
        ? (raw.dependsOnIndexes as unknown[]).map((n) => Number(n))
        : []
      taskInputs.push({ title, description, dependsOnIndexes, assigneeId: raw?.assigneeId ? String(raw.assigneeId) : undefined })
      createdTasks.push({
        id: taskId,
        title,
        description,
        status: 'pending' as AgentTaskStatus,
        dependsOn: [], // 稍后根据 indexes 填充
        assigneeId: raw?.assigneeId ? String(raw.assigneeId) : undefined,
        artifacts: [],
        notes: '',
        createdAt: now,
        updatedAt: now,
      })
    }

    // 将 dependsOnIndexes 转换为 dependsOn（任务 id）
    for (let i = 0; i < taskInputs.length; i++) {
      const input = taskInputs[i]
      const task = createdTasks[i]
      for (const idx of input.dependsOnIndexes ?? []) {
        if (idx >= 0 && idx < createdTasks.length) {
          task.dependsOn.push(createdTasks[idx].id)
        }
      }
    }

    // 创建 Plan
    const plan: AgentPlan = {
      id: `plan-${uuidv4().slice(0, 8)}`,
      goal,
      tasks: createdTasks,
      status: 'draft' as AgentPlanStatus,
      runId: agentSessionCtx.runId,
      createdAt: now,
      updatedAt: now,
    }

    ctx.currentPlan = plan

    // 发布 plan_created 事件
    agentEventBus.emit('plan_created', {
      payload: { plan },
    })
    void agentSessionCtx // 标记参数已使用（runId 在事件中由 EventBus 自动填充）

    // 构建返回给 LLM 的信息
    const taskSummary = createdTasks.map((t, i) => {
      const deps = t.dependsOn.map((d) => createdTasks.findIndex((x) => x.id === d))
      const depStr = deps.length > 0 ? `（依赖: ${deps.map((d) => d + 1).join(', ')}）` : ''
      const assigneeStr = t.assigneeId ? ` [→ ${t.assigneeId}]` : ''
      return `${i + 1}. ${t.title}${depStr}${assigneeStr}`
    }).join('\n')

    return {
      success: true,
      data: `计划已创建（状态: draft，等待确认）\n\n目标: ${goal}\n\n任务列表 (${createdTasks.length}个):\n${taskSummary}\n\n⚠️ 当前计划为草稿状态。如果是 plan-and-execute 策略，计划需要用户确认后才会执行。你可以继续完善计划，或等待用户确认。`,
    }
  }

  // ---- update_task ----

  private handleUpdateTask(
    args: Record<string, unknown>,
    ctx: PlannerSessionContext,
    agentSessionCtx: AgentSessionContext,
  ): ToolExecuteResult {
    if (!ctx.currentPlan) {
      return { success: false, data: '', error: '当前没有活跃的计划，请先调用 create_plan 创建计划' }
    }

    const taskId = String(args.taskId ?? args.task_id ?? '')
    if (!taskId) {
      return { success: false, data: '', error: 'update_task 工具需要 taskId 参数' }
    }

    const task = ctx.currentPlan.tasks.find((t) => t.id === taskId || t.id === `task-${taskId}`)
    if (!task) {
      const availableTasks = ctx.currentPlan.tasks.map((t) => `${t.title}(${t.id})`).join('、')
      return {
        success: false,
        data: '',
        error: `未找到任务 "${taskId}"。可用任务: ${availableTasks || '无'}`,
      }
    }

    const updates: UpdateTaskInput = {
      taskId: task.id,
      status: args.status ? String(args.status) as AgentTaskStatus : undefined,
      notes: args.notes ? String(args.notes) : undefined,
      artifacts: Array.isArray(args.artifacts) ? (args.artifacts as unknown[]).map(String) : undefined,
    }

    // 应用更新
    if (updates.status) {
      const validStatuses: AgentTaskStatus[] = ['pending', 'in_progress', 'completed', 'failed', 'blocked']
      if (!validStatuses.includes(updates.status)) {
        return { success: false, data: '', error: `无效的任务状态: ${updates.status}。有效值: ${validStatuses.join(', ')}` }
      }
      task.status = updates.status
    }
    if (updates.notes) {
      task.notes = task.notes ? `${task.notes}\n${updates.notes}` : updates.notes
    }
    if (updates.artifacts && updates.artifacts.length > 0) {
      if (!task.artifacts) task.artifacts = []
      for (const a of updates.artifacts) {
        if (!task.artifacts.includes(a)) task.artifacts.push(a)
      }
    }
    task.updatedAt = Date.now()

    // 更新计划整体状态
    const plan = ctx.currentPlan
    plan.updatedAt = Date.now()
    if (plan.status === 'draft') {
      plan.status = 'executing'
    }
    if (isPlanDone(plan)) {
      plan.status = 'done'
    } else if (hasPlanFailed(plan)) {
      plan.status = 'failed'
    }

    // 发布 task_updated 事件
    agentEventBus.emit('task_updated', {
      payload: { task, plan },
    })
    void agentSessionCtx

    const progress = getPlanProgress(plan)
    const statusLabel = this.getStatusLabel(task.status)

    return {
      success: true,
      data: `任务 "${task.title}" 已更新为 ${statusLabel}。\n计划进度: ${progress}% (${plan.tasks.filter((t) => t.status === 'completed').length}/${plan.tasks.length})\n计划状态: ${plan.status}`,
    }
  }

  // ---- get_plan ----

  private handleGetPlan(ctx: PlannerSessionContext): ToolExecuteResult {
    if (!ctx.currentPlan) {
      return {
        success: true,
        data: '当前没有活跃的计划。',
      }
    }

    const plan = ctx.currentPlan
    const progress = getPlanProgress(plan)
    const taskList = plan.tasks.map((t, i) => {
      const statusIcon = this.getStatusIcon(t.status)
      const deps = t.dependsOn.map((d) => plan.tasks.findIndex((x) => x.id === d))
      const depStr = deps.length > 0 ? `（依赖: ${deps.map((d) => d + 1).join(', ')}）` : ''
      const assigneeStr = t.assigneeId ? ` [→ ${t.assigneeId}]` : ''
      const notesStr = t.notes ? `\n    备注: ${t.notes}` : ''
      return `${i + 1}. ${statusIcon} ${t.title}${depStr}${assigneeStr} [${t.status}]${notesStr}`
    }).join('\n')

    return {
      success: true,
      data: `当前计划\n目标: ${plan.goal}\n状态: ${plan.status}\n进度: ${progress}%\n\n任务列表:\n${taskList}`,
    }
  }

  // ---- 辅助 ----

  private getStatusLabel(status: AgentTaskStatus): string {
    const map: Record<AgentTaskStatus, string> = {
      pending: '待执行',
      in_progress: '进行中',
      completed: '已完成',
      failed: '失败',
      blocked: '已阻塞',
    }
    return map[status] ?? status
  }

  private getStatusIcon(status: AgentTaskStatus): string {
    const map: Record<AgentTaskStatus, string> = {
      pending: '⬜',
      in_progress: '🔄',
      completed: '✅',
      failed: '❌',
      blocked: '🚫',
    }
    return map[status] ?? '⬜'
  }

  // ---- SerializableToolExecutor: 支持 checkpoint 恢复 ----

  serialize(sessionCtx: ToolSessionContext): unknown {
    const ctx = sessionCtx as PlannerSessionContext
    return { currentPlan: ctx.currentPlan }
  }

  hydrate(snapshot: unknown, _sessionCtx: AgentSessionContext): ToolSessionContext {
    const snap = snapshot as { currentPlan?: AgentPlan } | null
    return {
      currentPlan: snap?.currentPlan ?? null,
    } as PlannerSessionContext
  }
}

// ==================== 模块级 Plan 访问器 ====================
//
// 引擎层（agent-engine.ts）需要访问当前 Plan 状态以实现 plan-accept 流程。
// 由于 Plan 存储在 ToolSessionContext 中，引擎无法直接访问。
// 提供 getPlanFromSessionBundle 辅助函数，从 SessionBundle 的序列化结果中提取 Plan。

/**
 * 从 SessionBundle 的序列化结果中提取当前 Plan
 *
 * @param serialized Bundle.serializeAll() 的返回值
 * @returns 当前 Plan 或 null
 */
export function extractPlanFromSerialized(serialized: Record<string, unknown>): AgentPlan | null {
  for (const key of Object.keys(serialized)) {
    const val = serialized[key] as { currentPlan?: AgentPlan } | null
    if (val && typeof val === 'object' && 'currentPlan' in val && val.currentPlan) {
      return val.currentPlan
    }
  }
  return null
}
