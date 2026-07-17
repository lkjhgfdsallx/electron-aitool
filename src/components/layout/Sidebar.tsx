import { Plus, PanelLeftClose, PanelLeft, Settings, Database, Briefcase } from 'lucide-react'
import { ConversationList } from '../conversation/ConversationList'
import { ResizeHandle } from '../shared/ResizeHandle'
import { BrandLogo } from '../brand'
import { useConversationStore } from '../../stores/conversation-store'
import { useSettingsStore } from '../../stores'
import { useAppTranslation } from '@/i18n/hooks'
import type { ViewMode, SettingsSection } from '../settings/SettingsNavRail'

interface SidebarProps {
  viewMode: ViewMode
  onOpenSettings?: (section?: SettingsSection) => void
  onOpenKnowledgeBase?: () => void
  onOpenWorkspace?: () => void
  onBackToChat?: () => void
}

export function Sidebar({ viewMode, onOpenSettings, onOpenKnowledgeBase, onOpenWorkspace, onBackToChat }: SidebarProps) {
  const { t } = useAppTranslation()
  const { createConversation } = useConversationStore()
  const { sidebarCollapsed, toggleSidebar, sidebarWidth, setSidebarWidth } = useSettingsStore()

  if (sidebarCollapsed) {
    return (
      <div className="flex-shrink-0 w-14 border-r border-surface-200 dark:border-surface-700/60 bg-surface-50 dark:bg-surface-950 flex flex-col items-center py-3 gap-1.5">
        <button
          onClick={toggleSidebar}
          className="p-2.5 rounded-xl hover:bg-surface-200 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
          title={t('nav.expandSidebar')}
          aria-label={t('nav.expandSidebar')}
        >
          <PanelLeft size={18} />
        </button>

        {/* 新建对话 - 渐变按钮 */}
        <button
          onClick={() => createConversation()}
          className="mt-1 p-2.5 rounded-xl bg-gradient-brand text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95"
          title={t('nav.newConversation')}
          aria-label={t('nav.newConversation')}
        >
          <Plus size={18} />
        </button>

        {/* 工作区入口（折叠模式） */}
        <button
          onClick={viewMode === 'workspace' ? onBackToChat : onOpenWorkspace}
          className={`p-2.5 rounded-xl transition-all ${
            viewMode === 'workspace'
              ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400'
              : 'hover:bg-surface-200 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
          title={viewMode === 'workspace' ? t('nav.backToChat') : t('nav.workspace')}
          aria-label={viewMode === 'workspace' ? t('nav.backToChat') : t('nav.workspace')}
        >
          <Briefcase size={18} />
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
          title={t('nav.knowledgeBase')}
          aria-label={t('nav.knowledgeBase')}
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
          title={viewMode === 'settings' ? t('nav.backToChat') : t('nav.settings')}
          aria-label={viewMode === 'settings' ? t('nav.backToChat') : t('nav.settings')}
        >
          <Settings size={18} />
        </button>

        <button
          onClick={toggleSidebar}
          className="p-2.5 rounded-xl hover:bg-surface-200 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
          title={t('nav.collapseSidebar')}
          aria-label={t('nav.collapseSidebar')}
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
          <BrandLogo size="md" showVersion />
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
            title={t('nav.collapseSidebar')}
            aria-label={t('nav.collapseSidebar')}
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
          {t('nav.newConversation')}
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
        {/* 工作区入口 */}
        <button
          onClick={viewMode === 'workspace' ? onBackToChat : onOpenWorkspace}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
            viewMode === 'workspace'
              ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 font-medium'
              : 'text-gray-500 dark:text-gray-400 hover:bg-surface-200/60 dark:hover:bg-surface-800/60 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Briefcase size={16} />
          <span>{viewMode === 'workspace' ? t('nav.backToChat') : t('nav.workspace')}</span>
        </button>

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
          <span>{t('nav.knowledgeBase')}</span>
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
          <span>{viewMode === 'settings' ? t('nav.backToChat') : t('nav.settings')}</span>
        </button>
      </div>

      {/* 拖拽调整宽度的手柄 */}
      <ResizeHandle
        direction="horizontal"
        size={sidebarWidth}
        onResize={setSidebarWidth}
        min={220}
        max={420}
        className="absolute top-0 right-0 h-full w-1.5 group/drag z-10 hover:bg-accent-400/20"
      />
    </div>
  )
}
