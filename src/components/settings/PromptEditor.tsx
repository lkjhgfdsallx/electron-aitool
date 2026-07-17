import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  X,
  Save,
  Star,
  Pin,
  Trash2,
  Copy,
  FlaskConical,
  GitBranch,
  Tag,
  Plus,
  ChevronDown,
  ChevronRight,
  Variable,
  Layers,
  FileText,
  Type,
  ToggleLeft,
  Hash,
  List,
  AlignLeft,
  Settings,
  Bot,
} from 'lucide-react'
import { PromptVariableEngine } from '../../services/prompt-variable-engine'
import type {
  Prompt,
  PromptCreateInput,
  PromptVariable,
  PromptVariableType,
  PromptSection,
  PromptSectionType,
} from '../../types'
import { SECTION_TYPE_META } from '../../types'
import { SettingsTabs, SettingsEmptyState } from './ui'
import { useAppTranslation } from '@/i18n/hooks'

interface PromptEditorProps {
  prompt: Prompt | null
  isCreating: boolean
  onSave: (data: PromptCreateInput | (Partial<Prompt> & { id: string })) => void
  onClose: () => void
  onOpenPlayground: () => void
  onOpenVersions: () => void
  onDelete: (id: string) => void
  onDuplicate: (prompt: Prompt) => void
  onToggleFavorite: (id: string) => void
  onTogglePinned: (id: string) => void
  onConvertToAgent?: (prompt: Prompt) => void
}

type EditorTab = 'content' | 'variables' | 'structured'

export function PromptEditor({
  prompt,
  isCreating,
  onSave,
  onClose,
  onOpenPlayground,
  onOpenVersions,
  onDelete,
  onDuplicate,
  onToggleFavorite,
  onTogglePinned,
  onConvertToAgent,
}: PromptEditorProps) {
  const { t } = useAppTranslation()

  // ==================== 表单状态 ====================
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [variables, setVariables] = useState<PromptVariable[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [sections, setSections] = useState<PromptSection[]>([])
  const [activeTab, setActiveTab] = useState<EditorTab>('content')
  const [useStructured, setUseStructured] = useState(false)

  // 变量编辑
  const [editingVariable, setEditingVariable] = useState<PromptVariable | null>(null)
  const [showVariableForm, setShowVariableForm] = useState(false)

  // 自动补全
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteItems, setAutocompleteItems] = useState<
    Array<{ name: string; label: string; type: string; isBuiltin: boolean }>
  >([])
  const [autocompleteIndex, setAutocompleteIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ==================== 初始化 ====================
  useEffect(() => {
    if (prompt && !isCreating) {
      setName(prompt.name)
      setDescription(prompt.description)
      setContent(prompt.content)
      setVariables(prompt.variables || [])
      setTags(prompt.tags || [])
      setSections(prompt.sections || [])
      setUseStructured(!!prompt.sections && prompt.sections.length > 0)
    } else {
      setName('')
      setDescription('')
      setContent('')
      setVariables([])
      setTags([])
      setSections([])
      setUseStructured(false)
    }
  }, [prompt, isCreating])

  // ==================== 变量同步 ====================
  const syncedVariables = useMemo(() => {
    const text = useStructured
      ? sections.map((s) => s.content).join('\n')
      : content
    return PromptVariableEngine.syncVariables(text, variables)
  }, [content, variables, sections, useStructured])

  // ==================== 保存 ====================
  const handleSave = useCallback(() => {
    if (!name.trim()) return

    const data = {
      name: name.trim(),
      description: description.trim(),
      content,
      variables: syncedVariables,
      tags,
      sections: useStructured ? sections : undefined,
      favorite: prompt?.favorite ?? false,
      pinned: prompt?.pinned ?? false,
    }

    if (isCreating) {
      onSave(data as PromptCreateInput)
    } else if (prompt) {
      onSave({ ...data, id: prompt.id } as Partial<Prompt> & { id: string })
    }
  }, [name, description, content, syncedVariables, tags, sections, useStructured, isCreating, prompt, onSave])

  // ==================== 标签操作 ====================
  const handleAddTag = useCallback(() => {
    const tag = tagInput.trim()
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
      setTagInput('')
    }
  }, [tagInput, tags])

  const handleRemoveTag = useCallback(
    (tag: string) => {
      setTags(tags.filter((t) => t !== tag))
    },
    [tags],
  )

  // ==================== 变量操作 ====================
  const handleAddVariable = useCallback(() => {
    setEditingVariable({
      name: '',
      label: '',
      type: 'string',
      required: false,
      placeholder: '',
    })
    setShowVariableForm(true)
  }, [])

  const handleSaveVariable = useCallback(
    (v: PromptVariable) => {
      const exists = variables.find((x) => x.name === v.name)
      if (exists) {
        setVariables(variables.map((x) => (x.name === v.name ? v : x)))
      } else {
        setVariables([...variables, v])
      }
      setShowVariableForm(false)
      setEditingVariable(null)
    },
    [variables],
  )

  const handleRemoveVariable = useCallback(
    (name: string) => {
      setVariables(variables.filter((v) => v.name !== name))
    },
    [variables],
  )

  // ==================== 结构化段落操作 ====================
  const handleAddSection = useCallback(
    (type: PromptSectionType) => {
      const meta = SECTION_TYPE_META[type]
      const newSection: PromptSection = {
        id: `section-${Date.now()}`,
        type,
        title: meta.label,
        content: '',
        enabled: true,
        order: sections.length,
      }
      setSections([...sections, newSection])
    },
    [sections],
  )

  const handleUpdateSection = useCallback(
    (id: string, updates: Partial<PromptSection>) => {
      setSections(sections.map((s) => (s.id === id ? { ...s, ...updates } : s)))
    },
    [sections],
  )

  const handleRemoveSection = useCallback(
    (id: string) => {
      setSections(sections.filter((s) => s.id !== id))
    },
    [sections],
  )

  // ==================== 内容编辑中的变量自动补全 ====================
  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent)

      // 检测 {{ 触发自动补全
      const textarea = textareaRef.current
      if (textarea) {
        const cursorPos = textarea.selectionStart
        const textBefore = newContent.slice(0, cursorPos)
        const match = textBefore.match(/\{\{(\w*)$/)

        if (match) {
          const suggestions = PromptVariableEngine.getAutocompleteSuggestions(
            newContent,
            syncedVariables,
            textBefore,
          )
          if (suggestions.length > 0) {
            setAutocompleteItems(suggestions)
            setAutocompleteIndex(0)
            setShowAutocomplete(true)
          } else {
            setShowAutocomplete(false)
          }
        } else {
          setShowAutocomplete(false)
        }
      }
    },
    [syncedVariables],
  )

  const handleInsertVariable = useCallback(
    (varName: string) => {
      const textarea = textareaRef.current
      if (!textarea) return

      const cursorPos = textarea.selectionStart
      const textBefore = content.slice(0, cursorPos)
      const textAfter = content.slice(cursorPos)

      // 找到 {{ 的位置
      const match = textBefore.match(/\{\{\w*$/)
      if (!match) return

      const beforeMatch = textBefore.slice(0, match.index)
      const newContent = `${beforeMatch}{{${varName}}}${textAfter}`
      setContent(newContent)
      setShowAutocomplete(false)

      // 重新聚焦
      setTimeout(() => {
        const newPos = (match.index ?? 0) + varName.length + 4
        textarea.focus()
        textarea.setSelectionRange(newPos, newPos)
      }, 0)
    },
    [content],
  )

  // ==================== 快捷键 ====================
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showAutocomplete) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setAutocompleteIndex((i) => Math.min(i + 1, autocompleteItems.length - 1))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setAutocompleteIndex((i) => Math.max(i - 1, 0))
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          handleInsertVariable(autocompleteItems[autocompleteIndex].name)
        } else if (e.key === 'Escape') {
          setShowAutocomplete(false)
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    },
    [showAutocomplete, autocompleteItems, autocompleteIndex, handleInsertVariable, handleSave],
  )

  // ==================== 渲染 ====================
  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown}>
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-surface-200/80 dark:border-surface-700/60 bg-white/80 dark:bg-surface-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">
            {isCreating ? t('prompt.newPrompt') : t('prompt.editPrompt')}
          </h3>
          {prompt && !isCreating && (
            <span className="text-xs text-muted">v{prompt.currentVersion}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {prompt && !isCreating && (
            <>
              <button
                onClick={() => onToggleFavorite(prompt.id)}
                className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                title={prompt.favorite ? t('prompt.removeFavorite') : t('prompt.addFavorite')}
              >
                <Star
                  size={14}
                  className={prompt.favorite ? 'text-amber-400 fill-amber-400' : 'text-muted'}
                />
              </button>
              <button
                onClick={() => onTogglePinned(prompt.id)}
                className={`p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors ${
                  prompt.pinned ? 'text-accent-500' : 'text-muted'
                }`}
                title={prompt.pinned ? t('prompt.unpin') : t('prompt.pin')}
              >
                <Pin size={14} />
              </button>
              <button
                onClick={onOpenPlayground}
                className="p-1.5 rounded-lg text-muted hover:text-accent-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                title={t('prompt.playgroundTest')}
              >
                <FlaskConical size={14} />
              </button>
              <button
                onClick={onOpenVersions}
                className="p-1.5 rounded-lg text-muted hover:text-accent-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                title={t('prompt.versionHistory')}
              >
                <GitBranch size={14} />
              </button>
              <button
                onClick={() => onDuplicate(prompt)}
                className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                title={t('prompt.duplicate')}
              >
                <Copy size={14} />
              </button>
              <button
                onClick={() => onDelete(prompt.id)}
                className="p-1.5 rounded-lg text-red-500 hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-colors"
                title={t('common.delete')}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* 基本信息 */}
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-4 space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">{t('prompt.nameRequired')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('prompt.namePlaceholder')}
              className="w-full px-3 py-1.5 text-sm border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">{t('common.description')}</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('prompt.descriptionPlaceholder')}
              className="w-full px-3 py-1.5 text-sm border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400"
            />
          </div>

          {/* 标签 */}
          <div>
            <label className="block text-xs text-muted mb-1">
              <Tag size={12} className="inline mr-1" />
              {t('prompt.tags')}
            </label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-accent-50 dark:bg-accent-950/30 text-accent-600 dark:text-accent-400 rounded-full"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-accent-800 dark:hover:text-accent-200"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddTag()
                  }
                }}
                placeholder={t('prompt.tagInputPlaceholder')}
                className="flex-1 px-3 py-1 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400"
              />
              <button
                onClick={handleAddTag}
                disabled={!tagInput.trim()}
                className="px-2 py-1 text-xs bg-surface-100 dark:bg-surface-800 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 disabled:opacity-50 transition-colors"
              >
                {t('common.add')}
              </button>
            </div>
          </div>
        </div>

        {/* 编辑模式切换 */}
        <div className="flex items-center gap-2">
          <SettingsTabs
            activeTab={activeTab}
            onTabChange={(key) => setActiveTab(key as EditorTab)}
            tabs={[
              { key: 'content', label: t('prompt.contentEditor'), icon: FileText },
              { key: 'variables', label: t('prompt.variableManagement'), icon: Variable, badge: syncedVariables.length > 0 ? syncedVariables.length : undefined },
            ]}
          />
          <div className="flex-1" />
          <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={useStructured}
              onChange={(e) => setUseStructured(e.target.checked)}
              className="rounded border-surface-300 dark:border-surface-600"
            />
            {t('prompt.structuredEditing')}
          </label>
        </div>

        {/* 内容编辑区 */}
        {activeTab === 'content' && (
          <div className="relative">
            {useStructured ? (
              /* 结构化编辑模式 */
              <div className="space-y-3">
                {sections.map((section) => (
                  <StructuredSection
                    key={section.id}
                    section={section}
                    onUpdate={(updates) => handleUpdateSection(section.id, updates)}
                    onRemove={() => handleRemoveSection(section.id)}
                  />
                ))}
                {/* 添加段落 */}
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(SECTION_TYPE_META) as PromptSectionType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => handleAddSection(type)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-dashed border-surface-300 dark:border-surface-600 rounded-lg text-muted hover:text-accent-500 hover:border-accent-300 dark:hover:border-accent-600 transition-colors"
                    >
                      <span>{SECTION_TYPE_META[type].icon}</span>
                      {SECTION_TYPE_META[type].label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* 简单编辑模式 */
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder={t('prompt.contentPlaceholder')}
                  rows={14}
                  className="w-full px-4 py-3 text-sm border rounded-xl bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 resize-y font-mono leading-relaxed"
                />
                {/* 变量自动补全 */}
                {showAutocomplete && (
                  <div className="absolute left-4 top-full z-20 mt-1 bg-white dark:bg-surface-800 border border-surface-200/80 dark:border-surface-700/60 rounded-xl shadow-lg py-1 min-w-[220px] max-h-[200px] overflow-y-auto">
                    {autocompleteItems.map((item, idx) => (
                      <button
                        key={item.name}
                        onClick={() => handleInsertVariable(item.name)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                          idx === autocompleteIndex
                            ? 'bg-accent-50 dark:bg-accent-950/30 text-accent-700 dark:text-accent-300'
                            : 'text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700'
                        }`}
                      >
                        <Variable size={12} className="flex-shrink-0 text-muted" />
                        <span className="font-mono font-medium">{item.name}</span>
                        <span className="text-muted truncate">{item.label}</span>
                        {item.isBuiltin && (
                          <span className="px-1 py-0 text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded ml-auto flex-shrink-0">
                            {t('prompt.builtIn')}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 变量管理区 */}
        {activeTab === 'variables' && (
          <div className="space-y-3">
            {/* 内置变量说明 */}
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/30 rounded-xl p-3">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1.5">
                {t('prompt.builtInVariablesDescription')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {['current_date', 'current_time', 'current_datetime', 'active_agent_name', 'default_model'].map(
                  (v) => (
                    <span
                      key={v}
                      className="px-2 py-0.5 text-[10px] font-mono bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded"
                    >
                      {`{{${v}}}`}
                    </span>
                  ),
                )}
              </div>
            </div>

            {/* 用户变量列表 */}
            {syncedVariables.length === 0 ? (
              <SettingsEmptyState
                icon={Variable}
                title={t('prompt.noCustomVariables')}
                description={t('prompt.noCustomVariablesHint')}
                iconSize={32}
              />
            ) : (
              <div className="space-y-2">
                {syncedVariables.map((v) => (
                  <VariableItem
                    key={v.name}
                    variable={v}
                    onEdit={() => {
                      setEditingVariable(v)
                      setShowVariableForm(true)
                    }}
                    onRemove={() => handleRemoveVariable(v.name)}
                  />
                ))}
              </div>
            )}

            <button
              onClick={handleAddVariable}
              className="flex items-center gap-1.5 px-3 py-2 text-xs border border-dashed border-surface-300 dark:border-surface-600 rounded-lg text-muted hover:text-accent-500 hover:border-accent-300 transition-colors w-full justify-center"
            >
              <Plus size={13} /> {t('prompt.addVariable')}
            </button>

            {/* 变量编辑表单 */}
            {showVariableForm && editingVariable && (
              <VariableEditForm
                variable={editingVariable}
                existingNames={syncedVariables.map((v) => v.name)}
                onSave={handleSaveVariable}
                onCancel={() => {
                  setShowVariableForm(false)
                  setEditingVariable(null)
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="flex items-center gap-3 px-6 py-3 border-t border-surface-200/80 dark:border-surface-700/60 bg-white/80 dark:bg-surface-900/80 backdrop-blur-sm">
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-accent-500 text-white rounded-xl hover:bg-accent-600 disabled:opacity-50 transition-colors text-sm"
        >
          <Save size={14} /> {t('common.save')}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-sm text-muted border border-surface-300 dark:border-surface-600 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        >
          {t('common.cancel')}
        </button>
        <div className="flex-1" />
        <span className="text-xs text-muted">{t('prompt.saveShortcut')}</span>
      </div>
    </div>
  )
}

// ==================== 子组件 ====================

/** 结构化段落卡片 */
function StructuredSection({
  section,
  onUpdate,
  onRemove,
}: {
  section: PromptSection
  onUpdate: (updates: Partial<PromptSection>) => void
  onRemove: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const meta = SECTION_TYPE_META[section.type]
  const { t } = useAppTranslation()

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-colors ${
        section.enabled
          ? 'border-surface-200/80 dark:border-surface-700/60 bg-white dark:bg-surface-800/60'
          : 'border-surface-200/40 dark:border-surface-700/30 bg-surface-50 dark:bg-surface-900/40 opacity-60'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-50 dark:bg-surface-900/50">
        <button onClick={() => setCollapsed(!collapsed)} className="text-muted">
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className="text-sm">{meta.icon}</span>
        <input
          type="text"
          value={section.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          className="flex-1 text-xs font-medium bg-transparent border-none outline-none text-surface-800 dark:text-surface-200"
        />
        <button
          onClick={() => onUpdate({ enabled: !section.enabled })}
          className={`p-1 rounded ${section.enabled ? 'text-accent-500' : 'text-muted'}`}
          title={section.enabled ? t('prompt.disableSection') : t('prompt.enableSection')}
        >
          <ToggleLeft size={14} />
        </button>
        <button onClick={onRemove} className="p-1 rounded text-red-500 hover:bg-danger-50 dark:hover:bg-danger-950/30">
          <X size={14} />
        </button>
      </div>
      {!collapsed && (
        <div className="p-3">
          <textarea
            value={section.content}
            onChange={(e) => onUpdate({ content: e.target.value })}
            placeholder={meta.placeholder}
            rows={4}
            className="w-full px-3 py-2 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 resize-y font-mono"
          />
        </div>
      )}
    </div>
  )
}

/** 变量列表项 */
function VariableItem({
  variable,
  onEdit,
  onRemove,
}: {
  variable: PromptVariable
  onEdit: () => void
  onRemove: () => void
}) {
  const typeIcons: Record<PromptVariableType, typeof Type> = {
    string: Type,
    number: Hash,
    boolean: ToggleLeft,
    select: List,
    textarea: AlignLeft,
  }
  const Icon = typeIcons[variable.type] || Type
  const { t } = useAppTranslation()

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-surface-800/60 border border-surface-200/80 dark:border-surface-700/60 rounded-xl">
      <Icon size={14} className="text-muted flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-medium text-surface-800 dark:text-surface-200">
            {variable.name}
          </span>
          <span className="text-[10px] px-1.5 py-0 bg-surface-100 dark:bg-surface-800 text-muted rounded">
            {variable.type}
          </span>
          {variable.required && (
            <span className="text-[10px] px-1.5 py-0 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">
              {t('prompt.required')}
            </span>
          )}
        </div>
        {(variable.label !== variable.name || variable.placeholder) && (
          <p className="text-[10px] text-muted mt-0.5 truncate">
            {variable.label !== variable.name ? variable.label : variable.placeholder}
          </p>
        )}
      </div>
      <button onClick={onEdit} className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-muted">
        <Settings size={12} />
      </button>
      <button onClick={onRemove} className="p-1 rounded hover:bg-danger-50 dark:hover:bg-danger-950/30 text-red-500">
        <X size={12} />
      </button>
    </div>
  )
}

/** 变量编辑表单 */
function VariableEditForm({
  variable,
  existingNames,
  onSave,
  onCancel,
}: {
  variable: PromptVariable
  existingNames: string[]
  onSave: (v: PromptVariable) => void
  onCancel: () => void
}) {
  const { t } = useAppTranslation()
  const [form, setForm] = useState<PromptVariable>({ ...variable })
  const [optionsText, setOptionsText] = useState(
    variable.options?.map((o) => `${o.label}=${o.value}`).join('\n') ?? '',
  )

  const isValid =
    form.name.trim() &&
    /^[a-zA-Z_]\w*$/.test(form.name) &&
    (!existingNames.includes(form.name) || form.name === variable.name)

  const handleSave = () => {
    const opts =
      form.type === 'select'
        ? optionsText
            .split('\n')
            .filter((l) => l.trim())
            .map((l) => {
              const [label, value] = l.split('=')
              return { label: (label ?? '').trim(), value: (value ?? label ?? '').trim() }
            })
        : undefined
    onSave({ ...form, options: opts })
  }

  return (
    <div className="bg-white dark:bg-surface-800/60 border border-accent-200 dark:border-accent-800/40 rounded-xl p-4 space-y-3">
      <h4 className="text-xs font-medium text-surface-800 dark:text-surface-200">
        {variable.name ? t('prompt.editVariable') : t('prompt.newVariable')}
      </h4>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] text-muted mb-1">{t('prompt.variableNameRequired')}</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="variable_name"
            className="w-full px-2.5 py-1 text-xs font-mono border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted mb-1">{t('prompt.displayLabel')}</label>
          <input
            type="text"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder={t('prompt.variableLabelPlaceholder')}
            className="w-full px-2.5 py-1 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] text-muted mb-1">{t('prompt.variableType')}</label>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as PromptVariableType })}
            className="w-full px-2.5 py-1 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600"
          >
            <option value="string">{t('prompt.variableTypeString')}</option>
            <option value="number">{t('prompt.variableTypeNumber')}</option>
            <option value="boolean">{t('prompt.variableTypeBoolean')}</option>
            <option value="select">{t('prompt.variableTypeSelect')}</option>
            <option value="textarea">{t('prompt.variableTypeTextarea')}</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted mb-1">{t('prompt.defaultValues')}</label>
          <input
            type="text"
            value={String(form.defaultValue ?? '')}
            onChange={(e) => setForm({ ...form, defaultValue: e.target.value })}
            placeholder={t('prompt.optional')}
            className="w-full px-2.5 py-1 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] text-muted mb-1">{t('prompt.placeholder')}</label>
        <input
          type="text"
          value={form.placeholder ?? ''}
          onChange={(e) => setForm({ ...form, placeholder: e.target.value })}
          placeholder={t('prompt.placeholderDescription')}
          className="w-full px-2.5 py-1 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30"
        />
      </div>

      <div>
        <label className="block text-[10px] text-muted mb-1">{t('common.description')}</label>
        <input
          type="text"
          value={form.description ?? ''}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder={t('prompt.variableDescriptionPlaceholder')}
          className="w-full px-2.5 py-1 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30"
        />
      </div>

      {form.type === 'select' && (
        <div>
          <label className="block text-[10px] text-muted mb-1">{t('prompt.variableOptions')}</label>
          <textarea
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder={t('prompt.variableOptionsPlaceholder')}
            rows={3}
            className="w-full px-2.5 py-1 text-xs font-mono border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 resize-y"
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={form.required}
          onChange={(e) => setForm({ ...form, required: e.target.checked })}
          className="rounded border-surface-300 dark:border-surface-600"
        />
        {t('prompt.requiredVariable')}
      </label>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={!isValid}
          className="px-3 py-1.5 text-xs bg-accent-500 text-white rounded-lg hover:bg-accent-600 disabled:opacity-50 transition-colors"
        >
          {t('prompt.saveVariable')}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-muted border border-surface-300 dark:border-surface-600 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
