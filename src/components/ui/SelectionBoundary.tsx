import { useEffect, useCallback, useRef, type ReactNode } from 'react'

interface SelectionBoundaryProps {
  children: ReactNode
  className?: string
}

/**
 * 查找节点所属的 .selection-boundary 祖先元素
 */
function findBoundary(node: Node): HTMLElement | null {
  const el =
    node.nodeType === Node.TEXT_NODE
      ? node.parentElement
      : (node as HTMLElement)
  return el?.closest('.selection-boundary') ?? null
}

/** 全局 selectionchange 处理器的引用计数，确保只注册一次监听器 */
let refCount = 0
let globalHandler: (() => void) | null = null

/** 防止 setBaseAndExtent 触发递归 selectionchange */
let isConstraining = false

/** 记录当前 mousedown 起始所在的边界，用于 mousemove 实时约束 */
let activeBoundary: HTMLElement | null = null

/**
 * 约束选区不跨越 .selection-boundary 边界
 *
 * 当检测到选区的 anchor 和 focus 分属不同边界时，
 * 将 focus 收缩到 anchor 所在边界的边缘。
 */
function constrainSelection(): void {
  if (isConstraining) return

  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return

  // 找到 anchor 所在的边界
  const anchorBoundary = findBoundary(sel.anchorNode)
  if (!anchorBoundary) return // anchor 不在任何边界内，不管

  // 检查 focus 是否在同一个边界内
  const focusBoundary = findBoundary(sel.focusNode)
  if (anchorBoundary === focusBoundary) return // 同一边界，无需约束

  // ── 选区跨越了边界，需要约束到 anchor 所在的边界内 ──
  isConstraining = true
  try {
    const boundaryRange = document.createRange()
    boundaryRange.selectNodeContents(anchorBoundary)

    // 判断选区拖拽方向：focus 在 anchor 之前还是之后
    const pos = sel.anchorNode.compareDocumentPosition(sel.focusNode)
    const isFocusAfterAnchor = !!(pos & Node.DOCUMENT_POSITION_FOLLOWING)

    if (isFocusAfterAnchor) {
      // 向后（下）拖选 → 约束到边界末尾
      sel.setBaseAndExtent(
        sel.anchorNode,
        sel.anchorOffset,
        boundaryRange.endContainer,
        boundaryRange.endOffset
      )
    } else {
      // 向前（上）拖选 → 约束到边界开头
      sel.setBaseAndExtent(
        sel.anchorNode,
        sel.anchorOffset,
        boundaryRange.startContainer,
        boundaryRange.startOffset
      )
    }
  } finally {
    isConstraining = false
  }
}

/**
 * 选择边界组件
 *
 * 标记一个可自由选择复制的文本区域。
 * 配合 CSS user-select 和 selectionchange 监听，实现：
 * - 边界内自由选择文本
 * - 选区不跨越边界
 * - 拖选时不会出现跨越边界的视觉高亮
 */
export function SelectionBoundary({ children, className = '' }: SelectionBoundaryProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  /**
   * mousedown 捕获阶段：
   * 1. 如果点击在边界内，记录该边界为 activeBoundary，并清除其他边界的已有选区
   * 2. 如果点击在边界外，清除所有选区
   */
  const handleMouseDown = useCallback((e: MouseEvent) => {
    const targetBoundary = findBoundary(e.target as Node)

    if (targetBoundary) {
      // 点击在边界内
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.anchorNode) {
        const existingBoundary = findBoundary(sel.anchorNode)
        if (existingBoundary && existingBoundary !== targetBoundary) {
          // 已有选区在其他边界 → 清除，让浏览器从当前边界重新开始
          sel.removeAllRanges()
        }
      }
      activeBoundary = targetBoundary
    } else {
      // 点击在边界外 → 清除所有选区
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed) {
        sel.removeAllRanges()
      }
      activeBoundary = null
    }
  }, [])

  /**
   * mousemove 捕获阶段：
   * 当用户正在拖选时，实时约束选区不跨越 activeBoundary。
   * 这比等待 selectionchange 更及时，可以防止拖选过程中的视觉高亮。
   */
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!activeBoundary) return
    // 只有在鼠标按下状态才处理（通过 buttons 检测）
    if (!(e.buttons & 1)) return

    constrainSelection()
  }, [])

  /**
   * mouseup 捕获阶段：
   * 清除 activeBoundary 记录
   */
  const handleMouseUp = useCallback(() => {
    activeBoundary = null
  }, [])

  useEffect(() => {
    // 引用计数：只在第一个组件挂载时注册全局监听器
    if (refCount === 0) {
      globalHandler = constrainSelection
      document.addEventListener('selectionchange', globalHandler)
    }
    refCount++

    return () => {
      refCount--
      if (refCount === 0 && globalHandler) {
        document.removeEventListener('selectionchange', globalHandler)
        globalHandler = null
      }
    }
  }, [])

  // 注册鼠标事件监听，全部在捕获阶段处理
  useEffect(() => {
    const el = document.documentElement
    el.addEventListener('mousedown', handleMouseDown, true)
    el.addEventListener('mousemove', handleMouseMove, true)
    el.addEventListener('mouseup', handleMouseUp, true)
    return () => {
      el.removeEventListener('mousedown', handleMouseDown, true)
      el.removeEventListener('mousemove', handleMouseMove, true)
      el.removeEventListener('mouseup', handleMouseUp, true)
    }
  }, [handleMouseDown, handleMouseMove, handleMouseUp])

  return (
    <div ref={containerRef} className={`selection-boundary ${className}`}>
      {children}
    </div>
  )
}
