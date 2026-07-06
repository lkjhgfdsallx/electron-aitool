/**
 * 工作区独立 Agent Store
 *
 * 管理仅保存在 `.ai-workspace-vcs/agents.json` 中的工作区 Agent。
 * 不使用 localStorage 持久化，数据跟随工作区文件。
 * 工作区激活时加载，退出时清空内存。
 */

import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { AgentProfile, AgentProfileCreateInput, AgentProfileUpdateInput } from '../types'
import { SYSTEM_AGENT_TAGS } from '../types'
import { workspaceVCSService } from '../services/workspace-vcs-service'
import { useAgentStore } from './agent-store'
import { WORKSPACE_LEADER_AGENT_ID } from '../constants/default-agents'

// 确保 Agent 标签中包含 workspace 系统标签
function ensureWorkspaceTag(tags?: string[]): string[] {
  const existing = tags ?? []
  if (existing.includes(SYSTEM_AGENT_TAGS.WORKSPACE)) return existing
  return [SYSTEM_AGENT_TAGS.WORKSPACE, ...existing]
}

// 从标签中移除 workspace 系统标签
function removeWorkspaceTag(tags?: string[]): string[] {
  if (!tags) return []
  return tags.filter((t) => t !== SYSTEM_AGENT_TAGS.WORKSPACE)
}

// 确保含 leader 标签（同时隐含 workspace 标签）
function ensureLeaderTag(tags?: string[]): string[] {
  let result = tags ?? []
  if (!result.includes(SYSTEM_AGENT_TAGS.LEADER)) {
    result = [SYSTEM_AGENT_TAGS.LEADER, ...result]
  }
  if (!result.includes(SYSTEM_AGENT_TAGS.WORKSPACE)) {
    result = [SYSTEM_AGENT_TAGS.WORKSPACE, ...result]
  }
  return result
}

// 是否为 leader Agent
function isLeaderAgent(agent: { tags?: string[] }): boolean {
  return !!agent.tags?.includes(SYSTEM_AGENT_TAGS.LEADER)
}

interface WorkspaceAgentStore {
  /** 当前工作区的 Agent 列表（内存中） */
  workspaceAgents: AgentProfile[]
  /** 是否正在加载 */
  isLoading: boolean
  /** 当前已加载的工作区路径（用于避免重复加载） */
  loadedFolderPath: string | null

  // ---- 加载/卸载 ----

  /** 从 .ai-workspace-vcs/agents.json 加载工作区 Agent */
  loadWorkspaceAgents: (folderPath: string) => Promise<void>
  /** 工作区退出时清空内存中的 Agent 列表（不影响文件） */
  clearWorkspaceAgents: () => void

  // ---- CRUD ----

  /** 创建工作区 Agent（自动添加 workspace 标签） */
  createWorkspaceAgent: (input: AgentProfileCreateInput, folderPath: string) => Promise<AgentProfile>
  /** 更新工作区 Agent */
  updateWorkspaceAgent: (input: AgentProfileUpdateInput, folderPath: string) => Promise<void>
  /** 删除工作区 Agent */
  deleteWorkspaceAgent: (id: string, folderPath: string) => Promise<void>

  // ---- 提升 ----

  /** 将工作区 Agent 复制提升为全局 Agent（工作区保留原 Agent） */
  promoteToGlobal: (id: string) => AgentProfile | undefined

  // ---- 查询 ----

  /** 根据 ID 获取工作区 Agent */
  getWorkspaceAgent: (id: string) => AgentProfile | undefined
  /** 获取所有工作区 Agent */
  getWorkspaceAgents: () => AgentProfile[]
  /** 获取当前工作区的 AI 领导 Agent */
  getLeaderAgent: () => AgentProfile | undefined
  /** 更新 AI 领导 Agent（专门方法，确保 leader 标签不变） */
  updateLeaderAgent: (input: AgentProfileUpdateInput, folderPath: string) => Promise<void>
}

export const useWorkspaceAgentStore = create<WorkspaceAgentStore>()((set, get) => ({
  workspaceAgents: [],
  isLoading: false,
  loadedFolderPath: null,

  loadWorkspaceAgents: async (folderPath: string) => {
    // 避免重复加载同一工作区
    if (get().loadedFolderPath === folderPath && get().workspaceAgents.length > 0) {
      return
    }

    set({ isLoading: true })
    try {
      const agents = await workspaceVCSService.loadAgents(folderPath)

      // 确保所有加载的 Agent 都有 workspace 标签
      const taggedAgents = agents.map((a) => ({
        ...a,
        tags: ensureWorkspaceTag(a.tags),
      }))

      // ===== 静默迁移：检查是否有 leader Agent =====
      const hasLeader = taggedAgents.some(isLeaderAgent)
      let migratedAgents: AgentProfile[] = [...taggedAgents]
      let leaderIdChanged = false

      if (!hasLeader) {
        console.log('[workspace-agent-store] 检测到无 leader Agent，执行静默迁移')

        // 尝试从全局 agent-store 读取旧的 leader 配置（可能已被用户自定义提示词）
        const agentStore = useAgentStore.getState()
        const globalLeader = agentStore.agents.find((a) => a.id === WORKSPACE_LEADER_AGENT_ID)

        // 创建新 leader 实例
          const leaderTemplate = globalLeader ?? {
            name: 'AI 领导',
            description: '工作区的 AI 项目领导，负责协调任务、规划执行并交付高质量成果',
            avatar: '👑',
            systemPrompt: '',
            enabledToolIds: [] as string[],
            planningStrategy: 'react' as const,
            memoryConfig: { historyTurns: 10, longTermEnabled: true, crossSession: true },
            termination: { maxSteps: 100, timeoutSeconds: 0, autoStopOnGoal: true },
            modelConfig: {},
            enabled: true,
          }
          const leaderInstance: AgentProfile = {
            ...leaderTemplate,
            id: uuidv4(),
            tags: ensureLeaderTag(globalLeader?.tags),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }

        // 写入工作区 agents.json
        const addResult = await workspaceVCSService.addAgent(folderPath, leaderInstance)
        if (addResult.success) {
          migratedAgents = [...taggedAgents, leaderInstance]
          leaderIdChanged = true
          console.log('[workspace-agent-store] 已创建新 leader 实例:', leaderInstance.id)
        } else {
          console.error('[workspace-agent-store] 创建 leader 实例失败:', addResult.error)
        }

        // ★ 从全局 agent-store 移除旧 leader（仅做一次）
        const migrationFlag = `leader-migrated-${folderPath}`
        if (!localStorage.getItem(migrationFlag)) {
          useAgentStore.getState().deleteAgent(WORKSPACE_LEADER_AGENT_ID)
          localStorage.setItem(migrationFlag, '1')
          console.log('[workspace-agent-store] 已从全局 agent-store 移除旧 leader')
        }
      }

      set({
        workspaceAgents: migratedAgents,
        loadedFolderPath: folderPath,
        isLoading: false,
      })

      // 如果 leader ID 变化了，由外部（workspace-store）同步 leaderAgentId
      if (leaderIdChanged) {
        // workspace-store 的 activateWorkspace 会在加载完成后检测并同步
        // 此处可触发一个自定义事件或直接通知
        window.dispatchEvent(new CustomEvent('workspace-leader-created', {
          detail: { folderPath, leaderAgentId: get().workspaceAgents.find(isLeaderAgent)?.id }
        }))
      }
    } catch (err) {
      console.error('[workspace-agent-store] 加载工作区 Agent 失败:', err)
      set({ workspaceAgents: [], isLoading: false })
    }
  },

  clearWorkspaceAgents: () => {
    set({ workspaceAgents: [], loadedFolderPath: null })
  },

  createWorkspaceAgent: async (input, folderPath) => {
    const agent: AgentProfile = {
      ...input,
      id: uuidv4(),
      tags: ensureWorkspaceTag(input.tags),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = await workspaceVCSService.addAgent(folderPath, agent)
    if (!result.success) {
      throw new Error(result.error ?? '创建工作区 Agent 失败')
    }

    set((state) => ({
      workspaceAgents: [...state.workspaceAgents, agent],
    }))

    return agent
  },

  updateWorkspaceAgent: async (input, folderPath) => {
    const existing = get().workspaceAgents.find((a) => a.id === input.id)
    if (!existing) {
      throw new Error(`工作区 Agent ${input.id} 不存在`)
    }

    const updated: AgentProfile = {
      ...existing,
      ...input,
      tags: ensureWorkspaceTag(input.tags ?? existing.tags),
      updatedAt: Date.now(),
    }

    const result = await workspaceVCSService.updateAgent(folderPath, updated)
    if (!result.success) {
      throw new Error(result.error ?? '更新工作区 Agent 失败')
    }

    set((state) => ({
      workspaceAgents: state.workspaceAgents.map((a) =>
        a.id === input.id ? updated : a
      ),
    }))
  },

  deleteWorkspaceAgent: async (id, folderPath) => {
    const result = await workspaceVCSService.deleteAgent(folderPath, id)
    if (!result.success) {
      throw new Error(result.error ?? '删除工作区 Agent 失败')
    }

    set((state) => ({
      workspaceAgents: state.workspaceAgents.filter((a) => a.id !== id),
    }))
  },

  promoteToGlobal: (id: string) => {
    const agent = get().workspaceAgents.find((a) => a.id === id)
    if (!agent) return undefined

    // 复制到全局 agent-store：新 ID，移除 workspace 标签
    const globalAgent: AgentProfile = {
      ...agent,
      id: uuidv4(),
      tags: removeWorkspaceTag(agent.tags),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const agentStore = useAgentStore.getState()
    agentStore.createAgent(globalAgent)

    return globalAgent
  },

  getWorkspaceAgent: (id: string) => {
    return get().workspaceAgents.find((a) => a.id === id)
  },

  getWorkspaceAgents: () => {
    return get().workspaceAgents
  },

  getLeaderAgent: () => {
    return get().workspaceAgents.find(isLeaderAgent)
  },

  updateLeaderAgent: async (input, folderPath) => {
    const existing = get().workspaceAgents.find(isLeaderAgent)
    if (!existing) {
      throw new Error(`工作区 AI 领导 Agent 不存在`)
    }

    // 确保 leader 标签不被覆盖
    const updated: AgentProfile = {
      ...existing,
      ...input,
      tags: ensureLeaderTag(input.tags ?? existing.tags),
      updatedAt: Date.now(),
    }

    const result = await workspaceVCSService.updateAgent(folderPath, updated)
    if (!result.success) {
      throw new Error(result.error ?? '更新 AI 领导 Agent 失败')
    }

    set((state) => ({
      workspaceAgents: state.workspaceAgents.map((a) =>
        a.id === existing.id ? updated : a
      ),
    }))
  },
}))
