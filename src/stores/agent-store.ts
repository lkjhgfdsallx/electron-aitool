import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import type {
  AgentProfile,
  AgentProfileCreateInput,
  AgentProfileUpdateInput,
  Prompt,
  PromptCreateInput,
  PromptUpdateInput
} from '../types'
import { DEFAULT_AGENT_ID, REQUIREMENT_ANALYST_PROMPT, WEBSITE_ANALYZER_AGENT_ID, WEBSITE_ANALYZER_PROMPT } from '../constants/default-agents'
import { BUILT_IN_TOOLS, AGENT_BUILTIN_TOOLS } from '../services/built-in-tools'

// ==================== 默认 Agent 配置 ====================

// 默认选中所有工具的 ID
const DEFAULT_ALL_TOOL_IDS = [...BUILT_IN_TOOLS, ...AGENT_BUILTIN_TOOLS].map((t) => t.id)

const DEFAULT_AGENT_PROFILE: Omit<AgentProfile, 'id' | 'name' | 'description' | 'systemPrompt' | 'createdAt' | 'updatedAt'> = {
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
    createdAt: Date.now(),
    updatedAt: Date.now()
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
  toggleAgentEnabled: (id: string) => void
  duplicateAgent: (id: string) => AgentProfile | undefined
  importAgents: (agents: AgentProfile[]) => void
  exportAgents: () => AgentProfile[]

  // Prompt Actions（向后兼容）
  prompts: Prompt[]
  selectedPromptId: string | null
  createPrompt: (input: PromptCreateInput) => Prompt
  updatePrompt: (input: PromptUpdateInput) => void
  deletePrompt: (id: string) => void
  selectPrompt: (id: string | null) => void
  getPrompt: (id: string) => Prompt | undefined
  importPrompts: (prompts: Prompt[]) => void
  exportPrompts: () => Prompt[]
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

      // ==================== Prompt State（向后兼容） ====================
      prompts: [],
      selectedPromptId: null,

      createPrompt: (input) => {
        const prompt: Prompt = {
          ...input,
          id: uuidv4(),
          createdAt: Date.now(),
          updatedAt: Date.now()
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

      exportPrompts: () => get().prompts
    }),
    {
      name: 'agents',
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            // 确保默认 Agent 存在
            if (!state.agents.some((a) => a.id === DEFAULT_AGENT_ID)) {
              const defaultAgent = createDefaultRequirementAnalyst()
              state.agents = [...state.agents, defaultAgent]
            }
            // 确保网站分析 Agent 存在
            if (!state.agents.some((a) => a.id === WEBSITE_ANALYZER_AGENT_ID)) {
              const websiteAnalyzer = createDefaultWebsiteAnalyzer()
              state.agents = [...state.agents, websiteAnalyzer]
            }
            // 迁移：确保所有已有 Agent 的 enabledToolIds 包含全部工具
            // （之前 agent-builtin 工具是硬编码始终可用的，移除硬编码后需要补充到配置中）
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
          }
        }
      }
    }
  )
)

// 保留旧名称的兼容导出
/** @deprecated 使用 useAgentStore 代替 */
export const usePromptStore = useAgentStore
