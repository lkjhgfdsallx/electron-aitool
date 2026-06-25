import { ChatWindow } from '../chat/ChatWindow'
import { TopBar } from './TopBar'
import { SettingsPage } from '../settings/SettingsPage'
import { KnowledgeBasePage } from '../knowledge-base/KnowledgeBasePage'
import type { ViewMode, SettingsSection } from '../settings/SettingsNavRail'

interface MainAreaProps {
  viewMode: ViewMode
  settingsSection: SettingsSection
  onOpenSettings: (section?: SettingsSection) => void
  onCloseSettings: () => void
}

export function MainArea({ viewMode, settingsSection, onOpenSettings, onCloseSettings }: MainAreaProps) {
  const renderContent = () => {
    switch (viewMode) {
      case 'knowledge-base':
        return (
          <KnowledgeBasePage
            onBack={onCloseSettings}
            onOpenSettings={(section) => onOpenSettings(section as SettingsSection)}
          />
        )
      case 'settings':
        return (
          <SettingsPage
            defaultSection={settingsSection}
            onBack={onCloseSettings}
          />
        )
      case 'chat':
      default:
        return (
          <>
            <TopBar
              viewMode={viewMode}
              onOpenSettings={() => onOpenSettings()}
              onBackToChat={onCloseSettings}
            />
            <ChatWindow onOpenAgentManager={() => onOpenSettings('agents')} onOpenPromptManager={() => onOpenSettings('prompts')} />
          </>
        )
    }
  }

  if (viewMode === 'knowledge-base' || viewMode === 'settings') {
    return (
      <div className="flex-1 flex flex-col min-w-0 relative">
        {renderContent()}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      <TopBar
        viewMode={viewMode}
        onOpenSettings={() => onOpenSettings()}
        onBackToChat={onCloseSettings}
      />

      <div className="flex-1 flex min-h-0">
        <ChatWindow onOpenAgentManager={() => onOpenSettings('agents')} onOpenPromptManager={() => onOpenSettings('prompts')} />
      </div>
    </div>
  )
}
