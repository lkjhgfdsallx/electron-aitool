import { contextBridge, ipcRenderer } from 'electron'

// 定义暴露给渲染进程的 API
export interface ElectronAPI {
  // MCP 代理
  mcp: {
    fetchTools: (serverUrl: string) => Promise<{ success: boolean; data?: unknown[]; error?: string }>
    callTool: (
      serverUrl: string,
      toolName: string,
      args: Record<string, unknown>
    ) => Promise<{ success: boolean; data?: unknown; error?: string }>
  }
  // 标题生成（TextRank + jieba 分词）
  title: {
    generate: (content: string) => Promise<string>
  }
  // 窗口控制
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
  }
}

const electronAPI: ElectronAPI = {
  mcp: {
    fetchTools: (serverUrl: string) => ipcRenderer.invoke('mcp:fetchTools', serverUrl),
    callTool: (serverUrl: string, toolName: string, args: Record<string, unknown>) =>
      ipcRenderer.invoke('mcp:callTool', serverUrl, toolName, args)
  },
  title: {
    generate: (content: string) => ipcRenderer.invoke('title:generate', content)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized')
  }
}

// 通过 contextBridge 安全地暴露 API
contextBridge.exposeInMainWorld('electronAPI', electronAPI)
