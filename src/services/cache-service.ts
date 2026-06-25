/**
 * 缓存管理服务
 *
 * 统计各存储区域的空间占用，并提供清理功能
 */

import { openDB } from 'idb'

// ==================== 类型 ====================

/** 缓存区域信息 */
export interface CacheRegion {
  /** 唯一标识 */
  key: string
  /** 显示名称 */
  name: string
  /** 描述 */
  description: string
  /** 存储位置 */
  storage: 'localStorage' | 'indexedDB' | 'memory'
  /** 占用字节数（估算） */
  sizeBytes: number
  /** 记录数量 */
  recordCount: number
  /** 是否可清理 */
  clearable: boolean
}

// ==================== 空间统计 ====================

/**
 * 获取 localStorage 中单个键的字节大小（UTF-16 编码）
 */
function getLocalStorageItemSize(key: string): number {
  const value = localStorage.getItem(key)
  if (!value) return 0
  // Blob 更准确地反映存储大小
  return new Blob([value]).size
}

/**
 * 获取所有缓存区域的统计信息
 */
export async function getCacheStats(): Promise<CacheRegion[]> {
  const regions: CacheRegion[] = []

  // ---- localStorage 缓存 ----

  // 对话消息
  const convSize = getLocalStorageItemSize('conversations')
  let convCount = 0
  try {
    const convData = JSON.parse(localStorage.getItem('conversations') || '{}')
    convCount = (convData.state?.conversations?.length) ?? 0
  } catch { /* ignore */ }
  regions.push({
    key: 'conversations',
    name: '对话消息缓存',
    description: '所有对话的元数据和消息记录',
    storage: 'localStorage',
    sizeBytes: convSize,
    recordCount: convCount,
    clearable: true
  })

  // AI 源配置（含模型列表缓存）
  const aiProvSize = getLocalStorageItemSize('ai-providers')
  let modelCount = 0
  try {
    const aiData = JSON.parse(localStorage.getItem('ai-providers') || '{}')
    const providers = aiData.state?.providers ?? []
    modelCount = providers.reduce((sum: number, p: { models?: unknown[] }) => sum + (p.models?.length ?? 0), 0)
  } catch { /* ignore */ }
  regions.push({
    key: 'ai-providers-models',
    name: 'AI 源模型缓存',
    description: 'AI Provider 配置及已获取的模型列表',
    storage: 'localStorage',
    sizeBytes: aiProvSize,
    recordCount: modelCount,
    clearable: true
  })

  // 全局配置
  const configSize = getLocalStorageItemSize('global-config')
  regions.push({
    key: 'global-config',
    name: '全局配置',
    description: 'API Key、MCP 服务器、模型参数等配置',
    storage: 'localStorage',
    sizeBytes: configSize,
    recordCount: 1,
    clearable: false
  })

  // UI 偏好
  const uiSize = getLocalStorageItemSize('ui-preferences')
  regions.push({
    key: 'ui-preferences',
    name: '界面偏好设置',
    description: '主题、字体、快捷键等界面配置',
    storage: 'localStorage',
    sizeBytes: uiSize,
    recordCount: 1,
    clearable: false
  })

  // Agent + 提示词
  const agentSize = getLocalStorageItemSize('agent-store')
  let agentCount = 0
  let promptCount = 0
  try {
    const agentData = JSON.parse(localStorage.getItem('agent-store') || '{}')
    agentCount = agentData.state?.agents?.length ?? 0
    promptCount = agentData.state?.prompts?.length ?? 0
  } catch { /* ignore */ }
  regions.push({
    key: 'agent-store',
    name: 'Agent 与提示词',
    description: 'Agent 配置和提示词模板',
    storage: 'localStorage',
    sizeBytes: agentSize,
    recordCount: agentCount + promptCount,
    clearable: false
  })

  // 自定义工具
  const toolSize = getLocalStorageItemSize('custom-tools')
  let toolCount = 0
  try {
    const toolData = JSON.parse(localStorage.getItem('custom-tools') || '{}')
    toolCount = toolData.state?.customTools?.length ?? 0
  } catch { /* ignore */ }
  regions.push({
    key: 'custom-tools',
    name: '自定义工具',
    description: '用户自定义的工具定义',
    storage: 'localStorage',
    sizeBytes: toolSize,
    recordCount: toolCount,
    clearable: false
  })

  // 工具调用统计
  const statsSize = getLocalStorageItemSize('tool-stats')
  let statsCount = 0
  try {
    const statsData = JSON.parse(localStorage.getItem('tool-stats') || '{}')
    statsCount = Object.keys(statsData.state?.stats ?? {}).length
  } catch { /* ignore */ }
  regions.push({
    key: 'tool-stats',
    name: '工具调用统计',
    description: '各工具的调用次数、成功率、耗时统计',
    storage: 'localStorage',
    sizeBytes: statsSize,
    recordCount: statsCount,
    clearable: true
  })

  // ---- IndexedDB 缓存 ----

  // 知识库文件
  try {
    const kbDb = await openDB('KnowledgeBase')
    const fileMetadata = await kbDb.getAll('fileMetadata')
    const chunks = await kbDb.getAll('chunks')

    // 估算知识库文件大小
    let kbFileSize = 0
    try {
      const fileDataRecords = await kbDb.getAll('fileData')
      for (const record of fileDataRecords) {
        if (record?.data) {
          kbFileSize += record.data.byteLength ?? 0
        }
      }
    } catch { /* ignore */ }

    // 估算 chunks 大小
    const chunksSize = new Blob([JSON.stringify(chunks)]).size

    regions.push({
      key: 'kb-files',
      name: '知识库文件数据',
      description: '已上传的原始文件二进制数据',
      storage: 'indexedDB',
      sizeBytes: kbFileSize,
      recordCount: fileMetadata.length,
      clearable: true
    })

    regions.push({
      key: 'kb-embeddings',
      name: 'Embeddings 向量缓存',
      description: '知识库文件的向量分块和语义嵌入',
      storage: 'indexedDB',
      sizeBytes: chunksSize,
      recordCount: chunks.length,
      clearable: true
    })
  } catch { /* 数据库不存在 */ }

  // 网站分析报告
  try {
    const reportDb = await openDB('SiteAnalyzerReports')
    const reports = await reportDb.getAll('reports')
    const reportsSize = reports.reduce((sum, r) => sum + new Blob([r.html || '']).size, 0)
    regions.push({
      key: 'site-reports',
      name: '网站分析报告',
      description: '已生成的网站分析 HTML 报告',
      storage: 'indexedDB',
      sizeBytes: reportsSize,
      recordCount: reports.length,
      clearable: true
    })
  } catch { /* 数据库不存在 */ }

  return regions
}

// ==================== 缓存清理 ====================

/**
 * 清除指定缓存区域
 */
export async function clearCache(regionKey: string): Promise<void> {
  switch (regionKey) {
    case 'conversations':
      // 清除所有对话消息，保留对话元数据
      clearConversationMessages()
      break

    case 'ai-providers-models':
      clearAIProviderModels()
      break

    case 'tool-stats':
      clearToolStats()
      break

    case 'kb-files':
      await clearKnowledgeBaseFiles()
      break

    case 'kb-embeddings':
      await clearEmbeddings()
      break

    case 'site-reports':
      await clearSiteReports()
      break

    default:
      throw new Error(`不支持清理的缓存区域: ${regionKey}`)
  }
}

/** 清除所有对话的消息内容 */
function clearConversationMessages(): void {
  try {
    const raw = localStorage.getItem('conversations')
    if (!raw) return
    const data = JSON.parse(raw)
    if (data.state) {
      data.state.messages = {}
      data.state.conversations = (data.state.conversations ?? []).map(
        (c: Record<string, unknown>) => ({
          ...c,
          messageCount: 0,
          lastMessagePreview: undefined
        })
      )
      localStorage.setItem('conversations', JSON.stringify(data))
    }
  } catch { /* ignore */ }
}

/** 清除 AI Provider 的模型列表缓存 */
function clearAIProviderModels(): void {
  try {
    const raw = localStorage.getItem('ai-providers')
    if (!raw) return
    const data = JSON.parse(raw)
    if (data.state?.providers) {
      data.state.providers = data.state.providers.map(
        (p: Record<string, unknown>) => ({ ...p, models: [] })
      )
      localStorage.setItem('ai-providers', JSON.stringify(data))
    }
  } catch { /* ignore */ }
}

/** 清除工具调用统计 */
function clearToolStats(): void {
  try {
    const raw = localStorage.getItem('tool-stats')
    if (!raw) return
    const data = JSON.parse(raw)
    if (data.state) {
      data.state.stats = {}
      localStorage.setItem('tool-stats', JSON.stringify(data))
    }
  } catch { /* ignore */ }
}

/** 清除知识库原始文件数据 */
async function clearKnowledgeBaseFiles(): Promise<void> {
  const db = await openDB('KnowledgeBase')
  const tx = db.transaction(['fileData', 'fileMetadata', 'chunks'], 'readwrite')
  await Promise.all([
    tx.objectStore('fileData').clear(),
    tx.objectStore('fileMetadata').clear(),
    tx.objectStore('chunks').clear(),
    tx.done
  ])
}

/** 清除所有 chunk 的 embeddingV2 向量 */
async function clearEmbeddings(): Promise<void> {
  const db = await openDB('KnowledgeBase')
  const tx = db.transaction('chunks', 'readwrite')
  const store = tx.objectStore('chunks')
  let cursor = await store.openCursor()
  while (cursor) {
    const chunk = cursor.value
    if (chunk.embeddingV2) {
      chunk.embeddingV2 = undefined
      await cursor.update(chunk)
    }
    cursor = await cursor.continue()
  }
  await tx.done
}

/** 清除所有网站分析报告 */
async function clearSiteReports(): Promise<void> {
  const db = await openDB('SiteAnalyzerReports')
  await db.clear('reports')
}

// ==================== 工具函数 ====================

/**
 * 格式化字节大小为可读字符串
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * 获取 localStorage 总使用量估算
 */
export function getLocalStorageTotalSize(): number {
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) {
      total += getLocalStorageItemSize(key)
    }
  }
  return total
}

/**
 * 获取浏览器存储配额信息
 */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate()
    return {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0
    }
  }
  return null
}
