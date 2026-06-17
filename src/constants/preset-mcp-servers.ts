import type { MCPServerConfig } from '../types'

export interface PresetMCPServer {
  /** 预设唯一标识（与用户配置中的 id 前缀对应） */
  presetId: string
  /** 显示名称 */
  name: string
  /** 分类标签 */
  category: string
  /** 功能描述 */
  description: string
  /** 详细说明（Markdown 格式） */
  detail: string
  /** 图标名称（lucide icon） */
  icon: string
  /** 是否需要 API Key 等额外配置 */
  requiresApiKey: boolean
  /** API Key 的说明（如需要） */
  apiKeyHint?: string
  /** 环境变量中 API Key 的字段名 */
  apiKeyEnvKey?: string
  /** 默认配置（不含用户自定义部分） */
  defaultConfig: Omit<MCPServerConfig, 'id' | 'enabled'>
}

export const PRESET_MCP_SERVERS: PresetMCPServer[] = [
  {
    presetId: 'sequential-thinking',
    name: '顺序思考工具',
    category: '思维增强',
    description: '为 AI 提供结构化思考框架，进行复杂问题的逐步推理和规划。',
    detail:
      'Sequential Thinking 工具为 AI 提供一个结构化的思考框架。\n' +
      'AI 会在处理复杂问题时进行逐步推理，使思考过程更透明、更有条理。\n' +
      '适合：复杂分析、多步骤规划、决策推理等场景。\n' +
      '无需额外配置，开箱即用。',
    icon: 'Brain',
    requiresApiKey: false,
    defaultConfig: {
      name: '顺序思考工具',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
      description: 'Sequential Thinking - 结构化逐步推理'
    }
  },
  {
    presetId: 'web-fetcher',
    name: '网页内容抓取',
    category: '数据获取',
    description: '让 AI 能够抓取指定网页内容，转换为 Markdown 格式。适合竞品分析、市场调研。',
    detail:
      '通过 Fetch MCP 服务器，AI 可以自动访问并解析网页内容，提取关键信息并转换为结构化的 Markdown 文本。\n' +
      '适用于：竞品分析、公开数据收集、新闻聚合等场景。\n' +
      '无需额外配置，开箱即用。',
    icon: 'Globe',
    requiresApiKey: false,
    defaultConfig: {
      name: '网页内容抓取',
      command: 'npx',
      args: ['-y', 'mcp-fetch-server'],
      description: 'Fetch MCP - 抓取网页并转为 Markdown'
    }
  },
  {
    presetId: 'context7',
    name: 'Context7 文档查询',
    category: '开发辅助',
    description: '实时查询第三方库的最新文档，让 AI 获取准确的 API 用法，避免过时信息。',
    detail:
      'Context7 MCP 服务器提供实时的第三方库文档查询能力。\n' +
      'AI 可以搜索并获取任意 npm/Python 库的最新文档和代码示例。\n' +
      '适合：开发辅助、API 查询、技术选型等场景。\n' +
      '无需额外配置，开箱即用。',
    icon: 'BookOpen',
    requiresApiKey: false,
    defaultConfig: {
      name: 'Context7 文档查询',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      description: 'Context7 - 实时查询第三方库文档'
    }
  },
  {
    presetId: 'github',
    name: 'GitHub 仓库管理',
    category: '代码管理',
    description: '让 AI 直接与 GitHub 交互，创建/更新文件、管理 Issue、查看 PR 等。',
    detail:
      '通过 GitHub MCP 服务器，AI 可以操作你的 GitHub 仓库。\n' +
      '支持功能：创建/更新/删除文件、管理 Issue 和 PR、搜索代码等。\n' +
      '需要一个 GitHub 个人访问令牌（Personal Access Token），\n' +
      '可在 GitHub Settings → Developer settings → Personal access tokens 中创建。\n' +
      '注意：此官方包已标记为 deprecated，但仍可正常使用。',
    icon: 'Github',
    requiresApiKey: true,
    apiKeyHint: '请输入 GitHub Personal Access Token（以 ghp_ 开头）',
    apiKeyEnvKey: 'GITHUB_PERSONAL_ACCESS_TOKEN',
    defaultConfig: {
      name: 'GitHub 仓库管理',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      description: 'GitHub MCP - 操作 GitHub 仓库、Issue、PR'
    }
  }
]
