import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Bug, X, Copy, ChevronDown, ChevronRight } from 'lucide-react'
import { useDebugStore, type DebugRequestInfo } from '../../stores/debug-store'
import { useAppTranslation } from '../../i18n/hooks'

function CodeBlock({ content, label }: { content: string; label?: string }) {
  const { t } = useAppTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = content
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }, [content])

  return (
    <div className="relative group">
      {label && (
        <div className="text-xs text-surface-500 dark:text-surface-400 mb-1 font-medium">{label}</div>
      )}
      <pre className="bg-surface-900 dark:bg-surface-950 text-green-400 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
        {content}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-surface-700/80 hover:bg-surface-600 text-surface-300 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label={t('chat.debugCopy')}
        title={t('chat.debugCopy')}
      >
        {copied ? (
          <span className="text-xs text-green-400">✓</span>
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  )
}

function CollapsibleSection({
  title,
  children,
  defaultExpanded = false,
}: {
  title: string
  children: React.ReactNode
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-surface-700 dark:text-surface-300 bg-surface-50 dark:bg-surface-800/50 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
        )}
        <span>{title}</span>
      </button>
      {expanded && <div className="p-3">{children}</div>}
    </div>
  )
}

function prettyRequestBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

function prettyResponseBody(body: string): string {
  try {
    const lines = body.split('\n')
    return lines
      .map((line) => {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) return line
        const data = trimmed.slice(6)
        if (data === '[DONE]') return line
        try {
          return `data: ${JSON.stringify(JSON.parse(data), null, 2)}`
        } catch {
          return line
        }
      })
      .join('\n')
  } catch {
    return body
  }
}

const SENSITIVE_HEADER_KEYS = [
  'authorization',
  'api-key',
  'apikey',
  'x-api-key',
  'x-apikey',
  'api_key',
  'x-api_key',
  'openai-api-key',
  'anthropic-api-key',
  'x-goog-api-key',
  'x-genai-api-key',
]

function isSensitiveHeader(key: string): boolean {
  const lowerKey = key.toLowerCase()
  return SENSITIVE_HEADER_KEYS.some(
    (sk) =>
      lowerKey === sk ||
      lowerKey.includes('api-key') ||
      lowerKey.includes('apikey') ||
      lowerKey.includes('api_key')
  )
}

function formatHeaders(headers: Record<string, string>, maskSensitive: boolean): string {
  return Object.entries(headers)
    .map(([k, v]) => {
      if (maskSensitive && isSensitiveHeader(k)) return `${k}: ***隐藏***`
      return `${k}: ${v}`
    })
    .join('\n')
}

function statusColorClass(status: number): string {
  if (status >= 200 && status < 300) return 'text-emerald-600 dark:text-emerald-400'
  if (status >= 400 && status < 500) return 'text-amber-600 dark:text-amber-400'
  if (status >= 500) return 'text-danger-600 dark:text-danger-400'
  return 'text-surface-500'
}

function extractModelHint(requestBody: string): string | undefined {
  try {
    const parsed = JSON.parse(requestBody) as { model?: string }
    return typeof parsed.model === 'string' ? parsed.model : undefined
  } catch {
    return undefined
  }
}

type RoleFilter = 'all' | 'leader' | 'sub' | 'chat'

interface DebugRequestViewerProps {
  messageId: string
}

export function DebugRequestViewer({ messageId }: DebugRequestViewerProps) {
  const { t } = useAppTranslation()
  const debugMode = useDebugStore((s) => s.debugMode)
  // 订阅底层 map，保证追加请求后组件重渲染
  const entryIds = useDebugStore((s) => s.entryIdsByMessageId[messageId])
  const entriesById = useDebugStore((s) => s.entriesById)
  const entries = useMemo(() => {
    if (!entryIds?.length) return [] as DebugRequestInfo[]
    return entryIds
      .map((id) => entriesById[id])
      .filter((e): e is DebugRequestInfo => Boolean(e))
  }, [entryIds, entriesById])
  const count = entries.length
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const handleOpen = useCallback(() => setOpen(true), [])
  const handleClose = useCallback(() => setOpen(false), [])

  const agentOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entries) {
      if (e.agentInfo) map.set(e.agentInfo.agentId, e.agentInfo.agentName)
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [entries])

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (roleFilter === 'leader' && !e.agentInfo?.isLeader) return false
      if (roleFilter === 'sub' && !(e.agentInfo && !e.agentInfo.isLeader)) return false
      if (roleFilter === 'chat' && e.agentInfo) return false
      if (agentFilter !== 'all' && e.agentInfo?.agentId !== agentFilter) return false
      return true
    })
  }, [entries, roleFilter, agentFilter])

  // 打开或列表变化时：默认选中最新一条（过滤后）
  useEffect(() => {
    if (!open) return
    if (filtered.length === 0) {
      setSelectedId(null)
      return
    }
    const stillValid = selectedId && filtered.some((e) => e.id === selectedId)
    if (!stillValid) {
      setSelectedId(filtered[filtered.length - 1].id)
    }
  }, [open, filtered, selectedId])

  const selected = useMemo(
    () => filtered.find((e) => e.id === selectedId) ?? null,
    [filtered, selectedId]
  )

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
        return
      }
      if (filtered.length === 0) return
      const idx = filtered.findIndex((item) => item.id === selectedId)
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = filtered[Math.min(filtered.length - 1, Math.max(0, idx) + 1)]
        if (next) setSelectedId(next.id)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = filtered[Math.max(0, (idx < 0 ? filtered.length : idx) - 1)]
        if (prev) setSelectedId(prev.id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    closeBtnRef.current?.focus()
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, handleClose, filtered, selectedId])

  if (!debugMode || count === 0) {
    return null
  }

  const detailContent = selected ? (
    <DebugRequestDetail entry={selected} />
  ) : (
    <div className="flex items-center justify-center h-full text-sm text-surface-500 p-6">
      {t('chat.debugNoMatchingRequests')}
    </div>
  )

  const modalContent = open ? (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.debugTitle')}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="bg-white dark:bg-surface-900 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-surface-200 dark:border-surface-700 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Bug className="w-5 h-5 text-surface-500 flex-shrink-0" />
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100 truncate">
              {t('chat.debugTitle')}
            </h2>
            <span className="text-xs text-surface-500 dark:text-surface-400 flex-shrink-0">
              {t('chat.debugRequestCount', { count })}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            <label className="sr-only" htmlFor="debug-role-filter">
              {t('chat.debugFilterRole')}
            </label>
            <select
              id="debug-role-filter"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
              className="text-xs rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2 py-1.5 text-surface-700 dark:text-surface-300"
            >
              <option value="all">{t('chat.debugFilterAll')}</option>
              <option value="leader">{t('chat.debugFilterLeader')}</option>
              <option value="sub">{t('chat.debugFilterSub')}</option>
              <option value="chat">{t('chat.debugFilterChat')}</option>
            </select>
            {agentOptions.length > 0 && (
              <>
                <label className="sr-only" htmlFor="debug-agent-filter">
                  {t('chat.debugFilterAgent')}
                </label>
                <select
                  id="debug-agent-filter"
                  value={agentFilter}
                  onChange={(e) => setAgentFilter(e.target.value)}
                  className="text-xs rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-2 py-1.5 text-surface-700 dark:text-surface-300 max-w-[140px]"
                >
                  <option value="all">{t('chat.debugFilterAllAgents')}</option>
                  {agentOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button
              ref={closeBtnRef}
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body: master-detail */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* List */}
          <div
            ref={listRef}
            className="md:w-72 flex-shrink-0 border-b md:border-b-0 md:border-r border-surface-200 dark:border-surface-700 overflow-y-auto max-h-40 md:max-h-none"
            role="listbox"
            aria-label={t('chat.debugRequestList')}
          >
            {filtered.length === 0 ? (
              <div className="p-4 text-xs text-surface-500">{t('chat.debugNoMatchingRequests')}</div>
            ) : (
              filtered.map((entry) => {
                const isSelected = entry.id === selectedId
                const roleLabel = !entry.agentInfo
                  ? t('chat.debugRoleChat')
                  : entry.agentInfo.isLeader
                    ? t('chat.debugLeader')
                    : t('chat.debugSubAgent')
                const model = extractModelHint(entry.requestBody)
                const timeStr = new Date(entry.timestamp).toLocaleTimeString()
                return (
                  <button
                    key={entry.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => setSelectedId(entry.id)}
                    className={`w-full text-left px-3 py-2.5 border-b border-surface-100 dark:border-surface-800 transition-colors ${
                      isSelected
                        ? 'bg-accent-50 dark:bg-accent-950/30 border-l-2 border-l-accent-500'
                        : 'hover:bg-surface-50 dark:hover:bg-surface-800/60 border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold text-surface-800 dark:text-surface-200">
                        #{entry.sequence}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          !entry.agentInfo
                            ? 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300'
                            : entry.agentInfo.isLeader
                              ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                              : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                        }`}
                      >
                        {roleLabel}
                      </span>
                      {entry.roundIndex != null && (
                        <span className="text-[10px] text-surface-400">
                          {t('chat.debugRound', { n: entry.roundIndex })}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-surface-700 dark:text-surface-300 truncate">
                      {entry.agentInfo?.agentName ?? t('chat.normalChat')}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-surface-400">
                      <span className={statusColorClass(entry.responseStatus)}>
                        {entry.responseStatus || '—'}
                      </span>
                      <span>{timeStr}</span>
                      {model && <span className="truncate">{model}</span>}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Detail */}
          <div className="flex-1 min-w-0 overflow-y-auto">{detailContent}</div>
        </div>
      </div>
    </div>
  ) : null

  return (
    <>
      <button
        onClick={handleOpen}
        className="relative p-1.5 rounded-md hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
        aria-label={
          count > 1
            ? t('chat.debugViewWithCount', { count })
            : t('chat.debugView')
        }
        title={
          count > 1
            ? t('chat.debugViewWithCount', { count })
            : t('chat.debugView')
        }
      >
        <Bug className="w-4 h-4" />
        {count > 1 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-accent-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {modalContent && createPortal(modalContent, document.body)}
    </>
  )
}

function DebugRequestDetail({ entry }: { entry: DebugRequestInfo }) {
  const { t } = useAppTranslation()
  const timeFormatted = new Date(entry.timestamp).toLocaleString()
  const prettyReq = useMemo(() => prettyRequestBody(entry.requestBody), [entry.requestBody])
  const prettyRes = useMemo(() => prettyResponseBody(entry.responseBody), [entry.responseBody])
  const reqHeaders = useMemo(
    () => formatHeaders(entry.requestHeaders, true),
    [entry.requestHeaders]
  )
  const resHeaders = useMemo(
    () => formatHeaders(entry.responseHeaders, false),
    [entry.responseHeaders]
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-5 py-3 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-700 text-xs text-surface-500 dark:text-surface-400 flex flex-wrap gap-x-4 gap-y-1 flex-shrink-0">
        <span>
          {t('chat.debugMethod')}: <code className="font-mono">{entry.method}</code>
        </span>
        <span>
          {t('chat.debugUrl')}: <code className="font-mono break-all">{entry.url}</code>
        </span>
        <span>
          {t('chat.debugStatus')}:{' '}
          <code className={`font-mono ${statusColorClass(entry.responseStatus)}`}>
            {entry.responseStatus}
          </code>
        </span>
        <span>
          {t('chat.debugTime')}: {timeFormatted}
        </span>
        <span>
          #{entry.sequence}
          {entry.roundIndex != null && (
            <> · {t('chat.debugRound', { n: entry.roundIndex })}</>
          )}
        </span>
        {entry.agentInfo && (
          <span>
            {t('chat.debugAgent')}: {entry.agentInfo.agentName} (
            {entry.agentInfo.isLeader ? t('chat.debugLeader') : t('chat.debugSubAgent')})
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        <CollapsibleSection title={t('chat.debugRequestHeaders')} defaultExpanded>
          <CodeBlock content={reqHeaders} />
        </CollapsibleSection>
        <CollapsibleSection title={t('chat.debugRequestBody')} defaultExpanded>
          <CodeBlock content={prettyReq} />
        </CollapsibleSection>
        <CollapsibleSection title={t('chat.debugResponseHeaders')}>
          <CodeBlock content={resHeaders} />
        </CollapsibleSection>
        <CollapsibleSection title={t('chat.debugResponseBody')}>
          <CodeBlock content={prettyRes} />
        </CollapsibleSection>
      </div>
    </div>
  )
}
