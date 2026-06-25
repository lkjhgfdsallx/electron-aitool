import { Sparkles } from 'lucide-react'
import { WindowControls } from './WindowControls'

/**
 * 自定义标题栏 - 位于应用最顶层，替代 Electron 原生标题栏
 * 包含品牌标识、可拖拽区域和窗口控制按钮（最小化/最大化/关闭）
 * 适配亮色/暗色模式
 */
export function TitleBar() {
  return (
    <div
      className="flex items-center justify-between h-9 border-b border-surface-200 dark:border-surface-700/60 bg-white dark:bg-surface-900 select-none flex-shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* 左侧：品牌标识 */}
      <div className="flex items-center gap-2 pl-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex items-center justify-center w-5 h-5 rounded-md bg-gradient-brand shadow-sm">
          <Sparkles size={11} className="text-white" />
        </div>
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tracking-tight">
          AI Tool
        </span>
      </div>

      {/* 中间：可拖拽空白区域 */}
      <div className="flex-1" />

      {/* 右侧：窗口控制按钮 */}
      <WindowControls />
    </div>
  )
}
