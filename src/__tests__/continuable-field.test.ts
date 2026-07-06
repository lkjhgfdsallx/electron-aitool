/// <reference path="../types/electron.d.ts" />
/**
 * continuable 字段设置逻辑单元测试
 *
 * 测试 "继续生成" 功能中 continuable 字段的设置规则：
 * 1. stopGeneration：根据 agentSteps 设置 'agent' 或 'normal'
 * 2. continueGeneration onDone：成功后设为 null，length/abort 设为 'normal'
 * 3. continueGeneration onError：错误后恢复为原 continuable 类型
 * 4. continueGeneration onStatusChange('stopped')：停止后保持可继续
 *
 * @see src/hooks/use-chat.ts stopGeneration() lines 1418-1437
 * @see src/hooks/use-chat.ts continueGeneration() lines 2023-2254
 * @see src/types/message.ts Message.continuable lines 50-91
 */

import type { AgentProfile, AgentStep, Message, ResolvedAIConfig } from '../types'

// ===== Mock 依赖模块 =====

const mockRunAgent = jest.fn()
const mockStreamChat = jest.fn()

jest.mock('../services/agent-engine', () => ({
  runAgent: (...args: unknown[]) => mockRunAgent(...args),
}))

jest.mock('../services/ai-service', () => ({
  aiService: {
    streamChat: (...args: unknown[]) => mockStreamChat(...args),
  },
}))

jest.mock('../services/tool-service', () => ({
  toolService: { toToolDefinitions: jest.fn(() => []) },
}))

jest.mock('../services/built-in-tools', () => ({
  BUILT_IN_TOOLS: [],
  AGENT_BUILTIN_TOOLS: [],
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

// ===== Zustand store mock =====
const mockUpdateMessage = jest.fn()
const mockGetMessages = jest.fn()

const makeStoreMock = (state: Record<string, unknown>) => {
  const fn = jest.fn((selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(state) : state,
  )
  ;(fn as unknown as { getState: () => Record<string, unknown> }).getState = () => state
  return fn
}

jest.mock('../stores/conversation-store', () => ({
  useConversationStore: makeStoreMock({
    currentConversationId: 'conv-test',
    conversations: [],
    getVisibleMessages: () => mockGetMessages(),
    updateMessage: mockUpdateMessage,
    addMessage: jest.fn(),
    getMessages: () => mockGetMessages(),
    switchBranch: jest.fn(),
    getCurrentBranchIndex: jest.fn(() => 0),
    getConversation: jest.fn(() => undefined),
    renameConversation: jest.fn(),
  }),
}))

jest.mock('../stores/global-config-store', () => ({
  useGlobalConfigStore: makeStoreMock({ globalConfig: {} }),
}))

jest.mock('../stores/agent-store', () => ({
  useAgentStore: makeStoreMock({
    agents: [],
    getAgent: jest.fn((agentId: string) =>
      agentId === 'test-agent'
        ? {
            id: 'test-agent',
            name: '测试Agent',
            description: '测试用',
            systemPrompt: '你是测试助手',
            enabledToolIds: [],
            planningStrategy: 'react',
            memoryConfig: { historyTurns: 10, longTermEnabled: false, crossSession: false },
            termination: { maxSteps: 5, timeoutSeconds: 60, autoStopOnGoal: false },
            modelConfig: {},
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
        : undefined,
    ),
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

jest.mock('../stores', () => ({
  useSettingsStore: makeStoreMock({
    webSearchEnabled: true,
    enableNotification: false,
    enableSound: false,
    notificationSound: 'default',
  }),
}))

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-' + Math.random().toString(36).slice(2, 9)),
}))

import { renderHook } from '@testing-library/react'
import { useChat } from '../hooks/use-chat'

// ===== 测试夹具 =====

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 9)}`,
    conversationId: 'conv-test',
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    ...overrides,
  }
}

function makeStep(overrides: Partial<AgentStep>): AgentStep {
  return {
    id: `step-${Math.random().toString(36).slice(2, 9)}`,
    type: 'thinking',
    content: '',
    stepIndex: 0,
    timestamp: Date.now(),
    ...overrides,
  }
}

// ===== 测试套件 =====

describe('continuable 字段设置逻辑', () => {
  let continueGeneration: (messageId: string) => Promise<void>
  let stopGeneration: () => void

  beforeEach(() => {
    jest.clearAllMocks()
    mockRunAgent.mockResolvedValue(undefined)
    mockStreamChat.mockResolvedValue(undefined)

    const { result } = renderHook(() => useChat())
    continueGeneration = result.current.continueGeneration
    stopGeneration = result.current.stopGeneration
  })

  describe('stopGeneration 的 continuable 设置', () => {
    it('有 agentSteps 的消息停止后应设 continuable="agent"', () => {
      const msg = makeMessage({
        id: 'm1',
        isStreaming: true,
        agentSteps: [makeStep({ type: 'thinking', content: '思考' })],
      })
      mockGetMessages.mockReturnValue([msg])

      stopGeneration()

      const update = mockUpdateMessage.mock.calls.find((c) => c[0] === 'm1')
      expect(update).toBeDefined()
      expect(update[1]).toEqual(
        expect.objectContaining({
          isStreaming: false,
          finishReason: 'abort',
          continuable: 'agent',
        }),
      )
    })

    it('无 agentSteps 的消息停止后应设 continuable="normal"', () => {
      const msg = makeMessage({
        id: 'm1',
        isStreaming: true,
        agentSteps: [],
      })
      mockGetMessages.mockReturnValue([msg])

      stopGeneration()

      const update = mockUpdateMessage.mock.calls.find((c) => c[0] === 'm1')
      expect(update).toBeDefined()
      expect(update[1]).toEqual(
        expect.objectContaining({
          isStreaming: false,
          finishReason: 'abort',
          continuable: 'normal',
        }),
      )
    })

    it('agentSteps 为 undefined 的消息停止后应设 continuable="normal"', () => {
      const msg = makeMessage({
        id: 'm1',
        isStreaming: true,
      })
      delete msg.agentSteps
      mockGetMessages.mockReturnValue([msg])

      stopGeneration()

      const update = mockUpdateMessage.mock.calls.find((c) => c[0] === 'm1')
      expect(update).toBeDefined()
      expect(update[1].continuable).toBe('normal')
    })

    it('非流式消息不应被 stopGeneration 影响', () => {
      const msg = makeMessage({
        id: 'm1',
        isStreaming: false,
        continuable: 'normal',
      })
      mockGetMessages.mockReturnValue([msg])

      stopGeneration()

      // 不应对非流式消息调用 updateMessage
      const update = mockUpdateMessage.mock.calls.find((c) => c[0] === 'm1')
      expect(update).toBeUndefined()
    })
  })

  describe('continueGeneration Agent 模式的 continuable 设置', () => {
    it('开始继续时应清除 continuable（设为 null）', async () => {
      const msg = makeMessage({
        id: 'm1',
        continuable: 'agent',
        agentId: 'test-agent',
        agentSteps: [],
      })
      mockGetMessages.mockReturnValue([msg])

      await continueGeneration('m1')

      const firstUpdate = mockUpdateMessage.mock.calls[0]
      expect(firstUpdate[1]).toEqual(
        expect.objectContaining({ isStreaming: true, continuable: null }),
      )
    })

    it('Agent 不存在时应恢复 continuable="agent"', async () => {
      const msg = makeMessage({
        id: 'm1',
        continuable: 'agent',
        agentId: 'nonexistent',
        agentSteps: [],
      })
      mockGetMessages.mockReturnValue([msg])

      await continueGeneration('m1')

      const errorUpdate = mockUpdateMessage.mock.calls.find((c) => c[1]?.isError === true)
      expect(errorUpdate[1].continuable).toBe('agent')
    })

    it('runAgent 抛出异常时应恢复 continuable="agent"', async () => {
      const msg = makeMessage({
        id: 'm1',
        continuable: 'agent',
        agentId: 'test-agent',
        agentSteps: [],
      })
      mockGetMessages.mockReturnValue([msg])
      mockRunAgent.mockRejectedValue(new Error('失败'))

      await continueGeneration('m1')

      const errorUpdate = mockUpdateMessage.mock.calls.find((c) => c[1]?.isError === true)
      expect(errorUpdate[1]).toEqual(
        expect.objectContaining({
          isStreaming: false,
          isError: true,
          continuable: 'agent',
        }),
      )
    })

    it('onStatusChange("stopped") 应设 continuable="agent"', async () => {
      const msg = makeMessage({
        id: 'm1',
        continuable: 'agent',
        agentId: 'test-agent',
        agentSteps: [],
      })
      mockGetMessages.mockReturnValue([msg])

      // 捕获 runAgent 的 callbacks 参数
      let capturedCallbacks: Record<string, (...args: unknown[]) => void> | null = null
      mockRunAgent.mockImplementation(
        async (_agent, _msg, _hist, _tools, _config, _signal, callbacks) => {
          capturedCallbacks = callbacks
          // 模拟 Agent 被停止
          callbacks.onStatusChange('stopped')
        },
      )

      await continueGeneration('m1')

      expect(capturedCallbacks).not.toBeNull()
      const stoppedUpdate = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.continuable === 'agent' && c[1]?.isStreaming === false,
      )
      expect(stoppedUpdate).toBeDefined()
    })

    it('onDone 应设 continuable=null（完成）', async () => {
      const msg = makeMessage({
        id: 'm1',
        continuable: 'agent',
        agentId: 'test-agent',
        agentSteps: [],
      })
      mockGetMessages.mockReturnValue([msg])

      mockRunAgent.mockImplementation(
        async (_agent, _msg, _hist, _tools, _config, _signal, callbacks) => {
          callbacks.onStep({ type: 'final_answer', content: '完成', id: 's1', stepIndex: 0, timestamp: Date.now() })
          callbacks.onDone('完成的回复')
        },
      )

      await continueGeneration('m1')

      const doneUpdate = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.finishReason === 'stop',
      )
      expect(doneUpdate).toBeDefined()
      expect(doneUpdate[1].continuable).toBeNull()
    })

    it('onError 应设 continuable="agent"', async () => {
      const msg = makeMessage({
        id: 'm1',
        continuable: 'agent',
        agentId: 'test-agent',
        agentSteps: [],
      })
      mockGetMessages.mockReturnValue([msg])

      mockRunAgent.mockImplementation(
        async (_agent, _msg, _hist, _tools, _config, _signal, callbacks) => {
          callbacks.onError('Agent 出错')
        },
      )

      await continueGeneration('m1')

      const errorUpdate = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.isError === true && c[1]?.continuable === 'agent',
      )
      expect(errorUpdate).toBeDefined()
    })
  })

  describe('continueGeneration 普通模式的 continuable 设置', () => {
    it('onDone finishReason="stop" 应设 continuable=null', async () => {
      const msg = makeMessage({
        id: 'm1',
        content: '部分回复',
        continuable: 'normal',
      })
      mockGetMessages.mockReturnValue([msg])

      mockStreamChat.mockImplementation(
        async (_msgs, _config, _sys, _tools, _signal, callbacks) => {
          callbacks.onToken('续写内容')
          callbacks.onDone('stop')
        },
      )

      await continueGeneration('m1')

      const doneUpdate = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.finishReason === 'stop',
      )
      expect(doneUpdate).toBeDefined()
      expect(doneUpdate[1].continuable).toBeNull()
    })

    it('onDone finishReason="length" 应设 continuable="normal"（可继续）', async () => {
      const msg = makeMessage({
        id: 'm1',
        content: '部分回复',
        continuable: 'normal',
      })
      mockGetMessages.mockReturnValue([msg])

      mockStreamChat.mockImplementation(
        async (_msgs, _config, _sys, _tools, _signal, callbacks) => {
          callbacks.onToken('续写内容')
          callbacks.onDone('length')
        },
      )

      await continueGeneration('m1')

      const doneUpdate = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.finishReason === 'length',
      )
      expect(doneUpdate).toBeDefined()
      expect(doneUpdate[1].continuable).toBe('normal')
    })

    it('onDone finishReason="abort" 应设 continuable="normal"（可继续）', async () => {
      const msg = makeMessage({
        id: 'm1',
        content: '部分回复',
        continuable: 'normal',
      })
      mockGetMessages.mockReturnValue([msg])

      mockStreamChat.mockImplementation(
        async (_msgs, _config, _sys, _tools, _signal, callbacks) => {
          callbacks.onToken('续写内容')
          callbacks.onDone('abort')
        },
      )

      await continueGeneration('m1')

      const doneUpdate = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.finishReason === 'abort',
      )
      expect(doneUpdate).toBeDefined()
      expect(doneUpdate[1].continuable).toBe('normal')
    })

    it('onError 应设 continuable="normal"（可重试）', async () => {
      const msg = makeMessage({
        id: 'm1',
        content: '部分回复',
        continuable: 'normal',
      })
      mockGetMessages.mockReturnValue([msg])

      mockStreamChat.mockImplementation(
        async (_msgs, _config, _sys, _tools, _signal, callbacks) => {
          callbacks.onError('流式请求失败')
        },
      )

      await continueGeneration('m1')

      const errorUpdate = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.isError === true && c[1]?.continuable === 'normal',
      )
      expect(errorUpdate).toBeDefined()
    })

    it('streamChat 抛出异常应设 continuable="normal"', async () => {
      const msg = makeMessage({
        id: 'm1',
        content: '部分回复',
        continuable: 'normal',
      })
      mockGetMessages.mockReturnValue([msg])
      mockStreamChat.mockRejectedValue(new Error('网络错误'))

      await continueGeneration('m1')

      const errorUpdate = mockUpdateMessage.mock.calls.find(
        (c) => c[1]?.isError === true && c[1]?.continuable === 'normal',
      )
      expect(errorUpdate).toBeDefined()
    })
  })

  describe('continuable 字段类型约束', () => {
    it('continuable 只接受 "normal" | "agent" | null | undefined', () => {
      // 类型层面的约束通过 TypeScript 编译保证
      // 此测试验证运行时赋值符合预期
      const msg: Message = makeMessage({ id: 'type-test' })

      // 正常赋值
      msg.continuable = 'normal'
      expect(msg.continuable).toBe('normal')

      msg.continuable = 'agent'
      expect(msg.continuable).toBe('agent')

      msg.continuable = null
      expect(msg.continuable).toBeNull()

      delete msg.continuable
      expect(msg.continuable).toBeUndefined()
    })
  })
})
