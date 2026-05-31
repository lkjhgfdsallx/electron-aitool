import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GlobalConfig } from '../types'
import { DEFAULT_GLOBAL_CONFIG } from '../types'

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
      name: 'global-config'
    }
  )
)
