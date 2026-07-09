import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import type {
  AgentProfile,
  AgentProfileCreateInput,
  AgentProfileUpdateInput,
  Prompt,
  PromptCreateInput,
  PromptUpdateInput,
  PromptVersion,
  PromptABTest,
  PromptChain,
} from '../types'
import { DEFAULT_AGENT_ID, REQUIREMENT_ANALYST_PROMPT, WEBSITE_ANALYZER_AGENT_ID, WEBSITE_ANALYZER_PROMPT, WORKSPACE_LEADER_AGENT_ID, WORKSPACE_LEADER_PROMPT } from '../constants/default-agents'
import { BUILT_IN_TOOLS, AGENT_BUILTIN_TOOLS, WORKSPACE_TOOLS } from '../services/built-in-tools'
import { PromptVersionService } from '../services/prompt-version-service'
import { STORE_VERSIONS } from '../utils/store-migration'

// ==================== 默认 Agent 配置 ====================

// 默认选中所有工具的 ID
const DEFAULT_ALL_TOOL_IDS = [...BUILT_IN_TOOLS, ...AGENT_BUILTIN_TOOLS, ...WORKSPACE_TOOLS].map((t) => t.id)

/** 需求分析 Agent 可使用的工具（严格限制为需求分析相关工具） */
const REQUIREMENT_ANALYST_TOOL_IDS = [
  'builtin:get_current_time',
  'builtin:knowledge_search',
  'agent-builtin:remember',
  'agent-builtin:recall',
  'agent-builtin:ask_self',
  'agent-builtin:define_requirement',
  'agent-builtin:review_requirements',
  'agent-builtin:ask_human',
]

const DEFAULT_AGENT_PROFILE: Omit<AgentProfile, 'id' | 'name' | 'description' | 'systemPrompt' | 'createdAt' | 'updatedAt'> = {
  scope: 'global',
  avatar: '🤖',
  enabledToolIds: [...DEFAULT_ALL_TOOL_IDS],
  planningStrategy: 'react',
  memoryConfig: {
    historyTurns: 10,
    longTermEnabled: true,
    crossSession: true
  },
  termination: {
    maxSteps: 100,
    timeoutSeconds: 0, // 0 表示不限制超时
    autoStopOnGoal: true
  },
  modelConfig: {},
  enabled: true
}

/** 创建默认的需求分析 Agent */
function createDefaultRequirementAnalyst(): AgentProfile {
  return {
    ...DEFAULT_AGENT_PROFILE,
    id: DEFAULT_AGENT_ID,
    name: '需求分析',
    description: '用户提出需求，你分析需求并反问，直到完全理清楚需求',
    avatar: '🔍',
    systemPrompt: REQUIREMENT_ANALYST_PROMPT,
    enabledToolIds: [...REQUIREMENT_ANALYST_TOOL_IDS],
    scope: 'global',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

/** 创建默认的网站分析 Agent */
function createDefaultWebsiteAnalyzer(): AgentProfile {
  return {
    ...DEFAULT_AGENT_PROFILE,
    id: WEBSITE_ANALYZER_AGENT_ID,
    name: '网站分析',
    description: '自动化分析网站功能模块、API接口，生成交互式报告',
    avatar: '🌐',
    systemPrompt: WEBSITE_ANALYZER_PROMPT,
    scope: 'global',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

/** 创建默认的工作区 AI 领导 Agent */
function createDefaultWorkspaceLeader(): AgentProfile {
  return {
    ...DEFAULT_AGENT_PROFILE,
    id: WORKSPACE_LEADER_AGENT_ID,
    name: 'AI 领导',
    description: '工作区的 AI 项目领导，负责协调任务、规划执行并交付高质量成果',
    avatar: '👑',
    systemPrompt: WORKSPACE_LEADER_PROMPT,
    scope: 'workspace',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

// ==================== Prompt 默认值 ====================

/** 为旧版 Prompt 数据补充新字段默认值 */
function migratePrompt(p: Record<string, unknown>): Prompt {
  return {
    id: p.id as string,
    name: (p.name as string) ?? '',
    description: (p.description as string) ?? '',
    content: (p.content as string) ?? '',
    sections: (p.sections as Prompt['sections']) ?? undefined,
    variables: Array.isArray(p.variables) ? p.variables : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
    category: (p.category as string) ?? undefined,
    favorite: (p.favorite as boolean) ?? false,
    pinned: (p.pinned as boolean) ?? false,
    currentVersion: (p.currentVersion as number) ?? 1,
    versionHistory: Array.isArray(p.versionHistory) ? p.versionHistory : [],
    abTest: (p.abTest as PromptABTest) ?? undefined,
    createdAt: (p.createdAt as number) ?? Date.now(),
    updatedAt: (p.updatedAt as number) ?? Date.now(),
  }
}

// ==================== Agent Profile Store ====================

interface AgentStore {
  agents: AgentProfile[]
  selectedAgentId: string | null

  // Agent Actions
  createAgent: (input: AgentProfileCreateInput) => AgentProfile
  updateAgent: (input: AgentProfileUpdateInput) => void
  deleteAgent: (id: string) => void
  selectAgent: (id: string | null) => void
  getAgent: (id: string) => AgentProfile | undefined
  getGlobalAgents: () => AgentProfile[]
  getWorkspaceScopedAgents: (folderPath?: string) => AgentProfile[]
  replaceWorkspaceScopedAgents: (folderPath: string, agents: AgentProfile[]) => void
  removeWorkspaceScopedAgents: (folderPath?: string) => void
  toggleAgentEnabled: (id: string) => void
  duplicateAgent: (id: string) => AgentProfile | undefined
  importAgents: (agents: AgentProfile[]) => void
  exportAgents: () => AgentProfile[]
  /** 恢复预设 Agent 到默认状态（创建不存在的，更新修改过的） */
  resetToDefaultAgents: () => void

  // Prompt State
  prompts: Prompt[]
  selectedPromptId: string | null

  // Prompt CRUD
  createPrompt: (input: PromptCreateInput) => Prompt
  updatePrompt: (input: PromptUpdateInput) => void
  deletePrompt: (id: string) => void
  selectPrompt: (id: string | null) => void
  getPrompt: (id: string) => Prompt | undefined
  importPrompts: (prompts: Prompt[]) => void
  exportPrompts: () => Prompt[]

  // Prompt 标签与分类
  getAllTags: () => string[]
  getPromptsByTag: (tag: string) => Prompt[]
  getPromptsByCategory: (category: string) => Prompt[]

  // Prompt 收藏与置顶
  toggleFavorite: (id: string) => void
  togglePinned: (id: string) => void

  // Prompt 版本管理
  savePromptVersion: (id: string, label?: string) => void
  rollbackPromptVersion: (promptId: string, versionId: string) => void

  // Prompt A/B 测试
  setPromptABTest: (promptId: string, test: Omit<PromptABTest, 'id' | 'createdAt'>) => void
  removePromptABTest: (promptId: string) => void

  // 提示词链
  promptChains: PromptChain[]
  createPromptChain: (input: Omit<PromptChain, 'id' | 'createdAt' | 'updatedAt'>) => PromptChain
  updatePromptChain: (input: Partial<PromptChain> & { id: string }) => void
  deletePromptChain: (id: string) => void
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      // ==================== Agent State ====================
      agents: [],
      selectedAgentId: null,

      createAgent: (input) => {
        const agent: AgentProfile = {
          ...DEFAULT_AGENT_PROFILE,
          ...input,
          scope: input.scope ?? 'global',
          id: uuidv4(),
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        set((state) => ({ agents: [...state.agents, agent] }))
        return agent
      },

      updateAgent: (input) => {
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === input.id ? { ...a, ...input, updatedAt: Date.now() } : a
          )
        }))
      },

      deleteAgent: (id) => {
        set((state) => ({
          agents: state.agents.filter((a) => a.id !== id),
          selectedAgentId: state.selectedAgentId === id ? null : state.selectedAgentId
        }))
      },

      selectAgent: (id) => set({ selectedAgentId: id }),

      getAgent: (id) => get().agents.find((a) => a.id === id),

      getGlobalAgents: () => get().agents.filter((a) => (a.scope ?? 'global') === 'global'),

      getWorkspaceScopedAgents: (folderPath) => get().agents.filter((a) =>
        a.scope === 'workspace' && (!folderPath || a.workspaceFolderPath === folderPath)
      ),

      replaceWorkspaceScopedAgents: (folderPath, agents) => {
        const scopedAgents = agents.map((agent) => ({
          ...agent,
          scope: 'workspace' as const,
          workspaceFolderPath: folderPath,
        }))
        set((state) => ({
          agents: [
            ...state.agents.filter((a) => !(a.scope === 'workspace' && a.workspaceFolderPath === folderPath)),
            ...scopedAgents,
          ],
        }))
      },

      removeWorkspaceScopedAgents: (folderPath) => {
        set((state) => ({
          agents: state.agents.filter((a) =>
            a.scope !== 'workspace' || (folderPath ? a.workspaceFolderPath !== folderPath : false)
          ),
        }))
      },

      toggleAgentEnabled: (id) => {
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === id ? { ...a, enabled: !a.enabled, updatedAt: Date.now() } : a
          )
        }))
      },

      duplicateAgent: (id) => {
        const agent = get().agents.find((a) => a.id === id)
        if (!agent) return undefined
        const newAgent: AgentProfile = {
          ...agent,
          id: uuidv4(),
          name: `${agent.name} (副本)`,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        set((state) => ({ agents: [...state.agents, newAgent] }))
        return newAgent
      },

      importAgents: (agents) => {
        set((state) => {
          const existingIds = new Set(state.agents.map((a) => a.id))
          const newAgents = agents.filter((a) => !existingIds.has(a.id))
          return { agents: [...state.agents, ...newAgents] }
        })
      },

      exportAgents: () => get().agents,

      resetToDefaultAgents: () => {
        // 全局预设 Agent 的固定 ID 列表（不包含 AI 领导，它是工作区专用的）
        const globalDefaultIds = [DEFAULT_AGENT_ID, WEBSITE_ANALYZER_AGENT_ID]
        const existingIds = new Set(get().agents.map((a) => a.id))

        // 构建重置后的预设 Agent 列表
        const resetAgents: AgentProfile[] = []

        for (const id of globalDefaultIds) {
          let defaultAgent: AgentProfile
          if (id === DEFAULT_AGENT_ID) {
            defaultAgent = createDefaultRequirementAnalyst()
          } else if (id === WEBSITE_ANALYZER_AGENT_ID) {
            defaultAgent = createDefaultWebsiteAnalyzer()
          } else {
            continue
          }

          if (!existingIds.has(id)) {
            // 新 Agent：直接使用默认值
            resetAgents.push(defaultAgent)
          } else {
            // 已存在的 Agent：保留 ID，重置为默认值
            resetAgents.push({ ...defaultAgent, id })
          }
        }

        if (resetAgents.length === 0) return

        // 移除所有全局预设 Agent，然后添加重置后的版本
        set((state) => ({
          agents: [
            ...state.agents.filter((a) => !globalDefaultIds.includes(a.id)),
            ...resetAgents,
          ],
        }))
      },

      // ==================== Prompt State ====================
      prompts: [],
      selectedPromptId: null,

      createPrompt: (input) => {
        const now = Date.now()
        const prompt: Prompt = {
          id: uuidv4(),
          name: input.name,
          description: input.description,
          content: input.content,
          sections: input.sections,
          variables: input.variables ?? [],
          tags: input.tags ?? [],
          category: input.category,
          favorite: input.favorite ?? false,
          pinned: input.pinned ?? false,
          currentVersion: 1,
          versionHistory: [],
          abTest: input.abTest,
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({ prompts: [...state.prompts, prompt] }))
        return prompt
      },

      updatePrompt: (input) => {
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === input.id ? { ...p, ...input, updatedAt: Date.now() } : p
          )
        }))
      },

      deletePrompt: (id) => {
        set((state) => ({
          prompts: state.prompts.filter((p) => p.id !== id),
          selectedPromptId: state.selectedPromptId === id ? null : state.selectedPromptId
        }))
      },

      selectPrompt: (id) => set({ selectedPromptId: id }),

      getPrompt: (id) => get().prompts.find((p) => p.id === id),

      importPrompts: (prompts) => {
        set((state) => {
          const existingIds = new Set(state.prompts.map((p) => p.id))
          const newPrompts = prompts.filter((p) => !existingIds.has(p.id))
          return { prompts: [...state.prompts, ...newPrompts] }
        })
      },

      exportPrompts: () => get().prompts,

      // ==================== 标签与分类 ====================

      getAllTags: () => {
        const allTags = new Set<string>()
        for (const p of get().prompts) {
          for (const tag of p.tags) {
            allTags.add(tag)
          }
        }
        return Array.from(allTags).sort()
      },

      getPromptsByTag: (tag) => {
        return get().prompts.filter((p) => p.tags.includes(tag))
      },

      getPromptsByCategory: (category) => {
        return get().prompts.filter((p) => p.category === category)
      },

      // ==================== 收藏与置顶 ====================

      toggleFavorite: (id) => {
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === id ? { ...p, favorite: !p.favorite, updatedAt: Date.now() } : p
          )
        }))
      },

      togglePinned: (id) => {
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === id ? { ...p, pinned: !p.pinned, updatedAt: Date.now() } : p
          )
        }))
      },

      // ==================== 版本管理 ====================

      savePromptVersion: (id, label) => {
        const prompt = get().prompts.find((p) => p.id === id)
        if (!prompt) return

        const snapshot = PromptVersionService.createSnapshot(prompt, label)
        const updatedHistory = PromptVersionService.appendVersion(prompt.versionHistory, snapshot)

        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === id
              ? {
                  ...p,
                  currentVersion: snapshot.version,
                  versionHistory: updatedHistory,
                  updatedAt: Date.now(),
                }
              : p
          )
        }))
      },

      rollbackPromptVersion: (promptId, versionId) => {
        const prompt = get().prompts.find((p) => p.id === promptId)
        if (!prompt) return

        const version = prompt.versionHistory.find((v) => v.id === versionId)
        if (!version) return

        const rolledBack = PromptVersionService.rollback(version)

        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === promptId
              ? { ...p, ...rolledBack, updatedAt: Date.now() }
              : p
          )
        }))
      },

      // ==================== A/B 测试 ====================

      setPromptABTest: (promptId, test) => {
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === promptId
              ? {
                  ...p,
                  abTest: { ...test, id: uuidv4(), createdAt: Date.now() },
                  updatedAt: Date.now(),
                }
              : p
          )
        }))
      },

      removePromptABTest: (promptId) => {
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === promptId
              ? { ...p, abTest: undefined, updatedAt: Date.now() }
              : p
          )
        }))
      },

      // ==================== 提示词链 ====================
      promptChains: [],

      createPromptChain: (input) => {
        const chain: PromptChain = {
          ...input,
          id: uuidv4(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((state) => ({ promptChains: [...state.promptChains, chain] }))
        return chain
      },

      updatePromptChain: (input) => {
        set((state) => ({
          promptChains: state.promptChains.map((c) =>
            c.id === input.id ? { ...c, ...input, updatedAt: Date.now() } : c
          )
        }))
      },

      deletePromptChain: (id) => {
        set((state) => ({
          promptChains: state.promptChains.filter((c) => c.id !== id)
        }))
      },
    }),
    {
      name: 'agents',
      version: STORE_VERSIONS.AGENTS,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as {
          agents: AgentProfile[]
          prompts: Prompt[]
          promptChains?: PromptChain[]
        }
        if (version < 1) {
          // 确保所有已有 Agent 的 enabledToolIds 包含全部工具
          const allIds = new Set(DEFAULT_ALL_TOOL_IDS)
          state.agents = state.agents.map((agent) => {
            const existingIds = new Set(agent.enabledToolIds)
            const hasAllTools = Array.from(allIds).every((id) => existingIds.has(id))
            if (hasAllTools) return agent
            return {
              ...agent,
              enabledToolIds: Array.from(new Set([...agent.enabledToolIds, ...DEFAULT_ALL_TOOL_IDS]))
            }
          })

          // 确保所有 Prompt 具有新字段默认值
          state.prompts = state.prompts.map((p) => migratePrompt(p as unknown as Record<string, unknown>))

          // 确保 promptChains 存在
          if (!state.promptChains) {
            state.promptChains = []
          }
        }
        if (version < 2) {
          // v2: 已废弃 —— Leader Agent 不再存于全局 agent-store，迁移由 workspace-agent-store 负责
        }
        if (version < 3) {
          // v3 (Phase 4): 为旧 AgentProfile 补充 Phase 4 新增字段的默认值
          // 新增可选字段：promptSections / promptTemplateId / variables / workflow
          //              contextPolicy / approvalPolicy / maxParallelSubtasks
          // 这些均为可选字段，引擎在缺失时使用默认逻辑；此处仅防御性填充数值类字段
          state.agents = state.agents.map((agent) => ({
            ...agent,
            maxParallelSubtasks: agent.maxParallelSubtasks ?? 3,
          }))
        }
        if (version < 4) {
          // v4 (Phase 6): 补充 Agent 作用域，旧数据默认视为全局 Agent。
          state.agents = state.agents.map((agent) => ({
            ...agent,
            scope: agent.scope ?? 'global',
          }))
        }
        return state
      },
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            // 确保默认 Agent 存在（需要读取其他 store，放 onRehydrateStorage）
            if (!state.agents.some((a) => a.id === DEFAULT_AGENT_ID)) {
              const defaultAgent = { ...createDefaultRequirementAnalyst(), scope: 'global' as const }
              state.agents = [...state.agents, defaultAgent]
            }
            // 确保网站分析 Agent 存在
            if (!state.agents.some((a) => a.id === WEBSITE_ANALYZER_AGENT_ID)) {
              const websiteAnalyzer = { ...createDefaultWebsiteAnalyzer(), scope: 'global' as const }
              state.agents = [...state.agents, websiteAnalyzer]
            }
            // ★ 已废弃：AI 领导现已完全工作区化，不再存于全局 agent-store
            //    迁移逻辑在 workspace-agent-store.loadWorkspaceAgents 中处理
          }
        }
      }
    }
  )
)

// 保留旧名称的兼容导出
/** @deprecated 使用 useAgentStore 代替 */
export const usePromptStore = useAgentStore
