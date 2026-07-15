/**
 * 联网工具统一策略单元测试
 *
 * @see src/utils/web-tools.ts
 */

import type { Tool } from '../types'

const mockSettingsState = {
  webSearchEnabled: false,
}

jest.mock('../stores', () => ({
  useSettingsStore: {
    getState: () => mockSettingsState,
  },
}))

jest.mock('../services/built-in-tools', () => ({
  BUILT_IN_TOOLS: [
    {
      id: 'builtin:web_search',
      name: 'web_search',
      description: 'search',
      enabled: true,
      isBuiltIn: true,
      isMCP: false,
      parameters: { type: 'object', properties: {} },
    },
    {
      id: 'builtin:fetch_webpage',
      name: 'fetch_webpage',
      description: 'fetch',
      enabled: true,
      isBuiltIn: true,
      isMCP: false,
      parameters: { type: 'object', properties: {} },
    },
    {
      id: 'builtin:calculate',
      name: 'calculate',
      description: 'calc',
      enabled: true,
      isBuiltIn: true,
      isMCP: false,
      parameters: { type: 'object', properties: {} },
    },
  ],
}))

import {
  WEB_TOOL_IDS,
  WEB_TOOL_NAMES,
  isWebTool,
  isWebSearchEnabled,
  getWebToolsIfEnabled,
  applyWebSearchPolicy,
  shouldBypassAgentToolWhitelist,
} from '../utils/web-tools'

function makeTool(overrides: Partial<Tool> & Pick<Tool, 'id' | 'name'>): Tool {
  return {
    description: '',
    enabled: true,
    isBuiltIn: true,
    isMCP: false,
    parameters: { type: 'object', properties: {} },
    ...overrides,
  }
}

describe('web-tools 统一策略', () => {
  beforeEach(() => {
    mockSettingsState.webSearchEnabled = false
  })

  describe('isWebTool', () => {
    it('按 name 识别联网工具', () => {
      expect(isWebTool({ name: 'web_search' })).toBe(true)
      expect(isWebTool({ name: 'fetch_webpage' })).toBe(true)
      expect(isWebTool({ name: 'calculate' })).toBe(false)
    })

    it('按 id 识别联网工具', () => {
      expect(isWebTool({ id: 'builtin:web_search' })).toBe(true)
      expect(isWebTool({ id: 'builtin:fetch_webpage' })).toBe(true)
      expect(isWebTool({ id: 'builtin:calculate' })).toBe(false)
    })
  })

  describe('isWebSearchEnabled / getWebToolsIfEnabled', () => {
    it('关闭时返回空列表', () => {
      mockSettingsState.webSearchEnabled = false
      expect(isWebSearchEnabled()).toBe(false)
      expect(getWebToolsIfEnabled()).toEqual([])
    })

    it('开启时返回 web_search 与 fetch_webpage，且 enabled=true', () => {
      mockSettingsState.webSearchEnabled = true
      expect(isWebSearchEnabled()).toBe(true)
      const tools = getWebToolsIfEnabled()
      expect(tools.map((t) => t.name).sort()).toEqual(['fetch_webpage', 'web_search'])
      expect(tools.every((t) => t.enabled)).toBe(true)
      expect(tools.every((t) => WEB_TOOL_NAMES.has(t.name))).toBe(true)
      expect(tools.every((t) => (WEB_TOOL_IDS as readonly string[]).includes(t.id))).toBe(true)
    })
  })

  describe('applyWebSearchPolicy', () => {
    const base: Tool[] = [
      makeTool({ id: 'builtin:calculate', name: 'calculate' }),
      makeTool({ id: 'agent-builtin:create_plan', name: 'create_plan' }),
      makeTool({ id: 'builtin:web_search', name: 'web_search', enabled: false }),
    ]

    it('关闭时剥离全部联网工具', () => {
      mockSettingsState.webSearchEnabled = false
      const result = applyWebSearchPolicy(base)
      expect(result.map((t) => t.name)).toEqual(['calculate', 'create_plan'])
    })

    it('开启时强制注入联网工具（即使原列表缺失或 enabled=false）', () => {
      mockSettingsState.webSearchEnabled = true
      const withoutWeb = base.filter((t) => t.name !== 'web_search')
      const result = applyWebSearchPolicy(withoutWeb)
      const names = result.map((t) => t.name)
      expect(names).toContain('calculate')
      expect(names).toContain('create_plan')
      expect(names).toContain('web_search')
      expect(names).toContain('fetch_webpage')
      expect(result.find((t) => t.name === 'web_search')?.enabled).toBe(true)
    })

    it('开启时不重复注入已存在的联网工具', () => {
      mockSettingsState.webSearchEnabled = true
      const withBoth = [
        ...base.filter((t) => t.name !== 'web_search'),
        makeTool({ id: 'builtin:web_search', name: 'web_search' }),
        makeTool({ id: 'builtin:fetch_webpage', name: 'fetch_webpage' }),
      ]
      const result = applyWebSearchPolicy(withBoth)
      expect(result.filter((t) => t.name === 'web_search')).toHaveLength(1)
      expect(result.filter((t) => t.name === 'fetch_webpage')).toHaveLength(1)
    })
  })

  describe('shouldBypassAgentToolWhitelist', () => {
    it('仅联网工具可绕过 Agent 白名单', () => {
      expect(shouldBypassAgentToolWhitelist(makeTool({ id: 'builtin:web_search', name: 'web_search' }))).toBe(true)
      expect(shouldBypassAgentToolWhitelist(makeTool({ id: 'builtin:calculate', name: 'calculate' }))).toBe(false)
    })
  })
})
