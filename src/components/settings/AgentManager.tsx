import { useState } from 'react'
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
  ChevronDown
} from 'lucide-react'
import { useAgentStore } from '../../stores/agent-store'
import { BUILT_IN_TOOLS, AGENT_BUILTIN_TOOLS } from '../../services/built-in-tools'
import { usePromptStore } from '../../stores/agent-store'
import { useAIProviderStore } from '../../stores/ai-provider-store'
import type {
  AgentProfile,
  AgentProfileCreateInput,
  PlanningStrategy,
  MemoryConfig,
  TerminationConfig,
  AgentModelConfig,
  Prompt,
  PromptCreateInput
} from '../../types'

interface AgentManagerProps {
  onClose: () => void
}

type TabType = 'agents' | 'prompts'

const AVATAR_OPTIONS = ['🤖', '🧠', '💻', '📝', '🔍', '🎨', '📊', '🔧', '🌐', '📚', '🎯', '⚡', '🛡️', '🧪', '🎮', '🎵']

const PLANNING_STRATEGIES: { value: PlanningStrategy; label: string; description: string }[] = [
  { value: 'react', label: '逐步推理（ReAct）', description: '思考-行动-观察，适合复杂任务' },
  { value: 'plan-and-execute', label: '先拆解再执行', description: '先制定计划，再逐步执行子任务' },
  { value: 'trial-and-error', label: '试错重试', description: '大胆尝试，失败后回退重试' }
]

// 新建 Agent 时默认选中所有工具的 ID
const ALL_TOOL_IDS = [...BUILT_IN_TOOLS, ...AGENT_BUILTIN_TOOLS].map((t) => t.id)

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
  enabled: true
}

export function AgentManager({ onClose }: AgentManagerProps) {
  const {
    agents, createAgent, updateAgent, deleteAgent,
    duplicateAgent, toggleAgentEnabled, importAgents, exportAgents,
    prompts, createPrompt, updatePrompt, deletePrompt,
    importPrompts, exportPrompts
  } = useAgentStore()

  const { providers } = useAIProviderStore()
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false)

  const [tab, setTab] = useState<TabType>('agents')
  const [editingAgent, setEditingAgent] = useState<AgentProfile | null>(null)
  const [agentForm, setAgentForm] = useState<AgentProfileCreateInput>(EMPTY_AGENT_INPUT)
  const [isCreating, setIsCreating] = useState(false)

  // Prompt 相关
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null)
  const [promptForm, setPromptForm] = useState<PromptCreateInput>({ name: '', description: '', content: '' })
  const [isCreatingPrompt, setIsCreatingPrompt] = useState(false)

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
      enabledToolIds: agent.enabledToolIds,
      planningStrategy: agent.planningStrategy,
      memoryConfig: { ...agent.memoryConfig },
      termination: { ...agent.termination },
      modelConfig: { ...agent.modelConfig },
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
    if (confirm('确定删除此 Agent？')) {
      deleteAgent(id)
    }
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
        alert('导入失败，请检查文件格式')
      }
    }
    input.click()
  }

  // ==================== Prompt 操作 ====================

  const handleCreatePrompt = () => {
    setPromptForm({ name: '', description: '', content: '' })
    setEditingPrompt(null)
    setIsCreatingPrompt(true)
  }

  const handleEditPrompt = (prompt: Prompt) => {
    setPromptForm({ name: prompt.name, description: prompt.description, content: prompt.content })
    setEditingPrompt(prompt)
    setIsCreatingPrompt(true)
  }

  const handleSavePrompt = () => {
    if (!promptForm.name.trim()) return
    if (editingPrompt) {
      updatePrompt({ id: editingPrompt.id, ...promptForm })
    } else {
      createPrompt(promptForm)
    }
    setIsCreatingPrompt(false)
    setEditingPrompt(null)
  }

  const handleExportPrompts = () => {
    const data = exportPrompts()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'prompts.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportPrompts = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text) as Prompt[]
        importPrompts(data)
      } catch {
        alert('导入失败')
      }
    }
    input.click()
  }

  // ==================== Agent 编辑表单 ====================

  if (isCreating) {
    return (
      <div className="flex flex-col h-full">
        {/* 标题 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bot size={20} className="text-primary-500" />
            {editingAgent ? '编辑 Agent' : '新建 Agent'}
          </h2>
          <button
            onClick={() => setIsCreating(false)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 表单 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* 基本信息 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Bot size={14} /> 基本信息
            </h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                {/* 头像选择 */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">头像</label>
                  <div className="flex flex-wrap gap-1 w-24">
                    {AVATAR_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setAgentForm({ ...agentForm, avatar: emoji })}
                        className={`w-8 h-8 rounded text-lg flex items-center justify-center ${
                          agentForm.avatar === emoji
                            ? 'bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-500'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">名称 *</label>
                  <input
                    type="text"
                    value={agentForm.name}
                    onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                    placeholder="我的 Agent"
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">描述</label>
                <input
                  type="text"
                  value={agentForm.description}
                  onChange={(e) => setAgentForm({ ...agentForm, description: e.target.value })}
                  placeholder="简短描述这个 Agent 的用途"
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          </section>

          {/* 系统提示词 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <FileText size={14} /> 系统提示词
            </h3>
            <textarea
              value={agentForm.systemPrompt}
              onChange={(e) => setAgentForm({ ...agentForm, systemPrompt: e.target.value })}
              placeholder="定义 Agent 的身份、目标、行为规范和输出格式要求...&#10;&#10;例如：你是一个专业的代码审查助手，擅长发现代码中的潜在问题..."
              rows={6}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y font-mono"
            />
          </section>

          {/* 工具集 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Wrench size={14} /> 工具集
            </h3>
            <div className="space-y-2">
              {/* 通用工具 */}
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 px-1 pt-1">通用工具</div>
              {BUILT_IN_TOOLS.map((tool) => (
                <label
                  key={tool.id}
                  className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={agentForm.enabledToolIds.includes(tool.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setAgentForm({
                          ...agentForm,
                          enabledToolIds: [...agentForm.enabledToolIds, tool.id]
                        })
                      } else {
                        setAgentForm({
                          ...agentForm,
                          enabledToolIds: agentForm.enabledToolIds.filter((id) => id !== tool.id)
                        })
                      }
                    }}
                    className="rounded text-primary-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{tool.name}</div>
                    <div className="text-xs text-gray-500 truncate">{tool.description}</div>
                  </div>
                </label>
              ))}
              {/* Agent 专用工具 */}
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 px-1 pt-2">Agent 专用工具</div>
              {AGENT_BUILTIN_TOOLS.map((tool) => (
                <label
                  key={tool.id}
                  className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={agentForm.enabledToolIds.includes(tool.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setAgentForm({
                          ...agentForm,
                          enabledToolIds: [...agentForm.enabledToolIds, tool.id]
                        })
                      } else {
                        setAgentForm({
                          ...agentForm,
                          enabledToolIds: agentForm.enabledToolIds.filter((id) => id !== tool.id)
                        })
                      }
                    }}
                    className="rounded text-primary-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{tool.name}</div>
                    <div className="text-xs text-gray-500 truncate">{tool.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* 规划策略 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Brain size={14} /> 规划策略
            </h3>
            <div className="space-y-2">
              {PLANNING_STRATEGIES.map((s) => (
                <label
                  key={s.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    agentForm.planningStrategy === s.value
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="planningStrategy"
                    value={s.value}
                    checked={agentForm.planningStrategy === s.value}
                    onChange={() => setAgentForm({ ...agentForm, planningStrategy: s.value })}
                    className="mt-0.5 text-primary-500"
                  />
                  <div>
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-gray-500">{s.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* 记忆配置 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Database size={14} /> 记忆配置
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  对话历史保留轮数: {agentForm.memoryConfig.historyTurns}
                </label>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={agentForm.memoryConfig.historyTurns}
                  onChange={(e) =>
                    setAgentForm({
                      ...agentForm,
                      memoryConfig: { ...agentForm.memoryConfig, historyTurns: Number(e.target.value) }
                    })
                  }
                  className="w-full"
                />
              </div>
              <label className="flex items-center justify-between p-2 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">启用长期记忆</div>
                  <div className="text-xs text-gray-500">Agent 可记住跨对话的关键事实</div>
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
                  className={agentForm.memoryConfig.longTermEnabled ? 'text-primary-500' : 'text-gray-400'}
                >
                  {agentForm.memoryConfig.longTermEnabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                </button>
              </label>
              <label className="flex items-center justify-between p-2 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">跨会话记忆</div>
                  <div className="text-xs text-gray-500">记忆在不同对话间共享</div>
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
                  className={agentForm.memoryConfig.crossSession ? 'text-primary-500' : 'text-gray-400'}
                >
                  {agentForm.memoryConfig.crossSession ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                </button>
              </label>
            </div>
          </section>

          {/* 终止条件 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Clock size={14} /> 终止条件
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">最大推理步数（0=无限制）</label>
                <input
                  type="number"
                  min={0}
                  value={agentForm.termination.maxSteps}
                  onChange={(e) =>
                    setAgentForm({
                      ...agentForm,
                      termination: { ...agentForm.termination, maxSteps: Number(e.target.value) }
                    })
                  }
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">超时时间（秒，0=不限制）</label>
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={agentForm.termination.timeoutSeconds}
                  onChange={(e) =>
                    setAgentForm({
                      ...agentForm,
                      termination: { ...agentForm.termination, timeoutSeconds: Number(e.target.value) }
                    })
                  }
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <label className="flex items-center justify-between p-2 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">达到目标后自动结束</div>
                  <div className="text-xs text-gray-500">Agent 判断任务完成时自动停止</div>
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
                  className={agentForm.termination.autoStopOnGoal ? 'text-primary-500' : 'text-gray-400'}
                >
                  {agentForm.termination.autoStopOnGoal ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                </button>
              </label>
            </div>
          </section>

          {/* 模型配置 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Settings size={14} /> 模型配置（可选，留空使用全局配置）
            </h3>
            <div className="space-y-3">
              {/* Provider 选择 */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">AI 源（Provider）</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setProviderDropdownOpen(!providerDropdownOpen) }}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <span className="truncate">
                      {agentForm.modelConfig.providerId
                        ? providers.find((p) => p.id === agentForm.modelConfig.providerId)?.name || '未知源'
                        : '使用全局配置'}
                    </span>
                    <ChevronDown size={14} className={`text-gray-400 transition-transform flex-shrink-0 ${providerDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {providerDropdownOpen && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      <div
                        onClick={() => {
                          setAgentForm({ ...agentForm, modelConfig: { ...agentForm.modelConfig, providerId: undefined, modelId: undefined } })
                          setProviderDropdownOpen(false)
                        }}
                        className="px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700"
                      >
                        <span className="text-gray-500">使用全局配置</span>
                      </div>
                      {providers.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => {
                            setAgentForm({ ...agentForm, modelConfig: { ...agentForm.modelConfig, providerId: p.id, modelId: undefined } })
                            setProviderDropdownOpen(false)
                          }}
                          className={`px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
                            agentForm.modelConfig.providerId === p.id ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-600 dark:text-primary-400' : ''
                          }`}
                        >
                          <span>{p.name}</span>
                          <span className="text-xs text-gray-400 ml-2">{p.baseUrl}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 选中 provider 后显示其默认模型 */}
              {agentForm.modelConfig.providerId && (() => {
                const selectedProvider = providers.find((p) => p.id === agentForm.modelConfig.providerId)
                if (!selectedProvider) return null
                const defaultModel = selectedProvider.defaultModelId
                  ? selectedProvider.models.find((m) => m.id === selectedProvider.defaultModelId)
                  : null
                return (
                  <div className="px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span className="text-gray-500">使用模型：</span>
                    <span className="text-gray-700 dark:text-gray-300 font-medium">
                      {defaultModel ? defaultModel.name : selectedProvider.defaultModelId || '未选择模型'}
                    </span>
                    <span className="text-gray-400 ml-2">（在 AI 源管理中配置）</span>
                  </div>
                )
              })()}

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Temperature: {agentForm.modelConfig.temperature ?? '默认'}
                </label>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={agentForm.modelConfig.temperature ?? 0.7}
                  onChange={(e) =>
                    setAgentForm({
                      ...agentForm,
                      modelConfig: { ...agentForm.modelConfig, temperature: Number(e.target.value) }
                    })
                  }
                  className="w-full"
                />
              </div>
            </div>
          </section>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSaveAgent}
            disabled={!agentForm.name.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors text-sm"
          >
            <Save size={14} /> 保存
          </button>
          <button
            onClick={() => setIsCreating(false)}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    )
  }

  // ==================== Prompt 编辑表单 ====================

  if (isCreatingPrompt) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">
            {editingPrompt ? '编辑提示词' : '新建提示词'}
          </h2>
          <button
            onClick={() => setIsCreatingPrompt(false)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">名称 *</label>
            <input
              type="text"
              value={promptForm.name}
              onChange={(e) => setPromptForm({ ...promptForm, name: e.target.value })}
              placeholder="我的提示词"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">描述</label>
            <input
              type="text"
              value={promptForm.description}
              onChange={(e) => setPromptForm({ ...promptForm, description: e.target.value })}
              placeholder="提示词的简短描述"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">提示词内容</label>
            <textarea
              value={promptForm.content}
              onChange={(e) => setPromptForm({ ...promptForm, content: e.target.value })}
              placeholder="你是一个有帮助的助手..."
              rows={10}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y font-mono"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSavePrompt}
            disabled={!promptForm.name.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors text-sm"
          >
            <Save size={14} /> 保存
          </button>
          <button
            onClick={() => setIsCreatingPrompt(false)}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    )
  }

  // ==================== 列表视图 ====================

  return (
    <div className="flex flex-col h-full">
      {/* 标题 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Bot size={20} className="text-primary-500" />
          Agent 管理
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setTab('agents')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'agents'
              ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Agent ({agents.length})
        </button>
        <button
          onClick={() => setTab('prompts')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'prompts'
              ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          提示词 ({prompts.length})
        </button>
      </div>

      {/* 操作栏 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        {tab === 'agents' ? (
          <>
            <button
              onClick={handleCreateAgent}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              <Plus size={14} /> 新建 Agent
            </button>
            <button
              onClick={handleImportAgents}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Upload size={14} /> 导入
            </button>
            <button
              onClick={handleExportAgents}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Download size={14} /> 导出
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleCreatePrompt}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              <Plus size={14} /> 新建
            </button>
            <button
              onClick={handleImportPrompts}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Upload size={14} /> 导入
            </button>
            <button
              onClick={handleExportPrompts}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Download size={14} /> 导出
            </button>
          </>
        )}
      </div>

      {/* 列表内容 */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {tab === 'agents' ? (
          agents.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <Bot size={36} className="mx-auto mb-3" />
              <p>暂无 Agent</p>
              <p className="text-sm mt-1">点击"新建 Agent"创建你的第一个智能助手</p>
            </div>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className={`p-3 border rounded-lg transition-colors ${
                    agent.enabled
                      ? 'border-gray-200 dark:border-gray-700'
                      : 'border-gray-100 dark:border-gray-800 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{agent.avatar || '🤖'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm">{agent.name}</h3>
                        {!agent.enabled && (
                          <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
                            已禁用
                          </span>
                        )}
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                          {PLANNING_STRATEGIES.find((s) => s.value === agent.planningStrategy)?.label.split('（')[0]}
                        </span>
                      </div>
                      {agent.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{agent.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1 truncate">
                        {agent.systemPrompt || '未设置系统提示词'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => toggleAgentEnabled(agent.id)}
                        className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 ${
                          agent.enabled ? 'text-green-500' : 'text-gray-400'
                        }`}
                        title={agent.enabled ? '禁用' : '启用'}
                      >
                        {agent.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                      <button
                        onClick={() => handleEditAgent(agent)}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                        title="编辑"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => duplicateAgent(agent.id)}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                        title="复制"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteAgent(agent.id)}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          // 提示词列表
          prompts.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <FileText size={36} className="mx-auto mb-3" />
              <p>暂无提示词</p>
              <p className="text-sm mt-1">点击"新建"创建你的第一个提示词</p>
            </div>
          ) : (
            <div className="space-y-2">
              {prompts.map((prompt) => (
                <div
                  key={prompt.id}
                  className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm">{prompt.name}</h3>
                      {prompt.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{prompt.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1 truncate">{prompt.content || '无内容'}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => handleEditPrompt(prompt)}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('确定删除此提示词？')) deletePrompt(prompt.id)
                        }}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
