import { useState, useEffect, useRef, useMemo } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Brain,
  Zap,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
  Timer,
  RotateCcw,
  MessageSquarePlus,
  Users
} from 'lucide-react'
import type { AgentStep } from '../../types'
import type { AgentPlan } from '../../types/agent-plan'
import { AgentTodoPanel } from './AgentTodoPanel'

/** 用户选择超时时间（毫秒） */
const HUMAN_INPUT_TIMEOUT_MS = 60_000

interface AgentStepDisplayProps {
  steps: AgentStep[]
  /** 是否正在运行 */
  isRunning?: boolean
  /** 用户选择回调（ask_human 工具），单选传字符串，多选传字符串数组 */
  onHumanInput?: (stepId: string, value: string | string[]) => void
  /** 消息是否处于错误状态 */
  isError?: boolean
  /** Phase 3: 结构化执行计划（plan-and-execute 策略产出） */
  plan?: AgentPlan
  /** Phase 3: 用户确认计划回调（接受后开始执行） */
  onApprovePlan?: (plan: AgentPlan) => void
  /** Phase 3: 用户拒绝计划回调（要求重新规划） */
  onRejectPlan?: (plan: AgentPlan, reason?: string) => void
}

const stepTypeConfig = {
  thinking: {
    icon: Brain,
    color: 'text-accent-500',
    bgColor: 'bg-accent-50 dark:bg-accent-950/30',
    borderColor: 'border-accent-200 dark:border-accent-800',
    label: '思考'
  },
  action: {
    icon: Zap,
    color: 'text-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
    label: '行动'
  },
  observation: {
    icon: Eye,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    label: '观察'
  },
  final_answer: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-200 dark:border-green-800',
    label: '最终回答'
  },
  error: {
    icon: AlertCircle,
    color: 'text-danger-500',
    bgColor: 'bg-danger-50 dark:bg-danger-950/30',
    borderColor: 'border-danger-200 dark:border-danger-800',
    label: '错误'
  },
  human_input: {
    icon: User,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    label: '用户选择'
  },
  subtask_result: {
    icon: Users,
    color: 'text-teal-500',
    bgColor: 'bg-teal-50 dark:bg-teal-950/30',
    borderColor: 'border-teal-200 dark:border-teal-800',
    label: '子任务成果'
  }
}

export function AgentStepDisplay({ steps, isRunning, onHumanInput, isError, plan, onApprovePlan, onRejectPlan }: AgentStepDisplayProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [isAllExpanded, setIsAllExpanded] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 多选状态：记录每个步骤已选中的值
  const [multiSelections, setMultiSelections] = useState<Map<string, Set<string>>>(new Map())
  // "以上都不是"输入框状态
  const [customInputMap, setCustomInputMap] = useState<Map<string, string>>(new Map())
  // 是否展开了自定义输入
  const [customExpandedMap, setCustomExpandedMap] = useState<Map<string, boolean>>(new Map())

  // 自动展开 human_input 步骤 + 超时自动选择
  useEffect(() => {
    const pendingHumanSteps = steps.filter(
      (s) => s.type === 'human_input' && s.humanChoice && !s.humanResponse
    )
    if (pendingHumanSteps.length > 0) {
      // 自动展开所有待选择的 human_input 步骤
      setExpandedSteps((prev) => {
        const next = new Set(prev)
        let changed = false
        for (const step of pendingHumanSteps) {
          if (!next.has(step.id)) {
            next.add(step.id)
            changed = true
          }
        }
        return changed ? next : prev
      })

      // 启动超时倒计时（只对第一个待选择步骤）
      const firstPending = pendingHumanSteps[0]
      if (!timeoutRef.current) {
        const remaining = HUMAN_INPUT_TIMEOUT_MS
        setCountdown(Math.ceil(remaining / 1000))

        countdownRef.current = setInterval(() => {
          setCountdown((prev) => {
            if (prev !== null && prev > 1) return prev - 1
            return null
          })
        }, 1000)

        timeoutRef.current = setTimeout(() => {
          // 超时自动选择第一个选项（多选时选第一个）
          if (onHumanInput && firstPending.humanChoice) {
            const defaultValue = firstPending.humanChoice.allowMultiple
              ? [firstPending.humanChoice.options[0].value]
              : firstPending.humanChoice.options[0].value
            onHumanInput(firstPending.id, defaultValue)
          }
          if (countdownRef.current) clearInterval(countdownRef.current)
          countdownRef.current = null
          timeoutRef.current = null
          setCountdown(null)
        }, remaining)
      }
    } else {
      // 没有待选择的步骤，清除计时器
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
        countdownRef.current = null
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      setCountdown(null)
    }

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [steps, onHumanInput])

  if (!steps || steps.length === 0) return null

  const toggleStep = (id: string) => {
    const next = new Set(expandedSteps)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setExpandedSteps(next)
  }

  const toggleAll = () => {
    if (isAllExpanded) {
      // 全部折叠：清空展开的步骤，折叠所有子 Agent 分组
      setExpandedSteps(new Set())
      const allAgentIds = new Set<string>()
      for (const s of steps) {
        if (s.sourceAgentId) allAgentIds.add(s.sourceAgentId)
      }
      setCollapsedAgentGroups(allAgentIds)
    } else {
      // 全部展开：展开所有步骤，展开所有子 Agent 分组
      setExpandedSteps(new Set(steps.map((s) => s.id)))
      setCollapsedAgentGroups(new Set())
    }
    setIsAllExpanded(!isAllExpanded)
  }

  // 非 final_answer 的步骤
  const processSteps = steps.filter((s) => s.type !== 'final_answer')

  // 统计子 Agent 信息（用 ref 追踪已见过的 ID，避免每次渲染创建新 Set 导致 effect 反复触发）
  const seenAgentIdsRef = useRef<Set<string>>(new Set())
  const subAgentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const s of processSteps) {
      if (s.sourceAgentId) ids.add(s.sourceAgentId)
    }
    return ids
  }, [processSteps])

  // 子 Agent 步骤分组折叠状态
  const [collapsedAgentGroups, setCollapsedAgentGroups] = useState<Set<string>>(new Set())

  // 子 Agent 步骤默认折叠（仅对首次出现的 Agent ID 折叠，不影响用户手动操作）
  useEffect(() => {
    const newIds: string[] = []
    for (const id of subAgentIds) {
      if (!seenAgentIdsRef.current.has(id)) {
        seenAgentIdsRef.current.add(id)
        newIds.push(id)
      }
    }
    if (newIds.length > 0) {
      setCollapsedAgentGroups((prev) => {
        const next = new Set(prev)
        for (const id of newIds) {
          next.add(id)
        }
        return next
      })
    }
  }, [subAgentIds])

  if (processSteps.length === 0) return null

  // 判断是否需要在当前步骤前插入子 Agent 分组头
  const shouldShowAgentHeader = (step: AgentStep, index: number): boolean => {
    if (!step.sourceAgentId) return false
    // 第一个步骤或者是前一个步骤不是同一子 Agent
    if (index === 0) return true
    const prevStep = processSteps[index - 1]
    return prevStep.sourceAgentId !== step.sourceAgentId
  }

  // 判断子 Agent 分组是否在当前步骤结束
  const isAgentGroupEnd = (step: AgentStep, index: number): boolean => {
    if (!step.sourceAgentId) return false
    if (index === processSteps.length - 1) return true
    const nextStep = processSteps[index + 1]
    return nextStep.sourceAgentId !== step.sourceAgentId
  }

  return (
    <div className="mb-2 rounded-xl border border-surface-200/60 dark:border-surface-700/40 overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-50/80 dark:bg-surface-800/40 border-b border-surface-200/60 dark:border-surface-700/40">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <div className="w-5 h-5 rounded-md bg-accent-50 dark:bg-accent-950/30 flex items-center justify-center">
              <Loader2 size={12} className="text-accent-500 animate-spin" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-md bg-surface-100 dark:bg-surface-700 flex items-center justify-center">
              <Brain size={12} className="text-muted" />
            </div>
          )}
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Agent 执行过程（{processSteps.length} 步{subAgentIds.size > 0 ? `，含 ${subAgentIds.size} 个子 Agent` : ''}）
          </span>
        </div>
        <button
          onClick={toggleAll}
          className="text-xs text-accent-500 hover:text-accent-600 transition-colors"
        >
          {isAllExpanded ? '全部折叠' : '全部展开'}
        </button>
      </div>

      {/* Phase 3: 结构化执行计划面板（plan-and-execute 策略） */}
      {plan && (
        <AgentTodoPanel
          plan={plan}
          onApprove={onApprovePlan}
          onReject={onRejectPlan}
        />
      )}

      {/* 步骤列表（timeline 风格） */}
      <div className="relative">
        {processSteps.map((step, index) => {
          const config = stepTypeConfig[step.type]
          const StepIcon = config.icon
          const isExpanded = expandedSteps.has(step.id)
          const isLast = index === processSteps.length - 1
          const isCurrentStep = isRunning && isLast
          const isSubAgent = !!step.sourceAgentId
          const agentGroupCollapsed = isSubAgent && collapsedAgentGroups.has(step.sourceAgentId!)

          return (
            <div key={step.id} className="relative">
              {/* 子 Agent 分组头（仅在该 Agent 第一个步骤前显示） */}
              {isSubAgent && shouldShowAgentHeader(step, index) && (
                <button
                  onClick={() => {
                    setCollapsedAgentGroups((prev) => {
                      const next = new Set(prev)
                      if (next.has(step.sourceAgentId!)) {
                        next.delete(step.sourceAgentId!)
                      } else {
                        next.add(step.sourceAgentId!)
                      }
                      return next
                    })
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 mx-2 mt-1.5 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/40 cursor-pointer hover:bg-indigo-100/80 dark:hover:bg-indigo-950/50 transition-colors"
                >
                  <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center flex-shrink-0 text-xs">
                    {step.sourceAgentAvatar || '🤖'}
                  </div>
                  <Users size={12} className="text-indigo-500" />
                  <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                    {step.sourceAgentName || '子 Agent'}
                  </span>
                  <span className="text-xs text-indigo-400 dark:text-indigo-500">
                    正在执行任务...
                  </span>
                  <div className="ml-auto flex-shrink-0">
                    {agentGroupCollapsed ? (
                      <ChevronRight size={14} className="text-indigo-400" />
                    ) : (
                      <ChevronDown size={14} className="text-indigo-400" />
                    )}
                  </div>
                </button>
              )}

              {/* 子 Agent 步骤折叠时跳过渲染 */}
              {isSubAgent && agentGroupCollapsed ? null : (
                <>
                  {/* 连接线 */}
                  {!isLast && (
                    <div className={`absolute top-8 bottom-0 w-0.5 ${isSubAgent ? 'left-[23px] bg-indigo-200 dark:bg-indigo-800' : 'left-[15px] bg-surface-200 dark:bg-surface-700'}`} />
                  )}

                  <div className={`rounded-lg border overflow-hidden my-1.5 ${isSubAgent ? 'ml-6 mr-2 border-indigo-200/60 dark:border-indigo-800/40 bg-indigo-50/30 dark:bg-indigo-950/10' : 'mx-2 border-surface-200/60 dark:border-surface-700/40'} ${isCurrentStep ? 'animate-pulse ring-1 ring-accent-300 dark:ring-accent-600' : ''}`}>
                    <button
                      onClick={() => toggleStep(step.id)}
                      className="flex items-center gap-3 w-full px-3 py-2 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/40 transition-colors"
                    >
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${isSubAgent ? 'bg-indigo-100 dark:bg-indigo-900/40' : config.bgColor}`}>
                        <StepIcon size={12} className={isSubAgent ? 'text-indigo-500' : config.color} />
                      </div>
                      <span className={`text-xs font-medium ${isSubAgent ? 'text-indigo-600 dark:text-indigo-400' : config.color}`}>
                        {config.label}
                      </span>
                      <span className="text-xs text-muted truncate flex-1 text-left">
                        {truncateContent(step.content, 80)}
                      </span>
                      <div className="ml-auto flex-shrink-0">
                        {isExpanded ? (
                          <ChevronDown size={14} className="text-muted" />
                        ) : (
                          <ChevronRight size={14} className="text-muted" />
                        )}
                      </div>
                    </button>

                    <div
                      className="overflow-hidden transition-all duration-300 ease-in-out"
                      style={{ maxHeight: isExpanded ? '1200px' : '0px', opacity: isExpanded ? 1 : 0 }}
                    >
                      <div className="px-3 pb-3 text-xs text-muted leading-relaxed">
                        {/* 思考内容 */}
                        {step.type === 'thinking' && (
                          <div className="mt-2 text-xs text-muted leading-relaxed whitespace-pre-wrap">
                            {step.content}
                          </div>
                        )}

                        {/* 工具调用 */}
                        {step.type === 'action' && step.toolCall && (
                          <div className="mt-2 space-y-1">
                            <div className="text-xs font-medium text-amber-600 dark:text-amber-400">
                              工具：{step.toolCall.name}
                            </div>
                            <pre className="text-xs bg-surface-100 dark:bg-surface-800 rounded-lg p-2.5 font-mono overflow-x-auto">
                              {JSON.stringify(step.toolCall.arguments, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* 工具结果 */}
                        {step.type === 'observation' && step.toolResult && (
                          <div className="mt-2 space-y-1">
                            <div className={`text-xs font-medium ${step.toolResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-danger-600 dark:text-danger-400'}`}>
                              {step.toolResult.success ? '✓ 执行成功' : '✗ 执行失败'}
                            </div>
                            <pre className="text-xs bg-surface-100 dark:bg-surface-800 rounded-lg p-2.5 font-mono overflow-x-auto max-h-40 overflow-y-auto">
                              {step.toolResult.success ? step.toolResult.data : step.toolResult.error}
                            </pre>
                          </div>
                        )}

                        {/* 错误 */}
                        {step.type === 'error' && (
                          <div className="mt-2">
                            <div className="text-xs text-danger-600 dark:text-danger-400">
                              {step.content}
                            </div>
                          </div>
                        )}

                        {/* 用户选择 */}
                        {step.type === 'human_input' && step.humanChoice && (
                          <HumanChoicePanel
                            step={step}
                            onHumanInput={onHumanInput}
                            countdown={countdown}
                            multiSelections={multiSelections}
                            setMultiSelections={setMultiSelections}
                            customInputMap={customInputMap}
                            setCustomInputMap={setCustomInputMap}
                            customExpandedMap={customExpandedMap}
                            setCustomExpandedMap={setCustomExpandedMap}
                          />
                        )}

                        {/* 子任务成果（Boomerang 回流） */}
                        {step.type === 'subtask_result' && step.subtaskResult && (
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                任务:
                              </span>
                              <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">
                                {step.subtaskResult.task}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  step.subtaskResult.status === 'success'
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : step.subtaskResult.status === 'error'
                                    ? 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                }`}
                              >
                                {step.subtaskResult.status === 'success'
                                  ? '成功'
                                  : step.subtaskResult.status === 'error'
                                  ? '失败'
                                  : '部分完成'}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-400 dark:text-gray-500">
                              执行 {step.subtaskResult.stepCount} 步
                              {step.subtaskResult.artifacts && step.subtaskResult.artifacts.length > 0 && (
                                <span className="ml-2">
                                  · 产物: {step.subtaskResult.artifacts.slice(0, 3).join(', ')}
                                  {step.subtaskResult.artifacts.length > 3 && '...'}
                                </span>
                              )}
                            </div>
                            {step.subtaskResult.content && (
                              <div className="text-xs text-gray-600 dark:text-gray-400 bg-surface-50 dark:bg-surface-800/50 rounded-lg p-2.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
                                {step.subtaskResult.content.length > 800
                                  ? step.subtaskResult.content.slice(0, 800) + '...'
                                  : step.subtaskResult.content}
                              </div>
                            )}
                            {step.subtaskResult.error && (
                              <div className="text-xs text-danger-600 dark:text-danger-400">
                                错误: {step.subtaskResult.error}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 子 Agent 分组结束标记：如果后面还有其他 Agent 的步骤则已真正完成；只有最后一个组且整体运行中才显示"执行中" */}
              {isSubAgent && isAgentGroupEnd(step, index) && !agentGroupCollapsed && (index < processSteps.length - 1 || !isRunning) && (
                <div className="flex items-center gap-2 px-3 py-1 mx-6 text-xs text-indigo-400 dark:text-indigo-500">
                  <CheckCircle2 size={10} />
                  <span>{step.sourceAgentName || '子 Agent'} 任务完成</span>
                </div>
              )}
              {/* 仅当该子 Agent 是最后一个组且整体仍在运行时显示加载状态 */}
              {isSubAgent && isAgentGroupEnd(step, index) && !agentGroupCollapsed && index === processSteps.length - 1 && isRunning && (
                <div className="flex items-center gap-2 px-3 py-1 mx-6 text-xs text-amber-500 dark:text-amber-400">
                  <Loader2 size={10} className="animate-spin" />
                  <span>{step.sourceAgentName || '子 Agent'} 执行中...</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function truncateContent(content: string, maxLength: number): string {
  const clean = content.replace(/\n/g, ' ').trim()
  if (clean.length <= maxLength) return clean
  return clean.slice(0, maxLength) + '...'
}

// ==================== 用户选择面板组件 ====================

/** "以上都不是"选项的特殊值 */
const NONE_OF_ABOVE_VALUE = '__none_of_above__'

interface HumanChoicePanelProps {
  step: AgentStep
  onHumanInput?: (stepId: string, value: string | string[]) => void
  countdown: number | null
  multiSelections: Map<string, Set<string>>
  setMultiSelections: React.Dispatch<React.SetStateAction<Map<string, Set<string>>>>
  customInputMap: Map<string, string>
  setCustomInputMap: React.Dispatch<React.SetStateAction<Map<string, string>>>
  customExpandedMap: Map<string, boolean>
  setCustomExpandedMap: React.Dispatch<React.SetStateAction<Map<string, boolean>>>
}

function HumanChoicePanel({
  step,
  onHumanInput,
  countdown,
  multiSelections,
  setMultiSelections,
  customInputMap,
  setCustomInputMap,
  customExpandedMap,
  setCustomExpandedMap
}: HumanChoicePanelProps) {
  const customInputRef = useRef<HTMLTextAreaElement>(null)
  const choice = step.humanChoice!
  const isMultiple = choice.allowMultiple ?? false
  const hasResponded = step.humanResponse !== undefined
  const canClick = !hasResponded && onHumanInput

  // 获取当前步骤的多选集合
  const currentMultiSel = multiSelections.get(step.id) ?? new Set<string>()
  // 是否点击了"以上都不是"
  const isCustomExpanded = customExpandedMap.get(step.id) ?? false
  // 自定义输入内容
  const customInput = customInputMap.get(step.id) ?? ''

  // 判断选项是否被选中
  const isOptionSelected = (value: string): boolean => {
    if (hasResponded) {
      if (isMultiple) {
        return Array.isArray(step.humanResponse) && step.humanResponse.includes(value)
      }
      return step.humanResponse === value
    }
    // 未响应时，多选看 multiSelections
    if (isMultiple) {
      return currentMultiSel.has(value)
    }
    return false
  }

  // 判断"以上都不是"是否被选中
  const isNoneSelected = (): boolean => {
    if (hasResponded) {
      if (isMultiple) {
        return Array.isArray(step.humanResponse) && step.humanResponse.includes(NONE_OF_ABOVE_VALUE)
      }
      return step.humanResponse === NONE_OF_ABOVE_VALUE
    }
    return isCustomExpanded
  }

  // 单选点击
  const handleSingleSelect = (value: string) => {
    if (!canClick) return
    onHumanInput?.(step.id, value)
  }

  // 多选点击（切换选中状态）
  const handleMultiToggle = (value: string) => {
    if (!canClick) return
    setMultiSelections(prev => {
      const next = new Map(prev)
      const sel = new Set(next.get(step.id) ?? new Set<string>())
      if (value === NONE_OF_ABOVE_VALUE) {
        // 点击"以上都不是"：清除其他选项，切换自定义输入展开
        if (sel.has(NONE_OF_ABOVE_VALUE)) {
          sel.delete(NONE_OF_ABOVE_VALUE)
          setCustomExpandedMap(cp => {
            const n = new Map(cp)
            n.delete(step.id)
            return n
          })
        } else {
          sel.clear()
          sel.add(NONE_OF_ABOVE_VALUE)
          setCustomExpandedMap(cp => {
            const n = new Map(cp)
            n.set(step.id, true)
            return n
          })
        }
      } else {
        // 点击普通选项：如果之前选了"以上都不是"，先清除
        if (sel.has(NONE_OF_ABOVE_VALUE)) {
          sel.delete(NONE_OF_ABOVE_VALUE)
          setCustomExpandedMap(cp => {
            const n = new Map(cp)
            n.delete(step.id)
            return n
          })
        }
        if (sel.has(value)) {
          sel.delete(value)
        } else {
          sel.add(value)
        }
      }
      next.set(step.id, sel)
      return next
    })
  }

  // 多选确认提交
  const handleMultiConfirm = () => {
    if (!canClick) return
    const sel = multiSelections.get(step.id) ?? new Set<string>()
    const values: string[] = []
    sel.forEach(v => {
      if (v === NONE_OF_ABOVE_VALUE) {
        const input = customInputMap.get(step.id)?.trim()
        if (input) values.push(input)
      } else {
        values.push(v)
      }
    })
    if (values.length === 0) return
    onHumanInput?.(step.id, values)
  }

  // "以上都不是"单选确认
  const handleCustomConfirm = () => {
    if (!canClick) return
    const input = customInput.trim()
    if (!input) return
    onHumanInput?.(step.id, input)
  }

  // 展开"以上都不是"输入框后自动聚焦
  useEffect(() => {
    if (isCustomExpanded && !hasResponded && customInputRef.current) {
      customInputRef.current.focus()
    }
  }, [isCustomExpanded, hasResponded])

  // 格式化已选择的标签显示
  const formatSelectedLabel = (): string => {
    if (!hasResponded) return ''
    if (isMultiple && Array.isArray(step.humanResponse)) {
      const labels = step.humanResponse.map(v => {
        if (v === NONE_OF_ABOVE_VALUE) return '自定义输入'
        return choice.options.find(o => o.value === v)?.label ?? v
      })
      return labels.join('、')
    }
    if (step.humanResponse === NONE_OF_ABOVE_VALUE) return '自定义输入'
    return choice.options.find(o => o.value === step.humanResponse)?.label ?? String(step.humanResponse)
  }

  return (
    <div className="mt-2 space-y-2">
      {/* 问题 */}
      <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
        {choice.question}
        {isMultiple && (
          <span className="ml-2 text-xs font-normal text-blue-500 dark:text-blue-400">
            （可多选）
          </span>
        )}
      </div>

      {/* 选项列表 */}
      <div className="space-y-1.5">
        {choice.options.map((opt, idx) => {
          const selected = isOptionSelected(opt.value)
          return (
            <button
              key={idx}
              disabled={!canClick}
              onClick={() => isMultiple ? handleMultiToggle(opt.value) : handleSingleSelect(opt.value)}
              className={`flex items-start gap-2 w-full px-3 py-2 rounded-md border text-sm text-left transition-colors ${
                selected
                  ? 'border-blue-400 bg-blue-100 dark:bg-blue-900/40 dark:border-blue-600'
                  : canClick
                    ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300 hover:bg-blue-50 dark:hover:border-blue-700 dark:hover:bg-blue-950/20 cursor-pointer'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
              }`}
            >
              {/* 单选用圆形指示器，多选用方形复选框 */}
              <span className={`flex-shrink-0 w-5 h-5 ${
                isMultiple
                  ? 'rounded border-2 flex items-center justify-center text-xs font-medium'
                  : 'rounded-full border-2 flex items-center justify-center text-xs font-medium'
              } ${
                selected
                  ? 'border-blue-500 bg-blue-500 text-white'
                  : 'border-gray-300 dark:border-gray-600'
              }`}>
                {selected ? '\u2713' : String.fromCharCode(65 + idx)}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`font-medium ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                  {opt.label}
                </div>
                {opt.description && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {opt.description}
                  </div>
                )}
              </div>
            </button>
          )
        })}

        {/* "以上都不是"选项 */}
        <button
          disabled={!canClick}
          onClick={() => isMultiple ? handleMultiToggle(NONE_OF_ABOVE_VALUE) : (
            setCustomExpandedMap(prev => {
              const next = new Map(prev)
              next.set(step.id, !isCustomExpanded)
              return next
            })
          )}
          className={`flex items-start gap-2 w-full px-3 py-2 rounded-md border text-sm text-left transition-colors ${
            isNoneSelected()
              ? 'border-blue-400 bg-blue-100 dark:bg-blue-900/40 dark:border-blue-600'
              : canClick
                ? 'border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-blue-300 hover:bg-blue-50 dark:hover:border-blue-700 dark:hover:bg-blue-950/20 cursor-pointer'
                : 'border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
          }`}
        >
          <span className={`flex-shrink-0 w-5 h-5 ${
            isMultiple
              ? 'rounded border-2 flex items-center justify-center text-xs font-medium'
              : 'rounded-full border-2 flex items-center justify-center text-xs font-medium'
          } ${
            isNoneSelected()
              ? 'border-blue-500 bg-blue-500 text-white'
              : 'border-gray-300 dark:border-gray-600'
          }`}>
            {isNoneSelected() ? '\u2713' : <MessageSquarePlus size={12} className="text-gray-400" />}
          </span>
          <div className="flex-1 min-w-0">
            <div className={`font-medium ${isNoneSelected() ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>
              以上都不是，我自己输入
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              选择此项可自行输入你的答案
            </div>
          </div>
        </button>
      </div>

      {/* 自定义输入框（单选时点击"以上都不是"展开，多选时勾选"以上都不是"展开） */}
      {isCustomExpanded && !hasResponded && (
        <div className="space-y-2 pl-1">
          <textarea
            ref={customInputRef}
            value={customInput}
            onChange={(e) => setCustomInputMap(prev => {
              const next = new Map(prev)
              next.set(step.id, e.target.value)
              return next
            })}
            placeholder="请输入你的答案..."
            rows={2}
            className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-blue-300 dark:border-blue-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (isMultiple) {
                  handleMultiConfirm()
                } else {
                  handleCustomConfirm()
                }
              }
            }}
          />
          {!isMultiple && (
            <button
              onClick={handleCustomConfirm}
              disabled={!customInput.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-md shadow-sm transition-all duration-200 hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              确认提交
            </button>
          )}
        </div>
      )}

      {/* 多选确认按钮 */}
      {isMultiple && !hasResponded && currentMultiSel.size > 0 && (
        <button
          onClick={handleMultiConfirm}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-md shadow-sm transition-all duration-200 hover:shadow-md active:scale-95"
        >
          确认选择（已选 {currentMultiSel.size} 项）
        </button>
      )}

      {/* 倒计时提示 */}
      {!hasResponded && countdown !== null && (
        <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <Timer size={12} />
          <span>{countdown}秒后自动选择第一个选项</span>
        </div>
      )}

      {/* 已选择结果展示 */}
      {hasResponded && (
        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
          {'\u2705'} 用户已选择: {formatSelectedLabel()}
        </div>
      )}
    </div>
  )
}
