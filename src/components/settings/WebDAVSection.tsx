/**
 * WebDAV 备份同步配置区域
 *
 * 样式对齐 DataManagementSection 中 BackupSection / ExportSection：
 * - surface / accent 语义色
 * - rounded-xl 描边按钮
 * - 列表容器与导出列表一致
 * - SettingsToggle 统一开关
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { BackupDataModule, SensitiveStripOptions, WebDAVFileInfo } from '../../types/webdav'
import { DEFAULT_BACKUP_MODULES } from '../../types/webdav'
import { useWebDAVConfigStore } from '../../stores/webdav-config-store'
import {
  uploadToWebDAV,
  downloadFromWebDAV,
  listRemoteBackups,
  deleteRemoteBackup
} from '../../services/webdav-sync-service'
import { StatusFeedback, SettingsToggle } from './ui'
import {
  Cloud,
  CloudOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Download,
  Upload,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff
} from 'lucide-react'

// ==================== 常量 ====================

const MODULE_LABELS: Record<BackupDataModule, string> = {
  localStorage: '设置与配置',
  conversations: '对话消息',
  knowledgeBase: '知识库',
  reports: '分析报告',
  skills: 'Skills'
}

// ==================== 子组件 ====================

function ConfigField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  password,
  disabled
}: {
  label: string
  type?: string
  value: string
  onChange: (val: string) => void
  placeholder?: string
  password?: boolean
  disabled?: boolean
}) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div>
      <label className="block text-xs text-muted mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={password ? (showPassword ? 'text' : 'password') : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={password ? 'current-password' : 'off'}
          className={`w-full px-3 py-2 text-sm bg-white dark:bg-surface-900/50 border border-surface-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-400 dark:focus:border-accent-600 disabled:opacity-50 transition-colors ${
            password ? 'pr-10' : ''
          }`}
        />
        {password && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            disabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-surface-700 dark:hover:text-surface-300 disabled:opacity-50 rounded-md"
            title={showPassword ? '隐藏密码' : '显示密码'}
            aria-label={showPassword ? '隐藏密码' : '显示密码'}
          >
            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

export function WebDAVSection() {
  const config = useWebDAVConfigStore()
  const [testing, setTesting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [files, setFiles] = useState<WebDAVFileInfo[]>([])
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(
    null
  )
  const [modules, setModules] = useState<BackupDataModule[]>([...DEFAULT_BACKUP_MODULES])
  const [sensitive, setSensitive] = useState<SensitiveStripOptions>({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearStatus = useCallback(() => {
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current)
    setStatus(null)
  }, [])

  const showStatus = useCallback(
    (text: string, type: 'success' | 'error' | 'info') => {
      clearStatus()
      setStatus({ text, type })
      statusTimeoutRef.current = setTimeout(clearStatus, 5000)
    },
    [clearStatus]
  )

  const refreshFiles = useCallback(async () => {
    if (!config.enabled || !config.url || !config.username || !config.password) {
      setFiles([])
      return
    }
    setRefreshing(true)
    const result = await listRemoteBackups()
    if (result.success) {
      setFiles(result.files ?? [])
    } else {
      showStatus(result.error ?? '获取文件列表失败', 'error')
    }
    setRefreshing(false)
  }, [config.enabled, config.url, config.username, config.password, showStatus])

  useEffect(() => {
    if (config.enabled) {
      void refreshFiles()
    } else {
      setFiles([])
    }
  }, [config.enabled, refreshFiles])

  const handleTestConnection = async () => {
    setTesting(true)
    config.setConnectionStatus('testing')
    try {
      const result = await window.electronAPI.webdav.testConnection({
        url: config.url,
        username: config.username,
        password: config.password,
        remoteDir: config.remoteDir
      })
      if (result.success) {
        config.setConnectionStatus('connected')
        showStatus('连接测试成功', 'success')
        await refreshFiles()
      } else {
        config.setConnectionStatus('error', result.error)
        showStatus(`连接测试失败: ${result.error}`, 'error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      config.setConnectionStatus('error', message)
      showStatus(`连接测试失败: ${message}`, 'error')
    } finally {
      setTesting(false)
    }
  }

  const handleUpload = async () => {
    if (!config.enabled) {
      showStatus('请先启用 WebDAV', 'error')
      return
    }
    if (!config.url || !config.username || !config.password) {
      showStatus('WebDAV 配置不完整', 'error')
      return
    }
    setUploading(true)
    clearStatus()
    const result = await uploadToWebDAV({ modules, sensitive })
    if (result.success) {
      showStatus(`上传成功: ${result.filename}`, 'success')
      await refreshFiles()
    } else {
      showStatus(`上传失败: ${result.error}`, 'error')
    }
    setUploading(false)
  }

  const handleDownload = async (filename: string) => {
    setDownloading(filename)
    clearStatus()
    const result = await downloadFromWebDAV(filename)
    if (result.success) {
      showStatus(`恢复成功: ${filename}，建议重启应用`, 'success')
    } else {
      showStatus(`恢复失败: ${result.error}`, 'error')
    }
    setDownloading(null)
  }

  const handleDelete = async (filename: string) => {
    if (!confirm(`确定要删除远程备份「${filename}」吗？此操作不可撤销。`)) return
    setDeleting(filename)
    const result = await deleteRemoteBackup(filename)
    if (result.success) {
      showStatus(`已删除: ${filename}`, 'success')
      await refreshFiles()
    } else {
      showStatus(`删除失败: ${result.error}`, 'error')
    }
    setDeleting(null)
  }

  const toggleModule = (moduleId: BackupDataModule) => {
    setModules((prev) =>
      prev.includes(moduleId) ? prev.filter((m) => m !== moduleId) : [...prev, moduleId]
    )
  }

  const connectionBadge = (() => {
    if (!config.enabled) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-surface-100 dark:bg-surface-800 text-muted border border-surface-200 dark:border-surface-700">
          <CloudOff size={11} />
          未启用
        </span>
      )
    }
    if (config.connectionStatus === 'connected') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/50">
          <CheckCircle2 size={11} />
          已连接
        </span>
      )
    }
    if (config.connectionStatus === 'testing') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/80 dark:border-blue-800/50">
          <Loader2 size={11} className="animate-spin" />
          测试中
        </span>
      )
    }
    if (config.connectionStatus === 'error') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200/80 dark:border-red-800/50">
          <CloudOff size={11} />
          连接失败
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-surface-100 dark:bg-surface-800 text-muted border border-surface-200 dark:border-surface-700">
        <Cloud size={11} />
        未测试
      </span>
    )
  })()

  const canConnect =
    config.enabled && Boolean(config.url && config.username && config.password)

  return (
    <>
      {/* 标题：对齐 BackupSection */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 flex items-center gap-2">
            <Cloud size={16} className="text-sky-500 shrink-0" />
            WebDAV 备份同步
            <span className="ml-0.5">{connectionBadge}</span>
          </h3>
          <p className="text-xs text-muted mt-0.5">
            将完整备份上传到 WebDAV，支持远程恢复与定时自动备份
          </p>
        </div>
        <SettingsToggle
          size="sm"
          checked={config.enabled}
          onChange={(checked) => config.updateConfig({ enabled: checked })}
          label="启用"
          className="shrink-0 !gap-2"
        />
      </div>

      {status && (
        <div className="mt-3 mb-1">
          <StatusFeedback type={status.type} message={status.text} onClose={() => setStatus(null)} />
        </div>
      )}

      {/* 未启用：只展示轻量提示，避免整页表单压迫感 */}
      {!config.enabled ? (
        <p className="mt-4 text-xs text-muted leading-relaxed">
          开启后可配置服务器地址，并在本地备份之上增加云端同步。
        </p>
      ) : (
        <>
          {/* 服务器配置 */}
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <ConfigField
                  label="WebDAV 地址"
                  type="url"
                  value={config.url}
                  onChange={(val) => config.updateConfig({ url: val })}
                  placeholder="https://dav.example.com/remote.php/dav/files/user/"
                />
              </div>
              <ConfigField
                label="用户名"
                value={config.username}
                onChange={(val) => config.updateConfig({ username: val })}
                placeholder="用户名"
              />
              <ConfigField
                label="密码"
                value={config.password}
                onChange={(val) => config.updateConfig({ password: val })}
                placeholder="密码或应用专用密码"
                password
              />
              <div className="sm:col-span-2">
                <ConfigField
                  label="远程目录"
                  value={config.remoteDir}
                  onChange={(val) => config.updateConfig({ remoteDir: val })}
                  placeholder="LocalForge/backups"
                />
              </div>
            </div>

            {config.connectionStatus === 'error' && config.connectionError && (
              <div className="flex items-start gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                <span className="break-all">{config.connectionError}</span>
              </div>
            )}

            {/* 主操作：与「完整备份与恢复」同款描边按钮 */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || !canConnect}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {testing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                测试连接
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading || !canConnect}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm border border-accent-200 dark:border-accent-800/60 text-accent-600 dark:text-accent-400 rounded-xl hover:bg-accent-50 dark:hover:bg-accent-950/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                立即上传备份
              </button>
            </div>
          </div>

          {/* 高级选项：渐进披露 */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs text-muted hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
            >
              {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              高级选项
              <span className="text-[10px] opacity-70 ml-1">模块 · 敏感数据 · 定时</span>
            </button>

            {showAdvanced && (
              <div className="mt-2 space-y-4 p-3 border border-surface-200 dark:border-surface-700 rounded-lg bg-surface-50 dark:bg-surface-900/50">
                <div>
                  <div className="text-xs font-medium text-surface-700 dark:text-surface-300 mb-2">
                    备份模块
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {DEFAULT_BACKUP_MODULES.map((moduleId) => (
                      <label
                        key={moduleId}
                        className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg hover:bg-white dark:hover:bg-surface-800/60 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={modules.includes(moduleId)}
                          onChange={() => toggleModule(moduleId)}
                          className="rounded"
                        />
                        <span>{MODULE_LABELS[moduleId]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-surface-700 dark:text-surface-300 mb-2">
                    敏感数据剥离
                  </div>
                  <div className="space-y-0.5">
                    <label className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg hover:bg-white dark:hover:bg-surface-800/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!sensitive.stripApiKeys}
                        onChange={(e) =>
                          setSensitive((prev) => ({ ...prev, stripApiKeys: e.target.checked }))
                        }
                        className="rounded"
                      />
                      <span>移除 API Key（global-config / AI Provider）</span>
                    </label>
                    <label className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg hover:bg-white dark:hover:bg-surface-800/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!sensitive.stripMcpCredentials}
                        onChange={(e) =>
                          setSensitive((prev) => ({
                            ...prev,
                            stripMcpCredentials: e.target.checked
                          }))
                        }
                        className="rounded"
                      />
                      <span>移除 MCP 服务器凭据</span>
                    </label>
                  </div>
                </div>

                <div className="pt-1 border-t border-surface-200/80 dark:border-surface-700/60">
                  <SettingsToggle
                    size="sm"
                    checked={config.autoBackupEnabled}
                    onChange={(checked) => config.updateConfig({ autoBackupEnabled: checked })}
                    label="定时自动备份"
                    description="按间隔将备份上传到 WebDAV"
                    className="mb-2"
                  />
                  {config.autoBackupEnabled && (
                    <div className="flex items-center gap-2 pl-0.5">
                      <span className="text-xs text-muted">每隔</span>
                      <input
                        type="number"
                        min={1}
                        max={168}
                        value={config.autoBackupIntervalHours}
                        onChange={(e) =>
                          config.updateConfig({
                            autoBackupIntervalHours: Math.max(
                              1,
                              Math.min(168, Number(e.target.value) || 1)
                            )
                          })
                        }
                        className="w-16 px-2 py-1.5 text-xs bg-white dark:bg-surface-900/50 border border-surface-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500/40"
                      />
                      <span className="text-xs text-muted">小时备份一次</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 远程备份列表：对齐 ExportSection 列表 chrome */}
          <div className="mt-4">
            <div className="border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-surface-50 dark:bg-surface-900/50 border-b border-surface-200 dark:border-surface-700">
                <span className="text-xs text-muted">
                  远程备份文件
                  {files.length > 0 ? ` (${files.length})` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => void refreshFiles()}
                  disabled={refreshing || !canConnect}
                  className="flex items-center gap-1 text-[11px] text-muted hover:text-surface-700 dark:hover:text-surface-300 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                  刷新
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {!canConnect ? (
                  <div className="text-center text-xs text-muted py-6">
                    请先填写完整连接信息
                  </div>
                ) : files.length === 0 ? (
                  <div className="text-center text-xs text-muted py-6">
                    {refreshing ? '加载中…' : '暂无远程备份文件'}
                  </div>
                ) : (
                  files.map((file) => (
                    <div
                      key={file.filename}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-surface-100 dark:border-surface-800 last:border-b-0 hover:bg-surface-50 dark:hover:bg-surface-900/30"
                    >
                      <span className="flex-1 truncate text-surface-700 dark:text-surface-300">
                        {file.filename}
                      </span>
                      {typeof file.size === 'number' && (
                        <span className="text-muted text-[10px] shrink-0 tabular-nums">
                          {file.size >= 1024 * 1024
                            ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                            : `${Math.max(1, Math.round(file.size / 1024))} KB`}
                        </span>
                      )}
                      {file.lastModified && (
                        <span className="text-muted text-[10px] shrink-0 hidden sm:inline tabular-nums">
                          {new Date(file.lastModified).toLocaleString()}
                        </span>
                      )}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleDownload(file.filename)}
                          disabled={downloading === file.filename}
                          className="p-1.5 rounded-md text-muted hover:text-accent-600 dark:hover:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-950/30 disabled:opacity-50 transition-colors"
                          title="下载并恢复"
                          aria-label={`下载并恢复 ${file.filename}`}
                        >
                          {downloading === file.filename ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Download size={13} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(file.filename)}
                          disabled={deleting === file.filename}
                          className="p-1.5 rounded-md text-muted hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
                          title="删除"
                          aria-label={`删除 ${file.filename}`}
                        >
                          {deleting === file.filename ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 最近上传状态 */}
          {config.lastBackupStatus && config.lastBackupStatus !== 'idle' && (
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
              <span className="shrink-0">最近上传</span>
              <span
                className={`truncate text-right ${
                  config.lastBackupStatus === 'success'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {config.lastBackupStatus === 'success'
                  ? `${config.lastRemoteFile ?? '成功'}${
                      config.lastBackupAt
                        ? ` · ${new Date(config.lastBackupAt).toLocaleString()}`
                        : ''
                    }`
                  : config.lastBackupError ?? '失败'}
              </span>
            </div>
          )}
        </>
      )}
    </>
  )
}
