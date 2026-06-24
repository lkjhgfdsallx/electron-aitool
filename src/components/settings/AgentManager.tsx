import { useState, useEffect } from 'react'
import {
  X,
  Plus,
  Edit2,
  Trash2,
  Download,
  Upload,
  Save,
  Bot,
  Copy,
  ToggleLeft,
  ToggleRight,
  FileText,
  Brain,
  Wrench,
  Clock,
  Database,
  Settings,
  ChevronDown,
  BookOpen
} from 'lucide-react'
import { useAgentStore } from '../../stores/agent-store'
import { useKnowledgeCollectionStore } from '../../stores/knowledge-collection-store'
import { BUILT_IN_TOOLS, AGENT_BUILTIN_TOOLS } from '../../services/built-in-tools'
import { useAIProviderStore } from '../../stores/ai-provider-store'
import type {
  AgentProfile,
  AgentProfileCreateInput,
  PlanningStrategy
} from '../../types'

const AVATAR_OPTIONS = ['🤖', '🧠', '💻', '📝', '🔍', '🎨', '📊', '🔧', '🌐', '📚', '🎯', '⚡', '🛡️', '🧪', '🎮', '🎵']

const PLANNING_STRATEGIES: { value: PlanningStrategy; label: string; description: string }[] = [
  { value: 'react', label: '逐步推理（ReAct）', description: '思考-行动-观察，适合复杂任务' },
  { value: 'plan-and-execute', label: '先拆解再执行', description: '先制定计划，再逐步执行子任务' },
  { value: 'trial-and-error', label: '试错重试', description: '大胆尝试，失败后回退重试' }
]

// 新建 Agent 时默认选中所有工具的 ID
const ALL_TOOL_IDS = [...BUILT_IN_TOOLS, ...AGENT_BUILTIN_TOOLS].map((t) => t.id)

// 始终启用但对用户不可见的工具 ID（web 搜索相关能力由系统自动注入）
const HIDDEN_ALWAYS_ENABLED_TOOL_IDS = ['builtin:web_search', 'builtin:fetch_webpage']

// 在 UI 中可见的内置工具（排除始终隐藏的工具）
const VISIBLE_BUILT_IN_TOOLS = BUILT_IN_TOOLS.filter(
  (t) => !HIDDEN_ALWAYS_ENABLED_TOOL_IDS.includes(t.id)
)

const EMPTY_AGENT_INPUT: AgentProfileCreateInput = {
  name: '',
  description: '',
  avatar: '🤖',
  systemPrompt: '',
  enabledToolIds: [...ALL_TOOL_IDS],
  planningStrategy: 'react',
  memoryConfig: { historyTurns: 10, longTermEnabled: true, crossSession: true },
  termination: { maxSteps: 100, timeoutSeconds: 0, autoStopOnGoal: true },
  modelConfig: {},
  knowledgeBaseIds: [],
  enabled: true
}

export function AgentManager() {
  const {
    agents, createAgent, updateAgent, deleteAgent,
    duplicateAgent, toggleAgentEnabled, importAgents, exportAgents
  } = useAgentStore()

  const { providers } = useAIProviderStore()
  const { collections, loadCollections } = useKnowledgeCollectionStore()
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false)

  useEffect(() => {
    loadCollections()
  }, [loadCollections])

  const [editingAgent, setEditingAgent] = useState<AgentProfile | null>(null)
  const [agentForm, setAgentForm] = useState<AgentProfileCreateInput>(EMPTY_AGENT_INPUT)
  const [isCreating, setIsCreating] = useState(false)

  // ==================== Agent 操作 ====================

  const handleCreateAgent = () => {
    setAgentForm(EMPTY_AGENT_INPUT)
    setEditingAgent(null)
    setIsCreating(true)
  }

  const handleEditAgent = (agent: AgentProfile) => {
    setAgentForm({
      name: agent.name,
      description: agent.description,
      avatar: agent.avatar,
      systemPrompt: agent.systemPrompt,
      enabledToolIds: [...agent.enabledToolIds],
      planningStrategy: agent.planningStrategy,
      memoryConfig: { ...agent.memoryConfig },
      termination: { ...agent.termination },
      modelConfig: { ...agent.modelConfig },
      knowledgeBaseIds: agent.knowledgeBaseIds ? [...agent.knowledgeBaseIds] : [],
      enabled: agent.enabled
    })
    setEditingAgent(agent)
    setIsCreating(true)
  }

  const handleSaveAgent = () => {
    if (!agentForm.name.trim()) return
    if (editingAgent) {
      updateAgent({ id: editingAgent.id, ...agentForm })
    } else {
      createAgent(agentForm)
    }
    setIsCreating(false)
    setEditingAgent(null)
  }

  const handleDeleteAgent = (id: string) => {
    if (confirm('确定删除此 Agent？')) deleteAgent(id)
  }

  const handleExportAgents = () => {
    const data = exportAgents()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'agents.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportAgents = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text) as AgentProfile[]
        importAgents(data)
      } catch {
        alert('导入失败')
      }
    }
    input.click()
  }

  // ==================== Agent 编辑表单 ====================

  if (isCreating) {
    return (
      <div className="space-y-6">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
            <Bot size={20} className="text-accent-500" />
            {editingAgent ? '编辑 Agent' : '新建 Agent'}
          </h2>
          <button
            onClick={() => setIsCreating(false)}
            className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* 表单 */}
        <div className="space-y-6">
          {/* 基本信息 */}
          <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300 flex items-center gap-2">
              <Bot size={14} /> 基本信息
            </h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                {/* 头像选择 */}
                <div>
                  <label className="block text-xs text-muted mb-1.5">头像</label>
                  <div className="flex flex-wrap gap-1 w-24">
                    {AVATAR_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setAgentForm({ ...agentForm, avatar: emoji })}
                        className={`w-8 h-8 rounded text-lg flex items-center justify-center ${
                          agentForm.avatar === emoji
                            ? 'bg-accent-100 dark:bg-accent-900/30 ring-2 ring-accent-500'
                            : 'hover:bg-surface-100 dark:hover:bg-surface-800'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-muted mb-1.5">名称 *</label>
                  <input
                    type="text"
                    value={agentForm.name}
                    onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                    placeholder="我的 Agent"
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">描述</label>
                <input
                  type="text"
                  value={agentForm.description}
                  onChange={(e) => setAgentForm({ ...agentForm, description: e.target.value })}
                  placeholder="简短描述这个 Agent 的用途"
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400"
                />
              </div>
            </div>
          </div>

          {/* 系统提示词 */}
          <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300 flex items-center gap-2">
              <FileText size={14} /> 系统提示词
            </h3>
            <textarea
              value={agentForm.systemPrompt}
              onChange={(e) => setAgentForm({ ...agentForm, systemPrompt: e.target.value })}
              placeholder="定义 Agent 的身份、目标、行为规范和输出格式要求...&#10;&#10;例如：你是一个专业的代码审查助手，擅长发现代码中的潜在问题..."
              rows={6}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 resize-y font-mono"
            />
          </div>

          {/* 工具集 */}
          <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300 flex items-center gap-2">
              <Wrench size={14} /> 工具集
            </h3>
            <div className="space-y-2">
              {/* 通用工具 */}
              <div className="text-xs font-medium text-muted px-1 pt-1">通用工具</div>
              {VISIBLE_BUILT_IN_TOOLS.map((tool) => (
                <label
                  key={tool.id}
                  className="flex items-center gap-3 p-2 rounded-lg border border-surface-200/80 dark:border-surface-700/60 hover:bg-surface-50 dark:hover:bg-surface-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={agentForm.enabledToolIds.includes(tool.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setAgentForm({ ...agentForm, enabledToolIds: [...agentForm.enabledToolIds, tool.id] })
                      } else {
                        setAgentForm({ ...agentForm, enabledToolIds: agentForm.enabledToolIds.filter((id) => id !== tool.id) })
                      }
                    }}
                    className="rounded accent-accent-500"
                  />
                  <div>
                    <span className="text-sm">{tool.name}</span>
                    <p className="text-xs text-muted">{tool.description}</p>
                  </div>
                </label>
              ))}

              {/* Agent 专属工具 */}
              <div className="text-xs font-medium text-muted px-1 pt-2">Agent 专属工具</div>
              {AGENT_BUILTIN_TOOLS.map((tool) => (
                <label
                  key={tool.id}
                  className="flex items-center gap-3 p-2 rounded-lg border border-surface-200/80 dark:border-surface-700/60 hover:bg-surface-50 dark:hover:bg-surface-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={agentForm.enabledToolIds.includes(tool.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setAgentForm({ ...agentForm, enabledToolIds: [...agentForm.enabledToolIds, tool.id] })
                      } else {
                        setAgentForm({ ...agentForm, enabledToolIds: agentForm.enabledToolIds.filter((id) => id !== tool.id) })
                      }
                    }}
                    className="rounded accent-accent-500"
                  />
                  <div>
                    <span className="text-sm">{tool.name}</span>
                    <p className="text-xs text-muted">{tool.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 挂载知识库 */}
          <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300 flex items-center gap-2">
              <BookOpen size={14} /> 挂载知识库
            </h3>
            <p className="text-xs text-muted">
              选择 Agent 可访问的知识库集合。不选择任何集合时，Agent 将搜索全部知识库。
            </p>
            <div className="space-y-2">
              {collections.length === 0 ? (
                <p className="text-xs text-muted py-2">暂无知识库集合，请先在知识库中创建。</p>
              ) : (
                collections.map((col) => {
                  const isSelected = (agentForm.knowledgeBaseIds ?? []).includes(col.id)
                  return (
                    <label
                      key={col.id}
                      className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-accent-300 dark:border-accent-700 bg-accent-50/50 dark:bg-accent-900/20'
                          : 'border-surface-200/80 dark:border-surface-700/60 hover:bg-surface-50 dark:hover:bg-surface-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const current = agentForm.knowledgeBaseIds ?? []
                          if (e.target.checked) {
                            setAgentForm({ ...agentForm, knowledgeBaseIds: [...current, col.id] })
                          } else {
                            setAgentForm({ ...agentForm, knowledgeBaseIds: current.filter((id) => id !== col.id) })
                          }
                        }}
                        className="rounded accent-accent-500"
                      />
                      <span className="text-base flex-shrink-0">{col.icon}</span>
                      <div>
                        <span className="text-sm font-medium">{col.name}</span>
                        {col.description && (
                          <p className="text-xs text-muted">{col.description}</p>
                        )}
                      </div>
                    </label>
                  )
                })
              )}
            </div>
          </div>

          {/* 规划策略 */}
          <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300 flex items-center gap-2">
              <Brain size={14} /> 规划策略
            </h3>
            <div className="space-y-2">
              {PLANNING_STRATEGIES.map((s) => (
                <label
                  key={s.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    agentForm.planningStrategy === s.value
                      ? 'border-accent-300 dark:border-accent-700 bg-accent-50/50 dark:bg-accent-900/20'
                      : 'border-surface-200/80 dark:border-surface-700/60 hover:bg-surface-50 dark:hover:bg-surface-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="planning"
                    value={s.value}
                    checked={agentForm.planningStrategy === s.value}
                    onChange={() => setAgentForm({ ...agentForm, planningStrategy: s.value })}
                    className="mt-0.5 accent-accent-500"
                  />
                  <div>
                    <span className="text-sm font-medium">{s.label}</span>
                    <p className="text-xs text-muted mt-0.5">{s.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 记忆配置 */}
          <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300 flex items-center gap-2">
              <Database size={14} /> 记忆配置
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1.5">
                  历史轮数：{agentForm.memoryConfig.historyTurns}
                </label>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={agentForm.memoryConfig.historyTurns}
                  onChange={(e) =>
                    setAgentForm({
                      ...agentForm,
                      memoryConfig: { ...agentForm.memoryConfig, historyTurns: parseInt(e.target.value) }
                    })
                  }
                  className="w-full accent-accent-500"
                />
              </div>
              <label className="flex items-center justify-between p-2 rounded-lg border border-surface-200/80 dark:border-surface-700/60 cursor-pointer">
                <div>
                  <span className="text-sm">长期记忆</span>
                  <p className="text-xs text-muted">记住跨对话的重要信息</p>
                </div>
                <button
                  onClick={() =>
                    setAgentForm({
                      ...agentForm,
                      memoryConfig: {
                        ...agentForm.memoryConfig,
                        longTermEnabled: !agentForm.memoryConfig.longTermEnabled
                      }
                    })
                  }
                  className={agentForm.memoryConfig.longTermEnabled ? 'text-accent-500' : 'text-muted'}
                >
                  {agentForm.memoryConfig.longTermEnabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                </button>
              </label>
              <label className="flex items-center justify-between p-2 rounded-lg border border-surface-200/80 dark:border-surface-700/60 cursor-pointer">
                <div>
                  <span className="text-sm">跨会话记忆</span>
                  <p className="text-xs text-muted">在不同对话间共享记忆</p>
                </div>
                <button
                  onClick={() =>
                    setAgentForm({
                      ...agentForm,
                      memoryConfig: {
                        ...agentForm.memoryConfig,
                        crossSession: !agentForm.memoryConfig.crossSession
                      }
                    })
                  }
                  className={agentForm.memoryConfig.crossSession ? 'text-accent-500' : 'text-muted'}
                >
                  {agentForm.memoryConfig.crossSession ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                </button>
              </label>
            </div>
          </div>

          {/* 终止条件 */}
          <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300 flex items-center gap-2">
              <Clock size={14} /> 终止条件
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1.5">
                  最大步数：{agentForm.termination.maxSteps}
                </label>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={agentForm.termination.maxSteps}
                  onChange={(e) =>
                    setAgentForm({
                      ...agentForm,
                      termination: { ...agentForm.termination, maxSteps: parseInt(e.target.value) }
                    })
                  }
                  className="w-full accent-accent-500"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">
                  超时秒数（0 = 不限）：{agentForm.termination.timeoutSeconds}
                </label>
                <input
                  type="range"
                  min="0"
                  max="600"
                  step="30"
                  value={agentForm.termination.timeoutSeconds}
                  onChange={(e) =>
                    setAgentForm({
                      ...agentForm,
                      termination: { ...agentForm.termination, timeoutSeconds: parseInt(e.target.value) }
                    })
                  }
                  className="w-full accent-accent-500"
                />
              </div>
              <label className="flex items-center justify-between p-2 rounded-lg border border-surface-200/80 dark:border-surface-700/60 cursor-pointer">
                <div>
                  <span className="text-sm">目标达成自动停止</span>
                  <p className="text-xs text-muted">Agent 判断任务完成后自动终止</p>
                </div>
                <button
                  onClick={() =>
                    setAgentForm({
                      ...agentForm,
                      termination: {
                        ...agentForm.termination,
                        autoStopOnGoal: !agentForm.termination.autoStopOnGoal
                      }
                    })
                  }
                  className={agentForm.termination.autoStopOnGoal ? 'text-accent-500' : 'text-muted'}
                >
                  {agentForm.termination.autoStopOnGoal ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                </button>
              </label>
            </div>
          </div>

          {/* 模型配置 */}
          <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300 flex items-center gap-2">
              <Settings size={14} /> 模型配置（可选，留空使用全局配置）
            </h3>
            <div className="space-y-3">
              <div className="relative">
                <label className="block text-xs text-muted mb-1.5">AI 源</label>
                <button
                  onClick={() => setProviderDropdownOpen(!providerDropdownOpen)}
                  className="w-full px-3 py-2 text-sm text-left border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 flex items-center justify-between"
                >
                  <span className={agentForm.modelConfig.providerId ? '' : 'text-muted'}>
                    {agentForm.modelConfig.providerId
                      ? providers.find((p) => p.id === agentForm.modelConfig.providerId)?.name || '未知'
                      : '使用全局配置'}
                  </span>
                  <ChevronDown size={14} className={`text-muted transition-transform flex-shrink-0 ${providerDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {providerDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-surface-800 border border-surface-200/80 dark:border-surface-700/60 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    <div
                      className="px-3 py-2 text-sm hover:bg-surface-100 dark:hover:bg-surface-700 cursor-pointer"
                      onClick={() => {
                        setAgentForm({ ...agentForm, modelConfig: {} })
                        setProviderDropdownOpen(false)
                      }}
                    >
                      <span className="text-muted">使用全局配置</span>
                    </div>
                    {providers.map((p) => (
                      <div
                        key={p.id}
                        className="px-3 py-2 text-sm hover:bg-surface-100 dark:hover:bg-surface-700 cursor-pointer flex items-center justify-between"
                        onClick={() => {
                          setAgentForm({ ...agentForm, modelConfig: { ...agentForm.modelConfig, providerId: p.id, modelId: undefined } })
                          setProviderDropdownOpen(false)
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span>{p.name}</span>
                          <span className="text-xs text-muted ml-2">{p.baseUrl}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {agentForm.modelConfig.providerId && (() => {
                const selectedProvider = providers.find((p) => p.id === agentForm.modelConfig.providerId)
                if (!selectedProvider) return null
                const defaultModel = selectedProvider.models?.find((m) => m.id === selectedProvider.defaultModelId)
                return (
                  <div className="px-3 py-2 text-xs bg-surface-50 dark:bg-surface-900/50 rounded-lg border border-surface-200/80 dark:border-surface-700/60">
                    <span className="text-muted">使用模型：</span>
                    <span className="text-surface-700 dark:text-surface-300 font-medium">
                      {defaultModel ? defaultModel.name : selectedProvider.defaultModelId || '未选择模型'}
                    </span>
                    <span className="text-muted ml-2">（在 AI 源管理中配置）</span>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveAgent}
            disabled={!agentForm.name.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-accent-500 text-white rounded-xl hover:bg-accent-600 disabled:opacity-50 transition-colors text-sm"
          >
            <Save size={14} /> 保存
          </button>
          <button
            onClick={() => setIsCreating(false)}
            className="px-4 py-2 text-sm text-muted border border-surface-300 dark:border-surface-600 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    )
  }

  // ==================== 列表视图 ====================

  return (
    <div className="space-y-6">
      {/* 标题 + 操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
            <Bot size={20} className="text-accent-500" />
            Agent 管理
          </h2>
          <p className="text-sm text-muted mt-1">
            创建和管理 AI Agent，配置其行为、工具和记忆策略
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateAgent}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-accent-500 text-white rounded-xl hover:bg-accent-600 transition-colors"
          >
            <Plus size={14} /> 新建 Agent
          </button>
          <button
            onClick={handleImportAgents}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-surface-300 dark:border-surface-600 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            <Upload size={14} /> 导入
          </button>
          <button
            onClick={handleExportAgents}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-surface-300 dark:border-surface-600 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            <Download size={14} /> 导出
          </button>
        </div>
      </div>

      {/* Agent 列表 */}
      {agents.length === 0 ? (
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-8">
          <div className="text-center text-muted">
            <Bot size={36} className="mx-auto mb-3" />
            <p>暂无 Agent</p>
            <p className="text-sm mt-1">点击"新建 Agent"创建你的第一个智能助手</p>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 divide-y divide-surface-200/80 dark:divide-surface-700/60">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`flex items-center justify-between px-5 py-4 hover:bg-surface-50 dark:hover:bg-surface-900/30 transition-colors ${
                agent.enabled ? '' : 'opacity-60'
              }`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-2xl">{agent.avatar || '🤖'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-surface-800 dark:text-surface-200">{agent.name}</span>
                    {!agent.enabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 text-muted dark:bg-surface-800 border border-surface-200/80 dark:border-surface-700/60">
                        已禁用
                      </span>
                    )}
                  </div>
                  {agent.description && (
                    <p className="text-xs text-muted mt-0.5 truncate">{agent.description}</p>
                  )}
                  <p className="text-xs text-muted mt-1 truncate">
                    {agent.systemPrompt || '未设置系统提示词'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                <button
                  onClick={() => toggleAgentEnabled(agent.id)}
                  className={`p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 ${
                    agent.enabled ? 'text-green-500' : 'text-muted'
                  }`}
                  title={agent.enabled ? '禁用' : '启用'}
                >
                  {agent.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                </button>
                <button
                  onClick={() => handleEditAgent(agent)}
                  className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-muted"
                  title="编辑"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => duplicateAgent(agent.id)}
                  className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-muted"
                  title="复制"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => handleDeleteAgent(agent.id)}
                  className="p-1.5 rounded-lg hover:bg-danger-50 dark:hover:bg-danger-950/30 text-red-500"
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
