/**
 * 工作区对话面板 - 中栏 AI 领导控制台
 *
 * 复用现有对话系统：useChat + ConversationStore + MessageItem + MessageInput。
 * 工作区 = 有项目特色 UI 的对话区，自动获得复制/编辑/重生成/工具调用/分支等全部能力。
 *
 * 支持多对话管理：创建新对话、切换对话、删除对话。
 */

import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { Bot, RotateCcw, Plus, MessageSquare, Trash2, ChevronDown } from 'lucide-react'
import { MessageItem } from '../chat/MessageItem'
import { AssistantGroupBubble } from '../chat/AssistantGroupBubble'
import { MessageInput } from '../chat/MessageInput'
import { CompressionIndicator } from './CompressionIndicator'
import { useConversationStore } from '../../stores/conversation-store'
import { useSettingsStore } from '../../stores'
import { useAgentStore } from '../../stores/agent-store'
import { useChat } from '../../hooks/use-chat'
import { useWorkspaceCompression } from '../../hooks/use-workspace-compression'
import type { Workspace, Message, MessageAttachment, PromptRuntimeContext, Conversation } from '../../types'

// ---- 消息渲染分组（与 ChatWindow 相同逻辑） ----

type RenderGroup =
  | { type: 'single'; message: Message }
  | { type: 'assistant-group'; messages: Message[] }

function groupMessages(messages: Message[]): RenderGroup[] {
  const groups: RenderGroup[] = []
  let pendingGroup: Message[] = []

  const flushGroup = () => {
    if (pendingGroup.length === 0) return
    if (pendingGroup.length === 1) {
      groups.push({ type: 'single', message: pendingGroup[0] })
    } else {
      groups.push({ type: 'assistant-group', messages: [...pendingGroup] })
    }
    pendingGroup = []
  }

  for (const msg of messages) {
    if (msg.role === 'user' || msg.role === 'system') {
      flushGroup()
      groups.push({ type: 'single', message: msg })
    } else if (msg.role === 'tool') {
      pendingGroup.push(msg)
    } else if (msg.role === 'assistant') {
      if (msg.agentSteps && msg.agentSteps.length > 0) {
        flushGroup()
        groups.push({ type: 'single', message: msg })
      } else {
        pendingGroup.push(msg)
      }
    }
  }
  flushGroup()
  return groups
}

// ---- 压缩标记数据类型 ----

interface CompressionData {
  checkpointId: string
  compressedAt: number
  compressedMessageCount?: number
  tokensBefore?: number
}

// ---- 格式化相对时间 ----

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`
  if (diff < day) return `${Math.floor(diff / hour)}小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前`
  return new Date(timestamp).toLocaleDateString('zh-CN')
}

// ---- 主组件 ----

interface WorkspaceChatPanelProps {
  workspace: Workspace
}

export function WorkspaceChatPanel({ workspace }: WorkspaceChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { getVisibleMessages, getMessages, switchBranch, getConversation,
    createConversation, deleteConversation, selectConversation,
    getConversationsByWorkspaceId } = useConversationStore()
  const { showTimestamp, showTokenUsage, showAvatar, messageAlignment } = useSettingsStore()
  const { getAgent } = useAgentStore()

  // 复用现有 useChat hook（支持全部功能：流式/工具调用/Agent/分支/重生成等）
  const {
    sendMessage,
    stopGeneration,
    regenerateMessage,
    editAndResend,
    handleHumanInput,
    resumeAgentTask,
  } = useChat()

  // 压缩检查
  const { prepareCompression, getContextConfig } = useWorkspaceCompression()

  // ---- 多对话管理状态 ----
  const workspaceConversations = useMemo(
    () => getConversationsByWorkspaceId(workspace.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace.id, useConversationStore((s) => s.conversations)]
  )

  // 当前激活的对话 ID（本地状态，默认为最新对话）
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  // 确保 activeConvId 指向有效的对话
  useEffect(() => {
    if (workspaceConversations.length === 0) {
      // 没有对话时自动创建一个
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
      // 当前激活对话不存在时，选择最新的
      setActiveConvId(workspaceConversations[0].id)
      selectConversation(workspaceConversations[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceConversations.length, activeConvId, workspace.id])

  // 点击外部关闭下拉菜单
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

  // ---- 对话操作 ----

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
    // 如果只剩一个对话，不允许删除
    if (workspaceConversations.length <= 1) return
    deleteConversation(convId)
    // 如果删除的是当前激活的对话，切换到最新的
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
    const newTitle = prompt('重命名对话', current?.title ?? '')
    if (newTitle && newTitle.trim()) {
      useConversationStore.getState().renameConversation(convId, newTitle.trim())
    }
  }, [getConversation])

  // ---- 当前对话数据 ----

  const conversationId = activeConvId ?? undefined
  const currentConversation = conversationId ? getConversation(conversationId) : undefined
  const activeBranches = currentConversation?.activeBranches ?? {}

  // 获取当前对话关联的 Agent
  const currentAgent = currentConversation?.agentId ? getAgent(currentConversation.agentId) : undefined
  const leaderAgent = workspace.leaderAgentId ? getAgent(workspace.leaderAgentId) : currentAgent

  // 构建 Prompt 运行时上下文
  const runtimeContext: PromptRuntimeContext = useMemo(() => ({
    currentAgentName: leaderAgent?.name,
    defaultModel: leaderAgent?.modelConfig?.modelId,
  }), [leaderAgent?.name, leaderAgent?.modelConfig?.modelId])

  // 获取消息（支持分支切换）
  const messages = conversationId ? getVisibleMessages(conversationId) : []

  // 消息分组
  const renderGroups = useMemo(() => groupMessages(messages), [messages])

  // 是否正在流式输出
  const isStreaming = messages.some((m) => m.isStreaming)

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Token 估算
  const estimateTokens = useCallback((msgs: Message[]): number => {
    const totalChars = msgs.reduce((sum, m) => sum + (m.content?.length ?? 0), 0)
    return Math.ceil(totalChars / 3)
  }, [])

  // ---- 压缩检查 ----
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
        // 使用 conversationStore 直接添加系统消息（带压缩 metadata）
        useConversationStore.getState().addMessage(conversationId, {
          conversationId,
          role: 'system',
          content: `[上下文压缩] 已压缩 ${marker.compressedMessageCount} 条历史消息并创建存档点`,
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
  }, [conversationId, getContextConfig, estimateTokens, prepareCompression])

  // ---- 发送消息（包装 useChat.sendMessage，附加压缩检查） ----
  const handleSend = useCallback(
    async (content: string, attachments?: MessageAttachment[]) => {
      if (!conversationId) return
      sendMessage(content, conversationId, attachments)
      // 发送后异步检查压缩（非阻塞）
      setTimeout(() => {
        const msgs = getMessages(conversationId)
        checkAndCompress(msgs)
      }, 100)
    },
    [conversationId, sendMessage, getMessages, checkAndCompress]
  )

  // ---- 切换分支 ----
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

  // ---- 导出为全局对话 ----
  const handleExport = useCallback(async () => {
    if (!conversationId) return
    // 从工作区对话中移除 workspaceId，使其出现在全局对话列表
    useConversationStore.getState().removeConversationWorkspaceId(conversationId)
  }, [conversationId])

  const activeConvTitle = currentConversation?.title ?? workspace.name

  return (
    <div className="flex flex-col h-full">
      {/* ---- 对话管理栏 ---- */}
      <div className="relative z-10 flex-shrink-0 border-b border-surface-200/80 dark:border-surface-700/60 bg-white/60 dark:bg-surface-900/60 backdrop-blur-sm">
        <div className="flex items-center gap-1.5 px-3 py-1.5">
          {/* 对话选择器 */}
          <div className="relative flex-1 min-w-0" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-1.5 w-full px-2 py-1 rounded-lg text-xs text-gray-700 dark:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            >
              <MessageSquare size={13} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <span className="truncate font-medium">{activeConvTitle}</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                {messages.length > 0 ? `${messages.length}条` : ''}
              </span>
              <ChevronDown
                size={12}
                className={`flex-shrink-0 text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
              />
            </button>

            {/* 下拉菜单 */}
            {showDropdown && (
              <div className="dropdown-panel absolute top-full left-0 right-0 mt-1 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                {/* 新建对话按钮 */}
                <button
                  onClick={handleCreateConversation}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-accent-600 dark:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-900/20 border-b border-surface-100 dark:border-surface-700 transition-colors"
                >
                  <Plus size={13} />
                  <span>新建对话</span>
                </button>

                {/* 对话列表 */}
                {workspaceConversations.map((conv) => {
                  const isActive = conv.id === activeConvId
                  const convMessages = useConversationStore.getState().messages[conv.id] ?? []
                  const preview = conv.lastMessagePreview || convMessages[convMessages.length - 1]?.content?.slice(0, 40) || '空对话'
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
                          {formatRelativeTime(conv.updatedAt)} · {conv.messageCount}条消息
                        </p>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRenameConversation(conv.id)
                          }}
                          className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          title="重命名"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                          </svg>
                        </button>
                        {workspaceConversations.length > 1 && (
                          <button
                            onClick={(e) => handleDeleteConversation(e, conv.id)}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
                            title="删除对话"
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

          {/* 新建对话按钮（始终可见） */}
          <button
            onClick={handleCreateConversation}
            className="p-1.5 rounded-lg text-gray-400 hover:text-accent-600 dark:hover:text-accent-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            title="新建对话"
          >
            <Plus size={14} />
          </button>

          {/* 导出为全局对话 */}
          <button
            onClick={handleExport}
            disabled={messages.length === 0}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="将此对话移出工作区，变为全局对话"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {messages.length === 0 ? (
          // 工作区空状态
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center mb-4">
              {leaderAgent?.avatar ? (
                <span className="text-2xl">{leaderAgent.avatar}</span>
              ) : (
                <Bot size={28} className="text-teal-500" />
              )}
            </div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {leaderAgent?.name || 'AI 领导'} 就绪
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs mb-4">
              在此输入指令，AI 将分析任务、拆解步骤并协调执行。
            </p>
            {/* 快捷提示词 */}
            <div className="flex flex-wrap justify-center gap-2">
              {['检查代码质量', '重构重复函数', '添加单元测试'].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSend(suggestion)}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // 消息列表 - 复用 MessageItem / AssistantGroupBubble
          <div className="max-w-3xl mx-auto py-4 flex flex-col overflow-hidden">
            {renderGroups.map((group) => {
              if (group.type === 'assistant-group') {
                return (
                  <AssistantGroupBubble
                    key={`group-${group.messages[0].id}`}
                    messages={group.messages}
                    showTimestamp={showTimestamp}
                    showTokenUsage={showTokenUsage}
                    showAvatar={showAvatar}
                    messageAlignment={messageAlignment}
                    onRegenerate={regenerateMessage}
                  />
                )
              }
              const msg = group.message

              // 系统消息：检测压缩标记，渲染 CompressionIndicator
              if (msg.role === 'system') {
                const compressionData = msg.metadata?.compression as CompressionData | undefined
                if (compressionData) {
                  return (
                    <div key={msg.id} className="px-4 py-2">
                      <CompressionIndicator
                        checkpointId={compressionData.checkpointId}
                        compressedAt={compressionData.compressedAt}
                        compressedMessageCount={compressionData.compressedMessageCount}
                        tokensBefore={compressionData.tokensBefore}
                      />
                    </div>
                  )
                }
              }

              return (
                <MessageItem
                  key={msg.id}
                  message={msg}
                  showTimestamp={showTimestamp}
                  showTokenUsage={showTokenUsage}
                  showAvatar={showAvatar}
                  messageAlignment={messageAlignment}
                  onRegenerate={regenerateMessage}
                  onEditAndResend={editAndResend}
                  onHumanInput={handleHumanInput}
                  onResumeAgentTask={resumeAgentTask}
                  activeBranchIndex={getActiveBranchIndex(msg.id)}
                  onSwitchBranch={handleSwitchBranch}
                />
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 输入框 - 复用 MessageInput */}
      <div className="flex-shrink-0 border-t border-surface-200 dark:border-surface-700/60">
        <MessageInput
          onSend={handleSend}
          onStop={stopGeneration}
          isStreaming={isStreaming}
          runtimeContext={runtimeContext}
        />
      </div>
    </div>
  )
}
