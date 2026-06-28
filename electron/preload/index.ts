import { contextBridge, ipcRenderer, webUtils } from 'electron'

// 搜索结果类型
export interface SearchResult {
  title: string
  snippet: string
  url: string
}

// 定义暴露给渲染进程的 API
export interface ElectronAPI {
  // 网页搜索
  web: {
    search: (query: string, maxResults?: number) => Promise<{ success: boolean; results?: SearchResult[]; error?: string }>
    fetchWebpage: (url: string, maxLength?: number) => Promise<{ success: boolean; content?: string; error?: string }>
  }
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
     */
    extractPdfText: (filePath: string) => Promise<{ success: boolean; text?: string; error?: string }>
    /**
     * 在主进程中提取文件文本内容（支持 PDF/DOCX/HTML/源码/日志等多种格式）
     */
    extractText: (filePath: string) => Promise<{ success: boolean; text?: string; error?: string }>
    /**
     * 打开保存文件对话框并保存文本内容
     */
    saveFile: (defaultName: string, content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
    /**
     * 保存二进制文件（如 zip 备份文件）
     * @param defaultName 默认文件名
     * @param data 文件二进制数据（number 数组）
     */
    saveZip: (defaultName: string, data: number[]) => Promise<{ success: boolean; filePath?: string; error?: string }>
    /**
     * 打开文件选择对话框并读取文件为 number 数组
     * @returns { success: boolean; data?: number[]; filePath?: string; error?: string }
     */
    openFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<{ success: boolean; data?: number[]; filePath?: string; error?: string }>
  }
  // 窗口控制
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
  }
  // 快捷键
  shortcuts: {
    /**
     * 注册全局快捷键
     * @param accelerator Electron 加速器字符串，如 'Ctrl+N'
     * @param id 快捷键唯一标识
     * @returns 是否注册成功
     */
    register: (id: string, accelerator: string) => Promise<{ success: boolean; error?: string }>
    /**
     * 注销快捷键
     */
    unregister: (id: string) => Promise<{ success: boolean }>
    /**
     * 监听快捷键触发
     */
    onTriggered: (callback: (id: string) => void) => () => void
  }
  // 通知
  notification: {
    /**
     * 显示系统通知
     */
    show: (title: string, body: string) => Promise<{ success: boolean }>
    /**
     * 播放提示音
     */
    playSound: (soundName: string) => Promise<{ success: boolean }>
  }
  // 模型文件下载（通过 Node.js 绕过浏览器 CORS 限制）
  model: {
    /**
     * 通过 Node.js 下载模型文件（无 CORS 限制）
     * @param urls 要下载的文件 URL 列表
     * @returns 每个文件的字节数组
     */
    downloadFiles: (urls: string[]) => Promise<Array<{ url: string; data: number[] }>>
  }
  // 自定义工具沙箱执行
  customTool: {
    /**
     * 在主进程沙箱中执行自定义 JS 函数
     * @param code JS 函数体，格式: async (params) => { ... }
     * @param args 传入的参数对象
     * @param timeout 超时时间（毫秒），默认 5000
     * @returns 执行结果
     */
    execute: (
      code: string,
      args: Record<string, unknown>,
      timeout?: number
    ) => Promise<{ success: boolean; data?: string; error?: string; durationMs?: number }>
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
  // 工作区
  workspace: {
    /** 文件系统操作 */
    fs: {
      /** 读取目录内容（文件树浏览） */
      readDir: (dirPath: string) => Promise<{
        success: boolean
        entries?: Array<{ name: string; path: string; isDirectory: boolean; size: number; ext: string }>
        error?: string
      }>
      /** 读取文件文本内容（文件预览，大文件自动截断） */
      readFile: (filePath: string, maxBytes?: number) => Promise<{
        success: boolean
        content?: string
        truncated?: boolean
        totalSize?: number
        error?: string
      }>
      /** 写入文件内容（创建或覆盖） */
      writeFile: (filePath: string, content: string) => Promise<{
        success: boolean
        error?: string
      }>
      /** 创建目录（递归） */
      createDir: (dirPath: string) => Promise<{
        success: boolean
        error?: string
      }>
      /** 删除文件 */
      deleteFile: (filePath: string) => Promise<{
        success: boolean
        error?: string
      }>
    }
    /** 版本控制（VCS）相关操作 */
    vcs: {
      /** 初始化 .ai-workspace-vcs 目录结构 */
      init: (folderPath: string) => Promise<{ success: boolean; error?: string }>
      /** 创建存档点 */
      createCheckpoint: (params: {
        folderPath: string
        checkpointId: string
        description: string
        type: string
        workspaceId: string
        conversationId?: string
        filePaths?: string[]
      }) => Promise<{ success: boolean; checkpointId?: string; error?: string }>
      /** 列出存档点索引 */
      listCheckpoints: (folderPath: string) => Promise<{ success: boolean; checkpoints?: unknown[]; error?: string }>
      /** 获取存档点详情 */
      getCheckpointDetail: (folderPath: string, checkpointId: string) => Promise<{ success: boolean; detail?: unknown; error?: string }>
      /** 还原到指定存档点 */
      restoreCheckpoint: (folderPath: string, checkpointId: string) => Promise<{ success: boolean; error?: string }>
      /** 保存压缩前的消息历史快照 */
      saveMessages: (folderPath: string, checkpointId: string, messages: unknown[]) => Promise<{ success: boolean; error?: string }>
      /** 加载压缩前的消息历史快照 */
      loadMessages: (folderPath: string, checkpointId: string) => Promise<{ success: boolean; messages?: unknown[]; error?: string }>
      /** 清理超出限制的旧存档点 */
      cleanup: (folderPath: string, maxCheckpoints: number) => Promise<{ success: boolean; removed?: number; error?: string }>
      /** 保存工作区会话（消息 + 终端历史） */
      saveSession: (folderPath: string, sessionData: unknown) => Promise<{ success: boolean; error?: string }>
      /** 加载工作区会话（消息 + 终端历史） */
      loadSession: (folderPath: string) => Promise<{ success: boolean; session?: unknown; error?: string }>
      /** 加载工作区 Agent 列表 */
      loadAgents: (folderPath: string) => Promise<{ success: boolean; agents?: unknown[]; error?: string }>
      /** 保存工作区 Agent 列表（全量覆盖） */
      saveAgents: (folderPath: string, agents: unknown[]) => Promise<{ success: boolean; error?: string }>
      /** 添加单个工作区 Agent */
      addAgent: (folderPath: string, agent: unknown) => Promise<{ success: boolean; error?: string }>
      /** 更新单个工作区 Agent */
      updateAgent: (folderPath: string, agent: unknown) => Promise<{ success: boolean; error?: string }>
      /** 删除单个工作区 Agent */
      deleteAgent: (folderPath: string, agentId: string) => Promise<{ success: boolean; error?: string }>
    }
    /** 文件监控 */
    watcher: {
      /** 开始监控工作区目录文件变更 */
      start: (folderPath: string) => Promise<{ success: boolean; error?: string }>
      /** 停止监控 */
      stop: (folderPath: string) => Promise<{ success: boolean; error?: string }>
      /** 查询监控状态 */
      status: (folderPath: string) => Promise<{ active: boolean; watching: boolean }>
      /** 监听文件变更事件 */
      onChange: (callback: (data: { folderPath: string; events: unknown[]; timestamp: number }) => void) => () => void
    }
    /** 命令执行 */
    command: {
      /** 执行 shell 命令 */
      execute: (params: {
        commandId: string
        command: string
        workingDir: string
        timeoutMs?: number
        env?: Record<string, string>
      }) => Promise<{ success: boolean; exitCode: number | null; stdout: string; stderr: string; error?: string; durationMs: number }>
      /** 中止正在执行的命令 */
      abort: (commandId: string) => Promise<{ success: boolean; error?: string }>
      /** 获取正在执行的命令列表 */
      running: () => Promise<Array<{ commandId: string; startTime: number; runningTime: number }>>
      /** 评估命令风险等级 */
      assessRisk: (command: string) => Promise<'safe' | 'medium' | 'high' | 'critical'>
      /** 监听命令实时输出 */
      onOutput: (callback: (data: { commandId: string; stream: string; chunk: string; timestamp: number }) => void) => () => void
      /** 监听命令完成事件 */
      onComplete: (callback: (data: { commandId: string; exitCode: number | null; killed: boolean; timestamp: number }) => void) => () => void
    }
    /** 选择文件夹对话框 */
    selectFolder: () => Promise<{ success: boolean; folderPath?: string; canceled?: boolean; error?: string }>
  }
}

const electronAPI: ElectronAPI = {
  web: {
    search: (query: string, maxResults?: number) =>
      ipcRenderer.invoke('web:search', query, maxResults),
    fetchWebpage: (url: string, maxLength?: number) =>
      ipcRenderer.invoke('web:fetchWebpage', url, maxLength)
  },
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
    extractText: (filePath: string) => ipcRenderer.invoke('file:extractText', filePath),
    saveFile: (defaultName: string, content: string) => ipcRenderer.invoke('file:saveFile', defaultName, content),
    saveZip: (defaultName: string, data: number[]) => ipcRenderer.invoke('file:saveZip', defaultName, data),
    openFile: (filters?: Array<{ name: string; extensions: string[] }>) => ipcRenderer.invoke('file:openFile', filters)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized')
  },
  model: {
    downloadFiles: (urls: string[]) =>
      ipcRenderer.invoke('model:downloadFiles', urls)
  },
  customTool: {
    execute: (code: string, args: Record<string, unknown>, timeout?: number) =>
      ipcRenderer.invoke('custom-tool:execute', code, args, timeout)
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
  },
  shortcuts: {
    register: (id: string, accelerator: string) =>
      ipcRenderer.invoke('shortcuts:register', id, accelerator),
    unregister: (id: string) =>
      ipcRenderer.invoke('shortcuts:unregister', id),
    onTriggered: (callback: (id: string) => void) => {
      const handler = (_event: unknown, id: string) => callback(id)
      ipcRenderer.on('shortcuts:triggered', handler)
      return () => {
        ipcRenderer.removeListener('shortcuts:triggered', handler)
      }
    }
  },
  notification: {
    show: (title: string, body: string) =>
      ipcRenderer.invoke('notification:show', title, body),
    playSound: (soundName: string) =>
      ipcRenderer.invoke('notification:playSound', soundName)
  },
  workspace: {
    fs: {
      readDir: (dirPath: string) =>
        ipcRenderer.invoke('workspace:fs:readDir', dirPath),
      readFile: (filePath: string, maxBytes?: number) =>
        ipcRenderer.invoke('workspace:fs:readFile', filePath, maxBytes),
      writeFile: (filePath: string, content: string) =>
        ipcRenderer.invoke('workspace:fs:writeFile', filePath, content),
      createDir: (dirPath: string) =>
        ipcRenderer.invoke('workspace:fs:createDir', dirPath),
      deleteFile: (filePath: string) =>
        ipcRenderer.invoke('workspace:fs:deleteFile', filePath),
    },
    vcs: {
      init: (folderPath: string) =>
        ipcRenderer.invoke('workspace:vcs:init', folderPath),
      createCheckpoint: (params) =>
        ipcRenderer.invoke('workspace:vcs:create-checkpoint', params),
      listCheckpoints: (folderPath: string) =>
        ipcRenderer.invoke('workspace:vcs:list-checkpoints', folderPath),
      getCheckpointDetail: (folderPath: string, checkpointId: string) =>
        ipcRenderer.invoke('workspace:vcs:get-checkpoint-detail', folderPath, checkpointId),
      restoreCheckpoint: (folderPath: string, checkpointId: string) =>
        ipcRenderer.invoke('workspace:vcs:restore-checkpoint', folderPath, checkpointId),
      saveMessages: (folderPath: string, checkpointId: string, messages: unknown[]) =>
        ipcRenderer.invoke('workspace:vcs:save-messages', folderPath, checkpointId, messages),
      loadMessages: (folderPath: string, checkpointId: string) =>
        ipcRenderer.invoke('workspace:vcs:load-messages', folderPath, checkpointId),
      cleanup: (folderPath: string, maxCheckpoints: number) =>
        ipcRenderer.invoke('workspace:vcs:cleanup', folderPath, maxCheckpoints),
      saveSession: (folderPath: string, sessionData: unknown) =>
        ipcRenderer.invoke('workspace:vcs:save-session', folderPath, sessionData),
      loadSession: (folderPath: string) =>
        ipcRenderer.invoke('workspace:vcs:load-session', folderPath),
      loadAgents: (folderPath: string) =>
        ipcRenderer.invoke('workspace:vcs:load-agents', folderPath),
      saveAgents: (folderPath: string, agents: unknown[]) =>
        ipcRenderer.invoke('workspace:vcs:save-agents', folderPath, agents),
      addAgent: (folderPath: string, agent: unknown) =>
        ipcRenderer.invoke('workspace:vcs:add-agent', folderPath, agent),
      updateAgent: (folderPath: string, agent: unknown) =>
        ipcRenderer.invoke('workspace:vcs:update-agent', folderPath, agent),
      deleteAgent: (folderPath: string, agentId: string) =>
        ipcRenderer.invoke('workspace:vcs:delete-agent', folderPath, agentId),
    },
    watcher: {
      start: (folderPath: string) =>
        ipcRenderer.invoke('workspace:watcher:start', folderPath),
      stop: (folderPath: string) =>
        ipcRenderer.invoke('workspace:watcher:stop', folderPath),
      status: (folderPath: string) =>
        ipcRenderer.invoke('workspace:watcher:status', folderPath),
      onChange: (callback: (data: { folderPath: string; events: unknown[]; timestamp: number }) => void) => {
        const handler = (_event: unknown, data: { folderPath: string; events: unknown[]; timestamp: number }) => callback(data)
        ipcRenderer.on('workspace:watcher:on-change', handler)
        return () => {
          ipcRenderer.removeListener('workspace:watcher:on-change', handler)
        }
      },
    },
    command: {
      execute: (params) =>
        ipcRenderer.invoke('workspace:command:execute', params),
      abort: (commandId: string) =>
        ipcRenderer.invoke('workspace:command:abort', commandId),
      running: () =>
        ipcRenderer.invoke('workspace:command:running'),
      assessRisk: (command: string) =>
        ipcRenderer.invoke('workspace:command:assess-risk', command),
      onOutput: (callback: (data: { commandId: string; stream: string; chunk: string; timestamp: number }) => void) => {
        const handler = (_event: unknown, data: { commandId: string; stream: string; chunk: string; timestamp: number }) => callback(data)
        ipcRenderer.on('workspace:command:output', handler)
        return () => {
          ipcRenderer.removeListener('workspace:command:output', handler)
        }
      },
      onComplete: (callback: (data: { commandId: string; exitCode: number | null; killed: boolean; timestamp: number }) => void) => {
        const handler = (_event: unknown, data: { commandId: string; exitCode: number | null; killed: boolean; timestamp: number }) => callback(data)
        ipcRenderer.on('workspace:command:complete', handler)
        return () => {
          ipcRenderer.removeListener('workspace:command:complete', handler)
        }
      },
    },
    selectFolder: () =>
      ipcRenderer.invoke('workspace:select-folder'),
  },
}

// 通过 contextBridge 安全地暴露 API
contextBridge.exposeInMainWorld('electronAPI', electronAPI)
