import { ipcMain } from 'electron'
import { createHash, randomUUID } from 'crypto'
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import type {
  ActionSnapshotEntry,
  ActionSnapshotErrorCode,
  ActionSnapshotFailure,
  ActionSnapshotManifest,
  BeginActionSnapshotRequest,
  BeginActionSnapshotResult,
  CleanupActionSnapshotsRequest,
  CleanupActionSnapshotsResult,
  DeleteActionSnapshotRequest,
  DeleteActionSnapshotResult,
  FinalizeActionSnapshotRequest,
  FinalizeActionSnapshotResult,
  InspectActionRollbackRequest,
  InspectActionRollbackResult,
  RestoreProtectionRequest,
  RestoreProtectionResult,
  RollbackActionSnapshotRequest,
  RollbackActionSnapshotResult,
  RollbackConflict,
  WorkspaceFileChange,
} from '../../src/types/action-snapshot'

const VCS_DIR = '.ai-workspace-vcs'
const SNAPSHOTS_DIR = 'action-snapshots'
const MANIFEST_FILE = 'manifest.json'
const DEFAULT_MAX_SNAPSHOTS = 200
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024
const DEFAULT_ORPHAN_TTL_MS = 7 * 24 * 60 * 60 * 1000

const IGNORED_NAMES = new Set([
  '.git',
  VCS_DIR,
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.cache',
  '.next',
  '.nuxt',
  '.turbo',
  '.vite',
  'target',
])

class SnapshotError extends Error {
  constructor(
    readonly code: ActionSnapshotErrorCode,
    message: string,
  ) {
    super(message)
  }
}

interface ScanResult {
  entries: ActionSnapshotEntry[]
  digest: string
}

interface ProtectionEntry {
  path: string
  existed: boolean
  type?: 'file' | 'directory'
}

function failure(error: unknown): ActionSnapshotFailure {
  if (error instanceof SnapshotError) {
    return { success: false, errorCode: error.code, error: error.message }
  }
  return {
    success: false,
    errorCode: 'IO_ERROR',
    error: error instanceof Error ? error.message : String(error),
  }
}

function assertNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SnapshotError('INVALID_REQUEST', `${field} 不能为空`)
  }
}

function normalizeRelativePath(value: string): string {
  return value.split(sep).join('/')
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

async function validateWorkspaceRoot(folderPath: unknown): Promise<string> {
  assertNonEmpty(folderPath, 'folderPath')
  const absolute = resolve(folderPath)
  let info
  try {
    info = await stat(absolute)
  } catch {
    throw new SnapshotError('INVALID_WORKSPACE_ROOT', '工作区根目录不存在')
  }
  if (!info.isDirectory()) {
    throw new SnapshotError('INVALID_WORKSPACE_ROOT', '工作区根路径不是目录')
  }
  return await realpath(absolute)
}

function validateContext(request: {
  workspaceId?: unknown
  conversationId?: unknown
  runId?: unknown
  actionId?: unknown
}): void {
  assertNonEmpty(request.workspaceId, 'workspaceId')
  assertNonEmpty(request.conversationId, 'conversationId')
  assertNonEmpty(request.runId, 'runId')
  assertNonEmpty(request.actionId, 'actionId')
}

function snapshotsRoot(root: string): string {
  return join(root, VCS_DIR, SNAPSHOTS_DIR)
}

function assertSnapshotId(snapshotId: unknown): asserts snapshotId is string {
  assertNonEmpty(snapshotId, 'snapshotId')
  if (!/^[a-zA-Z0-9_-]+$/.test(snapshotId)) {
    throw new SnapshotError('INVALID_REQUEST', 'snapshotId 格式非法')
  }
}

function snapshotDir(root: string, snapshotId: string): string {
  assertSnapshotId(snapshotId)
  const candidate = resolve(snapshotsRoot(root), snapshotId)
  if (!isWithin(snapshotsRoot(root), candidate)) {
    throw new SnapshotError('PATH_OUTSIDE_WORKSPACE', '快照路径越界')
  }
  return candidate
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(data, null, 2), 'utf8')
  await rename(temporary, path)
}

async function readManifest(root: string, snapshotId: string): Promise<ActionSnapshotManifest> {
  const path = join(snapshotDir(root, snapshotId), MANIFEST_FILE)
  try {
    return JSON.parse(await readFile(path, 'utf8')) as ActionSnapshotManifest
  } catch (error) {
    if (error instanceof SyntaxError) throw new SnapshotError('IO_ERROR', '快照清单损坏')
    throw new SnapshotError('SNAPSHOT_NOT_FOUND', `找不到快照 ${snapshotId}`)
  }
}

function validateManifestContext(
  manifest: ActionSnapshotManifest,
  request: { workspaceId: string; conversationId: string; runId: string; actionId: string },
): void {
  if (
    manifest.workspaceId !== request.workspaceId ||
    manifest.conversationId !== request.conversationId ||
    manifest.runId !== request.runId ||
    manifest.actionId !== request.actionId
  ) {
    throw new SnapshotError('SNAPSHOT_ID_MISMATCH', '快照与当前 action 上下文不匹配')
  }
}

function isBinary(buffer: Buffer): boolean {
  const length = Math.min(buffer.length, 8192)
  for (let i = 0; i < length; i++) {
    if (buffer[i] === 0) return true
  }
  return false
}

async function scanWorkspace(root: string, destination?: string): Promise<ScanResult> {
  const entries: ActionSnapshotEntry[] = []

  async function walk(current: string, relativeDir: string): Promise<void> {
    const children = await readdir(current, { withFileTypes: true })
    children.sort((a, b) => a.name.localeCompare(b.name))
    for (const child of children) {
      if (IGNORED_NAMES.has(child.name)) continue
      const absolutePath = join(current, child.name)
      const relativePath = relativeDir ? `${relativeDir}/${child.name}` : child.name
      const info = await lstat(absolutePath)
      if (info.isSymbolicLink()) {
        let target = ''
        try {
          target = await realpath(absolutePath)
        } catch {
          throw new SnapshotError('SYMLINK_OUTSIDE_WORKSPACE', `符号链接无法解析：${relativePath}`)
        }
        if (!isWithin(root, target)) {
          throw new SnapshotError('SYMLINK_OUTSIDE_WORKSPACE', `符号链接指向工作区外：${relativePath}`)
        }
        // 即使目标位于根目录内，也拒绝快照，避免恢复时改变链接语义或重复写入目标。
        throw new SnapshotError('SYMLINK_OUTSIDE_WORKSPACE', `暂不支持包含符号链接的 action 快照：${relativePath}`)
      }
      if (info.isDirectory()) {
        entries.push({ path: relativePath, type: 'directory', size: 0, mtimeMs: info.mtimeMs })
        if (destination) await mkdir(join(destination, ...relativePath.split('/')), { recursive: true })
        await walk(absolutePath, relativePath)
        continue
      }
      if (!info.isFile()) continue
      const buffer = await readFile(absolutePath)
      const entry: ActionSnapshotEntry = {
        path: relativePath,
        type: 'file',
        sha256: createHash('sha256').update(buffer).digest('hex'),
        size: info.size,
        mtimeMs: info.mtimeMs,
        binary: isBinary(buffer),
      }
      entries.push(entry)
      if (destination) {
        const output = join(destination, ...relativePath.split('/'))
        await mkdir(dirname(output), { recursive: true })
        await writeFile(output, buffer)
      }
    }
  }

  await walk(root, '')
  entries.sort((a, b) => a.path.localeCompare(b.path))
  const digest = createHash('sha256')
    .update(entries.map(({ path, type, sha256, size }) => `${path}\0${type}\0${sha256 ?? ''}\0${size}`).join('\n'))
    .digest('hex')
  return { entries, digest }
}

function sameEntry(a?: ActionSnapshotEntry, b?: ActionSnapshotEntry): boolean {
  if (!a || !b) return a === b
  return a.type === b.type && (a.type === 'directory' || a.sha256 === b.sha256)
}

function calculateChanges(
  beforeEntries: ActionSnapshotEntry[],
  afterEntries: ActionSnapshotEntry[],
): WorkspaceFileChange[] {
  const before = new Map(beforeEntries.map((entry) => [entry.path, entry]))
  const after = new Map(afterEntries.map((entry) => [entry.path, entry]))
  const deleted: WorkspaceFileChange[] = []
  const added: WorkspaceFileChange[] = []
  const changes: WorkspaceFileChange[] = []

  for (const [path, oldEntry] of before) {
    const newEntry = after.get(path)
    if (!newEntry) deleted.push({ type: 'deleted', path, before: oldEntry })
    else if (!sameEntry(oldEntry, newEntry)) {
      changes.push({ type: 'modified', path, before: oldEntry, after: newEntry })
    }
  }
  for (const [path, newEntry] of after) {
    if (!before.has(path)) added.push({ type: 'added', path, after: newEntry })
  }

  // 仅对文件内容完全一致的一对一新增/删除推断重命名；目录由其子项变化自然恢复。
  const usedAdded = new Set<number>()
  for (const removed of deleted) {
    if (removed.before?.type !== 'file') {
      changes.push(removed)
      continue
    }
    const match = added.findIndex((candidate, index) =>
      !usedAdded.has(index) &&
      candidate.after?.type === 'file' &&
      candidate.after.sha256 === removed.before?.sha256,
    )
    if (match >= 0) {
      usedAdded.add(match)
      changes.push({
        type: 'renamed',
        path: added[match].path,
        previousPath: removed.path,
        before: removed.before,
        after: added[match].after,
      })
    } else changes.push(removed)
  }
  added.forEach((change, index) => {
    if (!usedAdded.has(index)) changes.push(change)
  })
  return changes.sort((a, b) => (a.previousPath ?? a.path).localeCompare(b.previousPath ?? b.path))
}

async function inspectPath(root: string, path: string): Promise<ActionSnapshotEntry | undefined> {
  const absolute = resolve(root, ...path.split('/'))
  if (!isWithin(root, absolute)) throw new SnapshotError('PATH_OUTSIDE_WORKSPACE', `路径越界：${path}`)
  let info
  try {
    info = await lstat(absolute)
  } catch {
    return undefined
  }
  if (info.isSymbolicLink()) {
    throw new SnapshotError('SYMLINK_OUTSIDE_WORKSPACE', `回滚路径变为符号链接：${path}`)
  }
  if (info.isDirectory()) return { path, type: 'directory', size: 0, mtimeMs: info.mtimeMs }
  if (!info.isFile()) return undefined
  const buffer = await readFile(absolute)
  return {
    path,
    type: 'file',
    sha256: createHash('sha256').update(buffer).digest('hex'),
    size: info.size,
    mtimeMs: info.mtimeMs,
    binary: isBinary(buffer),
  }
}

function affectedPaths(change: WorkspaceFileChange): string[] {
  return change.type === 'renamed' && change.previousPath
    ? [change.previousPath, change.path]
    : [change.path]
}

async function inspectManifest(root: string, manifest: ActionSnapshotManifest): Promise<RollbackConflict[]> {
  if (manifest.state !== 'ready') {
    throw new SnapshotError('SNAPSHOT_NOT_READY', `快照状态 ${manifest.state} 不可回滚`)
  }
  const conflicts: RollbackConflict[] = []
  const expectedAfter = new Map((manifest.afterEntries ?? []).map((entry) => [entry.path, entry]))
  const paths = new Set(manifest.changes.flatMap(affectedPaths))
  for (const path of paths) {
    let actual: ActionSnapshotEntry | undefined
    try {
      actual = await inspectPath(root, path)
    } catch (error) {
      if (error instanceof SnapshotError && error.code === 'SYMLINK_OUTSIDE_WORKSPACE') {
        conflicts.push({ path, reason: 'unsafe-symlink', expected: expectedAfter.get(path) })
        continue
      }
      throw error
    }
    const expected = expectedAfter.get(path)
    if (sameEntry(expected, actual)) continue
    const reason = expected && !actual
      ? 'missing'
      : !expected && actual
        ? 'unexpected'
        : expected?.type !== actual?.type
          ? 'type-changed'
          : 'content-changed'
    conflicts.push({ path, reason, expected, actual })
  }
  return conflicts
}

async function begin(request: BeginActionSnapshotRequest): Promise<BeginActionSnapshotResult> {
  try {
    validateContext(request)
    const root = await validateWorkspaceRoot(request.folderPath)
    const snapshotId = `action-${Date.now()}-${randomUUID()}`
    const directory = snapshotDir(root, snapshotId)
    await mkdir(join(directory, 'before'), { recursive: true })
    const before = await scanWorkspace(root, join(directory, 'before'))
    const manifest: ActionSnapshotManifest = {
      version: 1,
      snapshotId,
      folderPath: root,
      workspaceId: request.workspaceId,
      conversationId: request.conversationId,
      runId: request.runId,
      actionId: request.actionId,
      messageId: request.messageId,
      state: 'executing',
      createdAt: Date.now(),
      beforeDigest: before.digest,
      beforeEntries: before.entries,
      changes: [],
      sideEffectHints: request.sideEffectHints ?? [],
    }
    await writeJsonAtomic(join(directory, MANIFEST_FILE), manifest)
    return { success: true, snapshotId, beforeDigest: before.digest, state: 'executing' }
  } catch (error) {
    return failure(error)
  }
}

async function finalize(request: FinalizeActionSnapshotRequest): Promise<FinalizeActionSnapshotResult> {
  try {
    validateContext(request)
    assertSnapshotId(request.snapshotId)
    const root = await validateWorkspaceRoot(request.folderPath)
    const manifest = await readManifest(root, request.snapshotId)
    validateManifestContext(manifest, request)
    if (manifest.state !== 'executing' && manifest.state !== 'finalizing') {
      throw new SnapshotError('SNAPSHOT_NOT_READY', `快照状态 ${manifest.state} 无法封存`)
    }
    manifest.state = 'finalizing'
    await writeJsonAtomic(join(snapshotDir(root, request.snapshotId), MANIFEST_FILE), manifest)
    const afterDir = join(snapshotDir(root, request.snapshotId), 'after')
    await rm(afterDir, { recursive: true, force: true })
    await mkdir(afterDir, { recursive: true })
    const after = await scanWorkspace(root, afterDir)
    manifest.afterEntries = after.entries
    manifest.afterDigest = after.digest
    manifest.changes = calculateChanges(manifest.beforeEntries, after.entries)
    manifest.sideEffectHints = request.sideEffectHints ?? manifest.sideEffectHints
    manifest.failureReason = request.failureReason
    manifest.finalizedAt = Date.now()
    manifest.state = 'ready'
    await writeJsonAtomic(join(snapshotDir(root, request.snapshotId), MANIFEST_FILE), manifest)
    return {
      success: true,
      snapshotId: request.snapshotId,
      afterDigest: after.digest,
      state: 'ready',
      changes: manifest.changes,
    }
  } catch (error) {
    return failure(error)
  }
}

async function inspectRollback(request: InspectActionRollbackRequest): Promise<InspectActionRollbackResult> {
  try {
    validateContext(request)
    assertSnapshotId(request.snapshotId)
    const root = await validateWorkspaceRoot(request.folderPath)
    const manifest = await readManifest(root, request.snapshotId)
    validateManifestContext(manifest, request)
    const conflicts = await inspectManifest(root, manifest)
    return {
      success: true,
      snapshotId: request.snapshotId,
      canRollback: conflicts.length === 0,
      conflicts,
      changes: manifest.changes,
      sideEffectHints: manifest.sideEffectHints,
    }
  } catch (error) {
    return failure(error)
  }
}

async function copyProtection(root: string, directory: string, paths: string[]): Promise<ProtectionEntry[]> {
  const entries: ProtectionEntry[] = []
  for (const path of [...new Set(paths)].sort()) {
    const current = await inspectPath(root, path)
    if (!current) {
      entries.push({ path, existed: false })
      continue
    }
    entries.push({ path, existed: true, type: current.type })
    const source = join(root, ...path.split('/'))
    const destination = join(directory, 'content', ...path.split('/'))
    if (current.type === 'directory') await mkdir(destination, { recursive: true })
    else {
      await mkdir(dirname(destination), { recursive: true })
      await copyFile(source, destination)
    }
  }
  await writeJsonAtomic(join(directory, 'protection.json'), entries)
  return entries
}

async function restoreProtection(root: string, directory: string, entries: ProtectionEntry[]): Promise<void> {
  for (const entry of [...entries].sort((a, b) => b.path.length - a.path.length)) {
    const target = join(root, ...entry.path.split('/'))
    await rm(target, { recursive: true, force: true })
  }
  for (const entry of entries.sort((a, b) => a.path.length - b.path.length)) {
    if (!entry.existed) continue
    const target = join(root, ...entry.path.split('/'))
    if (entry.type === 'directory') await mkdir(target, { recursive: true })
    else {
      await mkdir(dirname(target), { recursive: true })
      await copyFile(join(directory, 'content', ...entry.path.split('/')), target)
    }
  }
}

async function restoreBefore(root: string, manifest: ActionSnapshotManifest): Promise<string[]> {
  const before = new Map(manifest.beforeEntries.map((entry) => [entry.path, entry]))
  const paths = [...new Set(manifest.changes.flatMap(affectedPaths))]
  for (const path of paths.sort((a, b) => b.length - a.length)) {
    await rm(join(root, ...path.split('/')), { recursive: true, force: true })
  }
  for (const path of paths.sort((a, b) => a.length - b.length)) {
    const entry = before.get(path)
    if (!entry) continue
    const target = join(root, ...path.split('/'))
    if (entry.type === 'directory') await mkdir(target, { recursive: true })
    else {
      const temporary = `${target}.${randomUUID()}.tmp`
      await mkdir(dirname(target), { recursive: true })
      await copyFile(join(snapshotDir(root, manifest.snapshotId), 'before', ...path.split('/')), temporary)
      await rename(temporary, target)
    }
  }
  return paths
}

async function rollback(request: RollbackActionSnapshotRequest): Promise<RollbackActionSnapshotResult> {
  let protectionSnapshotId: string | undefined
  try {
    validateContext(request)
    assertSnapshotId(request.snapshotId)
    const root = await validateWorkspaceRoot(request.folderPath)
    const manifest = await readManifest(root, request.snapshotId)
    validateManifestContext(manifest, request)
    const conflicts = await inspectManifest(root, manifest)
    if (conflicts.length > 0) {
      return {
        success: false,
        errorCode: 'ROLLBACK_CONFLICT',
        error: '工作区在 action 执行后又发生变化，已阻止回滚',
        conflicts,
      }
    }
    protectionSnapshotId = `protection-${Date.now()}-${randomUUID()}`
    const protectionDir = snapshotDir(root, protectionSnapshotId)
    await mkdir(protectionDir, { recursive: true })
    const paths = manifest.changes.flatMap(affectedPaths)
    const protectionEntries = await copyProtection(root, protectionDir, paths)
    try {
      const restoredPaths = await restoreBefore(root, manifest)
      manifest.state = 'rolled-back'
      await writeJsonAtomic(join(snapshotDir(root, request.snapshotId), MANIFEST_FILE), manifest)
      return { success: true, snapshotId: request.snapshotId, protectionSnapshotId, restoredPaths }
    } catch (error) {
      await restoreProtection(root, protectionDir, protectionEntries)
      throw error
    }
  } catch (error) {
    const result = failure(error)
    return { ...result, errorCode: 'ROLLBACK_FAILED', protectionSnapshotId }
  }
}

async function removeSnapshot(request: DeleteActionSnapshotRequest): Promise<DeleteActionSnapshotResult> {
  try {
    validateContext(request)
    assertSnapshotId(request.snapshotId)
    const root = await validateWorkspaceRoot(request.folderPath)
    const manifest = await readManifest(root, request.snapshotId)
    validateManifestContext(manifest, request)
    await rm(snapshotDir(root, request.snapshotId), { recursive: true, force: true })
    return { success: true, snapshotId: request.snapshotId }
  } catch (error) {
    return failure(error)
  }
}

async function directorySize(path: string): Promise<number> {
  let total = 0
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    total += entry.isDirectory() ? await directorySize(child) : (await stat(child)).size
  }
  return total
}

async function cleanup(request: CleanupActionSnapshotsRequest): Promise<CleanupActionSnapshotsResult> {
  try {
    assertNonEmpty(request.workspaceId, 'workspaceId')
    const root = await validateWorkspaceRoot(request.folderPath)
    const base = snapshotsRoot(root)
    await mkdir(base, { recursive: true })
    const retained = new Set(request.retainedSnapshotIds ?? [])
    const now = Date.now()
    const records: Array<{ id: string; path: string; createdAt: number; size: number }> = []
    for (const entry of await readdir(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const path = join(base, entry.name)
      const info = await stat(path)
      let createdAt = info.birthtimeMs || info.mtimeMs
      try {
        const manifest = JSON.parse(await readFile(join(path, MANIFEST_FILE), 'utf8')) as ActionSnapshotManifest
        if (manifest.workspaceId !== request.workspaceId) continue
        createdAt = manifest.createdAt
      } catch {
        // protection 与异常退出产生的孤立目录按文件时间参与 TTL 清理。
      }
      records.push({ id: entry.name, path, createdAt, size: await directorySize(path) })
    }
    records.sort((a, b) => b.createdAt - a.createdAt)
    const maxSnapshots = request.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS
    const maxBytes = request.maxBytes ?? DEFAULT_MAX_BYTES
    const orphanTtlMs = request.orphanTtlMs ?? DEFAULT_ORPHAN_TTL_MS
    // 被持久化消息引用的快照无条件保留，并预先占用配额；否则遍历顺序可能
    // 先保留未引用的新快照，导致后出现的引用快照突破数量或磁盘上限。
    const retainedRecords = records.filter((record) => retained.has(record.id))
    let keptCount = retainedRecords.length
    let keptBytes = retainedRecords.reduce((total, record) => total + record.size, 0)
    let removedBytes = 0
    const removedSnapshotIds: string[] = []
    for (const record of records) {
      if (retained.has(record.id)) continue
      const expired = now - record.createdAt > orphanTtlMs
      const overLimit = keptCount >= maxSnapshots || keptBytes + record.size > maxBytes
      if (expired || overLimit) {
        await rm(record.path, { recursive: true, force: true })
        removedSnapshotIds.push(record.id)
        removedBytes += record.size
      } else {
        keptCount++
        keptBytes += record.size
      }
    }
    return { success: true, removedSnapshotIds, removedBytes, remainingSnapshots: keptCount }
  } catch (error) {
    return failure(error)
  }
}

async function restoreProtectionIPC(request: RestoreProtectionRequest): Promise<RestoreProtectionResult> {
  try {
    const root = await validateWorkspaceRoot(request.folderPath)
    const protectionDir = snapshotDir(root, request.protectionSnapshotId)
    const entries: ProtectionEntry[] = JSON.parse(
      await readFile(join(protectionDir, 'protection.json'), 'utf8'),
    )
    await restoreProtection(root, protectionDir, entries)
    await rm(protectionDir, { recursive: true, force: true })
    return { success: true }
  } catch (error) {
    return failure(error)
  }
}

export function setupWorkspaceActionSnapshotHandlers(): void {
  ipcMain.handle('workspace:action-snapshot:begin', (_event, request: BeginActionSnapshotRequest) => begin(request))
  ipcMain.handle('workspace:action-snapshot:finalize', (_event, request: FinalizeActionSnapshotRequest) => finalize(request))
  ipcMain.handle('workspace:action-snapshot:inspect-rollback', (_event, request: InspectActionRollbackRequest) => inspectRollback(request))
  ipcMain.handle('workspace:action-snapshot:rollback', (_event, request: RollbackActionSnapshotRequest) => rollback(request))
  ipcMain.handle('workspace:action-snapshot:delete', (_event, request: DeleteActionSnapshotRequest) => removeSnapshot(request))
  ipcMain.handle('workspace:action-snapshot:cleanup', (_event, request: CleanupActionSnapshotsRequest) => cleanup(request))
  ipcMain.handle('workspace:action-snapshot:restore-protection', (_event, request: RestoreProtectionRequest) => restoreProtectionIPC(request))
}
