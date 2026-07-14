/**
 * WorkflowEngine - 工作流状态机引擎
 *
 * 在 Agent 循环的每一轮中：
 * 1. 根据当前状态过滤工具列表（allowedTools 白名单覆盖 enabledToolIds）
 * 2. 拼接当前状态的 systemPromptSection 到系统提示词
 * 3. 一轮结束后，根据转移条件（工具调用 / 计划状态 / 消息关键词）推进状态
 *
 * 引擎本身无副作用、可序列化（WorkflowRuntimeState），便于 checkpoint 恢复。
 */

import type {
  AgentWorkflow,
  WorkflowState,
  WorkflowRuntimeState,
  WorkflowTransition,
  TransitionCondition,
  Tool,
} from '../../types'
import { isTerminalState } from '../../types'

/** 一轮 Agent 执行后用于评估转移的上下文 */
export interface TransitionContext {
  /** 本轮 LLM 调用的工具名（如有） */
  toolCalled?: string
  /** 该工具调用是否成功 */
  toolSuccess?: boolean
  /** 本轮 LLM 输出的文本内容 */
  assistantContent?: string
  /** 当前计划状态（'draft'/'approved'/'executing'/'done'/'failed'/null） */
  planStatus?: string | null
}

/**
 * 创建工作流运行时初始状态
 */
export function createWorkflowRuntimeState(workflow: AgentWorkflow): WorkflowRuntimeState {
  return {
    currentState: workflow.initial,
    history: [workflow.initial],
  }
}

/**
 * 获取当前状态的配置（不存在则返回 null）
 */
export function getCurrentState(
  workflow: AgentWorkflow,
  runtime: WorkflowRuntimeState,
): WorkflowState | null {
  return workflow.states[runtime.currentState] ?? null
}

/**
 * 按当前状态的 allowedTools 白名单过滤工具列表
 *
 * - 若状态未定义 allowedTools 或为空数组：返回原始工具列表（继承 enabledToolIds）
 * - 否则：仅保留 allowedTools 中列出的工具
 */
export function filterToolsByState(
  workflow: AgentWorkflow,
  runtime: WorkflowRuntimeState,
  tools: Tool[],
): Tool[] {
  const state = getCurrentState(workflow, runtime)
  if (!state || !state.allowedTools || state.allowedTools.length === 0) {
    return tools
  }
  const allowed = new Set(state.allowedTools)
  return tools.filter((t) => allowed.has(t.id) || allowed.has(t.name))
}

/**
 * 获取当前状态应注入 systemPrompt 的额外片段
 */
export function getStatePromptSection(
  workflow: AgentWorkflow,
  runtime: WorkflowRuntimeState,
): string {
  const state = getCurrentState(workflow, runtime)
  if (!state || !state.systemPromptSection) return ''
  return state.systemPromptSection
}

/**
 * 评估单个转移条件是否满足
 */
function matchCondition(cond: TransitionCondition, ctx: TransitionContext): boolean {
  switch (cond.type) {
    case 'tool_called':
      return cond.toolName != null && ctx.toolCalled === cond.toolName
    case 'tool_result':
      return (
        cond.toolName != null &&
        ctx.toolCalled === cond.toolName &&
        (cond.toolSuccess == null || ctx.toolSuccess === cond.toolSuccess)
      )
    case 'plan_status':
      return cond.planStatus != null && ctx.planStatus === cond.planStatus
    case 'message_contains':
      if (!cond.keyword || !ctx.assistantContent) return false
      return ctx.assistantContent.toLowerCase().includes(cond.keyword.toLowerCase())
    case 'always':
      return true
    default:
      return false
  }
}

/**
 * 评估一条转移规则（when 中任一条件满足即触发）
 */
function matchTransition(transition: WorkflowTransition, ctx: TransitionContext): boolean {
  if (!transition.when || transition.when.length === 0) return false
  return transition.when.some((cond) => matchCondition(cond, ctx))
}

/**
 * 根据转移上下文推进工作流状态（返回是否发生转移 + 新状态）
 *
 * - 终止状态不再转移
 * - 按当前状态 transitions 顺序匹配第一条满足的规则
 * - 转移后将新状态追加到 history
 */
export function advanceState(
  workflow: AgentWorkflow,
  runtime: WorkflowRuntimeState,
  ctx: TransitionContext,
): { runtime: WorkflowRuntimeState; transitioned: boolean } {
  // 终止状态不再转移
  if (isTerminalState(workflow, runtime.currentState)) {
    return { runtime, transitioned: false }
  }

  const state = getCurrentState(workflow, runtime)
  if (!state || !state.transitions) {
    return { runtime, transitioned: false }
  }

  for (const transition of state.transitions) {
    if (matchTransition(transition, ctx)) {
      const newState = transition.to
      if (workflow.states[newState] && newState !== runtime.currentState) {
        return {
          runtime: {
            currentState: newState,
            history: [...runtime.history, newState],
          },
          transitioned: true,
        }
      }
    }
  }

  return { runtime, transitioned: false }
}

/**
 * 判断是否是计划相关工具
 */
export function isPlanTool(toolName: string): boolean {
  return ['create_plan', 'update_task', 'get_plan'].includes(toolName)
}

/**
 * 判断是否是任务执行工具（可用于排除 create_plan 后的执行阶段）
 */
export function isTaskExecutionTool(toolName: string): boolean {
  const taskTools = new Set([
    'workspace_execute_command',
    'workspace_write_file',
    'workspace_read_file',
    'workspace_list_files',
    'workspace_create_agent',
    'workspace_dispatch_task',
    'workspace_dispatch_parallel',
    'web_search',
    'fetch_webpage',
    'remember',
    'recall',
  ])
  return taskTools.has(toolName)
}

/**
 * 工作流引擎（无状态工具函数集合，状态由调用方持有 WorkflowRuntimeState）
 */
export const workflowEngine = {
  createRuntime: createWorkflowRuntimeState,
  getCurrentState,
  filterTools: filterToolsByState,
  getPromptSection: getStatePromptSection,
  advance: advanceState,
}
