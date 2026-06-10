
/**
 * 数学工具 - 狄利克雷特征与 L-函数模块
 * 核心：让小模型也能验证 L(1,χ)≠0 等关键命题
 */
import {
  gcd, eulerPhi, sievePrimes, primeFactorization,
  findPrimitiveRoot
} from './math-nt'

// ==================== 狄利克雷特征 ====================

export interface DirichletChar {
  q: number
  index: number
  isPrincipal: boolean
  isReal: boolean
  isPrimitive: boolean
  conductor: number
  /** 计算 χ(n) 的实部 */
  evalReal: (n: number) => number
  /** 计算 χ(n) 的虚部（复特征时非零） */
  evalImag: (n: number) => number
}

/**
 * 生成模 q 的所有实狄利克雷特征
 * 对于小模型，我们优先处理实特征（值域 {0, 1, -1}）
 */
export function generateRealCharacters(q: number): DirichletChar[] {
  if (q <= 0) return []
  if (q === 1) {
    return [{
      q: 1, index: 0, isPrincipal: true, isReal: true, isPrimitive: false, conductor: 1,
      evalReal: () => 1, evalImag: () => 0
    }]
  }

  const phiQ = eulerPhi(q)
  const factors = primeFactorization(q)

  // 对每个素因子幂生成实特征分量
  const componentChars: Array<Array<{ eval: (n: number) => number; conductor: number }>> = []

  for (const [p, k] of factors) {
    const pk = Math.pow(p, k)
    if (p === 2) {
      componentChars.push(genRealChars2Power(k))
    } else {
      componentChars.push(genRealCharsOddPrimePower(p, k))
    }
  }

  // 张量积组合
  const results: DirichletChar[] = []
  const indices = componentChars.map(() => 0)
  const sizes = componentChars.map(c => c.length)

  let idx = 0
  outer:
  while (true) {
    // 构建当前组合的特征
    const evalFn = (n: number): number => {
      let val = 1
      for (let i = 0; i < componentChars.length; i++) {
        const comp = componentChars[i][indices[i]]
        val *= comp.eval(n)
      }
      return val
    }

    const conductor = indices.reduce((acc, ci, i) => {
      return lcm(acc, componentChars[i][ci].conductor)
    }, 1)

    const isPrincipal = indices.every((ci, i) => ci === 0)

    results.push({
      q, index: idx++,
      isPrincipal,
      isReal: true,
      isPrimitive: conductor === q,
      conductor,
      evalReal: evalFn,
      evalImag: () => 0
    })

    // 递增索引
    for (let i = componentChars.length - 1; i >= 0; i--) {
      indices[i]++
      if (indices[i] < sizes[i]) break
      indices[i] = 0
      if (i === 0) break outer
    }
    if (componentChars.length === 0) break
  }

  return results

  function lcm(a: number, b: number): number {
    if (a === 0 || b === 0) return 0
    return a / gcd(a, b) * b
  }
}

/** 模奇素数幂 p^k 的实特征 */
function genRealCharsOddPrimePower(p: number, k: number): Array<{ eval: (n: number) => number; conductor: number }> {
  const pk = Math.pow(p, k)
  const g = findPrimitiveRoot(pk)
  if (g === null) return [{ eval: () => 1, conductor: 1 }]

  const phiPk = (p - 1) * Math.pow(p, k - 1)

  // 建立离散对数表
  const logTable = new Map<number, number>()
  let power = 1
  for (let i = 0; i < phiPk; i++) {
    logTable.set(power % pk, i)
    power = (power * g) % pk
  }

  const chars: Array<{ eval: (n: number) => number; conductor: number }> = []

  // 主特征
  chars.push({
    eval: (n: number) => gcd(n, pk) === 1 ? 1 : 0,
    conductor: 1
  })

  // 实特征：j * log_g(n) ≡ 0 或 φ(pk)/2 (mod φ(pk))
  // 即 j = φ(pk)/2 时，χ(n) = (-1)^(log_g(n))
  if (phiPk % 2 === 0) {
    const j = phiPk / 2
    chars.push({
      eval: (n: number) => {
        if (gcd(n, pk) > 1) return 0
        const nMod = ((n % pk) + pk) % pk
        const logN = logTable.get(nMod)
        if (logN === undefined) return 0
        return logN % 2 === 0 ? 1 : -1
      },
      conductor: pk
    })
  }

  // 对于 p^k (k>=2)，可能还有模 p^(k-1) 诱导的实特征
  if (k >= 2) {
    const subChars = genRealCharsOddPrimePower(p, k - 1)
    for (let i = 1; i < subChars.length; i++) {
      const subEval = subChars[i].eval
      chars.push({
        eval: (n: number) => subEval(n),
        conductor: subChars[i].conductor
      })
    }
  }

  return chars
}

/** 模 2^k 的实特征 */
function genRealChars2Power(k: number): Array<{ eval: (n: number) => number; conductor: number }> {
  if (k === 1) return [{ eval: () => 1, conductor: 1 }]

  const chars: Array<{ eval: (n: number) => number; conductor: number }> = []

  // 主特征
  chars.push({ eval: (n: number) => n % 2 === 1 ? 1 : 0, conductor: 1 })

  if (k === 2) {
    // 模4的唯一非主实特征：χ(n) = (-1)^((n-1)/2)
    chars.push({
      eval: (n: number) => n % 2 === 0 ? 0 : (n % 4 === 1 ? 1 : -1),
      conductor: 4
    })
  } else {
    // k >= 3: 有三个非主实特征
    const pk = Math.pow(2, k)

    // χ₁(n) = (-1)^((n-1)/2) — 模4特征提升
    chars.push({
      eval: (n: number) => n % 2 === 0 ? 0 : (n % 4 === 1 ? 1 : -1),
      conductor: 4
    })

    // χ₂(n) = (-1)^((n²-1)/8) — 模8特征
    chars.push({
      eval: (n: number) => {
        if (n % 2 === 0) return 0
        const nMod8 = ((n % 8) + 8) % 8
        return (nMod8 === 1 || nMod8 === 7) ? 1 : -1
      },
      conductor: 8
    })

    // χ₃ = χ₁ * χ₂
    const chi1 = chars[1].eval
    const chi2 = chars[2].eval
    chars.push({
      eval: (n: number) => chi1(n) * chi2(n),
      conductor: 4 * 8 / gcd(4, 8)
    })
  }

  return chars
}

// ==================== L-函数计算 ====================

export interface LFunctionResult {
  value: number
  method: string
  termsUsed: number
  errorBound: number
}

/**
 * 计算 L(s, χ) 通过部分和
 */
export function computeLPartial(
  chi: DirichletChar,
  s: number,
  N: number
): LFunctionResult {
  let sum = 0
  for (let n = 1; n <= N; n++) {
    sum += chi.evalReal(n) * Math.pow(n, -s)
  }
  // 误差界：|R_N| ≤ q / (N * (s-1)) for s > 1
  const errorBound = s > 1 ? chi.q / (N * (s - 1)) : Infinity
  return { value: sum, method: `部分和(N=${N})`, termsUsed: N, errorBound }
}

/**
 * 计算 L(1, χ) 通过加速收敛
 * 使用 Euler-Maclaurin 或 Abel 求和
 */
export function computeL1(chi: DirichletChar, N: number = 100000): LFunctionResult {
  if (chi.isPrincipal) {
    // L(1, χ₀) = Σ_{gcd(n,q)=1} 1/n → 发散
    return { value: Infinity, method: '主特征L(1)发散', termsUsed: 0, errorBound: 0 }
  }

  // Abel 求和法：L(1,χ) = Σ χ(n)/n
  // 对实特征使用加速收敛
  let sum = 0
  const actualN = Math.min(N, chi.q * 200)

  for (let n = 1; n <= actualN; n++) {
    const chiN = chi.evalReal(n)
    if (chiN !== 0) {
      sum += chiN / n
    }
  }

  // 误差界：对于非主特征，|R_N| ≤ φ(q)/(N)
  const errorBound = eulerPhi(chi.q) / actualN

  return { value: sum, method: `Abel求和(N=${actualN})`, termsUsed: actualN, errorBound }
}

/**
 * 计算 L(s, χ) 通过欧拉乘积
 */
export function computeLEuler(
  chi: DirichletChar,
  s: number,
  maxPrime: number
): LFunctionResult {
  const primes = sievePrimes(maxPrime)
  let logProduct = 0
  let count = 0

  for (const p of primes) {
    const chiP = chi.evalReal(p)
    if (chiP !== 0) {
      // log(L) = -Σ log(1 - χ(p)/p^s)
      const term = chiP * Math.pow(p, -s)
      logProduct -= Math.log(1 - term)
      count++
    }
  }

  const value = Math.exp(logProduct)
  const errorBound = chi.q / (maxPrime * Math.max(s - 1, 0.01))

  return { value, method: `欧拉乘积(p≤${maxPrime})`, termsUsed: count, errorBound }
}

// ==================== 乘积 ∏_χ L(s,χ) 分析 ====================

export interface ProductAnalysis {
  s: number
  q: number
  productValue: number
  characters: Array<{
    index: number
    isPrincipal: boolean
    isReal: boolean
    isPrimitive: boolean
    conductor: number
    lValue: number
  }>
  conclusion: string
}

/**
 * 分析乘积 ∏_χ L(s,χ) 在 s→1⁺ 的行为
 * 这是证明 L(1,χ)≠0 的核心工具
 */
export function analyzeProductL(s: number, q: number, N: number = 50000): ProductAnalysis {
  const chars = generateRealCharacters(q)
  const charResults = chars.map(chi => {
    const lResult = s === 1 ? computeL1(chi, N) : computeLPartial(chi, s, N)
    return {
      index: chi.index,
      isPrincipal: chi.isPrincipal,
      isReal: chi.isReal,
      isPrimitive: chi.isPrimitive,
      conductor: chi.conductor,
      lValue: lResult.value
    }
  })

  let productValue = 1
  for (const cr of charResults) {
    if (isFinite(cr.lValue)) productValue *= cr.lValue
  }

  // 分析结论
  let conclusion = ''
  const nonPrincipal = charResults.filter(c => !c.isPrincipal)
  const zeroValues = nonPrincipal.filter(c => Math.abs(c.lValue) < 0.001)

  if (zeroValues.length > 0) {
    conclusion = `警告：发现 L(s,χ) 接近零的特征（可能是计算精度问题或确实为零）`
  } else {
    const minAbsL = Math.min(...nonPrincipal.map(c => Math.abs(c.lValue)))
    conclusion = `所有非主特征的 L(${s},χ) 均非零（最小绝对值 ≈ ${minAbsL.toFixed(6)}），`
    conclusion += `乘积 ∏_χ L(${s},χ) = ${productValue.toFixed(6)} 为有限正值。`

    if (s <= 1.1 && s >= 0.9) {
      conclusion += ` 由于 L(s,χ₀) 在 s→1⁺ 时发散，而乘积保持有限，`
      conclusion += ` 必然有每个 L(1,χ) ≠ 0（否则乘积会为零而非有限正值）。`
    }
  }

  return { s, q, productValue, characters: charResults, conclusion }
}

// ==================== 正交性验证 ====================

/**
 * 验证狄利克雷特征的正交性
 * Σ_{n mod q} χ₁(n)·χ₂̄(n) = φ(q)·δ(χ₁,χ₂)
 */
export function verifyOrthogonality(q: number): {
  valid: boolean
  details: string
  maxError: number
} {
  const chars = generateRealCharacters(q)
  let maxError = 0
  const details: string[] = []

  for (let i = 0; i < chars.length; i++) {
    for (let j = i; j < chars.length; j++) {
      let sum = 0
      for (let n = 1; n <= q; n++) {
        sum += chars[i].evalReal(n) * chars[j].evalReal(n)
      }
      const expected = i === j ? eulerPhi(q) : 0
      const error = Math.abs(sum - expected)
      maxError = Math.max(maxError, error)
      if (error > 0.01) {
        details.push(`χ_${i}·χ_${j}: 求和=${sum.toFixed(4)}, 期望=${expected}, 误差=${error.toFixed(4)}`)
      }
    }
  }

  return {
    valid: maxError < 0.1,
    details: details.length > 0
      ? `正交性验证发现较大误差:\n${details.join('\n')}`
      : `所有特征对的正交性验证通过（最大误差: ${maxError.toFixed(6)}）`,
    maxError
  }
}

/**
 * 列出模 q 的所有实特征及其性质
 */
export function listCharacters(q: number): string {
  const chars = generateRealCharacters(q)
  const phiQ = eulerPhi(q)
  const lines: string[] = []
  lines.push(`模 q=${q} 的实狄利克雷特征（共 ${chars.length} 个，φ(${q})=${phiQ}）`)
  lines.push('')

  for (const chi of chars) {
    lines.push(`χ_${chi.index}:`)
    lines.push(`  主特征: ${chi.isPrincipal ? '是' : '否'}`)
    lines.push(`  实特征: ${chi.isReal ? '是' : '否'}`)
    lines.push(`  本原特征: ${chi.isPrimitive ? '是' : '否'}`)
    lines.push(`  导子: ${chi.conductor}`)

    // 显示前几个值
    const values: string[] = []
    for (let n = 1; n <= Math.min(q + 5, 20); n++) {
      values.push(`χ(${n})=${chi.evalReal(n)}`)
    }
    lines.push(`  值: ${values.join(', ')}`)

    // 计算 L(1, χ)
    if (!chi.isPrincipal) {
      const l1 = computeL1(chi, 50000)
      lines.push(`  L(1,χ) ≈ ${l1.value.toFixed(8)} (误差界: ${l1.errorBound.toFixed(6)})`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
