import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  Save,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2,
  Globe,
  Github,
  Brain,
  BookOpen,
  Server,
  Code2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Trash2,
  Eye,
  EyeOff
} from 'lucide-react'
import { SettingsHeader, SettingsSaveBar, SettingsTabs, StatusFeedback } from './ui'
import { useGlobalConfigStore } from '../../stores/global-config-store'
import { useMCPToolStore } from '../../stores/mcp-tool-store'
import { useAppTranslation } from '@/i18n/hooks'
import { mcpService } from '../../services/mcp-service'
import type { MCPServerConfig } from '../../types'
import { PRESET_MCP_SERVERS, type PresetMCPServer } from '../../constants/preset-mcp-servers'

// ==================== 图标映射 ====================
const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Globe,
  Github,
  Brain,
  BookOpen
}

function getIcon(name: string) {
  return ICON_MAP[name] || Server
}

// ==================== 分类颜色映射 ====================
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  数据获取: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800'
  },
  代码管理: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800'
  },
  思维增强: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800'
  },
  开发辅助: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    text: 'text-green-700 dark:text-green-300',
    border: 'border-green-200 dark:border-green-800'
  }
}

function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] || {
    bg: 'bg-surface-50 dark:bg-surface-950/30',
    text: 'text-surface-700 dark:text-surface-300',
    border: 'border-surface-200 dark:border-surface-800'
  }
}

// ==================== 组件 ====================

type TabType = 'presets' | 'custom'

export function MCPConfig() {
  const { t } = useAppTranslation()
  const { mcpServers, updateConfig } = useGlobalConfigStore()
  const { mcpTools, loading: mcpLoading, errors: mcpErrors, refreshTools } = useMCPToolStore()

  const [activeTab, setActiveTab] = useState<TabType>('presets')
  const [servers, setServers] = useState<MCPServerConfig[]>(mcpServers)
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({})
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({})
  const [expandedPresets, setExpandedPresets] = useState<Record<string, boolean>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message: string; tools?: string[] }>
  >({})

  // 自定义 JSON 编辑器状态
  const [customJson, setCustomJson] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  // 标记用户是否手动编辑了 JSON（手动编辑后不同步，避免覆盖）
  const jsonEditedByUser = useRef(false)

  // ==================== 预设服务器逻辑 ====================

  /** 判断某个预设是否已在用户的 servers 列表中 */
  const findPresetInServers = useCallback(
    (preset: PresetMCPServer): MCPServerConfig | undefined => {
      return servers.find(
        (s) =>
          s.command === preset.defaultConfig.command &&
          JSON.stringify(s.args) === JSON.stringify(preset.defaultConfig.args)
      )
    },
    [servers]
  )

  /** 切换预设服务器的启用/禁用 */
  const handleTogglePreset = useCallback(
    async (preset: PresetMCPServer) => {
      const existing = findPresetInServers(preset)

      if (existing) {
        // 已存在 -> 切换 enabled 状态
        setServers((prev) =>
          prev.map((s) => (s.id === existing.id ? { ...s, enabled: !s.enabled } : s))
        )
      } else {
        // 不存在 -> 添加并启用
        const apiKey = apiKeyInputs[preset.presetId] || ''

        if (preset.requiresApiKey && !apiKey.trim()) {
          setTestResults((prev) => ({
            ...prev,
            [preset.presetId]: {
              success: false,
              message: t('settings.requiresApiKey', { key: preset.apiKeyEnvKey || 'API Key' })
            }
          }))
          return
        }

        const env: Record<string, string> | undefined =
          preset.requiresApiKey && preset.apiKeyEnvKey && apiKey.trim()
            ? { [preset.apiKeyEnvKey]: apiKey.trim() }
            : undefined

        const newServer: MCPServerConfig = {
          id: `mcp:preset:${preset.presetId}:${Date.now()}`,
          name: preset.defaultConfig.name,
          command: preset.defaultConfig.command,
          args: preset.defaultConfig.args,
          env,
          enabled: true,
          description: preset.defaultConfig.description
        }

        setServers((prev) => [...prev, newServer])
        // 清除之前的测试结果
        setTestResults((prev) => {
          const next = { ...prev }
          delete next[preset.presetId]
          return next
        })
      }
    },
    [findPresetInServers, apiKeyInputs]
  )

  /** 删除预设服务器 */
  const handleRemovePreset = useCallback(
    (preset: PresetMCPServer) => {
      const existing = findPresetInServers(preset)
      if (existing) {
        setServers((prev) => prev.filter((s) => s.id !== existing.id))
      }
    },
    [findPresetInServers]
  )

  /** 测试预设服务器连接 */
  const handleTestPreset = useCallback(
    async (preset: PresetMCPServer) => {
      const existing = findPresetInServers(preset)
      const key = existing?.id || preset.presetId

      setTesting(key)
      setTestResults((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })

      try {
        // 使用已存在的服务器配置或临时配置进行测试
        const testConfig = existing || {
          id: `mcp:test:${preset.presetId}`,
          name: preset.defaultConfig.name,
          command: preset.defaultConfig.command,
          args: preset.defaultConfig.args,
          env:
            preset.requiresApiKey && preset.apiKeyEnvKey && apiKeyInputs[preset.presetId]
              ? { [preset.apiKeyEnvKey]: apiKeyInputs[preset.presetId] }
              : undefined,
          enabled: true
        }

        const tools = await mcpService.fetchTools(testConfig)
        setTestResults((prev) => ({
          ...prev,
          [key]: {
            success: true,
            message: t('settings.connectionSuccess', { count: tools.length }),
            tools: tools.map((t) => t.name)
          }
        }))
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : t('settings.connectionFailed')
        setTestResults((prev) => ({
          ...prev,
          [key]: {
            success: false,
            message: errorMsg
          }
        }))
      } finally {
        setTesting(null)
      }
    },
    [findPresetInServers, apiKeyInputs]
  )

  // ==================== 自定义 JSON 编辑器逻辑 ====================

  /** 将当前已启用的 servers 序列化为 JSON 编辑器内容（仅显示活跃配置，排除内部字段） */
  const syncServersToJson = useCallback(() => {
    const jsonObj: Record<string, Omit<MCPServerConfig, 'id' | 'enabled'>> = {}
    for (const s of servers) {
      if (!s.enabled) continue // 跳过禁用的服务器
      const { id, enabled, ...rest } = s
      jsonObj[s.name || id] = rest
    }

    setCustomJson(
      Object.keys(jsonObj).length > 0
        ? JSON.stringify(jsonObj, null, 2)
        : '{\n  \n}'
    )
    setJsonError(null)
    jsonEditedByUser.current = false
  }, [servers])

  /** 初始化 JSON 编辑器（切换到自定义配置 tab 时调用） */
  const handleInitJsonEditor = useCallback(() => {
    jsonEditedByUser.current = false
    syncServersToJson()
  }, [syncServersToJson])

  /** 当 servers 变化且用户在自定义配置 tab 时，自动同步 JSON */
  useEffect(() => {
    if (activeTab === 'custom' && !jsonEditedByUser.current) {
      syncServersToJson()
    }
  }, [servers, activeTab, syncServersToJson])

  /** 应用 JSON 配置 */
  const handleApplyJson = useCallback(() => {
    setJsonError(null)

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(customJson)
    } catch {
      setJsonError(t('settings.jsonFormatError'))
      return
    }

    const newServers: MCPServerConfig[] = []
    for (const [key, value] of Object.entries(parsed)) {
      const cfg = value as Record<string, unknown>
      if (!cfg.command || typeof cfg.command !== 'string') {
        setJsonError(t('settings.missingCommand', { name: key }))
        return
      }
      if (!Array.isArray(cfg.args)) {
        setJsonError(t('settings.argsMustBeArray', { name: key }))
        return
      }

      newServers.push({
        id: `mcp:custom:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        name: key,
        command: cfg.command as string,
        args: cfg.args as string[],
        env: cfg.env as Record<string, string> | undefined,
        enabled: cfg.enabled !== false,
        description: cfg.description as string | undefined
      })
    }

    // JSON 为权威来源：直接用解析结果替换全部服务器
    // 推荐服务的开关状态会通过 findPresetInServers 自动反映
    setServers(newServers)
    // 同时持久化到全局 store，确保重新打开设置时不会丢失
    updateConfig({ mcpServers: newServers })
    jsonEditedByUser.current = false
  }, [customJson, servers, updateConfig])

  // ==================== 保存 ====================

  const handleSave = async () => {
    updateConfig({ mcpServers: servers })
    await refreshTools()
  }

  // ==================== 统计信息 ====================

  const presetStatus = useMemo(() => {
    const enabled: string[] = []
    for (const preset of PRESET_MCP_SERVERS) {
      const existing = servers.find(
        (s) =>
          s.command === preset.defaultConfig.command &&
          JSON.stringify(s.args) === JSON.stringify(preset.defaultConfig.args) &&
          s.enabled
      )
      if (existing) enabled.push(preset.name)
    }
    return { count: enabled.length, names: enabled }
  }, [servers])

  return (
    <div className="flex flex-col h-full">
      {/* 标题 + 描述 */}
      <div className="flex-shrink-0 px-1 pb-4">
        <SettingsHeader icon={Sparkles} title={t('settings.mcpExtendedServices')} description={t('settings.mcpExtendedServicesDescription')} />
      </div>

      {/* 可滚动内容区域 */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-1">

      {/* Tab 切换 + 内容卡片 */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 overflow-hidden">
        {/* Tab 栏 */}
        <SettingsTabs
          variant="underline"
          activeTab={activeTab}
          onTabChange={(key) => {
            setActiveTab(key as TabType)
            if (key === 'custom') handleInitJsonEditor()
          }}
          tabs={[
            { key: 'presets', label: t('settings.recommendedServices'), icon: Sparkles },
            { key: 'custom', label: t('settings.customConfiguration'), icon: Code2 },
          ]}
        />

        {/* 内容区域 */}
        <div className="p-5">
        {activeTab === 'presets' ? (
          <PresetTab
            servers={servers}
            apiKeyInputs={apiKeyInputs}
            setApiKeyInputs={setApiKeyInputs}
            showApiKeys={showApiKeys}
            setShowApiKeys={setShowApiKeys}
            expandedPresets={expandedPresets}
            setExpandedPresets={setExpandedPresets}
            testing={testing}
            testResults={testResults}
            onToggle={handleTogglePreset}
            onRemove={handleRemovePreset}
            onTest={handleTestPreset}
            findPresetInServers={findPresetInServers}
            t={t}
          />
        ) : (
          <CustomTab
            customJson={customJson}
            setCustomJson={setCustomJson}
            jsonError={jsonError}
            setJsonError={setJsonError}
            onApply={handleApplyJson}
            onJsonEdit={() => { jsonEditedByUser.current = true }}
            t={t}
          />
        )}
        </div>
      </div>

      {/* MCP 工具状态 */}
      {(mcpTools.length > 0 || mcpLoading || Object.keys(mcpErrors).length > 0) && (
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-4 space-y-2">
          {mcpLoading && (
            <div className="flex items-center gap-2 text-xs text-blue-500">
              <Loader2 size={12} className="animate-spin" />
              {t('settings.loadingMcpTools')}
            </div>
          )}
          {mcpTools.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-success-600 dark:text-success-400">
              <CheckCircle size={12} />
              {t('settings.loadedMcpTools', { count: mcpTools.length, names: mcpTools.map((tool) => tool.name).join(', ') })}
            </div>
          )}
          {Object.entries(mcpErrors).map(([serverId, error]) => (
            <div key={serverId} className="flex items-start gap-2 text-xs text-danger-500">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span className="break-all">{error}</span>
            </div>
          ))}
        </div>
      )}

      </div>

      {/* Sticky 底部保存栏 */}
      <SettingsSaveBar
        onSave={handleSave}
        isDirty={true}
        saveLabel={t('settings.saveConfiguration')}
        shortcut="Ctrl+S"
      />
    </div>
  )
}

// ==================== 推荐服务 Tab ====================

interface PresetTabProps {
  servers: MCPServerConfig[]
  apiKeyInputs: Record<string, string>
  setApiKeyInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>
  showApiKeys: Record<string, boolean>
  setShowApiKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  expandedPresets: Record<string, boolean>
  setExpandedPresets: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  testing: string | null
  testResults: Record<string, { success: boolean; message: string; tools?: string[] }>
  onToggle: (preset: PresetMCPServer) => void
  onRemove: (preset: PresetMCPServer) => void
  onTest: (preset: PresetMCPServer) => void
  findPresetInServers: (preset: PresetMCPServer) => MCPServerConfig | undefined
  t: (key: string, options?: Record<string, unknown>) => string
}

function PresetTab({
  servers,
  apiKeyInputs,
  setApiKeyInputs,
  showApiKeys,
  setShowApiKeys,
  expandedPresets,
  setExpandedPresets,
  testing,
  testResults,
  onToggle,
  onRemove,
  onTest,
  findPresetInServers,
  t
}: PresetTabProps) {
  return (
    <div className="space-y-3">
      {PRESET_MCP_SERVERS.map((preset) => {
        const existing = findPresetInServers(preset)
        const isEnabled = existing?.enabled ?? false
        const isInstalled = !!existing
        const isExpanded = expandedPresets[preset.presetId] ?? false
        const IconComponent = getIcon(preset.icon)
        const colors = getCategoryColor(preset.category)
        const testKey = existing?.id || preset.presetId
        const testResult = testResults[testKey]
        const isTestingThis = testing === testKey

        return (
          <div
            key={preset.presetId}
            className={`border rounded-xl transition-all ${
              isInstalled && isEnabled
                ? `${colors.border} ${colors.bg}`
                : 'border-surface-200/80 dark:border-surface-700/60 hover:border-surface-300 dark:hover:border-surface-600'
            }`}
          >
            {/* 主卡片区域 */}
            <div className="p-4">
              <div className="flex items-start gap-3">
                {/* 图标 */}
                <div
                  className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${colors.bg} ${colors.border} border`}
                >
                  <IconComponent size={20} className={colors.text} />
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                      {preset.name}
                    </h3>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors.bg} ${colors.text} ${colors.border} border`}
                    >
                      {preset.category}
                    </span>
                    {isInstalled && isEnabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-800">
                        {t('settings.enabled')}
                      </span>
                    )}
                    {isInstalled && !isEnabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-surface-100 text-muted dark:bg-surface-800 dark:text-muted border border-surface-200/80 dark:border-surface-700/60">
                        {t('settings.disabled')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    {preset.description}
                  </p>

                  {/* API Key 输入框 */}
                  {preset.requiresApiKey && !isInstalled && (
                    <div className="mt-2">
                      <div className="flex items-center gap-1">
                        <input
                          type={showApiKeys[preset.presetId] ? 'text' : 'password'}
                          value={apiKeyInputs[preset.presetId] || ''}
                          onChange={(e) =>
                            setApiKeyInputs((prev) => ({
                              ...prev,
                              [preset.presetId]: e.target.value
                            }))
                          }
                          placeholder={preset.apiKeyHint || t('settings.enterApiKey')}
                          className="flex-1 px-2.5 py-1.5 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 font-mono"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowApiKeys((prev) => ({
                              ...prev,
                              [preset.presetId]: !prev[preset.presetId]
                            }))
                          }}
                          className="p-1.5 text-muted hover:text-surface-600 dark:hover:text-surface-300"
                        >
                          {showApiKeys[preset.presetId] ? (
                            <EyeOff size={14} />
                          ) : (
                            <Eye size={14} />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 已安装时显示 API Key 信息 */}
                  {isInstalled && preset.requiresApiKey && (
                    <p className="text-[10px] text-muted mt-1">
                      {preset.apiKeyEnvKey}: ••••••••
                    </p>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* 测试按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onTest(preset)
                    }}
                    disabled={isTestingThis || (!isInstalled && preset.requiresApiKey && !(apiKeyInputs[preset.presetId] || '').trim())}
                    className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-muted disabled:opacity-40"
                    title={t('settings.testConnection')}
                  >
                    <RefreshCw
                      size={14}
                      className={isTestingThis ? 'animate-spin' : ''}
                    />
                  </button>

                  {/* 启用/禁用切换 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggle(preset)
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      isInstalled && isEnabled
                        ? 'bg-accent-500'
                        : 'bg-surface-300 dark:bg-surface-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isInstalled && isEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>

                  {/* 删除按钮（仅已安装时显示） */}
                  {isInstalled && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemove(preset)
                      }}
                      className="p-1.5 rounded-lg hover:bg-danger-50 dark:hover:bg-danger-950/30 text-red-400 hover:text-red-500"
                      title={t('settings.removeService')}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* 测试结果 */}
              {testResult && (
                <div
                  className={`mt-2 ml-13 pl-0 text-xs ${
                    testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-500'
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    {testResult.success ? (
                      <CheckCircle size={12} className="mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p>{testResult.message}</p>
                      {testResult.tools && testResult.tools.length > 0 && (
                        <p className="text-[10px] text-muted mt-0.5">
                          {t('settings.tools')}: {testResult.tools.join(', ')}
                        </p>
                      )}
                      {!testResult.success && (
                        <p className="text-[10px] text-muted mt-0.5">
                          {t('settings.commonReasons')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 展开/收起详情 */}
              <button
                onClick={() =>
                  setExpandedPresets((prev) => ({
                    ...prev,
                    [preset.presetId]: !prev[preset.presetId]
                  }))
                }
                className="mt-2 ml-13 flex items-center gap-1 text-[10px] text-muted hover:text-surface-600 dark:hover:text-surface-300"
              >
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {isExpanded ? t('settings.collapseDetails') : t('settings.viewDetails')}
              </button>

              {/* 详情展开区 */}
              {isExpanded && (
                <div className="mt-2 ml-13 p-2.5 bg-surface-50 dark:bg-surface-900/50 rounded-lg text-xs text-muted leading-relaxed whitespace-pre-line">
                  {preset.detail}
                  <div className="mt-2 pt-2 border-t border-surface-200/80 dark:border-surface-700/60">
                    <p className="text-[10px] text-muted font-mono">
                      {t('settings.command')}: {preset.defaultConfig.command} {preset.defaultConfig.args.join(' ')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ==================== 自定义配置 Tab ====================

interface CustomTabProps {
  customJson: string
  setCustomJson: React.Dispatch<React.SetStateAction<string>>
  jsonError: string | null
  setJsonError: React.Dispatch<React.SetStateAction<string | null>>
  onApply: () => void
  onJsonEdit: () => void
  t: (key: string, options?: Record<string, unknown>) => string
}

function CustomTab({ customJson, setCustomJson, jsonError, setJsonError, onApply, onJsonEdit, t }: CustomTabProps) {
  return (
    <div className="space-y-3">
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          <strong>{t('settings.advancedUser')}</strong>：{t('settings.advancedUserDescription', { link: '' }).replace(' {{link}}', '')}{' '}
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {t('settings.mcpOfficialDocs')}
          </a>
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-surface-700 dark:text-surface-300 mb-1.5">
          {t('settings.mcpServerConfigJson')}
        </label>
        <textarea
          value={customJson}
          onChange={(e) => {
            onJsonEdit()
            setCustomJson(e.target.value)
          }}
          placeholder={`{
  "my-custom-server": {
    "command": "npx",
    "args": ["-y", "my-mcp-server"],
    "env": {
      "API_KEY": "your-key"
    }
  }
}`}
          rows={16}
          spellCheck={false}
          className="w-full px-3 py-2.5 text-xs font-mono border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 resize-y leading-relaxed"
        />
      </div>

      {jsonError && (
        <StatusFeedback
          type="error"
          message={jsonError}
          className="items-start"
        />
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onApply}
          className="px-3 py-1.5 text-xs bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
        >
          {t('settings.applyConfiguration')}
        </button>
        <button
          onClick={() => {
            try {
              const parsed = JSON.parse(customJson)
              setCustomJson(JSON.stringify(parsed, null, 2))
            } catch {
              // ignore
            }
          }}
          className="px-3 py-1.5 text-xs border border-surface-300 dark:border-surface-600 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-muted"
        >
          {t('settings.formatJson')}
        </button>
      </div>

    </div>
  )
}
