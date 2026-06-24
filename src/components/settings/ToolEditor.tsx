import { useState } from 'react'
import { Plus, Edit2, Trash2, Save, Wrench, ToggleLeft, ToggleRight, X } from 'lucide-react'
import { BUILT_IN_TOOLS } from '../../services/built-in-tools'
import type { Tool, ToolCreateInput } from '../../types'

export function ToolEditor() {
  const [customTools, setCustomTools] = useState<Tool[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [editingTool, setEditingTool] = useState<Tool | null>(null)
  const [formData, setFormData] = useState<ToolCreateInput>({
    name: '',
    description: '',
    parameters: { type: 'object', properties: {}, required: [] },
    enabled: true
  })
  const [parametersJson, setParametersJson] = useState(
    JSON.stringify({ type: 'object', properties: {}, required: [] }, null, 2)
  )
  const [jsonError, setJsonError] = useState('')

  const allTools = [...BUILT_IN_TOOLS, ...customTools]

  const handleCreate = () => {
    const defaultParams = { type: 'object', properties: {}, required: [] }
    setFormData({
      name: '',
      description: '',
      parameters: defaultParams,
      enabled: true
    })
    setParametersJson(JSON.stringify(defaultParams, null, 2))
    setJsonError('')
    setEditingTool(null)
    setIsEditing(true)
  }

  const handleEdit = (tool: Tool) => {
    setFormData({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      enabled: tool.enabled
    })
    setParametersJson(JSON.stringify(tool.parameters, null, 2))
    setJsonError('')
    setEditingTool(tool)
    setIsEditing(true)
  }

  const handleSave = () => {
    if (!formData.name.trim()) return

    let parsedParams: Record<string, unknown>
    try {
      parsedParams = JSON.parse(parametersJson)
      setJsonError('')
    } catch {
      setJsonError('JSON 格式错误，请修正后再保存')
      return
    }

    const finalData: ToolCreateInput = {
      ...formData,
      parameters: parsedParams
    }

    if (editingTool && !editingTool.isBuiltIn) {
      setCustomTools((prev) =>
        prev.map((t) =>
          t.id === editingTool.id ? { ...t, ...finalData } : t
        )
      )
    } else if (!editingTool) {
      const newTool: Tool = {
        ...finalData,
        id: `custom:${finalData.name}`,
        isBuiltIn: false,
        isMCP: false
      }
      setCustomTools((prev) => [...prev, newTool])
    }
    setIsEditing(false)
  }

  const handleDelete = (id: string) => {
    if (confirm('确定删除此工具？')) {
      setCustomTools((prev) => prev.filter((t) => t.id !== id))
    }
  }

  const handleJsonChange = (value: string) => {
    setParametersJson(value)
    try {
      JSON.parse(value)
      setJsonError('')
    } catch {
      setJsonError('JSON 格式错误')
    }
  }

  // 编辑视图
  if (isEditing) {
    return (
      <div className="space-y-6">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
              <Wrench size={20} className="text-indigo-500" />
              {editingTool ? '编辑工具' : '创建工具'}
            </h2>
          </div>
          <button
            onClick={() => setIsEditing(false)}
            className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* 表单 */}
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">工具名称 *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="my_tool"
              disabled={editingTool?.isBuiltIn}
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs text-muted mb-1.5">描述</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="工具的功能描述"
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs text-muted mb-1.5">参数 Schema (JSON)</label>
            <textarea
              value={parametersJson}
              onChange={(e) => handleJsonChange(e.target.value)}
              rows={10}
              className={`w-full px-3 py-2 text-xs font-mono bg-surface-50 dark:bg-surface-900 border rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all resize-y ${
                jsonError ? 'border-danger-400' : 'border-surface-200/80 dark:border-surface-700/60'
              }`}
            />
            {jsonError && (
              <p className="text-xs text-danger-500 mt-1.5">{jsonError}</p>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!formData.name.trim()}
            className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white rounded-xl px-4 py-2 text-sm font-medium transition-all shadow-sm disabled:opacity-50"
          >
            <Save size={14} /> 保存
          </button>
          <button
            onClick={() => setIsEditing(false)}
            className="flex items-center gap-2 bg-surface-200 dark:bg-surface-700 text-muted rounded-xl px-4 py-2 text-sm font-medium transition-all hover:bg-surface-300 dark:hover:bg-surface-600"
          >
            取消
          </button>
        </div>
      </div>
    )
  }

  // 列表视图
  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
            <Wrench size={20} className="text-indigo-500" />
            工具管理
          </h2>
          <p className="text-sm text-muted mt-1">
            管理 AI 可使用的工具，包括内置工具和自定义工具
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
        >
          <Plus size={14} /> 新建自定义工具
        </button>
      </div>

      {/* 内置工具 */}
      <div>
        <h3 className="text-xs font-medium text-muted mb-2">内置工具</h3>
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 divide-y divide-surface-200/80 dark:divide-surface-700/60">
          {BUILT_IN_TOOLS.map((tool) => (
            <ToolItem
              key={tool.id}
              tool={tool}
              onEdit={() => handleEdit(tool)}
              onToggle={() => {}}
              onDelete={() => {}}
              isBuiltIn
            />
          ))}
        </div>
      </div>

      {/* 自定义工具 */}
      {customTools.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted mb-2">自定义工具</h3>
          <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 divide-y divide-surface-200/80 dark:divide-surface-700/60">
            {customTools.map((tool) => (
              <ToolItem
                key={tool.id}
                tool={tool}
                onEdit={() => handleEdit(tool)}
                onToggle={() =>
                  setCustomTools((prev) =>
                    prev.map((t) =>
                      t.id === tool.id ? { ...t, enabled: !t.enabled } : t
                    )
                  )
                }
                onDelete={() => handleDelete(tool.id)}
              />
            ))}
          </div>
        </div>
      )}

      {allTools.length === 0 && (
        <div className="text-center text-muted py-12">
          <Wrench size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无工具</p>
        </div>
      )}
    </div>
  )
}

function ToolItem({
  tool,
  onEdit,
  onToggle,
  onDelete,
  isBuiltIn = false
}: {
  tool: Tool
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
  isBuiltIn?: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
        <Wrench size={14} className="text-indigo-600 dark:text-indigo-400" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-surface-800 dark:text-surface-200">{tool.name}</span>
        <p className="text-xs text-muted truncate">{tool.description}</p>
      </div>
      {isBuiltIn ? (
        <span className="text-[10px] px-1.5 py-0.5 bg-surface-100 dark:bg-surface-800 text-muted rounded-full font-medium">内置</span>
      ) : (
        <div className="flex items-center gap-1">
          <button onClick={onToggle} className="text-muted">
            {tool.enabled ? (
              <ToggleRight size={18} className="text-accent-500" />
            ) : (
              <ToggleLeft size={18} />
            )}
          </button>
          <button onClick={onEdit} className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all">
            <Edit2 size={12} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-muted hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-all">
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
