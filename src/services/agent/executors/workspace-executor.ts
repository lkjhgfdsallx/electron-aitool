/**
 * WorkspaceToolExecutor - 工作区工具执行器
 *
 * 处理所有 workspace_* 工具：
 * - workspace_read_file
 * - workspace_write_file
 * - workspace_find_files / workspace_search_files / workspace_find_symbols
 * - workspace_list_files
 * - workspace_execute_command
 * - workspace_dispatch_task
 * - workspace_create_agent
 *
 * 从 agent-engine.ts 的各 handleWorkspace* 函数拆出。
 */

import { workspaceFsService } from '../../workspace-fs-service'
import { formatPostWriteLintBlock, runPostWriteLint } from '../../workspace-post-write-lint'
import { BUILT_IN_TOOLS, AGENT_BUILTIN_TOOLS, WORKSPACE_TOOLS } from '../../built-in-tools'
import { isToolAutoApproved } from '../../tool-group-service'
import { useConversationStore } from '../../../stores/conversation-store'
import { useWorkspaceAgentStore } from '../../../stores/workspace-agent-store'
import { useAgentStore } from '../../../stores/agent-store'
import { useWorkspaceStore } from '../../../stores/workspace-store'
import { useAIProviderStore } from '../../../stores/ai-provider-store'
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

type StringEditOperation = 'replace' | 'insert_before' | 'insert_after' | 'append'

interface StringEdit {
  file_path: string
  operation: StringEditOperation
  old_string?: string
  new_string?: string
  anchor_string?: string
  content?: string
}

interface EditedFile {
  relativePath: string
  absolutePath: string
  originalContent: string
  content: string
  operationCount: number
}

export class WorkspaceToolExecutor implements ToolExecutor {
  readonly toolNames = [
    'workspace_read_file',
    'workspace_write_file',
    'workspace_str_replace_editor',
    'workspace_find_files',
    'workspace_search_files',
    'workspace_find_symbols',
    'workspace_list_files',
    'workspace_execute_command',
    'workspace_dispatch_task',
    'workspace_create_agent',
    'workspace_dispatch_parallel',
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
      case 'workspace_str_replace_editor':
        return this.handleStringReplaceEditor(args, agentSessionCtx)
      case 'workspace_find_files':
        return this.handleFindFiles(args, agentSessionCtx)
      case 'workspace_search_files':
        return this.handleSearchFiles(args, agentSessionCtx)
      case 'workspace_find_symbols':
        return this.handleFindSymbols(args, agentSessionCtx)
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

    const isWriteOperation = toolId === 'workspace:write_file' || toolId === 'workspace:str_replace_editor'
    const isReadOperation = toolId === 'workspace:read_file' || toolId === 'workspace:search_files' || toolId === 'workspace:find_symbols'
    const riskLevel = isWriteOperation ? 'medium' : 'low'
    const request: FileActionApprovalRequest = {
      id: `fa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      actionType: isWriteOperation ? 'write-file'
        : isReadOperation ? 'read-file'
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
      if (toolId === 'workspace:write_file' || toolId === 'workspace:str_replace_editor') {
        wsCtx.autoApproval.writeFiles = true
      } else if (isReadOperation) {
        wsCtx.autoApproval.readFiles = true
      } else if (toolId === 'workspace:list_files' || toolId === 'workspace:find_files') {
        wsCtx.autoApproval.listFiles = true
      }
    }
    return true
  }

  // ---- 工具处理函数 ----

  /** 文件已写入后执行检查；失败时以工具失败结果回灌 Agent，但不回滚写入。 */
  private async buildPostWriteLintResult(
    wsCtx: WorkspaceContext,
    relativePaths: string[],
    successData: Record<string, unknown>,
  ): Promise<ToolExecuteResult | null> {
    if (!wsCtx.postWriteLint) return null
    const lintResult = await runPostWriteLint({
      workspaceRoot: wsCtx.folderPath,
      relativePaths,
      config: wsCtx.postWriteLint,
    })
    if (lintResult.decision !== 'block') return null
    return {
      success: false,
      data: JSON.stringify({
        ...successData,
        decision: 'block',
        written: true,
        files: relativePaths,
        lint: lintResult,
      }),
      error: formatPostWriteLintBlock(lintResult, wsCtx.postWriteLint.maxOutputChars),
    }
  }

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
      const successData = {
        file_path: relativePath,
        absolute_path: absolutePath,
        bytes_written: new TextEncoder().encode(content).byteLength,
        message: `文件 ${relativePath} 已成功写入`,
      }
      const lintBlock = await this.buildPostWriteLintResult(wsCtx, [relativePath], successData)
      if (lintBlock) return lintBlock
      return { success: true, data: JSON.stringify(successData) }
    } catch (e) {
      return { success: false, data: '', error: e instanceof Error ? e.message : '写入文件失败' }
    }
  }

  private countOccurrences(content: string, search: string): number {
    if (search.length === 0) return 0
    let count = 0
    let startIndex = 0
    while (true) {
      const index = content.indexOf(search, startIndex)
      if (index === -1) return count
      count++
      startIndex = index + search.length
    }
  }

  private validateStringEdit(raw: unknown, index: number): StringEdit | string {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return `operations[${index}] 必须是对象`
    }
    const operation = raw as Record<string, unknown>
    const filePath = operation.file_path
    const kind = operation.operation
    if (typeof filePath !== 'string' || !filePath.trim()) return `operations[${index}].file_path 必须是非空字符串`
    if (!['replace', 'insert_before', 'insert_after', 'append'].includes(String(kind))) {
      return `operations[${index}].operation 必须是 replace、insert_before、insert_after 或 append`
    }
    if (kind === 'replace') {
      if (typeof operation.old_string !== 'string' || operation.old_string.length === 0) return `operations[${index}].old_string 必须是非空字符串`
      if (typeof operation.new_string !== 'string') return `operations[${index}].new_string 必须是字符串（删除时传空字符串）`
    } else if (kind === 'insert_before' || kind === 'insert_after') {
      if (typeof operation.anchor_string !== 'string' || operation.anchor_string.length === 0) return `operations[${index}].anchor_string 必须是非空字符串`
      if (typeof operation.content !== 'string') return `operations[${index}].content 必须是字符串`
    } else if (typeof operation.content !== 'string') {
      return `operations[${index}].content 必须是字符串`
    }
    return {
      file_path: filePath,
      operation: kind as StringEditOperation,
      old_string: operation.old_string as string | undefined,
      new_string: operation.new_string as string | undefined,
      anchor_string: operation.anchor_string as string | undefined,
      content: operation.content as string | undefined,
    }
  }

  private async handleStringReplaceEditor(
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    const wsCtx = agentSessionCtx.workspace
    if (!wsCtx) return { success: false, data: '', error: '当前对话未关联工作区' }
    if (!Array.isArray(args.operations) || args.operations.length === 0) {
      return { success: false, data: '', error: 'operations 必须是非空数组' }
    }

    const operations: StringEdit[] = []
    for (let index = 0; index < args.operations.length; index++) {
      const validation = this.validateStringEdit(args.operations[index], index)
      if (typeof validation === 'string') return { success: false, data: '', error: validation }
      operations.push(validation)
    }

    try {
      const files = new Map<string, EditedFile>()
      for (const operation of operations) {
        let file = files.get(operation.file_path)
        if (!file) {
          const absolutePath = this.resolveWorkspacePath(operation.file_path, wsCtx)
          const result = await workspaceFsService.readFile(absolutePath)
          if (!result.success || result.content === undefined) {
            return { success: false, data: '', error: `无法读取 ${operation.file_path}：${result.error || '文件不存在或不可读'}` }
          }
          if (result.truncated) {
            return { success: false, data: '', error: `无法安全编辑 ${operation.file_path}：文件读取结果已截断` }
          }
          file = {
            relativePath: operation.file_path,
            absolutePath,
            originalContent: result.content,
            content: result.content,
            operationCount: 0,
          }
          files.set(operation.file_path, file)
        }

        const target = operation.operation === 'replace' ? operation.old_string! : operation.anchor_string
        if (operation.operation !== 'append') {
          const matches = this.countOccurrences(file.content, target!)
          if (matches !== 1) {
            return { success: false, data: '', error: `操作 ${file.operationCount + 1}（${operation.file_path}）定位文本匹配了 ${matches} 次；必须恰好匹配一次。请先读取文件并提供更精确的上下文。` }
          }
        }

        if (operation.operation === 'replace') {
          file.content = file.content.replace(operation.old_string!, operation.new_string!)
        } else if (operation.operation === 'insert_before') {
          file.content = file.content.replace(operation.anchor_string!, `${operation.content!}${operation.anchor_string!}`)
        } else if (operation.operation === 'insert_after') {
          file.content = file.content.replace(operation.anchor_string!, `${operation.anchor_string!}${operation.content!}`)
        } else {
          file.content += operation.content!
        }
        file.operationCount++
      }

      const changedFiles = [...files.values()]
      const preview = changedFiles.map((file) => `${file.relativePath}（${file.operationCount} 项操作）`).join('\n')
      const approved = await this.checkFileActionApproval(
        'workspace:str_replace_editor',
        changedFiles.map((file) => file.relativePath).join(', '),
        wsCtx,
        agentSessionCtx,
        preview,
      )
      if (!approved) return { success: false, data: '', error: '用户拒绝了批量精确编辑操作；未修改任何文件' }

      const writtenFiles: EditedFile[] = []
      try {
        for (const file of changedFiles) {
          await workspaceFsService.writeFile(file.absolutePath, file.content)
          writtenFiles.push(file)
        }
      } catch (writeError) {
        const rollbackFailures: string[] = []
        for (const file of writtenFiles.reverse()) {
          try {
            await workspaceFsService.writeFile(file.absolutePath, file.originalContent)
          } catch {
            rollbackFailures.push(file.relativePath)
          }
        }
        const reason = writeError instanceof Error ? writeError.message : '未知写入错误'
        const rollbackMessage = rollbackFailures.length > 0
          ? `；回滚失败文件：${rollbackFailures.join(', ')}`
          : '；已回滚此前写入的文件'
        return { success: false, data: '', error: `批量精确编辑写入失败：${reason}${rollbackMessage}` }
      }
      for (const file of changedFiles) {
        if (!agentSessionCtx.artifacts.includes(file.relativePath)) agentSessionCtx.artifacts.push(file.relativePath)
      }
      const successData = {
        message: `已原子提交 ${operations.length} 项精确编辑，涉及 ${changedFiles.length} 个文件`,
        files: changedFiles.map((file) => ({
          file_path: file.relativePath,
          absolute_path: file.absolutePath,
          operation_count: file.operationCount,
          bytes_written: new TextEncoder().encode(file.content).byteLength,
        })),
      }
      const lintBlock = await this.buildPostWriteLintResult(
        wsCtx,
        changedFiles.map((file) => file.relativePath),
        successData,
      )
      if (lintBlock) return lintBlock
      return { success: true, data: JSON.stringify(successData) }
    } catch (e) {
      return { success: false, data: '', error: e instanceof Error ? `批量精确编辑失败：${e.message}` : '批量精确编辑失败；未保证写入状态' }
    }
  }

  private async handleFindFiles(
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    const wsCtx = agentSessionCtx.workspace
    if (!wsCtx) return { success: false, data: '', error: '当前对话未关联工作区' }
    try {
      const approved = await this.checkFileActionApproval('workspace:find_files', wsCtx.folderPath, wsCtx, agentSessionCtx)
      if (!approved) return { success: false, data: '', error: '用户拒绝了查找文件操作' }
      const result = await workspaceFsService.findFiles(wsCtx.folderPath, {
        glob: typeof args.glob === 'string' ? args.glob : undefined,
        maxResults: typeof args.max_results === 'number' ? args.max_results : undefined,
      })
      if (!result.success) return { success: false, data: '', error: result.error || '查找文件失败' }
      return { success: true, data: JSON.stringify(result) }
    } catch (e) {
      return { success: false, data: '', error: e instanceof Error ? e.message : '查找文件失败' }
    }
  }

  private async handleSearchFiles(
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    const wsCtx = agentSessionCtx.workspace
    if (!wsCtx) return { success: false, data: '', error: '当前对话未关联工作区' }
    const query = typeof args.query === 'string' ? args.query : ''
    if (!query) return { success: false, data: '', error: '需要非空 query 参数' }
    try {
      const approved = await this.checkFileActionApproval('workspace:search_files', wsCtx.folderPath, wsCtx, agentSessionCtx, query)
      if (!approved) return { success: false, data: '', error: '用户拒绝了搜索文件内容操作' }
      const result = await workspaceFsService.searchFiles(wsCtx.folderPath, {
        query,
        glob: typeof args.glob === 'string' ? args.glob : undefined,
        isRegex: typeof args.is_regex === 'boolean' ? args.is_regex : undefined,
        caseSensitive: typeof args.case_sensitive === 'boolean' ? args.case_sensitive : undefined,
        contextLines: typeof args.context_lines === 'number' ? args.context_lines : undefined,
        maxResults: typeof args.max_results === 'number' ? args.max_results : undefined,
      })
      if (!result.success) return { success: false, data: '', error: result.error || '搜索文件内容失败' }
      return { success: true, data: JSON.stringify(result) }
    } catch (e) {
      return { success: false, data: '', error: e instanceof Error ? e.message : '搜索文件内容失败' }
    }
  }

  private async handleFindSymbols(
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    const wsCtx = agentSessionCtx.workspace
    if (!wsCtx) return { success: false, data: '', error: '当前对话未关联工作区' }
    try {
      const approved = await this.checkFileActionApproval('workspace:find_symbols', wsCtx.folderPath, wsCtx, agentSessionCtx, typeof args.query === 'string' ? args.query : undefined)
      if (!approved) return { success: false, data: '', error: '用户拒绝了查找符号操作' }
      const result = await workspaceFsService.findSymbols(wsCtx.folderPath, {
        query: typeof args.query === 'string' ? args.query : undefined,
        glob: typeof args.glob === 'string' ? args.glob : undefined,
        maxResults: typeof args.max_results === 'number' ? args.max_results : undefined,
      })
      if (!result.success) return { success: false, data: '', error: result.error || '查找符号失败' }
      return { success: true, data: JSON.stringify(result) }
    } catch (e) {
      return { success: false, data: '', error: e instanceof Error ? e.message : '查找符号失败' }
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
      const { addTerminalLog } = useConversationStore.getState()
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
      const { addTerminalLog } = useConversationStore.getState()
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

    // 工具 ID 规范化：优先使用运行时注入的可授权目录（包含已启用的自定义工具），
    // 无目录时降级为内置目录以保持旧调用路径兼容。
    const ALL_AGENT_TOOLS = (wsCtx.agentToolCatalog?.length
      ? wsCtx.agentToolCatalog
      : [...BUILT_IN_TOOLS, ...AGENT_BUILTIN_TOOLS, ...WORKSPACE_TOOLS]
    ).filter((tool) => tool.enabled)
    const allowedToolIds = new Set(ALL_AGENT_TOOLS.map((tool) => tool.id))
    const nameToIdMap = new Map<string, string>()
    for (const tool of ALL_AGENT_TOOLS) {
      nameToIdMap.set(tool.name, tool.id)
      // 同时支持下划线风格（workspace_read_file）和中划线风格（workspace-read_file）
      nameToIdMap.set(tool.name.replace(/_/g, '-'), tool.id)
    }

    const normalizeToolId = (raw: string): string | undefined => {
      // 已知 ID 或工具名才允许被授权；不接受猜测的前缀/名称。
      if (allowedToolIds.has(raw)) return raw
      return nameToIdMap.get(raw) ?? nameToIdMap.get(raw.replace(/-/g, '_'))
    }

    const rawToolIds = Array.isArray(args.enabled_tool_ids) ? args.enabled_tool_ids.map(String) : undefined
    const normalizedToolIds = rawToolIds?.map(normalizeToolId)
    const invalidToolIds = rawToolIds?.filter((toolId, index) => !normalizedToolIds?.[index]) ?? []
    if (invalidToolIds.length > 0) {
      return {
        success: false,
        data: '',
        error: `以下工具不在当前可授权目录中或已被禁用：${invalidToolIds.join('、')}`,
      }
    }
    const enabledToolIds = normalizedToolIds?.filter((toolId): toolId is string => Boolean(toolId))

    // 与用户手动创建 Agent 的可配置能力保持一致：工具、知识库、Skills、策略、模型、审批、工作流等均透传。
    const planningStrategy = typeof args.planning_strategy === 'string' ? (args.planning_strategy as CreateAgentInput['planningStrategy']) : undefined
    const memoryConfig = args.memory_config && typeof args.memory_config === 'object' ? (args.memory_config as CreateAgentInput['memoryConfig']) : undefined
    const termination = args.termination_config && typeof args.termination_config === 'object' ? (args.termination_config as CreateAgentInput['termination']) : undefined
    const modelConfig = args.model_config && typeof args.model_config === 'object' ? (args.model_config as CreateAgentInput['modelConfig']) : undefined
    const knowledgeBaseIds = Array.isArray(args.knowledge_base_ids) ? args.knowledge_base_ids.map(String) : undefined
    const enabledSkillIds = Array.isArray(args.enabled_skill_ids) ? args.enabled_skill_ids.map(String) : undefined
    const contextPolicy = args.context_policy && typeof args.context_policy === 'object' ? (args.context_policy as CreateAgentInput['contextPolicy']) : undefined
    const approvalPolicy = args.approval_policy && typeof args.approval_policy === 'object' ? (args.approval_policy as CreateAgentInput['approvalPolicy']) : undefined
    const maxParallelSubtasks = typeof args.max_parallel_subtasks === 'number' ? args.max_parallel_subtasks : undefined
    const promptSections = Array.isArray(args.prompt_sections) ? (args.prompt_sections as CreateAgentInput['promptSections']) : undefined
    const promptTemplateId = typeof args.prompt_template_id === 'string' ? args.prompt_template_id : undefined
    const variables = Array.isArray(args.variables) ? (args.variables as CreateAgentInput['variables']) : undefined
    const workflow = args.workflow && typeof args.workflow === 'object' ? (args.workflow as CreateAgentInput['workflow']) : undefined
    const enabled = typeof args.enabled === 'boolean' ? args.enabled : undefined

    try {
      const agentId = await wsCtx.createAgent({
        name,
        description,
        systemPrompt,
        avatar,
        enabledToolIds,
        enabledSkillIds,
        enabled,
        promptSections,
        promptTemplateId,
        variables,
        workflow,
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
