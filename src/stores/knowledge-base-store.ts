import { create } from 'zustand'
import type {
  KnowledgeBaseFile,
  KnowledgeBaseChunk,
  FileTypeCategory,
  KBPageViewMode,
  SearchMode,
  KBSearchResult,
  SimulatorResult,
  SearchResult
} from '../types'
import { FILE_TYPE_CATEGORIES } from '../types'
import { dbService } from '../services/db-service'

// ==================== 辅助函数 ====================

/** 根据文件扩展名获取分类 */
function getFileCategory(file: KnowledgeBaseFile): FileTypeCategory {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  for (const cat of FILE_TYPE_CATEGORIES) {
    if (cat.key === 'all' || cat.key === 'other') continue
    if (cat.extensions.includes(ext)) return cat.key
  }
  return 'other'
}

/** 高亮关键字 */
function highlightText(text: string, query: string): string {
  if (!query.trim()) return text.slice(0, 200)
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  // 截取匹配位置周围的文本
  const match = regex.exec(text)
  if (match) {
    const start = Math.max(0, match.index - 60)
    const end = Math.min(text.length, match.index + query.length + 60)
    let snippet = text.slice(start, end)
    if (start > 0) snippet = '...' + snippet
    if (end < text.length) snippet = snippet + '...'
    return snippet.replace(regex, '<mark>$1</mark>')
  }
  return text.slice(0, 120)
}

// ==================== Store 定义 ====================

interface KnowledgeBaseStore {
  // ===== 文件列表 =====
  files: KnowledgeBaseFile[]
  isLoading: boolean
  /** 当前活跃的集合 ID（null 表示查看全部） */
  activeCollectionId: string | null

  // ===== 文件管理页面状态 =====
  selectedFileId: string | null
  activeFilter: FileTypeCategory
  searchQuery: string
  pageViewMode: KBPageViewMode

  // ===== 选中文件的分块缓存 =====
  selectedFileChunks: KnowledgeBaseChunk[]
  isLoadingChunks: boolean

  // ===== 搜索状态 =====
  searchMode: SearchMode
  searchResults: KBSearchResult[]
  isSearching: boolean

  // ===== 模拟器状态 =====
  simulatorResult: SimulatorResult | null
  isSimulating: boolean

  // ===== Actions: 文件管理 =====
  loadFiles: (collectionId?: string) => Promise<void>
  setActiveCollectionId: (id: string | null) => void
  addFile: (file: KnowledgeBaseFile) => void
  updateFile: (id: string, updates: Partial<KnowledgeBaseFile>) => void
  deleteFile: (id: string) => Promise<void>
  getFile: (id: string) => KnowledgeBaseFile | undefined
  /** 移动文件到另一个集合（更新 collectionId） */
  moveFile: (fileId: string, targetCollectionId: string) => Promise<void>
  /** 复制文件到另一个集合（创建新文件 + 新 chunks） */
  copyFile: (fileId: string, targetCollectionId: string) => Promise<void>

  // ===== Actions: 页面状态 =====
  setSelectedFileId: (id: string | null) => void
  setActiveFilter: (filter: FileTypeCategory) => void
  setSearchQuery: (query: string) => void
  setPageViewMode: (mode: KBPageViewMode) => void

  // ===== Actions: 文件分块 =====
  loadFileChunks: (fileId: string) => Promise<void>

  // ===== Actions: 搜索 =====
  setSearchMode: (mode: SearchMode) => void
  performSearch: (query: string, mode: SearchMode) => Promise<void>

  // ===== Actions: 模拟器 =====
  performSimulatorQuery: (query: string, topK: number, threshold: number, mode?: SearchMode) => Promise<void>
  clearSimulatorResult: () => void

  // ===== Actions: URL 导入 =====
  importUrl: (url: string, collectionId?: string) => Promise<KnowledgeBaseFile>

  // ===== 计算属性 =====
  getFilteredFiles: () => KnowledgeBaseFile[]
  getCategoryCounts: () => Record<FileTypeCategory, number>
}

export const useKnowledgeBaseStore = create<KnowledgeBaseStore>()((set, get) => ({
  // ===== 初始状态 =====
  files: [],
  isLoading: false,
  activeCollectionId: null,
  selectedFileId: null,
  activeFilter: 'all',
  searchQuery: '',
  pageViewMode: 'files',
  selectedFileChunks: [],
  isLoadingChunks: false,
  searchMode: 'hybrid',
  searchResults: [],
  isSearching: false,
  simulatorResult: null,
  isSimulating: false,

  // ===== 文件管理 =====
  loadFiles: async (collectionId?: string) => {
    set({ isLoading: true })
    try {
      const cid = collectionId ?? get().activeCollectionId
      let files: KnowledgeBaseFile[]
      if (cid) {
        files = await dbService.getFileMetadataByCollection(cid)
      } else {
        files = await dbService.getAllFileMetadata()
      }
      set({ files, isLoading: false })
    } catch (error) {
      console.error('Failed to load knowledge base files:', error)
      set({ isLoading: false })
    }
  },

  setActiveCollectionId: (id) => {
    set({ activeCollectionId: id })
    // 切换集合时自动重新加载文件
    get().loadFiles(id ?? undefined)
  },

  addFile: (file) => {
    set((state) => ({ files: [...state.files, file] }))
  },

  updateFile: (id, updates) => {
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, ...updates } : f))
    }))
  },

  deleteFile: async (id) => {
    try {
      await dbService.deleteFileData(id)
      set((state) => ({
        files: state.files.filter((f) => f.id !== id),
        selectedFileId: state.selectedFileId === id ? null : state.selectedFileId,
        selectedFileChunks: state.selectedFileId === id ? [] : state.selectedFileChunks
      }))
    } catch (error) {
      console.error('Failed to delete knowledge base file:', error)
    }
  },

  getFile: (id) => get().files.find((f) => f.id === id),

  moveFile: async (fileId, targetCollectionId) => {
    try {
      const { knowledgeBaseService } = await import('../services/knowledge-base-service')
      await knowledgeBaseService.moveFile(fileId, targetCollectionId)
      // 更新本地状态：如果当前在查看全部或目标集合，刷新列表
      const { activeCollectionId } = get()
      if (activeCollectionId === null || activeCollectionId === targetCollectionId) {
        await get().loadFiles()
      } else {
        // 文件已移走，从当前列表中移除
        set((state) => ({
          files: state.files.filter((f) => f.id !== fileId),
          selectedFileId: state.selectedFileId === fileId ? null : state.selectedFileId,
          selectedFileChunks: state.selectedFileId === fileId ? [] : state.selectedFileChunks
        }))
      }
    } catch (error) {
      console.error('Failed to move file:', error)
      throw error
    }
  },

  copyFile: async (fileId, targetCollectionId) => {
    try {
      const { knowledgeBaseService } = await import('../services/knowledge-base-service')
      const newFile = await knowledgeBaseService.copyFile(fileId, targetCollectionId)
      // 如果当前在查看目标集合或全部，将新文件加入列表
      const { activeCollectionId } = get()
      if (activeCollectionId === null || activeCollectionId === targetCollectionId) {
        set((state) => ({ files: [...state.files, newFile] }))
      }
    } catch (error) {
      console.error('Failed to copy file:', error)
      throw error
    }
  },

  // ===== 页面状态 =====
  setSelectedFileId: (id) => {
    set({ selectedFileId: id, pageViewMode: 'files' })
    if (id) {
      get().loadFileChunks(id)
    } else {
      set({ selectedFileChunks: [] })
    }
  },

  setActiveFilter: (filter) => set({ activeFilter: filter }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setPageViewMode: (mode) => set({ pageViewMode: mode }),

  // ===== 文件分块 =====
  loadFileChunks: async (fileId: string) => {
    set({ isLoadingChunks: true })
    try {
      const chunks = await dbService.getChunksByFileId(fileId)
      set({ selectedFileChunks: chunks, isLoadingChunks: false })
    } catch (error) {
      console.error('Failed to load file chunks:', error)
      set({ isLoadingChunks: false })
    }
  },

  // ===== 搜索 =====
  setSearchMode: (mode) => set({ searchMode: mode }),

  performSearch: async (query: string, mode: SearchMode) => {
    if (!query.trim()) {
      set({ searchResults: [], pageViewMode: 'files' })
      return
    }

    set({ isSearching: true, pageViewMode: 'search' })

    try {
      const { knowledgeBaseService } = await import('../services/knowledge-base-service')
      const { useSettingsStore } = await import('./settings-store')
      const retrievalConfig = useSettingsStore.getState().retrievalConfig

      const searchResults: SearchResult[] = await knowledgeBaseService.search(
        query,
        retrievalConfig.topK,
        retrievalConfig.similarityThreshold,
        undefined,
        mode
      )

      const results: KBSearchResult[] = searchResults.map((r) => ({
        chunk: r.chunk,
        score: r.score,
        fileName: r.fileName,
        fileId: r.chunk.fileId,
        highlight: highlightText(r.chunk.content, query)
      }))

      set({ searchResults: results, isSearching: false })
    } catch (error) {
      console.error('Search failed:', error)
      set({ searchResults: [], isSearching: false })
    }
  },

  // ===== 模拟器 =====
  performSimulatorQuery: async (query: string, topK: number, threshold: number, mode?: SearchMode) => {
    if (!query.trim()) return

    set({ isSimulating: true })

    try {
      const { knowledgeBaseService } = await import('../services/knowledge-base-service')
      const { embeddingService } = await import('../services/embedding-service')
      const allChunks = await dbService.getAllChunks()

      const startTime = performance.now()
      const results = await knowledgeBaseService.search(query, topK, threshold, undefined, mode ?? 'hybrid')
      const queryTime = performance.now() - startTime

      const status = embeddingService.getStatus()

      set({
        simulatorResult: {
          results,
          queryTime,
          engineType: status.mode,
          dimension: status.semanticDimension ?? 512,
          totalChunks: allChunks.length
        },
        isSimulating: false
      })
    } catch (error) {
      console.error('Simulator query failed:', error)
      set({ isSimulating: false })
    }
  },

  clearSimulatorResult: () => set({ simulatorResult: null }),

  // ===== URL 导入 =====
  importUrl: async (url: string, collectionId?: string) => {
    const { knowledgeBaseService } = await import('../services/knowledge-base-service')
    const metadata = await knowledgeBaseService.importFromUrl(url, undefined, collectionId)
    // 导入成功后刷新文件列表
    if (metadata.status === 'ready') {
      await get().loadFiles()
    }
    return metadata
  },

  // ===== 计算属性 =====
  getFilteredFiles: () => {
    const { files, activeFilter, searchQuery } = get()
    let filtered = files

    // 按类型过滤
    if (activeFilter !== 'all') {
      filtered = filtered.filter((f) => getFileCategory(f) === activeFilter)
    }

    // 按搜索关键字过滤文件名
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase()
      filtered = filtered.filter((f) => f.name.toLowerCase().includes(lowerQuery))
    }

    return filtered
  },

  getCategoryCounts: () => {
    const { files } = get()
    const counts: Record<FileTypeCategory, number> = {
      all: files.length,
      document: 0,
      pdf: 0,
      data: 0,
      code: 0,
      web: 0,
      other: 0
    }
    for (const file of files) {
      const cat = getFileCategory(file)
      counts[cat]++
    }
    return counts
  }
}))
