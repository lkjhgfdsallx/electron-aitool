/**
 * Embedding 服务 - 两阶段向量化引擎
 *
 * 阶段一（即时可用）：TF-IDF + 特征哈希（512维，零依赖）
 * 阶段二（后台就绪）：语义模型（通过 Web Worker，支持多种提供者）
 *
 * 搜索请求到达时：
 * - 如果语义引擎尚未就绪 → 使用 TF-IDF 立即返回结果
 * - 如果语义引擎就绪 → 使用语义向量（优先 embeddingV2）
 *
 * 提供者类型：
 * - tfidf: 纯本地 TF-IDF 哈希（兜底）
 * - local-model: Transformers.js（从 HuggingFace/镜像下载 ONNX 模型）
 * - ollama: 本地 Ollama 服务
 * - openai-api: OpenAI 兼容的 Embedding API
 */

import { openDB, type IDBPDatabase } from 'idb'
import type {
  EmbeddingProviderConfig,
  EmbeddingEngineStatus,
  LocalModelProviderConfig,
  OllamaProviderConfig,
  OpenAIApiProviderConfig,
  PreDownloadedFile,
  WorkerRequest,
  WorkerResponse
} from '../types/knowledge-base'

const TFIDF_VECTOR_DIM = 512 // TF-IDF 向量维度

/**
 * Transformers.js 加载 local-model 时需要的文件列表。
 * 与 embedding-worker.ts 中的 MODEL_FILES 保持一致。
 */
const MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/model_quantized.onnx'
]

// ==================== 模型文件 IndexedDB 持久化缓存 ====================
//
// 问题：之前模型文件仅存于内存（Map），Worker 销毁或页面刷新后全部丢失，
//       导致用户每次打开知识库设置都要重新下载模型（~30MB），体验极差。
//
// 方案：使用 IndexedDB 持久化缓存下载的模型文件。
//       下载前先检查缓存，命中则直接使用；下载后写入缓存供下次使用。
//       缓存 key 为 modelId（如 'Xenova/all-MiniLM-L6-v2'），
//       value 为该模型所有文件的 { fileName, data } 数组。

const MODEL_CACHE_DB_NAME = 'ModelFileCache'
const MODEL_CACHE_DB_VERSION = 1
const MODEL_CACHE_STORE = 'modelFiles'

/** 缓存记录结构 */
interface ModelCacheRecord {
  /** 缓存 key = modelId */
  id: string
  /** 模型所有文件 */
  files: PreDownloadedFile[]
  /** 缓存写入时间 */
  cachedAt: number
}

/** 打开模型缓存数据库 */
async function openModelCacheDB(): Promise<IDBPDatabase> {
  return openDB(MODEL_CACHE_DB_NAME, MODEL_CACHE_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(MODEL_CACHE_STORE)) {
        db.createObjectStore(MODEL_CACHE_STORE, { keyPath: 'id' })
      }
    }
  })
}

/**
 * 从 IndexedDB 读取已缓存的模型文件。
 * 如果缓存命中且文件数量匹配，返回 PreDownloadedFile[]；否则返回 null。
 */
async function getCachedModelFiles(modelId: string): Promise<PreDownloadedFile[] | null> {
  try {
    const db = await openModelCacheDB()
    const record: ModelCacheRecord | undefined = await db.get(MODEL_CACHE_STORE, modelId)
    if (record && record.files && record.files.length >= MODEL_FILES.length) {
      console.log(`[EmbeddingService] IndexedDB 缓存命中: ${modelId} (${record.files.length} 个文件, 缓存于 ${new Date(record.cachedAt).toLocaleString()})`)
      return record.files
    }
    return null
  } catch (err) {
    console.warn('[EmbeddingService] 读取模型缓存失败:', err)
    return null
  }
}

/**
 * 将下载的模型文件写入 IndexedDB 持久化缓存。
 */
async function saveModelFilesToCache(modelId: string, files: PreDownloadedFile[]): Promise<void> {
  try {
    const db = await openModelCacheDB()
    const record: ModelCacheRecord = {
      id: modelId,
      files,
      cachedAt: Date.now()
    }
    await db.put(MODEL_CACHE_STORE, record)
    const totalSize = files.reduce((sum, f) => sum + f.data.length, 0)
    console.log(`[EmbeddingService] 模型文件已缓存到 IndexedDB: ${modelId} (${files.length} 个文件, ${Math.round(totalSize / 1024 / 1024)}MB)`)
  } catch (err) {
    // 缓存写入失败不影响主流程，仅打印警告
    console.warn('[EmbeddingService] 写入模型缓存失败（不影响使用）:', err)
  }
}

/**
 * 清除本地模型的 IndexedDB 缓存。
 * 供缓存管理 UI 调用。
 */
export async function clearModelFileCache(): Promise<void> {
  try {
    const db = await openModelCacheDB()
    await db.clear(MODEL_CACHE_STORE)
    console.log('[EmbeddingService] 模型文件缓存已清除')
  } catch (err) {
    console.warn('[EmbeddingService] 清除模型缓存失败:', err)
  }
}

/**
 * 获取模型文件缓存的统计信息。
 * 供缓存管理 UI 调用。
 */
export async function getModelFileCacheStats(): Promise<{ sizeBytes: number; recordCount: number }> {
  try {
    const db = await openModelCacheDB()
    const records: ModelCacheRecord[] = await db.getAll(MODEL_CACHE_STORE)
    let sizeBytes = 0
    for (const record of records) {
      for (const file of record.files) {
        sizeBytes += file.data.length
      }
    }
    return { sizeBytes, recordCount: records.length }
  } catch {
    return { sizeBytes: 0, recordCount: 0 }
  }
}

// ==================== TF-IDF 分词器 ====================

function isChinese(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= 0x4e00 && code <= 0x9fff
}

function isLetter(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

function tokenize(text: string): string[] {
  const tokens: string[] = []
  const chars = Array.from(text.toLowerCase())
  let i = 0

  while (i < chars.length) {
    const ch = chars[i]

    if (isChinese(ch)) {
      tokens.push(ch)
      if (i + 1 < chars.length && isChinese(chars[i + 1])) {
        tokens.push(ch + chars[i + 1])
      }
      i++
    } else if (isLetter(ch) || isDigit(ch)) {
      let word = ''
      while (i < chars.length && (isLetter(chars[i]) || isDigit(chars[i]))) {
        word += chars[i]
        i++
      }
      if (word.length > 0) {
        tokens.push(word)
      }
    } else {
      i++
    }
  }

  return tokens
}

// ==================== TF-IDF 哈希函数 ====================

function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % TFIDF_VECTOR_DIM
}

function hashTokens(tokens: string[]): number[] {
  const vector = new Float64Array(TFIDF_VECTOR_DIM)

  for (const token of tokens) {
    const idx1 = fnv1aHash(token)
    const reversed = Array.from(token).reverse().join('')
    const idx2 = fnv1aHash(reversed)

    vector[idx1] += 1
    if (idx1 !== idx2) {
      vector[idx2] -= 1
    }
  }

  return Array.from(vector)
}

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

function applyTF(vector: number[]): number[] {
  const result = new Array(vector.length)
  for (let i = 0; i < vector.length; i++) {
    result[i] =
      vector[i] > 0
        ? Math.log(1 + vector[i])
        : vector[i] < 0
          ? -Math.log(1 - vector[i])
          : 0
  }
  return result
}

// ==================== TF-IDF 文档频率 ====================

const documentFrequency = new Map<string, number>()
let totalDocuments = 0

function applyIDF(vector: number[], tokens: string[]): number[] {
  if (totalDocuments === 0) return vector

  const result = new Array(vector.length).fill(0)
  for (const token of tokens) {
    const df = documentFrequency.get(token) ?? 0
    const idf = Math.log(totalDocuments / (1 + df)) + 1
    const idx1 = fnv1aHash(token)
    const reversed = Array.from(token).reverse().join('')
    const idx2 = fnv1aHash(reversed)

    result[idx1] += idf
    if (idx1 !== idx2) {
      result[idx2] -= idf * 0.5
    }
  }
  for (let i = 0; i < result.length; i++) {
    if (result[i] > 0) result[i] = Math.log(1 + result[i])
    else if (result[i] < 0) result[i] = -Math.log(1 - result[i])
  }
  return result
}

// ==================== TF-IDF 向量化 ====================

function tfidfEmbed(text: string): number[] {
  const tokens = tokenize(text)
  let vector = hashTokens(tokens)
  vector = applyTF(vector)
  if (totalDocuments > 0) {
    vector = applyIDF(vector, tokens)
  }
  return l2Normalize(vector)
}

function tfidfEmbedBatch(texts: string[]): number[][] {
  // 更新文档频率统计
  totalDocuments += texts.length
  for (const text of texts) {
    const uniqueTokens = new Set(tokenize(text))
    for (const token of uniqueTokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
    }
  }

  const results: number[][] = []
  for (const text of texts) {
    const tokens = tokenize(text)
    let vector = hashTokens(tokens)
    vector = applyTF(vector)
    vector = applyIDF(vector, tokens)
    results.push(l2Normalize(vector))
  }

  return results
}

// ==================== Embedding 服务 ====================

/** 状态变更监听器 */
type StatusListener = (status: EmbeddingEngineStatus) => void

let worker: Worker | null = null
/** 当前 Worker 对应的配置快照（用于判断是否可复用） */
let activeConfig: EmbeddingProviderConfig | null = null
/** 进行中的初始化 Promise，避免并发 init 重复创建 Worker */
let initPromise: Promise<void> | null = null
/** 初始化代数：切换配置/强制 reinit 时递增，使过期的异步 init 自动作废 */
let initGeneration = 0
let requestIdCounter = 0
const pendingRequests = new Map<
  string,
  { resolve: (v: number[] | number[][]) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
>()

const REQUEST_TIMEOUT = 60000 // 60s 超时

let engineStatus: EmbeddingEngineStatus = {
  mode: 'tfidf',
  providerType: 'tfidf',
  modelLoading: false,
  modelReady: false,
  loadProgress: 0,
  loadPhase: 'idle'
}

const statusListeners = new Set<StatusListener>()

function updateStatus(partial: Partial<EmbeddingEngineStatus>): void {
  engineStatus = { ...engineStatus, ...partial }
  for (const listener of statusListeners) {
    try {
      listener(engineStatus)
    } catch {
      // 忽略监听器异常
    }
  }
}

function generateRequestId(): string {
  return `req_${++requestIdCounter}_${Date.now()}`
}

/** 比较两个 embedding 配置是否等价（决定是否可复用已加载的 Worker） */
function isSameEmbeddingConfig(
  a: EmbeddingProviderConfig | null,
  b: EmbeddingProviderConfig | null
): boolean {
  if (!a || !b) return false
  if (a.type !== b.type) return false
  switch (a.type) {
    case 'tfidf':
      return true
    case 'local-model': {
      const bb = b as LocalModelProviderConfig
      return a.modelId === bb.modelId
        && (a.mirrorUrl || '') === (bb.mirrorUrl || '')
        && (a.modelFileName || '') === (bb.modelFileName || '')
    }
    case 'ollama': {
      const bb = b as OllamaProviderConfig
      return a.baseUrl === bb.baseUrl && a.model === bb.model
    }
    case 'openai-api': {
      const bb = b as OpenAIApiProviderConfig
      return a.baseUrl === bb.baseUrl && a.model === bb.model && a.apiKey === bb.apiKey
    }
    default:
      return false
  }
}

function sendToWorker(request: WorkerRequest): Promise<number[] | number[][]> {
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(new Error('Worker 未初始化'))
      return
    }

    const id = 'id' in request ? request.id : generateRequestId()
    const reqWithId = { ...request, id } as WorkerRequest

    const timer = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error('Worker 请求超时（60s）'))
    }, REQUEST_TIMEOUT)

    pendingRequests.set(id, { resolve, reject, timer })
    worker.postMessage(reqWithId)
  })
}

function handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
  const response = event.data

  switch (response.type) {
    case 'progress':
      // 仅在尚未就绪时更新加载进度，避免初始化后的冗余进度把 UI 打回 loading
      if (!engineStatus.modelReady) {
        updateStatus({
          modelLoading: true,
          loadProgress: response.percent,
          loadPhase: response.phase as EmbeddingEngineStatus['loadPhase'],
          loadPhaseDetail: response.detail
        })
      }
      break

    case 'ready':
      updateStatus({
        mode: 'semantic',
        modelLoading: false,
        modelReady: true,
        loadProgress: 100,
        loadPhase: 'ready',
        semanticDimension: response.dimension,
        errorMessage: undefined,
        errorDetail: undefined,
        errorRecoverable: undefined
      })
      break

    case 'result': {
      const pending = pendingRequests.get(response.id)
      if (pending) {
        clearTimeout(pending.timer)
        pendingRequests.delete(response.id)
        if (response.embedding.length === 0) {
          pending.reject(new Error('向量生成失败'))
        } else {
          pending.resolve(response.embedding)
        }
      }
      break
    }

    case 'batchResult': {
      const pending = pendingRequests.get(response.id)
      if (pending) {
        clearTimeout(pending.timer)
        pendingRequests.delete(response.id)
        if (response.embeddings.length === 0) {
          pending.reject(new Error('批量向量生成失败'))
        } else {
          pending.resolve(response.embeddings)
        }
      }
      break
    }

    case 'error': {
      // 关键修复：模型已就绪后的推理/迁移失败，不应把 modelReady 打回 false。
      // 否则用户过一段时间再进设置页会误判“需要重新加载”，并销毁仍可用的 Worker。
      if (engineStatus.modelReady && worker) {
        console.warn('[EmbeddingService] 语义推理错误（模型仍保持就绪）:', response.message)
        // 仅拒绝当前批次请求，不降级引擎就绪状态
        for (const [id, pending] of pendingRequests) {
          clearTimeout(pending.timer)
          pending.reject(new Error(response.message))
          pendingRequests.delete(id)
        }
        break
      }

      // 初始化阶段失败：真正标记为未就绪
      updateStatus({
        mode: 'tfidf',
        modelLoading: false,
        modelReady: false,
        loadPhase: 'error',
        errorMessage: response.message,
        errorDetail: response.detail,
        errorRecoverable: response.recoverable
      })
      for (const [id, pending] of pendingRequests) {
        clearTimeout(pending.timer)
        pending.reject(new Error(response.message))
        pendingRequests.delete(id)
      }
      break
    }
  }
}

// ==================== 导出服务 ====================

export const embeddingService = {
  /**
   * 初始化语义引擎（通过 Web Worker）
   * 如果 config 为 null 或 providerType 为 'tfidf'，则不启动 Worker
   *
   * 复用策略：
   * 1. Worker 已就绪且配置相同 → 直接返回（不重复加载）
   * 2. 正在初始化且配置相同 → 复用同一个 initPromise
   * 3. 配置变化 → 销毁旧 Worker 后重新初始化
   */
  async init(config: EmbeddingProviderConfig | null): Promise<void> {
    // 如果没有配置或配置为 tfidf，保持纯 TF-IDF 模式
    if (!config || config.type === 'tfidf') {
      if (worker || engineStatus.modelReady || engineStatus.modelLoading || initPromise) {
        initGeneration++
        this.disposeWorker()
        activeConfig = null
        initPromise = null
      }
      updateStatus({
        mode: 'tfidf',
        providerType: 'tfidf',
        modelLoading: false,
        modelReady: false,
        loadProgress: 0,
        loadPhase: 'idle'
      })
      return
    }

    // 已就绪且配置相同：直接复用，避免“过一段时间又重新加载”
    if (worker && engineStatus.modelReady && isSameEmbeddingConfig(activeConfig, config)) {
      return
    }

    // 正在初始化且配置相同：等待已有流程完成
    if (initPromise && isSameEmbeddingConfig(activeConfig, config)) {
      return initPromise
    }

    // 配置变化或尚未就绪：销毁旧 Worker 后重新初始化
    initGeneration++
    const generation = initGeneration
    this.disposeWorker()
    activeConfig = config

    const isStale = () => generation !== initGeneration

    const runInit = async (): Promise<void> => {
      if (isStale()) return

      updateStatus({
        providerType: config.type,
        modelLoading: true,
        modelReady: false,
        loadProgress: 0,
        loadPhase: 'idle',
        errorMessage: undefined,
        errorDetail: undefined,
        errorRecoverable: undefined
      })

      try {
        // ---- 对 local-model 提供者：通过 Electron 主进程代理预下载模型文件 ----
        // Web Worker 内的 fetch 受浏览器 CORS 限制，无法从 hf-mirror.com 等镜像站下载。
        // 而 Electron 主进程使用 Node.js https 模块，与 curl 一样不受 CORS 限制。
        let preDownloadedFiles: PreDownloadedFile[] | null = null
        if (config.type === 'local-model') {
          const lmConfig = config as LocalModelProviderConfig
          const mirror = lmConfig.mirrorUrl || 'https://huggingface.co'
          const baseUrl = `${mirror.replace(/\/+$/, '')}/${lmConfig.modelId}/resolve/main`

          // ---- 优先从 IndexedDB 持久化缓存读取 ----
          updateStatus({ loadPhase: 'downloading', loadProgress: 2, loadPhaseDetail: '正在检查本地缓存...' })
          preDownloadedFiles = await getCachedModelFiles(lmConfig.modelId)
          if (isStale()) return

          if (preDownloadedFiles) {
            // 缓存命中，跳过网络下载
            updateStatus({ loadProgress: 80, loadPhaseDetail: `从本地缓存加载 ${preDownloadedFiles.length} 个模型文件（无需下载）` })
          } else {
            // 缓存未命中，通过网络下载
            const hasElectronModelAPI = typeof window !== 'undefined'
              && !!window.electronAPI?.model?.downloadFiles

            if (hasElectronModelAPI) {
              updateStatus({ loadPhase: 'downloading', loadProgress: 5, loadPhaseDetail: '首次使用，正在下载模型文件...' })

              try {
                const urls = MODEL_FILES.map(f => `${baseUrl}/${f}`)
                const results = await window.electronAPI.model.downloadFiles(urls) as Array<{ url: string; data: number[] }>
                if (isStale()) return

                // 将 URL 映射回文件名
                preDownloadedFiles = results.map(r => {
                  const fileName = r.url.replace(`${baseUrl}/`, '')
                  return { fileName, data: r.data }
                })

                updateStatus({ loadProgress: 80, loadPhaseDetail: `已下载 ${preDownloadedFiles.length} 个模型文件` })

                // ---- 下载成功后写入 IndexedDB 持久化缓存 ----
                await saveModelFilesToCache(lmConfig.modelId, preDownloadedFiles)
              } catch (dlErr) {
                // 下载失败不阻塞，Worker 会自行尝试浏览器 fetch 回退
                console.warn('[EmbeddingService] Electron 代理下载失败，Worker 将尝试浏览器 fetch:', dlErr)
                preDownloadedFiles = null
              }
            }
          }
        }

        if (isStale()) return

        // 创建 Worker
        const createdWorker = new Worker(
          new URL('../workers/embedding-worker.ts', import.meta.url),
          { type: 'module' }
        )
        worker = createdWorker

        // 等待 Worker ready / error，确保 init 返回时状态已稳定
        const readyPromise = new Promise<void>((resolve, reject) => {
          const onMessage = (event: MessageEvent<WorkerResponse>) => {
            const response = event.data
            if (response.type === 'ready') {
              createdWorker.removeEventListener('message', onMessage)
              createdWorker.removeEventListener('error', onError)
              resolve()
            } else if (response.type === 'error') {
              // 初始化失败才 reject；运行时错误不在这里处理
              createdWorker.removeEventListener('message', onMessage)
              createdWorker.removeEventListener('error', onError)
              reject(new Error(response.message))
            }
          }
          const onError = (error: ErrorEvent) => {
            createdWorker.removeEventListener('message', onMessage)
            createdWorker.removeEventListener('error', onError)
            reject(new Error(error.message || 'Worker 线程异常'))
          }
          createdWorker.addEventListener('message', onMessage)
          createdWorker.addEventListener('error', onError)
        })

        createdWorker.onmessage = handleWorkerMessage
        createdWorker.onerror = (error) => {
          // 仅在未就绪时降级；就绪后的 Worker 异常才视为致命
          if (!engineStatus.modelReady) {
            updateStatus({
              mode: 'tfidf',
              modelLoading: false,
              modelReady: false,
              loadPhase: 'error',
              errorMessage: 'Worker 线程异常',
              errorDetail: `Worker 错误: ${error.message}\n文件: ${error.filename}\n行号: ${error.lineno}`,
              errorRecoverable: true
            })
          } else {
            console.warn('[EmbeddingService] Worker 运行时异常（模型状态保持）:', error.message)
          }
        }

        // 如果有预下载文件，先发送给 Worker，再发送初始化命令
        if (preDownloadedFiles && preDownloadedFiles.length > 0) {
          createdWorker.postMessage({ type: 'files', files: preDownloadedFiles } as WorkerRequest)
        }
        createdWorker.postMessage({ type: 'init', config } as WorkerRequest)

        await readyPromise
        if (isStale()) {
          // 被更新的 init 取代：清理本次创建的 Worker
          createdWorker.terminate()
          if (worker === createdWorker) worker = null
        }
      } catch (err) {
        if (isStale()) return
        // 初始化失败时清理 Worker，避免半初始化状态被误复用
        if (worker) {
          worker.terminate()
          worker = null
        }
        updateStatus({
          mode: 'tfidf',
          modelLoading: false,
          modelReady: false,
          loadPhase: 'error',
          errorMessage: err instanceof Error ? err.message : '无法创建 Worker',
          errorDetail: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
          errorRecoverable: true
        })
      }
    }

    const currentPromise = runInit().finally(() => {
      // 仅清理属于当前 generation 的 promise 引用
      if (initPromise === currentPromise) {
        initPromise = null
      }
    })
    initPromise = currentPromise

    return currentPromise
  },

  /**
   * 获取当前引擎状态
   */
  getStatus(): EmbeddingEngineStatus {
    return { ...engineStatus }
  },

  /**
   * 订阅状态变化，返回取消订阅函数
   */
  onStatusChange(listener: StatusListener): () => void {
    statusListeners.add(listener)
    return () => {
      statusListeners.delete(listener)
    }
  },

  /**
   * 语义引擎是否就绪
   */
  isSemanticReady(): boolean {
    return engineStatus.modelReady && worker !== null
  },

  /**
   * 对单个文本生成向量
   * 自动选择引擎：语义就绪用 Worker，否则用 TF-IDF
   */
  async embed(text: string): Promise<number[]> {
    if (this.isSemanticReady()) {
      try {
        const id = generateRequestId()
        const result = await sendToWorker({ type: 'embed', id, text })
        if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'number') {
          return result as number[]
        }
        // Worker 返回空结果，降级到 TF-IDF
        console.warn('语义引擎返回空结果，降级到 TF-IDF')
        return tfidfEmbed(text)
      } catch (err) {
        console.warn('语义引擎调用失败，降级到 TF-IDF:', err)
        return tfidfEmbed(text)
      }
    }
    return tfidfEmbed(text)
  },

  /**
   * 批量生成向量（同时更新 TF-IDF 的 IDF 统计）
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    // 始终更新 TF-IDF 的 IDF 统计（兜底保障）
    tfidfEmbedBatch(texts.slice()) // 仅更新统计，不使用结果

    if (this.isSemanticReady()) {
      try {
        const id = generateRequestId()
        const result = await sendToWorker({ type: 'embedBatch', id, texts })
        if (Array.isArray(result) && result.length === texts.length) {
          return result as number[][]
        }
        console.warn('语义引擎批量返回结果不匹配，降级到 TF-IDF')
        return texts.map((t) => tfidfEmbed(t))
      } catch (err) {
        console.warn('语义引擎批量调用失败，降级到 TF-IDF:', err)
        return texts.map((t) => tfidfEmbed(t))
      }
    }
    return texts.map((t) => tfidfEmbed(t))
  },

  /**
   * 仅使用语义引擎生成向量（用于渐进迁移）
   * 如果语义引擎未就绪，返回 null
   */
  async embedWithSemantic(text: string): Promise<number[] | null> {
    if (!this.isSemanticReady()) return null
    try {
      const id = generateRequestId()
      const result = await sendToWorker({ type: 'embed', id, text })
      if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'number') {
        return result as number[]
      }
      return null
    } catch {
      return null
    }
  },

  /**
   * 仅使用语义引擎批量生成向量（用于渐进迁移）
   */
  async embedBatchWithSemantic(texts: string[]): Promise<number[][] | null> {
    if (!this.isSemanticReady()) return null
    try {
      const id = generateRequestId()
      const result = await sendToWorker({ type: 'embedBatch', id, texts })
      if (Array.isArray(result) && result.length === texts.length) {
        return result as number[][]
      }
      return null
    } catch {
      return null
    }
  },

  /**
   * 应用 IDF（逆文档频率）权重 - 保留兼容性
   */
  applyIDF(vector: number[], tokens: string[]): number[] {
    return applyIDF(vector, tokens)
  },

  /**
   * 获取向量维度
   */
  getDimension(): number {
    if (engineStatus.modelReady && engineStatus.semanticDimension) {
      return engineStatus.semanticDimension
    }
    return TFIDF_VECTOR_DIM
  },

  /** TF-IDF 向量维度 */
  getTfidfDimension(): number {
    return TFIDF_VECTOR_DIM
  },

  /** 语义向量维度（就绪后返回，否则返回 null） */
  getSemanticDimension(): number | null {
    return engineStatus.semanticDimension ?? null
  },

  /**
   * 重新初始化语义引擎（用于重试或切换提供者）
   */
  async reinit(config: EmbeddingProviderConfig): Promise<void> {
    initGeneration++
    this.disposeWorker()
    activeConfig = null
    initPromise = null
    await this.init(config)
  },

  /**
   * 销毁 Worker（不改变状态，用于内部）
   */
  disposeWorker(): void {
    if (worker) {
      worker.terminate()
      worker = null
    }
    // 拒绝所有待处理的请求
    for (const [, pending] of pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Worker 已销毁'))
    }
    pendingRequests.clear()
  },

  /**
   * 释放所有资源
   */
  dispose(): void {
    this.disposeWorker()
    activeConfig = null
    initPromise = null
    documentFrequency.clear()
    totalDocuments = 0
    statusListeners.clear()
    updateStatus({
      mode: 'tfidf',
      providerType: 'tfidf',
      modelLoading: false,
      modelReady: false,
      loadProgress: 0,
      loadPhase: 'idle'
    })
  }
}
