/**
 * 网站分析报告 IndexedDB 存储服务
 * 将大型 HTML 报告存储在 IndexedDB 中，避免占用 localStorage 空间
 */
import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'SiteAnalyzerReports'
const DB_VERSION = 1
const STORE_NAME = 'reports'

interface ReportRecord {
  /** 使用消息 ID 作为 key */
  id: string
  /** 报告 HTML 内容 */
  html: string
  /** 存储时间 */
  createdAt: number
}

class ReportStore {
  private db: IDBPDatabase | null = null

  private async getDB(): Promise<IDBPDatabase> {
    if (this.db) return this.db

    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('createdAt', 'createdAt')
        }
      }
    })

    return this.db
  }

  /** 存储报告 HTML，以消息 ID 为 key */
  async saveReport(messageId: string, html: string): Promise<void> {
    const db = await this.getDB()
    const record: ReportRecord = {
      id: messageId,
      html,
      createdAt: Date.now()
    }
    await db.put(STORE_NAME, record)
  }

  /** 根据消息 ID 获取报告 HTML */
  async getReport(messageId: string): Promise<string | null> {
    const db = await this.getDB()
    const record = await db.get(STORE_NAME, messageId)
    return record?.html ?? null
  }

  /** 检查报告是否存在 */
  async hasReport(messageId: string): Promise<boolean> {
    const db = await this.getDB()
    const key = await db.getKey(STORE_NAME, messageId)
    return key !== undefined
  }

  /** 删除指定报告 */
  async deleteReport(messageId: string): Promise<void> {
    const db = await this.getDB()
    await db.delete(STORE_NAME, messageId)
  }

  /** 批量删除报告 */
  async deleteReports(messageIds: string[]): Promise<void> {
    const db = await this.getDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    await Promise.all([
      ...messageIds.map((id) => store.delete(id)),
      tx.done
    ])
  }

  /** 清除所有报告 */
  async clearAll(): Promise<void> {
    const db = await this.getDB()
    await db.clear(STORE_NAME)
  }
}

export const reportStore = new ReportStore()
