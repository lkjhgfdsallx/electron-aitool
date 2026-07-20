import { ChatWindow } from '../chat/ChatWindow'
import { TopBar } from './TopBar'
import { SettingsPage } from '../settings/SettingsPage'
import { KnowledgeBasePage } from '../knowledge-base/KnowledgeBasePage'
import { WorkspacePage } from '../workspace/WorkspacePage'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import type { ViewMode, SettingsSection } from '../settings/SettingsNavRail'

interface MainAreaProps {
  viewMode: ViewMode
  settingsSection: SettingsSection
  /** 打开设置时可选：直接进入指定 Agent / AI 源编辑态 */
  settingsEditId?: string
  onOpenSettings: (section?: SettingsSection, editId?: string) => void
  onCloseSettings: () => void
  onOpenWorkspace: () => void
}

export function MainArea({ viewMode, settingsSection, settingsEditId, onOpenSettings, onCloseSettings, onOpenWorkspace }: MainAreaProps) {
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
            initialEditId={settingsEditId}
            onBack={onCloseSettings}
            onOpenWorkspace={onOpenWorkspace}
          />
        )
      case 'workspace':
        return (
          <WorkspacePage
            onBackToChat={onCloseSettings}
            onOpenSettings={(section) => onOpenSettings(section as SettingsSection)}
          />
        )
      case 'chat':
      default:
        return (
          <>
            <TopBar
              viewMode={viewMode}
              onOpenSettings={(section, editId) => onOpenSettings(section, editId)}
              onBackToChat={onCloseSettings}
            />
            <ChatWindow
              onOpenAgentManager={(agentId) => onOpenSettings('agents', agentId)}
              onOpenPromptManager={() => onOpenSettings('prompts')}
              onOpenSettings={onOpenSettings}
            />
          </>
        )
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      <ErrorBoundary>
        {viewMode === 'knowledge-base' || viewMode === 'settings' || viewMode === 'workspace' ? (
          renderContent()
        ) : (
          <>
            <TopBar
              viewMode={viewMode}
              onOpenSettings={(section, editId) => onOpenSettings(section, editId)}
              onBackToChat={onCloseSettings}
            />
            <div className="flex-1 flex min-h-0">
              <ChatWindow
                onOpenAgentManager={(agentId) => onOpenSettings('agents', agentId)}
                onOpenPromptManager={() => onOpenSettings('prompts')}
                onOpenSettings={onOpenSettings}
              />
            </div>
          </>
        )}
      </ErrorBoundary>
    </div>
  )
}
