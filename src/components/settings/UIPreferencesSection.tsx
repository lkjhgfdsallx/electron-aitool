import { Palette } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'

export function UIPreferencesSection() {
  const settings = useSettingsStore()

  const toggleItems = [
    {
      label: '显示 Token 用量',
      description: '在消息气泡下方显示 Token 消耗信息',
      value: settings.showTokenUsage,
      onChange: () => settings.toggleTokenUsage()
    },
    {
      label: '显示时间戳',
      description: '在消息气泡下方显示发送时间',
      value: settings.showTimestamp,
      onChange: () => settings.toggleTimestamp()
    },
    {
      label: 'Enter 发送消息',
      description: '按 Enter 键直接发送，Shift+Enter 换行',
      value: settings.sendWithEnter,
      onChange: () => settings.setSendWithEnter(!settings.sendWithEnter)
    },
    {
      label: '联网搜索',
      description: '允许 AI 在回答时搜索互联网获取最新信息',
      value: settings.webSearchEnabled,
      onChange: () => settings.toggleWebSearch()
    }
  ]

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <Palette size={20} className="text-accent-500" />
          界面偏好
        </h2>
        <p className="text-sm text-muted mt-1">
          自定义界面显示方式和交互行为
        </p>
      </div>

      {/* 设置列表 */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 divide-y divide-surface-200/80 dark:divide-surface-700/60">
        {toggleItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between px-5 py-4">
            <div>
              <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
                {item.label}
              </label>
              <p className="text-xs text-muted mt-0.5">{item.description}</p>
            </div>
            <button
              onClick={item.onChange}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                item.value ? 'bg-accent-500' : 'bg-surface-300 dark:bg-surface-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                  item.value ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
