import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Copy,
  Pencil,
  RotateCcw,
  Check,
  User,
  Bot,
  Wrench,
  AlertCircle,
  Clock,
  FileText,
  Image,
  FileIcon,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Eye,
  Download,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react'
import { MarkdownRenderer } from '../ui/MarkdownRenderer'
import { SelectionBoundary } from '../ui/SelectionBoundary'
import { ThinkingSection } from './ThinkingSection'
import { ToolCallDisplay } from './ToolCallDisplay'
import { AgentStepDisplay } from './AgentStepDisplay'
import { SiteAnalyzerProgressPanel } from './SiteAnalyzerProgressPanel'
import { reportStore } from '../../services/report-store'
import type { Message } from '../../types'

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

interface MessageItemProps {
  message: Message
  showTimestamp?: boolean
  showTokenUsage?: boolean
  onRegenerate?: (messageId: string) => void
  onEdit?: (messageId: string, content: string) => void
  /** 编辑并重新发送（创建对话分支） */
  onEditAndResend?: (messageId: string, content: string) => void
  onHumanInput?: (stepId: string, value: string | string[]) => void
  /** 继续执行出错的 Agent 任务 */
  onResumeAgentTask?: (messageId: string) => void
  /** 当前激活的分支索引（仅分支点消息有效） */
  activeBranchIndex?: number
  /** 切换分支回调 */
  onSwitchBranch?: (forkMessageId: string, branchIndex: number) => void
}

const roleConfig = {
  user: { icon: User, bgClass: 'bg-primary-500', label: '用户' },
  assistant: { icon: Bot, bgClass: 'bg-emerald-500', label: 'AI' },
  system: { icon: AlertCircle, bgClass: 'bg-gray-500', label: '系统' },
  tool: { icon: Wrench, bgClass: 'bg-amber-500', label: '工具' }
}

export function MessageItem({
  message,
  showTimestamp = true,
  showTokenUsage = true,
  onRegenerate,
  onEdit,
  onEditAndResend,
  onHumanInput,
  onResumeAgentTask,
  activeBranchIndex = 0,
  onSwitchBranch
}: MessageItemProps) {
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [showReport, setShowReport] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [loadedReportHtml, setLoadedReportHtml] = useState<string | null>(null)

  const role = roleConfig[message.role]
  const RoleIcon = role.icon

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content])

  const handleSaveEdit = useCallback(() => {
    onEdit?.(message.id, editContent)
    setIsEditing(false)
  }, [message.id, editContent, onEdit])

  const handleEditAndResend = useCallback(() => {
    onEditAndResend?.(message.id, editContent)
    setIsEditing(false)
  }, [message.id, editContent, onEditAndResend])

  // 打开报告弹窗（从 IndexedDB 加载）
  const handleOpenReport = useCallback(async () => {
    const html = await reportStore.getReport(message.id)
    if (html) {
      setLoadedReportHtml(html)
      setShowReport(true)
    }
  }, [message.id])

  // 下载报告为HTML文件
  const handleDownloadReport = useCallback(() => {
    if (!loadedReportHtml) return
    const blob = new Blob([loadedReportHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `网站分析报告-${new Date().toISOString().slice(0, 10)}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [loadedReportHtml])

  // 工具消息特殊显示
  if (message.role === 'tool') {
    return (
      <div className="flex gap-3 px-4 py-2 ml-10">
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center">
          <Wrench size={14} className="text-white" />
        </div>
        <div className="flex-1 min-w-0 selection-boundary-parent">
          <div className="text-xs text-gray-500 mb-1">
            工具结果: {message.toolName}
          </div>
          <SelectionBoundary>
            <pre className="text-sm bg-gray-100 dark:bg-gray-800 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
              {formatToolResult(message.content)}
            </pre>
          </SelectionBoundary>
        </div>
      </div>
    )
  }

  // 是否为 Agent 模式消息
  const hasAgentSteps = message.agentSteps && message.agentSteps.length > 0

  // 是否为分支点（用户消息且有多个分支）
  const isForkPoint = message.role === 'user' && (message.branchCount ?? 0) > 1

  return (
    <div className={`flex gap-3 px-4 py-3 group ${message.isError ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
      {/* 头像 */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full ${role.bgClass} flex items-center justify-center`}
      >
        <RoleIcon size={16} className="text-white" />
      </div>

      {/* 内容区域 */}
      <div className="flex-1 min-w-0 selection-boundary-parent">
        {/* 头部信息 */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {role.label}
          </span>
          {hasAgentSteps && (
            <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded">
              Agent
            </span>
          )}
          {showTimestamp && (
            <span className="text-xs text-gray-400">
              {formatTime(message.timestamp)}
            </span>
          )}
          {showTokenUsage && message.tokenUsage && (
            <span className="text-xs text-gray-400">
              {message.tokenUsage.totalTokens} tokens
            </span>
          )}
          {message.isStreaming && (
            <span className="text-xs text-blue-500 animate-pulse">生成中...</span>
          )}
        </div>

        {/* 思考过程 */}
        {message.reasoningContent && (
          <SelectionBoundary>
            <ThinkingSection content={message.reasoningContent} />
          </SelectionBoundary>
        )}

        {/* 网站分析实时进度面板 */}
        {message.siteAnalyzerProgress && (
          <SiteAnalyzerProgressPanel progress={message.siteAnalyzerProgress} />
        )}

        {/* 工具调用 */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <SelectionBoundary>
            <ToolCallDisplay toolCalls={message.toolCalls} />
          </SelectionBoundary>
        )}

        {/* Agent 执行步骤 */}
        {hasAgentSteps && (
          <SelectionBoundary>
            <AgentStepDisplay
              steps={message.agentSteps!}
              isRunning={message.isStreaming}
              onHumanInput={onHumanInput}
              onResumeAgentTask={onResumeAgentTask ? () => onResumeAgentTask(message.id) : undefined}
              isError={message.isError}
            />
          </SelectionBoundary>
        )}

        {/* 消息内容 */}
        <SelectionBoundary>
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full p-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y"
                rows={4}
              />
              <div className="flex gap-2">
                {onEditAndResend && (
                  <button
                    onClick={handleEditAndResend}
                    className="px-3 py-1 text-xs bg-primary-500 text-white rounded hover:bg-primary-600"
                  >
                    保存并重新发送
                  </button>
                )}
                {onEdit && !onEditAndResend && (
                  <button
                    onClick={handleSaveEdit}
                    className="px-3 py-1 text-xs bg-primary-500 text-white rounded hover:bg-primary-600"
                  >
                    保存
                  </button>
                )}
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <MarkdownRenderer content={message.content} />
              {/* 已编辑标记 */}
              {message.isEdited && (
                <span className="text-xs text-gray-400 italic ml-1">(已编辑)</span>
              )}
            </>
          )}
        </SelectionBoundary>

        {/* 附件显示 */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.attachments.map((att, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs border border-gray-200 dark:border-gray-700"
              >
                {att.type.startsWith('image/') ? (
                  <Image size={14} className="text-blue-500 flex-shrink-0" />
                ) : att.type === 'application/pdf' ? (
                  <FileText size={14} className="text-red-500 flex-shrink-0" />
                ) : att.type.includes('word') || att.type.includes('document') ? (
                  <FileText size={14} className="text-blue-600 flex-shrink-0" />
                ) : (
                  <FileIcon size={14} className="text-gray-500 flex-shrink-0" />
                )}
                <span className="text-gray-700 dark:text-gray-300 max-w-[150px] truncate">
                  {att.name}
                </span>
                <span className="text-gray-400">
                  {formatFileSize(att.size)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 分支导航（仅分支点用户消息显示） */}
        {isForkPoint && !isEditing && (
          <div className="flex items-center gap-1.5 mt-2">
            <GitBranch size={12} className="text-gray-400" />
            <button
              onClick={() => onSwitchBranch?.(message.id, Math.max(0, activeBranchIndex - 1))}
              disabled={activeBranchIndex <= 0}
              className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
              title="上一个分支"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-gray-500 tabular-nums">
              {activeBranchIndex + 1} / {message.branchCount}
            </span>
            <button
              onClick={() => onSwitchBranch?.(message.id, Math.min((message.branchCount ?? 1) - 1, activeBranchIndex + 1))}
              disabled={activeBranchIndex >= (message.branchCount ?? 1) - 1}
              className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
              title="下一个分支"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          )}
  
          {/* 网站分析报告查看按钮 */}
          {!message.isStreaming && message.hasReport && (
            <div className="mt-3">
              <button
                onClick={handleOpenReport}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg hover:from-blue-600 hover:to-indigo-700 shadow-sm transition-all hover:shadow-md"
              >
                <Eye size={16} />
                查看交互式分析报告
              </button>
            </div>
          )}
  
          {/* 操作按钮 */}
        {!message.isStreaming && !isEditing && (
          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              title="复制"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? '已复制' : '复制'}
            </button>
            {message.role === 'user' && (onEdit || onEditAndResend) && (
              <button
                onClick={() => {
                  setEditContent(message.content)
                  setIsEditing(true)
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                title="编辑"
              >
                <Pencil size={12} />
                编辑
              </button>
            )}
            {message.role === 'assistant' && onRegenerate && (
              <button
                onClick={() => onRegenerate(message.id)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                title="重新生成"
              >
                <RotateCcw size={12} />
                重新生成
              </button>
            )}
          </div>
        )}
      </div>

      {/* 网站分析报告弹窗 */}
      {showReport && loadedReportHtml && (
        <ReportModal
          reportHtml={loadedReportHtml}
          isFullscreen={isFullscreen}
          onClose={() => { setShowReport(false); setIsFullscreen(false) }}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          onDownload={handleDownloadReport}
        />
      )}
    </div>
  )
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatToolResult(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    return content
  }
}

/** 报告弹窗组件 */
interface ReportModalProps {
  reportHtml: string
  isFullscreen: boolean
  onClose: () => void
  onToggleFullscreen: () => void
  onDownload: () => void
}

function ReportModal({ reportHtml, isFullscreen, onClose, onToggleFullscreen, onDownload }: ReportModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const blobUrlRef = useRef<string | null>(null)

  // 使用 Blob URL 加载 HTML（比 srcdoc 更快，浏览器可流式处理）
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    // 清理上一个 Blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
    }

    const blob = new Blob([reportHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    blobUrlRef.current = url
    iframe.src = url

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [reportHtml])

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none'
          : 'w-[95vw] h-[90vh] max-w-[1600px]'
      }`}>
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <FileText size={18} className="text-blue-500" />
            网站分析交互式报告
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={onDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
              title="下载HTML报告"
            >
              <Download size={14} />
              下载报告
            </button>
            <button
              onClick={onToggleFullscreen}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="关闭"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 报告内容 */}
        <iframe
          ref={iframeRef}
          className="flex-1 w-full border-0 bg-white"
          title="网站分析报告"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  )
}
