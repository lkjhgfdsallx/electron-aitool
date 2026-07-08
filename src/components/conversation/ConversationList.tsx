import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react'
import {
  Search,
  Pin,
  Trash2,
  MessageSquare,
  MoreHorizontal,
  PenLine,
  FileText,
  Code,
  FileJson
} from 'lucide-react'
import { useConversationStore } from '../../stores/conversation-store'
import { useAgentStore } from '../../stores/agent-store'
import { exportConversation, type ExportFormat } from '../../services/export-service'
import { formatRelativeTime } from '../../utils/format-time'
import type { Conversation } from '../../types'

/** 对话分组标签 */
function getDateGroup(timestamp: number): string {
  const now = new Date()
  const date = new Date(timestamp)
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((nowDate.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays <= 7) return '本周'
  if (diffDays <= 30) return '本月'
  return '更早'
}

/** 骨架屏组件 */
function SkeletonList() {
  return (
    <div className="animate-fade-in space-y-1 px-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <div className="w-8 h-8 rounded-full skeleton flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 rounded skeleton w-3/4" />
            <div className="h-2.5 rounded skeleton w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ==================== 虚拟滚动相关类型 ====================

/** 虚拟列表行：分组标题 或 对话项 */
type VirtualRow =
  | { type: 'header'; label: string; key: string }
  | { type: 'item'; conv: Conversation; key: string }

const HEADER_HEIGHT = 32  // 分组标题行高 (px)
const ITEM_HEIGHT = 76    // 对话项行高估算 (px)
const BUFFER_COUNT = 8    // 上下各多渲染的条数

// ==================== 对话项组件（memo 优化） ====================

interface ConversationItemProps {
  conv: Conversation
  isActive: boolean
  onSelect: (id: string) => void
  agentAvatar?: string
  onContextMenu: (id: string) => void
  contextMenuId: string | null
  onRename: (id: string, title: string) => void
  onTogglePin: (id: string) => void
  onExport: (conv: Conversation, format: ExportFormat) => void
  onDelete: (id: string) => void
}

const ConversationItem = memo(function ConversationItem({
  conv,
  isActive,
  onSelect,
  agentAvatar,
  onContextMenu,
  contextMenuId,
  onRename,
  onTogglePin,
  onExport,
  onDelete
}: ConversationItemProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const handleRename = useCallback(() => {
    if (editTitle.trim()) {
      onRename(conv.id, editTitle.trim())
    }
    setEditingId(null)
  }, [editTitle, conv.id, onRename])

  // 使用缓存的预览文本，不再调用 getMessages
  const preview = conv.lastMessagePreview || '暂无消息'

  return (
    <div
      onClick={() => onSelect(conv.id)}
      className={`relative group flex items-start gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
        contextMenuId === conv.id ? 'z-50' : ''
      } ${
        isActive
          ? 'bg-accent-50 dark:bg-accent-950/30 shadow-sm'
          : 'hover:bg-surface-100 dark:hover:bg-surface-800/60'
      }`}
    >
      {/* 图标 */}
      <div className={`flex-shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center text-xs ${
        conv.agentId
          ? 'bg-accent-100 dark:bg-accent-900/40 text-accent-600 dark:text-accent-400'
          : isActive
            ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
            : 'bg-surface-200 dark:bg-surface-700 text-gray-500 dark:text-gray-400'
      }`}>
        {conv.agentId ? (
          <span>{agentAvatar || '🤖'}</span>
        ) : (
          <MessageSquare size={14} />
        )}
      </div>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        {editingId === conv.id ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') setEditingId(null)
            }}
            autoFocus
            className="w-full text-sm bg-transparent border-b-2 border-accent-500 outline-none py-0.5"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <span className={`text-sm truncate ${
              isActive
                ? 'text-accent-700 dark:text-accent-300 font-medium'
                : 'text-gray-700 dark:text-gray-300'
            }`}>
              {conv.title}
            </span>
            {conv.agentId && (
              <span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 rounded-full font-medium leading-none">
                Agent
              </span>
            )}
          </div>
        )}

        {/* 最后消息预览 */}
        <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5 leading-relaxed">
          {preview}
        </p>

        {/* 时间 */}
        <span className="text-[10px] text-gray-300 dark:text-gray-600 mt-0.5 block">
          {formatRelativeTime(conv.updatedAt)}
        </span>
      </div>

      {/* 置顶图标 */}
      {conv.isPinned && (
        <Pin size={10} className="flex-shrink-0 mt-1 text-accent-400 fill-accent-400" />
      )}

      {/* 操作按钮 & 上下文菜单 */}
      <div className="relative flex-shrink-0 mt-0.5" data-context-trigger>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onContextMenu(conv.id)
          }}
          className={`${contextMenuId === conv.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} p-1 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 transition-all`}
        >
          <MoreHorizontal size={14} className="text-gray-400" />
        </button>

        {contextMenuId === conv.id && (
          <div
            className="absolute right-0 top-full z-50 mt-1 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-elevated py-1.5 min-w-[160px] animate-scale-in origin-top-right"
            onClick={(e) => e.stopPropagation()}
            data-context-menu
          >
          <button
            onClick={() => {
              setEditingId(conv.id)
              setEditTitle(conv.title)
              onContextMenu('')
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
          >
            <PenLine size={14} className="text-gray-400" /> 重命名
          </button>
          <button
            onClick={() => {
              onTogglePin(conv.id)
              onContextMenu('')
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
          >
            <Pin size={14} className="text-gray-400" /> {conv.isPinned ? '取消置顶' : '置顶'}
          </button>
          <button
            onClick={() => onExport(conv, 'markdown')}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
          >
            <FileText size={14} className="text-gray-400" /> 导出 Markdown
          </button>
          <button
            onClick={() => onExport(conv, 'json')}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
          >
            <FileJson size={14} className="text-gray-400" /> 导出 JSON
          </button>
          <button
            onClick={() => onExport(conv, 'html')}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
          >
            <Code size={14} className="text-gray-400" /> 导出 HTML
          </button>
          <div className="mx-3 my-1 border-t border-surface-100 dark:border-surface-700" />
          <button
            onClick={() => {
              onDelete(conv.id)
              onContextMenu('')
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-colors"
          >
            <Trash2 size={14} /> 删除
          </button>
          </div>
        )}
      </div>
    </div>
  )
})

// ==================== 主组件 ====================

export function ConversationList() {
  const [searchQuery, setSearchQuery] = useState('')
  const [contextMenuId, setContextMenuId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const {
    conversations,
    currentConversationId,
    selectConversation,
    deleteConversation,
    renameConversation,
    togglePin,
    getMessages
  } = useConversationStore()

  const { getAgent } = useAgentStore()

  // 点击外部关闭上下文菜单
  useEffect(() => {
    if (!contextMenuId) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // 点击在菜单内部或触发按钮上时不关闭
      if (target.closest('[data-context-menu]') || target.closest('[data-context-trigger]')) return
      setContextMenuId(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [contextMenuId])

  // 模拟初始加载
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600)
    return () => clearTimeout(timer)
  }, [])

  // 监听容器尺寸
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // 过滤和排序对话
  const filteredConversations = useMemo(() => {
    // 过滤掉工作区对话（workspaceId 不为空的对话由工作区面板管理）
    let filtered = conversations.filter((c) => !c.workspaceId)
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((c) => c.title.toLowerCase().includes(query))
    }
    // 置顶的排在前面
    return [...filtered].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      return b.updatedAt - a.updatedAt
    })
  }, [conversations, searchQuery])

  // 构建虚拟行列表（分组标题 + 对话项）
  const virtualRows = useMemo(() => {
    const rows: VirtualRow[] = []
    const groups: { label: string; items: typeof filteredConversations }[] = []
    const groupMap = new Map<string, typeof filteredConversations>()

    for (const conv of filteredConversations) {
      const label = conv.isPinned ? '置顶' : getDateGroup(conv.updatedAt)
      if (!groupMap.has(label)) {
        groupMap.set(label, [])
      }
      groupMap.get(label)!.push(conv)
    }

    const order = ['置顶', '今天', '昨天', '本周', '本月', '更早']
    for (const label of order) {
      const items = groupMap.get(label)
      if (items && items.length > 0) {
        groups.push({ label, items })
      }
    }

    for (const group of groups) {
      rows.push({ type: 'header', label: group.label, key: `header-${group.label}` })
      for (const conv of group.items) {
        rows.push({ type: 'item', conv, key: conv.id })
      }
    }

    return rows
  }, [filteredConversations])

  // 计算每行的累积偏移和总高度
  const { rowOffsets, totalHeight } = useMemo(() => {
    const offsets: number[] = []
    let offset = 0
    for (const row of virtualRows) {
      offsets.push(offset)
      offset += row.type === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT
    }
    return { rowOffsets: offsets, totalHeight: offset }
  }, [virtualRows])

  // 计算可见范围
  const { startIndex, endIndex } = useMemo(() => {
    if (virtualRows.length === 0) return { startIndex: 0, endIndex: 0 }

    const viewportTop = scrollTop
    const viewportBottom = scrollTop + containerHeight

    // 二分查找第一个可见行
    let start = 0
    let end = virtualRows.length - 1
    while (start < end) {
      const mid = Math.floor((start + end) / 2)
      const rowBottom = rowOffsets[mid] + (virtualRows[mid].type === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT)
      if (rowBottom < viewportTop) {
        start = mid + 1
      } else {
        end = mid
      }
    }

    // 从 start 开始找到最后一个可见行
    let visibleEnd = start
    while (visibleEnd < virtualRows.length && rowOffsets[visibleEnd] < viewportBottom) {
      visibleEnd++
    }

    // 加上缓冲区
    const bufferedStart = Math.max(0, start - BUFFER_COUNT)
    const bufferedEnd = Math.min(virtualRows.length, visibleEnd + BUFFER_COUNT)

    return { startIndex: bufferedStart, endIndex: bufferedEnd }
  }, [scrollTop, containerHeight, virtualRows, rowOffsets])

  // 滚动事件处理（滚动时关闭上下文菜单）
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (container) {
      setScrollTop(container.scrollTop)
      setContextMenuId(null)
    }
  }, [])

  // 导出对话
  const handleExport = useCallback(async (conv: Conversation, format: ExportFormat) => {
    const messages = getMessages(conv.id)
    const { content, fileName, mimeType } = exportConversation(conv, messages, format)

    try {
      if (window.electronAPI?.file?.saveFile) {
        const result = await window.electronAPI.file.saveFile(fileName, content)
        if (result.success) {
          console.log('导出成功:', result.filePath)
        } else if (result.error !== '用户取消') {
          console.error('导出失败:', result.error)
        }
      } else {
        const blob = new Blob([content], { type: mimeType })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('导出失败:', error)
    }
    setContextMenuId(null)
  }, [getMessages])

  // 上下文菜单切换
  const handleContextMenu = useCallback((id: string) => {
    setContextMenuId((prev) => (prev === id ? null : id))
  }, [])

  // 获取 Agent 头像
  const getAgentAvatar = useCallback((agentId?: string) => {
    if (!agentId) return undefined
    return getAgent(agentId)?.avatar
  }, [getAgent])

  // 可见行切片
  const visibleRows = virtualRows.slice(startIndex, endIndex)
  const paddingTop = rowOffsets[startIndex] ?? 0

  return (
    <div className="flex flex-col h-full">
      {/* 搜索框 */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索对话..."
            className="w-full pl-8 pr-3 py-2 text-sm bg-surface-100 dark:bg-surface-800/80 rounded-xl border-none outline-none focus:ring-2 focus:ring-accent-500/20 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 transition-all"
          />
        </div>
      </div>

      {/* 对话列表（虚拟滚动） */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-2 pb-2"
        onScroll={handleScroll}
      >
        {isLoading ? (
          <SkeletonList />
        ) : filteredConversations.length === 0 ? (
          <div className="text-center text-gray-400 dark:text-gray-500 text-sm py-12">
            {searchQuery ? (
              <div className="space-y-1">
                <p className="font-medium">没有找到匹配的对话</p>
                <p className="text-xs">尝试其他关键词</p>
              </div>
            ) : (
              <div className="space-y-1">
                <MessageSquare size={28} className="mx-auto mb-2 opacity-40" />
                <p className="font-medium">暂无对话</p>
                <p className="text-xs">点击上方按钮创建新对话</p>
              </div>
            )}
          </div>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ paddingTop }}>
              {visibleRows.map((row) => {
                if (row.type === 'header') {
                  return (
                    <div
                      key={row.key}
                      className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
                    >
                      {row.label}
                    </div>
                  )
                }

                const conv = row.conv
                return (
                  <ConversationItem
                    key={conv.id}
                    conv={conv}
                    isActive={currentConversationId === conv.id}
                    onSelect={selectConversation}
                    agentAvatar={getAgentAvatar(conv.agentId)}
                    onContextMenu={handleContextMenu}
                    contextMenuId={contextMenuId}
                    onRename={renameConversation}
                    onTogglePin={togglePin}
                    onExport={handleExport}
                    onDelete={deleteConversation}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
