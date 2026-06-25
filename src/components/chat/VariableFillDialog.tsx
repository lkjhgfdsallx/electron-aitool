import { useState, useMemo } from 'react'
import {
  X,
  Variable,
  Check,
  AlertCircle,
} from 'lucide-react'
import { PromptVariableEngine } from '../../services/prompt-variable-engine'
import type { Prompt, PromptVariable, PromptRuntimeContext } from '../../types'

interface VariableFillDialogProps {
  prompt: Prompt
  context?: PromptRuntimeContext
  onSubmit: (renderedContent: string) => void
  onCancel: () => void
}

export function VariableFillDialog({ prompt, context, onSubmit, onCancel }: VariableFillDialogProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    // 用默认值初始化
    const init: Record<string, unknown> = {}
    for (const v of prompt.variables) {
      if (v.defaultValue !== undefined) {
        init[v.name] = v.defaultValue
      }
    }
    return init
  })

  const validation = useMemo(() => {
    return PromptVariableEngine.validate(prompt.variables, values)
  }, [prompt.variables, values])

  const preview = useMemo(() => {
    const text = prompt.sections
      ? prompt.sections.filter((s) => s.enabled).map((s) => s.content).join('\n\n')
      : prompt.content
    return PromptVariableEngine.render(text, prompt.variables, values, context)
  }, [prompt, values, context])

  const handleSubmit = () => {
    if (!validation.valid) return
    onSubmit(preview.content)
  }

  // 无需变量时直接提交
  if (prompt.variables.length === 0) {
    const text = prompt.sections
      ? prompt.sections.filter((s) => s.enabled).map((s) => s.content).join('\n\n')
      : prompt.content
    const rendered = PromptVariableEngine.render(text, [], {}, context)
    onSubmit(rendered.content)
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-2xl w-[420px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* 标题 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-200/80 dark:border-surface-700/60">
          <div>
            <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
              <Variable size={16} className="text-accent-500" />
              填写变量
            </h3>
            <p className="text-xs text-muted mt-0.5">{prompt.name}</p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-muted transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 变量表单 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {prompt.variables.map((v) => (
            <VariableField
              key={v.name}
              variable={v}
              value={values[v.name]}
              onChange={(val) => setValues({ ...values, [v.name]: val })}
            />
          ))}

          {/* 校验提示 */}
          {!validation.valid && (
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/30 rounded-lg">
              <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 dark:text-amber-300">
                {validation.missing.length > 0 && (
                  <p>请填写必填变量：{validation.missing.join('、')}</p>
                )}
                {validation.invalid.length > 0 && (
                  <p>格式不正确：{validation.invalid.join('、')}</p>
                )}
              </div>
            </div>
          )}

          {/* 渲染预览 */}
          <div>
            <p className="text-xs text-muted mb-1.5">渲染预览</p>
            <div className="bg-surface-50 dark:bg-surface-900 rounded-lg border border-surface-200/80 dark:border-surface-700/60 p-3 max-h-32 overflow-y-auto">
              <pre className="text-[11px] text-surface-600 dark:text-surface-400 whitespace-pre-wrap font-mono leading-relaxed">
                {preview.content.slice(0, 500)}
                {preview.content.length > 500 && '...'}
              </pre>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center gap-3 px-5 py-3 border-t border-surface-200/80 dark:border-surface-700/60">
          <button
            onClick={handleSubmit}
            disabled={!validation.valid}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-accent-500 text-white rounded-xl hover:bg-accent-600 disabled:opacity-50 transition-colors text-sm"
          >
            <Check size={14} /> 插入提示词
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm text-muted border border-surface-300 dark:border-surface-600 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== 变量输入控件 ====================

function VariableField({
  variable,
  value,
  onChange,
}: {
  variable: PromptVariable
  value: unknown
  onChange: (val: unknown) => void
}) {
  const strValue = value !== undefined && value !== null ? String(value) : ''

  return (
    <div>
      <label className="block text-xs text-surface-700 dark:text-surface-300 mb-1">
        {variable.label || variable.name}
        {variable.required && <span className="text-red-500 ml-0.5">*</span>}
        {variable.description && (
          <span className="text-muted ml-1">({variable.description})</span>
        )}
      </label>

      {variable.type === 'boolean' ? (
        <button
          onClick={() => onChange(strValue === 'true' ? 'false' : 'true')}
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
      ) : variable.type === 'select' ? (
        <select
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-1.5 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30"
        >
          <option value="">{variable.placeholder || '请选择'}</option>
          {variable.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : variable.type === 'textarea' ? (
        <textarea
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={variable.placeholder}
          rows={3}
          className="w-full px-3 py-1.5 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30 resize-y font-mono"
        />
      ) : (
        <input
          type={variable.type === 'number' ? 'number' : 'text'}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={variable.placeholder || `输入 ${variable.label || variable.name}`}
          className="w-full px-3 py-1.5 text-xs border rounded-lg bg-surface-50 dark:bg-surface-900 border-surface-300 dark:border-surface-600 focus:ring-2 focus:ring-accent-500/30"
        />
      )}
    </div>
  )
}
