import { useState, useEffect, useRef, useCallback } from 'react'
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
import { useAIProviderStore } from '../../stores/ai-provider-store'
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

export function AIProviderManager() {
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
      setFetchError(error instanceof Error ? error.message : '自动拉取失败，请手动输入')
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
    if (!timestamp) return '从未'
    const now = Date.now()
    const diff = now - timestamp
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
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

  const handleDelete = (id: string) => {
    if (confirm('确定删除此 AI 源？关联的对话将回退到默认配置。')) {
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
      setFetchSuccess(`成功获取 ${models.length} 个模型`)
      if (models.length > 0 && !selectedModelId) {
        setSelectedModelId(models[0].id)
      }
      setIsManualMode(false)
      setTimeout(() => setFetchSuccess(null), 3000)
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : '拉取失败')
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
    if (!selectedModelId) return '选择模型...'
    const model = fetchedModels.find((m) => m.id === selectedModelId)
    return model ? `${model.name} (${model.id})` : selectedModelId
  }

  // ==================== 编辑表单 ====================

  if (isCreating) {
    return (
      <div className="space-y-6">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
            <Globe size={20} className="text-accent-500" />
            {editingProvider ? '编辑 AI 源' : '添加 AI 源'}
          </h2>
          <button
            onClick={handleCancel}
            className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
          >
            <X size={18} />
          </button>
        </div>

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
            <label className="block text-xs text-muted mb-1.5">类型</label>
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
                远程 API
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
                本地模型
              </button>
            </div>
          </div>

          {/* 名称 */}
          <div>
            <label className="block text-xs text-muted mb-1.5">
              <Server size={12} className="inline mr-1" />名称 *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="如 OpenAI、DeepSeek、本地 Ollama"
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all"
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs text-muted mb-1.5">
              <Link size={12} className="inline mr-1" />Base URL *
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
                <Key size={12} className="inline mr-1" />API Key
              </label>
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="sk-...（本地服务可留空）"
                className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all"
              />
            </div>
          )}

          {/* 本地模型配置 */}
          {providerType === 'local' && (
            <div className="bg-surface-50 dark:bg-surface-900/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-surface-700 dark:text-surface-300">
                <Terminal size={14} />
                本地模型配置
              </div>
              <div>
                <label className="block text-[11px] text-muted mb-1">启动命令</label>
                <input
                  type="text"
                  value={localConfig.launchCommand || ''}
                  onChange={(e) => setLocalConfig({ ...localConfig, launchCommand: e.target.value })}
                  placeholder="如 ollama serve"
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-surface-800 border border-surface-200/80 dark:border-surface-700/60 rounded-lg focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all font-mono"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] text-muted mb-1">端口</label>
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
                    <span className="text-xs text-muted">自动启动</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* 模型选择 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted">
                <Check size={12} className="inline mr-1" />默认模型
              </label>
              <div className="flex items-center gap-2">
                {fetching && (
                  <span className="flex items-center gap-1 text-[10px] text-accent-500">
                    <Loader2 size={10} className="animate-spin" /> 拉取中...
                  </span>
                )}
                <button
                  onClick={handleManualRefresh}
                  disabled={fetching || !form.baseUrl.trim()}
                  className="flex items-center gap-1 text-[10px] text-accent-500 hover:text-accent-600 disabled:opacity-40 transition-colors"
                  title="手动刷新模型列表"
                >
                  <RefreshCw size={10} /> 刷新
                </button>
                <button
                  onClick={() => setIsManualMode(!isManualMode)}
                  className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                    isManualMode
                      ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400'
                      : 'text-muted hover:text-surface-600 dark:hover:text-surface-400'
                  }`}
                  title="切换手动输入模式"
                >
                  <Keyboard size={10} /> 手动
                </button>
              </div>
            </div>

            {isManualMode ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={manualModelId}
                  onChange={(e) => setManualModelId(e.target.value)}
                  placeholder="手动输入模型 ID，如 gpt-4o、deepseek-chat"
                  className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all font-mono"
                />
                {fetchedModels.length > 0 && (
                  <p className="text-[10px] text-muted">
                    已获取 {fetchedModels.length} 个模型，可点击"手动"按钮切换到下拉选择
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
                            placeholder="搜索模型..."
                            className="w-full pl-7 pr-2 py-1 text-xs bg-surface-50 dark:bg-surface-900 border border-surface-200/60 dark:border-surface-700/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-500/30"
                            autoFocus
                          />
                        </div>
                      </div>
                    )}
                    <div className="max-h-52 overflow-y-auto">
                      {filteredModels.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-muted text-center">
                          {fetchedModels.length === 0 ? '暂无模型，请先拉取' : '无匹配模型'}
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
                                {model.deprecated && <span className="ml-1 text-[10px] text-orange-500">已弃用</span>}
                                {model.unavailable && <span className="ml-1 text-[10px] text-red-500">不可用</span>}
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
              高级配置
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4 pl-4 border-l-2 border-surface-200/80 dark:border-surface-700/60">
                {/* 请求超时 */}
                <div>
                  <label className="block text-[11px] text-muted mb-1">请求超时（毫秒）</label>
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
                  <label className="block text-[11px] text-muted mb-1">失败重试次数</label>
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

                {/* 自定义 Headers */}
                <div>
                  <label className="block text-[11px] text-muted mb-1">自定义 HTTP 头（每行一个，格式：Key: Value）</label>
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
                模型管理 ({fetchedModels.length})
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
                            <span className="text-[9px] px-1 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded">弃用</span>
                          )}
                          {model.unavailable && (
                            <span className="text-[9px] px-1 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">不可用</span>
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
                              placeholder="输入标签..."
                              className="w-16 px-1 py-0.5 text-[9px] bg-white dark:bg-surface-800 border border-surface-300 dark:border-surface-600 rounded focus:outline-none"
                              autoFocus
                            />
                          ) : (
                            <button
                              onClick={() => setEditingModelTags(model.id)}
                              className="text-[9px] text-muted hover:text-accent-500 transition-colors"
                            >
                              +标签
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
                              placeholder="上下文窗口"
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
                              {model.contextWindow ? `${model.contextWindow.toLocaleString()} tokens` : '设置上下文窗口'}
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
                          title={model.deprecated ? '取消弃用' : '标记弃用'}
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
                          title={model.unavailable ? '标记可用' : '标记不可用'}
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

        {/* 操作按钮 */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!form.name.trim() || !form.baseUrl.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-accent-500 text-white rounded-xl hover:bg-accent-600 disabled:opacity-50 transition-colors text-sm"
          >
            <Save size={14} /> 保存
          </button>
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-muted border border-surface-300 dark:border-surface-600 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    )
  }

  // ==================== 列表视图 ====================

  return (
    <div className="space-y-6">
      {/* 标题 + 操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
            <Globe size={20} className="text-accent-500" />
            AI 源管理
          </h2>
          <p className="text-sm text-muted mt-1">管理 AI 模型服务提供商的接入配置</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => checkAllConnections()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted border border-surface-300 dark:border-surface-600 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            title="检测所有连接"
          >
            <Zap size={14} /> 全部检测
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
          >
            <Plus size={14} /> 添加 AI 源
          </button>
        </div>
      </div>

      {/* Provider 列表 */}
      {providers.length === 0 ? (
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-8">
          <div className="text-center text-muted">
            <Globe size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">还没有配置 AI 源</p>
            <p className="text-xs mt-1">点击"添加 AI 源"开始配置</p>
          </div>
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
                        默认
                      </span>
                    )}
                    {provider.type === 'local' && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full font-medium">
                        本地
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
                      模型：{defaultModel ? defaultModel.name : provider.defaultModelId || '未选择'}
                      {provider.models.length > 0 && ` (${provider.models.length} 个可用)`}
                    </span>
                    {provider.modelsFetchedAt && (
                      <span className="opacity-70">
                        上次拉取：{formatTime(provider.modelsFetchedAt)}
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
                    title="测试连接"
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
                    title={provider.isDefault ? '默认 AI 源' : '设为默认'}
                  >
                    {provider.isDefault ? <Star size={14} /> : <StarOff size={14} />}
                  </button>
                  <button
                    onClick={() => handleEdit(provider)}
                    className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
                    title="编辑"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(provider.id)}
                    className="p-1.5 rounded-lg text-muted hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-all"
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
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
