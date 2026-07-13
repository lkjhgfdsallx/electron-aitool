import { useState, useEffect, useMemo } from 'react'
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
  BookOpen,
  FolderOpen,
  ArrowUpToLine,
  Zap,
  Sparkles,
  User,
} from 'lucide-react'
import { SettingsHeader, SettingsSaveBar, useConfirmDialog, SettingsEmptyState } from './ui'
import { useAgentStore } from '../../stores/agent-store'
import { useWorkspaceAgentStore } from '../../stores/workspace-agent-store'
import { DEFAULT_AGENT_ID, WEBSITE_ANALYZER_AGENT_ID, WORKSPACE_LEADER_AGENT_ID, TASK_DECOMPOSITION_EXECUTOR_AGENT_ID } from '../../constants/default-agents'
import { useKnowledgeCollectionStore } from '../../stores/knowledge-collection-store'
import { useSkillStore } from '../../stores/skill-store'
import { BUILT_IN_TOOLS, AGENT_BUILTIN_TOOLS, WORKSPACE_TOOLS } from '../../services/built-in-tools'
import { useAIProviderStore } from '../../stores/ai-provider-store'
import { SYSTEM_AGENT_TAGS } from '../../types'
import type {
  AgentProfile,
  AgentProfileCreateInput,
  PlanningStrategy,
  AgentWorkflow,
  ContextPolicy,
  ApprovalPolicy,
  PromptSection,
} from '../../types'
import { AgentWorkflowEditor } from '../chat/AgentWorkflowEditor'
import { AgentCategoryBadge } from '../shared/AgentCategoryBadge'
import {
  groupAgentsByCategory,
  getAgentCategoryMeta,
} from '../../utils/agent-utils'

const AVATAR_OPTIONS = ['🤖', '🧠', '💻', '📝', '🔍', '🎨', '📊', '🔧', '🌐', '📚', '🎯', '⚡', '🛡️', '🧪', '🎮', '🎵']

const PLANNING_STRATEGIES: { value: PlanningStrategy; label: string; description: string }[] = [
  { value: 'react', label: '逐步推理（ReAct）', description: '思考-行动-观察，适合复杂任务' },
  { value: 'plan-and-execute', label: '先拆解再执行', description: '先制定计划，再逐步执行子任务' },
  { value: 'trial-and-error', label: '试错重试', description: '大胆尝试，失败后回退重试' }
]

// 新建全局 Agent 时默认选中所有通用/Agent 工具；工作区模式会额外加入工作区专用工具
const GLOBAL_AGENT_TOOL_IDS = [...BUILT_IN_TOOLS, ...AGENT_BUILTIN_TOOLS].map((t) => t.id)
const WORKSPACE_AGENT_TOOL_IDS = [...BUILT_IN_TOOLS, ...AGENT_BUILTIN_TOOLS, ...WORKSPACE_TOOLS].map((t) => t.id)

// 始终启用但对用户不可见的工具 ID（web 搜索相关能力由系统自动注入）
const HIDDEN_ALWAYS_ENABLED_TOOL_IDS = ['builtin:web_search', 'builtin:fetch_webpage']

// 在 UI 中可见的内置工具（排除始终隐藏的工具）
const VISIBLE_BUILT_IN_TOOLS = BUILT_IN_TOOLS.filter(
  (t) => !HIDDEN_ALWAYS_ENABLED_TOOL_IDS.includes(t.id)
)

function createEmptyAgentInput(isWorkspaceMode: boolean): AgentProfileCreateInput {
  return {
    name: '',
    description: '',
    avatar: '🤖',
    systemPrompt: '',
    enabledToolIds: isWorkspaceMode ? [...WORKSPACE_AGENT_TOOL_IDS] : [...GLOBAL_AGENT_TOOL_IDS],
    planningStrategy: 'react',
    memoryConfig: { historyTurns: 10, longTermEnabled: true, crossSession: true },
    termination: { maxSteps: 100, timeoutSeconds: 0, autoStopOnGoal: true },
    modelConfig: {},
    knowledgeBaseIds: [],
    enabledSkillIds: [],
    enabled: true,
    // Phase 4 新增字段默认值
    promptSections: [],
    maxParallelSubtasks: 3,
    contextPolicy: undefined,
    approvalPolicy: undefined,
    workflow: undefined,
  }
}

export interface AgentManagerProps {
  /** 工作区模式：显示工作区 Agent 而非全局 Agent */
  isWorkspaceMode?: boolean
  /** 工作区根目录路径（工作区模式下必须提供） */
  folderPath?: string
  /** 初始打开编辑的 Agent ID，用于工作区内复用完整编辑器 */
  initialEditingAgentId?: string
  /** 嵌入弹窗时关闭编辑器 */
  onClose?: () => void
}

export function AgentManager({ isWorkspaceMode = false, folderPath, initialEditingAgentId, onClose }: AgentManagerProps) {
  const {
    agents: globalAgents, createAgent: createGlobalAgent, updateAgent: updateGlobalAgent, deleteAgent: deleteGlobalAgent,
    duplicateAgent: duplicateGlobalAgent, toggleAgentEnabled: toggleGlobalAgentEnabled,
    importAgents: importGlobalAgents, exportAgents: exportGlobalAgents, resetToDefaultAgents,
  } = useAgentStore()
  const { confirm, Dialog } = useConfirmDialog()

  // 全局预设 Agent 的固定 ID 列表（不包含 AI 领导，它是工作区专用的）
  const GLOBAL_DEFAULT_AGENT_IDS = [DEFAULT_AGENT_ID, WEBSITE_ANALYZER_AGENT_ID, TASK_DECOMPOSITION_EXECUTOR_AGENT_ID]

  // 判断当前 Agent 是否为全局预设 Agent
  const isDefaultAgent = (agentId: string) => GLOBAL_DEFAULT_AGENT_IDS.includes(agentId)

  // 恢复单个预设 Agent 到默认状态
  const handleResetAgentToDefault = async (agentId: string) => {
    const agentName = agents.find((a) => a.id === agentId)?.name
    const ok = await confirm({
      title: '恢复默认状态',
      message: `确定要将 Agent"${agentName}"恢复为默认状态吗？\n\n此操作将丢失所有自定义修改。`,
      confirmLabel: '恢复',
      variant: 'warning',
    })
    if (ok) {
      deleteGlobalAgent(agentId)
      resetToDefaultAgents()
    }
  }

  // 恢复所有预设 Agent 到默认状态
  const handleResetAllDefaults = async () => {
    const ok = await confirm({
      title: '恢复所有预设 Agent',
      message: '确定要恢复所有预设 Agent 到默认状态吗？\n\n此操作将丢失所有预设 Agent 的自定义修改。',
      confirmLabel: '恢复全部',
      variant: 'warning',
    })
    if (ok) {
      resetToDefaultAgents()
    }
  }

  const {
    workspaceAgents, createWorkspaceAgent, updateWorkspaceAgent, deleteWorkspaceAgent,
    promoteToGlobal, loadWorkspaceAgents
  } = useWorkspaceAgentStore()

  // 根据模式选择 Agent 列表和操作函数
  // 全局模式下过滤掉 leader 标签 Agent（防御性：迁移后全局不应再有 leader）
  const agents = isWorkspaceMode
    ? workspaceAgents
    : globalAgents.filter((a) => !a.tags?.includes(SYSTEM_AGENT_TAGS.LEADER))
  const createAgent = isWorkspaceMode
    ? (input: AgentProfileCreateInput) => { if (folderPath) createWorkspaceAgent(input, folderPath) }
    : createGlobalAgent
  const updateAgentFn = isWorkspaceMode
    ? (input: Partial<AgentProfile> & { id: string }) => { if (folderPath) updateWorkspaceAgent(input, folderPath) }
    : updateGlobalAgent
  const deleteAgentFn = isWorkspaceMode
    ? (id: string) => { if (folderPath) deleteWorkspaceAgent(id, folderPath) }
    : deleteGlobalAgent
  const duplicateAgentFn = isWorkspaceMode
    ? undefined // 工作区模式暂不支持复制
    : duplicateGlobalAgent
  const toggleAgentEnabledFn = isWorkspaceMode
    ? (id: string) => {
        const agent = workspaceAgents.find((a) => a.id === id)
        if (agent && folderPath) updateWorkspaceAgent({ id, enabled: !agent.enabled }, folderPath)
      }
    : toggleGlobalAgentEnabled

  // 按分类分组（预设 / 工作区专属 / 自定义），用于列表视图分区展示
  const groupedAgents = useMemo(() => groupAgentsByCategory(agents), [agents])

  const { providers } = useAIProviderStore()
  const { collections, loadCollections } = useKnowledgeCollectionStore()
  const { skills, ensureSkillsLoaded } = useSkillStore()
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false)

  useEffect(() => {
    loadCollections()
  }, [loadCollections])

  useEffect(() => {
    void ensureSkillsLoaded()
  }, [ensureSkillsLoaded])

  const [editingAgent, setEditingAgent] = useState<AgentProfile | null>(null)
  const [agentForm, setAgentForm] = useState<AgentProfileCreateInput>(() => createEmptyAgentInput(isWorkspaceMode))
  const [isCreating, setIsCreating] = useState(false)

  // ==================== Agent 操作 ====================

  const handleCreateAgent = () => {
    setAgentForm(createEmptyAgentInput(isWorkspaceMode))
    setEditingAgent(null)
    setIsCreating(true)
  }

  const handleEditAgent = (agent: AgentProfile) => {
    const fallbackToolIds = isWorkspaceMode ? WORKSPACE_AGENT_TOOL_IDS : GLOBAL_AGENT_TOOL_IDS
    setAgentForm({
      name: agent.name,
      description: agent.description,
      avatar: agent.avatar,
      systemPrompt: agent.systemPrompt,
      enabledToolIds: agent.enabledToolIds.length > 0 ? [...agent.enabledToolIds] : [...fallbackToolIds],
      planningStrategy: agent.planningStrategy,
      memoryConfig: { ...agent.memoryConfig },
      termination: { ...agent.termination },
      modelConfig: { ...agent.modelConfig },
      knowledgeBaseIds: agent.knowledgeBaseIds ? [...agent.knowledgeBaseIds] : [],
      enabled: agent.enabled,
      // Phase 4 字段
      promptSections: agent.promptSections ? agent.promptSections.map((s) => ({ ...s })) : [],
      maxParallelSubtasks: agent.maxParallelSubtasks ?? 3,
      contextPolicy: agent.contextPolicy ? { ...agent.contextPolicy } : undefined,
      approvalPolicy: agent.approvalPolicy ? { ...agent.approvalPolicy } : undefined,
      workflow: agent.workflow ? (JSON.parse(JSON.stringify(agent.workflow)) as AgentWorkflow) : undefined,
    })
    setEditingAgent(agent)
    setIsCreating(true)
  }

  useEffect(() => {
    if (!initialEditingAgentId || isCreating) return
    const agent = agents.find((a) => a.id === initialEditingAgentId)
    if (agent) handleEditAgent(agent)
  }, [initialEditingAgentId, agents, isCreating])

  const handleCloseEditor = () => {
    setIsCreating(false)
    setEditingAgent(null)
    onClose?.()
  }

  const handleSaveAgent = async () => {
    if (!agentForm.name.trim()) return
    try {
      if (editingAgent) {
        await updateAgentFn({ id: editingAgent.id, ...agentForm })
      } else {
        await createAgent(agentForm)
      }
    } catch (err) {
      alert(`保存失败: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    setIsCreating(false)
    setEditingAgent(null)
    onClose?.()
  }

  const handleDeleteAgent = async (id: string) => {
    const ok = await confirm({
      title: '删除 Agent',
      message: '确定删除此 Agent？',
      confirmLabel: '删除',
      variant: 'danger',
    })
    if (ok) {
      try {
        await deleteAgentFn(id)
      } catch (err) {
        alert(`删除失败: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  const handlePromoteToGlobal = (id: string) => {
    const promoted = promoteToGlobal(id)
    if (promoted) {
      alert(`已将 Agent "${promoted.name}" 提升为全局 Agent`)
    }
  }

  const handleExportAgents = () => {
    if (isWorkspaceMode) return // 工作区模式下不支持导出
    const data = exportGlobalAgents()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'agents.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportAgents = () => {
    if (isWorkspaceMode) return // 工作区模式下不支持导入
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text) as AgentProfile[]
        importGlobalAgents(data)
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
        <div className="flex-shrink-0 px-1 pb-4">
          <SettingsHeader
            icon={Bot}
            title={editingAgent ? '编辑 Agent' : '新建 Agent'}
            actions={
              <button
                onClick={handleCloseEditor}
                className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
              >
                <X size={18} />
              </button>
            }
          />
        </div>

        {/* 表单 — 可滚动区域 */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
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
                    className="rounded accent-500"
                  />
                  <div>
                    <span className="text-sm">{tool.name}</span>
                    <p className="text-xs text-muted">{tool.description}</p>
                  </div>
                </label>
              ))}

              {isWorkspaceMode && (
                <>
                  {/* 工作区专用工具 */}
                  <div className="text-xs font-medium text-muted px-1 pt-2">工作区专用工具</div>
                  {WORKSPACE_TOOLS.map((tool) => (
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
                        className="rounded accent-500"
                      />
                      <div>
                        <span className="text-sm">{tool.name}</span>
                        <p className="text-xs text-muted">{tool.description}</p>
                      </div>
                    </label>
                  ))}
                </>
              )}

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
                    className="rounded accent-500"
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
                        className="rounded accent-500"
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

          {/* 绑定 Skills */}
          <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300 flex items-center gap-2">
              <Zap size={14} /> 绑定技能（Skills）
            </h3>
            <p className="text-xs text-muted">
              选择此 Agent 可使用的专业技能。绑定后，Agent 会了解这些技能的存在并在适当时主动加载。
            </p>
            <div className="space-y-2">
              {skills.length === 0 ? (
                <p className="text-xs text-muted py-2">暂无可用技能，请先在 Skills 管理中创建。</p>
              ) : (
                skills.filter((s) => s.enabled).map((skill) => {
                  const isSelected = (agentForm.enabledSkillIds ?? []).includes(skill.dirPath)
                  return (
                    <label
                      key={skill.dirPath}
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
                          if (e.target.checked) {
                            setAgentForm({ ...agentForm, enabledSkillIds: [...(agentForm.enabledSkillIds ?? []), skill.dirPath] })
                          } else {
                            setAgentForm({ ...agentForm, enabledSkillIds: (agentForm.enabledSkillIds ?? []).filter((id) => id !== skill.dirPath) })
                          }
                        }}
                        className="rounded accent-500"
                      />
                      <div>
                        <span className="text-sm font-mono font-medium">{skill.name}</span>
                        <p className="text-xs text-muted line-clamp-1">{skill.description}</p>
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
                    className="mt-0.5 accent-500"
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
                  className="w-full accent-500"
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
                  className="w-full accent-500"
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
                  className="w-full accent-500"
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

        {/* ========== 高级策略 ========== */}
        <div className="space-y-4 p-4 bg-surface-50/50 dark:bg-surface-900/30 rounded-xl border border-surface-200/80 dark:border-surface-700/60">
          <div className="flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-surface-200">
            <Zap size={16} className="text-accent-500" />
            高级策略
          </div>

          {/* 上下文压缩策略 */}
          <div className="space-y-2">
            <label className="block text-xs text-muted">上下文压缩策略</label>
            <div className="flex items-center gap-2">
              <select
                value={agentForm.contextPolicy?.strategy ?? 'fixed'}
                onChange={(e) => {
                  const strategy = e.target.value as ContextPolicy['strategy']
                  setAgentForm({
                    ...agentForm,
                    contextPolicy: { ...(agentForm.contextPolicy ?? { maxTokens: 128000, keepRecentTurns: 6 }), strategy },
                  })
                }}
                className="text-xs rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-2 py-1"
              >
                <option value="fixed">fixed（丢弃早期消息）</option>
                <option value="compress">compress（LLM 摘要压缩）</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-muted">
                最大 tokens：
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  value={agentForm.contextPolicy?.maxTokens ?? 128000}
                  onChange={(e) =>
                    setAgentForm({
                      ...agentForm,
                      contextPolicy: {
                        ...(agentForm.contextPolicy ?? { strategy: 'fixed', keepRecentTurns: 6 }),
                        maxTokens: parseInt(e.target.value) || 128000,
                      },
                    })
                  }
                  className="w-20 text-xs rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-1.5 py-1"
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-muted">
                保留最近：
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={agentForm.contextPolicy?.keepRecentTurns ?? 6}
                  onChange={(e) =>
                    setAgentForm({
                      ...agentForm,
                      contextPolicy: {
                        ...(agentForm.contextPolicy ?? { strategy: 'fixed', maxTokens: 128000 }),
                        keepRecentTurns: parseInt(e.target.value) || 6,
                      },
                    })
                  }
                  className="w-14 text-xs rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-1.5 py-1"
                />
                条
              </label>
            </div>
          </div>

          {/* 审批策略 */}
          <div className="space-y-2">
            <label className="block text-xs text-muted">文件操作审批策略</label>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={agentForm.approvalPolicy?.autoApproveRead ?? false}
                  onChange={(e) =>
                    setAgentForm({
                      ...agentForm,
                      approvalPolicy: {
                        ...(agentForm.approvalPolicy ?? { requireApprovalFor: [] }),
                        autoApproveRead: e.target.checked,
                      },
                    })
                  }
                  className="accent-500"
                />
                自动批准读操作
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={agentForm.approvalPolicy?.autoApproveWrite ?? false}
                  onChange={(e) =>
                    setAgentForm({
                      ...agentForm,
                      approvalPolicy: {
                        ...(agentForm.approvalPolicy ?? { requireApprovalFor: [] }),
                        autoApproveWrite: e.target.checked,
                      },
                    })
                  }
                  className="accent-500"
                />
                自动批准写操作
              </label>
            </div>
          </div>

          {/* 并行子任务上限 */}
          <div className="space-y-1">
            <label className="block text-xs text-muted">
              并行子任务上限：{agentForm.maxParallelSubtasks ?? 3}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={agentForm.maxParallelSubtasks ?? 3}
              onChange={(e) =>
                setAgentForm({ ...agentForm, maxParallelSubtasks: parseInt(e.target.value) })
              }
              className="w-full accent-500"
            />
          </div>

          {/* 工作流状态机编辑器 */}
          <div className="space-y-2">
            <label className="block text-xs text-muted">工作流状态机</label>
            <AgentWorkflowEditor
              workflow={agentForm.workflow}
              onChange={(wf) => setAgentForm({ ...agentForm, workflow: wf })}
              availableTools={[...VISIBLE_BUILT_IN_TOOLS, ...AGENT_BUILTIN_TOOLS].map((t) => ({ id: t.id, name: t.name }))}
            />
          </div>

          {/* Prompt 段落（promptSections）简易编辑器 */}
          <PromptSectionsEditor
            sections={agentForm.promptSections ?? []}
            onChange={(sections) => setAgentForm({ ...agentForm, promptSections: sections })}
          />
        </div>

        {/* Sticky 底部保存栏 — 替代原来埋在底部的按钮 */}
        <SettingsSaveBar
          onSave={handleSaveAgent}
          isDirty={agentForm.name.trim().length > 0}
          saveLabel={editingAgent ? '保存修改' : '创建 Agent'}
          onReset={() => handleCloseEditor()}
          resetLabel="取消"
        />
      </div>
    )
  }

  // ==================== 列表视图 ====================

  return (
    <div className="space-y-6">
      {/* 标题 + 操作栏 */}
      <SettingsHeader
        icon={isWorkspaceMode ? FolderOpen : Bot}
        title={isWorkspaceMode ? '工作区 Agent' : 'Agent 管理'}
        description={isWorkspaceMode
          ? '管理工作区独立 Agent，可提升为全局 Agent'
          : '创建和管理 AI Agent，配置其行为、工具和记忆策略'}
        actions={
          <>
            {!isWorkspaceMode && (
              <button
                onClick={handleResetAllDefaults}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-accent-300 dark:border-accent-700 text-accent-600 dark:text-accent-400 rounded-xl hover:bg-accent-50 dark:hover:bg-accent-950/30 transition-colors"
                title="恢复所有预设 Agent 到默认状态"
              >
                <Sparkles size={14} /> 恢复默认
              </button>
            )}
            <button
              onClick={handleCreateAgent}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-accent-500 text-white rounded-xl hover:bg-accent-600 transition-colors"
            >
              <Plus size={14} /> 新建 Agent
            </button>
            {!isWorkspaceMode && (
              <>
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
              </>
            )}
          </>
        }
      />

      {/* Agent 列表（按分类分组：预设 / 工作区专属 / 自定义） */}
      {agents.length === 0 ? (
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-8">
          <SettingsEmptyState
            icon={Bot}
            title="暂无 Agent"
            description={'点击"新建 Agent"创建你的第一个智能助手'}
            iconSize={36}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {groupedAgents.map(({ category, agents: groupAgents }) => {
            const meta = getAgentCategoryMeta(category)
            const GroupIcon = meta.icon === 'Sparkles' ? Sparkles : meta.icon === 'FolderOpen' ? FolderOpen : User
            return (
              <div key={category}>
                {/* 分组标题 */}
                <div className="flex items-center gap-1.5 px-1 pb-2">
                  <GroupIcon size={13} className="text-surface-400 dark:text-surface-500" />
                  <span className="text-xs font-semibold text-surface-600 dark:text-surface-400">
                    {meta.label}
                  </span>
                  <span className="text-[11px] text-muted">({groupAgents.length})</span>
                </div>
                {/* 分组列表 */}
                <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 divide-y divide-surface-200/80 dark:divide-surface-700/60">
                  {groupAgents.map((agent) => (
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
                            <AgentCategoryBadge agent={agent} short />
                            {!agent.enabled && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 text-muted dark:bg-surface-800 border border-surface-200/80 dark:border-surface-700/60">
                                已禁用
                              </span>
                            )}
                          </div>
                          {agent.description && (
                            <p className="text-xs text-muted mt-0.5 truncate">{agent.description}</p>
                          )}
                          {agent.tags && agent.tags.filter((t) => t !== SYSTEM_AGENT_TAGS.WORKSPACE && t !== SYSTEM_AGENT_TAGS.LEADER).length > 0 && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {agent.tags.filter((t) => t !== SYSTEM_AGENT_TAGS.WORKSPACE && t !== SYSTEM_AGENT_TAGS.LEADER).map((tag) => (
                                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 dark:bg-surface-800 text-muted border border-surface-200/80 dark:border-surface-700/60">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                        {!isWorkspaceMode && isDefaultAgent(agent.id) && (
                          <button
                            onClick={() => handleResetAgentToDefault(agent.id)}
                            className="p-1.5 rounded-lg hover:bg-accent-50 dark:hover:bg-accent-950/30 text-accent-500"
                            title="恢复为默认 Agent"
                          >
                            <Sparkles size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => toggleAgentEnabledFn(agent.id)}
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
                        {!isWorkspaceMode && duplicateAgentFn && (
                          <button
                            onClick={() => duplicateAgentFn(agent.id)}
                            className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-muted"
                            title="复制"
                          >
                            <Copy size={14} />
                          </button>
                        )}
                        {isWorkspaceMode && (
                          <button
                            onClick={() => handlePromoteToGlobal(agent.id)}
                            className="p-1.5 rounded-lg hover:bg-accent-50 dark:hover:bg-accent-950/20 text-accent-500"
                            title="提升为全局 Agent"
                          >
                            <ArrowUpToLine size={14} />
                          </button>
                        )}
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
              </div>
            )
          })}
        </div>
      )}
      <Dialog />
    </div>
  )
}

// ==================== PromptSectionsEditor 子组件（Phase 4） ====================

interface PromptSectionsEditorProps {
  sections: PromptSection[]
  onChange: (sections: PromptSection[]) => void
}

function PromptSectionsEditor({ sections, onChange }: PromptSectionsEditorProps) {
  const handleAdd = () => {
    const newSection: PromptSection = {
      id: crypto.randomUUID(),
      type: 'custom',
      title: `段落 ${sections.length + 1}`,
      content: '',
      enabled: true,
      order: sections.length,
    }
    onChange([...sections, newSection])
  }

  const handleUpdate = (idx: number, patch: Partial<PromptSection>) => {
    onChange(sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const handleDelete = (idx: number) => {
    onChange(sections.filter((_, i) => i !== idx))
  }

  const handleMove = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= sections.length) return
    const next = [...sections]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    // 重新分配 order
    next.forEach((s, i) => { s.order = i })
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs text-muted">提示词段落（按 order 拼接到系统提示词）</label>
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700"
        >
          <Plus size={12} /> 添加段落
        </button>
      </div>
      {sections.length === 0 && (
        <p className="text-[11px] text-surface-400 italic">暂无段落</p>
      )}
      <div className="space-y-1.5">
        {sections.map((section, idx) => (
          <div
            key={section.id}
            className={`rounded border border-surface-200 dark:border-surface-700 p-2 space-y-1.5 ${
              section.enabled ? 'bg-white dark:bg-surface-800/60' : 'bg-surface-50 dark:bg-surface-900/40 opacity-60'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleUpdate(idx, { enabled: !section.enabled })}
                className={section.enabled ? 'text-accent-500' : 'text-surface-400'}
                title={section.enabled ? '禁用' : '启用'}
              >
                {section.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
              </button>
              <input
                type="text"
                value={section.title ?? ''}
                onChange={(e) => handleUpdate(idx, { title: e.target.value })}
                placeholder="段落标题"
                className="flex-1 text-xs font-medium rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-2 py-0.5"
              />
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => handleMove(idx, -1)}
                  disabled={idx === 0}
                  className="text-surface-400 hover:text-surface-600 disabled:opacity-30 text-xs px-1"
                  title="上移"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(idx, 1)}
                  disabled={idx === sections.length - 1}
                  className="text-surface-400 hover:text-surface-600 disabled:opacity-30 text-xs px-1"
                  title="下移"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(idx)}
                  className="text-surface-400 hover:text-red-500"
                  title="删除"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            <textarea
              value={section.content}
              onChange={(e) => handleUpdate(idx, { content: e.target.value })}
              rows={2}
              placeholder="段落内容…"
              className="w-full text-xs rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-2 py-1 font-mono resize-y"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
