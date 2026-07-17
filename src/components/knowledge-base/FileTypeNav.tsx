import {
  Files,
  FileText,
  Table,
  Code2,
  Globe,
  File
} from 'lucide-react'
import type { FileTypeCategory } from '../../types'
import { FILE_TYPE_CATEGORIES } from '../../types'
import { useKnowledgeBaseStore } from '../../stores/knowledge-base-store'
import { useAppTranslation } from '@/i18n/hooks'

const CATEGORY_ICONS: Record<FileTypeCategory, typeof Files> = {
  all: Files,
  document: FileText,
  pdf: FileText,
  data: Table,
  code: Code2,
  web: Globe,
  other: File
}

export function FileTypeNav() {
  const { t } = useAppTranslation()
  const { activeFilter, setActiveFilter, getCategoryCounts } = useKnowledgeBaseStore()
  const counts = getCategoryCounts()

  return (
    <div className="space-y-0.5">
      {FILE_TYPE_CATEGORIES.map((cat) => {
        const Icon = CATEGORY_ICONS[cat.key]
        const isActive = activeFilter === cat.key
        const count = counts[cat.key]

        return (
          <button
            key={cat.key}
            onClick={() => setActiveFilter(cat.key)}
            className={`
              w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all
              ${isActive
                ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-medium'
                : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800/60'
              }
            `}
          >
            <Icon size={15} className={isActive ? 'text-violet-500' : 'text-surface-400 dark:text-surface-500'} />
            <span className="flex-1 text-left">{t(`knowledgeBase.${cat.key === 'all' ? 'allFileTypes' : `${cat.key}FileType`}`)}</span>
            <span className={`text-xs tabular-nums ${isActive ? 'text-violet-500' : 'text-surface-400 dark:text-surface-500'}`}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
