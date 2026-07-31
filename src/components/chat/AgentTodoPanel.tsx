import { useState, useMemo } from 'react'
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  Ban,
  ListChecks,
  ChevronDown,
  ChevronRight,
  User,
  Link2,
  Paperclip,
  StickyNote,
  Play,
  X,
} from 'lucide-react'
import type {
  AgentPlan,
  AgentTask,
  AgentTaskStatus,
  AgentPlanStatus,
} from '../../types'
import {
  getPlanProgress,
  isPlanDone,
  hasPlanFailed,
} from '../../types/agent-plan'
import { useAppTranslation } from '@/i18n/hooks'

// ==================== 任务状态配置 ====================

interface TaskStatusConfig {
  icon: typeof CheckCircle2
  color: string
  bgColor: string
  borderColor: string
  labelKey: 'chat.taskStatusPending' | 'chat.taskStatusInProgress' | 'chat.taskStatusCompleted' | 'chat.taskStatusFailed' | 'chat.taskStatusBlocked'
  dotColor: string
}

const taskStatusConfig: Record<AgentTaskStatus, TaskStatusConfig> = {
  pending: {
    icon: Circle,
    color: 'text-slate-400',
    bgColor: 'bg-slate-50 dark:bg-slate-900/30',
    borderColor: 'border-slate-200 dark:border-slate-700',
    labelKey: 'chat.taskStatusPending',
    dotColor: 'bg-slate-300',
  },
  in_progress: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    labelKey: 'chat.taskStatusInProgress',
    dotColor: 'bg-blue-500',
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    labelKey: 'chat.taskStatusCompleted',
    dotColor: 'bg-emerald-500',
  },
  failed: {
    icon: AlertCircle,
    color: 'text-danger-500',
    bgColor: 'bg-danger-50 dark:bg-danger-950/30',
    borderColor: 'border-danger-200 dark:border-danger-800',
    labelKey: 'chat.taskStatusFailed',
    dotColor: 'bg-danger-500',
  },
  blocked: {
    icon: Ban,
    color: 'text-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
    labelKey: 'chat.taskStatusBlocked',
    dotColor: 'bg-amber-500',
  },
}

// ==================== 计划整体状态徽章 ====================

interface PlanStatusBadgeConfig {
  labelKey: 'chat.planStatusDraft' | 'chat.planStatusApproved' | 'chat.planStatusExecuting' | 'chat.planStatusDone' | 'chat.planStatusFailed'
  className: string
}

const planStatusBadgeConfig: Record<AgentPlanStatus, PlanStatusBadgeConfig> = {
  draft: {
    labelKey: 'chat.planStatusDraft',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  },
  approved: {
    labelKey: 'chat.planStatusApproved',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  },
  executing: {
    labelKey: 'chat.planStatusExecuting',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  },
  done: {
    labelKey: 'chat.planStatusDone',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  },
  failed: {
    labelKey: 'chat.planStatusFailed',
    className: 'bg-danger-100 text-danger-700 dark:bg-danger-950/50 dark:text-danger-300',
  },
}

// ==================== Props ====================

interface AgentTodoPanelProps {
  /** 当前活跃的计划 */
  plan: AgentPlan
  /** 用户确认计划（接受并开始执行）；仅 draft 状态可用 */
  onApprove?: (plan: AgentPlan) => void
  /** 用户拒绝计划（要求 LLM 重新规划）；仅 draft 状态可用 */
  onReject?: (plan: AgentPlan, reason?: string) => void
  /** 默认是否展开所有任务详情 */
  defaultExpanded?: boolean
  /**
   * Phase 1.3：是否「钉住」面板。
   * - true：执行中（executing/draft）不允许折叠，进度常驻可见；done/failed 仍可折叠。
   * - false/undefined：保持原行为。
   */
  pinned?: boolean
}

// ==================== 主组件 ====================

export function AgentTodoPanel({
  plan,
  onApprove,
  onReject,
  defaultExpanded = false,
  pinned = false,
}: AgentTodoPanelProps) {
  const { t } = useAppTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const isExecutableState = plan.status === 'executing' || plan.status === 'draft'
  /** 执行中 / 草稿：钉住时强制展开，保证进度常驻可见 */
  const effectivelyCollapsed = pinned && isExecutableState ? false : collapsed
  const toggleCollapsed = () => {
    if (pinned && isExecutableState) return
    setCollapsed((c) => !c)
  }

  /** 初始展开：defaultExpanded 或当前 in_progress 任务 */
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(() => {
    if (defaultExpanded) return new Set(plan.tasks.map((t) => t.id))
    return new Set(plan.tasks.filter((t) => t.status === 'in_progress').map((t) => t.id))
  })
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const progress = useMemo(() => getPlanProgress(plan), [plan])
  const done = isPlanDone(plan)
  const failed = hasPlanFailed(plan)
  const isDraft = plan.status === 'draft'
  const completedCount = plan.tasks.filter((t) => t.status === 'completed').length
  const inProgressCount = plan.tasks.filter((t) => t.status === 'in_progress').length
  const failedCount = plan.tasks.filter((t) => t.status === 'failed').length
  const blockedCount = plan.tasks.filter((t) => t.status === 'blocked').length

  const toggleTask = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  const toggleAll = () => {
    setExpandedTasks((prev) => {
      if (prev.size === plan.tasks.length) {
        return new Set()
      }
      return new Set(plan.tasks.map((t) => t.id))
    })
  }

  const handleApprove = () => {
    onApprove?.(plan)
  }

  const handleConfirmReject = () => {
    onReject?.(plan, rejectReason.trim() || undefined)
    setRejecting(false)
    setRejectReason('')
  }

  const handleCancelReject = () => {
    setRejecting(false)
    setRejectReason('')
  }

  const badge = planStatusBadgeConfig[plan.status]

  return (
    <div
      className={`agent-todo-panel my-2.5 rounded-xl border text-sm shadow-sm transition-shadow ${
        isExecutableState
          ? 'border-violet-300 bg-gradient-to-b from-violet-50/90 to-violet-50/40 dark:border-violet-700 dark:from-violet-950/40 dark:to-violet-950/15 shadow-violet-100/50 dark:shadow-none'
          : failed
            ? 'border-danger-200 bg-danger-50/40 dark:border-danger-800 dark:bg-danger-950/20'
            : done
              ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20'
              : 'border-violet-200 bg-violet-50/50 dark:border-violet-800 dark:bg-violet-950/20'
      }`}
      data-plan-status={plan.status}
      data-plan-id={plan.id}
      role="region"
      aria-label={t('chat.executionPlan')}
    >
      {/* 头部：目标 + 状态徽章 + 折叠 */}
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`mt-0.5 shrink-0 rounded p-0.5 text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
            pinned && isExecutableState ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          aria-label={effectivelyCollapsed ? t('common.expand') : t('common.collapse')}
          aria-expanded={!effectivelyCollapsed}
          disabled={pinned && isExecutableState}
          title={
            pinned && isExecutableState
              ? t('chat.planStatusExecuting')
              : effectivelyCollapsed
                ? t('common.expand')
                : t('common.collapse')
          }
        >
          {effectivelyCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-900/50">
          <ListChecks size={14} className="text-violet-600 dark:text-violet-300" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-violet-900 dark:text-violet-100">
              {t('chat.executionPlan')}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
            >
              {t(badge.labelKey)}
            </span>
            <span className="text-[11px] tabular-nums text-violet-500 dark:text-violet-400">
              {t('chat.taskProgress', { completed: completedCount, total: plan.tasks.length, progress })}
            </span>
          </div>
          <p className="mt-1 break-words text-xs leading-relaxed text-violet-700/90 dark:text-violet-300/90">
            {plan.goal}
          </p>
          {/* 状态微摘要：折叠时也可见关键计数 */}
          {effectivelyCollapsed && (inProgressCount > 0 || failedCount > 0 || blockedCount > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {inProgressCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                  {inProgressCount}
                </span>
              )}
              {failedCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-danger-100 px-1.5 py-0.5 text-[10px] font-medium text-danger-700 dark:bg-danger-900/40 dark:text-danger-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-danger-500" />
                  {failedCount}
                </span>
              )}
              {blockedCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {blockedCount}
                </span>
              )}
            </div>
          )}
        </div>
        {!effectivelyCollapsed && plan.tasks.length > 1 && (
          <button
            type="button"
            onClick={toggleAll}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
          >
            {expandedTasks.size === plan.tasks.length ? t('chat.collapseAll') : t('chat.expandAll')}
          </button>
        )}
      </div>

      {/* 进度条：折叠时也显示细条，保持进度感知 */}
      <div className={`px-3 ${effectivelyCollapsed ? 'pb-2.5' : 'pb-2'}`}>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-violet-200/60 dark:bg-violet-900/40">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              failed
                ? 'bg-danger-500'
                : done
                  ? 'bg-emerald-500'
                  : 'bg-violet-500'
            }`}
            style={{ width: `${Math.max(progress, progress > 0 ? 2 : 0)}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* 任务列表 */}
      {!effectivelyCollapsed && (
        <div className="space-y-1.5 px-3 pb-3">
          {plan.tasks.map((task, index) => (
            <TaskCard
              key={task.id}
              task={task}
              index={index}
              plan={plan}
              expanded={expandedTasks.has(task.id)}
              onToggle={() => toggleTask(task.id)}
            />
          ))}
        </div>
      )}

      {/* 草稿确认操作区 */}
      {!effectivelyCollapsed && isDraft && !rejecting && (
        <div className="flex items-center justify-end gap-2 border-t border-violet-200 px-3 py-2 dark:border-violet-800">
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="inline-flex items-center gap-1 rounded-md border border-violet-300 px-3 py-1 text-xs font-medium text-violet-600 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-900/40"
          >
            <X size={14} />
            {t('chat.replan')}
          </button>
          <button
            type="button"
            onClick={handleApprove}
            className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700 dark:bg-violet-700 dark:hover:bg-violet-600"
          >
            <Play size={14} />
            {t('chat.approveAndExecute')}
          </button>
        </div>
      )}

      {/* 拒绝（重新规划）输入区 */}
      {!effectivelyCollapsed && isDraft && rejecting && (
        <div className="border-t border-violet-200 px-3 py-2 dark:border-violet-800">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t('chat.replanReasonPlaceholder')}
            rows={2}
            className="w-full resize-none rounded-md border border-violet-300 bg-white px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none dark:border-violet-700 dark:bg-slate-900 dark:text-slate-200"
            autoFocus
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCancelReject}
              className="rounded-md px-3 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmReject}
              className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
            >
              <X size={14} />
              {t('chat.confirmReplan')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== 任务卡片子组件 ====================

interface TaskCardProps {
  task: AgentTask
  index: number
  plan: AgentPlan
  expanded: boolean
  onToggle: () => void
}

function TaskCard({ task, index, plan, expanded, onToggle }: TaskCardProps) {
  const { t } = useAppTranslation()
  const cfg = taskStatusConfig[task.status]
  const Icon = cfg.icon
  const spinning = task.status === 'in_progress'

  // 依赖任务标题
  const depTasks = task.dependsOn
    .map((depId) => plan.tasks.find((t) => t.id === depId))
    .filter((t): t is AgentTask => Boolean(t))

  const hasDetails =
    task.description.length > 0 ||
    depTasks.length > 0 ||
    Boolean(task.assigneeId) ||
    (task.artifacts?.length ?? 0) > 0 ||
    Boolean(task.notes)

  return (
    <div
      className={`rounded-xl border ${cfg.borderColor} ${cfg.bgColor} transition-all hover:shadow-sm ${
        spinning ? 'ring-1 ring-blue-300/60 dark:ring-blue-700/50' : ''
      }`}
      data-task-id={task.id}
      data-task-status={task.status}
    >
      <div className="flex items-start gap-2 p-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-900/50">
          <Icon
            size={15}
            className={`${cfg.color} ${spinning ? 'animate-spin motion-reduce:animate-none' : ''}`}
          />
        </span>
        <button
          type="button"
          onClick={hasDetails ? onToggle : undefined}
          className={`min-w-0 flex-1 text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40 ${
            hasDetails ? 'cursor-pointer' : 'cursor-default'
          }`}
          disabled={!hasDetails}
          aria-expanded={hasDetails ? expanded : undefined}
        >
          <div className="flex items-center gap-1.5">
            {hasDetails && (
              expanded
                ? <ChevronDown size={12} className="shrink-0 text-slate-400" />
                : <ChevronRight size={12} className="shrink-0 text-slate-400" />
            )}
            <span className="text-[11px] tabular-nums text-slate-400">#{index + 1}</span>
            <span
              className={`truncate text-sm font-medium ${
                task.status === 'completed'
                  ? 'text-slate-500 line-through decoration-slate-300 dark:text-slate-400 dark:decoration-slate-600'
                  : 'text-slate-700 dark:text-slate-200'
              }`}
            >
              {task.title}
            </span>
          </div>
        </button>
        <span
          className={`shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cfg.color} ${cfg.bgColor}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor} ${spinning ? 'animate-pulse' : ''}`} />
          {t(cfg.labelKey)}
        </span>
      </div>

      {/* 展开详情 */}
      {expanded && hasDetails && (
        <div className="space-y-1.5 border-t border-current/10 px-2 pb-2 pt-1.5 text-xs text-slate-600 dark:text-slate-300">
          {task.description && (
            <p className="whitespace-pre-wrap break-words">{task.description}</p>
          )}
          {depTasks.length > 0 && (
            <div className="flex flex-wrap items-start gap-1">
              <Link2 size={12} className="mt-0.5 shrink-0 text-slate-400" />
              <span className="text-slate-400">{t('chat.dependencies')}</span>
              {depTasks.map((d) => {
                const depIdx = plan.tasks.findIndex((t) => t.id === d.id)
                const depCfg = taskStatusConfig[d.status]
                return (
                  <span
                    key={d.id}
                    className={`inline-flex items-center gap-1 rounded px-1 py-0.5 ${depCfg.bgColor}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${depCfg.dotColor}`} />
                    #{depIdx + 1} {d.title}
                  </span>
                )
              })}
            </div>
          )}
          {task.assigneeId && (
            <div className="flex items-center gap-1">
              <User size={12} className="shrink-0 text-slate-400" />
              <span className="text-slate-400">{t('chat.assignedTo')}</span>
              <span className="font-mono">{task.assigneeId}</span>
            </div>
          )}
          {task.artifacts && task.artifacts.length > 0 && (
            <div className="flex flex-wrap items-start gap-1">
              <Paperclip size={12} className="mt-0.5 shrink-0 text-slate-400" />
              <span className="text-slate-400">{t('chat.artifacts')}</span>
              {task.artifacts.map((a, i) => (
                <code
                  key={i}
                  className="rounded bg-slate-200/60 px-1 py-0.5 text-[11px] dark:bg-slate-800/60"
                >
                  {a}
                </code>
              ))}
            </div>
          )}
          {task.notes && (
            <div className="flex items-start gap-1">
              <StickyNote size={12} className="mt-0.5 shrink-0 text-slate-400" />
              <span className="whitespace-pre-wrap break-words text-slate-500 dark:text-slate-400">
                {task.notes}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AgentTodoPanel
