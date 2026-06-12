import type { Tool, ToolDefinition, ToolExecuteResult } from '../types'
import { mcpService } from './mcp-service'
import { memoryService } from './memory-service'
import { executeMathTool } from './math-tools'

// ==================== 安全数学表达式求值器 ====================
// 递归下降解析器，支持：四则运算、幂运算、括号、常见数学函数和常量

const MATH_FUNCS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: Math.round,
  sign: Math.sign, sqrt: Math.sqrt, cbrt: Math.cbrt,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  exp: Math.exp, log: Math.log, log2: Math.log2, log10: Math.log10,
  ln: Math.log, log1p: Math.log1p, expm1: Math.expm1,
  pow: Math.pow, min: Math.min, max: Math.max,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  trunc: Math.trunc, hypot: Math.hypot,
  // 阶乘
  fact: (n: number) => {
    if (n < 0 || !Number.isInteger(n)) throw new Error('阶乘仅支持非负整数')
    if (n > 170) throw new Error('数值溢出：阶乘上限为 170!')
    let r = 1; for (let i = 2; i <= n; i++) r *= i; return r
  }
}

const MATH_CONSTS: Record<string, number> = {
  pi: Math.PI, π: Math.PI, e: Math.E,
  ln2: Math.LN2, ln10: Math.LN10,
  sqrt2: Math.SQRT2, sqrt1_2: Math.SQRT1_2,
  phi: (1 + Math.sqrt(5)) / 2
}

class ExprParser {
  private pos = 0
  constructor(private src: string) {}

  parse(): number {
    this.skip()
    const val = this.parseExpr()
    this.skip()
    if (this.pos < this.src.length) {
      throw new Error(`意外的字符 "${this.src[this.pos]}" 在位置 ${this.pos}`)
    }
    return val
  }

  private skip() { while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++ }

  private peek(): string { return this.src[this.pos] ?? '' }
  private advance(): string { return this.src[this.pos++] }

  // 表达式 = 加减
  private parseExpr(): number {
    let left = this.parseTerm()
    while (true) {
      this.skip()
      const ch = this.peek()
      if (ch === '+' || ch === '-') {
        this.advance()
        const right = this.parseTerm()
        left = ch === '+' ? left + right : left - right
      } else break
    }
    return left
  }

  // 项 = 乘除模
  private parseTerm(): number {
    let left = this.parsePower()
    while (true) {
      this.skip()
      const ch = this.peek()
      if (ch === '*' || ch === '/' || ch === '%') {
        this.advance()
        const right = this.parsePower()
        if (ch === '*') left *= right
        else if (ch === '/') { if (right === 0) throw new Error('除以零'); left /= right }
        else { if (right === 0) throw new Error('模运算除以零'); left %= right }
      } else break
    }
    return left
  }

  // 幂运算（右结合）
  private parsePower(): number {
    let base = this.parseUnary()
    this.skip()
    if (this.peek() === '^') {
      this.advance()
      const exp = this.parsePower() // 右结合递归
      base = Math.pow(base, exp)
    }
    // 支持隐式幂运算：2² 等不处理，但支持 n! 后缀
    this.skip()
    if (this.peek() === '!') {
      this.advance()
      base = MATH_FUNCS.fact(base)
    }
    return base
  }

  // 一元运算
  private parseUnary(): number {
    this.skip()
    if (this.peek() === '-') { this.advance(); return -this.parseUnary() }
    if (this.peek() === '+') { this.advance(); return this.parseUnary() }
    return this.parseAtom()
  }

  // 原子：数字、常量、函数、括号
  private parseAtom(): number {
    this.skip()
    const ch = this.peek()
    if (!ch) throw new Error('表达式意外结束')

    // 括号
    if (ch === '(') {
      this.advance()
      const val = this.parseExpr()
      this.skip()
      if (this.peek() !== ')') throw new Error('缺少右括号 ")"')
      this.advance()
      return val
    }

    // 数字（含科学计数法）
    if (/\d|\./.test(ch)) return this.parseNumber()

    // 标识符（函数或常量）
    if (/[a-zA-Z_α-ωΑ-Ω]/.test(ch)) return this.parseIdentifier()

    throw new Error(`无法解析字符 "${ch}" 在位置 ${this.pos}`)
  }

  private parseNumber(): number {
    const start = this.pos
    while (this.pos < this.src.length && /[\d.]/.test(this.src[this.pos])) this.pos++
    // 科学计数法
    if (this.pos < this.src.length && /[eE]/.test(this.src[this.pos])) {
      this.pos++
      if (this.pos < this.src.length && /[+-]/.test(this.src[this.pos])) this.pos++
      while (this.pos < this.src.length && /\d/.test(this.src[this.pos])) this.pos++
    }
    const num = parseFloat(this.src.slice(start, this.pos))
    if (isNaN(num)) throw new Error(`无效的数字 "${this.src.slice(start, this.pos)}"`)
    return num
  }

  private parseIdentifier(): number {
    const start = this.pos
    while (this.pos < this.src.length && /[a-zA-Z0-9_]/.test(this.src[this.pos])) this.pos++
    const name = this.src.slice(start, this.pos).toLowerCase()

    // 常量
    if (name in MATH_CONSTS) return MATH_CONSTS[name]

    // 函数
    if (name in MATH_FUNCS) {
      this.skip()
      if (this.peek() !== '(') throw new Error(`函数 "${name}" 后需要括号`)
      this.advance()
      const args: number[] = []
      this.skip()
      if (this.peek() !== ')') {
        args.push(this.parseExpr())
        while (this.peek() === ',') { this.advance(); args.push(this.parseExpr()) }
      }
      this.skip()
      if (this.peek() !== ')') throw new Error(`函数 "${name}" 缺少右括号`)
      this.advance()
      return MATH_FUNCS[name](...args)
    }

    throw new Error(`未知的标识符 "${name}"`)
  }
}

/**
 * 安全的数学表达式求值
 * 支持：四则运算、幂(^)、取模(%)、括号、科学计数法
 * 函数：sin/cos/tan/asin/acos/atan/sqrt/cbrt/log/ln/exp/pow/min/max/abs/ceil/floor/round/fact 等
 * 常量：pi(π)/e/ln2/ln10/sqrt2/phi
 */
function safeEvaluate(expression: string): number {
  const cleaned = expression.replace(/\s+/g, ' ').trim()
  if (!cleaned) throw new Error('表达式为空')
  const parser = new ExprParser(cleaned)
  const result = parser.parse()
  if (!isFinite(result)) throw new Error(`计算结果溢出: ${result}`)
  return result
}

/**
 * 工具服务 - 管理工具定义与执行
 */
export const toolService = {
  /**
   * 将 Tool 转换为 OpenAI Function Calling 格式
   */
  toToolDefinition(tool: Tool): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }
  },

  /**
   * 将工具列表转换为 OpenAI Function Calling 格式
   */
  toToolDefinitions(tools: Tool[]): ToolDefinition[] {
    return tools.filter((t) => t.enabled).map((t) => this.toToolDefinition(t))
  },

  /**
   * 执行工具调用
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    tools: Tool[]
  ): Promise<ToolExecuteResult> {
    const tool = tools.find((t) => t.name === toolName)
    if (!tool) {
      return { success: false, data: '', error: `工具 "${toolName}" 未找到` }
    }

    try {
      // 内置工具
      if (tool.isBuiltIn) {
        return await this.executeBuiltInTool(toolName, args)
      }

      // MCP 工具
      if (tool.isMCP && tool.mcpServerId) {
        return await mcpService.callTool(tool.mcpServerId, toolName, args)
      }

      return { success: false, data: '', error: '未知的工具类型' }
    } catch (error) {
      const message = error instanceof Error ? error.message : '工具执行失败'
      return { success: false, data: '', error: message }
    }
  },

  /**
   * 执行内置工具
   */
  async executeBuiltInTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolExecuteResult> {
    switch (toolName) {
      case 'get_current_time':
        return {
          success: true,
          data: JSON.stringify({
            datetime: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          })
        }

      case 'calculate': {
        try {
          const expression = String(args.expression ?? '')
          const result = safeEvaluate(expression)
          return { success: true, data: JSON.stringify({ expression, result }) }
        } catch (e) {
          const msg = e instanceof Error ? e.message : '计算表达式无效'
          return { success: false, data: '', error: msg }
        }
      }

      case 'remember': {
        const key = String(args.key ?? '')
        const value = String(args.value ?? '')
        if (!key || !value) {
          return { success: false, data: '', error: 'remember 工具需要 key 和 value 参数' }
        }
        // 使用固定 agentId 'default'，实际调用时由 agent-engine 覆盖
        memoryService.remember('default', key, value)
        return { success: true, data: `已记住: ${key} = ${value}` }
      }

      case 'recall': {
        const key = String(args.key ?? '')
        if (!key) {
          return { success: false, data: '', error: 'recall 工具需要 key 参数' }
        }
        const value = memoryService.recall('default', key)
        if (value === null || value === undefined) {
          return { success: true, data: `没有找到关于 "${key}" 的记忆` }
        }
        return { success: true, data: `${key} = ${value}` }
      }

      case 'math_analyze':
      case 'math_algebra':
      case 'math_geometry':
      case 'math_number':
      case 'math_symbolic':
      case 'math_verify': {
        return executeMathTool(toolName, args)
      }

      case 'ask_self':
      case 'define_requirement':
      case 'review_requirements':
      case 'ask_human':
      case 'site_analyzer_start':
      case 'site_analyzer_cancel':
        // 这些工具由 agent-engine 内部处理，不应走到这里
        return { success: true, data: '此工具由 Agent 引擎内部处理，请通过 Agent 模式使用。' }

      default:
        return { success: false, data: '', error: `未知的内置工具: ${toolName}` }
    }
  }
}
