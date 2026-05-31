import { v4 as uuidv4 } from 'uuid'
import type { KnowledgeBaseFile, KnowledgeBaseChunk, SearchResult } from '../types'
import { dbService } from './db-service'
import { embeddingService } from './embedding-service'

// 文本分块参数
const CHUNK_SIZE = 500     // 每个分块的最大字符数
const CHUNK_OVERLAP = 50   // 分块之间的重叠字符数

/**
 * 知识库服务 - 文件上传、文本分块、向量检索
 */
export const knowledgeBaseService = {
  /**
   * 上传并处理文件
   */
  async uploadFile(
    file: File,
    onProgress?: (status: KnowledgeBaseFile['status']) => void
  ): Promise<KnowledgeBaseFile> {
    const fileId = uuidv4()

    // 创建文件元数据
    const metadata: KnowledgeBaseFile = {
      id: fileId,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      uploadedAt: Date.now(),
      chunkCount: 0,
      status: 'uploading'
    }

    onProgress?.('uploading')

    // 保存文件数据到 IndexedDB
    const arrayBuffer = await file.arrayBuffer()
    await dbService.saveFileData(fileId, arrayBuffer)
    await dbService.saveFileMetadata(metadata)

    // 处理文件（提取文本、分块、向量化）
    metadata.status = 'processing'
    onProgress?.('processing')

    try {
      const text = await this.extractText(file)
      const chunks = this.splitText(text)

      // 生成向量
      const embeddings = await embeddingService.embedBatch(chunks.map((c) => c.content))

      // 保存分块和向量
      const kbChunks: KnowledgeBaseChunk[] = chunks.map((chunk, index) => ({
        id: uuidv4(),
        fileId,
        content: chunk.content,
        embedding: embeddings[index],
        index
      }))

      await dbService.saveChunks(kbChunks)

      // 更新元数据
      metadata.chunkCount = kbChunks.length
      metadata.status = 'ready'
      await dbService.saveFileMetadata(metadata)

      onProgress?.('ready')
    } catch (error) {
      metadata.status = 'error'
      metadata.errorMessage = error instanceof Error ? error.message : '处理失败'
      await dbService.saveFileMetadata(metadata)
      onProgress?.('error')
    }

    return metadata
  },

  /**
   * 从文件中提取文本
   */
  async extractText(file: File): Promise<string> {
    const mimeType = file.type

    if (mimeType === 'text/plain' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
      return await file.text()
    }

    if (mimeType === 'application/json' || file.name.endsWith('.json')) {
      return await file.text()
    }

    if (mimeType === 'text/csv' || file.name.endsWith('.csv')) {
      return await file.text()
    }

    // 其他文件类型尝试作为纯文本读取
    try {
      return await file.text()
    } catch {
      throw new Error(`不支持的文件格式: ${mimeType}`)
    }
  },

  /**
   * 将文本分块
   */
  splitText(text: string): Array<{ content: string }> {
    const chunks: Array<{ content: string }> = []
    const sentences = text.split(/(?<=[。！？.!?\n])/)
    let currentChunk = ''

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > CHUNK_SIZE && currentChunk.length > 0) {
        chunks.push({ content: currentChunk.trim() })
        // 保留重叠部分
        const overlapText = currentChunk.slice(-CHUNK_OVERLAP)
        currentChunk = overlapText + sentence
      } else {
        currentChunk += sentence
      }
    }

    if (currentChunk.trim()) {
      chunks.push({ content: currentChunk.trim() })
    }

    return chunks
  },

  /**
   * 向量检索 - 搜索与查询文本最相似的分块
   */
  async search(
    query: string,
    topK: number = 5,
    threshold: number = 0.3
  ): Promise<SearchResult[]> {
    // 生成查询向量
    const queryEmbedding = await embeddingService.embed(query)

    // 获取所有分块
    const allChunks = await dbService.getAllChunks()
    if (allChunks.length === 0) return []

    // 获取文件元数据（用于返回文件名）
    const fileMetadata = new Map<string, string>()
    const allFiles = await dbService.getAllFileMetadata()
    for (const f of allFiles) {
      fileMetadata.set(f.id, f.name)
    }

    // 计算余弦相似度
    const results: SearchResult[] = []
    for (const chunk of allChunks) {
      const score = this.cosineSimilarity(queryEmbedding, chunk.embedding)
      if (score >= threshold) {
        results.push({
          chunk,
          score,
          fileName: fileMetadata.get(chunk.fileId) ?? 'unknown'
        })
      }
    }

    // 按相似度排序，返回 top K
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topK)
  },

  /**
   * 计算余弦相似度
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB)
    if (denominator === 0) return 0

    return dotProduct / denominator
  },

  /**
   * 删除文件及其关联数据
   */
  async deleteFile(fileId: string): Promise<void> {
    await dbService.deleteFileData(fileId)
  },

  /**
   * 清空知识库
   */
  async clearAll(): Promise<void> {
    await dbService.clearAll()
    embeddingService.dispose()
  }
}
