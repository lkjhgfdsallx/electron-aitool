import { create } from 'zustand'
import type { KnowledgeBaseFile } from '../types'
import { dbService } from '../services/db-service'

interface KnowledgeBaseStore {
  files: KnowledgeBaseFile[]
  isLoading: boolean

  // Actions
  loadFiles: () => Promise<void>
  addFile: (file: KnowledgeBaseFile) => void
  updateFile: (id: string, updates: Partial<KnowledgeBaseFile>) => void
  deleteFile: (id: string) => Promise<void>
  getFile: (id: string) => KnowledgeBaseFile | undefined
}

export const useKnowledgeBaseStore = create<KnowledgeBaseStore>()((set, get) => ({
  files: [],
  isLoading: false,

  loadFiles: async () => {
    set({ isLoading: true })
    try {
      const files = await dbService.getAllFileMetadata()
      set({ files, isLoading: false })
    } catch (error) {
      console.error('Failed to load knowledge base files:', error)
      set({ isLoading: false })
    }
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
      set((state) => ({ files: state.files.filter((f) => f.id !== id) }))
    } catch (error) {
      console.error('Failed to delete knowledge base file:', error)
    }
  },

  getFile: (id) => get().files.find((f) => f.id === id)
}))
