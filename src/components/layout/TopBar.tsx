import React from 'react'
import {
  Settings,
  Moon,
  Sun,
  Monitor
} from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'
import type { ThemeMode } from '../../types'

interface TopBarProps {
  onOpenSettings: () => void
}

export function TopBar({ onOpenSettings }: TopBarProps) {
  const { theme, setTheme } = useSettingsStore()

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
      className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* 左侧留空，用于拖动窗口 */}
      <div />

      {/* 右侧：主题和设置 */}
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* 主题切换 */}
        <button
          onClick={cycleTheme}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          title={`当前: ${theme === 'light' ? '亮色' : theme === 'dark' ? '暗色' : '跟随系统'}`}
        >
          <ThemeIcon size={18} />
        </button>

        {/* 全局设置 */}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          title="设置"
        >
          <Settings size={18} />
        </button>
      </div>
    </div>
  )
}
