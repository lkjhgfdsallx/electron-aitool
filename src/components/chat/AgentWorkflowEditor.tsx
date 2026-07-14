/**
 * AgentWorkflowEditor - 工作流状态机编辑器
 *
 * 提供两种编辑模式：
 * 1. 可视化模式：以卡片形式编辑状态（label / allowedTools / systemPromptSection）与转移规则
 * 2. JSON 模式：直接编辑 AgentWorkflow JSON（适合高级用户/导入导出）
 *
 * 内置校验：调用 validateWorkflow 实时提示结构错误。
 */

import { useState, useMemo, useEffect } from 'react'
import { Plus, Trash2, GitBranch, Code2, Eye, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react'
import type {
  AgentWorkflow,
  WorkflowState,
  WorkflowTransition,
  TransitionCondition,
  TransitionConditionType,
} from '../../types'
import { validateWorkflow, isTerminalState } from '../../types'

interface AgentWorkflowEditorProps {
  /** 当前工作流（未配置时为 undefined） */
  workflow: AgentWorkflow | undefined
  /** 工作流变更回调 */
  onChange: (workflow: AgentWorkflow | undefined) => void
  /** 可选：可选工具列表（用于 allowedTools 下拉） */
  availableTools?: Array<{ id: string; name: string }>
}

const CONDITION_TYPES: { value: TransitionConditionType; label: string; hint: string }[] = [
  { value: 'tool_called', label: '调用工具', hint: '当指定工具被调用时触发' },
  { value: 'tool_result', label: '工具结果', hint: '当指定工具返回（可限定成功/失败）时触发' },
  { value: 'plan_status', label: '计划状态', hint: '当计划进入指定状态时触发' },
  { value: 'message_contains', label: '消息包含', hint: '当 LLM 输出包含关键词时触发' },
  { value: 'always', label: '始终', hint: '无条件触发（兜底转移）' },
]

const PLAN_STATUSES = ['draft', 'approved', 'executing', 'done', 'failed']

/** 创建空白工作流（含一个初始状态） */
function createEmptyWorkflow(): AgentWorkflow {
  return {
    initial: 'start',
    terminals: ['done'],
    states: {
      start: {
        label: '开始',
        allowedTools: [],
        systemPromptSection: '',
        transitions: [
          {
            to: 'done',
            when: [{ type: 'always' }],
          },
        ],
      },
      done: {
        label: '完成',
        transitions: [],
      },
    },
  }
}

/** 深拷贝工作流（便于不可变更新） */
function cloneWorkflow(wf: AgentWorkflow): AgentWorkflow {
  return JSON.parse(JSON.stringify(wf)) as AgentWorkflow
}

export function AgentWorkflowEditor({
  workflow,
  onChange,
  availableTools = [],
}: AgentWorkflowEditorProps) {
  const [mode, setMode] = useState<'visual' | 'json'>('visual')
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)

  // 同步外部 workflow 到 JSON 文本
  useEffect(() => {
    if (workflow) {
      setJsonText(JSON.stringify(workflow, null, 2))
      setJsonError(null)
    } else {
      setJsonText('')
    }
  }, [workflow])

  // 校验错误（实时）
  const validationErrors = useMemo(() => {
    if (!workflow) return []
    return validateWorkflow(workflow)
  }, [workflow])

  /** 启用工作流（创建空白模板） */
  const handleEnable = () => {
    onChange(createEmptyWorkflow())
  }

  /** 禁用工作流 */
  const handleDisable = () => {
    onChange(undefined)
  }

  /** 更新工作流局部字段 */
  const updateWorkflow = (updater: (wf: AgentWorkflow) => void) => {
    if (!workflow) return
    const next = cloneWorkflow(workflow)
    updater(next)
    onChange(next)
  }

  /** 添加新状态 */
  const handleAddState = () => {
    updateWorkflow((wf) => {
      let name = `state_${Object.keys(wf.states).length + 1}`
      while (wf.states[name]) {
        name = `${name}_x`
      }
      wf.states[name] = {
        label: name,
        allowedTools: [],
        systemPromptSection: '',
        transitions: [],
      }
    })
  }

  /** 删除状态（同时清理指向它的转移） */
  const handleDeleteState = (stateName: string) => {
    updateWorkflow((wf) => {
      // 不能删除初始状态
      if (stateName === wf.initial) return
      delete wf.states[stateName]
      // 清理转移引用
      for (const sn of Object.keys(wf.states)) {
        wf.states[sn].transitions = wf.states[sn].transitions.filter((t) => t.to !== stateName)
      }
      // 清理 terminals
      if (wf.terminals) {
        wf.terminals = wf.terminals.filter((t) => t !== stateName)
      }
    })
  }

  /** 重命名状态 */
  const handleRenameState = (oldName: string, newName: string) => {
    if (!newName || newName === oldName) return
    updateWorkflow((wf) => {
      if (wf.states[newName]) return // 重名冲突
      const state = wf.states[oldName]
      const newStates: Record<string, WorkflowState> = {}
      for (const [sn, sv] of Object.entries(wf.states)) {
        newStates[sn === oldName ? newName : sn] = sv
      }
      wf.states = newStates
      // 更新转移中的引用
      for (const sv of Object.values(wf.states)) {
        for (const t of sv.transitions) {
          if (t.to === oldName) t.to = newName
        }
      }
      if (wf.initial === oldName) wf.initial = newName
      if (wf.terminals) {
        wf.terminals = wf.terminals.map((t) => (t === oldName ? newName : t))
      }
    })
  }

  /** 添加转移 */
  const handleAddTransition = (stateName: string) => {
    updateWorkflow((wf) => {
      const state = wf.states[stateName]
      if (!state) return
      const targetNames = Object.keys(wf.states).filter((n) => n !== stateName)
      state.transitions.push({
        to: targetNames[0] ?? stateName,
        when: [{ type: 'always' }],
      })
    })
  }

  /** 删除转移 */
  const handleDeleteTransition = (stateName: string, transitionIdx: number) => {
    updateWorkflow((wf) => {
      const state = wf.states[stateName]
      if (!state) return
      state.transitions.splice(transitionIdx, 1)
    })
  }

  /** 添加条件 */
  const handleAddCondition = (stateName: string, transitionIdx: number) => {
    updateWorkflow((wf) => {
      const t = wf.states[stateName]?.transitions[transitionIdx]
      if (!t) return
      t.when.push({ type: 'always' })
    })
  }

  /** 删除条件 */
  const handleDeleteCondition = (stateName: string, transitionIdx: number, condIdx: number) => {
    updateWorkflow((wf) => {
      const t = wf.states[stateName]?.transitions[transitionIdx]
      if (!t) return
      t.when.splice(condIdx, 1)
    })
  }

  /** 应用 JSON 编辑 */
  const handleApplyJson = () => {
    try {
      const parsed = JSON.parse(jsonText) as AgentWorkflow
      const errors = validateWorkflow(parsed)
      if (errors.length > 0) {
        setJsonError(`校验失败：${errors[0]}`)
        return
      }
      setJsonError(null)
      onChange(parsed)
    } catch (e) {
      setJsonError(`JSON 解析错误：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ========== 未启用工作流时显示启用按钮 ==========
  if (!workflow) {
    return (
      <div className="rounded-lg border border-dashed border-surface-300 dark:border-surface-600 p-6 text-center">
        <GitBranch className="w-8 h-8 mx-auto mb-2 text-surface-400" />
        <p className="text-sm text-surface-500 dark:text-surface-400 mb-3">
          尚未为该 Agent 配置工作流状态机
        </p>
        <button
          type="button"
          onClick={handleEnable}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          启用工作流
        </button>
      </div>
    )
  }

  const stateNames = Object.keys(workflow.states)

  return (
    <div className="space-y-3">
      {/* 头部：模式切换 + 校验状态 + 禁用按钮 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 rounded-md bg-surface-100 dark:bg-surface-800 p-0.5">
          <button
            type="button"
            onClick={() => setMode('visual')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              mode === 'visual'
                ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 shadow-sm'
                : 'text-surface-500 dark:text-surface-400'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            可视化
          </button>
          <button
            type="button"
            onClick={() => setMode('json')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              mode === 'json'
                ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 shadow-sm'
                : 'text-surface-500 dark:text-surface-400'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            JSON
          </button>
        </div>

        <div className="flex items-center gap-2">
          {validationErrors.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              校验通过
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400" title={validationErrors.join('\n')}>
              <AlertCircle className="w-3.5 h-3.5" />
              {validationErrors.length} 个问题
            </span>
          )}
          <button
            type="button"
            onClick={handleDisable}
            className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
          >
            禁用工作流
          </button>
        </div>
      </div>

      {/* 校验错误详情 */}
      {validationErrors.length > 0 && mode === 'visual' && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-2 text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
          {validationErrors.map((err, i) => (
            <div key={i}>• {err}</div>
          ))}
        </div>
      )}

      {/* ========== 可视化模式 ========== */}
      {mode === 'visual' && (
        <div className="space-y-3">
          {/* 全局配置：初始状态 + 终止状态 */}
          <div className="rounded-md bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700 p-3 space-y-2">
            <div className="text-xs font-semibold text-surface-700 dark:text-surface-300">全局配置</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] text-surface-500 dark:text-surface-400">初始状态</span>
                <select
                  value={workflow.initial}
                  onChange={(e) => updateWorkflow((wf) => { wf.initial = e.target.value })}
                  className="mt-0.5 w-full text-xs rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-2 py-1"
                >
                  {stateNames.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] text-surface-500 dark:text-surface-400">终止状态（逗号分隔）</span>
                <input
                  type="text"
                  value={(workflow.terminals ?? []).join(', ')}
                  onChange={(e) =>
                    updateWorkflow((wf) => {
                      wf.terminals = e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                    })
                  }
                  className="mt-0.5 w-full text-xs rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-2 py-1"
                  placeholder="done, cancelled"
                />
              </label>
            </div>
          </div>

          {/* 状态列表 */}
          {stateNames.map((stateName) => {
            const state = workflow.states[stateName]
            const isInitial = stateName === workflow.initial
            const isTerminal = isTerminalState(workflow, stateName)
            return (
              <StateCard
                key={stateName}
                stateName={stateName}
                state={state}
                allStateNames={stateNames}
                isInitial={isInitial}
                isTerminal={isTerminal}
                availableTools={availableTools}
                onRename={(newName) => handleRenameState(stateName, newName)}
                onDelete={() => handleDeleteState(stateName)}
                onUpdate={(updater) =>
                  updateWorkflow((wf) => {
                    const s = wf.states[stateName]
                    if (s) updater(s)
                  })
                }
                onAddTransition={() => handleAddTransition(stateName)}
                onDeleteTransition={(idx) => handleDeleteTransition(stateName, idx)}
                onAddCondition={(tIdx) => handleAddCondition(stateName, tIdx)}
                onDeleteCondition={(tIdx, cIdx) => handleDeleteCondition(stateName, tIdx, cIdx)}
              />
            )
          })}

          <button
            type="button"
            onClick={handleAddState}
            className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md border border-dashed border-surface-300 dark:border-surface-600 text-surface-500 dark:text-surface-400 hover:border-primary-400 hover:text-primary-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            添加状态
          </button>
        </div>
      )}

      {/* ========== JSON 模式 ========== */}
      {mode === 'json' && (
        <div className="space-y-2">
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
            className="w-full h-96 text-xs font-mono rounded-md border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 resize-y"
          />
          {jsonError && (
            <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {jsonError}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-surface-400">
              编辑后点击"应用"以解析并校验
            </span>
            <button
              type="button"
              onClick={handleApplyJson}
              className="px-3 py-1 text-xs font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700"
            >
              应用
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== StateCard 子组件 ====================

interface StateCardProps {
  stateName: string
  state: WorkflowState
  allStateNames: string[]
  isInitial: boolean
  isTerminal: boolean
  availableTools: Array<{ id: string; name: string }>
  onRename: (newName: string) => void
  onDelete: () => void
  onUpdate: (updater: (state: WorkflowState) => void) => void
  onAddTransition: () => void
  onDeleteTransition: (idx: number) => void
  onAddCondition: (transitionIdx: number) => void
  onDeleteCondition: (transitionIdx: number, condIdx: number) => void
}

function StateCard({
  stateName,
  state,
  allStateNames,
  isInitial,
  isTerminal,
  availableTools,
  onRename,
  onDelete,
  onUpdate,
  onAddTransition,
  onDeleteTransition,
  onAddCondition,
  onDeleteCondition,
}: StateCardProps) {
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(stateName)

  const commitRename = () => {
    setEditingName(false)
    if (nameDraft.trim() && nameDraft !== stateName) {
      onRename(nameDraft.trim())
    } else {
      setNameDraft(stateName)
    }
  }

  return (
    <div className="rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800/60 overflow-hidden">
      {/* 状态头 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') { setEditingName(false); setNameDraft(stateName) }
            }}
            className="text-xs font-mono font-semibold rounded border border-primary-400 bg-white dark:bg-surface-900 px-1.5 py-0.5 w-32"
          />
        ) : (
          <button
            type="button"
            onClick={() => { setNameDraft(stateName); setEditingName(true) }}
            className="text-xs font-mono font-semibold text-surface-800 dark:text-surface-100 hover:text-primary-600"
          >
            {stateName}
          </button>
        )}

        {/* 徽章 */}
        <div className="flex items-center gap-1">
          {isInitial && (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              初始
            </span>
          )}
          {isTerminal && (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
              终止
            </span>
          )}
          {state.label && (
            <span className="text-[11px] text-surface-400">{state.label}</span>
          )}
        </div>

        <div className="ml-auto">
          {!isInitial && (
            <button
              type="button"
              onClick={onDelete}
              className="text-surface-400 hover:text-red-500"
              title="删除状态"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 状态体 */}
      <div className="p-3 space-y-2.5">
        {/* 标签 */}
        <label className="block">
          <span className="text-[11px] text-surface-500 dark:text-surface-400">显示标签</span>
          <input
            type="text"
            value={state.label ?? ''}
            onChange={(e) => onUpdate((s) => { s.label = e.target.value })}
            className="mt-0.5 w-full text-xs rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-2 py-1"
          />
        </label>

        {/* 允许工具 */}
        <div>
          <span className="text-[11px] text-surface-500 dark:text-surface-400">
            允许工具（留空 = 继承 Agent 启用工具）
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {(state.allowedTools ?? []).map((toolId) => (
              <span
                key={toolId}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300"
              >
                {toolId}
                <button
                  type="button"
                  onClick={() =>
                    onUpdate((s) => {
                      s.allowedTools = (s.allowedTools ?? []).filter((t) => t !== toolId)
                    })
                  }
                  className="text-surface-400 hover:text-red-500"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {availableTools.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return
                onUpdate((s) => {
                  s.allowedTools = [...(s.allowedTools ?? []), e.target.value]
                })
              }}
              className="mt-1 text-[11px] rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-1.5 py-0.5"
            >
              <option value="">+ 添加工具…</option>
              {availableTools
                .filter((t) => !(state.allowedTools ?? []).includes(t.id) && !(state.allowedTools ?? []).includes(t.name))
                .map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                ))}
            </select>
          )}
        </div>

        {/* 提示词片段 */}
        <label className="block">
          <span className="text-[11px] text-surface-500 dark:text-surface-400">
            系统提示词片段（注入到当前轮系统提示词）
          </span>
          <textarea
            value={state.systemPromptSection ?? ''}
            onChange={(e) => onUpdate((s) => { s.systemPromptSection = e.target.value })}
            rows={2}
            className="mt-0.5 w-full text-xs rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-2 py-1 font-mono resize-y"
            placeholder="例如：此时你应专注于收集需求，不要开始写代码"
          />
        </label>

        {/* 转移规则 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-surface-600 dark:text-surface-300">
              转移规则（满足任一条件即转移）
            </span>
            <button
              type="button"
              onClick={onAddTransition}
              className="inline-flex items-center gap-0.5 text-[11px] text-primary-600 hover:text-primary-700"
            >
              <Plus className="w-3 h-3" />
              转移
            </button>
          </div>
          <div className="space-y-1.5">
            {state.transitions.map((trans, tIdx) => (
              <TransitionRow
                key={tIdx}
                transition={trans}
                allStateNames={allStateNames.filter((n) => n !== stateName)}
                availableTools={availableTools}
                onUpdate={(updater) =>
                  onUpdate((s) => {
                    const t = s.transitions[tIdx]
                    if (t) updater(t)
                  })
                }
                onDelete={() => onDeleteTransition(tIdx)}
                onAddCondition={() => onAddCondition(tIdx)}
                onDeleteCondition={(cIdx) => onDeleteCondition(tIdx, cIdx)}
              />
            ))}
            {state.transitions.length === 0 && (
              <div className="text-[11px] text-surface-400 italic px-1">无转移规则</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ==================== TransitionRow 子组件 ====================

interface TransitionRowProps {
  transition: WorkflowTransition
  allStateNames: string[]
  availableTools: Array<{ id: string; name: string }>
  onUpdate: (updater: (t: WorkflowTransition) => void) => void
  onDelete: () => void
  onAddCondition: () => void
  onDeleteCondition: (condIdx: number) => void
}

function TransitionRow({
  transition,
  allStateNames,
  availableTools,
  onUpdate,
  onDelete,
  onAddCondition,
  onDeleteCondition,
}: TransitionRowProps) {
  return (
    <div className="rounded border border-surface-200 dark:border-surface-700 p-2 space-y-1.5 bg-surface-50/50 dark:bg-surface-800/30">
      {/* 目标状态 */}
      <div className="flex items-center gap-1.5">
        <ArrowRight className="w-3 h-3 text-surface-400 shrink-0" />
        <select
          value={transition.to}
          onChange={(e) => onUpdate((t) => { t.to = e.target.value })}
          className="text-[11px] font-mono rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-1.5 py-0.5"
        >
          {allStateNames.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto text-surface-400 hover:text-red-500"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* 条件列表 */}
      <div className="pl-4 space-y-1">
        {transition.when.map((cond, cIdx) => (
          <ConditionRow
            key={cIdx}
            condition={cond}
            availableTools={availableTools}
            onUpdate={(updater) =>
              onUpdate((t) => {
                const c = t.when[cIdx]
                if (c) updater(c)
              })
            }
            onDelete={() => onDeleteCondition(cIdx)}
          />
        ))}
        <button
          type="button"
          onClick={onAddCondition}
          className="inline-flex items-center gap-0.5 text-[11px] text-surface-400 hover:text-primary-600"
        >
          <Plus className="w-3 h-3" />
          或条件
        </button>
      </div>
    </div>
  )
}

// ==================== ConditionRow 子组件 ====================

interface ConditionRowProps {
  condition: TransitionCondition
  availableTools: Array<{ id: string; name: string }>
  onUpdate: (updater: (c: TransitionCondition) => void) => void
  onDelete: () => void
}

function ConditionRow({ condition, availableTools, onUpdate, onDelete }: ConditionRowProps) {
  const condMeta = CONDITION_TYPES.find((c) => c.value === condition.type)
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <select
        value={condition.type}
        onChange={(e) => {
          const newType = e.target.value as TransitionConditionType
          // 切换类型时重置相关字段
          onUpdate((c) => {
            c.type = newType
            delete c.toolName
            delete c.toolSuccess
            delete c.planStatus
            delete c.keyword
          })
        }}
        className="text-[11px] rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-1.5 py-0.5"
        title={condMeta?.hint}
      >
        {CONDITION_TYPES.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>

      {/* 按类型渲染额外输入 */}
      {(condition.type === 'tool_called' || condition.type === 'tool_result') && (
        <>
          <select
            value={condition.toolName ?? ''}
            onChange={(e) => onUpdate((c) => { c.toolName = e.target.value || undefined })}
            className="text-[11px] rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-1.5 py-0.5"
          >
            <option value="">工具名…</option>
            {availableTools.map((t) => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </select>
          {condition.type === 'tool_result' && (
            <select
              value={condition.toolSuccess === undefined ? '' : String(condition.toolSuccess)}
              onChange={(e) =>
                onUpdate((c) => {
                  c.toolSuccess = e.target.value === '' ? undefined : e.target.value === 'true'
                })
              }
              className="text-[11px] rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-1.5 py-0.5"
            >
              <option value="">任意结果</option>
              <option value="true">成功</option>
              <option value="false">失败</option>
            </select>
          )}
        </>
      )}

      {condition.type === 'plan_status' && (
        <select
          value={condition.planStatus ?? ''}
          onChange={(e) => onUpdate((c) => { c.planStatus = e.target.value || undefined })}
          className="text-[11px] rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-1.5 py-0.5"
        >
          <option value="">状态…</option>
          {PLAN_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}

      {condition.type === 'message_contains' && (
        <input
          type="text"
          value={condition.keyword ?? ''}
          onChange={(e) => onUpdate((c) => { c.keyword = e.target.value || undefined })}
          placeholder="关键词"
          className="text-[11px] rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-1.5 py-0.5 w-24"
        />
      )}

      {condition.type === 'always' && (
        <span className="text-[11px] text-surface-400 italic">无条件</span>
      )}

      <button
        type="button"
        onClick={onDelete}
        className="text-surface-400 hover:text-red-500 ml-auto"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}
