import { useState } from 'react'
import {
  Search,
  Loader2,
  FileText,
  ChevronDown,
  ChevronRight,
  Hash,
  Percent
} from 'lucide-react'
import { useKnowledgeBaseStore } from '../../stores/knowledge-base-store'
import { useAppTranslation } from '@/i18n/hooks'

export function SearchResults() {
  const { t } = useAppTranslation()
  const { searchResults, isSearching, searchQuery, searchMode } = useKnowledgeBaseStore()

  if (isSearching) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-muted" />
        <span className="ml-2 text-sm text-muted">{t('knowledgeBase.searching')}</span>
      </div>
    )
  }

  if (searchResults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted">
        <Search size={48} className="mb-4 opacity-20" />
        <p className="text-sm font-medium mb-1">
          {searchQuery ? t('knowledgeBase.noMatchingResults') : t('knowledgeBase.enterSearchQuery')}
        </p>
        <p className="text-xs">
          {searchQuery
            ? t('knowledgeBase.tryDifferentSearch')
            : t('knowledgeBase.supportedSearchModes')}
        </p>
      </div>
    )
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-surface-700 dark:text-surface-300">
          {t('knowledgeBase.searchResults')}
        </span>
        <span className="text-xs text-surface-400 dark:text-surface-500">
          {searchMode === 'keyword' ? t('knowledgeBase.keywordMatch') : t('knowledgeBase.vectorSearch')} · {t('knowledgeBase.resultsCount', { count: searchResults.length })}
        </span>
      </div>
      <div className="space-y-2">
        {searchResults.map((result, i) => (
          <SearchResultCard
            key={`${result.chunk.id}-${i}`}
            result={result}
            index={i}
            isVector={searchMode === 'vector'}
          />
        ))}
      </div>
    </div>
  )
}

function SearchResultCard({
  result,
  index,
  isVector
}: {
  result: { chunk: { id: string; content: string; fileId: string }; score: number; fileName: string; highlight: string }
  index: number
  isVector: boolean
}) {
  const { t } = useAppTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white dark:bg-surface-800/60 rounded-lg border border-surface-200/80 dark:border-surface-700/60 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-3 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
      >
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-md bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-[10px] font-bold text-violet-500">{index + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FileText size={12} className="text-surface-400" />
              <span className="text-xs font-medium text-surface-600 dark:text-surface-300 truncate">
                {result.fileName}
              </span>
              {isVector && (
                <span className="flex items-center gap-1 text-[10px] text-violet-500 ml-auto flex-shrink-0">
                  <Percent size={10} />
                  {(result.score * 100).toFixed(1)}%
                </span>
              )}
            </div>
            <p
              className="text-xs text-surface-600 dark:text-surface-400 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: result.highlight }}
            />
          </div>
          <div className="flex-shrink-0 mt-1">
            {expanded ? (
              <ChevronDown size={14} className="text-surface-400" />
            ) : (
              <ChevronRight size={14} className="text-surface-400" />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-surface-100 dark:border-surface-700/40 pt-2 ml-8">
          <pre className="text-xs text-surface-700 dark:text-surface-300 whitespace-pre-wrap break-words font-sans leading-relaxed">
            {result.chunk.content}
          </pre>
          {isVector && (
            <div className="mt-2 pt-2 border-t border-surface-100 dark:border-surface-700/40">
              {/* 相似度进度条 */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-surface-400">{t('knowledgeBase.similarity')}</span>
                <div className="flex-1 h-1.5 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all"
                    style={{ width: `${result.score * 100}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium text-violet-500">
                  {(result.score * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
