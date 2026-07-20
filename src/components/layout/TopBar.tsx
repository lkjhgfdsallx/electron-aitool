import React from 'react'
import {
  Settings,
  Moon,
  Sun,
  Monitor,
} from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'
import { useConversationStore } from '../../stores/conversation-store'
import { useAgentStore } from '../../stores/agent-store'
import { ModelSelector } from '../chat/ModelSelector'
import { BrandLogo } from '../brand'
import { useAppTranslation } from '@/i18n/hooks'
import type { ThemeMode } from '../../types'
import type { ViewMode, SettingsSection } from '../settings/SettingsNavRail'

interface TopBarProps {
  viewMode: ViewMode
  onOpenSettings: (section?: SettingsSection, editId?: string) => void
  onBackToChat: () => void
}

export function TopBar({ viewMode, onOpenSettings, onBackToChat }: TopBarProps) {
  const { t } = useAppTranslation()
  const { theme, setTheme } = useSettingsStore()
  const { currentConversationId, getConversation } = useConversationStore()
  const { getAgent } = useAgentStore()

  const currentConversation = currentConversationId ? getConversation(currentConversationId) : undefined
  const currentAgent = currentConversation?.agentId ? getAgent(currentConversation.agentId) : undefined

  const themeOptions: { value: ThemeMode; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: t('settings.light') },
    { value: 'dark', icon: Moon, label: t('settings.dark') },
    { value: 'system', icon: Monitor, label: t('settings.system') }
  ]

  const cycleTheme = () => {
    const currentIndex = themeOptions.findIndex((t) => t.value === theme)
    const nextIndex = (currentIndex + 1) % themeOptions.length
    setTheme(themeOptions[nextIndex].value)
  }

  const ThemeIcon = themeOptions.find((t) => t.value === theme)?.icon ?? Monitor

  return (
    <div
      className="flex items-center justify-between px-4 h-12 border-b border-surface-200 dark:border-surface-700/60 bg-white/80 dark:bg-surface-900/80 glass-heavy select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* 左侧：品牌标识 */}
      <div className="flex items-center gap-2.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <BrandLogo size="sm" wordmarkClassName="text-gray-800 dark:text-gray-200" />
      </div>

      {/* 中间：当前对话标题 或 设置页面标题 */}
      <div className="flex-1 flex items-center justify-center min-w-0 px-4">
        {viewMode === 'settings' ? (
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {t('nav.settings')}
          </span>
        ) : currentConversation ? (
          <div className="flex items-center gap-2 min-w-0">
            {currentAgent && (
              <span className="flex-shrink-0 text-xs px-2 py-0.5 bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 rounded-full font-medium">
                {currentAgent.avatar || '🤖'} {currentAgent.name}
              </span>
            )}
            <span className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {currentConversation.title}
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {t('nav.selectOrCreateConversation')}
          </span>
        )}
      </div>

      {/* 右侧：模型指示器 + 主题 + 设置 */}
      <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* AI 源切换器 - 仅在对话模式显示 */}
        {viewMode === 'chat' && (
          <ModelSelector
            conversationId={currentConversationId || undefined}
            onOpenSettings={(providerId) => onOpenSettings('ai-providers', providerId)}
          />
        )}

        {/* 主题切换 */}
        <button
          onClick={cycleTheme}
          className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
          title={`${t('settings.theme')}: ${themeOptions.find((option) => option.value === theme)?.label}`}
          aria-label={`${t('settings.theme')}: ${themeOptions.find((option) => option.value === theme)?.label}`}
        >
          <ThemeIcon size={16} />
        </button>

        {/* 全局设置 */}
        <button
          onClick={viewMode === 'settings' ? onBackToChat : () => onOpenSettings()}
          className={`p-2 rounded-lg transition-all ${
            viewMode === 'settings'
              ? 'bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400'
              : 'hover:bg-surface-100 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
          title={viewMode === 'settings' ? t('nav.backToChat') : t('nav.settings')}
          aria-label={viewMode === 'settings' ? t('nav.backToChat') : t('nav.settings')}
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  )
}
