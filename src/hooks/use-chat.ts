import { useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { aiService } from '../services/ai-service'
import { toolService } from '../services/tool-service'
import { runAgent, resumeAgent } from '../services/agent-engine'
import { BUILT_IN_TOOLS, AGENT_BUILTIN_TOOLS } from '../services/built-in-tools'
import { useConversationStore } from '../stores/conversation-store'
import { useGlobalConfigStore } from '../stores/global-config-store'
import { useAgentStore } from '../stores/agent-store'
import { generateTitleFromContent } from '../utils/conversation-utils'
import type { Message, Tool, MessageAttachment, AgentStep, AgentProfile } from '../types'

/**
 * 聊天 Hook - 处理消息发送、工具调用、Agent 模式
 */
export function useChat() {
  const abortControllerRef = useRef<AbortController | null>(null)

  const {
    addMessage,
    updateMessage,
    getMessages,
    currentConversationId,
    getConversation,
    renameConversation
  } = useConversationStore()

  const globalConfig = useGlobalConfigStore()
  const { getAgent, getPrompt, selectedPromptId } = useAgentStore()

  const isStreamingRef = useRef(false)

  // 存储 ask_human 工具的 Promise resolver，key 为 stepId
  const humanInputResolversRef = useRef<Map<string, (value: string | string[]) => void>>(new Map())

  /**
   * 获取当前可用的工具列表
   */
  const getAvailableTools = useCallback((): Tool[] => {
    return [...BUILT_IN_TOOLS, ...AGENT_BUILTIN_TOOLS]
  }, [])

  /**
   * 获取当前对话关联的 Agent
   */
  const getCurrentAgent = useCallback((): AgentProfile | undefined => {
    if (!currentConversationId) return undefined
    const conversation = getConversation(currentConversationId)
    if (!conversation?.agentId) return undefined
    return getAgent(conversation.agentId)
  }, [currentConversationId, getConversation, getAgent])

  /**
   * 构建带附件的消息内容
   */
  const buildMessageContent = useCallback((
    content: string,
    attachments?: MessageAttachment[]
  ): string | Array<{ type: string; text?: string; image_url?: { url: string } }> => {
    if (!attachments || attachments.length === 0) {
      return content
    }

    const hasImages = attachments.some(att => att.type.startsWith('image/'))

    // 收集非图片附件的文本内容
    const nonImageTextParts: string[] = []
    for (const att of attachments) {
      if (!att.type.startsWith('image/') && att.content && !att.content.startsWith('data:')) {
        nonImageTextParts.push(`\n--- 文件: ${att.name} ---\n${att.content}\n--- 文件结束 ---\n`)
      }
    }
    const fileTextContent = nonImageTextParts.join('')

    if (hasImages) {
      // 多模态格式：文本部分包含用户消息 + 文件文本，图片部分单独添加
      const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = []
      const textContent = (content.trim() + fileTextContent).trim()
      if (textContent) {
        parts.push({ type: 'text', text: textContent })
      }
      for (const att of attachments) {
        if (att.type.startsWith('image/')) {
          parts.push({
            type: 'image_url',
            image_url: { url: att.content }
          })
        }
      }
      return parts
    }

    // 纯文本格式：直接拼接用户消息和文件内容
    return content + fileTextContent
  }, [])

  /**
   * 发送消息（Agent 模式）
   */
  const sendMessageWithAgent = useCallback(
    async (
      agent: AgentProfile,
      content: string,
      conversationId: string,
      attachments?: MessageAttachment[]
    ) => {
      const convId = conversationId

      // 构建包含附件内容的完整消息（用于发送给 Agent 引擎）
      const fullContent = buildMessageContent(content, attachments)
      const agentMessage = typeof fullContent === 'string' ? fullContent : content
      // 只存储用户原始文本，文件内容通过 attachments 隐式传递
      addMessage(convId, {
        conversationId: convId,
        role: 'user',
        content: content,
        attachments,
        agentId: agent.id
      })

      // 获取对话历史（不含当前消息）
      const history = getMessages(convId).slice(0, -1)

      // 创建 assistant 消息（Agent 模式，含步骤）
      const assistantMsg = addMessage(convId, {
        conversationId: convId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        agentId: agent.id
      })

      // 获取所有工具（Agent 启用的 + Agent 内置工具）
      const allTools = getAvailableTools()

      // Agent 步骤收集
      const agentSteps: AgentStep[] = []
      let finalContent = ''
      let reasoningContent = ''

      // 将包含附件内容的完整消息传递给 Agent 引擎
      await runAgent(
        agent,
        agentMessage,
        history,
        allTools,
        globalConfig,
        abortControllerRef.current!.signal,
        {
          onStep: (step) => {
            agentSteps.push(step)
            updateMessage(assistantMsg.id, {
              agentSteps: [...agentSteps],
              isStreaming: true
            })
          },
          onToken: (token) => {
            finalContent += token
            // 实时更新消息内容，让用户能看到 Agent 的流式输出
            updateMessage(assistantMsg.id, {
              content: finalContent,
              agentSteps: [...agentSteps],
              isStreaming: true
            })
          },
          onReasoningToken: (token) => {
            reasoningContent += token
            updateMessage(assistantMsg.id, {
              content: finalContent,
              reasoningContent,
              agentSteps: [...agentSteps],
              isStreaming: true
            })
          },
          onStatusChange: (status) => {
            if (status === 'completed' || status === 'error' || status === 'stopped') {
              updateMessage(assistantMsg.id, {
                content: finalContent || (status === 'error' ? 'Agent 执行出错' : ''),
                isStreaming: false,
                isError: status === 'error',
                reasoningContent: reasoningContent || undefined,
                agentSteps: [...agentSteps]
              })
              isStreamingRef.current = false
            }
          },
          onError: (error) => {
            updateMessage(assistantMsg.id, {
              content: finalContent || error,
              isStreaming: false,
              isError: true,
              agentSteps: [...agentSteps]
            })
            isStreamingRef.current = false
          },
          onDone: (doneContent) => {
            // 始终更新消息，确保 isStreaming 被重置
            updateMessage(assistantMsg.id, {
              content: doneContent || finalContent || '',
              isStreaming: false,
              agentSteps: [...agentSteps],
              reasoningContent: reasoningContent || undefined
            })
            isStreamingRef.current = false
          },
          onHumanInput: async (step) => {
            // 暂停 Agent 执行，等待用户在 UI 上点击选项
            return new Promise<string | string[]>((resolve, reject) => {
              humanInputResolversRef.current.set(step.id, resolve)
              // 超时保护：60秒后自动选择第一个选项
              const timeoutId = setTimeout(() => {
                if (humanInputResolversRef.current.has(step.id)) {
                  humanInputResolversRef.current.delete(step.id)
                  const firstOption = step.humanChoice?.options[0]?.value ?? ''
                  const defaultValue = step.humanChoice?.allowMultiple
                        ? [firstOption]
                        : firstOption
                  resolve(defaultValue)
                }
              }, 60_000)
              // 监听中止信号，abort 时立即 reject
              const signal = abortControllerRef.current?.signal
              if (signal?.aborted) {
                clearTimeout(timeoutId)
                humanInputResolversRef.current.delete(step.id)
                reject(new Error('aborted'))
                return
              }
              const onAbort = () => {
                clearTimeout(timeoutId)
                humanInputResolversRef.current.delete(step.id)
                reject(new Error('aborted'))
              }
              signal?.addEventListener('abort', onAbort, { once: true })
            })
          }
        }
      )
    },
    [globalConfig, addMessage, updateMessage, getMessages, getAvailableTools, buildMessageContent]
  )

  /**
   * 发送消息并处理 AI 回复（普通模式）
   */
  const sendMessage = useCallback(
    async (
      content: string,
      conversationId?: string,
      attachments?: MessageAttachment[]
    ) => {
      const convId = conversationId ?? currentConversationId
      if (!convId || (!content.trim() && (!attachments || attachments.length === 0)) || isStreamingRef.current) return

      isStreamingRef.current = true
      abortControllerRef.current = new AbortController()

      // 自动生成对话标题（当标题为默认的"新对话"时，根据首条消息内容生成）
      const currentConv = getConversation(convId)
      if (currentConv && currentConv.title === '新对话' && currentConv.messageCount === 0) {
        const generatedTitle = await generateTitleFromContent(content)
        if (generatedTitle !== '新对话') {
          renameConversation(convId, generatedTitle)
        }
      }

      // 检查是否为 Agent 模式
      const agent = (() => {
        const conversation = getConversation(convId)
        if (!conversation?.agentId) return undefined
        return getAgent(conversation.agentId)
      })()

      if (agent && agent.enabled) {
        // Agent 模式
        await sendMessageWithAgent(agent, content, convId, attachments)
        return
      }

      // 普通模式
      const prompt = selectedPromptId ? getPrompt(selectedPromptId) : null

      // 添加用户消息：只存储用户原始文本，文件内容通过 attachments 传递给 AI 服务
      // 这样用户消息气泡只显示用户输入的文字和附件指示器，不会显示完整的文件内容
      addMessage(convId, {
        conversationId: convId,
        role: 'user',
        content: content,
        attachments
      })

      // 获取对话历史
      const history = getMessages(convId)

      // 准备工具定义
      const tools = getAvailableTools()
      const toolDefs = toolService.toToolDefinitions(tools)

      // 创建 assistant 消息（流式更新）
      const assistantMsg = addMessage(convId, {
        conversationId: convId,
        role: 'assistant',
        content: '',
        isStreaming: true
      })

      // 发送 AI 请求
      let fullContent = ''
      let reasoningContent = ''
      let pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = []

      await aiService.streamChat(
        history,
        globalConfig,
        prompt?.content ?? null,
        toolDefs,
        abortControllerRef.current.signal,
        {
          onToken: (token) => {
            fullContent += token
            updateMessage(assistantMsg.id, { content: fullContent })
          },
          onReasoningToken: (token) => {
            reasoningContent += token
            updateMessage(assistantMsg.id, {
              content: fullContent,
              reasoningContent
            })
          },
          onToolCalls: (toolCalls) => {
            pendingToolCalls = toolCalls
          },
          onUsage: (usage) => {
            updateMessage(assistantMsg.id, {
              content: fullContent,
              tokenUsage: usage
            })
          },
          onDone: async () => {
            if (pendingToolCalls.length > 0) {
              updateMessage(assistantMsg.id, {
                content: fullContent,
                isStreaming: false,
                toolCalls: pendingToolCalls.map((tc) => ({
                  ...tc,
                  arguments: tc.arguments,
                  status: 'pending' as const
                }))
              })
              await handleToolCalls(convId, assistantMsg.id, pendingToolCalls, tools)
            } else {
              updateMessage(assistantMsg.id, {
                content: fullContent,
                isStreaming: false
              })
            }
            isStreamingRef.current = false
          },
          onError: (error) => {
            updateMessage(assistantMsg.id, {
              content: fullContent || error,
              isStreaming: false,
              isError: true
            })
            isStreamingRef.current = false
          }
        }
      )
    },
    [
      currentConversationId,
      globalConfig,
      selectedPromptId,
      getPrompt,
      getAgent,
      getConversation,
      renameConversation,
      addMessage,
      updateMessage,
      getMessages,
      getAvailableTools,
      buildMessageContent,
      sendMessageWithAgent
    ]
  )

  /**
   * 处理工具调用（普通模式）
   */
  const handleToolCalls = useCallback(
    async (
      conversationId: string,
      assistantMsgId: string,
      toolCalls: Array<{ id: string; name: string; arguments: string }>,
      tools: Tool[]
    ) => {
      const currentMsg = useConversationStore.getState().messages[conversationId]?.find(
        (m) => m.id === assistantMsgId
      )
      if (!currentMsg?.toolCalls) return

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i]

        const updatedToolCalls = [...currentMsg.toolCalls]
        updatedToolCalls[i] = { ...updatedToolCalls[i], status: 'running' }
        updateMessage(assistantMsgId, { toolCalls: updatedToolCalls })

        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.arguments)
        } catch {
          // 空参数
        }

        const result = await toolService.executeTool(tc.name, args, tools)

        updatedToolCalls[i] = {
          ...updatedToolCalls[i],
          status: result.success ? 'completed' : 'error',
          result: result.success ? result.data : result.error
        }
        updateMessage(assistantMsgId, { toolCalls: updatedToolCalls })

        addMessage(conversationId, {
          conversationId,
          role: 'tool',
          content: result.success ? result.data : result.error ?? '工具执行失败',
          toolCallId: tc.id,
          toolName: tc.name
        })
      }

      const prompt = selectedPromptId ? getPrompt(selectedPromptId) : null
      const history = getMessages(conversationId)
      const toolDefs = toolService.toToolDefinitions(tools)

      const finalMsg = addMessage(conversationId, {
        conversationId,
        role: 'assistant',
        content: '',
        isStreaming: true
      })

      let fullContent = ''
      const controller = new AbortController()
      abortControllerRef.current = controller

      await aiService.streamChat(
        history,
        globalConfig,
        prompt?.content ?? null,
        toolDefs,
        controller.signal,
        {
          onToken: (token) => {
            fullContent += token
            updateMessage(finalMsg.id, { content: fullContent })
          },
          onUsage: (usage) => {
            updateMessage(finalMsg.id, { tokenUsage: usage })
          },
          onDone: () => {
            updateMessage(finalMsg.id, { content: fullContent, isStreaming: false })
            isStreamingRef.current = false
          },
          onError: (error) => {
            updateMessage(finalMsg.id, {
              content: fullContent || error,
              isStreaming: false,
              isError: true
            })
            isStreamingRef.current = false
          }
        }
      )
    },
    [globalConfig, selectedPromptId, getPrompt, addMessage, updateMessage, getMessages]
  )

  /**
   * 停止生成
   */
  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
    isStreamingRef.current = false
    // 清理所有等待中的 humanInput resolver，让 Agent 循环能立即退出
    humanInputResolversRef.current.clear()
  }, [])

  /**
   * 重新生成消息
   */
  const regenerateMessage = useCallback(
    async (messageId: string) => {
      if (!currentConversationId || isStreamingRef.current) return

      const messages = getMessages(currentConversationId)
      const msgIndex = messages.findIndex((m) => m.id === messageId)
      if (msgIndex < 0) return

      for (let i = messages.length - 1; i >= msgIndex; i--) {
        useConversationStore.getState().deleteMessage(currentConversationId, messages[i].id)
      }

      const updatedMessages = getMessages(currentConversationId)
      const lastUserMsg = [...updatedMessages].reverse().find((m) => m.role === 'user')
      if (lastUserMsg) {
        await sendMessage(lastUserMsg.content, currentConversationId, lastUserMsg.attachments)
      }
    },
    [currentConversationId, getMessages, sendMessage]
  )

  /**
   * 处理用户在 Agent 步骤中的选择（ask_human 工具）
   */
  const handleHumanInput = useCallback((stepId: string, value: string | string[]) => {
    const resolver = humanInputResolversRef.current.get(stepId)
    if (resolver) {
      resolver(value)
      humanInputResolversRef.current.delete(stepId)
    }

    // 更新消息中的 agentSteps，触发 React 重新渲染显示用户选择
    if (currentConversationId) {
      const msgs = getMessages(currentConversationId)
      const assistantMsg = [...msgs].reverse().find(m => m.isStreaming && m.agentSteps?.length)
      if (assistantMsg) {
        updateMessage(assistantMsg.id, {
          agentSteps: [...(assistantMsg.agentSteps ?? [])]
        })
      }
    }
  }, [currentConversationId, getMessages, updateMessage])

  /**
   * 继续执行出错的 Agent 任务
   */
  const resumeAgentTask = useCallback(
    async (messageId: string) => {
      if (!currentConversationId || isStreamingRef.current) return

      const messages = getMessages(currentConversationId)
      const msgIndex = messages.findIndex((m) => m.id === messageId)
      if (msgIndex < 0) return

      const errorMsg = messages[msgIndex]
      if (!errorMsg.isError || !errorMsg.agentId) return

      // 获取关联的 Agent
      const agent = getAgent(errorMsg.agentId)
      if (!agent || !agent.enabled) return

      isStreamingRef.current = true
      abortControllerRef.current = new AbortController()

      // 更新原消息为恢复中状态
      updateMessage(messageId, {
        isStreaming: true,
        isError: false
      })

      // 获取对话历史（包含之前的所有消息，让 resumeAgent 从中恢复上下文）
      const history = getMessages(currentConversationId)

      // 获取所有工具
      const allTools = getAvailableTools()

      // Agent 步骤收集（追加到已有步骤）
      const existingSteps = errorMsg.agentSteps ?? []
      const agentSteps: AgentStep[] = [...existingSteps]
      let finalContent = ''
      let reasoningContent = errorMsg.reasoningContent ?? ''

      await resumeAgent(
        agent,
        history,
        allTools,
        globalConfig,
        abortControllerRef.current.signal,
        {
          onStep: (step) => {
            agentSteps.push(step)
            updateMessage(messageId, {
              agentSteps: [...agentSteps],
              isStreaming: true
            })
          },
          onToken: (token) => {
            finalContent += token
            updateMessage(messageId, {
              content: finalContent,
              agentSteps: [...agentSteps],
              isStreaming: true
            })
          },
          onReasoningToken: (token) => {
            reasoningContent += token
            updateMessage(messageId, {
              content: finalContent,
              reasoningContent,
              agentSteps: [...agentSteps],
              isStreaming: true
            })
          },
          onStatusChange: (status) => {
            if (status === 'completed' || status === 'error' || status === 'stopped') {
              updateMessage(messageId, {
                content: finalContent || (status === 'error' ? 'Agent 执行出错' : ''),
                isStreaming: false,
                isError: status === 'error',
                reasoningContent: reasoningContent || undefined,
                agentSteps: [...agentSteps]
              })
              isStreamingRef.current = false
            }
          },
          onError: (error) => {
            updateMessage(messageId, {
              content: finalContent || error,
              isStreaming: false,
              isError: true,
              agentSteps: [...agentSteps]
            })
            isStreamingRef.current = false
          },
          onDone: (doneContent) => {
            updateMessage(messageId, {
              content: doneContent || finalContent || '',
              isStreaming: false,
              agentSteps: [...agentSteps],
              reasoningContent: reasoningContent || undefined
            })
            isStreamingRef.current = false
          },
          onHumanInput: async (step) => {
            return new Promise<string | string[]>((resolve, reject) => {
              humanInputResolversRef.current.set(step.id, resolve)
              const timeoutId = setTimeout(() => {
                if (humanInputResolversRef.current.has(step.id)) {
                  humanInputResolversRef.current.delete(step.id)
                  const firstOption = step.humanChoice?.options[0]?.value ?? ''
                  const defaultValue = step.humanChoice?.allowMultiple
                        ? [firstOption]
                        : firstOption
                  resolve(defaultValue)
                }
              }, 60_000)
              // 监听中止信号，abort 时立即 reject
              const signal = abortControllerRef.current?.signal
              if (signal?.aborted) {
                clearTimeout(timeoutId)
                humanInputResolversRef.current.delete(step.id)
                reject(new Error('aborted'))
                return
              }
              const onAbort = () => {
                clearTimeout(timeoutId)
                humanInputResolversRef.current.delete(step.id)
                reject(new Error('aborted'))
              }
              signal?.addEventListener('abort', onAbort, { once: true })
            })
          }
        }
      )
    },
    [currentConversationId, globalConfig, addMessage, updateMessage, getMessages, getAvailableTools, getAgent]
  )

  return {
    sendMessage,
    stopGeneration,
    regenerateMessage,
    isStreaming: isStreamingRef.current,
    handleHumanInput,
    resumeAgentTask
  }
}
