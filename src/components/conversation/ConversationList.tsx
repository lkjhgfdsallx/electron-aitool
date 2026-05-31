import { useState, useMemo } from 'react'
import {
  Search,
  Pin,
  Trash2,
  MessageSquare,
  Bot,
  MoreHorizontal,
  PenLine
} from 'lucide-react'
import { useConversationStore } from '../../stores/conversation-store'
import { useAgentStore } from '../../stores/agent-store'
import { formatConversationTime } from '../../utils/conversation-utils'

export function ConversationList() {
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [contextMenuId, setContextMenuId] = useState<string | null>(null)

  const {
    conversations,
    currentConversationId,
    selectConversation,
    deleteConversation,
    renameConversation,
    togglePin
  } = useConversationStore()

  const { getAgent } = useAgentStore()

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

  const handleRename = (id: string) => {
    if (editTitle.trim()) {
      renameConversation(id, editTitle.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 搜索框 */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索对话..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg border-none outline-none focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
        </div>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto px-2">
        {filteredConversations.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            {searchQuery ? '没有找到匹配的对话' : '暂无对话'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                title={`开始时间: ${formatConversationTime(conv.createdAt)}${conv.agentId ? '\nAgent: ' + (getAgent(conv.agentId)?.name ?? '未知') : ''}`}
                className={`relative group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  currentConversationId === conv.id
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                }`}
              >
                {conv.agentId ? (
                  <Bot size={16} className="flex-shrink-0 text-purple-500" />
                ) : (
                  <MessageSquare size={16} className="flex-shrink-0" />
                )}
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
                      className="w-full text-sm bg-transparent border-b border-primary-500 outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm truncate">{conv.title}</span>
                      {conv.agentId && (
                        <span className="flex-shrink-0 text-[10px] px-1 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded leading-none">
                          Agent
                        </span>
                      )}
                    </div>
                  )}
                  <span className="text-xs text-gray-400">
                    {conv.messageCount} 条消息
                  </span>
                </div>

                {conv.isPinned && (
                  <Pin size={12} className="flex-shrink-0 text-gray-400" />
                )}

                {/* 操作按钮 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setContextMenuId(contextMenuId === conv.id ? null : conv.id)
                  }}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-opacity"
                >
                  <MoreHorizontal size={14} />
                </button>

                {/* 上下文菜单 */}
                {contextMenuId === conv.id && (
                  <div
                    className="absolute right-0 top-full z-10 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[120px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        setEditingId(conv.id)
                        setEditTitle(conv.title)
                        setContextMenuId(null)
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <PenLine size={14} /> 重命名
                    </button>
                    <button
                      onClick={() => {
                        togglePin(conv.id)
                        setContextMenuId(null)
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <Pin size={14} /> {conv.isPinned ? '取消置顶' : '置顶'}
                    </button>
                    <button
                      onClick={() => {
                        deleteConversation(conv.id)
                        setContextMenuId(null)
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <Trash2 size={14} /> 删除
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
