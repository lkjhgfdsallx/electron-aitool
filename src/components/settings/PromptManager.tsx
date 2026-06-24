import { useState } from 'react'
import {
  X,
  Plus,
  Edit2,
  Trash2,
  Download,
  Upload,
  Save,
  FileText
} from 'lucide-react'
import { useAgentStore } from '../../stores/agent-store'
import type { Prompt, PromptCreateInput } from '../../types'

export function PromptManager() {
  const {
    prompts, createPrompt, updatePrompt, deletePrompt,
    importPrompts, exportPrompts
  } = useAgentStore()

  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null)
  const [promptForm, setPromptForm] = useState<PromptCreateInput>({ name: '', description: '', content: '' })
  const [isEditing, setIsEditing] = useState(false)

  // ==================== 操作 ====================

  const handleCreate = () => {
    setPromptForm({ name: '', description: '', content: '' })
    setEditingPrompt(null)
    setIsEditing(true)
  }

  const handleEdit = (prompt: Prompt) => {
    setPromptForm({ name: prompt.name, description: prompt.description, content: prompt.content })
    setEditingPrompt(prompt)
    setIsEditing(true)
  }

  const handleSave = () => {
    if (!promptForm.name.trim()) return
    if (editingPrompt) {
      updatePrompt({ id: editingPrompt.id, ...promptForm })
    } else {
      createPrompt(promptForm)
    }
    setIsEditing(false)
    setEditingPrompt(null)
  }

  const handleExport = () => {
    const data = exportPrompts()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'prompts.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
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
  }

  // ==================== 编辑表单 ====================

  if (isEditing) {
    return (
      <div className="space-y-6">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
            <FileText size={20} className="text-orange-500" />
            {editingPrompt ? '编辑提示词' : '新建提示词'}
          </h2>
          <button
            onClick={() => setIsEditing(false)}
            className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* 表单卡片 */}
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">名称 *</label>
            <input
              type="text"
              value={promptForm.name}
              onChange={(e) => setPromptForm({ ...promptForm, name: e.target.value })}
              placeholder="我的提示词"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">描述</label>
            <input
              type="text"
              value={promptForm.description}
              onChange={(e) => setPromptForm({ ...promptForm, description: e.target.value })}
              placeholder="提示词的简短描述"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">提示词内容</label>
            <textarea
              value={promptForm.content}
              onChange={(e) => setPromptForm({ ...promptForm, content: e.target.value })}
              placeholder="你是一个有帮助的助手..."
              rows={12}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 resize-y font-mono"
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!promptForm.name.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-accent-500 text-white rounded-xl hover:bg-accent-600 disabled:opacity-50 transition-colors text-sm"
          >
            <Save size={14} /> 保存
          </button>
          <button
            onClick={() => setIsEditing(false)}
            className="px-4 py-2 text-sm text-muted border border-surface-300 dark:border-surface-600 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    )
  }

  // ==================== 列表视图 ====================

  return (
    <div className="space-y-6">
      {/* 标题 + 操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
            <FileText size={20} className="text-orange-500" />
            提示词管理
          </h2>
          <p className="text-sm text-muted mt-1">
            管理可复用的提示词模板，快速应用到 Agent 或对话中
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreate}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-accent-500 text-white rounded-xl hover:bg-accent-600 transition-colors"
          >
            <Plus size={14} /> 新建提示词
          </button>
          <button
            onClick={handleImport}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-surface-300 dark:border-surface-600 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            <Upload size={14} /> 导入
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-surface-300 dark:border-surface-600 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            <Download size={14} /> 导出
          </button>
        </div>
      </div>

      {/* 提示词列表 */}
      {prompts.length === 0 ? (
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-8">
          <div className="text-center text-muted">
            <FileText size={36} className="mx-auto mb-3" />
            <p>暂无提示词</p>
            <p className="text-sm mt-1">点击"新建提示词"创建你的第一个提示词模板</p>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 divide-y divide-surface-200/80 dark:divide-surface-700/60">
          {prompts.map((prompt) => (
            <div
              key={prompt.id}
              className="flex items-center justify-between px-5 py-4 hover:bg-surface-50 dark:hover:bg-surface-900/30 transition-colors"
            >
              <div className="flex-1 min-w-0 mr-4">
                <h3 className="font-medium text-sm text-surface-800 dark:text-surface-200">{prompt.name}</h3>
                {prompt.description && (
                  <p className="text-xs text-muted mt-0.5 truncate">{prompt.description}</p>
                )}
                <p className="text-xs text-muted mt-1 truncate">{prompt.content || '无内容'}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleEdit(prompt)}
                  className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-muted"
                  title="编辑"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => {
                    if (confirm('确定删除此提示词？')) deletePrompt(prompt.id)
                  }}
                  className="p-1.5 rounded-lg hover:bg-danger-50 dark:hover:bg-danger-950/30 text-red-500"
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
