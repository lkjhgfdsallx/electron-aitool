import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 原始 HTTP 请求调试信息（同一 message 可有多条） */
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
  /** 请求体 */
  requestBody: string
  /** 响应头 */
  responseHeaders: Record<string, string>
  /** 响应状态码 */
  responseStatus: number
  /** 响应体（SSE 流原始数据） */
  responseBody: string
  /** Agent 信息（如果是 Agent 请求） */
  agentInfo?: {
    agentId: string
    agentName: string
    isLeader: boolean
    avatar?: string
  }
  /** 同一 message 内追加顺序，从 1 起（由 store 自动填充） */
  sequence: number
  /** 该 Agent 在本 run 内的 LLM 轮次，从 1 起 */
  roundIndex?: number
  /** 可选：关联 agent run */
  runId?: string
  /** 与 agentSteps.sourceAgentId 对齐 */
  sourceAgentId?: string
}

/** 写入 store 时 sequence 可选（由 addDebugInfo 自动生成） */
export type DebugRequestInfoInput = Omit<DebugRequestInfo, 'sequence'> & {
  sequence?: number
}

interface DebugStorePersisted {
  debugMode: boolean
}

interface DebugStoreTransient {
  activeConversationId: string | null
  /** 主键 id */
  entriesById: Record<string, DebugRequestInfo>
  /** messageId -> 有序 id 列表 */
  entryIdsByMessageId: Record<string, string[]>
  maxEntriesPerMessage: number
  maxEntriesPerConversation: number
  setActiveConversation: (conversationId: string | null) => void
  addDebugInfo: (info: DebugRequestInfoInput) => void
  /** 兼容：返回该消息最新一条 */
  getDebugInfo: (messageId: string) => DebugRequestInfo | undefined
  getDebugInfos: (messageId: string) => DebugRequestInfo[]
  getDebugInfoById: (id: string) => DebugRequestInfo | undefined
  getDebugCount: (messageId: string) => number
  clearMessageDebug: (messageId: string) => void
  clearAllDebug: () => void
  toggleDebugMode: () => void
  setDebugMode: (enabled: boolean) => void
}

type DebugStoreFull = DebugStorePersisted & DebugStoreTransient

function removeEntryFromState(
  entriesById: Record<string, DebugRequestInfo>,
  entryIdsByMessageId: Record<string, string[]>,
  entryId: string
): void {
  const entry = entriesById[entryId]
  if (!entry) return
  delete entriesById[entryId]
  const ids = entryIdsByMessageId[entry.messageId]
  if (!ids) return
  const next = ids.filter((id) => id !== entryId)
  if (next.length === 0) {
    delete entryIdsByMessageId[entry.messageId]
  } else {
    entryIdsByMessageId[entry.messageId] = next
  }
}

export const useDebugStore = create<DebugStoreFull>()(
  persist(
    (set, get) => ({
      debugMode: false,
      activeConversationId: null,
      entriesById: {},
      entryIdsByMessageId: {},
      maxEntriesPerMessage: 30,
      maxEntriesPerConversation: 100,

      setActiveConversation: (conversationId) => {
        set({ activeConversationId: conversationId })
      },

      addDebugInfo: (info) => {
        set((state) => {
          const entriesById = { ...state.entriesById }
          const entryIdsByMessageId = { ...state.entryIdsByMessageId }
          // 深拷贝当前 message 的 id 列表，避免与其它 message 共享引用
          for (const mid of Object.keys(entryIdsByMessageId)) {
            entryIdsByMessageId[mid] = [...entryIdsByMessageId[mid]]
          }

          const existingIds = entryIdsByMessageId[info.messageId] ?? []
          const sequence = info.sequence ?? existingIds.length + 1
          const entry: DebugRequestInfo = {
            ...info,
            sequence,
          }

          // 同 id 重复写入：替换而非追加
          if (entriesById[entry.id]) {
            entriesById[entry.id] = entry
            return { entriesById, entryIdsByMessageId }
          }

          entriesById[entry.id] = entry
          const messageIds = [...existingIds, entry.id]
          entryIdsByMessageId[info.messageId] = messageIds

          // 按 message 上限淘汰最旧
          while (messageIds.length > state.maxEntriesPerMessage) {
            const oldestId = messageIds.shift()!
            removeEntryFromState(entriesById, entryIdsByMessageId, oldestId)
          }

          // 按 conversation 上限淘汰最旧
          const convEntries = Object.values(entriesById)
            .filter((d) => d.conversationId === info.conversationId)
            .sort((a, b) => a.timestamp - b.timestamp || a.sequence - b.sequence)

          let overflow = convEntries.length - state.maxEntriesPerConversation
          for (let i = 0; overflow > 0 && i < convEntries.length; i++, overflow--) {
            // 可能已在 message 淘汰中删除
            if (!entriesById[convEntries[i].id]) {
              overflow++
              continue
            }
            removeEntryFromState(entriesById, entryIdsByMessageId, convEntries[i].id)
          }

          return { entriesById, entryIdsByMessageId }
        })
      },

      getDebugInfo: (messageId) => {
        const ids = get().entryIdsByMessageId[messageId]
        if (!ids || ids.length === 0) return undefined
        const lastId = ids[ids.length - 1]
        return get().entriesById[lastId]
      },

      getDebugInfos: (messageId) => {
        const state = get()
        const ids = state.entryIdsByMessageId[messageId] ?? []
        return ids
          .map((id) => state.entriesById[id])
          .filter((e): e is DebugRequestInfo => Boolean(e))
      },

      getDebugInfoById: (id) => get().entriesById[id],

      getDebugCount: (messageId) => get().entryIdsByMessageId[messageId]?.length ?? 0,

      clearMessageDebug: (messageId) => {
        set((state) => {
          const ids = state.entryIdsByMessageId[messageId]
          if (!ids?.length) return state
          const entriesById = { ...state.entriesById }
          const entryIdsByMessageId = { ...state.entryIdsByMessageId }
          for (const id of ids) {
            delete entriesById[id]
          }
          delete entryIdsByMessageId[messageId]
          return { entriesById, entryIdsByMessageId }
        })
      },

      clearAllDebug: () => {
        set({ entriesById: {}, entryIdsByMessageId: {} })
      },

      toggleDebugMode: () => {
        set((state) => ({ debugMode: !state.debugMode }))
      },

      setDebugMode: (enabled) => {
        set({ debugMode: enabled })
      },
    }),
    {
      name: 'debug-store',
      partialize: (state) => ({ debugMode: state.debugMode }),
    }
  )
)
