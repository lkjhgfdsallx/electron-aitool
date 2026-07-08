/**
 * 可拖拽调整面板尺寸的通用手柄
 *
 * 统一 Sidebar（水平）与 WorkspacePage（水平/垂直）中的拖拽逻辑。
 * 支持水平（'horizontal' / 'col-resize'）和垂直（'vertical' / 'row-resize'）两种方向。
 */
import { useState, useCallback, useRef } from 'react'

export interface ResizeHandleProps {
  /** 拖拽方向：水平=改变宽度（左右），垂直=改变高度（上下） */
  direction: 'horizontal' | 'vertical'
  /** 当前尺寸（px） */
  size: number
  /** 尺寸变更回调，传入新尺寸 */
  onResize: (newSize: number) => void
  /** 最小尺寸 */
  min?: number
  /** 最大尺寸 */
  max?: number
  /** 自定义样式类名 */
  className?: string
}

/**
 * 通用拖拽手柄。
 *
 * 水平方向：鼠标横向移动改变宽度，size 为宽度。
 * 垂直方向：鼠标向上移动增大高度（向下移动减小），size 为高度。
 */
export function ResizeHandle({
  direction,
  size,
  onResize,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  className = '',
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const startRef = useRef({ pos: 0, size })

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      startRef.current = {
        pos: direction === 'horizontal' ? e.clientX : e.clientY,
        size,
      }

      const handleMove = (ev: MouseEvent) => {
        const startPos = startRef.current.pos
        const startSize = startRef.current.size
        let delta: number
        if (direction === 'horizontal') {
          delta = ev.clientX - startPos
        } else {
          // 垂直方向：向上拖动增大高度
          delta = startPos - ev.clientY
        }
        const next = Math.max(min, Math.min(max, startSize + delta))
        onResize(next)
      }

      const handleUp = () => {
        setIsDragging(false)
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [direction, size, onResize, min, max]
  )

  const baseClass =
    direction === 'horizontal'
      ? 'w-1 cursor-col-resize hover:bg-primary-500/30'
      : 'h-1 cursor-row-resize hover:bg-primary-500/30'

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`${baseClass} flex-shrink-0 bg-surface-200 dark:bg-surface-700/60 transition-colors ${
        isDragging ? 'bg-primary-500/50' : ''
      } ${className}`}
    />
  )
}
