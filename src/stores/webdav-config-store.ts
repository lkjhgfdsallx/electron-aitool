import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WebDAVConfig } from '../types/webdav'
import { DEFAULT_WEBDAV_CONFIG } from '../types/webdav'

interface WebDAVConfigStore extends WebDAVConfig {
  // Actions
  updateConfig: (config: Partial<WebDAVConfig>) => void
  setConnectionStatus: (status: WebDAVConfig['connectionStatus'], error?: string) => void
  updateLastBackup: (status: 'success' | 'error', error?: string, remoteFile?: string) => void
  resetConfig: () => void
  getDefaultBackupOptions: () => import('../types/webdav').BackupOptions | undefined
}

// 辅助函数：统一处理可选字段
function safeMerge<T extends object>(state: T, partial: Partial<T>): T {
  return { ...state, ...partial }
}

export const useWebDAVConfigStore = create<WebDAVConfigStore>()(
  persist(
    (set) => ({
      ...DEFAULT_WEBDAV_CONFIG,

      updateConfig: (config) => set((state) => ({ ...state, ...config })),

      setConnectionStatus: (status, error) =>
        set((state) => ({
          ...state,
          connectionStatus: status,
          connectionError: error ?? null
        })),

      updateLastBackup: (status, error, remoteFile) =>
        set((state) => ({
          ...state,
          lastBackupAt: Date.now(),
          lastBackupStatus: status,
          lastBackupError: error ?? null,
          lastRemoteFile: remoteFile ?? state.lastRemoteFile
        })),

      resetConfig: () => set({ ...DEFAULT_WEBDAV_CONFIG }),

      getDefaultBackupOptions: () => ({
        ...DEFAULT_WEBDAV_CONFIG.defaultBackupOptions
      })
    }),
    {
      name: 'webdav-config',
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as WebDAVConfig
        if (version < 1) {
          // future migrations here
        }
        return state
      }
    }
  )
)
