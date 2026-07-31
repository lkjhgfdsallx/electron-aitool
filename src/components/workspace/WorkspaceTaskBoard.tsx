/**
 * WorkspaceTaskBoard — 任务板视图
 *
 * Phase 4：将 AgentPlan 的任务以看板形式展示，支持：
 *  - 按状态分组：pending / running / completed / failed
 *  - 显示 assigneeId → 成员名
 *  - 点击任务定位到步骤或打开产物
 *  - 失败任务提供"要求重试"操作
 *
 * 数据来源：WorkspaceRunOverviewState（从 messages 派生）
 */

import { useMemo } from 'react'
import { Loader2, CheckCircle2, AlertCircle, Clock, Play, RotateCcw } from 'lucide-react'
import type { AgentPlan, AgentTask } from '../../types/agent-plan'
// 从 WorkspaceRunOverview 复制接口定义（未导出）
interface SubAgentStatusLike {
  agentId: string
  agentName: string
  agentAvatar?: string
  status: 'running' | 'success' | 'error' | 'idle'
  stepCount: number
  lastToolName?: string
  hasArtifacts: boolean
  errorMessage?: string
}
import { useAppTranslation } from '../../i18n/hooks'

interface WorkspaceTaskBoardProps {
  plan: AgentPlan
  subAgents: SubAgentStatusLike[]
  /** 点击任务时回调（滚动到对应步骤） */
  onTaskClick?: (taskId: string) => void
  /** 重试失败任务 */
  onRetryTask?: (taskId: string) => void
}

type TaskGroup = {
  key: 'pending' | 'running' | 'completed' | 'failed'
  label: string
  icon: typeof Clock
  color: string
  tasks: AgentTask[]
}

export function WorkspaceTaskBoard({ plan, subAgents, onTaskClick, onRetryTask }: WorkspaceTaskBoardProps) {
  const { t } = useAppTranslation()

  const groups = useMemo((): TaskGroup[] => {
    const pending: AgentTask[] = []
    const running: AgentTask[] = []
    const completed: AgentTask[] = []
    const failed: AgentTask[] = []

    for (const task of plan.tasks) {
      switch (task.status) {
        case 'pending':
          pending.push(task)
          break
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
      {
        key: 'running',
        label: t('workspace.taskBoard.running', { defaultValue: '运行中' }),
        icon: Loader2,
        color: 'text-blue-600 dark:text-blue-400',
        tasks: running,
      },
      {
        key: 'pending',
        label: t('workspace.taskBoard.pending', { defaultValue: '等待中' }),
        icon: Clock,
        color: 'text-gray-500 dark:text-gray-400',
        tasks: pending,
      },
      {
        key: 'completed',
        label: t('workspace.taskBoard.completed', { defaultValue: '已完成' }),
        icon: CheckCircle2,
        color: 'text-green-600 dark:text-green-400',
        tasks: completed,
      },
      {
        key: 'failed',
        label: t('workspace.taskBoard.failed', { defaultValue: '失败' }),
        icon: AlertCircle,
        color: 'text-red-600 dark:text-red-400',
        tasks: failed,
      },
    ]
  }, [plan.tasks, t])

  // 查找负责某任务的子 Agent 状态
  const getAgentForTask = (task: AgentTask): SubAgentStatusLike | undefined => {
    if (!task.assigneeId) return undefined
    return subAgents.find((sa) => sa.agentId === task.assigneeId)
  }

  return (
    <div className="space-y-2" data-testid="workspace-task-board">
      {groups.map((group) => {
        if (group.tasks.length === 0) return null
        const Icon = group.icon
        return (
          <div key={group.key}>
            <div className={`flex items-center gap-1.5 text-[10px] font-medium ${group.color} mb-1`}>
              <Icon size={10} className={group.key === 'running' ? 'animate-spin' : ''} />
              {group.label}
              <span className="text-[9px] text-gray-400 dark:text-gray-500">({group.tasks.length})</span>
            </div>
            <div className="space-y-0.5">
              {group.tasks.map((task) => {
                const agent = getAgentForTask(task)
                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] transition-colors cursor-pointer ${
                      group.key === 'running'
                        ? 'bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30'
                        : group.key === 'failed'
                          ? 'bg-red-50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-800/30'
                          : group.key === 'completed'
                            ? 'bg-green-50/50 dark:bg-green-950/10'
                            : 'bg-surface-50 dark:bg-surface-800/30'
                    } hover:bg-surface-100 dark:hover:bg-surface-800/50`}
                    onClick={() => onTaskClick?.(task.id)}
                    title={task.description}
                  >
                    {/* 任务序号 */}
                    <span className="text-[9px] text-gray-400 dark:text-gray-500 flex-shrink-0 w-4 text-right">
                      {plan.tasks.indexOf(task) + 1}
                    </span>

                    {/* 任务标题 */}
                    <span className={`flex-1 min-w-0 truncate ${
                      group.key === 'failed' ? 'text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {task.title}
                    </span>

                    {/* 负责人 */}
                    {agent && (
                      <span className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                        <span>{agent.agentAvatar || '🤖'}</span>
                        <span className="truncate max-w-[60px]">{agent.agentName}</span>
                      </span>
                    )}

                    {/* 失败任务重试按钮 */}
                    {group.key === 'failed' && onRetryTask && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onRetryTask(task.id) }}
                        className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors flex-shrink-0"
                        title={t('workspace.taskBoard.retryTask', { defaultValue: '重试此任务' })}
                      >
                        <RotateCcw size={10} />
                      </button>
                    )}

                    {/* 运行中指示 */}
                    {group.key === 'running' && (
                      <span className="flex-shrink-0">
                        <Play size={9} className="text-blue-500 animate-pulse" />
                      </span>
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
