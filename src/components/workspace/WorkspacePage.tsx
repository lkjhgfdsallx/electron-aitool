/**
 * 工作区页面 - 三栏 IDE 风格布局
 *
 * ┌──────────────┬──────────────────────────┬───────────┐
 * │  项目浏览器   │   AI 领导控制台 / 文件预览  │           │
 * │  (左栏)      │   (中栏)                  │           │
 * │  文件树      │   消息列表 + 输入框         │           │
 * │  存档历史    │   或 FilePreview           │           │
 * │  Agent 团队  │                           │           │
 * ├──────────────┴──────────────────────────┴───────────┤
 * │  终端 & 审批 (底栏，可折叠)                            │
 * └─────────────────────────────────────────────────────┘
 *
 * Phase B 更新：
 * - 集成 FilePreview（文件预览叠加层）
 * - 集成文件变化跟踪（B8：changedFiles 传递给 FileTree）
 * - 集成文件监控启动（B10：进入工作区时启动 watcher）
 * - 集成 WorkspaceSettingsPopover（B7）
 *
 * Phase C 更新：
 * - C1: 多工作区 Tab 标签栏
 * - C5: 工作区导出按钮
 * - C6: 上下文时间线入口
 * - C7: 默认工作区标记
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useConversationStore } from '../../stores/conversation-store'
import { Settings, ChevronLeft, ChevronDown, ChevronUp, X, Plus, Download, Clock, Star, StarOff, Search, Trash2, Folder, Users } from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { workspaceFileWatcher } from '../../services/workspace-file-watcher'
import { ProjectExplorer } from './ProjectExplorer'
import { WorkspaceChatPanel } from './WorkspaceChatPanel'
import { TerminalPanel } from './TerminalPanel'
import { FilePreview } from './FilePreview'
import { WorkspaceCreateDialog } from './WorkspaceCreateDialog'
import { WorkspaceSettingsPopover } from './WorkspaceSettingsPopover'
import { ContextTimelinePanel } from './ContextTimelinePanel'

/** 相对时间格式化 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`

  const date = new Date(timestamp)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${month}/${day}`
}

interface WorkspacePageProps {
  onBackToChat: () => void
  onOpenSettings?: (section?: string) => void
}

export function WorkspacePage({ onBackToChat, onOpenSettings }: WorkspacePageProps) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const openTabs = useWorkspaceStore((s) => s.openTabs)
  const defaultWorkspaceId = useWorkspaceStore((s) => s.defaultWorkspaceId)
  const switchTab = useWorkspaceStore((s) => s.switchTab)
  const closeTab = useWorkspaceStore((s) => s.closeTab)
  const closeOtherTabs = useWorkspaceStore((s) => s.closeOtherTabs)
  const setDefaultWorkspace = useWorkspaceStore((s) => s.setDefaultWorkspace)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false)
  const [bottomPanelCollapsed, setBottomPanelCollapsed] = useState(true)
  const [leftPanelWidth, setLeftPanelWidth] = useState(260)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(200)
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'recent' | 'all'>('recent')

  // B2: 文件预览状态
  const [previewFile, setPreviewFile] = useState<string | null>(null)

  // B8: 文件变化跟踪
  const [changedFiles, setChangedFiles] = useState<Set<string>>(new Set())

  // B7: 工作区设置浮层
  const [showSettingsPopover, setShowSettingsPopover] = useState(false)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)

  // C6: 上下文时间线面板
  const [showContextTimeline, setShowContextTimeline] = useState(false)

  // C1: Tab 右键菜单
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)

  // 自动激活已有工作区：进入页面时若有打开的 Tab 但无活跃工作区，自动激活默认/第一个
  useEffect(() => {
    if (!activeWorkspaceId && openTabs.length > 0) {
      const store = useWorkspaceStore.getState()
      const targetId = store.defaultWorkspaceId && openTabs.includes(store.defaultWorkspaceId)
        ? store.defaultWorkspaceId
        : openTabs[0]
      store.activateWorkspace(targetId)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // B10: 进入工作区时启动文件监控
  useEffect(() => {
    if (!activeWorkspace) return

    const startWatcher = async () => {
      try {
        await workspaceFileWatcher.startWatching(
          activeWorkspace.folderPath,
          activeWorkspace.checkpointPolicy
        )
      } catch (err) {
        console.warn('[WorkspacePage] 启动文件监控失败:', err)
      }
    }

    startWatcher()

    // 监听文件变更事件，更新 changedFiles
    const unsubscribe = window.electronAPI.workspace.watcher.onChange((data) => {
      const events = data.events as Array<{ eventType: string; filePath: string; timestamp: number }>
      if (events.length > 0) {
        setChangedFiles((prev) => {
          const next = new Set(prev)
          for (const event of events) {
            const fullPath = activeWorkspace.folderPath + '/' + event.filePath
            if (event.eventType === 'deleted') {
              next.delete(fullPath)
            } else {
              next.add(fullPath)
            }
          }
          return next
        })

        // 5 秒后清除高亮
        setTimeout(() => {
          setChangedFiles((prev) => {
            const next = new Set(prev)
            for (const event of events) {
              next.delete(activeWorkspace.folderPath + '/' + event.filePath)
            }
            return next
          })
        }, 5000)
      }
    })

    return () => {
      unsubscribe()
      workspaceFileWatcher.stopWatching()
    }
  }, [activeWorkspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 进入工作区时：创建/恢复工作区对话并选中
  // 之前的 currentConversationId 需要在退出时恢复
  const previousConversationIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeWorkspace) return

    const conversationStore = useConversationStore.getState()

    // 保存当前对话 ID（退出工作区时恢复）
    // 注意：必须保存非工作区对话的 ID，因为子组件 WorkspaceChatPanel 的 effect
    // 可能已先于本 effect 执行并将 currentConversationId 设为工作区对话
    const currentConv = conversationStore.currentConversationId
      ? conversationStore.conversations.find((c) => c.id === conversationStore.currentConversationId)
      : null
    previousConversationIdRef.current = currentConv?.workspaceId ? null : conversationStore.currentConversationId

    // 对话创建/选择已交由 WorkspaceChatPanel 管理（支持多对话切换）

    // 退出工作区时：保存工作区会话
    // 注意：不在此处恢复对话，由 deactivateWorkspace() 内部的 switchToNonWorkspaceConversation() 统一处理
    return () => {
      const store = useConversationStore.getState()
      // 保存所有工作区对话消息到文件系统（异步，非阻塞）
      const wsConvs = store.conversations.filter((c) => c.workspaceId === activeWorkspace.id)
      if (wsConvs.length > 0 && activeWorkspace.folderPath) {
        const msgs: Record<string, typeof store.messages[string]> = {}
        for (const conv of wsConvs) {
          const convMsgs = store.messages[conv.id]
          if (convMsgs && convMsgs.length > 0) {
            msgs[conv.id] = convMsgs
          }
        }
        if (Object.keys(msgs).length > 0) {
          window.electronAPI.workspace.vcs.saveSession(
            activeWorkspace.folderPath,
            { messages: msgs, terminalHistory: {} }
          ).catch((err: unknown) => console.warn('[WorkspacePage] 保存会话失败:', err))
        }
      }
      // 对话恢复由 deactivateWorkspace() 中的 switchToNonWorkspaceConversation() 处理
    }
  }, [activeWorkspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 关闭 Tab 右键菜单
  useEffect(() => {
    if (!tabContextMenu) return
    const handleClose = () => setTabContextMenu(null)
    document.addEventListener('click', handleClose)
    return () => document.removeEventListener('click', handleClose)
  }, [tabContextMenu])

  // 左栏拖拽调整宽度
  const [isDraggingLeft, setIsDraggingLeft] = useState(false)
  const handleLeftDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingLeft(true)
    const startX = e.clientX
    const startWidth = leftPanelWidth

    const handleMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      setLeftPanelWidth(Math.max(200, Math.min(500, startWidth + delta)))
    }
    const handleUp = () => {
      setIsDraggingLeft(false)
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [leftPanelWidth])

  // 底栏拖拽调整高度
  const [isDraggingBottom, setIsDraggingBottom] = useState(false)
  const handleBottomDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingBottom(true)
    const startY = e.clientY
    const startHeight = bottomPanelHeight

    const handleMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY
      setBottomPanelHeight(Math.max(100, Math.min(500, startHeight + delta)))
    }
    const handleUp = () => {
      setIsDraggingBottom(false)
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [bottomPanelHeight])

  // 文件选择处理
  const handleFileSelect = useCallback((filePath: string) => {
    setPreviewFile(filePath)
  }, [])

  // C5: 导出工作区
  const handleExport = useCallback(async () => {
    if (!activeWorkspace) return
    try {
      const result = await window.electronAPI.file.saveZip(
        `${activeWorkspace.name}.zip`,
        [] // TODO: 实际收集工作区文件
      )
      console.log('[WorkspacePage] 导出结果:', result)
    } catch (err) {
      console.error('[WorkspacePage] 导出失败:', err)
    }
  }, [activeWorkspace])

  // C1: Tab 右键菜单处理
  const handleTabContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    setTabContextMenu({ x: e.clientX, y: e.clientY, tabId })
  }, [])

  // 如果没有激活的工作区，显示引导页
  if (!activeWorkspace) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-surface-200 dark:border-surface-700/60 bg-white/80 dark:bg-surface-900/80">
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToChat}
              className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
              title="返回对话"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">工作区</span>
          </div>
        </div>

        {/* 引导内容 */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-10">
            {/* 头部标识 */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-900/30 dark:to-teal-800/20 flex items-center justify-center shadow-sm">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-teal-500">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
                欢迎使用工作区
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                工作区是一个完整的 AI 项目操作台，文件、对话、命令三要素同屏协作。
              </p>
            </div>

            {/* 工作区卡片区域 */}
            {(() => {
              const sorted = [...workspaces].sort((a, b) => b.updatedAt - a.updatedAt)
              const recentWorkspaces = sorted.slice(0, 5)
              const displayWorkspaces = viewMode === 'recent' ? recentWorkspaces : sorted
              const filtered = searchQuery
                ? displayWorkspaces.filter((ws) =>
                    ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    ws.folderPath.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                : displayWorkspaces
              return (
                <div>
                  {/* 区域标题 + 切换标签 + 搜索 */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        工作区
                      </h3>
                      <div className="flex items-center bg-surface-100 dark:bg-surface-800 rounded-lg p-0.5">
                        <button
                          onClick={() => setViewMode('recent')}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                            viewMode === 'recent'
                              ? 'bg-white dark:bg-surface-700 text-gray-800 dark:text-gray-200 shadow-sm'
                              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                          }`}
                        >
                          最近
                        </button>
                        <button
                          onClick={() => setViewMode('all')}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                            viewMode === 'all'
                              ? 'bg-white dark:bg-surface-700 text-gray-800 dark:text-gray-200 shadow-sm'
                              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                          }`}
                        >
                          全部
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索工作区..."
                        className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-gray-700 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 dark:focus:border-teal-500 w-40 transition-all"
                      />
                    </div>
                  </div>

                  {/* 卡片网格 */}
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* 新建工作区卡片 */}
                    <div
                      onClick={() => setShowCreateWorkspace(true)}
                      className="group flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-surface-300 dark:border-surface-600 bg-surface-50/50 dark:bg-surface-800/30 cursor-pointer transition-all duration-200 hover:border-teal-400 dark:hover:border-teal-500 hover:bg-teal-50/50 dark:hover:bg-teal-900/10 hover:-translate-y-0.5 min-h-[140px]"
                    >
                      <div className="w-10 h-10 rounded-full bg-surface-200 dark:bg-surface-700 flex items-center justify-center mb-2 group-hover:bg-teal-100 dark:group-hover:bg-teal-900/30 transition-colors">
                        <Plus size={20} className="text-gray-400 dark:text-gray-500 group-hover:text-teal-500 transition-colors" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                        新建工作区
                      </span>
                    </div>

                    {/* 工作区卡片列表 */}
                    {filtered.map((ws) => (
                      <div
                        key={ws.id}
                        onClick={() => {
                          const { activateWorkspace } = useWorkspaceStore.getState()
                          activateWorkspace(ws.id)
                        }}
                        className="group relative flex flex-col p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800/80 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-teal-300 dark:hover:border-teal-600 hover:-translate-y-0.5"
                      >
                        {/* 默认标记 */}
                        {ws.id === defaultWorkspaceId && (
                          <div className="absolute top-2.5 right-2.5">
                            <Star size={14} className="text-amber-400 fill-amber-400" />
                          </div>
                        )}

                        {/* 删除按钮（悬浮显示） */}
                        {deleteConfirmId === ws.id ? (
                          <div className="absolute top-2.5 right-2.5 flex items-center gap-1 z-10">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                const { deleteWorkspace } = useWorkspaceStore.getState()
                                deleteWorkspace(ws.id)
                                setDeleteConfirmId(null)
                              }}
                              className="px-2 py-0.5 text-[10px] font-medium rounded bg-danger-500 text-white hover:bg-danger-600 transition-colors"
                            >
                              确认
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteConfirmId(null)
                              }}
                              className="px-2 py-0.5 text-[10px] font-medium rounded bg-surface-200 dark:bg-surface-600 text-gray-600 dark:text-gray-300 hover:bg-surface-300 dark:hover:bg-surface-500 transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          ws.id !== defaultWorkspaceId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteConfirmId(ws.id)
                              }}
                              className="absolute top-2.5 right-2.5 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-danger-50 dark:hover:bg-danger-950/30 text-gray-400 hover:text-danger-500 transition-all z-10"
                              title="删除工作区"
                            >
                              <Trash2 size={13} />
                            </button>
                          )
                        )}

                        {/* 图标 + 名称 */}
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center flex-shrink-0">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-500">
                              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0 pr-5">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                              {ws.name}
                            </p>
                          </div>
                        </div>

                        {/* 描述 */}
                        {ws.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2 leading-relaxed">
                            {ws.description}
                          </p>
                        )}

                        {/* 路径 */}
                        <div className="flex items-center gap-1.5 mb-3">
                          <Folder size={12} className="text-gray-400 flex-shrink-0" />
                          <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                            {ws.folderPath}
                          </span>
                        </div>

                        {/* 底部信息栏 */}
                        <div className="mt-auto flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500">
                          <div className="flex items-center gap-1">
                            <Clock size={11} />
                            <span>{formatRelativeTime(ws.updatedAt)}</span>
                          </div>
                          {ws.teamAgentIds.length > 0 && (
                            <div className="flex items-center gap-1">
                              <Users size={11} />
                              <span>{ws.teamAgentIds.length}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 搜索无结果 */}
                  {searchQuery && filtered.length === 0 && (
                    <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
                      未找到匹配的工作区
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        <WorkspaceCreateDialog
          open={showCreateWorkspace}
          onClose={() => setShowCreateWorkspace(false)}
          onCreated={(id) => {
            console.log('[WorkspacePage] 工作区已创建:', id)
            setShowCreateWorkspace(false)
          }}
        />
      </div>
    )
  }

  // Tab 数据列表
  const tabWorkspaces = openTabs
    .map((tabId) => workspaces.find((w) => w.id === tabId))
    .filter(Boolean) as typeof workspaces

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* C1: Tab 标签栏（始终显示） */}
      <div className="flex items-center h-9 px-1 border-b border-surface-200 dark:border-surface-700/60 bg-surface-50 dark:bg-surface-900/80 select-none overflow-x-auto scrollbar-thin"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* 返回对话按钮 */}
        <button
          onClick={onBackToChat}
          className="p-1.5 mx-1 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all flex-shrink-0"
          title="返回对话"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <ChevronLeft size={14} />
        </button>
        <div className="w-px h-4 bg-surface-200 dark:bg-surface-700/60 flex-shrink-0" />
        {tabWorkspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId
          const isDefault = ws.id === defaultWorkspaceId
          return (
            <button
              key={ws.id}
              onClick={() => switchTab(ws.id)}
              onContextMenu={(e) => handleTabContextMenu(e, ws.id)}
              className={`group/tab flex items-center gap-1.5 px-3 h-full text-xs font-medium transition-all border-r border-surface-200 dark:border-surface-700/40 flex-shrink-0 max-w-[180px] ${
                isActive
                  ? 'bg-white dark:bg-surface-800 text-teal-600 dark:text-teal-400 border-b-2 border-b-teal-500'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                isActive ? 'bg-teal-500' : 'bg-gray-300 dark:bg-gray-600'
              }`} />
              <span className="truncate">{ws.name}</span>
              {isDefault && (
                <Star size={10} className="text-amber-400 flex-shrink-0 fill-amber-400" />
              )}
              {/* 关闭按钮 */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(ws.id)
                }}
                className="p-0.5 rounded opacity-0 group-hover/tab:opacity-100 hover:bg-surface-200 dark:hover:bg-surface-600 transition-opacity flex-shrink-0"
                title="关闭标签"
              >
                <X size={11} />
              </button>
            </button>
          )
        })}
        {/* 新建 Tab 按钮 */}
        <button
          onClick={() => setShowCreateWorkspace(true)}
          className="p-1.5 mx-1 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all flex-shrink-0"
          title="新建工作区"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Plus size={13} />
        </button>
      </div>

      {/* C1: Tab 右键菜单 */}
      {tabContextMenu && (
        <div
          className="fixed z-[200] bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg py-1 min-w-[160px] animate-scale-in"
          style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
        >
          <button
            onClick={() => {
              closeOtherTabs(tabContextMenu.tabId)
              setTabContextMenu(null)
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
          >
            关闭其他标签
          </button>
          <button
            onClick={() => {
              closeTab(tabContextMenu.tabId)
              setTabContextMenu(null)
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
          >
            关闭标签
          </button>
          <div className="h-px bg-surface-200 dark:bg-surface-700 my-1" />
          <button
            onClick={() => {
              const isDefault = tabContextMenu.tabId === defaultWorkspaceId
              setDefaultWorkspace(isDefault ? null : tabContextMenu.tabId)
              setTabContextMenu(null)
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors flex items-center gap-1.5"
          >
            {tabContextMenu.tabId === defaultWorkspaceId ? (
              <><StarOff size={12} /> 取消默认工作区</>
            ) : (
              <><Star size={12} /> 设为默认工作区</>
            )}
          </button>
        </div>
      )}

      {/* 顶部栏 */}
      <div
        className="flex items-center justify-between px-4 h-12 border-b border-surface-200 dark:border-surface-700/60 bg-white/80 dark:bg-surface-900/80 glass-heavy select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="w-2 h-2 rounded-full bg-teal-500" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[200px]">
            {activeWorkspace.name}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 truncate hidden sm:inline">
            {activeWorkspace.folderPath}
          </span>
          {/* C7: 默认工作区标记 */}
          {activeWorkspaceId === defaultWorkspaceId && (
            <span title="默认工作区"><Star size={12} className="text-amber-400 fill-amber-400 flex-shrink-0" /></span>
          )}
          {/* B8: 文件变化计数 */}
          {changedFiles.size > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex-shrink-0">
              {changedFiles.size} 变更
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* 切换左栏 */}
          <button
            onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
            className={`p-1.5 rounded-lg transition-all ${
              leftPanelCollapsed
                ? 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-800'
                : 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400'
            }`}
            title={leftPanelCollapsed ? '展开项目浏览器' : '折叠项目浏览器'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>

          {/* 切换底栏 */}
          <button
            onClick={() => setBottomPanelCollapsed(!bottomPanelCollapsed)}
            className={`p-1.5 rounded-lg transition-all ${
              bottomPanelCollapsed
                ? 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-800'
                : 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400'
            }`}
            title={bottomPanelCollapsed ? '展开终端面板' : '折叠终端面板'}
          >
            {bottomPanelCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {/* C6: 上下文时间线 */}
          <button
            onClick={() => setShowContextTimeline(!showContextTimeline)}
            className={`p-1.5 rounded-lg transition-all ${
              showContextTimeline
                ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-800'
            }`}
            title="上下文时间线"
          >
            <Clock size={16} />
          </button>

          {/* C5: 导出工作区 */}
          <button
            onClick={handleExport}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
            title="导出工作区"
          >
            <Download size={16} />
          </button>

          {/* B7: 工作区设置 */}
          <div>
            <button
              ref={settingsButtonRef}
              onClick={() => setShowSettingsPopover(!showSettingsPopover)}
              className={`p-1.5 rounded-lg transition-all ${
                showSettingsPopover
                  ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-800'
              }`}
              title="工作区设置"
            >
              <Settings size={16} />
            </button>
            {showSettingsPopover && (
              <WorkspaceSettingsPopover
                workspace={activeWorkspace}
                anchorRef={settingsButtonRef}
                onClose={() => setShowSettingsPopover(false)}
                onOpenFullSettings={() => {
                  setShowSettingsPopover(false)
                  onOpenSettings?.('workspace')
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* C6: 上下文时间线面板（叠加层） */}
      {showContextTimeline && (
        <ContextTimelinePanel
          workspace={activeWorkspace}
          onClose={() => setShowContextTimeline(false)}
        />
      )}

      {/* 三栏内容区 */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* 上半部分：左栏 + 中栏 */}
        <div className="flex-1 flex min-h-0">
          {/* 左栏：项目浏览器 */}
          {!leftPanelCollapsed && (
            <div
              className="flex-shrink-0 border-r border-surface-200 dark:border-surface-700/60 bg-surface-50/50 dark:bg-surface-950/50 overflow-hidden"
              style={{ width: leftPanelWidth }}
            >
              <ProjectExplorer
                workspace={activeWorkspace}
                onFileSelect={handleFileSelect}
                selectedFile={previewFile || undefined}
                changedFiles={changedFiles}
              />
            </div>
          )}

          {/* 左栏拖拽手柄 */}
          {!leftPanelCollapsed && (
            <div
              onMouseDown={handleLeftDragStart}
              className={`w-1 flex-shrink-0 cursor-col-resize group/drag relative z-10 ${
                isDraggingLeft ? 'bg-teal-500/30' : 'hover:bg-teal-400/20'
              }`}
            >
              <div className={`absolute top-1/2 -translate-y-1/2 left-0 w-0.5 h-8 rounded-full transition-colors ${
                isDraggingLeft ? 'bg-teal-500' : 'bg-transparent group-hover/drag:bg-teal-400/60'
              }`} />
            </div>
          )}

          {/* 中栏：AI 领导控制台 或 文件预览 */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            {previewFile ? (
              <div className="flex flex-col h-full">
                {/* 文件预览标签栏 */}
                <div className="flex items-center h-8 px-2 border-b border-surface-200 dark:border-surface-700/60 bg-surface-50 dark:bg-surface-900/50 flex-shrink-0">
                  <span className="flex-1 text-xs text-gray-500 dark:text-gray-400 truncate px-2">
                    {previewFile.split(/[/\\]/).pop()}
                  </span>
                  <button
                    onClick={() => setPreviewFile(null)}
                    className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="关闭预览"
                  >
                    <X size={13} />
                  </button>
                </div>
                <FilePreview
                  filePath={previewFile}
                  onClose={() => setPreviewFile(null)}
                />
              </div>
            ) : (
              <WorkspaceChatPanel workspace={activeWorkspace} />
            )}
          </div>
        </div>

        {/* 底栏拖拽手柄 */}
        {!bottomPanelCollapsed && (
          <div
            onMouseDown={handleBottomDragStart}
            className={`h-1 flex-shrink-0 cursor-row-resize group/drag relative z-10 ${
              isDraggingBottom ? 'bg-teal-500/30' : 'hover:bg-teal-400/20'
            }`}
          >
            <div className={`absolute left-1/2 -translate-x-1/2 top-0 h-0.5 w-8 rounded-full transition-colors ${
              isDraggingBottom ? 'bg-teal-500' : 'bg-transparent group-hover/drag:bg-teal-400/60'
            }`} />
          </div>
        )}

        {/* 底栏：终端 & 审批 */}
        {!bottomPanelCollapsed && (
          <div
            className="flex-shrink-0 border-t border-surface-200 dark:border-surface-700/60"
            style={{ height: bottomPanelHeight }}
          >
            <TerminalPanel workspace={activeWorkspace} />
          </div>
        )}
      </div>

      {/* 创建工作区对话框 */}
      <WorkspaceCreateDialog
        open={showCreateWorkspace}
        onClose={() => setShowCreateWorkspace(false)}
        onCreated={(id) => {
          console.log('[WorkspacePage] 工作区已创建:', id)
          setShowCreateWorkspace(false)
        }}
      />
    </div>
  )
}
