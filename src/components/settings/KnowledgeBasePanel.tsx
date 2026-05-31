import { useState, useCallback, useEffect } from 'react'
import { X, Upload, Trash2, FileText, AlertCircle, Loader2 } from 'lucide-react'
import { useKnowledgeBaseStore } from '../../stores/knowledge-base-store'
import { knowledgeBaseService } from '../../services/knowledge-base-service'
import type { KnowledgeBaseFile } from '../../types'

interface KnowledgeBasePanelProps {
  onClose: () => void
}

export function KnowledgeBasePanel({ onClose }: KnowledgeBasePanelProps) {
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
      // 重置 input
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
    ready: { text: '就绪', color: 'text-green-500' },
    error: { text: '错误', color: 'text-red-500' }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold">知识库</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* 上传区域 */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <label
          className={`flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
            uploading
              ? 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 cursor-not-allowed'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950/20'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 size={20} className="animate-spin text-gray-400" />
              <span className="text-sm text-gray-500">{uploadProgress}</span>
            </>
          ) : (
            <>
              <Upload size={20} className="text-gray-400" />
              <span className="text-sm text-gray-500">
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
      </div>

      {/* 文件列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <FileText size={36} className="mx-auto mb-3" />
            <p>暂无文件</p>
            <p className="text-sm mt-1">上传文件以构建知识库</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => {
              const status = statusLabel[file.status]
              return (
                <div
                  key={file.id}
                  className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="text-sm font-medium truncate">{file.name}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>{formatFileSize(file.size)}</span>
                        <span>{file.chunkCount} 个分块</span>
                        <span className={status.color}>{status.text}</span>
                      </div>
                      {file.errorMessage && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-red-500">
                          <AlertCircle size={12} />
                          {file.errorMessage}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500"
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
