/**
 * 工作区对话面板 - 中栏 AI 领导控制台
 *
 * 基于 ChatViewCore 共享聊天内核，保留工作区特有的多对话管理、压缩检查、导出等能力。
 */

import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { Bot, RotateCcw, Plus, MessageSquare, Trash2, ChevronDown, Settings } from 'lucide-react'
import { ChatViewCore } from '../chat/ChatViewCore'
import { ModelSelector } from '../chat/ModelSelector'
import { CompressionIndicator } from './CompressionIndicator'
import { useConversationStore } from '../../stores/conversation-store'
import { useSettingsStore } from '../../stores'
import { useAgentStore } from '../../stores/agent-store'
import { useWorkspaceAgentStore } from '../../stores/workspace-agent-store'
import { useChat, hasUsableAIProvider } from '../../hooks/use-chat'
import { useWorkspaceCompression } from '../../hooks/use-workspace-compression'
import { formatRelativeTime } from '../../utils/format-time'
import type { Workspace, Message, MessageAttachment, PromptRuntimeContext } from '../../types'
import { useAppTranslation } from '../../i18n/hooks'

type MessageAlignment = 'left-right' | 'all-left' | 'all-right' | 'full-width'

interface CompressionData {
  checkpointId: string
  compressedAt: number
  compressedMessageCount?: number
  tokensBefore?: number
}

interface WorkspaceChatPanelProps {
  workspace: Workspace
  /** 打开设置；可选 section 与 editId（如直接进入 AI 源编辑） */
  onOpenSettings?: (section?: string, editId?: string) => void
}

export function WorkspaceChatPanel({ workspace, onOpenSettings }: WorkspaceChatPanelProps) {
  const { t } = useAppTranslation()
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { getVisibleMessages, getMessages, switchBranch, getConversation,
    createConversation, deleteConversation, selectConversation,
    getConversationsByWorkspaceId, loadConversationMessages } = useConversationStore()
  const { showTimestamp, showTokenUsage, showAvatar, messageAlignment } = useSettingsStore()
  const { getAgent } = useAgentStore()
  const getLeaderAgent = useWorkspaceAgentStore((s) => s.getLeaderAgent)

  const handleMissingProvider = useCallback(() => {
    if (onOpenSettings) {
      onOpenSettings('ai-providers')
    } else {
      window.alert(t('workspace.aiProviderNotConfigured'))
    }
  }, [onOpenSettings, t])

  const handleOpenAiProviderSettings = useCallback((providerId?: string) => {
    onOpenSettings?.('ai-providers', providerId)
  }, [onOpenSettings])

  const {
    sendMessage,
    stopGeneration,
    regenerateMessage,
    editAndResend,
    continueGeneration,
    handleHumanInput,
    approvePlan,
    rejectPlan,
  } = useChat({
    onMissingProvider: handleMissingProvider
  })

  const hasAIProvider = hasUsableAIProvider()

  const { prepareCompression, getContextConfig } = useWorkspaceCompression()

  const workspaceConversations = useMemo(
    () => getConversationsByWorkspaceId(workspace.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace.id, useConversationStore((s) => s.conversations)]
  )

  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    if (workspaceConversations.length === 0) {
      const conv = createConversation(
        workspace.name,
        undefined,
        workspace.leaderAgentId,
        workspace.id
      )
      if (workspace.knowledgeBaseIds.length > 0) {
        useConversationStore.getState().setConversationKnowledgeBases(
          conv.id, workspace.knowledgeBaseIds
        )
      }
      setActiveConvId(conv.id)
      selectConversation(conv.id)
    } else if (!activeConvId || !workspaceConversations.find((c) => c.id === activeConvId)) {
      setActiveConvId(workspaceConversations[0].id)
      selectConversation(workspaceConversations[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceConversations.length, activeConvId, workspace.id])

  useEffect(() => {
    if (activeConvId) {
      loadConversationMessages(activeConvId)
    }
  }, [activeConvId, loadConversationMessages])

  useEffect(() => {
    if (!showDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showDropdown])

  const handleCreateConversation = useCallback(() => {
    const conv = createConversation(
      `${workspace.name} - ${workspaceConversations.length + 1}`,
      undefined,
      workspace.leaderAgentId,
      workspace.id
    )
    if (workspace.knowledgeBaseIds.length > 0) {
      useConversationStore.getState().setConversationKnowledgeBases(
        conv.id, workspace.knowledgeBaseIds
      )
    }
    setActiveConvId(conv.id)
    selectConversation(conv.id)
    setShowDropdown(false)
  }, [workspace, workspaceConversations.length, createConversation, selectConversation])

  const handleSwitchConversation = useCallback((convId: string) => {
    setActiveConvId(convId)
    selectConversation(convId)
    setShowDropdown(false)
  }, [selectConversation])

  const handleDeleteConversation = useCallback((e: React.MouseEvent, convId: string) => {
    e.stopPropagation()
    if (workspaceConversations.length <= 1) return
    deleteConversation(convId)
    if (convId === activeConvId) {
      const remaining = workspaceConversations.filter((c) => c.id !== convId)
      if (remaining.length > 0) {
        setActiveConvId(remaining[0].id)
        selectConversation(remaining[0].id)
      }
    }
  }, [workspaceConversations, activeConvId, deleteConversation, selectConversation])

  const handleRenameConversation = useCallback((convId: string) => {
    const current = getConversation(convId)
    const newTitle = prompt(t('workspace.renameConversation'), current?.title ?? '')
    if (newTitle && newTitle.trim()) {
      useConversationStore.getState().renameConversation(convId, newTitle.trim())
    }
  }, [getConversation, t])

  const conversationId = activeConvId ?? undefined
  const currentConversation = conversationId ? getConversation(conversationId) : undefined
  const activeBranches = currentConversation?.activeBranches ?? {}

  const currentAgent = currentConversation?.agentId ? getAgent(currentConversation.agentId) : undefined
  const leaderAgent = getLeaderAgent() ?? (workspace.leaderAgentId ? getAgent(workspace.leaderAgentId) : currentAgent)

  const runtimeContext: PromptRuntimeContext = useMemo(() => ({
    currentAgentName: leaderAgent?.name,
    defaultModel: leaderAgent?.modelConfig?.modelId,
  }), [leaderAgent?.name, leaderAgent?.modelConfig?.modelId])

  const messages = conversationId ? getVisibleMessages(conversationId) : []
  const isStreaming = messages.some((m) => m.isStreaming)

  const estimateTokens = useCallback((msgs: Message[]): number => {
    const totalChars = msgs.reduce((sum, m) => sum + (m.content?.length ?? 0), 0)
    return Math.ceil(totalChars / 3)
  }, [])

  const checkAndCompress = useCallback(async (msgs: Message[]) => {
    if (!conversationId) return
    const ctxConfig = getContextConfig()
    if (!ctxConfig || !ctxConfig.compressionEnabled) return

    const estimatedTokens = estimateTokens(msgs)
    const threshold = ctxConfig.maxTokens * (ctxConfig.compressionThreshold / 100)

    if (estimatedTokens > threshold) {
      console.log(
        `[WorkspaceChatPanel] 估算 tokens(${estimatedTokens}) 超过阈值(${threshold})，触发压缩`
      )
      const marker = await prepareCompression(msgs, conversationId, estimatedTokens)
      if (marker) {
        useConversationStore.getState().addMessage(conversationId, {
          conversationId,
          role: 'system',
          content: t('workspace.contextCompressionSystemMessage', { count: marker.compressedMessageCount }),
          metadata: {
            compression: {
              checkpointId: marker.checkpointId,
              compressedAt: marker.compressedAt,
              compressedMessageCount: marker.compressedMessageCount,
              tokensBefore: marker.tokensBefore,
            },
          },
        })
      }
    }
  }, [conversationId, getContextConfig, estimateTokens, prepareCompression, t])

  const ensureProviderOrOpenSettings = useCallback((): boolean => {
    if (hasUsableAIProvider()) return true
    handleMissingProvider()
    return false
  }, [handleMissingProvider])

  const handleSend = useCallback(
    async (content: string, attachments?: MessageAttachment[]) => {
      if (!conversationId) return
      // 前置校验：无 AI 源时直接引导配置，避免先进入“思考中”
      if (!ensureProviderOrOpenSettings()) return
      sendMessage(content, conversationId, attachments)
      setTimeout(() => {
        const msgs = getMessages(conversationId)
        checkAndCompress(msgs)
      }, 100)
    },
    [conversationId, sendMessage, getMessages, checkAndCompress, ensureProviderOrOpenSettings]
  )

  const handleSwitchBranch = useCallback(
    (forkMessageId: string, branchIndex: number) => {
      if (conversationId) {
        switchBranch(conversationId, forkMessageId, branchIndex)
      }
    },
    [conversationId, switchBranch]
  )

  const getActiveBranchIndex = useCallback(
    (forkMessageId: string) => {
      return activeBranches[forkMessageId] ?? 0
    },
    [activeBranches]
  )

  const handleExport = useCallback(async () => {
    if (!conversationId) return
    useConversationStore.getState().removeConversationWorkspaceId(conversationId)
  }, [conversationId])

  const activeConvTitle = currentConversation?.title ?? workspace.name

  const headerSlot = (
    <div className="relative z-10 flex-shrink-0 border-b border-surface-200/80 dark:border-surface-700/60 bg-white/60 dark:bg-surface-900/60 backdrop-blur-sm">
      <div className="flex items-center gap-2 px-3 py-1.5">
        {/* 左侧：对话切换 */}
        <div className="relative flex-1 min-w-0" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1.5 w-full min-w-0 px-2 py-1 rounded-lg text-xs text-gray-700 dark:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            <MessageSquare size={13} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
            <span className="truncate font-medium">{activeConvTitle}</span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
              {messages.length > 0 ? t('workspace.messageCountShort', { count: messages.length }) : ''}
            </span>
            <ChevronDown
              size={12}
              className={`flex-shrink-0 text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
            />
          </button>

          {showDropdown && (
            <div className="dropdown-panel absolute top-full left-0 right-0 mt-1 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
              <button
                onClick={handleCreateConversation}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-accent-600 dark:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-900/20 border-b border-surface-100 dark:border-surface-700 transition-colors"
              >
                <Plus size={13} />
                <span>{t('workspace.newConversation')}</span>
              </button>

              {workspaceConversations.map((conv) => {
                const isActive = conv.id === activeConvId
                const convMessages = useConversationStore.getState().messages[conv.id] ?? []
                const preview = conv.lastMessagePreview || convMessages[convMessages.length - 1]?.content?.slice(0, 40) || t('workspace.emptyConversation')
                return (
                  <div
                    key={conv.id}
                    onClick={() => handleSwitchConversation(conv.id)}
                    className={`group flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-accent-50 dark:bg-accent-900/20'
                        : 'hover:bg-surface-50 dark:hover:bg-surface-700/50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium truncate ${
                          isActive ? 'text-accent-700 dark:text-accent-300' : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {conv.title}
                        </span>
                        {conv.isPinned && (
                          <span className="text-[9px] text-amber-500">📌</span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                        {preview}
                      </p>
                      <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-0.5">
                        {formatRelativeTime(conv.updatedAt)} · {t('workspace.messageCount', { count: conv.messageCount })}
                      </p>
                    </div>

                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRenameConversation(conv.id)
                        }}
                        className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title={t('workspace.rename')}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                        </svg>
                      </button>
                      {workspaceConversations.length > 1 && (
                        <button
                          onClick={(e) => handleDeleteConversation(e, conv.id)}
                          className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
                          title={t('workspace.deleteConversation')}
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 右侧：AI 源选择 + 对话操作 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-px h-4 bg-surface-200/80 dark:bg-surface-700/60" aria-hidden="true" />
          <ModelSelector
            conversationId={conversationId}
            onOpenSettings={handleOpenAiProviderSettings}
            maxWidthClassName="max-w-[168px] sm:max-w-[200px]"
            className="bg-white/80 dark:bg-surface-800/70 border-teal-200/70 dark:border-teal-800/40 hover:border-teal-400/70 dark:hover:border-teal-600/50 hover:bg-teal-50/50 dark:hover:bg-teal-950/20"
          />
          <div className="w-px h-4 bg-surface-200/80 dark:bg-surface-700/60" aria-hidden="true" />

          <button
            onClick={handleCreateConversation}
            className="p-1.5 rounded-lg text-gray-400 hover:text-accent-600 dark:hover:text-accent-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            title={t('workspace.newConversation')}
          >
            <Plus size={14} />
          </button>

          <button
            onClick={handleExport}
            disabled={messages.length === 0}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={t('workspace.moveConversationToGlobal')}
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>
    </div>
  )

  const emptyStateSlot = (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center mb-4">
        {leaderAgent?.avatar ? (
          <span className="text-2xl">{leaderAgent.avatar}</span>
        ) : (
          <Bot size={28} className="text-teal-500" />
        )}
      </div>
      {!hasAIProvider ? (
        <>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('workspace.aiProviderNotConfigured')}
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs mb-4">
            {t('workspace.aiProviderNotConfiguredHint')}
          </p>
          <button
            onClick={handleMissingProvider}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors"
          >
            <Settings size={13} />
            {t('workspace.configureAiProvider')}
          </button>
        </>
      ) : (
        <>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('workspace.aiLeaderReady', { name: leaderAgent?.name || t('workspace.aiLeaderConfig') })}
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs mb-4">
            {t('workspace.workspaceChatReadyHint')}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              t('workspace.suggestionCheckCodeQuality'),
              t('workspace.suggestionRefactorDuplicates'),
              t('workspace.suggestionAddUnitTests'),
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  if (!ensureProviderOrOpenSettings()) return
                  handleSend(suggestion)
                }}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )

  const renderSystemMessage = useCallback((msg: Message) => {
    const compressionData = msg.metadata?.compression as CompressionData | undefined
    if (!compressionData) return null
    return (
      <div className="px-4 py-2">
        <CompressionIndicator
          checkpointId={compressionData.checkpointId}
          compressedAt={compressionData.compressedAt}
          compressedMessageCount={compressionData.compressedMessageCount}
          tokensBefore={compressionData.tokensBefore}
        />
      </div>
    )
  }, [])

  return (
    <ChatViewCore
      conversationId={conversationId}
      messages={messages}
      headerSlot={headerSlot}
      emptyStateSlot={emptyStateSlot}
      renderSystemMessage={renderSystemMessage}
      onSwitchBranch={handleSwitchBranch}
      getActiveBranchIndex={getActiveBranchIndex}
      onRegenerate={regenerateMessage}
      onEditAndResend={editAndResend}
      onContinueGeneration={continueGeneration}
      onHumanInput={handleHumanInput}
      onApprovePlan={approvePlan}
      onRejectPlan={rejectPlan}
      onSend={handleSend}
      onStop={stopGeneration}
      isStreaming={isStreaming}
      showTimestamp={showTimestamp}
      showTokenUsage={showTokenUsage}
      showAvatar={showAvatar}
      messageAlignment={messageAlignment as MessageAlignment}
      runtimeContext={runtimeContext}
      workspacePath={workspace.folderPath}
      isWorkspaceMode={true}
      inputClassName="flex-shrink-0 border-t border-surface-200 dark:border-surface-700/60"
    />
  )
}
