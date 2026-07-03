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

// ==================== 任务状态配置 ====================

interface TaskStatusConfig {
  icon: typeof CheckCircle2
  color: string
  bgColor: string
  borderColor: string
  label: string
  dotColor: string
}

const taskStatusConfig: Record<AgentTaskStatus, TaskStatusConfig> = {
  pending: {
    icon: Circle,
    color: 'text-slate-400',
    bgColor: 'bg-slate-50 dark:bg-slate-900/30',
    borderColor: 'border-slate-200 dark:border-slate-700',
    label: '待执行',
    dotColor: 'bg-slate-300',
  },
  in_progress: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    label: '进行中',
    dotColor: 'bg-blue-500',
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    label: '已完成',
    dotColor: 'bg-emerald-500',
  },
  failed: {
    icon: AlertCircle,
    color: 'text-danger-500',
    bgColor: 'bg-danger-50 dark:bg-danger-950/30',
    borderColor: 'border-danger-200 dark:border-danger-800',
    label: '失败',
    dotColor: 'bg-danger-500',
  },
  blocked: {
    icon: Ban,
    color: 'text-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
    label: '阻塞',
    dotColor: 'bg-amber-500',
  },
}

// ==================== 计划整体状态徽章 ====================

interface PlanStatusBadgeConfig {
  label: string
  className: string
}

const planStatusBadgeConfig: Record<AgentPlanStatus, PlanStatusBadgeConfig> = {
  draft: {
    label: '草稿 · 待确认',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  },
  approved: {
    label: '已确认',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  },
  executing: {
    label: '执行中',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  },
  done: {
    label: '已完成',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  },
  failed: {
    label: '失败',
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
}

// ==================== 主组件 ====================

export function AgentTodoPanel({
  plan,
  onApprove,
  onReject,
  defaultExpanded = false,
}: AgentTodoPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(
    () => new Set(defaultExpanded ? plan.tasks.map((t) => t.id) : []),
  )
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const progress = useMemo(() => getPlanProgress(plan), [plan])
  const done = isPlanDone(plan)
  const failed = hasPlanFailed(plan)
  const isDraft = plan.status === 'draft'
  const completedCount = plan.tasks.filter((t) => t.status === 'completed').length

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
    <div className="my-2 rounded-lg border border-violet-200 bg-violet-50/50 text-sm dark:border-violet-800 dark:bg-violet-950/20">
      {/* 头部：目标 + 状态徽章 + 折叠 */}
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="mt-0.5 shrink-0 rounded p-0.5 text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/40"
          aria-label={collapsed ? '展开' : '折叠'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <ListChecks size={16} className="mt-0.5 shrink-0 text-violet-500" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-violet-900 dark:text-violet-100">
              执行计划
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
            <span className="text-xs text-violet-500 dark:text-violet-400">
              {completedCount}/{plan.tasks.length} 任务 · {progress}%
            </span>
          </div>
          <p className="mt-1 break-words text-xs text-violet-700 dark:text-violet-300">
            {plan.goal}
          </p>
        </div>
        {!collapsed && plan.tasks.length > 1 && (
          <button
            type="button"
            onClick={toggleAll}
            className="shrink-0 rounded px-1.5 py-0.5 text-xs text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/40"
          >
            {expandedTasks.size === plan.tasks.length ? '全部收起' : '全部展开'}
          </button>
        )}
      </div>

      {/* 进度条 */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-violet-200/60 dark:bg-violet-900/40">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                failed
                  ? 'bg-danger-500'
                  : done
                    ? 'bg-emerald-500'
                    : 'bg-violet-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 任务列表 */}
      {!collapsed && (
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
      {!collapsed && isDraft && !rejecting && (
        <div className="flex items-center justify-end gap-2 border-t border-violet-200 px-3 py-2 dark:border-violet-800">
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="inline-flex items-center gap-1 rounded-md border border-violet-300 px-3 py-1 text-xs font-medium text-violet-600 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-900/40"
          >
            <X size={14} />
            重新规划
          </button>
          <button
            type="button"
            onClick={handleApprove}
            className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700 dark:bg-violet-700 dark:hover:bg-violet-600"
          >
            <Play size={14} />
            确认并执行
          </button>
        </div>
      )}

      {/* 拒绝（重新规划）输入区 */}
      {!collapsed && isDraft && rejecting && (
        <div className="border-t border-violet-200 px-3 py-2 dark:border-violet-800">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="可选：说明为什么需要重新规划（反馈给 Agent）"
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
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirmReject}
              className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
            >
              <X size={14} />
              确认重新规划
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
      className={`rounded-md border ${cfg.borderColor} ${cfg.bgColor} transition-colors`}
    >
      <div className="flex items-start gap-2 p-2">
        <Icon
          size={16}
          className={`mt-0.5 shrink-0 ${cfg.color} ${spinning ? 'animate-spin' : ''}`}
        />
        <button
          type="button"
          onClick={hasDetails ? onToggle : undefined}
          className="min-w-0 flex-1 text-left"
          disabled={!hasDetails}
        >
          <div className="flex items-center gap-1.5">
            {hasDetails && (
              expanded ? <ChevronDown size={12} className="shrink-0 text-slate-400" /> :
              <ChevronRight size={12} className="shrink-0 text-slate-400" />
            )}
            <span className="text-xs text-slate-400">#{index + 1}</span>
            <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
              {task.title}
            </span>
          </div>
        </button>
        <span className={`shrink-0 text-xs ${cfg.color}`}>{cfg.label}</span>
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
              <span className="text-slate-400">依赖:</span>
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
              <span className="text-slate-400">分派:</span>
              <span className="font-mono">{task.assigneeId}</span>
            </div>
          )}
          {task.artifacts && task.artifacts.length > 0 && (
            <div className="flex flex-wrap items-start gap-1">
              <Paperclip size={12} className="mt-0.5 shrink-0 text-slate-400" />
              <span className="text-slate-400">产物:</span>
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
