/**
 * 联网工具统一策略
 *
 * 设计原则：
 * - 对话框「联网」按钮（settings.webSearchEnabled）是联网工具的唯一运行时开关
 * - 不受 Agent.enabledToolIds、disabledBuiltinToolIds 影响
 * - Agent 设置页将联网工具隐藏，由本模块在运行时按开关注入/剥离
 */
import type { Tool } from '../types'
import { BUILT_IN_TOOLS } from '../services/built-in-tools'
import { useSettingsStore } from '../stores'

/** 联网相关工具 ID */
export const WEB_TOOL_IDS = ['builtin:web_search', 'builtin:fetch_webpage'] as const

/** 联网相关工具名集合 */
export const WEB_TOOL_NAMES = new Set(['web_search', 'fetch_webpage'])

/** 判断是否为联网工具（按 name 或 id） */
export function isWebTool(tool: Pick<Tool, 'id' | 'name'> | { id?: string; name?: string }): boolean {
  if (tool.name && WEB_TOOL_NAMES.has(tool.name)) return true
  if (tool.id && (WEB_TOOL_IDS as readonly string[]).includes(tool.id)) return true
  return false
}

/** 读取当前联网开关 */
export function isWebSearchEnabled(): boolean {
  try {
    return !!useSettingsStore.getState().webSearchEnabled
  } catch {
    return false
  }
}

/**
 * 获取当前应注入的联网工具定义（强制 enabled=true）
 * 仅当联网开关开启时返回非空列表
 */
export function getWebToolsIfEnabled(): Tool[] {
  if (!isWebSearchEnabled()) return []
  return BUILT_IN_TOOLS
    .filter((t) => WEB_TOOL_NAMES.has(t.name))
    .map((t) => ({ ...t, enabled: true }))
}

/**
 * 按联网开关处理工具列表：
 * - 关闭：移除所有联网工具
 * - 开启：移除旧联网工具后重新注入（忽略 disabledBuiltinToolIds / enabled 标记）
 */
export function applyWebSearchPolicy(tools: Tool[]): Tool[] {
  const nonWeb = tools.filter((t) => !isWebTool(t))
  if (!isWebSearchEnabled()) return nonWeb

  const webTools = getWebToolsIfEnabled()
  const existingIds = new Set(nonWeb.map((t) => t.id))
  const existingNames = new Set(nonWeb.map((t) => t.name))
  const toAdd = webTools.filter((t) => !existingIds.has(t.id) && !existingNames.has(t.name))
  return [...nonWeb, ...toAdd]
}

/**
 * 判断工具是否应绕过 Agent.enabledToolIds 白名单
 *（联网工具仅由对话框按钮控制）
 */
export function shouldBypassAgentToolWhitelist(tool: Pick<Tool, 'id' | 'name'>): boolean {
  return isWebTool(tool)
}
