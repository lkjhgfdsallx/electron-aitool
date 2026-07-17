/**
 * 文件预览组件 - 只读文件内容查看
 *
 * 功能：
 * - 通过 IPC readFile 读取文件内容
 * - 显示文件路径、大小、语言标识
 * - 代码行号显示
 * - 大文件截断提示
 * - 关闭按钮
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { X, FileText, Copy, Check, AlertTriangle } from 'lucide-react'
import hljs from 'highlight.js'
import { workspaceFsService } from '../../services/workspace-fs-service'
import { useAppTranslation } from '../../i18n/hooks'

// ---- Props ----

interface FilePreviewProps {
  /** 文件绝对路径 */
  filePath: string
  /** 关闭预览 */
  onClose: () => void
}

// ---- 组件 ----

export function FilePreview({ filePath, onClose }: FilePreviewProps) {
  const { t } = useAppTranslation()
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [totalSize, setTotalSize] = useState(0)
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const fileName = filePath.split(/[/\\]/).pop() || filePath
  const ext = fileName.includes('.') ? `.${fileName.split('.').pop()}` : ''
  const language = workspaceFsService.getLanguage(ext)
  const isText = workspaceFsService.isTextFile(ext)

  // 加载文件内容
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setContent('')

    if (!isText) {
      setLoading(false)
      setError(t('workspace.unsupportedTextPreview'))
      return
    }

    workspaceFsService
      .readFile(filePath)
      .then((result) => {
        if (cancelled) return
        if (result.success && result.content !== undefined) {
          setContent(result.content)
          setTruncated(result.truncated || false)
          setTotalSize(result.totalSize || 0)
        } else {
          setError(result.error || t('workspace.readFileFailed'))
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [filePath, isText, t])

  // 复制内容
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // fallback
    }
  }

  // 行号
  const lines = content.split('\n')
  const lineCount = lines.length

  // 代码高亮
  const highlightedHtml = useMemo(() => {
    if (!content) return ''
    const lang = language !== 'text' && hljs.getLanguage(language) ? language : undefined
    try {
      return lang
        ? hljs.highlight(content, { language: lang }).value
        : hljs.highlightAuto(content).value
    } catch {
      return content
    }
  }, [content, language])

  return (
    <div className="flex flex-col h-full bg-white dark:bg-surface-900">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 h-9 border-b border-surface-200 dark:border-surface-700/60 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} className="text-gray-400 flex-shrink-0" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
            {fileName}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
            {language}
          </span>
          {totalSize > 0 && (
            <span className="text-[10px] text-gray-300 dark:text-gray-600 flex-shrink-0">
              {workspaceFsService.formatSize(totalSize)}
            </span>
          )}
          {truncated && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-500 flex-shrink-0">
              <AlertTriangle size={10} />
              {t('workspace.truncated')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title={t('workspace.copyContent')}
          >
            {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title={t('workspace.closePreview')}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* 文件路径面包屑 */}
      <div className="px-3 py-1 border-b border-surface-100 dark:border-surface-800 text-[10px] text-gray-400 dark:text-gray-500 truncate flex-shrink-0">
        {filePath}
      </div>

      {/* 内容 */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="w-4 h-4 border-2 border-teal-400/30 border-t-teal-500 rounded-full animate-spin" />
              {t('common.loading')}
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <AlertTriangle size={24} className="text-amber-400 mb-2" />
            <p className="text-xs text-gray-500 dark:text-gray-400">{error}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{fileName}</p>
          </div>
        ) : (
          <div className="flex font-mono text-[12px] leading-[1.6]">
            {/* 行号列 */}
            <div className="flex-shrink-0 text-right pr-3 pl-3 py-2 select-none border-r border-surface-100 dark:border-surface-800">
              {lines.map((_, i) => (
                <div key={i} className="text-gray-300 dark:text-gray-600">
                  {i + 1}
                </div>
              ))}
            </div>
            {/* 内容列（带语法高亮） */}
            <pre className="flex-1 py-2 px-3 overflow-x-auto whitespace-pre">
              <code
                className="hljs"
                dangerouslySetInnerHTML={{ __html: highlightedHtml || content }}
              />
            </pre>
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      {!loading && !error && (
        <div className="flex items-center justify-between px-3 py-1 border-t border-surface-100 dark:border-surface-800 text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
          <span>{lineCount} 行</span>
          <span>{language}</span>
        </div>
      )}
    </div>
  )
}
