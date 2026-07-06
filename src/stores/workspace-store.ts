import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import { useConversationStore } from './conversation-store'
import { useWorkspaceAgentStore } from './workspace-agent-store'
import type {
  Workspace,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
  CheckpointIndex,
  CommandApprovalRequest,
  CommandApprovalResult,
  AutoApprovalConfig,
} from '../types'
import type { FileActionApprovalRequest, FileActionApprovalResult } from '../services/agent-engine'
import { STORE_VERSIONS } from '../utils/store-migration'

/** 退出工作区时，如果当前对话属于工作区，自动切换到最近的非工作区对话 */
function switchToNonWorkspaceConversation(): void {
  const convStore = useConversationStore.getState()
  const currentConv = convStore.currentConversationId
    ? convStore.conversations.find((c) => c.id === convStore.currentConversationId)
    : null
  if (currentConv?.workspaceId) {
    const nonWorkspaceConvs = convStore.conversations
      .filter((c) => !c.workspaceId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    convStore.selectConversation(nonWorkspaceConvs[0]?.id ?? null)
  }
}

// ---- 命令审批回调存储 ----

/** 待处理的审批回调（不在 persist 范围内） */
let pendingApprovalResolve: ((result: CommandApprovalResult) => void) | null = null

// ---- 文件操作审批回调存储（阶段 1 新增） ----

/** 待处理的文件操作审批回调 */
let pendingFileApprovalResolve: ((result: FileActionApprovalResult) => void) | null = null

// ---- Store 接口 ----

interface WorkspaceStore {
  // ---- 状态 ----
  /** 所有工作区列表 */
  workspaces: Workspace[]
  /** 当前激活的工作区 ID */
  activeWorkspaceId: string | null
  /** 当前打开的工作区 Tab ID 列表（有序） */
  openTabs: string[]
  /** 默认工作区 ID（C7：启动时自动进入） */
  defaultWorkspaceId: string | null
  /** 当前工作区的存档点索引（轻量元数据，从文件系统同步） */
  checkpointIndex: CheckpointIndex[]
  /** 当前待审批的命令请求 */
  pendingCommandApproval: CommandApprovalRequest | null
  /** 是否正在加载存档索引 */
  isLoadingCheckpoints: boolean
  /** 文件监控是否活跃 */
  watcherActive: boolean

  // ---- 工作区 CRUD ----
  /** 创建新工作区 */
  createWorkspace: (input: WorkspaceCreateInput) => Workspace
  /** 更新工作区配置 */
  updateWorkspace: (input: WorkspaceUpdateInput) => void
  /** 删除工作区 */
  deleteWorkspace: (id: string) => void
  /** 获取单个工作区 */
  getWorkspace: (id: string) => Workspace | undefined

  // ---- 激活/退出 ----
  /** 激活工作区（同时打开 Tab） */
  activateWorkspace: (id: string) => void
  /** 退出工作区模式 */
  deactivateWorkspace: () => void
  /** 获取当前激活的工作区 */
  getActiveWorkspace: () => Workspace | undefined

  // ---- 多 Tab 管理 (C1) ----
  /** 切换到指定 Tab */
  switchTab: (id: string) => void
  /** 关闭指定 Tab */
  closeTab: (id: string) => void
  /** 关闭除指定 Tab 以外的所有 Tab */
  closeOtherTabs: (id: string) => void
  /** 关闭所有 Tab */
  closeAllTabs: () => void

  // ---- 默认工作区 (C7) ----
  /** 设置默认工作区 */
  setDefaultWorkspace: (id: string | null) => void

  // ---- 存档索引 ----
  /** 刷新存档索引（从文件系统同步） */
  setCheckpointIndex: (index: CheckpointIndex[]) => void
  /** 添加存档索引条目 */
  addCheckpointIndex: (entry: CheckpointIndex) => void
  /** 设置加载状态 */
  setIsLoadingCheckpoints: (loading: boolean) => void

  // ---- 文件监控 ----
  /** 设置监控状态 */
  setWatcherActive: (active: boolean) => void

  // ---- 命令审批 ----
  /** 发起命令审批请求 */
  requestCommandApproval: (request: CommandApprovalRequest) => Promise<CommandApprovalResult>
  /** 用户审批/拒绝后回调 */
  resolveCommandApproval: (result: CommandApprovalResult) => void
  /** 清除审批请求 */
  clearCommandApproval: () => void

  // ---- 文件操作审批（阶段 1 新增） ----
  /** 当前待审批的文件操作请求 */
  pendingFileActionApproval: FileActionApprovalRequest | null
  /** 发起文件操作审批请求 */
  requestFileActionApproval: (request: FileActionApprovalRequest) => Promise<FileActionApprovalResult>
  /** 用户审批/拒绝文件操作后回调 */
  resolveFileActionApproval: (result: FileActionApprovalResult) => void
  /** 清除文件操作审批请求 */
  clearFileActionApproval: () => void
  /** 更新工作区的自动审批配置 */
  updateAutoApproval: (workspaceId: string, config: Partial<AutoApprovalConfig>) => void

  // ---- 工作区对话管理 ----
  /** 将对话关联到工作区 */
  assignConversationToWorkspace: (conversationId: string, workspaceId: string) => void
  /** 将对话从工作区移出 */
  removeConversationFromWorkspace: (conversationId: string) => void
}

// ---- 默认上下文配置 ----

const defaultContextConfig = {
  maxTokens: 8000,
  compressionEnabled: true,
  compressionThreshold: 90,
  slidingWindow: true,
  overflowRetry: true,
  maxOverflowRetries: 3,
  keepCheckpointBeforeCompression: true,
}

// ---- 默认自动审批配置（阶段 1 新增，参考 ROO CODE Auto-Approve） ----

const defaultAutoApprovalConfig: AutoApprovalConfig = {
  enabled: false,
  readFiles: true,
  listFiles: true,
  writeFiles: false,
  executeSafeCommands: false,
  browser: true,
  mcpTools: false,
}

// ---- Store 创建 ----

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      // ---- 初始状态 ----
      workspaces: [],
      activeWorkspaceId: null,
      openTabs: [],
      defaultWorkspaceId: null,
      checkpointIndex: [],
      pendingCommandApproval: null,
      /** 当前待审批的文件操作请求（阶段 1 新增） */
      pendingFileActionApproval: null as FileActionApprovalRequest | null,
      isLoadingCheckpoints: false,
      watcherActive: false,

      // ---- 工作区 CRUD ----

      createWorkspace: (input: WorkspaceCreateInput) => {
        const now = Date.now()
        const workspace: Workspace = {
          id: uuidv4(),
          name: input.name,
          description: input.description,
          folderPath: input.folderPath,
          leaderAgentId: input.leaderAgentId,
          allowDynamicAgents: input.allowDynamicAgents ?? true,
          teamAgentIds: input.teamAgentIds ?? [],
          checkpointPolicy: input.checkpointPolicy ?? 'auto-before-modify',
          timedIntervalMinutes: input.timedIntervalMinutes ?? 30,
          maxCheckpoints: input.maxCheckpoints ?? 50,
          commandPolicy: input.commandPolicy ?? 'auto-approve-safe',
          commandExecutionEnabled: input.commandExecutionEnabled ?? true,
          safeCommandWhitelist: input.safeCommandWhitelist ?? [
            'npm', 'node', 'git', 'ls', 'dir', 'cat', 'echo', 'pnpm', 'yarn', 'npx',
          ],
          commandBlacklist: input.commandBlacklist ?? [
            'rm -rf /', 'format', 'shutdown', 'mkfs',
          ],
          contextConfig: input.contextConfig ?? defaultContextConfig,
          knowledgeBaseIds: input.knowledgeBaseIds ?? [],
          mcpServerIds: input.mcpServerIds ?? [],
          autoApproval: input.autoApproval ?? { ...defaultAutoApprovalConfig },
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({
          workspaces: [...state.workspaces, workspace],
        }))

        return workspace
      },

      updateWorkspace: (input: WorkspaceUpdateInput) => {
        set((state) => ({
          workspaces: state.workspaces.map((ws) =>
            ws.id === input.id
              ? { ...ws, ...input, updatedAt: Date.now() }
              : ws
          ),
        }))
      },

      deleteWorkspace: (id: string) => {
        set((state) => {
          const newTabs = state.openTabs.filter((t) => t !== id)
          const wasActive = state.activeWorkspaceId === id
          const newActiveId = wasActive
            ? (newTabs.length > 0 ? newTabs[newTabs.length - 1] : null)
            : state.activeWorkspaceId
          return {
            workspaces: state.workspaces.filter((ws) => ws.id !== id),
            openTabs: newTabs,
            activeWorkspaceId: newActiveId,
            checkpointIndex: wasActive ? [] : state.checkpointIndex,
            watcherActive: wasActive ? false : state.watcherActive,
            defaultWorkspaceId: state.defaultWorkspaceId === id ? null : state.defaultWorkspaceId,
            pendingCommandApproval: null,
          }
        })
        // 清除可能残留的审批回调，防止 CommandApprovalDialog 全屏遮罩阻断页面交互
        if (pendingApprovalResolve) {
          pendingApprovalResolve('denied')
          pendingApprovalResolve = null
        }
      },

      getWorkspace: (id: string) => {
        return get().workspaces.find((ws) => ws.id === id)
      },

      // ---- 激活/退出 ----

      activateWorkspace: (id: string) => {
        const workspace = get().workspaces.find((ws) => ws.id === id)
        if (!workspace) return

        set((state) => ({
          activeWorkspaceId: id,
          // 如果 Tab 不在列表中，添加到末尾
          openTabs: state.openTabs.includes(id)
            ? state.openTabs
            : [...state.openTabs, id],
          checkpointIndex: [], // 激活时清空，稍后异步加载
          isLoadingCheckpoints: true,
          watcherActive: false,
        }))

        // 异步加载工作区 Agent（内部会执行静默迁移，创建 leader 实例）
        useWorkspaceAgentStore.getState().loadWorkspaceAgents(workspace.folderPath).then(() => {
          // 加载完成后，同步 leaderAgentId
          const ws = get().workspaces.find((w) => w.id === id)
          if (!ws) return
          const wsAgentStore = useWorkspaceAgentStore.getState()
          const leader = wsAgentStore.getLeaderAgent()
          // 如果工作区的 leaderAgentId 未指向有效的 leader，自动纠正
          if (leader && (ws.leaderAgentId !== leader.id || !ws.leaderAgentId)) {
            get().updateWorkspace({ id, leaderAgentId: leader.id })
          }
        })
      },

      deactivateWorkspace: () => {
        set({
          activeWorkspaceId: null,
          checkpointIndex: [],
          watcherActive: false,
          pendingCommandApproval: null,
        })
        // 清除可能残留的审批回调
        if (pendingApprovalResolve) {
          pendingApprovalResolve('denied')
          pendingApprovalResolve = null
        }
        // 清空工作区 Agent 内存
        useWorkspaceAgentStore.getState().clearWorkspaceAgents()
        // 退出工作区时，切换到最近的非工作区对话
        switchToNonWorkspaceConversation()
      },

      getActiveWorkspace: () => {
        const { workspaces, activeWorkspaceId } = get()
        return workspaces.find((ws) => ws.id === activeWorkspaceId)
      },

      // ---- 多 Tab 管理 (C1) ----

      switchTab: (id: string) => {
        const workspace = get().workspaces.find((ws) => ws.id === id)
        if (!workspace) return

        set({
          activeWorkspaceId: id,
          checkpointIndex: [],
          isLoadingCheckpoints: true,
          watcherActive: false,
          pendingCommandApproval: null,
        })
        // 清除可能残留的审批回调
        if (pendingApprovalResolve) {
          pendingApprovalResolve('denied')
          pendingApprovalResolve = null
        }
        // 切换 Tab 时重新加载目标工作区的 Agent
        useWorkspaceAgentStore.getState().loadWorkspaceAgents(workspace.folderPath)
      },

      closeTab: (id: string) => {
        const state = get()
        const newTabs = state.openTabs.filter((t) => t !== id)
        if (newTabs.length === 0) {
          // 关闭最后一个 Tab → 退出工作区模式
          set({
            openTabs: [],
            activeWorkspaceId: null,
            checkpointIndex: [],
            watcherActive: false,
            pendingCommandApproval: null,
          })
          if (pendingApprovalResolve) {
            pendingApprovalResolve('denied')
            pendingApprovalResolve = null
          }
          // 清空工作区 Agent
          useWorkspaceAgentStore.getState().clearWorkspaceAgents()
          // 退出工作区时，切换到最近的非工作区对话
          switchToNonWorkspaceConversation()
        } else if (state.activeWorkspaceId === id) {
          // 关闭当前 Tab → 切换到最后一个 Tab
          const newActiveId = newTabs[newTabs.length - 1]
          const newActive = state.workspaces.find((ws) => ws.id === newActiveId)
          set({
            openTabs: newTabs,
            activeWorkspaceId: newActiveId,
            checkpointIndex: [],
            isLoadingCheckpoints: true,
            watcherActive: false,
            pendingCommandApproval: null,
          })
          if (pendingApprovalResolve) {
            pendingApprovalResolve('denied')
            pendingApprovalResolve = null
          }
          // 重新加载目标工作区的 Agent
          if (newActive) {
            useWorkspaceAgentStore.getState().loadWorkspaceAgents(newActive.folderPath)
          }
        } else {
          set({ openTabs: newTabs })
        }
      },

      closeOtherTabs: (id: string) => {
        set((state) => ({
          openTabs: [id],
          activeWorkspaceId: id,
          checkpointIndex: state.activeWorkspaceId !== id ? [] : state.checkpointIndex,
          isLoadingCheckpoints: state.activeWorkspaceId !== id,
          watcherActive: state.activeWorkspaceId !== id ? false : state.watcherActive,
        }))
      },

      closeAllTabs: () => {
        set({
          openTabs: [],
          activeWorkspaceId: null,
          checkpointIndex: [],
          watcherActive: false,
          pendingCommandApproval: null,
        })
        if (pendingApprovalResolve) {
          pendingApprovalResolve('denied')
          pendingApprovalResolve = null
        }
        // 清空工作区 Agent
        useWorkspaceAgentStore.getState().clearWorkspaceAgents()
        // 退出工作区时，切换到最近的非工作区对话
        switchToNonWorkspaceConversation()
      },

      // ---- 默认工作区 (C7) ----

      setDefaultWorkspace: (id: string | null) => {
        set({ defaultWorkspaceId: id })
      },

      // ---- 存档索引 ----

      setCheckpointIndex: (index: CheckpointIndex[]) => {
        set({ checkpointIndex: index, isLoadingCheckpoints: false })
      },

      addCheckpointIndex: (entry: CheckpointIndex) => {
        set((state) => ({
          // 按时间倒序插入
          checkpointIndex: [entry, ...state.checkpointIndex].sort(
            (a, b) => b.createdAt - a.createdAt
          ),
        }))
      },

      setIsLoadingCheckpoints: (loading: boolean) => {
        set({ isLoadingCheckpoints: loading })
      },

      // ---- 文件监控 ----

      setWatcherActive: (active: boolean) => {
        set({ watcherActive: active })
      },

      // ---- 命令审批 ----

      requestCommandApproval: (request: CommandApprovalRequest) => {
        set({ pendingCommandApproval: request })

        // 返回 Promise，等待用户在 UI 中审批/拒绝
        return new Promise<CommandApprovalResult>((resolve) => {
          pendingApprovalResolve = resolve
        })
      },

      resolveCommandApproval: (result: CommandApprovalResult) => {
        set({ pendingCommandApproval: null })

        // 回调 Promise
        if (pendingApprovalResolve) {
          pendingApprovalResolve(result)
          pendingApprovalResolve = null
        }
      },

      clearCommandApproval: () => {
        set({ pendingCommandApproval: null })
        if (pendingApprovalResolve) {
          pendingApprovalResolve('denied')
          pendingApprovalResolve = null
        }
      },

      // ---- 文件操作审批（阶段 1 新增，参考 ROO CODE Auto-Approve） ----

      requestFileActionApproval: (request: FileActionApprovalRequest) => {
        set({ pendingFileActionApproval: request })
        return new Promise<FileActionApprovalResult>((resolve) => {
          pendingFileApprovalResolve = resolve
        })
      },

      resolveFileActionApproval: (result: FileActionApprovalResult) => {
        set({ pendingFileActionApproval: null })
        if (pendingFileApprovalResolve) {
          pendingFileApprovalResolve(result)
          pendingFileApprovalResolve = null
        }
      },

      clearFileActionApproval: () => {
        set({ pendingFileActionApproval: null })
        if (pendingFileApprovalResolve) {
          pendingFileApprovalResolve('denied')
          pendingFileApprovalResolve = null
        }
      },

      updateAutoApproval: (workspaceId, config) => {
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId
              ? { ...w, autoApproval: { ...w.autoApproval, ...config }, updatedAt: Date.now() }
              : w
          ),
        }))
      },

      // ---- 工作区对话管理 ----

      assignConversationToWorkspace: (conversationId: string, workspaceId: string) => {
        useConversationStore.getState().setConversationWorkspaceId(conversationId, workspaceId)
      },

      removeConversationFromWorkspace: (conversationId: string) => {
        useConversationStore.getState().removeConversationWorkspaceId(conversationId)
      },
    }),
    {
      name: 'workspace-store',
      version: STORE_VERSIONS.WORKSPACE,
      partialize: (state) => ({
        workspaces: state.workspaces,
        defaultWorkspaceId: state.defaultWorkspaceId,
        // 不持久化 activeWorkspaceId（运行时状态，重启后需重新激活）
        // 不持久化 openTabs（运行时状态，跟随 activeWorkspaceId）
        // 不持久化 checkpointIndex（从文件系统加载）
        // 不持久化 pendingCommandApproval（运行时状态）
        // 不持久化 isLoadingCheckpoints 和 watcherActive（运行时状态）
      }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>
        // v2 → v3: 为旧工作区补充 autoApproval 字段（ROO CODE Auto-Approve）
        if (version < 3) {
          if (!('openTabs' in state)) state.openTabs = []
          if (!('defaultWorkspaceId' in state)) state.defaultWorkspaceId = null
          // 为每个旧工作区补充 autoApproval 默认配置
          const defaultAutoApproval = {
            enabled: false,
            readFiles: true,
            listFiles: true,
            writeFiles: false,
            executeSafeCommands: false,
            browser: true,
            mcpTools: false,
          }
          const workspaces = (state.workspaces as Array<Record<string, unknown>>) || []
          state.workspaces = workspaces.map((w) =>
            w.autoApproval ? w : { ...w, autoApproval: { ...defaultAutoApproval } }
          )
        }
        return state as unknown as WorkspaceStore
      },
    }
  )
)
