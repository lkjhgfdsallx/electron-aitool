import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  X,
  Plus,
  Edit2,
  Trash2,
  Save,
  RefreshCw,
  Check,
  Loader2,
  Globe,
  Key,
  Link,
  Server,
  Star,
  StarOff,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Search,
  Keyboard,
  Wifi,
  WifiOff,
  Zap,
  Settings,
  Tag,
  AlertTriangle,
  Home,
  Terminal,
  Hash,
  XCircle
} from 'lucide-react'
import { SettingsHeader, SettingsSaveBar, useConfirmDialog, SettingsEmptyState } from './ui'
import { useAIProviderStore } from '../../stores/ai-provider-store'
import { useAppTranslation } from '@/i18n/hooks'
import type { AIProvider, AIProviderCreateInput, AIModel, ProviderType, ConnectionStatus, ProviderRequestConfig, LocalModelConfig } from '../../types'

const EMPTY_PROVIDER: AIProviderCreateInput = {
  name: '',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  isDefault: false,
  type: 'remote'
}

// 预设 Provider 模板
const PROVIDER_PRESETS: Array<{ name: string; baseUrl: string; type: ProviderType; placeholder?: string }> = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', type: 'remote' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', type: 'remote' },
  { name: '本地 Ollama', baseUrl: 'http://localhost:11434/v1', type: 'local' },
  { name: 'LM Studio', baseUrl: 'http://localhost:1234/v1', type: 'local' },
  { name: '自定义', baseUrl: '', type: 'remote' }
]

// 连接状态颜色映射
const STATUS_COLORS: Record<ConnectionStatus, { bg: string; text: string; dot: string }> = {
  unknown: { bg: 'bg-surface-100 dark:bg-surface-700', text: 'text-muted', dot: 'bg-surface-400' },
  checking: { bg: 'bg-accent-50 dark:bg-accent-900/30', text: 'text-accent-600 dark:text-accent-400', dot: 'bg-accent-500 animate-pulse' },
  online: { bg: 'bg-green-50 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-400', dot: 'bg-green-500' },
  offline: { bg: 'bg-orange-50 dark:bg-orange-900/30', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
  error: { bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' }
}

// 状态文本映射
const STATUS_TEXT: Record<ConnectionStatus, string> = {
  unknown: '未知',
  checking: '检测中...',
  online: '在线',
  offline: '离线',
  error: '错误'
}

export interface AIProviderManagerProps {
  /** 初始打开编辑的 AI 源 ID，用于从对话页直接跳转到编辑页 */
  initialEditingProviderId?: string
}

export function AIProviderManager({ initialEditingProviderId }: AIProviderManagerProps = {}) {
  const { t } = useAppTranslation()
  const {
    providers,
    addProvider,
    updateProvider,
    deleteProvider,
    setDefaultProvider,
    fetchProviderModels,
    checkConnection,
    updateRequestConfig,
    updateModel
  } = useAIProviderStore()
  const { confirm, Dialog } = useConfirmDialog()
  /** 初始编辑 ID 只消费一次，避免关闭编辑器后被 effect 再次打开 */
  const appliedInitialEditIdRef = useRef<string | undefined>(undefined)

  // 预设 Provider 模板（使用翻译）
  const PROVIDER_PRESETS = useMemo(() => [
    { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', type: 'remote' as ProviderType },
    { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', type: 'remote' as ProviderType },
    { name: t('settings.presetLocalOllama'), baseUrl: 'http://localhost:11434/v1', type: 'local' as ProviderType },
    { name: 'LM Studio', baseUrl: 'http://localhost:1234/v1', type: 'local' as ProviderType },
    { name: t('settings.presetCustom'), baseUrl: '', type: 'remote' as ProviderType }
  ], [t])

  // 状态文本映射（使用翻译）
  const STATUS_TEXT = useMemo<Record<ConnectionStatus, string>>(() => ({
    unknown: t('settings.statusUnknown'),
    checking: t('settings.statusChecking'),
    online: t('settings.statusOnline'),
    offline: t('settings.statusOffline'),
    error: t('settings.statusError')
  }), [t])

  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null)
  const [form, setForm] = useState<AIProviderCreateInput>(EMPTY_PROVIDER)
  const [isCreating, setIsCreating] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [fetchSuccess, setFetchSuccess] = useState<string | null>(null)
  const [fetchedModels, setFetchedModels] = useState<AIModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [manualModelId, setManualModelId] = useState('')
  const [isManualMode, setIsManualMode] = useState(false)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 新增：高级配置折叠状态
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showModelManager, setShowModelManager] = useState(false)

  // 新增：请求配置状态
  const [requestConfig, setRequestConfig] = useState<ProviderRequestConfig>({})
  const [localConfig, setLocalConfig] = useState<LocalModelConfig>({})
  const [providerType, setProviderType] = useState<ProviderType>('remote')

  // 新增：自定义 Headers 编辑
  const [customHeadersText, setCustomHeadersText] = useState('')

  // 新增：模型标签编辑
  const [editingModelTags, setEditingModelTags] = useState<string | null>(null)
  const [modelTagInput, setModelTagInput] = useState('')
  const [editingModelContext, setEditingModelContext] = useState<string | null>(null)
  const [contextWindowInput, setContextWindowInput] = useState('')

  // 自动拉取模型（debounced）
  const debouncedFetch = useCallback(async (baseUrl: string, apiKey: string) => {
    if (!baseUrl.trim()) return
    setFetching(true)
    setFetchError(null)
    try {
      const models = await fetchModelsFromUrl(baseUrl, apiKey)
      setFetchedModels(models)
      if (models.length > 0 && !selectedModelId) {
        setSelectedModelId(models[0].id)
      }
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : t('settings.autoFetchFailed'))
      setIsManualMode(true)
    } finally {
      setFetching(false)
    }
  }, [selectedModelId])

  // 当 form.baseUrl 或 form.apiKey 变化时自动拉取
  useEffect(() => {
    if (!isCreating) return
    if (!form.baseUrl.trim()) return
    const shouldFetch = form.apiKey.trim() || form.baseUrl.includes('localhost') || form.baseUrl.includes('127.0.0.1')
    if (!shouldFetch) return

    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current)
    fetchTimerRef.current = setTimeout(() => {
      debouncedFetch(form.baseUrl, form.apiKey)
    }, 1000)
    return () => {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current)
    }
  }, [form.baseUrl, form.apiKey, isCreating, debouncedFetch])

  // 编辑时加载已有配置
  useEffect(() => {
    if (editingProvider) {
      setFetchedModels(editingProvider.models)
      setSelectedModelId(editingProvider.defaultModelId || editingProvider.models[0]?.id || '')
      if (editingProvider.models.length === 0) {
        setIsManualMode(true)
      }
      setProviderType(editingProvider.type || 'remote')
      setRequestConfig(editingProvider.requestConfig || {})
      setLocalConfig(editingProvider.localConfig || {})
      // 加载自定义 headers
      if (editingProvider.requestConfig?.customHeaders) {
        setCustomHeadersText(
          Object.entries(editingProvider.requestConfig.customHeaders)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')
        )
      }
    } else {
      setFetchedModels([])
      setSelectedModelId('')
      setManualModelId('')
      setIsManualMode(false)
      setProviderType('remote')
      setRequestConfig({})
      setLocalConfig({})
      setCustomHeadersText('')
    }
    setShowAdvanced(false)
    setShowModelManager(false)
  }, [editingProvider])

  // 点击下拉框外部关闭
  useEffect(() => {
    if (!modelDropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [modelDropdownOpen])

  // ==================== 辅助函数 ====================

  const parseCustomHeaders = (text: string): Record<string, string> => {
    const headers: Record<string, string> = {}
    text.split('\n').forEach(line => {
      const trimmed = line.trim()
      if (!trimmed) return
      const colonIndex = trimmed.indexOf(':')
      if (colonIndex > 0) {
        const key = trimmed.slice(0, colonIndex).trim()
        const value = trimmed.slice(colonIndex + 1).trim()
        if (key) headers[key] = value
      }
    })
    return headers
  }

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return t('settings.never')
    const now = Date.now()
    const diff = now - timestamp
    if (diff < 60000) return t('settings.justNow')
    if (diff < 3600000) return t('settings.minutesAgo', { count: Math.floor(diff / 60000) })
    if (diff < 86400000) return t('settings.hoursAgo', { count: Math.floor(diff / 3600000) })
    return new Date(timestamp).toLocaleDateString('zh-CN')
  }

  // ==================== Provider 操作 ====================

  const handleCreate = () => {
    setForm(EMPTY_PROVIDER)
    setEditingProvider(null)
    setIsCreating(true)
    setFetchError(null)
    setFetchSuccess(null)
    setFetchedModels([])
    setSelectedModelId('')
    setManualModelId('')
    setIsManualMode(false)
    setProviderType('remote')
    setRequestConfig({})
    setLocalConfig({})
    setCustomHeadersText('')
  }

  const handleEdit = (provider: AIProvider) => {
    setForm({
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      isDefault: provider.isDefault,
      type: provider.type
    })
    setEditingProvider(provider)
    setIsCreating(true)
    setFetchError(null)
    setFetchSuccess(null)
  }

  // 从对话页跳转时，直接打开指定 AI 源的编辑页（同一 ID 只自动打开一次）
  useEffect(() => {
    if (!initialEditingProviderId || isCreating) return
    if (appliedInitialEditIdRef.current === initialEditingProviderId) return
    const provider = providers.find((p) => p.id === initialEditingProviderId)
    if (provider) {
      appliedInitialEditIdRef.current = initialEditingProviderId
      handleEdit(provider)
    }
  }, [initialEditingProviderId, providers, isCreating])

  const handleSave = () => {
    if (!form.name.trim() || !form.baseUrl.trim()) return

    // 构建请求配置
    const finalRequestConfig: ProviderRequestConfig = {
      ...requestConfig,
      customHeaders: parseCustomHeaders(customHeadersText)
    }

    const finalModelId = isManualMode ? manualModelId.trim() : selectedModelId
    const allModels = isManualMode
      ? (manualModelId.trim()
          ? [...fetchedModels, { id: manualModelId.trim(), name: manualModelId.trim() }]
          : fetchedModels)
      : fetchedModels

    if (editingProvider) {
      updateProvider({
        id: editingProvider.id,
        ...form,
        type: providerType,
        models: allModels,
        defaultModelId: finalModelId || undefined,
        requestConfig: finalRequestConfig,
        localConfig: providerType === 'local' ? localConfig : undefined
      })
    } else {
      const newProvider = addProvider({
        ...form,
        type: providerType,
        models: allModels,
        requestConfig: finalRequestConfig,
        localConfig: providerType === 'local' ? localConfig : undefined
      })
      if (finalModelId) {
        updateProvider({
          id: newProvider.id,
          defaultModelId: finalModelId
        })
      }
    }
    setIsCreating(false)
    setEditingProvider(null)
  }

  const handleCancel = () => {
    setIsCreating(false)
    setEditingProvider(null)
    setFetchError(null)
    setFetchSuccess(null)
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: t('settings.deleteAiProvider'),
      message: t('settings.deleteAiProviderConfirm'),
      confirmLabel: t('common.delete'),
      variant: 'danger',
    })
    if (ok) {
      deleteProvider(id)
    }
  }

  const handleManualRefresh = async () => {
    if (!form.baseUrl.trim()) return
    setFetching(true)
    setFetchError(null)
    try {
      const models = await fetchModelsFromUrl(form.baseUrl, form.apiKey)
      setFetchedModels(models)
      setFetchSuccess(t('settings.fetchSuccess', { count: models.length }))
      if (models.length > 0 && !selectedModelId) {
        setSelectedModelId(models[0].id)
      }
      setIsManualMode(false)
      setTimeout(() => setFetchSuccess(null), 3000)
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : t('settings.fetchFailed'))
      setTimeout(() => setFetchError(null), 5000)
    } finally {
      setFetching(false)
    }
  }

  const handleTestConnection = async (providerId: string) => {
    try {
      await checkConnection(providerId)
    } catch {
      // 错误已在 store 中处理
    }
  }

  const handlePresetSelect = (preset: typeof PROVIDER_PRESETS[0]) => {
    setForm({ ...form, name: preset.name, baseUrl: preset.baseUrl })
    setProviderType(preset.type)
  }

  // 过滤模型列表
  const filteredModels = modelSearch
    ? fetchedModels.filter((m) =>
        m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.name.toLowerCase().includes(modelSearch.toLowerCase())
      )
    : fetchedModels

  // 获取选中模型的显示名称
  const getSelectedModelDisplay = () => {
    if (isManualMode && manualModelId) return manualModelId
    if (!selectedModelId) return t('settings.selectModelPlaceholder')
    const model = fetchedModels.find((m) => m.id === selectedModelId)
    return model ? `${model.name} (${model.id})` : selectedModelId
  }

  // ==================== 编辑表单 ====================

  if (isCreating) {
    return (
      <div className="flex flex-col h-full">
        {/* 标题 */}
        <div className="flex-shrink-0 px-1 pb-4">
          <SettingsHeader
            icon={Globe}
            title={editingProvider ? t('settings.editAiProvider') : t('settings.addAiProvider')}
            actions={
              <button
                onClick={handleCancel}
                className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
              >
                <X size={18} />
              </button>
            }
          />
        </div>

        {/* 表单 — 可滚动区域 */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
        {/* 快速预设 */}
        {!editingProvider && (
          <div className="flex flex-wrap gap-2">
            {PROVIDER_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handlePresetSelect(preset)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-surface-200/80 dark:border-surface-700/60 hover:border-accent-300 dark:hover:border-accent-600 hover:bg-accent-50/50 dark:hover:bg-accent-950/20 transition-all"
              >
                {preset.type === 'local' ? <Home size={12} /> : <Globe size={12} />}
                {preset.name}
              </button>
            ))}
          </div>
        )}

        {/* 表单卡片 */}
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-4">
          {/* Provider 类型 */}
          <div>
            <label className="block text-xs text-muted mb-1.5">{t('settings.type')}</label>
            <div className="flex gap-2">
              <button
                onClick={() => setProviderType('remote')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg border transition-all ${
                  providerType === 'remote'
                    ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400'
                    : 'border-surface-200/80 dark:border-surface-700/60 text-muted hover:border-accent-300'
                }`}
              >
                <Globe size={14} />
                {t('settings.remoteApi')}
              </button>
              <button
                onClick={() => setProviderType('local')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg border transition-all ${
                  providerType === 'local'
                    ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400'
                    : 'border-surface-200/80 dark:border-surface-700/60 text-muted hover:border-accent-300'
                }`}
              >
                <Home size={14} />
                {t('settings.localModel')}
              </button>
            </div>
          </div>

          {/* 名称 */}
          <div>
            <label className="block text-xs text-muted mb-1.5">
              <Server size={12} className="inline mr-1" />{t('settings.nameRequired')}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('settings.namePlaceholder')}
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all"
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs text-muted mb-1.5">
              <Link size={12} className="inline mr-1" />{t('settings.baseUrlRequired')}
            </label>
            <input
              type="text"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder={providerType === 'local' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1'}
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all font-mono"
            />
          </div>

          {/* API Key (远程模式才显示) */}
          {providerType === 'remote' && (
            <div>
              <label className="block text-xs text-muted mb-1.5">
                <Key size={12} className="inline mr-1" />{t('settings.apiKey')}
              </label>
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder={t('settings.apiKeyPlaceholder')}
                className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all"
              />
            </div>
          )}

          {/* 本地模型配置 */}
          {providerType === 'local' && (
            <div className="bg-surface-50 dark:bg-surface-900/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-surface-700 dark:text-surface-300">
                <Terminal size={14} />
                {t('settings.localModelConfig')}
              </div>
              <div>
                <label className="block text-[11px] text-muted mb-1">{t('settings.launchCommand')}</label>
                <input
                  type="text"
                  value={localConfig.launchCommand || ''}
                  onChange={(e) => setLocalConfig({ ...localConfig, launchCommand: e.target.value })}
                  placeholder={t('settings.launchCommandPlaceholder')}
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-surface-800 border border-surface-200/80 dark:border-surface-700/60 rounded-lg focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all font-mono"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] text-muted mb-1">{t('settings.port')}</label>
                  <input
                    type="number"
                    value={localConfig.port || ''}
                    onChange={(e) => setLocalConfig({ ...localConfig, port: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="11434"
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-surface-800 border border-surface-200/80 dark:border-surface-700/60 rounded-lg focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all font-mono"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localConfig.autoStart || false}
                      onChange={(e) => setLocalConfig({ ...localConfig, autoStart: e.target.checked })}
                      className="rounded border-surface-300 dark:border-surface-600 text-accent-500 focus:ring-accent-500/30"
                    />
                    <span className="text-xs text-muted">{t('settings.autoStart')}</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* 模型选择 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted">
                <Check size={12} className="inline mr-1" />{t('settings.defaultModel')}
              </label>
              <div className="flex items-center gap-2">
                {fetching && (
                  <span className="flex items-center gap-1 text-[10px] text-accent-500">
                    <Loader2 size={10} className="animate-spin" /> {t('settings.fetchingModels')}
                  </span>
                )}
                <button
                  onClick={handleManualRefresh}
                  disabled={fetching || !form.baseUrl.trim()}
                  className="flex items-center gap-1 text-[10px] text-accent-500 hover:text-accent-600 disabled:opacity-40 transition-colors"
                  title={t('settings.refreshModels')}
                >
                  <RefreshCw size={10} /> {t('settings.refresh')}
                </button>
                <button
                  onClick={() => setIsManualMode(!isManualMode)}
                  className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                    isManualMode
                      ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400'
                      : 'text-muted hover:text-surface-600 dark:hover:text-surface-400'
                  }`}
                  title={t('settings.toggleManualMode')}
                >
                  <Keyboard size={10} /> {t('settings.manual')}
                </button>
              </div>
            </div>

            {isManualMode ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={manualModelId}
                  onChange={(e) => setManualModelId(e.target.value)}
                  placeholder={t('settings.manualModelIdPlaceholder')}
                  className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all font-mono"
                />
                {fetchedModels.length > 0 && (
                  <p className="text-[10px] text-muted">
                    {t('settings.modelsFetchedHint', { count: fetchedModels.length })}
                  </p>
                )}
              </div>
            ) : (
              <div ref={dropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                  disabled={fetching}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all text-left disabled:opacity-50"
                >
                  <span className={`truncate font-mono text-xs ${selectedModelId ? 'text-surface-700 dark:text-surface-300' : 'text-muted'}`}>
                    {getSelectedModelDisplay()}
                  </span>
                  <ChevronDown size={14} className={`text-muted transition-transform flex-shrink-0 ml-1 ${modelDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {modelDropdownOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-white dark:bg-surface-800 border border-surface-200/80 dark:border-surface-700/60 rounded-xl shadow-xl overflow-hidden">
                    {fetchedModels.length > 5 && (
                      <div className="px-2.5 py-2 border-b border-surface-100 dark:border-surface-700/40">
                        <div className="relative">
                          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
                          <input
                            type="text"
                            value={modelSearch}
                            onChange={(e) => setModelSearch(e.target.value)}
                            placeholder={t('settings.searchModels')}
                            className="w-full pl-7 pr-2 py-1 text-xs bg-surface-50 dark:bg-surface-900 border border-surface-200/60 dark:border-surface-700/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-500/30"
                            autoFocus
                          />
                        </div>
                      </div>
                    )}
                    <div className="max-h-52 overflow-y-auto">
                      {filteredModels.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-muted text-center">
                          {fetchedModels.length === 0 ? t('settings.noModelsYet') : t('settings.noMatchingModels')}
                        </div>
                      ) : (
                        filteredModels.map((model) => (
                          <div
                            key={model.id}
                            onClick={() => {
                              setSelectedModelId(model.id)
                              setModelDropdownOpen(false)
                              setModelSearch('')
                            }}
                            className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                              selectedModelId === model.id
                                ? 'bg-accent-50 dark:bg-accent-950/30'
                                : 'hover:bg-surface-50 dark:hover:bg-surface-800/80'
                            } ${model.unavailable ? 'opacity-50' : ''} ${model.deprecated ? 'line-through' : ''}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className={`text-xs truncate ${selectedModelId === model.id ? 'text-accent-700 dark:text-accent-300 font-medium' : 'text-surface-700 dark:text-surface-300'}`}>
                                {model.name}
                                {model.deprecated && <span className="ml-1 text-[10px] text-orange-500">{t('settings.deprecated')}</span>}
                                {model.unavailable && <span className="ml-1 text-[10px] text-red-500">{t('settings.unavailable')}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                {model.id !== model.name && (
                                  <span className="text-[10px] text-muted truncate font-mono">{model.id}</span>
                                )}
                                {model.tags && model.tags.length > 0 && (
                                  <div className="flex gap-1">
                                    {model.tags.map((tag) => (
                                      <span key={tag} className="text-[9px] px-1 py-0.5 bg-surface-100 dark:bg-surface-700 rounded text-muted">
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            {selectedModelId === model.id && (
                              <Check size={12} className="text-accent-500 flex-shrink-0 ml-1" />
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 状态提示 */}
          {fetchError && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">
              <AlertCircle size={14} /> {fetchError}
            </div>
          )}
          {fetchSuccess && (
            <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 dark:bg-green-950/30 px-3 py-2 rounded-lg">
              <CheckCircle size={14} /> {fetchSuccess}
            </div>
          )}

          {/* 高级配置折叠 */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
            >
              <ChevronRight size={12} className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
              <Settings size={12} />
              {t('settings.advancedConfig')}
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4 pl-4 border-l-2 border-surface-200/80 dark:border-surface-700/60">
                {/* 请求超时 */}
                <div>
                  <label className="block text-[11px] text-muted mb-1">{t('settings.requestTimeout')}</label>
                  <input
                    type="number"
                    value={requestConfig.timeout || ''}
                    onChange={(e) => setRequestConfig({ ...requestConfig, timeout: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="30000"
                    className="w-full px-3 py-1.5 text-xs bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-lg focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all font-mono"
                  />
                </div>

                {/* 重试次数 */}
                <div>
                  <label className="block text-[11px] text-muted mb-1">{t('settings.maxRetries')}</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={requestConfig.maxRetries ?? ''}
                    onChange={(e) => setRequestConfig({ ...requestConfig, maxRetries: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="0"
                    className="w-full px-3 py-1.5 text-xs bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-lg focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all font-mono"
                  />
                </div>

                {/* API 请求频率限制 */}
                <div>
                  <label className="block text-[11px] text-muted mb-1">{t('settings.minRequestIntervalSeconds')}</label>
                  <input
                    type="number"
                    min="0"
                    max="3600"
                    step="1"
                    value={requestConfig.minRequestIntervalSeconds ?? 0}
                    onChange={(e) => {
                      const raw = e.target.value
                      const parsed = raw === '' ? 0 : parseInt(raw, 10)
                      setRequestConfig({
                        ...requestConfig,
                        minRequestIntervalSeconds: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
                      })
                    }}
                    placeholder="0"
                    className="w-full px-3 py-1.5 text-xs bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-lg focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all font-mono"
                  />
                  <p className="text-[10px] text-muted mt-1">{t('settings.minRequestIntervalSecondsHint')}</p>
                </div>

                {/* 自定义 Headers */}
                <div>
                  <label className="block text-[11px] text-muted mb-1">{t('settings.customHeadersHint')}</label>
                  <textarea
                    value={customHeadersText}
                    onChange={(e) => setCustomHeadersText(e.target.value)}
                    placeholder={"X-Custom-Header: value\nAnother-Header: value2"}
                    rows={3}
                    className="w-full px-3 py-1.5 text-xs bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-lg focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all font-mono resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 模型管理折叠（编辑模式才显示） */}
          {editingProvider && fetchedModels.length > 0 && (
            <div>
              <button
                onClick={() => setShowModelManager(!showModelManager)}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
              >
                <ChevronRight size={12} className={`transition-transform ${showModelManager ? 'rotate-90' : ''}`} />
                <Tag size={12} />
                {t('settings.modelManager', { count: fetchedModels.length })}
              </button>

              {showModelManager && (
                <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                  {fetchedModels.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center gap-2 px-3 py-2 bg-surface-50 dark:bg-surface-900/50 rounded-lg text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono truncate">{model.id}</span>
                          {model.deprecated && (
                            <span className="text-[9px] px-1 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded">{t('settings.deprecated')}</span>
                          )}
                          {model.unavailable && (
                            <span className="text-[9px] px-1 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">{t('settings.unavailable')}</span>
                          )}
                        </div>
                        {/* 标签 */}
                        <div className="flex items-center gap-1 mt-1">
                          {model.tags?.map((tag) => (
                            <span key={tag} className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 rounded">
                              {tag}
                              <button
                                onClick={() => {
                                  const newTags = (model.tags || []).filter(t => t !== tag)
                                  setFetchedModels(prev => prev.map(m => m.id === model.id ? { ...m, tags: newTags } : m))
                                  if (editingProvider) updateModel(editingProvider.id, model.id, { tags: newTags })
                                }}
                                className="hover:text-red-500"
                              >
                                <X size={8} />
                              </button>
                            </span>
                          ))}
                          {editingModelTags === model.id ? (
                            <input
                              type="text"
                              value={modelTagInput}
                              onChange={(e) => setModelTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && modelTagInput.trim()) {
                                  const newTags = [...(model.tags || []), modelTagInput.trim()]
                                  setFetchedModels(prev => prev.map(m => m.id === model.id ? { ...m, tags: newTags } : m))
                                  if (editingProvider) updateModel(editingProvider.id, model.id, { tags: newTags })
                                  setModelTagInput('')
                                  setEditingModelTags(null)
                                } else if (e.key === 'Escape') {
                                  setEditingModelTags(null)
                                }
                              }}
                              onBlur={() => setEditingModelTags(null)}
                              placeholder={t('settings.tagInputPlaceholder')}
                              className="w-16 px-1 py-0.5 text-[9px] bg-white dark:bg-surface-800 border border-surface-300 dark:border-surface-600 rounded focus:outline-none"
                              autoFocus
                            />
                          ) : (
                            <button
                              onClick={() => setEditingModelTags(model.id)}
                              className="text-[9px] text-muted hover:text-accent-500 transition-colors"
                            >
                              {t('settings.addTag')}
                            </button>
                          )}
                        </div>
                        {/* Context Window */}
                        <div className="flex items-center gap-1 mt-1">
                          <Hash size={9} className="text-muted" />
                          {editingModelContext === model.id ? (
                            <input
                              type="number"
                              value={contextWindowInput}
                              onChange={(e) => setContextWindowInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const cw = contextWindowInput ? parseInt(contextWindowInput) : undefined
                                  setFetchedModels(prev => prev.map(m => m.id === model.id ? { ...m, contextWindow: cw } : m))
                                  if (editingProvider) updateModel(editingProvider.id, model.id, { contextWindow: cw })
                                  setEditingModelContext(null)
                                } else if (e.key === 'Escape') {
                                  setEditingModelContext(null)
                                }
                              }}
                              onBlur={() => setEditingModelContext(null)}
                              placeholder={t('settings.contextWindow')}
                              className="w-20 px-1 py-0.5 text-[9px] bg-white dark:bg-surface-800 border border-surface-300 dark:border-surface-600 rounded focus:outline-none font-mono"
                              autoFocus
                            />
                          ) : (
                            <button
                              onClick={() => {
                                setEditingModelContext(model.id)
                                setContextWindowInput(model.contextWindow?.toString() || '')
                              }}
                              className="text-[9px] text-muted hover:text-accent-500 transition-colors"
                            >
                              {model.contextWindow ? `${model.contextWindow.toLocaleString()} tokens` : t('settings.setContextWindow')}
                            </button>
                          )}
                        </div>
                      </div>
                      {/* 操作按钮 */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => {
                            const newVal = !model.deprecated
                            setFetchedModels(prev => prev.map(m => m.id === model.id ? { ...m, deprecated: newVal } : m))
                            if (editingProvider) updateModel(editingProvider.id, model.id, { deprecated: newVal })
                          }}
                          className={`p-1 rounded transition-colors ${model.deprecated ? 'text-orange-500' : 'text-muted hover:text-orange-500'}`}
                          title={model.deprecated ? t('settings.unmarkDeprecated') : t('settings.markDeprecated')}
                        >
                          <AlertTriangle size={12} />
                        </button>
                        <button
                          onClick={() => {
                            const newVal = !model.unavailable
                            setFetchedModels(prev => prev.map(m => m.id === model.id ? { ...m, unavailable: newVal } : m))
                            if (editingProvider) updateModel(editingProvider.id, model.id, { unavailable: newVal })
                          }}
                          className={`p-1 rounded transition-colors ${model.unavailable ? 'text-red-500' : 'text-muted hover:text-red-500'}`}
                          title={model.unavailable ? t('settings.markAvailable') : t('settings.markUnavailable')}
                        >
                          {model.unavailable ? <XCircle size={12} /> : <WifiOff size={12} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        </div>

        {/* Sticky 底部保存栏 */}
        <SettingsSaveBar
          onSave={handleSave}
          isDirty={form.name.trim().length > 0 && form.baseUrl.trim().length > 0}
          saveLabel={editingProvider ? t('settings.saveChanges') : t('settings.addAiProvider')}
          onReset={handleCancel}
          resetLabel={t('settings.cancel')}
        />
      </div>
    )
  }

  // ==================== 列表视图 ====================

  return (
    <div className="space-y-6">
      {/* 标题 + 操作栏 */}
      <SettingsHeader
        icon={Globe}
        title={t('settings.aiProviderManagement')}
        description={t('settings.aiProviderManagementDescription')}
        actions={
          <>
            <button
              onClick={() => checkAllConnections()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted border border-surface-300 dark:border-surface-600 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              title={t('settings.checkAllConnections')}
            >
              <Zap size={14} /> {t('settings.checkAll')}
            </button>
            <button
              onClick={handleCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
            >
              <Plus size={14} /> {t('settings.addAiProvider')}
            </button>
          </>
        }
      />

      {/* Provider 列表 */}
      {providers.length === 0 ? (
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-8">
          <SettingsEmptyState
            icon={Globe}
            title={t('settings.noProvidersYet')}
            description={t('settings.addProviderHint')}
            iconSize={40}
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 divide-y divide-surface-200/80 dark:divide-surface-700/60">
          {providers.map((provider) => {
            const defaultModel = provider.defaultModelId
              ? provider.models.find((m) => m.id === provider.defaultModelId)
              : null
            const health = provider.health
            const statusColor = STATUS_COLORS[health?.status || 'unknown']

            return (
              <div
                key={provider.id}
                className="flex items-center gap-3 px-5 py-4 hover:bg-surface-50 dark:hover:bg-surface-900/30 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center flex-shrink-0">
                  {provider.type === 'local' ? (
                    <Home size={16} className="text-accent-600 dark:text-accent-400" />
                  ) : (
                    <Globe size={16} className="text-accent-600 dark:text-accent-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">
                      {provider.name}
                    </span>
                    {provider.isDefault && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 rounded-full font-medium">
                        {t('settings.defaultBadge')}
                      </span>
                    )}
                    {provider.type === 'local' && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full font-medium">
                        {t('settings.localBadge')}
                      </span>
                    )}
                    {/* 连接状态指示器 */}
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${statusColor.bg} ${statusColor.text}`}
                      title={health?.lastError || STATUS_TEXT[health?.status || 'unknown']}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${statusColor.dot}`} />
                      {STATUS_TEXT[health?.status || 'unknown']}
                      {health?.latencyMs && health.status === 'online' && (
                        <span className="ml-0.5 opacity-70">{health.latencyMs}ms</span>
                      )}
                    </span>
                  </div>
                  <div className="text-xs text-muted truncate font-mono">{provider.baseUrl}</div>
                  <div className="flex items-center gap-3 text-[10px] text-muted mt-0.5">
                    <span>
                      {t('settings.modelSelected', { name: defaultModel ? defaultModel.name : provider.defaultModelId || t('settings.noModelSelected') })}
                      {provider.models.length > 0 && ` (${t('settings.modelCount', { count: provider.models.length })})`}
                    </span>
                    {provider.modelsFetchedAt && (
                      <span className="opacity-70">
                        {t('settings.lastFetched', { time: formatTime(provider.modelsFetchedAt) })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* 测试连接 */}
                  <button
                    onClick={() => handleTestConnection(provider.id)}
                    disabled={health?.status === 'checking'}
                    className="p-1.5 rounded-lg text-muted hover:text-accent-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all disabled:opacity-50"
                    title={t('settings.testConnectionTitle')}
                  >
                    {health?.status === 'checking' ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Wifi size={14} />
                    )}
                  </button>
                  <button
                    onClick={() => provider.isDefault ? undefined : setDefaultProvider(provider.id)}
                    className={`p-1.5 rounded-lg transition-all ${
                      provider.isDefault
                        ? 'text-accent-500'
                        : 'text-muted hover:text-accent-500 hover:bg-surface-100 dark:hover:bg-surface-800'
                    }`}
                    title={provider.isDefault ? t('settings.isDefault') : t('settings.setAsDefault')}
                  >
                    {provider.isDefault ? <Star size={14} /> : <StarOff size={14} />}
                  </button>
                  <button
                    onClick={() => handleEdit(provider)}
                    className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
                    title={t('settings.edit')}
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(provider.id)}
                    className="p-1.5 rounded-lg text-muted hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-all"
                    title={t('common.delete')}
                  >
                    <Trash2 size={14} />
                  </button>
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

// ==================== 工具函数 ====================

/**
 * 直接调用 /v1/models 接口拉取模型列表（不走 store，用于预览）
 */
async function fetchModelsFromUrl(baseUrl: string, apiKey: string): Promise<AIModel[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const response = await fetch(url, { headers })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`)
  }

  const data = await response.json()
  const modelList = data.data || data.models || data
  if (!Array.isArray(modelList)) {
    throw new Error('返回格式异常，期望 data 数组')
  }

  return modelList.map((m: { id: string; name?: string; owned_by?: string }) => ({
    id: m.id,
    name: m.name || m.id,
    ownedBy: m.owned_by
  }))
}

/**
 * 检测所有 Provider 连接（列表视图用）
 */
function checkAllConnections() {
  useAIProviderStore.getState().checkAllConnections()
}
