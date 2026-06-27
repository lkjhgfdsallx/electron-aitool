/**
 * 工作区命令执行服务（渲染进程）
 *
 * 封装命令执行流程：风险评估 → 策略匹配 → 审批 → 执行。
 * 与 workspace-store 的审批机制配合，实现完整的命令审批流。
 */

import { useWorkspaceStore } from '../stores/workspace-store'
import { workspaceVCSService } from './workspace-vcs-service'
import type {
  CommandPolicy,
  CommandRiskLevel,
  CommandApprovalResult,
  CommandApprovalRequest,
} from '../types'
import { v4 as uuidv4 } from 'uuid'

const api = () => window.electronAPI

// ---- 命令执行结果 ----

export interface CommandExecuteResult {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  error?: string
  durationMs: number
  /** 是否被用户拒绝 */
  denied?: boolean
}

// ---- 命令执行服务 ----

export const workspaceCommandExecutor = {
  /**
   * 执行命令（完整审批流程）
   *
   * 流程：
   * 1. 检查命令是否在黑名单 → 拒绝
   * 2. 评估风险等级
   * 3. 根据审批策略决定是否需要审批
   * 4. 命令执行前自动创建 pre-command 存档点
   * 5. 通过 Electron IPC 在主进程中执行命令
   * 6. 返回执行结果
   */
  async executeCommand(
    command: string,
    workingDir: string,
    workspaceId: string,
    policy: CommandPolicy,
    options: {
      safeCommandWhitelist?: string[]
      commandBlacklist?: string[]
      timeoutMs?: number
      env?: Record<string, string>
      agentId?: string
      agentName?: string
      /** 跳过审批（已经审批过的） */
      skipApproval?: boolean
    } = {}
  ): Promise<CommandExecuteResult> {
    const {
      safeCommandWhitelist = [],
      commandBlacklist = [],
      timeoutMs,
      env,
      agentId,
      agentName,
      skipApproval = false,
    } = options

    const commandBase = command.trim().split(/\s+/)[0]?.toLowerCase() || ''

    // ---- 1. 黑名单检查 ----
    if (this.isBlacklisted(command, commandBlacklist)) {
      return {
        success: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        error: `命令 "${commandBase}" 在黑名单中，已拒绝执行`,
        durationMs: 0,
        denied: true,
      }
    }

    // ---- 2. 风险评估 ----
    const riskLevel = await api().workspace.command.assessRisk(command)

    // ---- 3. 审批流程 ----
    if (!skipApproval) {
      const approvalResult = await this.handleApproval(
        command,
        workingDir,
        riskLevel,
        policy,
        safeCommandWhitelist,
        agentId,
        agentName
      )

      if (approvalResult === 'denied' || approvalResult === 'denied-always') {
        return {
          success: false,
          exitCode: null,
          stdout: '',
          stderr: '',
          error: '命令执行被用户拒绝',
          durationMs: 0,
          denied: true,
        }
      }
    }

    // ---- 4. 创建 pre-command 存档点 ----
    try {
      const store = useWorkspaceStore.getState()
      const workspace = store.getActiveWorkspace()
      if (workspace) {
        await workspaceVCSService.createCheckpoint({
          folderPath: workspace.folderPath,
          description: `命令执行前存档：${command.length > 60 ? command.slice(0, 60) + '...' : command}`,
          type: 'pre-command',
          workspaceId: workspace.id,
        })
      }
    } catch (err) {
      console.warn('[workspace-command] 创建 pre-command 存档失败:', err)
      // 不阻止命令执行
    }

    // ---- 5. 执行命令 ----
    const commandId = `cmd-${uuidv4().slice(0, 8)}`
    const result = await api().workspace.command.execute({
      commandId,
      command,
      workingDir,
      timeoutMs,
      env,
    })

    return result
  },

  /**
   * 处理审批流程
   */
  async handleApproval(
    command: string,
    workingDir: string,
    riskLevel: CommandRiskLevel,
    policy: CommandPolicy,
    whitelist: string[],
    agentId?: string,
    agentName?: string
  ): Promise<CommandApprovalResult> {
    const commandBase = command.trim().split(/\s+/)[0]?.toLowerCase() || ''

    // auto-approve-all 策略：全部自动批准
    if (policy === 'auto-approve-all') {
      return 'approved-once'
    }

    // auto-approve-safe 策略：安全命令自动批准
    if (policy === 'auto-approve-safe' && riskLevel === 'safe') {
      return 'approved-once'
    }

    // 检查是否在白名单中（auto-approve-safe 策略下自动批准）
    if (policy === 'auto-approve-safe' && this.isWhitelisted(commandBase, whitelist)) {
      return 'approved-once'
    }

    // 需要用户审批
    const matchedRule = this.getMatchedRuleDescription(command, policy, whitelist)

    const request: CommandApprovalRequest = {
      id: uuidv4(),
      command,
      workingDir,
      riskLevel,
      matchedRule,
      agentId,
      agentName,
      timestamp: Date.now(),
    }

    // 通过 store 发起审批请求，等待用户在 UI 中操作
    const store = useWorkspaceStore.getState()
    return store.requestCommandApproval(request)
  },

  /**
   * 中止正在执行的命令
   */
  async abortCommand(commandId: string): Promise<{ success: boolean; error?: string }> {
    return api().workspace.command.abort(commandId)
  },

  /**
   * 获取正在执行的命令列表
   */
  async getRunningCommands(): Promise<Array<{ commandId: string; startTime: number; runningTime: number }>> {
    return api().workspace.command.running()
  },

  /**
   * 检查命令是否在黑名单中
   */
  isBlacklisted(command: string, blacklist: string[]): boolean {
    const cmdLower = command.trim().toLowerCase()
    return blacklist.some((pattern) => {
      const patternLower = pattern.toLowerCase().trim()
      return cmdLower.includes(patternLower) || cmdLower.startsWith(patternLower)
    })
  },

  /**
   * 检查命令基础名是否在白名单中
   */
  isWhitelisted(commandBase: string, whitelist: string[]): boolean {
    return whitelist.some((w) => w.toLowerCase().trim() === commandBase)
  },

  /**
   * 获取匹配的规则描述
   */
  getMatchedRuleDescription(
    command: string,
    policy: CommandPolicy,
    whitelist: string[]
  ): string {
    const commandBase = command.trim().split(/\s+/)[0]?.toLowerCase() || ''

    if (this.isBlacklisted(command, [])) {
      return '命令在黑名单中'
    }

    if (this.isWhitelisted(commandBase, whitelist)) {
      return `命令 "${commandBase}" 在白名单中`
    }

    switch (policy) {
      case 'all-need-approval':
        return '所有命令均需审批'
      case 'auto-approve-safe':
        return `命令 "${commandBase}" 不在白名单中，需要审批`
      case 'auto-approve-all':
        return '全部自动批准'
      default:
        return '需要审批'
    }
  },
}
