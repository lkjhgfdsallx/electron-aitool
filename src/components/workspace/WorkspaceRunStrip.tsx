/**
 * 工作区运行摘要条（可折叠展开，内嵌 AgentTodoPanel）
 *
 * Phase 5：可折叠进度面板
 *  - 折叠态：单行摘要（原 WorkspaceRunStrip）
 *  - 展开态：在顶部内嵌显示完整的 AgentTodoPanel 内容
 *  - 点击进度按钮切换展开/折叠
 *
 * 数据复用 deriveRunOverview。
 */

import { useState, useMemo } from 'react'
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  FilePenLine,
  Square,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { Message } from '../../types'
import { isPlanDone, hasPlanFailed } from '../../types/agent-plan'
import { deriveRunOverview } from './WorkspaceRunOverview'
import { AgentTodoPanel } from '../chat/AgentTodoPanel'
import { useAppTranslation } from '../../i18n/hooks'

export interface WorkspaceRunStripProps {
  messages: Message[]
  onViewPlan?: () => void
  onViewChanges?: () => void
  onStop?: () => void
  /** 预留：重新规划（reject 链路），本阶段不接线 */
  onReplan?: () => void
  onApprovePlan?: (plan: import('../../types').AgentPlan) => void
  onRejectPlan?: (plan: import('../../types').AgentPlan, reason?: string) => void
}

export function WorkspaceRunStrip({
  messages,
  onViewPlan,
  onViewChanges,
  onStop,
  onApprovePlan,
  onRejectPlan,
}: WorkspaceRunStripProps) {
  const { t } = useAppTranslation()
  const state = useMemo(() => deriveRunOverview(messages), [messages])
  const [expanded, setExpanded] = useState(false)

  // 没有计划时不显示
  if (!state.hasPlan || !state.plan) return null

  const plan = state.plan
  const hasPlan = state.hasPlan
  const progress = state.progress ?? 0
  const planDone = plan ? isPlanDone(plan) : false
  const planFailed = plan ? hasPlanFailed(plan) : false
  const completedCount = state.completedTaskCount ?? 0
  const totalCount = state.totalTaskCount ?? 0
  const runningCount = state.subAgents.filter((s) => s.status === 'running').length

  const statusIcon = state.isStreaming ? (
    <Loader2 size={10} className="text-teal-600 dark:text-teal-400 animate-spin motion-reduce:animate-none" />
  ) : planFailed ? (
    <AlertCircle size={10} className="text-danger-600 dark:text-danger-400" />
  ) : (
    <CheckCircle2 size={10} className="text-teal-600 dark:text-teal-400" />
  )

  const toggleExpanded = () => {
    setExpanded((e) => !e)
  }

  return (
    <div
      className="flex-shrink-0 border-b border-teal-200/50 dark:border-teal-800/30 bg-teal-50/50 dark:bg-teal-950/15 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      data-testid="workspace-run-strip"
    >
      {/* 折叠态：单行摘要 */}
      <div className="h-8 flex items-center gap-1.5 px-2.5">
        {/* 状态 + 标题 + 目标 */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="w-4 h-4 rounded bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center flex-shrink-0">
            {statusIcon}
          </span>
          <span className="text-[11px] font-medium text-teal-700 dark:text-teal-300 flex-shrink-0">
            {t('workspace.runOverview.title')}
          </span>
          <span
            className="text-[11px] text-gray-600 dark:text-gray-400 truncate min-w-0 flex-1"
            title={state.goal}
          >
            {state.goal || t('workspace.runOverview.noGoal')}
          </span>
        </div>

        {/* 有 plan：进度 → 切换展开/折叠 */}
        {hasPlan && (
          <button
            type="button"
            onClick={toggleExpanded}
            className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 ${
              planFailed
                ? 'bg-danger-100 text-danger-700 dark:bg-danger-900/40 dark:text-danger-300'
                : planDone
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
            }`}
            title={expanded ? t('common.collapse') : t('workspace.runOverview.viewPlan')}
          >
            {t('workspace.runOverview.taskProgress', {
              completed: completedCount,
              total: totalCount,
              progress,
            })}
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        )}

        {/* 无 plan：弱标签，不假装进度、不可点 */}
        {!hasPlan && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400">
            {state.isStreaming
              ? t('workspace.runOverview.executing', { defaultValue: '执行中' })
              : t('workspace.runOverview.noPlan', { defaultValue: '无计划' })}
          </span>
        )}

        {runningCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 flex-shrink-0">
            {t('workspace.runOverview.runningCount', { count: runningCount })}
          </span>
        )}

        {state.changesCount > 0 && (
          <button
            type="button"
            onClick={() => onViewChanges?.()}
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 flex-shrink-0 cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
            title={t('workspace.runOverview.viewChanges')}
          >
            <FilePenLine size={9} />
            {t('workspace.runOverview.changesCount', { count: state.changesCount })}
          </button>
        )}

        {state.isStreaming && onStop && (
          <button
            type="button"
            onClick={() => onStop()}
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-danger-600 dark:text-danger-400 hover:bg-danger-100 dark:hover:bg-danger-900/30 transition-colors flex-shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500/50"
            title={t('common.stop')}
            aria-label={t('common.stop')}
          >
            <Square size={9} className="fill-current" />
            {t('common.stop')}
          </button>
        )}
      </div>

      {/* 展开态：内嵌 AgentTodoPanel */}
      {expanded && hasPlan && plan && (
        <div className="px-2.5 pb-2.5 pt-1">
          <AgentTodoPanel
            plan={plan}
            onApprove={onApprovePlan}
            onReject={onRejectPlan}
            defaultExpanded={false}
            pinned={false}
          />
        </div>
      )}
    </div>
  )
}
