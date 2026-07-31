import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type {
  BeginActionSnapshotRequest,
  CleanupActionSnapshotsRequest,
  FinalizeActionSnapshotRequest,
  InspectActionRollbackRequest,
  RollbackActionSnapshotRequest,
} from '../types/action-snapshot'

const ipcHandlers = new Map<string, (event: unknown, request: unknown) => Promise<unknown>>()
const mockHandle = jest.fn((channel: string, handler: (event: unknown, request: unknown) => Promise<unknown>) => {
  ipcHandlers.set(channel, handler)
})

jest.mock('electron', () => ({
  ipcMain: { handle: (...args: unknown[]) => mockHandle(...(args as [string, (event: unknown, request: unknown) => Promise<unknown>])) },
}))

import { setupWorkspaceActionSnapshotHandlers } from '../../electron/main/workspace-action-snapshot-handler'

const ACTION_CHANNELS = {
  begin: 'workspace:action-snapshot:begin',
  finalize: 'workspace:action-snapshot:finalize',
  inspect: 'workspace:action-snapshot:inspect-rollback',
  rollback: 'workspace:action-snapshot:rollback',
  delete: 'workspace:action-snapshot:delete',
  cleanup: 'workspace:action-snapshot:cleanup',
} as const

function invoke<T>(channel: string, request: unknown): Promise<T> {
  const handler = ipcHandlers.get(channel)
  if (!handler) throw new Error(`IPC handler not registered: ${channel}`)
  return handler(undefined, request) as Promise<T>
}

describe('workspace action snapshot IPC', () => {
  let rootPath: string
  let context: Omit<BeginActionSnapshotRequest, 'folderPath'>

  beforeAll(() => {
    setupWorkspaceActionSnapshotHandlers()
  })

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'action-snapshot-'))
    context = {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      actionId: 'action-1',
      messageId: 'message-1',
    }
  })

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true })
  })

  it('注册七个白名单 IPC 处理器', () => {
    expect([...ipcHandlers.keys()]).toEqual(expect.arrayContaining(Object.values(ACTION_CHANNELS)))
    expect(ipcHandlers).toHaveProperty('size', 7)
  })

  it('拒绝缺失上下文字段和非法 snapshotId', async () => {
    const invalidBegin = await invoke<{ success: false; errorCode: string }>(ACTION_CHANNELS.begin, {
      folderPath: rootPath,
      ...context,
      actionId: '',
    })
    const invalidInspect = await invoke<{ success: false; errorCode: string }>(ACTION_CHANNELS.inspect, {
      folderPath: rootPath,
      ...context,
      snapshotId: '../outside',
    })

    expect(invalidBegin).toMatchObject({ success: false, errorCode: 'INVALID_REQUEST' })
    expect(invalidInspect).toMatchObject({ success: false, errorCode: 'INVALID_REQUEST' })
  })

  it('采集文本/二进制 SHA-256，并忽略 node_modules 与内部 VCS 目录', async () => {
    await mkdir(join(rootPath, 'src'), { recursive: true })
    await writeFile(join(rootPath, 'src', 'text.txt'), 'hello snapshot\n')
    await writeFile(join(rootPath, 'src', 'binary.bin'), Buffer.from([0, 1, 2, 255]))
    await mkdir(join(rootPath, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(join(rootPath, 'node_modules', 'pkg', 'ignored.js'), 'ignored')

    const begun = await invoke<{ success: true; snapshotId: string }>(ACTION_CHANNELS.begin, {
      folderPath: rootPath,
      ...context,
    })
    expect(begun.success).toBe(true)

    const manifestPath = join(rootPath, '.ai-workspace-vcs', 'action-snapshots', begun.snapshotId, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      beforeEntries: Array<{ path: string; sha256?: string; binary?: boolean }>
    }
    const text = manifest.beforeEntries.find((entry) => entry.path === 'src/text.txt')
    const binary = manifest.beforeEntries.find((entry) => entry.path === 'src/binary.bin')

    expect(text).toMatchObject({ binary: false })
    expect(text?.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(binary).toMatchObject({ binary: true })
    expect(binary?.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(manifest.beforeEntries.some((entry) => entry.path.includes('node_modules'))).toBe(false)
    expect(manifest.beforeEntries.some((entry) => entry.path.includes('.ai-workspace-vcs'))).toBe(false)
  })

  it('封存 added/modified/deleted/renamed，空变化可安全回滚', async () => {
    await writeFile(join(rootPath, 'modify.txt'), 'before')
    await writeFile(join(rootPath, 'delete.txt'), 'delete me')
    await writeFile(join(rootPath, 'old-name.txt'), 'same rename content')

    const begun = await invoke<{ success: true; snapshotId: string }>(ACTION_CHANNELS.begin, {
      folderPath: rootPath,
      ...context,
    })

    await writeFile(join(rootPath, 'modify.txt'), 'after')
    await rm(join(rootPath, 'delete.txt'))
    await rm(join(rootPath, 'old-name.txt'))
    await writeFile(join(rootPath, 'new-name.txt'), 'same rename content')
    await writeFile(join(rootPath, 'added.txt'), 'added')

    const finalizeRequest: FinalizeActionSnapshotRequest = {
      folderPath: rootPath,
      ...context,
      snapshotId: begun.snapshotId,
    }
    const finalized = await invoke<{ success: true; changes: Array<{ type: string; path: string; previousPath?: string }> }>(
      ACTION_CHANNELS.finalize,
      finalizeRequest,
    )

    expect(finalized.success).toBe(true)
    expect(finalized.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'added', path: 'added.txt' }),
      expect.objectContaining({ type: 'modified', path: 'modify.txt' }),
      expect.objectContaining({ type: 'deleted', path: 'delete.txt' }),
      expect.objectContaining({ type: 'renamed', path: 'new-name.txt', previousPath: 'old-name.txt' }),
    ]))

    const emptyContext = { ...context, actionId: 'empty-action' }
    const emptyBegin = await invoke<{ success: true; snapshotId: string }>(ACTION_CHANNELS.begin, {
      folderPath: rootPath,
      ...emptyContext,
    })
    const emptyFinalize = await invoke<{ success: true; changes: unknown[] }>(ACTION_CHANNELS.finalize, {
      folderPath: rootPath,
      ...emptyContext,
      snapshotId: emptyBegin.snapshotId,
    })
    expect(emptyFinalize.changes).toEqual([])
  })

  it('检测 action 后的外部修改并在正式回滚时二次阻止', async () => {
    await writeFile(join(rootPath, 'file.txt'), 'before')
    const begun = await invoke<{ success: true; snapshotId: string }>(ACTION_CHANNELS.begin, {
      folderPath: rootPath,
      ...context,
    })
    await writeFile(join(rootPath, 'file.txt'), 'after')

    const request: InspectActionRollbackRequest = {
      folderPath: rootPath,
      ...context,
      snapshotId: begun.snapshotId,
    }
    await invoke(ACTION_CHANNELS.finalize, request)
    await writeFile(join(rootPath, 'file.txt'), 'external edit')

    const inspected = await invoke<{ success: true; canRollback: boolean; conflicts: Array<{ path: string; reason: string }> }>(
      ACTION_CHANNELS.inspect,
      request,
    )
    const rolledBack = await invoke<{ success: false; errorCode: string; conflicts: unknown[] }>(
      ACTION_CHANNELS.rollback,
      request as RollbackActionSnapshotRequest,
    )

    expect(inspected).toMatchObject({ success: true, canRollback: false })
    expect(inspected.conflicts).toContainEqual(expect.objectContaining({ path: 'file.txt', reason: 'content-changed' }))
    expect(rolledBack).toMatchObject({ success: false, errorCode: 'ROLLBACK_CONFLICT' })
    expect(await readFile(join(rootPath, 'file.txt'), 'utf8')).toBe('external edit')
  })

  it('成功回滚新增、修改、删除和重命名，并生成 protection 快照', async () => {
    await writeFile(join(rootPath, 'modify.txt'), 'before')
    await writeFile(join(rootPath, 'delete.txt'), 'deleted content')
    await writeFile(join(rootPath, 'old.txt'), 'rename content')
    const begun = await invoke<{ success: true; snapshotId: string }>(ACTION_CHANNELS.begin, {
      folderPath: rootPath,
      ...context,
    })

    await writeFile(join(rootPath, 'modify.txt'), 'after')
    await rm(join(rootPath, 'delete.txt'))
    await rm(join(rootPath, 'old.txt'))
    await writeFile(join(rootPath, 'new.txt'), 'rename content')
    await writeFile(join(rootPath, 'added.txt'), 'added')
    const request = { folderPath: rootPath, ...context, snapshotId: begun.snapshotId }
    await invoke(ACTION_CHANNELS.finalize, request)

    const result = await invoke<{ success: true; protectionSnapshotId: string }>(ACTION_CHANNELS.rollback, request)

    expect(result.success).toBe(true)
    expect(result.protectionSnapshotId).toMatch(/^protection-/)
    expect(await readFile(join(rootPath, 'modify.txt'), 'utf8')).toBe('before')
    expect(await readFile(join(rootPath, 'delete.txt'), 'utf8')).toBe('deleted content')
    expect(await readFile(join(rootPath, 'old.txt'), 'utf8')).toBe('rename content')
    await expect(readFile(join(rootPath, 'new.txt'))).rejects.toThrow()
    await expect(readFile(join(rootPath, 'added.txt'))).rejects.toThrow()
  })

  it('拒绝工作区中的符号链接', async () => {
    const external = await mkdtemp(join(tmpdir(), 'snapshot-external-'))
    await writeFile(join(external, 'secret.txt'), 'secret')
    try {
      await symlink(join(external, 'secret.txt'), join(rootPath, 'link.txt'), 'file')
      const result = await invoke<{ success: false; errorCode: string }>(ACTION_CHANNELS.begin, {
        folderPath: rootPath,
        ...context,
      })
      expect(result).toMatchObject({ success: false, errorCode: 'SYMLINK_OUTSIDE_WORKSPACE' })
    } finally {
      await rm(external, { recursive: true, force: true })
    }
  })

  it('cleanup 保留引用快照，并按数量上限清除未引用快照', async () => {
    const snapshots: string[] = []
    for (let index = 0; index < 3; index++) {
      const actionContext = { ...context, actionId: `cleanup-${index}` }
      const begun = await invoke<{ success: true; snapshotId: string }>(ACTION_CHANNELS.begin, {
        folderPath: rootPath,
        ...actionContext,
      })
      snapshots.push(begun.snapshotId)
    }

    const cleanupRequest: CleanupActionSnapshotsRequest = {
      folderPath: rootPath,
      workspaceId: context.workspaceId,
      retainedSnapshotIds: [snapshots[0]],
      maxSnapshots: 1,
      maxBytes: Number.MAX_SAFE_INTEGER,
      orphanTtlMs: Number.MAX_SAFE_INTEGER,
    }
    const cleaned = await invoke<{
      success: true
      removedSnapshotIds: string[]
      remainingSnapshots: number
    }>(ACTION_CHANNELS.cleanup, cleanupRequest)

    expect(cleaned.success).toBe(true)
    expect(cleaned.removedSnapshotIds).not.toContain(snapshots[0])
    expect(cleaned.removedSnapshotIds).toHaveLength(2)
    expect(cleaned.remainingSnapshots).toBe(1)
    const remaining = await readdir(join(rootPath, '.ai-workspace-vcs', 'action-snapshots'))
    expect(remaining).toEqual([snapshots[0]])
  })
})
