import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Database,
  Download,
  Upload,
  HardDrive,
  Shield,
  Trash2,
  FileText,
  FileCode,
  FileJson,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  RotateCcw,
  Zap
} from 'lucide-react'
import { useConversationStore } from '../../stores/conversation-store'
import { conversationDb } from '../../services/conversation-db'
import {
  exportConversation,
  batchExportConversations,
  type ExportFormat
} from '../../services/export-service'
import {
  createBackup,
  restoreFromBackup,
  getBackupSummary,
  downloadBlob,
  type BackupProgressCallback
} from '../../services/backup-service'
import {
  getCacheStatsStream,
  clearCache,
  formatBytes,
  getStorageEstimate,
  type CacheRegion
} from '../../services/cache-service'
import {
  scanSensitiveData,
  clearAllApiKeys,
  clearMCPCredentials,
  getConversationsInTimeRange,
  deleteConversationsByTimeRange,
  deleteAllConversations,
  formatDateForInput,
  type SensitiveDataSummary,
  type TimeRange
} from '../../services/privacy-service'
import { memoryService } from '../../services/memory-service'
import { SettingsHeader, useConfirmDialog, DangerZone, StatusFeedback } from './ui'
import { WebDAVSection } from './WebDAVSection'
import { useAppTranslation } from '@/i18n/hooks'

// ==================== 状态消息类型 ====================

interface StatusMessage {
  type: 'success' | 'error' | 'info'
  text: string
}

// ==================== 通用卡片包装 ====================

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 ${className}`}>
      {children}
    </div>
  )
}

// ==================== 1. 对话导出 ====================

function ExportSection() {
  const { conversations } = useConversationStore()
  const { t } = useAppTranslation()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [format, setFormat] = useState<ExportFormat>('markdown')
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [exporting, setExporting] = useState(false)

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === conversations.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(conversations.map((c) => c.id)))
    }
  }

  const handleExport = async () => {
    if (selectedIds.size === 0) {
      setStatus({ type: 'error', text: t('settings.data.exportSelectConversation') })
      return
    }

    setExporting(true)
    try {
      // ⚡ 逐个从 IDB 加载消息（不再依赖内存中的消息缓存）
      const selectedConversations = conversations.filter((c) => selectedIds.has(c.id))
      const items = []
      for (const conv of selectedConversations) {
        const messages = await conversationDb.getMessagesByConversationId(conv.id)
        items.push({ conversation: conv, messages })
      }

      if (items.length === 1) {
        const result = exportConversation(items[0].conversation, items[0].messages, format)
        await window.electronAPI.file.saveFile(result.fileName, result.content)
        setStatus({
          type: 'success',
          text: t('settings.data.exportSingleSuccess', { format: format.toUpperCase() })
        })
      } else {
        const result = batchExportConversations(items, format)
        await window.electronAPI.file.saveFile(result.fileName, result.content)
        setStatus({
          type: 'success',
          text: t('settings.data.exportBatchSuccess', { count: items.length })
        })
      }
    } catch (e) {
      setStatus({
        type: 'error',
        text: t('settings.data.exportFailed', {
          error: e instanceof Error ? e.message : String(e)
        })
      })
    } finally {
      setExporting(false)
    }
  }

  const formatOptions: { key: ExportFormat; label: string; icon: typeof FileText; descriptionKey: string }[] = [
    { key: 'markdown', label: 'Markdown', icon: FileText, descriptionKey: 'settings.data.exportMarkdownDescription' },
    { key: 'json', label: 'JSON', icon: FileJson, descriptionKey: 'settings.data.exportJsonDescription' },
    { key: 'html', label: 'HTML', icon: FileCode, descriptionKey: 'settings.data.exportHtmlDescription' }
  ]

  return (
    <SectionCard>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 flex items-center gap-2">
            <Download size={16} className="text-blue-500" />
            {t('settings.data.exportConversationsTitle')}
          </h3>
          <p className="text-xs text-muted mt-0.5">
            {t('settings.data.exportConversationsDescription')}
          </p>
        </div>
      </div>

      {status && (
        <StatusFeedback
          type={status.type}
          message={status.text}
          onClose={() => setStatus(null)}
        />
      )}

      {/* 格式选择 */}
      <div className="flex gap-2 mt-3 mb-3">
        {formatOptions.map((opt) => {
          const Icon = opt.icon
          return (
            <button
              key={opt.key}
              onClick={() => setFormat(opt.key)}
              className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${
                format === opt.key
                  ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                  : 'border-surface-200 dark:border-surface-700 text-muted hover:border-surface-300 dark:hover:border-surface-600'
              }`}
            >
              <Icon size={14} />
              <div className="text-left">
                <div className="font-medium">{opt.label}</div>
                <div className="text-[10px] opacity-70">{t(opt.descriptionKey)}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* 对话选择列表 */}
      <div className="border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden mb-3">
        <div className="flex items-center justify-between px-3 py-2 bg-surface-50 dark:bg-surface-900/50 border-b border-surface-200 dark:border-surface-700">
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.size === conversations.length && conversations.length > 0}
              onChange={selectAll}
              className="rounded"
            />
            {t('settings.data.selectAll', {
              selected: selectedIds.size,
              total: conversations.length
            })}
          </label>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="text-center text-xs text-muted py-6">{t('conversation.noConversations')}</div>
          ) : (
            conversations.map((conv) => (
              <label
                key={conv.id}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-50 dark:hover:bg-surface-900/30 cursor-pointer text-xs border-b border-surface-100 dark:border-surface-800 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(conv.id)}
                  onChange={() => toggleSelect(conv.id)}
                  className="rounded"
                />
                <span className="flex-1 truncate">{conv.title}</span>
                <span className="text-muted text-[10px]">
                  {t('settings.data.messageCount', { count: conv.messageCount })}
                </span>
              </label>
            ))
          )}
        </div>
      </div>

      <button
        onClick={handleExport}
        disabled={exporting || selectedIds.size === 0}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
      >
        {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {t('settings.data.exportSelected', { count: selectedIds.size })}
      </button>
    </SectionCard>
  )
}

// ==================== 2. 备份与恢复 ====================

function BackupSection() {
  const { t } = useAppTranslation()
  const [backing, setBacking] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [progress, setProgress] = useState('')
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const { confirm, Dialog } = useConfirmDialog()

  const localizeProgress = (stage: string) => {
    const settingPrefix = '备份设置: '
    if (stage.startsWith(settingPrefix)) {
      return t('settings.data.backupSettingsProgress', { key: stage.slice(settingPrefix.length) })
    }

    const progressKeys: Record<string, string> = {
      '备份知识库数据...': 'settings.data.backingUpKnowledgeBase',
      '备份分析报告...': 'settings.data.backingUpReports',
      '备份 Skills 数据...': 'settings.data.backingUpSkills',
      '备份对话消息...': 'settings.data.backingUpConversations',
      '生成备份文件...': 'settings.data.generatingBackupFile',
      '备份完成': 'settings.data.backupComplete',
      '解析备份文件...': 'settings.data.parsingBackupFile',
      '恢复设置数据...': 'settings.data.restoringSettings',
      '恢复知识库数据...': 'settings.data.restoringKnowledgeBase',
      '恢复分析报告...': 'settings.data.restoringReports',
      '恢复 Skills 数据...': 'settings.data.restoringSkills',
      '恢复对话消息...': 'settings.data.restoringConversations',
      '恢复完成': 'settings.data.restoreComplete'
    }

    return progressKeys[stage] ? t(progressKeys[stage]) : stage
  }

  const handleBackup = async () => {
    setBacking(true)
    setProgress(t('settings.data.preparingBackup'))
    try {
      const onProgress: BackupProgressCallback = (stage) => setProgress(localizeProgress(stage))
      const blob = await createBackup(onProgress)
      const dateStr = new Date().toISOString().slice(0, 10)
      // 将 blob 转为 number 数组传给 IPC
      const arrayBuffer = await blob.arrayBuffer()
      const data = Array.from(new Uint8Array(arrayBuffer))
      const result = await window.electronAPI.file.saveZip(`backup-${dateStr}.zip`, data)
      if (result.success) {
        setStatus({
          type: 'success',
          text: t('settings.data.backupSaved', { path: result.filePath ?? '' })
        })
      } else if (result.error !== '用户取消') {
        setStatus({
          type: 'error',
          text: t('settings.data.saveFailed', { error: result.error ?? '' })
        })
      }
    } catch (e) {
      setStatus({
        type: 'error',
        text: t('settings.data.backupFailed', {
          error: e instanceof Error ? e.message : String(e)
        })
      })
    } finally {
      setBacking(false)
      setProgress('')
    }
  }

  const handleRestore = async () => {
    setRestoring(true)
    setProgress(t('settings.data.selectBackupFile'))
    try {
      const openResult = await window.electronAPI.file.openFile([
        { name: t('settings.data.zipBackupFile'), extensions: ['zip'] }
      ])

      if (!openResult.success || !openResult.data) {
        if (openResult.error !== '用户取消') {
          setStatus({
            type: 'error',
            text: t('settings.data.openFileFailed', { error: openResult.error ?? '' })
          })
        }
        setRestoring(false)
        setProgress('')
        return
      }

      // 先检查备份摘要
      const buffer = new Uint8Array(openResult.data).buffer
      const summary = await getBackupSummary(buffer)
      if (!summary) {
        setStatus({ type: 'error', text: t('settings.data.unrecognizedBackupFormat') })
        setRestoring(false)
        setProgress('')
        return
      }

      const ok = await confirm({
        title: t('settings.data.restoreBackup'),
        message: t('settings.data.restoreBackupConfirm', {
          exportedAt: summary.exportedAt,
          version: summary.version,
          data: summary.localStorageKeys.join(', ')
        }),
        confirmLabel: t('settings.data.restore'),
        variant: 'warning',
      })

      if (!ok) {
        setRestoring(false)
        setProgress('')
        return
      }

      setProgress(t('settings.data.restoringBackup'))
      const onProgress: BackupProgressCallback = (stage) => setProgress(localizeProgress(stage))
      const result = await restoreFromBackup(buffer, {}, onProgress)

      if (result.success) {
        setStatus({ type: 'success', text: t('settings.data.restoreSuccess') })
      } else {
        setStatus({
          type: 'error',
          text: t('settings.data.restoreCompletedWithErrors', { errors: result.errors.join('; ') })
        })
      }
    } catch (e) {
      setStatus({
        type: 'error',
        text: t('settings.data.restoreFailed', {
          error: e instanceof Error ? e.message : String(e)
        })
      })
    } finally {
      setRestoring(false)
      setProgress('')
    }
  }

  return (
    <SectionCard>
      <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 flex items-center gap-2 mb-1">
        <HardDrive size={16} className="text-accent-500" />
        {t('settings.data.backupRestoreTitle')}
      </h3>
      <p className="text-xs text-muted mb-4">
        {t('settings.data.backupRestoreDescription')}
      </p>

      {status && (
        <StatusFeedback
          type={status.type}
          message={status.text}
          onClose={() => setStatus(null)}
        />
      )}

      {progress && (
        <div className="flex items-center gap-2 px-3 py-2 mb-3 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
          <Loader2 size={12} className="animate-spin" />
          {progress}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleBackup}
          disabled={backing}
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm border border-accent-200 dark:border-accent-800/60 text-accent-600 dark:text-accent-400 rounded-xl hover:bg-accent-50 dark:hover:bg-accent-950/30 disabled:opacity-50 transition-colors"
        >
          {backing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {t('settings.data.createBackup')}
        </button>
        <button
          onClick={handleRestore}
          disabled={restoring}
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm border border-accent-200 dark:border-accent-800/60 text-accent-600 dark:text-accent-400 rounded-xl hover:bg-accent-50 dark:hover:bg-accent-950/30 disabled:opacity-50 transition-colors"
        >
          {restoring ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {t('settings.data.restoreBackup')}
        </button>
      </div>
      <Dialog />
    </SectionCard>
  )
}

// ==================== 3. 缓存管理 ====================

function CacheSection() {
  const { t } = useAppTranslation()
  const [regions, setRegions] = useState<CacheRegion[]>([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const { confirm, Dialog } = useConfirmDialog()

  const loadStats = useCallback(async () => {
    // 取消上一次未完成的流式加载
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // 先清空旧数据，立即进入加载态
    setRegions([])
    setLoading(true)

    try {
      // 并行发起存储配额查询（独立于逐条加载）
      getStorageEstimate().then((estimate) => {
        if (!controller.signal.aborted) setStorageEstimate(estimate)
      })

      // 逐条流式加载缓存区域
      for await (const region of getCacheStatsStream()) {
        if (controller.signal.aborted) break
        setRegions((prev) => [...prev, region])
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        console.error('Failed to load cache statistics:', e)
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadStats()
    return () => { abortRef.current?.abort() }
  }, [loadStats])

  const handleClear = async (region: CacheRegion) => {
    const ok = await confirm({
      title: t('settings.data.clearCache'),
      message: t('settings.data.clearCacheConfirm', {
        name: region.name,
        size: formatBytes(region.sizeBytes),
        count: region.recordCount
      }),
      confirmLabel: t('common.clear'),
      variant: 'warning',
    })
    if (!ok) return

    setClearing(region.key)
    try {
      await clearCache(region.key)
      setStatus({ type: 'success', text: t('settings.data.cacheCleared', { name: region.name }) })
      await loadStats()
    } catch (e) {
      setStatus({
        type: 'error',
        text: t('settings.data.clearFailed', {
          error: e instanceof Error ? e.message : String(e)
        })
      })
    } finally {
      setClearing(null)
    }
  }

  const totalSize = regions.reduce((sum, r) => sum + r.sizeBytes, 0)

  return (
    <SectionCard>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 flex items-center gap-2">
          <Database size={16} className="text-accent-500" />
          {t('settings.cacheManagement')}
        </h3>
        <button
          onClick={loadStats}
          disabled={loading}
          className="text-xs text-muted hover:text-surface-600 dark:hover:text-surface-300 flex items-center gap-1"
        >
          <RotateCcw size={12} className={loading ? 'animate-spin' : ''} />
          {t('common.refresh')}
        </button>
      </div>

      {/* 总体统计 */}
      <div className="flex items-center gap-4 mb-4">
        <p className="text-xs text-muted">
          {t('settings.data.totalCache')}: <span className="font-medium text-surface-600 dark:text-surface-300">{formatBytes(totalSize)}</span>
        </p>
        {storageEstimate && (
          <p className="text-xs text-muted">
            {t('settings.data.browserUsage')}: <span className="font-medium">{formatBytes(storageEstimate.usage)}</span>
            {' / '}
            <span>{formatBytes(storageEstimate.quota)}</span>
          </p>
        )}
      </div>

      {status && (
        <StatusFeedback
          type={status.type}
          message={status.text}
          onClose={() => setStatus(null)}
        />
      )}

      {/* 缓存区域列表 */}
      <div className="space-y-2 mt-3">
        {regions.map((region) => (
          <div
            key={region.key}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-surface-200/80 dark:border-surface-700/60 hover:bg-surface-50 dark:hover:bg-surface-900/30"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-surface-700 dark:text-surface-300">
                  {region.name}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-800 text-muted">
                  {region.storage}
                </span>
              </div>
              <p className="text-[11px] text-muted mt-0.5">{region.description}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs font-medium text-surface-600 dark:text-surface-300">
                {formatBytes(region.sizeBytes)}
              </div>
              <div className="text-[10px] text-muted">
                {t('settings.data.recordCount', { count: region.recordCount })}
              </div>
            </div>
            {region.clearable && (
              <button
                onClick={() => handleClear(region)}
                disabled={clearing === region.key || region.sizeBytes === 0}
                className="flex-shrink-0 p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-30 transition-colors"
                title={t('settings.data.clearCacheItem', { name: region.name })}
              >
                {clearing === region.key ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center justify-center py-4 text-xs text-muted">
            <Loader2 size={14} className="animate-spin mr-2" />
            {t('common.loading')}
          </div>
        )}
      </div>
      <Dialog />
    </SectionCard>
  )
}

// ==================== 4. 隐私清洗 ====================

function PrivacySection() {
  const { t, i18n } = useAppTranslation()
  const [summary, setSummary] = useState<SensitiveDataSummary | null>(null)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [showTimeRange, setShowTimeRange] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [rangePreview, setRangePreview] = useState<Array<{ id: string; title: string; createdAt: number; messageCount: number }>>([])
  const [memoryCount, setMemoryCount] = useState(0)
  const { confirm, Dialog } = useConfirmDialog()

  // 加载敏感数据摘要
  const loadSummary = useCallback(async () => {
    const data = await scanSensitiveData()
    setSummary(data)
    setMemoryCount(memoryService.countAll())
  }, [])

  useEffect(() => { loadSummary() }, [loadSummary])

  // 清除 API Key
  const handleClearApiKeys = async () => {
    const count = (summary?.providersWithKey ?? 0) + (summary?.hasGlobalApiKey ? 1 : 0)
    if (count === 0) {
      setStatus({ type: 'info', text: t('settings.data.noApiKeys') })
      return
    }
    const ok = await confirm({
      title: t('settings.data.clearApiKeys'),
      message: t('settings.data.clearApiKeysConfirm', {
        globalConfigured: summary?.hasGlobalApiKey
          ? t('settings.data.configured')
          : '',
        providerCount: summary?.providersWithKey ?? 0
      }),
      confirmLabel: t('common.clear'),
      variant: 'danger',
    })
    if (!ok) return

    const cleared = clearAllApiKeys()
    setStatus({ type: 'success', text: t('settings.data.apiKeysCleared', { count: cleared }) })
    loadSummary()
  }

  // 清除 MCP 凭据
  const handleClearMCP = async () => {
    if (!summary?.mcpServerCount) {
      setStatus({ type: 'info', text: t('settings.data.noMcpServers') })
      return
    }
    const ok = await confirm({
      title: t('settings.data.clearMcpCredentials'),
      message: t('settings.data.clearMcpCredentialsConfirm', { count: summary.mcpServerCount }),
      confirmLabel: t('common.clear'),
      variant: 'danger',
    })
    if (!ok) return

    const cleared = clearMCPCredentials()
    setStatus({ type: 'success', text: t('settings.data.mcpCredentialsCleared', { count: cleared }) })
    loadSummary()
  }

  // 预览时间范围内的对话
  const handlePreviewRange = () => {
    if (!startDate || !endDate) {
      setStatus({ type: 'error', text: t('settings.data.selectDateRange') })
      return
    }
    const range: TimeRange = {
      start: new Date(startDate).getTime(),
      end: new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1
    }
    const items = getConversationsInTimeRange(range)
    setRangePreview(items)
    if (items.length === 0) {
      setStatus({ type: 'info', text: t('settings.data.noConversationsInRange') })
    }
  }

  // 按时间范围删除对话
  const handleDeleteByRange = async () => {
    if (!startDate || !endDate) return
    if (rangePreview.length === 0) {
      handlePreviewRange()
      return
    }

    const ok = await confirm({
      title: t('settings.data.deleteConversations'),
      message: t('settings.data.deleteConversationsInRangeConfirm', {
        startDate,
        endDate,
        count: rangePreview.length
      }),
      confirmLabel: t('common.delete'),
      variant: 'danger',
    })
    if (!ok) return

    const range: TimeRange = {
      start: new Date(startDate).getTime(),
      end: new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1
    }
    const deleted = await deleteConversationsByTimeRange(range)
    setStatus({ type: 'success', text: t('settings.data.conversationsDeleted', { count: deleted }) })
    setRangePreview([])
    loadSummary()
  }

  // 删除所有对话
  const handleDeleteAll = async () => {
    if (!summary?.totalConversations) {
      setStatus({ type: 'info', text: t('conversation.noConversations') })
      return
    }
    const ok = await confirm({
      title: t('settings.data.deleteAllConversations'),
      message: t('settings.data.deleteAllConversationsConfirm', {
        conversationCount: summary.totalConversations,
        messageCount: summary.totalMessages
      }),
      confirmLabel: t('settings.data.continue'),
      variant: 'danger',
    })
    if (!ok) return

    // 二次确认
    const ok2 = await confirm({
      title: t('settings.data.finalConfirmation'),
      message: t('settings.data.deleteAllConversationsFinalConfirm'),
      confirmLabel: t('settings.data.confirmDelete'),
      variant: 'danger',
    })
    if (!ok2) return

    const deleted = await deleteAllConversations()
    setStatus({ type: 'success', text: t('settings.data.conversationsDeleted', { count: deleted }) })
    setRangePreview([])
    loadSummary()
  }

  // 默认日期：最近7天
  useEffect(() => {
    const now = new Date()
    setEndDate(formatDateForInput(now.getTime()))
    setStartDate(formatDateForInput(now.getTime() - 7 * 24 * 60 * 60 * 1000))
  }, [])

  return (
    <DangerZone
      title={t('settings.privacyCleanup')}
      description={t('settings.data.privacyCleanupDescription')}
    >
      <div className="flex items-center gap-2 mb-4">
        <Shield size={16} className="text-danger-500" />
        <span className="text-xs text-muted">{t('settings.data.manageSensitiveData')}</span>
      </div>

      {status && (
        <StatusFeedback
          type={status.type}
          message={status.text}
          onClose={() => setStatus(null)}
        />
      )}

      {/* 敏感数据概览 */}
      {summary && (
        <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
          <div className="px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-900/50">
            <div className="text-muted">API Key</div>
            <div className="font-medium text-surface-700 dark:text-surface-300">
              {summary.hasGlobalApiKey || summary.providersWithKey > 0
                ? t('settings.data.configuredCount', {
                    count: (summary.hasGlobalApiKey ? 1 : 0) + summary.providersWithKey
                  })
                : t('settings.data.notConfigured')}
            </div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-900/50">
            <div className="text-muted">{t('settings.data.conversationRecords')}</div>
            <div className="font-medium text-surface-700 dark:text-surface-300">
              {t('settings.data.conversationMessageSummary', {
                conversationCount: summary.totalConversations,
                messageCount: summary.totalMessages
              })}
            </div>
          </div>
        </div>
      )}

      {/* 清除 API Key */}
      <div className="flex items-center justify-between py-2.5 border-b border-surface-100 dark:border-surface-800">
        <div>
          <div className="text-xs font-medium text-surface-700 dark:text-surface-300">{t('settings.data.clearAllApiKeys')}</div>
          <div className="text-[11px] text-muted">{t('settings.data.clearAllApiKeysDescription')}</div>
        </div>
        <button
          onClick={handleClearApiKeys}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-danger-500 border border-danger-200 dark:border-danger-800/60 rounded-lg hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-colors"
        >
          <EyeOff size={12} /> {t('common.clear')}
        </button>
      </div>

      {/* 清除 MCP 凭据 */}
      <div className="flex items-center justify-between py-2.5 border-b border-surface-100 dark:border-surface-800">
        <div>
          <div className="text-xs font-medium text-surface-700 dark:text-surface-300">{t('settings.data.clearMcpServerCredentials')}</div>
          <div className="text-[11px] text-muted">{t('settings.data.clearMcpServerCredentialsDescription')}</div>
        </div>
        <button
          onClick={handleClearMCP}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-danger-500 border border-danger-200 dark:border-danger-800/60 rounded-lg hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-colors"
        >
          <EyeOff size={12} /> {t('common.clear')}
        </button>
      </div>

      {/* 清除全部 Agent 长期记忆 */}
      <div className="flex items-center justify-between py-2.5 border-b border-surface-100 dark:border-surface-800">
        <div>
          <div className="text-xs font-medium text-surface-700 dark:text-surface-300">{t('settings.data.clearAllAgentMemories')}</div>
          <div className="text-[11px] text-muted">
            {t('settings.data.clearAllAgentMemoriesDescription', { count: memoryCount })}
          </div>
        </div>
        <button
          onClick={async () => {
            if (memoryCount === 0) {
              setStatus({ type: 'info', text: t('settings.data.noAgentMemories') })
              return
            }
            const ok = await confirm({
              title: t('settings.data.clearAllAgentMemories'),
              message: t('settings.data.clearAllAgentMemoriesConfirm', { count: memoryCount }),
              confirmLabel: t('common.clear'),
              variant: 'danger',
            })
            if (!ok) return
            const cleared = memoryService.clearAllMemories()
            setMemoryCount(0)
            setStatus({ type: 'success', text: t('settings.data.agentMemoriesCleared', { count: cleared }) })
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-danger-500 border border-danger-200 dark:border-danger-800/60 rounded-lg hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-colors"
        >
          <Trash2 size={12} /> {t('common.clear')}
        </button>
      </div>

      {/* 按时间段删除对话 */}
      <div className="py-2.5 border-b border-surface-100 dark:border-surface-800">
        <button
          onClick={() => setShowTimeRange(!showTimeRange)}
          className="flex items-center gap-1 text-xs font-medium text-surface-700 dark:text-surface-300 w-full"
        >
          {showTimeRange ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {t('settings.data.deleteConversationsByDateRange')}
        </button>

        {showTimeRange && (
          <div className="mt-2 pl-4 space-y-2 animate-fade-in">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900"
              />
              <span className="text-xs text-muted">{t('settings.data.to')}</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handlePreviewRange}
                className="flex items-center gap-1 px-3 py-1.5 text-xs border border-surface-200 dark:border-surface-700 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-900/50 transition-colors"
              >
                <Eye size={12} /> {t('settings.data.preview')}
              </button>
              {rangePreview.length > 0 && (
                <button
                  onClick={handleDeleteByRange}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-danger-500 border border-danger-200 dark:border-danger-800/60 rounded-lg hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-colors"
                >
                  <Trash2 size={12} /> {t('settings.data.deleteConversationCount', { count: rangePreview.length })}
                </button>
              )}
            </div>

            {rangePreview.length > 0 && (
              <div className="max-h-32 overflow-y-auto border border-surface-200 dark:border-surface-700 rounded-lg">
                {rangePreview.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-3 py-1.5 text-xs border-b border-surface-100 dark:border-surface-800 last:border-b-0">
                    <span className="truncate flex-1">{item.title}</span>
                    <span className="text-muted ml-2">
                      {new Date(item.createdAt).toLocaleDateString(i18n.resolvedLanguage ?? i18n.language)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 清除所有对话 */}
      <div className="flex items-center justify-between py-2.5 mt-1">
        <div>
          <div className="text-xs font-medium text-danger-600 dark:text-danger-400">{t('settings.data.clearAllConversations')}</div>
          <div className="text-[11px] text-muted">{t('settings.data.clearAllConversationsDescription')}</div>
        </div>
        <button
          onClick={handleDeleteAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-danger-500 border border-danger-200 dark:border-danger-800/60 rounded-xl hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-colors"
        >
          <Trash2 size={12} /> {t('settings.data.clearAll')}
        </button>
      </div>
      <Dialog />
    </DangerZone>
  )
}

// ==================== 主组件 ====================

interface DataManagementSectionProps {
  onNavigateToSection?: (section: string) => void
}

export function DataManagementSection({ onNavigateToSection }: DataManagementSectionProps) {
  const { t } = useAppTranslation()

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <SettingsHeader
        icon={Database}
        title={t('settings.dataManagement')}
        description={t('settings.data.dataManagementDescription')}
      />

      {/* 知识库快捷入口 */}
      <SectionCard>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300">{t('settings.data.knowledgeBaseManagement')}</h3>
            <p className="text-xs text-muted mt-0.5">{t('settings.data.knowledgeBaseManagementDescription')}</p>
          </div>
          <button
            onClick={() => onNavigateToSection?.('knowledge-base')}
            className="flex items-center gap-2 px-4 py-2 text-sm text-accent-600 dark:text-accent-400 border border-accent-200 dark:border-accent-800/60 rounded-xl hover:bg-accent-50 dark:hover:bg-accent-950/30 transition-colors"
          >
            <Database size={14} /> {t('settings.data.manageKnowledgeBase')}
          </button>
        </div>
      </SectionCard>

      {/* Skills 快捷入口 */}
      <SectionCard>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 flex items-center gap-2">
              <Zap size={14} className="text-accent-500" />
              {t('settings.data.skillsManagement')}
            </h3>
            <p className="text-xs text-muted mt-0.5">{t('settings.data.skillsManagementDescription')}</p>
          </div>
          <button
            onClick={() => onNavigateToSection?.('skills')}
            className="flex items-center gap-2 px-4 py-2 text-sm text-accent-600 dark:text-accent-400 border border-accent-200 dark:border-accent-800/60 rounded-xl hover:bg-accent-50 dark:hover:bg-accent-950/30 transition-colors"
          >
            <Zap size={14} /> {t('settings.data.manageSkills')}
          </button>
        </div>
      </SectionCard>

      {/* 本地导出 / 备份 */}
      <ExportSection />
      <BackupSection />

      {/* WebDAV 云端备份：放在本地备份之后，降低首屏压迫感 */}
      <SectionCard>
        <WebDAVSection />
      </SectionCard>

      <CacheSection />
      <PrivacySection />
    </div>
  )
}
