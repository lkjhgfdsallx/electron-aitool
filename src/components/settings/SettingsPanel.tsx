import { useState } from 'react'
import { X, Save, RotateCcw, Trash2, Key, Cpu, Palette, Database, Check } from 'lucide-react'
import { useGlobalConfigStore } from '../../stores/global-config-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useConversationStore } from '../../stores/conversation-store'

type TabKey = 'api' | 'model' | 'ui' | 'data'

const tabs: { key: TabKey; label: string; icon: typeof Key }[] = [
  { key: 'api', label: 'API 配置', icon: Key },
  { key: 'model', label: '模型参数', icon: Cpu },
  { key: 'ui', label: '界面偏好', icon: Palette },
  { key: 'data', label: '数据管理', icon: Database }
]

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const config = useGlobalConfigStore()
  const settings = useSettingsStore()
  const { clearMessages, conversations } = useConversationStore()

  const [activeTab, setActiveTab] = useState<TabKey>('api')
  const [apiKey, setApiKey] = useState(config.apiKey)
  const [baseUrl, setBaseUrl] = useState(config.baseUrl)
  const [defaultModel, setDefaultModel] = useState(config.defaultModel)
  const [temperature, setTemperature] = useState(config.temperature)
  const [maxTokens, setMaxTokens] = useState(config.maxTokens)
  const [streamEnabled, setStreamEnabled] = useState(config.streamEnabled)
  const [showSaved, setShowSaved] = useState(false)

  const handleSave = () => {
    config.updateConfig({
      apiKey,
      baseUrl,
      defaultModel,
      temperature,
      maxTokens,
      streamEnabled
    })
    setShowSaved(true)
    setTimeout(() => setShowSaved(false), 2000)
  }

  const handleClearAll = () => {
    if (confirm('确定要清除所有对话数据吗？此操作不可恢复。')) {
      for (const conv of conversations) {
        clearMessages(conv.id)
      }
    }
  }

  const inputClass =
    'w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all'

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200/80 dark:border-surface-700/60">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">设置</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-muted hover:text-gray-700 dark:hover:text-gray-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
        >
          <X size={18} />
        </button>
      </div>

      {/* 标签页导航 */}
      <div className="flex border-b border-surface-200/80 dark:border-surface-700/60">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-accent-600 dark:text-accent-400 border-b-2 border-accent-500'
                  : 'text-muted hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* 标签页内容 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* API 配置 */}
        {activeTab === 'api' && (
          <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-4 space-y-4 animate-fade-in">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <Key size={15} className="text-accent-500" /> API 配置
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1.5">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Base URL</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">默认模型</label>
                <input
                  type="text"
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        )}

        {/* 模型参数 */}
        {activeTab === 'model' && (
          <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-4 space-y-4 animate-fade-in">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <Cpu size={15} className="text-accent-500" /> 模型参数
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1.5">
                  温度 (Temperature): {temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-accent-500"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">
                  最大 Tokens: {maxTokens}
                </label>
                <input
                  type="range"
                  min="256"
                  max="16384"
                  step="256"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  className="w-full accent-accent-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted">流式输出</label>
                <button
                  onClick={() => setStreamEnabled(!streamEnabled)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    streamEnabled ? 'bg-accent-500' : 'bg-surface-300 dark:bg-surface-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                      streamEnabled ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 界面偏好 */}
        {activeTab === 'ui' && (
          <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-4 space-y-4 animate-fade-in">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <Palette size={15} className="text-accent-500" /> 界面偏好
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted">显示 Token 用量</label>
                <button
                  onClick={() => settings.toggleTokenUsage()}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    settings.showTokenUsage ? 'bg-accent-500' : 'bg-surface-300 dark:bg-surface-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                      settings.showTokenUsage ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted">显示时间戳</label>
                <button
                  onClick={() => settings.toggleTimestamp()}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    settings.showTimestamp ? 'bg-accent-500' : 'bg-surface-300 dark:bg-surface-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                      settings.showTimestamp ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted">Enter 发送消息</label>
                <button
                  onClick={() => settings.setSendWithEnter(!settings.sendWithEnter)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    settings.sendWithEnter ? 'bg-accent-500' : 'bg-surface-300 dark:bg-surface-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                      settings.sendWithEnter ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 数据管理 */}
        {activeTab === 'data' && (
          <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-4 space-y-4 animate-fade-in">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <Database size={15} className="text-accent-500" /> 数据管理
            </h3>
            <button
              onClick={handleClearAll}
              className="flex items-center gap-2 px-4 py-2 text-sm text-danger-500 border border-danger-200 dark:border-danger-800/60 rounded-xl hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-colors"
            >
              <Trash2 size={14} /> 清除所有对话数据
            </button>
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="border-t border-surface-200/80 dark:border-surface-700/60 pt-4 px-4 pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white rounded-xl px-4 py-2 text-sm font-medium transition-all shadow-sm"
          >
            <Save size={14} />
            保存设置
          </button>
          <button
            onClick={() => {
              config.resetConfig()
              settings.resetPreferences()
            }}
            className="flex items-center gap-2 bg-surface-200 dark:bg-surface-700 text-gray-600 dark:text-gray-400 rounded-xl px-4 py-2 text-sm font-medium transition-all hover:bg-surface-300 dark:hover:bg-surface-600"
          >
            <RotateCcw size={14} /> 恢复默认
          </button>
        </div>
        {/* 保存成功提示 */}
        {showSaved && (
          <div className="animate-fade-in-up text-xs text-success-600 flex items-center gap-1 mt-2">
            <Check size={14} /> 已保存
          </div>
        )}
      </div>
    </div>
  )
}
