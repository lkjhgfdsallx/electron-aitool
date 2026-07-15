import { ipcMain } from 'electron'
import { ChildProcess, spawn } from 'child_process'

// ==================== 类型定义 ====================

interface MCPServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  alwaysAllow?: string[]
}

interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

interface JSONRPCRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface JSONRPCResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

// ==================== MCP 服务器进程管理 ====================

class MCPServerProcess {
  private process: ChildProcess | null = null
  private requestId = 0
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >()
  private buffer = ''
  private initialized = false
  private config: MCPServerConfig
  /** 收集 stderr 输出，用于错误报告 */
  private stderrOutput = ''
  /** 启动期间的 reject 回调，用于进程提前退出时通知 start() */
  private startupReject: ((reason: Error) => void) | null = null

  constructor(config: MCPServerConfig) {
    this.config = config
  }

  /** 启动 MCP 服务器子进程 */
  async start(): Promise<void> {
    if (this.process) return

    return new Promise<void>((resolve, reject) => {
      const env = { ...process.env, ...this.config.env }
      this.startupReject = reject
      this.stderrOutput = ''

      try {
        this.process = spawn(this.config.command, this.config.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true,
          env
        })
      } catch (err) {
        this.startupReject = null
        reject(new Error(`启动 MCP 服务器失败: ${err instanceof Error ? err.message : String(err)}`))
        return
      }

      this.process.stdout?.on('data', (data: Buffer) => {
        this.buffer += data.toString()
        this.processBuffer()
      })

      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString()
        this.stderrOutput += text
        console.error(`[MCP:${this.config.name}] stderr:`, text)
      })

      this.process.on('error', (err) => {
        console.error(`[MCP:${this.config.name}] 进程错误:`, err)
        const errorMsg = `MCP 服务器 "${this.config.name}" 启动失败: ${err.message}`
        if (this.startupReject) {
          this.startupReject(new Error(errorMsg))
          this.startupReject = null
        }
        this.cleanup()
      })

      this.process.on('exit', (code, signal) => {
        const exitInfo = signal
          ? `被信号 ${signal} 终止`
          : `退出码 ${code}`
        console.log(`[MCP:${this.config.name}] 进程 ${exitInfo}`)

        // 构建详细的错误信息
        let errorMsg = `MCP 服务器 "${this.config.name}" 已退出 (${exitInfo})`
        if (this.stderrOutput.trim()) {
          // 取 stderr 最后几行作为错误上下文
          const stderrLines = this.stderrOutput.trim().split('\n')
          const lastLines = stderrLines.slice(-5).join('\n')
          errorMsg += `\n\n服务器输出:\n${lastLines}`
        }
        if (code === 127 || code === 9009) {
          errorMsg += '\n\n提示: 命令未找到，请确认已安装 Node.js 和 npm/npx'
        }
        if (code === 1 && this.stderrOutput.includes('EACCES')) {
          errorMsg += '\n\n提示: 权限不足，请检查文件权限'
        }

        // 如果还在启动阶段（start() 的 Promise 尚未 resolve），直接 reject
        if (this.startupReject) {
          this.startupReject(new Error(errorMsg))
          this.startupReject = null
        }
        this.cleanup()
      })

      // 等待进程启动后执行 initialize
      // 使用更短的初始延迟，然后重试几次
      const tryInitialize = async (attempt: number): Promise<void> => {
        // 如果进程已退出，不再尝试
        if (!this.process || this.process.killed) return

        try {
          await this.initialize()
          // 启动成功，清除 startupReject
          this.startupReject = null
          resolve()
        } catch (err) {
          if (attempt < 3 && this.process && !this.process.killed) {
            // 重试，增加延迟
            setTimeout(() => tryInitialize(attempt + 1), 1000 * (attempt + 1))
          } else {
            const message = err instanceof Error ? err.message : String(err)
            if (this.startupReject) {
              this.startupReject(new Error(`MCP 服务器 "${this.config.name}" 初始化失败: ${message}`))
              this.startupReject = null
            }
          }
        }
      }

      // 初始延迟 800ms 等待进程启动
      setTimeout(() => tryInitialize(0), 800)
    })
  }

  /** 处理 stdout 数据缓冲区，解析 JSON-RPC 消息 */
  private processBuffer(): void {
    // MCP 使用换行分隔的 JSON-RPC 消息
    const lines = this.buffer.split('\n')
    // 最后一个可能不完整，保留在 buffer 中
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const msg = JSON.parse(trimmed) as JSONRPCResponse
        const pending = this.pendingRequests.get(msg.id)
        if (pending) {
          this.pendingRequests.delete(msg.id)
          if (msg.error) {
            pending.reject(new Error(msg.error.message))
          } else {
            pending.resolve(msg.result)
          }
        }
      } catch {
        // 忽略非 JSON 行（某些 MCP 服务器可能输出额外信息）
      }
    }
  }

  /** 发送 JSON-RPC 请求并等待响应 */
  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error(`MCP 服务器 "${this.config.name}" 进程未启动或已退出`))
        return
      }

      const id = ++this.requestId
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params
      }

      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`MCP 请求超时 (${method}): 服务器 "${this.config.name}" 30秒内未响应`))
      }, 30000)

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
        reject: (err) => {
          clearTimeout(timeout)
          reject(err)
        }
      })

      const message = JSON.stringify(request) + '\n'
      this.process.stdin.write(message)
    })
  }

  /** 初始化 MCP 连接 */
  private async initialize(): Promise<void> {
    if (this.initialized) return

    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'LocalForge', version: '1.0.0' }
    })
    console.log(`[MCP:${this.config.name}] 初始化成功:`, result)

    // 发送 initialized 通知（无 id，不需要响应）
    if (this.process?.stdin) {
      const notification = JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      }) + '\n'
      this.process.stdin.write(notification)
    }

    this.initialized = true
  }

  /** 获取工具列表 */
  async listTools(): Promise<MCPTool[]> {
    if (!this.process) await this.start()
    const result = (await this.sendRequest('tools/list')) as { tools: MCPTool[] }
    return result.tools ?? []
  }

  /** 调用工具 */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.process) await this.start()
    return await this.sendRequest('tools/call', { name: toolName, arguments: args })
  }

  /** 清理资源 */
  private cleanup(): void {
    this.process = null
    this.initialized = false
    this.buffer = ''
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error(`MCP 服务器 "${this.config.name}" 进程已退出`))
    }
    this.pendingRequests.clear()
  }

  /** 关闭服务器进程 */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill()
      this.cleanup()
    }
  }

  /** 检查进程是否存活 */
  get alive(): boolean {
    return this.process !== null && !this.process.killed
  }
}

// ==================== 服务器实例管理 ====================

const serverInstances = new Map<string, MCPServerProcess>()

function getOrCreateServer(config: MCPServerConfig): MCPServerProcess {
  let server = serverInstances.get(config.id)
  if (!server || !server.alive) {
    server = new MCPServerProcess(config)
    serverInstances.set(config.id, server)
  }
  return server
}

// ==================== IPC 处理器 ====================

/**
 * 设置 MCP（Model Context Protocol）相关的 IPC 处理器
 * 通过子进程 stdio 与 MCP 服务器通信（JSON-RPC 2.0）
 */
export function setupMCPHandlers(): void {
  // 从 MCP 服务器获取工具列表
  ipcMain.handle('mcp:fetchTools', async (_event, serverConfig: MCPServerConfig) => {
    try {
      const server = getOrCreateServer(serverConfig)
      const tools = await server.listTools()
      return { success: true, data: tools }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[MCP:${serverConfig.name}] fetchTools 失败:`, message)
      return { success: false, error: message }
    }
  })

  // 调用 MCP 服务器上的工具
  ipcMain.handle(
    'mcp:callTool',
    async (
      _event,
      serverId: string,
      toolName: string,
      args: Record<string, unknown>
    ) => {
      const server = serverInstances.get(serverId)
      if (!server) {
        return { success: false, error: `MCP 服务器 ${serverId} 未找到，请先获取工具列表` }
      }

      try {
        const result = await server.callTool(toolName, args)
        return { success: true, data: result }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[MCP] callTool ${toolName} 失败:`, message)
        return { success: false, error: message }
      }
    }
  )

  // 关闭 MCP 服务器
  ipcMain.handle('mcp:stopServer', async (_event, serverId: string) => {
    const server = serverInstances.get(serverId)
    if (server) {
      await server.stop()
      serverInstances.delete(serverId)
    }
    return { success: true }
  })
}
