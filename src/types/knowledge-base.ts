// ==================== 知识库相关类型 ====================

/**
 * 知识库集合（Collection）
 * 用户可创建多个集合，如"产品文档库"、"代码规范库"等
 */
export interface KnowledgeCollection {
  id: string
  name: string
  description: string
  icon: string         // emoji 图标
  isDefault: boolean   // 是否为默认集合（不可删除）
  createdAt: number
  updatedAt: number
}

/** 创建集合的输入类型 */
export type KnowledgeCollectionCreateInput = Omit<KnowledgeCollection, 'id' | 'createdAt' | 'updatedAt'>

export interface KnowledgeBaseFile {
  id: string
  name: string
  size: number
  mimeType: string
  uploadedAt: number
  chunkCount: number  // 分块数量
  status: 'uploading' | 'processing' | 'ready' | 'error'
  errorMessage?: string
  /** 所属知识库集合 ID（为空则属于默认集合） */
  collectionId?: string
  /** 来源 URL（仅 URL 导入时有值） */
  sourceUrl?: string
}

export interface KnowledgeBaseChunk {
  id: string
  fileId: string
  content: string
  embedding: number[]      // 512维 TF-IDF 哈希向量（兜底，始终保留）
  embeddingV2?: number[]   // 语义向量（维度取决于 provider，渐进填充）
  index: number            // 在文件中的位置索引
}

export interface SearchResult {
  chunk: KnowledgeBaseChunk
  score: number       // 相似度分数
  fileName: string
}

// ==================== Embedding 提供者配置 ====================

/** Embedding 提供者类型 */
export type EmbeddingProviderType = 'tfidf' | 'local-model' | 'ollama' | 'openai-api'

/** TF-IDF 配置（零依赖，兜底方案） */
export interface TfidfProviderConfig {
  type: 'tfidf'
}

/** 本地模型配置（transformers.js，从 HuggingFace/镜像下载） */
export interface LocalModelProviderConfig {
  type: 'local-model'
  /** HuggingFace 模型 ID，如 'Xenova/all-MiniLM-L6-v2' */
  modelId: string
  /** 镜像站 URL，如 'https://hf-mirror.com'。留空则使用官方 huggingface.co */
  mirrorUrl: string
  /** 应用启动时自动下载模型 */
  autoDownload: boolean
  /** 量化模型文件名，默认 'onnx/model_quantized.onnx' */
  modelFileName?: string
}

/** Ollama 配置（本地 Ollama 服务） */
export interface OllamaProviderConfig {
  type: 'ollama'
  /** Ollama 服务地址，默认 'http://localhost:11434' */
  baseUrl: string
  /** 模型名称，如 'nomic-embed-text'、'mxbai-embed-large' */
  model: string
}

/** OpenAI 兼容 Embedding API 配置 */
export interface OpenAIApiProviderConfig {
  type: 'openai-api'
  /** API 地址，如 'https://api.openai.com/v1' */
  baseUrl: string
  /** API Key */
  apiKey: string
  /** 模型名称，如 'text-embedding-3-small' */
  model: string
}

/** Embedding 提供者配置联合类型 */
export type EmbeddingProviderConfig =
  | TfidfProviderConfig
  | LocalModelProviderConfig
  | OllamaProviderConfig
  | OpenAIApiProviderConfig

// ==================== 分块与检索配置 ====================

/** 分块模式 */
export type ChunkingMode = 'character' | 'delimiter' | 'token'

/** 分块配置 */
export interface ChunkingConfig {
  /** 分块模式：按字符 / 按分隔符 / 按 Token 数 */
  mode: ChunkingMode
  /** 每个分块的最大字符数或 Token 数，默认 500 */
  chunkSize: number
  /** 分块之间的重叠字符数或 Token 数，默认 50 */
  chunkOverlap: number
  /** 分隔符模式下的分隔符字符串，默认 '\n\n' */
  delimiter: string
}

/** 检索配置 */
export interface RetrievalConfig {
  /** 每次检索返回的最相似分块数，默认 5 */
  topK: number
  /** 最低余弦相似度阈值，默认 0.3 */
  similarityThreshold: number
  /** 混合检索中向量分数的权重，默认 0.6 */
  hybridVectorWeight: number
  /** 混合检索中 BM25 分数的权重，默认 0.4 */
  hybridBM25Weight: number
}

/** 默认分块配置 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  mode: 'character',
  chunkSize: 500,
  chunkOverlap: 50,
  delimiter: '\n\n'
}

/** 默认检索配置 */
export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  topK: 5,
  similarityThreshold: 0.3,
  hybridVectorWeight: 0.6,
  hybridBM25Weight: 0.4
}

/** 默认配置 */
export const DEFAULT_LOCAL_MODEL_CONFIG: LocalModelProviderConfig = {
  type: 'local-model',
  modelId: 'Xenova/all-MiniLM-L6-v2',
  mirrorUrl: 'https://hf-mirror.com',
  autoDownload: false,
  modelFileName: 'onnx/model_quantized.onnx'
}

export const DEFAULT_OLLAMA_CONFIG: OllamaProviderConfig = {
  type: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'nomic-embed-text'
}

export const DEFAULT_OPENAI_API_CONFIG: OpenAIApiProviderConfig = {
  type: 'openai-api',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'text-embedding-3-small'
}

// ==================== 语义引擎状态 ====================

/** 引擎模式 */
export type EmbeddingEngineMode = 'tfidf' | 'semantic'

/** 模型加载阶段 */
export type EmbeddingLoadPhase = 'idle' | 'downloading' | 'loading' | 'ready' | 'error'

/** 语义引擎状态 */
export interface EmbeddingEngineStatus {
  mode: EmbeddingEngineMode
  /** 当前使用的提供者类型 */
  providerType: EmbeddingProviderType
  modelLoading: boolean
  modelReady: boolean
  loadProgress: number           // 0-100
  loadPhase: EmbeddingLoadPhase
  loadPhaseDetail?: string       // 当前阶段的详细描述
  errorMessage?: string          // 简短错误描述（用户友好）
  errorDetail?: string           // 完整技术错误信息（可复制，含 URL/状态码/堆栈）
  errorRecoverable?: boolean     // 是否可重试
  /** 语义向量维度（provider 就绪后才有值） */
  semanticDimension?: number
}

// ==================== Web Worker 消息协议 ====================

/** 主线程 -> Worker */
export interface PreDownloadedFile {
  fileName: string
  /** 文件内容（ArrayBuffer 转 number[]，用于 IPC/Worker 传输） */
  data: number[]
}

export type WorkerRequest =
  | { type: 'init'; config: EmbeddingProviderConfig }
  | { type: 'files'; files: PreDownloadedFile[] }
  | { type: 'embed'; id: string; text: string }
  | { type: 'embedBatch'; id: string; texts: string[] }

/** Worker -> 主线程 */
export type WorkerResponse =
  | { type: 'progress'; phase: string; percent: number; detail?: string }
  | { type: 'ready'; dimension: number }
  | { type: 'result'; id: string; embedding: number[] }
  | { type: 'batchResult'; id: string; embeddings: number[][] }
  | { type: 'error'; message: string; detail: string; recoverable: boolean }

// ==================== 文件管理页面类型 ====================

/** 文件类型分区 */
export type FileTypeCategory = 'all' | 'document' | 'pdf' | 'data' | 'code' | 'web' | 'other'

/** 文件类型分区定义 */
export interface FileTypeCategoryDef {
  key: FileTypeCategory
  label: string
  extensions: string[]
}

/** 文件类型分区列表 */
export const FILE_TYPE_CATEGORIES: FileTypeCategoryDef[] = [
  { key: 'all', label: '全部', extensions: [] },
  { key: 'document', label: '文档', extensions: ['.txt', '.md', '.doc', '.docx', '.rtf'] },
  { key: 'pdf', label: 'PDF', extensions: ['.pdf'] },
  { key: 'data', label: '数据', extensions: ['.json', '.csv', '.xml', '.yaml', '.yml', '.toml'] },
  { key: 'code', label: '代码', extensions: ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.go', '.rs', '.swift', '.rb', '.php', '.css', '.scss', '.less', '.sh', '.bat', '.ps1', '.sql'] },
  { key: 'web', label: '网页', extensions: ['.html', '.htm'] },
  { key: 'other', label: '其他', extensions: [] }
]

/** 知识库页面视图模式 */
export type KBPageViewMode = 'files' | 'search' | 'simulator'

/** 搜索模式 */
export type SearchMode = 'keyword' | 'vector' | 'hybrid'

/** 搜索结果项（带高亮） */
export interface KBSearchResult {
  chunk: KnowledgeBaseChunk
  score: number
  fileName: string
  fileId: string
  /** 高亮片段（HTML） */
  highlight: string
}

/** 向量查询模拟器结果 */
export interface SimulatorResult {
  results: SearchResult[]
  queryTime: number
  engineType: EmbeddingEngineMode
  dimension: number
  totalChunks: number
}
