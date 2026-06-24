import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { KnowledgeCollection, KnowledgeCollectionCreateInput } from '../types'
import { dbService, DEFAULT_COLLECTION_ID } from '../services/db-service'

// ==================== 默认集合 ====================

const DEFAULT_COLLECTION: KnowledgeCollection = {
  id: DEFAULT_COLLECTION_ID,
  name: '默认知识库',
  description: '系统默认知识库集合',
  icon: '📚',
  isDefault: true,
  createdAt: Date.now(),
  updatedAt: Date.now()
}

// ==================== Store 定义 ====================

interface KnowledgeCollectionStore {
  collections: KnowledgeCollection[]
  activeCollectionId: string | null  // 当前选中集合（null 表示查看全部）
  isLoading: boolean

  // Actions
  loadCollections: () => Promise<void>
  createCollection: (input: KnowledgeCollectionCreateInput) => Promise<KnowledgeCollection>
  updateCollection: (id: string, updates: Partial<Pick<KnowledgeCollection, 'name' | 'description' | 'icon'>>) => Promise<void>
  deleteCollection: (id: string) => Promise<void>
  setActiveCollection: (id: string | null) => void
  getDefaultCollection: () => KnowledgeCollection | undefined
  getCollection: (id: string) => KnowledgeCollection | undefined
  getCollectionFileCount: (id: string) => Promise<number>
}

export const useKnowledgeCollectionStore = create<KnowledgeCollectionStore>()((set, get) => ({
  collections: [],
  activeCollectionId: null,
  isLoading: false,

  /**
   * 加载所有集合
   * 如果数据库为空，自动创建默认集合
   */
  loadCollections: async () => {
    set({ isLoading: true })
    try {
      let collections = await dbService.getAllCollections()

      // 如果没有集合，创建默认集合
      if (collections.length === 0) {
        await dbService.saveCollection(DEFAULT_COLLECTION)
        collections = [DEFAULT_COLLECTION]
      }

      // 确保默认集合排在最前面
      collections.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1
        if (!a.isDefault && b.isDefault) return 1
        return b.createdAt - a.createdAt
      })

      set({ collections, isLoading: false })
    } catch (error) {
      console.error('Failed to load knowledge collections:', error)
      set({ isLoading: false })
    }
  },

  createCollection: async (input) => {
    const collection: KnowledgeCollection = {
      id: uuidv4(),
      name: input.name,
      description: input.description,
      icon: input.icon,
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    await dbService.saveCollection(collection)
    set((state) => ({
      collections: [...state.collections, collection]
    }))

    return collection
  },

  updateCollection: async (id, updates) => {
    const existing = get().collections.find((c) => c.id === id)
    if (!existing) return

    const updated: KnowledgeCollection = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    }

    await dbService.saveCollection(updated)
    set((state) => ({
      collections: state.collections.map((c) => (c.id === id ? updated : c))
    }))
  },

  deleteCollection: async (id) => {
    const collection = get().collections.find((c) => c.id === id)
    if (!collection || collection.isDefault) {
      throw new Error('不能删除默认知识库集合')
    }

    await dbService.deleteCollection(id)
    set((state) => ({
      collections: state.collections.filter((c) => c.id !== id),
      activeCollectionId: state.activeCollectionId === id ? null : state.activeCollectionId
    }))
  },

  setActiveCollection: (id) => {
    set({ activeCollectionId: id })
  },

  getDefaultCollection: () => {
    return get().collections.find((c) => c.isDefault)
  },

  getCollection: (id) => {
    return get().collections.find((c) => c.id === id)
  },

  /**
   * 获取指定集合的文件数量
   */
  getCollectionFileCount: async (id) => {
    try {
      const files = await dbService.getFileMetadataByCollection(id)
      return files.length
    } catch {
      return 0
    }
  }
}))
