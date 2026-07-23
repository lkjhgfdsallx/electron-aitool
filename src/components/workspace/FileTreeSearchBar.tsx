/**
 * 文件树搜索栏组件
 * 
 * 功能：
 * - 搜索文件名（实时过滤）
 * - 搜索文件内容（调用 searchFiles API）
 * - 搜索模式切换
 * - 快捷键支持（Ctrl+F 聚焦搜索框）
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { Search, X, FileText, Filter } from 'lucide-react'
import { workspaceFsService, type WorkspaceSearchMatch } from '../../services/workspace-fs-service'
import { useAppTranslation } from '../../i18n/hooks'

export type SearchMode = 'filename' | 'content'

export interface SearchResult {
  type: 'file' | 'match'
  path: string
  name: string
  line?: number
  column?: number
  lineText?: string
}

interface FileTreeSearchBarProps {
  /** 工作区根目录绝对路径 */
  rootPath: string
  /** 搜索查询变化时回调（用于过滤文件树） */
  onSearchChange?: (query: string, mode: SearchMode, results: SearchResult[] | null) => void
  /** 搜索结果被点击时回调 */
  onResultSelect?: (path: string, line?: number) => void
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

export function FileTreeSearchBar({ rootPath, onSearchChange, onResultSelect }: FileTreeSearchBarProps) {
  const { t } = useAppTranslation()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('filename')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(query, 300)

  // 执行搜索
  const performSearch = useCallback(async (searchQuery: string, searchMode: SearchMode) => {
    if (!searchQuery.trim()) {
      setResults(null)
      onSearchChange?.('', searchMode, null)
      return
    }

    setIsSearching(true)
    try {
      if (searchMode === 'filename') {
        // 文件名搜索：使用 findFiles
        const result = await workspaceFsService.findFiles(rootPath, {
          glob: `*${searchQuery}*`,
          maxResults: 50,
        })
        const fileResults: SearchResult[] = (result.files || []).map((filePath) => ({
          type: 'file' as const,
          path: `${rootPath}/${filePath}`,
          name: filePath.split('/').pop() || filePath,
        }))
        setResults(fileResults)
        onSearchChange?.(searchQuery, searchMode, fileResults)
      } else {
        // 内容搜索：使用 searchFiles
        const result = await workspaceFsService.searchFiles(rootPath, {
          query: searchQuery,
          maxResults: 50,
          contextLines: 0,
        })
        const matchResults: SearchResult[] = (result.matches || []).map((match: WorkspaceSearchMatch) => ({
          type: 'match' as const,
          path: `${rootPath}/${match.file_path}`,
          name: match.file_path.split('/').pop() || match.file_path,
          line: match.line,
          column: match.column,
          lineText: match.line_text,
        }))
        setResults(matchResults)
        onSearchChange?.(searchQuery, searchMode, matchResults)
      }
    } catch (err) {
      console.error('[FileTreeSearchBar] 搜索失败:', err)
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [rootPath, onSearchChange])

  // 防抖查询变化时执行搜索
  useEffect(() => {
    performSearch(debouncedQuery, mode)
  }, [debouncedQuery, mode, performSearch])

  // Ctrl+F 聚焦搜索框
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setQuery('')
        setShowResults(false)
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 点击外部关闭结果面板
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleClear = useCallback(() => {
    setQuery('')
    setResults(null)
    setShowResults(false)
    onSearchChange?.('', mode, null)
    inputRef.current?.focus()
  }, [mode, onSearchChange])

  const handleModeToggle = useCallback(() => {
    const newMode = mode === 'filename' ? 'content' : 'filename'
    setMode(newMode)
    setResults(null)
    if (query.trim()) {
      performSearch(query, newMode)
    }
  }, [mode, query, performSearch])

  const handleResultClick = useCallback((result: SearchResult) => {
    onResultSelect?.(result.path, result.line)
    setShowResults(false)
  }, [onResultSelect])

  const highlightMatch = useCallback((text: string, searchQuery: string) => {
    if (!searchQuery.trim()) return text
    const idx = text.toLowerCase().indexOf(searchQuery.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <span className="bg-yellow-200 dark:bg-yellow-800/60 text-yellow-900 dark:text-yellow-100 rounded px-0.5">
          {text.slice(idx, idx + searchQuery.length)}
        </span>
        {text.slice(idx + searchQuery.length)}
      </>
    )
  }, [])

  return (
    <div ref={containerRef} className="relative">
      {/* 搜索输入栏 */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-surface-200 dark:border-surface-700">
        <Search size={14} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowResults(true)
          }}
          onFocus={() => setShowResults(true)}
          placeholder={mode === 'filename' ? t('workspace.searchFilename', '搜索文件名...') : t('workspace.searchContent', '搜索内容...')}
          className="flex-1 bg-transparent text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
        />
        {query && (
          <button
            onClick={handleClear}
            className="p-0.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={12} />
          </button>
        )}
        <button
          onClick={handleModeToggle}
          className={`p-0.5 rounded transition-colors ${
            mode === 'content'
              ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400'
              : 'hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
          title={mode === 'filename' ? t('workspace.searchContent', '搜索内容') : t('workspace.searchFilename', '搜索文件名')}
        >
          {mode === 'content' ? <FileText size={12} /> : <Filter size={12} />}
        </button>
      </div>

      {/* 搜索结果面板 */}
      {showResults && query.trim() && (
        <div className="absolute left-0 right-0 top-full z-50 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 shadow-lg rounded-b-lg max-h-64 overflow-y-auto">
          {isSearching ? (
            <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
              {t('common.loading', '加载中...')}
            </div>
          ) : results && results.length > 0 ? (
            <div>
              <div className="px-3 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 border-b border-surface-100 dark:border-surface-700">
                {t('workspace.searchResults', '搜索结果')} ({results.length})
              </div>
              {results.map((result, index) => (
                <button
                  key={`${result.path}-${result.line || ''}-${index}`}
                  onClick={() => handleResultClick(result)}
                  className="w-full text-left px-3 py-1.5 hover:bg-surface-100 dark:hover:bg-surface-700/50 transition-colors border-b border-surface-50 dark:border-surface-700/50 last:border-0"
                >
                  <div className="flex items-center gap-1.5">
                    <FileText size={10} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                      {highlightMatch(result.name, query)}
                    </span>
                    {result.line && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 ml-auto">
                        :{result.line}
                      </span>
                    )}
                  </div>
                  {result.lineText && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5 pl-5">
                      {highlightMatch(result.lineText.trim(), query)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
              {t('workspace.noResults', '未找到结果')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
