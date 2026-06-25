import { useState, useMemo, useCallback } from 'react'
import {
  Link2,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  Save,
  X,
  GripVertical,
} from 'lucide-react'
import { useAgentStore } from '../../stores/agent-store'
import type { PromptChain, PromptChainNode, Prompt } from '../../types'

// ==================== 编辑器面板 ====================

interface ChainEditorProps {
  chain: PromptChain | null
  isNew: boolean
  prompts: Prompt[]
  onSave: (data: Omit<PromptChain, 'id' | 'createdAt' | 'updatedAt'> | (Partial<PromptChain> & { id: string })) => void
  onClose: () => void
}

function ChainEditorPanel({ chain, isNew, prompts, onSave, onClose }: ChainEditorProps) {
  const [name, setName] = useState(chain?.name ?? '')
  const [description, setDescription] = useState(chain?.description ?? '')
  const [nodes, setNodes] = useState<PromptChainNode[]>(chain?.nodes ?? [])

  const handleAddNode = useCallback(() => {
    const newNode: PromptChainNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      promptId: '',
      order: nodes.length,
      variableMapping: {},
    }
    setNodes((prev) => [...prev, newNode])
  }, [nodes.length])

  const handleRemoveNode = useCallback((nodeId: string) => {
    setNodes((prev) =>
      prev
        .filter((n) => n.id !== nodeId)
        .map((n, i) => ({ ...n, order: i })),
    )
  }, [])

  const handleMoveNode = useCallback((nodeId: string, direction: 'up' | 'down') => {
    setNodes((prev) => {
      const idx = prev.findIndex((n) => n.id === nodeId)
      if (idx < 0) return prev
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[targetIdx]] = [next[targetIdx], next[idx]]
      return next.map((n, i) => ({ ...n, order: i }))
    })
  }, [])

  const handleUpdateNodePrompt = useCallback((nodeId: string, promptId: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, promptId } : n)),
    )
  }, [])

  const handleUpdateNodeMapping = useCallback((nodeId: string, key: string, value: string) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              variableMapping: {
                ...n.variableMapping,
                [key]: value,
              },
            }
          : n,
      ),
    )
  }, [])

  const handleRemoveMapping = useCallback((nodeId: string, key: string) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId) return n
        const mapping = { ...n.variableMapping }
        delete mapping[key]
        return { ...n, variableMapping: mapping }
      }),
    )
  }, [])

  const handleSave = useCallback(() => {
    if (!name.trim()) return
    if (isNew) {
      onSave({ name: name.trim(), description: description.trim(), nodes })
    } else if (chain) {
      onSave({ id: chain.id, name: name.trim(), description: description.trim(), nodes })
    }
  }, [name, description, nodes, isNew, chain, onSave])

  const isValid = name.trim().length > 0 && nodes.length > 0 && nodes.every((n) => n.promptId)

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-surface-200/80 dark:border-surface-700/60">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-accent-500" />
          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">
            {isNew ? '新建提示词链' : '编辑提示词链'}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors text-muted"
        >
          <X size={14} />
        </button>
      </div>

      {/* 表单区 */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* 基本信息 */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">链名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：需求分析 → 方案设计 → 代码生成"
              className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">描述</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="这条链的用途说明"
              className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            />
          </div>
        </div>

        {/* 节点列表 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs text-muted font-medium">执行节点（按顺序执行）</label>
            <button
              onClick={handleAddNode}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-accent-600 dark:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-950/30 transition-colors"
            >
              <Plus size={12} />
              添加节点
            </button>
          </div>

          {nodes.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <Link2 size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">暂无节点，点击上方添加</p>
            </div>
          ) : (
            <div className="space-y-3">
              {nodes.map((node, idx) => (
                <ChainNodeCard
                  key={node.id}
                  node={node}
                  index={idx}
                  totalNodes={nodes.length}
                  prompts={prompts}
                  prevNode={idx > 0 ? nodes[idx - 1] : undefined}
                  onMoveUp={() => handleMoveNode(node.id, 'up')}
                  onMoveDown={() => handleMoveNode(node.id, 'down')}
                  onRemove={() => handleRemoveNode(node.id)}
                  onUpdatePrompt={(promptId) => handleUpdateNodePrompt(node.id, promptId)}
                  onUpdateMapping={(key, value) => handleUpdateNodeMapping(node.id, key, value)}
                  onRemoveMapping={(key) => handleRemoveMapping(node.id, key)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 链预览 */}
        {nodes.length > 0 && (
          <div className="bg-surface-50 dark:bg-surface-800/40 rounded-xl p-4">
            <p className="text-xs text-muted mb-3 font-medium">执行流程预览</p>
            <div className="flex items-center gap-1 flex-wrap">
              {nodes.map((node, idx) => {
                const p = prompts.find((pr) => pr.id === node.promptId)
                return (
                  <div key={node.id} className="flex items-center gap-1">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-accent-50 dark:bg-accent-950/30 text-accent-700 dark:text-accent-300 text-xs border border-accent-200/60 dark:border-accent-800/40">
                      <span className="text-muted">{idx + 1}.</span>
                      {p?.name || '未选择'}
                    </span>
                    {idx < nodes.length - 1 && (
                      <ArrowRight size={12} className="text-muted" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-surface-200/80 dark:border-surface-700/60">
        <button
          onClick={onClose}
          className="px-4 py-1.5 rounded-lg text-xs text-muted hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-accent-500 text-white hover:bg-accent-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save size={12} />
          {isNew ? '创建' : '保存'}
        </button>
      </div>
    </div>
  )
}

// ==================== 节点卡片 ====================

interface ChainNodeCardProps {
  node: PromptChainNode
  index: number
  totalNodes: number
  prompts: Prompt[]
  prevNode?: PromptChainNode
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  onUpdatePrompt: (promptId: string) => void
  onUpdateMapping: (key: string, value: string) => void
  onRemoveMapping: (key: string) => void
}

function ChainNodeCard({
  node,
  index,
  totalNodes,
  prompts,
  prevNode,
  onMoveUp,
  onMoveDown,
  onRemove,
  onUpdatePrompt,
  onUpdateMapping,
  onRemoveMapping,
}: ChainNodeCardProps) {
  const [showMapping, setShowMapping] = useState(false)
  const [newMappingKey, setNewMappingKey] = useState('')
  const [newMappingValue, setNewMappingValue] = useState('')

  const selectedPrompt = prompts.find((p) => p.id === node.promptId)
  const prevPrompt = prevNode ? prompts.find((p) => p.id === prevNode.promptId) : undefined
  const prevVariables = prevPrompt?.variables ?? []

  const handleAddMapping = () => {
    if (newMappingKey.trim() && newMappingValue.trim()) {
      onUpdateMapping(newMappingKey.trim(), newMappingValue.trim())
      setNewMappingKey('')
      setNewMappingValue('')
    }
  }

  return (
    <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-4">
      {/* 节点头部 */}
      <div className="flex items-center gap-2 mb-3">
        <GripVertical size={14} className="text-surface-300 dark:text-surface-600" />
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent-500 text-white text-[10px] font-bold">
          {index + 1}
        </span>
        <select
          value={node.promptId}
          onChange={(e) => onUpdatePrompt(e.target.value)}
          className="flex-1 px-2 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-xs focus:outline-none focus:ring-2 focus:ring-accent-500/30"
        >
          <option value="">-- 选择提示词 --</option>
          {prompts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.variables.length > 0 ? `(${p.variables.length} 个变量)` : ''}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-muted disabled:opacity-30 transition-colors"
            title="上移"
          >
            <ChevronUp size={12} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === totalNodes - 1}
            className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-muted disabled:opacity-30 transition-colors"
            title="下移"
          >
            <ChevronDown size={12} />
          </button>
          <button
            onClick={onRemove}
            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 transition-colors"
            title="删除"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* 节点详情 */}
      {selectedPrompt && (
        <div className="ml-7 space-y-2">
          <p className="text-xs text-muted line-clamp-2">{selectedPrompt.description || selectedPrompt.content.slice(0, 100)}</p>

          {selectedPrompt.variables.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedPrompt.variables.map((v) => (
                <span
                  key={v.name}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-surface-100 dark:bg-surface-700 text-muted"
                >
                  {`{{${v.name}}}`}
                  {v.required && <span className="text-red-500 ml-0.5">*</span>}
                </span>
              ))}
            </div>
          )}

          {/* 变量映射 */}
          {index > 0 && prevVariables.length > 0 && (
            <div>
              <button
                onClick={() => setShowMapping(!showMapping)}
                className="text-xs text-accent-500 hover:text-accent-600 transition-colors"
              >
                {showMapping ? '收起' : '展开'}变量映射 ↓
              </button>

              {showMapping && (
                <div className="mt-2 space-y-2 p-2 bg-surface-50 dark:bg-surface-800/40 rounded-lg">
                  <p className="text-[10px] text-muted">
                    将上一步输出的变量映射到当前节点的变量
                  </p>
                  {Object.entries(node.variableMapping ?? {}).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className="text-xs text-surface-700 dark:text-surface-300 min-w-[60px]">{`{{${key}}}`}</span>
                      <ArrowRight size={10} className="text-muted shrink-0" />
                      <span className="text-xs text-accent-600 dark:text-accent-400 flex-1 truncate">{value}</span>
                      <button
                        onClick={() => onRemoveMapping(key)}
                        className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-red-400"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <select
                      value={newMappingKey}
                      onChange={(e) => setNewMappingKey(e.target.value)}
                      className="px-1.5 py-1 rounded border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[10px] w-[80px]"
                    >
                      <option value="">变量</option>
                      {selectedPrompt.variables.map((v) => (
                        <option key={v.name} value={v.name}>{v.name}</option>
                      ))}
                    </select>
                    <ArrowRight size={10} className="text-muted shrink-0" />
                    <select
                      value={newMappingValue}
                      onChange={(e) => setNewMappingValue(e.target.value)}
                      className="px-1.5 py-1 rounded border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-[10px] flex-1"
                    >
                      <option value="">上一步输出</option>
                      {prevVariables.map((v) => (
                        <option key={v.name} value={`{{${v.name}}}`}>{`{{${v.name}}}`}</option>
                      ))}
                      <option value="{{output}}">上一步完整输出</option>
                    </select>
                    <button
                      onClick={handleAddMapping}
                      disabled={!newMappingKey || !newMappingValue}
                      className="p-0.5 rounded hover:bg-accent-50 dark:hover:bg-accent-950/30 text-accent-500 disabled:opacity-30"
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ==================== 主组件 ====================

interface PromptChainEditorProps {
  onBack: () => void
}

export function PromptChainEditor({ onBack }: PromptChainEditorProps) {
  const {
    prompts,
    promptChains,
    createPromptChain,
    updatePromptChain,
    deletePromptChain,
  } = useAgentStore()

  const [selectedChain, setSelectedChain] = useState<PromptChain | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = useCallback(() => {
    setSelectedChain(null)
    setIsCreating(true)
  }, [])

  const handleEdit = useCallback((chain: PromptChain) => {
    setSelectedChain(chain)
    setIsCreating(false)
  }, [])

  const handleDelete = useCallback((id: string) => {
    if (confirm('确定删除该提示词链？')) {
      deletePromptChain(id)
      if (selectedChain?.id === id) {
        setSelectedChain(null)
        setIsCreating(false)
      }
    }
  }, [deletePromptChain, selectedChain])

  const handleSave = useCallback(
    (data: Omit<PromptChain, 'id' | 'createdAt' | 'updatedAt'> | (Partial<PromptChain> & { id: string })) => {
      if ('id' in data) {
        updatePromptChain(data as Partial<PromptChain> & { id: string })
        setSelectedChain((prev) => (prev ? { ...prev, ...data } as PromptChain : prev))
      } else {
        const newChain = createPromptChain(data)
        setSelectedChain(newChain)
        setIsCreating(false)
      }
    },
    [createPromptChain, updatePromptChain],
  )

  const handleClose = useCallback(() => {
    setSelectedChain(null)
    setIsCreating(false)
  }, [])

  return (
    <div className="flex h-full">
      {/* 左侧列表 */}
      <div className="w-64 shrink-0 border-r border-surface-200/80 dark:border-surface-700/60 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200/80 dark:border-surface-700/60">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors text-muted"
              title="返回"
            >
              <X size={14} />
            </button>
            <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">提示词链</h3>
          </div>
          <button
            onClick={handleCreate}
            className="p-1.5 rounded-lg hover:bg-accent-50 dark:hover:bg-accent-950/30 text-accent-500 transition-colors"
            title="新建提示词链"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {promptChains.length === 0 ? (
            <div className="text-center py-12 text-muted">
              <Link2 size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-xs">暂无提示词链</p>
              <p className="text-[10px] mt-1">点击 + 创建</p>
            </div>
          ) : (
            promptChains.map((chain) => (
              <div
                key={chain.id}
                onClick={() => handleEdit(chain)}
                className={`group flex items-start gap-2 p-2.5 rounded-lg cursor-pointer transition-colors ${
                  selectedChain?.id === chain.id
                    ? 'bg-accent-50 dark:bg-accent-950/30 border border-accent-200/60 dark:border-accent-800/40'
                    : 'hover:bg-surface-50 dark:hover:bg-surface-800/40'
                }`}
              >
                <Link2 size={14} className="text-accent-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-surface-800 dark:text-surface-200 truncate">
                    {chain.name}
                  </p>
                  <p className="text-[10px] text-muted truncate mt-0.5">
                    {chain.nodes.length} 个节点
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(chain.id)
                  }}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-400 transition-all"
                  title="删除"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右侧编辑器 */}
      <div className="flex-1 min-w-0">
        {isCreating || selectedChain ? (
          <ChainEditorPanel
            chain={selectedChain}
            isNew={isCreating}
            prompts={prompts}
            onSave={handleSave}
            onClose={handleClose}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted">
            <div className="text-center">
              <Link2 size={48} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">选择左侧提示词链进行编辑</p>
              <p className="text-xs mt-1">或点击 + 创建新链</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
