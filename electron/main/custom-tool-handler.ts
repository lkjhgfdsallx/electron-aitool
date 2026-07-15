import { ipcMain } from 'electron'
import vm from 'vm'
import https from 'https'
import http from 'http'

/**
 * 自定义工具沙箱执行器
 *
 * 在 Electron 主进程中使用 Node.js vm 模块创建隔离沙箱，
 * 安全执行用户自定义的 JS 函数。
 *
 * 安全措施：
 * - 使用 vm.createContext() 创建隔离上下文
 * - 仅暴露安全的全局对象
 * - 超时保护（默认 5 秒，最大 30 秒）
 * - 返回值自动 JSON.stringify
 */

const DEFAULT_TIMEOUT = 5000
const MAX_TIMEOUT = 30000

/** 沙箱中可用的安全全局对象 */
function createSandbox(args: Record<string, unknown>, timeout: number): Record<string, unknown> {
  // 受限的 console
  const sandboxConsole = {
    log: (...msg: unknown[]) => console.log('[CustomTool]', ...msg),
    warn: (...msg: unknown[]) => console.warn('[CustomTool]', ...msg),
    error: (...msg: unknown[]) => console.error('[CustomTool]', ...msg),
    info: (...msg: unknown[]) => console.info('[CustomTool]', ...msg)
  }

  // 安全的 fetch 代理（限制协议为 http/https）
  const safeFetch = async (url: string, init?: RequestInit): Promise<unknown> => {
    const parsedUrl = new URL(typeof url === 'string' ? url : String(url))
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error(`不允许的协议: ${parsedUrl.protocol}，仅支持 http/https`)
    }

    return new Promise((resolve, reject) => {
      const mod = parsedUrl.protocol === 'https:' ? https : http
      const method = init?.method || 'GET'
      const headers: Record<string, string> = {
        'User-Agent': 'LocalForge-custom-tool/1.0'
      }
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => { headers[k] = v })
        } else if (Array.isArray(init.headers)) {
          init.headers.forEach(([k, v]) => { headers[k] = v })
        } else {
          Object.assign(headers, init.headers)
        }
      }

      const req = mod.request(parsedUrl, { method, headers }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8')
          resolve({
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: Object.fromEntries(
              Object.entries(res.headers).map(([k, v]) => [k, String(v)])
            ),
            text: () => Promise.resolve(body),
            json: () => Promise.resolve(JSON.parse(body))
          })
        })
        res.on('error', reject)
      })

      req.on('error', reject)
      req.setTimeout(timeout - 500, () => {
        req.destroy(new Error('fetch 请求超时'))
      })

      if (init?.body) {
        req.write(typeof init.body === 'string' ? init.body : JSON.stringify(init.body))
      }
      req.end()
    })
  }

  return {
    params: args,
    console: sandboxConsole,
    fetch: safeFetch,
    JSON,
    Math,
    Date,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    Promise,
    Error,
    TypeError,
    RangeError,
    SyntaxError
  }
}

/**
 * 在沙箱中执行用户自定义 JS 函数
 *
 * @param code JS 函数体，必须是 async (params) => { ... } 或 (params) => { ... } 格式
 * @param args 传入的参数对象
 * @param timeoutMs 超时时间（毫秒）
 * @returns 执行结果
 */
async function executeInSandbox(
  code: string,
  args: Record<string, unknown>,
  timeoutMs: number
): Promise<{ success: boolean; data?: string; error?: string; durationMs: number }> {
  const timeout = Math.min(Math.max(timeoutMs || DEFAULT_TIMEOUT, 100), MAX_TIMEOUT)
  const startTime = Date.now()

  try {
    const sandbox = createSandbox(args, timeout)
    const context = vm.createContext(sandbox)

    // 将用户代码包装成可执行的函数调用
    // 用户代码格式: async (params) => { ... } 或 (params) => { ... }
    const wrappedCode = `
      (async () => {
        const __userFn = ${code};
        if (typeof __userFn !== 'function') {
          throw new Error('代码必须是一个函数，例如: async (params) => { ... }');
        }
        const __result = await __userFn(params);
        return __result;
      })()
    `

    const script = new vm.Script(wrappedCode, {
      filename: 'custom-tool.js'
    })

    const result = await script.runInContext(context, {
      timeout,
      displayErrors: true
    })

    const durationMs = Date.now() - startTime

    // 序列化结果
    let data: string
    if (result === undefined || result === null) {
      data = 'null'
    } else if (typeof result === 'string') {
      data = result
    } else {
      data = JSON.stringify(result, null, 2)
    }

    return { success: true, data, durationMs }
  } catch (error) {
    const durationMs = Date.now() - startTime
    let errorMessage: string

    if (error instanceof Error) {
      if (error.message.includes('Script execution timed out')) {
        errorMessage = `执行超时（${timeout}ms 限制）`
      } else {
        errorMessage = error.message
      }
    } else {
      errorMessage = String(error)
    }

    return { success: false, error: errorMessage, durationMs }
  }
}

/**
 * 注册自定义工具 IPC 处理器
 */
export function setupCustomToolHandlers(): void {
  ipcMain.handle(
    'custom-tool:execute',
    async (
      _event,
      code: string,
      args: Record<string, unknown>,
      timeout?: number
    ) => {
      return executeInSandbox(code, args, timeout || DEFAULT_TIMEOUT)
    }
  )
}
