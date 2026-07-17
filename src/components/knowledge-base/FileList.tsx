import { useCallback, useState, useRef, useEffect } from 'react'
import {
  FileText,
  Table,
  Code2,
  Globe,
  File,
  Loader2,
  AlertCircle,
  Trash2,
  MoreHorizontal,
  FolderInput,
  Copy,
  ArrowLeft
} from 'lucide-react'
import type { KnowledgeBaseFile, FileTypeCategory } from '../../types'
import { useKnowledgeBaseStore } from '../../stores/knowledge-base-store'
import { useKnowledgeCollectionStore } from '../../stores/knowledge-collection-store'
import { useAppTranslation } from '@/i18n/hooks'
import { formatRelativeTime } from '@/utils/format-time'

const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  document: FileText,
  pdf: FileText,
  data: Table,
  code: Code2,
  web: Globe,
  other: File
}

function getFileIconKey(name: string): string {
  const ext = '.' + name.split('.').pop()?.toLowerCase()
  if (['.txt', '.md', '.doc', '.docx', '.rtf'].includes(ext)) return 'document'
  if (['.pdf'].includes(ext)) return 'pdf'
  if (['.json', '.csv', '.xml', '.yaml', '.yml', '.toml'].includes(ext)) return 'data'
  if (['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.go', '.rs', '.swift', '.rb', '.php', '.css', '.scss', '.less', '.sh', '.bat', '.ps1', '.sql'].includes(ext)) return 'code'
  if (['.html', '.htm'].includes(ext)) return 'web'
  return 'other'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const statusColor: Record<KnowledgeBaseFile['status'], string> = {
  uploading: 'text-blue-500',
  processing: 'text-amber-500',
  ready: 'text-emerald-500',
  error: 'text-red-500'
}

/** 文件操作菜单的模式 */
type MenuMode = 'main' | 'move' | 'copy'

export function FileList() {
  const { t } = useAppTranslation()
  const {
    isLoading,
    selectedFileId,
    setSelectedFileId,
    deleteFile,
    moveFile,
    copyFile,
    activeCollectionId,
    getFilteredFiles
  } = useKnowledgeBaseStore()

  const { collections } = useKnowledgeCollectionStore()

  const filteredFiles = getFilteredFiles()

  // ===== 操作菜单状态 =====
  const [menuFileId, setMenuFileId] = useState<string | null>(null)
  const [menuMode, setMenuMode] = useState<MenuMode>('main')
  const [isProcessing, setIsProcessing] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuFileId) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuFileId(null)
        setMenuMode('main')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuFileId])

  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      if (confirm(t('knowledgeBase.deleteFileConfirm'))) {
        await deleteFile(id)
      }
    },
    [deleteFile, t]
  )

  const handleOpenMenu = useCallback((e: React.MouseEvent, fileId: string) => {
    e.stopPropagation()
    setMenuFileId(fileId)
    setMenuMode('main')
  }, [])

  const handleMove = useCallback(async (fileId: string, targetCollectionId: string) => {
    setIsProcessing(true)
    try {
      await moveFile(fileId, targetCollectionId)
    } catch (err) {
      console.error('移动文件失败:', err)
    } finally {
      setIsProcessing(false)
      setMenuFileId(null)
      setMenuMode('main')
    }
  }, [moveFile])

  const handleCopy = useCallback(async (fileId: string, targetCollectionId: string) => {
    setIsProcessing(true)
    try {
      await copyFile(fileId, targetCollectionId)
    } catch (err) {
      console.error('复制文件失败:', err)
    } finally {
      setIsProcessing(false)
      setMenuFileId(null)
      setMenuMode('main')
    }
  }, [copyFile])

  /** 获取可用于移动/复制的目标集合（排除当前集合） */
  const getTargetCollections = useCallback((fileCollectionId: string | undefined) => {
    const currentCid = fileCollectionId || null
    return collections.filter((c) => c.id !== currentCid)
  }, [collections])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-muted" />
      </div>
    )
  }

  if (filteredFiles.length === 0) {
    return (
      <div className="text-center text-muted py-8">
        <FileText size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-xs">{t('knowledgeBase.noFiles')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {filteredFiles.map((file) => {
        const iconKey = getFileIconKey(file.name)
        const Icon = FILE_TYPE_ICONS[iconKey] ?? File
        const status = {
          text: file.status === 'error' ? t('common.error') : t(`knowledgeBase.${file.status}`),
          color: statusColor[file.status]
        }
        const isSelected = selectedFileId === file.id
        const isMenuOpen = menuFileId === file.id

        return (
          <button
            key={file.id}
            onClick={() => setSelectedFileId(file.id)}
            className={`
              w-full text-left px-3 py-2.5 rounded-lg transition-all group relative
              ${isSelected
                ? 'bg-violet-100 dark:bg-violet-900/30 border border-violet-300 dark:border-violet-700'
                : 'hover:bg-surface-100 dark:hover:bg-surface-800/60 border border-transparent'
              }
            `}
          >
            <div className="flex items-start gap-2.5">
              <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
                isSelected
                  ? 'bg-violet-200 dark:bg-violet-800/40'
                  : 'bg-surface-100 dark:bg-surface-800'
              }`}>
                <Icon
                  size={13}
                  className={isSelected ? 'text-violet-600 dark:text-violet-400' : 'text-surface-500'}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${
                  isSelected
                    ? 'text-violet-700 dark:text-violet-300 font-medium'
                    : 'text-surface-700 dark:text-surface-300'
                }`}>
                  {file.name}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-surface-400 dark:text-surface-500">
                  <span>{formatFileSize(file.size)}</span>
                  <span>·</span>
                  <span>{t('knowledgeBase.chunksCount', { count: file.chunkCount })}</span>
                  <span>·</span>
                  <span>{formatRelativeTime(file.uploadedAt)}</span>
                </div>
                {file.status !== 'ready' && (
                  <div className="flex items-center gap-1 mt-1">
                    {file.status === 'error' && <AlertCircle size={10} className="text-red-500" />}
                    {file.status === 'processing' && <Loader2 size={10} className="animate-spin text-amber-500" />}
                    <span className={`text-[11px] ${status.color}`}>{status.text}</span>
                  </div>
                )}
              </div>
              {/* 操作按钮区域 */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {/* 更多操作按钮 */}
                <div className="relative" ref={isMenuOpen ? menuRef : undefined}>
                  <button
                    onClick={(e) => handleOpenMenu(e, file.id)}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700 transition-all"
                    title={t('knowledgeBase.moreFileActions')}
                    aria-label={t('knowledgeBase.moreFileActions')}
                  >
                    <MoreHorizontal size={13} />
                  </button>

                  {/* 下拉菜单 */}
                  {isMenuOpen && (
                    <div
                      className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg py-1 min-w-[160px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {menuMode === 'main' && (
                        <>
                          {/* 移动到 */}
                          {(() => {
                            const targets = getTargetCollections(file.collectionId)
                            if (targets.length === 0) return null
                            return (
                              <button
                                onClick={() => setMenuMode('move')}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700/60 transition-colors"
                              >
                                <FolderInput size={14} className="text-blue-500" />
                                {t('knowledgeBase.moveToCollection')}
                              </button>
                            )
                          })()}
                          {/* 复制到 */}
                          {(() => {
                            const targets = getTargetCollections(file.collectionId)
                            if (targets.length === 0) return null
                            return (
                              <button
                                onClick={() => setMenuMode('copy')}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700/60 transition-colors"
                              >
                                <Copy size={14} className="text-emerald-500" />
                                {t('knowledgeBase.copyToCollection')}
                              </button>
                            )
                          })()}
                          {/* 删除 */}
                          <div className="border-t border-surface-100 dark:border-surface-700 my-1" />
                          <button
                            onClick={(e) => {
                              setMenuFileId(null)
                              setMenuMode('main')
                              handleDelete(e, file.id)
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          >
                            <Trash2 size={14} />
                            {t('knowledgeBase.deleteFile')}
                          </button>
                        </>
                      )}

                      {(menuMode === 'move' || menuMode === 'copy') && (
                        <>
                          {/* 返回按钮 */}
                          <button
                            onClick={() => setMenuMode('main')}
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700/60 transition-colors"
                          >
                            <ArrowLeft size={12} />
                            {t('common.back')}
                          </button>
                          <div className="border-t border-surface-100 dark:border-surface-700 my-1" />
                          {/* 目标集合列表 */}
                          {getTargetCollections(file.collectionId).map((col) => (
                            <button
                              key={col.id}
                              onClick={() => {
                                if (menuMode === 'move') {
                                  handleMove(file.id, col.id)
                                } else {
                                  handleCopy(file.id, col.id)
                                }
                              }}
                              disabled={isProcessing}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700/60 transition-colors disabled:opacity-50"
                            >
                              <span className="text-base leading-none">{col.icon}</span>
                              <span className="truncate">{col.name}</span>
                              {isProcessing && <Loader2 size={12} className="animate-spin ml-auto" />}
                            </button>
                          ))}
                          {getTargetCollections(file.collectionId).length === 0 && (
                            <p className="px-3 py-2 text-xs text-surface-400">{t('knowledgeBase.noOtherCollections')}</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 删除按钮 */}
                <button
                  onClick={(e) => handleDelete(e, file.id)}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 text-surface-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all flex-shrink-0"
                  title={t('knowledgeBase.deleteFile')}
                  aria-label={t('knowledgeBase.deleteFile')}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
