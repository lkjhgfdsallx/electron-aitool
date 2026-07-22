/**
 * 底栏 Git Output 面板
 */

import { useEffect, useRef } from 'react'
import { Trash2, GitBranch } from 'lucide-react'
import { useWorkspaceGitStore } from '../../../stores/workspace-git-store'
import { useAppTranslation } from '../../../i18n/hooks'

export function GitOutputPanel() {
  const { t } = useAppTranslation()
  const outputLines = useWorkspaceGitStore((s) => s.outputLines)
  const clearOutput = useWorkspaceGitStore((s) => s.clearOutput)
  const ensureOutputSubscription = useWorkspaceGitStore((s) => s.ensureOutputSubscription)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ensureOutputSubscription()
  }, [ensureOutputSubscription])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [outputLines.length])

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface-950 text-surface-100">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-surface-800 flex-shrink-0">
        <GitBranch size={12} className="text-teal-400" />
        <span className="text-[11px] font-medium text-surface-300 flex-1">
          {t('workspace.gitOutput', { defaultValue: 'Git Output' })}
        </span>
        <button
          type="button"
          onClick={clearOutput}
          className="p-1 rounded hover:bg-surface-800 text-surface-400 hover:text-surface-200"
          title={t('common.clear')}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
        {outputLines.length === 0 ? (
          <div className="text-surface-500 py-6 text-center">
            {t('workspace.gitOutputEmpty', {
              defaultValue: 'Git command output will appear here',
            })}
          </div>
        ) : (
          outputLines.map((line) => {
            let color = 'text-surface-300'
            if (line.stream === 'command') color = 'text-teal-400'
            else if (line.stream === 'stderr') color = 'text-red-400'
            else if (line.stream === 'system') color = 'text-amber-400'
            return (
              <div key={line.id} className={`${color} whitespace-pre-wrap break-all`}>
                {line.text}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
