/**
 * WebDAV 主进程处理器
 * 
 * 基于 npm 包 `webdav` 提供 WebDAV 操作：
 * - 测试连接
 * - 确保目录存在
 * - 上传/下载/删除备份文件
 */

import { ipcMain } from 'electron'
import { createClient, type WebDAVClient, type FileStat } from 'webdav'

// ==================== 类型 ====================

export interface WebDAVConnectionConfig {
  url: string
  username: string
  password: string
  remoteDir?: string
}

export interface WebDAVFileInfo {
  filename: string
  basename: string
  size?: number
  lastModified: string
  type: 'file' | 'directory'
}

interface IPCResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// ==================== 辅助函数 ====================

/** 创建 WebDAV 客户端 */
function createClientInstance(config: WebDAVConnectionConfig): WebDAVClient {
  return createClient(config.url, {
    username: config.username,
    password: config.password
  })
}

/** 规范化路径（统一 /，去重斜杠） */
function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .map(p => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
}

/** 将 FileStat 转换为 WebDAVFileInfo */
function toFileInfo(stat: FileStat): WebDAVFileInfo {
  return {
    filename: stat.filename,
    basename: stat.basename,
    size: stat.size as number | undefined,
    lastModified: stat.lastmod,
    type: stat.type === 'file' ? 'file' : 'directory'
  }
}

/** 脱敏错误信息（去掉 URL 中的 userinfo） */
function sanitizeError(error: unknown, config?: WebDAVConnectionConfig): string {
  if (error instanceof Error) {
    let msg = error.message
    if (config) {
      // 移除 URL 中的用户名密码
      msg = msg.replace(new RegExp(config.password, 'g'), '***')
    }
    return msg
  }
  return String(error)
}

// ==================== IPC Handlers ====================

/**
 * 注册 WebDAV IPC handlers
 */
export function setupWebDAVHandlers(): void {
  // 测试连接
  ipcMain.handle('webdav:test', async (_event, config: WebDAVConnectionConfig): Promise<IPCResult> => {
    try {
      const client = createClientInstance(config)
      // 尝试获取目录内容以验证连接
      const remoteDir = config.remoteDir || '/'
      await client.getDirectoryContents(remoteDir, { deep: false })
      return { success: true }
    } catch (error) {
      return { success: false, error: sanitizeError(error, config) }
    }
  })

  // 确保远程目录存在
  ipcMain.handle('webdav:ensureDir', async (_event, config: WebDAVConnectionConfig): Promise<IPCResult> => {
    try {
      const client = createClientInstance(config)
      const remoteDir = joinPath(config.remoteDir || '', 'backups')
      await client.createDirectory(remoteDir, { recursive: true })
      return { success: true }
    } catch (error) {
      return { success: false, error: sanitizeError(error, config) }
    }
  })

  // 上传备份文件
  ipcMain.handle('webdav:upload', async (_event, config: WebDAVConnectionConfig, fileName: string, data: number[]): Promise<IPCResult> => {
    try {
      const client = createClientInstance(config)
      const remoteDir = joinPath(config.remoteDir || '', 'backups')
      const remotePath = `/${joinPath(remoteDir, fileName)}`
      const buffer = Buffer.from(Uint8Array.from(data))
      await client.putFileContents(remotePath, buffer, { overwrite: false })
      return { success: true, data: { fileName } }
    } catch (error) {
      // 文件已存在时返回 success=true 但提示
      const err = error as Error
      if (err.message.includes('412') || err.message.includes('file exists')) {
        return { success: true, data: { fileName, exists: true } }
      }
      return { success: false, error: sanitizeError(error, config) }
    }
  })

  // 列出远程备份文件
  ipcMain.handle('webdav:list', async (_event, config: WebDAVConnectionConfig): Promise<IPCResult<WebDAVFileInfo[]>> => {
    try {
      const client = createClientInstance(config)
      const remoteDir = joinPath(config.remoteDir || '', 'backups')
      const items = await client.getDirectoryContents(remoteDir, { deep: false })
      const fileStats = Array.isArray(items) ? items : []
      const files = fileStats
        .filter((stat: FileStat) => stat.type === 'file' && stat.basename.endsWith('.zip'))
        .map(toFileInfo)
        // 按修改时间倒序
        .sort((a: WebDAVFileInfo, b: WebDAVFileInfo) => 
          new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
        )
      return { success: true, data: files }
    } catch (error) {
      return { success: false, error: sanitizeError(error, config) }
    }
  })

  // 下载备份文件
  ipcMain.handle('webdav:download', async (_event, config: WebDAVConnectionConfig, fileName: string): Promise<IPCResult<number[]>> => {
    try {
      const client = createClientInstance(config)
      const remoteDir = joinPath(config.remoteDir || '', 'backups')
      const remotePath = `/${joinPath(remoteDir, fileName)}`
      const buffer = await client.getFileContents(remotePath, { format: 'binary' }) as Buffer
      return { success: true, data: Array.from(new Uint8Array(buffer)) }
    } catch (error) {
      return { success: false, error: sanitizeError(error, config) }
    }
  })

  // 删除远程备份文件
  ipcMain.handle('webdav:delete', async (_event, config: WebDAVConnectionConfig, fileName: string): Promise<IPCResult> => {
    try {
      const client = createClientInstance(config)
      const remoteDir = joinPath(config.remoteDir || '', 'backups')
      const remotePath = `/${joinPath(remoteDir, fileName)}`
      await client.deleteFile(remotePath)
      return { success: true }
    } catch (error) {
      return { success: false, error: sanitizeError(error, config) }
    }
  })
}
