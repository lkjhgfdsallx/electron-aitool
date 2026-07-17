import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit2, Trash2, X, Check, FolderOpen } from 'lucide-react'
import { useKnowledgeCollectionStore } from '../../stores/knowledge-collection-store'
import { useKnowledgeBaseStore } from '../../stores/knowledge-base-store'
import { useAppTranslation } from '@/i18n/hooks'

const EMOJI_OPTIONS = ['📚', '📖', '📄', '📝', '💻', '🔧', '🌐', '🎯', '📊', '🧪', '🛡️', '🎮', '🎵', '🤖', '🧠', '💡']

export function KnowledgeCollectionTabs() {
  const { t } = useAppTranslation()
  const {
    collections,
    activeCollectionId,
    loadCollections,
    createCollection,
    updateCollection,
    deleteCollection,
    setActiveCollection
  } = useKnowledgeCollectionStore()

  const { setActiveCollectionId } = useKnowledgeBaseStore()

  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newIcon, setNewIcon] = useState('📚')
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editIcon, setEditIcon] = useState('')

  useEffect(() => {
    loadCollections()
  }, [loadCollections])

  // 同步 activeCollectionId 到 knowledge-base-store
  const handleTabClick = useCallback(
    (id: string | null) => {
      setActiveCollection(id)
      setActiveCollectionId(id)
    },
    [setActiveCollection, setActiveCollectionId]
  )

  const handleCreate = async () => {
    if (!newName.trim()) return
    await createCollection({
      name: newName.trim(),
      description: newDesc.trim(),
      icon: newIcon,
      isDefault: false
    })
    setNewName('')
    setNewDesc('')
    setNewIcon('📚')
    setIsCreating(false)
  }

  const handleEdit = (id: string) => {
    const col = collections.find((c) => c.id === id)
    if (!col) return
    setEditingId(id)
    setEditName(col.name)
    setEditDesc(col.description)
    setEditIcon(col.icon)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return
    await updateCollection(editingId, {
      name: editName.trim(),
      description: editDesc.trim(),
      icon: editIcon
    })
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('knowledgeBase.deleteCollectionConfirm'))) return
    try {
      await deleteCollection(id)
    } catch (err) {
      alert(err instanceof Error ? err.message : t('knowledgeBase.deleteCollectionFailed'))
    }
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {/* 全部标签 */}
      <button
        onClick={() => handleTabClick(null)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
          activeCollectionId === null
            ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 font-medium'
            : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
        }`}
      >
        <FolderOpen size={14} />
        {t('knowledgeBase.allCollections')}
      </button>

      {/* 分隔线 */}
      <div className="w-px h-5 bg-surface-200 dark:bg-surface-700 mx-1 flex-shrink-0" />

      {/* 集合标签 */}
      {collections.map((col) => (
        <div key={col.id} className="flex items-center gap-0.5 group">
          {editingId === col.id ? (
            // 编辑模式
            <div className="flex items-center gap-1 bg-white dark:bg-surface-800 border border-surface-300 dark:border-surface-600 rounded-lg px-2 py-1">
              <select
                value={editIcon}
                onChange={(e) => setEditIcon(e.target.value)}
                className="w-8 text-center bg-transparent border-none text-sm cursor-pointer"
              >
                {EMOJI_OPTIONS.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-24 px-1 py-0.5 text-sm bg-transparent border-b border-surface-300 dark:border-surface-600 focus:outline-none focus:border-accent-500"
                autoFocus
              />
              <button onClick={handleSaveEdit} className="p-0.5 text-green-500 hover:text-green-600">
                <Check size={14} />
              </button>
              <button onClick={() => setEditingId(null)} className="p-0.5 text-muted hover:text-surface-700">
                <X size={14} />
              </button>
            </div>
          ) : (
            // 正常显示模式
            <>
              <button
                onClick={() => handleTabClick(col.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  activeCollectionId === col.id
                    ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 font-medium'
                    : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
                }`}
              >
                <span>{col.icon}</span>
                {col.name}
              </button>
              {/* 操作按钮（hover 显示） */}
              {!col.isDefault && (
                <div className="hidden group-hover:flex items-center gap-0.5">
                  <button
                    onClick={() => handleEdit(col.id)}
                    className="p-1 text-muted hover:text-surface-700 dark:hover:text-surface-300"
                    title={t('common.edit')}
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(col.id)}
                    className="p-1 text-red-400 hover:text-red-600"
                    title={t('common.delete')}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {/* 新建集合 */}
      {isCreating ? (
        <div className="flex items-center gap-1 bg-white dark:bg-surface-800 border border-surface-300 dark:border-surface-600 rounded-lg px-2 py-1 ml-1">
          <select
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
            className="w-8 text-center bg-transparent border-none text-sm cursor-pointer"
          >
            {EMOJI_OPTIONS.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('knowledgeBase.collectionName')}
            className="w-28 px-1 py-0.5 text-sm bg-transparent border-b border-surface-300 dark:border-surface-600 focus:outline-none focus:border-accent-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') setIsCreating(false)
            }}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="p-0.5 text-green-500 hover:text-green-600 disabled:opacity-30"
          >
            <Check size={14} />
          </button>
          <button onClick={() => setIsCreating(false)} className="p-0.5 text-muted hover:text-surface-700">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm text-muted hover:text-surface-600 dark:hover:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors ml-1"
          title={t('knowledgeBase.newCollection')}
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  )
}
