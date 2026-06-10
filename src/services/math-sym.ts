
/**
 * 数学工具 - 符号计算与验证模块
 * 提供表达式展开、因式分解、符号求导、等式验证等
 */

// ==================== 符号表达式 ====================

export type SymExpr =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string }
  | { type: 'add'; left: SymExpr; right: SymExpr }
  | { type: 'mul'; left: SymExpr; right: SymExpr }
  | { type: 'pow'; base: SymExpr; exp: SymExpr }
  | { type: 'neg'; expr: SymExpr }
  | { type: 'func'; name: string; arg: SymExpr }

const num = (v: number): SymExpr => ({ type: 'num', value: v })
const v = (n: string): SymExpr => ({ type: 'var', name: n })

/** 符号表达式求值 */
export function evalSym(expr: SymExpr, env: Record<string, number> = {}): number {
  switch (expr.type) {
    case 'num': return expr.value
    case 'var': return env[expr.name] ?? NaN
    case 'add': return evalSym(expr.left, env) + evalSym(expr.right, env)
    case 'mul': return evalSym(expr.left, env) * evalSym(expr.right, env)
    case 'pow': return Math.pow(evalSym(expr.base, env), evalSym(expr.exp, env))
    case 'neg': return -evalSym(expr.expr, env)
    case 'func': {
      const arg = evalSym(expr.arg, env)
      switch (expr.name) {
        case 'sin': return Math.sin(arg)
        case 'cos': return Math.cos(arg)
        case 'tan': return Math.tan(arg)
        case 'exp': return Math.exp(arg)
        case 'log': return Math.log(arg)
        case 'sqrt': return Math.sqrt(arg)
        case 'abs': return Math.abs(arg)
        default: return NaN
      }
    }
  }
}

/** 符号表达式转字符串 */
export function symToString(expr: SymExpr): string {
  switch (expr.type) {
    case 'num': return Number.isInteger(expr.value) ? expr.value.toString() : expr.value.toFixed(4)
    case 'var': return expr.name
    case 'add': return `(${symToString(expr.left)} + ${symToString(expr.right)})`
    case 'mul': return `(${symToString(expr.left)} * ${symToString(expr.right)})`
    case 'pow': return `(${symToString(expr.base)}^${symToString(expr.exp)})`
    case 'neg': return `(-${symToString(expr.expr)})`
    case 'func': return `${expr.name}(${symToString(expr.arg)})`
  }
}

/** 符号微分 */
export function symDiff(expr: SymExpr, varName: string): SymExpr {
  switch (expr.type) {
    case 'num': return num(0)
    case 'var': return expr.name === varName ? num(1) : num(0)
    case 'add': return { type: 'add', left: symDiff(expr.left, varName), right: symDiff(expr.right, varName) }
    case 'mul': // 乘法法则
      return {
        type: 'add',
        left: { type: 'mul', left: symDiff(expr.left, varName), right: expr.right },
        right: { type: 'mul', left: expr.left, right: symDiff(expr.right, varName) }
      }
    case 'pow': {
      // 链式法则 + 幂法则
      const f = expr.base, g = expr.exp
      const isConstBase = !hasVar(f, varName)
      const isConstExp = !hasVar(g, varName)

      if (isConstBase && isConstExp) return num(0)
      if (isConstExp) {
        // d/dx[f^n] = n * f^(n-1) * f'
        return {
          type: 'mul',
          left: { type: 'mul', left: g, right: { type: 'pow', base: f, exp: { type: 'add', left: g, right: num(-1) } } },
          right: symDiff(f, varName)
        }
      }
      if (isConstBase) {
        // d/dx[a^g] = a^g * ln(a) * g'
        return {
          type: 'mul',
          left: { type: 'mul', left: expr, right: { type: 'func', name: 'log', arg: f } },
          right: symDiff(g, varName)
        }
      }
      // 一般情况: d/dx[f^g] = f^g * (g' * ln(f) + g * f'/f)
      return {
        type: 'mul',
        left: expr,
        right: {
          type: 'add',
          left: { type: 'mul', left: symDiff(g, varName), right: { type: 'func', name: 'log', arg: f } },
          right: { type: 'mul', left: g, right: { type: 'mul', left: symDiff(f, varName), right: { type: 'pow', base: f, exp: num(-1) } } }
        }
      }
    }
    case 'neg': return { type: 'neg', expr: symDiff(expr.expr, varName) }
    case 'func': {
      const du = symDiff(expr.arg, varName)
      const inner = symDiff(expr.arg, varName)
      switch (expr.name) {
        case 'sin': return { type: 'mul', left: { type: 'func', name: 'cos', arg: expr.arg }, right: inner }
        case 'cos': return { type: 'neg', expr: { type: 'mul', left: { type: 'func', name: 'sin', arg: expr.arg }, right: inner } }
        case 'tan': return { type: 'mul', left: { type: 'pow', base: { type: 'func', name: 'cos', arg: expr.arg }, exp: num(-2) }, right: inner }
        case 'exp': return { type: 'mul', left: expr, right: inner }
        case 'log': return { type: 'mul', left: { type: 'pow', base: expr.arg, exp: num(-1) }, right: inner }
        case 'sqrt': return { type: 'mul', left: { type: 'pow', base: expr, exp: num(-1) }, right: { type: 'mul', left: num(0.5), right: inner } }
        default: return num(0)
      }
    }
  }
}

function hasVar(expr: SymExpr, name: string): boolean {
  switch (expr.type) {
    case 'num': return false
    case 'var': return expr.name === name
    case 'add': case 'mul': return hasVar(expr.left, name) || hasVar(expr.right, name)
    case 'pow': return hasVar(expr.base, name) || hasVar(expr.exp, name)
    case 'neg': return hasVar(expr.expr, name)
    case 'func': return hasVar(expr.arg, name)
  }
}

/** 简单化简 */
export function simplify(expr: SymExpr): SymExpr {
  const e = deepSimplify(expr)
  return e
}

function deepSimplify(expr: SymExpr): SymExpr {
  switch (expr.type) {
    case 'num': case 'var': return expr
    case 'neg': {
      const inner = deepSimplify(expr.expr)
      if (inner.type === 'num') return num(-inner.value)
      if (inner.type === 'neg') return inner.expr
      return { type: 'neg', expr: inner }
    }
    case 'add': {
      const l = deepSimplify(expr.left), r = deepSimplify(expr.right)
      if (l.type === 'num' && l.value === 0) return r
      if (r.type === 'num' && r.value === 0) return l
      if (l.type === 'num' && r.type === 'num') return num(l.value + r.value)
      return { type: 'add', left: l, right: r }
    }
    case 'mul': {
      const l = deepSimplify(expr.left), r = deepSimplify(expr.right)
      if (l.type === 'num' && l.value === 0) return num(0)
      if (r.type === 'num' && r.value === 0) return num(0)
      if (l.type === 'num' && l.value === 1) return r
      if (r.type === 'num' && r.value === 1) return l
      if (l.type === 'num' && r.type === 'num') return num(l.value * r.value)
      return { type: 'mul', left: l, right: r }
    }
    case 'pow': {
      const b = deepSimplify(expr.base), e = deepSimplify(expr.exp)
      if (e.type === 'num' && e.value === 0) return num(1)
      if (e.type === 'num' && e.value === 1) return b
      return { type: 'pow', base: b, exp: e }
    }
    case 'func': return { type: 'func', name: expr.name, arg: deepSimplify(expr.arg) }
  }
}

// ==================== 数学验证 ====================

export interface VerifyResult {
  verified: boolean
  confidence: 'high' | 'medium' | 'low'
  details: string
  counterExample?: string
}

/**
 * 数值验证等式/不等式
 * 在多个随机点检验是否成立
 */
export function verifyEquality(
  lhs: (env: Record<string, number>) => number,
  rhs: (env: Record<string, number>) => number,
  variables: string[],
  tolerance: number = 1e-6,
  testCount: number = 1000
): VerifyResult {
  let passCount = 0
  let failExample: string | undefined

  for (let t = 0; t < testCount; t++) {
    const env: Record<string, number> = {}
    for (const v of variables) {
      env[v] = (Math.random() - 0.5) * 20 + 0.1 // 避免0附近
    }

    const l = lhs(env)
    const r = rhs(env)

    if (!isFinite(l) || !isFinite(r)) continue

    const relError = Math.abs(l - r) / Math.max(Math.abs(l), Math.abs(r), 1)
    if (relError < tolerance) {
      passCount++
    } else if (!failExample) {
      const envStr = variables.map(v => `${v}=${env[v].toFixed(4)}`).join(', ')
      failExample = `${envStr}: 左=${l.toFixed(8)}, 右=${r.toFixed(8)}, 相对误差=${relError.toExponential(2)}`
    }
  }

  const ratio = passCount / testCount
  if (ratio > 0.99) {
    return { verified: true, confidence: 'high', details: `在 ${testCount} 次随机测试中 ${passCount} 次通过 (${(ratio * 100).toFixed(1)}%)` }
  }
  if (ratio > 0.95) {
    return { verified: true, confidence: 'medium', details: `通过率 ${(ratio * 100).toFixed(1)}%，可能存在边界情况`, counterExample: failExample }
  }
  return { verified: false, confidence: 'low', details: `通过率仅 ${(ratio * 100).toFixed(1)}%，等式可能不成立`, counterExample: failExample }
}

/**
 * 搜索反例
 */
export function findCounterExample(
  predicate: (env: Record<string, number>) => boolean,
  variables: string[],
  searchRange: [number, number] = [-10, 10],
  attempts: number = 10000
): { found: boolean; example?: string } {
  for (let t = 0; t < attempts; t++) {
    const env: Record<string, number> = {}
    for (const v of variables) {
      env[v] = searchRange[0] + Math.random() * (searchRange[1] - searchRange[0])
    }

    if (!predicate(env)) {
      const envStr = variables.map(v => `${v}=${env[v].toFixed(4)}`).join(', ')
      return { found: true, example: envStr }
    }
  }
  return { found: false }
}

/**
 * 验证数论命题
 */
export function verifyNumberTheory(
  predicate: (n: number) => boolean,
  range: [number, number] = [1, 10000]
): VerifyResult {
  let passCount = 0
  let failN: number | undefined

  for (let n = range[0]; n <= range[1]; n++) {
    if (predicate(n)) {
      passCount++
    } else {
      failN = n
      break
    }
  }

  const total = range[1] - range[0] + 1
  if (passCount === total) {
    return { verified: true, confidence: total > 1000 ? 'high' : 'medium', details: `在 [${range[0]}, ${range[1]}] 范围内全部 ${total} 个数通过验证` }
  }

  return { verified: false, confidence: 'high', details: `在 n=${failN} 处发现反例`, counterExample: `n=${failN}` }
}

// ==================== 表达式解析器 ====================

/**
 * 简易数学表达式解析器
 * 将字符串解析为可计算的函数
 */
export function parseExpression(expr: string): (env: Record<string, number>) => number {
  // 安全解析：只允许数学表达式
  const sanitized = expr.replace(/\s+/g, '')
  if (!/^[0-9a-zA-Z+\-*/^().,]+$/.test(sanitized)) {
    throw new Error('表达式包含非法字符')
  }

  // 转换为 JS 可执行表达式
  const jsExpr = sanitized
    .replace(/\^/g, '**')
    .replace(/sin\(/g, 'Math.sin(')
    .replace(/cos\(/g, 'Math.cos(')
    .replace(/tan\(/g, 'Math.tan(')
    .replace(/exp\(/g, 'Math.exp(')
    .replace(/log\(/g, 'Math.log(')
    .replace(/ln\(/g, 'Math.log(')
    .replace(/sqrt\(/g, 'Math.sqrt(')
    .replace(/abs\(/g, 'Math.abs(')
    .replace(/pi/g, 'Math.PI')
    .replace(/(?<![a-zA-Z])e(?![a-zA-Z])/g, 'Math.E')

  try {
    // 使用解构赋值代替 with 语句，兼容严格模式
    const paramNames = Array.from(new Set(jsExpr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []))
      .filter(name => !['Math', 'sin', 'cos', 'tan', 'exp', 'log', 'ln', 'sqrt', 'abs', 'PI', 'E'].includes(name))
    const fnBody = `const {${paramNames.join(',')}} = env; return (${jsExpr})`
    const fn = new Function('env', fnBody)
    return (env: Record<string, number>) => {
      try { return fn(env) } catch { return NaN }
    }
  } catch {
    throw new Error('表达式解析失败')
  }
}
