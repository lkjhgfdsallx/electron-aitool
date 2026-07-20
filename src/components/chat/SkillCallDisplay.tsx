import { useId, useState } from 'react'
import { BadgeCheck, ChevronDown, ChevronRight, CircleAlert, Loader2, Sparkles } from 'lucide-react'
import { useAppTranslation } from '@/i18n/hooks'
import { formatSkillArguments, parseSkillCallDetails } from '../../utils/skill-call'

type SkillCallStatus = 'running' | 'completed' | 'error'

interface SkillCallDisplayProps {
  arguments: string | Record<string, unknown>
  result?: string
  status: SkillCallStatus
  error?: string
  className?: string
}

export function SkillCallDisplay({ arguments: rawArguments, result, status, error, className = '' }: SkillCallDisplayProps) {
  const { t } = useAppTranslation()
  const [isExpanded, setIsExpanded] = useState(false)
  const contentId = useId()
  const { skillName, description } = parseSkillCallDetails(rawArguments, result)
  const formattedArguments = formatSkillArguments(rawArguments)
  const statusLabel = status === 'running'
    ? t('skillCall.loading')
    : status === 'error'
      ? t('skillCall.loadFailed')
      : t('skillCall.loaded')
  const StatusIcon = status === 'running' ? Loader2 : status === 'error' ? CircleAlert : BadgeCheck
  const statusClass = status === 'running'
    ? 'text-accent-500 animate-spin motion-reduce:animate-none'
    : status === 'error'
      ? 'text-danger-500'
      : 'text-emerald-500'

  return (
    <div className={`rounded-xl border border-accent-200/70 dark:border-accent-800/45 bg-accent-50/45 dark:bg-accent-950/15 overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        aria-label={t('skillCall.toggleDetails', { name: skillName })}
        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left cursor-pointer hover:bg-accent-100/55 dark:hover:bg-accent-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/60 transition-colors motion-reduce:transition-none"
      >
        <div className="w-6 h-6 rounded-md bg-accent-100 dark:bg-accent-900/40 flex items-center justify-center flex-shrink-0">
          <Sparkles size={13} className="text-accent-600 dark:text-accent-400" aria-hidden="true" />
        </div>
        <span className="min-w-0 flex-1 text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
          {t('skillCall.loadingSkill', { name: skillName })}
        </span>
        <StatusIcon size={14} className={`flex-shrink-0 ${statusClass}`} aria-hidden="true" />
        <span className="text-xs text-muted whitespace-nowrap">{statusLabel}</span>
        {isExpanded ? (
          <ChevronDown size={15} className="flex-shrink-0 text-muted" aria-hidden="true" />
        ) : (
          <ChevronRight size={15} className="flex-shrink-0 text-muted" aria-hidden="true" />
        )}
      </button>

      <div
        id={contentId}
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr', opacity: isExpanded ? 1 : 0 }}
        aria-hidden={!isExpanded}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-3 pb-3 pt-2.5 border-t border-accent-200/60 dark:border-accent-800/35 space-y-3">
            <section>
              <p className="text-xs font-medium text-accent-700 dark:text-accent-300">
                {t('skillCall.loadingSkill', { name: skillName })}
              </p>
            </section>

            <section>
              <p className="text-xs font-medium text-muted mb-1">{t('skillCall.description')}</p>
              <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words">
                {description || t('skillCall.descriptionUnavailable')}
              </p>
            </section>

            <section>
              <p className="text-xs font-medium text-muted mb-1">{t('skillCall.arguments')}</p>
              <pre className="text-xs leading-relaxed bg-white/70 dark:bg-surface-900/45 border border-surface-200/60 dark:border-surface-700/45 rounded-lg p-2.5 font-mono overflow-x-auto whitespace-pre-wrap break-words">
                {formattedArguments}
              </pre>
            </section>

            {status === 'error' && error && (
              <p className="text-xs leading-relaxed text-danger-600 dark:text-danger-400 whitespace-pre-wrap break-words">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
