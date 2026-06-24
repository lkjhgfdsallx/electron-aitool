import { ChatWindow } from '../chat/ChatWindow'
import { TopBar } from './TopBar'
import { SettingsPage } from '../settings/SettingsPage'
import type { ViewMode, SettingsSection } from '../settings/SettingsNavRail'

interface MainAreaProps {
  viewMode: ViewMode
  settingsSection: SettingsSection
  onOpenSettings: (section?: SettingsSection) => void
  onCloseSettings: () => void
}

export function MainArea({ viewMode, settingsSection, onOpenSettings, onCloseSettings }: MainAreaProps) {
  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      <TopBar
        viewMode={viewMode}
        onOpenSettings={() => onOpenSettings()}
        onBackToChat={onCloseSettings}
      />

      <div className="flex-1 flex min-h-0">
        {viewMode === 'chat' ? (
          <ChatWindow />
        ) : (
          <SettingsPage
            defaultSection={settingsSection}
            onBack={onCloseSettings}
          />
        )}
      </div>
    </div>
  )
}
