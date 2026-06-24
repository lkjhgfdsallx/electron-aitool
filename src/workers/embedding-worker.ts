/**
 * Embedding Web Worker
 *
 * 在后台线程中处理语义模型的下载、初始化和推理，
 * 不阻塞主线程。支持三种语义引擎：
 * - local-model: Transformers.js（从 HuggingFace/镜像下载 ONNX 模型）
 * - ollama: 本地 Ollama 服务
 * - openai-api: OpenAI 兼容的 Embedding API
 *
 * TF-IDF 由主线程 embedding-service 直接处理，不经过 Worker。
 */

import type {
  EmbeddingProviderConfig,
  LocalModelProviderConfig,
  OllamaProviderConfig,
  OpenAIApiProviderConfig,
  PreDownloadedFile,
  WorkerRequest,
  WorkerResponse
} from '../types/knowledge-base'

// ==================== 工具函数 ====================

function post(response: WorkerResponse): void {
  self.postMessage(response)
}

function postProgress(phase: string, percent: number, detail?: string): void {
  post({ type: 'progress', phase, percent, detail })
}

function postError(message: string, detail: string, recoverable: boolean): void {
  post({ type: 'error', message, detail, recoverable })
}

/** 格式化结构化错误信息 */
function formatError(
  provider: string,
  url: string,
  error: unknown,
  extra?: string
): string {
  const timestamp = new Date().toISOString()
  const errStr = error instanceof Error ? error.message : String(error)
  const lines = [
    `[${provider}] ${url}`,
    `时间: ${timestamp}`,
    extra ? `详情: ${extra}` : '',
    `原因: ${errStr}`
  ].filter(Boolean)
  return lines.join('\n')
}

/** 带重试的 fetch */
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 3,
  onProgress?: (attempt: number) => void
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    onProgress?.(attempt)
    try {
      const response = await fetch(url, { ...options, redirect: 'follow' })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }
      return response
    } catch (err) {
      lastError = err
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)))
      }
    }
  }
  throw lastError
}

/**
 * 检测响应内容是否为意外的 HTML（而非预期的 JSON/二进制文件）
 */
function isHtmlResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type') || ''
  return contentType.includes('text/html')
}

// ==================== 预下载文件存储 ====================

/** 由主线程通过 'files' 消息传入的预下载文件（通过 Node.js 主进程代理下载，绕过 CORS） */
let preDownloadedFiles: PreDownloadedFile[] | null = null

// ==================== Local Model 引擎 ====================

interface LocalModelEngine {
  type: 'local-model'
  pipeline: unknown | null
  dimension: number
}

/**
 * transformers.js 加载模型所需的文件列表。
 * 这些文件会被预下载并存入自定义缓存，
 * 使 transformers.js 无需发起网络请求即可加载模型。
 */
const MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/model_quantized.onnx'
]

/**
 * 预下载模型文件并构建自定义缓存。
 *
 * transformers.js v2.x 在浏览器中默认不使用缓存系统（env.cacheDir 为 null），
 * 通过 env.useCustomCache + env.customCache 可注入自定义缓存。
 * 我们先手动下载文件，存入内存 Map，再包装为 transformers.js 兼容的缓存接口。
 *
 * 这样做的好处：
 * 1. 完全控制下载过程（处理重定向、重试、错误检测）
 * 2. 绕过 CORS 限制（transformers.js 内部 fetch 可能因 CORS 被阻止）
 * 3. 避免镜像站返回 HTML 页面的问题
 */
async function predownloadAndBuildCache(
  modelId: string,
  mirrorUrl: string,
  onProgress: (percent: number, fileName: string) => void
): Promise<Map<string, ArrayBuffer>> {
  const baseUrl = `${mirrorUrl}/${modelId}/resolve/main`
  const cache = new Map<string, ArrayBuffer>()
  const totalFiles = MODEL_FILES.length

  for (let i = 0; i < totalFiles; i++) {
    const file = MODEL_FILES[i]
    const url = `${baseUrl}/${file}`
    const percent = Math.round((i / totalFiles) * 100)

    onProgress(percent, file)

    try {
      const response = await fetchWithRetry(url, undefined, 3, (attempt) => {
        if (attempt > 1) {
          onProgress(percent, `${file} (重试 ${attempt}/3)`)
        }
      })

      // 检测是否意外收到 HTML 响应
      if (isHtmlResponse(response)) {
        const htmlPreview = (await response.text()).substring(0, 200)
        console.warn(`[Worker] 文件 ${file} 返回了 HTML 而非预期内容: ${htmlPreview}`)
        // 非关键文件跳过（如 special_tokens_map.json）
        if (file === 'special_tokens_map.json') continue
        throw new Error(`镜像站返回了 HTML 页面而非文件内容 (${file})`)
      }

      const buffer = await response.arrayBuffer()
      // 使用与 transformers.js 相同的 URL 格式作为缓存 key
      cache.set(url, buffer)
      console.log(`[Worker] 已缓存: ${file} (${buffer.byteLength} bytes)`)
    } catch (err) {
      // special_tokens_map.json 是可选的，失败不中断
      if (file === 'special_tokens_map.json') {
        console.warn(`[Worker] 可选文件下载失败: ${file}`, err)
        continue
      }
      // config.json, tokenizer.json, tokenizer_config.json 是必需的
      if (file !== 'onnx/model_quantized.onnx') {
        throw err
      }
      // onnx 文件失败也抛出
      throw err
    }
  }

  return cache
}

/**
 * 将内存 Map 包装为 transformers.js 兼容的 Cache API 接口。
 * transformers.js 要求 customCache 实现 match() 和 put() 方法。
 */
function createCustomCacheAdapter(fileCache: Map<string, ArrayBuffer>) {
  return {
    match: async (key: string): Promise<Response | undefined> => {
      const buffer = fileCache.get(key)
      if (buffer) {
        // 推断 Content-Type
        let contentType = 'application/octet-stream'
        if (key.endsWith('.json')) {
          contentType = 'application/json'
        } else if (key.endsWith('.onnx')) {
          contentType = 'application/octet-stream'
        }
        return new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(buffer.byteLength)
          }
        })
      }
      return undefined
    },
    put: async (_key: string, _response: Response): Promise<void> => {
      // no-op: 我们只读不写
    }
  }
}

async function initLocalModel(config: LocalModelProviderConfig): Promise<LocalModelEngine> {
  const { modelId, mirrorUrl } = config
  const effectiveMirror = mirrorUrl || 'https://huggingface.co'

  postProgress('downloading', 0, `正在加载 transformers.js 库...`)

  // 动态导入 transformers.js（v2.x）
  let transformers: typeof import('@xenova/transformers')
  try {
    transformers = await import('@xenova/transformers')
  } catch (err) {
    throw {
      message: 'transformers.js 库加载失败',
      detail: formatError('transformers.js', '@xenova/transformers', err, '请确认 @xenova/transformers 已正确安装'),
      recoverable: false
    }
  }

  const { pipeline, env } = transformers

  // ==================== 第一步：准备模型文件缓存 ====================
  // 计算 transformers.js 使用的远程 URL 前缀（与 hub.js pathJoin 行为一致）
  const remotePrefix = `${effectiveMirror.replace(/\/+$/, '')}/${modelId}/resolve/main`

  let fileCache: Map<string, ArrayBuffer>

  if (preDownloadedFiles && preDownloadedFiles.length > 0) {
    // ---- 路径 A：使用主线程通过 Electron 主进程代理预下载的文件 ----
    // 这些文件由 Node.js https 模块下载（无 CORS 限制），已通过 postMessage 传入 Worker。
    postProgress('downloading', 10, '正在从预下载缓存构建模型文件映射...')
    fileCache = new Map<string, ArrayBuffer>()
    for (const file of preDownloadedFiles) {
      const cacheKey = `${remotePrefix}/${file.fileName}`
      const buffer = new Uint8Array(file.data).buffer
      fileCache.set(cacheKey, buffer)
      console.log(`[Worker] 从预下载缓存加载: ${file.fileName} (${buffer.byteLength} bytes)`)
    }
    // 清理引用，释放内存
    preDownloadedFiles = null
  } else {
    // ---- 路径 B：回退到浏览器 fetch 直接下载（适用于无 CORS 限制的源） ----
    postProgress('downloading', 5, `正在从 ${effectiveMirror} 预下载模型文件...`)
    try {
      fileCache = await predownloadAndBuildCache(modelId, effectiveMirror, (percent, fileName) => {
        postProgress('downloading', 5 + Math.round(percent * 0.75), `正在下载: ${fileName}`)
      })
    } catch (err) {
      const errDetail = err instanceof Error ? `${err.message}\n${err.stack}` : String(err)
      throw {
        message: '模型文件下载失败',
        detail: formatError(
          'local-model',
          `${effectiveMirror}/${modelId}`,
          err,
          `请检查网络连接和镜像站可用性。\n技术详情：${errDetail}`
        ),
        recoverable: true
      }
    }
  }

  // ==================== 第二步：配置 transformers.js 环境 ====================
  // 禁用本地文件系统加载
  env.allowLocalModels = false
  // 设置远程主机为镜像站（用于缓存 key 匹配）
  env.remoteHost = effectiveMirror.endsWith('/') ? effectiveMirror : `${effectiveMirror}/`
  // 禁用浏览器默认缓存（我们使用自定义缓存）
  env.useBrowserCache = false
  // 启用自定义缓存
  env.useCustomCache = true
  env.customCache = createCustomCacheAdapter(fileCache)

  // ==================== 第三步：通过 pipeline 加载模型 ====================
  postProgress('loading', 80, '正在从缓存加载模型到内存...')

  let pipe: unknown
  try {
    const progressCallback = (progress: { status: string; file?: string; progress?: number }) => {
      if (progress.status === 'loading') {
        postProgress('loading', 85, `正在初始化: ${progress.file || '模型文件'}`)
      }
    }

    pipe = await pipeline('feature-extraction', modelId, {
      quantized: true,
      progress_callback: progressCallback
    })
  } catch (err) {
    // 清理自定义缓存配置
    env.useCustomCache = false
    env.customCache = null

    const errDetail = err instanceof Error ? `${err.message}\n${err.stack}` : String(err)
    throw {
      message: '语义模型加载失败',
      detail: formatError(
        'local-model',
        `${effectiveMirror}/${modelId}`,
        err,
        `模型文件已下载但加载到内存失败。\n技术详情：${errDetail}`
      ),
      recoverable: true
    }
  }

  // 模型加载完成，清理自定义缓存配置
  env.useCustomCache = false
  env.customCache = null

  // 探测向量维度
  postProgress('loading', 96, '正在探测向量维度...')
  let dimension = 384 // 默认值
  try {
    const testResult = await (pipe as (text: string, options: { pooling: string; normalize: boolean }) => Promise<{ dims: number[] }>)( // NOSONAR
      'test',
      { pooling: 'mean', normalize: true }
    )
    if (testResult && testResult.dims && testResult.dims.length >= 2) {
      dimension = testResult.dims[testResult.dims.length - 1]
    }
  } catch {
    // 使用默认维度
  }

  return { type: 'local-model', pipeline: pipe, dimension }
}

async function embedWithLocalModel(
  engine: LocalModelEngine,
  text: string
): Promise<number[]> {
  if (!engine.pipeline) throw new Error('模型未初始化')
  const result = await (engine.pipeline as (text: string, options: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>)( // NOSONAR
    text,
    { pooling: 'mean', normalize: true }
  )
  return Array.from(result.data)
}

// ==================== Ollama 引擎 ====================

interface OllamaEngine {
  type: 'ollama'
  baseUrl: string
  model: string
  dimension: number
}

async function initOllama(config: OllamaProviderConfig): Promise<OllamaEngine> {
  const { baseUrl, model } = config

  postProgress('loading', 10, `正在连接 Ollama 服务 (${baseUrl})...`)

  try {
    const response = await fetchWithRetry(
      `${baseUrl}/api/embeddings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: 'test' })
      },
      2,
      (attempt) => {
        if (attempt > 1) {
          postProgress('loading', 10 + attempt * 5, `重试连接 Ollama (${attempt}/2)...`)
        }
      }
    )

    const data = await response.json() as { embedding?: number[] }

    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error('Ollama 返回的数据格式不正确，缺少 embedding 字段')
    }

    const dimension = data.embedding.length

    postProgress('ready', 100, `Ollama 模型 ${model} 就绪，维度: ${dimension}`)
    return { type: 'ollama', baseUrl, model, dimension }
  } catch (err) {
    if (err && typeof err === 'object' && 'message' in err && 'detail' in err) throw err
    throw {
      message: 'Ollama 服务连接失败',
      detail: formatError('ollama', `${baseUrl}/api/embeddings`, err, `模型: ${model}`),
      recoverable: true
    }
  }
}

async function embedWithOllama(
  engine: OllamaEngine,
  text: string
): Promise<number[]> {
  const response = await fetch(`${engine.baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: engine.model, prompt: text })
  })

  if (!response.ok) {
    throw new Error(`Ollama API 错误: HTTP ${response.status}`)
  }

  const data = await response.json() as { embedding?: number[] }
  if (!data.embedding || !Array.isArray(data.embedding)) {
    throw new Error('Ollama 返回数据格式不正确')
  }

  return data.embedding
}

// ==================== OpenAI API 引擎 ====================

interface OpenAIEngine {
  type: 'openai-api'
  baseUrl: string
  apiKey: string
  model: string
  dimension: number
}

async function initOpenAI(config: OpenAIApiProviderConfig): Promise<OpenAIEngine> {
  const { baseUrl, apiKey, model } = config

  postProgress('loading', 10, `正在验证 OpenAI API (${baseUrl})...`)

  try {
    const response = await fetchWithRetry(
      `${baseUrl}/embeddings`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model, input: 'test' })
      },
      2,
      (attempt) => {
        if (attempt > 1) {
          postProgress('loading', 10 + attempt * 5, `重试连接 API (${attempt}/2)...`)
        }
      }
    )

    const data = await response.json() as {
      data?: Array<{ embedding?: number[] }>
      error?: { message: string }
    }

    if (data.error) {
      throw new Error(`API 错误: ${data.error.message}`)
    }

    if (!data.data?.[0]?.embedding || !Array.isArray(data.data[0].embedding)) {
      throw new Error('API 返回数据格式不正确')
    }

    const dimension = data.data[0].embedding.length

    postProgress('ready', 100, `OpenAI API 模型 ${model} 就绪，维度: ${dimension}`)
    return { type: 'openai-api', baseUrl, apiKey, model, dimension }
  } catch (err) {
    if (err && typeof err === 'object' && 'message' in err && 'detail' in err) throw err
    throw {
      message: 'OpenAI API 连接失败',
      detail: formatError('openai-api', `${baseUrl}/embeddings`, err, `模型: ${model}`),
      recoverable: true
    }
  }
}

async function embedWithOpenAI(
  engine: OpenAIEngine,
  text: string
): Promise<number[]> {
  const response = await fetch(`${engine.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${engine.apiKey}`
    },
    body: JSON.stringify({ model: engine.model, input: text })
  })

  if (!response.ok) {
    throw new Error(`OpenAI API 错误: HTTP ${response.status}`)
  }

  const data = await response.json() as {
    data?: Array<{ embedding?: number[] }>
    error?: { message: string }
  }

  if (data.error) {
    throw new Error(`API 错误: ${data.error.message}`)
  }

  if (!data.data?.[0]?.embedding) {
    throw new Error('API 返回数据格式不正确')
  }

  return data.data[0].embedding
}

// ==================== 引擎管理器 ====================

type SemanticEngine = LocalModelEngine | OllamaEngine | OpenAIEngine

let engine: SemanticEngine | null = null
let isInitializing = false

async function initializeEngine(config: EmbeddingProviderConfig): Promise<void> {
  if (engine) return
  if (isInitializing) return
  isInitializing = true

  try {
    switch (config.type) {
      case 'local-model':
        engine = await initLocalModel(config)
        break
      case 'ollama':
        engine = await initOllama(config)
        break
      case 'openai-api':
        engine = await initOpenAI(config)
        break
      default:
        throw new Error(`不支持的提供者类型: ${(config as EmbeddingProviderConfig).type}`)
    }

    postProgress('ready', 100, '语义引擎就绪')
    post({ type: 'ready', dimension: engine.dimension })
  } catch (err) {
    const errObj = err as { message?: string; detail?: string; recoverable?: boolean }
    postError(
      errObj.message || '语义引擎初始化失败',
      errObj.detail || String(err),
      errObj.recoverable ?? true
    )
    engine = null
  } finally {
    isInitializing = false
  }
}

async function embedText(text: string): Promise<number[]> {
  if (!engine) throw new Error('语义引擎未初始化')

  switch (engine.type) {
    case 'local-model':
      return embedWithLocalModel(engine, text)
    case 'ollama':
      return embedWithOllama(engine, text)
    case 'openai-api':
      return embedWithOpenAI(engine, text)
    default:
      throw new Error('未知的引擎类型')
  }
}

// ==================== 消息处理 ====================

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data

  try {
    switch (request.type) {
      case 'files': {
        // 接收主线程通过 Electron IPC 预下载的模型文件
        preDownloadedFiles = request.files
        post({ type: 'progress', phase: 'downloading', percent: 100, detail: `已接收 ${request.files.length} 个预下载文件` })
        break
      }

      case 'init': {
        await initializeEngine(request.config)
        break
      }

      case 'embed': {
        try {
          const embedding = await embedText(request.text)
          post({ type: 'result', id: request.id, embedding })
        } catch (err) {
          const errObj = err as { message?: string }
          post({
            type: 'result',
            id: request.id,
            embedding: []
          })
          postError(
            '向量生成失败',
            errObj.message || String(err),
            true
          )
        }
        break
      }

      case 'embedBatch': {
        try {
          const embeddings: number[][] = []
          for (const text of request.texts) {
            const embedding = await embedText(text)
            embeddings.push(embedding)
          }
          post({ type: 'batchResult', id: request.id, embeddings })
        } catch (err) {
          const errObj = err as { message?: string }
          post({
            type: 'batchResult',
            id: request.id,
            embeddings: []
          })
          postError(
            '批量向量生成失败',
            errObj.message || String(err),
            true
          )
        }
        break
      }
    }
  } catch (err) {
    postError(
      'Worker 处理异常',
      err instanceof Error ? err.stack || err.message : String(err),
      false
    )
  }
}
