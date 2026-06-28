import { useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { aiService } from '../services/ai-service'
import { toolService } from '../services/tool-service'
import { runAgent, resumeAgent } from '../services/agent-engine'
import type { WorkspaceContext, SubAgentActivityEvent } from '../services/agent-engine'
import { BUILT_IN_TOOLS, AGENT_BUILTIN_TOOLS, WORKSPACE_TOOLS } from '../services/built-in-tools'
import { useCustomToolStore } from '../stores/custom-tool-store'
import { reportStore } from '../services/report-store'
import { knowledgeBaseService } from '../services/knowledge-base-service'
import { useConversationStore } from '../stores/conversation-store'
import { useGlobalConfigStore } from '../stores/global-config-store'
import { useAgentStore } from '../stores/agent-store'
import { useMCPToolStore } from '../stores/mcp-tool-store'
import { useAIProviderStore } from '../stores/ai-provider-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { useWorkspaceAgentStore } from '../stores/workspace-agent-store'
import { useSettingsStore } from '../stores'
import { generateTitleFromContent } from '../utils/conversation-utils'
import type { Message, Tool, ToolDefinition, MessageAttachment, AgentStep, AgentProfile, SiteAnalyzerLiveProgress, ResolvedAIConfig } from '../types'

/** 根据 finishReason 生成截断/中断提示（'length' 已由自动续写机制处理） */
function getFinishNotice(finishReason?: string): string | null {
  if (!finishReason || finishReason === 'stop' || finishReason === 'length') return null
  if (finishReason === 'abort') {
    return '\n\n> ⚠️ **回复中断**：流连接在生成过程中异常断开，输出可能不完整。请检查网络连接或 API 服务状态。'
  }
  return null
}

/** 将进度事件类型映射到阶段 */
/** 检查通知设置并在 AI 回复完成时发送系统通知和播放提示音 */
function notifyIfReady(title: string, body: string): void {
  try {
    const { enableNotification, enableSound, notificationSound } = useSettingsStore.getState()
    if (enableNotification && window.electronAPI?.notification?.show) {
      window.electronAPI.notification.show(title, body)
    }
    if (enableSound && window.electronAPI?.notification?.playSound) {
      window.electronAPI.notification.playSound(notificationSound || 'default')
    }
  } catch {
    // 静默失败，不影响主流程
  }
}

function mapProgressTypeToPhase(type: string): SiteAnalyzerLiveProgress['phase'] {
  switch (type) {
    case 'started': return 'browser'
    case 'logging_in':
    case 'login_success':
    case 'login_failed': return 'login'
    case 'crawling':
    case 'page_crawled': return 'crawling'
    case 'analyzing':
    case 'ai_analyzing_page':
    case 'ai_analysis_done': return 'analyzing'
    case 'generating_report':
    case 'report_ready': return 'report'
    case 'completed': return 'completed'
    case 'error': return 'error'
    default: return 'crawling'
  }
}

/**
 * 聊天 Hook - 处理消息发送、工具调用、Agent 模式
 */
export function useChat() {
  const abortControllerRef = useRef<AbortController | null>(null)
  // 网站分析开始时间（用于在进度面板中显示耗时）
  const siteAnalyzerStartTimeRef = useRef<number>(0)

  /** 根据对话的工作区关联，构建 WorkspaceContext 传递给 agent-engine */
  const buildWorkspaceContext = useCallback((
    conversationId: string,
    onSubAgentActivity?: (event: SubAgentActivityEvent) => void
  ): WorkspaceContext | undefined => {
    const conv = useConversationStore.getState().conversations.find((c) => c.id === conversationId)
    if (!conv?.workspaceId) return undefined
    const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === conv.workspaceId)
    if (!ws) return undefined
    // 从全局 Agent 和工作区 Agent 中查找团队成员
    const allAgents = [
      ...useAgentStore.getState().agents,
      ...useWorkspaceAgentStore.getState().workspaceAgents,
    ]
    const teamAgents = ws.teamAgentIds
      .map((id) => allAgents.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => ({ id: a.id, name: a.name, description: a.description, avatar: a.avatar ?? '🤖' }))

    // 构建子任务分派回调（真正运行子 Agent 并返回结果）
    const dispatchSubTask = async (agentId: string, taskDescription: string): Promise<string> => {
      // 优先从工作区 Agent 中查找，再从全局 Agent 中查找
      const targetAgent = useWorkspaceAgentStore.getState().getWorkspaceAgent(agentId)
        ?? useAgentStore.getState().getAgent(agentId)
      if (!targetAgent) throw new Error(`Agent "${agentId}" 不存在`)

      // 解析目标 Agent 的 AI 配置
      const providerStore = useAIProviderStore.getState()
      const config = targetAgent.modelConfig?.providerId
        ? providerStore.resolveConfig(targetAgent.modelConfig.providerId)
        : providerStore.resolveConfig()
      if (!config) throw new Error('无法解析目标 Agent 的 AI 配置')

      // 获取目标 Agent 可用的工具
      const allTools: Tool[] = [
        ...BUILT_IN_TOOLS,
        ...AGENT_BUILTIN_TOOLS,
        ...WORKSPACE_TOOLS,
        ...useCustomToolStore.getState().customTools.filter((t) => t.enabled),
      ]
      const targetTools = allTools.filter(
        (t) => targetAgent.enabledToolIds.includes(t.id) && t.enabled
      )

      // 从 store 读取最新的团队成员列表（而非使用快照）
      const freshWs = useWorkspaceStore.getState().workspaces.find((w) => w.id === ws.id)
      const freshAllAgents = [
        ...useAgentStore.getState().agents,
        ...useWorkspaceAgentStore.getState().workspaceAgents,
      ]
      const freshTeamAgents = (freshWs?.teamAgentIds ?? [])
        .map((id) => freshAllAgents.find((a) => a.id === id))
        .filter((a): a is NonNullable<typeof a> => !!a)
        .map((a) => ({ id: a.id, name: a.name, description: a.description, avatar: a.avatar ?? '🤖' }))

      // 构建子 Agent 的工作区上下文（不含 dispatchSubTask/createAgent 以避免递归）
      const subWorkspaceContext: WorkspaceContext | undefined = ws
        ? { folderPath: ws.folderPath, workspaceId: ws.id, teamAgents: freshTeamAgents }
        : undefined

      // 运行子 Agent 并收集输出
      let finalContent = ''
      const subSignal = new AbortController().signal

      await runAgent(
        targetAgent,
        taskDescription,
        [],  // 子 Agent 无历史上下文
        targetTools,
        config,
        subSignal,
        {
          onStep: (step) => {
            // 将子 Agent 步骤实时上报给 UI
            onSubAgentActivity?.({
              agentId: targetAgent.id,
              agentName: targetAgent.name,
              agentAvatar: targetAgent.avatar,
              type: 'step',
              step
            })
          },
          onToken: (token) => {
            finalContent += token
          },
          onReasoningToken: () => {},
          onStatusChange: (status) => {
            onSubAgentActivity?.({
              agentId: targetAgent.id,
              agentName: targetAgent.name,
              agentAvatar: targetAgent.avatar,
              type: 'status_change',
              status
            })
          },
          onError: (err) => {
            onSubAgentActivity?.({
              agentId: targetAgent.id,
              agentName: targetAgent.name,
              agentAvatar: targetAgent.avatar,
              type: 'error',
              error: err
            })
            throw new Error(err)
          },
          onDone: (content) => { if (content) finalContent = content },
        },
        subWorkspaceContext
      )

      return finalContent
    }

    // 构建创建 Agent 回调（创建新 Agent 并加入工作区团队）
    const createAgent = async (input: {
      name: string
      description: string
      systemPrompt: string
      avatar?: string
      enabledToolIds?: string[]
    }): Promise<string> => {
      // 为新 Agent 设置合理的默认工具：工作区文件工具 + 核心工具
      const defaultWorkspaceToolIds = [
        'workspace:read_file', 'workspace:write_file',
        'workspace:list_files', 'workspace:execute_command'
      ]
      const toolIds = input.enabledToolIds && input.enabledToolIds.length > 0
        ? input.enabledToolIds
        : defaultWorkspaceToolIds

      // 创建工作区 Agent（而非全局 Agent），自动带有 workspace 标签
      const workspaceAgentStore = useWorkspaceAgentStore.getState()
      const newAgent = await workspaceAgentStore.createWorkspaceAgent({
        name: input.name,
        description: input.description,
        systemPrompt: input.systemPrompt,
        avatar: input.avatar ?? '🤖',
        enabledToolIds: toolIds,
        planningStrategy: 'react',
        memoryConfig: { historyTurns: 10, longTermEnabled: false, crossSession: false },
        termination: { maxSteps: 50, timeoutSeconds: 0, autoStopOnGoal: true },
        modelConfig: {},
        enabled: true,
      }, ws.folderPath)

      // 从 store 读取最新的 teamAgentIds（而非使用快照），避免覆盖之前创建的 Agent
      const freshWs = useWorkspaceStore.getState().workspaces.find((w) => w.id === ws.id)
      const currentTeamAgentIds = freshWs?.teamAgentIds ?? []
      useWorkspaceStore.getState().updateWorkspace({
        id: ws.id,
        teamAgentIds: [...currentTeamAgentIds, newAgent.id],
      })

      // 同步更新 teamAgents 数组引用，使后续的 dispatchSubTask 能看到新 Agent
      teamAgents.push({
        id: newAgent.id,
        name: newAgent.name,
        description: newAgent.description,
        avatar: newAgent.avatar ?? '🤖',
      })

      return newAgent.id
    }

    return {
      folderPath: ws.folderPath,
      workspaceId: ws.id,
      teamAgents,
      dispatchSubTask,
      createAgent,
    }
  }, [])

  const {
    addMessage,
    updateMessage,
    getMessages,
    getVisibleMessages,
    switchBranch,
    getCurrentBranchIndex,
    currentConversationId,
    getConversation,
    renameConversation
  } = useConversationStore()

  const globalConfig = useGlobalConfigStore()
  const resolveConfig = useAIProviderStore((s) => s.resolveConfig)
  const getRequestConfig = useAIProviderStore((s) => s.getRequestConfig)
  const { getAgent, getPrompt, selectedPromptId } = useAgentStore()

  /**
   * 解析当前对话的 AI 配置（优先级：Agent 绑定 > 对话级别 > 全局默认）
   */
  const resolveCurrentConfig = useCallback(
    (conversationId?: string, agent?: AgentProfile): ResolvedAIConfig | null => {
      // Agent 模式：优先使用 agent 绑定的 provider
      if (agent?.modelConfig?.providerId) {
        return resolveConfig(agent.modelConfig.providerId)
      }
      // 对话级别配置
      const conv = conversationId ? getConversation(conversationId) : undefined
      if (conv?.aiConfig) {
        return resolveConfig(conv.aiConfig.providerId)
      }
      // 全局默认
      return resolveConfig()
    },
    [resolveConfig, getConversation]
  )

  /**
   * 解析当前对话的请求配置（与 resolveCurrentConfig 对应）
   */
  const resolveCurrentRequestConfig = useCallback(
    (conversationId?: string, agent?: AgentProfile) => {
      if (agent?.modelConfig?.providerId) {
        return getRequestConfig(agent.modelConfig.providerId)
      }
      const conv = conversationId ? getConversation(conversationId) : undefined
      if (conv?.aiConfig) {
        return getRequestConfig(conv.aiConfig.providerId)
      }
      return getRequestConfig()
    },
    [getRequestConfig, getConversation]
  )

  const isStreamingRef = useRef(false)

  // 存储 ask_human 工具的 Promise resolver，key 为 stepId
  const humanInputResolversRef = useRef<Map<string, (value: string | string[]) => void>>(new Map())

  /**
   * 获取当前可用的工具列表（内置工具 + Agent 内置工具 + MCP 工具）
   */
  const getAvailableTools = useCallback((): Tool[] => {
    const mcpTools = useMCPToolStore.getState().mcpTools
    const customTools = useCustomToolStore.getState().customTools.filter((t) => t.enabled)
    return [...BUILT_IN_TOOLS, ...AGENT_BUILTIN_TOOLS, ...mcpTools, ...customTools]
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

      // 获取当前分支索引，确保新消息继承正确的分支
      const currentBranchIdx = getCurrentBranchIndex(convId)

      // 构建包含附件内容的完整消息（用于发送给 Agent 引擎）
      const fullContent = buildMessageContent(content, attachments)
      const agentMessage = typeof fullContent === 'string' ? fullContent : content
      // 只存储用户原始文本，文件内容通过 attachments 隐式传递
      addMessage(convId, {
        conversationId: convId,
        role: 'user',
        content: content,
        attachments,
        agentId: agent.id,
        branchIndex: currentBranchIdx
      })

      // 获取对话历史（不含当前消息）
      const history = getMessages(convId).slice(0, -1)

      // 创建 assistant 消息（Agent 模式，含步骤）
      const assistantMsg = addMessage(convId, {
        conversationId: convId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        agentId: agent.id,
        branchIndex: currentBranchIdx
      })

      // 获取所有工具（Agent 启用的 + Agent 内置工具）
      const allTools = getAvailableTools()

      // Agent 步骤收集
      const agentSteps: AgentStep[] = []
      let finalContent = ''
      let reasoningContent = ''

      // 子 Agent 活动回调：将子 Agent 步骤实时注入到 Leader 消息的 agentSteps 中
      const onSubAgentActivity = (event: SubAgentActivityEvent) => {
        if (event.type === 'step' && event.step) {
          // 给步骤打上子 Agent 来源标记
          const subStep: AgentStep = {
            ...event.step,
            sourceAgentId: event.agentId,
            sourceAgentName: event.agentName,
            sourceAgentAvatar: event.agentAvatar,
          }
          agentSteps.push(subStep)
          updateMessage(assistantMsg.id, {
            content: finalContent,
            agentSteps: [...agentSteps],
            isStreaming: true
          })
        } else if (event.type === 'status_change') {
          // 子 Agent 状态变更（completed/error/stopped）时也更新 UI
          if (event.status === 'completed' || event.status === 'error' || event.status === 'stopped') {
            updateMessage(assistantMsg.id, {
              content: finalContent,
              agentSteps: [...agentSteps],
              isStreaming: true // 保持 streaming，因为 Leader 还在等结果
            })
          }
        } else if (event.type === 'error' && event.error) {
          // 子 Agent 出错时记录错误步骤
          const errorStep: AgentStep = {
            id: crypto.randomUUID(),
            type: 'error',
            content: event.error,
            stepIndex: agentSteps.length,
            timestamp: Date.now(),
            sourceAgentId: event.agentId,
            sourceAgentName: event.agentName,
            sourceAgentAvatar: event.agentAvatar,
          }
          agentSteps.push(errorStep)
          updateMessage(assistantMsg.id, {
            content: finalContent,
            agentSteps: [...agentSteps],
            isStreaming: true
          })
        }
      }

      // 将包含附件内容的完整消息传递给 Agent 引擎
      const wsContext = buildWorkspaceContext(convId, onSubAgentActivity)
      await runAgent(
        agent,
        agentMessage,
        history,
        allTools,
        resolveCurrentConfig(convId, agent)!,
        abortControllerRef.current!.signal,
        {
          onStep: (step) => {
            agentSteps.push(step)
            // 当中间步骤（思考/行动）产生时，说明之前的流式内容是中间推理
            // 重置 finalContent，让下一轮 LLM 调用的流式内容从头开始
            if (step.type === 'thinking' || step.type === 'action') {
              finalContent = ''
              reasoningContent = ''
            }
            updateMessage(assistantMsg.id, {
              content: finalContent,
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
              if (status === 'completed') {
                notifyIfReady('AI 回复完成', (finalContent || '已完成').slice(0, 100))
              }
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
          },
          onReportReady: (reportHtml) => {
            // 网站分析报告生成完成，立即标记并后台存储到 IndexedDB
            updateMessage(assistantMsg.id, { hasReport: true })
            reportStore.saveReport(assistantMsg.id, reportHtml).catch(console.error)
          },
          onSiteAnalyzerProgress: (progress) => {
            // 实时更新网站分析进度到消息状态
            if (progress.type === 'started') {
              siteAnalyzerStartTimeRef.current = Date.now()
            }
            const phase = mapProgressTypeToPhase(progress.type)
            updateMessage(assistantMsg.id, {
              siteAnalyzerProgress: {
                phase,
                message: progress.message,
                pagesCrawled: progress.pagesCrawled,
                totalPages: progress.totalPages,
                apisFound: progress.apisFound,
                pagesAnalyzed: progress.pagesAnalyzed,
                currentUrl: progress.currentUrl,
                startTime: siteAnalyzerStartTimeRef.current,
                error: progress.error
              }
            })
            // 分析完成或出错时清除进度状态
            if (phase === 'completed' || phase === 'error') {
              setTimeout(() => {
                updateMessage(assistantMsg.id, { siteAnalyzerProgress: undefined })
              }, 3000)
            }
          }
        },
        wsContext
      )
    },
    [resolveCurrentConfig, resolveCurrentRequestConfig, addMessage, updateMessage, getMessages, getAvailableTools, buildMessageContent, getCurrentBranchIndex, buildWorkspaceContext]
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

      // 获取当前分支索引，确保新消息继承正确的分支
      const currentBranchIdx = getCurrentBranchIndex(convId)

      // 添加用户消息：只存储用户原始文本，文件内容通过 attachments 传递给 AI 服务
      // 这样用户消息气泡只显示用户输入的文字和附件指示器，不会显示完整的文件内容
      addMessage(convId, {
        conversationId: convId,
        role: 'user',
        content: content,
        attachments,
        branchIndex: currentBranchIdx
      })

      // 获取对话历史
      const history = getMessages(convId)

      // 普通模式使用内置工具 + MCP 工具
      const mcpTools = useMCPToolStore.getState().mcpTools
      const webSearchEnabled = useSettingsStore.getState().webSearchEnabled
      const webToolNames = new Set(['web_search', 'fetch_webpage'])
      const normalModeTools = [...BUILT_IN_TOOLS, ...mcpTools].filter(
        (t) => !webToolNames.has(t.name) || webSearchEnabled
      )
      const toolDefs = toolService.toToolDefinitions(normalModeTools)

      // 创建 assistant 消息（流式更新）
      const assistantMsg = addMessage(convId, {
        conversationId: convId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        branchIndex: currentBranchIdx
      })

      // RAG: 检索知识库上下文（优先级：对话级 > Agent级 > 全局）
      let systemPromptWithKB = prompt?.content ?? null
      try {
        // 确定知识库集合范围
        const conversation = getConversation(convId)
        let kbCollectionIds: string[] | undefined = undefined
        if (conversation?.activeKnowledgeBaseIds && conversation.activeKnowledgeBaseIds.length > 0) {
          // 对话级优先
          kbCollectionIds = conversation.activeKnowledgeBaseIds
        }
        // 普通模式下没有 Agent 绑定的知识库，直接使用对话级或全局

        const kbContext = await knowledgeBaseService.searchAndFormatContext(
          content, undefined, undefined, kbCollectionIds
        )
        if (kbContext) {
          systemPromptWithKB = (systemPromptWithKB ?? '') + kbContext
        }
      } catch {
        // 知识库检索失败不影响正常流程
      }

      // 发送 AI 请求
      let fullContent = ''
      let reasoningContent = ''
      let pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = []

      await aiService.streamChat(
        history,
        resolveCurrentConfig(convId)!,
        systemPromptWithKB,
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
          onDone: async (finishReason) => {
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
              const mcpTools3 = useMCPToolStore.getState().mcpTools
              await handleToolCalls(convId, assistantMsg.id, pendingToolCalls, [...BUILT_IN_TOOLS, ...mcpTools3], currentBranchIdx)
            } else {
              const notice = getFinishNotice(finishReason)
              const finalContent = notice ? fullContent + notice : fullContent
              updateMessage(assistantMsg.id, {
                content: finalContent,
                isStreaming: false
              })
              notifyIfReady('AI 回复完成', (finalContent || '已完成').slice(0, 100))
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
        },
        resolveCurrentRequestConfig(convId)
      )
    },
    [
      currentConversationId,
      resolveCurrentConfig,
      resolveCurrentRequestConfig,
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
      sendMessageWithAgent,
      getCurrentBranchIndex
    ]
  )

  /** 普通模式工具调用最大迭代轮数，防止无限循环 */
  const MAX_TOOL_ITERATIONS = 30

  /**
   * 处理工具调用（普通模式）
   * 支持多轮工具调用循环：AI 调用工具 → 执行 → 将结果反馈给 AI → AI 可继续调用工具
   */
  const handleToolCalls = useCallback(
    async (
      conversationId: string,
      assistantMsgId: string,
      toolCalls: Array<{ id: string; name: string; arguments: string }>,
      tools: Tool[],
      branchIndex?: number,
      iteration: number = 1
    ) => {
      // 超过最大迭代次数：通知 AI 工具调用已达上限，让 AI 做最终回复（不带工具）
      if (iteration > MAX_TOOL_ITERATIONS) {
        // 向对话历史添加系统通知，告知 AI 工具调用已达上限
        addMessage(conversationId, {
          conversationId,
          role: 'system',
          content: `[系统通知] 工具调用已达最大迭代次数（${MAX_TOOL_ITERATIONS}轮），已停止工具调用。请根据目前已获取的信息直接给出最终回复，不要再尝试调用工具。`,
          branchIndex
        })

        // 获取最新历史（包含系统通知）
        const limitHistory = branchIndex !== undefined
          ? getVisibleMessages(conversationId)
          : getMessages(conversationId)

        const promptAtLimit = selectedPromptId ? getPrompt(selectedPromptId) : null

        // 创建新的 assistant 消息用于 AI 的最终回复（不传工具定义）
        const limitReplyMsg = addMessage(conversationId, {
          conversationId,
          role: 'assistant',
          content: '',
          isStreaming: true,
          branchIndex
        })

        let limitFullContent = ''
        let limitReasoningContent = ''
        const limitController = new AbortController()
        abortControllerRef.current = limitController

        await aiService.streamChat(
          limitHistory,
          resolveCurrentConfig(conversationId)!,
          promptAtLimit?.content ?? null,
          [], // 不传工具定义，防止 AI 继续调用工具
          limitController.signal,
          {
            onToken: (token) => {
              limitFullContent += token
              updateMessage(limitReplyMsg.id, { content: limitFullContent })
            },
            onReasoningToken: (token) => {
              limitReasoningContent += token
              updateMessage(limitReplyMsg.id, {
                content: limitFullContent,
                reasoningContent: limitReasoningContent
              })
            },
            onUsage: (usage) => {
              updateMessage(limitReplyMsg.id, { tokenUsage: usage })
            },
            onDone: (finishReason) => {
              const notice = getFinishNotice(finishReason)
              updateMessage(limitReplyMsg.id, {
                content: notice ? limitFullContent + notice : limitFullContent,
                isStreaming: false,
                reasoningContent: limitReasoningContent || undefined
              })
              isStreamingRef.current = false
            },
            onError: (error) => {
              updateMessage(limitReplyMsg.id, {
                content: limitFullContent || error,
                isStreaming: false,
                isError: true,
                reasoningContent: limitReasoningContent || undefined
              })
              isStreamingRef.current = false
            }
          },
          resolveCurrentRequestConfig(conversationId)
        )
        return
      }

      const currentMsg = useConversationStore.getState().messages[conversationId]?.find(
        (m) => m.id === assistantMsgId
      )
      if (!currentMsg?.toolCalls) return

      // 并行执行所有工具调用
      const updatedToolCalls = [...currentMsg.toolCalls]
      // 先将所有工具调用标记为 running
      for (let i = 0; i < toolCalls.length; i++) {
        updatedToolCalls[i] = { ...updatedToolCalls[i], status: 'running' }
      }
      updateMessage(assistantMsgId, { toolCalls: updatedToolCalls })

      // 并行执行
      const results = await Promise.all(
        toolCalls.map(async (tc) => {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.arguments)
          } catch {
            // 空参数
          }
          const result = await toolService.executeTool(tc.name, args, tools)
          return { tc, result }
        })
      )

      // 更新所有工具调用状态并添加结果消息
      for (const { tc, result } of results) {
        const idx = updatedToolCalls.findIndex((t) => t.id === tc.id)
        if (idx !== -1) {
          updatedToolCalls[idx] = {
            ...updatedToolCalls[idx],
            status: result.success ? 'completed' : 'error',
            result: result.success ? result.data : result.error
          }
        }

        // 将工具结果作为 tool 消息添加到对话历史
        addMessage(conversationId, {
          conversationId,
          role: 'tool',
          content: result.success ? result.data : result.error ?? '工具执行失败',
          toolCallId: tc.id,
          toolName: tc.name,
          branchIndex
        })
      }
      updateMessage(assistantMsgId, { toolCalls: [...updatedToolCalls] })

      // 构建工具定义（保持工具可用，支持后续轮次继续调用）
      const mcpTools2 = useMCPToolStore.getState().mcpTools
      const webSearchEnabled2 = useSettingsStore.getState().webSearchEnabled
      const webToolNames2 = new Set(['web_search', 'fetch_webpage'])
      const normalModeTools2 = [...BUILT_IN_TOOLS, ...mcpTools2].filter(
        (t) => !webToolNames2.has(t.name) || webSearchEnabled2
      )
      const toolDefs = toolService.toToolDefinitions(normalModeTools2)
      const prompt = selectedPromptId ? getPrompt(selectedPromptId) : null

      // 获取最新历史（包含本轮工具调用和结果）
      const history = branchIndex !== undefined
        ? getVisibleMessages(conversationId)
        : getMessages(conversationId)

      // 创建新的 assistant 消息用于本轮 AI 回复
      const replyMsg = addMessage(conversationId, {
        conversationId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        branchIndex
      })

      let fullContent = ''
      let reasoningContent = ''
      let pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = []
      const controller = new AbortController()
      abortControllerRef.current = controller

      // 关键改动：传入工具定义（而非空数组），让 AI 在需要时可以继续调用工具
      await aiService.streamChat(
        history,
        resolveCurrentConfig(conversationId)!,
        prompt?.content ?? null,
        toolDefs,
        controller.signal,
        {
          onToken: (token) => {
            fullContent += token
            updateMessage(replyMsg.id, { content: fullContent })
          },
          onReasoningToken: (token) => {
            reasoningContent += token
            updateMessage(replyMsg.id, {
              content: fullContent,
              reasoningContent
            })
          },
          onToolCalls: (toolCalls) => {
            pendingToolCalls = toolCalls
          },
          onUsage: (usage) => {
            updateMessage(replyMsg.id, { tokenUsage: usage })
          },
          onDone: async (finishReason) => {
            if (pendingToolCalls.length > 0) {
              // AI 又发起了工具调用 → 更新消息显示工具调用状态
              updateMessage(replyMsg.id, {
                content: fullContent,
                isStreaming: false,
                reasoningContent: reasoningContent || undefined,
                toolCalls: pendingToolCalls.map((tc) => ({
                  ...tc,
                  arguments: tc.arguments,
                  status: 'pending' as const
                }))
              })
              // 递归进入下一轮工具调用（带迭代计数）
              await handleToolCalls(
                conversationId,
                replyMsg.id,
                pendingToolCalls,
                tools,
                branchIndex,
                iteration + 1
              )
            } else {
              // AI 返回纯文本，工具调用循环结束
              const notice = getFinishNotice(finishReason)
              updateMessage(replyMsg.id, {
                content: notice ? fullContent + notice : fullContent,
                isStreaming: false,
                reasoningContent: reasoningContent || undefined
              })
              isStreamingRef.current = false
            }
          },
          onError: (error) => {
            updateMessage(replyMsg.id, {
              content: fullContent || error,
              isStreaming: false,
              isError: true,
              reasoningContent: reasoningContent || undefined
            })
            isStreamingRef.current = false
          }
        },
        resolveCurrentRequestConfig(conversationId)
      )
    },
    [resolveCurrentConfig, resolveCurrentRequestConfig, selectedPromptId, getPrompt, addMessage, updateMessage, getMessages, getVisibleMessages]
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
   * 重新生成消息（不重新添加用户消息）
   * 仅删除目标助手消息，然后基于当前可见历史重新请求 AI
   */
  const regenerateMessage = useCallback(
    async (messageId: string) => {
      if (!currentConversationId || isStreamingRef.current) return

      // 使用可见消息列表来确定要删除的范围
      const visibleMessages = getVisibleMessages(currentConversationId)
      const msgIndex = visibleMessages.findIndex((m) => m.id === messageId)
      if (msgIndex < 0) return

      // 删除目标消息及其之后的所有可见消息
      for (let i = visibleMessages.length - 1; i >= msgIndex; i--) {
        useConversationStore.getState().deleteMessage(currentConversationId, visibleMessages[i].id)
      }

      // 获取当前分支索引
      const currentBranchIdx = getCurrentBranchIndex(currentConversationId)

      // 检查是否为 Agent 模式
      const agent = (() => {
        const conversation = getConversation(currentConversationId)
        if (!conversation?.agentId) return undefined
        return getAgent(conversation.agentId)
      })()

      isStreamingRef.current = true
      abortControllerRef.current = new AbortController()

      // 获取删除后的可见历史作为上下文
      const history = useConversationStore.getState().getVisibleMessages(currentConversationId)

      if (agent && agent.enabled) {
        // Agent 模式重新生成
        const assistantMsg = addMessage(currentConversationId, {
          conversationId: currentConversationId,
          role: 'assistant',
          content: '',
          isStreaming: true,
          agentId: agent.id,
          branchIndex: currentBranchIdx
        })

        const allTools = getAvailableTools()
        const agentSteps: AgentStep[] = []
        let finalContent = ''
        let reasoningContent = ''

        const wsContext = buildWorkspaceContext(currentConversationId)
        await runAgent(
          agent,
          '', // 空 prompt，Agent 从历史中恢复上下文
          history,
          allTools,
          resolveCurrentConfig(currentConversationId, agent)!,
          abortControllerRef.current.signal,
          {
            onStep: (step) => {
              agentSteps.push(step)
              if (step.type === 'thinking' || step.type === 'action') {
                finalContent = ''
                reasoningContent = ''
              }
              updateMessage(assistantMsg.id, { content: finalContent, agentSteps: [...agentSteps], isStreaming: true })
            },
            onToken: (token) => {
              finalContent += token
              updateMessage(assistantMsg.id, { content: finalContent, agentSteps: [...agentSteps], isStreaming: true })
            },
            onReasoningToken: (token) => {
              reasoningContent += token
              updateMessage(assistantMsg.id, { content: finalContent, reasoningContent, agentSteps: [...agentSteps], isStreaming: true })
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
                if (status === 'completed') {
                  notifyIfReady('AI 回复完成', (finalContent || '已完成').slice(0, 100))
                }
              }
            },
            onError: (error) => {
              updateMessage(assistantMsg.id, { content: finalContent || error, isStreaming: false, isError: true, agentSteps: [...agentSteps] })
              isStreamingRef.current = false
            },
            onDone: (doneContent) => {
              updateMessage(assistantMsg.id, { content: doneContent || finalContent || '', isStreaming: false, agentSteps: [...agentSteps], reasoningContent: reasoningContent || undefined })
              isStreamingRef.current = false
            },
            onHumanInput: async (step) => {
              return new Promise<string | string[]>((resolve, reject) => {
                humanInputResolversRef.current.set(step.id, resolve)
                const timeoutId = setTimeout(() => {
                  if (humanInputResolversRef.current.has(step.id)) {
                    humanInputResolversRef.current.delete(step.id)
                    const firstOption = step.humanChoice?.options[0]?.value ?? ''
                    const defaultValue = step.humanChoice?.allowMultiple ? [firstOption] : firstOption
                    resolve(defaultValue)
                  }
                }, 60_000)
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
            },
            onReportReady: (reportHtml) => {
              updateMessage(assistantMsg.id, { hasReport: true })
              reportStore.saveReport(assistantMsg.id, reportHtml).catch(console.error)
            },
            onSiteAnalyzerProgress: (progress) => {
              if (progress.type === 'started') {
                siteAnalyzerStartTimeRef.current = Date.now()
              }
              const phase = mapProgressTypeToPhase(progress.type)
              updateMessage(assistantMsg.id, {
                siteAnalyzerProgress: {
                  phase,
                  message: progress.message,
                  pagesCrawled: progress.pagesCrawled,
                  totalPages: progress.totalPages,
                  apisFound: progress.apisFound,
                  pagesAnalyzed: progress.pagesAnalyzed,
                  currentUrl: progress.currentUrl,
                  startTime: siteAnalyzerStartTimeRef.current,
                  error: progress.error
                }
              })
              if (phase === 'completed' || phase === 'error') {
                setTimeout(() => {
                  updateMessage(assistantMsg.id, { siteAnalyzerProgress: undefined })
                }, 3000)
              }
            }
          },
          wsContext
        )
      } else {
        // 普通模式重新生成
        const prompt = selectedPromptId ? getPrompt(selectedPromptId) : null
        // 普通模式使用内置工具 + MCP 工具
        const mcpTools4 = useMCPToolStore.getState().mcpTools
        const normalModeTools4 = [...BUILT_IN_TOOLS, ...mcpTools4]
        const toolDefs = toolService.toToolDefinitions(normalModeTools4)

        const assistantMsg = addMessage(currentConversationId, {
          conversationId: currentConversationId,
          role: 'assistant',
          content: '',
          isStreaming: true,
          branchIndex: currentBranchIdx
        })

        let fullContent = ''
        let reasoningContent = ''
        let pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = []

        await aiService.streamChat(
          history,
          resolveCurrentConfig(currentConversationId)!,
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
              updateMessage(assistantMsg.id, { content: fullContent, reasoningContent })
            },
            onToolCalls: (toolCalls) => {
              pendingToolCalls = toolCalls
            },
            onUsage: (usage) => {
              updateMessage(assistantMsg.id, { content: fullContent, tokenUsage: usage })
            },
            onDone: async (finishReason) => {
              if (pendingToolCalls.length > 0) {
                updateMessage(assistantMsg.id, {
                  content: fullContent,
                  isStreaming: false,
                  toolCalls: pendingToolCalls.map((tc) => ({ ...tc, arguments: tc.arguments, status: 'pending' as const }))
                })
                const mcpTools5 = useMCPToolStore.getState().mcpTools
                await handleToolCalls(currentConversationId, assistantMsg.id, pendingToolCalls, [...BUILT_IN_TOOLS, ...mcpTools5], currentBranchIdx)
              } else {
                const notice = getFinishNotice(finishReason)
                updateMessage(assistantMsg.id, { content: notice ? fullContent + notice : fullContent, isStreaming: false })
              }
              isStreamingRef.current = false
            },
            onError: (error) => {
              updateMessage(assistantMsg.id, { content: fullContent || error, isStreaming: false, isError: true })
              isStreamingRef.current = false
            }
          },
          resolveCurrentRequestConfig(currentConversationId)
        )
      }
    },
    [
      currentConversationId,
      resolveCurrentConfig,
      resolveCurrentRequestConfig,
      selectedPromptId,
      getPrompt,
      getAgent,
      getConversation,
      addMessage,
      updateMessage,
      getVisibleMessages,
      getCurrentBranchIndex,
      getAvailableTools,
      handleToolCalls,
      buildWorkspaceContext
    ]
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

      const wsContext = buildWorkspaceContext(currentConversationId)
      await resumeAgent(
        agent,
        history,
        allTools,
        resolveCurrentConfig(currentConversationId, agent)!,
        abortControllerRef.current.signal,
        {
          onStep: (step) => {
            agentSteps.push(step)
            if (step.type === 'thinking' || step.type === 'action') {
              finalContent = ''
              reasoningContent = ''
            }
            updateMessage(messageId, {
              content: finalContent,
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
              if (status === 'completed') {
                notifyIfReady('AI 回复完成', (finalContent || '已完成').slice(0, 100))
              }
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
          },
          onSiteAnalyzerProgress: (progress) => {
            if (progress.type === 'started') {
              siteAnalyzerStartTimeRef.current = Date.now()
            }
            const phase = mapProgressTypeToPhase(progress.type)
            updateMessage(messageId, {
              siteAnalyzerProgress: {
                phase,
                message: progress.message,
                pagesCrawled: progress.pagesCrawled,
                totalPages: progress.totalPages,
                apisFound: progress.apisFound,
                pagesAnalyzed: progress.pagesAnalyzed,
                currentUrl: progress.currentUrl,
                startTime: siteAnalyzerStartTimeRef.current,
                error: progress.error
              }
            })
            if (phase === 'completed' || phase === 'error') {
              setTimeout(() => {
                updateMessage(messageId, { siteAnalyzerProgress: undefined })
              }, 3000)
            }
          }
        },
        wsContext
      )
    },
    [currentConversationId, resolveCurrentConfig, resolveCurrentRequestConfig, addMessage, updateMessage, getMessages, getAvailableTools, getAgent, buildWorkspaceContext]
  )

  /**
   * 编辑用户消息并重新发送（创建对话分支）
   * 1. 更新用户消息内容，标记为已编辑，设置分支计数
   * 2. 切换 activeBranches 到新分支
   * 3. 基于可见历史发送新请求，新消息使用新的 branchIndex
   */
  const editAndResend = useCallback(
    async (messageId: string, newContent: string) => {
      if (!currentConversationId || isStreamingRef.current) return

      const allMessages = getMessages(currentConversationId)
      const msgIndex = allMessages.findIndex((m) => m.id === messageId)
      if (msgIndex < 0) return

      const targetMsg = allMessages[msgIndex]
      if (targetMsg.role !== 'user') return

      // 1. 确定新的分支索引：找到该分支点之后所有消息的最大 branchIndex
      let maxBranchIndex = -1
      for (let i = msgIndex + 1; i < allMessages.length; i++) {
        const bi = allMessages[i].branchIndex ?? 0
        if (bi > maxBranchIndex) maxBranchIndex = bi
      }
      const newBranchIndex = maxBranchIndex + 1

      // 2. 更新用户消息：内容、编辑标记、分支计数
      const newBranchCount = Math.max(targetMsg.branchCount ?? 1, newBranchIndex + 1)
      updateMessage(messageId, {
        content: newContent,
        isEdited: true,
        branchCount: newBranchCount
      })

      // 3. 更新 activeBranches 指向新分支
      switchBranch(currentConversationId, messageId, newBranchIndex)

      // 4. 手动构建可见历史（因为 store 更新可能还未生效）
      const updatedActiveBranches: Record<string, number> = {
        ...(getConversation(currentConversationId)?.activeBranches ?? {}),
        [messageId]: newBranchIndex
      }

      let currentBranch = 0
      const visibleHistory: Message[] = []
      for (const msg of allMessages) {
        const isCurrentFork = msg.id === messageId && newBranchCount > 1
        const isOtherFork = msg.id !== messageId && msg.role === 'user' && (msg.branchCount ?? 0) > 1
        const isFork = isCurrentFork || isOtherFork

        if (isFork) {
          currentBranch = updatedActiveBranches[msg.id] ?? 0
          if (msg.id === messageId) {
            visibleHistory.push({ ...msg, content: newContent, isEdited: true, branchCount: newBranchCount })
          } else {
            visibleHistory.push(msg)
          }
        } else if (msg.branchIndex === undefined || msg.branchIndex === currentBranch) {
          if (msg.id === messageId) {
            visibleHistory.push({ ...msg, content: newContent, isEdited: true, branchCount: newBranchCount })
          } else {
            visibleHistory.push(msg)
          }
        }
      }

      // 5. 检查是否为 Agent 模式
      const agent = (() => {
        const conversation = getConversation(currentConversationId)
        if (!conversation?.agentId) return undefined
        return getAgent(conversation.agentId)
      })()

      isStreamingRef.current = true
      abortControllerRef.current = new AbortController()

      if (agent && agent.enabled) {
        // Agent 模式
        const fullContent = buildMessageContent(newContent, targetMsg.attachments)
        const agentMessage = typeof fullContent === 'string' ? fullContent : newContent

        const assistantMsg = addMessage(currentConversationId, {
          conversationId: currentConversationId,
          role: 'assistant',
          content: '',
          isStreaming: true,
          agentId: agent.id,
          branchIndex: newBranchIndex
        })

        const allTools = getAvailableTools()
        const agentSteps: AgentStep[] = []
        let finalContent = ''
        let reasoningContent = ''

        const wsContext = buildWorkspaceContext(currentConversationId)
        await runAgent(
          agent,
          agentMessage,
          visibleHistory.slice(0, -1),
          allTools,
          resolveCurrentConfig(currentConversationId, agent)!,
          abortControllerRef.current.signal,
          {
            onStep: (step) => {
              agentSteps.push(step)
              if (step.type === 'thinking' || step.type === 'action') {
                finalContent = ''
                reasoningContent = ''
              }
              updateMessage(assistantMsg.id, { content: finalContent, agentSteps: [...agentSteps], isStreaming: true })
            },
            onToken: (token) => {
              finalContent += token
              updateMessage(assistantMsg.id, { content: finalContent, agentSteps: [...agentSteps], isStreaming: true })
            },
            onReasoningToken: (token) => {
              reasoningContent += token
              updateMessage(assistantMsg.id, { content: finalContent, reasoningContent, agentSteps: [...agentSteps], isStreaming: true })
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
                if (status === 'completed') {
                  notifyIfReady('AI 回复完成', (finalContent || '已完成').slice(0, 100))
                }
              }
            },
            onError: (error) => {
              updateMessage(assistantMsg.id, { content: finalContent || error, isStreaming: false, isError: true, agentSteps: [...agentSteps] })
              isStreamingRef.current = false
            },
            onDone: (doneContent) => {
              updateMessage(assistantMsg.id, { content: doneContent || finalContent || '', isStreaming: false, agentSteps: [...agentSteps], reasoningContent: reasoningContent || undefined })
              isStreamingRef.current = false
            },
            onHumanInput: async (step) => {
              return new Promise<string | string[]>((resolve, reject) => {
                humanInputResolversRef.current.set(step.id, resolve)
                const timeoutId = setTimeout(() => {
                  if (humanInputResolversRef.current.has(step.id)) {
                    humanInputResolversRef.current.delete(step.id)
                    const firstOption = step.humanChoice?.options[0]?.value ?? ''
                    const defaultValue = step.humanChoice?.allowMultiple ? [firstOption] : firstOption
                    resolve(defaultValue)
                  }
                }, 60_000)
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
            },
            onReportReady: (reportHtml) => {
              updateMessage(assistantMsg.id, { hasReport: true })
              reportStore.saveReport(assistantMsg.id, reportHtml).catch(console.error)
            },
            onSiteAnalyzerProgress: (progress) => {
              if (progress.type === 'started') {
                siteAnalyzerStartTimeRef.current = Date.now()
              }
              const phase = mapProgressTypeToPhase(progress.type)
              updateMessage(assistantMsg.id, {
                siteAnalyzerProgress: {
                  phase,
                  message: progress.message,
                  pagesCrawled: progress.pagesCrawled,
                  totalPages: progress.totalPages,
                  apisFound: progress.apisFound,
                  pagesAnalyzed: progress.pagesAnalyzed,
                  currentUrl: progress.currentUrl,
                  startTime: siteAnalyzerStartTimeRef.current,
                  error: progress.error
                }
              })
              if (phase === 'completed' || phase === 'error') {
                setTimeout(() => {
                  updateMessage(assistantMsg.id, { siteAnalyzerProgress: undefined })
                }, 3000)
              }
            }
          },
          wsContext
        )
      } else {
        // 普通模式
        const prompt = selectedPromptId ? getPrompt(selectedPromptId) : null
        // 普通模式使用内置工具 + MCP 工具
        const mcpTools6 = useMCPToolStore.getState().mcpTools
        const normalModeTools6 = [...BUILT_IN_TOOLS, ...mcpTools6]
        const toolDefs = toolService.toToolDefinitions(normalModeTools6)

        const assistantMsg = addMessage(currentConversationId, {
          conversationId: currentConversationId,
          role: 'assistant',
          content: '',
          isStreaming: true,
          branchIndex: newBranchIndex
        })

        let fullContent = ''
        let reasoningContent = ''
        let pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = []

        await aiService.streamChat(
          visibleHistory,
          resolveCurrentConfig(currentConversationId)!,
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
              updateMessage(assistantMsg.id, { content: fullContent, reasoningContent })
            },
            onToolCalls: (toolCalls) => {
              pendingToolCalls = toolCalls
            },
            onUsage: (usage) => {
              updateMessage(assistantMsg.id, { content: fullContent, tokenUsage: usage })
            },
            onDone: async (finishReason) => {
              if (pendingToolCalls.length > 0) {
                updateMessage(assistantMsg.id, {
                  content: fullContent,
                  isStreaming: false,
                  toolCalls: pendingToolCalls.map((tc) => ({ ...tc, arguments: tc.arguments, status: 'pending' as const }))
                })
                const mcpTools7 = useMCPToolStore.getState().mcpTools
                await handleToolCalls(currentConversationId, assistantMsg.id, pendingToolCalls, [...BUILT_IN_TOOLS, ...mcpTools7], newBranchIndex)
              } else {
                const notice = getFinishNotice(finishReason)
                updateMessage(assistantMsg.id, { content: notice ? fullContent + notice : fullContent, isStreaming: false })
              }
              isStreamingRef.current = false
            },
            onError: (error) => {
              updateMessage(assistantMsg.id, { content: fullContent || error, isStreaming: false, isError: true })
              isStreamingRef.current = false
            }
          },
          resolveCurrentRequestConfig(currentConversationId)
        )
      }
    },
    [
      currentConversationId,
      resolveCurrentConfig,
      resolveCurrentRequestConfig,
      selectedPromptId,
      getPrompt,
      getAgent,
      getConversation,
      switchBranch,
      addMessage,
      updateMessage,
      getMessages,
      getAvailableTools,
      buildMessageContent,
      handleToolCalls,
      sendMessageWithAgent,
      buildWorkspaceContext
    ]
  )

  return {
    sendMessage,
    stopGeneration,
    regenerateMessage,
    editAndResend,
    isStreaming: isStreamingRef.current,
    handleHumanInput,
    resumeAgentTask
  }
}
