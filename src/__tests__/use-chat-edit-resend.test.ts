/**
 * editAndResend（编辑用户消息并重新发送）单元测试
 *
 * 测试 useChat hook 中的 editAndResend：
 * - 前置条件：无 currentConversationId / 流式中 / 找不到消息 / 非用户消息时应早返回
 * - 分支索引计算：基于已有最大 branchIndex 派生 newBranchIndex
 * - 用户消息更新：内容、isEdited、branchCount
 * - activeBranches 切换与可见历史重建
 * - Agent 模式：runAgent 调用 + 各回调（onStep/onToken/onStatusChange/onError/onDone/onReport/onSiteAnalyzerProgress）
 * - 普通模式：streamChat 调用 + onDone（含/不含工具调用）/onError
 *
 * @see src/hooks/use-chat.ts editAndResend() lines 1739-2018
 */
/// <reference path="../types/electron.d.ts" />

import type { AgentProfile, Message, ResolvedAIConfig, Tool } from '../types'
import type { AgentStep } from '../types/agent'

// ===== Mock 服务层 =====
const mockRunAgent = jest.fn()
const mockStreamChat = jest.fn()
const mockExecuteTool = jest.fn()
const mockUpdateMessage = jest.fn()
const mockSwitchBranch = jest.fn()
const mockAddMessage = jest.fn((_convId: string, msg: Partial<Message>) => ({
  id: `msg-${Math.random().toString(36).slice(2, 8)}`,
  conversationId: _convId,
  ...msg,
}))
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

// ===== 共享可变 store 状态 =====
// editAndResend 通过 getMessages(convId) 读取全量消息（含 branchIndex），
// 该函数在有 convId 时直接读取 messages map，因此测试需将消息注入到该 map。
const convStoreState: Record<string, unknown> = {
  currentConversationId: 'conv-test' as string | null,
  conversations: [],
  messages: {} as Record<string, Message[]>,
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
  getVisibleMessages: (convId: string) => {
    const messages = convStoreState.messages as Record<string, Message[]>
    const all = messages[convId] ?? []
    // 简化：返回全部消息以适配 handleToolCalls 逻辑（其内部基于 branchIndex 过滤）
    return all
  },
  getMessages: (convId?: string) => {
    if (!convId) return [] as Message[]
    const messages = convStoreState.messages as Record<string, Message[]>
    return messages[convId] ?? ([] as Message[])
  },
  deleteMessage: jest.fn(),
  switchBranch: mockSwitchBranch,
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

/** 将消息列表注入到 conv-test 的 messages map（editAndResend 通过 getMessages 读取） */
function seedMessages(...msgs: Message[]): void {
  convStoreState.messages = { 'conv-test': msgs }
}

interface RunAgentCallbacks {
  onStep?: (s: AgentStep) => void
  onToken?: (t: string) => void
  onReasoningToken?: (t: string) => void
  onStatusChange?: (s: string) => void
  onError?: (e: string) => void
  onDone?: (c: string) => void
  onReportReady?: (r: string) => void
  onSiteAnalyzerProgress?: (p: Record<string, unknown>) => void
}

/** 捕获 runAgent 第 7 参数（callbacks） */
function captureRunAgentCallbacks(): Promise<{ callbacks: RunAgentCallbacks; args: unknown[] }> {
  return new Promise((resolve) => {
    mockRunAgent.mockImplementation(async (...args: unknown[]) => {
      resolve({
        callbacks: (args[6] ?? {}) as RunAgentCallbacks,
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

describe('editAndResend', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    convStoreState.currentConversationId = 'conv-test'
    convStoreState.conversations = [{ id: 'conv-test', agentId: 'test-agent', title: 't', messageCount: 2 }]
    convStoreState.messages = {}
    mockGetConversation.mockImplementation((id?: string) => {
      if (id === 'conv-test') return { id: 'conv-test', agentId: 'test-agent', title: 't', messageCount: 2, activeBranches: {} }
      return undefined
    })
    currentAgent = makeAgent()
    mockSettingsState.webSearchEnabled = true
    mockSettingsState.enableNotification = false
  })

  describe('前置条件检查', () => {
    it('无 currentConversationId 时应直接返回', async () => {
      expect.assertions(2)
      convStoreState.currentConversationId = null
      seedMessages(makeMessage({ id: 'msg-x', role: 'user' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-x', '新内容')
      })

      expect(mockUpdateMessage).not.toHaveBeenCalled()
      expect(mockRunAgent).not.toHaveBeenCalled()
    })

    it('找不到目标消息时应直接返回', async () => {
      expect.assertions(2)
      seedMessages(makeMessage({ id: 'msg-other', role: 'user' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-not-exist', '新内容')
      })

      expect(mockUpdateMessage).not.toHaveBeenCalled()
      expect(mockSwitchBranch).not.toHaveBeenCalled()
    })

    it('目标消息非 user 角色时应直接返回', async () => {
      expect.assertions(2)
      seedMessages(makeMessage({ id: 'msg-asst', role: 'assistant' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-asst', '新内容')
      })

      expect(mockSwitchBranch).not.toHaveBeenCalled()
      expect(mockRunAgent).not.toHaveBeenCalled()
    })
  })

  describe('分支索引与消息更新', () => {
    it('应基于已有最大 branchIndex 计算新分支索引并更新用户消息', async () => {
      expect.assertions(4)
      seedMessages(
        makeMessage({ id: 'msg-user', role: 'user', content: '旧' }),
        makeMessage({ id: 'msg-a1', role: 'assistant', branchIndex: 0 }),
        makeMessage({ id: 'msg-a2', role: 'assistant', branchIndex: 1 }),
      )
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-user', '新内容')
      })

      // newBranchIndex = 1 + 1 = 2；newBranchCount = max(1, 3) = 3
      const updateCall = mockUpdateMessage.mock.calls.find(
        (c) => c[0] === 'msg-user' && c[1]?.content === '新内容',
      )
      expect(updateCall).toBeDefined()
      expect(updateCall![1].isEdited).toBe(true)
      expect(updateCall![1].branchCount).toBe(3)
      expect(mockSwitchBranch).toHaveBeenCalledWith('conv-test', 'msg-user', 2)
    })

    it('无历史 branchIndex 时新分支索引应为 0', async () => {
      expect.assertions(2)
      seedMessages(makeMessage({ id: 'msg-user', role: 'user' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-user', '第一次编辑')
      })

      // maxBranchIndex = -1 → newBranchIndex = 0；branchCount = max(1, 1) = 1
      expect(mockSwitchBranch).toHaveBeenCalledWith('conv-test', 'msg-user', 0)
      const updateCall = mockUpdateMessage.mock.calls.find(
        (c) => c[0] === 'msg-user' && c[1]?.content === '第一次编辑',
      )
      expect(updateCall![1].branchCount).toBe(1)
    })

    it('用户消息已有较大 branchCount 时应保留较大值', async () => {
      expect.assertions(1)
      seedMessages(makeMessage({ id: 'msg-user', role: 'user', branchCount: 5 }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-user', '再次编辑')
      })

      const updateCall = mockUpdateMessage.mock.calls.find(
        (c) => c[0] === 'msg-user' && c[1]?.content === '再次编辑',
      )
      // newBranchIndex=0, newBranchCount = max(5, 1) = 5
      expect(updateCall![1].branchCount).toBe(5)
    })
  })

  describe('Agent 模式重新发送', () => {
    it('对话绑定 agent 时应调用 runAgent 并创建新 assistant 消息', async () => {
      expect.assertions(3)
      const captured = captureRunAgentCallbacks()
      seedMessages(makeMessage({ id: 'msg-user', role: 'user', content: '旧' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-user', '你好Agent')
        await captured
      })

      expect(mockRunAgent).toHaveBeenCalled()
      // runAgent 第 2 参数 userMessage 应为编辑后的内容
      expect(mockRunAgent.mock.calls[0][1]).toBe('你好Agent')
      expect(mockAddMessage).toHaveBeenCalledWith(
        'conv-test',
        expect.objectContaining({ role: 'assistant', isStreaming: true, agentId: 'test-agent' }),
      )
    })

    it('onStatusChange completed 时应更新消息完成状态', async () => {
      expect.assertions(1)
      const captured = captureRunAgentCallbacks()
      seedMessages(makeMessage({ id: 'msg-user', role: 'user' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-user', '内容')
        const { callbacks } = await captured
        callbacks.onStatusChange?.('completed')
      })

      const completedCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.isStreaming === false && c[1]?.finishReason === 'stop',
      )
      expect(completedCall).toBeDefined()
    })

    it('onStatusChange error 时应标记 isError', async () => {
      expect.assertions(2)
      const captured = captureRunAgentCallbacks()
      seedMessages(makeMessage({ id: 'msg-user', role: 'user' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-user', '内容')
        const { callbacks } = await captured
        callbacks.onStatusChange?.('error')
      })

      const errorCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.isError === true && c[1]?.finishReason === 'error',
      )
      expect(errorCall).toBeDefined()
      expect(errorCall![1].isStreaming).toBe(false)
    })

    it('onError 回调应刷新缓冲并标记错误', async () => {
      expect.assertions(1)
      const captured = captureRunAgentCallbacks()
      seedMessages(makeMessage({ id: 'msg-user', role: 'user' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-user', '内容')
        const { callbacks } = await captured
        callbacks.onError?.('执行失败')
      })

      const errorCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.content === '执行失败' && c[1]?.isError === true,
      )
      expect(errorCall).toBeDefined()
    })

    it('onDone 应回调时应保留已有 finishReason 并写入最终内容', async () => {
      expect.assertions(1)
      const captured = captureRunAgentCallbacks()
      seedMessages(makeMessage({ id: 'msg-user', role: 'user' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-user', '内容')
        const { callbacks } = await captured
        // 先触发 stopped 设置 finishReason=abort，再 onDone
        callbacks.onStatusChange?.('stopped')
        callbacks.onDone?.('最终')
      })

      // onDone 后内容包含「最终」，且 isStreaming=false
      const doneCall = mockUpdateMessage.mock.calls.find(
        (c) => typeof c[1]?.content === 'string' && (c[1].content as string).includes('最终') && c[1]?.isStreaming === false,
      )
      expect(doneCall).toBeDefined()
    })

    it('onReportReady 应保存报告并标记 hasReport', async () => {
      expect.assertions(2)
      const { reportStore } = require('../services/report-store')
      const captured = captureRunAgentCallbacks()
      seedMessages(makeMessage({ id: 'msg-user', role: 'user' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-user', '内容')
        const { callbacks } = await captured
        callbacks.onReportReady?.('<html>报告</html>')
      })

      const hasReportCall = mockUpdateMessage.mock.calls.find((c) => c[1]?.hasReport === true)
      expect(hasReportCall).toBeDefined()
      expect(reportStore.saveReport).toHaveBeenCalled()
    })

    it('onSiteAnalyzerProgress 应更新进度信息', async () => {
      expect.assertions(1)
      const captured = captureRunAgentCallbacks()
      seedMessages(makeMessage({ id: 'msg-user', role: 'user' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-user', '内容')
        const { callbacks } = await captured
        callbacks.onSiteAnalyzerProgress?.({
          type: 'started',
          message: '开始',
          pagesCrawled: 0,
          totalPages: 10,
          apisFound: 0,
          pagesAnalyzed: 0,
          currentUrl: 'http://x',
        })
      })

      const progressCall = mockUpdateMessage.mock.calls.find((c) => c[1]?.siteAnalyzerProgress)
      expect(progressCall).toBeDefined()
    })
  })

  describe('普通模式重新发送', () => {
    // 普通模式：getConversation 返回不带 agentId，使 hook 走 streamChat 分支
    function plainConversation(): void {
      mockGetConversation.mockImplementation((id?: string) => {
        if (id === 'conv-test') return { id: 'conv-test', title: 't', messageCount: 0, activeBranches: {} }
        return undefined
      })
    }

    it('对话无 agent 时应调用 streamChat', async () => {
      expect.assertions(2)
      plainConversation()
      const captured = captureStreamChatCallbacks()
      seedMessages(makeMessage({ id: 'msg-user', role: 'user' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-user', '你好')
        await captured
      })

      expect(mockRunAgent).not.toHaveBeenCalled()
      expect(mockStreamChat).toHaveBeenCalled()
    })

    it('agent.enabled=false 时应回退到普通模式', async () => {
      expect.assertions(2)
      currentAgent = makeAgent({ enabled: false })
      const captured = captureStreamChatCallbacks()
      seedMessages(makeMessage({ id: 'msg-user', role: 'user' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-user', '你好')
        await captured
      })

      expect(mockRunAgent).not.toHaveBeenCalled()
      expect(mockStreamChat).toHaveBeenCalled()
    })

    it('普通模式 onDone 无工具调用时应完成消息并写入 finishReason', async () => {
      expect.assertions(2)
      plainConversation()
      const captured = captureStreamChatCallbacks()
      seedMessages(makeMessage({ id: 'msg-user', role: 'user' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-user', '你好')
        const callbacks = await captured
        callbacks.onToken?.('流式内容')
        callbacks.onDone?.('stop')
      })

      const doneCall = mockUpdateMessage.mock.calls.find(
        (c) => typeof c[1]?.content === 'string' && (c[1].content as string).includes('流式内容') && c[1]?.isStreaming === false,
      )
      expect(doneCall).toBeDefined()
      expect(doneCall![1].finishReason).toBe('stop')
    })

    it('普通模式 onError 应标记错误', async () => {
      expect.assertions(2)
      plainConversation()
      const captured = captureStreamChatCallbacks()
      seedMessages(makeMessage({ id: 'msg-user', role: 'user' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-user', '你好')
        const callbacks = await captured
        callbacks.onError?.('网络错误')
      })

      const errorCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.content === '网络错误' && c[1]?.isError === true,
      )
      expect(errorCall).toBeDefined()
      expect(errorCall![1].isStreaming).toBe(false)
    })

    it('普通模式 onDone 含工具调用时应记录 pending toolCalls 并执行工具', async () => {
      expect.assertions(2)
      plainConversation()
      // handleToolCalls 内部调用 executeTool，需返回成功结果以走 completed 分支
      mockExecuteTool.mockResolvedValue({ success: true, data: '42' })
      const captured = captureStreamChatCallbacks()
      seedMessages(makeMessage({ id: 'msg-user', role: 'user' }))
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.editAndResend('msg-user', '帮我计算')
        const callbacks = await captured
        callbacks.onToolCalls?.([{ id: 'tc-1', name: 'calculator', arguments: '{}' }])
        await callbacks.onDone?.('tool_calls')
      })

      // 应记录 pending toolCalls
      const toolCallUpdate = mockUpdateMessage.mock.calls.find(
        (c) => Array.isArray(c[1]?.toolCalls) && (c[1].toolCalls as Array<unknown>).length > 0,
      )
      expect(toolCallUpdate).toBeDefined()
      // 应调用 executeTool 执行工具
      expect(mockExecuteTool).toHaveBeenCalled()
    })
  })
})
