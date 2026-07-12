import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X,
  Save,
  Trash2,
  Zap,
  Globe,
  FolderOpen,
  File,
  Eye,
  Edit2,
  FileText,
  Upload,
  Download,
  Plus,
  Pencil,
  Check,
} from 'lucide-react'
import type { Skill, SkillCreateInput } from '../../types'
import { MarkdownRenderer } from '../ui/MarkdownRenderer'
import { useSkillStore } from '../../stores/skill-store'
import { SettingsTabs, useConfirmDialog } from './ui'

// ==================== 类型定义 ====================

type EditorTab = 'content' | 'resources'

interface SkillEditorProps {
  skill: Skill | null
  isCreating: boolean
  viewOnly?: boolean
  workspaceId?: string
  onSave: (data: SkillCreateInput | { dirPath: string; name?: string; description?: string; content?: string }) => void
  onClose: () => void
  onDelete: (dirPath: string) => void
  onEnterEdit?: () => void
}

const TAB_LIST: { key: EditorTab; label: string; icon: typeof FileText }[] = [
  { key: 'content', label: '指令内容', icon: FileText },
  { key: 'resources', label: '资源文件', icon: File },
]

// ==================== 资源文件预览/编辑子组件 ====================

interface ResourceFileViewerProps {
  skillId: string
  filePath: string
  onClose: () => void
  viewOnly: boolean
}

function ResourceFileViewer({ skillId, filePath, onClose, viewOnly }: ResourceFileViewerProps) {
  const { readResourceFile, writeResourceFile, deleteResourceFile } = useSkillStore()
  const { confirm, Dialog } = useConfirmDialog()
  const [content, setContent] = useState<string>('')
  const [encoding, setEncoding] = useState<'text' | 'base64'>('text')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  const isBinary = encoding === 'base64'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const data = await readResourceFile(skillId, filePath)
      if (!cancelled && data) {
        setContent(data.content || '')
        setEncoding((data.encoding as 'text' | 'base64') || 'text')
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [skillId, filePath, readResourceFile])

  const handleSave = async () => {
    setSaving(true)
    await writeResourceFile(skillId, filePath, editContent, 'text')
    setContent(editContent)
    setEditing(false)
    setSaving(false)
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: '删除资源文件',
      message: `确定删除资源文件 "${filePath}"？`,
      confirmLabel: '删除',
      variant: 'danger',
    })
    if (!ok) return
    await deleteResourceFile(skillId, filePath)
    onClose()
  }

  const handleDownload = () => {
    if (isBinary) {
      const byteString = atob(content)
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i)
      }
      const blob = new Blob([ab])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filePath.split('/').pop() || 'file'
      a.click()
      URL.revokeObjectURL(url)
    } else {
      const blob = new Blob([content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filePath.split('/').pop() || 'file'
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-surface-400 text-sm">
        加载中...
      </div>
    )
  }

  return (
    <div className="border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
      {/* 文件头 */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
        <div className="flex items-center gap-2 min-w-0">
          <File size={12} className="text-surface-400 flex-shrink-0" />
          <span className="text-xs font-mono text-surface-600 dark:text-surface-300 truncate">{filePath}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-200 dark:bg-surface-700 text-surface-500 flex-shrink-0">
            {isBinary ? 'binary' : 'text'}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <button
            onClick={handleDownload}
            className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
            title="下载"
          >
            <Download size={12} />
          </button>
          {!viewOnly && !isBinary && (
            <button
              onClick={() => { setEditing(!editing); setEditContent(content) }}
              className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-400 hover:text-accent-500 transition-colors"
              title={editing ? '取消编辑' : '编辑'}
            >
              <Pencil size={12} />
            </button>
          )}
          {!viewOnly && (
            <button
              onClick={handleDelete}
              className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-surface-400 hover:text-red-500 transition-colors"
              title="删除"
            >
              <Trash2 size={12} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* 文件内容 */}
      <div className="max-h-[300px] overflow-auto">
        {isBinary ? (
          <div className="flex items-center justify-center py-6 text-surface-400 text-xs">
            <File size={16} className="mr-2 opacity-40" />
            二进制文件，无法在编辑器中显示
          </div>
        ) : editing ? (
          <div className="p-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full min-h-[200px] max-h-[280px] px-2 py-1.5 rounded border border-surface-300 dark:border-surface-600 text-xs font-mono bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-accent-500/40 resize-y"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setEditing(false)}
                className="px-2 py-1 rounded text-xs text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-accent-500 hover:bg-accent-600 text-white disabled:opacity-50 transition-colors"
              >
                {saving ? '保存中...' : <><Check size={10} /> 保存</>}
              </button>
            </div>
          </div>
        ) : (
          <pre className="px-3 py-2 text-xs font-mono text-surface-700 dark:text-surface-300 whitespace-pre-wrap break-all leading-relaxed">
            {content || '(空文件)'}
          </pre>
        )}
      </div>
      <Dialog />
    </div>
  )
}

// ==================== 主组件 ====================

export function SkillEditor({
  skill,
  isCreating,
  viewOnly = false,
  workspaceId,
  onSave,
  onClose,
  onDelete,
  onEnterEdit,
}: SkillEditorProps) {
  // ==================== 表单状态 ====================
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [location, setLocation] = useState<'global' | 'project'>('global')
  const [preview, setPreview] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [resourceFiles, setResourceFiles] = useState<string[]>([])

  // ==================== 标签页 ====================
  const [activeTab, setActiveTab] = useState<EditorTab>('content')

  // ==================== 资源文件查看 ====================
  const [viewingFile, setViewingFile] = useState<string | null>(null)

  // ==================== 资源文件上传 ====================
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { writeResourceFile } = useSkillStore()
  const { confirm: confirmDelete, Dialog: DeleteDialog } = useConfirmDialog()

  const handleDeleteSkill = async () => {
    if (!skill) return
    const ok = await confirmDelete({
      title: '删除 Skill',
      message: '确定删除此 Skill？\n此操作会删除整个目录，不可恢复。',
      confirmLabel: '删除',
      variant: 'danger',
    })
    if (ok) {
      onDelete(skill.dirPath)
    }
  }

  // 从 skill 初始化表单
  useEffect(() => {
    if (skill) {
      setName(skill.name)
      setDescription(skill.description)
      setContent(skill.content)
      setLocation(skill.location)
      setResourceFiles(skill.resourceFiles)
    } else {
      setName('')
      setDescription('')
      setContent('')
      setLocation('global')
      setResourceFiles([])
    }
    setErrors({})
    setPreview(false)
    setViewingFile(null)
    setActiveTab('content')
  }, [skill])

  // ==================== 校验 ====================
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!name.trim()) {
      newErrors.name = '名称不能为空'
    } else if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name.trim())) {
      newErrors.name = '名称只能包含小写字母、数字和连字符，且不能以连字符开头或结尾'
    } else if (name.trim().length > 64) {
      newErrors.name = '名称不能超过 64 个字符'
    }
    if (!description.trim()) {
      newErrors.description = '描述不能为空'
    } else if (description.trim().length > 1024) {
      newErrors.description = '描述不能超过 1024 个字符'
    }
    if (!content.trim()) {
      newErrors.content = '指令内容不能为空'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // ==================== 操作 ====================
  const handleSave = () => {
    if (!validate()) return
    if (isCreating) {
      onSave({
        name: name.trim(),
        description: description.trim(),
        content: content.trim(),
        location,
        projectWorkspaceId: location === 'project' ? workspaceId : undefined,
      })
    } else {
      onSave({
        dirPath: skill!.dirPath,
        name: name.trim(),
        description: description.trim(),
        content: content.trim(),
      })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
  }

  // ==================== 资源文件上传 ====================
  const handleUploadResource = useCallback(async () => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || !skill) return

    for (const file of Array.from(files)) {
      const reader = new FileReader()
      const isText = /\.(md|txt|json|yaml|yml|toml|js|ts|py|sh|bat|ps1|html|css|xml|csv|env)$/i.test(file.name)

      reader.onload = async () => {
        const result = reader.result
        if (!result) return

        if (isText && typeof result === 'string') {
          await writeResourceFile(skill.id || skill.dirPath, file.name, result, 'text')
        } else {
          // base64
          const base64 = (result as string).split(',')[1] || ''
          await writeResourceFile(skill.id || skill.dirPath, file.name, base64, 'base64')
        }

        // 刷新资源文件列表
        const updated = useSkillStore.getState().skills.find((s) => s.id === skill.id || s.dirPath === skill.dirPath)
        if (updated) {
          setResourceFiles(updated.resourceFiles)
        }
      }

      if (isText) {
        reader.readAsText(file)
      } else {
        reader.readAsDataURL(file)
      }
    }

    // 清空 input
    e.target.value = ''
  }, [skill, writeResourceFile])

  // ==================== 查看模式渲染 ====================
  if (viewOnly && skill) {
    return (
      <div className="flex flex-col h-full animate-fade-in">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200/80 dark:border-surface-700/60 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-accent-500" />
            <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-100">
              {skill.name}
            </h2>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              skill.enabled
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'bg-surface-200 dark:bg-surface-700 text-surface-500'
            }`}>
              {skill.enabled ? '已启用' : '已禁用'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onEnterEdit && (
              <button
                onClick={onEnterEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-accent-500 hover:bg-accent-600 text-white shadow-sm transition-all"
              >
                <Edit2 size={14} />
                编辑
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted hover:text-surface-600 dark:hover:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-700/60 transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 标签页导航 */}
        <div className="px-6 pt-3 flex-shrink-0">
          <SettingsTabs
            variant="underline"
            activeTab={activeTab}
            onTabChange={(key) => setActiveTab(key as EditorTab)}
            tabs={TAB_LIST.map(({ key, label, icon }) => ({ key, label, icon }))}
          />
        </div>

        {/* 标签页内容 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* 指令内容 */}
          {activeTab === 'content' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">描述</label>
                <p className="text-sm text-surface-700 dark:text-surface-200">{skill.description || '无描述'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-2">指令内容</label>
                <div className="rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4 max-h-[500px] overflow-y-auto">
                  <MarkdownRenderer content={skill.content} />
                </div>
              </div>
            </div>
          )}

          {/* 资源文件 */}
          {activeTab === 'resources' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-surface-500 dark:text-surface-400">
                  资源文件 ({resourceFiles.length})
                </label>
              </div>

              {viewingFile && skill && (
                <ResourceFileViewer
                  skillId={skill.id || skill.dirPath}
                  filePath={viewingFile}
                  onClose={() => setViewingFile(null)}
                  viewOnly
                />
              )}

              {resourceFiles.length > 0 ? (
                <div className="space-y-1">
                  {resourceFiles.map((f) => (
                    <div
                      key={f}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-700/50 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors cursor-pointer group"
                      onClick={() => setViewingFile(f)}
                    >
                      <File size={12} className="text-surface-400 flex-shrink-0" />
                      <span className="font-mono text-xs text-surface-600 dark:text-surface-300 truncate flex-1">
                        {f}
                      </span>
                      <Eye size={12} className="text-surface-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-surface-400 py-4 text-center">此 Skill 没有资源文件</p>
              )}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-200/80 dark:border-surface-700/60 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-700/60 transition-all"
          >
            关闭
          </button>
        </div>
      </div>
    )
  }

  // ==================== 编辑/创建模式渲染 ====================
  return (
    <div
      className="flex flex-col h-full animate-fade-in"
      onKeyDown={handleKeyDown}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200/80 dark:border-surface-700/60 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-accent-500" />
          <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-100">
            {isCreating ? '新建 Skill' : `编辑 — ${skill?.name}`}
          </h2>
          {!isCreating && skill && (
            <span className="text-xs text-surface-400 font-mono ml-2">
              {skill.dirPath}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isCreating && skill && (
            <button
              onClick={handleDeleteSkill}
              className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
              title="删除"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-surface-600 dark:hover:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-700/60 transition-all"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 标签页导航 */}
      <div className="px-6 pt-3 flex-shrink-0">
        <SettingsTabs
          variant="underline"
          activeTab={activeTab}
          onTabChange={(key) => setActiveTab(key as EditorTab)}
          tabs={TAB_LIST.map(({ key, label, icon }) => ({ key, label, icon }))}
        />
      </div>

      {/* 标签页内容 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {/* ---- 指令内容标签 ---- */}
        {activeTab === 'content' && (
          <>
            {/* 名称 */}
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="pdf-processing"
                disabled={!isCreating}
                className={`w-full px-3 py-2 rounded-lg border text-sm font-mono bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-all ${
                  !isCreating ? 'opacity-60 cursor-not-allowed' : ''
                } ${
                  errors.name
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-surface-300 dark:border-surface-600'
                }`}
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-500">{errors.name}</p>
              )}
              <p className="mt-1 text-[10px] text-surface-400">
                小写字母、数字和连字符，将成为目录名
              </p>
            </div>

            {/* 描述 */}
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                描述 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="提取 PDF 文件中的文本和表格数据"
                className={`w-full px-3 py-2 rounded-lg border text-sm bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-all ${
                  errors.description
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-surface-300 dark:border-surface-600'
                }`}
              />
              {errors.description && (
                <p className="mt-1 text-xs text-red-500">{errors.description}</p>
              )}
            </div>

            {/* 指令内容 */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                  指令内容 <span className="text-red-500">*</span>
                </label>
                <button
                  onClick={() => setPreview(!preview)}
                  className="flex items-center gap-1 text-xs text-surface-500 hover:text-accent-500 transition-colors"
                >
                  <Eye size={12} />
                  {preview ? '编辑' : '预览'}
                </button>
              </div>

              {preview ? (
                <div className="min-h-[300px] max-h-[500px] overflow-y-auto rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 p-4">
                  <MarkdownRenderer content={content} />
                </div>
              ) : (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="# 技能标题&#10;&#10;详细的指令内容...&#10;&#10;## 步骤&#10;1. 首先执行...&#10;2. 然后执行..."
                  className={`w-full min-h-[300px] max-h-[500px] px-3 py-2 rounded-lg border text-sm font-mono bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 resize-y transition-all ${
                    errors.content
                      ? 'border-red-400 dark:border-red-500'
                      : 'border-surface-300 dark:border-surface-600'
                  }`}
                />
              )}
              {errors.content && (
                <p className="mt-1 text-xs text-red-500">{errors.content}</p>
              )}
            </div>
          </>
        )}

        {/* ---- 资源文件标签 ---- */}
        {activeTab === 'resources' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
                资源文件 ({resourceFiles.length})
              </label>
              {!isCreating && skill && (
                <button
                  onClick={handleUploadResource}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-surface-600 dark:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-700/60 border border-surface-300 dark:border-surface-600 transition-all"
                >
                  <Plus size={12} />
                  添加文件
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />

            {/* 资源文件查看器 */}
            {viewingFile && skill && (
              <ResourceFileViewer
                skillId={skill.id || skill.dirPath}
                filePath={viewingFile}
                onClose={() => setViewingFile(null)}
                viewOnly={false}
              />
            )}

            {isCreating ? (
              <div className="text-center py-8 text-xs text-surface-400">
                <Upload size={24} className="mx-auto mb-2 opacity-30" />
                创建 Skill 后可添加资源文件
              </div>
            ) : resourceFiles.length > 0 ? (
              <div className="space-y-1">
                {resourceFiles.map((f) => (
                  <div
                    key={f}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer group ${
                      viewingFile === f
                        ? 'bg-accent-50 dark:bg-accent-900/10 border border-accent-200 dark:border-accent-800/40'
                        : 'bg-surface-50 dark:bg-surface-700/50 hover:bg-surface-100 dark:hover:bg-surface-700'
                    }`}
                    onClick={() => setViewingFile(viewingFile === f ? null : f)}
                  >
                    <File size={12} className="text-surface-400 flex-shrink-0" />
                    <span className="font-mono text-xs text-surface-600 dark:text-surface-300 truncate flex-1">
                      {f}
                    </span>
                    <Eye size={12} className="text-surface-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-surface-400 py-4 text-center">此 Skill 没有资源文件，点击上方按钮添加</p>
            )}
          </div>
        )}

      </div>

      {/* 底部操作栏 */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-200/80 dark:border-surface-700/60 flex-shrink-0">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-700/60 transition-all"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-accent-500 hover:bg-accent-600 text-white shadow-sm transition-all"
        >
          <Save size={14} />
          {isCreating ? '创建' : '保存'}
        </button>
      </div>
      <DeleteDialog />
    </div>
  )
}
