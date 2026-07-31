/**
 * 工作区对话面板 - 中栏 AI 领导控制台
 *
 * 基于 ChatViewCore 共享聊天内核。会话管理、模型切换、时间线/导出已迁至左栏
 * 「对话」Tab（WorkspaceConversationPanel）；本面板只负责消息区与顶部运行条。
 */

import { useEffect, useMemo, useCallback } from 'react'
import { Bot, Settings } from 'lucide-react'
import { ChatViewCore } from '../chat/ChatViewCore'
import { WorkspaceRunStrip } from './WorkspaceRunStrip'
import { CompressionIndicator } from './CompressionIndicator'
import { useConversationStore } from '../../stores/conversation-store'
import { useSettingsStore, useDebugStore } from '../../stores'
import { useAgentStore } from '../../stores/agent-store'
import { useWorkspaceAgentStore } from '../../stores/workspace-agent-store'
import { useChat, hasUsableAIProvider } from '../../hooks/use-chat'
import { useWorkspaceCompression } from '../../hooks/use-workspace-compression'
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

  const getVisibleMessages = useConversationStore((s) => s.getVisibleMessages)
  const getMessages = useConversationStore((s) => s.getMessages)
  const switchBranch = useConversationStore((s) => s.switchBranch)
  const getConversation = useConversationStore((s) => s.getConversation)
  const createConversation = useConversationStore((s) => s.createConversation)
  const selectConversation = useConversationStore((s) => s.selectConversation)
  const loadConversationMessages = useConversationStore((s) => s.loadConversationMessages)
  const currentConversationId = useConversationStore((s) => s.currentConversationId)
  const conversations = useConversationStore((s) => s.conversations)

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
    onMissingProvider: handleMissingProvider,
  })

  const hasAIProvider = hasUsableAIProvider()
  const { prepareCompression, getContextConfig } = useWorkspaceCompression()

  const workspaceConversations = useMemo(
    () => conversations.filter((c) => c.workspaceId === workspace.id),
    [conversations, workspace.id]
  )

  // 确保工作区至少有一条对话，并与 store 选中态对齐
  useEffect(() => {
    if (workspaceConversations.length === 0) {
      const leaderAgent = getLeaderAgent()
      const targetAgentId = workspace.leaderAgentId || leaderAgent?.id
      if (!targetAgentId) return
      const conv = createConversation(workspace.name, undefined, targetAgentId, workspace.id)
      if (workspace.knowledgeBaseIds.length > 0) {
        useConversationStore.getState().setConversationKnowledgeBases(conv.id, workspace.knowledgeBaseIds)
      }
      selectConversation(conv.id)
      return
    }

    const selectedInWorkspace = workspaceConversations.some((c) => c.id === currentConversationId)
    if (!selectedInWorkspace) {
      selectConversation(workspaceConversations[0].id)
    }
  }, [
    workspaceConversations,
    currentConversationId,
    workspace.id,
    workspace.name,
    workspace.leaderAgentId,
    workspace.knowledgeBaseIds,
    createConversation,
    selectConversation,
    getLeaderAgent,
  ])

  const conversationId = useMemo(() => {
    if (currentConversationId && workspaceConversations.some((c) => c.id === currentConversationId)) {
      return currentConversationId
    }
    return workspaceConversations[0]?.id
  }, [currentConversationId, workspaceConversations])

  useEffect(() => {
    if (conversationId) {
      void loadConversationMessages(conversationId)
    }
  }, [conversationId, loadConversationMessages])

  useEffect(() => {
    useDebugStore.getState().setActiveConversation(conversationId ?? null)
  }, [conversationId])

  const currentConversation = conversationId ? getConversation(conversationId) : undefined
  const activeBranches = currentConversation?.activeBranches ?? {}

  const currentAgent = currentConversation?.agentId ? getAgent(currentConversation.agentId) : undefined
  const leaderAgent =
    getLeaderAgent() ?? (workspace.leaderAgentId ? getAgent(workspace.leaderAgentId) : currentAgent)

  const runtimeContext: PromptRuntimeContext = useMemo(
    () => ({
      currentAgentName: leaderAgent?.name,
      defaultModel: leaderAgent?.modelConfig?.modelId,
    }),
    [leaderAgent?.name, leaderAgent?.modelConfig?.modelId]
  )

  const messages = conversationId ? getVisibleMessages(conversationId) : []
  const isStreaming = messages.some((m) => m.isStreaming)

  const estimateTokens = useCallback((msgs: Message[]): number => {
    const totalChars = msgs.reduce((sum, m) => sum + (m.content?.length ?? 0), 0)
    return Math.ceil(totalChars / 3)
  }, [])

  const checkAndCompress = useCallback(
    async (msgs: Message[]) => {
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
            content: t('workspace.contextCompressionSystemMessage', {
              count: marker.compressedMessageCount,
            }),
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
    },
    [conversationId, getContextConfig, estimateTokens, prepareCompression, t]
  )

  const ensureProviderOrOpenSettings = useCallback((): boolean => {
    if (hasUsableAIProvider()) return true
    handleMissingProvider()
    return false
  }, [handleMissingProvider])

  const handleViewPlan = useCallback(() => {
    // 优先定位最新活跃 plan（executing/draft），否则取最后一个 AgentTodoPanel
    const panels = Array.from(document.querySelectorAll('.agent-todo-panel')) as HTMLElement[]
    if (panels.length === 0) return
    const el =
      panels.find((p) => {
        const status = p.getAttribute('data-plan-status')
        return status === 'executing' || status === 'draft' || status === 'approved'
      }) ?? panels[panels.length - 1]
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.add('ring-2', 'ring-violet-400', 'ring-offset-2', 'dark:ring-offset-surface-900')
    setTimeout(() => {
      el.classList.remove('ring-2', 'ring-violet-400', 'ring-offset-2', 'dark:ring-offset-surface-900')
    }, 1400)
  }, [])

  const handleViewChanges = useCallback(() => {
    const cards = document.querySelectorAll('.ai-changes-card')
    const last = cards[cards.length - 1] as HTMLElement | undefined
    if (last) {
      last.scrollIntoView({ behavior: 'smooth', block: 'center' })
      last.classList.add('ring-2', 'ring-amber-400')
      setTimeout(() => last.classList.remove('ring-2', 'ring-amber-400'), 1200)
    }
  }, [])

  const handleSend = useCallback(
    async (content: string, attachments?: MessageAttachment[]) => {
      if (!conversationId) return
      if (!ensureProviderOrOpenSettings()) return
      sendMessage(content, conversationId, attachments)
      setTimeout(() => {
        const msgs = getMessages(conversationId)
        void checkAndCompress(msgs)
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

  // 运行条置于聊天顶部（原 inputPrefix 位置已清空）
  const headerSlot = useMemo(
    () => (
      <WorkspaceRunStrip
        messages={messages}
        onViewPlan={handleViewPlan}
        onViewChanges={handleViewChanges}
        onStop={stopGeneration}
        onApprovePlan={approvePlan}
        onRejectPlan={rejectPlan}
      />
    ),
    [messages, handleViewPlan, handleViewChanges, stopGeneration, approvePlan, rejectPlan]
  )

  // 轻量空态：靠近输入上方
  const emptyStateSlot = (
    <div className="flex flex-col items-center justify-end h-full text-center px-6 pb-6 pt-10">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-900/30 dark:to-teal-800/20 flex items-center justify-center mb-3 shadow-sm">
        {leaderAgent?.avatar ? (
          <span className="text-2xl">{leaderAgent.avatar}</span>
        ) : (
          <Bot size={24} className="text-teal-500" />
        )}
      </div>
      {!hasAIProvider ? (
        <>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('workspace.aiProviderNotConfigured')}
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs mb-3">
            {t('workspace.aiProviderNotConfiguredHint', {
              defaultValue: '配置 AI 源后即可开始多 Agent 协作',
            })}
          </p>
          <button
            type="button"
            onClick={handleMissingProvider}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors"
          >
            <Settings size={13} />
            {t('workspace.configureAiProvider')}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-gray-600 dark:text-gray-300 mb-1 max-w-sm">
            {t('workspace.aiLeaderReady', {
              name: leaderAgent?.name || t('workspace.aiLeaderLabel', { defaultValue: 'AI 领导' }),
            })}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 max-w-sm mb-3">
            {t('workspace.workspaceChatReadyHintLight', {
              defaultValue: '描述目标即可分派团队 · 可在左栏「对话」管理任务，在「团队」配置成员',
            })}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5 max-w-md">
            {[
              { label: t('workspace.suggestionMultiAgentFeature'), primary: true },
              { label: t('workspace.suggestionCheckCodeQuality'), primary: false },
              { label: t('workspace.suggestionRefactorDuplicates'), primary: false },
              { label: t('workspace.suggestionAddUnitTests'), primary: false },
            ].map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  if (!ensureProviderOrOpenSettings()) return
                  void handleSend(s.label)
                }}
                className={
                  s.primary
                    ? 'px-2.5 py-1 rounded-lg text-[11px] font-medium text-white bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 transition-colors'
                    : 'px-2.5 py-1 rounded-lg text-[11px] text-gray-500 dark:text-gray-400 bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors'
                }
              >
                {s.label}
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
      onOpenSettings={onOpenSettings}
      workspace={workspace}
      inputClassName="flex-shrink-0 border-t border-surface-200 dark:border-surface-700/60"
    />
  )
}
