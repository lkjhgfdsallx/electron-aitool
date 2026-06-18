import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Search,
  Pin,
  Trash2,
  MessageSquare,
  Bot,
  MoreHorizontal,
  PenLine,
  Download
} from 'lucide-react'
import { useConversationStore } from '../../stores/conversation-store'
import { useAgentStore } from '../../stores/agent-store'
import { exportConversationToJson } from '../../utils/conversation-utils'

/** 相对时间格式化 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`

  const date = new Date(timestamp)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${month}/${day}`
}

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

/** 获取对话最后一条消息的预览 */
function getLastMessagePreview(
  conv: { id: string; messageCount: number },
  getMessages: (id: string) => { role: string; content: string }[]
): string {
  if (conv.messageCount === 0) return '暂无消息'
  const msgs = getMessages(conv.id)
  if (msgs.length === 0) return '暂无消息'
  const lastMsg = msgs[msgs.length - 1]
  const content = lastMsg.content || ''
  // 截断并清理 markdown
  const cleaned = content.replace(/[#*`>\[\]()!]/g, '').replace(/\n+/g, ' ').trim()
  return cleaned.length > 50 ? cleaned.substring(0, 50) + '...' : cleaned || '暂无内容'
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

export function ConversationList() {
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [contextMenuId, setContextMenuId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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

  // 模拟初始加载
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600)
    return () => clearTimeout(timer)
  }, [])

  // 过滤和排序对话
  const filteredConversations = useMemo(() => {
    let filtered = conversations
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

  // 按日期分组
  const groupedConversations = useMemo(() => {
    const groups: { label: string; items: typeof filteredConversations }[] = []
    const groupMap = new Map<string, typeof filteredConversations>()

    for (const conv of filteredConversations) {
      const label = conv.isPinned ? '置顶' : getDateGroup(conv.updatedAt)
      if (!groupMap.has(label)) {
        groupMap.set(label, [])
      }
      groupMap.get(label)!.push(conv)
    }

    // 按顺序排列分组
    const order = ['置顶', '今天', '昨天', '本周', '本月', '更早']
    for (const label of order) {
      const items = groupMap.get(label)
      if (items && items.length > 0) {
        groups.push({ label, items })
      }
    }

    return groups
  }, [filteredConversations])

  const handleRename = (id: string) => {
    if (editTitle.trim()) {
      renameConversation(id, editTitle.trim())
    }
    setEditingId(null)
  }

  const handleExportRaw = useCallback(async (conv: typeof conversations[0]) => {
    const messages = getMessages(conv.id)
    const jsonContent = exportConversationToJson(conv, messages as unknown as Array<Record<string, unknown>>)
    const safeTitle = conv.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 50)
    const defaultName = `${safeTitle}_原始对话.json`

    try {
      if (window.electronAPI?.file?.saveFile) {
        const result = await window.electronAPI.file.saveFile(defaultName, jsonContent)
        if (result.success) {
          console.log('导出成功:', result.filePath)
        } else if (result.error !== '用户取消') {
          console.error('导出失败:', result.error)
        }
      } else {
        const blob = new Blob([jsonContent], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = defaultName
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('导出失败:', error)
    }
    setContextMenuId(null)
  }, [getMessages])

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

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
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
          groupedConversations.map((group) => (
            <div key={group.label} className="mb-1">
              {/* 分组标题 */}
              <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {group.label}
              </div>

              {/* 对话项 */}
              <div className="space-y-0.5">
                {group.items.map((conv) => {
                  const preview = getLastMessagePreview(conv, getMessages)
                  const agent = conv.agentId ? getAgent(conv.agentId) : undefined

                  return (
                    <div
                      key={conv.id}
                      onClick={() => selectConversation(conv.id)}
                      className={`relative group flex items-start gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                        currentConversationId === conv.id
                          ? 'bg-accent-50 dark:bg-accent-950/30 shadow-sm'
                          : 'hover:bg-surface-100 dark:hover:bg-surface-800/60'
                      }`}
                    >
                      {/* 图标 */}
                      <div className={`flex-shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center text-xs ${
                        conv.agentId
                          ? 'bg-accent-100 dark:bg-accent-900/40 text-accent-600 dark:text-accent-400'
                          : currentConversationId === conv.id
                            ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
                            : 'bg-surface-200 dark:bg-surface-700 text-gray-500 dark:text-gray-400'
                      }`}>
                        {conv.agentId ? (
                          <span>{agent?.avatar || '🤖'}</span>
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
                            onBlur={() => handleRename(conv.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(conv.id)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            autoFocus
                            className="w-full text-sm bg-transparent border-b-2 border-accent-500 outline-none py-0.5"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm truncate ${
                              currentConversationId === conv.id
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

                      {/* 操作按钮 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setContextMenuId(contextMenuId === conv.id ? null : conv.id)
                        }}
                        className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 transition-all"
                      >
                        <MoreHorizontal size={14} className="text-gray-400" />
                      </button>

                      {/* 上下文菜单 */}
                      {contextMenuId === conv.id && (
                        <div
                          className="absolute right-0 top-full z-50 mt-1 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-elevated py-1.5 min-w-[140px] animate-scale-in origin-top-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => {
                              setEditingId(conv.id)
                              setEditTitle(conv.title)
                              setContextMenuId(null)
                            }}
                            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
                          >
                            <PenLine size={14} className="text-gray-400" /> 重命名
                          </button>
                          <button
                            onClick={() => {
                              togglePin(conv.id)
                              setContextMenuId(null)
                            }}
                            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
                          >
                            <Pin size={14} className="text-gray-400" /> {conv.isPinned ? '取消置顶' : '置顶'}
                          </button>
                          <button
                            onClick={() => handleExportRaw(conv)}
                            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
                          >
                            <Download size={14} className="text-gray-400" /> 导出原始对话
                          </button>
                          <div className="mx-3 my-1 border-t border-surface-100 dark:border-surface-700" />
                          <button
                            onClick={() => {
                              deleteConversation(conv.id)
                              setContextMenuId(null)
                            }}
                            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-colors"
                          >
                            <Trash2 size={14} /> 删除
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
