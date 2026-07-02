/**
 * 隐私清洗服务
 *
 * 提供敏感数据的清理功能：
 * - 一键清除所有 API Key
 * - 清除 MCP 服务器凭据
 * - 按时间段删除对话记录
 */

import { conversationDb } from './conversation-db'
import { useConversationStore } from '../stores/conversation-store'

// ==================== 类型 ====================

/** 敏感数据统计 */
export interface SensitiveDataSummary {
  /** global-config 中是否有 API Key */
  hasGlobalApiKey: boolean
  /** AI Provider 数量 */
  providerCount: number
  /** 有 API Key 的 Provider 数量 */
  providersWithKey: number
  /** MCP 服务器数量 */
  mcpServerCount: number
  /** 总对话数 */
  totalConversations: number
  /** 总消息数 */
  totalMessages: number
}

/** 时间范围 */
export interface TimeRange {
  start: number // Unix 时间戳（毫秒）
  end: number   // Unix 时间戳（毫秒）
}

// ==================== 敏感数据扫描 ====================

/**
 * 扫描当前应用中的敏感数据概况
 */
export async function scanSensitiveData(): Promise<SensitiveDataSummary> {
  let hasGlobalApiKey = false
  let providerCount = 0
  let providersWithKey = 0
  let mcpServerCount = 0
  let totalConversations = 0
  let totalMessages = 0

  // 扫描 global-config
  try {
    const configData = JSON.parse(localStorage.getItem('global-config') || '{}')
    hasGlobalApiKey = !!(configData.state?.apiKey)
    mcpServerCount = (configData.state?.mcpServers?.length) ?? 0
  } catch { /* ignore */ }

  // 扫描 ai-providers
  try {
    const aiData = JSON.parse(localStorage.getItem('ai-providers') || '{}')
    const providers = aiData.state?.providers ?? []
    providerCount = providers.length
    providersWithKey = providers.filter((p: { apiKey?: string }) => !!p.apiKey).length
  } catch { /* ignore */ }

  // 扫描对话（元数据在 localStorage，消息在 IndexedDB）
  try {
    const convData = JSON.parse(localStorage.getItem('conversations') || '{}')
    const conversations = convData.state?.conversations ?? []
    totalConversations = conversations.length
    // ⚡ 消息总数从 IDB 异步获取（conversationId 索引计数）
    totalMessages = await conversationDb.getMessageCount()
  } catch { /* ignore */ }

  return {
    hasGlobalApiKey,
    providerCount,
    providersWithKey,
    mcpServerCount,
    totalConversations,
    totalMessages
  }
}

// ==================== API Key 清洗 ====================

/**
 * 清除所有 API Key（global-config + 所有 AI Provider）
 * @returns 被清除的 Key 数量
 */
export function clearAllApiKeys(): number {
  let clearedCount = 0

  // 清除 global-config 中的 apiKey
  try {
    const raw = localStorage.getItem('global-config')
    if (raw) {
      const data = JSON.parse(raw)
      if (data.state?.apiKey) {
        data.state.apiKey = ''
        localStorage.setItem('global-config', JSON.stringify(data))
        clearedCount++
      }
    }
  } catch { /* ignore */ }

  // 清除所有 AI Provider 的 apiKey
  try {
    const raw = localStorage.getItem('ai-providers')
    if (raw) {
      const data = JSON.parse(raw)
      if (data.state?.providers) {
        for (const provider of data.state.providers) {
          if (provider.apiKey) {
            provider.apiKey = ''
            clearedCount++
          }
        }
        localStorage.setItem('ai-providers', JSON.stringify(data))
      }
    }
  } catch { /* ignore */ }

  return clearedCount
}

// ==================== MCP 凭据清洗 ====================

/**
 * 清除所有 MCP 服务器的认证凭据
 * @returns 被清除的服务器数量
 */
export function clearMCPCredentials(): number {
  let clearedCount = 0

  try {
    const raw = localStorage.getItem('global-config')
    if (!raw) return 0
    const data = JSON.parse(raw)
    if (data.state?.mcpServers) {
      for (const server of data.state.mcpServers) {
        if (server.env) {
          // 清除环境变量中可能包含密钥的字段
          const sensitiveKeys = Object.keys(server.env).filter(
            (k) => /token|key|secret|password|auth/i.test(k)
          )
          for (const key of sensitiveKeys) {
            server.env[key] = ''
            clearedCount++
          }
        }
      }
      localStorage.setItem('global-config', JSON.stringify(data))
    }
  } catch { /* ignore */ }

  return clearedCount
}

// ==================== 按时间段删除对话 ====================

/**
 * 获取在指定时间范围内的对话列表
 */
export function getConversationsInTimeRange(range: TimeRange): Array<{ id: string; title: string; createdAt: number; messageCount: number }> {
  try {
    const raw = localStorage.getItem('conversations')
    if (!raw) return []
    const data = JSON.parse(raw)
    const conversations = data.state?.conversations ?? []

    return conversations
      .filter((c: { createdAt: number; updatedAt: number }) => {
        // 使用 createdAt 判断是否在范围内
        return c.createdAt >= range.start && c.createdAt <= range.end
      })
      .map((c: { id: string; title: string; createdAt: number; messageCount: number }) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        messageCount: c.messageCount ?? 0
      }))
  } catch {
    return []
  }
}

/**
 * 删除指定时间范围内的对话及其消息
 * @returns 被删除的对话数量
 */
export async function deleteConversationsByTimeRange(range: TimeRange): Promise<number> {
  try {
    const store = useConversationStore.getState()
    const conversations = store.conversations

    // 找出范围内的对话 ID
    const idsToDelete = new Set<string>()
    for (const conv of conversations) {
      if (conv.createdAt >= range.start && conv.createdAt <= range.end) {
        idsToDelete.add(conv.id)
      }
    }

    if (idsToDelete.size === 0) return 0

    // ⚡ 逐个删除对话（store 的 deleteConversation 会同步清理内存 + IDB 消息）
    for (const id of idsToDelete) {
      store.deleteConversation(id)
    }

    return idsToDelete.size
  } catch {
    return 0
  }
}

/**
 * 删除所有对话记录
 * @returns 被删除的对话数量
 */
export async function deleteAllConversations(): Promise<number> {
  try {
    const store = useConversationStore.getState()
    const count = store.conversations.length

    // ⚡ 逐个删除对话（store 的 deleteConversation 会同步清理内存 + IDB 消息）
    const allIds = store.conversations.map((c) => c.id)
    for (const id of allIds) {
      store.deleteConversation(id)
    }

    // 额外保险：清空 IDB 中所有残留消息
    await conversationDb.clearAllMessages().catch(() => { /* ignore */ })

    return count
  } catch {
    return 0
  }
}

// ==================== 工具函数 ====================

/**
 * 格式化时间戳为日期字符串（用于日期选择器）
 */
export function formatDateForInput(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 创建一天的起始/结束时间戳
 */
export function getDayRange(dateStr: string): TimeRange {
  const date = new Date(dateStr)
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const end = start + 24 * 60 * 60 * 1000 - 1
  return { start, end }
}
