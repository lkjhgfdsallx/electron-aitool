// ==================== Agent 结构化任务规划模型（Phase 3） ====================
//
// 取代旧的 planningStrategy 纯文字提示，提供显式 Plan 对象：
// - LLM 通过 create_plan 工具产出结构化任务列表
// - 用户可在 UI（AgentTodoPanel）查看 / 编辑 / 确认计划
// - 引擎根据 plan-and-execute 策略强制走 plan-accept 流程
// - 支持任务依赖（dependsOn）用于并行拓扑调度
//
// Plan 数据为纯 JSON，可安全序列化。

/**
 * 任务状态
 */
export type AgentTaskStatus =
  | 'pending'      // 待执行
  | 'in_progress'  // 进行中
  | 'completed'    // 已完成
  | 'failed'       // 失败
  | 'blocked'      // 被阻塞（依赖未满足 / 缺资源）

/**
 * 计划整体状态
 */
export type AgentPlanStatus =
  | 'draft'      // 草稿：LLM 刚产出，等待用户确认（仅 plan-and-execute 策略强制）
  | 'approved'   // 已确认：用户已接受计划，进入执行
  | 'executing'  // 执行中
  | 'done'       // 全部完成
  | 'failed'     // 失败（关键任务失败）

/**
 * 单个任务
 */
export interface AgentTask {
  /** 任务唯一 id */
  id: string
  /** 任务标题（简短，用于 UI 卡片展示） */
  title: string
  /** 任务详细描述 */
  description: string
  /** 任务状态 */
  status: AgentTaskStatus
  /** 依赖的任务 id 列表（用于排序与并行判断） */
  dependsOn: string[]
  /** 分派给的 Agent id（多 Agent 场景；为空表示由当前 Agent 自行执行） */
  assigneeId?: string
  /** 完成后产出的产物路径（文件路径等） */
  artifacts?: string[]
  /** 备注（执行过程中的补充说明、错误信息等） */
  notes?: string
  /** 创建时间 */
  createdAt: number
  /** 最后更新时间 */
  updatedAt: number
}

/**
 * Agent 执行计划
 *
 * 一次 Agent 运行最多持有一个活跃 Plan（可被覆盖/重建）。
 * Plan 由 LLM 通过 create_plan 工具创建，由用户或引擎推进状态。
 */
export interface AgentPlan {
  /** 计划唯一 id */
  id: string
  /** 计划目标（用户原始意图 / 任务总述） */
  goal: string
  /** 任务列表 */
  tasks: AgentTask[]
  /** 计划状态 */
  status: AgentPlanStatus
  /** 关联的运行 id（用于 checkpoint 恢复定位） */
  runId?: string
  /** 创建时间 */
  createdAt: number
  /** 最后更新时间 */
  updatedAt: number
}

// ==================== 工具调用入参类型（供 planner.ts 使用） ====================

/** create_plan 工具入参中的单个任务定义 */
export interface CreatePlanTaskInput {
  title: string
  description: string
  /** 依赖的任务序号（从 0 开始，对应 tasks 数组下标）；引擎会转换为任务 id */
  dependsOnIndexes?: number[]
  /** 分派给的 Agent id */
  assigneeId?: string
}

/** create_plan 工具入参 */
export interface CreatePlanInput {
  goal: string
  tasks: CreatePlanTaskInput[]
}

/** update_task 工具入参 */
export interface UpdateTaskInput {
  /** 任务 id */
  taskId: string
  /** 新状态 */
  status?: AgentTaskStatus
  /** 补充的备注（追加，不覆盖） */
  notes?: string
  /** 新增的产物路径（追加，不覆盖） */
  artifacts?: string[]
}

// ==================== 辅助函数 ====================

/**
 * 计算计划进度（0-100）
 */
export function getPlanProgress(plan: AgentPlan): number {
  if (plan.tasks.length === 0) return 0
  const done = plan.tasks.filter((t) => t.status === 'completed').length
  return Math.round((done / plan.tasks.length) * 100)
}

/**
 * 判断计划是否全部完成
 */
export function isPlanDone(plan: AgentPlan): boolean {
  return plan.tasks.length > 0 && plan.tasks.every((t) => t.status === 'completed')
}

/**
 * 判断计划是否有失败任务
 */
export function hasPlanFailed(plan: AgentPlan): boolean {
  return plan.tasks.some((t) => t.status === 'failed')
}

/**
 * 获取当前可执行的任务（状态为 pending 且所有依赖已完成）
 */
export function getReadyTasks(plan: AgentPlan): AgentTask[] {
  const taskMap = new Map(plan.tasks.map((t) => [t.id, t]))
  return plan.tasks.filter((t) => {
    if (t.status !== 'pending') return false
    return t.dependsOn.every((depId) => taskMap.get(depId)?.status === 'completed')
  })
}

/**
 * 对任务做拓扑排序（按依赖关系）
 *
 * 用于并行调度：同层（无依赖或依赖已完成）的任务可并行执行。
 * 返回分层结果，每层内的任务无相互依赖，可并行。
 *
 * @throws 若存在循环依赖
 */
export function topologicalSort(tasks: AgentTask[]): AgentTask[][] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]))
  const result: AgentTask[][] = []
  const resolved = new Set<string>()

  // 防止循环依赖导致死循环
  const maxIterations = tasks.length + 1
  let iteration = 0

  while (resolved.size < tasks.length) {
    if (iteration++ > maxIterations) {
      throw new Error('[topologicalSort] 检测到循环依赖，无法排序')
    }
    // 找出当前层：依赖全部已 resolved 的未处理任务
    const layer = tasks.filter((t) => {
      if (resolved.has(t.id)) return false
      return t.dependsOn.every((depId) => resolved.has(depId) || !taskMap.has(depId))
    })
    if (layer.length === 0) {
      // 剩余任务存在循环依赖，直接放入最后一层避免死锁
      const remaining = tasks.filter((t) => !resolved.has(t.id))
      result.push(remaining)
      remaining.forEach((t) => resolved.add(t.id))
      break
    }
    result.push(layer)
    layer.forEach((t) => resolved.add(t.id))
  }

  return result
}
