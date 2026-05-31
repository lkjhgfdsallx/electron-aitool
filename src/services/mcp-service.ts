import type { MCPServerConfig, Tool, ToolExecuteResult } from '../types'

/**
 * MCP（Model Context Protocol）服务
 * 通过 Electron 主进程代理与 MCP 服务器通信
 */
export const mcpService = {
  /**
   * 从 MCP 服务器获取工具列表
   */
  async fetchTools(serverConfig: MCPServerConfig): Promise<Tool[]> {
    const api = window.electronAPI
    if (!api) {
      throw new Error('Electron API 不可用')
    }

    const result = await api.mcp.fetchTools(serverConfig.url)

    if (!result.success || !result.data) {
      throw new Error(result.error ?? '获取 MCP 工具列表失败')
    }

    return (result.data as Array<Record<string, unknown>>).map(
      (item) =>
        ({
          id: `${serverConfig.id}:${String(item.name ?? '')}`,
          name: String(item.name ?? ''),
          description: String(item.description ?? ''),
          parameters: (item.inputSchema as Record<string, unknown>) ?? {},
          isBuiltIn: false,
          isMCP: true,
          mcpServerId: serverConfig.id,
          enabled: true
        }) as Tool
    )
  },

  /**
   * 调用 MCP 服务器上的工具
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolExecuteResult> {
    const api = window.electronAPI
    if (!api) {
      return { success: false, data: '', error: 'Electron API 不可用' }
    }

    const result = await api.mcp.callTool(serverId, toolName, args)

    if (!result.success) {
      return { success: false, data: '', error: result.error ?? 'MCP 工具调用失败' }
    }

    return {
      success: true,
      data: typeof result.data === 'string' ? result.data : JSON.stringify(result.data)
    }
  },

  /**
   * 批量获取多个 MCP 服务器的工具列表
   */
  async fetchAllTools(servers: MCPServerConfig[]): Promise<Tool[]> {
    const enabledServers = servers.filter((s) => s.enabled)
    const results = await Promise.allSettled(
      enabledServers.map((s) => this.fetchTools(s))
    )

    const tools: Tool[] = []
    for (const result of results) {
      if (result.status === 'fulfilled') {
        tools.push(...result.value)
      }
    }
    return tools
  }
}
