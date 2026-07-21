import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  Database,
  Brain,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Zap,
  Globe,
  Server,
  Settings,
  Download,
  Scissors,
  Search,
  Type,
  SplitSquareVertical,
  Hash,
  AlertTriangle,
  Trash2,
  RotateCcw
} from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'
import { embeddingService } from '../../services/embedding-service'
import { knowledgeBaseService } from '../../services/knowledge-base-service'
import { useAppTranslation } from '@/i18n/hooks'
import type {
  EmbeddingEngineStatus,
  EmbeddingProviderConfig,
  EmbeddingProviderType,
  ChunkingMode,
  ChunkingConfig,
  RetrievalConfig
} from '../../types'
import {
  DEFAULT_LOCAL_MODEL_CONFIG,
  DEFAULT_OLLAMA_CONFIG,
  DEFAULT_OPENAI_API_CONFIG,
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_RETRIEVAL_CONFIG
} from '../../types'
import { SettingsHeader, SettingsSectionHeader, DangerZone, useConfirmDialog } from './ui'

export function KnowledgeBaseSettings() {
  const { t } = useAppTranslation()
  const {
    embeddingConfig, setEmbeddingConfig,
    chunkingConfig, setChunkingConfig,
    retrievalConfig, setRetrievalConfig
  } = useSettingsStore()

  const [engineStatus, setEngineStatus] = useState<EmbeddingEngineStatus>(
    embeddingService.getStatus()
  )
  const [showErrorDetail, setShowErrorDetail] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [migrationProgress, setMigrationProgress] = useState<{
    total: number; migrated: number; percentage: number
  } | null>(null)
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [rebuildProgress, setRebuildProgress] = useState<{
    current: number; total: number; phase: string
  } | null>(null)
  const [showRebuildConfirm, setShowRebuildConfirm] = useState(false)
  const { confirm, Dialog } = useConfirmDialog()

  // 订阅引擎状态变化；挂载时同步一次最新状态，避免拿到过期快照
  useEffect(() => {
    setEngineStatus(embeddingService.getStatus())
    const unsubscribe = embeddingService.onStatusChange(setEngineStatus)
    return unsubscribe
  }, [])

  // 等待 settings rehydrate 后自动 init，避免读到默认 tfidf 而跳过装载
  useEffect(() => {
    let cancelled = false

    const tryInit = (config: typeof embeddingConfig) => {
      if (cancelled) return
      if (config.type === 'tfidf') return
      const status = embeddingService.getStatus()
      if (status.modelReady || status.modelLoading) return
      // 设置页允许网络下载（用户已进入配置区；缓存命中则不会下载）
      void embeddingService.init(config, { allowNetworkDownload: true })
    }

    const persistApi = useSettingsStore.persist
    if (persistApi.hasHydrated()) {
      tryInit(useSettingsStore.getState().embeddingConfig)
      return () => {
        cancelled = true
      }
    }

    const unsub = persistApi.onFinishHydration(() => {
      tryInit(useSettingsStore.getState().embeddingConfig)
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  // 配置在页内切换后（非首次水合）也尝试对齐引擎
  useEffect(() => {
    if (!useSettingsStore.persist.hasHydrated()) return
    if (embeddingConfig.type === 'tfidf') return
    const status = embeddingService.getStatus()
    if (status.modelReady || status.modelLoading) return
    void embeddingService.init(embeddingConfig, { allowNetworkDownload: true })
  }, [embeddingConfig])

  // 监听模型就绪，自动启动渐进迁移
  useEffect(() => {
    if (engineStatus.modelReady) {
      knowledgeBaseService.startMigration()
      const interval = setInterval(async () => {
        const progress = await knowledgeBaseService.getMigrationProgress()
        setMigrationProgress(progress)
        if (progress.total > 0 && progress.migrated >= progress.total) {
          clearInterval(interval)
        }
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [engineStatus.modelReady])

  const handleLoadModel = useCallback(async () => {
    if (embeddingConfig.type !== 'tfidf') {
      await embeddingService.init(embeddingConfig, { allowNetworkDownload: true })
    }
  }, [embeddingConfig])

  const handleCopyError = useCallback(async () => {
    if (engineStatus.errorDetail) {
      try {
        await navigator.clipboard.writeText(engineStatus.errorDetail)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        const textarea = document.createElement('textarea')
        textarea.value = engineStatus.errorDetail
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    }
  }, [engineStatus.errorDetail])

  const handleRetry = useCallback(async () => {
    if (embeddingConfig.type !== 'tfidf') {
      await embeddingService.reinit(embeddingConfig)
    }
  }, [embeddingConfig])

  const handleProviderChange = useCallback(
    (providerType: EmbeddingProviderType) => {
      let newConfig: EmbeddingProviderConfig
      switch (providerType) {
        case 'tfidf': newConfig = { type: 'tfidf' }; break
        case 'local-model': newConfig = { ...DEFAULT_LOCAL_MODEL_CONFIG }; break
        case 'ollama': newConfig = { ...DEFAULT_OLLAMA_CONFIG }; break
        case 'openai-api': newConfig = { ...DEFAULT_OPENAI_API_CONFIG }; break
        default: return
      }
      setEmbeddingConfig(newConfig)
    },
    [setEmbeddingConfig]
  )

  const handleClearAll = useCallback(async () => {
    const ok = await confirm({
      title: t('knowledgeBase.clearKnowledgeBase'),
      message: t('knowledgeBase.clearKnowledgeBaseConfirm'),
      confirmLabel: t('knowledgeBase.confirmClear'),
      variant: 'danger',
    })
    if (!ok) return
    await knowledgeBaseService.clearAll()
    window.location.reload()
  }, [confirm, t])

  const handleRebuild = useCallback(async () => {
    setIsRebuilding(true)
    setShowRebuildConfirm(false)
    setRebuildProgress({ current: 0, total: 0, phase: 'clearing' })
    try {
      const result = await knowledgeBaseService.rebuildAllEmbeddings((progress) => {
        setRebuildProgress(progress)
      })
      console.log(`[KnowledgeBase] Rebuild complete: ${result.rebuilt}/${result.totalChunks} chunks, ${result.errors} errors`)
    } catch (error) {
      console.error('[KnowledgeBase] Rebuild failed:', error)
    } finally {
      setIsRebuilding(false)
    }
  }, [])

  const providerLabels = useMemo<Record<EmbeddingProviderType, string>>(() => ({
    tfidf: t('knowledgeBase.tfidfBasic'),
    'local-model': t('knowledgeBase.localModelTransformers'),
    ollama: t('knowledgeBase.ollamaLocal'),
    'openai-api': t('knowledgeBase.openaiCompatible')
  }), [t])

  const providerIcons: Record<EmbeddingProviderType, typeof Brain> = {
    tfidf: Zap,
    'local-model': Brain,
    ollama: Server,
    'openai-api': Globe
  }

  const chunkingModeLabel = useMemo<Record<ChunkingMode, string>>(() => ({
    character: t('knowledgeBase.byCharacter'),
    delimiter: t('knowledgeBase.byDelimiter'),
    token: t('knowledgeBase.byToken')
  }), [t])

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <SettingsHeader icon={Database} title={t('knowledgeBase.knowledgeBaseSettings')} description={t('knowledgeBase.knowledgeBaseSettingsDescription')} />

      {/* ===== 普通设置 ===== */}
      <div className="space-y-4">
        <SettingsSectionHeader title={t('knowledgeBase.generalSettings')} />

        {/* 语义引擎状态卡片 */}
        <SemanticEngineStatusCard
          status={engineStatus}
          config={embeddingConfig}
          showErrorDetail={showErrorDetail}
          setShowErrorDetail={setShowErrorDetail}
          copied={copied}
          onCopyError={handleCopyError}
          onRetry={handleRetry}
          onLoadModel={handleLoadModel}
          migrationProgress={migrationProgress}
          t={t}
        />

        {/* Embedding 提供者选择 */}
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Settings size={14} className="text-muted" />
            <span className="text-sm font-medium text-surface-800 dark:text-surface-200">
              {t('knowledgeBase.embeddingProvider')}
            </span>
            <span className="text-xs text-muted">
              ({providerLabels[embeddingConfig.type]})
            </span>
          </div>

          {/* 提供者选择按钮 */}
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(providerLabels) as EmbeddingProviderType[]).map((type) => {
              const Icon = providerIcons[type]
              const isActive = embeddingConfig.type === type
              return (
                <button
                  key={type}
                  onClick={() => handleProviderChange(type)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
                    isActive
                      ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 border border-accent-300 dark:border-accent-700'
                      : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 border border-transparent hover:bg-surface-200 dark:hover:bg-surface-700'
                  }`}
                >
                  <Icon size={14} />
                  {providerLabels[type]}
                </button>
              )
            })}
          </div>

          {/* 提供者特定配置 */}
          {embeddingConfig.type === 'local-model' && (
            <LocalModelConfig config={embeddingConfig} onChange={setEmbeddingConfig} t={t} />
          )}
          {embeddingConfig.type === 'ollama' && (
            <OllamaConfig config={embeddingConfig} onChange={setEmbeddingConfig} t={t} />
          )}
          {embeddingConfig.type === 'openai-api' && (
            <OpenAIConfig config={embeddingConfig} onChange={setEmbeddingConfig} t={t} />
          )}
        </div>
      </div>

      {/* ===== 高级设置 ===== */}
      <div className="space-y-4">
        <div
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full cursor-pointer group"
        >
          <SettingsSectionHeader
            title={t('knowledgeBase.advancedSettings')}
            actions={showAdvanced ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
          />
        </div>

        {showAdvanced && (
          <>
            {/* 分块设置 */}
            <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Scissors size={14} className="text-muted" />
                <span className="text-sm font-medium text-surface-800 dark:text-surface-200">
                  {t('knowledgeBase.chunkingSettings')}
                </span>
                <span className="text-xs text-muted">
                  ({chunkingModeLabel[chunkingConfig.mode]}，{chunkingConfig.chunkSize} {t('knowledgeBase.charsToken')})
                </span>
              </div>

              {/* 分块模式选择 */}
              <div>
                <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-2 block">
                  {t('knowledgeBase.chunkingMode')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { mode: 'character' as ChunkingMode, icon: Type, label: t('knowledgeBase.byCharacter'), desc: t('knowledgeBase.byCharacterDesc') },
                    { mode: 'delimiter' as ChunkingMode, icon: SplitSquareVertical, label: t('knowledgeBase.byDelimiter'), desc: t('knowledgeBase.byDelimiterDesc') },
                    { mode: 'token' as ChunkingMode, icon: Hash, label: t('knowledgeBase.byToken'), desc: t('knowledgeBase.byTokenDesc') }
                  ] as const).map(({ mode, icon: Icon, label, desc }) => {
                    const isActive = chunkingConfig.mode === mode
                    return (
                      <button
                        key={mode}
                        onClick={() => setChunkingConfig({ ...chunkingConfig, mode })}
                        className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg text-xs transition-all ${
                          isActive
                            ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 border border-accent-300 dark:border-accent-700'
                            : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 border border-transparent hover:bg-surface-200 dark:hover:bg-surface-700'
                        }`}
                      >
                        <Icon size={14} />
                        <span className="font-medium">{label}</span>
                        <span className="text-[10px] opacity-70">{desc}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 分块大小 */}
              <div>
                <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">
                  {chunkingConfig.mode === 'token' ? t('knowledgeBase.maxTokensPerChunk') : t('knowledgeBase.maxCharsPerChunk')}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={100} max={2000} step={50}
                    value={chunkingConfig.chunkSize}
                    onChange={(e) => setChunkingConfig({ ...chunkingConfig, chunkSize: Number(e.target.value) })}
                    className="flex-1 accent-500"
                  />
                  <input
                    type="number" min={100} max={5000}
                    value={chunkingConfig.chunkSize}
                    onChange={(e) => setChunkingConfig({ ...chunkingConfig, chunkSize: Math.max(100, Number(e.target.value)) })}
                    className="w-20 px-2 py-1.5 text-xs rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-800 dark:text-surface-200 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50"
                  />
                </div>
              </div>

              {/* 重叠长度 */}
              <div>
                <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">
                  {t('knowledgeBase.overlapLength')}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={0} max={Math.floor(chunkingConfig.chunkSize / 2)} step={10}
                    value={chunkingConfig.chunkOverlap}
                    onChange={(e) => setChunkingConfig({ ...chunkingConfig, chunkOverlap: Number(e.target.value) })}
                    className="flex-1 accent-500"
                  />
                  <input
                    type="number" min={0} max={Math.floor(chunkingConfig.chunkSize / 2)}
                    value={chunkingConfig.chunkOverlap}
                    onChange={(e) => setChunkingConfig({
                      ...chunkingConfig,
                      chunkOverlap: Math.max(0, Math.min(Number(e.target.value), Math.floor(chunkingConfig.chunkSize / 2)))
                    })}
                    className="w-20 px-2 py-1.5 text-xs rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-800 dark:text-surface-200 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50"
                  />
                </div>
              </div>

              {/* 分隔符 */}
              {chunkingConfig.mode === 'delimiter' && (
                <div>
                  <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">
                    {t('knowledgeBase.delimiter')}
                  </label>
                  <input
                    type="text"
                    value={chunkingConfig.delimiter}
                    onChange={(e) => setChunkingConfig({ ...chunkingConfig, delimiter: e.target.value })}
                    placeholder='\n\n'
                    className="w-full px-3 py-2 text-xs rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-800 dark:text-surface-200 font-mono focus:outline-none focus:ring-2 focus:ring-accent-500/50"
                  />
                </div>
              )}

              <button
                onClick={() => setChunkingConfig({ ...DEFAULT_CHUNKING_CONFIG })}
                className="text-xs text-muted hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
              >
                {t('knowledgeBase.restoreDefaults')}
              </button>
            </div>

            {/* 检索参数 */}
            <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Search size={14} className="text-muted" />
                <span className="text-sm font-medium text-surface-800 dark:text-surface-200">
                  {t('knowledgeBase.retrievalParams')}
                </span>
                <span className="text-xs text-muted">
                  (Top-{retrievalConfig.topK}，{t('knowledgeBase.threshold')} {retrievalConfig.similarityThreshold.toFixed(2)}，{t('knowledgeBase.vector')} {retrievalConfig.hybridVectorWeight ?? 0.6}/BM25 {retrievalConfig.hybridBM25Weight ?? 0.4})
                </span>
              </div>

              {/* Top-K */}
              <div>
                <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">
                  {t('knowledgeBase.topKResults')}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={1} max={20} step={1}
                    value={retrievalConfig.topK}
                    onChange={(e) => setRetrievalConfig({ ...retrievalConfig, topK: Number(e.target.value) })}
                    className="flex-1 accent-500"
                  />
                  <span className="text-sm font-medium text-surface-800 dark:text-surface-200 w-8 text-center">
                    {retrievalConfig.topK}
                  </span>
                </div>
              </div>

              {/* 相似度阈值 */}
              <div>
                <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">
                  {t('knowledgeBase.similarityThreshold')}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={retrievalConfig.similarityThreshold}
                    onChange={(e) => setRetrievalConfig({
                      ...retrievalConfig,
                      similarityThreshold: Number(e.target.value)
                    })}
                    className="flex-1 accent-500"
                  />
                  <span className="text-sm font-medium text-surface-800 dark:text-surface-200 w-12 text-center">
                    {retrievalConfig.similarityThreshold.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* 混合检索权重 */}
              <div className="pt-2 border-t border-surface-100 dark:border-surface-700/40">
                <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-2 block">
                  {t('knowledgeBase.hybridSearchWeights')}
                </label>
                <div className="space-y-2">
                  {/* 向量权重 */}
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-surface-500 dark:text-surface-400 w-16">{t('knowledgeBase.vector')}</span>
                    <input
                      type="range" min={0} max={1} step={0.05}
                      value={retrievalConfig.hybridVectorWeight ?? 0.6}
                      onChange={(e) => {
                        const wVec = Number(e.target.value)
                        setRetrievalConfig({
                          ...retrievalConfig,
                          hybridVectorWeight: wVec,
                          hybridBM25Weight: +(1 - wVec).toFixed(2)
                        })
                      }}
                      className="flex-1 accent-500"
                    />
                    <span className="text-sm font-medium text-surface-800 dark:text-surface-200 w-10 text-center">
                      {(retrievalConfig.hybridVectorWeight ?? 0.6).toFixed(2)}
                    </span>
                  </div>
                  {/* BM25 权重 */}
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-surface-500 dark:text-surface-400 w-16">BM25</span>
                    <input
                      type="range" min={0} max={1} step={0.05}
                      value={retrievalConfig.hybridBM25Weight ?? 0.4}
                      onChange={(e) => {
                        const wBM25 = Number(e.target.value)
                        setRetrievalConfig({
                          ...retrievalConfig,
                          hybridBM25Weight: wBM25,
                          hybridVectorWeight: +(1 - wBM25).toFixed(2)
                        })
                      }}
                      className="flex-1 accent-emerald-500"
                    />
                    <span className="text-sm font-medium text-surface-800 dark:text-surface-200 w-10 text-center">
                      {(retrievalConfig.hybridBM25Weight ?? 0.4).toFixed(2)}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-surface-400 mt-1">
                  {t('knowledgeBase.vectorWeightHigh')}
                </p>
              </div>

              <button
                onClick={() => setRetrievalConfig({ ...DEFAULT_RETRIEVAL_CONFIG })}
                className="text-xs text-muted hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
              >
                {t('knowledgeBase.restoreDefaults')}
              </button>
            </div>

            {/* 重建向量索引 */}
            <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <RotateCcw size={14} className="text-muted" />
                <span className="text-sm font-medium text-surface-800 dark:text-surface-200">
                  {t('knowledgeBase.rebuildVectorIndex')}
                </span>
              </div>
              <p className="text-xs text-muted mb-3">
                {t('knowledgeBase.rebuildDescription')}
              </p>
              {isRebuilding && rebuildProgress ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-accent-500" />
                    <span className="text-xs text-surface-600 dark:text-surface-300">
                      {rebuildProgress.phase === 'clearing' ? t('knowledgeBase.clearingOldVectors') :
                       rebuildProgress.phase === 'done' ? t('knowledgeBase.rebuildComplete') :
                       t('knowledgeBase.generatingVectors', { current: rebuildProgress.current, total: rebuildProgress.total })}
                    </span>
                  </div>
                  {rebuildProgress.total > 0 && (
                    <div className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-accent-500 to-purple-500 rounded-full transition-all"
                        style={{ width: `${Math.round((rebuildProgress.current / rebuildProgress.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              ) : showRebuildConfirm ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-amber-600 dark:text-amber-400">{t('knowledgeBase.rebuildConfirm')}</span>
                  <button
                    onClick={handleRebuild}
                    className="px-3 py-1.5 text-xs rounded-lg bg-accent-500 text-white hover:bg-accent-600 transition-colors"
                  >
                    {t('knowledgeBase.confirmRebuild')}
                  </button>
                  <button
                    onClick={() => setShowRebuildConfirm(false)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-600 transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowRebuildConfirm(true)}
                  disabled={isRebuilding}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-accent-50 dark:bg-accent-950/20 text-accent-600 dark:text-accent-400 border border-accent-200/60 dark:border-accent-800/30 hover:bg-accent-100 dark:hover:bg-accent-950/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw size={12} />
                  {t('knowledgeBase.rebuildAll')}
                </button>
              )}
            </div>

            {/* 危险操作 */}
            <DangerZone>
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-danger-500 border border-danger-200 dark:border-danger-800/60 hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-colors"
              >
                <Trash2 size={12} />
                {t('knowledgeBase.clearKnowledgeBase')}
              </button>
            </DangerZone>
          </>
        )}
      </div>
      <Dialog />
    </div>
  )
}

// ==================== 子组件 ====================

function SemanticEngineStatusCard({
  status, config, showErrorDetail, setShowErrorDetail,
  copied, onCopyError, onRetry, onLoadModel, migrationProgress, t
}: {
  status: EmbeddingEngineStatus
  config: EmbeddingProviderConfig
  showErrorDetail: boolean
  setShowErrorDetail: (v: boolean) => void
  copied: boolean
  onCopyError: () => void
  onRetry: () => void
  onLoadModel: () => void
  migrationProgress: { total: number; migrated: number; percentage: number } | null
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  if (config.type === 'tfidf') return null

  let bgColor = 'bg-surface-50 dark:bg-surface-800/40'
  let borderColor = 'border-surface-200/80 dark:border-surface-700/60'
  let icon = <Brain size={16} className="text-muted" />
  let title = t('knowledgeBase.semanticEnhanced')
  let subtitle = ''
  let showLoadButton = false

  if (status.modelReady) {
    bgColor = 'bg-emerald-50/50 dark:bg-emerald-950/20'
    borderColor = 'border-emerald-200/80 dark:border-emerald-800/40'
    icon = <Brain size={16} className="text-emerald-600 dark:text-emerald-400" />
    title = t('knowledgeBase.semanticEnabled')
    subtitle = t('knowledgeBase.semanticDimension', { dimension: status.semanticDimension || '?' }) + ` · ${providerShortLabel(config.type)}`
  } else if (status.modelLoading) {
    bgColor = 'bg-amber-50/50 dark:bg-amber-950/20'
    borderColor = 'border-amber-200/80 dark:border-amber-800/40'
    icon = <Loader2 size={16} className="animate-spin text-amber-600 dark:text-amber-400" />
    title = t('knowledgeBase.modelLoading')
    const detail = status.loadPhaseDetail || ''
    const fromCache =
      detail.includes('本地缓存') ||
      detail.toLowerCase().includes('cache') ||
      detail.includes('检查本地')
    const downloading =
      detail.includes('下载') || detail.toLowerCase().includes('download')
    subtitle =
      detail ||
      (fromCache
        ? t('knowledgeBase.loadingFromCache')
        : downloading
          ? t('knowledgeBase.downloadingModel')
          : `${status.loadProgress}%`)
  } else if (status.loadPhase === 'error') {
    bgColor = 'bg-red-50/50 dark:bg-red-950/20'
    borderColor = 'border-red-200/80 dark:border-red-800/40'
    icon = <AlertCircle size={16} className="text-red-600 dark:text-red-400" />
    title = status.errorMessage || t('knowledgeBase.semanticUnavailable')
  } else {
    subtitle = `${providerShortLabel(config.type)} · ${t('knowledgeBase.loadModelHint')}`
    showLoadButton = true
  }

  return (
    <div className={`${bgColor} rounded-xl border ${borderColor} p-4 space-y-3`}>
      <div className="flex items-center gap-3">
        {icon}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-surface-800 dark:text-surface-200">{title}</div>
          {subtitle && <div className="text-xs text-muted mt-0.5">{subtitle}</div>}
        </div>
        {showLoadButton && (
          <button onClick={onLoadModel} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 hover:bg-accent-200 dark:hover:bg-accent-900/50 transition-all">
            <Download size={12} />{t('knowledgeBase.loadModel')}
          </button>
        )}
        {status.loadPhase === 'error' && status.errorRecoverable && (
          <button onClick={onRetry} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-all">
            <RefreshCw size={12} />{t('common.retry')}
          </button>
        )}
      </div>
      {status.modelLoading && (
        <div className="w-full bg-surface-200 dark:bg-surface-700 rounded-full h-1.5">
          <div className="bg-amber-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${status.loadProgress}%` }} />
        </div>
      )}
      {status.modelReady && migrationProgress && migrationProgress.total > 0 && migrationProgress.migrated < migrationProgress.total && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Loader2 size={12} className="animate-spin" />
          {t('knowledgeBase.migratingVectors', { migrated: migrationProgress.migrated, total: migrationProgress.total, percentage: migrationProgress.percentage })}
        </div>
      )}
      {status.loadPhase === 'error' && status.errorDetail && (
        <div>
          <button onClick={() => setShowErrorDetail(!showErrorDetail)} className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline">
            {showErrorDetail ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {t('knowledgeBase.viewErrorDetail')}
          </button>
          {showErrorDetail && (
            <div className="mt-2 space-y-2">
              <pre className="text-xs font-mono bg-red-100/50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all text-red-800 dark:text-red-200">
                {status.errorDetail}
              </pre>
              <button onClick={onCopyError} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-600 transition-all">
                {copied ? <><Check size={12} className="text-emerald-500" />{t('knowledgeBase.copied')}</> : <><Copy size={12} />{t('knowledgeBase.copyErrorInfo')}</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LocalModelConfig({ config, onChange, t }: {
  config: Extract<EmbeddingProviderConfig, { type: 'local-model' }>
  onChange: (config: EmbeddingProviderConfig) => void
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">{t('knowledgeBase.modelId')}</label>
        <input type="text" value={config.modelId} onChange={(e) => onChange({ ...config, modelId: e.target.value })} placeholder="Xenova/all-MiniLM-L6-v2" className="w-full px-3 py-2 text-xs rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-accent-500/50" />
      </div>
      <div>
        <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">{t('knowledgeBase.mirrorUrl')}</label>
        <input type="text" value={config.mirrorUrl} onChange={(e) => onChange({ ...config, mirrorUrl: e.target.value })} placeholder="https://hf-mirror.com" className="w-full px-3 py-2 text-xs rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-accent-500/50" />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="autoDownload" checked={config.autoDownload} onChange={(e) => onChange({ ...config, autoDownload: e.target.checked })} className="rounded border-surface-300 dark:border-surface-600 text-accent-500 focus:ring-accent-500/50" />
        <label htmlFor="autoDownload" className="text-xs text-surface-700 dark:text-surface-300">{t('knowledgeBase.autoDownload')}</label>
      </div>
      <p className="text-xs text-muted">{t('knowledgeBase.autoRestoreHint')}</p>
    </div>
  )
}

function OllamaConfig({ config, onChange, t }: {
  config: Extract<EmbeddingProviderConfig, { type: 'ollama' }>
  onChange: (config: EmbeddingProviderConfig) => void
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">{t('knowledgeBase.ollamaServiceUrl')}</label>
        <input type="text" value={config.baseUrl} onChange={(e) => onChange({ ...config, baseUrl: e.target.value })} placeholder="http://localhost:11434" className="w-full px-3 py-2 text-xs rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-accent-500/50" />
      </div>
      <div>
        <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">{t('knowledgeBase.modelName')}</label>
        <input type="text" value={config.model} onChange={(e) => onChange({ ...config, model: e.target.value })} placeholder="nomic-embed-text" className="w-full px-3 py-2 text-xs rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-accent-500/50" />
        <p className="text-xs text-muted mt-1">{t('knowledgeBase.recommendedModels')}</p>
      </div>
    </div>
  )
}

function OpenAIConfig({ config, onChange, t }: {
  config: Extract<EmbeddingProviderConfig, { type: 'openai-api' }>
  onChange: (config: EmbeddingProviderConfig) => void
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">{t('knowledgeBase.apiUrl')}</label>
        <input type="text" value={config.baseUrl} onChange={(e) => onChange({ ...config, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" className="w-full px-3 py-2 text-xs rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-accent-500/50" />
      </div>
      <div>
        <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">{t('knowledgeBase.apiKey')}</label>
        <input type="password" value={config.apiKey} onChange={(e) => onChange({ ...config, apiKey: e.target.value })} placeholder="sk-..." className="w-full px-3 py-2 text-xs rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-accent-500/50" />
      </div>
      <div>
        <label className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1 block">{t('knowledgeBase.modelName')}</label>
        <input type="text" value={config.model} onChange={(e) => onChange({ ...config, model: e.target.value })} placeholder="text-embedding-3-small" className="w-full px-3 py-2 text-xs rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-800 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-accent-500/50" />
      </div>
    </div>
  )
}

function providerShortLabel(type: EmbeddingProviderType): string {
  switch (type) {
    case 'tfidf': return 'TF-IDF'
    case 'local-model': return 'transformers.js'
    case 'ollama': return 'Ollama'
    case 'openai-api': return 'OpenAI API'
  }
}
