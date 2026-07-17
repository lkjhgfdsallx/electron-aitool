/**
 * Agent 长期记忆管理面板
 * 查看 / 编辑 / 删除 / 清空指定 Agent 的记忆条目
 * 支持按 conversationId 跳转到来源对话
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Brain, Pencil, Trash2, Search, X, Save, RefreshCw, ExternalLink } from 'lucide-react'
import { memoryService, type MemoryListItem } from '../../services/memory-service'
import { useConversationStore } from '../../stores/conversation-store'
import { useConfirmDialog } from './ui'
import { useAppTranslation } from '@/i18n/hooks'

interface AgentMemoryPanelProps {
  agentId: string
  agentName?: string
  /** 点击来源对话时回调（用于关闭设置页并切到对话） */
  onOpenConversation?: (conversationId: string) => void
}

function shortId(id: string): string {
  if (id.length <= 10) return id
  return `${id.slice(0, 6)}…${id.slice(-4)}`
}

export function AgentMemoryPanel({ agentId, agentName, onOpenConversation }: AgentMemoryPanelProps) {
  const { t, i18n } = useAppTranslation()
  const [items, setItems] = useState<MemoryListItem[]>([])
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const { confirm, Dialog } = useConfirmDialog()
  const conversations = useConversationStore((s) => s.conversations)
  const selectConversation = useConversationStore((s) => s.selectConversation)

  const titleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of conversations) {
      map.set(c.id, c.title || t('agent.unnamedConversation'))
    }
    return map
  }, [conversations, t])

  const reload = useCallback(() => {
    setItems(memoryService.getAllMemories(agentId))
  }, [agentId])

  useEffect(() => {
    reload()
  }, [reload])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (m) => m.key.toLowerCase().includes(q) || m.value.toLowerCase().includes(q)
    )
  }, [items, query])

  const startEdit = (item: MemoryListItem) => {
    setEditingId(item.id)
    setEditValue(item.value)
  }

  const saveEdit = () => {
    if (!editingId) return
    memoryService.updateMemory(editingId, editValue)
    setEditingId(null)
    setEditValue('')
    reload()
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditValue('')
  }

  const handleDelete = async (item: MemoryListItem) => {
    const ok = await confirm({
      title: t('agent.deleteMemoryTitle'),
      message: t('agent.deleteMemoryMessage', { key: item.key }),
      confirmLabel: t('common.delete'),
      variant: 'danger',
    })
    if (!ok) return
    memoryService.deleteMemoryById(item.id)
    if (editingId === item.id) cancelEdit()
    reload()
  }

  const handleClearAll = async () => {
    if (items.length === 0) return
    const ok = await confirm({
      title: t('agent.clearAllMemoriesTitle'),
      message: t('agent.clearAllMemoriesMessage', { agentName: agentName || t('agent.currentAgent'), count: items.length }),
      confirmLabel: t('agent.clearMemories'),
      variant: 'danger',
    })
    if (!ok) return
    memoryService.clearMemories(agentId)
    cancelEdit()
    reload()
  }

  const handleOpenConversation = (conversationId: string) => {
    selectConversation(conversationId)
    onOpenConversation?.(conversationId)
  }

  return (
    <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300 flex items-center gap-2">
          <Brain size={14} /> {t('agent.savedMemories')}
          <span className="text-xs font-normal text-muted">({items.length})</span>
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={reload}
            className="p-1.5 rounded-lg text-muted hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
            title={t('agent.refreshMemories')}
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={items.length === 0}
            className="flex items-center gap-1 px-2 py-1 text-xs text-danger-500 border border-danger-200/80 dark:border-danger-800/50 rounded-lg hover:bg-danger-50 dark:hover:bg-danger-950/30 disabled:opacity-40 transition-colors"
          >
            <Trash2 size={12} /> {t('agent.clearMemories')}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-muted">
        {t('agent.memoryPanelHint')}
      </p>

      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('agent.searchMemoriesPlaceholder')}
          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-xs text-muted py-6 text-center border border-dashed border-surface-200 dark:border-surface-700 rounded-lg">
          {items.length === 0 ? t('agent.noMemories') : t('agent.noMatchingMemories')}
        </div>
      ) : (
        <ul className="max-h-64 overflow-y-auto space-y-2">
          {filtered.map((item) => {
            const convTitle = item.conversationId
              ? titleById.get(item.conversationId)
              : undefined
            const convExists = !!(item.conversationId && titleById.has(item.conversationId))

            return (
              <li
                key={item.id}
                className="rounded-lg border border-surface-200/80 dark:border-surface-700/60 p-2.5 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium text-surface-800 dark:text-surface-200 truncate">
                        {item.key}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          item.scope === 'agent'
                            ? 'bg-accent-50 dark:bg-accent-950/30 text-accent-600 dark:text-accent-400'
                            : 'bg-surface-100 dark:bg-surface-800 text-muted'
                        }`}
                      >
                        {item.scope === 'agent' ? t('agent.memoryCrossSession') : t('agent.memoryThisSession')}
                      </span>
                      {item.userEdited && (
                        <span className="text-[10px] text-muted">{t('agent.memoryEdited')}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{new Date(item.updatedAt).toLocaleString(i18n.resolvedLanguage ?? i18n.language)}</span>
                      {item.conversationId && (
                        convExists ? (
                          <button
                            type="button"
                            onClick={() => handleOpenConversation(item.conversationId!)}
                            className="inline-flex items-center gap-0.5 text-accent-600 dark:text-accent-400 hover:underline"
                            title={t('agent.openConversation', { id: item.conversationId })}
                          >
                            <ExternalLink size={10} />
                            {convTitle || shortId(item.conversationId)}
                          </button>
                        ) : (
                          <span className="text-muted" title={item.conversationId}>
                            {t('agent.sourceConversationDeleted', { id: shortId(item.conversationId) })}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {editingId === item.id ? (
                      <>
                        <button
                          type="button"
                          onClick={saveEdit}
                          className="p-1.5 rounded-lg text-accent-500 hover:bg-accent-50 dark:hover:bg-accent-950/30"
                          title={t('common.save')}
                        >
                          <Save size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="p-1.5 rounded-lg text-muted hover:bg-surface-100 dark:hover:bg-surface-700"
                          title={t('common.cancel')}
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="p-1.5 rounded-lg text-muted hover:bg-surface-100 dark:hover:bg-surface-700"
                          title={t('common.edit')}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          className="p-1.5 rounded-lg text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950/30"
                          title={t('common.delete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {editingId === item.id ? (
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    rows={3}
                    className="w-full text-xs rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-2"
                  />
                ) : (
                  <p className="text-xs text-surface-600 dark:text-surface-400 whitespace-pre-wrap break-words">
                    {item.value}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <Dialog />
    </div>
  )
}
