/**
 * 完整备份与恢复服务
 *
 * 将所有 localStorage 数据 + IndexedDB 数据（含知识库原始文件）打包为 .zip 文件
 * 支持从 .zip 备份文件恢复全部数据
 */

import JSZip from 'jszip'
import { openDB } from 'idb'
import { conversationDb } from './conversation-db'

// ==================== 常量 ====================

/** 备份格式版本号 */
const BACKUP_VERSION = 1

/** localStorage 键名列表 */
const LOCAL_STORAGE_KEYS = [
  'conversations',
  'global-config',
  'ui-preferences',
  'agent-store',
  'ai-providers',
  'custom-tools',
  'tool-stats',
  /** Agent 长期记忆（跨会话/会话级 key-value） */
  'agent-memory',
] as const

/** localStorage 中需要排除的键（已迁移到 IndexedDB） */
const EXCLUDED_LOCAL_STORAGE_KEYS = ['skills-preferences'] as const

/** IndexedDB 数据库名称 */
const KB_DB_NAME = 'KnowledgeBase'
const REPORTS_DB_NAME = 'SiteAnalyzerReports'
const CONVERSATION_DB_NAME = 'ConversationData'

// ==================== 类型 ====================

/** 备份元数据 */
interface BackupMetadata {
  version: number
  exportedAt: string
  appVersion: string
  localStorageKeys: string[]
  indexedDBDatabases: string[]
}

/** 备份进度回调 */
export interface BackupProgressCallback {
  (stage: string, current: number, total: number): void
}

/** 恢复选项 */
export interface RestoreOptions {
  /** 是否恢复 localStorage 数据 */
  restoreLocalStorage?: boolean
  /** 是否恢复 IndexedDB 知识库数据 */
  restoreKnowledgeBase?: boolean
  /** 是否恢复网站分析报告 */
  restoreReports?: boolean
  /** 是否恢复 Skills 数据 */
  restoreSkills?: boolean
  /** 是否恢复对话消息（IndexedDB） */
  restoreConversationMessages?: boolean
}

// ==================== 备份 ====================

/**
 * 创建完整备份，返回 zip 文件的 Blob
 */
export async function createBackup(
  onProgress?: BackupProgressCallback
): Promise<Blob> {
  const zip = new JSZip()

  // 1. 写入元数据
  const metadata: BackupMetadata = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: '1.0.0',
    localStorageKeys: [...LOCAL_STORAGE_KEYS],
    indexedDBDatabases: [KB_DB_NAME, REPORTS_DB_NAME, 'Skills', CONVERSATION_DB_NAME]
  }
  zip.file('metadata.json', JSON.stringify(metadata, null, 2))

  // 2. 备份 localStorage
  const lsFolder = zip.folder('localstorage')!
  const totalLS = LOCAL_STORAGE_KEYS.length
  for (let i = 0; i < totalLS; i++) {
    const key = LOCAL_STORAGE_KEYS[i]
    onProgress?.(`备份设置: ${key}`, i, totalLS + 3)
    const value = localStorage.getItem(key)
    if (value !== null) {
      lsFolder.file(`${key}.json`, value)
    }
  }

  // 3. 备份 IndexedDB 知识库
  onProgress?.('备份知识库数据...', totalLS, totalLS + 3)
  await backupKnowledgeBase(zip)

  // 4. 备份网站分析报告
  onProgress?.('备份分析报告...', totalLS + 1, totalLS + 4)
  await backupReports(zip)

  // 5. 备份 Skills
  onProgress?.('备份 Skills 数据...', totalLS + 2, totalLS + 4)
  await backupSkills(zip)

  // 6. 备份对话消息（IndexedDB）
  onProgress?.('备份对话消息...', totalLS + 3, totalLS + 5)
  await backupConversationMessages(zip)

  // 7. 生成 zip
  onProgress?.('生成备份文件...', totalLS + 4, totalLS + 5)
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })

  onProgress?.('备份完成', totalLS + 5, totalLS + 5)
  return blob
}

/** 备份对话消息（IndexedDB ConversationData） */
async function backupConversationMessages(zip: JSZip): Promise<void> {
  try {
    const messages = await conversationDb.getAllMessages()
    if (messages.length > 0) {
      const convFolder = zip.folder('indexeddb/conversations')!
      convFolder.file('messages.json', JSON.stringify(messages, null, 2))
    }
  } catch { /* 数据库不存在，跳过 */ }
}

/** 备份知识库 IndexedDB 数据 */
async function backupKnowledgeBase(zip: JSZip): Promise<void> {
  let db
  try {
    db = await openDB(KB_DB_NAME)
  } catch {
    // 数据库不存在，跳过
    return
  }

  const kbFolder = zip.folder('indexeddb/knowledge-base')!

  // 备份集合
  try {
    const collections = await db.getAll('kbCollections')
    kbFolder.file('collections.json', JSON.stringify(collections, null, 2))
  } catch { /* store 可能不存在 */ }

  // 备份文件元数据
  try {
    const fileMetadata = await db.getAll('fileMetadata')
    kbFolder.file('file-metadata.json', JSON.stringify(fileMetadata, null, 2))
  } catch { /* store 可能不存在 */ }

  // 备份 chunks
  try {
    const chunks = await db.getAll('chunks')
    // chunks 中的 embeddingV2 可能很大，但仍需完整备份
    kbFolder.file('chunks.json', JSON.stringify(chunks, null, 2))
  } catch { /* store 可能不存在 */ }

  // 备份原始文件数据
  const filesFolder = kbFolder.folder('files')!
  try {
    const fileDataRecords = await db.getAll('fileData')
    for (const record of fileDataRecords) {
      if (record && record.id && record.data) {
        // record.data 是 ArrayBuffer
        filesFolder.file(`${record.id}.bin`, record.data)
      }
    }
  } catch { /* store 可能不存在 */ }
}

/** 备份网站分析报告 */
async function backupReports(zip: JSZip): Promise<void> {
  let db
  try {
    db = await openDB(REPORTS_DB_NAME)
  } catch {
    return
  }

  const reportsFolder = zip.folder('indexeddb/reports')!
  try {
    const reports = await db.getAll('reports')
    for (const report of reports) {
      if (report && report.id && report.html) {
        reportsFolder.file(`${report.id}.html`, report.html)
      }
    }
  } catch { /* store 可能不存在 */ }
}

/** 备份 Skills IndexedDB 数据 */
async function backupSkills(zip: JSZip): Promise<void> {
  let db
  try {
    db = await openDB(KB_DB_NAME)
  } catch {
    return
  }

  try {
    const skills = await db.getAll('skills')
    if (skills.length > 0) {
      const skillsFolder = zip.folder('indexeddb/skills')!
      skillsFolder.file('skills.json', JSON.stringify(skills, null, 2))
    }
  } catch { /* store 可能不存在 */ }
}

// ==================== 恢复 ====================

/**
 * 从 zip 文件恢复数据
 * @param fileData zip 文件的 ArrayBuffer 或 Blob
 * @param options 恢复选项
 */
export async function restoreFromBackup(
  fileData: ArrayBuffer | Blob,
  options: RestoreOptions = {},
  onProgress?: BackupProgressCallback
): Promise<{ success: boolean; errors: string[] }> {
  const {
    restoreLocalStorage = true,
    restoreKnowledgeBase = true,
    restoreReports = true,
    restoreSkills = true,
    restoreConversationMessages = true
  } = options

  const errors: string[] = []

  // 1. 解析 zip
  onProgress?.('解析备份文件...', 0, 5)
  let zip: JSZip
  try {
    const buffer = fileData instanceof Blob ? await fileData.arrayBuffer() : fileData
    zip = await JSZip.loadAsync(buffer)
  } catch (e) {
    return { success: false, errors: [`无法解析备份文件: ${e instanceof Error ? e.message : String(e)}`] }
  }

  // 2. 校验元数据
  const metadataFile = zip.file('metadata.json')
  if (!metadataFile) {
    return { success: false, errors: ['备份文件缺少 metadata.json，可能不是有效的备份文件'] }
  }

  try {
    const metadataText = await metadataFile.async('string')
    const metadata = JSON.parse(metadataText) as BackupMetadata
    if (metadata.version > BACKUP_VERSION) {
      return { success: false, errors: [`备份文件版本 (${metadata.version}) 高于当前支持的版本 (${BACKUP_VERSION})`] }
    }
  } catch (e) {
    return { success: false, errors: [`元数据解析失败: ${e instanceof Error ? e.message : String(e)}`] }
  }

  // 3. 恢复 localStorage
  if (restoreLocalStorage) {
    onProgress?.('恢复设置数据...', 1, 5)
    const lsFolder = zip.folder('localstorage')
    if (lsFolder) {
      for (const key of LOCAL_STORAGE_KEYS) {
        const file = lsFolder.file(`${key}.json`)
        if (file) {
          try {
            const content = await file.async('string')
            // 验证是合法 JSON
            JSON.parse(content)
            localStorage.setItem(key, content)
          } catch (e) {
            errors.push(`恢复 localStorage[${key}] 失败: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      }
    }
  }

  // 4. 恢复知识库
  if (restoreKnowledgeBase) {
    onProgress?.('恢复知识库数据...', 2, 5)
    try {
      await restoreKnowledgeBaseData(zip)
    } catch (e) {
      errors.push(`恢复知识库失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 5. 恢复报告
  if (restoreReports) {
    onProgress?.('恢复分析报告...', 3, 6)
    try {
      await restoreReportsData(zip)
    } catch (e) {
      errors.push(`恢复分析报告失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 6. 恢复 Skills
  if (restoreSkills) {
    onProgress?.('恢复 Skills 数据...', 4, 7)
    try {
      await restoreSkillsData(zip)
    } catch (e) {
      errors.push(`恢复 Skills 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 7. 恢复对话消息
  if (restoreConversationMessages) {
    onProgress?.('恢复对话消息...', 5, 7)
    try {
      await restoreConversationMessagesData(zip)
    } catch (e) {
      errors.push(`恢复对话消息失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 清理已迁移到 IndexedDB 的 localStorage 旧数据
  for (const key of EXCLUDED_LOCAL_STORAGE_KEYS) {
    localStorage.removeItem(key)
  }

  onProgress?.('恢复完成', 6, 6)
  return { success: errors.length === 0, errors }
}

/** 恢复知识库 IndexedDB 数据 */
async function restoreKnowledgeBaseData(zip: JSZip): Promise<void> {
  const kbFolder = zip.folder('indexeddb/knowledge-base')
  if (!kbFolder) return

  const db = await openDB(KB_DB_NAME, undefined, {
    upgrade(db) {
      // 确保 store 存在
      if (!db.objectStoreNames.contains('kbCollections')) {
        db.createObjectStore('kbCollections', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('fileMetadata')) {
        const store = db.createObjectStore('fileMetadata', { keyPath: 'id' })
        store.createIndex('status', 'status')
        store.createIndex('uploadedAt', 'uploadedAt')
      }
      if (!db.objectStoreNames.contains('fileData')) {
        db.createObjectStore('fileData', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('chunks')) {
        const store = db.createObjectStore('chunks', { keyPath: 'id' })
        store.createIndex('fileId', 'fileId')
      }
      if (!db.objectStoreNames.contains('skills')) {
        const store = db.createObjectStore('skills', { keyPath: 'id' })
        store.createIndex('location', 'location')
        store.createIndex('enabled', 'enabled')
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
  })

  // 恢复集合
  const collectionsFile = kbFolder.file('collections.json')
  if (collectionsFile) {
    const data = JSON.parse(await collectionsFile.async('string'))
    const tx = db.transaction('kbCollections', 'readwrite')
    for (const item of data) {
      await tx.store.put(item)
    }
    await tx.done
  }

  // 恢复文件元数据
  const metadataFile = kbFolder.file('file-metadata.json')
  if (metadataFile) {
    const data = JSON.parse(await metadataFile.async('string'))
    const tx = db.transaction('fileMetadata', 'readwrite')
    for (const item of data) {
      await tx.store.put(item)
    }
    await tx.done
  }

  // 恢复 chunks
  const chunksFile = kbFolder.file('chunks.json')
  if (chunksFile) {
    const data = JSON.parse(await chunksFile.async('string'))
    const tx = db.transaction('chunks', 'readwrite')
    for (const item of data) {
      await tx.store.put(item)
    }
    await tx.done
  }

  // 恢复原始文件数据
  const filesFolder = kbFolder.folder('files')
  if (filesFolder) {
    const fileEntries: JSZip.JSZipObject[] = []
    filesFolder.forEach((_path, file) => {
      if (file.name.endsWith('.bin')) {
        fileEntries.push(file)
      }
    })

    if (fileEntries.length > 0) {
      const tx = db.transaction('fileData', 'readwrite')
      for (const file of fileEntries) {
        const id = file.name.replace('.bin', '').replace('files/', '')
        const data = await file.async('arraybuffer')
        await tx.store.put({ id, data })
      }
      await tx.done
    }
  }
}

/** 恢复网站分析报告 */
async function restoreReportsData(zip: JSZip): Promise<void> {
  const reportsFolder = zip.folder('indexeddb/reports')
  if (!reportsFolder) return

  const db = await openDB(REPORTS_DB_NAME, undefined, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('reports')) {
        const store = db.createObjectStore('reports', { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
      }
    }
  })

  const reportEntries: JSZip.JSZipObject[] = []
  reportsFolder.forEach((_path, file) => {
    if (file.name.endsWith('.html')) {
      reportEntries.push(file)
    }
  })

  if (reportEntries.length > 0) {
    const tx = db.transaction('reports', 'readwrite')
    for (const file of reportEntries) {
      const id = file.name.replace('.html', '').replace('reports/', '')
      const html = await file.async('string')
      await tx.store.put({ id, html, createdAt: Date.now() })
    }
    await tx.done
  }
}

/** 恢复 Skills IndexedDB 数据 */
async function restoreSkillsData(zip: JSZip): Promise<void> {
  const skillsFolder = zip.folder('indexeddb/skills')
  if (!skillsFolder) return

  const skillsFile = skillsFolder.file('skills.json')
  if (!skillsFile) return

  const db = await openDB(KB_DB_NAME, undefined, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('skills')) {
        const store = db.createObjectStore('skills', { keyPath: 'id' })
        store.createIndex('location', 'location')
        store.createIndex('enabled', 'enabled')
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
  })

  const data = JSON.parse(await skillsFile.async('string'))
  const tx = db.transaction('skills', 'readwrite')
  for (const item of data) {
    await tx.store.put(item)
  }
  await tx.done
}

/** 恢复对话消息（IndexedDB ConversationData） */
async function restoreConversationMessagesData(zip: JSZip): Promise<void> {
  const convFolder = zip.folder('indexeddb/conversations')
  if (!convFolder) return

  const messagesFile = convFolder.file('messages.json')
  if (!messagesFile) return

  const messages = JSON.parse(await messagesFile.async('string'))
  // ⚡ 使用 conversationDb 的批量写入 API（确保 store/schema 已初始化）
  await conversationDb.saveMessages(messages)
}

// ==================== 辅助 ====================

/**
 * 获取备份文件的摘要信息（不完全解析，只读 metadata）
 */
export async function getBackupSummary(fileData: ArrayBuffer | Blob): Promise<BackupMetadata | null> {
  try {
    const buffer = fileData instanceof Blob ? await fileData.arrayBuffer() : fileData
    const zip = await JSZip.loadAsync(buffer)
    const metadataFile = zip.file('metadata.json')
    if (!metadataFile) return null
    const text = await metadataFile.async('string')
    return JSON.parse(text) as BackupMetadata
  } catch {
    return null
  }
}

/**
 * 触发文件下载（浏览器环境）
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
