/**
 * 工作区 Git SCM 状态
 */

import { create } from 'zustand'
import { workspaceGitService } from '../services/workspace-git-service'
import type {
  GitBranchInfo,
  GitCommitOptions,
  GitDiffResult,
  GitFileChange,
  GitOutputLine,
  GitPullOptions,
  GitPushOptions,
  GitRemoteInfo,
  GitRepoState,
  GitStashEntry,
  GitStatusResult,
  GitTagInfo,
} from '../types/git'

const MAX_OUTPUT_LINES = 2000

interface WorkspaceGitState {
  cwd: string | null
  status: GitStatusResult | null
  branches: GitBranchInfo[]
  remotes: GitRemoteInfo[]
  stashes: GitStashEntry[]
  tags: GitTagInfo[]
  selectedPath: string | null
  selectedStaged: boolean
  diff: GitDiffResult | null
  commitMessage: string
  outputLines: GitOutputLine[]
  busy: boolean
  lastError: string | null
  /** 是否已订阅 output */
  outputSubscribed: boolean
  _unsubOutput: (() => void) | null
  _refreshTimer: ReturnType<typeof setTimeout> | null

  setCwd: (cwd: string | null) => void
  setCommitMessage: (msg: string) => void
  clearError: () => void
  clearOutput: () => void
  appendOutput: (line: GitOutputLine) => void
  ensureOutputSubscription: () => void
  dispose: () => void

  refreshStatus: (cwd?: string) => Promise<void>
  refreshBranches: (cwd?: string) => Promise<void>
  refreshRemotes: (cwd?: string) => Promise<void>
  refreshStashes: (cwd?: string) => Promise<void>
  refreshAll: (cwd?: string) => Promise<void>
  scheduleRefresh: (cwd?: string, delayMs?: number) => void

  selectFile: (path: string | null, staged?: boolean) => Promise<void>
  loadDiff: (path: string, staged?: boolean) => Promise<void>

  stage: (paths: string[]) => Promise<void>
  stageAll: () => Promise<void>
  unstage: (paths: string[]) => Promise<void>
  unstageAll: () => Promise<void>
  discard: (paths: string[], includeUntracked?: boolean) => Promise<void>
  commit: (options?: Partial<GitCommitOptions>) => Promise<void>
  initRepo: () => Promise<void>

  checkout: (target: string) => Promise<void>
  createBranch: (name: string, checkout?: boolean) => Promise<void>
  fetch: (remote?: string) => Promise<void>
  pull: (options?: GitPullOptions) => Promise<void>
  push: (options?: GitPushOptions) => Promise<void>
  stashPush: (message?: string, includeUntracked?: boolean) => Promise<void>
  stashPop: (index?: number) => Promise<void>
  stashApply: (index?: number) => Promise<void>
  stashDrop: (index?: number) => Promise<void>
  createTag: (name: string, message?: string) => Promise<void>
  deleteTag: (name: string) => Promise<void>
}

function requireCwd(state: WorkspaceGitState, cwd?: string): string {
  const c = cwd || state.cwd
  if (!c) throw new Error('No workspace folder for git')
  return c
}

async function withBusy<T>(
  set: (partial: Partial<WorkspaceGitState>) => void,
  get: () => WorkspaceGitState,
  fn: () => Promise<T>
): Promise<T> {
  set({ busy: true, lastError: null })
  try {
    return await fn()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    set({ lastError: message })
    throw err
  } finally {
    set({ busy: false })
  }
}

export const useWorkspaceGitStore = create<WorkspaceGitState>((set, get) => ({
  cwd: null,
  status: null,
  branches: [],
  remotes: [],
  stashes: [],
  tags: [],
  selectedPath: null,
  selectedStaged: false,
  diff: null,
  commitMessage: '',
  outputLines: [],
  busy: false,
  lastError: null,
  outputSubscribed: false,
  _unsubOutput: null,
  _refreshTimer: null,

  setCwd: (cwd) => {
    const prev = get().cwd
    if (prev === cwd) return
    set({
      cwd,
      status: null,
      branches: [],
      remotes: [],
      stashes: [],
      tags: [],
      selectedPath: null,
      diff: null,
      lastError: null,
    })
    if (cwd) {
      void get().refreshAll(cwd)
    }
  },

  setCommitMessage: (msg) => set({ commitMessage: msg }),
  clearError: () => set({ lastError: null }),
  clearOutput: () => set({ outputLines: [] }),

  appendOutput: (line) => {
    set((s) => {
      const next = [...s.outputLines, line]
      if (next.length > MAX_OUTPUT_LINES) {
        return { outputLines: next.slice(next.length - MAX_OUTPUT_LINES) }
      }
      return { outputLines: next }
    })
  },

  ensureOutputSubscription: () => {
    if (get().outputSubscribed) return
    try {
      const unsub = workspaceGitService.onOutput((line) => {
        get().appendOutput(line)
      })
      set({ outputSubscribed: true, _unsubOutput: unsub })
    } catch {
      // 非 Electron 环境忽略
    }
  },

  dispose: () => {
    const { _unsubOutput, _refreshTimer } = get()
    _unsubOutput?.()
    if (_refreshTimer) clearTimeout(_refreshTimer)
    set({
      outputSubscribed: false,
      _unsubOutput: null,
      _refreshTimer: null,
      cwd: null,
      status: null,
    })
  },

  refreshStatus: async (cwd) => {
    const c = requireCwd(get(), cwd)
    get().ensureOutputSubscription()
    try {
      const status = await workspaceGitService.status(c)
      set({ status, lastError: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ lastError: message })
    }
  },

  refreshBranches: async (cwd) => {
    const c = requireCwd(get(), cwd)
    try {
      const branches = await workspaceGitService.branches(c)
      set({ branches })
    } catch {
      /* status 已报错时分支可能失败 */
    }
  },

  refreshRemotes: async (cwd) => {
    const c = requireCwd(get(), cwd)
    try {
      const remotes = await workspaceGitService.remotes(c)
      set({ remotes })
    } catch {
      /* ignore */
    }
  },

  refreshStashes: async (cwd) => {
    const c = requireCwd(get(), cwd)
    try {
      const [stashes, tags] = await Promise.all([
        workspaceGitService.listStash(c),
        workspaceGitService.tags(c),
      ])
      set({ stashes, tags })
    } catch {
      /* ignore */
    }
  },

  refreshAll: async (cwd) => {
    const c = requireCwd(get(), cwd)
    get().ensureOutputSubscription()
    set({ busy: true, lastError: null })
    try {
      const status = await workspaceGitService.status(c)
      set({ status })
      if (status.state.isRepo) {
        const [branches, remotes, stashes, tags] = await Promise.all([
          workspaceGitService.branches(c).catch(() => [] as GitBranchInfo[]),
          workspaceGitService.remotes(c).catch(() => [] as GitRemoteInfo[]),
          workspaceGitService.listStash(c).catch(() => [] as GitStashEntry[]),
          workspaceGitService.tags(c).catch(() => [] as GitTagInfo[]),
        ])
        set({ branches, remotes, stashes, tags })
      } else {
        set({ branches: [], remotes: [], stashes: [], tags: [] })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ lastError: message })
    } finally {
      set({ busy: false })
    }
  },

  scheduleRefresh: (cwd, delayMs = 400) => {
    const { _refreshTimer } = get()
    if (_refreshTimer) clearTimeout(_refreshTimer)
    const timer = setTimeout(() => {
      set({ _refreshTimer: null })
      void get().refreshStatus(cwd)
    }, delayMs)
    set({ _refreshTimer: timer })
  },

  selectFile: async (path, staged = false) => {
    set({ selectedPath: path, selectedStaged: staged, diff: null })
    if (path) {
      await get().loadDiff(path, staged)
    }
  },

  loadDiff: async (path, staged = false) => {
    const c = get().cwd
    if (!c || !path) return
    try {
      const diff = await workspaceGitService.diff(c, { path, staged })
      set({ diff })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ lastError: message, diff: null })
    }
  },

  stage: async (paths) => {
    const c = requireCwd(get())
    await withBusy(set, get, async () => {
      await workspaceGitService.stage(c, paths)
      await get().refreshStatus(c)
    })
  },

  stageAll: async () => {
    const status = get().status
    if (!status) return
    const paths = [
      ...status.unstaged.map((f) => f.path),
      ...status.untracked.map((f) => f.path),
    ]
    if (paths.length === 0) {
      // 全量 add -A
      await get().stage([])
      return
    }
    await get().stage(paths)
  },

  unstage: async (paths) => {
    const c = requireCwd(get())
    await withBusy(set, get, async () => {
      await workspaceGitService.unstage(c, paths)
      await get().refreshStatus(c)
    })
  },

  unstageAll: async () => {
    await get().unstage([])
  },

  discard: async (paths, includeUntracked) => {
    const c = requireCwd(get())
    await withBusy(set, get, async () => {
      await workspaceGitService.discard(c, { paths, includeUntracked })
      await get().refreshStatus(c)
      if (get().selectedPath && paths.includes(get().selectedPath!)) {
        set({ selectedPath: null, diff: null })
      }
    })
  },

  commit: async (options) => {
    const c = requireCwd(get())
    const message = (options?.message ?? get().commitMessage).trim()
    await withBusy(set, get, async () => {
      await workspaceGitService.commit(c, {
        message,
        amend: options?.amend,
        allowEmpty: options?.allowEmpty,
        noVerify: options?.noVerify,
      })
      set({ commitMessage: '' })
      await get().refreshAll(c)
    })
  },

  initRepo: async () => {
    const c = requireCwd(get())
    await withBusy(set, get, async () => {
      await workspaceGitService.init(c)
      await get().refreshAll(c)
    })
  },

  checkout: async (target) => {
    const c = requireCwd(get())
    await withBusy(set, get, async () => {
      await workspaceGitService.checkout(c, { target })
      await get().refreshAll(c)
    })
  },

  createBranch: async (name, checkout = true) => {
    const c = requireCwd(get())
    await withBusy(set, get, async () => {
      await workspaceGitService.createBranch(c, name, { checkout })
      await get().refreshAll(c)
    })
  },

  fetch: async (remote) => {
    const c = requireCwd(get())
    await withBusy(set, get, async () => {
      await workspaceGitService.fetch(c, remote)
      await get().refreshStatus(c)
    })
  },

  pull: async (options) => {
    const c = requireCwd(get())
    await withBusy(set, get, async () => {
      await workspaceGitService.pull(c, options)
      await get().refreshAll(c)
    })
  },

  push: async (options) => {
    const c = requireCwd(get())
    await withBusy(set, get, async () => {
      await workspaceGitService.push(c, options)
      await get().refreshStatus(c)
    })
  },

  stashPush: async (message, includeUntracked) => {
    const c = requireCwd(get())
    await withBusy(set, get, async () => {
      await workspaceGitService.stashPush(c, { message, includeUntracked })
      await get().refreshAll(c)
    })
  },

  stashPop: async (index) => {
    const c = requireCwd(get())
    await withBusy(set, get, async () => {
      await workspaceGitService.stashPop(c, index)
      await get().refreshAll(c)
    })
  },

  stashApply: async (index) => {
    const c = requireCwd(get())
    await withBusy(set, get, async () => {
      await workspaceGitService.stashApply(c, index)
      await get().refreshAll(c)
    })
  },

  stashDrop: async (index) => {
    const c = requireCwd(get())
    await withBusy(set, get, async () => {
      await workspaceGitService.stashDrop(c, index)
      await get().refreshStashes(c)
    })
  },

  createTag: async (name, message) => {
    const c = requireCwd(get())
    await withBusy(set, get, async () => {
      await workspaceGitService.createTag(c, name, message ? { message } : undefined)
      await get().refreshStashes(c)
    })
  },

  deleteTag: async (name) => {
    const c = requireCwd(get())
    await withBusy(set, get, async () => {
      await workspaceGitService.deleteTag(c, name)
      await get().refreshStashes(c)
    })
  },
}))

/** 选择器：变更文件总数 */
export function selectGitChangeCount(s: WorkspaceGitState): number {
  const st = s.status
  if (!st) return 0
  return new Set(st.all.map((f: GitFileChange) => f.path)).size
}

/** 选择器：repo state */
export function selectGitRepoState(s: WorkspaceGitState): GitRepoState | null {
  return s.status?.state ?? null
}
