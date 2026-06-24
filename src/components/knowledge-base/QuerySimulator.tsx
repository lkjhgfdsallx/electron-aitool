import { useState, useCallback } from 'react'
import {
  Brain,
  Loader2,
  Search,
  Clock,
  Hash,
  Zap,
  ChevronDown,
  ChevronRight,
  FileText,
  Percent,
  Activity,
  Settings2,
  Layers
} from 'lucide-react'
import { useKnowledgeBaseStore } from '../../stores/knowledge-base-store'
import type { SearchMode } from '../../types'

/** 模拟器搜索模式选项 */
const SIMULATOR_MODES: { mode: SearchMode; label: string }[] = [
  { mode: 'hybrid', label: '混合检索' },
  { mode: 'vector', label: '向量检索' },
  { mode: 'keyword', label: '关键词检索' }
]

export function QuerySimulator() {
  const { simulatorResult, isSimulating, performSimulatorQuery, clearSimulatorResult } =
    useKnowledgeBaseStore()

  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(5)
  const [threshold, setThreshold] = useState(0.3)
  const [simMode, setSimMode] = useState<SearchMode>('hybrid')

  const handleQuery = useCallback(() => {
    if (!query.trim()) return
    performSimulatorQuery(query, topK, threshold, simMode)
  }, [query, topK, threshold, simMode, performSimulatorQuery])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleQuery()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 输入区域 */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-surface-200/80 dark:border-surface-700/60">
        <div className="flex items-center gap-2 mb-3">
          <Brain size={16} className="text-violet-500" />
          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">
            检索模拟器
          </h3>
        </div>
        <p className="text-xs text-muted mb-3">
          输入查询文本，模拟检索流程，支持混合检索、向量检索和关键词检索
        </p>

        {/* 查询输入 */}
        <div className="flex gap-2 mb-3">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入查询文本，如：如何使用 React hooks？"
            rows={2}
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-800 dark:text-surface-200 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
          />
          <button
            onClick={handleQuery}
            disabled={!query.trim() || isSimulating}
            className="px-4 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 self-end"
          >
            {isSimulating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Search size={14} />
            )}
            查询
          </button>
        </div>

        {/* 检索模式选择 */}
        <div className="flex items-center gap-2 mb-3">
          <Layers size={12} className="text-surface-400" />
          <span className="text-xs text-surface-500 dark:text-surface-400">检索模式</span>
          <div className="flex gap-1">
            {SIMULATOR_MODES.map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setSimMode(mode)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  simMode === mode
                    ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                    : 'bg-surface-100 dark:bg-surface-800 text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 参数调节 */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 flex-1">
            <label className="text-xs text-surface-500 dark:text-surface-400 whitespace-nowrap">
              Top-K
            </label>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="flex-1 accent-violet-500 h-1"
            />
            <span className="text-xs font-medium text-surface-700 dark:text-surface-300 w-6 text-center">
              {topK}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-1">
            <label className="text-xs text-surface-500 dark:text-surface-400 whitespace-nowrap">
              阈值
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="flex-1 accent-violet-500 h-1"
            />
            <span className="text-xs font-medium text-surface-700 dark:text-surface-300 w-10 text-center">
              {threshold.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* 结果区域 */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isSimulating ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-violet-500 mb-3" />
            <p className="text-sm text-muted">正在执行向量查询...</p>
          </div>
        ) : simulatorResult ? (
          <div className="space-y-4">
            {/* 统计信息 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                icon={Clock}
                label="查询耗时"
                value={`${simulatorResult.queryTime.toFixed(1)}ms`}
                color="text-blue-500"
              />
              <StatCard
                icon={Zap}
                label="引擎类型"
                value={simulatorResult.engineType === 'tfidf' ? 'TF-IDF' : '语义模型'}
                color="text-amber-500"
              />
              <StatCard
                icon={Hash}
                label="向量维度"
                value={`${simulatorResult.dimension}D`}
                color="text-emerald-500"
              />
              <StatCard
                icon={Activity}
                label="匹配/总量"
                value={`${simulatorResult.results.length}/${simulatorResult.totalChunks}`}
                color="text-violet-500"
              />
            </div>

            {/* 结果列表 */}
            {simulatorResult.results.length === 0 ? (
              <div className="text-center text-muted py-8">
                <Search size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">无匹配结果</p>
                <p className="text-xs mt-1">尝试降低相似度阈值或使用不同的查询文本</p>
              </div>
            ) : (
              <div className="space-y-2">
                <span className="text-xs font-medium text-surface-500 dark:text-surface-400">
                  检索结果（按相似度排序）
                </span>
                {simulatorResult.results.map((result, i) => (
                  <SimulatorResultCard key={`${result.chunk.id}-${i}`} result={result} index={i} />
                ))}
              </div>
            )}

            {/* 清除按钮 */}
            <button
              onClick={clearSimulatorResult}
              className="text-xs text-muted hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
            >
              清除结果
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted">
            <Brain size={48} className="mb-4 opacity-20" />
            <p className="text-sm font-medium mb-1">输入查询开始模拟</p>
            <p className="text-xs">输入文本后点击"查询"按钮，查看向量检索的完整过程</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== 统计卡片 ====================

function StatCard({
  icon: Icon,
  label,
  value,
  color
}: {
  icon: typeof Clock
  label: string
  value: string
  color: string
}) {
  return (
    <div className="bg-white dark:bg-surface-800/60 rounded-lg border border-surface-200/80 dark:border-surface-700/60 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className={color} />
        <span className="text-[10px] text-surface-400 dark:text-surface-500">{label}</span>
      </div>
      <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">{value}</p>
    </div>
  )
}

// ==================== 结果卡片 ====================

function SimulatorResultCard({
  result,
  index
}: {
  result: { chunk: { id: string; content: string; fileId: string }; score: number; fileName: string }
  index: number
}) {
  const [expanded, setExpanded] = useState(false)
  const preview = result.chunk.content.slice(0, 150)

  return (
    <div className="bg-white dark:bg-surface-800/60 rounded-lg border border-surface-200/80 dark:border-surface-700/60 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-3 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
      >
        <div className="flex items-start gap-2.5">
          {/* 排名 */}
          <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
            index === 0
              ? 'bg-amber-100 dark:bg-amber-900/30'
              : index === 1
                ? 'bg-surface-200 dark:bg-surface-700'
                : index === 2
                  ? 'bg-orange-100 dark:bg-orange-900/30'
                  : 'bg-surface-100 dark:bg-surface-800'
          }`}>
            <span className={`text-[11px] font-bold ${
              index === 0
                ? 'text-amber-600 dark:text-amber-400'
                : index === 1
                  ? 'text-surface-500'
                  : index === 2
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-surface-400'
            }`}>
              {index + 1}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FileText size={12} className="text-surface-400" />
              <span className="text-xs font-medium text-surface-600 dark:text-surface-300 truncate">
                {result.fileName}
              </span>
            </div>
            <p className="text-xs text-surface-500 dark:text-surface-400 line-clamp-2">
              {preview}{result.chunk.content.length > 150 ? '...' : ''}
            </p>
            {/* 相似度进度条 */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-1.5 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all bg-gradient-to-r from-violet-500 to-purple-500"
                  style={{ width: `${result.score * 100}%` }}
                />
              </div>
              <span className="text-[11px] font-medium text-violet-500 w-12 text-right">
                {(result.score * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="flex-shrink-0 mt-1">
            {expanded ? (
              <ChevronDown size={14} className="text-surface-400" />
            ) : (
              <ChevronRight size={14} className="text-surface-400" />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-surface-100 dark:border-surface-700/40 pt-2 ml-10">
          <pre className="text-xs text-surface-700 dark:text-surface-300 whitespace-pre-wrap break-words font-sans leading-relaxed">
            {result.chunk.content}
          </pre>
        </div>
      )}
    </div>
  )
}
