/**
 * Agent action 级工作区快照共享契约。
 *
 * 主进程负责校验路径、扫描、落盘、冲突检查与原子回滚；渲染进程只通过
 * preload 暴露的白名单 IPC 使用这些结构。
 */

export type ActionSnapshotState =
  | 'capturing-before'
  | 'executing'
  | 'finalizing'
  | 'ready'
  | 'rolling-back'
  | 'rolled-back'
  | 'failed'

export type ActionSnapshotEntryType = 'file' | 'directory'

export interface ActionSnapshotEntry {
  /** 使用 `/` 分隔、相对工作区根目录且不以 `/` 开头。 */
  path: string
  type: ActionSnapshotEntryType
  /** 文件内容 SHA-256；目录不设置。 */
  sha256?: string
  size: number
  mtimeMs: number
  /** 内容是否被识别为二进制；目录不设置。 */
  binary?: boolean
}

export type WorkspaceFileChangeType = 'added' | 'modified' | 'deleted' | 'renamed'

export interface WorkspaceFileChange {
  type: WorkspaceFileChangeType
  path: string
  /** 重命名时的旧路径。 */
  previousPath?: string
  before?: ActionSnapshotEntry
  after?: ActionSnapshotEntry
}

export type ActionSideEffectKind =
  | 'workspace-files'
  | 'external-system'
  | 'network'
  | 'command'
  | 'unknown'

export interface ActionSideEffectHint {
  kind: ActionSideEffectKind
  description: string
  reversible: boolean
}

export interface ActionSnapshotManifest {
  version: 1
  snapshotId: string
  folderPath: string
  workspaceId: string
  conversationId: string
  runId: string
  actionId: string
  messageId?: string
  state: ActionSnapshotState
  createdAt: number
  finalizedAt?: number
  beforeDigest: string
  afterDigest?: string
  beforeEntries: ActionSnapshotEntry[]
  afterEntries?: ActionSnapshotEntry[]
  changes: WorkspaceFileChange[]
  sideEffectHints: ActionSideEffectHint[]
  failureReason?: string
}

export type ActionSnapshotErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_WORKSPACE_ROOT'
  | 'PATH_OUTSIDE_WORKSPACE'
  | 'SYMLINK_OUTSIDE_WORKSPACE'
  | 'SNAPSHOT_NOT_FOUND'
  | 'SNAPSHOT_NOT_READY'
  | 'SNAPSHOT_ID_MISMATCH'
  | 'ROLLBACK_CONFLICT'
  | 'ROLLBACK_FAILED'
  | 'IO_ERROR'
  | 'INTERNAL_ERROR'

export interface ActionSnapshotFailure {
  success: false
  errorCode: ActionSnapshotErrorCode
  error: string
}

export interface ActionSnapshotContext {
  folderPath: string
  workspaceId: string
  conversationId: string
  runId: string
  actionId: string
  messageId?: string
}

export interface BeginActionSnapshotRequest extends ActionSnapshotContext {
  sideEffectHints?: ActionSideEffectHint[]
}

export type BeginActionSnapshotResult =
  | {
      success: true
      snapshotId: string
      beforeDigest: string
      state: 'executing'
    }
  | ActionSnapshotFailure

export interface FinalizeActionSnapshotRequest extends ActionSnapshotContext {
  snapshotId: string
  sideEffectHints?: ActionSideEffectHint[]
  failureReason?: string
}

export type FinalizeActionSnapshotResult =
  | {
      success: true
      snapshotId: string
      afterDigest: string
      state: 'ready'
      changes: WorkspaceFileChange[]
    }
  | ActionSnapshotFailure

export interface InspectActionRollbackRequest extends ActionSnapshotContext {
  snapshotId: string
}

export type RollbackConflictReason =
  | 'missing'
  | 'unexpected'
  | 'content-changed'
  | 'type-changed'
  | 'unsafe-symlink'

export interface RollbackConflict {
  path: string
  reason: RollbackConflictReason
  expected?: ActionSnapshotEntry
  actual?: ActionSnapshotEntry
}

export type InspectActionRollbackResult =
  | {
      success: true
      snapshotId: string
      canRollback: boolean
      conflicts: RollbackConflict[]
      changes: WorkspaceFileChange[]
      sideEffectHints: ActionSideEffectHint[]
    }
  | ActionSnapshotFailure

export interface RollbackActionSnapshotRequest extends ActionSnapshotContext {
  snapshotId: string
}

export type RollbackActionSnapshotResult =
  | {
      success: true
      snapshotId: string
      protectionSnapshotId: string
      restoredPaths: string[]
    }
  | (ActionSnapshotFailure & {
      conflicts?: RollbackConflict[]
      protectionSnapshotId?: string
    })

export interface DeleteActionSnapshotRequest extends ActionSnapshotContext {
  snapshotId: string
}

export type DeleteActionSnapshotResult =
  | { success: true; snapshotId: string }
  | ActionSnapshotFailure

export interface CleanupActionSnapshotsRequest {
  folderPath: string
  workspaceId: string
  /** 清理时必须保留的、仍被消息步骤引用的快照。 */
  retainedSnapshotIds: string[]
  maxSnapshots?: number
  maxBytes?: number
  orphanTtlMs?: number
}

export type CleanupActionSnapshotsResult =
  | {
      success: true
      removedSnapshotIds: string[]
      removedBytes: number
      remainingSnapshots: number
    }
  | ActionSnapshotFailure

export interface RestoreProtectionRequest {
  folderPath: string
  /** 原 rollback 返回的 protection 快照标识。 */
  protectionSnapshotId: string
}

export type RestoreProtectionResult =
  | { success: true }
  | ActionSnapshotFailure

export interface WorkspaceChangeSummary {
  snapshotId: string
  changedFileCount: number
  added: number
  modified: number
  deleted: number
  renamed: number
  paths: string[]
}
