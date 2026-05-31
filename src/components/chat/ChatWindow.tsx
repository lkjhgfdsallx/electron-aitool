import { useRef, useEffect, useCallback } from 'react'
import { MessageSquareDashed } from 'lucide-react'
import { MessageItem } from './MessageItem'
import { MessageInput } from './MessageInput'
import { AgentSelector } from './AgentSelector'
import { useConversationStore } from '../../stores/conversation-store'
import { useSettingsStore } from '../../stores'
import { useAgentStore } from '../../stores/agent-store'
import { useChat } from '../../hooks/use-chat'
import type { MessageAttachment } from '../../types'

interface ChatWindowProps {
  onOpenPromptManager?: () => void
  onOpenAgentManager?: () => void
}

export function ChatWindow({ onOpenPromptManager, onOpenAgentManager }: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { currentConversationId, getMessages, getConversation, setConversationAgent } = useConversationStore()
  const { showTimestamp, showTokenUsage } = useSettingsStore()
  const { getAgent } = useAgentStore()
  const { sendMessage, stopGeneration, regenerateMessage, handleHumanInput, resumeAgentTask } = useChat()

  const messages = currentConversationId ? getMessages(currentConversationId) : []

  // 获取当前对话关联的 Agent
  const currentConversation = currentConversationId ? getConversation(currentConversationId) : undefined
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
            {messages.map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                showTimestamp={showTimestamp}
                showTokenUsage={showTokenUsage}
                onRegenerate={regenerateMessage}
                onHumanInput={handleHumanInput}
                onResumeAgentTask={resumeAgentTask}
              />
            ))}
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
