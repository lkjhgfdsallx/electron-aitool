import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import type {
  AIProvider,
  AIProviderCreateInput,
  AIProviderUpdateInput,
  AIModel,
  ResolvedAIConfig,
  ConnectionHealth,
  ProviderRequestConfig
} from '../types'
import { useGlobalConfigStore } from './global-config-store'
import { fetchModels, testConnection, fetchModelsWithRetry } from '../services/model-fetcher'
import { STORE_VERSIONS } from '../utils/store-migration'

// ==================== AI Provider Store ====================

interface AIProviderStore {
  providers: AIProvider[]

  // CRUD
  addProvider: (input: AIProviderCreateInput) => AIProvider
  updateProvider: (input: AIProviderUpdateInput) => void
  deleteProvider: (id: string) => void
  getProvider: (id: string) => AIProvider | undefined
  setDefaultProvider: (id: string) => void

  // 模型管理
  fetchProviderModels: (providerId: string) => Promise<AIModel[]>
  addModelToProvider: (providerId: string, model: AIModel) => void
  removeModelFromProvider: (providerId: string, modelId: string) => void
  setProviderModels: (providerId: string, models: AIModel[]) => void
  updateModel: (providerId: string, modelId: string, updates: Partial<AIModel>) => void

  // 连接健康检查
  checkConnection: (providerId: string) => Promise<ConnectionHealth>
  checkAllConnections: () => Promise<void>

  // 请求配置
  updateRequestConfig: (providerId: string, config: Partial<ProviderRequestConfig>) => void

  // 解析配置
  resolveConfig: (providerId?: string, modelId?: string) => ResolvedAIConfig | null
  getRequestConfig: (providerId?: string) => ProviderRequestConfig | undefined

  // 导入导出
  importProviders: (providers: AIProvider[]) => void
  exportProviders: () => AIProvider[]
}

export const useAIProviderStore = create<AIProviderStore>()(
  persist(
    (set, get) => ({
      providers: [],

      // ==================== CRUD ====================

      addProvider: (input) => {
        const provider: AIProvider = {
          ...input,
          id: uuidv4(),
          models: input.models || [],
          type: input.type || (input.baseUrl.includes('localhost') || input.baseUrl.includes('127.0.0.1') ? 'local' : 'remote'),
          health: { status: 'unknown' },
          requestConfig: input.requestConfig || {},
          localConfig: input.localConfig || {},
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        set((state) => ({ providers: [...state.providers, provider] }))

        // 如果是第一个 provider，自动设为默认
        if (get().providers.length === 1) {
          get().setDefaultProvider(provider.id)
        }

        return provider
      },

      updateProvider: (input) => {
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === input.id ? { ...p, ...input, updatedAt: Date.now() } : p
          )
        }))
      },

      deleteProvider: (id) => {
        set((state) => {
          const newProviders = state.providers.filter((p) => p.id !== id)
          // 如果删除的是默认 provider，将第一个设为默认
          const deletedWasDefault = state.providers.find((p) => p.id === id)?.isDefault
          if (deletedWasDefault && newProviders.length > 0) {
            newProviders[0].isDefault = true
          }
          return { providers: newProviders }
        })

        // 如果删除的是全局激活的 provider，切换到剩余的默认
        const globalConfig = useGlobalConfigStore.getState()
        if (globalConfig.activeProviderId === id) {
          const remaining = get().providers
          const defaultProvider = remaining.find((p) => p.isDefault) || remaining[0]
          globalConfig.updateConfig({
            activeProviderId: defaultProvider?.id
          })
        }
      },

      getProvider: (id) => get().providers.find((p) => p.id === id),

      setDefaultProvider: (id) => {
        set((state) => ({
          providers: state.providers.map((p) => ({
            ...p,
            isDefault: p.id === id,
            updatedAt: p.id === id ? Date.now() : p.updatedAt
          }))
        }))

        // 同步更新全局激活状态
        const globalConfig = useGlobalConfigStore.getState()
        globalConfig.updateConfig({
          activeProviderId: id
        })
      },

      // ==================== 模型管理 ====================

      fetchProviderModels: async (providerId) => {
        const provider = get().getProvider(providerId)
        if (!provider) throw new Error('Provider 不存在')

        try {
          const models = await fetchModelsWithRetry(
            provider.baseUrl,
            provider.apiKey,
            undefined,
            provider.requestConfig
          )
          set((state) => ({
            providers: state.providers.map((p) =>
              p.id === providerId
                ? { ...p, models, modelsFetchedAt: Date.now(), updatedAt: Date.now() }
                : p
            )
          }))
          return models
        } catch (error) {
          throw error
        }
      },

      addModelToProvider: (providerId, model) => {
        set((state) => ({
          providers: state.providers.map((p) => {
            if (p.id !== providerId) return p
            // 避免重复添加
            if (p.models.some((m) => m.id === model.id)) return p
            return {
              ...p,
              models: [...p.models, model],
              updatedAt: Date.now()
            }
          })
        }))
      },

      removeModelFromProvider: (providerId, modelId) => {
        set((state) => ({
          providers: state.providers.map((p) => {
            if (p.id !== providerId) return p
            return {
              ...p,
              models: p.models.filter((m) => m.id !== modelId),
              updatedAt: Date.now()
            }
          })
        }))
      },

      setProviderModels: (providerId, models) => {
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === providerId
              ? { ...p, models, modelsFetchedAt: Date.now(), updatedAt: Date.now() }
              : p
          )
        }))
      },

      updateModel: (providerId, modelId, updates) => {
        set((state) => ({
          providers: state.providers.map((p) => {
            if (p.id !== providerId) return p
            return {
              ...p,
              models: p.models.map((m) =>
                m.id === modelId ? { ...m, ...updates } : m
              ),
              updatedAt: Date.now()
            }
          })
        }))
      },

      // ==================== 连接健康检查 ====================

      checkConnection: async (providerId) => {
        const provider = get().getProvider(providerId)
        if (!provider) throw new Error('Provider 不存在')

        // 设置为检查中状态
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === providerId
              ? { ...p, health: { ...p.health, status: 'checking' as const } }
              : p
          )
        }))

        const health = await testConnection(
          provider.baseUrl,
          provider.apiKey,
          provider.requestConfig
        )

        // 更新健康状态
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === providerId
              ? { ...p, health, updatedAt: Date.now() }
              : p
          )
        }))

        return health
      },

      checkAllConnections: async () => {
        const providers = get().providers
        const promises = providers.map((p) =>
          get().checkConnection(p.id).catch(() => undefined)
        )
        await Promise.allSettled(promises)
      },

      // ==================== 请求配置 ====================

      updateRequestConfig: (providerId, config) => {
        set((state) => ({
          providers: state.providers.map((p) => {
            if (p.id !== providerId) return p
            return {
              ...p,
              requestConfig: { ...p.requestConfig, ...config },
              updatedAt: Date.now()
            }
          })
        }))
      },

      // ==================== 解析配置 ====================

      /**
       * 根据 providerId + modelId 解析出完整的 AI 请求配置
       * 优先级：传入参数 > 全局激活 > 默认 provider
       */
      resolveConfig: (providerId, modelId) => {
        const state = get()
        const globalConfig = useGlobalConfigStore.getState()

        // 确定 provider
        let provider: AIProvider | undefined
        if (providerId) {
          provider = state.providers.find((p) => p.id === providerId)
        }
        if (!provider && globalConfig.activeProviderId) {
          provider = state.providers.find((p) => p.id === globalConfig.activeProviderId)
        }
        if (!provider) {
          provider = state.providers.find((p) => p.isDefault) || state.providers[0]
        }

        if (!provider) {
          // 回退到旧的 GlobalConfig（兼容迁移期）
          if (globalConfig.apiKey && globalConfig.baseUrl) {
            return {
              baseUrl: globalConfig.baseUrl,
              apiKey: globalConfig.apiKey,
              model: modelId || globalConfig.defaultModel,
              temperature: globalConfig.temperature,
              maxTokens: globalConfig.maxTokens,
              streamEnabled: globalConfig.streamEnabled
            }
          }
          return null
        }

        // 确定 model：优先使用传入的 modelId，然后用 provider 的 defaultModelId，最后回退到第一个模型
        const finalModelId = modelId
          || provider.defaultModelId
          || provider.models[0]?.id
          || ''

        return {
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: finalModelId,
          temperature: globalConfig.temperature,
          maxTokens: globalConfig.maxTokens,
          streamEnabled: globalConfig.streamEnabled
        }
      },

      /**
       * 获取指定 provider 的请求配置
       */
      getRequestConfig: (providerId) => {
        const state = get()
        const globalConfig = useGlobalConfigStore.getState()

        let provider: AIProvider | undefined
        if (providerId) {
          provider = state.providers.find((p) => p.id === providerId)
        }
        if (!provider && globalConfig.activeProviderId) {
          provider = state.providers.find((p) => p.id === globalConfig.activeProviderId)
        }
        if (!provider) {
          provider = state.providers.find((p) => p.isDefault) || state.providers[0]
        }

        return provider?.requestConfig
      },

      // ==================== 导入导出 ====================

      importProviders: (providers) => {
        set((state) => {
          const existingIds = new Set(state.providers.map((p) => p.id))
          const newProviders = providers.filter((p) => !existingIds.has(p.id))
          return { providers: [...state.providers, ...newProviders] }
        })
      },

      exportProviders: () => get().providers
    }),
    {
      name: 'ai-providers',
      version: STORE_VERSIONS.AI_PROVIDERS,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as { providers: AIProvider[] }
        if (version < 1) {
          // v0 → v1: 为现有 provider 添加新字段的默认值
          if (state.providers && state.providers.length > 0) {
            state.providers = state.providers.map((p) => ({
              ...p,
              type: p.type || (p.baseUrl.includes('localhost') || p.baseUrl.includes('127.0.0.1') ? 'local' : 'remote'),
              health: p.health || { status: 'unknown' },
              requestConfig: p.requestConfig || {},
              localConfig: p.localConfig || {},
              models: p.models.map((m) => ({
                ...m,
                tags: m.tags || [],
                deprecated: m.deprecated || false,
                unavailable: m.unavailable || false
              }))
            }))
          }
        }
        return state
      },
      onRehydrateStorage: () => {
        return (state) => {
          if (!state) return
          // 数据迁移：如果 providers 为空，但旧的 GlobalConfig 有 apiKey+baseUrl，自动迁移为首个 provider
          if (state.providers.length === 0) {
            const globalConfig = useGlobalConfigStore.getState()
            if (globalConfig.apiKey && globalConfig.baseUrl) {
              const isLocal = globalConfig.baseUrl.includes('localhost') || globalConfig.baseUrl.includes('127.0.0.1')
              const migratedProvider: AIProvider = {
                id: 'migrated-default',
                name: '默认',
                baseUrl: globalConfig.baseUrl,
                apiKey: globalConfig.apiKey,
                type: isLocal ? 'local' : 'remote',
                models: globalConfig.defaultModel
                  ? [{ id: globalConfig.defaultModel, name: globalConfig.defaultModel }]
                  : [],
                defaultModelId: globalConfig.defaultModel || undefined,
                isDefault: true,
                health: { status: 'unknown' },
                requestConfig: {},
                localConfig: {},
                createdAt: Date.now(),
                updatedAt: Date.now()
              }
              state.providers = [migratedProvider]
              // 同步设置全局激活状态
              globalConfig.updateConfig({
                activeProviderId: migratedProvider.id
              })
            }
          }
        }
      }
    }
  )
)
