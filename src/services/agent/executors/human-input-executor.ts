/**
 * HumanInputToolExecutor - 人工输入工具执行器
 *
 * 处理 ask_human 工具，暂停 Agent 执行等待用户选择。
 * 从 agent-engine.ts 的 handleAskHumanTool 拆出。
 */

import type { ToolExecutor, AgentSessionContext, ToolSessionContext } from '../tool-executor'
import type { ToolExecuteResult, AgentStep } from '../../../types'

export class HumanInputToolExecutor implements ToolExecutor {
  readonly toolNames = ['ask_human']

  createContext(_sessionCtx: AgentSessionContext): ToolSessionContext {
    // 无额外状态，依赖 agentSessionCtx.callbacks.onHumanInput 与用户交互
    return {}
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    _sessionCtx: ToolSessionContext,
    agentSessionCtx: AgentSessionContext,
  ): Promise<ToolExecuteResult> {
    if (toolName !== 'ask_human') {
      return { success: false, data: '', error: `HumanInputToolExecutor: 未知工具 "${toolName}"` }
    }

    const question = String(args.question ?? '')
    const options = Array.isArray(args.options)
      ? args.options.map((opt: Record<string, unknown>) => ({
          label: String(opt.label ?? ''),
          value: String(opt.value ?? ''),
          description: opt.description ? String(opt.description) : undefined,
        }))
      : []
    const allowMultiple = Boolean(args.allow_multiple)
    if (!question || options.length < 2) {
      return { success: false, data: '', error: 'ask_human 工具需要 question 和至少2个 options' }
    }

    // 创建 human_input 步骤
    const humanStep: AgentStep = {
      id: crypto.randomUUID(),
      type: 'human_input',
      content: question,
      humanChoice: { question, options, allowMultiple },
      stepIndex: agentSessionCtx.stepCounter.value++,
      timestamp: Date.now(),
    }
    agentSessionCtx.steps.push(humanStep)
    agentSessionCtx.callbacks.onStep(humanStep)

    // 如果没有 onHumanInput 回调，返回默认提示
    if (!agentSessionCtx.callbacks.onHumanInput) {
      return {
        success: true,
        data: '用户输入功能未启用，请自行推断答案。',
      }
    }

    // 暂停执行，等待用户选择
    try {
      const userResponse = await agentSessionCtx.callbacks.onHumanInput(humanStep)
      // 更新步骤记录用户选择
      humanStep.humanResponse = userResponse
      // 格式化选择结果
      const responseText = Array.isArray(userResponse)
        ? userResponse.join('、')
        : userResponse
      return {
        success: true,
        data: `用户选择了: ${responseText}`,
      }
    } catch (error) {
      // 如果是中止错误，向上抛出让引擎处理
      if (error instanceof Error && error.message === 'aborted') {
        throw error
      }
      return {
        success: true,
        data: '用户未做选择，请自行推断答案。',
      }
    }
  }
}
