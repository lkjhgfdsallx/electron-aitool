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
      set({ workspaceAgents: taggedAgents, loadedFolderPath: folderPath, isLoading: false })
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
}))
