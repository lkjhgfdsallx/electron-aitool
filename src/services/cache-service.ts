/**
 * 缓存管理服务
 *
 * 统计各存储区域的空间占用，并提供清理功能
 */

import { openDB } from 'idb'
import { getModelFileCacheStats, clearModelFileCache } from './embedding-service'
import { conversationDb } from './conversation-db'
import { useConversationStore } from '../stores/conversation-store'
import i18n from '../i18n/config'

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

const cacheRegionText = (regionKey: string, field: 'name' | 'description'): string =>
  i18n.t(`settings.data.cacheRegions.${regionKey}.${field}`)

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

  // 对话元数据（localStorage，仅含 conversations 列表，不再含 messages）
  const convSize = getLocalStorageItemSize('conversations')
  let convCount = 0
  try {
    const convData = JSON.parse(localStorage.getItem('conversations') || '{}')
    convCount = (convData.state?.conversations?.length) ?? 0
  } catch { /* ignore */ }
  regions.push({
    key: 'conversations',
    name: cacheRegionText('conversations', 'name'),
    description: cacheRegionText('conversations', 'description'),
    storage: 'localStorage',
    sizeBytes: convSize,
    recordCount: convCount,
    clearable: false
  })

  // ⚡ 对话消息（IndexedDB ConversationData，逐条存储）
  try {
    const msgCount = await conversationDb.getMessageCount()
    // 估算消息大小：取全部消息序列化后的 JSON 大小
    let msgSize = 0
    if (msgCount > 0) {
      const allMessages = await conversationDb.getAllMessages()
      msgSize = new Blob([JSON.stringify(allMessages)]).size
    }
    regions.push({
      key: 'conversation-messages',
      name: cacheRegionText('conversationMessages', 'name'),
      description: cacheRegionText('conversationMessages', 'description'),
      storage: 'indexedDB',
      sizeBytes: msgSize,
      recordCount: msgCount,
      clearable: true
    })
  } catch { /* 数据库不存在 */ }

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
    name: cacheRegionText('aiProvidersModels', 'name'),
    description: cacheRegionText('aiProvidersModels', 'description'),
    storage: 'localStorage',
    sizeBytes: aiProvSize,
    recordCount: modelCount,
    clearable: true
  })

  // 全局配置
  const configSize = getLocalStorageItemSize('global-config')
  regions.push({
    key: 'global-config',
    name: cacheRegionText('globalConfig', 'name'),
    description: cacheRegionText('globalConfig', 'description'),
    storage: 'localStorage',
    sizeBytes: configSize,
    recordCount: 1,
    clearable: false
  })

  // UI 偏好
  const uiSize = getLocalStorageItemSize('ui-preferences')
  regions.push({
    key: 'ui-preferences',
    name: cacheRegionText('uiPreferences', 'name'),
    description: cacheRegionText('uiPreferences', 'description'),
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
    name: cacheRegionText('agentStore', 'name'),
    description: cacheRegionText('agentStore', 'description'),
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
    name: cacheRegionText('customTools', 'name'),
    description: cacheRegionText('customTools', 'description'),
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
    name: cacheRegionText('toolStats', 'name'),
    description: cacheRegionText('toolStats', 'description'),
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
      name: cacheRegionText('kbFiles', 'name'),
      description: cacheRegionText('kbFiles', 'description'),
      storage: 'indexedDB',
      sizeBytes: kbFileSize,
      recordCount: fileMetadata.length,
      clearable: true
    })

    regions.push({
      key: 'kb-embeddings',
      name: cacheRegionText('kbEmbeddings', 'name'),
      description: cacheRegionText('kbEmbeddings', 'description'),
      storage: 'indexedDB',
      sizeBytes: chunksSize,
      recordCount: chunks.length,
      clearable: true
    })
  } catch { /* 数据库不存在 */ }

  // Skills 数据
  try {
    const kbDb2 = await openDB('KnowledgeBase')
    try {
      const skills = await kbDb2.getAll('skills')
      const skillsSize = new Blob([JSON.stringify(skills)]).size
      regions.push({
        key: 'skills-data',
        name: cacheRegionText('skillsData', 'name'),
        description: cacheRegionText('skillsData', 'description'),
        storage: 'indexedDB',
        sizeBytes: skillsSize,
        recordCount: skills.length,
        clearable: true
      })
    } catch { /* store 可能不存在 */ }
  } catch { /* 数据库不存在 */ }

  // 网站分析报告
  try {
    const reportDb = await openDB('SiteAnalyzerReports')
    const reports = await reportDb.getAll('reports')
    const reportsSize = reports.reduce((sum, r) => sum + new Blob([r.html || '']).size, 0)
    regions.push({
      key: 'site-reports',
      name: cacheRegionText('siteReports', 'name'),
      description: cacheRegionText('siteReports', 'description'),
      storage: 'indexedDB',
      sizeBytes: reportsSize,
      recordCount: reports.length,
      clearable: true
    })
  } catch { /* 数据库不存在 */ }

  // 本地模型文件缓存
  try {
    const modelCacheStats = await getModelFileCacheStats()
    regions.push({
      key: 'model-files',
      name: cacheRegionText('modelFiles', 'name'),
      description: cacheRegionText('modelFiles', 'description'),
      storage: 'indexedDB',
      sizeBytes: modelCacheStats.sizeBytes,
      recordCount: modelCacheStats.recordCount,
      clearable: true
    })
  } catch { /* 数据库不存在 */ }

  return regions
}

/**
 * 流式获取各缓存区域统计（逐条返回）
 * 使用 AsyncGenerator 实现，每计算完一个区域即 yield，UI 可逐条渲染
 */
export async function* getCacheStatsStream(): AsyncGenerator<CacheRegion> {
  // ---- localStorage 缓存（同步，快速逐条返回） ----

  // 对话元数据（localStorage，仅含 conversations 列表，不再含 messages）
  const convSize = getLocalStorageItemSize('conversations')
  let convCount = 0
  try {
    const convData = JSON.parse(localStorage.getItem('conversations') || '{}')
    convCount = (convData.state?.conversations?.length) ?? 0
  } catch { /* ignore */ }
  yield {
    key: 'conversations',
    name: cacheRegionText('conversations', 'name'),
    description: cacheRegionText('conversations', 'description'),
    storage: 'localStorage',
    sizeBytes: convSize,
    recordCount: convCount,
    clearable: false
  }

  // ⚡ 对话消息（IndexedDB ConversationData，逐条存储）
  try {
    const msgCount = await conversationDb.getMessageCount()
    let msgSize = 0
    if (msgCount > 0) {
      const allMessages = await conversationDb.getAllMessages()
      msgSize = new Blob([JSON.stringify(allMessages)]).size
    }
    yield {
      key: 'conversation-messages',
      name: cacheRegionText('conversationMessages', 'name'),
      description: cacheRegionText('conversationMessages', 'description'),
      storage: 'indexedDB',
      sizeBytes: msgSize,
      recordCount: msgCount,
      clearable: true
    }
  } catch { /* 数据库不存在 */ }

  // AI 源配置（含模型列表缓存）
  const aiProvSize = getLocalStorageItemSize('ai-providers')
  let modelCount = 0
  try {
    const aiData = JSON.parse(localStorage.getItem('ai-providers') || '{}')
    const providers = aiData.state?.providers ?? []
    modelCount = providers.reduce((sum: number, p: { models?: unknown[] }) => sum + (p.models?.length ?? 0), 0)
  } catch { /* ignore */ }
  yield {
    key: 'ai-providers-models',
    name: cacheRegionText('aiProvidersModels', 'name'),
    description: cacheRegionText('aiProvidersModels', 'description'),
    storage: 'localStorage',
    sizeBytes: aiProvSize,
    recordCount: modelCount,
    clearable: true
  }

  // 全局配置
  const configSize = getLocalStorageItemSize('global-config')
  yield {
    key: 'global-config',
    name: cacheRegionText('globalConfig', 'name'),
    description: cacheRegionText('globalConfig', 'description'),
    storage: 'localStorage',
    sizeBytes: configSize,
    recordCount: 1,
    clearable: false
  }

  // UI 偏好
  const uiSize = getLocalStorageItemSize('ui-preferences')
  yield {
    key: 'ui-preferences',
    name: cacheRegionText('uiPreferences', 'name'),
    description: cacheRegionText('uiPreferences', 'description'),
    storage: 'localStorage',
    sizeBytes: uiSize,
    recordCount: 1,
    clearable: false
  }

  // Agent + 提示词
  const agentSize = getLocalStorageItemSize('agent-store')
  let agentCount = 0
  let promptCount = 0
  try {
    const agentData = JSON.parse(localStorage.getItem('agent-store') || '{}')
    agentCount = agentData.state?.agents?.length ?? 0
    promptCount = agentData.state?.prompts?.length ?? 0
  } catch { /* ignore */ }
  yield {
    key: 'agent-store',
    name: cacheRegionText('agentStore', 'name'),
    description: cacheRegionText('agentStore', 'description'),
    storage: 'localStorage',
    sizeBytes: agentSize,
    recordCount: agentCount + promptCount,
    clearable: false
  }

  // 自定义工具
  const toolSize = getLocalStorageItemSize('custom-tools')
  let toolCount = 0
  try {
    const toolData = JSON.parse(localStorage.getItem('custom-tools') || '{}')
    toolCount = toolData.state?.customTools?.length ?? 0
  } catch { /* ignore */ }
  yield {
    key: 'custom-tools',
    name: cacheRegionText('customTools', 'name'),
    description: cacheRegionText('customTools', 'description'),
    storage: 'localStorage',
    sizeBytes: toolSize,
    recordCount: toolCount,
    clearable: false
  }

  // 工具调用统计
  const statsSize = getLocalStorageItemSize('tool-stats')
  let statsCount = 0
  try {
    const statsData = JSON.parse(localStorage.getItem('tool-stats') || '{}')
    statsCount = Object.keys(statsData.state?.stats ?? {}).length
  } catch { /* ignore */ }
  yield {
    key: 'tool-stats',
    name: cacheRegionText('toolStats', 'name'),
    description: cacheRegionText('toolStats', 'description'),
    storage: 'localStorage',
    sizeBytes: statsSize,
    recordCount: statsCount,
    clearable: true
  }

  // ---- IndexedDB 缓存（异步，较慢，逐条返回） ----

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

    yield {
      key: 'kb-files',
      name: cacheRegionText('kbFiles', 'name'),
      description: cacheRegionText('kbFiles', 'description'),
      storage: 'indexedDB',
      sizeBytes: kbFileSize,
      recordCount: fileMetadata.length,
      clearable: true
    }

    // 估算 chunks 大小
    const chunksSize = new Blob([JSON.stringify(chunks)]).size
    yield {
      key: 'kb-embeddings',
      name: cacheRegionText('kbEmbeddings', 'name'),
      description: cacheRegionText('kbEmbeddings', 'description'),
      storage: 'indexedDB',
      sizeBytes: chunksSize,
      recordCount: chunks.length,
      clearable: true
    }
  } catch { /* 数据库不存在 */ }

  // Skills 数据
  try {
    const kbDb2 = await openDB('KnowledgeBase')
    try {
      const skills = await kbDb2.getAll('skills')
      const skillsSize = new Blob([JSON.stringify(skills)]).size
      yield {
        key: 'skills-data',
        name: cacheRegionText('skillsData', 'name'),
        description: cacheRegionText('skillsData', 'description'),
        storage: 'indexedDB',
        sizeBytes: skillsSize,
        recordCount: skills.length,
        clearable: true
      }
    } catch { /* store 可能不存在 */ }
  } catch { /* 数据库不存在 */ }

  // 网站分析报告
  try {
    const reportDb = await openDB('SiteAnalyzerReports')
    const reports = await reportDb.getAll('reports')
    const reportsSize = reports.reduce((sum, r) => sum + new Blob([r.html || '']).size, 0)
    yield {
      key: 'site-reports',
      name: cacheRegionText('siteReports', 'name'),
      description: cacheRegionText('siteReports', 'description'),
      storage: 'indexedDB',
      sizeBytes: reportsSize,
      recordCount: reports.length,
      clearable: true
    }
  } catch { /* 数据库不存在 */ }

  // 本地模型文件缓存
  try {
    const modelCacheStats = await getModelFileCacheStats()
    yield {
      key: 'model-files',
      name: cacheRegionText('modelFiles', 'name'),
      description: cacheRegionText('modelFiles', 'description'),
      storage: 'indexedDB',
      sizeBytes: modelCacheStats.sizeBytes,
      recordCount: modelCacheStats.recordCount,
      clearable: true
    }
  } catch { /* 数据库不存在 */ }
}

// ==================== 缓存清理 ====================

/**
 * 清除指定缓存区域
 */
export async function clearCache(regionKey: string): Promise<void> {
  switch (regionKey) {
    case 'conversations':
    case 'conversation-messages':
      // 清除所有对话消息（IDB + 内存），保留对话元数据
      await clearConversationMessages()
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

    case 'skills-data':
      await clearSkillsData()
      break

    case 'model-files':
      await clearModelFileCache()
      break

    default:
      throw new Error(`不支持清理的缓存区域: ${regionKey}`)
  }
}

/** 清除所有对话的消息内容（IDB + 内存） */
async function clearConversationMessages(): Promise<void> {
  // ⚡ 清空 IDB 中所有消息
  await conversationDb.clearAllMessages()

  // ⚡ 清空 store 内存中的所有消息，并重置对话元数据
  const store = useConversationStore.getState()
  const convIds = Object.keys(store.messages)
  for (const convId of convIds) {
    store.clearMessages(convId)
  }
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

/** 清除所有 Skills 数据 */
async function clearSkillsData(): Promise<void> {
  const db = await openDB('KnowledgeBase')
  try {
    await db.clear('skills')
  } catch { /* store 可能不存在 */ }
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
