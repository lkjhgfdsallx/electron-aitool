/**
 * useWorkspaceRunState
 *
 * Phase 3：从当前工作区会话消息中派生出团队运行时状态。
 * 轻量 hook，不做持久化，仅用于 Team Runtime 面板和总览组件共享数据。
 *
 * 输出：
 *  - leaderStatus: Leader 当前状态（idle / planning / dispatching / running / summarizing / success / error）
 *  - memberStates: 每个团队成员的运行时状态（status, currentTask, artifacts, errorCount）
 *  - hasActiveRun: 是否有活跃运行
 */

import { useMemo } from 'react'
import type { Message } from '../types'
import type { AgentStep, AgentStepType } from '../types/agent'
import type { AgentProfile } from '../types/agent'

export type LeaderPhase = 'idle' | 'planning' | 'dispatching' | 'running' | 'summarizing' | 'success' | 'error'

export interface MemberRuntimeState {
  agentId: string
  agentName: string
  agentAvatar?: string
  status: 'idle' | 'running' | 'success' | 'error'
  currentTask?: string
  artifactCount: number
  errorCount: number
  stepCount: number
  lastStepType?: AgentStepType
  lastStepTimestamp?: number
}

export interface WorkspaceRunState {
  hasActiveRun: boolean
  leaderStatus: LeaderPhase
  leaderCurrentPhase?: string
  memberStates: MemberRuntimeState[]
  totalSteps: number
  runningCount: number
  errorCount: number
}

/** 从消息列表派生团队运行时状态 */
export function deriveWorkspaceRunState(
  messages: Message[],
  leaderAgentId: string,
  teamAgents: AgentProfile[]
): WorkspaceRunState {
  if (!messages || messages.length === 0) {
    return {
      hasActiveRun: false,
      leaderStatus: 'idle',
      memberStates: teamAgents.map((a) => ({
        agentId: a.id,
        agentName: a.name,
        agentAvatar: a.avatar,
        status: 'idle',
        artifactCount: 0,
        errorCount: 0,
        stepCount: 0,
      })),
      totalSteps: 0,
      runningCount: 0,
      errorCount: 0,
    }
  }

  // 找到当前运行消息（streaming assistant 或最后一条有步骤/计划的 assistant）
  let currentMsg: Message | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'assistant' && (m.isStreaming || (m.agentSteps && m.agentSteps.length > 0) || m.agentPlan)) {
      currentMsg = m
      break
    }
  }

  if (!currentMsg) {
    return {
      hasActiveRun: false,
      leaderStatus: 'idle',
      memberStates: teamAgents.map((a) => ({
        agentId: a.id,
        agentName: a.name,
        agentAvatar: a.avatar,
        status: 'idle',
        artifactCount: 0,
        errorCount: 0,
        stepCount: 0,
      })),
      totalSteps: 0,
      runningCount: 0,
      errorCount: 0,
    }
  }

  const steps = currentMsg.agentSteps ?? []
  const plan = currentMsg.agentPlan
  const isStreaming = !!currentMsg.isStreaming

  // 初始化成员状态
  const memberMap = new Map<string, MemberRuntimeState>()
  for (const a of teamAgents) {
    memberMap.set(a.id, {
      agentId: a.id,
      agentName: a.name,
      agentAvatar: a.avatar,
      status: 'idle',
      artifactCount: 0,
      errorCount: 0,
      stepCount: 0,
    })
  }

  // 遍历步骤，更新成员状态
  let totalSteps = 0
  let leaderStepCount = 0
  let hasDispatch = false
  let hasSubAgentRunning = false
  let totalErrors = 0

  for (const step of steps) {
    totalSteps++

    if (step.sourceAgentId) {
      // 子 Agent 步骤
      let member = memberMap.get(step.sourceAgentId)
      if (!member) {
        // 动态创建的子 Agent，不在预定义团队中
        member = {
          agentId: step.sourceAgentId,
          agentName: step.sourceAgentName || '子 Agent',
          agentAvatar: step.sourceAgentAvatar,
          status: 'idle',
          artifactCount: 0,
          errorCount: 0,
          stepCount: 0,
        }
        memberMap.set(step.sourceAgentId, member)
      }

      member.stepCount++
      member.lastStepType = step.type
      member.lastStepTimestamp = step.timestamp

      if (step.type === 'subtask_result') {
        const sr = step.subtaskResult
        if (sr) {
          if (sr.status === 'error') {
            member.status = 'error'
            member.errorCount++
            totalErrors++
          } else {
            member.status = 'success'
          }
          // 检查产物
          if (sr.artifacts && sr.artifacts.length > 0) {
            member.artifactCount += sr.artifacts.length
          }
          // 提取任务名
          if (sr.task && !member.currentTask) {
            member.currentTask = sr.task
          }
        }
      } else if (step.type === 'action') {
        if (member.status !== 'error') {
          member.status = 'running'
          hasSubAgentRunning = true
        }
      } else if (step.type === 'observation' || step.type === 'thinking') {
        if (member.status !== 'error' && member.status !== 'success') {
          member.status = 'running'
          hasSubAgentRunning = true
        }
      } else if (step.type === 'error') {
        member.status = 'error'
        member.errorCount++
        totalErrors++
      }
    } else {
      // Leader 步骤
      leaderStepCount++

      if (step.type === 'action' && step.toolCall?.name?.includes('dispatch')) {
        hasDispatch = true
      }
    }
  }

  // 推断 Leader 阶段
  let leaderStatus: LeaderPhase = 'idle'
  if (isStreaming) {
    if (plan && plan.status === 'draft') {
      leaderStatus = 'planning'
    } else if (hasDispatch && hasSubAgentRunning) {
      leaderStatus = 'dispatching'
    } else if (hasSubAgentRunning) {
      leaderStatus = 'running'
    } else if (leaderStepCount > 0) {
      leaderStatus = 'running'
    }
  } else {
    // 已完成
    if (totalErrors > 0) {
      leaderStatus = 'error'
    } else {
      leaderStatus = 'success'
    }
  }

  // 如果 Leader 正在汇总子任务结果
  if (isStreaming && !hasSubAgentRunning && hasDispatch && leaderStepCount > 0) {
    leaderStatus = 'summarizing'
  }

  const memberStates = Array.from(memberMap.values())
  const runningCount = memberStates.filter((m) => m.status === 'running').length

  return {
    hasActiveRun: isStreaming || (plan && plan.status === 'executing') || runningCount > 0,
    leaderStatus,
    leaderCurrentPhase: leaderStatus !== 'idle' ? leaderStatus : undefined,
    memberStates,
    totalSteps,
    runningCount,
    errorCount: totalErrors,
  }
}

/**
 * React Hook：从当前工作区消息派生团队运行时状态
 */
export function useWorkspaceRunState(
  messages: Message[],
  leaderAgentId: string,
  teamAgents: AgentProfile[]
): WorkspaceRunState {
  return useMemo(
    () => deriveWorkspaceRunState(messages, leaderAgentId, teamAgents),
    [messages, leaderAgentId, teamAgents]
  )
}
