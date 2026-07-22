/**
 * 左侧 Git SCM 面板
 * - 仓库空状态 / Init
 * - 分支 + Pull/Push/Fetch
 * - 提交框 + staged/changes 列表
 * - 行内 stage/unstage/discard + diff 预览
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  GitBranch,
  GitCommit,
  RefreshCw,
  Plus,
  Minus,
  RotateCcw,
  Upload,
  Download,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  Archive,
  Tag,
  MoreHorizontal,
} from 'lucide-react'
import { useWorkspaceGitStore, selectGitChangeCount } from '../../../stores/workspace-git-store'
import { workspaceGitService } from '../../../services/workspace-git-service'
import type { Workspace } from '../../../types'
import type { GitFileChange } from '../../../types/git'
import { useAppTranslation } from '../../../i18n/hooks'

interface GitPanelProps {
  workspace: Workspace
  onOpenFile?: (filePath: string) => void
}

function statusColor(letter: string): string {
  switch (letter) {
    case 'A':
      return 'text-emerald-500'
    case 'D':
      return 'text-red-500'
    case 'U':
    case '?':
      return 'text-sky-500'
    case '!':
      return 'text-amber-500'
    case 'R':
    case 'C':
      return 'text-violet-500'
    default:
      return 'text-amber-500'
  }
}

function ChangeRow({
  change,
  staged,
  selected,
  busy,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
}: {
  change: GitFileChange
  staged: boolean
  selected: boolean
  busy: boolean
  onSelect: () => void
  onStage?: () => void
  onUnstage?: () => void
  onDiscard?: () => void
}) {
  const letter = workspaceGitService.statusLetter(change)
  const name = change.path.includes('/')
    ? change.path.slice(change.path.lastIndexOf('/') + 1)
    : change.path
  const dir = change.path.includes('/')
    ? change.path.slice(0, change.path.lastIndexOf('/'))
    : ''

  return (
    <div
      className={`group flex items-center gap-1 px-2 py-1 text-xs cursor-pointer border-l-2 ${
        selected
          ? 'bg-teal-50/80 dark:bg-teal-900/20 border-teal-500'
          : 'border-transparent hover:bg-surface-100/80 dark:hover:bg-surface-800/60'
      }`}
      onClick={onSelect}
      title={change.path}
    >
      <span className={`w-3.5 text-center font-mono font-semibold flex-shrink-0 ${statusColor(letter)}`}>
        {letter}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-gray-700 dark:text-gray-200">{name}</div>
        {dir && (
          <div className="truncate text-[10px] text-gray-400 dark:text-gray-500">{dir}</div>
        )}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {staged && onUnstage && (
          <button
            type="button"
            disabled={busy}
            className="p-0.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-500"
            title="Unstage"
            onClick={(e) => {
              e.stopPropagation()
              onUnstage()
            }}
          >
            <Minus size={12} />
          </button>
        )}
        {!staged && onStage && (
          <button
            type="button"
            disabled={busy}
            className="p-0.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-500"
            title="Stage"
            onClick={(e) => {
              e.stopPropagation()
              onStage()
            }}
          >
            <Plus size={12} />
          </button>
        )}
        {!staged && onDiscard && (
          <button
            type="button"
            disabled={busy}
            className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500"
            title="Discard"
            onClick={(e) => {
              e.stopPropagation()
              onDiscard()
            }}
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

function DiffBlock({ diff }: { diff: string }) {
  const lines = diff.split('\n').slice(0, 300)
  if (!diff.trim()) {
    return (
      <div className="px-2 py-3 text-[11px] text-gray-400 dark:text-gray-500">
        No diff content (binary or empty)
      </div>
    )
  }
  return (
    <pre className="max-h-40 overflow-auto text-[10px] leading-relaxed p-2 font-mono bg-surface-900/95 dark:bg-black/40 text-surface-100 border-t border-surface-700/40">
      {lines.map((line, idx) => {
        let color = 'text-surface-300'
        if (line.startsWith('+') && !line.startsWith('+++')) color = 'text-emerald-400 bg-emerald-500/10'
        else if (line.startsWith('-') && !line.startsWith('---')) color = 'text-red-400 bg-red-500/10'
        else if (line.startsWith('@@')) color = 'text-sky-400'
        return (
          <div key={idx} className={color}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}

export function GitPanel({ workspace, onOpenFile }: GitPanelProps) {
  const { t } = useAppTranslation()
  const cwd = workspace.folderPath
  const setCwd = useWorkspaceGitStore((s) => s.setCwd)
  const status = useWorkspaceGitStore((s) => s.status)
  const branches = useWorkspaceGitStore((s) => s.branches)
  const commitMessage = useWorkspaceGitStore((s) => s.commitMessage)
  const setCommitMessage = useWorkspaceGitStore((s) => s.setCommitMessage)
  const busy = useWorkspaceGitStore((s) => s.busy)
  const lastError = useWorkspaceGitStore((s) => s.lastError)
  const clearError = useWorkspaceGitStore((s) => s.clearError)
  const selectedPath = useWorkspaceGitStore((s) => s.selectedPath)
  const selectedStaged = useWorkspaceGitStore((s) => s.selectedStaged)
  const diff = useWorkspaceGitStore((s) => s.diff)
  const refreshAll = useWorkspaceGitStore((s) => s.refreshAll)
  const stage = useWorkspaceGitStore((s) => s.stage)
  const stageAll = useWorkspaceGitStore((s) => s.stageAll)
  const unstage = useWorkspaceGitStore((s) => s.unstage)
  const unstageAll = useWorkspaceGitStore((s) => s.unstageAll)
  const discard = useWorkspaceGitStore((s) => s.discard)
  const commit = useWorkspaceGitStore((s) => s.commit)
  const initRepo = useWorkspaceGitStore((s) => s.initRepo)
  const checkout = useWorkspaceGitStore((s) => s.checkout)
  const createBranch = useWorkspaceGitStore((s) => s.createBranch)
  const fetch = useWorkspaceGitStore((s) => s.fetch)
  const pull = useWorkspaceGitStore((s) => s.pull)
  const push = useWorkspaceGitStore((s) => s.push)
  const stashPush = useWorkspaceGitStore((s) => s.stashPush)
  const selectFile = useWorkspaceGitStore((s) => s.selectFile)
  const changeCount = useWorkspaceGitStore(selectGitChangeCount)

  const [showBranchMenu, setShowBranchMenu] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [stagedOpen, setStagedOpen] = useState(true)
  const [changesOpen, setChangesOpen] = useState(true)

  useEffect(() => {
    setCwd(cwd)
  }, [cwd, setCwd])

  const state = status?.state
  const localBranches = useMemo(
    () => branches.filter((b) => !b.isRemote),
    [branches]
  )

  const handleDiscard = useCallback(
    async (paths: string[], untracked?: boolean) => {
      const ok = window.confirm(
        t('workspace.gitConfirmDiscard', { defaultValue: 'Discard local changes for selected files? This cannot be undone.' })
      )
      if (!ok) return
      await discard(paths, untracked)
    },
    [discard, t]
  )

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) return
    await commit()
  }, [commit, commitMessage])

  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-xs text-gray-400">
        <Loader2 size={18} className="animate-spin text-teal-500" />
        <span>{t('common.loading')}</span>
      </div>
    )
  }

  if (!state.gitAvailable) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4 text-center">
        <AlertCircle size={28} className="text-amber-500" />
        <div className="text-xs font-medium text-gray-700 dark:text-gray-200">
          {t('workspace.gitNotInstalled', { defaultValue: 'Git is not installed' })}
        </div>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
          {t('workspace.gitNotInstalledHint', {
            defaultValue: 'Install Git and ensure it is available in PATH, then refresh.',
          })}
        </p>
        <button
          type="button"
          onClick={() => void refreshAll(cwd)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-500 text-white hover:bg-teal-600"
        >
          {t('common.refresh')}
        </button>
      </div>
    )
  }

  if (!state.isRepo) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4 text-center">
        <FolderGit2 size={28} className="text-teal-500" />
        <div className="text-xs font-medium text-gray-700 dark:text-gray-200">
          {t('workspace.gitNotRepo', { defaultValue: 'Not a Git repository' })}
        </div>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
          {t('workspace.gitInitHint', {
            defaultValue: 'Initialize a repository to track changes, commit, and sync with remotes.',
          })}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void initRepo()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <GitCommit size={12} />}
          {t('workspace.gitInit', { defaultValue: 'Initialize Repository' })}
        </button>
      </div>
    )
  }

  const branchLabel = state.detached
    ? `HEAD ${(state.headCommit || '').slice(0, 7)}`
    : state.branch || '—'
  const aheadBehind =
    state.ahead > 0 || state.behind > 0
      ? ` ↑${state.ahead} ↓${state.behind}`
      : ''

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 工具栏 */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-surface-200/80 dark:border-surface-700/60 flex-shrink-0">
        <div className="relative flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setShowBranchMenu((v) => !v)}
            className="flex items-center gap-1 w-full px-1.5 py-1 rounded-md text-xs text-gray-700 dark:text-gray-200 hover:bg-surface-100 dark:hover:bg-surface-800"
          >
            <GitBranch size={12} className="text-teal-500 flex-shrink-0" />
            <span className="truncate font-medium">{branchLabel}</span>
            <span className="text-[10px] text-gray-400 flex-shrink-0">{aheadBehind}</span>
            <ChevronDown size={12} className="text-gray-400 flex-shrink-0 ml-auto" />
          </button>
          {showBranchMenu && (
            <div className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg p-1">
              {localBranches.map((b) => (
                <button
                  key={b.name}
                  type="button"
                  className={`w-full text-left px-2 py-1 rounded text-xs truncate ${
                    b.isCurrent
                      ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
                      : 'hover:bg-surface-100 dark:hover:bg-surface-800 text-gray-600 dark:text-gray-300'
                  }`}
                  onClick={() => {
                    setShowBranchMenu(false)
                    if (!b.isCurrent) void checkout(b.name)
                  }}
                >
                  {b.name}
                </button>
              ))}
              <div className="border-t border-surface-200 dark:border-surface-700 mt-1 pt-1 px-1">
                <div className="flex gap-1">
                  <input
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder={t('workspace.gitNewBranch', { defaultValue: 'New branch' })}
                    className="flex-1 min-w-0 px-1.5 py-1 text-[11px] rounded border border-surface-200 dark:border-surface-700 bg-transparent"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newBranchName.trim()) {
                        void createBranch(newBranchName.trim(), true)
                        setNewBranchName('')
                        setShowBranchMenu(false)
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={!newBranchName.trim() || busy}
                    className="px-1.5 py-1 text-[11px] rounded bg-teal-500 text-white disabled:opacity-40"
                    onClick={() => {
                      if (!newBranchName.trim()) return
                      void createBranch(newBranchName.trim(), true)
                      setNewBranchName('')
                      setShowBranchMenu(false)
                    }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          title="Fetch"
          disabled={busy}
          onClick={() => void fetch()}
          className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-gray-500 disabled:opacity-40"
        >
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          title="Pull"
          disabled={busy}
          onClick={() => void pull()}
          className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-gray-500 disabled:opacity-40"
        >
          <Download size={13} />
        </button>
        <button
          type="button"
          title="Push"
          disabled={busy}
          onClick={() => void push({ setUpstream: !state.upstream })}
          className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-gray-500 disabled:opacity-40"
        >
          <Upload size={13} />
        </button>
        <div className="relative">
          <button
            type="button"
            title="More"
            onClick={() => setShowMore((v) => !v)}
            className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-gray-500"
          >
            <MoreHorizontal size={13} />
          </button>
          {showMore && (
            <div className="absolute right-0 z-30 mt-1 w-36 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg py-1 text-xs">
              <button
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-surface-100 dark:hover:bg-surface-800 text-left"
                onClick={() => {
                  setShowMore(false)
                  void stashPush()
                }}
              >
                <Archive size={12} />
                {t('workspace.gitStash', { defaultValue: 'Stash' })}
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-surface-100 dark:hover:bg-surface-800 text-left"
                onClick={() => {
                  setShowMore(false)
                  const name = window.prompt(t('workspace.gitTagName', { defaultValue: 'Tag name' }) || 'Tag name')
                  if (name?.trim()) void useWorkspaceGitStore.getState().createTag(name.trim())
                }}
              >
                <Tag size={12} />
                {t('workspace.gitCreateTag', { defaultValue: 'Create Tag' })}
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-surface-100 dark:hover:bg-surface-800 text-left"
                onClick={() => {
                  setShowMore(false)
                  void refreshAll(cwd)
                }}
              >
                <RefreshCw size={12} />
                {t('common.refresh')}
              </button>
            </div>
          )}
        </div>
      </div>

      {lastError && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 bg-red-50 dark:bg-red-950/30 text-[11px] text-red-600 dark:text-red-400 border-b border-red-100 dark:border-red-900/40">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          <span className="flex-1 min-w-0 break-words">{lastError}</span>
          <button type="button" className="underline flex-shrink-0" onClick={clearError}>
            {t('common.close')}
          </button>
        </div>
      )}

      {/* 提交框 */}
      <div className="px-2 py-2 border-b border-surface-200/80 dark:border-surface-700/60 flex-shrink-0 space-y-1.5">
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder={t('workspace.gitCommitMessage', { defaultValue: 'Commit message' })}
          rows={2}
          className="w-full resize-none rounded-md border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 px-2 py-1.5 text-xs text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
        />
        <button
          type="button"
          disabled={busy || !commitMessage.trim() || (status?.staged.length ?? 0) === 0}
          onClick={() => void handleCommit()}
          className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <GitCommit size={12} />}
          {t('workspace.gitCommit', { defaultValue: 'Commit' })}
          {(status?.staged.length ?? 0) > 0 && (
            <span className="text-[10px] opacity-80">({status!.staged.length})</span>
          )}
        </button>
      </div>

      {/* 变更列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Staged */}
        <div>
          <div className="flex items-center gap-1 px-2 py-1.5 sticky top-0 bg-surface-50/95 dark:bg-surface-950/95 backdrop-blur-sm z-10">
            <button
              type="button"
              className="p-0.5 text-gray-400"
              onClick={() => setStagedOpen((v) => !v)}
            >
              {stagedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 flex-1">
              {t('workspace.gitStaged', { defaultValue: 'Staged Changes' })}
              <span className="ml-1 font-normal text-gray-400">{status?.staged.length ?? 0}</span>
            </span>
            {(status?.staged.length ?? 0) > 0 && (
              <button
                type="button"
                disabled={busy}
                className="text-[10px] text-gray-400 hover:text-teal-600 px-1"
                onClick={() => void unstageAll()}
              >
                {t('workspace.gitUnstageAll', { defaultValue: 'Unstage All' })}
              </button>
            )}
          </div>
          {stagedOpen &&
            (status?.staged || []).map((c) => (
              <ChangeRow
                key={`s-${c.path}`}
                change={c}
                staged
                selected={selectedPath === c.path && selectedStaged}
                busy={busy}
                onSelect={() => {
                  void selectFile(c.path, true)
                  onOpenFile?.(c.path)
                }}
                onUnstage={() => void unstage([c.path])}
              />
            ))}
        </div>

        {/* Changes */}
        <div>
          <div className="flex items-center gap-1 px-2 py-1.5 sticky top-0 bg-surface-50/95 dark:bg-surface-950/95 backdrop-blur-sm z-10">
            <button
              type="button"
              className="p-0.5 text-gray-400"
              onClick={() => setChangesOpen((v) => !v)}
            >
              {changesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 flex-1">
              {t('workspace.gitChanges', { defaultValue: 'Changes' })}
              <span className="ml-1 font-normal text-gray-400">
                {(status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0) + (status?.conflicted.length ?? 0)}
              </span>
            </span>
            {changeCount > 0 && (
              <button
                type="button"
                disabled={busy}
                className="text-[10px] text-gray-400 hover:text-teal-600 px-1"
                onClick={() => void stageAll()}
              >
                {t('workspace.gitStageAll', { defaultValue: 'Stage All' })}
              </button>
            )}
          </div>
          {changesOpen && (
            <>
              {(status?.conflicted || []).map((c) => (
                <ChangeRow
                  key={`c-${c.path}`}
                  change={c}
                  staged={false}
                  selected={selectedPath === c.path && !selectedStaged}
                  busy={busy}
                  onSelect={() => void selectFile(c.path, false)}
                  onStage={() => void stage([c.path])}
                />
              ))}
              {(status?.unstaged || []).map((c) => (
                <ChangeRow
                  key={`u-${c.path}`}
                  change={c}
                  staged={false}
                  selected={selectedPath === c.path && !selectedStaged}
                  busy={busy}
                  onSelect={() => {
                    void selectFile(c.path, false)
                    onOpenFile?.(c.path)
                  }}
                  onStage={() => void stage([c.path])}
                  onDiscard={() => void handleDiscard([c.path], false)}
                />
              ))}
              {(status?.untracked || []).map((c) => (
                <ChangeRow
                  key={`t-${c.path}`}
                  change={c}
                  staged={false}
                  selected={selectedPath === c.path && !selectedStaged}
                  busy={busy}
                  onSelect={() => {
                    void selectFile(c.path, false)
                    onOpenFile?.(c.path)
                  }}
                  onStage={() => void stage([c.path])}
                  onDiscard={() => void handleDiscard([c.path], true)}
                />
              ))}
              {changeCount === 0 && (
                <div className="px-3 py-6 text-center text-[11px] text-gray-400">
                  {t('workspace.gitNoChanges', { defaultValue: 'No changes detected' })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Diff 预览 */}
        {selectedPath && diff && (
          <div className="border-t border-surface-200 dark:border-surface-700">
            <div className="px-2 py-1 text-[10px] font-medium text-gray-500 truncate">
              {selectedPath}
              {selectedStaged ? ' (Index)' : ' (Working Tree)'}
            </div>
            <DiffBlock diff={diff.diff} />
          </div>
        )}
      </div>
    </div>
  )
}
