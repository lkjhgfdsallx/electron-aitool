import { useState, useCallback } from 'react'
import { SettingsNavRail, type SettingsSection } from './SettingsNavRail'
import { AIProviderManager } from './AIProviderManager'
import { AgentManager } from './AgentManager'
import { PromptManager } from './PromptManager'
import { SkillManager } from './SkillManager'
import { MCPConfig } from './MCPConfig'
import { KnowledgeBaseSettings } from './KnowledgeBaseSettings'
import { ToolEditor } from './ToolEditor'
import { ModelParamsSection } from './ModelParamsSection'
import { UIPreferencesSection } from './UIPreferencesSection'
import { DataManagementSection } from './DataManagementSection'
import { SettingsSearchBar } from './SettingsSearchBar'
import { WorkspaceSettings } from './WorkspaceSettings'

interface SettingsPageProps {
  defaultSection?: SettingsSection
  onBack: () => void
  onOpenWorkspace: () => void
}

export function SettingsPage({ defaultSection = 'ai-providers', onBack, onOpenWorkspace }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(defaultSection)

  const handleNavigateToSection = (section: string) => {
    setActiveSection(section as SettingsSection)
  }

  // 搜索结果导航回调
  const handleSearchNavigate = useCallback((section: SettingsSection, _settingId: string) => {
    setActiveSection(section)
  }, [])

  const renderContent = () => {
    switch (activeSection) {
      case 'ai-providers':
        return <AIProviderManager />
      case 'agents':
        return <AgentManager />
      case 'prompts':
        return <PromptManager />
      case 'skills':
        return <SkillManager />
      case 'mcp':
        return <MCPConfig />
      case 'tools':
        return <ToolEditor />
      case 'workspace':
        return <WorkspaceSettings onOpenWorkspace={onOpenWorkspace} />
      case 'knowledge-base':
        return <KnowledgeBaseSettings />
      case 'model-params':
        return <ModelParamsSection />
      case 'ui-prefs':
        return <UIPreferencesSection />
      case 'data-mgmt':
        return <DataManagementSection onNavigateToSection={handleNavigateToSection} />
      default:
        return <AIProviderManager />
    }
  }

  return (
    <div className="flex w-full h-full animate-fade-in" data-settings-page>
      {/* 左侧导航栏 */}
      <SettingsNavRail
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onBack={onBack}
      />

      {/* 右侧内容区 */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-6">
          {/* 全局搜索栏 */}
          <div className="mb-6">
            <SettingsSearchBar onNavigate={handleSearchNavigate} />
          </div>

          {/* 设置内容 */}
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
