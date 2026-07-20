import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Globe, Check, Settings, Home, Wifi, Loader2, Pencil } from 'lucide-react'
import { useAIProviderStore } from '../../stores/ai-provider-store'
import { useConversationStore } from '../../stores/conversation-store'
import { useGlobalConfigStore } from '../../stores/global-config-store'
import type { ConnectionStatus } from '../../types'
import { useAppTranslation } from '@/i18n/hooks'
import { formatRelativeTime } from '@/utils/format-time'

// 连接状态颜色映射
const STATUS_DOT_COLORS: Record<ConnectionStatus, string> = {
  unknown: 'bg-surface-400',
  checking: 'bg-accent-500 animate-pulse',
  online: 'bg-green-500',
  offline: 'bg-orange-500',
  error: 'bg-red-500'
}

interface ModelSelectorProps {
  conversationId?: string
  /**
   * 打开 AI 源设置。
   * - 无参数：打开 AI 源列表
   * - 传入 providerId：直接进入对应 AI 源编辑页
   */
  onOpenSettings?: (providerId?: string) => void
}

export function ModelSelector({ conversationId, onOpenSettings }: ModelSelectorProps) {
  const { t } = useAppTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { providers, checkConnection } = useAIProviderStore()
  const { getConversation, setConversationAIConfig } = useConversationStore()
  const { activeProviderId, updateConfig } = useGlobalConfigStore()

  const conversation = conversationId ? getConversation(conversationId) : undefined
  const currentProviderId = conversation?.aiConfig?.providerId || activeProviderId

  // 确定当前使用的 provider
  const currentProvider = useMemo(() => {
    if (currentProviderId) {
      return providers.find((p) => p.id === currentProviderId)
    }
    return providers.find((p) => p.isDefault) || providers[0]
  }, [providers, currentProviderId])

  // 当前模型名称（从 provider.defaultModelId 获取）
  const currentModelName = useMemo(() => {
    if (!currentProvider) return t('settings.aiProviders')
    if (!currentProvider.defaultModelId) return currentProvider.name
    const model = currentProvider.models.find((m) => m.id === currentProvider.defaultModelId)
    return model?.name || currentProvider.defaultModelId
  }, [currentProvider, t])

  // 计算下拉面板位置
  const updateDropdownPos = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom - 2,
        right: window.innerWidth - rect.right
      })
    }
  }, [])

  // 点击外部关闭 & 滚动关闭
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    const handleScroll = (e: Event) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return
      setIsOpen(false)
    }
    updateDropdownPos()
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('resize', updateDropdownPos)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('resize', updateDropdownPos)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [isOpen, updateDropdownPos])

  const handleToggle = () => {
    if (!isOpen) {
      updateDropdownPos()
    }
    setIsOpen(!isOpen)
  }

  const handleSelectProvider = (providerId: string) => {
    // 对话级别切换 provider
    if (conversationId) {
      setConversationAIConfig(conversationId, { providerId })
    } else {
      // 无对话时切换全局默认
      updateConfig({ activeProviderId: providerId })
    }
    setIsOpen(false)
  }

  const handleTestConnection = (e: React.MouseEvent, providerId: string) => {
    e.stopPropagation()
    checkConnection(providerId)
  }

  const handleEditProvider = (e: React.MouseEvent, providerId: string) => {
    e.stopPropagation()
    setIsOpen(false)
    onOpenSettings?.(providerId)
  }

  if (providers.length === 0) {
    return (
      <button
        onClick={() => onOpenSettings?.()}
        aria-label={t('chat.configureAiProvider')}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border border-dashed border-surface-300 dark:border-surface-600 text-muted hover:border-accent-300 dark:hover:border-accent-600 transition-all"
      >
        <Globe size={12} />
        <span>{t('chat.configureAiProvider')}</span>
      </button>
    )
  }

  const dropdownPanel = isOpen ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[9999] w-80 bg-white dark:bg-surface-800 border border-surface-200/80 dark:border-surface-700/60 rounded-xl shadow-xl backdrop-blur-sm animate-scale-in overflow-hidden"
      style={{ top: dropdownPos.top, right: dropdownPos.right }}
    >
      <div className="max-h-80 overflow-y-auto">
        {providers.map((provider) => {
          const isActive = currentProvider?.id === provider.id
          const defaultModel = provider.defaultModelId
            ? provider.models.find((m) => m.id === provider.defaultModelId)
            : null
          const health = provider.health
          const statusDot = STATUS_DOT_COLORS[health?.status || 'unknown']

          return (
            <div
              key={provider.id}
              onClick={() => handleSelectProvider(provider.id)}
              className={`flex items-center gap-3 px-3 py-2.5 transition-all cursor-pointer group ${
                isActive
                  ? 'bg-accent-50 dark:bg-accent-950/30 border-l-2 border-accent-500'
                  : 'hover:bg-accent-50/50 dark:hover:bg-accent-950/20 border-l-2 border-transparent'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center flex-shrink-0 relative">
                {provider.type === 'local' ? (
                  <Home size={14} className="text-accent-600 dark:text-accent-400" />
                ) : (
                  <Globe size={14} className="text-accent-600 dark:text-accent-400" />
                )}
                {/* 连接状态小圆点 */}
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-surface-800 ${statusDot}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-xs truncate ${
                  isActive
                    ? 'text-accent-700 dark:text-accent-300 font-medium'
                    : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {provider.name}
                  {provider.type === 'local' && (
                    <span className="ml-1 text-[9px] text-green-500">{t('chat.localProvider')}</span>
                  )}
                </div>
                <div className="text-[10px] text-muted truncate">
                  {defaultModel ? defaultModel.name : provider.defaultModelId || t('chat.noModelSelected')}
                </div>
                {/* 连接状态信息 */}
                {health && health.status !== 'unknown' && (
                  <div className="text-[9px] text-muted mt-0.5 flex items-center gap-1">
                    {health.status === 'online' && health.latencyMs && (
                      <span className="text-green-500">{t('chat.latency', { ms: health.latencyMs })}</span>
                    )}
                    {health.status === 'error' && health.lastError && (
                      <span className="text-red-500 truncate">{health.lastError}</span>
                    )}
                    {health.lastCheckedAt && (
                      <span className="opacity-60">· {formatRelativeTime(health.lastCheckedAt)}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* 直接编辑 AI 源 */}
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={(e) => handleEditProvider(e, provider.id)}
                    aria-label={t('chat.editAiProvider')}
                    title={t('chat.editAiProvider')}
                    className="p-1 rounded text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-accent-500 hover:bg-accent-100/60 dark:hover:bg-accent-900/30 transition-all"
                  >
                    <Pencil size={12} />
                  </button>
                )}
                {/* 测试连接按钮 */}
                <button
                  onClick={(e) => handleTestConnection(e, provider.id)}
                  disabled={health?.status === 'checking'}
                  aria-label={t('chat.testConnection')}
                  className="p-1 rounded text-muted hover:text-accent-500 transition-colors disabled:opacity-50"
                  title={t('chat.testConnection')}
                >
                  {health?.status === 'checking' ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Wifi size={12} />
                  )}
                </button>
                {isActive && (
                  <Check size={14} className="text-accent-500 flex-shrink-0" />
                )}
              </div>
            </div>
          )
        })}
      </div>
      {onOpenSettings && (
        <div
          onClick={(e) => { e.stopPropagation(); setIsOpen(false); onOpenSettings() }}
          className="flex items-center justify-center gap-1.5 px-3 py-2 border-t border-surface-100 dark:border-surface-700/40 text-xs text-muted hover:text-accent-500 hover:bg-accent-50/50 dark:hover:bg-accent-950/20 cursor-pointer transition-colors"
        >
          <Settings size={12} />
          <span>{t('chat.manageAiProviders')}</span>
        </div>
      )}
    </div>,
    document.body
  ) : null

  return (
    <>
      {/* 触发按钮 */}
      <button
        ref={triggerRef}
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t('chat.selectAiProvider')}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border border-surface-200/80 dark:border-surface-700/60 bg-white dark:bg-surface-800/60 hover:border-accent-300 dark:hover:border-accent-600 hover:bg-accent-50/50 dark:hover:bg-accent-950/20 transition-all shadow-sm max-w-[200px]"
      >
        {/* 连接状态指示 */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[currentProvider?.health?.status || 'unknown']}`} />
        <span className="text-gray-600 dark:text-gray-400 truncate">
          {currentProvider ? `${currentProvider.name} · ${currentModelName}` : t('chat.selectAiProvider')}
        </span>
        <ChevronDown size={12} className={`text-gray-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Portal 下拉面板 */}
      {dropdownPanel}
    </>
  )
}

