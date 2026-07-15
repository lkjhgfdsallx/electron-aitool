/**
 * 记忆服务 - Agent 的短期和长期记忆管理
 *
 * 短期记忆：当前会话的对话历史（由对话 Store 管理）
 * 长期记忆：跨会话或会话级的关键事实记忆（本地键值存储）
 *
 * 作用域：
 * - agent：跨会话，同一 Agent 在不同对话间共享
 * - conversation：仅当前对话可见（crossSession=false 时写入）
 */

export type MemoryScope = 'agent' | 'conversation'

export interface MemoryEntry {
  id: string
  agentId: string
  key: string
  value: string
  createdAt: number
  updatedAt: number
  /** 作用域；缺省视为 agent（兼容旧数据） */
  scope?: MemoryScope
  /** 会话级记忆必填；全局记忆可选（来源溯源） */
  conversationId?: string
  /** 来源 runId，便于调试 */
  sourceRunId?: string
  /** 用户手动编辑标记 */
  userEdited?: boolean
}

export interface MemoryListItem {
  id: string
  key: string
  value: string
  updatedAt: number
  createdAt: number
  scope: MemoryScope
  conversationId?: string
  sourceRunId?: string
  userEdited?: boolean
}

export interface RememberOptions {
  agentId: string
  key: string
  value: string
  /** true=写入 agent 作用域；false=写入 conversation 作用域 */
  crossSession: boolean
  conversationId?: string
  sourceRunId?: string
}

export interface RecallOptions {
  agentId: string
  key: string
  crossSession: boolean
  conversationId?: string
}

export interface ForgetOptions {
  agentId: string
  key: string
  crossSession: boolean
  conversationId?: string
}

export interface ListMemoriesOptions {
  agentId: string
  crossSession: boolean
  conversationId?: string
  /** 最多返回条数，默认 50 */
  limit?: number
  /** 可选关键词过滤 key/value */
  query?: string
}

export interface FormatMemoriesOptions {
  agentId: string
  conversationId?: string
  crossSession: boolean
  maxEntries?: number
  maxChars?: number
}

interface MemoryStore {
  entries: MemoryEntry[]
}

const STORAGE_KEY = 'agent-memory'

/** 默认注入上限 */
export const DEFAULT_MAX_INJECT_ENTRIES = 30
export const DEFAULT_MAX_INJECT_CHARS = 4000

function loadMemoryStore(): MemoryStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as MemoryStore
  } catch {
    // ignore
  }
  return { entries: [] }
}

function saveMemoryStore(store: MemoryStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

/** 规范化旧数据：无 scope 视为 agent */
function resolveScope(entry: MemoryEntry): MemoryScope {
  return entry.scope === 'conversation' ? 'conversation' : 'agent'
}

/**
 * 判断条目在当前读取上下文中是否可见
 * - crossSession=true：仅 agent 作用域
 * - crossSession=false：仅当前 conversation 的 conversation 作用域
 */
function isVisibleInContext(
  entry: MemoryEntry,
  agentId: string,
  crossSession: boolean,
  conversationId?: string
): boolean {
  if (entry.agentId !== agentId) return false
  const scope = resolveScope(entry)
  if (crossSession) {
    return scope === 'agent'
  }
  if (!conversationId) return false
  return scope === 'conversation' && entry.conversationId === conversationId
}

function toListItem(entry: MemoryEntry): MemoryListItem {
  return {
    id: entry.id,
    key: entry.key,
    value: entry.value,
    updatedAt: entry.updatedAt,
    createdAt: entry.createdAt,
    scope: resolveScope(entry),
    conversationId: entry.conversationId,
    sourceRunId: entry.sourceRunId,
    userEdited: entry.userEdited,
  }
}

export const memoryService = {
  /**
   * 记忆一条关键事实（remember 工具调用）
   * 按 crossSession 决定写入 agent 或 conversation 作用域；同 scope+key 覆盖更新。
   */
  remember(options: RememberOptions): void {
    const { agentId, key, value, crossSession, conversationId, sourceRunId } = options
    if (!key || !value) return

    const scope: MemoryScope = crossSession ? 'agent' : 'conversation'
    if (scope === 'conversation' && !conversationId) {
      // 无 conversationId 时无法做会话隔离，降级为 agent 作用域并记录
      console.warn('[memory-service] crossSession=false 但缺少 conversationId，降级写入 agent 作用域')
    }
    const effectiveScope: MemoryScope =
      scope === 'conversation' && conversationId ? 'conversation' : 'agent'

    const store = loadMemoryStore()
    const existing = store.entries.find((e) => {
      if (e.agentId !== agentId || e.key !== key) return false
      const s = resolveScope(e)
      if (effectiveScope === 'agent') return s === 'agent'
      return s === 'conversation' && e.conversationId === conversationId
    })

    const now = Date.now()
    if (existing) {
      existing.value = value
      existing.updatedAt = now
      existing.scope = effectiveScope
      if (effectiveScope === 'conversation') {
        existing.conversationId = conversationId
      }
      if (sourceRunId) existing.sourceRunId = sourceRunId
    } else {
      store.entries.push({
        id: crypto.randomUUID(),
        agentId,
        key,
        value,
        createdAt: now,
        updatedAt: now,
        scope: effectiveScope,
        conversationId: effectiveScope === 'conversation' ? conversationId : conversationId,
        sourceRunId,
      })
    }
    saveMemoryStore(store)
  },

  /**
   * 兼容旧签名：remember(agentId, key, value) → 默认跨会话 agent 作用域
   * @deprecated 请使用 remember(options)
   */
  rememberLegacy(agentId: string, key: string, value: string): void {
    this.remember({ agentId, key, value, crossSession: true })
  },

  /**
   * 回忆某个 key 的记忆（尊重作用域）
   */
  recall(options: RecallOptions): string | null {
    const { agentId, key, crossSession, conversationId } = options
    const store = loadMemoryStore()
    const entry = store.entries.find(
      (e) => e.key === key && isVisibleInContext(e, agentId, crossSession, conversationId)
    )
    return entry?.value ?? null
  },

  /**
   * 兼容旧签名：recall(agentId, key) → 跨会话 agent 作用域
   * @deprecated 请使用 recall(options)
   */
  recallLegacy(agentId: string, key: string): string | null {
    return this.recall({ agentId, key, crossSession: true })
  },

  /**
   * 获取某个 Agent 在指定上下文中可见的记忆
   */
  getMemoriesForContext(
    agentId: string,
    crossSession: boolean,
    conversationId?: string
  ): MemoryListItem[] {
    const store = loadMemoryStore()
    return store.entries
      .filter((e) => isVisibleInContext(e, agentId, crossSession, conversationId))
      .map(toListItem)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  },

  /**
   * 获取某个 Agent 的所有记忆（管理面板用，含全部 scope）
   */
  getAllMemories(agentId: string): MemoryListItem[] {
    const store = loadMemoryStore()
    return store.entries
      .filter((e) => e.agentId === agentId)
      .map(toListItem)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  },

  /**
   * 按 id 更新记忆内容（用户编辑）
   */
  updateMemory(id: string, value: string): boolean {
    const store = loadMemoryStore()
    const entry = store.entries.find((e) => e.id === id)
    if (!entry) return false
    entry.value = value
    entry.updatedAt = Date.now()
    entry.userEdited = true
    saveMemoryStore(store)
    return true
  },

  /**
   * 按 id 删除单条记忆
   */
  deleteMemoryById(id: string): boolean {
    const store = loadMemoryStore()
    const before = store.entries.length
    store.entries = store.entries.filter((e) => e.id !== id)
    saveMemoryStore(store)
    return store.entries.length < before
  },

  /**
   * 删除某条记忆（工具 forget：按当前作用域规则）
   */
  forget(options: ForgetOptions): boolean {
    const { agentId, key, crossSession, conversationId } = options
    const store = loadMemoryStore()
    const before = store.entries.length
    store.entries = store.entries.filter(
      (e) => !(e.key === key && isVisibleInContext(e, agentId, crossSession, conversationId))
    )
    saveMemoryStore(store)
    return store.entries.length < before
  },

  /**
   * 兼容旧签名：forget(agentId, key)
   * @deprecated
   */
  forgetLegacy(agentId: string, key: string): boolean {
    return this.forget({ agentId, key, crossSession: true })
  },

  /**
   * 列出当前作用域下可见的记忆摘要（list_memories 工具）
   */
  listMemories(options: ListMemoriesOptions): MemoryListItem[] {
    const { agentId, crossSession, conversationId, limit = 50, query } = options
    let items = this.getMemoriesForContext(agentId, crossSession, conversationId)
    if (query?.trim()) {
      const q = query.trim().toLowerCase()
      items = items.filter(
        (m) => m.key.toLowerCase().includes(q) || m.value.toLowerCase().includes(q)
      )
    }
    return items.slice(0, Math.max(1, limit))
  },

  /**
   * 导出完整记忆存储（备份用）
   */
  exportStore(): { entries: MemoryEntry[] } {
    return loadMemoryStore()
  },

  /**
   * 导入记忆存储（恢复用；覆盖当前）
   */
  importStore(data: { entries?: MemoryEntry[] } | MemoryEntry[]): number {
    const entries = Array.isArray(data) ? data : (data.entries ?? [])
    if (!Array.isArray(entries)) {
      throw new Error('invalid memory store payload')
    }
    const normalized: MemoryEntry[] = entries
      .filter((e) => e && typeof e === 'object' && e.agentId && e.key)
      .map((e) => ({
        id: String(e.id || crypto.randomUUID()),
        agentId: String(e.agentId),
        key: String(e.key),
        value: String(e.value ?? ''),
        createdAt: Number(e.createdAt) || Date.now(),
        updatedAt: Number(e.updatedAt) || Date.now(),
        scope: e.scope === 'conversation' ? 'conversation' : 'agent',
        conversationId: e.conversationId ? String(e.conversationId) : undefined,
        sourceRunId: e.sourceRunId ? String(e.sourceRunId) : undefined,
        userEdited: !!e.userEdited,
      }))
    saveMemoryStore({ entries: normalized })
    return normalized.length
  },

  /**
   * 清空某个 Agent 的所有记忆
   */
  clearMemories(agentId: string): void {
    const store = loadMemoryStore()
    store.entries = store.entries.filter((e) => e.agentId !== agentId)
    saveMemoryStore(store)
  },

  /**
   * 清空全部 Agent 记忆
   */
  clearAllMemories(): number {
    const store = loadMemoryStore()
    const count = store.entries.length
    saveMemoryStore({ entries: [] })
    return count
  },

  /**
   * 统计全部记忆条数
   */
  countAll(): number {
    return loadMemoryStore().entries.length
  },

  /**
   * 统计某 Agent 记忆条数
   */
  countByAgent(agentId: string): number {
    return loadMemoryStore().entries.filter((e) => e.agentId === agentId).length
  },

  /**
   * 将可见长期记忆格式化为上下文字符串（注入 Prompt）
   */
  formatMemoriesAsContext(options: FormatMemoriesOptions | string): string {
    // 兼容旧调用 formatMemoriesAsContext(agentId)
    if (typeof options === 'string') {
      return this.formatMemoriesAsContext({
        agentId: options,
        crossSession: true,
      })
    }

    const {
      agentId,
      conversationId,
      crossSession,
      maxEntries = DEFAULT_MAX_INJECT_ENTRIES,
      maxChars = DEFAULT_MAX_INJECT_CHARS,
    } = options

    const memories = this.getMemoriesForContext(agentId, crossSession, conversationId)
    if (memories.length === 0) return ''

    const selected: MemoryListItem[] = []
    let charCount = 0
    for (const m of memories) {
      if (selected.length >= maxEntries) break
      const lineLen = m.key.length + m.value.length + 4
      if (selected.length > 0 && charCount + lineLen > maxChars) break
      selected.push(m)
      charCount += lineLen
    }

    const scopeLabel = crossSession ? '跨会话' : '仅本对话'
    const total = memories.length
    const injected = selected.length
    const lines = selected.map((m) => `- ${m.key}: ${m.value}`)

    return [
      `## 长期记忆（${scopeLabel}，共 ${total} 条${injected < total ? `，注入最近 ${injected} 条` : ''}）`,
      '以下为该 Agent 已记录的关键事实。若与用户当前指令冲突，以当前用户指令与本对话历史为准。',
      lines.join('\n'),
    ].join('\n')
  },
}
