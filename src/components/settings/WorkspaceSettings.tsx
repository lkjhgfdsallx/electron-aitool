/**
 * 工作区设置组件
 *
 * 设置页面中的工作区管理板块，包含：
 * 1. 工作区列表页：卡片列表展示所有工作区
 * 2. 工作区编辑表单（选中某个工作区后展示）
 */

import { useState, useCallback } from 'react'
import {
  Briefcase,
  Plus,
  FolderOpen,
  Bot,
  Users,
  Clock,
  Shield,
  Terminal,
  Database,
  Plug,
  ChevronRight,
  Trash2,
  Play,
  ArrowLeft,
} from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useAgentStore } from '../../stores/agent-store'
import { workspaceVCSService } from '../../services/workspace-vcs-service'
import type {
  Workspace,
  WorkspaceUpdateInput,
  CheckpointPolicy,
  CommandPolicy,
} from '../../types'

// ---- 存档策略选项 ----

const CHECKPOINT_POLICY_OPTIONS: Array<{ value: CheckpointPolicy; label: string; desc: string }> = [
  { value: 'auto-before-modify', label: '自动（修改前）', desc: '在文件被修改前自动创建存档点' },
  { value: 'manual', label: '手动', desc: '仅在手动触发时创建存档点' },
  { value: 'timed', label: '定时', desc: '按固定时间间隔创建存档点' },
]

// ---- 命令策略选项 ----

const COMMAND_POLICY_OPTIONS: Array<{ value: CommandPolicy; label: string; desc: string }> = [
  { value: 'auto-approve-safe', label: '自动批准安全命令', desc: '安全命令自动执行，中高风险需审批' },
  { value: 'all-need-approval', label: '全部需要审批', desc: '所有命令都需要人工审批' },
  { value: 'auto-approve-all', label: '全部自动批准', desc: '所有命令自动执行（不推荐）' },
]

// ---- 工作区卡片 ----

function WorkspaceCard({
  workspace,
  agentName,
  onSelect,
  onDelete,
}: {
  workspace: Workspace
  agentName?: string
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="group relative p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800/50 hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-md transition-all cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-teal-500/15 flex items-center justify-center shrink-0">
          <Briefcase size={18} className="text-teal-600 dark:text-teal-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 truncate">
            {workspace.name}
          </h3>
          {workspace.description && (
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5 line-clamp-2">
              {workspace.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-surface-400 dark:text-surface-500">
            {agentName && (
              <span className="flex items-center gap-1">
                <Bot size={10} /> {agentName}
              </span>
            )}
            {workspace.teamAgentIds.length > 0 && (
              <span className="flex items-center gap-1">
                <Users size={10} /> {workspace.teamAgentIds.length} 团队
              </span>
            )}
            <span className="flex items-center gap-1">
              <FolderOpen size={10} /> {workspace.folderPath.split(/[/\\]/).pop()}
            </span>
          </div>
        </div>
        <ChevronRight size={16} className="text-surface-300 dark:text-surface-600 shrink-0 group-hover:text-teal-500 transition-colors" />
      </div>

      {/* 删除按钮 */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-surface-400 hover:text-red-500 transition-all"
        title="删除工作区"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ---- 设置区块标题 ----

function SectionTitle({ icon: Icon, title, description }: { icon: typeof Briefcase; title: string; description?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={16} className="text-teal-500" />
      <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">{title}</h3>
      {description && <span className="text-xs text-surface-400 dark:text-surface-500">— {description}</span>}
    </div>
  )
}

// ---- 工作区编辑表单 ----

function WorkspaceEditForm({
  workspace,
  onBack,
}: {
  workspace: Workspace
  onBack: () => void
}) {
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace)
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace)
  const activateWorkspace = useWorkspaceStore((s) => s.activateWorkspace)
  const agents = useAgentStore((s) => s.agents)
  const updateAgent = useAgentStore((s) => s.updateAgent)

  const [form, setForm] = useState({ ...workspace })
  const [isSaving, setIsSaving] = useState(false)
  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [leaderPrompt, setLeaderPrompt] = useState('')

  const updateField = useCallback(<K extends keyof Workspace>(key: K, value: Workspace[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const input: WorkspaceUpdateInput = {
        id: workspace.id,
        name: form.name,
        description: form.description,
        folderPath: form.folderPath,
        leaderAgentId: form.leaderAgentId,
        allowDynamicAgents: form.allowDynamicAgents,
        teamAgentIds: form.teamAgentIds,
        checkpointPolicy: form.checkpointPolicy,
        timedIntervalMinutes: form.timedIntervalMinutes,
        maxCheckpoints: form.maxCheckpoints,
        commandPolicy: form.commandPolicy,
        commandExecutionEnabled: form.commandExecutionEnabled,
        safeCommandWhitelist: form.safeCommandWhitelist,
        commandBlacklist: form.commandBlacklist,
        contextConfig: form.contextConfig,
        knowledgeBaseIds: form.knowledgeBaseIds,
        mcpServerIds: form.mcpServerIds,
      }
      updateWorkspace(input)
    } finally {
      setIsSaving(false)
    }
  }, [workspace.id, form, updateWorkspace])

  const handleSelectFolder = useCallback(async () => {
    const result = await workspaceVCSService.selectFolder()
    if (result.success && result.folderPath) {
      updateField('folderPath', result.folderPath)
    }
  }, [updateField])

  const handleDelete = useCallback(() => {
    if (confirm(`确定删除工作区「${workspace.name}」？此操作不会删除文件系统中的文件。`)) {
      deleteWorkspace(workspace.id)
      onBack()
    }
  }, [workspace, deleteWorkspace, onBack])

  const handleActivate = useCallback(() => {
    activateWorkspace(workspace.id)
  }, [workspace.id, activateWorkspace])

  // 打开提示词编辑器
  const handleOpenPromptEditor = useCallback(() => {
    const leaderAgent = agents.find((a) => a.id === form.leaderAgentId)
    if (leaderAgent) {
      setLeaderPrompt(leaderAgent.systemPrompt)
      setShowPromptEditor(true)
    }
  }, [agents, form.leaderAgentId])

  // 保存提示词
  const handleSavePrompt = useCallback(() => {
    if (form.leaderAgentId) {
      updateAgent({
        id: form.leaderAgentId,
        systemPrompt: leaderPrompt,
      })
      setShowPromptEditor(false)
    }
  }, [form.leaderAgentId, leaderPrompt, updateAgent])

  return (
    <div className="space-y-6">
      {/* 返回 + 标题 */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-md hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">
            {workspace.name}
          </h2>
          <p className="text-xs text-surface-500 dark:text-surface-400">工作区设置</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={handleActivate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-500 text-white hover:bg-teal-600 transition-colors"
          >
            <Play size={12} /> 进入工作区
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <Trash2 size={12} /> 删除
          </button>
        </div>
      </div>

      {/* 基本信息 */}
      <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800/50 space-y-3">
        <SectionTitle icon={Briefcase} title="基本信息" />
        <div>
          <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">名称</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">描述</label>
          <textarea
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none"
          />
        </div>
      </div>

      {/* AI 领导 */}
      <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800/50 space-y-3">
        <SectionTitle icon={Bot} title="AI 领导配置" description="选择负责协调工作区任务的 Agent" />
        <select
          value={form.leaderAgentId ?? ''}
          onChange={(e) => updateField('leaderAgentId', e.target.value || undefined)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
        >
          <option value="">不指定</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.avatar} {a.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.allowDynamicAgents}
            onChange={(e) => updateField('allowDynamicAgents', e.target.checked)}
            className="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-teal-500 focus:ring-teal-500/50"
          />
          <span className="text-xs text-surface-600 dark:text-surface-400">允许 AI 领导动态创建临时 Agent</span>
        </label>
        {form.leaderAgentId && (
          <button
            onClick={handleOpenPromptEditor}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-teal-300 dark:border-teal-700 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            编辑 AI 领导提示词
          </button>
        )}
        {showPromptEditor && (
          <div className="space-y-2">
            <textarea
              value={leaderPrompt}
              onChange={(e) => setLeaderPrompt(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-y"
              placeholder="输入 AI 领导的系统提示词..."
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowPromptEditor(false)}
                className="px-3 py-1.5 text-xs rounded-lg border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSavePrompt}
                className="px-3 py-1.5 text-xs rounded-lg bg-teal-500 text-white hover:bg-teal-600 transition-colors"
              >
                保存提示词
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 工作文件夹 + 存档策略 */}
      <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800/50 space-y-3">
        <SectionTitle icon={FolderOpen} title="工作文件夹与存档策略" />
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/80 min-w-0">
            <FolderOpen size={14} className="text-surface-400 shrink-0" />
            <span className="text-xs text-surface-600 dark:text-surface-300 truncate">{form.folderPath}</span>
          </div>
          <button
            onClick={handleSelectFolder}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors shrink-0"
          >
            更改
          </button>
        </div>
        <div>
          <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5 block">存档策略</label>
          <div className="space-y-2">
            {CHECKPOINT_POLICY_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="checkpointPolicy"
                  value={opt.value}
                  checked={form.checkpointPolicy === opt.value}
                  onChange={() => updateField('checkpointPolicy', opt.value)}
                  className="mt-0.5 w-4 h-4 border-surface-300 dark:border-surface-600 text-teal-500 focus:ring-teal-500/50"
                />
                <div>
                  <span className="text-xs font-medium text-surface-700 dark:text-surface-300">{opt.label}</span>
                  <p className="text-[10px] text-surface-400 dark:text-surface-500">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
        {form.checkpointPolicy === 'timed' && (
          <div>
            <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">
              定时间隔（分钟）
            </label>
            <input
              type="number"
              min={1}
              max={1440}
              value={form.timedIntervalMinutes}
              onChange={(e) => updateField('timedIntervalMinutes', Number(e.target.value))}
              className="w-32 px-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            />
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">
            最多保留存档数
          </label>
          <input
            type="number"
            min={5}
            max={500}
            value={form.maxCheckpoints}
            onChange={(e) => updateField('maxCheckpoints', Number(e.target.value))}
            className="w-32 px-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
          />
        </div>
      </div>

      {/* 命令执行策略 */}
      <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800/50 space-y-3">
        <SectionTitle icon={Terminal} title="命令执行策略" description="控制 AI Agent 执行 shell 命令的权限" />
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.commandExecutionEnabled}
            onChange={(e) => updateField('commandExecutionEnabled', e.target.checked)}
            className="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-teal-500 focus:ring-teal-500/50"
          />
          <span className="text-xs font-medium text-surface-700 dark:text-surface-300">启用命令执行</span>
        </label>
        {form.commandExecutionEnabled && (
          <>
            <div>
              <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5 block">审批策略</label>
              <div className="space-y-2">
                {COMMAND_POLICY_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="commandPolicy"
                      value={opt.value}
                      checked={form.commandPolicy === opt.value}
                      onChange={() => updateField('commandPolicy', opt.value)}
                      className="mt-0.5 w-4 h-4 border-surface-300 dark:border-surface-600 text-teal-500 focus:ring-teal-500/50"
                    />
                    <div>
                      <span className="text-xs font-medium text-surface-700 dark:text-surface-300">{opt.label}</span>
                      <p className="text-[10px] text-surface-400 dark:text-surface-500">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">
                安全命令白名单（每行一个）
              </label>
              <textarea
                value={form.safeCommandWhitelist.join('\n')}
                onChange={(e) => updateField('safeCommandWhitelist', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
                rows={3}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">
                命令黑名单（每行一个，永远拒绝）
              </label>
              <textarea
                value={form.commandBlacklist.join('\n')}
                onChange={(e) => updateField('commandBlacklist', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
                rows={3}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none"
              />
            </div>
          </>
        )}
      </div>

      {/* 上下文管理 */}
      <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800/50 space-y-3">
        <SectionTitle icon={Database} title="上下文管理" description="控制对话上下文压缩行为" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">最大 Token 数</label>
            <input
              type="number"
              min={1000}
              max={200000}
              value={form.contextConfig.maxTokens}
              onChange={(e) => updateField('contextConfig', { ...form.contextConfig, maxTokens: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">压缩阈值 (%)</label>
            <input
              type="number"
              min={50}
              max={100}
              value={form.contextConfig.compressionThreshold}
              onChange={(e) => updateField('contextConfig', { ...form.contextConfig, compressionThreshold: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.contextConfig.compressionEnabled}
            onChange={(e) => updateField('contextConfig', { ...form.contextConfig, compressionEnabled: e.target.checked })}
            className="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-teal-500 focus:ring-teal-500/50"
          />
          <span className="text-xs text-surface-600 dark:text-surface-400">启用上下文压缩</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.contextConfig.keepCheckpointBeforeCompression}
            onChange={(e) => updateField('contextConfig', { ...form.contextConfig, keepCheckpointBeforeCompression: e.target.checked })}
            className="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-teal-500 focus:ring-teal-500/50"
          />
          <span className="text-xs text-surface-600 dark:text-surface-400">压缩前自动创建存档点</span>
        </label>
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-5 py-2 text-sm font-medium rounded-lg bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50 transition-colors"
        >
          {isSaving ? '保存中...' : '保存设置'}
        </button>
      </div>
    </div>
  )
}

// ---- 主组件 ----

export function WorkspaceSettings() {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const agents = useAgentStore((s) => s.agents)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectedWorkspace = selectedId ? workspaces.find((w) => w.id === selectedId) : null

  if (selectedWorkspace) {
    return (
      <WorkspaceEditForm
        workspace={selectedWorkspace}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
            <Briefcase size={18} className="text-teal-500" />
            工作区管理
          </h2>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
            管理 AI 工作区，配置文件监控、存档策略和命令执行权限
          </p>
        </div>
      </div>

      {/* 工作区列表 */}
      {workspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-surface-400 dark:text-surface-500">
          <Briefcase size={40} strokeWidth={1.5} />
          <p className="text-sm mt-3">暂无工作区</p>
          <p className="text-xs mt-1">通过侧边栏的工作区选择器创建工作区</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {workspaces.map((ws) => {
            const agentName = ws.leaderAgentId
              ? agents.find((a) => a.id === ws.leaderAgentId)?.name
              : undefined
            return (
              <WorkspaceCard
                key={ws.id}
                workspace={ws}
                agentName={agentName}
                onSelect={() => setSelectedId(ws.id)}
                onDelete={() => {
                  if (confirm(`确定删除工作区「${ws.name}」？`)) {
                    useWorkspaceStore.getState().deleteWorkspace(ws.id)
                  }
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
