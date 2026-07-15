import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageItem } from './MessageItem'
import { AssistantGroupBubble } from './AssistantGroupBubble'
import { MessageInput } from './MessageInput'
import { groupMessages, type RenderGroup } from '../../utils/message-grouping'
import type { Message, MessageAttachment, PromptRuntimeContext } from '../../types'

type MessageAlignment = 'left-right' | 'all-left' | 'all-right' | 'full-width'

const EMPTY_RENDER_GROUPS: RenderGroup[] = []

/** 距离底部多少像素内视为"在底部" */
const BOTTOM_THRESHOLD = 100

/** 判断滚动容器是否接近底部 */
function isNearBottom(container: HTMLElement): boolean {
  const { scrollTop, scrollHeight, clientHeight } = container
  return scrollHeight - scrollTop - clientHeight < BOTTOM_THRESHOLD
}

export interface ChatViewCoreProps {
  conversationId: string | undefined
  messages: Message[]
  headerSlot?: React.ReactNode
  emptyStateSlot?: React.ReactNode
  renderSystemMessage?: (message: Message) => React.ReactNode | null
  inputPrefixSlot?: React.ReactNode
  onSwitchBranch: (forkMessageId: string, branchIndex: number) => void
  getActiveBranchIndex: (forkMessageId: string) => number
  onRegenerate: (messageId: string) => void
  onEditAndResend?: (messageId: string, content: string) => void
  onContinueGeneration?: (messageId: string) => void
  onHumanInput?: (stepId: string, value: string | string[]) => void
  /** 批准 Agent 计划（draft → approved） */
  onApprovePlan?: (plan: import('../../types').AgentPlan) => void
  /** 拒绝 Agent 计划并要求重新规划 */
  onRejectPlan?: (plan: import('../../types').AgentPlan, reason?: string) => void
  onSend: (content: string, attachments?: MessageAttachment[]) => void
  onStop: () => void
  isStreaming?: boolean
  showTimestamp: boolean
  showTokenUsage: boolean
  showAvatar: boolean
  messageAlignment: MessageAlignment
  runtimeContext?: PromptRuntimeContext
  workspacePath?: string
  isWorkspaceMode?: boolean
  onOpenPromptManager?: () => void
  inputClassName?: string
}

export function ChatViewCore({
  conversationId,
  messages,
  headerSlot,
  emptyStateSlot,
  renderSystemMessage,
  inputPrefixSlot,
  onSwitchBranch,
  getActiveBranchIndex,
  onRegenerate,
  onEditAndResend,
  onContinueGeneration,
  onHumanInput,
  onApprovePlan,
  onRejectPlan,
  onSend,
  onStop,
  isStreaming,
  showTimestamp,
  showTokenUsage,
  showAvatar,
  messageAlignment,
  runtimeContext,
  workspacePath,
  isWorkspaceMode,
  onOpenPromptManager,
  inputClassName,
}: ChatViewCoreProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const streaming = isStreaming ?? messages.some((m) => m.isStreaming)

  const renderGroups = useMemo(() => {
    if (messages.length === 0) return EMPTY_RENDER_GROUPS
    return groupMessages(messages)
  }, [messages])

  /** 滚动事件处理 */
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (container) {
      const atBottom = isNearBottom(container)
      isAtBottomRef.current = atBottom
      setIsAtBottom(atBottom)
    }
  }, [])

  /** 智能滚动：仅在用户位于底部时才自动滚动 */
  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' })
    }
  }, [messages, streaming])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {headerSlot}

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onScroll={handleScroll}
      >
        {messages.length === 0 ? (
          emptyStateSlot ?? null
        ) : (
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
                    onRegenerate={onRegenerate}
                    onContinueGeneration={onContinueGeneration}
                  />
                )
              }

              const msg = group.message
              if (msg.role === 'system' && renderSystemMessage) {
                const custom = renderSystemMessage(msg)
                if (custom !== null && custom !== undefined) {
                  return <div key={msg.id}>{custom}</div>
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
                  onRegenerate={onRegenerate}
                  onEditAndResend={onEditAndResend}
                  onContinueGeneration={onContinueGeneration}
                  onHumanInput={onHumanInput}
                  onApprovePlan={onApprovePlan}
                  onRejectPlan={onRejectPlan}
                  activeBranchIndex={getActiveBranchIndex(msg.id)}
                  onSwitchBranch={onSwitchBranch}
                />
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {inputPrefixSlot}
      <div className={inputClassName}>
        <MessageInput
          onSend={onSend}
          onStop={onStop}
          isStreaming={streaming}
          onOpenPromptManager={onOpenPromptManager}
          runtimeContext={runtimeContext}
          workspacePath={workspacePath}
          isWorkspaceMode={isWorkspaceMode}
        />
      </div>
    </div>
  )
}
