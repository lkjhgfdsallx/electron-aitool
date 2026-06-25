import { useState } from 'react'
import { Cpu, Save, RotateCcw, Check } from 'lucide-react'
import { useGlobalConfigStore } from '../../stores/global-config-store'
import { ConfigHierarchyView } from './ConfigHierarchyView'

export function ModelParamsSection() {
  const config = useGlobalConfigStore()

  const [temperature, setTemperature] = useState(config.temperature)
  const [maxTokens, setMaxTokens] = useState(config.maxTokens)
  const [streamEnabled, setStreamEnabled] = useState(config.streamEnabled)
  const [showSaved, setShowSaved] = useState(false)

  const handleSave = () => {
    config.updateConfig({ temperature, maxTokens, streamEnabled })
    setShowSaved(true)
    setTimeout(() => setShowSaved(false), 2000)
  }

  const handleReset = () => {
    config.resetConfig()
    setTemperature(config.temperature)
    setMaxTokens(config.maxTokens)
    setStreamEnabled(config.streamEnabled)
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <Cpu size={20} className="text-accent-500" />
          模型参数
        </h2>
        <p className="text-sm text-muted mt-1">
          调整 AI 模型的推理参数，影响生成文本的风格和质量
        </p>
      </div>

      {/* 参数卡片 */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-5">
        {/* Temperature */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
              温度 (Temperature)
            </label>
            <span className="text-sm font-mono text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-900/20 px-2 py-0.5 rounded-md">
              {temperature}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full accent-accent-500"
          />
          <div className="flex justify-between text-xs text-muted mt-1">
            <span>精确 (0)</span>
            <span>创意 (2)</span>
          </div>
        </div>

        {/* Max Tokens */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
              最大 Tokens
            </label>
            <span className="text-sm font-mono text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-900/20 px-2 py-0.5 rounded-md">
              {maxTokens}
            </span>
          </div>
          <input
            type="range"
            min="256"
            max="16384"
            step="256"
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value))}
            className="w-full accent-accent-500"
          />
          <div className="flex justify-between text-xs text-muted mt-1">
            <span>256</span>
            <span>16384</span>
          </div>
        </div>

        {/* 流式输出 */}
        <div className="flex items-center justify-between py-2">
          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">流式输出</label>
            <p className="text-xs text-muted mt-0.5">启用后 AI 将逐字输出回复</p>
          </div>
          <button
            onClick={() => setStreamEnabled(!streamEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              streamEnabled ? 'bg-accent-500' : 'bg-surface-300 dark:bg-surface-600'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                streamEnabled ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white rounded-xl px-4 py-2 text-sm font-medium transition-all shadow-sm"
        >
          <Save size={14} />
          保存设置
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 bg-surface-200 dark:bg-surface-700 text-muted rounded-xl px-4 py-2 text-sm font-medium transition-all hover:bg-surface-300 dark:hover:bg-surface-600"
        >
          <RotateCcw size={14} /> 恢复默认
        </button>
        {showSaved && (
          <div className="animate-fade-in-up text-xs text-success-600 flex items-center gap-1">
            <Check size={14} /> 已保存
          </div>
        )}
      </div>

      {/* 配置层级可视化 */}
      <ConfigHierarchyView />
    </div>
  )
}
