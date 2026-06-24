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
  Search,
  Keyboard
} from 'lucide-react'
import { useAIProviderStore } from '../../stores/ai-provider-store'
import type { AIProvider, AIProviderCreateInput, AIModel } from '../../types'

const EMPTY_PROVIDER: AIProviderCreateInput = {
  name: '',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  isDefault: false
}

export function AIProviderManager() {
  const {
    providers,
    addProvider,
    updateProvider,
    deleteProvider,
    setDefaultProvider,
    fetchProviderModels,
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

  // 自动拉取模型（debounced）：名称、URL、Key 都填写后自动触发
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

  // 当 form.baseUrl 或 form.apiKey 变化时自动拉取（debounced 1s）
  useEffect(() => {
    if (!isCreating) return
    if (!form.baseUrl.trim()) return
    // 有 API Key 或者是本地地址时自动拉取
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

  // 编辑时加载已有模型
  useEffect(() => {
    if (editingProvider) {
      setFetchedModels(editingProvider.models)
      setSelectedModelId(editingProvider.defaultModelId || editingProvider.models[0]?.id || '')
      if (editingProvider.models.length === 0) {
        setIsManualMode(true)
      }
    } else {
      setFetchedModels([])
      setSelectedModelId('')
      setManualModelId('')
      setIsManualMode(false)
    }
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
  }

  const handleEdit = (provider: AIProvider) => {
    setForm({
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      isDefault: provider.isDefault
    })
    setEditingProvider(provider)
    setIsCreating(true)
    setFetchError(null)
    setFetchSuccess(null)
  }

  const handleSave = () => {
    if (!form.name.trim() || !form.baseUrl.trim()) return

    // 确定最终的 defaultModelId
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
        models: allModels,
        defaultModelId: finalModelId || undefined
      })
    } else {
      const newProvider = addProvider({
        ...form,
        models: allModels
      })
      // 设置 defaultModelId
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

        {/* 表单卡片 */}
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-4">
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
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all font-mono"
            />
          </div>

          {/* API Key */}
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
              /* 手动输入模式 */
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
              /* 下拉选择模式 */
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
                    {/* 搜索框 */}
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
                    {/* 模型列表 */}
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
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className={`text-xs truncate ${selectedModelId === model.id ? 'text-accent-700 dark:text-accent-300 font-medium' : 'text-surface-700 dark:text-surface-300'}`}>
                                {model.name}
                              </div>
                              {model.id !== model.name && (
                                <div className="text-[10px] text-muted truncate font-mono">{model.id}</div>
                              )}
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
        <button
          onClick={handleCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
        >
          <Plus size={14} /> 添加 AI 源
        </button>
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
            return (
              <div
                key={provider.id}
                className="flex items-center gap-3 px-5 py-4 hover:bg-surface-50 dark:hover:bg-surface-900/30 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center flex-shrink-0">
                  <Globe size={16} className="text-accent-600 dark:text-accent-400" />
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
                  </div>
                  <div className="text-xs text-muted truncate font-mono">{provider.baseUrl}</div>
                  <div className="text-[10px] text-muted mt-0.5">
                    模型：{defaultModel ? defaultModel.name : provider.defaultModelId || '未选择'}
                    {provider.models.length > 0 && ` (${provider.models.length} 个可用)`}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
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
