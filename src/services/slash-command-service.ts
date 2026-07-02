/**
 * Slash 命令服务（参考 ROO CODE Slash Commands）
 *
 * 提供工作区快捷指令系统，支持：
 * - 内置命令（/init, /checkpoint, /restore 等）
 * - 工作区自定义命令（.ai-workspace-vcs/commands/*.md）
 * - 命令面板搜索与过滤
 */

import { workspaceVCSService } from './workspace-vcs-service'

/** Slash 命令定义 */
export interface SlashCommand {
  /** 命令名称（不含 / 前缀） */
  name: string
  /** 命令描述 */
  description: string
  /** 命令类别 */
  category: 'workspace' | 'agent' | 'context' | 'custom'
  /** 命令图标 emoji */
  icon?: string
  /** 命令快捷键提示 */
  shortcut?: string
  /** 是否仅在工作区模式下可用 */
  workspaceOnly?: boolean
  /** 命令执行后生成的消息文本（模板，可含变量） */
  template?: string
  /** 自定义命令的 frontmatter 原始数据 */
  frontmatter?: Record<string, unknown>
}

/** 内置 Slash 命令列表 */
const BUILTIN_COMMANDS: SlashCommand[] = [
  {
    name: 'init',
    description: '初始化项目分析，Leader 将生成项目规划',
    category: 'workspace',
    icon: '🚀',
    workspaceOnly: true,
    template: '请分析当前项目结构，生成项目初始化规划和开发建议。',
  },
  {
    name: 'checkpoint',
    description: '手动创建存档点',
    category: 'workspace',
    icon: '📌',
    workspaceOnly: true,
    template: '/checkpoint',
  },
  {
    name: 'restore',
    description: '还原到指定存档点',
    category: 'workspace',
    icon: '↩️',
    workspaceOnly: true,
    template: '/restore',
  },
  {
    name: 'agents',
    description: '查看和管理团队 Agent',
    category: 'agent',
    icon: '👥',
    workspaceOnly: true,
    template: '/agents',
  },
  {
    name: 'newtask',
    description: '以隔离上下文启动新任务（Boomerang 模式）',
    category: 'agent',
    icon: '🔄',
    workspaceOnly: true,
    template: '/newtask',
  },
  {
    name: 'clear',
    description: '清空当前对话上下文（保留存档）',
    category: 'context',
    icon: '🗑️',
    template: '/clear',
  },
  {
    name: 'compact',
    description: '手动触发上下文压缩',
    category: 'context',
    icon: '📦',
    workspaceOnly: true,
    template: '/compact',
  },
  {
    name: 'approve',
    description: '打开自动审批设置',
    category: 'workspace',
    icon: '🛡️',
    workspaceOnly: true,
    template: '/approve',
  },
  {
    name: 'status',
    description: '查看工作区状态（Agent、工具、审批）',
    category: 'workspace',
    icon: '📊',
    workspaceOnly: true,
    template: '请汇报当前工作区状态，包括活跃 Agent、已启用工具、审批策略等。',
  },
  {
    name: 'review',
    description: '代码审查：分析最近修改的文件',
    category: 'workspace',
    icon: '🔍',
    workspaceOnly: true,
    template: '请对最近修改的代码文件进行审查，指出潜在问题和改进建议。',
  },
  {
    name: 'test',
    description: '为当前文件生成或运行测试',
    category: 'workspace',
    icon: '🧪',
    workspaceOnly: true,
    template: '请为当前相关文件生成或运行单元测试。',
  },
  {
    name: 'explain',
    description: '解释选中的代码或文件',
    category: 'context',
    icon: '💡',
    template: '请解释以下代码的工作原理：',
  },
]

/** 命令缓存 */
let customCommandsCache: SlashCommand[] | null = null
let lastWorkspacePath: string | null = null

/**
 * 获取所有可用命令（内置 + 自定义）
 */
export async function getSlashCommands(workspacePath?: string): Promise<SlashCommand[]> {
  const commands = [...BUILTIN_COMMANDS]

  // 加载工作区自定义命令
  if (workspacePath && workspacePath !== lastWorkspacePath) {
    customCommandsCache = null
    lastWorkspacePath = workspacePath
  }

  if (workspacePath && !customCommandsCache) {
    try {
      customCommandsCache = await loadCustomCommands(workspacePath)
    } catch (err) {
      console.warn('[SlashCommand] 加载自定义命令失败:', err)
      customCommandsCache = []
    }
  }

  if (customCommandsCache) {
    commands.push(...customCommandsCache)
  }

  return commands
}

/**
 * 搜索匹配的命令
 */
export async function searchSlashCommands(
  query: string,
  workspacePath?: string,
  isWorkspaceMode?: boolean,
): Promise<SlashCommand[]> {
  const allCommands = await getSlashCommands(workspacePath)
  const q = query.toLowerCase().replace(/^\//, '')

  return allCommands.filter((cmd) => {
    // 工作区模式下过滤非工作区命令
    if (isWorkspaceMode === false && cmd.workspaceOnly) return false

    if (!q) return true

    return (
      cmd.name.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q) ||
      cmd.category.includes(q)
    )
  })
}

/**
 * 解析 Slash 命令，返回对应的消息文本
 */
export async function resolveSlashCommand(
  input: string,
  workspacePath?: string,
): Promise<{ command?: SlashCommand; message: string }> {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) {
    return { message: trimmed }
  }

  // 提取命令名称和参数
  const parts = trimmed.slice(1).split(/\s+/)
  const cmdName = parts[0]?.toLowerCase() ?? ''
  const args = parts.slice(1)

  const commands = await getSlashCommands(workspacePath)
  const command = commands.find((c) => c.name.toLowerCase() === cmdName)

  if (!command) {
    // 未匹配到命令，原样发送
    return { message: trimmed }
  }

  // 使用模板或命令名称
  let message = command.template ?? `/${command.name}`

  // 替换参数占位符（简单实现：{args} 替换为实际参数）
  if (args.length > 0) {
    message = message.replace(/\{args\}/g, args.join(' '))
  }

  return { command, message }
}

/**
 * 从工作区加载自定义命令
 * 自定义命令存储在 .ai-workspace-vcs/commands/ 目录下
 * 每个命令是一个 Markdown 文件，带有 YAML frontmatter
 */
async function loadCustomCommands(workspacePath: string): Promise<SlashCommand[]> {
  const commands: SlashCommand[] = []

  try {
    // 尝试读取命令目录
    const commandsDir = `${workspacePath}/.ai-workspace-vcs/commands`
    const dirResult = await window.electronAPI.workspace.fs.readDir(commandsDir)

    if (!dirResult.success || !Array.isArray(dirResult.entries)) return commands

    for (const entry of dirResult.entries) {
      if (!entry.name.endsWith('.md')) continue

      try {
        const filePath = `${commandsDir}/${entry.name}`
        const fileResult = await window.electronAPI.workspace.fs.readFile(filePath)
        if (!fileResult.success || !fileResult.content) continue
        const parsed = parseCommandFile(fileResult.content, entry.name.replace('.md', ''))
        if (parsed) commands.push(parsed)
      } catch (err) {
        console.warn(`[SlashCommand] 解析命令文件失败: ${entry.name}`, err)
      }
    }
  } catch {
    // 命令目录不存在，忽略
  }

  return commands
}

/**
 * 解析命令文件（Markdown + YAML frontmatter）
 *
 * 格式示例：
 * ```
 * ---
 * name: my-command
 * description: 我的自定义命令
 * icon: 🎯
 * category: workspace
 * ---
 * 请执行以下操作：{args}
 * ```
 */
function parseCommandFile(content: string, fallbackName: string): SlashCommand | null {
  // 提取 frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return null

  const frontmatterStr = frontmatterMatch[1]
  const body = content.slice(frontmatterMatch[0].length).trim()

  // 简单解析 YAML frontmatter
  const frontmatter: Record<string, string> = {}
  for (const line of frontmatterStr.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '')
    frontmatter[key] = value
  }

  const name = frontmatter.name || fallbackName
  const description = frontmatter.description || `自定义命令: ${name}`
  const category = (frontmatter.category as SlashCommand['category']) || 'custom'
  const icon = frontmatter.icon || '⚙️'

  return {
    name,
    description,
    category,
    icon,
    template: body || `/${name}`,
    frontmatter,
  }
}

/**
 * 获取命令分类标签
 */
export function getCategoryLabel(category: SlashCommand['category']): string {
  const labels: Record<string, string> = {
    workspace: '工作区',
    agent: 'Agent',
    context: '上下文',
    custom: '自定义',
  }
  return labels[category] || category
}
