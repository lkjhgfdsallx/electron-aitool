/**
 * 文件树右键菜单组件
 * 
 * 功能：
 * - 文件夹右键菜单：新建文件、新建文件夹、在文件夹中搜索、重命名、删除
 * - 文件右键菜单：复制、剪切、重命名、删除、在文件资源管理器中显示
 */

import { useEffect, useRef, useCallback } from 'react'
import {
  FilePlus, FolderPlus, Search, Pencil, Trash2,
  Copy, Scissors, ExternalLink, Clipboard,
} from 'lucide-react'
import type { DirEntry } from '../../services/workspace-fs-service'
import { useAppTranslation } from '../../i18n/hooks'

// ---- 类型定义 ----

export type FileTreeAction =
  | { type: 'newFile'; parentPath: string }
  | { type: 'newFolder'; parentPath: string }
  | { type: 'rename'; path: string; isDirectory: boolean }
  | { type: 'delete'; path: string; isDirectory: boolean }
  | { type: 'copy'; path: string }
  | { type: 'cut'; path: string }
  | { type: 'paste'; targetPath: string }
  | { type: 'searchInFolder'; folderPath: string }
  | { type: 'revealInExplorer'; path: string }

export interface ClipboardState {
  path: string
  operation: 'copy' | 'cut'
}

interface FileTreeContextMenuProps {
  /** 右键点击的条目 */
  entry: DirEntry
  /** 工作区根目录 */
  rootPath: string
  /** 菜单显示位置 */
  position: { x: number; y: number }
  /** 剪贴板状态 */
  clipboard: ClipboardState | null
  /** 关闭菜单 */
  onClose: () => void
  /** 执行操作 */
  onAction: (action: FileTreeAction) => void
}

// ---- 组件 ----

export function FileTreeContextMenu({
  entry,
  rootPath,
  position,
  clipboard,
  onClose,
  onAction,
}: FileTreeContextMenuProps) {
  const { t } = useAppTranslation()
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // 使用 setTimeout 确保不会立即关闭（右键事件传播）
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  // 确保菜单不超出视口
  const adjustedPosition = useCallback(() => {
    const menuWidth = 200
    const menuHeight = entry.isDirectory ? 220 : 240
    const x = Math.min(position.x, window.innerWidth - menuWidth - 10)
    const y = Math.min(position.y, window.innerHeight - menuHeight - 10)
    return { x: Math.max(0, x), y: Math.max(0, y) }
  }, [position, entry.isDirectory])()

  const handleAction = useCallback((action: FileTreeAction) => {
    onAction(action)
    onClose()
  }, [onAction, onClose])

  // 文件夹菜单项
  const folderMenuItems = [
    {
      icon: FilePlus,
      label: t('workspace.newFile', '新建文件'),
      action: () => handleAction({ type: 'newFile', parentPath: entry.path }),
    },
    {
      icon: FolderPlus,
      label: t('workspace.newFolder', '新建文件夹'),
      action: () => handleAction({ type: 'newFolder', parentPath: entry.path }),
    },
    {
      icon: Search,
      label: t('workspace.searchInFolder', '在文件夹中搜索'),
      action: () => handleAction({ type: 'searchInFolder', folderPath: entry.path }),
    },
    { divider: true },
    {
      icon: Clipboard,
      label: t('workspace.paste', '粘贴'),
      action: () => handleAction({ type: 'paste', targetPath: entry.path }),
      disabled: !clipboard,
    },
    { divider: true },
    {
      icon: Pencil,
      label: t('workspace.rename', '重命名'),
      action: () => handleAction({ type: 'rename', path: entry.path, isDirectory: true }),
    },
    {
      icon: Trash2,
      label: t('workspace.delete', '删除'),
      action: () => handleAction({ type: 'delete', path: entry.path, isDirectory: true }),
      danger: true,
    },
  ]

  // 文件菜单项
  const fileMenuItems = [
    {
      icon: Copy,
      label: t('workspace.copy', '复制'),
      action: () => handleAction({ type: 'copy', path: entry.path }),
    },
    {
      icon: Scissors,
      label: t('workspace.cut', '剪切'),
      action: () => handleAction({ type: 'cut', path: entry.path }),
    },
    {
      icon: Pencil,
      label: t('workspace.rename', '重命名'),
      action: () => handleAction({ type: 'rename', path: entry.path, isDirectory: false }),
    },
    { divider: true },
    {
      icon: ExternalLink,
      label: t('workspace.revealInExplorer', '在文件资源管理器中显示'),
      action: () => handleAction({ type: 'revealInExplorer', path: entry.path }),
    },
    { divider: true },
    {
      icon: Trash2,
      label: t('workspace.delete', '删除'),
      action: () => handleAction({ type: 'delete', path: entry.path, isDirectory: false }),
      danger: true,
    },
  ]

  const menuItems = entry.isDirectory ? folderMenuItems : fileMenuItems

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white dark:bg-surface-800 rounded-lg shadow-xl border border-surface-200 dark:border-surface-700 py-1 min-w-[180px] animate-fade-in"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {menuItems.map((item, index) => {
        if ('divider' in item && item.divider) {
          return (
            <div
              key={`divider-${index}`}
              className="my-1 border-t border-surface-100 dark:border-surface-700"
            />
          )
        }

        const menuItem = item as {
          icon: typeof FilePlus
          label: string
          action: () => void
          disabled?: boolean
          danger?: boolean
        }

        return (
          <button
            key={menuItem.label}
            onClick={menuItem.action}
            disabled={menuItem.disabled}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
              menuItem.disabled
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : menuItem.danger
                  ? 'text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-700/50'
            }`}
          >
            <menuItem.icon size={14} className="flex-shrink-0" />
            <span>{menuItem.label}</span>
          </button>
        )
      })}
    </div>
  )
}
