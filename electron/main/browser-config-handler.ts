import { dialog, ipcMain } from 'electron'
import { access, constants } from 'node:fs/promises'
import path from 'node:path'

export interface BrowserExecutableValidation {
  valid: boolean
  browserName?: string
  version?: string
  error?: string
}

/**
 * 验证用户选择的 Chromium 浏览器可执行文件。
 * 仅接受常见 Chromium 内核浏览器，避免将任意程序作为网页分析运行时启动。
 */
export async function validateBrowserExecutable(executablePath: string): Promise<BrowserExecutableValidation> {
  const normalizedPath = executablePath.trim()
  if (!normalizedPath) {
    return { valid: false, error: '尚未设置浏览器路径' }
  }

  const baseName = path.basename(normalizedPath).toLowerCase()
  const chromiumBrowserNames = [
    'chrome.exe',
    'msedge.exe',
    'chromium.exe',
    'brave.exe',
    'google-chrome',
    'google-chrome-stable',
    'microsoft-edge',
    'chromium',
    'brave-browser'
  ]

  if (!chromiumBrowserNames.includes(baseName)) {
    return { valid: false, error: '请选择 Chrome、Microsoft Edge 或其他 Chromium 浏览器的可执行文件' }
  }

  try {
    await access(normalizedPath, constants.F_OK | constants.X_OK)
  } catch {
    return { valid: false, error: '浏览器文件不存在或没有执行权限' }
  }

  // 不执行浏览器的 --version 命令：部分 Windows 浏览器会忽略该参数并直接打开窗口。
  // 文件名白名单与可访问性检查足以在选择阶段完成安全校验；实际启动由 Playwright 处理。
  const browserName = baseName.includes('edge')
    ? 'Microsoft Edge'
    : baseName.includes('brave')
      ? 'Brave'
      : baseName.includes('chromium')
        ? 'Chromium'
        : 'Google Chrome'

  return { valid: true, browserName }
}

/** 注册浏览器路径选择和校验 IPC。 */
export function setupBrowserConfigHandlers(): void {
  ipcMain.handle('browserConfig:selectExecutable', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 Chrome 或 Microsoft Edge',
      properties: ['openFile'],
      filters: process.platform === 'win32'
        ? [{ name: 'Chromium 浏览器', extensions: ['exe'] }]
        : [{ name: '所有文件', extensions: ['*'] }]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    const executablePath = result.filePaths[0]
    const validation = await validateBrowserExecutable(executablePath)
    return { success: validation.valid, executablePath, validation, error: validation.error }
  })

  ipcMain.handle('browserConfig:validateExecutable', async (_event, executablePath: unknown) => {
    if (typeof executablePath !== 'string') {
      return { valid: false, error: '浏览器路径无效' } satisfies BrowserExecutableValidation
    }
    return validateBrowserExecutable(executablePath)
  })
}
