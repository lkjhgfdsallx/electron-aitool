import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 原始 HTTP 请求调试信息 */
export interface DebugRequestInfo {
  /** 请求唯一ID */
  id: string
  /** 关联的消息ID */
  messageId: string
  /** 关联的对话ID */
  conversationId: string
  /** 请求时间戳 */
  timestamp: number
  /** 请求 URL */
  url: string
  /** 请求方法 */
  method: string
  /** 请求头 */
  requestHeaders: Record<string, string>
  /** 请求体（已 JSON 美化） */
  requestBody: string
  /** 响应头 */
  responseHeaders: Record<string, string>
  /** 响应状态码 */
  responseStatus: number
  /** 响应体（SSE 流原始数据，已 JSON 美化） */
  responseBody: string
  /** Agent 信息（如果是 Agent 请求） */
  agentInfo?: {
    agentId: string
    agentName: string
    isLeader: boolean
  }
}

interface DebugStore {
  /** 是否启用调试模式 */
  debugMode: boolean

  /** 当前活跃的对话ID */
  activeConversationId: string | null

  /** 按消息ID索引的调试信息 */
  debugInfoByMessageId: Record<string, DebugRequestInfo>

  /** 每个对话最大存储数量 */
  maxEntriesPerConversation: number

  /** 设置当前活跃对话（只更新 ID，不清除数据） */
  setActiveConversation: (conversationId: string | null) => void

  /** 添加调试信息 */
  addDebugInfo: (info: DebugRequestInfo) => void

  /** 根据消息ID获取调试信息 */
  getDebugInfo: (messageId: string) => DebugRequestInfo | undefined

  /** 清除所有调试信息 */
  clearAllDebug: () => void

  /** 切换调试模式 */
  toggleDebugMode: () => void

  /** 设置调试模式 */
  setDebugMode: (enabled: boolean) => void
}

interface DebugStorePersisted {
  debugMode: boolean
}

interface DebugStoreTransient {
  activeConversationId: string | null
  debugInfoByMessageId: Record<string, DebugRequestInfo>
  maxEntriesPerConversation: number
  setActiveConversation: (conversationId: string | null) => void
  addDebugInfo: (info: DebugRequestInfo) => void
  getDebugInfo: (messageId: string) => DebugRequestInfo | undefined
  clearAllDebug: () => void
  toggleDebugMode: () => void
  setDebugMode: (enabled: boolean) => void
}

type DebugStoreFull = DebugStorePersisted & DebugStoreTransient

export const useDebugStore = create<DebugStoreFull>()(
  persist(
    (set, get) => ({
      debugMode: false,
      activeConversationId: null,
      debugInfoByMessageId: {},
      maxEntriesPerConversation: 50,

      setActiveConversation: (conversationId) => {
        set({ activeConversationId: conversationId })
      },

      addDebugInfo: (info) => {
        set((state) => {
          const conversationId = info.conversationId
          const entriesForConv = Object.values(state.debugInfoByMessageId)
            .filter((d) => d.conversationId === conversationId)
            .sort((a, b) => a.timestamp - b.timestamp)

          const newMap = { ...state.debugInfoByMessageId }

          if (entriesForConv.length >= state.maxEntriesPerConversation) {
            const oldest = entriesForConv[0]
            delete newMap[oldest.messageId]
          }

          newMap[info.messageId] = info
          return { debugInfoByMessageId: newMap }
        })
      },

      getDebugInfo: (messageId) => {
        return get().debugInfoByMessageId[messageId]
      },

      clearAllDebug: () => {
        set({ debugInfoByMessageId: {} })
      },

      toggleDebugMode: () => {
        set((state) => ({ debugMode: !state.debugMode }))
      },

      setDebugMode: (enabled) => {
        set({ debugMode: enabled })
      }
    }),
    {
      name: 'debug-store',
      partialize: (state) => ({ debugMode: state.debugMode }),
    }
  )
)
