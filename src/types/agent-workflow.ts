// ==================== Agent 工作流状态机模型（Phase 4 / §5.2） ====================
//
// 将复杂 Agent 的"工作流"从提示词抽离为结构化状态机配置：
// - 每个状态可限定可用工具白名单（覆盖 enabledToolIds）
// - 每个状态可注入额外的提示词片段
// - 状态间通过转移条件（工具调用名 / 事件类型 / 自定义规则）自动切换
//
// 引擎（workflow-engine.ts）在每轮循环开始时：
// 1. 根据当前状态过滤工具列表
// 2. 拼接状态提示词到 systemPrompt
// 3. 执行完一轮后匹配转移条件推进状态
//
// 配置为纯 JSON，可序列化到 AgentProfile。

/**
 * 转移条件类型
 */
export type TransitionConditionType =
  | 'tool_called'      // 指定工具被调用
  | 'tool_result'      // 指定工具返回特定结果
  | 'plan_status'      // 计划进入某状态
  | 'always'           // 无条件（自动转移）
  | 'message_contains' // LLM 输出包含某关键词

/**
 * 单条转移条件
 */
export interface TransitionCondition {
  /** 条件类型 */
  type: TransitionConditionType
  /** tool_called/tool_result: 工具名 */
  toolName?: string
  /** tool_result: 期望的 success 值（true=成功，false=失败） */
  toolSuccess?: boolean
  /** plan_status: 计划状态值 */
  planStatus?: string
  /** message_contains: 关键词（不区分大小写） */
  keyword?: string
}

/**
 * 状态转移规则
 */
export interface WorkflowTransition {
  /** 目标状态名 */
  to: string
  /** 触发条件（满足任一即转移） */
  when: TransitionCondition[]
}

/**
 * 工作流中的单个状态
 */
export interface WorkflowState {
  /** 状态显示名 */
  label?: string
  /** 该状态下可用的工具名白名单（为空/省略则继承 enabledToolIds） */
  allowedTools?: string[]
  /** 进入该状态时注入 systemPrompt 的额外片段 */
  systemPromptSection?: string
  /** 出该状态的转移规则 */
  transitions: WorkflowTransition[]
}

/**
 * Agent 工作流定义（声明式状态机）
 */
export interface AgentWorkflow {
  /** 入口状态名 */
  initial: string
  /** 终止状态名集合（进入后不再转移） */
  terminals?: string[]
  /** 状态表 */
  states: Record<string, WorkflowState>
}

/**
 * 工作流运行时状态（可序列化到 checkpoint）
 */
export interface WorkflowRuntimeState {
  /** 当前状态名 */
  currentState: string
  /** 已访问的状态历史 */
  history: string[]
}

/**
 * 判断工作流是否进入终止状态
 */
export function isTerminalState(workflow: AgentWorkflow, stateName: string): boolean {
  return workflow.terminals?.includes(stateName) ?? false
}

/**
 * 校验工作流配置完整性（用于编辑器保存前校验）
 *
 * 返回错误消息列表，空数组表示通过。
 */
export function validateWorkflow(workflow: AgentWorkflow): string[] {
  const errors: string[] = []
  if (!workflow.initial) {
    errors.push('缺少入口状态（initial）')
  }
  if (!workflow.states || Object.keys(workflow.states).length === 0) {
    errors.push('状态列表（states）不能为空')
    return errors
  }
  if (workflow.initial && !workflow.states[workflow.initial]) {
    errors.push(`入口状态 "${workflow.initial}" 在 states 中不存在`)
  }
  for (const [name, state] of Object.entries(workflow.states)) {
    if (!state.transitions) {
      errors.push(`状态 "${name}" 缺少 transitions 字段`)
      continue
    }
    for (let i = 0; i < state.transitions.length; i++) {
      const t = state.transitions[i]
      if (!t.to) {
        errors.push(`状态 "${name}" 的转移 #${i + 1} 缺少目标状态（to）`)
      } else if (!workflow.states[t.to]) {
        errors.push(`状态 "${name}" 的转移目标 "${t.to}" 在 states 中不存在`)
      }
      if (!t.when || t.when.length === 0) {
        errors.push(`状态 "${name}" 的转移 #${i + 1} 缺少触发条件（when）`)
      }
    }
  }
  return errors
}
