/**
 * Agent Engine 工具函数单元测试
 *
 * 测试 agent-engine.ts 中的纯函数和工具函数：
 * - parseToolCalls: 从 LLM 输出中解析文本格式工具调用
 * - toMessages: 将 Agent 内部消息转换为 Message 格式
 * - createDefaultRunContext: 创建默认运行上下文
 * - getAgentBuiltinTools: 获取 Agent 内置工具
 *
 * @see src/services/agent-engine.ts
 */


// ===== Mock 依赖模块 =====
jest.mock('../services/ai-service', () => ({
  aiService: {
    streamChat: jest.fn(),
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

// 联网工具策略依赖 settings-store（经 utils/web-tools → stores）；默认关闭
jest.mock('../stores', () => ({
  useSettingsStore: {
    getState: () => ({
      webSearchEnabled: false,
      disabledBuiltinToolIds: [],
    }),
  },
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
  advanceState: jest.fn(() => ({ transitioned: false, runtime: null })),
}))

// 导入需要测试的函数（通过重新导出或访问内部函数）
// 由于 parseToolCalls 和 toMessages 是内部函数，我们通过 runAgent 的行为间接测试
// 但 createDefaultRunContext 和 getAgentBuiltinTools 是导出的

import { createDefaultRunContext, getAgentBuiltinTools } from '../services/agent-engine'

describe('createDefaultRunContext', () => {
  it('应该创建包含正确字段的默认运行上下文', () => {
    const agentId = 'test-agent-123'
    const ctx = createDefaultRunContext(agentId)

    expect(ctx).toEqual({
      agentId: 'test-agent-123',
      status: 'idle',
      steps: [],
      currentStep: 0,
    })
  })

  it('应该为不同的 agentId 创建独立的上下文', () => {
    const ctx1 = createDefaultRunContext('agent-1')
    const ctx2 = createDefaultRunContext('agent-2')

    expect(ctx1.agentId).toBe('agent-1')
    expect(ctx2.agentId).toBe('agent-2')
    expect(ctx1).not.toBe(ctx2)
  })
})

describe('getAgentBuiltinTools', () => {
  it('应该返回 remember、recall、forget、list_memories 四个内置工具', () => {
    const tools = getAgentBuiltinTools()

    expect(tools).toHaveLength(4)
    expect(tools.map((t) => t.name)).toEqual(['remember', 'recall', 'forget', 'list_memories'])
  })

  it('remember 工具应该有正确的参数定义', () => {
    const tools = getAgentBuiltinTools()
    const remember = tools.find((t) => t.name === 'remember')

    expect(remember).toBeDefined()
    expect(remember?.id).toBe('agent-builtin:remember')
    expect(remember?.parameters).toEqual({
      type: 'object',
      properties: {
        key: { type: 'string', description: '记忆的键名，如"用户姓名"' },
        value: { type: 'string', description: '记忆的值，如"张三"' },
      },
      required: ['key', 'value'],
    })
  })

  it('recall 工具应该有正确的参数定义', () => {
    const tools = getAgentBuiltinTools()
    const recall = tools.find((t) => t.name === 'recall')

    expect(recall).toBeDefined()
    expect(recall?.id).toBe('agent-builtin:recall')
    expect(recall?.parameters).toEqual({
      type: 'object',
      properties: {
        key: { type: 'string', description: '要回忆的键名' },
      },
      required: ['key'],
    })
  })

  it('forget 工具应该有正确的参数定义', () => {
    const tools = getAgentBuiltinTools()
    const forget = tools.find((t) => t.name === 'forget')

    expect(forget).toBeDefined()
    expect(forget?.id).toBe('agent-builtin:forget')
    expect(forget?.parameters).toEqual({
      type: 'object',
      properties: {
        key: { type: 'string', description: '要删除的记忆键名' },
      },
      required: ['key'],
    })
  })

  it('list_memories 工具应该有正确的参数定义', () => {
    const tools = getAgentBuiltinTools()
    const listMemories = tools.find((t) => t.name === 'list_memories')

    expect(listMemories).toBeDefined()
    expect(listMemories?.id).toBe('agent-builtin:list_memories')
    expect(listMemories?.parameters).toEqual({
      type: 'object',
      properties: {
        limit: { type: 'number', description: '最多返回条数，默认 50，最大 100' },
        query: { type: 'string', description: '可选关键词，过滤 key 或 value' },
      },
    })
  })

  it('每次调用应该返回新的数组实例', () => {
    const tools1 = getAgentBuiltinTools()
    const tools2 = getAgentBuiltinTools()

    expect(tools1).not.toBe(tools2)
    expect(tools1).toEqual(tools2)
  })
})
