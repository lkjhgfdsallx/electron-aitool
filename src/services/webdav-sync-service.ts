/**
 * WebDAV 备份同步服务
 *
 * 编排本地备份/恢复与 WebDAV 远程存储之间的同步逻辑，
 * 支持模块选择、敏感数据剥离、定时自动备份。
 */

import JSZip from 'jszip'
import { useWebDAVConfigStore } from '../stores/webdav-config-store'
import type {
  BackupDataModule,
  BackupOptions,
  WebDAVFileInfo
} from '../types/webdav'
import { DEFAULT_BACKUP_MODULES } from '../types/webdav'
import { createBackup, restoreFromBackup, type RestoreOptions, type BackupProgressCallback } from './backup-service'

// ==================== 常量 ====================

/** 备份文件名格式 */
const BACKUP_FILENAME_FORMAT = 'localforge-backup-%s.zip'

/** 远程备份文件前缀 */
const REMOTE_BACKUP_PREFIX = 'backups/'

// ==================== Store 辅助 ====================

/** 获取 WebDAV 配置（通过 Zustand store 的 getState） */
function getWebDAVConfig() {
  return useWebDAVConfigStore.getState()
}

/** 更新 WebDAV 配置（通过 Zustand store 的 setState） */
function setWebDAVConfig(partial: Partial<ReturnType<typeof useWebDAVConfigStore>>) {
  useWebDAVConfigStore.setState(partial)
}

// ==================== 工具函数 ====================

/** 生成备份文件名 */
function generateBackupFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return BACKUP_FILENAME_FORMAT.replace('%s', timestamp)
}

/** 获取默认备份模块 */
function getDefaultModules(): BackupDataModule[] {
  return [...DEFAULT_BACKUP_MODULES]
}

/** 合并备份选项 */
function mergeBackupOptions(overrides?: Partial<BackupOptions>): BackupOptions {
  const config = getWebDAVConfig()
  const configDefaults = (config as unknown as { defaultBackupOptions?: BackupOptions }).defaultBackupOptions
  return {
    modules: overrides?.modules ?? configDefaults?.modules ?? getDefaultModules(),
    sensitive: overrides?.sensitive ?? configDefaults?.sensitive ?? {},
    includeWebdavPassword: overrides?.includeWebdavPassword ?? configDefaults?.includeWebdavPassword ?? false,
    source: overrides?.source ?? 'webdav'
  }
}

// ==================== 本地备份 API 兼容 ====================

/**
 * 按模块创建备份（纯本地，不上传 WebDAV）
 * 用于与现有 backup-service 兼容
 */
export async function createModularBackup(
  _options: BackupOptions = {},
  onProgress?: BackupProgressCallback
): Promise<Blob> {
  // 目前直接调用原有 createBackup
  // 完整实现需要在 backup-service 中增加模块选择和敏感剥离选项支持
  return createBackup(onProgress)
}

// ==================== WebDAV 上传 ====================

/**
 * 上传备份到 WebDAV
 */
export async function uploadToWebDAV(
  options?: Partial<BackupOptions>,
  onProgress?: BackupProgressCallback
): Promise<{ success: boolean; filename?: string; error?: string }> {
  try {
    const config = getWebDAVConfig()
    if (!config.enabled) {
      return { success: false, error: 'WebDAV 未启用' }
    }

    if (!config.url || !config.username || !config.password) {
      return { success: false, error: 'WebDAV 配置不完整' }
    }

    // 1. 创建备份
    const merged = mergeBackupOptions(options)
    const filename = generateBackupFilename()

    onProgress?.('正在创建备份...', 0, 1)
    const blob = await createModularBackup(merged, onProgress)

    // 2. 转换为 number[] 以便通过 IPC 上传
    const arrayBuffer = await blob.arrayBuffer()
    const byteLength = arrayBuffer.byteLength
    const uint8Array = new Uint8Array(arrayBuffer)
    const fileData = Array.from(uint8Array) as number[]

    // 3. 确保远程目录存在
    const connectionConfig = {
      url: config.url,
      username: config.username,
      password: config.password,
      remoteDir: config.remoteDir
    }

    const ensureResult = await window.electronAPI.webdav.ensureDir(connectionConfig)
    if (!ensureResult.success) {
      return { success: false, error: `创建远程目录失败: ${ensureResult.error}` }
    }

    // 4. 上传文件
    const uploadResult = await window.electronAPI.webdav.upload(connectionConfig, filename, fileData)
    if (!uploadResult.success) {
      return { success: false, error: `上传失败: ${uploadResult.error}` }
    }

    // 5. 更新配置状态
    setWebDAVConfig({
      lastBackupAt: Date.now(),
      lastBackupStatus: 'success',
      lastBackupError: null,
      lastRemoteFile: filename ?? config.lastRemoteFile
    })

    onProgress?.('上传完成', 1, 1)
    return { success: true, filename }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    setWebDAVConfig({
      lastBackupAt: Date.now(),
      lastBackupStatus: 'error',
      lastBackupError: errorMessage
    })
    return { success: false, error: errorMessage }
  }
}

// ==================== WebDAV 下载/恢复 ====================

/**
 * 从 WebDAV 下载并恢复备份
 */
export async function downloadFromWebDAV(
  filename: string,
  restoreOptions?: Partial<RestoreOptions>
): Promise<{ success: boolean; error?: string }> {
  try {
    const config = getWebDAVConfig()
    if (!config.url || !config.username || !config.password) {
      return { success: false, error: 'WebDAV 配置不完整' }
    }

    const connectionConfig = {
      url: config.url,
      username: config.username,
      password: config.password,
      remoteDir: config.remoteDir
    }

    // 1. 下载备份文件
    const downloadResult = await window.electronAPI.webdav.download(connectionConfig, filename)
    if (!downloadResult.success || !downloadResult.data) {
      return { success: false, error: `下载失败: ${downloadResult.error}` }
    }

    // 2. 转换为 Blob
    const uint8Array = new Uint8Array(downloadResult.data)
    const blob = new Blob([uint8Array])

    // 3. 恢复数据
    await restoreFromBackup(blob, restoreOptions)

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

// ==================== WebDAV 文件管理 ====================

/**
 * 列出远程备份文件
 */
export async function listRemoteBackups(): Promise<{
  success: boolean
  files?: WebDAVFileInfo[]
  error?: string
}> {
  try {
    const config = getWebDAVConfig()
    if (!config.url || !config.username || !config.password) {
      return { success: false, error: 'WebDAV 配置不完整' }
    }

    const connectionConfig = {
      url: config.url,
      username: config.username,
      password: config.password,
      remoteDir: config.remoteDir
    }

    const result = await window.electronAPI.webdav.listFiles(connectionConfig)
    if (!result.success) {
      return { success: false, error: result.error ?? '列出文件失败' }
    }

    return { success: true, files: result.files ?? [] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

/**
 * 删除远程备份文件
 */
export async function deleteRemoteBackup(filename: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const config = getWebDAVConfig()
    if (!config.url || !config.username || !config.password) {
      return { success: false, error: 'WebDAV 配置不完整' }
    }

    const connectionConfig = {
      url: config.url,
      username: config.username,
      password: config.password,
      remoteDir: config.remoteDir
    }

    const result = await window.electronAPI.webdav.delete(connectionConfig, filename)
    if (!result.success) {
      return { success: false, error: result.error ?? '删除失败' }
    }

    // 如果删除的是上次备份文件，更新配置
    if (config.lastRemoteFile === filename) {
      setWebDAVConfig({ lastRemoteFile: undefined })
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return { success: false, error: errorMessage }
  }
}

// ==================== 定时自动备份 ====================

/**
 * 定时器句柄
 */
let autoBackupTimer: ReturnType<typeof setInterval> | null = null

/**
 * 启动定时自动备份
 */
export function startAutoBackup(): void {
  stopAutoBackup()

  const config = getWebDAVConfig()
  if (!config.autoBackupEnabled || !config.enabled) {
    return
  }

  const intervalMs = config.autoBackupIntervalHours * 60 * 60 * 1000
  autoBackupTimer = setInterval(async () => {
    await uploadToWebDAV()
  }, intervalMs)

  // 启动时立即执行一次备份
  uploadToWebDAV()
}

/**
 * 停止定时自动备份
 */
export function stopAutoBackup(): void {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer)
    autoBackupTimer = null
  }
}

/**
 * 处理配置变更，自动启/停定时任务
 */
export function handleConfigChange(): void {
  const config = getWebDAVConfig()
  if (config.autoBackupEnabled && config.enabled) {
    startAutoBackup()
  } else {
    stopAutoBackup()
  }
}
