import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  Search,
  FileText,
  Star,
  Pin,
  Variable,
  X,
  Settings,
  Plus,
} from 'lucide-react'
import type { Prompt } from '../../types'

interface PromptSearchPanelProps {
  prompts: Prompt[]
  onSelect: (prompt: Prompt) => void
  onClose: () => void
  onOpenPromptManager?: () => void
}

export function PromptSearchPanel({ prompts, onSelect, onClose, onOpenPromptManager }: PromptSearchPanelProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 过滤和排序
  const filtered = useMemo(() => {
    let list = [...prompts]

    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }

    // 排序：置顶 > 收藏 > 更新时间
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
      return b.updatedAt - a.updatedAt
    })

    return list
  }, [prompts, query])

  // 重置选中索引
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filtered[selectedIndex]) {
            onSelect(filtered[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [filtered, selectedIndex, onSelect, onClose],
  )

  // 滚动到选中项
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIndex] as HTMLElement
    if (item) {
      item.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  /** 跳转到设置中的提示词管理 */
  const handleGoToManager = useCallback(() => {
    onClose()
    onOpenPromptManager?.()
  }, [onClose, onOpenPromptManager])

  /** 判断是否是完全没有提示词（而非搜索无结果） */
  const isEmpty = prompts.length === 0
  const isSearchEmpty = !isEmpty && filtered.length === 0

  return (
    <div className="bg-white dark:bg-surface-800 border border-surface-200/80 dark:border-surface-700/60 rounded-xl shadow-2xl backdrop-blur-sm w-[360px] max-h-[320px] flex flex-col overflow-hidden">
      {/* 搜索框 */}
      <div className="px-3 py-2 border-b border-surface-200/60 dark:border-surface-700/40">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索提示词..."
            className="w-full pl-8 pr-8 py-1.5 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400"
          />
          <button
            onClick={onClose}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-surface-700 dark:hover:text-surface-300"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 列表 */}
      <div ref={listRef} className="flex-1 overflow-y-auto py-1">
        {isEmpty ? (
          /* 完全没有提示词时的空状态 */
          <div className="px-4 py-6 text-center">
            <FileText size={28} className="mx-auto mb-2 text-surface-300 dark:text-surface-600" />
            <p className="text-xs text-muted mb-3">暂无提示词，创建一个吧</p>
            <button
              onClick={handleGoToManager}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-950/30 hover:bg-accent-100 dark:hover:bg-accent-950/50 rounded-lg transition-colors"
            >
              <Plus size={13} />
              去创建提示词
            </button>
          </div>
        ) : isSearchEmpty ? (
          /* 搜索无结果 */
          <div className="px-4 py-6 text-center text-muted">
            <FileText size={24} className="mx-auto mb-1.5 opacity-30" />
            <p className="text-xs">没有匹配的提示词</p>
          </div>
        ) : (
          filtered.map((prompt, idx) => (
            <button
              key={prompt.id}
              onClick={() => onSelect(prompt)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                idx === selectedIndex
                  ? 'bg-accent-50 dark:bg-accent-950/30'
                  : 'hover:bg-surface-50 dark:hover:bg-surface-900/30'
              }`}
            >
              <FileText size={14} className="text-muted flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {prompt.pinned && <Pin size={10} className="text-accent-500" />}
                  <span className="text-xs font-medium text-surface-800 dark:text-surface-200 truncate">
                    {prompt.name}
                  </span>
                  {prompt.favorite && (
                    <Star size={10} className="text-amber-400 fill-amber-400" />
                  )}
                  {prompt.variables.length > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted">
                      <Variable size={10} />
                      {prompt.variables.length}
                    </span>
                  )}
                </div>
                {prompt.description && (
                  <p className="text-[10px] text-muted mt-0.5 truncate">
                    {prompt.description}
                  </p>
                )}
                {prompt.tags.length > 0 && (
                  <div className="flex gap-1 mt-0.5">
                    {prompt.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-1 py-0 text-[9px] bg-surface-100 dark:bg-surface-800 text-muted rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* 底部提示 */}
      <div className="px-3 py-1.5 border-t border-surface-200/60 dark:border-surface-700/40 text-[10px] text-muted flex items-center justify-between">
        <span>↑↓ 导航 · Enter 选择 · Esc 关闭</span>
        <div className="flex items-center gap-2">
          {!isEmpty && <span>{filtered.length} 个提示词</span>}
          <button
            onClick={handleGoToManager}
            className="flex items-center gap-0.5 text-accent-500 hover:text-accent-600 dark:text-accent-400 dark:hover:text-accent-300 transition-colors"
            title="管理提示词"
          >
            <Settings size={11} />
            管理
          </button>
        </div>
      </div>
    </div>
  )
}
