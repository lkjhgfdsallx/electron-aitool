/**
 * 文件树组件 - 递归展示工作区目录结构
 *
 * 功能：
 * - 读取真实目录结构（通过 IPC readDir）
 * - 懒加载：展开目录时才读取子目录
 * - 点击文件触发 onFileSelect 回调
 * - 支持文件变化高亮（B8：changedFiles prop）
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  FolderOpen, Folder, FileText, File, ChevronRight, ChevronDown,
  FileCode, FileJson, FileImage, FileType, RefreshCw,
} from 'lucide-react'
import { workspaceFsService, type DirEntry } from '../../services/workspace-fs-service'
import { useAppTranslation } from '../../i18n/hooks'

// ---- Props ----

interface FileTreeProps {
  /** 工作区根目录绝对路径 */
  rootPath: string
  /** 文件被点击时回调 */
  onFileSelect: (filePath: string) => void
  /** 当前选中的文件路径 */
  selectedFile?: string
  /** 文件变化集合（B8：高亮标记） */
  changedFiles?: Set<string>
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

// ---- 单个树节点 ----

interface TreeNodeProps {
  entry: DirEntry
  depth: number
  rootPath: string
  onFileSelect: (filePath: string) => void
  selectedFile?: string
  changedFiles?: Set<string>
}

function TreeNode({ entry, depth, rootPath, onFileSelect, selectedFile, changedFiles }: TreeNodeProps) {
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

  const indent = depth * 12

  return (
    <div>
      {/* 节点本身 */}
      <button
        onClick={handleToggle}
        className={`w-full flex items-center gap-1.5 py-[3px] pr-2 text-left text-[12px] leading-tight hover:bg-surface-100 dark:hover:bg-surface-800/60 transition-colors group ${
          isSelected
            ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300'
            : 'text-gray-600 dark:text-gray-400'
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

      {/* 子节点（懒加载） */}
      {entry.isDirectory && expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              rootPath={rootPath}
              onFileSelect={onFileSelect}
              selectedFile={selectedFile}
              changedFiles={changedFiles}
            />
          ))}
        </div>
      )}

      {/* 空目录提示 */}
      {entry.isDirectory && expanded && loaded && children.length === 0 && (
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

export function FileTree({ rootPath, onFileSelect, selectedFile, changedFiles }: FileTreeProps) {
  const rootEntry: DirEntry = {
    name: rootPath.split(/[/\\]/).pop() || rootPath,
    path: rootPath,
    isDirectory: true,
    size: 0,
    ext: '',
  }

  return (
    <div className="font-mono select-none">
      <TreeNode
        entry={rootEntry}
        depth={0}
        rootPath={rootPath}
        onFileSelect={onFileSelect}
        selectedFile={selectedFile}
        changedFiles={changedFiles}
      />
    </div>
  )
}
