import { useState } from 'react'
import { Cpu } from 'lucide-react'
import { useGlobalConfigStore } from '../../stores/global-config-store'
import { ConfigHierarchyView } from './ConfigHierarchyView'
import { SettingsSaveBar } from './ui/SettingsSaveBar'
import { SettingsHeader, SettingsSlider, SettingsToggle } from './ui'

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
    <div className="flex flex-col h-full">
      {/* 标题 */}
      <div className="flex-shrink-0 px-1 pb-4">
        <SettingsHeader icon={Cpu} title="模型参数" description="调整 AI 模型的推理参数，影响生成文本的风格和质量" />
      </div>

      {/* 可滚动内容区域 */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-1">

      {/* 参数卡片 */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-5">
        {/* Temperature */}
        <SettingsSlider
          label="温度 (Temperature)"
          value={temperature}
          min={0}
          max={2}
          step={0.1}
          onChange={(v) => setTemperature(v)}
        />
        <div className="flex justify-between text-xs text-muted -mt-3">
          <span>精确 (0)</span>
          <span>创意 (2)</span>
        </div>

        {/* Max Tokens */}
        <SettingsSlider
          label="最大 Tokens"
          value={maxTokens}
          min={256}
          max={16384}
          step={256}
          onChange={(v) => setMaxTokens(v)}
        />

        {/* 流式输出 */}
        <SettingsToggle
          label="流式输出"
          description="启用后 AI 将逐字输出回复"
          checked={streamEnabled}
          onChange={() => setStreamEnabled(!streamEnabled)}
        />
      </div>

      {/* 配置层级可视化 — 保持在此处，非 sticky */}
      <ConfigHierarchyView />
      </div>

      {/* Sticky 底部保存栏 */}
      <SettingsSaveBar
        onSave={handleSave}
        onReset={handleReset}
        isDirty={true}
        savedFeedback={showSaved}
        saveLabel="保存设置"
        resetLabel="恢复默认"
        shortcut="Ctrl+S"
      />
    </div>
  )
}
