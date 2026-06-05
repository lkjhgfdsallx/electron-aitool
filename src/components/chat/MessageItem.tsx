import { useState, useCallback } from 'react'
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
  GitBranch
} from 'lucide-react'
import { MarkdownRenderer } from '../ui/MarkdownRenderer'
import { SelectionBoundary } from '../ui/SelectionBoundary'
import { ThinkingSection } from './ThinkingSection'
import { ToolCallDisplay } from './ToolCallDisplay'
import { AgentStepDisplay } from './AgentStepDisplay'
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
