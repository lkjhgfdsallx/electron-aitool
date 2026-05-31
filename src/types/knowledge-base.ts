// ==================== 知识库相关类型 ====================

export interface KnowledgeBaseFile {
  id: string
  name: string
  size: number
  mimeType: string
  uploadedAt: number
  chunkCount: number  // 分块数量
  status: 'uploading' | 'processing' | 'ready' | 'error'
  errorMessage?: string
}

export interface KnowledgeBaseChunk {
  id: string
  fileId: string
  content: string
  embedding: number[] // 向量数据
  index: number       // 在文件中的位置索引
}

export interface SearchResult {
  chunk: KnowledgeBaseChunk
  score: number       // 相似度分数
  fileName: string
}
