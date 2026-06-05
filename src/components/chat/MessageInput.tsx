import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Square, Paperclip, FileText, X, Image, FileIcon, Loader2 } from 'lucide-react'
import { useSettingsStore, usePromptStore } from '../../stores'
import { extractFileText } from '../../utils/file-extraction'
import type { MessageAttachment } from '../../types'

interface MessageInputProps {
  onSend: (content: string, attachments?: MessageAttachment[]) => void
  onStop?: () => void
  isStreaming?: boolean
  disabled?: boolean
  onOpenPromptManager?: () => void
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

function getFileTypeLabel(type: string): string {
  return FILE_TYPE_LABELS[type] || type
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

export function MessageInput({ onSend, onStop, isStreaming = false, disabled = false, onOpenPromptManager }: MessageInputProps) {
  const [content, setContent] = useState('')
  const [attachments, setAttachments] = useState<MessageAttachment[]>([])
  const [showPromptMenu, setShowPromptMenu] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { sendWithEnter } = useSettingsStore()
  const { prompts } = usePromptStore()

  // 自动调整高度
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
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
    [sendWithEnter, handleSend]
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
        alert(`不支持的文件类型: ${file.name} (${file.type || '未知'})`)
        continue
      }

      // 限制文件大小 (图片 20MB, 其他 10MB)
      const maxSize = isImageType(file.type) ? 20 * 1024 * 1024 : 10 * 1024 * 1024
      if (file.size > maxSize) {
        alert(`文件 ${file.name} 过大 (${formatFileSize(file.size)})，最大支持 ${formatFileSize(maxSize)}`)
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
            content = `[无法解析的文件: ${file.name}，类型: ${file.type}]`
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
        alert(`读取文件 ${file.name} 失败`)
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
  }, [])

  /** 移除附件 */
  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }, [])

  /** 选择提示词 */
  const handleSelectPrompt = useCallback((promptContent: string) => {
    setContent(prev => {
      const newContent = prev ? prev + '\n' + promptContent : promptContent
      return newContent
    })
    setShowPromptMenu(false)
    textareaRef.current?.focus()
  }, [])

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <div className="max-w-3xl mx-auto rounded-xl border border-transparent focus-within:border-primary-300 dark:focus-within:border-primary-600 focus-within:ring-1 focus-within:ring-primary-200/50 dark:focus-within:ring-primary-500/30 transition-colors p-1">
        {/* 附件预览区 */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs border border-gray-200 dark:border-gray-700"
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
                  <FileIcon size={14} className="text-gray-500 flex-shrink-0" />
                )}
                <span className="text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
                  {att.name}
                </span>
                <span className="text-gray-400">
                  {formatFileSize(att.size)}
                </span>
                <button
                  onClick={() => removeAttachment(index)}
                  className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-2">
          {/* 输入框 */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isExtracting ? '正在解析文件...' : isStreaming ? 'AI 正在回复...' : '输入消息...'}
            disabled={disabled || isStreaming || isExtracting}
            rows={1}
            className="w-full bg-transparent border-none outline-none resize-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 py-2 max-h-[200px]"
          />

          {/* 底部工具栏 */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-200/50 dark:border-gray-700/50 mt-1">
            <div className="flex items-center gap-1">
              {/* 附件按钮 */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="上传文件（图片、PDF、Word、TXT等）"
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

              {/* 提示词按钮 */}
              <div className="relative">
                <button
                  onClick={() => setShowPromptMenu(!showPromptMenu)}
                  className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  title="插入提示词"
                >
                  <FileText size={18} />
                </button>

                {/* 提示词下拉菜单 */}
                {showPromptMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowPromptMenu(false)}
                    />
                    <div className="absolute left-0 bottom-full z-20 mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[240px] max-h-[300px] overflow-y-auto">
                      <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <span>选择提示词</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowPromptMenu(false)
                            onOpenPromptManager?.()
                          }}
                          className="text-primary-500 hover:text-primary-600 text-xs"
                        >
                          管理
                        </button>
                      </div>
                      {prompts.length === 0 ? (
                        <div className="px-3 py-4 text-center text-gray-400 text-sm">
                          <p>暂无提示词</p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowPromptMenu(false)
                              onOpenPromptManager?.()
                            }}
                            className="text-primary-500 hover:text-primary-600 text-xs mt-1"
                          >
                            去创建
                          </button>
                        </div>
                      ) : (
                        prompts.map((prompt) => (
                          <button
                            key={prompt.id}
                            onClick={() => handleSelectPrompt(prompt.content)}
                            className="flex flex-col w-full px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                          >
                            <span className="font-medium text-gray-800 dark:text-gray-200">
                              {prompt.name}
                            </span>
                            {prompt.description && (
                              <span className="text-xs text-gray-400 truncate">
                                {prompt.description}
                              </span>
                            )}
                            <span className="text-xs text-gray-400 mt-0.5 truncate">
                              {prompt.content.slice(0, 60)}{prompt.content.length > 60 ? '...' : ''}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 发送/停止按钮 */}
            <div>
              {isStreaming ? (
                <button
                  onClick={onStop}
                  className="flex-shrink-0 p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  title="停止生成"
                >
                  <Square size={18} />
                </button>
              ) : isExtracting ? (
                <button
                  disabled
                  className="flex-shrink-0 p-1.5 bg-primary-400 text-white rounded-lg opacity-70 cursor-wait"
                  title="正在解析文件..."
                >
                  <Loader2 size={18} className="animate-spin" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={(!content.trim() && attachments.length === 0) || disabled}
                  className="flex-shrink-0 p-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="发送"
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 提示文字 */}
        <div className="text-xs text-gray-400 mt-2 text-center">
          {sendWithEnter ? 'Enter 发送，Shift+Enter 换行' : 'Ctrl+Enter 发送，Enter 换行'}
        </div>
      </div>
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
