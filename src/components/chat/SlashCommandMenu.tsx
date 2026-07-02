/**
 * Slash 命令菜单组件
 *
 * 在 MessageInput 中输入 / 时弹出的命令选择面板，
 * 支持搜索、分类展示、键盘导航。
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Command, Hash, Users, Brain, Settings, X } from 'lucide-react'
import { searchSlashCommands, getCategoryLabel } from '../../services/slash-command-service'
import type { SlashCommand } from '../../services/slash-command-service'

interface SlashCommandMenuProps {
  /** 当前输入文本（用于搜索过滤） */
  query: string
  /** 工作区路径（用于加载自定义命令） */
  workspacePath?: string
  /** 是否处于工作区模式 */
  isWorkspaceMode?: boolean
  /** 选择命令回调 */
  onSelect: (command: SlashCommand) => void
  /** 关闭菜单回调 */
  onClose: () => void
}

/** 分类图标映射 */
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  workspace: <Settings size={14} className="text-teal-500" />,
  agent: <Users size={14} className="text-blue-500" />,
  context: <Brain size={14} className="text-violet-500" />,
  custom: <Hash size={14} className="text-amber-500" />,
}

export function SlashCommandMenu({
  query,
  workspacePath,
  isWorkspaceMode,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const [commands, setCommands] = useState<SlashCommand[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  // 加载并搜索命令
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const results = await searchSlashCommands(query, workspacePath, isWorkspaceMode)
        if (!cancelled) {
          setCommands(results)
          setSelectedIndex(0)
        }
      } catch (err) {
        console.warn('[SlashCommandMenu] 搜索命令失败:', err)
        if (!cancelled) setCommands([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [query, workspacePath, isWorkspaceMode])

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (commands.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % commands.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + commands.length) % commands.length)
          break
        case 'Enter':
          e.preventDefault()
          if (commands[selectedIndex]) {
            onSelect(commands[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [commands, selectedIndex, onSelect, onClose],
  )

  // 选中项滚动到可见区域
  useEffect(() => {
    const el = itemRefs.current.get(selectedIndex)
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  // 点击外部关闭
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // 按分类分组
  const grouped = commands.reduce<Record<string, SlashCommand[]>>((acc, cmd) => {
    const cat = cmd.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(cmd)
    return acc
  }, {})

  // 分类排序
  const categoryOrder = ['workspace', 'agent', 'context', 'custom']
  const sortedCategories = Object.keys(grouped).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b),
  )

  // 计算全局索引到命令的映射
  let globalIdx = 0
  const indexMap: Array<{ category: string; command: SlashCommand }> = []
  for (const cat of sortedCategories) {
    for (const cmd of grouped[cat]) {
      indexMap.push({ category: cat, command: cmd })
      globalIdx++
    }
  }

  if (loading) {
    return (
      <div
        ref={menuRef}
        className="absolute bottom-full left-0 mb-2 w-80 max-h-64 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-lg overflow-hidden z-50 flex items-center justify-center"
      >
        <div className="py-8 text-xs text-gray-400 dark:text-gray-500">加载命令中...</div>
      </div>
    )
  }

  if (commands.length === 0) {
    return (
      <div
        ref={menuRef}
        className="absolute bottom-full left-0 mb-2 w-80 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-lg overflow-hidden z-50"
      >
        <div className="py-8 text-xs text-gray-400 dark:text-gray-500 text-center">
          未找到匹配的命令
        </div>
      </div>
    )
  }

  return (
    <div
      ref={menuRef}
      onKeyDown={handleKeyDown}
      className="absolute bottom-full left-0 mb-2 w-80 max-h-80 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-lg overflow-hidden z-50 flex flex-col"
      tabIndex={0}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-100 dark:border-surface-700">
        <div className="flex items-center gap-1.5">
          <Command size={14} className="text-teal-500" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Slash 命令</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* 命令列表 */}
      <div className="flex-1 overflow-y-auto py-1">
        {sortedCategories.map((cat) => (
          <div key={cat}>
            {/* 分类标题 */}
            <div className="px-3 py-1.5 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              {CATEGORY_ICONS[cat] || <Hash size={12} />}
              {getCategoryLabel(cat as SlashCommand['category'])}
            </div>
            {/* 分类下的命令 */}
            {grouped[cat].map((cmd) => {
              const idx = indexMap.findIndex((m) => m.command === cmd)
              const isSelected = idx === selectedIndex
              return (
                <button
                  key={cmd.name}
                  ref={(el) => {
                    if (el) itemRefs.current.set(idx, el)
                  }}
                  onClick={() => onSelect(cmd)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
                    isSelected
                      ? 'bg-teal-50 dark:bg-teal-900/20'
                      : 'hover:bg-surface-50 dark:hover:bg-surface-700/50'
                  }`}
                >
                  <span className="text-base flex-shrink-0">{cmd.icon || '⚡'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                      /{cmd.name}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                      {cmd.description}
                    </p>
                  </div>
                  {cmd.shortcut && (
                    <kbd className="text-[9px] px-1 py-0.5 bg-surface-100 dark:bg-surface-700 text-gray-500 dark:text-gray-400 rounded font-mono flex-shrink-0">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* 底部提示 */}
      <div className="px-3 py-1.5 border-t border-surface-100 dark:border-surface-700 text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-2">
        <kbd className="px-1 py-0.5 bg-surface-100 dark:bg-surface-700 rounded font-mono">↑↓</kbd>
        <span>导航</span>
        <kbd className="px-1 py-0.5 bg-surface-100 dark:bg-surface-700 rounded font-mono ml-1">
          Enter
        </kbd>
        <span>选择</span>
        <kbd className="px-1 py-0.5 bg-surface-100 dark:bg-surface-700 rounded font-mono ml-1">
          Esc
        </kbd>
        <span>关闭</span>
      </div>
    </div>
  )
}
