import { useState, useCallback, useEffect } from 'react'
import { Upload, Trash2, FileText, AlertCircle, Loader2, Database } from 'lucide-react'
import { useKnowledgeBaseStore } from '../../stores/knowledge-base-store'
import { knowledgeBaseService } from '../../services/knowledge-base-service'
import type { KnowledgeBaseFile } from '../../types'

export function KnowledgeBasePanel() {
  const { files, isLoading, loadFiles, addFile, updateFile, deleteFile } =
    useKnowledgeBaseStore()

  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files
      if (!fileList || fileList.length === 0) return

      setUploading(true)

      for (const file of Array.from(fileList)) {
        setUploadProgress(`正在处理: ${file.name}`)

        try {
          const metadata = await knowledgeBaseService.uploadFile(file, (status) => {
            setUploadProgress(`${file.name}: ${status}`)
          })
          addFile(metadata)
        } catch (error) {
          console.error('上传失败:', error)
        }
      }

      setUploading(false)
      setUploadProgress('')
      e.target.value = ''
    },
    [addFile]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      if (confirm('确定删除此文件及其所有向量数据？')) {
        await deleteFile(id)
      }
    },
    [deleteFile]
  )

  const statusLabel: Record<KnowledgeBaseFile['status'], { text: string; color: string }> = {
    uploading: { text: '上传中', color: 'text-blue-500' },
    processing: { text: '处理中', color: 'text-amber-500' },
    ready: { text: '就绪', color: 'text-success-500' },
    error: { text: '错误', color: 'text-danger-500' }
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <Database size={20} className="text-violet-500" />
          知识库
        </h2>
        <p className="text-sm text-muted mt-1">
          上传文档构建知识库，让 AI 基于你的资料回答问题
        </p>
      </div>

      {/* 上传区域 */}
      <label
        className={`flex items-center justify-center gap-3 px-4 py-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          uploading
            ? 'border-surface-300 dark:border-surface-600 bg-surface-100 dark:bg-surface-800 cursor-not-allowed'
            : 'border-surface-300 dark:border-surface-600 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50/50 dark:hover:bg-violet-950/20'
        }`}
      >
        {uploading ? (
          <>
            <Loader2 size={20} className="animate-spin text-muted" />
            <span className="text-sm text-muted">{uploadProgress}</span>
          </>
        ) : (
          <>
            <Upload size={20} className="text-muted" />
            <span className="text-sm text-muted">
              点击或拖拽上传文件（支持 txt、md、json、csv）
            </span>
          </>
        )}
        <input
          type="file"
          multiple
          accept=".txt,.md,.json,.csv,.text"
          onChange={handleUpload}
          disabled={uploading}
          className="hidden"
        />
      </label>

      {/* 文件列表 */}
      <div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-muted" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center text-muted py-12">
            <FileText size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无文件</p>
            <p className="text-xs mt-1">上传文件以构建知识库</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => {
              const status = statusLabel[file.status]
              return (
                <div
                  key={file.id}
                  className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                          <FileText size={14} className="text-violet-600 dark:text-violet-400" />
                        </div>
                        <span className="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">{file.name}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 ml-10 text-xs text-muted">
                        <span>{formatFileSize(file.size)}</span>
                        <span>{file.chunkCount} 个分块</span>
                        <span className={status.color}>{status.text}</span>
                      </div>
                      {file.errorMessage && (
                        <div className="flex items-center gap-1 mt-1.5 ml-10 text-xs text-danger-500">
                          <AlertCircle size={12} />
                          {file.errorMessage}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="p-1.5 rounded-lg text-muted hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
