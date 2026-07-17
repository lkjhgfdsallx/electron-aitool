import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Square, Paperclip, X, Image, FileIcon, Loader2, Globe } from 'lucide-react'
import { useSettingsStore, usePromptStore } from '../../stores'
import { extractFileText } from '../../utils/file-extraction'
import { PromptSearchPanel } from './PromptSearchPanel'
import { VariableFillDialog } from './VariableFillDialog'
import { PromptVariableEngine } from '../../services/prompt-variable-engine'
import { SlashCommandMenu } from './SlashCommandMenu'
import { resolveSlashCommand } from '../../services/slash-command-service'
import type { SlashCommand } from '../../services/slash-command-service'
import type { MessageAttachment, Prompt, PromptRuntimeContext } from '../../types'
import { useAppTranslation } from '@/i18n/hooks'

interface MessageInputProps {
  onSend: (content: string, attachments?: MessageAttachment[]) => void
  onStop?: () => void
  isStreaming?: boolean
  disabled?: boolean
  onOpenPromptManager?: () => void
  runtimeContext?: PromptRuntimeContext
  /** 工作区路径（用于 Slash 命令加载自定义命令） */
  workspacePath?: string
  /** 是否处于工作区模式 */
  isWorkspaceMode?: boolean
}

/** 支持的文件类型 */
const ACCEPTED_FILE_TYPES = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp',
  'text/plain', 'text/markdown', 'text/csv', 'text/html', 'text/css', 'text/javascript', 'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'
]

const FILE_TYPE_LABELS: Record<string, string> = {
  'image/png': 'PNG 图片',
  'image/jpeg': 'JPEG 图片',
  'image/gif': 'GIF 图片',
  'image/webp': 'WebP 图片',
  'image/bmp': 'BMP 图片',
  'text/plain': 'TXT 文本',
  'text/markdown': 'Markdown',
  'text/csv': 'CSV',
  'text/html': 'HTML',
  'text/css': 'CSS',
  'text/javascript': 'JavaScript',
  'application/json': 'JSON',
  'application/pdf': 'PDF 文档',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word 文档',
  'application/msword': 'Word 文档'
}

/** 判断是否为图片类型 */
function isImageType(type: string): boolean {
  return type.startsWith('image/')
}

/** 判断是否为文本类型 */
function isTextType(type: string): boolean {
  return type.startsWith('text/') || type === 'application/json' || type === 'application/javascript'
}

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function MessageInput({ onSend, onStop, isStreaming = false, disabled = false, onOpenPromptManager, runtimeContext, workspacePath, isWorkspaceMode }: MessageInputProps) {
  const { t } = useAppTranslation()
  const [content, setContent] = useState('')
  const [attachments, setAttachments] = useState<MessageAttachment[]>([])
  const [isExtracting, setIsExtracting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { sendWithEnter, webSearchEnabled, toggleWebSearch } = useSettingsStore()
  const { prompts } = usePromptStore()

  // Slash 命令面板
  const [showSlashPanel, setShowSlashPanel] = useState(false)
  // 变量填写弹窗
  const [variablePrompt, setVariablePrompt] = useState<Prompt | null>(null)

  // 自动调整高度
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [content])

  // 检测 / 触发 Slash 面板
  useEffect(() => {
    if (content === '/' || content.startsWith('/')) {
      setShowSlashPanel(true)
    } else {
      setShowSlashPanel(false)
    }
  }, [content])

  const handleSend = useCallback(() => {
    if ((content.trim() || attachments.length > 0) && !isStreaming && !disabled) {
      onSend(content.trim(), attachments.length > 0 ? attachments : undefined)
      setContent('')
      setAttachments([])
    }
  }, [content, attachments, isStreaming, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Slash 面板激活时，不拦截方向键和回车
      if (showSlashPanel) return

      if (sendWithEnter) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          handleSend()
        }
      } else {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          handleSend()
        }
      }
    },
    [sendWithEnter, handleSend, showSlashPanel],
  )

  /** 处理文件选择 */
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    setIsExtracting(true)
    const newAttachments: MessageAttachment[] = []

    for (const file of Array.from(files)) {
      // 检查文件类型
      const isAccepted = ACCEPTED_FILE_TYPES.some(t => file.type === t) ||
        file.name.endsWith('.md') || file.name.endsWith('.txt') || file.name.endsWith('.csv') ||
        file.name.endsWith('.json') || file.name.endsWith('.js') || file.name.endsWith('.ts') ||
        file.name.endsWith('.css') || file.name.endsWith('.html')

      if (!isAccepted) {
        alert(t('chat.unsupportedFileType', { name: file.name, type: file.type || t('chat.unknownFileType') }))
        continue
      }

      // 限制文件大小 (图片 20MB, 其他 10MB)
      const maxSize = isImageType(file.type) ? 20 * 1024 * 1024 : 10 * 1024 * 1024
      if (file.size > maxSize) {
        alert(t('chat.fileTooLarge', { name: file.name, size: formatFileSize(file.size), maxSize: formatFileSize(maxSize) }))
        continue
      }

      try {
        let content: string

        if (isImageType(file.type)) {
          // 图片转 base64 data URL
          content = await readFileAsDataURL(file)
        } else if (isTextType(file.type) || isTextFileByName(file.name)) {
          // 文本文件读取文本内容
          content = await readFileAsText(file)
        } else {
          // PDF、Word 等二进制文件：尝试提取文本内容
          const extractedText = await extractFileText(file)
          if (extractedText) {
            content = extractedText
          } else {
            // 如果提取失败，回退到 base64（但标记为无法解析）
            content = t('chat.unreadableFile', { name: file.name, type: file.type })
          }
        }

        newAttachments.push({
          name: file.name,
          type: file.type || guessTypeByName(file.name),
          content,
          size: file.size
        })
      } catch (err) {
        console.error('读取文件失败:', err)
        alert(t('chat.readFileFailed', { name: file.name }))
      }
    }

    if (newAttachments.length > 0) {
      setAttachments(prev => [...prev, ...newAttachments])
    }

    setIsExtracting(false)

    // 重置 input 以允许重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [t])

  /** 移除附件 */
  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }, [])

  /** 从 Slash 命令菜单选择命令 */
  const handleSlashCommandSelect = useCallback(async (command: SlashCommand) => {
    setShowSlashPanel(false)

    // 解析命令并生成消息
    const input = content.startsWith('/') ? content : `/${command.name}`
    const resolved = await resolveSlashCommand(input, workspacePath)

    // 判断是否直接发送还是填入编辑区
    // 对于以 / 开头的模板（如 /checkpoint, /restore），直接发送
    // 对于自然语言模板（如 /init, /status），填入编辑区让用户确认
    const shouldAutoSend = resolved.message.startsWith('/')

    if (shouldAutoSend) {
      onSend(resolved.message)
      setContent('')
    } else {
      setContent(resolved.message)
      textareaRef.current?.focus()
    }
  }, [content, workspacePath, onSend])

  /** 从 Slash 面板选择提示词（保留原有 PromptSearchPanel 的兼容） */
  const handleSlashSelect = useCallback((prompt: Prompt) => {
    setShowSlashPanel(false)

    // 清除输入的 / 前缀
    setContent('')

    // 如果提示词有变量，弹出变量填写弹窗
    if (prompt.variables && prompt.variables.length > 0) {
      setVariablePrompt(prompt)
    } else {
      // 无变量，直接渲染并填入
      const text = prompt.sections
        ? prompt.sections.filter((s) => s.enabled).map((s) => s.content).join('\n\n')
        : prompt.content
      const rendered = PromptVariableEngine.render(text, prompt.variables || [], {}, runtimeContext)
      setContent(rendered.content)
      textareaRef.current?.focus()
    }
  }, [runtimeContext])

  /** 变量填写完成 */
  const handleVariableSubmit = useCallback((renderedContent: string) => {
    setVariablePrompt(null)
    setContent(renderedContent)
    textareaRef.current?.focus()
  }, [])

  return (
    <div className="border-t border-surface-200/80 dark:border-surface-700/60 bg-white/80 dark:bg-surface-900/80 backdrop-blur-sm p-4">
      <div className="max-w-3xl mx-auto">
        {/* 附件预览区 */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 px-2 py-1 bg-surface-50 dark:bg-surface-800/60 rounded-lg text-xs border border-surface-200/60 dark:border-surface-700/40"
              >
                {isImageType(att.type) ? (
                  <div className="relative">
                    <img
                      src={att.content}
                      alt={att.name}
                      className="w-8 h-8 object-cover rounded"
                    />
                  </div>
                ) : (
                  <FileIcon size={14} className="text-muted flex-shrink-0" />
                )}
                <span className="text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
                  {att.name}
                </span>
                <span className="text-muted">
                  {formatFileSize(att.size)}
                </span>
                <button
                  onClick={() => removeAttachment(index)}
                  aria-label={t('chat.removeAttachment', { name: att.name })}
                  title={t('chat.removeAttachment', { name: att.name })}
                  className="p-0.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-muted hover:text-danger-500 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="bg-surface-50 dark:bg-surface-800/80 rounded-2xl border border-surface-200/80 dark:border-surface-700/60 focus-within:border-accent-300 dark:focus-within:border-accent-600 focus-within:ring-2 focus-within:ring-accent-500/20 transition-all p-3">
          {/* 输入框 */}
          <textarea
            ref={textareaRef}
            data-chat-input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isExtracting ? t('chat.parsingFile') : isStreaming ? t('chat.responding') : t('chat.messagePlaceholder')}
            disabled={disabled || isStreaming || isExtracting}
            rows={1}
            className="w-full bg-transparent border-none outline-none resize-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400/80 dark:placeholder-gray-500/80 py-2 max-h-[200px]"
          />

          {/* 底部工具栏 */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-200/50 dark:border-gray-700/50 mt-1">
            <div className="flex items-center gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 p-1.5 text-muted hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 transition-all"
                title={t('chat.uploadFile')}
                aria-label={t('chat.uploadFile')}
              >
                <Paperclip size={18} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.txt,.md,.csv,.json,.js,.ts,.css,.html,.pdf,.doc,.docx"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* 联网搜索开关 */}
              <button
                onClick={toggleWebSearch}
                className={`flex-shrink-0 p-1.5 rounded-lg transition-all ${
                  webSearchEnabled
                    ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                    : 'text-muted hover:text-gray-600 dark:hover:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-700'
                }`}
                title={webSearchEnabled ? t('chat.webSearchEnabled') : t('chat.webSearch')}
                aria-label={webSearchEnabled ? t('chat.webSearchEnabled') : t('chat.webSearch')}
              >
                <Globe size={18} />
              </button>

            </div>

            {/* 发送/停止按钮 */}
            <div>
              {isStreaming ? (
                <button
                  onClick={onStop}
                  className="flex-shrink-0 p-2 bg-danger-500 hover:bg-danger-600 text-white rounded-xl transition-all"
                  title={t('chat.stopGenerating')}
                  aria-label={t('chat.stopGenerating')}
                >
                  <Square size={18} />
                </button>
              ) : isExtracting ? (
                <button
                  disabled
                  className="flex-shrink-0 p-1.5 bg-primary-400 text-white rounded-lg opacity-70 cursor-wait"
                  title={t('chat.parsingFile')}
                  aria-label={t('chat.parsingFile')}
                >
                  <Loader2 size={18} className="animate-spin" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={(!content.trim() && attachments.length === 0) || disabled}
                  className="flex-shrink-0 p-2 bg-gradient-to-br from-accent-500 to-purple-600 hover:from-accent-600 hover:to-purple-700 text-white rounded-xl shadow-sm hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('chat.sendMessage')}
                  aria-label={t('chat.sendMessage')}
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 提示文字 */}
        <div className="text-xs text-muted mt-2.5 text-center">
          {sendWithEnter ? t('chat.sendShortcut') : t('chat.sendShortcutCtrl')} · {t('chat.openPromptPanel').replace('/', '')}<kbd className="px-1 py-0.5 bg-surface-100 dark:bg-surface-800 rounded text-[10px]">/</kbd>{t('chat.openPromptPanel').split('/').slice(1).join('/')}
        </div>
      </div>

      {/* Slash 命令面板 */}
      {showSlashPanel && (
        <div className="fixed inset-0 z-30" onClick={() => setShowSlashPanel(false)}>
          <div
            className="absolute bottom-24 left-1/2 -translate-x-1/2 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <SlashCommandMenu
              query={content}
              workspacePath={workspacePath}
              isWorkspaceMode={isWorkspaceMode}
              onSelect={handleSlashCommandSelect}
              onClose={() => setShowSlashPanel(false)}
            />
          </div>
        </div>
      )}

      {/* 变量填写弹窗 */}
      {variablePrompt && (
        <VariableFillDialog
          prompt={variablePrompt}
          context={runtimeContext}
          onSubmit={handleVariableSubmit}
          onCancel={() => setVariablePrompt(null)}
        />
      )}
    </div>
  )
}

// ==================== 文件读取工具函数 ====================

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file, 'utf-8')
  })
}

function isTextFileByName(name: string): boolean {
  const textExtensions = ['.txt', '.md', '.csv', '.json', '.js', '.ts', '.css', '.html', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.log', '.sh', '.bash', '.py', '.rb', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.php', '.sql']
  const lower = name.toLowerCase()
  return textExtensions.some(ext => lower.endsWith(ext))
}

function guessTypeByName(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (lower.endsWith('.doc')) return 'application/msword'
  if (lower.endsWith('.txt')) return 'text/plain'
  if (lower.endsWith('.md')) return 'text/markdown'
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.csv')) return 'text/csv'
  return 'application/octet-stream'
}
