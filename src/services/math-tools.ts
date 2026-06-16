
/**
 * 数学工具 - 主入口
 * 整合所有子模块，提供统一的工具执行接口
 */

import type { ToolExecuteResult } from '../types'
import {
  eulerPhi, mobius, sievePrimes, isPrime,
  modPow, modInverse, primeFactorization, findPrimitiveRoot,
  crt, legendreSymbol, jacobiSymbol
} from './math-nt'
import {
  generateRealCharacters, computeLPartial, computeL1,
  computeLEuler, analyzeProductL, verifyOrthogonality,
  listCharacters
} from './math-dirichlet'
import {
  computeLimit, computeSeries, numericalDerivative,
  numericalIntegrate, taylorExpand, Matrix, geometry
} from './math-ag'
import {
  verifyEquality,
  findCounterExample, verifyNumberTheory, parseExpression
} from './math-sym'

// ==================== 工具执行分发 ====================

/**
 * 执行数学工具调用
 * @param toolName 工具名称
 * @param args 工具参数
 * @returns 执行结果
 */
export function executeMathTool(
  toolName: string,
  args: Record<string, unknown>
): ToolExecuteResult {
  try {
    switch (toolName) {
      case 'math_analyze': return executeAnalyze(args)
      case 'math_algebra': return executeAlgebra(args)
      case 'math_geometry': return executeGeometry(args)
      case 'math_number': return executeNumber(args)
      case 'math_symbolic': return executeSymbolic(args)
      case 'math_verify': return executeVerify(args)
      default:
        return { success: false, data: '', error: `未知的数学工具: ${toolName}` }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '数学计算出错'
    return { success: false, data: '', error: msg }
  }
}

// ==================== math_analyze: 数学分析 ====================

function executeAnalyze(args: Record<string, unknown>): ToolExecuteResult {
  const operation = String(args.operation ?? '')
  const params = args.params as Record<string, unknown> ?? {}

  switch (operation) {
    case 'limit': {
      const expr = String(params.expression ?? '')
      const approach = Number(params.approach ?? 0)
      const direction = String(params.direction ?? 'both') as 'both' | 'left' | 'right'
      const fn = parseExpression(expr)
      const result = computeLimit((x) => fn({ x }), approach, direction)
      return {
        success: true,
        data: `极限计算: lim(x→${approach}${direction !== 'both' ? direction[0] : ''}) ${expr}
` +
          `结果: ${isFinite(result.value) ? result.value : result.value > 0 ? '+∞' : '-∞'}
` +
          `收敛: ${result.converged ? '是' : '否'}
详情: ${result.details}`
      }
    }

    case 'series': {
      const expr = String(params.expression ?? '')
      const N = Number(params.N ?? 10000)
      const fn = parseExpression(expr)
      const termFn = (n: number) => fn({ n })
      const result = computeSeries(termFn, N)
      return {
        success: true,
        data: `级数求和: Σ ${expr} (n=1 to ${N})
` +
          `部分和: ${result.partialSum}
` +
          `收敛: ${result.converged ? '是' : '不确定'}
方法: ${result.method}
详情: ${result.details}`
      }
    }

    case 'derivative': {
      const expr = String(params.expression ?? '')
      const x0 = Number(params.x0 ?? 0)
      const order = Number(params.order ?? 1)
      const fn = parseExpression(expr)
      const result = numericalDerivative((x) => fn({ x }), x0, order)
      return {
        success: true,
        data: `数值微分: d${order > 1 ? '^' + order : ''}/dx${order > 1 ? '^' + order : ''} [${expr}] 在 x=${x0}
结果: ${result}`
      }
    }

    case 'integrate': {
      const expr = String(params.expression ?? '')
      const a = Number(params.a ?? 0)
      const b = Number(params.b ?? 1)
      const n = Number(params.n ?? 10000)
      const fn = parseExpression(expr)
      const result = numericalIntegrate((x) => fn({ x }), a, b, n)
      return {
        success: true,
        data: `数值积分: ∫[${a},${b}] ${expr} dx
结果: ${result.value}
方法: ${result.method}`
      }
    }

    case 'taylor': {
      const expr = String(params.expression ?? '')
      const x0 = Number(params.x0 ?? 0)
      const order = Number(params.order ?? 6)
      const fn = parseExpression(expr)
      const result = taylorExpand((x) => fn({ x }), x0, order)
      return {
        success: true,
        data: `Taylor 展开: ${expr} 在 x=${x0} 处，阶数=${order}
` +
          `${result.expression}
` +
          `系数: [${result.coefficients.map((c, i) => `a_${i}=${c.toFixed(6)}`).join(', ')}]`
      }
    }

    default:
      return { success: false, data: '', error: `未知分析操作: ${operation}。可用: limit, series, derivative, integrate, taylor` }
  }
}

// ==================== math_algebra: 代数运算 ====================

function executeAlgebra(args: Record<string, unknown>): ToolExecuteResult {
  const operation = String(args.operation ?? '')
  const params = args.params as Record<string, unknown> ?? {}

  switch (operation) {
    case 'matrix_det': {
      const matrixData = params.matrix as number[][]
      if (!matrixData) return { success: false, data: '', error: '需要 matrix 参数' }
      const m = new Matrix(matrixData)
      const det = m.determinant()
      return {
        success: true,
        data: `矩阵行列式:
${m.toString()}
行列式 = ${det}`
      }
    }

    case 'matrix_eigenvalues': {
      const matrixData = params.matrix as number[][]
      if (!matrixData) return { success: false, data: '', error: '需要 matrix 参数' }
      const m = new Matrix(matrixData)
      const eigenvals = m.eigenvalues()
      return {
        success: true,
        data: `矩阵特征值:
${m.toString()}
特征值: [${eigenvals.map(v => v.toFixed(6)).join(', ')}]`
      }
    }

    case 'matrix_inverse': {
      const matrixData = params.matrix as number[][]
      if (!matrixData) return { success: false, data: '', error: '需要 matrix 参数' }
      const m = new Matrix(matrixData)
      const inv = m.inverse()
      if (!inv) return { success: true, data: '矩阵不可逆（奇异矩阵）' }
      return {
        success: true,
        data: `矩阵求逆:
原矩阵:
${m.toString()}
逆矩阵:
${inv.toString()}`
      }
    }

    case 'matrix_multiply': {
      const aData = params.matrix_a as number[][]
      const bData = params.matrix_b as number[][]
      if (!aData || !bData) return { success: false, data: '', error: '需要 matrix_a 和 matrix_b 参数' }
      const a = new Matrix(aData), b = new Matrix(bData)
      const c = a.mul(b)
      return {
        success: true,
        data: `矩阵乘法:
A:
${a.toString()}
B:
${b.toString()}
A×B:
${c.toString()}`
      }
    }

    case 'polynomial_roots': {
      const coeffs = (params.coefficients as number[]) ?? []
      if (coeffs.length < 2) return { success: false, data: '', error: '需要至少2个系数' }
      const roots = findPolynomialRoots(coeffs)
      return {
        success: true,
        data: `多项式根: ${coeffs.map((c, i) => `${c}x^${coeffs.length - 1 - i}`).join(' + ')}
` +
          `根: [${roots.map(r => r.toFixed(6)).join(', ')}]`
      }
    }

    default:
      return { success: false, data: '', error: `未知代数操作: ${operation}。可用: matrix_det, matrix_eigenvalues, matrix_inverse, matrix_multiply, polynomial_roots` }
  }
}

/** 多项式求根（Durand-Kerner 方法） */
function findPolynomialRoots(coeffs: number[]): number[] {
  const n = coeffs.length - 1
  if (n === 1) return [-coeffs[1] / coeffs[0]]
  if (n === 2) {
    const [a, b, c] = coeffs
    const disc = b * b - 4 * a * c
    if (disc >= 0) return [(-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a)]
    return [(-b) / (2 * a)] // 只返回实根
  }

  // Durand-Kerner 迭代
  const lc = coeffs[0]
  const roots: number[] = []
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n
    roots.push(Math.cos(angle) + Math.sin(angle) * 1) // 初始猜测
  }

  for (let iter = 0; iter < 1000; iter++) {
    let maxChange = 0
    for (let i = 0; i < n; i++) {
      let num = 0, den = 1
      for (let j = 0; j <= n; j++) {
        num = num * roots[i] + coeffs[j]
      }
      for (let j = 0; j < n; j++) {
        if (j !== i) den *= (roots[i] - roots[j])
      }
      if (Math.abs(den) < 1e-30) continue
      const change = num / den
      roots[i] -= change
      maxChange = Math.max(maxChange, Math.abs(change))
    }
    if (maxChange < 1e-12) break
  }

  return roots.filter(r => isFinite(r))
}

// ==================== math_geometry: 几何计算 ====================

function executeGeometry(args: Record<string, unknown>): ToolExecuteResult {
  const operation = String(args.operation ?? '')
  const params = args.params as Record<string, unknown> ?? {}

  switch (operation) {
    case 'distance': {
      const p1 = params.point1 as number[]
      const p2 = params.point2 as number[]
      if (!p1 || !p2) return { success: false, data: '', error: '需要 point1 和 point2' }
      return {
        success: true,
        data: `距离: d(${JSON.stringify(p1)}, ${JSON.stringify(p2)}) = ${geometry.distance(p1, p2).toFixed(6)}`
      }
    }

    case 'triangle_area': {
      const a = Number(params.a ?? 0), b = Number(params.b ?? 0), c = Number(params.c ?? 0)
      return {
        success: true,
        data: `三角形面积(Heron): a=${a}, b=${b}, c=${c}
面积 = ${geometry.triangleArea(a, b, c).toFixed(6)}`
      }
    }

    case 'polygon_area': {
      const verts = params.vertices as Array<[number, number]>
      if (!verts) return { success: false, data: '', error: '需要 vertices 参数' }
      return {
        success: true,
        data: `多边形面积(Shoelace): ${verts.length}个顶点
面积 = ${geometry.polygonArea(verts).toFixed(6)}`
      }
    }

    case 'curvature': {
      const expr = String(params.expression ?? '')
      const x = Number(params.x ?? 0)
      const fn = parseExpression(expr)
      const k = geometry.curvature((x: number) => fn({ x }), x)
      return {
        success: true,
        data: `曲率: κ(${expr}, x=${x}) = ${k.toFixed(6)}`
      }
    }

    case 'euler_characteristic': {
      const V = Number(params.V ?? 0), E = Number(params.E ?? 0), F = Number(params.F ?? 0)
      const chi = geometry.eulerCharacteristic(V, E, F)
      return {
        success: true,
        data: `Euler示性数: χ = V - E + F = ${V} - ${E} + ${F} = ${chi}`
      }
    }

    case 'vector_ops': {
      const a = params.vector_a as number[]
      const b = params.vector_b as number[]
      const op = String(params.vec_op ?? 'dot')
      if (!a || !b) return { success: false, data: '', error: '需要 vector_a 和 vector_b' }
      if (op === 'cross') {
        const c = geometry.cross(a, b)
        return { success: true, data: `叉积: ${JSON.stringify(a)} × ${JSON.stringify(b)} = ${JSON.stringify(c)}` }
      }
      return { success: true, data: `点积: ${JSON.stringify(a)} · ${JSON.stringify(b)} = ${geometry.dot(a, b)}` }
    }

    default:
      return { success: false, data: '', error: `未知几何操作: ${operation}。可用: distance, triangle_area, polygon_area, curvature, euler_characteristic, vector_ops` }
  }
}

// ==================== math_number: 数论计算 ====================

function executeNumber(args: Record<string, unknown>): ToolExecuteResult {
  const operation = String(args.operation ?? '')
  const params = args.params as Record<string, unknown> ?? {}

  switch (operation) {
    case 'prime_test': {
      const n = Number(params.n ?? 0)
      return {
        success: true,
        data: `素性测试: ${n} → ${isPrime(n) ? '素数' : '合数'}`
      }
    }

    case 'prime_sieve': {
      const n = Number(params.n ?? 100)
      const primes = sievePrimes(n)
      return {
        success: true,
        data: `素数筛: 不超过 ${n} 的素数共 ${primes.length} 个
${primes.length <= 50 ? primes.join(', ') : primes.slice(0, 50).join(', ') + ' ...'}`
      }
    }

    case 'factorize': {
      const n = Number(params.n ?? 0)
      const factors = primeFactorization(n)
      return {
        success: true,
        data: `素因子分解: ${n} = ${factors.map(([p, k]) => k > 1 ? `${p}^${k}` : `${p}`).join(' × ')}`
      }
    }

    case 'euler_phi': {
      const n = Number(params.n ?? 0)
      return {
        success: true,
        data: `Euler函数: φ(${n}) = ${eulerPhi(n)}`
      }
    }

    case 'mobius': {
      const n = Number(params.n ?? 0)
      const mu = mobius(n)
      return {
        success: true,
        data: `Möbius函数: μ(${n}) = ${mu}`
      }
    }

    case 'mod_arithmetic': {
      const a = Number(params.a ?? 0), m = Number(params.m ?? 1)
      const op = String(params.mod_op ?? 'power')
      const b = Number(params.b ?? 0)
      if (op === 'power') {
        return { success: true, data: `模幂: ${a}^${b} mod ${m} = ${modPow(a, b, m)}` }
      }
      if (op === 'inverse') {
        const inv = modInverse(a, m)
        return { success: true, data: `模逆: ${a}^(-1) mod ${m} = ${inv !== null ? inv : '不存在（不互素）'}` }
      }
      if (op === 'crt') {
        const remainders = params.remainders as number[] ?? []
        const moduli = params.moduli as number[] ?? []
        const result = crt(remainders, moduli)
        return { success: true, data: `中国剩余定理: x ≡ ${remainders} (mod ${moduli}) → x = ${result}` }
      }
      return { success: false, data: '', error: `未知模运算: ${op}` }
    }

    case 'legendre': {
      const a = Number(params.a ?? 0), p = Number(params.p ?? 2)
      return {
        success: true,
        data: `Legendre符号: (${a}/${p}) = ${legendreSymbol(a, p)}`
      }
    }

    case 'jacobi': {
      const a = Number(params.a ?? 0), n = Number(params.n ?? 1)
      return {
        success: true,
        data: `Jacobi符号: (${a}/${n}) = ${jacobiSymbol(a, n)}`
      }
    }

    case 'primitive_root': {
      const n = Number(params.n ?? 0)
      const g = findPrimitiveRoot(n)
      return {
        success: true,
        data: `原根: ${n} 的最小原根 = ${g !== null ? g : '不存在'}`
      }
    }

    case 'dirichlet_chars': {
      const q = Number(params.q ?? 1)
      const info = listCharacters(q)
      return { success: true, data: info }
    }

    case 'l_function': {
      const q = Number(params.q ?? 1)
      const chiIndex = Number(params.chi_index ?? 0)
      const s = Number(params.s ?? 1)
      const N = Number(params.N ?? 50000)
      const chars = generateRealCharacters(q)
      if (chiIndex >= chars.length) {
        return { success: false, data: '', error: `特征索引 ${chiIndex} 超出范围（共 ${chars.length} 个实特征）` }
      }
      const chi = chars[chiIndex]
      const result = s === 1 ? computeL1(chi, N) : computeLPartial(chi, s, N)
      return {
        success: true,
        data: `L函数计算:
` +
          `  L(${s}, χ_${chiIndex}) for q=${q}
` +
          `  特征类型: ${chi.isPrincipal ? '主特征' : '非主'}, ${chi.isReal ? '实特征' : '复特征'}, ${chi.isPrimitive ? '本原' : '非本原'}
` +
          `  导子: ${chi.conductor}
` +
          `  L(${s}, χ) ≈ ${result.value}
` +
          `  方法: ${result.method}
` +
          `  误差界: ${result.errorBound.toExponential(2)}`
      }
    }

    case 'l_function_euler': {
      const q = Number(params.q ?? 1)
      const chiIndex = Number(params.chi_index ?? 0)
      const s = Number(params.s ?? 1)
      const maxP = Number(params.max_prime ?? 10000)
      const chars = generateRealCharacters(q)
      if (chiIndex >= chars.length) {
        return { success: false, data: '', error: `特征索引超出范围` }
      }
      const chi = chars[chiIndex]
      const result = computeLEuler(chi, s, maxP)
      return {
        success: true,
        data: `L函数(欧拉乘积): L(${s}, χ_${chiIndex}) for q=${q}\n` +
          `  值 ≈ ${result.value}\n` +
          `  方法: ${result.method}\n` +
          `  误差界: ${result.errorBound.toExponential(2)}`
      }
    }

    case 'product_l': {
      const q = Number(params.q ?? 1)
      const s = Number(params.s ?? 1.01)
      const N = Number(params.N ?? 50000)
      const result = analyzeProductL(s, q, N)
      const charInfo = result.characters.map(c =>
        `  χ_${c.index}: ${c.isPrincipal ? '主' : '非主'}, L(${s},χ)=${c.lValue.toFixed(6)}`
      ).join('\n')
      return {
        success: true,
        data: `乘积分析: ∏_χ L(${s},χ) for q=${q}
` +
          `  乘积值 = ${result.productValue.toFixed(6)}
` +
          `${charInfo}
` +
          `  结论: ${result.conclusion}`
      }
    }

    case 'orthogonality': {
      const q = Number(params.q ?? 1)
      const result = verifyOrthogonality(q)
      return {
        success: true,
        data: `正交性验证(q=${q}):
  通过: ${result.valid ? '是' : '否'}
  最大误差: ${result.maxError.toFixed(6)}
  详情: ${result.details}`
      }
    }

    default:
      return { success: false, data: '', error: `未知数论操作: ${operation}。可用: prime_test, prime_sieve, factorize, euler_phi, mobius, mod_arithmetic, legendre, jacobi, primitive_root, dirichlet_chars, l_function, l_function_euler, product_l, orthogonality` }
  }
}

// ==================== math_symbolic: 符号计算 ====================

function executeSymbolic(args: Record<string, unknown>): ToolExecuteResult {
  const operation = String(args.operation ?? '')
  const params = args.params as Record<string, unknown> ?? {}

  switch (operation) {
    case 'derivative': {
      const expr = String(params.expression ?? '')
      const varName = String(params.variable ?? 'x')
      const fn = parseExpression(expr)
      // 数值验证导数
      const x0 = Number(params.x0 ?? 1)
      const numDeriv = numericalDerivative((x) => fn({ x }), x0)
      return {
        success: true,
        data: `符号微分: d/d${varName} [${expr}]
` +
          `在 ${varName}=${x0} 处的数值验证: ${numDeriv.toFixed(8)}
` +
          `提示: 使用 math_verify 工具可在多个点验证导数公式的正确性`
      }
    }

    case 'expand': {
      const expr = String(params.expression ?? '')
      // 数值展开验证
      const fn = parseExpression(expr)
      const testPoints = [0.5, 1, 1.5, 2, 2.5]
      const values = testPoints.map(x => `f(${x})=${fn({ x }).toFixed(6)}`).join(', ')
      return {
        success: true,
        data: `表达式展开: ${expr}
数值验证: ${values}
提示: 可用 math_verify 在更多点验证`
      }
    }

    case 'simplify': {
      const expr = String(params.expression ?? '')
      const fn = parseExpression(expr)
      const testPoints = [0.5, 1, 2, 3, 5]
      const values = testPoints.map(x => `f(${x})=${fn({ x }).toFixed(6)}`).join(', ')
      return {
        success: true,
        data: `表达式化简: ${expr}
数值参考: ${values}
提示: 可用 math_verify 验证化简前后是否等价`
      }
    }

    default:
      return { success: false, data: '', error: `未知符号操作: ${operation}。可用: derivative, expand, simplify` }
  }
}

// ==================== math_verify: 数学验证 ====================

function executeVerify(args: Record<string, unknown>): ToolExecuteResult {
  const operation = String(args.operation ?? '')
  const params = args.params as Record<string, unknown> ?? {}

  switch (operation) {
    case 'equality': {
      const lhsExpr = String(params.lhs ?? '')
      const rhsExpr = String(params.rhs ?? '')
      const variables = (params.variables as string[]) ?? ['x']
      const tolerance = Number(params.tolerance ?? 1e-6)
      const testCount = Number(params.test_count ?? 1000)

      const lhsFn = parseExpression(lhsExpr)
      const rhsFn = parseExpression(rhsExpr)

      const result = verifyEquality(
        (env) => lhsFn(env),
        (env) => rhsFn(env),
        variables, tolerance, testCount
      )

      return {
        success: true,
        data: `等式验证: ${lhsExpr} = ${rhsExpr}
` +
          `验证结果: ${result.verified ? '✓ 通过' : '✗ 未通过'}
` +
          `置信度: ${result.confidence}
` +
          `详情: ${result.details}` +
          (result.counterExample ? `
反例: ${result.counterExample}` : '')
      }
    }

    case 'inequality': {
      const lhsExpr = String(params.lhs ?? '')
      const rhsExpr = String(params.rhs ?? '')
      const variables = (params.variables as string[]) ?? ['x']
      const testCount = Number(params.test_count ?? 1000)

      const lhsFn = parseExpression(lhsExpr)
      const rhsFn = parseExpression(rhsExpr)

      const result = verifyEquality(
        (env) => lhsFn(env) - rhsFn(env),
        () => 0,
        variables, 1e-6, testCount
      )

      // 检查是否 lhs >= rhs
      let allGreater = true
      for (let t = 0; t < testCount; t++) {
        const env: Record<string, number> = {}
        for (const v of variables) env[v] = (Math.random() - 0.5) * 20
        if (lhsFn(env) < rhsFn(env) - 1e-10) { allGreater = false; break }
      }

      return {
        success: true,
        data: `不等式验证: ${lhsExpr} ≥ ${rhsExpr}
` +
          `结果: ${allGreater ? '✓ 在随机测试中成立' : '✗ 发现反例'}
` +
          `置信度: ${allGreater ? 'medium' : 'high'}`
      }
    }

    case 'number_theory': {
      const predicateExpr = String(params.predicate ?? '')
      const range = (params.range as [number, number]) ?? [1, 10000]
      const fn = parseExpression(predicateExpr)

      const result = verifyNumberTheory(
        (n) => fn({ n }) !== 0,
        range
      )

      return {
        success: true,
        data: `数论命题验证: ${predicateExpr}
` +
          `范围: [${range[0]}, ${range[1]}]
` +
          `结果: ${result.verified ? '✓ 通过' : '✗ 发现反例'}
` +
          `置信度: ${result.confidence}
详情: ${result.details}` +
          (result.counterExample ? `
反例: ${result.counterExample}` : '')
      }
    }

    case 'counter_example': {
      const predicateExpr = String(params.predicate ?? '')
      const variables = (params.variables as string[]) ?? ['x']
      const fn = parseExpression(predicateExpr)

      const result = findCounterExample(
        (env) => fn(env) > 0,
        variables
      )

      return {
        success: true,
        data: `反例搜索: ${predicateExpr}
` +
          `结果: ${result.found ? `找到反例: ${result.example}` : '未找到反例（命题可能成立）'}`
      }
    }

    case 'l_function_nonzero': {
      // 专门验证 L(1,χ) ≠ 0 的工具
      const q = Number(params.q ?? 1)
      const N = Number(params.N ?? 50000)

      const chars = generateRealCharacters(q)
      const nonPrincipal = chars.filter(c => !c.isPrincipal)

      if (nonPrincipal.length === 0) {
        return { success: true, data: `q=${q} 只有主特征，L(1,χ₀) 发散，无需验证非零性` }
      }

      const results = nonPrincipal.map(chi => {
        const l1 = computeL1(chi, N)
        const lEuler = computeLEuler(chi, 1, 10000)
        return {
          index: chi.index,
          conductor: chi.conductor,
          isPrimitive: chi.isPrimitive,
          l1Abel: l1.value,
          l1Euler: lEuler.value,
          isNonzero: Math.abs(l1.value) > 0.001 && Math.abs(lEuler.value) > 0.001
        }
      })

      const allNonzero = results.every(r => r.isNonzero)
      const minAbsL = Math.min(...results.map(r => Math.min(Math.abs(r.l1Abel), Math.abs(r.l1Euler))))

      // 使用乘积论证
      const productAnalysis = analyzeProductL(1.01, q, N)

      const details = results.map(r =>
        `  χ_${r.index}: L(1,χ)≈${r.l1Abel.toFixed(6)}(Abel), ${r.l1Euler.toFixed(6)}(Euler), 导子=${r.conductor}, ${r.isPrimitive ? '本原' : '非本原'}, ${r.isNonzero ? '非零✓' : '接近零⚠'}`
      ).join('\n')

      return {
        success: true,
        data: `L(1,χ)≠0 验证 (q=${q}):
${details}

` +
          `结论: ${allNonzero ? '所有 L(1,χ) 均非零 ✓' : '存在 L(1,χ) 接近零，需进一步分析 ⚠'}
` +
          `最小 |L(1,χ)| ≈ ${minAbsL.toFixed(6)}

` +
          `乘积论证: ∏_χ L(1.01,χ) = ${productAnalysis.productValue.toFixed(6)}
` +
          `${productAnalysis.conclusion}`
      }
    }

    default:
      return { success: false, data: '', error: `未知验证操作: ${operation}。可用: equality, inequality, number_theory, counter_example, l_function_nonzero` }
  }
}
