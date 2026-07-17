import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Plus,
  Search,
  Zap,
  Globe,
  FolderOpen,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Edit2,
  Download,
  Upload,
  RefreshCw,
  FolderPlus,
} from 'lucide-react'
import { useSkillStore } from '../../stores/skill-store'
import { SkillEditor } from './SkillEditor'
import { useConfirmDialog, SettingsEmptyState, StatusFeedback } from './ui'
import { useAppTranslation } from '@/i18n/hooks'
import type { Skill, SkillCreateInput } from '../../types'

type LocationFilter = 'all' | 'global' | 'project'

export function SkillManager() {
  const { t } = useAppTranslation()
  const {
    skills,
    loading,
    loadSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    toggleSkill,
    importFromZip,
    importFromFolder,
    exportToZip,
    refresh,
  } = useSkillStore()
  const { confirm, Dialog } = useConfirmDialog()

  // ==================== 列表状态 ====================
  const [searchQuery, setSearchQuery] = useState('')
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all')

  // ==================== 编辑状态 ====================
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [viewOnly, setViewOnly] = useState(false)

  // ==================== 导入状态 ====================
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [importMessageType, setImportMessageType] = useState<'success' | 'error' | 'info'>('info')

  // ==================== 初始化加载 ====================
  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  // ==================== 过滤逻辑 ====================
  const filteredSkills = useMemo(() => {
    let list = [...skills]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.content.toLowerCase().includes(q)
      )
    }

    if (locationFilter !== 'all') {
      list = list.filter((s) => s.location === locationFilter)
    }

    list.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      return b.updatedAt - a.updatedAt
    })

    return list
  }, [skills, searchQuery, locationFilter])

  // ==================== 操作 ====================
  const handleCreate = useCallback(() => {
    setSelectedSkill(null)
    setIsCreating(true)
    setViewOnly(false)
  }, [])

  const handleView = useCallback((skill: Skill) => {
    setSelectedSkill(skill)
    setIsCreating(false)
    setViewOnly(true)
  }, [])

  const handleEdit = useCallback((skill: Skill) => {
    setSelectedSkill(skill)
    setIsCreating(false)
    setViewOnly(false)
  }, [])

  const handleEnterEdit = useCallback(() => {
    setViewOnly(false)
  }, [])

  const handleSave = useCallback(
    async (data: SkillCreateInput | { dirPath: string; name?: string; description?: string; content?: string }) => {
      if ('dirPath' in data) {
        await updateSkill(data)
      } else {
        await createSkill(data)
      }
      setSelectedSkill(null)
      setIsCreating(false)
      setViewOnly(false)
    },
    [createSkill, updateSkill]
  )

  const handleClose = useCallback(() => {
    setSelectedSkill(null)
    setIsCreating(false)
    setViewOnly(false)
  }, [])

  const handleDelete = useCallback(
    async (dirPath: string) => {
      await deleteSkill(dirPath)
      setSelectedSkill(null)
      setIsCreating(false)
      setViewOnly(false)
    },
    [deleteSkill]
  )

  // ==================== 导入导出 ====================
  const handleImportZip = useCallback(async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      setImporting(true)
      setImportMessage(null)

      try {
        const arrayBuffer = await file.arrayBuffer()
        const zipData = Array.from(new Uint8Array(arrayBuffer))
        const result = await importFromZip(zipData, 'global')

        if (result.imported.length > 0 && result.errors.length === 0) {
          setImportMessage(t('skill.importSuccess', { count: result.imported.length, names: result.imported.join(', ') }))
          setImportMessageType('success')
        } else if (result.imported.length > 0 && result.errors.length > 0) {
          const errorList = result.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')
          setImportMessage(
            t('skill.importPartialSuccess', { count: result.imported.length, names: result.imported.join(', '), errors: errorList })
          )
          setImportMessageType('error')
        } else if (result.errors.length > 0) {
          const errorList = result.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')
          setImportMessage(
            t('skill.importFailed', { count: result.errors.length, errors: errorList })
          )
          setImportMessageType('error')
        } else {
          setImportMessage(t('skill.importNoSkills'))
          setImportMessageType('error')
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[SkillManager] import ZIP error:', err)
        setImportMessage(t('skill.importError', { message: msg }))
        setImportMessageType('error')
      } finally {
        setImporting(false)
      }
    }
    input.click()
  }, [importFromZip])

  const handleImportFolder = useCallback(async () => {
    setImporting(true)
    setImportMessage(null)

    try {
      const result = await importFromFolder('global')

      if (result.imported.length > 0 && result.errors.length === 0) {
        setImportMessage(t('skill.importSuccess', { count: result.imported.length, names: result.imported.join(', ') }))
        setImportMessageType('success')
      } else if (result.imported.length > 0 && result.errors.length > 0) {
        const errorList = result.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')
        setImportMessage(
          t('skill.importPartialSuccess', { count: result.imported.length, names: result.imported.join(', '), errors: errorList })
        )
        setImportMessageType('error')
      } else if (result.errors.length > 0) {
        const errorList = result.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')
        setImportMessage(
          t('skill.importFailed', { count: result.errors.length, errors: errorList })
        )
        setImportMessageType('error')
      }
      // No message when user cancels
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[SkillManager] import folder error:', err)
      setImportMessage(t('skill.importError', { message: msg }))
      setImportMessageType('error')
    } finally {
      setImporting(false)
    }
  }, [importFromFolder])

  const handleExport = useCallback(async () => {
    const dirPaths = filteredSkills.map((s) => s.dirPath)
    if (dirPaths.length === 0) return

    const data = await exportToZip(dirPaths)
    if (!data) return

    const blob = new Blob([new Uint8Array(data)], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `skills-export-${new Date().toISOString().slice(0, 10)}.zip`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredSkills, exportToZip])

  const handleRefresh = useCallback(async () => {
    await refresh()
    setImportMessage(null)
    setImportMessageType('info')
  }, [refresh])

  // ==================== 如果正在编辑/查看，显示编辑器 ====================
  if (isCreating || selectedSkill) {
    return (
      <SkillEditor
        skill={selectedSkill}
        isCreating={isCreating}
        viewOnly={viewOnly}
        onSave={handleSave}
        onClose={handleClose}
        onDelete={handleDelete}
        onEnterEdit={viewOnly ? handleEnterEdit : undefined}
      />
    )
  }

  // ==================== 列表视图 ====================
  return (
    <div className="animate-fade-in">
      {/* 标题 + 操作栏 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-surface-800 dark:text-surface-100 flex items-center gap-2">
            <Zap size={22} className="text-accent-500" />
            {t('skill.skillManagement')}
          </h2>
          <p className="text-sm text-surface-500 mt-1">
            {t('skill.skillManagementDescription')}
          </p>
          <p className="text-[10px] text-surface-400 mt-0.5 font-mono">
            {t('skill.storageIndexedDB')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-700/60 border border-surface-300 dark:border-surface-600 disabled:opacity-50 transition-all"
            title={t('common.refresh')}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {t('common.refresh')}
          </button>
          <button
            onClick={handleImportZip}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-700/60 border border-surface-300 dark:border-surface-600 disabled:opacity-50 transition-all"
            title={t('skill.importFromZip')}
          >
            <Upload size={14} />
            {t('skill.importZip')}
          </button>
          <button
            onClick={handleImportFolder}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-700/60 border border-surface-300 dark:border-surface-600 disabled:opacity-50 transition-all"
            title={t('skill.importFromFolder')}
          >
            <FolderPlus size={14} />
            {t('skill.importFolder')}
          </button>
          <button
            onClick={handleExport}
            disabled={skills.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-700/60 border border-surface-300 dark:border-surface-600 disabled:opacity-50 transition-all"
            title={t('skill.exportAsZip')}
          >
            <Download size={14} />
            {t('skill.export')}
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-accent-500 hover:bg-accent-600 text-white shadow-sm transition-all"
          >
            <Plus size={14} />
            {t('skill.createSkill')}
          </button>
        </div>
      </div>

      {/* 导入消息 */}
      {importMessage && (
        <div className="mb-4 relative group">
          <StatusFeedback
            type={importMessageType === 'success' ? 'success' : importMessageType === 'error' ? 'error' : 'info'}
            message={importMessage}
            className="whitespace-pre-wrap"
          />
          <button
            onClick={() => navigator.clipboard.writeText(importMessage)}
            className="absolute top-2 right-2 px-2 py-1 text-[10px] rounded border opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 dark:bg-surface-800/80 hover:bg-white dark:hover:bg-surface-700 border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300"
            title={t('skill.copyErrorInfo')}
          >
            {t('skill.copy')}
          </button>
        </div>
      )}

      {/* 搜索 + 过滤 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('skill.searchSkillPlaceholder')}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 text-sm bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-all"
          />
        </div>

        {/* 位置过滤 */}
        <div className="flex rounded-lg border border-surface-300 dark:border-surface-600 overflow-hidden">
          {([
            { key: 'all', label: t('skill.all') },
            { key: 'global', label: t('skill.global') },
            { key: 'project', label: t('skill.project') },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setLocationFilter(opt.key)}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${
                locationFilter === opt.key
                  ? 'bg-accent-500 text-white'
                  : 'bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-surface-400">
          <RefreshCw size={20} className="animate-spin mr-2" />
          <span className="text-sm">{t('skill.scanningSkills')}</span>
        </div>
      )}

      {/* 技能卡片列表 */}
      {!loading && filteredSkills.length === 0 ? (
        <SettingsEmptyState
          icon={Zap}
          title={skills.length === 0 ? t('skill.noSkillsFound') : t('skill.noMatchingSkills')}
          description={
            skills.length === 0
              ? t('skill.importSkillHint')
              : t('skill.tryAdjustSearch')
          }
          iconSize={40}
        />
      ) : (
        <div className="space-y-3">
          {filteredSkills.map((skill) => (
            <div
              key={skill.dirPath}
              className="group relative rounded-xl border border-surface-200/80 dark:border-surface-700/60 bg-white dark:bg-surface-800/80 p-4 hover:border-accent-300 dark:hover:border-accent-700 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => handleView(skill)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {/* 名称 + 状态 */}
                  <div className="flex items-center gap-2 mb-1">
                    <Zap size={14} className="text-accent-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-surface-800 dark:text-surface-100 font-mono truncate">
                      {skill.name}
                    </span>
                    <span
                      className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        skill.enabled
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'bg-surface-200 dark:bg-surface-700 text-surface-500'
                      }`}
                    >
                      {skill.enabled ? t('skill.enabled') : t('skill.disabled')}
                    </span>
                  </div>

                  {/* 描述 */}
                  <p className="text-xs text-surface-500 dark:text-surface-400 line-clamp-2 mb-2">
                    {skill.description || t('skill.noDescription')}
                  </p>

                  {/* 元信息 */}
                  <div className="flex items-center gap-3 text-[10px] text-surface-400">
                    <span className="flex items-center gap-1">
                      {skill.location === 'global' ? <Globe size={10} /> : <FolderOpen size={10} />}
                      {skill.location === 'global' ? t('skill.global') : t('skill.project')}
                    </span>
                    <span>
                      {t('skill.resourcesCount', { count: skill.resourceFiles.length })}
                    </span>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div
                  className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => toggleSkill(skill.dirPath)}
                    className="p-1.5 rounded-lg text-muted hover:text-accent-500 hover:bg-accent-50 dark:hover:bg-accent-900/20 transition-all"
                    title={skill.enabled ? t('skill.disable') : t('skill.enable')}
                  >
                    {skill.enabled ? <ToggleRight size={16} className="text-blue-500" /> : <ToggleLeft size={16} />}
                  </button>
                  <button
                    onClick={() => handleEdit(skill)}
                    className="p-1.5 rounded-lg text-muted hover:text-surface-600 dark:hover:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-700/60 transition-all"
                    title={t('common.edit')}
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await confirm({
                        title: t('skill.deleteSkill'),
                        message: t('skill.deleteSkillConfirm', { name: skill.name, path: skill.dirPath }),
                        confirmLabel: t('common.delete'),
                        variant: 'danger',
                      })
                      if (ok) handleDelete(skill.dirPath)
                    }}
                    className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                    title={t('common.delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 统计信息 */}
      {!loading && skills.length > 0 && (
        <div className="mt-4 text-xs text-surface-400 text-center">
          {t('skill.skillStats', { total: skills.length, enabled: skills.filter((s) => s.enabled).length })}
        </div>
      )}
      <Dialog />
    </div>
  )
}
