/**
 * 对话消息 IndexedDB 存储服务
 *
 * 核心动机：将消息从 localStorage 全量 JSON 序列化迁移到 IndexedDB 逐条存储，
 * 解决"修改一条消息 → 重写 5-10MB JSON"的架构浪费问题。
 *
 * 设计原则：
 * - Conversation 元数据仍存 localStorage（Zustand persist，体积小）
 * - Message 逐条存 IndexedDB（修改只更新单条，~0.5KB vs ~5-10MB）
 * - 内存中仅保留活跃对话的消息（惰性加载，非活跃对话从 IDB 按需读取）
 *
 * 独立数据库：与 KnowledgeBase IDB 分离，避免版本冲突和升级风险
 */
import { openDB, type IDBPDatabase } from 'idb'
import type { Message } from '../types'

const DB_NAME = 'ConversationData'
const DB_VERSION = 1

const STORES = {
  MESSAGES: 'messages',
} as const

class ConversationDBService {
  private db: IDBPDatabase | null = null

  async getDB(): Promise<IDBPDatabase> {
    if (this.db) return this.db

    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // v1: 初始 schema - 消息逐条存储
        const messageStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' })
        // 按对话 ID 查询：切换对话时快速加载该对话全部消息
        messageStore.createIndex('conversationId', 'conversationId')
        // 按时间排序：消息列表有序输出
        messageStore.createIndex('timestamp', 'timestamp')
        // 复合索引：按对话+时间高效查询（避免先过滤再排序）
        messageStore.createIndex('convTimestamp', ['conversationId', 'timestamp'])
      }
    })

    return this.db
  }

  // ==================== 单条消息操作 ====================

  /** 保存/更新单条消息（核心写入路径，流式输出时每条消息独立更新） */
  async saveMessage(message: Message): Promise<void> {
    const db = await this.getDB()
    await db.put(STORES.MESSAGES, message)
  }

  /** 获取单条消息 */
  async getMessage(id: string): Promise<Message | undefined> {
    const db = await this.getDB()
    return db.get(STORES.MESSAGES, id)
  }

  /** 删除单条消息 */
  async deleteMessage(id: string): Promise<void> {
    const db = await this.getDB()
    await db.delete(STORES.MESSAGES, id)
  }

  // ==================== 批量消息操作 ====================

  /** 批量保存消息（迁移时使用，单事务写入提升性能） */
  async saveMessages(messages: Message[]): Promise<void> {
    if (messages.length === 0) return
    const db = await this.getDB()
    const tx = db.transaction(STORES.MESSAGES, 'readwrite')
    const store = tx.objectStore(STORES.MESSAGES)
    for (const msg of messages) {
      await store.put(msg)
    }
    await tx.done
  }

  /**
   * 获取指定对话的全部消息（按时间排序）
   * 使用复合索引 convTimestamp 实现 O(log n) 范围查询
   */
  async getMessagesByConversationId(conversationId: string): Promise<Message[]> {
    const db = await this.getDB()
    const index = db.transaction(STORES.MESSAGES).objectStore(STORES.MESSAGES).index('convTimestamp')
    return index.getAll(IDBKeyRange.bound(
      [conversationId, 0],
      [conversationId, Infinity]
    ))
  }

  /**
   * 删除指定对话的全部消息
   * 使用 conversationId 索引游标逐条删除（IDB 不支持按索引范围批量删除）
   */
  async deleteMessagesByConversationId(conversationId: string): Promise<void> {
    const db = await this.getDB()
    const tx = db.transaction(STORES.MESSAGES, 'readwrite')
    const store = tx.objectStore(STORES.MESSAGES)
    const index = store.index('conversationId')
    let cursor = await index.openCursor(IDBKeyRange.only(conversationId))
    while (cursor) {
      await cursor.delete()
      cursor = await cursor.continue()
    }
    await tx.done
  }

  // ==================== 迁移辅助操作 ====================

  /** 获取全部消息（用于 localStorage → IDB 迁移） */
  async getAllMessages(): Promise<Message[]> {
    const db = await this.getDB()
    return db.getAll(STORES.MESSAGES)
  }

  /** 获取全部对话 ID 列表（用于验证迁移完整性） */
  async getAllConversationIds(): Promise<string[]> {
    const db = await this.getDB()
    const index = db.transaction(STORES.MESSAGES).objectStore(STORES.MESSAGES).index('conversationId')
    const keys = await index.getAllKeys()
    // 去重：同一对话的多条消息会产生重复 key
    return [...new Set(keys as string[])]
  }

  /** 清空全部消息（用于隐私清除或测试） */
  async clearAllMessages(): Promise<void> {
    const db = await this.getDB()
    const tx = db.transaction(STORES.MESSAGES, 'readwrite')
    await tx.objectStore(STORES.MESSAGES).clear()
    await tx.done
  }

  /** 统计消息总数（用于调试和迁移验证） */
  async getMessageCount(): Promise<number> {
    const db = await this.getDB()
    return db.count(STORES.MESSAGES)
  }

  /** 统计指定对话的消息数 */
  async getMessageCountByConversationId(conversationId: string): Promise<number> {
    const db = await this.getDB()
    const index = db.transaction(STORES.MESSAGES).objectStore(STORES.MESSAGES).index('conversationId')
    return index.count(IDBKeyRange.only(conversationId))
  }
}

export const conversationDb = new ConversationDBService()
