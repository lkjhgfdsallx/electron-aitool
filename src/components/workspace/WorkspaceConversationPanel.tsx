import { useCallback, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  Clock3,
  Download,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { ModelSelector } from '../chat/ModelSelector'
import { useConversationStore } from '../../stores/conversation-store'
import { useWorkspaceAgentStore } from '../../stores/workspace-agent-store'
import { formatRelativeTime } from '../../utils/format-time'
import { useAppTranslation } from '../../i18n/hooks'
import type { Workspace } from '../../types'

interface WorkspaceConversationPanelProps {
  workspace: Workspace
  onOpenSettings?: (section?: string, editId?: string) => void
  onOpenTimeline: () => void
  onExportWorkspace: () => void
}

export function WorkspaceConversationPanel({
  workspace,
  onOpenSettings,
  onOpenTimeline,
  onExportWorkspace,
}: WorkspaceConversationPanelProps) {
  const { t } = useAppTranslation()
  const conversations = useConversationStore((s) => s.conversations)
  const currentConversationId = useConversationStore((s) => s.currentConversationId)
  const messagesByConversation = useConversationStore((s) => s.messages)
  const createConversation = useConversationStore((s) => s.createConversation)
  const deleteConversation = useConversationStore((s) => s.deleteConversation)
  const renameConversation = useConversationStore((s) => s.renameConversation)
  const selectConversation = useConversationStore((s) => s.selectConversation)
  const loadConversationMessages = useConversationStore((s) => s.loadConversationMessages)
  const removeConversationWorkspaceId = useConversationStore((s) => s.removeConversationWorkspaceId)
  const getLeaderAgent = useWorkspaceAgentStore((s) => s.getLeaderAgent)

  const [searchQuery, setSearchQuery] = useState('')
  const [menuConversationId, setMenuConversationId] = useState<string | null>(null)

  const workspaceConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return conversations
      .filter((conversation) => conversation.workspaceId === workspace.id)
      .filter((conversation) => {
        if (!query) return true
        return (
          conversation.title.toLowerCase().includes(query) ||
          (conversation.lastMessagePreview || '').toLowerCase().includes(query)
        )
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
        return b.updatedAt - a.updatedAt
      })
  }, [conversations, searchQuery, workspace.id])

  const activeConversation = useMemo(
    () => workspaceConversations.find((conversation) => conversation.id === currentConversationId),
    [currentConversationId, workspaceConversations]
  )

  const handleCreate = useCallback(() => {
    const leaderAgent = getLeaderAgent()
    const targetAgentId = workspace.leaderAgentId || leaderAgent?.id
    if (!targetAgentId) return
    const total = conversations.filter((conversation) => conversation.workspaceId === workspace.id).length
    const conversation = createConversation(
      `${workspace.name} - ${total + 1}`,
      undefined,
      targetAgentId,
      workspace.id
    )
    if (workspace.knowledgeBaseIds.length > 0) {
      useConversationStore.getState().setConversationKnowledgeBases(conversation.id, workspace.knowledgeBaseIds)
    }
  }, [conversations, createConversation, getLeaderAgent, workspace])

  const handleSwitch = useCallback(
    (conversationId: string) => {
      selectConversation(conversationId)
      void loadConversationMessages(conversationId)
      setMenuConversationId(null)
    },
    [loadConversationMessages, selectConversation]
  )

  const handleRename = useCallback(
    (conversationId: string) => {
      const conversation = conversations.find((item) => item.id === conversationId)
      const nextTitle = window.prompt(t('workspace.renameConversation'), conversation?.title ?? '')
      if (nextTitle?.trim()) renameConversation(conversationId, nextTitle.trim())
      setMenuConversationId(null)
    },
    [conversations, renameConversation, t]
  )

  const handleDelete = useCallback(
    (conversationId: string) => {
      const allWorkspaceConversations = conversations.filter((conversation) => conversation.workspaceId === workspace.id)
      if (allWorkspaceConversations.length <= 1) return
      deleteConversation(conversationId)
      const remaining = allWorkspaceConversations.filter((conversation) => conversation.id !== conversationId)
      if (conversationId === currentConversationId && remaining[0]) {
        selectConversation(remaining[0].id)
        void loadConversationMessages(remaining[0].id)
      }
      setMenuConversationId(null)
    },
    [conversations, currentConversationId, deleteConversation, loadConversationMessages, selectConversation, workspace.id]
  )

  const handleMoveToGlobal = useCallback(
    (conversationId: string) => {
      const allWorkspaceConversations = conversations.filter((conversation) => conversation.workspaceId === workspace.id)
      if (allWorkspaceConversations.length <= 1) return
      removeConversationWorkspaceId(conversationId)
      const remaining = allWorkspaceConversations.filter((conversation) => conversation.id !== conversationId)
      if (conversationId === currentConversationId && remaining[0]) {
        selectConversation(remaining[0].id)
        void loadConversationMessages(remaining[0].id)
      }
      setMenuConversationId(null)
    },
    [conversations, currentConversationId, loadConversationMessages, removeConversationWorkspaceId, selectConversation, workspace.id]
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-0 dark:bg-surface-950">
      <div className="flex-shrink-0 border-b border-surface-200/80 px-3 pb-3 pt-3 dark:border-surface-800">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-xs font-semibold text-surface-800 dark:text-surface-100">
              {t('workspace.conversations', { defaultValue: '对话' })}
            </h2>
            <p className="mt-0.5 text-[10px] text-surface-400 dark:text-surface-500">
              {t('workspace.taskManagerSubtitle', {
                defaultValue: '{{count}} 个任务',
                count: workspaceConversations.length,
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-teal-600 px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 dark:bg-teal-500 dark:hover:bg-teal-400"
          >
            <Plus size={13} />
            {t('workspace.newTask', { defaultValue: '新任务' })}
          </button>
        </div>

        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('workspace.searchTasks', { defaultValue: '搜索任务…' })}
            className="h-8 w-full rounded-lg border border-surface-200 bg-surface-50 pl-8 pr-2 text-[11px] text-surface-800 outline-none transition-colors placeholder:text-surface-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
          />
        </div>
      </div>

      <div className="flex-shrink-0 space-y-2 border-b border-surface-200/80 p-3 dark:border-surface-800">
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-surface-400 dark:text-surface-500">
            {t('workspace.modelAndProvider', { defaultValue: '模型与 AI 源' })}
          </div>
          <ModelSelector
            conversationId={activeConversation?.id}
            onOpenSettings={(providerId) => onOpenSettings?.('ai-providers', providerId)}
            maxWidthClassName="max-w-none"
            className="w-full justify-between bg-surface-50 dark:bg-surface-900"
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onOpenTimeline}
            className="flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-surface-200 text-[10px] font-medium text-surface-600 transition-colors hover:bg-surface-100 hover:text-surface-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-white"
          >
            <Clock3 size={12} />
            {t('workspace.contextTimeline')}
          </button>
          <button
            type="button"
            onClick={onExportWorkspace}
            className="flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-surface-200 text-[10px] font-medium text-surface-600 transition-colors hover:bg-surface-100 hover:text-surface-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-white"
          >
            <Download size={12} />
            {t('workspace.exportWorkspace')}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {workspaceConversations.length === 0 ? (
          <div className="px-4 py-10 text-center text-[11px] text-surface-400">
            {t('workspace.noMatchingTasks', { defaultValue: '没有匹配的任务' })}
          </div>
        ) : (
          workspaceConversations.map((conversation) => {
            const isActive = conversation.id === currentConversationId
            const storeMessages = messagesByConversation[conversation.id] ?? []
            const preview =
              conversation.lastMessagePreview ||
              storeMessages[storeMessages.length - 1]?.content?.slice(0, 60) ||
              t('workspace.emptyConversation')
            const menuOpen = menuConversationId === conversation.id

            return (
              <div
                key={conversation.id}
                className={`group relative mb-1 rounded-xl border transition-colors ${
                  isActive
                    ? 'border-teal-200 bg-teal-50/80 dark:border-teal-800/70 dark:bg-teal-950/30'
                    : 'border-transparent hover:border-surface-200 hover:bg-surface-50 dark:hover:border-surface-800 dark:hover:bg-surface-900'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSwitch(conversation.id)}
                  className="w-full cursor-pointer px-3 py-2.5 pr-9 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500/50"
                >
                  <div className="flex items-center gap-1.5">
                    {conversation.isPinned ? <Pin size={10} className="flex-shrink-0 text-teal-500" /> : <MessageSquare size={11} className="flex-shrink-0 text-surface-400" />}
                    <span className={`min-w-0 flex-1 truncate text-[11px] font-medium ${isActive ? 'text-teal-800 dark:text-teal-200' : 'text-surface-700 dark:text-surface-200'}`}>
                      {conversation.title}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[10px] leading-4 text-surface-400 dark:text-surface-500">{preview}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-[9px] text-surface-400 dark:text-surface-600">
                    <span>{formatRelativeTime(conversation.updatedAt)}</span>
                    <span>·</span>
                    <span>{t('workspace.messageCount', { count: conversation.messageCount })}</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setMenuConversationId(menuOpen ? null : conversation.id)
                  }}
                  className={`absolute right-1.5 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-surface-400 transition-all hover:bg-surface-200 hover:text-surface-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 dark:hover:bg-surface-700 dark:hover:text-surface-200 ${menuOpen ? 'bg-surface-200 opacity-100 dark:bg-surface-700' : 'opacity-0 group-hover:opacity-100'}`}
                  aria-label={t('workspace.moreActions', { defaultValue: '更多操作' })}
                  aria-expanded={menuOpen}
                >
                  <MoreHorizontal size={14} />
                </button>

                {menuOpen && (
                  <div className="absolute right-1.5 top-9 z-20 min-w-[150px] overflow-hidden rounded-lg border border-surface-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-800">
                    <button type="button" onClick={() => handleRename(conversation.id)} className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[10px] text-surface-600 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-700">
                      <Pencil size={11} />
                      {t('workspace.rename')}
                    </button>
                    <button type="button" onClick={() => handleMoveToGlobal(conversation.id)} disabled={workspaceConversations.length <= 1} className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[10px] text-surface-600 hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-surface-300 dark:hover:bg-surface-700">
                      <ArrowUpRight size={11} />
                      {t('workspace.moveConversationToGlobal')}
                    </button>
                    <button type="button" onClick={() => handleDelete(conversation.id)} disabled={workspaceConversations.length <= 1} className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[10px] text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/30">
                      <Trash2 size={11} />
                      {t('workspace.deleteConversation')}
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
