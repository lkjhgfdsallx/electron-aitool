import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  UIPreferences,
  ThemeMode,
  EmbeddingProviderConfig,
  ChunkingConfig,
  RetrievalConfig
} from '../types'
import {
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_RETRIEVAL_CONFIG
} from '../types'

const DEFAULT_PREFERENCES: UIPreferences = {
  theme: 'system',
  showTokenUsage: true,
  showTimestamp: true,
  fontSize: 'medium',
  sidebarCollapsed: false,
  sendWithEnter: true,
  webSearchEnabled: false
}

interface SettingsStore extends UIPreferences {
  // Embedding 提供者配置
  embeddingConfig: EmbeddingProviderConfig
  // 分块配置
  chunkingConfig: ChunkingConfig
  // 检索配置
  retrievalConfig: RetrievalConfig

  // Actions
  setTheme: (theme: ThemeMode) => void
  toggleTokenUsage: () => void
  toggleTimestamp: () => void
  setFontSize: (size: UIPreferences['fontSize']) => void
  toggleSidebar: () => void
  setSendWithEnter: (value: boolean) => void
  toggleWebSearch: () => void
  setEmbeddingConfig: (config: EmbeddingProviderConfig) => void
  setChunkingConfig: (config: ChunkingConfig) => void
  setRetrievalConfig: (config: RetrievalConfig) => void
  resetPreferences: () => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      embeddingConfig: { type: 'tfidf' },
      chunkingConfig: { ...DEFAULT_CHUNKING_CONFIG },
      retrievalConfig: { ...DEFAULT_RETRIEVAL_CONFIG },

      setTheme: (theme) => {
        set({ theme })
        applyTheme(theme)
      },

      toggleTokenUsage: () =>
        set((state) => ({ showTokenUsage: !state.showTokenUsage })),

      toggleTimestamp: () =>
        set((state) => ({ showTimestamp: !state.showTimestamp })),

      setFontSize: (fontSize) => set({ fontSize }),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSendWithEnter: (sendWithEnter) => set({ sendWithEnter }),

      toggleWebSearch: () =>
        set((state) => ({ webSearchEnabled: !state.webSearchEnabled })),

      setEmbeddingConfig: (embeddingConfig) => set({ embeddingConfig }),

      setChunkingConfig: (chunkingConfig) => set({ chunkingConfig }),

      setRetrievalConfig: (retrievalConfig) => set({ retrievalConfig }),

      resetPreferences: () => set({
        ...DEFAULT_PREFERENCES,
        embeddingConfig: { type: 'tfidf' },
        chunkingConfig: { ...DEFAULT_CHUNKING_CONFIG },
        retrievalConfig: { ...DEFAULT_RETRIEVAL_CONFIG }
      })
    }),
    {
      name: 'ui-preferences',
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            applyTheme(state.theme)
            // 确保旧用户的 retrievalConfig 包含新增的混合权重字段
            state.retrievalConfig = {
              ...DEFAULT_RETRIEVAL_CONFIG,
              ...state.retrievalConfig
            }
          }
        }
      }
    }
  )
)

/** 应用主题到 DOM */
function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    // system
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}
