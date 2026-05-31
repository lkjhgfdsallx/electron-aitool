import { openDB, type IDBPDatabase } from 'idb'
import type { KnowledgeBaseFile, KnowledgeBaseChunk } from '../types'

const DB_NAME = 'KnowledgeBase'
const DB_VERSION = 1

const STORES = {
  FILE_METADATA: 'fileMetadata',
  FILE_DATA: 'fileData',
  CHUNKS: 'chunks'
} as const

class DBService {
  private db: IDBPDatabase | null = null

  async getDB(): Promise<IDBPDatabase> {
    if (this.db) return this.db

    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 文件元数据存储
        if (!db.objectStoreNames.contains(STORES.FILE_METADATA)) {
          const metadataStore = db.createObjectStore(STORES.FILE_METADATA, { keyPath: 'id' })
          metadataStore.createIndex('status', 'status')
          metadataStore.createIndex('uploadedAt', 'uploadedAt')
        }

        // 原始文件数据存储
        if (!db.objectStoreNames.contains(STORES.FILE_DATA)) {
          db.createObjectStore(STORES.FILE_DATA, { keyPath: 'id' })
        }

        // 向量分块存储
        if (!db.objectStoreNames.contains(STORES.CHUNKS)) {
          const chunkStore = db.createObjectStore(STORES.CHUNKS, { keyPath: 'id' })
          chunkStore.createIndex('fileId', 'fileId')
        }
      }
    })

    return this.db
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

  async clearAll(): Promise<void> {
    const db = await this.getDB()
    const tx = db.transaction(
      [STORES.FILE_METADATA, STORES.FILE_DATA, STORES.CHUNKS],
      'readwrite'
    )
    await Promise.all([
      tx.objectStore(STORES.FILE_METADATA).clear(),
      tx.objectStore(STORES.FILE_DATA).clear(),
      tx.objectStore(STORES.CHUNKS).clear(),
      tx.done
    ])
  }
}

export const dbService = new DBService()
