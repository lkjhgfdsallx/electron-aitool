import { contextBridge, ipcRenderer, webUtils } from 'electron'

// 定义暴露给渲染进程的 API
export interface ElectronAPI {
  // MCP 代理
  mcp: {
    fetchTools: (serverConfig: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown[]; error?: string }>
    callTool: (
      serverId: string,
      toolName: string,
      args: Record<string, unknown>
    ) => Promise<{ success: boolean; data?: unknown; error?: string }>
    stopServer: (serverId: string) => Promise<{ success: boolean }>
  }
  // 标题生成（TextRank + jieba 分词）
  title: {
    generate: (content: string) => Promise<string>
  }
  // 文件操作
  file: {
    /**
     * 获取 File 对象的文件系统路径（仅 Electron 环境可用）
     */
    getPathForFile: (file: File) => string
    /**
     * 在主进程中提取 PDF 文本（Node.js 环境，更可靠）
     * @returns { success: boolean; text?: string; error?: string }
     */
    extractPdfText: (filePath: string) => Promise<{ success: boolean; text?: string; error?: string }>
    /**
     * 打开保存文件对话框并保存内容
     * @returns { success: boolean; filePath?: string; error?: string }
     */
    saveFile: (defaultName: string, content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
  }
  // 窗口控制
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
  }
  // 网站分析器
  siteAnalyzer: {
    /**
     * 启动网站分析任务
     */
    start: (config: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; error?: string }>
    /**
     * 取消分析任务
     */
    cancel: (taskId: string) => Promise<{ success: boolean }>
    /**
     * 获取活跃任务列表
     */
    getActiveTasks: () => Promise<{ success: boolean; data?: string[] }>
    /**
     * 监听分析进度
     */
    onProgress: (callback: (progress: unknown) => void) => () => void
  }
}

const electronAPI: ElectronAPI = {
  mcp: {
    fetchTools: (serverConfig: Record<string, unknown>) =>
      ipcRenderer.invoke('mcp:fetchTools', serverConfig),
    callTool: (serverId: string, toolName: string, args: Record<string, unknown>) =>
      ipcRenderer.invoke('mcp:callTool', serverId, toolName, args),
    stopServer: (serverId: string) => ipcRenderer.invoke('mcp:stopServer', serverId)
  },
  title: {
    generate: (content: string) => ipcRenderer.invoke('title:generate', content)
  },
  file: {
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    extractPdfText: (filePath: string) => ipcRenderer.invoke('file:extractPdfText', filePath),
    saveFile: (defaultName: string, content: string) => ipcRenderer.invoke('file:saveFile', defaultName, content)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized')
  },
  siteAnalyzer: {
    start: (config: Record<string, unknown>) =>
      ipcRenderer.invoke('siteAnalyzer:start', config),
    cancel: (taskId: string) =>
      ipcRenderer.invoke('siteAnalyzer:cancel', taskId),
    getActiveTasks: () =>
      ipcRenderer.invoke('siteAnalyzer:getActiveTasks'),
    onProgress: (callback: (progress: unknown) => void) => {
      const handler = (_event: unknown, progress: unknown) => callback(progress)
      ipcRenderer.on('siteAnalyzer:progress', handler)
      return () => {
        ipcRenderer.removeListener('siteAnalyzer:progress', handler)
      }
    }
  }
}

// 通过 contextBridge 安全地暴露 API
contextBridge.exposeInMainWorld('electronAPI', electronAPI)
