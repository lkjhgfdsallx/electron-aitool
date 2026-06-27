/**
 * 工作区指示条组件
 *
 * 在 ChatWindow 中的 Agent 选择栏上方显示，
 * 展示当前工作区信息、存档点数量、操作入口。
 */

import { useWorkspaceStore } from '../../stores/workspace-store'
import { useAgentStore } from '../../stores/agent-store'

interface WorkspaceIndicatorBarProps {
  onOpenCheckpointHistory?: () => void
  onOpenSettings?: (section: string) => void
  onExitWorkspace?: () => void
}

export function WorkspaceIndicatorBar({
  onOpenCheckpointHistory,
  onOpenSettings,
  onExitWorkspace,
}: WorkspaceIndicatorBarProps) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const checkpointIndex = useWorkspaceStore((s) => s.checkpointIndex)
  const watcherActive = useWorkspaceStore((s) => s.watcherActive)
  const agents = useAgentStore((s) => s.agents)

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
  if (!workspace) return null

  const leaderAgent = workspace.leaderAgentId
    ? agents.find((a) => a.id === workspace.leaderAgentId)
    : null

  const teamCount = workspace.teamAgentIds.length

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-teal-200/60 dark:border-teal-800/40 bg-teal-50/50 dark:bg-teal-950/20 backdrop-blur-sm">
      {/* 工作区图标 + 名称 */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 rounded-md bg-teal-500/15 flex items-center justify-center shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-600 dark:text-teal-400">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
        </div>
        <span className="text-sm font-medium text-teal-700 dark:text-teal-300 truncate">
          {workspace.name}
        </span>
      </div>

      {/* 分隔符 */}
      <div className="w-px h-4 bg-teal-200 dark:bg-teal-800" />

      {/* AI 领导信息 */}
      {leaderAgent && (
        <div className="flex items-center gap-1.5 text-xs text-surface-500 dark:text-surface-400">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span className="truncate max-w-[100px]">{leaderAgent.name}</span>
          {teamCount > 0 && (
            <span className="text-surface-400 dark:text-surface-500">+{teamCount} 团队</span>
          )}
        </div>
      )}

      {/* 分隔符 */}
      <div className="w-px h-4 bg-teal-200 dark:bg-teal-800" />

      {/* 存档点信息 */}
      <button
        onClick={onOpenCheckpointHistory}
        className="flex items-center gap-1.5 text-xs text-surface-500 dark:text-surface-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>{checkpointIndex.length} 存档</span>
      </button>

      {/* 监控状态 */}
      {watcherActive && (
        <div className="flex items-center gap-1 text-xs text-emerald-500 dark:text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>监控中</span>
        </div>
      )}

      {/* 弹性空间 */}
      <div className="flex-1" />

      {/* 操作按钮 */}
      <div className="flex items-center gap-1">
        {/* 工作区设置 */}
        <button
          onClick={() => onOpenSettings?.('workspace')}
          className="p-1.5 rounded-md hover:bg-teal-100 dark:hover:bg-teal-900/30 text-surface-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
          title="工作区设置"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4m0 14v4M4.22 4.22l2.83 2.83m9.9 9.9l2.83 2.83M1 12h4m14 0h4M4.22 19.78l2.83-2.83m9.9-9.9l2.83-2.83" />
          </svg>
        </button>

        {/* 退出工作区 */}
        <button
          onClick={onExitWorkspace}
          className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-surface-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          title="退出工作区"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
