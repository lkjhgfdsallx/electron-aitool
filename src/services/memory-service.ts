/**
 * 记忆服务 - Agent 的短期和长期记忆管理
 *
 * 短期记忆：当前会话的对话历史（由对话 Store 管理）
 * 长期记忆：跨会话的关键事实记忆（本地键值存储）
 */

interface MemoryEntry {
  id: string
  agentId: string
  key: string
  value: string
  createdAt: number
  updatedAt: number
}

interface MemoryStore {
  entries: MemoryEntry[]
}

const STORAGE_KEY = 'agent-memory'

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

export const memoryService = {
  /**
   * 记忆一条关键事实（remember 工具调用）
   */
  remember(agentId: string, key: string, value: string): void {
    const store = loadMemoryStore()
    const existing = store.entries.find((e) => e.agentId === agentId && e.key === key)
    if (existing) {
      existing.value = value
      existing.updatedAt = Date.now()
    } else {
      store.entries.push({
        id: crypto.randomUUID(),
        agentId,
        key,
        value,
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
    }
    saveMemoryStore(store)
  },

  /**
   * 回忆某个 key 的记忆
   */
  recall(agentId: string, key: string): string | null {
    const store = loadMemoryStore()
    const entry = store.entries.find((e) => e.agentId === agentId && e.key === key)
    return entry?.value ?? null
  },

  /**
   * 获取某个 Agent 的所有记忆
   */
  getAllMemories(agentId: string): Array<{ key: string; value: string; updatedAt: number }> {
    const store = loadMemoryStore()
    return store.entries
      .filter((e) => e.agentId === agentId)
      .map((e) => ({ key: e.key, value: e.value, updatedAt: e.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  },

  /**
   * 删除某条记忆
   */
  forget(agentId: string, key: string): boolean {
    const store = loadMemoryStore()
    const before = store.entries.length
    store.entries = store.entries.filter(
      (e) => !(e.agentId === agentId && e.key === key)
    )
    saveMemoryStore(store)
    return store.entries.length < before
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
   * 将 Agent 的长期记忆格式化为上下文字符串（注入 Prompt）
   */
  formatMemoriesAsContext(agentId: string): string {
    const memories = this.getAllMemories(agentId)
    if (memories.length === 0) return ''
    const lines = memories.map((m) => `- ${m.key}: ${m.value}`)
    return `## 长期记忆\n以下是该 Agent 积累的关键事实记忆，请在回答时参考：\n${lines.join('\n')}`
  }
}
