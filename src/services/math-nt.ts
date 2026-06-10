
/**
 * 数学工具 - 数论基础模块
 * 提供素数、模运算、欧拉函数、莫比乌斯函数等数论计算
 */

/** 最大公约数 */
export function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b)
  while (b > 0) { [a, b] = [b, a % b] }
  return a
}

/** 最小公倍数 */
export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return Math.abs(a) / gcd(a, b) * Math.abs(b)
}

/** Euler 函数 φ(n) */
export function eulerPhi(n: number): number {
  if (n <= 0) return 0
  let result = n, temp = n
  for (let i = 2; i * i <= temp; i++) {
    if (temp % i === 0) {
      while (temp % i === 0) temp /= i
      result = result / i * (i - 1)
    }
  }
  if (temp > 1) result = result / temp * (temp - 1)
  return result
}

/** Möbius 函数 μ(n) */
export function mobius(n: number): number {
  if (n <= 0) return 0
  if (n === 1) return 1
  let count = 0, temp = n
  for (let i = 2; i * i <= temp; i++) {
    if (temp % i === 0) {
      if (temp % (i * i) === 0) return 0
      count++
      while (temp % i === 0) temp /= i
    }
  }
  if (temp > 1) count++
  return count % 2 === 0 ? 1 : -1
}

/** 素数筛法，返回不超过 n 的所有素数 */
export function sievePrimes(n: number): number[] {
  if (n < 2) return []
  const sieve = new Uint8Array(n + 1)
  const primes: number[] = []
  for (let i = 2; i <= n; i++) {
    if (!sieve[i]) {
      primes.push(i)
      for (let j = i * i; j <= n; j += i) sieve[j] = 1
    }
  }
  return primes
}

/** 素性测试 (Miller-Rabin) */
export function isPrime(n: number): boolean {
  if (n < 2) return false
  if (n === 2 || n === 3) return true
  if (n % 2 === 0) return false
  const smallPrimes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]
  for (const p of smallPrimes) {
    if (n === p) return true
    if (n % p === 0) return false
  }
  let d = n - 1, r = 0
  while (d % 2 === 0) { d /= 2; r++ }
  for (const a of smallPrimes) {
    if (a >= n) continue
    let x = modPow(a, d, n)
    if (x === 1 || x === n - 1) continue
    let composite = true
    for (let j = 0; j < r - 1; j++) {
      x = (x * x) % n
      if (x === n - 1) { composite = false; break }
    }
    if (composite) return false
  }
  return true
}

/** 模幂 a^b mod m */
export function modPow(base: number, exp: number, mod: number): number {
  if (mod === 1) return 0
  let result = 1
  base = ((base % mod) + mod) % mod
  while (exp > 0) {
    if (exp & 1) result = (result * base) % mod
    exp >>= 1
    base = (base * base) % mod
  }
  return result
}

/** 模逆元 a^(-1) mod m */
export function modInverse(a: number, m: number): number | null {
  if (gcd(a, m) !== 1) return null
  let [oldR, r] = [a, m]
  let [oldS, s] = [1, 0]
  while (r !== 0) {
    const q = Math.floor(oldR / r)
    ;[oldR, r] = [r, oldR - q * r]
    ;[oldS, s] = [s, oldS - q * s]
  }
  return ((oldS % m) + m) % m
}

/** 素因子分解 */
export function primeFactorization(n: number): Array<[number, number]> {
  const factors: Array<[number, number]> = []
  let temp = Math.abs(n)
  for (let i = 2; i * i <= temp; i++) {
    if (temp % i === 0) {
      let k = 0
      while (temp % i === 0) { temp /= i; k++ }
      factors.push([i, k])
    }
  }
  if (temp > 1) factors.push([temp, 1])
  return factors
}

/** 寻找原根 */
export function findPrimitiveRoot(n: number): number | null {
  if (n === 1) return 1
  if (n === 2) return 1
  if (n === 4) return 3
  const factors = primeFactorization(n)
  if (factors.length === 1 && factors[0][0] === 2) return null // 2^k, k>=3 无原根
  if (factors.length === 1) {
    const p = factors[0][0], k = factors[0][1]
    if (k === 1) return findPrimitiveRootPrime(p)
    const pk = Math.pow(p, k)
    const g = findPrimitiveRootPrime(p)
    if (modPow(g, p - 1, pk) !== 1) return g
    return g + p
  }
  if (factors.length === 2 && factors[0][0] === 2 && factors[0][1] === 1) {
    const p = factors[1][0]
    const g = findPrimitiveRootPrime(p)
    return g % 2 === 1 ? g : g + p
  }
  return null
}

function findPrimitiveRootPrime(p: number): number {
  const phi = p - 1
  const primeFactors = primeFactorization(phi)
  for (let g = 2; g < p; g++) {
    let isRoot = true
    for (const [q] of primeFactors) {
      if (modPow(g, phi / q, p) === 1) { isRoot = false; break }
    }
    if (isRoot) return g
  }
  return 2
}

/** 中国剩余定理 */
export function crt(remainders: number[], moduli: number[]): number | null {
  if (remainders.length !== moduli.length) return null
  let M = 1
  for (const m of moduli) M *= m
  let x = 0
  for (let i = 0; i < remainders.length; i++) {
    const Mi = M / moduli[i]
    const yi = modInverse(Mi, moduli[i])
    if (yi === null) return null
    x += remainders[i] * Mi * yi
  }
  return ((x % M) + M) % M
}

/** Legendre 符号 (a/p) */
export function legendreSymbol(a: number, p: number): number {
  if (p <= 0 || !isPrime(p)) return NaN
  a = ((a % p) + p) % p
  if (a === 0) return 0
  if (a === 1) return 1
  if (a === p - 1) return p % 4 === 1 ? 1 : -1
  return modPow(a, (p - 1) / 2, p) === 1 ? 1 : -1
}

/** Jacobi 符号 (a/n) */
export function jacobiSymbol(a: number, n: number): number {
  if (n <= 0 || n % 2 === 0) return NaN
  a = ((a % n) + n) % n
  let result = 1
  while (a !== 0) {
    while (a % 2 === 0) {
      a /= 2
      if (n % 8 === 3 || n % 8 === 5) result = -result
    }
    ;[a, n] = [n, a]
    if (a % 4 === 3 && n % 4 === 3) result = -result
    a %= n
  }
  return n === 1 ? result : 0
}
