/// <reference path="../types/electron.d.ts" />
/**
 * continueGeneration 分发逻辑单元测试
 *
 * 测试 useChat hook 中 continueGeneration 的核心分发逻辑：
 * - continuable='agent' → 调用 runAgent(resume)
 * - continuable='normal' → 调用 aiService.streamChat（prefix 模式）
 * - continuable=null/undefined → 直接返回（不执行）
 * - 正在流式输出时 → 直接返回
 * - 无对话 ID 时 → 直接返回
 *
 * 由于 useChat hook 依赖大量 Zustand store，此处通过 mock 所有依赖来隔离测试。
 *
 * @see src/hooks/use-chat.ts continueGeneration() lines 2023-2254
 */

import type { AgentProfile, AgentStep, Message, ResolvedAIConfig, Tool } from '../types'

// ===== Mock 所有 useChat 依赖 =====

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
  toolService: {
    toToolDefinitions: jest.fn(() => []),
  },
}))

jest.mock('../services/built-in-tools', () => ({
  BUILT_IN_TOOLS: [],
  AGENT_BUILTIN_TOOLS: [],
  WORKSPACE_TOOLS: [],
}))

jest.mock('../services/report-store', () => ({
  reportStore: {
    saveReport: jest.fn(async () => {}),
  },
}))

jest.mock('../services/knowledge-base-service', () => ({
  knowledgeBaseService: {
    searchAndFormatContext: jest.fn(async () => ''),
  },
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

// ===== Zustand store mocks =====
const mockUpdateMessage = jest.fn()
const mockGetMessages = jest.fn()

// Zustand store mock：既可作为 hook 调用（返回 state），也支持 .getState()
// 支持两种调用方式：
//   1. useStore() → 返回完整 state
//   2. useStore(selector) → 返回 selector(state)
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
    // getAgent 需要返回一个有效的 AgentProfile，使 continueGeneration 能找到 agent
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

// 导入被测 hook（在所有 mock 之后）
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

function makeAgent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
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

describe('continueGeneration 分发逻辑', () => {
  let continueGeneration: (messageId: string) => Promise<void>

  beforeEach(() => {
    jest.clearAllMocks()
    mockRunAgent.mockResolvedValue(undefined)
    mockStreamChat.mockResolvedValue(undefined)

    // 使用 renderHook 在 React 渲染上下文中调用 hook
    const { result } = renderHook(() => useChat())
    continueGeneration = result.current.continueGeneration
  })

  describe('前置条件检查', () => {
    it('消息 continuable 为 null 时应直接返回', async () => {
      const msg = makeMessage({ id: 'm1', continuable: null })
      mockGetMessages.mockReturnValue([msg])

      await continueGeneration('m1')

      expect(mockRunAgent).not.toHaveBeenCalled()
      expect(mockStreamChat).not.toHaveBeenCalled()
      expect(mockUpdateMessage).not.toHaveBeenCalled()
    })

    it('消息 continuable 为 undefined 时应直接返回', async () => {
      const msg = makeMessage({ id: 'm1' })
      delete (msg as Partial<Message>).continuable
      mockGetMessages.mockReturnValue([msg])

      await continueGeneration('m1')

      expect(mockRunAgent).not.toHaveBeenCalled()
      expect(mockStreamChat).not.toHaveBeenCalled()
    })

    it('消息角色不是 assistant 时应直接返回', async () => {
      const msg = makeMessage({ id: 'm1', role: 'user', continuable: 'normal' })
      mockGetMessages.mockReturnValue([msg])

      await continueGeneration('m1')

      expect(mockRunAgent).not.toHaveBeenCalled()
      expect(mockStreamChat).not.toHaveBeenCalled()
    })

    it('找不到目标消息时应直接返回', async () => {
      mockGetMessages.mockReturnValue([])

      await continueGeneration('nonexistent')

      expect(mockRunAgent).not.toHaveBeenCalled()
      expect(mockStreamChat).not.toHaveBeenCalled()
    })
  })

  describe('Agent 继续模式 (continuable="agent")', () => {
    it('应调用 runAgent 并传入 resume 选项', async () => {
      const existingSteps: AgentStep[] = [
        makeStep({ id: 's1', type: 'thinking', content: '思考', stepIndex: 0 }),
      ]
      const msg = makeMessage({
        id: 'm1',
        role: 'assistant',
        content: '未完成的回复',
        continuable: 'agent',
        agentId: 'test-agent',
        agentSteps: existingSteps,
      })
      mockGetMessages.mockReturnValue([msg])

      await continueGeneration('m1')

      expect(mockRunAgent).toHaveBeenCalledTimes(1)
      const args = mockRunAgent.mock.calls[0]
      // 第 10 个参数（索引 9）应为 ResumeOptions
      const resumeOptions = args[9]
      expect(resumeOptions).toEqual({ resume: true, existingSteps })
    })

    it('应传入空字符串作为 userMessage（resume 模式）', async () => {
      const msg = makeMessage({
        id: 'm1',
        continuable: 'agent',
        agentId: 'test-agent',
        agentSteps: [],
      })
      mockGetMessages.mockReturnValue([msg])

      await continueGeneration('m1')

      const args = mockRunAgent.mock.calls[0]
      // 第 2 个参数（索引 1）为 userMessage
      expect(args[1]).toBe('')
    })

    it('应先标记消息为流式中并清除 continuable', async () => {
      const msg = makeMessage({
        id: 'm1',
        continuable: 'agent',
        agentId: 'test-agent',
        agentSteps: [],
      })
      mockGetMessages.mockReturnValue([msg])

      await continueGeneration('m1')

      // 第一次 updateMessage 调用应标记 isStreaming=true, continuable=null
      const firstUpdate = mockUpdateMessage.mock.calls[0]
      expect(firstUpdate[0]).toBe('m1')
      expect(firstUpdate[1]).toEqual(
        expect.objectContaining({ isStreaming: true, continuable: null }),
      )
    })

    it('Agent 不存在时应标记错误并恢复 continuable', async () => {
      const msg = makeMessage({
        id: 'm1',
        continuable: 'agent',
        agentId: 'nonexistent-agent',
        agentSteps: [],
      })
      mockGetMessages.mockReturnValue([msg])

      await continueGeneration('m1')

      // 应有错误更新：isStreaming=false, isError=true, continuable='agent'
      const errorUpdate = mockUpdateMessage.mock.calls.find(
        (call) => call[1]?.isError === true,
      )
      expect(errorUpdate).toBeDefined()
      expect(errorUpdate[1]).toEqual(
        expect.objectContaining({
          isStreaming: false,
          isError: true,
          continuable: 'agent',
        }),
      )
      expect(mockRunAgent).not.toHaveBeenCalled()
    })

    it('应优先从 workspaceAgents 查找 agent 并调用 runAgent', async () => {
      expect.assertions(1)
      const workspaceAgent: AgentProfile = {
        id: 'ws-agent',
        name: '工作区Agent',
        description: '工作区测试Agent',
        enabled: true,
        planningStrategy: 'react',
        memoryConfig: { historyTurns: 10, longTermEnabled: false, crossSession: false },
        termination: { maxSteps: 5, timeoutSeconds: 60, autoStopOnGoal: false },
        modelConfig: {},
        enabledToolIds: [],
        systemPrompt: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const msg = makeMessage({
        id: 'm1',
        continuable: 'agent',
        agentId: 'ws-agent',
        agentSteps: [],
      })
      mockGetMessages.mockReturnValue([msg])
      // 动态设置 workspaceAgents 包含该 agent
      const { useWorkspaceAgentStore } = require('../stores/workspace-agent-store')
      const originalState = useWorkspaceAgentStore.getState()
      ;(useWorkspaceAgentStore as jest.Mock).mockImplementation(
        (selector?: (s: Record<string, unknown>) => unknown) =>
          selector ? selector({ workspaceAgents: [workspaceAgent] }) : { workspaceAgents: [workspaceAgent] },
      )
      ;(useWorkspaceAgentStore as jest.Mock & { getState: () => Record<string, unknown> }).getState = () => ({
        workspaceAgents: [workspaceAgent],
      })

      await continueGeneration('m1')

      expect(mockRunAgent).toHaveBeenCalledTimes(1)
    })

    it('runAgent 回调应追加步骤、流式内容、推理内容并在最终答案后清除 continuable', async () => {
      expect.assertions(1)
      const existingStep = makeStep({ id: 's1', type: 'thinking', content: '已有步骤', stepIndex: 0 })
      const finalStep = makeStep({ id: 's2', type: 'final_answer', content: '最终步骤', stepIndex: 1 })
      const msg = makeMessage({
        id: 'm1',
        content: '旧内容',
        continuable: 'agent',
        agentId: 'test-agent',
        agentSteps: [existingStep],
      })
      mockGetMessages.mockReturnValue([msg])
      mockRunAgent.mockImplementation(async (...args: unknown[]) => {
        const callbacks = args[6] as Record<string, (...callbackArgs: unknown[]) => unknown>
        callbacks.onStep(finalStep)
        callbacks.onToken('续写')
        callbacks.onReasoningToken('推理')
        callbacks.onDone('完成内容')
      })

      await continueGeneration('m1')

      const finalUpdate = mockUpdateMessage.mock.calls[mockUpdateMessage.mock.calls.length - 1]
      expect(finalUpdate).toEqual([
        'm1',
        {
          content: '完成内容',
          agentSteps: [existingStep, finalStep],
          isStreaming: false,
          reasoningContent: '推理',
          finishReason: 'stop',
          continuable: null,
        },
      ])
    })

    it('runAgent stopped 状态应保持 agent 可继续', async () => {
      expect.assertions(1)
      const msg = makeMessage({
        id: 'm1',
        continuable: 'agent',
        agentId: 'test-agent',
        agentSteps: [],
      })
      mockGetMessages.mockReturnValue([msg])
      mockRunAgent.mockImplementation(async (...args: unknown[]) => {
        const callbacks = args[6] as Record<string, (...callbackArgs: unknown[]) => unknown>
        callbacks.onStatusChange('stopped')
      })

      await continueGeneration('m1')

      expect(mockUpdateMessage.mock.calls).toEqual([
        ['m1', { isStreaming: true, continuable: null }],
        ['m1', { isStreaming: false, continuable: 'agent' }],
      ])
    })

    it('runAgent onReportReady 应标记 hasReport 并保存报告', async () => {
      expect.assertions(2)
      const msg = makeMessage({
        id: 'm1',
        continuable: 'agent',
        agentId: 'test-agent',
        agentSteps: [],
      })
      mockGetMessages.mockReturnValue([msg])
      const { reportStore } = require('../services/report-store')
      mockRunAgent.mockImplementation(async (...args: unknown[]) => {
        const callbacks = args[6] as Record<string, (...callbackArgs: unknown[]) => unknown>
        callbacks.onReportReady('<html>报告</html>')
        callbacks.onDone('完成')
      })

      await continueGeneration('m1')

      expect(mockUpdateMessage.mock.calls).toContainEqual(['m1', { hasReport: true }])
      expect(reportStore.saveReport).toHaveBeenCalledWith('m1', '<html>报告</html>')
    })

    it('runAgent onSiteAnalyzerProgress 应更新进度状态', async () => {
      expect.assertions(1)
      const msg = makeMessage({
        id: 'm1',
        continuable: 'agent',
        agentId: 'test-agent',
        agentSteps: [],
      })
      mockGetMessages.mockReturnValue([msg])
      mockRunAgent.mockImplementation(async (...args: unknown[]) => {
        const callbacks = args[6] as Record<string, (...callbackArgs: unknown[]) => unknown>
        callbacks.onSiteAnalyzerProgress({ type: 'started', url: 'https://example.com' })
        callbacks.onDone('完成')
      })

      await continueGeneration('m1')

      const progressUpdate = mockUpdateMessage.mock.calls.find(
        (call) => call[1]?.siteAnalyzerProgress !== undefined,
      )?.[1]
      expect(progressUpdate?.siteAnalyzerProgress).toEqual({
        type: 'started',
        url: 'https://example.com',
      })
    })

    it('Agent 模式 content 以 abortNotice 结尾时应剥离后再继续', async () => {
      expect.assertions(1)
      const abortNotice = '\n\n> ⚠️ **回复中断**：流连接在生成过程中异常断开，输出可能不完整。请检查网络连接或 API 服务状态。'
      const msg = makeMessage({
        id: 'm1',
        continuable: 'agent',
        agentId: 'test-agent',
        agentSteps: [],
        content: '已有内容' + abortNotice,
      })
      mockGetMessages.mockReturnValue([msg])
      mockRunAgent.mockImplementation(async (...args: unknown[]) => {
        const callbacks = args[6] as Record<string, (...callbackArgs: unknown[]) => unknown>
        callbacks.onToken('续写内容')
        callbacks.onDone('完成')
      })

      await continueGeneration('m1')

      // 验证 runAgent 被调用（说明剥离逻辑执行了）
      expect(mockRunAgent).toHaveBeenCalledTimes(1)
    })
  })

  describe('普通对话继续模式 (continuable="normal")', () => {
    it('应调用 aiService.streamChat', async () => {
      const msg = makeMessage({
        id: 'm1',
        role: 'assistant',
        content: '已有的部分回复',
        continuable: 'normal',
      })
      mockGetMessages.mockReturnValue([msg])

      await continueGeneration('m1')

      expect(mockStreamChat).toHaveBeenCalledTimes(1)
      expect(mockRunAgent).not.toHaveBeenCalled()
    })

    it('应将目标消息内容作为 prefix 传入历史', async () => {
      const existingContent = '已有的部分回复'
      const msg = makeMessage({
        id: 'm1',
        role: 'assistant',
        content: existingContent,
        continuable: 'normal',
      })
      const userMsg = makeMessage({ id: 'u1', role: 'user', content: '问题' })
      mockGetMessages.mockReturnValue([userMsg, msg])

      await continueGeneration('m1')

      const streamArgs = mockStreamChat.mock.calls[0]
      const messages = streamArgs[0] as Message[]
      // 目标消息应保留在历史中，role 为 assistant
      const targetInHistory = messages.find((m) => m.id === 'm1')
      expect(targetInHistory).toBeDefined()
      expect(targetInHistory!.role).toBe('assistant')
      expect(targetInHistory!.content).toBe(existingContent)
    })

    it('应传入空工具列表（tools=[]）', async () => {
      const msg = makeMessage({
        id: 'm1',
        content: '部分回复',
        continuable: 'normal',
      })
      mockGetMessages.mockReturnValue([msg])

      await continueGeneration('m1')

      const streamArgs = mockStreamChat.mock.calls[0]
      // 第 4 个参数（索引 3）为 tools
      expect(streamArgs[3]).toEqual([])
    })

    it('应传入 null 作为 systemPrompt', async () => {
      const msg = makeMessage({
        id: 'm1',
        content: '部分回复',
        continuable: 'normal',
      })
      mockGetMessages.mockReturnValue([msg])

      await continueGeneration('m1')

      const streamArgs = mockStreamChat.mock.calls[0]
      // 第 3 个参数（索引 2）为 systemPrompt
      expect(streamArgs[2]).toBeNull()
    })

    it('streamChat 回调应追加续写内容、推理内容并按 length 保持 normal 可继续', async () => {
      expect.assertions(1)
      const msg = makeMessage({
        id: 'm1',
        role: 'assistant',
        content: '已有回复',
        reasoningContent: '旧推理',
        continuable: 'normal',
      })
      mockGetMessages.mockReturnValue([msg])
      mockStreamChat.mockImplementation(async (...args: unknown[]) => {
        const callbacks = args[5] as Record<string, (...callbackArgs: unknown[]) => unknown>
        callbacks.onToken(' + 续写')
        callbacks.onReasoningToken(' + 新推理')
        callbacks.onDone('length')
      })

      await continueGeneration('m1')

      const finalUpdate = mockUpdateMessage.mock.calls[mockUpdateMessage.mock.calls.length - 1]
      expect(finalUpdate).toEqual([
        'm1',
        {
          content: '已有回复 + 续写',
          isStreaming: false,
          finishReason: 'length',
          continuable: 'normal',
        },
      ])
    })

    it('普通模式 content 以 abortNotice 结尾时应剥离后再续写', async () => {
      expect.assertions(1)
      const abortNotice = '\n\n> ⚠️ **回复中断**：流连接在生成过程中异常断开，输出可能不完整。请检查网络连接或 API 服务状态。'
      const msg = makeMessage({
        id: 'm1',
        role: 'assistant',
        content: '已有回复' + abortNotice,
        continuable: 'normal',
      })
      mockGetMessages.mockReturnValue([msg])
      mockStreamChat.mockImplementation(async (...args: unknown[]) => {
        const callbacks = args[5] as Record<string, (...callbackArgs: unknown[]) => unknown>
        callbacks.onToken(' + 续写')
        callbacks.onDone('stop')
      })

      await continueGeneration('m1')

      // 验证 streamChat 被调用，且传入的历史中目标消息 content 已剥离 abortNotice
      const streamArgs = mockStreamChat.mock.calls[0]
      const messages = streamArgs[0] as Message[]
      const targetInHistory = messages.find((m) => m.id === 'm1')
      expect(targetInHistory!.content).toBe('已有回复')
    })

    it('streamChat onError 应保留已追加内容并恢复 normal 可继续', async () => {
      expect.assertions(1)
      const msg = makeMessage({
        id: 'm1',
        role: 'assistant',
        content: '已有回复',
        continuable: 'normal',
      })
      mockGetMessages.mockReturnValue([msg])
      mockStreamChat.mockImplementation(async (...args: unknown[]) => {
        const callbacks = args[5] as Record<string, (...callbackArgs: unknown[]) => unknown>
        callbacks.onToken(' + 部分')
        callbacks.onError('网络错误')
      })

      await continueGeneration('m1')

      const finalUpdate = mockUpdateMessage.mock.calls[mockUpdateMessage.mock.calls.length - 1]
      expect(finalUpdate).toEqual([
        'm1',
        {
          content: '已有回复 + 部分',
          isStreaming: false,
          isError: true,
          continuable: 'normal',
        },
      ])
    })
  })

  describe('错误处理', () => {
    it('Agent 模式 runAgent 抛出异常时应标记错误并恢复 continuable', async () => {
      const msg = makeMessage({
        id: 'm1',
        continuable: 'agent',
        agentId: 'test-agent',
        agentSteps: [],
      })
      mockGetMessages.mockReturnValue([msg])
      mockRunAgent.mockRejectedValue(new Error('Agent 执行失败'))

      await continueGeneration('m1')

      const errorUpdate = mockUpdateMessage.mock.calls.find(
        (call) => call[1]?.isError === true,
      )
      expect(errorUpdate).toBeDefined()
      expect(errorUpdate[1]).toEqual(
        expect.objectContaining({
          isStreaming: false,
          isError: true,
          continuable: 'agent',
        }),
      )
    })

    it('普通模式 streamChat 抛出异常时应标记错误并恢复 continuable', async () => {
      const msg = makeMessage({
        id: 'm1',
        content: '部分回复',
        continuable: 'normal',
      })
      mockGetMessages.mockReturnValue([msg])
      mockStreamChat.mockRejectedValue(new Error('流式请求失败'))

      await continueGeneration('m1')

      const errorUpdate = mockUpdateMessage.mock.calls.find(
        (call) => call[1]?.isError === true,
      )
      expect(errorUpdate).toBeDefined()
      expect(errorUpdate[1]).toEqual(
        expect.objectContaining({
          isStreaming: false,
          isError: true,
          continuable: 'normal',
        }),
      )
    })
  })
})
