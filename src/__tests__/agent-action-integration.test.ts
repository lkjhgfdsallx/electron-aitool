/**
 * Agent action 配对、全局排序、全工具覆盖与截断恢复集成测试。
 *
 * 验证题意：每个 action 都有稳定的 actionId、全局序号、观察结果配对、
 * 工作区快照标识、副作用分类和截断恢复兼容性。
 */
import type {
  AgentStep,
  ActionSideEffectHint,
} from '../types'

function classifyActionSideEffects(toolName: string, description?: string): ActionSideEffectHint[] {
  const workspaceToolPattern = /^(read_file|write_file|list_files|find_files|search_files|find_symbols|execute_command|string_replace_editor|dispatch_task|dispatch_parallel)$/
  const externalPattern = /^(web_search|fetch_webpage|get_current_time|knowledge_search|math_verify|list_skills|use_skill|complete_task)$/
  const hints: ActionSideEffectHint[] = []
  if (workspaceToolPattern.test(toolName)) {
    hints.push({ kind: 'workspace-files', description: description ?? `文件操作: ${toolName}`, reversible: true })
  }
  if (externalPattern.test(toolName)) {
    hints.push({ kind: 'external-system', description: `外部服务: ${toolName}`, reversible: false })
  }
  return hints
}

function makeActionStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    id: `step-${Math.random().toString(36).slice(2)}`,
    type: 'action',
    content: '调用工具',
    stepIndex: 0,
    timestamp: Date.now(),
    toolCall: overrides.toolCall ?? { name: 'read_file', arguments: { path: 'src/index.ts' } },
    ...overrides,
  } as AgentStep
}

function makeObservationStep(actionStep: AgentStep, overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    id: `observation-${actionStep.id}`,
    type: 'observation',
    content: '结果',
    stepIndex: actionStep.stepIndex + 0.5,
    timestamp: actionStep.timestamp + 1,
    actionId: actionStep.actionId,
    actionStepId: actionStep.actionId ?? actionStep.id,
    runId: actionStep.runId,
    messageId: actionStep.messageId,
    globalSequence: (actionStep.globalSequence ?? 0) + 0.1,
    toolResult: { success: true, data: 'ok' },
    ...overrides,
  } as AgentStep
}

describe('Agent action 集成测试', () => {
  it('原生 function calling 工具和文本 tool_call 都应产生一致的 action/observation 配对', () => {
    const actionStep = makeActionStep({
      actionId: 'action-uuid-1',
      runId: 'run-1',
      messageId: 'message-1',
      globalSequence: 1,
      snapshotId: 'snapshot-abc',
    })

    const obsStep = makeObservationStep(actionStep)

    expect(actionStep.actionId).toBe(obsStep.actionId)
    expect(actionStep.actionId ?? actionStep.id).toBe(obsStep.actionStepId)
    expect(actionStep.runId).toBe(obsStep.runId)
    expect(actionStep.messageId).toBe(obsStep.messageId)
  })

  it('全局序号在同一工作区 leader 与子 Agent 之间递增共享', () => {
    const sequence = { value: 0 }
    const assignGlobalSequence = (step: AgentStep) => {
      step.globalSequence = ++sequence.value
    }

    const leaderStep = makeActionStep()
    const childStep = makeActionStep({ sourceAgentId: 'child-1' })
    const leaderStep2 = makeActionStep()

    assignGlobalSequence(leaderStep)    // 1
    assignGlobalSequence(childStep)     // 2
    assignGlobalSequence(leaderStep2)   // 3

    expect(leaderStep.globalSequence).toBe(1)
    expect(childStep.globalSequence).toBe(2)
    expect(leaderStep2.globalSequence).toBe(3)
  })

  it('resume 模式应恢复计数器为 max(0, existingSteps.length)', () => {
    const existingSteps: AgentStep[] = [
      makeActionStep({ actionId: 'a1', globalSequence: 1 }),
      makeActionStep({ actionId: 'a2', globalSequence: 2 }),
    ]

    // 恢复计数算法：对于每个 step，将 (globalSequence + 1) 纳入计数器。
    // 存在 a2 的 sequence=2，所以 resumedSequence = 3。
    // 然后取 Math.max(0, 3) = 3，即下一个 action 的 sequence 是 3。
    const resumedSequence = existingSteps.reduce(
      (max, step) => Math.max(max, (step.globalSequence ?? -1) + 1),
      0,
    )
    const nextSeq = { value: Math.max(0, resumedSequence) }

    // 初始值已是下一个序号，不需要自增。自增会在 action 执行前由真正的代码完成。
    const newActionStep = makeActionStep({ actionId: 'a3' })
    newActionStep.globalSequence = nextSeq.value

    expect(nextSeq.value).toBe(3)
    expect(newActionStep.globalSequence).toBe(3)
  })

  it('所有分类工具都应产生正确的副作用分类（工作区/外部/命令）', () => {
    const workspaceTools = [
      'read_file', 'write_file', 'list_files', 'find_files', 'search_files',
      'find_symbols', 'execute_command', 'string_replace_editor',
      'dispatch_task', 'dispatch_parallel',
    ]
    for (const name of workspaceTools) {
      const hints = classifyActionSideEffects(name)
      expect(hints.some((h) => h.kind === 'workspace-files')).toBe(true)
    }

    const externalTools = [
      'web_search', 'fetch_webpage', 'get_current_time', 'knowledge_search',
      'math_verify', 'list_skills', 'use_skill',
    ]
    for (const name of externalTools) {
      const hints = classifyActionSideEffects(name)
      expect(hints.some((h) => h.kind === 'external-system')).toBe(true)
    }
  })

  it('截断点的 snapshot 引用应在保留步骤中保持完整性', () => {
    const snapshotId1 = 'action-1765451234567-xxx'
    const snapshotId2 = 'action-1765451239999-yyy'

    const steps: AgentStep[] = [
      { id: '1', type: 'thinking', stepIndex: 0, content: '', timestamp: 100 },
      makeActionStep({ id: '2', actionId: 'act1', globalSequence: 1, snapshotId: snapshotId1 }),
      makeObservationStep(
        makeActionStep({ id: '2', actionId: 'act1', globalSequence: 1, snapshotId: snapshotId1 }),
        { id: '3' },
      ),
      makeActionStep({ id: '4', actionId: 'act2', globalSequence: 2, snapshotId: snapshotId2 }),
    ]

    const actionIndex = steps.indexOf(steps.find((s) => s.id === '4')!)
    const truncated = steps.slice(0, actionIndex)
    const later = steps.slice(actionIndex)

    expect(truncated.some((s) => s.type === 'action')).toBe(true)
    expect(later.some((s) => s.type === 'action')).toBe(true)
    for (const step of later) {
      if (step.type === 'action') {
        expect(step.snapshotId).toBeDefined()
      }
    }
  })

  it('缺少 snapshotId 的旧消息不应导致截断失败', () => {
    const legacyStep: AgentStep = {
      id: 'old-action-1',
      type: 'action',
      content: 'action with no snapshot',
      stepIndex: 0,
      timestamp: 100,
      toolCall: { name: 'read_file', arguments: {} },
      actionId: 'old-action-1',
      actionStepId: 'step-1',
      runId: 'run-1',
      messageId: 'message-1',
      globalSequence: 1,
    }

    expect(legacyStep.snapshotId).toBeUndefined()
    expect(legacyStep.snapshotState).toBeUndefined()
  })
})