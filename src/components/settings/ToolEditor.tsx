import { useState } from 'react'
import { X, Plus, Edit2, Trash2, Save, Wrench, ToggleLeft, ToggleRight } from 'lucide-react'
import { BUILT_IN_TOOLS } from '../../services/built-in-tools'
import type { Tool, ToolCreateInput } from '../../types'

interface ToolEditorProps {
  onClose: () => void
}

export function ToolEditor({ onClose }: ToolEditorProps) {
  // 自定义工具列表（内置工具固定显示）
  const [customTools, setCustomTools] = useState<Tool[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [editingTool, setEditingTool] = useState<Tool | null>(null)
  const [formData, setFormData] = useState<ToolCreateInput>({
    name: '',
    description: '',
    parameters: { type: 'object', properties: {}, required: [] },
    enabled: true
  })
  // 存储 textarea 的原始文本
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

    // 验证并解析 JSON
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
    // 实时验证
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
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">
            {editingTool ? '编辑工具' : '创建工具'}
          </h2>
          <button
            onClick={() => setIsEditing(false)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">工具名称 *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="my_tool"
              disabled={editingTool?.isBuiltIn}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">描述</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="工具的功能描述"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">参数 Schema (JSON)</label>
            <textarea
              value={parametersJson}
              onChange={(e) => handleJsonChange(e.target.value)}
              rows={10}
              className={`w-full px-3 py-2 text-xs font-mono border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y ${
                jsonError ? 'border-red-500' : ''
              }`}
            />
            {jsonError && (
              <p className="text-xs text-red-500 mt-1">{jsonError}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSave}
            disabled={!formData.name.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors text-sm"
          >
            <Save size={14} /> 保存
          </button>
        </div>
      </div>
    )
  }

  // 列表视图
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold">工具管理</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={handleCreate}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <Plus size={14} /> 新建自定义工具
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {/* 内置工具 */}
        <div className="mb-4">
          <h3 className="text-xs font-medium text-gray-500 mb-2">内置工具</h3>
          <div className="space-y-1">
            {BUILT_IN_TOOLS.map((tool) => (
              <ToolItem
                key={tool.id}
                tool={tool}
                onEdit={() => handleEdit(tool)}
                onToggle={() => {}} // 内置工具不允许切换
                onDelete={() => {}}
                isBuiltIn
              />
            ))}
          </div>
        </div>

        {/* 自定义工具 */}
        {customTools.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-gray-500 mb-2">自定义工具</h3>
            <div className="space-y-1">
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
          <div className="text-center text-gray-400 py-8">
            <Wrench size={36} className="mx-auto mb-3" />
            <p>暂无工具</p>
          </div>
        )}
      </div>
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
    <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <Wrench size={14} className="text-gray-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{tool.name}</span>
        <p className="text-xs text-gray-500 truncate">{tool.description}</p>
      </div>
      {isBuiltIn ? (
        <span className="text-xs text-gray-400">内置</span>
      ) : (
        <div className="flex items-center gap-1">
          <button onClick={onToggle} className="text-gray-500">
            {tool.enabled ? (
              <ToggleRight size={18} className="text-primary-500" />
            ) : (
              <ToggleLeft size={18} />
            )}
          </button>
          <button onClick={onEdit} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
            <Edit2 size={12} />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500">
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
