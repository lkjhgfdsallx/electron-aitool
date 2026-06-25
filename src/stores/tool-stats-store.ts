import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ToolCallStats } from '../types'
import { STORE_VERSIONS } from '../utils/store-migration'

/**
 * 工具使用统计 Store
 *
 * 职责：
 * 1. 记录每次工具调用的耗时和成功/失败
 * 2. 持久化到 localStorage
 * 3. 提供统计数据供 UI 消费
 */
interface ToolStatsStore {
  stats: Record<string, ToolCallStats>

  /** 记录一次工具调用 */
  recordCall: (toolName: string, success: boolean, durationMs: number) => void
  /** 获取单个工具的统计 */
  getStats: (toolName: string) => ToolCallStats | null
  /** 获取所有工具统计（按调用次数降序） */
  getAllStats: () => ToolCallStats[]
  /** 重置统计（不传则重置全部） */
  resetStats: (toolName?: string) => void
}

export const useToolStatsStore = create<ToolStatsStore>()(
  persist(
    (set, get) => ({
      stats: {},

      recordCall: (toolName, success, durationMs) => {
        set((state) => {
          const existing = state.stats[toolName]
          if (existing) {
            return {
              stats: {
                ...state.stats,
                [toolName]: {
                  ...existing,
                  callCount: existing.callCount + 1,
                  successCount: existing.successCount + (success ? 1 : 0),
                  failureCount: existing.failureCount + (success ? 0 : 1),
                  totalDurationMs: existing.totalDurationMs + durationMs,
                  lastCalledAt: Date.now()
                }
              }
            }
          }
          return {
            stats: {
              ...state.stats,
              [toolName]: {
                toolName,
                callCount: 1,
                successCount: success ? 1 : 0,
                failureCount: success ? 0 : 1,
                totalDurationMs: durationMs,
                lastCalledAt: Date.now()
              }
            }
          }
        })
      },

      getStats: (toolName) => {
        return get().stats[toolName] ?? null
      },

      getAllStats: () => {
        return Object.values(get().stats).sort((a, b) => b.callCount - a.callCount)
      },

      resetStats: (toolName) => {
        if (toolName) {
          set((state) => {
            const { [toolName]: _, ...rest } = state.stats
            return { stats: rest }
          })
        } else {
          set({ stats: {} })
        }
      }
    }),
    {
      name: 'tool-stats',
      version: STORE_VERSIONS.TOOL_STATS,
      migrate: (persistedState: unknown, _version: number) => {
        // 未来版本迁移在此添加
        return persistedState
      }
    }
  )
)
