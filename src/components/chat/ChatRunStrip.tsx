/**
 * 普通模式运行摘要条（可折叠展开，内嵌 AgentTodoPanel）
 *
 * 设计参考 WorkspaceRunStrip，适配普通对话模式：
 *  - 折叠态：单行摘要，显示运行状态、目标、进度
 *  - 展开态：在顶部内嵌显示完整的 AgentTodoPanel 内容
 *  - 点击进度按钮切换展开/折叠
 */

import { useState, useMemo } from 'react'
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Square,
  ChevronDown,
  ChevronUp,
  ListChecks,
} from 'lucide-react'
import type { Message, AgentPlan } from '../../types'
import { getPlanProgress, isPlanDone, hasPlanFailed } from '../../types/agent-plan'
import { AgentTodoPanel } from './AgentTodoPanel'
import { useAppTranslation } from '../../i18n/hooks'

export interface ChatRunStripProps {
  messages: Message[]
  onStop?: () => void
  onApprovePlan?: (plan: AgentPlan) => void
  onRejectPlan?: (plan: AgentPlan, reason?: string) => void
}

/** 从消息列表中提取当前活跃的计划 */
function extractActivePlan(messages: Message[]): AgentPlan | undefined {
  if (!messages || messages.length === 0) return undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'assistant' && m.agentPlan) {
      return m.agentPlan
    }
  }
  return undefined
}

/** 判断是否有活跃运行 */
function hasActiveRun(messages: Message[]): boolean {
  if (!messages || messages.length === 0) return false
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'assistant' && (m.isStreaming || m.agentPlan || (m.agentSteps && m.agentSteps.length > 0))) {
      return true
    }
  }
  return false
}

export function ChatRunStrip({
  messages,
  onStop,
  onApprovePlan,
  onRejectPlan,
}: ChatRunStripProps) {
  const { t } = useAppTranslation()
  const [expanded, setExpanded] = useState(false)

  const plan = useMemo(() => extractActivePlan(messages), [messages])

  // 没有计划时不显示
  if (!plan) return null

  const hasPlan = !!plan
  const progress = plan ? getPlanProgress(plan) : 0
  const planDone = plan ? isPlanDone(plan) : false
  const planFailed = plan ? hasPlanFailed(plan) : false
  const completedCount = plan?.tasks.filter((t) => t.status === 'completed').length ?? 0
  const totalCount = plan?.tasks.length ?? 0
  const isStreaming = messages.some((m) => m.isStreaming)

  // 获取目标文本
  let goal: string | undefined
  if (plan) {
    goal = plan.goal
  } else {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === 'assistant' && m.content) {
        goal = m.content.slice(0, 120)
        break
      }
    }
  }

  const statusIcon = isStreaming ? (
    <Loader2 size={10} className="text-violet-600 dark:text-violet-400 animate-spin motion-reduce:animate-none" />
  ) : planFailed ? (
    <AlertCircle size={10} className="text-danger-600 dark:text-danger-400" />
  ) : (
    <CheckCircle2 size={10} className="text-violet-600 dark:text-violet-400" />
  )

  const toggleExpanded = () => {
    setExpanded((e) => !e)
  }

  return (
    <div
      className="flex-shrink-0 border-b border-violet-200/50 dark:border-violet-800/30 bg-violet-50/50 dark:bg-violet-950/15 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      data-testid="chat-run-strip"
    >
      {/* 折叠态：单行摘要 */}
      <div className="h-8 flex items-center gap-1.5 px-2.5">
        {/* 状态 + 标题 + 目标 */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="w-4 h-4 rounded bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center flex-shrink-0">
            {statusIcon}
          </span>
          <span className="text-[11px] font-medium text-violet-700 dark:text-violet-300 flex-shrink-0">
            {t('chat.executionPlan', { defaultValue: '执行计划' })}
          </span>
          <span
            className="text-[11px] text-gray-600 dark:text-gray-400 truncate min-w-0 flex-1"
            title={goal}
          >
            {goal || t('workspace.runOverview.noGoal', { defaultValue: '无目标' })}
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
            title={expanded ? t('common.collapse') : t('workspace.runOverview.viewPlan', { defaultValue: '查看计划' })}
          >
            <ListChecks size={10} />
            {t('chat.taskProgress', { completed: completedCount, total: totalCount, progress })}
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        )}

        {/* 无 plan：弱标签 */}
        {!hasPlan && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400">
            {isStreaming
              ? t('workspace.runOverview.executing', { defaultValue: '执行中' })
              : t('workspace.runOverview.noPlan', { defaultValue: '无计划' })}
          </span>
        )}

        {isStreaming && onStop && (
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
