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

  constructor(config: MCPServerConfig) {
    this.config = config
  }

  /** 启动 MCP 服务器子进程 */
  async start(): Promise<void> {
    if (this.process) return

    return new Promise((resolve, reject) => {
      const env = { ...process.env, ...this.config.env }

      this.process = spawn(this.config.command, this.config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        env
      })

      this.process.stdout?.on('data', (data: Buffer) => {
        this.buffer += data.toString()
        this.processBuffer()
      })

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error(`[MCP:${this.config.name}] stderr:`, data.toString())
      })

      this.process.on('error', (err) => {
        console.error(`[MCP:${this.config.name}] 进程错误:`, err)
        this.cleanup()
        reject(err)
      })

      this.process.on('exit', (code) => {
        console.log(`[MCP:${this.config.name}] 进程退出，code=${code}`)
        this.cleanup()
      })

      // 等待进程启动后执行 initialize
      setTimeout(async () => {
        try {
          await this.initialize()
          resolve()
        } catch (err) {
          reject(err)
        }
      }, 500)
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
        reject(new Error('MCP 服务器进程未启动'))
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
        reject(new Error(`MCP 请求超时: ${method}`))
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
      clientInfo: { name: 'electron-aitool', version: '1.0.0' }
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
      pending.reject(new Error('MCP 服务器进程已退出'))
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
