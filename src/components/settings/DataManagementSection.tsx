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
  RotateCcw
} from 'lucide-react'
import { useConversationStore } from '../../stores/conversation-store'
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

// ==================== 状态通知组件 ====================

interface StatusMessage {
  type: 'success' | 'error' | 'info'
  text: string
}

function StatusBanner({ message, onClose }: { message: StatusMessage; onClose: () => void }) {
  const colors = {
    success: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300',
    error: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300',
    info: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300'
  }
  const Icon = message.type === 'success' ? CheckCircle2 : message.type === 'error' ? AlertCircle : AlertCircle

  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm ${colors[message.type]} animate-fade-in`}>
      <Icon size={16} />
      <span className="flex-1">{message.text}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100">✕</button>
    </div>
  )
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
  const { conversations, getMessages } = useConversationStore()
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
      setStatus({ type: 'error', text: '请至少选择一个对话' })
      return
    }

    setExporting(true)
    try {
      const items = conversations
        .filter((c) => selectedIds.has(c.id))
        .map((c) => ({ conversation: c, messages: getMessages(c.id) }))

      if (items.length === 1) {
        const result = exportConversation(items[0].conversation, items[0].messages, format)
        await window.electronAPI.file.saveFile(result.fileName, result.content)
        setStatus({ type: 'success', text: `已导出 1 个对话为 ${format.toUpperCase()} 格式` })
      } else {
        const result = batchExportConversations(items, format)
        await window.electronAPI.file.saveFile(result.fileName, result.content)
        setStatus({ type: 'success', text: `已批量导出 ${items.length} 个对话` })
      }
    } catch (e) {
      setStatus({ type: 'error', text: `导出失败: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setExporting(false)
    }
  }

  const formatOptions: { key: ExportFormat; label: string; icon: typeof FileText; desc: string }[] = [
    { key: 'markdown', label: 'Markdown', icon: FileText, desc: '可读性强，适合归档分享' },
    { key: 'json', label: 'JSON', icon: FileJson, desc: '结构化数据，兼容性好' },
    { key: 'html', label: 'HTML', icon: FileCode, desc: '独立页面，适合打印' }
  ]

  return (
    <SectionCard>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 flex items-center gap-2">
            <Download size={16} className="text-blue-500" />
            对话导出
          </h3>
          <p className="text-xs text-muted mt-0.5">
            导出对话记录为 Markdown / JSON / HTML 格式
          </p>
        </div>
      </div>

      {status && <StatusBanner message={status} onClose={() => setStatus(null)} />}

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
                <div className="text-[10px] opacity-70">{opt.desc}</div>
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
            全选 ({selectedIds.size}/{conversations.length})
          </label>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="text-center text-xs text-muted py-6">暂无对话记录</div>
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
                <span className="text-muted text-[10px]">{conv.messageCount} 条</span>
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
        导出选中的对话 ({selectedIds.size})
      </button>
    </SectionCard>
  )
}

// ==================== 2. 备份与恢复 ====================

function BackupSection() {
  const [backing, setBacking] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [progress, setProgress] = useState('')
  const [status, setStatus] = useState<StatusMessage | null>(null)

  const handleBackup = async () => {
    setBacking(true)
    setProgress('准备备份...')
    try {
      const onProgress: BackupProgressCallback = (stage) => setProgress(stage)
      const blob = await createBackup(onProgress)
      const dateStr = new Date().toISOString().slice(0, 10)
      // 将 blob 转为 number 数组传给 IPC
      const arrayBuffer = await blob.arrayBuffer()
      const data = Array.from(new Uint8Array(arrayBuffer))
      const result = await window.electronAPI.file.saveZip(`backup-${dateStr}.zip`, data)
      if (result.success) {
        setStatus({ type: 'success', text: `备份已保存到: ${result.filePath}` })
      } else if (result.error !== '用户取消') {
        setStatus({ type: 'error', text: `保存失败: ${result.error}` })
      }
    } catch (e) {
      setStatus({ type: 'error', text: `备份失败: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setBacking(false)
      setProgress('')
    }
  }

  const handleRestore = async () => {
    setRestoring(true)
    setProgress('选择备份文件...')
    try {
      const openResult = await window.electronAPI.file.openFile([
        { name: 'ZIP 备份文件', extensions: ['zip'] }
      ])

      if (!openResult.success || !openResult.data) {
        if (openResult.error !== '用户取消') {
          setStatus({ type: 'error', text: `打开文件失败: ${openResult.error}` })
        }
        setRestoring(false)
        setProgress('')
        return
      }

      // 先检查备份摘要
      const buffer = new Uint8Array(openResult.data).buffer
      const summary = await getBackupSummary(buffer)
      if (!summary) {
        setStatus({ type: 'error', text: '无法识别备份文件格式' })
        setRestoring(false)
        setProgress('')
        return
      }

      const confirmed = confirm(
        `即将从备份恢复数据：\n\n` +
        `备份时间: ${summary.exportedAt}\n` +
        `版本: ${summary.version}\n` +
        `包含数据: ${summary.localStorageKeys.join(', ')}\n\n` +
        `此操作会覆盖当前数据，确定继续吗？`
      )

      if (!confirmed) {
        setRestoring(false)
        setProgress('')
        return
      }

      setProgress('正在恢复...')
      const onProgress: BackupProgressCallback = (stage) => setProgress(stage)
      const result = await restoreFromBackup(buffer, {}, onProgress)

      if (result.success) {
        setStatus({ type: 'success', text: '恢复成功！建议重启应用以加载新数据。' })
      } else {
        setStatus({ type: 'error', text: `恢复完成但有错误: ${result.errors.join('; ')}` })
      }
    } catch (e) {
      setStatus({ type: 'error', text: `恢复失败: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setRestoring(false)
      setProgress('')
    }
  }

  return (
    <SectionCard>
      <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 flex items-center gap-2 mb-1">
        <HardDrive size={16} className="text-violet-500" />
        完整备份与恢复
      </h3>
      <p className="text-xs text-muted mb-4">
        打包所有设置、Agent、提示词、知识库数据为 .zip 文件，支持完整恢复
      </p>

      {status && <StatusBanner message={status} onClose={() => setStatus(null)} />}

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
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm border border-violet-200 dark:border-violet-800/60 text-violet-600 dark:text-violet-400 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50 transition-colors"
        >
          {backing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          创建备份
        </button>
        <button
          onClick={handleRestore}
          disabled={restoring}
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm border border-violet-200 dark:border-violet-800/60 text-violet-600 dark:text-violet-400 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50 transition-colors"
        >
          {restoring ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          恢复备份
        </button>
      </div>
    </SectionCard>
  )
}

// ==================== 3. 缓存管理 ====================

function CacheSection() {
  const [regions, setRegions] = useState<CacheRegion[]>([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

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
        console.error('加载缓存统计失败:', e)
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
    const confirmed = confirm(
      `确定要清除「${region.name}」吗？\n\n` +
      `当前占用: ${formatBytes(region.sizeBytes)} · ${region.recordCount} 条记录\n` +
      `此操作不可恢复。`
    )
    if (!confirmed) return

    setClearing(region.key)
    try {
      await clearCache(region.key)
      setStatus({ type: 'success', text: `已清除「${region.name}」` })
      await loadStats()
    } catch (e) {
      setStatus({ type: 'error', text: `清除失败: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setClearing(null)
    }
  }

  const totalSize = regions.reduce((sum, r) => sum + r.sizeBytes, 0)

  return (
    <SectionCard>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 flex items-center gap-2">
          <Database size={16} className="text-amber-500" />
          缓存管理
        </h3>
        <button
          onClick={loadStats}
          disabled={loading}
          className="text-xs text-muted hover:text-surface-600 dark:hover:text-surface-300 flex items-center gap-1"
        >
          <RotateCcw size={12} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {/* 总体统计 */}
      <div className="flex items-center gap-4 mb-4">
        <p className="text-xs text-muted">
          缓存总量: <span className="font-medium text-surface-600 dark:text-surface-300">{formatBytes(totalSize)}</span>
        </p>
        {storageEstimate && (
          <p className="text-xs text-muted">
            浏览器用量: <span className="font-medium">{formatBytes(storageEstimate.usage)}</span>
            {' / '}
            <span>{formatBytes(storageEstimate.quota)}</span>
          </p>
        )}
      </div>

      {status && <StatusBanner message={status} onClose={() => setStatus(null)} />}

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
                {region.recordCount} 条
              </div>
            </div>
            {region.clearable && (
              <button
                onClick={() => handleClear(region)}
                disabled={clearing === region.key || region.sizeBytes === 0}
                className="flex-shrink-0 p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-30 transition-colors"
                title={`清除${region.name}`}
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
            加载中...
          </div>
        )}
      </div>
    </SectionCard>
  )
}

// ==================== 4. 隐私清洗 ====================

function PrivacySection() {
  const [summary, setSummary] = useState<SensitiveDataSummary | null>(null)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [showTimeRange, setShowTimeRange] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [rangePreview, setRangePreview] = useState<Array<{ id: string; title: string; createdAt: number; messageCount: number }>>([])

  // 加载敏感数据摘要
  const loadSummary = useCallback(() => {
    setSummary(scanSensitiveData())
  }, [])

  useEffect(() => { loadSummary() }, [loadSummary])

  // 清除 API Key
  const handleClearApiKeys = () => {
    const count = (summary?.providersWithKey ?? 0) + (summary?.hasGlobalApiKey ? 1 : 0)
    if (count === 0) {
      setStatus({ type: 'info', text: '没有发现 API Key' })
      return
    }
    const confirmed = confirm(
      `将清除以下位置的 API Key：\n\n` +
      `- 全局配置${summary?.hasGlobalApiKey ? ' (已设置)' : ''}\n` +
      `- ${summary?.providersWithKey ?? 0} 个 AI Provider\n\n` +
      `确定继续吗？`
    )
    if (!confirmed) return

    const cleared = clearAllApiKeys()
    setStatus({ type: 'success', text: `已清除 ${cleared} 个 API Key` })
    loadSummary()
  }

  // 清除 MCP 凭据
  const handleClearMCP = () => {
    if (!summary?.mcpServerCount) {
      setStatus({ type: 'info', text: '没有 MCP 服务器配置' })
      return
    }
    const confirmed = confirm(`将清除 ${summary.mcpServerCount} 个 MCP 服务器的认证凭据，确定吗？`)
    if (!confirmed) return

    const cleared = clearMCPCredentials()
    setStatus({ type: 'success', text: `已清除 ${cleared} 个 MCP 凭据字段` })
    loadSummary()
  }

  // 预览时间范围内的对话
  const handlePreviewRange = () => {
    if (!startDate || !endDate) {
      setStatus({ type: 'error', text: '请选择开始和结束日期' })
      return
    }
    const range: TimeRange = {
      start: new Date(startDate).getTime(),
      end: new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1
    }
    const items = getConversationsInTimeRange(range)
    setRangePreview(items)
    if (items.length === 0) {
      setStatus({ type: 'info', text: '该时间段内没有对话记录' })
    }
  }

  // 按时间范围删除对话
  const handleDeleteByRange = () => {
    if (!startDate || !endDate) return
    if (rangePreview.length === 0) {
      handlePreviewRange()
      return
    }

    const confirmed = confirm(
      `将删除 ${startDate} 至 ${endDate} 期间的 ${rangePreview.length} 个对话，此操作不可恢复，确定吗？`
    )
    if (!confirmed) return

    const range: TimeRange = {
      start: new Date(startDate).getTime(),
      end: new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1
    }
    const deleted = deleteConversationsByTimeRange(range)
    setStatus({ type: 'success', text: `已删除 ${deleted} 个对话` })
    setRangePreview([])
    loadSummary()
  }

  // 删除所有对话
  const handleDeleteAll = () => {
    if (!summary?.totalConversations) {
      setStatus({ type: 'info', text: '没有对话记录' })
      return
    }
    const confirmed = confirm(
      `将删除全部 ${summary.totalConversations} 个对话（${summary.totalMessages} 条消息），此操作不可恢复！\n\n确定继续吗？`
    )
    if (!confirmed) return

    // 二次确认
    const confirmed2 = confirm('最终确认：真的要删除所有对话吗？')
    if (!confirmed2) return

    const deleted = deleteAllConversations()
    setStatus({ type: 'success', text: `已删除 ${deleted} 个对话` })
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
    <SectionCard className="border-danger-200/40 dark:border-danger-800/20">
      <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 flex items-center gap-2 mb-1">
        <Shield size={16} className="text-red-500" />
        隐私清洗
      </h3>
      <p className="text-xs text-muted mb-4">
        一键清除敏感信息，保护您的隐私安全
      </p>

      {status && <StatusBanner message={status} onClose={() => setStatus(null)} />}

      {/* 敏感数据概览 */}
      {summary && (
        <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
          <div className="px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-900/50">
            <div className="text-muted">API Key</div>
            <div className="font-medium text-surface-700 dark:text-surface-300">
              {summary.hasGlobalApiKey || summary.providersWithKey > 0
                ? `${(summary.hasGlobalApiKey ? 1 : 0) + summary.providersWithKey} 个已设置`
                : '未设置'}
            </div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-900/50">
            <div className="text-muted">对话记录</div>
            <div className="font-medium text-surface-700 dark:text-surface-300">
              {summary.totalConversations} 个 · {summary.totalMessages} 条消息
            </div>
          </div>
        </div>
      )}

      {/* 清除 API Key */}
      <div className="flex items-center justify-between py-2.5 border-b border-surface-100 dark:border-surface-800">
        <div>
          <div className="text-xs font-medium text-surface-700 dark:text-surface-300">清除所有 API Key</div>
          <div className="text-[11px] text-muted">全局配置 + 所有 AI Provider 的密钥</div>
        </div>
        <button
          onClick={handleClearApiKeys}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 border border-red-200 dark:border-red-800/60 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <EyeOff size={12} /> 清除
        </button>
      </div>

      {/* 清除 MCP 凭据 */}
      <div className="flex items-center justify-between py-2.5 border-b border-surface-100 dark:border-surface-800">
        <div>
          <div className="text-xs font-medium text-surface-700 dark:text-surface-300">清除 MCP 服务器凭据</div>
          <div className="text-[11px] text-muted">MCP 服务器环境变量中的 token/key/secret</div>
        </div>
        <button
          onClick={handleClearMCP}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 border border-red-200 dark:border-red-800/60 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <EyeOff size={12} /> 清除
        </button>
      </div>

      {/* 按时间段删除对话 */}
      <div className="py-2.5 border-b border-surface-100 dark:border-surface-800">
        <button
          onClick={() => setShowTimeRange(!showTimeRange)}
          className="flex items-center gap-1 text-xs font-medium text-surface-700 dark:text-surface-300 w-full"
        >
          {showTimeRange ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          按时间段删除对话
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
              <span className="text-xs text-muted">至</span>
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
                <Eye size={12} /> 预览
              </button>
              {rangePreview.length > 0 && (
                <button
                  onClick={handleDeleteByRange}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-500 border border-red-200 dark:border-red-800/60 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <Trash2 size={12} /> 删除 {rangePreview.length} 个对话
                </button>
              )}
            </div>

            {rangePreview.length > 0 && (
              <div className="max-h-32 overflow-y-auto border border-surface-200 dark:border-surface-700 rounded-lg">
                {rangePreview.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-3 py-1.5 text-xs border-b border-surface-100 dark:border-surface-800 last:border-b-0">
                    <span className="truncate flex-1">{item.title}</span>
                    <span className="text-muted ml-2">{new Date(item.createdAt).toLocaleDateString()}</span>
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
          <div className="text-xs font-medium text-danger-600 dark:text-danger-400">清除所有对话</div>
          <div className="text-[11px] text-muted">删除全部对话记录和消息，不可恢复</div>
        </div>
        <button
          onClick={handleDeleteAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-danger-500 border border-danger-200 dark:border-danger-800/60 rounded-xl hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-colors"
        >
          <Trash2 size={12} /> 清除全部
        </button>
      </div>
    </SectionCard>
  )
}

// ==================== 主组件 ====================

interface DataManagementSectionProps {
  onNavigateToSection?: (section: string) => void
}

export function DataManagementSection({ onNavigateToSection }: DataManagementSectionProps) {
  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <Database size={20} className="text-accent-500" />
          数据管理
        </h2>
        <p className="text-sm text-muted mt-1">
          管理应用数据，包括对话导出、备份恢复、缓存清理和隐私保护
        </p>
      </div>

      {/* 知识库快捷入口 */}
      <SectionCard>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300">知识库管理</h3>
            <p className="text-xs text-muted mt-0.5">查看和管理已上传的知识库文件</p>
          </div>
          <button
            onClick={() => onNavigateToSection?.('knowledge-base')}
            className="flex items-center gap-2 px-4 py-2 text-sm text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800/60 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
          >
            <Database size={14} /> 管理知识库
          </button>
        </div>
      </SectionCard>

      {/* 四大功能板块 */}
      <ExportSection />
      <BackupSection />
      <CacheSection />
      <PrivacySection />
    </div>
  )
}
