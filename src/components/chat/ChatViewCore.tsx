import { useEffect, useMemo, useRef } from 'react'
import { MessageItem } from './MessageItem'
import { AssistantGroupBubble } from './AssistantGroupBubble'
import { MessageInput } from './MessageInput'
import { groupMessages, type RenderGroup } from '../../utils/message-grouping'
import type { Message, MessageAttachment, PromptRuntimeContext } from '../../types'

type MessageAlignment = 'left-right' | 'all-left' | 'all-right' | 'full-width'

const EMPTY_RENDER_GROUPS: RenderGroup[] = []

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
  const streaming = isStreaming ?? messages.some((m) => m.isStreaming)

  const renderGroups = useMemo(() => {
    if (messages.length === 0) return EMPTY_RENDER_GROUPS
    return groupMessages(messages)
  }, [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' })
  }, [messages, streaming])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {headerSlot}

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
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
