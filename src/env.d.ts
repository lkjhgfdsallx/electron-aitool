/// <reference types="vite/client" />

declare module '*.css' {}
declare module '*.scss' {}
declare module '*.less' {}
declare module '@fontsource-variable/inter' {}
declare module '@fontsource-variable/jetbrains-mono' {}

// File System Access API 类型声明（Chromium 内核支持）
interface Window {
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>
  // Electron preload 暴露的 API（可选，浏览器环境不可用）
  // 详细类型定义见 src/types/electron.d.ts，此处为 jest/非 Electron 环境兜底
  electronAPI?: any
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
  keys(): AsyncIterableIterator<string>
  values(): AsyncIterableIterator<FileSystemHandle>
}

interface FileSystemFileHandle extends FileSystemHandle {
  getFile(): Promise<File>
  createWritable(): Promise<FileSystemWritableFileStream>
}

interface FileSystemHandle {
  kind: 'file' | 'directory'
  name: string
}
