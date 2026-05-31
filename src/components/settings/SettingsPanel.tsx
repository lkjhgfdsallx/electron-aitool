import { useState } from 'react'
import { X, Save, RotateCcw, Trash2 } from 'lucide-react'
import { useGlobalConfigStore } from '../../stores/global-config-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useConversationStore } from '../../stores/conversation-store'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const config = useGlobalConfigStore()
  const settings = useSettingsStore()
  const { clearMessages, conversations } = useConversationStore()

  const [apiKey, setApiKey] = useState(config.apiKey)
  const [baseUrl, setBaseUrl] = useState(config.baseUrl)
  const [defaultModel, setDefaultModel] = useState(config.defaultModel)
  const [temperature, setTemperature] = useState(config.temperature)
  const [maxTokens, setMaxTokens] = useState(config.maxTokens)
  const [streamEnabled, setStreamEnabled] = useState(config.streamEnabled)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    config.updateConfig({
      apiKey,
      baseUrl,
      defaultModel,
      temperature,
      maxTokens,
      streamEnabled
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClearAll = () => {
    if (confirm('确定要清除所有对话数据吗？此操作不可恢复。')) {
      for (const conv of conversations) {
        clearMessages(conv.id)
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold">设置</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* API 配置 */}
        <section>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            API 配置
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">默认模型</label>
              <input
                type="text"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                placeholder="gpt-4o-mini"
                className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        </section>

        {/* 模型参数 */}
        <section>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            模型参数
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                温度 (Temperature): {temperature}
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                最大 Tokens: {maxTokens}
              </label>
              <input
                type="range"
                min="256"
                max="16384"
                step="256"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-500">流式输出</label>
              <button
                onClick={() => setStreamEnabled(!streamEnabled)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  streamEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    streamEnabled ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* 界面偏好 */}
        <section>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            界面偏好
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-500">显示 Token 用量</label>
              <button
                onClick={() => settings.toggleTokenUsage()}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  settings.showTokenUsage ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    settings.showTokenUsage ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-500">显示时间戳</label>
              <button
                onClick={() => settings.toggleTimestamp()}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  settings.showTimestamp ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    settings.showTimestamp ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-500">Enter 发送消息</label>
              <button
                onClick={() => settings.setSendWithEnter(!settings.sendWithEnter)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  settings.sendWithEnter ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    settings.sendWithEnter ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* 数据管理 */}
        <section>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            数据管理
          </h3>
          <button
            onClick={handleClearAll}
            className="flex items-center gap-2 px-3 py-2 text-sm text-red-500 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <Trash2 size={14} /> 清除所有对话数据
          </button>
        </section>
      </div>

      {/* 底部按钮 */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm"
        >
          <Save size={14} />
          {saved ? '已保存' : '保存设置'}
        </button>
        <button
          onClick={() => {
            config.resetConfig()
            settings.resetPreferences()
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <RotateCcw size={14} /> 恢复默认
        </button>
      </div>
    </div>
  )
}
