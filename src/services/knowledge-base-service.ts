import { v4 as uuidv4 } from 'uuid'
import type {
  KnowledgeBaseFile,
  KnowledgeBaseChunk,
  SearchResult,
  ChunkingConfig,
  SearchMode,
  RetrievalConfig
} from '../types'
import { DEFAULT_CHUNKING_CONFIG, DEFAULT_RETRIEVAL_CONFIG } from '../types'
import { dbService, DEFAULT_COLLECTION_ID } from './db-service'
import { embeddingService } from './embedding-service'

// 渐进迁移参数
const MIGRATION_BATCH_SIZE = 10       // 每批处理的 chunk 数量
const MIGRATION_BATCH_DELAY = 50      // 每批之间的延迟（ms），让出主线程

// BM25 参数
const BM25_K1 = 1.5   // 词频饱和参数
const BM25_B = 0.75   // 文档长度归一化参数

// ==================== BM25 分词器 ====================

/**
 * BM25 分词 — 复用 embedding-service 的 tokenize 逻辑
 * 将文本拆分为中英文 token（中文按字+bigram，英文按单词）
 */
function bm25Tokenize(text: string): string[] {
  const tokens: string[] = []
  const chars = Array.from(text.toLowerCase())
  let i = 0

  while (i < chars.length) {
    const ch = chars[i]

    if (ch.charCodeAt(0) >= 0x4e00 && ch.charCodeAt(0) <= 0x9fff) {
      // 中文字符
      tokens.push(ch)
      if (i + 1 < chars.length && chars[i + 1].charCodeAt(0) >= 0x4e00 && chars[i + 1].charCodeAt(0) <= 0x9fff) {
        tokens.push(ch + chars[i + 1])
      }
      i++
    } else if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) {
      let word = ''
      while (i < chars.length && ((chars[i] >= 'a' && chars[i] <= 'z') || (chars[i] >= 'A' && chars[i] <= 'Z') || (chars[i] >= '0' && chars[i] <= '9'))) {
        word += chars[i]
        i++
      }
      if (word.length > 0) {
        // 对代码标识符做 camelCase / snake_case 拆分
        const subWords = splitCodeIdentifier(word)
        tokens.push(...subWords)
      }
    } else {
      i++
    }
  }

  return tokens
}

/**
 * 拆分代码标识符：
 * - camelCase → ['camel', 'case']
 * - snake_case → ['snake', 'case']
 * - 保留原始 token
 */
function splitCodeIdentifier(word: string): string[] {
  const result: string[] = [word]

  // snake_case 拆分
  if (word.includes('_')) {
    const parts = word.split('_').filter(Boolean)
    result.push(...parts)
  }

  // camelCase 拆分
  const camelParts = word.replace(/([a-z])([A-Z])/g, '$1 $1').split(/\s+/)
  if (camelParts.length > 1) {
    result.push(...camelParts.map((p) => p.toLowerCase()))
  }

  return result
}

// ==================== BM25 倒排索引 ====================

interface BM25InvertedEntry {
  /** 包含该 token 的文档数 */
  docFreq: number
  /** 每个 chunk 中该 token 的出现次数 */
  chunkFreqs: Map<string, number>
}

/** 倒排索引：token → BM25InvertedEntry */
const invertedIndex = new Map<string, BM25InvertedEntry>()
/** 每个 chunk 的 token 数量 */
const chunkTokenCounts = new Map<string, number>()
/** 文档总数 */
let bm25DocCount = 0
/** 平均文档长度 */
let bm25AvgDocLen = 0
/** 索引是否需要重建 */
let invertedIndexDirty = true

/**
 * 构建 BM25 倒排索引
 * 从所有 chunk 构建，用于快速 BM25 评分
 */
async function buildInvertedIndex(): Promise<void> {
  const allChunks = await dbService.getAllChunks()

  invertedIndex.clear()
  chunkTokenCounts.clear()
  bm25DocCount = allChunks.length

  let totalTokens = 0

  for (const chunk of allChunks) {
    const tokens = bm25Tokenize(chunk.content)
    chunkTokenCounts.set(chunk.id, tokens.length)
    totalTokens += tokens.length

    // 统计每个 token 在该 chunk 中的频率
    const freq = new Map<string, number>()
    for (const token of tokens) {
      freq.set(token, (freq.get(token) ?? 0) + 1)
    }

    // 更新倒排索引
    for (const [token, count] of freq) {
      let entry = invertedIndex.get(token)
      if (!entry) {
        entry = { docFreq: 0, chunkFreqs: new Map() }
        invertedIndex.set(token, entry)
      }
      entry.docFreq++
      entry.chunkFreqs.set(chunk.id, count)
    }
  }

  bm25AvgDocLen = bm25DocCount > 0 ? totalTokens / bm25DocCount : 0
  invertedIndexDirty = false
}

/**
 * 确保倒排索引是最新的
 */
async function ensureInvertedIndex(): Promise<void> {
  if (invertedIndexDirty || invertedIndex.size === 0) {
    await buildInvertedIndex()
  }
}

/**
 * BM25 评分函数
 * @param queryTokens 查询的 token 列表
 * @param chunkId chunk ID
 * @returns BM25 分数
 */
function computeBM25Score(queryTokens: string[], chunkId: string): number {
  const docLen = chunkTokenCounts.get(chunkId) ?? 0
  let score = 0

  // 对查询中的去重 token 计算
  const seen = new Set<string>()
  for (const token of queryTokens) {
    if (seen.has(token)) continue
    seen.add(token)

    const entry = invertedIndex.get(token)
    if (!entry) continue

    const tf = entry.chunkFreqs.get(chunkId) ?? 0
    if (tf === 0) continue

    const df = entry.docFreq
    const N = bm25DocCount

    // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1)

    // TF 归一化: (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl/avgdl))
    const tfNorm = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * docLen / bm25AvgDocLen))

    score += idf * tfNorm
  }

  return score
}

/**
 * 对所有 chunk 执行 BM25 搜索，返回按分数排序的结果
 */
async function bm25Search(
  query: string,
  topK: number,
  allChunks: KnowledgeBaseChunk[],
  allFileNames: Map<string, string>
): Promise<SearchResult[]> {
  await ensureInvertedIndex()

  const queryTokens = bm25Tokenize(query)
  if (queryTokens.length === 0) return []

  const results: SearchResult[] = []

  for (const chunk of allChunks) {
    const score = computeBM25Score(queryTokens, chunk.id)
    if (score > 0) {
      results.push({
        chunk,
        score,
        fileName: allFileNames.get(chunk.fileId) ?? 'unknown'
      })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, topK)
}

/**
 * 将 BM25 分数归一化到 [0, 1] 范围
 */
function normalizeBM25Scores(results: SearchResult[]): SearchResult[] {
  if (results.length === 0) return []
  const maxScore = results[0].score
  if (maxScore === 0) return results
  return results.map((r) => ({
    ...r,
    score: r.score / maxScore
  }))
}

/** 将数组分成指定大小的批次 */
function chunked<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

/**
 * 知识库服务 - 文件上传、文本分块、向量检索
 */
export const knowledgeBaseService = {
  /** 渐进迁移是否正在进行 */
  _migrating: false,

  /** 渐进迁移是否被取消 */
  _migrationCancelled: false,

  /**
   * 上传并处理文件
   * @param collectionId 目标集合 ID，为空则归入默认集合
   */
  async uploadFile(
    file: File,
    onProgress?: (status: KnowledgeBaseFile['status']) => void,
    collectionId?: string
  ): Promise<KnowledgeBaseFile> {
    const fileId = uuidv4()
    const effectiveCollectionId = collectionId || DEFAULT_COLLECTION_ID

    // 创建文件元数据
    const metadata: KnowledgeBaseFile = {
      id: fileId,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      uploadedAt: Date.now(),
      chunkCount: 0,
      status: 'uploading',
      collectionId: effectiveCollectionId
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

      // 从 settings store 读取分块配置
      const { useSettingsStore } = await import('../stores/settings-store')
      const chunkingConfig = useSettingsStore.getState().chunkingConfig

      const chunks = this.splitText(text, chunkingConfig)

      // 生成向量（embeddingService 自动选择引擎）
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
      this.markIndexDirty()

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
   * 支持多种格式：纯文本类直接读取，PDF/DOCX/HTML 通过 Electron 主进程 IPC 提取
   */
  async extractText(file: File): Promise<string> {
    const fileName = file.name.toLowerCase()
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.file

    // PDF 文件：通过主进程提取
    if (file.type === 'application/pdf' || fileName.endsWith('.pdf')) {
      if (isElectron) {
        const filePath = window.electronAPI.file.getPathForFile(file)
        const result = await window.electronAPI.file.extractText(filePath)
        if (result.success && result.text) return result.text
        throw new Error(result.error || 'PDF 文本提取失败')
      }
      // 非 Electron 环境回退：使用 file-extraction 工具
      const { extractPdfText } = await import('../utils/file-extraction')
      return extractPdfText(file)
    }

    // Word 文件：通过主进程提取
    if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.type === 'application/msword' ||
      fileName.endsWith('.docx') ||
      fileName.endsWith('.doc')
    ) {
      if (isElectron) {
        const filePath = window.electronAPI.file.getPathForFile(file)
        const result = await window.electronAPI.file.extractText(filePath)
        if (result.success && result.text) return result.text
        throw new Error(result.error || 'Word 文档提取失败')
      }
      const { extractDocxText } = await import('../utils/file-extraction')
      return extractDocxText(file)
    }

    // HTML 文件：通过主进程提取（去除标签）
    if (
      file.type === 'text/html' ||
      fileName.endsWith('.html') ||
      fileName.endsWith('.htm')
    ) {
      if (isElectron) {
        const filePath = window.electronAPI.file.getPathForFile(file)
        const result = await window.electronAPI.file.extractText(filePath)
        if (result.success && result.text) return result.text
        throw new Error(result.error || 'HTML 文本提取失败')
      }
      // 非 Electron 环境：作为纯文本读取
      return await file.text()
    }

    // 其他文本类文件（txt/md/json/csv/源码/log 等）：直接读取
    return await file.text()
  },

  /**
   * 将文本分块（支持三种模式）
   */
  splitText(text: string, config?: ChunkingConfig): Array<{ content: string }> {
    const cfg = config ?? DEFAULT_CHUNKING_CONFIG

    switch (cfg.mode) {
      case 'delimiter':
        return this._splitByDelimiter(text, cfg)
      case 'token':
        return this._splitByToken(text, cfg)
      case 'character':
      default:
        return this._splitByCharacter(text, cfg)
    }
  },

  /**
   * 按字符分块（默认模式）
   * 按句子断句，累积到 chunkSize 后切分，保留 chunkOverlap 重叠
   */
  _splitByCharacter(text: string, cfg: ChunkingConfig): Array<{ content: string }> {
    const { chunkSize, chunkOverlap } = cfg
    const chunks: Array<{ content: string }> = []
    const sentences = text.split(/(?<=[。！？.!?\n])/)
    let currentChunk = ''

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
        chunks.push({ content: currentChunk.trim() })
        // 保留重叠部分
        const overlapText = currentChunk.slice(-chunkOverlap)
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
   * 按分隔符分块
   * 适合 Markdown（按标题/空行分隔）和代码（按函数/类分隔）
   * 超长段落会自动回退到按字符切分
   */
  _splitByDelimiter(text: string, cfg: ChunkingConfig): Array<{ content: string }> {
    const { chunkSize, chunkOverlap, delimiter } = cfg
    const segments = text.split(delimiter)
    const chunks: Array<{ content: string }> = []

    for (const segment of segments) {
      const trimmed = segment.trim()
      if (!trimmed) continue

      if (trimmed.length <= chunkSize) {
        chunks.push({ content: trimmed })
      } else {
        // 超长段落：按字符模式进一步切分
        const subChunks = this._splitByCharacter(trimmed, {
          ...cfg,
          mode: 'character'
        })
        chunks.push(...subChunks)
      }
    }

    // 如果启用了重叠，对分块添加重叠上下文
    if (chunkOverlap > 0 && chunks.length > 1) {
      const overlappedChunks: Array<{ content: string }> = [chunks[0]]
      for (let i = 1; i < chunks.length; i++) {
        const prevTail = chunks[i - 1].content.slice(-chunkOverlap)
        overlappedChunks.push({ content: prevTail + chunks[i].content })
      }
      return overlappedChunks
    }

    return chunks
  },

  /**
   * 按 Token 数分块
   * 近似 Token 计算：中文 1 字 ≈ 1.5 token，英文 1 词 ≈ 1 token
   * 按 token 上限切分，重叠按 token 数计算
   */
  _splitByToken(text: string, cfg: ChunkingConfig): Array<{ content: string }> {
    const { chunkSize, chunkOverlap } = cfg
    const chunks: Array<{ content: string }> = []

    // 将文本分成 token 单元（中文按字，英文按词/空格）
    const tokens: string[] = []
    // 匹配：中文单字 | 英文单词 | 数字序列 | 空白 | 其他单字符
    const tokenRegex = /[\u4e00-\u9fff]|[a-zA-Z]+|[0-9]+|\s+|[^\u4e00-\u9fffa-zA-Z0-9\s]+/g
    let match: RegExpExecArray | null
    while ((match = tokenRegex.exec(text)) !== null) {
      tokens.push(match[0])
    }

    // 近似 token 权重：中文字符 = 1.5，其他 = 1
    function tokenWeight(t: string): number {
      if (/[\u4e00-\u9fff]/.test(t)) return 1.5
      return 1
    }

    let currentTokens: string[] = []
    let currentWeight = 0

    for (const token of tokens) {
      const w = tokenWeight(token)
      if (currentWeight + w > chunkSize && currentTokens.length > 0) {
        chunks.push({ content: currentTokens.join('') })
        // 保留重叠：从尾部取 chunkOverlap 个 token 权重的 token
        const overlapTokens: string[] = []
        let overlapWeight = 0
        for (let i = currentTokens.length - 1; i >= 0; i--) {
          const tw = tokenWeight(currentTokens[i])
          if (overlapWeight + tw > chunkOverlap) break
          overlapTokens.unshift(currentTokens[i])
          overlapWeight += tw
        }
        currentTokens = [...overlapTokens, token]
        currentWeight = overlapWeight + w
      } else {
        currentTokens.push(token)
        currentWeight += w
      }
    }

    if (currentTokens.length > 0) {
      const content = currentTokens.join('').trim()
      if (content) {
        chunks.push({ content })
      }
    }

    return chunks
  },

  /**
   * 标记倒排索引为脏（文件增删后调用）
   */
  markIndexDirty(): void {
    invertedIndexDirty = true
  },

  /**
   * 获取指定集合范围的 chunks 和文件名映射（内部辅助方法）
   */
  async _getChunksAndFileNames(collectionIds?: string[]): Promise<{
    allChunks: KnowledgeBaseChunk[]
    fileNames: Map<string, string>
  }> {
    let allChunks: KnowledgeBaseChunk[]
    let allFiles: KnowledgeBaseFile[]

    if (collectionIds && collectionIds.length > 0) {
      const fileMetadataList: KnowledgeBaseFile[] = []
      for (const cid of collectionIds) {
        const files = await dbService.getFileMetadataByCollection(cid)
        fileMetadataList.push(...files)
      }
      allFiles = fileMetadataList
      const fileIdSet = new Set(allFiles.map((f) => f.id))
      const allChunksAll = await dbService.getAllChunks()
      allChunks = allChunksAll.filter((c) => fileIdSet.has(c.fileId))
    } else {
      allChunks = await dbService.getAllChunks()
      allFiles = await dbService.getAllFileMetadata()
    }

    const fileNames = new Map<string, string>()
    for (const f of allFiles) {
      fileNames.set(f.id, f.name)
    }

    return { allChunks, fileNames }
  },

  /**
   * 向量检索 - 搜索与查询文本最相似的分块
   *
   * 双引擎逻辑：
   * - 如果语义引擎就绪且 chunk 有 embeddingV2 → 用语义向量
   * - 否则 → 用 TF-IDF 向量
   *
   * 注意：query 向量和 chunk 向量必须使用相同引擎（维度一致）
   */
  async search(
    query: string,
    topK: number = 5,
    threshold: number = 0.3,
    collectionIds?: string[],
    mode: SearchMode = 'vector'
  ): Promise<SearchResult[]> {
    if (mode === 'hybrid') {
      return this.hybridSearch(query, topK, threshold, collectionIds)
    }

    if (mode === 'keyword') {
      return this.keywordSearch(query, topK, collectionIds)
    }

    // 纯向量搜索（原有逻辑）
    const queryEmbedding = await embeddingService.embed(query)
    const useSemantic = embeddingService.isSemanticReady()

    const { allChunks, fileNames } = await this._getChunksAndFileNames(collectionIds)
    if (allChunks.length === 0) return []

    const results: SearchResult[] = []
    for (const chunk of allChunks) {
      let score: number

      if (useSemantic && chunk.embeddingV2 && chunk.embeddingV2.length > 0) {
        score = this.cosineSimilarity(queryEmbedding, chunk.embeddingV2)
      } else {
        if (useSemantic && queryEmbedding.length !== chunk.embedding.length) {
          continue
        }
        score = this.cosineSimilarity(queryEmbedding, chunk.embedding)
      }

      if (score >= threshold) {
        results.push({
          chunk,
          score,
          fileName: fileNames.get(chunk.fileId) ?? 'unknown'
        })
      }
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topK)
  },

  /**
   * 关键字搜索（BM25 评分，非简单 includes）
   */
  async keywordSearch(
    query: string,
    topK: number = 10,
    collectionIds?: string[]
  ): Promise<SearchResult[]> {
    const { allChunks, fileNames } = await this._getChunksAndFileNames(collectionIds)
    if (allChunks.length === 0) return []

    return bm25Search(query, topK, allChunks, fileNames)
  },

  /**
   * 混合检索 — 结合 BM25 关键词和向量语义，融合评分
   *
   * @param query 查询文本
   * @param topK 返回数量
   * @param threshold 向量相似度阈值（BM25 不受此限制）
   * @param collectionIds 限定集合
   * @param vectorWeight 向量权重（默认从配置读取）
   * @param bm25Weight BM25 权重（默认从配置读取）
   */
  async hybridSearch(
    query: string,
    topK: number = 5,
    threshold: number = 0.3,
    collectionIds?: string[],
    vectorWeight?: number,
    bm25Weight?: number
  ): Promise<SearchResult[]> {
    const { useSettingsStore } = await import('../stores/settings-store')
    const retrievalConfig = useSettingsStore.getState().retrievalConfig
    const wVec = vectorWeight ?? retrievalConfig.hybridVectorWeight ?? 0.6
    const wBM25 = bm25Weight ?? retrievalConfig.hybridBM25Weight ?? 0.4

    const { allChunks, fileNames } = await this._getChunksAndFileNames(collectionIds)
    if (allChunks.length === 0) return []

    // 1. 计算 BM25 分数
    await ensureInvertedIndex()
    const queryTokens = bm25Tokenize(query)
    const bm25Scores = new Map<string, number>()
    let maxBM25 = 0
    for (const chunk of allChunks) {
      const score = computeBM25Score(queryTokens, chunk.id)
      if (score > 0) {
        bm25Scores.set(chunk.id, score)
        if (score > maxBM25) maxBM25 = score
      }
    }

    // 2. 计算向量分数
    const queryEmbedding = await embeddingService.embed(query)
    const useSemantic = embeddingService.isSemanticReady()
    const vectorScores = new Map<string, number>()
    let maxVec = 0
    for (const chunk of allChunks) {
      let score = 0
      if (useSemantic && chunk.embeddingV2 && chunk.embeddingV2.length > 0) {
        score = this.cosineSimilarity(queryEmbedding, chunk.embeddingV2)
      } else {
        if (!useSemantic || queryEmbedding.length === chunk.embedding.length) {
          score = this.cosineSimilarity(queryEmbedding, chunk.embedding)
        }
      }
      if (score > 0) {
        vectorScores.set(chunk.id, score)
        if (score > maxVec) maxVec = score
      }
    }

    // 3. 融合分数：归一化后加权求和
    const results: SearchResult[] = []
    for (const chunk of allChunks) {
      const rawBM25 = bm25Scores.get(chunk.id) ?? 0
      const rawVec = vectorScores.get(chunk.id) ?? 0

      // 跳过两个分数都为 0 的 chunk
      if (rawBM25 === 0 && rawVec === 0) continue

      // 归一化到 [0, 1]
      const normBM25 = maxBM25 > 0 ? rawBM25 / maxBM25 : 0
      const normVec = maxVec > 0 ? rawVec / maxVec : 0

      // 加权融合
      const hybridScore = wVec * normVec + wBM25 * normBM25

      // 向量分数太低时跳过（避免纯 BM25 匹配但语义完全不相关的结果）
      if (normVec < threshold && rawBM25 === 0) continue

      results.push({
        chunk,
        score: hybridScore,
        fileName: fileNames.get(chunk.fileId) ?? 'unknown'
      })
    }

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
    this.markIndexDirty()
  },

  /**
   * 清空指定集合的知识库
   */
  async clearCollection(collectionId: string): Promise<void> {
    await dbService.clearCollection(collectionId)
    this.markIndexDirty()
  },

  /**
   * 清空全部知识库
   */
  async clearAll(): Promise<void> {
    await dbService.clearAll()
    embeddingService.dispose()
    this.markIndexDirty()
  },

  /**
   * 从 URL 导入网页内容到知识库
   * 通过 Electron 主进程的 fetchWebpage IPC 抓取网页文本，清洗后入库
   */
  async importFromUrl(
    url: string,
    onProgress?: (status: KnowledgeBaseFile['status']) => void,
    collectionId?: string
  ): Promise<KnowledgeBaseFile> {
    const fileId = uuidv4()
    const effectiveCollectionId = collectionId || DEFAULT_COLLECTION_ID

    // 验证 URL 格式
    try {
      new URL(url)
    } catch {
      throw new Error('无效的 URL 格式')
    }

    // 创建文件元数据（以 URL 作为文件名）
    const urlObj = new URL(url)
    const displayName = urlObj.hostname + urlObj.pathname.replace(/\//g, '_').replace(/^_|_$/g, '') || urlObj.hostname
    const metadata: KnowledgeBaseFile = {
      id: fileId,
      name: `${displayName}.html`,
      size: 0,
      mimeType: 'text/html',
      uploadedAt: Date.now(),
      chunkCount: 0,
      status: 'uploading',
      collectionId: effectiveCollectionId,
      sourceUrl: url
    }

    onProgress?.('uploading')
    await dbService.saveFileMetadata(metadata)

    // 处理网页内容
    metadata.status = 'processing'
    onProgress?.('processing')

    try {
      // 通过 Electron 主进程抓取网页文本
      const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.web
      if (!isElectron) {
        throw new Error('URL 导入仅在 Electron 环境中可用')
      }

      const result = await window.electronAPI.web.fetchWebpage(url, 50000)
      if (!result.success || !result.content) {
        throw new Error(result.error || '网页内容获取失败')
      }

      const text = result.content
      if (text.trim().length === 0) {
        throw new Error('网页内容为空')
      }

      metadata.size = text.length

      // 分块
      const { useSettingsStore } = await import('../stores/settings-store')
      const chunkingConfig = useSettingsStore.getState().chunkingConfig
      const chunks = this.splitText(text, chunkingConfig)

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
      this.markIndexDirty()

      // 更新元数据
      metadata.chunkCount = kbChunks.length
      metadata.status = 'ready'
      await dbService.saveFileMetadata(metadata)

      onProgress?.('ready')
    } catch (error) {
      metadata.status = 'error'
      metadata.errorMessage = error instanceof Error ? error.message : 'URL 导入失败'
      await dbService.saveFileMetadata(metadata)
      onProgress?.('error')
    }

    return metadata
  },

  /**
   * 一键重建所有向量索引
   * 当用户更换 Embedding 模型后调用，清除所有 embeddingV2 并重新生成
   *
   * @param onProgress 进度回调
   * @returns 重建结果统计
   */
  async rebuildAllEmbeddings(
    onProgress?: (progress: { current: number; total: number; phase: string }) => void
  ): Promise<{ totalChunks: number; rebuilt: number; errors: number }> {
    onProgress?.({ current: 0, total: 0, phase: 'clearing' })

    // 1. 清除所有旧的语义向量
    await dbService.clearAllEmbeddingV2()

    // 2. 获取所有 chunks
    const allChunks = await dbService.getAllChunks()
    const totalChunks = allChunks.length
    if (totalChunks === 0) {
      return { totalChunks: 0, rebuilt: 0, errors: 0 }
    }

    onProgress?.({ current: 0, total: totalChunks, phase: 'embedding' })

    // 3. 分批重新生成向量
    const batches = chunked(allChunks, MIGRATION_BATCH_SIZE)
    let rebuilt = 0
    let errors = 0

    for (const batch of batches) {
      try {
        // 使用语义引擎批量生成向量
        const embeddings = await embeddingService.embedBatchWithSemantic(
          batch.map((c) => c.content)
        )

        if (!embeddings) {
          // 语义引擎不可用，尝试用 TF-IDF 引擎
          const tfidfEmbeddings = await embeddingService.embedBatch(
            batch.map((c) => c.content)
          )
          for (let i = 0; i < batch.length; i++) {
            if (tfidfEmbeddings[i] && tfidfEmbeddings[i].length > 0) {
              await dbService.updateChunkEmbeddingV2(batch[i].id, tfidfEmbeddings[i])
              rebuilt++
            } else {
              errors++
            }
          }
        } else {
          for (let i = 0; i < batch.length; i++) {
            if (embeddings[i] && embeddings[i].length > 0) {
              await dbService.updateChunkEmbeddingV2(batch[i].id, embeddings[i])
              rebuilt++
            } else {
              errors++
            }
          }
        }

        onProgress?.({ current: rebuilt + errors, total: totalChunks, phase: 'embedding' })

        // 让出主线程
        await new Promise((r) => setTimeout(r, MIGRATION_BATCH_DELAY))
      } catch (err) {
        console.error('[知识库] 重建向量批次失败:', err)
        errors += batch.length
      }
    }

    // 4. 标记索引脏，下次搜索时重建倒排索引
    this.markIndexDirty()

    onProgress?.({ current: totalChunks, total: totalChunks, phase: 'done' })

    return { totalChunks, rebuilt, errors }
  },

  /**
   * 移动文件到另一个集合
   * 仅更新文件的 collectionId，chunks 和文件数据保持不变
   */
  async moveFile(fileId: string, targetCollectionId: string): Promise<void> {
    const metadata = await dbService.getFileMetadata(fileId)
    if (!metadata) throw new Error('文件不存在')
    metadata.collectionId = targetCollectionId
    await dbService.saveFileMetadata(metadata)
  },

  /**
   * 复制文件到另一个集合
   * 创建新的文件元数据、复制文件数据和所有 chunks，生成新 ID
   */
  async copyFile(fileId: string, targetCollectionId: string): Promise<KnowledgeBaseFile> {
    const metadata = await dbService.getFileMetadata(fileId)
    if (!metadata) throw new Error('文件不存在')

    const newFileId = uuidv4()

    // 复制文件元数据
    const newMetadata: KnowledgeBaseFile = {
      ...metadata,
      id: newFileId,
      collectionId: targetCollectionId,
      uploadedAt: Date.now()
    }
    await dbService.saveFileMetadata(newMetadata)

    // 复制文件数据
    const fileData = await dbService.getFileData(fileId)
    if (fileData) {
      await dbService.saveFileData(newFileId, fileData)
    }

    // 复制所有 chunks
    const chunks = await dbService.getChunksByFileId(fileId)
    if (chunks.length > 0) {
      const newChunks: KnowledgeBaseChunk[] = chunks.map((chunk) => ({
        id: uuidv4(),
        fileId: newFileId,
        content: chunk.content,
        embedding: [...chunk.embedding],
        embeddingV2: chunk.embeddingV2 ? [...chunk.embeddingV2] : undefined,
        index: chunk.index
      }))
      await dbService.saveChunks(newChunks)
    }

    return newMetadata
  },

  /**
   * RAG 检索：根据用户消息搜索知识库，返回格式化的上下文字符串
   * 如果知识库为空或无匹配结果，返回空字符串
   * 检索参数优先使用传入值，否则从 settings store 读取用户配置
   */
  /**
   * RAG 检索：根据用户消息搜索知识库，返回格式化的上下文字符串
   * 如果知识库为空或无匹配结果，返回空字符串
   * 检索参数优先使用传入值，否则从 settings store 读取用户配置
   * @param collectionIds 限定搜索的集合 ID 列表，为空则搜索全部
   */
  async searchAndFormatContext(
    query: string,
    topK?: number,
    threshold?: number,
    collectionIds?: string[]
  ): Promise<string> {
    try {
      // 从 settings store 读取检索配置（如果调用方未指定）
      const { useSettingsStore } = await import('../stores/settings-store')
      const retrievalConfig = useSettingsStore.getState().retrievalConfig
      const effectiveTopK = topK ?? retrievalConfig.topK
      const effectiveThreshold = threshold ?? retrievalConfig.similarityThreshold

      // 检查是否有知识库文件（按集合范围过滤）
      let readyFiles: KnowledgeBaseFile[]
      if (collectionIds && collectionIds.length > 0) {
        const allFiles: KnowledgeBaseFile[] = []
        for (const cid of collectionIds) {
          const files = await dbService.getFileMetadataByCollection(cid)
          allFiles.push(...files)
        }
        readyFiles = allFiles.filter((f) => f.status === 'ready')
      } else {
        const files = await dbService.getAllFileMetadata()
        readyFiles = files.filter((f) => f.status === 'ready')
      }
      if (readyFiles.length === 0) return ''

      const results = await this.search(query, effectiveTopK, effectiveThreshold, collectionIds, 'hybrid')
      if (results.length === 0) return ''

      // 格式化为上下文
      let context = '\n\n## 知识库参考内容\n以下是从知识库中检索到的相关内容，请参考这些信息来回答用户的问题：\n'
      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        context += `\n### [${i + 1}] 来自文件: ${r.fileName}（相似度: ${(r.score * 100).toFixed(1)}%）\n${r.chunk.content}\n`
      }
      context += '\n请优先使用以上知识库内容来回答问题。如果知识库内容不相关，请根据你的通用知识回答。\n'
      return context
    } catch (error) {
      console.error('知识库 RAG 检索失败:', error)
      return ''
    }
  },

  // ==================== 渐进式向量迁移 ====================

  /**
   * 启动渐进式向量迁移
   * 模型就绪后，后台逐批对已有文档重新生成语义向量
   */
  async startMigration(): Promise<void> {
    if (this._migrating) return
    this._migrating = true
    this._migrationCancelled = false

    try {
      const chunks = await dbService.getChunksWithoutEmbeddingV2()
      if (chunks.length === 0) {
        this._migrating = false
        return
      }

      console.log(`[知识库] 开始渐进迁移 ${chunks.length} 个分块的语义向量`)

      const batches = chunked(chunks, MIGRATION_BATCH_SIZE)
      let migratedCount = 0

      for (const batch of batches) {
        if (this._migrationCancelled) break

        // 使用语义引擎批量生成向量
        const embeddings = await embeddingService.embedBatchWithSemantic(
          batch.map((c) => c.content)
        )

        if (!embeddings) {
          // 语义引擎不可用，停止迁移
          console.warn('[知识库] 语义引擎不可用，停止迁移')
          break
        }

        // 逐个更新 chunk 的 embeddingV2
        for (let i = 0; i < batch.length; i++) {
          if (embeddings[i] && embeddings[i].length > 0) {
            await dbService.updateChunkEmbeddingV2(batch[i].id, embeddings[i])
          }
        }

        migratedCount += batch.length
        console.log(`[知识库] 已迁移 ${migratedCount}/${chunks.length} 个分块`)

        // 让出主线程
        await new Promise((r) => setTimeout(r, MIGRATION_BATCH_DELAY))
      }

      console.log(`[知识库] 渐进迁移完成，共迁移 ${migratedCount} 个分块`)
    } catch (err) {
      console.error('[知识库] 渐进迁移失败:', err)
    } finally {
      this._migrating = false
    }
  },

  /**
   * 取消渐进迁移
   */
  cancelMigration(): void {
    this._migrationCancelled = true
  },

  /**
   * 获取迁移进度
   */
  async getMigrationProgress(): Promise<{ total: number; migrated: number; percentage: number }> {
    const { total, migrated } = await dbService.getMigrationProgress()
    return {
      total,
      migrated,
      percentage: total > 0 ? Math.round((migrated / total) * 100) : 100
    }
  },

  /**
   * 是否正在迁移中
   */
  isMigrating(): boolean {
    return this._migrating
  }
}
