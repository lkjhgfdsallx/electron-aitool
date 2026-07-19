/**
 * 网站分析器 IPC 处理器
 * 在主进程中处理来自渲染进程的网站分析请求
 */

import { ipcMain, BrowserWindow } from 'electron'
import { runSiteAnalyzer, cancelSiteAnalyzer, getActiveTasks } from './site-analyzer'
import { validateBrowserExecutable } from './browser-config-handler'
import type { SiteAnalyzerConfig, SiteAnalyzerProgress } from './site-analyzer/types'

/**
 * 设置网站分析器的IPC处理器
 */
export function setupSiteAnalyzerHandlers(): void {
  // 启动网站分析任务
  ipcMain.handle('siteAnalyzer:start', async (event, config: SiteAnalyzerConfig) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '无法获取窗口' }

    try {
      const browserValidation = await validateBrowserExecutable(config.browserExecutablePath ?? '')
      if (!browserValidation.valid) {
        return { success: false, error: `网页分析浏览器不可用：${browserValidation.error}` }
      }

      // 运行分析，通过webContents发送进度事件
      const result = await runSiteAnalyzer(config, (progress: SiteAnalyzerProgress) => {
        // 实时发送进度到渲染进程
        try {
          if (!win.isDestroyed()) {
            win.webContents.send('siteAnalyzer:progress', progress)
          }
        } catch {
          // 窗口可能已关闭
        }
      })

      return { success: true, data: result }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '分析失败'
      return { success: false, error: errorMsg }
    }
  })

  // 取消分析任务
  ipcMain.handle('siteAnalyzer:cancel', (_event, taskId: string) => {
    const cancelled = cancelSiteAnalyzer(taskId)
    return { success: cancelled }
  })

  // 获取活跃任务
  ipcMain.handle('siteAnalyzer:getActiveTasks', () => {
    return { success: true, data: getActiveTasks() }
  })
}
