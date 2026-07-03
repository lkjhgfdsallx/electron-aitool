/**
 * Agent 引擎重构 - Phase 2 完整实现
 *
 * 检查点存储：引擎在关键节点保存轻量快照，
 * resumeAgent 从最新 checkpoint 恢复，不再从 conversationHistory 重建消息。
 *
 * 使用 InMemoryCheckpointStore（基于 Map），不持久化到 IndexedDB。
 * 原因：checkpoint 数据量大（含完整 AgentMessage[]），Map 的 get/set 是 O(1) 无性能瓶颈。
 * 恢复场景仅在应用运行期间；应用重启后 conversationHistory 已持久化到 DB，走 fallback 重建路径。
 */

/** Agent 运行检查点 */
export interface AgentCheckpoint {
  /** 运行 id */
  runId: string
  /** 关联的会话 id */
  conversationId: string
  /** 关联的 Agent id */
  agentId: string
  /** 事件序列号（快照对应的事件序号） */
  eventSeq: number
  /** 快照内容 */
  snapshot: {
    /** Agent 内部消息列表（已构建好可直接发给 LLM 的格式） */
    messages: unknown[]
    /** 已执行的步骤 */
    steps: unknown[]
    /** 当前步骤索引 */
    stepIndex: number
    /** 各 ToolExecutor 的会话状态序列化 */
    toolCtxState: Record<string, unknown>
  }
  /** 创建时间 */
  createdAt: number
}

/**
 * 检查点存储接口
 */
export interface CheckpointStore {
  /** 保存检查点 */
  save(checkpoint: AgentCheckpoint): Promise<void>
  /** 读取某会话最新的检查点 */
  getLatest(conversationId: string): Promise<AgentCheckpoint | null>
  /** 读取指定运行的最新检查点 */
  getByRunId(runId: string): Promise<AgentCheckpoint | null>
  /** 删除指定运行的检查点 */
  delete(runId: string): Promise<void>
}

/**
 * 内存检查点存储实现
 *
 * 基于 Map<runId, AgentCheckpoint>，额外维护 conversationId → runId[] 索引。
 * 每个 conversationId 最多保留最新 2 个 checkpoint，自动清理旧数据。
 */
class InMemoryCheckpointStore implements CheckpointStore {
  private store = new Map<string, AgentCheckpoint>()
  /** conversationId → runId[] 索引（按 createdAt 排序） */
  private convIndex = new Map<string, string[]>()
  /** 每个 conversationId 最多保留的 checkpoint 数 */
  private maxPerConversation = 2

  async save(checkpoint: AgentCheckpoint): Promise<void> {
    // 存入主存储
    this.store.set(checkpoint.runId, checkpoint)

    // 更新 conversationId 索引
    const runIds = this.convIndex.get(checkpoint.conversationId) ?? []
    // 移除已有的同 runId（更新场景）
    const filtered = runIds.filter(id => id !== checkpoint.runId)
    filtered.push(checkpoint.runId)
    this.convIndex.set(checkpoint.conversationId, filtered)

    // 限制每个 conversationId 最多保留 maxPerConversation 个 checkpoint
    if (filtered.length > this.maxPerConversation) {
      // 找到最旧的 checkpoint runId 并删除
      const toRemove: string[] = []
      // 按 createdAt 排序，保留最新的
      const sorted = filtered
        .map(id => ({ id, cp: this.store.get(id)! }))
        .sort((a, b) => b.cp.createdAt - a.cp.createdAt)

      // 保留前 maxPerConversation 个，其余删除
      for (let i = this.maxPerConversation; i < sorted.length; i++) {
        toRemove.push(sorted[i].id)
      }

      for (const id of toRemove) {
        this.store.delete(id)
        // 从索引中也移除
        const idx = filtered.indexOf(id)
        if (idx >= 0) filtered.splice(idx, 1)
      }
      this.convIndex.set(checkpoint.conversationId, filtered)
    }
  }

  async getLatest(conversationId: string): Promise<AgentCheckpoint | null> {
    const runIds = this.convIndex.get(conversationId)
    if (!runIds || runIds.length === 0) return null

    // 找到最新的 checkpoint（按 createdAt）
    let latest: AgentCheckpoint | null = null
    for (const id of runIds) {
      const cp = this.store.get(id)
      if (cp && (!latest || cp.createdAt > latest.createdAt)) {
        latest = cp
      }
    }
    return latest ?? null
  }

  async getByRunId(runId: string): Promise<AgentCheckpoint | null> {
    return this.store.get(runId) ?? null
  }

  async delete(runId: string): Promise<void> {
    const cp = this.store.get(runId)
    if (cp) {
      this.store.delete(runId)
      // 从 conversationId 索引中移除
      const runIds = this.convIndex.get(cp.conversationId)
      if (runIds) {
        const idx = runIds.indexOf(runId)
        if (idx >= 0) runIds.splice(idx, 1)
        if (runIds.length === 0) {
          this.convIndex.delete(cp.conversationId)
        } else {
          this.convIndex.set(cp.conversationId, runIds)
        }
      }
    }
  }
}

/** 全局检查点存储单例 */
export const checkpointStore = new InMemoryCheckpointStore()
