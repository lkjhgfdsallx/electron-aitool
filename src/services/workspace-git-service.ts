/**
 * 工作区 Git SCM 服务（渲染进程）
 * 封装 window.electronAPI.workspace.git IPC
 */

import type {
  GitBranchInfo,
  GitCommitOptions,
  GitDiffResult,
  GitFileChange,
  GitIpcResult,
  GitLogEntry,
  GitOutputLine,
  GitPullOptions,
  GitPushOptions,
  GitRemoteInfo,
  GitRepoState,
  GitStashEntry,
  GitStashPushOptions,
  GitStatusResult,
  GitTagInfo,
} from '../types/git'

function api() {
  const git = window.electronAPI?.workspace?.git
  if (!git) {
    throw new Error('Git API is not available (not running in Electron?)')
  }
  return git
}

let outputSeq = 0

function unwrap<T>(result: GitIpcResult<T>, fallbackError = 'Git operation failed'): T {
  if (!result.success) {
    throw new Error(result.error || fallbackError)
  }
  return result.data as T
}

export const workspaceGitService = {
  async version(): Promise<{ available: boolean; version?: string }> {
    const r = await api().version()
    return unwrap(r as GitIpcResult<{ available: boolean; version?: string }>, 'Failed to get git version')
  },

  async isRepo(cwd: string): Promise<{ isRepo: boolean; gitAvailable: boolean; version?: string }> {
    const r = await api().isRepo(cwd)
    return unwrap(
      r as GitIpcResult<{ isRepo: boolean; gitAvailable: boolean; version?: string }>,
      'Failed to detect git repo'
    )
  },

  async getState(cwd: string): Promise<GitRepoState> {
    const r = await api().getState(cwd)
    return unwrap(r as GitIpcResult<GitRepoState>, 'Failed to get git state')
  },

  async status(cwd: string): Promise<GitStatusResult> {
    const r = await api().status(cwd)
    return unwrap(r as GitIpcResult<GitStatusResult>, 'Failed to get git status')
  },

  async diff(
    cwd: string,
    options?: { path?: string; staged?: boolean; maxChars?: number }
  ): Promise<GitDiffResult> {
    const r = await api().diff(cwd, options)
    return unwrap(r as GitIpcResult<GitDiffResult>, 'Failed to get git diff')
  },

  async stage(cwd: string, paths: string[]): Promise<void> {
    const r = await api().stage(cwd, paths)
    if (!r.success) throw new Error(r.error || 'git stage failed')
  },

  async unstage(cwd: string, paths: string[]): Promise<void> {
    const r = await api().unstage(cwd, paths)
    if (!r.success) throw new Error(r.error || 'git unstage failed')
  },

  async discard(cwd: string, options: { paths: string[]; includeUntracked?: boolean }): Promise<void> {
    const r = await api().discard(cwd, options)
    if (!r.success) throw new Error(r.error || 'git discard failed')
  },

  async commit(cwd: string, options: GitCommitOptions): Promise<{ commit?: string }> {
    const r = await api().commit(cwd, options)
    return unwrap(r as GitIpcResult<{ commit?: string }>, 'git commit failed')
  },

  async init(cwd: string): Promise<void> {
    const r = await api().init(cwd)
    if (!r.success) throw new Error(r.error || 'git init failed')
  },

  async branches(cwd: string): Promise<GitBranchInfo[]> {
    const r = await api().branches(cwd)
    return unwrap(r as GitIpcResult<GitBranchInfo[]>, 'Failed to list branches') || []
  },

  async checkout(cwd: string, options: { target: string; create?: boolean; force?: boolean }): Promise<void> {
    const r = await api().checkout(cwd, options)
    if (!r.success) throw new Error(r.error || 'git checkout failed')
  },

  async createBranch(
    cwd: string,
    name: string,
    options?: { checkout?: boolean; startPoint?: string }
  ): Promise<void> {
    const r = await api().createBranch(cwd, name, options)
    if (!r.success) throw new Error(r.error || 'create branch failed')
  },

  async deleteBranch(cwd: string, name: string, force?: boolean): Promise<void> {
    const r = await api().deleteBranch(cwd, name, force)
    if (!r.success) throw new Error(r.error || 'delete branch failed')
  },

  async merge(cwd: string, branch: string): Promise<void> {
    const r = await api().merge(cwd, branch)
    if (!r.success) throw new Error(r.error || 'git merge failed')
  },

  async remotes(cwd: string): Promise<GitRemoteInfo[]> {
    const r = await api().remotes(cwd)
    return unwrap(r as GitIpcResult<GitRemoteInfo[]>, 'Failed to list remotes') || []
  },

  async addRemote(cwd: string, name: string, url: string): Promise<void> {
    const r = await api().addRemote(cwd, name, url)
    if (!r.success) throw new Error(r.error || 'add remote failed')
  },

  async removeRemote(cwd: string, name: string): Promise<void> {
    const r = await api().removeRemote(cwd, name)
    if (!r.success) throw new Error(r.error || 'remove remote failed')
  },

  async fetch(cwd: string, remote?: string): Promise<void> {
    const r = await api().fetch(cwd, remote)
    if (!r.success) throw new Error(r.error || 'git fetch failed')
  },

  async pull(cwd: string, options?: GitPullOptions): Promise<void> {
    const r = await api().pull(cwd, options)
    if (!r.success) throw new Error(r.error || 'git pull failed')
  },

  async push(cwd: string, options?: GitPushOptions): Promise<void> {
    const r = await api().push(cwd, options)
    if (!r.success) throw new Error(r.error || 'git push failed')
  },

  async clone(options: {
    url: string
    targetDir: string
    branch?: string
    depth?: number
  }): Promise<void> {
    const r = await api().clone(options)
    if (!r.success) throw new Error(r.error || 'git clone failed')
  },

  async listStash(cwd: string): Promise<GitStashEntry[]> {
    const r = await api().stash.list(cwd)
    return unwrap(r as GitIpcResult<GitStashEntry[]>, 'Failed to list stash') || []
  },

  async stashPush(cwd: string, options?: GitStashPushOptions): Promise<void> {
    const r = await api().stash.push(cwd, options)
    if (!r.success) throw new Error(r.error || 'stash push failed')
  },

  async stashPop(cwd: string, index?: number): Promise<void> {
    const r = await api().stash.pop(cwd, index)
    if (!r.success) throw new Error(r.error || 'stash pop failed')
  },

  async stashApply(cwd: string, index?: number): Promise<void> {
    const r = await api().stash.apply(cwd, index)
    if (!r.success) throw new Error(r.error || 'stash apply failed')
  },

  async stashDrop(cwd: string, index?: number): Promise<void> {
    const r = await api().stash.drop(cwd, index)
    if (!r.success) throw new Error(r.error || 'stash drop failed')
  },

  async tags(cwd: string): Promise<GitTagInfo[]> {
    const r = await api().tags(cwd)
    return unwrap(r as GitIpcResult<GitTagInfo[]>, 'Failed to list tags') || []
  },

  async createTag(
    cwd: string,
    name: string,
    options?: { message?: string; ref?: string }
  ): Promise<void> {
    const r = await api().createTag(cwd, name, options)
    if (!r.success) throw new Error(r.error || 'create tag failed')
  },

  async deleteTag(cwd: string, name: string): Promise<void> {
    const r = await api().deleteTag(cwd, name)
    if (!r.success) throw new Error(r.error || 'delete tag failed')
  },

  async log(cwd: string, options?: { maxCount?: number; path?: string }): Promise<GitLogEntry[]> {
    const r = await api().log(cwd, options)
    return unwrap(r as GitIpcResult<GitLogEntry[]>, 'Failed to get log') || []
  },

  async checkIgnore(
    cwd: string,
    paths: string[]
  ): Promise<Array<{ path: string; ignored: boolean; source?: string }>> {
    const r = await api().checkIgnore(cwd, paths)
    return (
      unwrap(
        r as GitIpcResult<Array<{ path: string; ignored: boolean; source?: string }>>,
        'check-ignore failed'
      ) || []
    )
  },

  /**
   * 订阅 Git Output 事件；返回取消订阅函数。
   */
  onOutput(callback: (line: GitOutputLine) => void): () => void {
    return api().onOutput((data: {
      timestamp: number
      cwd?: string
      command?: string
      stream: 'stdout' | 'stderr' | 'system' | 'command'
      text: string
    }) => {
      callback({
        id: `git-out-${++outputSeq}-${data.timestamp}`,
        timestamp: data.timestamp,
        cwd: data.cwd,
        command: data.command,
        stream: data.stream,
        text: data.text,
      })
    })
  },

  /** 变更文件计数（角标用） */
  countChanges(status: GitStatusResult | null | undefined): number {
    if (!status) return 0
    const paths = new Set<string>()
    for (const f of status.all) paths.add(f.path)
    return paths.size
  },

  statusLetter(change: GitFileChange): string {
    switch (change.status) {
      case 'added':
        return 'A'
      case 'deleted':
        return 'D'
      case 'renamed':
        return 'R'
      case 'copied':
        return 'C'
      case 'untracked':
        return 'U'
      case 'conflicted':
        return '!'
      case 'typechange':
        return 'T'
      case 'modified':
      default:
        return 'M'
    }
  },
}
