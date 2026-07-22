/**
 * Git SCM 类型定义（系统 git CLI + IPC 结构化结果）
 */

/** 单文件变更状态（对齐 VS Code / git status 简写） */
export type GitFileStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'ignored'
  | 'conflicted'
  | 'typechange'
  | 'unmerged'
  | 'unknown'

/** 暂存区 / 工作区侧 */
export type GitChangeSide = 'index' | 'worktree' | 'both' | 'untracked'

export interface GitFileChange {
  /** 相对仓库根的路径（posix 风格展示） */
  path: string
  /** rename/copy 的原路径 */
  oldPath?: string
  status: GitFileStatus
  /** 索引区状态字符（porcelain v2） */
  indexStatus?: string
  /** 工作区状态字符 */
  worktreeStatus?: string
  /** 是否冲突 */
  isConflicted: boolean
  /** 是否未跟踪 */
  isUntracked: boolean
  /** 是否已暂存（索引有变更） */
  isStaged: boolean
  /** 工作区是否有未暂存变更 */
  isUnstaged: boolean
}

export interface GitBranchInfo {
  name: string
  isCurrent: boolean
  isRemote: boolean
  upstream?: string
  /** 相对 upstream 超前提交数 */
  ahead?: number
  /** 相对 upstream 落后提交数 */
  behind?: number
  /** 指向的短 hash */
  commit?: string
}

export interface GitRemoteInfo {
  name: string
  fetchUrl: string
  pushUrl: string
}

export interface GitStashEntry {
  index: number
  /** stash@{n} */
  ref: string
  message: string
  branch?: string
}

export interface GitTagInfo {
  name: string
  commit?: string
  message?: string
  isAnnotated: boolean
}

export interface GitLogEntry {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
}

export interface GitRepoState {
  /** 工作区根路径 */
  cwd: string
  /** 是否为 git 仓库 */
  isRepo: boolean
  /** 系统是否安装 git */
  gitAvailable: boolean
  gitVersion?: string
  /** 当前分支名；detached HEAD 时为 null */
  branch: string | null
  /** detached HEAD */
  detached: boolean
  headCommit?: string
  upstream?: string | null
  ahead: number
  behind: number
  /** 是否有未提交变更 */
  isDirty: boolean
  stagedCount: number
  unstagedCount: number
  untrackedCount: number
  conflictedCount: number
}

export interface GitStatusResult {
  state: GitRepoState
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: GitFileChange[]
  conflicted: GitFileChange[]
  /** 全部变更（去重合并视图用） */
  all: GitFileChange[]
}

export interface GitDiffResult {
  path?: string
  /** unified diff 文本 */
  diff: string
  /** 是否为暂存区 diff */
  staged: boolean
  truncated?: boolean
}

export interface GitRunResult {
  success: boolean
  code: number | null
  stdout: string
  stderr: string
  combined: string
  error?: string
  durationMs: number
}

export interface GitOutputLine {
  id: string
  timestamp: number
  cwd?: string
  /** 命令摘要，如 git status --porcelain=v2 -b */
  command?: string
  stream: 'stdout' | 'stderr' | 'system' | 'command'
  text: string
}

export interface GitCommitOptions {
  message: string
  amend?: boolean
  allowEmpty?: boolean
  noVerify?: boolean
}

export interface GitPushOptions {
  remote?: string
  branch?: string
  setUpstream?: boolean
  tags?: boolean
  force?: boolean
}

export interface GitPullOptions {
  remote?: string
  branch?: string
  rebase?: boolean
}

export interface GitCloneOptions {
  url: string
  targetDir: string
  branch?: string
  depth?: number
}

export interface GitCheckoutOptions {
  target: string
  create?: boolean
  force?: boolean
}

export interface GitDiscardOptions {
  paths: string[]
  /** 丢弃未跟踪文件（clean） */
  includeUntracked?: boolean
}

export interface GitStashPushOptions {
  message?: string
  includeUntracked?: boolean
  paths?: string[]
}

/** IPC 通用包装 */
export type GitIpcResult<T = void> = {
  success: boolean
  data?: T
  error?: string
}
