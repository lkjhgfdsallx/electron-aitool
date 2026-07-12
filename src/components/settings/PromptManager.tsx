import { useState, useMemo, useCallback } from 'react'
import {
  X,
  Plus,
  Trash2,
  Download,
  Upload,
  FileText,
  Star,
  Pin,
  Search,
  Filter,
  Link2,
} from 'lucide-react'
import { useAgentStore } from '../../stores/agent-store'
import { PromptEditor } from './PromptEditor'
import { PromptPlayground } from './PromptPlayground'
import { VersionHistory } from './VersionHistory'
import { PromptChainEditor } from './PromptChainEditor'
import type { Prompt, PromptCreateInput } from '../../types'
import { useConfirmDialog, SettingsEmptyState } from './ui'

type DetailView = 'editor' | 'playground' | 'versions' | 'chains' | null

export function PromptManager() {
  const {
    prompts, createPrompt, updatePrompt, deletePrompt,
    importPrompts, exportPrompts,
    toggleFavorite, togglePinned,
    getAllTags,
    duplicateAgent,
    createAgent,
  } = useAgentStore()

  const { confirm, Dialog } = useConfirmDialog()

  // ==================== 列表状态 ====================
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [showTagFilter, setShowTagFilter] = useState(false)

  // ==================== 详情状态 ====================
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
  const [detailView, setDetailView] = useState<DetailView>(null)
  const [isCreating, setIsCreating] = useState(false)

  // ==================== 派生数据 ====================
  const allTags = useMemo(() => getAllTags(), [prompts]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredPrompts = useMemo(() => {
    let list = [...prompts]

    // 搜索过滤
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }

    // 标签过滤
    if (selectedTag) {
      list = list.filter((p) => p.tags.includes(selectedTag))
    }

    // 排序：置顶 > 收藏 > 更新时间
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
      return b.updatedAt - a.updatedAt
    })

    return list
  }, [prompts, searchQuery, selectedTag])

  // ==================== 操作 ====================

  const handleCreate = useCallback(() => {
    setSelectedPrompt(null)
    setIsCreating(true)
    setDetailView('editor')
  }, [])

  const handleEdit = useCallback((prompt: Prompt) => {
    setSelectedPrompt(prompt)
    setIsCreating(false)
    setDetailView('editor')
  }, [])

  const handleSave = useCallback(
    (data: PromptCreateInput | (Partial<Prompt> & { id: string })) => {
      if (isCreating) {
        const newPrompt = createPrompt(data as PromptCreateInput)
        setSelectedPrompt(newPrompt)
        setIsCreating(false)
      } else if ('id' in data) {
        updatePrompt(data as Partial<Prompt> & { id: string })
        // 刷新选中的 prompt
        const updated = useAgentStore.getState().getPrompt(data.id)
        if (updated) setSelectedPrompt(updated)
      }
    },
    [isCreating, createPrompt, updatePrompt],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      const ok = await confirm({
        title: '删除提示词',
        message: '确定删除此提示词？此操作不可撤销。',
        confirmLabel: '删除',
        variant: 'danger',
      })
      if (ok) {
        deletePrompt(id)
        if (selectedPrompt?.id === id) {
          setSelectedPrompt(null)
          setDetailView(null)
          setIsCreating(false)
        }
      }
    },
    [deletePrompt, selectedPrompt, confirm],
  )

  const handleDuplicate = useCallback(
    (prompt: Prompt) => {
      const newPrompt = createPrompt({
        name: `${prompt.name} (副本)`,
        description: prompt.description,
        content: prompt.content,
        sections: prompt.sections,
        variables: prompt.variables,
        tags: [...prompt.tags],
        category: prompt.category,
        favorite: false,
        pinned: false,
        abTest: undefined,
      })
      setSelectedPrompt(newPrompt)
      setDetailView('editor')
      setIsCreating(false)
    },
    [createPrompt],
  )

  const handleConvertToAgent = useCallback(
    (prompt: Prompt) => {
      createAgent({
        name: prompt.name,
        description: prompt.description || '',
        systemPrompt: prompt.content,
        enabledToolIds: [],
        planningStrategy: 'react',
        memoryConfig: { historyTurns: 10, longTermEnabled: true, crossSession: true },
        termination: { maxSteps: 100, timeoutSeconds: 0, autoStopOnGoal: true },
        modelConfig: {},
        knowledgeBaseIds: [],
        enabled: true,
      })
      alert('已成功将提示词 "' + prompt.name + '" 转化为 Agent！请前往 Agent 管理查看。')
    },
    [createAgent],
  )

  const handleExport = useCallback(() => {
    const data = exportPrompts()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'prompts.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [exportPrompts])

  const handleImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text) as Prompt[]
        importPrompts(data)
      } catch {
        alert('导入失败')
      }
    }
    input.click()
  }, [importPrompts])

  const handleCloseDetail = useCallback(() => {
    setSelectedPrompt(null)
    setDetailView(null)
    setIsCreating(false)
  }, [])

  // ==================== 渲染 ====================

  return (
    <div className="flex gap-0 h-[calc(100vh-120px)] min-h-[500px]">
      {/* ===== 左侧：列表区 ===== */}
      <div className="w-80 flex-shrink-0 border-r border-surface-200/80 dark:border-surface-700/60 flex flex-col">
        {/* 标题 + 操作 */}
        <div className="px-4 pt-4 pb-3 border-b border-surface-200/80 dark:border-surface-700/60">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
              <FileText size={18} className="text-accent-500" />
              提示词管理
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={handleImport}
                className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
                title="导入"
              >
                <Upload size={14} />
              </button>
              <button
                onClick={handleExport}
                className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
                title="导出"
              >
                <Download size={14} />
              </button>
              <button
                onClick={handleCreate}
                className="p-1.5 rounded-lg bg-accent-500 text-white hover:bg-accent-600 transition-colors"
                title="新建提示词"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={() => { setSelectedPrompt(null); setDetailView('chains'); setIsCreating(false) }}
                className="p-1.5 rounded-lg text-muted hover:text-accent-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                title="提示词链"
              >
                <Link2 size={14} />
              </button>
            </div>
          </div>

          {/* 搜索框 */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索提示词..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400"
            />
          </div>

          {/* 标签过滤 */}
          {allTags.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowTagFilter(!showTagFilter)}
                className="flex items-center gap-1 text-xs text-muted hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
              >
                <Filter size={12} />
                标签过滤
                {selectedTag && (
                  <span className="ml-1 px-1.5 py-0.5 bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 rounded text-[10px]">
                    {selectedTag}
                  </span>
                )}
              </button>
              {showTagFilter && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <button
                    onClick={() => setSelectedTag(null)}
                    className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                      !selectedTag
                        ? 'bg-accent-500 text-white border-accent-500'
                        : 'border-surface-300 dark:border-surface-600 text-muted hover:border-accent-300'
                    }`}
                  >
                    全部
                  </button>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                      className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                        selectedTag === tag
                          ? 'bg-accent-500 text-white border-accent-500'
                          : 'border-surface-300 dark:border-surface-600 text-muted hover:border-accent-300'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto">
          {filteredPrompts.length === 0 ? (
            <SettingsEmptyState
              icon={FileText}
              title={searchQuery || selectedTag ? '没有匹配的提示词' : '暂无提示词'}
              action={
                !searchQuery && !selectedTag ? (
                  <button
                    onClick={handleCreate}
                    className="text-xs text-accent-500 hover:text-accent-600"
                  >
                    创建第一个
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="py-1">
              {filteredPrompts.map((prompt) => (
                <div
                  key={prompt.id}
                  onClick={() => handleEdit(prompt)}
                  className={`group px-4 py-3 cursor-pointer transition-colors border-l-2 ${
                    selectedPrompt?.id === prompt.id && detailView === 'editor'
                      ? 'bg-accent-50/50 dark:bg-accent-950/20 border-l-accent-500'
                      : 'border-l-transparent hover:bg-surface-50 dark:hover:bg-surface-900/30'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {prompt.pinned && <Pin size={10} className="text-accent-500 flex-shrink-0" />}
                        <h3 className="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">
                          {prompt.name || '未命名'}
                        </h3>
                        {prompt.favorite && (
                          <Star size={12} className="text-amber-400 fill-amber-400 flex-shrink-0" />
                        )}
                      </div>
                      {prompt.description && (
                        <p className="text-xs text-muted mt-0.5 truncate">{prompt.description}</p>
                      )}
                      {/* 标签 */}
                      {prompt.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {prompt.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0 text-[10px] rounded bg-surface-100 dark:bg-surface-800 text-muted"
                            >
                              {tag}
                            </span>
                          ))}
                          {prompt.tags.length > 3 && (
                            <span className="text-[10px] text-muted">+{prompt.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 操作按钮（hover 显示） */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleFavorite(prompt.id)
                        }}
                        className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700"
                        title={prompt.favorite ? '取消收藏' : '收藏'}
                      >
                        <Star
                          size={12}
                          className={prompt.favorite ? 'text-amber-400 fill-amber-400' : 'text-muted'}
                        />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(prompt.id)
                        }}
                        className="p-1 rounded hover:bg-danger-50 dark:hover:bg-danger-950/30 text-red-500"
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部统计 */}
        <div className="px-4 py-2 border-t border-surface-200/80 dark:border-surface-700/60 text-xs text-muted">
          共 {prompts.length} 个提示词
          {searchQuery && ` · 筛选 ${filteredPrompts.length} 个`}
        </div>
      </div>

      {/* ===== 右侧：详情区 ===== */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {detailView === 'chains' ? (
          <PromptChainEditor onBack={() => { setDetailView(null); setSelectedPrompt(null) }} />
        ) : detailView === 'editor' ? (
          <PromptEditor
            prompt={selectedPrompt}
            isCreating={isCreating}
            onSave={handleSave}
            onClose={handleCloseDetail}
            onOpenPlayground={() => setDetailView('playground')}
            onOpenVersions={() => setDetailView('versions')}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onToggleFavorite={toggleFavorite}
            onTogglePinned={togglePinned}
            onConvertToAgent={handleConvertToAgent}
          />
        ) : detailView === 'playground' && selectedPrompt ? (
          <PromptPlayground
            prompt={selectedPrompt}
            onBack={() => setDetailView('editor')}
          />
        ) : detailView === 'versions' && selectedPrompt ? (
          <VersionHistory
            prompt={selectedPrompt}
            onBack={() => setDetailView('editor')}
          />
        ) : (
          <SettingsEmptyState
            icon={FileText}
            title="选择左侧提示词进行编辑"
            description="或点击 + 创建新提示词"
            iconSize={48}
          />
        )}
      </div>
      <Dialog />
    </div>
  )
}
