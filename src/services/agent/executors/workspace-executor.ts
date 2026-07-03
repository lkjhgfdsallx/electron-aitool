/**
 * WorkspaceToolExecutor - 工作区工具执行器
 *
 * 处理所有 workspace_* 工具：
 * - workspace_read_file
 * - workspace_write_file
 * - workspace_list_files
 * - workspace_execute_command
 * - workspace_dispatch_task
 * - workspace_create_agent
 *
 * 从 agent-engine.ts 的各 handleWorkspace* 函数拆出。
 */

import { workspaceFsService } from '../../workspace-fs-service'
import { WORKSPACE_TOOLS } from '../../built-in-tools'
import { isToolAutoApproved } from '../../tool-group-service'
import { useWorkspaceMessageStore } from '../../../stores/workspace-message-store'
import { useWorkspaceAgentStore } from '../../../stores/workspace-agent-store'
import { useAgentStore } from '../../../stores/agent-store'
import { useWorkspaceStore } from '../../../stores/workspace-store'
import { useAIProviderStore } from '../../../stores/ai-provider-store'
import { useCustomToolStore } from '../../../stores/custom-tool-store'
import { BUILT_IN_TOOLS, AGENT_BUILTIN_TOOLS } from '../../built-in-tools'
import { runAgent } from '../../agent-engine'
import type { ToolExecutor, AgentSessionContext, ToolSessionContext } from '../tool-executor'
import type {
  ToolExecuteResult,
  Tool,
  AgentStep,
  AutoApprovalConfig,
} from '../../../types'
import type {
  WorkspaceContext,
  CreateAgentInput,
  FileActionApprovalRequest,
  FileActionApprovalResult,
} from '../../agent-engine'

export class WorkspaceToolExecutor implements ToolExecutor {
  readonly toolNames = [
    'workspace_read_file',
    'workspace_write_file',
    'workspace_list_files',
    'workspace_execute_command',
    'workspace_dispatch_task',
    'workspace_create_agent',
    'workspace_dispatch_parallel', // Phase 3: 并行子任务派发
  ]

  createContext(_sessionCtx: AgentSessionContext): ToolSessionContext {
    return {}
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    _sessionCtx: ToolSessionContext,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    switch (toolName) {
      case 'workspace_read_file':
        return this.handleReadFile(args, agentSessionCtx)
      case 'workspace_write_file':
        return this.handleWriteFile(args, agentSessionCtx)
      case 'workspace_list_files':
        return this.handleListFiles(args, agentSessionCtx)
      case 'workspace_execute_command':
        return this.handleExecuteCommand(args, agentSessionCtx)
      case 'workspace_dispatch_task':
        return this.handleDispatchTask(args, agentSessionCtx)
      case 'workspace_create_agent':
        return this.handleCreateAgent(args, agentSessionCtx)
      case 'workspace_dispatch_parallel':
        return this.handleDispatchParallel(args, agentSessionCtx)
      default:
        return { success: false, data: '', error: `WorkspaceToolExecutor: 未知工具 "${toolName}"` }
    }
  }

  // ---- 辅助函数 ----

  /** 解析工作区相对路径为绝对路径 */
  private resolveWorkspacePath(relativePath: string, wsCtx: WorkspaceContext): string {
    const cleaned = relativePath.replace(/^\.[/\\]/, '').replace(/^[/\\]+/, '')
    const base = wsCtx.folderPath.replace(/[/\\]+$/, '')
    return cleaned ? `${base}/${cleaned}` : base
  }

  /** 检查文件操作是否需要人工审批 */
  private async checkFileActionApproval(
    toolId: string,
    filePath: string,
    wsCtx: WorkspaceContext,
    agentSessionCtx: AgentSessionContext,
    contentPreview?: string,
  ): Promise<boolean> {
    if (!wsCtx.autoApproval) return true

    // 构造临时 Tool 对象用于 isToolAutoApproved
    const tool: Tool = {
      id: toolId,
      name: toolId,
      description: '',
      parameters: {},
      isBuiltIn: true,
      isMCP: false,
      enabled: true,
    }

    if (isToolAutoApproved(tool, wsCtx.autoApproval)) {
      return true
    }

    if (!wsCtx.onFileActionApproval) {
      return false
    }

    const riskLevel = toolId === 'workspace:write_file' ? 'medium' : 'low'
    const request: FileActionApprovalRequest = {
      id: `fa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      actionType: toolId === 'workspace:write_file' ? 'write-file'
        : toolId === 'workspace:read_file' ? 'read-file'
        : 'list-files',
      toolName: toolId,
      filePath,
      contentPreview: contentPreview ? contentPreview.slice(0, 500) : undefined,
      riskLevel,
      agentId: agentSessionCtx.agentId,
      agentName: agentSessionCtx.agentName,
      timestamp: Date.now(),
    }

    const result = await wsCtx.onFileActionApproval(request)
    if (result === 'denied') {
      return false
    }
    if (result === 'approved-always' && wsCtx.autoApproval) {
      if (toolId === 'workspace:write_file') {
        wsCtx.autoApproval.writeFiles = true
      } else if (toolId === 'workspace:read_file') {
        wsCtx.autoApproval.readFiles = true
      } else if (toolId === 'workspace:list_files') {
        wsCtx.autoApproval.listFiles = true
      }
    }
    return true
  }

  // ---- 工具处理函数 ----

  private async handleReadFile(
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    const wsCtx = agentSessionCtx.workspace
    if (!wsCtx) return { success: false, data: '', error: '当前对话未关联工作区' }
    const relativePath = String(args.file_path ?? '')
    if (!relativePath) return { success: false, data: '', error: '需要 file_path 参数' }
    try {
      const readTool = WORKSPACE_TOOLS.find((t) => t.id === 'workspace:read_file')
      if (readTool) {
        const approved = await this.checkFileActionApproval('workspace:read_file', relativePath, wsCtx, agentSessionCtx)
        if (!approved) {
          return { success: false, data: '', error: '用户拒绝了读取文件操作' }
        }
      }
      const absolutePath = this.resolveWorkspacePath(relativePath, wsCtx)
      const result = await workspaceFsService.readFile(absolutePath)
      if (result.success && result.content !== undefined) {
        return {
          success: true,
          data: JSON.stringify({
            file_path: relativePath,
            absolute_path: absolutePath,
            content: result.content,
            truncated: result.truncated,
            total_size: result.totalSize,
          }),
        }
      }
      return { success: false, data: '', error: result.error || '读取文件失败' }
    } catch (e) {
      return { success: false, data: '', error: e instanceof Error ? e.message : '读取文件失败' }
    }
  }

  private async handleWriteFile(
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    const wsCtx = agentSessionCtx.workspace
    if (!wsCtx) return { success: false, data: '', error: '当前对话未关联工作区' }
    const relativePath = String(args.file_path ?? '')
    const content = String(args.content ?? '')
    if (!relativePath) return { success: false, data: '', error: '需要 file_path 参数' }
    if (content === '') return { success: false, data: '', error: '需要 content 参数' }
    try {
      const writeTool = WORKSPACE_TOOLS.find((t) => t.id === 'workspace:write_file')
      if (writeTool) {
        const approved = await this.checkFileActionApproval('workspace:write_file', relativePath, wsCtx, agentSessionCtx, content)
        if (!approved) {
          return { success: false, data: '', error: '用户拒绝了写入文件操作' }
        }
      }
      const absolutePath = this.resolveWorkspacePath(relativePath, wsCtx)
      await workspaceFsService.writeFile(absolutePath, content)
      // 记录产物路径
      if (!agentSessionCtx.artifacts.includes(relativePath)) {
        agentSessionCtx.artifacts.push(relativePath)
      }
      return {
        success: true,
        data: JSON.stringify({
          file_path: relativePath,
          absolute_path: absolutePath,
          bytes_written: new TextEncoder().encode(content).byteLength,
          message: `文件 ${relativePath} 已成功写入`,
        }),
      }
    } catch (e) {
      return { success: false, data: '', error: e instanceof Error ? e.message : '写入文件失败' }
    }
  }

  private async handleListFiles(
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    const wsCtx = agentSessionCtx.workspace
    if (!wsCtx) return { success: false, data: '', error: '当前对话未关联工作区' }
    const dirPath = String(args.dir_path ?? '.')
    try {
      const absolutePath = this.resolveWorkspacePath(dirPath, wsCtx)
      const entries = await workspaceFsService.readDir(absolutePath)
      return {
        success: true,
        data: JSON.stringify({
          dir_path: dirPath,
          entries: entries.map((e) => ({
            name: e.name,
            path: e.path,
            is_directory: e.isDirectory,
            size: e.size,
            ext: e.ext,
          })),
          count: entries.length,
        }),
      }
    } catch (e) {
      return { success: false, data: '', error: e instanceof Error ? e.message : '读取目录失败' }
    }
  }

  private async handleExecuteCommand(
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    const wsCtx = agentSessionCtx.workspace
    if (!wsCtx) return { success: false, data: '', error: '当前对话未关联工作区' }
    const command = String(args.command ?? '')
    if (!command) return { success: false, data: '', error: '需要 command 参数' }
    try {
      const { addTerminalLog } = useWorkspaceMessageStore.getState()
      addTerminalLog(wsCtx.workspaceId, {
        type: 'command',
        content: `[${agentSessionCtx.agentName}] $ ${command}`,
      })

      if (typeof window !== 'undefined' && window.electronAPI?.workspace?.command?.execute) {
        const commandId = `agent-cmd-${Date.now()}`
        const result = await window.electronAPI.workspace.command.execute({
          commandId,
          command,
          workingDir: wsCtx.folderPath,
          timeoutMs: 60000,
        })
        if (result.success) {
          addTerminalLog(wsCtx.workspaceId, {
            type: 'system',
            content: `✓ 命令完成 (exit: ${result.exitCode}, ${result.durationMs}ms)`,
          })
          return {
            success: true,
            data: JSON.stringify({
              command,
              exit_code: result.exitCode,
              stdout: result.stdout?.slice(0, 8000) || '',
              stderr: result.stderr?.slice(0, 4000) || '',
              duration_ms: result.durationMs,
            }),
          }
        }
        addTerminalLog(wsCtx.workspaceId, {
          type: 'stderr',
          content: `✗ 命令失败 (exit: ${result.exitCode}): ${result.error || '未知错误'}`,
        })
        return {
          success: false,
          data: JSON.stringify({
            command,
            exit_code: result.exitCode,
            stdout: result.stdout?.slice(0, 4000) || '',
            stderr: result.stderr?.slice(0, 4000) || '',
          }),
          error: result.error || '命令执行失败',
        }
      }
      return { success: false, data: '', error: '命令执行功能仅在 Electron 环境中可用' }
    } catch (e) {
      const { addTerminalLog } = useWorkspaceMessageStore.getState()
      if (wsCtx) {
        addTerminalLog(wsCtx.workspaceId, {
          type: 'stderr',
          content: `✗ 命令异常: ${e instanceof Error ? e.message : '命令执行失败'}`,
        })
      }
      return { success: false, data: '', error: e instanceof Error ? e.message : '命令执行失败' }
    }
  }

  private async handleDispatchTask(
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    const wsCtx = agentSessionCtx.workspace
    if (!wsCtx) return { success: false, data: '', error: '当前对话未关联工作区' }
    const agentId = String(args.agent_id ?? '')
    const taskDescription = String(args.task_description ?? '')
    if (!agentId) return { success: false, data: '', error: '需要 agent_id 参数' }
    if (!taskDescription) return { success: false, data: '', error: '需要 task_description 参数' }

    const targetAgent = wsCtx.teamAgents.find((a) => a.id === agentId)
    if (!targetAgent) {
      const availableList = wsCtx.teamAgents.map((a) => `${a.name}(${a.id})`).join('、')
      return {
        success: false,
        data: '',
        error: `Agent "${agentId}" 不在当前工作区团队中。可用的团队成员：${availableList || '无'}`,
      }
    }

    if (!wsCtx.dispatchSubTask) {
      return {
        success: false,
        data: '',
        error: '子任务分派功能不可用（dispatchSubTask 未注入）。请检查工作区配置。',
      }
    }

    try {
      const contextSummary = args.context_summary ? String(args.context_summary) : undefined
      const resultJson = await wsCtx.dispatchSubTask(agentId, taskDescription, contextSummary)
      let parsed: unknown = resultJson
      try { parsed = JSON.parse(resultJson) } catch { /* 保持原始字符串 */ }

      // 增强4：附加子 Agent 工具能力摘要，让 Leader 感知子 Agent 的能力边界
      const agentToolIds = targetAgent.enabledToolIds ?? []
      const toolCapabilitySummary = agentToolIds.length > 0
        ? agentToolIds.join(', ')
        : '无工具'

      return {
        success: true,
        data: JSON.stringify({
          dispatched_to: targetAgent.name,
          agent_id: agentId,
          task: taskDescription,
          context_summary_provided: Boolean(contextSummary),
          agent_tool_capabilities: toolCapabilitySummary,
          result: parsed,
        }),
      }
    } catch (err) {
      return {
        success: false,
        data: '',
        error: `子任务执行失败: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  /**
   * Phase 3: 并行分派多个子任务
   *
   * 利用 WorkspaceContext.dispatchTasks（由 use-chat.ts 注入的并行版本），
   * 一次分派多个子任务，引擎用 Promise.all 并行执行。
   * 支持依赖拓扑调度：dependsOnIndexes 指定的任务会等待前置完成后再执行。
   *
   * 如果 dispatchTasks 未注入，降级为串行调用 dispatchSubTask。
   */
  private async handleDispatchParallel(
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    const wsCtx = agentSessionCtx.workspace
    if (!wsCtx) return { success: false, data: '', error: '当前对话未关联工作区' }

    const rawTasks = Array.isArray(args.tasks) ? args.tasks as unknown[] : []
    if (rawTasks.length === 0) {
      return { success: false, data: '', error: 'dispatch_parallel 工具需要 tasks 参数（至少一个子任务）' }
    }

    // 解析子任务列表
    const tasks = rawTasks.map((raw, i) => {
      const r = raw as Record<string, unknown>
      const agentId = String(r?.agent_id ?? '')
      const taskDescription = String(r?.task_description ?? '')
      const contextSummary = r?.context_summary ? String(r.context_summary) : undefined
      const dependsOnIndexes = Array.isArray(r?.depends_on_indexes)
        ? (r.depends_on_indexes as unknown[]).map((n) => Number(n))
        : []
      return { agentId, task: taskDescription, context: contextSummary, dependsOnIndexes, index: i }
    })

    // 校验：所有 agent_id 必须在团队中
    for (const t of tasks) {
      if (!t.agentId) {
        return { success: false, data: '', error: `第 ${t.index + 1} 个子任务缺少 agent_id` }
      }
      if (!t.task) {
        return { success: false, data: '', error: `第 ${t.index + 1} 个子任务缺少 task_description` }
      }
      const exists = wsCtx.teamAgents.find((a) => a.id === t.agentId)
      if (!exists) {
        const availableList = wsCtx.teamAgents.map((a) => `${a.name}(${a.id})`).join('、')
        return {
          success: false,
          data: '',
          error: `第 ${t.index + 1} 个子任务的 Agent "${t.agentId}" 不在团队中。可用成员: ${availableList || '无'}`,
        }
      }
    }

    try {
      let results: string[]

      if (wsCtx.dispatchTasks) {
        // 优先使用并行 dispatchTasks
        results = await wsCtx.dispatchTasks(
          tasks.map((t) => ({
            agentId: t.agentId,
            task: t.task,
            context: t.context,
            dependsOnIndexes: t.dependsOnIndexes,
          })),
        )
      } else if (wsCtx.dispatchSubTask) {
        // 降级：串行执行（向后兼容）
        results = []
        for (const t of tasks) {
          const r = await wsCtx.dispatchSubTask(t.agentId, t.task, t.context)
          results.push(r)
        }
      } else {
        return {
          success: false,
          data: '',
          error: '子任务分派功能不可用（dispatchTasks 和 dispatchSubTask 均未注入）。',
        }
      }

      // 解析结果（增强4：附加子 Agent 工具能力摘要）
      const parsedResults = results.map((r, i) => {
        let parsed: unknown = r
        try { parsed = JSON.parse(r) } catch { /* 保持原始字符串 */ }
        const agentInfo = wsCtx.teamAgents.find((a) => a.id === tasks[i].agentId)
        const agentToolIds = agentInfo?.enabledToolIds ?? []
        return {
          task_index: i + 1,
          agent: tasks[i].agentId,
          task: tasks[i].task,
          agent_tool_capabilities: agentToolIds.length > 0 ? agentToolIds.join(', ') : '无工具',
          result: parsed,
        }
      })

      return {
        success: true,
        data: JSON.stringify({
          total_tasks: tasks.length,
          executed_in_parallel: Boolean(wsCtx.dispatchTasks),
          results: parsedResults,
        }, null, 2),
      }
    } catch (err) {
      return {
        success: false,
        data: '',
        error: `并行子任务执行失败: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  private async handleCreateAgent(
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    const wsCtx = agentSessionCtx.workspace
    if (!wsCtx) return { success: false, data: '', error: '当前对话未关联工作区' }
    if (!wsCtx.createAgent) {
      return { success: false, data: '', error: '创建 Agent 功能不可用（createAgent 未注入）。' }
    }
    const name = String(args.name ?? '')
    const description = String(args.description ?? '')
    const systemPrompt = String(args.system_prompt ?? '')
    if (!name) return { success: false, data: '', error: '需要 name 参数' }
    if (!description) return { success: false, data: '', error: '需要 description 参数' }
    if (!systemPrompt) return { success: false, data: '', error: '需要 system_prompt 参数' }
    const avatar = args.avatar ? String(args.avatar) : undefined
    const enabledToolIds = Array.isArray(args.enabled_tool_ids) ? args.enabled_tool_ids.map(String) : undefined

    // ---- Phase 4 增强字段提取 ----
    const planningStrategy = typeof args.planning_strategy === 'string' ? (args.planning_strategy as CreateAgentInput['planningStrategy']) : undefined
    const memoryConfig = args.memory_config && typeof args.memory_config === 'object' ? (args.memory_config as CreateAgentInput['memoryConfig']) : undefined
    const termination = args.termination_config && typeof args.termination_config === 'object' ? (args.termination_config as CreateAgentInput['termination']) : undefined
    const modelConfig = args.model_config && typeof args.model_config === 'object' ? (args.model_config as CreateAgentInput['modelConfig']) : undefined
    const knowledgeBaseIds = Array.isArray(args.knowledge_base_ids) ? args.knowledge_base_ids.map(String) : undefined
    const contextPolicy = args.context_policy && typeof args.context_policy === 'object' ? (args.context_policy as CreateAgentInput['contextPolicy']) : undefined
    const approvalPolicy = args.approval_policy && typeof args.approval_policy === 'object' ? (args.approval_policy as CreateAgentInput['approvalPolicy']) : undefined
    const maxParallelSubtasks = typeof args.max_parallel_subtasks === 'number' ? args.max_parallel_subtasks : undefined

    try {
      const agentId = await wsCtx.createAgent({
        name,
        description,
        systemPrompt,
        avatar,
        enabledToolIds,
        planningStrategy,
        memoryConfig,
        termination,
        modelConfig,
        knowledgeBaseIds,
        contextPolicy,
        approvalPolicy,
        maxParallelSubtasks,
      })
      return {
        success: true,
        data: JSON.stringify({
          agent_id: agentId,
          name,
          description,
          message: `Agent "${name}" 已创建并加入工作区团队，可通过 workspace_dispatch_task 分派任务给它。`,
        }),
      }
    } catch (err) {
      return { success: false, data: '', error: `创建 Agent 失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  }
}
