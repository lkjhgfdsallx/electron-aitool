/**
 * use-chat.ts 内部辅助函数单元测试
 *
 * 测试 useChat hook 中模块内部纯函数的真实行为（非副本）：
 * - getFinishNotice: 根据 finishReason 生成截断/中断提示（通过 sendMessage 普通模式 onDone 间接验证）
 * - filterWebTools: 根据联网开关过滤工具列表（通过工具列表传递间接验证）
 * - notifyIfReady: 通知/声音设置（通过 window.electronAPI 间接验证）
 * - StreamingBuffer: 流式输出节流（通过连续 token 间接验证）
 *
 * 由于这些函数未导出，通过 renderHook + 真实 useChat hook 的行为间接测试，
 * 确保真实模块代码被执行，提升 use-chat.ts 覆盖率。
 *
 * @see src/hooks/use-chat.ts lines 26-150
 */
/// <reference path="../types/electron.d.ts" />

import type { AgentProfile, AgentStep, Message, ResolvedAIConfig, Tool } from '../types'

// ===== Mock 服务层 =====
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
    toToolDefinitions: jest.fn((tools: Tool[]) =>
      tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
    ),
  },
}))

jest.mock('../services/built-in-tools', () => ({
  BUILT_IN_TOOLS: [
    { id: 'tool-web-search', name: 'web_search', description: '联网搜索', enabled: true, isBuiltIn: true, isMCP: false, parameters: { type: 'object', properties: {} } },
    { id: 'tool-fetch-webpage', name: 'fetch_webpage', description: '抓取网页', enabled: true, isBuiltIn: true, isMCP: false, parameters: { type: 'object', properties: {} } },
    { id: 'tool-calc', name: 'calculator', description: '计算器', enabled: true, isBuiltIn: true, isMCP: false, parameters: { type: 'object', properties: {} } },
  ],
  AGENT_BUILTIN_TOOLS: [
    { id: 'tool-agent-plan', name: 'create_plan', description: '创建计划', enabled: true, isBuiltIn: true, isMCP: false, parameters: { type: 'object', properties: {} } },
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

// ===== Zustand store mocks =====
const mockUpdateMessage = jest.fn()
const mockAddMessage = jest.fn((_, msg) => ({ id: 'asst-1', ...msg }))
const mockGetMessages = jest.fn(() => [])
const mockGetVisibleMessages = jest.fn(() => [])
const mockGetConversation: jest.Mock<Record<string, unknown> | undefined, [string?]> = jest.fn(() => undefined)
const mockRenameConversation = jest.fn()
const mockGetCurrentBranchIndex = jest.fn(() => 0)
const mockCurrentConversationId = { current: 'conv-test' }

/** 既能作为 hook 调用又能调用 .getState() 的 store mock */
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
    getVisibleMessages: () => mockGetVisibleMessages(),
    updateMessage: mockUpdateMessage,
    addMessage: mockAddMessage,
    getMessages: () => mockGetMessages(),
    switchBranch: jest.fn(),
    getCurrentBranchIndex: mockGetCurrentBranchIndex,
    getConversation: mockGetConversation,
    renameConversation: mockRenameConversation,
    deleteMessage: jest.fn(),
  }),
}))

jest.mock('../stores/global-config-store', () => ({
  useGlobalConfigStore: makeStoreMock({ globalConfig: {} }),
}))

jest.mock('../stores/agent-store', () => ({
  useAgentStore: makeStoreMock({
    agents: [],
    getAgent: jest.fn(() => undefined),
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

// 设置 store（可被测试动态修改）
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

// 导入被测 hook（在所有 mock 之后）
import { renderHook, act } from '@testing-library/react'
import { useChat } from '../hooks/use-chat'
import { useSettingsStore } from '../stores'

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

/**
 * 捕获 streamChat 的回调对象。
 * streamChat 签名：(history, config, systemPrompt, tools, signal, callbacks, requestConfig)
 */
function captureStreamChatCallbacks(): Promise<Record<string, (...args: unknown[]) => void>> {
  return new Promise((resolve) => {
    mockStreamChat.mockImplementation(async (_h, _c, _s, _t, _sig, callbacks) => {
      resolve(callbacks as Record<string, (...args: unknown[]) => void>)
      // 不立即调用任何回调，由测试控制
    })
  })
}

// ===== 测试套件 =====
describe('use-chat 内部辅助函数（真实模块）', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetMessages.mockReturnValue([])
    mockGetVisibleMessages.mockReturnValue([])
    mockGetConversation.mockReturnValue(undefined)
    mockCurrentConversationId.current = 'conv-test'
    // 重置设置
    mockSettingsState.webSearchEnabled = true
    mockSettingsState.enableNotification = false
    mockSettingsState.enableSound = false
  })

  describe('getFinishNotice - 通过 sendMessage 普通模式 onDone 验证', () => {
    it('finishReason="stop" 时不应追加中断提示', async () => {
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
        const cb = await callbacksPromise
        cb.onDone('stop')
      })

      // 查找最后一次对 assistant 消息的 updateMessage（isStreaming:false）
      const doneCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1] && c[1].isStreaming === false && c[1].finishReason === 'stop',
      )
      expect(doneCall).toBeDefined()
      expect(doneCall![1].content).not.toContain('回复中断')
    })

    it('finishReason="abort" 时应追加中断提示并标记可继续', async () => {
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
        const cb = await callbacksPromise
        // 先推送一些 token
        cb.onToken('部分内容')
        // 触发 onDone abort
        cb.onDone('abort')
      })

      const doneCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1] && c[1].finishReason === 'abort',
      )
      expect(doneCall).toBeDefined()
      expect(doneCall![1].content).toContain('回复中断')
      expect(doneCall![1].continuable).toBe('normal')
    })

    it('finishReason="length" 时应标记可继续但不追加中断提示', async () => {
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
        const cb = await callbacksPromise
        cb.onDone('length')
      })

      const doneCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1] && c[1].finishReason === 'length',
      )
      expect(doneCall).toBeDefined()
      expect(doneCall![1].continuable).toBe('normal')
      expect(doneCall![1].content).not.toContain('回复中断')
    })

    it('finishReason 为未知值时应返回 null 提示且不可继续', async () => {
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
        const cb = await callbacksPromise
        cb.onDone('content_filter')
      })

      const doneCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1] && c[1].finishReason === 'content_filter',
      )
      expect(doneCall).toBeDefined()
      expect(doneCall![1].continuable).toBeNull()
    })
  })

  describe('filterWebTools - 通过工具定义传递验证', () => {
    it('webSearchEnabled=true 时联网工具应传递给 aiService', async () => {
      mockSettingsState.webSearchEnabled = true
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
        await callbacksPromise
      })

      // streamChat 第 4 参数为 toolDefs
      const toolDefsArg = mockStreamChat.mock.calls[0][3] as Array<{ function: { name: string } }>
      const toolNames = toolDefsArg.map((t) => t.function.name)
      expect(toolNames).toContain('web_search')
      expect(toolNames).toContain('fetch_webpage')
      expect(toolNames).toContain('calculator')
    })

    it('webSearchEnabled=false 时应过滤掉联网工具', async () => {
      mockSettingsState.webSearchEnabled = false
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
        await callbacksPromise
      })

      const toolDefsArg = mockStreamChat.mock.calls[0][3] as Array<{ function: { name: string } }>
      const toolNames = toolDefsArg.map((t) => t.function.name)
      // 联网工具被过滤
      expect(toolNames).not.toContain('web_search')
      expect(toolNames).not.toContain('fetch_webpage')
      // 非联网工具保留
      expect(toolNames).toContain('calculator')
    })

    it('getAvailableTools（Agent 模式）也应受联网开关影响', async () => {
      mockSettingsState.webSearchEnabled = false
      // 准备一个 Agent 对话
      const agent: AgentProfile = {
        id: 'test-agent',
        name: '测试Agent',
        description: '测试',
        systemPrompt: 'sys',
        enabledToolIds: ['tool-web-search', 'tool-agent-plan', 'tool-calc'],
        planningStrategy: 'react',
        memoryConfig: { historyTurns: 10, longTermEnabled: false, crossSession: false },
        termination: { maxSteps: 5, timeoutSeconds: 60, autoStopOnGoal: false },
        modelConfig: {},
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      mockGetConversation.mockReturnValue({ id: 'conv-test', agentId: 'test-agent', title: 't', messageCount: 0 })

      // 让 agentStore 返回该 agent
     const agentStoreState = useSettingsStore as unknown // 占位避免 lint
     void agentStoreState
      // 通过 require 设置 agent store mock 的 getAgent
      const agentStoreModule = require('../stores/agent-store')
      agentStoreModule.useAgentStore.getState().getAgent = jest.fn(() => agent)

      // 让 runAgent 不报错
      mockRunAgent.mockImplementation(async (_a, _m, _h, _t, _c, _sig, cb) => {
        cb.onDone('done')
      })

      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
      })

      // runAgent 参数: [0]agent [1]msg [2]history [3]tools [4]config ...
      const toolsArg = mockRunAgent.mock.calls[0][3] as Tool[]
      const toolNames = toolsArg.map((t) => t.name)
      expect(toolNames).not.toContain('web_search')
      expect(toolNames).toContain('create_plan')
      expect(toolNames).toContain('calculator')
    })
  })

  describe('notifyIfReady - 通过 onDone 完成时验证通知行为', () => {
    beforeEach(() => {
      // 安装 window.electronAPI 的通知 mock
      ;(window as unknown as { electronAPI: unknown }).electronAPI = {
        notification: {
          show: jest.fn(),
          playSound: jest.fn(),
        },
      }
    })

    afterEach(() => {
      delete (window as unknown as { electronAPI?: unknown }).electronAPI
    })

    it('enableNotification=true 时应调用 electronAPI.notification.show', async () => {
      mockSettingsState.enableNotification = true
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
        const cb = await callbacksPromise
        cb.onToken('完整回复')
        cb.onDone('stop')
      })

      const showMock = (window as unknown as { electronAPI: { notification: { show: jest.Mock } } }).electronAPI.notification.show
      expect(showMock).toHaveBeenCalledWith('AI 回复完成', expect.any(String))
    })

    it('enableNotification=false 时不应调用 show', async () => {
      mockSettingsState.enableNotification = false
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
        const cb = await callbacksPromise
        cb.onDone('stop')
      })

      const showMock = (window as unknown as { electronAPI: { notification: { show: jest.Mock } } }).electronAPI.notification.show
      expect(showMock).not.toHaveBeenCalled()
    })

    it('enableSound=true 时应调用 playSound', async () => {
      mockSettingsState.enableSound = true
      mockSettingsState.notificationSound = 'beep'
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
        const cb = await callbacksPromise
        cb.onDone('stop')
      })

      const playMock = (window as unknown as { electronAPI: { notification: { playSound: jest.Mock } } }).electronAPI.notification.playSound
      expect(playMock).toHaveBeenCalledWith('beep')
    })

    it('内容为空时通知 body 应使用默认文案', async () => {
      mockSettingsState.enableNotification = true
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
        const cb = await callbacksPromise
        cb.onDone('stop')
      })

      const showMock = (window as unknown as { electronAPI: { notification: { show: jest.Mock } } }).electronAPI.notification.show
      expect(showMock).toHaveBeenCalledWith('AI 回复完成', '已完成')
    })
  })

  describe('StreamingBuffer - 通过连续 token 节流验证', () => {
    it('多个 token 应合并为节流更新（push 累积）', async () => {
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
        const cb = await callbacksPromise
        // 连续推送多个 token，触发 StreamingBuffer.push（累积到 pendingUpdate）
        cb.onToken('H')
        cb.onToken('e')
        cb.onToken('l')
        cb.onToken('l')
        cb.onToken('o')
        // flush 强制提交待更新（onDone 内部也会 flush）
        cb.onDone('stop')
      })

      // flush 后最终内容应包含累积的 token
      const doneCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1] && c[1].isStreaming === false,
      )
      expect(doneCall).toBeDefined()
      expect(doneCall![1].content).toContain('Hello')
    })

    it('flush 应强制提交待更新内容', async () => {
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
        const cb = await callbacksPromise
        cb.onToken('内容A')
        cb.onDone('stop') // onDone 会调用 flush
      })

      // flush 后应有一次最终更新
      const doneCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1] && c[1].isStreaming === false,
      )
      expect(doneCall).toBeDefined()
      expect(doneCall![1].content).toContain('内容A')
    })

    it('reasoningToken 应累积并通过缓冲提交', async () => {
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
        const cb = await callbacksPromise
        cb.onToken('答案')
        cb.onReasoningToken('思考过程')
        cb.onDone('stop')
      })

      // flush 提交时 reasoningContent 应在某个 updateMessage 调用中
      const reasoningCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1] && typeof c[1].reasoningContent === 'string' && (c[1].reasoningContent as string).length > 0,
      )
      expect(reasoningCall).toBeDefined()
      expect(reasoningCall![1].reasoningContent).toContain('思考过程')
    })
  })

  describe('sendMessage 前置条件与边界', () => {
    it('内容为空且无附件时应直接返回（不调用 streamChat）', async () => {
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('   ', 'conv-test')
      })

      expect(mockStreamChat).not.toHaveBeenCalled()
    })

    it('conversationId 为空时应直接返回', async () => {
      mockCurrentConversationId.current = ''
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', '')
      })

      expect(mockStreamChat).not.toHaveBeenCalled()
    })

    it('仅有附件无文本时应正常发送', async () => {
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('', 'conv-test', [
         { name: 'f.txt', type: 'text/plain', content: '文件内容', size: 100 },
       ])
        await callbacksPromise
      })

      expect(mockStreamChat).toHaveBeenCalled()
    })

    it('onError 时应标记消息为错误状态', async () => {
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
        const cb = await callbacksPromise
        cb.onError('网络错误')
      })

      const errorCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1] && c[1].isError === true,
      )
      expect(errorCall).toBeDefined()
      expect(errorCall![1].isStreaming).toBe(false)
    })

    it('onUsage 更新应反映到消息 tokenUsage', async () => {
      const callbacksPromise = captureStreamChatCallbacks()
      const { result } = renderHook(() => useChat())

      await act(async () => {
        await result.current.sendMessage('你好', 'conv-test')
        const cb = await callbacksPromise
        cb.onUsage({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 })
      })

      const usageCall = mockUpdateMessage.mock.calls.find(
        (c) => c[1] && c[1].tokenUsage,
      )
      expect(usageCall).toBeDefined()
      expect(usageCall![1].tokenUsage).toEqual({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 })
    })
  })
})
