/**
 * 工作区模板 - C2
 *
 * 预设的工作区模板，新建工作区时可选择预设结构：
 * - Node.js 项目（package.json 检测、npm 脚本）
 * - Python 项目（requirements.txt、venv）
 * - 通用项目（最小配置）
 */

import type { WorkspaceCreateInput, ContextConfig } from '../types'
import { DEFAULT_CONTEXT_CONFIG, DEFAULT_AUTO_APPROVAL_CONFIG } from '../types/workspace'

// ---- 模板接口 ----

export interface WorkspaceTemplate {
  /** 模板 ID */
  id: string
  /** 模板名称 */
  name: string
  /** 模板描述 */
  description: string
  /** 模板图标 */
  icon: string
  /** 模板分类 */
  category: 'frontend' | 'backend' | 'fullstack' | 'data' | 'general'
  /** 预设配置（除了 name, folderPath 之外的默认值） */
  defaults: Omit<WorkspaceCreateInput, 'name' | 'folderPath' | 'description'>
  /** 模板提示：创建工作区后建议执行的步骤 */
  tips: string[]
}

// ---- 上下文配置预设 ----

const frontendContextConfig: ContextConfig = {
  ...DEFAULT_CONTEXT_CONFIG,
  maxTokens: 12000, // 前端项目通常有更多上下文
}

const backendContextConfig: ContextConfig = {
  ...DEFAULT_CONTEXT_CONFIG,
  maxTokens: 16000, // 后端项目上下文更多
}

// ---- 模板定义 ----

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
  {
    id: 'nodejs',
    name: 'Node.js 项目',
    description: '适用于 Node.js / TypeScript 后端或 CLI 工具项目',
    icon: '🟢',
    category: 'backend',
    defaults: {
      allowDynamicAgents: true,
      teamAgentIds: [],
      checkpointPolicy: 'auto-before-modify',
      timedIntervalMinutes: 30,
      maxCheckpoints: 50,
      commandPolicy: 'auto-approve-safe',
      commandExecutionEnabled: true,
      safeCommandWhitelist: ['npm', 'node', 'npx', 'pnpm', 'yarn', 'git', 'ls', 'dir', 'cat', 'echo', 'tsc', 'ts-node'],
      commandBlacklist: ['rm -rf /', 'format', 'shutdown', 'mkfs'],
      contextConfig: backendContextConfig,
      knowledgeBaseIds: [],
      mcpServerIds: [],
      autoApproval: DEFAULT_AUTO_APPROVAL_CONFIG,
    },
    tips: [
      '检测到 package.json 后，AI 可自动读取 scripts 和依赖',
      '建议将 tsconfig.json 放在项目根目录',
      'npm test / npm run build 等常用命令已加入安全白名单',
    ],
  },
  {
    id: 'nextjs',
    name: 'Next.js 项目',
    description: '适用于 Next.js / React 全栈 Web 应用',
    icon: '⚛️',
    category: 'fullstack',
    defaults: {
      allowDynamicAgents: true,
      teamAgentIds: [],
      checkpointPolicy: 'auto-before-modify',
      timedIntervalMinutes: 20,
      maxCheckpoints: 60,
      commandPolicy: 'auto-approve-safe',
      commandExecutionEnabled: true,
      safeCommandWhitelist: ['npm', 'node', 'npx', 'pnpm', 'yarn', 'git', 'ls', 'dir', 'cat', 'echo', 'next', 'tsc'],
      commandBlacklist: ['rm -rf /', 'format', 'shutdown', 'mkfs'],
      contextConfig: frontendContextConfig,
      knowledgeBaseIds: [],
      mcpServerIds: [],
      autoApproval: DEFAULT_AUTO_APPROVAL_CONFIG,
    },
    tips: [
      'AI 可自动识别 app/ 或 pages/ 路由结构',
      'next dev / next build 已加入安全白名单',
      '建议将 .env.local 加入 .gitignore',
    ],
  },
  {
    id: 'python',
    name: 'Python 项目',
    description: '适用于 Python 后端、数据分析或机器学习项目',
    icon: '🐍',
    category: 'backend',
    defaults: {
      allowDynamicAgents: true,
      teamAgentIds: [],
      checkpointPolicy: 'auto-before-modify',
      timedIntervalMinutes: 30,
      maxCheckpoints: 50,
      commandPolicy: 'auto-approve-safe',
      commandExecutionEnabled: true,
      safeCommandWhitelist: ['python', 'python3', 'pip', 'pip3', 'pytest', 'git', 'ls', 'dir', 'cat', 'echo', 'conda', 'uv'],
      commandBlacklist: ['rm -rf /', 'format', 'shutdown', 'mkfs', 'sudo'],
      contextConfig: backendContextConfig,
      knowledgeBaseIds: [],
      mcpServerIds: [],
      autoApproval: DEFAULT_AUTO_APPROVAL_CONFIG,
    },
    tips: [
      '检测到 requirements.txt 后，AI 可自动分析依赖',
      '建议使用虚拟环境 (venv / conda)',
      'pytest 已加入安全白名单，方便运行测试',
    ],
  },
  {
    id: 'react-vite',
    name: 'React + Vite',
    description: '适用于 React SPA 前端项目（Vite 构建）',
    icon: '⚡',
    category: 'frontend',
    defaults: {
      allowDynamicAgents: true,
      teamAgentIds: [],
      checkpointPolicy: 'auto-before-modify',
      timedIntervalMinutes: 20,
      maxCheckpoints: 40,
      commandPolicy: 'auto-approve-safe',
      commandExecutionEnabled: true,
      safeCommandWhitelist: ['npm', 'node', 'npx', 'pnpm', 'yarn', 'git', 'ls', 'dir', 'cat', 'echo', 'vite', 'tsc', 'eslint'],
      commandBlacklist: ['rm -rf /', 'format', 'shutdown', 'mkfs'],
      contextConfig: frontendContextConfig,
      knowledgeBaseIds: [],
      mcpServerIds: [],
      autoApproval: DEFAULT_AUTO_APPROVAL_CONFIG,
    },
    tips: [
      'vite dev / vite build 已加入安全白名单',
      'AI 可自动识别 src/ 下的组件结构',
      '建议配置 ESLint 和 Prettier 保持代码风格一致',
    ],
  },
  {
    id: 'general',
    name: '通用项目',
    description: '最小配置，适用于任何类型的项目',
    icon: '📁',
    category: 'general',
    defaults: {
      allowDynamicAgents: true,
      teamAgentIds: [],
      checkpointPolicy: 'auto-before-modify',
      timedIntervalMinutes: 30,
      maxCheckpoints: 50,
      commandPolicy: 'auto-approve-safe',
      commandExecutionEnabled: true,
      safeCommandWhitelist: ['git', 'ls', 'dir', 'cat', 'echo'],
      commandBlacklist: ['rm -rf /', 'format', 'shutdown', 'mkfs'],
      contextConfig: DEFAULT_CONTEXT_CONFIG,
      knowledgeBaseIds: [],
      mcpServerIds: [],
      autoApproval: DEFAULT_AUTO_APPROVAL_CONFIG,
    },
    tips: [
      '默认仅允许 git 和基础文件操作命令',
      '可在工作区设置中调整命令白名单',
      '建议根据项目类型添加对应的构建和测试命令',
    ],
  },
]

/**
 * 根据模板 ID 获取模板
 */
export function getTemplateById(id: string): WorkspaceTemplate | undefined {
  return WORKSPACE_TEMPLATES.find((t) => t.id === id)
}

/**
 * 按分类获取模板
 */
export function getTemplatesByCategory(category: WorkspaceTemplate['category']): WorkspaceTemplate[] {
  return WORKSPACE_TEMPLATES.filter((t) => t.category === category)
}
