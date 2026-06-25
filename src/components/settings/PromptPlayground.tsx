import { useState, useCallback, useMemo } from 'react'
import {
  ArrowLeft,
  Play,
  Square,
  Loader2,
  Copy,
  Check,
  Variable,
  Zap,
} from 'lucide-react'
import { useAIProviderStore } from '../../stores/ai-provider-store'
import { PromptVariableEngine } from '../../services/prompt-variable-engine'
import { aiService } from '../../services/ai-service'
import type { Prompt, PromptVariable, ResolvedAIConfig } from '../../types'

interface PromptPlaygroundProps {
  prompt: Prompt
  onBack: () => void
}

export function PromptPlayground({ prompt, onBack }: PromptPlaygroundProps) {
  const { providers, resolveConfig } = useAIProviderStore()

  // 变量值
  const [variableValues, setVariableValues] = useState<Record<string, unknown>>({})
  // Provider/Model 选择
  const [selectedProviderId, setSelectedProviderId] = useState<string>('')
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  // 输出
  const [output, setOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  // 当前选中 provider 的模型列表
  const availableModels = useMemo(() => {
    const provider = providers.find((p) => p.id === selectedProviderId)
    return provider?.models ?? []
  }, [providers, selectedProviderId])

  // 渲染预览
  const preview = useMemo(() => {
    const text = prompt.sections
      ? prompt.sections.filter((s) => s.enabled).map((s) => s.content).join('\n\n')
      : prompt.content
    return PromptVariableEngine.render(text, prompt.variables, variableValues)
  }, [prompt, variableValues])

  // 变量校验
  const validation = useMemo(() => {
    return PromptVariableEngine.validate(prompt.variables, variableValues)
  }, [prompt.variables, variableValues])

  // 运行测试
  const handleRun = useCallback(async () => {
    if (!selectedProviderId || !selectedModelId) {
      setError('请选择 AI Provider 和模型')
      return
    }

    setIsRunning(true)
    setError(null)
    setOutput('')

    try {
      const config = resolveConfig(selectedProviderId, selectedModelId)
      if (!config) {
        setError('无法解析 AI 配置')
        setIsRunning(false)
        return
      }

      const controller = new AbortController()
      setAbortController(controller)

      let result = ''
      await aiService.streamChat(
        [],
        config as ResolvedAIConfig,
        preview.content, // 作为 system prompt
        [],
        controller.signal,
        {
          onToken: (token) => {
            result += token
            setOutput(result)
          },
          onDone: () => {
            setIsRunning(false)
            setAbortController(null)
          },
          onError: (err) => {
            setError(err)
            setIsRunning(false)
            setAbortController(null)
          },
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '运行失败')
      setIsRunning(false)
    }
  }, [selectedProviderId, selectedModelId, resolveConfig, preview.content])

  const handleStop = useCallback(() => {
    abortController?.abort()
    setIsRunning(false)
    setAbortController(null)
  }, [abortController])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [output])

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-surface-200/80 dark:border-surface-700/60">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-muted transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
            <Zap size={16} className="text-amber-500" />
            Playground 测试
          </h3>
          <p className="text-xs text-muted">{prompt.name}</p>
        </div>
      </div>

      {/* 主内容 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧：变量输入 */}
        <div className="w-80 flex-shrink-0 border-r border-surface-200/80 dark:border-surface-700/60 overflow-y-auto p-4 space-y-4">
          {/* 模型选择 */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-surface-700 dark:text-surface-300">
              AI 模型
            </label>
            <select
              value={selectedProviderId}
              onChange={(e) => {
                setSelectedProviderId(e.target.value)
                setSelectedModelId('')
              }}
              className="w-full px-3 py-1.5 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600"
            >
              <option value="">选择 Provider</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              disabled={!selectedProviderId}
              className="w-full px-3 py-1.5 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 disabled:opacity-50"
            >
              <option value="">选择模型</option>
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* 变量输入 */}
          {prompt.variables.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-surface-700 dark:text-surface-300 flex items-center gap-1.5">
                <Variable size={13} /> 变量值
              </label>
              {prompt.variables.map((v) => (
                <VariableInput
                  key={v.name}
                  variable={v}
                  value={variableValues[v.name]}
                  onChange={(val) => setVariableValues({ ...variableValues, [v.name]: val })}
                />
              ))}
            </div>
          )}

          {/* 校验状态 */}
          {!validation.valid && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/30 rounded-lg p-2.5">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {validation.missing.length > 0 && (
                  <span>缺少必填变量：{validation.missing.join(', ')}</span>
                )}
                {validation.invalid.length > 0 && (
                  <span>类型不匹配：{validation.invalid.join(', ')}</span>
                )}
              </p>
            </div>
          )}

          {/* 渲染预览 */}
          <div>
            <label className="block text-xs font-medium text-surface-700 dark:text-surface-300 mb-1.5">
              渲染预览
            </label>
            <div className="bg-surface-50 dark:bg-surface-900 rounded-lg border border-surface-200/80 dark:border-surface-700/60 p-3 max-h-48 overflow-y-auto">
              <pre className="text-[11px] text-surface-700 dark:text-surface-300 whitespace-pre-wrap font-mono leading-relaxed">
                {preview.content}
              </pre>
              {preview.warnings.length > 0 && (
                <div className="mt-2 pt-2 border-t border-surface-200/60 dark:border-surface-700/40">
                  {preview.warnings.map((w, i) => (
                    <p key={i} className="text-[10px] text-amber-600 dark:text-amber-400">
                      ⚠ {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：输出 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 运行按钮 */}
          <div className="px-4 py-3 border-b border-surface-200/80 dark:border-surface-700/60 flex items-center gap-2">
            {isRunning ? (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-danger-500 text-white rounded-lg hover:bg-danger-600 transition-colors"
              >
                <Square size={13} /> 停止
              </button>
            ) : (
              <button
                onClick={handleRun}
                disabled={!selectedProviderId || !selectedModelId}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent-500 text-white rounded-lg hover:bg-accent-600 disabled:opacity-50 transition-colors"
              >
                <Play size={13} /> 运行测试
              </button>
            )}
            {isRunning && (
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Loader2 size={12} className="animate-spin" />
                生成中...
              </div>
            )}
          </div>

          {/* 输出区 */}
          <div className="flex-1 overflow-y-auto p-4">
            {error ? (
              <div className="bg-danger-50 dark:bg-danger-950/20 border border-danger-200/60 dark:border-danger-800/30 rounded-xl p-4">
                <p className="text-sm text-danger-700 dark:text-danger-300">{error}</p>
              </div>
            ) : output ? (
              <div className="relative">
                <button
                  onClick={handleCopy}
                  className="absolute top-0 right-0 p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-muted"
                  title="复制输出"
                >
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
                <pre className="text-sm text-surface-800 dark:text-surface-200 whitespace-pre-wrap leading-relaxed pr-10">
                  {output}
                </pre>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted">
                <div className="text-center">
                  <Zap size={36} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">选择模型并点击"运行测试"</p>
                  <p className="text-xs mt-1">AI 将基于渲染后的提示词生成响应</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ==================== 变量输入控件 ====================

function VariableInput({
  variable,
  value,
  onChange,
}: {
  variable: PromptVariable
  value: unknown
  onChange: (val: unknown) => void
}) {
  const strValue = value !== undefined && value !== null ? String(value) : ''

  switch (variable.type) {
    case 'boolean':
      return (
        <div className="flex items-center justify-between">
          <label className="text-xs text-surface-700 dark:text-surface-300 flex items-center gap-1">
            {variable.label || variable.name}
            {variable.required && <span className="text-red-500">*</span>}
          </label>
          <button
            onClick={() => onChange(value === 'true' ? 'false' : 'true')}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              strValue === 'true' ? 'bg-accent-500' : 'bg-surface-300 dark:bg-surface-600'
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                strValue === 'true' ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      )

    case 'select':
      return (
        <div>
          <label className="block text-xs text-surface-700 dark:text-surface-300 mb-1">
            {variable.label || variable.name}
            {variable.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <select
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600"
          >
            <option value="">{variable.placeholder || '请选择'}</option>
            {variable.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )

    case 'textarea':
      return (
        <div>
          <label className="block text-xs text-surface-700 dark:text-surface-300 mb-1">
            {variable.label || variable.name}
            {variable.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <textarea
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={variable.placeholder}
            rows={3}
            className="w-full px-2.5 py-1.5 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 resize-y font-mono"
          />
        </div>
      )

    default: // string, number
      return (
        <div>
          <label className="block text-xs text-surface-700 dark:text-surface-300 mb-1">
            {variable.label || variable.name}
            {variable.required && <span className="text-red-500 ml-0.5">*</span>}
            {variable.description && (
              <span className="text-muted ml-1">({variable.description})</span>
            )}
          </label>
          <input
            type={variable.type === 'number' ? 'number' : 'text'}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={variable.placeholder || `输入 ${variable.label || variable.name}`}
            className="w-full px-2.5 py-1.5 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30"
          />
        </div>
      )
  }
}
