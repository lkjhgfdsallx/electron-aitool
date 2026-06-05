import { useRef, useEffect, useCallback, useMemo } from 'react'
import { MessageSquareDashed } from 'lucide-react'
import { MessageItem } from './MessageItem'
import { AssistantGroupBubble } from './AssistantGroupBubble'
import { MessageInput } from './MessageInput'
import { AgentSelector } from './AgentSelector'
import { useConversationStore } from '../../stores/conversation-store'
import { useSettingsStore } from '../../stores'
import { useAgentStore } from '../../stores/agent-store'
import { useChat } from '../../hooks/use-chat'
import type { Message, MessageAttachment } from '../../types'

/** 消息渲染组：单条消息或多条合并的 assistant 组 */
type RenderGroup =
  | { type: 'single'; message: Message }
  | { type: 'assistant-group'; messages: Message[] }

/**
 * 将消息列表分组：
 * - user / system / Agent 模式的 assistant → 独立渲染
 * - 普通模式下连续的 assistant + tool 消息 → 合并为一组
 */
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
      // 工具结果消息归入当前组
      pendingGroup.push(msg)
    } else if (msg.role === 'assistant') {
      // Agent 模式消息（有 agentSteps）独立渲染
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

interface ChatWindowProps {
  onOpenPromptManager?: () => void
  onOpenAgentManager?: () => void
}

export function ChatWindow({ onOpenPromptManager, onOpenAgentManager }: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { currentConversationId, getVisibleMessages, switchBranch, getConversation, setConversationAgent } = useConversationStore()
  const { showTimestamp, showTokenUsage } = useSettingsStore()
  const { getAgent } = useAgentStore()
  const { sendMessage, stopGeneration, regenerateMessage, editAndResend, handleHumanInput, resumeAgentTask } = useChat()

  // 使用可见消息（支持分支切换）
  const messages = currentConversationId ? getVisibleMessages(currentConversationId) : []
  const currentConversation = currentConversationId ? getConversation(currentConversationId) : undefined

  // 将消息分组：普通模式下连续的 assistant+tool 消息合并为一个气泡
  const renderGroups = useMemo(() => groupMessages(messages), [messages])
  const activeBranches = currentConversation?.activeBranches ?? {}

  // 获取当前对话关联的 Agent
  const currentAgent = currentConversation?.agentId ? getAgent(currentConversation.agentId) : undefined

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(
    (content: string, attachments?: MessageAttachment[]) => {
      sendMessage(content, undefined, attachments)
    },
    [sendMessage]
  )

  const handleAgentSelect = useCallback(
    (agentId: string | undefined) => {
      if (currentConversationId) {
        setConversationAgent(currentConversationId, agentId)
      }
    },
    [currentConversationId, setConversationAgent]
  )

  /** 切换分支 */
  const handleSwitchBranch = useCallback(
    (forkMessageId: string, branchIndex: number) => {
      if (currentConversationId) {
        switchBranch(currentConversationId, forkMessageId, branchIndex)
      }
    },
    [currentConversationId, switchBranch]
  )

  /** 获取分支点消息的当前激活分支索引 */
  const getActiveBranchIndex = useCallback(
    (forkMessageId: string): number => {
      return activeBranches[forkMessageId] ?? 0
    },
    [activeBranches]
  )

  // 空状态
  if (!currentConversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center text-gray-400">
          <MessageSquareDashed size={48} className="mx-auto mb-4" />
          <p className="text-lg font-medium">选择或创建一个对话</p>
          <p className="text-sm mt-1">开始与 AI 交流</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Agent 选择栏 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <AgentSelector
          selectedAgentId={currentConversation?.agentId}
          onSelect={handleAgentSelect}
          onOpenAgentManager={onOpenAgentManager}
        />
        {currentAgent && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full">
              Agent 模式
            </span>
            <span className="truncate max-w-[200px]">{currentAgent.description}</span>
          </div>
        )}
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <MessageSquareDashed size={36} className="mx-auto mb-3" />
              {currentAgent ? (
                <>
                  <p className="font-medium">与 Agent "{currentAgent.name}" 对话</p>
                  <p className="text-sm mt-1">{currentAgent.description || '发送消息开始对话'}</p>
                </>
              ) : (
                <p>发送消息开始对话</p>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-4">
            {renderGroups.map((group, idx) => {
              if (group.type === 'assistant-group') {
                return (
                  <AssistantGroupBubble
                    key={`group-${group.messages[0].id}`}
                    messages={group.messages}
                    showTimestamp={showTimestamp}
                    showTokenUsage={showTokenUsage}
                    onRegenerate={regenerateMessage}
                  />
                )
              }
              const msg = group.message
              return (
                <MessageItem
                  key={msg.id}
                  message={msg}
                  showTimestamp={showTimestamp}
                  showTokenUsage={showTokenUsage}
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

      {/* 输入框 */}
      <MessageInput
        onSend={handleSend}
        onStop={stopGeneration}
        isStreaming={messages.some((m) => m.isStreaming)}
        onOpenPromptManager={onOpenPromptManager}
      />
    </div>
  )
}
