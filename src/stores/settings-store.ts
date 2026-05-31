import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UIPreferences, ThemeMode } from '../types'

const DEFAULT_PREFERENCES: UIPreferences = {
  theme: 'system',
  showTokenUsage: true,
  showTimestamp: true,
  fontSize: 'medium',
  sidebarCollapsed: false,
  sendWithEnter: true
}

interface SettingsStore extends UIPreferences {
  // Actions
  setTheme: (theme: ThemeMode) => void
  toggleTokenUsage: () => void
  toggleTimestamp: () => void
  setFontSize: (size: UIPreferences['fontSize']) => void
  toggleSidebar: () => void
  setSendWithEnter: (value: boolean) => void
  resetPreferences: () => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,

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

      resetPreferences: () => set({ ...DEFAULT_PREFERENCES })
    }),
    {
      name: 'ui-preferences',
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            applyTheme(state.theme)
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
