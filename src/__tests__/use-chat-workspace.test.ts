/**
 * buildWorkspaceContext 及子任务分派单元测试
 *
 * 测试 useChat hook 中 buildWorkspaceContext 构建的工作区上下文逻辑：
 * - 无工作区关联时应返回 undefined
 * - 有工作区时应构建 teamAgents、dispatchSubTask、dispatchTasks、createAgent
 * - dispatchSubTask：调用 runAgent 运行子 Agent 并收集产物
 * - dispatchTasks：拓扑分层并行执行（含依赖、循环依赖兜底）
 * - createAgent：创建工作区 Agent 并加入团队
 * - onFileActionApproval：转发到 workspaceStore.requestFileActionApproval
 *
 * 通过 renderHook + 真实 useChat hook 验证，确保真实模块代码被执行。
 *
 * @see src/hooks/use-chat.ts buildWorkspaceContext() lines 163-463
 */
/// <reference path="../types/electron.d.ts" />

import type { AgentProfile, Message, ResolvedAIConfig, Tool } from '../types'
import type { Workspace } from '../types/workspace'
import type { WorkspaceContext } from '../services/agent-engine'

// ===== Mock 服务层 =====
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
  WORKSPACE_TOOLS: [
    { id: 'workspace:read_file', name: 'read_file', description: '读文件', enabled: true, isBuiltIn: true, isMCP: false, parameters: { type: 'object', properties: {} } },
    { id: 'workspace:write_file', name: 'write_file', description: '写文件', enabled: true, isBuiltIn: true, isMCP: false, parameters: { type: 'object', properties: {} } },
    { id: 'workspace:list_files', name: 'list_files', description: '列文件', enabled: true, isBuiltIn: true, isMCP: false, parameters: { type: 'object', properties: {} } },
    { id: 'workspace:execute_command', name: 'execute_command', description: '执行命令', enabled: true, isBuiltIn: true, isMCP: false, parameters: { type: 'object', properties: {} } },
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
const mockGetCurrentBranchIndex = jest.fn(() => 0)

const makeStoreMock = (state: Record<string, unknown>) => {
  const fn = jest.fn((selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(state) : state,
  )
  ;(fn as unknown as { getState: () => Record<string, unknown> }).getState = () => state
  return fn
}

// Agent fixture
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
    updateMessage: mockUpdateMessage,
    addMessage: mockAddMessage,
    getMessages: () => mockGetMessages(),
    switchBranch: jest.fn(),
    getCurrentBranchIndex: mockGetCurrentBranchIndex,
    getConversation: mockGetConversation,
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

/** 捕获 runAgent 调用并提取 wsContext（第 7 参数） */
function captureWsContext(): Promise<WorkspaceContext | undefined> {
  return new Promise((resolve) => {
    mockRunAgent.mockImplementation(async (...args: unknown[]) => {
      const wsCtx = args[7] as WorkspaceContext | undefined
      resolve(wsCtx)
      const callbacks = args[6] as {
        onStatusChange?: (s: string) => void
        onDone?: (content: string) => void
      }
      // 立即完成，避免卡住
      callbacks?.onStatusChange?.('completed')
      callbacks?.onDone?.('')
    })
  })
}

describe('buildWorkspaceContext', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetMessages.mockReturnValue([])
    mockGetVisibleMessages.mockReturnValue([])
    mockGetConversation.mockImplementation((id?: string) => {
      if (id === 'conv-ws') {
        return {
          id: 'conv-ws',
          workspaceId: 'ws-1',
          agentId: 'leader-agent',
          title: '工作区任务',
          messageCount: 0,
        }
      }
      return undefined
    })
    leaderAgent = makeAgent()
    subAgent = makeSubAgent()
    workspace = makeWorkspace()
    subAgentsList = [subAgent]
    mockCreateWorkspaceAgent.mockImplementation(async (input: Record<string, unknown>) => ({
      id: 'new-agent-' + Math.random().toString(36).slice(2, 6),
      name: input.name as string,
      description: input.description as string,
      systemPrompt: input.systemPrompt as string,
      avatar: (input.avatar as string) ?? '🤖',
      enabledToolIds: input.enabledToolIds as string[],
      enabled: true,
    }))
    mockRequestFileActionApproval.mockResolvedValue('approved-once')
  })

  describe('工作区关联与上下文构建', () => {
    it('对话关联工作区时应构建 WorkspaceContext', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
        const wsCtx = await wsCtxPromise
        expect(wsCtx).toBeDefined()
        expect(wsCtx!.workspaceId).toBe('ws-1')
        expect(wsCtx!.folderPath).toBe('/test/workspace')
      })
    })

    it('应包含团队成员列表', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
        const wsCtx = await wsCtxPromise
        expect(wsCtx!.teamAgents).toHaveLength(1)
        expect(wsCtx!.teamAgents[0].id).toBe('sub-agent-1')
        expect(wsCtx!.teamAgents[0].name).toBe('子Agent')
      })
    })

    it('应暴露 dispatchSubTask / dispatchTasks / createAgent / onFileActionApproval', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
      })
      const wsCtx = await wsCtxPromise

      expect(typeof wsCtx!.dispatchSubTask).toBe('function')
      expect(typeof wsCtx!.dispatchTasks).toBe('function')
      expect(typeof wsCtx!.createAgent).toBe('function')
      expect(typeof wsCtx!.onFileActionApproval).toBe('function')
    })

    it('应继承工作区 autoApproval 配置', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
      })
      const wsCtx = await wsCtxPromise

      expect(wsCtx!.autoApproval).toBeDefined()
    })
  })

  describe('dispatchSubTask', () => {
    it('应调用 runAgent 运行子 Agent', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
      })
      const wsCtx = await wsCtxPromise

      // 重置 mock 以区分第二次 runAgent 调用（子 Agent）
      mockRunAgent.mockClear()
      mockRunAgent.mockImplementation(async (...args: unknown[]) => {
        const cb = args[6] as { onDone?: (c: string) => void; onStep?: (s: unknown) => void }
        cb?.onDone?.('子任务结果')
      })

      const resultStr = await wsCtx!.dispatchSubTask!('sub-agent-1', '读取文件')
      const parsed = JSON.parse(resultStr)
      expect(parsed.agentId).toBe('sub-agent-1')
      expect(parsed.content).toBe('子任务结果')
      expect(parsed.status).toBe('success')
    })

    it('子 Agent 不存在时应抛出错误', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
      })
      const wsCtx = await wsCtxPromise

      await expect(
        wsCtx!.dispatchSubTask!('nonexistent', '任务'),
      ).rejects.toThrow('不存在')
    })

    it('子 Agent onError 时应返回 error 结果', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
      })
      const wsCtx = await wsCtxPromise

      mockRunAgent.mockClear()
      mockRunAgent.mockImplementation(async (...args: unknown[]) => {
        const cb = args[6] as { onError?: (e: string) => void }
        cb?.onError?.('子 Agent 执行失败')
      })

      const resultStr = await wsCtx!.dispatchSubTask!('sub-agent-1', '任务')
      const parsed = JSON.parse(resultStr)
      expect(parsed.status).toBe('error')
      expect(parsed.error).toContain('子 Agent 执行失败')
    })

    it('onStep 中 write_file 工具调用应收集为 artifact', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
      })
      const wsCtx = await wsCtxPromise

      mockRunAgent.mockClear()
      mockRunAgent.mockImplementation(async (...args: unknown[]) => {
        const cb = args[6] as { onStep?: (s: Record<string, unknown>) => void; onDone?: (c: string) => void }
        cb?.onStep?.({
          id: 's1', type: 'action', content: '', stepIndex: 0, timestamp: Date.now(),
          toolCall: { name: 'write_file', arguments: { path: '/output/result.txt' } },
        })
        cb?.onDone?.('完成')
      })

      const resultStr = await wsCtx!.dispatchSubTask!('sub-agent-1', '写文件')
      const parsed = JSON.parse(resultStr)
      expect(parsed.artifacts).toContain('/output/result.txt')
    })
  })

  describe('dispatchTasks（并行拓扑分层）', () => {
    it('空任务列表应返回空数组', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
      })
      const wsCtx = await wsCtxPromise

      const results = await wsCtx!.dispatchTasks!([])
      expect(results).toEqual([])
    })

    it('无依赖的多个任务应并行执行并按顺序返回', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
      })
      const wsCtx = await wsCtxPromise

      // 添加第二个子 Agent
      const subAgent2 = makeSubAgent({ id: 'sub-agent-2', name: '子Agent2' })
      subAgentsList = [subAgent!, subAgent2]

      mockRunAgent.mockClear()
      let callCount = 0
      mockRunAgent.mockImplementation(async (...args: unknown[]) => {
        callCount++
        const cb = args[6] as { onDone?: (c: string) => void }
        cb?.onDone?.(`结果${callCount}`)
      })

      const results = await wsCtx!.dispatchTasks!([
        { agentId: 'sub-agent-1', task: '任务1' },
        { agentId: 'sub-agent-2', task: '任务2' },
      ])

      expect(results).toHaveLength(2)
      // 应调用 runAgent 2 次
      expect(mockRunAgent).toHaveBeenCalledTimes(2)
    })

    it('有依赖的任务应按依赖顺序串行执行', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
      })
      const wsCtx = await wsCtxPromise

      const subAgent2 = makeSubAgent({ id: 'sub-agent-2', name: '子Agent2' })
      subAgentsList = [subAgent!, subAgent2]

      const execOrder: string[] = []
      mockRunAgent.mockClear()
      mockRunAgent.mockImplementation(async (...args: unknown[]) => {
        const agentId = (args[0] as AgentProfile).id
        execOrder.push(agentId)
        const cb = args[6] as { onDone?: (c: string) => void }
        cb?.onDone?.(`${agentId}完成`)
      })

      // 任务1 无依赖，任务2 依赖任务1
      await wsCtx!.dispatchTasks!([
        { agentId: 'sub-agent-1', task: '任务1' },
        { agentId: 'sub-agent-2', task: '任务2', dependsOnIndexes: [0] },
      ])

      // sub-agent-1 应先于 sub-agent-2 执行
      expect(execOrder.indexOf('sub-agent-1')).toBeLessThan(execOrder.indexOf('sub-agent-2'))
    })
  })

  describe('createAgent', () => {
    it('应创建工作区 Agent 并加入团队', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
      })
      const wsCtx = await wsCtxPromise

      const newId = await wsCtx!.createAgent!({
        name: '新Agent',
        description: '动态创建',
        systemPrompt: '你是新Agent',
      })

      expect(newId).toBeDefined()
      expect(mockCreateWorkspaceAgent).toHaveBeenCalled()
      // 应更新工作区的 teamAgentIds
      expect(mockUpdateWorkspace).toHaveBeenCalled()
      const updateArg = mockUpdateWorkspace.mock.calls[0][0]
      expect(updateArg.teamAgentIds).toContain(newId)
    })

    it('未提供 enabledToolIds 时应使用默认工作区工具', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
      })
      const wsCtx = await wsCtxPromise

      await wsCtx!.createAgent!({
        name: '新Agent',
        description: 'desc',
        systemPrompt: 'sys',
      })

      const createArg = mockCreateWorkspaceAgent.mock.calls[0][0]
      expect(createArg.enabledToolIds).toEqual([
        'workspace:read_file', 'workspace:write_file',
        'workspace:list_files', 'workspace:execute_command',
      ])
    })

    it('提供 enabledToolIds 时应使用提供的工具', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
      })
      const wsCtx = await wsCtxPromise

      await wsCtx!.createAgent!({
        name: '新Agent',
        description: 'desc',
        systemPrompt: 'sys',
        enabledToolIds: ['tool-calc', 'tool-plan'],
      })

      const createArg = mockCreateWorkspaceAgent.mock.calls[0][0]
      expect(createArg.enabledToolIds).toEqual(['tool-calc', 'tool-plan'])
    })

    it('应支持 Phase 4 增强字段', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
      })
      const wsCtx = await wsCtxPromise

      await wsCtx!.createAgent!({
        name: '新Agent',
        description: 'desc',
        systemPrompt: 'sys',
        planningStrategy: 'plan-and-execute',
        termination: { maxSteps: 100, timeoutSeconds: 0, autoStopOnGoal: true },
        maxParallelSubtasks: 5,
      })

      const createArg = mockCreateWorkspaceAgent.mock.calls[0][0]
      expect(createArg.planningStrategy).toBe('plan-and-execute')
      expect(createArg.maxParallelSubtasks).toBe(5)
      expect(createArg.termination.maxSteps).toBe(100)
    })
  })

  describe('onFileActionApproval', () => {
    it('应转发到 workspaceStore.requestFileActionApproval', async () => {
      const wsCtxPromise = captureWsContext()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('执行任务', 'conv-ws')
      })
      const wsCtx = await wsCtxPromise

      const request = {
        id: 'req-1',
        actionType: 'write-file' as const,
        toolName: 'write_file',
        filePath: '/test.txt',
        riskLevel: 'low' as const,
        timestamp: Date.now(),
      }
      const approval = await wsCtx!.onFileActionApproval!(request)

      expect(mockRequestFileActionApproval).toHaveBeenCalledWith(request)
      expect(approval).toBe('approved-once')
    })
  })
})
