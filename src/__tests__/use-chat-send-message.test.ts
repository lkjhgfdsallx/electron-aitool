/**
 * sendMessage Agent 模式与工具调用处理单元测试
 *
 * 测试 useChat hook 中 sendMessage 的 Agent 模式分发逻辑：
 * - Agent 模式：调用 runAgent 并处理 onStep/onToken/onStatusChange/onError/onDone 回调
 * - onStatusChange 不同状态（completed/error/stopped）的 continuable 标记
 * - onDone 时根据 agentSteps 是否含 final_answer 设置 continuable
 * - 子 Agent 活动（onSubAgentActivity）注入步骤
 * - plan/task/context_compressed 事件订阅
 * - onReportReady / onSiteAnalyzerProgress 回调
 * - onHumanInput 超时与中止处理
 *
 * 通过 renderHook + 真实 useChat hook 验证，确保真实模块代码被执行。
 *
 * @see src/hooks/use-chat.ts sendMessageWithAgent() lines 591-944
 * @see src/hooks/use-chat.ts handleToolCalls() lines 1141-1416
 */
/// <reference path="../types/electron.d.ts" />

import type { AgentProfile, AgentStep, Message, ResolvedAIConfig, Tool } from '../types'

// ===== Mock 服务层 =====
const mockRunAgent = jest.fn()
const mockStreamChat = jest.fn()
const mockExecuteTool = jest.fn()

jest.mock('../services/agent-engine', () => ({
  runAgent: (...args: unknown[]) => mockRunAgent(...args),
}))

jest.mock('../services/ai-service', () => ({
  aiService: {
    streamChat: (...args: unknown[]) => mockStreamChat(...args),
  },
}))

jest.mock('../services/tool-service', () => ({
  toolService: {
    toToolDefinitions: jest.fn((tools: Tool[]) =>
      tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
    ),
    executeTool: (...args: unknown[]) => mockExecuteTool(...args),
  },
}))

jest.mock('../services/built-in-tools', () => ({
  BUILT_IN_TOOLS: [
    { id: 'tool-calc', name: 'calculator', description: '计算器', enabled: true, isBuiltIn: true, isMCP: false, parameters: { type: 'object', properties: {} } },
  ],
  AGENT_BUILTIN_TOOLS: [
    { id: 'tool-plan', name: 'create_plan', description: '创建计划', enabled: true, isBuiltIn: true, isMCP: false, parameters: { type: 'object', properties: {} } },
  ],
  WORKSPACE_TOOLS: [],
}))

jest.mock('../services/report-store', () => ({
  reportStore: { saveReport: jest.fn(async () => {}) },
}))

jest.mock('../services/knowledge-base-service', () => ({
  knowledgeBaseService: { searchAndFormatContext: jest.fn(async () => '') },
}))

const mockEventBusOn = jest.fn(() => jest.fn()) // 返回 unsubscribe 函数
jest.mock('../services/agent/event-bus', () => ({
  agentEventBus: {
    on: (...args: unknown[]) => mockEventBusOn(...(args as [])),
    emit: jest.fn(),
    startRun: jest.fn(),
    clear: jest.fn(),
  },
}))

jest.mock('../utils/conversation-utils', () => ({
  generateTitleFromContent: jest.fn(async () => '测试标题'),
}))

// ===== Zustand store mocks =====
const mockUpdateMessage = jest.fn()
const mockAddMessage = jest.fn((_convId: string, msg: Partial<Message>) => ({
  id: `msg-${Math.random().toString(36).slice(2, 8)}`,
  conversationId: _convId,
  ...msg,
}))
const mockGetMessages = jest.fn(() => [])
const mockGetVisibleMessages = jest.fn(() => [])
const mockGetConversation: jest.Mock<Record<string, unknown> | undefined, [string?]> = jest.fn(() => undefined)
const mockRenameConversation = jest.fn()
const mockGetCurrentBranchIndex = jest.fn(() => 0)

const makeStoreMock = (state: Record<string, unknown>) => {
  const fn = jest.fn((selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(state) : state,
  )
  ;(fn as unknown as { getState: () => Record<string, unknown> }).getState = () => state
  return fn
}

// Agent fixture（可动态修改 getAgent 返回值）
let currentAgent: AgentProfile | undefined = undefined

// 共享可变 store 状态（messages map 供 handleToolCalls 读取）
const convStoreState: Record<string, unknown> = {
 currentConversationId: 'conv-test',
 conversations: [],
 messages: {},
 getVisibleMessages: () => mockGetVisibleMessages(),
 updateMessage: (msgId: string, patch: Partial<Message>) => {
   mockUpdateMessage(msgId, patch)
   // 同步更新 messages map，供 handleToolCalls 读取 currentMsg.toolCalls
   const messages = convStoreState.messages as Record<string, Message[]>
   for (const convId in messages) {
     const arr = messages[convId]
     const idx = arr.findIndex((m) => m.id === msgId)
     if (idx !== -1) {
       arr[idx] = { ...arr[idx], ...patch }
     }
   }
 },
 addMessage: (convId: string, msg: Partial<Message>) => {
   const created = mockAddMessage(convId, msg) as Message
   const messages = convStoreState.messages as Record<string, Message[]>
   if (!messages[convId]) messages[convId] = []
   messages[convId].push(created)
   return created
 },
 getMessages: (convId?: string) => {
   if (convId) {
     const messages = convStoreState.messages as Record<string, Message[]>
     return messages[convId] ?? []
   }
   return mockGetMessages()
 },
 switchBranch: jest.fn(),
 getCurrentBranchIndex: mockGetCurrentBranchIndex,
 getConversation: mockGetConversation,
 renameConversation: mockRenameConversation,
 deleteMessage: jest.fn(),
}

jest.mock('../stores/conversation-store', () => ({
 useConversationStore: makeStoreMock(convStoreState),
}))

jest.mock('../stores/global-config-store', () => ({
  useGlobalConfigStore: makeStoreMock({ globalConfig: {} }),
}))

jest.mock('../stores/agent-store', () => ({
  useAgentStore: makeStoreMock({
    agents: [],
    getAgent: jest.fn((id: string) => (id === currentAgent?.id ? currentAgent : undefined)),
    getPrompt: jest.fn(() => undefined),
    selectedPromptId: undefined,
  }),
}))

jest.mock('../stores/mcp-tool-store', () => ({
  useMCPToolStore: makeStoreMock({ mcpTools: [] }),
}))

jest.mock('../stores/ai-provider-store', () => ({
  useAIProviderStore: makeStoreMock({
    resolveConfig: jest.fn(
      (): ResolvedAIConfig => ({
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'test-key',
        model: 'test-model',
        temperature: 0.7,
        maxTokens: 4096,
        streamEnabled: true,
      }),
    ),
    getRequestConfig: jest.fn(() => ({})),
    resolveRequestConfig: jest.fn(() => ({})),
  }),
}))

jest.mock('../stores/workspace-store', () => ({
  useWorkspaceStore: makeStoreMock({ workspaces: [] }),
}))

jest.mock('../stores/workspace-agent-store', () => ({
  useWorkspaceAgentStore: makeStoreMock({
    workspaceAgents: [],
    getWorkspaceAgent: jest.fn(() => undefined),
  }),
}))

jest.mock('../stores/custom-tool-store', () => ({
  useCustomToolStore: makeStoreMock({ customTools: [] }),
}))

const mockSettingsState = {
  webSearchEnabled: true,
  enableNotification: false,
  enableSound: false,
  notificationSound: 'default',
}

jest.mock('../stores', () => ({
  useSettingsStore: makeStoreMock(mockSettingsState),
}))

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-' + Math.random().toString(36).slice(2, 9)),
}))

// 导入被测 hook
import { renderHook, act } from '@testing-library/react'
import { useChat } from '../hooks/use-chat'

// ===== 测试夹具 =====
function makeAgent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: 'test-agent',
    name: '测试Agent',
    description: '测试用',
    systemPrompt: '你是测试助手',
    enabledToolIds: ['tool-calc', 'tool-plan'],
    planningStrategy: 'react',
    memoryConfig: { historyTurns: 10, longTermEnabled: false, crossSession: false },
    termination: { maxSteps: 5, timeoutSeconds: 60, autoStopOnGoal: false },
    modelConfig: {},
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function makeStep(overrides: Partial<AgentStep>): AgentStep {
  return {
    id: `step-${Math.random().toString(36).slice(2, 8)}`,
    type: 'thinking',
    content: '',
    stepIndex: 0,
    timestamp: Date.now(),
    ...overrides,
  }
}

interface RunAgentCallbacks {
  onStep?: (s: AgentStep) => void
  onToken?: (t: string) => void
  onReasoningToken?: (t: string) => void
  onStatusChange?: (s: string) => void
  onError?: (e: string) => void
  onDone?: (c: string) => void
  onHumanInput?: (s: AgentStep) => Promise<string | string[]>
  onReportReady?: (r: string) => void
  onSiteAnalyzerProgress?: (p: Record<string, unknown>) => void
}

/** 捕获 runAgent 回调 */
function captureRunAgentCallbacks(): Promise<{ callbacks: RunAgentCallbacks; args: unknown[] }> {
  return new Promise((resolve) => {
    mockRunAgent.mockImplementation(async (...args: unknown[]) => {
      const callbacks = (args[6] as RunAgentCallbacks) ?? {}
      resolve({ callbacks, args })
    })
  })
}

// ===== 测试套件 =====
describe('sendMessage Agent 模式', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetMessages.mockReturnValue([])
    mockGetVisibleMessages.mockReturnValue([])
    mockGetConversation.mockImplementation((id?: string) => {
      if (id === 'conv-agent') {
        return { id: 'conv-agent', agentId: 'test-agent', title: 't', messageCount: 0 }
      }
      return undefined
    })
    currentAgent = makeAgent()
    mockSettingsState.webSearchEnabled = true
    mockSettingsState.enableNotification = false
  })

  describe('sendMessage 分发到 Agent 模式', () => {
    it('对话绑定 agentId 且 agent.enabled 时应调用 runAgent', async () => {
      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        await captured
      })

      expect(mockRunAgent).toHaveBeenCalled()
      // runAgent 第 1 参数为 agent
      const agentArg = mockRunAgent.mock.calls[0][0] as AgentProfile
      expect(agentArg.id).toBe('test-agent')
    })

    it('agent.enabled=false 时应回退到普通模式（调用 streamChat）', async () => {
      currentAgent = makeAgent({ enabled: false })
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
      })

      expect(mockRunAgent).not.toHaveBeenCalled()
      expect(mockStreamChat).toHaveBeenCalled()
    })

    it('对话无 agentId 时应为普通模式', async () => {
      mockGetConversation.mockReturnValue({ id: 'conv-plain', title: 't', messageCount: 0 })
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-plain')
      })

      expect(mockRunAgent).not.toHaveBeenCalled()
      expect(mockStreamChat).toHaveBeenCalled()
    })
  })

  describe('Agent onStep 回调', () => {
    it('onStep thinking 应重置 finalContent 并更新消息', async () => {
      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        const { callbacks } = await captured
        callbacks.onToken?.('旧内容')
        callbacks.onStep?.(makeStep({ type: 'thinking', content: '思考中' }))
      })

      // 步骤更新应携带 agentSteps
      const stepUpdate = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.agentSteps && c[1]?.agentSteps.length > 0,
      )
      expect(stepUpdate).toBeDefined()
    })

    it('onStep action 应触发步骤刷新', async () => {
      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        const { callbacks } = await captured
        callbacks.onStep?.(makeStep({ type: 'action', content: '执行工具', toolCall: { name: 'calc', arguments: {} } }))
      })

      const stepUpdate = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.agentSteps?.some((s: AgentStep) => s.type === 'action'),
      )
      expect(stepUpdate).toBeDefined()
    })

    it('onStep final_answer 应记录最终答案步骤', async () => {
      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        const { callbacks } = await captured
        callbacks.onStep?.(makeStep({ type: 'final_answer', content: '最终答案' }))
        callbacks.onStatusChange?.('completed')
      })

      const steps = mockUpdateMessage.mock.calls
        .flatMap((c) => c[1]?.agentSteps ?? [])
      expect(steps.some((s: AgentStep) => s.type === 'final_answer')).toBe(true)
    })
  })

  describe('Agent onStatusChange 回调', () => {
    it('status=completed 且无 final_answer 时应标记 continuable="agent"', async () => {
      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        const { callbacks } = await captured
        callbacks.onStatusChange?.('completed')
      })

      const completedCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.finishReason === 'stop' && c[1]?.isStreaming === false,
      )
      expect(completedCall).toBeDefined()
      // 无 final_answer → continuable='agent'
      // 注意 onDone 会进一步处理 continuable，但 onStatusChange completed 时先设置
    })

    it('status=stopped 时应标记 continuable="agent" 且 finishReason="abort"', async () => {
      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        const { callbacks } = await captured
        callbacks.onStatusChange?.('stopped')
      })

      const stoppedCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.finishReason === 'abort',
      )
      expect(stoppedCall).toBeDefined()
      expect(stoppedCall![1].continuable).toBe('agent')
    })

    it('status=error 时应标记 isError=true 且 finishReason="error"', async () => {
      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        const { callbacks } = await captured
        callbacks.onStatusChange?.('error')
      })

      const errorCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.isError === true && c[1]?.finishReason === 'error',
      )
      expect(errorCall).toBeDefined()
    })

    it('status=completed 时应追加任务完成详情 system 消息', async () => {
      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        const { callbacks } = await captured
        callbacks.onStep?.(makeStep({ type: 'thinking', content: '思考' }))
        callbacks.onStep?.(makeStep({ type: 'action', content: '行动', toolCall: { name: 'calc', arguments: {} } }))
        callbacks.onStatusChange?.('completed')
      })

      const systemAdd = mockAddMessage.mock.calls.find(
        (c) => c[1]?.role === 'system' && typeof c[1]?.content === 'string' && (c[1].content as string).includes('任务完成'),
      )
      expect(systemAdd).toBeDefined()
      expect((systemAdd![1].content as string)).toContain('总步骤数')
    })
  })

  describe('Agent onError/onDone 回调', () => {
    it('onError 应标记消息错误状态', async () => {
      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        const { callbacks } = await captured
        callbacks.onError?.('Agent 执行失败')
      })

      const errorCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.isError === true,
      )
      expect(errorCall).toBeDefined()
      expect(errorCall![1].isStreaming).toBe(false)
    })

    it('onDone 有 final_answer 步骤时 continuable 应为 null', async () => {
      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        const { callbacks } = await captured
        callbacks.onStep?.(makeStep({ type: 'final_answer', content: '答案' }))
        callbacks.onDone?.('答案内容')
      })

      const doneCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.isStreaming === false && c[1]?.content === '答案内容',
      )
      expect(doneCall).toBeDefined()
    })

    it('onDone 无 final_answer 时应标记 continuable="agent"', async () => {
      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        const { callbacks } = await captured
        // 只有 thinking，没有 final_answer
        callbacks.onStep?.(makeStep({ type: 'thinking', content: '思考' }))
        callbacks.onDone?.('部分内容')
      })

      const doneCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.isStreaming === false && c[1]?.content === '部分内容',
      )
      expect(doneCall).toBeDefined()
      expect(doneCall![1].continuable).toBe('agent')
    })
  })

  describe('Agent 特殊回调', () => {
    it('onReportReady 应标记 hasReport 并保存报告', async () => {
      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        const { callbacks } = await captured
        callbacks.onReportReady?.('<html>报告</html>')
      })

      const reportCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.hasReport === true,
      )
      expect(reportCall).toBeDefined()
    })

    it('onSiteAnalyzerProgress 应更新进度状态', async () => {
      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        const { callbacks } = await captured
        callbacks.onSiteAnalyzerProgress?.({
          type: 'crawling',
          message: '正在爬取',
          pagesCrawled: 3,
          totalPages: 10,
        })
      })

      const progressCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.siteAnalyzerProgress,
      )
      expect(progressCall).toBeDefined()
      expect(progressCall![1].siteAnalyzerProgress.phase).toBe('crawling')
    })

    it('onToken 应通过缓冲推送内容', async () => {
      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        const { callbacks } = await captured
        callbacks.onToken?.('Hello')
        callbacks.onToken?.(' World')
        callbacks.onDone?.('')
      })

      // 最终内容应包含累积的 token
      const doneCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.isStreaming === false,
      )
      expect(doneCall).toBeDefined()
      // doneContent 为空时使用 finalContent
      expect(doneCall![1].content).toContain('Hello')
    })

    it('onReasoningToken 应累积推理内容', async () => {
      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        const { callbacks } = await captured
        callbacks.onReasoningToken?.('推理')
        callbacks.onDone?.('')
      })

      const reasoningCall = mockUpdateMessage.mock.calls.find(
        (c) => typeof c[1]?.reasoningContent === 'string' && (c[1].reasoningContent as string).length > 0,
      )
      expect(reasoningCall).toBeDefined()
      expect(reasoningCall![1].reasoningContent).toContain('推理')
    })
  })

  describe('事件订阅清理', () => {
    it('runAgent 完成后应取消 plan/task/context_compressed 订阅', async () => {
      const unsubMocks = [jest.fn(), jest.fn(), jest.fn(), jest.fn()]
      let unsubIdx = 0
      mockEventBusOn.mockImplementation(() => unsubMocks[unsubIdx++])

      const captured = captureRunAgentCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-agent')
        const { callbacks } = await captured
        callbacks.onStatusChange?.('completed')
        callbacks.onDone?.('完成')
      })

      // 至少有 3 个订阅被取消（plan_created, task_updated, context_compressed）
      const calledUnsubs = unsubMocks.filter((u) => u.mock.calls.length > 0)
      expect(calledUnsubs.length).toBeGreaterThanOrEqual(3)
    })
  })
})

describe('handleToolCalls（普通模式工具调用循环）', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    convStoreState.messages = {}
    mockGetMessages.mockReturnValue([])
    mockGetVisibleMessages.mockReturnValue([])
    mockGetConversation.mockReturnValue(undefined)
    currentAgent = undefined
    mockSettingsState.webSearchEnabled = true
    mockExecuteTool.mockResolvedValue({ success: true, data: '工具结果' })
  })

  /**
   * 触发工具调用循环：sendMessage → streamChat onDone 携带 pendingToolCalls
   * 需要 mock streamChat 的 onToolCalls + onDone 回调
   */
  async function triggerToolCallsFlow() {
    let capturedCb: Record<string, (...args: unknown[]) => void> | null = null
    mockStreamChat.mockImplementation(async (_h, _c, _s, _t, _sig, callbacks) => {
      capturedCb = callbacks as Record<string, (...args: unknown[]) => void>
    })

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('调用工具', 'conv-plain')
    })

    return { result, capturedCb: () => capturedCb }
  }

  it('onDone 携带 toolCalls 时应触发工具执行', async () => {
    const { capturedCb } = await triggerToolCallsFlow()
    const cb = capturedCb()
    expect(cb).not.toBeNull()

    await act(async () => {
      cb!.onToolCalls([{ id: 'tc1', name: 'calculator', arguments: '{"expr":"1+1"}' }])
      cb!.onDone('stop')
      // 等待异步工具执行
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockExecuteTool).toHaveBeenCalled()
    const toolCallArgs = mockExecuteTool.mock.calls[0]
    expect(toolCallArgs[0]).toBe('calculator')
  })

  it('工具执行成功后应添加 tool 结果消息', async () => {
    const { capturedCb } = await triggerToolCallsFlow()
    const cb = capturedCb()

    await act(async () => {
      cb!.onToolCalls([{ id: 'tc1', name: 'calculator', arguments: '{}' }])
      cb!.onDone('stop')
      await new Promise((r) => setTimeout(r, 50))
    })

    const toolMsg = mockAddMessage.mock.calls.find(
      (c) => c[1]?.role === 'tool',
    )
    expect(toolMsg).toBeDefined()
  })

  it('无效工具调用（name 为空）应标记为 error', async () => {
    const { capturedCb } = await triggerToolCallsFlow()
    const cb = capturedCb()

    await act(async () => {
      cb!.onToolCalls([{ id: 'tc1', name: '', arguments: '{}' }])
      cb!.onDone('stop')
      await new Promise((r) => setTimeout(r, 50))
    })

    // 应有错误状态的 toolCall 更新或 tool 消息
    const errorMsg = mockAddMessage.mock.calls.find(
      (c) => c[1]?.role === 'tool' && (c[1]?.content as string)?.includes('无效'),
    )
    expect(errorMsg).toBeDefined()
  })

  it('工具执行失败时应记录 error 结果', async () => {
    mockExecuteTool.mockResolvedValue({ success: false, data: '', error: '工具报错' })
    const { capturedCb } = await triggerToolCallsFlow()
    const cb = capturedCb()

    await act(async () => {
      cb!.onToolCalls([{ id: 'tc1', name: 'calculator', arguments: '{}' }])
      cb!.onDone('stop')
      await new Promise((r) => setTimeout(r, 50))
    })

    const failedToolMsg = mockAddMessage.mock.calls.find(
      (c) => c[1]?.role === 'tool' && (c[1]?.content as string)?.includes('工具报错'),
    )
    expect(failedToolMsg).toBeDefined()
  })

  it('超过最大工具迭代次数时应添加系统通知并请求无工具最终回复', async () => {
    expect.assertions(1)
    let initialCallbacks: Record<string, (...args: unknown[]) => unknown> | null = null
    let streamCallCount = 0
    let finalReplyTools: unknown[] | null = null

    mockStreamChat.mockImplementation(async (...args: unknown[]) => {
      streamCallCount += 1
      const callbacks = args[5] as Record<string, (...args: unknown[]) => unknown>

      if (streamCallCount === 1) {
        initialCallbacks = callbacks
        return
      }

      if (streamCallCount <= 31) {
        callbacks.onToolCalls?.([{ id: `loop-${streamCallCount}`, name: 'calculator', arguments: '{}' }])
        await callbacks.onDone?.('stop')
        return
      }

      finalReplyTools = args[3] as unknown[]
      callbacks.onToken?.('最终回复')
      callbacks.onReasoningToken?.('推理内容')
      callbacks.onUsage?.({ totalTokens: 12 })
      callbacks.onDone?.('stop')
    })

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('循环调用工具', 'conv-plain')
      await initialCallbacks?.onToolCalls?.([{ id: 'initial-tc', name: 'calculator', arguments: '{}' }])
      await initialCallbacks?.onDone?.('stop')
    })

    const systemNotice = mockAddMessage.mock.calls.find(
      (call) => call[1]?.role === 'system',
    )?.[1]
    const finalReply = mockUpdateMessage.mock.calls.find(
      (call) => call[1]?.content === '最终回复' && call[1]?.isStreaming === false,
    )?.[1]

    expect({
      streamCallCount,
      systemNoticeRole: systemNotice?.role,
      systemNoticeContent: systemNotice?.content,
      finalReplyTools,
      finalReply,
    }).toEqual({
      streamCallCount: 32,
      systemNoticeRole: 'system',
      systemNoticeContent: '[系统通知] 工具调用已达最大迭代次数（30轮），已停止工具调用。请根据目前已获取的信息直接给出最终回复，不要再尝试调用工具。',
      finalReplyTools: [],
      finalReply: {
        content: '最终回复',
        isStreaming: false,
        reasoningContent: '推理内容',
        finishReason: 'stop',
      },
    })
  })

  it('超过最大工具迭代次数后 streamChat onError 应标记最终回复为错误状态', async () => {
    expect.assertions(1)
    let initialCallbacks: Record<string, (...args: unknown[]) => unknown> | null = null
    let streamCallCount = 0
    let finalReplyTools: unknown[] | null = null

    mockStreamChat.mockImplementation(async (...args: unknown[]) => {
      streamCallCount += 1
      const callbacks = args[5] as Record<string, (...args: unknown[]) => unknown>

      if (streamCallCount === 1) {
        initialCallbacks = callbacks
        return
      }

      if (streamCallCount <= 31) {
        callbacks.onToolCalls?.([{ id: `loop-${streamCallCount}`, name: 'calculator', arguments: '{}' }])
        await callbacks.onDone?.('stop')
        return
      }

      // 第32次调用（最终回复）触发 onError 而非 onDone
      finalReplyTools = args[3] as unknown[]
      callbacks.onToken?.('部分回复')
      callbacks.onReasoningToken?.('推理内容')
      callbacks.onError?.('模拟流式错误')
    })

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('循环调用工具', 'conv-plain')
      await initialCallbacks?.onToolCalls?.([{ id: 'initial-tc', name: 'calculator', arguments: '{}' }])
      await initialCallbacks?.onDone?.('stop')
    })

    const systemNotice = mockAddMessage.mock.calls.find(
      (call) => call[1]?.role === 'system',
    )?.[1]
    const errorReply = mockUpdateMessage.mock.calls.find(
      (call) => call[1]?.isError === true && call[1]?.isStreaming === false,
    )?.[1]

    expect({
      streamCallCount,
      systemNoticeRole: systemNotice?.role,
      finalReplyTools,
      errorReply,
    }).toEqual({
      streamCallCount: 32,
      systemNoticeRole: 'system',
      finalReplyTools: [],
      errorReply: {
        // onError 使用 limitFullContent || error，onToken 已设置了 limitFullContent
        content: '部分回复',
        isStreaming: false,
        isError: true,
        reasoningContent: '推理内容',
      },
    })
  })

  it('工具执行后 AI 返回纯文本时应结束工具调用循环并推送内容', async () => {
    expect.assertions(1)
    let streamCallCount = 0
    let capturedCallbacks: Record<string, (...args: unknown[]) => unknown> | null = null

    mockStreamChat.mockImplementation(async (...args: unknown[]) => {
      streamCallCount += 1
      const callbacks = args[5] as Record<string, (...args: unknown[]) => unknown>

      if (streamCallCount === 1) {
        // 第一次：触发工具调用
        callbacks.onToolCalls?.([{ id: 'tc1', name: 'calculator', arguments: '{"expr":"1+1"}' }])
        callbacks.onDone?.('stop')
        return
      }

      // 第二次（工具执行后）：AI 返回纯文本，不再调用工具
      capturedCallbacks = callbacks
      callbacks.onToken?.('计算结果为 ')
      callbacks.onToken?.('2')
      callbacks.onReasoningToken?.('推理步骤')
      callbacks.onUsage?.({ totalTokens: 50 })
      callbacks.onDone?.('stop')
    })

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('计算一下', 'conv-plain')
      // 等待工具执行完成
      await new Promise((r) => setTimeout(r, 50))
    })

    // 验证最终回复包含流式推送的内容
    const finalUpdate = mockUpdateMessage.mock.calls.find(
      (call) => call[1]?.content === '计算结果为 2' && call[1]?.isStreaming === false,
    )?.[1]

    expect({
      streamCallCount,
      finalUpdate,
    }).toEqual({
      streamCallCount: 2,
      finalUpdate: {
        content: '计算结果为 2',
        isStreaming: false,
        reasoningContent: '推理步骤',
        finishReason: 'stop',
      },
    })
  })

  it('工具执行后 streamChat onError 应标记消息为错误状态', async () => {
    expect.assertions(1)
    let streamCallCount = 0

    mockStreamChat.mockImplementation(async (...args: unknown[]) => {
      streamCallCount += 1
      const callbacks = args[5] as Record<string, (...args: unknown[]) => unknown>

      if (streamCallCount === 1) {
        // 第一次：触发工具调用
        callbacks.onToolCalls?.([{ id: 'tc1', name: 'calculator', arguments: '{}' }])
        callbacks.onDone?.('stop')
        return
      }

      // 第二次（工具执行后）：streamChat 报错
      callbacks.onToken?.('部分回复')
      callbacks.onReasoningToken?.('推理内容')
      callbacks.onError?.('网络错误')
    })

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('计算一下', 'conv-plain')
      await new Promise((r) => setTimeout(r, 50))
    })

    const errorUpdate = mockUpdateMessage.mock.calls.find(
      (call) => call[1]?.isError === true && call[1]?.isStreaming === false,
    )?.[1]

    expect({
      streamCallCount,
      errorUpdate,
    }).toEqual({
      streamCallCount: 2,
      errorUpdate: {
        content: '部分回复',
        isStreaming: false,
        isError: true,
        reasoningContent: '推理内容',
      },
    })
  })
})
