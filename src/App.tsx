import { useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { MainArea } from './components/layout/MainArea'

export type PanelType = 'none' | 'settings' | 'agents' | 'knowledge-base' | 'tools' | 'mcp'

export default function App() {
  const [activePanel, setActivePanel] = useState<PanelType>('none')

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden select-none">
      {/* 侧边栏 */}
      <Sidebar
        onOpenAgentManager={() => setActivePanel('agents')}
        onOpenMCP={() => setActivePanel('mcp')}
      />

      {/* 主区域 */}
      <MainArea activePanel={activePanel} setActivePanel={setActivePanel} />
    </div>
  )
}
