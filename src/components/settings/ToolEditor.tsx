import { useState, useMemo, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import {
  Plus, Edit2, Trash2, Save, Wrench, ToggleLeft, ToggleRight, X,
  Play, Loader2, CheckCircle2, XCircle, BarChart3, RotateCcw, Code2,
  Server, Cpu, Layers
} from 'lucide-react'
import { BUILT_IN_TOOLS, AGENT_BUILTIN_TOOLS, WORKSPACE_TOOLS } from '../../services/built-in-tools'
import { useCustomToolStore } from '../../stores/custom-tool-store'
import { useToolStatsStore } from '../../stores/tool-stats-store'
import { useMCPToolStore } from '../../stores/mcp-tool-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useGlobalConfigStore } from '../../stores/global-config-store'
import { toolService } from '../../services/tool-service'
import { isWebTool } from '../../utils/web-tools'
import { useAppTranslation } from '@/i18n/hooks'
import type { Tool } from '../../types'
import { SettingsHeader, SettingsTabs, useConfirmDialog, SettingsEmptyState } from './ui'
import { BrowserRuntimeSettings } from './BrowserRuntimeSettings'

// ==================== 默认 JS 代码模板 ====================
const DEFAULT_CODE_TEMPLATE = `// 自定义工具函数
// 参数: params - JSON 参数对象
// 可用: console, fetch, JSON, Math, Date, Promise 等
// 返回: 任意可 JSON 序列化的值

async (params) => {
  // 在此编写工具逻辑
  const { input } = params

  return {
    result: \`处理完成: \${input}\`
  }
}`

// ==================== Tab 类型 ====================
type DetailTab = 'edit' | 'test' | 'stats'

// ==================== 内置类型枚举 ====================
type BuiltinType = 'general' | 'agent' | 'workspace'

/** 判断工具是否为 Agent 协议工具 */
function isAgentBuiltinTool(tool: Tool): boolean {
  return AGENT_BUILTIN_TOOLS.some((t) => t.id === tool.id)
}

/** 判断工具是否为工作区工具 */
function isWorkspaceTool(tool: Tool): boolean {
  return WORKSPACE_TOOLS.some((t) => t.id === tool.id)
}

/** 获取工具的内置类型 */
function getBuiltinType(tool: Tool): BuiltinType | null {
  if (BUILT_IN_TOOLS.some((t) => t.id === tool.id)) return 'general'
  if (isAgentBuiltinTool(tool)) return 'agent'
  if (isWorkspaceTool(tool)) return 'workspace'
  return null
}

// ==================== 主组件 ====================
export function ToolEditor() {
  const { t } = useAppTranslation()
  const { confirm, Dialog } = useConfirmDialog()
  const { customTools, addTool, updateTool, deleteTool, toggleTool } = useCustomToolStore()
  const mcpTools = useMCPToolStore((s) => s.mcpTools)
  const disabledIds = useSettingsStore((s) => s.disabledBuiltinToolIds)
  const toggleBuiltinTool = useSettingsStore((s) => s.toggleBuiltinTool)
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null)
  const [activeTab, setActiveTab] = useState<DetailTab>('edit')

  // 过滤被禁用的通用内置工具
  // 联网工具不受 disabledBuiltinToolIds 影响，仅由对话框「联网」按钮控制
  const enabledBuiltInTools = useMemo(
    () => BUILT_IN_TOOLS.map((t) =>
      !isWebTool(t) && disabledIds.includes(t.id) ? { ...t, enabled: false } : t
    ),
    [disabledIds]
  )

  // 构建五区域工具列表
  const regions = useMemo(() => ({
    general: enabledBuiltInTools,
    agent: AGENT_BUILTIN_TOOLS,
    workspace: WORKSPACE_TOOLS,
    mcp: mcpTools,
    custom: customTools.filter((t) => t.enabled),
  }), [enabledBuiltInTools, mcpTools, customTools])

  const handleCreate = () => {
    const newTool = addTool({
      name: '',
      description: '',
      parameters: { type: 'object', properties: {}, required: [] },
      enabled: true,
      code: DEFAULT_CODE_TEMPLATE,
      timeout: 5000
    })
    setSelectedTool(newTool)
    setActiveTab('edit')
    setView('detail')
  }

  const handleSelectTool = (tool: Tool, tab: DetailTab = 'edit') => {
    setSelectedTool(tool)
    setActiveTab(tab)
    setView('detail')
  }

  const handleBack = () => {
    // 清理空白的自定义工具（name 和 description 都为空的工具）
    if (selectedTool && !selectedTool.isBuiltIn) {
      const isEmpty = !selectedTool.name?.trim() && !selectedTool.description?.trim()
      if (isEmpty) {
        deleteTool(selectedTool.id)
      }
    }
    setView('list')
    setSelectedTool(null)
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: t('tool.deleteTool'),
      message: t('tool.deleteToolConfirm'),
      confirmLabel: t('tool.delete'),
      variant: 'danger',
    })
    if (ok) {
      deleteTool(id)
      if (selectedTool?.id === id) {
        handleBack()
      }
    }
  }

  // 区域配置（必须在任何 early return 之前调用 hooks，保证 hooks 数量稳定）
  const regionConfig = useMemo(() => [
    {
      key: 'general' as const,
      title: t('tool.generalBuiltIn'),
      description: t('tool.generalBuiltInDesc'),
      icon: <Wrench size={14} className="text-accent-500" />,
      badge: t('tool.builtIn'),
      badgeClass: 'bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400',
      tools: regions.general,
    },
    {
      key: 'agent' as const,
      title: t('tool.agentProtocol'),
      description: t('tool.agentProtocolDesc'),
      icon: <Cpu size={14} className="text-accent-500" />,
      badge: t('tool.infrastructure'),
      badgeClass: 'bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400',
      tools: regions.agent,
    },
    {
      key: 'workspace' as const,
      title: t('tool.workspaceTool'),
      description: t('tool.workspaceToolDesc'),
      icon: <Layers size={14} className="text-accent-500" />,
      badge: t('tool.infrastructure'),
      badgeClass: 'bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400',
      tools: regions.workspace,
    },
    {
      key: 'mcp' as const,
      title: t('tool.mcpTools'),
      description: t('tool.mcpToolDesc'),
      icon: <Server size={14} className="text-accent-500" />,
      badge: 'MCP',
      badgeClass: 'bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400',
      tools: regions.mcp,
    },
    {
      key: 'custom' as const,
      title: t('tool.customTools'),
      description: t('tool.customToolDesc'),
      icon: <Code2 size={14} className="text-emerald-500" />,
      badge: customTools.length > 0 ? String(customTools.length) : undefined,
      badgeClass: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
      tools: regions.custom,
    },
  ], [t, regions, customTools.length])

  if (view === 'detail' && selectedTool) {
    return (
      <>
        <ToolDetailView
          tool={selectedTool}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onBack={handleBack}
          onSave={(updates) => {
            if (!selectedTool.isBuiltIn) {
              updateTool(selectedTool.id, updates)
              setSelectedTool({ ...selectedTool, ...updates })
            }
          }}
          t={t}
        />
        <Dialog />
      </>
    )
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <SettingsHeader
        icon={Wrench}
        title={t('tool.toolManagement')}
        description={t('tool.toolManagementDescription')}
        actions={
          <button
            onClick={handleCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
          >
            <Plus size={14} /> {t('tool.newCustomTool')}
          </button>
        }
      />

      {/* 网页分析浏览器 */}
      <BrowserRuntimeSettings />

      {/* 工具区域 */}
      {regionConfig.map((region) => (
        <div key={region.key}>
          {/* 区域标题 */}
          <div className="flex items-center gap-2 mb-2">
            {region.icon}
            <h3 className="text-xs font-medium text-surface-700 dark:text-surface-300">
              {region.title}
            </h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${region.badgeClass}`}>
              {region.badge}
            </span>
            {region.badge !== t('tool.infrastructure') && (
              <span className="text-[10px] text-muted">· {region.tools.length}</span>
            )}
          </div>
          <p className="text-[10px] text-muted mb-2">{region.description}</p>

          {region.key === 'custom' ? (
            // 自定义工具单独渲染，需要特殊的回调处理
            customTools.length > 0 ? (
              <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 divide-y divide-surface-200/80 dark:divide-surface-700/60">
                {customTools.map((tool) => (
                  <ToolListItem
                    key={tool.id}
                    tool={tool}
                    builtinType={null}
                    isMcp={false}
                    isInfrastructure={false}
                    mcpServerId={undefined}
                    onSelect={() => handleSelectTool(tool)}
                    onEdit={() => handleSelectTool(tool, 'edit')}
                    onTest={() => handleSelectTool(tool, 'test')}
                    onToggle={() => toggleTool(tool.id)}
                    onDelete={() => handleDelete(tool.id)}
                    t={t}
                  />
                ))}
              </div>
            ) : (
              <div className="py-6 bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 border-dashed">
                <SettingsEmptyState
                  icon={Code2}
                  title={t('tool.noCustomTools')}
                  description={t('tool.noCustomToolsDesc')}
                  iconSize={24}
                />
              </div>
            )
          ) : region.tools.length > 0 ? (
            <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 divide-y divide-surface-200/80 dark:divide-surface-700/60">
              {region.tools.map((tool) => {
                const builtinType = getBuiltinType(tool)
                const isMcp = tool.isMCP
                const isInfrastructure = builtinType === 'agent' || builtinType === 'workspace'

                return (
                  <ToolListItem
                    key={tool.id}
                    tool={tool}
                    builtinType={builtinType}
                    isMcp={isMcp}
                    isInfrastructure={isInfrastructure}
                    mcpServerId={tool.mcpServerId}
                    onSelect={() => handleSelectTool(tool, 'test')}
                    onEdit={() => handleSelectTool(tool, 'edit')}
                    onTest={() => handleSelectTool(tool, 'test')}
                    onToggle={
                      builtinType === 'general' && !isWebTool(tool)
                        ? () => toggleBuiltinTool(tool.id)
                        : undefined
                    }
                    onDelete={() => {}}
                    t={t}
                  />
                )
              })}
            </div>
          ) : (
            <div className="py-6 bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 border-dashed">
              <SettingsEmptyState
                icon={Code2}
                title={t('tool.noTools')}
                iconSize={24}
              />
            </div>
          )}
        </div>
      ))}
      <Dialog />
    </div>
  )
}

// ==================== 工具列表项 ====================
function ToolListItem({
  tool,
  builtinType,
  isMcp,
  isInfrastructure,
  mcpServerId,
  onSelect,
  onEdit,
  onTest,
  onToggle,
  onDelete,
  t
}: {
  tool: Tool
  builtinType: BuiltinType | null
  isMcp: boolean
  isInfrastructure: boolean
  mcpServerId?: string
  onSelect: () => void
  onEdit: () => void
  onTest: () => void
  onToggle?: () => void
  onDelete: () => void
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const stats = useToolStatsStore((s) => s.stats[tool.name])
  const hasCode = !!tool.code
  const isDisabled = !tool.enabled

  // 获取 MCP 服务器名称
  const mcpServerName = useMemo(() => {
    if (!isMcp || !mcpServerId) return null
    const { mcpServers } = useGlobalConfigStore.getState()
    const server = mcpServers.find((s: { id: string; name: string }) => s.id === mcpServerId)
    return server?.name ?? mcpServerId
  }, [isMcp, mcpServerId])

  // 获取内置类型标签
  const builtinLabel = useMemo(() => {
    if (builtinType === 'agent') return 'Agent'
    if (builtinType === 'workspace') return t('tool.workspace')
    if (builtinType === 'general') return t('tool.builtIn')
    if (isMcp) return 'MCP'
    return null
  }, [builtinType, isMcp, t])

  // 获取图标样式
  const iconStyle = useMemo(() => {
    if (builtinType === 'general' || builtinType === 'agent' || builtinType === 'workspace' || isMcp) {
      return {
        bg: 'bg-accent-100 dark:bg-accent-900/30',
        text: 'text-accent-600 dark:text-accent-400'
      }
    }
    // 自定义工具
    return {
      bg: hasCode ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-accent-100 dark:bg-accent-900/30',
      text: hasCode ? 'text-emerald-600 dark:text-emerald-400' : 'text-accent-600 dark:text-accent-400'
    }
  }, [builtinType, isMcp, hasCode])

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
        isDisabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:bg-surface-50 dark:hover:bg-surface-800/40'
      }`}
      onClick={isDisabled ? undefined : onSelect}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconStyle.bg}`}>
        <Wrench size={14} className={iconStyle.text} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${
            isDisabled
              ? 'text-muted line-through'
              : 'text-surface-800 dark:text-surface-200'
          }`}>
            {tool.name}
          </span>
          {builtinLabel && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              builtinType || isMcp
                ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400'
                : 'bg-surface-100 dark:bg-surface-800 text-muted'
            }`}>
              {builtinLabel}
            </span>
          )}
          {isInfrastructure && (
            <span className="text-[10px] px-1.5 py-0.5 bg-surface-100 dark:bg-surface-800 text-muted rounded-full font-medium">
              {t('tool.infrastructure')}
            </span>
          )}
          {!isInfrastructure && builtinType !== 'general' && hasCode && (
            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full font-medium">
              JS
            </span>
          )}
          {mcpServerName && (
            <span className="text-[10px] px-1.5 py-0.5 bg-surface-100 dark:bg-surface-800 text-muted rounded-full font-medium"
              title={t('tool.source', { name: mcpServerName })}>
              {mcpServerName}
            </span>
          )}
          {stats && stats.callCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full font-medium">
              {stats.callCount}次 · {Math.round((stats.successCount / stats.callCount) * 100)}%
            </span>
          )}
        </div>
        <p className="text-xs text-muted truncate">{tool.description || t('tool.noDescription')}</p>
      </div>
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onTest}
          className={`p-1.5 rounded-lg transition-all ${
            isInfrastructure
              ? 'text-muted/50 cursor-not-allowed'
              : 'text-muted hover:text-accent-500 hover:bg-accent-50 dark:hover:bg-accent-950/30'
          }`}
          title={isInfrastructure ? t('tool.needsWorkspaceContext') : t('tool.test')}
          disabled={isInfrastructure}
        >
          <Play size={12} />
        </button>
        {builtinType === 'general' && onToggle && (
          <button
            onClick={onToggle}
            className="text-muted"
            title={tool.enabled ? t('tool.disableTool') : t('tool.enableTool')}
          >
            {tool.enabled ? (
              <ToggleRight size={18} className="text-accent-500" />
            ) : (
              <ToggleLeft size={18} />
            )}
          </button>
        )}
        {builtinType === null && !isMcp && (
          <>
            <button onClick={onToggle} className="text-muted">
              {tool.enabled ? (
                <ToggleRight size={18} className="text-accent-500" />
              ) : (
                <ToggleLeft size={18} />
              )}
            </button>
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
            >
              <Edit2 size={12} />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-muted hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-all"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ==================== 工具详情视图 ====================
function ToolDetailView({
  tool,
  activeTab,
  onTabChange,
  onBack,
  onSave,
  t
}: {
  tool: Tool
  activeTab: DetailTab
  onTabChange: (tab: DetailTab) => void
  onBack: () => void
  onSave: (updates: Partial<Tool>) => void
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const isBuiltIn = tool.isBuiltIn
  const builtinType = getBuiltinType(tool)
  const isInfrastructure = builtinType === 'agent' || builtinType === 'workspace'

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
          >
            <X size={18} />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
              <Wrench size={18} className="text-accent-500" />
              {tool.name || t('tool.newTool')}
            </h2>
            <p className="text-xs text-muted">{tool.description}</p>
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <SettingsTabs
        activeTab={activeTab}
        onTabChange={(key) => onTabChange(key as DetailTab)}
        tabs={[
          ...(!isBuiltIn ? [{ key: 'edit', label: t('tool.edit'), icon: Edit2 }] : []),
          { key: 'test', label: isInfrastructure ? t('tool.testNeedsContext') : t('tool.test'), icon: Play, disabled: isInfrastructure },
          { key: 'stats', label: t('tool.stats'), icon: BarChart3 },
        ]}
      />

      {/* Tab 内容 */}
      {activeTab === 'edit' && !isBuiltIn && (
        <ToolEditForm tool={tool} onSave={onSave} t={t} />
      )}
      {activeTab === 'test' && (
        <ToolTestPanel tool={tool} isInfrastructure={isInfrastructure} t={t} />
      )}
      {activeTab === 'stats' && <ToolStatsPanel toolName={tool.name} t={t} />}
    </div>
  )
}

// ==================== 工具编辑表单 ====================
function ToolEditForm({
  tool,
  onSave,
  t
}: {
  tool: Tool
  onSave: (updates: Partial<Tool>) => void
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const theme = useSettingsStore((s) => s.theme)
  const [name, setName] = useState(tool.name)
  const [description, setDescription] = useState(tool.description)
  const [parametersJson, setParametersJson] = useState(
    JSON.stringify(tool.parameters, null, 2)
  )
  const [code, setCode] = useState(tool.code || DEFAULT_CODE_TEMPLATE)
  const [timeout, setTimeout_] = useState(tool.timeout || 5000)
  const [jsonError, setJsonError] = useState('')
  const [nameError, setNameError] = useState('')
  const [saved, setSaved] = useState(false)

  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs'

  const handleParametersChange = (value: string | undefined) => {
    const v = value || ''
    setParametersJson(v)
    try {
      JSON.parse(v)
      setJsonError('')
    } catch {
      setJsonError(t('tool.jsonFormatError'))
    }
  }

  const handleSave = () => {
    // 验证名称不能为空
    if (!name.trim()) {
      setNameError(t('tool.toolNameRequired'))
      return
    }
    setNameError('') // 清除错误
    let parsedParams: Record<string, unknown>
    try {
      parsedParams = JSON.parse(parametersJson)
    } catch {
      setJsonError(t('tool.jsonFormatErrorFix'))
      return
    }

    onSave({
      name: name.trim(),
      description: description.trim(),
      parameters: parsedParams,
      code,
      timeout
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-4">
      {/* 基本信息 */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">{t('tool.toolName')} *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError('') }}
              placeholder="my_tool"
              className={`w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all ${
                nameError ? 'border-danger-400' : 'border-surface-200/80 dark:border-surface-700/60'
              }`}
            />
            {nameError && (
              <p className="text-xs text-danger-500 mt-1.5">{nameError}</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">{t('tool.timeout')}</label>
            <input
              type="number"
              value={timeout}
              onChange={(e) => setTimeout_(Math.max(100, Math.min(30000, Number(e.target.value) || 5000)))}
              min={100}
              max={30000}
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">{t('tool.description')}</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('tool.descriptionPlaceholder')}
            className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all"
          />
        </div>
      </div>

      {/* 参数 Schema */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5">
        <label className="block text-xs text-muted mb-2">{t('tool.parameterSchema')}</label>
        <div className={`border rounded-xl overflow-hidden ${
          jsonError ? 'border-danger-400' : 'border-surface-200/80 dark:border-surface-700/60'
        }`}>
          <Editor
            height="200px"
            language="json"
            theme={monacoTheme}
            value={parametersJson}
            onChange={handleParametersChange}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true
            }}
          />
        </div>
        {jsonError && (
          <p className="text-xs text-danger-500 mt-1.5">{jsonError}</p>
        )}
      </div>

      {/* JS 代码 */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-muted">{t('tool.jsFunctionCode')}</label>
          <span className="text-[10px] text-muted">{'async (params) => { ... }'}</span>
        </div>
        <div className="border border-surface-200/80 dark:border-surface-700/60 rounded-xl overflow-hidden">
          <Editor
            height="300px"
            language="javascript"
            theme={monacoTheme}
            value={code}
            onChange={(v) => setCode(v || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true,
              suggest: {
                showKeywords: true,
                showFunctions: true
              }
            }}
          />
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!name.trim() || !!jsonError || !!nameError}
          className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white rounded-xl px-4 py-2 text-sm font-medium transition-all shadow-sm disabled:opacity-50"
        >
          {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
          {saved ? t('tool.saved') : t('tool.save')}
        </button>
      </div>
    </div>
  )
}

// ==================== 工具测试面板 ====================
function ToolTestPanel({ tool, isInfrastructure = false, t }: { tool: Tool; isInfrastructure?: boolean; t: (key: string, options?: Record<string, unknown>) => string }) {
  const theme = useSettingsStore((s) => s.theme)
  const [inputJson, setInputJson] = useState(() => {
    // 根据 parameters Schema 生成示例参数
    try {
      const params = tool.parameters as Record<string, unknown>
      const properties = (params.properties || {}) as Record<string, Record<string, unknown>>
      const example: Record<string, unknown> = {}
      for (const [key, prop] of Object.entries(properties)) {
        const type = prop.type as string
        if (type === 'string') example[key] = prop.description || `示例${key}`
        else if (type === 'number') example[key] = 1
        else if (type === 'boolean') example[key] = true
        else if (type === 'array') example[key] = []
        else if (type === 'object') example[key] = {}
        else example[key] = ''
      }
      return JSON.stringify(example, null, 2)
    } catch {
      return '{}'
    }
  })
  const [output, setOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    durationMs?: number
    error?: string
  } | null>(null)

  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs'

  const allTools = useMemo(() => {
    const { customTools } = useCustomToolStore.getState()
    return [...BUILT_IN_TOOLS, ...AGENT_BUILTIN_TOOLS, ...WORKSPACE_TOOLS, ...customTools]
  }, [])

  const handleExecute = useCallback(async () => {
    setIsRunning(true)
    setResult(null)
    setOutput('')

    try {
      let args: Record<string, unknown>
      try {
        args = JSON.parse(inputJson)
      } catch {
        setResult({ success: false, error: t('tool.inputJsonError') })
        setOutput(t('tool.errorPrefix', { message: t('tool.inputJsonError') }))
        return
      }

      const response = await toolService.executeTool(tool.name, args, allTools)

      setResult({
        success: response.success,
        durationMs: response.durationMs,
        error: response.error
      })

      if (response.success) {
        // 尝试格式化 JSON 输出
        try {
          const parsed = JSON.parse(response.data)
          setOutput(JSON.stringify(parsed, null, 2))
        } catch {
          setOutput(response.data)
        }
      } else {
        setOutput(t('tool.errorPrefix', { message: response.error }))
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('tool.executionFailure')
      setResult({ success: false, error: msg })
      setOutput(t('tool.errorPrefix', { message: msg }))
    } finally {
      setIsRunning(false)
    }
  }, [tool.name, inputJson, allTools, t])

  const infrastructureType = tool.isBuiltIn && AGENT_BUILTIN_TOOLS.some((t) => t.id === tool.id)
    ? t('tool.agentProtocolType')
    : t('tool.workspaceType')

  return (
    <div className="space-y-4">
      {/* 基础设施提示 */}
      {isInfrastructure && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200/80 dark:border-amber-700/60 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <XCircle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                {t('tool.needsWorkspaceContextTitle')}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                {t('tool.needsWorkspaceContextDesc', { type: infrastructureType })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 输入区 */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-muted">{t('tool.inputParamsJson')}</label>
          <button
            onClick={handleExecute}
            disabled={isRunning || isInfrastructure}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <Loader2 size={12} className="animate-spin" /> {t('tool.executing')}
              </>
            ) : (
              <>
                <Play size={12} /> {t('tool.execute')}
              </>
            )}
          </button>
        </div>
        <div className="border border-surface-200/80 dark:border-surface-700/60 rounded-xl overflow-hidden">
          <Editor
            height="180px"
            language="json"
            theme={monacoTheme}
            value={inputJson}
            onChange={(v) => setInputJson(v || '{}')}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true
            }}
          />
        </div>
      </div>

      {/* 结果状态栏 */}
      {result && (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm ${
          result.success
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
        }`}>
          {result.success ? (
            <CheckCircle2 size={16} />
          ) : (
            <XCircle size={16} />
          )}
          <span className="font-medium">
            {result.success ? t('tool.executionSuccess') : t('tool.executionFailed')}
          </span>
          {result.durationMs !== undefined && (
            <span className="text-xs opacity-70">{t('tool.durationMs', { ms: result.durationMs })}</span>
          )}
          {result.error && (
            <span className="text-xs opacity-70 truncate">{result.error}</span>
          )}
        </div>
      )}

      {/* 输出区 */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5">
        <label className="block text-xs text-muted mb-2">{t('tool.outputResult')}</label>
        <div className="border border-surface-200/80 dark:border-surface-700/60 rounded-xl overflow-hidden">
          <Editor
            height="250px"
            language="json"
            theme={monacoTheme}
            value={output || t('tool.clickExecute')}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              domReadOnly: true
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ==================== 工具统计面板 ====================
function ToolStatsPanel({ toolName, t }: { toolName: string; t: (key: string, options?: Record<string, unknown>) => string }) {
  const stats = useToolStatsStore((s) => s.stats[toolName])
  const resetStats = useToolStatsStore((s) => s.resetStats)
  const { confirm, Dialog } = useConfirmDialog()

  const handleReset = useCallback(async () => {
    const ok = await confirm({
      title: t('tool.resetStats'),
      message: t('tool.resetStatsConfirm'),
      confirmLabel: t('tool.reset'),
      variant: 'warning',
    })
    if (ok) {
      resetStats(toolName)
    }
  }, [confirm, resetStats, toolName, t])

  if (!stats || stats.callCount === 0) {
    return (
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-8 text-center">
        <BarChart3 size={40} className="mx-auto mb-3 text-muted opacity-30" />
        <p className="text-sm text-muted">{t('tool.noStatsYet')}</p>
        <p className="text-xs text-muted mt-1">{t('tool.noStatsDesc')}</p>
      </div>
    )
  }

  const successRate = Math.round((stats.successCount / stats.callCount) * 100)
  const avgDuration = Math.round(stats.totalDurationMs / stats.callCount)
  const lastCalled = stats.lastCalledAt
    ? new Date(stats.lastCalledAt).toLocaleString()
    : t('tool.unknown')

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatsCard label={t('tool.callCount')} value={String(stats.callCount)} />
        <StatsCard
          label={t('tool.successRate')}
          value={`${successRate}%`}
          color={successRate >= 90 ? 'emerald' : successRate >= 70 ? 'amber' : 'red'}
        />
        <StatsCard label={t('tool.avgDuration')} value={`${avgDuration}ms`} />
        <StatsCard label={t('tool.lastCalled')} value={lastCalled} small />
      </div>

      {/* 详细统计 */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5">
        <h4 className="text-xs font-medium text-muted mb-3">{t('tool.detailedStats')}</h4>
        <div className="space-y-2">
          <StatsRow label={t('tool.successCount')} value={String(stats.successCount)} />
          <StatsRow label={t('tool.failureCount')} value={String(stats.failureCount)} />
          <StatsRow label={t('tool.totalDuration')} value={`${stats.totalDurationMs}ms`} />
          <StatsRow label={t('tool.avgDuration')} value={`${avgDuration}ms`} />
        </div>
      </div>

      {/* 重置按钮 */}
      <div className="flex justify-end">
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted hover:text-danger-500 rounded-lg hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-all"
        >
          <RotateCcw size={12} /> {t('tool.resetStats')}
        </button>
      </div>
      <Dialog />
    </div>
  )
}

function StatsCard({
  label,
  value,
  color,
  small
}: {
  label: string
  value: string
  color?: 'emerald' | 'amber' | 'red'
  small?: boolean
}) {
  const colorClasses = color
    ? {
        emerald: 'text-emerald-600 dark:text-emerald-400',
        amber: 'text-amber-600 dark:text-amber-400',
        red: 'text-red-600 dark:text-red-400'
      }[color]
    : 'text-surface-800 dark:text-surface-200'

  return (
    <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-4">
      <p className="text-[10px] text-muted mb-1">{label}</p>
      <p className={`${small ? 'text-xs' : 'text-lg'} font-semibold ${colorClasses}`}>
        {value}
      </p>
    </div>
  )
}

function StatsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-surface-100 dark:border-surface-700/40 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs font-medium text-surface-800 dark:text-surface-200">{value}</span>
    </div>
  )
}
