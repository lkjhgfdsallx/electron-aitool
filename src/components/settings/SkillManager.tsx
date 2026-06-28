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
import type { Skill, SkillCreateInput } from '../../types'

type LocationFilter = 'all' | 'global' | 'project'

export function SkillManager() {
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
          setImportMessage(`成功导入 ${result.imported.length} 个 Skill: ${result.imported.join(', ')}`)
          setImportMessageType('success')
        } else if (result.imported.length > 0 && result.errors.length > 0) {
          setImportMessage(
            `部分导入成功 (${result.imported.length} 个): ${result.imported.join(', ')}\n\n失败详情:\n${result.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
          )
          setImportMessageType('error')
        } else if (result.errors.length > 0) {
          setImportMessage(
            `导入失败，共 ${result.errors.length} 个错误:\n${result.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
          )
          setImportMessageType('error')
        } else {
          setImportMessage('ZIP 中未找到可导入的 Skill（未发现 SKILL.md 文件）')
          setImportMessageType('error')
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[SkillManager] 导入 ZIP 异常:', err)
        setImportMessage(`导入失败: ${msg}`)
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
        setImportMessage(`成功导入 ${result.imported.length} 个 Skill: ${result.imported.join(', ')}`)
        setImportMessageType('success')
      } else if (result.imported.length > 0 && result.errors.length > 0) {
        setImportMessage(
          `部分导入成功 (${result.imported.length} 个): ${result.imported.join(', ')}\n\n失败详情:\n${result.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
        )
        setImportMessageType('error')
      } else if (result.errors.length > 0) {
        setImportMessage(
          `导入失败，共 ${result.errors.length} 个错误:\n${result.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
        )
        setImportMessageType('error')
      }
      // 用户取消时不显示消息
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[SkillManager] 导入文件夹异常:', err)
      setImportMessage(`导入失败: ${msg}`)
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
            <Zap size={22} className="text-amber-500" />
            Skills 管理
          </h2>
          <p className="text-sm text-surface-500 mt-1">
            基于目录结构的专家知识包，从 ZIP 文件或文件夹导入
          </p>
          <p className="text-[10px] text-surface-400 mt-0.5 font-mono">
            存储: IndexedDB
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-700/60 border border-surface-300 dark:border-surface-600 disabled:opacity-50 transition-all"
            title="刷新"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
          <button
            onClick={handleImportZip}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-700/60 border border-surface-300 dark:border-surface-600 disabled:opacity-50 transition-all"
            title="从 ZIP 导入"
          >
            <Upload size={14} />
            导入 ZIP
          </button>
          <button
            onClick={handleImportFolder}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-700/60 border border-surface-300 dark:border-surface-600 disabled:opacity-50 transition-all"
            title="从文件夹导入"
          >
            <FolderPlus size={14} />
            导入文件夹
          </button>
          <button
            onClick={handleExport}
            disabled={skills.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-700/60 border border-surface-300 dark:border-surface-600 disabled:opacity-50 transition-all"
            title="导出为 ZIP"
          >
            <Download size={14} />
            导出
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all"
          >
            <Plus size={14} />
            新建 Skill
          </button>
        </div>
      </div>

      {/* 导入消息 */}
      {importMessage && (
        <div
          className={`mb-4 p-3 rounded-lg border text-sm whitespace-pre-wrap relative group ${
            importMessageType === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
              : importMessageType === 'error'
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
          }`}
        >
          <pre className="font-mono text-xs leading-relaxed m-0 whitespace-pre-wrap break-all">{importMessage}</pre>
          <button
            onClick={() => navigator.clipboard.writeText(importMessage)}
            className="absolute top-2 right-2 px-2 py-1 text-[10px] rounded border opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 dark:bg-surface-800/80 hover:bg-white dark:hover:bg-surface-700 border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300"
            title="复制错误信息"
          >
            复制
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
            placeholder="搜索 Skill 名称、描述或内容..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 text-sm bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
          />
        </div>

        {/* 位置过滤 */}
        <div className="flex rounded-lg border border-surface-300 dark:border-surface-600 overflow-hidden">
          {([
            { key: 'all', label: '全部' },
            { key: 'global', label: '全局' },
            { key: 'project', label: '项目' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setLocationFilter(opt.key)}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${
                locationFilter === opt.key
                  ? 'bg-amber-500 text-white'
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
          <span className="text-sm">正在扫描 Skills 目录...</span>
        </div>
      )}

      {/* 技能卡片列表 */}
      {!loading && filteredSkills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-surface-400">
          <Zap size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {skills.length === 0 ? '还没有发现任何 Skill' : '没有匹配的 Skill'}
          </p>
          <p className="text-xs mt-1">
            {skills.length === 0
              ? '从 ZIP 文件导入，或从文件夹导入 Skill'
              : '尝试调整搜索条件或过滤器'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSkills.map((skill) => (
            <div
              key={skill.dirPath}
              className="group relative rounded-xl border border-surface-200/80 dark:border-surface-700/60 bg-white dark:bg-surface-800/80 p-4 hover:border-amber-300 dark:hover:border-amber-700 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => handleView(skill)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {/* 名称 + 状态 */}
                  <div className="flex items-center gap-2 mb-1">
                    <Zap size={14} className="text-amber-500 flex-shrink-0" />
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
                      {skill.enabled ? '已启用' : '已禁用'}
                    </span>
                  </div>

                  {/* 描述 */}
                  <p className="text-xs text-surface-500 dark:text-surface-400 line-clamp-2 mb-2">
                    {skill.description || '无描述'}
                  </p>

                  {/* 元信息 */}
                  <div className="flex items-center gap-3 text-[10px] text-surface-400">
                    <span className="flex items-center gap-1">
                      {skill.location === 'global' ? <Globe size={10} /> : <FolderOpen size={10} />}
                      {skill.location === 'global' ? '全局' : '项目'}
                    </span>
                    <span>
                      资源: {skill.resourceFiles.length} 文件
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
                    className="p-1.5 rounded-lg text-muted hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                    title={skill.enabled ? '禁用' : '启用'}
                  >
                    {skill.enabled ? <ToggleRight size={16} className="text-blue-500" /> : <ToggleLeft size={16} />}
                  </button>
                  <button
                    onClick={() => handleEdit(skill)}
                    className="p-1.5 rounded-lg text-muted hover:text-surface-600 dark:hover:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-700/60 transition-all"
                    title="编辑"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`确定删除 Skill "${skill.name}"？\n目录: ${skill.dirPath}`))
                        handleDelete(skill.dirPath)
                    }}
                    className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                    title="删除"
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
          共 {skills.length} 个 Skill，{skills.filter((s) => s.enabled).length} 个已启用
        </div>
      )}
    </div>
  )
}
