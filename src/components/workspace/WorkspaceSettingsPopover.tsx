/**
 * 工作区快捷设置浮层 - B7 + C3 + C4
 *
 * 从顶部栏的齿轮图标弹出，提供常用工作区设置的快速访问：
 * - 命令执行开关
 * - 审批策略切换
 * - 存档策略切换
 * - C3: 知识库关联选择器
 * - C4: MCP 服务器选择器
 * - 跳转完整设置页面
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Settings, Shield, Terminal, Clock, ExternalLink, ToggleLeft, ToggleRight,
  Database, Plug, ChevronDown, ChevronRight, Check, X, Crown, FileEdit,
  Users, ArrowUpToLine, Trash2,
} from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useKnowledgeCollectionStore } from '../../stores/knowledge-collection-store'
import { useGlobalConfigStore } from '../../stores/global-config-store'
import { useAgentStore } from '../../stores/agent-store'
import { useWorkspaceAgentStore } from '../../stores/workspace-agent-store'
import { WORKSPACE_LEADER_AGENT_ID, WORKSPACE_LEADER_PROMPT } from '../../constants/default-agents'
import { LeaderPromptEditorModal } from './LeaderPromptEditorModal'
import type { Workspace, CommandPolicy, CheckpointPolicy, AutoApprovalConfig } from '../../types'
import type { AgentProfile } from '../../types/agent'

// ---- Props ----

interface WorkspaceSettingsPopoverProps {
  workspace: Workspace
  onClose: () => void
  onOpenFullSettings: () => void
  /** 触发按钮的 ref，用于 fixed 定位计算 */
  anchorRef?: React.RefObject<HTMLButtonElement | null>
}

// ---- 组件 ----

export function WorkspaceSettingsPopover({ workspace, onClose, onOpenFullSettings, anchorRef }: WorkspaceSettingsPopoverProps) {
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace)
  const updateAutoApproval = useWorkspaceStore((s) => s.updateAutoApproval)
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null)

  // 根据 anchor 按钮计算 fixed 定位
  useEffect(() => {
    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
  }, [anchorRef])

  // C3: 知识库数据
  const collections = useKnowledgeCollectionStore((s) => s.collections)
  const [showKBSection, setShowKBSection] = useState(false)

  // C4: MCP 数据
  const mcpServers = useGlobalConfigStore((s) => s.mcpServers)
  const [showMCPSection, setShowMCPSection] = useState(false)

  // 工作区 Agent
  const workspaceAgents = useWorkspaceAgentStore((s) => s.workspaceAgents)
  const promoteToGlobal = useWorkspaceAgentStore((s) => s.promoteToGlobal)
  const deleteWorkspaceAgent = useWorkspaceAgentStore((s) => s.deleteWorkspaceAgent)
  const [showAgentSection, setShowAgentSection] = useState(false)

  // Leader 提示词编辑
  const getAgent = useAgentStore((s) => s.getAgent)
  const getLeaderAgent = useWorkspaceAgentStore((s) => s.getLeaderAgent)
  const leaderAgent = getLeaderAgent() ?? (workspace.leaderAgentId ? getAgent(workspace.leaderAgentId) : getAgent(WORKSPACE_LEADER_AGENT_ID))
  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const currentPrompt = leaderAgent?.systemPrompt ?? ''
  const isCustomPrompt = currentPrompt !== WORKSPACE_LEADER_PROMPT

  // 点击外部关闭（排除 anchor 按钮本身，让按钮的 toggle 正常工作）
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current && !ref.current.contains(target)) {
        // 如果点击的是 anchor 按钮，不在此处关闭（由按钮自身的 toggle 处理）
        if (anchorRef?.current && anchorRef.current.contains(target)) {
          return
        }
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose, anchorRef])

  // 切换命令执行
  const toggleCommandExecution = useCallback(() => {
    updateWorkspace({
      id: workspace.id,
      commandExecutionEnabled: !workspace.commandExecutionEnabled,
    })
  }, [workspace, updateWorkspace])

  // 切换审批策略
  const setCommandPolicy = useCallback((policy: CommandPolicy) => {
    updateWorkspace({
      id: workspace.id,
      commandPolicy: policy,
    })
  }, [workspace, updateWorkspace])

  // 切换存档策略
  const setCheckpointPolicy = useCallback((policy: CheckpointPolicy) => {
    updateWorkspace({
      id: workspace.id,
      checkpointPolicy: policy,
    })
  }, [workspace, updateWorkspace])

  // 自动审批矩阵：切换单个权限字段
  const toggleAutoApprovalField = useCallback(
    <K extends keyof AutoApprovalConfig>(field: K, value: AutoApprovalConfig[K]) => {
      updateAutoApproval(workspace.id, { [field]: value } as Partial<AutoApprovalConfig>)
    },
    [workspace.id, updateAutoApproval],
  )

  // 自动审批权限项配置（排除 enabled 主开关）
  const autoApprovalItems: Array<{
    field: 'readFiles' | 'listFiles' | 'writeFiles' | 'executeSafeCommands' | 'browser' | 'mcpTools'
    label: string
    desc: string
  }> = [
    { field: 'readFiles', label: '读取文件', desc: 'read_file' },
    { field: 'listFiles', label: '列举目录', desc: 'list_files' },
    { field: 'writeFiles', label: '写入文件', desc: 'write_file' },
    { field: 'executeSafeCommands', label: '安全命令', desc: '只读 shell' },
    { field: 'browser', label: '浏览器操作', desc: 'site_analyzer' },
    { field: 'mcpTools', label: 'MCP 工具', desc: '已关联服务器' },
  ]

  // C3: 切换知识库关联
  const toggleKnowledgeBase = useCallback((collectionId: string) => {
    const current = workspace.knowledgeBaseIds ?? []
    const next = current.includes(collectionId)
      ? current.filter((id) => id !== collectionId)
      : [...current, collectionId]
    updateWorkspace({ id: workspace.id, knowledgeBaseIds: next })
  }, [workspace, updateWorkspace])

  // C4: 切换 MCP 服务器
  const toggleMCPServer = useCallback((serverId: string) => {
    const current = workspace.mcpServerIds ?? []
    const next = current.includes(serverId)
      ? current.filter((id) => id !== serverId)
      : [...current, serverId]
    updateWorkspace({ id: workspace.id, mcpServerIds: next })
  }, [workspace, updateWorkspace])

  const commandPolicyLabels: Record<CommandPolicy, string> = {
    'auto-approve-safe': '安全命令自动批准',
    'auto-approve-all': '全部自动批准',
    'all-need-approval': '全部需要审批',
  }

  const checkpointPolicyLabels: Record<CheckpointPolicy, string> = {
    'auto-before-modify': '修改前自动存档',
    timed: '定时存档',
    manual: '手动存档',
  }

  const enabledKBCount = (workspace.knowledgeBaseIds ?? []).length
  const enabledMCPCount = (workspace.mcpServerIds ?? []).length

  // 工作区 Agent 快捷操作
  const handlePromoteAgent = useCallback((agent: AgentProfile) => {
    promoteToGlobal(agent.id)
  }, [promoteToGlobal])

  const handleDeleteAgent = useCallback((agentId: string) => {
    deleteWorkspaceAgent(agentId, workspace.folderPath)
  }, [deleteWorkspaceAgent, workspace.folderPath])

  return createPortal(
    <div
      ref={ref}
      className="fixed w-80 rounded-xl bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 shadow-lg shadow-black/10 dark:shadow-black/30 z-[9999] overflow-hidden max-h-[80vh] flex flex-col pointer-events-auto"
      style={position ? { top: position.top, right: position.right } : undefined}
    >
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-surface-100 dark:border-surface-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Settings size={14} className="text-teal-500" />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">工作区设置</span>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">
          {workspace.name}
        </p>
      </div>

      {/* 设置项（可滚动） */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {/* 命令执行开关 */}
        <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors">
          <div className="flex items-center gap-2.5">
            <Terminal size={14} className="text-gray-400" />
            <div>
              <p className="text-xs text-gray-700 dark:text-gray-300">命令执行</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                {workspace.commandExecutionEnabled ? 'AI 可执行 shell 命令' : '命令执行已禁用'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleCommandExecution}
            className={`transition-colors ${
              workspace.commandExecutionEnabled ? 'text-teal-500' : 'text-gray-300 dark:text-gray-600'
            }`}
          >
            {workspace.commandExecutionEnabled ? (
              <ToggleRight size={22} />
            ) : (
              <ToggleLeft size={22} />
            )}
          </button>
        </div>

        {/* 审批策略 */}
        {workspace.commandExecutionEnabled && (
          <div className="px-3 py-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors">
            <div className="flex items-center gap-2.5 mb-2">
              <Shield size={14} className="text-gray-400" />
              <p className="text-xs text-gray-700 dark:text-gray-300">审批策略</p>
            </div>
            <div className="ml-6 space-y-1">
              {(Object.keys(commandPolicyLabels) as CommandPolicy[]).map((policy) => (
                <button
                  key={policy}
                  onClick={() => setCommandPolicy(policy)}
                  className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors ${
                    workspace.commandPolicy === policy
                      ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-surface-100 dark:hover:bg-surface-600/50'
                  }`}
                >
                  {commandPolicyLabels[policy]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 自动审批矩阵 */}
        <div className="rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2.5">
              <FileEdit size={14} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-700 dark:text-gray-300">自动审批矩阵</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  {workspace.autoApproval?.enabled ? '已启用精细控制' : '未启用，全部弹窗确认'}
                </p>
              </div>
            </div>
            <button
              onClick={() => toggleAutoApprovalField('enabled', !workspace.autoApproval?.enabled)}
              className={`transition-colors ${
                workspace.autoApproval?.enabled ? 'text-teal-500' : 'text-gray-300 dark:text-gray-600'
              }`}
            >
              {workspace.autoApproval?.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
            </button>
          </div>
          {workspace.autoApproval?.enabled && (
            <div className="ml-6 mb-2 mr-3 space-y-1 border-t border-surface-100 dark:border-surface-700 pt-2">
              {autoApprovalItems.map((item) => (
                <div key={item.field} className="flex items-center justify-between py-0.5">
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-600 dark:text-gray-400 truncate">{item.label}</p>
                    <p className="text-[9px] text-gray-400 dark:text-gray-500 truncate">{item.desc}</p>
                  </div>
                  <button
                    onClick={() =>
                      toggleAutoApprovalField(
                        item.field,
                        !workspace.autoApproval?.[item.field],
                      )
                    }
                    className={`flex-shrink-0 ml-2 transition-colors ${
                      workspace.autoApproval?.[item.field]
                        ? 'text-teal-500'
                        : 'text-gray-300 dark:text-gray-600'
                    }`}
                  >
                    {workspace.autoApproval?.[item.field] ? (
                      <ToggleRight size={18} />
                    ) : (
                      <ToggleLeft size={18} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 存档策略 */}
        <div className="px-3 py-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors">
          <div className="flex items-center gap-2.5 mb-2">
            <Clock size={14} className="text-gray-400" />
            <p className="text-xs text-gray-700 dark:text-gray-300">存档策略</p>
          </div>
          <div className="ml-6 space-y-1">
            {(Object.keys(checkpointPolicyLabels) as CheckpointPolicy[]).map((policy) => (
              <button
                key={policy}
                onClick={() => setCheckpointPolicy(policy)}
                className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors ${
                  workspace.checkpointPolicy === policy
                    ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-surface-100 dark:hover:bg-surface-600/50'
                }`}
              >
                {checkpointPolicyLabels[policy]}
              </button>
            ))}
          </div>
        </div>

        {/* C3: 知识库关联 */}
        <div className="rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors">
          <button
            onClick={() => setShowKBSection(!showKBSection)}
            className="w-full flex items-center gap-2.5 px-3 py-2"
          >
            <Database size={14} className="text-gray-400" />
            <div className="flex-1 text-left">
              <p className="text-xs text-gray-700 dark:text-gray-300">知识库关联</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                {enabledKBCount > 0 ? `已关联 ${enabledKBCount} 个集合` : '未关联知识库'}
              </p>
            </div>
            {showKBSection ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
          </button>
          {showKBSection && (
            <div className="px-3 pb-2 ml-6 space-y-1">
              {collections.length === 0 ? (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 py-1">暂无知识库集合</p>
              ) : (
                collections.map((col) => {
                  const isSelected = (workspace.knowledgeBaseIds ?? []).includes(col.id)
                  return (
                    <button
                      key={col.id}
                      onClick={() => toggleKnowledgeBase(col.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-surface-100 dark:hover:bg-surface-600/50'
                      }`}
                    >
                      <span className="flex-shrink-0">{col.icon || '📚'}</span>
                      <span className="flex-1 truncate text-left">{col.name}</span>
                      {isSelected && <Check size={12} className="text-blue-500 flex-shrink-0" />}
                    </button>
                  )
                })
              )}
              <p className="text-[9px] text-gray-400 dark:text-gray-500 pt-1">
                关联后 AI 领导自动获得 RAG 检索能力
              </p>
            </div>
          )}
        </div>

        {/* C4: MCP 服务器选择 */}
        <div className="rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors">
          <button
            onClick={() => setShowMCPSection(!showMCPSection)}
            className="w-full flex items-center gap-2.5 px-3 py-2"
          >
            <Plug size={14} className="text-gray-400" />
            <div className="flex-1 text-left">
              <p className="text-xs text-gray-700 dark:text-gray-300">MCP 服务器</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                {enabledMCPCount > 0 ? `已启用 ${enabledMCPCount} 个服务器` : '未启用 MCP 服务器'}
              </p>
            </div>
            {showMCPSection ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
          </button>
          {showMCPSection && (
            <div className="px-3 pb-2 ml-6 space-y-1">
              {mcpServers.length === 0 ? (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 py-1">暂无 MCP 服务器配置</p>
              ) : (
                mcpServers.map((server) => {
                  const isSelected = (workspace.mcpServerIds ?? []).includes(server.id)
                  return (
                    <button
                      key={server.id}
                      onClick={() => toggleMCPServer(server.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] transition-colors ${
                        isSelected
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-surface-100 dark:hover:bg-surface-600/50'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        server.enabled ? (isSelected ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600') : 'bg-red-300 dark:bg-red-600'
                      }`} />
                      <span className="flex-1 truncate text-left">{server.name}</span>
                      {isSelected && <Check size={12} className="text-green-500 flex-shrink-0" />}
                    </button>
                  )
                })
              )}
              <p className="text-[9px] text-gray-400 dark:text-gray-500 pt-1">
                工作区启用的 MCP 工具直接对 AI 领导可见
              </p>
            </div>
          )}
        </div>

        {/* 工作区 Agent 管理 */}
        <div className="rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors">
          <button
            onClick={() => setShowAgentSection(!showAgentSection)}
            className="w-full flex items-center gap-2.5 px-3 py-2"
          >
            <Users size={14} className="text-gray-400" />
            <div className="flex-1 text-left">
              <p className="text-xs text-gray-700 dark:text-gray-300">工作区 Agent</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                {workspaceAgents.length > 0 ? `已创建 ${workspaceAgents.length} 个 Agent` : '暂无工作区 Agent'}
              </p>
            </div>
            {workspaceAgents.length > 0 && (
              <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                {workspaceAgents.length}
              </span>
            )}
            {showAgentSection ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
          </button>
          {showAgentSection && (
            <div className="px-3 pb-2 ml-6 space-y-1">
              {workspaceAgents.length === 0 ? (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 py-1">
                  AI 领导创建的 Agent 将显示在此处
                </p>
              ) : (
                workspaceAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px] group hover:bg-surface-100 dark:hover:bg-surface-600/50 transition-colors"
                  >
                    <span className="text-sm flex-shrink-0">{agent.avatar || '🤖'}</span>
                    <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{agent.name}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handlePromoteAgent(agent)}
                        title="提升为全局 Agent"
                        className="p-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 text-gray-400 hover:text-amber-500 transition-colors"
                      >
                        <ArrowUpToLine size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteAgent(agent.id)}
                        title="删除"
                        className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
              <p className="text-[9px] text-gray-400 dark:text-gray-500 pt-1">
                工作区 Agent 仅在此工作区可用，可提升为全局 Agent
              </p>
            </div>
          )}
        </div>

        {/* Leader 提示词 */}
        <div className="rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors">
          <div className="px-3 py-2">
            <div className="flex items-center gap-2.5 mb-2">
              <Crown size={14} className="text-amber-500" />
              <div className="flex-1">
                <p className="text-xs text-gray-700 dark:text-gray-300">AI 领导提示词</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  {isCustomPrompt ? '已自定义' : '使用默认提示词'}
                </p>
              </div>
            </div>
            <div className="ml-6 space-y-1.5">
              <p className="text-[10px] text-gray-400 dark:text-gray-500 line-clamp-2 leading-relaxed">
                {currentPrompt.slice(0, 120)}...
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowPromptEditor(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                >
                  <FileEdit size={11} />
                  <span>编辑提示词</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Leader 提示词编辑模态框 */}
      <LeaderPromptEditorModal
        open={showPromptEditor}
        onClose={() => setShowPromptEditor(false)}
        folderPath={workspace.folderPath}
      />

      {/* 底部：跳转完整设置 */}
      <div className="px-2 py-2 border-t border-surface-100 dark:border-surface-700 flex-shrink-0">
        <button
          onClick={onOpenFullSettings}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors"
        >
          <ExternalLink size={13} />
          <span>打开完整工作区设置</span>
        </button>
      </div>
    </div>,
    document.body
  )
}
