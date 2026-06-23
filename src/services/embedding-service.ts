/**
 * Embedding 服务 - 纯本地 TF-IDF + 特征哈希向量化
 * 
 * 使用 Character N-gram + Feature Hashing 实现文本向量化：
 * 1. 分词：中文逐字 + 二元组，英文单词 + 小写化
 * 2. 特征哈希：FNV-1a 算法映射 token 到固定维度向量
 * 3. 权重：TF × IDF，L2 归一化
 * 
 * 零外部依赖，完全离线运行。
 */

const VECTOR_DIM = 512 // 向量维度

// ==================== 分词器 ====================

/**
 * 判断字符是否为中文
 */
function isChinese(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= 0x4e00 && code <= 0x9fff
}

/**
 * 判断字符是否为英文字母
 */
function isLetter(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
}

/**
 * 判断字符是否为数字
 */
function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

/**
 * 将文本分词为 token 列表
 * - 中文：逐字 + 相邻字二元组（bigram）
 * - 英文/数字：按空格和标点分词，小写化
 */
function tokenize(text: string): string[] {
  const tokens: string[] = []
  const chars = Array.from(text.toLowerCase())
  let i = 0

  while (i < chars.length) {
    const ch = chars[i]

    if (isChinese(ch)) {
      // 中文：添加单字
      tokens.push(ch)
      // 中文二元组
      if (i + 1 < chars.length && isChinese(chars[i + 1])) {
        tokens.push(ch + chars[i + 1])
      }
      i++
    } else if (isLetter(ch) || isDigit(ch)) {
      // 英文/数字：收集连续字母数字作为单词
      let word = ''
      while (i < chars.length && (isLetter(chars[i]) || isDigit(chars[i]))) {
        word += chars[i]
        i++
      }
      if (word.length > 0) {
        tokens.push(word)
      }
    } else {
      i++ // 跳过标点和空白
    }
  }

  return tokens
}

// ==================== 哈希函数 ====================

/**
 * FNV-1a 哈希算法（32 位）
 * 将字符串映射到 [0, VECTOR_DIM) 范围的索引
 */
function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5 // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) // FNV prime
  }
  return (hash >>> 0) % VECTOR_DIM
}

/**
 * 使用特征哈希将 token 列表映射到固定维度向量
 * 使用双哈希减少碰撞：正向和负向
 */
function hashTokens(tokens: string[]): number[] {
  const vector = new Float64Array(VECTOR_DIM)

  for (const token of tokens) {
    const idx1 = fnv1aHash(token)
    // 第二个哈希：反转字符串再哈希
    const reversed = Array.from(token).reverse().join('')
    const idx2 = fnv1aHash(reversed)

    vector[idx1] += 1 // 正向特征
    if (idx1 !== idx2) {
      vector[idx2] -= 1 // 负向特征（减少碰撞影响）
    }
  }

  return Array.from(vector)
}

/**
 * L2 归一化向量
 */
function l2Normalize(vector: number[]): number[] {
  let norm = 0
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i]
  }
  norm = Math.sqrt(norm)

  if (norm === 0) return vector

  const result = new Array(vector.length)
  for (let i = 0; i < vector.length; i++) {
    result[i] = vector[i] / norm
  }
  return result
}

/**
 * 应用 TF（词频）权重：log(1 + tf)
 */
function applyTF(vector: number[]): number[] {
  const result = new Array(vector.length)
  for (let i = 0; i < vector.length; i++) {
    result[i] = vector[i] > 0 ? Math.log(1 + vector[i]) : (vector[i] < 0 ? -Math.log(1 - vector[i]) : 0)
  }
  return result
}

// ==================== Embedding 服务 ====================

// 文档频率记录（用于 IDF 计算）
// key: token, value: 出现该 token 的文档数
const documentFrequency = new Map<string, number>()
let totalDocuments = 0

export const embeddingService = {
  /**
   * 初始化（纯本地，无需网络，同步完成）
   */
  async init(): Promise<void> {
    // 纯本地实现，无需初始化
  },

  /**
   * 对单个文本生成向量
   */
  async embed(text: string): Promise<number[]> {
    const tokens = tokenize(text)
    let vector = hashTokens(tokens)
    vector = applyTF(vector)
    // 如果有全局 IDF 信息，应用 IDF 权重
    if (totalDocuments > 0) {
      vector = this.applyIDF(vector, tokens)
    }
    return l2Normalize(vector)
  },

  /**
   * 批量生成向量（同时更新 IDF 统计）
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    // 更新文档频率统计
    totalDocuments += texts.length
    for (const text of texts) {
      const uniqueTokens = new Set(tokenize(text))
      for (const token of uniqueTokens) {
        documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
      }
    }

    // 生成向量
    const results: number[][] = []
    for (const text of texts) {
      const tokens = tokenize(text)
      let vector = hashTokens(tokens)
      vector = applyTF(vector)
      vector = this.applyIDF(vector, tokens)
      results.push(l2Normalize(vector))
    }

    return results
  },

  /**
   * 应用 IDF（逆文档频率）权重
   * IDF = log(N / (1 + df))，其中 N 为总文档数，df 为包含该 token 的文档数
   */
  applyIDF(vector: number[], tokens: string[]): number[] {
    if (totalDocuments === 0) return vector

    const result = new Array(vector.length).fill(0)
    // 重新构建带 IDF 权重的向量
    for (const token of tokens) {
      const df = documentFrequency.get(token) ?? 0
      const idf = Math.log(totalDocuments / (1 + df)) + 1 // +1 平滑
      const idx1 = fnv1aHash(token)
      const reversed = Array.from(token).reverse().join('')
      const idx2 = fnv1aHash(reversed)

      result[idx1] += idf
      if (idx1 !== idx2) {
        result[idx2] -= idf * 0.5
      }
    }
    // 应用 TF
    for (let i = 0; i < result.length; i++) {
      if (result[i] > 0) result[i] = Math.log(1 + result[i])
      else if (result[i] < 0) result[i] = -Math.log(1 - result[i])
    }
    return result
  },

  /**
   * 释放资源
   */
  dispose(): void {
    documentFrequency.clear()
    totalDocuments = 0
  },

  /**
   * 获取向量维度（供外部使用）
   */
  getDimension(): number {
    return VECTOR_DIM
  }
}
