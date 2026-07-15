/**
 * LocalForge 品牌常量 — 对外展示名与文案的单一事实来源
 */
export const BRAND = {
  /** 产品展示名 */
  name: 'LocalForge',
  /** npm / 技术包名（小写） */
  packageName: 'localforge',
  /** Electron appId */
  appId: 'com.localforge.app',
  /** 英文标语 */
  tagline: 'Forge AI. Locally. Privately.',
  /** 中文副标 */
  taglineZh: '本地锻造你的 AI 工作台',
  /** 欢迎页短描述 */
  welcomeDescription:
    '无需登录、纯本地优先的专业 AI 工作台 — Agent、知识库、工作区与 MCP，密钥自持',
  /** 导出页脚前缀 */
  exportFooter: '由 LocalForge 导出',
  /** HTTP / MCP 客户端标识 */
  userAgent: 'LocalForge/1.0',
  mcpClientName: 'LocalForge',
  /** 展示用版本标签（侧栏等） */
  versionLabel: 'v1.0',
} as const

export type Brand = typeof BRAND
