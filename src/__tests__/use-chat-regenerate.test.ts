/**
 * regenerateMessage 单元测试
 *
 * 测试 useChat hook 中的 regenerateMessage：
 * - 前置条件：无 currentConversationId / 流式中 / 找不到消息时应早返回
 * - Agent 模式重新生成（runAgent 调用 + 各回调）
 * - 普通模式重新生成（streamChat 调用 + onDone 完成 / onError）
 *
 * regenerateMessage 的核心职责：
 * 1. 删除目标消息及其之后的所有可见消息
 * 2. 根据对话绑定的 agent 决定 Agent/普通模式
 * 3. 重新发起生成并复用 sendMessage 同款回调结构
 *
 * @see src/hooks/use-chat.ts regenerateMessage() lines 1447-1684
 */
/// <reference path="../types/electron.d.ts" />

import type { AgentProfile, Message, ResolvedAIConfig, Tool } from '../types'
import type { AgentStep } from '../types/agent'

// ===== Mock 服务层 =====
const mockRunAgent = jest.fn()
const mockStreamChat = jest.fn()
const mockDeleteMessage = jest.fn()
const mockUpdateMessage = jest.fn()
const mockAddMessage = jest.fn((_convId: string, msg: Partial<Message>) => ({
  id: `msg-${Math.random().toString(36).slice(2, 8)}`,
  conversationId: _convId,
  ...msg,
}))
const mockGetMessages = jest.fn((): Message[] => [])
const mockGetVisibleMessages = jest.fn((): Message[] => [])
const mockGetConversation: jest.Mock<Record<string, unknown> | undefined, [string?]> = jest.fn(() => undefined)
const mockGetCurrentBranchIndex = jest.fn(() => 0)

jest.mock('../services/agent-engine', () => ({
  runAgent: (...args: unknown[]) => mockRunAgent(...args),
}))

jest.mock('../services/ai-service', () => ({
  aiService: { streamChat: (...args: unknown[]) => mockStreamChat(...args) },
}))

jest.mock('../services/tool-service', () => ({
  toolService: {
    toToolDefinitions: jest.fn((tools: Tool[]) =>
      tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
    ),
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

jest.mock('../services/agent/event-bus', () => ({
  agentEventBus: {
    on: jest.fn(() => () => {}),
    emit: jest.fn(),
    startRun: jest.fn(),
    clear: jest.fn(),
  },
}))

jest.mock('../utils/conversation-utils', () => ({
  generateTitleFromContent: jest.fn(async () => '测试标题'),
}))

// ===== 共享可变 store 状态（用于 handleToolCalls 等读取 messages map） =====
const convStoreState: Record<string, unknown> = {
  currentConversationId: 'conv-test' as string | null,
  conversations: [],
  messages: {},
  getVisibleMessages: () => mockGetVisibleMessages(),
  updateMessage: (msgId: string, patch: Partial<Message>) => {
    mockUpdateMessage(msgId, patch)
    const messages = convStoreState.messages as Record<string, Message[]>
    for (const convId in messages) {
      const idx = messages[convId].findIndex((m) => m.id === msgId)
      if (idx !== -1) messages[convId][idx] = { ...messages[convId][idx], ...patch }
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
    if (!convId) return mockGetMessages()
    const messages = convStoreState.messages as Record<string, Message[]>
    return messages[convId] ?? []
  },
  deleteMessage: mockDeleteMessage,
  switchBranch: jest.fn(),
  getCurrentBranchIndex: mockGetCurrentBranchIndex,
  getConversation: mockGetConversation,
  renameConversation: jest.fn(),
}

const makeStoreMock = (state: Record<string, unknown>) => {
  const fn = jest.fn((selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(state) : state,
  )
  ;(fn as unknown as { getState: () => Record<string, unknown> }).getState = () => state
  return fn
}

jest.mock('../stores/conversation-store', () => ({
  useConversationStore: makeStoreMock(convStoreState),
}))

jest.mock('../stores/global-config-store', () => ({
  useGlobalConfigStore: makeStoreMock({ globalConfig: {} }),
}))

// 动态切换 agent
let currentAgent: AgentProfile | undefined

jest.mock('../stores/agent-store', () => ({
  useAgentStore: makeStoreMock({
    agents: [],
    getAgent: jest.fn((id: string) => (currentAgent?.id === id ? currentAgent : undefined)),
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

jest.mock('../stores/workspace-agent-store', () => ({
  useWorkspaceAgentStore: makeStoreMock({
    workspaceAgents: [],
    getWorkspaceAgent: jest.fn(() => undefined),
  }),
}))

jest.mock('../stores/workspace-store', () => ({
  useWorkspaceStore: makeStoreMock({
    workspaces: [],
    updateWorkspace: jest.fn(),
    requestFileActionApproval: jest.fn(),
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

import { renderHook, act } from '@testing-library/react'
import { useChat } from '../hooks/use-chat'

// ===== Fixtures =====
function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: 'msg-x',
    conversationId: 'conv-test',
    role: 'user',
    content: '原始内容',
    timestamp: Date.now(),
    ...overrides,
  } as Message
}

function makeAgent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: 'test-agent',
    name: '测试Agent',
    description: 'd',
    systemPrompt: 'p',
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
    id: 'step-1',
    type: 'thinking',
    content: '',
    timestamp: Date.now(),
    ...overrides,
  } as AgentStep
}

/** 捕获 runAgent 第 7 参数（callbacks） */
function captureRunAgentCallbacks(): Promise<{ callbacks: Record<string, (...a: unknown[]) => void>; args: unknown[] }> {
  return new Promise((resolve) => {
    mockRunAgent.mockImplementation(async (...args: unknown[]) => {
      resolve({
        callbacks: (args[6] ?? {}) as Record<string, (...a: unknown[]) => void>,
        args,
      })
    })
  })
}

/** 捕获 streamChat 第 6 参数（callbacks） */
function captureStreamChatCallbacks(): Promise<Record<string, (...a: unknown[]) => void>> {
  return new Promise((resolve) => {
    mockStreamChat.mockImplementation(async (...args: unknown[]) => {
      resolve((args[5] ?? {}) as Record<string, (...a: unknown[]) => void>)
    })
  })
}

describe('regenerateMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    convStoreState.currentConversationId = 'conv-test'
    convStoreState.conversations = [{ id: 'conv-test', agentId: 'test-agent', title: 't', messageCount: 2 }]
    convStoreState.messages = {}
    mockGetMessages.mockReturnValue([])
    mockGetVisibleMessages.mockReturnValue([])
    mockGetConversation.mockImplementation((id?: string) => {
      if (id === 'conv-test') return { id: 'conv-test', agentId: 'test-agent', title: 't', messageCount: 2 }
      return undefined
    })
    currentAgent = makeAgent()
    mockSettingsState.webSearchEnabled = true
    mockSettingsState.enableNotification = false
  })

  describe('前置条件检查', () => {
    it('无 currentConversationId 时应直接返回', async () => {
      convStoreState.currentConversationId = null
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-x')
      })

      expect(mockDeleteMessage).not.toHaveBeenCalled()
      expect(mockRunAgent).not.toHaveBeenCalled()
    })

    it('getVisibleMessages 中找不到目标消息时应直接返回', async () => {
      mockGetVisibleMessages.mockReturnValue([makeMessage({ id: 'msg-other' })])
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-x')
      })

      expect(mockDeleteMessage).not.toHaveBeenCalled()
      expect(mockRunAgent).not.toHaveBeenCalled()
    })
  })

  describe('Agent 模式重新生成', () => {
    it('应删除目标消息及之后的可见消息并调用 runAgent', async () => {
      const captured = captureRunAgentCallbacks()
      const target = makeMessage({ id: 'msg-target', role: 'assistant', content: '旧回复' })
      const later = makeMessage({ id: 'msg-later', role: 'assistant', content: '后续' })
      mockGetVisibleMessages.mockReturnValue([target, later])

      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-target')
        await captured
      })

      // 应删除 msg-target 和 msg-later
      expect(mockDeleteMessage).toHaveBeenCalledWith('conv-test', 'msg-target')
      expect(mockDeleteMessage).toHaveBeenCalledWith('conv-test', 'msg-later')
      // 应调用 runAgent
      expect(mockRunAgent).toHaveBeenCalled()
      // 第 2 参数（userMessage）应为空字符串
      const agentArg = mockRunAgent.mock.calls[0][1]
      expect(agentArg).toBe('')
      // 应创建新的 assistant 消息
      expect(mockAddMessage).toHaveBeenCalledWith(
        'conv-test',
        expect.objectContaining({ role: 'assistant', isStreaming: true, agentId: 'test-agent' }),
      )
    })

    it('onStep thinking 应清空 finalContent 并刷新步骤', async () => {
      const captured = captureRunAgentCallbacks()
      mockGetVisibleMessages.mockReturnValue([makeMessage({ id: 'msg-target' })])

      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-target')
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

    it('onStatusChange completed 应清除 isStreaming', async () => {
      const captured = captureRunAgentCallbacks()
      mockGetVisibleMessages.mockReturnValue([makeMessage({ id: 'msg-target' })])

      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-target')
        const { callbacks } = await captured
        callbacks.onStatusChange?.('completed')
      })

      const finalUpdate = mockUpdateMessage.mock.calls.find((c) => c[1]?.isStreaming === false)
      expect(finalUpdate).toBeDefined()
      expect(finalUpdate![1].finishReason).toBe('stop')
    })

    it('onStatusChange error 应标记 isError', async () => {
      const captured = captureRunAgentCallbacks()
      mockGetVisibleMessages.mockReturnValue([makeMessage({ id: 'msg-target' })])

      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-target')
        const { callbacks } = await captured
        callbacks.onStatusChange?.('error')
      })

      const errUpdate = mockUpdateMessage.mock.calls.find((c) => c[1]?.isError === true)
      expect(errUpdate).toBeDefined()
      expect(errUpdate![1].finishReason).toBe('error')
    })

    it('onError 应标记消息为错误状态', async () => {
      const captured = captureRunAgentCallbacks()
      mockGetVisibleMessages.mockReturnValue([makeMessage({ id: 'msg-target' })])

      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-target')
        const { callbacks } = await captured
        callbacks.onError?.('Agent 出错')
      })

      const errUpdate = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.isError === true && c[1]?.isStreaming === false,
      )
      expect(errUpdate).toBeDefined()
    })

    it('onDone 应保留 onStatusChange 设置的 finishReason', async () => {
      const captured = captureRunAgentCallbacks()
      mockGetVisibleMessages.mockReturnValue([makeMessage({ id: 'msg-target' })])

      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-target')
        const { callbacks } = await captured
        // 先触发 stopped → onStatusChange 设置 finishReason='abort'
        callbacks.onStatusChange?.('stopped')
        // 再触发 onDone → 应保留 'abort'
        callbacks.onDone?.('最终答案')
      })

      // onDone 调用 updateMessage 时 finishReason 应为 'abort'（保留），不是覆盖为 stop
      // content = doneContent + abort 中断提示
      const doneUpdate = mockUpdateMessage.mock.calls.find(
        (c) => typeof c[1]?.content === 'string' && c[1].content.includes('最终答案'),
      )
      expect(doneUpdate).toBeDefined()
      expect(doneUpdate![1].finishReason).toBe('abort')
    })

    it('onReportReady 应标记 hasReport 并保存报告', async () => {
      const captured = captureRunAgentCallbacks()
      mockGetVisibleMessages.mockReturnValue([makeMessage({ id: 'msg-target' })])

      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-target')
        const { callbacks } = await captured
        callbacks.onReportReady?.('<h1>报告</h1>')
      })

      const reportUpdate = mockUpdateMessage.mock.calls.find((c) => c[1]?.hasReport === true)
      expect(reportUpdate).toBeDefined()
    })

    it('onToken 应通过 StreamingBuffer 推送内容', async () => {
      const captured = captureRunAgentCallbacks()
      mockGetVisibleMessages.mockReturnValue([makeMessage({ id: 'msg-target' })])

      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-target')
        const { callbacks } = await captured
        callbacks.onToken?.('片段1')
        callbacks.onToken?.('片段2')
        callbacks.onDone?.('')
      })

      // updateMessage 至少有一次 content 包含 '片段1片段2'
      const contentUpdate = mockUpdateMessage.mock.calls.find(
        (c) => typeof c[1]?.content === 'string' && c[1].content.includes('片段1片段2'),
      )
      expect(contentUpdate).toBeDefined()
    })
  })

  describe('普通模式重新生成', () => {
    beforeEach(() => {
      // 让对话无 agentId（进入普通模式）
      mockGetConversation.mockReturnValue({ id: 'conv-test', title: 't', messageCount: 2 })
    })

    it('应调用 aiService.streamChat 重新生成', async () => {
      const captured = captureStreamChatCallbacks()
      mockGetVisibleMessages.mockReturnValue([makeMessage({ id: 'msg-target', role: 'assistant' })])

      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-target')
        await captured
      })

      expect(mockStreamChat).toHaveBeenCalled()
      expect(mockDeleteMessage).toHaveBeenCalledWith('conv-test', 'msg-target')
      // 应创建新的 assistant 消息
      expect(mockAddMessage).toHaveBeenCalledWith(
        'conv-test',
        expect.objectContaining({ role: 'assistant', isStreaming: true }),
      )
    })

    it('onDone 完成时应清除 isStreaming 并设置 finishReason', async () => {
      const captured = captureStreamChatCallbacks()
      mockGetVisibleMessages.mockReturnValue([makeMessage({ id: 'msg-target' })])

      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-target')
        const callbacks = await captured
        callbacks.onToken?.('内容')
        callbacks.onDone?.('stop')
      })

      const doneUpdate = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.isStreaming === false && c[1]?.finishReason === 'stop',
      )
      expect(doneUpdate).toBeDefined()
    })

    it('onDone finishReason=abort 时应追加中断提示', async () => {
      const captured = captureStreamChatCallbacks()
      mockGetVisibleMessages.mockReturnValue([makeMessage({ id: 'msg-target' })])

      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-target')
        const callbacks = await captured
        callbacks.onToken?.('部分内容')
        callbacks.onDone?.('abort')
      })

      // 应包含中断提示文案（onDone 的 content 含 '部分内容' + '中断'）
      const doneUpdate = mockUpdateMessage.mock.calls.find(
        (c) =>
          typeof c[1]?.content === 'string' &&
          c[1].content.includes('部分内容') &&
          c[1].content.includes('中断'),
      )
      expect(doneUpdate).toBeDefined()
      expect(doneUpdate![1].finishReason).toBe('abort')
    })

    it('onError 应标记消息为错误状态', async () => {
      const captured = captureStreamChatCallbacks()
      mockGetVisibleMessages.mockReturnValue([makeMessage({ id: 'msg-target' })])

      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-target')
        const callbacks = await captured
        callbacks.onError?.('网络错误')
      })

      const errUpdate = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.isError === true && c[1]?.isStreaming === false,
      )
      expect(errUpdate).toBeDefined()
    })

    it('onReasoningToken 应累积推理内容', async () => {
      const captured = captureStreamChatCallbacks()
      mockGetVisibleMessages.mockReturnValue([makeMessage({ id: 'msg-target' })])

      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-target')
        const callbacks = await captured
        callbacks.onReasoningToken?.('推理片段')
        callbacks.onDone?.('stop')
      })

      const reasoningUpdate = mockUpdateMessage.mock.calls.find(
        (c) => typeof c[1]?.reasoningContent === 'string' && c[1].reasoningContent.includes('推理片段'),
      )
      expect(reasoningUpdate).toBeDefined()
    })
  })

  describe('agent.enabled=false 时应回退到普通模式', () => {
    it('应调用 streamChat 而非 runAgent', async () => {
      currentAgent = makeAgent({ enabled: false })
      const captured = captureStreamChatCallbacks()
      mockGetVisibleMessages.mockReturnValue([makeMessage({ id: 'msg-target' })])

      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.regenerateMessage('msg-target')
        await captured
      })

      expect(mockRunAgent).not.toHaveBeenCalled()
      expect(mockStreamChat).toHaveBeenCalled()
    })
  })
})
