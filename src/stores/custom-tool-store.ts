import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Tool, ToolCreateInput } from '../types'
import { STORE_VERSIONS } from '../utils/store-migration'

/**
 * 自定义工具持久化 Store
 *
 * 职责：
 * 1. 管理用户自定义工具的 CRUD 操作
 * 2. 持久化到 localStorage
 * 3. 提供工具列表供 agent-engine 和 use-chat 消费
 */
interface CustomToolStore {
  customTools: Tool[]

  addTool: (input: ToolCreateInput) => Tool
  updateTool: (id: string, updates: Partial<Tool>) => void
  deleteTool: (id: string) => void
  toggleTool: (id: string) => void
  getTool: (id: string) => Tool | undefined
}

export const useCustomToolStore = create<CustomToolStore>()(
  persist(
    (set, get) => ({
      customTools: [],

      addTool: (input) => {
        const newTool: Tool = {
          ...input,
          id: `custom:${input.name}_${Date.now()}`,
          isBuiltIn: false,
          isMCP: false
        }
        set((state) => ({
          customTools: [...state.customTools, newTool]
        }))
        return newTool
      },

      updateTool: (id, updates) => {
        set((state) => ({
          customTools: state.customTools.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          )
        }))
      },

      deleteTool: (id) => {
        set((state) => ({
          customTools: state.customTools.filter((t) => t.id !== id)
        }))
      },

      toggleTool: (id) => {
        set((state) => ({
          customTools: state.customTools.map((t) =>
            t.id === id ? { ...t, enabled: !t.enabled } : t
          )
        }))
      },

      getTool: (id) => {
        return get().customTools.find((t) => t.id === id)
      }
    }),
    {
      name: 'custom-tools',
      version: STORE_VERSIONS.CUSTOM_TOOLS,
      migrate: (persistedState: unknown, _version: number) => {
        // 未来版本迁移在此添加
        return persistedState
      }
    }
  )
)
