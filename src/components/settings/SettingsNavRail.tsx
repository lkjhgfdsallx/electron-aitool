import {
  ArrowLeft,
  Globe,
  Bot,
  FileText,
  Zap,
  Plug,
  Wrench,
  Database,
  Cpu,
  Palette,
  HardDrive,
  Briefcase
} from 'lucide-react'
import { useAppTranslation } from '@/i18n/hooks'

export type ViewMode = 'chat' | 'workspace' | 'knowledge-base' | 'settings'

export type SettingsSection =
  | 'ai-providers'
  | 'agents'
  | 'prompts'
  | 'skills'
  | 'mcp'
  | 'tools'
  | 'workspace'
  | 'knowledge-base'
  | 'model-params'
  | 'ui-prefs'
  | 'data-mgmt'

export const SETTINGS_SECTIONS: {
  key: SettingsSection
  label: string
  labelKey: string
  icon: typeof Globe
  color: string
}[] = [
  { key: 'ai-providers', label: 'AI 源', labelKey: 'settings.aiProvidersShort', icon: Globe, color: 'text-accent-500' },
  { key: 'agents', label: 'Agent', labelKey: 'agent.agent', icon: Bot, color: 'text-accent-500' },
  { key: 'prompts', label: '提示词', labelKey: 'settings.promptsShort', icon: FileText, color: 'text-accent-500' },
  { key: 'skills', label: 'Skills', labelKey: 'skill.skills', icon: Zap, color: 'text-accent-500' },
  { key: 'mcp', label: 'MCP', labelKey: 'settings.mcp', icon: Plug, color: 'text-accent-500' },
  { key: 'tools', label: '工具', labelKey: 'settings.toolsShort', icon: Wrench, color: 'text-accent-500' },
  { key: 'workspace', label: '工作区', labelKey: 'settings.workspaceShort', icon: Briefcase, color: 'text-accent-500' },
  { key: 'knowledge-base', label: '知识库', labelKey: 'settings.knowledgeBaseShort', icon: Database, color: 'text-accent-500' },
  { key: 'model-params', label: '模型', labelKey: 'settings.modelParamsShort', icon: Cpu, color: 'text-accent-500' },
  { key: 'ui-prefs', label: '界面', labelKey: 'settings.uiPrefsShort', icon: Palette, color: 'text-accent-500' },
  { key: 'data-mgmt', label: '数据', labelKey: 'settings.dataManagementShort', icon: HardDrive, color: 'text-accent-500' }
]

interface SettingsNavRailProps {
  activeSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  onBack: () => void
}

export function SettingsNavRail({ activeSection, onSectionChange, onBack }: SettingsNavRailProps) {
  const { t } = useAppTranslation()

  return (
    <div className="w-[72px] flex-shrink-0 border-r border-surface-200/80 dark:border-surface-700/60 bg-surface-50/80 dark:bg-surface-950/80 flex flex-col items-center py-3 gap-1">
      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="flex flex-col items-center gap-0.5 p-2 rounded-xl text-muted hover:text-surface-600 dark:hover:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-800/60 transition-all mb-2"
        title={t('settings.backToChat')}
      >
        <ArrowLeft size={18} />
        <span className="text-[10px] font-medium">{t('nav.chat')}</span>
      </button>

      {/* 分隔线 */}
      <div className="w-8 mb-1">
        <div className="divider-gradient" />
      </div>

      {/* 导航项 */}
      {SETTINGS_SECTIONS.map((section) => {
        const Icon = section.icon
        const isActive = activeSection === section.key
        return (
          <button
            key={section.key}
            onClick={() => onSectionChange(section.key)}
            className={`
              flex flex-col items-center gap-0.5 w-14 py-1.5 rounded-xl transition-all relative
              ${isActive
                ? 'bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400'
                : 'text-muted hover:text-surface-600 dark:hover:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-800/60'
              }
            `}
            title={t(section.labelKey)}
          >
            {/* 活跃指示条 */}
            {isActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent-500 rounded-r-full" />
            )}
            <Icon size={18} className={isActive ? section.color : ''} />
            <span className="text-[10px] font-medium">{t(section.labelKey)}</span>
          </button>
        )
      })}
    </div>
  )
}
