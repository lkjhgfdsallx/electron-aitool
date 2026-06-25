import { useState, useCallback, useRef, useEffect } from 'react'
import { Plus, PanelLeftClose, PanelLeft, Settings, Database } from 'lucide-react'
import { ConversationList } from '../conversation/ConversationList'
import { useConversationStore } from '../../stores/conversation-store'
import { useSettingsStore } from '../../stores'
import type { ViewMode, SettingsSection } from '../settings/SettingsNavRail'

interface SidebarProps {
  viewMode: ViewMode
  onOpenSettings?: (section?: SettingsSection) => void
  onOpenKnowledgeBase?: () => void
  onBackToChat?: () => void
}

export function Sidebar({ viewMode, onOpenSettings, onOpenKnowledgeBase, onBackToChat }: SidebarProps) {
  const { createConversation } = useConversationStore()
  const { sidebarCollapsed, toggleSidebar, sidebarWidth, setSidebarWidth } = useSettingsStore()

  // ---- 拖拽调整宽度 ----
  const [isDragging, setIsDragging] = useState(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(sidebarWidth)

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragStartX.current = e.clientX
    dragStartWidth.current = sidebarWidth
  }, [sidebarWidth])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartX.current
      setSidebarWidth(dragStartWidth.current + delta)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    // 防止拖拽时选中文本
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, setSidebarWidth])

  if (sidebarCollapsed) {
    return (
      <div className="flex-shrink-0 w-14 border-r border-surface-200 dark:border-surface-700/60 bg-surface-50 dark:bg-surface-950 flex flex-col items-center py-3 gap-1.5">
        <button
          onClick={toggleSidebar}
          className="p-2.5 rounded-xl hover:bg-surface-200 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
          title="展开侧边栏"
        >
          <PanelLeft size={18} />
        </button>

        {/* 新建对话 - 渐变按钮 */}
        <button
          onClick={() => createConversation()}
          className="mt-1 p-2.5 rounded-xl bg-gradient-brand text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95"
          title="新建对话"
        >
          <Plus size={18} />
        </button>

        <div className="flex-1" />

        {/* 知识库入口 */}
        <button
          onClick={onOpenKnowledgeBase}
          className={`p-2.5 rounded-xl transition-all ${
            viewMode === 'knowledge-base'
              ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400'
              : 'hover:bg-surface-200 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
          title="知识库"
        >
          <Database size={18} />
        </button>

        {/* 设置入口 */}
        <button
          onClick={viewMode === 'settings' ? onBackToChat : () => onOpenSettings?.()}
          className={`p-2.5 rounded-xl transition-all ${
            viewMode === 'settings'
              ? 'bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400'
              : 'hover:bg-surface-200 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
          title={viewMode === 'settings' ? '返回对话' : '设置'}
        >
          <Settings size={18} />
        </button>

        <button
          onClick={toggleSidebar}
          className="p-2.5 rounded-xl hover:bg-surface-200 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
          title="收起侧边栏"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex-shrink-0 border-r border-surface-200 dark:border-surface-700/60 bg-surface-50 dark:bg-surface-950 flex flex-col animate-fade-in relative"
      style={{ width: sidebarWidth }}
    >
      {/* 品牌区 */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-brand shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
                <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" opacity="0.9" />
                <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-800 dark:text-gray-100 tracking-tight">AI Tool</h1>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">v1.0</p>
            </div>
          </div>
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
            title="收起侧边栏"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        {/* 新建对话按钮 */}
        <button
          onClick={() => createConversation()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-brand text-white text-sm font-medium shadow-sm hover:shadow-md transition-all hover:brightness-110 active:scale-[0.98]"
        >
          <Plus size={16} strokeWidth={2.5} />
          新建对话
        </button>
      </div>

      {/* 分隔线 */}
      <div className="px-4">
        <div className="divider-gradient" />
      </div>

      {/* 对话列表 */}
      <div className="flex-1 min-h-0">
        <ConversationList />
      </div>

      {/* 底部导航入口 */}
      <div className="px-3 py-2 border-t border-surface-200/80 dark:border-surface-700/60 space-y-1">
        {/* 知识库入口 */}
        <button
          onClick={onOpenKnowledgeBase}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
            viewMode === 'knowledge-base'
              ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 font-medium'
              : 'text-gray-500 dark:text-gray-400 hover:bg-surface-200/60 dark:hover:bg-surface-800/60 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Database size={16} />
          <span>知识库</span>
        </button>

        {/* 设置入口 */}
        <button
          onClick={viewMode === 'settings' ? onBackToChat : () => onOpenSettings?.()}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
            viewMode === 'settings'
              ? 'bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400 font-medium'
              : 'text-gray-500 dark:text-gray-400 hover:bg-surface-200/60 dark:hover:bg-surface-800/60 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Settings size={16} />
          <span>{viewMode === 'settings' ? '返回对话' : '设置'}</span>
        </button>
      </div>

      {/* 拖拽调整宽度的手柄 */}
      <div
        onMouseDown={handleDragStart}
        className={`absolute top-0 right-0 w-1.5 h-full cursor-col-resize group/drag z-10 ${
          isDragging ? 'bg-accent-500/30' : 'hover:bg-accent-400/20'
        }`}
      >
        <div className={`absolute top-1/2 -translate-y-1/2 right-0 w-0.5 h-8 rounded-full transition-colors ${
          isDragging ? 'bg-accent-500' : 'bg-transparent group-hover/drag:bg-accent-400/60'
        }`} />
      </div>
    </div>
  )
}
