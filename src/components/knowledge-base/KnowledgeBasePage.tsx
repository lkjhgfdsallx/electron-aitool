import { useEffect } from 'react'
import { Settings } from 'lucide-react'
import { useKnowledgeBaseStore } from '../../stores/knowledge-base-store'
import { KnowledgeBaseTopBar } from './KnowledgeBaseTopBar'
import { KnowledgeCollectionTabs } from './KnowledgeCollectionTabs'
import { FileTypeNav } from './FileTypeNav'
import { FileList } from './FileList'
import { FileViewer } from './FileViewer'
import { SearchResults } from './SearchResults'
import { QuerySimulator } from './QuerySimulator'

interface KnowledgeBasePageProps {
  onBack: () => void
  onOpenSettings: (section?: string) => void
}

export function KnowledgeBasePage({ onBack, onOpenSettings }: KnowledgeBasePageProps) {
  const {
    loadFiles,
    pageViewMode,
    selectedFileId
  } = useKnowledgeBaseStore()

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  return (
    <div className="flex flex-col w-full h-full animate-fade-in">
      {/* 顶部工具栏 */}
      <KnowledgeBaseTopBar onBack={onBack} onOpenSettings={onOpenSettings} />

      {/* 集合切换标签栏 */}
      <div className="flex-shrink-0 px-4 py-1.5 border-b border-surface-200/80 dark:border-surface-700/60 bg-surface-50/50 dark:bg-surface-950/50">
        <KnowledgeCollectionTabs />
      </div>

      {/* 主内容区：左右分栏 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧面板：文件类型导航 + 文件列表 */}
        <div className="w-[260px] flex-shrink-0 border-r border-surface-200/80 dark:border-surface-700/60 bg-surface-50/50 dark:bg-surface-950/50 flex flex-col">
          {/* 文件类型导航 */}
          <div className="flex-shrink-0 px-3 pt-3 pb-2">
            <FileTypeNav />
          </div>

          {/* 分隔线 */}
          <div className="px-3">
            <div className="h-px bg-surface-200/80 dark:bg-surface-700/60" />
          </div>

          {/* 文件列表 */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <FileList />
          </div>

          {/* 知识库设置入口 */}
          <div className="flex-shrink-0 px-3 py-2 border-t border-surface-200/80 dark:border-surface-700/60">
            <button
              onClick={() => onOpenSettings('knowledge-base')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-surface-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-all"
            >
              <Settings size={14} />
              <span>知识库设置</span>
            </button>
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 min-w-0 bg-white dark:bg-surface-900">
          {pageViewMode === 'simulator' ? (
            <QuerySimulator />
          ) : pageViewMode === 'search' ? (
            <SearchResults />
          ) : (
            <FileViewer />
          )}
        </div>
      </div>
    </div>
  )
}
