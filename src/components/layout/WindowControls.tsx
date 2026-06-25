import { useState, useEffect, useCallback } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)

  const checkMaximized = useCallback(async () => {
    try {
      const maximized = await window.electronAPI.window.isMaximized()
      setIsMaximized(maximized)
    } catch {
      // 非 Electron 环境忽略
    }
  }, [])

  useEffect(() => {
    checkMaximized()

    // 监听窗口最大化/还原事件
    const handleResize = () => {
      // 使用简单检测：窗口尺寸与屏幕一致时视为最大化
      const isMax = window.outerWidth === screen.availWidth && window.outerHeight === screen.availHeight
      setIsMaximized(isMax)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [checkMaximized])

  const handleMinimize = () => {
    window.electronAPI.window.minimize()
  }

  const handleMaximize = () => {
    window.electronAPI.window.maximize()
    // 延迟检查状态
    setTimeout(checkMaximized, 100)
  }

  const handleClose = () => {
    window.electronAPI.window.close()
  }

  return (
    <div
      className="flex items-center h-full"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* 最小化 */}
      <button
        onClick={handleMinimize}
        className="group flex items-center justify-center w-[46px] h-full text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        title="最小化"
      >
        <Minus size={16} className="opacity-70 group-hover:opacity-100 transition-opacity" />
      </button>

      {/* 最大化 / 还原 */}
      <button
        onClick={handleMaximize}
        className="group flex items-center justify-center w-[46px] h-full text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        title={isMaximized ? '还原' : '最大化'}
      >
        {isMaximized ? (
          <Copy size={14} className="opacity-70 group-hover:opacity-100 transition-opacity -rotate-90" />
        ) : (
          <Square size={14} className="opacity-70 group-hover:opacity-100 transition-opacity" />
        )}
      </button>

      {/* 关闭 */}
      <button
        onClick={handleClose}
        className="group flex items-center justify-center w-[46px] h-full text-gray-500 dark:text-gray-400 hover:bg-red-500 hover:text-white transition-colors"
        title="关闭"
      >
        <X size={16} className="opacity-70 group-hover:opacity-100 transition-opacity" />
      </button>
    </div>
  )
}
