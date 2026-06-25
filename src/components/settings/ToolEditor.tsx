import { useState, useMemo, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import {
  Plus, Edit2, Trash2, Save, Wrench, ToggleLeft, ToggleRight, X,
  Play, Loader2, CheckCircle2, XCircle, BarChart3, RotateCcw, Code2
} from 'lucide-react'
import { BUILT_IN_TOOLS } from '../../services/built-in-tools'
import { useCustomToolStore } from '../../stores/custom-tool-store'
import { useToolStatsStore } from '../../stores/tool-stats-store'
import { toolService } from '../../services/tool-service'
import { useSettingsStore } from '../../stores/settings-store'
import type { Tool } from '../../types'

// ==================== 默认 JS 代码模板 ====================
const DEFAULT_CODE_TEMPLATE = `// 自定义工具函数
// 参数: params - JSON 参数对象
// 可用: console, fetch, JSON, Math, Date, Promise 等
// 返回: 任意可 JSON 序列化的值

async (params) => {
  // 在此编写工具逻辑
  const { input } = params

  return {
    result: \`处理完成: \${input}\`
  }
}`

// ==================== Tab 类型 ====================
type DetailTab = 'edit' | 'test' | 'stats'

// ==================== 主组件 ====================
export function ToolEditor() {
  const { customTools, addTool, updateTool, deleteTool, toggleTool } = useCustomToolStore()
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null)
  const [activeTab, setActiveTab] = useState<DetailTab>('edit')

  const allTools = useMemo(() => [...BUILT_IN_TOOLS, ...customTools], [customTools])

  const handleCreate = () => {
    const newTool = addTool({
      name: '',
      description: '',
      parameters: { type: 'object', properties: {}, required: [] },
      enabled: true,
      code: DEFAULT_CODE_TEMPLATE,
      timeout: 5000
    })
    setSelectedTool(newTool)
    setActiveTab('edit')
    setView('detail')
  }

  const handleSelectTool = (tool: Tool, tab: DetailTab = 'edit') => {
    setSelectedTool(tool)
    setActiveTab(tab)
    setView('detail')
  }

  const handleBack = () => {
    setView('list')
    setSelectedTool(null)
  }

  const handleDelete = (id: string) => {
    if (confirm('确定删除此工具？')) {
      deleteTool(id)
      if (selectedTool?.id === id) {
        handleBack()
      }
    }
  }

  if (view === 'detail' && selectedTool) {
    return (
      <ToolDetailView
        tool={selectedTool}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onBack={handleBack}
        onSave={(updates) => {
          if (!selectedTool.isBuiltIn) {
            updateTool(selectedTool.id, updates)
            setSelectedTool({ ...selectedTool, ...updates })
          }
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
            <Wrench size={20} className="text-indigo-500" />
            工具管理
          </h2>
          <p className="text-sm text-muted mt-1">
            管理 AI 可使用的工具，包括内置工具和自定义工具
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
        >
          <Plus size={14} /> 新建自定义工具
        </button>
      </div>

      {/* 内置工具 */}
      <div>
        <h3 className="text-xs font-medium text-muted mb-2">内置工具</h3>
        <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 divide-y divide-surface-200/80 dark:divide-surface-700/60">
          {BUILT_IN_TOOLS.map((tool) => (
            <ToolListItem
              key={tool.id}
              tool={tool}
              onSelect={() => handleSelectTool(tool, 'test')}
              onEdit={() => handleSelectTool(tool, 'edit')}
              onTest={() => handleSelectTool(tool, 'test')}
              onToggle={() => {}}
              onDelete={() => {}}
              isBuiltIn
            />
          ))}
        </div>
      </div>

      {/* 自定义工具 */}
      <div>
        <h3 className="text-xs font-medium text-muted mb-2">
          自定义工具
          {customTools.length > 0 && (
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 rounded-full">
              {customTools.length}
            </span>
          )}
        </h3>
        {customTools.length > 0 ? (
          <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 divide-y divide-surface-200/80 dark:divide-surface-700/60">
            {customTools.map((tool) => (
              <ToolListItem
                key={tool.id}
                tool={tool}
                onSelect={() => handleSelectTool(tool)}
                onEdit={() => handleSelectTool(tool, 'edit')}
                onTest={() => handleSelectTool(tool, 'test')}
                onToggle={() => toggleTool(tool.id)}
                onDelete={() => handleDelete(tool.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center text-muted py-8 bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 border-dashed">
            <Code2 size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">暂无自定义工具</p>
            <p className="text-xs mt-1">点击上方"新建自定义工具"开始创建</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== 工具列表项 ====================
function ToolListItem({
  tool,
  onSelect,
  onEdit,
  onTest,
  onToggle,
  onDelete,
  isBuiltIn = false
}: {
  tool: Tool
  onSelect: () => void
  onEdit: () => void
  onTest: () => void
  onToggle: () => void
  onDelete: () => void
  isBuiltIn?: boolean
}) {
  const stats = useToolStatsStore((s) => s.stats[tool.name])
  const hasCode = !!tool.code

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/40 transition-colors"
      onClick={onSelect}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isBuiltIn
          ? 'bg-indigo-100 dark:bg-indigo-900/30'
          : hasCode
            ? 'bg-emerald-100 dark:bg-emerald-900/30'
            : 'bg-amber-100 dark:bg-amber-900/30'
      }`}>
        <Wrench size={14} className={
          isBuiltIn
            ? 'text-indigo-600 dark:text-indigo-400'
            : hasCode
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-amber-600 dark:text-amber-400'
        } />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-surface-800 dark:text-surface-200">{tool.name}</span>
          {isBuiltIn && (
            <span className="text-[10px] px-1.5 py-0.5 bg-surface-100 dark:bg-surface-800 text-muted rounded-full font-medium">内置</span>
          )}
          {!isBuiltIn && hasCode && (
            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full font-medium">JS</span>
          )}
          {stats && stats.callCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full font-medium">
              {stats.callCount}次 · {Math.round((stats.successCount / stats.callCount) * 100)}%
            </span>
          )}
        </div>
        <p className="text-xs text-muted truncate">{tool.description || '无描述'}</p>
      </div>
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onTest}
          className="p-1.5 rounded-lg text-muted hover:text-accent-500 hover:bg-accent-50 dark:hover:bg-accent-950/30 transition-all"
          title="测试"
        >
          <Play size={12} />
        </button>
        {isBuiltIn ? null : (
          <>
            <button onClick={onToggle} className="text-muted">
              {tool.enabled ? (
                <ToggleRight size={18} className="text-accent-500" />
              ) : (
                <ToggleLeft size={18} />
              )}
            </button>
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
            >
              <Edit2 size={12} />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-muted hover:text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-all"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ==================== 工具详情视图 ====================
function ToolDetailView({
  tool,
  activeTab,
  onTabChange,
  onBack,
  onSave
}: {
  tool: Tool
  activeTab: DetailTab
  onTabChange: (tab: DetailTab) => void
  onBack: () => void
  onSave: (updates: Partial<Tool>) => void
}) {
  const isBuiltIn = tool.isBuiltIn

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg text-muted hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
          >
            <X size={18} />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
              <Wrench size={18} className="text-indigo-500" />
              {tool.name || '新工具'}
            </h2>
            <p className="text-xs text-muted">{tool.description}</p>
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="flex gap-1 bg-surface-100 dark:bg-surface-800 p-1 rounded-xl">
        {!isBuiltIn && (
          <TabButton
            active={activeTab === 'edit'}
            onClick={() => onTabChange('edit')}
            icon={<Edit2 size={14} />}
            label="编辑"
          />
        )}
        <TabButton
          active={activeTab === 'test'}
          onClick={() => onTabChange('test')}
          icon={<Play size={14} />}
          label="测试"
        />
        <TabButton
          active={activeTab === 'stats'}
          onClick={() => onTabChange('stats')}
          icon={<BarChart3 size={14} />}
          label="统计"
        />
      </div>

      {/* Tab 内容 */}
      {activeTab === 'edit' && !isBuiltIn && (
        <ToolEditForm tool={tool} onSave={onSave} />
      )}
      {activeTab === 'test' && <ToolTestPanel tool={tool} />}
      {activeTab === 'stats' && <ToolStatsPanel toolName={tool.name} />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
        active
          ? 'bg-white dark:bg-surface-700 text-accent-600 dark:text-accent-400 shadow-sm'
          : 'text-muted hover:text-surface-700 dark:hover:text-surface-300'
      }`}
    >
      {icon} {label}
    </button>
  )
}

// ==================== 工具编辑表单 ====================
function ToolEditForm({
  tool,
  onSave
}: {
  tool: Tool
  onSave: (updates: Partial<Tool>) => void
}) {
  const theme = useSettingsStore((s) => s.theme)
  const [name, setName] = useState(tool.name)
  const [description, setDescription] = useState(tool.description)
  const [parametersJson, setParametersJson] = useState(
    JSON.stringify(tool.parameters, null, 2)
  )
  const [code, setCode] = useState(tool.code || DEFAULT_CODE_TEMPLATE)
  const [timeout, setTimeout_] = useState(tool.timeout || 5000)
  const [jsonError, setJsonError] = useState('')
  const [saved, setSaved] = useState(false)

  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs'

  const handleParametersChange = (value: string | undefined) => {
    const v = value || ''
    setParametersJson(v)
    try {
      JSON.parse(v)
      setJsonError('')
    } catch {
      setJsonError('JSON 格式错误')
    }
  }

  const handleSave = () => {
    let parsedParams: Record<string, unknown>
    try {
      parsedParams = JSON.parse(parametersJson)
    } catch {
      setJsonError('JSON 格式错误，请修正后再保存')
      return
    }

    onSave({
      name: name.trim(),
      description: description.trim(),
      parameters: parsedParams,
      code,
      timeout
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-4">
      {/* 基本信息 */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">工具名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my_tool"
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">超时 (ms)</label>
            <input
              type="number"
              value={timeout}
              onChange={(e) => setTimeout_(Math.max(100, Math.min(30000, Number(e.target.value) || 5000)))}
              min={100}
              max={30000}
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">描述</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="工具的功能描述"
            className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-900 border border-surface-200/80 dark:border-surface-700/60 rounded-xl focus:ring-2 focus:ring-accent-500/30 focus:border-accent-400 transition-all"
          />
        </div>
      </div>

      {/* 参数 Schema */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5">
        <label className="block text-xs text-muted mb-2">参数 Schema (JSON)</label>
        <div className={`border rounded-xl overflow-hidden ${
          jsonError ? 'border-danger-400' : 'border-surface-200/80 dark:border-surface-700/60'
        }`}>
          <Editor
            height="200px"
            language="json"
            theme={monacoTheme}
            value={parametersJson}
            onChange={handleParametersChange}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true
            }}
          />
        </div>
        {jsonError && (
          <p className="text-xs text-danger-500 mt-1.5">{jsonError}</p>
        )}
      </div>

      {/* JS 代码 */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-muted">JS 函数代码</label>
          <span className="text-[10px] text-muted">{'async (params) => { ... }'}</span>
        </div>
        <div className="border border-surface-200/80 dark:border-surface-700/60 rounded-xl overflow-hidden">
          <Editor
            height="300px"
            language="javascript"
            theme={monacoTheme}
            value={code}
            onChange={(v) => setCode(v || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true,
              suggest: {
                showKeywords: true,
                showFunctions: true
              }
            }}
          />
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!name.trim() || !!jsonError}
          className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white rounded-xl px-4 py-2 text-sm font-medium transition-all shadow-sm disabled:opacity-50"
        >
          {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
          {saved ? '已保存' : '保存'}
        </button>
      </div>
    </div>
  )
}

// ==================== 工具测试面板 ====================
function ToolTestPanel({ tool }: { tool: Tool }) {
  const theme = useSettingsStore((s) => s.theme)
  const [inputJson, setInputJson] = useState(() => {
    // 根据 parameters Schema 生成示例参数
    try {
      const params = tool.parameters as Record<string, unknown>
      const properties = (params.properties || {}) as Record<string, Record<string, unknown>>
      const example: Record<string, unknown> = {}
      for (const [key, prop] of Object.entries(properties)) {
        const type = prop.type as string
        if (type === 'string') example[key] = prop.description || `示例${key}`
        else if (type === 'number') example[key] = 1
        else if (type === 'boolean') example[key] = true
        else if (type === 'array') example[key] = []
        else if (type === 'object') example[key] = {}
        else example[key] = ''
      }
      return JSON.stringify(example, null, 2)
    } catch {
      return '{}'
    }
  })
  const [output, setOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    durationMs?: number
    error?: string
  } | null>(null)

  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs'

  const allTools = useMemo(() => {
    const { customTools } = useCustomToolStore.getState()
    return [...BUILT_IN_TOOLS, ...customTools]
  }, [])

  const handleExecute = useCallback(async () => {
    setIsRunning(true)
    setResult(null)
    setOutput('')

    try {
      let args: Record<string, unknown>
      try {
        args = JSON.parse(inputJson)
      } catch {
        setResult({ success: false, error: '输入参数 JSON 格式错误' })
        setOutput('错误: 输入参数 JSON 格式错误')
        return
      }

      const response = await toolService.executeTool(tool.name, args, allTools)

      setResult({
        success: response.success,
        durationMs: response.durationMs,
        error: response.error
      })

      if (response.success) {
        // 尝试格式化 JSON 输出
        try {
          const parsed = JSON.parse(response.data)
          setOutput(JSON.stringify(parsed, null, 2))
        } catch {
          setOutput(response.data)
        }
      } else {
        setOutput(`错误: ${response.error}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '执行失败'
      setResult({ success: false, error: msg })
      setOutput(`错误: ${msg}`)
    } finally {
      setIsRunning(false)
    }
  }, [tool.name, inputJson, allTools])

  return (
    <div className="space-y-4">
      {/* 输入区 */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-muted">输入参数 (JSON)</label>
          <button
            onClick={handleExecute}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <Loader2 size={12} className="animate-spin" /> 执行中...
              </>
            ) : (
              <>
                <Play size={12} /> 执行
              </>
            )}
          </button>
        </div>
        <div className="border border-surface-200/80 dark:border-surface-700/60 rounded-xl overflow-hidden">
          <Editor
            height="180px"
            language="json"
            theme={monacoTheme}
            value={inputJson}
            onChange={(v) => setInputJson(v || '{}')}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true
            }}
          />
        </div>
      </div>

      {/* 结果状态栏 */}
      {result && (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm ${
          result.success
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
        }`}>
          {result.success ? (
            <CheckCircle2 size={16} />
          ) : (
            <XCircle size={16} />
          )}
          <span className="font-medium">
            {result.success ? '执行成功' : '执行失败'}
          </span>
          {result.durationMs !== undefined && (
            <span className="text-xs opacity-70">耗时 {result.durationMs}ms</span>
          )}
          {result.error && (
            <span className="text-xs opacity-70 truncate">{result.error}</span>
          )}
        </div>
      )}

      {/* 输出区 */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5">
        <label className="block text-xs text-muted mb-2">输出结果</label>
        <div className="border border-surface-200/80 dark:border-surface-700/60 rounded-xl overflow-hidden">
          <Editor
            height="250px"
            language="json"
            theme={monacoTheme}
            value={output || '// 点击"执行"查看结果'}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              domReadOnly: true
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ==================== 工具统计面板 ====================
function ToolStatsPanel({ toolName }: { toolName: string }) {
  const stats = useToolStatsStore((s) => s.stats[toolName])
  const resetStats = useToolStatsStore((s) => s.resetStats)

  if (!stats || stats.callCount === 0) {
    return (
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-8 text-center">
        <BarChart3 size={40} className="mx-auto mb-3 text-muted opacity-30" />
        <p className="text-sm text-muted">暂无使用统计</p>
        <p className="text-xs text-muted mt-1">执行此工具后将自动记录统计数据</p>
      </div>
    )
  }

  const successRate = Math.round((stats.successCount / stats.callCount) * 100)
  const avgDuration = Math.round(stats.totalDurationMs / stats.callCount)
  const lastCalled = stats.lastCalledAt
    ? new Date(stats.lastCalledAt).toLocaleString()
    : '未知'

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatsCard label="调用次数" value={String(stats.callCount)} />
        <StatsCard
          label="成功率"
          value={`${successRate}%`}
          color={successRate >= 90 ? 'emerald' : successRate >= 70 ? 'amber' : 'red'}
        />
        <StatsCard label="平均耗时" value={`${avgDuration}ms`} />
        <StatsCard label="最后调用" value={lastCalled} small />
      </div>

      {/* 详细统计 */}
      <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-5">
        <h4 className="text-xs font-medium text-muted mb-3">详细统计</h4>
        <div className="space-y-2">
          <StatsRow label="成功次数" value={String(stats.successCount)} />
          <StatsRow label="失败次数" value={String(stats.failureCount)} />
          <StatsRow label="总耗时" value={`${stats.totalDurationMs}ms`} />
          <StatsRow label="平均耗时" value={`${avgDuration}ms`} />
        </div>
      </div>

      {/* 重置按钮 */}
      <div className="flex justify-end">
        <button
          onClick={() => {
            if (confirm('确定重置此工具的使用统计？')) {
              resetStats(toolName)
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted hover:text-danger-500 rounded-lg hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-all"
        >
          <RotateCcw size={12} /> 重置统计
        </button>
      </div>
    </div>
  )
}

function StatsCard({
  label,
  value,
  color,
  small
}: {
  label: string
  value: string
  color?: 'emerald' | 'amber' | 'red'
  small?: boolean
}) {
  const colorClasses = color
    ? {
        emerald: 'text-emerald-600 dark:text-emerald-400',
        amber: 'text-amber-600 dark:text-amber-400',
        red: 'text-red-600 dark:text-red-400'
      }[color]
    : 'text-surface-800 dark:text-surface-200'

  return (
    <div className="bg-white dark:bg-surface-800/60 rounded-xl border border-surface-200/80 dark:border-surface-700/60 p-4">
      <p className="text-[10px] text-muted mb-1">{label}</p>
      <p className={`${small ? 'text-xs' : 'text-lg'} font-semibold ${colorClasses}`}>
        {value}
      </p>
    </div>
  )
}

function StatsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-surface-100 dark:border-surface-700/40 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs font-medium text-surface-800 dark:text-surface-200">{value}</span>
    </div>
  )
}
