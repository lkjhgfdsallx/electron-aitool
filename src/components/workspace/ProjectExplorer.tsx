/**
 * 项目浏览器组件 - 左栏
 * - 文件标签页：FileTree 组件，支持点击预览
 * - Git SCM 标签页
 * - 团队标签页：AgentTeamPanel，显示真实 Agent 信息
 * - Skills 标签页：工作区绑定技能
 * - 全局「存档」tab 已移除；AI 修改见对话内 AI Changes，版本历史见 Git
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  FileText, Users, Plus, X, Zap, ToggleLeft, ToggleRight, GitBranch,
} from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useAgentStore } from '../../stores/agent-store'
import { useWorkspaceAgentStore } from '../../stores/workspace-agent-store'
import { useSkillStore } from '../../stores/skill-store'
import { useWorkspaceGitStore, selectGitChangeCount } from '../../stores/workspace-git-store'
import { FileTree } from './FileTree'
import { GitPanel } from './git'
import { AgentManager } from '../settings/AgentManager'
import { WORKSPACE_LEADER_AGENT_ID } from '../../constants/default-agents'
import type { Workspace } from '../../types'
import { useAppTranslation } from '../../i18n/hooks'

interface ProjectExplorerProps {
  workspace: Workspace
  /** 文件被选中时回调（用于打开 FilePreview） */
  onFileSelect?: (filePath: string) => void
  /** 当前选中的文件路径 */
  selectedFile?: string
  /** 文件变化集合（B8 高亮） */
  changedFiles?: Set<string>
}

type ExplorerTab = 'files' | 'git' | 'agents' | 'skills'

export function ProjectExplorer({ workspace, onFileSelect, selectedFile, changedFiles }: ProjectExplorerProps) {
  const { t } = useAppTranslation()
  const [activeTab, setActiveTab] = useState<ExplorerTab>('files')

  const allSkills = useSkillStore((s) => s.skills)
  const ensureSkillsLoaded = useSkillStore((s) => s.ensureSkillsLoaded)
  const projectSkills = useMemo(
    () => allSkills.filter((s) => s.location === 'project' && s.projectWorkspaceId === workspace.id),
    [allSkills, workspace.id]
  )
  const gitChangeCount = useWorkspaceGitStore(selectGitChangeCount)

  useEffect(() => {
    void ensureSkillsLoaded()
  }, [ensureSkillsLoaded])

  const tabs: { key: ExplorerTab; label: string; icon: typeof FileText; count?: number }[] = [
    { key: 'files', label: t('workspace.files'), icon: FileText },
    { key: 'git', label: t('workspace.git', { defaultValue: 'Git' }), icon: GitBranch, count: gitChangeCount > 0 ? gitChangeCount : undefined },
    { key: 'agents', label: t('workspace.team'), icon: Users, count: workspace.teamAgentIds.length + (workspace.leaderAgentId ? 1 : 0) },
    { key: 'skills', label: t('workspace.skills'), icon: Zap, count: projectSkills.length },
  ]

  return (
    <div className="flex h-full">
      {/* VSCode 风格竖直侧边栏标签 */}
      <div className="flex flex-col items-center py-2 bg-surface-50 dark:bg-surface-900/50 border-r border-surface-200/80 dark:border-surface-700/60 flex-shrink-0 w-[48px]">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          const hasCount = tab.count !== undefined && tab.count > 0
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              title={hasCount ? `${tab.label} (${tab.count})` : tab.label}
              className={`relative flex items-center justify-center w-10 h-10 mb-1 rounded-lg transition-all duration-150 group ${
                isActive
                  ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400'
                  : 'text-gray-400 dark:text-gray-500 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {hasCount && tab.count !== undefined && (
                <span className={`absolute -top-0.5 -right-0.5 text-[9px] min-w-[14px] h-[14px] px-0.5 rounded-full flex items-center justify-center font-medium ${
                  isActive
                    ? 'bg-teal-500 text-white'
                    : 'bg-surface-300 dark:bg-surface-600 text-gray-600 dark:text-gray-300'
                }`}>
                  {tab.count > 99 ? '99+' : tab.count}
                </span>
              )}
              {/* 活跃指示条 - VSCode 风格左侧竖线 */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-teal-500 rounded-r-full" />
              )}
              {/* 悬浮提示 */}
              <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {hasCount ? `${tab.label} (${tab.count})` : tab.label}
              </span>
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

        {/* Git SCM */}
        {activeTab === 'git' && (
          <GitPanel
            workspace={workspace}
            onOpenFile={(relPath) => {
              // relPath 相对仓库根；拼成绝对路径供预览
              const sep = workspace.folderPath.includes('\\') ? '\\' : '/'
              const abs = `${workspace.folderPath.replace(/[\\/]+$/, '')}${sep}${relPath.replace(/\//g, sep)}`
              onFileSelect?.(abs)
            }}
          />
        )}

        {/* B6: Agent 团队 */}
        {activeTab === 'agents' && (
          <AgentTeamPanel workspace={workspace} />
        )}

        {/* B7: 工作区 Skills */}
        {activeTab === 'skills' && (
          <WorkspaceSkillsPanel workspace={workspace} skills={projectSkills} />
        )}
      </div>
    </div>
  )
}

// ---- B6: Agent 团队面板子组件 ----

interface AgentTeamPanelProps {
  workspace: Workspace
}

function AgentTeamPanel({ workspace }: AgentTeamPanelProps) {
  const { t } = useAppTranslation()
  const { getAgent, agents } = useAgentStore()
  const workspaceAgents = useWorkspaceAgentStore((s) => s.workspaceAgents)
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace)

  /** 合并查找：优先全局 Agent，再查工作区 Agent */
  const findAgent = useCallback((id: string) => {
    return getAgent(id) ?? workspaceAgents.find((a) => a.id === id)
  }, [getAgent, workspaceAgents])

  // 当 leaderAgentId 未设置时，回退到默认的 AI 领导 Agent
  const effectiveLeaderId = workspace.leaderAgentId ?? WORKSPACE_LEADER_AGENT_ID
  const leaderAgent = findAgent(effectiveLeaderId)
  const teamAgents = useMemo(
    () => workspace.teamAgentIds.map((id) => findAgent(id)).filter(Boolean),
    [workspace.teamAgentIds, findAgent]
  )

  // 自动修复：如果工作区缺少 leaderAgentId，自动补上
  useEffect(() => {
    if (!workspace.leaderAgentId && leaderAgent) {
      updateWorkspace({ id: workspace.id, leaderAgentId: WORKSPACE_LEADER_AGENT_ID })
    }
  }, [workspace.id, workspace.leaderAgentId, leaderAgent, updateWorkspace])

  const [showPicker, setShowPicker] = useState(false)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
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
  const availableAgents = useMemo(
    () => [...agents, ...workspaceAgents].filter(
      (a) => a.id !== workspace.leaderAgentId && !workspace.teamAgentIds.includes(a.id) && a.enabled
    ),
    [agents, workspaceAgents, workspace.leaderAgentId, workspace.teamAgentIds]
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
        <button
          type="button"
          onClick={() => setEditingAgentId(leaderAgent.id)}
          className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg bg-teal-50/50 dark:bg-teal-900/10 border border-teal-200/50 dark:border-teal-800/30 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors text-left"
          title={t('workspace.editAiLeaderAgent')}
        >
          <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-sm flex-shrink-0">
            {leaderAgent.avatar || '👑'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium text-teal-700 dark:text-teal-300 truncate">
                {leaderAgent.name}
              </p>
              <span className="text-[9px] px-1 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex-shrink-0">
                {t('workspace.leader')}
              </span>
            </div>
            <p className="text-[10px] text-teal-500/70 dark:text-teal-400/70 truncate mt-0.5">
              {leaderAgent.description || t('workspace.defaultLeaderDescription')}
            </p>
          </div>
        </button>
      )}

      {/* 分隔线 + 添加按钮 */}
      <div className="flex items-center gap-2 py-1">
        <div className="flex-1 h-px bg-surface-200 dark:bg-surface-700" />
        <span className="text-[9px] text-gray-400 dark:text-gray-500">{t('workspace.teamMembers')}</span>
        <div className="flex-1 h-px bg-surface-200 dark:bg-surface-700" />
      </div>

      {/* 团队成员列表 */}
      {teamAgents.length > 0 && (
        <div className="space-y-0.5">
          {teamAgents.map((agent) => (
            <div
              key={agent!.id}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800/50 transition-colors group cursor-pointer"
              onClick={() => setEditingAgentId(agent!.id)}
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
                onClick={(e) => { e.stopPropagation(); handleRemoveAgent(agent!.id) }}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-all flex-shrink-0"
                title={t('workspace.remove')}
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
          <p className="text-[11px] text-gray-400 dark:text-gray-500">{t('workspace.noTeamMembers')}</p>
        </div>
      )}

      {/* 添加 Agent 按钮 */}
      <button
        ref={buttonRef}
        onClick={togglePicker}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors border border-dashed border-teal-300/50 dark:border-teal-700/50"
      >
        <Plus size={12} />
        {t('workspace.addAgent')}
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
              <p className="text-[11px] text-gray-400 dark:text-gray-500">{t('workspace.noAvailableAgents')}</p>
              <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">{t('workspace.allAgentsInTeamOrDisabled')}</p>
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
            <span>{t('workspace.commandExecution')}</span>
            <span className={workspace.commandExecutionEnabled ? 'text-green-500' : 'text-gray-400'}>
              {workspace.commandExecutionEnabled ? t('workspace.enabled') : t('workspace.disabled')}
            </span>
          </div>
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
            <span>{t('workspace.approvalPolicy')}</span>
            <span>{workspace.commandPolicy === 'auto-approve-safe' ? t('workspace.safeAuto') : workspace.commandPolicy === 'auto-approve-all' ? t('workspace.allAuto') : t('workspace.allApproval')}</span>
          </div>
        </div>
      </div>

      {/* 复用设置页的完整 Agent 编辑器，避免工作区内只读且避免重复维护表单 */}
      {editingAgentId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingAgentId(null)} />
          <div className="relative w-full max-w-4xl max-h-[88vh] overflow-y-auto bg-white dark:bg-surface-900 rounded-xl border border-surface-200/80 dark:border-surface-700/60 shadow-2xl p-5 animate-scale-in">
            <AgentManager
              isWorkspaceMode
              folderPath={workspace.folderPath}
              initialEditingAgentId={editingAgentId}
              onClose={() => setEditingAgentId(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ---- B7: 工作区 Skills 子组件 ----

interface WorkspaceSkillsPanelProps {
  workspace: Workspace
  skills: Array<{
    dirPath: string; name: string; description: string; content: string
    location: string; resourceFiles: string[]
    enabled: boolean; updatedAt: number
  }>
}

function WorkspaceSkillsPanel({ workspace, skills }: WorkspaceSkillsPanelProps) {
  const { t } = useAppTranslation()
  const allSkills = useSkillStore((s) => s.skills)
  const toggleSkill = useSkillStore((s) => s.toggleSkill)
  const bindSkillToWorkspace = useSkillStore((s) => s.bindSkillToWorkspace)
  const unbindSkillFromWorkspace = useSkillStore((s) => s.unbindSkillFromWorkspace)

  const [expandedDir, setExpandedDir] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })
  const pickerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const headerAddButtonRef = useRef<HTMLButtonElement>(null)

  // 可添加：全局 skill，或未绑定工作区的 project skill；排除已绑定到任意工作区的
  const availableSkills = useMemo(
    () => allSkills.filter((s) => {
      if (s.location === 'global') return true
      if (s.location === 'project' && !s.projectWorkspaceId) return true
      return false
    }),
    [allSkills]
  )

  const openPickerAt = useCallback((el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    setPickerPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 200) })
    setShowPicker(true)
  }, [])

  const togglePicker = useCallback((el?: HTMLElement | null) => {
    if (showPicker) {
      setShowPicker(false)
      return
    }
    const target = el ?? buttonRef.current
    if (target) openPickerAt(target)
  }, [showPicker, openPickerAt])

  useEffect(() => {
    if (!showPicker) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      const inPicker = pickerRef.current?.contains(target)
      const inMainButton = buttonRef.current?.contains(target)
      const inHeaderButton = headerAddButtonRef.current?.contains(target)
      if (!inPicker && !inMainButton && !inHeaderButton) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPicker])

  const handleBindSkill = useCallback(async (dirPath: string) => {
    await bindSkillToWorkspace(dirPath, workspace.id)
    setShowPicker(false)
  }, [bindSkillToWorkspace, workspace.id])

  const handleUnbindSkill = useCallback(async (dirPath: string) => {
    await unbindSkillFromWorkspace(dirPath)
    if (expandedDir === dirPath) setExpandedDir(null)
  }, [unbindSkillFromWorkspace, expandedDir])

  return (
    <div className="p-2 space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {t('workspace.workspaceSkillsCount', { count: skills.length })}
        </span>
        <button
          ref={headerAddButtonRef}
          onClick={(e) => togglePicker(e.currentTarget)}
          className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-700 text-gray-400 hover:text-teal-500 transition-colors"
          title={t('workspace.addSkill')}
        >
          <Plus size={14} />
        </button>
      </div>

      {skills.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-400 dark:text-gray-500">
          <Zap size={20} className="mx-auto mb-1 opacity-50" />
          <p>{t('workspace.noWorkspaceSkills')}</p>
          <p className="mt-0.5">{t('workspace.createOrImportSkillHint')}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {skills.map((skill) => (
            <div
              key={skill.dirPath}
              className="rounded-lg border border-surface-200/80 dark:border-surface-700/60 overflow-hidden"
            >
              <div
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
                onClick={() => setExpandedDir(expandedDir === skill.dirPath ? null : skill.dirPath)}
              >
                <Zap size={12} className={skill.enabled ? 'text-amber-500' : 'text-gray-400'} />
                <span className="text-xs font-mono font-medium flex-1 truncate">{skill.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSkill(skill.dirPath) }}
                  className="p-0.5 rounded hover:bg-surface-200 dark:hover:bg-surface-600 transition-colors"
                  title={skill.enabled ? t('workspace.disable') : t('workspace.enable')}
                >
                  {skill.enabled
                    ? <ToggleRight size={16} className="text-teal-500" />
                    : <ToggleLeft size={16} className="text-gray-400" />}
                </button>
              </div>
              {expandedDir === skill.dirPath && (
                <div className="px-2 pb-2 border-t border-surface-100 dark:border-surface-700/40">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-3">
                    {skill.description || t('workspace.noDescription')}
                  </p>
                  <div className="flex items-center gap-1 mt-1.5">
                    <button
                      onClick={() => handleUnbindSkill(skill.dirPath)}
                      className="text-[10px] text-red-400 hover:text-red-500 transition-colors"
                    >
                      {t('workspace.removeSkillFromWorkspace')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 添加技能按钮（与团队 Agent 一致的虚线入口） */}
      <button
        ref={buttonRef}
        onClick={(e) => togglePicker(e.currentTarget)}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors border border-dashed border-teal-300/50 dark:border-teal-700/50"
      >
        <Plus size={12} />
        {t('workspace.addSkill')}
      </button>

      {/* Skill 选择下拉（fixed 定位，避免被 overflow 裁剪） */}
      {showPicker && (
        <div
          ref={pickerRef}
          className="fixed z-[9999] bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg max-h-[220px] overflow-y-auto"
          style={{ top: pickerPos.top, left: pickerPos.left, width: pickerPos.width }}
        >
          {availableSkills.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-[11px] text-gray-400 dark:text-gray-500">{t('workspace.noAvailableSkills')}</p>
              <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">{t('workspace.importSkillsInSettingsHint')}</p>
            </div>
          ) : (
            availableSkills.map((skill) => (
              <button
                key={skill.dirPath}
                onClick={() => handleBindSkill(skill.dirPath)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                <Zap size={12} className={skill.enabled ? 'text-amber-500 flex-shrink-0' : 'text-gray-400 flex-shrink-0'} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">{skill.name}</p>
                  {skill.description && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{skill.description}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
