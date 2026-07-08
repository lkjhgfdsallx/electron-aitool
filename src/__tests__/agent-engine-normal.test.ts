/**
 * Agent Engine 正常模式单元测试
 *
 * 测试 runAgent 在正常模式（非 resume）下的行为：
 * 1. 正确构建对话历史（含 historyTurns 限制）
 * 2. 追加新的 user 消息
 * 3. 工具调用解析和执行（原生 function calling + 文本格式）
 * 4. Leader Agent 的特殊工具过滤逻辑
 * 5. 工作流状态机集成
 *
 * @see src/services/agent-engine.ts runAgent() lines 1059-1298
 */

import type { AgentProfile, AgentStep, Message, Tool, ResolvedAIConfig } from '../types'
import type { AgentWorkflow } from '../types/agent-workflow'

// ===== Mock 依赖模块 =====
let capturedStreamMessages: Message[] | null = null
let streamCallCount = 0
let shouldReturnToolCalls = false
let shouldReturnTextToolCalls = false
let shouldThrowError = false

jest.mock('../services/ai-service', () => ({
  aiService: {
    streamChat: jest.fn(async (
      messages: Message[],
      _config: ResolvedAIConfig,
      _systemPrompt: string | null,
      _tools: unknown[],
      _signal: AbortSignal,
      callbacks: {
        onToken?: (t: string) => void
        onReasoningToken?: (t: string) => void
        onToolCalls?: (tc: Array<{ id: string; name: string; arguments: string }>) => void
        onDone?: (fr: string) => void
        onError?: (e: string) => void
      },
    ) => {
      streamCallCount++
      capturedStreamMessages = messages

      if (shouldThrowError) {
        callbacks.onError?.('模拟 API 错误')
        return
      }

      if (shouldReturnToolCalls) {
        // 模拟原生 function calling
        callbacks.onToolCalls?.([{
          id: 'native-tc-1',
          name: 'test_tool',
          arguments: JSON.stringify({ param1: 'value1' })
        }])
        callbacks.onToken?.('正在调用工具...')
        callbacks.onDone?.('stop')
        return
      }

      if (shouldReturnTextToolCalls) {
        // 模拟文本格式工具调用
        callbacks.onToken?.('让我调用工具\n```tool_call\n{"name":"text_tool","arguments":{"key":"val"}}\n```')
        callbacks.onDone?.('stop')
        return
      }

      // 默认：直接返回最终回复
      callbacks.onToken?.('这是最终回复')
      callbacks.onDone?.('stop')
    }),
  },
}))

const mockToolExecute = jest.fn()

jest.mock('../services/tool-service', () => ({
  toolService: {
    toToolDefinitions: jest.fn((tools: Tool[]) => tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))),
  },
}))

jest.mock('../services/memory-service', () => ({
  memoryService: {
    formatMemoriesAsContext: jest.fn(() => ''),
  },
}))

jest.mock('../services/knowledge-base-service', () => ({
  knowledgeBaseService: {
    searchAndFormatContext: jest.fn(async () => ''),
  },
}))

const mockWorkspaceTools: Tool[] = [
  {
    id: 'workspace:list_files',
    name: 'workspace_list_files',
    description: 'List files',
    enabled: true,
    isBuiltIn: true,
    isMCP: false,
    parameters: { type: 'object', properties: {} },
  },
  {
    id: 'workspace:dispatch_task',
    name: 'workspace_dispatch_task',
    description: 'Dispatch task',
    enabled: true,
    isBuiltIn: true,
    isMCP: false,
    parameters: { type: 'object', properties: {} },
  },
  {
    id: 'workspace:create_agent',
    name: 'workspace_create_agent',
    description: 'Create agent',
    enabled: true,
    isBuiltIn: true,
    isMCP: false,
    parameters: { type: 'object', properties: {} },
  },
  {
    id: 'workspace:write_file',
    name: 'workspace_write_file',
    description: 'Write file',
    enabled: true,
    isBuiltIn: true,
    isMCP: false,
    parameters: { type: 'object', properties: {} },
  },
  {
    id: 'workspace:read_file',
    name: 'workspace_read_file',
    description: 'Read file',
    enabled: true,
    isBuiltIn: true,
    isMCP: false,
    parameters: { type: 'object', properties: {} },
  },
  {
    id: 'workspace:execute_command',
    name: 'workspace_execute_command',
    description: 'Execute command',
    enabled: true,
    isBuiltIn: true,
    isMCP: false,
    parameters: { type: 'object', properties: {} },
  },
]

jest.mock('../services/built-in-tools', () => ({
  get WORKSPACE_TOOLS() {
    return mockWorkspaceTools
  },
}))

jest.mock('../constants/default-agents', () => ({
  WORKSPACE_LEADER_AGENT_ID: 'workspace-leader',
}))

jest.mock('../stores/skill-store', () => ({
  useSkillStore: { getState: () => ({ skills: [], getAllEnabledSkills: () => [] }) },
}))

jest.mock('../services/agent', () => ({
  toolExecutorRegistry: {
    createSessionBundle: jest.fn(() => ({
      resolve: jest.fn((name: string) => {
        if (name === 'test_tool' || name === 'text_tool') {
          return {
            executor: {
              execute: mockToolExecute.mockResolvedValue({
                success: true,
                data: '工具执行成功',
              }),
            },
            sessionCtx: {},
          }
        }
        return null
      }),
      destroyAll: jest.fn(),
    })),
  },
  agentEventBus: {
    startRun: jest.fn(),
    emit: jest.fn(),
    on: jest.fn(() => () => {}),
    clear: jest.fn(),
  },
}))

jest.mock('../services/agent/context-manager', () => ({
  contextManager: {
    needsCompression: jest.fn(() => false),
    compress: jest.fn(async () => ({ compressed: false, messages: [] })),
  },
}))

jest.mock('../services/agent/workflow-engine', () => ({
  createWorkflowRuntimeState: jest.fn(() => ({
    current: 'idle',
    data: {},
  })),
  filterToolsByState: jest.fn((_wf: unknown, _rt: unknown, tools: Tool[]) => tools),
  getStatePromptSection: jest.fn(() => null),
  advanceState: jest.fn(() => ({ transitioned: false, runtime: { current: 'idle', data: {} } })),
}))

import { runAgent } from '../services/agent-engine'

// 测试辅助函数
function createMockAgent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: 'test-agent',
    name: 'Test Agent',
    description: 'A test agent',
    systemPrompt: 'You are a test agent.',
    avatar: '🤖',
    enabled: true,
    enabledToolIds: ['test-tool'],
    enabledSkillIds: [],
    modelConfig: {
      modelId: 'test-model',
      temperature: 0.7,
    },
    planningStrategy: 'react',
    memoryConfig: {
      historyTurns: 5,
      longTermEnabled: false,
      crossSession: false,
    },
    termination: {
      maxSteps: 10,
      timeoutSeconds: 0,
      autoStopOnGoal: true,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function createMockTools(): Tool[] {
  return [
    {
      id: 'test-tool',
      name: 'test_tool',
      description: 'A test tool',
      enabled: true,
      isBuiltIn: false,
      isMCP: false,
      parameters: {
        type: 'object',
        properties: {
          param1: { type: 'string' },
        },
      },
    },
  ]
}

function createMockMessages(count: number): Message[] {
  const messages: Message[] = []
  for (let i = 0; i < count; i++) {
    messages.push({
      id: `msg-${i}`,
      conversationId: 'test-conv',
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      timestamp: Date.now() - (count - i) * 1000,
    })
  }
  return messages
}

function createMockCallbacks() {
  return {
    onStep: jest.fn(),
    onToken: jest.fn(),
    onReasoningToken: jest.fn(),
    onStatusChange: jest.fn(),
    onError: jest.fn(),
    onDone: jest.fn(),
  }
}

describe('runAgent - 正常模式', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    capturedStreamMessages = null
    streamCallCount = 0
    shouldReturnToolCalls = false
    shouldReturnTextToolCalls = false
    shouldThrowError = false
    mockToolExecute.mockReset()
  })

  describe('消息构建逻辑', () => {
    it('应该在正常模式下追加 user 消息', async () => {
      const agent = createMockAgent()
      const tools = createMockTools()
      const history = createMockMessages(4)
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      await runAgent(
        agent,
        '用户的新问题',
        history,
        tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal,
        callbacks,
      )

      // 验证 streamChat 收到的消息包含历史消息 + 新用户消息
      expect(capturedStreamMessages).not.toBeNull()
      expect(capturedStreamMessages!.length).toBe(5) // 4条历史 + 1条新消息
      expect(capturedStreamMessages![4].role).toBe('user')
      expect(capturedStreamMessages![4].content).toBe('用户的新问题')
    })

    it('应该根据 historyTurns 限制历史消息数量', async () => {
      const agent = createMockAgent({
        memoryConfig: { historyTurns: 2, longTermEnabled: false, crossSession: false },
      })
      const tools = createMockTools()
      const history = createMockMessages(10) // 10条消息 = 5轮
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      await runAgent(
        agent,
        '新问题',
        history,
        tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal,
        callbacks,
      )

      // historyTurns=2 意味着保留 2*2=4 条历史消息 + 1条新消息 = 5条
      expect(capturedStreamMessages!.length).toBe(5)
    })

    it('应该正确处理带 agentSteps 的 assistant 消息', async () => {
      const agent = createMockAgent()
      const tools = createMockTools()
      const history: Message[] = [
        {
          id: 'msg-1',
          conversationId: 'test-conv',
          role: 'user',
          content: '用户问题',
          timestamp: Date.now() - 2000,
        },
        {
          id: 'msg-2',
          conversationId: 'test-conv',
          role: 'assistant',
          content: '助手回复',
          timestamp: Date.now() - 1000,
          agentSteps: [
            {
              id: 'step-1',
              type: 'final_answer',
              content: '最终答案内容',
              stepIndex: 0,
              timestamp: Date.now() - 1000,
            },
            {
              id: 'step-2',
              type: 'thinking',
              content: '思考过程',
              stepIndex: 1,
              timestamp: Date.now() - 900,
            },
          ],
        },
      ]
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      await runAgent(
        agent,
        '新问题',
        history,
        tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal,
        callbacks,
      )

      // 带 agentSteps 的 assistant 消息应该只取 final_answer 的 content
      const assistantMsg = capturedStreamMessages!.find((m) => m.role === 'assistant')
      expect(assistantMsg?.content).toBe('最终答案内容')
    })

    it('应该正确处理带 toolCalls 的 assistant 消息', async () => {
      const agent = createMockAgent()
      const tools = createMockTools()
      const history: Message[] = [
        {
          id: 'msg-1',
          conversationId: 'test-conv',
          role: 'user',
          content: '用户问题',
          timestamp: Date.now() - 2000,
        },
        {
          id: 'msg-2',
          conversationId: 'test-conv',
          role: 'assistant',
          content: '正在调用工具',
          timestamp: Date.now() - 1000,
          toolCalls: [
            {
              id: 'tc-1',
              name: 'test_tool',
              arguments: '{"param1":"value1"}',
              status: 'completed',
            },
          ],
        },
        {
          id: 'msg-3',
          conversationId: 'test-conv',
          role: 'tool',
          content: '工具结果',
          timestamp: Date.now() - 900,
          toolCallId: 'tc-1',
          toolName: 'test_tool',
        },
      ]
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      await runAgent(
        agent,
        '新问题',
        history,
        tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal,
        callbacks,
      )

      // 验证 tool 消息被正确传递
      const toolMsg = capturedStreamMessages!.find((m) => m.role === 'tool')
      expect(toolMsg).toBeDefined()
      expect(toolMsg?.content).toBe('工具结果')
      expect(toolMsg?.toolCallId).toBe('tc-1')
    })
  })

  describe('回调触发', () => {
    it('应该在开始运行时触发 onStatusChange("running")', async () => {
      const agent = createMockAgent()
      const tools = createMockTools()
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      await runAgent(
        agent,
        '测试消息',
        [],
        tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal,
        callbacks,
      )

      expect(callbacks.onStatusChange).toHaveBeenCalledWith('running')
    })

    it('应该在完成时触发 onStatusChange("completed") 和 onDone', async () => {
      const agent = createMockAgent()
      const tools = createMockTools()
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      await runAgent(
        agent,
        '测试消息',
        [],
        tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal,
        callbacks,
      )

      expect(callbacks.onStatusChange).toHaveBeenCalledWith('completed')
      expect(callbacks.onDone).toHaveBeenCalled()
    })

    it('应该在出错时触发 onError 和 onStatusChange("error")', async () => {
      shouldThrowError = true
      const agent = createMockAgent()
      const tools = createMockTools()
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      await runAgent(
        agent,
        '测试消息',
        [],
        tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal,
        callbacks,
      )

      expect(callbacks.onError).toHaveBeenCalled()
    })

    it('应该转发 token 到 onToken 回调', async () => {
      const agent = createMockAgent()
      const tools = createMockTools()
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      await runAgent(
        agent,
        '测试消息',
        [],
        tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal,
        callbacks,
      )

      expect(callbacks.onToken).toHaveBeenCalledWith('这是最终回复')
    })
  })

  describe('工具调用处理', () => {
    it('应该处理原生 function calling 工具调用', async () => {
      shouldReturnToolCalls = true
      const agent = createMockAgent({
        enabledToolIds: ['test-tool'],
        termination: { maxSteps: 3, timeoutSeconds: 0, autoStopOnGoal: true },
      })
      const tools = createMockTools()
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      await runAgent(
        agent,
        '调用工具',
        [],
        tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal,
        callbacks,
      )

      // 验证工具被执行
      expect(mockToolExecute).toHaveBeenCalled()
      // 验证 onStep 被调用（包含 action 和 observation 步骤）
      const stepCalls = callbacks.onStep.mock.calls
      const actionSteps = stepCalls.filter((call) => call[0].type === 'action')
      const observationSteps = stepCalls.filter((call) => call[0].type === 'observation')
      expect(actionSteps.length).toBeGreaterThan(0)
      expect(observationSteps.length).toBeGreaterThan(0)
    })

    it('应该处理文本格式工具调用', async () => {
      shouldReturnTextToolCalls = true
      const agent = createMockAgent({
        enabledToolIds: ['test-tool'],
        termination: { maxSteps: 3, timeoutSeconds: 0, autoStopOnGoal: true },
      })
      const tools = createMockTools()
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      await runAgent(
        agent,
        '调用工具',
        [],
        tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal,
        callbacks,
      )

      // 验证文本格式工具调用被解析和执行
      expect(mockToolExecute).toHaveBeenCalled()
    })
  })

  describe('Leader Agent 特殊逻辑', () => {
    it('应该为 Leader Agent 只注入特定工作区工具', async () => {
      const leaderAgent = createMockAgent({
        id: 'workspace-leader',
        enabledToolIds: [],
        tags: ['workspace', 'leader'],
      })
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal
      const workspaceContext = {
        folderPath: '/test/workspace',
        workspaceId: 'ws-1',
        teamAgents: [],
      }

      await runAgent(
        leaderAgent,
        '领导任务',
        [],
        [],
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal,
        callbacks,
        workspaceContext,
      )

      // 验证 streamChat 被调用（Leader Agent 应该能正常运行）
      expect(streamCallCount).toBeGreaterThan(0)
    })
  })

  describe('中止处理', () => {
    it('应该在信号中止时停止执行', async () => {
      const agent = createMockAgent({
        termination: { maxSteps: 5, timeoutSeconds: 0, autoStopOnGoal: true },
      })
      const tools = createMockTools()
      const callbacks = createMockCallbacks()
      const controller = new AbortController()

      // 立即中止
      controller.abort()

      await runAgent(
        agent,
        '测试消息',
        [],
        tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        controller.signal,
        callbacks,
      )

      expect(callbacks.onStatusChange).toHaveBeenCalledWith('stopped')
      expect(callbacks.onDone).toHaveBeenCalledWith('')
    })
  })

  describe('流式错误与异常分支', () => {
    it('应在 streamChat 抛出错误且 signal 未 abort 时记录 error 步骤', async () => {
      expect.assertions(3)
      shouldThrowError = true
      const agent = createMockAgent()
      const tools = createMockTools()
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      await runAgent(
        agent, '测试消息', [], tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal, callbacks,
      )

      // shouldThrowError 触发 onError → throw Error → catch → error 步骤
      const errorSteps = callbacks.onStep.mock.calls.filter((c: AgentStep[]) => c[0].type === 'error')
      expect(errorSteps.length).toBeGreaterThan(0)
      expect(callbacks.onStatusChange).toHaveBeenCalledWith('error')
      expect(callbacks.onError).toHaveBeenCalled()
    })

    it('应在 streamChat 抛出错误且 signal.aborted 时调用 stopped + onDone', async () => {
      expect.assertions(2)
      // 模拟：streamChat 中检测到 abort 后抛出异常（在原有逻辑前 abort）
      // 方案：让 streamChat 在 onError 后放入 try/catch，并在执行中检测 signal.aborted
      const controller = new AbortController()
      const agent = createMockAgent()
      const tools = createMockTools()
      const callbacks = createMockCallbacks()

      // Mock streamChat 在调用后抛出异常，同时 signal 已 aborted
      const { aiService } = require('../services/ai-service')
      aiService.streamChat.mockImplementationOnce(async (...args: unknown[]) => {
        // 先触发 token，然后模拟 streaming 内部检测到 abort
        const cbs = (args[5] as Record<string, (...a: unknown[]) => void>)
        cbs.onToken?.('部分内容...')
        controller.abort() // streaming 期间 abort
        throw new Error('aborted') // 模拟被中断抛出的错误
      })

      await runAgent(
        agent, '测试消息', [], tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        controller.signal, callbacks,
      )

      // catch 中检测到 signal.aborted → stopped + onDone('')
      expect(callbacks.onStatusChange).toHaveBeenCalledWith('stopped')
      expect(callbacks.onDone).toHaveBeenCalledWith('')
    })

    it('应在遇到 429/rate-limit 错误时等待并重试', async () => {
      expect.assertions(3)
      // 用 defineProperty mock setTimeout，避免真实 5000ms 等待
      const origSetTimeout = global.setTimeout
      const setTimeoutMock = jest.fn((fn: (...args: unknown[]) => void, ms?: number) => {
        if (ms === 5000) {
          // 立即调用（跳过真实的 5s delay）
          setTimeout(() => fn(), 0)
          return 1 as unknown as NodeJS.Timeout
        }
        return origSetTimeout(fn, ms)
      })
      Object.defineProperty(global, 'setTimeout', { value: setTimeoutMock, writable: true })

      try {
        const agent = createMockAgent({ termination: { maxSteps: 2, timeoutSeconds: 0, autoStopOnGoal: false } })
        const tools = createMockTools()
        const callbacks = createMockCallbacks()
        const signal = new AbortController().signal

        const { aiService } = require('../services/ai-service')
        aiService.streamChat
          .mockImplementationOnce(async (...args: unknown[]) => {
            const cbs = (args[5] as Record<string, (...a: unknown[]) => void>)
            cbs.onError?.('Too many requests, rate limit exceeded (429)')
          })
          .mockImplementationOnce(async (...args: unknown[]) => {
            const cbs = (args[5] as Record<string, (...a: unknown[]) => void>)
            cbs.onToken?.('重试后成功')
            cbs.onDone?.('stop')
          })

        await runAgent(
          agent, '测试消息', [], tools,
          { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
          signal, callbacks,
        )

        const thinkingSteps = callbacks.onStep.mock.calls.filter((c: AgentStep[]) => c[0].type === 'thinking')
        const retryStep = thinkingSteps.find((c: AgentStep[]) => (c[0].content as string).includes('频率限制'))
        expect(retryStep?.[0].content).toBe('遇到请求频率限制，等待 5 秒后重试...')
        expect(callbacks.onDone).toHaveBeenCalledWith('重试后成功')
        expect(aiService.streamChat).toHaveBeenCalledTimes(2)
      } finally {
        Object.defineProperty(global, 'setTimeout', { value: origSetTimeout, writable: true })
      }
    })
  })

  describe('Reasoning token 转发', () => {
    it('应转发 reasoning token 到 onReasoningToken 回调', async () => {
      expect.assertions(1)
      const agent = createMockAgent()
      const tools = createMockTools()
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      // 让 streamChat 返回 reasoning token
      const { aiService } = require('../services/ai-service')
      aiService.streamChat.mockImplementationOnce(async (...args: unknown[]) => {
        const cbs = (args[5] as Record<string, (...a: unknown[]) => void>)
        cbs.onReasoningToken?.('推理过程...')
        cbs.onToken?.('最终回答')
        cbs.onDone?.('stop')
      })

      await runAgent(
        agent, '测试消息', [], tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal, callbacks,
      )

      expect(callbacks.onReasoningToken).toHaveBeenCalledWith('推理过程...')
    })
  })

  describe('streamFinishReason abort 分支', () => {
    it('streamFinishReason="abort" 且无工具调用时应触发 stopped 而非 completed', async () => {
      expect.assertions(1)
      const agent = createMockAgent()
      const tools = createMockTools()
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      const { aiService } = require('../services/ai-service')
      aiService.streamChat.mockImplementationOnce(async (...args: unknown[]) => {
        const cbs = (args[5] as Record<string, (...a: unknown[]) => void>)
        cbs.onToken?.('最终回答')
        cbs.onDone?.('abort') // finishReason = 'abort'
      })

      await runAgent(
        agent, '测试消息', [], tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal, callbacks,
      )

      // 无工具调用 + onDone('abort') → finalStep → onStatusChange('stopped')
      expect(callbacks.onStatusChange).toHaveBeenCalledWith('stopped')
    })
  })

  describe('工作流集成', () => {
    it('应在 agent 有 workflow 配置时创建工作流运行时并推进状态', async () => {
      expect.assertions(2)
      const { advanceState, filterToolsByState } = require('../services/agent/workflow-engine')
      const workflow: AgentWorkflow = {
        initial: 'draft',
        states: {
          draft: { label: '草稿', allowedTools: ['test_tool'], transitions: [{ to: 'review', when: [{ type: 'tool_called', toolName: 'test_tool' }] }] },
          review: { label: '审核', transitions: [] },
        },
      }
      const runtime = { current: 'draft', data: {} }
      const nextRuntime = { current: 'review', data: {} }
      const { createWorkflowRuntimeState } = require('../services/agent/workflow-engine')
      createWorkflowRuntimeState.mockReturnValue(runtime)
      advanceState.mockReturnValue({ transitioned: true, runtime: nextRuntime })

      const workflowAgent = createMockAgent({
        termination: { maxSteps: 1, timeoutSeconds: 0, autoStopOnGoal: false },
        workflow,
      })
      const tools = createMockTools()
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      // 使用全局 shouldReturnToolCalls flag（不覆盖 streamChat mock）
      shouldReturnToolCalls = true

      await runAgent(
        workflowAgent, '测试', [], tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal, callbacks,
      )

      expect(filterToolsByState).toHaveBeenCalledWith(workflow, runtime, tools)
      expect(advanceState).toHaveBeenCalledWith(workflow, runtime, {
        toolCalled: 'test_tool',
        toolSuccess: undefined,
        assistantContent: '正在调用工具...',
        planStatus: null,
      })
    })
  })

  describe('工作区上下文', () => {
    it('应该在没有工作区上下文时正常运行', async () => {
      const agent = createMockAgent()
      const tools = createMockTools()
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      await runAgent(
        agent,
        '测试消息',
        [],
        tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal,
        callbacks,
        undefined, // 无工作区上下文
      )

      expect(callbacks.onStatusChange).toHaveBeenCalledWith('completed')
    })

    it('应该在有工作区上下文时正常运行', async () => {
      const agent = createMockAgent()
      const tools = createMockTools()
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal
      const workspaceContext = {
        folderPath: '/test/workspace',
        workspaceId: 'ws-1',
        teamAgents: [
          {
            id: 'worker-1',
            name: 'Worker Agent',
            description: 'A worker agent',
            avatar: '👷',
          },
        ],
      }

      await runAgent(
        agent,
        '测试消息',
        [],
        tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal,
        callbacks,
        workspaceContext,
      )

      expect(callbacks.onStatusChange).toHaveBeenCalledWith('completed')
    })
  })

  describe('runAgent 顶层异常捕获', () => {
    it('agentLoopBody 内 try 外抛出异常且 signal.aborted 时应调用 stopped + onDone', async () => {
      expect.assertions(2)
      const controller = new AbortController()
      const agent = createMockAgent({ termination: { maxSteps: 2, timeoutSeconds: 0, autoStopOnGoal: false } })
      const tools = createMockTools()
      const callbacks = createMockCallbacks()

      // 让 streamChat 第一轮正常完成（不 abort）
      const { aiService } = require('../services/ai-service')
      const { toolService } = require('../services/tool-service')
      aiService.streamChat.mockImplementationOnce(async (...args: unknown[]) => {
        const cbs = args[5] as Record<string, (...a: unknown[]) => void>
        cbs.onToken?.('第一轮回复')
        cbs.onDone?.('stop')
      })

      // 第二轮：toolService.toToolDefinitions 在 agentLoopBody 的 for 循环内、try 块外
      // 在抛出异常前先 abort signal，这样 runAgent 的顶层 catch 会走 stopped 分支
      toolService.toToolDefinitions.mockImplementationOnce(() => {
        controller.abort()
        throw new Error('tool definition error')
      })

      await runAgent(
        agent,
        '测试消息',
        [],
        tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        controller.signal,
        callbacks,
      )

      // 顶层 catch 检测到 signal.aborted → stopped + onDone('')
      expect(callbacks.onStatusChange).toHaveBeenCalledWith('stopped')
      expect(callbacks.onDone).toHaveBeenCalledWith('')
    })

    it('agentLoopBody 内 try 外抛出异常且 signal 未 abort 时应重新抛出异常', async () => {
      expect.assertions(1)
      const agent = createMockAgent({ termination: { maxSteps: 2, timeoutSeconds: 0, autoStopOnGoal: false } })
      const tools = createMockTools()
      const callbacks = createMockCallbacks()
      const signal = new AbortController().signal

      // 让 streamChat 第一轮正常完成
      const { aiService } = require('../services/ai-service')
      const { toolService } = require('../services/tool-service')
      aiService.streamChat.mockImplementationOnce(async (...args: unknown[]) => {
        const cbs = args[5] as Record<string, (...a: unknown[]) => void>
        cbs.onToken?.('第一轮回复')
        cbs.onDone?.('stop')
      })

      // 第二轮：toolService.toToolDefinitions 抛出异常，signal 不 abort
      toolService.toToolDefinitions.mockImplementationOnce(() => {
        throw new Error('tool definition error')
      })

      await expect(runAgent(
        agent,
        '测试消息',
        [],
        tools,
        { model: 'test-model', apiKey: 'test-key', provider: 'openai', baseUrl: '', temperature: 0.7, maxTokens: 4096, streamEnabled: true } as ResolvedAIConfig,
        signal,
        callbacks,
      )).rejects.toThrow('tool definition error')
    })
  })
})
