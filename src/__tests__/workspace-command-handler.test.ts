/**
 * workspace-command-handler 单元测试
 *
 * 测试工作区指令执行服务的所有命令处理逻辑：
 * - #init: 发送项目初始化分析消息
 * - #agents: 打开 Agent 管理面板
 * - #newtask: 创建新对话并切换
 * - #clear: 清空对话消息
 * - #compact: 发送上下文压缩消息
 * - #approve: 打开审批设置
 * - #status: 发送状态查询消息
 * - #review: 发送代码审查消息
 * - #test: 发送测试生成消息
 * - #explain: 发送代码解释消息
 * - 未知指令: 返回错误
 *
 * @see src/services/workspace-command-handler.ts
 */

import type { Workspace } from '../types'
import type { CommandResult, CommandAction } from '../services/workspace-command-handler'

// ===== Mock conversation store =====
const mockCreateConversation = jest.fn()
const mockSelectConversation = jest.fn()
const mockClearMessages = jest.fn()
const mockSetConversationKnowledgeBases = jest.fn()

jest.mock('../stores/conversation-store', () => ({
  useConversationStore: {
    getState: () => ({
      createConversation: (...args: unknown[]) => mockCreateConversation(...args),
      selectConversation: (...args: unknown[]) => mockSelectConversation(...args),
      clearMessages: (...args: unknown[]) => mockClearMessages(...args),
      setConversationKnowledgeBases: (...args: unknown[]) => mockSetConversationKnowledgeBases(...args),
    }),
  },
}))

// Import after mocking
import { workspaceCommandHandler } from '../services/workspace-command-handler'

// ===== Test fixtures =====
const mockWorkspace: Workspace = {
  id: 'workspace-test-001',
  name: 'Test Project',
  description: 'Test workspace for unit tests',
  folderPath: '/test/project',
  leaderAgentId: 'agent-leader-001',
  allowDynamicAgents: true,
  teamAgentIds: ['agent-001', 'agent-002'],
  checkpointPolicy: 'manual',
  timedIntervalMinutes: 30,
  maxCheckpoints: 5,
  commandPolicy: 'auto-approve-safe',
  commandExecutionEnabled: true,
  safeCommandWhitelist: ['ls', 'cat', 'echo'],
  commandBlacklist: ['rm -rf', 'sudo'],
  contextConfig: {
    maxTokens: 8000,
    compressionEnabled: true,
    compressionThreshold: 90,
    slidingWindow: true,
    overflowRetry: true,
    maxOverflowRetries: 3,
    keepCheckpointBeforeCompression: true,
  },
  knowledgeBaseIds: ['kb-001', 'kb-002'],
  mcpServerIds: [],
  autoApproval: {
    enabled: false,
    readFiles: true,
    listFiles: true,
    writeFiles: false,
    executeSafeCommands: false,
    browser: false,
    mcpTools: false,
  },
  postWriteLint: {
    enabled: false,
    timeoutMs: 30000,
    maxOutputChars: 4000,
    disabledLinters: [],
    customCommands: [],
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

const mockWorkspaceNoKnowledgeBases: Workspace = {
  ...mockWorkspace,
  knowledgeBaseIds: [],
}

const mockConversationId = 'conv-test-001'

const mockSendMessage = jest.fn()
const mockOpenSettings = jest.fn()

const mockCreatedConversation = {
  id: 'conv-new-001',
  title: 'Test Project - 新任务',
  agentId: 'agent-leader-001',
  workspaceId: 'workspace-test-001',
}

describe('workspaceCommandHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateConversation.mockReturnValue(mockCreatedConversation)
  })

  describe('execute() - command routing', () => {
    it('should route to handleInit for "init" command', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.execute(
        'init',
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
        mockOpenSettings,
      )
      expect(result.success).toBe(true)
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('请分析当前项目结构'),
      )
    })

    it('should route to handleAgents for "agents" command', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.execute(
        'agents',
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
        mockOpenSettings,
      )
      expect(result.success).toBe(true)
      expect(mockOpenSettings).toHaveBeenCalledWith('agents')
    })

    it('should route to handleNewTask for "newtask" command', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.execute(
        'newtask',
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
        mockOpenSettings,
      )
      expect(result.success).toBe(true)
      expect(mockCreateConversation).toHaveBeenCalled()
    })

    it('should route to handleClear for "clear" command', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.execute(
        'clear',
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
        mockOpenSettings,
      )
      expect(result.success).toBe(true)
      expect(mockClearMessages).toHaveBeenCalledWith(mockConversationId)
    })

    it('should route to handleCompact for "compact" command', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.execute(
        'compact',
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
        mockOpenSettings,
      )
      expect(result.success).toBe(true)
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('上下文压缩'),
      )
    })

    it('should route to handleApprove for "approve" command', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.execute(
        'approve',
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
        mockOpenSettings,
      )
      expect(result.success).toBe(true)
      expect(mockOpenSettings).toHaveBeenCalledWith('workspace')
    })

    it('should route to handleStatus for "status" command', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.execute(
        'status',
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
        mockOpenSettings,
      )
      expect(result.success).toBe(true)
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('工作区状态'),
      )
    })

    it('should route to handleReview for "review" command', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.execute(
        'review',
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
        mockOpenSettings,
      )
      expect(result.success).toBe(true)
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('审查'),
      )
    })

    it('should route to handleTest for "test" command', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.execute(
        'test',
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
        mockOpenSettings,
      )
      expect(result.success).toBe(true)
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('单元测试'),
      )
    })

    it('should route to handleExplain for "explain" command', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.execute(
        'explain',
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
        mockOpenSettings,
      )
      expect(result.success).toBe(true)
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('解释以下代码'),
      )
    })

    it('should return error for unknown command', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.execute(
        'unknown',
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
        mockOpenSettings,
      )
      expect(result.success).toBe(false)
      expect(result.error).toBe('未知指令: #unknown')
    })

    it('should handle case-insensitive command names', async () => {
      expect.assertions(3)

      const resultUpper = await workspaceCommandHandler.execute(
        'INIT',
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
        mockOpenSettings,
      )
      expect(resultUpper.success).toBe(true)

      const resultMixed = await workspaceCommandHandler.execute(
        'InIt',
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
        mockOpenSettings,
      )
      expect(resultMixed.success).toBe(true)

      expect(mockSendMessage).toHaveBeenCalledTimes(2)
    })
  })

  describe('handleInit()', () => {
    it('should send project analysis message and return success', async () => {
      expect.assertions(3)
      const result = await workspaceCommandHandler.handleInit(
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
      )

      expect(result.success).toBe(true)
      expect(result.action).toEqual({
        type: 'send-message',
        content: expect.stringContaining('项目技术栈分析'),
      })
      expect(mockSendMessage).toHaveBeenCalledTimes(1)
    })

    it('should include all required analysis sections in message', async () => {
      expect.assertions(5)
      const result = await workspaceCommandHandler.handleInit(
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
      )

      const content = (result.action as Extract<CommandAction, { type: 'send-message' }>).content
      expect(content).toContain('项目技术栈分析')
      expect(content).toContain('目录结构说明')
      expect(content).toContain('主要依赖关系')
      expect(content).toContain('开发规范建议')
      expect(content).toContain('后续开发规划')
    })
  })

  describe('handleAgents()', () => {
    it('should open agents settings panel when onOpenSettings is provided', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.handleAgents(mockOpenSettings)

      expect(result.success).toBe(true)
      expect(mockOpenSettings).toHaveBeenCalledWith('agents')
    })

    it('should return error when onOpenSettings is not provided', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.handleAgents(undefined)

      expect(result.success).toBe(false)
      expect(result.error).toBe('无法打开 Agent 管理面板')
    })

    it('should return open-settings action on success', async () => {
      expect.assertions(1)
      const result = await workspaceCommandHandler.handleAgents(mockOpenSettings)

      expect(result.action).toEqual({
        type: 'open-settings',
        section: 'agents',
      })
    })
  })

  describe('handleNewTask()', () => {
    it('should create new conversation with correct title', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.handleNewTask(mockWorkspace)

      expect(result.success).toBe(true)
      expect(mockCreateConversation).toHaveBeenCalledWith(
        'Test Project - 新任务',
        undefined,
        'agent-leader-001',
        'workspace-test-001',
      )
    })

    it('should set knowledge bases when workspace has knowledgeBaseIds', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.handleNewTask(mockWorkspace)

      expect(result.success).toBe(true)
      expect(mockSetConversationKnowledgeBases).toHaveBeenCalledWith(
        'conv-new-001',
        ['kb-001', 'kb-002'],
      )
    })

    it('should not set knowledge bases when workspace has no knowledgeBaseIds', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.handleNewTask(mockWorkspaceNoKnowledgeBases)

      expect(result.success).toBe(true)
      expect(mockSetConversationKnowledgeBases).not.toHaveBeenCalled()
    })

    it('should select the newly created conversation', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.handleNewTask(mockWorkspace)

      expect(result.success).toBe(true)
      expect(mockSelectConversation).toHaveBeenCalledWith('conv-new-001')
    })

    it('should return new-conversation action with conversation id', async () => {
      expect.assertions(1)
      const result = await workspaceCommandHandler.handleNewTask(mockWorkspace)

      expect(result.action).toEqual({
        type: 'new-conversation',
        conversationId: 'conv-new-001',
      })
    })
  })

  describe('handleClear()', () => {
    it('should clear messages for the given conversation', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.handleClear(mockConversationId)

      expect(result.success).toBe(true)
      expect(mockClearMessages).toHaveBeenCalledWith(mockConversationId)
    })

    it('should return clear-conversation action', async () => {
      expect.assertions(1)
      const result = await workspaceCommandHandler.handleClear(mockConversationId)

      expect(result.action).toEqual({
        type: 'clear-conversation',
      })
    })
  })

  describe('handleCompact()', () => {
    it('should send context compression message', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.handleCompact(
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
      )

      expect(result.success).toBe(true)
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('上下文压缩'),
      )
    })

    it('should include all required summary sections', async () => {
      expect.assertions(4)
      const result = await workspaceCommandHandler.handleCompact(
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
      )

      const content = (result.action as Extract<CommandAction, { type: 'send-message' }>).content
      expect(content).toContain('已完成的任务')
      expect(content).toContain('当前进展')
      expect(content).toContain('待解决的问题')
      expect(content).toContain('下一步计划')
    })
  })

  describe('handleApprove()', () => {
    it('should open workspace settings when onOpenSettings is provided', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.handleApprove(mockOpenSettings)

      expect(result.success).toBe(true)
      expect(mockOpenSettings).toHaveBeenCalledWith('workspace')
    })

    it('should return error when onOpenSettings is not provided', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.handleApprove(undefined)

      expect(result.success).toBe(false)
      expect(result.error).toBe('无法打开设置面板')
    })

    it('should return open-settings action with workspace section', async () => {
      expect.assertions(1)
      const result = await workspaceCommandHandler.handleApprove(mockOpenSettings)

      expect(result.action).toEqual({
        type: 'open-settings',
        section: 'workspace',
      })
    })
  })

  describe('handleStatus()', () => {
    it('should send workspace status query message', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.handleStatus(
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
      )

      expect(result.success).toBe(true)
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('工作区状态'),
      )
    })

    it('should include all required status sections', async () => {
      expect.assertions(5)
      const result = await workspaceCommandHandler.handleStatus(
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
      )

      const content = (result.action as Extract<CommandAction, { type: 'send-message' }>).content
      expect(content).toContain('活跃 Agent')
      expect(content).toContain('已启用的工具')
      expect(content).toContain('审批策略')
      expect(content).toContain('当前任务进展')
      expect(content).toContain('待处理事项')
    })
  })

  describe('handleReview()', () => {
    it('should send code review request message', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.handleReview(
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
      )

      expect(result.success).toBe(true)
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('审查'),
      )
    })

    it('should include all required review sections', async () => {
      expect.assertions(5)
      const result = await workspaceCommandHandler.handleReview(
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
      )

      const content = (result.action as Extract<CommandAction, { type: 'send-message' }>).content
      expect(content).toContain('代码质量分析')
      expect(content).toContain('潜在问题')
      expect(content).toContain('性能优化建议')
      expect(content).toContain('安全风险评估')
      expect(content).toContain('改进建议')
    })
  })

  describe('handleTest()', () => {
    it('should send test generation request message', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.handleTest(
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
      )

      expect(result.success).toBe(true)
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('单元测试'),
      )
    })

    it('should include all required test sections', async () => {
      expect.assertions(4)
      const result = await workspaceCommandHandler.handleTest(
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
      )

      const content = (result.action as Extract<CommandAction, { type: 'send-message' }>).content
      expect(content).toContain('分析需要测试的功能')
      expect(content).toContain('生成测试用例')
      expect(content).toContain('运行测试并报告结果')
      expect(content).toContain('修复失败的测试')
    })
  })

  describe('handleExplain()', () => {
    it('should send code explanation request message', async () => {
      expect.assertions(2)
      const result = await workspaceCommandHandler.handleExplain(
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
      )

      expect(result.success).toBe(true)
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('解释以下代码'),
      )
    })

    it('should include placeholder for code input', async () => {
      expect.assertions(1)
      const result = await workspaceCommandHandler.handleExplain(
        mockWorkspace,
        mockConversationId,
        mockSendMessage,
      )

      const content = (result.action as Extract<CommandAction, { type: 'send-message' }>).content
      expect(content).toContain('请提供需要解释的代码或文件路径')
    })
  })
})
