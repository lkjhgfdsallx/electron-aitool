import React from 'react'
import {
  Settings,
  Moon,
  Sun,
  Monitor,
  Sparkles,
  Cpu
} from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'
import { useConversationStore } from '../../stores/conversation-store'
import { useGlobalConfigStore } from '../../stores/global-config-store'
import { useAgentStore } from '../../stores/agent-store'
import type { ThemeMode } from '../../types'

interface TopBarProps {
  onOpenSettings: () => void
}

export function TopBar({ onOpenSettings }: TopBarProps) {
  const { theme, setTheme } = useSettingsStore()
  const { currentConversationId, getConversation } = useConversationStore()
  const { defaultModel } = useGlobalConfigStore()
  const { getAgent } = useAgentStore()

  const currentConversation = currentConversationId ? getConversation(currentConversationId) : undefined
  const currentAgent = currentConversation?.agentId ? getAgent(currentConversation.agentId) : undefined

  const themeOptions: { value: ThemeMode; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: '亮色' },
    { value: 'dark', icon: Moon, label: '暗色' },
    { value: 'system', icon: Monitor, label: '跟随系统' }
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
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-brand shadow-sm">
          <Sparkles size={15} className="text-white" />
        </div>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 tracking-tight">
          AI Tool
        </span>
      </div>

      {/* 中间：当前对话标题 */}
      <div className="flex-1 flex items-center justify-center min-w-0 px-4">
        {currentConversation ? (
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
            选择或创建一个对话
          </span>
        )}
      </div>

      {/* 右侧：模型指示器 + 主题 + 设置 */}
      <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* 模型指示器 */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-100 dark:bg-surface-800 text-xs text-gray-500 dark:text-gray-400 mr-1">
          <Cpu size={12} className="text-accent-500" />
          <span className="font-medium max-w-[100px] truncate">{defaultModel || '未配置'}</span>
        </div>

        {/* 主题切换 */}
        <button
          onClick={cycleTheme}
          className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
          title={`当前: ${theme === 'light' ? '亮色' : theme === 'dark' ? '暗色' : '跟随系统'}`}
        >
          <ThemeIcon size={16} />
        </button>

        {/* 全局设置 */}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
          title="设置"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  )
}
