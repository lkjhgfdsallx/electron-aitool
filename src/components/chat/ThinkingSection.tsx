import { useState } from 'react'
import { ChevronDown, ChevronRight, Brain } from 'lucide-react'

interface ThinkingSectionProps {
  content: string
}

export function ThinkingSection({ content }: ThinkingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!content) return null

  return (
    <div className="mb-2 border border-amber-200 dark:border-amber-800 rounded-lg overflow-hidden bg-amber-50 dark:bg-amber-950/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
      >
        <Brain size={14} />
        <span className="font-medium">思考过程</span>
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 text-sm text-amber-800 dark:text-amber-200 whitespace-pre-wrap border-t border-amber-200 dark:border-amber-800">
          {content}
        </div>
      )}
    </div>
  )
}
