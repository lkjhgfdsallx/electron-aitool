import {
  ArrowLeft,
  Globe,
  Bot,
  FileText,
  Plug,
  Wrench,
  Database,
  Cpu,
  Palette,
  HardDrive
} from 'lucide-react'

export type ViewMode = 'chat' | 'knowledge-base' | 'settings'

export type SettingsSection =
  | 'ai-providers'
  | 'agents'
  | 'prompts'
  | 'mcp'
  | 'tools'
  | 'knowledge-base'
  | 'model-params'
  | 'ui-prefs'
  | 'data-mgmt'

export const SETTINGS_SECTIONS: {
  key: SettingsSection
  label: string
  icon: typeof Globe
  color: string
}[] = [
  { key: 'ai-providers', label: 'AI 源', icon: Globe, color: 'text-blue-500' },
  { key: 'agents', label: 'Agent', icon: Bot, color: 'text-accent-500' },
  { key: 'prompts', label: '提示词', icon: FileText, color: 'text-orange-500' },
  { key: 'mcp', label: 'MCP', icon: Plug, color: 'text-emerald-500' },
  { key: 'tools', label: '工具', icon: Wrench, color: 'text-indigo-500' },
  { key: 'knowledge-base', label: '知识库', icon: Database, color: 'text-violet-500' },
  { key: 'model-params', label: '模型', icon: Cpu, color: 'text-cyan-500' },
  { key: 'ui-prefs', label: '界面', icon: Palette, color: 'text-pink-500' },
  { key: 'data-mgmt', label: '数据', icon: HardDrive, color: 'text-amber-500' }
]

interface SettingsNavRailProps {
  activeSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  onBack: () => void
}

export function SettingsNavRail({ activeSection, onSectionChange, onBack }: SettingsNavRailProps) {
  return (
    <div className="w-[72px] flex-shrink-0 border-r border-surface-200/80 dark:border-surface-700/60 bg-surface-50/80 dark:bg-surface-950/80 flex flex-col items-center py-3 gap-1">
      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="flex flex-col items-center gap-0.5 p-2 rounded-xl text-muted hover:text-surface-600 dark:hover:text-surface-300 hover:bg-surface-200/60 dark:hover:bg-surface-800/60 transition-all mb-2"
        title="返回对话"
      >
        <ArrowLeft size={18} />
        <span className="text-[10px] font-medium">对话</span>
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
            title={section.label}
          >
            {/* 活跃指示条 */}
            {isActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent-500 rounded-r-full" />
            )}
            <Icon size={18} className={isActive ? section.color : ''} />
            <span className="text-[10px] font-medium">{section.label}</span>
          </button>
        )
      })}
    </div>
  )
}
