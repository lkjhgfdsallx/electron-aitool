/**
 * Embedding 服务 - 基于 transformers.js 的文本向量化
 * 使用 feature-extraction pipeline 生成文本嵌入向量
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null

const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2' // 384 维向量

export const embeddingService = {
  /**
   * 初始化 embedding 模型
   */
  async init(modelName: string = DEFAULT_MODEL): Promise<void> {
    if (extractor) return

    const { pipeline } = await import('@huggingface/transformers')
    extractor = await pipeline('feature-extraction', modelName, {
      dtype: 'fp32'
    })
  },

  /**
   * 对单个文本生成向量
   */
  async embed(text: string): Promise<number[]> {
    if (!extractor) {
      await this.init()
    }

    const output = await extractor(text, { pooling: 'mean', normalize: true })
    return Array.from(output.data) as number[]
  },

  /**
   * 批量生成向量
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!extractor) {
      await this.init()
    }

    const output = await extractor(texts, { pooling: 'mean', normalize: true })
    const dims = output.dims as number[]
    const dim = dims[1]
    const results: number[][] = []

    for (let i = 0; i < texts.length; i++) {
      const start = i * dim
      const end = start + dim
      results.push(Array.from((output.data as Float32Array).slice(start, end)) as number[])
    }

    return results
  },

  /**
   * 释放模型资源
   */
  dispose(): void {
    if (extractor && typeof extractor.dispose === 'function') {
      extractor.dispose()
      extractor = null
    }
  }
}
