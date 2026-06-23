import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import type { Conversation, Message, MessageCreateInput, ConversationAIConfig } from '../types'

interface ConversationStore {
  conversations: Conversation[]
  currentConversationId: string | null
  messages: Record<string, Message[]> // conversationId -> messages

  // Conversation Actions
  createConversation: (title?: string, promptId?: string, agentId?: string) => Conversation
  deleteConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  togglePin: (id: string) => void
  selectConversation: (id: string | null) => void
  getConversation: (id: string) => Conversation | undefined
  setConversationAgent: (id: string, agentId: string | undefined) => void
  setConversationAIConfig: (id: string, aiConfig: ConversationAIConfig | undefined) => void

  // Message Actions
  addMessage: (conversationId: string, input: MessageCreateInput) => Message
  updateMessage: (messageId: string, updates: Partial<Message>) => void
  deleteMessage: (conversationId: string, messageId: string) => void
  getMessages: (conversationId: string) => Message[]
  clearMessages: (conversationId: string) => void

  // Branch Actions
  switchBranch: (conversationId: string, forkMessageId: string, branchIndex: number) => void
  getVisibleMessages: (conversationId: string) => Message[]
  /** 获取当前对话末尾的活跃分支索引（基于最后一个分支点的 activeBranches） */
  getCurrentBranchIndex: (conversationId: string) => number

  // Search
  searchConversations: (query: string) => Conversation[]
}

export const useConversationStore = create<ConversationStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      currentConversationId: null,
      messages: {},

      // ==================== Conversation Actions ====================

      createConversation: (title = '新对话', promptId, agentId) => {
        const conversation: Conversation = {
          id: uuidv4(),
          title,
          promptId,
          agentId,
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

      // ==================== Message Actions ====================

      addMessage: (conversationId, input) => {
        const message: Message = {
          ...input,
          id: uuidv4(),
          timestamp: Date.now()
        }
        set((state) => {
          const convMessages = state.messages[conversationId] ?? []
          return {
            messages: {
              ...state.messages,
              [conversationId]: [...convMessages, message]
            },
            conversations: state.conversations.map((c) =>
              c.id === conversationId
                ? { ...c, messageCount: c.messageCount + 1, updatedAt: Date.now() }
                : c
            )
          }
        })
        return message
      },

      updateMessage: (messageId, updates) => {
        set((state) => {
          const newMessages: Record<string, Message[]> = {}
          for (const [convId, msgs] of Object.entries(state.messages)) {
            newMessages[convId] = msgs.map((m) =>
              m.id === messageId ? { ...m, ...updates } : m
            )
          }
          return { messages: newMessages }
        })
      },

      deleteMessage: (conversationId, messageId) => {
        set((state) => {
          const convMessages = state.messages[conversationId] ?? []
          return {
            messages: {
              ...state.messages,
              [conversationId]: convMessages.filter((m) => m.id !== messageId)
            },
            conversations: state.conversations.map((c) =>
              c.id === conversationId
                ? { ...c, messageCount: Math.max(0, c.messageCount - 1) }
                : c
            )
          }
        })
      },

      getMessages: (conversationId) => get().messages[conversationId] ?? [],

      clearMessages: (conversationId) => {
        set((state) => ({
          messages: { ...state.messages, [conversationId]: [] },
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, messageCount: 0 } : c
          )
        }))
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
      getVisibleMessages: (conversationId) => {
        const allMessages = get().messages[conversationId] ?? []
        const conversation = get().conversations.find((c) => c.id === conversationId)
        const activeBranches = conversation?.activeBranches ?? {}

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
      // 只持久化最近100个对话的消息，避免 localStorage 过大
      partialize: (state) => {
        const recentConvs = state.conversations.slice(0, 100)
        const recentMessages: Record<string, Message[]> = {}
        for (const conv of recentConvs) {
          if (state.messages[conv.id]) {
            recentMessages[conv.id] = state.messages[conv.id]
          }
        }
        return {
          conversations: recentConvs,
          currentConversationId: state.currentConversationId,
          messages: recentMessages
        }
      }
    }
  )
)
