import { useState, useEffect } from 'react'
import {
  Globe,
  LogIn,
  Search,
  Brain,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Link,
  BarChart3
} from 'lucide-react'
import type { SiteAnalyzerLiveProgress } from '../../types'
import { useAppTranslation } from '@/i18n/hooks'

/** 阶段配置 */
const PHASE_CONFIG: Record<
  SiteAnalyzerLiveProgress['phase'],
  { icon: typeof Globe; labelKey: string; color: string; bgColor: string; gradient: string }
> = {
  browser: {
    icon: Globe,
    labelKey: 'special.phaseBrowser',
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/40',
    gradient: 'from-blue-400 to-blue-600'
  },
  login: {
    icon: LogIn,
    labelKey: 'special.phaseLogin',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/40',
    gradient: 'from-emerald-400 to-emerald-600'
  },
  crawling: {
    icon: Search,
    labelKey: 'special.phaseCrawling',
    color: 'text-amber-500',
    bgColor: 'bg-amber-100 dark:bg-amber-900/40',
    gradient: 'from-amber-400 to-amber-600'
  },
  analyzing: {
    icon: Brain,
    labelKey: 'special.phaseAnalyzing',
    color: 'text-purple-500',
    bgColor: 'bg-purple-100 dark:bg-purple-900/40',
    gradient: 'from-purple-400 to-purple-600'
  },
  report: {
    icon: FileText,
    labelKey: 'special.phaseReport',
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/40',
    gradient: 'from-indigo-400 to-indigo-600'
  },
  completed: {
    icon: CheckCircle2,
    labelKey: 'special.phaseCompleted',
    color: 'text-green-500',
    bgColor: 'bg-green-100 dark:bg-green-900/40',
    gradient: 'from-green-400 to-green-600'
  },
  error: {
    icon: AlertCircle,
    labelKey: 'special.phaseError',
    color: 'text-red-500',
    bgColor: 'bg-red-100 dark:bg-red-900/40',
    gradient: 'from-red-400 to-red-600'
  }
}

/** 阶段顺序 */
const PHASE_ORDER: SiteAnalyzerLiveProgress['phase'][] = [
  'browser',
  'login',
  'crawling',
  'analyzing',
  'report'
]

interface SiteAnalyzerProgressPanelProps {
  progress: SiteAnalyzerLiveProgress
}

/** 截断URL */
function truncateUrl(url: string, maxLen = 60): string {
  if (!url) return ''
  if (url.length <= maxLen) return url
  return url.substring(0, maxLen - 3) + '...'
}

/** 数字动画组件 */
function AnimatedNumber({ value, label, icon: Icon }: { value?: number; label: string; icon: typeof BarChart3 }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm">
      <Icon size={16} className="text-gray-400 dark:text-gray-500 shrink-0" />
      <div className="min-w-0">
        <div className="text-lg font-bold text-gray-800 dark:text-gray-100 tabular-nums leading-tight">
          {value ?? '—'}
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{label}</div>
      </div>
    </div>
  )
}

export function SiteAnalyzerProgressPanel({ progress }: SiteAnalyzerProgressPanelProps) {
  const { t } = useAppTranslation()
  const [elapsed, setElapsed] = useState(0)

  const formatElapsed = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return t('special.elapsedSeconds', { count: seconds })
    const minutes = Math.floor(seconds / 60)
    const remainSeconds = seconds % 60
    return t('special.elapsedMinutesSeconds', { minutes, seconds: remainSeconds })
  }

  // 实时更新耗时
  useEffect(() => {
    if (progress.phase === 'completed' || progress.phase === 'error') return
    const timer = setInterval(() => {
      setElapsed(Date.now() - progress.startTime)
    }, 1000)
    return () => clearInterval(timer)
  }, [progress.startTime, progress.phase])

  // 初始化耗时
  useEffect(() => {
    setElapsed(Date.now() - progress.startTime)
  }, [progress.startTime])

  const currentPhaseIndex = PHASE_ORDER.indexOf(progress.phase as SiteAnalyzerLiveProgress['phase'])
  const isTerminal = progress.phase === 'completed' || progress.phase === 'error'
  const currentConfig = PHASE_CONFIG[progress.phase]

  return (
    <div className="mb-3 rounded-xl border border-gray-200/80 dark:border-gray-700/80 overflow-hidden bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-900/50 shadow-sm">
      {/* 头部 */}
      <div className={`bg-gradient-to-r ${currentConfig.gradient} px-4 py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!isTerminal ? (
              <Loader2 size={18} className="text-white animate-spin" />
            ) : progress.phase === 'completed' ? (
              <CheckCircle2 size={18} className="text-white" />
            ) : (
              <AlertCircle size={18} className="text-white" />
            )}
            <span className="text-white font-semibold text-sm tracking-wide">{t('special.siteAnalyzerEngine')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-white/80 text-xs">
            <Clock size={12} />
            <span className="tabular-nums">{formatElapsed(elapsed)}</span>
          </div>
        </div>
      </div>

      {/* 阶段指示器 */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-1">
          {PHASE_ORDER.map((phase, index) => {
            const config = PHASE_CONFIG[phase]
            const Icon = config.icon
            const isActive = phase === progress.phase
            const isCompleted = isTerminal
              ? progress.phase === 'completed'
                ? true
                : index < currentPhaseIndex
              : index < currentPhaseIndex
            const isError = progress.phase === 'error' && index === currentPhaseIndex

            return (
              <div key={phase} className="flex items-center flex-1 min-w-0">
                {/* 步骤圆点 */}
                <div className="relative flex items-center justify-center">
                  <div
                    className={`
                      w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500
                      ${isError
                        ? 'bg-red-100 dark:bg-red-900/40 ring-2 ring-red-300 dark:ring-red-700'
                        : isCompleted
                          ? 'bg-green-100 dark:bg-green-900/40 ring-2 ring-green-300 dark:ring-green-700'
                          : isActive
                            ? `${config.bgColor} ring-2 ring-current ${config.color}`
                            : 'bg-gray-100 dark:bg-gray-800'
                      }
                    `}
                  >
                    {isCompleted && !isActive ? (
                      <CheckCircle2 size={16} className="text-green-500" />
                    ) : isError ? (
                      <AlertCircle size={16} className="text-red-500" />
                    ) : (
                      <Icon
                        size={16}
                        className={`${isActive ? config.color : 'text-gray-400 dark:text-gray-600'} ${
                          isActive ? 'animate-pulse' : ''
                        }`}
                      />
                    )}
                  </div>
                  {/* 活跃脉冲动画 */}
                  {isActive && !isTerminal && (
                    <div className={`absolute inset-0 rounded-full ${config.bgColor} animate-ping opacity-30`} />
                  )}
                </div>

                {/* 步骤标签 */}
                <span
                  className={`ml-1.5 text-[11px] font-medium truncate transition-colors duration-300 ${
                    isActive
                      ? config.color
                      : isCompleted
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-400 dark:text-gray-600'
                  }`}
                >
                  {t(config.labelKey)}
                </span>

                {/* 连接线 */}
                {index < PHASE_ORDER.length - 1 && (
                  <div className="flex-1 mx-1.5 h-0.5 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 min-w-[12px]">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${
                        isCompleted ? 'bg-green-400 dark:bg-green-500 w-full' : isActive ? `bg-gradient-to-r ${config.gradient} w-1/2` : 'w-0'
                      }`}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 实时状态信息 */}
      <div className="px-4 pb-4">
        {/* 当前状态消息 */}
        <div className="mb-3 flex items-start gap-2">
          <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${isTerminal ? (progress.phase === 'completed' ? 'bg-green-500' : 'bg-red-500') : `bg-gradient-to-r ${currentConfig.gradient}`} ${!isTerminal ? 'animate-pulse' : ''}`} />
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {progress.message}
          </p>
        </div>

        {/* 当前URL */}
        {progress.currentUrl && !isTerminal && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50/80 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
            <Link size={13} className="text-blue-400 shrink-0" />
            <span className="text-xs text-blue-600 dark:text-blue-400 truncate font-mono">
              {truncateUrl(progress.currentUrl)}
            </span>
          </div>
        )}

        {/* 统计数据 */}
        <div className="grid grid-cols-3 gap-2">
          <AnimatedNumber value={progress.pagesCrawled} label={t('special.pagesCrawled')} icon={Search} />
          <AnimatedNumber value={progress.apisFound} label={t('special.apisFound')} icon={BarChart3} />
          <AnimatedNumber value={progress.pagesAnalyzed} label={t('special.pagesAnalyzed')} icon={Brain} />
        </div>

        {/* 错误信息 */}
        {progress.phase === 'error' && progress.error && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">{progress.error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
