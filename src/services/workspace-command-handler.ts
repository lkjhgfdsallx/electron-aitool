/**
 * 工作区指令执行服务
 *
 * 为工作区快捷指令（#init, #agents, #clear 等）提供真正的功能实现，
 * 而不是简单的文本模板。每个指令都有对应的执行逻辑。
 */

import { useConversationStore } from '../stores/conversation-store'
import type { Workspace, MessageAttachment } from '../types'

/** 指令执行动作类型 */
export type CommandAction =
  | { type: 'send-message'; content: string; attachments?: MessageAttachment[] }
  | { type: 'clear-conversation' }
  | { type: 'new-conversation'; conversationId: string }
  | { type: 'open-agents-panel' }
  | { type: 'open-settings'; section: string }
  | { type: 'compact-context' }
  | { type: 'noop' }

/** 指令执行结果 */
export interface CommandResult {
  success: boolean
  action?: CommandAction
  error?: string
}

/**
 * 工作区指令执行器
 */
export const workspaceCommandHandler = {
  /**
   * 执行工作区指令
   *
   * @param commandName 指令名称（不含 # 前缀）
   * @param workspace 当前工作区
   * @param conversationId 当前对话 ID
   * @param onSendMessage 发送消息回调
   * @param onOpenSettings 打开设置回调
   */
  async execute(
    commandName: string,
    workspace: Workspace,
    conversationId: string,
    onSendMessage: (content: string, attachments?: MessageAttachment[]) => void,
    onOpenSettings?: (section?: string, editId?: string) => void,
  ): Promise<CommandResult> {
    switch (commandName.toLowerCase()) {
      case 'init':
        return this.handleInit(workspace, conversationId, onSendMessage)

      case 'agents':
        return this.handleAgents(onOpenSettings)

      case 'newtask':
        return this.handleNewTask(workspace)

      case 'clear':
        return this.handleClear(conversationId)

      case 'compact':
        return this.handleCompact(workspace, conversationId, onSendMessage)

      case 'approve':
        return this.handleApprove(onOpenSettings)

      case 'status':
        return this.handleStatus(workspace, conversationId, onSendMessage)

      case 'review':
        return this.handleReview(workspace, conversationId, onSendMessage)

      case 'test':
        return this.handleTest(workspace, conversationId, onSendMessage)

      case 'explain':
        return this.handleExplain(workspace, conversationId, onSendMessage)

      default:
        return { success: false, error: `未知指令: #${commandName}` }
    }
  },

  /**
   * #init - 初始化项目分析
   * Leader 将分析项目结构并生成规划
   */
  async handleInit(
    workspace: Workspace,
    conversationId: string,
    onSendMessage: (content: string) => void,
  ): Promise<CommandResult> {
    const content = '请分析当前项目结构，生成项目初始化规划和开发建议。包括：\n\n1. 项目技术栈分析\n2. 目录结构说明\n3. 主要依赖关系\n4. 开发规范建议\n5. 后续开发规划'
    onSendMessage(content)
    return { success: true, action: { type: 'send-message', content } }
  },

  /**
   * #agents - 查看和管理团队 Agent
   * 打开设置中的 Agent 管理面板
   */
  async handleAgents(
    onOpenSettings?: (section?: string, editId?: string) => void,
  ): Promise<CommandResult> {
    if (onOpenSettings) {
      onOpenSettings('agents')
      return { success: true, action: { type: 'open-settings', section: 'agents' } }
    }
    return { success: false, error: '无法打开 Agent 管理面板' }
  },

  /**
   * #newtask - 以隔离上下文启动新任务（Boomerang 模式）
   * 创建新对话并切换到新对话
   */
  async handleNewTask(
    workspace: Workspace,
  ): Promise<CommandResult> {
    const convStore = useConversationStore.getState()
    const conv = convStore.createConversation(
      `${workspace.name} - 新任务`,
      undefined,
      workspace.leaderAgentId,
      workspace.id,
    )
    if (workspace.knowledgeBaseIds.length > 0) {
      convStore.setConversationKnowledgeBases(conv.id, workspace.knowledgeBaseIds)
    }
    convStore.selectConversation(conv.id)
    return { success: true, action: { type: 'new-conversation', conversationId: conv.id } }
  },

  /**
   * #clear - 清空当前对话上下文
   * 清除当前对话的所有消息
   */
  async handleClear(
    conversationId: string,
  ): Promise<CommandResult> {
    useConversationStore.getState().clearMessages(conversationId)
    return { success: true, action: { type: 'clear-conversation' } }
  },

  /**
   * #compact - 手动触发上下文压缩
   * 请求 AI 总结当前对话要点
   */
  async handleCompact(
    workspace: Workspace,
    conversationId: string,
    onSendMessage: (content: string) => void,
  ): Promise<CommandResult> {
    const content = '请对当前对话进行上下文压缩，总结以下要点：\n\n1. 已完成的任务\n2. 当前进展\n3. 待解决的问题\n4. 下一步计划\n\n请保持简洁明了。'
    onSendMessage(content)
    return { success: true, action: { type: 'send-message', content } }
  },

  /**
   * #approve - 打开自动审批设置
   * 打开设置中的审批策略配置
   */
  async handleApprove(
    onOpenSettings?: (section?: string, editId?: string) => void,
  ): Promise<CommandResult> {
    if (onOpenSettings) {
      onOpenSettings('workspace')
      return { success: true, action: { type: 'open-settings', section: 'workspace' } }
    }
    return { success: false, error: '无法打开设置面板' }
  },

  /**
   * #status - 查看工作区状态
   * 请求 AI 汇报当前工作区状态
   */
  async handleStatus(
    workspace: Workspace,
    conversationId: string,
    onSendMessage: (content: string) => void,
  ): Promise<CommandResult> {
    const content = '请汇报当前工作区状态，包括：\n\n1. 活跃 Agent 列表及状态\n2. 已启用的工具\n3. 审批策略配置\n4. 当前任务进展\n5. 待处理事项'
    onSendMessage(content)
    return { success: true, action: { type: 'send-message', content } }
  },

  /**
   * #review - 代码审查
   * 请求 AI 审查最近修改的代码
   */
  async handleReview(
    workspace: Workspace,
    conversationId: string,
    onSendMessage: (content: string) => void,
  ): Promise<CommandResult> {
    const content = '请对最近修改的代码文件进行审查，包括：\n\n1. 代码质量分析\n2. 潜在问题指出\n3. 性能优化建议\n4. 安全风险评估\n5. 改进建议'
    onSendMessage(content)
    return { success: true, action: { type: 'send-message', content } }
  },

  /**
   * #test - 生成/运行测试
   * 请求 AI 为当前文件生成或运行测试
   */
  async handleTest(
    workspace: Workspace,
    conversationId: string,
    onSendMessage: (content: string) => void,
  ): Promise<CommandResult> {
    const content = '请为当前相关文件生成或运行单元测试，包括：\n\n1. 分析需要测试的功能\n2. 生成测试用例\n3. 运行测试并报告结果\n4. 修复失败的测试（如有）'
    onSendMessage(content)
    return { success: true, action: { type: 'send-message', content } }
  },

  /**
   * #explain - 解释代码
   * 请求 AI 解释选中的代码或文件
   */
  async handleExplain(
    workspace: Workspace,
    conversationId: string,
    onSendMessage: (content: string) => void,
  ): Promise<CommandResult> {
    const content = '请解释以下代码的工作原理：\n\n（请提供需要解释的代码或文件路径）'
    onSendMessage(content)
    return { success: true, action: { type: 'send-message', content } }
  },
}
