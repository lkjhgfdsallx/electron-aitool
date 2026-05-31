import { ChatWindow } from '../chat/ChatWindow'
import { TopBar } from './TopBar'
import { SettingsPanel } from '../settings/SettingsPanel'
import { AgentManager } from '../settings/AgentManager'
import { KnowledgeBasePanel } from '../settings/KnowledgeBasePanel'
import { ToolEditor } from '../settings/ToolEditor'
import { MCPConfig } from '../settings/MCPConfig'
import type { PanelType } from '../../App'

interface MainAreaProps {
  activePanel: PanelType
  setActivePanel: (panel: PanelType) => void
}

export function MainArea({ activePanel, setActivePanel }: MainAreaProps) {
  const closePanel = () => setActivePanel('none')

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      <TopBar
        onOpenSettings={() => setActivePanel('settings')}
      />

      <div className="flex-1 flex min-h-0">
        <ChatWindow
          onOpenPromptManager={() => setActivePanel('agents')}
          onOpenAgentManager={() => setActivePanel('agents')}
        />
      </div>

      {/* 侧边面板 */}
      {activePanel !== 'none' && (
        <div className="absolute inset-0 z-30 flex justify-end">
          {/* 背景遮罩 */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={closePanel}
          />
          {/* 面板内容 */}
          <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 shadow-xl overflow-y-auto">
            {activePanel === 'settings' && <SettingsPanel onClose={closePanel} />}
            {activePanel === 'agents' && <AgentManager onClose={closePanel} />}
            {activePanel === 'knowledge-base' && <KnowledgeBasePanel onClose={closePanel} />}
            {activePanel === 'tools' && <ToolEditor onClose={closePanel} />}
            {activePanel === 'mcp' && <MCPConfig onClose={closePanel} />}
          </div>
        </div>
      )}
    </div>
  )
}
