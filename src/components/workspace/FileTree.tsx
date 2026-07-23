/**
 * 文件树组件 - 递归展示工作区目录结构
 *
 * 功能：
 * - 读取真实目录结构（通过 IPC readDir）
 * - 懒加载：展开目录时才读取子目录
 * - 点击文件触发 onFileSelect 回调
 * - 支持文件变化高亮（B8：changedFiles prop）
 * - 右键菜单：文件和文件夹操作
 * - 剪贴板：复制、剪切、粘贴
 * - 内联输入：新建文件/文件夹、重命名
 *
 * 注：搜索功能已迁移到独立的 WorkspaceSearchPanel 组件
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  FolderOpen, Folder, FileText, File, ChevronRight, ChevronDown,
  FileCode, FileJson, FileImage, FileType, RefreshCw, Check, X,
} from 'lucide-react'
import { workspaceFsService, type DirEntry } from '../../services/workspace-fs-service'
import { useAppTranslation } from '../../i18n/hooks'
import { FileTreeContextMenu, type FileTreeAction, type ClipboardState } from './FileTreeContextMenu'

// ---- Props ----

interface FileTreeProps {
  /** 工作区根目录绝对路径 */
  rootPath: string
  /** 文件被点击时回调 */
  onFileSelect: (filePath: string, line?: number) => void
  /** 当前选中的文件路径 */
  selectedFile?: string
  /** 文件变化集合（B8：高亮标记） */
  changedFiles?: Set<string>
  /** 在文件夹中搜索回调 */
  onSearchInFolder?: (folderPath: string) => void
}

// ---- 内联输入状态 ----

interface InlineInputState {
  type: 'newFile' | 'newFolder' | 'rename'
  parentPath: string
  /** 重命名时的原名称 */
  originalName?: string
  /** 重命名时的原路径 */
  originalPath?: string
  /** 是否为目录 */
  isDirectory?: boolean
}

// ---- 右键菜单状态 ----

interface ContextMenuState {
  entry: DirEntry
  position: { x: number; y: number }
}

// ---- 文件图标映射 ----

function getFileIcon(entry: DirEntry) {
  if (entry.isDirectory) return null // 目录图标由 TreeNode 自行处理

  const ext = entry.ext.toLowerCase()
  const iconClass = 'w-3.5 h-3.5 flex-shrink-0'

  // 代码文件
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'].includes(ext)) {
    return <FileCode size={14} className={`${iconClass} text-blue-400`} />
  }
  // JSON
  if (['.json', '.jsonc'].includes(ext)) {
    return <FileJson size={14} className={`${iconClass} text-yellow-400`} />
  }
  // 图片
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'].includes(ext)) {
    return <FileImage size={14} className={`${iconClass} text-purple-400`} />
  }
  // Markdown
  if (['.md', '.mdx'].includes(ext)) {
    return <FileType size={14} className={`${iconClass} text-teal-400`} />
  }
  // 其他文本
  if (workspaceFsService.isTextFile(ext)) {
    return <FileText size={14} className={`${iconClass} text-gray-400`} />
  }
  // 二进制/未知
  return <File size={14} className={`${iconClass} text-gray-300 dark:text-gray-600`} />
}

// ---- 内联输入框组件 ----

interface InlineInputProps {
  type: 'newFile' | 'newFolder' | 'rename'
  defaultValue: string
  onSubmit: (value: string) => void
  onCancel: () => void
  indent: number
}

function InlineInput({ type, defaultValue, onSubmit, onCancel, indent }: InlineInputProps) {
  const { t } = useAppTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    // 选中文件名（不含扩展名）
    if (type !== 'newFolder' && defaultValue.includes('.')) {
      const dotIndex = defaultValue.lastIndexOf('.')
      inputRef.current?.setSelectionRange(0, dotIndex)
    } else {
      inputRef.current?.select()
    }
  }, [type, defaultValue])

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) {
      setError(type === 'newFolder' ? t('workspace.enterFolderName', '请输入文件夹名') : t('workspace.enterFileName', '请输入文件名'))
      return
    }
    if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes(':')) {
      setError(t('workspace.invalidName', '名称不能包含特殊字符'))
      return
    }
    onSubmit(trimmed)
  }, [value, type, onSubmit, t])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }, [handleSubmit, onCancel])

  return (
    <div
      className="flex items-center gap-1 py-[3px] pr-2"
      style={{ paddingLeft: `${indent + 8}px` }}
    >
      <span className="w-3 h-3 flex-shrink-0" />
      {type === 'newFolder' ? (
        <Folder size={14} className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
      ) : (
        <FileText size={14} className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(null) }}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        className="flex-1 text-[12px] bg-white dark:bg-surface-700 border border-teal-500 rounded px-1 py-0.5 outline-none text-gray-700 dark:text-gray-300"
        placeholder={type === 'newFolder' ? t('workspace.enterFolderName', '文件夹名') : t('workspace.enterFileName', '文件名')}
      />
      <button
        onClick={handleSubmit}
        className="p-0.5 rounded hover:bg-teal-100 dark:hover:bg-teal-900/30 text-teal-600 dark:text-teal-400"
      >
        <Check size={12} />
      </button>
      <button
        onClick={onCancel}
        className="p-0.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-400"
      >
        <X size={12} />
      </button>
      {error && (
        <span className="absolute bottom-0 left-0 right-0 text-[10px] text-red-500 bg-white dark:bg-surface-800 px-2 py-0.5">
          {error}
        </span>
      )}
    </div>
  )
}

// ---- 单个树节点 ----

interface TreeNodeProps {
  entry: DirEntry
  depth: number
  rootPath: string
  onFileSelect: (filePath: string, line?: number) => void
  selectedFile?: string
  changedFiles?: Set<string>
  /** 内联输入状态 */
  inlineInput: InlineInputState | null
  onSetInlineInput: (state: InlineInputState | null) => void
  /** 右键菜单 */
  contextMenu: ContextMenuState | null
  onSetContextMenu: (state: ContextMenuState | null) => void
  /** 剪贴板 */
  clipboard: ClipboardState | null
  onSetClipboard: (state: ClipboardState | null) => void
  /** 刷新父目录 */
  onRefreshParent?: (path: string) => void
  /** 右键菜单操作回调（提升到父组件） */
  onContextMenuAction?: (action: FileTreeAction) => void
  /** 内联输入提交回调（提升到父组件） */
  onInlineSubmit?: (value: string) => void
  /** 展开的目录集合 */
  expandedDirs?: Set<string>
  /** 设置展开目录 */
  onSetExpandedDirs?: (dirs: Set<string>) => void
  /** 在文件夹中搜索回调 */
  onSearchInFolder?: (folderPath: string) => void
}

function TreeNode({
  entry,
  depth,
  rootPath,
  onFileSelect,
  selectedFile,
  changedFiles,
  inlineInput,
  onSetInlineInput,
  contextMenu,
  onSetContextMenu,
  clipboard,
  onSetClipboard,
  onRefreshParent,
  onContextMenuAction,
  onInlineSubmit,
  expandedDirs,
  onSetExpandedDirs,
  onSearchInFolder,
}: TreeNodeProps) {
  const { t } = useAppTranslation()
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const isSelected = selectedFile === entry.path
  const isChanged = changedFiles?.has(entry.path) ?? false
  const isRoot = entry.path === rootPath

  const handleToggle = useCallback(async () => {
    if (!entry.isDirectory) {
      onFileSelect(entry.path)
      return
    }

    if (!expanded && !loaded) {
      setLoading(true)
      try {
        const entries = await workspaceFsService.readDir(entry.path)
        setChildren(entries)
        setLoaded(true)
      } catch (err) {
        console.error('[FileTree] 读取目录失败:', err)
      } finally {
        setLoading(false)
      }
    }
    setExpanded(!expanded)
  }, [entry, expanded, loaded, onFileSelect])

  // 根目录自动展开
  useEffect(() => {
    if (isRoot && !loaded) {
      handleToggle()
    }
  }, [isRoot]) // eslint-disable-line react-hooks/exhaustive-deps

  // 右键菜单处理
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onSetContextMenu({
      entry,
      position: { x: e.clientX, y: e.clientY },
    })
  }, [entry, onSetContextMenu])

  // 处理右键菜单操作
  const handleAction = useCallback(async (action: FileTreeAction) => {
    switch (action.type) {
      case 'newFile':
        onSetInlineInput({ type: 'newFile', parentPath: action.parentPath })
        // 确保目录展开
        if (!expanded) {
          setExpanded(true)
          if (!loaded) {
            try {
              const entries = await workspaceFsService.readDir(entry.path)
              setChildren(entries)
              setLoaded(true)
            } catch (err) {
              console.error('[FileTree] 读取目录失败:', err)
            }
          }
        }
        break
      case 'newFolder':
        onSetInlineInput({ type: 'newFolder', parentPath: action.parentPath })
        if (!expanded) {
          setExpanded(true)
          if (!loaded) {
            try {
              const entries = await workspaceFsService.readDir(entry.path)
              setChildren(entries)
              setLoaded(true)
            } catch (err) {
              console.error('[FileTree] 读取目录失败:', err)
            }
          }
        }
        break
      case 'rename':
        onSetInlineInput({
          type: 'rename',
          parentPath: entry.path.split(/[/\\]/).slice(0, -1).join('/') || rootPath,
          originalName: entry.name,
          originalPath: entry.path,
          isDirectory: action.isDirectory,
        })
        break
      case 'delete': {
        const confirmMsg = action.isDirectory
          ? t('workspace.confirmDeleteFolder', '确定要删除此文件夹及其所有内容吗？')
          : t('workspace.confirmDeleteFile', '确定要删除此文件吗？')
        if (window.confirm(confirmMsg)) {
          try {
            if (action.isDirectory) {
              await workspaceFsService.deleteDir(action.path)
            } else {
              await workspaceFsService.deleteFile(action.path)
            }
            onRefreshParent?.(action.path)
          } catch (err) {
            console.error('[FileTree] 删除失败:', err)
            alert(t('common.error', '错误') + ': ' + (err instanceof Error ? err.message : String(err)))
          }
        }
        break
      }
      case 'copy':
        onSetClipboard({ path: action.path, operation: 'copy' })
        break
      case 'cut':
        onSetClipboard({ path: action.path, operation: 'cut' })
        break
      case 'paste': {
        if (!clipboard) break
        try {
          const srcName = clipboard.path.split(/[/\\]/).pop() || ''
          const destPath = `${action.targetPath}/${srcName}`
          await workspaceFsService.copyFile(clipboard.path, destPath)
          if (clipboard.operation === 'cut') {
            await workspaceFsService.deleteFile(clipboard.path)
            onSetClipboard(null)
          }
          onRefreshParent?.(action.targetPath)
        } catch (err) {
          console.error('[FileTree] 粘贴失败:', err)
          alert(t('common.error', '错误') + ': ' + (err instanceof Error ? err.message : String(err)))
        }
        break
      }
      case 'searchInFolder':
        onSearchInFolder?.(action.folderPath)
        break
      case 'revealInExplorer':
        try {
          await workspaceFsService.revealInExplorer(action.path)
        } catch (err) {
          console.error('[FileTree] 打开文件资源管理器失败:', err)
        }
        break
    }
  }, [entry, expanded, loaded, rootPath, clipboard, t, onSetInlineInput, onSetContextMenu, onSetClipboard, onRefreshParent])

  // 处理内联输入提交
  const handleInlineSubmit = useCallback(async (value: string) => {
    if (!inlineInput) return

    try {
      if (inlineInput.type === 'rename' && inlineInput.originalPath) {
        const parentDir = inlineInput.originalPath.split(/[/\\]/).slice(0, -1).join('/') || rootPath
        const newPath = `${parentDir}/${value}`
        await workspaceFsService.rename(inlineInput.originalPath, newPath)
        onRefreshParent?.(parentDir)
      } else {
        const newPath = `${inlineInput.parentPath}/${value}`
        if (inlineInput.type === 'newFolder') {
          await workspaceFsService.createDir(newPath)
        } else {
          await workspaceFsService.writeFile(newPath, '')
        }
        onRefreshParent?.(inlineInput.parentPath)
      }
    } catch (err) {
      console.error('[FileTree] 操作失败:', err)
      alert(t('common.error', '错误') + ': ' + (err instanceof Error ? err.message : String(err)))
    }
    onSetInlineInput(null)
  }, [inlineInput, rootPath, t, onSetInlineInput, onRefreshParent])

  // 刷新子目录
  const refreshChildren = useCallback(async () => {
    if (loaded && entry.isDirectory) {
      try {
        const entries = await workspaceFsService.readDir(entry.path)
        setChildren(entries)
      } catch (err) {
        console.error('[FileTree] 刷新目录失败:', err)
      }
    }
  }, [entry, loaded])

  // 监听子项的刷新请求
  useEffect(() => {
    if (onRefreshParent) {
      // 当子项操作完成后，刷新当前节点的子列表
      const handleRefresh = () => refreshChildren()
      // 通过闭包捕获，在子项操作后调用
      return () => {}
    }
  }, [onRefreshParent, refreshChildren])

  const indent = depth * 12

  // 检查当前节点是否显示内联输入
  const showInlineInput = inlineInput && inlineInput.parentPath === entry.path && entry.isDirectory

  return (
    <div>
      {/* 节点本身 */}
      <button
        onClick={handleToggle}
        onContextMenu={handleContextMenu}
        className={`w-full flex items-center gap-1.5 py-[3px] pr-2 text-left text-[12px] leading-tight transition-colors group ${
          isSelected
            ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300'
            : 'text-gray-600 dark:text-gray-400 hover:bg-surface-100 dark:hover:bg-surface-800/60'
        } ${isChanged ? 'relative' : ''}`}
        style={{ paddingLeft: `${indent + 8}px` }}
        title={entry.path}
      >
        {/* 变化高亮点 */}
        {isChanged && (
          <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-amber-400" />
        )}

        {/* 展开/折叠箭头 */}
        {entry.isDirectory ? (
          loading ? (
            <RefreshCw size={10} className="w-3 h-3 flex-shrink-0 text-gray-400 animate-spin" />
          ) : expanded ? (
            <ChevronDown size={10} className="w-3 h-3 flex-shrink-0 text-gray-400" />
          ) : (
            <ChevronRight size={10} className="w-3 h-3 flex-shrink-0 text-gray-400" />
          )
        ) : (
          <span className="w-3 h-3 flex-shrink-0" /> // 占位
        )}

        {/* 文件/目录图标 */}
        {entry.isDirectory ? (
          expanded ? (
            <FolderOpen size={14} className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
          ) : (
            <Folder size={14} className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
          )
        ) : (
          getFileIcon(entry)
        )}

        {/* 文件名 */}
        <span className="truncate">{entry.name}</span>

        {/* 文件大小（仅文件） */}
        {!entry.isDirectory && entry.size > 0 && (
          <span className="ml-auto text-[10px] text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {workspaceFsService.formatSize(entry.size)}
          </span>
        )}
      </button>

      {/* 内联输入框（新建文件/文件夹） */}
      {showInlineInput && inlineInput && inlineInput.type !== 'rename' && (
        <InlineInput
          type={inlineInput.type}
          defaultValue=""
          onSubmit={handleInlineSubmit}
          onCancel={() => onSetInlineInput(null)}
          indent={indent + 12}
        />
      )}

      {/* 子节点（懒加载） */}
      {entry.isDirectory && expanded && (
        <div>
          {children.map((child) => {
            // 重命名内联输入
            const isRenaming = inlineInput?.type === 'rename' && inlineInput?.originalPath === child.path
            if (isRenaming && inlineInput) {
              return (
                <InlineInput
                  key={child.path}
                  type="rename"
                  defaultValue={child.name}
                  onSubmit={handleInlineSubmit}
                  onCancel={() => onSetInlineInput(null)}
                  indent={indent + 12}
                />
              )
            }

            return (
              <TreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                rootPath={rootPath}
                onFileSelect={onFileSelect}
                selectedFile={selectedFile}
                changedFiles={changedFiles}
                inlineInput={inlineInput}
                onSetInlineInput={onSetInlineInput}
                contextMenu={contextMenu}
                onSetContextMenu={onSetContextMenu}
                clipboard={clipboard}
                onSetClipboard={onSetClipboard}
                onRefreshParent={refreshChildren}
                onContextMenuAction={onContextMenuAction}
                onInlineSubmit={onInlineSubmit}
                expandedDirs={expandedDirs}
                onSetExpandedDirs={onSetExpandedDirs}
                onSearchInFolder={onSearchInFolder}
              />
            )
          })}
        </div>
      )}

      {/* 空目录提示 */}
      {entry.isDirectory && expanded && loaded && children.length === 0 && !showInlineInput && (
        <div
          className="text-[10px] text-gray-300 dark:text-gray-600 italic py-1"
          style={{ paddingLeft: `${indent + 28}px` }}
        >
          {t('workspace.emptyDirectory')}
        </div>
      )}
    </div>
  )
}

// ---- 主组件 ----

export function FileTree({ rootPath, onFileSelect, selectedFile, changedFiles, onSearchInFolder }: FileTreeProps) {
  const { t } = useAppTranslation()
  const [inlineInput, setInlineInput] = useState<InlineInputState | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([rootPath]))

  const rootEntry: DirEntry = {
    name: rootPath.split(/[/\\]/).pop() || rootPath,
    path: rootPath,
    isDirectory: true,
    size: 0,
    ext: '',
  }

  // 刷新根目录
  const refreshRoot = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  // 处理右键菜单操作（提升到主组件）
  const handleContextMenuAction = useCallback(async (action: FileTreeAction) => {
    setContextMenu(null)
    
    switch (action.type) {
      case 'newFile':
        setInlineInput({ type: 'newFile', parentPath: action.parentPath })
        setExpandedDirs((prev) => new Set(prev).add(action.parentPath))
        break
      case 'newFolder':
        setInlineInput({ type: 'newFolder', parentPath: action.parentPath })
        setExpandedDirs((prev) => new Set(prev).add(action.parentPath))
        break
      case 'rename':
        setInlineInput({
          type: 'rename',
          parentPath: action.path.split(/[/\\]/).slice(0, -1).join('/') || rootPath,
          originalName: contextMenu?.entry.name,
          originalPath: action.path,
          isDirectory: action.isDirectory,
        })
        break
      case 'delete': {
        const confirmMsg = action.isDirectory
          ? t('workspace.confirmDeleteFolder', '确定要删除此文件夹及其所有内容吗？')
          : t('workspace.confirmDeleteFile', '确定要删除此文件吗？')
        if (window.confirm(confirmMsg)) {
          try {
            if (action.isDirectory) {
              await workspaceFsService.deleteDir(action.path)
            } else {
              await workspaceFsService.deleteFile(action.path)
            }
            refreshRoot()
          } catch (err) {
            console.error('[FileTree] 删除失败:', err)
            alert(t('common.error', '错误') + ': ' + (err instanceof Error ? err.message : String(err)))
          }
        }
        break
      }
      case 'copy':
        setClipboard({ path: action.path, operation: 'copy' })
        break
      case 'cut':
        setClipboard({ path: action.path, operation: 'cut' })
        break
      case 'paste': {
        if (!clipboard) break
        try {
          const srcName = clipboard.path.split(/[/\\]/).pop() || ''
          const destPath = `${action.targetPath}/${srcName}`
          await workspaceFsService.copyFile(clipboard.path, destPath)
          if (clipboard.operation === 'cut') {
            await workspaceFsService.deleteFile(clipboard.path)
            setClipboard(null)
          }
          refreshRoot()
        } catch (err) {
          console.error('[FileTree] 粘贴失败:', err)
          alert(t('common.error', '错误') + ': ' + (err instanceof Error ? err.message : String(err)))
        }
        break
      }
      case 'searchInFolder':
        onSearchInFolder?.(action.folderPath)
        break
      case 'revealInExplorer':
        try {
          await workspaceFsService.revealInExplorer(action.path)
        } catch (err) {
          console.error('[FileTree] 打开文件资源管理器失败:', err)
        }
        break
    }
  }, [rootPath, clipboard, contextMenu, t, refreshRoot])

  // 处理内联输入提交（提升到主组件）
  const handleInlineSubmit = useCallback(async (value: string) => {
    if (!inlineInput) return

    try {
      if (inlineInput.type === 'rename' && inlineInput.originalPath) {
        const parentDir = inlineInput.originalPath.split(/[/\\]/).slice(0, -1).join('/') || rootPath
        const newPath = `${parentDir}/${value}`
        await workspaceFsService.rename(inlineInput.originalPath, newPath)
        refreshRoot()
      } else {
        const newPath = `${inlineInput.parentPath}/${value}`
        if (inlineInput.type === 'newFolder') {
          await workspaceFsService.createDir(newPath)
        } else {
          await workspaceFsService.writeFile(newPath, '')
        }
        refreshRoot()
      }
    } catch (err) {
      console.error('[FileTree] 操作失败:', err)
      alert(t('common.error', '错误') + ': ' + (err instanceof Error ? err.message : String(err)))
    }
    setInlineInput(null)
  }, [inlineInput, rootPath, t, refreshRoot])

  return (
    <div className="font-mono select-none">
      {/* 文件树 */}
      <TreeNode
        key={refreshKey}
        entry={rootEntry}
        depth={0}
        rootPath={rootPath}
        onFileSelect={onFileSelect}
        selectedFile={selectedFile}
        changedFiles={changedFiles}
        inlineInput={inlineInput}
        onSetInlineInput={setInlineInput}
        contextMenu={contextMenu}
        onSetContextMenu={setContextMenu}
        clipboard={clipboard}
        onSetClipboard={setClipboard}
        onRefreshParent={refreshRoot}
        onContextMenuAction={handleContextMenuAction}
        onInlineSubmit={handleInlineSubmit}
        expandedDirs={expandedDirs}
        onSetExpandedDirs={setExpandedDirs}
        onSearchInFolder={onSearchInFolder}
      />

      {/* 右键菜单 */}
      {contextMenu && (
        <FileTreeContextMenu
          entry={contextMenu.entry}
          rootPath={rootPath}
          position={contextMenu.position}
          clipboard={clipboard}
          onClose={() => setContextMenu(null)}
          onAction={handleContextMenuAction}
        />
      )}
    </div>
  )
}
