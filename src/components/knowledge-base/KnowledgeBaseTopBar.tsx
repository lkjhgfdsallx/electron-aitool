import { useState, useCallback } from 'react'
import {
  ArrowLeft,
  Search,
  Upload,
  Brain,
  Settings,
  X,
  Loader2,
  Globe,
  Link
} from 'lucide-react'
import { useKnowledgeBaseStore } from '../../stores/knowledge-base-store'
import { useKnowledgeCollectionStore } from '../../stores/knowledge-collection-store'
import { knowledgeBaseService } from '../../services/knowledge-base-service'
import type { SearchMode } from '../../types'
import { useAppTranslation } from '@/i18n/hooks'

/** 搜索模式配置 */
const SEARCH_MODES: { mode: SearchMode; labelKey: string; titleKey: string }[] = [
  { mode: 'hybrid', labelKey: 'knowledgeBase.searchModeHybrid', titleKey: 'knowledgeBase.searchModeHybridTitle' },
  { mode: 'vector', labelKey: 'knowledgeBase.searchModeVector', titleKey: 'knowledgeBase.searchModeVectorTitle' },
  { mode: 'keyword', labelKey: 'knowledgeBase.searchModeKeyword', titleKey: 'knowledgeBase.searchModeKeywordTitle' }
]

interface KnowledgeBaseTopBarProps {
  onBack: () => void
  onOpenSettings: (section?: string) => void
}

export function KnowledgeBaseTopBar({ onBack, onOpenSettings }: KnowledgeBaseTopBarProps) {
  const { t } = useAppTranslation()
  const {
    searchQuery,
    setSearchQuery,
    searchMode,
    setSearchMode,
    performSearch,
    pageViewMode,
    setPageViewMode,
    addFile,
    importUrl
  } = useKnowledgeBaseStore()

  const { activeCollectionId: collectionActiveId } = useKnowledgeCollectionStore()

  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [localQuery, setLocalQuery] = useState(searchQuery)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [importingUrl, setImportingUrl] = useState(false)
  const [urlError, setUrlError] = useState('')

  // 搜索
  const handleSearch = useCallback(() => {
    setSearchQuery(localQuery)
    if (localQuery.trim()) {
      performSearch(localQuery, searchMode)
    } else {
      setPageViewMode('files')
    }
  }, [localQuery, searchMode, setSearchQuery, performSearch, setPageViewMode])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    }
  }

  const handleClearSearch = () => {
    setLocalQuery('')
    setSearchQuery('')
    setPageViewMode('files')
  }

  // 上传
  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files
      if (!fileList || fileList.length === 0) return

      setUploading(true)

      // 使用当前选中的集合 ID（null 时传 undefined，文件将归入默认集合）
      const uploadCollectionId = collectionActiveId ?? undefined

      for (const file of Array.from(fileList)) {
        setUploadProgress(t('knowledgeBase.processingFile', { name: file.name }))
        try {
          const metadata = await knowledgeBaseService.uploadFile(file, (status) => {
            setUploadProgress(`${file.name}: ${status}`)
          }, uploadCollectionId)
          addFile(metadata)
        } catch (error) {
          console.error('上传失败:', error)
        }
      }

      setUploading(false)
      setUploadProgress('')
      e.target.value = ''
    },
    [addFile, collectionActiveId, t]
  )

  // URL 导入
  const handleImportUrl = useCallback(async () => {
    if (!urlValue.trim()) return
    setUrlError('')
    setImportingUrl(true)
    try {
      const uploadCollectionId = collectionActiveId ?? undefined
      await importUrl(urlValue.trim(), uploadCollectionId)
      setUrlValue('')
      setShowUrlInput(false)
    } catch (error) {
      setUrlError(error instanceof Error ? error.message : t('knowledgeBase.urlImportFailed'))
    } finally {
      setImportingUrl(false)
    }
  }, [urlValue, collectionActiveId, importUrl, t])

  const handleUrlKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleImportUrl()
    }
  }

  // 搜索模式循环切换
  const cycleSearchMode = () => {
    const currentIndex = SEARCH_MODES.findIndex((m) => m.mode === searchMode)
    const nextIndex = (currentIndex + 1) % SEARCH_MODES.length
    setSearchMode(SEARCH_MODES[nextIndex].mode)
  }

  const currentModeConfig = SEARCH_MODES.find((m) => m.mode === searchMode) ?? SEARCH_MODES[0]

  return (
    <div className="flex-shrink-0 border-b border-surface-200/80 dark:border-surface-700/60 bg-white dark:bg-surface-900">
      <div className="h-14 flex items-center px-4 gap-3">
        {/* 返回按钮 */}
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-all flex-shrink-0"
          title={t('nav.backToChat')}
        >
          <ArrowLeft size={18} />
        </button>

        {/* 标题 */}
        <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200 flex-shrink-0">
          {t('knowledgeBase.knowledgeBase')}
        </h2>

        {/* 搜索框 */}
        <div className="flex-1 max-w-md mx-auto relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('knowledgeBase.searchFilesOrContent')}
            className="w-full pl-9 pr-20 py-1.5 text-sm rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-800 dark:text-surface-200 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {localQuery && (
              <button
                onClick={handleClearSearch}
                className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-400"
              >
                <X size={12} />
              </button>
            )}
            {/* 搜索模式切换 */}
            <button
              onClick={cycleSearchMode}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                searchMode === 'hybrid'
                  ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                  : searchMode === 'vector'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'bg-surface-200 dark:bg-surface-700 text-surface-500'
              }`}
              title={t(currentModeConfig.titleKey)}
            >
              {t(currentModeConfig.labelKey)}
            </button>
          </div>
        </div>

        {/* 模拟器按钮 */}
        <button
          onClick={() => setPageViewMode(pageViewMode === 'simulator' ? 'files' : 'simulator')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
            pageViewMode === 'simulator'
              ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
              : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'
          }`}
          title={t('knowledgeBase.vectorQuerySimulator')}
        >
          <Brain size={14} />
          <span className="hidden sm:inline">{t('knowledgeBase.simulator')}</span>
        </button>

        {/* URL 导入按钮 */}
        <button
          onClick={() => setShowUrlInput(!showUrlInput)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
            showUrlInput
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
              : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'
          }`}
          title={t('knowledgeBase.importUrlContent')}
        >
          <Globe size={14} />
          <span className="hidden sm:inline">URL</span>
        </button>

        {/* 上传按钮 */}
        <label
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex-shrink-0 ${
            uploading
              ? 'bg-surface-100 dark:bg-surface-800 text-surface-400 cursor-not-allowed'
              : 'bg-violet-500 text-white hover:bg-violet-600'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span className="hidden sm:inline">{uploadProgress}</span>
            </>
          ) : (
            <>
              <Upload size={14} />
              <span className="hidden sm:inline">{t('knowledgeBase.upload')}</span>
            </>
          )}
          <input
            type="file"
            multiple
            accept=".txt,.md,.json,.csv,.text,.pdf,.docx,.doc,.html,.htm,.log,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.hpp,.go,.rs,.swift,.rb,.php,.css,.scss,.less,.xml,.yaml,.yml,.toml,.sh,.bat,.ps1,.sql"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>

        {/* 设置按钮 */}
        <button
          onClick={() => onOpenSettings('knowledge-base')}
          className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-all flex-shrink-0"
          title={t('knowledgeBase.knowledgeBaseSettings')}
        >
          <Settings size={16} />
        </button>
      </div>

      {/* URL 导入输入栏 */}
      {showUrlInput && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <Link size={14} className="text-surface-400 flex-shrink-0" />
          <input
            type="url"
            value={urlValue}
            onChange={(e) => { setUrlValue(e.target.value); setUrlError('') }}
            onKeyDown={handleUrlKeyDown}
            placeholder={t('knowledgeBase.urlInputPlaceholder')}
            disabled={importingUrl}
            className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-800 dark:text-surface-200 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50"
          />
          <button
            onClick={handleImportUrl}
            disabled={!urlValue.trim() || importingUrl}
            className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            {importingUrl ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Globe size={12} />
            )}
            {t('knowledgeBase.import')}
          </button>
          <button
            onClick={() => { setShowUrlInput(false); setUrlValue(''); setUrlError('') }}
            className="p-1.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-400 flex-shrink-0"
          >
            <X size={14} />
          </button>
          {urlError && (
            <span className="text-xs text-red-500 truncate max-w-[200px]">{urlError}</span>
          )}
        </div>
      )}
    </div>
  )
}
