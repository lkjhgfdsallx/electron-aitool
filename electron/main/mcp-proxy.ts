import { ipcMain } from 'electron'

interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

interface MCPServerConfig {
  id: string
  name: string
  url: string
}

/**
 * 设置 MCP（Model Context Protocol）相关的 IPC 处理器
 * MCP 调用需要通过主进程代理，以避免浏览器 CORS 限制
 */
export function setupMCPHandlers(): void {
  // 从 MCP 服务器获取工具列表
  ipcMain.handle('mcp:fetchTools', async (_event, serverUrl: string) => {
    try {
      const response = await fetch(`${serverUrl}/tools`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`MCP server responded with ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return { success: true, data: data as MCPTool[] }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // 调用 MCP 服务器上的工具
  ipcMain.handle(
    'mcp:callTool',
    async (_event, serverUrl: string, toolName: string, args: Record<string, unknown>) => {
      try {
        const response = await fetch(`${serverUrl}/tools/${toolName}/call`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ arguments: args })
        })

        if (!response.ok) {
          throw new Error(`MCP tool call failed with ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        return { success: true, data }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: message }
      }
    }
  )
}
