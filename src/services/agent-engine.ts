/**
 * Agent Engine - 驱动 Agent 运行的核心引擎
 *
 * 实现 ReAct（思考-行动-观察）循环模式：
 * 1. 组装 Prompt（系统提示词 + 工具描述 + 记忆 + 用户消息）
 * 2. 调用 LLM API，获取模型输出
 * 3. 解析输出：最终回复 or 工具调用（支持原生 function calling 和文本格式）
 * 4. 如果是工具调用 → 执行工具 → 将结果反馈给模型
 * 5. 重复 2~4，直到达到终止条件
 */

import type {
  AgentProfile,
  AgentStep,
  AgentStepType,
  AgentRunContext,
  GlobalConfig,
  Message,
  Tool,
  ToolDefinition,
  ToolExecuteResult
} from '../types'
import { aiService } from './ai-service'
import { toolService } from './tool-service'
import { memoryService } from './memory-service'
import { executeMathTool } from './math-tools'
import { siteAnalyzerService } from './site-analyzer-service'

/** Agent 引擎回调 */
export interface AgentEngineCallbacks {
  /** 每一步执行时回调（用于实时展示） */
  onStep: (step: AgentStep) => void
  /** 最终回复内容流式输出 */
  onToken: (token: string) => void
  /** 推理内容流式输出 */
  onReasoningToken: (token: string) => void
  /** 运行状态变化 */
  onStatusChange: (status: AgentRunContext['status']) => void
  /** 错误 */
  onError: (error: string) => void
  /** 完成 */
  onDone: (finalContent: string) => void
  /** 需要用户输入时回调（返回用户选择的值，单选为字符串，多选为字符串数组） */
  onHumanInput?: (step: AgentStep) => Promise<string | string[]>
  /** 网站分析报告生成完成时回调（传递自包含的 HTML 报告） */
  onReportReady?: (reportHtml: string) => void
  /** 网站分析实时进度回调 */
  onSiteAnalyzerProgress?: (progress: { taskId: string; type: string; message: string; pagesCrawled?: number; totalPages?: number; apisFound?: number; pagesAnalyzed?: number; currentUrl?: string; error?: string }) => void
}

/** Agent 内部消息格式（支持工具调用） */
interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  /** 原生工具调用列表（assistant 消息） */
  toolCalls?: Array<{ id: string; name: string; arguments: string }>
  /** 工具结果关联的调用 ID（tool 消息） */
  toolCallId?: string
  /** 工具名称（tool 消息） */
  toolName?: string
}

/**
 * 构建 Agent 的系统提示词（含工具描述和记忆）
 */
function buildAgentSystemPrompt(
  agent: AgentProfile,
  tools: Tool[],
  memoryContext: string
): string {
  let prompt = agent.systemPrompt

  // 添加工具描述
  if (tools.length > 0) {
    prompt += '\n\n## 可用工具\n你可以使用以下工具来完成任务：\n'
    for (const tool of tools) {
      prompt += `\n### ${tool.name}\n描述：${tool.description}\n参数：${JSON.stringify(tool.parameters, null, 2)}\n`
    }
    prompt += `\n要调用工具，请使用提供的 function calling 功能。\n`
    prompt += `\n### 重要：工具使用规则\n`
    prompt += `- 当任务涉及计算、数学推导、数据分析、或需要精确结果时，你必须调用相关工具来完成，不要尝试自行计算或推导。\n`
    prompt += `- 工具提供的结果是精确的，你的推理和最终回答应基于工具返回的结果。\n`
    prompt += `- 你可以且应该连续调用多个工具来完成复杂任务，不要在第一步之后就停止。\n`
    prompt += `- 每次收到工具执行结果后，分析结果并判断任务是否完成。\n`
    prompt += `- 如果任务尚未完成，请继续调用下一个需要的工具。\n`
    prompt += `- 只有当你确信任务的所有步骤都已完成时，才给出最终回答。\n`
    prompt += `- 不要把中间结果当作最终回答，中间结果应作为继续执行的依据。\n`
  }

  // 添加记忆上下文
  if (memoryContext) {
    prompt += `\n\n${memoryContext}\n`
  }

  // 添加规划策略提示
  switch (agent.planningStrategy) {
    case 'react':
      prompt += '\n\n## 执行策略（ReAct）\n请按照"思考-行动-观察"的模式逐步解决问题：\n'
      prompt += '1. **思考**：分析当前情况，决定下一步行动\n'
      prompt += '2. **行动**：调用合适的工具执行操作\n'
      prompt += '3. **观察**：分析工具返回的结果\n'
      prompt += '4. **循环**：如果任务未完成，回到步骤1继续\n'
      prompt += '只有当所有必要步骤都执行完毕后，才给出最终回答。\n'
      break
    case 'plan-and-execute':
      prompt += '\n\n## 执行策略（Plan-and-Execute）\n请按以下方式工作：\n'
      prompt += '1. 先将任务拆解为子任务列表\n'
      prompt += '2. 逐步执行每个子任务，每步调用相应工具\n'
      prompt += '3. 根据每步结果调整后续计划\n'
      prompt += '4. 所有子任务完成后才给出最终回答\n'
      break
    case 'trial-and-error':
      prompt += '\n\n## 执行策略（Trial-and-Error）\n请大胆尝试：\n'
      prompt += '1. 尝试使用工具解决问题\n'
      prompt += '2. 如果某条路径行不通，分析错误原因\n'
      prompt += '3. 回退并尝试其他方法\n'
      prompt += '4. 持续尝试直到任务完成\n'
      break
  }

  return prompt
}

/**
 * 从 LLM 输出中解析工具调用（文本格式兼容）
 */
function parseToolCalls(content: string): Array<{ name: string; arguments: Record<string, unknown> }> {
  const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = []

  // 匹配 ```tool_call\n{...}\n``` 格式
  const toolCallRegex = /```tool_call\s*\n([\s\S]*?)\n```/g
  let match
  while ((match = toolCallRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim())
      if (parsed.name) {
        toolCalls.push({
          name: parsed.name,
          arguments: parsed.arguments || {}
        })
      }
    } catch {
      // 解析失败，跳过
    }
  }

  // 也匹配 JSON 格式的工具调用（兼容性）
  if (toolCalls.length === 0) {
    const jsonRegex = /\{[\s]*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[^}]*\})\s*\}/g
    while ((match = jsonRegex.exec(content)) !== null) {
      try {
        toolCalls.push({
          name: match[1],
          arguments: JSON.parse(match[2])
        })
      } catch {
        // ignore
      }
    }
  }

  return toolCalls
}

/**
 * 将 Agent 内部消息转换为 Message 格式（供 aiService.streamChat 使用）
 */
function toMessages(agentMessages: AgentMessage[]): Message[] {
  return agentMessages.map((m, idx) => {
    const msg: Message = {
      id: `agent-msg-${idx}`,
      conversationId: 'agent-internal',
      role: m.role,
      content: m.content,
      timestamp: Date.now()
    }
    // 携带原生工具调用信息
    if (m.toolCalls && m.toolCalls.length > 0) {
      msg.toolCalls = m.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
        status: 'completed' as const
      }))
    }
    // 携带工具结果信息
    if (m.toolCallId) {
      msg.toolCallId = m.toolCallId
      msg.toolName = m.toolName
    }
    return msg
  })
}

/**
 * Agent Engine 主运行函数
 *
 * 支持两种工具调用方式：
 * 1. OpenAI 原生 function calling（通过 API 的 tool_calls 字段）
 * 2. 文本格式工具调用（通过 ```tool_call 代码块）
 */
export async function runAgent(
  agent: AgentProfile,
  userMessage: string,
  conversationHistory: Message[],
  allTools: Tool[],
  globalConfig: GlobalConfig,
  signal: AbortSignal,
  callbacks: AgentEngineCallbacks
): Promise<void> {
  callbacks.onStatusChange('running')

  const startTime = Date.now()
  let stepIndex = 0

  // 过滤出 Agent 启用的工具（完全由 enabledToolIds 控制）
  const agentTools = allTools.filter(
    (t) => agent.enabledToolIds.includes(t.id) && t.enabled
  )

  // 获取记忆上下文
  let memoryContext = ''
  if (agent.memoryConfig.longTermEnabled) {
    memoryContext = memoryService.formatMemoriesAsContext(agent.id)
  }

  // 构建系统提示词
  const systemPrompt = buildAgentSystemPrompt(agent, agentTools, memoryContext)

  // 构建对话历史（限制轮数）
  const maxHistory = agent.memoryConfig.historyTurns * 2 // 每轮 = user + assistant
  const recentHistory = conversationHistory.slice(-maxHistory)

  // 构建初始消息列表
  const messages: AgentMessage[] = []

  // 添加历史消息
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      // Agent 步骤的最终回答作为 assistant 消息
      if (msg.role === 'assistant' && msg.agentSteps && msg.agentSteps.length > 0) {
        const finalStep = msg.agentSteps.find((s) => s.type === 'final_answer')
        if (finalStep) {
          messages.push({ role: 'assistant', content: finalStep.content })
          continue
        }
      }
      // 如果 assistant 消息有原生工具调用，也携带过去
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: msg.content,
          toolCalls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments
          }))
        })
        continue
      }
      messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
    }
    // 工具结果消息
    if (msg.role === 'tool' && msg.toolCallId) {
      messages.push({
        role: 'tool',
        content: msg.content,
        toolCallId: msg.toolCallId,
        toolName: msg.toolName
      })
    }
  }

  // 添加当前用户消息
  messages.push({ role: 'user', content: userMessage })

  const steps: AgentStep[] = []

  // 处理 remember 工具调用的辅助函数
  const handleRememberTool = (args: Record<string, unknown>): ToolExecuteResult => {
    const key = String(args.key ?? '')
    const value = String(args.value ?? '')
    if (!key || !value) {
      return { success: false, data: '', error: 'remember 工具需要 key 和 value 参数' }
    }
    memoryService.remember(agent.id, key, value)
    return { success: true, data: `已记住: ${key} = ${value}` }
  }

  // 处理 recall 工具调用的辅助函数
  const handleRecallTool = (args: Record<string, unknown>): ToolExecuteResult => {
    const key = String(args.key ?? '')
    if (!key) {
      return { success: false, data: '', error: 'recall 工具需要 key 参数' }
    }
    const value = memoryService.recall(agent.id, key)
    if (value === null || value === undefined) {
      return { success: true, data: `没有找到关于 "${key}" 的记忆` }
    }
    return { success: true, data: `${key} = ${value}` }
  }


  // ==================== 需求分析工具处理 ====================

  // 已收集的需求点列表（内部状态）
  const collectedRequirements: Array<{
    name: string
    description: string
    details?: string
    priority: string
  }> = []

  // 已进行的自问自答记录（内部状态）
  const selfQARecords: Array<{
    question: string
    answer: string
    confidence: string
  }> = []

  // 处理 ask_self 工具调用
  const handleAskSelfTool = (args: Record<string, unknown>): ToolExecuteResult => {
    const question = String(args.question ?? '')
    const answer = String(args.answer ?? '')
    const confidence = String(args.confidence ?? 'medium')
    if (!question || !answer) {
      return { success: false, data: '', error: 'ask_self 工具需要 question 和 answer 参数' }
    }
    selfQARecords.push({ question, answer, confidence })
    const confidenceLabel = confidence === 'high' ? '高信心' : confidence === 'medium' ? '中等信心' : '低信心需确认'
    return {
      success: true,
      data: `问题: ${question}\n回答: ${answer}\n信心: ${confidenceLabel}\n\n已记录此信息。当前已进行 ${selfQARecords.length} 轮自问自答。`
    }
  }

  // 处理 define_requirement 工具调用
  const handleDefineRequirementTool = (args: Record<string, unknown>): ToolExecuteResult => {
    const name = String(args.name ?? '')
    const description = String(args.description ?? '')
    const details = args.details ? String(args.details) : undefined
    const priority = String(args.priority ?? 'should_have')
    if (!name || !description) {
      return { success: false, data: '', error: 'define_requirement 工具需要 name 和 description 参数' }
    }
    collectedRequirements.push({ name, description, details, priority })
    const priorityLabel = priority === 'must_have' ? '必须' : priority === 'should_have' ? '重要' : '加分'
    return {
      success: true,
      data: `已定义需求点: ${name}\n描述: ${description}\n${details ? `详细规则: ${details}\n` : ''}优先级: ${priorityLabel}\n\n当前已定义 ${collectedRequirements.length} 个需求点。`
    }
  }

  // 处理 review_requirements 工具调用
  const handleReviewRequirementsTool = (args: Record<string, unknown>): ToolExecuteResult => {
    const originalRequest = String(args.original_request ?? '')
    const currentSummary = String(args.current_summary ?? '')
    const checkDimensions = Array.isArray(args.check_dimensions)
      ? args.check_dimensions.map(String)
      : []
    if (!originalRequest || !currentSummary) {
      return { success: false, data: '', error: 'review_requirements 工具需要 original_request 和 current_summary 参数' }
    }

    // 构建审查报告
    const reqNames = collectedRequirements.map(r => `- ${r.name} (${r.priority})`).join('\n')
    const qaSummary = selfQARecords.map(q => `- [${q.confidence}] ${q.question} -> ${q.answer}`).join('\n')

    let reviewReport = '需求审查报告\n\n'
    reviewReport += `原始需求: ${originalRequest}\n\n`
    reviewReport += `已定义的需求点 (${collectedRequirements.length}个):\n${reqNames || '尚未定义'}\n\n`
    reviewReport += `自问自答记录 (${selfQARecords.length}轮):\n${qaSummary || '尚未进行'}\n\n`
    reviewReport += `当前摘要: ${currentSummary}\n\n`
    reviewReport += `检查维度: ${checkDimensions.join('、')}\n\n`
    reviewReport += `请根据以上信息判断：\n`
    reviewReport += `1. 是否有遗漏的功能点？如有，请继续调用 define_requirement 补充\n`
    reviewReport += `2. 是否有模糊的描述？如有，请调用 ask_self 澄清\n`
    reviewReport += `3. 是否所有维度都已覆盖？如果完整，请输出最终需求文档\n`
    reviewReport += `4. 低信心的自问自答是否需要标注为"待用户确认"？`

    return {
      success: true,
      data: reviewReport
    }
  }


  // ==================== 网站分析工具处理 ====================

  // 当前活跃的分析任务ID
  let activeSiteAnalyzerTaskId: string | null = null

  // 处理 site_analyzer_start 工具调用
  const handleSiteAnalyzerStartTool = async (args: Record<string, unknown>): Promise<ToolExecuteResult> => {
    const targetUrl = String(args.target_url ?? '')
    if (!targetUrl) {
      return { success: false, data: '', error: 'site_analyzer_start 工具需要 target_url 参数' }
    }

    // 构建配置
    const taskId = `sa-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    const loginType = String(args.login_type ?? 'manual') as 'manual' | 'password' | 'cookie'

    const config: Record<string, unknown> = {
      targetUrl,
      loginType,
      loginCredential: {},
      aiConfig: {
        baseUrl: String(args.ai_base_url ?? globalConfig.baseUrl ?? ''),
        apiKey: String(args.ai_api_key ?? globalConfig.apiKey ?? ''),
        modelId: String(args.ai_model_id ?? globalConfig.defaultModel ?? '')
      },
      taskId
    }

    // 填充登录凭证
    const cred = config.loginCredential as Record<string, unknown>
    if (args.username) cred.username = String(args.username)
    if (args.password) cred.password = String(args.password)
    if (args.cookie) cred.cookie = String(args.cookie)
    if (args.token) cred.token = String(args.token)

    // 填充爬取规则
    const crawlRules: Record<string, unknown> = {}
    if (args.max_depth) crawlRules.maxDepth = Number(args.max_depth)
    if (args.max_pages) crawlRules.maxPages = Number(args.max_pages)
    if (args.url_include_patterns) crawlRules.urlIncludePatterns = args.url_include_patterns
    if (args.url_exclude_patterns) crawlRules.urlExcludePatterns = args.url_exclude_patterns
    if (args.crawl_delay) crawlRules.crawlDelay = Number(args.crawl_delay)
    if (Object.keys(crawlRules).length > 0) config.crawlRules = crawlRules

    // 填充代理和反爬虫配置
    if (args.proxy_server) {
      config.proxy = { server: String(args.proxy_server) }
    }
    const antiBot: Record<string, unknown> = {}
    if (args.user_agent) antiBot.userAgent = String(args.user_agent)
    if (args.simulate_human) antiBot.simulateHuman = Boolean(args.simulate_human)
    if (Object.keys(antiBot).length > 0) config.antiBot = antiBot

    activeSiteAnalyzerTaskId = taskId

    // 注册进度监听器，将进度转为观察步骤
    const progressMessages: string[] = []
    let capturedReportHtml = ''
    siteAnalyzerService.addProgressListener('agent-engine', (progress) => {
      progressMessages.push(progress.message)
      // 捕获报告HTML内容
      if (progress.reportHtml) {
        capturedReportHtml = progress.reportHtml
      }
      // 实时转发进度到UI层
      callbacks.onSiteAnalyzerProgress?.({
        taskId: progress.taskId,
        type: progress.type,
        message: progress.message,
        pagesCrawled: progress.pagesCrawled,
        totalPages: progress.totalPages,
        apisFound: progress.apisFound,
        pagesAnalyzed: progress.pagesAnalyzed,
        currentUrl: progress.currentUrl,
        error: progress.error
      })
    })

    try {
      // 启动分析
      const result = await siteAnalyzerService.startAnalysis(config as unknown as Parameters<typeof siteAnalyzerService.startAnalysis>[0])

      // 移除监听器
      siteAnalyzerService.removeProgressListener('agent-engine')
      activeSiteAnalyzerTaskId = null

      // 生成摘要
      const summary = siteAnalyzerService.generateSummary(result)

      // 将详细数据包含在结果中（不包含完整HTML报告，太大了）
      let fullData = summary

      // 附加API接口和模块的详细JSON数据，供AI生成报告
      const analysisData = {
        modules: result.modules,
        apis: result.apis.map(a => ({
          url: a.url,
          method: a.method,
          description: a.description,
          params: a.params,
          returnValue: a.returnValue,
          frequency: a.frequency
        })),
        pagesCount: result.pages.length,
        requestsCount: result.requests.length,
        reportAvailable: !!(capturedReportHtml || result.reportHtml)
      }
      fullData += `\n\n[ANALYSIS_DATA]\n${JSON.stringify(analysisData, null, 2)}\n[/ANALYSIS_DATA]`

      // 将报告HTML通过回调传递给UI层
      const reportHtml = capturedReportHtml || result.reportHtml
      if (reportHtml && callbacks.onReportReady) {
        callbacks.onReportReady(reportHtml)
      }

      return {
        success: true,
        data: fullData
      }
    } catch (error) {
      siteAnalyzerService.removeProgressListener('agent-engine')
      activeSiteAnalyzerTaskId = null
      const errorMsg = error instanceof Error ? error.message : '网站分析失败'
      return { success: false, data: '', error: errorMsg }
    }
  }

  // 处理 site_analyzer_cancel 工具调用
  const handleSiteAnalyzerCancelTool = async (args: Record<string, unknown>): Promise<ToolExecuteResult> => {
    const taskId = String(args.task_id ?? activeSiteAnalyzerTaskId ?? '')
    if (!taskId) {
      return { success: false, data: '', error: '没有活跃的分析任务可取消' }
    }

    const cancelled = await siteAnalyzerService.cancelAnalysis(taskId)
    if (cancelled) {
      activeSiteAnalyzerTaskId = null
      return { success: true, data: `分析任务 ${taskId} 已取消` }
    }
    return { success: false, data: '', error: `无法取消任务 ${taskId}，任务可能已完成或不存在` }
  }

  // 处理 ask_human 工具调用（异步，需等待用户输入）
  const handleAskHumanTool = async (args: Record<string, unknown>): Promise<ToolExecuteResult> => {
    const question = String(args.question ?? '')
    const options = Array.isArray(args.options)
      ? args.options.map((opt: Record<string, unknown>) => ({
          label: String(opt.label ?? ''),
          value: String(opt.value ?? ''),
          description: opt.description ? String(opt.description) : undefined
        }))
      : []
    const allowMultiple = Boolean(args.allow_multiple)
    if (!question || options.length < 2) {
      return { success: false, data: '', error: 'ask_human 工具需要 question 和至少2个 options' }
    }

    // 创建 human_input 步骤
    const humanStep: AgentStep = {
      id: crypto.randomUUID(),
      type: 'human_input',
      content: question,
      humanChoice: { question, options, allowMultiple },
      stepIndex: stepIndex++,
      timestamp: Date.now()
    }
    steps.push(humanStep)
    callbacks.onStep(humanStep)

    // 如果没有 onHumanInput 回调，返回默认提示
    if (!callbacks.onHumanInput) {
      return {
        success: true,
        data: '用户输入功能未启用，请自行推断答案。'
      }
    }

    // 暂停执行，等待用户选择
    try {
      const userResponse = await callbacks.onHumanInput(humanStep)
      // 更新步骤记录用户选择
      humanStep.humanResponse = userResponse
      // 格式化选择结果
      const responseText = Array.isArray(userResponse)
        ? userResponse.join('、')
        : userResponse
      return {
        success: true,
        data: `用户选择了: ${responseText}`
      }
    } catch (error) {
      // 如果是中止错误，向上抛出让外层 try-catch 处理
      if (error instanceof Error && error.message === 'aborted') {
        throw error
      }
      return {
        success: true,
        data: '用户未做选择，请自行推断答案。'
      }
    }
  }

  // Agent 循环（maxSteps 为 0 表示无限制）
  try {
  for (let i = 0; agent.termination.maxSteps === 0 || i < agent.termination.maxSteps; i++) {

    // 如果不是第一步，添加延迟避免 API 请求过快（Too many requests）
    if (i > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 1500)
        if (signal.aborted) { clearTimeout(timer); reject(new Error('aborted')); return }
        const onAbort = () => { clearTimeout(timer); reject(new Error('aborted')) }
        signal.addEventListener('abort', onAbort, { once: true })
      })
    }

    // 检查超时（timeoutSeconds 为 0 表示不限制）
    if (agent.termination.timeoutSeconds > 0 && (Date.now() - startTime) / 1000 > agent.termination.timeoutSeconds) {
      const errorStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'error',
        content: `执行超时（${agent.termination.timeoutSeconds}秒）`,
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(errorStep)
      callbacks.onStep(errorStep)
      callbacks.onStatusChange('error')
      callbacks.onError('Agent 执行超时')
      return
    }

    // 检查中止信号
    if (signal.aborted) {
      const stopStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'error',
        content: '用户手动停止',
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(stopStep)
      callbacks.onStep(stopStep)
      callbacks.onStatusChange('stopped')
      callbacks.onDone('')
      return
    }

    // 准备工具定义
    const toolDefs = toolService.toToolDefinitions(agentTools)

    // 调用 LLM
    let fullContent = ''
    let reasoningContent = ''
    let nativeToolCalls: Array<{ id: string; name: string; arguments: string }> = []

    try {
      await aiService.streamChat(
        toMessages(messages),
        {
          ...globalConfig,
          // 覆盖 Agent 特定配置
          defaultModel: agent.modelConfig.model || globalConfig.defaultModel,
          temperature: agent.modelConfig.temperature ?? globalConfig.temperature,
          maxTokens: agent.modelConfig.maxTokens || globalConfig.maxTokens
        },
        systemPrompt,
        toolDefs,
        signal,
        {
          onToken: (token) => {
            fullContent += token
            // 实时转发 token 到 UI，实现流式输出
            callbacks.onToken(token)
          },
          onReasoningToken: (token) => {
            reasoningContent += token
            // 实时转发推理 token 到 UI
            callbacks.onReasoningToken(token)
          },
          onToolCalls: (toolCalls) => {
            // 捕获原生 function calling 返回的工具调用
            nativeToolCalls = toolCalls
          },
          onDone: () => {
            // 处理在下方
          },
          onError: (error) => {
            throw new Error(error)
          }
        }
      )
    } catch (error) {
      if (signal.aborted) {
        callbacks.onStatusChange('stopped')
        callbacks.onDone('')
        return
      }
      const errorMsg = error instanceof Error ? error.message : '未知错误'

      // 如果是请求频率限制错误，等待后重试
      if (errorMsg.toLowerCase().includes('too many requests') || errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')) {
        const retryStep: AgentStep = {
          id: crypto.randomUUID(),
          type: 'thinking',
          content: `遇到请求频率限制，等待 5 秒后重试...`,
          stepIndex: stepIndex++,
          timestamp: Date.now()
        }
        steps.push(retryStep)
        callbacks.onStep(retryStep)

        await new Promise((resolve) => setTimeout(resolve, 5000))
        // 重试当前轮次（不增加 i）
        i--
        continue
      }

      const errorStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'error',
        content: errorMsg,
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(errorStep)
      callbacks.onStep(errorStep)
      callbacks.onStatusChange('error')
      callbacks.onError(errorMsg)
      return
    }

    // 如果有推理内容，添加思考步骤
    if (reasoningContent) {
      const thinkStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'thinking',
        content: reasoningContent,
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(thinkStep)
      callbacks.onStep(thinkStep)
    }

    // 如果模型返回了文本内容但同时有原生工具调用，将文本作为思考步骤
    if (fullContent && nativeToolCalls.length > 0) {
      const thinkStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'thinking',
        content: fullContent,
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(thinkStep)
      callbacks.onStep(thinkStep)
    }

    // ========== 优先处理原生 function calling ==========
    if (nativeToolCalls.length > 0) {
      // 添加 assistant 消息（含工具调用）
      messages.push({
        role: 'assistant',
        content: fullContent || '',
        toolCalls: nativeToolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments
        }))
      })

      // 逐个执行工具调用
      for (const tc of nativeToolCalls) {
        // 记录行动步骤
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.arguments)
        } catch {
          // 空参数
        }

        const actionStep: AgentStep = {
          id: crypto.randomUUID(),
          type: 'action',
          content: `调用工具：${tc.name}(${JSON.stringify(args)})`,
          toolCall: { name: tc.name, arguments: args },
          stepIndex: stepIndex++,
          timestamp: Date.now()
        }
        steps.push(actionStep)
        callbacks.onStep(actionStep)

        // 执行工具
        let result: ToolExecuteResult
        if (tc.name === 'remember') {
          result = handleRememberTool(args)
        } else if (tc.name === 'recall') {
          result = handleRecallTool(args)
        } else if (tc.name === 'ask_self') {
          result = handleAskSelfTool(args)
        } else if (tc.name === 'define_requirement') {
          result = handleDefineRequirementTool(args)
        } else if (tc.name === 'review_requirements') {
          result = handleReviewRequirementsTool(args)
        } else if (tc.name === 'ask_human') {
          result = await handleAskHumanTool(args)
        } else if (tc.name === 'site_analyzer_start') {
          result = await handleSiteAnalyzerStartTool(args)
        } else if (tc.name === 'site_analyzer_cancel') {
          result = await handleSiteAnalyzerCancelTool(args)
        } else if (['math_analyze', 'math_algebra', 'math_geometry', 'math_number', 'math_symbolic', 'math_verify'].includes(tc.name)) {
          result = executeMathTool(tc.name, args)
        } else {
          result = await toolService.executeTool(tc.name, args, agentTools)
        }

        // 记录观察步骤
        const observationContent = result.success
          ? result.data
          : `错误: ${result.error ?? '执行失败'}`

        const obsStep: AgentStep = {
          id: crypto.randomUUID(),
          type: 'observation',
          content: observationContent,
          toolResult: {
            success: result.success,
            data: result.data,
            error: result.error
          },
          stepIndex: stepIndex++,
          timestamp: Date.now()
        }
        steps.push(obsStep)
        callbacks.onStep(obsStep)

        // 将工具结果追加到消息列表（使用 tool 角色）
        messages.push({
          role: 'tool',
          content: observationContent,
          toolCallId: tc.id,
          toolName: tc.name
        })
      }

      // 继续循环，让模型根据工具结果继续推理
      continue
    }

    // ========== 回退到文本格式工具调用解析 ==========
    const toolCalls = parseToolCalls(fullContent)

    if (toolCalls.length === 0) {
      // 没有工具调用 → 这是最终回复
      // 如果 fullContent 为空但有推理内容，使用推理内容作为最终回答
      const finalText = fullContent || reasoningContent || ''

      const finalStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'final_answer',
        content: finalText,
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(finalStep)
      callbacks.onStep(finalStep)
      // 注意：token 已在 LLM 调用过程中实时转发，此处无需再次调用 callbacks.onToken
      callbacks.onStatusChange('completed')
      callbacks.onDone(finalText)
      return
    }

    // 有文本格式工具调用 → 执行工具
    // 提取思考部分（工具调用之前的内容）
    const thinkingContent = fullContent.split('```tool_call')[0].trim()
    if (thinkingContent && !reasoningContent) {
      const thinkStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'thinking',
        content: thinkingContent,
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(thinkStep)
      callbacks.onStep(thinkStep)
    }

    // 执行每个工具调用
    for (const tc of toolCalls) {
      // 记录行动步骤
      const actionStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'action',
        content: `调用工具：${tc.name}(${JSON.stringify(tc.arguments)})`,
        toolCall: { name: tc.name, arguments: tc.arguments },
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(actionStep)
      callbacks.onStep(actionStep)

      // 执行工具
      let result: ToolExecuteResult
      if (tc.name === 'remember') {
        result = handleRememberTool(tc.arguments)
      } else if (tc.name === 'recall') {
        result = handleRecallTool(tc.arguments)
      } else if (tc.name === 'ask_self') {
        result = handleAskSelfTool(tc.arguments)
      } else if (tc.name === 'define_requirement') {
        result = handleDefineRequirementTool(tc.arguments)
      } else if (tc.name === 'review_requirements') {
        result = handleReviewRequirementsTool(tc.arguments)
      } else if (tc.name === 'ask_human') {
        result = await handleAskHumanTool(tc.arguments)
      } else if (tc.name === 'site_analyzer_start') {
        result = await handleSiteAnalyzerStartTool(tc.arguments)
      } else if (tc.name === 'site_analyzer_cancel') {
        result = await handleSiteAnalyzerCancelTool(tc.arguments)
      } else if (['math_analyze', 'math_algebra', 'math_geometry', 'math_number', 'math_symbolic', 'math_verify'].includes(tc.name)) {
        result = executeMathTool(tc.name, tc.arguments)
      } else {
        result = await toolService.executeTool(tc.name, tc.arguments, agentTools)
      }

      // 记录观察步骤
      const observationContent = result.success
        ? result.data
        : `错误: ${result.error ?? '执行失败'}`

      const obsStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'observation',
        content: observationContent,
        toolResult: {
          success: result.success,
          data: result.data,
          error: result.error
        },
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(obsStep)
      callbacks.onStep(obsStep)

      // 将工具结果追加到消息列表（使用 tool 角色，与原生 function calling 保持一致）
      const tcId = `text-tc-${stepIndex}`
      messages.push(
        {
          role: 'assistant',
          content: fullContent,
          toolCalls: [{ id: tcId, name: tc.name, arguments: JSON.stringify(tc.arguments) }]
        },
        {
          role: 'tool',
          content: observationContent,
          toolCallId: tcId,
          toolName: tc.name
        }
      )
    }

    // 检查是否达到目标（如果启用了自动停止）
    if (agent.termination.autoStopOnGoal) {
      // 在下一轮 LLM 调用时，模型会判断是否完成
    }
  }

  // 达到最大步数（仅在有步数限制时触发）
  if (agent.termination.maxSteps > 0) {
    const maxStep: AgentStep = {
      id: crypto.randomUUID(),
      type: 'error',
      content: `已达到最大推理步数（${agent.termination.maxSteps}步）`,
      stepIndex: stepIndex++,
      timestamp: Date.now()
    }
    steps.push(maxStep)
    callbacks.onStep(maxStep)
  }

  // 尝试生成最终回复
  const lastContent = steps
    .filter((s) => s.type === 'final_answer')
    .pop()?.content ?? ''

  callbacks.onStatusChange('completed')
  callbacks.onDone(lastContent || (agent.termination.maxSteps > 0 ? 'Agent 已达到最大步数限制，未能完成任务。' : 'Agent 执行结束。'))
  } catch (error) {
    if (signal.aborted) {
      callbacks.onStatusChange('stopped')
      callbacks.onDone('')
      return
    }
    throw error
  }
}

/**
 * 创建默认的 Agent 运行上下文
 */
export function createDefaultRunContext(agentId: string): AgentRunContext {
  return {
    agentId,
    status: 'idle',
    steps: [],
    currentStep: 0
  }
}

/**
 * 从错误状态恢复 Agent 执行
 *
 * 与 runAgent 不同，此函数从已有的对话历史中恢复：
 * 1. 从历史消息中重建消息列表（包括工具调用和工具结果）
 * 2. 从已有的 agentSteps 中恢复步骤计数
 * 3. 继续执行 Agent 循环
 */
export async function resumeAgent(
  agent: AgentProfile,
  conversationHistory: Message[],
  allTools: Tool[],
  globalConfig: GlobalConfig,
  signal: AbortSignal,
  callbacks: AgentEngineCallbacks
): Promise<void> {
  callbacks.onStatusChange('running')

  const startTime = Date.now()

  // 过滤出 Agent 启用的工具
  const agentTools = allTools.filter(
    (t) => (t.id.startsWith('agent-builtin:') || agent.enabledToolIds.includes(t.id)) && t.enabled
  )

  // 获取记忆上下文
  let memoryContext = ''
  if (agent.memoryConfig.longTermEnabled) {
    memoryContext = memoryService.formatMemoriesAsContext(agent.id)
  }

  // 构建系统提示词
  const systemPrompt = buildAgentSystemPrompt(agent, agentTools, memoryContext)

  // 从对话历史中重建消息列表（包括工具调用和工具结果）
  const messages: AgentMessage[] = []

  // 限制历史轮数
  const maxHistory = agent.memoryConfig.historyTurns * 2

  // 找到所有 assistant 和 tool 消息，重建完整的消息链
  // 我们需要保留完整的工具调用链（assistant + tool 消息对），否则 API 会报错
  const recentHistory = conversationHistory.slice(-maxHistory * 3) // 多取一些以确保工具调用链完整

  for (const msg of recentHistory) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content })
    } else if (msg.role === 'assistant') {
      // 如果有原生工具调用，携带过去
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: msg.content || '',
          toolCalls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments
          }))
        })
      } else if (msg.agentSteps && msg.agentSteps.length > 0) {
        // Agent 模式的 assistant 消息
        const finalStep = msg.agentSteps.find((s) => s.type === 'final_answer')
        if (finalStep) {
          messages.push({ role: 'assistant', content: finalStep.content })
        } else {
          // 没有最终回答，从步骤中重建 assistant + tool 消息链
          for (const step of msg.agentSteps) {
            if (step.type === 'action' && step.toolCall) {
              const tcId = `resume-tc-${step.stepIndex}`
              messages.push({
                role: 'assistant',
                content: '',
                toolCalls: [{ id: tcId, name: step.toolCall.name, arguments: JSON.stringify(step.toolCall.arguments) }]
              })
              // 对应的 tool 结果
              const obsStep = msg.agentSteps.find(
                (s) => s.type === 'observation' && s.stepIndex === step.stepIndex + 1
              )
              const toolResultContent = obsStep
                ? (obsStep.toolResult?.success ? obsStep.toolResult.data : `错误: ${obsStep.toolResult?.error ?? '执行失败'}`)
                : '工具执行结果不可用'
              messages.push({
                role: 'tool',
                content: toolResultContent,
                toolCallId: tcId,
                toolName: step.toolCall.name
              })
            } else if (step.type === 'human_input') {
              // 用户选择步骤：重建为 ask_human 工具调用 + 用户选择结果
              const tcId = `resume-tc-human-${step.stepIndex}`
              const question = step.humanChoice?.question ?? step.content
              const options = step.humanChoice?.options ?? []
              const userResponse = step.humanResponse ?? '用户未做选择'
              const responseText = Array.isArray(userResponse)
                ? userResponse.join('、')
                : String(userResponse)
              messages.push({
                role: 'assistant',
                content: '',
                toolCalls: [{
                  id: tcId,
                  name: 'ask_human',
                  arguments: JSON.stringify({
                    question,
                    options: options.map(o => ({ label: o.label, value: o.value, description: o.description })),
                    allow_multiple: step.humanChoice?.allowMultiple ?? false
                  })
                }]
              })
              messages.push({
                role: 'tool',
                content: `用户选择了: ${responseText}`,
                toolCallId: tcId,
                toolName: 'ask_human'
              })
            } else if (step.type === 'thinking' && step.content) {
              // 思考步骤可以作为 assistant 消息的一部分
              // 但不添加独立消息，避免干扰 API 格式
            }
          }
          // 如果消息有 content，也添加
          if (msg.content) {
            messages.push({ role: 'assistant', content: msg.content })
          }
        }
      } else {
        messages.push({ role: 'assistant', content: msg.content })
      }
    } else if (msg.role === 'tool' && msg.toolCallId) {
      messages.push({
        role: 'tool',
        content: msg.content,
        toolCallId: msg.toolCallId,
        toolName: msg.toolName
      })
    }
  }

  // 如果消息列表为空或最后一条不是 tool 消息，添加一条提示让模型继续
  const lastMsg = messages[messages.length - 1]
  if (lastMsg && lastMsg.role === 'tool') {
    // 最后一条是工具结果，模型会自然地继续推理
  } else if (lastMsg && lastMsg.role === 'assistant') {
    // 最后一条是 assistant 消息，添加用户提示继续
    messages.push({ role: 'user', content: '请继续执行任务。之前执行过程中出现了错误，请分析错误原因并尝试其他方法继续完成任务。' })
  } else {
    // 不应该到这里，但作为保护
    messages.push({ role: 'user', content: '请继续执行任务。' })
  }

  // 从已有的 agentSteps 中计算起始步骤索引
  // 找到历史中最后一个 assistant 消息的 agentSteps
  const lastAssistantMsg = [...conversationHistory].reverse().find(m => m.role === 'assistant' && m.agentSteps && m.agentSteps.length > 0)
  let stepIndex = 0
  if (lastAssistantMsg?.agentSteps) {
    stepIndex = Math.max(...lastAssistantMsg.agentSteps.map(s => s.stepIndex)) + 1
  }

  const steps: AgentStep[] = []

  // 添加恢复提示步骤
  const resumeStep: AgentStep = {
    id: crypto.randomUUID(),
    type: 'thinking',
    content: '从错误中恢复，继续执行任务...',
    stepIndex: stepIndex++,
    timestamp: Date.now()
  }
  steps.push(resumeStep)
  callbacks.onStep(resumeStep)

  // 处理 remember 工具调用的辅助函数
  const handleRememberTool = (args: Record<string, unknown>): ToolExecuteResult => {
    const key = String(args.key ?? '')
    const value = String(args.value ?? '')
    if (!key || !value) {
      return { success: false, data: '', error: 'remember 工具需要 key 和 value 参数' }
    }
    memoryService.remember(agent.id, key, value)
    return { success: true, data: `已记住: ${key} = ${value}` }
  }

  // 处理 recall 工具调用的辅助函数
  const handleRecallTool = (args: Record<string, unknown>): ToolExecuteResult => {
    const key = String(args.key ?? '')
    if (!key) {
      return { success: false, data: '', error: 'recall 工具需要 key 参数' }
    }
    const value = memoryService.recall(agent.id, key)
    if (value === null || value === undefined) {
      return { success: true, data: `没有找到关于 "${key}" 的记忆` }
    }
    return { success: true, data: `${key} = ${value}` }
  }

  // 已收集的需求点列表（内部状态）
  const collectedRequirements: Array<{
    name: string
    description: string
    details?: string
    priority: string
  }> = []

  // 已进行的自问自答记录（内部状态）
  const selfQARecords: Array<{
    question: string
    answer: string
    confidence: string
  }> = []

  // 处理 ask_self 工具调用
  const handleAskSelfTool = (args: Record<string, unknown>): ToolExecuteResult => {
    const question = String(args.question ?? '')
    const answer = String(args.answer ?? '')
    const confidence = String(args.confidence ?? 'medium')
    if (!question || !answer) {
      return { success: false, data: '', error: 'ask_self 工具需要 question 和 answer 参数' }
    }
    selfQARecords.push({ question, answer, confidence })
    const confidenceLabel = confidence === 'high' ? '高信心' : confidence === 'medium' ? '中等信心' : '低信心需确认'
    return {
      success: true,
      data: `问题: ${question}\n回答: ${answer}\n信心: ${confidenceLabel}\n\n已记录此信息。当前已进行 ${selfQARecords.length} 轮自问自答。`
    }
  }

  // 处理 define_requirement 工具调用
  const handleDefineRequirementTool = (args: Record<string, unknown>): ToolExecuteResult => {
    const name = String(args.name ?? '')
    const description = String(args.description ?? '')
    const details = args.details ? String(args.details) : undefined
    const priority = String(args.priority ?? 'should_have')
    if (!name || !description) {
      return { success: false, data: '', error: 'define_requirement 工具需要 name 和 description 参数' }
    }
    collectedRequirements.push({ name, description, details, priority })
    const priorityLabel = priority === 'must_have' ? '必须' : priority === 'should_have' ? '重要' : '加分'
    return {
      success: true,
      data: `已定义需求点: ${name}\n描述: ${description}\n${details ? `详细规则: ${details}\n` : ''}优先级: ${priorityLabel}\n\n当前已定义 ${collectedRequirements.length} 个需求点。`
    }
  }

  // 处理 review_requirements 工具调用
  const handleReviewRequirementsTool = (args: Record<string, unknown>): ToolExecuteResult => {
    const originalRequest = String(args.original_request ?? '')
    const currentSummary = String(args.current_summary ?? '')
    const checkDimensions = Array.isArray(args.check_dimensions)
      ? args.check_dimensions.map(String)
      : []
    if (!originalRequest || !currentSummary) {
      return { success: false, data: '', error: 'review_requirements 工具需要 original_request 和 current_summary 参数' }
    }

    const reqNames = collectedRequirements.map(r => `- ${r.name} (${r.priority})`).join('\n')
    const qaSummary = selfQARecords.map(q => `- [${q.confidence}] ${q.question} -> ${q.answer}`).join('\n')

    let reviewReport = '需求审查报告\n\n'
    reviewReport += `原始需求: ${originalRequest}\n\n`
    reviewReport += `已定义的需求点 (${collectedRequirements.length}个):\n${reqNames || '尚未定义'}\n\n`
    reviewReport += `自问自答记录 (${selfQARecords.length}轮):\n${qaSummary || '尚未进行'}\n\n`
    reviewReport += `当前摘要: ${currentSummary}\n\n`
    reviewReport += `检查维度: ${checkDimensions.join('、')}\n\n`
    reviewReport += `请根据以上信息判断：\n`
    reviewReport += `1. 是否有遗漏的功能点？如有，请继续调用 define_requirement 补充\n`
    reviewReport += `2. 是否有模糊的描述？如有，请调用 ask_self 澄清\n`
    reviewReport += `3. 是否所有维度都已覆盖？如果完整，请输出最终需求文档\n`
    reviewReport += `4. 低信心的自问自答是否需要标注为"待用户确认"？`

    return {
      success: true,
      data: reviewReport
    }
  }

  // 处理 ask_human 工具调用（异步，需等待用户输入）
  const handleAskHumanTool = async (args: Record<string, unknown>): Promise<ToolExecuteResult> => {
    const question = String(args.question ?? '')
    const options = Array.isArray(args.options)
      ? args.options.map((opt: Record<string, unknown>) => ({
          label: String(opt.label ?? ''),
          value: String(opt.value ?? ''),
          description: opt.description ? String(opt.description) : undefined
        }))
      : []
    const allowMultiple = Boolean(args.allow_multiple)
    if (!question || options.length < 2) {
      return { success: false, data: '', error: 'ask_human 工具需要 question 和至少2个 options' }
    }

    const humanStep: AgentStep = {
      id: crypto.randomUUID(),
      type: 'human_input',
      content: question,
      humanChoice: { question, options, allowMultiple },
      stepIndex: stepIndex++,
      timestamp: Date.now()
    }
    steps.push(humanStep)
    callbacks.onStep(humanStep)

    if (!callbacks.onHumanInput) {
      return {
        success: true,
        data: '用户输入功能未启用，请自行推断答案。'
      }
    }

    try {
      const userResponse = await callbacks.onHumanInput(humanStep)
      humanStep.humanResponse = userResponse
      // 格式化选择结果
      const responseText = Array.isArray(userResponse)
        ? userResponse.join('、')
        : userResponse
      return {
        success: true,
        data: `用户选择了: ${responseText}`
      }
    } catch (error) {
      // 如果是中止错误，向上抛出让外层 try-catch 处理
      if (error instanceof Error && error.message === 'aborted') {
        throw error
      }
      return {
        success: true,
        data: '用户未做选择，请自行推断答案。'
      }
    }
  }

  // Agent 循环 - 计算已执行的步数，从剩余步数开始（maxSteps 为 0 表示无限制）
  const completedSteps = stepIndex
  const isUnlimited = agent.termination.maxSteps === 0
  const remainingSteps = isUnlimited ? Infinity : Math.max(1, agent.termination.maxSteps - completedSteps)

  try {
  for (let i = 0; i < remainingSteps; i++) {
    // 如果不是第一步，添加延迟避免 API 请求过快
    if (i > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 1500)
        if (signal.aborted) { clearTimeout(timer); reject(new Error('aborted')); return }
        const onAbort = () => { clearTimeout(timer); reject(new Error('aborted')) }
        signal.addEventListener('abort', onAbort, { once: true })
      })
    }

    // 检查超时（timeoutSeconds 为 0 表示不限制）
    if (agent.termination.timeoutSeconds > 0 && (Date.now() - startTime) / 1000 > agent.termination.timeoutSeconds) {
      const errorStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'error',
        content: `执行超时（${agent.termination.timeoutSeconds}秒）`,
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(errorStep)
      callbacks.onStep(errorStep)
      callbacks.onStatusChange('error')
      callbacks.onError('Agent 执行超时')
      return
    }

    // 检查中止信号
    if (signal.aborted) {
      const stopStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'error',
        content: '用户手动停止',
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(stopStep)
      callbacks.onStep(stopStep)
      callbacks.onStatusChange('stopped')
      callbacks.onDone('')
      return
    }

    // 准备工具定义
    const toolDefs = toolService.toToolDefinitions(agentTools)

    // 调用 LLM
    let fullContent = ''
    let reasoningContent = ''
    let nativeToolCalls: Array<{ id: string; name: string; arguments: string }> = []

    try {
      await aiService.streamChat(
        toMessages(messages),
        {
          ...globalConfig,
          defaultModel: agent.modelConfig.model || globalConfig.defaultModel,
          temperature: agent.modelConfig.temperature ?? globalConfig.temperature,
          maxTokens: agent.modelConfig.maxTokens || globalConfig.maxTokens
        },
        systemPrompt,
        toolDefs,
        signal,
        {
          onToken: (token) => {
            fullContent += token
            // 实时转发 token 到 UI，实现流式输出
            callbacks.onToken(token)
          },
          onReasoningToken: (token) => {
            reasoningContent += token
            // 实时转发推理 token 到 UI
            callbacks.onReasoningToken(token)
          },
          onToolCalls: (toolCalls) => {
            nativeToolCalls = toolCalls
          },
          onDone: () => {
            // 处理在下方
          },
          onError: (error) => {
            throw new Error(error)
          }
        }
      )
    } catch (error) {
      if (signal.aborted) {
        callbacks.onStatusChange('stopped')
        callbacks.onDone('')
        return
      }
      const errorMsg = error instanceof Error ? error.message : '未知错误'

      // 如果是请求频率限制错误，等待后重试
      if (errorMsg.toLowerCase().includes('too many requests') || errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')) {
        const retryStep: AgentStep = {
          id: crypto.randomUUID(),
          type: 'thinking',
          content: `遇到请求频率限制，等待 5 秒后重试...`,
          stepIndex: stepIndex++,
          timestamp: Date.now()
        }
        steps.push(retryStep)
        callbacks.onStep(retryStep)

        await new Promise((resolve) => setTimeout(resolve, 5000))
        i--
        continue
      }

      const errorStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'error',
        content: errorMsg,
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(errorStep)
      callbacks.onStep(errorStep)
      callbacks.onStatusChange('error')
      callbacks.onError(errorMsg)
      return
    }

    // 如果有推理内容，添加思考步骤
    if (reasoningContent) {
      const thinkStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'thinking',
        content: reasoningContent,
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(thinkStep)
      callbacks.onStep(thinkStep)
    }

    // 如果模型返回了文本内容但同时有原生工具调用，将文本作为思考步骤
    if (fullContent && nativeToolCalls.length > 0) {
      const thinkStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'thinking',
        content: fullContent,
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(thinkStep)
      callbacks.onStep(thinkStep)
    }

    // ========== 优先处理原生 function calling ==========
    if (nativeToolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: fullContent || '',
        toolCalls: nativeToolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments
        }))
      })

      for (const tc of nativeToolCalls) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.arguments)
        } catch {
          // 空参数
        }

        const actionStep: AgentStep = {
          id: crypto.randomUUID(),
          type: 'action',
          content: `调用工具：${tc.name}(${JSON.stringify(args)})`,
          toolCall: { name: tc.name, arguments: args },
          stepIndex: stepIndex++,
          timestamp: Date.now()
        }
        steps.push(actionStep)
        callbacks.onStep(actionStep)

        let result: ToolExecuteResult
        if (tc.name === 'remember') {
          result = handleRememberTool(args)
        } else if (tc.name === 'recall') {
          result = handleRecallTool(args)
        } else if (tc.name === 'ask_self') {
          result = handleAskSelfTool(args)
        } else if (tc.name === 'define_requirement') {
          result = handleDefineRequirementTool(args)
        } else if (tc.name === 'review_requirements') {
          result = handleReviewRequirementsTool(args)
        } else if (tc.name === 'ask_human') {
          result = await handleAskHumanTool(args)
        } else if (['math_analyze', 'math_algebra', 'math_geometry', 'math_number', 'math_symbolic', 'math_verify'].includes(tc.name)) {
          result = executeMathTool(tc.name, args)
        } else {
          result = await toolService.executeTool(tc.name, args, agentTools)
        }

        const observationContent = result.success
          ? result.data
          : `错误: ${result.error ?? '执行失败'}`

        const obsStep: AgentStep = {
          id: crypto.randomUUID(),
          type: 'observation',
          content: observationContent,
          toolResult: {
            success: result.success,
            data: result.data,
            error: result.error
          },
          stepIndex: stepIndex++,
          timestamp: Date.now()
        }
        steps.push(obsStep)
        callbacks.onStep(obsStep)

        messages.push({
          role: 'tool',
          content: observationContent,
          toolCallId: tc.id,
          toolName: tc.name
        })
      }

      continue
    }

    // ========== 回退到文本格式工具调用解析 ==========
    const toolCalls = parseToolCalls(fullContent)

    if (toolCalls.length === 0) {
      const finalText = fullContent || reasoningContent || ''

      const finalStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'final_answer',
        content: finalText,
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(finalStep)
      callbacks.onStep(finalStep)
      // 注意：token 已在 LLM 调用过程中实时转发，此处无需再次调用 callbacks.onToken
      callbacks.onStatusChange('completed')
      callbacks.onDone(finalText)
      return
    }

    // 有文本格式工具调用 → 执行工具
    const thinkingContent = fullContent.split('```tool_call')[0].trim()
    if (thinkingContent && !reasoningContent) {
      const thinkStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'thinking',
        content: thinkingContent,
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(thinkStep)
      callbacks.onStep(thinkStep)
    }

    for (const tc of toolCalls) {
      const actionStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'action',
        content: `调用工具：${tc.name}(${JSON.stringify(tc.arguments)})`,
        toolCall: { name: tc.name, arguments: tc.arguments },
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(actionStep)
      callbacks.onStep(actionStep)

      let result: ToolExecuteResult
      if (tc.name === 'remember') {
        result = handleRememberTool(tc.arguments)
      } else if (tc.name === 'recall') {
        result = handleRecallTool(tc.arguments)
      } else if (tc.name === 'ask_self') {
        result = handleAskSelfTool(tc.arguments)
      } else if (tc.name === 'define_requirement') {
        result = handleDefineRequirementTool(tc.arguments)
      } else if (tc.name === 'review_requirements') {
        result = handleReviewRequirementsTool(tc.arguments)
      } else if (tc.name === 'ask_human') {
        result = await handleAskHumanTool(tc.arguments)
      } else if (['math_analyze', 'math_algebra', 'math_geometry', 'math_number', 'math_symbolic', 'math_verify'].includes(tc.name)) {
        result = executeMathTool(tc.name, tc.arguments)
      } else {
        result = await toolService.executeTool(tc.name, tc.arguments, agentTools)
      }

      const observationContent = result.success
        ? result.data
        : `错误: ${result.error ?? '执行失败'}`

      const obsStep: AgentStep = {
        id: crypto.randomUUID(),
        type: 'observation',
        content: observationContent,
        toolResult: {
          success: result.success,
          data: result.data,
          error: result.error
        },
        stepIndex: stepIndex++,
        timestamp: Date.now()
      }
      steps.push(obsStep)
      callbacks.onStep(obsStep)

      const tcId = `resume-text-tc-${stepIndex}`
      messages.push(
        {
          role: 'assistant',
          content: fullContent,
          toolCalls: [{ id: tcId, name: tc.name, arguments: JSON.stringify(tc.arguments) }]
        },
        {
          role: 'tool',
          content: observationContent,
          toolCallId: tcId,
          toolName: tc.name
        }
      )
    }

    // 检查是否达到目标
    if (agent.termination.autoStopOnGoal) {
      // 在下一轮 LLM 调用时，模型会判断是否完成
    }
  }

  // 达到最大步数（仅在有步数限制时触发）
  if (agent.termination.maxSteps > 0) {
    const maxStep: AgentStep = {
      id: crypto.randomUUID(),
      type: 'error',
      content: `已达到最大推理步数（${agent.termination.maxSteps}步）`,
      stepIndex: stepIndex++,
      timestamp: Date.now()
    }
    steps.push(maxStep)
    callbacks.onStep(maxStep)
  }

  const lastContent = steps
    .filter((s) => s.type === 'final_answer')
    .pop()?.content ?? ''

  callbacks.onStatusChange('completed')
  callbacks.onDone(lastContent || (agent.termination.maxSteps > 0 ? 'Agent 已达到最大步数限制，未能完成任务。' : 'Agent 执行结束。'))
  } catch (error) {
    if (signal.aborted) {
      callbacks.onStatusChange('stopped')
      callbacks.onDone('')
      return
    }
    throw error
  }
}

/**
 * 为 Agent 配置添加 remember 和 recall 内置工具
 */
export function getAgentBuiltinTools(): Array<{ id: string; name: string; description: string; parameters: Record<string, unknown> }> {
  return [
    {
      id: 'agent-builtin:remember',
      name: 'remember',
      description: '记住一条关键事实，用于长期记忆。在对话中发现重要信息时调用。',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '记忆的键名，如"用户姓名"' },
          value: { type: 'string', description: '记忆的值，如"张三"' }
        },
        required: ['key', 'value']
      }
    },
    {
      id: 'agent-builtin:recall',
      name: 'recall',
      description: '回忆之前记住的关键事实。',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '要回忆的键名' }
        },
        required: ['key']
      }
    }
  ]
}
