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

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  Settings, ExternalLink, ToggleLeft, ToggleRight,
  Database, Plug, ChevronDown, ChevronRight, Check, Crown, FileEdit,
} from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useKnowledgeCollectionStore } from '../../stores/knowledge-collection-store'
import { useGlobalConfigStore } from '../../stores/global-config-store'
import { useAgentStore } from '../../stores/agent-store'
import { useWorkspaceAgentStore } from '../../stores/workspace-agent-store'
import { WORKSPACE_LEADER_AGENT_ID, WORKSPACE_LEADER_PROMPT } from '../../constants/default-agents'
import { getQuickAccessSettings } from '../../constants/settings-registry'
import { SettingFieldRenderer } from '../settings/SettingFieldRenderer'
import { LeaderPromptEditorModal } from './LeaderPromptEditorModal'
import type { Workspace, AutoApprovalConfig } from '../../types'
import type { SettingItemMeta } from '../../types/settings-meta'
import { useAppTranslation } from '../../i18n/hooks'

// ---- Props ----

interface WorkspaceSettingsPopoverProps {
  workspace: Workspace
  onClose: () => void
  onOpenFullSettings: () => void
  /** 触发按钮的 ref，用于 fixed 定位计算 */
  anchorRef?: React.RefObject<HTMLButtonElement | null>
}

// ---- 元数据驱动设置工具 ----

function getWorkspaceSettingValue(workspace: Workspace, item: SettingItemMeta): unknown {
  const path = item.path ?? item.key
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[part]
    }
    return undefined
  }, workspace)
}

function buildWorkspaceSettingPatch(item: SettingItemMeta, value: unknown, workspace: Workspace): Partial<Workspace> {
  const path = item.path ?? item.key
  const parts = path.split('.')
  if (parts.length === 1) {
    return { [parts[0]]: value } as Partial<Workspace>
  }

  const [root, child] = parts
  const currentRoot = workspace[root as keyof Workspace]
  return {
    [root]: {
      ...(currentRoot && typeof currentRoot === 'object' ? currentRoot : {}),
      [child]: value,
    },
  } as Partial<Workspace>
}

// ---- 组件 ----

export function WorkspaceSettingsPopover({ workspace, onClose, onOpenFullSettings, anchorRef }: WorkspaceSettingsPopoverProps) {
  const { t } = useAppTranslation()
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

  const quickSettingItems = useMemo(() => {
    const workspaceSettingText: Record<string, { label: string; description: string; unit?: string }> = {
      'workspace.checkpointPolicy': {
        label: t('workspace.quickCheckpointPolicy'),
        description: t('workspace.quickCheckpointPolicyDescription'),
      },
      'workspace.commandPolicy': {
        label: t('workspace.quickCommandPolicy'),
        description: t('workspace.quickCommandPolicyDescription'),
      },
      'workspace.commandExecutionEnabled': {
        label: t('workspace.quickCommandExecutionEnabled'),
        description: t('workspace.quickCommandExecutionEnabledDescription'),
      },
      'workspace.contextConfig.compressionEnabled': {
        label: t('workspace.quickContextCompression'),
        description: t('workspace.quickContextCompressionDescription'),
      },
      'workspace.contextConfig.maxTokens': {
        label: t('workspace.quickMaxContextTokens'),
        description: t('workspace.quickMaxContextTokensDescription'),
      },
      'workspace.contextConfig.compressionThreshold': {
        label: t('workspace.quickCompressionThreshold'),
        description: t('workspace.quickCompressionThresholdDescription'),
      },
      'workspace.contextConfig.keepCheckpointBeforeCompression': {
        label: t('workspace.quickCheckpointBeforeCompression'),
        description: t('workspace.quickCheckpointBeforeCompressionDescription'),
      },
      'workspace.timedIntervalMinutes': {
        label: t('workspace.quickTimedInterval'),
        description: t('workspace.quickTimedIntervalDescription'),
        unit: t('workspace.minutesUnit'),
      },
      'workspace.maxCheckpoints': {
        label: t('workspace.quickMaxCheckpoints'),
        description: t('workspace.quickMaxCheckpointsDescription'),
        unit: t('workspace.countUnit'),
      },
    }

    const optionText: Record<string, Record<string, { label: string; desc?: string }>> = {
      'workspace.checkpointPolicy': {
        'auto-before-modify': {
          label: t('workspace.quickCheckpointAutoBeforeModify'),
          desc: t('workspace.quickCheckpointAutoBeforeModifyDescription'),
        },
        timed: {
          label: t('workspace.quickCheckpointTimed'),
          desc: t('workspace.quickCheckpointTimedDescription'),
        },
        manual: {
          label: t('workspace.quickCheckpointManual'),
          desc: t('workspace.quickCheckpointManualDescription'),
        },
      },
      'workspace.commandPolicy': {
        'auto-approve-safe': {
          label: t('workspace.quickCommandAutoApproveSafe'),
          desc: t('workspace.quickCommandAutoApproveSafeDescription'),
        },
        'all-need-approval': {
          label: t('workspace.quickCommandAllNeedApproval'),
          desc: t('workspace.quickCommandAllNeedApprovalDescription'),
        },
        'auto-approve-all': {
          label: t('workspace.quickCommandAutoApproveAll'),
          desc: t('workspace.quickCommandAutoApproveAllDescription'),
        },
      },
    }

    return getQuickAccessSettings('workspace').map((item) => {
      const text = workspaceSettingText[item.id]
      return {
        ...item,
        label: text?.label ?? item.label,
        description: text?.description ?? item.description,
        unit: text?.unit ?? item.unit,
        options: item.options?.map((option) => ({
          ...option,
          label: optionText[item.id]?.[option.value]?.label ?? option.label,
          desc: optionText[item.id]?.[option.value]?.desc ?? option.desc,
        })),
      }
    })
  }, [t])

  const updateQuickSetting = useCallback((item: SettingItemMeta, value: unknown) => {
    updateWorkspace({
      id: workspace.id,
      ...buildWorkspaceSettingPatch(item, value, workspace),
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
    { field: 'readFiles', label: t('workspace.autoApprovalReadFiles'), desc: 'read_file' },
    { field: 'listFiles', label: t('workspace.autoApprovalListFiles'), desc: 'list_files' },
    { field: 'writeFiles', label: t('workspace.autoApprovalWriteFiles'), desc: 'write_file' },
    { field: 'executeSafeCommands', label: t('workspace.autoApprovalSafeCommands'), desc: t('workspace.readOnlyShell') },
    { field: 'browser', label: t('workspace.autoApprovalBrowser'), desc: 'site_analyzer' },
    { field: 'mcpTools', label: t('workspace.autoApprovalMcpTools'), desc: t('workspace.linkedServers') },
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

  const enabledKBCount = (workspace.knowledgeBaseIds ?? []).length
  const enabledMCPCount = (workspace.mcpServerIds ?? []).length

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
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('workspace.workspaceSettings')}</span>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">
          {workspace.name}
        </p>
      </div>

      {/* 设置项（可滚动） */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {/* 注册表驱动快捷设置 */}
        {quickSettingItems.map((item) => (
          <SettingFieldRenderer
            key={item.id}
            item={item}
            value={getWorkspaceSettingValue(workspace, item)}
            onChange={(value) => updateQuickSetting(item, value)}
            compact
            className="rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors"
          />
        ))}

        {/* 自动审批矩阵 */}
        <div className="rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2.5">
              <FileEdit size={14} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-700 dark:text-gray-300">{t('workspace.autoApprovalMatrix')}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  {workspace.autoApproval?.enabled ? t('workspace.autoApprovalEnabled') : t('workspace.autoApprovalDisabled')}
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

        {/* C3: 知识库关联 */}
        <div className="rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors">
          <button
            onClick={() => setShowKBSection(!showKBSection)}
            className="w-full flex items-center gap-2.5 px-3 py-2"
          >
            <Database size={14} className="text-gray-400" />
            <div className="flex-1 text-left">
              <p className="text-xs text-gray-700 dark:text-gray-300">{t('workspace.knowledgeBaseLink')}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                {enabledKBCount > 0 ? t('workspace.linkedCollectionsCount', { count: enabledKBCount }) : t('workspace.noKnowledgeBaseLinked')}
              </p>
            </div>
            {showKBSection ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
          </button>
          {showKBSection && (
            <div className="px-3 pb-2 ml-6 space-y-1">
              {collections.length === 0 ? (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 py-1">{t('workspace.noKnowledgeBaseCollections')}</p>
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
                {t('workspace.knowledgeBaseLinkHint')}
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
              <p className="text-xs text-gray-700 dark:text-gray-300">{t('workspace.mcpServers')}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                {enabledMCPCount > 0 ? t('workspace.enabledServersCount', { count: enabledMCPCount }) : t('workspace.noMcpServersEnabled')}
              </p>
            </div>
            {showMCPSection ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
          </button>
          {showMCPSection && (
            <div className="px-3 pb-2 ml-6 space-y-1">
              {mcpServers.length === 0 ? (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 py-1">{t('workspace.noMcpServersConfigured')}</p>
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
                {t('workspace.mcpServersHint')}
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
                <p className="text-xs text-gray-700 dark:text-gray-300">{t('workspace.aiLeaderPrompt')}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  {isCustomPrompt ? t('workspace.customized') : t('workspace.useDefaultPrompt')}
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
                  <span>{t('workspace.editPrompt')}</span>
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
          <span>{t('workspace.openFullWorkspaceSettings')}</span>
        </button>
      </div>
    </div>,
    document.body
  )
}
