import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Zap, Settings2, Search, Check, FolderOpen, Sparkles, User, Pencil } from 'lucide-react'
import { useAgentStore } from '../../stores/agent-store'
import { useWorkspaceAgentStore } from '../../stores/workspace-agent-store'
import { SYSTEM_AGENT_TAGS } from '../../types'
import type { AgentProfile } from '../../types'
import { AgentCategoryBadge } from '../shared/AgentCategoryBadge'
import {
  getAgentCategory,
  getAgentCategoryMeta,
  type AgentCategory,
} from '../../utils/agent-utils'
import { useAppTranslation } from '@/i18n/hooks'

interface AgentSelectorProps {
  selectedAgentId?: string
  onSelect: (agentId: string | undefined) => void
  /** 打开 Agent 管理列表；可选 agentId 直接进入对应编辑页 */
  onOpenAgentManager?: (agentId?: string) => void
  /** 直接编辑指定 Agent（与 onOpenAgentManager(agentId) 等价，语义更清晰） */
  onEditAgent?: (agentId: string) => void
}

export function AgentSelector({ selectedAgentId, onSelect, onOpenAgentManager, onEditAgent }: AgentSelectorProps) {
  const { t } = useAppTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { agents: globalAgents } = useAgentStore()
  const { workspaceAgents } = useWorkspaceAgentStore()

  // 区分工作区 Agent 和全局 Agent
  // 工作区 Agent 中过滤掉 AI 领导（leader 标签），领导只能在活跃的工作区上下文中选择
  const enabledWorkspaceAgents = useMemo(
    () => workspaceAgents.filter(
      (a) => a.enabled && !a.tags?.includes(SYSTEM_AGENT_TAGS.LEADER)
    ),
    [workspaceAgents]
  )
  // 全局 Agent 中过滤掉工作区专属和领导标签的 agent（它们不应该出现在非工作区对话中）
  const enabledGlobalAgents = useMemo(
    () => globalAgents.filter(
      (a) => a.enabled
        && a.scope !== 'workspace'
        && !a.tags?.includes(SYSTEM_AGENT_TAGS.WORKSPACE)
        && !a.tags?.includes(SYSTEM_AGENT_TAGS.LEADER)
    ),
    [globalAgents]
  )

  // 查找当前选中的 Agent（从两个 store 中）
  const selectedAgent = useMemo(
    () => [...workspaceAgents, ...globalAgents].find((a) => a.id === selectedAgentId),
    [workspaceAgents, globalAgents, selectedAgentId]
  )

  // 搜索过滤
  const filterAgents = (agents: AgentProfile[]) => {
    if (!searchTerm.trim()) return agents
    const term = searchTerm.toLowerCase()
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(term) ||
        (a.description && a.description.toLowerCase().includes(term))
    )
  }

  const filteredWorkspaceAgents = useMemo(
    () => filterAgents(enabledWorkspaceAgents),
    [enabledWorkspaceAgents, searchTerm]
  )
  const filteredGlobalAgents = useMemo(
    () => filterAgents(enabledGlobalAgents),
    [enabledGlobalAgents, searchTerm]
  )

  // 合并所有可用 Agent 后按分类分组（预设 / 工作区专属 / 自定义），
  // 用于下拉面板分区展示。预设的工作区 Leader 归入 preset 组。
  const groupedFilteredAgents = useMemo(() => {
    const all = [...filteredWorkspaceAgents, ...filteredGlobalAgents]
    const buckets: Record<AgentCategory, AgentProfile[]> = { preset: [], workspace: [], custom: [] }
    for (const a of all) {
      buckets[getAgentCategory(a)].push(a)
    }
    return (['preset', 'workspace', 'custom'] as AgentCategory[])
      .map((category) => ({ category, agents: buckets[category] }))
      .filter((g) => g.agents.length > 0)
  }, [filteredWorkspaceAgents, filteredGlobalAgents])

  const hasResults = filteredWorkspaceAgents.length > 0 || filteredGlobalAgents.length > 0

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 打开时聚焦搜索框
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isOpen])

  const handleEditAgent = (e: React.MouseEvent, agentId: string) => {
    e.stopPropagation()
    setIsOpen(false)
    setSearchTerm('')
    if (onEditAgent) {
      onEditAgent(agentId)
    } else {
      onOpenAgentManager?.(agentId)
    }
  }

  /** 渲染单个 Agent 选项 */
  const renderAgentItem = (agent: AgentProfile) => (
    <div
      key={agent.id}
      onClick={() => {
        onSelect(agent.id)
        setIsOpen(false)
        setSearchTerm('')
      }}
      className={`flex items-center gap-3 px-3 py-2.5 transition-all cursor-pointer group ${
        selectedAgentId === agent.id
          ? 'bg-accent-50 dark:bg-accent-950/30 border-l-2 border-accent-500'
          : 'hover:bg-accent-50/50 dark:hover:bg-accent-950/20 border-l-2 border-transparent'
      }`}
    >
      <div className="w-8 h-8 rounded-full bg-surface-100 dark:bg-surface-700 flex items-center justify-center text-base flex-shrink-0">
        {agent.avatar || agent.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-medium truncate ${selectedAgentId === agent.id ? 'text-accent-700 dark:text-accent-300' : 'text-gray-700 dark:text-gray-300'}`}>
            {agent.name}
          </span>
          <AgentCategoryBadge agent={agent} short className="flex-shrink-0" />
        </div>
        {agent.description && (
          <div className="text-xs text-muted truncate">{agent.description}</div>
        )}
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {(onEditAgent || onOpenAgentManager) && (
          <button
            type="button"
            onClick={(e) => handleEditAgent(e, agent.id)}
            aria-label={t('chat.editAgent')}
            title={t('chat.editAgent')}
            className="p-1 rounded text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-accent-500 hover:bg-accent-100/60 dark:hover:bg-accent-900/30 transition-all"
          >
            <Pencil size={12} />
          </button>
        )}
        {selectedAgentId === agent.id && (
          <Check size={14} className="text-accent-500 flex-shrink-0" />
        )}
      </div>
    </div>
  )

  /** 渲染分组标题（按分类） */
  const renderGroupHeader = (category: AgentCategory) => {
    const meta = getAgentCategoryMeta(category)
    const Icon = meta.icon === 'Sparkles' ? Sparkles : meta.icon === 'FolderOpen' ? FolderOpen : User
    return (
      <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1">
        <Icon size={11} className="text-gray-400 dark:text-gray-500" />
        <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          {t(meta.labelKey)}
        </span>
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 触发按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t('agent.selectAgent')}
        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-xl border border-surface-200/80 dark:border-surface-700/60 bg-white dark:bg-surface-800/60 hover:border-accent-300 dark:hover:border-accent-600 hover:bg-accent-50/50 dark:hover:bg-accent-950/20 transition-all shadow-sm"
      >
        {selectedAgent ? (
          <>
            <span className="text-base leading-none">{selectedAgent.avatar || '🤖'}</span>
            <span className="font-medium text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
              {selectedAgent.name}
            </span>
            <AgentCategoryBadge agent={selectedAgent} short showIcon={false} className="flex-shrink-0" />
          </>
        ) : (
          <>
            <Zap size={14} className="text-gray-400" />
            <span className="text-gray-500">{t('agent.selectAgent')}</span>
          </>
        )}
        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉面板 */}
      {isOpen && (
        <div className="dropdown-panel absolute left-0 top-full z-30 mt-2 w-80 bg-white dark:bg-surface-800 border border-surface-200/80 dark:border-surface-700/60 rounded-xl shadow-xl backdrop-blur-sm animate-scale-in overflow-hidden">
          {/* 搜索框 */}
          <div className="p-2 border-b border-surface-200/60 dark:border-surface-700/40">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('chat.searchAgents')}
                aria-label={t('chat.searchAgents')}
                className="w-full pl-8 pr-3 py-1.5 bg-surface-50 dark:bg-surface-900 border-none rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent-300 dark:focus:ring-accent-600"
              />
            </div>
          </div>

          {/* 选项列表 */}
          <div className="max-h-72 overflow-y-auto py-1">
            {/* 普通对话选项 */}
            <div
              onClick={() => {
                onSelect(undefined)
                setIsOpen(false)
                setSearchTerm('')
              }}
              className={`flex items-center gap-3 px-3 py-2.5 transition-all cursor-pointer ${
                !selectedAgentId
                  ? 'bg-accent-50 dark:bg-accent-950/30 border-l-2 border-accent-500'
                  : 'hover:bg-accent-50/50 dark:hover:bg-accent-950/20 border-l-2 border-transparent'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-surface-100 dark:bg-surface-700 flex items-center justify-center flex-shrink-0">
                <Zap size={14} className={!selectedAgentId ? 'text-accent-500' : 'text-gray-400'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${!selectedAgentId ? 'text-accent-700 dark:text-accent-300' : 'text-gray-700 dark:text-gray-300'}`}>
                  {t('chat.normalChat')}
                </div>
                <div className="text-xs text-muted truncate">{t('chat.normalChatDescription')}</div>
              </div>
              {!selectedAgentId && (
                <Check size={14} className="text-accent-500 flex-shrink-0" />
              )}
            </div>

            {/* 分割线 */}
            {hasResults && (
              <div className="border-t border-surface-200/40 dark:border-surface-700/30 my-0.5" />
            )}

            {/* 按分类分组：预设 / 工作区专属 / 自定义 */}
            {groupedFilteredAgents.map((group, gi) => (
              <div key={group.category}>
                {gi > 0 && (
                  <div className="border-t border-surface-200/30 dark:border-surface-700/20 my-0.5 mx-3" />
                )}
                {renderGroupHeader(group.category)}
                {group.agents.map((agent) => renderAgentItem(agent))}
              </div>
            ))}

            {/* 无结果 */}
            {!hasResults && (
              <div className="px-3 py-4 text-center text-xs text-muted">
                {searchTerm ? t('chat.noMatchingAgents') : t('chat.noAgentsAvailable')}
              </div>
            )}
          </div>

          {/* 管理入口 */}
          {onOpenAgentManager && (
            <div className="border-t border-surface-200/60 dark:border-surface-700/40 px-2 py-2">
              <button
                onClick={() => {
                  onOpenAgentManager()
                  setIsOpen(false)
                  setSearchTerm('')
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-accent-600 dark:text-accent-400 bg-accent-50/80 dark:bg-accent-950/20 hover:bg-accent-100 dark:hover:bg-accent-950/40 rounded-lg transition-all"
              >
                <Settings2 size={12} />
                {t('agent.agentManagement')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
