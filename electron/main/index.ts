import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import https from 'https'
import http from 'http'
import { is } from '@electron-toolkit/utils'
import { setupMCPHandlers } from './mcp-proxy'
import { generateTitleFromContent } from './title-generator'
import { extractPdfText } from './pdf-extractor'
import { extractFileText } from './file-extractor'
import { setupSiteAnalyzerHandlers } from './site-analyzer-handler'
import { searchWeb, fetchWebpage } from './web-search'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 12 },
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
    const req = mod.get(url, { headers: { 'User-Agent': 'electron-aitool/1.0' } }, (res) => {
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
}
