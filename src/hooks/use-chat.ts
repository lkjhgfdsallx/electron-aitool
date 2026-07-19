import { useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { aiService } from '../services/ai-service'
import { toolService } from '../services/tool-service'
import { siteAnalyzerService } from '../services/site-analyzer-service'
import { runAgent } from '../services/agent-engine'
import type { WorkspaceContext, CreateAgentInput, SubAgentActivityEvent, FileActionApprovalRequest, FileActionApprovalResult, ResumeOptions } from '../services/agent-engine'
import { agentEventBus } from '../services/agent/event-bus'
import type { AgentPlan } from '../types/agent-plan'
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
import { applyWebSearchPolicy, getWebToolsIfEnabled, isWebTool } from '../utils/web-tools'
import { DEFAULT_POST_WRITE_LINT_CONFIG } from '../types'
import type { Message, Tool, ToolDefinition, ToolExecuteResult, MessageAttachment, AgentStep, AgentProfile, SiteAnalyzerLiveProgress, ResolvedAIConfig } from '../types'
import type { AgentEvent } from '../services/agent/event-bus'

/** 根据 finishReason 生成截断/中断提示 */
function getFinishNotice(finishReason?: string): string | null {
  if (!finishReason || finishReason === 'stop' || finishReason === 'length') return null
  if (finishReason === 'abort') {
    return '\n\n> ⚠️ **回复中断**：流连接在生成过程中异常断开，输出可能不完整。请检查网络连接或 API 服务状态。'
  }
  return null
}

/**
 * 过滤被用户禁用的内置工具
 * 注意：联网工具（web_search / fetch_webpage）不受 disabledBuiltinToolIds 影响，
 * 仅由对话框「联网」按钮控制。
 */
function filterDisabledBuiltinTools(tools: Tool[]): Tool[] {
  const disabledIds = useSettingsStore.getState().disabledBuiltinToolIds
  if (!disabledIds || disabledIds.length === 0) return tools
  return tools.map((t) =>
    !isWebTool(t) && disabledIds.includes(t.id) ? { ...t, enabled: false } : t
  )
}

/**
 * 普通对话允许的工具：仅搜索类（web_search / fetch_webpage）。
 * 不暴露计算器、知识库检索、MCP、Agent 内置等任何其他工具，
 * 避免模型在非 Agent 场景“知道”或尝试调用它们。
 * 联网工具仅由对话框「联网」按钮控制（webSearchEnabled）。
 */
function getNormalModeTools(): Tool[] {
  return getWebToolsIfEnabled()
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

// ==================== 流式输出节流缓冲 ====================
//
// 性能优化核心：将高频的 token 回调批量合并，
// 使用 requestAnimationFrame 节流，每帧最多触发一次 store 更新。
// 这样无论 token 到达多么频繁（几十次/秒 → 几百次/秒），
// React 渲染频率始终稳定在 ~60fps，避免卡顿。

class StreamingBuffer {
  private pendingUpdate: Partial<Message> | null = null
  private rafId: number | null = null
  private messageId: string | null = null

  /** 累积 token，合并为单次 store 更新 */
  push(messageId: string, update: Partial<Message>): void {
    this.messageId = messageId
    if (!this.pendingUpdate) {
      this.pendingUpdate = { ...update }
    } else {
      // 合并：content 拼接，其他字段覆盖
      const pending = this.pendingUpdate
      if (update.content !== undefined && pending.content !== undefined) {
        // 如果都有 content，取较长的那个（避免重复拼接）
        // 场景：onToken 先推了 "abc"，然后 onReasoningToken 推了 content="abc" + reasoningContent
        // 此时后者已经包含最新完整 content，直接覆盖
        if (update.content.length >= (pending.content as string).length) {
          pending.content = update.content
        }
      } else if (update.content !== undefined) {
        pending.content = update.content
      }
      // 合并其余字段
      for (const [key, value] of Object.entries(update)) {
        if (key === 'content') continue // 已处理
        ;(pending as Record<string, unknown>)[key] = value
      }
    }
    this.scheduleFlush()
  }

  /** 强制刷新所有待更新（完成/出错时调用，确保最终状态正确） */
  flush(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    if (this.pendingUpdate && this.messageId) {
      useConversationStore.getState().updateMessage(this.messageId, this.pendingUpdate)
      this.pendingUpdate = null
    }
    this.messageId = null
  }

  /** 重置缓冲（开始新的流式请求时调用） */
  reset(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.pendingUpdate = null
    this.messageId = null
  }

  private scheduleFlush(): void {
    if (this.rafId !== null) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      if (this.pendingUpdate && this.messageId) {
        useConversationStore.getState().updateMessage(this.messageId, this.pendingUpdate)
        this.pendingUpdate = null
      }
    })
  }
}

/** 无 AI 源时的统一提示文案 */
export const MISSING_AI_PROVIDER_MESSAGE =
  '尚未配置 AI 源，请先添加 AI 服务提供商后再开始对话'

/**
 * 当前是否存在可用的 AI 源配置（与 resolveConfig 判定一致）
 */
export function hasUsableAIProvider(): boolean {
  return useAIProviderStore.getState().resolveConfig() !== null
}

export interface UseChatOptions {
  /** 无可用 AI 源时回调（用于跳转设置等）；未提供时回退为 alert */
  onMissingProvider?: () => void
}

/**
 * 聊天 Hook - 处理消息发送、工具调用、Agent 模式
 */
export function useChat(options: UseChatOptions = {}) {
  const abortControllerRef = useRef<AbortController | null>(null)
  const onMissingProviderRef = useRef(options.onMissingProvider)
  onMissingProviderRef.current = options.onMissingProvider
  // 网站分析开始时间（用于在进度面板中显示耗时）
  const siteAnalyzerStartTimeRef = useRef<number>(0)
  // 流式输出节流缓冲（每帧最多触发一次 store 更新）
  const streamingBufferRef = useRef<StreamingBuffer>(new StreamingBuffer())

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
      .map((a) => ({ id: a.id, name: a.name, description: a.description, avatar: a.avatar ?? '🤖', enabledToolIds: a.enabledToolIds }))

    // 构建子任务分派回调（真正运行子 Agent 并返回结构化结果 JSON）
    // Boomerang: 接收 contextSummary（主 Agent 提供的上下文摘要），作为子 Agent 的背景信息
    const dispatchSubTask = async (
      agentId: string,
      taskDescription: string,
      contextSummary?: string,
    ): Promise<string> => {
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
        ...filterDisabledBuiltinTools(BUILT_IN_TOOLS),
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
        .map((a) => ({ id: a.id, name: a.name, description: a.description, avatar: a.avatar ?? '🤖', enabledToolIds: a.enabledToolIds }))

      // 构建子 Agent 的工作区上下文（不含 dispatchSubTask/createAgent 以避免递归）
      const subWorkspaceContext: WorkspaceContext | undefined = ws
        ? { folderPath: ws.folderPath, workspaceId: ws.id, teamAgents: freshTeamAgents }
        : undefined

      // 运行子 Agent 并收集输出
      let finalContent = ''
      let stepCount = 0
      const artifacts: string[] = []
      const subSignal = new AbortController().signal

      // Boomerang: 若有上下文摘要，构造为子 Agent 的背景 system 消息
      const ts = Date.now()
      const initialMessages = contextSummary
        ? [{
            id: `subctx-${targetAgent.id}-${ts}`,
            role: 'system' as const,
            content: `[背景上下文]\n${contextSummary}`,
            conversationId: '',
            timestamp: ts,
          }]
        : []

      const buildResult = (status: 'success' | 'error', error?: string) => {
        const result = {
          agentId: targetAgent.id,
          agentName: targetAgent.name,
          task: taskDescription,
          content: finalContent,
          status,
          stepCount,
          error,
          artifacts,
          timestamp: Date.now(),
        }
        onSubAgentActivity?.({
          agentId: targetAgent.id,
          agentName: targetAgent.name,
          agentAvatar: targetAgent.avatar,
          type: 'done',
          result,
        })
        return JSON.stringify(result)
      }

      try {
        await runAgent(
          targetAgent,
          taskDescription,
          initialMessages,
          targetTools,
          config,
          subSignal,
          {
            onStep: (step) => {
              stepCount++
              // 收集产物路径（write_file 等工具调用）
              const toolCall = step.toolCall
              if (toolCall && toolCall.name.includes('write_file') && toolCall.arguments?.path) {
                const p = String(toolCall.arguments.path)
                if (!artifacts.includes(p)) artifacts.push(p)
              }
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
          subWorkspaceContext,
          undefined // 子 Agent 不需要 conversationId（checkpoint 由主 Agent 管理）
        )
      } catch (err) {
        return buildResult('error', err instanceof Error ? err.message : String(err))
      }

      return buildResult('success')
    }

    // 构建创建 Agent 回调（创建新 Agent 并加入工作区团队）
    // 支持 增强字段：planningStrategy, memoryConfig, termination, modelConfig,
    // knowledgeBaseIds, contextPolicy, approvalPolicy, maxParallelSubtasks
    const createAgent = async (input: CreateAgentInput): Promise<string> => {
      // 为新 Agent 设置合理的默认工具：工作区文件工具 + 核心工具
      const defaultWorkspaceToolIds = [
        'workspace:read_file', 'workspace:write_file', 'workspace:str_replace_editor',
        'workspace:list_files', 'workspace:find_files', 'workspace:search_files',
        'workspace:find_symbols', 'workspace:execute_command'
      ]
      const toolIds = input.enabledToolIds && input.enabledToolIds.length > 0
        ? input.enabledToolIds
        : defaultWorkspaceToolIds

      // 创建工作区 Agent（而非全局 Agent），自动带有 workspace 标签
      // 字段优先使用传入值，未提供则使用合理默认值
      const workspaceAgentStore = useWorkspaceAgentStore.getState()
      const newAgent = await workspaceAgentStore.createWorkspaceAgent({
        name: input.name,
        description: input.description,
        systemPrompt: input.systemPrompt,
        avatar: input.avatar ?? '🤖',
        enabledToolIds: toolIds,
        enabledSkillIds: input.enabledSkillIds,
        planningStrategy: input.planningStrategy ?? 'react',
        memoryConfig: input.memoryConfig ?? { historyTurns: 10, longTermEnabled: false, crossSession: false },
        termination: input.termination ?? { maxSteps: 50, timeoutSeconds: 0, autoStopOnGoal: true },
        modelConfig: input.modelConfig ?? {},
        knowledgeBaseIds: input.knowledgeBaseIds,
        contextPolicy: input.contextPolicy,
        approvalPolicy: input.approvalPolicy,
        maxParallelSubtasks: input.maxParallelSubtasks,
        promptSections: input.promptSections,
        promptTemplateId: input.promptTemplateId,
        variables: input.variables,
        workflow: input.workflow,
        enabled: input.enabled ?? true,
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
        enabledToolIds: newAgent.enabledToolIds,
      })

      return newAgent.id
    }

    // 文件操作审批回调（阶段 1 新增，参考 ROO CODE Auto-Approve）
    const onFileActionApproval = async (
      request: FileActionApprovalRequest
    ): Promise<FileActionApprovalResult> => {
      return useWorkspaceStore.getState().requestFileActionApproval(request)
    }

    // 接收多个子任务，根据 dependsOnIndexes 做拓扑分层，同层任务用 Promise.all 并行执行。
    // 结果按入参顺序返回（与串行 dispatchSubTask 的返回格式一致）。
    const dispatchTasks = async (
      tasks: Array<{ agentId: string; task: string; context?: string; dependsOnIndexes?: number[] }>,
    ): Promise<string[]> => {
      if (tasks.length === 0) return []

      // 结果数组（按入参顺序填充）
      const results: string[] = new Array(tasks.length).fill('')

      // 拓扑分层：将任务按依赖关系分成多个批次
      // 同一批次内的任务无相互依赖，可并行执行
      const resolved = new Set<number>()
      const batches: number[][] = []
      const maxIterations = tasks.length + 1
      let iteration = 0

      while (resolved.size < tasks.length) {
        if (iteration++ > maxIterations) {
          // 循环依赖兜底：把剩余任务全部放入最后一批
          const remaining = tasks.map((_, i) => i).filter((i) => !resolved.has(i))
          batches.push(remaining)
          remaining.forEach((i) => resolved.add(i))
          break
        }
        const batch: number[] = []
        for (let i = 0; i < tasks.length; i++) {
          if (resolved.has(i)) continue
          const deps = tasks[i].dependsOnIndexes ?? []
          // 所有依赖都已 resolved（或依赖索引越界则忽略）
          const allDepsResolved = deps.every((d) => d < 0 || d >= tasks.length || resolved.has(d))
          if (allDepsResolved) batch.push(i)
        }
        if (batch.length === 0) {
          // 剩余任务存在循环依赖，直接全部放入最后一批避免死锁
          const remaining = tasks.map((_, i) => i).filter((i) => !resolved.has(i))
          batches.push(remaining)
          remaining.forEach((i) => resolved.add(i))
          break
        }
        batches.push(batch)
        batch.forEach((i) => resolved.add(i))
      }

      // 按批次执行：同批次内并行，批次间串行（等待前置完成）
      for (const batch of batches) {
        const batchPromises = batch.map((idx) =>
          dispatchSubTask(tasks[idx].agentId, tasks[idx].task, tasks[idx].context)
            .then((result) => { results[idx] = result })
            .catch((err) => {
              results[idx] = JSON.stringify({
                agentId: tasks[idx].agentId,
                task: tasks[idx].task,
                status: 'error',
                error: err instanceof Error ? err.message : String(err),
                timestamp: Date.now(),
              })
            }),
        )
        await Promise.all(batchPromises)
      }

      return results
    }

    return {
      folderPath: ws.folderPath,
      workspaceId: ws.id,
      teamAgents,
      dispatchSubTask,
      dispatchTasks,
      createAgent,
      autoApproval: ws.autoApproval,
      postWriteLint: ws.postWriteLint ?? DEFAULT_POST_WRITE_LINT_CONFIG,
      onFileActionApproval,
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

  /**
   * 确保存在可用 AI 源配置；无配置时提示并返回 null（不创建消息、不进入 streaming）
   */
  const ensureAIConfigReady = useCallback(
    (conversationId?: string, agent?: AgentProfile): ResolvedAIConfig | null => {
      const config = resolveCurrentConfig(conversationId, agent)
      if (config) return config

      isStreamingRef.current = false
      const handler = onMissingProviderRef.current
      if (handler) {
        handler()
      } else {
        window.alert(MISSING_AI_PROVIDER_MESSAGE)
      }
      return null
    },
    [resolveCurrentConfig]
  )

  // 存储 ask_human 工具的 Promise resolver，key 为 stepId
  const humanInputResolversRef = useRef<Map<string, (value: string | string[]) => void>>(new Map())

  /**
   * 获取当前可用的工具列表（内置工具 + Agent 内置工具 + MCP 工具）
   */
  const getAvailableTools = useCallback((): Tool[] => {
    const mcpTools = useMCPToolStore.getState().mcpTools
    const customTools = useCustomToolStore.getState().customTools.filter((t) => t.enabled)
    // 内置工具应用用户禁用黑名单（联网工具除外，见 filterDisabledBuiltinTools）
    // 联网工具由 applyWebSearchPolicy 按对话框按钮统一注入/剥离
    const base = [
      ...filterDisabledBuiltinTools(BUILT_IN_TOOLS),
      ...AGENT_BUILTIN_TOOLS,
      ...mcpTools,
      ...customTools,
    ]
    return applyWebSearchPolicy(base)
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

      // 无可用 AI 源时直接拦截，避免创建「思考中」脏消息
      const aiConfig = ensureAIConfigReady(convId, agent)
      if (!aiConfig) return

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
        } else if (event.type === 'done' && event.result) {
          // Boomerang: 子任务结构化成果回流，注入成果步骤供 UI 展示
          const r = event.result
          const resultStep: AgentStep = {
            id: crypto.randomUUID(),
            type: 'subtask_result',
            content: r.content || '',
            stepIndex: agentSteps.length,
            timestamp: Date.now(),
            sourceAgentId: event.agentId,
            sourceAgentName: event.agentName,
            sourceAgentAvatar: event.agentAvatar,
            subtaskResult: r,
          }
          agentSteps.push(resultStep)
          updateMessage(assistantMsg.id, {
            content: finalContent,
            agentSteps: [...agentSteps],
            isStreaming: true
          })
        }
      }

      // 将包含附件内容的完整消息传递给 Agent 引擎
      const wsContext = buildWorkspaceContext(convId, onSubAgentActivity)

      // 订阅 plan_created / task_updated 事件，将结构化计划同步到消息
      let currentPlan: AgentPlan | null = null
      const planUnsub = agentEventBus.on('plan_created', (event: AgentEvent) => {
        const plan = (event.payload as { plan?: AgentPlan } | undefined)?.plan
        if (plan) {
          currentPlan = plan
          updateMessage(assistantMsg.id, { agentPlan: plan, isStreaming: true })
        }
      })
      const taskUnsub = agentEventBus.on('task_updated', (event: AgentEvent) => {
        const plan = (event.payload as { plan?: AgentPlan } | undefined)?.plan
        if (plan) {
          currentPlan = plan
          updateMessage(assistantMsg.id, { agentPlan: plan, isStreaming: true })
        }
      })

      // 订阅 context_compressed 事件，将压缩信息作为 observation 步骤注入消息流
      const compressUnsub = agentEventBus.on('context_compressed', (event: AgentEvent) => {
        const payload = event.payload as {
          beforeTokens?: number
          afterTokens?: number
          compressedTurns?: number
          strategy?: string
        } | undefined
        if (payload) {
          const reduction = payload.beforeTokens && payload.afterTokens
            ? Math.round((1 - payload.afterTokens / payload.beforeTokens) * 100)
            : 0
          const compressStep: AgentStep = {
            id: crypto.randomUUID(),
            type: 'observation',
            content: `🗜️ 上下文已压缩（${payload.strategy ?? 'fixed'}）：${payload.beforeTokens?.toLocaleString() ?? '?'} → ${payload.afterTokens?.toLocaleString() ?? '?'} tokens（减少 ${reduction}%，压缩 ${payload.compressedTurns ?? 0} 条早期消息）`,
            stepIndex: -1,
            timestamp: Date.now(),
          }
          agentSteps.push(compressStep)
          updateMessage(assistantMsg.id, {
            agentSteps: [...agentSteps],
            isStreaming: true,
          })
        }
      })

      try {
        await runAgent(
          agent,
          agentMessage,
          history,
          allTools,
          aiConfig,
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
              // 步骤变更需要立即刷新（低频事件，不需要节流）
              streamingBufferRef.current.flush()
              updateMessage(assistantMsg.id, {
                content: finalContent,
                agentSteps: [...agentSteps],
                isStreaming: true
              })
            },
            onToken: (token) => {
              finalContent += token
              // ⚡ 性能优化：onToken 是高频回调（每个 token 一次），不再每次展开 agentSteps 数组
              // agentSteps 只在低频的 onStep/onSubAgentActivity 回调中更新，避免 O(n) 数组复制 × 高频调用
              streamingBufferRef.current.push(assistantMsg.id, {
                content: finalContent,
                isStreaming: true
              })
            },
            onReasoningToken: (token) => {
              reasoningContent += token
              // ⚡ 同上：onReasoningToken 也是高频回调，不再展开 agentSteps
              streamingBufferRef.current.push(assistantMsg.id, {
                content: finalContent,
                reasoningContent,
                isStreaming: true
              })
            },
            onStatusChange: (status) => {
              // 完成时强制刷新缓冲，确保最终状态正确
              streamingBufferRef.current.flush()
              if (status === 'completed' || status === 'error' || status === 'stopped') {
                // Agent 停止时（非正常完成），标记为可继续
                const agentContinuable = status === 'stopped' ? 'agent' as const : null
                updateMessage(assistantMsg.id, {
                  content: finalContent || (status === 'error' ? 'Agent 执行出错' : ''),
                  isStreaming: false,
                  isError: status === 'error',
                  reasoningContent: reasoningContent || undefined,
                  agentSteps: [...agentSteps],
                  finishReason: status === 'stopped' ? 'abort' : status === 'error' ? 'error' : 'stop',
                  continuable: agentContinuable
                })
                isStreamingRef.current = false
                if (status === 'completed') {
                  notifyIfReady('AI 回复完成', (finalContent || '已完成').slice(0, 100))
                  // 输出任务完成详情
                  const actionSteps = agentSteps.filter((s) => s.type === 'action')
                  const thinkingSteps = agentSteps.filter((s) => s.type === 'thinking')
                  const detailParts: string[] = []
                  detailParts.push(`✅ **任务完成**`)
                  detailParts.push(`- 总步骤数: ${agentSteps.length}（思考 ${thinkingSteps.length} 步，工具调用 ${actionSteps.length} 次）`)
                  if (actionSteps.length > 0) {
                    const toolNames = [...new Set(actionSteps.map((s) => s.toolCall?.name).filter(Boolean))]
                    detailParts.push(`- 使用工具: ${toolNames.join('、')}`)
                  }
                  if (agentSteps.length > 0) {
                    const startTime = agentSteps[0].timestamp
                    const endTime = agentSteps[agentSteps.length - 1].timestamp
                    const duration = endTime - startTime
                    if (duration > 0) {
                      const seconds = Math.round(duration / 1000)
                      detailParts.push(`- 执行耗时: ${seconds < 60 ? `${seconds}秒` : `${Math.floor(seconds / 60)}分${seconds % 60}秒`}`)
                    }
                  }
                  addMessage(convId, {
                    conversationId: convId,
                    role: 'system',
                    content: detailParts.join('\n'),
                    branchIndex: currentBranchIdx
                  })
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
              // 注意：保留 onStatusChange 已设置的 finishReason（如 'abort'），不要无条件覆盖
              const currentMsg = getMessages(convId).find(m => m.id === assistantMsg.id)
              const existingFinishReason = currentMsg?.finishReason
              // 检查 agentSteps 是否以 final_answer 结束，如果没有则标记为可继续
              const hasFinalAnswer = agentSteps.some((s) => s.type === 'final_answer')
              const agentContinuable: 'agent' | null = (!hasFinalAnswer && existingFinishReason !== 'error') ? 'agent' : null
              // 统一追加中断提示（与普通对话使用相同的 getFinishNotice 函数）
              const baseContent = doneContent || finalContent || ''
              const notice = getFinishNotice(existingFinishReason)
              const finalContentWithNotice = notice ? baseContent + notice : baseContent
              updateMessage(assistantMsg.id, {
                content: finalContentWithNotice,
                isStreaming: false,
                agentSteps: [...agentSteps],
                reasoningContent: reasoningContent || undefined,
                // 如果已有 finishReason（如 'abort'、'error'），则保留；否则设为 'stop'
                finishReason: existingFinishReason ?? 'stop',
                continuable: currentMsg?.continuable ?? agentContinuable
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
            onReportReady: async (reportHtml) => {
              // 先落盘再显示查看入口，避免用户在 IndexedDB 写入未完成时点击后无响应。
              try {
                await reportStore.saveReport(assistantMsg.id, reportHtml)
                updateMessage(assistantMsg.id, { hasReport: true })
              } catch (error) {
                console.error('[SiteAnalyzer] 保存交互式分析报告失败:', error)
              }
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
          wsContext,
          convId
        )
      } catch (error) {
        const aborted = abortControllerRef.current?.signal.aborted
        if (!aborted) {
          streamingBufferRef.current.flush()
          const errMsg = error instanceof Error ? error.message : String(error)
          updateMessage(assistantMsg.id, {
            content: finalContent || errMsg || 'Agent 执行失败',
            isStreaming: false,
            isError: true,
            agentSteps: [...agentSteps]
          })
        } else {
          streamingBufferRef.current.flush()
          updateMessage(assistantMsg.id, {
            content: finalContent,
            isStreaming: false,
            agentSteps: [...agentSteps],
            finishReason: 'abort'
          })
        }
        isStreamingRef.current = false
      } finally {
        planUnsub()
        taskUnsub()
        compressUnsub()
        void currentPlan
      }
    },
    [ensureAIConfigReady, addMessage, updateMessage, getMessages, getAvailableTools, buildMessageContent, getCurrentBranchIndex, buildWorkspaceContext]
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

      // 检查是否为 Agent 模式（需在 AI 配置校验前解析 agent，以使用 agent 绑定的 provider）
      const agent = (() => {
        const conversation = getConversation(convId)
        if (!conversation?.agentId) return undefined
        return getAgent(conversation.agentId)
      })()

      // 无可用 AI 源时直接拦截，避免创建「思考中」脏消息
      // Agent 模式由 sendMessageWithAgent 内部校验；此处仅校验普通模式
      if (!(agent && agent.enabled)) {
        const aiConfig = ensureAIConfigReady(convId)
        if (!aiConfig) return
      }

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

      if (agent && agent.enabled) {
        // Agent 模式
        try {
          await sendMessageWithAgent(agent, content, convId, attachments)
        } finally {
          // sendMessageWithAgent 内部会复位 isStreamingRef；这里兜底防止异常路径卡住
          if (isStreamingRef.current) {
            isStreamingRef.current = false
          }
        }
        return
      }

      // 普通模式：再次确认配置（上面已校验，此处用于拿到非空 config）
      const aiConfig = ensureAIConfigReady(convId)
      if (!aiConfig) {
        isStreamingRef.current = false
        return
      }

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

      // 普通模式仅暴露搜索类工具，模型不应感知其他工具
      const normalModeTools = getNormalModeTools()
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

      try {
        await aiService.streamChat(
          history,
          aiConfig,
          systemPromptWithKB,
          toolDefs,
          abortControllerRef.current.signal,
          {
            onToken: (token) => {
              fullContent += token
              // 节流：通过 StreamingBuffer 批量合并更新，每帧最多刷新一次
              streamingBufferRef.current.push(assistantMsg.id, { content: fullContent })
            },
            onReasoningToken: (token) => {
              reasoningContent += token
              streamingBufferRef.current.push(assistantMsg.id, {
                content: fullContent,
                reasoningContent
              })
            },
            onToolCalls: (toolCalls) => {
              pendingToolCalls = toolCalls
            },
            onUsage: (usage) => {
              // usage 更新频率低，不需要节流
              updateMessage(assistantMsg.id, {
                content: fullContent,
                tokenUsage: usage
              })
            },
            onDone: async (finishReason) => {
              // 完成时强制刷新缓冲，确保最终状态正确
              streamingBufferRef.current.flush()
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
                await handleToolCalls(convId, assistantMsg.id, pendingToolCalls, getNormalModeTools(), currentBranchIdx)
              } else {
                const notice = getFinishNotice(finishReason)
                const finalContent = notice ? fullContent + notice : fullContent
                // 如果 finishReason 是 length（截断）或 abort（中断），标记为可继续
                const normalContinuable: 'normal' | null = (finishReason === 'length' || finishReason === 'abort') ? 'normal' : null
                updateMessage(assistantMsg.id, {
                  content: finalContent,
                  isStreaming: false,
                  finishReason,
                  continuable: normalContinuable
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
      } catch (error) {
        const aborted = abortControllerRef.current?.signal.aborted
        if (!aborted) {
          streamingBufferRef.current.flush()
          const errMsg = error instanceof Error ? error.message : String(error)
          updateMessage(assistantMsg.id, {
            content: fullContent || errMsg || '请求失败',
            isStreaming: false,
            isError: true
          })
        } else {
          streamingBufferRef.current.flush()
          updateMessage(assistantMsg.id, {
            content: fullContent,
            isStreaming: false,
            finishReason: 'abort'
          })
        }
        isStreamingRef.current = false
      }
    },
    [
      currentConversationId,
      ensureAIConfigReady,
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

        const limitAiConfig = ensureAIConfigReady(conversationId)
        if (!limitAiConfig) {
          updateMessage(limitReplyMsg.id, {
            content: MISSING_AI_PROVIDER_MESSAGE,
            isStreaming: false,
            isError: true
          })
          isStreamingRef.current = false
          return
        }

        await aiService.streamChat(
          limitHistory,
          limitAiConfig,
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
                reasoningContent: limitReasoningContent || undefined,
                finishReason
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

      // 过滤掉无效的空白工具调用（AI 有时会调用 name 为空的工具）
      const validToolCalls = toolCalls.filter((tc) => tc.name && tc.name.trim())
      const invalidToolCalls = toolCalls.filter((tc) => !tc.name || !tc.name.trim())

      // 先将无效的工具调用标记为 error
      const updatedToolCalls = [...currentMsg.toolCalls]
      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i]
        if (!tc.name || !tc.name.trim()) {
          updatedToolCalls[i] = {
            ...updatedToolCalls[i],
            status: 'error',
            result: '无效的工具调用：工具名为空'
          }
          // 将无效工具调用结果添加到对话历史
          addMessage(conversationId, {
            conversationId,
            role: 'tool',
            content: '无效的工具调用：工具名为空',
            toolCallId: tc.id,
            toolName: tc.name || '',
            branchIndex
          })
        } else {
          updatedToolCalls[i] = { ...updatedToolCalls[i], status: 'running' }
        }
      }
      updateMessage(assistantMsgId, { toolCalls: updatedToolCalls })

      // 并行执行有效工具调用（带超时保护，防止 IPC 调用挂起导致整个对话卡死）
      const TOOL_TIMEOUT_MS = 60_000 // 60秒超时
      const results = await Promise.all(
        validToolCalls.map(async (tc) => {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.arguments)
          } catch {
            // 空参数
          }
          // 为每个工具调用添加超时保护，防止 IPC 调用永远不返回
          const result = await Promise.race([
            toolService.executeTool(tc.name, args, tools),
            new Promise<ToolExecuteResult>((resolve) =>
              setTimeout(() => resolve({
                success: false,
                data: '',
                error: `工具 "${tc.name}" 执行超时（${TOOL_TIMEOUT_MS / 1000}秒）`
              }), TOOL_TIMEOUT_MS)
            )
          ])
          return { tc, result }
        })
      )

      // 将无效工具调用的结果也加入 results 以统一处理
      for (const tc of invalidToolCalls) {
        results.push({
          tc,
          result: { success: false, data: '', error: '无效的工具调用：工具名为空' }
        })
      }

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

      // 构建工具定义：普通模式仅保留搜索类工具，支持后续轮次继续调用
      const normalModeTools2 = getNormalModeTools()
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
      const replyAiConfig = ensureAIConfigReady(conversationId)
      if (!replyAiConfig) {
        updateMessage(replyMsg.id, {
          content: MISSING_AI_PROVIDER_MESSAGE,
          isStreaming: false,
          isError: true
        })
        isStreamingRef.current = false
        return
      }

      await aiService.streamChat(
        history,
        replyAiConfig,
        prompt?.content ?? null,
        toolDefs,
        controller.signal,
        {
          onToken: (token) => {
            fullContent += token
            streamingBufferRef.current.push(replyMsg.id, { content: fullContent })
          },
          onReasoningToken: (token) => {
            reasoningContent += token
            streamingBufferRef.current.push(replyMsg.id, {
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
            streamingBufferRef.current.flush()
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
                reasoningContent: reasoningContent || undefined,
                finishReason
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
    [ensureAIConfigReady, resolveCurrentRequestConfig, selectedPromptId, getPrompt, addMessage, updateMessage, getMessages, getVisibleMessages]
  )

  /**
   * 停止生成
   */
  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
    // 网站分析是主进程中的独立长任务，AbortController 无法终止它，需显式取消当前所有活跃任务。
    void siteAnalyzerService.getActiveTasks().then((taskIds) => {
      taskIds.forEach((taskId) => void siteAnalyzerService.cancelAnalysis(taskId))
    })
    isStreamingRef.current = false
    // 清理所有等待中的 humanInput resolver，让 Agent 循环能立即退出
    humanInputResolversRef.current.clear()

    // 立即将所有正在流式输出的消息标记为非流式，防止 UI 状态残留
    // 从 store 获取最新的 currentConversationId，确保工作区等场景能正确停止
    const latestConversationId = useConversationStore.getState().currentConversationId
    if (latestConversationId) {
      const msgs = getMessages(latestConversationId)
      for (const m of msgs) {
        if (m.isStreaming) {
          // 根据消息类型标记可继续类型：有 agentSteps 的标记为 'agent'，否则标记为 'normal'
          const stopContinuable: 'normal' | 'agent' = (m.agentSteps && m.agentSteps.length > 0) ? 'agent' : 'normal'
          updateMessage(m.id, { isStreaming: false, finishReason: 'abort', continuable: stopContinuable })
        }
      }
    }
  }, [getMessages, updateMessage])

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

      // 无可用 AI 源时直接拦截
      const aiConfig = ensureAIConfigReady(currentConversationId, agent && agent.enabled ? agent : undefined)
      if (!aiConfig) return

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
        try {
        await runAgent(
          agent,
          '', // 空 prompt，Agent 从历史中恢复上下文
          history,
          allTools,
          aiConfig,
          abortControllerRef.current.signal,
          {
            onStep: (step) => {
              agentSteps.push(step)
              if (step.type === 'thinking' || step.type === 'action') {
                finalContent = ''
                reasoningContent = ''
              }
              // 步骤变更需要立即刷新（低频事件）
              streamingBufferRef.current.flush()
              updateMessage(assistantMsg.id, { content: finalContent, agentSteps: [...agentSteps], isStreaming: true })
            },
            onToken: (token) => {
              finalContent += token
              // ⚡ 性能优化：onToken 高频回调不再展开 agentSteps，只在 onStep 低频回调中更新
              streamingBufferRef.current.push(assistantMsg.id, { content: finalContent, isStreaming: true })
            },
            onReasoningToken: (token) => {
              reasoningContent += token
              // ⚡ 同上：不再展开 agentSteps
              streamingBufferRef.current.push(assistantMsg.id, { content: finalContent, reasoningContent, isStreaming: true })
            },
            onStatusChange: (status) => {
              // 完成时强制刷新缓冲
              streamingBufferRef.current.flush()
              if (status === 'completed' || status === 'error' || status === 'stopped') {
                updateMessage(assistantMsg.id, {
                  content: finalContent || (status === 'error' ? 'Agent 执行出错' : ''),
                  isStreaming: false,
                  isError: status === 'error',
                  reasoningContent: reasoningContent || undefined,
                  agentSteps: [...agentSteps],
                  finishReason: status === 'stopped' ? 'abort' : status === 'error' ? 'error' : 'stop'
                })
                isStreamingRef.current = false
                if (status === 'completed') {
                  notifyIfReady('AI 回复完成', (finalContent || '已完成').slice(0, 100))
                }
              }
            },
            onError: (error) => {
              streamingBufferRef.current.flush()
              updateMessage(assistantMsg.id, { content: finalContent || error, isStreaming: false, isError: true, agentSteps: [...agentSteps] })
              isStreamingRef.current = false
            },
            onDone: (doneContent) => {
              streamingBufferRef.current.flush()
              // 保留 onStatusChange 已设置的 finishReason，不要覆盖
              const currentMsg = getMessages(currentConversationId).find(m => m.id === assistantMsg.id)
              const existingFinishReason = currentMsg?.finishReason
              // 统一追加中断提示
              const baseContent = doneContent || finalContent || ''
              const notice = getFinishNotice(existingFinishReason)
              const finalContentWithNotice = notice ? baseContent + notice : baseContent
              updateMessage(assistantMsg.id, { content: finalContentWithNotice, isStreaming: false, agentSteps: [...agentSteps], reasoningContent: reasoningContent || undefined, finishReason: existingFinishReason ?? 'stop' })
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
            onReportReady: async (reportHtml) => {
              // 先落盘再显示查看入口，避免用户在 IndexedDB 写入未完成时点击后无响应。
              try {
                await reportStore.saveReport(assistantMsg.id, reportHtml)
                updateMessage(assistantMsg.id, { hasReport: true })
              } catch (error) {
                console.error('[SiteAnalyzer] 保存交互式分析报告失败:', error)
              }
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
          wsContext,
          currentConversationId // Phase 2: conversationId 用于 checkpoint 关联
        )
        } catch (error) {
          const aborted = abortControllerRef.current?.signal.aborted
          if (!aborted) {
            streamingBufferRef.current.flush()
            const errMsg = error instanceof Error ? error.message : String(error)
            updateMessage(assistantMsg.id, {
              content: finalContent || errMsg || 'Agent 执行失败',
              isStreaming: false,
              isError: true,
              agentSteps: [...agentSteps]
            })
          } else {
            streamingBufferRef.current.flush()
            updateMessage(assistantMsg.id, {
              content: finalContent,
              isStreaming: false,
              agentSteps: [...agentSteps],
              finishReason: 'abort'
            })
          }
          isStreamingRef.current = false
        }
      } else {
        // 普通模式重新生成
        const prompt = selectedPromptId ? getPrompt(selectedPromptId) : null
        // 普通模式仅暴露搜索类工具
        const normalModeTools4 = getNormalModeTools()
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

        try {
          await aiService.streamChat(
            history,
            aiConfig,
            prompt?.content ?? null,
            toolDefs,
            abortControllerRef.current.signal,
            {
              onToken: (token) => {
                fullContent += token
                // 节流：通过 StreamingBuffer 批量合并更新
                streamingBufferRef.current.push(assistantMsg.id, { content: fullContent })
              },
              onReasoningToken: (token) => {
                reasoningContent += token
                // 节流：通过 StreamingBuffer 批量合并更新
                streamingBufferRef.current.push(assistantMsg.id, { content: fullContent, reasoningContent })
              },
              onToolCalls: (toolCalls) => {
                pendingToolCalls = toolCalls
              },
              onUsage: (usage) => {
                updateMessage(assistantMsg.id, { content: fullContent, tokenUsage: usage })
              },
              onDone: async (finishReason) => {
                // 完成时强制刷新缓冲
                streamingBufferRef.current.flush()
                if (pendingToolCalls.length > 0) {
                  updateMessage(assistantMsg.id, {
                    content: fullContent,
                    isStreaming: false,
                    toolCalls: pendingToolCalls.map((tc) => ({ ...tc, arguments: tc.arguments, status: 'pending' as const }))
                  })
                  await handleToolCalls(currentConversationId, assistantMsg.id, pendingToolCalls, getNormalModeTools(), currentBranchIdx)
                } else {
                  const notice = getFinishNotice(finishReason)
                  updateMessage(assistantMsg.id, { content: notice ? fullContent + notice : fullContent, isStreaming: false, finishReason })
                }
                isStreamingRef.current = false
              },
              onError: (error) => {
                streamingBufferRef.current.flush()
                updateMessage(assistantMsg.id, { content: fullContent || error, isStreaming: false, isError: true })
                isStreamingRef.current = false
              }
            },
            resolveCurrentRequestConfig(currentConversationId)
          )
        } catch (error) {
          const aborted = abortControllerRef.current?.signal.aborted
          if (!aborted) {
            streamingBufferRef.current.flush()
            const errMsg = error instanceof Error ? error.message : String(error)
            updateMessage(assistantMsg.id, {
              content: fullContent || errMsg || '请求失败',
              isStreaming: false,
              isError: true
            })
          } else {
            streamingBufferRef.current.flush()
            updateMessage(assistantMsg.id, {
              content: fullContent,
              isStreaming: false,
              finishReason: 'abort'
            })
          }
          isStreamingRef.current = false
        }
      }
    },
    [
      currentConversationId,
      ensureAIConfigReady,
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
    // 修复 Bug 2：不再依赖 isStreaming 状态查找消息，而是遍历所有消息查找包含该 stepId 的消息
    // 这是因为子 agent 的 human_input 步骤可能在主消息已完成 streaming 后才被用户选择
    if (currentConversationId) {
      const msgs = getMessages(currentConversationId)
      const targetMsg = msgs.find(m => m.agentSteps?.some(s => s.id === stepId))
      if (targetMsg) {
        // 更新 agentSteps 以反射用户选择（humanResponse 已在 executor 中设置）
        updateMessage(targetMsg.id, {
          agentSteps: [...(targetMsg.agentSteps ?? [])]
        })
      }
    }
  }, [currentConversationId, getMessages, updateMessage])

  /**
   * 批准 Agent 计划（draft → approved）
   */
  const approvePlan = useCallback(
    (plan: AgentPlan) => {
      if (!currentConversationId || !plan) return
      const msgs = getMessages(currentConversationId)
      const targetMsg = msgs
        .slice()
        .reverse()
        .find((m) => m.role === 'assistant' && m.agentPlan?.id === plan.id)
      if (targetMsg && targetMsg.agentPlan) {
        updateMessage(targetMsg.id, {
          agentPlan: { ...targetMsg.agentPlan, status: 'approved', updatedAt: Date.now() },
        })
      }
    },
    [currentConversationId, getMessages, updateMessage],
  )

  /**
   * 拒绝 Agent 计划（draft → failed），并要求重新规划
   */
  const rejectPlan = useCallback(
    (plan: AgentPlan, reason?: string) => {
      if (!currentConversationId || !plan) return
      const msgs = getMessages(currentConversationId)
      const targetMsg = msgs
        .slice()
        .reverse()
        .find((m) => m.role === 'assistant' && m.agentPlan?.id === plan.id)
      if (targetMsg && targetMsg.agentPlan) {
        const reasonText = reason ? `\n\n拒绝原因: ${reason}` : ''
        const updatedContent = (targetMsg.content || '') +
          `\n\n> ⚠️ **计划已拒绝**。${reasonText}请重新调用 \`create_plan\` 工具创建新的任务计划。`
        updateMessage(targetMsg.id, {
          agentPlan: { ...targetMsg.agentPlan, status: 'failed', updatedAt: Date.now() },
          content: updatedContent,
        })
      }
    },
    [currentConversationId, getMessages, updateMessage],
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

      // 无可用 AI 源时直接拦截（编辑已落库，但避免创建「思考中」脏消息）
      const aiConfig = ensureAIConfigReady(currentConversationId, agent && agent.enabled ? agent : undefined)
      if (!aiConfig) return

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
        try {
        await runAgent(
          agent,
          agentMessage,
          visibleHistory.slice(0, -1),
          allTools,
          aiConfig,
          abortControllerRef.current.signal,
          {
            onStep: (step) => {
              agentSteps.push(step)
              if (step.type === 'thinking' || step.type === 'action') {
                finalContent = ''
                reasoningContent = ''
              }
              // 步骤变更需要立即刷新（低频事件）
              streamingBufferRef.current.flush()
              updateMessage(assistantMsg.id, { content: finalContent, agentSteps: [...agentSteps], isStreaming: true })
            },
            onToken: (token) => {
              finalContent += token
              // ⚡ 性能优化：onToken 高频回调不再展开 agentSteps，只在 onStep 低频回调中更新
              streamingBufferRef.current.push(assistantMsg.id, { content: finalContent, isStreaming: true })
            },
            onReasoningToken: (token) => {
              reasoningContent += token
              // ⚡ 同上：不再展开 agentSteps
              streamingBufferRef.current.push(assistantMsg.id, { content: finalContent, reasoningContent, isStreaming: true })
            },
            onStatusChange: (status) => {
              // 完成时强制刷新缓冲
              streamingBufferRef.current.flush()
              if (status === 'completed' || status === 'error' || status === 'stopped') {
                updateMessage(assistantMsg.id, {
                  content: finalContent || (status === 'error' ? 'Agent 执行出错' : ''),
                  isStreaming: false,
                  isError: status === 'error',
                  reasoningContent: reasoningContent || undefined,
                  agentSteps: [...agentSteps],
                  finishReason: status === 'stopped' ? 'abort' : status === 'error' ? 'error' : 'stop'
                })
                isStreamingRef.current = false
                if (status === 'completed') {
                  notifyIfReady('AI 回复完成', (finalContent || '已完成').slice(0, 100))
                }
              }
            },
            onError: (error) => {
              streamingBufferRef.current.flush()
              updateMessage(assistantMsg.id, { content: finalContent || error, isStreaming: false, isError: true, agentSteps: [...agentSteps] })
              isStreamingRef.current = false
            },
            onDone: (doneContent) => {
              streamingBufferRef.current.flush()
              // 保留 onStatusChange 已设置的 finishReason，不要覆盖
              const currentMsg = getMessages(currentConversationId).find(m => m.id === assistantMsg.id)
              const existingFinishReason = currentMsg?.finishReason
              // 统一追加中断提示
              const baseContent = doneContent || finalContent || ''
              const notice = getFinishNotice(existingFinishReason)
              const finalContentWithNotice = notice ? baseContent + notice : baseContent
              updateMessage(assistantMsg.id, { content: finalContentWithNotice, isStreaming: false, agentSteps: [...agentSteps], reasoningContent: reasoningContent || undefined, finishReason: existingFinishReason ?? 'stop' })
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
            onReportReady: async (reportHtml) => {
              // 先落盘再显示查看入口，避免用户在 IndexedDB 写入未完成时点击后无响应。
              try {
                await reportStore.saveReport(assistantMsg.id, reportHtml)
                updateMessage(assistantMsg.id, { hasReport: true })
              } catch (error) {
                console.error('[SiteAnalyzer] 保存交互式分析报告失败:', error)
              }
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
          wsContext,
          currentConversationId // Phase 2: conversationId 用于 checkpoint 关联
        )
        } catch (error) {
          const aborted = abortControllerRef.current?.signal.aborted
          if (!aborted) {
            streamingBufferRef.current.flush()
            const errMsg = error instanceof Error ? error.message : String(error)
            updateMessage(assistantMsg.id, {
              content: finalContent || errMsg || 'Agent 执行失败',
              isStreaming: false,
              isError: true,
              agentSteps: [...agentSteps]
            })
          } else {
            streamingBufferRef.current.flush()
            updateMessage(assistantMsg.id, {
              content: finalContent,
              isStreaming: false,
              agentSteps: [...agentSteps],
              finishReason: 'abort'
            })
          }
          isStreamingRef.current = false
        }
      } else {
        // 普通模式
        const prompt = selectedPromptId ? getPrompt(selectedPromptId) : null
        // 普通模式仅暴露搜索类工具
        const normalModeTools6 = getNormalModeTools()
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

        try {
          await aiService.streamChat(
            visibleHistory,
            aiConfig,
            prompt?.content ?? null,
            toolDefs,
            abortControllerRef.current.signal,
            {
              onToken: (token) => {
                fullContent += token
                // 节流：通过 StreamingBuffer 批量合并更新
                streamingBufferRef.current.push(assistantMsg.id, { content: fullContent })
              },
              onReasoningToken: (token) => {
                reasoningContent += token
                // 节流：通过 StreamingBuffer 批量合并更新
                streamingBufferRef.current.push(assistantMsg.id, { content: fullContent, reasoningContent })
              },
              onToolCalls: (toolCalls) => {
                pendingToolCalls = toolCalls
              },
              onUsage: (usage) => {
                updateMessage(assistantMsg.id, { content: fullContent, tokenUsage: usage })
              },
              onDone: async (finishReason) => {
                // 完成时强制刷新缓冲
                streamingBufferRef.current.flush()
                if (pendingToolCalls.length > 0) {
                  updateMessage(assistantMsg.id, {
                    content: fullContent,
                    isStreaming: false,
                    toolCalls: pendingToolCalls.map((tc) => ({ ...tc, arguments: tc.arguments, status: 'pending' as const }))
                  })
                  await handleToolCalls(currentConversationId, assistantMsg.id, pendingToolCalls, getNormalModeTools(), newBranchIndex)
                } else {
                  const notice = getFinishNotice(finishReason)
                  updateMessage(assistantMsg.id, { content: notice ? fullContent + notice : fullContent, isStreaming: false, finishReason })
                }
                isStreamingRef.current = false
              },
              onError: (error) => {
                streamingBufferRef.current.flush()
                updateMessage(assistantMsg.id, { content: fullContent || error, isStreaming: false, isError: true })
                isStreamingRef.current = false
              }
            },
            resolveCurrentRequestConfig(currentConversationId)
          )
        } catch (error) {
          const aborted = abortControllerRef.current?.signal.aborted
          if (!aborted) {
            streamingBufferRef.current.flush()
            const errMsg = error instanceof Error ? error.message : String(error)
            updateMessage(assistantMsg.id, {
              content: fullContent || errMsg || '请求失败',
              isStreaming: false,
              isError: true
            })
          } else {
            streamingBufferRef.current.flush()
            updateMessage(assistantMsg.id, {
              content: fullContent,
              isStreaming: false,
              finishReason: 'abort'
            })
          }
          isStreamingRef.current = false
        }
      }
    },
    [
      currentConversationId,
      ensureAIConfigReady,
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

  /**
   * 继续生成（普通对话续写 或 Agent 继续执行）
   * 根据目标消息的 continuable 字段分派到对应分支
   */
  const continueGeneration = useCallback(
    async (messageId: string) => {
      const convId = currentConversationId
      if (!convId || isStreamingRef.current) return

      const msgs = getMessages(convId)
      const targetMsg = msgs.find((m) => m.id === messageId)
      if (!targetMsg || targetMsg.role !== 'assistant' || !targetMsg.continuable) return

      // 无可用 AI 源时直接拦截，避免消息卡在「思考中」
      const continueAgentId = targetMsg.continuable === 'agent' ? targetMsg.agentId : undefined
      const continueAgent = continueAgentId
        ? (useWorkspaceAgentStore.getState().workspaceAgents.find((a) => a.id === continueAgentId)
          ?? getAgent(continueAgentId))
        : undefined
      const aiConfig = ensureAIConfigReady(convId, continueAgent)
      if (!aiConfig) return

      isStreamingRef.current = true
      abortControllerRef.current = new AbortController()

      // 标记为流式中，清除可继续标记
      updateMessage(messageId, { isStreaming: true, continuable: null })

      if (targetMsg.continuable === 'agent') {
        // ===== Agent 继续 =====
        const agentId = targetMsg.agentId
        const agent = agentId
          ? (useWorkspaceAgentStore.getState().workspaceAgents.find((a) => a.id === agentId)
            ?? getAgent(agentId))
          : undefined
        if (!agent || !agent.enabled) {
          updateMessage(messageId, { isStreaming: false, isError: true, continuable: 'agent' })
          isStreamingRef.current = false
          return
        }

        const history = msgs
        const allTools = getAvailableTools()
        const existingSteps = [...(targetMsg.agentSteps || [])]
        // 记录本次继续生成之前的 final_answer 数量
        const existingFinalAnswerCount = existingSteps.filter((s) => s.type === 'final_answer').length
        const agentSteps = [...existingSteps]
        // 剥离中断提示，确保 Agent 继续时 content 是纯净的
        let finalContent = targetMsg.content || ''
        const abortNotice = getFinishNotice('abort')
        if (abortNotice && finalContent.endsWith(abortNotice)) {
          finalContent = finalContent.slice(0, -abortNotice.length)
        }
        let reasoningContent = targetMsg.reasoningContent || ''

        const wsContext = buildWorkspaceContext(convId)

        try {
          await runAgent(
            agent,
            '', // resume 模式：空用户消息
            history,
            allTools,
            aiConfig,
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
                streamingBufferRef.current.push(messageId, { content: finalContent })
              },
              onReasoningToken: (token) => {
                reasoningContent += token
                streamingBufferRef.current.push(messageId, {
                  content: finalContent,
                  reasoningContent
                })
              },
              onStatusChange: (status) => {
                streamingBufferRef.current.flush()
                if (status === 'stopped') {
                  updateMessage(messageId, {
                    isStreaming: false,
                    continuable: 'agent' // 停止后仍可继续
                  })
                  isStreamingRef.current = false
                }
              },
              onDone: (doneContent) => {
                streamingBufferRef.current.flush()
                if (doneContent) finalContent = doneContent
                // 统一追加中断提示
                const currentMsg = getMessages(convId).find(m => m.id === messageId)
                const existingFinishReason = currentMsg?.finishReason
                const notice = getFinishNotice(existingFinishReason)
                const finalContentWithNotice = notice ? finalContent + notice : finalContent
                // 检查本次新增的步骤中是否有 final_answer 来决定是否可继续
                const newFinalAnswerCount = agentSteps.filter((s) => s.type === 'final_answer').length
                const hasNewFinalAnswer = (newFinalAnswerCount - existingFinalAnswerCount) > 0
                const agentContinuable: 'agent' | null = (!hasNewFinalAnswer && existingFinishReason !== 'error') ? 'agent' : null
                updateMessage(messageId, {
                  content: finalContentWithNotice,
                  agentSteps: [...agentSteps],
                  isStreaming: false,
                  reasoningContent: reasoningContent || undefined,
                  finishReason: existingFinishReason ?? 'stop',
                  continuable: agentContinuable
                })
                isStreamingRef.current = false
              },
              onError: (error) => {
                updateMessage(messageId, {
                  isStreaming: false,
                  isError: true,
                  continuable: 'agent' // 出错后仍可继续
                })
                isStreamingRef.current = false
              },
              onHumanInput: async (step) => {
                // 复用现有 humanInput 逻辑
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
              onReportReady: async (reportHtml) => {
                // 先落盘再显示查看入口，避免用户在 IndexedDB 写入未完成时点击后无响应。
                try {
                  await reportStore.saveReport(messageId, reportHtml)
                  updateMessage(messageId, { hasReport: true })
                } catch (error) {
                  console.error('[SiteAnalyzer] 保存交互式分析报告失败:', error)
                }
              },
              onSiteAnalyzerProgress: (progress) => {
                if (progress.type === 'started') {
                  siteAnalyzerStartTimeRef.current = Date.now()
                }
                updateMessage(messageId, {
                  siteAnalyzerProgress: progress as unknown as SiteAnalyzerLiveProgress
                })
              },
            },
            wsContext,
            convId,
            { resume: true, existingSteps }
          )
        } catch (error) {
          if (!abortControllerRef.current.signal.aborted) {
            updateMessage(messageId, {
              isStreaming: false,
              isError: true,
              continuable: 'agent'
            })
            isStreamingRef.current = false
          }
        }
      } else {
        // ===== 普通对话继续 =====
        // 剥离中断提示（getFinishNotice 追加的文本），确保续写前缀是纯净内容
        let existingContent = targetMsg.content || ''
        const abortNotice = getFinishNotice('abort')
        if (abortNotice && existingContent.endsWith(abortNotice)) {
          existingContent = existingContent.slice(0, -abortNotice.length)
        }

        const history = msgs
        let appendedContent = ''
        let reasoningContent = targetMsg.reasoningContent || ''

        // 构建续写请求：仅保留目标消息及之前的消息，将目标消息替换为"前缀" assistant 消息
        // 排除目标消息之后的所有消息（如 system 消息等），确保 assistant 消息是最后一条
        const targetIndex = history.findIndex((msg) => msg.id === messageId)
        const continueMessages = history
          .slice(0, targetIndex + 1)
          .map((msg) =>
            msg.id === messageId
              ? { ...msg, content: existingContent, role: 'assistant' as const }
              : msg
          )

        try {
          await aiService.streamChat(
            continueMessages,
            aiConfig,
            /* systemPrompt */ null,
            /* tools */ [],
            abortControllerRef.current.signal,
            {
              onToken: (token) => {
                appendedContent += token
                streamingBufferRef.current.push(messageId, {
                  content: existingContent + appendedContent
                })
              },
              onReasoningToken: (token) => {
                reasoningContent += token
                streamingBufferRef.current.push(messageId, {
                  content: existingContent + appendedContent,
                  reasoningContent
                })
              },
              onDone: (finishReason) => {
                streamingBufferRef.current.flush()
                const finalContent = existingContent + appendedContent
                updateMessage(messageId, {
                  content: finalContent,
                  isStreaming: false,
                  finishReason,
                  continuable: (finishReason === 'length' || finishReason === 'abort') ? 'normal' : null
                })
                isStreamingRef.current = false
              },
              onError: (error) => {
                updateMessage(messageId, {
                  content: existingContent + appendedContent || error,
                  isStreaming: false,
                  isError: true,
                  continuable: 'normal' // 出错后仍可重试继续
                })
                isStreamingRef.current = false
              }
            },
            resolveCurrentRequestConfig(convId)
          )
        } catch (error) {
          if (!abortControllerRef.current.signal.aborted) {
            updateMessage(messageId, {
              isStreaming: false,
              isError: true,
              continuable: 'normal'
            })
            isStreamingRef.current = false
          }
        }
      }
    },
    [
      currentConversationId,
      getMessages,
      updateMessage,
      ensureAIConfigReady,
      resolveCurrentRequestConfig,
      getAvailableTools,
      getAgent,
      buildWorkspaceContext
    ]
  )

  return {
    sendMessage,
    stopGeneration,
    regenerateMessage,
    editAndResend,
    continueGeneration,
    isStreaming: isStreamingRef.current,
    handleHumanInput,
    approvePlan,
    rejectPlan,
  }
}
