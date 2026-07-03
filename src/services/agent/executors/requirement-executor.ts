/**
 * RequirementToolExecutor - 需求分析工具执行器
 *
 * 处理 ask_self / define_requirement / review_requirements 三个需求分析专用工具。
 * 从 agent-engine.ts 的 handleAskSelfTool / handleDefineRequirementTool / handleReviewRequirementsTool 拆出。
 *
 * 关键设计：collectedRequirements / selfQARecords 从引擎闭包变量
 * 迁移到此执行器的 ToolSessionContext，让需求分析状态独立管理。
 */

import type { ToolExecutor, AgentSessionContext, ToolSessionContext } from '../tool-executor'
import type { ToolExecuteResult } from '../../../types'

/** 需求分析工具的会话级状态 */
interface RequirementSessionContext extends ToolSessionContext {
  /** 已收集的需求点列表 */
  collectedRequirements: Array<{
    name: string
    description: string
    details?: string
    priority: string
  }>
  /** 已进行的自问自答记录 */
  selfQARecords: Array<{
    question: string
    answer: string
    confidence: string
  }>
}

export class RequirementToolExecutor implements ToolExecutor {
  readonly toolNames = ['ask_self', 'define_requirement', 'review_requirements']

  createContext(_sessionCtx: AgentSessionContext): ToolSessionContext {
    return {
      collectedRequirements: [],
      selfQARecords: [],
    } as RequirementSessionContext
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    sessionCtx: ToolSessionContext,
    _agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    const ctx = sessionCtx as RequirementSessionContext
    switch (toolName) {
      case 'ask_self':
        return this.handleAskSelf(args, ctx)
      case 'define_requirement':
        return this.handleDefineRequirement(args, ctx)
      case 'review_requirements':
        return this.handleReviewRequirements(args, ctx)
      default:
        return { success: false, data: '', error: `RequirementToolExecutor: 未知工具 "${toolName}"` }
    }
  }

  private handleAskSelf(
    args: Record<string, unknown>,
    ctx: RequirementSessionContext,
  ): ToolExecuteResult {
    const question = String(args.question ?? '')
    const answer = String(args.answer ?? '')
    const confidence = String(args.confidence ?? 'medium')
    if (!question || !answer) {
      return { success: false, data: '', error: 'ask_self 工具需要 question 和 answer 参数' }
    }
    ctx.selfQARecords.push({ question, answer, confidence })
    const confidenceLabel = confidence === 'high' ? '高信心' : confidence === 'medium' ? '中等信心' : '低信心需确认'
    return {
      success: true,
      data: `问题: ${question}\n回答: ${answer}\n信心: ${confidenceLabel}\n\n已记录此信息。当前已进行 ${ctx.selfQARecords.length} 轮自问自答。`,
    }
  }

  private handleDefineRequirement(
    args: Record<string, unknown>,
    ctx: RequirementSessionContext,
  ): ToolExecuteResult {
    const name = String(args.name ?? '')
    const description = String(args.description ?? '')
    const details = args.details ? String(args.details) : undefined
    const priority = String(args.priority ?? 'should_have')
    if (!name || !description) {
      return { success: false, data: '', error: 'define_requirement 工具需要 name 和 description 参数' }
    }
    ctx.collectedRequirements.push({ name, description, details, priority })
    const priorityLabel = priority === 'must_have' ? '必须' : priority === 'should_have' ? '重要' : '加分'
    return {
      success: true,
      data: `已定义需求点: ${name}\n描述: ${description}\n${details ? `详细规则: ${details}\n` : ''}优先级: ${priorityLabel}\n\n当前已定义 ${ctx.collectedRequirements.length} 个需求点。`,
    }
  }

  private handleReviewRequirements(
    args: Record<string, unknown>,
    ctx: RequirementSessionContext,
  ): ToolExecuteResult {
    const originalRequest = String(args.original_request ?? '')
    const currentSummary = String(args.current_summary ?? '')
    const checkDimensions = Array.isArray(args.check_dimensions)
      ? args.check_dimensions.map(String)
      : []
    if (!originalRequest || !currentSummary) {
      return { success: false, data: '', error: 'review_requirements 工具需要 original_request 和 current_summary 参数' }
    }

    // 构建审查报告
    const reqNames = ctx.collectedRequirements.map(r => `- ${r.name} (${r.priority})`).join('\n')
    const qaSummary = ctx.selfQARecords.map(q => `- [${q.confidence}] ${q.question} -> ${q.answer}`).join('\n')

    let reviewReport = '需求审查报告\n\n'
    reviewReport += `原始需求: ${originalRequest}\n\n`
    reviewReport += `已定义的需求点 (${ctx.collectedRequirements.length}个):\n${reqNames || '尚未定义'}\n\n`
    reviewReport += `自问自答记录 (${ctx.selfQARecords.length}轮):\n${qaSummary || '尚未进行'}\n\n`
    reviewReport += `当前摘要: ${currentSummary}\n\n`
    reviewReport += `检查维度: ${checkDimensions.join('、')}\n\n`
    reviewReport += `请根据以上信息判断：\n`
    reviewReport += `1. 是否有遗漏的功能点？如有，请继续调用 define_requirement 补充\n`
    reviewReport += `2. 是否有模糊的描述？如有，请调用 ask_self 澄清\n`
    reviewReport += `3. 是否所有维度都已覆盖？如果完整，请输出最终需求文档\n`
    reviewReport += `4. 低信心的自问自答是否需要标注为"待用户确认"？`

    return {
      success: true,
      data: reviewReport,
    }
  }
}
