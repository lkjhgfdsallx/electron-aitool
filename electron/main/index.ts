import { app, shell, BrowserWindow, ipcMain, dialog, globalShortcut, Notification } from 'electron'
import { join, relative, extname } from 'path'
import { writeFile, readFile, readdir, stat } from 'fs/promises'
import https from 'https'
import http from 'http'
import { is } from '@electron-toolkit/utils'
import { setupMCPHandlers } from './mcp-proxy'
import { generateTitleFromContent } from './title-generator'
import { extractPdfText } from './pdf-extractor'
import { extractFileText } from './file-extractor'
import { setupSiteAnalyzerHandlers } from './site-analyzer-handler'
import { setupBrowserConfigHandlers } from './browser-config-handler'
import { setupCustomToolHandlers } from './custom-tool-handler'
import { searchWeb, fetchWebpage } from './web-search'
import { setupWorkspaceVCSHandlers } from './workspace-vcs-handler'
import { setupWorkspaceWatcherHandlers } from './workspace-watcher-handler'
import { setupWorkspaceCommandHandlers } from './workspace-command-handler'
import { setupWebDAVHandlers } from './webdav-handler'
import { setupWorkspaceSearchHandlers } from './workspace-search-handler'
function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    // 开发态任务栏图标；打包后由 electron-builder 使用 build/icon.png
    icon: join(__dirname, '../../build/icon.png'),
    title: 'LocalForge',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false // 允许跨域请求（用于 MCP 调用）
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 在默认浏览器中打开外部链接
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发环境加载 dev server，生产环境加载本地文件
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// 应用准备就绪
app.whenReady().then(() => {
  // 设置 IPC 处理器
  setupIPCHandlers()

  // 设置 MCP 代理
  setupMCPHandlers()

  // 设置网站分析器
  setupSiteAnalyzerHandlers()
  setupBrowserConfigHandlers()

  // 设置自定义工具沙箱执行
  setupCustomToolHandlers()

  // 设置工作区（VCS + 文件监控 + 命令执行 + 代码库检索）
  setupWorkspaceVCSHandlers()
  setupWorkspaceWatcherHandlers()
  setupWorkspaceCommandHandlers()
  setupWorkspaceSearchHandlers()

  // 设置 WebDAV 备份
  setupWebDAVHandlers()

  const mainWindow = createWindow()

  // macOS: 点击 dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

/**
 * 使用 Node.js https/http 模块下载文件（无 CORS 限制）。
 * 递归跟随 3xx 重定向（与 curl -L 行为一致）。
 */
function nodeFetch(url: string, maxRedirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) {
      reject(new Error('重定向次数过多'))
      return
    }

    const mod = url.startsWith('https') ? https : http
    const req = mod.get(url, { headers: { 'User-Agent': 'LocalForge/1.0' } }, (res) => {
      const status = res.statusCode ?? 0

      // 跟随重定向
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume() // 消费掉响应体
        const next = new URL(res.headers.location, url).toString()
        nodeFetch(next, maxRedirects - 1).then(resolve, reject)
        return
      }

      if (status !== 200) {
        res.resume()
        reject(new Error(`HTTP ${status}`))
        return
      }

      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })

    req.on('error', reject)
    req.setTimeout(120_000, () => {
      req.destroy(new Error('下载超时（120s）'))
    })
  })
}

function setupIPCHandlers(): void {
  // 模型文件批量下载（Node.js 环境，无 CORS 限制）
  ipcMain.handle('model:downloadFiles', async (_event, urls: string[]) => {
    const results: Array<{ url: string; data: number[] }> = []
    for (const url of urls) {
      try {
        const buffer = await nodeFetch(url)
        results.push({ url, data: Array.from(buffer) })
      } catch (err) {
        console.error(`[model:downloadFiles] 下载失败 ${url}:`, err)
        throw new Error(`下载失败 ${url}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    return results
  })

  // 网页搜索
  ipcMain.handle('web:search', async (_event, query: string, maxResults?: number) => {
    try {
      const results = await searchWeb(query, maxResults)
      return { success: true, results }
    } catch (error) {
      console.error('网页搜索失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '网页搜索失败'
      }
    }
  })

  // 抓取网页内容
  ipcMain.handle('web:fetchWebpage', async (_event, url: string, maxLength?: number) => {
    try {
      const content = await fetchWebpage(url, maxLength)
      return { success: true, content }
    } catch (error) {
      console.error('网页抓取失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '网页抓取失败'
      }
    }
  })

  // 标题生成（TextRank + jieba 分词）
  ipcMain.handle('title:generate', (_event, content: string) => {
    try {
      return generateTitleFromContent(content)
    } catch {
      return '新对话'
    }
  })

  // PDF 文本提取（在 Node.js 主进程中运行，避免渲染进程兼容性问题）
  ipcMain.handle('file:extractPdfText', async (_event, filePath: string) => {
    try {
      const text = await extractPdfText(filePath)
      return { success: true, text }
    } catch (error) {
      console.error('PDF 提取失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'PDF 提取失败'
      }
    }
  })

  // 统一文件文本提取（支持 PDF/DOCX/HTML/源码/日志等）
  ipcMain.handle('file:extractText', async (_event, filePath: string) => {
    try {
      const text = await extractFileText(filePath)
      return { success: true, text }
    } catch (error) {
      console.error('文件文本提取失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '文件文本提取失败'
      }
    }
  })

  // 导出对话原始数据到文件
  ipcMain.handle('file:saveFile', async (_event, defaultName: string, content: string) => {
    try {
      const win = BrowserWindow.fromWebContents(_event.sender)
      if (!win) return { success: false, error: '无法获取窗口' }

      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: '导出原始对话',
        defaultPath: defaultName,
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (canceled || !filePath) return { success: false, error: '用户取消' }

      await writeFile(filePath, content, 'utf-8')
      return { success: true, filePath }
    } catch (error) {
      console.error('保存文件失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '保存文件失败'
      }
    }
  })

  // 保存二进制文件（zip 备份等）
  ipcMain.handle('file:saveZip', async (_event, defaultName: string, data: number[]) => {
    try {
      const win = BrowserWindow.fromWebContents(_event.sender)
      if (!win) return { success: false, error: '无法获取窗口' }

      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: '保存备份文件',
        defaultPath: defaultName,
        filters: [
          { name: 'ZIP 压缩文件', extensions: ['zip'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (canceled || !filePath) return { success: false, error: '用户取消' }

      const buffer = Buffer.from(data)
      await writeFile(filePath, buffer)
      return { success: true, filePath }
    } catch (error) {
      console.error('保存 zip 文件失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '保存 zip 文件失败'
      }
    }
  })

  // 打开文件对话框并读取文件内容
  ipcMain.handle('file:openFile', async (_event, filters?: Array<{ name: string; extensions: string[] }>) => {
    try {
      const win = BrowserWindow.fromWebContents(_event.sender)
      if (!win) return { success: false, error: '无法获取窗口' }

      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: '选择备份文件',
        filters: filters ?? [
          { name: 'ZIP 压缩文件', extensions: ['zip'] },
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      })

      if (canceled || filePaths.length === 0) return { success: false, error: '用户取消' }

      const filePath = filePaths[0]
      const buffer = await readFile(filePath)
      return { success: true, data: Array.from(buffer), filePath }
    } catch (error) {
      console.error('读取文件失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '读取文件失败'
      }
    }
  })

  // ---- 工作区文件系统操作 ----

  /** 忽略的目录名集合（与 workspace-vcs-handler 保持一致） */
  const IGNORED_FS_DIRS = new Set([
    'node_modules', '.git', '.ai-workspace-vcs', '.next', 'dist', 'build',
    '.cache', '__pycache__', '.DS_Store', '.idea', '.vscode', 'coverage',
  ])

  /**
   * 读取目录内容，返回文件/子目录列表（按名称排序，目录在前）
   * 用于 FileTree 组件实时浏览工作区目录结构
   */
  ipcMain.handle('workspace:fs:readDir', async (_event, dirPath: string) => {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true })
      const result: Array<{ name: string; path: string; isDirectory: boolean; size: number; ext: string }> = []

      for (const entry of entries) {
        // 跳过忽略的目录
        if (IGNORED_FS_DIRS.has(entry.name)) continue

        const fullPath = join(dirPath, entry.name)
        const ext = entry.isDirectory() ? '' : extname(entry.name)

        let size = 0
        try {
          const fileStat = await stat(fullPath)
          size = entry.isDirectory() ? 0 : fileStat.size
        } catch { /* 忽略 */ }

        result.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size,
          ext,
        })
      }

      // 排序：目录在前，文件在后；各自按名称排序
      result.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      return { success: true, entries: result }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '读取目录失败'
      }
    }
  })

  /**
   * 读取文件文本内容（限 512KB 以防止大文件卡顿）
   * 用于 FilePreview 组件预览文件内容
   */
  ipcMain.handle('workspace:fs:readFile', async (_event, filePath: string, maxBytes?: number) => {
    const limit = maxBytes ?? 512 * 1024 // 默认 512KB
    try {
      const fileStat = await stat(filePath)
      if (fileStat.size > limit) {
        // 大文件：只读取前 limit 字节
        const fd = await import('fs/promises').then(m => m.open(filePath, 'r'))
        const buffer = Buffer.alloc(limit)
        await fd.read(buffer, 0, limit, 0)
        await fd.close()
        return {
          success: true,
          content: buffer.toString('utf-8'),
          truncated: true,
          totalSize: fileStat.size,
        }
      }
      const content = await readFile(filePath, 'utf-8')
      return { success: true, content, truncated: false, totalSize: fileStat.size }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '读取文件失败'
      }
    }
  })

  /**
   * 写入文件内容（创建或覆盖）
   * 用于 AI Agent 工具直接操作工作区文件
   */
  ipcMain.handle('workspace:fs:writeFile', async (_event, filePath: string, content: string) => {
    try {
      // 确保父目录存在
      const { mkdir } = await import('fs/promises')
      const { dirname } = await import('path')
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '写入文件失败'
      }
    }
  })

  /**
   * 创建目录（递归）
   * 用于 AI Agent 工具创建新目录
   */
  ipcMain.handle('workspace:fs:createDir', async (_event, dirPath: string) => {
    try {
      const { mkdir } = await import('fs/promises')
      await mkdir(dirPath, { recursive: true })
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '创建目录失败'
      }
    }
  })

  /**
   * 删除文件
   * 用于 AI Agent 工具删除工作区文件
   */
  ipcMain.handle('workspace:fs:deleteFile', async (_event, filePath: string) => {
    try {
      const { unlink } = await import('fs/promises')
      await unlink(filePath)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除文件失败'
      }
    }
  })

  // 窗口控制
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.isMaximized() ? win.unmaximize() : win.maximize()
    }
  })

  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window:isMaximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  // ---- 快捷键 ----
  const registeredShortcuts = new Map<string, string>()

  ipcMain.handle('shortcuts:register', (event, id: string, accelerator: string) => {
    try {
      // 如果该 id 已注册，先注销旧的
      if (registeredShortcuts.has(id)) {
        globalShortcut.unregister(registeredShortcuts.get(id)!)
      }
      globalShortcut.register(accelerator, () => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win && !win.isDestroyed()) {
          win.webContents.send('shortcuts:triggered', id)
        }
      })
      registeredShortcuts.set(id, accelerator)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '注册快捷键失败' }
    }
  })

  ipcMain.handle('shortcuts:unregister', (_event, id: string) => {
    try {
      const accelerator = registeredShortcuts.get(id)
      if (accelerator) {
        globalShortcut.unregister(accelerator)
        registeredShortcuts.delete(id)
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '注销快捷键失败' }
    }
  })

  // ---- 系统通知 ----
  ipcMain.handle('notification:show', (_event, title: string, body: string) => {
    try {
      if (Notification.isSupported()) {
        const notification = new Notification({ title, body })
        notification.show()
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '通知失败' }
    }
  })

  ipcMain.handle('notification:playSound', (_event, _soundName: string) => {
    // Electron 没有原生播放音频的 API，通过渲染进程的 Web Audio API 播放
    // 此处返回成功，由渲染进程自行播放
    return { success: true }
  })
}
