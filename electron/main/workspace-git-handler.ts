/**
 * 工作区 Git SCM Handler
 *
 * 主进程通过系统 `git` CLI 执行操作，解析 porcelain 输出，
 * 并通过 IPC 推送 Git Output 日志。
 */

import { ipcMain, BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { platform } from 'os'
import { resolve, normalize, sep, isAbsolute } from 'path'
import { access } from 'fs/promises'
import { constants as fsConstants } from 'fs'

// ---- 类型（与渲染进程 src/types/git.ts 对齐，主进程内联避免跨层路径问题） ----

type GitFileStatus =
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

interface GitFileChange {
  path: string
  oldPath?: string
  status: GitFileStatus
  indexStatus?: string
  worktreeStatus?: string
  isConflicted: boolean
  isUntracked: boolean
  isStaged: boolean
  isUnstaged: boolean
}

interface GitBranchInfo {
  name: string
  isCurrent: boolean
  isRemote: boolean
  upstream?: string
  ahead?: number
  behind?: number
  commit?: string
}

interface GitRemoteInfo {
  name: string
  fetchUrl: string
  pushUrl: string
}

interface GitStashEntry {
  index: number
  ref: string
  message: string
  branch?: string
}

interface GitTagInfo {
  name: string
  commit?: string
  message?: string
  isAnnotated: boolean
}

interface GitLogEntry {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
}

interface GitRepoState {
  cwd: string
  isRepo: boolean
  gitAvailable: boolean
  gitVersion?: string
  branch: string | null
  detached: boolean
  headCommit?: string
  upstream?: string | null
  ahead: number
  behind: number
  isDirty: boolean
  stagedCount: number
  unstagedCount: number
  untrackedCount: number
  conflictedCount: number
}

interface GitStatusResult {
  state: GitRepoState
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: GitFileChange[]
  conflicted: GitFileChange[]
  all: GitFileChange[]
}

interface GitRunResult {
  success: boolean
  code: number | null
  stdout: string
  stderr: string
  combined: string
  error?: string
  durationMs: number
}

interface GitIpcResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// ---- 常量 ----

const isWindows = platform() === 'win32'
const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000
const LONG_TIMEOUT_MS = 10 * 60 * 1000
const MAX_OUTPUT_BUFFER = 8 * 1024 * 1024
const MAX_DIFF_CHARS = 1_500_000

/** 写操作按 cwd 串行 */
const writeQueues = new Map<string, Promise<unknown>>()

let gitAvailableCache: { available: boolean; version?: string; checkedAt: number } | null = null
const GIT_CACHE_TTL_MS = 60_000

// ---- 工具 ----

function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/')
}

function normalizeCwd(cwd: string): string {
  return resolve(normalize(cwd))
}

/**
 * 校验 cwd 为绝对路径且目录可访问。
 * 不强制「必须在某白名单内」——工作区根由渲染进程传入，与 fs/command 一致。
 */
async function assertValidCwd(cwd: string): Promise<string> {
  if (!cwd || typeof cwd !== 'string') {
    throw new Error('Invalid working directory')
  }
  const abs = normalizeCwd(cwd)
  if (!isAbsolute(abs)) {
    throw new Error('Working directory must be absolute')
  }
  try {
    await access(abs, fsConstants.R_OK)
  } catch {
    throw new Error(`Working directory not accessible: ${abs}`)
  }
  return abs
}

/** 相对路径安全：禁止绝对路径与 .. 逃逸 */
function assertSafeRelativePaths(paths: string[] | undefined): string[] {
  if (!paths || paths.length === 0) return []
  const safe: string[] = []
  for (const p of paths) {
    if (typeof p !== 'string' || !p.trim()) continue
    const trimmed = p.trim()
    if (isAbsolute(trimmed) || trimmed.includes('\0')) {
      throw new Error(`Unsafe path rejected: ${trimmed}`)
    }
    const norm = normalize(trimmed)
    if (norm.startsWith('..') || norm.includes(`${sep}..${sep}`) || norm === '..') {
      throw new Error(`Path escape rejected: ${trimmed}`)
    }
    safe.push(toPosixPath(trimmed))
  }
  return safe
}

function broadcastGitOutput(payload: {
  timestamp: number
  cwd?: string
  command?: string
  stream: 'stdout' | 'stderr' | 'system' | 'command'
  text: string
}): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('workspace:git:output', payload)
    }
  })
}

function enqueueWrite<T>(cwd: string, task: () => Promise<T>): Promise<T> {
  const key = normalizeCwd(cwd)
  const prev = writeQueues.get(key) ?? Promise.resolve()
  const next = prev.then(task, task)
  writeQueues.set(
    key,
    next.then(
      () => undefined,
      () => undefined
    )
  )
  return next
}

// ---- runGit ----

interface RunGitOptions {
  timeoutMs?: number
  env?: Record<string, string>
  /** 不把完整 stdout 打到 output（大 diff） */
  quietStdout?: boolean
  input?: string
}

async function runGit(
  cwd: string,
  args: string[],
  options: RunGitOptions = {}
): Promise<GitRunResult> {
  const startTime = Date.now()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const cmdLabel = `git ${args.join(' ')}`

  broadcastGitOutput({
    timestamp: startTime,
    cwd,
    command: cmdLabel,
    stream: 'command',
    text: `$ ${cmdLabel}`,
  })

  return new Promise((resolveResult) => {
    let stdout = ''
    let stderr = ''
    let totalSize = 0
    let killed = false
    let settled = false

    const finish = (result: GitRunResult): void => {
      if (settled) return
      settled = true
      resolveResult(result)
    }

    let child: ChildProcess
    try {
      child = spawn('git', args, {
        cwd,
        env: {
          ...process.env,
          ...options.env,
          // 避免交互式 pager / 本地化干扰解析
          GIT_TERMINAL_PROMPT: '0',
          GIT_OPTIONAL_LOCKS: '0',
          LANG: 'C',
          LC_ALL: 'C',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: isWindows,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      broadcastGitOutput({
        timestamp: Date.now(),
        cwd,
        command: cmdLabel,
        stream: 'system',
        text: `Failed to spawn git: ${message}`,
      })
      finish({
        success: false,
        code: null,
        stdout: '',
        stderr: message,
        combined: message,
        error: message,
        durationMs: Date.now() - startTime,
      })
      return
    }

    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        killed = true
        try {
          child.kill('SIGTERM')
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          try {
            if (!child.killed) child.kill('SIGKILL')
          } catch {
            /* ignore */
          }
        }, 3000)
      }, timeoutMs)
    }

    const append = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      totalSize += chunk.length
      if (totalSize > MAX_OUTPUT_BUFFER) {
        if (!killed) {
          killed = true
          child.kill('SIGTERM')
        }
        return
      }
      if (stream === 'stdout') {
        stdout += text
        if (!options.quietStdout && text.trim()) {
          broadcastGitOutput({
            timestamp: Date.now(),
            cwd,
            command: cmdLabel,
            stream: 'stdout',
            text,
          })
        }
      } else {
        stderr += text
        if (text.trim()) {
          broadcastGitOutput({
            timestamp: Date.now(),
            cwd,
            command: cmdLabel,
            stream: 'stderr',
            text,
          })
        }
      }
    }

    child.stdout?.on('data', (d: Buffer) => append('stdout', d))
    child.stderr?.on('data', (d: Buffer) => append('stderr', d))

    if (options.input != null) {
      child.stdin?.write(options.input)
    }
    child.stdin?.end()

    child.on('error', (err) => {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      const message = err.message || String(err)
      const notFound =
        (err as NodeJS.ErrnoException).code === 'ENOENT' ||
        /not found|ENOENT/i.test(message)
      const error = notFound
        ? 'Git is not installed or not found in PATH'
        : message
      broadcastGitOutput({
        timestamp: Date.now(),
        cwd,
        command: cmdLabel,
        stream: 'system',
        text: error,
      })
      finish({
        success: false,
        code: null,
        stdout,
        stderr: stderr || error,
        combined: [stdout, stderr, error].filter(Boolean).join('\n'),
        error,
        durationMs: Date.now() - startTime,
      })
    })

    child.on('close', (code) => {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      const durationMs = Date.now() - startTime
      if (killed && totalSize > MAX_OUTPUT_BUFFER) {
        const error = 'Git output exceeded buffer limit'
        broadcastGitOutput({
          timestamp: Date.now(),
          cwd,
          command: cmdLabel,
          stream: 'system',
          text: error,
        })
        finish({
          success: false,
          code,
          stdout,
          stderr,
          combined: [stdout, stderr].filter(Boolean).join('\n'),
          error,
          durationMs,
        })
        return
      }
      if (killed) {
        const error = `Git command timed out after ${timeoutMs}ms`
        broadcastGitOutput({
          timestamp: Date.now(),
          cwd,
          command: cmdLabel,
          stream: 'system',
          text: error,
        })
        finish({
          success: false,
          code,
          stdout,
          stderr,
          combined: [stdout, stderr].filter(Boolean).join('\n'),
          error,
          durationMs,
        })
        return
      }

      const combined = [stdout, stderr].filter(Boolean).join('\n')
      const success = code === 0
      if (!success && stderr.trim()) {
        // 已在 stream 推送
      }
      finish({
        success,
        code,
        stdout,
        stderr,
        combined,
        error: success ? undefined : (stderr.trim() || `git exited with code ${code}`),
        durationMs,
      })
    })
  })
}

// ---- 版本 / 探测 ----

async function checkGitVersion(force = false): Promise<{ available: boolean; version?: string }> {
  const now = Date.now()
  if (!force && gitAvailableCache && now - gitAvailableCache.checkedAt < GIT_CACHE_TTL_MS) {
    return { available: gitAvailableCache.available, version: gitAvailableCache.version }
  }
  const result = await runGit(process.cwd(), ['--version'], {
    timeoutMs: 10_000,
    quietStdout: true,
  })
  if (result.success) {
    const version = result.stdout.trim().replace(/^git\s+version\s+/i, '')
    gitAvailableCache = { available: true, version, checkedAt: now }
    return { available: true, version }
  }
  gitAvailableCache = { available: false, checkedAt: now }
  return { available: false }
}

async function isInsideWorkTree(cwd: string): Promise<boolean> {
  const result = await runGit(cwd, ['rev-parse', '--is-inside-work-tree'], {
    timeoutMs: 15_000,
    quietStdout: true,
  })
  return result.success && result.stdout.trim() === 'true'
}

// ---- porcelain v2 解析 ----

function mapXyToStatus(xy: string): GitFileStatus {
  if (xy.includes('U') || xy === 'AA' || xy === 'DD') return 'conflicted'
  const x = xy[0] ?? ' '
  const y = xy[1] ?? ' '
  if (x === '?' || y === '?') return 'untracked'
  if (x === '!' || y === '!') return 'ignored'
  if (x === 'A' || y === 'A') return 'added'
  if (x === 'D' || y === 'D') return 'deleted'
  if (x === 'R' || y === 'R') return 'renamed'
  if (x === 'C' || y === 'C') return 'copied'
  if (x === 'T' || y === 'T') return 'typechange'
  if (x === 'M' || y === 'M') return 'modified'
  return 'unknown'
}

function parsePorcelainV2(stdout: string): {
  branch: string | null
  detached: boolean
  upstream: string | null
  ahead: number
  behind: number
  headCommit?: string
  changes: GitFileChange[]
} {
  let branch: string | null = null
  let detached = false
  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  let headCommit: string | undefined
  const changes: GitFileChange[] = []

  const lines = stdout.split(/\r?\n/)
  for (const line of lines) {
    if (!line) continue

    if (line.startsWith('# branch.oid ')) {
      const oid = line.slice('# branch.oid '.length).trim()
      if (oid && oid !== '(initial)') headCommit = oid
      continue
    }
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length).trim()
      if (head === '(detached)') {
        detached = true
        branch = null
      } else {
        branch = head
      }
      continue
    }
    if (line.startsWith('# branch.upstream ')) {
      upstream = line.slice('# branch.upstream '.length).trim() || null
      continue
    }
    if (line.startsWith('# branch.ab ')) {
      // # branch.ab +1 -2
      const m = line.match(/\+(\d+)\s+-(\d+)/)
      if (m) {
        ahead = parseInt(m[1], 10)
        behind = parseInt(m[2], 10)
      }
      continue
    }
    if (line.startsWith('#')) continue

    // ordinary changed: 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
    // rename/copy: 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>\t<origPath>
    // unmerged: u <XY> ...
    // untracked: ? <path>
    // ignored: ! <path>
    if (line.startsWith('? ')) {
      const path = line.slice(2)
      changes.push({
        path: toPosixPath(path),
        status: 'untracked',
        indexStatus: '?',
        worktreeStatus: '?',
        isConflicted: false,
        isUntracked: true,
        isStaged: false,
        isUnstaged: true,
      })
      continue
    }
    if (line.startsWith('! ')) {
      const path = line.slice(2)
      changes.push({
        path: toPosixPath(path),
        status: 'ignored',
        indexStatus: '!',
        worktreeStatus: '!',
        isConflicted: false,
        isUntracked: false,
        isStaged: false,
        isUnstaged: false,
      })
      continue
    }
    if (line.startsWith('u ')) {
      // u XY sub m1 m2 m3 mW h1 h2 h3 path
      const rest = line.slice(2)
      const parts = rest.split(' ')
      if (parts.length < 10) continue
      const xy = parts[0]
      const path = parts.slice(9).join(' ')
      changes.push({
        path: toPosixPath(path),
        status: 'conflicted',
        indexStatus: xy[0],
        worktreeStatus: xy[1],
        isConflicted: true,
        isUntracked: false,
        isStaged: false,
        isUnstaged: true,
      })
      continue
    }
    if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const isRename = line.startsWith('2 ')
      const rest = line.slice(2)
      const parts = rest.split(' ')
      if (parts.length < 8) continue
      const xy = parts[0]
      // skip sub mH mI mW hH hI  -> 7 tokens after xy for type 1
      // type 2 has score then path\torig
      let pathPart: string
      if (isRename) {
        // after 7 meta fields + score: path\told
        pathPart = parts.slice(8).join(' ')
      } else {
        pathPart = parts.slice(7).join(' ')
      }
      let path = pathPart
      let oldPath: string | undefined
      if (isRename && pathPart.includes('\t')) {
        const [p, o] = pathPart.split('\t')
        path = p
        oldPath = o
      }
      const x = xy[0] ?? '.'
      const y = xy[1] ?? '.'
      const isStaged = x !== '.' && x !== ' ' && x !== '?'
      const isUnstaged = y !== '.' && y !== ' ' && y !== '?'
      const status = mapXyToStatus(xy)
      changes.push({
        path: toPosixPath(path),
        oldPath: oldPath ? toPosixPath(oldPath) : undefined,
        status,
        indexStatus: x,
        worktreeStatus: y,
        isConflicted: false,
        isUntracked: false,
        isStaged,
        isUnstaged,
      })
    }
  }

  return { branch, detached, upstream, ahead, behind, headCommit, changes }
}

function partitionChanges(changes: GitFileChange[]): Omit<GitStatusResult, 'state'> {
  const staged: GitFileChange[] = []
  const unstaged: GitFileChange[] = []
  const untracked: GitFileChange[] = []
  const conflicted: GitFileChange[] = []
  const all: GitFileChange[] = []

  for (const c of changes) {
    if (c.status === 'ignored') continue
    all.push(c)
    if (c.isConflicted || c.status === 'conflicted') {
      conflicted.push(c)
      continue
    }
    if (c.isUntracked || c.status === 'untracked') {
      untracked.push(c)
      continue
    }
    // 同一文件可能同时 staged + unstaged：拆成两条视图条目更清晰
    if (c.isStaged) {
      staged.push({
        ...c,
        isUnstaged: false,
        status: mapSingleSideStatus(c.indexStatus),
      })
    }
    if (c.isUnstaged) {
      unstaged.push({
        ...c,
        isStaged: false,
        status: mapSingleSideStatus(c.worktreeStatus),
      })
    }
  }

  return { staged, unstaged, untracked, conflicted, all }
}

function mapSingleSideStatus(ch?: string): GitFileStatus {
  switch (ch) {
    case 'M':
      return 'modified'
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case 'T':
      return 'typechange'
    case 'U':
      return 'conflicted'
    default:
      return 'modified'
  }
}

async function getStatus(cwd: string): Promise<GitIpcResult<GitStatusResult>> {
  try {
    const abs = await assertValidCwd(cwd)
    const ver = await checkGitVersion()
    if (!ver.available) {
      return {
        success: true,
        data: {
          state: emptyState(abs, false),
          staged: [],
          unstaged: [],
          untracked: [],
          conflicted: [],
          all: [],
        },
      }
    }

    const inside = await isInsideWorkTree(abs)
    if (!inside) {
      return {
        success: true,
        data: {
          state: {
            ...emptyState(abs, true, ver.version),
            isRepo: false,
          },
          staged: [],
          unstaged: [],
          untracked: [],
          conflicted: [],
          all: [],
        },
      }
    }

    const result = await runGit(
      abs,
      ['status', '--porcelain=v2', '-b', '--untracked-files=all'],
      { quietStdout: true }
    )
    if (!result.success) {
      return { success: false, error: result.error || 'git status failed' }
    }

    const parsed = parsePorcelainV2(result.stdout)
    const parts = partitionChanges(parsed.changes)
    const state: GitRepoState = {
      cwd: abs,
      isRepo: true,
      gitAvailable: true,
      gitVersion: ver.version,
      branch: parsed.branch,
      detached: parsed.detached,
      headCommit: parsed.headCommit,
      upstream: parsed.upstream,
      ahead: parsed.ahead,
      behind: parsed.behind,
      isDirty:
        parts.staged.length +
          parts.unstaged.length +
          parts.untracked.length +
          parts.conflicted.length >
        0,
      stagedCount: parts.staged.length,
      unstagedCount: parts.unstaged.length,
      untrackedCount: parts.untracked.length,
      conflictedCount: parts.conflicted.length,
    }

    return {
      success: true,
      data: { state, ...parts },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function emptyState(cwd: string, gitAvailable = false, version?: string): GitRepoState {
  return {
    cwd,
    isRepo: false,
    gitAvailable,
    gitVersion: version,
    branch: null,
    detached: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    isDirty: false,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    conflictedCount: 0,
  }
}

// ---- 业务操作 ----

async function getDiff(
  cwd: string,
  options: { path?: string; staged?: boolean; maxChars?: number } = {}
): Promise<GitIpcResult<{ path?: string; diff: string; staged: boolean; truncated?: boolean }>> {
  try {
    const abs = await assertValidCwd(cwd)
    const args = ['diff', '--no-color', '--no-ext-diff']
    if (options.staged) args.push('--cached')
    if (options.path) {
      const [safe] = assertSafeRelativePaths([options.path])
      args.push('--', safe)
    }
    const result = await runGit(abs, args, { quietStdout: true, timeoutMs: DEFAULT_TIMEOUT_MS })
    // diff 无变更时 code 0 且 stdout 空；有时 untracked 无 diff 也是 0
    if (!result.success && result.code !== 0) {
      // 二进制或其它错误
      return { success: false, error: result.error || 'git diff failed' }
    }
    let diff = result.stdout
    const max = options.maxChars ?? MAX_DIFF_CHARS
    let truncated = false
    if (diff.length > max) {
      diff = diff.slice(0, max) + '\n\n... [diff truncated] ...'
      truncated = true
    }
    return {
      success: true,
      data: {
        path: options.path,
        diff,
        staged: !!options.staged,
        truncated,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function stage(cwd: string, paths: string[]): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const safe = assertSafeRelativePaths(paths)
      if (safe.length === 0) {
        const r = await runGit(abs, ['add', '-A'])
        return r.success ? { success: true } : { success: false, error: r.error }
      }
      const r = await runGit(abs, ['add', '--', ...safe])
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function unstage(cwd: string, paths: string[]): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const safe = assertSafeRelativePaths(paths)
      const args =
        safe.length === 0
          ? ['restore', '--staged', '.']
          : ['restore', '--staged', '--', ...safe]
      const r = await runGit(abs, args)
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function discard(
  cwd: string,
  options: { paths: string[]; includeUntracked?: boolean }
): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const safe = assertSafeRelativePaths(options.paths)
      if (safe.length === 0 && !options.includeUntracked) {
        return { success: false, error: 'No paths specified for discard' }
      }
      if (safe.length > 0) {
        const r = await runGit(abs, ['restore', '--worktree', '--', ...safe])
        if (!r.success) return { success: false, error: r.error }
        // 若索引也有变更且用户丢弃工作区，通常只 restore worktree；VS Code discard 对已跟踪文件 restore
      }
      if (options.includeUntracked) {
        const cleanArgs =
          safe.length > 0
            ? ['clean', '-f', '--', ...safe]
            : ['clean', '-fd']
        const r2 = await runGit(abs, cleanArgs)
        if (!r2.success) return { success: false, error: r2.error }
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function commit(
  cwd: string,
  options: { message: string; amend?: boolean; allowEmpty?: boolean; noVerify?: boolean }
): Promise<GitIpcResult<{ commit?: string }>> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const message = (options.message || '').trim()
      if (!message && !options.amend) {
        return { success: false, error: 'Commit message is required' }
      }
      const args = ['commit']
      if (options.amend) args.push('--amend')
      if (options.allowEmpty) args.push('--allow-empty')
      if (options.noVerify) args.push('--no-verify')
      if (message) {
        args.push('-m', message)
      } else if (options.amend) {
        args.push('--no-edit')
      }
      const r = await runGit(abs, args)
      if (!r.success) return { success: false, error: r.error }
      const head = await runGit(abs, ['rev-parse', '--short', 'HEAD'], { quietStdout: true })
      return {
        success: true,
        data: { commit: head.success ? head.stdout.trim() : undefined },
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function initRepo(cwd: string): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const r = await runGit(abs, ['init'])
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function listBranches(cwd: string): Promise<GitIpcResult<GitBranchInfo[]>> {
  try {
    const abs = await assertValidCwd(cwd)
    const r = await runGit(
      abs,
      [
        'for-each-ref',
        '--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(objectname:short)%00%(refname)',
        'refs/heads',
        'refs/remotes',
      ],
      { quietStdout: true }
    )
    if (!r.success) return { success: false, error: r.error }
    const branches: GitBranchInfo[] = []
    for (const line of r.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue
      const [name, head, upstream, commit, refname] = line.split('\0')
      if (!name) continue
      const isRemote = (refname || '').startsWith('refs/remotes/')
      // 跳过 remote HEAD 符号引用展示噪音可选
      if (isRemote && name.endsWith('/HEAD')) continue
      branches.push({
        name,
        isCurrent: head === '*',
        isRemote,
        upstream: upstream || undefined,
        commit: commit || undefined,
      })
    }
    return { success: true, data: branches }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function checkout(
  cwd: string,
  options: { target: string; create?: boolean; force?: boolean }
): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const target = (options.target || '').trim()
      if (!target || target.includes('..') || target.includes('\0')) {
        return { success: false, error: 'Invalid branch/ref name' }
      }
      const args = options.create
        ? ['switch', '-c', target]
        : options.force
          ? ['switch', '--discard-changes', target]
          : ['switch', target]
      // 旧 git 无 switch 时回退 checkout
      let r = await runGit(abs, args)
      if (!r.success && /unknown command|is not a git command/i.test(r.stderr || '')) {
        const fb = options.create
          ? ['checkout', '-b', target]
          : options.force
            ? ['checkout', '-f', target]
            : ['checkout', target]
        r = await runGit(abs, fb)
      }
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function createBranch(
  cwd: string,
  name: string,
  options?: { checkout?: boolean; startPoint?: string }
): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const branch = (name || '').trim()
      if (!branch || branch.includes('..')) {
        return { success: false, error: 'Invalid branch name' }
      }
      if (options?.checkout) {
        const args = ['switch', '-c', branch]
        if (options.startPoint) args.push(options.startPoint)
        let r = await runGit(abs, args)
        if (!r.success && /unknown command|is not a git command/i.test(r.stderr || '')) {
          const fb = ['checkout', '-b', branch]
          if (options.startPoint) fb.push(options.startPoint)
          r = await runGit(abs, fb)
        }
        return r.success ? { success: true } : { success: false, error: r.error }
      }
      const args = ['branch', branch]
      if (options?.startPoint) args.push(options.startPoint)
      const r = await runGit(abs, args)
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function deleteBranch(
  cwd: string,
  name: string,
  force = false
): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const branch = (name || '').trim()
      if (!branch) return { success: false, error: 'Branch name required' }
      const r = await runGit(abs, ['branch', force ? '-D' : '-d', branch])
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function merge(cwd: string, branch: string): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const target = (branch || '').trim()
      if (!target) return { success: false, error: 'Branch required' }
      const r = await runGit(abs, ['merge', '--no-edit', target])
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function listRemotes(cwd: string): Promise<GitIpcResult<GitRemoteInfo[]>> {
  try {
    const abs = await assertValidCwd(cwd)
    const r = await runGit(abs, ['remote', '-v'], { quietStdout: true })
    if (!r.success) return { success: false, error: r.error }
    const map = new Map<string, GitRemoteInfo>()
    for (const line of r.stdout.split(/\r?\n/)) {
      const m = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)\s*$/)
      if (!m) continue
      const [, name, url, kind] = m
      const cur = map.get(name) || { name, fetchUrl: '', pushUrl: '' }
      if (kind === 'fetch') cur.fetchUrl = url
      else cur.pushUrl = url
      map.set(name, cur)
    }
    return { success: true, data: Array.from(map.values()) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function addRemote(
  cwd: string,
  name: string,
  url: string
): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const n = (name || '').trim()
      const u = (url || '').trim()
      if (!n || !u) return { success: false, error: 'Remote name and url required' }
      const r = await runGit(abs, ['remote', 'add', n, u])
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function removeRemote(cwd: string, name: string): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const n = (name || '').trim()
      if (!n) return { success: false, error: 'Remote name required' }
      const r = await runGit(abs, ['remote', 'remove', n])
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function fetch(
  cwd: string,
  remote?: string
): Promise<GitIpcResult> {
  try {
    const abs = await assertValidCwd(cwd)
    const args = remote ? ['fetch', remote] : ['fetch', '--all', '--prune']
    const r = await runGit(abs, args, { timeoutMs: LONG_TIMEOUT_MS })
    return r.success ? { success: true } : { success: false, error: r.error }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function pull(
  cwd: string,
  options: { remote?: string; branch?: string; rebase?: boolean } = {}
): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const args = ['pull']
      if (options.rebase) args.push('--rebase')
      if (options.remote) {
        args.push(options.remote)
        if (options.branch) args.push(options.branch)
      }
      const r = await runGit(abs, args, { timeoutMs: LONG_TIMEOUT_MS })
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function push(
  cwd: string,
  options: {
    remote?: string
    branch?: string
    setUpstream?: boolean
    tags?: boolean
    force?: boolean
  } = {}
): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const args = ['push']
      if (options.force) args.push('--force-with-lease')
      if (options.tags) args.push('--tags')
      if (options.setUpstream) args.push('-u')
      args.push(options.remote || 'origin')
      if (options.branch) args.push(options.branch)
      const r = await runGit(abs, args, { timeoutMs: LONG_TIMEOUT_MS })
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function cloneRepo(options: {
  url: string
  targetDir: string
  branch?: string
  depth?: number
}): Promise<GitIpcResult> {
  try {
    const url = (options.url || '').trim()
    const targetDir = await assertValidCwd(options.targetDir)
    if (!url) return { success: false, error: 'Clone URL required' }
    const args = ['clone']
    if (options.branch) args.push('-b', options.branch)
    if (options.depth && options.depth > 0) args.push('--depth', String(options.depth))
    args.push(url, targetDir)
    // clone 的 cwd 用 parent
    const parent = resolve(targetDir, '..')
    const r = await runGit(parent, args, { timeoutMs: LONG_TIMEOUT_MS })
    return r.success ? { success: true } : { success: false, error: r.error }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function listStash(cwd: string): Promise<GitIpcResult<GitStashEntry[]>> {
  try {
    const abs = await assertValidCwd(cwd)
    const r = await runGit(
      abs,
      ['stash', 'list', '--format=%gd%00%gs'],
      { quietStdout: true }
    )
    if (!r.success) return { success: false, error: r.error }
    const entries: GitStashEntry[] = []
    let i = 0
    for (const line of r.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue
      const [ref, message] = line.split('\0')
      const branchMatch = (message || '').match(/^On\s+([^:]+):/)
      entries.push({
        index: i,
        ref: ref || `stash@{${i}}`,
        message: message || '',
        branch: branchMatch?.[1],
      })
      i++
    }
    return { success: true, data: entries }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function stashPush(
  cwd: string,
  options: { message?: string; includeUntracked?: boolean; paths?: string[] } = {}
): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const args = ['stash', 'push']
      if (options.includeUntracked) args.push('-u')
      if (options.message) args.push('-m', options.message)
      const safe = assertSafeRelativePaths(options.paths)
      if (safe.length > 0) args.push('--', ...safe)
      const r = await runGit(abs, args)
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function stashPop(cwd: string, index?: number): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const args = ['stash', 'pop']
      if (index != null) args.push(`stash@{${index}}`)
      const r = await runGit(abs, args)
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function stashApply(cwd: string, index?: number): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const args = ['stash', 'apply']
      if (index != null) args.push(`stash@{${index}}`)
      const r = await runGit(abs, args)
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function stashDrop(cwd: string, index?: number): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const args = ['stash', 'drop']
      if (index != null) args.push(`stash@{${index}}`)
      const r = await runGit(abs, args)
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function listTags(cwd: string): Promise<GitIpcResult<GitTagInfo[]>> {
  try {
    const abs = await assertValidCwd(cwd)
    const r = await runGit(
      abs,
      [
        'for-each-ref',
        '--format=%(refname:short)%00%(objectname:short)%00%(contents:subject)%00%(objecttype)',
        'refs/tags',
      ],
      { quietStdout: true }
    )
    if (!r.success) return { success: false, error: r.error }
    const tags: GitTagInfo[] = []
    for (const line of r.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue
      const [name, commit, message, objecttype] = line.split('\0')
      if (!name) continue
      tags.push({
        name,
        commit: commit || undefined,
        message: message || undefined,
        isAnnotated: objecttype === 'tag',
      })
    }
    return { success: true, data: tags }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function createTag(
  cwd: string,
  name: string,
  options?: { message?: string; ref?: string }
): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const tag = (name || '').trim()
      if (!tag) return { success: false, error: 'Tag name required' }
      const args = options?.message
        ? ['tag', '-a', tag, '-m', options.message]
        : ['tag', tag]
      if (options?.ref) args.push(options.ref)
      const r = await runGit(abs, args)
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function deleteTag(cwd: string, name: string): Promise<GitIpcResult> {
  return enqueueWrite(cwd, async () => {
    try {
      const abs = await assertValidCwd(cwd)
      const tag = (name || '').trim()
      if (!tag) return { success: false, error: 'Tag name required' }
      const r = await runGit(abs, ['tag', '-d', tag])
      return r.success ? { success: true } : { success: false, error: r.error }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function getLog(
  cwd: string,
  options: { maxCount?: number; path?: string } = {}
): Promise<GitIpcResult<GitLogEntry[]>> {
  try {
    const abs = await assertValidCwd(cwd)
    const max = Math.min(Math.max(options.maxCount ?? 50, 1), 500)
    const args = [
      'log',
      `-n${max}`,
      '--format=%H%x00%h%x00%s%x00%an%x00%ad',
      '--date=iso-strict',
    ]
    if (options.path) {
      const [safe] = assertSafeRelativePaths([options.path])
      args.push('--', safe)
    }
    const r = await runGit(abs, args, { quietStdout: true })
    if (!r.success) return { success: false, error: r.error }
    const entries: GitLogEntry[] = []
    for (const line of r.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue
      const [hash, shortHash, subject, author, date] = line.split('\0')
      if (!hash) continue
      entries.push({
        hash,
        shortHash: shortHash || hash.slice(0, 7),
        subject: subject || '',
        author: author || '',
        date: date || '',
      })
    }
    return { success: true, data: entries }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function checkIgnore(
  cwd: string,
  paths: string[]
): Promise<GitIpcResult<Array<{ path: string; ignored: boolean; source?: string }>>> {
  try {
    const abs = await assertValidCwd(cwd)
    const safe = assertSafeRelativePaths(paths)
    if (safe.length === 0) return { success: true, data: [] }
    const r = await runGit(abs, ['check-ignore', '-v', '--stdin'], {
      quietStdout: true,
      input: safe.join('\n') + '\n',
    })
    // check-ignore: 匹配 exit 0；无匹配 exit 1
    const ignoredMap = new Map<string, string>()
    if (r.stdout) {
      for (const line of r.stdout.split(/\r?\n/)) {
        // source:line:pattern\tpath
        const tab = line.lastIndexOf('\t')
        if (tab === -1) continue
        const path = line.slice(tab + 1)
        ignoredMap.set(toPosixPath(path), line.slice(0, tab))
      }
    }
    const data = safe.map((p) => ({
      path: p,
      ignored: ignoredMap.has(p),
      source: ignoredMap.get(p),
    }))
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function getState(cwd: string): Promise<GitIpcResult<GitRepoState>> {
  const status = await getStatus(cwd)
  if (!status.success || !status.data) {
    return { success: false, error: status.error }
  }
  return { success: true, data: status.data.state }
}

// ---- IPC 注册 ----

export function setupWorkspaceGitHandlers(): void {
  ipcMain.handle('workspace:git:version', async () => {
    const v = await checkGitVersion(true)
    return { success: true, data: v }
  })

  ipcMain.handle('workspace:git:isRepo', async (_e, cwd: string) => {
    try {
      const abs = await assertValidCwd(cwd)
      const ver = await checkGitVersion()
      if (!ver.available) {
        return { success: true, data: { isRepo: false, gitAvailable: false } }
      }
      const inside = await isInsideWorkTree(abs)
      return { success: true, data: { isRepo: inside, gitAvailable: true, version: ver.version } }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('workspace:git:getState', async (_e, cwd: string) => getState(cwd))
  ipcMain.handle('workspace:git:status', async (_e, cwd: string) => getStatus(cwd))

  ipcMain.handle(
    'workspace:git:diff',
    async (
      _e,
      cwd: string,
      options?: { path?: string; staged?: boolean; maxChars?: number }
    ) => getDiff(cwd, options || {})
  )

  ipcMain.handle('workspace:git:stage', async (_e, cwd: string, paths: string[]) =>
    stage(cwd, paths || [])
  )
  ipcMain.handle('workspace:git:unstage', async (_e, cwd: string, paths: string[]) =>
    unstage(cwd, paths || [])
  )
  ipcMain.handle(
    'workspace:git:discard',
    async (_e, cwd: string, options: { paths: string[]; includeUntracked?: boolean }) =>
      discard(cwd, options || { paths: [] })
  )
  ipcMain.handle(
    'workspace:git:commit',
    async (
      _e,
      cwd: string,
      options: { message: string; amend?: boolean; allowEmpty?: boolean; noVerify?: boolean }
    ) => commit(cwd, options)
  )
  ipcMain.handle('workspace:git:init', async (_e, cwd: string) => initRepo(cwd))

  ipcMain.handle('workspace:git:branches', async (_e, cwd: string) => listBranches(cwd))
  ipcMain.handle(
    'workspace:git:checkout',
    async (_e, cwd: string, options: { target: string; create?: boolean; force?: boolean }) =>
      checkout(cwd, options)
  )
  ipcMain.handle(
    'workspace:git:createBranch',
    async (
      _e,
      cwd: string,
      name: string,
      options?: { checkout?: boolean; startPoint?: string }
    ) => createBranch(cwd, name, options)
  )
  ipcMain.handle(
    'workspace:git:deleteBranch',
    async (_e, cwd: string, name: string, force?: boolean) => deleteBranch(cwd, name, !!force)
  )
  ipcMain.handle('workspace:git:merge', async (_e, cwd: string, branch: string) =>
    merge(cwd, branch)
  )

  ipcMain.handle('workspace:git:remotes', async (_e, cwd: string) => listRemotes(cwd))
  ipcMain.handle(
    'workspace:git:addRemote',
    async (_e, cwd: string, name: string, url: string) => addRemote(cwd, name, url)
  )
  ipcMain.handle('workspace:git:removeRemote', async (_e, cwd: string, name: string) =>
    removeRemote(cwd, name)
  )

  ipcMain.handle('workspace:git:fetch', async (_e, cwd: string, remote?: string) =>
    fetch(cwd, remote)
  )
  ipcMain.handle(
    'workspace:git:pull',
    async (
      _e,
      cwd: string,
      options?: { remote?: string; branch?: string; rebase?: boolean }
    ) => pull(cwd, options || {})
  )
  ipcMain.handle(
    'workspace:git:push',
    async (
      _e,
      cwd: string,
      options?: {
        remote?: string
        branch?: string
        setUpstream?: boolean
        tags?: boolean
        force?: boolean
      }
    ) => push(cwd, options || {})
  )

  ipcMain.handle(
    'workspace:git:clone',
    async (
      _e,
      options: { url: string; targetDir: string; branch?: string; depth?: number }
    ) => cloneRepo(options)
  )

  ipcMain.handle('workspace:git:stash:list', async (_e, cwd: string) => listStash(cwd))
  ipcMain.handle(
    'workspace:git:stash:push',
    async (
      _e,
      cwd: string,
      options?: { message?: string; includeUntracked?: boolean; paths?: string[] }
    ) => stashPush(cwd, options || {})
  )
  ipcMain.handle('workspace:git:stash:pop', async (_e, cwd: string, index?: number) =>
    stashPop(cwd, index)
  )
  ipcMain.handle('workspace:git:stash:apply', async (_e, cwd: string, index?: number) =>
    stashApply(cwd, index)
  )
  ipcMain.handle('workspace:git:stash:drop', async (_e, cwd: string, index?: number) =>
    stashDrop(cwd, index)
  )

  ipcMain.handle('workspace:git:tags', async (_e, cwd: string) => listTags(cwd))
  ipcMain.handle(
    'workspace:git:createTag',
    async (_e, cwd: string, name: string, options?: { message?: string; ref?: string }) =>
      createTag(cwd, name, options)
  )
  ipcMain.handle('workspace:git:deleteTag', async (_e, cwd: string, name: string) =>
    deleteTag(cwd, name)
  )

  ipcMain.handle(
    'workspace:git:log',
    async (_e, cwd: string, options?: { maxCount?: number; path?: string }) =>
      getLog(cwd, options || {})
  )

  ipcMain.handle('workspace:git:checkIgnore', async (_e, cwd: string, paths: string[]) =>
    checkIgnore(cwd, paths || [])
  )

  ipcMain.handle(
    'workspace:git:raw',
    async (_e, cwd: string, args: string[]) => {
      try {
        const abs = await assertValidCwd(cwd)
        if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) {
          return { success: false, error: 'Invalid git args' }
        }
        // 禁止明显危险的全局配置改写
        if (args.some((a) => /^-c$/i.test(a)) && args.join(' ').includes('alias.')) {
          return { success: false, error: 'Unsafe git args rejected' }
        }
        const r = await runGit(abs, args)
        return { success: r.success, data: r, error: r.error }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}
