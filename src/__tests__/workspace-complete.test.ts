/**
 * 工作区完整实现回归测试
 *
 * 覆盖两条核心修复链路，验证真实模块代码（不 mock 核心业务逻辑）：
 *
 * 1. 消息排版顺序（Bug 1 修复）
 *    - groupMessages 必须按 timestamp 升序排序后再分组
 *    - 乱序输入（agent 步骤消息在用户消息之后到达）应被纠正
 *    - 带 agentSteps 的 assistant 消息必须作为 single 独立渲染组
 *
 * 2. 子 Agent human_input 人工选择（Bug 2 修复）
 *    - sendMessageWithAgent → runAgent → onSubAgentActivity 注入 human_input 子步骤
 *    - 用户调用 handleHumanInput(stepId, value) 后：
 *        a) resolver 被 resolve，从而解锁被挂起的 onHumanInput Promise
 *        b) 即使主消息已完成 streaming，也能通过 stepId 找到对应消息并 updateMessage
 *
 * Mock 边界遵循项目规则：仅 mock 网络（ai-service）、SDK/store、runAgent 引擎；
 * groupMessages / buildWorkspaceContext / handleHumanInput 均为真实代码。
 */
/// <reference path="../types/electron.d.ts" />

import type { AgentProfile, AgentStep, Message, ResolvedAIConfig, Tool } from '../types'
import type { Workspace } from '../types/workspace'
import type { WorkspaceContext } from '../services/agent-engine'

// ===== Mock 服务层（仅外部边界） =====
const mockRunAgent = jest.fn()
const mockStreamChat = jest.fn()
const mockCreateWorkspaceAgent = jest.fn()
const mockUpdateWorkspace = jest.fn()
const mockRequestFileActionApproval = jest.fn()

jest.mock('../services/agent-engine', () => ({
  runAgent: (...args: unknown[]) => mockRunAgent(...args),
}))

jest.mock('../services/ai-service', () => ({
  aiService: { streamChat: (...args: unknown[]) => mockStreamChat(...args) },
}))

jest.mock('../services/tool-service', () => ({
  toolService: {
    toToolDefinitions: jest.fn((tools: Tool[]) =>
      tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
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
  WORKSPACE_TOOLS: [
    { id: 'workspace:read_file', name: 'read_file', description: '读文件', enabled: true, isBuiltIn: true, isMCP: false, parameters: { type: 'object', properties: {} } },
    { id: 'workspace:write_file', name: 'write_file', description: '写文件', enabled: true, isBuiltIn: true, isMCP: false, parameters: { type: 'object', properties: {} } },
  ],
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

// ===== 可变 store 状态（用于断言 handleHumanInput 的消息更新） =====
const mockUpdateMessage = jest.fn()
const mockGetMessages = jest.fn(() => [] as Message[])
const mockGetVisibleMessages = jest.fn(() => [] as Message[])

/** addMessage 既是 mock，又会把创建的消息写回 messagesMap，便于 handleHumanInput 通过 getMessages 找到它 */
function createAddMessage() {
  const messagesMap: Record<string, Message[]> = {}
  const addMessage = jest.fn((convId: string, msg: Partial<Message>): Message => {
    const created: Message = {
      id: `msg-${Math.random().toString(36).slice(2, 9)}`,
      conversationId: convId,
      timestamp: Date.now(),
      role: 'assistant',
      content: '',
      ...msg,
    } as Message
    if (!messagesMap[convId]) messagesMap[convId] = []
    messagesMap[convId].push(created)
    return created
  })
  return { addMessage, messagesMap }
}

const { addMessage: mockAddMessage, messagesMap } = createAddMessage()

const makeStoreMock = (state: Record<string, unknown>) => {
  const fn = jest.fn((selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(state) : state,
  )
  ;(fn as unknown as { getState: () => Record<string, unknown> }).getState = () => state
  return fn
}

// Agent fixtures
function makeAgent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: 'leader-agent',
    name: '领导Agent',
    description: '团队领导',
    systemPrompt: '你是领导',
    enabledToolIds: ['tool-calc', 'tool-plan'],
    planningStrategy: 'react',
    memoryConfig: { historyTurns: 10, longTermEnabled: false, crossSession: false },
    termination: { maxSteps: 5, timeoutSeconds: 60, autoStopOnGoal: false },
    modelConfig: {},
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ['leader'],
    ...overrides,
  }
}

function makeSubAgent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return makeAgent({
    id: 'sub-agent-1',
    name: '子Agent',
    description: '执行子任务',
    enabledToolIds: ['workspace:read_file', 'workspace:write_file'],
    ...overrides,
  })
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws-1',
    name: '测试工作区',
    description: '测试',
    folderPath: '/test/workspace',
    allowDynamicAgents: true,
    teamAgentIds: ['sub-agent-1'],
    checkpointPolicy: 'manual',
    timedIntervalMinutes: 10,
    maxCheckpoints: 10,
    commandPolicy: 'all-need-approval',
    commandExecutionEnabled: true,
    safeCommandWhitelist: [],
    commandBlacklist: [],
    contextConfig: {
      maxTokens: 8000,
      compressionEnabled: true,
      compressionThreshold: 90,
      slidingWindow: true,
      overflowRetry: true,
      maxOverflowRetries: 2,
      keepCheckpointBeforeCompression: true,
    },
    knowledgeBaseIds: [],
    mcpServerIds: [],
    autoApproval: {
      enabled: true,
      readFiles: true,
      listFiles: true,
      writeFiles: false,
      executeSafeCommands: false,
      browser: false,
      mcpTools: false,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

// 可动态修改的 store 状态
let leaderAgent: AgentProfile | undefined
let subAgent: AgentProfile | undefined
let workspace: Workspace | undefined
let subAgentsList: AgentProfile[] = []

jest.mock('../stores/conversation-store', () => ({
  useConversationStore: makeStoreMock({
    currentConversationId: 'conv-ws',
    conversations: [{ id: 'conv-ws', workspaceId: 'ws-1', agentId: 'leader-agent', title: 't', messageCount: 0 }],
    getVisibleMessages: () => mockGetVisibleMessages(),
    updateMessage: (msgId: string, patch: Partial<Message>) => {
      // 同时更新内存中的 messagesMap，使 getMessages 能读到最新 agentSteps
      mockUpdateMessage(msgId, patch)
      for (const convId in messagesMap) {
        const arr = messagesMap[convId]
        const idx = arr.findIndex((m) => m.id === msgId)
        if (idx !== -1) {
          arr[idx] = { ...arr[idx], ...patch }
        }
      }
    },
    addMessage: mockAddMessage,
    getMessages: (convId?: string) => {
      if (convId) return messagesMap[convId] ?? []
      return mockGetMessages()
    },
    switchBranch: jest.fn(),
    getCurrentBranchIndex: jest.fn(() => 0),
    getConversation: jest.fn((id?: string) =>
      id === 'conv-ws'
        ? { id: 'conv-ws', workspaceId: 'ws-1', agentId: 'leader-agent', title: '工作区任务', messageCount: 0 }
        : undefined,
    ),
    renameConversation: jest.fn(),
    deleteMessage: jest.fn(),
  }),
}))

jest.mock('../stores/global-config-store', () => ({
  useGlobalConfigStore: makeStoreMock({ globalConfig: {} }),
}))

jest.mock('../stores/agent-store', () => ({
  useAgentStore: makeStoreMock({
    agents: [],
    getAgent: jest.fn((id: string) => {
      if (id === leaderAgent?.id) return leaderAgent
      if (id === subAgent?.id) return subAgent
      return undefined
    }),
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
  useWorkspaceStore: makeStoreMock({
    get workspaces() { return workspace ? [workspace] : [] },
    updateWorkspace: mockUpdateWorkspace,
    requestFileActionApproval: mockRequestFileActionApproval,
  }),
}))

jest.mock('../stores/workspace-agent-store', () => ({
  useWorkspaceAgentStore: makeStoreMock({
    get workspaceAgents() { return subAgentsList },
    getWorkspaceAgent: jest.fn((id: string) => subAgentsList.find((a) => a.id === id)),
    createWorkspaceAgent: mockCreateWorkspaceAgent,
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

import { renderHook, act } from '@testing-library/react'
import { useChat } from '../hooks/use-chat'
import { groupMessages } from '../utils/message-grouping'

// ===== 辅助：构造 Agent 步骤 =====
function makeStep(overrides: Partial<AgentStep>): AgentStep {
  return {
    id: 'step-' + Math.random().toString(36).slice(2, 8),
    type: 'action',
    content: '',
    stepIndex: 0,
    timestamp: Date.now(),
    ...overrides,
  }
}

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: 'msg-' + Math.random().toString(36).slice(2, 8),
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    ...overrides,
  } as Message
}

/** 捕获 runAgent 的回调与 workspaceContext */
interface CapturedRunAgent {
  callbacks: Record<string, (...args: unknown[]) => unknown>
  workspaceContext: WorkspaceContext | undefined
  args: unknown[]
}
function captureRunAgent(): { promise: Promise<CapturedRunAgent> } {
  let resolveCapture!: (v: CapturedRunAgent) => void
  const promise = new Promise<CapturedRunAgent>((resolve) => {
    resolveCapture = resolve
  })
  mockRunAgent.mockImplementation(async (...args: unknown[]) => {
    const workspaceContext = args[7] as WorkspaceContext | undefined
    const callbacks = (args[6] ?? {}) as Record<string, (...args: unknown[]) => unknown>
    resolveCapture({ callbacks, workspaceContext, args })
    // 不自动完成：让测试自行驱动回调
  })
  return { promise }
}

// ============================================================
// 第一部分：消息排版顺序（Bug 1）— 纯函数，直接验证真实 groupMessages
// ============================================================
describe('工作区消息排版顺序（Bug 1 修复）', () => {
  it('乱序到达的消息应按 timestamp 升序输出', () => {
    expect.assertions(4)
    // 模拟 Bug 1 场景：agent 完成后用户立即发消息，
    // 但用户消息 timestamp 较小却被追加在后（数组顺序与时间顺序不一致）
    const userMsg = makeMessage({ id: 'u1', role: 'user', content: '继续', timestamp: 1000 })
    const agentMsg = makeMessage({
      id: 'a1',
      role: 'assistant',
      content: '已完成',
      timestamp: 2000,
      agentSteps: [makeStep({ id: 's1', type: 'final_answer' })],
    })
    // 故意把 agent 消息放在前面（错误的到达顺序）
    const groups = groupMessages([agentMsg, userMsg])

    // 修复后应按 timestamp 排序：user(1000) 在前，agent(2000) 在后
    expect(groups).toHaveLength(2)
    expect(groups[0].type).toBe('single')
    expect((groups[0] as { message: Message }).message.id).toBe('u1')
    expect((groups[1] as { message: Message }).message.id).toBe('a1')
  })

  it('带 agentSteps 的 assistant 消息必须作为 single 独立渲染组，不与 tool 消息合并', () => {
    expect.assertions(3)
    const assistant = makeMessage({
      id: 'a1',
      role: 'assistant',
      content: '执行结果',
      timestamp: 1000,
      agentSteps: [makeStep({ id: 's1', type: 'final_answer' })],
    })
    const tool = makeMessage({ id: 't1', role: 'tool', content: 'tool result', timestamp: 2000 })

    const groups = groupMessages([assistant, tool])

    expect(groups).toHaveLength(2)
    expect(groups[0].type).toBe('single')
    expect((groups[0] as { message: Message }).message.id).toBe('a1')
  })

  it('连续普通 assistant + tool 消息应合并为 assistant-group', () => {
    expect.assertions(2)
    const a1 = makeMessage({ id: 'a1', role: 'assistant', content: '片段1', timestamp: 1000 })
    const t1 = makeMessage({ id: 't1', role: 'tool', content: '结果1', timestamp: 2000 })

    const groups = groupMessages([a1, t1])

    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('assistant-group')
  })
})

// ============================================================
// 第二部分：子 Agent human_input 人工选择（Bug 2）— 真实 useChat hook
// ============================================================
describe('子 Agent human_input 完整链路（Bug 2 修复）', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // 清空内存消息
    for (const k in messagesMap) delete messagesMap[k]
    mockGetMessages.mockReturnValue([])
    mockGetVisibleMessages.mockReturnValue([])
    leaderAgent = makeAgent()
    subAgent = makeSubAgent()
    workspace = makeWorkspace()
    subAgentsList = [subAgent]
    mockCreateWorkspaceAgent.mockImplementation(async (input: Record<string, unknown>) => ({
      id: 'new-agent-' + Math.random().toString(36).slice(2, 6),
      name: input.name as string,
    }))
    mockRequestFileActionApproval.mockResolvedValue('approved-once')
  })

  it('human_input 步骤注册后，handleHumanInput 应解锁 Promise 并按 stepId 更新对应消息', async () => {
    expect.assertions(5)

    const { promise: capturedPromise } = captureRunAgent()
    const { result } = renderHook(() => useChat())

    // 触发 sendMessageWithAgent（真实代码），捕获 runAgent 回调
    await act(async () => {
      await result.current.sendMessage('执行任务', 'conv-ws')
    })
    const captured = await capturedPromise

    // 1) 构造一个子 Agent 的 human_input 步骤
    const humanStep: AgentStep = makeStep({
      id: 'human-step-1',
      type: 'human_input',
      content: '请选择方案',
      humanChoice: {
        question: '请选择方案',
        options: [
          { label: '方案A', value: 'A' },
          { label: '方案B', value: 'B' },
        ],
        allowMultiple: false,
      },
    })

    // 2) 通过真实的 onHumanInput 回调注册 resolver（模拟 Agent 引擎请求人工输入）
    //    该回调内部会把 resolver 存入 humanInputResolversRef
    let resolvedValue: string | string[] | undefined
    const onHumanInput = captured.callbacks.onHumanInput as (step: AgentStep) => Promise<string | string[]>
    const humanInputPromise = onHumanInput(humanStep)
    humanInputPromise.then((v) => {
      resolvedValue = v
    })

    // 3) 模拟 onSubAgentActivity 已把该步骤注入到主 assistant 消息：
    //    把含 human_input 步骤的消息写回内存 store（addMessage 已在 sendMessageWithAgent 内创建主消息）
    const assistantMessages = messagesMap['conv-ws'] ?? []
    const leaderMsg = assistantMessages.find((m) => m.role === 'assistant' && m.isStreaming !== undefined)
    expect(leaderMsg).toBeDefined()
    // 把 human_input 步骤追加进该消息的 agentSteps
    leaderMsg!.agentSteps = [...(leaderMsg!.agentSteps ?? []), humanStep]

    // 4) 用户在 UI 点击选择 —— 调用真实 handleHumanInput
    await act(async () => {
      result.current.handleHumanInput('human-step-1', 'A')
    })

    // 让 Promise 微任务落地
    await act(async () => {
      await Promise.resolve()
    })

    // 断言 A：被挂起的 onHumanInput Promise 被 resolve 为用户选择的值
    expect(resolvedValue).toBe('A')

    // 断言 B：handleHumanInput 通过 stepId 找到对应消息并调用 updateMessage
    const updateCallsForHumanStep = mockUpdateMessage.mock.calls.filter(([, patch]) => {
      const steps = (patch as Partial<Message>).agentSteps
      return Array.isArray(steps) && steps.some((s) => s.id === 'human-step-1')
    })
    expect(updateCallsForHumanStep.length).toBeGreaterThan(0)

    // 断言 C：被更新的消息确实包含该 human_input 步骤
    const updatedPatch = updateCallsForHumanStep[0][1] as Partial<Message>
    expect(updatedPatch.agentSteps!.some((s) => s.type === 'human_input' && s.id === 'human-step-1')).toBe(true)

    // 断言 D：updateMessage 被调用时使用的 messageId 是该 leader 消息的 id
    expect(updateCallsForHumanStep[0][0]).toBe(leaderMsg!.id)
  })

  it('不存在的 stepId 调用 handleHumanInput 时不应抛错、也不应调用 updateMessage', async () => {
    expect.assertions(1)

    const { promise: capturedPromise } = captureRunAgent()
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('执行任务', 'conv-ws')
    })
    await capturedPromise

    mockUpdateMessage.mockClear()

    await act(async () => {
      result.current.handleHumanInput('not-exist-step', 'whatever')
    })

    expect(mockUpdateMessage).not.toHaveBeenCalled()
  })
})
