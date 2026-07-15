/**
 * WebDAV 备份同步相关类型定义
 */

// ==================== 备份模块 ====================

/** 备份数据类型模块 */
export type BackupDataModule =
  | 'localStorage'      // 设置：LOCAL_STORAGE_KEYS 全套
  | 'conversations'     // IndexedDB 对话消息 + 元数据
  | 'knowledgeBase'
  | 'reports'
  | 'skills'

/** 敏感数据剥离选项 */
export interface SensitiveStripOptions {
  /** 剥离 global-config.apiKey + ai-providers.*.apiKey，默认 true */
  stripApiKeys?: boolean
  /** 剥离 MCP env 中 token/key/secret/password/auth，默认 true */
  stripMcpCredentials?: boolean
}

/** 备份选项 */
export interface BackupOptions {
  /** 默认全部模块 */
  modules?: BackupDataModule[]
  sensitive?: SensitiveStripOptions
  /** 是否把 webdav-config 的 password 写入备份；默认 false 且不备份 password */
  includeWebdavPassword?: boolean
  /** 备份来源标记：local / webdav / auto */
  source?: 'local' | 'webdav' | 'auto'
}

/** 默认全部模块 */
export const DEFAULT_BACKUP_MODULES: BackupDataModule[] = [
  'localStorage',
  'conversations',
  'knowledgeBase',
  'reports',
  'skills'
]

// ==================== WebDAV 配置 ====================

/** WebDAV 连接状态 */
export type WebDAVConnectionStatus = 'idle' | 'testing' | 'connected' | 'error'

/** WebDAV 配置 */
export interface WebDAVConfig {
  enabled: boolean
  url: string              // 如 https://dav.example.com/remote.php/dav/files/user/
  username: string
  password: string         // persist 存储（与现有 apiKey 同等本地信任模型）
  remoteDir: string        // 默认 LocalForge/backups
  autoBackupEnabled: boolean
  autoBackupIntervalHours: number  // 默认 24
  lastBackupAt?: number
  lastBackupStatus?: 'success' | 'error' | 'idle'
  lastBackupError?: string | null
  lastRemoteFile?: string
  // 默认备份选项（自动备份时使用）
  defaultBackupOptions?: BackupOptions
  connectionStatus?: WebDAVConnectionStatus
  connectionError?: string | null
}

/** WebDAV 连接配置（IPC 传输用，不含持久化字段） */
export interface WebDAVConnectionConfig {
  url: string
  username: string
  password: string
  remoteDir?: string
}

/** WebDAV 远程文件信息 */
export interface WebDAVFileInfo {
  filename: string
  basename: string
  size?: number
  lastModified: string
  type: 'file' | 'directory'
}

/** 默认 WebDAV 配置 */
export const DEFAULT_WEBDAV_CONFIG: WebDAVConfig = {
  enabled: false,
  url: '',
  username: '',
  password: '',
  remoteDir: 'LocalForge/backups',
  autoBackupEnabled: false,
  autoBackupIntervalHours: 24,
  lastBackupStatus: 'idle'
}
