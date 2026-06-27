/**
 * 工作区终端日志 Store
 *
 * 仅维护工作区的终端日志历史，与全局 ConversationStore 解耦。
 * 对话消息已统一由 ConversationStore 管理（通过 workspaceId 关联）。
 */

import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

// ---- 稳定的空数组引用（避免 Zustand selector 中 [] !== [] 导致无限重渲染） ----
const EMPTY_TERMINAL_LOGS: TerminalLog[] = []

/** 导出稳定的空数组引用，供组件层直接使用 */
export { EMPTY_TERMINAL_LOGS }

// ---- 终端日志类型 ----

export interface TerminalLog {
  id: string
  type: 'stdout' | 'stderr' | 'command' | 'system'
  content: string
  timestamp: number
  approvalRequestId?: string
}

// ---- Store 接口 ----

interface WorkspaceTerminalStore {
  /** workspaceId -> 终端日志 */
  terminalHistory: Record<string, TerminalLog[]>

  // ---- 终端日志操作 ----
  /** 添加终端日志 */
  addTerminalLog: (workspaceId: string, log: Omit<TerminalLog, 'id' | 'timestamp'>) => void
  /** 获取指定工作区的终端日志 */
  getTerminalHistory: (workspaceId: string) => TerminalLog[]
  /** 清除终端历史 */
  clearTerminalHistory: (workspaceId: string) => void
}

// ---- Store 创建 ----

export const useWorkspaceMessageStore = create<WorkspaceTerminalStore>()((set, get) => ({
  // ---- 初始状态 ----
  terminalHistory: {},

  // ---- 终端日志操作 ----
  addTerminalLog: (workspaceId, log) => {
    const fullLog: TerminalLog = {
      ...log,
      id: `tl-${uuidv4().slice(0, 8)}`,
      timestamp: Date.now(),
    }

    set((state) => ({
      terminalHistory: {
        ...state.terminalHistory,
        [workspaceId]: [...(state.terminalHistory[workspaceId] || []), fullLog],
      },
    }))
  },

  getTerminalHistory: (workspaceId: string) => {
    return get().terminalHistory[workspaceId] || EMPTY_TERMINAL_LOGS
  },

  clearTerminalHistory: (workspaceId) => {
    set((state) => ({
      terminalHistory: { ...state.terminalHistory, [workspaceId]: [] },
    }))
  },
}))
