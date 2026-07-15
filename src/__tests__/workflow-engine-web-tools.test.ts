/**
 * workflow-engine 对联网工具的放行策略
 *
 * @see src/services/agent/workflow-engine.ts filterToolsByState
 */
/// <reference path="../types/electron.d.ts" />

import type { Tool } from '../types'
import type { AgentWorkflow, WorkflowRuntimeState } from '../types/agent-workflow'
import { filterToolsByState } from '../services/agent/workflow-engine'

function makeTool(id: string, name: string): Tool {
  return {
    id,
    name,
    description: name,
    enabled: true,
    isBuiltIn: true,
    isMCP: false,
    parameters: { type: 'object', properties: {} },
  }
}

describe('filterToolsByState - 联网工具放行', () => {
  const tools: Tool[] = [
    makeTool('agent-builtin:ask_self', 'ask_self'),
    makeTool('builtin:web_search', 'web_search'),
    makeTool('builtin:fetch_webpage', 'fetch_webpage'),
    makeTool('builtin:calculate', 'calculate'),
  ]

  it('clarify 阶段 allowedTools 不含联网工具时仍保留联网工具', () => {
    const workflow: AgentWorkflow = {
      initial: 'clarify',
      terminals: ['done'],
      states: {
        clarify: {
          label: '澄清',
          allowedTools: ['agent-builtin:ask_self'],
          transitions: [],
        },
        done: { label: '完成', transitions: [] },
      },
    }
    const runtime: WorkflowRuntimeState = { currentState: 'clarify', history: ['clarify'] }
    const filtered = filterToolsByState(workflow, runtime, tools)
    const names = filtered.map((t) => t.name)
    expect(names).toContain('ask_self')
    expect(names).toContain('web_search')
    expect(names).toContain('fetch_webpage')
    expect(names).not.toContain('calculate')
  })

  it('未配置 allowedTools 时返回完整列表', () => {
    const workflow: AgentWorkflow = {
      initial: 'open',
      terminals: [],
      states: {
        open: { label: '开放', transitions: [] },
      },
    }
    const runtime: WorkflowRuntimeState = { currentState: 'open', history: ['open'] }
    const filtered = filterToolsByState(workflow, runtime, tools)
    expect(filtered).toHaveLength(tools.length)
  })
})
