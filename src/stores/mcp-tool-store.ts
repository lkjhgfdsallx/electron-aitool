import { create } from 'zustand'
import type { Tool, MCPServerConfig } from '../types'
import { mcpService } from '../services/mcp-service'
import { useGlobalConfigStore } from './global-config-store'

/**
 * MCP 工具状态管理 Store
 *
 * 职责：
 * 1. 监听 mcpServers 配置变更
 * 2. 自动调用 mcpService.fetchAllTools() 获取 MCP 工具
 * 3. 提供 MCP 工具列表供其他模块消费
 * 4. 管理加载状态和错误信息
 */
interface MCPToolStore {
  /** 当前可用的 MCP 工具列表 */
  mcpTools: Tool[]
  /** 是否正在加载 */
  loading: boolean
  /** 各服务器的错误信息，key 为 serverId */
  errors: Record<string, string>
  /** 上次刷新时间 */
  lastRefreshedAt: number

  /** 刷新所有已启用的 MCP 服务器的工具列表 */
  refreshTools: () => Promise<void>
  /** 获取当前 MCP 工具列表 */
  getMCPTools: () => Tool[]
  /** 停止所有 MCP 服务器 */
  stopAllServers: () => Promise<void>
}

export const useMCPToolStore = create<MCPToolStore>()((set, get) => ({
  mcpTools: [],
  loading: false,
  errors: {},
  lastRefreshedAt: 0,

  refreshTools: async () => {
    const { mcpServers } = useGlobalConfigStore.getState()
    const enabledServers = mcpServers.filter((s) => s.enabled)

    // 如果没有启用的服务器，清空工具列表
    if (enabledServers.length === 0) {
      set({ mcpTools: [], errors: {}, loading: false })
      return
    }

    set({ loading: true, errors: {} })

    const allTools: Tool[] = []
    const errors: Record<string, string> = {}

    // 逐个服务器获取工具（允许部分失败）
    await Promise.allSettled(
      enabledServers.map(async (server) => {
        try {
          const tools = await mcpService.fetchTools(server)
          allTools.push(...tools)
        } catch (error) {
          const message = error instanceof Error ? error.message : '连接失败'
          errors[server.id] = `[${server.name}] ${message}`
          console.error(`[MCP Store] 获取工具失败 (${server.name}):`, message)
        }
      })
    )

    set({
      mcpTools: allTools,
      errors,
      loading: false,
      lastRefreshedAt: Date.now()
    })

    console.log(`[MCP Store] 刷新完成: ${allTools.length} 个工具, ${Object.keys(errors).length} 个错误`)
  },

  getMCPTools: () => get().mcpTools,

  stopAllServers: async () => {
    const { mcpTools } = get()
    const serverIds = mcpTools
      .map((t) => t.mcpServerId)
      .filter((id): id is string => Boolean(id))
      .filter((id, idx, arr) => arr.indexOf(id) === idx)
    for (const serverId of serverIds) {
      try {
        await mcpService.stopServer(serverId)
      } catch {
        // ignore
      }
    }
    set({ mcpTools: [], errors: {} })
  }
}))

// ==================== 自动同步 ====================

/**
 * 订阅 global-config-store 的 mcpServers 变化，自动刷新 MCP 工具
 * 在应用初始化时调用一次即可
 */
let unsubscribe: (() => void) | null = null

export function initMCPSync(): void {
  // 避免重复订阅
  if (unsubscribe) return

  // 首次加载时刷新
  const { mcpServers } = useGlobalConfigStore.getState()
  if (mcpServers.some((s) => s.enabled)) {
    useMCPToolStore.getState().refreshTools()
  }

  // 订阅配置变更
  unsubscribe = useGlobalConfigStore.subscribe((state, prevState) => {
    // 只在 mcpServers 实际变化时刷新
    if (state.mcpServers !== prevState.mcpServers) {
      console.log('[MCP Sync] 检测到 MCP 配置变更，刷新工具列表...')
      useMCPToolStore.getState().refreshTools()
    }
  })
}

/** 取消订阅（用于测试或卸载） */
export function destroyMCPSync(): void {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
}
