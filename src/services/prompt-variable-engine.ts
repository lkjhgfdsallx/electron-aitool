import type {
  PromptVariable,
  PromptVariableType,
  VariableValidationResult,
  VariableRenderResult,
  PromptRuntimeContext,
  BuiltinContextVariable,
} from '../types'

// ==================== 变量正则 ====================

/** 匹配 {{variable_name}} 占位符 */
const VARIABLE_REGEX = /\{\{(\w+)\}\}/g

/** 匹配 {{kb:collection_id}} 知识库注入 */
const KB_VARIABLE_REGEX = /\{\{kb:([^}]+)\}\}/g

/** 匹配 {{tool:tool_name}} 工具结果绑定 */
const TOOL_VARIABLE_REGEX = /\{\{tool:([^}]+)\}\}/g

/** 匹配所有特殊变量模式 */
const ALL_VARIABLE_REGEX = /\{\{(?:kb:|tool:)?(\w[\w:-]*)\}\}/g

// ==================== 特殊变量类型 ====================

export interface SpecialVariable {
  type: 'kb' | 'tool' | 'normal'
  name: string
  raw: string // 原始占位符文本，如 {{kb:my_collection}}
}

/** 知识库查询结果 */
export interface KBQueryResult {
  collectionId: string
  content: string
  score?: number
}

/** 工具执行结果 */
export interface ToolResult {
  toolName: string
  output: string
  success: boolean
  error?: string
}

/** 知识库查询回调 */
export type KBQueryFn = (collectionId: string, query: string) => Promise<KBQueryResult[]>

/** 工具执行回调 */
export type ToolExecuteFn = (toolName: string) => Promise<ToolResult>

// ==================== 内置上下文变量值获取 ====================

function getBuiltinValue(key: BuiltinContextVariable, context?: PromptRuntimeContext): string {
  const now = new Date()
  switch (key) {
    case 'current_date':
      return now.toISOString().slice(0, 10) // YYYY-MM-DD
    case 'current_time':
      return now.toTimeString().slice(0, 8) // HH:mm:ss
    case 'current_datetime':
      return `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 8)}`
    case 'active_agent_name':
      return context?.currentAgentName ?? ''
    case 'default_model':
      return context?.defaultModel ?? ''
    case 'user_name':
      return context?.userName ?? ''
    case 'conversation_topic':
      return context?.conversationTopic ?? ''
    default:
      return ''
  }
}

// ==================== 变量引擎 ====================

export const PromptVariableEngine = {
  /**
   * 从文本中提取所有 {{variable}} 占位符名称（去重）
   * 只提取普通变量，不含 {{kb:...}} 和 {{tool:...}}
   */
  extractVariables(content: string): string[] {
    const matches = content.matchAll(VARIABLE_REGEX)
    const names = new Set<string>()
    for (const match of matches) {
      names.add(match[1])
    }
    return Array.from(names)
  },

  /**
   * 从文本中提取所有特殊变量（kb/tool）
   */
  extractSpecialVariables(content: string): SpecialVariable[] {
    const results: SpecialVariable[] = []
    const seen = new Set<string>()

    // 提取 kb 变量
    const kbMatches = content.matchAll(KB_VARIABLE_REGEX)
    for (const match of kbMatches) {
      const raw = match[0]
      if (!seen.has(raw)) {
        seen.add(raw)
        results.push({ type: 'kb', name: match[1].trim(), raw })
      }
    }

    // 提取 tool 变量
    const toolMatches = content.matchAll(TOOL_VARIABLE_REGEX)
    for (const match of toolMatches) {
      const raw = match[0]
      if (!seen.has(raw)) {
        seen.add(raw)
        results.push({ type: 'tool', name: match[1].trim(), raw })
      }
    }

    return results
  },

  /**
   * 判断一个变量名是否为内置上下文变量
   */
  isBuiltinVariable(name: string): boolean {
    return [
      'current_date',
      'current_time',
      'current_datetime',
      'active_agent_name',
      'default_model',
      'user_name',
      'conversation_topic',
    ].includes(name)
  },

  /**
   * 将变量定义与文本中的占位符进行同步
   * - 新增：文本中出现但 variables 中没有的 → 创建默认定义
   * - 保留：文本和 variables 中都有的
   * - 移除：variables 中有但文本中不再出现的（返回时排除）
   */
  syncVariables(content: string, existing: PromptVariable[]): PromptVariable[] {
    const foundNames = this.extractVariables(content)
    const existingMap = new Map(existing.map((v) => [v.name, v]))

    return foundNames
      .filter((name) => !this.isBuiltinVariable(name))
      .map((name) => {
        const prev = existingMap.get(name)
        if (prev) return prev
        // 自动创建新变量定义
        return {
          name,
          label: name,
          type: 'string' as PromptVariableType,
          required: false,
          placeholder: '',
        }
      })
  },

  /**
   * 渲染：将变量替换为实际值
   * 1. 先注入内置上下文变量
   * 2. 再注入用户定义变量
   * 3. 处理 {{kb:...}} 和 {{tool:...}}（使用回调异步解析）
   * 未定义的变量保留原始占位符并记录警告
   */
  render(
    content: string,
    variables: PromptVariable[],
    values: Record<string, unknown>,
    context?: PromptRuntimeContext,
  ): VariableRenderResult {
    const warnings: string[] = []
    const varMap = new Map(variables.map((v) => [v.name, v]))

    const result = content.replace(VARIABLE_REGEX, (_match, varName: string) => {
      // 1. 内置上下文变量
      if (this.isBuiltinVariable(varName)) {
        return String(getBuiltinValue(varName as BuiltinContextVariable, context) ?? '')
      }

      // 2. 用户变量
      const val = values[varName]
      if (val !== undefined && val !== null && val !== '') {
        return String(val)
      }

      // 3. 有默认值时使用默认值
      const def = varMap.get(varName)
      if (def?.defaultValue !== undefined && def.defaultValue !== '') {
        return String(def.defaultValue)
      }

      // 4. 未定义 — 保留占位符并警告
      warnings.push(`变量 {{${varName}}} 未提供值`)
      return `{{${varName}}}`
    })

    return { content: result, warnings }
  },

  /**
   * 异步渲染：处理 {{kb:...}} 和 {{tool:...}} 占位符
   * 在同步 render 之后调用，进一步解析特殊变量
   */
  async renderSpecialVariables(
    content: string,
    options?: {
      kbQuery?: KBQueryFn
      toolExecute?: ToolExecuteFn
      query?: string // 用于知识库查询的上下文
    },
  ): Promise<{ content: string; warnings: string[] }> {
    const warnings: string[] = []

    // 处理 {{kb:collection_id}} 知识库注入
    if (options?.kbQuery) {
      const kbMatches = [...content.matchAll(KB_VARIABLE_REGEX)]
      for (const match of kbMatches) {
        const collectionId = match[1].trim()
        const query = options.query || ''
        try {
          const results = await options.kbQuery(collectionId, query)
          if (results.length > 0) {
            const kbContent = results.map((r) => r.content).join('\n\n')
            content = content.replace(match[0], kbContent)
          } else {
            warnings.push(`知识库 {{kb:${collectionId}}} 未找到相关内容`)
            content = content.replace(match[0], `[知识库 ${collectionId}: 未找到相关内容]`)
          }
        } catch (err) {
          warnings.push(`知识库 {{kb:${collectionId}}} 查询失败: ${err}`)
          content = content.replace(match[0], `[知识库 ${collectionId}: 查询失败]`)
        }
      }
    } else {
      // 没有查询函数时，移除 kb 占位符并警告
      const kbMatches = [...content.matchAll(KB_VARIABLE_REGEX)]
      for (const match of kbMatches) {
        warnings.push(`知识库 {{kb:${match[1].trim()}}} 未配置查询函数`)
        content = content.replace(match[0], '')
      }
    }

    // 处理 {{tool:tool_name}} 工具结果绑定
    if (options?.toolExecute) {
      const toolMatches = [...content.matchAll(TOOL_VARIABLE_REGEX)]
      for (const match of toolMatches) {
        const toolName = match[1].trim()
        try {
          const result = await options.toolExecute(toolName)
          if (result.success) {
            content = content.replace(match[0], result.output)
          } else {
            warnings.push(`工具 {{tool:${toolName}}} 执行失败: ${result.error}`)
            content = content.replace(match[0], `[工具 ${toolName}: ${result.error || '执行失败'}]`)
          }
        } catch (err) {
          warnings.push(`工具 {{tool:${toolName}}} 执行异常: ${err}`)
          content = content.replace(match[0], `[工具 ${toolName}: 执行异常]`)
        }
      }
    } else {
      // 没有执行函数时，移除 tool 占位符并警告
      const toolMatches = [...content.matchAll(TOOL_VARIABLE_REGEX)]
      for (const match of toolMatches) {
        warnings.push(`工具 {{tool:${match[1].trim()}}} 未配置执行函数`)
        content = content.replace(match[0], '')
      }
    }

    return { content, warnings }
  },

  /**
   * 校验：检查必填变量是否都有值
   */
  validate(variables: PromptVariable[], values: Record<string, unknown>): VariableValidationResult {
    const missing: string[] = []
    const invalid: string[] = []

    for (const v of variables) {
      const val = values[v.name]

      // 必填检查
      if (v.required && (val === undefined || val === null || val === '')) {
        missing.push(v.name)
        continue
      }

      // 类型检查（仅有值时才检查）
      if (val !== undefined && val !== null && val !== '') {
        if (!this.validateType(v.type, val)) {
          invalid.push(v.name)
        }
      }
    }

    return {
      valid: missing.length === 0 && invalid.length === 0,
      missing,
      invalid,
    }
  },

  /**
   * 校验值是否匹配变量类型
   */
  validateType(type: PromptVariableType, value: unknown): boolean {
    switch (type) {
      case 'string':
      case 'textarea':
        return typeof value === 'string'
      case 'number':
        return !isNaN(Number(value))
      case 'boolean':
        return value === 'true' || value === 'false' || typeof value === 'boolean'
      case 'select':
        return typeof value === 'string' && value.length > 0
      default:
        return true
    }
  },

  /**
   * 获取内置上下文变量的当前值
   */
  getContextValues(context?: PromptRuntimeContext): Record<string, string> {
    const result: Record<string, string> = {}
    const keys: BuiltinContextVariable[] = [
      'current_date',
      'current_time',
      'current_datetime',
      'active_agent_name',
      'default_model',
      'user_name',
      'conversation_topic',
    ]
    for (const key of keys) {
      result[key] = getBuiltinValue(key, context)
    }
    return result
  },

  /**
   * 获取变量的自动补全列表
   * 包含：用户定义的变量 + 内置上下文变量 + kb/tool 特殊变量提示
   */
  getAutocompleteSuggestions(
    content: string,
    variables: PromptVariable[],
    cursorText: string,
  ): Array<{ name: string; label: string; type: string; isBuiltin: boolean }> {
    // 提取当前输入的前缀（{{ 后面的内容）
    const prefixMatch = cursorText.match(/\{\{(\w*)$/)
    const prefix = prefixMatch ? prefixMatch[1] : ''

    const suggestions: Array<{ name: string; label: string; type: string; isBuiltin: boolean }> = []

    // 用户定义变量
    for (const v of variables) {
      if (!prefix || v.name.toLowerCase().startsWith(prefix.toLowerCase())) {
        suggestions.push({
          name: v.name,
          label: v.label || v.name,
          type: v.type,
          isBuiltin: false,
        })
      }
    }

    // 内置上下文变量
    const builtinVars: Array<{ name: string; label: string }> = [
      { name: 'current_date', label: '当前日期' },
      { name: 'current_time', label: '当前时间' },
      { name: 'current_datetime', label: '当前日期时间' },
      { name: 'active_agent_name', label: '当前 Agent 名称' },
      { name: 'default_model', label: '默认模型' },
      { name: 'user_name', label: '用户名' },
      { name: 'conversation_topic', label: '对话主题' },
    ]

    for (const bv of builtinVars) {
      if (!prefix || bv.name.toLowerCase().startsWith(prefix.toLowerCase())) {
        suggestions.push({
          name: bv.name,
          label: bv.label,
          type: 'string',
          isBuiltin: true,
        })
      }
    }

    return suggestions
  },

  /**
   * 获取 kb/tool 特殊变量的自动补全提示
   * 当用户输入 {{kb: 或 {{tool: 时显示
   */
  getSpecialAutocompleteSuggestions(
    cursorText: string,
  ): Array<{ name: string; label: string; type: 'kb' | 'tool' }> {
    const suggestions: Array<{ name: string; label: string; type: 'kb' | 'tool' }> = []

    // 检测 {{kb: 前缀
    const kbMatch = cursorText.match(/\{\{kb:(\w*)$/)
    if (kbMatch) {
      suggestions.push({
        name: 'kb:',
        label: '知识库注入 — 输入集合 ID',
        type: 'kb',
      })
    }

    // 检测 {{tool: 前缀
    const toolMatch = cursorText.match(/\{\{tool:(\w*)$/)
    if (toolMatch) {
      suggestions.push({
        name: 'tool:',
        label: '工具结果绑定 — 输入工具名称',
        type: 'tool',
      })
    }

    return suggestions
  },

  /**
   * 获取变量类型的默认输入控件配置
   */
  getInputConfig(type: PromptVariableType): {
    component: 'input' | 'textarea' | 'select' | 'switch'
    inputType?: string
  } {
    switch (type) {
      case 'string':
        return { component: 'input', inputType: 'text' }
      case 'number':
        return { component: 'input', inputType: 'number' }
      case 'boolean':
        return { component: 'switch' }
      case 'select':
        return { component: 'select' }
      case 'textarea':
        return { component: 'textarea' }
      default:
        return { component: 'input', inputType: 'text' }
    }
  },
}
