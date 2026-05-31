import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import type { Conversation, Message, MessageCreateInput } from '../types'

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

  // Message Actions
  addMessage: (conversationId: string, input: MessageCreateInput) => Message
  updateMessage: (messageId: string, updates: Partial<Message>) => void
  deleteMessage: (conversationId: string, messageId: string) => void
  getMessages: (conversationId: string) => Message[]
  clearMessages: (conversationId: string) => void

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
