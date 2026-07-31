/**
 * 工作区运行总览（WorkspaceRunOverview）
 *
 * Phase 1.1：从 messages 派生运行态（goal / plan / 子 Agent / 事件 / 变更）。
 * Phase 4.2：UI 入口迁至 WorkspaceRunStrip（单行摘要 + 精简 Popover）。
 * 本文件默认导出的全宽 UI 标记为 legacy，仅保留 deriveRunOverview 作为数据源。
 *
 * 派生目标：用户不展开步骤也能回答：
 *  - 当前目标是什么
 *  - 计划进度（completed/total + 并行中数量；计划可选）
 *  - 哪个成员在跑 / 成功 / 失败
 *  - 最近事件 1~3 条
 *  - 主操作：停止 / 查看计划 / 查看变更
 */

import { useState, useMemo } from 'react'
import { Loader2, CheckCircle2, AlertCircle, Ban, Users, Clock, FilePenLine, ListTodo } from 'lucide-react'
import type { Message } from '../../types'
import type { AgentPlan } from '../../types/agent-plan'
import { getPlanProgress, isPlanDone, hasPlanFailed } from '../../types/agent-plan'
import { useAppTranslation } from '../../i18n/hooks'

/** 单个子 Agent 的运行时状态摘要 */
interface SubAgentStatus {
  agentId: string
  agentName: string
  agentAvatar?: string
  status: 'running' | 'success' | 'error' | 'idle'
  stepCount: number
  lastToolName?: string
  hasArtifacts: boolean
  errorMessage?: string
}

/** 无计划时的展示理由 */
export type RunOverviewNoPlanReason = 'not_created' | 'cleared' | 'not_needed'

/** 派生的运行总览状态 */
export interface WorkspaceRunOverviewState {
  hasActiveRun: boolean
  goal?: string
  plan?: AgentPlan
  subAgents: SubAgentStatus[]
  recentEvents: RecentEvent[]
  changesCount: number
  isStreaming: boolean
  /** 是否存在结构化计划（create_plan 可选） */
  hasPlan: boolean
  /** 无计划时的展示理由 */
  noPlanReason?: RunOverviewNoPlanReason
  /** 计划进度 0–100（无 plan 时为 undefined） */
  progress?: number
  completedTaskCount?: number
  totalTaskCount?: number
}

const EMPTY_RUN_STATE: WorkspaceRunOverviewState = {
  hasActiveRun: false,
  subAgents: [],
  recentEvents: [],
  changesCount: 0,
  isStreaming: false,
  hasPlan: false,
}

/** 最近事件项 */
interface RecentEvent {
  agentName: string
  agentAvatar?: string
  text: string
  kind: 'step' | 'success' | 'error' | 'plan'
}

function pickAvatar(msg: Message | undefined, agentId: string, fallbackName: string, fallbackAvatar?: string): string | undefined {
  if (msg?.agentSteps) {
    for (const s of msg.agentSteps) {
      if (s.sourceAgentId === agentId && s.sourceAgentAvatar) return s.sourceAgentAvatar
    }
  }
  return fallbackAvatar ?? '🤖'
}

/** 从消息列表派生出运行总览状态 */
export function deriveRunOverview(messages: Message[]): WorkspaceRunOverviewState {
  if (!messages || messages.length === 0) {
    return { ...EMPTY_RUN_STATE }
  }

  // 找到最后一条 streaming 或最后一条 assistant 消息（当前运行）
  let currentMsg: Message | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'assistant' && (m.isStreaming || (m.agentSteps && m.agentSteps.length > 0) || m.agentPlan)) {
      currentMsg = m
      break
    }
  }
  if (!currentMsg) {
    return { ...EMPTY_RUN_STATE }
  }

  const plan = currentMsg.agentPlan
  const goal = plan?.goal || currentMsg.content?.slice(0, 120) || undefined
  const isStreaming = !!currentMsg.isStreaming

  // 收集子 Agent 状态
  const subMap = new Map<string, SubAgentStatus>()
  const recentEvents: RecentEvent[] = []
  const steps = currentMsg.agentSteps ?? []

  for (const s of steps) {
    if (!s.sourceAgentId) continue
    const id = s.sourceAgentId
    let entry = subMap.get(id)
    if (!entry) {
      entry = {
        agentId: id,
        agentName: s.sourceAgentName || '子 Agent',
        agentAvatar: s.sourceAgentAvatar,
        status: 'idle',
        stepCount: 0,
        hasArtifacts: false,
      }
      subMap.set(id, entry)
    }
    entry.stepCount++

    // 最近工具名（取最新非 final_answer）
    if (s.type === 'action' && s.toolCall?.name) {
      entry.lastToolName = s.toolCall.name
    }

    // 子任务成果决定最终状态
    if (s.type === 'subtask_result' && s.subtaskResult) {
      entry.status =
        s.subtaskResult.status === 'success' ? 'success'
        : s.subtaskResult.status === 'error' ? 'error'
        : 'success' // partial 视为成功-ish
      if (s.subtaskResult.artifacts && s.subtaskResult.artifacts.length > 0) {
        entry.hasArtifacts = true
      }
      if (s.subtaskResult.error) entry.errorMessage = s.subtaskResult.error
      recentEvents.unshift({
        agentName: entry.agentName,
        agentAvatar: entry.agentAvatar,
        text: s.subtaskResult.task || '子任务完成',
        kind: s.subtaskResult.status === 'error' ? 'error' : 'success',
      })
    }
  }

  // 仍在运行的子 Agent：有步骤但未 subtask_result
  // 仅在整体 streaming 时把没有最终态的标为 running
  if (isStreaming) {
    for (const entry of subMap.values()) {
      if (entry.status === 'idle') entry.status = 'running'
    }
  }

  // 计划事件
  if (plan) {
    recentEvents.unshift({
      agentName: 'Leader',
      agentAvatar: '👑',
      text: goal || plan.goal,
      kind: 'plan',
    })
  }

  // 错误步骤
  for (const s of steps) {
    if (s.type === 'error' && s.sourceAgentId) {
      const entry = subMap.get(s.sourceAgentId)
      if (entry && entry.status !== 'success') {
        entry.status = 'error'
        entry.errorMessage = s.content
      }
    }
  }

  // AI Changes 计数（本轮）
  let changesCount = 0
  const aiChangesMeta = currentMsg.metadata?.aiChanges
  if (aiChangesMeta && typeof aiChangesMeta === 'object') {
    const filesChanged = (aiChangesMeta as { filesChanged?: number }).filesChanged
    if (typeof filesChanged === 'number') changesCount = filesChanged
  }

  const hasPlan = !!plan
  const completedTaskCount = plan ? plan.tasks.filter((t) => t.status === 'completed').length : undefined
  const totalTaskCount = plan ? plan.tasks.length : undefined
  const progress = plan ? getPlanProgress(plan) : undefined

  return {
    hasActiveRun: true,
    goal,
    plan,
    subAgents: Array.from(subMap.values()),
    recentEvents: recentEvents.slice(0, 3),
    changesCount,
    isStreaming,
    hasPlan,
    noPlanReason: hasPlan ? undefined : 'not_created',
    progress,
    completedTaskCount,
    totalTaskCount,
  }
}

// ==================== 子 Agent 状态徽章 ====================

function SubAgentStatusBadge({ status }: { status: SubAgentStatus['status'] }) {
  const { t } = useAppTranslation()
  switch (status) {
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400" title={t('workspace.runOverview.statusRunning')}>
          <Loader2 size={10} className="animate-spin" />
        </span>
      )
    case 'success':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400" title={t('workspace.runOverview.statusSuccess')}>
          <CheckCircle2 size={10} />
        </span>
      )
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-danger-600 dark:text-danger-400" title={t('workspace.runOverview.statusError')}>
          <AlertCircle size={10} />
        </span>
      )
    case 'idle':
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400" title={t('workspace.runOverview.statusIdle')}>
          <Ban size={10} />
        </span>
      )
  }
}

// ==================== 主组件 ====================

interface WorkspaceRunOverviewProps {
  messages: Message[]
  /** 查看计划回调（滚动到 / 高亮 AgentTodoPanel） */
  onViewPlan?: () => void
  /** 查看变更回调 */
  onViewChanges?: () => void
  /** 停止生成 */
  onStop?: () => void
}

/**
 * @deprecated Phase 4.2：全宽运行总览已由 WorkspaceRunStrip 替代。
 * 请使用 deriveRunOverview + WorkspaceRunStrip；本组件仅作兼容保留。
 */
export function WorkspaceRunOverview({ messages, onViewPlan, onViewChanges, onStop }: WorkspaceRunOverviewProps) {
  const { t } = useAppTranslation()
  const state = useMemo(() => deriveRunOverview(messages), [messages])
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks'>('overview')

  if (!state.hasActiveRun) return null

  const plan = state.plan
  const progress = plan ? getPlanProgress(plan) : 0
  const planDone = plan ? isPlanDone(plan) : false
  const planFailed = plan ? hasPlanFailed(plan) : false
  const completedCount = plan ? plan.tasks.filter((t) => t.status === 'completed').length : 0
  const runningCount = state.subAgents.filter((s) => s.status === 'running').length

  return (
    <div
      className="flex-shrink-0 border-b border-teal-200/60 dark:border-teal-800/40 bg-teal-50/40 dark:bg-teal-950/10 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      data-testid="workspace-run-overview"
    >
      {/* Tab 导航：总览 / 任务板 */}
      {plan && (
        <div className="flex items-center gap-1 px-3 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors ${
              activeTab === 'overview'
                ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 font-medium'
                : 'text-gray-500 dark:text-gray-400 hover:bg-surface-100 dark:hover:bg-surface-800/50'
            }`}
          >
            <Users size={10} />
            {t('workspace.runOverview.tabOverview', { defaultValue: '总览' })}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors ${
              activeTab === 'tasks'
                ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-medium'
                : 'text-gray-500 dark:text-gray-400 hover:bg-surface-100 dark:hover:bg-surface-800/50'
            }`}
          >
            <ListTodo size={10} />
            {t('workspace.runOverview.tabTasks', { defaultValue: '任务板' })}
          </button>
        </div>
      )}

      <div className="px-3 py-2 space-y-1.5">
        {/* 行 1：目标 + 进度 + 操作 */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center flex-shrink-0">
            {state.isStreaming ? (
              <Loader2 size={11} className="text-teal-600 dark:text-teal-400 animate-spin" />
            ) : (
              <CheckCircle2 size={11} className="text-teal-600 dark:text-teal-400" />
            )}
          </div>
          <span className="text-[11px] font-medium text-teal-700 dark:text-teal-300 flex-shrink-0">
            {t('workspace.runOverview.title')}
          </span>
          <span className="text-[11px] text-gray-600 dark:text-gray-400 truncate flex-1 min-w-0" title={state.goal}>
            {state.goal || t('workspace.runOverview.noGoal')}
          </span>
          {plan && (
            <>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  planFailed
                    ? 'bg-danger-100 text-danger-700 dark:bg-danger-900/40 dark:text-danger-300'
                    : planDone
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                }`}
              >
                {t('workspace.runOverview.taskProgress', { completed: completedCount, total: plan.tasks.length, progress })}
              </span>
              {runningCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  {t('workspace.runOverview.runningCount', { count: runningCount })}
                </span>
              )}
            </>
          )}
          <div className="flex items-center gap-1 flex-shrink-0">
            {plan && (
              <button
                type="button"
                onClick={onViewPlan}
                className="text-[10px] px-1.5 py-0.5 rounded text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                title={t('workspace.runOverview.viewPlan')}
              >
                {t('workspace.runOverview.viewPlan')}
              </button>
            )}
            {state.changesCount > 0 && (
              <button
                type="button"
                onClick={onViewChanges}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                title={t('workspace.runOverview.viewChanges')}
              >
                <FilePenLine size={10} />
                {t('workspace.runOverview.changesCount', { count: state.changesCount })}
              </button>
            )}
            {state.isStreaming && onStop && (
              <button
                type="button"
                onClick={onStop}
                className="text-[10px] px-1.5 py-0.5 rounded text-danger-600 dark:text-danger-400 hover:bg-danger-100 dark:hover:bg-danger-900/30 transition-colors"
                title={t('common.stop')}
              >
                {t('common.stop')}
              </button>
            )}
          </div>
        </div>

        {/* 行 2：成员状态条 */}
        {state.subAgents.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Users size={11} className="text-teal-500 flex-shrink-0" />
            {state.subAgents.map((sa) => (
              <span
                key={sa.agentId}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-[10px]"
                title={
                  sa.status === 'error' && sa.errorMessage
                    ? sa.errorMessage
                    : sa.lastToolName
                      ? `${sa.agentName} · ${sa.stepCount} 步 · ${sa.lastToolName}`
                      : `${sa.agentName} · ${sa.stepCount} 步`
                }
              >
                <span className="text-xs">{sa.agentAvatar || '🤖'}</span>
                <span className="text-gray-700 dark:text-gray-300 max-w-[80px] truncate">{sa.agentName}</span>
                <SubAgentStatusBadge status={sa.status} />
                {sa.hasArtifacts && <FilePenLine size={9} className="text-amber-500" />}
              </span>
            ))}
          </div>
        )}

        {/* 行 3：进度条 */}
        {plan && activeTab === 'overview' && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-violet-200/60 dark:bg-violet-900/40">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                planFailed
                  ? 'bg-danger-500'
                  : planDone
                    ? 'bg-emerald-500'
                    : 'bg-violet-500'
                }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* 行 4：最近事件（仅总览 tab） */}
        {state.recentEvents.length > 0 && activeTab === 'overview' && (
          <div className="flex flex-col gap-0.5">
            {state.recentEvents.map((ev, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                <span className="text-xs">{ev.agentAvatar || '🤖'}</span>
                <Clock size={9} className="text-gray-400 flex-shrink-0" />
                <span className="font-medium text-gray-600 dark:text-gray-300">{ev.agentName}</span>
                <span className="truncate">{ev.text}</span>
                {ev.kind === 'error' && <AlertCircle size={9} className="text-danger-500 flex-shrink-0" />}
                {ev.kind === 'success' && <CheckCircle2 size={9} className="text-emerald-500 flex-shrink-0" />}
              </div>
            ))}
          </div>
        )}

        {/* 任务板 tab */}
        {plan && activeTab === 'tasks' && (
          <div className="pt-1">
            {/* 动态导入避免循环依赖 */}
            <WorkspaceTaskBoardInline
              plan={plan}
              subAgents={state.subAgents}
              onTaskClick={(taskId) => onViewPlan?.()}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== 内联任务板（避免循环导入） ====================

import type { AgentTask } from '../../types/agent-plan'

interface SubAgentStatusLike {
  agentId: string
  agentName: string
  agentAvatar?: string
  status: 'running' | 'success' | 'error' | 'idle'
}

function WorkspaceTaskBoardInline({
  plan,
  subAgents,
  onTaskClick,
}: {
  plan: AgentPlan
  subAgents: SubAgentStatusLike[]
  onTaskClick?: (taskId: string) => void
}) {
  const { t } = useAppTranslation()

  const groups = useMemo(() => {
    const pending: AgentTask[] = []
    const running: AgentTask[] = []
    const completed: AgentTask[] = []
    const failed: AgentTask[] = []

    for (const task of plan.tasks) {
      switch (task.status) {
        case 'in_progress':
          running.push(task)
          break
        case 'completed':
          completed.push(task)
          break
        case 'failed':
          failed.push(task)
          break
        default:
          pending.push(task)
      }
    }

    return [
      { key: 'running', label: t('workspace.taskBoard.running', { defaultValue: '运行中' }), tasks: running, color: 'text-blue-600 dark:text-blue-400', icon: Loader2 },
      { key: 'pending', label: t('workspace.taskBoard.pending', { defaultValue: '等待中' }), tasks: pending, color: 'text-gray-500 dark:text-gray-400', icon: Clock },
      { key: 'completed', label: t('workspace.taskBoard.completed', { defaultValue: '已完成' }), tasks: completed, color: 'text-green-600 dark:text-green-400', icon: CheckCircle2 },
      { key: 'failed', label: t('workspace.taskBoard.failed', { defaultValue: '失败' }), tasks: failed, color: 'text-red-600 dark:text-red-400', icon: AlertCircle },
    ] as const
  }, [plan.tasks, t])

  return (
    <div className="space-y-1.5">
      {groups.map((group) => {
        if (group.tasks.length === 0) return null
        const Icon = group.icon
        return (
          <div key={group.key}>
            <div className={`flex items-center gap-1 text-[9px] font-medium ${group.color} mb-0.5`}>
              <Icon size={9} className={group.key === 'running' ? 'animate-spin' : ''} />
              {group.label}
              <span className="text-[8px] text-gray-400">({group.tasks.length})</span>
            </div>
            <div className="space-y-0.5">
              {group.tasks.map((task, idx) => {
                const agent = subAgents.find((sa) => sa.agentId === task.assigneeId)
                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] cursor-pointer transition-colors ${
                      group.key === 'running'
                        ? 'bg-blue-50 dark:bg-blue-950/20'
                        : group.key === 'failed'
                          ? 'bg-red-50 dark:bg-red-950/20'
                          : 'bg-surface-50 dark:bg-surface-800/30'
                    } hover:bg-surface-100 dark:hover:bg-surface-800/50`}
                    onClick={() => onTaskClick?.(task.id)}
                    title={task.description}
                  >
                    <span className="text-[8px] text-gray-400 w-3 text-right flex-shrink-0">{idx + 1}</span>
                    <span className={`flex-1 min-w-0 truncate ${group.key === 'failed' ? 'text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'}`}>
                      {task.title}
                    </span>
                    {agent && (
                      <span className="text-[8px] text-gray-400 flex-shrink-0">{agent.agentAvatar || '🤖'}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
