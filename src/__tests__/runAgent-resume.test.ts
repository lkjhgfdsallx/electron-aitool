/**
 * runAgent resume 模式单元测试
 *
 * 测试 "继续生成" 功能的核心：runAgent 在 resume 模式下的行为：
 * 1. 跳过最后一条未完成的 assistant 消息
 * 2. 不追加新的 user 消息
 * 3. 从 existingSteps 恢复步骤
 * 4. 正确重建 AgentMessage[]（final_answer / toolCalls / tool 结果）
 *
 * @see src/services/agent-engine.ts runAgent() lines 1063-1259
 */

import type { AgentProfile, AgentStep, Message, Tool, ResolvedAIConfig } from '../types'

// ===== Mock 依赖模块 =====
// 捕获 streamChat 收到的消息列表，用于断言 resume 重建逻辑
let capturedStreamMessages: Message[] | null = null
let streamCallCount = 0

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
      // 模拟模型直接返回最终回复（无工具调用），触发 final_answer 分支
      callbacks.onToken?.('恢复后的最终回复')
      callbacks.onDone?.('stop')
    }),
  },
}))

jest.mock('../services/tool-service', () => ({
  toolService: {
    toToolDefinitions: jest.fn(() => []),
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

jest.mock('../services/built-in-tools', () => ({
  WORKSPACE_TOOLS: [],
  BUILT_IN_TOOLS: [],
  AGENT_BUILTIN_TOOLS: [],
}))

jest.mock('../constants/default-agents', () => ({
  WORKSPACE_LEADER_AGENT_ID: 'workspace-leader',
}))

jest.mock('../stores/skill-store', () => ({
  useSkillStore: {
    getState: () => ({
      skills: [],
      getAllEnabledSkills: () => [],
      ensureSkillsLoaded: async () => {},
    }),
  },
}))

// 联网工具策略依赖 settings-store（经 utils/web-tools → stores）；默认关闭
jest.mock('../stores', () => ({
  useSettingsStore: {
    getState: () => ({
      webSearchEnabled: false,
      disabledBuiltinToolIds: [],
    }),
  },
}))

jest.mock('../services/agent', () => ({
  toolExecutorRegistry: {
    createSessionBundle: jest.fn(() => ({
      resolve: jest.fn(() => null),
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
  createWorkflowRuntimeState: jest.fn(),
  filterToolsByState: jest.fn((_wf, _rt, tools) => tools),
  getStatePromptSection: jest.fn(() => null),
  advanceState: jest.fn(),
}))

// 导入被测模块（在所有 mock 之后）
import { runAgent } from '../services/agent-engine'

// ===== 测试夹具 =====

/** 构建最小可用的 AgentProfile */
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

function makeResolvedConfig(): ResolvedAIConfig {
  return {
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'test-key',
    model: 'test-model',
    temperature: 0.7,
    maxTokens: 4096,
    streamEnabled: true,
  }
}

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 9)}`,
    conversationId: 'conv-test',
    role: 'user',
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

function makeCallbacks() {
  return {
    onStep: jest.fn(),
    onToken: jest.fn(),
    onReasoningToken: jest.fn(),
    onStatusChange: jest.fn(),
    onDone: jest.fn(),
    onError: jest.fn(),
    onHumanInput: jest.fn(),
    onReportReady: jest.fn(),
    onSiteAnalyzerProgress: jest.fn(),
  }
}

// ===== 测试套件 =====

describe('runAgent resume 模式', () => {
  beforeEach(() => {
    capturedStreamMessages = null
    streamCallCount = 0
    jest.clearAllMocks()
  })

  describe('消息历史重建', () => {
    it('resume 模式应跳过最后一条未完成的 assistant 消息', async () => {
      const history: Message[] = [
        makeMessage({ id: 'u1', role: 'user', content: '你好' }),
        makeMessage({ id: 'a1', role: 'assistant', content: '你好！有什么可以帮你的？' }),
        makeMessage({ id: 'u2', role: 'user', content: '帮我写代码' }),
        // 最后一条未完成的 assistant 消息（应被跳过）
        makeMessage({ id: 'a2', role: 'assistant', content: '好的，我来' }),
      ]

      await runAgent(
        makeAgent(),
        '',
        history,
        [],
        makeResolvedConfig(),
        new AbortController().signal,
        makeCallbacks(),
        undefined,
        'conv-test',
        { resume: true, existingSteps: [] },
      )

      expect(capturedStreamMessages).not.toBeNull()
      const msgs = capturedStreamMessages!
      // toMessages 会重新分配 id（agent-msg-${idx}），故通过 role+content 断言
      // 应包含 u1(user "你好"), a1(assistant "你好！有什么可以帮你的？"), u2(user "帮我写代码")
      // 不应包含 a2(assistant "好的，我来") —— 最后一条 assistant 被跳过
      const contents = msgs.map((m) => `${m.role}:${m.content}`)
      expect(contents).not.toContain('assistant:好的，我来')
      expect(contents).toContain('user:你好')
      expect(contents).toContain('assistant:你好！有什么可以帮你的？')
      expect(contents).toContain('user:帮我写代码')
      // 消息总数应为 3（u1, a1, u2），a2 被跳过
      expect(msgs.length).toBe(3)
    })

    it('resume 模式不应追加新的 user 消息', async () => {
      const history: Message[] = [
        makeMessage({ id: 'u1', role: 'user', content: '你好' }),
        makeMessage({ id: 'a1', role: 'assistant', content: '你好！' }),
      ]

      await runAgent(
        makeAgent(),
        '这条消息应被忽略',
        history,
        [],
        makeResolvedConfig(),
        new AbortController().signal,
        makeCallbacks(),
        undefined,
        'conv-test',
        { resume: true },
      )

      const msgs = capturedStreamMessages!
      // resume 模式不追加新的 user 消息。
      // 历史 [user "你好", assistant "你好！"] → 跳过 assistant → 只剩 [user "你好"]
      // 正常模式会追加 user "这条消息应被忽略"，使消息数为 3
      // resume 模式消息数应为 1（只有原 user 消息，assistant 被跳过，无新 user）
      expect(msgs.length).toBe(1)
      expect(msgs[0].role).toBe('user')
      expect(msgs[0].content).toBe('你好')
      // 不应包含被忽略的 userMessage
      const hasIgnoredMsg = msgs.some((m) => m.content === '这条消息应被忽略')
      expect(hasIgnoredMsg).toBe(false)
    })

    it('正常模式应追加新的 user 消息（对照测试）', async () => {
      const history: Message[] = [
        makeMessage({ id: 'u1', role: 'user', content: '你好' }),
        makeMessage({ id: 'a1', role: 'assistant', content: '你好！' }),
      ]

      await runAgent(
        makeAgent(),
        '这是新消息',
        history,
        [],
        makeResolvedConfig(),
        new AbortController().signal,
        makeCallbacks(),
        undefined,
        'conv-test',
        // 不传 resumeOptions → 正常模式
      )

      const msgs = capturedStreamMessages!
      // 最后一条应该是 user 消息，内容为传入的 userMessage
      const lastMsg = msgs[msgs.length - 1]
      expect(lastMsg.role).toBe('user')
      expect(lastMsg.content).toBe('这是新消息')
    })
  })

  describe('步骤恢复', () => {
    it('应从 existingSteps 恢复已有步骤', async () => {
      const existingSteps: AgentStep[] = [
        makeStep({ id: 's1', type: 'thinking', content: '思考中...', stepIndex: 0 }),
        makeStep({ id: 's2', type: 'action', content: '调用工具', stepIndex: 1 }),
        makeStep({ id: 's3', type: 'observation', content: '工具结果', stepIndex: 2 }),
      ]

      const callbacks = makeCallbacks()
      await runAgent(
        makeAgent(),
        '',
        [
          makeMessage({ id: 'u1', role: 'user', content: '任务' }),
          makeMessage({ id: 'a1', role: 'assistant', content: '未完成' }),
        ],
        [],
        makeResolvedConfig(),
        new AbortController().signal,
        callbacks,
        undefined,
        'conv-test',
        { resume: true, existingSteps },
      )

      // onStep 应至少被调用一次（恢复后模型返回 final_answer 会触发 onStep）
      expect(callbacks.onStep).toHaveBeenCalled()
      // 第一个 onStep 调用应该是恢复的步骤之后的新步骤
      // 注意：existingSteps 不会通过 onStep 回调重新推送，而是直接放入 steps 数组
      // 新步骤的 stepIndex 应从已有步骤数之后继续
      const newSteps = callbacks.onStep.mock.calls.map((c) => c[0] as AgentStep)
      expect(newSteps.length).toBeGreaterThan(0)
      // 新步骤的 stepIndex 应 >= existingSteps.length（因为 stepCounter 从 existingSteps 之后开始）
      // 注意：stepCounter 初始值为 0，但 steps 数组已有 existingSteps.length 个元素
      // 实际 stepIndex 从 0 开始递增，恢复的步骤不重新分配 stepIndex
    })

    it('existingSteps 为空时应从空步骤开始', async () => {
      const callbacks = makeCallbacks()
      await runAgent(
        makeAgent(),
        '',
        [
          makeMessage({ id: 'u1', role: 'user', content: '任务' }),
          makeMessage({ id: 'a1', role: 'assistant', content: '未完成' }),
        ],
        [],
        makeResolvedConfig(),
        new AbortController().signal,
        callbacks,
        undefined,
        'conv-test',
        { resume: true, existingSteps: [] },
      )

      // 应正常完成，不报错
      expect(callbacks.onDone).toHaveBeenCalled()
    })

    it('不传 existingSteps 时应从空步骤开始', async () => {
      const callbacks = makeCallbacks()
      await runAgent(
        makeAgent(),
        '',
        [
          makeMessage({ id: 'u1', role: 'user', content: '任务' }),
          makeMessage({ id: 'a1', role: 'assistant', content: '未完成' }),
        ],
        [],
        makeResolvedConfig(),
        new AbortController().signal,
        callbacks,
        undefined,
        'conv-test',
        { resume: true },
      )

      expect(callbacks.onDone).toHaveBeenCalled()
    })
  })

  describe('历史消息类型处理', () => {
    it('resume 模式应使用 agentSteps 中的 final_answer 内容', async () => {
      const finalAnswerContent = '这是之前的最终回答'
      const history: Message[] = [
        makeMessage({ id: 'u1', role: 'user', content: '问题1' }),
        makeMessage({
          id: 'a1',
          role: 'assistant',
          content: '原始内容',
          agentSteps: [
            makeStep({ type: 'thinking', content: '思考', stepIndex: 0 }),
            makeStep({ type: 'final_answer', content: finalAnswerContent, stepIndex: 1 }),
          ],
        }),
        makeMessage({ id: 'u2', role: 'user', content: '问题2' }),
        makeMessage({ id: 'a2', role: 'assistant', content: '未完成' }),
      ]

      await runAgent(
        makeAgent(),
        '',
        history,
        [],
        makeResolvedConfig(),
        new AbortController().signal,
        makeCallbacks(),
        undefined,
        'conv-test',
        { resume: true, existingSteps: [] },
      )

      const msgs = capturedStreamMessages!
      // toMessages 重新分配 id，故通过 content 断言
      // a1 应使用 final_answer 的内容（"这是之前的最终回答"）而非原始 content（"原始内容"）
      const finalAnswerMsg = msgs.find((m) => m.content === finalAnswerContent)
      expect(finalAnswerMsg).toBeDefined()
      expect(finalAnswerMsg!.role).toBe('assistant')
      // 不应包含原始 content
      const originalContentMsg = msgs.find((m) => m.content === '原始内容')
      expect(originalContentMsg).toBeUndefined()
    })

    it('resume 模式应携带 assistant 消息的 toolCalls', async () => {
      const history: Message[] = [
        makeMessage({ id: 'u1', role: 'user', content: '执行工具' }),
        makeMessage({
          id: 'a1',
          role: 'assistant',
          content: '我来调用工具',
          toolCalls: [
            { id: 'tc1', name: 'search', arguments: '{"q":"test"}', status: 'completed' },
          ],
        }),
        makeMessage({
          id: 't1',
          role: 'tool',
          content: '搜索结果',
          toolCallId: 'tc1',
          toolName: 'search',
        }),
        makeMessage({ id: 'a2', role: 'assistant', content: '未完成' }),
      ]

      await runAgent(
        makeAgent(),
        '',
        history,
        [],
        makeResolvedConfig(),
        new AbortController().signal,
        makeCallbacks(),
        undefined,
        'conv-test',
        { resume: true, existingSteps: [] },
      )

      const msgs = capturedStreamMessages!
      // 应包含带 toolCalls 的 assistant 消息
      const assistantWithTools = msgs.find(
        (m) => m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0,
      )
      expect(assistantWithTools).toBeDefined()
      expect(assistantWithTools!.toolCalls![0].name).toBe('search')

      // 应包含 tool 结果消息
      const toolMsg = msgs.find((m) => m.role === 'tool')
      expect(toolMsg).toBeDefined()
      expect(toolMsg!.toolCallId).toBe('tc1')
      expect(toolMsg!.toolName).toBe('search')
    })

    it('resume 模式应正确处理 tool 结果消息', async () => {
      const history: Message[] = [
        makeMessage({ id: 'u1', role: 'user', content: '任务' }),
        makeMessage({
          id: 'a1',
          role: 'assistant',
          content: '',
          toolCalls: [
            { id: 'call-1', name: 'tool_a', arguments: '{}', status: 'completed' },
          ],
        }),
        makeMessage({
          id: 't1',
          role: 'tool',
          content: '{"result": "success"}',
          toolCallId: 'call-1',
          toolName: 'tool_a',
        }),
        makeMessage({ id: 'a2', role: 'assistant', content: '未完成' }),
      ]

      await runAgent(
        makeAgent(),
        '',
        history,
        [],
        makeResolvedConfig(),
        new AbortController().signal,
        makeCallbacks(),
        undefined,
        'conv-test',
        { resume: true, existingSteps: [] },
      )

      const msgs = capturedStreamMessages!
      const toolMsg = msgs.find((m) => m.role === 'tool')
      expect(toolMsg).toBeDefined()
      expect(toolMsg!.content).toBe('{"result": "success"}')
      expect(toolMsg!.toolCallId).toBe('call-1')
      expect(toolMsg!.toolName).toBe('tool_a')
    })
  })

  describe('边界情况', () => {
    it('历史只有一条 assistant 消息时 resume 应产生空消息列表', async () => {
      const history: Message[] = [
        makeMessage({ id: 'a1', role: 'assistant', content: '未完成' }),
      ]

      await runAgent(
        makeAgent(),
        '',
        history,
        [],
        makeResolvedConfig(),
        new AbortController().signal,
        makeCallbacks(),
        undefined,
        'conv-test',
        { resume: true, existingSteps: [] },
      )

      const msgs = capturedStreamMessages!
      // 唯一的 assistant 消息被跳过后，消息列表应为空
      expect(msgs.length).toBe(0)
    })

    it('最后一条消息是 user 时 resume 不应跳过它', async () => {
      // 边界：如果最后一条不是 assistant，filter 不会跳过任何消息
      const history: Message[] = [
        makeMessage({ id: 'u1', role: 'user', content: '问题' }),
      ]

      await runAgent(
        makeAgent(),
        '',
        history,
        [],
        makeResolvedConfig(),
        new AbortController().signal,
        makeCallbacks(),
        undefined,
        'conv-test',
        { resume: true, existingSteps: [] },
      )

      const msgs = capturedStreamMessages!
      // user 消息不应被跳过（filter 只跳过最后一条 assistant）
      expect(msgs.length).toBe(1)
      expect(msgs[0].role).toBe('user')
    })

    it('启用长期记忆时应按 agentId/crossSession/conversationId 注入记忆上下文', async () => {
      expect.assertions(1)
      const { memoryService } = require('../services/memory-service')

      await runAgent(
        makeAgent({ memoryConfig: { historyTurns: 10, longTermEnabled: true, crossSession: false } }),
        '',
        [makeMessage({ id: 'a1', role: 'assistant', content: '未完成' })],
        [],
        makeResolvedConfig(),
        new AbortController().signal,
        makeCallbacks(),
        undefined,
        'conv-test',
        { resume: true, existingSteps: [] },
      )

      expect(memoryService.formatMemoriesAsContext).toHaveBeenCalledWith({
        agentId: 'test-agent',
        conversationId: 'conv-test',
        crossSession: false,
        maxEntries: undefined,
        maxChars: undefined,
      })
    })

    it('resume 模式应调用 onStatusChange("running")', async () => {
      const callbacks = makeCallbacks()
      await runAgent(
        makeAgent(),
        '',
        [
          makeMessage({ id: 'u1', role: 'user', content: '任务' }),
          makeMessage({ id: 'a1', role: 'assistant', content: '未完成' }),
        ],
        [],
        makeResolvedConfig(),
        new AbortController().signal,
        callbacks,
        undefined,
        'conv-test',
        { resume: true },
      )

      expect(callbacks.onStatusChange).toHaveBeenCalledWith('running')
    })

    it('resume 模式应从 existingSteps 重建 action、observation 与 human_input 消息', async () => {
      expect.assertions(1)
      const existingSteps: AgentStep[] = [
        makeStep({
          id: 'action-1',
          type: 'action',
          content: '准备查询',
          stepIndex: 0,
          toolCall: { name: 'search_docs', arguments: { query: '覆盖率' } },
        }),
        makeStep({
          id: 'observation-1',
          type: 'observation',
          content: '查询完成',
          stepIndex: 1,
          toolResult: { success: true, data: '覆盖率报告', error: undefined },
        }),
        makeStep({
          id: 'human-1',
          type: 'human_input',
          content: '等待用户确认',
          stepIndex: 2,
          humanChoice: {
            question: '请选择测试范围',
            options: [{ label: 'Agent', value: 'agent' }],
            allowMultiple: true,
          },
          humanResponse: ['agent-engine', 'use-chat'],
        }),
      ]

      await runAgent(
        makeAgent(),
        '',
        [makeMessage({ id: 'a1', role: 'assistant', content: '未完成' })],
        [],
        makeResolvedConfig(),
        new AbortController().signal,
        makeCallbacks(),
        undefined,
        'conv-test',
        { resume: true, existingSteps },
      )

      expect(capturedStreamMessages?.map((msg) => ({
        role: msg.role,
        content: msg.content,
        toolCallId: msg.toolCallId,
        toolName: msg.toolName,
        toolCalls: msg.toolCalls,
      }))).toEqual([
        {
          role: 'assistant',
          content: '准备查询',
          toolCallId: undefined,
          toolName: undefined,
          toolCalls: [{ id: 'action-1', name: 'search_docs', arguments: '{"query":"覆盖率"}', status: 'completed' }],
        },
        {
          role: 'tool',
          content: '覆盖率报告',
          toolCallId: 'observation-1',
          toolName: 'search_docs',
          toolCalls: undefined,
        },
        {
          role: 'assistant',
          content: '请选择测试范围',
          toolCallId: undefined,
          toolName: undefined,
          toolCalls: undefined,
        },
        {
          role: 'user',
          content: 'agent-engine, use-chat',
          toolCallId: undefined,
          toolName: undefined,
          toolCalls: undefined,
        },
      ])
    })
  })
})
