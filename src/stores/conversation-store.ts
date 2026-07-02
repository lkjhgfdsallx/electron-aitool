import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import type { Conversation, Message, MessageCreateInput, ConversationAIConfig } from '../types'
import { STORE_VERSIONS } from '../utils/store-migration'
import { conversationDb } from '../services/conversation-db'

/** 从消息内容生成预览文本 */
function generatePreview(content: string): string {
  const cleaned = content.replace(/[#*`>\[\]()!]/g, '').replace(/\n+/g, ' ').trim()
  return cleaned.length > 50 ? cleaned.substring(0, 50) + '...' : cleaned || '暂无内容'
}

// ==================== 消息 → 对话 索引映射 ====================
//
// 性能优化：updateMessage 不再遍历所有对话的所有消息，
// 而是通过索引直接定位消息所属的对话 ID。
// 索引在 addMessage/deleteMessage 时自动维护。

/** messageId → conversationId 的快速查找映射 */
const messageIndexMap = new Map<string, string>()

/** 注册消息索引（addMessage 时调用） */
function indexMessage(messageId: string, conversationId: string): void {
  messageIndexMap.set(messageId, conversationId)
}

/** 移除消息索引（deleteMessage 时调用） */
function unindexMessage(messageId: string): void {
  messageIndexMap.delete(messageId)
}

/** 批量移除对话下所有消息的索引（deleteConversation/clearMessages 时调用） */
function unindexConversationMessages(conversationId: string, messages: Message[]): void {
  for (const m of messages) {
    messageIndexMap.delete(m.id)
  }
}

// ==================== 节流持久化存储 ====================
//
// 现仅用于持久化 Conversation 元数据（不含 messages），
// 因为 messages 已迁移到 IndexedDB 逐条存储。
// Conversation 元数据体积小（~5KB），3 秒节流仍合理。

function createThrottledPersistStorage<S>(throttleMs: number = 3000): PersistStorage<S> {
  let timer: number | null = null
  let pendingName: string | null = null
  let pendingValue: StorageValue<S> | null = null

  const flush = () => {
    if (pendingName !== null && pendingValue !== null) {
      try {
        localStorage.setItem(pendingName, JSON.stringify(pendingValue))
      } catch (e) {
        console.warn('[throttled-persist] localStorage 写入失败（可能超出存储限制）:', e)
      }
      pendingName = null
      pendingValue = null
    }
  }

  // 页面关闭前强制刷新，确保最终状态被持久化
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush)
  }

  return {
    getItem: (name: string): StorageValue<S> | null => {
      const str = localStorage.getItem(name)
      try { return str ? JSON.parse(str) : null } catch { return null }
    },
    setItem: (name: string, newValue: StorageValue<S>): void => {
      pendingName = name
      pendingValue = newValue  // 保存对象引用，延迟序列化（最昂贵的操作）
      if (timer !== null) return  // 已有定时器等待，跳过
      timer = window.setTimeout(() => {
        timer = null
        flush()
      }, throttleMs)
    },
    removeItem: (name: string): void => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      pendingName = null
      pendingValue = null
      localStorage.removeItem(name)
    },
  }
}

// ==================== getVisibleMessages 引用稳定性缓存 ====================
//
// 核心问题：getVisibleMessages 每次调用都返回新的数组引用，
// 导致 ChatWindow 中 useMemo([messages]) 每帧失效 → 所有消息组件重新渲染。
// 缓存策略：只在消息数组引用或分支配置真正变化时才返回新引用。

const visibleMessagesCache = new Map<string, {
  allMessagesRef: Message[]
  activeBranchesJson: string
  result: Message[]
}>()

interface ConversationStore {
  conversations: Conversation[]
  currentConversationId: string | null
  /** ⚡ 仅保留活跃对话的消息在内存中（非活跃对话从 IDB 按需加载） */
  messages: Record<string, Message[]> // conversationId -> messages

  // Conversation Actions
  createConversation: (title?: string, promptId?: string, agentId?: string, workspaceId?: string) => Conversation
  deleteConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  togglePin: (id: string) => void
  selectConversation: (id: string | null) => void
  getConversation: (id: string) => Conversation | undefined
  setConversationAgent: (id: string, agentId: string | undefined) => void
  setConversationAIConfig: (id: string, aiConfig: ConversationAIConfig | undefined) => void
  setConversationKnowledgeBases: (id: string, knowledgeBaseIds: string[] | undefined) => void

  // Workspace Actions
  setConversationWorkspaceId: (id: string, workspaceId: string) => void
  removeConversationWorkspaceId: (id: string) => void
  getConversationByWorkspaceId: (workspaceId: string) => Conversation | undefined
  getConversationsByWorkspaceId: (workspaceId: string) => Conversation[]

  // Message Actions
  addMessage: (conversationId: string, input: MessageCreateInput) => Message
  updateMessage: (messageId: string, updates: Partial<Message>) => void
  deleteMessage: (conversationId: string, messageId: string) => void
  getMessages: (conversationId: string) => Message[]
  clearMessages: (conversationId: string) => void

  // ⚡ 惰性加载 Actions（新增）
  /** 从 IndexedDB 加载指定对话的消息到内存（切换对话时调用） */
  loadConversationMessages: (conversationId: string) => Promise<void>
  /** 释放非活跃对话的消息内存（切换离开时调用） */
  unloadConversationMessages: (conversationId: string) => void
  /** 应用启动时从 IndexedDB 加载当前对话消息 + 执行 localStorage→IDB 迁移 */
  initializeMessages: () => Promise<void>

  // Branch Actions
  switchBranch: (conversationId: string, forkMessageId: string, branchIndex: number) => void
  getVisibleMessages: (conversationId: string) => Message[]
  /** 获取当前对话末尾的活跃分支索引（基于最后一个分支点的 activeBranches） */
  getCurrentBranchIndex: (conversationId: string) => number

  // Search
  searchConversations: (query: string) => Conversation[]

  // Message Index
  /** 通过消息 ID 获取其所属的对话 ID（用于不依赖 currentConversationId 的场景） */
  getConversationIdByMessageId: (messageId: string) => string | undefined

  // Stale Streaming Cleanup
  /** 清理残留的 isStreaming 标记（应用重启后调用），返回被中断的消息 ID 列表 */
  cleanupStaleStreaming: () => string[]
}

export const useConversationStore = create<ConversationStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      currentConversationId: null,
      messages: {},

      // ==================== Conversation Actions ====================

      createConversation: (title = '新对话', promptId, agentId, workspaceId) => {
        const conversation: Conversation = {
          id: uuidv4(),
          title,
          promptId,
          agentId,
          workspaceId,
          isPinned: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 0
        }
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          currentConversationId: conversation.id,
          messages: { ...state.messages, [conversation.id]: [] }
        }))
        return conversation
      },

      deleteConversation: (id) => {
        // 清理被删对话下所有消息的索引
        const msgs = get().messages[id] ?? []
        unindexConversationMessages(id, msgs)
        set((state) => {
          const newMessages = { ...state.messages }
          delete newMessages[id]
          const newConversations = state.conversations.filter((c) => c.id !== id)
          const newCurrentId =
            state.currentConversationId === id
              ? newConversations[0]?.id ?? null
              : state.currentConversationId
          return {
            conversations: newConversations,
            currentConversationId: newCurrentId,
            messages: newMessages
          }
        })
        // ⚡ 异步删除 IndexedDB 中该对话的全部消息
        conversationDb.deleteMessagesByConversationId(id).catch((e) =>
          console.warn('[conversation-store] IDB 删除对话消息失败:', e)
        )
      },

      renameConversation: (id, title) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, title, updatedAt: Date.now() } : c
          )
        }))
      },

      togglePin: (id) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, isPinned: !c.isPinned } : c
          )
        }))
      },

      selectConversation: (id) => set({ currentConversationId: id }),

      getConversation: (id) => get().conversations.find((c) => c.id === id),

      setConversationAgent: (id, agentId) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, agentId, updatedAt: Date.now() } : c
          )
        }))
      },

      setConversationAIConfig: (id, aiConfig) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, aiConfig, updatedAt: Date.now() } : c
          )
        }))
      },
    
      setConversationKnowledgeBases: (id, knowledgeBaseIds) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, activeKnowledgeBaseIds: knowledgeBaseIds, updatedAt: Date.now() } : c
          )
        }))
      },

      // ==================== Workspace Actions ====================

      setConversationWorkspaceId: (id, workspaceId) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, workspaceId, updatedAt: Date.now() } : c
          )
        }))
      },

      removeConversationWorkspaceId: (id) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, workspaceId: undefined, updatedAt: Date.now() } : c
          )
        }))
      },

      getConversationByWorkspaceId: (workspaceId) => {
        return get().conversations.find((c) => c.workspaceId === workspaceId)
      },

      getConversationsByWorkspaceId: (workspaceId) => {
        return get().conversations
          .filter((c) => c.workspaceId === workspaceId)
          .sort((a, b) => b.updatedAt - a.updatedAt)
      },

      // ==================== Message Actions ====================

      addMessage: (conversationId, input) => {
        const message: Message = {
          ...input,
          id: uuidv4(),
          timestamp: Date.now()
        }
        // 注册消息索引，加速后续 updateMessage 查找
        indexMessage(message.id, conversationId)
        const preview = generatePreview(message.content || '')
        set((state) => {
          const convMessages = state.messages[conversationId] ?? []
          return {
            messages: {
              ...state.messages,
              [conversationId]: [...convMessages, message]
            },
            conversations: state.conversations.map((c) =>
              c.id === conversationId
                ? { ...c, messageCount: c.messageCount + 1, updatedAt: Date.now(), lastMessagePreview: preview }
                : c
            )
          }
        })
        // ⚡ 异步写入 IndexedDB（非阻塞，内存优先）
        conversationDb.saveMessage(message).catch((e) =>
          console.warn('[conversation-store] IDB 保存消息失败:', e)
        )
        return message
      },

      updateMessage: (messageId, updates) => {
        // 性能优化：通过索引直接定位消息所属对话，避免遍历所有对话
        const targetConvId = messageIndexMap.get(messageId)
        set((state) => {
          if (targetConvId && state.messages[targetConvId]) {
            // 快速路径：只更新目标对话
            const convMessages = state.messages[targetConvId]
            const mapped = convMessages.map((m) =>
              m.id === messageId ? { ...m, ...updates } : m
            )
            // 检查是否是该对话的最后一条消息被更新
            const isLastMsg = mapped.length > 0 && mapped[mapped.length - 1].id === messageId
            const conversations = isLastMsg
              ? state.conversations.map((c) =>
                  c.id === targetConvId
                    ? { ...c, lastMessagePreview: generatePreview(mapped[mapped.length - 1].content || '') }
                    : c
                )
              : state.conversations
            return {
              messages: { ...state.messages, [targetConvId]: mapped },
              conversations
            }
          }
          // 回退路径：索引缺失时遍历（首次从 persisted state 恢复时可能发生）
          const newMessages: Record<string, Message[]> = {}
          let updatedConvId: string | null = null
          let updatedLastMsg: Message | null = null
          for (const [convId, msgs] of Object.entries(state.messages)) {
            const mapped = msgs.map((m) =>
              m.id === messageId ? { ...m, ...updates } : m
            )
            newMessages[convId] = mapped
            // 顺便修复索引
            if (mapped !== msgs) {
              indexMessage(messageId, convId)
            }
            if (mapped.length > 0 && mapped[mapped.length - 1].id === messageId) {
              updatedConvId = convId
              updatedLastMsg = mapped[mapped.length - 1]
            }
          }
          const conversations = updatedConvId && updatedLastMsg
            ? state.conversations.map((c) =>
                c.id === updatedConvId
                  ? { ...c, lastMessagePreview: generatePreview(updatedLastMsg!.content || '') }
                  : c
              )
            : state.conversations
          return { messages: newMessages, conversations }
        })

        // ⚡ 异步更新 IndexedDB 单条消息（核心优化：只写 ~0.5KB 而非 ~5-10MB）
        const convId = targetConvId || messageIndexMap.get(messageId)
        if (convId) {
          const msgs = get().messages[convId]
          const updatedMsg = msgs?.find((m) => m.id === messageId)
          if (updatedMsg) {
            // ⚡ 将内存中的完整消息写入 IDB（updatedMsg 已包含所有更新后的字段）
            conversationDb.saveMessage(updatedMsg).catch((e) =>
              console.warn('[conversation-store] IDB 更新消息失败:', e)
            )
          }
        }
      },

      deleteMessage: (conversationId, messageId) => {
        // 清理消息索引
        unindexMessage(messageId)
        set((state) => {
          const convMessages = state.messages[conversationId] ?? []
          const newConvMessages = convMessages.filter((m) => m.id !== messageId)
          const newPreview = newConvMessages.length > 0
            ? generatePreview(newConvMessages[newConvMessages.length - 1].content || '')
            : undefined
          return {
            messages: {
              ...state.messages,
              [conversationId]: newConvMessages
            },
            conversations: state.conversations.map((c) =>
              c.id === conversationId
                ? { ...c, messageCount: Math.max(0, c.messageCount - 1), lastMessagePreview: newPreview }
                : c
            )
          }
        })
        // ⚡ 异步删除 IndexedDB 单条消息
        conversationDb.deleteMessage(messageId).catch((e) =>
          console.warn('[conversation-store] IDB 删除消息失败:', e)
        )
      },

      getMessages: (conversationId) => get().messages[conversationId] ?? [],

      clearMessages: (conversationId) => {
        // 清理被清空对话下所有消息的索引
        const msgs = get().messages[conversationId] ?? []
        unindexConversationMessages(conversationId, msgs)
        set((state) => ({
          messages: { ...state.messages, [conversationId]: [] },
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, messageCount: 0, lastMessagePreview: undefined } : c
          )
        }))
        // ⚡ 异步删除 IndexedDB 中该对话的全部消息
        conversationDb.deleteMessagesByConversationId(conversationId).catch((e) =>
          console.warn('[conversation-store] IDB 清空消息失败:', e)
        )
      },

      // ==================== 惰性加载 Actions（新增） ====================

      /**
       * ⚡ 从 IndexedDB 加载指定对话的消息到内存
       * 切换对话时调用，确保该对话的消息在内存中可用于同步访问
       */
      loadConversationMessages: async (conversationId) => {
        // 如果内存中已有该对话的消息，跳过重复加载
        const existing = get().messages[conversationId]
        if (existing && existing.length > 0) return

        const msgs = await conversationDb.getMessagesByConversationId(conversationId)
        // 重建消息索引
        for (const m of msgs) {
          indexMessage(m.id, conversationId)
        }
        set((state) => ({
          messages: { ...state.messages, [conversationId]: msgs }
        }))
      },

      /**
       * ⚡ 释放非活跃对话的消息内存
       * 切换离开对话时调用，减少内存占用
       */
      unloadConversationMessages: (conversationId) => {
        // 清理该对话的消息索引
        const msgs = get().messages[conversationId] ?? []
        unindexConversationMessages(conversationId, msgs)
        set((state) => {
          const newMessages = { ...state.messages }
          delete newMessages[conversationId]
          return { messages: newMessages }
        })
      },

      /**
       * ⚡ 应用启动时初始化消息数据
       * 1. 从 localStorage 检测旧版 messages 数据 → 迁移到 IndexedDB
       * 2. 加载当前活跃对话的消息到内存
       */
      initializeMessages: async () => {
        // ==================== localStorage → IDB 迁移 ====================
        const lsKey = 'conversations'
        const lsStr = localStorage.getItem(lsKey)
        if (lsStr) {
          try {
            const parsed = JSON.parse(lsStr)
            // 检查是否存在旧版 messages 字段（需要迁移）
            if (parsed?.state?.messages && typeof parsed.state.messages === 'object') {
              const oldMessages = parsed.state.messages as Record<string, Message[]>
              const totalMsgs = Object.values(oldMessages).reduce((sum, m) => sum + m.length, 0)

              if (totalMsgs > 0) {
                console.log(`[conversation-store] 开始迁移 ${totalMsgs} 条消息从 localStorage 到 IndexedDB...`)

                // 批量写入 IndexedDB
                for (const [convId, msgs] of Object.entries(oldMessages)) {
                  if (msgs.length > 0) {
                    await conversationDb.saveMessages(msgs)
                  }
                }

                // 迁移成功后从 localStorage 移除 messages 字段
                // 保留 conversations 元数据 + currentConversationId
                delete parsed.state.messages
                localStorage.setItem(lsKey, JSON.stringify(parsed))
                console.log('[conversation-store] 迁移完成，已从 localStorage 移除 messages 字段')
              }
            }
          } catch (e) {
            console.warn('[conversation-store] localStorage → IDB 迁移失败:', e)
            // 迁移失败不阻塞应用启动，下次启动时会重新尝试
          }
        }

        // ==================== 加载当前活跃对话的消息 ====================
        const currentConvId = get().currentConversationId
        if (currentConvId) {
          await get().loadConversationMessages(currentConvId)
        }
      },

      // ==================== Branch Actions ====================

      switchBranch: (conversationId, forkMessageId, branchIndex) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  activeBranches: {
                    ...(c.activeBranches ?? {}),
                    [forkMessageId]: branchIndex
                  },
                  updatedAt: Date.now()
                }
              : c
          )
        }))
      },

      /**
       * 获取当前激活分支路径上的可见消息列表
       * 遍历消息数组，在每个分支点根据 activeBranches 决定走哪条分支
       */
      // ==================== getVisibleMessages 引用稳定性缓存 ====================
      // 核心优化：getVisibleMessages 在 ChatWindow 中被用作 useMemo 的依赖，
      // 每次返回新数组引用会导致 useMemo 失效 → groupMessages 重新执行 →
      // 所有 RenderGroup 引用变化 → 所有 MessageItem 重新渲染 → MarkdownRenderer 重新解析。
      // 缓存策略：只有当消息数组引用或分支配置真正变化时才返回新引用。
      getVisibleMessages: (conversationId) => {
        const allMessages = get().messages[conversationId] ?? []
        const conversation = get().conversations.find((c) => c.id === conversationId)
        const activeBranches = conversation?.activeBranches ?? {}

        // 检查缓存是否有效（数组引用 + 分支配置均未变化）
        const cached = visibleMessagesCache.get(conversationId)
        if (cached && cached.allMessagesRef === allMessages && cached.activeBranchesJson === JSON.stringify(activeBranches)) {
          return cached.result
        }

        let currentBranch = 0
        const visible: Message[] = []

        for (const msg of allMessages) {
          const isFork = msg.role === 'user' && (msg.branchCount ?? 0) > 1

          if (isFork) {
            // 分支点用户消息：根据 activeBranches 确定当前分支
            currentBranch = activeBranches[msg.id] ?? 0
            visible.push(msg)
          } else if (msg.branchIndex === undefined || msg.branchIndex === currentBranch) {
            // 非分支点消息或分支匹配的消息
            visible.push(msg)
          }
        }

        // 更新缓存
        visibleMessagesCache.set(conversationId, {
          allMessagesRef: allMessages,
          activeBranchesJson: JSON.stringify(activeBranches),
          result: visible
        })

        return visible
      },

      /**
       * 获取当前对话末尾的活跃分支索引
       * 遍历所有消息，跟踪最后一个分支点的 activeBranch
       */
      getCurrentBranchIndex: (conversationId) => {
        const allMessages = get().messages[conversationId] ?? []
        const conversation = get().conversations.find((c) => c.id === conversationId)
        const activeBranches = conversation?.activeBranches ?? {}

        let currentBranch = 0
        for (const msg of allMessages) {
          if (msg.role === 'user' && (msg.branchCount ?? 0) > 1) {
            currentBranch = activeBranches[msg.id] ?? 0
          }
        }
        return currentBranch
      },

      // ==================== Message Index ====================

      getConversationIdByMessageId: (messageId) => {
        // 先尝试从索引中快速查找
        const indexedConvId = messageIndexMap.get(messageId)
        if (indexedConvId) return indexedConvId

        // Fallback: 索引可能因页面刷新而丢失，遍历所有对话查找
        const state = get()
        for (const [convId, msgs] of Object.entries(state.messages)) {
          if (msgs.some(m => m.id === messageId)) {
            // 找到后补建索引，加速下次查找
            messageIndexMap.set(messageId, convId)
            return convId
          }
        }
        // ⚡ 新增：如果内存中没有，尝试从 IndexedDB 查找（异步但此接口需同步返回）
        // 这种场景极少（索引丢失 + 内存未加载），返回 undefined 让调用方处理
        return undefined
      },

      // ==================== Stale Streaming Cleanup ====================

      cleanupStaleStreaming: () => {
        const interruptedIds: string[] = []
        const newMessages: Record<string, Message[]> = {}

        for (const [convId, msgs] of Object.entries(get().messages)) {
          let changed = false
          const updated = msgs.map((m) => {
            if (m.isStreaming) {
              changed = true
              interruptedIds.push(m.id)
              return {
                ...m,
                isStreaming: false,
                wasInterrupted: true,
                content: m.content || '',
                // 为没有内容的中断消息添加提示
                ...(m.content ? {} : { content: '' }),
              }
            }
            return m
          })
          newMessages[convId] = updated

          // 如果有中断的消息，在对话末尾添加一条系统提示
          if (changed) {
            const lastMsg = updated[updated.length - 1]
            if (lastMsg?.role === 'assistant' && lastMsg.wasInterrupted) {
              // 检查是否已有中断提示
              const hasInterruptNotice = updated.some(
                (m) => m.role === 'system' && m.content?.includes('任务中断') && m.timestamp > (lastMsg.timestamp ?? 0) - 5000
              )
              if (!hasInterruptNotice) {
                const noticeMsg: Message = {
                  id: uuidv4(),
                  conversationId: convId,
                  role: 'system' as const,
                  content: '⚠️ 检测到任务中断：上次 AI 回复在应用关闭时尚未完成，已被自动标记为中断。您可以通过消息上的「继续任务」按钮恢复执行。',
                  timestamp: Date.now(),
                  branchIndex: lastMsg.branchIndex,
                }
                newMessages[convId] = [...updated, noticeMsg]
                indexMessage(noticeMsg.id, convId)
                // ⚡ 异步写入 IDB
                conversationDb.saveMessage(noticeMsg).catch((e) =>
                  console.warn('[conversation-store] IDB 保存中断提示消息失败:', e)
                )
              }
            }
          }
        }

        if (interruptedIds.length > 0) {
          set({ messages: newMessages })
          // ⚡ 批量更新 IDB 中被中断的消息
          for (const id of interruptedIds) {
            const convId = messageIndexMap.get(id)
            if (convId) {
              const msg = newMessages[convId]?.find((m) => m.id === id)
              if (msg) {
                conversationDb.saveMessage(msg).catch((e) =>
                  console.warn('[conversation-store] IDB 更新中断消息失败:', e)
                )
              }
            }
          }
          console.log(`[ConversationStore] 已清理 ${interruptedIds.length} 条残留的 isStreaming 消息`)
        }

        return interruptedIds
      },

      // ==================== Search ====================

      searchConversations: (query) => {
        const lowerQuery = query.toLowerCase()
        return get().conversations.filter((c) =>
          c.title.toLowerCase().includes(lowerQuery)
        )
      }
    }),
    {
      name: 'conversations',
      version: STORE_VERSIONS.CONVERSATIONS,
      // ⚡ 节流存储：仅用于 Conversation 元数据的持久化（不含 messages）
      // messages 已迁移到 IndexedDB 逐条存储，不再通过 localStorage 全量序列化
      storage: createThrottledPersistStorage(3000),
      // 迁移：为旧对话补充 lastMessagePreview 缓存 + 清理旧版 messages
      migrate: (persistedState: unknown, version: number) => {
        if (version < 2) {
          const state = persistedState as { conversations: Conversation[]; messages: Record<string, Message[]> }
          if (state.conversations && state.messages) {
            state.conversations = state.conversations.map((c) => {
              if (c.lastMessagePreview !== undefined) return c
              const msgs = state.messages[c.id]
              if (!msgs || msgs.length === 0) return c
              const lastMsg = msgs[msgs.length - 1]
              return { ...c, lastMessagePreview: generatePreview(lastMsg.content || '') }
            })
          }
        }
        // ⚡ 清理 messages 字段：persist 不再需要序列化消息数据
        // 消息数据将由 initializeMessages() 从 localStorage 迁移到 IndexedDB
        const state = persistedState as { messages?: Record<string, unknown> }
        if (state.messages) {
          delete state.messages
        }
        return persistedState
      },
      // ⚡ partialize 重构：不再序列化 messages 到 localStorage
      // 消息数据逐条存储在 IndexedDB 中，修改一条消息只需更新 ~0.5KB IDB 记录
      // 而不是重新序列化整个 5-10MB 的 JSON
      partialize: (state) => {
        return {
          conversations: state.conversations,
          currentConversationId: state.currentConversationId
        }
      }
    }
  )
)
