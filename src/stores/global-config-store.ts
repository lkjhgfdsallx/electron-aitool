import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GlobalConfig } from '../types'
import { DEFAULT_GLOBAL_CONFIG } from '../types'
import { STORE_VERSIONS } from '../utils/store-migration'

interface GlobalConfigStore extends GlobalConfig {
  // Actions
  updateConfig: (config: Partial<GlobalConfig>) => void
  resetConfig: () => void
  setApiKey: (apiKey: string) => void
  setBaseUrl: (baseUrl: string) => void
  setDefaultModel: (model: string) => void
}

export const useGlobalConfigStore = create<GlobalConfigStore>()(
  persist(
    (set) => ({
      ...DEFAULT_GLOBAL_CONFIG,

      updateConfig: (config) =>
        set((state) => ({ ...state, ...config })),

      resetConfig: () => set({ ...DEFAULT_GLOBAL_CONFIG }),

      setApiKey: (apiKey) => set({ apiKey }),
      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setDefaultModel: (defaultModel) => set({ defaultModel })
    }),
    {
      name: 'global-config',
      version: STORE_VERSIONS.GLOBAL_CONFIG,
      migrate: (persistedState: unknown, _version: number) => {
        // 未来版本迁移在此添加
        return persistedState
      }
    }
  )
)
