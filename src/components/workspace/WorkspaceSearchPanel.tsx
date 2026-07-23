/**
 * 工作区搜索面板组件
 * 
 * 参考 VSCode 搜索面板设计：
 * - 搜索输入框 + 选项按钮（大小写/全词/正则）
 * - 替换输入框 + 替换按钮
 * - 文件过滤（包含/排除 glob）
 * - 搜索结果列表（按文件分组、可折叠、高亮匹配）
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Search, Replace, X, ChevronDown, ChevronRight,
  CaseSensitive, WholeWord, Regex, FileText, Filter,
  Loader2,
} from 'lucide-react'
import { workspaceFsService, type WorkspaceSearchMatch } from '../../services/workspace-fs-service'
import { useAppTranslation } from '../../i18n/hooks'

// ---- 类型 ----

interface WorkspaceSearchPanelProps {
  /** 工作区根目录绝对路径 */
  rootPath: string
  /** 指定搜索的文件夹路径（可选） */
  folderPath?: string
  /** 文件被选中时回调 */
  onFileSelect?: (filePath: string, line?: number) => void
  /** 清除文件夹路径回调 */
  onClearFolderPath?: () => void
}

// 防抖 Hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

// Glob 转正则
function globToRegex(glob: string): RegExp {
  const pattern = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<DOUBLESTAR>>')
    .replace(/\*/g, '[^/\\\\]*')
    .replace(/<<DOUBLESTAR>>/g, '.*')
    .replace(/\?/g, '[^/\\\\]')
  return new RegExp(`^${pattern}$`)
}

// 转义正则特殊字符
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---- 组件 ----

export function WorkspaceSearchPanel({ rootPath, folderPath, onFileSelect, onClearFolderPath }: WorkspaceSearchPanelProps) {
  const { t } = useAppTranslation()

  // 搜索输入状态
  const [query, setQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [isRegex, setIsRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [includeGlob, setIncludeGlob] = useState('')
  const [excludeGlob, setExcludeGlob] = useState('')

  // 搜索结果状态
  const [results, setResults] = useState<WorkspaceSearchMatch[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [searchCount, setSearchCount] = useState(0)
  const [fileCount, setFileCount] = useState(0)

  // 显示控制
  const [showReplace, setShowReplace] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)

  // 防抖查询
  const debouncedQuery = useDebounce(query, 300)

  // 执行搜索
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setSearchCount(0)
      setFileCount(0)
      return
    }

    setIsSearching(true)
    try {
      // 如果指定了 folderPath，则在指定文件夹中搜索，否则在根目录搜索
      const searchPath = folderPath || rootPath
      const result = await workspaceFsService.searchFiles(searchPath, {
        query: searchQuery,
        glob: includeGlob || undefined,
        isRegex,
        caseSensitive,
        contextLines: 1,
        maxResults: 500,
      })

      let matches = result.matches || []

      // 应用排除过滤
      if (excludeGlob) {
        const excludePattern = globToRegex(excludeGlob)
        matches = matches.filter((m) => !excludePattern.test(m.file_path))
      }

      // 应用全词匹配过滤
      if (wholeWord && !isRegex) {
        const wordPattern = new RegExp(`\\b${escapeRegex(searchQuery)}\\b`, caseSensitive ? 'g' : 'gi')
        matches = matches.filter((m) => wordPattern.test(m.line_text))
      }

      setResults(matches)
      setSearchCount(matches.length)

      // 计算唯一文件数
      const uniqueFiles = new Set(matches.map((m) => m.file_path))
      setFileCount(uniqueFiles.size)

      // 自动展开所有文件
      setExpandedFiles(uniqueFiles)
    } catch (err) {
      console.error('[WorkspaceSearchPanel] 搜索失败:', err)
      setResults([])
      setSearchCount(0)
      setFileCount(0)
    } finally {
      setIsSearching(false)
    }
  }, [rootPath, folderPath, includeGlob, excludeGlob, isRegex, caseSensitive, wholeWord])

  // 防抖查询变化时执行搜索
  useEffect(() => {
    performSearch(debouncedQuery)
  }, [debouncedQuery, performSearch])

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+F 聚焦搜索框
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 清除搜索
  const handleClear = useCallback(() => {
    setQuery('')
    setResults([])
    setSearchCount(0)
    setFileCount(0)
    searchInputRef.current?.focus()
  }, [])

  // 切换文件展开状态
  const toggleFileExpanded = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) {
        next.delete(filePath)
      } else {
        next.add(filePath)
      }
      return next
    })
  }, [])

  // 展开全部
  const expandAll = useCallback(() => {
    const allFiles = new Set(results.map((m) => m.file_path))
    setExpandedFiles(allFiles)
  }, [results])

  // 折叠全部
  const collapseAll = useCallback(() => {
    setExpandedFiles(new Set())
  }, [])

  // 点击匹配项
  const handleMatchClick = useCallback((match: WorkspaceSearchMatch) => {
    const fullPath = `${rootPath}/${match.file_path}`
    onFileSelect?.(fullPath, match.line)
  }, [rootPath, onFileSelect])

  // 按文件分组搜索结果
  const groupedResults = useMemo(() => {
    const groups: Map<string, WorkspaceSearchMatch[]> = new Map()
    for (const match of results) {
      const existing = groups.get(match.file_path) || []
      existing.push(match)
      groups.set(match.file_path, existing)
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [results])

  // 高亮匹配文本
  const highlightMatch = useCallback((text: string, searchQuery: string) => {
    if (!searchQuery.trim()) return text

    try {
      let pattern: string
      if (isRegex) {
        pattern = searchQuery
      } else {
        pattern = escapeRegex(searchQuery)
      }

      if (wholeWord && !isRegex) {
        pattern = `\\b${pattern}\\b`
      }

      const flags = caseSensitive ? 'g' : 'gi'
      const regex = new RegExp(pattern, flags)

      const parts: React.ReactNode[] = []
      let lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push(text.slice(lastIndex, match.index))
        }
        parts.push(
          <span
            key={`${lastIndex}-${match.index}`}
            className="bg-yellow-200 dark:bg-yellow-800/60 text-yellow-900 dark:text-yellow-100 rounded px-0.5"
          >
            {match[0]}
          </span>
        )
        lastIndex = match.index + match[0].length
      }

      if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex))
      }

      return <>{parts}</>
    } catch {
      return text
    }
  }, [isRegex, caseSensitive, wholeWord])

  // 获取文件名
  const getFileName = useCallback((filePath: string) => {
    return filePath.split('/').pop() || filePath
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* 搜索输入区域 */}
      <div className="flex-shrink-0 border-b border-surface-200 dark:border-surface-700">
        {/* 文件夹路径指示器 */}
        {folderPath && (
          <div className="flex items-center gap-1 px-2 py-1 bg-teal-50 dark:bg-teal-900/20 border-b border-teal-200 dark:border-teal-800/50">
            <span className="text-[10px] text-teal-700 dark:text-teal-300 flex-shrink-0">
              {t('workspace.searchingIn', '搜索范围:')}
            </span>
            <span className="text-[10px] text-teal-600 dark:text-teal-400 truncate flex-1 font-mono">
              {folderPath.replace(rootPath, '').replace(/^[\\/]+/, '') || folderPath}
            </span>
            <button
              onClick={() => {
                onClearFolderPath?.()
              }}
              className="p-0.5 rounded hover:bg-teal-200 dark:hover:bg-teal-800/50 text-teal-600 dark:text-teal-400 transition-colors"
              title={t('workspace.clearSearchScope', '清除搜索范围')}
            >
              <X size={10} />
            </button>
          </div>
        )}
        {/* 搜索框行 */}
        <div className="flex items-center gap-1 px-2 py-1.5">
          <Search size={14} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={folderPath
              ? t('workspace.searchInFolderPlaceholder', '在文件夹中搜索...')
              : t('workspace.searchPlaceholder', '搜索')
            }
            className="flex-1 bg-transparent text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
          />
          {query && (
            <button
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title={t('workspace.clearResults', '清除结果')}
            >
              <X size={12} />
            </button>
          )}
          <button
            onClick={() => setShowReplace(!showReplace)}
            className={`p-0.5 rounded transition-colors ${
              showReplace
                ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400'
                : 'hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
            title={t('workspace.showReplace', '显示替换')}
          >
            <Replace size={12} />
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-0.5 rounded transition-colors ${
              showFilters
                ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400'
                : 'hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
            title={t('workspace.showFilters', '显示过滤选项')}
          >
            <Filter size={12} />
          </button>
        </div>

        {/* 替换框行 */}
        {showReplace && (
          <div className="flex items-center gap-1 px-2 py-1.5 border-t border-surface-100 dark:border-surface-700/50">
            <Replace size={14} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
            <input
              type="text"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              placeholder={t('workspace.replacePlaceholder', '替换')}
              className="flex-1 bg-transparent text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
            />
          </div>
        )}

        {/* 搜索选项按钮行 */}
        <div className="flex items-center gap-0.5 px-2 py-1">
          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={`p-1 rounded text-[10px] transition-colors ${
              caseSensitive
                ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400'
                : 'text-gray-400 hover:bg-surface-200 dark:hover:bg-surface-700 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
            title={t('workspace.matchCase', '匹配大小写')}
          >
            <CaseSensitive size={12} />
          </button>
          <button
            onClick={() => setWholeWord(!wholeWord)}
            className={`p-1 rounded text-[10px] transition-colors ${
              wholeWord
                ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400'
                : 'text-gray-400 hover:bg-surface-200 dark:hover:bg-surface-700 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
            title={t('workspace.matchWholeWord', '全词匹配')}
          >
            <WholeWord size={12} />
          </button>
          <button
            onClick={() => setIsRegex(!isRegex)}
            className={`p-1 rounded text-[10px] transition-colors ${
              isRegex
                ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400'
                : 'text-gray-400 hover:bg-surface-200 dark:hover:bg-surface-700 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
            title={t('workspace.useRegex', '使用正则表达式')}
          >
            <Regex size={12} />
          </button>
        </div>

        {/* 文件过滤行 */}
        {showFilters && (
          <div className="px-2 py-1.5 space-y-1.5 border-t border-surface-100 dark:border-surface-700/50">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 w-16">
                {t('workspace.filesToInclude', '包含的文件')}
              </span>
              <input
                type="text"
                value={includeGlob}
                onChange={(e) => setIncludeGlob(e.target.value)}
                placeholder="*.ts, *.tsx"
                className="flex-1 bg-surface-50 dark:bg-surface-800 text-[10px] text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 outline-none rounded px-1.5 py-0.5 border border-surface-200 dark:border-surface-700"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 w-16">
                {t('workspace.filesToExclude', '排除的文件')}
              </span>
              <input
                type="text"
                value={excludeGlob}
                onChange={(e) => setExcludeGlob(e.target.value)}
                placeholder="**/node_modules/**"
                className="flex-1 bg-surface-50 dark:bg-surface-800 text-[10px] text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 outline-none rounded px-1.5 py-0.5 border border-surface-200 dark:border-surface-700"
              />
            </div>
          </div>
        )}
      </div>

      {/* 搜索结果区域 */}
      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="text-gray-400 dark:text-gray-500 animate-spin" />
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
              {t('workspace.searching', '搜索中...')}
            </span>
          </div>
        ) : query.trim() && results.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {t('workspace.noSearchResults', '未找到匹配结果')}
            </span>
          </div>
        ) : results.length > 0 ? (
          <div>
            {/* 结果统计和操作 */}
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-surface-100 dark:border-surface-700/50">
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {searchCount} {t('workspace.matchesInFiles', '个匹配，共')} {fileCount} {t('workspace.files', '文件')}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={expandAll}
                  className="p-0.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="展开全部"
                >
                  <ChevronDown size={10} />
                </button>
                <button
                  onClick={collapseAll}
                  className="p-0.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="折叠全部"
                >
                  <ChevronRight size={10} />
                </button>
              </div>
            </div>

            {/* 按文件分组的结果列表 */}
            {groupedResults.map(([filePath, matches]) => {
              const isExpanded = expandedFiles.has(filePath)
              return (
                <div key={filePath} className="border-b border-surface-50 dark:border-surface-700/30">
                  {/* 文件头 */}
                  <button
                    onClick={() => toggleFileExpanded(filePath)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-surface-100 dark:hover:bg-surface-800/60 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown size={10} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    ) : (
                      <ChevronRight size={10} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    )}
                    <FileText size={10} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex-1 text-left">
                      {getFileName(filePath)}
                    </span>
                    <span className="text-[9px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                      {matches.length}
                    </span>
                  </button>

                  {/* 匹配行 */}
                  {isExpanded && (
                    <div>
                      {matches.map((match, index) => (
                        <button
                          key={`${match.line}-${match.column}-${index}`}
                          onClick={() => handleMatchClick(match)}
                          className="w-full text-left px-2 py-0.5 hover:bg-surface-100 dark:hover:bg-surface-800/60 transition-colors group"
                          style={{ paddingLeft: '28px' }}
                        >
                          <div className="flex items-start gap-1.5">
                            <span className="text-[9px] text-gray-400 dark:text-gray-500 flex-shrink-0 w-8 text-right select-none">
                              {match.line}
                            </span>
                            <span className="text-[11px] text-gray-600 dark:text-gray-400 truncate group-hover:text-gray-800 dark:group-hover:text-gray-200">
                              {highlightMatch(match.line_text.trim(), query)}
                            </span>
                          </div>
                          {/* 上下文行 */}
                          {match.context && match.context.length > 0 && (
                            <div className="mt-0.5 pl-10">
                              {match.context.map((ctx) => (
                                <div
                                  key={ctx.line}
                                  className="text-[9px] text-gray-400 dark:text-gray-600 truncate"
                                >
                                  {ctx.text.trim()}
                                </div>
                              ))}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-600">
            <Search size={32} className="mb-3 opacity-30" />
            <span className="text-xs">{t('workspace.searchPlaceholder', '输入关键词开始搜索')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
