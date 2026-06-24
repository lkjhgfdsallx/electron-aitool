import { useState } from 'react'
import { SettingsNavRail, type SettingsSection } from './SettingsNavRail'
import { AIProviderManager } from './AIProviderManager'
import { AgentManager } from './AgentManager'
import { PromptManager } from './PromptManager'
import { MCPConfig } from './MCPConfig'
import { KnowledgeBasePanel } from './KnowledgeBasePanel'
import { ToolEditor } from './ToolEditor'
import { ModelParamsSection } from './ModelParamsSection'
import { UIPreferencesSection } from './UIPreferencesSection'
import { DataManagementSection } from './DataManagementSection'

interface SettingsPageProps {
  defaultSection?: SettingsSection
  onBack: () => void
}

export function SettingsPage({ defaultSection = 'ai-providers', onBack }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(defaultSection)

  const handleNavigateToSection = (section: string) => {
    setActiveSection(section as SettingsSection)
  }

  const renderContent = () => {
    switch (activeSection) {
      case 'ai-providers':
        return <AIProviderManager />
      case 'agents':
        return <AgentManager />
      case 'prompts':
        return <PromptManager />
      case 'mcp':
        return <MCPConfig />
      case 'tools':
        return <ToolEditor />
      case 'knowledge-base':
        return <KnowledgeBasePanel />
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
    <div className="flex w-full h-full animate-fade-in">
      {/* 左侧导航栏 */}
      <SettingsNavRail
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onBack={onBack}
      />

      {/* 右侧内容区 */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-6">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
