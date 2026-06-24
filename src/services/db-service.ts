import { openDB, type IDBPDatabase } from 'idb'
import type { KnowledgeBaseFile, KnowledgeBaseChunk, KnowledgeCollection } from '../types'

const DB_NAME = 'KnowledgeBase'
const DB_VERSION = 3

const STORES = {
  FILE_METADATA: 'fileMetadata',
  FILE_DATA: 'fileData',
  CHUNKS: 'chunks',
  KB_COLLECTIONS: 'kbCollections'
} as const

/** 默认集合 ID（固定值，保证迁移稳定性） */
export const DEFAULT_COLLECTION_ID = 'default-collection'

class DBService {
  private db: IDBPDatabase | null = null

  async getDB(): Promise<IDBPDatabase> {
    if (this.db) return this.db

    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v1: 初始 schema
        if (oldVersion < 1) {
          // 文件元数据存储
          const metadataStore = db.createObjectStore(STORES.FILE_METADATA, { keyPath: 'id' })
          metadataStore.createIndex('status', 'status')
          metadataStore.createIndex('uploadedAt', 'uploadedAt')

          // 原始文件数据存储
          db.createObjectStore(STORES.FILE_DATA, { keyPath: 'id' })

          // 向量分块存储
          const chunkStore = db.createObjectStore(STORES.CHUNKS, { keyPath: 'id' })
          chunkStore.createIndex('fileId', 'fileId')
        }

        // v1 -> v2: 为 chunks 添加 embeddingV2 索引（渐进迁移用）
        if (oldVersion < 2) {
          // chunks store 已存在，无需重建
          // embeddingV2 是可选字段，存储时自动索引
          // 我们通过代码层面处理：查询无 embeddingV2 的 chunk 来做渐进迁移
        }

        // v2 -> v3: 新增知识库集合 store + fileMetadata 增加 collectionId 索引
        if (oldVersion < 3) {
          // 创建集合存储
          const collectionStore = db.createObjectStore(STORES.KB_COLLECTIONS, { keyPath: 'id' })
          collectionStore.createIndex('isDefault', 'isDefault')

          // 为 fileMetadata 新增 collectionId 索引
          // 在 upgrade 回调中，已有的 store 可通过 deleteObjectStore + createObjectStore 重建
          // 但这会丢失数据，所以这里只处理新安装的情况
          // 对于从 v2 升级的用户，索引会在第一次打开 store 时由代码层面处理
          // 新安装时 fileMetadata 在 oldVersion < 1 已创建，此处无需操作
        }
      }
    })

    return this.db
  }

  // ==================== 知识库集合操作 ====================

  async saveCollection(collection: KnowledgeCollection): Promise<void> {
    const db = await this.getDB()
    await db.put(STORES.KB_COLLECTIONS, collection)
  }

  async getCollection(id: string): Promise<KnowledgeCollection | undefined> {
    const db = await this.getDB()
    return db.get(STORES.KB_COLLECTIONS, id)
  }

  async getAllCollections(): Promise<KnowledgeCollection[]> {
    const db = await this.getDB()
    return db.getAll(STORES.KB_COLLECTIONS)
  }

  async deleteCollection(id: string): Promise<void> {
    const db = await this.getDB()
    // 检查是否为默认集合，不允许删除
    const collection = await db.get(STORES.KB_COLLECTIONS, id)
    if (collection?.isDefault) {
      throw new Error('不能删除默认知识库集合')
    }
    await db.delete(STORES.KB_COLLECTIONS, id)
  }

  async getDefaultCollection(): Promise<KnowledgeCollection | undefined> {
    const db = await this.getDB()
    const index = db.transaction(STORES.KB_COLLECTIONS).objectStore(STORES.KB_COLLECTIONS).index('isDefault')
    const all = await index.getAll(IDBKeyRange.only(true))
    return all[0]
  }

  // ==================== 文件元数据操作 ====================

  async saveFileMetadata(file: KnowledgeBaseFile): Promise<void> {
    const db = await this.getDB()
    await db.put(STORES.FILE_METADATA, file)
  }

  async getFileMetadata(id: string): Promise<KnowledgeBaseFile | undefined> {
    const db = await this.getDB()
    return db.get(STORES.FILE_METADATA, id)
  }

  async getAllFileMetadata(): Promise<KnowledgeBaseFile[]> {
    const db = await this.getDB()
    return db.getAll(STORES.FILE_METADATA)
  }

  /**
   * 获取指定集合的文件元数据
   * collectionId 为空时返回属于默认集合（或无集合标记）的文件
   */
  async getFileMetadataByCollection(collectionId: string): Promise<KnowledgeBaseFile[]> {
    const db = await this.getDB()
    const store = db.transaction(STORES.FILE_METADATA).objectStore(STORES.FILE_METADATA)

    // 尝试使用索引查询
    if (store.indexNames.contains('collectionId')) {
      const index = store.index('collectionId')
      // 如果是默认集合，同时获取无 collectionId 标记的旧数据
      if (collectionId === DEFAULT_COLLECTION_ID) {
        const allFiles = await index.getAll()
        return allFiles.filter(
          (f) => !f.collectionId || f.collectionId === collectionId
        )
      }
      return index.getAll(collectionId)
    }

    // 索引不存在时的降级处理
    const allFiles = await store.getAll()
    if (collectionId === DEFAULT_COLLECTION_ID) {
      return allFiles.filter((f) => !f.collectionId || f.collectionId === collectionId)
    }
    return allFiles.filter((f) => f.collectionId === collectionId)
  }

  async deleteFileMetadata(id: string): Promise<void> {
    const db = await this.getDB()
    await db.delete(STORES.FILE_METADATA, id)
  }

  // ==================== 文件数据操作 ====================

  async saveFileData(id: string, data: ArrayBuffer): Promise<void> {
    const db = await this.getDB()
    await db.put(STORES.FILE_DATA, { id, data })
  }

  async getFileData(id: string): Promise<ArrayBuffer | undefined> {
    const db = await this.getDB()
    const record = await db.get(STORES.FILE_DATA, id)
    return record?.data
  }

  async deleteFileData(id: string): Promise<void> {
    const db = await this.getDB()
    // 删除文件元数据
    await db.delete(STORES.FILE_METADATA, id)
    // 删除文件数据
    await db.delete(STORES.FILE_DATA, id)
    // 删除关联的分块
    const tx = db.transaction(STORES.CHUNKS, 'readwrite')
    const store = tx.objectStore(STORES.CHUNKS)
    const index = store.index('fileId')
    let cursor = await index.openCursor(IDBKeyRange.only(id))
    while (cursor) {
      await cursor.delete()
      cursor = await cursor.continue()
    }
    await tx.done
  }

  // ==================== 分块操作 ====================

  async saveChunks(chunks: KnowledgeBaseChunk[]): Promise<void> {
    const db = await this.getDB()
    const tx = db.transaction(STORES.CHUNKS, 'readwrite')
    const store = tx.objectStore(STORES.CHUNKS)
    for (const chunk of chunks) {
      await store.put(chunk)
    }
    await tx.done
  }

  async getChunksByFileId(fileId: string): Promise<KnowledgeBaseChunk[]> {
    const db = await this.getDB()
    const index = db.transaction(STORES.CHUNKS).objectStore(STORES.CHUNKS).index('fileId')
    return index.getAll(fileId)
  }

  async getAllChunks(): Promise<KnowledgeBaseChunk[]> {
    const db = await this.getDB()
    return db.getAll(STORES.CHUNKS)
  }

  /**
   * 获取指定集合下所有文件的 chunks
   * 通过先获取集合的文件 ID 列表，再过滤 chunks
   */
  async getChunksByCollection(collectionId: string): Promise<KnowledgeBaseChunk[]> {
    const files = await this.getFileMetadataByCollection(collectionId)
    if (files.length === 0) return []

    const fileIdSet = new Set(files.map((f) => f.id))
    const allChunks = await this.getAllChunks()
    return allChunks.filter((c) => fileIdSet.has(c.fileId))
  }

  async deleteChunksByFileId(fileId: string): Promise<void> {
    const db = await this.getDB()
    const tx = db.transaction(STORES.CHUNKS, 'readwrite')
    const store = tx.objectStore(STORES.CHUNKS)
    const index = store.index('fileId')
    let cursor = await index.openCursor(IDBKeyRange.only(fileId))
    while (cursor) {
      await cursor.delete()
      cursor = await cursor.continue()
    }
    await tx.done
  }

  // ==================== 语义向量迁移操作 ====================

  /**
   * 更新单个 chunk 的语义向量（embeddingV2）
   */
  async updateChunkEmbeddingV2(chunkId: string, embeddingV2: number[]): Promise<void> {
    const db = await this.getDB()
    const chunk = await db.get(STORES.CHUNKS, chunkId)
    if (chunk) {
      chunk.embeddingV2 = embeddingV2
      await db.put(STORES.CHUNKS, chunk)
    }
  }

  /**
   * 获取尚未有语义向量的 chunks（用于渐进迁移）
   */
  async getChunksWithoutEmbeddingV2(): Promise<KnowledgeBaseChunk[]> {
    const db = await this.getDB()
    const allChunks = await db.getAll(STORES.CHUNKS)
    return allChunks.filter((chunk) => !chunk.embeddingV2 || chunk.embeddingV2.length === 0)
  }

  /**
   * 统计语义向量迁移进度
   */
  async getMigrationProgress(): Promise<{ total: number; migrated: number }> {
    const db = await this.getDB()
    const allChunks = await db.getAll(STORES.CHUNKS)
    const total = allChunks.length
    const migrated = allChunks.filter((c) => c.embeddingV2 && c.embeddingV2.length > 0).length
    return { total, migrated }
  }

  /**
   * 清除所有 chunk 的语义向量（用于重建索引）
   */
  async clearAllEmbeddingV2(): Promise<void> {
    const db = await this.getDB()
    const tx = db.transaction(STORES.CHUNKS, 'readwrite')
    const store = tx.objectStore(STORES.CHUNKS)
    let cursor = await store.openCursor()
    while (cursor) {
      const chunk = cursor.value as KnowledgeBaseChunk
      if (chunk.embeddingV2) {
        chunk.embeddingV2 = undefined
        await cursor.update(chunk)
      }
      cursor = await cursor.continue()
    }
    await tx.done
  }

  // ==================== 清理操作 ====================

  /**
   * 清空指定集合的数据（文件和 chunks）
   */
  async clearCollection(collectionId: string): Promise<void> {
    const files = await this.getFileMetadataByCollection(collectionId)
    for (const file of files) {
      await this.deleteFileData(file.id)
    }
  }

  async clearAll(): Promise<void> {
    const db = await this.getDB()
    const tx = db.transaction(
      [STORES.FILE_METADATA, STORES.FILE_DATA, STORES.CHUNKS, STORES.KB_COLLECTIONS],
      'readwrite'
    )
    await Promise.all([
      tx.objectStore(STORES.FILE_METADATA).clear(),
      tx.objectStore(STORES.FILE_DATA).clear(),
      tx.objectStore(STORES.CHUNKS).clear(),
      tx.objectStore(STORES.KB_COLLECTIONS).clear(),
      tx.done
    ])
  }
}

export const dbService = new DBService()
