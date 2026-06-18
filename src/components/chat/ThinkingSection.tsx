import { useState } from 'react'
import { ChevronDown, ChevronRight, Brain } from 'lucide-react'

interface ThinkingSectionProps {
  content: string
}

export function ThinkingSection({ content }: ThinkingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!content) return null

  return (
    <div className="mb-2 rounded-xl border border-surface-200/60 dark:border-surface-700/40 overflow-hidden bg-surface-50/60 dark:bg-surface-800/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-lg border-none bg-transparent hover:bg-surface-100 dark:hover:bg-surface-700/60 transition-all text-muted cursor-pointer"
      >
        <div className="w-5 h-5 rounded-md bg-accent-50 dark:bg-accent-950/30 flex items-center justify-center flex-shrink-0">
          <Brain size={12} className="text-accent-400" />
        </div>
        <span className="font-medium">思考过程</span>
        <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
        <div className="ml-auto flex-shrink-0">
          {isExpanded ? (
            <ChevronDown size={14} className="text-muted" />
          ) : (
            <ChevronRight size={14} className="text-muted" />
          )}
        </div>
      </button>
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: isExpanded ? '600px' : '0px', opacity: isExpanded ? 1 : 0 }}
      >
        <div className="mt-2 mx-3 mb-3 p-3 rounded-lg bg-surface-50/60 dark:bg-surface-800/30 border border-surface-200/40 dark:border-surface-700/30">
          <div className="text-xs text-muted leading-relaxed whitespace-pre-wrap">
            {content}
          </div>
        </div>
      </div>
    </div>
  )
}
