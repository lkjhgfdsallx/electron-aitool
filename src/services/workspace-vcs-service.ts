/**
 * 工作区 VCS 服务（渲染进程）
 *
 * 封装对 Electron IPC 的调用，提供给 UI 层使用的高级 VCS 操作。
 * 与 workspace-store 配合，维护存档点索引的同步。
 */

import { useWorkspaceStore } from '../stores/workspace-store'
import type { CheckpointIndex, CheckpointDetail, CreateCheckpointParams, AgentProfile } from '../types'
import { v4 as uuidv4 } from 'uuid'

const api = () => window.electronAPI

// ---- VCS 服务 ----

export const workspaceVCSService = {
  /**
   * 初始化工作区 VCS 目录结构
   */
  async initWorkspace(folderPath: string): Promise<{ success: boolean; error?: string }> {
    return api().workspace.vcs.init(folderPath)
  },

  /**
   * 创建存档点并自动刷新 store 索引
   *
   * @param params 创建参数（不含 checkpointId，自动生成）
   * @returns 存档点 ID
   */
  async createCheckpoint(
    params: Omit<CreateCheckpointParams, 'checkpointId'> & { workspaceId: string }
  ): Promise<{ success: boolean; checkpointId?: string; error?: string }> {
    const checkpointId = `cp-${uuidv4().slice(0, 8)}`
    const result = await api().workspace.vcs.createCheckpoint({
      ...params,
      checkpointId,
    })

    if (result.success) {
      // 刷新 store 中的存档索引
      await this.refreshCheckpointIndex(params.folderPath)
    }

    return { ...result, checkpointId }
  },

  /**
   * 列出存档点索引
   */
  async listCheckpoints(folderPath: string): Promise<CheckpointIndex[]> {
    const result = await api().workspace.vcs.listCheckpoints(folderPath)
    if (result.success && result.checkpoints) {
      return result.checkpoints as CheckpointIndex[]
    }
    return []
  },

  /**
   * 获取存档点详情
   */
  async getCheckpointDetail(
    folderPath: string,
    checkpointId: string
  ): Promise<CheckpointDetail | null> {
    const result = await api().workspace.vcs.getCheckpointDetail(folderPath, checkpointId)
    if (result.success && result.detail) {
      return result.detail as CheckpointDetail
    }
    return null
  },

  /**
   * 还原到指定存档点
   *
   * 还原前自动创建 pre-restore 存档点保护当前状态。
   */
  async restoreToCheckpoint(
    folderPath: string,
    checkpointId: string,
    workspaceId: string
  ): Promise<{ success: boolean; error?: string }> {
    // 先创建 pre-restore 存档点
    const preRestoreResult = await this.createCheckpoint({
      folderPath,
      description: `还原前自动存档（还原目标: ${checkpointId.slice(0, 12)}）`,
      type: 'pre-restore',
      workspaceId,
    })

    if (!preRestoreResult.success) {
      console.warn('[workspace-vcs] 创建 pre-restore 存档失败:', preRestoreResult.error)
      // 不阻止还原，仅记录警告
    }

    // 执行还原
    const result = await api().workspace.vcs.restoreCheckpoint(folderPath, checkpointId)

    if (result.success) {
      // 还原成功后刷新索引
      await this.refreshCheckpointIndex(folderPath)
    }

    return result
  },

  /**
   * 保存压缩前的消息历史快照
   */
  async saveMessagesForCompression(
    folderPath: string,
    checkpointId: string,
    messages: unknown[]
  ): Promise<{ success: boolean; error?: string }> {
    return api().workspace.vcs.saveMessages(folderPath, checkpointId, messages)
  },

  /**
   * 加载压缩前的消息历史快照
   */
  async loadMessagesBeforeCompression(
    folderPath: string,
    checkpointId: string
  ): Promise<unknown[] | null> {
    const result = await api().workspace.vcs.loadMessages(folderPath, checkpointId)
    if (result.success && result.messages) {
      return result.messages
    }
    return null
  },

  /**
   * 清理超出限制的旧存档点
   */
  async cleanup(
    folderPath: string,
    maxCheckpoints: number
  ): Promise<{ success: boolean; removed?: number; error?: string }> {
    const result = await api().workspace.vcs.cleanup(folderPath, maxCheckpoints)

    if (result.success && result.removed && result.removed > 0) {
      // 有存档被清理，刷新索引
      await this.refreshCheckpointIndex(folderPath)
    }

    return result
  },

  /**
   * 刷新 store 中的存档索引
   */
  async refreshCheckpointIndex(folderPath: string): Promise<void> {
    const store = useWorkspaceStore.getState()
    store.setIsLoadingCheckpoints(true)

    try {
      const checkpoints = await this.listCheckpoints(folderPath)
      store.setCheckpointIndex(checkpoints)
    } catch (err) {
      console.error('[workspace-vcs] 刷新存档索引失败:', err)
      store.setIsLoadingCheckpoints(false)
    }
  },

  /**
   * 选择文件夹
   */
  async selectFolder(): Promise<{ success: boolean; folderPath?: string; canceled?: boolean; error?: string }> {
    return api().workspace.selectFolder()
  },

  // ---- 工作区 Agent 服务 ----

  /**
   * 加载工作区独立 Agent 列表
   */
  async loadAgents(folderPath: string): Promise<AgentProfile[]> {
    const result = await api().workspace.vcs.loadAgents(folderPath)
    if (result.success && result.agents) {
      return result.agents as AgentProfile[]
    }
    return []
  },

  /**
   * 保存工作区 Agent 列表（全量覆盖）
   */
  async saveAgents(folderPath: string, agents: AgentProfile[]): Promise<{ success: boolean; error?: string }> {
    return api().workspace.vcs.saveAgents(folderPath, agents)
  },

  /**
   * 添加单个工作区 Agent
   */
  async addAgent(folderPath: string, agent: AgentProfile): Promise<{ success: boolean; error?: string }> {
    return api().workspace.vcs.addAgent(folderPath, agent)
  },

  /**
   * 更新单个工作区 Agent
   */
  async updateAgent(folderPath: string, agent: AgentProfile): Promise<{ success: boolean; error?: string }> {
    return api().workspace.vcs.updateAgent(folderPath, agent)
  },

  /**
   * 删除单个工作区 Agent
   */
  async deleteAgent(folderPath: string, agentId: string): Promise<{ success: boolean; error?: string }> {
    return api().workspace.vcs.deleteAgent(folderPath, agentId)
  },
}
