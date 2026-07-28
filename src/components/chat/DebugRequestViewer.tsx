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
      // fallback
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
  defaultExpanded = false
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

interface DebugRequestViewerProps {
  messageId: string
}

export function DebugRequestViewer({ messageId }: DebugRequestViewerProps) {
  const { t } = useAppTranslation()
  const debugInfo = useDebugStore((s) => s.getDebugInfo(messageId))
  const debugMode = useDebugStore((s) => s.debugMode)
  const [open, setOpen] = useState(false)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  const handleOpen = useCallback(() => setOpen(true), [])
  const handleClose = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKeyDown)
    closeBtnRef.current?.focus()
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, handleClose])

  // 调试模式未开启或没有调试信息时不显示
  if (!debugMode || !debugInfo) {
    return null
  }

  const timeFormatted = new Date(debugInfo.timestamp).toLocaleString()

  // 美化请求体 JSON
  const prettyRequestBody = (() => {
    try {
      return JSON.stringify(JSON.parse(debugInfo.requestBody), null, 2)
    } catch {
      return debugInfo.requestBody
    }
  })()

  // 美化响应体（SSE 流逐行美化）
  const prettyResponseBody = (() => {
    try {
      const lines = debugInfo.responseBody.split('\n')
      return lines.map((line) => {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) return line
        const data = trimmed.slice(6)
        if (data === '[DONE]') return line
        try {
          return `data: ${JSON.stringify(JSON.parse(data), null, 2)}`
        } catch {
          return line
        }
      }).join('\n')
    } catch {
      return debugInfo.responseBody
    }
  })()

  // 敏感 header 键名列表（不区分大小写）
  const sensitiveHeaderKeys = [
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

  const isSensitiveHeader = (key: string): boolean => {
    const lowerKey = key.toLowerCase()
    return sensitiveHeaderKeys.some((sk) => lowerKey === sk || lowerKey.includes('api-key') || lowerKey.includes('apikey') || lowerKey.includes('api_key'))
  }

  // 格式化请求头（隐藏敏感信息）
  const formattedRequestHeaders = Object.entries(debugInfo.requestHeaders)
    .map(([k, v]) => {
      if (isSensitiveHeader(k)) {
        return `${k}: ***隐藏***`
      }
      return `${k}: ${v}`
    })
    .join('\n')

  // 格式化响应头
  const formattedResponseHeaders = Object.entries(debugInfo.responseHeaders)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')

  const modalContent = open ? (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.debugTitle')}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className="bg-white dark:bg-surface-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-700">
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-surface-500" />
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
              {t('chat.debugTitle')}
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Meta info */}
        <div className="px-5 py-3 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-700 text-xs text-surface-500 dark:text-surface-400 flex flex-wrap gap-x-4 gap-y-1">
          <span>{t('chat.debugMethod')}: <code className="font-mono">{debugInfo.method}</code></span>
          <span>{t('chat.debugUrl')}: <code className="font-mono break-all">{debugInfo.url}</code></span>
          <span>{t('chat.debugStatus')}: <code className="font-mono">{debugInfo.responseStatus}</code></span>
          <span>{t('chat.debugTime')}: {timeFormatted}</span>
          {debugInfo.agentInfo && (
            <span>{t('chat.debugAgent')}: {debugInfo.agentInfo.agentName} ({debugInfo.agentInfo.isLeader ? t('chat.debugLeader') : t('chat.debugSubAgent')})</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <CollapsibleSection title={t('chat.debugRequestHeaders')} defaultExpanded>
            <CodeBlock content={formattedRequestHeaders} />
          </CollapsibleSection>

          <CollapsibleSection title={t('chat.debugRequestBody')} defaultExpanded>
            <CodeBlock content={prettyRequestBody} />
          </CollapsibleSection>

          <CollapsibleSection title={t('chat.debugResponseHeaders')}>
            <CodeBlock content={formattedResponseHeaders} />
          </CollapsibleSection>

          <CollapsibleSection title={t('chat.debugResponseBody')}>
            <CodeBlock content={prettyResponseBody} />
          </CollapsibleSection>
        </div>
      </div>
    </div>
  ) : null

  return (
    <>
      <button
        onClick={handleOpen}
        className="p-1.5 rounded-md hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
        aria-label={t('chat.debugView')}
        title={t('chat.debugView')}
      >
        <Bug className="w-4 h-4" />
      </button>

      {modalContent && createPortal(modalContent, document.body)}
    </>
  )
}
