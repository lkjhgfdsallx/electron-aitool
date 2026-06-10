
/**
 * 数学工具 - 分析、代数、几何模块
 * 提供极限、级数、矩阵运算、几何计算等
 */

// ==================== 数学分析 ====================

/** 数值极限计算 */
export function computeLimit(
  fn: (x: number) => number,
  approach: number,
  direction: 'both' | 'left' | 'right' = 'both',
  precision: number = 1e-10
): { value: number; converged: boolean; details: string } {
  const deltas = [1e-2, 1e-4, 1e-6, 1e-8, 1e-10, 1e-12]
  const values: number[] = []

  for (const d of deltas) {
    if (direction === 'both' || direction === 'right') {
      values.push(fn(approach + d))
    }
    if (direction === 'both' || direction === 'left') {
      values.push(fn(approach - d))
    }
  }

  if (values.some(v => !isFinite(v))) {
    return { value: NaN, converged: false, details: '函数在某点返回无穷或NaN' }
  }

  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const maxDev = Math.max(...values.map(v => Math.abs(v - avg)))

  if (maxDev < precision) {
    return { value: avg, converged: true, details: `收敛至 ${avg}，最大偏差 ${maxDev.toExponential(2)}` }
  }

  // 检查是否趋向无穷
  if (values.every(v => v > 1e6) && values.every((v, i) => i === 0 || v > values[i - 1])) {
    return { value: Infinity, converged: true, details: '趋向 +∞' }
  }
  if (values.every(v => v < -1e6) && values.every((v, i) => i === 0 || v < values[i - 1])) {
    return { value: -Infinity, converged: true, details: '趋向 -∞' }
  }

  return { value: avg, converged: false, details: `未收敛，值在 ${Math.min(...values)} ~ ${Math.max(...values)} 间波动` }
}

/** 级数求和（部分和 + 收敛判断） */
export function computeSeries(
  termFn: (n: number) => number,
  N: number = 10000
): { partialSum: number; converged: boolean; method: string; details: string } {
  let sum = 0
  const checkpoints: number[] = []
  const checkN = [100, 500, 1000, 5000, N]

  for (let n = 1; n <= N; n++) {
    sum += termFn(n)
    if (checkN.includes(n)) checkpoints.push(sum)
  }

  // 检查收敛性：最后几个检查点的变化率
  const last3 = checkpoints.slice(-3)
  if (last3.length >= 2) {
    const diff1 = Math.abs(last3[1] - last3[0])
    const diff2 = Math.abs(last3[2] - last3[1])
    const ratio = diff1 > 0 ? diff2 / diff1 : 0

    if (diff2 < 1e-6) {
      return {
        partialSum: sum, converged: true,
        method: `部分和(N=${N})`,
        details: `级数收敛，最后变化量 ${diff2.toExponential(2)}`
      }
    }
    if (ratio < 0.5) {
      return {
        partialSum: sum, converged: true,
        method: `部分和(N=${N})，几何收敛`,
        details: `级数以比率 ~${ratio.toFixed(4)} 收敛`
      }
    }
  }

  return {
    partialSum: sum, converged: false,
    method: `部分和(N=${N})`,
    details: '无法确定收敛性，可能发散或收敛极慢'
  }
}

/** 数值微分 */
export function numericalDerivative(
  fn: (x: number) => number,
  x0: number,
  order: number = 1,
  h: number = 1e-7
): number {
  if (order === 1) {
    return (fn(x0 + h) - fn(x0 - h)) / (2 * h)
  }
  if (order === 2) {
    return (fn(x0 + h) - 2 * fn(x0) + fn(x0 - h)) / (h * h)
  }
  // 高阶：递归
  return (numericalDerivative(fn, x0 + h, order - 1) - numericalDerivative(fn, x0 - h, order - 1)) / (2 * h)
}

/** 数值积分（Simpson 法则） */
export function numericalIntegrate(
  fn: (x: number) => number,
  a: number,
  b: number,
  n: number = 10000
): { value: number; method: string } {
  if (n % 2 !== 0) n++
  const h = (b - a) / n
  let sum = fn(a) + fn(b)
  for (let i = 1; i < n; i++) {
    const x = a + i * h
    sum += (i % 2 === 0 ? 2 : 4) * fn(x)
  }
  return { value: sum * h / 3, method: `Simpson(${n}段)` }
}

/** Taylor 展开 */
export function taylorExpand(
  fn: (x: number) => number,
  x0: number,
  order: number = 6
): { coefficients: number[]; expression: string } {
  const coeffs: number[] = []
  let fnAtPoint = fn

  for (let k = 0; k <= order; k++) {
    const deriv = k === 0 ? fnAtPoint(x0) : numericalDerivative(fn, x0, k)
    coeffs.push(deriv / factorial(k))
  }

  const terms = coeffs.map((c, k) => {
    if (Math.abs(c) < 1e-12) return ''
    const sign = c >= 0 ? '+' : '-'
    const absC = Math.abs(c)
    if (k === 0) return `${c.toFixed(6)}`
    if (k === 1) return `${sign} ${absC.toFixed(6)}(x${x0 === 0 ? '' : ` - ${x0}`})`
    return `${sign} ${absC.toFixed(6)}(x${x0 === 0 ? '' : ` - ${x0}`})^${k}/${k}!`
  }).filter(Boolean).join(' ')

  return { coefficients: coeffs, expression: `f(x) ≈ ${terms}` }
}

function factorial(n: number): number {
  if (n <= 1) return 1
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

// ==================== 线性代数 ====================

/** 矩阵运算 */
export class Matrix {
  readonly rows: number
  readonly cols: number
  readonly data: number[][]

  constructor(data: number[][]) {
    this.rows = data.length
    this.cols = data[0]?.length ?? 0
    this.data = data.map(row => [...row])
  }

  static identity(n: number): Matrix {
    const data = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => i === j ? 1 : 0)
    )
    return new Matrix(data)
  }

  static zeros(m: number, n: number): Matrix {
    return new Matrix(Array.from({ length: m }, () => new Array(n).fill(0)))
  }

  add(other: Matrix): Matrix {
    return new Matrix(this.data.map((row, i) =>
      row.map((v, j) => v + other.data[i][j])
    ))
  }

  mul(other: Matrix): Matrix {
    const result = Matrix.zeros(this.rows, other.cols)
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < other.cols; j++) {
        let sum = 0
        for (let k = 0; k < this.cols; k++) {
          sum += this.data[i][k] * other.data[k][j]
        }
        result.data[i][j] = sum
      }
    }
    return result
  }

  scale(s: number): Matrix {
    return new Matrix(this.data.map(row => row.map(v => v * s)))
  }

  transpose(): Matrix {
    const result = Matrix.zeros(this.cols, this.rows)
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[j][i] = this.data[i][j]
      }
    }
    return result
  }

  trace(): number {
    let sum = 0
    for (let i = 0; i < Math.min(this.rows, this.cols); i++) sum += this.data[i][i]
    return sum
  }

  /** 行列式（Laplace 展开 + LU 分解优化） */
  determinant(): number {
    if (this.rows !== this.cols) return NaN
    const n = this.rows
    if (n === 1) return this.data[0][0]
    if (n === 2) return this.data[0][0] * this.data[1][1] - this.data[0][1] * this.data[1][0]

    // LU 分解
    const lu = this.data.map(row => [...row])
    let det = 1
    let swaps = 0

    for (let k = 0; k < n; k++) {
      // 选主元
      let maxVal = Math.abs(lu[k][k])
      let maxRow = k
      for (let i = k + 1; i < n; i++) {
        if (Math.abs(lu[i][k]) > maxVal) {
          maxVal = Math.abs(lu[i][k])
          maxRow = i
        }
      }
      if (maxVal < 1e-14) return 0

      if (maxRow !== k) {
        ;[lu[k], lu[maxRow]] = [lu[maxRow], lu[k]]
        swaps++
      }

      det *= lu[k][k]

      for (let i = k + 1; i < n; i++) {
        lu[i][k] /= lu[k][k]
        for (let j = k + 1; j < n; j++) {
          lu[i][j] -= lu[i][k] * lu[k][j]
        }
      }
    }

    return swaps % 2 === 0 ? det : -det
  }

  /** 特征值（QR 算法） */
  eigenvalues(maxIter: number = 100): number[] {
    if (this.rows !== this.cols) return []
    const n = this.rows
    let A = this.data.map(row => [...row])

    for (let iter = 0; iter < maxIter; iter++) {
      // QR 分解 (Householder)
      const { Q, R } = qrDecomposition(A)
      // A = RQ
      A = matMul(R, Q)

      // 检查是否收敛为上三角
      let offDiag = 0
      for (let i = 1; i < n; i++) {
        for (let j = 0; j < i; j++) {
          offDiag += A[i][j] * A[i][j]
        }
      }
      if (offDiag < 1e-20) break
    }

    return A.map((row, i) => row[i])
  }

  /** 逆矩阵 */
  inverse(): Matrix | null {
    if (this.rows !== this.cols) return null
    const n = this.rows
    const aug = this.data.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)])

    for (let k = 0; k < n; k++) {
      let maxRow = k
      for (let i = k + 1; i < n; i++) {
        if (Math.abs(aug[i][k]) > Math.abs(aug[maxRow][k])) maxRow = i
      }
      ;[aug[k], aug[maxRow]] = [aug[maxRow], aug[k]]

      if (Math.abs(aug[k][k]) < 1e-14) return null

      const pivot = aug[k][k]
      for (let j = 0; j < 2 * n; j++) aug[k][j] /= pivot

      for (let i = 0; i < n; i++) {
        if (i === k) continue
        const factor = aug[i][k]
        for (let j = 0; j < 2 * n; j++) aug[i][j] -= factor * aug[k][j]
      }
    }

    return new Matrix(aug.map(row => row.slice(n)))
  }

  toString(): string {
    return this.data.map(row => row.map(v => v.toFixed(4).padStart(10)).join(' ')).join('\n')
  }
}

function qrDecomposition(A: number[][]): { Q: number[][]; R: number[][] } {
  const m = A.length, n = A[0].length
  const Q: number[][] = Array.from({ length: m }, () => new Array(n).fill(0))
  const R: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))

  const cols: number[][] = A[0].map((_, j) => A.map(row => row[j]))

  const orthoCols: number[][] = []

  for (let j = 0; j < n; j++) {
    let v = [...cols[j]]
    for (let i = 0; i < j; i++) {
      const dot = v.reduce((s, vi, k) => s + vi * orthoCols[i][k], 0)
      R[i][j] = dot
      v = v.map((vi, k) => vi - dot * orthoCols[i][k])
    }
    const norm = Math.sqrt(v.reduce((s, vi) => s + vi * vi, 0))
    R[j][j] = norm
    orthoCols.push(norm > 1e-14 ? v.map(vi => vi / norm) : v.map(() => 0))
  }

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      Q[i][j] = orthoCols[j][i]
    }
  }

  return { Q, R }
}

function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length, n = B[0].length, p = B.length
  return Array.from({ length: m }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      let s = 0
      for (let k = 0; k < p; k++) s += A[i][k] * B[k][j]
      return s
    })
  )
}

// ==================== 几何计算 ====================

/** 几何度量计算 */
export const geometry = {
  /** 两点距离 */
  distance(p1: number[], p2: number[]): number {
    return Math.sqrt(p1.reduce((s, v, i) => s + (v - p2[i]) ** 2, 0))
  },

  /** 三角形面积（Heron 公式） */
  triangleArea(a: number, b: number, c: number): number {
    const s = (a + b + c) / 2
    return Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)))
  },

  /** 多边形面积（Shoelace 公式） */
  polygonArea(vertices: Array<[number, number]>): number {
    let area = 0
    const n = vertices.length
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      area += vertices[i][0] * vertices[j][1]
      area -= vertices[j][0] * vertices[i][1]
    }
    return Math.abs(area) / 2
  },

  /** 球面距离（Haversine） */
  haversine(lat1: number, lon1: number, lat2: number, lon2: number, R: number = 6371): number {
    const toRad = (d: number) => d * Math.PI / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(a))
  },

  /** 曲率（数值计算） */
  curvature(fn: (x: number) => number, x: number, h: number = 1e-5): number {
    const fp = (fn(x + h) - fn(x - h)) / (2 * h)
    const fpp = (fn(x + h) - 2 * fn(x) + fn(x - h)) / (h * h)
    return Math.abs(fpp) / Math.pow(1 + fp * fp, 1.5)
  },

  /** Euler 示性数（多面体） */
  eulerCharacteristic(vertices: number, edges: number, faces: number): number {
    return vertices - edges + faces
  },

  /** 向量叉积（3D） */
  cross(a: number[], b: number[]): number[] {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ]
  },

  /** 向量点积 */
  dot(a: number[], b: number[]): number {
    return a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0)
  }
}
