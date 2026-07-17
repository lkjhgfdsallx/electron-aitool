/**
 * 工作区选择器组件
 *
 * 在侧边栏中显示当前工作区名称和下拉选择列表，
 * 支持选择已有工作区、创建新工作区、退出工作区模式。
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import type { Workspace } from '../../types'
import { useAppTranslation } from '@/i18n/hooks'

interface WorkspaceSelectorProps {
  collapsed?: boolean
  onCreateWorkspace?: () => void
  onOpenSettings?: (section: string) => void
}

export function WorkspaceSelector({
  collapsed = false,
  onCreateWorkspace,
  onOpenSettings,
}: WorkspaceSelectorProps) {
  const { t } = useAppTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const activateWorkspace = useWorkspaceStore((s) => s.activateWorkspace)
  const deactivateWorkspace = useWorkspaceStore((s) => s.deactivateWorkspace)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = useCallback(
    (ws: Workspace | null) => {
      if (ws) {
        activateWorkspace(ws.id)
      } else {
        deactivateWorkspace()
      }
      setIsOpen(false)
    },
    [activateWorkspace, deactivateWorkspace]
  )

  // 折叠模式：只显示图标
  if (collapsed) {
    return (
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
          activeWorkspace
            ? 'bg-teal-500/15 text-teal-500 hover:bg-teal-500/25'
            : 'text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800'
        }`}
        title={activeWorkspace ? activeWorkspace.name : t('workspace.selectWorkspace')}
        aria-label={activeWorkspace ? activeWorkspace.name : t('workspace.selectWorkspace')}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
        {activeWorkspace && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-teal-500 ring-2 ring-white dark:ring-surface-900" />
        )}
      </button>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 触发按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
          activeWorkspace
            ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 hover:bg-teal-500/15'
            : 'text-surface-500 dark:text-surface-400 border border-transparent hover:bg-surface-100 dark:hover:bg-surface-800'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
        <span className="truncate flex-1 text-left">
          {activeWorkspace ? activeWorkspace.name : t('workspace.noWorkspace')}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 shadow-lg shadow-black/10 dark:shadow-black/30 overflow-hidden animate-fade-in">
          {/* 无工作区选项 */}
          <button
            onClick={() => handleSelect(null)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
              !activeWorkspace
                ? 'bg-surface-100 dark:bg-surface-700 text-surface-900 dark:text-surface-100'
                : 'text-surface-500 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-700/50'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
            <span>{t('workspace.noWorkspace')}</span>
          </button>

          {/* 工作区列表 */}
          {workspaces.length > 0 && (
            <div className="border-t border-surface-100 dark:border-surface-700">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => handleSelect(ws)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                    ws.id === activeWorkspaceId
                      ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                      : 'text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700/50'
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                  <div className="flex-1 text-left min-w-0">
                    <div className="truncate font-medium">{ws.name}</div>
                    {ws.description && (
                      <div className="truncate text-xs text-surface-400 dark:text-surface-500 mt-0.5">
                        {ws.description}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* 操作区 */}
          <div className="border-t border-surface-100 dark:border-surface-700">
            <button
              onClick={() => {
                setIsOpen(false)
                onCreateWorkspace?.()
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-500/10 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>{t('workspace.newWorkspace')}</span>
            </button>
            {activeWorkspace && (
              <button
                onClick={() => {
                  setIsOpen(false)
                  onOpenSettings?.('workspace')
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-surface-500 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v4m0 14v4M4.22 4.22l2.83 2.83m9.9 9.9l2.83 2.83M1 12h4m14 0h4M4.22 19.78l2.83-2.83m9.9-9.9l2.83-2.83" />
                </svg>
                <span>{t('settings.workspaceSettings')}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
