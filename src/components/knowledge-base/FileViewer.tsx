import { useState, useEffect, useMemo, memo, useCallback } from 'react'
import {
  FileText,
  Loader2,
  ChevronDown,
  ChevronRight,
  Hash,
  AlertCircle,
  Brain,
  ArrowLeft,
  ChevronLeft as ChevronLeftIcon
} from 'lucide-react'
import type { KnowledgeBaseFile, KnowledgeBaseChunk } from '../../types'
import { useKnowledgeBaseStore } from '../../stores/knowledge-base-store'

const CHUNKS_PER_PAGE = 50

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}

const statusLabel: Record<KnowledgeBaseFile['status'], { text: string; color: string; bg: string }> = {
  uploading: { text: '上传中', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30' },
  processing: { text: '处理中', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  ready: { text: '就绪', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  error: { text: '错误', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30' }
}

// ==================== 分块卡片（memo 包裹） ====================

const ChunkCard = memo(function ChunkCard({ chunk, index }: { chunk: KnowledgeBaseChunk; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const preview = chunk.content.slice(0, 150)
  const isLong = chunk.content.length > 150

  const handleToggle = useCallback(() => {
    setExpanded(prev => !prev)
  }, [])

  return (
    <div className="bg-white dark:bg-surface-800/60 rounded-lg border border-surface-200/80 dark:border-surface-700/60 overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
      >
        <div className="w-6 h-6 rounded-md bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
          <Hash size={11} className="text-violet-500" />
        </div>
        <span className="text-xs font-medium text-surface-500 dark:text-surface-400">
          #{index + 1}
        </span>
        <span className="text-xs text-surface-400 dark:text-surface-500 flex-1 truncate">
          {preview}{isLong && !expanded ? '...' : ''}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {chunk.embeddingV2 && chunk.embeddingV2.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-500">
              <Brain size={10} />
              语义
            </span>
          )}
          {expanded ? (
            <ChevronDown size={14} className="text-surface-400" />
          ) : (
            <ChevronRight size={14} className="text-surface-400" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-surface-100 dark:border-surface-700/40 pt-2">
          <pre className="text-xs text-surface-700 dark:text-surface-300 whitespace-pre-wrap break-words font-sans leading-relaxed">
            {chunk.content}
          </pre>
          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-surface-100 dark:border-surface-700/40 text-[10px] text-surface-400">
            <span>内容长度: {chunk.content.length} 字符</span>
            <span>向量维度: {chunk.embedding.length}D (TF-IDF)</span>
            {chunk.embeddingV2 && (
              <span className="text-emerald-500">语义向量: {chunk.embeddingV2.length}D</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

// ==================== 分页控件 ====================

function Pagination({
  current,
  total,
  onChange
}: {
  current: number
  total: number
  onChange: (page: number) => void
}) {
  if (total <= 1) return null

  const pages: (number | '...')[] = []
  if (total <= 7) {
    for (let i = 0; i < total; i++) pages.push(i)
  } else {
    pages.push(0)
    if (current > 2) pages.push('...')
    const start = Math.max(1, current - 1)
    const end = Math.min(total - 2, current + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (current < total - 3) pages.push('...')
    pages.push(total - 1)
  }

  return (
    <div className="flex items-center justify-center gap-1 py-3">
      <button
        onClick={() => onChange(current - 1)}
        disabled={current === 0}
        className="p-1.5 rounded-md hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed text-surface-500"
      >
        <ChevronLeftIcon size={14} />
      </button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`dots-${i}`} className="px-1 text-xs text-surface-400">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`min-w-[28px] h-7 rounded-md text-xs font-medium transition-colors ${
              p === current
                ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                : 'hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-500 dark:text-surface-400'
            }`}
          >
            {p + 1}
          </button>
        )
      )}
      <button
        onClick={() => onChange(current + 1)}
        disabled={current === total - 1}
        className="p-1.5 rounded-md hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed text-surface-500 rotate-180"
      >
        <ChevronLeftIcon size={14} />
      </button>
    </div>
  )
}

// ==================== 文件查看器 ====================

export function FileViewer() {
  const {
    selectedFileId,
    selectedFileChunks,
    isLoadingChunks,
    setSelectedFileId,
    getFile
  } = useKnowledgeBaseStore()

  const [currentPage, setCurrentPage] = useState(0)

  const file = selectedFileId ? getFile(selectedFileId) : undefined

  // 切换文件时重置页码
  useEffect(() => {
    setCurrentPage(0)
  }, [selectedFileId])

  // 缓存排序后的分块（避免每次渲染都排序）
  const sortedChunks = useMemo(
    () => [...selectedFileChunks].sort((a, b) => a.index - b.index),
    [selectedFileChunks]
  )

  // 分页计算
  const totalPages = Math.ceil(sortedChunks.length / CHUNKS_PER_PAGE)
  const pageChunks = useMemo(
    () =>
      sortedChunks.slice(
        currentPage * CHUNKS_PER_PAGE,
        (currentPage + 1) * CHUNKS_PER_PAGE
      ),
    [sortedChunks, currentPage]
  )

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page)
  }, [])

  if (!file) {
    return <EmptyState />
  }

  const status = statusLabel[file.status]

  return (
    <div className="flex flex-col h-full">
      {/* 文件信息头 */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-surface-200/80 dark:border-surface-700/60">
        {/* 返回按钮 + 文件名 */}
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setSelectedFileId(null)}
            className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-all"
            title="返回文件列表"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
            <FileText size={16} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 truncate">
              {file.name}
            </h3>
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${status.bg} ${status.color}`}>
            {status.text}
          </span>
        </div>

        {/* 元数据 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 ml-12">
          <MetaItem label="大小" value={formatFileSize(file.size)} />
          <MetaItem label="分块数" value={`${file.chunkCount}`} />
          <MetaItem label="类型" value={file.mimeType || '未知'} />
          <MetaItem label="上传时间" value={formatDate(file.uploadedAt)} />
        </div>

        {/* 错误信息 */}
        {file.errorMessage && (
          <div className="flex items-start gap-2 mt-3 ml-12 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/30">
            <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
            <span className="text-xs text-red-600 dark:text-red-400">{file.errorMessage}</span>
          </div>
        )}
      </div>

      {/* 分块列表 */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoadingChunks ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-muted" />
          </div>
        ) : sortedChunks.length === 0 ? (
          <div className="text-center text-muted py-12">
            <FileText size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">暂无分块数据</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-surface-500 dark:text-surface-400">
                共 {sortedChunks.length} 个分块
                {totalPages > 1 && (
                  <span className="ml-1 text-surface-400 dark:text-surface-500">
                    （第 {currentPage + 1}/{totalPages} 页，每页 {CHUNKS_PER_PAGE} 个）
                  </span>
                )}
              </span>
              <span className="text-[10px] text-surface-400 dark:text-surface-500">
                点击展开查看内容
              </span>
            </div>
            {pageChunks.map((chunk, i) => (
              <ChunkCard
                key={chunk.id}
                chunk={chunk}
                index={currentPage * CHUNKS_PER_PAGE + i}
              />
            ))}
            <Pagination
              current={currentPage}
              total={totalPages}
              onChange={handlePageChange}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== 空状态 ====================

function EmptyState() {
  const { files } = useKnowledgeBaseStore()

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted">
        <FileText size={48} className="mb-4 opacity-20" />
        <p className="text-sm font-medium mb-1">知识库为空</p>
        <p className="text-xs">点击顶部的"上传"按钮添加文件</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-muted">
      <FileText size={48} className="mb-4 opacity-20" />
      <p className="text-sm font-medium mb-1">选择一个文件查看</p>
      <p className="text-xs">从左侧文件列表中点击文件以查看详情</p>
    </div>
  )
}

// ==================== 元数据项 ====================

const MetaItem = memo(function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-surface-400 dark:text-surface-500 mb-0.5">{label}</p>
      <p className="text-xs text-surface-600 dark:text-surface-300 truncate">{value}</p>
    </div>
  )
})
