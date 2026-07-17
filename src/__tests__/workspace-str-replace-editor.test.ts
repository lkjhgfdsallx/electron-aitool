/// <reference path="../types/electron.d.ts" />

import { TextEncoder } from 'util'
import { WorkspaceToolExecutor } from '../services/agent/executors/workspace-executor'

if (!globalThis.TextEncoder) {
  ;(globalThis as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder
}

const mockReadFile = jest.fn()
const mockWriteFile = jest.fn()
const files = new Map<string, string>()
const mockRunPostWriteLint = jest.fn()
const mockFormatPostWriteLintBlock = jest.fn(() => 'POST_WRITE_LINT_BLOCKED\ndecision: block')

jest.mock('../services/workspace-fs-service', () => ({
  workspaceFsService: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
  },
}))

jest.mock('../services/workspace-post-write-lint', () => ({
  runPostWriteLint: (...args: unknown[]) => mockRunPostWriteLint(...args),
  formatPostWriteLintBlock: () => mockFormatPostWriteLintBlock(),
}))

jest.mock('../services/built-in-tools', () => ({
  BUILT_IN_TOOLS: [],
  AGENT_BUILTIN_TOOLS: [],
  WORKSPACE_TOOLS: [],
}))
jest.mock('../services/tool-group-service', () => ({ isToolAutoApproved: jest.fn(() => false) }))
jest.mock('../stores/conversation-store', () => ({ useConversationStore: { getState: jest.fn(() => ({ addTerminalLog: jest.fn() })) } }))
jest.mock('../stores/workspace-agent-store', () => ({ useWorkspaceAgentStore: { getState: jest.fn() } }))
jest.mock('../stores/agent-store', () => ({ useAgentStore: { getState: jest.fn() } }))
jest.mock('../stores/workspace-store', () => ({ useWorkspaceStore: { getState: jest.fn() } }))
jest.mock('../stores/ai-provider-store', () => ({ useAIProviderStore: { getState: jest.fn() } }))
jest.mock('../services/agent-engine', () => ({ runAgent: jest.fn() }))

describe('WorkspaceToolExecutor workspace_str_replace_editor', () => {
  const executor = new WorkspaceToolExecutor()
  const context = (approval?: jest.Mock) => ({
    agentId: 'agent-1',
    agentName: 'Editor',
    artifacts: [] as string[],
    workspace: {
      folderPath: '/workspace',
      autoApproval: approval ? {} : undefined,
      onFileActionApproval: approval,
    },
  }) as any

  beforeEach(() => {
    files.clear()
    jest.clearAllMocks()
    mockReadFile.mockImplementation(async (path: string) => {
      const content = files.get(path)
      return content === undefined ? { success: false, error: 'not found' } : { success: true, content, truncated: false }
    })
    mockWriteFile.mockImplementation(async (path: string, content: string) => { files.set(path, content) })
    mockRunPostWriteLint.mockResolvedValue({ decision: 'allow', runs: [] })
  })

  it('按顺序完成 replace、锚点插入与追加', async () => {
    files.set('/workspace/a.ts', 'const value = 1;\n')
    const result = await executor.execute('workspace_str_replace_editor', {
      operations: [
        { file_path: 'a.ts', operation: 'replace', old_string: 'value = 1', new_string: 'value = 2' },
        { file_path: 'a.ts', operation: 'insert_after', anchor_string: 'const value = 2;', content: '\nconsole.log(value);' },
        { file_path: 'a.ts', operation: 'append', content: '// end\n' },
      ],
    }, {}, context())

    if (!result.success) throw new Error(result.error)
    expect(files.get('/workspace/a.ts')).toBe('const value = 2;\nconsole.log(value);\n// end\n')
    expect(mockWriteFile).toHaveBeenCalledTimes(1)
  })

  it('任一文件预检失败时不写入任何文件', async () => {
    files.set('/workspace/a.ts', 'alpha')
    files.set('/workspace/b.ts', 'beta')
    const result = await executor.execute('workspace_str_replace_editor', {
      operations: [
        { file_path: 'a.ts', operation: 'replace', old_string: 'alpha', new_string: 'changed' },
        { file_path: 'b.ts', operation: 'replace', old_string: 'missing', new_string: 'changed' },
      ],
    }, {}, context())

    expect(result.success).toBe(false)
    expect(result.error).toContain('匹配了 0 次')
    expect(files.get('/workspace/a.ts')).toBe('alpha')
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('审批拒绝时不写入任何文件', async () => {
    files.set('/workspace/a.ts', 'alpha')
    const approval = jest.fn(async () => 'denied')
    const result = await executor.execute('workspace_str_replace_editor', {
      operations: [{ file_path: 'a.ts', operation: 'insert_before', anchor_string: 'alpha', content: '// ' }],
    }, {}, context(approval))

    expect(result.success).toBe(false)
    expect(result.error).toContain('拒绝')
    expect(approval).toHaveBeenCalledTimes(1)
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('检查失败时保留已写入的文件，并将 block 结果返回给 Agent', async () => {
    files.set('/workspace/a.ts', 'const value = 1;\n')
    mockRunPostWriteLint.mockResolvedValue({
      decision: 'block',
      runs: [{ linterId: 'eslint', command: 'eslint a.ts', exitCode: 1, stdout: '', stderr: 'unexpected error', durationMs: 1, files: ['a.ts'] }],
    })
    const lintConfig = { enabled: true, timeoutMs: 30000, maxOutputChars: 6000, disabledLinters: [], customCommands: [] }
    const result = await executor.execute('workspace_str_replace_editor', {
      operations: [{ file_path: 'a.ts', operation: 'replace', old_string: 'value = 1', new_string: 'value = 2' }],
    }, {}, {
      ...context(),
      workspace: { ...context().workspace, postWriteLint: lintConfig },
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('POST_WRITE_LINT_BLOCKED')
    expect(JSON.parse(result.data)).toMatchObject({ decision: 'block', written: true, files: ['a.ts'] })
    expect(files.get('/workspace/a.ts')).toBe('const value = 2;\n')
    expect(mockRunPostWriteLint).toHaveBeenCalledWith(expect.objectContaining({ relativePaths: ['a.ts'], config: lintConfig }))
  })
})
