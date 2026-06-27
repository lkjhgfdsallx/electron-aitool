/**
 * 项目浏览器组件 - 左栏
 *
 * Phase B：集成真实文件树、存档时间线、Agent 团队面板
 * - 文件标签页：FileTree 组件，支持点击预览
 * - 存档标签页：增强的 CheckpointTimeline，支持还原
 * - 团队标签页：AgentTeamPanel，显示真实 Agent 信息
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  FileText, Clock, Users, Plus, RotateCcw, ChevronRight, X,
  Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useAgentStore } from '../../stores/agent-store'
import { workspaceVCSService } from '../../services/workspace-vcs-service'
import { FileTree } from './FileTree'
import type { Workspace, CheckpointIndex } from '../../types'

interface ProjectExplorerProps {
  workspace: Workspace
  /** 文件被选中时回调（用于打开 FilePreview） */
  onFileSelect?: (filePath: string) => void
  /** 当前选中的文件路径 */
  selectedFile?: string
  /** 文件变化集合（B8 高亮） */
  changedFiles?: Set<string>
}

type ExplorerTab = 'files' | 'checkpoints' | 'agents'

export function ProjectExplorer({ workspace, onFileSelect, selectedFile, changedFiles }: ProjectExplorerProps) {
  const [activeTab, setActiveTab] = useState<ExplorerTab>('files')
  const checkpointIndex = useWorkspaceStore((s) => s.checkpointIndex)
  const addCheckpointIndex = useWorkspaceStore((s) => s.addCheckpointIndex)

  const workspaceCheckpoints = checkpointIndex.filter(
    (cp) => cp.workspaceId === workspace.id
  )

  const tabs: { key: ExplorerTab; label: string; icon: typeof FileText; count?: number }[] = [
    { key: 'files', label: '文件', icon: FileText },
    { key: 'checkpoints', label: '存档', icon: Clock, count: workspaceCheckpoints.length },
    { key: 'agents', label: '团队', icon: Users, count: workspace.teamAgentIds.length + (workspace.leaderAgentId ? 1 : 0) },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* 标签切换 */}
      <div className="flex items-center border-b border-surface-200/80 dark:border-surface-700/60 flex-shrink-0">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-all relative ${
                isActive
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`text-[10px] px-1 rounded-full ${
                  isActive
                    ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400'
                    : 'bg-surface-200 dark:bg-surface-700 text-gray-500 dark:text-gray-400'
                }`}>
                  {tab.count}
                </span>
              )}
              {isActive && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-teal-500 rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {/* B1: 文件树 */}
        {activeTab === 'files' && (
          <div className="py-1">
            <FileTree
              rootPath={workspace.folderPath}
              onFileSelect={(path) => onFileSelect?.(path)}
              selectedFile={selectedFile}
              changedFiles={changedFiles}
            />
          </div>
        )}

        {/* B3: 存档时间线 */}
        {activeTab === 'checkpoints' && (
          <CheckpointTimeline
            workspace={workspace}
            checkpoints={workspaceCheckpoints}
            onRefresh={async () => {
              try {
                const checkpoints = await workspaceVCSService.listCheckpoints(workspace.folderPath)
                // 刷新 store 中的索引
                const store = useWorkspaceStore.getState()
                for (const cp of checkpoints) {
                  const exists = store.checkpointIndex.find((e) => e.id === cp.id)
                  if (!exists) {
                    addCheckpointIndex(cp as CheckpointIndex)
                  }
                }
              } catch (err) {
                console.warn('[ProjectExplorer] 刷新存档索引失败:', err)
              }
            }}
          />
        )}

        {/* B6: Agent 团队 */}
        {activeTab === 'agents' && (
          <AgentTeamPanel workspace={workspace} />
        )}
      </div>
    </div>
  )
}

// ---- B3: 存档时间线子组件 ----

interface CheckpointTimelineProps {
  workspace: Workspace
  checkpoints: CheckpointIndex[]
  onRefresh: () => void
}

function CheckpointTimeline({ workspace, checkpoints, onRefresh }: CheckpointTimelineProps) {
  const [restoring, setRestoring] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const handleRestore = useCallback(async (checkpointId: string) => {
    setRestoring(checkpointId)
    setRestoreError(null)
    try {
      const result = await workspaceVCSService.restoreToCheckpoint(
        workspace.folderPath,
        checkpointId,
        `确认还原到存档点 ${checkpointId.slice(0, 8)}？\n此操作将覆盖当前工作区文件。`
      )
      if (!result.success) {
        setRestoreError(result.error || '还原失败')
      } else {
        onRefresh()
      }
    } catch (err) {
      setRestoreError(String(err))
    } finally {
      setRestoring(null)
    }
  }, [workspace.folderPath, onRefresh])

  const sorted = [...checkpoints].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="p-3">
      {/* 刷新按钮 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          存档时间线
        </span>
        <button
          onClick={onRefresh}
          className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title="刷新存档列表"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      {/* 错误提示 */}
      {restoreError && (
        <div className="mb-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1.5">
          <AlertCircle size={12} />
          <span className="flex-1">{restoreError}</span>
          <button onClick={() => setRestoreError(null)} className="text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Clock size={24} className="text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-xs text-gray-400 dark:text-gray-500">暂无存档点</p>
          <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">
            文件修改时会自动创建存档
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* 时间线竖线 */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-surface-200 dark:bg-surface-700" />

          <div className="space-y-0.5">
            {sorted.slice(0, 30).map((cp) => {
              const typeColors: Record<string, string> = {
                auto: 'bg-blue-400',
                manual: 'bg-amber-400',
                'pre-command': 'bg-purple-400',
                'pre-restore': 'bg-green-400',
              }
              const typeLabels: Record<string, string> = {
                auto: '自动',
                manual: '手动',
                'pre-command': '命令前',
                'pre-restore': '还原前',
              }

              return (
                <div
                  key={cp.id}
                  className="relative flex items-start gap-2.5 pl-5 py-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800/50 cursor-pointer transition-colors group"
                  onClick={() => handleRestore(cp.id)}
                >
                  {/* 时间线节点 */}
                  <div className={`absolute left-[4px] top-[10px] w-[7px] h-[7px] rounded-full border-2 border-white dark:border-surface-900 ${typeColors[cp.type] || 'bg-gray-400'} z-10`} />

                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 dark:text-gray-300 truncate leading-tight">
                      {cp.description}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={`text-[9px] px-1 rounded ${
                        cp.type === 'auto' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-500' :
                        cp.type === 'manual' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-500' :
                        cp.type === 'pre-command' ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-500' :
                        'bg-gray-100 dark:bg-gray-800 text-gray-500'
                      }`}>
                        {typeLabels[cp.type] || cp.type}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {cp.filesChanged} 文件
                      </span>
                      <span className="text-[10px] text-green-500">+{cp.linesAdded}</span>
                      {cp.linesRemoved > 0 && (
                        <span className="text-[10px] text-red-400">-{cp.linesRemoved}</span>
                      )}
                      <span className="text-[10px] text-gray-300 dark:text-gray-600">
                        {new Date(cp.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  {/* 还原按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRestore(cp.id)
                    }}
                    disabled={restoring !== null}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-400 hover:text-teal-500 transition-all flex-shrink-0"
                    title="还原到此存档点"
                  >
                    {restoring === cp.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RotateCcw size={12} />
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ---- B6: Agent 团队面板子组件 ----

interface AgentTeamPanelProps {
  workspace: Workspace
}

function AgentTeamPanel({ workspace }: AgentTeamPanelProps) {
  const { getAgent, agents } = useAgentStore()
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace)
  const leaderAgent = workspace.leaderAgentId ? getAgent(workspace.leaderAgentId) : undefined
  const teamAgents = workspace.teamAgentIds.map((id) => getAgent(id)).filter(Boolean)

  const [showPicker, setShowPicker] = useState(false)
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })
  const pickerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // 打开下拉时计算按钮位置（fixed 定位，避免被 overflow 裁剪）
  const togglePicker = useCallback(() => {
    if (showPicker) {
      setShowPicker(false)
    } else if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPickerPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
      setShowPicker(true)
    }
  }, [showPicker])

  // 点击外部关闭选择器
  useEffect(() => {
    if (!showPicker) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPicker])

  // 可添加的 Agent（排除领导和已在团队中的）
  const availableAgents = agents.filter(
    (a) => a.id !== workspace.leaderAgentId && !workspace.teamAgentIds.includes(a.id) && a.enabled
  )

  const handleAddAgent = useCallback((agentId: string) => {
    updateWorkspace({
      id: workspace.id,
      teamAgentIds: [...workspace.teamAgentIds, agentId],
    })
    setShowPicker(false)
  }, [workspace.id, workspace.teamAgentIds, updateWorkspace])

  const handleRemoveAgent = useCallback((agentId: string) => {
    updateWorkspace({
      id: workspace.id,
      teamAgentIds: workspace.teamAgentIds.filter((id) => id !== agentId),
    })
  }, [workspace.id, workspace.teamAgentIds, updateWorkspace])

  return (
    <div className="p-3 space-y-2">
      {/* AI 领导 */}
      {leaderAgent && (
        <div className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg bg-teal-50/50 dark:bg-teal-900/10 border border-teal-200/50 dark:border-teal-800/30">
          <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-sm flex-shrink-0">
            {leaderAgent.avatar || '👑'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium text-teal-700 dark:text-teal-300 truncate">
                {leaderAgent.name}
              </p>
              <span className="text-[9px] px-1 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex-shrink-0">
                领导
              </span>
            </div>
            <p className="text-[10px] text-teal-500/70 dark:text-teal-400/70 truncate mt-0.5">
              {leaderAgent.description || '项目主管，负责任务拆解与协调'}
            </p>
          </div>
        </div>
      )}

      {/* 分隔线 + 添加按钮 */}
      <div className="flex items-center gap-2 py-1">
        <div className="flex-1 h-px bg-surface-200 dark:bg-surface-700" />
        <span className="text-[9px] text-gray-400 dark:text-gray-500">团队成员</span>
        <div className="flex-1 h-px bg-surface-200 dark:bg-surface-700" />
      </div>

      {/* 团队成员列表 */}
      {teamAgents.length > 0 && (
        <div className="space-y-0.5">
          {teamAgents.map((agent) => (
            <div
              key={agent!.id}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800/50 transition-colors group"
            >
              <div className="w-7 h-7 rounded-full bg-surface-200 dark:bg-surface-700 flex items-center justify-center text-xs flex-shrink-0">
                {agent!.avatar || '🤖'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-700 dark:text-gray-300 truncate">
                  {agent!.name}
                </p>
                {agent!.description && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                    {agent!.description}
                  </p>
                )}
              </div>
              {/* 移除按钮 */}
              <button
                onClick={() => handleRemoveAgent(agent!.id)}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-all flex-shrink-0"
                title="移除"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {teamAgents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <Users size={20} className="text-gray-300 dark:text-gray-600 mb-1.5" />
          <p className="text-[11px] text-gray-400 dark:text-gray-500">暂无团队成员</p>
        </div>
      )}

      {/* 添加 Agent 按钮 */}
      <button
        ref={buttonRef}
        onClick={togglePicker}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors border border-dashed border-teal-300/50 dark:border-teal-700/50"
      >
        <Plus size={12} />
        添加 Agent
      </button>

      {/* Agent 选择下拉（fixed 定位，避免被 overflow 裁剪） */}
      {showPicker && (
        <div
          ref={pickerRef}
          className="fixed z-[9999] bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg max-h-[200px] overflow-y-auto"
          style={{ top: pickerPos.top, left: pickerPos.left, width: pickerPos.width }}
        >
          {availableAgents.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-[11px] text-gray-400 dark:text-gray-500">没有可用的 Agent</p>
              <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">所有 Agent 已在团队中或已禁用</p>
            </div>
          ) : (
            availableAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => handleAddAgent(agent.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                <div className="w-6 h-6 rounded-full bg-surface-200 dark:bg-surface-700 flex items-center justify-center text-xs flex-shrink-0">
                  {agent.avatar || '🤖'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{agent.name}</p>
                  {agent.description && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{agent.description}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* 工作区配置摘要 */}
      <div className="mt-3 pt-3 border-t border-surface-200 dark:border-surface-700">
        <div className="space-y-1.5 text-[10px]">
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
            <span>命令执行</span>
            <span className={workspace.commandExecutionEnabled ? 'text-green-500' : 'text-gray-400'}>
              {workspace.commandExecutionEnabled ? '已启用' : '已禁用'}
            </span>
          </div>
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
            <span>审批策略</span>
            <span>{workspace.commandPolicy === 'auto-approve-safe' ? '安全自动' : workspace.commandPolicy === 'auto-approve-all' ? '全部自动' : '全部审批'}</span>
          </div>
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
            <span>存档策略</span>
            <span>{workspace.checkpointPolicy === 'auto-before-modify' ? '自动' : workspace.checkpointPolicy === 'timed' ? '定时' : '手动'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
