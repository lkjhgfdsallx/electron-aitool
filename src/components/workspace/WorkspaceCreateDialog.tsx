/**
 * 快捷创建工作区对话框
 *
 * 简洁的创建工作区表单：模板选择、名称、描述、文件夹选择、AI 领导选择。
 * Phase C 更新：支持模板选择（C2）
 * 创建后自动初始化 VCS 目录并可选择立即激活。
 */

import { useState, useCallback, useEffect } from 'react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { workspaceVCSService } from '../../services/workspace-vcs-service'
import { WORKSPACE_TEMPLATES } from '../../constants/workspace-templates'
import type { WorkspaceCreateInput, Workspace } from '../../types'
import { DEFAULT_WORKSPACE_INPUT } from '../../types/workspace'
import type { WorkspaceTemplate } from '../../constants/workspace-templates'

// ---- 组件 ----

interface WorkspaceCreateDialogProps {
  open: boolean
  onClose: () => void
  onCreated?: (workspaceId: string) => void
}

export function WorkspaceCreateDialog({ open, onClose, onCreated }: WorkspaceCreateDialogProps) {
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace)
  const activateWorkspace = useWorkspaceStore((s) => s.activateWorkspace)

  // C2: 模板选择
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('general')
  const [showTemplateStep, setShowTemplateStep] = useState(true)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activateAfterCreate, setActivateAfterCreate] = useState(true)

  const selectedTemplate = WORKSPACE_TEMPLATES.find((t) => t.id === selectedTemplateId)

  // 重置表单
  useEffect(() => {
    if (open) {
      setSelectedTemplateId('general')
      setShowTemplateStep(true)
      setName('')
      setDescription('')
      setFolderPath('')
      setError(null)
      setIsCreating(false)
      setActivateAfterCreate(true)
    }
  }, [open])

  // 选择文件夹
  const handleSelectFolder = useCallback(async () => {
    const result = await workspaceVCSService.selectFolder()
    if (result.success && result.folderPath) {
      setFolderPath(result.folderPath)
      // 如果名称为空，用文件夹名作为默认名称
      if (!name) {
        const folderName = result.folderPath.split(/[/\\]/).pop() ?? ''
        setName(folderName)
      }
    }
  }, [name])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // 创建工作区
  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      setError('请输入工作区名称')
      return
    }
    if (!folderPath) {
      setError('请选择工作区文件夹')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      // 先初始化 VCS 目录
      const initResult = await workspaceVCSService.initWorkspace(folderPath)
      if (!initResult.success) {
        setError(`初始化工作区目录失败: ${initResult.error}`)
        setIsCreating(false)
        return
      }

      // C2: 应用模板默认值
      const templateDefaults = selectedTemplate?.defaults ?? {}

      // 创建工作区
      const input: WorkspaceCreateInput = {
        ...DEFAULT_WORKSPACE_INPUT,
        ...templateDefaults,
        name: name.trim(),
        description: description.trim(),
        folderPath,
      }

      const workspace = createWorkspace(input)

      // 可选：立即激活
      if (activateAfterCreate) {
        activateWorkspace(workspace.id)
        // 刷新存档索引
        await workspaceVCSService.refreshCheckpointIndex(folderPath)
      }

      onCreated?.(workspace.id)
      onClose()
    } catch (err) {
      setError(`创建工作区失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsCreating(false)
    }
  }, [name, description, folderPath, activateAfterCreate, selectedTemplate, createWorkspace, activateWorkspace, onCreated, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      {/* 弹窗 */}
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-surface-900 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 animate-scale-in overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/15 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-600 dark:text-teal-400">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">创建工作区</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* C2: 模板选择步骤 */}
        {showTemplateStep ? (
          <div className="px-5 py-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              选择项目模板，预设对应的命令白名单和上下文配置：
            </p>
            <div className="grid grid-cols-2 gap-2">
              {WORKSPACE_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => {
                    setSelectedTemplateId(template.id)
                    setShowTemplateStep(false)
                  }}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all hover:shadow-sm ${
                    selectedTemplateId === template.id
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 ring-1 ring-teal-500/30'
                      : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600'
                  }`}
                >
                  <span className="text-xl flex-shrink-0">{template.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{template.name}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-2">{template.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* 表单 */
          <div className="px-5 py-4 space-y-4">
            {/* 已选模板提示 */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700">
              <span className="text-base">{selectedTemplate?.icon}</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{selectedTemplate?.name}</span>
              <button
                onClick={() => setShowTemplateStep(true)}
                className="ml-auto text-[10px] text-teal-500 hover:text-teal-600 dark:hover:text-teal-400"
              >
                更换
              </button>
            </div>

            {/* 工作区名称 */}
            <div>
              <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5 block">
                工作区名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：我的前端项目"
                className="w-full px-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
                autoFocus
              />
            </div>

            {/* 描述 */}
            <div>
              <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5 block">
                描述
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简要描述工作区用途..."
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 placeholder-surface-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 resize-none"
              />
            </div>

            {/* 文件夹选择 */}
            <div>
              <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5 block">
                工作区文件夹 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/80 min-w-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400 shrink-0">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="text-xs text-surface-500 dark:text-surface-400 truncate">
                    {folderPath || '未选择'}
                  </span>
                </div>
                <button
                  onClick={handleSelectFolder}
                  className="px-3 py-2 text-xs font-medium rounded-lg border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors shrink-0"
                >
                  浏览...
                </button>
              </div>
            </div>

            {/* 创建后激活 */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={activateAfterCreate}
                onChange={(e) => setActivateAfterCreate(e.target.checked)}
                className="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-teal-500 focus:ring-teal-500/50"
              />
              <span className="text-xs text-surface-600 dark:text-surface-400">
                创建后立即进入工作区模式
              </span>
            </label>

            {/* 模板提示 */}
            {selectedTemplate && selectedTemplate.tips.length > 0 && (
              <div className="px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-1">💡 模板提示</p>
                {selectedTemplate.tips.map((tip, i) => (
                  <p key={i} className="text-[10px] text-blue-500 dark:text-blue-400/80 leading-relaxed">
                    • {tip}
                  </p>
                ))}
              </div>
            )}

            {/* 错误提示 */}
            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/30">
          {showTemplateStep ? (
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            >
              取消
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowTemplateStep(true)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              >
                上一步
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating || !name.trim() || !folderPath}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {isCreating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    创建中...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    创建工作区
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
