import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  UIPreferences,
  ThemeMode,
  EmbeddingProviderConfig,
  ChunkingConfig,
  RetrievalConfig,
  CodeHighlightTheme,
  MessageAlignment,
  ShortcutConfig
} from '../types'
import {
  DEFAULT_SHORTCUT_CONFIG,
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_RETRIEVAL_CONFIG
} from '../types'
import { STORE_VERSIONS } from '../utils/store-migration'

const DEFAULT_PREFERENCES: UIPreferences = {
  theme: 'system',
  showTokenUsage: true,
  showTimestamp: true,
  fontSize: 14,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  codeFontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
  codeFontSize: 13,
  codeHighlightTheme: 'github-dark',
  messageAlignment: 'left-right',
  showAvatar: true,
  sidebarCollapsed: false,
  sidebarWidth: 280,
  sendWithEnter: true,
  webSearchEnabled: false,
  enableNotification: true,
  enableSound: false,
  notificationSound: 'default',
  shortcuts: { ...DEFAULT_SHORTCUT_CONFIG },
  /** 被禁用的内置工具 ID 列表（仅 BUILT_IN_TOOLS，运行时过滤） */
  disabledBuiltinToolIds: [] as string[]
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
  setFontSize: (size: number) => void
  setFontFamily: (family: string) => void
  setCodeFontFamily: (family: string) => void
  setCodeFontSize: (size: number) => void
  setCodeHighlightTheme: (theme: CodeHighlightTheme) => void
  setMessageAlignment: (alignment: MessageAlignment) => void
  toggleAvatar: () => void
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
  setSendWithEnter: (value: boolean) => void
  toggleWebSearch: () => void
  setEnableNotification: (value: boolean) => void
  setEnableSound: (value: boolean) => void
  setNotificationSound: (sound: string) => void
  setShortcuts: (shortcuts: ShortcutConfig) => void
  setShortcut: (action: keyof ShortcutConfig, binding: ShortcutConfig[keyof ShortcutConfig]) => void
  setEmbeddingConfig: (config: EmbeddingProviderConfig) => void
  setChunkingConfig: (config: ChunkingConfig) => void
  setRetrievalConfig: (config: RetrievalConfig) => void
  resetPreferences: () => void
  /** 切换某个内置工具的启用状态 */
  toggleBuiltinTool: (toolId: string) => void
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

      setFontFamily: (fontFamily) => set({ fontFamily }),

      setCodeFontFamily: (codeFontFamily) => set({ codeFontFamily }),

      setCodeFontSize: (codeFontSize) => set({ codeFontSize }),

      setCodeHighlightTheme: (codeHighlightTheme) => {
        set({ codeHighlightTheme })
        applyCodeHighlightTheme(codeHighlightTheme)
      },

      setMessageAlignment: (messageAlignment) => set({ messageAlignment }),

      toggleAvatar: () =>
        set((state) => ({ showAvatar: !state.showAvatar })),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSidebarWidth: (sidebarWidth) =>
        set({ sidebarWidth: Math.max(200, Math.min(480, sidebarWidth)) }),

      setSendWithEnter: (sendWithEnter) => set({ sendWithEnter }),

      toggleWebSearch: () =>
        set((state) => ({ webSearchEnabled: !state.webSearchEnabled })),

      setEnableNotification: (enableNotification) => set({ enableNotification }),

      setEnableSound: (enableSound) => set({ enableSound }),

      setNotificationSound: (notificationSound) => set({ notificationSound }),

      setShortcuts: (shortcuts) => set({ shortcuts }),

      setShortcut: (action, binding) =>
        set((state) => ({
          shortcuts: { ...state.shortcuts, [action]: binding }
        })),

      setEmbeddingConfig: (embeddingConfig) => set({ embeddingConfig }),

      setChunkingConfig: (chunkingConfig) => set({ chunkingConfig }),

      setRetrievalConfig: (retrievalConfig) => set({ retrievalConfig }),

      resetPreferences: () => set({
        ...DEFAULT_PREFERENCES,
        embeddingConfig: { type: 'tfidf' },
        chunkingConfig: { ...DEFAULT_CHUNKING_CONFIG },
        retrievalConfig: { ...DEFAULT_RETRIEVAL_CONFIG }
      }),

      toggleBuiltinTool: (toolId) =>
        set((state) => {
          const ids = state.disabledBuiltinToolIds
          const disabled = ids.includes(toolId)
          return {
            disabledBuiltinToolIds: disabled
              ? ids.filter((id) => id !== toolId)
              : [...ids, toolId]
          }
        }),
    }),
    {
      name: 'ui-preferences',
      version: STORE_VERSIONS.SETTINGS,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as SettingsStore
        // v0 → v1: 确保 retrievalConfig 包含新增的混合权重字段
        if (version < 1) {
          state.retrievalConfig = {
            ...DEFAULT_RETRIEVAL_CONFIG,
            ...state.retrievalConfig
          }
        }
        // v1 → v2: 新增 disabledBuiltinToolIds
        if (version < 2) {
          state.disabledBuiltinToolIds = []
        }
        return state
      },
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            applyTheme(state.theme)
            applyCodeHighlightTheme(state.codeHighlightTheme)
            applyCSSVariables(state)
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

/** 应用代码高亮主题 */
function applyCodeHighlightTheme(_theme: CodeHighlightTheme): void {
  // 高亮主题通过 MarkdownRenderer 的动态 CSS import 生效
  // 此处仅触发 re-render，具体实现在 MarkdownRenderer 中
  // 通过 data-code-theme 属性让 CSS 变量生效
  document.documentElement.setAttribute('data-code-theme', _theme)
}

/** 将字体/字号/侧边栏宽度写入 CSS 自定义属性 */
export function applyCSSVariables(prefs: {
  fontFamily: string
  codeFontFamily: string
  fontSize: number
  codeFontSize: number
  sidebarWidth: number
}): void {
  const root = document.documentElement
  root.style.setProperty('--msg-font', prefs.fontFamily)
  root.style.setProperty('--code-font', prefs.codeFontFamily)
  root.style.setProperty('--msg-font-size', `${prefs.fontSize}px`)
  root.style.setProperty('--code-font-size', `${prefs.codeFontSize}px`)
  root.style.setProperty('--sidebar-width', `${prefs.sidebarWidth}px`)
}
